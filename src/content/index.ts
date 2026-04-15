import type {
  ChangeSummary,
  MessageToContent,
  NewWatchDraft,
  WatchRecord,
  WatchStatus,
  WatchStatusUpdate
} from "../types";
import { sendRuntimeMessage as sendRuntimeMessageToExtension } from "../shared/browser";
import { createId, normalizePageUrl } from "../shared/dom";
import { buildSelectorDescriptor, describeElement, resolveElement } from "../shared/selectors";
import { captureSnapshot, compareSnapshots } from "../shared/snapshot";

const STYLE_ID = "yallah-ping-style";
const OVERLAY_ID = "yallah-ping-overlay";
const INSTANCE_KEY = "__yallahPingContentInstance__";

type GlobalWindow = Window & {
  [INSTANCE_KEY]?: {
    dispose: () => void;
  };
};

const globalWindow = window as GlobalWindow;
let disposed = false;
let removeUrlHooks: (() => void) | undefined;

function isDisconnectedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Extension context invalidated") ||
    error.message.includes("Receiving end does not exist") ||
    error.message.includes("The message port closed before a response was received")
  );
}

function disposeContentInstance() {
  if (disposed) {
    return;
  }

  disposed = true;
  selectionOverlay.stop();
  for (const monitor of monitors.values()) {
    monitor.stop();
  }
  monitors.clear();
  removeUrlHooks?.();
  removeUrlHooks = undefined;
  chrome.runtime.onMessage.removeListener(handleRuntimeMessage);

  if (globalWindow[INSTANCE_KEY]?.dispose === disposeContentInstance) {
    delete globalWindow[INSTANCE_KEY];
  }
}

async function safeSendRuntimeMessage<T>(message: Parameters<typeof sendRuntimeMessageToExtension>[0]): Promise<T | undefined> {
  try {
    return await sendRuntimeMessageToExtension<T>(message);
  } catch (error) {
    if (isDisconnectedError(error)) {
      console.warn("Contexte extension invalide sur la page, arret local du content script.");
      disposeContentInstance();
      return undefined;
    }

    throw error;
  }
}

class PageMutationHub {
  private callbacks = new Set<() => void>();
  private observer?: MutationObserver;

  subscribe(callback: () => void): () => void {
    this.callbacks.add(callback);
    this.ensureObserver();

    return () => {
      this.callbacks.delete(callback);
      if (!this.callbacks.size) {
        this.observer?.disconnect();
        this.observer = undefined;
      }
    };
  }

  private ensureObserver() {
    if (this.observer || !document.documentElement) {
      return;
    }

    this.observer = new MutationObserver(() => {
      for (const callback of this.callbacks) {
        callback();
      }
    });

    this.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true
    });
  }
}

const mutationHub = new PageMutationHub();

class WatchMonitor {
  private watch: WatchRecord;
  private baselineSnapshot?: ReturnType<typeof captureSnapshot>;
  private currentSnapshot?: ReturnType<typeof captureSnapshot>;
  private alertPending = false;
  private hadVisibleElement = false;
  private pollTimer?: number;
  private debounceTimer?: number;
  private unsubscribeMutation?: () => void;
  private lastReportedStatus?: WatchStatus;
  private lastReportedAt = 0;
  private lastReportedError?: string;

  constructor(watch: WatchRecord) {
    this.watch = watch;
    this.baselineSnapshot = watch.lastSnapshot;
    this.currentSnapshot = watch.lastSnapshot;
    this.alertPending = watch.status === "alert";
  }

  update(watch: WatchRecord) {
    this.watch = watch;
    if (!this.alertPending) {
      this.baselineSnapshot = watch.lastSnapshot ?? this.baselineSnapshot;
    }

    this.restart();
  }

  start() {
    this.restart();
  }

