// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContent') {
    sendResponse({
      text: document.body.innerText.slice(0, 10000),
      title: document.title,
      url: window.location.href
    })
  }
  return true
})
