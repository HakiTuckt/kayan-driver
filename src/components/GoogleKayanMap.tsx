import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { GoogleMap as CapacitorGoogleMap, LatLngBounds } from '@capacitor/google-maps';
import { LocateFixed } from 'lucide-react';
import useDeviceLocation from '@/hooks/useDeviceLocation';

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

let mapsApiPromise: Promise<void> | null = null;

const kayanMapStyles: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#102820' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#c4cec4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#102820' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0b211b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071a16' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#142d24' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8b9b8e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#263c32' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#34483c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#c7c3a8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#726f55' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#8c8768' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#34483c' }] },
];

function loadGoogleMapsApi(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();
  if (!mapsApiPromise) {
    mapsApiPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.onload = () => window.google?.maps
        ? resolve()
        : reject(new Error('Google Maps did not initialize.'));
      script.onerror = () => reject(new Error('Google Maps could not be loaded. Check the network connection and API key.'));
      document.head.appendChild(script);
    }).catch(error => {
      mapsApiPromise = null;
      throw error;
    });
  }
  return mapsApiPromise;
}

type GoogleKayanMapProps = { hasRoute: boolean; destination: string; stage?: number | null; immersive?: boolean };

export default function GoogleKayanMap(props: GoogleKayanMapProps) {
  return Capacitor.isNativePlatform() ? <NativeGoogleKayanMap {...props}/> : <BrowserGoogleKayanMap {...props}/>;
}

