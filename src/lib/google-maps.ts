declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

let mapsApiPromise: Promise<void> | null = null;

export const kayanLightMapStyles: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#edf5f1' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#42636a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#edf5f1' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c3d9d0' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#e4efe8' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#d8eade' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#52776c' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8e2d0' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d1e1db' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#42636a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#9dd6c2' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#82c4ae' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#b2d7cb' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c2e2e8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#477986' }] },
];

export const kayanDarkMapStyles: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#183b43' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d1e5e6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#183b43' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#102c34' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c2735' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1b4147' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#a7c9c8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#31545a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#41666c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#c6e0dc' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#527c7c' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#65918e' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#41666c' }] },
];

export const getRouteDepartureTime = () => new Date(Date.now() + 60_000);

export function loadGoogleMapsApi(apiKey: string) {
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
