# BountyHunter Chrome Extension

Import any job posting to BountyHunter with one click. Get AI scoring and tailored resumes instantly.

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project

### Generating icons (optional)

The extension works without icons, but to generate them:

1. Open `extension/icons/generate-icons.html` in Chrome
2. Three PNG files will download automatically (`icon16.png`, `icon48.png`, `icon128.png`)
3. Move them into the `extension/icons/` folder
4. Reload the extension in `chrome://extensions`

## Usage

1. Navigate to any job posting page (LinkedIn, Indeed, company career pages, etc.)
2. Click the BountyHunter extension icon in the toolbar
3. Log in with your BountyHunter account (you only need to do this once)
4. Click **Import this job**
5. The extension will send the job URL to BountyHunter and display the job title, company, and your fit score

## API URL

The extension defaults to the deployed worker at `https://bountyhunter-worker.a-mencias99.workers.dev`.

To use a different API (e.g., local development at `http://localhost:8787`):

1. Click the gear icon in the extension header
2. Enter your API URL
3. Click **Save**
