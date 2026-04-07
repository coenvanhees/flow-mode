const STORAGE_KEY = 'focusMode';
const VIEW_PREF_KEY = 'focusModeViewPref';

const urlInput = document.getElementById('urlInput');
const addBtn = document.getElementById('addBtn');
const sitesList = document.getElementById('sitesList');
const emptyState = document.getElementById('emptyState');
const siteTemplate = document.getElementById('siteTemplate');
const viewToggle = document.getElementById('viewToggle');
const sitesCount = document.getElementById('sitesCount');

let currentView = 'list';

async function getStorage() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const data = result[STORAGE_KEY] || {
    blockedSites: {},
    siteOrder: [],
    lastReset: new Date().toDateString()
  };
  if (!data.siteOrder) {
    data.siteOrder = Object.keys(data.blockedSites);
  }
  return data;
}

async function setStorage(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function normalizeDomain(input) {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
  domain = domain.split('/')[0];
  return domain;
}

function formatTime(minutes) {
  if (minutes === 0) return 'Always block';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function getStatusInfo(site) {
  if (site.hardBlock || site.dailyLimit === 0) {
    return { status: 'blocked', label: 'Blocked' };
  }
  const percentage = (site.timeSpent / site.dailyLimit) * 100;
  if (percentage >= 100) {
    return { status: 'blocked', label: 'Limit reached' };
  } else if (percentage >= 75) {
    return { status: 'warning', label: `${Math.round(site.dailyLimit - site.timeSpent)}m left` };
  }
  return { status: 'ok', label: `${Math.round(site.dailyLimit - site.timeSpent)}m left` };
}

function getModeLabel(site) {
  if (site.dailyLimit === 0) {
    return site.hardBlock ? 'Always blocked' : 'Always warned';
  }
  return site.hardBlock ? 'Hard block' : 'Soft block';
}

let draggedItem = null;
let draggedDomain = null;

function getNaiveDropSlot(clientY, items) {
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return items.length;
}

function slotToDropIntent(slot, items) {
  if (items.length === 0) return null;
  if (slot < items.length) {
    return { domain: items[slot].dataset.domain, insertBefore: true };
  }
  return { domain: items[items.length - 1].dataset.domain, insertBefore: false };
}

function getDropIntent(clientY, draggingEl) {
  const items = [...sitesList.querySelectorAll('.site-item')].filter((i) => i !== draggingEl);
  if (items.length === 0) return null;
  const slot = getNaiveDropSlot(clientY, items);
  return slotToDropIntent(slot, items);
}

function clearDropIndicators() {
  sitesList.querySelectorAll('.site-item').forEach((el) => {
    el.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
  });
}

function renderSites(blockedSites, siteOrder = []) {
  sitesList.innerHTML = '';
  const allDomains = Object.keys(blockedSites);
  
  const orderedDomains = siteOrder.filter(d => allDomains.includes(d));
  const newDomains = allDomains.filter(d => !siteOrder.includes(d));
  const domains = [...orderedDomains, ...newDomains];
  
  sitesCount.textContent = domains.length === 0 ? '' : `${domains.length} site${domains.length !== 1 ? 's' : ''}`;
  
  if (domains.length === 0) {
    emptyState.classList.remove('hidden');
    viewToggle.classList.add('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  viewToggle.classList.remove('hidden');
  
  domains.forEach(domain => {
    const site = blockedSites[domain];
    const li = siteTemplate.content.cloneNode(true);
    const siteItem = li.querySelector('.site-item');
    
    li.querySelector('.site-domain').textContent = domain;
    
    const statusInfo = getStatusInfo(site);
    const statusBadge = li.querySelector('.site-status-badge');
    statusBadge.textContent = statusInfo.label;
    statusBadge.classList.add(statusInfo.status);
    
    const summaryUsage = li.querySelector('.summary-usage');
    const summaryTime = li.querySelector('.summary-time');
    const summaryMode = li.querySelector('.summary-mode');
    
    const timeSpent = site.timeSpent || 0;
    let usageText;
    if (timeSpent === 0) {
      usageText = 'No usage today';
    } else if (timeSpent < 1) {
      usageText = '<1m today';
    } else {
      usageText = `${Math.round(timeSpent)}m today`;
    }
    summaryUsage.textContent = usageText;
    summaryTime.textContent = site.dailyLimit === 0 ? 'No limit' : `${site.dailyLimit}m/day`;
    summaryMode.textContent = getModeLabel(site);
    
    const slider = li.querySelector('.time-slider');
    const timeValue = li.querySelector('.time-value');
    slider.value = site.dailyLimit;
    timeValue.textContent = formatTime(site.dailyLimit);
    
    const progressFill = li.querySelector('.progress-fill');
    const progressText = li.querySelector('.progress-text');
    
    if (site.hardBlock || site.dailyLimit === 0) {
      progressFill.style.width = '100%';
      progressFill.classList.add('danger');
      progressText.textContent = 'Blocked';
    } else {
      const percentage = Math.min((site.timeSpent / site.dailyLimit) * 100, 100);
      progressFill.style.width = `${percentage}%`;
      progressFill.classList.remove('warning', 'danger');
      if (percentage >= 100) {
        progressFill.classList.add('danger');
      } else if (percentage >= 75) {
        progressFill.classList.add('warning');
      }
      progressText.textContent = `${Math.round(site.timeSpent)} / ${site.dailyLimit} min`;
    }
    
    const hardBlockToggle = li.querySelector('.hard-block-toggle');
    const modeDescription = li.querySelector('.mode-description');
    hardBlockToggle.checked = site.hardBlock;
    
    if (site.dailyLimit === 0) {
      if (site.hardBlock) {
        modeDescription.textContent = 'Always blocked — completely inaccessible';
        modeDescription.classList.add('hard-mode');
        modeDescription.classList.remove('soft-mode');
      } else {
        modeDescription.textContent = 'Always warned — shows warning, but you can bypass';
        modeDescription.classList.add('soft-mode');
        modeDescription.classList.remove('hard-mode');
      }
    } else if (site.hardBlock) {
      modeDescription.textContent = 'Blocked after time limit — no access allowed';
      modeDescription.classList.add('hard-mode');
      modeDescription.classList.remove('soft-mode');
    } else {
      modeDescription.textContent = 'Warning only — reminds you, but you can continue';
      modeDescription.classList.add('soft-mode');
      modeDescription.classList.remove('hard-mode');
    }
    
    siteItem.addEventListener('click', (e) => {
      if (currentView !== 'list') return;
      if (e.target.closest('.btn-delete') || 
          e.target.closest('.time-slider') || 
          e.target.closest('.toggle') ||
          e.target.closest('input') ||
          e.target.closest('.drag-handle')) {
        return;
      }
      
      const wasExpanded = siteItem.classList.contains('expanded');
      sitesList.querySelectorAll('.site-item.expanded').forEach(item => {
        item.classList.remove('expanded');
      });
      
      if (!wasExpanded) {
        siteItem.classList.add('expanded');
        const controls = siteItem.querySelector('.site-controls');
        let scrolled = false;
        const scrollExpandedIntoView = () => {
          if (scrolled) return;
          scrolled = true;
          siteItem.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
            inline: 'nearest'
          });
        };
        const onExpandDone = (e) => {
          if (e.target !== controls || e.propertyName !== 'grid-template-rows') return;
          controls.removeEventListener('transitionend', onExpandDone);
          scrollExpandedIntoView();
        };
        if (controls) controls.addEventListener('transitionend', onExpandDone);
        setTimeout(() => {
          controls?.removeEventListener('transitionend', onExpandDone);
          scrollExpandedIntoView();
        }, 200);
      }
    });
    
    slider.addEventListener('input', async (e) => {
      const newLimit = parseInt(e.target.value);
      timeValue.textContent = formatTime(newLimit);
    });
    
    slider.addEventListener('change', async (e) => {
      const newLimit = parseInt(e.target.value);
      const data = await getStorage();
      if (data.blockedSites[domain]) {
        data.blockedSites[domain].dailyLimit = newLimit;
        await setStorage(data);
        renderSites(data.blockedSites, data.siteOrder);
      }
    });
    
    hardBlockToggle.addEventListener('change', async (e) => {
      const data = await getStorage();
      if (data.blockedSites[domain]) {
        data.blockedSites[domain].hardBlock = e.target.checked;
        await setStorage(data);
        renderSites(data.blockedSites, data.siteOrder);
      }
    });
    
    li.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = confirm(`Remove "${domain}" from your blocked sites?\n\nYou'll need to add it again if you want to block it later.`);
      if (!confirmed) return;
      
      const data = await getStorage();
      delete data.blockedSites[domain];
      data.siteOrder = data.siteOrder.filter(d => d !== domain);
      await setStorage(data);
      renderSites(data.blockedSites, data.siteOrder);
    });
    
    siteItem.dataset.domain = domain;
    siteItem.setAttribute('draggable', 'true');
    let pendingDragFromHandle = false;
    siteItem.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      pendingDragFromHandle = Boolean(e.target.closest('.drag-handle'));
    });
    siteItem.addEventListener('dragstart', (e) => {
      const fromHandle = pendingDragFromHandle;
      pendingDragFromHandle = false;
      if (currentView !== 'list' || !fromHandle) {
        e.preventDefault();
        return;
      }
      draggedItem = siteItem;
      draggedDomain = domain;
      siteItem.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', domain);
      setTimeout(() => {
        if (siteItem.classList.contains('dragging')) {
          siteItem.classList.add('dragging-pass-through');
        }
      }, 0);
    });
    siteItem.addEventListener('dragend', () => {
      siteItem.classList.remove('dragging', 'dragging-pass-through');
      draggedItem = null;
      draggedDomain = null;
      pendingDragFromHandle = false;
      clearDropIndicators();
    });
    
    sitesList.appendChild(li);
  });
}

