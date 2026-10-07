import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { LocateFixed, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useDeviceLocation from '@/hooks/useDeviceLocation';
import { getRouteDepartureTime, kayanDarkMapStyles, kayanLightMapStyles, loadGoogleMapsApi } from '@/lib/google-maps';
import type { PassengerDriverLocation } from '@/lib/ride-dispatch';

export type PassengerRouteInfo = {
  distanceMeters: number;
  durationMillis: number;
};

export type MapPoint = {
  address: string;
  latitude: number;
  longitude: number;
};

type RoutePreview = {
  pickup: string;
  destination: string;
};

type KayanMapProps = {
  hasRoute: boolean;
  destination: string;
  stage?: number | null;
  liveRideAccepted?: boolean;
  driverLocation?: PassengerDriverLocation | null;
  compact?: boolean;
  routePreview?: RoutePreview | null;
  onRouteInfo?: (info: PassengerRouteInfo | null) => void;
  onPickLocation?: (point: MapPoint) => void;
  selectedPoint?: Pick<MapPoint, 'latitude' | 'longitude'> | null;
};

const lusakaDefault = { lat: -15.4067, lng: 28.2871 };

function formatRouteInfo(info: PassengerRouteInfo) {
  const distanceKm = (info.distanceMeters / 1000).toFixed(1);
  const minutes = Math.max(1, Math.round(info.durationMillis / 60_000));
  return `${distanceKm} km · ${minutes} min`;
}

export default function KayanMap({
  hasRoute,
  destination,
  stage = null,
  liveRideAccepted = false,
  driverLocation = null,
  compact = false,
  routePreview = null,
  onRouteInfo,
  onPickLocation,
  selectedPoint = null,
}: KayanMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const device = useRef<google.maps.Marker | null>(null);
  const accuracy = useRef<google.maps.Circle | null>(null);
  const driver = useRef<google.maps.Marker | null>(null);
  const driverAccuracy = useRef<google.maps.Circle | null>(null);
  const route = useRef<google.maps.Polyline | null>(null);
  const pickupMarker = useRef<google.maps.Marker | null>(null);
  const destinationMarker = useRef<google.maps.Marker | null>(null);
  const selectedMarker = useRef<google.maps.Marker | null>(null);
  const routeRequest = useRef(0);
  const mapPickRequest = useRef(0);
  const follow = useRef(true);
  const onPickLocationRef = useRef(onPickLocation);
  onPickLocationRef.current = onPickLocation;
  const [following, setFollowing] = useState(true);
  const [mapError, setMapError] = useState('');
  const [mapPickStatus, setMapPickStatus] = useState('');
  const [routeStatus, setRouteStatus] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const location = useDeviceLocation();
  const { position, fresh, enabled } = location;
  const { resolvedTheme } = useTheme();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const routePickup = routePreview?.pickup.trim() ?? '';
  const routeDestination = routePreview?.destination.trim() ?? '';
  const locationAgeSeconds = driverLocation
    ? Math.max(0, Math.floor((clock - Date.parse(driverLocation.updated_at)) / 1000))
    : null;
  const driverLocationFresh = locationAgeSeconds !== null && locationAgeSeconds <= 30;

  useEffect(() => {
    if (!driverLocation) return;
    const timer = window.setInterval(() => setClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [driverLocation]);

  useEffect(() => {
    if (!container.current) return;
    if (!apiKey) {
      setMapError('Google Maps needs a configured Maps JavaScript API key.');
      return;
    }

    let disposed = false;
    let observer: ResizeObserver | null = null;
    let dragListener: google.maps.MapsEventListener | null = null;
    let mapClickListener: google.maps.MapsEventListener | null = null;
    const previousAuthFailure = window.gm_authFailure;
    const authFailure = () => {
      previousAuthFailure?.();
      if (!disposed) {
        setMapError(`Google Maps rejected this website referrer. Add ${window.location.origin}/* to the API key's website restrictions, enable Maps JavaScript API, and check billing.`);
      }
    };
    window.gm_authFailure = authFailure;

    void loadGoogleMapsApi(apiKey).then(() => {
      if (disposed || !container.current) return;
      const instance = new google.maps.Map(container.current, {
        center: lusakaDefault,
        zoom: 13,
        styles: kayanLightMapStyles,
        gestureHandling: 'cooperative',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: !onPickLocationRef.current,
        draggableCursor: onPickLocationRef.current ? 'crosshair' : undefined,
      });
      map.current = instance;
      dragListener = instance.addListener('dragstart', () => {
        follow.current = false;
        setFollowing(false);
      });
      if (onPickLocationRef.current) {
        mapClickListener = instance.addListener('click', event => {
          if (!event.latLng) return;
          const location = { lat: event.latLng.lat(), lng: event.latLng.lng() };
          const requestId = ++mapPickRequest.current;
          if (!selectedMarker.current) selectedMarker.current = new google.maps.Marker({ map: instance });
          selectedMarker.current.setMap(instance);
          selectedMarker.current.setPosition(location);
          selectedMarker.current.setTitle('Selected saved address');
          onPickLocationRef.current?.({ address: '', latitude: location.lat, longitude: location.lng });
          setMapPickStatus('Looking up the address for this pin…');
          void new google.maps.Geocoder().geocode({ location }).then(({ results }) => {
            if (disposed || requestId !== mapPickRequest.current) return;
            const address = results[0]?.formatted_address;
            if (!address) {
              setMapPickStatus('Google Maps could not find an address for this pin. Try another point.');
              return;
            }
            setMapPickStatus('');
            onPickLocationRef.current?.({ address, latitude: location.lat, longitude: location.lng });
          }).catch(error => {
            if (disposed || requestId !== mapPickRequest.current) return;
            console.error('Passenger saved-address lookup failed:', error);
            setMapPickStatus(error instanceof Error
              ? `Address lookup failed: ${error.message}`
              : 'Address lookup failed. Try another point.');
          });
        });
      }
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
      mapClickListener?.remove();
      if (window.gm_authFailure === authFailure) window.gm_authFailure = previousAuthFailure;
      routeRequest.current += 1;
      mapPickRequest.current += 1;
      route.current?.setMap(null);
      pickupMarker.current?.setMap(null);
      destinationMarker.current?.setMap(null);
      selectedMarker.current?.setMap(null);
      device.current?.setMap(null);
      accuracy.current?.setMap(null);
      driver.current?.setMap(null);
      driverAccuracy.current?.setMap(null);
      map.current = null;
      setMapReady(false);
    };
  }, [apiKey]);

  useEffect(() => {
    map.current?.setOptions({ styles: resolvedTheme === 'dark' ? kayanDarkMapStyles : kayanLightMapStyles });
  }, [resolvedTheme, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (!selectedPoint) {
      selectedMarker.current?.setMap(null);
      return;
    }
    const position = { lat: selectedPoint.latitude, lng: selectedPoint.longitude };
    if (!selectedMarker.current) selectedMarker.current = new google.maps.Marker({ map: instance });
    selectedMarker.current.setMap(instance);
    selectedMarker.current.setPosition(position);
    selectedMarker.current.setTitle('Selected saved address');
    instance.setCenter(position);
    instance.setZoom(16);
  }, [mapReady, selectedPoint]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (!position || !enabled) {
      device.current?.setMap(null);
      accuracy.current?.setMap(null);
      device.current = null;
      accuracy.current = null;
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
    if (!accuracy.current) accuracy.current = new google.maps.Circle({ map: instance });
    accuracy.current.setOptions({
      center: point,
      radius: position.coords.accuracy,
      strokeColor: color,
      strokeWeight: 1,
      fillColor: color,
      fillOpacity: 0.12,
      clickable: false,
    });

    if (follow.current && fresh && !driverLocation) {
      instance.setCenter(point);
      instance.setZoom(Math.max(15, instance.getZoom() ?? 13));
    }
  }, [position, fresh, enabled, driverLocation, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (!driverLocation) {
      driver.current?.setMap(null);
      driverAccuracy.current?.setMap(null);
      driver.current = null;
      driverAccuracy.current = null;
      return;
    }

    const point = { lat: driverLocation.latitude, lng: driverLocation.longitude };
    const color = driverLocationFresh ? '#176b52' : '#64748b';
    if (!driver.current) driver.current = new google.maps.Marker({ map: instance, position: point });
    driver.current.setMap(instance);
    driver.current.setPosition(point);
    driver.current.setIcon({
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    });
    driver.current.setTitle(driverLocationFresh ? 'Your driver · live location' : 'Last driver location · not current');
    if (!driverAccuracy.current) driverAccuracy.current = new google.maps.Circle({ map: instance });
    driverAccuracy.current.setOptions({
      center: point,
      radius: Math.max(driverLocation.accuracy_m, 10),
      strokeColor: color,
      strokeWeight: 1,
      fillColor: color,
      fillOpacity: 0.12,
      clickable: false,
    });

    if (follow.current) {
      if (position && enabled) {
        instance.fitBounds(
          new google.maps.LatLngBounds(
            point,
            { lat: position.coords.latitude, lng: position.coords.longitude },
          ),
          48,
        );
      } else {
        instance.setCenter(point);
        instance.setZoom(15);
      }
    }
  }, [driverLocation, driverLocationFresh, enabled, mapReady, position]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;

    route.current?.setMap(null);
    pickupMarker.current?.setMap(null);
    destinationMarker.current?.setMap(null);
    route.current = null;
    pickupMarker.current = null;
    destinationMarker.current = null;
    onRouteInfo?.(null);

    if (!routePickup || !routeDestination) {
      setRouteStatus('');
      return;
    }
    if (!apiKey) {
      setRouteStatus('Route preview needs a configured Google Maps API key.');
      return;
    }

    const requestId = ++routeRequest.current;
    setRouteStatus('Finding a Google driving route…');
    void (async () => {
      const library = await google.maps.importLibrary('routes');
      const { Route } = library as google.maps.RoutesLibrary;
      const result = await Route.computeRoutes({
        origin: routePickup,
        destination: routeDestination,
        travelMode: google.maps.TravelMode.DRIVING,
        routingPreference: google.maps.routes.RoutingPreference.TRAFFIC_AWARE_OPTIMAL,
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
        departureTime: getRouteDepartureTime(),
        computeAlternativeRoutes: false,
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
      });
      if (requestId !== routeRequest.current) return;
      const fastest = result.routes?.[0];
      if (!fastest?.path?.length) throw new Error('Google Maps did not return a driving route for these locations.');

      route.current = new google.maps.Polyline({
        map: instance,
        path: fastest.path,
        strokeColor: '#168d79',
        strokeOpacity: 0.96,
        strokeWeight: 6,
      });
      pickupMarker.current = new google.maps.Marker({
        map: instance,
        position: fastest.path[0],
        title: 'Pickup',
        label: { text: 'P', color: '#ffffff', fontWeight: 'bold' },
      });
      destinationMarker.current = new google.maps.Marker({
        map: instance,
        position: fastest.path[fastest.path.length - 1],
        title: 'Drop-off',
        label: { text: 'D', color: '#ffffff', fontWeight: 'bold' },
      });
      const bounds = new google.maps.LatLngBounds();
      fastest.path.forEach(point => bounds.extend(point));
      instance.fitBounds(bounds, 48);

      if (typeof fastest.distanceMeters === 'number' && typeof fastest.durationMillis === 'number') {
        const info = { distanceMeters: fastest.distanceMeters, durationMillis: fastest.durationMillis };
        onRouteInfo?.(info);
        setRouteStatus(`Google route ready · ${formatRouteInfo(info)}`);
      } else {
        setRouteStatus('Google route shown; distance and duration were unavailable.');
      }
    })().catch(error => {
      if (requestId !== routeRequest.current) return;
      const message = error instanceof Error ? error.message : 'Google Maps could not calculate this route.';
      setRouteStatus(message);
      console.error('Passenger Google Maps route request failed:', error);
    });
  }, [apiKey, mapReady, onRouteInfo, routeDestination, routePickup]);

  const center = () => {
    follow.current = true;
    setFollowing(true);
    if (driverLocation) {
      map.current?.setCenter({ lat: driverLocation.latitude, lng: driverLocation.longitude });
      map.current?.setZoom(16);
    } else if (position) {
      map.current?.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
      map.current?.setZoom(16);
    } else {
      map.current?.setCenter(lusakaDefault);
      map.current?.setZoom(13);
    }
  };
  const locationStatus = !enabled
    ? 'Location off'
    : !location.foreground
      ? 'Paused · app not visible'
      : location.waiting
        ? 'Waiting for device fix…'
        : !fresh
          ? 'Last fix is stale · not current'
          : position && position.coords.accuracy > 50
            ? 'Live fix · low accuracy'
            : 'Live device fix';
  const mapCanvas = <div className={`relative isolate bg-secondary ${compact ? 'h-full min-h-[240px]' : 'min-h-[330px] flex-1'}`}>
    <div ref={container} aria-label="Interactive Google map" className="absolute inset-0 z-0"/>
    <button
      type="button"
      className="map-control absolute right-3 top-3 z-[400]"
      aria-label={driverLocation ? 'Center on driver location' : position ? 'Center on device position' : 'Center on Lusaka default view'}
      onClick={center}
    ><LocateFixed size={18}/></button>
    {(driverLocation || position) && !following && <button type="button" onClick={center} className="absolute right-3 top-16 z-[400] rounded-xl border bg-card px-3 py-2 text-[10px] font-bold text-foreground shadow">{driverLocation ? 'Follow driver' : 'Follow device'}</button>}
    {(mapError || !mapReady || routeStatus) && <div role={mapError ? 'alert' : 'status'} className="absolute bottom-3 left-3 right-3 z-[400] rounded-xl border bg-card/95 p-3 text-[11px] leading-4 text-foreground shadow">{mapError || routeStatus || 'Loading Google Maps…'}</div>}
    {mapPickStatus && <div role={mapPickStatus.startsWith('Address lookup failed') || mapPickStatus.startsWith('Google Maps could not') ? 'alert' : 'status'} className="absolute left-3 right-3 top-14 z-[400] rounded-xl border bg-card/95 p-3 text-[11px] leading-4 text-foreground shadow">{mapPickStatus}</div>}
  </div>;

  if (compact) return mapCanvas;

  return <section className="flex h-full min-h-[610px] flex-col overflow-hidden rounded-2xl border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex items-center gap-2"><MapPin size={17} className="text-primary"/><div><p className="text-xs font-bold">Real map · Google Maps</p><p role="status" className="mt-1 text-[10px] text-muted-foreground">{liveRideAccepted ? driverLocation ? driverLocationFresh ? 'Driver GPS · live' : `Last driver fix · ${locationAgeSeconds}s ago` : 'Waiting for the driver’s first GPS fix' : position ? 'Device position, not a demo driver' : 'Lusaka default view · not your location'}</p></div></div>
      <span className="rounded-full bg-secondary px-3 py-1 text-[10px]">Internet needed for Google Maps</span>
    </div>
    {mapCanvas}
    <div className="space-y-3 border-t p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${fresh ? 'bg-primary' : 'bg-muted-foreground'}`}/><p role="status" className="text-xs font-bold">{locationStatus}</p></div>{enabled ? <Button variant="outline" className="h-9 rounded-xl text-xs" onClick={location.stop}>Stop location</Button> : <Button className="kayan-action h-10 text-xs" onClick={() => { center(); location.start(); }}>Enable device location</Button>}</div>
      {position && <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary p-3 text-[11px]"><div><p className="font-bold">Reported accuracy: ±{Math.round(position.coords.accuracy)} m</p><p className="mt-1 text-muted-foreground">{location.permission} · high accuracy requested</p></div><div><p className="font-bold">Fix age: {location.age}s {fresh ? '' : '· not current'}</p><p className="mt-1 break-words font-mono text-muted-foreground">{position.coords.latitude.toFixed(6)}, {position.coords.longitude.toFixed(6)}</p></div></div>}
      {location.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-background p-3 text-xs leading-5 text-destructive">{location.error}{enabled && <button onClick={location.start} className="ml-2 font-bold underline">Retry location</button>}</p>}
      <p className="text-[10px] leading-5 text-muted-foreground">{liveRideAccepted ? 'The driver’s GPS is shared for this accepted ride only and is cleared when the ride ends. A muted marker means the last fix is no longer current. ' : 'Opt-in foreground tracking only. Your device location is not saved or sent to KAYAN. '}Google Maps may process the map area and IP address. Route previews send the entered pickup and drop-off to Google Maps. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">Google privacy policy</a>.</p>
      <div className="flex items-start gap-2 rounded-xl bg-secondary p-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary"/><p className="text-[10px] leading-5 text-muted-foreground">{liveRideAccepted ? driverLocation ? 'Your driver’s approximate location is shown on the map and updates while their app has a fresh GPS fix.' : 'Your driver accepted the ride. The map will update when their app sends its first GPS fix.' : <><strong className="text-foreground">{stage === null ? 'Trips remain simulated.' : ['Demo approaching pickup', 'Demo at pickup', 'Demo trip in progress', 'Demo drop-off reached'][stage]}</strong> {hasRoute ? `Demo destination: ${destination}. ` : ''}Pickup addresses, ride stages, fares and ETAs are not based on this device location. No live dispatch or turn-by-turn navigation.</>}</p></div>
      <a href="https://support.google.com/maps/answer/3094088" target="_blank" rel="noopener noreferrer" className="inline-block text-[10px] text-muted-foreground underline">Google Maps help</a>
    </div>
  </section>;
}
