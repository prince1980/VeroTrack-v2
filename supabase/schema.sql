-- VeroTrack Cloud Sync schema (run once in Supabase SQL Editor)

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_data_updated_at
  on public.user_data (updated_at desc);

alter table public.user_data enable row level security;

create policy "user_data_select_own" on public.user_data for select using (auth.uid() = user_id);
create policy "user_data_insert_own" on public.user_data for insert with check (auth.uid() = user_id);
create policy "user_data_update_own" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_data_delete_own" on public.user_data for delete using (auth.uid() = user_id);
