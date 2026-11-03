import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** ⚙️ Administración, in the Totales header. The page shows it to admin only. */
@Component({
  selector: 'app-admin-link',
  imports: [RouterLink],
  template: `
    <a routerLink="/admin" aria-label="Administración" title="Administración"
      ><span aria-hidden="true">⚙️</span></a
    >
  `,
  styles: `
    :host {
      display: contents;
    }

    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 3rem;
      height: 3rem;
      border: 1px solid var(--border);
      border-radius: 0.6rem;
      background: var(--surface-2);
      font-size: 1.4rem;
      text-decoration: none;
    }
  `,
})
export class AdminLink {}
