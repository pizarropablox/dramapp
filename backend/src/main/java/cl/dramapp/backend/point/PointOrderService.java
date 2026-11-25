package cl.dramapp.backend.point;

import java.util.Optional;
import java.util.function.Consumer;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import cl.dramapp.backend.event.EventStatus;
import cl.dramapp.backend.point.PointProperties.Terminal;
import cl.dramapp.backend.point.mp.MercadoPagoClient;
import cl.dramapp.backend.point.mp.MpOrder;
import cl.dramapp.backend.point.mp.MpResult;
import cl.dramapp.backend.point.mp.MpResult.NoAnswer;
import cl.dramapp.backend.point.mp.MpResult.Ok;
import cl.dramapp.backend.point.mp.MpResult.Reason;
import cl.dramapp.backend.point.mp.MpResult.Rejected;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleNotFoundException;
import cl.dramapp.backend.sale.SaleRepository;

/**
 * Charges registered sales on a Point Smart (DRAMA-71). Mercado Pago is never called inside a transaction: one stores
 * what is about to be asked, another stores the answer. The sale is always locked before its order.
 */
@Service
public class PointOrderService {

	/** @param created whether a new order was sent */
	public record Sent(PointOrderResponse order, boolean created) {
	}

	/**
	 * @param call whether Mercado Pago must be called: not when the sale already has a live order
	 * @param first false when this key was sent before and its answer was lost
	 */
	private record Attempt(Long orderId, boolean call, boolean first, String key, String terminalId, long amount) {

		static Attempt of(PointOrder order, boolean call, boolean first) {
			return new Attempt(order.getId(), call, first, order.getIdempotencyKey(), order.getTerminalId(),
					order.getAmount());
		}

	}

	private final PointOrderRepository pointOrderRepository;

	private final SaleRepository saleRepository;

	private final MercadoPagoClient mercadoPago;

	private final PointProperties properties;

	private final TransactionTemplate transaction;

	public PointOrderService(PointOrderRepository pointOrderRepository, SaleRepository saleRepository,
			MercadoPagoClient mercadoPago, PointProperties properties, TransactionTemplate transaction) {
		this.pointOrderRepository = pointOrderRepository;
		this.saleRepository = saleRepository;
		this.mercadoPago = mercadoPago;
		this.properties = properties;
		this.transaction = transaction;
	}

	/**
	 * Sends the sale to a Smart, or answers the order it already has. A lost answer is asked again with the same key,
	 * so it never charges twice.
	 */
	public Sent send(Long saleId, String terminalId, String username) {
		Terminal terminal = properties.terminal(terminalId).orElseThrow(PointException::unknownTerminal);
		Attempt attempt = reserve(saleId, terminal, username);
		if (!attempt.call()) {
			return new Sent(read(saleId), false);
		}
		MpResult<MpOrder> result = mercadoPago.createOrder(attempt.key(), attempt.terminalId(), attempt.amount());
		return switch (result) {
			case Ok<MpOrder>(MpOrder created) -> new Sent(store(saleId, attempt.orderId(),
					attempt.first() ? created : current(created)), true);
			case NoAnswer<MpOrder> lost -> {
				endWithoutAnswer(saleId, attempt);
				throw PointException.unavailable();
			}
			case Rejected<MpOrder> rejected -> throw rejected(saleId, attempt, rejected);
		};
	}

	/** Asks Mercado Pago for the sale's order and stores what it says. */
	public PointOrderResponse follow(Long saleId) {
		PointOrder order = latest(saleId);
		if (order.getMpOrderId() == null || order.isPaidInMercadoPago()) {
			return read(saleId);
		}
		return switch (mercadoPago.getOrder(order.getMpOrderId())) {
			case Ok<MpOrder>(MpOrder current) -> store(saleId, order.getId(), current);
			case Rejected<MpOrder> rejected when rejected.reason() == Reason.NOT_CONFIGURED ->
				throw PointException.notConfigured();
			default -> throw PointException.unavailable();
		};
	}

	/** Stores what is about to be sent before sending it, so a lost answer never leaves an unknown charge. */
	private Attempt reserve(Long saleId, Terminal terminal, String username) {
		try {
			return transaction.execute(status -> {
				Sale sale = lockSale(saleId);
				requireChargeable(sale);
				Optional<PointOrder> latest = pointOrderRepository.findFirstBySaleIdOrderByIdDesc(saleId);
				if (latest.isPresent() && !latest.get().isSettled()) {
					return again(latest.get());
				}
				if (latest.isPresent() && latest.get().getState() == PointOrderState.PAID) {
					return Attempt.of(latest.get(), false, false);
				}
				pointOrderRepository.findOpenByTerminalId(terminal.id()).ifPresent(open -> {
					throw PointException.busy(open, terminal.name());
				});
				PointOrder order = new PointOrder(sale, terminal.id(), nextKey(saleId), username);
				return Attempt.of(pointOrderRepository.saveAndFlush(order), true, true);
			});
		}
		catch (DataIntegrityViolationException ex) {
			// Two phones at once: ux_point_order_open let only one of them have the terminal.
			throw busy(terminal.id());
		}
	}

