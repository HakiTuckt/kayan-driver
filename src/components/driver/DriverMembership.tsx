import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE, type Product } from '@capgo/native-purchases';
import { BadgePercent, CheckCircle2, Fuel, RefreshCw, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getDriverAccountToken,
  getDriverCommissionHistory,
  getDriverFuelRewards,
  getDriverMembershipSummary,
  verifyDriverPlayPurchase,
  type DriverCommissionRecord,
  type DriverFuelReward,
  type DriverMembershipSummary,
} from '@/lib/driver-subscriptions';
import { toast } from 'sonner';

const plans = [
  { name: 'Plus', plan: 'plus', productId: 'kayan_driver_plus', priceZmw: 399 },
  { name: 'Premium', plan: 'premium', productId: 'kayan_driver_premium', priceZmw: 499 },
] as const;
const basePlanId = 'monthly';

function productForPlan(products: Product[], productId: string) {
  return products.find(product =>
    product.planIdentifier === productId && product.identifier === basePlanId,
  );
}

function formatDate(value: string | null) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function formatZmw(value: number) {
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
    minimumFractionDigits: 2,
  }).format(value);
}

export default function DriverMembership() {
  const androidBilling = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const [summary, setSummary] = useState<DriverMembershipSummary | null>(null);
  const [commissionHistory, setCommissionHistory] = useState<DriverCommissionRecord[]>([]);
  const [fuelRewards, setFuelRewards] = useState<DriverFuelReward[]>([]);
  const [storeProducts, setStoreProducts] = useState<Product[]>([]);
  const [billingSupported, setBillingSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');
  const [billingError, setBillingError] = useState('');

  const loadMembership = useCallback(async () => {
    setRefreshing(true);
    setPageError('');
    try {
      const [membership, commissions, rewards] = await Promise.all([
        getDriverMembershipSummary(),
        getDriverCommissionHistory(),
        getDriverFuelRewards(),
      ]);
      setSummary(membership);
      setCommissionHistory(commissions);
      setFuelRewards(rewards);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not load driver membership.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadStore = useCallback(async () => {
    if (!androidBilling) return;
    setBillingError('');
    try {
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      setBillingSupported(isBillingSupported);
      if (!isBillingSupported) {
        setBillingError('Google Play Billing is not available on this device.');
        return;
      }
      const { products } = await NativePurchases.getProducts({
        productIdentifiers: plans.map(plan => plan.productId),
        productType: PURCHASE_TYPE.SUBS,
      });
      setStoreProducts(products);
      if (!plans.every(plan => productForPlan(products, plan.productId))) {
        setBillingError('One or more plans are not available in Play Console yet. Check both products and their monthly base plans.');
      }
    } catch (error) {
      setBillingSupported(false);
      setBillingError(error instanceof Error ? error.message : 'Could not load Google Play subscription products.');
    }
  }, [androidBilling]);

  const syncPurchases = useCallback(async (showMessage: boolean) => {
    if (!androidBilling) return;
    setBusyPlan('restore');
    setBillingError('');
    try {
      await NativePurchases.restorePurchases();
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
      const knownPurchases = purchases.filter(purchase =>
        plans.some(plan => plan.productId === purchase.productIdentifier),
      );
      for (const purchase of knownPurchases) {
        if (purchase.purchaseState !== '1' || !purchase.purchaseToken) continue;
        await verifyDriverPlayPurchase(purchase.purchaseToken, purchase.productIdentifier);
      }
      await loadMembership();
      if (showMessage) {
        toast.success(knownPurchases.length
          ? 'Google Play purchases have been checked with KAYAN.'
          : 'No KAYAN driver subscriptions were found for this Google Play account.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not restore Google Play purchases.';
      setBillingError(message);
      if (showMessage) toast.error(message);
    } finally {
      setBusyPlan(null);
    }
  }, [androidBilling, loadMembership]);

  useEffect(() => {
    void loadMembership();
    void loadStore();
    if (androidBilling) void syncPurchases(false);
  }, [androidBilling, loadMembership, loadStore, syncPurchases]);

  const buyPlan = async (productId: string) => {
    if (!androidBilling || !billingSupported || summary?.plan !== 'free') return;
    const selectedPlan = plans.find(plan => plan.productId === productId);
    const storeProduct = productForPlan(storeProducts, productId);
    if (!selectedPlan || !storeProduct) {
      toast.error('This plan is not currently available in Google Play.');
      return;
    }
    setBusyPlan(productId);
    setBillingError('');
    try {
      const accountToken = await getDriverAccountToken();
      const transaction = await NativePurchases.purchaseProduct({
        productIdentifier: selectedPlan.productId,
        planIdentifier: storeProduct.identifier,
        productType: PURCHASE_TYPE.SUBS,
        appAccountToken: accountToken,
        autoAcknowledgePurchases: false,
      });
      if (transaction.purchaseState !== '1') {
        throw new Error('Google Play has not completed the payment. Your driver plan remains Free until it does.');
      }
      if (!transaction.purchaseToken) {
        throw new Error('Google Play completed checkout without a purchase token. Do not purchase again; try Restore purchases.');
      }
      const verification = await verifyDriverPlayPurchase(transaction.purchaseToken, transaction.productIdentifier);
      if (!verification.entitled || verification.plan !== selectedPlan.plan) {
        throw new Error('Google Play did not confirm an active KAYAN plan. Use Restore purchases or contact support before buying again.');
      }
      await loadMembership();
      toast.success(`${selectedPlan.name} is active until ${formatDate(verification.expires_at)}.`);
      await loadStore();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The Google Play subscription could not be completed.';
      setBillingError(message);
      toast.error(message);
    } finally {
      setBusyPlan(null);
    }
  };

  const managePlan = async () => {
    try {
      await NativePurchases.manageSubscriptions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open Google Play subscription settings.');
    }
  };

  const currencyPrice = (plan: (typeof plans)[number]) => {
    if (androidBilling) return productForPlan(storeProducts, plan.productId)?.priceString ?? 'Price shown in Play Store';
    return `${formatZmw(plan.priceZmw)}/month · preview`;
  };

  return <div className="driver-secondary-page">
    <div className="driver-section-intro mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">DRIVER MEMBERSHIP</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Choose how you drive with KAYAN.</h1>
        <p className="mt-1 text-xs text-muted-foreground">Monthly plans apply only to approved driver accounts. Trip fares are not charged in this app.</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => { void loadMembership(); void loadStore(); }} disabled={refreshing}>
        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''}/>Refresh
      </Button>
    </div>

    {pageError && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{pageError}</p>}
    {billingError && <p role="alert" className="mb-4 rounded-xl border border-primary/30 bg-accent/60 p-3 text-sm">{billingError}</p>}
    {loading || !summary
      ? <p role="status" className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Loading driver membership…</p>
      : <>
        <section className="mb-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border bg-card p-5">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><BadgePercent size={16}/>CURRENT PLAN</p>
            <h2 className="mt-2 text-2xl font-extrabold capitalize">{summary.plan}</h2>
            <p className="mt-1 text-sm">{summary.commission_rate_bps / 100}% commission on completed live-trip fares</p>
            {summary.plan !== 'free' && <p className="mt-2 text-xs text-muted-foreground">
              {summary.auto_renew_enabled ? 'Auto-renews monthly' : 'Will not auto-renew'} · paid through {formatDate(summary.expires_at)}
            </p>}
          </article>
          <article className="rounded-2xl border bg-card p-5">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Wallet size={16}/>COMMISSION TRACKED</p>
            <h2 className="mt-2 text-2xl font-extrabold">{formatZmw(summary.commission_due_zmw)}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Recorded as due to KAYAN; no automatic trip-payment deductions are connected.</p>
          </article>
        </section>

        <section aria-label="Driver plans" className="mb-4 grid gap-3 lg:grid-cols-2">
          {plans.map(plan => {
            const selected = summary.plan === plan.plan;
            const available = !!productForPlan(storeProducts, plan.productId);
            return <article key={plan.plan} className={`rounded-2xl border bg-card p-5 ${selected ? 'border-primary ring-1 ring-primary/20' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">{plan.name}</p>
                  <h2 className="mt-1 text-2xl font-extrabold">{currencyPrice(plan)}</h2>
                </div>
                {selected && <span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-bold">CURRENT PLAN</span>}
              </div>
              <ul className="my-5 space-y-2 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary"/>0% commission on completed live-trip fares</li>
                {plan.plan === 'premium' && <li className="flex items-start gap-2"><Fuel size={16} className="mt-0.5 shrink-0 text-primary"/>One fuel-tank benefit for each 3-month Premium period with 100 completed trips; KAYAN admin enters and issues its value</li>}
              </ul>
              {androidBilling
                ? <Button type="button" className="kayan-action w-full" disabled={!billingSupported || !available || !!busyPlan || summary.plan !== 'free'} onClick={() => void buyPlan(plan.productId)}>
                  {busyPlan === plan.productId ? 'Waiting for Google Play…' : selected ? 'Current plan' : summary.plan !== 'free' ? 'Manage your current plan in Google Play' : `Subscribe to ${plan.name}`}
                </Button>
                : <p className="flex items-center gap-2 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground"><Smartphone size={15} className="shrink-0"/>Purchase and restore are available in the KAYAN Driver Android app through Google Play.</p>}
            </article>;
          })}
        </section>

        {summary.plan !== 'free' && androidBilling && <Button type="button" variant="outline" className="mb-4" onClick={() => void managePlan()}>
          Manage or cancel subscription in Google Play
        </Button>}
        {androidBilling && <Button type="button" variant="ghost" className="mb-4" disabled={!!busyPlan} onClick={() => void syncPurchases(true)}>
          <RefreshCw size={14} className={busyPlan === 'restore' ? 'animate-spin' : ''}/>Restore Google Play purchases
        </Button>}

        {summary.plan === 'premium' && summary.premium_period_start && summary.premium_period_end && <section className="mb-4 rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold"><Fuel size={18} className="text-primary"/>Premium fuel benefit progress</h2>
          <p className="mt-2 text-sm">{summary.premium_completed_trips} / 100 successful live trips</p>
          <div role="progressbar" aria-label="Premium fuel reward trips" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(summary.premium_completed_trips, 100)} className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(summary.premium_completed_trips, 100)}%` }}/>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Current 3-month period: {formatDate(summary.premium_period_start)} – {formatDate(summary.premium_period_end)}. Eligibility is checked after the full period ends.</p>
        </section>}

        {fuelRewards.length > 0 && <section className="mb-4 rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold"><ShieldCheck size={18} className="text-primary"/>Premium fuel benefits</h2>
          <ul className="mt-3 space-y-3">{fuelRewards.map(reward => <li key={reward.reward_id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
            <span>{formatDate(reward.period_start)} – {formatDate(reward.period_end)} · {reward.completed_trips} trips</span>
            <span className="font-semibold">{reward.status === 'issued' && reward.voucher_value_zmw !== null ? `${formatZmw(reward.voucher_value_zmw)} · issued` : 'Eligible · awaiting KAYAN fuel voucher'}</span>
          </li>)}</ul>
        </section>}

        {commissionHistory.length > 0 && <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-bold">Completed trip commission</h2>
          <div className="mt-3 divide-y">{commissionHistory.map(ride => <div key={ride.ride_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
            <div><p className="font-semibold">{ride.destination}</p><p className="mt-1 text-muted-foreground">{formatDate(ride.completed_at)} · fare {formatZmw(ride.fare_zmw)}</p></div>
            <p className="font-semibold">{ride.commission_rate_bps / 100}% · {formatZmw(ride.commission_due_zmw)}</p>
          </div>)}</div>
        </section>}

        {!androidBilling && <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} className="mt-0.5 shrink-0"/>Plan selection is shown here for information only. Membership status and commissions are calculated by the KAYAN server.</p>}
      </>}
  </div>;
}
