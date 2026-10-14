-- Design Wallet — newsletter subscribers
-- Run this ONCE, whole, in the Supabase SQL editor. It is idempotent.
--
-- ⚠️ THIS TABLE IS NOT SHAPED LIKE THE CATALOGUE TABLES, AND MUST NOT BE.
--
-- `tools`, `books` and `portfolios` hold public data: they are published
-- through views anyone may read, because every column is already printed on a
-- web page. This table holds PERSONAL DATA, so the publishable key that ships
-- in every visitor's browser is given NO privileges on it at all — not insert,
-- not select. The only thing it may do is call one function.

create table if not exists public.subscribers (
    email      text primary key,
    created_at timestamptz not null default now(),
    source     text,

    -- Validation lives HERE, not in the browser, because the browser is not
    -- where the request has to come from. These constraints are the actual
    -- rule; the form's checks are a courtesy to real people.
    constraint subscribers_email_shape  check (email ~ '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]{2,}$'),
    constraint subscribers_email_length check (char_length(email) between 6 and 254),

    -- Lowercase enforced rather than hoped for, so the primary key actually
    -- prevents duplicates: Karthik@x.com and karthik@x.com are one person.
    constraint subscribers_email_lower  check (email = lower(email)),

    constraint subscribers_source_length check (source is null or char_length(source) <= 60)
);

-- ── Permissions ──────────────────────────────────────────────────────────

alter table public.subscribers enable row level security;

-- Supabase's default grants would let the publishable key read the whole
-- subscriber list. Take them away, and give nothing back.
revoke all on public.subscribers from anon, authenticated;

-- Removes the direct-insert grant from the first version of this file, if it
-- ran. The function below replaced it.
drop policy if exists "anon may subscribe" on public.subscribers;

-- ── The only thing a visitor may do ──────────────────────────────────────
--
-- WHY A FUNCTION AND NOT A DIRECT INSERT.
--
-- The first attempt granted `anon` INSERT on the table and used PostgREST's
-- `Prefer: resolution=ignore-duplicates`, so that signing up twice answered 201
-- both times — otherwise the second attempt answers 409, and the form becomes a
-- way to ask "is this address on the list?" about anybody.
--
-- That header turns out to require SELECT privilege on the table, which is
-- exactly the privilege this table must never grant. Verified: the insert
-- failed 401 with `permission denied for table subscribers`.
--
-- So the insert moved in here. The function runs as its owner, which is how it
-- reaches a table the caller cannot touch, and it returns nothing at all —
-- a new address and a repeat both answer 204. Nothing is leaked either way.
create or replace function public.subscribe(p_email text, p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''          -- a SECURITY DEFINER function with a searchable
                              -- path can be hijacked by a schema the caller
                              -- controls; everything below is fully qualified.
as $$
declare
    v_email  text := lower(trim(p_email));
    v_source text := nullif(trim(coalesce(p_source, '')), '');
begin
    if v_email !~ '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]{2,}$'
       or char_length(v_email) not between 6 and 254 then
        raise exception 'invalid email address' using errcode = '22023';
    end if;

    insert into public.subscribers (email, source)
    values (v_email, left(v_source, 60))
    on conflict (email) do nothing;
end;
$$;

revoke all on function public.subscribe(text, text) from public;
grant execute on function public.subscribe(text, text) to anon;

-- ── Reading it yourself ──────────────────────────────────────────────────
-- Table Editor → subscribers. Or:
--     select email, created_at, source from public.subscribers order by created_at desc;
--     select count(*) from public.subscribers;

-- Clears the rows left by testing this file. Safe to leave in; it names only
-- those addresses.
delete from public.subscribers where email in ('probe-a@example.com', 'probe-b@example.com');
