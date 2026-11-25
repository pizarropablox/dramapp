package cl.dramapp.backend.point;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import cl.dramapp.backend.event.Event;
import jakarta.persistence.LockModeType;

public interface PointOrderRepository extends JpaRepository<PointOrder, Long> {

	/** Lock the sale first, always: every other place does. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select o from PointOrder o where o.id = :id")
	Optional<PointOrder> findByIdForUpdate(Long id);

	Optional<PointOrder> findFirstBySaleIdOrderByIdDesc(Long saleId);

	long countBySaleId(Long saleId);

	/** Orders of an event that neither Mercado Pago nor the bar, by hand, has given an outcome for. */
	@Query("""
			select o from PointOrder o
			where o.sale.event = :event and o.resolvedAt is null and o.creationError is null
			and (o.status is null or o.status not in ('processed', 'canceled', 'expired', 'failed', 'refunded'))
			order by o.id""")
	List<PointOrder> findUnsettledByEvent(Event event);

	/** The order holding a terminal, as in the ux_point_order_open index. */
	@Query("""
			select o from PointOrder o
			where o.terminalId = :terminalId and o.resolvedAt is null and o.creationError is null
			and (o.status is null or o.status in ('created', 'at_terminal', 'action_required'))""")
	Optional<PointOrder> findOpenByTerminalId(String terminalId);

}
