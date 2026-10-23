package cl.dramapp.backend.export;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import cl.dramapp.backend.export.PromoAllocation.VariantTotals;

/**
 * Rows of the "Para BARRA" sheet, in the order of section 2 of the BARRA sheet of the accounting spreadsheet, so
 * columns B:C can be pasted there at once. Pure: no Spring, no database.
 * <p>
 * Rows are matched by product and variant name (case-insensitive, like ux_product_name), never by id. The 14 rows
 * are always present, with zeros when nothing was sold. Whatever was sold but matches no row (an inactive product
 * from an older event, a product added later) is appended at the end in menu order, so no sale is ever lost.
 */
final class BarraRows {

	/** The name of the variant of products without real variants (V3). */
	static final String SINGLE_VARIANT_NAME = "Única";

	/** One row of the sheet: a whole product (variantName null) or one of its variants. */
	record Mapping(String label, String productName, String variantName) {

		boolean matches(VariantTotals variant) {
			return productName.equalsIgnoreCase(variant.productName())
					&& (variantName == null || variantName.equalsIgnoreCase(variant.variantName()));
		}

	}

	record Row(String label, long normalUnits, long promoUnits, long revenue) {

		long totalUnits() {
			return normalUnits + promoUnits;
		}

	}

	static final List<Mapping> SPREADSHEET_ROWS = List.of(
			new Mapping("Piscola Alto", "Piscola Alto", null),
			new Mapping("Gin + Bebida", "Gin + Bebida", null),
			new Mapping("Tropical Gin", "Tropical Gin", null),
			new Mapping("Tequila", "Tequila", null),
			new Mapping("Ballantine", "Ballantine", null),
			new Mapping("Jack Daniels", "Jack Daniels", "Original"),
			new Mapping("Jack Daniels Manzana", "Jack Daniels", "Manzana"),
			new Mapping("Piscola Mistral", "Piscola Mistral", null),
			new Mapping("Jagger + Red Bull", "Jagger + Red Bull", null),
			new Mapping("Jagger + Bebida", "Jagger + Bebida", null),
			new Mapping("Red Bull", "Red Bull", null),
			new Mapping("Cerveza", "Cerveza", "Normal"),
			new Mapping("Cerveza 0,0", "Cerveza", "0,0"),
			new Mapping("Agua", "Agua 600cc", null));

	private BarraRows() {
	}

	/** The 14 spreadsheet rows, then the extras. variants come in menu order (PromoAllocation.allocate). */
	static List<Row> rows(List<VariantTotals> variants) {
		Set<Long> used = new HashSet<>();
		List<Row> rows = new ArrayList<>();
		for (Mapping mapping : SPREADSHEET_ROWS) {
			List<VariantTotals> matched = variants.stream()
				.filter(variant -> !used.contains(variant.variantId()) && mapping.matches(variant))
				.toList();
			matched.forEach(variant -> used.add(variant.variantId()));
			rows.add(sum(mapping.label(), matched));
		}
		variants.stream()
			.filter(variant -> !used.contains(variant.variantId()) && variant.totalUnits() > 0)
			.forEach(variant -> rows.add(sum(extraLabel(variant), List.of(variant))));
		return rows;
	}

	/** The "Total (control)" row: its revenue must equal what the summary calls sold. */
	static Row total(List<Row> rows) {
		return new Row("Total (control)", rows.stream().mapToLong(Row::normalUnits).sum(),
				rows.stream().mapToLong(Row::promoUnits).sum(),
				rows.stream().mapToLong(Row::revenue).reduce(0, Math::addExact));
	}

	/** "Piscola", "Jack Daniels Honey": the product, plus the variant unless it is the only one ("Única"). */
	private static String extraLabel(VariantTotals variant) {
		return SINGLE_VARIANT_NAME.equalsIgnoreCase(variant.variantName()) ? variant.productName()
				: variant.productName() + " " + variant.variantName();
	}

	private static Row sum(String label, List<VariantTotals> variants) {
		return new Row(label, variants.stream().mapToLong(VariantTotals::normalUnits).sum(),
				variants.stream().mapToLong(VariantTotals::promoUnits).sum(),
				variants.stream().mapToLong(VariantTotals::revenue).reduce(0, Math::addExact));
	}

}
