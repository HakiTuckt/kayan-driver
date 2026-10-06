import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, LogOut, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import DriverPhoneLogin from '@/components/driver/DriverPhoneLogin';
import { decideDriverApplication, loadPendingDriverApplications, type DriverApplicationDecision, type PendingDriverApplication } from '@/lib/driver-application-review';
import type { DriverDocumentType } from '@/lib/driver-documents';
import { signOutDriver } from '@/lib/driver-phone-auth';
import { getSupabaseClient } from '@/lib/supabase';

type PendingDecision = {
  application: PendingDriverApplication;
  decision: DriverApplicationDecision;
};

const documentLabels: { type: DriverDocumentType; label: string }[] = [
  { type: 'drivers_license', label: 'Driving licence' },
  { type: 'national_registration_card', label: 'National registration card' },
  { type: 'vehicle_registration', label: 'Vehicle registration' },
  { type: 'roadworthiness_certificate', label: 'Roadworthiness certificate' },
];

export default function DriverApplicationReview() {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [applications, setApplications] = useState<PendingDriverApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const pending = await loadPendingDriverApplications();
      setApplications(pending);
      setAuthorized(true);
    } catch (error) {
      setAuthorized(false);
      setPageError(error instanceof Error ? error.message : 'Could not load driver applications.');
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
      if (verifiedReviewerSession) await loadApplications();
      else {
        setAuthorized(false);
        setApplications([]);
      }
    } catch (error) {
      setSignedIn(false);
      setPageError(error instanceof Error ? error.message : 'Could not check reviewer sign-in.');
    } finally {
      setSessionReady(true);
    }
  }, [loadApplications]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const signOut = async () => {
    try {
      await signOutDriver();
      setSignedIn(false);
      setAuthorized(false);
      setApplications([]);
      setPageError('');
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not sign out.');
    }
  };

  const submitDecision = async () => {
    if (!pendingDecision) return;
    const { application, decision } = pendingDecision;
    setSavingDecision(true);
    setPageError('');
    try {
      await decideDriverApplication(application.id, decision, notes[application.id] ?? '');
      setApplications(current => current.filter(item => item.id !== application.id));
      setNotes(current => ({ ...current, [application.id]: '' }));
      setPendingDecision(null);
      toast.success(decision === 'approve' ? 'Driver application approved.' : 'Driver application declined.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not record the application decision.';
      setPageError(message);
      toast.error(message);
    } finally {
      setSavingDecision(false);
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

  const accessDenied = !authorized && !!pageError.includes('not authorized');
  return <main className="mx-auto min-h-screen max-w-5xl p-4 sm:p-8">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
      <div>
        <Link to="/" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={14}/>KAYAN</Link>
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-primary"><ShieldCheck size={15}/> Restricted staff area</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Driver applications</h1>
        <p className="mt-2 text-sm text-muted-foreground">Review the submitted profile, vehicle, and private documents before approving a driver.</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => void loadApplications()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>Refresh
        </Button>
        <Button type="button" variant="ghost" onClick={() => void signOut()}><LogOut size={15}/>Sign out</Button>
      </div>
    </header>

    <div className="mb-6 rounded-xl border bg-secondary/50 p-4 text-xs leading-5 text-muted-foreground">
      <strong className="text-foreground">Private documents.</strong> Only authorized reviewers can open these temporary links. They expire after five minutes; do not download or forward applicant documents.
    </div>
    {pageError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{pageError}</p>}
    {accessDenied ? <section className="rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-bold">Reviewer access is not enabled for this account</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Ask the KAYAN project owner to add this verified Supabase user to the reviewer allowlist. Reviewer access cannot be requested or granted from this screen.</p>
    </section> : loading ? <p role="status" className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Loading pending applications…</p>
      : applications.length === 0 ? <section className="rounded-2xl border bg-card p-8 text-center">
        <CheckCircle2 className="mx-auto text-primary" size={30}/>
        <h2 className="mt-3 text-lg font-bold">No pending applications</h2>
        <p className="mt-2 text-sm text-muted-foreground">New driver applications will appear here after submission.</p>
      </section>
        : <div className="space-y-5">{applications.map(application => {
          const documentTypes = new Set(application.documents.map(document => document.document_type));
          const allDocumentsPresent = documentLabels.every(({ type }) => documentTypes.has(type));
          const canApprove = !!application.vehicle && allDocumentsPresent
            && application.documents.every(document => document.review_status !== 'rejected');
          const applicationNotes = notes[application.id] ?? '';
          return <article key={application.id} className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Pending review</p>
                <h2 className="mt-1 text-xl font-extrabold">{application.full_name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{application.phone} · {application.city}</p>
                <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(application.created_at).toLocaleString()}</p>
              </div>
              <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">Pending</span>
            </div>

            <section className="mt-5 rounded-xl bg-secondary/60 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide">Vehicle</h3>
              {application.vehicle ? <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Make / model</dt><dd className="mt-0.5 font-semibold">{application.vehicle.make} {application.vehicle.model}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Year / colour</dt><dd className="mt-0.5 font-semibold">{application.vehicle.year} · {application.vehicle.color}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Registration</dt><dd className="mt-0.5 font-semibold">{application.vehicle.plate}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Fuel / trim</dt><dd className="mt-0.5 font-semibold">{application.vehicle.fuel_type} · {application.vehicle.engine_trim}</dd></div>
              </dl> : <p className="mt-2 text-sm text-destructive">Vehicle details are missing.</p>}
            </section>

            <section className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide">Required documents</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {documentLabels.map(({ type, label }) => {
                  const document = application.documents.find(item => item.document_type === type);
                  return <div key={type} className="flex items-center gap-3 rounded-xl border p-3">
                    <FileText size={18} className="shrink-0 text-primary"/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{label}</p>
                      {document ? <p className="mt-1 text-[10px] text-muted-foreground">
                        {document.expires_on ? `Expires ${document.expires_on}` : 'No expiry date provided'}
                      </p> : <p className="mt-1 text-[10px] text-destructive">Not uploaded</p>}
                    </div>
                    {document && <a href={document.signed_url} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline">
                      View <ExternalLink size={13}/>
                    </a>}
                  </div>;
                })}
              </div>
              {(!allDocumentsPresent || !application.vehicle) && <p className="mt-3 text-xs text-destructive">Approval is disabled until the vehicle record and all four required documents are present.</p>}
            </section>

            <label className="mt-5 block text-xs font-semibold" htmlFor={`review-notes-${application.id}`}>
              Reviewer notes {applicationNotes.trim().length < 5 ? '(required to decline)' : ''}
            </label>
            <textarea
              id={`review-notes-${application.id}`}
              value={applicationNotes}
              maxLength={1000}
              rows={3}
              onChange={event => setNotes(current => ({ ...current, [application.id]: event.target.value }))}
              placeholder="For a decline, explain what needs to be corrected."
              className="mt-2 w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={savingDecision || applicationNotes.trim().length < 5}
                onClick={() => setPendingDecision({ application, decision: 'reject' })}>
                <XCircle size={16}/>Decline
              </Button>
              <Button type="button" disabled={savingDecision || !canApprove}
                onClick={() => setPendingDecision({ application, decision: 'approve' })}>
                <CheckCircle2 size={16}/>Approve driver
              </Button>
            </div>
          </article>;
        })}</div>}

    <AlertDialog open={!!pendingDecision} onOpenChange={open => { if (!open && !savingDecision) setPendingDecision(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingDecision?.decision === 'approve' ? 'Approve this driver?' : 'Decline this application?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDecision?.decision === 'approve'
              ? 'Approval activates the driver account and marks the submitted documents as approved.'
              : 'The application will be marked rejected. The applicant will need to contact KAYAN to discuss the decision.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={savingDecision}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={savingDecision} onClick={event => { event.preventDefault(); void submitDecision(); }}>
            {savingDecision ? 'Saving…' : pendingDecision?.decision === 'approve' ? 'Confirm approval' : 'Confirm decline'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