  stop() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    this.unsubscribeMutation?.();
    this.unsubscribeMutation = undefined;
  }

  acknowledge() {
    this.alertPending = false;
    const refreshedElement = resolveElement(this.watch.selector);
    this.currentSnapshot = refreshedElement ? captureSnapshot(refreshedElement) : this.currentSnapshot;
    this.baselineSnapshot = this.currentSnapshot ?? this.baselineSnapshot;
    void this.reportStatus("monitoring", this.currentSnapshot);
  }

  private restart() {
    this.stop();

    if (!this.watch.enabled) {
      void this.reportStatus("paused", undefined);
      return;
    }

    if (this.watch.useMutationObserver) {
      this.unsubscribeMutation = mutationHub.subscribe(() => {
        this.scheduleCheck();
      });
    }

    if (this.watch.usePolling) {
      this.pollTimer = window.setInterval(() => {
        void this.evaluate();
      }, this.watch.pollIntervalMs);
    }

    void this.evaluate();
  }

  private scheduleCheck() {
    if (!this.watch.enabled) {
      return;
    }

    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      void this.evaluate();
    }, this.watch.mutationDebounceMs);
  }

  private async evaluate() {
    if (!this.watch.enabled) {
      await this.reportStatus("paused", undefined);
      return;
    }

    const targetElement = resolveElement(this.watch.selector);
    if (!targetElement) {
      if (this.hadVisibleElement && !this.alertPending) {
        const summary = compareSnapshots(this.currentSnapshot, undefined);
        if (summary) {
          await this.trigger(summary, this.currentSnapshot, undefined);
        }
      } else {
        await this.reportStatus("missing", undefined, "Zone non retrouvee sur cette page.");
      }

      this.hadVisibleElement = false;
      return;
    }

    const snapshot = captureSnapshot(targetElement);
    this.currentSnapshot = snapshot;

    if (!this.baselineSnapshot) {
      this.baselineSnapshot = this.watch.lastSnapshot ?? snapshot;
    }

    const diff = compareSnapshots(this.baselineSnapshot, snapshot);
    this.hadVisibleElement = true;

    if (diff && !this.alertPending) {
      await this.trigger(diff, this.baselineSnapshot, snapshot);
      return;
    }

    await this.reportStatus("monitoring", snapshot);
  }

  private async trigger(
    summary: ChangeSummary,
    before: ReturnType<typeof captureSnapshot> | undefined,
    after: ReturnType<typeof captureSnapshot> | undefined
  ) {
    this.alertPending = true;
    this.lastReportedStatus = "alert";
    this.lastReportedError = undefined;
    this.lastReportedAt = Date.now();

    await safeSendRuntimeMessage({
      type: "WATCH_TRIGGERED",
      payload: {
        watchId: this.watch.id,
        before,
        after,
        summary,
        pageUrl: normalizePageUrl(window.location.href),
        pageTitle: document.title
      }
    });
  }

  private async reportStatus(
    status: WatchStatus,
    snapshot?: ReturnType<typeof captureSnapshot>,
    error?: string
  ) {
    const now = Date.now();
    const shouldReport =
      this.lastReportedStatus !== status ||
      this.lastReportedError !== error ||
      now - this.lastReportedAt > 30000;

    if (!shouldReport) {
      return;
    }

    this.lastReportedStatus = status;
    this.lastReportedError = error;
    this.lastReportedAt = now;

    const payload: WatchStatusUpdate = {
      watchId: this.watch.id,
      status,
      snapshot,
      error
    };

    await safeSendRuntimeMessage({
      type: "WATCH_STATUS",
      payload
    });
  }
}

class SelectionOverlay {
  private hoveredElement?: Element;
  private highlightBox?: HTMLDivElement;
  private infoBox?: HTMLDivElement;
  private modal?: HTMLDivElement;
  private root?: HTMLDivElement;
  private active = false;
  private isConfirming = false;

  start() {
    if (this.active) {
      return;
    }

    this.injectStyles();
    this.root = document.createElement("div");
    this.root.id = OVERLAY_ID;
    this.root.innerHTML = `
      <div class="yp-highlight"></div>
      <div class="yp-tip">
        <strong>Yallah Ping</strong>
        <span>Survolez la zone a surveiller, cliquez pour la choisir, puis validez.</span>
      </div>
    `;

    document.documentElement.appendChild(this.root);
    this.highlightBox = this.root.querySelector(".yp-highlight") as HTMLDivElement;
    this.infoBox = this.root.querySelector(".yp-tip") as HTMLDivElement;
    this.active = true;
    this.root.tabIndex = -1;
    this.root.focus();

    this.root.addEventListener("mousemove", this.handleMouseMove, true);
    this.root.addEventListener("mousedown", this.handleMouseDown, true);
    this.root.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  stop() {
    if (!this.active) {
      return;
    }

    this.root?.removeEventListener("mousemove", this.handleMouseMove, true);
    this.root?.removeEventListener("mousedown", this.handleMouseDown, true);
    this.root?.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    this.root?.remove();
    this.root = undefined;
    this.highlightBox = undefined;
    this.infoBox = undefined;
    this.modal = undefined;
    this.hoveredElement = undefined;
    this.active = false;
    this.isConfirming = false;
  }

  private injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: auto;
        cursor: crosshair;
      }

