package cl.dramapp.backend.point;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
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
import cl.dramapp.backend.vale.ValeService;

/**
 * Charges registered sales on a Point Smart (DRAMA-71). Mercado Pago is never called inside a transaction: one stores
 * what is about to be asked, another stores the answer. The sale is always locked before its order.
 */
@Service
public class PointOrderService {

	private static final String EXPIRED = "expired";

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

	private final ValeService valeService;

	private final TransactionTemplate transaction;

	public PointOrderService(PointOrderRepository pointOrderRepository, SaleRepository saleRepository,
			MercadoPagoClient mercadoPago, PointProperties properties, ValeService valeService,
			TransactionTemplate transaction) {
		this.pointOrderRepository = pointOrderRepository;
		this.saleRepository = saleRepository;
		this.mercadoPago = mercadoPago;
		this.properties = properties;
		this.valeService = valeService;
		this.transaction = transaction;
	}

	/**
	 * Sends the sale to a Smart, or answers the order it already has. A lost answer is asked again with the same key,
	 * so it never charges twice. Nothing is sent while a vale is on its way in that Smart: it would be refused.
	 *
	 * @param cancelPendingVale cancels the vale that keeps the Smart from charging
	 */
	public Sent send(Long saleId, String terminalId, boolean cancelPendingVale, String username) {
		Terminal terminal = properties.terminal(terminalId).orElseThrow(PointException::unknownTerminal);
		if (needsNewOrder(saleId)) {
			if (cancelPendingVale) {
				valeService.clearTerminal(terminalId);
			}
			else {
				valeService.saleHolding(terminalId).ifPresent(holding -> {
					throw PointException.printing(holding);
				});
			}
		}
		Attempt attempt = reserve(saleId, terminal, username);
		if (!attempt.call()) {
			return new Sent(read(saleId), false);
		}
		return new Sent(dispatch(saleId, attempt), true);
	}

	private PointOrderResponse dispatch(Long saleId, Attempt attempt) {
		MpResult<MpOrder> result = mercadoPago.createOrder(attempt.key(), attempt.terminalId(), attempt.amount());
		return switch (result) {
			case Ok<MpOrder>(MpOrder created) ->
				store(saleId, attempt.orderId(), attempt.first() ? created : current(created));
			case NoAnswer<MpOrder> lost -> {
				endWithoutAnswer(saleId, attempt);
				throw PointException.unavailable();
			}
			case Rejected<MpOrder> rejected -> throw rejected(saleId, attempt, rejected);
		};
	}

	/** A cash sale is paid when the cashier says so; a card one, when its order was. */
	public boolean isPaid(Long saleId) {
		return transaction.execute(status -> {
			Sale sale = saleRepository.findById(saleId).orElseThrow(() -> new SaleNotFoundException(saleId));
			return sale.getPaymentMethod() != PaymentMethod.MERCADO_PAGO
					|| pointOrderRepository.findFirstBySaleIdOrderByIdDesc(saleId)
						.filter(order -> order.getState() == PointOrderState.PAID)
						.isPresent();
		});
	}

	private boolean needsNewOrder(Long saleId) {
		return transaction.execute(status -> {
			requireChargeable(saleRepository.findById(saleId).orElseThrow(() -> new SaleNotFoundException(saleId)));
			return pointOrderRepository.findFirstBySaleIdOrderByIdDesc(saleId)
				.filter(order -> !order.isSettled() || order.getState() == PointOrderState.PAID)
				.isEmpty();
		});
	}

	/** Asks Mercado Pago for the sale's order and stores what it says. */
	public PointOrderResponse follow(Long saleId) {
		PointOrder order = latest(saleId);
		if (order.getState() == PointOrderState.PAID) {
			valeService.refreshLatest(saleId);
		}
		if (order.getMpOrderId() == null || order.isPaidInMercadoPago()) {
			return read(saleId);
		}
		return ask(saleId, order);
	}

	private PointOrderResponse ask(Long saleId, PointOrder order) {
		return switch (mercadoPago.getOrder(order.getMpOrderId())) {
			case Ok<MpOrder>(MpOrder current) -> store(saleId, order.getId(), current);
			case Rejected<MpOrder> rejected when rejected.reason() == Reason.NOT_CONFIGURED ->
				throw PointException.notConfigured();
			default -> throw PointException.unavailable();
		};
	}

