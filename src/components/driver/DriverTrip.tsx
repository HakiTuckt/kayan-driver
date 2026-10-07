import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, MapPin, MessageCircle, Navigation, Phone, Send, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { NavigationProgress } from '@/components/GoogleKayanMap';
import type { FuelEstimate } from '@/lib/driver-fuel-estimate';

export type DemoRequest = { id: string; passenger: string; pickup: string; destination: string; fare: number; distance: string; offerId?: string; live?: boolean; stage?: 0 | 1 | 2 | 3 };
export const tripStages = ['Heading to pickup', 'At pickup', 'Trip in progress', 'Drop-off reached'];
export type RouteEstimate = { arrivalTime: string; distanceKm: number; fuel: FuelEstimate | null; navigation: NavigationProgress | null };
export const DAILY_EARNINGS_GOAL = 400;
export function DailyEarningsGoal({ earnings, className = '' }: { earnings: number; className?: string }) {
  const progress = Math.min(Math.max(earnings, 0) / DAILY_EARNINGS_GOAL, 1);
  return <div className={className}>
    <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px]">
      <span className="font-semibold text-[#d0ded5]">Daily earnings goal</span>
      <span className="shrink-0 font-bold tabular-nums">K{Math.max(earnings, 0).toFixed(2)} <span className="font-medium text-[#b8cbbd]">/ K{DAILY_EARNINGS_GOAL}</span></span>
    </div>
    <div role="progressbar" aria-label="Daily earnings goal" aria-valuemin={0} aria-valuemax={DAILY_EARNINGS_GOAL} aria-valuenow={Math.min(Math.max(earnings, 0), DAILY_EARNINGS_GOAL)} className="h-2 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-[#ffbd8b] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progress * 100}%` }}/>
    </div>
    <p className="mt-1 text-[9px] text-[#b8cbbd]">Completed trip fares · session only · no payout</p>
  </div>;
}
export default function DriverTrip({ request, stage, onStage, onFinish, compact = false, onlineDuration, routeEstimate, dailyEarnings = 0, stageBusy = false }: { request: DemoRequest; stage: number; onStage: (stage: 1 | 2 | 3) => void | Promise<void>; onFinish: (cancelled: boolean) => void; compact?: boolean; onlineDuration?: string; routeEstimate?: RouteEstimate | null; dailyEarnings?: number; stageBusy?: boolean }) {
  const [modal, setModal] = useState<'chat' | 'call' | null>(null);
  const [calling, setCalling] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<{ author: string; text: string }[]>([{ author: 'Passenger · scripted', text: 'Hi! I’ll be waiting by the main entrance.' }]);
  const [minimized, setMinimized] = useState(false);
  const navigationActive = !!routeEstimate?.navigation;
  const isMinimized = compact && navigationActive && minimized;
  useEffect(() => {
    if (!compact || !navigationActive) {
      setMinimized(false);
      return;
    }
    const timer = window.setTimeout(() => setMinimized(true), 1800);
    return () => window.clearTimeout(timer);
  }, [compact, navigationActive]);

  return <>
    <section className={compact
      ? `driver-map-panel relative rounded-2xl border shadow-xl transition-[max-height] duration-700 ease-in-out motion-reduce:transition-none ${isMinimized ? 'max-h-[82px] overflow-hidden' : 'max-h-[70svh] overflow-y-auto'}`
      : 'rounded-3xl border bg-card p-6'}>
    <div aria-hidden={isMinimized} inert={isMinimized ? true : undefined} className={`transition-opacity duration-300 ${compact ? 'p-4 sm:p-5' : ''} ${isMinimized ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
    {compact ? <>
      <div className="mb-4 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-[#ffbd8b]">{tripStages[stage]} · {request.id}</p><p className="mt-1 truncate text-sm font-semibold">{stage === 0 ? request.pickup : request.destination}</p></div><div className="shrink-0 text-right"><p className="text-xs text-[#d0ded5]">{stage + 1} / {tripStages.length}</p>{onlineDuration && <p className="mt-1 font-mono text-xs tabular-nums text-[#ffbd8b]">Online {onlineDuration}</p>}</div>{navigationActive && <Button type="button" variant="ghost" aria-label="Minimize trip details" aria-expanded={true} className="h-9 w-9 shrink-0 p-0 text-[#d0ded5] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => setMinimized(true)}><ChevronDown size={18}/></Button>}</div>
      <DailyEarningsGoal earnings={dailyEarnings} className="mb-4"/>
      {request.live && <p className="text-[10px] leading-4 text-[#d0ded5]">Your fresh GPS and trip stages are shared with this passenger only during this accepted ride. Marking arrival at pickup sends an in-app passenger update. Messaging and payments are not connected.</p>}
      {routeEstimate && <RouteEstimateDetails estimate={routeEstimate} compact/>}
      <div className="space-y-2">
        {!request.live && <div className="flex gap-2">
          <Button variant="outline" className="h-11 min-w-0 flex-1 rounded-xl border-white/25 bg-white/5 px-2 text-[11px] text-[var(--cream)] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => setModal('chat')}><MessageCircle size={16} className="mr-1.5 shrink-0"/>Chat</Button>
          <Button variant="outline" className="h-11 min-w-0 flex-1 rounded-xl border-white/25 bg-white/5 px-2 text-[11px] text-[var(--cream)] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => { setCalling(false); setModal('call'); }}><Phone size={16} className="mr-1.5 shrink-0"/>Call</Button>
          <Button variant="ghost" className="h-11 min-w-0 flex-1 px-2 text-[11px] text-[#d0ded5] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => onFinish(true)}>Cancel</Button>
        </div>}
        {request.live && <Button variant="ghost" className="h-10 w-full text-[11px] text-[#d0ded5] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => onFinish(true)}>Cancel live ride</Button>}
        <Button disabled={stageBusy} className="kayan-action h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-center text-[11px] leading-tight" onClick={() => { if (stage < 3) void onStage((stage + 1) as 1 | 2 | 3); else onFinish(false); }}>{stageBusy ? 'Updating passenger…' : (request.live ? ['Mark arrived at pickup', 'Start trip', 'Mark drop-off reached', 'Complete live ride'] : ['Simulate arrival at pickup', 'Start simulated trip', 'Simulate drop-off', 'Complete demo trip'])[stage]}{!stageBusy && <ArrowRight size={15} className="ml-1.5 inline shrink-0"/>}</Button>
      </div>
    </> : <>
    <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-widest text-primary">{request.live ? 'Live ride' : 'Active demo trip'}</span><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">{request.id}</span></div>
    <h2 className="mt-3 text-2xl font-extrabold">{tripStages[stage]}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{request.live ? 'Fresh GPS and ride stages are shared with this passenger for this accepted ride only. Marking arrival at pickup sends an in-app passenger update. Messaging and payments are not connected.' : 'Ride stages remain manual. On-map route instructions and estimates use this device’s location; there is no live passenger.'}</p>
    <ol className="my-6 space-y-4">{tripStages.map((title, i) => <li key={title} className={`flex items-center gap-3 text-xs ${i > stage ? 'text-muted-foreground' : 'font-semibold'}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full ${i <= stage ? 'bg-primary text-white' : 'bg-muted'}`}>{i < stage ? <CheckCircle2 size={15}/> : i + 1}</span>{title}{i === stage && <span className="ml-auto text-[10px] text-primary">Current</span>}</li>)}</ol>
    <div className="rounded-2xl bg-secondary p-4"><p className="flex items-center gap-2 text-sm font-bold"><UserRound size={18}/>{request.passenger}<span className="ml-auto text-[10px] font-normal">{request.live ? 'KAYAN passenger' : 'Demo passenger'}</span></p><div className="mt-4 space-y-3">{[request.pickup, request.destination].map((place, i) => <div key={i} className="flex items-start gap-2"><MapPin size={15} className="mt-1 shrink-0 text-primary"/><div><p className="text-[10px] text-muted-foreground">{i === 0 ? 'Pickup' : 'Drop-off'}</p><p className="text-xs font-semibold">{place}</p></div></div>)}</div></div>
    {routeEstimate && <RouteEstimateDetails estimate={routeEstimate}/>}
    {!request.live && <div className="my-4 grid grid-cols-2 gap-3"><Button variant="outline" className="h-11 rounded-xl text-xs" onClick={() => setModal('chat')}><MessageCircle size={16} className="mr-2"/>Demo chat</Button><Button variant="outline" className="h-11 rounded-xl text-xs" onClick={() => { setCalling(false); setModal('call'); }}><Phone size={16} className="mr-2"/>Demo call</Button></div>}
    <Button disabled={stageBusy} className="kayan-action w-full" onClick={() => { if (stage < 3) void onStage((stage + 1) as 1 | 2 | 3); else onFinish(false); }}>{stageBusy ? 'Updating passenger…' : (request.live ? ['Mark arrived at pickup', 'Start trip', 'Mark drop-off reached', 'Complete live ride'] : ['Simulate arrival at pickup', 'Start simulated trip', 'Simulate drop-off', 'Complete demo trip'])[stage]}{!stageBusy && <ArrowRight size={16} className="ml-2"/>}</Button>
    <Button variant="ghost" className="mt-2 h-10 w-full rounded-xl text-xs text-muted-foreground" onClick={() => onFinish(true)}>{request.live ? 'Cancel live ride' : 'Cancel demo trip · no charge'}</Button>
    </>}
    </div>
    {compact && routeEstimate?.navigation && <div aria-hidden={!isMinimized} inert={!isMinimized ? true : undefined} className={`absolute inset-x-3 top-0 flex h-[82px] items-center gap-3 px-0 transition-opacity duration-300 ${isMinimized ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#ffbd8b]"><Navigation size={18}/></span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#ffbd8b]">{tripStages[stage]} · {request.id}</p>
        <p className="mt-1 truncate text-[10px] text-[#d0ded5]">ETA {routeEstimate.arrivalTime} · {routeEstimate.distanceKm.toFixed(1)} km remaining</p>
      </div>
      {onlineDuration && <span className="hidden shrink-0 font-mono text-[10px] tabular-nums text-[#d0ded5] sm:inline">{onlineDuration}</span>}
      <Button type="button" variant="ghost" aria-label="Expand trip details" aria-expanded={false} className="h-10 w-10 shrink-0 p-0 text-[#d0ded5] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => setMinimized(false)}><ChevronUp size={19}/></Button>
    </div>}
    {compact && routeEstimate?.navigation && <div aria-hidden={!isMinimized} inert={!isMinimized ? true : undefined} role="progressbar" aria-label="Daily earnings goal" aria-valuemin={0} aria-valuemax={DAILY_EARNINGS_GOAL} aria-valuenow={Math.min(Math.max(dailyEarnings, 0), DAILY_EARNINGS_GOAL)} className={`absolute inset-x-3 bottom-0 h-1.5 overflow-hidden rounded-full bg-white/10 transition-opacity duration-300 motion-reduce:transition-none ${isMinimized ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <div className="h-full rounded-full bg-[#ffbd8b]" style={{ width: `${Math.min(Math.max(dailyEarnings, 0) / DAILY_EARNINGS_GOAL, 1) * 100}%` }}/>
    </div>}
    </section>
    <Dialog open={modal !== null} onOpenChange={open => { if (!open) { setModal(null); setCalling(false); } }}><DialogContent className="z-[1000] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl p-4 sm:p-6"><DialogHeader><DialogTitle>{modal === 'chat' ? 'Passenger chat demo' : 'Passenger call demo'}</DialogTitle><DialogDescription>No messages are delivered and no phone call is placed. Replies and connection states are scripted.</DialogDescription></DialogHeader>
      {modal === 'chat' ? <><div role="log" aria-label="Demo conversation" aria-live="polite" className="min-h-28 max-h-[min(40dvh,16rem)] space-y-3 overflow-y-auto rounded-2xl bg-background p-3 sm:p-4">{messages.map((message, i) => <div key={i} className={`max-w-[90%] rounded-2xl p-3 ${message.author === 'You' ? 'ml-auto bg-secondary' : 'border bg-card'}`}><p className="mb-1 text-[10px] font-bold text-primary">{message.author}</p><p className="break-words text-xs leading-5">{message.text}</p></div>)}</div><form className="flex shrink-0 gap-2" onSubmit={e => { e.preventDefault(); if (!draft.trim()) return; setMessages(m => [...m, { author: 'You', text: draft.trim() }, { author: 'Passenger · scripted', text: 'Thanks! See you at the pickup point. (Simulated reply)' }]); setDraft(''); }}><Input aria-label="Demo message" value={draft} maxLength={500} onChange={e => setDraft(e.target.value)} placeholder="Write a demo message…" className="h-12 min-w-0 rounded-xl"/><Button disabled={!draft.trim()} type="submit" className="kayan-action shrink-0 px-4" aria-label="Send demo message"><Send size={18}/></Button></form></> : <div className="py-2 text-center sm:py-4"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary sm:h-20 sm:w-20"><Phone size={28}/></span><p className="mt-3 text-lg font-bold sm:mt-5">{request.passenger}</p><p role="status" className="mb-4 mt-2 text-sm text-muted-foreground sm:mb-6">{calling ? 'Simulated connection · no audio or phone access' : 'Ready to preview a call'}</p><Button className="kayan-action w-full" onClick={() => { if (calling) { setCalling(false); setModal(null); } else setCalling(true); }}>{calling ? 'End simulated call' : 'Simulate connection'}</Button></div>}
    </DialogContent></Dialog>
  </>;
}

function RouteEstimateDetails({ estimate, compact = false }: { estimate: RouteEstimate; compact?: boolean }) {
  const fuelText = estimate.fuel
    ? `${estimate.fuel.minimum.toFixed(1)}–${estimate.fuel.maximum.toFixed(1)} ${estimate.fuel.unit}`
    : 'Enter engine size (e.g. 1.8 L) for an estimate';
  return <div className={`my-3 grid grid-cols-2 gap-3 rounded-xl border p-3 ${compact ? 'border-white/20 bg-white/5 text-[var(--cream)]' : 'bg-accent/60'}`}>
    <div><p className={`text-[9px] ${compact ? 'text-[#d0ded5]' : 'text-muted-foreground'}`}>Estimated arrival</p><p className="mt-1 text-sm font-bold">{estimate.arrivalTime}</p></div>
    <div><p className={`text-[9px] ${compact ? 'text-[#d0ded5]' : 'text-muted-foreground'}`}>Approx. fuel / energy</p><p className="mt-1 text-sm font-bold">{fuelText}</p></div>
    <p className={`col-span-2 text-[9px] leading-4 ${compact ? 'text-[#d0ded5]' : 'text-muted-foreground'}`}>Traffic-aware route · {estimate.distanceKm.toFixed(1)} km. Fuel use is a broad estimate, not a measured or manufacturer-rated figure.</p>
  </div>;
}
