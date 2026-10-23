/** The event's .xlsx, as the backend serves it. */
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Used only if the backend sends no file name. */
export const FALLBACK_FILE_NAME = 'evento.xlsx';

/**
 * The file name from a Content-Disposition header: filename* (UTF-8) first, then filename, then the fallback.
 * "attachment; filename*=UTF-8''2026-10-31_DRAMA-Halloween.xlsx" -> "2026-10-31_DRAMA-Halloween.xlsx".
 */
export function fileNameFromDisposition(header: string | null): string {
  if (!header) {
    return FALLBACK_FILE_NAME;
  }
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // A malformed escape: fall through to the plain name.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/i.exec(header) ?? /filename\s*=\s*([^;]+)/i.exec(header);
  return plain?.[1].trim() || FALLBACK_FILE_NAME;
}

/**
 * Whether the share sheet takes this file. True on iPhone (Safari 15+, also as an installed PWA), where it offers
 * "Guardar en Archivos"; false on Chrome for Android, whose share list has no .xlsx, and on http:// (it needs
 * HTTPS). Then the file is downloaded instead.
 */
export function canShareFile(navigator: Navigator | undefined, file: File): boolean {
  try {
    return typeof navigator?.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** How long the blob: URL lives: long enough for the browser to start the download. */
export const OBJECT_URL_LIFETIME_MS = 60_000;

/** Saves the file with a temporary <a download> (Chrome for Android puts it in Descargas). */
export function downloadFile(document: Document, file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}
