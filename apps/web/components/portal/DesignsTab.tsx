'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pget, clearSession, Unauthorized, DesignArtifact, svgToDataUri } from '@/lib/portal';
import { P } from '@/lib/i18n';

export default function DesignsTab({ projectId }: { projectId: string }) {
  const router = useRouter();
  const t = P.en;
  const [items, setItems] = useState<DesignArtifact[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    pget<DesignArtifact[]>(`projects/${projectId}/designs`)
      .then(setItems)
      .catch((err) => {
        if (err instanceof Unauthorized) {
          clearSession();
          router.replace('/app/login');
        } else {
          setError(t.loadFailed);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.length === 0 && !error && <p className="text-sm text-muted">{t.noDesigns}</p>}
      <ul className="space-y-3">
        {items.map((d) => (
          <li key={d.id} className="rounded-lg border border-hairline bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="rounded-full bg-canvas px-2 py-0.5 font-bold text-secondary">{d.kind}</span>
              <span className="text-muted">{d.provider} · {new Date(d.createdAt).toISOString().slice(0, 10)}</span>
            </div>
            {d.kind === 'svg' && isSvg(d.data) ? (
              // Sandboxed: SVG scripts do NOT execute inside <img>. Never inline this markup.
              <img src={svgToDataUri((d.data as { svg: string }).svg)} alt="floor plan" className="max-w-full rounded border border-hairline" />
            ) : (
              <pre className="overflow-x-auto rounded bg-canvas p-3 text-xs text-ink">{t.schema}: {JSON.stringify(d.data, null, 2)}</pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function isSvg(data: unknown): data is { svg: string } {
  return !!data && typeof (data as { svg?: unknown }).svg === 'string';
}
