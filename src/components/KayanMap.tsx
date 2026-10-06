import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useDeviceLocation from '@/hooks/useDeviceLocation';
import type { PassengerDriverLocation } from '@/lib/ride-dispatch';

export default function KayanMap({ hasRoute, destination, stage = null, liveRideAccepted = false, driverLocation = null }: {
  hasRoute: boolean;
  destination: string;
  stage?: number | null;
  liveRideAccepted?: boolean;
  driverLocation?: PassengerDriverLocation | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const device = useRef<L.CircleMarker | null>(null);
  const accuracy = useRef<L.Circle | null>(null);
  const driver = useRef<L.CircleMarker | null>(null);
  const driverAccuracy = useRef<L.Circle | null>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const [tileError, setTileError] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const location = useDeviceLocation();
  const { position, fresh, enabled } = location;
  const locationAgeSeconds = driverLocation ? Math.max(0, Math.floor((clock - Date.parse(driverLocation.updated_at)) / 1000)) : null;
  const driverLocationFresh = locationAgeSeconds !== null && locationAgeSeconds <= 30;

  useEffect(() => {
    if (!driverLocation) return;
    const timer = window.setInterval(() => setClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [driverLocation]);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([-15.4067, 28.2871], 13);
    map.current = instance;
    setMapReady(true);
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(instance);
    tiles.current = layer;
    layer.on('tileerror', () => setTileError(true));
    layer.on('tileload', () => setTilesLoaded(true));
    instance.on('dragstart', () => { follow.current = false; setFollowing(false); });
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      tiles.current = null;
      device.current = null;
      accuracy.current = null;
      driver.current = null;
      driverAccuracy.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (!position || !enabled) {
      device.current?.remove(); accuracy.current?.remove();
      device.current = null; accuracy.current = null;
      return;
    }
    const point: L.LatLngExpression = [position.coords.latitude, position.coords.longitude];
    const color = fresh ? '#d87932' : '#64748b';
    if (!device.current) device.current = L.circleMarker(point, { radius: 8, color: '#ffffff', weight: 3, fillOpacity: 1 }).addTo(instance);
    device.current.setLatLng(point).setStyle({ fillColor: color });
    device.current.bindTooltip(fresh ? 'Device-reported position' : 'Last fix · not current');
    if (!accuracy.current) accuracy.current = L.circle(point, { weight: 1, fillOpacity: 0.12, interactive: false }).addTo(instance);
    accuracy.current.setLatLng(point).setRadius(position.coords.accuracy).setStyle({ color, fillColor: color });
    device.current.bringToFront();
    if (follow.current && fresh && !driverLocation) instance.setView(point, Math.max(15, instance.getZoom()), { animate: false });
  }, [position, fresh, enabled, driverLocation, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (!driverLocation) {
      driver.current?.remove();
      driverAccuracy.current?.remove();
      driver.current = null;
      driverAccuracy.current = null;
      return;
    }
    const point: L.LatLngExpression = [driverLocation.latitude, driverLocation.longitude];
    const color = driverLocationFresh ? '#176b52' : '#64748b';
    if (!driver.current) {
      driver.current = L.circleMarker(point, { radius: 10, color: '#ffffff', weight: 3, fillOpacity: 1 }).addTo(instance);
    }
    driver.current.setLatLng(point).setStyle({ fillColor: color });
    driver.current.bindTooltip(driverLocationFresh ? 'Your driver · live location' : 'Last driver location · not current');
    if (!driverAccuracy.current) driverAccuracy.current = L.circle(point, { weight: 1, fillOpacity: 0.12, interactive: false }).addTo(instance);
    driverAccuracy.current.setLatLng(point).setRadius(Math.max(driverLocation.accuracy_m, 10)).setStyle({ color, fillColor: color });
    driver.current.bringToFront();
    if (follow.current) {
      if (position && enabled) {
        instance.fitBounds(
          L.latLngBounds(
            [driverLocation.latitude, driverLocation.longitude],
            [position.coords.latitude, position.coords.longitude],
          ).pad(0.2),
          { maxZoom: 15, animate: false },
        );
      } else {
        instance.setView(point, 15, { animate: false });
      }
    }
  }, [driverLocation, driverLocationFresh, enabled, mapReady, position]);

  const center = () => {
    follow.current = true; setFollowing(true);
    if (driverLocation) map.current?.setView([driverLocation.latitude, driverLocation.longitude], 16);
    else if (position) map.current?.setView([position.coords.latitude, position.coords.longitude], 16);
    else map.current?.setView([-15.4067, 28.2871], 13);
  };
  const status = !enabled ? 'Location off' : !location.foreground ? 'Paused · app not visible' : location.waiting ? 'Waiting for device fix…' : !fresh ? 'Last fix is stale · not current' : position && position.coords.accuracy > 50 ? 'Live fix · low accuracy' : 'Live device fix';

  return <section className="flex h-full min-h-[610px] flex-col overflow-hidden rounded-2xl border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div className="flex items-center gap-2"><MapPin size={17} className="text-primary"/><div><p className="text-xs font-bold">Real map · OpenStreetMap</p><p role="status" className="mt-1 text-[10px] text-muted-foreground">{liveRideAccepted ? driverLocation ? driverLocationFresh ? 'Driver GPS · live' : `Last driver fix · ${locationAgeSeconds}s ago` : 'Waiting for the driver’s first GPS fix' : position ? 'Device position, not a demo driver' : 'Lusaka default view · not your location'}</p></div></div><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">Internet needed for map tiles</span></div>
    <div className="relative isolate min-h-[330px] flex-1 bg-secondary">
      <div ref={container} aria-label="Interactive real map" className="absolute inset-0 z-0"/>
      <button className="map-control absolute right-3 top-3 z-[400]" aria-label={driverLocation ? 'Center on driver location' : position ? 'Center on device position' : 'Center on Lusaka default view'} onClick={center}><LocateFixed size={18}/></button>
      {(driverLocation || position) && !following && <button onClick={center} className="absolute right-3 top-16 z-[400] rounded-xl border bg-card px-3 py-2 text-[10px] font-bold text-foreground shadow">{driverLocation ? 'Follow driver' : 'Follow device'}</button>}
      {(tileError || !tilesLoaded) && <div className="absolute bottom-9 left-3 right-3 z-[400] rounded-xl border bg-card p-3 text-[11px] text-foreground">{tileError ? 'Some map tiles could not load. Check your internet connection. Location readings remain independent of the map.' : 'Loading real map tiles…'}{tileError && <button onClick={() => { setTileError(false); tiles.current?.redraw(); }} className="ml-2 font-bold text-primary">Retry tiles</button>}</div>}
    </div>
    <div className="space-y-3 border-t p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${fresh ? 'bg-primary' : 'bg-muted-foreground'}`}/><p role="status" className="text-xs font-bold">{status}</p></div>{enabled ? <Button variant="outline" className="h-9 rounded-xl text-xs" onClick={location.stop}>Stop location</Button> : <Button className="kayan-action h-10 text-xs" onClick={() => { center(); location.start(); }}>Enable device location</Button>}</div>
      {position && <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary p-3 text-[11px]"><div><p className="font-bold">Reported accuracy: ±{Math.round(position.coords.accuracy)} m</p><p className="mt-1 text-muted-foreground">{location.permission} · high accuracy requested</p></div><div><p className="font-bold">Fix age: {location.age}s {fresh ? '' : '· not current'}</p><p className="mt-1 break-words font-mono text-muted-foreground">{position.coords.latitude.toFixed(6)}, {position.coords.longitude.toFixed(6)}</p></div></div>}
      {location.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-background p-3 text-xs leading-5 text-destructive">{location.error}{enabled && <button onClick={location.start} className="ml-2 font-bold underline">Retry location</button>}</p>}
      <p className="text-[10px] leading-5 text-muted-foreground">{liveRideAccepted ? 'The driver’s GPS is shared for this accepted ride only and is cleared when the ride ends. A muted marker means the last fix is no longer current. ' : 'Opt-in foreground tracking only. Precise permission improves accuracy but cannot guarantee it. MuMu may supply a simulated position. Your location is not saved or sent to KAYAN. '}Map tile requests reveal the viewed area and IP to OpenStreetMap. <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener noreferrer" className="underline">Map privacy</a></p>
      <div className="flex items-start gap-2 rounded-xl bg-secondary p-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary"/><p className="text-[10px] leading-5 text-muted-foreground">{liveRideAccepted ? driverLocation ? 'Your driver’s approximate location is shown on the map and updates while their app has a fresh GPS fix.' : 'Your driver accepted the ride. The map will update when their app sends its first GPS fix.' : <><strong className="text-foreground">{stage === null ? 'Trips remain simulated.' : ['Demo approaching pickup', 'Demo at pickup', 'Demo trip in progress', 'Demo drop-off reached'][stage]}</strong> {hasRoute ? `Demo destination: ${destination}. ` : ''}Pickup addresses, ride stages, fares and ETAs are not based on this device location. No live dispatch or turn-by-turn navigation.</>}</p></div>
      <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer" className="inline-block text-[10px] text-muted-foreground underline">Report a map issue</a>
    </div>
  </section>;
}
