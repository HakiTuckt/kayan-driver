import { useState } from 'react';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  sendDriverPhoneLinkOtp,
  sendDriverPhoneLoginOtp,
  verifyDriverPhoneLinkOtp,
  verifyDriverPhoneLoginOtp,
} from '@/lib/driver-phone-auth';

export default function DriverPhoneLogin({
  mode = 'sign-in',
  initialPhone = '',
  onAuthenticated,
  onCancel,
}: {
  mode?: 'sign-in' | 'link-account';
  initialPhone?: string;
  onAuthenticated: () => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const linkingAccount = mode === 'link-account';

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!codeSent) {
        if (!whatsappConsent) throw new Error('Agree to receive the verification code on WhatsApp before continuing.');
        if (linkingAccount) {
          const result = await sendDriverPhoneLinkOtp(phone);
          setPhone(result.phone);
          if (result.alreadyVerified) {
            await onAuthenticated();
            return;
          }
        } else {
          setPhone(await sendDriverPhoneLoginOtp(phone));
        }
        setCodeSent(true);
        setCode('');
        return;
      }

      if (linkingAccount) await verifyDriverPhoneLinkOtp(phone, code);
      else await verifyDriverPhoneLoginOtp(phone, code);
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
      if (linkingAccount) {
        const result = await sendDriverPhoneLinkOtp(phone);
        setPhone(result.phone);
        if (result.alreadyVerified) {
          await onAuthenticated();
          return;
        }
      } else {
        setPhone(await sendDriverPhoneLoginOtp(phone));
      }
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
    <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Driver phone sign-in</p>
    <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
      {linkingAccount ? codeSent ? 'Enter the WhatsApp code' : 'Verify your saved account' : codeSent ? 'Enter the WhatsApp code' : 'Sign in with your phone'}
    </h1>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      {linkingAccount
        ? `Verify ${phone || 'your saved phone number'} to keep access to this driver's saved profile and documents.`
        : codeSent ? `Enter the 6-digit WhatsApp code sent to ${phone}.` : 'We’ll send a one-time code to the phone number on your driver account using WhatsApp.'}
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
      <div className="flex gap-3 pt-3">
        {onCancel && <Button type="button" variant="outline" className="h-12 rounded-xl px-4" onClick={onCancel}><ArrowLeft size={16} className="mr-2"/>Back</Button>}
        <Button type="submit" disabled={busy} className="kayan-action flex-1">
          {busy ? codeSent ? 'Verifying…' : 'Sending code…' : codeSent ? 'Verify & continue' : 'Send WhatsApp code'}{!busy && <ArrowRight size={17} className="ml-2"/>}
        </Button>
      </div>
      {codeSent && <Button type="button" variant="link" className="h-auto px-0 text-xs" disabled={busy} onClick={() => void resend()}>Resend WhatsApp code</Button>}
    </form>
    {!linkingAccount && <p className="mt-5 text-xs leading-5 text-muted-foreground">This is passwordless phone sign-in, not two-factor authentication. WhatsApp delivery charges may apply through the configured provider.</p>}
  </section>;
}
