import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { errorMessage } from '../shared/api-error';
import { PointTerminal } from './point';
import { PointService } from './point.service';
import { ValePanel } from './vale-panel';

/** The vale of this phone's last sale, to print it again after going on to the next one. */
@Component({
  selector: 'app-vale-dialog',
  imports: [ValePanel],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <section class="screen" role="dialog" aria-modal="true" aria-labelledby="vale-dialog-title">
      <h2 #title id="vale-dialog-title" tabindex="-1">Vale de la venta #{{ saleId() }}</h2>
      @if (vale.isLoading()) {
        <p role="status">Cargando…</p>
      } @else if (vale.error(); as error) {
        <p class="message" role="alert">{{ message(error) }}</p>
        <button type="button" (click)="vale.reload()">Reintentar</button>
      } @else if (vale.hasValue()) {
        <app-vale-panel [initial]="vale.value()" [terminal]="terminal()" />
      }
      <button type="button" class="back" (click)="closed.emit()">Cerrar</button>
    </section>
  `,
  styleUrl: './point-charge-screen.scss',
})
export class ValeDialog {
  readonly saleId = input.required<number>();
  readonly terminal = input.required<PointTerminal>();
  readonly closed = output<void>();

  private readonly pointService = inject(PointService);
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  protected readonly vale = rxResource({
    params: () => this.saleId(),
    stream: ({ params }) => this.pointService.vale(params),
  });
  protected readonly message = errorMessage;

  constructor() {
    afterNextRender(() => this.title()?.nativeElement.focus());
  }
}
