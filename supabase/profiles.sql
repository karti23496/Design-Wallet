-- Design Wallet — user profiles (the sign-in portal, 2026-10-28)
-- Run this ONCE, whole, in the Supabase SQL editor. It is idempotent.
--
-- Accounts themselves live in Supabase Auth (`auth.users`): email, password
-- hash, Google identity. This table holds what onboarding asks for — role,
-- level, goals, city, country, newsletter — one row per account.
--
-- ⚠️ PERSONAL DATA, like `subscribers`. The publishable key in every visitor's
-- browser gets NOTHING on this table. A signed-in user (the `authenticated`
-- role) may read and edit exactly one row: their own. Nobody can list it but
-- you, from the dashboard.

create table if not exists public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    full_name    text,
    role         text,
    level        text,
    goals        text[] not null default '{}',
    city         text,
    country      text,
    newsletter   boolean not null default false,
    onboarded_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    -- The browser is not where requests have to come from, so the limits live
    -- here. Generous, but enough that the table can't be used as free storage.
    constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 80),
    constraint profiles_role_length      check (role      is null or char_length(role)      <= 60),
    constraint profiles_level_length     check (level     is null or char_length(level)     <= 60),
    constraint profiles_city_length      check (city      is null or char_length(city)      <= 80),
    constraint profiles_country_length   check (country   is null or char_length(country)   <= 80),
    constraint profiles_goals_count      check (cardinality(goals) <= 10)
);

-- A copy of the account's email, so the Table Editor shows who each row is
-- (added 2026-10-30; the real one lives in auth.users). Filled and kept in
-- step by the triggers below. It is deliberately NOT in the update grant: a
-- user can read their own, never rewrite it.
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- ── Permissions ──────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- Supabase's default grants hand both roles everything. Take it all back,
-- then give `authenticated` only what the site uses.
revoke all on public.profiles from anon, authenticated;

grant select on public.profiles to authenticated;
-- Column-level: `id` and `created_at` can never be rewritten from the browser.
grant update (full_name, role, level, goals, city, country, newsletter, onboarded_at, updated_at)
    on public.profiles to authenticated;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "update own profile" on public.profiles;

create policy "read own profile" on public.profiles
    for select to authenticated
    using (id = (select auth.uid()));

create policy "update own profile" on public.profiles
    for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

-- No insert policy: rows are created by the trigger below, never the browser.

-- ── One row per new account ──────────────────────────────────────────────
--
-- Runs as its owner (security definer) because the new user can't insert.
-- `full_name` comes from the sign-up form (options.data.full_name) or, for
-- Google, from the name Google sends.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name, email)
    values (
        new.id,
        left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80),
        new.email
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- If someone changes their email, the copy follows.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.profiles set email = new.email where id = new.id;
    return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
    after update of email on auth.users
    for each row
    when (old.email is distinct from new.email)
    execute function public.sync_profile_email();

create or replace function public.touch_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
    before update on public.profiles
    for each row execute function public.touch_profile();

-- ── Your sign-up metric ──────────────────────────────────────────────────
--
-- Not exposed to the site. Run these in the SQL editor:
--
--   select count(*)                                   from public.profiles;               -- accounts
--   select count(*)                                   from public.profiles where onboarded_at is not null;
--   select role,  count(*) from public.profiles group by role  order by 2 desc;
--   select unnest(goals) as goal, count(*) from public.profiles group by 1 order by 2 desc;
--   select country, city, count(*) from public.profiles group by 1, 2 order by 3 desc;
