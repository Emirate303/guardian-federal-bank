create table public.crypto_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
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
  quote_updated_at timestamptz not null,
  gross_usd numeric(20, 2) not null check (gross_usd > 0 and gross_usd <= 10000000),
  fee_usd numeric(20, 2) not null check (fee_usd >= 0),
  settlement_usd numeric(20, 2) not null check (settlement_usd > 0),
  balance_after numeric(18, 2) not null check (balance_after >= 0),
  status text not null default 'completed' check (status = 'completed'),
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

create index crypto_orders_user_created_idx
  on public.crypto_orders (user_id, created_at desc);

alter table public.crypto_orders enable row level security;

create policy "Users can read their own crypto orders"
  on public.crypto_orders
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.crypto_orders from anon, authenticated;
grant select on public.crypto_orders to authenticated;

create or replace function public.submit_crypto_order(
  p_user_id uuid,
  p_order_reference uuid,
  p_asset_id text,
  p_symbol text,
  p_asset_name text,
  p_side text,
  p_quantity numeric,
  p_unit_price_usd numeric,
  p_quote_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_currency text;
  v_balance numeric(18, 2);
  v_existing public.crypto_orders%rowtype;
  v_order public.crypto_orders%rowtype;
  v_quantity numeric(30, 12);
  v_price numeric(20, 8);
  v_gross numeric(20, 2);
  v_fee numeric(20, 2);
  v_settlement numeric(20, 2);
  v_held numeric(30, 12);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ORDER_SERVICE_REQUIRED' using errcode = 'P0001';
  end if;

  if p_user_id is null
    or p_order_reference is null
    or p_asset_id is null
    or p_symbol is null
    or p_asset_name is null
    or p_side is null
    or p_side not in ('buy', 'sell')
    or p_quantity is null
    or p_quantity <= 0
    or p_quantity > 1000000
    or p_unit_price_usd is null
    or p_unit_price_usd <= 0
    or p_unit_price_usd > 1000000000
    or p_quote_updated_at is null
    or p_quote_updated_at < now() - interval '5 minutes'
    or p_quote_updated_at > now() + interval '1 minute'
  then
    raise exception 'INVALID_CRYPTO_ORDER' using errcode = 'P0001';
  end if;

  v_quantity := round(p_quantity, 12);
  v_price := round(p_unit_price_usd, 8);
  if v_quantity <= 0 or v_price <= 0 then
    raise exception 'INVALID_CRYPTO_ORDER_PRECISION' using errcode = 'P0001';
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
    raise exception 'UNSUPPORTED_CRYPTO_ASSET' using errcode = 'P0001';
  end if;

  select a.id, a.currency, a.balance
    into v_account_id, v_currency, v_balance
  from public.accounts as a
  where a.user_id = p_user_id
  order by a.id
  limit 1
  for update;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_currency is distinct from 'USD' then
    raise exception 'USD_ACCOUNT_REQUIRED' using errcode = 'P0001';
  end if;

  select *
    into v_existing
  from public.crypto_orders
  where user_id = p_user_id
    and idempotency_key = p_order_reference;

  if found then
    if v_existing.asset_id <> p_asset_id
      or v_existing.symbol <> p_symbol
      or v_existing.asset_name <> p_asset_name
      or v_existing.side <> p_side
      or v_existing.quantity <> v_quantity
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    return to_jsonb(v_existing);
  end if;

  v_gross := round(v_quantity * v_price, 2);
  if v_gross <= 0 or v_gross > 10000000 then
    raise exception 'CRYPTO_ORDER_VALUE_OUT_OF_RANGE' using errcode = 'P0001';
  end if;
  v_fee := round(v_gross * 0.005, 2);
  v_settlement := case
    when p_side = 'buy' then v_gross + v_fee
    else v_gross - v_fee
  end;

  if p_side = 'sell' then
    select coalesce(sum(
      case when o.side = 'buy' then o.quantity else -o.quantity end
    ), 0)
    into v_held
    from public.crypto_orders as o
    where o.user_id = p_user_id
      and o.symbol = p_symbol;

    if v_quantity > v_held then
      raise exception 'INSUFFICIENT_CRYPTO_HOLDINGS' using errcode = 'P0001';
    end if;
  elsif v_balance < v_settlement then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  update public.accounts
  set balance = case
    when p_side = 'buy' then balance - v_settlement
    else balance + v_settlement
  end
  where id = v_account_id
    and user_id = p_user_id
  returning balance into v_balance;

  insert into public.crypto_orders (
    user_id,
    account_id,
    idempotency_key,
    order_reference,
    asset_id,
    symbol,
    asset_name,
    side,
    quantity,
    unit_price_usd,
    quote_updated_at,
    gross_usd,
    fee_usd,
    settlement_usd,
    balance_after
  )
  values (
    p_user_id,
    v_account_id,
    p_order_reference,
    'CRY-' || upper(substr(replace(p_order_reference::text, '-', ''), 1, 12)),
    p_asset_id,
    p_symbol,
    p_asset_name,
    p_side,
    v_quantity,
    v_price,
    p_quote_updated_at,
    v_gross,
    v_fee,
    v_settlement,
    v_balance
  )
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.submit_crypto_order(uuid, uuid, text, text, text, text, numeric, numeric, timestamptz)
  from public, anon, authenticated;
grant execute on function public.submit_crypto_order(uuid, uuid, text, text, text, text, numeric, numeric, timestamptz)
  to service_role;

drop function public.submit_simulated_crypto_order(uuid, text, text, text, text, numeric, numeric);
