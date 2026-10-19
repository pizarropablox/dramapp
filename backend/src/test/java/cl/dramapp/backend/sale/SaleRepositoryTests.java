package cl.dramapp.backend.sale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.PostgresIntegrationTest;
import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.product.Product;
import cl.dramapp.backend.product.ProductRepository;
import cl.dramapp.backend.product.ProductVariant;
import jakarta.persistence.EntityManager;

@SpringBootTest
@Transactional
class SaleRepositoryTests extends PostgresIntegrationTest {

	@Autowired
	private SaleRepository saleRepository;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	void savesAndReadsASaleWithLines() {
		Event event = eventRepository.save(new Event("DRAMA Octubre", LocalDate.of(2026, 10, 24)));
		Product whiskey = new Product("Test Whiskey", 5000, 3, 12000L, 1);
		ProductVariant original = whiskey.addVariant("Original", 1);
		ProductVariant honey = whiskey.addVariant("Honey", 2);
		Product beer = new Product("Test Beer", 2500, 2);
		ProductVariant beerSingle = beer.addVariant("Única", 1);
		productRepository.saveAll(List.of(whiskey, beer));

		Sale sale = new Sale(event, PaymentMethod.MERCADO_PAGO, 14500, 1000);
		sale.addLine(original, 2);
		sale.addLine(honey, 1);
		sale.addLine(beerSingle, 1);
		Sale saved = saleRepository.saveAndFlush(sale);
		entityManager.clear();

		Sale found = saleRepository.findById(saved.getId()).orElseThrow();

		assertThat(found.getEvent().getId()).isEqualTo(event.getId());
		assertThat(found.getPaymentMethod()).isEqualTo(PaymentMethod.MERCADO_PAGO);
		assertThat(found.getSubtotal()).isEqualTo(14500);
		assertThat(found.getTip()).isEqualTo(1000);
		assertThat(found.getStatus()).isEqualTo(SaleStatus.ACTIVE);
		assertThat(found.getCreatedAt()).isNotNull();
		assertThat(found.getVoidedAt()).isNull();
		assertThat(found.getLines())
			.extracting(line -> line.getVariant().getId(), SaleLine::getQuantity, SaleLine::getUnitPrice,
					SaleLine::getPromoQuantity, SaleLine::getPromoPrice)
			.containsExactly(
					tuple(original.getId(), 2, 5000L, 3, 12000L),
					tuple(honey.getId(), 1, 5000L, 3, 12000L),
					tuple(beerSingle.getId(), 1, 2500L, null, null));
	}

	@Test
	void saleLinesKeepThePriceSnapshotWhenTheMenuChanges() {
		Event event = eventRepository.save(new Event("DRAMA Octubre", LocalDate.of(2026, 10, 24)));
		Product whiskey = new Product("Test Whiskey", 5000, 3, 12000L, 1);
		ProductVariant original = whiskey.addVariant("Original", 1);
		productRepository.save(whiskey);

		Sale sale = new Sale(event, PaymentMethod.EFECTIVO, 5000, 0);
		sale.addLine(original, 1);
		Sale saved = saleRepository.saveAndFlush(sale);

		whiskey.changePrices(6000, null, null);
		productRepository.saveAndFlush(whiskey);
		entityManager.clear();

		SaleLine line = saleRepository.findById(saved.getId()).orElseThrow().getLines().getFirst();
		Product reloaded = productRepository.findById(whiskey.getId()).orElseThrow();

		assertThat(reloaded.getUnitPrice()).isEqualTo(6000);
		assertThat(line.getUnitPrice()).isEqualTo(5000);
		assertThat(line.getPromoQuantity()).isEqualTo(3);
		assertThat(line.getPromoPrice()).isEqualTo(12000L);
	}

}
