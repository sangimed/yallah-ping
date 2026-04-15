import type { AppState, StoredAudio, WatchRecord } from "../types";
import { createTab, sendRuntimeMessage } from "../shared/browser";
import { AlarmPlayer } from "../shared/audio";
import { loadState } from "../shared/storage";
import { formatDateTime } from "../shared/time";
import { escapeHtml, renderStatusPill } from "../shared/ui";

const appElement = document.getElementById("app");
const alarmPlayer = new AlarmPlayer();
let previewTimeout: number | undefined;

if (!appElement) {
  throw new Error("Conteneur options introuvable.");
}

const app = appElement;

function msToSeconds(value: number): number {
  return Math.round(value / 1000);
}

function renderWatchEditor(watch: WatchRecord): string {
  return `
    <article class="watch-card" data-watch-id="${escapeHtml(watch.id)}">
      <div class="split">
        <div class="stack">
          <h3>${escapeHtml(watch.label)}</h3>
          <div class="watch-meta">
            <div>${renderStatusPill(watch.status)}</div>
            <div><strong>Page :</strong> ${escapeHtml(watch.pageTitle || watch.pageUrl)}</div>
            <div><strong>Derniere verification :</strong> ${escapeHtml(formatDateTime(watch.lastSeenAt))}</div>
          </div>
        </div>
        <div class="row">
          <button class="secondary" data-action="open-page" data-url="${escapeHtml(watch.pageUrl)}">Ouvrir</button>
          <button class="danger" data-action="delete-watch" data-watch-id="${escapeHtml(watch.id)}">Supprimer</button>
        </div>
      </div>

      <div class="form-grid">
        <div>
          <label for="label-${escapeHtml(watch.id)}">Nom visible</label>
          <input id="label-${escapeHtml(watch.id)}" data-field="label" type="text" value="${escapeHtml(watch.label)}" />
        </div>

        <div class="toggle-row">
          <input id="enabled-${escapeHtml(watch.id)}" data-field="enabled" type="checkbox" ${watch.enabled ? "checked" : ""} />
          <label for="enabled-${escapeHtml(watch.id)}">Surveillance active</label>
        </div>

        <div class="row">
          <div style="flex: 1 1 180px;">
            <label for="poll-${escapeHtml(watch.id)}">Verification reguliere (secondes)</label>
            <input id="poll-${escapeHtml(watch.id)}" data-field="pollIntervalMs" type="number" min="2" step="1" value="${msToSeconds(
              watch.pollIntervalMs
            )}" />
          </div>
          <div style="flex: 1 1 180px;">
            <label for="debounce-${escapeHtml(watch.id)}">Temps de stabilisation (ms)</label>
            <input id="debounce-${escapeHtml(watch.id)}" data-field="mutationDebounceMs" type="number" min="150" step="50" value="${escapeHtml(
              String(watch.mutationDebounceMs)
            )}" />
          </div>
        </div>

        <div class="toggle-row">
          <input id="mutation-${escapeHtml(watch.id)}" data-field="useMutationObserver" type="checkbox" ${
            watch.useMutationObserver ? "checked" : ""
          } />
          <label for="mutation-${escapeHtml(watch.id)}">Reaction immediate aux changements visibles</label>
        </div>

        <div class="toggle-row">
          <input id="polling-${escapeHtml(watch.id)}" data-field="usePolling" type="checkbox" ${
            watch.usePolling ? "checked" : ""
          } />
          <label for="polling-${escapeHtml(watch.id)}">Verification reguliere meme si rien ne bouge a l'ecran</label>
        </div>
      </div>
    </article>
  `;
}

