import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import {
  acknowledgePlaySubscription,
  getVerifiedPlaySubscription,
  GOOGLE_PLAY_PACKAGE_NAME,
  hashText,
} from '../_shared/google-play-subscriptions.ts';

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function decodeMessage(value: string) {
  const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST for Play notifications.' }, 405);

  const audience = Deno.env.get('GOOGLE_PLAY_RTDN_AUDIENCE');
  const serviceAccountEmail = Deno.env.get('GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL');
  if (!audience || !serviceAccountEmail) {
    console.error('Google Play RTDN authentication is not configured.');
    return jsonResponse({ error: 'Play notification authentication is not configured.' }, 503);
  }
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return jsonResponse({ error: 'A signed Google Pub/Sub request is required.' }, 401);

  try {
    const { payload } = await jwtVerify(bearer, googleJwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    });
    if (payload.email !== serviceAccountEmail || payload.email_verified !== true) {
      return jsonResponse({ error: 'The Pub/Sub service account is not authorized.' }, 401);
    }
  } catch {
    return jsonResponse({ error: 'The Google Pub/Sub authorization token is invalid.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Google Play RTDN database access is not configured.');
    return jsonResponse({ error: 'Play notification storage is not configured.' }, 503);
  }

  let envelope: unknown;
  try {
    envelope = await request.json();
  } catch {
    return jsonResponse({ error: 'The Pub/Sub notification body is not valid JSON.' }, 400);
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || !('message' in envelope) || !envelope.message || typeof envelope.message !== 'object'
    || Array.isArray(envelope.message)) {
    return jsonResponse({ error: 'The Pub/Sub notification has no message.' }, 400);
  }
  const message = envelope.message as Record<string, unknown>;
  if (typeof message.messageId !== 'string' || typeof message.data !== 'string') {
    return jsonResponse({ error: 'The Pub/Sub message is incomplete.' }, 400);
  }

  let event: Record<string, unknown>;
  try {
    event = decodeMessage(message.data);
  } catch {
    return jsonResponse({ error: 'The Play notification payload is invalid.' }, 400);
  }
  if (event.packageName !== GOOGLE_PLAY_PACKAGE_NAME) {
    return jsonResponse({ error: 'The Play notification package does not match KAYAN Driver.' }, 400);
  }
  if (event.testNotification) return new Response(null, { status: 204 });

  const subscriptionNotification = event.subscriptionNotification;
  const voidedPurchaseNotification = event.voidedPurchaseNotification;
  const purchaseToken = subscriptionNotification && typeof subscriptionNotification === 'object'
    ? (subscriptionNotification as Record<string, unknown>).purchaseToken
    : voidedPurchaseNotification && typeof voidedPurchaseNotification === 'object'
      ? (voidedPurchaseNotification as Record<string, unknown>).purchaseToken
      : null;
  if (typeof purchaseToken !== 'string' || purchaseToken.length < 1 || purchaseToken.length > 8192) {
    return new Response(null, { status: 204 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: previouslyProcessed, error: dedupeReadError } = await admin
    .from('google_play_rtdn_messages')
    .select('message_id')
    .eq('message_id', message.messageId)
    .maybeSingle();
  if (dedupeReadError) {
    console.error('Could not check Play notification de-duplication.', { message: dedupeReadError.message });
    return jsonResponse({ error: 'Could not check notification history.' }, 500);
  }
  if (previouslyProcessed) return new Response(null, { status: 204 });

  const tokenHash = await hashText(purchaseToken);
  const { data: storedSubscription, error: storedError } = await admin
    .from('driver_subscriptions')
    .select('driver_id, plan, product_id, obfuscated_account_id, started_at')
    .eq('purchase_token_hash', tokenHash)
    .maybeSingle();
  if (storedError) {
    console.error('Could not find the Play subscription record for a notification.', { message: storedError.message });
    return jsonResponse({ error: 'Could not load the subscription record.' }, 500);
  }
  if (!storedSubscription) return new Response(null, { status: 204 });

  try {
    let verified;
    try {
      verified = await getVerifiedPlaySubscription(purchaseToken, storedSubscription.product_id);
    } catch (error) {
      if (!(error instanceof Error) || !('status' in error) || error.status !== 404 || !voidedPurchaseNotification) {
        throw error;
      }
      verified = {
        plan: storedSubscription.plan,
        productId: storedSubscription.product_id,
        status: 'revoked' as const,
        startedAt: storedSubscription.started_at,
        expiresAt: new Date().toISOString(),
        autoRenewEnabled: false,
        obfuscatedAccountId: storedSubscription.obfuscated_account_id,
        acknowledgementPending: false,
      };
    }
    if (verified.obfuscatedAccountId !== storedSubscription.obfuscated_account_id) {
      console.error('A Play notification account identifier did not match its stored subscription.');
      return new Response(null, { status: 204 });
    }
    if (verified.acknowledgementPending
      && ['active', 'cancelled', 'grace_period'].includes(verified.status)) {
      await acknowledgePlaySubscription(purchaseToken, verified.productId);
    }

    const { error: recordError } = await admin.rpc('record_verified_driver_subscription', {
      p_driver_id: storedSubscription.driver_id,
      p_plan: verified.plan,
      p_product_id: verified.productId,
      p_purchase_token_hash: tokenHash,
      p_obfuscated_account_id: verified.obfuscatedAccountId,
      p_status: verified.status,
      p_started_at: verified.startedAt,
      p_expires_at: verified.expiresAt,
      p_auto_renew_enabled: verified.autoRenewEnabled,
    });
    if (recordError) {
      console.error('Could not update a Play subscription from RTDN.', { message: recordError.message });
      return jsonResponse({ error: 'Could not update the subscription.' }, 500);
    }
  } catch (error) {
    console.error('Could not process Google Play subscription notification.', {
      message: error instanceof Error ? error.message : 'Unknown notification error.',
    });
    return jsonResponse({ error: 'Could not verify the Play notification.' }, 500);
  }

  const { error: dedupeWriteError } = await admin
    .from('google_play_rtdn_messages')
    .insert({ message_id: message.messageId });
  if (dedupeWriteError && dedupeWriteError.code !== '23505') {
    console.error('Could not save Play notification de-duplication.', { message: dedupeWriteError.message });
    return jsonResponse({ error: 'Could not save notification history.' }, 500);
  }
  return new Response(null, { status: 204 });
});
