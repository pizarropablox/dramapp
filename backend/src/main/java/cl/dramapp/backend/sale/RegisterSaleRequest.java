package cl.dramapp.backend.sale;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/** A sale to register. The tip is optional (0 when missing) and is charged with the same payment method. */
public record RegisterSaleRequest(
		@NotNull(message = "debe indicar el medio de pago") PaymentMethod paymentMethod,
		@NotEmpty(message = "la venta debe tener al menos una línea") List<@NotNull @Valid SaleLineRequest> lines,
		@PositiveOrZero(message = "La propina no puede ser negativa.")
		@Max(value = Sale.MAX_TIP, message = "La propina no puede superar $10.000.") Long tipAmount) {

	public RegisterSaleRequest {
		if (tipAmount == null) {
			tipAmount = 0L;
		}
	}

}
