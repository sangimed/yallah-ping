import type {
  AlertRecord,
  AppSettings,
  ChangeSummary,
  EditableWatchFields,
  MessageFromContent,
  MessageFromUi,
  RuntimeMessage,
  WatchRecord
} from "../types";
import { normalizeAlarmPresetId } from "../shared/alarm-presets";
import {
  createTab,
  createWindow,
  executeScriptFile,
  getAllWindows,
  onRuntimeMessage,
  queryTabs,
  sendTabMessage,
  updateWindow
} from "../shared/browser";
import { createId, isSamePage } from "../shared/dom";
import { DEFAULT_STATE, loadState, mutateState, saveState } from "../shared/storage";
import { normalizeThemeMode } from "../shared/theme";

function cloneWatch(watch: WatchRecord): WatchRecord {
  return structuredClone(watch);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getActiveAlerts(alerts: AlertRecord[]): AlertRecord[] {
  return alerts.filter((alert) => !alert.acknowledgedAt);
}

function sanitizeSettingsPatch(patch: Partial<AppSettings>, current: AppSettings): AppSettings {
  const hasCustomAudioPatch = Object.prototype.hasOwnProperty.call(patch, "customAudio");
  const customAudio = hasCustomAudioPatch ? patch.customAudio : current.customAudio;
  const rawAudioMode = patch.audioMode ?? current.audioMode;
  let audioMode: AppSettings["audioMode"] = rawAudioMode === "custom" ? "custom" : "preset";

  if (audioMode === "custom" && !customAudio?.dataUrl) {
    audioMode = "preset";
  }

  const nextSettings: AppSettings = {
    ...current,
    ...patch,
    audioMode,
    audioPresetId: normalizeAlarmPresetId(patch.audioPresetId ?? current.audioPresetId),
    customAudio,
    themeMode: normalizeThemeMode(patch.themeMode ?? current.themeMode),
    defaultPollIntervalMs: Math.max(2000, Number(patch.defaultPollIntervalMs ?? current.defaultPollIntervalMs)),
    defaultMutationDebounceMs: Math.max(
      150,
      Number(patch.defaultMutationDebounceMs ?? current.defaultMutationDebounceMs)
    ),
    alertVolume: Math.max(0.05, Math.min(1, Number(patch.alertVolume ?? current.alertVolume)))
  };

  if (!nextSettings.defaultUseMutationObserver && !nextSettings.defaultUsePolling) {
    nextSettings.defaultUsePolling = true;
  }

  return nextSettings;
}

function sanitizeWatchPatch(
  patch: Partial<EditableWatchFields>,
  current: WatchRecord
): Partial<EditableWatchFields> {
  const nextPatch: Partial<EditableWatchFields> = {};

  if (typeof patch.label === "string") {
    nextPatch.label = patch.label.trim() || current.label;
  }

  if (typeof patch.enabled === "boolean") {
    nextPatch.enabled = patch.enabled;
  }

  if (typeof patch.pollIntervalMs === "number" && Number.isFinite(patch.pollIntervalMs)) {
    nextPatch.pollIntervalMs = Math.max(2000, Math.round(patch.pollIntervalMs));
  }

  if (typeof patch.mutationDebounceMs === "number" && Number.isFinite(patch.mutationDebounceMs)) {
    nextPatch.mutationDebounceMs = Math.max(150, Math.round(patch.mutationDebounceMs));
  }

  if (typeof patch.useMutationObserver === "boolean") {
    nextPatch.useMutationObserver = patch.useMutationObserver;
  }

  if (typeof patch.usePolling === "boolean") {
    nextPatch.usePolling = patch.usePolling;
  }

  const nextUseMutationObserver = nextPatch.useMutationObserver ?? current.useMutationObserver;
  const nextUsePolling = nextPatch.usePolling ?? current.usePolling;
  if (!nextUseMutationObserver && !nextUsePolling) {
    nextPatch.usePolling = true;
  }

  return nextPatch;
}

async function updateBadge(): Promise<void> {
  const state = await loadState();
  const count = getActiveAlerts(state.alerts).length;
  await chrome.action.setBadgeBackgroundColor({ color: count ? "#b91c1c" : "#94a3b8" });
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
}

async function getRelevantWatches(pageUrl: string): Promise<WatchRecord[]> {
  const state = await loadState();
  return state.watches.filter((watch) => isSamePage(watch.pageUrl, pageUrl));
}

async function syncTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url) {
    return;
  }

  const relevantWatches = await getRelevantWatches(tab.url);

  try {
    await sendTabMessage(tab.id, {
      type: "SYNC_WATCHES",
      watches: relevantWatches.map(cloneWatch)
    });
  } catch (error) {
    // The content script is not available on restricted browser pages.
    console.debug("Sync ignorée pour cet onglet", error);
  }
}

