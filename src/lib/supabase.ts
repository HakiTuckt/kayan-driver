import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DriverProfile } from '@/components/driver/DriverRegistration';
import { driverDocumentTypes, type DriverDocumentType, type DriverDocuments } from '@/lib/driver-documents';
import { normalizeDriverPhone } from '@/lib/driver-phone';

const documentBucket = 'driver-documents';
const maximumDocumentSize = 10 * 1024 * 1024;
const documentLabels: Record<DriverDocumentType, string> = {
  drivers_license: 'driving licence',
  national_registration_card: 'national registration card',
  vehicle_registration: 'vehicle registration',
  roadworthiness_certificate: 'roadworthiness certificate',
};

function getDocumentExtension(file: File) {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  throw new Error('Documents must be uploaded as PDF, JPG, or PNG files.');
}

function getSafeFileName(file: File, extension: string) {
  const name = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(-80);
  return name || `document.${extension}`;
}

export function isSupabaseConfigured() {
  return !!import.meta.env.VITE_SUPABASE_URL?.trim()
    && !!(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim());
}

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !publicKey) throw new Error('The KAYAN demo database is not configured for this app build.');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('The configured Supabase project URL is invalid.');
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash || (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '')) {
    throw new Error('The configured Supabase project URL must be an HTTPS project URL without extra paths or credentials.');
  }
  client = createClient(parsedUrl.origin, publicKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  return client;
}

export type RestoredDriverAccount = {
  profile: DriverProfile | null;
  phone: string;
  phoneVerified: boolean;
  documentsComplete: boolean;
  accountStatus: DriverAccountStatus | null;
  reviewNotes: string | null;
};

export type DriverAccountStatus = 'pending_review' | 'active' | 'suspended' | 'rejected';

const driverAccountStatuses: DriverAccountStatus[] = ['pending_review', 'active', 'suspended', 'rejected'];

function isDriverAccountStatus(value: unknown): value is DriverAccountStatus {
  return typeof value === 'string' && driverAccountStatuses.some(status => status === value);
}