function render(state: AppState) {
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledgedAt);
  const audioName =
    state.settings.audioMode === "custom" && state.settings.customAudio
      ? `Son personnalise : ${state.settings.customAudio.name}`
      : "Son integre tres fort";

  app.innerHTML = `
    <section class="hero">
      <h1>Reglages Yallah Ping</h1>
      <p>Tout fonctionne localement dans ce navigateur. Aucun backend, aucune dependance Internet pour surveiller la page.</p>
    </section>

    ${
      activeAlerts.length
        ? `<section class="banner alert stack">
            <strong>${activeAlerts.length} alerte${activeAlerts.length > 1 ? "s" : ""} encore active${activeAlerts.length > 1 ? "s" : ""}</strong>
            <div class="row">
              <button data-action="open-alert">Voir l'ecran d'alerte</button>
              <button class="secondary" data-action="ack-all">Acquitter maintenant</button>
            </div>
          </section>`
        : ""
    }

    <section class="panel stack">
      <h2>Comportement par defaut</h2>
      <div class="form-grid">
        <div class="row">
          <div style="flex: 1 1 220px;">
            <label for="default-poll">Verification reguliere (secondes)</label>
            <input id="default-poll" type="number" min="2" step="1" value="${msToSeconds(
              state.settings.defaultPollIntervalMs
            )}" />
            <div class="field-help">Utile si la page est reactive ou si aucun mouvement visible n'apparait dans le DOM.</div>
          </div>
          <div style="flex: 1 1 220px;">
            <label for="default-debounce">Temps de stabilisation (ms)</label>
            <input id="default-debounce" type="number" min="150" step="50" value="${escapeHtml(
              String(state.settings.defaultMutationDebounceMs)
            )}" />
            <div class="field-help">Evite de sonner pendant les rafraichissements tres rapides.</div>
          </div>
        </div>

        <div class="toggle-row">
          <input id="default-mutation" type="checkbox" ${state.settings.defaultUseMutationObserver ? "checked" : ""} />
          <label for="default-mutation">Reaction immediate aux changements visibles</label>
        </div>

        <div class="toggle-row">
          <input id="default-polling" type="checkbox" ${state.settings.defaultUsePolling ? "checked" : ""} />
          <label for="default-polling">Verification reguliere en continu</label>
        </div>
      </div>
      <div class="row">
        <button data-action="save-defaults">Enregistrer ces valeurs</button>
      </div>
    </section>

    <section class="panel stack">
      <h2>Son d'alarme</h2>
      <p>${escapeHtml(audioName)}</p>
      <div class="form-grid">
        <div>
          <label for="custom-audio">Importer un MP3 personnalise</label>
          <input id="custom-audio" type="file" accept=".mp3,audio/mpeg" />
          <div class="field-help">Le fichier reste stocke localement dans l'extension.</div>
        </div>
        <div>
          <label for="alarm-volume">Volume</label>
          <input id="alarm-volume" type="range" min="0.1" max="1" step="0.05" value="${escapeHtml(
            String(state.settings.alertVolume)
          )}" />
        </div>
      </div>
      <div class="row">
        <button class="secondary" data-action="test-sound">Tester le son</button>
        <button class="secondary" data-action="use-default-sound">Revenir au son integre</button>
      </div>
    </section>

    <section class="panel stack">
      <div class="split">
        <div>
          <h2>Surveillances</h2>
          <p>${state.watches.length ? "Chaque carte correspond a une zone surveillee." : "Aucune surveillance enregistree."}</p>
        </div>
      </div>
      ${
        state.watches.length
          ? state.watches.map((watch) => renderWatchEditor(watch)).join("")
          : `<div class="empty-state">Commencez depuis le popup de l'extension avec le bouton <strong>Choisir sur la page</strong>.</div>`
      }
    </section>
  `;

  wireActions(state);
}

async function uploadCustomAudio(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Impossible de lire le fichier."));
    reader.readAsDataURL(file);
  });

  const customAudio: StoredAudio = {
    name: file.name,
    mimeType: file.type || "audio/mpeg",
    dataUrl,
    uploadedAt: Date.now()
  };

  await sendRuntimeMessage({
    type: "SAVE_SETTINGS",
    patch: {
      audioMode: "custom",
      customAudio
    }
  });
}

async function testSound(settings: AppState["settings"]) {
  await alarmPlayer.start(settings);

  if (previewTimeout) {
    window.clearTimeout(previewTimeout);
  }

  previewTimeout = window.setTimeout(() => {
    void alarmPlayer.stop();
  }, 3000);
}

function wireActions(state: AppState) {
  app.querySelector('[data-action="save-defaults"]')?.addEventListener("click", async () => {
    const pollSeconds = Number((document.getElementById("default-poll") as HTMLInputElement).value || "15");
    const debounceMs = Number((document.getElementById("default-debounce") as HTMLInputElement).value || "600");
    const useMutationObserver = (document.getElementById("default-mutation") as HTMLInputElement).checked;
    const usePolling = (document.getElementById("default-polling") as HTMLInputElement).checked;

    await sendRuntimeMessage({
      type: "SAVE_SETTINGS",
      patch: {
        defaultPollIntervalMs: pollSeconds * 1000,
        defaultMutationDebounceMs: debounceMs,
        defaultUseMutationObserver: useMutationObserver,
        defaultUsePolling: usePolling
      }
    });
  });

  app.querySelector<HTMLInputElement>("#custom-audio")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    await uploadCustomAudio(file);
    input.value = "";
  });

  app.querySelector<HTMLInputElement>("#alarm-volume")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    await sendRuntimeMessage({
      type: "SAVE_SETTINGS",
      patch: {
        alertVolume: Number(input.value)
      }
    });
  });

  app.querySelector('[data-action="test-sound"]')?.addEventListener("click", async () => {
    await testSound(state.settings);
  });

  app.querySelector('[data-action="use-default-sound"]')?.addEventListener("click", async () => {
    await sendRuntimeMessage({
      type: "SAVE_SETTINGS",
      patch: {
        audioMode: "default",
        customAudio: undefined
      }
    });
  });

  app.querySelector('[data-action="ack-all"]')?.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "ACK_ALERTS" });
  });

  app.querySelector('[data-action="open-alert"]')?.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "OPEN_ALERT_WINDOW" });
  });

  app.querySelectorAll<HTMLElement>("[data-watch-id]").forEach((card) => {
    const watchId = card.dataset.watchId;
    if (!watchId) {
      return;
    }

    card.querySelector<HTMLInputElement>('[data-field="label"]')?.addEventListener("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement;
      await sendRuntimeMessage({
        type: "UPDATE_WATCH",
        watchId,
        patch: {
          label: input.value
        }
      });
    });

    card.querySelector<HTMLInputElement>('[data-field="enabled"]')?.addEventListener("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement;
      await sendRuntimeMessage({
        type: "UPDATE_WATCH",
        watchId,
        patch: {
          enabled: input.checked
        }
      });
    });

    card.querySelector<HTMLInputElement>('[data-field="pollIntervalMs"]')?.addEventListener("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement;
      await sendRuntimeMessage({
        type: "UPDATE_WATCH",
        watchId,
        patch: {
          pollIntervalMs: Number(input.value) * 1000
        }
      });
    });

    card
      .querySelector<HTMLInputElement>('[data-field="mutationDebounceMs"]')
      ?.addEventListener("change", async (event) => {
        const input = event.currentTarget as HTMLInputElement;
        await sendRuntimeMessage({
          type: "UPDATE_WATCH",
          watchId,
          patch: {
            mutationDebounceMs: Number(input.value)
          }
        });
      });

    card
      .querySelector<HTMLInputElement>('[data-field="useMutationObserver"]')
      ?.addEventListener("change", async (event) => {
        const input = event.currentTarget as HTMLInputElement;
        await sendRuntimeMessage({
          type: "UPDATE_WATCH",
          watchId,
          patch: {
            useMutationObserver: input.checked
          }
        });
      });

    card.querySelector<HTMLInputElement>('[data-field="usePolling"]')?.addEventListener("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement;
      await sendRuntimeMessage({
        type: "UPDATE_WATCH",
        watchId,
        patch: {
          usePolling: input.checked
        }
      });
    });

    card.querySelector<HTMLButtonElement>('[data-action="delete-watch"]')?.addEventListener("click", async () => {
      await sendRuntimeMessage({
        type: "DELETE_WATCH",
        watchId
      });
    });

    card.querySelector<HTMLButtonElement>('[data-action="open-page"]')?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const targetUrl = button.dataset.url;
      if (targetUrl) {
        await createTab({ url: targetUrl });
      }
    });
  });
}

async function renderApp() {
  const state = await loadState();
  render(state);
}

chrome.storage.onChanged.addListener(() => {
  void renderApp();
});

void renderApp();
