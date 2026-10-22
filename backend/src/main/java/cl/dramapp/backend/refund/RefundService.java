package cl.dramapp.backend.refund;

import java.util.List;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.event.EventStatus;
import cl.dramapp.backend.sale.NoOpenEventException;

@Service
public class RefundService {

	/** Recent refunds listed when no limit is given, like the recent sales. */
	public static final int DEFAULT_RECENT_LIMIT = 30;

	public static final int MAX_RECENT_LIMIT = 100;

	private final EventRepository eventRepository;

	private final RefundRepository refundRepository;

	public RefundService(EventRepository eventRepository, RefundRepository refundRepository) {
		this.eventRepository = eventRepository;
		this.refundRepository = refundRepository;
	}

	/** Records cash given back from the till in the open event. */
	@Transactional
	public RefundResponse create(CreateRefundRequest request) {
		Event event = eventRepository.findByStatus(EventStatus.OPEN)
			.orElseThrow(() -> new NoOpenEventException(
					"No hay un evento abierto. Abre un evento antes de registrar devoluciones."));
		return RefundResponse.from(refundRepository.save(new Refund(event, request.amount(), request.reason())));
	}

	/** Latest refunds of the open event, newest first, voided ones included. Empty when no event is open. */
	@Transactional(readOnly = true)
	public List<RefundResponse> recent(int limit) {
		return eventRepository.findByStatus(EventStatus.OPEN)
			.map(event -> refundRepository.findByEventOrderByCreatedAtDescIdDesc(event, Limit.of(limit))
				.stream()
				.map(RefundResponse::from)
				.toList())
			.orElseGet(List::of);
	}

	/**
	 * Voids a refund of the open event entered by mistake, keeping it stored with the time it was voided.
	 * Checks, in order: the refund exists (404), its event is open (409), it is not voided yet (409).
	 */
	@Transactional
	public RefundResponse voidRefund(Long id) {
		Refund refund = refundRepository.findByIdForUpdate(id).orElseThrow(() -> new RefundNotFoundException(id));
		Event event = refund.getEvent();
		if (event.getStatus() != EventStatus.OPEN) {
			throw new RefundEventClosedException(event);
		}
		if (refund.isVoided()) {
			throw new RefundAlreadyVoidedException(refund);
		}
		refund.voidRefund();
		return RefundResponse.from(refundRepository.saveAndFlush(refund));
	}

}
