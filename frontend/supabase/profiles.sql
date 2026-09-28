-- Schema for the triage dashboard.
--
-- Run this in the Supabase SQL editor.
--
-- Tickets do NOT live here: they live in SQLite in memory on the Python
-- backend (spec section 11.1). This file only covers auth-adjacent state.
--
-- IMPORTANT: a `profiles` table already exists in this project with columns
-- (id, email, name, default_currency, created_at, updated_at). Everything here
-- adapts to it instead of replacing it. `email` and `name` are NOT NULL, which
-- is why the old trigger broke user creation: it inserted only `id`.

-- ---------------------------------------------------------------------------
-- 1. Trigger de auto-creación de perfil
-- ---------------------------------------------------------------------------
--
-- Now genuinely required: with Google sign-in, users are created by Supabase,
-- not by hand, so the profile row has to appear on its own.
--
-- The drop is not optional. A stale or broken trigger makes every signup fail
-- with "Database error creating new user".

drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    -- Google supplies full_name; fall back to the local part of the email.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, 'usuario'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- A profile problem must never block a signup.
    raise warning 'handle_new_user failed: %', sqlerrm;
    return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Backfill de perfiles que ya existen
-- ---------------------------------------------------------------------------

insert into public.profiles (id, email, name)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(u.email, 'usuario'), '@', 1)
  )
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Permisos
-- ---------------------------------------------------------------------------
--
-- The dashboard does not read `profiles` at all any more: roles were removed,
-- so there is nothing to check client side. These policies exist only so the
-- table is not wide open if someone queries it.

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);
