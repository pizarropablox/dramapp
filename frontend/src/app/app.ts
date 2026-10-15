import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { SystemStatusService } from './system/system-status.service';

@Component({
  imports: [DatePipe, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly systemStatusService = inject(SystemStatusService);

  protected readonly systemStatus = rxResource({
    stream: () => this.systemStatusService.getStatus(),
  });
}
