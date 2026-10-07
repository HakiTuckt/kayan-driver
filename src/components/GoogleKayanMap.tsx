import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { GoogleMap as CapacitorGoogleMap, LatLngBounds } from '@capacitor/google-maps';
import type { Position } from '@capacitor/geolocation';
import { LocateFixed, MapPinned, Navigation } from 'lucide-react';
import { useTheme } from 'next-themes';
import useDeviceLocation from '@/hooks/useDeviceLocation';
import { Switch } from '@/components/ui/switch';
import { getRouteDepartureTime, kayanDarkMapStyles, kayanLightMapStyles, loadGoogleMapsApi } from '@/lib/google-maps';
import type { DriverLocationFix } from '@/lib/ride-dispatch';

const lusakaDemoPosition = {
  coords: { latitude: -15.4067, longitude: 28.2871, accuracy: 35 },
  timestamp: 0,
};
type NavigationPoint = { lat: number; lng: number };
type NavigationStep = {
  instruction: string;
  distanceMeters: number;
  endLocation: NavigationPoint;
  path: NavigationPoint[];
};
export type NavigationProgress = {
  instruction: string;
  nextInstruction: string | null;
  distanceToNextStepMeters: number;
  currentStep: number;
  totalSteps: number;
  remainingDistanceMeters: number;
  remainingDurationMillis: number;
};
export type GoogleRouteInfo = {
  distanceMeters: number;
  durationMillis: number;
  navigation: NavigationProgress | null;
  remainingDistanceMeters: number;
  remainingDurationMillis: number;
};
type GoogleKayanMapProps = {
  hasRoute: boolean;
  destination: string;
  stage?: number | null;
  immersive?: boolean;
  integrated?: boolean;
  demoLocation?: boolean;
  online?: boolean;
  availabilityBusy?: boolean;
  liveDriver?: boolean;
  shareLocation?: boolean;
  onAvailabilityChange?: (online: boolean) => void;
  onDriverLocation?: (location: DriverLocationFix) => void | Promise<void>;
  onRouteInfo?: (routeInfo: GoogleRouteInfo | null) => void;
};

function useRideLocationSharing(
  shareLocation: boolean,
  demoLocation: boolean,
  position: Position | null,
  fresh: boolean,
  onDriverLocation?: (location: DriverLocationFix) => void | Promise<void>,
) {
  const callback = useRef(onDriverLocation);
  const lastSharedAt = useRef(0);
  callback.current = onDriverLocation;

  useEffect(() => {
    if (!shareLocation) {
      lastSharedAt.current = 0;
      return;
    }
    if (demoLocation || !fresh || !position || !callback.current) return;
    const now = Date.now();
    if (now - lastSharedAt.current < 10_000) return;
    lastSharedAt.current = now;
    void Promise.resolve(callback.current({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_m: position.coords.accuracy,
    })).catch(error => {
      console.error('Could not send the accepted-ride location update:', error);
    });
  }, [demoLocation, fresh, position, shareLocation]);
}

function getDistanceMeters(from: NavigationPoint, to: NavigationPoint) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const a = Math.min(1, Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2);
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function remainingDistanceOnStep(position: NavigationPoint, step: NavigationStep) {
  if (step.path.length < 2) return getDistanceMeters(position, step.endLocation);

  const earthRadius = 6_371_000;
  const latitudeScale = Math.PI / 180 * earthRadius;
  const longitudeScale = latitudeScale * Math.cos(position.lat * Math.PI / 180);
  const pointOnMap = (point: NavigationPoint) => ({
    x: (point.lng - position.lng) * longitudeScale,
    y: (point.lat - position.lat) * latitudeScale,
  });
  const path = step.path.map(pointOnMap);
  const segmentLengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y));
  let closestDistanceSquared = Infinity;
  let remainingDistance = getDistanceMeters(position, step.endLocation);
  let distanceAfterSegment = segmentLengths.reduce((total, length) => total + length, 0);

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const segmentLength = segmentLengths[index];
    const lengthSquared = segmentLength ** 2;
    const projection = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(start.x * (end.x - start.x) + start.y * (end.y - start.y)) / lengthSquared));
    const projectedX = start.x + (end.x - start.x) * projection;
    const projectedY = start.y + (end.y - start.y) * projection;
    const distanceSquared = projectedX ** 2 + projectedY ** 2;
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      remainingDistance = segmentLength * (1 - projection) + distanceAfterSegment - segmentLength;
    }
    distanceAfterSegment -= segmentLength;
  }
  return remainingDistance;
}

