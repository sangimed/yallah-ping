import type { AlertRecord, AppState } from "../types";
import { AlarmPlayer, getAlarmDisplayName } from "../shared/audio";
import { createTab, sendRuntimeMessage } from "../shared/browser";
import { loadState } from "../shared/storage";
import { applyTheme } from "../shared/theme";
import { formatDateTime } from "../shared/time";
import { escapeHtml, renderAlertCard } from "../shared/ui";

const appElement = document.getElementById("app");
const alarmPlayer = new AlarmPlayer();

if (!appElement) {
  throw new Error("Conteneur alerte introuvable.");
}

const app = appElement;

async function syncAlarm(state: AppState) {
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledgedAt);
  if (activeAlerts.length) {
    await alarmPlayer.start(state.settings);
  } else {
    await alarmPlayer.stop();
  }
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

function render(state: AppState) {
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledgedAt);
  const recentAlerts = state.alerts.filter((alert) => alert.acknowledgedAt).slice(0, 5);

  app.innerHTML = `
    <section class="hero alert-hero">
      <div>
        <span class="eyebrow">${activeAlerts.length ? "Action requise" : "À jour"}</span>
        <h1>${activeAlerts.length ? "Alerte active" : "Tout est confirmé"}</h1>
        <p>${
          activeAlerts.length
            ? "La sonnerie reste active jusqu'à confirmation."
            : "Aucune alerte en attente. Vous pouvez fermer cette fenêtre."
        }</p>
      </div>
      <div class="hero-actions">
        ${
          activeAlerts.length
            ? `<button data-action="ack-all">Confirmer toutes les alertes</button>`
            : `<span class="pill ok">Calme</span>`
        }
      </div>
    </section>

    <section class="metric-strip">
      ${renderMetric("Alertes actives", String(activeAlerts.length), activeAlerts.length ? "à traiter" : "aucune")}
      ${renderMetric("Historique", String(recentAlerts.length), "dernières alertes")}
      ${renderMetric("Son", getAlarmDisplayName(state.settings), "actif")}
    </section>

    ${
      activeAlerts.length
        ? `<section class="banner alert stack">
            <strong>${activeAlerts.length} changement${activeAlerts.length > 1 ? "s" : ""} détecté${
              activeAlerts.length > 1 ? "s" : ""
            }</strong>
            <div class="row">
              <button data-action="ack-all">Confirmer toutes les alertes</button>
            </div>
          </section>`
        : `<section class="banner info">Aucune alerte active pour le moment.</section>`
    }

    <section class="panel stack">
      <div class="panel-header">
        <div>
          <h2>Ce qui a changé</h2>
          <p>${activeAlerts.length ? "Comparez l'état avant et maintenant." : "Rien à traiter pour le moment."}</p>
        </div>
      </div>
      ${
        activeAlerts.length
          ? activeAlerts.map((alert) => renderAlertCard(alert)).join("")
          : `<div class="empty-state">Dès qu'un changement important est détecté, le détail apparaît ici avec l'état avant / après.</div>`
      }
    </section>

    ${
      recentAlerts.length
        ? `<section class="panel stack">
            <div class="panel-header">
              <div>
                <h2>Alertes passées</h2>
                <p>Les cinq dernières alertes confirmées.</p>
              </div>
            </div>
            ${recentAlerts
              .map(
                (alert) => `
                  <article class="watch-card">
                    <div class="card-header">
                      <div class="stack compact-stack">
                        <h3>${escapeHtml(alert.watchLabel)}</h3>
                        <div class="watch-meta">
                          <div><strong>Déclenchée :</strong> ${escapeHtml(formatDateTime(alert.triggeredAt))}</div>
                          <div><strong>Résumé :</strong> ${escapeHtml(alert.summary.title)}</div>
                        </div>
                      </div>
                      <button class="secondary compact" data-action="open-alert-page" data-url="${escapeHtml(
                        alert.pageUrl
                      )}">Ouvrir</button>
                    </div>
                  </article>
                `
              )
              .join("")}
          </section>`
        : ""
    }
  `;

  wireActions(activeAlerts);
}

function wireActions(activeAlerts: AlertRecord[]) {
  app.querySelectorAll('[data-action="ack-all"]').forEach((node) => {
    node.addEventListener("click", async () => {
      await sendRuntimeMessage({ type: "ACK_ALERTS" });
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-action="ack-watch"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const watchId = button.dataset.watchId;
      if (!watchId) {
        return;
      }

      await sendRuntimeMessage({
        type: "ACK_ALERTS",
        watchIds: [watchId]
      });
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-action="open-alert-page"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const targetUrl = button.dataset.url;
      if (targetUrl) {
        await createTab({ url: targetUrl });
      }
    });
  });

  if (activeAlerts.length) {
    document.title = `Alerte Yallah Ping (${activeAlerts.length})`;
  } else {
    document.title = "Yallah Ping - Alerte";
  }
}

async function renderApp() {
  const state = await loadState();
  applyTheme(state.settings);
  await syncAlarm(state);
  render(state);
}

window.addEventListener("beforeunload", () => {
  void alarmPlayer.stop();
});

chrome.storage.onChanged.addListener(() => {
  void renderApp();
});

void renderApp();
