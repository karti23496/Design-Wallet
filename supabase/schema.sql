-- ============================================================================
-- Design Wallet — Annual Subscription Access schema (PRD v4)
-- Run in the Supabase SQL editor (or `supabase db push`) after creating the
-- project. Implements the four-state access model:
--   1. No account            → no auth.users row (must pay via Lemon Squeezy)
--   2. active                → full access until subscription_renews_at
--   3. suspended             → account-status page only (payment_failed |
--                              cancelled_and_expired)
--   4. signup_incomplete     → paid, no password set yet (tracked on payments)
--
-- Enforcement note: the LIVE launch uses a UI-only gate (client-side guard on
-- the catalog SPA reading subscription_status in real time). The catalog itself
-- still loads from the public Google Sheet, so it is NOT cryptographically
-- protected yet. The `catalog` table + RLS approach (real enforcement) is
-- deliberately deferred — see README "Deferred: real (server-side) gate".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: 1:1 with auth.users. Source of truth for access + billing state.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
    id                        uuid primary key references auth.users (id) on delete cascade,
    email                     text not null,

    -- Access state machine (PRD §5.1). Default is the fail-closed state: a row
    -- with no explicit activation can never reach the collection.
    subscription_status       text not null default 'signup_incomplete'
                                  check (subscription_status in ('active','suspended','signup_incomplete')),

    -- Annual billing anchor: the anniversary date, extended +1yr on each
    -- successful renewal. Null until the first activation.
    subscription_renews_at    timestamptz,
    subscription_started_at   timestamptz,

    -- Only meaningful while suspended; tailors the account-page + email copy.
    suspended_reason          text
                                  check (suspended_reason in ('payment_failed','cancelled_and_expired')),

    -- Lemon Squeezy linkage (for reconciliation + the hosted Customer Portal).
    ls_subscription_id        text,
    ls_customer_id            text,
    ls_customer_portal_url    text,

    -- Idempotency guard for the 7-day pre-renewal reminder: stores the
    -- renews_at value we last reminded about, so one reminder per cycle.
    renewal_reminder_for      timestamptz,

    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now()
);

create index if not exists profiles_email_idx           on public.profiles (lower(email));
create index if not exists profiles_ls_subscription_idx on public.profiles (ls_subscription_id);
create index if not exists profiles_renews_at_idx        on public.profiles (subscription_renews_at);

alter table public.profiles enable row level security;

-- A user may READ only their own profile row. There is deliberately NO update
-- policy: clients can never write to profiles, so subscription_status cannot be
-- self-granted. All writes go through the service role (Lemon Squeezy webhook /
-- Edge Functions / admin) or the SECURITY DEFINER trigger below — both bypass RLS.
create policy "profiles_select_own"
    on public.profiles for select
    using (auth.uid() = id);

-- Auto-create a profile row when a new auth user is created. ALWAYS defaults to
-- signup_incomplete; the complete-account-setup Edge Function (service role,
-- after validating the single-use payment setup token) promotes it to active.
-- We never grant active here by matching email against payments — that would let
-- anyone who knows a payer's email register first and hijack their access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, email, subscription_status)
    values (new.id, new.email, 'signup_incomplete')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Keep updated_at fresh on any profile write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
    before update on public.profiles
    for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- payments: records a successful Lemon Squeezy payment BEFORE an account may
-- exist. Source of truth for "paid but signup incomplete" (FR-16). Written only
-- by the service role (webhook / edge functions).
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
    id                  uuid primary key default gen_random_uuid(),
    email                   text not null,
    ls_order_id             text unique,             -- Lemon Squeezy order id (idempotency key)
    ls_subscription_id      text,
    ls_customer_id          text,
    ls_customer_portal_url  text,                    -- copied onto the profile at setup
    status              text not null default 'paid' -- paid | refunded
                            check (status in ('paid','refunded')),
    paid_at             timestamptz not null default now(),
    signup_complete     boolean not null default false,
    setup_token         text,                        -- signed, single-use
    token_expires_at    timestamptz,
    reminder_sent       boolean not null default false, -- 24h signup-incomplete follow-up
    created_at          timestamptz not null default now()
);

create index if not exists payments_email_idx on public.payments (lower(email));

alter table public.payments enable row level security;
-- No public policies: only the service role touches this table.
-- RLS-on with no policy = deny-all for anon/authenticated roles.

-- ----------------------------------------------------------------------------
-- Admin override (FR-24): support / edge cases. Run from the SQL editor (service
-- role). Set status + optionally the renewal date; clears suspended_reason when
-- moving to a non-suspended state.
--   select public.admin_set_subscription('user@example.com', 'active', now() + interval '365 days');
--   select public.admin_set_subscription('user@example.com', 'suspended', null, 'payment_failed');
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_subscription(
    target_email  text,
    new_status    text,
    new_renews_at timestamptz default null,
    new_reason    text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    update public.profiles
        set subscription_status  = new_status,
            subscription_renews_at = coalesce(new_renews_at, subscription_renews_at),
            suspended_reason      = case when new_status = 'suspended' then new_reason else null end
        where lower(email) = lower(target_email);
end;
$$;
