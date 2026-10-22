package cl.dramapp.backend.refund;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** Body of a new refund: the cash given back from the till and why (both required). */
public record CreateRefundRequest(
		@NotNull(message = "El monto es obligatorio.") @Positive(message = "El monto debe ser mayor que $0.")
		@Max(value = Refund.MAX_AMOUNT, message = "La devolución no puede superar $100.000.") Long amount,
		@NotBlank(message = "El motivo es obligatorio.")
		@Size(max = Refund.MAX_REASON_LENGTH, message = "El motivo no puede superar los 100 caracteres.") String reason) {
}
