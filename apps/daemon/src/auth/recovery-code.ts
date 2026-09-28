// Recovery codes as people type them (US-AUTH-09, US-ACCT-12).

/** `ABCD 2345`, `abcd2345` and `abcd-2345` are the same code; anything else can't match. */
export function normaliseRecoveryCode(input: string): string | null {
  const bare = input.toLowerCase().replace(/[\s-]/g, '');
  return /^[a-z0-9]{8}$/.test(bare) ? `${bare.slice(0, 4)}-${bare.slice(4)}` : null;
}
