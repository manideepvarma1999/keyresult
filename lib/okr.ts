export interface KeyResultValues {
  start_value: string | number;
  target_value: string | number;
  current_value: string | number;
}

/** Progress from start to target as 0-100, clamped. Works for decreasing targets too. */
export function progress(kr: KeyResultValues): number {
  const start = Number(kr.start_value);
  const target = Number(kr.target_value);
  const current = Number(kr.current_value);
  if (target === start) return 0;
  const ratio = (current - start) / (target - start);
  return Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
}

export function objectiveProgress(krs: KeyResultValues[]): number {
  if (krs.length === 0) return 0;
  return Math.round(krs.reduce((sum, kr) => sum + progress(kr), 0) / krs.length);
}

export function currentQuarter(date = new Date()): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export function shiftQuarter(quarter: string, delta: number): string {
  const [year, q] = quarter.split("-Q").map(Number);
  const index = year * 4 + (q - 1) + delta;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

export const STATUS_LABEL = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  done: "Done",
} as const;

export type Status = keyof typeof STATUS_LABEL;
