/** Mirrors the backend's ProductVariantResponse. */
export interface ProductVariantResponse {
  id: number;
  name: string;
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
