// netlify/functions/utils/ai.mjs
// Shared utility for calling the Claude API and logging usage for billing.
// Import into any Netlify function that needs AI analysis:
//   import { callClaude, logAiUsage } from './utils/ai.mjs'

const ANTHROPIC_API     = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL     = 'claude-3-5-haiku-20241022'

/**
 * Call the Claude API with a system + user prompt.
 *
 * @param {{ systemPrompt: string, userPrompt: string, model?: string, maxTokens?: number }}
 * @returns {{ text: string, inputTokens: number, outputTokens: number, model: string }}
 */
export async function callClaude({
  systemPrompt,
  userPrompt,
  model     = DEFAULT_MODEL,
  maxTokens = 500,
}) {
  const { ANTHROPIC_API_KEY } = process.env
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'x-api-key':         ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `Anthropic API error ${res.status}`)

  return {
    text:         data.content?.[0]?.text  ?? '',
    inputTokens:  data.usage?.input_tokens  ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    model:        data.model ?? model,
  }
}

/**
 * Log one AI call to ai_usage_log for Stripe metered billing.
 * Safe to call with await — throws on DB error so callers can decide
 * whether to surface the error or swallow it.
 */
export async function logAiUsage({ sql, tenantId, feature, model, inputTokens, outputTokens }) {
  await sql`
    INSERT INTO public.ai_usage_log
      (tenant_id, feature, model, input_tokens, output_tokens)
    VALUES
      (${tenantId}, ${feature}, ${model}, ${inputTokens}, ${outputTokens})
  `
}
