-- Accounts table with automatic Savings and Checking provisioning.
-- Backfills any existing users that have no account yet.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_number text not null unique,
  account_name text not null,
  account_type text not null
    check (account_type in ('savings', 'checking')),
  currency text not null default 'USD',
  balance numeric(18, 2) not null default 0
    check (balance >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, account_type)
);

create index if not exists accounts_user_id_idx
  on public.accounts (user_id);

alter table public.accounts enable row level security;

create policy "Users can read their own accounts"
  on public.accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.accounts from anon, authenticated;
grant select on public.accounts to authenticated;

-- Grants used by the provisioning trigger (security definer functions
-- bypass RLS, but the grant keeps intent explicit).
grant insert on public.accounts to authenticated;

create or replace function public.generate_bank_account_number()
returns text
language sql
security definer
set search_path = pg_catalog, public
as $$
  select '4020' || lpad((floor(random() * 100000000)::bigint)::text, 8, '0');
$$;

create or replace function public.provision_user_accounts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Guard against double provisioning on concurrent inserts.
  if exists (select 1 from public.accounts where user_id = new.id) then
    return new;
  end if;

  insert into public.accounts (user_id, account_number, account_name, account_type, currency, balance)
  values
    (new.id, public.generate_bank_account_number(), 'Savings', 'savings', 'USD', 0),
    (new.id, public.generate_bank_account_number(), 'Checking', 'checking', 'USD', 0)
  on conflict do nothing;

  return new;
end;
$$;

-- Provision for every new signup.
drop trigger if exists provision_user_accounts_trigger on public.users;
create trigger provision_user_accounts_trigger
  after insert on public.users
  for each row execute function public.provision_user_accounts();

-- Backfill: any user that signed up before this migration.
insert into public.accounts (user_id, account_number, account_name, account_type, currency, balance)
select
  u.id,
  public.generate_bank_account_number(),
  'Savings',
  'savings',
  'USD',
  0
from auth.users u
where not exists (
  select 1 from public.accounts a where a.user_id = u.id and a.account_type = 'savings'
)
on conflict do nothing;

insert into public.accounts (user_id, account_number, account_name, account_type, currency, balance)
select
  u.id,
  public.generate_bank_account_number(),
  'Checking',
  'checking',
  'USD',
  0
from auth.users u
where not exists (
  select 1 from public.accounts a where a.user_id = u.id and a.account_type = 'checking'
)
on conflict do nothing;
