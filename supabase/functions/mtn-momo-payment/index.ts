import { createClient } from 'npm:@supabase/supabase-js@2';

type PaymentStatus = 'pending' | 'successful' | 'failed';
type PaymentAction = 'pay' | 'status';
type PaymentRequest = {
  action?: unknown;
  ride_id?: unknown;
  msisdn?: unknown;
  retry?: unknown;
};
type RideRecord = {
  id: string;
  passenger_id: string;
  fare_zmw: number;
  status: string;
  payment_method: string;
};
type PaymentRecord = {
  id: string;
  reference_id: string;
  amount_zmw: number;
  status: PaymentStatus;
  failure_reason: string | null;
  created_at: string;
};
type TokenResponse = {
  access_token?: string;
  expires_in?: number;
};
type MomoStatusResponse = {
  status?: string;
  reason?: string;
  financialTransactionId?: string;
};

const momoBaseUrl = 'https://sandbox.momodeveloper.mtn.com';
const targetEnvironment = 'sandbox';
const currency = 'ZMW';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let cachedToken: { value: string; expiresAt: number } | null = null;

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function normalizeMsisdn(value: unknown) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s()+-]/g, '');
  const normalized = digits.startsWith('0')
    ? `260${digits.slice(1)}`
    : digits.startsWith('260')
      ? digits
      : `260${digits}`;
  return /^260\d{9}$/.test(normalized) ? normalized : null;
}

async function getAccessToken(subscriptionKey: string, apiUser: string, apiKey: string) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const response = await fetch(`${momoBaseUrl}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${apiUser}:${apiKey}`)}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  });
  if (!response.ok) {
    throw new Error(`MTN MoMo could not issue an access token (HTTP ${response.status}).`);
  }
  const result = await response.json() as TokenResponse;
  if (!result.access_token || !Number.isFinite(result.expires_in) || !result.expires_in) {
    throw new Error('MTN MoMo returned an invalid access token response.');
  }
  cachedToken = {
    value: result.access_token,
    expiresAt: Date.now() + result.expires_in * 1000,
  };
  return result.access_token;
}

