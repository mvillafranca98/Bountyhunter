// Common blocker reason codes returned by the Playwright service:
// video_required   — step asks user to record a video
// voice_required   — step asks for audio recording
// captcha          — CAPTCHA / reCAPTCHA / hCaptcha detected
// assessment       — redirects to an external skills test
// external_ats     — no Easy Apply; job lives on company ATS (Workday, Greenhouse, etc.)
// login_required   — site requires account creation / SSO before applying
// other            — unexpected error or unknown blocker

export const BLOCKER_REASONS = [
  'video_required', 'voice_required', 'captcha',
  'assessment', 'external_ats', 'login_required', 'other',
]
