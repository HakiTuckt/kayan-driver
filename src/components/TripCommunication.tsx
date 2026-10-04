import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Mic, MicOff, Phone, PhoneOff, Send, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Message = { id: number; text: string; sender: 'driver' | 'you' };
export default function TripCommunication() {
  const [open, setOpen] = useState<'chat' | 'call' | null>(null);
  const [messages, setMessages] = useState<Message[]>([{ id: 0, text: 'Hello! This is a simulated conversation with your example driver.', sender: 'driver' }]);
  const [draft, setDraft] = useState('');
  const [call, setCall] = useState<'ready' | 'ringing' | 'connected' | 'ended'>('ready');
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, open]);
  useEffect(() => {
    if (open !== 'call') return;
    if (call === 'ringing') { const timer = window.setTimeout(() => setCall('connected'), 2000); return () => window.clearTimeout(timer); }
    if (call === 'connected') { const timer = window.setInterval(() => setSeconds(s => s + 1), 1000); return () => window.clearInterval(timer); }
  }, [call, open]);
  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages(m => [...m, { id: Date.now(), text: text.trim(), sender: 'you' }, { id: Date.now() + 1, text: 'Simulated reply: Thanks for the update. Please check the vehicle and pickup code before boarding.', sender: 'driver' }]);
    setDraft('');
  };
  const close = () => { setOpen(null); if (call === 'connected' || call === 'ringing') setCall('ended'); };
  return <>
    <div className="mb-4 grid grid-cols-2 gap-2"><Button variant="outline" className="h-11 gap-2 rounded-xl text-xs" onClick={() => setOpen('chat')}><MessageCircle size={16}/> Message demo</Button><Button variant="outline" className="h-11 gap-2 rounded-xl text-xs" onClick={() => { setOpen('call'); setCall('ready'); setSeconds(0); setMuted(false); setSpeaker(false); }}><Phone size={16}/> Call demo</Button></div>
    <Dialog open={open !== null} onOpenChange={value => { if (!value) close(); }}><DialogContent className="max-w-md rounded-3xl p-5 sm:p-6">
      <DialogHeader><DialogTitle className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm">DM</span>Daniel M. <span className="text-[10px] font-normal text-primary">DEMO DRIVER</span></DialogTitle><DialogDescription>{open === 'chat' ? 'Local chat preview only. Messages are not delivered to anyone.' : 'Call-screen simulation. No VoIP connection, microphone access, or audio.'}</DialogDescription></DialogHeader>
      {open === 'chat' ? <>
        <div role="log" aria-live="polite" aria-label="Demo conversation" className="flex h-[290px] flex-col gap-3 overflow-y-auto rounded-2xl bg-muted/40 p-3">{messages.map(m => <div key={m.id} className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed ${m.sender === 'you' ? 'self-end bg-primary text-white' : 'self-start border bg-card'}`}><p>{m.text}</p><p className={`mt-1.5 text-[9px] ${m.sender === 'you' ? 'text-white' : 'text-muted-foreground'}`}>{m.sender === 'you' ? 'You · local demo' : 'Daniel · simulated reply'}</p></div>)}<div ref={bottom}/></div>
        <div className="flex flex-wrap gap-2">{['I’m at the pickup point.', 'Please wait a moment.'].map(t => <button key={t} className="rounded-full border px-3 py-2 text-[10px] hover:bg-secondary" onClick={() => send(t)}>{t}</button>)}</div>
        <form onSubmit={e => { e.preventDefault(); send(draft); }} className="flex gap-2"><Input value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} placeholder="Write a demo message…" aria-label="Demo message" className="h-11 rounded-xl"/><Button type="submit" disabled={!draft.trim()} aria-label="Send demo message" className="h-11 w-11 shrink-0 rounded-xl bg-primary"><Send size={17}/></Button></form>
      </> : <div className="py-3 text-center"><div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-[var(--forest)] text-3xl font-bold text-[var(--cream)]">DM</div><h3 className="text-xl font-bold">Daniel M.</h3><p aria-live="polite" className="mt-2 text-sm text-muted-foreground">{call === 'ready' ? 'Ready to preview a call' : call === 'ringing' ? 'Simulated ringing…' : call === 'ended' ? 'Demo call ended' : `Simulated call · ${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</p>
        {(call === 'connected' || call === 'ringing') ? <><div className="my-7 flex justify-center gap-5"><button aria-pressed={muted} onClick={() => setMuted(v => !v)} className="flex flex-col items-center gap-2 text-xs"><span className={`rounded-full p-4 ${muted ? 'bg-primary text-white' : 'bg-secondary'}`}>{muted ? <MicOff size={22}/> : <Mic size={22}/>}</span>{muted ? 'Muted (demo)' : 'Mute (demo)'}</button><button aria-pressed={speaker} onClick={() => setSpeaker(v => !v)} className="flex flex-col items-center gap-2 text-xs"><span className={`rounded-full p-4 ${speaker ? 'bg-primary text-white' : 'bg-secondary'}`}>{speaker ? <Volume2 size={22}/> : <VolumeX size={22}/>}</span>Speaker (demo)</button></div><Button onClick={() => setCall('ended')} className="h-12 gap-2 rounded-full bg-destructive px-7 text-white hover:bg-destructive/90"><PhoneOff size={19}/> End demo call</Button></> : <Button onClick={() => { setSeconds(0); setCall('ringing'); }} className="kayan-action mt-7 gap-2"><Phone size={17}/>{call === 'ended' ? 'Preview another call' : 'Start call simulation'}</Button>}
        <p className="mt-5 text-[10px] text-muted-foreground">Controls affect this screen only. No real driver is contacted.</p>
      </div>}
    </DialogContent></Dialog>
  </>;
}
