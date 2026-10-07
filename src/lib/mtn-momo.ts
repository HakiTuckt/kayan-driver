import { ensureAnonymousSupabaseSession, getSupabaseClient } from '@/lib/supabase';

export type MtnMomoPaymentStatus = 'not_started' | 'pending' | 'successful' | 'failed';
export type MtnMomoPaymentResult = {
  status: MtnMomoPaymentStatus;
  amount_zmw: number;
  reason?: string | null;
  message?: string;
};

function isMtnMomoPaymentResult(value: unknown): value is MtnMomoPaymentResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return ['not_started', 'pending', 'successful', 'failed'].includes(String(result.status))
    && typeof result.amount_zmw === 'number'
    && Number.isFinite(result.amount_zmw)
    && (result.reason === undefined || result.reason === null || typeof result.reason === 'string')
    && (result.message === undefined || typeof result.message === 'string');
}

async function invokePayment(body: Record<string, unknown>) {
  await ensureAnonymousSupabaseSession();
  const { data, error } = await getSupabaseClient()
    .functions
    .invoke<unknown>('mtn-momo-payment', { body });
  if (error) {
    let message = error.message;
    if (error.context instanceof Response) {
      const response = await error.context.clone().json().catch(() => null) as { error?: unknown } | null;
      if (typeof response?.error === 'string') message = response.error;
    }
    throw new Error(`MTN MoMo payment request failed: ${message}`);
  }
  if (!isMtnMomoPaymentResult(data)) throw new Error('MTN MoMo returned an invalid payment response.');
  return data;
}

export function requestMtnMomoPayment(rideId: string, msisdn: string, retry = false) {
  return invokePayment({ action: 'pay', ride_id: rideId, msisdn, retry });
}

export function checkMtnMomoPayment(rideId: string) {
  return invokePayment({ action: 'status', ride_id: rideId });
}