async function addSite() {
  const domain = normalizeDomain(urlInput.value);
  
  if (!domain) {
    urlInput.focus();
    return;
  }
  
  if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/.test(domain)) {
    urlInput.setCustomValidity('Please enter a valid domain');
    urlInput.reportValidity();
    return;
  }
  
  const data = await getStorage();
  
  if (data.blockedSites[domain]) {
    urlInput.setCustomValidity('This site is already blocked');
    urlInput.reportValidity();
    return;
  }
  
  data.blockedSites[domain] = {
    dailyLimit: 30,
    hardBlock: false,
    timeSpent: 0
  };
  
  await setStorage(data);
  urlInput.value = '';
  urlInput.setCustomValidity('');
  renderSites(data.blockedSites, data.siteOrder);
}

addBtn.addEventListener('click', addSite);

urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addSite();
  }
});

urlInput.addEventListener('input', () => {
  urlInput.setCustomValidity('');
});

function setView(view) {
  currentView = view;
  sitesList.classList.remove('list-view', 'card-view');
  sitesList.classList.add(`${view}-view`);
  
  viewToggle.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  
  if (view === 'card') {
    sitesList.querySelectorAll('.site-item.expanded').forEach(item => {
      item.classList.remove('expanded');
    });
  }
  
  chrome.storage.local.set({ [VIEW_PREF_KEY]: view });
}

