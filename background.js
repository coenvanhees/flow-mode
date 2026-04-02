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
  
  if (site.dailyLimit === 0) {
    return { 
      block: true, 
      domain: matchedDomain, 
      reason: 'noLimit',
      hardBlock: site.hardBlock
    };
  }
  
  if (site.timeSpent >= site.dailyLimit) {
    return { 
      block: true, 
      domain: matchedDomain, 
      reason: 'limitReached', 
      timeSpent: site.timeSpent, 
      dailyLimit: site.dailyLimit,
      hardBlock: site.hardBlock
    };
  }
  
  return { block: false, domain: matchedDomain, timeRemaining: site.dailyLimit - site.timeSpent };
}

const activeTabTimers = new Map();

async function startTracking(tabId, domain) {
  if (activeTabTimers.has(tabId)) {
    stopTracking(tabId);
  }
  
  activeTabTimers.set(tabId, {
    domain,
    startTime: Date.now(),
    interval: setInterval(async () => {
      await incrementTimeSpent(domain, 1);
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
      incrementTimeSpent(timer.domain, fractionalMinutes);
    }
    activeTabTimers.delete(tabId);
  }
}

async function incrementTimeSpent(domain, minutes) {
  const data = await getStorage();
  if (data.blockedSites[domain]) {
    data.blockedSites[domain].timeSpent = (data.blockedSites[domain].timeSpent || 0) + minutes;
    await setStorage(data);
    
    const site = data.blockedSites[domain];
    if (site.dailyLimit > 0 && site.timeSpent >= site.dailyLimit) {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && isBlockedDomain(tab.url, { [domain]: site }) === domain) {
          redirectToBlocked(tab.id, domain, 'limitReached', site.timeSpent, site.dailyLimit, site.hardBlock);
        }
      }
    }
  }
}

function redirectToBlocked(tabId, domain, reason, timeSpent = 0, dailyLimit = 0, hardBlock = true) {
  const params = new URLSearchParams({
    domain,
    reason,
    timeSpent: timeSpent.toString(),
    dailyLimit: dailyLimit.toString(),
    hardBlock: hardBlock.toString()
  });
  chrome.tabs.update(tabId, {
    url: chrome.runtime.getURL(`blocked/blocked.html?${params}`)
  });
}

const bypassedTabs = new Map();

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  
  const result = await shouldBlock(details.url);
  
  if (result.block) {
    const bypassKey = `${details.tabId}-${result.domain}`;
    const bypassTime = bypassedTabs.get(bypassKey);
    
    if (!result.hardBlock && bypassTime && (Date.now() - bypassTime) < 300000) {
      return;
    }
    
    redirectToBlocked(details.tabId, result.domain, result.reason, result.timeSpent, result.dailyLimit, result.hardBlock);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'goBack' && sender.tab) {
    chrome.tabs.goBack(sender.tab.id).catch(() => {
      chrome.tabs.update(sender.tab.id, { url: 'chrome://newtab' }).catch(() => {
        chrome.tabs.remove(sender.tab.id);
      });
    });
  }
  
  if (message.action === 'continueAnyway' && sender.tab && message.domain) {
    const bypassKey = `${sender.tab.id}-${message.domain}`;
    bypassedTabs.set(bypassKey, Date.now());
    
    const targetUrl = `https://${message.domain}`;
    chrome.tabs.update(sender.tab.id, { url: targetUrl });
  }
});

function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}
