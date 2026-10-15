package cl.dramapp.backend.sale;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Computes sale subtotals from current menu prices. Pure: no Spring, no database.
 * <p>
 * Promos apply automatically per product, adding up the units of all its variants;
 * they never mix different products.
 */
public final class PriceCalculator {

	/** Prices of one product, as currently on the menu. Promo fields are both null or both set. */
	public record ProductPrice(long productId, long unitPrice, Integer promoQuantity, Long promoPrice) {
	}

	/** Units of one product sold in a sale line. */
	public record Item(ProductPrice price, int quantity) {
	}

	private PriceCalculator() {
	}

	public static long subtotal(List<Item> items) {
		Map<Long, ProductPrice> prices = new LinkedHashMap<>();
		Map<Long, Integer> units = new LinkedHashMap<>();
		for (Item item : items) {
			ProductPrice price = item.price();
			ProductPrice known = prices.putIfAbsent(price.productId(), price);
			if (known != null && !known.equals(price)) {
				throw new IllegalArgumentException("Conflicting prices for product " + price.productId());
			}
			units.merge(price.productId(), item.quantity(), Math::addExact);
		}

		long subtotal = 0;
		for (Map.Entry<Long, Integer> entry : units.entrySet()) {
			subtotal = Math.addExact(subtotal, productSubtotal(prices.get(entry.getKey()), entry.getValue()));
		}
		return subtotal;
	}

	public static long productSubtotal(ProductPrice price, int units) {
		if (units <= 0) {
			throw new IllegalArgumentException("Units must be positive: " + units);
		}
		if (price.promoQuantity() == null) {
			return Math.multiplyExact(units, price.unitPrice());
		}
		long promos = units / price.promoQuantity();
		long singles = units % price.promoQuantity();
		return Math.addExact(Math.multiplyExact(promos, price.promoPrice()),
				Math.multiplyExact(singles, price.unitPrice()));
	}

}
