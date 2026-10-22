package cl.dramapp.backend.refund;

import java.time.Instant;

/** amount is the cash given back from the till. voidedAt is null unless status is VOIDED. */
public record RefundResponse(Long id, Long eventId, long amount, String reason, RefundStatus status,
		Instant createdAt, Instant voidedAt) {

	static RefundResponse from(Refund refund) {
		return new RefundResponse(refund.getId(), refund.getEvent().getId(), refund.getAmount(), refund.getReason(),
				refund.getStatus(), refund.getCreatedAt(), refund.getVoidedAt());
	}

}
