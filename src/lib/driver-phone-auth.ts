import { getSupabaseClient } from '@/lib/supabase';
import { normalizeDriverPhone } from '@/lib/driver-phone';

export type DriverPhoneOtpFlow = 'sign-in' | 'link-application';

export async function sendDriverPhoneLoginOtp(value: string, allowApplicationLink = false) {
  const phone = normalizeDriverPhone(value);
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Could not check the driver session: ${sessionError.message}`);

  const currentUser = sessionData.session?.user;
  if (allowApplicationLink && currentUser?.is_anonymous) {
    const { data: profile, error: profileError } = await supabase
      .from('driver_profiles')
      .select('phone')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (profileError) throw new Error(`Could not check the saved driver application: ${profileError.message}`);
    if (profile) {
      if (normalizeDriverPhone(profile.phone) !== phone) {
        throw new Error('Enter the phone number saved with this driver application. Contact KAYAN if it has changed.');
      }
      const { data, error } = await supabase.auth.updateUser({ phone });
      if (error) throw new Error(`Could not link this application to the verified phone: ${error.message}`);
      if (data.user?.id !== currentUser.id) {
        throw new Error('Supabase did not preserve the current driver application account. Please contact KAYAN support.');
      }
      return { phone, flow: 'link-application' as const, userId: currentUser.id };
    }
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(`Could not send a sign-in code: ${error.message}`);
  return { phone, flow: 'sign-in' as const, userId: null };
}

export async function resendDriverPhoneLoginOtp(value: string, flow: DriverPhoneOtpFlow) {
  const phone = normalizeDriverPhone(value);
  const supabase = getSupabaseClient();
  if (flow === 'link-application') {
    const { error } = await supabase.auth.resend({ type: 'phone_change', phone });
    if (error) throw new Error(`Could not resend the phone-verification code: ${error.message}`);
  } else {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error(`Could not resend the sign-in code: ${error.message}`);
  }
  return phone;
}

export async function verifyDriverPhoneLoginOtp(
  value: string,
  token: string,
  flow: DriverPhoneOtpFlow = 'sign-in',
  expectedUserId: string | null = null,
) {
  const phone = normalizeDriverPhone(value);
  if (!/^\d{6}$/.test(token)) throw new Error('Enter the 6-digit code from WhatsApp.');
  const { data, error } = await getSupabaseClient().auth.verifyOtp({
    phone,
    token,
    type: flow === 'link-application' ? 'phone_change' : 'sms',
  });
  if (error) throw new Error(`Could not sign in with this phone number: ${error.message}`);
  if (expectedUserId && data.user?.id !== expectedUserId) {
    throw new Error('Phone verification did not return the saved driver application account. Please contact KAYAN support.');
  }
  if (data.user?.phone !== phone || !data.user.phone_confirmed_at) {
    throw new Error('Supabase did not confirm the phone number. Request a new code and try again.');
  }
  return { phone, user: data.user };
}

export async function signOutDriver() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw new Error(`Could not sign out of the driver account: ${error.message}`);
}
