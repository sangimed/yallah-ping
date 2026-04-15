import type { AppState, WatchRecord } from "../types";
import { createTab, queryTabs, sendRuntimeMessage } from "../shared/browser";
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
    throw new Error("Ouvrez d'abord la page interne a surveiller dans un onglet classique.");
  }

  const response = await sendRuntimeMessage<{ ok?: boolean; error?: string }>({
    type: "BEGIN_SELECTION",
    tabId: currentTab.id
  });

  if (response && response.ok === false) {
    throw new Error(response.error || "Impossible d'activer la selection sur cette page.");
  }

  window.close();
}

function renderWatchActions(watch: WatchRecord): string {
  return `
    <div class="row action-row">
      <button class="secondary" data-action="toggle-watch" data-watch-id="${escapeHtml(watch.id)}">
        ${watch.enabled ? "Mettre en pause" : "Relancer"}
      </button>
      <button class="secondary" data-action="open-page" data-url="${escapeHtml(watch.pageUrl)}">Ouvrir la page</button>
      <button class="secondary" data-action="open-options">Reglages</button>
    </div>
  `;
}

function render(state: AppState, currentTabTitle?: string, errorMessage?: string) {
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledgedAt);
  const watches = state.watches;
  const monitoringCount = watches.filter((watch) => watch.enabled && watch.status !== "paused").length;
  const pausedCount = watches.filter((watch) => !watch.enabled || watch.status === "paused").length;

  app.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div class="stack">
          <div class="eyebrow">Supervision visuelle locale</div>
          <h1 class="hero-title">Yallah Ping</h1>
          <p class="hero-copy">Surveillez une zone visible de votre application interne et recevez une alarme locale des qu'elle change.</p>
          <div class="row hero-actions">
            <button data-action="start-selection">Choisir sur la page</button>
            <button class="secondary" data-action="open-options">Reglages</button>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-card">
            <span class="stat-value">${activeAlerts.length}</span>
            <span class="stat-label">Alertes</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${monitoringCount}</span>
            <span class="stat-label">Surveillances actives</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${pausedCount}</span>
            <span class="stat-label">En pause</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${watches.length}</span>
            <span class="stat-label">Zones enregistrees</span>
          </div>
        </div>
      </div>
    </section>

    ${
      activeAlerts.length
        ? `<section class="banner alert stack">
            <strong>${activeAlerts.length} alerte${activeAlerts.length > 1 ? "s" : ""} en cours</strong>
            <div>Le son tourne jusqu'a un acquittement explicite.</div>
            <div class="row action-row">
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

    <section class="panel stack">
      <div class="section-head">
        <div class="stack">
          <div class="eyebrow">Etape 1</div>
          <h2>Nouvelle surveillance</h2>
          <p>${escapeHtml(currentTabTitle || "Choisissez une zone directement sur la page ouverte.")}</p>
        </div>
      </div>
      <div class="feature-callout">
        <div class="feature-copy">
          <strong>Selection visuelle guidee</strong>
          <span>Un clic lance la selection dans l'onglet actif. Survolez la zone voulue, cliquez, puis validez.</span>
        </div>
        <button data-action="start-selection">Lancer la selection</button>
      </div>
      <div class="field-help">Si rien ne se passe, rechargez l'extension puis l'onglet et recommencez.</div>
    </section>

    <section class="panel stack">
      <div class="section-head">
        <div class="stack">
          <div class="eyebrow">Tableau de bord</div>
          <h2>Surveillances actives</h2>
          <p>${watches.length ? "Gardez un oeil sur plusieurs zones en meme temps." : "Aucune surveillance pour le moment."}</p>
        </div>
        <button class="secondary" data-action="open-options">Ouvrir tous les reglages</button>
      </div>
      ${
        watches.length
          ? watches
              .map(
                (watch) => `
                  <article class="watch-card status-${escapeHtml(watch.status)}">
                    <div class="watch-title-row">
                      <div class="watch-title-block">
                        <div class="eyebrow">Zone surveillee</div>
                        <h3>${escapeHtml(watch.label)}</h3>
                        <div class="card-subtitle">${escapeHtml(watch.pageTitle || watch.pageUrl)}</div>
                      </div>
                    </div>
                    ${renderWatchSummary(watch)}
                    ${renderWatchActions(watch)}
                  </article>
                `
              )
              .join("")
          : `<div class="empty-state">Ouvrez votre application interne, cliquez sur <strong>Choisir sur la page</strong> puis selectionnez la zone a surveiller.</div>`
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
