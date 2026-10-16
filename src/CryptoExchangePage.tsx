import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUpRight,
  ArrowUpDown,
  BarChart3,
  Check,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { usePopup } from "./components/usePopup";
import "./CryptoExchange.css";

type Side = "buy" | "sell";
type AmountMode = "crypto" | "usd";
type MarketAsset = {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
  last_updated: string | null;
  sparkline_in_7d?: { price?: number[] };
};
type CryptoOrder = {
  id: string;
  order_reference: string;
  symbol: string;
  asset_name: string;
  side: Side;
  quantity: number | string;
  unit_price_usd: number | string;
  fee_usd: number | string;
  gross_usd: number | string;
  settlement_usd: number | string;
  balance_after: number | string;
  status: "completed";
  created_at: string;
};
export type CompletedCryptoOrder = Pick<
  CryptoOrder,
  | "order_reference"
  | "symbol"
  | "asset_name"
  | "side"
  | "gross_usd"
  | "fee_usd"
  | "settlement_usd"
  | "balance_after"
  | "created_at"
>;
type Holding = {
  symbol: string;
  name: string;
  quantity: number;
  costBasis: number;
  realizedPnl: number;
};
type PendingOrder = {
  reference: string;
  assetId: string;
  symbol: string;
  name: string;
  side: Side;
  quantity: number;
  price: number;
};

const supportedAssets = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin" },
  { id: "ethereum", symbol: "eth", name: "Ethereum" },
  { id: "solana", symbol: "sol", name: "Solana" },
  { id: "ripple", symbol: "xrp", name: "XRP" },
  { id: "binancecoin", symbol: "bnb", name: "BNB" },
  { id: "usd-coin", symbol: "usdc", name: "USDC" },
  { id: "dogecoin", symbol: "doge", name: "Dogecoin" },
  { id: "cardano", symbol: "ada", name: "Cardano" },
  { id: "avalanche-2", symbol: "avax", name: "Avalanche" },
  { id: "chainlink", symbol: "link", name: "Chainlink" },
] as const;

const feeRate = 0.005;
const marketUrl =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(value);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function marketNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readMarketAssets(value: unknown): MarketAsset[] {
  if (!Array.isArray(value)) {
    throw new Error("The market-data provider returned an unexpected response.");
  }

  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const asset = item as Record<string, unknown>;
    const nullableNumber = (field: unknown) =>
      field === null || marketNumber(field);
    if (
      typeof asset.id !== "string" ||
      typeof asset.symbol !== "string" ||
      typeof asset.name !== "string" ||
      !marketNumber(asset.current_price) ||
      asset.current_price <= 0 ||
      !nullableNumber(asset.price_change_percentage_24h) ||
      !nullableNumber(asset.market_cap) ||
      !nullableNumber(asset.total_volume) ||
      !nullableNumber(asset.high_24h) ||
      !nullableNumber(asset.low_24h) ||
      !(asset.last_updated === null || typeof asset.last_updated === "string")
    ) {
      return [];
    }

    const sparkline =
      asset.sparkline_in_7d &&
      typeof asset.sparkline_in_7d === "object" &&
      "price" in asset.sparkline_in_7d &&
      Array.isArray(asset.sparkline_in_7d.price)
        ? asset.sparkline_in_7d.price.filter(marketNumber)
        : undefined;

    return [{
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      current_price: asset.current_price,
      price_change_percentage_24h: asset.price_change_percentage_24h,
      market_cap: asset.market_cap,
      total_volume: asset.total_volume,
      high_24h: asset.high_24h,
      low_24h: asset.low_24h,
      last_updated: asset.last_updated,
      ...(sparkline ? { sparkline_in_7d: { price: sparkline } } : {}),
    }];
  });
}

function readOrders(value: unknown): CryptoOrder[] {
  if (!Array.isArray(value)) {
    throw new Error("Your order history returned an invalid response.");
  }
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") {
      throw new Error("An order record is invalid.");
    }
    const order = item as Record<string, unknown>;
    const numericFields = [
      order.quantity,
      order.unit_price_usd,
      order.fee_usd,
      order.gross_usd,
      order.settlement_usd,
      order.balance_after,
    ];
    if (
      typeof order.id !== "string" ||
      typeof order.order_reference !== "string" ||
      typeof order.symbol !== "string" ||
      typeof order.asset_name !== "string" ||
      (order.side !== "buy" && order.side !== "sell") ||
      order.status !== "completed" ||
      typeof order.created_at !== "string" ||
      !Number.isFinite(Date.parse(order.created_at)) ||
      numericFields.some(
        (field) =>
          (typeof field !== "number" && typeof field !== "string") ||
          !Number.isFinite(Number(field)),
      )
    ) {
      throw new Error("An order record contains invalid fields.");
    }
    return {
      id: order.id,
      order_reference: order.order_reference,
      symbol: order.symbol,
      asset_name: order.asset_name,
      side: order.side,
      quantity: order.quantity as number | string,
      unit_price_usd: order.unit_price_usd as number | string,
      fee_usd: order.fee_usd as number | string,
      gross_usd: order.gross_usd as number | string,
      settlement_usd: order.settlement_usd as number | string,
      balance_after: order.balance_after as number | string,
      status: "completed",
      created_at: order.created_at,
    };
  });
}

