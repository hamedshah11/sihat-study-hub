import { useEffect, useRef, useState } from "react";

export function ChapterNotesTable({ children }: { children?: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const check = () => {
      // Add a 1px tolerance to avoid spurious toggles caused by sub-pixel rounding.
      setScrollable(el.scrollWidth > el.clientWidth + 1);
    };

    check();
    el.addEventListener("scroll", check);
    const ro = new ResizeObserver(check);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative my-6 -mx-4 px-4 sm:mx-0 sm:px-0">
      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-xl border border-border"
      >
        <table
          className={[
            "w-full min-w-max border-collapse text-xs sm:text-sm",
            "[&_th]:bg-muted [&_th]:font-semibold [&_th]:text-foreground",
            "[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top",
            "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-left [&_td]:align-top",
            "[&_tbody_tr:nth-child(even)]:bg-muted/25",
            "[&_th:first-child]:whitespace-nowrap [&_td:first-child]:whitespace-nowrap",
          ].join(" ")}
        >
          {children}
        </table>
      </div>

      {scrollable && (
        <div
          className="pointer-events-none absolute inset-y-0 right-4 top-0 w-6 bg-gradient-to-l from-card to-transparent sm:right-0"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