      #${OVERLAY_ID} .yp-highlight {
        position: fixed;
        border: 3px solid #c2410c;
        border-radius: 12px;
        background: rgba(251, 146, 60, 0.15);
        box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.12);
        transition: all 90ms ease;
        pointer-events: none;
      }

      #${OVERLAY_ID} .yp-tip {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        align-items: center;
        max-width: min(720px, calc(100vw - 24px));
        padding: 12px 16px;
        border-radius: 999px;
        background: rgba(255, 248, 241, 0.96);
        border: 1px solid rgba(194, 65, 12, 0.26);
        box-shadow: 0 18px 40px rgba(64, 38, 18, 0.18);
        font: 600 14px/1.4 "Trebuchet MS", "Segoe UI", sans-serif;
        color: #1f2937;
        pointer-events: none;
      }

      #${OVERLAY_ID} .yp-modal {
        pointer-events: auto;
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: min(420px, calc(100vw - 24px));
        padding: 16px;
        border-radius: 18px;
        background: rgba(255, 251, 247, 0.98);
        border: 1px solid rgba(194, 65, 12, 0.24);
        box-shadow: 0 22px 50px rgba(64, 38, 18, 0.24);
        font: 500 14px/1.5 "Trebuchet MS", "Segoe UI", sans-serif;
        color: #1f2937;
        cursor: auto;
      }

      #${OVERLAY_ID} .yp-modal h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }

      #${OVERLAY_ID} .yp-modal p {
        margin: 0 0 12px;
        color: #6b7280;
      }

      #${OVERLAY_ID} .yp-modal label {
        display: block;
        margin-bottom: 6px;
        font-weight: 700;
      }

      #${OVERLAY_ID} .yp-modal input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(122, 83, 52, 0.22);
      }

      #${OVERLAY_ID} .yp-actions {
        display: flex;
        gap: 8px;
        margin-top: 14px;
      }

      #${OVERLAY_ID} .yp-actions button {
        cursor: pointer;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font-weight: 700;
      }

      #${OVERLAY_ID} .yp-primary {
        background: #c2410c;
        color: white;
      }

      #${OVERLAY_ID} .yp-secondary {
        background: white;
        color: #1f2937;
        border: 1px solid rgba(122, 83, 52, 0.22);
      }
    `;

    document.documentElement.appendChild(style);
  }

  private getUnderlyingElement(clientX: number, clientY: number): Element | null {
    if (!this.root) {
      return null;
    }

    const previousPointerEvents = this.root.style.pointerEvents;
    this.root.style.pointerEvents = "none";
    const candidate = document.elementFromPoint(clientX, clientY);
    this.root.style.pointerEvents = previousPointerEvents || "auto";

    if (!candidate || candidate.closest(`#${OVERLAY_ID}`)) {
      return null;
    }

    return this.pickSelectableElement(candidate);
  }

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.active || this.isConfirming) {
      return;
    }

    const element = this.getUnderlyingElement(event.clientX, event.clientY);
    if (!element) {
      return;
    }

    this.hoveredElement = element;
    const rect = element.getBoundingClientRect();

    if (!this.highlightBox) {
      return;
    }

    this.highlightBox.style.top = `${rect.top}px`;
    this.highlightBox.style.left = `${rect.left}px`;
    this.highlightBox.style.width = `${rect.width}px`;
    this.highlightBox.style.height = `${rect.height}px`;

    if (this.infoBox) {
      this.infoBox.querySelector("span")!.textContent = `Zone survolee : ${describeElement(element)}`;
    }
  };

  private handleMouseDown = (event: MouseEvent) => {
    if (!this.active || this.isConfirming) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  private handleClick = (event: MouseEvent) => {
    if (!this.active || this.isConfirming) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const element = this.getUnderlyingElement(event.clientX, event.clientY) ?? this.hoveredElement;
    if (!element) {
      return;
    }

    this.hoveredElement = element;
    this.isConfirming = true;
    this.showConfirmation(element);
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.active) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.stop();
    }
  };

  private pickSelectableElement(element: Element): Element | null {
    if (element === document.documentElement || element === document.body) {
      return null;
    }

    const htmlElement = element as HTMLElement;
    if (htmlElement.offsetWidth < 16 || htmlElement.offsetHeight < 16) {
      return htmlElement.parentElement;
    }

    return element;
  }

  private showConfirmation(element: Element) {
    this.modal?.remove();

    const snapshot = captureSnapshot(element);
    const suggestedLabel = describeElement(element);
    const modal = document.createElement("div");
    modal.className = "yp-modal";
    modal.innerHTML = `
      <h3>Ajouter cette surveillance</h3>
      <p>Cette zone sera suivie localement dans ce navigateur. Vous recevrez une alarme si elle change.</p>
      <label for="yp-watch-name">Nom visible</label>
      <input id="yp-watch-name" type="text" value="${suggestedLabel.replace(/"/g, "&quot;")}" maxlength="90" />
      <div class="yp-actions">
        <button class="yp-primary" type="button">Enregistrer</button>
        <button class="yp-secondary" type="button">Annuler</button>
      </div>
    `;

    this.root?.appendChild(modal);
    this.modal = modal;

    const input = modal.querySelector("input") as HTMLInputElement;
    input.focus();
    input.select();

    const saveButton = modal.querySelector(".yp-primary") as HTMLButtonElement;
    const cancelButton = modal.querySelector(".yp-secondary") as HTMLButtonElement;

    cancelButton.addEventListener("click", () => {
      this.isConfirming = false;
      modal.remove();
    });

    saveButton.addEventListener("click", async () => {
      const draft: NewWatchDraft = {
        label: input.value.trim() || suggestedLabel,
        pageUrl: normalizePageUrl(window.location.href),
        pageTitle: document.title,
        selector: buildSelectorDescriptor(element),
        snapshot
      };

      const result = await safeSendRuntimeMessage({
        type: "SAVE_WATCH",
        draft
      });

      if (!result) {
        return;
      }

      this.stop();
    });
  }
}

