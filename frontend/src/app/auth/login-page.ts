import { Component, computed, inject, input, signal } from '@angular/core';
import { FieldState, form, FormField, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CartStore } from '../sale/cart-store';
import { errorMessage } from '../shared/api-error';
import { AuthStore } from './auth-store';
import { safeReturnUrl } from './auth.guard';
import { AuthService } from './auth.service';

function fieldError(state: FieldState<string>): string | null {
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}

/**
 * One login before the party lasts the whole night. After a 401 (?expired=1) the app comes back here
 * without reloading, so the cart is still there, and returns to where the cashier was.
 */
@Component({
  selector: 'app-login-page',
  imports: [FormField],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly cart = inject(CartStore);

  /** Query params, bound by the router (withComponentInputBinding). */
  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  protected readonly credentials = signal({ username: '', password: '' });
  protected readonly loginForm = form(this.credentials, (path) => {
    required(path.username, { message: 'Ingresa el usuario.' });
    required(path.password, { message: 'Ingresa la contraseña.' });
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  /** Shown once the field was touched or a submit was attempted. */
  protected readonly usernameError = computed(() => fieldError(this.loginForm.username()));
  protected readonly passwordError = computed(() => fieldError(this.loginForm.password()));

  protected readonly sessionExpired = computed(() => this.expired() === '1');
  protected readonly keepsCart = computed(() => this.sessionExpired() && !this.cart.isEmpty());

  protected async onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (this.submitting()) {
      return;
    }
    await submit(this.loginForm, async () => {
      this.submitting.set(true);
      this.error.set(null);
      try {
        const session = await firstValueFrom(this.authService.login(this.credentials()));
        this.authStore.signedIn(session);
        await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
      } catch (error: unknown) {
        this.error.set(errorMessage(error));
      } finally {
        this.submitting.set(false);
      }
      return undefined;
    });
  }
}
