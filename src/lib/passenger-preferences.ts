import type { MapPoint } from '@/components/KayanMap';

export const paymentOptions = ['Cash', 'MTN MoMo', 'Airtel Money', 'Zamtel Kwacha'];
export type PaymentMethod = typeof paymentOptions[number];
export type SavedPlace = MapPoint & { label: string };
