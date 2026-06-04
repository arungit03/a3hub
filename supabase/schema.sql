-- ================================
-- TABLE
-- ================================
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

-- ================================
-- TRIGGER
-- ================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_timestamp on public.app_documents;

create trigger update_timestamp
before update on public.app_documents
for each row
execute function public.touch_updated_at();

-- ================================
-- ENABLE RLS
-- ================================
alter table public.app_documents enable row level security;

-- ================================
-- HELPER FUNCTIONS
-- ================================
create or replace function public.get_role(uid text)
returns text
language sql stable
as $$
  select coalesce(data->>'role','student')
  from public.app_documents
  where path = 'users/' || uid
  limit 1;
$$;

create or replace function public.is_admin(uid text)
returns boolean
language sql stable
as $$
  select exists(
    select 1 from public.app_documents
    where path = 'users/' || uid
    and data->>'role' = 'admin'
  );
$$;

create or replace function public.is_staff(uid text)
returns boolean
language sql stable
as $$
  select exists(
    select 1 from public.app_documents
    where path = 'users/' || uid
    and data->>'role' = 'staff'
  );
$$;

-- ================================
-- USERS POLICIES
-- ================================
drop policy if exists "users read" on public.app_documents;
create policy "users read"
on public.app_documents
for select
using (
  collection_path = 'users'
  and (
    auth.uid()::text = document_id
    or public.is_admin(auth.uid()::text)
    or public.is_staff(auth.uid()::text)
  )
);

drop policy if exists "users create" on public.app_documents;
create policy "users create"
on public.app_documents
for insert
with check (
  collection_path = 'users'
  and auth.uid()::text = document_id
);

drop policy if exists "users update" on public.app_documents;
create policy "users update"
on public.app_documents
for update
using (
  collection_path = 'users'
  and (
    auth.uid()::text = document_id
    or public.is_admin(auth.uid()::text)
  )
)
with check (
  collection_path = 'users'
);

drop policy if exists "users delete" on public.app_documents;
create policy "users delete"
on public.app_documents
for delete
using (
  collection_path = 'users'
  and public.is_admin(auth.uid()::text)
);

-- ================================
-- GENERAL CONTENT (Schedules, Notices etc.)
-- ================================
drop policy if exists "content read" on public.app_documents;
create policy "content read"
on public.app_documents
for select
using (
  auth.uid() is not null
);

drop policy if exists "content write" on public.app_documents;
create policy "content write"
on public.app_documents
for insert
with check (
  auth.uid() is not null
  and (
    public.is_admin(auth.uid()::text)
    or public.is_staff(auth.uid()::text)
  )
);

drop policy if exists "content update" on public.app_documents;
create policy "content update"
on public.app_documents
for update
using (
  auth.uid() is not null
)
with check (
  public.is_admin(auth.uid()::text)
  or public.is_staff(auth.uid()::text)
);

drop policy if exists "content delete" on public.app_documents;
create policy "content delete"
on public.app_documents
for delete
using (
  public.is_admin(auth.uid()::text)
  or public.is_staff(auth.uid()::text)
);

-- ================================
-- STORAGE (FILES)
-- ================================
insert into storage.buckets (id, name, public)
values ('a3hub', 'a3hub', true)
on conflict (id) do nothing;

drop policy if exists "storage read" on storage.objects;
create policy "storage read"
on storage.objects
for select
using (bucket_id = 'a3hub');

drop policy if exists "storage write" on storage.objects;
create policy "storage write"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'a3hub');

drop policy if exists "storage update" on storage.objects;
create policy "storage update"
on storage.objects
for update
to authenticated
using (bucket_id = 'a3hub')
with check (bucket_id = 'a3hub');