-- Design Wallet — Favourites (2026-10-30; books and portfolios 2026-10-31)
-- Run this whole file in the Supabase SQL editor, after profiles.sql.
-- It is idempotent, and it upgrades the tools-only table of 2026-10-30 in
-- place, keeping every heart already saved.
--
-- One row per (person, thing) they've hearted. `kind` says what the thing is:
--   tool       item_key = the tool's slug       (public.tools.slug)
--   book       item_key = the book's slug       (public.books.slug)
--   portfolio  item_key = the portfolio's link  (public.portfolios.link, its primary key)
--
-- A signed-in user can see, add and remove only their own rows. Everyone
-- signed in can see HOW MANY people favourited each thing, through
-- favourite_counts(), but never WHO. Signed-out visitors get nothing
-- (Karthik's call: counts are signed-in only).
--
-- Deleting an account removes its favourites (on delete cascade), so
-- "Delete my account" needs no change.

create table if not exists public.favourites (
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    kind       text not null default 'tool',
    item_key   text not null,
    created_at timestamptz not null default now()
);

-- ── Upgrade from the tools-only table (2026-10-30) ───────────────────────
-- Its key column was tool_slug, and it had no kind (every row is a tool).
do $$
begin
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'favourites' and column_name = 'tool_slug') then
        alter table public.favourites rename column tool_slug to item_key;
    end if;
end;
$$;

alter table public.favourites add column if not exists kind text not null default 'tool';

alter table public.favourites drop constraint if exists favourites_pkey;
alter table public.favourites add constraint favourites_pkey primary key (user_id, kind, item_key);

-- Deliberately no foreign keys to tools / books / portfolios: the Sheet sync
-- deletes and re-adds rows, and a cascade would silently wipe people's
-- favourites. The shapes are checked instead. Slugs are the sync's slugify()
-- output; links are what wall.js accepts (http or https).
alter table public.favourites drop constraint if exists favourites_slug_shape;
alter table public.favourites drop constraint if exists favourites_key_shape;
alter table public.favourites add constraint favourites_key_shape check (
    (kind in ('tool', 'book') and item_key ~ '^[a-z0-9-]{1,120}$')
    or (kind = 'portfolio' and item_key ~ '^https?://\S+$' and char_length(item_key) <= 500)
);

drop index if exists public.favourites_tool_idx;
create index if not exists favourites_item_idx on public.favourites (kind, item_key);

-- ── Permissions ──────────────────────────────────────────────────────────

alter table public.favourites enable row level security;

revoke all on public.favourites from anon, authenticated;
grant select, insert, delete on public.favourites to authenticated;

drop policy if exists "read own favourites"   on public.favourites;
drop policy if exists "add own favourites"    on public.favourites;
drop policy if exists "remove own favourites" on public.favourites;

create policy "read own favourites" on public.favourites
    for select to authenticated
    using (user_id = (select auth.uid()));

create policy "add own favourites" on public.favourites
    for insert to authenticated
    with check (user_id = (select auth.uid()));

create policy "remove own favourites" on public.favourites
    for delete to authenticated
    using (user_id = (select auth.uid()));

-- A ceiling, so one account can't fill the table: 500 of each kind. That is
-- more than the whole catalogue, and more than anyone will heart on the Wall.
create or replace function public.favourites_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select count(*) from public.favourites where user_id = new.user_id and kind = new.kind) >= 500 then
        raise exception 'favourites limit reached';
    end if;
    return new;
end;
$$;

drop trigger if exists favourites_limit on public.favourites;
create trigger favourites_limit
    before insert on public.favourites
    for each row execute function public.favourites_limit();

-- ── The counts on each heart ─────────────────────────────────────────────
--
-- Runs as its owner so it can count everyone's rows, and returns only the
-- totals. One call per page load gives every count. Dropped first because
-- the 2026-10-30 version returned different columns.
drop function if exists public.favourite_counts();
create function public.favourite_counts()
returns table (kind text, item_key text, favourites bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select f.kind, f.item_key, count(*)
    from public.favourites f
    group by f.kind, f.item_key;
$$;

revoke all on function public.favourite_counts() from public, anon;
grant execute on function public.favourite_counts() to authenticated;

-- ── For you, in the SQL editor ───────────────────────────────────────────
--
--   select kind, item_key, count(*) from public.favourites group by 1, 2 order by 3 desc limit 20;  -- most loved
--   select kind, count(*) from public.favourites group by 1;                                       -- by kind
--   select count(distinct user_id) from public.favourites;                                         -- people using it
