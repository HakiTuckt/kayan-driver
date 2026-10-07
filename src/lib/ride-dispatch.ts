import type { ActiveRide } from '@/components/BookingPanel';
import type { DemoRequest } from '@/components/driver/DriverTrip';
import { paymentOptions, type PaymentMethod } from '@/lib/passenger-preferences';
import { ensureAnonymousSupabaseSession, getSupabaseClient } from '@/lib/supabase';

export type RideRequestStatus = 'searching' | 'accepted' | 'cancelled' | 'completed' | 'no_drivers';
export type DriverRideStage = 0 | 1 | 2 | 3;
export type PassengerRideActivity = {
  id: string;
  created_at: string;
  pickup: string;
  destination: string;
  category: 'KAYAN Classic' | 'KAYAN Comfort';
  payment_method: PaymentMethod;
  distance_km: number;
  fare_zmw: number;
  status: RideRequestStatus;
  driver_stage: DriverRideStage;
  accepted_driver_id: string | null;
};
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
  driver_stage: DriverRideStage;
};

export type DriverLocationFix = {
  latitude: number;
  longitude: number;
  accuracy_m: number;
};

export type PassengerDriverLocation = DriverLocationFix & {
  ride_id: string;
  updated_at: string;
};

export type ActivePassengerRideRequest = {
  id: string;
  created_at: string;
  pickup: string;
  destination: string;
  category: 'KAYAN Classic' | 'KAYAN Comfort';
  fare_zmw: number;
  status: 'searching' | 'accepted';
  driver_stage: DriverRideStage;
};

function parseDriverRideStage(value: unknown): DriverRideStage | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3
    ? value as DriverRideStage
    : null;
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && paymentOptions.includes(value);
}

function rideStageErrorMessage(action: string, error: { code: string; message: string }) {
  const migrationMissing = (error.code === '42703' && (error.message.includes('driver_stage') || error.message.includes('payment_method')))
    || (error.code === 'PGRST204' && error.message.includes('payment_method'))
    || (error.code === 'PGRST202' && error.message.includes('update_driver_ride_stage'));
  if (migrationMissing) {
    return `${action}: a Passenger ride or payment migration is not installed. Apply the migrations in supabase/migrations in timestamp order in the KAYAN Supabase SQL Editor, then reload the app.`;
  }
  return `${action}: ${error.message}`;
}

export async function createPassengerRideRequest(ride: ActiveRide) {
  await ensureAnonymousSupabaseSession();
  const { data, error } = await getSupabaseClient()
    .functions
    .invoke<CreateRideRequestResponse>('create-ride-request', {
      body: {
        pickup: ride.pickup,
        destination: ride.destination.name,
        category: ride.category,
        payment_method: ride.payment,
      },
    });
  if (error) throw new Error(`Could not send this ride request: ${error.message}`);
  if (!data?.request_id || !data.created_at || !data.status) {
    throw new Error('The ride service returned an incomplete response. Check the request before trying again.');
  }
  return data;
}

export async function updateDriverRideStage(rideId: string, stage: DriverRideStage) {
  const { data, error } = await getSupabaseClient().rpc('update_driver_ride_stage', {
    p_ride_id: rideId,
    p_stage: stage,
  });
  if (error) throw new Error(rideStageErrorMessage('Could not update the passenger ride stage', error));
  if (data !== stage) throw new Error('The ride service did not confirm the driver stage update.');
}

export async function submitPassengerRideRating(rideId: string, rating: number): Promise<boolean> {
  await ensureAnonymousSupabaseSession();
  const { data, error } = await getSupabaseClient().rpc('submit_passenger_ride_rating', {
    p_ride_id: rideId,
    p_rating: rating,
  });
  if (error) throw new Error(`Could not submit your ride rating: ${error.message}`);
  if (typeof data !== 'boolean') throw new Error('The ride service returned an invalid rating response.');
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
    .select('id, created_at, pickup, destination, category, fare_zmw, status, driver_stage')
    .eq('passenger_id', passengerId)
    .in('status', ['searching', 'accepted'])
    .maybeSingle();
  if (error) throw new Error(rideStageErrorMessage('Could not restore the active passenger ride', error));
  if (!data || (data.category !== 'KAYAN Classic' && data.category !== 'KAYAN Comfort')
    || (data.status !== 'searching' && data.status !== 'accepted')) return null;
  const driverStage = parseDriverRideStage(data.driver_stage);
  if (driverStage === null) throw new Error('The ride service returned an invalid driver stage.');
  return {
    ...data,
    fare_zmw: Number(data.fare_zmw),
    status: data.status,
    driver_stage: driverStage,
  };
}

