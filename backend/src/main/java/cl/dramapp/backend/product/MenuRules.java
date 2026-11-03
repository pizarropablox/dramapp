package cl.dramapp.backend.product;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Menu rules the database cannot check on its own: names compared ignoring case and spaces, a promo cheaper than its
 * glasses at the normal price, and the "Única" variant of products without real variants. Pure: no Spring, no
 * database. Editing the menu (DRAMA-28) reuses them.
 */
final class MenuRules {

	/** What fits a button of the 2-column Venta grid at "Muy grande". The database allows 100. */
	static final int MAX_NAME_LENGTH = 40;

	/** The only variant of a product without real variants (V3). */
	static final String SINGLE_VARIANT_NAME = "Única";

	private static final Pattern WHITESPACE = Pattern.compile("\\s+", Pattern.UNICODE_CHARACTER_CLASS);

	private MenuRules() {
	}

	/** The name as stored: no spaces around it, single spaces inside. */
	static String productName(String raw) {
		return name(raw, "El nombre del producto");
	}

	static String variantName(String raw) {
		return name(raw, "El nombre de la variante");
	}

	/** "Gin + Bebida", "gin+bebida" and " GIN  +  Bebida " are the same name. */
	static boolean sameName(String a, String b) {
		return nameKey(a).equals(nameKey(b));
	}

	/** Positive price; the promo, if any, complete, of 2 or more glasses and cheaper than them at the normal price. */
	static void checkPrices(long unitPrice, Integer promoQuantity, Long promoPrice) {
		if (unitPrice <= 0) {
			throw new InvalidProductException("El precio debe ser mayor que $0.");
		}
		if ((promoQuantity == null) != (promoPrice == null)) {
			throw new InvalidProductException("La promo necesita la cantidad de vasos y su precio.");
		}
		if (promoQuantity == null) {
			return;
		}
		if (promoQuantity < 2) {
			throw new InvalidProductException("La promo debe ser de al menos 2 vasos.");
		}
		if (promoPrice <= 0) {
			throw new InvalidProductException("El precio de la promo debe ser mayor que $0.");
		}
		long normalPrice = unitPrice > Long.MAX_VALUE / promoQuantity ? Long.MAX_VALUE : unitPrice * promoQuantity;
		if (promoPrice >= normalPrice) {
			throw new InvalidProductException("La promo debe costar menos que " + promoQuantity
					+ " vasos a precio normal (" + clp(normalPrice) + ").");
		}
	}

	/**
	 * The variants of a new product, in the given order. None means a product without variants: just "Única", which
	 * never goes with other variants.
	 */
	static List<String> variantNames(List<String> raw) {
		if (raw == null || raw.isEmpty()) {
			return List.of(SINGLE_VARIANT_NAME);
		}
		List<String> names = new ArrayList<>();
		Set<String> keys = new HashSet<>();
		for (String rawName : raw) {
			String name = variantName(rawName);
			if (!keys.add(nameKey(name))) {
				throw new InvalidProductException("La variante «" + name + "» está repetida.");
			}
			names.add(name);
		}
		if (names.size() > 1 && keys.contains(nameKey(SINGLE_VARIANT_NAME))) {
			throw new InvalidProductException(
					"«" + SINGLE_VARIANT_NAME + "» es solo para productos sin variantes: no se mezcla con otras.");
		}
		return List.copyOf(names);
	}

	static boolean isSingleVariant(String variantName) {
		return sameName(variantName, SINGLE_VARIANT_NAME);
	}

	/** "$12.000". */
	static String clp(long amount) {
		return "$" + String.format(Locale.ROOT, "%,d", amount).replace(',', '.');
	}

	private static String name(String raw, String what) {
		// Spaces first, then strip: strip() leaves the no-break space a pasted name may bring.
		String name = raw == null ? "" : WHITESPACE.matcher(raw).replaceAll(" ").strip();
		if (name.isEmpty()) {
			throw new InvalidProductException(what + " es obligatorio.");
		}
		if (name.length() > MAX_NAME_LENGTH) {
			throw new InvalidProductException(what + " no puede superar los " + MAX_NAME_LENGTH + " caracteres.");
		}
		return name;
	}

	private static String nameKey(String name) {
		return WHITESPACE.matcher(name).replaceAll("").toLowerCase(Locale.ROOT);
	}

}
