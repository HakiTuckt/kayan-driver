import type { ActiveRide } from '@/components/BookingPanel';
import type { DemoRequest } from '@/components/driver/DriverTrip';
import { ensureAnonymousSupabaseSession, getSupabaseClient } from '@/lib/supabase';

export type RideRequestStatus = 'searching' | 'accepted' | 'cancelled' | 'completed' | 'no_drivers';
export const liveDispatchEnabled = import.meta.env.VITE_ENABLE_LIVE_DISPATCH === 'true';

type CreateRideRequestResponse = {
  request_id: string;
  created_at: string;
  status: RideRequestStatus;
  drivers_offered: number;
  push_delivered: number;
  push_warning: string | null;
};

export type PassengerRideUpdate = {
  id: string;
  status: RideRequestStatus;
  accepted_driver_id: string | null;
};

export type ActivePassengerRideRequest = {
  id: string;
  created_at: string;
  pickup: string;
  destination: string;
  category: 'KAYAN Classic' | 'KAYAN Comfort';
  fare_zmw: number;
  status: 'searching' | 'accepted';
};

export async function createPassengerRideRequest(ride: ActiveRide) {
  await ensureAnonymousSupabaseSession();
  const { data, error } = await getSupabaseClient()
    .functions
    .invoke<CreateRideRequestResponse>('create-ride-request', {
      body: {
        pickup: ride.pickup,
        destination: ride.destination.name,
        category: ride.category,
      },
    });
  if (error) throw new Error(`Could not send this ride request: ${error.message}`);
  if (!data?.request_id || !data.created_at || !data.status) {
    throw new Error('The ride service returned an incomplete response. Check the request before trying again.');
  }
  return data;
}

