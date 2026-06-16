import { fetchReport, pdfUrl, photoSrc, ReportEntry } from '@/lib/api';
import { normalizeLang, T, LOCALE, Lang } from '@/lib/i18n';
import { PdfButton } from '@/components/PdfButton';
import { Footer } from '@/components/Footer';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PhotoGrid } from '@/components/PhotoGrid';

interface DayGroup {
  day: string;
  work: ReportEntry[];
  material: ReportEntry[];
  photo: ReportEntry[];
}

function groupByDay(entries: ReportEntry[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const e of entries) {
    const day = e.date.slice(0, 10);
    let g = map.get(day);
    if (!g) {
      g = { day, work: [], material: [], photo: [] };
      map.set(day, g);
    }
    if (e.kind === 'work') g.work.push(e);
    else if (e.kind === 'material') g.material.push(e);
    else g.photo.push(e);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function fmtDay(day: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`));
  } catch {
    return day;
  }
}

function fmtRange(entries: ReportEntry[], lang: Lang): string {
  if (entries.length === 0) return '';
  const days = entries.map((e) => e.date.slice(0, 10)).sort();
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${d}T00:00:00Z`),
    );
  const first = days[0];
  const last = days[days.length - 1];
  return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="absolute -left-[26px] top-[3px] h-3 w-3 rounded-full ring-4 ring-canvas"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { lang?: string };
}) {
  const lang = normalizeLang(searchParams?.lang);
  const dict = T[lang];
  const report = await fetchReport(params.token);

  if (!report) {
    return (
      <main className="mx-auto flex min-h-screen max-w-report flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-2xl font-semibold text-ink">{dict.notAvailableTitle}</h1>
        <p className="mt-2 text-muted">{dict.notAvailableBody}</p>
        <Footer text={dict.loggedWith} />
      </main>
    );
  }

  const groups = groupByDay(report.entries);
  const range = fmtRange(report.entries, lang);

  return (
    <main className="mx-auto max-w-report px-5 sm:px-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 py-4">
        <span className="text-sm font-bold tracking-tight text-ink">
          BudLog{' '}
          <span className="hidden font-normal text-muted sm:inline">
            · {dict.report.toLowerCase()}
          </span>
        </span>
        <div className="shrink-0">
          <LanguageSwitcher current={lang} />
        </div>
      </div>

      {/* Header */}
      <header className="border-t border-hairline pt-6">
        <h1 className="font-serif text-[28px] font-semibold leading-tight text-ink">
          {report.site.name}
        </h1>
        <dl className="mt-2 space-y-0.5 text-sm">
          {report.site.clientName && (
            <div className="flex gap-1.5">
              <dt className="text-muted">{dict.client}:</dt>
              <dd className="text-secondary">{report.site.clientName}</dd>
            </div>
          )}
          {report.site.address && (
            <div className="flex gap-1.5">
              <dt className="text-muted">{dict.address}:</dt>
              <dd className="text-secondary">{report.site.address}</dd>
            </div>
          )}
          {range && <p className="pt-1 text-muted">{range}</p>}
        </dl>
        <PdfButton href={pdfUrl(params.token, lang)} label={dict.downloadPdf} />
      </header>

      {/* Journal */}
      <section className="mt-10">
        {groups.length === 0 && (
          <p className="py-8 text-center text-muted">{dict.emptyTitle}</p>
        )}

        {groups.map((g) => (
          <div key={g.day} className="mb-9">
            <h2 className="font-serif text-lg font-semibold capitalize text-ink">
              {fmtDay(g.day, lang)}
            </h2>

            <div className="mt-3 space-y-4 border-l border-hairline pl-5">
              {g.work.length > 0 && (
                <div className="relative">
                  <Dot color="#0369A1" />
                  <p className="text-xs font-bold uppercase tracking-wide text-work">{dict.work}</p>
                  <ul className="mt-1 space-y-1">
                    {g.work.map((w, i) => (
                      <li key={i} className="text-[15px] leading-relaxed text-ink">
                        {w.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {g.material.length > 0 && (
                <div className="relative">
                  <Dot color="#0D9488" />
                  <p className="text-xs font-bold uppercase tracking-wide text-material">
                    {dict.materials}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {g.material.map((m, i) => (
                      <li key={i} className="flex justify-between gap-3 text-[15px] text-ink">
                        <span>{m.name}</span>
                        <span className="whitespace-nowrap text-secondary">
                          {m.quantity}
                          {m.unit ? ` ${m.unit}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {g.photo.length > 0 && (
                <div className="relative">
                  <Dot color="#64748B" />
                  <p className="text-xs font-bold uppercase tracking-wide text-photo">{dict.photos}</p>
                  <PhotoGrid
                    photos={g.photo.map((p) => ({
                      src: photoSrc(p.photoUrl || ''),
                      caption: p.caption,
                    }))}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      <Footer text={dict.loggedWith} />
    </main>
  );
}
