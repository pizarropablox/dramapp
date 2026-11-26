package cl.dramapp.backend.point;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import cl.dramapp.backend.point.mp.MercadoPagoClient;
import cl.dramapp.backend.point.mp.MpOrder;
import cl.dramapp.backend.point.mp.MpPrint;
import cl.dramapp.backend.point.mp.MpResult;
import cl.dramapp.backend.point.mp.MpResult.NoAnswer;
import cl.dramapp.backend.point.mp.MpResult.Ok;
import cl.dramapp.backend.point.mp.MpResult.Reason;
import cl.dramapp.backend.point.mp.MpResult.Rejected;

/**
 * Mercado Pago as seen with the real Smart (Prueba 0): one order or print per terminal, the same key answers the same
 * order as it was first created, and cancelling on the terminal only takes effect later. Answers can be scripted.
 */
public class FakeMercadoPagoClient implements MercadoPagoClient {

	public static final String BUSY = "already_queued_order_on_terminal";

	/** What happens to the next call that creates something. */
	public enum Failure {

		/** Nothing is created and no answer arrives. */
		LOST,

		/** It is created but the answer is lost. */
		CREATED_BUT_LOST,

		BUSY, KEY_USED, NOT_CONFIGURED, REJECTED

	}

	private record Order(String terminalId, long amount, MpOrder order) {
	}

	private record Print(String terminalId, String content, MpPrint print) {
	}

	private final Map<String, Order> orders = new LinkedHashMap<>();

	private final Map<String, String> orderIdByKey = new HashMap<>();

	private final Map<String, Print> prints = new LinkedHashMap<>();

	private final List<String> calls = new ArrayList<>();

	private final Deque<Failure> orderFailures = new ArrayDeque<>();

	private final Deque<Failure> printFailures = new ArrayDeque<>();

	private boolean down;

	private boolean cancelWorks;

	private int sequence;

	public synchronized void reset() {
		orders.clear();
		orderIdByKey.clear();
		prints.clear();
		calls.clear();
		orderFailures.clear();
		printFailures.clear();
		down = false;
		cancelWorks = true;
	}

	/** Every call from now on gets no answer, reads included. */
	public synchronized void down(boolean down) {
		this.down = down;
	}

	public synchronized void cancelPrintWorks(boolean works) {
		this.cancelWorks = works;
	}

	public synchronized void failNextOrder(Failure failure) {
		orderFailures.add(failure);
	}

	public synchronized void failNextPrint(Failure failure) {
		printFailures.add(failure);
	}

	/** What the Smart did with the order. */
	public synchronized void orderBecomes(String orderId, String status, String detail) {
		Order known = orders.get(orderId);
		String reference = "processed".equals(status) ? "OP-" + orderId : known.order().referenceId();
		orders.put(orderId, new Order(known.terminalId(), known.amount(),
				new MpOrder(orderId, status, detail, known.order().paymentId(), reference)));
	}

	public synchronized void printBecomes(String printId, String status) {
		Print known = prints.get(printId);
		prints.put(printId, new Print(known.terminalId(), known.content(), new MpPrint(printId, status)));
	}

	public synchronized List<String> orderIds() {
		return List.copyOf(orders.keySet());
	}

	public synchronized List<String> printIds() {
		return List.copyOf(prints.keySet());
	}

	public synchronized String printContent(String printId) {
		return prints.get(printId).content();
	}

	public synchronized long orderAmount(String orderId) {
		return orders.get(orderId).amount();
	}

	/** Calls made, in order, e.g. {@code createOrder test-sale-1}. */
	public synchronized List<String> calls() {
		return List.copyOf(calls);
	}

	public synchronized List<String> calls(String name) {
		return calls.stream().filter(call -> call.startsWith(name + " ")).toList();
	}

