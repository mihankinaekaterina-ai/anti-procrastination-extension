const BLOCK_RULE_ID = 1;
const ACCESS_ALARM = "access-expired";
let ruleSyncQueue = Promise.resolve();

const BLOCKED_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "instagram.com",
  "tiktok.com",
  "twitch.tv",
  "vk.ru"
];

const DEFAULT_SETTINGS = {
  taskTypes: {
    read: true,
    solve: true,
    code: true
  },
  rewardMinutes: 15
};

const DEFAULT_STATS = {
  completedTasks: 0,
  earnedMinutes: 0
};

function isBlockedUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function ensureDefaults() {
  const data = await chrome.storage.local.get(["settings", "stats"]);
  const updates = {};

  if (!data.settings) updates.settings = DEFAULT_SETTINGS;
  if (!data.stats) updates.stats = DEFAULT_STATS;

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

async function syncBlockingRules() {
  const data = await chrome.storage.local.get("accessUntil");
  const accessUntil = Number(data.accessUntil) || 0;
  const hasTemporaryAccess = accessUntil > Date.now();
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const hasBlockingRule = currentRules.some((rule) => rule.id === BLOCK_RULE_ID);

  if (hasTemporaryAccess) {
    if (hasBlockingRule) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [BLOCK_RULE_ID]
      });
    }

    await chrome.alarms.clear(ACCESS_ALARM);
    await chrome.alarms.create(ACCESS_ALARM, { when: accessUntil });
    return;
  }

  await chrome.alarms.clear(ACCESS_ALARM);

  if (!hasBlockingRule) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: BLOCK_RULE_ID,
          priority: 1,
          action: {
            type: "redirect",
            redirect: { extensionPath: "/blocked.html" }
          },
          condition: {
            requestDomains: BLOCKED_DOMAINS,
            resourceTypes: ["main_frame"]
          }
        }
      ]
    });
  }
}

function queueSyncBlockingRules() {
  ruleSyncQueue = ruleSyncQueue.catch(() => {}).then(syncBlockingRules);
  return ruleSyncQueue;
}

async function grantTemporaryAccess(tabId) {
  await ensureDefaults();
  const data = await chrome.storage.local.get(["settings", "stats", "accessUntil"]);
  const minutes = Math.max(1, Math.min(60, Number(data.settings?.rewardMinutes) || 15));
  const currentUntil = Number(data.accessUntil) || 0;
  const accessUntil = Math.max(Date.now(), currentUntil) + minutes * 60 * 1000;
  const stats = {
    ...DEFAULT_STATS,
    ...(data.stats || {})
  };

  stats.completedTasks += 1;
  stats.earnedMinutes += minutes;

  await chrome.storage.local.set({ accessUntil, stats });

  if (Number.isInteger(tabId)) {
    await chrome.storage.local.remove(`pending_${tabId}`);
  }

  await queueSyncBlockingRules();
  return { ok: true, accessUntil, rewardMinutes: minutes };
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0 || !isBlockedUrl(details.url)) return;

  // Сохраняем исходный адрес, чтобы после выполнения задания вернуть пользователя на него.
  await chrome.storage.local.set({ [`pending_${details.tabId}`]: details.url });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ACCESS_ALARM) {
    await queueSyncBlockingRules();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await queueSyncBlockingRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await queueSyncBlockingRules();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "complete-task") {
    grantTemporaryAccess(message.tabId)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "settings-updated") {
    queueSyncBlockingRules()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "get-status") {
    chrome.storage.local.get(["settings", "stats", "accessUntil"])
      .then((data) => sendResponse({
        settings: data.settings || DEFAULT_SETTINGS,
        stats: data.stats || DEFAULT_STATS,
        accessUntil: Number(data.accessUntil) || 0
      }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  return false;
});

// Service Worker может запускаться повторно, поэтому состояние правил
// каждый раз сверяется с сохранённым временем доступа.
ensureDefaults().then(queueSyncBlockingRules).catch(console.error);
