import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppUpdates } from './update/app-updates';
import { UpdateBanner } from './update/update-banner';

@Component({
  imports: [RouterOutlet, UpdateBanner],
  selector: 'app-root',
  template: '<app-update-banner /><router-outlet />',
})
export class App {
  constructor() {
    inject(AppUpdates).start();
  }
}
