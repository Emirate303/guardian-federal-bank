create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object'),
  updated_at timestamptz not null default now()
);

create function public.touch_user_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row
  execute function public.touch_user_settings_updated_at();

alter table public.user_settings enable row level security;

create policy "Users can read their own settings"
  on public.user_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own settings"
  on public.user_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own settings"
  on public.user_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.user_settings from public, anon, authenticated;
revoke all on function public.touch_user_settings_updated_at() from public, anon, authenticated;
grant select on public.user_settings to authenticated;
grant insert (user_id, preferences) on public.user_settings to authenticated;
grant update (preferences) on public.user_settings to authenticated;
