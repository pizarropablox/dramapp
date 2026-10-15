package cl.dramapp.backend.event;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.product.ProductRepository;
import cl.dramapp.backend.product.ProductVariant;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class EventControllerTests {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private ProductRepository productRepository;

	private MvcTestResult create(String json) {
		return mvc.post().uri("/api/events").contentType(MediaType.APPLICATION_JSON).content(json).exchange();
	}

	private MvcTestResult createOctober() {
		return create("""
				{"name": "DRAMA Octubre", "eventDate": "2026-10-31"}""");
	}

	private Event openEvent() {
		return eventRepository.findByStatus(EventStatus.OPEN).orElseThrow();
	}

	private MvcTestResult close(Long id) {
		return mvc.post().uri("/api/events/{id}/close", id).exchange();
	}

	private void assertProblem(MvcTestResult result, HttpStatus status) {
		assertThat(result).hasStatus(status).hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo(status.value());
		assertThat(result).bodyJson().extractingPath("$.detail").asString().isNotBlank();
	}

	@Test
	void createsAnOpenEvent() {
		var result = createOctober();

		assertThat(result).hasStatus(HttpStatus.CREATED).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$.id").convertTo(Long.class).isEqualTo(openEvent().getId());
		assertThat(result).bodyJson().extractingPath("$.name").isEqualTo("DRAMA Octubre");
		assertThat(result).bodyJson().extractingPath("$.eventDate").isEqualTo("2026-10-31");
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo("OPEN");
		assertThat(result).bodyJson().extractingPath("$.openedAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$.closedAt").isNull();
	}

	@Test
	void trimsTheEventName() {
		create("""
				{"name": "  DRAMA Octubre  ", "eventDate": "2026-10-31"}""");

		assertThat(openEvent().getName()).isEqualTo("DRAMA Octubre");
	}

	@Test
	void returnsTheCurrentOpenEvent() {
		createOctober();

		var result = mvc.get().uri("/api/events/current").exchange();

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.id").convertTo(Long.class).isEqualTo(openEvent().getId());
		assertThat(result).bodyJson().extractingPath("$.name").isEqualTo("DRAMA Octubre");
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo("OPEN");
	}

	@Test
	void currentReturns404WhenNoEventIsOpen() {
		var result = mvc.get().uri("/api/events/current").exchange();

		assertProblem(result, HttpStatus.NOT_FOUND);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo("Sin evento abierto");
	}

	@Test
	void closesTheOpenEvent() {
		createOctober();
		Long id = openEvent().getId();

		var result = close(id);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.id").convertTo(Long.class).isEqualTo(id);
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo("CLOSED");
		assertThat(result).bodyJson().extractingPath("$.closedAt").asString().isNotBlank();
		assertThat(eventRepository.findByStatus(EventStatus.OPEN)).isEmpty();
		assertProblem(mvc.get().uri("/api/events/current").exchange(), HttpStatus.NOT_FOUND);
	}

	@Test
	void allowsANewEventAfterClosingThePreviousOne() {
		createOctober();
		close(openEvent().getId());

		var result = create("""
				{"name": "DRAMA Noviembre", "eventDate": "2026-11-28"}""");

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(openEvent().getName()).isEqualTo("DRAMA Noviembre");
	}

	@Test
	void rejectsASecondOpenEvent() {
		createOctober();

		var result = create("""
				{"name": "DRAMA Noviembre", "eventDate": "2026-11-28"}""");

		assertProblem(result, HttpStatus.CONFLICT);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo("Evento ya abierto");
		assertThat(result).bodyJson().extractingPath("$.detail").asString().contains("DRAMA Octubre");
		assertThat(eventRepository.count()).isEqualTo(1);
	}

	@Test
	void rejectsClosingAnEventTwice() {
		createOctober();
		Long id = openEvent().getId();
		close(id);

		var result = close(id);

		assertProblem(result, HttpStatus.CONFLICT);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo("Evento ya cerrado");
	}

	@Test
	void closingAnUnknownEventReturns404() {
		var result = close(999999999L);

		assertProblem(result, HttpStatus.NOT_FOUND);
		assertThat(result).bodyJson().extractingPath("$.detail").asString().contains("999999999");
	}

	@Test
	void rejectsAMissingName() {
		var result = create("""
				{"eventDate": "2026-10-31"}""");

		assertProblem(result, HttpStatus.BAD_REQUEST);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.startsWith("name:");
	}

	@Test
	void rejectsABlankName() {
		var result = create("""
				{"name": "   ", "eventDate": "2026-10-31"}""");

		assertProblem(result, HttpStatus.BAD_REQUEST);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.startsWith("name:");
	}

	@Test
	void rejectsANameLongerThan100Characters() {
		var result = create("""
				{"name": "%s", "eventDate": "2026-10-31"}""".formatted("x".repeat(101)));

		assertProblem(result, HttpStatus.BAD_REQUEST);
	}

	@Test
	void rejectsAMissingEventDate() {
		var result = create("""
				{"name": "DRAMA Octubre"}""");

		assertProblem(result, HttpStatus.BAD_REQUEST);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.startsWith("eventDate:");
	}

	@Test
	void rejectsAnInvalidEventDate() {
		assertProblem(create("""
				{"name": "DRAMA Octubre", "eventDate": "2026-13-45"}"""), HttpStatus.BAD_REQUEST);
		assertThat(eventRepository.count()).isZero();
	}

	@Test
	void salesAreRejectedAfterClosingTheEvent() {
		createOctober();
		close(openEvent().getId());
		ProductVariant redBull = productRepository.findAll().stream()
			.filter(product -> product.getName().equals("Red Bull"))
			.findFirst()
			.orElseThrow()
			.getVariants()
			.getFirst();

		var result = mvc.post().uri("/api/sales").contentType(MediaType.APPLICATION_JSON).content("""
				{"paymentMethod": "EFECTIVO", "lines": [{"variantId": %d, "quantity": 1}]}"""
			.formatted(redBull.getId())).exchange();

		assertProblem(result, HttpStatus.CONFLICT);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo("Sin evento abierto");
	}

}
