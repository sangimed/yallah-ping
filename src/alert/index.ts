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
      <h1>${activeAlerts.length ? "Alerte Yallah Ping" : "Tout est acquitte"}</h1>
      <p>${
        activeAlerts.length
          ? "Le son reste actif jusqu'a acquittement explicite."
          : "Aucune alerte en attente. Vous pouvez fermer cette fenetre."
      }</p>
    </section>

    ${
      activeAlerts.length
        ? `<section class="banner alert stack">
            <strong>${activeAlerts.length} changement${activeAlerts.length > 1 ? "s" : ""} detecte${activeAlerts.length > 1 ? "s" : ""}</strong>
            <div class="row">
              <button data-action="ack-all">Acquitter toutes les alertes</button>
            </div>
          </section>`
        : `<section class="banner info">Aucune alerte active pour le moment.</section>`
    }

    <section class="panel stack">
      <h2>Ce qui a change</h2>
      ${
        activeAlerts.length
          ? activeAlerts.map((alert) => renderAlertCard(alert)).join("")
          : `<div class="empty-state">Des qu'un changement important est detecte, le detail apparait ici avec l'etat avant / apres.</div>`
      }
    </section>

    ${
      recentAlerts.length
        ? `<section class="panel stack">
            <h2>Historique recent</h2>
            ${recentAlerts
              .map(
                (alert) => `
                  <article class="watch-card">
                    <div class="split">
                      <div class="stack">
                        <h3>${alert.watchLabel}</h3>
                        <div class="watch-meta">
                          <div><strong>Declenchee :</strong> ${new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "medium"
                          }).format(alert.triggeredAt)}</div>
                          <div><strong>Resume :</strong> ${alert.summary.title}</div>
                        </div>
                      </div>
                      <button class="secondary" data-action="open-alert-page" data-url="${alert.pageUrl}">Ouvrir la page</button>
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
