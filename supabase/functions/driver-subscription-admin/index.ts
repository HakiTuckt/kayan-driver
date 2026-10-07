import { createClient } from 'npm:@supabase/supabase-js@2';

type RewardRow = {
  id: string;
  driver_id: string;
  period_number: number;
  period_start: string;
  period_end: string;
  completed_trips: number;
  status: 'eligible' | 'issued';
  voucher_value_zmw: number | null;
  voucher_reference: string | null;
  issued_at: string | null;
  driver_profiles: { full_name: string; phone: string } | { full_name: string; phone: string }[];
};

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
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST for fuel reward administration.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Sign in as an authorized reviewer.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'The fuel reward admin service is not configured.' }, 503);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'The admin request is not valid JSON.' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return jsonResponse({ error: 'The admin request must be an object.' }, 400);
  }
  const fields = input as Record<string, unknown>;
  if (fields.action !== 'list_rewards' && fields.action !== 'issue_reward') {
    return jsonResponse({ error: 'Choose a valid fuel reward admin action.' }, 400);
  }
  if (fields.action === 'issue_reward' && (
    typeof fields.reward_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fields.reward_id)
    || typeof fields.voucher_value_zmw !== 'number'
    || !Number.isFinite(fields.voucher_value_zmw)
    || fields.voucher_value_zmw <= 0
    || fields.voucher_value_zmw > 9_999_999.99
    || (fields.voucher_reference !== undefined && fields.voucher_reference !== null
      && (typeof fields.voucher_reference !== 'string' || fields.voucher_reference.trim().length > 120))
  )) {
    return jsonResponse({ error: 'Enter a valid fuel voucher value, reward, and optional reference.' }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const reviewer = userData.user;
  if (userError || !reviewer || reviewer.is_anonymous || !reviewer.phone_confirmed_at) {
    return jsonResponse({ error: 'A verified reviewer phone account is required.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: reviewerRecord, error: reviewerError } = await admin
    .from('driver_application_reviewers')
    .select('user_id')
    .eq('user_id', reviewer.id)
    .eq('is_active', true)
    .maybeSingle();
  if (reviewerError) {
    console.error('Could not verify fuel reward reviewer access.', { message: reviewerError.message });
    return jsonResponse({ error: 'Could not verify reviewer access.' }, 500);
  }
  if (!reviewerRecord) return jsonResponse({ error: 'This phone account is not authorized to manage fuel rewards.' }, 403);

  if (fields.action === 'list_rewards') {
    const { data, error } = await admin
      .from('driver_premium_fuel_rewards')
      .select('id, driver_id, period_number, period_start, period_end, completed_trips, status, voucher_value_zmw, voucher_reference, issued_at, driver_profiles!inner(full_name, phone)')
      .order('period_end', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Could not load Premium fuel rewards.', { message: error.message });
      return jsonResponse({ error: 'Could not load fuel rewards.' }, 500);
    }
    return jsonResponse({
      rewards: ((data ?? []) as RewardRow[]).map(reward => {
        const profile = Array.isArray(reward.driver_profiles) ? reward.driver_profiles[0] : reward.driver_profiles;
        if (!profile) throw new Error('A fuel reward is missing its driver profile.');
        return {
          id: reward.id,
          driver_id: reward.driver_id,
          driver_name: profile.full_name,
          driver_phone: profile.phone,
          period_number: reward.period_number,
          period_start: reward.period_start,
          period_end: reward.period_end,
          completed_trips: reward.completed_trips,
          status: reward.status,
          voucher_value_zmw: reward.voucher_value_zmw,
          voucher_reference: reward.voucher_reference,
          issued_at: reward.issued_at,
        };
      }),
    }, 200);
  }

  const { data: rewardId, error: issueError } = await admin.rpc('issue_driver_premium_fuel_reward', {
    p_reward_id: fields.reward_id,
    p_voucher_value_zmw: fields.voucher_value_zmw,
    p_voucher_reference: typeof fields.voucher_reference === 'string' ? fields.voucher_reference.trim() || null : null,
    p_reviewer_id: reviewer.id,
  });
  if (issueError || rewardId !== fields.reward_id) {
    console.error('Could not issue a Premium fuel reward.', {
      code: issueError?.code,
      message: issueError?.message,
    });
    return jsonResponse({ error: issueError?.message || 'The reward service returned an invalid response.' }, 409);
  }
  return jsonResponse({ reward_id: rewardId, status: 'issued' }, 200);
});
