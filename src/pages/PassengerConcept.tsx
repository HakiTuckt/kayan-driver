import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, CarFront, Check, ChevronDown, ChevronUp, Clock3, LocateFixed, MapPin, Menu, ShieldCheck, Smartphone, Sparkles, Wallet, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { destinations, type ActiveRide, type Destination } from '@/components/BookingPanel';
import KayanMap, { type MapPoint, type PassengerRouteInfo } from '@/components/KayanMap';
import PassengerSaved from '@/components/PassengerSaved';
import { Button } from '@/components/ui/button';
import useDeviceLocation from '@/hooks/useDeviceLocation';
import { loadGoogleMapsApi } from '@/lib/google-maps';
import { checkMtnMomoPayment, requestMtnMomoPayment, type MtnMomoPaymentResult } from '@/lib/mtn-momo';
import { paymentOptions, type SavedPlace } from '@/lib/passenger-preferences';
import {
  cancelPassengerRideRequest,
  createPassengerRideRequest,
  expirePassengerRideRequest,
  liveDispatchEnabled,
  loadActivePassengerRideRequest,
  loadPassengerDriverLocation,
  loadPassengerRideActivity,
  loadPassengerRideStatus,
  submitPassengerRideRating,
  subscribeToPassengerDriverLocation,
  subscribeToPassengerRide,
  type DriverRideStage,
  type PassengerDriverLocation,
  type PassengerRideActivity,
  type RideRequestStatus,
} from '@/lib/ride-dispatch';

type RideClass = 'KAYAN Classic' | 'KAYAN Comfort';
type View = 'book' | 'activity' | 'locations' | 'payments';

const rideClasses: { name: RideClass; description: string; extra: number }[] = [
  { name: 'KAYAN Classic', description: 'Your comfortable everyday ride', extra: 0 },
  { name: 'KAYAN Comfort', description: 'More room for the journey', extra: 30 },
];
const passengerPreferencesKey = 'kayan-passenger-preferences-v1';
const passengerPickupOverrideKey = 'kayan-passenger-pickup-override-v1';
const mtnPaymentPollInterval = 5000;
const mtnPaymentPollLimit = 12;
const driverStageLabels = [
  'Driver heading to pickup',
  'Driver arrived at pickup',
  'Trip in progress',
  'Driver reached drop-off',
];
const rideStatusLabels: Record<RideRequestStatus, string> = {
  searching: 'Finding a driver',
  accepted: 'Driver assigned',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_drivers: 'No driver found',
};

function getStageNotice(stage: DriverRideStage) {
  return [
    '',
    'Your driver has arrived at the pickup point.',
    'Your trip has started.',
    'Your driver has reached the drop-off point.',
  ][stage];
}

function getActivityStatus(ride: PassengerRideActivity) {
  return ride.status === 'accepted'
    ? driverStageLabels[ride.driver_stage]
    : rideStatusLabels[ride.status];
}

function devicePickupCoordinates(position: { latitude: number; longitude: number }) {
  return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
}

