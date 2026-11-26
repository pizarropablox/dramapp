package cl.dramapp.backend.vale;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ValePrintRepository extends JpaRepository<ValePrint, Long> {

	List<ValePrint> findBySaleIdOrderById(Long saleId);

	/** The last one that may have put paper on the Smart. */
	Optional<ValePrint> findFirstByTerminalIdAndErrorIsNullOrderByIdDesc(String terminalId);

}
