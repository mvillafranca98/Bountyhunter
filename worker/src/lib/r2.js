// R2 helpers for resume/cover letter/screenshot storage

export async function uploadToR2(env, key, data, contentType = 'application/octet-stream') {
  await env.STORAGE.put(key, data, { httpMetadata: { contentType } })
  return key
}

export async function getFromR2(env, key) {
  const obj = await env.STORAGE.get(key)
  if (!obj) return null
  return obj
}

export async function deleteFromR2(env, key) {
  await env.STORAGE.delete(key)
}

// Generate a time-limited signed URL for direct browser download
// Note: R2 presigned URLs require Cloudflare Workers presign API
// For now, proxy through the worker at /storage/:key
export function buildProxyUrl(baseUrl, key) {
  return `${baseUrl}/storage/${encodeURIComponent(key)}`
}

export function resumeKey(userId, filename) {
  return `resumes/${userId}/${Date.now()}_${filename}`
}

export function resumeVersionKey(userId, jobId) {
  return `resume_versions/${userId}/${jobId}_${Date.now()}.pdf`
}

export function screenshotKey(userId, jobId) {
  return `screenshots/${userId}/${jobId}_${Date.now()}.png`
}
