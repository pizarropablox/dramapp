package cl.dramapp.backend.sale;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import cl.dramapp.backend.sale.PriceCalculator.Item;
import cl.dramapp.backend.sale.PriceCalculator.ProductPrice;

/**
 * Which glasses of a sale entered a promo. Pure: no Spring, no database.
 * <p>
 * Within one sale, a product's glasses (all its variants) are taken in cart order: the first
 * {@code promos x promoQuantity} are promo glasses, the rest are charged at unit price. The Excel and the vale
 * both use this rule, so they always agree.
 */
public final class PromoGlasses {

	private PromoGlasses() {
	}

	/**
	 * The promo glasses of each line, in the order given.
	 *
	 * @param lines the lines of one sale, in cart order (line id) and with the prices they were charged at
	 */
	public static int[] perLine(List<Item> lines) {
		Map<ProductPrice, Long> unitsByPrice = new LinkedHashMap<>();
		lines.forEach(line -> unitsByPrice.merge(line.price(), (long) line.quantity(), Math::addExact));
		Map<ProductPrice, Long> promoGlassesLeft = new LinkedHashMap<>();
		unitsByPrice.forEach((price, units) -> promoGlassesLeft.put(price, promoGlasses(price, units)));

		int[] promoGlasses = new int[lines.size()];
		for (int i = 0; i < promoGlasses.length; i++) {
			Item line = lines.get(i);
			long left = promoGlassesLeft.get(line.price());
			promoGlasses[i] = (int) Math.min(line.quantity(), left);
			promoGlassesLeft.put(line.price(), left - promoGlasses[i]);
		}
		return promoGlasses;
	}

	private static long promoGlasses(ProductPrice price, long units) {
		return price.promoQuantity() == null ? 0 : units / price.promoQuantity() * price.promoQuantity();
	}

}
