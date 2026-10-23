package cl.dramapp.backend.export;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Splits what active sales charged into glasses and money per variant. Pure: no Spring, no database.
 * <p>
 * Within one sale, a product's glasses (all its variants) are taken in cart order (line id): the first
 * {@code promos x promoQuantity} are promo glasses, the rest are charged at unit price. Glasses are always whole.
 * <p>
 * Money: unit-price glasses are exact. A product's promo money is split among its variants per glass with the
 * largest remainder method, so the money per product is exact to the peso; a leftover peso goes to the variant
 * first in menu order. Prices come from each line's snapshot, so a price change during the event is split apart.
 */
final class PromoAllocation {

	/** One sale line of an active sale, with its snapshot prices. Promo fields are both null or both set. */
	record Line(long saleId, long lineId, long productId, String productName, int productSortOrder, long variantId,
			String variantName, int variantSortOrder, int quantity, long unitPrice, Integer promoQuantity,
			Long promoPrice) {
	}

	/** Glasses and money of one variant over the whole event. */
	record VariantTotals(long productId, String productName, int productSortOrder, long variantId,
			String variantName, int variantSortOrder, long normalUnits, long promoUnits, long revenue) {

		long totalUnits() {
			return normalUnits + promoUnits;
		}

	}

	/** The prices a line was charged at: a promo is split only among glasses sold at the same prices. */
	private record PriceKey(long productId, long unitPrice, Integer promoQuantity, Long promoPrice) {
	}

	/** Mutable counters of one variant at one price. */
	private static final class Counter {

		final Line first;

		long normalUnits;

		long promoUnits;

		Counter(Line first) {
			this.first = first;
		}

	}

	private static final Comparator<Line> MENU_ORDER = Comparator.comparingInt(Line::productSortOrder)
		.thenComparing(Line::productName)
		.thenComparingInt(Line::variantSortOrder)
		.thenComparing(Line::variantName)
		.thenComparingLong(Line::variantId);

	private PromoAllocation() {
	}

	/** Totals per variant, in menu order. Only variants with glasses sold are returned. */
	static List<VariantTotals> allocate(List<Line> lines) {
		Map<PriceKey, Map<Long, Counter>> counters = new LinkedHashMap<>();
		Map<Long, List<Line>> bySale = new LinkedHashMap<>();
		lines.stream()
			.sorted(Comparator.comparingLong(Line::saleId).thenComparingLong(Line::lineId))
			.forEach(line -> bySale.computeIfAbsent(line.saleId(), id -> new ArrayList<>()).add(line));
		bySale.values().forEach(saleLines -> countGlasses(saleLines, counters));

		Map<Long, VariantTotalsBuilder> byVariant = new LinkedHashMap<>();
		counters.forEach((price, variants) -> {
			List<Counter> inMenuOrder = variants.values()
				.stream()
				.sorted(Comparator.comparing(counter -> counter.first, MENU_ORDER))
				.toList();
			long[] promoMoney = splitPromoMoney(price, inMenuOrder);
			for (int i = 0; i < inMenuOrder.size(); i++) {
				Counter counter = inMenuOrder.get(i);
				long revenue = Math.addExact(Math.multiplyExact(counter.normalUnits, price.unitPrice()), promoMoney[i]);
				byVariant.computeIfAbsent(counter.first.variantId(), id -> new VariantTotalsBuilder(counter.first))
					.add(counter.normalUnits, counter.promoUnits, revenue);
			}
		});

		return byVariant.values()
			.stream()
			.sorted(Comparator.comparing(builder -> builder.first, MENU_ORDER))
			.map(VariantTotalsBuilder::build)
			.toList();
	}

	/** One sale: per product, the first promos x promoQuantity glasses in cart order are promo glasses. */
	private static void countGlasses(List<Line> saleLines, Map<PriceKey, Map<Long, Counter>> counters) {
		Map<PriceKey, List<Line>> byProduct = new LinkedHashMap<>();
		saleLines.forEach(line -> byProduct.computeIfAbsent(priceKey(line), key -> new ArrayList<>()).add(line));

		byProduct.forEach((price, productLines) -> {
			long units = productLines.stream().mapToLong(Line::quantity).sum();
			long promoGlassesLeft = price.promoQuantity() == null ? 0
					: units / price.promoQuantity() * price.promoQuantity();
			Map<Long, Counter> variants = counters.computeIfAbsent(price, key -> new LinkedHashMap<>());
			for (Line line : productLines) {
				long promo = Math.min(line.quantity(), promoGlassesLeft);
				promoGlassesLeft -= promo;
				Counter counter = variants.computeIfAbsent(line.variantId(), id -> new Counter(line));
				counter.promoUnits += promo;
				counter.normalUnits += line.quantity() - promo;
			}
		});
	}

	/**
	 * The promo money of one product at one price, split per glass among its variants (largest remainder). The
	 * promo glasses add up to whole promos in every sale, so the product's promo money is exact.
	 */
	private static long[] splitPromoMoney(PriceKey price, List<Counter> variants) {
		long[] weights = variants.stream().mapToLong(counter -> counter.promoUnits).toArray();
		if (price.promoQuantity() == null) {
			return new long[weights.length];
		}
		long promoGlasses = Arrays.stream(weights).sum();
		long promoMoney = Math.multiplyExact(promoGlasses / price.promoQuantity(), price.promoPrice());
		return largestRemainder(promoMoney, weights);
	}

	/**
	 * Splits amount proportionally to the weights into whole numbers that add up to amount exactly. Each part is
	 * rounded down; the pesos left over go one each to the largest remainders, ties to the first.
	 */
	static long[] largestRemainder(long amount, long[] weights) {
		long totalWeight = Arrays.stream(weights).sum();
		long[] parts = new long[weights.length];
		if (totalWeight == 0) {
			return parts;
		}
		long[] remainders = new long[weights.length];
		long assigned = 0;
		for (int i = 0; i < weights.length; i++) {
			long scaled = Math.multiplyExact(amount, weights[i]);
			parts[i] = scaled / totalWeight;
			remainders[i] = scaled % totalWeight;
			assigned += parts[i];
		}
		List<Integer> byRemainder = new ArrayList<>();
		for (int i = 0; i < weights.length; i++) {
			byRemainder.add(i);
		}
		byRemainder.sort(Comparator.comparingLong((Integer i) -> remainders[i]).reversed()
			.thenComparingInt(i -> i));
		for (int k = 0; assigned < amount; k++, assigned++) {
			parts[byRemainder.get(k)]++;
		}
		return parts;
	}

	private static PriceKey priceKey(Line line) {
		return new PriceKey(line.productId(), line.unitPrice(), line.promoQuantity(), line.promoPrice());
	}

	private static final class VariantTotalsBuilder {

		final Line first;

		long normalUnits;

		long promoUnits;

		long revenue;

		VariantTotalsBuilder(Line first) {
			this.first = first;
		}

		void add(long normal, long promo, long money) {
			normalUnits += normal;
			promoUnits += promo;
			revenue = Math.addExact(revenue, money);
		}

		VariantTotals build() {
			return new VariantTotals(first.productId(), first.productName(), first.productSortOrder(),
					first.variantId(), first.variantName(), first.variantSortOrder(), normalUnits, promoUnits,
					revenue);
		}

	}

}
