import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import type { DriverDocumentType } from '@/lib/driver-documents';

export type PendingDriverApplication = {
  id: string;
  full_name: string;
  phone: string;
  city: string;
  account_status: 'pending_review';
  created_at: string;
  vehicle: {
    make: string;
    model: string;
    year: number;
    fuel_type: string;
    engine_trim: string;
    plate: string;
    color: string;
  } | null;
  documents: {
    id: string;
    document_type: DriverDocumentType;
    review_status: 'pending_review' | 'approved' | 'rejected';
    expires_on: string | null;
    created_at: string;
    signed_url: string;
  }[];
};

export type DriverApplicationDecision = 'approve' | 'reject';

const reviewFunction = 'driver-application-review';

async function getReviewErrorMessage(error: Error) {
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

export async function loadPendingDriverApplications() {
  const { data, error } = await getSupabaseClient().functions.invoke<{
    applications: PendingDriverApplication[];
  }>(reviewFunction, { body: { action: 'list' } });
  if (error) throw new Error(`Could not load driver applications: ${await getReviewErrorMessage(error)}`);
  if (!data || !Array.isArray(data.applications)) {
    throw new Error('The review service returned an invalid application list.');
  }
  return data.applications;
}

export async function decideDriverApplication(
  driverId: string,
  decision: DriverApplicationDecision,
  notes: string,
) {
  const { data, error } = await getSupabaseClient().functions.invoke<{
    driver_id: string;
    account_status: 'active' | 'rejected';
  }>(reviewFunction, {
    body: { action: 'review', driver_id: driverId, decision, notes },
  });
  if (error) throw new Error(`Could not record the application decision: ${await getReviewErrorMessage(error)}`);
  if (data?.driver_id !== driverId || !['active', 'rejected'].includes(data.account_status)) {
    throw new Error('The review service returned an invalid decision response.');
  }
  return data.account_status;
}
