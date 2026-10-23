package cl.dramapp.backend.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import cl.dramapp.backend.export.BarraRows.Row;
import cl.dramapp.backend.export.PromoAllocation.VariantTotals;

class BarraRowsTests {

	private static final List<String> SPREADSHEET_ORDER = List.of("Piscola Alto", "Gin + Bebida", "Tropical Gin",
			"Tequila", "Ballantine", "Jack Daniels", "Jack Daniels Manzana", "Piscola Mistral", "Jagger + Red Bull",
			"Jagger + Bebida", "Red Bull", "Cerveza", "Cerveza 0,0", "Agua");

	private static long nextId = 1;

	private static VariantTotals sold(String product, int productSortOrder, String variant, int variantSortOrder,
			long normal, long promo, long revenue) {
		return new VariantTotals(productSortOrder, product, productSortOrder, nextId++, variant, variantSortOrder,
				normal, promo, revenue);
	}

	private static Row row(List<Row> rows, String label) {
		return rows.stream().filter(row -> row.label().equals(label)).findFirst().orElseThrow();
	}

	@Test
	void alwaysHasTheFourteenSpreadsheetRowsInOrderWithZerosWhenNothingWasSold() {
		List<Row> rows = BarraRows.rows(List.of());

		assertThat(rows).extracting(Row::label).containsExactlyElementsOf(SPREADSHEET_ORDER);
		assertThat(rows).allSatisfy(row -> assertThat(row).isEqualTo(new Row(row.label(), 0, 0, 0)));
	}

	@Test
	void mapsVariantsAndRenamedRowsByName() {
		List<Row> rows = BarraRows.rows(List.of(
				sold("Cerveza", 1, "Normal", 1, 0, 2, 5000),
				sold("Cerveza", 1, "0,0", 2, 1, 0, 3000),
				sold("Jack Daniels", 9, "Original", 1, 1, 3, 31000),
				sold("Jack Daniels", 9, "Manzana", 2, 0, 1, 7500),
				sold("Agua 600cc", 13, "Única", 1, 1, 0, 3000)));

		assertThat(row(rows, "Cerveza")).isEqualTo(new Row("Cerveza", 0, 2, 5000));
		assertThat(row(rows, "Cerveza 0,0")).isEqualTo(new Row("Cerveza 0,0", 1, 0, 3000));
		assertThat(row(rows, "Jack Daniels")).isEqualTo(new Row("Jack Daniels", 1, 3, 31000));
		assertThat(row(rows, "Jack Daniels Manzana")).isEqualTo(new Row("Jack Daniels Manzana", 0, 1, 7500));
		assertThat(row(rows, "Agua")).isEqualTo(new Row("Agua", 1, 0, 3000));
		assertThat(row(rows, "Agua").totalUnits()).isEqualTo(1);
		assertThat(rows).hasSize(14);
	}

	@Test
	void matchesNamesIgnoringCase() {
		List<Row> rows = BarraRows.rows(List.of(sold("PISCOLA ALTO", 3, "única", 1, 1, 0, 5000)));

		assertThat(rows.getFirst()).isEqualTo(new Row("Piscola Alto", 1, 0, 5000));
		assertThat(rows).hasSize(14);
	}

	@Test
	void appendsWhatMatchesNoRowAtTheEndInMenuOrderSoNoSaleIsLost() {
		List<Row> rows = BarraRows.rows(List.of(
				sold("Piscola", 2, "Única", 1, 1, 0, 5500),
				sold("Jack Daniels", 9, "Original", 1, 1, 0, 8500),
				sold("Jack Daniels", 9, "Honey", 3, 0, 2, 15000),
				sold("Mojito", 14, "Maracuyá", 1, 1, 0, 6000)));

		assertThat(rows).hasSize(17);
		assertThat(rows.subList(14, 17)).containsExactly(
				new Row("Piscola", 1, 0, 5500),
				new Row("Jack Daniels Honey", 0, 2, 15000),
				new Row("Mojito Maracuyá", 1, 0, 6000));
	}

	@Test
	void theControlTotalAddsUpEveryRowIncludingTheExtras() {
		List<Row> rows = BarraRows.rows(List.of(
				sold("Tequila", 7, "Única", 1, 1, 6, 19000),
				sold("Piscola", 2, "Única", 1, 1, 0, 5500)));

		Row total = BarraRows.total(rows);

		assertThat(total).isEqualTo(new Row("Total (control)", 2, 6, 24500));
		assertThat(total.totalUnits()).isEqualTo(8);
	}

	@Test
	void eachVariantCountsInOneRowOnly() {
		List<Row> rows = BarraRows.rows(List.of(sold("Red Bull", 12, "Única", 1, 2, 0, 7000)));

		assertThat(rows).filteredOn(row -> row.totalUnits() > 0).containsExactly(new Row("Red Bull", 2, 0, 7000));
	}

}
