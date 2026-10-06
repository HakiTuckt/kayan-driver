import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { GoogleMap, LatLngBounds } from '@capacitor/google-maps';
import type { Polyline } from '@capacitor/google-maps';
import { LocateFixed, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRecommendedDrivingRoute } from '@/lib/googleDirections';

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

const lusaka = { lat: -15.4067, lng: 28.2871 };
const pickup = { lat: -15.4118, lng: 28.3158 };
const browserMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
type MapCoordinate = { lat: number; lng: number };

export default function KayanMap({ hasRoute, destination, destinationCoordinate = null, pickupCoordinate = null, pickupAddress = 'Rhodes Park, Lusaka', stage = null }: { hasRoute: boolean; destination: string; destinationCoordinate?: MapCoordinate | null; pickupCoordinate?: MapCoordinate | null; pickupAddress?: string; stage?: number | null }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMap | null>(null);
  const routeMarkerIds = useRef<string[]>([]);
  const routeLineIds = useRef<string[]>([]);
  const zoomLevel = useRef(13);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [routeStatus, setRouteStatus] = useState('');
  const [routeSummary, setRouteSummary] = useState<{ distance: string; duration: string } | null>(null);
  const nativeAndroid = Capacitor.getPlatform() === 'android';

  useEffect(() => {
    let disposed = false;
    let instance: GoogleMap | null = null;
    const previousAuthFailure = window.gm_authFailure;
    const authFailure = () => {
      previousAuthFailure?.();
      if (!disposed) setMapError('Google Maps rejected the browser API key. Check its Maps JavaScript API access and allowed website referrers.');
    };
    if (!Capacitor.isNativePlatform()) window.gm_authFailure = authFailure;
    if (nativeAndroid) {
      document.documentElement.classList.add('native-google-map');
      document.body.classList.add('native-google-map');
      document.getElementById('root')?.classList.add('native-google-map');
    }
    const createMap = async () => {
      if (!element.current) return;
      if (!Capacitor.isNativePlatform() && !browserMapsKey) {
        setMapError('Google Maps browser API key is not configured. Add a restricted Maps JavaScript API key as VITE_GOOGLE_MAPS_API_KEY.');
        return;
      }
      try {
        instance = await GoogleMap.create({
          id: `kayan-passenger-map-${Date.now()}`,
          element: element.current,
          apiKey: Capacitor.isNativePlatform() ? '' : browserMapsKey!,
          config: { center: lusaka, zoom: 13, androidLiteMode: false, mapTypeId: 'roadmap' },
        });
        if (disposed) {
          await instance.destroy();
          return;
        }
        map.current = instance;
        await instance.setOnCameraIdleListener(({ zoom }) => { zoomLevel.current = zoom; });
        await instance.enableTouch();
        setReady(true);
      } catch (cause) {
        console.error('Google Maps initialization failed.', cause);
        if (!disposed) setMapError('Google Maps could not start. Check the API key, enabled Maps APIs, billing, and internet connection.');
      }
    };
    void createMap();
    return () => {
      disposed = true;
      if (nativeAndroid) {
        document.documentElement.classList.remove('native-google-map');
        document.body.classList.remove('native-google-map');
        document.getElementById('root')?.classList.remove('native-google-map');
      }
      if (!Capacitor.isNativePlatform() && window.gm_authFailure === authFailure) window.gm_authFailure = previousAuthFailure;
      if (instance) void instance.destroy().catch(cause => console.error('Google Maps cleanup failed.', cause));
      map.current = null;
      routeMarkerIds.current = [];
      routeLineIds.current = [];
    };
  }, [nativeAndroid]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || !ready) return;
    let disposed = false;
    const updateDestination = async () => {
      try {
        if (routeMarkerIds.current.length) await currentMap.removeMarkers(routeMarkerIds.current);
        if (routeLineIds.current.length) await currentMap.removePolylines(routeLineIds.current);
        routeMarkerIds.current = [];
        routeLineIds.current = [];
        setRouteSummary(null);
        if (!hasRoute || !destinationCoordinate) {
          setRouteStatus('');
          zoomLevel.current = pickupCoordinate ? 15 : 13;
          routeMarkerIds.current = await currentMap.addMarker({
            coordinate: pickupCoordinate || pickup,
            title: 'Pickup',
            snippet: pickupCoordinate ? 'Current device location' : pickupAddress,
          }).then(id => [id]);
          await currentMap.setCamera({ coordinate: pickupCoordinate || lusaka, zoom: zoomLevel.current });
          return;
        }
        setRouteStatus('Finding Google’s recommended driving route without live traffic…');
        const route = await getRecommendedDrivingRoute(pickupCoordinate || pickupAddress, destinationCoordinate);
        if (disposed) return;
        setRouteStatus('');
        setRouteSummary({ distance: route.distance, duration: route.duration });
        routeMarkerIds.current = await currentMap.addMarkers([
          { coordinate: route.start, title: 'Pickup', snippet: pickupCoordinate ? 'Current device location' : pickupAddress },
          { coordinate: route.end, title: 'Destination', snippet: destination || 'Demo destination' },
        ]);
        const polyline: Polyline & { path: MapCoordinate[] } = {
          path: route.path,
          geodesic: false,
          clickable: false,
          strokeColor: '#d87932',
          strokeOpacity: 0.95,
          strokeWeight: 6,
        };
        routeLineIds.current = await currentMap.addPolylines([polyline]);
        const bounds = new LatLngBounds({
          southwest: route.bounds.southwest,
          center: { lat: (route.bounds.southwest.lat + route.bounds.northeast.lat) / 2, lng: (route.bounds.southwest.lng + route.bounds.northeast.lng) / 2 },
          northeast: route.bounds.northeast,
        });
        if (!disposed) await currentMap.fitBounds(bounds, 64);
        zoomLevel.current = 13;
      } catch (cause) {
        console.error('Unable to display the selected destination on Google Maps.', cause);
        if (!disposed) {
          setRouteSummary(null);
          setRouteStatus('Google Maps could not calculate a driving route. Enable Routes API (not Directions API (Legacy)), enable billing, and allow this site in the browser key referrer restrictions.');
          try {
            routeMarkerIds.current = await currentMap.addMarkers([
              { coordinate: pickupCoordinate || pickup, title: 'Pickup', snippet: pickupCoordinate ? 'Current device location' : pickupAddress },
              { coordinate: destinationCoordinate, title: 'Destination', snippet: destination || 'Demo destination' },
            ]);
            const bounds = new LatLngBounds({
              southwest: { lat: Math.min((pickupCoordinate || pickup).lat, destinationCoordinate.lat), lng: Math.min((pickupCoordinate || pickup).lng, destinationCoordinate.lng) },
              center: { lat: ((pickupCoordinate || pickup).lat + destinationCoordinate.lat) / 2, lng: ((pickupCoordinate || pickup).lng + destinationCoordinate.lng) / 2 },
              northeast: { lat: Math.max((pickupCoordinate || pickup).lat, destinationCoordinate.lat), lng: Math.max((pickupCoordinate || pickup).lng, destinationCoordinate.lng) },
            });
            await currentMap.fitBounds(bounds, 64);
          } catch (markerError) {
            console.error('Unable to show pickup and destination markers.', markerError);
          }
        }
      }
    };
    void updateDestination();
    return () => { disposed = true; };
  }, [ready, hasRoute, destination, destinationCoordinate, pickupCoordinate, pickupAddress]);

  const center = async () => {
    if (!map.current) return;
    const hasDeviceLocation = !!pickupCoordinate;
    const coordinate = pickupCoordinate || lusaka;
    try {
      zoomLevel.current = hasDeviceLocation ? 16 : 13;
      await map.current.setCamera({ coordinate, zoom: zoomLevel.current });
    } catch (cause) {
      console.error('Unable to center the Google Map.', cause);
      setMapError('The map could not be repositioned. Please try again.');
    }
  };
  const adjustZoom = async (amount: number) => {
    if (!map.current) return;
    zoomLevel.current = Math.min(20, Math.max(3, zoomLevel.current + amount));
    try {
      const coordinate = destinationCoordinate || lusaka;
      await map.current.setCamera({ coordinate, zoom: zoomLevel.current });
    } catch (cause) {
      console.error('Unable to zoom Google Maps.', cause);
      setMapError('The map could not be zoomed. Please try again.');
    }
  };
  return <section className="flex h-full min-h-[610px] flex-col overflow-hidden rounded-2xl border">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3"><div className="flex items-center gap-2"><MapPin size={17} className="text-primary"/><div><p className="text-xs font-bold">Google Maps</p><p className="mt-1 text-[10px] text-muted-foreground">{pickupCoordinate ? 'Pickup set to current device location' : 'Lusaka map view · demo pickup'}</p></div></div><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">Internet required</span></div>
    <div className="relative min-h-[330px] flex-1 bg-transparent">
      <div ref={element} aria-label="Google Map" className="absolute inset-0 touch-pan-x touch-pan-y"/>
      {ready && <div className="absolute right-3 top-3 z-10 flex flex-col gap-2"><Button variant="outline" className="h-10 w-10 rounded-xl bg-card p-0 text-lg shadow" aria-label="Zoom in" onClick={() => void adjustZoom(1)}>+</Button><Button variant="outline" className="h-10 w-10 rounded-xl bg-card p-0 text-lg shadow" aria-label="Zoom out" onClick={() => void adjustZoom(-1)}>−</Button><Button variant="outline" className="h-10 w-10 rounded-xl bg-card p-0 shadow" aria-label="Center map" onClick={center}><LocateFixed size={18}/></Button></div>}
      {!ready && !mapError && <p role="status" className="absolute bottom-4 left-4 rounded-xl border bg-card px-3 py-2 text-xs">Loading Google Maps…</p>}
      {mapError && <p role="alert" className="absolute bottom-4 left-4 right-4 rounded-xl border border-destructive/30 bg-card p-3 text-xs leading-5 text-destructive">{mapError}</p>}
      {routeStatus && <p role={routeSummary ? 'status' : hasRoute ? 'status' : 'alert'} className="absolute bottom-4 left-4 right-16 rounded-xl border bg-card p-3 text-xs leading-5">{routeStatus}</p>}
    </div>
    <div className="space-y-3 border-t bg-card p-4">
      {pickupCoordinate && <p className="text-[10px] leading-5 text-muted-foreground">Your device location is used as the pickup for this preview. It is not saved or sent to KAYAN; Google receives it to display your position on the map.</p>}
      {hasRoute && destinationCoordinate && <p className="rounded-xl bg-accent px-3 py-2 text-[10px] leading-5 text-muted-foreground">{routeSummary ? <>Google recommended driving route: <strong className="text-foreground">{routeSummary.distance} · {routeSummary.duration}</strong> without live traffic. Route and duration are estimates.</> : routeStatus || <>Showing pickup and <strong className="text-foreground">{destination}</strong>. Drag to pan and use map gestures to zoom.</>}</p>}
      <div className="flex items-start gap-2 rounded-xl bg-secondary p-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary"/><p className="text-[10px] leading-5 text-muted-foreground"><strong className="text-foreground">{stage === null ? 'Trips remain simulated.' : ['Demo approaching pickup', 'Demo at pickup', 'Demo trip in progress', 'Demo drop-off reached'][stage]}</strong> {hasRoute ? `Demo destination: ${destination}. ` : ''}Pickup addresses, ride stages, fares and ETAs are not based on device location. No live dispatch or turn-by-turn navigation.</p></div>
    </div>
  </section>;
}