	/** The sale has an order without an outcome: only a lost answer is asked again, and never twice at once. */
	private static Attempt again(PointOrder order) {
		boolean call = order.isUncertain() && !order.isBeingSent();
		if (call) {
			order.startAttempt();
		}
		return Attempt.of(order, call, false);
	}

	private static void requireChargeable(Sale sale) {
		if (sale.isVoided()) {
			throw PointException.notChargeable(sale, "está anulada");
		}
		if (sale.getPaymentMethod() != PaymentMethod.MERCADO_PAGO) {
			throw PointException.notChargeable(sale, "no es con Mercado Pago");
		}
		if (sale.getEvent().getStatus() != EventStatus.OPEN) {
			throw PointException.notChargeable(sale, "su evento está cerrado");
		}
	}

	/** {@code prod-sale-182}, and {@code prod-sale-182-2} once the first one ended without charging. */
	private String nextKey(Long saleId) {
		long previous = pointOrderRepository.countBySaleId(saleId);
		String key = properties.keyPrefix() + "-sale-" + saleId;
		return previous == 0 ? key : key + "-" + (previous + 1);
	}

	/**
	 * Only a rejection of the first call proves that there is no order. After a lost answer it proves nothing: the
	 * terminal may be busy with this very order. A used key does not prove it either.
	 */
	private PointException rejected(Long saleId, Attempt attempt, Rejected<MpOrder> rejected) {
		if (!attempt.first() || rejected.reason() == Reason.KEY_USED) {
			endWithoutAnswer(saleId, attempt);
			return PointException.uncertain();
		}
		update(saleId, attempt.orderId(), order -> order.rejectCreation(rejected.code()));
		return switch (rejected.reason()) {
			case TERMINAL_BUSY -> busy(attempt.terminalId());
			case NOT_CONFIGURED -> PointException.notConfigured();
			default -> PointException.rejected(rejected.code());
		};
	}

	private PointException busy(String terminalId) {
		return transaction.execute(status -> pointOrderRepository.findOpenByTerminalId(terminalId)
			.map(open -> PointException.busy(open, terminalName(terminalId)))
			.orElseGet(PointException::busyUnknown));
	}

	/** Repeating a key answers the order as it was first created: its current status is asked apart. */
	private MpOrder current(MpOrder created) {
		return mercadoPago.getOrder(created.id()) instanceof Ok<MpOrder>(MpOrder current) ? current : created;
	}

	private void endWithoutAnswer(Long saleId, Attempt attempt) {
		update(saleId, attempt.orderId(), PointOrder::endAttemptWithoutAnswer);
	}

	private PointOrderResponse store(Long saleId, Long orderId, MpOrder answer) {
		return update(saleId, orderId, order -> order.record(answer));
	}

	private PointOrderResponse update(Long saleId, Long orderId, Consumer<PointOrder> change) {
		return transaction.execute(status -> {
			lockSale(saleId);
			PointOrder order = pointOrderRepository.findByIdForUpdate(orderId).orElseThrow();
			change.accept(order);
			return response(pointOrderRepository.saveAndFlush(order));
		});
	}

	private PointOrder latest(Long saleId) {
		return transaction.execute(status -> {
			if (!saleRepository.existsById(saleId)) {
				throw new SaleNotFoundException(saleId);
			}
			return pointOrderRepository.findFirstBySaleIdOrderByIdDesc(saleId)
				.orElseThrow(() -> PointException.orderNotFound(saleId));
		});
	}

	private PointOrderResponse read(Long saleId) {
		return transaction.execute(status -> response(latest(saleId)));
	}

	private Sale lockSale(Long saleId) {
		return saleRepository.findByIdForUpdate(saleId).orElseThrow(() -> new SaleNotFoundException(saleId));
	}

	private PointOrderResponse response(PointOrder order) {
		return PointOrderResponse.from(order, terminalName(order.getTerminalId()));
	}

	private String terminalName(String terminalId) {
		return properties.terminal(terminalId).map(Terminal::name).orElse(terminalId);
	}

}
