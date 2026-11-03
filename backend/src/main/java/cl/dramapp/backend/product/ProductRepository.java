package cl.dramapp.backend.product;

import java.util.List;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProductRepository extends JpaRepository<Product, Long> {

	List<Product> findByActiveTrueOrderBySortOrderAscIdAsc();

	/** Every product, deactivated ones included, with its variants, in menu order. */
	@EntityGraph(attributePaths = "variants")
	List<Product> findAllByOrderBySortOrderAscIdAsc();

	/** Over every product, deactivated ones included: a new one always goes after all of them. */
	@Query("select coalesce(max(p.sortOrder), 0) from Product p")
	int maxSortOrder();

}