	@Override
	public synchronized MpResult<MpOrder> createOrder(String key, String terminalId, long amount) {
		record("createOrder " + key);
		if (down) {
			return new NoAnswer<>("down");
		}
		Failure failure = orderFailures.poll();
		MpResult<MpOrder> rejection = rejection(failure);
		if (rejection != null) {
			return rejection;
		}
		String known = orderIdByKey.get(key);
		if (known != null) {
			// As it was first created, whatever happened since.
			return new Ok<>(new MpOrder(known, "created", "created", "PAY-" + known, null));
		}
		if (busy(terminalId)) {
			return new Rejected<>(409, BUSY, Reason.TERMINAL_BUSY);
		}
		String id = "ORD" + ++sequence;
		MpOrder order = new MpOrder(id, "created", "created", "PAY-" + id, null);
		orders.put(id, new Order(terminalId, amount, order));
		orderIdByKey.put(key, id);
		return failure == Failure.CREATED_BUT_LOST ? new NoAnswer<>("lost") : new Ok<>(order);
	}

	@Override
	public synchronized MpResult<MpOrder> getOrder(String orderId) {
		record("getOrder " + orderId);
		return down ? new NoAnswer<>("down") : new Ok<>(orders.get(orderId).order());
	}

	@Override
	public synchronized MpResult<Void> cancelOrder(String orderId) {
		record("cancelOrder " + orderId);
		if (down) {
			return new NoAnswer<>("down");
		}
		return switch (orders.get(orderId).order().status()) {
			case "created" -> {
				orderBecomes(orderId, "canceled", "canceled");
				yield new Ok<>(null);
			}
			case "at_terminal" -> new Ok<>(null);
			default -> new Rejected<>(409, "cannot_cancel_order", Reason.OTHER);
		};
	}

	@Override
	public synchronized MpResult<MpPrint> createPrint(String reference, String terminalId, String content) {
		record("createPrint " + reference);
		if (down) {
			return new NoAnswer<>("down");
		}
		Failure failure = printFailures.poll();
		MpResult<MpPrint> rejection = rejection(failure);
		if (rejection != null) {
			return rejection;
		}
		if (busy(terminalId)) {
			return new Rejected<>(409, BUSY, Reason.TERMINAL_BUSY);
		}
		String id = "ACT" + ++sequence;
		prints.put(id, new Print(terminalId, content, new MpPrint(id, "created")));
		return failure == Failure.CREATED_BUT_LOST ? new NoAnswer<>("lost") : new Ok<>(prints.get(id).print());
	}

	@Override
	public synchronized MpResult<MpPrint> getPrint(String printId) {
		record("getPrint " + printId);
		return down ? new NoAnswer<>("down") : new Ok<>(prints.get(printId).print());
	}

	@Override
	public synchronized MpResult<Void> cancelPrint(String printId) {
		record("cancelPrint " + printId);
		if (down) {
			return new NoAnswer<>("down");
		}
		if (!cancelWorks || !"created".equals(prints.get(printId).print().status())) {
			return new Rejected<>(409, "cannot_cancel_order", Reason.OTHER);
		}
		printBecomes(printId, "canceled");
		return new Ok<>(null);
	}

	private void record(String call) {
		MercadoPagoClient.requireNoTransaction();
		calls.add(call);
	}

	private boolean busy(String terminalId) {
		return orders.values()
			.stream()
			.anyMatch(order -> order.terminalId().equals(terminalId)
					&& List.of("created", "at_terminal", "action_required").contains(order.order().status()))
				|| prints.values()
					.stream()
					.anyMatch(print -> print.terminalId().equals(terminalId)
							&& List.of("created", "on_terminal").contains(print.print().status()));
	}

	private static <T> MpResult<T> rejection(Failure failure) {
		if (failure == null || failure == Failure.CREATED_BUT_LOST) {
			return null;
		}
		return switch (failure) {
			case LOST -> new NoAnswer<>("lost");
			case BUSY -> new Rejected<>(409, BUSY, Reason.TERMINAL_BUSY);
			case KEY_USED -> new Rejected<>(409, "idempotency_key_already_used", Reason.KEY_USED);
			case NOT_CONFIGURED -> new Rejected<>(401, "unauthorized", Reason.NOT_CONFIGURED);
			default -> new Rejected<>(400, "property_value", Reason.OTHER);
		};
	}

}
