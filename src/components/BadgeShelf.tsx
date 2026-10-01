import { useState } from "react";
import {
  Award,
  Flame,
  Footprints,
  Layers,
  Lock,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Sunrise,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export type ShelfBadge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string | null;
};

// Badge icons are stored as Lucide names in badges.icon.
const ICONS: Record<string, LucideIcon> = {
  "rotate-ccw": RotateCcw,
  "message-circle": MessageCircle,
  sunrise: Sunrise,
  layers: Layers,
  footprints: Footprints,
  sparkles: Sparkles,
  trophy: Trophy,
  flame: Flame,
};

// One medal colour per badge. Fills are dark enough for a white icon in both
// themes; the ring is a lighter shade of the same hue.
const MEDALS: Record<string, { fill: string; ring: string }> = {
  first_quiz: { fill: "#1F4FD8", ring: "#93B3F5" },
  week_streak: { fill: "#EA580C", ring: "#FDBA74" },
  fifty_cards: { fill: "#6D4AE8", ring: "#C4B5FD" },
  perfect_quiz: { fill: "#0B7A6E", ring: "#7EDCCF" },
  curious: { fill: "#0369A1", ring: "#8FD3F7" },
  early_bird: { fill: "#B45309", ring: "#FCD34D" },
  comeback: { fill: "#BE185D", ring: "#F9A8D4" },
  subject_master: { fill: "#4338CA", ring: "#B7B4FA" },
};
const FALLBACK_MEDAL = { fill: "#1F4FD8", ring: "#93B3F5" };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BadgeShelf({ badges }: { badges: ShelfBadge[] }) {
  const earnedCount = badges.filter((b) => b.earnedAt).length;
  const newest = [...badges]
    .filter((b) => b.earnedAt)
    .sort((a, b) => b.earnedAt!.localeCompare(a.earnedAt!))[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    badges.find((b) => b.id === selectedId) ?? newest ?? badges.find((b) => !b.earnedAt);

  if (badges.length === 0) return null;

  const pct = Math.round((earnedCount / badges.length) * 100);

  return (
    <section className="animate-fade-up stagger-3 mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[28px] leading-none text-foreground">Badges</h2>
        <span className="text-sm font-semibold text-muted-foreground tabular-nums">
          {earnedCount} of {badges.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-tint">
        <div
          className="animate-bar-fill h-full rounded-full bg-streak"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-5 grid grid-cols-4 gap-x-2 gap-y-4">
        {badges.map((b, i) => {
          const Icon = ICONS[b.icon] ?? Award;
          const medal = MEDALS[b.id] ?? FALLBACK_MEDAL;
          const earned = !!b.earnedAt;
          const isNew = earned && Date.now() - Date.parse(b.earnedAt!) < WEEK_MS;
          const isSelected = selected?.id === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedId(b.id)}
              aria-pressed={isSelected}
              aria-label={`${b.name}, ${earned ? "earned" : "locked"}`}
              className="animate-pop flex flex-col items-center gap-2 rounded-2xl py-1"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span
                className={`relative grid size-16 place-items-center rounded-full transition-transform duration-200 ${
                  isSelected ? "scale-110" : ""
                }`}
                style={
                  earned
                    ? {
                        background: medal.fill,
                        boxShadow: `0 0 0 4px ${medal.ring}, 0 8px 18px ${medal.fill}40`,
                      }
                    : undefined
                }
              >
                {earned ? (
                  <>
                    <span aria-hidden className="absolute inset-0 overflow-hidden rounded-full">
                      <span className="absolute -left-2 -top-3 size-10 rounded-full bg-white/20" />
                    </span>
                    <Icon className="relative size-7 text-white" strokeWidth={2.2} />
                  </>
                ) : (
                  <span className="grid size-full place-items-center rounded-full border-2 border-dashed border-border bg-card text-muted-foreground">
                    <Icon className="size-6 opacity-50" />
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-background bg-muted text-muted-foreground">
                      <Lock className="size-3" />
                    </span>
                  </span>
                )}
                {isNew && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-streak px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    New
                  </span>
                )}
              </span>
              <span
                className={`line-clamp-2 text-center text-[11px] font-semibold leading-tight ${
                  earned ? "text-foreground" : "text-muted-foreground"
                } ${isSelected ? "underline decoration-2 underline-offset-4" : ""}`}
              >
                {b.name}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          key={selected.id}
          className="animate-fade-up mt-4 flex items-center gap-3 rounded-[20px] border bg-card p-4"
          aria-live="polite"
        >
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full"
            style={
              selected.earnedAt
                ? { background: (MEDALS[selected.id] ?? FALLBACK_MEDAL).fill }
                : undefined
            }
          >
            {(() => {
              const Icon = ICONS[selected.icon] ?? Award;
              return selected.earnedAt ? (
                <Icon className="size-5 text-white" />
              ) : (
                <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Lock className="size-5" />
                </span>
              );
            })()}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">{selected.name}</p>
            <p className="text-sm text-muted-foreground">
              {selected.earnedAt
                ? `${selected.description} · Earned ${formatDate(selected.earnedAt)}`
                : `To unlock: ${selected.description.charAt(0).toLowerCase()}${selected.description.slice(1)}`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
