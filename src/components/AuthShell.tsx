import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Endorsement } from "@/components/brand/Lockup";

/**
 * Join and sign-in screens, as on the Join sheet: a back arrow with the
 * screen's name, labelled fields on Linen, and the main action at the foot.
 */
export function AuthShell({
  heading,
  back = "/",
  title,
  subtitle,
  footer,
  children,
}: {
  /** The small header beside the back arrow ("Join your batch"). */
  heading: string;
  back?: "/" | "/login" | "/signup";
  /** Optional large title under the header. */
  title?: string;
  subtitle?: React.ReactNode;
  /** Pinned to the bottom: the main action and its secondary link. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to={back}
          className="-ml-2 inline-flex min-h-12 w-fit items-center gap-1.5 pr-3 text-[16px] font-semibold"
        >
          <ChevronLeft className="size-5" /> {heading}
        </Link>
        {title && (
          <h1 className="animate-fade-up mt-4 font-display text-[30px] leading-[1.1]">{title}</h1>
        )}
        {subtitle && (
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
        )}
        <div className="mt-4 flex flex-1 flex-col">{children}</div>
        {footer && <div className="pt-6">{footer}</div>}
        {!footer && (
          <div className="mt-8 flex justify-center">
            <Endorsement />
          </div>
        )}
      </div>
    </div>
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="text-[13px] text-destructive-ink">{children}</p>;
}

/** A labelled text field in the Join sheet's style. */
export function Field({
  id,
  label,
  hint,
  error,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[14.5px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        {...input}
        className={`h-[54px] w-full rounded-[14px] border border-border-strong/55 bg-card px-4 text-[16px] outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground ${input.className ?? ""}`}
      />
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export const primaryButton =
  "flex h-[54px] w-full items-center justify-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-60";
