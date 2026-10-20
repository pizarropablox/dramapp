/** The party is in San Bernardo: dates and hours are Chilean whatever the phone's settings. */
const TIME_ZONE = 'America/Santiago';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Before this Chilean hour, an event being opened belongs to the night before. */
const NEW_DAY_HOUR = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The date of the party an event opened now belongs to: "2026-10-24". Opening at 22:30 is that
 * day; opening at 00:40 (or for a morning test) is still the night before.
 */
export function partyDate(now: number): string {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(now)).map((part) => [part.type, part.value]),
  );
  const day = Date.UTC(Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']));
  const date = Number(parts['hour']) < NEW_DAY_HOUR ? day - DAY_MS : day;
  return new Date(date).toISOString().slice(0, 10);
}

/** "DRAMA Octubre" for an event on 2026-10-24. */
export function suggestedEventName(eventDate: string): string {
  return `DRAMA ${MONTHS[Number(eventDate.slice(5, 7)) - 1]}`;
}

const weekdayFormatter = new Intl.DateTimeFormat('es-CL', { weekday: 'long', timeZone: 'UTC' });

/** "sábado 24-10". */
export function formatEventDate(eventDate: string): string {
  const [year, month, day] = eventDate.split('-').map(Number);
  const weekday = weekdayFormatter.format(new Date(Date.UTC(year, month - 1, day)));
  return `${weekday} ${eventDate.slice(8, 10)}-${eventDate.slice(5, 7)}`;
}

/** "7 h 02 min", "45 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}
