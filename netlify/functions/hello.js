// netlify/functions/hello.js
export async function handler() {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, now: new Date().toISOString() }),
  }
}
