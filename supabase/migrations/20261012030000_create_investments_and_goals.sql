create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null check (
    product_id in (
      'sim-fixed-deposit',
      'sim-government-bond',
      'sim-income-fund',
      'sim-index-fund'
    )
  ),
  principal numeric(14, 2) not null check (principal between 1 and 10000000),
  duration_months integer not null check (duration_months between 1 and 600),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now()
);

create index investments_user_created_at_idx
  on public.investments (user_id, created_at desc);

alter table public.investments enable row level security;

create policy "Users can read their own investments"
  on public.investments
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can add their own simulated investments"
  on public.investments
  for insert
  to authenticated
  with check (auth.uid() = user_id and status = 'active');

create policy "Users can close their own investments"
  on public.investments
  for update
  to authenticated
  using (auth.uid() = user_id and status = 'active')
  with check (auth.uid() = user_id and status = 'closed');

revoke all on public.investments from anon, authenticated;
grant select on public.investments to authenticated;
grant insert (user_id, product_id, principal, duration_months)
  on public.investments to authenticated;
grant update (status) on public.investments to authenticated;

create table public.investment_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  goal_type text not null check (goal_type in ('savings', 'investment')),
  target_amount numeric(14, 2) not null check (target_amount between 1 and 10000000),
  current_amount numeric(14, 2) not null default 0 check (
    current_amount >= 0 and current_amount <= target_amount
  ),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index investment_goals_user_created_at_idx
  on public.investment_goals (user_id, created_at desc);

alter table public.investment_goals enable row level security;

create policy "Users can read their own investment goals"
  on public.investment_goals
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own investment goals"
  on public.investment_goals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own investment goals"
  on public.investment_goals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own investment goals"
  on public.investment_goals
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.investment_goals from anon, authenticated;
grant select, delete on public.investment_goals to authenticated;
grant insert (user_id, name, goal_type, target_amount, current_amount, target_date)
  on public.investment_goals to authenticated;
grant update (name, goal_type, target_amount, current_amount, target_date, updated_at)
  on public.investment_goals to authenticated;
