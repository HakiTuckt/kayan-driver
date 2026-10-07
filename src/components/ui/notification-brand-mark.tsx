import { cn } from "@/lib/utils";

export function NotificationBrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-extrabold tracking-[-0.08em] text-primary-foreground shadow-sm",
        className,
      )}
    >
      K
    </span>
  );
}
