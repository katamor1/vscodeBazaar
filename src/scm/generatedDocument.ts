export type GeneratedDocumentLanguage = 'text' | 'diff';

export function generatedDocumentExtension(language: GeneratedDocumentLanguage): string {
  return language === 'diff' ? 'diff' : 'txt';
}

export function generatedDocumentPathLabel(title: string): string {
  const sanitized = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || 'Bazaar';
}
