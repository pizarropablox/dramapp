package cl.dramapp.backend.summary;

import java.util.List;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import cl.dramapp.backend.refund.RefundStatus;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleStatus;

/** Aggregation queries for an event's summary: the database adds up, no sale is loaded into memory. */
interface EventSummaryRepository extends Repository<Sale, Long> {

	/** One row per status and payment method that has sales (at most 4 rows). */
	record SaleAggregate(SaleStatus status, PaymentMethod paymentMethod, Long salesCount, Long sold, Long tips) {
	}

	/** One row per refund status that has refunds (at most 2 rows). */
	record RefundAggregate(RefundStatus status, Long count, Long amount) {
	}

	/** Units sold of one variant, with what is needed to group and order by product. */
	record VariantUnitsRow(Long productId, String productName, Integer productSortOrder, Long variantId,
			String variantName, Integer variantSortOrder, Long units) {
	}

	@Query("""
			select new cl.dramapp.backend.summary.EventSummaryRepository$SaleAggregate(
			    s.status, s.paymentMethod, count(s), sum(s.subtotal), sum(s.tip))
			from Sale s
			where s.event.id = :eventId
			group by s.status, s.paymentMethod""")
	List<SaleAggregate> aggregateSales(Long eventId);

	@Query("""
			select new cl.dramapp.backend.summary.EventSummaryRepository$RefundAggregate(
			    r.status, count(r), sum(r.amount))
			from Refund r
			where r.event.id = :eventId
			group by r.status""")
	List<RefundAggregate> aggregateRefunds(Long eventId);

	@Query("""
			select new cl.dramapp.backend.summary.EventSummaryRepository$VariantUnitsRow(
			    p.id, p.name, p.sortOrder, v.id, v.name, v.sortOrder, sum(l.quantity))
			from SaleLine l
			join l.sale s
			join l.variant v
			join v.product p
			where s.event.id = :eventId and s.status = :status
			group by p.id, p.name, p.sortOrder, v.id, v.name, v.sortOrder""")
	List<VariantUnitsRow> unitsByVariant(Long eventId, SaleStatus status);

}