const selectionOverlay = new SelectionOverlay();
const monitors = new Map<string, WatchMonitor>();

async function registerCurrentPage() {
  const response = await safeSendRuntimeMessage<{ watches: WatchRecord[] }>({
    type: "REGISTER_PAGE",
    pageUrl: normalizePageUrl(window.location.href),
    pageTitle: document.title
  });

  if (!response || disposed) {
    return;
  }

  syncWatches(response.watches ?? []);
}

function syncWatches(watches: WatchRecord[]) {
  const nextIds = new Set(watches.map((watch) => watch.id));

  for (const [watchId, monitor] of monitors.entries()) {
    if (!nextIds.has(watchId)) {
      monitor.stop();
      monitors.delete(watchId);
    }
  }

  for (const watch of watches) {
    const existing = monitors.get(watch.id);
    if (existing) {
      existing.update(watch);
    } else {
      const monitor = new WatchMonitor(watch);
      monitors.set(watch.id, monitor);
      monitor.start();
    }
  }
}

function installUrlChangeHooks() {
  const notify = () => {
    if (disposed) {
      return;
    }

    void registerCurrentPage();
  };

  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);

  const rawPushState = history.pushState;
  history.pushState = function patchedPushState(...args) {
    rawPushState.apply(this, args);
    notify();
  };

  const rawReplaceState = history.replaceState;
  history.replaceState = function patchedReplaceState(...args) {
    rawReplaceState.apply(this, args);
    notify();
  };

  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
    history.pushState = rawPushState;
    history.replaceState = rawReplaceState;
  };
}

const handleRuntimeMessage = (message: MessageToContent, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  Promise.resolve()
    .then(async () => {
      if (disposed) {
        return { ok: false, error: "Content script arrete." };
      }

      switch (message.type) {
        case "START_SELECTION":
          selectionOverlay.start();
          return { ok: true };
        case "SYNC_WATCHES":
          syncWatches(message.watches);
          return { ok: true };
        case "ACK_WATCH":
          monitors.get(message.watchId)?.acknowledge();
          return { ok: true };
        default:
          return { ok: false };
      }
    })
    .then(sendResponse)
    .catch((error) => {
      console.error("Erreur message content", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
};

if (!globalWindow[INSTANCE_KEY]) {
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  removeUrlHooks = installUrlChangeHooks();
  globalWindow[INSTANCE_KEY] = {
    dispose: disposeContentInstance
  };
  void registerCurrentPage();
}
