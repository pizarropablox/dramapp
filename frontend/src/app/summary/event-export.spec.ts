import {
  canShareFile,
  downloadFile,
  FALLBACK_FILE_NAME,
  fileNameFromDisposition,
  fileShareData,
  OBJECT_URL_LIFETIME_MS,
  XLSX_TYPE,
} from './event-export';

describe('fileNameFromDisposition', () => {
  it('prefers the UTF-8 name', () => {
    expect(
      fileNameFromDisposition(
        `attachment; filename="=?UTF-8?Q?x?="; filename*=UTF-8''2026-10-31_A%C3%B1o-Nuevo.xlsx`,
      ),
    ).toBe('2026-10-31_Año-Nuevo.xlsx');
  });

  it('takes the plain name, quoted or not', () => {
    expect(fileNameFromDisposition('attachment; filename="2026-10-31_DRAMA.xlsx"')).toBe(
      '2026-10-31_DRAMA.xlsx',
    );
    expect(fileNameFromDisposition('attachment; filename=2026-10-31_DRAMA.xlsx')).toBe(
      '2026-10-31_DRAMA.xlsx',
    );
  });

  it('falls back when there is no name', () => {
    expect(fileNameFromDisposition(null)).toBe(FALLBACK_FILE_NAME);
    expect(fileNameFromDisposition('attachment')).toBe(FALLBACK_FILE_NAME);
  });
});

describe('fileShareData', () => {
  it('shares the file only, with no title, text or url (iOS saves those as a .txt)', () => {
    const file = new File(['x'], '2026-10-31_DRAMA.xlsx', { type: XLSX_TYPE });

    expect(fileShareData(file)).toStrictEqual({ files: [file] });
  });
});

describe('canShareFile', () => {
  const file = new File(['x'], 'evento.xlsx', { type: XLSX_TYPE });

  it('is false without the Web Share API (http://, desktop) or without a navigator', () => {
    expect(canShareFile({} as Navigator, file)).toBe(false);
    expect(canShareFile(undefined, file)).toBe(false);
  });

  it('asks the browser whether it takes this very file', () => {
    const canShare = vi.fn(() => true);

    expect(canShareFile({ canShare } as unknown as Navigator, file)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(canShareFile({ canShare: () => false } as unknown as Navigator, file)).toBe(false);
  });

  it('is false when the browser throws instead of answering', () => {
    const canShare = () => {
      throw new TypeError('files not supported');
    };

    expect(canShareFile({ canShare } as unknown as Navigator, file)).toBe(false);
  });
});

describe('downloadFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('clicks a temporary link named after the file and frees the URL a minute later', () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:excel');
    URL.revokeObjectURL = vi.fn();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    const file = new File(['x'], '2026-10-31_DRAMA.xlsx', { type: XLSX_TYPE });

    downloadFile(document, file);

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('2026-10-31_DRAMA.xlsx');
    expect(clicked[0].href).toBe('blob:excel');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:excel');
  });
});
