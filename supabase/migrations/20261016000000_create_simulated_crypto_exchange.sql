create table public.crypto_watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (
    symbol in ('BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'USDC', 'DOGE', 'ADA', 'AVAX', 'LINK')
  ),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.crypto_watchlist enable row level security;

create policy "Users can read their own crypto watchlist"
  on public.crypto_watchlist
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.crypto_watchlist from anon, authenticated;
grant select on public.crypto_watchlist to authenticated;

create table public.simulated_crypto_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  order_reference text not null,
  asset_id text not null check (
    asset_id in (
      'bitcoin', 'ethereum', 'solana', 'ripple', 'binancecoin',
      'usd-coin', 'dogecoin', 'cardano', 'avalanche-2', 'chainlink'
    )
  ),
  symbol text not null check (
    symbol in ('BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'USDC', 'DOGE', 'ADA', 'AVAX', 'LINK')
  ),
  asset_name text not null check (char_length(asset_name) between 1 and 40),
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(30, 12) not null check (quantity > 0 and quantity <= 1000000),
  unit_price_usd numeric(20, 8) not null check (
    unit_price_usd > 0 and unit_price_usd <= 1000000000
  ),
  gross_usd numeric(20, 2) not null check (gross_usd > 0 and gross_usd <= 10000000),
  fee_usd numeric(20, 2) not null check (fee_usd >= 0),
  status text not null default 'simulated' check (status = 'simulated'),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, order_reference),
  check (
    (asset_id = 'bitcoin' and symbol = 'BTC' and asset_name = 'Bitcoin') or
    (asset_id = 'ethereum' and symbol = 'ETH' and asset_name = 'Ethereum') or
    (asset_id = 'solana' and symbol = 'SOL' and asset_name = 'Solana') or
    (asset_id = 'ripple' and symbol = 'XRP' and asset_name = 'XRP') or
    (asset_id = 'binancecoin' and symbol = 'BNB' and asset_name = 'BNB') or
    (asset_id = 'usd-coin' and symbol = 'USDC' and asset_name = 'USDC') or
    (asset_id = 'dogecoin' and symbol = 'DOGE' and asset_name = 'Dogecoin') or
    (asset_id = 'cardano' and symbol = 'ADA' and asset_name = 'Cardano') or
    (asset_id = 'avalanche-2' and symbol = 'AVAX' and asset_name = 'Avalanche') or
    (asset_id = 'chainlink' and symbol = 'LINK' and asset_name = 'Chainlink')
  )
);

create index simulated_crypto_orders_user_created_idx
  on public.simulated_crypto_orders (user_id, created_at desc);

alter table public.simulated_crypto_orders enable row level security;

create policy "Users can read their own simulated crypto orders"
  on public.simulated_crypto_orders
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.simulated_crypto_orders from anon, authenticated;
grant select on public.simulated_crypto_orders to authenticated;

create or replace function public.get_crypto_watchlist()
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(w.symbol order by w.created_at), '{}'::text[])
  from public.crypto_watchlist as w
  where w.user_id = (select auth.uid());
$$;

