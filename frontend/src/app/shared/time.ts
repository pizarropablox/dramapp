/** The party is in San Bernardo: show Chilean time whatever the phone's settings. */
const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Santiago',
});

/** "2026-10-31T23:15:00Z" -> "20:15". */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}
