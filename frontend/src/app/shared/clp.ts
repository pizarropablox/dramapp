import { Pipe, PipeTransform } from '@angular/core';

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/** Formats whole Chilean pesos the Chilean way: 5000 -> "$5.000". */
export function formatClp(amount: number): string {
  return clpFormatter.format(amount);
}

@Pipe({ name: 'clp' })
export class ClpPipe implements PipeTransform {
  transform(amount: number): string {
    return formatClp(amount);
  }
}
