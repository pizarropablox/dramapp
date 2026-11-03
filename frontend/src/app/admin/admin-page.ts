import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** ⚙️ Administración: one entry per area. Concesión (DRAMA-36) and Sueldos (DRAMA-38) come later. */
@Component({
  selector: 'app-admin-page',
  imports: [RouterLink],
  template: `
    <div class="admin-page">
      <header class="top">
        <a class="back" routerLink="/totales">← Totales</a>
      </header>
      <h1>Administración</h1>
      <nav aria-label="Administración">
        <ul class="sections">
          <li>
            <a class="section" routerLink="/admin/carta">
              <span class="title">Carta</span>
              <span class="hint">Agregar productos y variantes</span>
            </a>
          </li>
        </ul>
      </nav>
    </div>
  `,
  styleUrl: './admin-layout.scss',
  styles: `
    .sections {
      display: grid;
      gap: 0.5rem;
    }

    .section {
      display: grid;
      gap: 0.2rem;
      min-height: 3rem;
      padding: 0.75rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--surface);
      color: var(--text);
      text-decoration: none;
    }

    .title {
      font-size: 1.15rem;
      font-weight: 700;
    }
  `,
})
export class AdminPage {}
