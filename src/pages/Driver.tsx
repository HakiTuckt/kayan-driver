import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CarFront, CheckCircle2, Clock3, LayoutDashboard, LogOut, MapPin, Menu, RotateCcw, ShieldCheck, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ThemeSelect from '@/components/ThemeSelect';
import GoogleKayanMap, { type GoogleRouteInfo } from '@/components/GoogleKayanMap';
import DriverRegistration, { type DriverProfile } from '@/components/driver/DriverRegistration';
import DriverDatabaseUnavailable from '@/components/driver/DriverDatabaseUnavailable';
import DriverPhoneLogin from '@/components/driver/DriverPhoneLogin';
import DriverTrip, { DailyEarningsGoal, type DemoRequest } from '@/components/driver/DriverTrip';
import type { RouteEstimate } from '@/components/driver/DriverTrip';
import { getSupabaseClient, isSupabaseConfigured, restoreDemoDriverProfile, saveDemoDriverProfile } from '@/lib/supabase';
import { signOutDriver } from '@/lib/driver-phone-auth';
import type { DriverDocuments } from '@/lib/driver-documents';
import { estimateRouteFuel } from '@/lib/driver-fuel-estimate';
import {
  finishDriverRideRequest,
  liveDispatchEnabled,
  loadAcceptedDriverRide,
  loadDriverOffer,
  respondToDriverOffer,
  setDriverAvailability,
  subscribeToDriverOffers,
} from '@/lib/ride-dispatch';
import { configureDriverPushNotifications } from '@/lib/driver-push-notifications';
import { toast } from 'sonner';

