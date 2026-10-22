package cl.dramapp.backend.refund;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import cl.dramapp.backend.event.Event;
import jakarta.persistence.LockModeType;

public interface RefundRepository extends JpaRepository<Refund, Long> {

	/** Locks the refund row (SELECT ... FOR UPDATE) so two phones cannot void it at the same time. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select r from Refund r where r.id = :id")
	Optional<Refund> findByIdForUpdate(Long id);

	List<Refund> findByEventOrderByCreatedAtDescIdDesc(Event event, Limit limit);

}
