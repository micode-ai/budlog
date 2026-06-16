/**
 * Escapes HTML special characters for Telegram HTML parse mode.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Converts basic markdown to Telegram-compatible HTML.
 * Supports: **bold**, *italic*, `code`, ```code blocks```, headers (## → bold)
 */
export function markdownToTelegramHtml(md: string): string {
  let html = escapeHtml(md);

  // Code blocks (``` ... ```)
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/```\w*\n?/g, '').replace(/```/g, '');
    return `<pre>${code}</pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**text**)
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // Italic (*text*) — but not inside bold
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');

  // Headers (## Header → bold line)
  html = html.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  return html;
}

/**
 * Formats a number as a currency string.
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  return `${amount.toFixed(2)} ${currencyCode}`;
}
