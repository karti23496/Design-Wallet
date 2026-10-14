-- Design Wallet — Supabase schema
-- Run this ONCE, whole, in the Supabase SQL editor, BEFORE loading any data.
-- It is idempotent: re-running it is safe and does not touch your rows.
--
-- The Google Sheet stays the editing surface. This database is a PUBLISHED COPY
-- of it: sheet-sync.gs writes (service_role), the website only reads (anon).
--
-- Column types deliberately mirror the Sheet rather than improving on it:
-- `categories` and `thumbnails` stay comma-joined TEXT, exactly as the cells
-- hold them today, and `pricing` keeps its raw wording, so the site's existing
-- parsing (parseCategories / normalizePrice) keeps working unchanged. Splitting
-- them into arrays is a later refactor, not a migration blocker.

-- ── Tables ───────────────────────────────────────────────────────────────

-- Every tool tab in the sheet merges into this one table. A tool's category
-- comes from its `categories` COLUMN, never from which tab it sits in — see
-- DECISIONS §8c. `source_tab` is recorded only so scripts/build-icons.js can
-- still see which tabs exist; it is NOT published to the website.
create table if not exists public.tools (
    slug        text primary key,
    title       text not null,
    subtitle    text,
    description text,
    image       text,
    link        text,
    pricing     text,          -- raw sheet wording; the client normalizes it
    categories  text,          -- comma-joined, as in the sheet
    thumbnails  text,          -- comma-joined; swept from every thumbnail/banner column
    source_tab  text,          -- INTERNAL. Deliberately absent from public_tools.
    sync_batch  text not null, -- set by each sync run; see the delete step
    updated_at  timestamptz not null default now()
);

-- Books tab (gid 1540089306). Positional columns in the sheet:
-- 0 thumbnail · 1 title · 2 author · 3 rating · 4 link
-- `link` can be blank, so the primary key is a slug derived from the title.
create table if not exists public.books (
    slug        text primary key,
    title       text not null,
    author      text,
    rating      numeric,
    thumbnail   text,
    link        text,
    sync_batch  text not null,
    updated_at  timestamptz not null default now()
);

-- "Wall of portfolio" tab. wall.js discards any row whose link is not an http
-- URL, so link is guaranteed present and makes a natural primary key.
create table if not exists public.portfolios (
    link        text primary key,
    title       text not null,
    subtitle    text,
    image       text,
    thumbnail   text,
    slug        text,
    sync_batch  text not null,
    updated_at  timestamptz not null default now()
);

create index if not exists tools_batch_idx      on public.tools (sync_batch);
create index if not exists books_batch_idx      on public.books (sync_batch);
create index if not exists portfolios_batch_idx on public.portfolios (sync_batch);

-- ── Row Level Security ───────────────────────────────────────────────────
-- ON BEFORE ANY DATA EXISTS. With RLS off, the anon key that ships to every
-- visitor's browser can read AND WRITE every row — that is the single mistake
-- that would make this migration worse than the Google Sheet it replaces.

alter table public.tools      enable row level security;
alter table public.books      enable row level security;
alter table public.portfolios enable row level security;

-- Anonymous visitors may read. Nothing else: no insert, no update, no delete.
-- Writes arrive only through sheet-sync.gs, which uses the service_role key and
-- bypasses these policies by design.
drop policy if exists "anon reads tools" on public.tools;
create policy "anon reads tools" on public.tools
    for select to anon using (true);

drop policy if exists "anon reads books" on public.books;
create policy "anon reads books" on public.books
    for select to anon using (true);

drop policy if exists "anon reads portfolios" on public.portfolios;
create policy "anon reads portfolios" on public.portfolios
    for select to anon using (true);

-- ── What the website actually queries ────────────────────────────────────
-- Explicit column lists, so a column added to these tables later is NOT
-- published by accident. This is the habit the spreadsheet could not enforce:
-- there, a new column was public the moment it was typed.

-- NOTE on view ownership, deliberately chosen: these views run with the view
-- OWNER's rights (Postgres's default), NOT the caller's. That is why `anon` can
-- be stripped of every privilege on the base tables below and the views still
-- work. Supabase's linter flags owner-rights views as "security definer" — here
-- it is the point: the view IS the public surface, and the tables are not
-- reachable with the anon key at all. Do not add `security_invoker = true`
-- without also granting `anon` SELECT on the tables, or the site goes blank.
create or replace view public.public_tools as
    select slug, title, subtitle, description, image, link,
           pricing, categories, thumbnails
    from public.tools;

create or replace view public.public_books as
    select slug, title, author, rating, thumbnail, link
    from public.books;

create or replace view public.public_portfolios as
    select link, title, subtitle, image, thumbnail, slug
    from public.portfolios;

-- REVOKE FIRST, THEN GRANT. Not the other way round, and never grant alone.
--
-- Supabase's ALTER DEFAULT PRIVILEGES hands `anon` and `authenticated` FULL
-- privileges on everything created in `public` — views included. So a bare
-- `grant select` adds nothing that is not already there, and the view stays
-- INSERT/UPDATE/DELETE-able. Because these views run with the owner's rights,
-- a write through one reaches the base table WITHOUT passing RLS.
--
-- Caught on 2026-10-04 by the step 3 checks, on exactly this file: reads were
-- correctly locked, and `DELETE /rest/v1/public_tools` answered 204.
--
-- Any view added here later needs these same two lines, in this order.
revoke all on public.public_tools      from anon, authenticated;
revoke all on public.public_books      from anon, authenticated;
revoke all on public.public_portfolios from anon, authenticated;

grant select on public.public_tools      to anon;
grant select on public.public_books      to anon;
grant select on public.public_portfolios to anon;

-- Supabase grants `anon` and `authenticated` full table privileges by default
-- on anything created in `public` (ALTER DEFAULT PRIVILEGES). That default is
-- what turns a forgotten RLS policy into a public write endpoint, so take it
-- away explicitly. `service_role` keeps its grants — the sync job needs them.
revoke all on public.tools      from anon, authenticated;
revoke all on public.books      from anon, authenticated;
revoke all on public.portfolios from anon, authenticated;
