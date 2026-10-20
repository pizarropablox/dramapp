import { formatTime } from '../shared/time';
import { EXPIRY_WARNING_MS } from './auth';

/** Calendar day in Chile, as the party sees it: "2026-10-31". */
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });

function chileanDay(time: number): string {
  return dayFormatter.format(new Date(time));
}

/** "hoy 23:15", "mañana 21:40" or "el 02-11 18:00", in Chilean time. */
export function formatExpiry(expiresAt: string, now: number): string {
  const expiry = Date.parse(expiresAt);
  const time = formatTime(expiresAt);
  if (chileanDay(expiry) === chileanDay(now)) {
    return `hoy ${time}`;
  }
  if (chileanDay(expiry) === chileanDay(now + 24 * 60 * 60 * 1000)) {
    return `mañana ${time}`;
  }
  const [, month, day] = chileanDay(expiry).split('-');
  return `el ${day}-${month} ${time}`;
}

/** The session ends within EXPIRY_WARNING_MS (and has not ended yet). */
export function expiresSoon(expiresAt: string, now: number): boolean {
  const left = Date.parse(expiresAt) - now;
  return left > 0 && left < EXPIRY_WARNING_MS;
}
