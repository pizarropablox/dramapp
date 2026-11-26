package cl.dramapp.backend.point.mp;

/**
 * What the app keeps of a Mercado Pago order. The card is never read.
 *
 * @param paymentId its payment
 * @param referenceId the operation number, as in Mercado Pago's panel; null until it is paid
 */
public record MpOrder(String id, String status, String statusDetail, String paymentId, String referenceId) {
}
