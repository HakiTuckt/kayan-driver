create table public.passenger_ride_ratings (
  ride_id uuid primary key references public.ride_requests (id) on delete cascade,
  passenger_id uuid not null references auth.users (id) on delete cascade,
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create index passenger_ride_ratings_driver_created_idx
  on public.passenger_ride_ratings (driver_id, created_at desc);

alter table public.passenger_ride_ratings enable row level security;
revoke all on public.passenger_ride_ratings from anon, authenticated;
grant select on public.passenger_ride_ratings to authenticated;

create policy "Ride participants can read their rating"
on public.passenger_ride_ratings for select to authenticated
using (
  passenger_id = (select auth.uid())
  or driver_id = (select auth.uid())
);

create function public.submit_passenger_ride_rating(
  p_ride_id uuid,
  p_rating integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to submit a ride rating.';
  end if;
  if p_ride_id is null or p_rating is null or p_rating not between 1 and 5 then
    raise exception 'The ride rating must be between 1 and 5.';
  end if;

  select accepted_driver_id
  into v_driver_id
  from public.ride_requests
  where id = p_ride_id
    and passenger_id = (select auth.uid())
    and status = 'completed';
  if not found or v_driver_id is null then
    raise exception 'Only the passenger can rate a completed ride with an assigned driver.';
  end if;

  insert into public.passenger_ride_ratings (ride_id, passenger_id, driver_id, rating)
  values (p_ride_id, (select auth.uid()), v_driver_id, p_rating)
  on conflict (ride_id) do nothing;

  return found;
end;
$$;

revoke all on function public.submit_passenger_ride_rating(uuid, integer) from public, anon;
grant execute on function public.submit_passenger_ride_rating(uuid, integer) to authenticated;
