import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';

export type DriverPlan = 'free' | 'plus' | 'premium';
export type DriverSubscriptionStatus = 'free' | 'active' | 'cancelled' | 'grace_period';
export type DriverPlaySubscriptionStatus = Exclude<DriverSubscriptionStatus, 'free'> | 'on_hold' | 'paused' | 'expired' | 'revoked';

export type DriverMembershipSummary = {
  plan: DriverPlan;
  status: DriverSubscriptionStatus;
  starts_at: string | null;
  expires_at: string | null;
  auto_renew_enabled: boolean;
  commission_rate_bps: number;
  commission_due_zmw: number;
  premium_period_start: string | null;
  premium_period_end: string | null;
  premium_completed_trips: number;
};

export type DriverCommissionRecord = {
  ride_id: string;
  destination: string;
  completed_at: string;
  fare_zmw: number;
  commission_plan: DriverPlan;
  commission_rate_bps: number;
  commission_due_zmw: number;
};

export type DriverFuelReward = {
  reward_id: string;
  period_start: string;
  period_end: string;
  completed_trips: number;
  status: 'eligible' | 'issued';
  voucher_value_zmw: number | null;
  voucher_reference: string | null;
  issued_at: string | null;
};

export type AdminDriverFuelReward = DriverFuelReward & {
  driver_id: string;
  driver_name: string;
  driver_phone: string;
  period_number: number;
};

const driverPlanProductIds = ['kayan_driver_plus', 'kayan_driver_premium'] as const;

async function getFunctionErrorMessage(error: Error) {
  if (!(error instanceof FunctionsHttpError)) return error.message;
  try {
    const body: unknown = await error.context.clone().json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    return error.message;
  }
  return error.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function parseMembershipSummary(value: unknown): DriverMembershipSummary {
  if (!isRecord(value)
    || !['free', 'plus', 'premium'].includes(String(value.plan))
    || !['free', 'active', 'cancelled', 'grace_period'].includes(String(value.status))
    || !validDateOrNull(value.starts_at)
    || !validDateOrNull(value.expires_at)
    || typeof value.auto_renew_enabled !== 'boolean'
    || typeof value.commission_rate_bps !== 'number'
    || ![0, 500].includes(value.commission_rate_bps)
    || !Number.isFinite(Number(value.commission_due_zmw))
    || !validDateOrNull(value.premium_period_start)
    || !validDateOrNull(value.premium_period_end)
    || !Number.isInteger(Number(value.premium_completed_trips))
    || Number(value.premium_completed_trips) < 0) {
    throw new Error('The driver membership service returned an invalid summary.');
  }
  return {
    plan: value.plan as DriverPlan,
    status: value.status as DriverSubscriptionStatus,
    starts_at: value.starts_at,
    expires_at: value.expires_at,
    auto_renew_enabled: value.auto_renew_enabled,
    commission_rate_bps: value.commission_rate_bps,
    commission_due_zmw: Number(value.commission_due_zmw),
    premium_period_start: value.premium_period_start,
    premium_period_end: value.premium_period_end,
    premium_completed_trips: Number(value.premium_completed_trips),
  };
}

export async function getDriverMembershipSummary() {
  const { data, error } = await getSupabaseClient().rpc('get_driver_membership_summary');
  if (error) throw new Error(`Could not load driver membership: ${error.message}`);
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('The driver membership service returned an invalid summary.');
  }
  return parseMembershipSummary(data[0]);
}

