import { useState } from 'react';
import { ArrowLeft, ArrowRight, CarFront, Check, FileCheck2, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type DriverProfile = { name: string; phone: string; email: string; city: string; make: string; model: string; year: string; plate: string; color: string };
const initial: DriverProfile = { name: '', phone: '', email: '', city: 'Lusaka', make: '', model: '', year: '', plate: '', color: '' };
const documents = ['Driving licence', 'National registration card', 'Vehicle registration', 'Roadworthiness certificate'];

export default function DriverRegistration({ onComplete }: { onComplete: (profile: DriverProfile) => void }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const field = (key: keyof DriverProfile, label: string, placeholder: string, type = 'text') => <div key={key} className="space-y-2"><Label htmlFor={key} className="text-xs font-semibold">{label}</Label><Input id={key} required={key !== 'email'} type={type} value={profile[key]} placeholder={placeholder} maxLength={key === 'year' ? 4 : 100} min={type === 'number' ? 1980 : undefined} max={type === 'number' ? new Date().getFullYear() + 1 : undefined} onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))} className="h-12 rounded-xl bg-background"/></div>;
  return <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[.85fr_1fr] lg:gap-12">
    <section className="relative overflow-hidden rounded-3xl bg-[var(--forest)] p-7 text-[var(--cream)] sm:p-10">
      <span className="rounded-full border border-white/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#efac78]">Driver pre-registration · demo</span>
      <h1 className="mt-8 text-4xl font-extrabold leading-[1.15] sm:text-5xl">Your next chapter.<br/><span className="text-[#efac78]">Behind the wheel.</span></h1>
      <p className="mt-5 max-w-sm text-sm leading-7 text-[#c2d5c7]">Explore a better way to drive with KAYAN. Try the driver experience, from your first request to your final drop-off.</p>
      <div className="my-8 flex items-center justify-center gap-6 rounded-3xl border border-white/10 bg-white/5 py-8"><img src="/assets/kayan-eagle.png" alt="KAYAN eagle emblem" className="h-24 w-24 rounded-3xl object-cover"/><div><CarFront size={64} strokeWidth={1.2} className="text-[#efac78]"/><p className="mt-2 text-[10px] tracking-[.2em] text-[#c2d5c7]">DRIVE WITH PURPOSE</p></div></div>
      <div className="flex items-start gap-3"><ShieldCheck className="shrink-0 text-[#efac78]" size={22}/><p className="text-xs leading-6 text-[#c2d5c7]">Use fictional details only. No account is created, no files are accessed, and no application is sent or approved.</p></div>
    </section>
    <section className="rounded-3xl border bg-card p-6 sm:p-9">
      <ol className="mb-8 flex gap-3" aria-label="Pre-registration progress">{['Contact', 'Vehicle', 'Documents'].map((title, i) => <li key={title} className="flex flex-1 items-center gap-2 text-xs"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold ${i === step ? 'bg-primary text-white' : i < step ? 'bg-secondary text-foreground' : 'bg-muted text-muted-foreground'}`}>{i < step ? <Check size={15}/> : i + 1}</span><span className={i === step ? 'font-bold' : 'text-muted-foreground'}>{title}</span></li>)}</ol>
      <div className="mb-6"><span className="mb-4 inline-flex rounded-xl bg-secondary p-3 text-primary">{step === 0 ? <UserRound/> : step === 1 ? <CarFront/> : <FileCheck2/>}</span><h2 className="text-2xl font-extrabold">{['Let’s meet your demo driver.', 'Tell us about your vehicle.', 'Try document selection.'][step]}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{['Fictional contact details for this preview. Email is optional.', 'Illustrative vehicle details, not eligibility checks.', 'Select sample document labels. These are not uploads.'][step]}</p></div>
      <form onSubmit={e => { e.preventDefault(); if (step < 2) setStep(s => s + 1); else onComplete(profile); }}>
        {step === 0 && <div className="grid gap-4 sm:grid-cols-2">{field('name', 'Full name', 'e.g. Alex Banda')}{field('phone', 'Phone number', 'e.g. +260 970 000 000', 'tel')}{field('email', 'Email (optional)', 'alex@example.com', 'email')}{field('city', 'City', 'Lusaka')}</div>}
        {step === 1 && <div className="grid gap-4 sm:grid-cols-2">{field('make', 'Vehicle make', 'e.g. Toyota')}{field('model', 'Model', 'e.g. Corolla')}{field('year', 'Year', '2020', 'number')}{field('plate', 'Demo plate', 'e.g. DEMO 001')}{field('color', 'Vehicle colour', 'e.g. Silver')}</div>}
        {step === 2 && <div className="space-y-3">{documents.map(doc => <label key={doc} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${selected.includes(doc) ? 'border-primary bg-accent' : 'bg-background'}`}><input type="checkbox" className="h-4 w-4 accent-[var(--copper)]" checked={selected.includes(doc)} onChange={e => setSelected(prev => e.target.checked ? [...prev, doc] : prev.filter(d => d !== doc))}/><FileCheck2 size={18} className="text-primary"/><span className="flex-1 text-xs font-semibold">{doc}<span className="mt-1 block text-[10px] font-normal text-muted-foreground">Fictional sample · no file selected</span></span></label>)}<label className="flex items-start gap-3 pt-3 text-xs leading-6 text-muted-foreground"><input required type="checkbox" className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--copper)]" checked={consent} onChange={e => setConsent(e.target.checked)}/>I understand this is a simulation. Selection does not submit documents or imply driver approval.</label></div>}
        <div className="mt-8 flex gap-3">{step > 0 && <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => setStep(s => s - 1)}><ArrowLeft size={16}/> Back</Button>}<Button type="submit" disabled={step === 2 && (selected.length !== documents.length || !consent)} className="kayan-action flex-1">{step === 2 ? 'Enter driver demo' : 'Continue'}<ArrowRight size={17} className="ml-2"/></Button></div>
        <p className="mt-4 text-center text-[10px] leading-5 text-muted-foreground">Details stay in page memory and clear on reload. Only the demo introduction completion preference is saved on this device.</p>
      </form>
    </section>
  </div>;
}
