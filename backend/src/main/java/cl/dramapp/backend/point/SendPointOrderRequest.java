package cl.dramapp.backend.point;

import jakarta.validation.constraints.NotBlank;

/** @param cancelPendingVale «Cancelar vale pendiente y cobrar»: always asked for by a person. Optional. */
public record SendPointOrderRequest(@NotBlank(message = "La Point es obligatoria.") String terminalId,
		Boolean cancelPendingVale) {
}
