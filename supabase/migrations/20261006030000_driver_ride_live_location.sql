create table public.driver_ride_locations (
  ride_id uuid primary key references public.ride_requests (id) on delete cascade,
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision not null check (accuracy_m between 0 and 10000),
  updated_at timestamptz not null default now()
);

alter table public.driver_ride_locations enable row level security;
revoke all on public.driver_ride_locations from anon, authenticated;
grant select on public.driver_ride_locations to authenticated;

create policy "Participants can read location during their accepted ride"
on public.driver_ride_locations for select to authenticated
using (
  exists (
    select 1
    from public.ride_requests
    where id = driver_ride_locations.ride_id
      and status = 'accepted'
      and accepted_driver_id = driver_ride_locations.driver_id
      and (
        passenger_id = (select auth.uid())
        or accepted_driver_id = (select auth.uid())
      )
  )
);

create function public.update_driver_ride_location(
  p_ride_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to share driver location.';
  end if;
  if p_ride_id is null
    or p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_accuracy_m is null or p_accuracy_m not between 0 and 10000 then
    raise exception 'The driver location is invalid.';
  end if;
  if not exists (
    select 1
    from public.ride_requests
    where id = p_ride_id
      and accepted_driver_id = (select auth.uid())
      and status = 'accepted'
  ) then
    raise exception 'Location can only be shared during this driver’s accepted ride.';
  end if;

  insert into public.driver_ride_locations (
    ride_id, driver_id, latitude, longitude, accuracy_m, updated_at
  ) values (
    p_ride_id, (select auth.uid()), p_latitude, p_longitude, p_accuracy_m, now()
  )
  on conflict (ride_id) do update
    set driver_id = excluded.driver_id,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.update_driver_ride_location(uuid, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.update_driver_ride_location(uuid, double precision, double precision, double precision)
  to authenticated;

create function public.clear_inactive_driver_ride_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'accepted'
    and (
      new.status <> 'accepted'
      or new.accepted_driver_id is distinct from old.accepted_driver_id
    ) then
    delete from public.driver_ride_locations where ride_id = new.id;
  end if;
  return new;
end;
$$;

create trigger ride_requests_clear_driver_location
after update of status, accepted_driver_id on public.ride_requests
for each row execute function public.clear_inactive_driver_ride_location();

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.driver_ride_locations';
  exception
    when duplicate_object then null;
  end;
end;
$$;
