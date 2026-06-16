'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LANGS, Lang } from '@/lib/i18n';

export function LanguageSwitcher({ current }: { current: Lang }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setLang(lang: Lang) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('lang', lang);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language">
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLang(lang)}
          aria-pressed={lang === current}
          className={`rounded px-2 py-1 text-xs font-bold uppercase transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cta ${
            lang === current
              ? 'bg-ink text-white'
              : 'text-muted hover:text-ink'
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
