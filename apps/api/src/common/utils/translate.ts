const uncategorizedMap: Record<string, string> = {
  en: 'Uncategorized',
  ru: 'Без категории',
  ua: 'Без категорії',
  pl: 'Bez kategorii',
  es: 'Sin categoría',
  fr: 'Non catégorisé',
  de: 'Nicht kategorisiert',
};

const totalMap: Record<string, string> = {
  en: 'Total',
  ru: 'Итого',
  ua: 'Всього',
  pl: 'Łącznie',
  es: 'Total',
  fr: 'Total',
  de: 'Gesamt',
};

const otherMap: Record<string, string> = {
  en: 'Other',
  ru: 'Другое',
  ua: 'Інше',
  pl: 'Inne',
  es: 'Otros',
  fr: 'Autre',
  de: 'Sonstige',
};

export function translateUncategorized(language?: string): string {
  return (language && uncategorizedMap[language]) || uncategorizedMap.en;
}

/**
 * Replaces common English labels in story blocks with translated versions.
 * Safety net for when GPT doesn't fully respect the language instruction.
 */
export function localizeStoryBlocks(blocks: any[], language?: string): any[] {
  if (!language || language === 'en') return blocks;

  const replacements: Record<string, string> = {
    Uncategorized: uncategorizedMap[language] || 'Uncategorized',
    Total: totalMap[language] || 'Total',
    Other: otherMap[language] || 'Other',
  };

  const json = JSON.stringify(blocks);
  const localized = json.replace(
    /(?<="(?:label|name|title)"\s*:\s*")(?:Uncategorized|Total|Other)(?=")/g,
    (match) => replacements[match] || match,
  );

  try {
    return JSON.parse(localized);
  } catch {
    return blocks;
  }
}
