package cl.dramapp.backend.sale;

import jakarta.validation.constraints.Size;

/** Body of a void request; the whole body and the reason are optional. */
public record VoidSaleRequest(
		@Size(max = Sale.MAX_VOID_REASON_LENGTH, message = "El motivo no puede superar los 100 caracteres.") String reason) {
}
