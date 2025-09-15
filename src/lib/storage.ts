// src/lib/storage.ts
export type Order = {
  id: string;
  orderNo: number;
  customerId?: string;    // allow missing on older saved data
  customerName?: string;  // "
  productId: string;
  productName: string;
  unitPrice: number;
  qty: number;
  date: string;           // YYYY-MM-DD
  delivered: boolean;
};

const ORDERS_KEY = 'appui:orders';

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getOrders(): Order[] {
  return read<Order[]>(ORDERS_KEY, []);
}
export function addOrder(o: Order) {
  const arr = getOrders();
  arr.push(o);
  write(ORDERS_KEY, arr);
}
export function clearOrders() {
  write(ORDERS_KEY, []);
}
export function nextOrderNo(): number {
  const arr = getOrders();
  return (arr.at(-1)?.orderNo ?? 0) + 1;
}
