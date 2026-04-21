const quotes = [
  "The secret of getting ahead is getting started.",
  "Focus on being productive instead of busy.",
  "Your future self will thank you.",
  "Small progress is still progress.",
  "Discipline is choosing what you want most over what you want now.",
  "The only way to do great work is to love what you do.",
  "Don't watch the clock; do what it does. Keep going.",
  "Success is the sum of small efforts repeated day in and day out.",
  "Stay focused, go after your dreams and keep moving toward your goals.",
  "Concentrate all your thoughts upon the work at hand."
];

const params = new URLSearchParams(window.location.search);
const domain = params.get('domain');
const reason = params.get('reason') || 'blocked';
const dailyLimit = parseInt(params.get('dailyLimit'), 10) || 0;
const tabIdFromUrl = params.get('tabId');
const parsedTabId =
  tabIdFromUrl != null && tabIdFromUrl !== '' ? parseInt(tabIdFromUrl, 10) : NaN;
const hasValidTabId = Number.isInteger(parsedTabId) && parsedTabId >= 0;

async function resolveTabId() {
  if (hasValidTabId) return parsedTabId;
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) return tab.id;
  } catch {
    /* */
  }
  return null;
}

if (domain) {
  document.getElementById('domainName').textContent = domain;
} else {
  document.querySelector('.message').textContent = 'This site is blocked to help you stay in flow.';
}

if (reason === 'limitReached') {
  document.getElementById('limitInfo').classList.remove('hidden');
  document.getElementById('dailyLimit').textContent = dailyLimit || '0';
}

const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
document.getElementById('motivationalQuote').textContent = `"${randomQuote}"`;

document.getElementById('goBackBtn').addEventListener('click', async () => {
  const tabId = await resolveTabId();
  if (tabId != null && chrome.tabs?.goBack) {
    try {
      await chrome.tabs.goBack(tabId);
      return;
    } catch {
      /* no history */
    }
  }
  window.location.href = 'https://google.com';
});