async function updatePaymentStatus(
  admin: ReturnType<typeof createClient>,
  payment: PaymentRecord,
  accessToken: string,
  subscriptionKey: string,
) {
  const response = await fetch(
    `${momoBaseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(payment.reference_id)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'X-Target-Environment': targetEnvironment,
      },
    },
  );
  if (response.status === 404) {
    if (Date.now() - Date.parse(payment.created_at) < 60_000) {
      return { status: 'pending' as const, reason: 'Waiting for MTN MoMo to register the payment request.' };
    }
    const failureReason = 'MTN MoMo did not find this payment request. You can try again.';
    const { error } = await admin.from('mtn_momo_payments').update({
      status: 'failed',
      failure_reason: failureReason,
    }).eq('id', payment.id);
    if (error) throw new Error('Could not save the MTN MoMo payment status.');
    return { status: 'failed' as const, reason: failureReason };
  }
  if (!response.ok) throw new Error(`MTN MoMo status check failed (HTTP ${response.status}).`);

  const result = await response.json() as MomoStatusResponse;
  const providerStatus = result.status?.toUpperCase();
  if (!providerStatus || !['SUCCESSFUL', 'FAILED', 'REJECTED', 'PENDING'].includes(providerStatus)) {
    throw new Error('MTN MoMo returned an unsupported payment status.');
  }
  const status: PaymentStatus = providerStatus === 'SUCCESSFUL'
    ? 'successful'
    : providerStatus === 'FAILED' || providerStatus === 'REJECTED'
      ? 'failed'
      : 'pending';
  const reason = status === 'failed'
    ? (result.reason?.slice(0, 256) || 'MTN MoMo did not complete this payment.')
    : null;
  const { error } = await admin.from('mtn_momo_payments').update({
    status,
    failure_reason: reason,
    financial_transaction_id: result.financialTransactionId ?? null,
  }).eq('id', payment.id);
  if (error) throw new Error('Could not save the MTN MoMo payment status.');
  return { status, reason };
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
  const subscriptionKey = Deno.env.get('MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY');
  const apiUser = Deno.env.get('MTN_MOMO_API_USER');
  const apiKey = Deno.env.get('MTN_MOMO_API_KEY');
  if (!authorization) return jsonResponse({ error: 'Sign in to manage this payment.' }, 401);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !subscriptionKey || !apiUser || !apiKey) {
    console.error('MTN MoMo payment configuration is incomplete.');
    return jsonResponse({ error: 'MTN MoMo sandbox payments are not configured on the server.' }, 503);
  }

  const passengerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await passengerClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Sign in to manage this payment.' }, 401);

  let input: PaymentRequest;
  try {
    input = await request.json() as PaymentRequest;
  } catch {
    return jsonResponse({ error: 'The MTN MoMo payment request is invalid.' }, 400);
  }
  const action = input.action;
  const rideId = typeof input.ride_id === 'string' ? input.ride_id : '';
  if ((action !== 'pay' && action !== 'status') || !/^[0-9a-f-]{36}$/i.test(rideId)) {
    return jsonResponse({ error: 'Choose a valid ride and payment action.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: ride, error: rideError } = await admin
    .from('ride_requests')
    .select('id, passenger_id, fare_zmw, status, payment_method')
    .eq('id', rideId)
    .eq('passenger_id', userData.user.id)
    .maybeSingle();
  if (rideError) {
    console.error('Could not verify the passenger ride for MTN MoMo payment.', { message: rideError.message });
    return jsonResponse({ error: 'Could not verify this ride for payment.' }, 500);
  }
  if (!ride || ride.status !== 'completed' || ride.payment_method !== 'MTN MoMo') {
    return jsonResponse({ error: 'MTN MoMo payment is available only for your completed rides booked with MTN MoMo.' }, 409);
  }

  const { data: existing, error: existingError } = await admin
    .from('mtn_momo_payments')
    .select('id, reference_id, amount_zmw, status, failure_reason, created_at')
    .eq('ride_id', ride.id)
    .eq('passenger_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    if (existingError.code === '42P01' || existingError.code === 'PGRST205') {
      return jsonResponse({ error: 'The MTN MoMo payment migration is not installed. Apply the latest supabase/migrations files, then retry.' }, 503);
    }
    console.error('Could not check the existing MTN MoMo payment.', { message: existingError.message });
    return jsonResponse({ error: 'Could not check the existing payment status.' }, 500);
  }

  if (existing?.status === 'successful') {
    return jsonResponse({ status: 'successful', amount_zmw: Number(existing.amount_zmw) }, 200);
  }
  if (existing?.status === 'pending') {
    try {
      const accessToken = await getAccessToken(subscriptionKey, apiUser, apiKey);
      const current = await updatePaymentStatus(admin, existing, accessToken, subscriptionKey);
      return jsonResponse({
        ...current,
        amount_zmw: Number(existing.amount_zmw),
      }, 200);
    } catch (error) {
      console.error('Could not refresh the MTN MoMo payment status.', error);
      return jsonResponse({
        error: error instanceof Error ? error.message : 'Could not refresh the MTN MoMo payment status.',
      }, 502);
    }
  }
  if (action === 'status' || (existing?.status === 'failed' && input.retry !== true)) {
    return jsonResponse({
      status: existing?.status ?? 'not_started',
      amount_zmw: Number(ride.fare_zmw),
      reason: existing?.failure_reason ?? null,
    }, 200);
  }

  const msisdn = normalizeMsisdn(input.msisdn);
  if (!msisdn) return jsonResponse({ error: 'Enter a valid Zambian MTN MoMo number, such as 0971234567 or +260971234567.' }, 400);

  let accessToken: string;
  try {
    accessToken = await getAccessToken(subscriptionKey, apiUser, apiKey);
  } catch (error) {
    console.error('Could not authenticate with MTN MoMo.', error);
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Could not authenticate with MTN MoMo.',
    }, 502);
  }

  const referenceId = crypto.randomUUID();
  const amount = Number(ride.fare_zmw);
  const { data: payment, error: insertError } = await admin
    .from('mtn_momo_payments')
    .insert({
      ride_id: ride.id,
      passenger_id: userData.user.id,
      reference_id: referenceId,
      amount_zmw: amount,
      status: 'pending',
    })
    .select('id, reference_id, amount_zmw, status, failure_reason, created_at')
    .single();
  if (insertError || !payment) {
    if (insertError?.code === '23505') {
      return jsonResponse({ error: 'A payment request is already in progress for this ride. Check its status before trying again.' }, 409);
    }
    console.error('Could not create the MTN MoMo payment record.', { message: insertError?.message });
    return jsonResponse({ error: 'Could not prepare this payment request.' }, 500);
  }

  const providerResponse = await fetch(`${momoBaseUrl}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': targetEnvironment,
    },
    body: JSON.stringify({
      amount: amount.toFixed(2),
      currency,
      externalId: referenceId.replaceAll('-', ''),
      payer: { partyIdType: 'MSISDN', partyId: msisdn },
      payerMessage: 'KAYAN completed ride payment',
      payeeNote: `KAYAN ride ${ride.id.slice(0, 8)}`,
    }),
  }).catch(error => {
    console.error('MTN MoMo request-to-pay connection failed.', error);
    return null;
  });

  if (!providerResponse) {
    return jsonResponse({
      status: 'pending',
      amount_zmw: amount,
      message: 'The request result is not confirmed. Check its status before retrying.',
    }, 202);
  }
  if (!providerResponse.ok) {
    const failureReason = `MTN MoMo rejected the request (HTTP ${providerResponse.status}).`;
    if (providerResponse.status >= 500) {
      return jsonResponse({
        status: 'pending',
        amount_zmw: amount,
        message: 'MTN MoMo could not confirm the request. Check its status before retrying.',
      }, 202);
    }
    const { error } = await admin.from('mtn_momo_payments').update({
      status: 'failed',
      failure_reason: failureReason,
    }).eq('id', payment.id);
    if (error) {
      console.error('Could not save a rejected MTN MoMo payment.', { message: error.message });
      return jsonResponse({ error: 'MTN MoMo rejected the payment request, and its status could not be saved.' }, 500);
    }
    return jsonResponse({ status: 'failed', amount_zmw: amount, reason: failureReason }, 502);
  }

  return jsonResponse({
    status: 'pending',
    amount_zmw: amount,
    message: 'Approve the MTN MoMo prompt on your phone.',
  }, 202);
});