create or replace function public.toggle_crypto_watchlist(p_symbol text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_symbol is null
    or p_symbol not in ('BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'USDC', 'DOGE', 'ADA', 'AVAX', 'LINK')
  then
    raise exception 'Unsupported cryptocurrency symbol.';
  end if;

  delete from public.crypto_watchlist
  where user_id = v_user_id and symbol = p_symbol;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    return false;
  end if;

  insert into public.crypto_watchlist (user_id, symbol)
  values (v_user_id, p_symbol);
  return true;
end;
$$;

create or replace function public.submit_simulated_crypto_order(
  p_order_reference uuid,
  p_asset_id text,
  p_symbol text,
  p_asset_name text,
  p_side text,
  p_quantity numeric,
  p_unit_price_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.simulated_crypto_orders%rowtype;
  v_order public.simulated_crypto_orders%rowtype;
  v_quantity numeric(30, 12);
  v_price numeric(20, 8);
  v_gross numeric(20, 2);
  v_fee numeric(20, 2);
  v_held numeric(30, 12);
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_order_reference is null
    or p_asset_id is null
    or p_symbol is null
    or p_asset_name is null
    or p_side is null
    or p_side not in ('buy', 'sell')
    or p_quantity is null
    or p_unit_price_usd is null
    or p_quantity <= 0
    or p_quantity > 1000000
    or p_unit_price_usd <= 0
    or p_unit_price_usd > 1000000000
  then
    raise exception 'Invalid simulated order details.';
  end if;

  v_quantity := round(p_quantity, 12);
  v_price := round(p_unit_price_usd, 8);
  if v_quantity <= 0 or v_price <= 0 then
    raise exception 'Order amount and quote must be positive at supported precision.';
  end if;

  if not (
    (p_asset_id = 'bitcoin' and p_symbol = 'BTC' and p_asset_name = 'Bitcoin') or
    (p_asset_id = 'ethereum' and p_symbol = 'ETH' and p_asset_name = 'Ethereum') or
    (p_asset_id = 'solana' and p_symbol = 'SOL' and p_asset_name = 'Solana') or
    (p_asset_id = 'ripple' and p_symbol = 'XRP' and p_asset_name = 'XRP') or
    (p_asset_id = 'binancecoin' and p_symbol = 'BNB' and p_asset_name = 'BNB') or
    (p_asset_id = 'usd-coin' and p_symbol = 'USDC' and p_asset_name = 'USDC') or
    (p_asset_id = 'dogecoin' and p_symbol = 'DOGE' and p_asset_name = 'Dogecoin') or
    (p_asset_id = 'cardano' and p_symbol = 'ADA' and p_asset_name = 'Cardano') or
    (p_asset_id = 'avalanche-2' and p_symbol = 'AVAX' and p_asset_name = 'Avalanche') or
    (p_asset_id = 'chainlink' and p_symbol = 'LINK' and p_asset_name = 'Chainlink')
  ) then
    raise exception 'Cryptocurrency details do not match a supported asset.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user_id::text),
    73124
  );

  select * into v_existing
  from public.simulated_crypto_orders
  where user_id = v_user_id and idempotency_key = p_order_reference;

  if found then
    if v_existing.asset_id <> p_asset_id
      or v_existing.symbol <> p_symbol
      or v_existing.asset_name <> p_asset_name
      or v_existing.side <> p_side
      or v_existing.quantity <> v_quantity
      or v_existing.unit_price_usd <> v_price
    then
      raise exception 'This order reference was already used for different order details.';
    end if;
    return to_jsonb(v_existing);
  end if;

  v_gross := round(v_quantity * v_price, 2);
  if v_gross <= 0 or v_gross > 10000000 then
    raise exception 'Simulated order value must be between $0.01 and $10,000,000.';
  end if;
  v_fee := round(v_gross * 0.005, 2);

  if p_side = 'sell' then
    select coalesce(sum(
      case when o.side = 'buy' then o.quantity else -o.quantity end
    ), 0)
    into v_held
    from public.simulated_crypto_orders as o
    where o.user_id = v_user_id and o.symbol = p_symbol;

    if v_quantity > v_held then
      raise exception 'Insufficient simulated holdings for this sell order.';
    end if;
  end if;

  insert into public.simulated_crypto_orders (
    user_id, idempotency_key, order_reference, asset_id, symbol,
    asset_name, side, quantity, unit_price_usd, gross_usd, fee_usd
  ) values (
    v_user_id,
    p_order_reference,
    'SIM-' || upper(substr(replace(p_order_reference::text, '-', ''), 1, 12)),
    p_asset_id,
    p_symbol,
    p_asset_name,
    p_side,
    v_quantity,
    v_price,
    v_gross,
    v_fee
  )
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.get_crypto_watchlist() from public, anon;
revoke all on function public.toggle_crypto_watchlist(text) from public, anon;
revoke all on function public.submit_simulated_crypto_order(uuid, text, text, text, text, numeric, numeric) from public, anon;
grant execute on function public.get_crypto_watchlist() to authenticated;
grant execute on function public.toggle_crypto_watchlist(text) to authenticated;
grant execute on function public.submit_simulated_crypto_order(uuid, text, text, text, text, numeric, numeric) to authenticated;
