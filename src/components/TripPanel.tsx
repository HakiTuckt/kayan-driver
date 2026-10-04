import { ArrowRight, Car, CheckCircle2, Copy, MapPin, ShieldCheck, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { ActiveRide } from './BookingPanel';
import TripCommunication from './TripCommunication';

export default function TripPanel({ ride, onFinish, onSupport, stage, onStage }: { ride: ActiveRide; stage: number; onStage: (stage: number) => void; onFinish: (cancelled: boolean) => void; onSupport: () => void }) {
  const stages = ['Driver assigned', 'Driver at pickup', 'On your way', 'Arrived safely'];
  const copyTrip = async () => {
    const text = `KAYAN DEMO trip ${ride.id}. From ${ride.pickup} to ${ride.destination.name}. Demo driver: Daniel M. Vehicle: white Toyota Corolla. This is a simulation, not a live tracking link.`;
    try { await navigator.clipboard.writeText(text); toast.success('Demo trip details copied.'); } catch { toast.error('Clipboard is unavailable in this browser.'); }
  };
  return <div className="enter flex h-full flex-col">
    <p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-primary">Your journey · simulation</p><h2 className="text-2xl font-extrabold">{stages[stage]}</h2><p className="mt-2 text-xs text-muted-foreground">{['Meet your example KAYAN driver.', 'Your demo driver is ready to meet you.', 'Enjoy a preview of the journey experience.', 'Thank you for trying KAYAN.'][stage]}</p>
    <div className="my-6 flex gap-1.5">{stages.map((s,i) => <div key={s} title={s} className={`h-1.5 flex-1 rounded-full ${i <= stage ? 'bg-primary' : 'bg-secondary'}`}/>)}</div>
    <div className="rounded-2xl border bg-muted/40 p-4"><div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#173f30] text-lg font-bold text-[#fff3df]">DM</div><div className="flex-1"><h3 className="font-bold">Daniel M.</h3><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Star size={12} className="fill-primary text-primary"/> 4.9 · Demo profile</p></div><ShieldCheck size={23} className="text-primary"/></div><div className="mt-4 flex items-center gap-3 border-t pt-4"><Car size={36} strokeWidth={1.2}/><div><p className="text-xs font-bold">White Toyota Corolla</p><p className="mt-1 text-[10px] text-muted-foreground">DEMO 001 · {ride.category}</p></div></div></div>
    <div className="mt-4 rounded-xl bg-accent p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pickup verification code</p><p className="mt-1 text-2xl font-extrabold tracking-[.25em]">4826</p><p className="mt-1 text-[10px] text-muted-foreground">In a live service, share only with your matched driver.</p></div>
    <div className="my-5 space-y-4"><div className="flex gap-3"><span className="mt-1 h-3 w-3 shrink-0 rounded-full border-[3px] border-primary"/><div><p className="text-[10px] text-muted-foreground">Pickup</p><p className="mt-1 text-xs font-semibold">{ride.pickup}</p></div></div><div className="flex gap-2.5"><MapPin size={16} className="shrink-0"/><div><p className="text-[10px] text-muted-foreground">Destination</p><p className="mt-1 text-xs font-semibold">{ride.destination.name}</p></div></div></div>
    <div className="mb-4 flex items-center justify-between border-t pt-4"><span className="text-xs text-muted-foreground">{ride.payment} · Demo fare</span><span className="text-lg font-bold">K{ride.price}</span></div>
    <TripCommunication/>
    <div className="mb-5 grid grid-cols-2 gap-2"><button onClick={copyTrip} className="flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-semibold"><Copy size={14}/> Share details</button><button onClick={onSupport} className="flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-semibold"><ShieldCheck size={14}/> Safety & help</button></div>
    <Button className="kayan-action mt-auto w-full justify-between" onClick={() => stage < 3 ? onStage(stage + 1) : onFinish(false)}>{stage < 3 ? ['Simulate driver arrival', 'Simulate starting trip', 'Simulate arrival'][stage] : 'Finish demo ride'}{stage < 3 ? <ArrowRight size={17}/> : <CheckCircle2 size={17}/>}</Button>
    <p className="mt-3 text-center text-[10px] text-muted-foreground">You control this preview. No live driver or tracking.</p>
    {stage < 3 && <AlertDialog><AlertDialogTrigger asChild><button className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><X size={13}/> Cancel demo ride</button></AlertDialogTrigger><AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Cancel this demo ride?</AlertDialogTitle><AlertDialogDescription>No charge applies. The cancelled ride will appear in this session’s activity.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="rounded-xl">Keep ride</AlertDialogCancel><AlertDialogAction className="rounded-xl" onClick={() => onFinish(true)}>Cancel ride</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  </div>;
}
