package cl.dramapp.backend.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
		@NotBlank(message = "Ingresa el usuario.") @Size(max = 50, message = "El usuario es demasiado largo.") String username,
		@NotBlank(message = "Ingresa la contraseña.") @Size(max = 200,
				message = "La contraseña es demasiado larga.") String password) {
}
