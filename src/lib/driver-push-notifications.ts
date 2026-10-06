import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { saveDriverPushToken } from '@/lib/ride-dispatch';

type PushHandlers = {
  onOffer: (offerId: string) => Promise<void>;
  onError: (message: string) => void;
};

function readOfferId(data: Record<string, unknown> | undefined) {
  return typeof data?.offer_id === 'string' ? data.offer_id : null;
}

export async function configureDriverPushNotifications(handlers: PushHandlers) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return {
      supported: false,
      register: async () => false,
      remove: async () => undefined,
    };
  }

  await PushNotifications.createChannel({
    id: 'ride_offers',
    name: 'Ride offers',
    description: 'New passenger ride offers for the driver',
    importance: 5,
    vibration: true,
  });

  const staticListeners: PluginListenerHandle[] = [];
  const invokeOfferHandler = (offerId: string | null) => {
    if (!offerId) return;
    void handlers.onOffer(offerId).catch(error => {
      handlers.onError(error instanceof Error ? error.message : 'Could not open this ride offer.');
    });
  };

  staticListeners.push(await PushNotifications.addListener('pushNotificationReceived', notification => {
    invokeOfferHandler(readOfferId(notification.data));
  }));
  staticListeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => {
    invokeOfferHandler(readOfferId(action.notification.data));
  }));

  return {
    supported: true,
    register: async () => {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') return false;

      let registrationListener: PluginListenerHandle | undefined;
      let errorListener: PluginListenerHandle | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        let resolveToken!: (token: string) => void;
        let rejectToken!: (error: Error) => void;
        const tokenPromise = new Promise<string>((resolve, reject) => {
          resolveToken = resolve;
          rejectToken = reject;
        });
        timeout = setTimeout(() => rejectToken(new Error('Timed out waiting for an FCM registration token.')), 15_000);
        registrationListener = await PushNotifications.addListener('registration', token => resolveToken(token.value));
        errorListener = await PushNotifications.addListener('registrationError', error => {
          rejectToken(new Error(error.error || 'Android push registration failed.'));
        });

        await PushNotifications.register();
        const token = await tokenPromise;
        await saveDriverPushToken(token);
        return true;
      } finally {
        if (timeout) clearTimeout(timeout);
        await Promise.all([
          registrationListener?.remove(),
          errorListener?.remove(),
        ]);
      }
    },
    remove: async () => {
      const results = await Promise.allSettled(staticListeners.map(listener => listener.remove()));
      const failedRemoval = results.find(result => result.status === 'rejected');
      if (failedRemoval?.status === 'rejected') throw failedRemoval.reason;
    },
  };
}
