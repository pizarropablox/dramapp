package cl.dramapp.backend.export;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.util.List;

import org.assertj.core.groups.Tuple;
import org.junit.jupiter.api.Test;

import cl.dramapp.backend.export.PromoAllocation.Line;
import cl.dramapp.backend.export.PromoAllocation.VariantTotals;

class PromoAllocationTests {

	/** A line of the official October menu: product sort order, variant, prices. */
	private record Product(long id, String name, int sortOrder, long unitPrice, Integer promoQuantity,
			Long promoPrice) {

		Line line(long saleId, long lineId, String variant, int variantSortOrder, int quantity) {
			return new Line(saleId, lineId, id, name, sortOrder, id * 100 + variantSortOrder, variant,
					variantSortOrder, quantity, unitPrice, promoQuantity, promoPrice);
		}

	}

	private static final Product CERVEZA = new Product(1, "Cerveza", 1, 3000, 2, 5000L);

	private static final Product TROPICAL_GIN = new Product(5, "Tropical Gin", 5, 8500, 2, 14000L);

	private static final Product TEQUILA = new Product(7, "Tequila", 7, 3000, 3, 8000L);

	private static final Product JACK_DANIELS = new Product(9, "Jack Daniels", 9, 8500, 2, 15000L);

	private static final Product RED_BULL = new Product(12, "Red Bull", 12, 3500, null, null);

	private static List<Tuple> totals(List<VariantTotals> totals) {
		return totals.stream()
			.map(variant -> tuple(variant.productName(), variant.variantName(), variant.normalUnits(),
					variant.promoUnits(), variant.revenue()))
			.toList();
	}

	@Test
	void promosOfOneVariantAndTheRestAtUnitPrice() {
		// 7 Tequila: two 3 x 8000 promos and one at 3000.
		var result = PromoAllocation.allocate(List.of(TEQUILA.line(1, 1, "Única", 1, 7)));

		assertThat(totals(result)).containsExactly(tuple("Tequila", "Única", 1L, 6L, 19000L));
	}

	@Test
	void aPromoMixingVariantsIsSplitPerGlass() {
		// Sale 1: 1 Original + 1 Manzana = one 2 x 15000 promo. Sale 2: 3 Original = one promo + 8500.
		var result = PromoAllocation.allocate(List.of(
				JACK_DANIELS.line(1, 1, "Original", 1, 1),
				JACK_DANIELS.line(1, 2, "Manzana", 2, 1),
				JACK_DANIELS.line(2, 3, "Original", 1, 3)));

		assertThat(totals(result)).containsExactly(
				tuple("Jack Daniels", "Original", 1L, 3L, 31000L),
				tuple("Jack Daniels", "Manzana", 0L, 1L, 7500L));
		assertThat(result.stream().mapToLong(VariantTotals::revenue).sum()).isEqualTo(15000 + 23500);
	}

	@Test
	void glassesBeyondThePromosAreTheLastOnesInCartOrder() {
		// 2 Normal, then 1 "0,0": the promo is both Normal, the 0,0 is at unit price.
		var result = PromoAllocation.allocate(List.of(
				CERVEZA.line(1, 1, "Normal", 1, 2),
				CERVEZA.line(1, 2, "0,0", 2, 1)));

		assertThat(totals(result)).containsExactly(
				tuple("Cerveza", "Normal", 0L, 2L, 5000L),
				tuple("Cerveza", "0,0", 1L, 0L, 3000L));
	}

	@Test
	void theCartOrderDecidesWhichGlassIsAtUnitPrice() {
		// "0,0" first, then 2 Normal: the promo is the 0,0 and one Normal; the second Normal is at unit price.
		var result = PromoAllocation.allocate(List.of(
				CERVEZA.line(1, 1, "0,0", 2, 1),
				CERVEZA.line(1, 2, "Normal", 1, 2)));

		assertThat(totals(result)).containsExactly(
				tuple("Cerveza", "Normal", 1L, 1L, 5500L),
				tuple("Cerveza", "0,0", 0L, 1L, 2500L));
	}

