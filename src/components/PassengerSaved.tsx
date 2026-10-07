import { useState } from 'react';
import { ArrowRight, MapPin, Plus, Star, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import KayanMap, { type MapPoint } from '@/components/KayanMap';
import { paymentOptions, type SavedPlace } from '@/lib/passenger-preferences';

type PassengerSavedProps = {
  section: 'locations' | 'payments';
  places: SavedPlace[];
  onPlaces: (places: SavedPlace[]) => boolean;
  methods: string[];
  onAddMethod: (method: string) => boolean;
  onRemoveMethod: (method: string) => boolean;
  defaultMethod: string;
  onDefault: (method: string) => boolean;
  onChoosePlace: (place: SavedPlace) => void;
  selectedPoint: MapPoint | null;
  onPointSelected: (point: MapPoint) => void;
  activeRide: boolean;
  storageReady: boolean;
};

export default function PassengerSaved({
  section,
  places,
  onPlaces,
  methods,
  onAddMethod,
  onRemoveMethod,
  defaultMethod,
  onDefault,
  onChoosePlace,
  selectedPoint,
  onPointSelected,
  activeRide,
  storageReady,
}: PassengerSavedProps) {
  const [label, setLabel] = useState('Home');
  const [method, setMethod] = useState(paymentOptions[0]);

  if (section === 'locations') return <div className="space-y-5">
    <div className="rounded-2xl bg-[#f1f5ef] p-4 text-xs leading-6 text-[#607168]">
      Saved addresses stay on this device. Tap the Google Map to drop a pin; Google Maps will look up its street address.
    </div>
    <section className="overflow-hidden rounded-2xl border border-[#dce4dd]">
      <div className="border-b border-[#dce4dd] px-4 py-3">
        <p className="text-xs font-bold">Choose an address on Google Maps</p>
        <p className="mt-1 text-[10px] leading-5 text-[#718077]">Pan and zoom the map, then tap the exact pickup point.</p>
      </div>
      <div className="h-[280px]">
        <KayanMap
          compact
          hasRoute={false}
          destination=""
          onPickLocation={onPointSelected}
          selectedPoint={selectedPoint}
        />
      </div>
    </section>
    {selectedPoint && <form className="space-y-3 rounded-2xl border border-[#dce4dd] p-4" onSubmit={event => {
      event.preventDefault();
      if (!storageReady || !selectedPoint.address) return;
      const next = [...places.filter(place => place.label !== label), { label, ...selectedPoint }];
      if (onPlaces(next)) {
        setLabel('Home');
      }
    }}>
      <p className="text-xs font-bold">Save this pinned address</p>
      <p className="text-xs leading-5 text-[#607168]">{selectedPoint.address || 'Finding the street address for this pin…'}</p>
      <Select value={label} onValueChange={setLabel}>
        <SelectTrigger aria-label="Saved address label" className="h-11 rounded-xl"><SelectValue/></SelectTrigger>
        <SelectContent className="rounded-xl">{['Home', 'Work', 'Favourite'].map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="submit" disabled={!storageReady || !selectedPoint.address} className="kayan-action h-11 w-full bg-[#174536] text-xs hover:bg-[#235b46]"><Plus size={15} className="mr-2"/>Save address</Button>
    </form>}
    {!selectedPoint && <p role="status" className="text-center text-xs text-[#718077]">Select a point on the map to save an address.</p>}
    <div className="space-y-3">
      {places.length === 0 ? <p className="rounded-2xl border border-dashed border-[#cbd9cf] p-5 text-center text-sm text-[#718077]">Your saved addresses will appear here.</p> : places.map(place => <article key={place.label} className="rounded-2xl border border-[#dce4dd] p-4">
        <div className="flex items-start gap-3">
          <MapPin size={20} className="mt-0.5 shrink-0 text-[#315c49]"/>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold">{place.label}</p>
            <p className="mt-1 text-sm font-semibold">{place.address}</p>
            <p className="mt-1 font-mono text-[9px] text-[#839188]">{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</p>
          </div>
          <button type="button" aria-label={`Remove ${place.label}`} disabled={!storageReady} onClick={() => onPlaces(places.filter(item => item.label !== place.label))} className="rounded-xl p-2 text-[#718077] hover:bg-[#f1f5ef] disabled:opacity-50"><Trash2 size={17}/></button>
        </div>
        <Button type="button" disabled={activeRide} variant="outline" className="mt-3 h-10 w-full rounded-xl text-xs" onClick={() => onChoosePlace(place)}>Use as pickup <ArrowRight size={14} className="ml-2"/></Button>
      </article>)}
    </div>
    {activeRide && <p className="text-xs text-[#718077]">Finish or cancel your current ride before changing its pickup address.</p>}
  </div>;

  return <div className="space-y-5">
    <div className="rounded-2xl bg-[#f1f5ef] p-4 text-xs leading-6 text-[#607168]">
      Payment method names and your default are saved on this device only. MTN MoMo numbers are sent to the sandbox only when you request payment for a completed ride; they are not saved here. No PINs or OTPs are collected.
    </div>
    <form className="flex gap-2" onSubmit={event => {
      event.preventDefault();
      if (storageReady && onAddMethod(method)) setMethod(paymentOptions[0]);
    }}>
      <Select value={method} onValueChange={setMethod}>
        <SelectTrigger aria-label="Payment method to save" className="h-12 flex-1 rounded-xl"><SelectValue/></SelectTrigger>
        <SelectContent className="rounded-xl">{paymentOptions.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <Button disabled={!storageReady || methods.includes(method)} className="kayan-action bg-[#174536] text-xs hover:bg-[#235b46]" type="submit"><Plus size={15} className="mr-1"/>Save</Button>
    </form>
    {methods.length === 0 ? <p className="rounded-2xl border border-dashed border-[#cbd9cf] p-5 text-center text-sm text-[#718077]">No saved payment methods. You can still select a demo payment type while booking.</p> : methods.map(item => <article key={item} className="flex items-center gap-3 rounded-2xl border border-[#dce4dd] p-4">
      <Wallet size={21} className="shrink-0 text-[#315c49]"/>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{item}</p>
        {defaultMethod === item ? <p className="mt-1 flex items-center gap-1 text-[10px] text-[#315c49]"><Star size={12}/>Default booking preference</p> : <button type="button" disabled={!storageReady} onClick={() => onDefault(item)} className="mt-1 text-[10px] font-bold text-[#315c49] disabled:opacity-50">Make default</button>}
      </div>
      <button type="button" aria-label={`Remove ${item}`} disabled={!storageReady} className="rounded-xl p-2 text-[#718077] hover:bg-[#f1f5ef] disabled:opacity-50" onClick={() => onRemoveMethod(item)}><Trash2 size={17}/></button>
    </article>)}
    <p className="rounded-xl border border-dashed border-[#dce4dd] p-3 text-xs text-[#718077]">MTN MoMo runs in sandbox only. Cash, Airtel Money, Zamtel Kwacha, and card payments are not processed in this build.</p>
  </div>;
}
