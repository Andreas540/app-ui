// netlify/functions/utils/ai-prompts.mjs
// Central registry for all AI analysis prompts used across the app.
//
// Structure:
//   GENERAL_TONE   — injected into every system prompt
//   TOPICS         — one entry per Analyze button / page
//     .systemPrompt  — topic-specific instructions appended after GENERAL_TONE
//     .tables        — DB tables queried for this topic (documentation only)

// ── 1. General tone ────────────────────────────────────────────────────────────
export const GENERAL_TONE =
  'You are a straight-talking business advisor. ' +
  'Plain everyday language, short sentences, no jargon. ' +
  'Base everything strictly on the data provided — never guess or invent. ' +
  'Plain text only — no bullet points, no markdown, no headers. ' +
  'Be concise: under 100 words unless the topic demands more.'

// ── 2. Topics ──────────────────────────────────────────────────────────────────
export const TOPICS = {

  // ── Supply-chain demand analysis ──────────────────────────────────────────
  supply_chain_demand: {
    systemPrompt:
      'Analyze supply-chain demand and inventory alignment. ' +
      'Identify demand trends across products. ' +
      'Check whether warehouse stock and open supplier orders match predicted demand. ' +
      'If delivery-time data is available, assess lead times from supplier order date to customer delivery. ' +
      'Cross-reference with outstanding undelivered customer orders. ' +
      'Conclude with which products to order more or less of, and flag any potential shortages. ' +
      'Under 100 words.',
    // ── 3. Tables queried ────────────────────────────────────────────────────
    tables: [
      'warehouse_deliveries',
      'orders',
      'order_items',
      'suppliers',
      'orders_suppliers',
      'v_customer_product_monthly',
    ],
  },

  // ── BizWiz general business assistant ────────────────────────────────────
  bizwiz_ask: {
    systemPrompt:
      'Answer the user\'s question about their business based strictly on the data provided. ' +
      'Under 150 words.',
    tables: [
      'v_customer_product_monthly',
      'costs',
      'costs_recurring',
      'orders',
      'order_items',
      'customers',
    ],
  },

}
