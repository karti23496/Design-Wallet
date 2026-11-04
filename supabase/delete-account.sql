-- Design Wallet — "Delete my account" (2026-10-29)
-- Run this ONCE, whole, in the Supabase SQL editor, after profiles.sql.
-- It is idempotent.
--
-- The browser can't delete from auth.users. This function can, because it runs
-- as its owner, but it only ever deletes the account of whoever calls it:
-- auth.uid() is the signed-in user's own id, taken from their token, not
-- from anything they send. Their profile row goes with it (on delete cascade),
-- and so does their newsletter subscription, because the button promises
-- "everything stored with it".

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    me uuid := auth.uid();
begin
    if me is null then
        raise exception 'not signed in';
    end if;

    delete from public.subscribers
    where email = (select lower(email) from auth.users where id = me);

    delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
