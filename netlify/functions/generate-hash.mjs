// netlify/functions/generate-hash.mjs
// This is a utility function to generate password hashes
// Call it once to get hashes, then delete this file
import bcrypt from 'bcryptjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(200, {})
  if (event.httpMethod === 'POST') return generateHash(event)
  return cors(405, { error: 'Method not allowed' })
}

async function generateHash(event) {
  try {
    const body = JSON.parse(event.body || '{}')
    const { password } = body

    if (!password) {
      return cors(400, { error: 'Password required' })
    }

    // Generate hash with bcrypt
    const hash = await bcrypt.hash(password, 10)

    return cors(200, {
      password: password,
      hash: hash,
      instructions: 'Use this hash in your SQL UPDATE statement'
    })

  } catch (e) {
    console.error('Generate hash error:', e)
    return cors(500, { 
      error: 'Failed to generate hash', 
      details: String(e?.message || e) 
    })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  }
}