	@Test
	void promosNeverMixSales() {
		// One Original in each of two sales: no promo.
		var result = PromoAllocation.allocate(List.of(
				JACK_DANIELS.line(1, 1, "Original", 1, 1),
				JACK_DANIELS.line(2, 2, "Original", 1, 1)));

		assertThat(totals(result)).containsExactly(tuple("Jack Daniels", "Original", 2L, 0L, 17000L));
	}

	@Test
	void promosNeverMixProducts() {
		var result = PromoAllocation.allocate(List.of(
				JACK_DANIELS.line(1, 1, "Original", 1, 1),
				TROPICAL_GIN.line(1, 2, "Única", 1, 1)));

		assertThat(totals(result)).containsExactly(
				tuple("Tropical Gin", "Única", 1L, 0L, 8500L),
				tuple("Jack Daniels", "Original", 1L, 0L, 8500L));
	}

	@Test
	void aPromoMoneyThatDoesNotDivideIsRoundedSoTheProductStaysExact() {
		// A 3 x 8000 promo of three variants: 2666.67 each, rounded 2667 / 2667 / 2666.
		Product shots = new Product(20, "Shots", 20, 3000, 3, 8000L);

		var result = PromoAllocation.allocate(List.of(
				shots.line(1, 1, "A", 1, 1),
				shots.line(1, 2, "B", 2, 1),
				shots.line(1, 3, "C", 3, 1)));

		assertThat(totals(result)).containsExactly(
				tuple("Shots", "A", 0L, 1L, 2667L),
				tuple("Shots", "B", 0L, 1L, 2667L),
				tuple("Shots", "C", 0L, 1L, 2666L));
		assertThat(result.stream().mapToLong(VariantTotals::revenue).sum()).isEqualTo(8000);
	}

	@Test
	void aPriceChangeDuringTheEventKeepsEachSalesPrices() {
		Product oldTropical = new Product(5, "Tropical Gin", 5, 8500, 2, 15000L);

		var result = PromoAllocation.allocate(List.of(
				oldTropical.line(1, 1, "Única", 1, 2),
				TROPICAL_GIN.line(2, 2, "Única", 1, 2)));

		assertThat(totals(result)).containsExactly(tuple("Tropical Gin", "Única", 0L, 4L, 29000L));
	}

	@Test
	void productsWithoutPromoAreAtUnitPrice() {
		var result = PromoAllocation.allocate(List.of(RED_BULL.line(1, 1, "Única", 1, 3)));

		assertThat(totals(result)).containsExactly(tuple("Red Bull", "Única", 3L, 0L, 10500L));
	}

	@Test
	void variantsComeInMenuOrder() {
		var result = PromoAllocation.allocate(List.of(
				RED_BULL.line(1, 1, "Única", 1, 1),
				CERVEZA.line(1, 2, "0,0", 2, 1),
				CERVEZA.line(1, 3, "Normal", 1, 1)));

		assertThat(result).extracting(VariantTotals::productName, VariantTotals::variantName)
			.containsExactly(tuple("Cerveza", "Normal"), tuple("Cerveza", "0,0"), tuple("Red Bull", "Única"));
	}

	@Test
	void largestRemainderGivesTheLeftoverPesosToTheLargestRemaindersThenToTheFirst() {
		assertThat(PromoAllocation.largestRemainder(10, new long[] { 1, 1, 1 })).containsExactly(4, 3, 3);
		assertThat(PromoAllocation.largestRemainder(15000, new long[] { 1, 1 })).containsExactly(7500, 7500);
		assertThat(PromoAllocation.largestRemainder(100, new long[] { 1, 2 })).containsExactly(33, 67);
		assertThat(PromoAllocation.largestRemainder(0, new long[] { 0, 0 })).containsExactly(0, 0);
	}

}
