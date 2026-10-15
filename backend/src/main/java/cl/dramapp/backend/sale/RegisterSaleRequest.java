package cl.dramapp.backend.sale;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

public record RegisterSaleRequest(
		@NotNull(message = "debe indicar el medio de pago") PaymentMethod paymentMethod,
		@NotEmpty(message = "la venta debe tener al menos una línea") List<@NotNull @Valid SaleLineRequest> lines) {
}
