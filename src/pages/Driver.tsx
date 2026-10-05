import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CarFront, CheckCircle2, Clock3, LayoutDashboard, MapPin, Power, RotateCcw, ShieldCheck, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ThemeSelect from '@/components/ThemeSelect';
import KayanLogo from '@/components/KayanLogo';
import GoogleKayanMap from '@/components/GoogleKayanMap';
import DriverRegistration, { type DriverProfile } from '@/components/driver/DriverRegistration';
import DriverTrip, { type DemoRequest } from '@/components/driver/DriverTrip';
import { toast } from 'sonner';

type HistoryTrip = DemoRequest & { status: 'Completed' | 'Cancelled' | 'Declined'; date: string };
const samples: Omit<DemoRequest, 'id'>[] = [
  { passenger: 'Chanda M. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'East Park Mall', fare: 85, distance: '6.2 km' },
  { passenger: 'Mwila B. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'Arcades Shopping Centre', fare: 70, distance: '5.0 km' },
  { passenger: 'Grace N. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'University of Zambia', fare: 95, distance: '7.4 km' },
];
const returningProfile: DriverProfile = { name: 'Demo Driver', phone: 'Not saved', email: '', city: 'Lusaka', make: 'Toyota', model: 'Corolla', year: '2020', plate: 'DEMO 001', color: 'Silver' };
const driverBuild = import.meta.env.VITE_APP_VARIANT === 'driver';
const formatElapsed = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
};

export default function Driver() {
  const [registered, setRegistered] = useState(() => { try { return localStorage.getItem('kayan-driver-intro') === 'complete'; } catch { return false; } });
  const [profile, setProfile] = useState<DriverProfile>(returningProfile);
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
  const reset = () => { try { localStorage.removeItem('kayan-driver-intro'); } catch { /* Device storage may be unavailable. */ } setRegistered(false); setProfile(returningProfile); setOnline(false); setOnlineSince(null); setRequest(null); setActive(null); setHistory([]); setStage(0); setSequence(0); setView('dashboard'); setResetOpen(false); };
  const immersiveTrip = view === 'dashboard' && (online || !!active || !!request);
  const navItems = [{ key: 'dashboard' as const, label: 'Drive', icon: LayoutDashboard }, { key: 'earnings' as const, label: 'Earnings', icon: Wallet }, { key: 'history' as const, label: 'Trip history', icon: Clock3 }];
  const renderNavItems = () => navItems.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setView(key)} aria-current={view === key ? 'page' : undefined} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-3 text-[10px] font-semibold transition-colors sm:gap-2 sm:px-4 sm:text-xs ${view === key ? 'bg-[var(--forest)] text-[var(--cream)]' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><Icon size={16} className={`shrink-0 ${view === key ? 'text-[#efac78]' : ''}`}/><span className="whitespace-nowrap">{label}</span>{key === 'history' && history.length > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-white">{history.length}</span>}</button>);
  const onlineSummary = <div className="grid grid-cols-3 gap-2 border-y border-white/15 py-2.5">
    <div className="min-w-0"><p className="text-[8px] text-[#b8cbbd]">Earnings</p><p className="mt-0.5 truncate text-[11px] font-bold">K{earnings.toFixed(2)}</p></div>
    <div className="min-w-0"><p className="text-[8px] text-[#b8cbbd]">Completed trips</p><p className="mt-0.5 truncate text-[11px] font-bold">{String(completed.length).padStart(2, '0')}</p></div>
    <div className="min-w-0"><p className="text-[8px] text-[#b8cbbd]">Vehicle</p><p className="mt-0.5 truncate text-[11px] font-bold">{profile.make} {profile.model}</p></div>
  </div>;
  const waitingPanel = <section className="rounded-2xl border border-white/15 bg-[var(--forest)]/95 p-3 text-[var(--cream)] shadow-xl backdrop-blur sm:p-4">
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-[10px] font-bold text-[#efac78]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#efac78]"/>ONLINE · DEMO</span>
      <span className="font-mono text-[10px] tabular-nums text-[#b8cbbd]">{formatElapsed(onlineSeconds)}</span>
    </div>
    {onlineSummary}
    {request ? <>
      <div className="flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0"><p className="text-[8px] font-bold uppercase tracking-widest text-[#efac78]">New demo request · {request.id}</p><p className="mt-1 truncate text-xs font-bold">{request.passenger}</p></div>
        <div className="shrink-0 text-right"><p className="text-sm font-extrabold text-[#efac78]">K{request.fare}</p><p className="text-[9px] text-[#b8cbbd]">{request.distance} · illustrative</p></div>
      </div>
      <div className="my-2 grid grid-cols-2 gap-3 border-b border-white/15 py-2">
        {[request.pickup, request.destination].map((place, index) => <div key={place} className="min-w-0"><p className="text-[8px] text-[#b8cbbd]">{index === 0 ? 'Pickup' : 'Drop-off'}</p><p className="mt-0.5 truncate text-[10px] font-semibold">{place}</p></div>)}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-10 px-2 text-[9px] text-[#b8cbbd] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => { record(request, 'Declined'); setRequest(null); toast('Demo request declined. No passenger notified.'); }}>Decline</Button>
        <Button variant="ghost" className="h-10 px-2 text-[9px] text-[#b8cbbd] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => { setOnline(false); setOnlineSince(null); setRequest(null); }}>Go offline</Button>
        <Button className="kayan-action h-10 flex-1 px-2 text-[10px]" onClick={() => { setActive(request); setRequest(null); setStage(0); }}><CheckCircle2 size={14} className="mr-1.5"/>Accept request</Button>
      </div>
    </> : <div className="flex items-center justify-between gap-3 pt-2">
      <p className="text-[10px] text-[#b8cbbd]">Waiting for the next demo request.</p>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" className="h-9 px-2 text-[9px] text-[#b8cbbd] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => { setOnline(false); setOnlineSince(null); }}>Go offline</Button>
        <Button className="kayan-action h-9 px-3 text-[10px]" onClick={generateRequest}>Generate request</Button>
      </div>
    </div>}
  </section>;
  return <div className={`mx-auto min-h-[100svh] w-full overflow-x-clip ${immersiveTrip ? '' : 'max-w-5xl md:border-x'}`}>
      <header className="flex min-h-16 flex-nowrap items-center justify-between gap-2 border-b bg-card px-3 py-3 sm:min-h-20 sm:px-8 sm:py-4"><div className="flex min-w-0 items-center gap-2 sm:gap-3"><KayanLogo className="h-8 w-8 shrink-0 sm:h-10 sm:w-10"/><div className="min-w-0"><p className="display-font whitespace-nowrap text-sm font-extrabold tracking-[.02em] sm:text-lg sm:tracking-[.12em]">KAYAN <span className="text-primary">DRIVER</span></p><p className="mt-1 hidden truncate text-[10px] text-muted-foreground sm:block">{registered ? `${profile.name} · ${profile.city}` : 'Separate driver experience · Lusaka, Zambia'}</p></div></div><div className="flex shrink-0 items-center gap-2 sm:gap-3"><span className="hidden rounded-full border border-primary/30 bg-accent px-3 py-1.5 text-[9px] font-bold tracking-widest sm:inline-flex">DEMO ONLY</span><ThemeSelect/></div></header>
      {registered && <nav aria-label="Driver navigation" className="driver-section-nav sticky top-0 z-40 hidden grid-cols-3 gap-2 border-b bg-card/95 px-4 py-2 shadow-sm backdrop-blur sm:grid">{renderNavItems()}</nav>}
      {registered && <nav aria-label="Driver navigation" className="fixed inset-x-0 bottom-0 z-[600] grid grid-cols-3 gap-1 border-t bg-card/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur sm:hidden">{renderNavItems()}</nav>}
      <main className={`w-full ${immersiveTrip ? 'p-0' : 'p-3 pb-24 sm:p-6 lg:p-8'}`}>
        {immersiveTrip ? <div className="relative h-[calc(100svh-121px)] min-h-[420px] sm:h-[calc(100svh-136px)] sm:min-h-[420px]"><GoogleKayanMap hasRoute={!!active} destination={active?.destination || request?.destination || ''} stage={active ? stage : null} immersive/><div className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-xl">{active ? <DriverTrip key={active.id} request={active} stage={stage} onStage={setStage} onFinish={finish} compact onlineDuration={formatElapsed(onlineSeconds)}/> : waitingPanel}</div></div> : <>
        {registered && view === 'dashboard' && <section className="mx-auto mb-5 flex w-full max-w-lg flex-col items-center gap-4 text-center"><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-primary sm:text-[10px]">YOUR ROAD. YOUR OPPORTUNITY.</p><h1 className="mt-1.5 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">Ready for your next journey?</h1><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground sm:text-xs">Take the driver experience for a spin. You control every stage.</p></div><label htmlFor="driver-online" className={`relative flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 overflow-visible rounded-2xl border px-4 py-2.5 text-xs font-bold shadow-sm transition-colors ${online ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-foreground'}`}><Power size={17} className={online ? 'text-primary' : 'text-muted-foreground'}/><span>{online ? `Online · ${formatElapsed(onlineSeconds)}` : 'Go online · demo'}</span><span className="relative inline-flex"><span aria-hidden="true" className={online ? 'absolute -inset-1 rounded-full bg-primary/35 motion-safe:animate-ping' : 'hidden'}/><Switch id="driver-online" checked={online} disabled={!!active} onCheckedChange={value => { setOnline(value); setOnlineSince(value ? Date.now() : null); if (value) generateRequest(); else setRequest(null); }} className="relative z-10 data-[state=checked]:bg-primary"/></span></label></section>}
        {registered && view === 'dashboard' && <div className="mb-6"><GoogleKayanMap hasRoute={!!active || !!request} destination={(active || request)?.destination || ''} stage={active ? stage : null}/></div>}
        <div className="mb-6 flex items-start gap-3 rounded-2xl border bg-secondary/60 px-4 py-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary"/><p className="text-[11px] leading-5 text-muted-foreground"><strong className="text-foreground">Interactive demo, not an operating service.</strong> No live dispatch, payments, uploads, document review, or approval. Use fictional details only.</p></div>
        {!registered ? <DriverRegistration onComplete={p => { setProfile(p); setRegistered(true); try { localStorage.setItem('kayan-driver-intro', 'complete'); } catch { /* The demo still works without device storage. */ } toast.success('Demo introduction complete. No application submitted or approved.'); }}/> : view === 'dashboard' ? <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">{[{ label: 'Simulated earnings', value: `K${earnings.toFixed(2)}`, note: 'Illustrative gross fares · not payable', icon: Wallet }, { label: 'Completed demo trips', value: String(completed.length).padStart(2, '0'), note: 'This session only', icon: CheckCircle2 }, { label: 'Your demo vehicle', value: `${profile.make} ${profile.model}`, note: `${profile.color} · ${profile.plate}`, icon: CarFront }].map(({ label, value, note, icon: Icon }) => <section key={label} className="flex items-center gap-4 rounded-2xl border bg-card p-5"><span className="rounded-2xl bg-secondary p-3 text-primary"><Icon size={22}/></span><div className="min-w-0"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-extrabold">{value}</p><p className="mt-1 break-words text-[10px] text-muted-foreground">{note}</p></div></section>)}</div>
          <div>{active ? <DriverTrip key={active.id} request={active} stage={stage} onStage={setStage} onFinish={finish}/> : request ? <section className="enter rounded-3xl border border-primary/40 bg-card p-6"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-primary">Simulated ride request</p><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">{request.id}</span></div><h2 className="mt-4 text-2xl font-extrabold">A new journey awaits.</h2><p className="mt-2 text-xs text-muted-foreground">Generated locally · no live passenger or timeout</p><div className="my-6 rounded-2xl bg-secondary p-5"><p className="text-sm font-bold">{request.passenger}</p><p className="mt-2 text-xs text-muted-foreground">KAYAN Standard · {request.distance} illustrative</p><div className="mt-5 space-y-4">{[request.pickup, request.destination].map((place, i) => <div key={i} className="flex gap-3"><MapPin size={17} className="mt-0.5 shrink-0 text-primary"/><div><p className="text-[10px] text-muted-foreground">{i === 0 ? 'Pickup' : 'Destination'}</p><p className="mt-1 text-xs font-semibold">{place}</p></div></div>)}</div></div><div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] text-muted-foreground">Illustrative fare</p><p className="text-3xl font-extrabold">K{request.fare}</p></div><p className="text-[10px] text-muted-foreground">Not a real quote or payout</p></div><Button className="kayan-action w-full" onClick={() => { setActive(request); setRequest(null); setStage(0); }}><CheckCircle2 size={17} className="mr-2"/>Accept demo request</Button><Button variant="outline" className="mt-3 h-12 w-full rounded-xl" onClick={() => { record(request, 'Declined'); setRequest(null); toast('Demo request declined. No passenger notified.'); }}><X size={17} className="mr-2"/>Decline demo request</Button></section> : <section className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border bg-card p-8 text-center"><span className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-secondary text-primary"><CarFront size={48} strokeWidth={1.4}/></span><h2 className="text-2xl font-extrabold">{online ? 'You’re in the driver’s seat.' : 'Take a moment. Then drive.'}</h2><p className="mb-6 mt-3 text-sm leading-6 text-muted-foreground">{online ? 'Generate another fictional request to explore a new trip. Nothing is dispatched automatically.' : 'Go online to reveal a fictional ride request. Your device GPS is separate from demo dispatch.'}</p><Button className="kayan-action" onClick={goOnlineAndGenerateRequest}>{online ? 'Generate demo request' : 'Go online · demo'}<ArrowRight size={17} className="ml-2"/></Button></section>}<div className="mt-4 rounded-2xl border bg-card p-4 text-xs leading-6 text-muted-foreground"><strong className="text-foreground">{active ? 'Finish or cancel your demo trip to go offline.' : 'Your availability is simulated.'}</strong><br/>Switching offline removes any pending demo request.</div></div>
        </> : <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">YOUR ROAD. YOUR OPPORTUNITY.</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">{view === 'earnings' ? 'Your demo earnings, at a glance.' : 'Every demo journey, in one place.'}</h1><p className="mt-2 text-xs text-muted-foreground">Illustrative totals from this page session only. Reload clears trips and earnings.</p></div></div>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">{[{ label: 'Simulated earnings', value: `K${earnings.toFixed(2)}`, note: 'Illustrative gross fares · not payable', icon: Wallet }, { label: 'Completed demo trips', value: String(completed.length).padStart(2, '0'), note: 'This session only', icon: CheckCircle2 }, { label: 'Your demo vehicle', value: `${profile.make} ${profile.model}`, note: `${profile.color} · ${profile.plate}`, icon: CarFront }].map(({ label, value, note, icon: Icon }) => <section key={label} className="flex items-center gap-4 rounded-2xl border bg-card p-5"><span className="rounded-2xl bg-secondary p-3 text-primary"><Icon size={22}/></span><div className="min-w-0"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-extrabold">{value}</p><p className="mt-1 break-words text-[10px] text-muted-foreground">{note}</p></div></section>)}</div>
          <section className="min-h-[400px] rounded-3xl border bg-card p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{view === 'earnings' ? 'Earnings breakdown' : 'Session trip history'}</h2><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">No real transactions</span></div>{view === 'earnings' && <div className="my-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-secondary p-6"><p className="text-xs text-muted-foreground">Gross simulated fares</p><p className="mt-3 text-4xl font-extrabold">K{earnings.toFixed(2)}</p><p className="mt-3 text-xs text-muted-foreground">Completed trips only. No fees or net earnings inferred.</p></div><div className="rounded-2xl border p-6"><p className="text-xs text-muted-foreground">Actual payable balance</p><p className="mt-3 text-4xl font-extrabold">K0.00</p><p className="mt-3 text-xs text-muted-foreground">No payments, wallet, or withdrawals connected.</p></div></div>}{(view === 'earnings' ? completed : history).length === 0 ? <div className="py-12 text-center"><img src="/assets/ride-empty.png" alt="Illustrated taxi" className="mx-auto h-32 w-32 rounded-3xl"/><h3 className="mt-4 text-lg font-bold">{view === 'earnings' ? 'Your demo earnings start with a trip.' : 'A fresh start for every journey.'}</h3><p className="mb-5 mt-2 text-xs text-muted-foreground">Try a fictional ride from the Drive dashboard.</p><Button className="kayan-action" onClick={() => setView('dashboard')}>Back to Drive <ArrowRight size={16} className="ml-2"/></Button></div> : <div className="mt-6 space-y-3">{(view === 'earnings' ? completed : history).map(trip => <article key={trip.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-4"><span className="rounded-xl bg-secondary p-3"><CarFront size={22}/></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{trip.destination}</p><p className="mt-1 text-[10px] text-muted-foreground">{trip.id} · {trip.date}</p><p className="mt-1 text-[10px] text-muted-foreground">From {trip.pickup}</p></div><div className="text-right"><p className="text-sm font-bold">K{trip.status === 'Completed' ? trip.fare.toFixed(2) : '0.00'}</p><p className="mt-1 text-[10px] text-muted-foreground">{trip.status} · Demo only</p></div></article>)}</div>}</section>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5"><div><h3 className="text-xs font-bold">Subscription & rewards</h3><p className="mt-1 text-xs text-muted-foreground">Unfinalized. No prices, plans, rewards, or eligibility promises are set in this demo.</p></div><span className="rounded-full bg-secondary px-3 py-1.5 text-[10px] font-semibold">To be confirmed</span></div>
          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted-foreground"><span>KAYAN Driver · Separate interactive demo · Trips clear on reload</span><div className="flex gap-4">{!driverBuild && <Link to="/" className="hover:text-primary">Passenger demo</Link>}<button onClick={() => setResetOpen(true)} className="flex items-center gap-1.5 hover:text-primary"><RotateCcw size={12}/>Restart pre-registration</button></div></footer>
        </>}
        </>}
      </main>
    <Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent className="max-w-md rounded-3xl p-7"><DialogHeader><DialogTitle>Restart the driver demo?</DialogTitle><DialogDescription>This clears the introduction preference and this session’s profile, trips, chat, and earnings. Nothing was submitted to KAYAN.</DialogDescription></DialogHeader><Button className="kayan-action" onClick={reset}>Clear demo and start again</Button><Button variant="outline" className="h-11 rounded-xl" onClick={() => setResetOpen(false)}>Keep exploring</Button></DialogContent></Dialog>
  </div>;
}
