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
