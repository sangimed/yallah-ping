import type {
  AppState,
  ChangeSummary,
  MessageToContent,
  NewWatchDraft,
  WatchRecord,
  WatchStatus,
  WatchStatusUpdate
} from "../types";
import { sendRuntimeMessage } from "../shared/browser";
import { normalizePageUrl } from "../shared/dom";
import { buildSelectorDescriptor, describeElement, resolveElement } from "../shared/selectors";
import { captureSnapshot, compareSnapshots } from "../shared/snapshot";
import { escapeHtml } from "../shared/ui";

const STYLE_ID = "yallah-ping-style";
const OVERLAY_ID = "yallah-ping-overlay";

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
        await this.reportStatus("missing", undefined, "Zone non retrouvée sur cette page.");
      }

      this.hadVisibleElement = false;
      return;
    }

    const snapshot = captureSnapshot(targetElement);
    this.currentSnapshot = snapshot;
    await this.refreshSelectorIfNeeded(targetElement);

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

  private async refreshSelectorIfNeeded(targetElement: Element) {
    if (this.watch.selector.xpath) {
      return;
    }

    const selector = buildSelectorDescriptor(targetElement);
    if (!selector.xpath) {
      return;
    }

    this.watch = {
      ...this.watch,
      selector
    };

    await sendRuntimeMessage({
      type: "WATCH_TARGET_REFRESHED",
      payload: {
        watchId: this.watch.id,
        selector
      }
    }).catch((error) => {
      console.debug("Actualisation du sélecteur ignorée", error);
    });
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

    await sendRuntimeMessage({
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

    await sendRuntimeMessage({
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
        <span>Survolez la zone à surveiller, cliquez pour la choisir, puis validez.</span>
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
        border: 3px solid #2563eb;
        border-radius: 8px;
        background: rgba(37, 99, 235, 0.14);
        box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.18);
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
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid #d6dee8;
        box-shadow: 0 16px 36px rgba(17, 24, 39, 0.16);
        font: 600 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #111827;
        pointer-events: none;
      }

      #${OVERLAY_ID} .yp-tip strong {
        color: #1d4ed8;
      }

      #${OVERLAY_ID} .yp-modal {
        pointer-events: auto;
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: min(420px, calc(100vw - 24px));
        padding: 16px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid #d6dee8;
        box-shadow: 0 22px 50px rgba(17, 24, 39, 0.2);
        font: 500 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #111827;
        cursor: auto;
      }

      #${OVERLAY_ID} .yp-modal h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }

      #${OVERLAY_ID} .yp-modal p {
        margin: 0 0 12px;
        color: #5d687a;
      }

      #${OVERLAY_ID} .yp-modal label {
        display: block;
        margin-bottom: 6px;
        font-weight: 700;
      }

      #${OVERLAY_ID} .yp-modal input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #d6dee8;
      }

      #${OVERLAY_ID} .yp-actions {
        display: flex;
        gap: 8px;
        margin-top: 14px;
      }

      #${OVERLAY_ID} .yp-actions button {
        cursor: pointer;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 10px 14px;
        font-weight: 700;
      }

      #${OVERLAY_ID} .yp-primary {
        background: #2563eb;
        color: white;
      }

      #${OVERLAY_ID} .yp-secondary {
        background: white;
        color: #111827;
        border-color: #d6dee8;
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
      this.infoBox.querySelector("span")!.textContent = `Zone survolée : ${describeElement(element)}`;
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
    void this.showConfirmation(element).catch((error) => {
      console.error("Impossible d'afficher la confirmation de surveillance", error);
      this.isConfirming = false;
    });
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

  private async showConfirmation(element: Element) {
    this.modal?.remove();

    const snapshot = captureSnapshot(element);
    const defaultLabel = await getDefaultWatchLabel();
    if (!this.active || !this.isConfirming) {
      return;
    }

    const modal = document.createElement("div");
    modal.className = "yp-modal";
    modal.innerHTML = `
      <h3>Ajouter cette surveillance</h3>
      <p>Cette zone sera suivie localement dans ce navigateur. Vous recevrez une alarme si elle change.</p>
      <label for="yp-watch-name">Nom visible</label>
      <input id="yp-watch-name" type="text" placeholder="${escapeHtml(defaultLabel)}" maxlength="90" />
      <div class="yp-actions">
        <button class="yp-primary" type="button">Enregistrer</button>
        <button class="yp-secondary" type="button">Annuler</button>
      </div>
    `;

    this.root?.appendChild(modal);
    this.modal = modal;

    const input = modal.querySelector("input") as HTMLInputElement;
    input.focus();

    const saveButton = modal.querySelector(".yp-primary") as HTMLButtonElement;
    const cancelButton = modal.querySelector(".yp-secondary") as HTMLButtonElement;

    cancelButton.addEventListener("click", () => {
      this.isConfirming = false;
      modal.remove();
    });

    saveButton.addEventListener("click", async () => {
      const draft: NewWatchDraft = {
        label: input.value.trim() || defaultLabel,
        pageUrl: normalizePageUrl(window.location.href),
        pageTitle: document.title,
        selector: buildSelectorDescriptor(element),
        snapshot
      };

      await sendRuntimeMessage({
        type: "SAVE_WATCH",
        draft
      });

      this.stop();
    });
  }
}

const selectionOverlay = new SelectionOverlay();
const monitors = new Map<string, WatchMonitor>();
let currentPageWatches: WatchRecord[] = [];

function getNextDefaultWatchLabel(labels: string[]): string {
  const baseLabel = "Nouvelle alerte";
  const existingLabels = new Set(labels.map((label) => label.trim().toLocaleLowerCase("fr-FR")).filter(Boolean));

  if (!existingLabels.has(baseLabel.toLocaleLowerCase("fr-FR"))) {
    return baseLabel;
  }

  let suffix = 2;
  while (existingLabels.has(`${baseLabel} ${suffix}`.toLocaleLowerCase("fr-FR"))) {
    suffix += 1;
  }

  return `${baseLabel} ${suffix}`;
}

async function getDefaultWatchLabel(): Promise<string> {
  try {
    const state = await sendRuntimeMessage<AppState>({ type: "GET_STATE" });
    return getNextDefaultWatchLabel(state.watches.map((watch) => watch.label));
  } catch (error) {
    console.debug("Nom par défaut calculé depuis les surveillances de la page", error);
    return getNextDefaultWatchLabel(currentPageWatches.map((watch) => watch.label));
  }
}

async function registerCurrentPage() {
  const response = await sendRuntimeMessage<{ watches: WatchRecord[] }>({
    type: "REGISTER_PAGE",
    pageUrl: normalizePageUrl(window.location.href),
    pageTitle: document.title
  });

  syncWatches(response.watches ?? []);
}

function syncWatches(watches: WatchRecord[]) {
  currentPageWatches = watches;
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
}

chrome.runtime.onMessage.addListener((message: MessageToContent, _sender, sendResponse) => {
  Promise.resolve()
    .then(async () => {
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
});

installUrlChangeHooks();
void registerCurrentPage();
