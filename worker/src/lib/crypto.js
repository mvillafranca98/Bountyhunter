// Web Crypto helpers for Cloudflare Workers (no Node.js crypto)

export async function hashPassword(password) {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const hashArr = Array.from(new Uint8Array(bits))
  const saltArr = Array.from(salt)
  return btoa(JSON.stringify({ salt: saltArr, hash: hashArr }))
}

export async function verifyPassword(password, stored) {
  const encoder = new TextEncoder()
  const { salt: saltArr, hash: hashArr } = JSON.parse(atob(stored))
  const salt = new Uint8Array(saltArr)
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const newHash = Array.from(new Uint8Array(bits))
  return newHash.every((b, i) => b === hashArr[i])
}

export function generateId() {
  return crypto.randomUUID()
}

// Minimal JWT — sign/verify using HMAC-SHA256 (no external lib needed)
function base64url(data) {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  )
}

export async function signJWT(payload, secret) {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`))
  return `${header}.${body}.${base64url(sig)}`
}

export async function verifyJWT(token, secret) {
  const [header, body, sig] = token.split('.')
  if (!header || !body || !sig) throw new Error('Invalid token')
  const key = await hmacKey(secret)
  const valid = await crypto.subtle.verify(
    'HMAC', key,
    Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
    new TextEncoder().encode(`${header}.${body}`)
  )
  if (!valid) throw new Error('Invalid signature')
  const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('Token expired')
  return payload
}
