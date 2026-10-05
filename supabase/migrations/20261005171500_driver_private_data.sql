create table public.driver_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  phone text not null check (char_length(trim(phone)) between 3 and 40),
  city text not null default 'Lusaka' check (char_length(trim(city)) between 1 and 100),
  account_status text not null default 'pending_review'
    check (account_status in ('pending_review', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  make text not null check (char_length(trim(make)) between 1 and 80),
  model text not null check (char_length(trim(model)) between 1 and 100),
  year smallint not null check (year between 1980 and 2100),
  plate text not null check (char_length(trim(plate)) between 1 and 32),
  color text not null check (char_length(trim(color)) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  document_type text not null
    check (document_type in ('drivers_license', 'national_registration_card', 'vehicle_registration', 'roadworthiness_certificate')),
  object_path text not null unique,
  review_status text not null default 'pending_review'
    check (review_status in ('pending_review', 'approved', 'rejected')),
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_documents_owner_path
    check (split_part(object_path, '/', 1) = driver_id::text)
);

create index driver_vehicles_driver_id_idx on public.driver_vehicles (driver_id);
create index driver_documents_driver_id_idx on public.driver_documents (driver_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger driver_profiles_set_updated_at
before update on public.driver_profiles
for each row execute function public.set_updated_at();

create trigger driver_vehicles_set_updated_at
before update on public.driver_vehicles
for each row execute function public.set_updated_at();

create trigger driver_documents_set_updated_at
before update on public.driver_documents
for each row execute function public.set_updated_at();

alter table public.driver_profiles enable row level security;
alter table public.driver_vehicles enable row level security;
alter table public.driver_documents enable row level security;

revoke all on public.driver_profiles, public.driver_vehicles, public.driver_documents
  from anon, authenticated;

grant select on public.driver_profiles, public.driver_vehicles, public.driver_documents
  to authenticated;
grant insert (id, full_name, phone, city) on public.driver_profiles to authenticated;
grant update (full_name, phone, city) on public.driver_profiles to authenticated;
grant insert (driver_id, make, model, year, plate, color) on public.driver_vehicles to authenticated;
grant update (make, model, year, plate, color) on public.driver_vehicles to authenticated;
grant insert (driver_id, document_type, object_path, expires_on) on public.driver_documents to authenticated;
grant update (document_type, object_path, expires_on) on public.driver_documents to authenticated;

create policy "Drivers can read their own profile"
on public.driver_profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "Drivers can create their own pending profile"
on public.driver_profiles for insert to authenticated
with check (
  (select auth.uid()) = id
  and account_status = 'pending_review'
);

create policy "Drivers can update their own pending profile"
on public.driver_profiles for update to authenticated
using ((select auth.uid()) = id and account_status = 'pending_review')
with check ((select auth.uid()) = id and account_status = 'pending_review');

create policy "Drivers can read their own vehicles"
on public.driver_vehicles for select to authenticated
using ((select auth.uid()) = driver_id);

create policy "Drivers can add their own vehicles"
on public.driver_vehicles for insert to authenticated
with check ((select auth.uid()) = driver_id);

create policy "Drivers can update their own vehicles"
on public.driver_vehicles for update to authenticated
using ((select auth.uid()) = driver_id)
with check ((select auth.uid()) = driver_id);

create policy "Drivers can read their own document records"
on public.driver_documents for select to authenticated
using ((select auth.uid()) = driver_id);

create policy "Drivers can add pending records for their own documents"
on public.driver_documents for insert to authenticated
with check (
  (select auth.uid()) = driver_id
  and review_status = 'pending_review'
  and split_part(object_path, '/', 1) = (select auth.uid())::text
);

create policy "Drivers can update their own pending document records"
on public.driver_documents for update to authenticated
using ((select auth.uid()) = driver_id and review_status = 'pending_review')
with check (
  (select auth.uid()) = driver_id
  and review_status = 'pending_review'
  and split_part(object_path, '/', 1) = (select auth.uid())::text
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Drivers can read their own private documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Drivers can upload into their own private folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Drivers can replace their own private documents"
on storage.objects for update to authenticated
using (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Drivers can delete their own private documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
