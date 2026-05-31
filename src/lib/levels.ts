// Level curve: Level 1 starts at 0 XP. The XP required to go from level n
// to n+1 is BASE * GROWTH^(n-1), so the total XP needed to *reach* level n is
// the geometric sum below.
const BASE = 100;
const GROWTH = 1.4;

/** Cumulative XP required to reach the start of `level` (level 1 → 0). */
export function xpThreshold(level: number): number {
  if (level <= 1) return 0;
  return Math.round((BASE * (Math.pow(GROWTH, level - 1) - 1)) / (GROWTH - 1));
}

const LEVEL_NAMES: Array<{ level: number; name: string }> = [
  { level: 1, name: "Trainee" },
  { level: 10, name: "Caregiver" },
  { level: 25, name: "Practitioner" },
  { level: 50, name: "Senior Nurse" },
];

export function levelName(level: number): string {
  let current = LEVEL_NAMES[0].name;
  for (const m of LEVEL_NAMES) {
    if (level >= m.level) current = m.name;
    else break;
  }
  return current;
}

export type LevelInfo = {
  level: number;
  name: string;
  xpIntoLevel: number;
  xpForLevel: number;
  totalXp: number;
};

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xpThreshold(level + 1) <= xp) level++;
  const start = xpThreshold(level);
  const next = xpThreshold(level + 1);
  return {
    level,
    name: levelName(level),
    xpIntoLevel: xp - start,
    xpForLevel: next - start,
    totalXp: xp,
  };
}
