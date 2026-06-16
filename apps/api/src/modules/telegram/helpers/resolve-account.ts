export interface AccountInfo {
  id: string;
  name: string;
  currencyCode: string;
}

/**
 * Detects if the user's message mentions a specific account name
 * and resolves the appropriate accountId for the query.
 * Does NOT permanently switch the default account.
 */
export function resolveAccountFromMessage(
  message: string,
  accounts: AccountInfo[],
  currentAccountId: string,
): { resolvedAccountId: string; resolvedAccountName: string | null; wasOverridden: boolean } {
  if (accounts.length <= 1) {
    return { resolvedAccountId: currentAccountId, resolvedAccountName: null, wasOverridden: false };
  }

  const msgLower = message.toLowerCase();

  // Filter accounts whose name appears in the message (min 2 chars to avoid false positives)
  const matches = accounts.filter(
    (a) => a.name.length >= 2 && msgLower.includes(a.name.toLowerCase()),
  );

  if (matches.length === 1) {
    if (matches[0].id !== currentAccountId) {
      return { resolvedAccountId: matches[0].id, resolvedAccountName: matches[0].name, wasOverridden: true };
    }
    // Matched the current account — no override needed but return the name for context
    return { resolvedAccountId: currentAccountId, resolvedAccountName: matches[0].name, wasOverridden: false };
  }

  // Multiple matches — pick the longest name (most specific match)
  if (matches.length > 1) {
    const best = matches.sort((a, b) => b.name.length - a.name.length)[0];
    if (best.id !== currentAccountId) {
      return { resolvedAccountId: best.id, resolvedAccountName: best.name, wasOverridden: true };
    }
    return { resolvedAccountId: currentAccountId, resolvedAccountName: best.name, wasOverridden: false };
  }

  return { resolvedAccountId: currentAccountId, resolvedAccountName: null, wasOverridden: false };
}
