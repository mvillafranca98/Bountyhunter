const DEFAULT_API_URL = 'https://bountyhunter-worker.a-mencias99.workers.dev'

// DOM elements
const sectionLogin = document.getElementById('sectionLogin')
const sectionMain = document.getElementById('sectionMain')
const loginEmail = document.getElementById('loginEmail')
const loginPassword = document.getElementById('loginPassword')
const loginBtn = document.getElementById('loginBtn')
const loginError = document.getElementById('loginError')
const importBtn = document.getElementById('importBtn')
const statusArea = document.getElementById('statusArea')
const userEmail = document.getElementById('userEmail')
const logoutBtn = document.getElementById('logoutBtn')
const tabUrl = document.getElementById('tabUrl')
const settingsToggle = document.getElementById('settingsToggle')
const settingsPanel = document.getElementById('settingsPanel')
const settingsBack = document.getElementById('settingsBack')
const mainContent = document.getElementById('mainContent')
const apiUrlInput = document.getElementById('apiUrlInput')
const saveApiUrl = document.getElementById('saveApiUrl')
const settingsSaved = document.getElementById('settingsSaved')

let currentApiUrl = DEFAULT_API_URL
let currentToken = null
let currentUser = null
let currentTabUrl = null

// Initialize
document.addEventListener('DOMContentLoaded', init)

async function init() {
  // Load stored data
  const data = await chrome.storage.local.get(['bh_token', 'bh_user', 'bh_api_url'])
  currentApiUrl = data.bh_api_url || DEFAULT_API_URL
  apiUrlInput.value = currentApiUrl

  // Detect current tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab && tab.url) {
      currentTabUrl = tab.url
      tabUrl.textContent = tab.url
    } else {
      tabUrl.textContent = 'No page detected'
    }
  } catch {
    tabUrl.textContent = 'Unable to detect page'
  }

  if (data.bh_token && data.bh_user) {
    currentToken = data.bh_token
    currentUser = data.bh_user
    showMainUI()
  } else {
    showLoginUI()
  }
}

// UI switching
function showLoginUI() {
  sectionLogin.classList.add('visible')
  sectionMain.classList.remove('visible')
  loginError.style.display = 'none'
  loginEmail.value = ''
  loginPassword.value = ''
}

function showMainUI() {
  sectionLogin.classList.remove('visible')
  sectionMain.classList.add('visible')
  userEmail.textContent = currentUser?.email || 'Logged in'
  statusArea.classList.remove('visible')
}

// Login
loginBtn.addEventListener('click', login)
loginPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login()
})

async function login() {
  const email = loginEmail.value.trim()
  const password = loginPassword.value.trim()

  if (!email || !password) {
    showLoginError('Please enter email and password')
    return
  }

  loginBtn.disabled = true
  loginBtn.textContent = 'Logging in...'
  loginError.style.display = 'none'

  try {
    const res = await fetch(`${currentApiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const result = await res.json()

    if (!res.ok) {
      throw new Error(result.error || result.message || 'Login failed')
    }

    currentToken = result.token
    currentUser = { email: result.email || email }

    await chrome.storage.local.set({
      bh_token: currentToken,
      bh_user: currentUser
    })

    showMainUI()
  } catch (err) {
    showLoginError(err.message)
  } finally {
    loginBtn.disabled = false
    loginBtn.textContent = 'Log in'
  }
}

function showLoginError(msg) {
  loginError.textContent = msg
  loginError.style.display = 'block'
}

// Import job
importBtn.addEventListener('click', importJob)

async function importJob() {
  importBtn.disabled = true
  showStatus('loading', 'Importing job posting...')

  try {
    // Get current tab URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.url) {
      throw new Error('No active tab found')
    }

    const url = tab.url

    // Optionally get page content from content script
    let pageContent = null
    try {
      pageContent = await chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' })
    } catch {
      // Content script may not be loaded on certain pages
    }

    // Call the API
    const res = await fetch(`${currentApiUrl}/jobs/import-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ url })
    })

    if (res.status === 401) {
      // Token expired — force logout
      await logout()
      showLoginError('Session expired. Please log in again.')
      return
    }

    const result = await res.json()

    if (!res.ok) {
      throw new Error(result.error || result.message || 'Import failed')
    }

    // Show success
    const job = result.job || result
    const title = job.title || job.jobTitle || 'Job imported'
    const company = job.company || job.companyName || ''
    const fitScore = job.fitScore ?? job.fit_score ?? null

    showStatus('success', { title, company, fitScore })
  } catch (err) {
    showStatus('error', err.message)
  } finally {
    importBtn.disabled = false
  }
}

function showStatus(type, data) {
  statusArea.classList.add('visible')

  if (type === 'loading') {
    statusArea.innerHTML = `
      <div class="status-loading">
        <div class="spinner"></div>
        <span>${data}</span>
      </div>
    `
  } else if (type === 'success') {
    const scoreClass = data.fitScore >= 70 ? 'high' : data.fitScore >= 40 ? 'medium' : 'low'
    const scoreHtml = data.fitScore !== null && data.fitScore !== undefined
      ? `<div class="fit-score ${scoreClass}">Fit Score: ${data.fitScore}%</div>`
      : ''

    statusArea.innerHTML = `
      <div class="status-success">
        <div class="title">Imported successfully</div>
        <div class="job-title">${escapeHtml(data.title)}</div>
        ${data.company ? `<div class="job-company">${escapeHtml(data.company)}</div>` : ''}
        ${scoreHtml}
      </div>
    `
  } else if (type === 'error') {
    statusArea.innerHTML = `
      <div class="status-error">
        <strong>Error:</strong> ${escapeHtml(data)}
      </div>
    `
  }
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// Logout
logoutBtn.addEventListener('click', logout)

async function logout() {
  currentToken = null
  currentUser = null
  await chrome.storage.local.remove(['bh_token', 'bh_user'])
  showLoginUI()
}

// Settings
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.add('visible')
  mainContent.style.display = 'none'
})

settingsBack.addEventListener('click', () => {
  settingsPanel.classList.remove('visible')
  mainContent.style.display = 'block'
  settingsSaved.style.display = 'none'
})

saveApiUrl.addEventListener('click', async () => {
  const url = apiUrlInput.value.trim() || DEFAULT_API_URL
  currentApiUrl = url.replace(/\/+$/, '') // remove trailing slash
  apiUrlInput.value = currentApiUrl
  await chrome.storage.local.set({ bh_api_url: currentApiUrl })
  settingsSaved.style.display = 'block'
  setTimeout(() => { settingsSaved.style.display = 'none' }, 2000)
})
