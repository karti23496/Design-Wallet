-- Design Wallet — one-page onboarding: LinkedIn, and missing rows (2026-11-12)
-- Run this ONCE, whole, in the Supabase SQL editor, after profiles.sql.
-- It is idempotent. Run it BEFORE the new /welcome/ page goes live: the page
-- saves `linkedin` and uses an upsert, and both need this file.

-- ── LinkedIn (required by the page) ──────────────────────────────────────
-- The page tidies whatever people type into one shape before saving, and the
-- database accepts only that shape, so nothing else can be stored here.
-- The column stays nullable: rows are created at sign-up, before onboarding,
-- and older members fill it in when /welcome/ asks them to (isOnboarded()).
alter table public.profiles add column if not exists linkedin text;

alter table public.profiles drop constraint if exists profiles_linkedin_shape;
alter table public.profiles add constraint profiles_linkedin_shape check (
    linkedin is null
    or linkedin ~ '^https://www\.linkedin\.com/in/[A-Za-z0-9_%-]{3,100}/$'
);

grant update (linkedin) on public.profiles to authenticated;

-- ── A missing profile row can be created by its owner ────────────────────
-- Normally the on_auth_user_created trigger makes the row. If it's missing
-- (say a test row was deleted by hand while the login stayed), onboarding
-- couldn't save: it updated a row that wasn't there. Now the page upserts,
-- which needs INSERT, allowed only for your own id.
grant insert (id, full_name, role, level, goals, city, country, linkedin, newsletter, onboarded_at, updated_at)
    on public.profiles to authenticated;

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
    for insert to authenticated
    with check (id = (select auth.uid()));

-- A row made that way still gets the account's email, from auth.users, never
-- from the browser (email isn't in the insert grant).
create or replace function public.profile_fill_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.email is null then
        select u.email into new.email from auth.users u where u.id = new.id;
    end if;
    return new;
end;
$$;

revoke all on function public.profile_fill_email() from public, anon, authenticated;

drop trigger if exists profiles_fill_email on public.profiles;
create trigger profiles_fill_email
    before insert on public.profiles
    for each row execute function public.profile_fill_email();
