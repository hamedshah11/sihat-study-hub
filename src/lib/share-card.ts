// The share card: a student's rose and days studied, sized for Instagram and
// WhatsApp stories. Never a score or a rank, and only when the student
// chooses to share it. Drawn on a canvas so the brand fonts (already loaded
// by the page) are used.

import {
  petalPath,
  ROSE_CENTRE,
  ROSE_FULL,
  ROSE_INNER,
  rosePetalLength,
} from "@/components/brand/rose-geometry";
import { markGeometry } from "@/components/brand/rose-geometry";
import { petalColour } from "@/lib/subject-colours";
import type { SubjectSnapshot } from "@/lib/progress-snapshot";

const W = 1080;
const H = 1920;
const NIGHT = "#141B2D";
const LINEN = "#FBF6EC";
const LAMP = "#F4B23E";
const MIST = "#9AA3BA";
const RING = "#29324D";

function drawPath(ctx: CanvasRenderingContext2D, d: string, fill: string) {
  const p = new Path2D(d);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.fill(p);
  ctx.stroke(p);
}

function headline(subjects: SubjectSnapshot[]) {
  const started = subjects.filter((s) => s.mastery != null);
  if (started.length && subjects.every((s) => s.state === "in_bloom"))
    return ["Fully", "in bloom."];
  if (started.length === 0) return ["Just", "planted."];
  return ["Growing,", "petal by petal."];
}

export async function renderShareCard(opts: {
  firstName: string;
  semesterName: string | null;
  subjects: SubjectSnapshot[];
  daysStudied: number;
}): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 720, 0, W / 2, 720, 620);
  glow.addColorStop(0, "rgba(244,178,62,0.20)");
  glow.addColorStop(0.5, "rgba(244,178,62,0.06)");
  glow.addColorStop(1, "rgba(244,178,62,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = MIST;
  ctx.font = "400 30px 'IBM Plex Mono', monospace";
  const owner = `${opts.firstName.toUpperCase()}'S ${(opts.semesterName ?? "SEMESTER").toUpperCase()} ROSE`;
  ctx.fillText(owner.split("").join(" "), W / 2, 230);

  // The rose, 680 px across.
  const size = 680;
  ctx.save();
  ctx.translate((W - size) / 2, 380);
  ctx.scale(size / 100, size / 100);
  const n = Math.max(2, opts.subjects.length);
  opts.subjects.forEach((s, i) => {
    const angle = i * (360 / n);
    const half = 180 / n;
    ctx.lineWidth = 3;
    drawPath(
      ctx,
      petalPath({ angle, halfAngle: half, inner: ROSE_INNER, outer: ROSE_FULL, gap: 3 }),
      RING,
    );
    if (s.mastery != null) {
      drawPath(
        ctx,
        petalPath({
          angle,
          halfAngle: half,
          inner: ROSE_INNER,
          outer: rosePetalLength(s.mastery),
          gap: 3,
        }),
        petalColour(s.colour, s.index),
      );
    }
  });
  ctx.beginPath();
  ctx.arc(50, 50, ROSE_CENTRE, 0, Math.PI * 2);
  ctx.fillStyle = LAMP;
  ctx.fill();
  ctx.restore();

  const [line1, line2] = headline(opts.subjects);
  ctx.fillStyle = LINEN;
  ctx.font = "600 112px Fraunces, Georgia, serif";
  ctx.fillText(line1, W / 2, 1230);
  ctx.fillText(line2, W / 2, 1350);

  ctx.fillStyle = LAMP;
  ctx.font = "600 32px 'IBM Plex Mono', monospace";
  const stats = `${opts.subjects.length} SUBJECTS · ${opts.daysStudied} DAY${opts.daysStudied === 1 ? "" : "S"} STUDIED`;
  ctx.fillText(stats, W / 2, 1440);

  // Legend: subject names with their petal colour, no numbers.
  ctx.textAlign = "left";
  ctx.font = "500 30px 'Instrument Sans', system-ui, sans-serif";
  const colX = [180, 580];
  opts.subjects.slice(0, 8).forEach((s, i) => {
    const x = colX[i % 2];
    const y = 1540 + Math.floor(i / 2) * 52;
    ctx.fillStyle = petalColour(s.colour, s.index);
    ctx.fillRect(x, y - 22, 22, 22);
    ctx.fillStyle = LINEN;
    const name = s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name;
    ctx.fillText(name, x + 36, y);
  });

  // Lockup at the foot.
  const { petals, centreRadius } = markGeometry(false);
  ctx.save();
  ctx.translate(W / 2 - 170, 1770);
  ctx.scale(0.72, 0.72);
  drawPath(ctx, petals[0], LAMP);
  petals.slice(1).forEach((d) => drawPath(ctx, d, LINEN));
  ctx.beginPath();
  ctx.arc(50, 50, centreRadius, 0, Math.PI * 2);
  ctx.fillStyle = LAMP;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = LINEN;
  ctx.font = "600 62px Fraunces, Georgia, serif";
  ctx.fillText("florence", W / 2 - 90, 1830);
  ctx.fillStyle = MIST;
  ctx.font = "600 18px 'Instrument Sans', system-ui, sans-serif";
  ctx.fillText("POWERED BY SIHAT", W / 2 - 86, 1866);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not draw the card"))),
      "image/png",
    ),
  );
}

/** Share through the phone's share sheet, or download where that isn't available. */
export async function shareRose(blob: Blob) {
  const file = new File([blob], "florence-rose.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({
      files: [file],
      title: "My Florence rose",
      text: "Watch your knowledge bloom.",
    });
    return "shared" as const;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "florence-rose.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded" as const;
}
