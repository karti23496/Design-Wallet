-- Design Wallet — salary report by email: codes, tokens, unsubscribe (2026-11-20)
-- Run this ONCE, whole, in the Supabase SQL editor. It is idempotent.
--
-- The flow (Karthik, 2026-11-20, "Option 2" with a code instead of a link):
--   Export PDF -> pop-up (email, newsletter tick box) -> 6-digit code emailed ->
--   code typed into the pop-up -> a short-lived single-use token -> the browser
--   builds the PDF and posts it with the token -> the report is emailed, ONLY to
--   the address that proved it owns the inbox.
--
-- Everything below is for the `salary-report` Edge Function, which uses the
-- service role. The publishable key that ships in every browser gets NOTHING on
-- the two new tables: not select, not insert. Codes and tokens are personal and
-- security-sensitive, and they are stored HASHED (HMAC-SHA256 with a server
-- secret), never in the clear, so a leaked table is not a list of working codes.

-- ── Subscribers: confirmation and unsubscribe ────────────────────────────
--
-- There was no way to unsubscribe. A newsletter needs one, and so does the
-- report email's footer when the box was ticked.
alter table public.subscribers add column if not exists confirmed_at timestamptz;
alter table public.subscribers add column if not exists unsubscribed_at timestamptz;

-- A random, unguessable id per subscriber, used only in unsubscribe links, so
-- the link never contains the email address. gen_random_uuid() is volatile, so
-- existing rows each get their own value when the column is added.
alter table public.subscribers add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists subscribers_unsubscribe_token_key on public.subscribers (unsubscribe_token);

-- Rows that existed before this file were never confirmed (confirmed_at is
-- null). Anything that sends the newsletter should send only to rows where
-- unsubscribed_at is null, and should treat confirmed_at as the clean list.

-- ── One-click unsubscribe, same shape as subscribe() ────────────────────
--
-- Answers the same (nothing) whether the token matched or not, so the page
-- cannot be used to probe which tokens exist.
create or replace function public.unsubscribe(p_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.subscribers
       set unsubscribed_at = now()
     where unsubscribe_token = p_token
       and unsubscribed_at is null;
$$;

revoke all on function public.unsubscribe(uuid) from public;
grant execute on function public.unsubscribe(uuid) to anon, authenticated;

-- ── The codes ────────────────────────────────────────────────────────────
create table if not exists public.report_otps (
    id                uuid primary key default gen_random_uuid(),
    email             text not null,
    code_hash         text not null,
    ip_hash           text,
    newsletter_opt_in boolean not null default false,
    attempts          integer not null default 0,
    created_at        timestamptz not null default now(),
    expires_at        timestamptz not null,
    consumed_at       timestamptz,

    constraint report_otps_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]{2,}$'),
    constraint report_otps_email_lower check (email = lower(email)),
    constraint report_otps_attempts_range check (attempts between 0 and 50)
);

create index if not exists report_otps_email_created_idx on public.report_otps (email, created_at desc);
create index if not exists report_otps_ip_created_idx on public.report_otps (ip_hash, created_at desc);

-- ── The tokens a correct code buys ──────────────────────────────────────
create table if not exists public.report_tokens (
    token_hash        text primary key,
    email             text not null,
    newsletter_opt_in boolean not null default false,
    unsubscribe_token uuid,
    created_at        timestamptz not null default now(),
    expires_at        timestamptz not null,
    used_at           timestamptz
);

-- ── Permissions: service role only ──────────────────────────────────────
alter table public.report_otps enable row level security;
alter table public.report_tokens enable row level security;
revoke all on public.report_otps from anon, authenticated;
revoke all on public.report_tokens from anon, authenticated;

-- ── Housekeeping ────────────────────────────────────────────────────────
-- Expired codes and used or expired tokens are worth keeping only briefly (they
-- are what the rate limits count). Run this daily if pg_cron is available:
--   select cron.schedule('purge-report-otps', '17 3 * * *', 'select public.purge_report_otps()');
create or replace function public.purge_report_otps()
returns void
language sql
security definer
set search_path = ''
as $$
    delete from public.report_otps where created_at < now() - interval '2 days';
    delete from public.report_tokens where created_at < now() - interval '2 days';
$$;

revoke all on function public.purge_report_otps() from public, anon, authenticated;
