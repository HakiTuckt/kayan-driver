import { createClient } from 'npm:@supabase/supabase-js@2';

type RideRequestInput = {
  pickup?: unknown;
  destination?: unknown;
  category?: unknown;
  payment_method?: unknown;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type OAuthResponse = { access_token?: string; expires_in?: number; error?: string };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const destinations: Record<string, { distanceKm: number; classicFare: number }> = {
  'Manda Hill Mall': { distanceKm: 3.8, classicFare: 65 },
  'EastPark Mall': { distanceKm: 6.2, classicFare: 95 },
  'Kenneth Kaunda Airport': { distanceKm: 24, classicFare: 290 },
  'Levy Junction Mall': { distanceKm: 2.5, classicFare: 50 },
  'University of Zambia': { distanceKm: 7.1, classicFare: 110 },
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function encodeBase64Url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodePem(value: string) {
  const base64 = value.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function getFcmAccessToken(serviceAccount: ServiceAccount) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertionHeader = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const assertionClaims = encodeBase64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsignedAssertion = `${assertionHeader}.${assertionClaims}`;
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(serviceAccount.private_key.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(unsignedAssertion),
  );
  const assertion = `${unsignedAssertion}.${encodeBase64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const result = await response.json() as OAuthResponse;
  if (!response.ok || !result.access_token || !result.expires_in) {
    throw new Error(`Google OAuth token exchange failed (${response.status}).`);
  }

  cachedAccessToken = {
    token: result.access_token,
    expiresAt: Date.now() + result.expires_in * 1000,
  };
  return result.access_token;
}

async function sendPush(serviceAccount: ServiceAccount, token: string, offerId: string, destination: string) {
  const accessToken = await getFcmAccessToken(serviceAccount);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: 'New KAYAN ride offer',
            body: `A passenger is travelling to ${destination}. Tap to review the offer.`,
          },
          data: { offer_id: offerId },
          android: {
            priority: 'HIGH',
            notification: { channel_id: 'ride_offers' },
          },
        },
      }),
    },
  );
  const payload = await response.json().catch(() => null) as {
    error?: { details?: Array<{ errorCode?: string }> };
  } | null;

  if (response.status === 404 || payload?.error?.details?.some(detail => detail.errorCode === 'UNREGISTERED')) {
    return { sent: false, invalid: true };
  }
  if (!response.ok) {
    console.error('FCM rejected a ride-offer notification.', { status: response.status });
    return { sent: false, invalid: false };
  }
  return { sent: true, invalid: false };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization) {
    return jsonResponse({ error: 'Sign in to submit a ride request.' }, 401);
  }
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Required Supabase authorization or server configuration is missing.');
    return jsonResponse({ error: 'Ride requests are not configured.' }, 500);
  }

  const passengerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await passengerClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Sign in to submit a ride request.' }, 401);

  let input: RideRequestInput;
  try {
    input = await request.json() as RideRequestInput;
  } catch {
    return jsonResponse({ error: 'The ride request body is invalid.' }, 400);
  }

  const pickup = typeof input.pickup === 'string' ? input.pickup.trim() : '';
  const destinationName = typeof input.destination === 'string' ? input.destination.trim() : '';
  const category = input.category;
  const paymentMethod = input.payment_method ?? 'Cash';
  const destination = destinations[destinationName];
  if (!pickup || pickup.length > 160 || !destination || (category !== 'KAYAN Classic' && category !== 'KAYAN Comfort')
    || typeof paymentMethod !== 'string' || !['Cash', 'MTN MoMo', 'Airtel Money', 'Zamtel Kwacha'].includes(paymentMethod)) {
    return jsonResponse({ error: 'Choose a supported destination and ride category, and enter a valid pickup location.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: activeRide, error: activeRideError } = await supabase
    .from('ride_requests')
    .select('id, status')
    .eq('passenger_id', userData.user.id)
    .in('status', ['searching', 'accepted'])
    .maybeSingle();
  if (activeRideError) {
    console.error('Could not check for an active passenger ride.', { message: activeRideError.message });
    return jsonResponse({ error: 'Could not check for an active ride request.' }, 500);
  }
  if (activeRide) {
    return jsonResponse({ error: 'You already have an active ride request.', request_id: activeRide.id, status: activeRide.status }, 409);
  }

  const fare = destination.classicFare + (category === 'KAYAN Comfort' ? 30 : 0);
  const { data: ride, error: rideError } = await supabase
    .from('ride_requests')
    .insert({
      passenger_id: userData.user.id,
      pickup,
      destination: destinationName,
      category,
      payment_method: paymentMethod,
      distance_km: destination.distanceKm,
      fare_zmw: fare,
    })
    .select('id, created_at')
    .single();
  if (rideError || !ride) {
    if (rideError?.code === '23505') {
      return jsonResponse({ error: 'You already have an active ride request.' }, 409);
    }
    if (rideError?.code === 'PGRST204' || rideError?.code === '42703') {
      return jsonResponse({ error: 'The Passenger ride/payment migration is not installed. Apply the latest supabase/migrations files, then retry.' }, 503);
    }
    console.error('Could not create a ride request.', { message: rideError?.message });
    return jsonResponse({ error: 'Could not create the ride request.' }, 500);
  }

  const abandonRideRequest = async (reason: string) => {
    const { error } = await supabase
      .from('ride_requests')
      .update({ status: 'cancelled' })
      .eq('id', ride.id)
      .eq('status', 'searching');
    if (error) console.error(reason, { message: error.message, rideId: ride.id });
  };

  const { data: available, error: availabilityError } = await supabase
    .from('driver_availability')
    .select('driver_id, updated_at')
    .eq('is_online', true);
  if (availabilityError) {
    console.error('Could not look up online drivers.', { message: availabilityError.message });
    await abandonRideRequest('Could not cancel a ride after availability lookup failed.');
    return jsonResponse({ error: 'The ride request was created, but available drivers could not be checked.' }, 500);
  }

  const staleBefore = new Date(Date.now() - 90_000).toISOString();
  const availableIds = (available ?? [])
    .filter(row => row.updated_at > staleBefore)
    .map(row => row.driver_id);
  let eligibleIds: string[] = [];
  if (availableIds.length) {
    const { data: activeDrivers, error: driversError } = await supabase
      .from('driver_profiles')
      .select('id')
      .eq('account_status', 'active')
      .in('id', availableIds);
    if (driversError) {
      console.error('Could not verify eligible drivers.', { message: driversError.message });
      await abandonRideRequest('Could not cancel a ride after driver eligibility lookup failed.');
      return jsonResponse({ error: 'The ride request was created, but eligible drivers could not be checked.' }, 500);
    }

    const activeIds = (activeDrivers ?? []).map(driver => driver.id);
    if (activeIds.length) {
      const { data: driversOnRide, error: activeRidesError } = await supabase
        .from('ride_requests')
        .select('accepted_driver_id')
        .in('accepted_driver_id', activeIds)
        .eq('status', 'accepted');
      if (activeRidesError) {
        console.error('Could not check drivers already on rides.', { message: activeRidesError.message });
        await abandonRideRequest('Could not cancel a ride after active-driver lookup failed.');
        return jsonResponse({ error: 'The ride request was created, but driver availability could not be checked.' }, 500);
      }
      const driversInTrip = new Set((driversOnRide ?? []).map(ride => ride.accepted_driver_id));
      const { data: outstandingOffers, error: offersError } = await supabase
        .from('driver_ride_offers')
        .select('driver_id')
        .in('driver_id', activeIds)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      if (offersError) {
        console.error('Could not check outstanding driver offers.', { message: offersError.message });
        await abandonRideRequest('Could not cancel a ride after pending-offer lookup failed.');
        return jsonResponse({ error: 'The ride request was created, but driver availability could not be checked.' }, 500);
      }
      const occupied = new Set((outstandingOffers ?? []).map(offer => offer.driver_id));
      eligibleIds = activeIds.filter(id => !driversInTrip.has(id) && !occupied.has(id));
    }
  }

  if (!eligibleIds.length) {
    const { error: noDriversError } = await supabase
      .from('ride_requests')
      .update({ status: 'no_drivers' })
      .eq('id', ride.id);
    if (noDriversError) console.error('Could not mark a request with no eligible drivers.', { message: noDriversError.message });
    return jsonResponse({
      request_id: ride.id,
      created_at: ride.created_at,
      status: 'no_drivers',
      drivers_offered: 0,
      push_delivered: 0,
      push_warning: null,
    }, 201);
  }

  const offers: Array<{ id: string; driver_id: string }> = [];
  for (const driverId of eligibleIds) {
    const { data: offer, error: createOfferError } = await supabase
      .from('driver_ride_offers')
      .insert({ ride_id: ride.id, driver_id: driverId })
      .select('id, driver_id')
      .maybeSingle();
    if (createOfferError?.code === '23505') continue;
    if (createOfferError || !offer) {
      console.error('Could not create a driver offer.', { message: createOfferError?.message });
      await abandonRideRequest('Could not cancel a ride after driver-offer creation failed.');
      return jsonResponse({ error: 'The ride was created, but driver offers could not be created.' }, 500);
    }
    offers.push(offer);
  }

  if (!offers.length) {
    const { error: noDriversError } = await supabase
      .from('ride_requests')
      .update({ status: 'no_drivers' })
      .eq('id', ride.id);
    if (noDriversError) console.error('Could not mark a race-lost request with no eligible drivers.', { message: noDriversError.message });
    return jsonResponse({
      request_id: ride.id,
      created_at: ride.created_at,
      status: 'no_drivers',
      drivers_offered: 0,
      push_delivered: 0,
      push_warning: null,
    }, 201);
  }

  let pushDelivered = 0;
  let pushWarning: string | null = null;
  const serializedServiceAccount = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!serializedServiceAccount) {
    pushWarning = 'FCM is not configured; the in-app offer may still arrive while a driver is online.';
    console.error('FCM_SERVICE_ACCOUNT_JSON is not configured.');
  } else {
    let serviceAccount: ServiceAccount | null = null;
    try {
      serviceAccount = JSON.parse(serializedServiceAccount) as ServiceAccount;
      if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
        throw new Error('The service account is missing required fields.');
      }
    } catch (error) {
      console.error('FCM service-account configuration is invalid.', {
        message: error instanceof Error ? error.message : 'Unknown configuration error.',
      });
      pushWarning = 'FCM configuration is invalid; drivers may not receive background notifications.';
      serviceAccount = null;
    }

    if (serviceAccount) {
      const { data: tokens, error: tokensError } = await supabase
        .from('driver_push_tokens')
        .select('driver_id, token')
        .in('driver_id', eligibleIds);
      if (tokensError) {
        console.error('Could not load driver push tokens.', { message: tokensError.message });
        pushWarning = 'Driver offers were created, but push registrations could not be loaded.';
      } else {
        const offerIdsByDriver = new Map(offers.map(offer => [offer.driver_id, offer.id]));
        const outcomes = await Promise.all((tokens ?? []).map(async ({ driver_id, token }) => {
          try {
            const offerId = offerIdsByDriver.get(driver_id);
            if (!offerId) {
              console.error('A driver push token has no matching ride offer.', { driverId: driver_id });
              return false;
            }
            const outcome = await sendPush(serviceAccount, token, offerId, destinationName);
            if (outcome.invalid) {
              const { error: removeError } = await supabase.from('driver_push_tokens').delete().eq('token', token);
              if (removeError) console.error('Could not remove an expired driver push token.', { message: removeError.message });
            }
            return outcome.sent;
          } catch (error) {
            console.error('Could not send a ride-offer push notification.', {
              message: error instanceof Error ? error.message : 'Unknown FCM error.',
            });
            return false;
          }
        }));
        pushDelivered = outcomes.filter(Boolean).length;
        if (pushDelivered === 0) pushWarning = 'No push notification was delivered; the in-app offer may still arrive while a driver is online.';
      }
    }
  }

  return jsonResponse({
    request_id: ride.id,
    created_at: ride.created_at,
    status: 'searching',
    drivers_offered: offers.length,
    push_delivered: pushDelivered,
    push_warning: pushWarning,
  }, 201);
});
