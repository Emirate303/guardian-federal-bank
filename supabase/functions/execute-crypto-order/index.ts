import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const assets = {
  bitcoin: { symbol: "BTC", name: "Bitcoin" },
  ethereum: { symbol: "ETH", name: "Ethereum" },
  solana: { symbol: "SOL", name: "Solana" },
  ripple: { symbol: "XRP", name: "XRP" },
  binancecoin: { symbol: "BNB", name: "BNB" },
  "usd-coin": { symbol: "USDC", name: "USDC" },
  dogecoin: { symbol: "DOGE", name: "Dogecoin" },
  cardano: { symbol: "ADA", name: "Cardano" },
  "avalanche-2": { symbol: "AVAX", name: "Avalanche" },
  chainlink: { symbol: "LINK", name: "Chainlink" },
} as const;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response({ error: "Authentication is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Crypto order execution is missing Supabase environment configuration.");
    return response({ error: "Order execution is temporarily unavailable." }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: "The order request must contain valid JSON." }, 400);
  }

  if (!isRecord(body)) return response({ error: "The order request is invalid." }, 400);
  const { order_reference, asset_id, side, quantity, expected_total } = body;
  if (
    typeof order_reference !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(order_reference) ||
    typeof asset_id !== "string" ||
    !Object.hasOwn(assets, asset_id) ||
    (side !== "buy" && side !== "sell") ||
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > 1_000_000 ||
    typeof expected_total !== "number" ||
    !Number.isFinite(expected_total) ||
    expected_total <= 0
  ) {
    return response({ error: "The order details are invalid." }, 400);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData.user) {
    return response({ error: "Your session is invalid or has expired." }, 401);
  }

  const orderQuantity = Number(quantity.toFixed(12));
  if (orderQuantity <= 0) {
    return response({ error: "The order amount is below the supported precision." }, 400);
  }

  let quoteResponse: Response;
  try {
    const quoteUrl = new URL(
      "https://api.coingecko.com/api/v3/coins/markets",
    );
    quoteUrl.search = new URLSearchParams({
      vs_currency: "usd",
      ids: asset_id,
      price_change_percentage: "24h",
    }).toString();
    quoteResponse = await fetch(quoteUrl, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    console.error("Unable to retrieve the current crypto market quote.", error);
    return response({ error: "The latest market quote is unavailable. Please try again." }, 503);
  }

  if (!quoteResponse.ok) {
    console.error("Crypto quote provider returned HTTP", quoteResponse.status);
    return response({ error: "The latest market quote is unavailable. Please try again." }, 503);
  }

  let quotePayload: unknown;
  try {
    quotePayload = await quoteResponse.json();
  } catch (error) {
    console.error("Crypto quote provider returned invalid JSON.", error);
    return response({ error: "The latest market quote is invalid. Please try again." }, 503);
  }
  if (!Array.isArray(quotePayload)) {
    return response({ error: "The latest market quote is invalid. Please try again." }, 503);
  }

  const quote = quotePayload.find(
    (item: unknown) => isRecord(item) && item.id === asset_id,
  );
  const price =
    isRecord(quote) && typeof quote.current_price === "number"
      ? quote.current_price
      : Number.NaN;
  const quoteUpdatedAt =
    isRecord(quote) && typeof quote.last_updated === "string"
      ? quote.last_updated
      : "";
  const quoteTimestamp = Date.parse(quoteUpdatedAt);
  const quoteAge = Date.now() - quoteTimestamp;
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(quoteTimestamp) ||
    quoteAge < -60_000 ||
    quoteAge > 5 * 60_000
  ) {
    return response({ error: "A recent market quote is not available for this asset." }, 503);
  }

  const asset = assets[asset_id as keyof typeof assets];
  const executionPrice = Number(price.toFixed(8));
  const gross = roundMoney(orderQuantity * executionPrice);
  const fee = roundMoney(gross * 0.005);
  const settlement = side === "buy" ? gross + fee : gross - fee;
  if (!Number.isFinite(settlement) || settlement <= 0) {
    return response({ error: "The order value is below the supported minimum." }, 400);
  }

  if (roundMoney(expected_total) !== settlement) {
    return response({
      status: "quote_changed",
      unit_price_usd: executionPrice,
      gross_usd: gross,
      fee_usd: fee,
      settlement_usd: settlement,
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await adminClient.rpc(
    "submit_crypto_order",
    {
      p_user_id: userData.user.id,
      p_order_reference: order_reference,
      p_asset_id: asset_id,
      p_symbol: asset.symbol,
      p_asset_name: asset.name,
      p_side: side,
      p_quantity: orderQuantity,
      p_unit_price_usd: executionPrice,
      p_quote_updated_at: new Date(quoteTimestamp).toISOString(),
    },
  );

  if (orderError) {
    console.error("The database could not settle the crypto order.", orderError);
    return response({ error: orderError.message }, 400);
  }

  return response({ status: "completed", order });
});