export async function loadActivePassengerRideRequest(): Promise<ActivePassengerRideRequest | null> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Could not check the passenger session: ${sessionError.message}`);
  const passengerId = sessionData.session?.user.id;
  if (!passengerId) return null;

  const { data, error } = await supabase
    .from('ride_requests')
    .select('id, created_at, pickup, destination, category, fare_zmw, status')
    .eq('passenger_id', passengerId)
    .in('status', ['searching', 'accepted'])
    .maybeSingle();
  if (error) throw new Error(`Could not restore the active passenger ride: ${error.message}`);
  if (!data || (data.category !== 'KAYAN Classic' && data.category !== 'KAYAN Comfort')
    || (data.status !== 'searching' && data.status !== 'accepted')) return null;
  return {
    ...data,
    fare_zmw: Number(data.fare_zmw),
    status: data.status,
  };
}

export async function setDriverAvailability(isOnline: boolean) {
  const { data, error } = await getSupabaseClient().rpc('set_driver_availability', {
    p_is_online: isOnline,
  });
  if (error) throw new Error(error.message);
  if (data !== isOnline) throw new Error('The ride service did not confirm the driver availability change.');
}

export async function saveDriverPushToken(token: string) {
  const { error } = await getSupabaseClient().rpc('register_driver_push_token', {
    p_token: token,
  });
  if (error) throw new Error(`Could not save the driver push registration: ${error.message}`);
}

export async function respondToDriverOffer(offerId: string, accept: boolean) {
  const { data, error } = await getSupabaseClient().rpc('respond_to_driver_ride_offer', {
    p_offer_id: offerId,
    p_accept: accept,
  });
  if (error) throw new Error(`Could not respond to this ride offer: ${error.message}`);
  if (typeof data !== 'string') throw new Error('The ride service returned an invalid offer response.');
  return data;
}

export async function cancelPassengerRideRequest(rideId: string) {
  const { data, error } = await getSupabaseClient().rpc('cancel_passenger_ride_request', {
    p_ride_id: rideId,
  });
  if (error) throw new Error(`Could not cancel this ride request: ${error.message}`);
  return data === true;
}

export async function expirePassengerRideRequest(rideId: string) {
  const { data, error } = await getSupabaseClient().rpc('expire_passenger_ride_request', {
    p_ride_id: rideId,
  });
  if (error) throw new Error(`Could not update the expired ride request: ${error.message}`);
  return data === true;
}

export async function finishDriverRideRequest(rideId: string, cancelled: boolean) {
  const { data, error } = await getSupabaseClient().rpc('finish_driver_ride_request', {
    p_ride_id: rideId,
    p_cancelled: cancelled,
  });
  if (error) throw new Error(`Could not update the passenger ride status: ${error.message}`);
  return data === true;
}

export async function loadPassengerRideStatus(rideId: string): Promise<PassengerRideUpdate | null> {
  const { data, error } = await getSupabaseClient()
    .from('ride_requests')
    .select('id, status, accepted_driver_id')
    .eq('id', rideId)
    .maybeSingle();
  if (error) throw new Error(`Could not check passenger ride status: ${error.message}`);
  if (!data || !['searching', 'accepted', 'cancelled', 'completed', 'no_drivers'].includes(data.status)) return null;
  return {
    id: data.id,
    status: data.status as RideRequestStatus,
    accepted_driver_id: data.accepted_driver_id,
  };
}

export async function loadDriverOffer(offerId: string): Promise<DemoRequest | null> {
  const supabase = getSupabaseClient();
  const { data: offer, error: offerError } = await supabase
    .from('driver_ride_offers')
    .select('id, ride_id, status, expires_at')
    .eq('id', offerId)
    .maybeSingle();
  if (offerError) throw new Error(`Could not load the ride offer: ${offerError.message}`);
  if (!offer || offer.status !== 'pending' || new Date(offer.expires_at).getTime() <= Date.now()) return null;

  const { data: ride, error: rideError } = await supabase
    .from('ride_requests')
    .select('id, pickup, destination, distance_km, fare_zmw')
    .eq('id', offer.ride_id)
    .maybeSingle();
  if (rideError) throw new Error(`Could not load the passenger request: ${rideError.message}`);
  if (!ride) return null;

  return {
    id: ride.id,
    offerId: offer.id,
    live: true,
    passenger: 'KAYAN passenger',
    pickup: ride.pickup,
    destination: ride.destination,
    fare: Number(ride.fare_zmw),
    distance: `${Number(ride.distance_km).toFixed(1)} km`,
  };
}

export async function loadAcceptedDriverRide(driverId: string): Promise<DemoRequest | null> {
  const supabase = getSupabaseClient();
  const { data: offer, error: offerError } = await supabase
    .from('driver_ride_offers')
    .select('id, ride_id')
    .eq('driver_id', driverId)
    .eq('status', 'accepted')
    .maybeSingle();
  if (offerError) throw new Error(`Could not restore the active ride offer: ${offerError.message}`);
  if (!offer) return null;

  const { data: ride, error: rideError } = await supabase
    .from('ride_requests')
    .select('id, pickup, destination, distance_km, fare_zmw')
    .eq('id', offer.ride_id)
    .eq('accepted_driver_id', driverId)
    .eq('status', 'accepted')
    .maybeSingle();
  if (rideError) throw new Error(`Could not restore the active passenger ride: ${rideError.message}`);
  if (!ride) return null;

  return {
    id: ride.id,
    offerId: offer.id,
    live: true,
    passenger: 'KAYAN passenger',
    pickup: ride.pickup,
    destination: ride.destination,
    fare: Number(ride.fare_zmw),
    distance: `${Number(ride.distance_km).toFixed(1)} km`,
  };
}

export function subscribeToDriverOffers(
  driverId: string,
  onOffer: (offerId: string) => void,
  onError: (message: string) => void,
) {
  return getSupabaseClient()
    .channel(`driver-offers-${driverId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'driver_ride_offers',
        filter: `driver_id=eq.${driverId}`,
      },
      payload => {
        const offerId = payload.new.id;
        if (typeof offerId === 'string') onOffer(offerId);
      },
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError('Live ride offers could not be connected. Check the Supabase Realtime setup.');
      }
    });
}

export function subscribeToPassengerRide(
  rideId: string,
  onUpdate: (update: PassengerRideUpdate) => void,
  onError: (message: string) => void,
) {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`passenger-ride-${rideId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'ride_requests',
        filter: `id=eq.${rideId}`,
      },
      payload => {
        const row = payload.new;
        if (
          typeof row.id === 'string'
          && typeof row.status === 'string'
          && ['searching', 'accepted', 'cancelled', 'completed', 'no_drivers'].includes(row.status)
        ) {
          onUpdate({
            id: row.id,
            status: row.status as RideRequestStatus,
            accepted_driver_id: typeof row.accepted_driver_id === 'string' ? row.accepted_driver_id : null,
          });
        }
      },
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError('Ride status updates could not be connected. Refresh the passenger app to check the request.');
      }
    });
  return () => {
    void supabase.removeChannel(channel).catch(error => {
      console.error('Could not stop the passenger ride listener:', error);
    });
  };
}
