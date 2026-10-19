package cl.dramapp.backend.sale;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import cl.dramapp.backend.event.Event;
import jakarta.persistence.LockModeType;

public interface SaleRepository extends JpaRepository<Sale, Long> {

	/** Locks the sale row (SELECT ... FOR UPDATE) so two phones cannot void it at the same time. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select s from Sale s where s.id = :id")
	Optional<Sale> findByIdForUpdate(Long id);

	List<Sale> findByEventOrderByCreatedAtDescIdDesc(Event event, Limit limit);

	/** Loads the lines with their variant and product in one query, to map sales without N+1. */
	@EntityGraph(attributePaths = "lines.variant.product")
	List<Sale> findWithLinesByIdIn(Collection<Long> ids);

}
