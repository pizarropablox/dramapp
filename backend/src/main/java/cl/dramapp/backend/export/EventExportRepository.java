package cl.dramapp.backend.export;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import cl.dramapp.backend.refund.Refund;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleStatus;

/** Everything an event's export lists, oldest first. A night has a few hundred sales: plain lists are fine. */
interface EventExportRepository extends Repository<Sale, Long> {

	/** One sale line with its sale and its product, prices as charged (snapshot). */
	record LineRow(Long saleId, Instant saleCreatedAt, PaymentMethod paymentMethod, SaleStatus saleStatus,
			Long lineId, Long productId, String productName, Integer productSortOrder, Long variantId,
			String variantName, Integer variantSortOrder, Integer quantity, Long unitPrice, Integer promoQuantity,
			Long promoPrice) {
	}

	@Query("select s from Sale s where s.event.id = :eventId order by s.createdAt, s.id")
	List<Sale> sales(Long eventId);

	@Query("""
			select new cl.dramapp.backend.export.EventExportRepository$LineRow(
			    s.id, s.createdAt, s.paymentMethod, s.status, l.id, p.id, p.name, p.sortOrder, v.id, v.name,
			    v.sortOrder, l.quantity, l.unitPrice, l.promoQuantity, l.promoPrice)
			from SaleLine l
			join l.sale s
			join l.variant v
			join v.product p
			where s.event.id = :eventId
			order by s.createdAt, s.id, l.id""")
	List<LineRow> lines(Long eventId);

	@Query("select r from Refund r where r.event.id = :eventId order by r.createdAt, r.id")
	List<Refund> refunds(Long eventId);

}
