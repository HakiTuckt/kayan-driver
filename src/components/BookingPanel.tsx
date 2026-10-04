import { useState } from 'react';
import { ArrowLeft, ArrowRight, Car, Check, ChevronRight, Clock3, CreditCard, Home, MapPin, Navigation, Search, ShieldCheck, Sparkles, Star, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export const destinations = [
  { name: 'Manda Hill Mall', address: 'Great East Road, Lusaka', distance: 3.8, price: 65, time: 12 },
  { name: 'EastPark Mall', address: 'Thabo Mbeki Road, Lusaka', distance: 6.2, price: 95, time: 18 },
  { name: 'Kenneth Kaunda Airport', address: 'Airport Road, Lusaka', distance: 24, price: 290, time: 40 },
  { name: 'Levy Junction Mall', address: 'Church Road, Lusaka', distance: 2.5, price: 50, time: 9 },
  { name: 'University of Zambia', address: 'Great East Road, Lusaka', distance: 7.1, price: 110, time: 22 },
];
export type Destination = typeof destinations[number];
export type Ride = { id: string; destination: Destination; pickup: string; category: string; price: number; payment: string; date: string; status: 'Completed' | 'Cancelled' };
export type ActiveRide = Omit<Ride, 'date' | 'status'>;

export default function BookingPanel({ destination, onDestination, onBook }: { destination: Destination | null; onDestination: (d: Destination | null) => void; onBook: (ride: ActiveRide) => void }) {
  const [query, setQuery] = useState('');
  const [pickup, setPickup] = useState('Rhodes Park, Lusaka');
  const [category, setCategory] = useState('KAYAN Classic');
  const [payment, setPayment] = useState('Cash');
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<Destination | null>(null);
  const results = destinations.filter(d => `${d.name} ${d.address}`.toLowerCase().includes(query.toLowerCase()));
  const choose = (d: Destination) => { onDestination(d); setQuery(d.name); setSearching(false); };
  const price = destination ? destination.price + (category === 'KAYAN Comfort' ? 30 : 0) : 0;
  return (
    <div className="enter flex h-full flex-col">
      {destination ? <button onClick={() => { onDestination(null); setQuery(''); }} className="mb-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ArrowLeft size={15}/> Change destination</button> : <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary"/> Made for your everyday</div><h2 className="text-[32px] font-extrabold tracking-tight">Where to?</h2><p className="mt-1.5 text-sm text-muted-foreground">Your next journey starts here.</p></div>}
      <div className="relative space-y-2 rounded-2xl border border-border bg-muted/40 p-3">
        <div className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center"><span className="h-3 w-3 rounded-full border-[3px] border-primary"/></div><div className="min-w-0 flex-1"><label htmlFor="pickup" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pickup location</label><Input id="pickup" value={pickup} maxLength={120} onChange={e => setPickup(e.target.value)} className="h-7 rounded-none border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"/></div><Navigation size={16} className="shrink-0 text-muted-foreground"/></div>
        <div className="ml-4 h-3 border-l border-dashed border-[#b7c4b9]"/>
        <div className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center"><MapPin size={18}/></div><div className="min-w-0 flex-1"><label htmlFor="destination" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your destination</label><Input id="destination" autoComplete="off" placeholder="Enter destination" value={query} onFocus={() => setSearching(true)} onChange={e => { setQuery(e.target.value); onDestination(null); setSearching(true); }} className="h-8 rounded-none border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"/></div><Search size={16} className="shrink-0 text-muted-foreground"/></div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Demo pickup is entered manually · optional device location is shown separately on the map</p>
      {!destination && <>
        <div className="my-5 grid grid-cols-2 gap-2"><button onClick={() => { if (saved) choose(saved); else { setSearching(true); toast.info('Choose a destination, then use “Save as home”.'); } }} className="flex items-center gap-2.5 rounded-xl border border-border p-3 text-left hover:bg-secondary"><Home size={17} className="text-primary"/><div><p className="text-xs font-bold">Home</p><p className="mt-0.5 max-w-[100px] truncate text-[10px] text-muted-foreground">{saved?.name || 'Add a place'}</p></div></button><button onClick={() => { setQuery(''); setSearching(true); }} className="flex items-center gap-2.5 rounded-xl border border-border p-3 text-left hover:bg-secondary"><MapPin size={17} className="text-primary"/><div><p className="text-xs font-bold">Explore Lusaka</p><p className="mt-0.5 text-[10px] text-muted-foreground">Popular places</p></div></button></div>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-bold">{searching ? 'Destination results' : 'Popular destinations'}</h3><span className="text-[10px] text-muted-foreground">Lusaka</span></div>
        <div className="space-y-1">{results.map(d => <button key={d.name} onClick={() => choose(d)} className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left hover:bg-secondary"><span className="rounded-full bg-secondary p-2.5"><MapPin size={16}/></span><div className="flex-1"><p className="text-xs font-semibold">{d.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{d.address}</p></div><ChevronRight size={15} className="text-muted-foreground"/></button>)}{!results.length && <p className="rounded-xl bg-secondary p-4 text-xs text-muted-foreground">No demo destinations found. Try “mall” or “airport”. Live address search is not connected.</p>}</div>
        <div className="mt-6 flex items-start gap-3 rounded-xl bg-accent p-4"><Sparkles size={18} className="shrink-0 text-primary"/><div><p className="text-xs font-bold">Not just a ride. A better ride.</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">A service designed around clean cars, courteous drivers, and you.</p></div></div>
      </>}
      {destination && <div className="enter">
        <div className="mt-4 flex items-center justify-between"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={14}/> {destination.time} min · {destination.distance} km</p><button onClick={() => { setSaved(destination); toast.success('Home saved for this session.'); }} className="text-[10px] font-bold text-primary">Save as home</button></div>
        <h3 className="mb-3 mt-6 text-sm font-bold">Choose your ride</h3>
        {['KAYAN Classic', 'KAYAN Comfort'].map((name, i) => <button key={name} onClick={() => setCategory(name)} className={`mb-2 flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${category === name ? 'border-primary bg-accent' : 'border-border hover:bg-secondary'}`}><span className="rounded-xl bg-card p-2"><Car size={30} strokeWidth={1.4}/></span><div className="flex-1"><p className="text-xs font-bold">{name}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Users size={11}/> 4 · {i ? 'Extra room, extra comfort' : 'Your everyday, elevated'}</p></div><div className="text-right"><p className="text-sm font-bold">K{destination.price + i * 30}</p><p className="mt-1 text-[10px] text-muted-foreground">Demo fare</p></div>{category === name && <Check size={15} className="text-primary"/>}</button>)}
        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-bold">Payment preference</legend>
          <div role="radiogroup" aria-label="Payment preference" className="grid grid-cols-2 gap-2">
            {['Cash', 'MTN MoMo', 'Airtel Money', 'Zamtel Kwacha'].map(p => <button type="button" role="radio" aria-checked={payment === p} key={p} onClick={() => setPayment(p)} className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-3 text-left text-xs font-semibold ${payment === p ? 'border-primary bg-accent' : 'border-border hover:bg-secondary'}`}><Wallet size={16} className="shrink-0 text-primary"/><span className="flex-1">{p}</span>{payment === p && <Check size={13} className="shrink-0 text-primary"/>}</button>)}
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground"><CreditCard size={16}/><span>Credit / debit card</span><span className="ml-auto rounded-full bg-secondary px-2 py-1 text-[9px]">Coming later</span></div>
        </fieldset>
        <div className="mt-3 rounded-xl bg-muted/50 p-3 text-[10px] leading-relaxed text-muted-foreground"><p><strong className="text-foreground">Demo preference only.</strong> No wallet request or payment is sent. Merchant integrations are not connected.</p><p className="mt-1">Never enter or share your mobile-money PIN or OTP in KAYAN. Authorize future payments only through your provider’s official flow.</p></div>
        <div className="my-5 flex items-center justify-between border-t pt-4"><span className="text-sm font-medium">Estimated demo fare</span><span className="text-2xl font-extrabold">K{price}<span className="ml-1 text-xs font-normal text-muted-foreground">ZMW</span></span></div>
        <Button disabled={!pickup.trim()} onClick={() => onBook({ id: `KYN-${Date.now()}`, destination, pickup: pickup.trim(), category, price, payment })} className="kayan-action w-full justify-between">Preview your ride <ArrowRight size={18}/></Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground"><ShieldCheck size={13}/> Simulation only · no real taxi dispatched</p>
      </div>}
      <div className="mt-auto pt-6"><div className="flex items-center justify-center gap-2 border-t pt-4 text-[10px] text-muted-foreground"><Star size={12} className="text-primary"/> Thoughtfully built for Zambia.</div></div>
    </div>
  );
}
