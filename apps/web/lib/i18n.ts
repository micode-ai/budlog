export type Lang = 'pl' | 'ru' | 'ua' | 'en';

export const LANGS: Lang[] = ['pl', 'ru', 'ua', 'en'];

export const LOCALE: Record<Lang, string> = {
  pl: 'pl-PL',
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
};

interface Dict {
  report: string;
  client: string;
  address: string;
  work: string;
  materials: string;
  photos: string;
  downloadPdf: string;
  loggedWith: string;
  emptyTitle: string;
  notAvailableTitle: string;
  notAvailableBody: string;
  langName: string;
}

export const T: Record<Lang, Dict> = {
  pl: {
    report: 'Raport',
    client: 'Klient',
    address: 'Adres',
    work: 'Prace',
    materials: 'Materiały',
    photos: 'Zdjęcia',
    downloadPdf: 'Pobierz PDF',
    loggedWith: 'Dziennik prowadzony w BudLog',
    emptyTitle: 'Brak wpisów',
    notAvailableTitle: 'Raport niedostępny',
    notAvailableBody: 'Ten link wygasł lub został wyłączony.',
    langName: 'Polski',
  },
  ru: {
    report: 'Отчёт',
    client: 'Клиент',
    address: 'Адрес',
    work: 'Работы',
    materials: 'Материалы',
    photos: 'Фото',
    downloadPdf: 'Скачать PDF',
    loggedWith: 'Журнал ведётся в BudLog',
    emptyTitle: 'Записей пока нет',
    notAvailableTitle: 'Отчёт недоступен',
    notAvailableBody: 'Эта ссылка устарела или была отключена.',
    langName: 'Русский',
  },
  ua: {
    report: 'Звіт',
    client: 'Клієнт',
    address: 'Адреса',
    work: 'Роботи',
    materials: 'Матеріали',
    photos: 'Фото',
    downloadPdf: 'Завантажити PDF',
    loggedWith: 'Журнал ведеться в BudLog',
    emptyTitle: 'Записів поки немає',
    notAvailableTitle: 'Звіт недоступний',
    notAvailableBody: 'Це посилання застаріло або було вимкнено.',
    langName: 'Українська',
  },
  en: {
    report: 'Report',
    client: 'Client',
    address: 'Address',
    work: 'Work',
    materials: 'Materials',
    photos: 'Photos',
    downloadPdf: 'Download PDF',
    loggedWith: 'Logged with BudLog',
    emptyTitle: 'No entries yet',
    notAvailableTitle: 'Report unavailable',
    notAvailableBody: 'This link has expired or been turned off.',
    langName: 'English',
  },
};

export function normalizeLang(raw: string | undefined): Lang {
  const v = (raw || '').toLowerCase();
  if (v === 'pl' || v === 'ru' || v === 'en') return v;
  if (v === 'ua' || v === 'uk') return 'ua';
  return 'pl';
}
