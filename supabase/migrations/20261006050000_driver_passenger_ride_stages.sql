alter table public.ride_requests
  add column driver_stage smallint not null default 0
    check (driver_stage between 0 and 3);

create function public.update_driver_ride_stage(
  p_ride_id uuid,
  p_stage smallint
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_stage smallint;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to update a ride stage.';
  end if;
  if p_stage is null or p_stage not between 1 and 3 then
    raise exception 'Choose a valid next ride stage.';
  end if;

  select driver_stage
    into v_current_stage
    from public.ride_requests
    where id = p_ride_id
      and accepted_driver_id = (select auth.uid())
      and status = 'accepted'
    for update;
  if not found then
    raise exception 'This accepted ride is no longer available to your driver account.';
  end if;
  if p_stage <> v_current_stage + 1 then
    raise exception 'Ride stages must be completed in order. Refresh the trip and try again.';
  end if;

  update public.ride_requests
    set driver_stage = p_stage
    where id = p_ride_id
      and accepted_driver_id = (select auth.uid())
      and status = 'accepted';
  if not found then
    raise exception 'The passenger ride stage could not be updated.';
  end if;

  return p_stage;
end;
$$;

revoke all on function public.update_driver_ride_stage(uuid, smallint) from public, anon;
grant execute on function public.update_driver_ride_stage(uuid, smallint) to authenticated;

notify pgrst, 'reload schema';