export async function ensureAnonymousSupabaseSession() {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Could not check the Supabase session: ${sessionError.message}`);
  if (sessionData.session) return sessionData.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(`Could not start the anonymous app session: ${error.message}. Confirm anonymous sign-ins are enabled in Supabase.`);
  }
  if (!data.session) throw new Error('Supabase did not start an anonymous app session.');
  return data.session;
}

export async function restoreDemoDriverProfile(): Promise<RestoredDriverAccount | null> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Could not restore the Supabase session: ${sessionError.message}`);
  const user = sessionData.session?.user;
  const userId = user?.id;
  if (!userId) return null;
  const phone = user.phone ?? '';
  const phoneVerified = !!user.phone_confirmed_at;

  const { data: savedProfile, error: profileError } = await supabase
    .from('driver_profiles')
    .select('id, full_name, phone, city, account_status')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load the saved driver profile: ${profileError.message}`);
  if (!savedProfile) {
    return {
      profile: null,
      phone,
      phoneVerified,
      documentsComplete: false,
      accountStatus: null,
      reviewNotes: null,
    };
  }
  if (!isDriverAccountStatus(savedProfile.account_status)) {
    throw new Error('The saved driver profile has an invalid application status.');
  }
  const accountStatus = savedProfile.account_status;
  let reviewNotes: string | null = null;
  if (accountStatus === 'rejected') {
    const { data: review, error: reviewError } = await supabase
      .from('driver_profiles')
      .select('review_notes')
      .eq('id', userId)
      .single();
    if (reviewError) throw new Error(`Could not load the application review note: ${reviewError.message}`);
    reviewNotes = review.review_notes;
  }

  const { data: vehicle, error: vehicleError } = await supabase
    .from('driver_vehicles')
    .select('make, model, year, fuel_type, engine_trim, plate, color')
    .eq('driver_id', userId)
    .limit(1)
    .maybeSingle();
  if (vehicleError) throw new Error(`Could not load the saved demo vehicle: ${vehicleError.message}`);
  if (!vehicle) throw new Error('A driver profile exists but its vehicle is missing. Re-submit the demo registration to finish saving it.');

  const { data: savedDocuments, error: documentsError } = await supabase
    .from('driver_documents')
    .select('document_type')
    .eq('driver_id', userId);
  if (documentsError) throw new Error(`Could not check the saved driver documents: ${documentsError.message}`);
  const completedTypes = new Set(savedDocuments?.map(document => document.document_type) ?? []);

  return {
    profile: {
      name: savedProfile.full_name,
      phone: savedProfile.phone,
      city: savedProfile.city,
      make: vehicle.make,
      model: vehicle.model,
      year: String(vehicle.year),
      fuelType: vehicle.fuel_type,
      engineTrim: vehicle.engine_trim,
      plate: vehicle.plate,
      color: vehicle.color,
    },
    phone,
    phoneVerified,
    documentsComplete: driverDocumentTypes.every(type => completedTypes.has(type)),
    accountStatus,
    reviewNotes,
  };
}

export async function saveDemoDriverProfile(profile: DriverProfile, documents: DriverDocuments) {
  for (const type of driverDocumentTypes) {
    const file = documents[type];
    if (!file) throw new Error(`Select a file for the ${documentLabels[type]} before submitting.`);
    getDocumentExtension(file);
    if (file.size > maximumDocumentSize) throw new Error(`The ${documentLabels[type]} file must be 10 MB or smaller.`);
  }

  const supabase = getSupabaseClient();
  const session = await ensureAnonymousSupabaseSession();
  const userId = session.user.id;
  const contactPhone = normalizeDriverPhone(profile.phone);

  const profileRecord = {
    full_name: profile.name.trim(),
    phone: contactPhone,
    city: profile.city.trim(),
  };
  const { data: existingProfile, error: findProfileError } = await supabase
    .from('driver_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (findProfileError) throw new Error(`Could not check for an existing demo profile: ${findProfileError.message}`);

  const profileSave = existingProfile
    ? await supabase.from('driver_profiles').update(profileRecord).eq('id', userId).select('id').maybeSingle()
    : await supabase.from('driver_profiles').insert({ id: userId, ...profileRecord }).select('id').maybeSingle();
  if (profileSave.error) throw new Error(`Could not save the demo profile: ${profileSave.error.message}. Confirm the driver-data SQL setup has been run.`);
  if (!profileSave.data) throw new Error('Supabase did not confirm that the demo profile was saved. Check row-level security and try again.');

  const vehicleRecord = {
    make: profile.make.trim(),
    model: profile.model.trim(),
    year: Number(profile.year),
    fuel_type: profile.fuelType,
    engine_trim: profile.engineTrim.trim(),
    plate: profile.plate.trim(),
    color: profile.color.trim(),
  };
  const { data: existingVehicle, error: findVehicleError } = await supabase
    .from('driver_vehicles')
    .select('id')
    .eq('driver_id', userId)
    .limit(1)
    .maybeSingle();
  if (findVehicleError) {
    throw new Error(`The demo profile was saved, but its vehicle could not be checked: ${findVehicleError.message}. Retry registration to finish saving.`);
  }

  const vehicleSave = existingVehicle
    ? await supabase.from('driver_vehicles').update(vehicleRecord).eq('id', existingVehicle.id).select('id').maybeSingle()
    : await supabase.from('driver_vehicles').insert({ driver_id: userId, ...vehicleRecord }).select('id').maybeSingle();
  if (vehicleSave.error) {
    throw new Error(`The demo profile was saved, but its vehicle could not be saved: ${vehicleSave.error.message}. Retry registration to finish saving.`);
  }
  if (!vehicleSave.data) throw new Error('The demo profile was saved, but Supabase did not confirm the vehicle. Retry registration to finish saving.');

  const { data: savedDocuments, error: findDocumentsError } = await supabase
    .from('driver_documents')
    .select('id, document_type, object_path')
    .eq('driver_id', userId);
  if (findDocumentsError) {
    throw new Error(`The profile and vehicle were saved, but existing document records could not be checked: ${findDocumentsError.message}. Retry submission.`);
  }

  const existingDocuments = new Map<string, { id: string; document_type: string; object_path: string }>(
    (savedDocuments ?? []).map(document => [document.document_type, document]),
  );
  const storage = supabase.storage.from(documentBucket);

  for (const type of driverDocumentTypes) {
    const file = documents[type];
    const extension = getDocumentExtension(file);
    const path = `${userId}/${crypto.randomUUID()}/${getSafeFileName(file, extension)}`;
    const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      throw new Error(`The profile and vehicle were saved, but the ${documentLabels[type]} could not be uploaded: ${uploadError.message}. Retry submission.`);
    }

    const existingDocument = existingDocuments.get(type);
    const documentSave = existingDocument
      ? await supabase.from('driver_documents').update({ document_type: type, object_path: path }).eq('id', existingDocument.id).select('id').maybeSingle()
      : await supabase.from('driver_documents').insert({ driver_id: userId, document_type: type, object_path: path }).select('id').maybeSingle();

    if (documentSave.error || !documentSave.data) {
      const { error: cleanupError } = await storage.remove([path]);
      const saveMessage = documentSave.error?.message ?? 'Supabase did not confirm the document record.';
      const cleanupMessage = cleanupError ? ` The new file could not be removed: ${cleanupError.message}.` : ' The temporary upload was removed.';
      throw new Error(`The ${documentLabels[type]} uploaded, but its private record could not be saved: ${saveMessage}.${cleanupMessage} Retry submission.`);
    }

    if (existingDocument) {
      const { error: removeError } = await storage.remove([existingDocument.object_path]);
      if (removeError) {
        throw new Error(`The new ${documentLabels[type]} was saved, but the previous file could not be removed: ${removeError.message}. Retry submission.`);
      }
    }
  }
}
