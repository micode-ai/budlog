export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface ReportEntry {
  kind: 'work' | 'material' | 'photo';
  date: string;
  description?: string;
  name?: string;
  quantity?: number;
  unit?: string;
  caption?: string;
  photoUrl?: string;
}

export interface Report {
  site: { name: string; address: string | null; clientName: string | null };
  generatedAt: string;
  entries: ReportEntry[];
}

export async function fetchReport(token: string): Promise<Report | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/report/${token}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Report;
  } catch {
    return null;
  }
}

export function pdfUrl(token: string, lang: string): string {
  return `${API_BASE}/api/v1/public/report/${token}/pdf?lang=${lang}`;
}

export function photoSrc(photoUrl: string): string {
  return photoUrl.startsWith('http') ? photoUrl : `${API_BASE}${photoUrl}`;
}
