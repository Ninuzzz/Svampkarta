-- Mycel – synk mellan enheter (Supabase).
-- Klistra in allt i Supabase → SQL Editor → Run. Kan köras flera gånger.
-- Kör sedan hardening.sql (storleksgränser, behörigheter och tak per konto).
--
-- En rad per sparad sak (plats, dagboksinlägg, rutt, "hittade"-svar).
-- Raderade saker ligger kvar som "deleted" så att raderingen når alla enheter.
-- Radnivåskydd: varje användare kan bara läsa och skriva sina egna rader.

create table if not exists public.items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('place', 'log', 'route', 'feedback')),
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  -- när ändringen gjordes på enheten (avgör vilken version som vinner)
  changed_at timestamptz not null default now(),
  -- när servern tog emot den (sätts alltid av servern – används för att hämta nyheter)
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create or replace function public.items_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items for each row execute function public.items_touch();

create index if not exists items_user_updated on public.items (user_id, updated_at);

alter table public.items enable row level security;

drop policy if exists "egna rader – läsa" on public.items;
drop policy if exists "egna rader – skapa" on public.items;
drop policy if exists "egna rader – ändra" on public.items;
drop policy if exists "egna rader – ta bort" on public.items;
create policy "egna rader – läsa"    on public.items for select to authenticated using ((select auth.uid()) = user_id);
create policy "egna rader – skapa"   on public.items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "egna rader – ändra"   on public.items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "egna rader – ta bort" on public.items for delete to authenticated using ((select auth.uid()) = user_id);

-- Foton från dagboken: privat lagring, en mapp per användare (<user_id>/<foto-id>)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "egna foton – läsa" on storage.objects;
drop policy if exists "egna foton – ladda upp" on storage.objects;
drop policy if exists "egna foton – ta bort" on storage.objects;
create policy "egna foton – läsa" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "egna foton – ladda upp" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "egna foton – ta bort" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
