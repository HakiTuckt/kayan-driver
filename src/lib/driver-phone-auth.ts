import { getSupabaseClient } from '@/lib/supabase';
import { normalizeDriverPhone } from '@/lib/driver-phone';

async function ensureAnonymousSession() {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Could not check the driver sign-in: ${sessionError.message}`);
  if (sessionData.session) return sessionData.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(`Could not start driver registration: ${error.message}. Confirm anonymous sign-ins are enabled in Supabase.`);
  }
  if (!data.session) throw new Error('Supabase did not start a driver registration session.');
  return data.session;
}

export async function sendDriverPhoneLinkOtp(value: string) {
  const phone = normalizeDriverPhone(value);
  const supabase = getSupabaseClient();
  const session = await ensureAnonymousSession();
  if (session.user.phone === phone && session.user.phone_confirmed_at) return { phone, alreadyVerified: true };

  const { error } = await supabase.auth.updateUser({ phone });
  if (error) {
    if (/already|registered|exists|taken/i.test(error.message)) {
      throw new Error('This number already has a driver account. Use “Sign in with phone” instead.');
    }
    throw new Error(`Could not send a verification code: ${error.message}`);
  }
  return { phone, alreadyVerified: false };
}

export async function verifyDriverPhoneLinkOtp(value: string, token: string) {
  const phone = normalizeDriverPhone(value);
  if (!/^\d{6}$/.test(token)) throw new Error('Enter the 6-digit code from the SMS.');
  const { data, error } = await getSupabaseClient().auth.verifyOtp({ phone, token, type: 'phone_change' });
  if (error) throw new Error(`Could not verify this phone number: ${error.message}`);
  if (data.user?.phone !== phone || !data.user.phone_confirmed_at) {
    throw new Error('Supabase did not confirm the phone number. Request a new code and try again.');
  }
  return phone;
}

export async function sendDriverPhoneLoginOtp(value: string) {
  const phone = normalizeDriverPhone(value);
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(`Could not send a sign-in code: ${error.message}`);
  return phone;
}

export async function verifyDriverPhoneLoginOtp(value: string, token: string) {
  const phone = normalizeDriverPhone(value);
  if (!/^\d{6}$/.test(token)) throw new Error('Enter the 6-digit code from the SMS.');
  const { data, error } = await getSupabaseClient().auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw new Error(`Could not sign in with this phone number: ${error.message}`);
  if (data.user?.phone !== phone || !data.user.phone_confirmed_at) {
    throw new Error('Supabase did not confirm the phone sign-in. Request a new code and try again.');
  }
  return { phone, user: data.user };
}

export async function signOutDriver() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw new Error(`Could not sign out of the driver account: ${error.message}`);
}
