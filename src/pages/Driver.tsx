import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CarFront, CheckCircle2, Clock3, LayoutDashboard, LogOut, MapPin, Menu, Power, RotateCcw, ShieldCheck, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ThemeSelect from '@/components/ThemeSelect';
import GoogleKayanMap from '@/components/GoogleKayanMap';
import DriverRegistration, { type DriverProfile } from '@/components/driver/DriverRegistration';
import DriverDatabaseUnavailable from '@/components/driver/DriverDatabaseUnavailable';
import DriverPhoneLogin from '@/components/driver/DriverPhoneLogin';
import DriverTrip, { type DemoRequest } from '@/components/driver/DriverTrip';
import { isSupabaseConfigured, restoreDemoDriverProfile, saveDemoDriverProfile } from '@/lib/supabase';
import { signOutDriver } from '@/lib/driver-phone-auth';
import type { DriverDocuments } from '@/lib/driver-documents';
import { toast } from 'sonner';

type HistoryTrip = DemoRequest & { status: 'Completed' | 'Cancelled' | 'Declined'; date: string };
const samples: Omit<DemoRequest, 'id'>[] = [
  { passenger: 'Chanda M. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'East Park Mall', fare: 85, distance: '6.2 km' },
  { passenger: 'Mwila B. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'Arcades Shopping Centre', fare: 70, distance: '5.0 km' },
  { passenger: 'Grace N. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'University of Zambia', fare: 95, distance: '7.4 km' },
];
const returningProfile: DriverProfile = { name: 'Demo Driver', phone: 'Not saved', city: 'Lusaka', make: 'Toyota', model: 'Corolla', year: '2020', plate: 'DEMO 001', color: 'Silver' };
const driverBuild = import.meta.env.VITE_APP_VARIANT === 'driver';
const formatElapsed = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
};

export default function Driver() {
  const [registered, setRegistered] = useState(false);
  const [profile, setProfile] = useState<DriverProfile>(returningProfile);
  const [registrationProfile, setRegistrationProfile] = useState<Partial<DriverProfile>>();
  const [registrationPhoneVerified, setRegistrationPhoneVerified] = useState(false);
  const [registrationNeedsDocuments, setRegistrationNeedsDocuments] = useState(false);
  const [registrationNeedsPhoneVerification, setRegistrationNeedsPhoneVerification] = useState(false);
  const [phoneLoginOpen, setPhoneLoginOpen] = useState(false);
  const databaseConfigured = isSupabaseConfigured();
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState('');
  const [databaseRevision, setDatabaseRevision] = useState(0);
  const [view, setView] = useState<'dashboard' | 'earnings' | 'history'>('dashboard');
  const [online, setOnline] = useState(false);
  const [onlineSince, setOnlineSince] = useState<number | null>(null);
  const [onlineSeconds, setOnlineSeconds] = useState(0);
  const [request, setRequest] = useState<DemoRequest | null>(null);
  const [active, setActive] = useState<DemoRequest | null>(null);
  const [stage, setStage] = useState(0);
  const [sequence, setSequence] = useState(0);
  const [history, setHistory] = useState<HistoryTrip[]>([]);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setDatabaseLoading(true);
    setDatabaseError('');
    if (!databaseConfigured) {
      setDatabaseLoading(false);
      return () => { cancelled = true; };
    }
    void restoreDemoDriverProfile().then(savedDriver => {
      if (cancelled) return;
      if (savedDriver) {
        const initialProfile = savedDriver.profile ?? (savedDriver.phone ? { phone: savedDriver.phone } : undefined);
        if (savedDriver.profile) setProfile(savedDriver.profile);
        setRegistrationProfile(initialProfile);
        setRegistrationPhoneVerified(savedDriver.phoneVerified);
        setRegistrationNeedsDocuments(!!savedDriver.profile && !savedDriver.documentsComplete);
        setRegistrationNeedsPhoneVerification(!!savedDriver.profile && !savedDriver.phoneVerified);
        setRegistered(!!savedDriver.profile && savedDriver.documentsComplete && savedDriver.phoneVerified);
      } else {
        setRegistrationProfile(undefined);
        setRegistrationPhoneVerified(false);
        setRegistrationNeedsDocuments(false);
        setRegistrationNeedsPhoneVerification(false);
        setRegistered(false);
      }
    }).catch(error => {
      if (!cancelled) setDatabaseError(error instanceof Error ? error.message : 'Could not load the saved demo profile.');
    }).finally(() => {
      if (!cancelled) setDatabaseLoading(false);
    });
    return () => { cancelled = true; };
  }, [databaseConfigured, databaseRevision]);
  useEffect(() => {
    if (onlineSince === null) {
      setOnlineSeconds(0);
      return;
    }
    const updateElapsed = () => setOnlineSeconds(Math.floor((Date.now() - onlineSince) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [onlineSince]);
  const completed = history.filter(t => t.status === 'Completed');
  const earnings = completed.reduce((sum, t) => sum + t.fare, 0);
  const generateRequest = () => { setRequest({ ...samples[sequence % samples.length], id: `KD-${String(sequence + 1).padStart(3, '0')}` }); setSequence(n => n + 1); };
  const goOnlineAndGenerateRequest = () => {
    if (!online) {
      setOnline(true);
      setOnlineSince(Date.now());
    }
    generateRequest();
  };
  const record = (trip: DemoRequest, status: HistoryTrip['status']) => setHistory(h => [{ ...trip, status, date: new Date().toLocaleString() }, ...h]);
  const finish = (cancelled: boolean) => { if (!active) return; record(active, cancelled ? 'Cancelled' : 'Completed'); setActive(null); setStage(0); toast.success(cancelled ? 'Demo trip cancelled. No charge.' : 'Trip simulation complete. No payment or payout.'); };
  const reset = () => { setRegistered(false); setProfile(returningProfile); setOnline(false); setOnlineSince(null); setRequest(null); setActive(null); setHistory([]); setStage(0); setSequence(0); setView('dashboard'); setResetOpen(false); };
  const completeRegistration = async (newProfile: DriverProfile, documents: DriverDocuments) => {
    await saveDemoDriverProfile(newProfile, documents);
    setProfile(newProfile);
    setRegistrationProfile(newProfile);
    setRegistrationPhoneVerified(true);
    setRegistrationNeedsDocuments(false);
    setRegistrationNeedsPhoneVerification(false);
    setRegistered(true);
    toast.success('Driver application and required documents submitted to private KAYAN storage. Application is not approved.');
  };
  const retryDatabase = () => {
    setDatabaseError('');
    setDatabaseLoading(true);
    setDatabaseRevision(revision => revision + 1);
  };
  const signOut = async () => {
    try {
      await signOutDriver();
      setRegistered(false);
      setPhoneLoginOpen(true);
      setRegistrationProfile(undefined);
      setRegistrationPhoneVerified(false);
      setRegistrationNeedsDocuments(false);
      setRegistrationNeedsPhoneVerification(false);
      setProfile(returningProfile);
      setOnline(false);
      setOnlineSince(null);
      setRequest(null);
      setActive(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sign out of the driver account.');
    }
  };
  const phoneAuthenticationComplete = () => {
    setPhoneLoginOpen(false);
    setRegistrationNeedsPhoneVerification(false);
    retryDatabase();
  };
  const immersiveTrip = view === 'dashboard' && (online || !!active || !!request);
  const navItems = [{ key: 'dashboard' as const, label: 'Drive', icon: LayoutDashboard }, { key: 'earnings' as const, label: 'Earnings', icon: Wallet }, { key: 'history' as const, label: 'Trip history', icon: Clock3 }];
  const renderNavItems = () => navItems.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setView(key)} aria-current={view === key ? 'page' : undefined} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-3 text-[10px] font-semibold transition-colors sm:gap-2 sm:px-4 sm:text-xs ${view === key ? 'bg-[var(--forest)] text-[var(--cream)]' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><Icon size={16} className={`shrink-0 ${view === key ? 'text-[#efac78]' : ''}`}/><span className="whitespace-nowrap">{label}</span>{key === 'history' && history.length > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-white">{history.length}</span>}</button>);
  const onlineSummary = <div className="driver-summary-grid driver-map-summary grid grid-cols-3 gap-3 border-y border-white/20 py-3">
    <div className="min-w-0"><p className="text-[10px] text-[#d0ded5]">Earnings</p><p className="mt-1 truncate text-xs font-bold">K{earnings.toFixed(2)}</p></div>
    <div className="min-w-0"><p className="text-[10px] text-[#d0ded5]">Completed trips</p><p className="mt-1 truncate text-xs font-bold">{String(completed.length).padStart(2, '0')}</p></div>
    <div className="min-w-0"><p className="text-[10px] text-[#d0ded5]">Vehicle</p><p className="mt-1 truncate text-xs font-bold">{profile.make} {profile.model}</p></div>
  </div>;
  const waitingPanel = <section className={`driver-map-panel rounded-2xl border p-3 shadow-xl sm:p-4 ${request ? 'driver-map-panel--request' : 'driver-map-panel--waiting'}`}>
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-[11px] font-bold text-[#ffbd8b]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#ffbd8b]"/>ONLINE · DEMO</span>
      <span className="font-mono text-xs tabular-nums text-[#d0ded5]">{formatElapsed(onlineSeconds)}</span>
    </div>
    {onlineSummary}
    {request ? <>
      <div className="flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-[#ffbd8b]">New demo request · {request.id}</p><p className="mt-0.5 truncate text-sm font-bold">{request.passenger}</p></div>
        <div className="shrink-0 text-right"><p className="text-base font-extrabold text-[#ffbd8b]">K{request.fare}</p><p className="text-[10px] text-[#d0ded5]">{request.distance} · illustrative</p></div>
      </div>
      <div className="my-2 grid grid-cols-2 gap-3 border-b border-white/20 py-2">
        {[request.pickup, request.destination].map((place, index) => <div key={place} className="min-w-0"><p className="text-[10px] text-[#d0ded5]">{index === 0 ? 'Pickup' : 'Drop-off'}</p><p className="mt-1 truncate text-xs font-semibold">{place}</p></div>)}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="driver-decline-action h-10 px-3 text-[10px]" onClick={() => { record(request, 'Declined'); setRequest(null); toast('Demo request declined. No passenger notified.'); }}>Decline</Button>
        <Button variant="ghost" className="h-10 px-3 text-[10px] text-[#d0ded5] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => { setOnline(false); setOnlineSince(null); setRequest(null); }}>Go offline</Button>
        <span className="driver-request-accept-wrap relative min-w-0 flex-1">
          <span aria-hidden="true" className="driver-request-pulse pointer-events-none absolute inset-0 z-20 rounded-xl"/>
          <Button className="kayan-action relative z-10 h-10 w-full px-3 text-[11px]" onClick={() => { setActive(request); setRequest(null); setStage(0); }}><CheckCircle2 size={15} className="mr-1.5"/>Accept request</Button>
        </span>
      </div>
    </> : <div className="flex items-center justify-between gap-3 pt-2">
      <p className="text-xs text-[#d0ded5]">Waiting for the next demo request.</p>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" className="h-9 px-2 text-[9px] text-[#b8cbbd] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => { setOnline(false); setOnlineSince(null); }}>Go offline</Button>
        <Button className="kayan-action h-9 px-3 text-[10px]" onClick={generateRequest}>Generate request</Button>
      </div>
    </div>}
  </section>;
  return <div className={`driver-app-shell min-h-[100svh] overflow-x-clip ${immersiveTrip ? 'driver-app-shell--immersive' : ''}`}>
      <header className="driver-app-header relative flex min-h-16 flex-nowrap items-center justify-between gap-2 border-b bg-card px-3 py-3 sm:min-h-20 sm:px-8 sm:py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Open driver profile menu" className="driver-profile-trigger h-10 w-10 shrink-0 rounded-xl"><Menu size={21}/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="w-64 rounded-2xl p-2">
            <DropdownMenuLabel className="px-3 py-2">
              <span className="block truncate text-sm font-bold">{registered ? profile.name : 'Driver profile'}</span>
              <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{registered ? `${profile.city} · ${profile.make} ${profile.model}` : 'Complete the demo introduction to view your profile'}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator/>
            <DropdownMenuItem disabled={!registered} onSelect={() => setResetOpen(true)} className="rounded-xl px-3 py-2.5"><RotateCcw size={15} className="mr-2"/>Restart pre-registration</DropdownMenuItem>
            <DropdownMenuItem disabled={!registered} onSelect={() => void signOut()} className="rounded-xl px-3 py-2.5"><LogOut size={15} className="mr-2"/>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="driver-header-title absolute left-1/2 -translate-x-1/2 text-center">
          <p className="display-font whitespace-nowrap text-sm font-extrabold tracking-[.02em] sm:text-lg sm:tracking-[.12em]">KAYAN <span className="text-primary">DRIVER</span></p>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{registered ? profile.city : 'Driver demo'}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3"><span className="driver-demo-badge hidden rounded-full border border-primary/30 bg-accent px-3 py-1.5 text-[9px] font-bold tracking-widest sm:inline-flex">DEMO ONLY</span><ThemeSelect/></div>
      </header>
      {registered && <nav aria-label="Driver navigation" className="driver-section-nav sticky top-0 z-40 grid-cols-3 gap-2 border-b bg-card/95 px-4 py-2 shadow-sm backdrop-blur">{renderNavItems()}</nav>}
      {registered && <nav aria-label="Driver navigation" className="driver-mobile-nav fixed inset-x-0 bottom-0 z-[600] grid grid-cols-3 gap-1 border-t bg-card/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur">{renderNavItems()}</nav>}
      <main className={`driver-app-main w-full ${immersiveTrip ? 'p-0' : 'p-3 pb-24 sm:p-6 lg:p-8'}`}>
        {immersiveTrip ? <div className="driver-map-stage relative"><GoogleKayanMap hasRoute={!!active} destination={active?.destination || request?.destination || ''} stage={active ? stage : null} immersive/><div className="driver-map-overlay absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-2xl">{active ? <DriverTrip key={active.id} request={active} stage={stage} onStage={setStage} onFinish={finish} compact onlineDuration={formatElapsed(onlineSeconds)}/> : waitingPanel}</div></div> : <>
        {registered && view === 'dashboard' && <section className="mx-auto mb-5 flex w-full max-w-lg flex-col items-center gap-4 text-center"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary sm:text-[10px]">YOUR ROAD. YOUR OPPORTUNITY.</p><h1 className="mt-1.5 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">Ready for your next journey?</h1><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground sm:text-xs">Take the driver experience for a spin. You control every stage.</p></div><label htmlFor="driver-online" className={`relative flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 overflow-visible rounded-2xl border px-4 py-2.5 text-xs font-bold shadow-sm transition-colors ${online ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-foreground'}`}><Power size={17} className={online ? 'text-primary' : 'text-muted-foreground'}/><span>{online ? `Online · ${formatElapsed(onlineSeconds)}` : 'Go online · demo'}</span><span className={`driver-online-switch relative inline-flex rounded-full p-1 ${online ? 'is-online' : 'is-offline'}`}><span aria-hidden="true" className="driver-online-pulse pointer-events-none absolute inset-0 rounded-full"/><Switch id="driver-online" checked={online} disabled={!!active} onCheckedChange={value => { setOnline(value); setOnlineSince(value ? Date.now() : null); if (value) generateRequest(); else setRequest(null); }} className="relative z-10 data-[state=checked]:bg-primary"/></span></label></section>}
        {registered && view === 'dashboard' && <div className="mb-6"><GoogleKayanMap hasRoute={!!active || !!request} destination={(active || request)?.destination || ''} stage={active ? stage : null}/></div>}
        <div className={`driver-section-disclaimer mb-6 flex items-start gap-3 rounded-2xl border bg-secondary/60 px-4 py-3 ${registered && view !== 'dashboard' ? 'driver-section-disclaimer--compact' : ''}`}><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary"/><p className="text-[11px] leading-5 text-muted-foreground"><strong className="text-foreground">Interactive demo, not an operating service.</strong> {registered && view !== 'dashboard' ? 'No live dispatch or payments. Application documents are held in private test storage; staff review is not available.' : 'No live dispatch or payments. Application files go to private test storage, but staff review and approval are not available. Do not submit genuine identity documents.'}</p></div>
        {!registered ? databaseLoading
          ? <section role="status" className="mx-auto max-w-xl rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Checking the saved demo profile…</section>
          : databaseError
            ? <section className="mx-auto max-w-xl rounded-2xl border bg-card p-6">
              <h1 className="text-xl font-bold">Could not load the saved demo profile</h1>
              <p role="alert" className="mt-3 text-sm leading-6 text-destructive">{databaseError}</p>
              <Button className="kayan-action mt-5" onClick={retryDatabase}>Try again</Button>
            </section>
            : !databaseConfigured
              ? <DriverDatabaseUnavailable/>
              : phoneLoginOpen
                ? <DriverPhoneLogin onAuthenticated={phoneAuthenticationComplete} onCancel={() => setPhoneLoginOpen(false)}/>
                : registrationNeedsPhoneVerification
                  ? <DriverPhoneLogin mode="link-account" initialPhone={registrationProfile?.phone} onAuthenticated={phoneAuthenticationComplete}/>
                  : <DriverRegistration key={registrationNeedsDocuments ? 'documents-needed' : registrationPhoneVerified ? 'verified-registration' : 'new-registration'} initialProfile={registrationProfile} phoneAlreadyVerified={registrationPhoneVerified} startAtDocuments={registrationNeedsDocuments} onComplete={completeRegistration} onSignIn={() => setPhoneLoginOpen(true)}/>
          : view === 'dashboard' ? <>
          <div className="driver-summary-grid mb-6 grid gap-3 sm:grid-cols-3">{[{ label: 'Simulated earnings', value: `K${earnings.toFixed(2)}`, note: 'Illustrative gross fares · not payable', icon: Wallet }, { label: 'Completed demo trips', value: String(completed.length).padStart(2, '0'), note: 'This session only', icon: CheckCircle2 }, { label: 'Your demo vehicle', value: `${profile.make} ${profile.model}`, note: `${profile.color} · ${profile.plate}`, icon: CarFront }].map(({ label, value, note, icon: Icon }) => <section key={label} className="flex items-center gap-4 rounded-2xl border bg-card p-5"><span className="rounded-2xl bg-secondary p-3 text-primary"><Icon size={22}/></span><div className="min-w-0"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-extrabold">{value}</p><p className="mt-1 break-words text-[10px] text-muted-foreground">{note}</p></div></section>)}</div>
          <div>{active ? <DriverTrip key={active.id} request={active} stage={stage} onStage={setStage} onFinish={finish}/> : request ? <section className="enter rounded-3xl border border-primary/40 bg-card p-6"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-primary">Simulated ride request</p><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">{request.id}</span></div><h2 className="mt-4 text-2xl font-extrabold">A new journey awaits.</h2><p className="mt-2 text-xs text-muted-foreground">Generated locally · no live passenger or timeout</p><div className="my-6 rounded-2xl bg-secondary p-5"><p className="text-sm font-bold">{request.passenger}</p><p className="mt-2 text-xs text-muted-foreground">KAYAN Standard · {request.distance} illustrative</p><div className="mt-5 space-y-4">{[request.pickup, request.destination].map((place, i) => <div key={i} className="flex gap-3"><MapPin size={17} className="mt-0.5 shrink-0 text-primary"/><div><p className="text-[10px] text-muted-foreground">{i === 0 ? 'Pickup' : 'Destination'}</p><p className="mt-1 text-xs font-semibold">{place}</p></div></div>)}</div></div><div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] text-muted-foreground">Illustrative fare</p><p className="text-3xl font-extrabold">K{request.fare}</p></div><p className="text-[10px] text-muted-foreground">Not a real quote or payout</p></div><Button className="kayan-action w-full" onClick={() => { setActive(request); setRequest(null); setStage(0); }}><CheckCircle2 size={17} className="mr-2"/>Accept demo request</Button><Button variant="outline" className="mt-3 h-12 w-full rounded-xl" onClick={() => { record(request, 'Declined'); setRequest(null); toast('Demo request declined. No passenger notified.'); }}><X size={17} className="mr-2"/>Decline demo request</Button></section> : <section className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border bg-card p-8 text-center"><span className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-secondary text-primary"><CarFront size={48} strokeWidth={1.4}/></span><h2 className="text-2xl font-extrabold">{online ? 'You’re in the driver’s seat.' : 'Take a moment. Then drive.'}</h2><p className="mb-6 mt-3 text-sm leading-6 text-muted-foreground">{online ? 'Generate another fictional request to explore a new trip. Nothing is dispatched automatically.' : 'Go online to reveal a fictional ride request. Your device GPS is separate from demo dispatch.'}</p><Button className="kayan-action" onClick={goOnlineAndGenerateRequest}>{online ? 'Generate demo request' : 'Go online · demo'}<ArrowRight size={17} className="ml-2"/></Button></section>}<div className="mt-4 rounded-2xl border bg-card p-4 text-xs leading-6 text-muted-foreground"><strong className="text-foreground">{active ? 'Finish or cancel your demo trip to go offline.' : 'Your availability is simulated.'}</strong><br/>Switching offline removes any pending demo request.</div></div>
        </> : <>
          <div className="driver-secondary-page">
          <div className="driver-section-intro mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">YOUR ROAD. YOUR OPPORTUNITY.</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight">{view === 'earnings' ? 'Your demo earnings, at a glance.' : 'Every demo journey, in one place.'}</h1><p className="mt-1 text-xs text-muted-foreground">Session-only totals; data clears on reload.</p></div></div>
          <section className="driver-section-content rounded-3xl border bg-card p-4 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{view === 'earnings' ? 'Earnings breakdown' : 'Session trip history'}</h2><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">No real transactions</span></div>{view === 'earnings' && <div className="driver-earnings-breakdown my-3 grid grid-cols-1 gap-2"><div className="rounded-2xl bg-secondary p-3"><p className="text-xs text-muted-foreground">Gross simulated fares</p><p className="mt-1 text-2xl font-extrabold">K{earnings.toFixed(2)}</p><p className="mt-1 text-[11px] text-muted-foreground">Completed trips only. No fees or net earnings inferred.</p></div><div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">Actual payable balance</p><p className="mt-1 text-2xl font-extrabold">K0.00</p><p className="mt-1 text-[11px] text-muted-foreground">No payments, wallet, or withdrawals connected.</p></div></div>}{(view === 'earnings' ? completed : history).length === 0 ? <div className="py-6 text-center"><img src="/assets/ride-empty.png" alt="Illustrated taxi" className="mx-auto h-20 w-20 rounded-3xl"/><h3 className="mt-2 text-lg font-bold">{view === 'earnings' ? 'Your demo earnings start with a trip.' : 'A fresh start for every journey.'}</h3><p className="mb-3 mt-1 text-xs text-muted-foreground">Try a fictional ride from the Drive dashboard.</p><Button className="kayan-action" onClick={() => setView('dashboard')}>Back to Drive <ArrowRight size={16} className="ml-2"/></Button></div> : <div className="driver-trip-list mt-3 space-y-2">{(view === 'earnings' ? completed : history).map(trip => <article key={trip.id} className="driver-trip-card flex flex-wrap items-center gap-4 rounded-2xl border p-3"><span className="driver-trip-icon rounded-xl bg-secondary p-2"><CarFront size={20}/></span><div className="driver-trip-details min-w-0 flex-1"><p className="text-sm font-bold">{trip.destination}</p><p className="mt-1 text-[10px] text-muted-foreground">{trip.id} · {trip.date}</p><p className="mt-1 text-[10px] text-muted-foreground">From {trip.pickup}</p></div><div className="driver-trip-status text-right"><p className="text-sm font-bold">K{trip.status === 'Completed' ? trip.fare.toFixed(2) : '0.00'}</p><p className="mt-1 text-[10px] text-muted-foreground">{trip.status} · Demo only</p></div></article>)}</div>}</section>
          <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted-foreground"><span>KAYAN Driver · Separate interactive demo · Trips clear on reload</span><span>Subscription & rewards: to be confirmed.</span><div className="flex gap-4">{!driverBuild && <Link to="/" className="hover:text-primary">Passenger demo</Link>}<button onClick={() => setResetOpen(true)} className="flex items-center gap-1.5 hover:text-primary"><RotateCcw size={12}/>Restart pre-registration</button></div></footer>
          </div>
        </>}
        </>}
      </main>
    <Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent className="max-w-md rounded-3xl p-7"><DialogHeader><DialogTitle>Restart the driver demo?</DialogTitle><DialogDescription>This clears the introduction preference and this session’s profile, trips, chat, and earnings. Nothing was submitted to KAYAN.</DialogDescription></DialogHeader><Button className="kayan-action" onClick={reset}>Clear demo and start again</Button><Button variant="outline" className="h-11 rounded-xl" onClick={() => setResetOpen(false)}>Keep exploring</Button></DialogContent></Dialog>
  </div>;
}
