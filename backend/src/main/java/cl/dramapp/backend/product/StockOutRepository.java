package cl.dramapp.backend.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import cl.dramapp.backend.event.Event;

public interface StockOutRepository extends JpaRepository<StockOut, Long> {

	/** The marks in force: those of the open event not cleared yet. None without an open event. */
	@Query("""
			select new cl.dramapp.backend.product.StockOutResponse(s.variant.id, s.markedAt)
			from StockOut s
			where s.event.status = cl.dramapp.backend.event.EventStatus.OPEN and s.clearedAt is null
			order by s.variant.id""")
	List<StockOutResponse> findCurrent();

	Optional<StockOut> findByEventAndVariantAndClearedAtIsNull(Event event, ProductVariant variant);

}
