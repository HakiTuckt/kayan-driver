import { Database } from 'lucide-react';

export default function DriverDatabaseUnavailable() {
  return <section role="status" className="mx-auto w-full max-w-xl rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
    <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Database size={23}/></span>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Driver demo</p>
    <h1 className="mt-2 text-2xl font-extrabold leading-tight">Database setup is not available in this build</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">The KAYAN team needs to finish configuring the database before demo registration can be used. No database credentials should be entered here.</p>
  </section>;
}