function buildHoldings(orders: CryptoOrder[]): Holding[] {
  const balances = new Map<string, Holding>();

  for (const order of [...orders].reverse()) {
    const quantity = Number(order.quantity);
    const fee = Number(order.fee_usd);
    const gross = Number(order.gross_usd);
    const holding = balances.get(order.symbol) ?? {
      symbol: order.symbol,
      name: order.asset_name,
      quantity: 0,
      costBasis: 0,
      realizedPnl: 0,
    };

    if (order.side === "buy") {
      holding.quantity += quantity;
      holding.costBasis += gross + fee;
    } else if (holding.quantity > 0) {
      const averageCost = holding.costBasis / holding.quantity;
      const soldQuantity = Math.min(quantity, holding.quantity);
      holding.realizedPnl += gross - fee - averageCost * soldQuantity;
      holding.costBasis -= averageCost * soldQuantity;
      holding.quantity -= soldQuantity;
    }
    balances.set(order.symbol, holding);
  }

  return [...balances.values()].filter((holding) => holding.quantity > 1e-10);
}

function Sparkline({ asset }: { asset: MarketAsset | null }) {
  const points = asset?.sparkline_in_7d?.price?.filter(marketNumber) ?? [];
  if (points.length < 2) {
    return (
      <div className="crypto-chart-empty">
        A 7-day chart is not available for this asset right now.
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coordinates = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 600;
      const y = 146 - ((point - min) / range) * 126;
      return `${x},${y}`;
    })
    .join(" ");
  const rising = points[points.length - 1]! >= points[0]!;

  return (
    <svg
      className={`crypto-sparkline ${rising ? "is-up" : "is-down"}`}
      viewBox="0 0 600 160"
      role="img"
      aria-label={`${asset?.name} price chart for the last 7 days`}
      preserveAspectRatio="none"
    >
      <polyline points={coordinates} />
    </svg>
  );
}

