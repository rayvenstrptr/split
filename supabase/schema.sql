-- Split cloud sync schema. Run once in the Supabase SQL editor.
-- Each person owns one "vault" keyed by username + 4-digit PIN, holding their
-- whole SavedSession[] history as a buildBackup() JSON blob. The table is
-- unreadable directly (RLS on, no policies); all access goes through three
-- SECURITY DEFINER functions that verify a bcrypt-hashed PIN server-side.

create extension if not exists pgcrypto;

create table if not exists vaults (
  username   text primary key,
  pin_hash   text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table vaults enable row level security;
revoke all on table vaults from anon, authenticated;

create or replace function claim_vault(p_username text, p_pin text, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(trim(p_username));
begin
  if u = '' or p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_credentials';
  end if;
  insert into vaults(username, pin_hash, data)
  values (u, crypt(p_pin, gen_salt('bf')), coalesce(p_data, '{}'::jsonb));
exception when unique_violation then
  raise exception 'username_taken';
end; $$;

create or replace function pull_vault(p_username text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(trim(p_username)); v vaults;
begin
  select * into v from vaults where username = u;
  if not found or v.pin_hash <> crypt(p_pin, v.pin_hash) then
    raise exception 'invalid_credentials';
  end if;
  return v.data;
end; $$;

create or replace function push_vault(p_username text, p_pin text, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(trim(p_username)); v vaults;
begin
  select * into v from vaults where username = u;
  if not found or v.pin_hash <> crypt(p_pin, v.pin_hash) then
    raise exception 'invalid_credentials';
  end if;
  update vaults set data = coalesce(p_data, '{}'::jsonb), updated_at = now()
  where username = u;
end; $$;

grant execute on function claim_vault, pull_vault, push_vault to anon;
