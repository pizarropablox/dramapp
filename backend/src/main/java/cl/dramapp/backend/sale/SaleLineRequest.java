package cl.dramapp.backend.sale;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record SaleLineRequest(
		@NotNull(message = "debe indicar la variante") Long variantId,
		@NotNull(message = "debe indicar la cantidad") @Positive(message = "la cantidad debe ser mayor que 0") Integer quantity) {
}
