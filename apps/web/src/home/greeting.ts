// The Home greeting by local browser time (US-HOME-01, D-039): morning 05:00–11:59, afternoon 12:00–17:59,
// evening 18:00–04:59.
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function greetingFor(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
