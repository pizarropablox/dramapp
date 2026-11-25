package cl.dramapp.backend.point;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/sales/{id}/point-order")
public class PointOrderController {

	private final PointOrderService pointOrderService;

	public PointOrderController(PointOrderService pointOrderService) {
		this.pointOrderService = pointOrderService;
	}

	/** 201 when it sends a new order; 200 when the sale already had one. Repeating it never charges twice. */
	@PostMapping
	public ResponseEntity<PointOrderResponse> send(@PathVariable Long id,
			@Valid @RequestBody SendPointOrderRequest request, Authentication authentication) {
		PointOrderService.Sent sent = pointOrderService.send(id, request.terminalId(), authentication.getName());
		return ResponseEntity.status(sent.created() ? HttpStatus.CREATED : HttpStatus.OK).body(sent.order());
	}

	/** Asks Mercado Pago and stores what it says: the phones poll this while they are visible. */
	@GetMapping
	public PointOrderResponse follow(@PathVariable Long id) {
		return pointOrderService.follow(id);
	}

}