export async function loadPassengerRideActivity(): Promise<PassengerRideActivity[]> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Could not check the passenger session: ${sessionError.message}`);
  const passengerId = sessionData.session?.user.id;
  if (!passengerId) return [];

  const { data, error } = await supabase
    .from('ride_requests')
    .select('id, created_at, pickup, destination, category, payment_method, distance_km, fare_zmw, status, driver_stage, accepted_driver_id')
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(rideStageErrorMessage('Could not load passenger activity', error));

  return (data ?? []).map(ride => {
    const driverStage = parseDriverRideStage(ride.driver_stage);
    const distanceKm = Number(ride.distance_km);
    const fareZmw = Number(ride.fare_zmw);
    if (
      typeof ride.id !== 'string'
      || typeof ride.created_at !== 'string'
      || typeof ride.pickup !== 'string'
      || typeof ride.destination !== 'string'
      || (ride.category !== 'KAYAN Classic' && ride.category !== 'KAYAN Comfort')
      || !isPaymentMethod(ride.payment_method)
      || !['searching', 'accepted', 'cancelled', 'completed', 'no_drivers'].includes(ride.status)
      || driverStage === null
      || !Number.isFinite(distanceKm)
      || !Number.isFinite(fareZmw)
    ) {
      throw new Error('The ride service returned an invalid activity record.');
    }
    return {
      id: ride.id,
      created_at: ride.created_at,
      pickup: ride.pickup,
      destination: ride.destination,
      category: ride.category,
      payment_method: ride.payment_method,
      distance_km: distanceKm,
      fare_zmw: fareZmw,
      status: ride.status as RideRequestStatus,
      driver_stage: driverStage,
      accepted_driver_id: typeof ride.accepted_driver_id === 'string' ? ride.accepted_driver_id : null,
    };
  });
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

export async function updateDriverRideLocation(rideId: string, location: DriverLocationFix) {
  const { data, error } = await getSupabaseClient().rpc('update_driver_ride_location', {
    p_ride_id: rideId,
    p_latitude: location.latitude,
    p_longitude: location.longitude,
    p_accuracy_m: location.accuracy_m,
  });
  if (error) throw new Error(`Could not share the live ride location: ${error.message}`);
  if (data !== true) throw new Error('The ride service did not confirm the location update.');
}

function parsePassengerDriverLocation(row: Record<string, unknown>): PassengerDriverLocation | null {
  if (
    typeof row.ride_id !== 'string'
    || typeof row.latitude !== 'number'
    || typeof row.longitude !== 'number'
    || typeof row.accuracy_m !== 'number'
    || typeof row.updated_at !== 'string'
    || !Number.isFinite(row.latitude)
    || !Number.isFinite(row.longitude)
    || !Number.isFinite(row.accuracy_m)
    || !Number.isFinite(Date.parse(row.updated_at))
  ) return null;
  return {
    ride_id: row.ride_id,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy_m: row.accuracy_m,
    updated_at: row.updated_at,
  };
}

export async function loadPassengerDriverLocation(rideId: string): Promise<PassengerDriverLocation | null> {
  const { data, error } = await getSupabaseClient()
    .from('driver_ride_locations')
    .select('ride_id, latitude, longitude, accuracy_m, updated_at')
    .eq('ride_id', rideId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the driver location: ${error.message}`);
  if (!data) return null;
  const location = parsePassengerDriverLocation(data);
  if (!location) throw new Error('The ride service returned an invalid driver location.');
  return location;
}

export function subscribeToPassengerDriverLocation(
  rideId: string,
  onLocation: (location: PassengerDriverLocation) => void,
  onError: (message: string) => void,
) {
  const supabase = getSupabaseClient();
  const receiveLocation = (row: Record<string, unknown>) => {
    const location = parsePassengerDriverLocation(row);
    if (location) onLocation(location);
  };
  const channel = supabase
    .channel(`passenger-driver-location-${rideId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'driver_ride_locations',
        filter: `ride_id=eq.${rideId}`,
      },
      payload => receiveLocation(payload.new),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'driver_ride_locations',
        filter: `ride_id=eq.${rideId}`,
      },
      payload => receiveLocation(payload.new),
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError('Driver location updates could not be connected. Refresh the passenger app to check the map.');
      }
    });
  return () => {
    void supabase.removeChannel(channel).catch(error => {
      console.error('Could not stop the passenger driver-location listener:', error);
    });
  };
}

export async function loadPassengerRideStatus(rideId: string): Promise<PassengerRideUpdate | null> {
  const { data, error } = await getSupabaseClient()
    .from('ride_requests')
    .select('id, status, accepted_driver_id, driver_stage')
    .eq('id', rideId)
    .maybeSingle();
  if (error) throw new Error(rideStageErrorMessage('Could not check passenger ride status', error));
  if (!data || !['searching', 'accepted', 'cancelled', 'completed', 'no_drivers'].includes(data.status)) return null;
  const driverStage = parseDriverRideStage(data.driver_stage);
  if (driverStage === null) throw new Error('The ride service returned an invalid driver stage.');
  return {
    id: data.id,
    status: data.status as RideRequestStatus,
    accepted_driver_id: data.accepted_driver_id,
    driver_stage: driverStage,
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
    .select('id, pickup, destination, distance_km, fare_zmw, driver_stage')
    .eq('id', offer.ride_id)
    .eq('accepted_driver_id', driverId)
    .eq('status', 'accepted')
    .maybeSingle();
  if (rideError) throw new Error(rideStageErrorMessage('Could not restore the active passenger ride', rideError));
  if (!ride) return null;
  const driverStage = parseDriverRideStage(ride.driver_stage);
  if (driverStage === null) throw new Error('The active ride has an invalid driver stage.');

  return {
    id: ride.id,
    offerId: offer.id,
    live: true,
    passenger: 'KAYAN passenger',
    pickup: ride.pickup,
    destination: ride.destination,
    fare: Number(ride.fare_zmw),
    distance: `${Number(ride.distance_km).toFixed(1)} km`,
    stage: driverStage,
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
        const driverStage = parseDriverRideStage(row.driver_stage);
        if (
          typeof row.id === 'string'
          && typeof row.status === 'string'
          && ['searching', 'accepted', 'cancelled', 'completed', 'no_drivers'].includes(row.status)
        ) {
          if (driverStage === null) {
            onError(row.driver_stage === undefined
              ? `Ride status updates are unavailable: ${rideStageMigrationMessage}`
              : 'Ride status updates did not include a valid driver stage. Refresh the passenger app.');
            return;
          }
          onUpdate({
            id: row.id,
            status: row.status as RideRequestStatus,
            accepted_driver_id: typeof row.accepted_driver_id === 'string' ? row.accepted_driver_id : null,
            driver_stage: driverStage,
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
