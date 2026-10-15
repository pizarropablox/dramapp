package cl.dramapp.backend.sale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

import cl.dramapp.backend.sale.PriceCalculator.Item;
import cl.dramapp.backend.sale.PriceCalculator.ProductPrice;

class PriceCalculatorTests {

	private static final ProductPrice CERVEZA = new ProductPrice(1, 3000, 2, 5000L);

	private static final ProductPrice PISCOLA = new ProductPrice(2, 5500, 3, 13000L);

	private static final ProductPrice TROPICAL_GIN = new ProductPrice(5, 8500, 2, 15000L);

	private static final ProductPrice JACK_DANIELS = new ProductPrice(9, 8500, 2, 15000L);

	private static final ProductPrice RED_BULL = new ProductPrice(12, 3500, null, null);

	@Test
	void exactPromoQuantityCostsThePromoPrice() {
		assertThat(PriceCalculator.subtotal(List.of(new Item(PISCOLA, 3)))).isEqualTo(13000);
	}

	@Test
	void unitsBeyondThePromoAreChargedAtUnitPrice() {
		assertThat(PriceCalculator.subtotal(List.of(new Item(PISCOLA, 4)))).isEqualTo(18500);
	}

	@Test
	void multiplePromosApply() {
		assertThat(PriceCalculator.subtotal(List.of(new Item(PISCOLA, 6)))).isEqualTo(26000);
	}

	@Test
	void oddQuantityOfTwoForPromo() {
		assertThat(PriceCalculator.subtotal(List.of(new Item(TROPICAL_GIN, 3)))).isEqualTo(23500);
	}

	@Test
	void promoMixesVariantsOfTheSameProduct() {
		Item original = new Item(JACK_DANIELS, 1);
		Item manzana = new Item(JACK_DANIELS, 1);

		assertThat(PriceCalculator.subtotal(List.of(original, manzana))).isEqualTo(15000);
	}

	@Test
	void productWithoutPromoIsChargedAtUnitPrice() {
		assertThat(PriceCalculator.subtotal(List.of(new Item(RED_BULL, 2)))).isEqualTo(7000);
	}

	@Test
	void eachProductAppliesItsOwnRuleAndPromosNeverMixProducts() {
		Item cervezaNormal = new Item(CERVEZA, 1);
		Item cervezaSinAlcohol = new Item(CERVEZA, 1);
		Item piscola = new Item(PISCOLA, 1);

		assertThat(PriceCalculator.subtotal(List.of(cervezaNormal, cervezaSinAlcohol, piscola))).isEqualTo(10500);
	}

	@Test
	void unitsBelowThePromoQuantityAreChargedAtUnitPrice() {
		assertThat(PriceCalculator.subtotal(List.of(new Item(PISCOLA, 2)))).isEqualTo(11000);
	}

	@Test
	void rejectsConflictingPricesForTheSameProduct() {
		ProductPrice otherJackPrice = new ProductPrice(9, 9000, 2, 15000L);

		assertThatThrownBy(() -> PriceCalculator.subtotal(List.of(new Item(JACK_DANIELS, 1), new Item(otherJackPrice, 1))))
			.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void rejectsNonPositiveUnits() {
		assertThatThrownBy(() -> PriceCalculator.productSubtotal(PISCOLA, 0))
			.isInstanceOf(IllegalArgumentException.class);
	}

}
