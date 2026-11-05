/** Mirrors the backend's ProductVariantResponse. */
export interface ProductVariantResponse {
  id: number;
  name: string;
  /** When it was marked «Agotado», null while it can be sold. Missing from an older backend. */
  outOfStockSince?: string | null;
}

/** Mirrors the backend's ProductResponse. Promo fields are both null or both set. */
export interface ProductResponse {
  id: number;
  name: string;
  unitPrice: number;
  promoQuantity: number | null;
  promoPrice: number | null;
  variants: ProductVariantResponse[];
}

/** Mirrors the backend's StockOutResponse: a current «Agotado» mark. */
export interface StockOutResponse {
  variantId: number;
  since: string;
}