export default function CryptoExchangePage({
  userId,
  bankBalance,
  bankBalanceLoading,
  accountBalance,
  accountCurrency,
  onOrderCompleted,
}: {
  userId: string;
  bankBalance: string | null;
  bankBalanceLoading: boolean;
  accountBalance: number | null;
  accountCurrency: string;
  onOrderCompleted: (order: CompletedCryptoOrder) => void;
}) {
  const [market, setMarket] = useState<MarketAsset[]>([]);
  const [marketError, setMarketError] = useState("");
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState("");
  const [selectedId, setSelectedId] = useState<string>("bitcoin");
  const [marketSearch, setMarketSearch] = useState("");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistError, setWatchlistError] = useState("");
  const [orders, setOrders] = useState<CryptoOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [side, setSide] = useState<Side>("buy");
  const [amountMode, setAmountMode] = useState<AmountMode>("crypto");
  const [quantityInput, setQuantityInput] = useState("0.01");
  const [amountError, setAmountError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const { requestConfirmation, showLoading, showSuccess, showError } = usePopup();
  const usdAccount = accountCurrency.toUpperCase() === "USD";

  const fetchMarket = useCallback(async (signal?: AbortSignal) => {
    setMarketLoading(true);
    setMarketError("");
    try {
      const response = await fetch(marketUrl, { signal });
      if (!response.ok) {
        throw new Error(`Market data is temporarily unavailable (HTTP ${response.status}).`);
      }
      const data = readMarketAssets(await response.json());
      const filtered = supportedAssets
        .map((supported) =>
          data.find((asset) => asset.id === supported.id),
        )
        .filter((asset): asset is MarketAsset => asset !== undefined);
      if (filtered.length === 0) {
        throw new Error("The market-data provider did not return supported assets.");
      }
      setMarket(filtered);
      setMarketUpdatedAt(new Date().toISOString());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMarket([]);
      setMarketUpdatedAt("");
      setMarketError(
        error instanceof Error
          ? error.message
          : "Market data could not be loaded. Please try again.",
      );
    } finally {
      if (!signal?.aborted) setMarketLoading(false);
    }
  }, []);

  const loadPrivateData = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError("");
    setWatchlistError("");
    const watchlistRequest = supabase.rpc("get_crypto_watchlist");
    const allOrders: CryptoOrder[] = [];
    try {
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("crypto_orders")
          .select(
            "id, order_reference, symbol, asset_name, side, quantity, unit_price_usd, fee_usd, gross_usd, settlement_usd, balance_after, status, created_at",
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 499);
        if (error) throw error;
        const page = readOrders(data ?? []);
        allOrders.push(...page);
        if (page.length < 500) break;
      }
      setOrders(allOrders);
    } catch (error) {
      console.error("Unable to load the complete crypto order ledger.", error);
      setOrders([]);
      setOrdersError(
        "Your order history could not be loaded. Check that the Crypto Exchange database migrations have been applied.",
      );
    }

    const { data: watchlistData, error: watchlistErrorResult } =
      await watchlistRequest;
    if (watchlistErrorResult) {
      console.error("Unable to load the crypto watchlist.", watchlistErrorResult);
      setWatchlist([]);
      setWatchlistError(
        "Your watchlist could not be loaded. Check that the Crypto Exchange database migration has been applied.",
      );
    } else {
      const symbols: unknown = watchlistData;
      if (
        Array.isArray(symbols) &&
        symbols.every((symbol) => typeof symbol === "string")
      ) {
        setWatchlist(symbols);
      } else {
        setWatchlistError("Your watchlist returned invalid data.");
      }
    }
    setOrdersLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialFetch = window.setTimeout(
      () => void fetchMarket(controller.signal),
      0,
    );
    const timer = window.setInterval(() => void fetchMarket(), 60_000);
    return () => {
      controller.abort();
      window.clearTimeout(initialFetch);
      window.clearInterval(timer);
    };
  }, [fetchMarket]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPrivateData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPrivateData, userId]);

  const selectedAsset =
    market.find((asset) => asset.id === selectedId) ?? market[0] ?? null;
  const supportedMarket = useMemo(
    () =>
      market.filter((asset) => {
        const query = marketSearch.trim().toLowerCase();
        const isWatchlisted = watchlist.includes(asset.symbol.toUpperCase());
        const matchesSearch =
          !query ||
          asset.name.toLowerCase().includes(query) ||
          asset.symbol.toLowerCase().includes(query);
        return (!watchlistOnly || isWatchlisted) && matchesSearch;
      }),
    [market, marketSearch, watchlist, watchlistOnly],
  );
  const holdings = useMemo(() => buildHoldings(orders), [orders]);
  const history = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return orders.filter(
      (order) =>
        !query ||
        order.asset_name.toLowerCase().includes(query) ||
        order.symbol.toLowerCase().includes(query) ||
        order.side.includes(query) ||
        order.order_reference.toLowerCase().includes(query),
    );
  }, [orders, historySearch]);
  const displayedHistory = history.slice(0, 500);
  const marketBySymbol = useMemo(
    () => new Map(market.map((asset) => [asset.symbol.toUpperCase(), asset])),
    [market],
  );
  const enteredQuantity = Number(quantityInput);
  const quantity = Number.isFinite(enteredQuantity)
    ? Number(enteredQuantity.toFixed(12))
    : Number.NaN;
  const quotePrice = selectedAsset
    ? Number(selectedAsset.current_price.toFixed(8))
    : 0;
  const fiatValue = selectedAsset ? quantity * quotePrice : 0;
  const orderGross = roundMoney(fiatValue);
  const fee = roundMoney(orderGross * feeRate);
  const estimatedTotal = side === "buy" ? orderGross + fee : orderGross - fee;
  const validAmount =
    Number.isFinite(quantity) &&
    quantity > 0 &&
    quantity <= 1_000_000 &&
    fiatValue <= 10_000_000 &&
    orderGross > 0;
  const availableQuantity =
    holdings.find((holding) => holding.symbol === selectedAsset?.symbol.toUpperCase())
      ?.quantity ?? 0;
  const sellQuantityAvailable =
    side !== "sell" || quantity <= availableQuantity + 1e-10;
  const buyBalanceAvailable =
    side !== "buy" ||
    (accountBalance !== null && estimatedTotal <= accountBalance);
  const portfolioValue = holdings.reduce((total, holding) => {
    const price = marketBySymbol.get(holding.symbol)?.current_price;
    return total + (price === undefined ? 0 : holding.quantity * price);
  }, 0);
  const averageChange =
    market.length > 0
      ? market.reduce(
          (total, asset) => total + (asset.price_change_percentage_24h ?? 0),
          0,
        ) / market.length
      : null;
  const updatedAt = marketUpdatedAt
    ? new Date(marketUpdatedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "";
  const pendingGross = pendingOrder
      ? roundMoney(pendingOrder.quantity * pendingOrder.price)
      : 0;
  const pendingFee = roundMoney(pendingGross * feeRate);
  const pendingTotal = pendingOrder
      ? pendingOrder.side === "buy"
        ? pendingGross + pendingFee
        : pendingGross - pendingFee
      : 0;

  function validateAmount() {
    if (!validAmount) {
      setAmountError("Enter a positive amount within the order limits.");
      return false;
    }
    if (!usdAccount) {
      setAmountError("Crypto orders currently require a USD-denominated account.");
      return false;
    }
    if (!sellQuantityAvailable) {
      setAmountError("Your crypto portfolio does not have enough units for this sell order.");
      return false;
    }
    if (!buyBalanceAvailable) {
      setAmountError("Your available account balance is too low for this order.");
      return false;
    }
    setAmountError("");
    return true;
  }

  function updateAmount(value: string) {
    setQuantityInput(
      amountMode === "crypto"
        ? value
        : quotePrice
          ? String(Number(value) / quotePrice)
          : "",
    );
    setAmountError("");
    setOrderError("");
  }

  async function toggleWatchlist(symbol: string) {
    if (watchlistBusy) return;
    setWatchlistBusy(true);
    setWatchlistError("");
    const { data, error } = await supabase.rpc("toggle_crypto_watchlist", {
      p_symbol: symbol,
    });
    if (error || typeof data !== "boolean") {
      console.error("Unable to update the crypto watchlist.", error);
      setWatchlistError(
        error?.message ??
          "The watchlist could not be updated. Please refresh and try again.",
      );
    } else {
      setWatchlist((current) =>
        data ? [...new Set([...current, symbol])] : current.filter((item) => item !== symbol),
      );
    }
    setWatchlistBusy(false);
  }

  async function submitOrder() {
    if (!pendingOrder) return;
    const assetName = pendingOrder.name;
    const sideLabel = pendingOrder.side === "buy" ? "Buy" : "Sell";
    const confirmed = await requestConfirmation({
      variant: "confirm",
      title: `Confirm ${sideLabel.toLowerCase()} order`,
      message: "Review the estimated order details below before confirming. Market prices refresh at execution and you will be asked to reconfirm if the total changes.",
      details: [
        { label: "Order", value: `${sideLabel} ${assetName} (${pendingOrder.symbol.toUpperCase()})` },
        { label: "Quantity", value: `${formatQuantity(pendingOrder.quantity)} ${pendingOrder.symbol.toUpperCase()}` },
        { label: "Estimated price", value: formatUsd(pendingOrder.price) },
        { label: "Estimated fee", value: formatUsd(pendingFee) },
        { label: pendingOrder.side === "buy" ? "Estimated debit" : "Estimated credit", value: formatUsd(pendingTotal) },
        { label: "Reference", value: pendingOrder.reference.slice(0, 8).toUpperCase() },
      ],
      confirmLabel: `Confirm ${sideLabel.toLowerCase()} order`,
    });
    if (!confirmed) return;

    setSubmitting(true);
    setOrderError("");
    setOrderSuccess("");
    const closeLoading = showLoading({
      title: `Executing ${sideLabel.toLowerCase()} order`,
      message: "Your order is being settled against your account. Please wait.",
      details: [
        { label: "Order", value: `${sideLabel} ${assetName} (${pendingOrder.symbol.toUpperCase()})` },
        { label: "Quantity", value: `${formatQuantity(pendingOrder.quantity)} ${pendingOrder.symbol.toUpperCase()}` },
      ],
    });
    const { data, error } = await supabase.functions.invoke(
      "execute-crypto-order",
      {
        body: {
          order_reference: pendingOrder.reference,
          asset_id: pendingOrder.assetId,
          side: pendingOrder.side,
          quantity: pendingOrder.quantity,
          expected_total: pendingTotal,
        },
      },
    );
    if (error) {
      closeLoading();
      console.error("Unable to execute the crypto order.", error);
      const explanation =
        error.message ||
        "Your order could not be completed. Please try again.";
      setOrderError(explanation);
      showError({
        title: "Order not completed",
        message: explanation,
      });
    } else {
      try {
        if (
          !data ||
          typeof data !== "object" ||
          !("status" in data)
        ) {
          throw new Error("The order service returned an invalid response.");
        }
        if (data.status === "quote_changed") {
          closeLoading();
          if (
            !("unit_price_usd" in data) ||
            !marketNumber(data.unit_price_usd) ||
            data.unit_price_usd <= 0
          ) {
            throw new Error("The order service returned an invalid updated quote.");
          }
          setPendingOrder({ ...pendingOrder, price: data.unit_price_usd });
          setOrderError(
            pendingOrder.side === "buy" &&
              accountBalance !== null &&
              data.status === "quote_changed" &&
              marketNumber(data.settlement_usd) &&
              data.settlement_usd > accountBalance
              ? "The updated price exceeds your available account balance."
              : "The market price changed. Review the updated total and confirm again.",
          );
        } else if (data.status === "completed" && "order" in data) {
          const result = readOrders([data.order])[0];
          if (!result) {
            closeLoading();
            throw new Error("The order service returned an invalid response.");
          }
          onOrderCompleted(result);
          closeLoading();
          setOrderSuccess(
            `${pendingOrder.side === "buy" ? "Buy" : "Sell"} order completed. Reference: ${result.order_reference}. ${pendingOrder.side === "buy" ? `${formatUsd(Number(result.settlement_usd))} was debited from your account.` : `${formatUsd(Number(result.settlement_usd))} was credited to your account.`}`,
          );
          showSuccess({
            title: `${sideLabel} order completed`,
            message: pendingOrder.side === "buy" ? "The purchase was settled from your account." : "The sale was credited to your account.",
            details: [
              { label: "Order", value: `${sideLabel} ${assetName} (${pendingOrder.symbol.toUpperCase()})` },
              { label: "Quantity", value: `${formatQuantity(Number(result.quantity))} ${result.symbol.toUpperCase()}` },
              { label: "Fee", value: formatUsd(Number(result.fee_usd)) },
              { label: pendingOrder.side === "buy" ? "Debited" : "Credited", value: formatUsd(Number(result.settlement_usd)) },
              { label: "Reference", value: result.order_reference },
            ],
          });
          setConfirming(false);
          setPendingOrder(null);
          await loadPrivateData();
        } else {
          closeLoading();
          throw new Error("The order service returned an unknown status.");
        }
      } catch (responseError) {
        closeLoading();
        const explanation =
          responseError instanceof Error
            ? responseError.message
            : "The order service returned an invalid response.";
        console.error("The crypto order response was invalid.", responseError);
        setOrderError(explanation);
        showError({
          title: "Order response invalid",
          message: explanation,
        });
      }
    }
    setSubmitting(false);
  }

  return (
    <section className="crypto-exchange" aria-label="Crypto exchange dashboard">
      <article className="crypto-bank-balance-card">
        <div className="crypto-bank-balance-icon"><Wallet size={18} /></div>
        <div>
          <span>Available account balance</span>
          <strong>
            {bankBalanceLoading
              ? "Loading…"
              : bankBalance ?? "Unavailable"}
          </strong>
        </div>
        <small>Used to settle crypto orders</small>
      </article>

      {orderSuccess && (
        <div className="crypto-message is-success" role="status">
          <Check size={17} />
          <span>{orderSuccess}</span>
          <button
            type="button"
            aria-label="Dismiss order confirmation"
            onClick={() => setOrderSuccess("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="crypto-summary-grid">
        <article className="crypto-summary-card crypto-summary-highlight">
          <div className="crypto-summary-icon"><Wallet size={19} /></div>
          <span>Portfolio value</span>
          <strong>{market.length ? formatUsd(portfolioValue) : "—"}</strong>
          <small>Based on your crypto holdings and current public market prices</small>
        </article>
        <article className="crypto-summary-card">
          <div className="crypto-summary-icon"><BarChart3 size={19} /></div>
          <span>Tracked assets · average 24h</span>
          <strong className={averageChange === null ? "" : averageChange >= 0 ? "positive" : "negative"}>
            {averageChange === null
              ? "—"
              : `${averageChange > 0 ? "+" : ""}${averageChange.toFixed(2)}%`}
          </strong>
          <small>{market.length} supported assets with available quotes</small>
        </article>
        <article className="crypto-summary-card">
          <div className="crypto-summary-icon"><Star size={19} /></div>
          <span>Watchlist</span>
          <strong>{watchlist.length}</strong>
          <small>Saved to your private account</small>
        </article>
        <article className="crypto-summary-card">
          <div className="crypto-summary-icon"><ArrowUpDown size={19} /></div>
          <span>Completed orders</span>
          <strong>{ordersLoading ? "—" : orders.length}</strong>
          <small>Private order history</small>
        </article>
      </div>

      {marketError && (
        <div className="crypto-message is-error" role="alert">
          <span>{marketError} Prices, charts, and new orders are unavailable until quotes load.</span>
          <button type="button" onClick={() => void fetchMarket()} disabled={marketLoading}>
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      )}

      <div className="crypto-dashboard-grid">
        <div className="crypto-market-column">
          <section className="crypto-panel crypto-chart-panel">
            <div className="crypto-panel-heading">
              <div>
                <span className="crypto-eyebrow">MARKET OVERVIEW</span>
                <h2>{selectedAsset?.name ?? "Market overview"}</h2>
              </div>
              <span className="crypto-market-updated">
                {marketLoading ? (
                  <><LoaderCircle size={14} className="crypto-spin" /> Updating</>
                ) : updatedAt ? (
                  <><Clock3 size={14} /> Fetched {updatedAt}</>
                ) : (
                  "Quotes unavailable"
                )}
              </span>
            </div>
            {selectedAsset ? (
              <>
                <div className="crypto-chart-quote">
                  <strong>{formatUsd(selectedAsset.current_price)}</strong>
                  <span className={(selectedAsset.price_change_percentage_24h ?? 0) >= 0 ? "positive" : "negative"}>
                    {(selectedAsset.price_change_percentage_24h ?? 0) >= 0
                      ? <ArrowUpRight size={16} />
                      : <ArrowDownRight size={16} />}
                    {selectedAsset.price_change_percentage_24h === null
                      ? "Change unavailable"
                      : `${Math.abs(selectedAsset.price_change_percentage_24h).toFixed(2)}% (24h)`}
                  </span>
                </div>
                <div className="crypto-chart">
                  <Sparkline asset={selectedAsset} />
                  <div className="crypto-chart-labels"><span>7 days ago</span><span>Now</span></div>
                </div>
                <div className="crypto-market-facts">
                  <div><span>24h high</span><strong>{selectedAsset.high_24h == null ? "—" : formatUsd(selectedAsset.high_24h)}</strong></div>
                  <div><span>24h low</span><strong>{selectedAsset.low_24h == null ? "—" : formatUsd(selectedAsset.low_24h)}</strong></div>
                  <div><span>Market cap</span><strong>{selectedAsset.market_cap == null ? "—" : formatUsd(selectedAsset.market_cap)}</strong></div>
                  <div><span>24h volume</span><strong>{selectedAsset.total_volume == null ? "—" : formatUsd(selectedAsset.total_volume)}</strong></div>
                </div>
              </>
            ) : marketLoading ? (
              <div className="crypto-market-placeholder" role="status">
                <LoaderCircle size={22} className="crypto-spin" /> Loading public market data…
              </div>
            ) : (
              <div className="crypto-market-placeholder">No current market quote is available. Use Retry to check again.</div>
            )}
          </section>

          <section className="crypto-panel crypto-assets-panel">
            <div className="crypto-panel-heading crypto-assets-heading">
              <div><span className="crypto-eyebrow">SUPPORTED MARKETS</span><h2>Explore assets</h2></div>
                <button
                  type="button"
                  className={`crypto-watch-filter ${watchlistOnly ? "active" : ""}`}
                  aria-pressed={watchlistOnly}
                  onClick={() => setWatchlistOnly((current) => !current)}
                >
                  <Star size={14} fill={watchlistOnly ? "currentColor" : "none"} />
                  Watchlist ({watchlist.length})
                </button>
                <label className="crypto-search">
                <Search size={16} />
                <span className="sr-only">Search cryptocurrencies</span>
                <input value={marketSearch} onChange={(event) => setMarketSearch(event.target.value)} placeholder="Search assets" />
              </label>
            </div>
            {watchlistError && <p className="crypto-inline-error" role="alert">{watchlistError}</p>}
            {market.length ? (
              <div className="crypto-table-wrap">
                <table className="crypto-table">
                  <thead><tr><th>Asset</th><th>Price (USD)</th><th>24h</th><th>Market cap</th><th><span className="sr-only">Watchlist</span></th></tr></thead>
                  <tbody>
                    {supportedMarket.map((asset) => {
                      const symbol = asset.symbol.toUpperCase();
                      const isFavorite = watchlist.includes(symbol);
                      const change = asset.price_change_percentage_24h;
                      return (
                        <tr key={asset.id} className={selectedAsset?.id === asset.id ? "is-selected" : ""}>
                          <td>
                            <button type="button" className="crypto-asset-select" onClick={() => setSelectedId(asset.id)}>
                              <span className="crypto-coin-mark">{symbol.slice(0, 3)}</span>
                              <span><strong>{asset.name}</strong><small>{symbol}</small></span>
                            </button>
                          </td>
                          <td className="crypto-table-price">{formatUsd(asset.current_price)}</td>
                          <td><span className={`crypto-change ${(change ?? 0) >= 0 ? "positive" : "negative"}`}>{change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}</span></td>
                          <td>{asset.market_cap == null ? "—" : formatUsd(asset.market_cap)}</td>
                          <td>
                            <button
                              type="button"
                              className={`crypto-watch-button ${isFavorite ? "is-favorite" : ""}`}
                              aria-label={`${isFavorite ? "Remove" : "Add"} ${asset.name} ${isFavorite ? "from" : "to"} watchlist`}
                              title={`${isFavorite ? "Remove from" : "Add to"} watchlist`}
                              disabled={watchlistBusy}
                              onClick={() => void toggleWatchlist(symbol)}
                            ><Star size={17} fill={isFavorite ? "currentColor" : "none"} /></button>
                          </td>
                        </tr>
                      );
                    })}
                    {supportedMarket.length === 0 && <tr><td colSpan={5} className="crypto-empty-row">{watchlistOnly && watchlist.length === 0 ? "Your watchlist is empty. Select a star to save an asset." : watchlistOnly ? "No saved assets match the current quotes and search." : "No supported assets match that search."}</td></tr>}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="crypto-market-placeholder">
                {marketLoading ? "Loading supported assets…" : "Asset prices are hidden until current public market data is available."}
              </div>
            )}
            <p className="crypto-data-note">Public market data provided by CoinGecko. Quotes may be delayed and are for information only, not an executable market price.</p>
          </section>
        </div>

        <aside className="crypto-trade-column">
          <section className="crypto-panel crypto-order-panel">
            <div className="crypto-panel-heading">
              <div><span className="crypto-eyebrow">CRYPTO EXCHANGE</span><h2>Place an order</h2></div>
            </div>
            <div className="crypto-side-tabs" role="tablist" aria-label="Order type">
              {(["buy", "sell"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={side === value}
                  className={side === value ? "active" : ""}
                  disabled={confirming}
                  onClick={() => { setSide(value); setAmountError(""); setOrderError(""); setConfirming(false); setPendingOrder(null); }}
                >{value === "buy" ? <><ArrowDown size={15} /> Buy</> : <><ArrowUpRight size={15} /> Sell</>}</button>
              ))}
            </div>
            <label className="crypto-form-field">
              <span>Cryptocurrency</span>
              <select
                value={selectedAsset?.id ?? ""}
                onChange={(event) => { setSelectedId(event.target.value); setAmountError(""); setConfirming(false); setPendingOrder(null); }}
                disabled={!market.length || confirming}
              >
                {supportedAssets.map((asset) => (
                  <option key={asset.id} value={asset.id} disabled={!market.some((quote) => quote.id === asset.id)}>{asset.name} ({asset.symbol.toUpperCase()}){market.some((quote) => quote.id === asset.id) ? "" : " — quote unavailable"}</option>
                ))}
              </select>
            </label>
            <div className="crypto-amount-label">
              <label htmlFor="crypto-amount">Amount</label>
              <div className="crypto-amount-toggle" aria-label="Amount entry unit">
                <button type="button" disabled={confirming} aria-pressed={amountMode === "crypto"} onClick={() => setAmountMode("crypto")}>{selectedAsset?.symbol.toUpperCase() ?? "Crypto"}</button>
                <button type="button" disabled={confirming} aria-pressed={amountMode === "usd"} onClick={() => setAmountMode("usd")}>USD</button>
              </div>
            </div>
            <label className="crypto-amount-input">
              <span className="sr-only">Order amount in {amountMode === "crypto" ? selectedAsset?.symbol.toUpperCase() ?? "crypto" : "US dollars"}</span>
              <input
                id="crypto-amount"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={amountMode === "crypto" ? quantityInput : fiatValue ? String(fiatValue) : ""}
                onChange={(event) => updateAmount(event.target.value)}
                disabled={!selectedAsset || confirming}
                placeholder={amountMode === "crypto" ? "0.00" : "0.00"}
              />
              <span>{amountMode === "crypto" ? selectedAsset?.symbol.toUpperCase() ?? "CRYPTO" : "USD"}</span>
            </label>
            {amountError && <p className="crypto-inline-error" role="alert">{amountError}</p>}
            <div className="crypto-conversion">
              <span><ArrowDown size={14} /> Estimated conversion</span>
              <strong>{selectedAsset && validAmount ? `${formatQuantity(quantity)} ${selectedAsset.symbol.toUpperCase()}` : "—"} ≈ {selectedAsset && validAmount ? formatUsd(fiatValue) : "—"}</strong>
            </div>
            <div className="crypto-rate-row"><span>Indicative rate</span><strong>{selectedAsset ? `1 ${selectedAsset.symbol.toUpperCase()} = ${formatUsd(selectedAsset.current_price)}` : "Unavailable"}</strong></div>
            {side === "sell" && <div className="crypto-rate-row"><span>Available units</span><strong>{formatQuantity(availableQuantity)} {selectedAsset?.symbol.toUpperCase() ?? ""}</strong></div>}
            <div className="crypto-order-summary">
              <div><span>Estimated order value</span><strong>{validAmount ? formatUsd(orderGross) : "—"}</strong></div>
              <div><span>Trading fee (0.50%)</span><strong>{validAmount ? formatUsd(fee) : "—"}</strong></div>
              <div className="crypto-order-total"><span>{side === "buy" ? "Estimated total" : "Estimated proceeds"}</span><strong>{validAmount ? formatUsd(estimatedTotal) : "—"}</strong></div>
            </div>
            {!usdAccount && <p className="crypto-inline-error" role="status">Orders are priced in USD and currently require a USD-denominated account.</p>}
            <p className="crypto-order-disclaimer">The final price is refreshed before completion and you will be asked to reconfirm if the total changes. Orders are settled in your account and holdings are tracked in this app; external exchange and wallet connections are not available.</p>
            {orderError && <p className="crypto-inline-error" role="alert">{orderError}</p>}
            {!confirming ? (
              <button
                type="button"
                className="crypto-submit-button"
                disabled={!selectedAsset || marketLoading || !validAmount || !sellQuantityAvailable || !buyBalanceAvailable || !usdAccount || bankBalanceLoading || accountBalance === null}
                onClick={() => {
                  if (selectedAsset && validateAmount()) {
                    setPendingOrder({
                      reference: crypto.randomUUID(),
                      assetId: selectedAsset.id,
                      symbol: selectedAsset.symbol.toUpperCase(),
                      name: selectedAsset.name,
                      side,
                      quantity,
                      price: quotePrice,
                    });
                    setConfirming(true);
                    setOrderError("");
                  }
                }}
              >Review {side} order</button>
            ) : (
              <div className="crypto-confirm-panel" role="group" aria-label="Confirm crypto order">
                <strong>Confirm {pendingOrder?.side} order?</strong>
                <p>{pendingOrder ? `${formatQuantity(pendingOrder.quantity)} ${pendingOrder.symbol} for an estimated ${formatUsd(pendingTotal)} ${pendingOrder.side === "buy" ? "debit" : "credit"}.` : ""}</p>
                <div>
                  <button type="button" className="crypto-cancel-button" disabled={submitting} onClick={() => { setConfirming(false); setPendingOrder(null); }}>Cancel</button>
                  <button
                    type="button"
                    className="crypto-submit-button"
                    disabled={
                      submitting ||
                      bankBalanceLoading ||
                      accountBalance === null ||
                      (pendingOrder?.side === "buy" &&
                        pendingTotal > accountBalance)
                    }
                    onClick={() => void submitOrder()}
                  >
                    {submitting ? <><LoaderCircle size={16} className="crypto-spin" /> Executing…</> : "Confirm order"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      <section className="crypto-panel crypto-portfolio-panel">
        <div className="crypto-panel-heading">
          <div><span className="crypto-eyebrow">YOUR PORTFOLIO</span><h2>Crypto holdings</h2></div>
          <span className="crypto-portfolio-total">Quoted value <strong>{market.length ? formatUsd(portfolioValue) : "—"}</strong></span>
        </div>
        {ordersError && <p className="crypto-inline-error" role="alert">{ordersError}</p>}
        {ordersLoading ? (
          <div className="crypto-market-placeholder" role="status"><LoaderCircle size={20} className="crypto-spin" /> Loading your order records…</div>
        ) : holdings.length ? (
          <div className="crypto-table-wrap">
            <table className="crypto-table crypto-holdings-table">
              <thead><tr><th>Asset</th><th>Quantity</th><th>Market value</th><th>Allocation</th><th>Unrealized P/L</th></tr></thead>
              <tbody>{holdings.map((holding) => {
                const quote = marketBySymbol.get(holding.symbol);
                const value = quote ? holding.quantity * quote.current_price : null;
                const pnl = value === null ? null : value - holding.costBasis;
                return <tr key={holding.symbol}>
                  <td><span className="crypto-coin-mark">{holding.symbol.slice(0, 3)}</span><span className="crypto-holding-name"><strong>{holding.name}</strong><small>{holding.symbol}</small></span></td>
                  <td>{formatQuantity(holding.quantity)}</td>
                  <td>{value === null ? <span className="crypto-unavailable">Quote unavailable</span> : formatUsd(value)}</td>
                  <td>{value === null || portfolioValue <= 0 ? "—" : <div className="crypto-allocation"><span>{((value / portfolioValue) * 100).toFixed(1)}%</span><span className="crypto-allocation-track"><span style={{ width: `${(value / portfolioValue) * 100}%` }} /></span></div>}</td>
                  <td className={pnl === null ? "" : pnl >= 0 ? "positive" : "negative"}>{pnl === null ? "—" : `${pnl >= 0 ? "+" : ""}${formatUsd(pnl)}`}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="crypto-empty-state"><Wallet size={25} /><strong>No crypto holdings yet</strong><span>Completed buy orders will appear here in your exchange portfolio.</span></div>
        )}
        {holdings.some((holding) => !marketBySymbol.has(holding.symbol)) && (
          <p className="crypto-data-note">Quoted value and allocation exclude holdings without an available market quote.</p>
        )}
      </section>

      <section className="crypto-panel crypto-history-panel">
        <div className="crypto-panel-heading">
          <div><span className="crypto-eyebrow">PRIVATE ORDER HISTORY</span><h2>Order history</h2></div>
          <label className="crypto-search">
            <Search size={16} />
            <span className="sr-only">Search order history</span>
            <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search orders" />
          </label>
        </div>
        {ordersError && <p className="crypto-inline-error" role="alert">{ordersError}</p>}
        {ordersLoading ? (
          <div className="crypto-market-placeholder" role="status"><LoaderCircle size={20} className="crypto-spin" /> Loading order history…</div>
        ) : history.length ? (
          <div className="crypto-table-wrap">
            <table className="crypto-table">
              <thead><tr><th>Date</th><th>Asset</th><th>Type</th><th>Quantity</th><th>Est. fee</th><th>Order reference</th><th>Status</th></tr></thead>
              <tbody>{displayedHistory.map((order) => <tr key={order.id}>
                <td><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</time></td>
                <td><strong>{order.asset_name}</strong><small className="crypto-cell-subtitle">{order.symbol}</small></td>
                <td><span className={`crypto-order-type ${order.side}`}>{order.side === "buy" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{order.side}</span></td>
                <td>{formatQuantity(Number(order.quantity))}</td>
                <td>{formatUsd(Number(order.fee_usd))}</td>
                <td className="crypto-reference">{order.order_reference}</td>
                <td><span className="crypto-status"><Check size={12} /> Completed</span></td>
              </tr>)}
              {history.length === 0 && <tr><td colSpan={7} className="crypto-empty-row">No orders match your search.</td></tr>}
              </tbody>
            </table>
            {history.length > displayedHistory.length && <p className="crypto-data-note">Showing the first 500 matching orders. Refine your search to find older entries.</p>}
          </div>
        ) : (
          <div className="crypto-empty-state"><ArrowDownRight size={25} /><strong>No orders yet</strong><span>Your completed crypto orders will appear here.</span></div>
        )}
      </section>

      <p className="crypto-footer-note"><ShieldCheck size={15} /> Orders are settled against your account balance and recorded in your crypto portfolio. Market quotes are provided by CoinGecko; this app does not connect to an external exchange or blockchain wallet.</p>
    </section>
  );
}
