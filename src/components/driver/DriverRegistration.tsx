import { useState } from 'react';
import { ArrowLeft, ArrowRight, CarFront, FileCheck2, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { driverDocumentTypes, type DriverDocumentType, type DriverDocuments } from '@/lib/driver-documents';

export type DriverFuelType = 'petrol' | 'diesel' | 'hybrid' | 'electric';
export type DriverProfile = { name: string; phone: string; city: string; make: string; model: string; year: string; fuelType: DriverFuelType; engineTrim: string; plate: string; color: string };
const initial: DriverProfile = { name: '', phone: '', city: 'Lusaka', make: '', model: '', year: '', fuelType: 'petrol', engineTrim: '', plate: '', color: '' };
const documents: { type: DriverDocumentType; label: string }[] = [
  { type: 'drivers_license', label: 'Driving licence' },
  { type: 'national_registration_card', label: 'National registration card' },
  { type: 'vehicle_registration', label: 'Vehicle registration' },
  { type: 'roadworthiness_certificate', label: 'Roadworthiness certificate' },
];
const maximumFileSize = 10 * 1024 * 1024;
const profileSteps: { key: keyof DriverProfile; label: string; title: string; description: string; placeholder: string; type?: string; optional?: boolean }[] = [
  { key: 'name', label: 'Full name', title: 'What is your full name?', description: 'Enter the name to be used when reviewing your application.', placeholder: 'e.g. Alex Banda' },
  { key: 'phone', label: 'Phone number', title: 'What phone number can we reach you on?', description: 'Enter a Zambian contact number in local or +260 format. This number is not verified in the demo.', placeholder: '+260 970 000 000', type: 'tel' },
  { key: 'city', label: 'City', title: 'Where will you drive?', description: 'Enter the city where you plan to drive.', placeholder: 'Lusaka' },
  { key: 'make', label: 'Vehicle make', title: 'What vehicle will you use?', description: 'Enter the manufacturer shown on the vehicle documents.', placeholder: 'e.g. Toyota' },
  { key: 'model', label: 'Vehicle model', title: 'What is the model?', description: 'Enter the model shown on the vehicle documents.', placeholder: 'e.g. Corolla' },
  { key: 'year', label: 'Vehicle year', title: 'What year is the vehicle?', description: 'Enter a year between 1980 and next year.', placeholder: '2020', type: 'number' },
  { key: 'fuelType', label: 'Fuel type', title: 'What fuel does the vehicle use?', description: 'This helps estimate fuel or energy needed for a route.', placeholder: '', type: 'select' },
  { key: 'engineTrim', label: 'Engine / trim', title: 'What is the engine and trim?', description: 'Include the engine size if known, such as 1.8 L or 1800 cc. The estimate is approximate.', placeholder: 'e.g. 1.8 L petrol automatic' },
  { key: 'plate', label: 'Vehicle plate', title: 'What is the vehicle plate?', description: 'Enter the plate number shown on the vehicle registration.', placeholder: 'e.g. ABC 1234' },
  { key: 'color', label: 'Vehicle colour', title: 'What colour is it?', description: 'Finish the vehicle details with its colour.', placeholder: 'e.g. Silver' },
];

export default function DriverRegistration({
  onComplete,
  initialProfile,
  startAtDocuments = false,
  onSignIn,
}: {
  onComplete: (profile: DriverProfile, documents: DriverDocuments) => Promise<void>;
  initialProfile?: Partial<DriverProfile>;
  startAtDocuments?: boolean;
  onSignIn?: () => void;
}) {
  const [step, setStep] = useState(() => startAtDocuments ? profileSteps.length : 0);
  const [profile, setProfile] = useState<DriverProfile>(() => ({ ...initial, ...initialProfile }));
  const [uploads, setUploads] = useState<Partial<DriverDocuments>>({});
  const [documentError, setDocumentError] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const documentStep = step >= profileSteps.length && step < profileSteps.length + documents.length;
  const consentStep = step === profileSteps.length + documents.length;
  const totalSteps = profileSteps.length + documents.length + 1;
  const progressStep = step + 1;
  const progress = (progressStep / totalSteps) * 100;
  const currentProfileStep = profileSteps[step];
  const currentDocument = documentStep ? documents[step - profileSteps.length] : null;

  const advance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError('');
    if (step < totalSteps - 1) {
      setStep(current => current + 1);
    } else {
      setSaving(true);
      try {
        if (driverDocumentTypes.some(type => !uploads[type])) {
          throw new Error('Upload all four required driver documents before submitting.');
        }
        await onComplete(profile, Object.fromEntries(driverDocumentTypes.map(type => [type, uploads[type]])) as DriverDocuments);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Could not save this demo registration. Please try again.');
      } finally {
        setSaving(false);
      }
    }
  };

  const goBack = () => setStep(current => current - 1);

  const selectDocument = (type: DriverDocumentType, file?: File) => {
    setDocumentError('');
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setUploads(current => ({ ...current, [type]: undefined }));
      setDocumentError('Choose a PDF, JPG, or PNG file.');
      return;
    }
    if (file.size > maximumFileSize) {
      setUploads(current => ({ ...current, [type]: undefined }));
      setDocumentError('Each file must be 10 MB or smaller.');
      return;
    }
    setUploads(current => ({ ...current, [type]: file }));
  };

  return <div className="driver-registration mx-auto w-full max-w-xl">
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[.16em] text-primary">Driver pre-registration · demo</span>
        <span className="shrink-0 text-xs text-muted-foreground">Step {progressStep} of {totalSteps}</span>
      </div>
      <div role="progressbar" aria-label="Pre-registration progress" aria-valuemin={0} aria-valuemax={totalSteps} aria-valuenow={progressStep} className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }}/>
      </div>
    </div>

    <section className="min-h-[420px] rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
      <div className="mb-7">
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
          {currentProfileStep ? (step < 4 ? <UserRound size={23}/> : <CarFront size={23}/>) : documentStep ? <FileCheck2 size={23}/> : <ShieldCheck size={23}/>}
        </span>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {currentProfileStep?.title ?? (currentDocument ? `Upload your ${currentDocument.label.toLowerCase()}` : 'Ready to submit your application?')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {currentProfileStep?.description ?? (currentDocument
            ? 'Required · PDF, JPG, or PNG · 10 MB maximum. Your file will be uploaded to private KAYAN storage.'
            : 'Your profile, vehicle, and required documents will be stored in KAYAN’s private application storage. The demo does not make approval decisions.')}
        </p>
      </div>

      <form onSubmit={advance}>
        {currentProfileStep && <div className="space-y-2">
          <Label htmlFor={`driver-profile-${currentProfileStep.key}`} className="text-xs font-semibold">{currentProfileStep.label}{currentProfileStep.optional ? ' (optional)' : ''}</Label>
          {currentProfileStep.key === 'fuelType' ? <select
            autoFocus
            id={`driver-profile-${currentProfileStep.key}`}
            required
            value={profile.fuelType}
            onChange={event => setProfile(current => ({ ...current, fuelType: event.target.value as DriverFuelType }))}
            className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="petrol">Petrol</option>
            <option value="diesel">Diesel</option>
            <option value="hybrid">Hybrid (petrol)</option>
            <option value="electric">Electric</option>
          </select> : <Input
            autoFocus
            id={`driver-profile-${currentProfileStep.key}`}
            required={!currentProfileStep.optional}
            type={currentProfileStep.type === 'select' ? 'text' : currentProfileStep.type ?? 'text'}
            value={profile[currentProfileStep.key]}
            placeholder={currentProfileStep.placeholder}
            maxLength={currentProfileStep.key === 'year' ? 4 : 100}
            min={currentProfileStep.type === 'number' ? 1980 : undefined}
            max={currentProfileStep.type === 'number' ? new Date().getFullYear() + 1 : undefined}
            onChange={event => setProfile(current => ({ ...current, [currentProfileStep.key]: event.target.value }))}
            className="h-12 rounded-xl bg-background"
          />}
        </div>}

        {currentDocument && <div className="space-y-2">
          <Label htmlFor={`driver-document-${currentDocument.type}`} className="text-xs font-semibold">{currentDocument.label} file</Label>
          <Input
            autoFocus
            id={`driver-document-${currentDocument.type}`}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            required={!uploads[currentDocument.type]}
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              selectDocument(currentDocument.type, file);
              if (file && !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) event.currentTarget.value = '';
              if (file && file.size > maximumFileSize) event.currentTarget.value = '';
            }}
            aria-describedby="driver-document-file-help"
            className="h-auto cursor-pointer rounded-xl bg-background py-3 file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold"
          />
          <p id="driver-document-file-help" className="text-xs text-muted-foreground">
            {uploads[currentDocument.type] ? `Selected: ${uploads[currentDocument.type].name}` : 'Select a clear photo or scan of the document.'}
          </p>
          {documentError && <p role="alert" className="text-xs text-destructive">{documentError}</p>}
        </div>}

        {consentStep && <label className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-background p-4 text-sm leading-6">
          <input required type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--copper)]" checked={consent} onChange={event => setConsent(event.target.checked)}/>
          <span>I agree to submit my profile, contact phone number, vehicle details, and the four selected documents to KAYAN’s private application storage. My phone number is not verified in this demo, and the demo does not determine driver approval.</span>
        </label>}

        <div className="mt-8 flex gap-3">
          {step > 0 && <Button type="button" variant="outline" className="h-12 rounded-xl px-4" onClick={goBack}><ArrowLeft size={16} className="mr-2"/>Back</Button>}
          <Button type="submit" disabled={saving || (!!currentDocument && !uploads[currentDocument.type])} className="kayan-action flex-1">
            {saving ? 'Submitting application…' : consentStep ? 'Submit application' : 'Continue'}{!saving && <ArrowRight size={17} className="ml-2"/>}
          </Button>
        </div>
        {saveError && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-destructive">{saveError}</p>}
      </form>
    </section>

    <p className="mt-4 flex items-start gap-2 px-1 text-[11px] leading-5 text-muted-foreground">
      <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary"/>
      Phone verification is temporarily off. Applications are saved to this app session and may not be recoverable if app data is cleared; use test documents only.
    </p>
    {onSignIn && <p className="mt-3 text-center text-xs text-muted-foreground">Already registered? <button type="button" className="font-semibold text-primary underline underline-offset-4" onClick={onSignIn}>Sign in with phone</button></p>}
  </div>;
}
