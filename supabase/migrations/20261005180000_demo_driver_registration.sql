alter table public.driver_profiles
  add column is_demo boolean not null default true;

create unique index driver_vehicles_one_per_driver_idx
  on public.driver_vehicles (driver_id);

create function public.save_demo_driver_registration(
  p_full_name text,
  p_phone text,
  p_city text,
  p_make text,
  p_model text,
  p_year smallint,
  p_plate text,
  p_color text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_driver_id uuid := auth.uid();
begin
  if current_driver_id is null then
    raise exception 'A signed-in demo session is required.';
  end if;

  insert into public.driver_profiles (id, full_name, phone, city)
  values (current_driver_id, p_full_name, p_phone, p_city)
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      city = excluded.city;

  insert into public.driver_vehicles (driver_id, make, model, year, plate, color)
  values (current_driver_id, p_make, p_model, p_year, p_plate, p_color)
  on conflict (driver_id) do update
  set make = excluded.make,
      model = excluded.model,
      year = excluded.year,
      plate = excluded.plate,
      color = excluded.color;
end;
$$;

revoke all on function public.save_demo_driver_registration(text, text, text, text, text, smallint, text, text)
  from public, anon;
grant execute on function public.save_demo_driver_registration(text, text, text, text, text, smallint, text, text)
  to authenticated;

notify pgrst, 'reload schema';
