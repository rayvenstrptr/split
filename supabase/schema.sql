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


-- ---------------------------------------------------------------------------
-- Activity log archive. The app keeps the most recent ~500 events locally; once
-- that fills, the oldest 250 roll into this table so nothing is lost ("one place"
-- holding everything). Append-only, keyed (username, id), tied to the same vault
-- account. Same lock-down as `vaults`: RLS on, no policies, all access via the two
-- SECURITY DEFINER functions below, which verify the bcrypt PIN against `vaults`.
-- ---------------------------------------------------------------------------

create table if not exists activity_events (
  username text not null,
  id       text not null,
  at       bigint not null, -- epoch ms (client-stamped)
  kind     text not null,
  message  text not null,
  primary key (username, id)
);

create index if not exists activity_events_user_at
  on activity_events (username, at desc);

alter table activity_events enable row level security;
revoke all on table activity_events from anon, authenticated;

-- Append (upsert) a batch of events. Idempotent on (username, id); re-sending an
-- event updates its message/at, so coalesced edits stay current. `p_events` is a
-- JSON array of { id, at, kind, message }.
create or replace function append_activity(p_username text, p_pin text, p_events jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(trim(p_username)); v vaults;
begin
  select * into v from vaults where username = u;
  if not found or v.pin_hash <> crypt(p_pin, v.pin_hash) then
    raise exception 'invalid_credentials';
  end if;
  insert into activity_events (username, id, at, kind, message)
  select u, e.id, e.at, e.kind, e.message
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb))
    as e(id text, at bigint, kind text, message text)
  where e.id is not null
  on conflict (username, id) do update
    set message = excluded.message, at = excluded.at;
end; $$;

-- Read the newest events (newest first). Page further back with p_before = the
-- oldest `at` already seen. Returns a JSON array (possibly empty).
create or replace function pull_activity(
  p_username text, p_pin text, p_limit int default 500, p_before bigint default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(trim(p_username)); v vaults; result jsonb;
begin
  select * into v from vaults where username = u;
  if not found or v.pin_hash <> crypt(p_pin, v.pin_hash) then
    raise exception 'invalid_credentials';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb) into result
  from (
    select id, at, kind, message
    from activity_events
    where username = u and (p_before is null or at < p_before)
    order by at desc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  ) t;
  return result;
end; $$;

grant execute on function append_activity, pull_activity to anon;
