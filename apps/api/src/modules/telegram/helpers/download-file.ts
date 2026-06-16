import * as https from 'https';
import * as http from 'http';

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Downloads a file from a URL and returns it as a Buffer.
 * Supports both HTTP and HTTPS with timeout.
 */
export function downloadFile(url: string | URL): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const href = typeof url === 'string' ? url : url.href;
    const transport = href.startsWith('http://') ? http : https;

    const req = transport.get(href, (res) => {
      // Handle redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} downloading file`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      req.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
    });
  });
}
