package cl.dramapp.backend.summary;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventNotFoundException;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.event.EventResponse;
import cl.dramapp.backend.event.EventStatus;
import cl.dramapp.backend.refund.RefundStatus;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.SaleStatus;
import cl.dramapp.backend.summary.EventSummaryRepository.RefundAggregate;
import cl.dramapp.backend.summary.EventSummaryRepository.SaleAggregate;
import cl.dramapp.backend.summary.EventSummaryRepository.VariantUnitsRow;
import cl.dramapp.backend.summary.EventSummaryResponse.PaymentMethodTotals;
import cl.dramapp.backend.summary.EventSummaryResponse.ProductUnits;
import cl.dramapp.backend.summary.EventSummaryResponse.RefundTotals;
import cl.dramapp.backend.summary.EventSummaryResponse.Totals;
import cl.dramapp.backend.summary.EventSummaryResponse.VariantUnits;
import cl.dramapp.backend.summary.EventSummaryResponse.VoidedByPaymentMethod;
import cl.dramapp.backend.summary.EventSummaryResponse.VoidedTotals;

@Service
public class EventSummaryService {

	/** Fixed display order: Mercado Pago first. */
	private static final List<PaymentMethod> PAYMENT_METHODS = List.of(PaymentMethod.MERCADO_PAGO,
			PaymentMethod.EFECTIVO);

	private final EventRepository eventRepository;

	private final EventSummaryRepository summaryRepository;

	public EventSummaryService(EventRepository eventRepository, EventSummaryRepository summaryRepository) {
		this.eventRepository = eventRepository;
		this.summaryRepository = summaryRepository;
	}

	/**
	 * REPEATABLE_READ gives all aggregation queries one snapshot in PostgreSQL, so a sale or refund registered in
	 * between cannot show up in one part of the summary but not in another.
	 */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public EventSummaryResponse summary(Long eventId) {
		Event event = eventRepository.findById(eventId).orElseThrow(() -> EventNotFoundException.byId(eventId));
		return summaryOf(event);
	}

	/** The open event's summary or, when none is open, the last closed one's. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public EventSummaryResponse latestSummary() {
		Event event = eventRepository.findByStatus(EventStatus.OPEN)
			.or(() -> eventRepository.findFirstByStatusOrderByClosedAtDescIdDesc(EventStatus.CLOSED))
			.orElseThrow(EventNotFoundException::noEvents);
		return summaryOf(event);
	}

	private EventSummaryResponse summaryOf(Event event) {
		List<SaleAggregate> aggregates = summaryRepository.aggregateSales(event.getId());
		RefundTotals refunds = refundTotals(summaryRepository.aggregateRefunds(event.getId()));

		List<PaymentMethodTotals> byPaymentMethod = PAYMENT_METHODS.stream()
			.map(method -> totalsOf(method, aggregates, method == PaymentMethod.EFECTIVO ? refunds.amount() : 0))
			.toList();
		Totals overall = byPaymentMethod.stream()
			.map(totals -> new Totals(totals.salesCount(), totals.sold(), totals.tips(), totals.total(),
					totals.refunds(), totals.expected()))
			.reduce(new Totals(0, 0, 0, 0, 0, 0), (a, b) -> new Totals(a.salesCount() + b.salesCount(),
					Math.addExact(a.sold(), b.sold()), Math.addExact(a.tips(), b.tips()),
					Math.addExact(a.total(), b.total()), Math.addExact(a.refunds(), b.refunds()),
					Math.addExact(a.expected(), b.expected())));

		List<VoidedByPaymentMethod> voidedByMethod = PAYMENT_METHODS.stream()
			.map(method -> voidedOf(method, aggregates))
			.toList();
		VoidedTotals voided = new VoidedTotals(voidedByMethod.stream().mapToLong(VoidedByPaymentMethod::count).sum(),
				voidedByMethod.stream().mapToLong(VoidedByPaymentMethod::amount).reduce(0, Math::addExact),
				voidedByMethod);

		List<ProductUnits> products = productUnits(
				summaryRepository.unitsByVariant(event.getId(), SaleStatus.ACTIVE));

		return new EventSummaryResponse(EventResponse.from(event), byPaymentMethod, overall, voided, refunds,
				products);
	}

	/** expected = total - refunds, where refunds is the active refunds for EFECTIVO and 0 for Mercado Pago. */
	private static PaymentMethodTotals totalsOf(PaymentMethod method, List<SaleAggregate> aggregates, long refunds) {
		return find(SaleStatus.ACTIVE, method, aggregates)
			.map(row -> {
				long total = Math.addExact(row.sold(), row.tips());
				return new PaymentMethodTotals(method, row.salesCount(), row.sold(), row.tips(), total, refunds,
						Math.subtractExact(total, refunds));
			})
			.orElse(new PaymentMethodTotals(method, 0, 0, 0, 0, refunds, -refunds));
	}

	private static RefundTotals refundTotals(List<RefundAggregate> rows) {
		RefundAggregate active = findRefunds(RefundStatus.ACTIVE, rows);
		RefundAggregate voided = findRefunds(RefundStatus.VOIDED, rows);
		return new RefundTotals(active.count(), active.amount(), voided.count(), voided.amount());
	}

	private static RefundAggregate findRefunds(RefundStatus status, List<RefundAggregate> rows) {
		return rows.stream()
			.filter(row -> row.status() == status)
			.findFirst()
			.orElse(new RefundAggregate(status, 0L, 0L));
	}

	private static VoidedByPaymentMethod voidedOf(PaymentMethod method, List<SaleAggregate> aggregates) {
		return find(SaleStatus.VOIDED, method, aggregates)
			.map(row -> new VoidedByPaymentMethod(method, row.salesCount(), Math.addExact(row.sold(), row.tips())))
			.orElse(new VoidedByPaymentMethod(method, 0, 0));
	}

	private static Optional<SaleAggregate> find(SaleStatus status, PaymentMethod method,
			List<SaleAggregate> aggregates) {
		return aggregates.stream()
			.filter(row -> row.status() == status && row.paymentMethod() == method)
			.findFirst();
	}

	/**
	 * Groups the per-variant rows (a few dozen at most) by product. Most units first; ties follow the menu order,
	 * then the name.
	 */
	private static List<ProductUnits> productUnits(List<VariantUnitsRow> rows) {
		Comparator<VariantUnitsRow> variantOrder = Comparator.comparingLong(VariantUnitsRow::units)
			.reversed()
			.thenComparing(VariantUnitsRow::variantSortOrder)
			.thenComparing(VariantUnitsRow::variantName);
		Map<Long, List<VariantUnitsRow>> byProduct = new LinkedHashMap<>();
		rows.stream()
			.sorted(variantOrder)
			.forEach(row -> byProduct.computeIfAbsent(row.productId(), id -> new ArrayList<>()).add(row));

		record Ranked(ProductUnits product, int sortOrder) {
		}
		return byProduct.values().stream()
			.map(variants -> {
				VariantUnitsRow first = variants.getFirst();
				long units = variants.stream().mapToLong(VariantUnitsRow::units).sum();
				List<VariantUnits> variantUnits = variants.stream()
					.map(row -> new VariantUnits(row.variantId(), row.variantName(), row.units()))
					.toList();
				return new Ranked(new ProductUnits(first.productId(), first.productName(), units, variantUnits),
						first.productSortOrder());
			})
			.sorted(Comparator.comparingLong((Ranked ranked) -> ranked.product().units())
				.reversed()
				.thenComparingInt(Ranked::sortOrder)
				.thenComparing(ranked -> ranked.product().productName()))
			.map(Ranked::product)
			.toList();
	}

}
