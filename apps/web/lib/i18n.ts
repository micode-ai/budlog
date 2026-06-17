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

interface PortalDict {
  signIn: string;
  email: string;
  password: string;
  invalidLogin: string;
  projects: string;
  newProject: string;
  projectName: string;
  noProjects: string;
  requests: string;
  designs: string;
  journal: string;
  newRequest: string;
  title: string;
  description: string;
  type: string;
  assignTo: string;
  send: string;
  accept: string;
  decline: string;
  start: string;
  done: string;
  thread: string;
  writeMessage: string;
  attachments: string;
  uploadPlan: string;
  runDesign: string;
  noRequests: string;
  noDesigns: string;
  schema: string;
  signOut: string;
  openReport: string;
  status: string;
  loadFailed: string;
}

export const P: Record<Lang, PortalDict> = {
  en: {
    signIn: 'Sign in', email: 'Email', password: 'Password', invalidLogin: 'Invalid email or password.',
    projects: 'Projects', newProject: 'New project', projectName: 'Project name', noProjects: 'No projects yet.',
    requests: 'Requests', designs: 'Designs', journal: 'Journal', newRequest: 'New request',
    title: 'Title', description: 'Description', type: 'Type', assignTo: 'Assign to', send: 'Send',
    accept: 'Accept', decline: 'Decline', start: 'Start', done: 'Mark done', thread: 'Thread',
    writeMessage: 'Write a message…', attachments: 'Attachments', uploadPlan: 'Upload plan',
    runDesign: 'Run design', noRequests: 'No requests yet.', noDesigns: 'No designs yet.',
    schema: 'Schema', signOut: 'Sign out', openReport: 'Open report', status: 'Status', loadFailed: 'Failed to load.',
  },
  pl: {
    signIn: 'Zaloguj się', email: 'E-mail', password: 'Hasło', invalidLogin: 'Nieprawidłowy e-mail lub hasło.',
    projects: 'Projekty', newProject: 'Nowy projekt', projectName: 'Nazwa projektu', noProjects: 'Brak projektów.',
    requests: 'Zgłoszenia', designs: 'Projekty graficzne', journal: 'Dziennik', newRequest: 'Nowe zgłoszenie',
    title: 'Tytuł', description: 'Opis', type: 'Typ', assignTo: 'Przypisz do', send: 'Wyślij',
    accept: 'Przyjmij', decline: 'Odrzuć', start: 'Rozpocznij', done: 'Zakończ', thread: 'Wątek',
    writeMessage: 'Napisz wiadomość…', attachments: 'Załączniki', uploadPlan: 'Wgraj plan',
    runDesign: 'Generuj projekt', noRequests: 'Brak zgłoszeń.', noDesigns: 'Brak projektów graficznych.',
    schema: 'Schemat', signOut: 'Wyloguj', openReport: 'Otwórz raport', status: 'Status', loadFailed: 'Błąd ładowania.',
  },
  ru: {
    signIn: 'Войти', email: 'E-mail', password: 'Пароль', invalidLogin: 'Неверный e-mail или пароль.',
    projects: 'Проекты', newProject: 'Новый проект', projectName: 'Название проекта', noProjects: 'Проектов пока нет.',
    requests: 'Заявки', designs: 'Дизайны', journal: 'Журнал', newRequest: 'Новая заявка',
    title: 'Заголовок', description: 'Описание', type: 'Тип', assignTo: 'Назначить', send: 'Отправить',
    accept: 'Принять', decline: 'Отклонить', start: 'В работу', done: 'Завершить', thread: 'Переписка',
    writeMessage: 'Написать сообщение…', attachments: 'Вложения', uploadPlan: 'Загрузить план',
    runDesign: 'Сгенерировать дизайн', noRequests: 'Заявок пока нет.', noDesigns: 'Дизайнов пока нет.',
    schema: 'Схема', signOut: 'Выйти', openReport: 'Открыть отчёт', status: 'Статус', loadFailed: 'Ошибка загрузки.',
  },
  ua: {
    signIn: 'Увійти', email: 'E-mail', password: 'Пароль', invalidLogin: 'Невірний e-mail або пароль.',
    projects: 'Проєкти', newProject: 'Новий проєкт', projectName: 'Назва проєкту', noProjects: 'Проєктів поки немає.',
    requests: 'Заявки', designs: 'Дизайни', journal: 'Журнал', newRequest: 'Нова заявка',
    title: 'Заголовок', description: 'Опис', type: 'Тип', assignTo: 'Призначити', send: 'Надіслати',
    accept: 'Прийняти', decline: 'Відхилити', start: 'У роботу', done: 'Завершити', thread: 'Листування',
    writeMessage: 'Написати повідомлення…', attachments: 'Вкладення', uploadPlan: 'Завантажити план',
    runDesign: 'Згенерувати дизайн', noRequests: 'Заявок поки немає.', noDesigns: 'Дизайнів поки немає.',
    schema: 'Схема', signOut: 'Вийти', openReport: 'Відкрити звіт', status: 'Статус', loadFailed: 'Помилка завантаження.',
  },
};
