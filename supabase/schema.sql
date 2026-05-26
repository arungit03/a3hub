-- A3 Hub Supabase schema
-- Run this in the Supabase SQL editor before using the migrated app.

create table if not exists public.app_documents (
  path text primary key,
  collection_path text not null,
  document_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_documents_collection_path_idx
  on public.app_documents (collection_path);

create index if not exists app_documents_data_gin_idx
  on public.app_documents using gin (data);

create or replace function public.touch_app_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_documents_touch_updated_at on public.app_documents;
create trigger app_documents_touch_updated_at
before update on public.app_documents
for each row
execute function public.touch_app_documents_updated_at();

alter table public.app_documents enable row level security;

drop policy if exists "app documents read authenticated" on public.app_documents;
create policy "app documents read authenticated"
on public.app_documents
for select
to authenticated
using (true);

drop policy if exists "app documents insert authenticated" on public.app_documents;
create policy "app documents insert authenticated"
on public.app_documents
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "app documents update authenticated" on public.app_documents;
create policy "app documents update authenticated"
on public.app_documents
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "app documents delete authenticated" on public.app_documents;
create policy "app documents delete authenticated"
on public.app_documents
for delete
to authenticated
using (auth.uid() is not null);

create or replace function public.create_profile_document_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile jsonb;
begin
  profile := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  profile := profile
    || jsonb_build_object(
      'email', coalesce(new.email, ''),
      'status', coalesce(profile->>'status', 'active'),
      'role', coalesce(profile->>'role', 'student'),
      'createdAt', now()
    );

  insert into public.app_documents (path, collection_path, document_id, data)
  values ('users/' || new.id::text, 'users', new.id::text, profile)
  on conflict (path) do update
  set data = public.app_documents.data || excluded.data,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists create_profile_document_on_auth_user on auth.users;
create trigger create_profile_document_on_auth_user
after insert on auth.users
for each row
execute function public.create_profile_document_for_new_user();

insert into storage.buckets (id, name, public)
values ('a3hub', 'a3hub', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "a3hub storage read public" on storage.objects;
create policy "a3hub storage read public"
on storage.objects
for select
using (bucket_id = 'a3hub');

drop policy if exists "a3hub storage write authenticated" on storage.objects;
create policy "a3hub storage write authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'a3hub');

drop policy if exists "a3hub storage update authenticated" on storage.objects;
create policy "a3hub storage update authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'a3hub')
with check (bucket_id = 'a3hub');
