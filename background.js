const STORAGE_KEY = 'focusMode';
const ALARM_NAME = 'dailyReset';

async function getStorage() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {
    blockedSites: {},
    lastReset: new Date().toDateString()
  };
}

async function setStorage(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isBlockedDomain(url, blockedSites) {
  const domain = extractDomain(url);
  if (!domain) return null;
  
  for (const blockedDomain of Object.keys(blockedSites)) {
    if (domain === blockedDomain || domain.endsWith('.' + blockedDomain)) {
      return blockedDomain;
    }
  }
  return null;
}

async function checkAndResetDaily() {
  const data = await getStorage();
  const today = new Date().toDateString();
  
  if (data.lastReset !== today) {
    for (const domain of Object.keys(data.blockedSites)) {
      data.blockedSites[domain].timeSpent = 0;
    }
    data.lastReset = today;
    await setStorage(data);
  }
}

async function shouldBlock(url) {
  await checkAndResetDaily();
  const data = await getStorage();
  const matchedDomain = isBlockedDomain(url, data.blockedSites);
  
  if (!matchedDomain) return { block: false };
  
  const site = data.blockedSites[matchedDomain];

  const activeDays = site.activeDays ?? [true, true, true, true, true, true, true];
  if (!activeDays[new Date().getDay()]) {
    return { block: false, domain: matchedDomain };
  }
  
  if (site.dailyLimit === 0) {
    return { 
      block: true, 
      domain: matchedDomain, 
      reason: 'noLimit'
    };
  }
  
  if (site.timeSpent >= site.dailyLimit) {
    return { 
      block: true, 
      domain: matchedDomain, 
      reason: 'limitReached', 
      timeSpent: site.timeSpent, 
      dailyLimit: site.dailyLimit
    };
  }
  
  return { block: false, domain: matchedDomain, timeRemaining: site.dailyLimit - site.timeSpent };
}

/* ── Time tracking ─────────────────────────────────────────────────── */

const activeTabTimers = new Map();

async function startTracking(tabId, domain) {
  if (activeTabTimers.has(tabId)) {
    stopTracking(tabId);
  }
  
  activeTabTimers.set(tabId, {
    domain,
    startTime: Date.now(),
    interval: setInterval(async () => {
      await incrementTimeSpent(tabId, domain, 1);
    }, 60000)
  });
}

function stopTracking(tabId) {
  const timer = activeTabTimers.get(tabId);
  if (timer) {
    clearInterval(timer.interval);
    const elapsedMs = Date.now() - timer.startTime;
    const elapsedMinutes = elapsedMs / 60000;
    const fractionalMinutes = elapsedMinutes % 1;
    if (fractionalMinutes > 0) {
      incrementTimeSpent(tabId, timer.domain, fractionalMinutes);
    }
    activeTabTimers.delete(tabId);
  }
}

async function incrementTimeSpent(sourceTabId, domain, minutes) {
  const data = await getStorage();
  if (!data.blockedSites[domain]) return;

  data.blockedSites[domain].timeSpent = (data.blockedSites[domain].timeSpent || 0) + minutes;
  await setStorage(data);
  
  const site = data.blockedSites[domain];
  if (site.dailyLimit > 0 && site.timeSpent >= site.dailyLimit) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && isBlockedDomain(tab.url, { [domain]: site }) === domain) {
        redirectToBlocked(tab.id, domain, 'limitReached', site.timeSpent, site.dailyLimit);
      }
    }
  }
}

/* ── Redirect to blocked page ──────────────────────────────────────── */

function redirectToBlocked(tabId, domain, reason, timeSpent = 0, dailyLimit = 0) {
  const params = new URLSearchParams({
    domain,
    reason,
    timeSpent: String(Math.round(Number(timeSpent) || 0)),
    dailyLimit: String(Math.round(Number(dailyLimit) || 0)),
    tabId: String(tabId)
  });
  chrome.tabs.update(tabId, {
    url: chrome.runtime.getURL(`blocked/blocked.html?${params}`)
  });
}

/* ── Navigation interception ───────────────────────────────────────── */

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!/^https?:/i.test(details.url)) return;

  const result = await shouldBlock(details.url);

  if (result.block) {
    redirectToBlocked(details.tabId, result.domain, result.reason, result.timeSpent, result.dailyLimit);
  }
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  
  const data = await getStorage();
  const matchedDomain = isBlockedDomain(details.url, data.blockedSites);
  
  if (matchedDomain) {
    startTracking(details.tabId, matchedDomain);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stopTracking(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    stopTracking(tabId);
    
    const data = await getStorage();
    const matchedDomain = isBlockedDomain(changeInfo.url, data.blockedSites);
    
    if (matchedDomain) {
      startTracking(tabId, matchedDomain);
    }
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await checkAndResetDaily();
  
  chrome.alarms.create(ALARM_NAME, {
    when: getNextMidnight(),
    periodInMinutes: 24 * 60
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await checkAndResetDaily();
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = message.tabId ?? sender.tab?.id;
  if (typeof tabId !== 'number') return;

  if (message.action === 'goBack') {
    chrome.tabs.goBack(tabId).catch(() => {
      chrome.tabs.update(tabId, { url: 'chrome://newtab' }).catch(() => {
        chrome.tabs.remove(tabId);
      });
    });
  }
});

function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}
