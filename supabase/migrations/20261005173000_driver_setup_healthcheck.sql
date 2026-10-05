create or replace function public.driver_setup_healthcheck()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profiles_table', to_regclass('public.driver_profiles') is not null,
    'vehicles_table', to_regclass('public.driver_vehicles') is not null,
    'documents_table', to_regclass('public.driver_documents') is not null,
    'profiles_rls', coalesce((
      select relrowsecurity from pg_catalog.pg_class
      where oid = to_regclass('public.driver_profiles')
    ), false),
    'vehicles_rls', coalesce((
      select relrowsecurity from pg_catalog.pg_class
      where oid = to_regclass('public.driver_vehicles')
    ), false),
    'documents_rls', coalesce((
      select relrowsecurity from pg_catalog.pg_class
      where oid = to_regclass('public.driver_documents')
    ), false),
    'demo_registration_function', to_regprocedure(
      'public.save_demo_driver_registration(text,text,text,text,text,smallint,text,text)'
    ) is not null,
    'private_documents_bucket', exists (
      select 1 from storage.buckets
      where id = 'driver-documents' and public = false
    )
  );
$$;

revoke all on function public.driver_setup_healthcheck() from public;
grant execute on function public.driver_setup_healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';