export async function getDriverCommissionHistory(): Promise<DriverCommissionRecord[]> {
  const { data, error } = await getSupabaseClient().rpc('get_driver_commission_history');
  if (error) throw new Error(`Could not load commission history: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('The commission service returned an invalid history.');
  return data.map(item => {
    if (!isRecord(item) || typeof item.ride_id !== 'string' || typeof item.destination !== 'string'
      || !validDateOrNull(item.completed_at) || item.completed_at === null
      || !Number.isFinite(Number(item.fare_zmw))
      || !['free', 'plus', 'premium'].includes(String(item.commission_plan))
      || ![0, 500].includes(Number(item.commission_rate_bps))
      || !Number.isFinite(Number(item.commission_due_zmw))) {
      throw new Error('The commission service returned an invalid trip record.');
    }
    return {
      ride_id: item.ride_id,
      destination: item.destination,
      completed_at: item.completed_at,
      fare_zmw: Number(item.fare_zmw),
      commission_plan: item.commission_plan as DriverPlan,
      commission_rate_bps: Number(item.commission_rate_bps),
      commission_due_zmw: Number(item.commission_due_zmw),
    };
  });
}

export async function getDriverFuelRewards(): Promise<DriverFuelReward[]> {
  const { data, error } = await getSupabaseClient().rpc('get_driver_premium_fuel_rewards');
  if (error) throw new Error(`Could not load Premium fuel rewards: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('The fuel reward service returned an invalid history.');
  return data.map(item => {
    if (!isRecord(item) || typeof item.reward_id !== 'string'
      || !validDateOrNull(item.period_start) || item.period_start === null
      || !validDateOrNull(item.period_end) || item.period_end === null
      || !Number.isInteger(Number(item.completed_trips)) || Number(item.completed_trips) < 100
      || !['eligible', 'issued'].includes(String(item.status))
      || (item.voucher_value_zmw !== null && !Number.isFinite(Number(item.voucher_value_zmw)))
      || (item.voucher_reference !== null && typeof item.voucher_reference !== 'string')
      || !validDateOrNull(item.issued_at)) {
      throw new Error('The fuel reward service returned an invalid reward.');
    }
    return {
      reward_id: item.reward_id,
      period_start: item.period_start,
      period_end: item.period_end,
      completed_trips: Number(item.completed_trips),
      status: item.status as DriverFuelReward['status'],
      voucher_value_zmw: item.voucher_value_zmw === null ? null : Number(item.voucher_value_zmw),
      voucher_reference: item.voucher_reference,
      issued_at: item.issued_at,
    };
  });
}

export async function getDriverAccountToken() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw new Error(`Could not check the driver account before purchase: ${error.message}`);
  if (!data.user || data.user.is_anonymous) {
    throw new Error('Sign in to the approved driver account before buying a plan.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.user.id));
  const accountToken = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return accountToken;
}

export async function verifyDriverPlayPurchase(purchaseToken: string, productId: string) {
  if (!driverPlanProductIds.includes(productId as (typeof driverPlanProductIds)[number])) {
    throw new Error('This is not a KAYAN driver subscription product.');
  }
  const { data, error } = await getSupabaseClient().functions.invoke<{
    plan: 'plus' | 'premium';
    status: DriverPlaySubscriptionStatus;
    expires_at: string;
    auto_renew_enabled: boolean;
    entitled: boolean;
  }>('verify-driver-subscription', { body: { purchaseToken, productId } });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data || !['plus', 'premium'].includes(data.plan)
    || !['active', 'cancelled', 'grace_period', 'on_hold', 'paused', 'expired', 'revoked'].includes(data.status)
    || !Number.isFinite(Date.parse(data.expires_at))
    || typeof data.auto_renew_enabled !== 'boolean'
    || typeof data.entitled !== 'boolean') {
    throw new Error('The Play Store verification service returned an invalid response.');
  }
  return data;
}

export async function loadAdminDriverFuelRewards(): Promise<AdminDriverFuelReward[]> {
  const { data, error } = await getSupabaseClient().functions.invoke<{ rewards: unknown[] }>(
    'driver-subscription-admin',
    { body: { action: 'list_rewards' } },
  );
  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data || !Array.isArray(data.rewards)) throw new Error('The fuel reward admin service returned an invalid list.');
  return data.rewards.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.driver_id !== 'string'
      || typeof item.driver_name !== 'string' || typeof item.driver_phone !== 'string'
      || !Number.isInteger(Number(item.period_number))
      || !validDateOrNull(item.period_start) || item.period_start === null
      || !validDateOrNull(item.period_end) || item.period_end === null
      || !Number.isInteger(Number(item.completed_trips)) || Number(item.completed_trips) < 100
      || !['eligible', 'issued'].includes(String(item.status))
      || (item.voucher_value_zmw !== null && !Number.isFinite(Number(item.voucher_value_zmw)))
      || (item.voucher_reference !== null && typeof item.voucher_reference !== 'string')
      || !validDateOrNull(item.issued_at)) {
      throw new Error('The fuel reward admin service returned an invalid reward.');
    }
    return {
      reward_id: item.id,
      driver_id: item.driver_id,
      driver_name: item.driver_name,
      driver_phone: item.driver_phone,
      period_number: Number(item.period_number),
      period_start: item.period_start,
      period_end: item.period_end,
      completed_trips: Number(item.completed_trips),
      status: item.status as DriverFuelReward['status'],
      voucher_value_zmw: item.voucher_value_zmw === null ? null : Number(item.voucher_value_zmw),
      voucher_reference: item.voucher_reference,
      issued_at: item.issued_at,
    };
  });
}

export async function issueAdminDriverFuelReward(rewardId: string, valueZmw: number, reference: string) {
  const { data, error } = await getSupabaseClient().functions.invoke<{
    reward_id: string;
    status: 'issued';
  }>('driver-subscription-admin', {
    body: {
      action: 'issue_reward',
      reward_id: rewardId,
      voucher_value_zmw: valueZmw,
      voucher_reference: reference.trim() || null,
    },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.reward_id !== rewardId || data.status !== 'issued') {
    throw new Error('The fuel reward service did not confirm issuance.');
  }
}
