export type Person = { id: string; name: string; type: 'Customer' | 'Partner' }
export type Product = { id: string; name: string; unit_price: number }

// In dev, call your deployed Netlify site so /api works.
// In prod, same-origin '' is fine.
const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '';

export async function fetchBootstrap() {
  const res = await fetch(`${base}/api/bootstrap`);
  if (!res.ok) throw new Error('Failed to load bootstrap data');
  return (await res.json()) as { customers: Person[]; products: Product[] };
}
