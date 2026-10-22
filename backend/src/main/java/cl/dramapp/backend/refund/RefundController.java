package cl.dramapp.backend.refund;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@RestController
@RequestMapping("/api/refunds")
public class RefundController {

	private final RefundService refundService;

	public RefundController(RefundService refundService) {
		this.refundService = refundService;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public RefundResponse create(@Valid @RequestBody CreateRefundRequest request) {
		return refundService.create(request);
	}

	/** Latest refunds of the open event, newest first, voided ones included. Empty when no event is open. */
	@GetMapping
	public List<RefundResponse> recent(@RequestParam(defaultValue = "" + RefundService.DEFAULT_RECENT_LIMIT)
	@Min(value = 1, message = "El límite debe ser al menos 1.")
	@Max(value = RefundService.MAX_RECENT_LIMIT, message = "El límite no puede superar 100.") int limit) {
		return refundService.recent(limit);
	}

	/** POST, not DELETE: voiding keeps the refund. */
	@PostMapping("/{id}/void")
	public RefundResponse voidRefund(@PathVariable Long id) {
		return refundService.voidRefund(id);
	}

}
