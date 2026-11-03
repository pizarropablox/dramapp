import { AdminProductResponse } from './admin-product';
import {
  acceptsVariants,
  INVALID_PRICE_MESSAGE,
  nameError,
  normalizeName,
  parseClp,
  previewProduct,
  priceError,
  promoLabel,
  promoPriceError,
  sameName,
  takenProductError,
  takenVariantError,
  variantListError,
} from './menu-rules';

const JACK: AdminProductResponse = {
  id: 9,
  name: 'Jack Daniels',
  unitPrice: 8500,
  promoQuantity: 2,
  promoPrice: 15000,
  active: true,
  variants: [
    { id: 91, name: 'Original', active: true },
    { id: 92, name: 'Manzana', active: true },
    { id: 93, name: 'Honey', active: false },
  ],
};

const RED_BULL: AdminProductResponse = {
  id: 12,
  name: 'Red Bull',
  unitPrice: 3500,
  promoQuantity: null,
  promoPrice: null,
  active: true,
  variants: [{ id: 121, name: 'Única', active: true }],
};

const PISCOLA: AdminProductResponse = {
  id: 14,
  name: 'Piscola',
  unitPrice: 5500,
  promoQuantity: null,
  promoPrice: null,
  active: false,
  variants: [{ id: 141, name: 'Única', active: true }],
};

describe('menu rules', () => {
  it('normalizes names as the backend stores them', () => {
    expect(normalizeName('  Vaso   de\tbebida ')).toBe('Vaso de bebida');
    expect(normalizeName(' Honey ')).toBe('Honey');
  });

  it('compares names ignoring case and spaces, not accents', () => {
    expect(sameName('Gin + Bebida', 'gin+bebida')).toBe(true);
    expect(sameName('Gin + Bebida', ' GIN  +  Bebida ')).toBe(true);
    expect(sameName('Agua 600cc', 'Agua')).toBe(false);
    expect(sameName('Única', 'Unica')).toBe(false);
  });

  it('requires a name of at most 40 characters', () => {
    expect(nameError('  ', 'producto')).toBe('El nombre del producto es obligatorio.');
    expect(nameError('', 'variante')).toBe('El nombre de la variante es obligatorio.');
    expect(nameError('a'.repeat(40), 'producto')).toBeNull();
    expect(nameError(` ${'a'.repeat(40)} `, 'producto')).toBeNull();
    expect(nameError('a'.repeat(41), 'producto')).toBe(
      'El nombre del producto no puede superar los 40 caracteres.',
    );
  });

  it('finds a taken product name, deactivated products included', () => {
    expect(takenProductError('red bull', [JACK, RED_BULL, PISCOLA])).toBe('Ya existe «Red Bull».');
    expect(takenProductError(' PISCOLA ', [JACK, RED_BULL, PISCOLA])).toBe(
      'Ya existe «Piscola» (desactivado).',
    );
    expect(takenProductError('Vaso de bebida', [JACK, RED_BULL, PISCOLA])).toBeNull();
  });

  it('finds a taken variant name, deactivated variants included', () => {
    expect(takenVariantError('MANZANA', JACK)).toBe(
      '«Jack Daniels» ya tiene la variante «Manzana».',
    );
    expect(takenVariantError('honey', JACK)).toBe(
      '«Jack Daniels» ya tiene la variante «Honey» (desactivada).',
    );
    expect(takenVariantError('Fire', JACK)).toBeNull();
  });

  it('reads whole pesos typed with or without dots', () => {
    expect(parseClp('3000')).toBe(3000);
    expect(parseClp('3.000')).toBe(3000);
    expect(parseClp(' $12.000 ')).toBe(12000);
    expect(parseClp('3,5')).toBeNull();
    expect(parseClp('tres mil')).toBeNull();
    expect(parseClp('-3000')).toBeNull();
    expect(parseClp('')).toBeNull();
    expect(parseClp('9'.repeat(20))).toBeNull();
  });

  it('requires a positive whole price, with no upper limit', () => {
    expect(priceError('')).toBe('Escribe el precio.');
    expect(priceError('3,5')).toBe(INVALID_PRICE_MESSAGE);
    expect(priceError('0')).toBe('El precio debe ser mayor que $0.');
    expect(priceError('3.000')).toBeNull();
    expect(priceError('1500000')).toBeNull();
  });

  it('requires a promo cheaper than its glasses at the normal price', () => {
    expect(promoPriceError(3000, 2, '')).toBe('Escribe el precio de la promo.');
    expect(promoPriceError(3000, 2, 'x')).toBe(INVALID_PRICE_MESSAGE);
    expect(promoPriceError(3000, 2, '0')).toBe('El precio de la promo debe ser mayor que $0.');
    expect(promoPriceError(3000, 3, '9.000')).toBe(
      'La promo debe costar menos que 3 vasos a precio normal ($9.000).',
    );
    expect(promoPriceError(3000, 3, '8999')).toBeNull();
    expect(promoPriceError(3000, 2, '5.000')).toBeNull();
  });

  it('does not compare the promo while the normal price is not valid yet', () => {
    expect(promoPriceError(null, 3, '12000')).toBeNull();
  });

  it('finds repeated variants and "Única" mixed with others', () => {
    expect(variantListError([])).toBeNull();
    expect(variantListError(['Original', 'Manzana'])).toBeNull();
    expect(variantListError(['Original', ' original '])).toBe(
      'La variante «original» está repetida.',
    );
    expect(variantListError(['Original', 'única'])).toBe(
      '«Única» es solo para productos sin variantes: no se mezcla con otras.',
    );
    // Empty rows have their own error ("obligatorio"), not this one.
    expect(variantListError(['', ''])).toBeNull();
  });

  it('accepts variants only for active products with real variants', () => {
    expect(acceptsVariants(JACK)).toBe(true);
    expect(acceptsVariants(RED_BULL)).toBe(false);
    expect(acceptsVariants({ ...JACK, active: false })).toBe(false);
  });

  it('labels the promo', () => {
    expect(promoLabel(JACK)).toBe('2 × $15.000');
    expect(promoLabel(RED_BULL)).toBeNull();
  });

  it('previews a product as the grid shows it, "Única" without variants', () => {
    const preview = previewProduct({
      name: 'Vaso de bebida',
      unitPrice: 3000,
      promoQuantity: null,
      promoPrice: null,
      variants: [],
    });

    expect(preview.name).toBe('Vaso de bebida');
    expect(preview.unitPrice).toBe(3000);
    expect(preview.variants.map((variant) => variant.name)).toEqual(['Única']);
    expect(
      previewProduct({ ...preview, variants: ['Coca', 'Sprite'] }).variants.map((v) => v.name),
    ).toEqual(['Coca', 'Sprite']);
  });
});
