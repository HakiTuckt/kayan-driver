import { useEffect, useRef, useState } from 'react';
import { GoogleMap } from '@capacitor/google-maps';
import { LocateFixed, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const lusaka = { lat: -15.4067, lng: 28.2871 };

export default function DriverGoogleMap({ hasRoute, destination, stage = null }: { hasRoute: boolean; destination: string; stage?: number | null }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.classList.add('native-google-map');
    document.body.classList.add('native-google-map');
    document.getElementById('root')?.classList.add('native-google-map');

    let disposed = false;
    let instance: GoogleMap | null = null;
    const createMap = async () => {
      if (!element.current) return;
      try {
        instance = await GoogleMap.create({
          id: 'kayan-driver-map',
          element: element.current,
          // Android reads the restricted key from AndroidManifest.xml.
          apiKey: '',
          config: { center: lusaka, zoom: 13, androidLiteMode: false, mapTypeId: 'roadmap' },
        });
        await instance.enableCurrentLocation(true);
        if (disposed) {
          await instance.destroy();
          return;
        }
        map.current = instance;
        setReady(true);
      } catch (cause) {
        console.error('Google Maps initialization failed.', cause);
        if (!disposed) setError('Google Maps could not start. Check the Android API key, billing, and internet connection.');
      }
    };
    void createMap();

    return () => {
      disposed = true;
      document.documentElement.classList.remove('native-google-map');
      document.body.classList.remove('native-google-map');
      document.getElementById('root')?.classList.remove('native-google-map');
      if (instance) void instance.destroy().catch(cause => console.error('Google Maps cleanup failed.', cause));
      map.current = null;
    };
  }, []);

  const centerOnLusaka = async () => {
    if (!map.current) return;
    try {
      await map.current.setCamera({ coordinate: lusaka, zoom: 13 });
    } catch (cause) {
      console.error('Unable to center the Google Map.', cause);
      setError('The map could not be repositioned. Please try again.');
    }
  };

  return <section className="flex h-full min-h-[610px] flex-col overflow-hidden rounded-2xl border">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
      <div className="flex items-center gap-2"><MapPin size={17} className="text-primary"/><div><p className="text-xs font-bold">Google Maps · Driver demo</p><p className="mt-1 text-[10px] text-muted-foreground">Lusaka map view · simulated trips</p></div></div>
      <span className="rounded-full bg-secondary px-3 py-1 text-[10px]">Internet required</span>
    </div>
    <div className="relative min-h-[330px] flex-1 bg-transparent">
      <div ref={element} aria-label="Google Map centered on Lusaka" className="absolute inset-0"/>
      {ready && <div className="absolute right-3 top-3 z-10">
        <Button variant="outline" className="h-10 w-10 rounded-xl bg-card p-0 shadow" aria-label="Center map on Lusaka" onClick={centerOnLusaka}><LocateFixed size={18}/></Button>
      </div>}
      {!ready && !error && <p role="status" className="absolute bottom-4 left-4 rounded-xl border bg-card px-3 py-2 text-xs">Loading Google Maps…</p>}
      {error && <p role="alert" className="absolute bottom-4 left-4 right-4 rounded-xl border border-destructive/30 bg-card p-3 text-xs leading-5 text-destructive">{error}</p>}
    </div>
    <div className="space-y-3 border-t bg-card p-4">
      <div className="flex items-start gap-2 rounded-xl bg-secondary p-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary"/><p className="text-[10px] leading-5 text-muted-foreground"><strong className="text-foreground">{stage === null ? 'Trips remain simulated.' : ['Demo approaching pickup', 'Demo at pickup', 'Demo trip in progress', 'Demo drop-off reached'][stage]}</strong> {hasRoute ? `Demo destination: ${destination}. ` : ''}Your location is shown only on this device map and is not shared. No live dispatch, routes, or turn-by-turn navigation.</p></div>
    </div>
  </section>;
}
