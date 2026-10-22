import { Pipe, PipeTransform } from '@angular/core';

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/** Formats whole Chilean pesos the Chilean way: 5000 -> "$5.000", -15000 -> "−$15.000" (a real minus sign). */
export function formatClp(amount: number): string {
  // -0 (e.g. no refunds, negated) is just $0.
  return amount < 0 ? `−${clpFormatter.format(-amount)}` : clpFormatter.format(Math.abs(amount));
}

@Pipe({ name: 'clp' })
export class ClpPipe implements PipeTransform {
  transform(amount: number): string {
    return formatClp(amount);
  }
}
