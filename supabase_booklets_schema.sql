-- Supabase schema for `booklets` table
-- Run in Supabase SQL editor or psql

create table if not exists public.booklets (
  id text primary key,
  title text,
  grade text,
  subject text,
  topic text,
  type text,
  compiler text,
  is_published boolean default false,
  created_at bigint,
  updated_at bigint,
  questions jsonb
);

-- Simple policy: allow open read, restrict inserts/updates to authenticated users
alter table public.booklets enable row level security;

create policy "public_select" on public.booklets
  for select
  using (true);

create policy "authenticated_modify" on public.booklets
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Index for faster updated_at queries
create index if not exists idx_booklets_updated_at on public.booklets (updated_at);
