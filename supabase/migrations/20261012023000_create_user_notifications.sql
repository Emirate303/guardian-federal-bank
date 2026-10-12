create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('transaction', 'profile')),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index user_notifications_user_created_at_idx
  on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

create policy "Users can read their own notifications"
  on public.user_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own notifications"
  on public.user_notifications
  for insert
  to authenticated
  with check (auth.uid() = user_id and read_at is null);

create policy "Users can mark their own notifications as read"
  on public.user_notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.user_notifications from anon, authenticated;
grant select on public.user_notifications to authenticated;
grant insert (user_id, type, title, message)
  on public.user_notifications to authenticated;
grant update (read_at)
  on public.user_notifications to authenticated;
