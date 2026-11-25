package cl.dramapp.backend.point;

import org.springframework.stereotype.Component;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventCloseGuard;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleVoidGuard;

/**
 * While an order has no outcome its amount may be alive on a Smart: voiding the sale, or closing the event, would leave
 * a charge nobody follows.
 */
@Component
class PointOrderGuard implements SaleVoidGuard, EventCloseGuard {

	private final PointOrderRepository pointOrderRepository;

	PointOrderGuard(PointOrderRepository pointOrderRepository) {
		this.pointOrderRepository = pointOrderRepository;
	}

	@Override
	public void beforeVoid(Sale sale) {
		pointOrderRepository.findFirstBySaleIdOrderByIdDesc(sale.getId())
			.filter(order -> !order.isSettled())
			.ifPresent(order -> {
				throw PointException.orderOpen(order);
			});
	}

	@Override
	public void beforeClose(Event event) {
		pointOrderRepository.findUnsettledByEvent(event).stream().findFirst().ifPresent(order -> {
			throw PointException.orderOpen(order);
		});
	}

}
