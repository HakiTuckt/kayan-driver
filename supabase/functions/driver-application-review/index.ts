import { createClient } from 'npm:@supabase/supabase-js@2';

type DriverProfileRow = {
  id: string;
  full_name: string;
  phone: string;
  city: string;
  account_status: string;
  created_at: string;
};

type DriverVehicleRow = {
  id: string;
  driver_id: string;
  make: string;
  model: string;
  year: number;
  fuel_type: string;
  engine_trim: string;
  plate: string;
  color: string;
};

type DriverDocumentRow = {
  id: string;
  driver_id: string;
  document_type: string;
  object_path: string;
  review_status: string;
  expires_on: string | null;
  created_at: string;
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

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function listPendingApplications(admin: ReturnType<typeof createClient>) {
  const { data: profiles, error: profilesError } = await admin
    .from('driver_profiles')
    .select('id, full_name, phone, city, account_status, created_at')
    .eq('account_status', 'pending_review')
    .order('created_at', { ascending: true })
    .limit(50);
  if (profilesError) {
    console.error('Could not load pending driver applications.', { message: profilesError.message });
    return jsonResponse({ error: 'Could not load pending applications.' }, 500);
  }
  if (!profiles?.length) return jsonResponse({ applications: [] }, 200);

  const driverIds = profiles.map((profile: DriverProfileRow) => profile.id);
  const [vehiclesResult, documentsResult] = await Promise.all([
    admin.from('driver_vehicles')
      .select('id, driver_id, make, model, year, fuel_type, engine_trim, plate, color')
      .in('driver_id', driverIds),
    admin.from('driver_documents')
      .select('id, driver_id, document_type, object_path, review_status, expires_on, created_at')
      .in('driver_id', driverIds)
      .order('created_at', { ascending: true }),
  ]);
  if (vehiclesResult.error || documentsResult.error) {
    console.error('Could not load driver application details.', {
      vehicleError: vehiclesResult.error?.message,
      documentError: documentsResult.error?.message,
    });
    return jsonResponse({ error: 'Could not load driver application details.' }, 500);
  }

  const documents = (documentsResult.data ?? []) as DriverDocumentRow[];
  const signedUrls = documents.length
    ? await admin.storage.from('driver-documents').createSignedUrls(
      documents.map(document => document.object_path),
      300,
    )
    : { data: [], error: null };
  const signedUrlsByPath = new Map<string, string>();
  for (const file of signedUrls.data ?? []) {
    if (file.path && file.signedUrl) signedUrlsByPath.set(file.path, file.signedUrl);
  }
  if (
    signedUrls.error
    || !signedUrls.data
    || signedUrls.data.length !== documents.length
    || signedUrls.data.some(file => file.error || !file.signedUrl)
    || documents.some(document => !signedUrlsByPath.has(document.object_path))
  ) {
    console.error('Could not create private document review links.', {
      message: signedUrls.error?.message ?? 'One or more document links could not be signed.',
    });
    return jsonResponse({ error: 'Could not securely open application documents.' }, 500);
  }

  const vehicles = (vehiclesResult.data ?? []) as DriverVehicleRow[];
  return jsonResponse({
    applications: (profiles as DriverProfileRow[]).map(profile => ({
      ...profile,
      vehicle: vehicles.find(vehicle => vehicle.driver_id === profile.id) ?? null,
      documents: documents
        .filter(document => document.driver_id === profile.id)
        .map(({ object_path, ...document }) => ({
          ...document,
          signed_url: signedUrlsByPath.get(object_path),
        })),
    })),
  }, 200);
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
  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
    if (!authorization) return jsonResponse({ error: 'Sign in to review applications.' }, 401);
    console.error('Required driver-review service configuration is missing.');
    return jsonResponse({ error: 'Application review is not configured.' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const reviewer = userData.user;
  if (userError || !reviewer) return jsonResponse({ error: 'Your sign-in session is invalid. Sign in again.' }, 401);
  if (reviewer.is_anonymous || !reviewer.phone_confirmed_at) {
    return jsonResponse({ error: 'A verified reviewer phone account is required.' }, 403);
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
    console.error('Could not verify reviewer access.', { message: reviewerError.message });
    return jsonResponse({ error: 'Could not verify reviewer access.' }, 500);
  }
  if (!reviewerRecord) return jsonResponse({ error: 'This phone account is not authorized to review applications.' }, 403);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'The review request body is invalid.' }, 400);
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return jsonResponse({ error: 'The review request body must be an object.' }, 400);
  }
  const fields = input as Record<string, unknown>;
  if (fields.action === 'list') return listPendingApplications(admin);
  if (fields.action !== 'review' || !isUuid(fields.driver_id)
    || (fields.decision !== 'approve' && fields.decision !== 'reject')) {
    return jsonResponse({ error: 'Choose a valid application and review decision.' }, 400);
  }

  const decision = fields.decision;
  const notes = typeof fields.notes === 'string' ? fields.notes.trim() : '';
  if (notes.length > 1000 || (decision === 'reject' && notes.length < 5)) {
    return jsonResponse({
      error: decision === 'reject'
        ? 'Enter a rejection reason of 5 to 1000 characters.'
        : 'Review notes must be 1000 characters or fewer.',
    }, 400);
  }

  const { data: status, error: reviewError } = await admin.rpc('review_driver_application', {
    p_driver_id: fields.driver_id,
    p_decision: decision,
    p_notes: notes || null,
    p_reviewer_id: reviewer.id,
  });
  if (reviewError) {
    console.error('Could not record a driver application decision.', {
      driverId: fields.driver_id,
      code: reviewError.code,
      message: reviewError.message,
    });
    return jsonResponse({ error: reviewError.message || 'Could not record this decision.' }, 400);
  }
  if (status !== 'active' && status !== 'rejected') {
    console.error('The review procedure returned an unexpected application status.');
    return jsonResponse({ error: 'The review service returned an invalid status.' }, 500);
  }
  return jsonResponse({ driver_id: fields.driver_id, account_status: status }, 200);
});
