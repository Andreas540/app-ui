import { db } from './db.mjs';

/**
 * Get all customers for dropdown
 */
export async function getAllCustomers() {
  try {
    const customers = await db.customers.toArray();
    return customers;
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
}

/**
 * Get customer details by ID
 */
export async function getCustomerById(customerId) {
  try {
    const customer = await db.customers.get(customerId);
    return customer;
  } catch (error) {
    console.error('Error fetching customer details:', error);
    throw error;
  }
}