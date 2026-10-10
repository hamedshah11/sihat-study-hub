// Geometry for the Florence rose: the logo mark and every student's progress
// rose are drawn from the same petal shape, on a 100-unit square.
//
// A petal is a ring segment with straight, parallel-offset sides, stroked in
// its own colour with round joins (stroke 3) so the corners soften. Radii are
// "visible" radii: the stroke is accounted for here, so a petal of length 46
// reaches exactly 46 units from the centre, as in the brand book.

const STROKE = 3;
const HALF_STROKE = STROKE / 2;

export const ROSE_STROKE = STROKE;

export type PetalSpec = {
  /** Centre angle in degrees, clockwise from twelve o'clock. */
  angle: number;
  /** Half of the wedge each petal owns (180 / petal count). */
  halfAngle: number;
  /** Visible inner radius (the inner ring). */
  inner: number;
  /** Visible outer radius (the petal length). */
  outer: number;
  /** Visible gap between neighbouring petals. */
  gap: number;
  cx?: number;
  cy?: number;
};

function point(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export function petalPath({ angle, halfAngle, inner, outer, gap, cx = 50, cy = 50 }: PetalSpec) {
  const ri = inner + HALF_STROKE;
  const ro = Math.max(outer - HALF_STROKE, ri + 0.5);
  const offset = gap / 2 + HALF_STROKE;
  const spread = (r: number) => (Math.asin(Math.min(1, offset / r)) * 180) / Math.PI;
  const innerSpread = halfAngle - spread(ri);
  const outerSpread = halfAngle - spread(ro);
  const [ilx, ily] = point(cx, cy, ri, angle - innerSpread);
  const [olx, oly] = point(cx, cy, ro, angle - outerSpread);
  const [orx, ory] = point(cx, cy, ro, angle + outerSpread);
  const [irx, iry] = point(cx, cy, ri, angle + innerSpread);
  const largeOuter = outerSpread * 2 > 180 ? 1 : 0;
  const largeInner = innerSpread * 2 > 180 ? 1 : 0;
  return [
    `M${fmt(ilx)} ${fmt(ily)}`,
    `L${fmt(olx)} ${fmt(oly)}`,
    `A${fmt(ro)} ${fmt(ro)} 0 ${largeOuter} 1 ${fmt(orx)} ${fmt(ory)}`,
    `L${fmt(irx)} ${fmt(iry)}`,
    `A${fmt(ri)} ${fmt(ri)} 0 ${largeInner} 0 ${fmt(ilx)} ${fmt(ily)}`,
    "Z",
  ].join(" ");
}

/** The logo's fixed petal lengths, from twelve o'clock clockwise. */
export const MARK_PETAL_LENGTHS = [46, 25, 28, 31, 34, 37, 40, 43] as const;

export type MarkGeometry = {
  petals: string[];
  centreRadius: number;
};

/**
 * The mark. `small` is the 16–24 px version: wider gaps and a larger centre,
 * keeping all eight petals, so it still reads as a rose at favicon size.
 */
export function markGeometry(small = false): MarkGeometry {
  const gap = small ? 6 : 3;
  const inner = small ? 14.5 : 12;
  const centreRadius = small ? 8.5 : 6.5;
  const petals = MARK_PETAL_LENGTHS.map((length, i) =>
    petalPath({ angle: i * 45, halfAngle: 22.5, inner, outer: length, gap }),
  );
  return { petals, centreRadius };
}

/** Progress-rose layout: inner ring 12, full-length petal 46. */
export const ROSE_INNER = 12;
export const ROSE_FULL = 46;
export const ROSE_CENTRE = 6.5;

export function rosePetalLength(mastery: number) {
  const m = Math.max(0, Math.min(1, mastery));
  // A started subject always shows a little colour so it never looks empty.
  const min = ROSE_INNER + 5;
  return min + (ROSE_FULL - min) * m;
}
