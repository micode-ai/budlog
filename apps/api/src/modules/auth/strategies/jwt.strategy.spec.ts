import { isTokenStale } from './jwt.strategy';

describe('isTokenStale — session invalidation after password change', () => {
  const reset = new Date('2026-06-16T12:00:00.500Z');
  const resetSec = Math.floor(reset.getTime() / 1000); // 1781611200

  it('returns false when the user never changed their password', () => {
    expect(isTokenStale(resetSec - 100, null)).toBe(false);
  });

  it('returns false when the token has no iat', () => {
    expect(isTokenStale(undefined, reset)).toBe(false);
  });

  it('rejects a token issued before the password change', () => {
    expect(isTokenStale(resetSec - 1, reset)).toBe(true);
  });

  it('accepts a token issued in the same second as the change (sub-second grace)', () => {
    expect(isTokenStale(resetSec, reset)).toBe(false);
  });

  it('accepts a token issued after the password change', () => {
    expect(isTokenStale(resetSec + 5, reset)).toBe(false);
  });
});
