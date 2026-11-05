package cl.dramapp.backend.product;

import java.time.Instant;

/** A current «Agotado» mark: since when this variant is out. */
public record StockOutResponse(Long variantId, Instant since) {
}
