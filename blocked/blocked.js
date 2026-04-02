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
const timeSpent = parseInt(params.get('timeSpent')) || 0;
const dailyLimit = parseInt(params.get('dailyLimit')) || 0;
const hardBlock = params.get('hardBlock') === 'true';

if (domain) {
  document.getElementById('domainName').textContent = domain;
} else {
  document.querySelector('.message').textContent = 'This site is blocked to help you stay in flow.';
}

if (reason === 'limitReached' || reason === 'noLimit') {
  document.getElementById('limitInfo').classList.remove('hidden');
  document.getElementById('dailyLimit').textContent = dailyLimit || '0';
  
  if (hardBlock) {
    document.getElementById('hardBlockInfo').classList.remove('hidden');
  } else {
    document.getElementById('warningInfo').classList.remove('hidden');
    document.getElementById('continueSection').classList.remove('hidden');
  }
}

const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
document.getElementById('motivationalQuote').textContent = `"${randomQuote}"`;

document.getElementById('goBackBtn').addEventListener('click', () => {
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: 'goBack' });
  } else {
    window.location.href = 'https://google.com';
  }
});

const continueBtn = document.getElementById('continueBtn');
if (continueBtn) {
  continueBtn.addEventListener('click', () => {
    if (chrome.runtime && chrome.runtime.sendMessage && domain) {
      chrome.runtime.sendMessage({ action: 'continueAnyway', domain });
    }
  });
}
