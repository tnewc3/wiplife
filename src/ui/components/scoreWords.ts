/** Describes a 0–100 score in words; the game never shows stat numbers. */
export function scoreWords(value: number): string {
  if (value < 20) return 'very low';
  if (value < 40) return 'low';
  if (value < 60) return 'medium';
  if (value < 80) return 'high';
  return 'very high';
}
