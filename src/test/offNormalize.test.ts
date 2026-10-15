import { describe, it, expect } from 'vitest'
import {
  mapOffCategory,
  parsePackageSize,
  normalizeOffProduct,
  splitNameAndSize,
  type OffProduct,
} from '../lib/offNormalize'

describe('splitNameAndSize', () => {
  it('splits a package descriptor out of the title', () => {
    expect(splitNameAndSize('Diet Coke - 6pk/16.9 fl oz Bottles')).toEqual({
      name: 'Diet Coke',
      size: '6pk/16.9 fl oz Bottles',
    })
    expect(splitNameAndSize('Sparkling Water, 12 x 355 ml')).toEqual({
      name: 'Sparkling Water',
      size: '12 x 355 ml',
    })
  })

  it('does NOT strip a real variant that has no size', () => {
    expect(splitNameAndSize('Diet Coke Caffeine Free')).toEqual({ name: 'Diet Coke Caffeine Free' })
    expect(splitNameAndSize('Oreo - Double Stuf')).toEqual({ name: 'Oreo - Double Stuf' })
  })

  it('leaves a clean name unchanged', () => {
    expect(splitNameAndSize('Diet Coke')).toEqual({ name: 'Diet Coke' })
  })
})

describe('mapOffCategory', () => {
  it('maps chicken/meat tags to meat', () => {
    expect(mapOffCategory(['en:chicken-breasts', 'en:poultry'])).toBe('meat')
  })

  it('prefers seafood over meat when both signals present', () => {
    expect(mapOffCategory(['en:fish', 'en:meat'])).toBe('seafood')
  })

  it('maps dairy tags', () => {
    expect(mapOffCategory(['en:dairies', 'en:milks'])).toBe('dairy')
  })

  it('falls back to other for empty or unknown tags', () => {
    expect(mapOffCategory([])).toBe('other')
    expect(mapOffCategory(undefined)).toBe('other')
    expect(mapOffCategory(['en:something-unmapped'])).toBe('other')
  })
})

describe('parsePackageSize', () => {
  it('parses pounds and grams', () => {
    expect(parsePackageSize('1.5 lb')).toEqual({ quantity: 1.5, unit: 'lb' })
    expect(parsePackageSize('907 g')).toEqual({ quantity: 907, unit: 'g' })
  })

  it('skips non-unit tokens and parses the first valid number/unit pair', () => {
    // "2 x 250 g" -> "x" is not a unit, so the parser moves on to "250 g".
    expect(parsePackageSize('2 x 250 g')).toEqual({ quantity: 250, unit: 'g' })
  })

  it('returns empty for unparseable or missing input', () => {
    expect(parsePackageSize(undefined)).toEqual({})
    expect(parsePackageSize('family size')).toEqual({})
  })
})

describe('normalizeOffProduct', () => {
  it('normalizes a full product record', () => {
    const p: OffProduct = {
      code: '0012345678905',
      product_name: 'Boneless Skinless Chicken Breast',
      brands: 'Perdue',
      brands_tags: ['en:perdue'],
      categories_tags: ['en:meats', 'en:poultry', 'en:chicken-breasts'],
      quantity: '1.5 lb',
    }
    const n = normalizeOffProduct(p)
    expect(n).not.toBeNull()
    expect(n!.name).toBe('Boneless Skinless Chicken Breast')
    expect(n!.brand).toBe('Perdue')
    expect(n!.category).toBe('meat')
    expect(n!.barcode).toBe('0012345678905')
    expect(n!.packageSize).toBe('1.5 lb')
    expect(n!.quantity).toBe(1.5)
    expect(n!.unit).toBe('lb')
  })

  it('returns null when there is no usable name', () => {
    expect(normalizeOffProduct({ code: '123' })).toBeNull()
  })

  it('derives a brand from brands_tags when brands string is absent', () => {
    const n = normalizeOffProduct({
      product_name_en: 'Chicken Thighs',
      brands_tags: ['en:tyson'],
      categories_tags: ['en:chicken'],
    })
    expect(n!.brand).toBe('Tyson')
    expect(n!.name).toBe('Chicken Thighs')
  })

  it('separates a size baked into the title into name + packageSize', () => {
    const n = normalizeOffProduct({
      code: '0049000024692',
      product_name: 'Diet Coke - 6pk/16.9 fl oz Bottles',
      brands: ['Coke'],
      categories_tags: ['en:diet-sodas'],
      // no explicit quantity — the size lives in the name
    })
    expect(n!.name).toBe('Diet Coke') // clean title
    expect(n!.packageSize).toBe('6pk/16.9 fl oz Bottles')
  })
})
