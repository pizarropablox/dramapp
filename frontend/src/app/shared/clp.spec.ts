import { ClpPipe, formatClp } from './clp';

describe('formatClp', () => {
  it.each([
    [5000, '$5.000'],
    [22000, '$22.000'],
    [1234567, '$1.234.567'],
    [500, '$500'],
    [0, '$0'],
  ])('formats %i as %s', (amount, expected) => {
    expect(formatClp(amount)).toBe(expected);
  });

  it('is exposed as the clp pipe', () => {
    expect(new ClpPipe().transform(13000)).toBe('$13.000');
  });
});
