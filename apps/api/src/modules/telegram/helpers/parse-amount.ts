const CURRENCY_SYMBOLS: Record<string, string> = {
  '₴': 'UAH',
  '$': 'USD',
  '€': 'EUR',
  'zł': 'PLN',
  '£': 'GBP',
  '₽': 'RUB',
};

export interface ParsedAmount {
  amount: number;
  currencyCode?: string;
  description?: string;
}

/**
 * Parses amount, optional currency, and description from a command argument string.
 *
 * Examples:
 *   "50 lunch"           → { amount: 50, description: "lunch" }
 *   "50.5 lunch"         → { amount: 50.5, description: "lunch" }
 *   "50$ groceries"      → { amount: 50, currencyCode: "USD", description: "groceries" }
 *   "100 UAH taxi"       → { amount: 100, currencyCode: "UAH", description: "taxi" }
 *   "€50 dinner"         → { amount: 50, currencyCode: "EUR", description: "dinner" }
 *   "50"                 → { amount: 50 }
 */
export function parseAmount(text: string): ParsedAmount | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Try: symbol + amount (e.g., "$50 groceries", "€100.5 dinner")
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (trimmed.startsWith(symbol)) {
      const rest = trimmed.slice(symbol.length).trim();
      const match = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)?$/);
      if (match) {
        const amount = parseFloat(match[1].replace(',', '.'));
        if (isNaN(amount) || amount <= 0) return null;
        return {
          amount,
          currencyCode: code,
          description: match[2]?.trim() || undefined,
        };
      }
    }
  }

  // Try: amount + symbol (e.g., "50$ groceries", "100₴ taxi")
  const symbolAfterMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*([₴$€£₽]|zł)\s*(.*)?$/);
  if (symbolAfterMatch) {
    const amount = parseFloat(symbolAfterMatch[1].replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return null;
    const symbol = symbolAfterMatch[2];
    return {
      amount,
      currencyCode: CURRENCY_SYMBOLS[symbol],
      description: symbolAfterMatch[3]?.trim() || undefined,
    };
  }

  // Try: amount + currency code (e.g., "100 UAH taxi", "50 EUR dinner")
  const codeMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s+(USD|EUR|PLN|GBP|UAH|RUB|BYN)\b\s*(.*)?$/i);
  if (codeMatch) {
    const amount = parseFloat(codeMatch[1].replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return null;
    return {
      amount,
      currencyCode: codeMatch[2].toUpperCase(),
      description: codeMatch[3]?.trim() || undefined,
    };
  }

  // Try: just amount + description (e.g., "50 lunch", "100.5 taxi ride")
  const simpleMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(.*)?$/);
  if (simpleMatch) {
    const amount = parseFloat(simpleMatch[1].replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return null;
    return {
      amount,
      description: simpleMatch[2]?.trim() || undefined,
    };
  }

  return null;
}
