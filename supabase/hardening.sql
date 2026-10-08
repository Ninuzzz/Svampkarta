-- Mycel – skärpning av databasen. Kör efter schema.sql (Supabase → SQL Editor → Run).
-- Kan köras flera gånger.

-- 1. Bara inloggade får röra tabellen över huvud taget (radskyddet gäller dessutom)
revoke all on table public.items from anon;
revoke all on table public.items from public;
grant select, insert, update, delete on table public.items to authenticated;

-- 2. Rimlig form och storlek på varje rad
alter table public.items drop constraint if exists items_id_len;
alter table public.items add constraint items_id_len check (char_length(id) between 1 and 100);
alter table public.items drop constraint if exists items_data_object;
alter table public.items add constraint items_data_object check (data is null or jsonb_typeof(data) = 'object');
alter table public.items drop constraint if exists items_data_size;
-- en lång GPS-rutt är ca 50–100 kB; 600 kB ger god marginal
alter table public.items add constraint items_data_size check (data is null or pg_column_size(data) <= 600000);
alter table public.items drop constraint if exists items_deleted_consistent;
alter table public.items add constraint items_deleted_consistent check (deleted = (data is null));

-- 3. Högst 10 000 sparade saker per konto
create or replace function public.items_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.items where user_id = new.user_id) >= 10000 then
    raise exception 'För många sparade saker på kontot';
  end if;
  return new;
end $$;
drop trigger if exists items_limit on public.items;
create trigger items_limit before insert on public.items for each row execute function public.items_limit();

-- 4. Serverns tidsstämpel: fast sökväg (så att funktionen inte kan luras att använda andra tabeller)
create or replace function public.items_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

-- 5. Foton: högst 300 per konto (utöver 5 MB per fil och bara bildformat, se schema.sql)
drop policy if exists "egna foton – ladda upp" on storage.objects;
create policy "egna foton – ladda upp" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = (select auth.uid())::text
    ) < 300
  );
