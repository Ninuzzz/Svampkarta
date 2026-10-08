-- Mycel – låt användaren radera sitt eget konto (knappen "Radera konto" i appen).
-- Klistra in i Supabase → SQL Editor → Run. Kan köras flera gånger.
--
-- Appen tar först bort kontots foton via Storage (direkt radering i
-- storage-tabellerna är spärrad i Supabase) och anropar sedan funktionen.
-- Raderna i public.items försvinner med kontot (on delete cascade).

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Inte inloggad';
  end if;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
