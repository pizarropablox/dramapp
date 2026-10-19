import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { SystemStatusService } from './system-status.service';

@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-system-status-page',
  styleUrl: './system-status-page.scss',
  templateUrl: './system-status-page.html',
})
export class SystemStatusPage {
  private readonly systemStatusService = inject(SystemStatusService);

  protected readonly systemStatus = rxResource({
    stream: () => this.systemStatusService.getStatus(),
  });
}
