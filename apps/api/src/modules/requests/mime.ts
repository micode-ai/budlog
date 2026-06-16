/** MIME types we allow members to upload + serve inline-safely. Anything else is
 *  stored/served as application/octet-stream (forced download) to prevent stored XSS. */
export const ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

/** Coerce an arbitrary (client-supplied) mime to a safe value for the Content-Type header. */
export function safeContentType(mime: string | null | undefined): string {
  return mime && ALLOWED_MIME.has(mime) ? mime : 'application/octet-stream';
}
