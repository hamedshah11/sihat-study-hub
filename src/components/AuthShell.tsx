import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { FlorenceMark } from "@/components/brand/FlorenceMark";
import { Endorsement, Wordmark } from "@/components/brand/Lockup";

/** Sign-in, join and password screens: Linen paper, the lockup, one task. */
export function AuthShell({
  title,
  subtitle,
  back,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Where the back arrow goes; defaults to the welcome screen. */
  back?: { to: "/" | "/login" | "/signup"; label: string } | null;
  children: React.ReactNode;
}) {
  const backLink = back === undefined ? { to: "/" as const, label: "Back" } : back;
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex h-12 items-center justify-between">
          {backLink ? (
            <Link
              to={backLink.to}
              className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-3 text-[14px] font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-5" /> {backLink.label}
            </Link>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-1.5" aria-label="Florence">
            <FlorenceMark size={22} />
            <Wordmark className="text-[20px]" />
          </span>
        </div>
        <h1 className="animate-fade-up mt-8 font-display text-[32px] leading-[1.08]">{title}</h1>
        {subtitle && (
          <p className="animate-fade-up stagger-1 mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
        <div className="animate-fade-up stagger-2 mt-6 flex flex-1 flex-col [&_input]:h-12 [&_input]:rounded-2xl [&_input]:border [&_input]:border-input [&_input]:bg-card [&_input]:text-[15px]">
          {children}
        </div>
        <div className="mt-8 flex justify-center">
          <Endorsement />
        </div>
      </div>
    </div>
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="text-[13px] text-destructive-ink">{children}</p>;
}
