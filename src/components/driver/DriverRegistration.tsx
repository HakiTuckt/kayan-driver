import { useState } from 'react';
import { ArrowLeft, ArrowRight, CarFront, Check, FileCheck2, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type DriverProfile = { name: string; phone: string; email: string; city: string; make: string; model: string; year: string; plate: string; color: string };
const initial: DriverProfile = { name: '', phone: '', email: '', city: 'Lusaka', make: '', model: '', year: '', plate: '', color: '' };
const documents = ['Driving licence', 'National registration card', 'Vehicle registration', 'Roadworthiness certificate'];
const profileSteps: { key: keyof DriverProfile; label: string; title: string; description: string; placeholder: string; type?: string; optional?: boolean }[] = [
  { key: 'name', label: 'Full name', title: 'What should we call you?', description: 'Use a fictional name for this demo.', placeholder: 'e.g. Alex Banda' },
  { key: 'phone', label: 'Phone number', title: 'How can your demo profile be reached?', description: 'Use a fictional phone number. No calls or messages will be sent.', placeholder: 'e.g. +260 970 000 000', type: 'tel' },
  { key: 'email', label: 'Email address', title: 'What is your email?', description: 'This is optional and stays in this page session.', placeholder: 'alex@example.com', type: 'email', optional: true },
  { key: 'city', label: 'City', title: 'Where would you drive?', description: 'Choose a city for the illustrative driver profile.', placeholder: 'Lusaka' },
  { key: 'make', label: 'Vehicle make', title: 'What vehicle would you use?', description: 'Start with its manufacturer.', placeholder: 'e.g. Toyota' },
  { key: 'model', label: 'Vehicle model', title: 'What is the model?', description: 'Add the vehicle model for your demo profile.', placeholder: 'e.g. Corolla' },
  { key: 'year', label: 'Vehicle year', title: 'What year is the vehicle?', description: 'Enter a year between 1980 and next year.', placeholder: '2020', type: 'number' },
  { key: 'plate', label: 'Vehicle plate', title: 'What is the demo plate?', description: 'Use an invented plate, not a real registration.', placeholder: 'e.g. DEMO 001' },
  { key: 'color', label: 'Vehicle colour', title: 'What colour is it?', description: 'Finish the vehicle details with its colour.', placeholder: 'e.g. Silver' },
];

export default function DriverRegistration({ onComplete }: { onComplete: (profile: DriverProfile) => void }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const documentStep = step >= profileSteps.length && step < profileSteps.length + documents.length;
  const consentStep = step === profileSteps.length + documents.length;
  const totalSteps = profileSteps.length + documents.length + 1;
  const progress = ((step + 1) / totalSteps) * 100;
  const currentProfileStep = profileSteps[step];
  const currentDocument = documentStep ? documents[step - profileSteps.length] : null;

  const advance = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < totalSteps - 1) {
      setStep(current => current + 1);
    } else {
      onComplete(profile);
    }
  };

  const toggleDocument = (document: string) => {
    setSelected(current => current.includes(document)
      ? current.filter(item => item !== document)
      : [...current, document]);
  };

  return <div className="driver-registration mx-auto w-full max-w-xl">
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[.16em] text-primary">Driver pre-registration · demo</span>
        <span className="shrink-0 text-xs text-muted-foreground">Step {step + 1} of {totalSteps}</span>
      </div>
      <div role="progressbar" aria-label="Pre-registration progress" aria-valuemin={0} aria-valuemax={totalSteps} aria-valuenow={step + 1} className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }}/>
      </div>
    </div>

    <section className="min-h-[420px] rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
      <div className="mb-7">
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
          {currentProfileStep ? (step < 4 ? <UserRound size={23}/> : <CarFront size={23}/>) : documentStep ? <FileCheck2 size={23}/> : <ShieldCheck size={23}/>}
        </span>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {currentProfileStep?.title ?? (currentDocument ? `Add ${currentDocument.toLowerCase()}?` : 'Ready to enter the driver demo?')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {currentProfileStep?.description ?? (currentDocument
            ? 'This is only a sample label. No document or image is selected or uploaded.'
            : 'Your choices stay in this page session. Nothing is submitted and no driver account is created.')}
        </p>
      </div>

      <form onSubmit={advance}>
        {currentProfileStep && <div className="space-y-2">
          <Label htmlFor={`driver-profile-${currentProfileStep.key}`} className="text-xs font-semibold">{currentProfileStep.label}{currentProfileStep.optional ? ' (optional)' : ''}</Label>
          <Input
            autoFocus
            id={`driver-profile-${currentProfileStep.key}`}
            required={!currentProfileStep.optional}
            type={currentProfileStep.type ?? 'text'}
            value={profile[currentProfileStep.key]}
            placeholder={currentProfileStep.placeholder}
            maxLength={currentProfileStep.key === 'year' ? 4 : 100}
            min={currentProfileStep.type === 'number' ? 1980 : undefined}
            max={currentProfileStep.type === 'number' ? new Date().getFullYear() + 1 : undefined}
            onChange={event => setProfile(current => ({ ...current, [currentProfileStep.key]: event.target.value }))}
            className="h-12 rounded-xl bg-background"
          />
        </div>}

        {currentDocument && <label className={`flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors ${selected.includes(currentDocument) ? 'border-primary bg-accent' : 'bg-background hover:bg-secondary/60'}`}>
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-[var(--copper)]"
            checked={selected.includes(currentDocument)}
            onChange={() => toggleDocument(currentDocument)}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{currentDocument}</span>
            <span className="mt-1 block text-xs text-muted-foreground">Sample only · no file selected</span>
          </span>
          {selected.includes(currentDocument) && <Check size={18} className="shrink-0 text-primary"/>}
        </label>}

        {consentStep && <label className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-background p-4 text-sm leading-6">
          <input required type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--copper)]" checked={consent} onChange={event => setConsent(event.target.checked)}/>
          <span>I understand this is a simulation. Sample document labels do not submit files or mean I am approved as a driver.</span>
        </label>}

        <div className="mt-8 flex gap-3">
          {step > 0 && <Button type="button" variant="outline" className="h-12 rounded-xl px-4" onClick={() => setStep(current => current - 1)}><ArrowLeft size={16} className="mr-2"/>Back</Button>}
          <Button type="submit" disabled={!!currentDocument && !selected.includes(currentDocument)} className="kayan-action flex-1">
            {consentStep ? 'Enter driver demo' : 'Continue'}<ArrowRight size={17} className="ml-2"/>
          </Button>
        </div>
      </form>
    </section>

    <p className="mt-4 flex items-start gap-2 px-1 text-[11px] leading-5 text-muted-foreground">
      <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary"/>
      Use fictional details only. Information stays in page memory and clears on reload. No account is created or application submitted.
    </p>
  </div>;
}
