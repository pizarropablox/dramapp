import { HttpErrorResponse } from '@angular/common/http';

export const NO_CONNECTION_MESSAGE =
  'No hay conexión con el servidor. Revisa la red e inténtalo de nuevo.';

export const GENERIC_ERROR_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

/** Spring's ProblemDetail body (RFC 9457). */
export interface ProblemDetail {
  title?: string;
  status?: number;
  detail?: string;
}

function isProblemDetail(body: unknown): body is ProblemDetail {
  return typeof body === 'object' && body !== null && 'detail' in body;
}

/**
 * A request made with responseType 'blob' (a file download) gets its error body as a Blob too: read it back as
 * JSON so errorMessage() finds the ProblemDetail. Anything else is returned as it is.
 */
export async function withJsonErrorBody(error: unknown): Promise<unknown> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) {
    return error;
  }
  let body: unknown = null;
  try {
    body = JSON.parse(await error.error.text());
  } catch {
    // Not JSON (e.g. a proxy's HTML page): no detail to show.
  }
  return new HttpErrorResponse({
    error: body,
    headers: error.headers,
    status: error.status,
    statusText: error.statusText,
    url: error.url ?? undefined,
  });
}

/** Message to show the cashier for a failed request: the backend's detail when there is one. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return NO_CONNECTION_MESSAGE;
    }
    if (
      isProblemDetail(error.error) &&
      typeof error.error.detail === 'string' &&
      error.error.detail
    ) {
      return error.error.detail;
    }
  }
  return GENERIC_ERROR_MESSAGE;
}