function getNavigationSteps(route: google.maps.routes.Route): NavigationStep[] {
  return (route.legs ?? []).flatMap(leg => leg.steps.flatMap(step => {
    const path = step.path.map(point => ({ lat: point.lat, lng: point.lng }));
    const endLocation = step.endLocation ?? path[path.length - 1];
    const instruction = step.instructions?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!endLocation || !instruction) return [];
    return [{
      instruction,
      distanceMeters: step.distanceMeters,
      endLocation: { lat: endLocation.lat, lng: endLocation.lng },
      path,
    }];
  }));
}

function getNavigationProgress(
  steps: NavigationStep[],
  startIndex: number,
  position: NavigationPoint,
  accuracy: number,
  distanceMeters: number,
  durationMillis: number,
) {
  if (!steps.length) return null;
  const thresholdMeters = Math.max(25, Math.min(60, accuracy * 1.2));
  let currentIndex = Math.min(startIndex, steps.length - 1);
  while (currentIndex < steps.length - 1
    && getDistanceMeters(position, steps[currentIndex].endLocation) <= thresholdMeters) {
    currentIndex += 1;
  }

  const currentStep = steps[currentIndex];
  const distanceToNextStepMeters = remainingDistanceOnStep(position, currentStep);
  const remainingDistanceMeters = distanceToNextStepMeters
    + steps.slice(currentIndex + 1).reduce((total, step) => total + step.distanceMeters, 0);
  const remainingRatio = distanceMeters > 0 ? Math.min(1, remainingDistanceMeters / distanceMeters) : 0;
  return {
    currentIndex,
    navigation: {
      instruction: currentStep.instruction,
      nextInstruction: steps[currentIndex + 1]?.instruction ?? null,
      distanceToNextStepMeters,
      currentStep: currentIndex + 1,
      totalSteps: steps.length,
      remainingDistanceMeters,
      remainingDurationMillis: durationMillis * remainingRatio,
    },
  };
}

