import { PointOrderResponse, ValeResponse } from './point';

/** What the bar reads while charging with a Smart, in one place so the words can be changed quickly. */
export const POINT_TEXTS = {
  notReached: 'La Point no ha recibido el cobro. ¿Está prendida y con señal?',
  attention: 'La Point necesita atención: mira su pantalla',
  notConfigured: 'La Point no está configurada. Avisa al admin',
  notResponding: 'La Point no responde. Puedes volver al carrito y cobrar con una Point Mini',
  uncertain: 'No se sabe si el cobro llegó a la Point. Mira su pantalla',
  waitingVale: 'Esperando que termine el vale…',
  busyVale: 'Toca “Actualizar” en la Point; si el vale sale, reintenta',
  busyUnknown: 'Si la Point muestra un cobro, cancélalo con la flecha atrás y reintenta',
  expired: 'El cobro venció. Si la Point todavía muestra el monto, toca la flecha atrás',
  cancelFailed: 'Si la Point todavía muestra el monto, toca la flecha atrás',
  similarCharge: 'Si la Point pregunta por un cobro similar, toca “Continuar con cobro”',
  closeScreen: 'Toca “Ir al inicio” en la Point',
  didItComeOut: '¿Salió el vale?',
  mayBeDouble: 'Puede salir doble, quédate con uno',
  busy: 'La Point está ocupada',
  valeUnknown: 'No se sabe si salió el vale. Mira la Point',
} as const;

/** On its way for this long, the bar is asked whether it came out. */
export const VALE_OVERDUE_S = 45;

/** How the vale is going. */
export function valeText(vale: ValeResponse | null): string {
  switch (vale?.state) {
    case 'PRINTED':
      return 'Vale impreso ✓';
    case 'REJECTED':
      return vale.busy
        ? 'La Point está ocupada: el vale no salió'
        : 'Mercado Pago no aceptó el vale: no salió';
    case 'GONE':
    case 'UNKNOWN':
      return POINT_TEXTS.didItComeOut;
    default:
      return 'Imprimiendo vale…';
  }
}

/** Why the order is back in the cart. */
export function backToCartNotice(
  order: PointOrderResponse | null,
  removed: readonly string[],
): string {
  const reason = order?.voidReason ?? 'Venta no cobrada';
  const back = `${reason}. El pedido volvió al carrito.`;
  return removed.length === 0 ? back : `${back} Ya no está en la carta: ${removed.join(', ')}.`;
}

/** 25 -> "0:25". */
export function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
