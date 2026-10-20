/** barra sells, voids and sees totals; admin can also open and close events and see /estado. */
export type Role = 'BARRA' | 'ADMIN';

/** Who is logged in and until when (the HttpOnly cookie itself cannot be read from here). */
export interface Session {
  username: string;
  role: Role;
  expiresAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

/** The backend also returns the token for Bearer clients; the app uses the cookie and ignores it. */
export interface LoginResponse extends Session {
  token: string;
}

/** Below this much time left, the sale screen warns that the session is about to end. */
export const EXPIRY_WARNING_MS = 3 * 60 * 60 * 1000;