function formatNavigationDistance(distanceMeters: number) {
  return distanceMeters < 1000
    ? `${Math.max(0, Math.round(distanceMeters / 10) * 10)} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}

function getRouteErrorMessage(error: unknown) {
  const detail = (error instanceof Error ? error.message : String(error))
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted API key]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]');
  if (/PERMISSION_DENIED|REQUEST_DENIED|ApiNotActivated|ApiTargetBlocked|RefererNotAllowed|BillingNotEnabled|blocked/i.test(detail)) {
    return 'Routes API request denied. Check that Routes API is enabled, allowed by this key, billing is active, and this preview origin is allowed.';
  }
  return `Could not calculate route: ${detail}`;
}

function NavigationCard({ navigation, fresh, demoLocation }: { navigation: NavigationProgress; fresh: boolean; demoLocation: boolean }) {
  return <div aria-live="off" className="driver-navigation-card absolute left-3 right-16 top-[4.75rem] z-[400] rounded-2xl border px-3 py-2.5 shadow-xl backdrop-blur sm:left-4 sm:right-20 sm:top-20">
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Navigation size={17}/></span>
      <div className="min-w-0">
        <p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-primary">{demoLocation ? 'Demo route' : 'Navigation'} · step {navigation.currentStep} of {navigation.totalSteps}{!fresh && !demoLocation ? ' · GPS signal stale' : ''}</p>
        <p aria-live="polite" aria-atomic="true" className="mt-0.5 text-xs font-bold leading-4 text-foreground">{navigation.instruction}</p>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
          {navigation.nextInstruction
            ? `Then in ${formatNavigationDistance(navigation.distanceToNextStepMeters)}: ${navigation.nextInstruction}`
            : `${formatNavigationDistance(navigation.distanceToNextStepMeters)} to destination`}
        </p>
      </div>
    </div>
  </div>;
}

export default function GoogleKayanMap(props: GoogleKayanMapProps) {
  return Capacitor.isNativePlatform() ? <NativeGoogleKayanMap {...props}/> : <BrowserGoogleKayanMap {...props}/>;
}

function BrowserGoogleKayanMap({ hasRoute, destination, stage = null, immersive = false, integrated = false, demoLocation = false, online = false, availabilityBusy = false, liveDriver = false, shareLocation = false, onAvailabilityChange, onDriverLocation, onRouteInfo }: GoogleKayanMapProps) {
  const routeRequested = hasRoute && stage !== null;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const device = useRef<google.maps.Marker | null>(null);
  const routePolylines = useRef<google.maps.Polyline[]>([]);
  const routeRequest = useRef(0);
  const lastRouteTarget = useRef<string | null>(null);
  const navigationSteps = useRef<NavigationStep[]>([]);
  const navigationStepIndex = useRef(0);
  const routeMetrics = useRef<{ distanceMeters: number; durationMillis: number } | null>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const [mapError, setMapError] = useState('');
  const [routeStatus, setRouteStatus] = useState('');
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [navigation, setNavigation] = useState<NavigationProgress | null>(null);
  const onRouteInfoRef = useRef(onRouteInfo);
  onRouteInfoRef.current = onRouteInfo;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const location = useDeviceLocation({ autoStart: !demoLocation });
  const position = demoLocation ? lusakaDemoPosition : location.position;
  const fresh = demoLocation || location.fresh;
  const enabled = demoLocation || location.enabled;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  useRideLocationSharing(shareLocation, demoLocation, position, fresh, onDriverLocation);

  useEffect(() => {
    const metrics = routeMetrics.current;
    if (!metrics || !position) {
      setNavigation(null);
      return;
    }
    const progress = getNavigationProgress(
      navigationSteps.current,
      navigationStepIndex.current,
      { lat: position.coords.latitude, lng: position.coords.longitude },
      position.coords.accuracy,
      metrics.distanceMeters,
      metrics.durationMillis,
    );
    if (!progress) {
      setNavigation(null);
      onRouteInfoRef.current?.({ ...metrics, navigation: null, remainingDistanceMeters: metrics.distanceMeters, remainingDurationMillis: metrics.durationMillis });
      return;
    }
    navigationStepIndex.current = progress.currentIndex;
    setNavigation(progress.navigation);
    onRouteInfoRef.current?.({
      ...metrics,
      navigation: progress.navigation,
      remainingDistanceMeters: progress.navigation.remainingDistanceMeters,
      remainingDurationMillis: progress.navigation.remainingDurationMillis,
    });
  }, [fresh, mapReady, navigationRevision, position]);

  useEffect(() => {
    if (!apiKey || !container.current) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let dragListener: google.maps.MapsEventListener | null = null;
    const previousAuthFailure = window.gm_authFailure;
    const authFailure = () => {
      previousAuthFailure?.();
      if (!disposed) setMapError(`Google Maps rejected this website referrer. In Google Cloud Console → Google Maps Platform → Credentials → this API key → Website restrictions, add ${window.location.origin}/* and save. Keep API restrictions set to Maps JavaScript API, then reload. If this origin is already allowed, check that Maps JavaScript API is enabled and billing is active.`);
    };
    window.gm_authFailure = authFailure;

    void loadGoogleMapsApi(apiKey).then(() => {
      if (disposed || !container.current) return;
      const instance = new google.maps.Map(container.current, {
        center: { lat: -15.4067, lng: 28.2871 },
        zoom: 13,
        styles: isDark ? kayanDarkMapStyles : kayanLightMapStyles,
        gestureHandling: 'cooperative',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      map.current = instance;
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
    map.current?.setOptions({ styles: isDark ? kayanDarkMapStyles : kayanLightMapStyles });
  }, [isDark, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (!position || !enabled) {
      device.current?.setMap(null);
      device.current = null;
      return;
    }

    const point = { lat: position.coords.latitude, lng: position.coords.longitude };
    const color = fresh ? '#2c87ac' : '#718b95';
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
    device.current.setTitle(demoLocation ? 'Demo location · Lusaka' : fresh ? 'Device-reported position' : 'Last fix · not current');

    if (follow.current && fresh) {
      instance.setCenter(point);
      instance.setZoom(Math.max(15, instance.getZoom() ?? 13));
    }
  }, [position, fresh, enabled, demoLocation, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;

    if (!routeRequested || !destination) {
      routeRequest.current += 1;
      lastRouteTarget.current = null;
      navigationSteps.current = [];
      navigationStepIndex.current = 0;
      routeMetrics.current = null;
      setNavigation(null);
      routePolylines.current.forEach(polyline => polyline.setMap(null));
      routePolylines.current = [];
      onRouteInfoRef.current?.(null);
      setRouteStatus('');
      return;
    }
    if (lastRouteTarget.current === destination) return;
    onRouteInfoRef.current?.(null);
    navigationSteps.current = [];
    navigationStepIndex.current = 0;
    routeMetrics.current = null;
    setNavigation(null);
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
        departureTime: getRouteDepartureTime(),
        computeAlternativeRoutes: true,
        fields: [
          'path',
          'durationMillis',
          'staticDurationMillis',
          'distanceMeters',
          'viewport',
          'legs',
        ],
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
        polylineOptions: { strokeColor: isDark ? '#72d8c0' : '#168d79', strokeOpacity: 0.96, strokeWeight: 7 },
      });
      routePolylines.current.forEach(polyline => polyline.setMap(instance));
      if (fastest.viewport) instance.fitBounds(fastest.viewport);
      const durationMillis = fastest.durationMillis ?? fastest.staticDurationMillis;
      const routeDistance = fastest.distanceMeters;
      if (typeof routeDistance === 'number' && typeof durationMillis === 'number') {
        navigationSteps.current = getNavigationSteps(fastest);
        navigationStepIndex.current = 0;
        routeMetrics.current = { distanceMeters: routeDistance, durationMillis };
        setNavigationRevision(revision => revision + 1);
      }
      setRouteStatus('Fastest traffic-aware driving route shown.');
    }).catch(error => {
      if (requestId !== routeRequest.current) return;
      setRouteStatus(getRouteErrorMessage(error));
      console.error('Google Maps route request failed:', error);
    });
  }, [destination, routeRequested, fresh, position, mapReady, routeAttempt, isDark]);

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
  const routeFailed = routeStatus.startsWith('Routes API request denied') || routeStatus.startsWith('Could not calculate');
  const gpsLabel = demoLocation ? 'Lusaka demo location' : fresh ? 'GPS live' : location.error ? 'GPS unavailable' : location.waiting ? 'Locating…' : 'GPS ready';

  return <section className={`relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-[var(--map-base)] dark:bg-[#0b211b] ${immersive ? '' : integrated ? 'min-h-0 rounded-3xl' : 'min-h-[390px] rounded-3xl border bg-card shadow-sm md:min-h-[560px]'}`}>
    {!immersive && !integrated && <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3"><div><p className="text-sm font-bold">Driver map</p><p className="mt-1 text-[10px] text-muted-foreground">Device location · Lusaka</p></div><span className={`inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[10px] font-semibold ${fresh ? 'text-foreground' : 'text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${fresh ? 'animate-pulse bg-primary' : location.error ? 'bg-destructive' : 'bg-muted-foreground'}`}/>{gpsLabel}</span></div>}
    <div className={`relative isolate min-h-0 flex-1 overflow-hidden bg-[var(--map-base)] dark:bg-[#0b211b] ${immersive ? '' : integrated ? 'h-[60svh] min-h-[360px] max-h-[540px]' : 'h-[36svh] min-h-[250px] max-h-[340px] md:h-auto md:min-h-[390px] md:max-h-none'}`}>
    <div ref={container} aria-label="Interactive Google map" className="absolute inset-0 z-0"/>
    {!immersive && <div className={`map-status-card pointer-events-none absolute z-[400] flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-2xl px-2.5 py-2 ${integrated ? 'bottom-12 left-1/2 -translate-x-1/2' : 'left-3 top-3 sm:left-4 sm:top-4'}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPinned size={18}/></span>
      <span className="min-w-0"><span className="block whitespace-nowrap text-[9px] font-extrabold tracking-[.16em] text-foreground">KAYAN DRIVER</span><span className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium text-muted-foreground"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${demoLocation ? 'bg-primary' : fresh ? 'animate-pulse bg-emerald-500' : location.error ? 'bg-destructive' : 'bg-amber-500'}`}/>{demoLocation ? 'Demo location · Lusaka' : fresh ? 'GPS fix active' : location.error ? 'GPS unavailable' : 'Waiting for GPS'}</span></span>
      {integrated && onAvailabilityChange && <label htmlFor="driver-online" title={online ? 'Go offline' : liveDriver ? 'Go online to receive passenger offers' : 'Go online in demo mode'} className={`pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-xl border px-2 py-1.5 transition-colors ${online ? 'border-primary/30 bg-primary/10' : 'border-border/70 bg-background/80'}`}>
        <span className="whitespace-nowrap text-[9px] font-bold text-foreground">{availabilityBusy ? 'WAIT…' : online ? 'ONLINE' : 'GO ONLINE'}</span>
        <span className={`driver-online-switch relative inline-flex shrink-0 rounded-full p-1 ${online ? 'is-online' : 'is-offline'}`}>
          <span aria-hidden="true" className="driver-online-pulse pointer-events-none absolute inset-0 rounded-full"/>
          <Switch id="driver-online" aria-label={availabilityBusy ? 'Updating driver availability' : online ? 'Go offline' : liveDriver ? 'Go online to receive passenger offers' : 'Go online in demo mode'} checked={online} disabled={availabilityBusy} onCheckedChange={onAvailabilityChange} className="relative z-10 h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"/>
        </span>
      </label>}
    </div>}
    <div className="pointer-events-none absolute right-3 top-3 z-[400] flex flex-col items-end gap-2 sm:right-4 sm:top-4">
      <button title="Center map on your location" className="map-control pointer-events-auto rounded-2xl" aria-label={position ? 'Center on device position' : 'Center on Lusaka default view'} onClick={center}><LocateFixed size={18}/></button>{position && !following && <button onClick={center} className="pointer-events-auto rounded-xl border bg-card px-3 py-2 text-[10px] font-bold text-foreground shadow-lg">Follow device</button>}
    </div>
    {(mapError || (routeStatus && !navigation) || !apiKey) && <div className="absolute left-4 right-4 top-24 z-[400] flex items-center justify-between gap-3 rounded-2xl border bg-card/95 px-4 py-3 text-[11px] text-foreground shadow-xl backdrop-blur sm:left-6 sm:right-6"><span role={mapError || routeFailed || !apiKey ? 'alert' : 'status'} className="min-w-0">{mapError || (!apiKey ? 'Google Maps needs a configured Maps JavaScript API key.' : routeStatus)}</span>{routeFailed && <button onClick={() => { lastRouteTarget.current = null; setRouteAttempt(attempt => attempt + 1); }} className="shrink-0 font-bold text-primary underline">Retry route</button>}</div>}
    {navigation && <NavigationCard navigation={navigation} fresh={fresh} demoLocation={demoLocation}/>}
    {location.error && !demoLocation && <div role="alert" className="absolute bottom-4 left-4 right-4 z-[400] rounded-2xl border border-white/15 bg-[var(--forest)]/95 p-4 text-xs leading-5 text-[var(--cream)] shadow-xl backdrop-blur sm:bottom-6 sm:left-6 sm:right-6">{location.error}<button onClick={location.start} className="ml-2 font-bold text-[#efac78] underline">Retry location</button></div>}
    </div>
    {integrated && <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="absolute bottom-8 right-3 z-[400] rounded-full border bg-card/85 px-2.5 py-1 text-[9px] font-semibold text-muted-foreground shadow-sm backdrop-blur">Google privacy</a>}
    {!immersive && !integrated && <div className="border-t bg-card px-4 py-3 text-[10px] leading-5 text-muted-foreground">Device location centers the map. Ride details and dispatch are simulated. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">Google privacy</a></div>}
  </section>;
}

function NativeGoogleKayanMap({ hasRoute, destination, stage = null, immersive = false, integrated = false, demoLocation = false, online = false, availabilityBusy = false, liveDriver = false, shareLocation = false, onAvailabilityChange, onDriverLocation, onRouteInfo }: GoogleKayanMapProps) {
  const routeRequested = hasRoute && stage !== null;
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<Awaited<ReturnType<typeof CapacitorGoogleMap.create>> | null>(null);
  const markerId = useRef<string | null>(null);
  const routeIds = useRef<string[]>([]);
  const markerRevision = useRef(0);
  const routeRevision = useRef(0);
  const lastRouteTarget = useRef<string | null>(null);
  const navigationSteps = useRef<NavigationStep[]>([]);
  const navigationStepIndex = useRef(0);
  const routeMetrics = useRef<{ distanceMeters: number; durationMillis: number } | null>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const [mapError, setMapError] = useState('');
  const [routeStatus, setRouteStatus] = useState('');
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [navigation, setNavigation] = useState<NavigationProgress | null>(null);
  const onRouteInfoRef = useRef(onRouteInfo);
  onRouteInfoRef.current = onRouteInfo;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const location = useDeviceLocation({ autoStart: !demoLocation });
  const position = demoLocation ? lusakaDemoPosition : location.position;
  const fresh = demoLocation || location.fresh;
  useRideLocationSharing(shareLocation, demoLocation, position, fresh, onDriverLocation);
  const androidApiKey = import.meta.env.VITE_GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const routesApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

  useEffect(() => {
    const metrics = routeMetrics.current;
    if (!metrics || !position) {
      setNavigation(null);
      return;
    }
    const progress = getNavigationProgress(
      navigationSteps.current,
      navigationStepIndex.current,
      { lat: position.coords.latitude, lng: position.coords.longitude },
      position.coords.accuracy,
      metrics.distanceMeters,
      metrics.durationMillis,
    );
    if (!progress) {
      setNavigation(null);
      onRouteInfoRef.current?.({ ...metrics, navigation: null, remainingDistanceMeters: metrics.distanceMeters, remainingDurationMillis: metrics.durationMillis });
      return;
    }
    navigationStepIndex.current = progress.currentIndex;
    setNavigation(progress.navigation);
    onRouteInfoRef.current?.({
      ...metrics,
      navigation: progress.navigation,
      remainingDistanceMeters: progress.navigation.remainingDistanceMeters,
      remainingDurationMillis: progress.navigation.remainingDurationMillis,
    });
  }, [fresh, mapReady, navigationRevision, position]);

  useEffect(() => {
    const mapHost = host.current;
    if (!mapHost) return;
    if (!androidApiKey) {
      setMapError('Native Google Maps is not configured. Provide the Android-restricted Maps SDK API key when building the driver app.');
      return;
    }

    let disposed = false;
    setMapReady(false);
    const backgroundOverrides: Array<{ element: HTMLElement; backgroundColor: string }> = [];
    // Android renders the native map behind the WebView, so every DOM ancestor must be transparent.
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
        styles: isDark ? kayanDarkMapStyles : kayanLightMapStyles,
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
      markerId.current = null;
      routeIds.current = [];
      lastRouteTarget.current = null;
      const instance = map.current;
      map.current = null;
      if (instance) void instance.destroy().catch(error => console.error('Could not destroy native Google Map:', error));
      mapHost.replaceChildren();
      for (const { element: ancestor, backgroundColor } of backgroundOverrides.reverse()) {
        ancestor.style.backgroundColor = backgroundColor;
      }
    };
  }, [androidApiKey, isDark]);

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
        title: demoLocation ? 'Demo location · Lusaka' : fresh ? 'Device-reported position' : 'Last fix · not current',
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
  }, [position, fresh, demoLocation, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (routeRequested && destination && lastRouteTarget.current === destination) return;
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
        navigationSteps.current = [];
        navigationStepIndex.current = 0;
        routeMetrics.current = null;
        setNavigation(null);
        onRouteInfoRef.current?.(null);
        setRouteStatus('');
        return;
      }
      if (lastRouteTarget.current === destination) return;
      await clearRoute();
      if (disposed || revision !== routeRevision.current) return;
      onRouteInfoRef.current?.(null);
      navigationSteps.current = [];
      navigationStepIndex.current = 0;
      routeMetrics.current = null;
      setNavigation(null);
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
        departureTime: getRouteDepartureTime(),
        computeAlternativeRoutes: true,
        fields: [
          'path',
          'durationMillis',
          'staticDurationMillis',
          'distanceMeters',
          'legs',
        ],
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
        strokeColor: '#120CDE',
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
      const durationMillis = fastest.durationMillis ?? fastest.staticDurationMillis;
      const routeDistance = fastest.distanceMeters;
      if (typeof routeDistance === 'number' && typeof durationMillis === 'number') {
        navigationSteps.current = getNavigationSteps(fastest);
        navigationStepIndex.current = 0;
        routeMetrics.current = { distanceMeters: routeDistance, durationMillis };
        setNavigationRevision(current => current + 1);
      }
      setRouteStatus('Fastest traffic-aware driving route shown.');
    })().catch(error => {
      if (disposed || revision !== routeRevision.current) return;
      lastRouteTarget.current = null;
      setRouteStatus(getRouteErrorMessage(error));
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
  const routeFailed = routeStatus.startsWith('Could not') || routeStatus.startsWith('Routes API request denied');
  const gpsLabel = demoLocation ? 'Lusaka demo location' : fresh ? 'GPS live' : location.error ? 'GPS unavailable' : location.waiting ? 'Locating…' : 'GPS ready';

  return <section className={`native-google-map-section relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 dark:bg-[#0b211b] ${immersive ? '' : integrated ? 'min-h-0 rounded-3xl' : 'min-h-[390px] rounded-3xl border bg-card shadow-sm md:min-h-[560px]'}`}>
    {!immersive && !integrated && <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3"><div><p className="text-sm font-bold">Driver map · Google Maps</p><p className="mt-1 text-[10px] text-muted-foreground">Device location · Lusaka</p></div><span className={`inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[10px] font-semibold ${fresh ? 'text-foreground' : 'text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${fresh ? 'animate-pulse bg-primary' : location.error ? 'bg-destructive' : 'bg-muted-foreground'}`}/>{gpsLabel}</span></div>}
    <div className={`native-google-map-viewport relative min-h-0 flex-1 overflow-hidden ${immersive ? '' : integrated ? 'h-[60svh] min-h-[360px] max-h-[540px]' : 'h-[36svh] min-h-[250px] max-h-[340px] md:h-auto md:min-h-[390px] md:max-h-none'}`}>
    <div ref={host} aria-label="Interactive native Google map" className="absolute inset-0"/>
    <div className="pointer-events-none absolute right-3 top-3 z-[400] flex flex-col items-end gap-2 sm:right-4 sm:top-4">
      <button className="map-control pointer-events-auto rounded-2xl" aria-label={position ? 'Center on device position' : 'Center on Lusaka default view'} onClick={center}><LocateFixed size={18}/></button>{position && !following && <button onClick={center} className="pointer-events-auto rounded-xl border bg-card px-3 py-2 text-[10px] font-bold text-foreground shadow-lg">Follow device</button>}
    </div>
    {integrated && onAvailabilityChange && <div className="map-status-card pointer-events-none absolute bottom-12 left-1/2 z-[400] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2.5 rounded-2xl px-3 py-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPinned size={18}/></span>
      <span><span className="block text-[9px] font-extrabold tracking-[.16em] text-foreground">KAYAN DRIVER</span><span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${demoLocation ? 'bg-primary' : fresh ? 'animate-pulse bg-emerald-500' : location.error ? 'bg-destructive' : 'bg-amber-500'}`}/>{demoLocation ? 'Demo location · Lusaka' : fresh ? 'GPS fix active' : location.error ? 'GPS unavailable' : 'Waiting for GPS'}</span></span>
      <label htmlFor="driver-online" title={online ? 'Go offline' : liveDriver ? 'Go online to receive passenger offers' : 'Go online in demo mode'} className={`pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-xl border px-2 py-1.5 transition-colors ${online ? 'border-primary/30 bg-primary/10' : 'border-border/70 bg-background/80'}`}>
        <span className="whitespace-nowrap text-[9px] font-bold text-foreground">{availabilityBusy ? 'WAIT…' : online ? 'ONLINE' : 'GO ONLINE'}</span>
        <span className={`driver-online-switch relative inline-flex shrink-0 rounded-full p-1 ${online ? 'is-online' : 'is-offline'}`}>
          <span aria-hidden="true" className="driver-online-pulse pointer-events-none absolute inset-0 rounded-full"/>
          <Switch id="driver-online" aria-label={availabilityBusy ? 'Updating driver availability' : online ? 'Go offline' : liveDriver ? 'Go online to receive passenger offers' : 'Go online in demo mode'} checked={online} disabled={availabilityBusy} onCheckedChange={onAvailabilityChange} className="relative z-10 h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"/>
        </span>
      </label>
    </div>}
    {(mapError || (routeStatus && !navigation)) && <div className="absolute left-4 right-4 top-24 z-[400] flex items-center justify-between gap-3 rounded-2xl border bg-card/95 px-4 py-3 text-[11px] text-foreground shadow-xl backdrop-blur sm:left-6 sm:right-6"><span role={mapError || routeFailed ? 'alert' : 'status'} className="min-w-0">{mapError || routeStatus}</span>{routeFailed && <button onClick={() => { lastRouteTarget.current = null; setRouteAttempt(attempt => attempt + 1); }} className="shrink-0 font-bold text-primary underline">Retry route</button>}</div>}
    {navigation && <NavigationCard navigation={navigation} fresh={fresh} demoLocation={demoLocation}/>}
    {location.error && !demoLocation && <div role="alert" className="absolute bottom-4 left-4 right-4 z-[400] rounded-2xl border border-white/15 bg-[var(--forest)]/95 p-4 text-xs leading-5 text-[var(--cream)] shadow-xl backdrop-blur sm:bottom-6 sm:left-6 sm:right-6">{location.error}<button onClick={location.start} className="ml-2 font-bold text-[#efac78] underline">Retry location</button></div>}
    </div>
    {integrated && <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="absolute bottom-8 right-3 z-[400] rounded-full border bg-card/85 px-2.5 py-1 text-[9px] font-semibold text-muted-foreground shadow-sm backdrop-blur">Google privacy</a>}
    {!immersive && !integrated && <div className="relative z-10 border-t bg-card px-4 py-3 text-[10px] leading-5 text-muted-foreground">Device location centers the map. Ride details and dispatch are simulated. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">Google privacy</a></div>}
  </section>;
}
