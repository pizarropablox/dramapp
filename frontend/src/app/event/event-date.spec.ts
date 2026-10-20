import { formatDuration, formatEventDate, partyDate, suggestedEventName } from './event-date';

// Chile is UTC-3 on these dates.
describe('partyDate', () => {
  it('is the Chilean day when opened in the evening', () => {
    // 22:30 on Friday the 23rd in Chile.
    expect(partyDate(Date.parse('2026-10-24T01:30:00Z'))).toBe('2026-10-23');
  });

  it('is still the night before when opened after midnight or in the morning', () => {
    // 00:40 and 11:59 on Saturday the 24th.
    expect(partyDate(Date.parse('2026-10-24T03:40:00Z'))).toBe('2026-10-23');
    expect(partyDate(Date.parse('2026-10-24T14:59:00Z'))).toBe('2026-10-23');
  });

  it('is the same day from noon on', () => {
    expect(partyDate(Date.parse('2026-10-24T15:00:00Z'))).toBe('2026-10-24');
  });

  it('goes back across months', () => {
    // 02:00 on November 1st belongs to October 31st.
    expect(partyDate(Date.parse('2026-11-01T05:00:00Z'))).toBe('2026-10-31');
  });
});

describe('suggestedEventName', () => {
  it('is DRAMA plus the month in Spanish', () => {
    expect(suggestedEventName('2026-10-31')).toBe('DRAMA Octubre');
    expect(suggestedEventName('2026-01-03')).toBe('DRAMA Enero');
    expect(suggestedEventName('2026-12-26')).toBe('DRAMA Diciembre');
  });
});

describe('formatEventDate', () => {
  it('shows the weekday and day-month', () => {
    expect(formatEventDate('2026-10-24')).toBe('sábado 24-10');
    expect(formatEventDate('2026-11-01')).toBe('domingo 01-11');
  });
});

describe('formatDuration', () => {
  it('shows minutes, and hours once there is at least one', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 min');
    expect(formatDuration((7 * 60 + 2) * 60_000 + 59_000)).toBe('7 h 02 min');
    expect(formatDuration(-5000)).toBe('0 min');
  });
});