async function ensureTabCanReceiveMessages(tabId: number): Promise<void> {
  try {
    await sendTabMessage(tabId, { type: "START_SELECTION" });
    return;
  } catch (firstError) {
    try {
      await executeScriptFile(tabId, ["content.js"]);
      await wait(120);
      await sendTabMessage(tabId, { type: "START_SELECTION" });
      return;
    } catch (secondError) {
      console.warn("Impossible d'activer la sélection visuelle", {
        firstError,
        secondError,
        tabId
      });
      throw new Error(
        "Impossible d'activer la sélection sur cette page. Rechargez l'onglet puis réessayez. Si la page est interne au navigateur, cette action n'est pas autorisée."
      );
    }
  }
}

async function syncAllTabs(): Promise<void> {
  const tabs = await queryTabs({});
  await Promise.all(tabs.map((tab) => syncTab(tab)));
}

async function openOptionsPage(): Promise<void> {
  if (typeof browser !== "undefined") {
    await browser.runtime.openOptionsPage();
    return;
  }

  await new Promise<void>((resolve) => {
    chrome.runtime.openOptionsPage(() => resolve());
  });
}

async function findExistingAlertWindowId(): Promise<number | undefined> {
  const alertUrl = chrome.runtime.getURL("alert.html");
  const windows = await getAllWindows({ populate: true, windowTypes: ["popup", "normal"] });

  for (const extensionWindow of windows) {
    const hasAlertTab = extensionWindow.tabs?.some((tab) => tab.url?.startsWith(alertUrl));
    if (hasAlertTab && typeof extensionWindow.id === "number") {
      return extensionWindow.id;
    }
  }

  return undefined;
}

async function ensureAlertWindow(focus = true): Promise<void> {
  const state = await loadState();
  const activeAlerts = getActiveAlerts(state.alerts);

  if (!activeAlerts.length) {
    return;
  }

  const alertWindowId = await findExistingAlertWindowId();
  if (typeof alertWindowId === "number") {
    if (focus) {
      await updateWindow(alertWindowId, { focused: true });
    }
    return;
  }

  await createWindow({
    url: chrome.runtime.getURL("alert.html"),
    type: "popup",
    width: 980,
    height: 760,
    focused: true
  });
}

async function acknowledgeWatchIds(watchIds?: string[]): Promise<void> {
  const acknowledgedIds = new Set(watchIds ?? []);
  let touchedWatchIds = new Set<string>();
  const nextState = await mutateState((state) => {
    const now = Date.now();
    const activeAlerts = getActiveAlerts(state.alerts);
    const targetWatchIds = watchIds?.length
      ? new Set(watchIds)
      : new Set(activeAlerts.map((alert) => alert.watchId));
    touchedWatchIds = targetWatchIds;

    state.alerts = state.alerts.map((alert) => {
      if (!alert.acknowledgedAt && targetWatchIds.has(alert.watchId)) {
        return {
          ...alert,
          acknowledgedAt: now
        };
      }

      return alert;
    });

    state.watches = state.watches.map((watch) => {
      if (!targetWatchIds.has(watch.id)) {
        return watch;
      }

      const lastAlert = [...state.alerts]
        .filter((alert) => alert.watchId === watch.id)
        .sort((left, right) => right.triggeredAt - left.triggeredAt)[0];

      return {
        ...watch,
        status: watch.enabled ? "monitoring" : "paused",
        updatedAt: now,
        lastSeenAt: now,
        lastSnapshot: lastAlert?.after ?? watch.lastSnapshot,
        lastError: undefined
      };
    });

    return state;
  });

  await updateBadge();

  const tabs = await queryTabs({});
  const finalWatchIds = Array.from(touchedWatchIds);

  await Promise.all(
    tabs.flatMap((tab) => {
      if (!tab.id) {
        return [];
      }

      return Array.from(acknowledgedIds.size ? acknowledgedIds : new Set(finalWatchIds)).map((watchId) =>
        sendTabMessage(tab.id as number, {
          type: "ACK_WATCH",
          watchId
        }).catch(() => undefined)
      );
    })
  );
}

