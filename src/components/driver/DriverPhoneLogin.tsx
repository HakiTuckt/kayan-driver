import { useState } from 'react';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resendDriverPhoneLoginOtp, sendDriverPhoneLoginOtp, verifyDriverPhoneLoginOtp, type DriverPhoneOtpFlow } from '@/lib/driver-phone-auth';

export default function DriverPhoneLogin({
  onAuthenticated,
  onCancel,
  audience = 'driver',
}: {
  onAuthenticated: () => Promise<void> | void;
  onCancel?: () => void;
  audience?: 'driver' | 'reviewer';
}) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [otpFlow, setOtpFlow] = useState<DriverPhoneOtpFlow>('sign-in');
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!codeSent) {
        if (!whatsappConsent) throw new Error('Agree to receive the verification code on WhatsApp before continuing.');
        const result = await sendDriverPhoneLoginOtp(phone, audience === 'driver');
        setPhone(result.phone);
        setOtpFlow(result.flow);
        setLinkedUserId(result.userId);
        setCodeSent(true);
        setCode('');
        return;
      }

      await verifyDriverPhoneLoginOtp(phone, code, otpFlow, linkedUserId);
      await onAuthenticated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Phone verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setBusy(true);
    try {
      setPhone(await resendDriverPhoneLoginOtp(phone, otpFlow));
      setCode('');
      setCodeSent(true);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Could not resend the verification code.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="mx-auto w-full max-w-xl rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
    <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><ShieldCheck size={23}/></span>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{audience === 'reviewer' ? 'Reviewer phone sign-in' : 'Driver phone sign-in'}</p>
    <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
      {codeSent
        ? otpFlow === 'link-application' ? 'Verify your application phone' : 'Enter the WhatsApp code'
        : audience === 'reviewer' ? 'Sign in as a reviewer' : 'Sign in or verify your application'}
    </h1>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      {codeSent
        ? otpFlow === 'link-application'
          ? `Enter the code sent to ${phone} to link this saved application to its verified phone.`
          : `Enter the 6-digit WhatsApp code sent to ${phone}.`
        : audience === 'reviewer'
          ? 'Use the verified phone account that KAYAN has authorized to review applications.'
          : 'For a saved application on this device, verify the submitted phone number to keep this same driver profile. Otherwise, sign in to your existing verified phone account.'}
    </p>
    <form onSubmit={submit} className="mt-7 space-y-2">
      <Label htmlFor="driver-phone-login">{codeSent ? '6-digit WhatsApp code' : 'Phone number'}</Label>
      <Input
        autoFocus
        id="driver-phone-login"
        required
        type={codeSent ? 'text' : 'tel'}
        inputMode={codeSent ? 'numeric' : 'tel'}
        pattern={codeSent ? '[0-9]{6}' : undefined}
        maxLength={codeSent ? 6 : 24}
        value={codeSent ? code : phone}
        placeholder={codeSent ? '123456' : '+260 970 000 000'}
        onChange={event => {
          if (codeSent) setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
          else {
            setPhone(event.target.value);
            setWhatsappConsent(false);
          }
        }}
        className="h-12 rounded-xl bg-background"
      />
      {!codeSent && <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3 text-xs leading-5">
        <input required type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--copper)]" checked={whatsappConsent} onChange={event => { setWhatsappConsent(event.target.checked); setError(''); }}/>
        <span>I agree to receive a WhatsApp verification message from KAYAN at this number.</span>
      </label>}
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-destructive">{error}</p>}
      <div className="flex w-full min-w-0 gap-3 pt-3">
        {onCancel && <Button type="button" variant="outline" className="h-12 shrink-0 rounded-xl px-3 sm:px-4" onClick={onCancel}><ArrowLeft size={16}/>Back</Button>}
        <Button type="submit" disabled={busy} className="kayan-action min-w-0 flex-1 whitespace-normal px-2 text-center leading-tight">
          {busy ? codeSent ? 'Verifying…' : 'Sending code…' : codeSent ? 'Verify & continue' : 'Send WhatsApp code'}{!busy && <ArrowRight size={17}/>}
        </Button>
      </div>
      {codeSent && <Button type="button" variant="link" className="h-auto px-0 text-xs" disabled={busy} onClick={() => void resend()}>Resend WhatsApp code</Button>}
    </form>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Phone verification proves control of this number; it is not two-factor authentication. WhatsApp delivery charges may apply through the configured provider.</p>
  </section>;
}
