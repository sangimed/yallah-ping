import type { AppState, WatchRecord } from "../types";
import { createTab, queryTabs, sendRuntimeMessage } from "../shared/browser";
import { getAlarmDisplayName } from "../shared/audio";
import { loadState } from "../shared/storage";
import { escapeHtml, renderStatusPill, renderWatchSummary } from "../shared/ui";

const appElement = document.getElementById("app");

if (!appElement) {
  throw new Error("Conteneur popup introuvable.");
}

const app = appElement;

async function getCurrentTab() {
  const tabs = await queryTabs({ active: true, currentWindow: true });
  return tabs[0];
}

async function beginSelection() {
  const currentTab = await getCurrentTab();
  if (
    !currentTab?.id ||
    !currentTab.url ||
    currentTab.url.startsWith("chrome://") ||
    currentTab.url.startsWith("about:") ||
    currentTab.url.startsWith("edge://") ||
    currentTab.url.startsWith("moz-extension://")
  ) {
    throw new Error("Ouvrez d'abord la page interne à surveiller dans un onglet classique.");
  }

  const response = await sendRuntimeMessage<{ ok?: boolean; error?: string }>({
    type: "BEGIN_SELECTION",
    tabId: currentTab.id
  });

  if (response && response.ok === false) {
    throw new Error(response.error || "Impossible d'activer la sélection sur cette page.");
  }

  window.close();
}

function renderMetric(label: string, value: string, detail: string): string {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function renderWatchActions(watch: WatchRecord): string {
  return `
    <div class="card-actions">
      <button class="secondary compact" data-action="toggle-watch" data-watch-id="${escapeHtml(watch.id)}">
        ${watch.enabled ? "Pause" : "Relancer"}
      </button>
      <button class="secondary compact" data-action="open-page" data-url="${escapeHtml(watch.pageUrl)}">Ouvrir</button>
      <button class="ghost compact" data-action="open-options">Réglages</button>
    </div>
  `;
}

function render(state: AppState, currentTabTitle?: string, errorMessage?: string) {
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledgedAt);
  const watches = state.watches;
  const activeWatches = watches.filter((watch) => watch.enabled);

  app.innerHTML = `
    <section class="hero popup-hero">
      <div>
        <span class="eyebrow">Yallah Ping</span>
        <h1>Surveillance locale</h1>
        <p>${escapeHtml(currentTabTitle || "Choisissez une zone sur l'onglet actif.")}</p>
      </div>
      <div>${
        activeAlerts.length
          ? `<span class="pill danger">${activeAlerts.length} alerte${activeAlerts.length > 1 ? "s" : ""}</span>`
          : `<span class="pill ok">Calme</span>`
      }</div>
    </section>

    ${
      activeAlerts.length
        ? `<section class="banner alert stack">
            <strong>${activeAlerts.length} alerte${activeAlerts.length > 1 ? "s" : ""} en cours</strong>
            <div>Le son tourne jusqu'à un acquittement explicite.</div>
            <div class="row">
              <button data-action="open-alert">Voir l'alerte</button>
              <button class="secondary" data-action="ack-all">Acquitter</button>
            </div>
          </section>`
        : ""
    }

    ${
      errorMessage
        ? `<section class="banner alert">
            <strong>Action impossible</strong>
            <div>${escapeHtml(errorMessage)}</div>
          </section>`
        : ""
    }

    <section class="panel stack start-panel">
      <div>
        <h2>Nouvelle surveillance</h2>
        <p>Sélectionnez visuellement la zone à suivre sur la page ouverte.</p>
      </div>
      <button data-action="start-selection">Choisir sur la page</button>
    </section>

    <section class="metric-strip compact-metrics">
      ${renderMetric("Zones", String(watches.length), `${activeWatches.length} active${activeWatches.length > 1 ? "s" : ""}`)}
      ${renderMetric("Alertes", String(activeAlerts.length), activeAlerts.length ? "à traiter" : "ok")}
      ${renderMetric("Son", getAlarmDisplayName(state.settings), "local")}
    </section>

    <section class="panel stack">
      <div class="panel-header">
        <div>
          <h2>Surveillances</h2>
          <p>${watches.length ? "État rapide des zones suivies." : "Aucune zone suivie pour le moment."}</p>
        </div>
        <button class="secondary compact" data-action="open-options">Tout régler</button>
      </div>
      ${
        watches.length
          ? watches
              .map(
                (watch) => `
                  <article class="watch-card">
                    <div class="card-header">
                      <div class="stack compact-stack">
                        <h3>${escapeHtml(watch.label)}</h3>
                        ${renderWatchSummary(watch)}
                      </div>
                    </div>
                    ${renderWatchActions(watch)}
                  </article>
                `
              )
              .join("")
          : `<div class="empty-state">Ouvrez votre application interne, cliquez sur <strong>Choisir sur la page</strong>, puis sélectionnez la zone à surveiller.</div>`
      }
    </section>
  `;

  wireActions(state);
}

function wireActions(state: AppState) {
  app.querySelector('[data-action="start-selection"]')?.addEventListener("click", async () => {
    try {
      await beginSelection();
    } catch (error) {
      const currentTab = await getCurrentTab();
      render(state, currentTab?.title, error instanceof Error ? error.message : String(error));
    }
  });

  app.querySelectorAll('[data-action="open-options"]').forEach((node) => {
    node.addEventListener("click", async () => {
      await sendRuntimeMessage({ type: "OPEN_OPTIONS" });
      window.close();
    });
  });

  app.querySelector('[data-action="open-alert"]')?.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "OPEN_ALERT_WINDOW" });
    window.close();
  });

  app.querySelector('[data-action="ack-all"]')?.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "ACK_ALERTS" });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-watch"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const watch = state.watches.find((item) => item.id === button.dataset.watchId);
      if (!watch) {
        return;
      }

      await sendRuntimeMessage({
        type: "UPDATE_WATCH",
        watchId: watch.id,
        patch: {
          enabled: !watch.enabled
        }
      });
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-action="open-page"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const targetUrl = button.dataset.url;
      if (!targetUrl) {
        return;
      }

      await createTab({ url: targetUrl });
    });
  });
}

async function renderApp() {
  const [state, currentTab] = await Promise.all([loadState(), getCurrentTab()]);
  render(state, currentTab?.title);
}

chrome.storage.onChanged.addListener(() => {
  void renderApp();
});

void renderApp();