async function init() {
  const viewPref = await chrome.storage.local.get(VIEW_PREF_KEY);
  currentView = viewPref[VIEW_PREF_KEY] || 'list';
  setView(currentView);

  const data = await getStorage();
  renderSites(data.blockedSites, data.siteOrder);
}

viewToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.view-btn');
  if (btn && btn.dataset.view) {
    setView(btn.dataset.view);
  }
});

sitesList.addEventListener('dragover', (e) => {
  if (currentView !== 'list' || !draggedItem) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const intent = getDropIntent(e.clientY, draggedItem);
  if (!intent) return;
  clearDropIndicators();
  const targetEl = sitesList.querySelector(
    `.site-item[data-domain="${CSS.escape(intent.domain)}"]`
  );
  if (targetEl) {
    targetEl.classList.add(
      'drag-over',
      intent.insertBefore ? 'drag-over-before' : 'drag-over-after'
    );
  }
});

sitesList.addEventListener('drop', async (e) => {
  if (currentView !== 'list' || !draggedDomain || !draggedItem) return;
  e.preventDefault();
  const intent = getDropIntent(e.clientY, draggedItem);
  clearDropIndicators();
  if (!intent) return;

  const data = await getStorage();
  const allDomains = Object.keys(data.blockedSites);
  let currentOrder = data.siteOrder.filter((d) => allDomains.includes(d));
  const newDomains = allDomains.filter((d) => !data.siteOrder.includes(d));
  currentOrder = [...currentOrder, ...newDomains];

  const fromIndex = currentOrder.indexOf(draggedDomain);
  const toIndex = currentOrder.indexOf(intent.domain);
  if (fromIndex === -1 || toIndex === -1) return;

  let insertIndex = intent.insertBefore ? toIndex : toIndex + 1;
  if (fromIndex < insertIndex) insertIndex--;

  if (insertIndex === fromIndex) return;

  const next = [...currentOrder];
  next.splice(fromIndex, 1);
  next.splice(insertIndex, 0, draggedDomain);
  if (next.join('\0') === currentOrder.join('\0')) return;

  data.siteOrder = next;
  await setStorage(data);
  renderSites(data.blockedSites, data.siteOrder);
});

init();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) {
    const newData = changes[STORAGE_KEY].newValue;
    if (newData) {
      renderSites(newData.blockedSites, newData.siteOrder || []);
    }
  }
});
