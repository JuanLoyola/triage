-- Schema for the triage dashboard.
--
-- Run this in the Supabase SQL editor. It only covers auth-adjacent state:
-- tickets live in SQLite in memory on the Python backend (spec section 11.1).
--
-- The backend is NOT in the database trust chain, so it never writes here.

-- ---------------------------------------------------------------------------
-- 1. Tabla de perfiles (R-14: el flag de admin vive acá y se edita a mano)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Un usuario solo puede leer su propio perfil. El dashboard únicamente
-- necesita saber si el usuario logueado es admin; nunca lista perfiles.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Nota: deliberadamente NO hay policy de INSERT/UPDATE. El perfil se crea a
-- mano y la promoción de admin se hace a mano. Así la tabla queda effectively
-- read-only desde el cliente, que es lo que queremos para un MVP.

-- ---------------------------------------------------------------------------
-- 2. Trigger de auto-creación de perfil
-- ---------------------------------------------------------------------------
--
-- Opcional. Antes de agregarlo, borrá el que pueda haber quedado de una
-- ejecución previa: un trigger roto hace fallar el alta de usuarios con
-- "Database error creating new user".
--
-- Para un MVP podés saltearlo. El flujo manual está en la sección 3.

drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- Nunca bloquear el alta de un usuario por un detalle del perfil.
    -- El perfil se puede crear a mano después.
    raise warning 'handle_new_user: %', sqlerrm;
    return new;
end;
$$;

-- Activá el trigger solo si necesitás que el perfil nazca solo.
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row
--   execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Flujo manual (recomendado para el MVP)
-- ---------------------------------------------------------------------------
--
-- 1. Creás el usuario en Authentication > Users > Add user.
-- 2. Corrés esto para crear su perfil:
--
--   insert into public.profiles (id)
--   select id from auth.users where email = 'tu@email.com'
--   on conflict (id) do nothing;
--
-- 3. Si querés que sea admin:
--
--   update public.profiles
--      set is_admin = true
--    where id = (select id from auth.users where email = 'tu@email.com');

-- Para promover o degradar a alguien más adelante, repetí el update.
