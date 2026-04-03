import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bh_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bh_token')
      localStorage.removeItem('bh_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
}

// ─── Profile ───────────────────────────────────────────────────────────────────
export const profileApi = {
  get: () => api.get('/profile'),
  update: (data) => api.put('/profile', data),
  updateSalary: (data) => api.put('/profile/salary', data),
  updateRoles: (roles) => api.put('/profile/roles', { roles }),
}

// ─── Resume ────────────────────────────────────────────────────────────────────
export const resumeApi = {
  upload: (formData) => api.post('/resume/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 2 min — Claude parsing can be slow
  }),
  get: () => api.get('/resume'),
  getAll: () => api.get('/resume/all'),
}

// ─── Jobs ──────────────────────────────────────────────────────────────────────
export const jobsApi = {
  search: (data) => api.post('/jobs/search', data),
  seed: () => api.post('/jobs/seed', {}, { timeout: 90000 }), // AI generates 5 jobs — allow 90s
  list: (params) => api.get('/jobs', { params }),
  counts: () => api.get('/jobs/counts'),
  get: (id) => api.get(`/jobs/${id}`),
  prepare: (id) => api.post(`/jobs/${id}/prepare`, {}, { timeout: 90000 }),
  updateStatus: (id, status) => api.put(`/jobs/${id}/status`, { status }),
}

// ─── Applications ──────────────────────────────────────────────────────────────
export const applicationsApi = {
  apply: (jobId, data) => api.post(`/applications/${jobId}`, data),
  list: (params) => api.get('/applications', { params }),
  blockers: () => api.get('/applications/blockers'),
}

// ─── Question Bank ─────────────────────────────────────────────────────────────
export const questionsApi = {
  list: () => api.get('/questions'),
  seed: () => api.post('/questions/seed'),
  add: (data) => api.post('/questions', data),
  update: (id, answer) => api.put(`/questions/${id}`, { answer }),
  delete: (id) => api.delete(`/questions/${id}`),
  generate: (question, job_context) => api.post('/questions/generate', { question, job_context }),
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary'),
  pipeline: () => api.get('/dashboard/pipeline'),
  skillsGap: () => api.get('/dashboard/skills-gap'),
  analytics: () => api.get('/dashboard/analytics'),
}

export default api