type PassengerPreferences = {
  places: SavedPlace[];
  methods: string[];
  defaultMethod: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSavedPlace(value: unknown): value is SavedPlace {
  if (!isRecord(value)) return false;
  return typeof value.label === 'string'
    && value.label.trim().length > 0
    && typeof value.address === 'string'
    && value.address.trim().length > 0
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180;
}

function isPassengerPreferences(value: unknown): value is PassengerPreferences {
  if (!isRecord(value)) return false;
  return Array.isArray(value.places)
    && value.places.every(isSavedPlace)
    && Array.isArray(value.methods)
    && value.methods.every(method => typeof method === 'string' && paymentOptions.includes(method))
    && typeof value.defaultMethod === 'string'
    && paymentOptions.includes(value.defaultMethod);
}

export default function PassengerConcept() {
  const [view, setView] = useState<View>('book');
  const [bookingSheetExpanded, setBookingSheetExpanded] = useState(false);
  const [pickup, setPickup] = useState('');
  const [pickupLookupFallback, setPickupLookupFallback] = useState(false);
  const [pickupLookupLoading, setPickupLookupLoading] = useState(false);
  const [pickupLookupAttempt, setPickupLookupAttempt] = useState(0);
  const [destination, setDestination] = useState<Destination>(destinations[0]);
  const [rideClass, setRideClass] = useState<RideClass>('KAYAN Classic');
  const [payment, setPayment] = useState('Cash');
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [savedMethods, setSavedMethods] = useState<string[]>([]);
  const [defaultPayment, setDefaultPayment] = useState('Cash');
  const [selectedAddressPoint, setSelectedAddressPoint] = useState<MapPoint | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [dispatchRideId, setDispatchRideId] = useState<string | null>(null);
  const [dispatchCreatedAt, setDispatchCreatedAt] = useState<string | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<RideRequestStatus | null>(null);
  const [driverStage, setDriverStage] = useState<DriverRideStage>(0);
  const [driverLocation, setDriverLocation] = useState<PassengerDriverLocation | null>(null);
  const [routeInfo, setRouteInfo] = useState<PassengerRouteInfo | null>(null);
  const [notification, setNotification] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [cancellingRide, setCancellingRide] = useState(false);
  const [restoringRide, setRestoringRide] = useState(liveDispatchEnabled);
  const [activity, setActivity] = useState<PassengerRideActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(liveDispatchEnabled);
  const [activityError, setActivityError] = useState('');
  const [mtnNumbers, setMtnNumbers] = useState<Record<string, string>>({});
  const [mtnPayments, setMtnPayments] = useState<Record<string, { status: MtnMomoPaymentResult['status']; message: string }>>({});
  const [mtnPaymentBusyRide, setMtnPaymentBusyRide] = useState<string | null>(null);
  const [liveRideRating, setLiveRideRating] = useState(0);
  const [savingRating, setSavingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const driverStageRef = useRef<DriverRideStage>(0);
  const dispatchStatusRef = useRef<RideRequestStatus | null>(null);
  const pickupOverriddenByUser = useRef(false);
  const devicePickupResolved = useRef(false);
  const deviceLocation = useDeviceLocation({ autoStart: true });

  useEffect(() => {
    try {
      const pickupOverride = window.localStorage.getItem(passengerPickupOverrideKey);
      if (pickupOverride?.trim()) {
        pickupOverriddenByUser.current = true;
        setPickup(pickupOverride.trim().slice(0, 120));
      }
      const stored = window.localStorage.getItem(passengerPreferencesKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (!isPassengerPreferences(parsed)) throw new Error('Saved Passenger preferences have an unsupported format.');
        setSavedPlaces(parsed.places);
        setSavedMethods(parsed.methods);
        setDefaultPayment(parsed.defaultMethod);
        setPayment(parsed.defaultMethod);
      }
    } catch (error) {
      console.error('Could not load saved Passenger preferences:', error);
      toast.error('Saved addresses and payment preferences could not be loaded.');
    } finally {
      setPreferencesReady(true);
    }
  }, []);

  useEffect(() => {
    const position = deviceLocation.position;
    if (!position || pickupOverriddenByUser.current || devicePickupResolved.current) return;
    devicePickupResolved.current = true;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      setPickup(devicePickupCoordinates(position.coords));
      setPickupLookupFallback(true);
      return;
    }

    setPickupLookupLoading(true);
    void (async () => {
      try {
        await loadGoogleMapsApi(apiKey);
        const { results } = await new google.maps.Geocoder().geocode({
          location: { lat: position.coords.latitude, lng: position.coords.longitude },
        });
        const address = results[0]?.formatted_address;
        if (!address) throw new Error('Google Maps could not find a street address for your device location.');
        if (!pickupOverriddenByUser.current) {
          setPickup(address.slice(0, 120));
          setPickupLookupFallback(false);
        }
      } catch (error) {
        console.warn('Could not reverse geocode the Passenger device location; using its coordinates.', error);
        if (!pickupOverriddenByUser.current) {
          setPickup(devicePickupCoordinates(position.coords));
          setPickupLookupFallback(true);
        }
      } finally {
        setPickupLookupLoading(false);
      }
    })();
  }, [deviceLocation.position, pickupLookupAttempt]);

  const ride = rideClasses.find(item => item.name === rideClass) ?? rideClasses[0];
  const fare = destination.price + ride.extra;

  const refreshActivity = useCallback(async () => {
    if (!liveDispatchEnabled) {
      setActivity([]);
      setActivityLoading(false);
      return;
    }
    setActivityLoading(true);
    setActivityError('');
    try {
      setActivity(await loadPassengerRideActivity());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load passenger activity.';
      setActivityError(message);
      toast.error(message);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const navigateTo = (nextView: View) => {
    setView(nextView);
    setMobileMenuOpen(false);
    if (nextView === 'book') setBookingSheetExpanded(true);
    if (nextView === 'activity') void refreshActivity();
  };

  useEffect(() => {
    if (view === 'book' && (dispatchStatus === 'searching' || dispatchStatus === 'accepted')) {
      setBookingSheetExpanded(true);
    }
  }, [dispatchStatus, view]);

  const updateDestination = (name: string) => {
    const selected = destinations.find(item => item.name === name);
    if (!selected) return;
    setDestination(selected);
    setRouteInfo(null);
  };

  const persistPreferences = (places: SavedPlace[], methods: string[], defaultMethod: string) => {
    if (!preferencesReady) {
      toast.error('Passenger preferences are still loading. Please try again.');
      return false;
    }
    try {
      window.localStorage.setItem(passengerPreferencesKey, JSON.stringify({ places, methods, defaultMethod }));
      setSavedPlaces(places);
      setSavedMethods(methods);
      setDefaultPayment(defaultMethod);
      return true;
    } catch (error) {
      console.error('Could not save Passenger preferences:', error);
      toast.error('Could not save your Passenger preferences on this device.');
      return false;
    }
  };

  const updateSavedPlaces = (places: SavedPlace[]) => {
    const saved = persistPreferences(places, savedMethods, defaultPayment);
    if (saved) toast.success('Saved addresses updated on this device.');
    return saved;
  };

  const addSavedMethod = (method: string) => {
    if (!paymentOptions.includes(method) || savedMethods.includes(method)) return false;
    const saved = persistPreferences(savedPlaces, [...savedMethods, method], defaultPayment);
    if (saved) toast.success(`${method} saved on this device.`);
    return saved;
  };

  const removeSavedMethod = (method: string) => {
    const methods = savedMethods.filter(item => item !== method);
    const nextDefault = defaultPayment === method ? methods[0] ?? 'Cash' : defaultPayment;
    const saved = persistPreferences(savedPlaces, methods, nextDefault);
    if (saved && defaultPayment !== nextDefault) setPayment(nextDefault);
    if (saved) toast.success(`${method} removed from saved payment methods.`);
    return saved;
  };

  const chooseDefaultMethod = (method: string) => {
    if (!savedMethods.includes(method)) return false;
    const saved = persistPreferences(savedPlaces, savedMethods, method);
    if (saved) {
      setPayment(method);
      toast.success(`${method} set as the default booking preference.`);
    }
    return saved;
  };

  const handleMapPointSelected = useCallback((point: MapPoint) => {
    setSelectedAddressPoint(point);
  }, []);

  const setUserPickup = (address: string) => {
    pickupOverriddenByUser.current = true;
    devicePickupResolved.current = true;
    setPickup(address);
    setPickupLookupFallback(false);
  };

  const persistUserPickup = (address: string) => {
    try {
      if (address.trim()) window.localStorage.setItem(passengerPickupOverrideKey, address.trim().slice(0, 120));
      else window.localStorage.removeItem(passengerPickupOverrideKey);
    } catch (error) {
      console.error('Could not save the Passenger pickup override:', error);
      toast.error('Your pickup was set, but could not be saved on this device.');
    }
  };

  const useDevicePickup = () => {
    if (activeRide) return;
    try {
      window.localStorage.removeItem(passengerPickupOverrideKey);
    } catch (error) {
      console.error('Could not clear the saved Passenger pickup override:', error);
      toast.error('Could not switch to your device location. Please try again.');
      return;
    }
    pickupOverriddenByUser.current = false;
    devicePickupResolved.current = false;
    setPickup('');
    setPickupLookupFallback(false);
    setPickupLookupAttempt(attempt => attempt + 1);
    if (!deviceLocation.position) deviceLocation.start();
  };

  const useSavedPlace = (place: SavedPlace) => {
    if (activeRide) {
      toast.error('Finish or cancel your current ride before changing its pickup address.');
      return;
    }
    setUserPickup(place.address);
    persistUserPickup(place.address);
    navigateTo('book');
    toast.success(`${place.label} set as the pickup address.`);
  };

  const payCompletedRideWithMtn = async (ride: PassengerRideActivity) => {
    if (mtnPaymentBusyRide) return;
    setMtnPaymentBusyRide(ride.id);
    setMtnPayments(current => ({
      ...current,
      [ride.id]: { status: 'pending', message: 'Checking the MTN MoMo payment…' },
    }));
    try {
      const previousStatus = mtnPayments[ride.id]?.status;
      let result = previousStatus === 'pending'
        ? await checkMtnMomoPayment(ride.id)
        : await requestMtnMomoPayment(ride.id, mtnNumbers[ride.id] ?? '', previousStatus === 'failed');
      if (result.status === 'not_started') {
        result = await requestMtnMomoPayment(ride.id, mtnNumbers[ride.id] ?? '');
      }
      for (let attempt = 0; result.status === 'pending' && attempt < mtnPaymentPollLimit; attempt += 1) {
        setMtnPayments(current => ({
          ...current,
          [ride.id]: { status: 'pending', message: 'Approve the payment prompt on your MTN MoMo phone.' },
        }));
        await new Promise(resolve => window.setTimeout(resolve, mtnPaymentPollInterval));
        result = await checkMtnMomoPayment(ride.id);
      }

      const message = result.status === 'successful'
        ? 'MTN MoMo payment confirmed.'
        : result.status === 'failed'
          ? result.reason ?? 'MTN MoMo did not complete this payment. You can try again.'
          : 'Payment is still pending. Check its status before trying again.';
      setMtnPayments(current => ({
        ...current,
        [ride.id]: { status: result.status, message },
      }));
      if (result.status === 'successful') {
        toast.success(message);
        void refreshActivity();
      } else if (result.status === 'failed') {
        toast.error(message);
      } else {
        toast.info(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not confirm the MTN MoMo payment status.';
      setMtnPayments(current => ({
        ...current,
        [ride.id]: { status: 'pending', message: `${message} Check the payment status before retrying.` },
      }));
      toast.error(message);
    } finally {
      setMtnPaymentBusyRide(null);
    }
  };

  useEffect(() => {
    driverStageRef.current = driverStage;
  }, [driverStage]);

  useEffect(() => {
    dispatchStatusRef.current = dispatchStatus;
  }, [dispatchStatus]);

  useEffect(() => {
    if (!liveDispatchEnabled) {
      setRestoringRide(false);
      setActivityLoading(false);
      return;
    }
    let cancelled = false;
    void loadActivePassengerRideRequest().then(savedRide => {
      if (cancelled || !savedRide) return;
      const savedDestination = destinations.find(item => item.name === savedRide.destination);
      if (!savedDestination) {
        toast.error('Your saved ride uses a destination not supported by this app.');
        return;
      }
      setActiveRide({
        id: savedRide.id,
        destination: savedDestination,
        pickup: savedRide.pickup,
        category: savedRide.category,
        price: savedRide.fare_zmw,
        payment: 'Cash',
      });
      setDispatchRideId(savedRide.id);
      setDispatchCreatedAt(savedRide.created_at);
      setDispatchStatus(savedRide.status);
      dispatchStatusRef.current = savedRide.status;
      setDriverStage(savedRide.driver_stage);
      driverStageRef.current = savedRide.driver_stage;
    }).catch(error => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not restore the active passenger ride.');
    }).finally(() => {
      if (!cancelled) setRestoringRide(false);
    });
    void refreshActivity();
    return () => { cancelled = true; };
  }, [refreshActivity]);

  useEffect(() => {
    if (view === 'activity') void refreshActivity();
  }, [refreshActivity, view]);

  useEffect(() => {
    if (!dispatchRideId) return;
    let cancelled = false;
    let receivedRealtimeUpdate = false;
    const unsubscribe = subscribeToPassengerRide(
      dispatchRideId,
      update => {
        receivedRealtimeUpdate = true;
        const previousStatus = dispatchStatusRef.current;
        const previousStage = driverStageRef.current;
        dispatchStatusRef.current = update.status;
        driverStageRef.current = update.driver_stage;
        setDispatchStatus(update.status);
        setDriverStage(update.driver_stage);

        if (update.status === 'accepted' && previousStatus !== 'accepted') {
          toast.success('A driver accepted your ride request.');
        }
        if (update.status === 'accepted' && update.driver_stage > previousStage) {
          const message = getStageNotice(update.driver_stage);
          setNotification(message);
          toast.info(message);
        }
        void refreshActivity();
      },
      message => toast.error(message),
    );
    void loadPassengerRideStatus(dispatchRideId).then(current => {
      if (!cancelled && !receivedRealtimeUpdate && current) {
        dispatchStatusRef.current = current.status;
        driverStageRef.current = current.driver_stage;
        setDispatchStatus(current.status);
        setDriverStage(current.driver_stage);
      }
    }).catch(error => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not check the ride status.');
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dispatchRideId, refreshActivity]);

  useEffect(() => {
    if (!dispatchRideId || dispatchStatus !== 'accepted') {
      setDriverLocation(null);
      return;
    }
    let cancelled = false;
    let receivedRealtimeLocation = false;
    setDriverLocation(null);
    const unsubscribe = subscribeToPassengerDriverLocation(
      dispatchRideId,
      location => {
        receivedRealtimeLocation = true;
        setDriverLocation(location);
      },
      message => toast.error(message),
    );
    void loadPassengerDriverLocation(dispatchRideId).then(location => {
      if (!cancelled && !receivedRealtimeLocation) setDriverLocation(location);
    }).catch(error => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not load the driver location.');
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dispatchRideId, dispatchStatus]);

  useEffect(() => {
    if (!dispatchRideId || dispatchStatus !== 'searching' || !dispatchCreatedAt) return;
    const ageMillis = Date.now() - new Date(dispatchCreatedAt).getTime();
    const timeoutMillis = Math.max(0, 65_000 - ageMillis);
    const timer = window.setTimeout(() => {
      void expirePassengerRideRequest(dispatchRideId).then(expired => {
        if (!expired) return;
        setDispatchStatus('no_drivers');
        dispatchStatusRef.current = 'no_drivers';
        toast.warning('No drivers are available right now.');
        void refreshActivity();
      }).catch(error => toast.error(error instanceof Error ? error.message : 'Could not update the expired ride request.'));
    }, timeoutMillis);
    return () => window.clearTimeout(timer);
  }, [dispatchCreatedAt, dispatchRideId, dispatchStatus, refreshActivity]);

  const requestRide = async () => {
    if (bookingBusy || restoringRide) return;
    if (!liveDispatchEnabled) {
      toast.error('Live ride requests are disabled in this app build. No request was sent.');
      return;
    }
    const newRide: ActiveRide = {
      destination,
      pickup: pickup.trim(),
      category: rideClass,
      price: fare,
      payment,
    };
    if (!newRide.pickup) {
      toast.error('Enter a pickup location before requesting a ride.');
      return;
    }
    setBookingBusy(true);
    setNotification('');
    setRouteInfo(null);
    try {
      const result = await createPassengerRideRequest(newRide);
      setActiveRide(newRide);
      setDispatchRideId(result.request_id);
      setDispatchCreatedAt(result.created_at);
      setDispatchStatus(result.status);
      dispatchStatusRef.current = result.status;
      setDriverStage(0);
      driverStageRef.current = 0;
      setLiveRideRating(0);
      setRatingSubmitted(false);
      setView('book');
      if (result.status === 'no_drivers') toast.warning('No approved drivers are online right now.');
      else toast.success('Your ride request was sent to online drivers.');
      if (result.push_warning) toast.warning(result.push_warning);
      await refreshActivity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the ride request.');
    } finally {
      setBookingBusy(false);
    }
  };

  const cancelRideRequest = async () => {
    if (!dispatchRideId || dispatchStatus !== 'searching' || cancellingRide) return;
    setCancellingRide(true);
    try {
      const cancelled = await cancelPassengerRideRequest(dispatchRideId);
      if (cancelled) {
        setDispatchStatus('cancelled');
        dispatchStatusRef.current = 'cancelled';
        toast.success('Ride request cancelled.');
        await refreshActivity();
      } else {
        const current = await loadPassengerRideStatus(dispatchRideId);
        if (current) {
          setDispatchStatus(current.status);
          dispatchStatusRef.current = current.status;
          setDriverStage(current.driver_stage);
          driverStageRef.current = current.driver_stage;
        }
        toast.error('This ride can no longer be cancelled while searching.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not cancel the ride request.');
    } finally {
      setCancellingRide(false);
    }
  };

  const rateDriver = async () => {
    if (!dispatchRideId || dispatchStatus !== 'completed' || !liveRideRating || savingRating || ratingSubmitted) return;
    setSavingRating(true);
    try {
      const submitted = await submitPassengerRideRating(dispatchRideId, liveRideRating);
      setRatingSubmitted(true);
      toast.success(submitted ? 'Thanks—your driver rating was recorded.' : 'You have already rated this ride.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit your ride rating.');
    } finally {
      setSavingRating(false);
    }
  };

  const clearRide = () => {
    setActiveRide(null);
    setDispatchRideId(null);
    setDispatchCreatedAt(null);
    setDispatchStatus(null);
    setDriverStage(0);
    setDriverLocation(null);
    setNotification('');
    setRouteInfo(null);
    dispatchStatusRef.current = null;
    driverStageRef.current = 0;
    setView('activity');
    void refreshActivity();
  };

  const openActivityRide = (item: PassengerRideActivity) => {
    if (item.status !== 'searching' && item.status !== 'accepted') return;
    const savedDestination = destinations.find(place => place.name === item.destination);
    if (!savedDestination) {
      toast.error('This activity record uses a destination not supported by this app.');
      return;
    }
    const restoredRide: ActiveRide = {
      id: item.id,
      destination: savedDestination,
      pickup: item.pickup,
      category: item.category,
      price: item.fare_zmw,
      payment: 'Cash',
    };
    setActiveRide(restoredRide);
    setDispatchRideId(item.id);
    setDispatchCreatedAt(item.created_at);
    setDispatchStatus(item.status);
    dispatchStatusRef.current = item.status;
    setDriverStage(item.driver_stage);
    driverStageRef.current = item.driver_stage;
    setView('book');
  };

  const routePreview = activeRide && dispatchStatus !== 'completed' && dispatchStatus !== 'cancelled' && dispatchStatus !== 'no_drivers'
    ? {
      pickup: `${activeRide.pickup}, Lusaka, Zambia`,
      destination: `${activeRide.destination.address}, ${activeRide.destination.name}, Lusaka, Zambia`,
    }
    : null;
  const activeDriverLocation = dispatchStatus === 'accepted' && driverLocation?.ride_id === dispatchRideId
    ? driverLocation
    : null;
  const menu = <>
    <p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#698074]">Passenger sections</p>
    <button type="button" onClick={() => navigateTo('book')} aria-current={view === 'book' ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${view === 'book' ? 'bg-[#174536] text-white' : 'hover:bg-white'}`}><CarFront size={17}/>{activeRide ? 'Your current ride' : 'Book a ride'}</button>
    <button type="button" onClick={() => navigateTo('activity')} aria-current={view === 'activity' ? 'page' : undefined} className={`flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold ${view === 'activity' ? 'bg-[#174536] text-white' : 'hover:bg-white'}`}><span className="flex items-center gap-3"><Clock3 size={17}/>Your activity</span>{activity.length > 0 && <span className="rounded-full bg-[#e8eee6] px-1.5 py-0.5 text-[9px]">{activity.length}</span>}</button>
    <button type="button" onClick={() => navigateTo('locations')} aria-current={view === 'locations' ? 'page' : undefined} className={`flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold ${view === 'locations' ? 'bg-[#174536] text-white' : 'hover:bg-white'}`}><span className="flex items-center gap-3"><MapPin size={17}/>Saved addresses</span>{savedPlaces.length > 0 && <span className="rounded-full bg-[#e8eee6] px-1.5 py-0.5 text-[9px]">{savedPlaces.length}</span>}</button>
    <button type="button" onClick={() => navigateTo('payments')} aria-current={view === 'payments' ? 'page' : undefined} className={`flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold ${view === 'payments' ? 'bg-[#174536] text-white' : 'hover:bg-white'}`}><span className="flex items-center gap-3"><Wallet size={17}/>Payment methods</span>{savedMethods.length > 0 && <span className="rounded-full bg-[#e8eee6] px-1.5 py-0.5 text-[9px]">{savedMethods.length}</span>}</button>
    <div className="my-2 border-t border-[#dce4dd]"/>
    <p className="mt-auto px-3 pt-5 text-[10px] leading-5 text-[#718077]">Live trip updates appear here while this app is open. Payments are not processed.</p>
  </>;

  return <div className="passenger-concept-root min-h-screen bg-[#f5f4ee] text-left text-[#17372e]">
    <header className="sticky top-0 z-[700] border-b border-[#dce4dd] bg-[#f5f4ee]/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-7">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" aria-label={mobileMenuOpen ? 'Close passenger menu' : 'Open passenger menu'} aria-expanded={mobileMenuOpen} aria-controls="passenger-mobile-menu" onClick={() => setMobileMenuOpen(open => !open)} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#174536] text-xl font-extrabold text-[#fff3df] shadow-sm">
            K
            <span aria-hidden="true" className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#f5f4ee] bg-[#fff3df] text-[#174536]">{mobileMenuOpen ? <X size={11}/> : <Menu size={11}/>}</span>
          </button>
          <Link to="/" className="min-w-0 rounded-xl" aria-label="KAYAN passenger home">
            <span className="display-font block whitespace-nowrap text-sm font-extrabold tracking-[.12em]">KAYAN <span className="text-[#bd6e38]">PASSENGER</span></span>
            <span className="block whitespace-nowrap text-[9px] font-semibold uppercase tracking-[.18em] text-[#698074]">Everyday rides · Lusaka</span>
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden items-center gap-1.5 rounded-full border border-[#d9e3d9] bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#315c49] lg:flex"><MapPin size={13}/> Lusaka, Zambia</span>
        </div>
      </div>
    </header>
    {mobileMenuOpen && <>
      <button type="button" aria-label="Close passenger menu" onClick={() => setMobileMenuOpen(false)} className="fixed inset-x-0 bottom-0 top-16 z-[690] bg-[#17372e]/45"/>
      <nav id="passenger-mobile-menu" aria-label="Passenger menu" className="fixed bottom-0 left-0 top-16 z-[710] flex w-[min(84vw,320px)] flex-col gap-1 border-r border-[#dce4dd] bg-[#f5f4ee] p-4 shadow-2xl">{menu}</nav>
    </>}

    <main className={`mx-auto max-w-[1440px] px-3 pt-4 sm:px-7 sm:pt-10 ${view === 'book' ? 'pb-32' : 'pb-10'}`}>
      <section className={`flex flex-col justify-between gap-5 md:flex-row md:items-end ${view === 'book' ? 'mb-4' : 'mb-7'}`}>
        <div>
          <p className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.2em] text-[#bd6e38]"><Sparkles size={14}/> Your city, made easier</p>
          <h1 className={`display-font max-w-3xl font-extrabold leading-tight tracking-tight ${view === 'book' ? 'text-2xl sm:text-5xl' : 'text-3xl sm:text-5xl'}`}>{view === 'book' ? <>Everyday journeys, <span className="text-[#b76330]">made better.</span></> : view === 'activity' ? <>Your rides, <span className="text-[#b76330]">in one place.</span></> : view === 'locations' ? <>Places you go, <span className="text-[#b76330]">saved.</span></> : <>Payment, <span className="text-[#b76330]">your way.</span></>}</h1>
          <p className={`mt-3 max-w-xl text-sm leading-6 text-[#607168] ${view === 'book' ? 'hidden sm:block' : ''}`}>{view === 'book' ? 'Choose your pickup, find a ride that fits, and follow your journey across Lusaka.' : view === 'activity' ? 'Review live ride requests and updates from your drivers.' : view === 'locations' ? 'Pin and save your most-used pickup addresses on Google Maps.' : 'Save your preferred payment types for future bookings.'}</p>
        </div>
        <div className={`flex items-center gap-3 rounded-2xl border border-[#dce4dd] bg-white px-4 py-3 shadow-sm ${view === 'book' ? 'hidden lg:flex' : ''}`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf3ed] text-[#315c49]"><ShieldCheck size={19}/></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[.12em]">KAYAN promise</p><p className="mt-1 text-xs text-[#607168]">Thoughtful rides, rooted here.</p></div>
        </div>
      </section>

      {view === 'book' ? <>
        <section id="concept-map" className="relative isolate mb-3 h-[min(70svh,640px)] min-h-[420px] overflow-hidden rounded-[28px] border border-[#dce4dd] bg-white shadow-[0_18px_55px_rgba(31,66,50,.08)]">
          <div className="absolute inset-0">
            <KayanMap
              compact
              hasRoute={!!activeRide}
              destination={activeRide?.destination.name ?? destination.name}
              routePreview={routePreview}
              liveRideAccepted={dispatchStatus === 'accepted'}
              driverLocation={activeDriverLocation}
              onRouteInfo={setRouteInfo}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex items-center justify-between gap-3">
            <div className="rounded-xl border border-[#dce4dd] bg-[#f5f4ee]/95 px-3 py-2 shadow-sm backdrop-blur">
              <p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-[#a26b46]">Explore the city</p>
              <p className="display-font mt-0.5 text-sm font-extrabold">Lusaka at a glance</p>
            </div>
            <span className="rounded-full border border-[#dce4dd] bg-[#f5f4ee]/95 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-[#315c49] shadow-sm backdrop-blur">Google Maps</span>
          </div>
        </section>
        <div className="mb-6 flex items-start gap-3 px-1 text-[10px] leading-5 text-[#607168]">
          <MapPin size={15} className="mt-0.5 shrink-0 text-[#bd6e38]"/>
          <p>Device location is used as the pickup by default; edit the address or choose a saved place to change it. Google Maps receives map requests and route addresses. Live driver GPS is shown only during an accepted ride.</p>
        </div>

        <section id="book" style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }} className="fixed left-3 right-3 z-[600] mx-auto max-h-[calc(100svh-5rem)] max-w-3xl overflow-y-auto rounded-[28px] border border-[#dce4dd] bg-[#fbfcf9] shadow-[0_18px_55px_rgba(31,66,50,.22)]">
          <div className="sticky top-0 z-20 border-b border-[#e2e9e2] bg-[#fbfcf9]/95 px-4 py-3 backdrop-blur sm:px-6">
            <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-[#cbd9cf]"/>
            <button type="button" aria-expanded={bookingSheetExpanded} aria-controls="passenger-booking-sheet-content" aria-label={bookingSheetExpanded ? 'Collapse ride planner' : 'Expand ride planner'} onClick={() => setBookingSheetExpanded(expanded => !expanded)} className="flex w-full items-center justify-between gap-3 text-left">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#eaf1e9] text-[#315c49]"><MapPin size={21}/></span>
                <span className="min-w-0">
                  <span className="block text-[9px] font-extrabold uppercase tracking-[.16em] text-[#a26b46]">{activeRide && dispatchRideId ? 'Your ride' : 'Plan a ride'}</span>
                  <span className="mt-0.5 block truncate text-sm font-bold">{activeRide && dispatchRideId ? dispatchStatus ? rideStatusLabels[dispatchStatus] : 'Confirming your request…' : `${pickup} → ${destination.name} · K${fare}`}</span>
                </span>
              </span>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#174536] text-white">{bookingSheetExpanded ? <ChevronDown size={20}/> : <ChevronUp size={20}/>}</span>
            </button>
          </div>
          {bookingSheetExpanded && <div id="passenger-booking-sheet-content" className="space-y-4 px-5 pb-5 pt-4 sm:px-7">
          {activeRide && dispatchRideId ? <div className="flex min-h-[440px] flex-col">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-[#a26b46]">Your ride</p><h2 className="display-font mt-1 text-2xl font-extrabold">{dispatchStatus ? rideStatusLabels[dispatchStatus] : 'Confirming your request…'}</h2></div>
              <span className="rounded-2xl bg-[#f5f4ee] p-3 text-[#315c49]"><CarFront size={19}/></span>
            </div>
            {notification && <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-[#c8ddcc] bg-[#f0f6ef] p-4">
              <Bell size={17} className="mt-0.5 shrink-0 text-[#39805d]"/>
              <p className="text-xs leading-5 text-[#315c49]"><strong>Driver update.</strong> {notification}</p>
            </div>}
            {dispatchStatus === 'accepted' && <ol aria-label="Driver trip progress" className="mb-5 space-y-2 rounded-2xl bg-[#f5f4ee] p-4">
              {driverStageLabels.map((label, index) => <li key={label} className={`flex items-center gap-3 text-xs ${index === driverStage ? 'font-bold text-[#174536]' : index < driverStage ? 'text-[#698074]' : 'text-[#839188]'}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${index <= driverStage ? 'bg-[#174536] text-white' : 'bg-white'}`}>{index < driverStage ? <Check size={14}/> : index + 1}</span>
                {label}
                {index === driverStage && <span className="ml-auto text-[9px] uppercase tracking-wider text-[#bd6e38]">Now</span>}
              </li>)}
            </ol>}
            <div className="my-2 space-y-4 rounded-2xl border border-[#e2e9e2] p-4">
              <div><p className="text-[10px] text-[#718077]">Pickup</p><p className="mt-1 text-sm font-semibold">{activeRide.pickup}</p></div>
              <div><p className="text-[10px] text-[#718077]">Drop-off</p><p className="mt-1 text-sm font-semibold">{activeRide.destination.name}</p></div>
              <div className="flex justify-between border-t border-[#e2e9e2] pt-3 text-xs"><span>{activeRide.category} · {routeInfo ? `${(routeInfo.distanceMeters / 1000).toFixed(1)} km` : `${activeRide.destination.distance} km`}</span><span className="font-bold">K{activeRide.price}</span></div>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-[#718077]">{dispatchStatus === 'searching' ? 'Your request has been sent to available drivers. You can cancel while no driver has accepted.' : dispatchStatus === 'accepted' ? activeDriverLocation ? 'Your driver’s live location is shown on the map.' : 'Your driver accepted. Waiting for the first GPS update.' : dispatchStatus === 'completed' ? 'Your driver marked this ride complete. No payment was processed.' : dispatchStatus === 'cancelled' ? 'This request was cancelled.' : dispatchStatus === 'no_drivers' ? 'No driver accepted this request. Try again later.' : 'Waiting for the ride service.'}</p>
            {dispatchStatus === 'completed' && <div className="mt-5 rounded-xl border border-[#dce4dd] bg-[#fbfcf9] p-4">
              <p className="text-sm font-semibold">Rate your driver</p>
              <p className="mt-1 text-[10px] text-[#718077]">Optional · one rating for this completed ride.</p>
              <div role="group" aria-label="Rate your driver from 1 to 5" className="mt-3 flex gap-2">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-label={`Rate ${value} out of 5`} aria-pressed={liveRideRating === value} disabled={ratingSubmitted} onClick={() => setLiveRideRating(value)} className={`h-10 w-10 rounded-xl border text-sm font-bold ${liveRideRating >= value ? 'border-[#315c49] bg-[#315c49] text-white' : 'bg-white'}`}>{value}</button>)}</div>
              <Button disabled={!liveRideRating || savingRating || ratingSubmitted} className="kayan-action mt-4 w-full bg-[#174536] hover:bg-[#235b46]" onClick={() => void rateDriver()}>{ratingSubmitted ? 'Rating recorded' : savingRating ? 'Saving rating…' : 'Submit rating'}</Button>
            </div>}
            <div className="mt-auto space-y-2 pt-5">
              {dispatchStatus === 'searching' && <Button variant="outline" disabled={cancellingRide} onClick={() => void cancelRideRequest()} className="w-full">{cancellingRide ? 'Cancelling…' : 'Cancel request'}</Button>}
              {dispatchStatus && dispatchStatus !== 'searching' && dispatchStatus !== 'accepted' && <Button onClick={clearRide} className="kayan-action w-full bg-[#174536] hover:bg-[#235b46]">View Activity <ArrowRight size={16} className="ml-2"/></Button>}
            </div>
          </div> : <div>
            <div className="mb-5">
              <label htmlFor="concept-pickup" className="mb-2 block text-[10px] font-bold uppercase tracking-[.1em] text-[#68796e]">Pickup point</label>
              <div className="flex items-center gap-3 rounded-2xl border border-[#dce4dd] bg-[#fbfcf9] px-4 py-3 focus-within:border-[#799986] focus-within:ring-2 focus-within:ring-[#799986]/20">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border-[3px] border-[#39805d]"/>
                <input id="concept-pickup" value={pickup} maxLength={120} onChange={event => setUserPickup(event.target.value)} onBlur={event => persistUserPickup(event.currentTarget.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[#97a49b]" placeholder={deviceLocation.waiting ? 'Getting your device location…' : 'Enter pickup location'}/>
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <p role={deviceLocation.error ? 'alert' : 'status'} className="min-w-0 text-[10px] leading-4 text-[#718077]">
                  {pickupOverriddenByUser.current
                    ? 'Using your chosen pickup address.'
                    : deviceLocation.error
                      ? deviceLocation.error
                      : pickupLookupFallback
                        ? `Using device coordinates. For street addresses, enable Geocoding API, allow it in this web key's API restrictions, and allow ${window.location.origin}/* in website restrictions.`
                      : pickupLookupLoading
                        ? 'Finding the address for your device location…'
                        : deviceLocation.waiting || !pickup
                          ? 'Getting your current device location…'
                          : 'Using your current device location.'}
                </p>
                <button type="button" onClick={useDevicePickup} disabled={!!activeRide} className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#315c49] hover:underline disabled:opacity-50">
                  <LocateFixed size={13}/> Use device location
                </button>
              </div>
            </div>
            <label htmlFor="concept-destination" className="mb-2 block text-[10px] font-bold uppercase tracking-[.1em] text-[#68796e]">Destination</label>
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#dce4dd] bg-[#fbfcf9] px-4 py-3 focus-within:border-[#799986] focus-within:ring-2 focus-within:ring-[#799986]/20">
              <MapPin size={17} className="shrink-0 text-[#bd6e38]"/>
              <select id="concept-destination" value={destination.name} onChange={event => updateDestination(event.target.value)} className="min-w-0 flex-1 appearance-none bg-transparent text-sm font-semibold outline-none">
                {destinations.map(place => <option key={place.name} value={place.name}>{place.name}</option>)}
              </select>
              <ArrowRight size={15} className="shrink-0 rotate-90 text-[#839188]"/>
            </div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-bold uppercase tracking-[.1em] text-[#68796e]">Choose your ride</h3><span className="text-[10px] text-[#839188]">4 seats</span></div>
            <div className="mb-5 grid gap-2 sm:grid-cols-2">
              {rideClasses.map(option => <button key={option.name} type="button" aria-pressed={rideClass === option.name} onClick={() => setRideClass(option.name)} className={`rounded-2xl border p-3.5 text-left transition ${rideClass === option.name ? 'border-[#315c49] bg-[#f1f5ef] ring-1 ring-[#315c49]' : 'border-[#dce4dd] hover:bg-[#fbfcf9]'}`}>
                <span className="flex items-center justify-between"><span className="text-xs font-extrabold">{option.name.replace('KAYAN ', '')}</span>{rideClass === option.name && <Check size={15} className="text-[#315c49]"/>}</span>
                <span className="mt-1 block text-[10px] text-[#718077]">{option.description}</span>
                <span className="mt-3 block text-sm font-extrabold">K{destination.price + option.extra}</span>
              </button>)}
            </div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#68796e]"><Wallet size={14}/> Payment preference</div>
            <div className="mb-5 flex flex-wrap gap-2">{paymentOptions.map(option => <button key={option} type="button" aria-pressed={payment === option} onClick={() => setPayment(option)} className={`rounded-full border px-3 py-2 text-[10px] font-semibold transition ${payment === option ? 'border-[#315c49] bg-[#315c49] text-white' : 'border-[#dce4dd] text-[#607168] hover:bg-[#fbfcf9]'}`}>{option}</button>)}</div>
            <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#f5f4ee] px-4 py-3">
              <div><p className="text-[9px] font-bold uppercase tracking-[.1em] text-[#718077]">Fare preview</p><p className="mt-1 text-[10px] text-[#718077]"><Clock3 size={12} className="mr-1 inline"/> {routeInfo ? `${Math.max(1, Math.round(routeInfo.durationMillis / 60_000))} min · ${(routeInfo.distanceMeters / 1000).toFixed(1)} km · Google route` : `${destination.time} min · ${destination.distance} km · demo estimate`}</p></div>
              <p className="text-xl font-extrabold">K{fare}</p>
            </div>
            <Button disabled={bookingBusy || restoringRide || !liveDispatchEnabled} className="kayan-action w-full bg-[#174536] hover:bg-[#235b46]" onClick={() => void requestRide()}>
              {restoringRide ? 'Restoring your ride…' : bookingBusy ? 'Sending request…' : liveDispatchEnabled ? 'Request this ride' : 'Live dispatch unavailable'}
              {!bookingBusy && !restoringRide && liveDispatchEnabled && <ArrowRight size={16} className="ml-2"/>}
            </Button>
            {!liveDispatchEnabled && <p role="alert" className="mt-3 text-center text-[10px] leading-5 text-[#a34533]">Live dispatch is disabled in this build. No ride request can be sent.</p>}
            <p className="mt-4 text-center text-[9px] leading-4 text-[#839188]">MTN MoMo collection is sandbox-only and requested after completed rides · other payment options are not processed</p>
          </div>}
          </div>}
        </section>
      </> : view === 'activity' ? <section id="activity" className="min-h-[420px] scroll-mt-20 rounded-[28px] border border-[#dce4dd] bg-white p-5 shadow-[0_18px_55px_rgba(31,66,50,.08)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-[#a26b46]">Your journeys</p><h2 className="display-font mt-1 text-2xl font-extrabold">Activity</h2></div>
          <Button variant="outline" className="rounded-xl" disabled={activityLoading} onClick={() => void refreshActivity()}>{activityLoading ? 'Refreshing…' : 'Refresh activity'}</Button>
        </div>
        {activityError && <p role="alert" className="mt-5 rounded-xl border border-[#e4c9c2] bg-[#fff5f2] p-4 text-xs leading-5 text-[#a34533]">{activityError}</p>}
        {activityLoading ? <p role="status" className="mt-8 text-center text-sm text-[#718077]">Loading your activity…</p>
          : activity.length === 0 ? <div className="flex flex-col items-center py-16 text-center">
            <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f1f5ef] text-[#315c49]"><Clock3 size={30}/></span>
            <h3 className="text-xl font-bold">Your rides will appear here.</h3>
            <p className="mb-6 mt-2 max-w-sm text-sm text-[#718077]">Ride requests and live driver updates are kept in your passenger activity.</p>
            <Button className="kayan-action bg-[#174536] hover:bg-[#235b46]" onClick={() => navigateTo('book')}>Book a ride <ArrowRight size={16} className="ml-2"/></Button>
          </div> : <div className="mt-6 space-y-3">
            {activity.map(item => {
              const paymentState = mtnPayments[item.id];
              const canOpenRide = item.status === 'searching' || item.status === 'accepted';
              return <article key={item.id} className="overflow-hidden rounded-2xl border border-[#dce4dd]">
                <button
                  type="button"
                  onClick={() => openActivityRide(item)}
                  disabled={!canOpenRide}
                  className="flex w-full flex-wrap items-center gap-4 p-4 text-left transition hover:bg-[#fbfcf9] disabled:cursor-default"
                >
                  <span className="rounded-xl bg-[#eef4ed] p-3 text-[#315c49]"><CarFront size={22}/></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.destination}</span>
                    <span className="mt-1 block truncate text-[11px] text-[#718077]">{item.pickup} · {item.category}</span>
                    <span className="mt-2 block text-[10px] text-[#839188]">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-bold">K{item.fare_zmw.toFixed(2)}</span>
                    <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[9px] font-semibold ${item.status === 'completed' ? 'bg-[#e8f2e7] text-[#305f39]' : item.status === 'cancelled' || item.status === 'no_drivers' ? 'bg-[#fbece8] text-[#a34533]' : 'bg-[#eef4ed] text-[#315c49]'}`}>{getActivityStatus(item)}</span>
                  </span>
                </button>
                {item.status === 'completed' && item.payment_method === 'MTN MoMo' && <div className="space-y-3 border-t border-[#dce4dd] bg-[#fbfcf9] p-4">
                  {paymentState?.status === 'successful'
                    ? <p role="status" className="flex items-center gap-2 text-sm font-bold text-[#315c49]"><Check size={17}/> MTN MoMo payment confirmed.</p>
                    : <>
                      <div className="flex items-center gap-2 text-sm font-bold"><Smartphone size={17} className="text-[#315c49]"/> Pay after your completed ride</div>
                      <label htmlFor={`mtn-number-${item.id}`} className="block text-[10px] font-bold uppercase tracking-wide text-[#68796e]">MTN MoMo number</label>
                      <input
                        id={`mtn-number-${item.id}`}
                        type="tel"
                        autoComplete="tel"
                        maxLength={18}
                        value={mtnNumbers[item.id] ?? ''}
                        onChange={event => setMtnNumbers(numbers => ({ ...numbers, [item.id]: event.target.value }))}
                        placeholder="0971234567 or +260971234567"
                        className="h-11 w-full rounded-xl border border-[#dce4dd] bg-white px-3 text-sm outline-none focus:border-[#799986] focus:ring-2 focus:ring-[#799986]/20"
                      />
                      <p role="status" aria-live="polite" className="text-xs leading-5 text-[#607168]">
                        {paymentState?.message ?? `Sandbox payment request for K${item.fare_zmw.toFixed(2)} ZMW. You must approve the prompt on your phone.`}
                      </p>
                      <Button
                        type="button"
                        disabled={!!mtnPaymentBusyRide}
                        onClick={() => void payCompletedRideWithMtn(item)}
                        className="kayan-action w-full bg-[#174536] hover:bg-[#235b46]"
                      >
                        {mtnPaymentBusyRide === item.id
                          ? 'Checking MTN MoMo…'
                          : paymentState?.status === 'failed'
                            ? 'Try MTN MoMo again'
                            : paymentState?.status === 'pending'
                              ? 'Check payment status'
                              : `Pay K${item.fare_zmw.toFixed(2)} with MTN MoMo`}
                      </Button>
                    </>}
                </div>}
              </article>;
            })}
          </div>}
      </section> : <section id={view} className="min-h-[420px] scroll-mt-20 rounded-[28px] border border-[#dce4dd] bg-white p-5 shadow-[0_18px_55px_rgba(31,66,50,.08)] sm:p-7">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1f5ef] text-[#315c49]">{view === 'locations' ? <MapPin size={20}/> : <Wallet size={20}/>}</span>
          <div><p className="text-[9px] font-extrabold uppercase tracking-[.18em] text-[#a26b46]">Passenger preferences</p><h2 className="display-font mt-1 text-2xl font-extrabold">{view === 'locations' ? 'Saved addresses' : 'Payment methods'}</h2></div>
        </div>
        <PassengerSaved
          section={view}
          places={savedPlaces}
          onPlaces={updateSavedPlaces}
          methods={savedMethods}
          onAddMethod={addSavedMethod}
          onRemoveMethod={removeSavedMethod}
          defaultMethod={defaultPayment}
          onDefault={chooseDefaultMethod}
          onChoosePlace={useSavedPlace}
          selectedPoint={selectedAddressPoint}
          onPointSelected={handleMapPointSelected}
          activeRide={Boolean(activeRide && (dispatchStatus === 'searching' || dispatchStatus === 'accepted'))}
          storageReady={preferencesReady}
        />
      </section>}

      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] text-[#718077]">
        <span className="font-bold tracking-[.16em]">KAYAN · BUILT AROUND YOU</span>
        <span>Live trip status · Google Maps · MTN MoMo sandbox collection</span>
      </footer>
    </main>
  </div>;
}
