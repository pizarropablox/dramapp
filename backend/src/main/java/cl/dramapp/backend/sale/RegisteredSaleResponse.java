package cl.dramapp.backend.sale;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

/**
 * The answer to POST /api/sales: the sale, plus what is «Agotado» in the event. This is how a phone learns what
 * another one marked without asking for anything more (DRAMA-51). Only ids: the time is for the marking sheet.
 */
public record RegisteredSaleResponse(@JsonUnwrapped SaleResponse sale, List<Long> outOfStockVariantIds) {
}
