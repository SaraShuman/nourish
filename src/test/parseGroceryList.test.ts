import { describe, it, expect } from 'vitest'
import { parseGroceryList } from '../lib/parseGroceryList'

describe('parseGroceryList', () => {
  it('returns [] for empty input', () => {
    expect(parseGroceryList('')).toEqual([])
    expect(parseGroceryList('   ')).toEqual([])
  })

  // ── Dictation carrier phrases ("I need …") are framing, not items ──
  it('produces no item for a bare carrier phrase ("I need")', () => {
    expect(parseGroceryList('I need')).toEqual([])
    expect(parseGroceryList('get me')).toEqual([])
    expect(parseGroceryList('can you add')).toEqual([])
  })

  it('strips a leading carrier phrase and keeps the real items', () => {
    const items = parseGroceryList('I need bananas eggs milk')
    expect(items.map((i) => i.name)).toEqual(['Bananas', 'Eggs', 'Whole Milk'])
    // No stray "I need" item.
    expect(items.some((i) => /need|^i$/i.test(i.name))).toBe(false)
  })

  it('strips carrier phrases in a comma list and preserves quantities', () => {
    const items = parseGroceryList("I'd like a dozen eggs and 2 lb chicken breast")
    const eggs = items.find((i) => i.catalogId === 'eggs')!
    const chicken = items.find((i) => i.catalogId === 'chicken-breast')!
    expect(eggs.unit).toBe('dozen')
    expect(chicken.quantity).toBe(2)
    expect(chicken.unit).toBe('lb')
    expect(items.some((i) => /^(i|a|like|dozen)$/i.test(i.name))).toBe(false)
  })

  it('does not clip product words that merely start like a carrier word', () => {
    // "avocados" after "add" is kept; "add" is only stripped as a whole word.
    expect(parseGroceryList('add avocados').map((i) => i.name)).toEqual(['Avocados'])
    expect(parseGroceryList('buy ground beef').map((i) => i.name)).toEqual(['Ground Beef'])
  })

  // ── Exact-duplicate collapsing (e.g. speech double-emitting an item) ──
  it('ignores an exact repeated product ("bananas bananas")', () => {
    expect(parseGroceryList('bananas bananas').map((i) => i.name)).toEqual(['Bananas'])
    expect(parseGroceryList('bananas, bananas').map((i) => i.name)).toEqual(['Bananas'])
    expect(parseGroceryList('milk milk milk')).toHaveLength(1)
  })

  it('keeps duplicates that differ by a specified quantity', () => {
    // The shopper may genuinely want two different amounts — don't merge these.
    const items = parseGroceryList('bananas, bananas 2 lb')
    expect(items).toHaveLength(2)
    expect(items[1].quantity).toBe(2)
    expect(items[1].unit).toBe('lb')
  })

  it('keeps same-product items that differ by detail (shape/amount)', () => {
    expect(parseGroceryList('penne, rigatoni')).toHaveLength(2)
    expect(parseGroceryList('chicken breast 2 lb, chicken breast 1 lb')).toHaveLength(2)
  })

  it('parses the 8-item example into 8 structured items', () => {
    const raw =
      'Bananas 3 lb, chicken breast 1.5 lb, spinach 1 bunch, whole milk 1 gal, eggs 1 dozen, avocados 4, Greek yogurt 32 oz, pasta 1 box'
    const items = parseGroceryList(raw)
    expect(items).toHaveLength(8)
    expect(items.map((i) => i.catalogId)).toEqual([
      'bananas',
      'chicken-breast',
      'spinach',
      'whole-milk',
      'eggs',
      'avocados',
      'greek-yogurt',
      'pasta',
    ])
    expect(items.every((i) => i.recognized)).toBe(true)
  })

  it('preserves quantities', () => {
    const items = parseGroceryList('bananas 3 lb, chicken breast 1.5 lb, avocados 4')
    expect(items[0].quantity).toBe(3)
    expect(items[1].quantity).toBe(1.5)
    expect(items[2].quantity).toBe(4)
  })

  it('preserves recognized units when valid for the item', () => {
    const items = parseGroceryList('spinach 1 bunch, whole milk 1 gal')
    expect(items[0].unit).toBe('bunch')
    expect(items[1].unit).toBe('gal')
  })

  it('falls back to the default unit when none is given', () => {
    const items = parseGroceryList('bananas')
    expect(items[0].unit).toBe('lb') // bananas default
    expect(items[0].quantity).toBe(1)
  })

  it('recognizes a brand mentioned in the fragment', () => {
    const items = parseGroceryList('Perdue chicken breast 2 lb')
    expect(items[0].catalogId).toBe('chicken-breast')
    expect(items[0].brand).toBe('Perdue')
  })

  // ── Brand preserved on an AMBIGUOUS item ("Perdue chicken") ──
  it('keeps a brand on an ambiguous item while the cut is unresolved', () => {
    const item = parseGroceryList('Perdue chicken')[0]
    expect(item.ambiguous).toBe(true)
    expect(item.catalogId).toBeNull()
    expect(item.brand).toBe('Perdue') // brand is NOT lost
    // Display name is the category word, with the brand in its own field.
    expect(item.name.toLowerCase()).toBe('chicken')
  })

  it('ambiguous item with no brand stays brandless', () => {
    const item = parseGroceryList('chicken')[0]
    expect(item.ambiguous).toBe(true)
    expect(item.brand).toBe('')
  })

  // ── Spoken number words become quantities ──
  it('parses spoken number words as quantities', () => {
    expect(parseGroceryList('two bananas')[0].quantity).toBe(2)
    expect(parseGroceryList('three apples')[0].quantity).toBe(3)
    const banana = parseGroceryList('two bananas')[0]
    expect(banana.quantitySpecified).toBe(true)
  })

  it('treats a leading "a"/"an" as quantity 1', () => {
    const eggs = parseGroceryList('a dozen eggs')[0]
    expect(eggs.catalogId).toBe('eggs')
    expect(eggs.quantity).toBe(1)
    expect(eggs.unit).toBe('dozen') // "one dozen"
  })

  it('captures spoken quantities inside a carrier-phrase voice sentence', () => {
    const items = parseGroceryList('I need two bananas and three apples')
    const bananas = items.find((i) => i.catalogId === 'bananas')!
    const apples = items.find((i) => i.catalogId === 'apples')!
    expect(bananas.quantity).toBe(2)
    expect(apples.quantity).toBe(3)
  })

  it('captures spoken quantities in a punctuation-free voice run', () => {
    const items = parseGroceryList('three apples two bananas')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ catalogId: 'apples', quantity: 3 })
    expect(items[1]).toMatchObject({ catalogId: 'bananas', quantity: 2 })
  })

  it('leaves brand empty when none is mentioned', () => {
    const items = parseGroceryList('chicken breast 1 lb')
    expect(items[0].brand).toBe('')
  })

  it('matches multi-word names before single words (chicken breast, not chicken)', () => {
    const items = parseGroceryList('chicken breast')
    expect(items[0].catalogId).toBe('chicken-breast')
  })

  it('distinguishes chicken cuts (thighs, legs, wings, whole, ground, breast)', () => {
    expect(parseGroceryList('chicken thighs')[0].catalogId).toBe('chicken-thighs')
    expect(parseGroceryList('chicken thigh')[0].catalogId).toBe('chicken-thighs')
    expect(parseGroceryList('chicken legs')[0].catalogId).toBe('chicken-legs')
    expect(parseGroceryList('chicken drumsticks')[0].catalogId).toBe('chicken-legs')
    expect(parseGroceryList('chicken wings')[0].catalogId).toBe('chicken-wings')
    expect(parseGroceryList('whole chicken')[0].catalogId).toBe('whole-chicken')
    expect(parseGroceryList('ground chicken')[0].catalogId).toBe('ground-chicken')
    expect(parseGroceryList('chicken breast')[0].catalogId).toBe('chicken-breast')
  })

  it('treats a bare "chicken" as ambiguous — never silently a specific cut', () => {
    const items = parseGroceryList('chicken')
    expect(items).toHaveLength(1)
    const item = items[0]
    // No specific product is chosen…
    expect(item.catalogId).toBeNull()
    expect(item.recognized).toBe(false)
    // …it is flagged ambiguous with the shopper's original word kept…
    expect(item.ambiguous).toBe(true)
    expect(item.name.toLowerCase()).toBe('chicken')
    // …and clarification choices are offered (not preselected).
    expect(item.candidates && item.candidates.length).toBeGreaterThan(1)
    const choiceNames = (item.candidates ?? []).map((c) => c.name)
    expect(choiceNames).toContain('Chicken Breast')
    expect(choiceNames).toContain('Chicken Thighs')
    expect(choiceNames).toContain('Chicken Wings')
    expect(choiceNames).toContain('Whole Chicken')
    expect(choiceNames).toContain('Other')
  })

  it('keeps specific chicken requests specific (not ambiguous)', () => {
    for (const [q, id] of [
      ['chicken breast', 'chicken-breast'],
      ['chicken thighs', 'chicken-thighs'],
      ['whole chicken', 'whole-chicken'],
    ] as const) {
      const item = parseGroceryList(q)[0]
      expect(item.catalogId).toBe(id)
      expect(item.recognized).toBe(true)
      expect(item.ambiguous).toBeFalsy()
    }
  })

  it('preserves quantity on an ambiguous request', () => {
    const item = parseGroceryList('2 lb chicken')[0]
    expect(item.ambiguous).toBe(true)
    expect(item.quantity).toBe(2)
    expect(item.unit).toBe('lb')
  })

  it('recognizes a brand on a specific cut (Perdue chicken thighs)', () => {
    const items = parseGroceryList('Perdue chicken thighs')
    expect(items).toHaveLength(1)
    expect(items[0].catalogId).toBe('chicken-thighs')
    expect(items[0].name).toBe('Chicken Thighs')
    expect(items[0].brand).toBe('Perdue')
    expect(items[0].recognized).toBe(true)
  })

  it('handles aliases and plurals', () => {
    expect(parseGroceryList('banana')[0].catalogId).toBe('bananas')
    expect(parseGroceryList('tomatoes')[0].catalogId).toBe('tomatoes')
    expect(parseGroceryList('oj')[0].catalogId).toBe('orange-juice')
  })

  it('retains unrecognized items for review instead of dropping them', () => {
    const items = parseGroceryList('bananas, dragon fruit, 2 kumquats')
    expect(items).toHaveLength(3)
    const unknowns = items.filter((i) => !i.recognized)
    expect(unknowns).toHaveLength(2)
    expect(unknowns[0].name.toLowerCase()).toContain('dragon fruit')
    // Quantity on an unknown item is still captured.
    const kumquat = items.find((i) => i.name.toLowerCase().includes('kumquat'))
    expect(kumquat?.quantity).toBe(2)
  })

  it('splits on commas, newlines, semicolons, and "and"', () => {
    const items = parseGroceryList('eggs and bread; milk\npasta')
    const ids = items.map((i) => i.catalogId)
    expect(ids).toContain('eggs')
    expect(ids).toContain('bread')
    expect(ids).toContain('whole-milk')
    expect(ids).toContain('pasta')
  })

  it('does not attach prices or retailer data (recognition only)', () => {
    const items = parseGroceryList('bananas 3 lb')
    expect(items[0]).not.toHaveProperty('price')
    expect(items[0]).not.toHaveProperty('retailerId')
  })

  // ── Branded products (deferred to OFF enrichment) ──
  it('keeps branded products as the shopper\'s words (not generic matches)', () => {
    const diet = parseGroceryList('Diet Coke')[0]
    expect(diet.name).toBe('Diet Coke')
    expect(diet.catalogId).toBeNull()
    expect(diet.recognized).toBe(false)
    expect(diet.category).toBe('beverages')

    const zero = parseGroceryList('Coke Zero')[0]
    expect(zero.name).toBe('Coke Zero')
    expect(zero.recognized).toBe(false)

    const cheerios = parseGroceryList('Cheerios')[0]
    expect(cheerios.name).toBe('Cheerios')
    expect(cheerios.recognized).toBe(false)
  })

  it('does NOT mis-match "Coca-Cola Zero Sugar" to the generic sugar entry', () => {
    const item = parseGroceryList('Coca-Cola Zero Sugar')[0]
    expect(item.catalogId).not.toBe('sugar')
    expect(item.catalogId).toBeNull()
    expect(item.name.toLowerCase()).toContain('zero sugar')
    expect(item.category).toBe('beverages')
  })

  it('keeps Diet Coke and Coca-Cola Zero Sugar as distinct items', () => {
    const a = parseGroceryList('Diet Coke')[0]
    const b = parseGroceryList('Coca-Cola Zero Sugar')[0]
    expect(a.name.toLowerCase()).not.toBe(b.name.toLowerCase())
  })

  // ── Package configuration (separate from purchase quantity) ──
  it('parses "12-pack Diet Coke" as packaging, NOT quantity 12', () => {
    const item = parseGroceryList('12-pack Diet Coke')[0]
    expect(item.packaging).toBe('12-pack')
    expect(item.quantity).toBe(1) // one package, not 12 units
    expect(item.name).toBe('Diet Coke')
    expect(item.recognized).toBe(false)
  })

  it('parses "2-liter Diet Coke" as a 2 L package, quantity 1', () => {
    const item = parseGroceryList('2-liter Diet Coke')[0]
    expect(item.packaging).toBe('2 L')
    expect(item.quantity).toBe(1)
    expect(item.name).toBe('Diet Coke')
  })

  // ── Pasta shape recognition (type preserved, pricing unchanged) ──
  it('generic "pasta" is recognized with no specific shape (Any type)', () => {
    const item = parseGroceryList('pasta 1 box')[0]
    expect(item.catalogId).toBe('pasta')
    expect(item.name).toBe('Pasta')
    expect(item.pastaType).toBeUndefined()
    expect(item.recognized).toBe(true)
  })

  it('generic "noodles" stays Any type (no shape invented)', () => {
    const item = parseGroceryList('noodles')[0]
    expect(item.catalogId).toBe('pasta')
    expect(item.pastaType).toBeUndefined()
    expect(item.name).toBe('Pasta')
  })

  it('preserves a specific shape like "penne" (name + pastaType)', () => {
    const item = parseGroceryList('penne')[0]
    expect(item.catalogId).toBe('pasta') // priced as pasta
    expect(item.pastaType).toBe('penne')
    expect(item.name).toBe('Penne')
    expect(item.recognized).toBe(true)
  })

  it('preserves shape AND brand for "Barilla spaghetti"', () => {
    const item = parseGroceryList('Barilla spaghetti')[0]
    expect(item.catalogId).toBe('pasta')
    expect(item.pastaType).toBe('spaghetti')
    expect(item.name).toBe('Spaghetti')
    expect(item.brand).toBe('Barilla')
  })

  it('recognizes other common shapes (rigatoni, rotini, macaroni)', () => {
    expect(parseGroceryList('rigatoni')[0].pastaType).toBe('rigatoni')
    expect(parseGroceryList('rotini')[0].pastaType).toBe('rotini')
    expect(parseGroceryList('macaroni')[0].pastaType).toBe('macaroni')
  })

  it('does NOT assume a package size for pasta (no silent 16 oz box)', () => {
    const item = parseGroceryList('penne')[0]
    expect(item.packageSize).toBeUndefined()
    expect(item.packaging).toBeUndefined()
    expect(item.quantitySpecified).toBe(false)
  })

  // ── Punctuation-free voice transcripts (item segmentation) ──
  it('splits a comma-free spoken run into separate items', () => {
    const items = parseGroceryList('bananas eggs chicken breast pasta sauce')
    expect(items).toHaveLength(4)
    expect(items.map((i) => i.name.toLowerCase())).toEqual([
      'bananas',
      'eggs',
      'chicken breast',
      'pasta sauce',
    ])
  })

  it('keeps multiword product names intact when segmenting', () => {
    const items = parseGroceryList('chicken breast pasta sauce')
    expect(items).toHaveLength(2)
    expect(items[0].catalogId).toBe('chicken-breast')
    expect(items[1].catalogId).toBe('pasta-sauce')
  })

  it('preserves a branded multiword product (Coke Zero) in a run', () => {
    const items = parseGroceryList('bananas coke zero bread')
    expect(items).toHaveLength(3)
    expect(items[1].name.toLowerCase()).toBe('coke zero')
    // Branded products stay unrecognized (identity resolved later via OFF).
    expect(items[1].catalogId).toBeNull()
    expect(items[0].catalogId).toBe('bananas')
    expect(items[2].catalogId).toBe('bread')
  })

  it('attaches quantities/units to the right item in a spoken run', () => {
    const items = parseGroceryList('2 lb chicken breast 1 dozen eggs')
    expect(items).toHaveLength(2)
    expect(items[0].catalogId).toBe('chicken-breast')
    expect(items[0].quantity).toBe(2)
    expect(items[0].unit).toBe('lb')
    expect(items[1].catalogId).toBe('eggs')
    expect(items[1].quantity).toBe(1)
    expect(items[1].unit).toBe('dozen')
  })

  it('keeps a trailing quantity with its product ("eggs milk 2 gal")', () => {
    const items = parseGroceryList('eggs milk 2 gal')
    expect(items).toHaveLength(2)
    expect(items[0].catalogId).toBe('eggs')
    expect(items[1].catalogId).toBe('whole-milk')
    expect(items[1].quantity).toBe(2)
    expect(items[1].unit).toBe('gal')
  })

  it('never drops an unrecognized word between known items (preserved to clarify)', () => {
    const items = parseGroceryList('bananas quinoa eggs')
    const names = items.map((i) => i.name.toLowerCase())
    expect(names).toContain('bananas')
    expect(names).toContain('eggs')
    // "quinoa" isn't in the catalog — it is KEPT for the shopper to review,
    // not silently discarded.
    expect(names).toContain('quinoa')
    const quinoa = items.find((i) => i.name.toLowerCase() === 'quinoa')!
    expect(quinoa.recognized).toBe(false)
  })

  it('does not over-split a single typed multiword item', () => {
    // Only one recognized product → fragment is returned unchanged.
    expect(parseGroceryList('chicken breast')).toHaveLength(1)
    expect(parseGroceryList('Perdue chicken thighs')).toHaveLength(1)
    expect(parseGroceryList('12-pack Diet Coke')).toHaveLength(1)
  })

  it('still parses a real purchase quantity when there is no package config', () => {
    const item = parseGroceryList('3 Diet Coke')[0]
    expect(item.quantity).toBe(3)
    expect(item.packaging).toBeUndefined()
  })
})
