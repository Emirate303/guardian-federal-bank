create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 120),
  category text not null check (
    category in (
      'Account access',
      'Account information',
      'Transactions',
      'Debit card',
      'Website feedback',
      'Other'
    )
  ),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'open' check (
    status in ('open', 'in_progress', 'resolved')
  ),
  created_at timestamptz not null default now()
);

create index support_tickets_user_created_at_idx
  on public.support_tickets (user_id, created_at desc);

alter table public.support_tickets enable row level security;

create policy "Users can read their own support tickets"
  on public.support_tickets
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can open their own support tickets"
  on public.support_tickets
  for insert
  to authenticated
  with check (auth.uid() = user_id and status = 'open');

revoke all on public.support_tickets from anon, authenticated;
grant select on public.support_tickets to authenticated;
grant insert (user_id, subject, category, message)
  on public.support_tickets to authenticated;