async function addAlert(
  payload: Extract<MessageFromContent, { type: "WATCH_TRIGGERED" }>["payload"]
): Promise<void> {
  await mutateState((state) => {
    const watchIndex = state.watches.findIndex((watch) => watch.id === payload.watchId);
    if (watchIndex === -1) {
      return state;
    }

    const existingActiveAlert = state.alerts.find(
      (alert) => alert.watchId === payload.watchId && !alert.acknowledgedAt
    );
    if (existingActiveAlert) {
      return state;
    }

    const watch = state.watches[watchIndex];
    const alert: AlertRecord = {
      id: createId("alert"),
      watchId: watch.id,
      watchLabel: watch.label,
      pageUrl: payload.pageUrl,
      pageTitle: payload.pageTitle || watch.pageTitle,
      triggeredAt: Date.now(),
      summary: payload.summary,
      before: payload.before,
      after: payload.after
    };

    state.alerts = [alert, ...state.alerts].slice(0, 100);
    state.watches[watchIndex] = {
      ...watch,
      status: "alert",
      lastChangeAt: alert.triggeredAt,
      lastChangeTitle: payload.summary.title,
      updatedAt: alert.triggeredAt
    };

    return state;
  });

  await updateBadge();
  await ensureAlertWindow(true);
}

async function saveWatch(draft: Extract<MessageFromContent, { type: "SAVE_WATCH" }>["draft"]) {
  const state = await mutateState((currentState) => {
    const existingIndex = currentState.watches.findIndex(
      (watch) =>
        isSamePage(watch.pageUrl, draft.pageUrl) &&
        watch.selector.css === draft.selector.css &&
        watch.selector.tagName === draft.selector.tagName
    );

    const now = Date.now();
    if (existingIndex >= 0) {
      currentState.watches[existingIndex] = {
        ...currentState.watches[existingIndex],
        label: draft.label,
        pageTitle: draft.pageTitle,
        selector: draft.selector,
        enabled: true,
        lastSnapshot: draft.snapshot,
        lastSeenAt: now,
        status: "monitoring",
        updatedAt: now
      };

      return currentState;
    }

    currentState.watches.unshift({
      id: createId("watch"),
      label: draft.label,
      pageUrl: draft.pageUrl,
      pageTitle: draft.pageTitle,
      selector: draft.selector,
      enabled: true,
      pollIntervalMs: currentState.settings.defaultPollIntervalMs,
      mutationDebounceMs: currentState.settings.defaultMutationDebounceMs,
      useMutationObserver: currentState.settings.defaultUseMutationObserver,
      usePolling: currentState.settings.defaultUsePolling,
      createdAt: now,
      updatedAt: now,
      status: "monitoring",
      lastSnapshot: draft.snapshot,
      lastSeenAt: now
    });

    return currentState;
  });

  await updateBadge();
  await syncAllTabs();
  return state;
}

