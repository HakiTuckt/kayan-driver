import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Geolocation, type Position } from '@capacitor/geolocation';

function locationError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === '1' || code === 'OS-PLUG-GLOC-0003') return 'Location permission denied. Allow location in Android App settings (or browser site settings), then retry.';
  if (['OS-PLUG-GLOC-0007', 'OS-PLUG-GLOC-0009', 'OS-PLUG-GLOC-0016'].includes(code)) return 'Location services are off or unavailable. Enable Android Location and Google Location Accuracy, then retry.';
  if (code === '3' || code === 'OS-PLUG-GLOC-0010') return 'GPS has not returned a fix yet. Keep the map open, enable device Location, and move outdoors for an initial fix. Tracking will continue automatically.';
  if (['OS-PLUG-GLOC-0014', 'OS-PLUG-GLOC-0015'].includes(code)) return 'Google Play Services needs attention. Enable or update it on this Android device, then retry.';
  return 'Unable to read device location. Check location permission, Android Location, and Google Play Services, then retry. Browser previews must allow geolocation in this frame.';
}

export default function useDeviceLocation({ autoStart = false }: { autoStart?: boolean } = {}) {
  const [enabled, setEnabled] = useState(autoStart);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [appActive, setAppActive] = useState(!Capacitor.isNativePlatform());
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState('Not requested');
  const [waiting, setWaiting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [attempt, setAttempt] = useState(0);
  const mayRequest = useRef(autoStart);
  const foreground = visible && appActive;

  useEffect(() => {
    mayRequest.current = autoStart;
    setEnabled(autoStart);
    if (!autoStart) {
      setPosition(null);
      setError('');
    }
  }, [autoStart]);

  useEffect(() => {
    const visibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    let disposed = false;
    let stateChanged = false;
    const listener = Capacitor.isNativePlatform() ? App.addListener('appStateChange', state => {
      stateChanged = true;
      if (!disposed) setAppActive(state.isActive);
    }) : null;
    if (Capacitor.isNativePlatform()) void App.getState().then(state => {
      if (!disposed && !stateChanged) setAppActive(state.isActive);
    }).catch(() => { if (!disposed) setAppActive(true); });
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      if (listener) void listener.then(handle => handle.remove());
    };
  }, []);

  useEffect(() => {
    if (!enabled || !foreground) { setWaiting(false); return; }
    let disposed = false;
    let watchId: string | undefined;
    setWaiting(true);
    setError('');
    const start = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          let permissions = await Geolocation.checkPermissions();
          if (disposed) return;
          if (permissions.location !== 'granted' && mayRequest.current) {
            mayRequest.current = false;
            permissions = await Geolocation.requestPermissions({ permissions: ['location'] });
          }
          if (disposed) return;
          if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
            setPermission('Denied');
            throw { code: 'OS-PLUG-GLOC-0003' };
          }
          setPermission(permissions.location === 'granted' ? 'Precise allowed' : 'Approximate only');
        } else if (!navigator.geolocation || !window.isSecureContext) {
          throw new Error('Geolocation unavailable');
        }
        if (disposed) return;
        mayRequest.current = false;
        const id = await Geolocation.watchPosition({
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: Capacitor.isNativePlatform() ? 15000 : 60000,
          minimumUpdateInterval: 5000,
        }, (fix, err) => {
          if (disposed) return;
          if (err) {
            const code = String(err.code || '');
            setWaiting(false);
            setError(locationError(err));
            if (code === '1' || code === 'OS-PLUG-GLOC-0003') { setPermission('Denied'); setEnabled(false); setPosition(null); }
            return;
          }
          if (!fix) return;
          const { latitude, longitude, accuracy } = fix.coords;
          if (![latitude, longitude, accuracy, fix.timestamp].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0) {
            setError('The device returned an invalid fix. Waiting for a valid location.');
            return;
          }
          setPosition(fix);
          setNow(Date.now());
          setWaiting(false);
          setError('');
          if (!Capacitor.isNativePlatform()) setPermission('Browser location allowed');
        });
        if (disposed) await Geolocation.clearWatch({ id });
        else watchId = id;
      } catch (err) {
        if (!disposed) { setError(locationError(err)); setWaiting(false); setEnabled(false); setPosition(null); }
      }
    };
    void start();
    return () => {
      disposed = true;
      if (watchId !== undefined) void Geolocation.clearWatch({ id: watchId }).catch(() => {});
    };
  }, [enabled, foreground, attempt]);

  useEffect(() => {
    if (!position || !enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [position, enabled]);

  const age = position ? Math.max(0, Math.floor((now - position.timestamp) / 1000)) : null;
  const fresh = enabled && foreground && !waiting && !error && age !== null && age <= 30;
  return {
    enabled, foreground, position, permission, waiting, error, age, fresh,
    start: () => { mayRequest.current = true; setError(''); setEnabled(true); setAttempt(n => n + 1); },
    stop: () => { mayRequest.current = false; setEnabled(false); setPosition(null); setError(''); },
  };
}
