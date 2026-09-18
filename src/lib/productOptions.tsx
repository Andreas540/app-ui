// Shared helpers for product option rendering across order forms

type ProductLike = {
  id: string
  name: string
  variant?: string | null
  variant_2?: string | null
  product_category?: string | null
}

export function optLabel(p: ProductLike): string {
  const parts = [p.name, p.variant, p.variant_2].filter(Boolean)
  return parts.join(' · ')
}

/**
 * Renders <option> elements for a product group with category sub-headers and indentation.
 * Products without a category appear first (flat), then each category as a disabled header
 * followed by its products indented one level.
 */
export function buildGroupOptions(items: ProductLike[]): React.ReactElement[] {
  const uncategorized = items
    .filter(p => !p.product_category)
    .sort((a, b) => a.name.localeCompare(b.name))

  const cats = [...new Set(
    items.filter(p => p.product_category).map(p => p.product_category!)
  )].sort()

  return [
    ...uncategorized.map(p => (
      <option key={p.id} value={p.id}>{optLabel(p)}</option>
    )),
    ...cats.flatMap(cat => [
      <option key={`__hdr__${cat}`} disabled
        style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' }}>
        {'— ' + cat}
      </option>,
      ...items
        .filter(p => p.product_category === cat)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => (
          <option key={p.id} value={p.id}>{'   ' + optLabel(p)}</option>
        )),
    ]),
  ]
}
