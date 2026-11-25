package cl.dramapp.backend.sale;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import cl.dramapp.backend.sale.PriceCalculator.Item;
import cl.dramapp.backend.sale.PriceCalculator.ProductPrice;

class PromoGlassesTests {

	private static final ProductPrice TROPICAL_GIN = new ProductPrice(5, 8500, 2, 14000L);

	private static final ProductPrice TEQUILA = new ProductPrice(7, 3000, 3, 8000L);

	private static final ProductPrice JACK_DANIELS = new ProductPrice(9, 8500, 2, 15000L);

	private static final ProductPrice RED_BULL = new ProductPrice(12, 3500, null, null);

	private static int[] perLine(Item... lines) {
		return PromoGlasses.perLine(List.of(lines));
	}

	@Test
	void theGlassesBeyondThePromosAreNotPromo() {
		assertThat(perLine(new Item(TROPICAL_GIN, 3))).containsExactly(2);
		assertThat(perLine(new Item(TEQUILA, 7))).containsExactly(6);
	}

	@Test
	void fewerGlassesThanThePromoAreNotPromo() {
		assertThat(perLine(new Item(TEQUILA, 2))).containsExactly(0);
	}

	@Test
	void aPromoMixesVariantsOfTheSameProduct() {
		assertThat(perLine(new Item(JACK_DANIELS, 1), new Item(JACK_DANIELS, 1))).containsExactly(1, 1);
	}

	@Test
	void theCartOrderDecidesWhichGlassesArePromo() {
		assertThat(perLine(new Item(JACK_DANIELS, 2), new Item(JACK_DANIELS, 1))).containsExactly(2, 0);
		assertThat(perLine(new Item(JACK_DANIELS, 1), new Item(JACK_DANIELS, 2))).containsExactly(1, 1);
	}

	@Test
	void anotherProductInBetweenDoesNotBreakThePromo() {
		assertThat(perLine(new Item(JACK_DANIELS, 1), new Item(TROPICAL_GIN, 1), new Item(JACK_DANIELS, 1)))
			.containsExactly(1, 0, 1);
	}

	@Test
	void productsWithoutPromoHaveNoPromoGlasses() {
		assertThat(perLine(new Item(RED_BULL, 4))).containsExactly(0);
	}

	@Test
	void aSaleWithoutLinesHasNone() {
		assertThat(perLine()).isEmpty();
	}

}
