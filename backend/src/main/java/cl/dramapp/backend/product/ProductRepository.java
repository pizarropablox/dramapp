package cl.dramapp.backend.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface ProductRepository extends JpaRepository<Product, Long> {

	List<Product> findByActiveTrueOrderBySortOrderAscIdAsc();

	/** Locks the product row (SELECT ... FOR UPDATE) so two phones cannot deactivate its last two variants at once. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Product p where p.id = :id")
	Optional<Product> findByIdForUpdate(Long id);

	/** Every product, deactivated ones included, with its variants, in menu order. */
	@EntityGraph(attributePaths = "variants")
	List<Product> findAllByOrderBySortOrderAscIdAsc();

	/** Over every product, deactivated ones included: a new one always goes after all of them. */
	@Query("select coalesce(max(p.sortOrder), 0) from Product p")
	int maxSortOrder();

}
