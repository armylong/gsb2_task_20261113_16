export function formatTime(t: number): string {
  const clamped = Math.max(0, t);
  const m = Math.floor(clamped / 60);
  const s = clamped - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
