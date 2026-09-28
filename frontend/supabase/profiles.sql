-- Schema for the triage dashboard.
--
-- Run this in the Supabase SQL editor. It only covers auth-adjacent state:
-- tickets live in SQLite in memory on the Python backend (spec section 11.1).
--
-- The backend is NOT in the database trust chain, so it never writes here.

-- R-14: the admin flag lives in the user's row and is edited by hand.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read their own profile, and nothing else. The dashboard only needs
-- to know whether the signed-in user is an admin; it never lists profiles.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- The policy that would let an admin write profiles is deliberately absent.
-- Promotion happens by hand in the table editor, which needs no policy.

-- Auto-create a profile row when a user is created. Keeps the insert from
-- being blocked by RLS while still leaving writes to the service role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- First admin: create the user by hand in the Supabase dashboard
-- (Authentication > Users > Add user), then run:
--
--   update public.profiles
--      set is_admin = true
--    where id = (select id from auth.users where email = 'you@example.com');
--
-- There is no public signup (spec R-15), so every user is created by hand.

-- To promote someone later, run the same update. To demote, set is_admin = false.
