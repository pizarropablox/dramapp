import { formatTime } from './time';

describe('formatTime', () => {
  it('formats the time in Chilean time, 24 hours', () => {
    // Chile is UTC-3 on that date.
    expect(formatTime('2026-10-31T23:15:00Z')).toBe('20:15');
    expect(formatTime('2026-11-01T04:05:00Z')).toBe('01:05');
  });
});
