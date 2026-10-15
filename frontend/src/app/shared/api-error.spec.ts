import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage, GENERIC_ERROR_MESSAGE, NO_CONNECTION_MESSAGE } from './api-error';

describe('errorMessage', () => {
  it('uses the ProblemDetail detail from the backend', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { title: 'Sin evento abierto', status: 409, detail: 'No hay un evento abierto.' },
    });

    expect(errorMessage(error)).toBe('No hay un evento abierto.');
  });

  it('reports a connection problem when there is no response', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toBe(NO_CONNECTION_MESSAGE);
  });

  it('falls back to a generic message when the body is not a ProblemDetail', () => {
    const error = new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' });

    expect(errorMessage(error)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('falls back to a generic message for non-HTTP errors', () => {
    expect(errorMessage(new Error('boom'))).toBe(GENERIC_ERROR_MESSAGE);
    expect(errorMessage(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
