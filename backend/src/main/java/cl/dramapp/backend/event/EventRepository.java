package cl.dramapp.backend.event;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, Long> {

	Optional<Event> findByStatus(EventStatus status);

}
