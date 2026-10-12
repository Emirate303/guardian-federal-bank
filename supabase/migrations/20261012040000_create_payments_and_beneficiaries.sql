create table public.payment_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  category text not null check (
    category in (
      'electricity',
      'water',
      'internet',
      'television',
      'other',
      'airtime',
      'data'
    )
  ),
  provider text not null check (char_length(provider) between 1 and 100),
  recipient text not null check (char_length(recipient) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (user_id, category, provider, recipient)
);

create index payment_beneficiaries_user_created_at_idx
  on public.payment_beneficiaries (user_id, created_at desc);

alter table public.payment_beneficiaries enable row level security;

create policy "Users can read their own payment beneficiaries"
  on public.payment_beneficiaries
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own payment beneficiaries"
  on public.payment_beneficiaries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own payment beneficiaries"
  on public.payment_beneficiaries
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.payment_beneficiaries from anon, authenticated;
grant select, delete on public.payment_beneficiaries to authenticated;
grant insert (user_id, display_name, category, provider, recipient)
  on public.payment_beneficiaries to authenticated;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  beneficiary_id uuid references public.payment_beneficiaries (id) on delete set null,
  idempotency_key uuid not null,
  reference text not null unique,
  category text not null check (
    category in (
      'electricity',
      'water',
      'internet',
      'television',
      'other',
      'airtime',
      'data'
    )
  ),
  provider text not null check (char_length(provider) between 1 and 100),
  recipient text not null check (char_length(recipient) between 1 and 160),
  plan text check (plan is null or char_length(plan) <= 160),
  amount numeric(14, 2) not null check (amount between 0.01 and 10000000),
  balance_after numeric(18, 2) not null check (balance_after >= 0),
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index payments_user_created_at_idx
  on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;

create policy "Users can read their own payments"
  on public.payments
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

create or replace function public.submit_payment(
  p_category text,
  p_provider text,
  p_recipient text,
  p_amount numeric,
  p_plan text default null,
  p_beneficiary_id uuid default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
  v_balance numeric(18, 2);
  v_amount numeric(14, 2);
  v_payment_id uuid := gen_random_uuid();
  v_reference text;
  v_existing public.payments%rowtype;
  v_payment public.payments%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = 'P0001';
  end if;

  if p_category is null or p_category not in (
    'electricity', 'water', 'internet', 'television', 'other', 'airtime', 'data'
  ) then
    raise exception 'INVALID_PAYMENT_CATEGORY' using errcode = 'P0001';
  end if;

  if p_provider is null or char_length(btrim(p_provider)) not between 1 and 100
     or p_recipient is null or char_length(btrim(p_recipient)) not between 1 and 160 then
    raise exception 'INVALID_PAYMENT_RECIPIENT' using errcode = 'P0001';
  end if;

  if p_plan is not null and char_length(p_plan) > 160 then
    raise exception 'INVALID_PAYMENT_PLAN' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount < 0.01 or p_amount > 10000000
     or p_amount <> round(p_amount, 2) then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = 'P0001';
  end if;
  v_amount := p_amount;

  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select a.id, a.balance
    into v_account_id, v_balance
  from public.accounts a
  where a.user_id = v_user_id
  order by a.id
  limit 1
  for update;

  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
    into v_existing
  from public.payments
  where user_id = v_user_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.category <> p_category
       or v_existing.provider <> btrim(p_provider)
       or v_existing.recipient <> btrim(p_recipient)
       or v_existing.amount <> v_amount
       or v_existing.plan is distinct from nullif(btrim(p_plan), '')
       or v_existing.beneficiary_id is distinct from p_beneficiary_id then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'reference', v_existing.reference,
      'account_id', v_existing.account_id,
      'balance_after', v_balance,
      'category', v_existing.category,
      'provider', v_existing.provider,
      'recipient', v_existing.recipient,
      'plan', v_existing.plan,
      'amount', v_existing.amount,
      'status', v_existing.status,
      'created_at', v_existing.created_at
    );
  end if;

  if p_beneficiary_id is not null and not exists (
    select 1
    from public.payment_beneficiaries b
    where b.id = p_beneficiary_id
      and b.user_id = v_user_id
      and b.category = p_category
      and b.provider = btrim(p_provider)
      and b.recipient = btrim(p_recipient)
  ) then
    raise exception 'INVALID_PAYMENT_BENEFICIARY' using errcode = 'P0001';
  end if;

  if v_balance < v_amount then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  update public.accounts
  set balance = balance - v_amount
  where id = v_account_id
    and user_id = v_user_id
  returning balance into v_balance;

  v_reference := 'PAY-' || upper(replace(v_payment_id::text, '-', ''));

  insert into public.payments (
    id,
    user_id,
    account_id,
    beneficiary_id,
    reference,
    category,
    provider,
    recipient,
    plan,
    amount,
    balance_after,
    status
  )
  values (
    v_payment_id,
    v_user_id,
    v_account_id,
    p_beneficiary_id,
    v_reference,
    p_category,
    btrim(p_provider),
    btrim(p_recipient),
    nullif(btrim(p_plan), ''),
    v_amount,
    v_balance,
    'completed'
  )
  returning * into v_payment;

  return jsonb_build_object(
    'id', v_payment.id,
    'reference', v_payment.reference,
    'account_id', v_payment.account_id,
    'balance_after', v_payment.balance_after,
    'category', v_payment.category,
    'provider', v_payment.provider,
    'recipient', v_payment.recipient,
    'plan', v_payment.plan,
    'amount', v_payment.amount,
    'status', v_payment.status,
    'created_at', v_payment.created_at
  );
end;
$$;

revoke all on function public.submit_payment(text, text, text, numeric, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_payment(text, text, text, numeric, text, uuid, uuid)
  to authenticated;