function BrowserGoogleKayanMap({ hasRoute, destination, stage = null, immersive = false }: GoogleKayanMapProps) {
  const routeRequested = hasRoute && stage !== null;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const device = useRef<google.maps.Marker | null>(null);
  const routePolylines = useRef<google.maps.Polyline[]>([]);
  const routeRequest = useRef(0);
  const lastRouteTarget = useRef<string | null>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const [mapError, setMapError] = useState('');
  const [routeStatus, setRouteStatus] = useState('');
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const location = useDeviceLocation({ autoStart: true });
  const { position, fresh, enabled } = location;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

  useEffect(() => {
    if (!apiKey || !container.current) return;
    let disposed = false;
    let mapInitialized = false;
    let observer: ResizeObserver | null = null;
    let dragListener: google.maps.MapsEventListener | null = null;
    const previousAuthFailure = window.gm_authFailure;
    const authFailure = () => {
      previousAuthFailure?.();
      if (!disposed && !mapInitialized) setMapError(`Google Maps rejected this website referrer. In Google Cloud Console → Google Maps Platform → Credentials → this API key → Website restrictions, add ${window.location.origin}/* and save. Keep API restrictions set to Maps JavaScript API, then reload. If this origin is already allowed, check that Maps JavaScript API is enabled and billing is active.`);
    };
    window.gm_authFailure = authFailure;

    void loadGoogleMapsApi(apiKey).then(() => {
      if (disposed || !container.current) return;
      const instance = new google.maps.Map(container.current, {
        center: { lat: -15.4067, lng: 28.2871 },
        zoom: 13,
        styles: kayanMapStyles,
        gestureHandling: 'cooperative',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      map.current = instance;
      mapInitialized = true;
      dragListener = instance.addListener('dragstart', () => {
        follow.current = false;
        setFollowing(false);
      });
      setMapReady(true);
      observer = new ResizeObserver(() => google.maps.event.trigger(instance, 'resize'));
      observer.observe(container.current);
    }).catch(error => {
      if (!disposed) setMapError(error instanceof Error ? error.message : 'Google Maps could not be loaded.');
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      dragListener?.remove();
      if (window.gm_authFailure === authFailure) window.gm_authFailure = previousAuthFailure;
      device.current?.setMap(null);
      routePolylines.current.forEach(polyline => polyline.setMap(null));
      device.current = null;
      routePolylines.current = [];
      routeRequest.current += 1;
      map.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (!position || !enabled) {
      device.current?.setMap(null);
      device.current = null;
      return;
    }

    const point = { lat: position.coords.latitude, lng: position.coords.longitude };
    const color = fresh ? '#d87932' : '#64748b';
    const icon: google.maps.Symbol = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    };
    if (!device.current) device.current = new google.maps.Marker({ map: instance, position: point });
    device.current.setMap(instance);
    device.current.setPosition(point);
    device.current.setIcon(icon);
    device.current.setTitle(fresh ? 'Device-reported position' : 'Last fix · not current');

    if (follow.current && fresh) {
      instance.setCenter(point);
      instance.setZoom(Math.max(15, instance.getZoom() ?? 13));
    }
  }, [position, fresh, enabled, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;

    if (!routeRequested || !destination) {
      routeRequest.current += 1;
      lastRouteTarget.current = null;
      routePolylines.current.forEach(polyline => polyline.setMap(null));
      routePolylines.current = [];
      setRouteStatus('');
      return;
    }
    if (lastRouteTarget.current === destination) return;
    routePolylines.current.forEach(polyline => polyline.setMap(null));
    routePolylines.current = [];
    if (!fresh || !position) {
      setRouteStatus('Waiting for current device location to calculate route.');
      return;
    }

    const requestId = ++routeRequest.current;
    lastRouteTarget.current = destination;
    setRouteStatus('Finding the fastest driving route…');
    void google.maps.importLibrary('routes').then(async library => {
      const { Route } = library as google.maps.RoutesLibrary;
      return Route.computeRoutes({
        origin: { lat: position.coords.latitude, lng: position.coords.longitude },
        destination: `${destination}, Lusaka, Zambia`,
        travelMode: google.maps.TravelMode.DRIVING,
        routingPreference: google.maps.routes.RoutingPreference.TRAFFIC_AWARE_OPTIMAL,
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
        departureTime: new Date(),
        computeAlternativeRoutes: true,
        fields: ['path', 'durationMillis', 'staticDurationMillis', 'viewport'],
      });
    }).then(result => {
      if (requestId !== routeRequest.current) return;
      const routes = result.routes ?? [];
      if (!routes.length) throw new Error('No driving route was returned.');
      const fastest = routes.reduce((best, route) => {
        const duration = route.durationMillis ?? route.staticDurationMillis ?? Infinity;
        const bestDuration = best.durationMillis ?? best.staticDurationMillis ?? Infinity;
        return duration < bestDuration ? route : best;
      });
      if (!fastest.path?.length) throw new Error('The route response did not contain a path.');
      routePolylines.current = fastest.createPolylines({
        polylineOptions: { strokeColor: '#d87932', strokeOpacity: 0.9, strokeWeight: 6 },
      });
      routePolylines.current.forEach(polyline => polyline.setMap(instance));
      if (fastest.viewport) instance.fitBounds(fastest.viewport);
      setRouteStatus('Fastest traffic-aware driving route shown.');
    }).catch(error => {
      if (requestId !== routeRequest.current) return;
      const detail = error instanceof Error ? error.message : String(error);
      setRouteStatus(/PERMISSION_DENIED|blocked/i.test(detail)
        ? 'Routes API denied this key. Enable Routes API in the key’s Google Cloud project, allow Routes API in its API restrictions, and confirm billing is active.'
        : 'Could not calculate the route. Check Routes API access, billing, and this key’s restrictions.');
      console.error('Google Maps route request failed:', error);
    });
  }, [destination, routeRequested, fresh, position, mapReady, routeAttempt]);

  const center = () => {
    follow.current = true;
    setFollowing(true);
    if (position) {
      map.current?.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
      map.current?.setZoom(16);
    } else {
      map.current?.setCenter({ lat: -15.4067, lng: 28.2871 });
      map.current?.setZoom(13);
    }
  };
  const routeFailed = routeStatus.startsWith('Routes API denied') || routeStatus.startsWith('Could not calculate');
  const gpsLabel = fresh ? 'GPS live' : location.error ? 'GPS unavailable' : location.waiting ? 'Locating…' : 'GPS ready';

  return <section className={`relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-[#0b211b] ${immersive ? '' : 'min-h-[390px] rounded-3xl border bg-card shadow-sm md:min-h-[560px]'}`}>
    {!immersive && <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3"><div><p className="text-sm font-bold">Driver map</p><p className="mt-1 text-[10px] text-muted-foreground">Device location · Lusaka</p></div><span className={`inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[10px] font-semibold ${fresh ? 'text-foreground' : 'text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${fresh ? 'animate-pulse bg-primary' : location.error ? 'bg-destructive' : 'bg-muted-foreground'}`}/>{gpsLabel}</span></div>}
    <div className={`relative isolate min-h-0 flex-1 overflow-hidden bg-[#0b211b] ${immersive ? '' : 'h-[36svh] min-h-[250px] max-h-[340px] md:h-auto md:min-h-[390px] md:max-h-none'}`}>
    <div ref={container} aria-label="Interactive Google map" className="absolute inset-0 z-0"/>
    <div className="pointer-events-none absolute right-3 top-3 z-[400] flex flex-col items-end gap-2 sm:right-4 sm:top-4">
      <button className="map-control pointer-events-auto rounded-2xl" aria-label={position ? 'Center on device position' : 'Center on Lusaka default view'} onClick={center}><LocateFixed size={18}/></button>{position && !following && <button onClick={center} className="pointer-events-auto rounded-xl border bg-card px-3 py-2 text-[10px] font-bold text-foreground shadow-lg">Follow device</button>}
    </div>
    {(mapError || routeStatus || !apiKey) && <div className="absolute left-4 right-4 top-24 z-[400] flex items-center justify-between gap-3 rounded-2xl border bg-card/95 px-4 py-3 text-[11px] text-foreground shadow-xl backdrop-blur sm:left-6 sm:right-6"><span role={mapError || routeFailed || !apiKey ? 'alert' : 'status'} className="min-w-0">{mapError || (!apiKey ? 'Google Maps needs a configured Maps JavaScript API key.' : routeFailed ? 'Route unavailable · Check Routes API setup.' : routeStatus)}</span>{routeFailed && <button onClick={() => { lastRouteTarget.current = null; setRouteAttempt(attempt => attempt + 1); }} className="shrink-0 font-bold text-primary underline">Retry route</button>}</div>}
    {location.error && <div role="alert" className="absolute bottom-4 left-4 right-4 z-[400] rounded-2xl border border-white/15 bg-[var(--forest)]/95 p-4 text-xs leading-5 text-[var(--cream)] shadow-xl backdrop-blur sm:bottom-6 sm:left-6 sm:right-6">{location.error}<button onClick={location.start} className="ml-2 font-bold text-[#efac78] underline">Retry location</button></div>}
    </div>
    {!immersive && <div className="border-t bg-card px-4 py-3 text-[10px] leading-5 text-muted-foreground">Device location centers the map. Ride details and dispatch are simulated. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">Google privacy</a></div>}
  </section>;
}

function NativeGoogleKayanMap({ hasRoute, destination, stage = null, immersive = false }: GoogleKayanMapProps) {
  const routeRequested = hasRoute && stage !== null;
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<Awaited<ReturnType<typeof CapacitorGoogleMap.create>> | null>(null);
  const markerId = useRef<string | null>(null);
  const routeIds = useRef<string[]>([]);
  const markerRevision = useRef(0);
  const routeRevision = useRef(0);
  const lastRouteTarget = useRef<string | null>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const [mapError, setMapError] = useState('');
  const [routeStatus, setRouteStatus] = useState('');
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const location = useDeviceLocation({ autoStart: true });
  const { position, fresh } = location;
  const androidApiKey = import.meta.env.VITE_GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const routesApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

  useEffect(() => {
    const mapHost = host.current;
    if (!mapHost) return;
    if (!androidApiKey) {
      setMapError('Native Google Maps is not configured. Provide the Android-restricted Maps SDK API key when building the driver app.');
      return;
    }

    let disposed = false;
    const backgroundOverrides: Array<{ element: HTMLElement; backgroundColor: string }> = [];
    for (let ancestor: HTMLElement | null = mapHost; ancestor; ancestor = ancestor.parentElement) {
      backgroundOverrides.push({ element: ancestor, backgroundColor: ancestor.style.backgroundColor });
      ancestor.style.backgroundColor = 'transparent';
    }

    const element = document.createElement('capacitor-google-map');
    element.style.display = 'block';
    element.style.width = '100%';
    element.style.height = '100%';
    mapHost.appendChild(element);

    void CapacitorGoogleMap.create({
      id: `kayan-driver-map-${Date.now()}`,
      element,
      apiKey: androidApiKey,
      config: {
        center: { lat: -15.4067, lng: 28.2871 },
        zoom: 13,
        styles: kayanMapStyles,
      },
    }).then(async instance => {
      if (disposed) {
        await instance.destroy();
        return;
      }
      map.current = instance;
      await instance.setOnCameraMoveStartedListener(event => {
        if (event.isGesture) {
          follow.current = false;
          setFollowing(false);
        }
      });
      setMapReady(true);
    }).catch(error => {
      if (!disposed) setMapError(error instanceof Error ? error.message : 'The native Google Maps SDK could not be initialized.');
    });

    return () => {
      disposed = true;
      markerRevision.current += 1;
      routeRevision.current += 1;
      const instance = map.current;
      map.current = null;
      if (instance) void instance.destroy().catch(error => console.error('Could not destroy native Google Map:', error));
      mapHost.replaceChildren();
      for (const { element: ancestor, backgroundColor } of backgroundOverrides.reverse()) {
        ancestor.style.backgroundColor = backgroundColor;
      }
    };
  }, [androidApiKey]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    let disposed = false;
    const revision = ++markerRevision.current;
    void (async () => {
      const previousMarker = markerId.current;
      markerId.current = null;
      if (previousMarker) await instance.removeMarker(previousMarker);
      if (disposed || revision !== markerRevision.current || !position) return;
      const nextMarker = await instance.addMarker({
        coordinate: { lat: position.coords.latitude, lng: position.coords.longitude },
        title: fresh ? 'Device-reported position' : 'Last fix · not current',
      });
      if (disposed || revision !== markerRevision.current) {
        await instance.removeMarker(nextMarker);
        return;
      }
      markerId.current = nextMarker;
      if (follow.current && fresh) {
        await instance.setCamera({
          coordinate: { lat: position.coords.latitude, lng: position.coords.longitude },
          zoom: 15,
          animate: false,
        });
      }
    })().catch(error => {
      if (!disposed) setMapError(error instanceof Error ? error.message : 'Could not update the device marker on the native map.');
    });
    return () => { disposed = true; };
  }, [position, fresh, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    let disposed = false;
    const revision = ++routeRevision.current;
    const clearRoute = async () => {
      const previousRoutes = routeIds.current;
      routeIds.current = [];
      if (previousRoutes.length) await instance.removePolylines(previousRoutes);
    };
    void (async () => {
      if (!routeRequested || !destination) {
        await clearRoute();
        if (disposed || revision !== routeRevision.current) return;
        lastRouteTarget.current = null;
        setRouteStatus('');
        return;
      }
      if (lastRouteTarget.current === destination) return;
      await clearRoute();
      if (disposed || revision !== routeRevision.current) return;
      if (!fresh || !position) {
        setRouteStatus('Waiting for current device location to calculate route.');
        return;
      }
      if (!routesApiKey) {
        setRouteStatus('The native map is ready, but route calculation needs a separate Routes API key configured for web requests.');
        return;
      }

      lastRouteTarget.current = destination;
      setRouteStatus('Finding the fastest driving route…');
      await loadGoogleMapsApi(routesApiKey);
      const { Route } = await google.maps.importLibrary('routes') as google.maps.RoutesLibrary;
      const result = await Route.computeRoutes({
        origin: { lat: position.coords.latitude, lng: position.coords.longitude },
        destination: `${destination}, Lusaka, Zambia`,
        travelMode: google.maps.TravelMode.DRIVING,
        routingPreference: google.maps.routes.RoutingPreference.TRAFFIC_AWARE_OPTIMAL,
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
        departureTime: new Date(),
        computeAlternativeRoutes: true,
        fields: ['path', 'durationMillis', 'staticDurationMillis'],
      });
      if (disposed || revision !== routeRevision.current) return;
      const routes = result.routes ?? [];
      if (!routes.length) throw new Error('Google returned no driving routes for this destination.');
      const fastest = routes.reduce((best, route) => {
        const duration = route.durationMillis ?? route.staticDurationMillis ?? Infinity;
        const bestDuration = best.durationMillis ?? best.staticDurationMillis ?? Infinity;
        return duration < bestDuration ? route : best;
      });
      const path = fastest.path?.map(point => ({ lat: point.lat, lng: point.lng })) ?? [];
      if (!path.length) throw new Error('The route response did not include a path.');
      routeIds.current = await instance.addPolylines([{
        path,
        strokeColor: '#d87932',
        strokeOpacity: 0.9,
        strokeWeight: 6,
      }]);
      if (disposed || revision !== routeRevision.current) {
        await clearRoute();
        return;
      }
      const latitudes = path.map(point => point.lat);
      const longitudes = path.map(point => point.lng);
      const southwest = { lat: Math.min(...latitudes), lng: Math.min(...longitudes) };
      const northeast = { lat: Math.max(...latitudes), lng: Math.max(...longitudes) };
      await instance.fitBounds(new LatLngBounds({
        southwest,
        northeast,
        center: {
          lat: (southwest.lat + northeast.lat) / 2,
          lng: (southwest.lng + northeast.lng) / 2,
        },
      }), 56);
      setRouteStatus('Fastest traffic-aware driving route shown.');
    })().catch(error => {
      if (disposed || revision !== routeRevision.current) return;
      lastRouteTarget.current = null;
      const detail = error instanceof Error ? error.message : String(error);
      setRouteStatus(/PERMISSION_DENIED|blocked/i.test(detail)
        ? 'Routes API denied this key. Enable Routes API in the key’s Google Cloud project, allow Routes API in its API restrictions, and confirm billing is active.'
        : 'Could not calculate the route. Check Routes API access, billing, and the web-restricted Routes key.');
      console.error('Native map route request failed:', error);
    });
    return () => { disposed = true; };
  }, [destination, routeRequested, fresh, position, mapReady, routeAttempt, routesApiKey]);

  const center = () => {
    follow.current = true;
    setFollowing(true);
    const coordinate = position
      ? { lat: position.coords.latitude, lng: position.coords.longitude }
      : { lat: -15.4067, lng: 28.2871 };
    void map.current?.setCamera({ coordinate, zoom: position ? 16 : 13, animate: true });
  };
  const routeFailed = routeStatus.startsWith('Could not');
  const gpsLabel = fresh ? 'GPS live' : location.error ? 'GPS unavailable' : location.waiting ? 'Locating…' : 'GPS ready';

  return <section className={`native-google-map-section relative isolate flex h-full min-h-0 flex-col overflow-hidden ${immersive ? '' : 'min-h-[390px] rounded-3xl border bg-card shadow-sm md:min-h-[560px]'}`}>
    {!immersive && <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3"><div><p className="text-sm font-bold">Driver map · Google Maps</p><p className="mt-1 text-[10px] text-muted-foreground">Device location · Lusaka</p></div><span className={`inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[10px] font-semibold ${fresh ? 'text-foreground' : 'text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${fresh ? 'animate-pulse bg-primary' : location.error ? 'bg-destructive' : 'bg-muted-foreground'}`}/>{gpsLabel}</span></div>}
    <div className={`native-google-map-viewport relative min-h-0 flex-1 overflow-hidden ${immersive ? '' : 'h-[36svh] min-h-[250px] max-h-[340px] md:h-auto md:min-h-[390px] md:max-h-none'}`}>
    <div ref={host} aria-label="Interactive native Google map" className="absolute inset-0"/>
    <div className="pointer-events-none absolute right-3 top-3 z-[400] flex flex-col items-end gap-2 sm:right-4 sm:top-4">
      <button className="map-control pointer-events-auto rounded-2xl" aria-label={position ? 'Center on device position' : 'Center on Lusaka default view'} onClick={center}><LocateFixed size={18}/></button>{position && !following && <button onClick={center} className="pointer-events-auto rounded-xl border bg-card px-3 py-2 text-[10px] font-bold text-foreground shadow-lg">Follow device</button>}
    </div>
    {(mapError || routeStatus) && <div className="absolute left-4 right-4 top-24 z-[400] flex items-center justify-between gap-3 rounded-2xl border bg-card/95 px-4 py-3 text-[11px] text-foreground shadow-xl backdrop-blur sm:left-6 sm:right-6"><span role={mapError || routeFailed ? 'alert' : 'status'} className="min-w-0">{mapError || (routeFailed ? 'Route unavailable · Check Routes API setup.' : routeStatus)}</span>{routeFailed && <button onClick={() => { lastRouteTarget.current = null; setRouteAttempt(attempt => attempt + 1); }} className="shrink-0 font-bold text-primary underline">Retry route</button>}</div>}
    {location.error && <div role="alert" className="absolute bottom-4 left-4 right-4 z-[400] rounded-2xl border border-white/15 bg-[var(--forest)]/95 p-4 text-xs leading-5 text-[var(--cream)] shadow-xl backdrop-blur sm:bottom-6 sm:left-6 sm:right-6">{location.error}<button onClick={location.start} className="ml-2 font-bold text-[#efac78] underline">Retry location</button></div>}
    </div>
    {!immersive && <div className="relative z-10 border-t bg-card px-4 py-3 text-[10px] leading-5 text-muted-foreground">Device location centers the map. Ride details and dispatch are simulated. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">Google privacy</a></div>}
  </section>;
}