type HistoryTrip = DemoRequest & { status: 'Completed' | 'Cancelled' | 'Declined'; date: string; dayKey: string };
const samples: Omit<DemoRequest, 'id'>[] = [
  { passenger: 'Chanda M. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'East Park Mall', fare: 85, distance: '6.2 km' },
  { passenger: 'Mwila B. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'Arcades Shopping Centre', fare: 70, distance: '5.0 km' },
  { passenger: 'Grace N. (fictional)', pickup: 'Rhodes Park · main entrance', destination: 'University of Zambia', fare: 95, distance: '7.4 km' },
];
const passengerSearchTips = [
  'Keep location access enabled for accurate pickup matching. ·',
  'Review pickup and drop-off details before accepting an offer. ·',
  'You can go offline whenever you need.',
];
const DEMO_SEARCH_DURATION_MS = 7_000;
const createDemoRequest = (sequence: number): DemoRequest => ({ ...samples[sequence % samples.length], id: `KD-${String(sequence + 1).padStart(3, '0')}` });
const returningProfile: DriverProfile = { name: 'Demo Driver', phone: 'Not saved', city: 'Lusaka', make: 'Toyota', model: 'Corolla', year: '2020', fuelType: 'petrol', engineTrim: '1.8 L petrol', plate: 'DEMO 001', color: 'Silver' };
const driverBuild = import.meta.env.VITE_APP_VARIANT === 'driver';
const getLocalDayKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const formatElapsed = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
};

export default function Driver() {
  const [registered, setRegistered] = useState(false);
  const [profile, setProfile] = useState<DriverProfile>(returningProfile);
  const [registrationProfile, setRegistrationProfile] = useState<Partial<DriverProfile>>();
  const [phoneAccountVerified, setPhoneAccountVerified] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [registrationNeedsDocuments, setRegistrationNeedsDocuments] = useState(false);
  const [phoneLoginOpen, setPhoneLoginOpen] = useState(false);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const databaseConfigured = isSupabaseConfigured();
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState('');
  const [databaseRevision, setDatabaseRevision] = useState(0);
  const [view, setView] = useState<'dashboard' | 'earnings' | 'history'>('dashboard');
  const [online, setOnline] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [demoSearchPending, setDemoSearchPending] = useState(false);
  const [onlineSince, setOnlineSince] = useState<number | null>(null);
  const [onlineSeconds, setOnlineSeconds] = useState(0);
  const [request, setRequest] = useState<DemoRequest | null>(null);
  const [active, setActive] = useState<DemoRequest | null>(null);
  const [routeInfo, setRouteInfo] = useState<GoogleRouteInfo | null>(null);
  const [stage, setStage] = useState(0);
  const [sequence, setSequence] = useState(0);
  const [history, setHistory] = useState<HistoryTrip[]>([]);
  const [currentDayKey, setCurrentDayKey] = useState(() => getLocalDayKey(new Date()));
  const [resetOpen, setResetOpen] = useState(false);
  const pushController = useRef<Awaited<ReturnType<typeof configureDriverPushNotifications>> | null>(null);
  const handledOffers = useRef(new Set<string>());
  const requestRef = useRef(request);
  const activeRef = useRef(active);
  const mainRef = useRef<HTMLElement>(null);
  const isLiveDriver = liveDispatchEnabled && phoneAccountVerified && !demoMode;
  requestRef.current = request;
  activeRef.current = active;
  const receiveOffer = useRef<(offerId: string) => Promise<void>>(async () => undefined);
  receiveOffer.current = async offerId => {
    if (handledOffers.current.has(offerId)) return;
    const incoming = await loadDriverOffer(offerId);
    if (!incoming) return;
    handledOffers.current.add(offerId);
    if (activeRef.current) {
      toast('New ride offer received', { description: 'You are on a trip. This offer will expire if not answered.' });
      return;
    }
    if (requestRef.current) {
      toast('New ride offer received', { description: 'A ride offer is already waiting in the app.' });
      return;
    }
    setRequest(incoming);
    toast('New passenger ride offer', { description: `${incoming.pickup} to ${incoming.destination}` });
  };
  useEffect(() => {
    let cancelled = false;
    setDatabaseLoading(true);
    setDatabaseError('');
    if (!databaseConfigured) {
      setDatabaseLoading(false);
      return () => { cancelled = true; };
    }
    void restoreDemoDriverProfile().then(savedDriver => {
      if (cancelled) return;
      if (savedDriver) {
        const initialProfile = savedDriver.profile ?? (savedDriver.phone ? { phone: savedDriver.phone } : undefined);
        if (savedDriver.profile) setProfile(savedDriver.profile);
        setRegistrationProfile(initialProfile);
        setPhoneAccountVerified(savedDriver.phoneVerified);
        setDemoMode(!savedDriver.phoneVerified);
        setRegistrationNeedsDocuments(!!savedDriver.profile && !savedDriver.documentsComplete);
        setRegistered(!!savedDriver.profile && savedDriver.documentsComplete);
      } else {
        setRegistrationProfile(undefined);
        setPhoneAccountVerified(false);
        setDemoMode(false);
        setRegistrationNeedsDocuments(false);
        setRegistered(false);
      }
    }).catch(error => {
      if (!cancelled) setDatabaseError(error instanceof Error ? error.message : 'Could not load the saved demo profile.');
    }).finally(() => {
      if (!cancelled) setDatabaseLoading(false);
    });
    return () => { cancelled = true; };
  }, [databaseConfigured, databaseRevision]);
  useEffect(() => {
    if (!isLiveDriver || !databaseConfigured || !registered) return;
    let cancelled = false;
    void (async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error(`Could not check for an active driver ride: ${error.message}`);
      const driverId = data.session?.user.id;
      if (!driverId) return;
      const restoredRide = await loadAcceptedDriverRide(driverId);
      if (!cancelled && restoredRide) {
        setActive(restoredRide);
        setRequest(null);
        setOnline(false);
        setOnlineSince(null);
      }
    })().catch(error => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not restore the active driver ride.');
    });
    return () => { cancelled = true; };
  }, [databaseConfigured, databaseRevision, isLiveDriver, registered]);
  useEffect(() => {
    if (!isLiveDriver || !databaseConfigured) return;
    let cancelled = false;
    let channel: ReturnType<typeof subscribeToDriverOffers> | null = null;
    let pushSetup: Awaited<ReturnType<typeof configureDriverPushNotifications>> | null = null;
    void (async () => {
      pushSetup = await configureDriverPushNotifications({
        onOffer: offerId => receiveOffer.current(offerId),
        onError: message => toast.error(message),
      });
      if (cancelled) {
        await pushSetup.remove();
        return;
      }
      pushController.current = pushSetup;

      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(`Could not restore the driver notification session: ${sessionError.message}`);
      const driverId = sessionData.session?.user.id;
      if (!driverId) return;

      channel = subscribeToDriverOffers(
        driverId,
        offerId => { void receiveOffer.current(offerId).catch(error => toast.error(error instanceof Error ? error.message : 'Could not load the incoming ride offer.')); },
        message => toast.error(message),
      );
      const { data: pending, error: pendingError } = await supabase
        .from('driver_ride_offers')
        .select('id')
        .eq('driver_id', driverId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      if (pendingError) throw new Error(`Could not check waiting ride offers: ${pendingError.message}`);
      for (const offer of pending ?? []) {
        if (typeof offer.id === 'string') {
          void receiveOffer.current(offer.id).catch(error => toast.error(error instanceof Error ? error.message : 'Could not load a waiting ride offer.'));
        }
      }
    })().catch(error => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not configure driver ride notifications.');
    });
    return () => {
      cancelled = true;
      pushController.current = null;
      if (channel) void getSupabaseClient().removeChannel(channel).catch(error => console.error('Could not stop the driver offer listener:', error));
      if (pushSetup) void pushSetup.remove().catch(error => console.error('Could not remove push listeners:', error));
    };
  }, [applicationSubmitted, databaseConfigured, databaseRevision, isLiveDriver, registered]);
  useEffect(() => {
    if (onlineSince === null) {
      setOnlineSeconds(0);
      return;
    }
    const updateElapsed = () => setOnlineSeconds(Math.floor((Date.now() - onlineSince) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [onlineSince]);
  useEffect(() => {
    if (!demoSearchPending || !online || isLiveDriver || request || active) return;
    const timer = window.setTimeout(() => {
      setRequest(createDemoRequest(sequence));
      setSequence(current => current + 1);
      setDemoSearchPending(false);
    }, DEMO_SEARCH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [active, demoSearchPending, isLiveDriver, online, request, sequence]);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDayKey(getLocalDayKey(new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!isLiveDriver || !online) return;
    const heartbeat = window.setInterval(() => {
      void setDriverAvailability(true).catch(error => {
        toast.error(`Live availability could not be renewed: ${error instanceof Error ? error.message : 'Unknown error.'}`);
        setOnline(false);
        setOnlineSince(null);
      });
    }, 45_000);
    return () => window.clearInterval(heartbeat);
  }, [isLiveDriver, online]);
  const completed = history.filter(t => t.status === 'Completed');
  const completedToday = history.filter(t => t.status === 'Completed' && t.dayKey === currentDayKey);
  const earnings = completed.reduce((sum, t) => sum + t.fare, 0);
  const dailyEarnings = completedToday.reduce((sum, t) => sum + t.fare, 0);
  const routeEstimate: RouteEstimate | null = routeInfo ? {
    arrivalTime: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
      .format(new Date(Date.now() + routeInfo.remainingDurationMillis)),
    distanceKm: routeInfo.remainingDistanceMeters / 1000,
    fuel: estimateRouteFuel(profile, routeInfo.remainingDistanceMeters),
    navigation: routeInfo.navigation,
  } : null;
  const generateRequest = () => {
    setRequest(createDemoRequest(sequence));
    setSequence(n => n + 1);
    setDemoSearchPending(false);
  };
  const changeAvailability = async (isOnline: boolean) => {
    if (availabilityBusy) return;
    setAvailabilityBusy(true);
    try {
      if (isLiveDriver) {
        if (isOnline && pushController.current?.supported) {
          try {
            const pushReady = await pushController.current.register();
            if (!pushReady) toast.warning('Push permission is off. Offers can alert you while the app is open, but not in the background.');
          } catch (error) {
            toast.error(`Push setup failed; foreground offers can still arrive: ${error instanceof Error ? error.message : 'Unknown push error.'}`);
          }
        }
        if (!isOnline && request?.offerId) {
          try {
            await respondToDriverOffer(request.offerId, false);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not decline the waiting offer before going offline.');
          }
        }
        await setDriverAvailability(isOnline);
      }
      if (isOnline) setView('dashboard');
      setOnline(isOnline);
      setOnlineSince(isOnline ? Date.now() : null);
      setDemoSearchPending(isOnline && !isLiveDriver);
      if (!isOnline) setRequest(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not go ${isOnline ? 'online' : 'offline'}.`);
    } finally {
      setAvailabilityBusy(false);
    }
  };
  const goOnlineAndGenerateRequest = () => void changeAvailability(true);
  const acceptRequest = async () => {
    if (!request) return;
    const acceptedRequest = request;
    try {
      if (acceptedRequest.offerId) {
        const result = await respondToDriverOffer(acceptedRequest.offerId, true);
        if (result !== 'accepted') {
          setRequest(null);
          toast.error(result === 'occupied'
            ? 'This driver account already has an active ride.'
            : 'This ride offer has expired or was accepted by another driver.');
          return;
        }
      }
      setActive(acceptedRequest);
      setRequest(null);
      setOnline(false);
      setOnlineSince(null);
      setStage(0);
      setRouteInfo(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept this ride offer.');
    }
  };
  const declineRequest = async () => {
    if (!request) return;
    const declinedRequest = request;
    try {
      if (declinedRequest.offerId) {
        const result = await respondToDriverOffer(declinedRequest.offerId, false);
        if (result !== 'declined') toast('This ride offer is no longer available.');
      } else {
        record(declinedRequest, 'Declined');
      }
      setRequest(null);
      toast('Ride offer declined.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not decline this ride offer.');
    }
  };
  const record = (trip: DemoRequest, status: HistoryTrip['status']) => {
    const now = new Date();
    setHistory(h => [{ ...trip, status, date: now.toLocaleString(), dayKey: getLocalDayKey(now) }, ...h]);
  };
  const finish = async (cancelled: boolean) => {
    if (!active) return;
    try {
      if (active.live && !await finishDriverRideRequest(active.id, cancelled)) {
        toast.error('The live ride is no longer active. Refresh your trip status before continuing.');
        return;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the passenger ride status.');
      return;
    }
    record(active, cancelled ? 'Cancelled' : 'Completed');
    setActive(null);
    setRouteInfo(null);
    setStage(0);
    toast.success(cancelled ? 'Trip cancelled. No payment was processed.' : 'Trip complete. No payment or payout was processed.');
  };
  const reset = async () => {
    try {
      if (isLiveDriver) {
        if (active?.live) {
          const finished = await finishDriverRideRequest(active.id, true);
          if (!finished) throw new Error('The active passenger ride could not be cancelled. Stay on this screen and retry.');
        } else {
          if (request?.offerId) await respondToDriverOffer(request.offerId, false);
          if (online) await setDriverAvailability(false);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not safely clear the active ride before restarting.');
      return;
    }
    setRegistered(false);
    setApplicationSubmitted(false);
    setDemoMode(false);
    setProfile(returningProfile);
    setOnline(false);
    setDemoSearchPending(false);
    setOnlineSince(null);
    setRequest(null);
    setActive(null);
    setHistory([]);
    setStage(0);
    setSequence(0);
    setView('dashboard');
    setResetOpen(false);
  };
  const completeRegistration = async (newProfile: DriverProfile, documents: DriverDocuments) => {
    await saveDemoDriverProfile(newProfile, documents);
    setProfile(newProfile);
    setRegistrationProfile(newProfile);
    setRegistrationNeedsDocuments(false);
    setRegistered(false);
    setApplicationSubmitted(true);
  };
  const discoverDemoMode = () => {
    setApplicationSubmitted(false);
    setDemoMode(true);
    setRegistered(true);
    setView('dashboard');
  };
  const retryDatabase = () => {
    setDatabaseError('');
    setDatabaseLoading(true);
    setDatabaseRevision(revision => revision + 1);
  };
  const signOut = async () => {
    try {
      if (isLiveDriver) {
        if (active?.live) {
          const finished = await finishDriverRideRequest(active.id, true);
          if (!finished) throw new Error('The active passenger ride could not be cancelled. Stay signed in and retry.');
        } else {
          if (request?.offerId) await respondToDriverOffer(request.offerId, false);
          if (online) await setDriverAvailability(false);
        }
      }
      await signOutDriver();
      setRegistered(false);
      setPhoneLoginOpen(true);
      setRegistrationProfile(undefined);
      setPhoneAccountVerified(false);
      setRegistrationNeedsDocuments(false);
      setApplicationSubmitted(false);
      setProfile(returningProfile);
      setDemoMode(false);
      setOnline(false);
      setDemoSearchPending(false);
      setOnlineSince(null);
      setRequest(null);
      setActive(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sign out of the driver account.');
    }
  };
  const phoneAuthenticationComplete = () => {
    setPhoneLoginOpen(false);
    retryDatabase();
  };
  const immersiveTrip = view === 'dashboard' && (online || !!active || !!request);
  const searchingForPassenger = online && !request && !active;
  useEffect(() => {
    if (immersiveTrip && mainRef.current) mainRef.current.scrollTop = 0;
  }, [immersiveTrip]);
  const navigationDestination = active
    ? stage === 0 ? active.pickup : stage === 2 ? active.destination : ''
    : request?.destination || '';
  const navigationStage = active && (stage === 0 || stage === 2) ? stage : null;
  const navItems = [{ key: 'dashboard' as const, label: 'Drive', icon: LayoutDashboard }, { key: 'earnings' as const, label: 'Earnings', icon: Wallet }, { key: 'history' as const, label: 'Trip history', icon: Clock3 }];
  const renderNavItems = () => navItems.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setView(key)} aria-current={view === key ? 'page' : undefined} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-3 text-[10px] font-semibold transition-colors sm:gap-2 sm:px-4 sm:text-xs ${view === key ? 'bg-[var(--forest)] text-[var(--cream)]' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><Icon size={16} className={`shrink-0 ${view === key ? 'text-[#efac78]' : ''}`}/><span className="whitespace-nowrap">{label}</span>{key === 'history' && history.length > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-white">{history.length}</span>}</button>);
  const onlineSummary = <div className="driver-summary-grid driver-map-summary grid grid-cols-3 gap-3 border-y border-white/20 py-3">
    <div className="min-w-0"><p className="text-[10px] text-[#d0ded5]">Today's earnings</p><p className="mt-1 truncate text-xs font-bold">K{dailyEarnings.toFixed(2)}</p></div>
    <div className="min-w-0"><p className="text-[10px] text-[#d0ded5]">Today's trips</p><p className="mt-1 truncate text-xs font-bold">{String(completedToday.length).padStart(2, '0')}</p></div>
    <div className="min-w-0"><p className="text-[10px] text-[#d0ded5]">Vehicle</p><p className="mt-1 truncate text-xs font-bold">{profile.make} {profile.model}</p></div>
  </div>;
  const waitingPanel = <section className={`driver-map-panel rounded-2xl border p-3 shadow-xl sm:p-4 ${request ? 'driver-map-panel--request' : 'driver-map-panel--waiting'}`}>
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#ffbd8b]"><MapPin size={17}/></span>
        <div className="min-w-0"><p className="text-[9px] font-extrabold tracking-[.16em]">KAYAN DRIVER</p><p className="truncate text-[10px] text-[#d0ded5]">{isLiveDriver ? profile.city : 'Demo location · Lusaka'}</p></div>
      </div>
      <div className="shrink-0 text-right"><p className="text-[10px] font-bold text-[#ffbd8b]"><span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ffbd8b]"/>ONLINE · {isLiveDriver ? 'LIVE' : 'DEMO'}</p><p className="font-mono text-[11px] tabular-nums text-[#d0ded5]">{formatElapsed(onlineSeconds)}</p></div>
    </div>
    {searchingForPassenger && <div role="status" aria-live="polite" className="mb-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inset-0 animate-ping rounded-full bg-[#ffbd8b] motion-reduce:animate-none"/><span className="relative h-2.5 w-2.5 rounded-full bg-[#ffbd8b]"/></span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#ffbd8b]">Searching for passenger</p>
      </div>
      <div className="driver-search-ticker mt-1.5" aria-hidden="true">
        <div className="driver-search-ticker-track">
          {[0, 1].map(copy => <span key={copy} aria-hidden={copy === 1} className="driver-search-ticker-group">{passengerSearchTips.map(tip => <span key={tip}>{tip}</span>)}</span>)}
        </div>
      </div>
      <span className="sr-only">Searching for a passenger. {passengerSearchTips.join(' ')}</span>
    </div>}
    {onlineSummary}
    <DailyEarningsGoal earnings={dailyEarnings} className="py-2"/>
    {request ? <>
      <div className="flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-[#ffbd8b]">{request.live ? 'New passenger offer' : 'New demo request'} · {request.id}</p><p className="mt-0.5 truncate text-sm font-bold">{request.passenger}</p></div>
        <div className="shrink-0 text-right"><p className="text-base font-extrabold text-[#ffbd8b]">K{request.fare}</p><p className="text-[10px] text-[#d0ded5]">{request.distance}{request.live ? '' : ' · illustrative'}</p></div>
      </div>
      <div className="my-2 grid grid-cols-2 gap-3 border-b border-white/20 py-2">
        {[request.pickup, request.destination].map((place, index) => <div key={place} className="min-w-0"><p className="text-[10px] text-[#d0ded5]">{index === 0 ? 'Pickup' : 'Drop-off'}</p><p className="mt-1 truncate text-xs font-semibold">{place}</p></div>)}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="driver-decline-action h-10 px-3 text-[10px]" onClick={() => void declineRequest()}>Decline</Button>
        <Button variant="ghost" disabled={availabilityBusy} className="h-10 px-3 text-[10px] text-[#d0ded5] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => void changeAvailability(false)}>Go offline</Button>
        <span className="driver-request-accept-wrap relative min-w-0 flex-1">
          <span aria-hidden="true" className="driver-request-pulse pointer-events-none absolute inset-0 z-20 rounded-xl"/>
          <Button className="kayan-action relative z-10 h-10 w-full px-3 text-[11px]" onClick={() => void acceptRequest()}><CheckCircle2 size={15} className="mr-1.5"/>Accept offer</Button>
        </span>
      </div>
    </> : <div className="flex items-center justify-between gap-3 pt-2">
      <p className="text-xs text-[#d0ded5]">{isLiveDriver ? 'Waiting for passenger offers.' : demoSearchPending ? 'Looking for a fictional passenger…' : 'Waiting for the next demo request.'}</p>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" disabled={availabilityBusy} className="h-9 px-2 text-[9px] text-[#b8cbbd] hover:bg-white/10 hover:text-[var(--cream)]" onClick={() => void changeAvailability(false)}>Go offline</Button>
        {!isLiveDriver && !demoSearchPending && <Button className="kayan-action h-9 px-3 text-[10px]" onClick={generateRequest}>Generate request</Button>}
      </div>
    </div>}
  </section>;
  return <div className={`driver-app-shell min-h-[100svh] overflow-x-clip ${immersiveTrip ? 'driver-app-shell--immersive' : ''}`}>
      <header className="driver-app-header relative flex min-h-16 flex-nowrap items-center justify-between gap-2 border-b bg-card px-3 py-3 sm:min-h-20 sm:px-8 sm:py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Open driver profile menu" className="driver-profile-trigger h-10 w-10 shrink-0 rounded-xl"><Menu size={21}/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="w-64 rounded-2xl p-2">
            <DropdownMenuLabel className="px-3 py-2">
              <span className="block truncate text-sm font-bold">{registered ? profile.name : 'Driver profile'}</span>
              <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{registered ? `${profile.city} · ${profile.make} ${profile.model}` : 'Complete the demo introduction to view your profile'}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator/>
            <DropdownMenuItem disabled={!registered} onSelect={() => setResetOpen(true)} className="rounded-xl px-3 py-2.5"><RotateCcw size={15} className="mr-2"/>Restart pre-registration</DropdownMenuItem>
            {phoneAccountVerified && <DropdownMenuItem disabled={!registered} onSelect={() => void signOut()} className="rounded-xl px-3 py-2.5"><LogOut size={15} className="mr-2"/>Sign out</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="driver-header-title absolute left-1/2 -translate-x-1/2 text-center">
          <p className="display-font whitespace-nowrap text-sm font-extrabold tracking-[.02em] sm:text-lg sm:tracking-[.12em]">KAYAN <span className="text-primary">DRIVER</span></p>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{registered ? profile.city : 'Driver demo'}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3"><span className="driver-demo-badge hidden rounded-full border border-primary/30 bg-accent px-3 py-1.5 text-[9px] font-bold tracking-widest sm:inline-flex">DEMO ONLY</span><ThemeSelect/></div>
      </header>
      {registered && <nav aria-label="Driver navigation" className="driver-section-nav sticky top-0 z-40 grid-cols-3 gap-2 border-b bg-card/95 px-4 py-2 shadow-sm backdrop-blur">{renderNavItems()}</nav>}
      {registered && <nav aria-label="Driver navigation" className="driver-mobile-nav fixed inset-x-0 bottom-0 z-[600] grid grid-cols-3 gap-1 border-t bg-card/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur">{renderNavItems()}</nav>}
      <main ref={mainRef} className={`driver-app-main w-full ${immersiveTrip ? 'p-0' : 'p-3 pb-24 sm:p-6 lg:p-8'}`}>
        {applicationSubmitted ? <section className="mx-auto flex min-h-[65svh] w-full max-w-xl flex-col items-center justify-center rounded-3xl border bg-card p-6 text-center shadow-sm sm:p-10">
          <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary"><CheckCircle2 size={34}/></span>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">APPLICATION RECEIVED</p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">Thank you, {profile.name}.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">We’ve received your application and documents. The KAYAN team will get back to you using the phone number you provided.</p>
          <div className="mt-7 w-full max-w-sm rounded-2xl bg-secondary/70 p-4">
            <p className="text-sm font-bold">While you wait, explore the driver demo.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Try sample trips and see the driver experience. Demo activity is simulated and does not affect your application.</p>
            <Button className="kayan-action mt-4 w-full" onClick={discoverDemoMode}>Discover Demo Mode <ArrowRight size={17} className="ml-2"/></Button>
          </div>
          <p className="mt-5 max-w-md text-[11px] leading-5 text-muted-foreground">Phone verification is temporarily disabled. This application is saved to this app session and cannot be recovered if app data is cleared or the app is reinstalled.</p>
        </section> : immersiveTrip ? <div className="driver-map-stage relative"><GoogleKayanMap demoLocation={!isLiveDriver} hasRoute={navigationStage !== null} destination={navigationDestination} stage={navigationStage} immersive onRouteInfo={setRouteInfo}/><div className="driver-map-overlay absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-2xl">{active ? <DriverTrip key={active.id} request={active} stage={stage} onStage={setStage} onFinish={finish} compact onlineDuration={formatElapsed(onlineSeconds)} routeEstimate={routeEstimate} dailyEarnings={dailyEarnings}/> : waitingPanel}</div></div> : <>
        {registered && view === 'dashboard' && <div className="-mx-3 mb-6 sm:-mx-6"><GoogleKayanMap integrated demoLocation={!isLiveDriver} online={online} availabilityBusy={availabilityBusy} liveDriver={isLiveDriver} onAvailabilityChange={changeAvailability} hasRoute={!!active || !!request} destination={(active || request)?.destination || ''} stage={active ? stage : null} onRouteInfo={setRouteInfo}/></div>}
        <div className={`driver-section-disclaimer mb-6 flex items-start gap-3 rounded-2xl border bg-secondary/60 px-4 py-3 ${registered && view !== 'dashboard' ? 'driver-section-disclaimer--compact' : ''}`}><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary"/><p className="text-[11px] leading-5 text-muted-foreground"><strong className="text-foreground">Interactive demo, not an operating service.</strong> {registered && view !== 'dashboard' ? 'No live dispatch or payments. Application documents are held in private test storage; the demo does not process approvals.' : 'No live dispatch or payments. Application files go to private test storage; the demo does not process approvals. Do not submit genuine identity documents.'}</p></div>
        {!registered ? databaseLoading
          ? <section role="status" className="mx-auto max-w-xl rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Checking the saved demo profile…</section>
          : databaseError
            ? <section className="mx-auto max-w-xl rounded-2xl border bg-card p-6">
              <h1 className="text-xl font-bold">Could not load the saved demo profile</h1>
              <p role="alert" className="mt-3 text-sm leading-6 text-destructive">{databaseError}</p>
              <Button className="kayan-action mt-5" onClick={retryDatabase}>Try again</Button>
            </section>
            : !databaseConfigured
              ? <DriverDatabaseUnavailable/>
              : phoneLoginOpen
                ? <DriverPhoneLogin onAuthenticated={phoneAuthenticationComplete} onCancel={() => setPhoneLoginOpen(false)}/>
                : <DriverRegistration key={registrationNeedsDocuments ? 'documents-needed' : 'new-registration'} initialProfile={registrationProfile} startAtDocuments={registrationNeedsDocuments} onComplete={completeRegistration} onSignIn={() => setPhoneLoginOpen(true)}/>
          : view === 'dashboard' ? <>
          <div className="driver-summary-grid mb-6 grid gap-3 sm:grid-cols-3">{[{ label: 'Simulated earnings', value: `K${earnings.toFixed(2)}`, note: 'Illustrative gross fares · not payable', icon: Wallet }, { label: 'Completed demo trips', value: String(completed.length).padStart(2, '0'), note: 'This session only', icon: CheckCircle2 }, { label: 'Your demo vehicle', value: `${profile.make} ${profile.model}`, note: `${profile.color} · ${profile.plate}`, icon: CarFront }].map(({ label, value, note, icon: Icon }) => <section key={label} className="flex items-center gap-4 rounded-2xl border bg-card p-5"><span className="rounded-2xl bg-secondary p-3 text-primary"><Icon size={22}/></span><div className="min-w-0"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-extrabold">{value}</p><p className="mt-1 break-words text-[10px] text-muted-foreground">{note}</p></div></section>)}</div>
          <div>
            {active ? <DriverTrip key={active.id} request={active} stage={stage} onStage={setStage} onFinish={finish} routeEstimate={routeEstimate} dailyEarnings={dailyEarnings}/> : request ? <section className="enter rounded-3xl border border-primary/40 bg-card p-6">
              <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-widest text-primary">{request.live ? 'Passenger ride offer' : 'Simulated ride request'}</p><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">{request.id}</span></div>
              <h2 className="mt-4 text-2xl font-extrabold">A new journey awaits.</h2>
              <p className="mt-2 text-xs text-muted-foreground">{request.live ? 'Sent by a passenger through KAYAN.' : 'Generated locally · no live passenger or timeout'}</p>
              <div className="my-6 rounded-2xl bg-secondary p-5">
                <p className="text-sm font-bold">{request.passenger}</p>
                <p className="mt-2 text-xs text-muted-foreground">{request.distance}{request.live ? '' : ' · illustrative'}</p>
                <div className="mt-5 space-y-4">{[request.pickup, request.destination].map((place, i) => <div key={i} className="flex gap-3"><MapPin size={17} className="mt-0.5 shrink-0 text-primary"/><div><p className="text-[10px] text-muted-foreground">{i === 0 ? 'Pickup' : 'Destination'}</p><p className="mt-1 text-xs font-semibold">{place}</p></div></div>)}</div>
              </div>
              <div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] text-muted-foreground">{request.live ? 'Offer fare' : 'Illustrative fare'}</p><p className="text-3xl font-extrabold">K{request.fare}</p></div><p className="text-[10px] text-muted-foreground">{request.live ? 'No payment is processed' : 'Not a real quote or payout'}</p></div>
              <Button className="kayan-action w-full" onClick={() => void acceptRequest()}><CheckCircle2 size={17} className="mr-2"/>Accept offer</Button>
              <Button variant="outline" className="mt-3 h-12 w-full rounded-xl" onClick={() => void declineRequest()}><X size={17} className="mr-2"/>Decline offer</Button>
            </section> : <section className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border bg-card p-8 text-center">
              <span className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-secondary text-primary"><CarFront size={48} strokeWidth={1.4}/></span>
              <h2 className="text-2xl font-extrabold">{online ? 'You’re in the driver’s seat.' : 'Take a moment. Then drive.'}</h2>
              <p className="mb-6 mt-3 text-sm leading-6 text-muted-foreground">{online ? isLiveDriver ? 'Waiting for passenger requests. Offers are delivered to this app and, when configured, as push notifications.' : 'Generate another fictional request to explore a new trip. Nothing is dispatched automatically.' : isLiveDriver ? 'Go online to receive ride offers from passengers.' : 'Go online to reveal a fictional ride request. Your device GPS is separate from demo dispatch.'}</p>
              <Button className="kayan-action" onClick={goOnlineAndGenerateRequest}>{online ? isLiveDriver ? 'Online · waiting for offers' : 'Generate demo request' : isLiveDriver ? 'Go online' : 'Go online · demo'}<ArrowRight size={17} className="ml-2"/></Button>
            </section>}
            <div className="mt-4 rounded-2xl border bg-card p-4 text-xs leading-6 text-muted-foreground"><strong className="text-foreground">{active ? 'Finish or cancel the current trip.' : online ? 'Your availability is active.' : 'Your availability is off.'}</strong><br/>Switching offline removes any waiting offer.</div>
          </div>
        </> : <>
          <div className="driver-secondary-page">
          <div className="driver-section-intro mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">YOUR ROAD. YOUR OPPORTUNITY.</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight">{view === 'earnings' ? 'Your demo earnings, at a glance.' : 'Every demo journey, in one place.'}</h1><p className="mt-1 text-xs text-muted-foreground">Session-only totals; data clears on reload.</p></div></div>
          <section className="driver-section-content rounded-3xl border bg-card p-4 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{view === 'earnings' ? 'Earnings breakdown' : 'Session trip history'}</h2><span className="rounded-full bg-secondary px-3 py-1 text-[10px]">No real transactions</span></div>{view === 'earnings' && <div className="driver-earnings-breakdown my-3 grid grid-cols-1 gap-2"><div className="rounded-2xl bg-secondary p-3"><p className="text-xs text-muted-foreground">Gross simulated fares</p><p className="mt-1 text-2xl font-extrabold">K{earnings.toFixed(2)}</p><p className="mt-1 text-[11px] text-muted-foreground">Completed trips only. No fees or net earnings inferred.</p></div><div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">Actual payable balance</p><p className="mt-1 text-2xl font-extrabold">K0.00</p><p className="mt-1 text-[11px] text-muted-foreground">No payments, wallet, or withdrawals connected.</p></div></div>}{(view === 'earnings' ? completed : history).length === 0 ? <div className="py-6 text-center"><img src="/assets/ride-empty.png" alt="Illustrated taxi" className="mx-auto h-20 w-20 rounded-3xl"/><h3 className="mt-2 text-lg font-bold">{view === 'earnings' ? 'Your demo earnings start with a trip.' : 'A fresh start for every journey.'}</h3><p className="mb-3 mt-1 text-xs text-muted-foreground">Try a fictional ride from the Drive dashboard.</p><Button className="kayan-action" onClick={() => setView('dashboard')}>Back to Drive <ArrowRight size={16} className="ml-2"/></Button></div> : <div className="driver-trip-list mt-3 space-y-2">{(view === 'earnings' ? completed : history).map(trip => <article key={trip.id} className="driver-trip-card flex flex-wrap items-center gap-4 rounded-2xl border p-3"><span className="driver-trip-icon rounded-xl bg-secondary p-2"><CarFront size={20}/></span><div className="driver-trip-details min-w-0 flex-1"><p className="text-sm font-bold">{trip.destination}</p><p className="mt-1 text-[10px] text-muted-foreground">{trip.id} · {trip.date}</p><p className="mt-1 text-[10px] text-muted-foreground">From {trip.pickup}</p></div><div className="driver-trip-status text-right"><p className="text-sm font-bold">K{trip.status === 'Completed' ? trip.fare.toFixed(2) : '0.00'}</p><p className="mt-1 text-[10px] text-muted-foreground">{trip.status} · Demo only</p></div></article>)}</div>}</section>
          <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted-foreground"><span>KAYAN Driver · Separate interactive demo · Trips clear on reload</span><span>Subscription & rewards: to be confirmed.</span><div className="flex gap-4">{!driverBuild && <Link to="/" className="hover:text-primary">Passenger demo</Link>}<button onClick={() => setResetOpen(true)} className="flex items-center gap-1.5 hover:text-primary"><RotateCcw size={12}/>Restart pre-registration</button></div></footer>
          </div>
        </>}
        </>}
      </main>
    <Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent className="max-w-md rounded-3xl p-7"><DialogHeader><DialogTitle>Restart the driver demo?</DialogTitle><DialogDescription>This clears the demo activity on this screen. It does not delete an application or documents already submitted to KAYAN.</DialogDescription></DialogHeader><Button className="kayan-action" onClick={reset}>Clear demo and start again</Button><Button variant="outline" className="h-11 rounded-xl" onClick={() => setResetOpen(false)}>Keep exploring</Button></DialogContent></Dialog>
  </div>;
}
