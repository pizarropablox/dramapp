/** Mirrors the backend's AdminProductResponse.Variant. */
export interface AdminVariantResponse {
  id: number;
  name: string;
  active: boolean;
}

/** Mirrors the backend's AdminProductResponse: deactivated products and variants included. */
export interface AdminProductResponse {
  id: number;
  name: string;
  unitPrice: number;
  promoQuantity: number | null;
  promoPrice: number | null;
  active: boolean;
  variants: AdminVariantResponse[];
}

/** Promo fields are both null or both set. No variants: the backend gives it the single "Única". */
export interface CreateProductRequest {
  name: string;
  unitPrice: number;
  promoQuantity: number | null;
  promoPrice: number | null;
  variants: string[];
}

export interface CreateVariantRequest {
  name: string;
}

/** Everything is replaced: promo fields in null remove the promo. */
export type UpdateProductRequest = Omit<CreateProductRequest, 'variants'>;

export interface UpdateVariantRequest {
  name: string;
}
