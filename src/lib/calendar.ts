import type { Session } from './storage';

export const CALENDAR_MIN_YEAR = 1900;
export const CALENDAR_MAX_YEAR = 9999;

export function isCalendarDateSupported(date: Date): boolean {
  return Number.isFinite(date.getTime()) && date.getFullYear() >= CALENDAR_MIN_YEAR && date.getFullYear() <= CALENDAR_MAX_YEAR;
}

/** Keep navigation inside the same range accepted by stored calendar notes. */
export function shiftCalendarMonth(month: Date, direction: -1 | 1): Date {
  const next = new Date(month.getFullYear(), month.getMonth() + direction, 1);
  if (next.getFullYear() < CALENDAR_MIN_YEAR) return new Date(CALENDAR_MIN_YEAR, 0, 1);
  if (next.getFullYear() > CALENDAR_MAX_YEAR) return new Date(CALENDAR_MAX_YEAR, 11, 1);
  return next;
}

/** Six full Monday-first weeks; callers disable any dates beyond the supported range. */
export function getCalendarDays(month: Date): Date[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

/** Local dates deliberately avoid UTC conversion, which can move a record to another day. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizeDayKey(value: string): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? dateKey(date) : '';
}

export function getCalendarRecords(sessions: Session[]): Record<string, { session: Session; lastActivity: Date }[]> {
  const grouped: Record<string, { session: Session; lastActivity: Date }[]> = {};
  for (const session of sessions) {
    const latestByDay = new Map<string, Date>();
    for (const value of [session.date, ...session.messages.map(message => message.createdAt)]) {
      if (!value) continue;
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) continue;
      const key = dateKey(date);
      if (!latestByDay.has(key) || latestByDay.get(key)! < date) latestByDay.set(key, date);
    }
    for (const [key, lastActivity] of latestByDay) (grouped[key] ||= []).push({ session, lastActivity });
  }
  for (const entries of Object.values(grouped)) entries.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  return grouped;
}