	/**
	 * «Volver al carrito». Without an order nothing can be charged, so the sale is voided at once. Otherwise Mercado
	 * Pago is asked to cancel, and the sale is voided only when it says so: it may have been paid meanwhile.
	 */
	public PointOrderResponse cancel(Long saleId) {
		Optional<Attempt> attempt = transaction.execute(status -> requestCancel(saleId));
		if (attempt.isEmpty()) {
			return read(saleId);
		}
		if (attempt.get().call()) {
			// An answer was lost: the order can only be canceled knowing its id.
			dispatch(saleId, attempt.get());
		}
		PointOrder order = latest(saleId);
		if (order.isSettled() || order.getMpOrderId() == null) {
			return read(saleId);
		}
		if (mercadoPago.cancelOrder(order.getMpOrderId()) instanceof NoAnswer) {
			throw PointException.unavailable();
		}
		// Refused or accepted, only its status tells.
		PointOrderResponse current = ask(saleId, order);
		if (current.state() == PointOrderState.ATTENTION) {
			throw PointException.cannotCancel();
		}
		return current;
	}

	/** Empty when there is nothing to ask Mercado Pago. */
	private Optional<Attempt> requestCancel(Long saleId) {
		Sale sale = lockSale(saleId);
		Optional<PointOrder> latest = pointOrderRepository.findFirstBySaleIdOrderByIdDesc(saleId);
		if (latest.isEmpty() || latest.get().getState() == PointOrderState.NOT_SENT) {
			if (!sale.isVoided()) {
				requireChargeable(sale);
				sale.voidSale(PointOrder.VOIDED_BACK_TO_CART);
			}
			return Optional.empty();
		}
		if (latest.get().isSettled()) {
			return Optional.empty();
		}
		latest.get().requestCancel();
		return Optional.of(again(latest.get()));
	}

	/**
	 * Closes by hand, with what the Smart shows, an order without an outcome: it needs attention, Mercado Pago does not
	 * answer, or it is not known whether it exists. Never while it can still be followed.
	 */
	public PointOrderResponse closeByHand(Long saleId, PointOrderOutcome outcome, String username) {
		PointOrder order = latest(saleId);
		if (order.isBeingSent()) {
			throw PointException.notClosable();
		}
		if (!order.isSettled() && order.getMpOrderId() != null
				&& mercadoPago.getOrder(order.getMpOrderId()) instanceof Ok<MpOrder>(MpOrder current)) {
			PointOrderState state = store(saleId, order.getId(), current).state();
			if (state == PointOrderState.SENT || state == PointOrderState.WAITING
					|| state == PointOrderState.CANCELING) {
				throw PointException.notClosable();
			}
		}
		return update(saleId, order.getId(), locked -> {
			if (!locked.isSettled()) {
				locked.closeByHand(outcome, username);
			}
		});
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
			.or(() -> valeService.saleStuckOn(terminalId).map(PointException::busyWithVale))
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
		AtomicBoolean justExpired = new AtomicBoolean();
		PointOrderResponse stored = update(saleId, orderId, order -> {
			justExpired.set(EXPIRED.equals(answer.status()) && !order.isSettled());
			order.record(answer);
		});
		if (justExpired.get()) {
			// The Smart keeps showing the amount. Best effort: it may well be refused.
			mercadoPago.cancelOrder(answer.id());
		}
		return stored;
	}

	private PointOrderResponse update(Long saleId, Long orderId, Consumer<PointOrder> change) {
		Optional<ValeService.Prepared> vale = transaction.execute(status -> {
			Sale sale = lockSale(saleId);
			PointOrder order = pointOrderRepository.findByIdForUpdate(orderId).orElseThrow();
			boolean wasPaid = order.getState() == PointOrderState.PAID;
			change.accept(order);
			settle(sale, order);
			pointOrderRepository.saveAndFlush(order);
			// Only the one that sees it become paid, so asking again never prints again.
			return !wasPaid && order.isJustCharged() && !sale.isVoided()
					? valeService.prepareOriginal(sale, order.getTerminalId(), order.getCreatedBy()) : Optional.empty();
		});
		vale.ifPresent(valeService::send);
		return read(saleId);
	}

	/** What an outcome means for the sale. It is voided only when nothing was charged. */
	private static void settle(Sale sale, PointOrder order) {
		if (order.isPaidInMercadoPago()) {
			if (sale.isVoided()) {
				order.markPaidOnVoidedSale();
			}
		}
		else if (order.getState() == PointOrderState.CANCELED && !sale.isVoided()) {
			sale.voidSale(order.voidReason());
		}
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
		return transaction.execute(status -> pointOrderRepository.findFirstBySaleIdOrderByIdDesc(saleId)
			.map(this::response)
			.orElseGet(() -> PointOrderResponse.withoutOrder(lockSale(saleId))));
	}

	private Sale lockSale(Long saleId) {
		return saleRepository.findByIdForUpdate(saleId).orElseThrow(() -> new SaleNotFoundException(saleId));
	}

	private PointOrderResponse response(PointOrder order) {
		return PointOrderResponse.from(order, terminalName(order.getTerminalId()),
				valeService.describe(order.getSale().getId()).orElse(null));
	}

	private String terminalName(String terminalId) {
		return properties.terminal(terminalId).map(Terminal::name).orElse(terminalId);
	}

}
