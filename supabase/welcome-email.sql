-- Design Wallet — welcome email for every new account (2026-11-12)
-- Run this ONCE, whole, in the Supabase SQL editor. It is idempotent.
--
-- When an account becomes confirmed, the database asks the `welcome-email`
-- edge function to send one welcome email:
--   · Google sign-ups are confirmed the moment they're created.
--   · Email sign-ups are confirmed when they click the link in
--     "Confirm your Design Wallet account". So they never get "welcome" and
--     "confirm your email" at the same time.
--
-- Before running this, store the shared secret in Vault (see the steps in
-- DECISIONS.md, "Welcome email"). The same value goes into the function's
-- WELCOME_EMAIL_SECRET, so only this database can ask it to send.
--
-- ⚠️ Nothing here can block a sign-up. If the secret is missing or the call
-- can't be queued, it raises a warning and the account is created anyway.

create extension if not exists pg_net;

-- Once per account, ever. The edge function sets this before sending, so a
-- repeat call (or a re-confirmed email) never sends a second welcome.
-- Not in the `authenticated` update grant: users can't reset it.
alter table public.profiles add column if not exists welcomed_at timestamptz;

create or replace function public.queue_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    secret text;
begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'welcome_email_secret'
    limit 1;

    if secret is null then
        raise warning 'welcome email skipped: no welcome_email_secret in Vault';
        return new;
    end if;

    -- Queued, not sent: pg_net makes the call after this transaction commits,
    -- so the profile row (created by on_auth_user_created) already exists.
    perform net.http_post(
        url     := 'https://ugjtyuikvdeymwsfsgfl.supabase.co/functions/v1/welcome-email',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-welcome-secret', secret
        ),
        body    := jsonb_build_object('user_id', new.id)
    );
    return new;
exception when others then
    raise warning 'welcome email not queued: %', sqlerrm;
    return new;
end;
$$;

revoke all on function public.queue_welcome_email() from public, anon, authenticated;

-- Google: confirmed on insert.
drop trigger if exists on_auth_user_welcome_insert on auth.users;
create trigger on_auth_user_welcome_insert
    after insert on auth.users
    for each row
    when (new.email_confirmed_at is not null)
    execute function public.queue_welcome_email();

-- Email + password: confirmed later, when the link is clicked.
drop trigger if exists on_auth_user_welcome_confirm on auth.users;
create trigger on_auth_user_welcome_confirm
    after update of email_confirmed_at on auth.users
    for each row
    when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
    execute function public.queue_welcome_email();
