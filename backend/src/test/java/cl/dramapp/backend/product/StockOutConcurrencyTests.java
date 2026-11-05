package cl.dramapp.backend.product;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

import cl.dramapp.backend.PostgresIntegrationTest;
import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;

/** Real commits, so no rollback: what it creates is removed afterwards for the other tests. */
@SpringBootTest
class StockOutConcurrencyTests extends PostgresIntegrationTest {

	private static final int PHONES = 4;

	@Autowired
	private StockOutService stockOutService;

	@Autowired
	private StockOutRepository stockOutRepository;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private TransactionTemplate transaction;

	private Event event;

	@AfterEach
	void removeWhatWasCommitted() {
		stockOutRepository.deleteAll();
		if (event != null) {
			eventRepository.delete(event);
		}
	}

	@Test
	void phonesMarkingAtOnceLeaveASingleCurrentMark() throws Exception {
		event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
		long[] ids = transaction.execute(status -> {
			Product gin = productRepository.findAll().stream()
				.filter(product -> product.getName().equals("Tropical Gin"))
				.findFirst()
				.orElseThrow();
			return new long[] { gin.getId(), gin.getVariants().getFirst().getId() };
		});

		CountDownLatch start = new CountDownLatch(1);
		Callable<List<StockOutResponse>> markIt = () -> {
			start.await();
			return stockOutService.mark(ids[0], ids[1], "barra");
		};
		try (ExecutorService phones = Executors.newFixedThreadPool(PHONES)) {
			List<Future<List<StockOutResponse>>> answers = IntStream.range(0, PHONES)
				.mapToObj(phone -> phones.submit(markIt))
				.toList();
			start.countDown();
			for (Future<List<StockOutResponse>> answer : answers) {
				assertThat(answer.get()).hasSize(1);
			}
		}

		assertThat(stockOutRepository.count()).isEqualTo(1);
	}

}
