import type { AlertRecord, AppState } from "../types";
import { AlarmPlayer } from "../shared/audio";
import { createTab, sendRuntimeMessage } from "../shared/browser";
import { loadState } from "../shared/storage";
import { renderAlertCard } from "../shared/ui";

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

function render(state: AppState) {
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledgedAt);
  const recentAlerts = state.alerts.filter((alert) => alert.acknowledgedAt).slice(0, 5);

  app.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div class="stack">
          <div class="eyebrow">${activeAlerts.length ? "Priorite immediate" : "Etat stable"}</div>
          <h1 class="hero-title">${activeAlerts.length ? "Alerte Yallah Ping" : "Tout est acquitte"}</h1>
          <p class="hero-copy">${
            activeAlerts.length
              ? "Le son reste actif jusqu'a acquittement explicite."
              : "Aucune alerte en attente. Vous pouvez fermer cette fenetre."
          }</p>
        </div>
        <div class="stat-grid">
          <div class="stat-card">
            <span class="stat-value">${activeAlerts.length}</span>
            <span class="stat-label">Alertes actives</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${recentAlerts.length}</span>
            <span class="stat-label">Historique recent</span>
          </div>
        </div>
      </div>
    </section>

    ${
      activeAlerts.length
        ? `<section class="banner alert stack">
            <strong>${activeAlerts.length} changement${activeAlerts.length > 1 ? "s" : ""} detecte${activeAlerts.length > 1 ? "s" : ""}</strong>
            <div class="row action-row">
              <button data-action="ack-all">Acquitter toutes les alertes</button>
            </div>
          </section>`
        : `<section class="banner info">Aucune alerte active pour le moment.</section>`
    }

    <section class="panel stack">
      <div class="section-head">
        <div class="stack">
          <div class="eyebrow">Analyse</div>
          <h2>Ce qui a change</h2>
        </div>
      </div>
      ${
        activeAlerts.length
          ? activeAlerts.map((alert) => renderAlertCard(alert)).join("")
          : `<div class="empty-state">Des qu'un changement important est detecte, le detail apparait ici avec l'etat avant / apres.</div>`
      }
    </section>

    ${
      recentAlerts.length
        ? `<section class="panel stack">
            <div class="section-head">
              <div class="stack">
                <div class="eyebrow">Memoire locale</div>
                <h2>Historique recent</h2>
              </div>
            </div>
            ${recentAlerts
              .map(
                (alert) => `
                  <article class="watch-card status-idle">
                    <div class="watch-title-row">
                      <div class="watch-title-block">
                        <div class="eyebrow">Alerte acquittee</div>
                        <h3>${alert.watchLabel}</h3>
                        <div class="card-subtitle">${alert.summary.title}</div>
                      </div>
                      <button class="secondary" data-action="open-alert-page" data-url="${alert.pageUrl}">Ouvrir la page</button>
                    </div>
                    <div class="summary-grid">
                      <div class="summary-item">
                        <span class="summary-label">Declenchee</span>
                        <span class="summary-value">${new Intl.DateTimeFormat("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "medium"
                        }).format(alert.triggeredAt)}</span>
                      </div>
                      <div class="summary-item">
                        <span class="summary-label">Resume</span>
                        <span class="summary-value">${alert.summary.title}</span>
                      </div>
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
  app.querySelector('[data-action="ack-all"]')?.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "ACK_ALERTS" });
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
