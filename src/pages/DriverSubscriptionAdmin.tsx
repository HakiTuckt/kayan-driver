import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Fuel, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import DriverPhoneLogin from '@/components/driver/DriverPhoneLogin';
import { issueAdminDriverFuelReward, loadAdminDriverFuelRewards, type AdminDriverFuelReward } from '@/lib/driver-subscriptions';
import { signOutDriver } from '@/lib/driver-phone-auth';
import { getSupabaseClient } from '@/lib/supabase';

type RewardFields = { value: string; reference: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function formatZmw(value: number) {
  return new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW' }).format(value);
}

export default function DriverSubscriptionAdmin() {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [rewards, setRewards] = useState<AdminDriverFuelReward[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [fields, setFields] = useState<Record<string, RewardFields>>({});
  const [issuingRewardId, setIssuingRewardId] = useState<string | null>(null);

  const loadRewards = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      setRewards(await loadAdminDriverFuelRewards());
      setAuthorized(true);
    } catch (error) {
      setAuthorized(false);
      setPageError(error instanceof Error ? error.message : 'Could not load Premium fuel rewards.');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setPageError('');
    try {
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error) throw new Error(`Could not check reviewer sign-in: ${error.message}`);
      const user = data.session?.user;
      const verifiedReviewerSession = !!user && !user.is_anonymous && !!user.phone_confirmed_at;
      setSignedIn(verifiedReviewerSession);
      if (verifiedReviewerSession) await loadRewards();
      else {
        setAuthorized(false);
        setRewards([]);
      }
    } catch (error) {
      setSignedIn(false);
      setPageError(error instanceof Error ? error.message : 'Could not check reviewer sign-in.');
    } finally {
      setSessionReady(true);
    }
  }, [loadRewards]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const signOut = async () => {
    try {
      await signOutDriver();
      setSignedIn(false);
      setAuthorized(false);
      setRewards([]);
      setPageError('');
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not sign out.');
    }
  };

  const setRewardField = (rewardId: string, key: keyof RewardFields, value: string) => {
    setFields(current => ({
      ...current,
      [rewardId]: {
        value: current[rewardId]?.value ?? '',
        reference: current[rewardId]?.reference ?? '',
        [key]: value,
      },
    }));
  };

  const issueReward = async (reward: AdminDriverFuelReward) => {
    const rewardFields = fields[reward.reward_id] ?? { value: '', reference: '' };
    const amount = Number(rewardFields.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPageError('Enter a positive ZMW voucher value before issuing a reward.');
      return;
    }
    setIssuingRewardId(reward.reward_id);
    setPageError('');
    try {
      await issueAdminDriverFuelReward(reward.reward_id, amount, rewardFields.reference);
      await loadRewards();
      toast.success('Premium fuel benefit marked as issued.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not issue the fuel benefit.';
      setPageError(message);
      toast.error(message);
    } finally {
      setIssuingRewardId(null);
    }
  };

  if (!sessionReady) {
    return <main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center p-6 text-sm text-muted-foreground">Checking reviewer access…</main>;
  }

  if (!signedIn) {
    return <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-5 p-5 sm:p-8">
      <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16}/>Back to KAYAN</Link>
      <DriverPhoneLogin audience="reviewer" onAuthenticated={checkSession}/>
      {pageError && <p role="alert" className="mx-auto w-full max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{pageError}</p>}
    </main>;
  }

  const accessDenied = !authorized && pageError.toLowerCase().includes('not authorized');
  return <main className="mx-auto min-h-screen max-w-5xl p-4 sm:p-8">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
      <div>
        <Link to="/" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={14}/>KAYAN</Link>
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-primary"><ShieldCheck size={15}/>Restricted staff area</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Premium fuel rewards</h1>
        <p className="mt-2 text-sm text-muted-foreground">Eligible Premium drivers complete at least 100 successful trips during a full 3-month subscription period.</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => void loadRewards()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>Refresh
        </Button>
        <Button type="button" variant="ghost" onClick={() => void signOut()}><LogOut size={15}/>Sign out</Button>
      </div>
    </header>

    <div className="mb-6 rounded-xl border bg-secondary/50 p-4 text-xs leading-5 text-muted-foreground">
      <strong className="text-foreground">Manual issuance.</strong> Enter the fuel voucher value and reference after KAYAN has arranged the benefit. Issuing a reward records it for the driver; this screen does not purchase fuel or transfer money.
    </div>
    {pageError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{pageError}</p>}
    {accessDenied ? <section className="rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-bold">Reviewer access is not enabled for this account</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Ask the KAYAN project owner to add this verified Supabase user to the reviewer allowlist.</p>
    </section> : loading ? <p role="status" className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Loading Premium fuel rewards…</p>
      : rewards.length === 0 ? <section className="rounded-2xl border bg-card p-8 text-center">
        <Fuel className="mx-auto text-primary" size={30}/>
        <h2 className="mt-3 text-lg font-bold">No eligible fuel benefits yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">Rewards appear here after a full paid Premium period with at least 100 completed trips.</p>
      </section>
        : <div className="space-y-4">{rewards.map(reward => {
          const rewardFields = fields[reward.reward_id] ?? { value: '', reference: '' };
          return <article key={reward.reward_id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">{reward.driver_name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{reward.driver_phone} · Premium period {reward.period_number}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(reward.period_start)} – {formatDate(reward.period_end)} · {reward.completed_trips} successful trips</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${reward.status === 'issued' ? 'bg-primary/10 text-primary' : 'bg-secondary text-foreground'}`}>
                {reward.status === 'issued' ? 'ISSUED' : 'ELIGIBLE'}
              </span>
            </div>
            {reward.status === 'issued'
              ? <p className="mt-4 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={16} className="text-primary"/>{formatZmw(reward.voucher_value_zmw ?? 0)} issued{reward.voucher_reference ? ` · ${reward.voucher_reference}` : ''}</p>
              : <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-xs font-medium">Fuel voucher value (ZMW)
                  <input type="number" min="0.01" step="0.01" value={rewardFields.value} onChange={event => setRewardField(reward.reward_id, 'value', event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"/>
                </label>
                <label className="text-xs font-medium">Voucher reference (optional)
                  <input type="text" maxLength={120} value={rewardFields.reference} onChange={event => setRewardField(reward.reward_id, 'reference', event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"/>
                </label>
                <Button type="button" className="kayan-action" disabled={issuingRewardId === reward.reward_id} onClick={() => void issueReward(reward)}>
                  {issuingRewardId === reward.reward_id ? 'Saving…' : 'Mark benefit issued'}
                </Button>
              </div>}
          </article>;
        })}</div>}
  </main>;
}
