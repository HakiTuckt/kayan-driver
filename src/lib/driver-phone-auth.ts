import { getSupabaseClient } from '@/lib/supabase';
import { normalizeDriverPhone } from '@/lib/driver-phone';

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
  if (!/^\d{6}$/.test(token)) throw new Error('Enter the 6-digit code from WhatsApp.');
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
