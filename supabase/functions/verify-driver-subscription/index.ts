import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  acknowledgePlaySubscription,
  driverPlayProducts,
  getVerifiedPlaySubscription,
  hashText,
} from '../_shared/google-play-subscriptions.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST to verify a subscription.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Sign in to the approved driver account before verifying a subscription.' }, 401);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'The subscription verification request is not valid JSON.' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return jsonResponse({ error: 'The subscription verification request must be an object.' }, 400);
  }
  const fields = input as Record<string, unknown>;
  if (typeof fields.purchaseToken !== 'string' || fields.purchaseToken.length < 1 || fields.purchaseToken.length > 8192
    || typeof fields.productId !== 'string' || !Object.hasOwn(driverPlayProducts, fields.productId)) {
    return jsonResponse({ error: 'Choose a valid KAYAN monthly driver subscription purchase.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'The subscription verification service is not configured.' }, 503);
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const driver = userData.user;
    if (userError || !driver || driver.is_anonymous) {
      return jsonResponse({ error: 'A signed-in driver account is required.' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from('driver_profiles')
      .select('id, account_status')
      .eq('id', driver.id)
      .maybeSingle();
    if (profileError) {
      console.error('Could not check subscription driver eligibility.', { message: profileError.message });
      return jsonResponse({ error: 'Could not verify the driver account.' }, 500);
    }
    if (!profile || profile.account_status !== 'active') {
      return jsonResponse({ error: 'Only approved KAYAN drivers can subscribe.' }, 403);
    }

    const verified = await getVerifiedPlaySubscription(fields.purchaseToken, fields.productId);
    const obfuscatedAccountId = await hashText(driver.id);
    if (verified.obfuscatedAccountId !== obfuscatedAccountId) {
      return jsonResponse({ error: 'This Play Store purchase is linked to a different driver account.' }, 403);
    }
    if (verified.status === 'active' || verified.status === 'cancelled' || verified.status === 'grace_period') {
      if (verified.acknowledgementPending) {
        await acknowledgePlaySubscription(fields.purchaseToken, verified.productId);
      }
    }

    const { data: subscriptionId, error: recordError } = await admin.rpc('record_verified_driver_subscription', {
      p_driver_id: driver.id,
      p_plan: verified.plan,
      p_product_id: verified.productId,
      p_purchase_token_hash: await hashText(fields.purchaseToken),
      p_obfuscated_account_id: verified.obfuscatedAccountId,
      p_status: verified.status,
      p_started_at: verified.startedAt,
      p_expires_at: verified.expiresAt,
      p_auto_renew_enabled: verified.autoRenewEnabled,
    });
    if (recordError || typeof subscriptionId !== 'string') {
      console.error('Could not save a verified driver subscription.', {
        code: recordError?.code,
        message: recordError?.message,
      });
      return jsonResponse({ error: 'Google Play confirmed the purchase, but KAYAN could not save its membership. Use Restore purchases or contact support before buying again.' }, 500);
    }

    return jsonResponse({
      plan: verified.plan,
      status: verified.status,
      expires_at: verified.expiresAt,
      auto_renew_enabled: verified.autoRenewEnabled,
      entitled: ['active', 'cancelled', 'grace_period'].includes(verified.status)
        && Date.parse(verified.expiresAt) > Date.now(),
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown verification failure.';
    console.error('Google Play subscription verification failed.', { message });
    if (message.includes('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured.')) {
      return jsonResponse({ error: 'Google Play server verification is not configured yet.' }, 503);
    }
    if (message.includes('payment is pending')) return jsonResponse({ error: message }, 409);
    if (message.includes('does not match a configured KAYAN')) {
      return jsonResponse({ error: message }, 400);
    }
    return jsonResponse({ error: 'Google Play could not verify this subscription. Check connectivity or contact support; do not purchase again yet.' }, 502);
  }
});
