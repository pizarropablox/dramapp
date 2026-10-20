import { EXPIRY_WARNING_MS } from './auth';
import { expiresSoon, formatExpiry } from './session-format';

// Chile is UTC-3 on these dates: 2026-10-24T23:00:00Z is 20:00 on Saturday the 24th.
const SATURDAY_20H = Date.parse('2026-10-24T23:00:00Z');

describe('formatExpiry', () => {
  it('says "hoy" for later the same Chilean day', () => {
    expect(formatExpiry('2026-10-25T02:30:00Z', SATURDAY_20H)).toBe('hoy 23:30');
  });

  it('says "mañana" for the next Chilean day', () => {
    expect(formatExpiry('2026-10-25T23:00:00Z', SATURDAY_20H)).toBe('mañana 20:00');
    expect(formatExpiry('2026-10-25T04:00:00Z', SATURDAY_20H)).toBe('mañana 01:00');
  });

  it('gives the date when it is further away', () => {
    expect(formatExpiry('2026-11-02T21:00:00Z', SATURDAY_20H)).toBe('el 02-11 18:00');
  });
});

describe('expiresSoon', () => {
  it('warns within the last hours of the session', () => {
    expect(
      expiresSoon(new Date(SATURDAY_20H + EXPIRY_WARNING_MS - 1).toISOString(), SATURDAY_20H),
    ).toBe(true);
  });

  it('stays quiet with plenty of time left or once it has ended', () => {
    expect(
      expiresSoon(new Date(SATURDAY_20H + EXPIRY_WARNING_MS).toISOString(), SATURDAY_20H),
    ).toBe(false);
    expect(expiresSoon(new Date(SATURDAY_20H - 1).toISOString(), SATURDAY_20H)).toBe(false);
  });
});
