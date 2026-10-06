import { Loader } from '@googlemaps/js-api-loader';

export type MapCoordinate = { lat: number; lng: number };

export type DrivingRoute = {
  path: MapCoordinate[];
  start: MapCoordinate;
  end: MapCoordinate;
  bounds: {
    southwest: MapCoordinate;
    northeast: MapCoordinate;
  };
  distance: string;
  duration: string;
};

let mapsPromise: ReturnType<Loader['load']> | null = null;

async function loadGoogleMaps() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new Error('Google Maps browser API key is missing.');
  if (!mapsPromise) {
    mapsPromise = new Loader({ apiKey, version: 'weekly', libraries: ['places'] }).load()
      .catch(error => {
        mapsPromise = null;
        throw error;
      });
  }
  return mapsPromise;
}

export async function getRecommendedDrivingRoute(origin: string | MapCoordinate, destination: MapCoordinate): Promise<DrivingRoute> {
  const maps = await loadGoogleMaps();
  const { Route } = await maps.maps.importLibrary('routes') as google.maps.RoutesLibrary;
  const { routes } = await Route.computeRoutes({
    origin,
    destination,
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_UNAWARE',
    computeAlternativeRoutes: false,
    fields: ['path', 'viewport', 'distanceMeters', 'durationMillis'],
  });
  const route = routes?.[0];
  if (!route?.path || route.path.length < 2 || !route.viewport || route.distanceMeters == null || route.durationMillis == null) {
    throw new Error('Google Maps did not return a driving route for this pickup and destination.');
  }

  const distance = route.distanceMeters < 1000
    ? `${Math.round(route.distanceMeters)} m`
    : `${(route.distanceMeters / 1000).toFixed(1)} km`;
  return {
    path: route.path.map(point => ({ lat: point.lat, lng: point.lng })),
    start: { lat: route.path[0].lat, lng: route.path[0].lng },
    end: { lat: route.path[route.path.length - 1].lat, lng: route.path[route.path.length - 1].lng },
    bounds: {
      southwest: route.viewport.getSouthWest().toJSON(),
      northeast: route.viewport.getNorthEast().toJSON(),
    },
    distance,
    duration: `${Math.ceil(route.durationMillis / 60000)} min`,
  };
}