async function handleUiMessage(message: MessageFromUi) {
  switch (message.type) {
    case "GET_STATE":
      return loadState();
    case "BEGIN_SELECTION":
      await ensureTabCanReceiveMessages(message.tabId);
      return { ok: true };
    case "OPEN_OPTIONS":
      await openOptionsPage();
      return { ok: true };
    case "OPEN_ALERT_WINDOW":
      await ensureAlertWindow(true);
      return { ok: true };
    case "SAVE_SETTINGS":
      await mutateState((state) => {
        state.settings = sanitizeSettingsPatch(message.patch, state.settings);
        return state;
      });
      return { ok: true };
    case "UPDATE_WATCH":
      await mutateState((state) => {
        const index = state.watches.findIndex((watch) => watch.id === message.watchId);
        if (index === -1) {
          return state;
        }

        const watch = state.watches[index];
        const safePatch = sanitizeWatchPatch(message.patch, watch);

        state.watches[index] = {
          ...watch,
          ...safePatch,
          status:
            typeof safePatch.enabled === "boolean"
              ? safePatch.enabled
                ? watch.status === "paused"
                  ? "idle"
                  : watch.status
                : "paused"
              : watch.status,
          updatedAt: Date.now()
        };

        return state;
      });

      await syncAllTabs();
      return { ok: true };
    case "DELETE_WATCH":
      await mutateState((state) => {
        state.watches = state.watches.filter((watch) => watch.id !== message.watchId);
        state.alerts = state.alerts.filter((alert) => alert.watchId !== message.watchId);
        return state;
      });

      await updateBadge();
      await syncAllTabs();
      return { ok: true };
    case "ACK_ALERTS":
      await acknowledgeWatchIds(message.watchIds);
      return { ok: true };
    default:
      return undefined;
  }
}

async function handleContentMessage(message: MessageFromContent) {
  switch (message.type) {
    case "REGISTER_PAGE": {
      return {
        watches: await getRelevantWatches(message.pageUrl)
      };
    }
    case "SAVE_WATCH":
      return saveWatch(message.draft);
    case "WATCH_STATUS":
      await mutateState((state) => {
        const index = state.watches.findIndex((watch) => watch.id === message.payload.watchId);
        if (index === -1) {
          return state;
        }

        const watch = state.watches[index];
        state.watches[index] = {
          ...watch,
          status: watch.enabled ? message.payload.status : "paused",
          updatedAt: Date.now(),
          lastSeenAt: Date.now(),
          lastError: message.payload.error,
          lastSnapshot: watch.lastSnapshot ?? message.payload.snapshot
        };

        return state;
      });
      return { ok: true };
    case "WATCH_TARGET_REFRESHED":
      await mutateState((state) => {
        const index = state.watches.findIndex((watch) => watch.id === message.payload.watchId);
        if (index === -1 || !message.payload.selector.xpath) {
          return state;
        }

        state.watches[index] = {
          ...state.watches[index],
          selector: message.payload.selector,
          updatedAt: Date.now()
        };

        return state;
      });
      return { ok: true };
    case "WATCH_TRIGGERED":
      await addAlert(message.payload);
      return { ok: true };
    default:
      return undefined;
  }
}

async function handleMessage(message: RuntimeMessage) {
  if (
    message.type === "GET_STATE" ||
    message.type === "BEGIN_SELECTION" ||
    message.type === "OPEN_OPTIONS" ||
    message.type === "OPEN_ALERT_WINDOW" ||
    message.type === "UPDATE_WATCH" ||
    message.type === "DELETE_WATCH" ||
    message.type === "ACK_ALERTS" ||
    message.type === "SAVE_SETTINGS"
  ) {
    return handleUiMessage(message as MessageFromUi);
  }

  return handleContentMessage(message as MessageFromContent);
}

onRuntimeMessage((message) => handleMessage(message));

chrome.runtime.onInstalled.addListener(async () => {
  const state = await loadState().catch(() => undefined);
  if (!state) {
    await saveState(DEFAULT_STATE);
  } else {
    await saveState(state);
  }

  await updateBadge();
});

chrome.runtime.onStartup?.addListener(async () => {
  await updateBadge();
  await syncAllTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    void syncTab({ ...tab, id: tabId });
  }
});

chrome.tabs.onRemoved.addListener(() => {
  void updateBadge();
});

chrome.windows.onRemoved.addListener(() => {
  setTimeout(() => {
    void ensureAlertWindow(false);
  }, 300);
});

void updateBadge();
void syncAllTabs();
