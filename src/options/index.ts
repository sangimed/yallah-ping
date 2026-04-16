import type { AlarmPresetId, AppState, StoredAudio, WatchRecord } from "../types";
import { createTab, sendRuntimeMessage } from "../shared/browser";
import { ALARM_PRESETS, normalizeAlarmPresetId } from "../shared/alarm-presets";
import { AlarmPlayer, getAlarmDisplayName } from "../shared/audio";
import { loadState } from "../shared/storage";
import { applyTheme, normalizeThemeMode } from "../shared/theme";
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

function formatVolume(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count > 1 ? plural : singular;
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

function renderPresetCard(presetId: AlarmPresetId, selectedPresetId: AlarmPresetId, customSelected: boolean): string {
  const preset = ALARM_PRESETS.find((item) => item.id === presetId) ?? ALARM_PRESETS[0];
  const inputId = `sound-${preset.id}`;
  const selected = !customSelected && selectedPresetId === preset.id;

  return `
    <article class="sound-card ${selected ? "is-selected" : ""}">
      <div class="sound-card-head">
        <input
          id="${escapeHtml(inputId)}"
          name="alarm-sound"
          type="radio"
          value="preset:${escapeHtml(preset.id)}"
          ${selected ? "checked" : ""}
        />
        <label for="${escapeHtml(inputId)}">${escapeHtml(preset.name)}</label>
      </div>
      <p>${escapeHtml(preset.description)}</p>
      <div class="sound-card-actions">
        <button type="button" class="secondary compact" data-action="preview-preset" data-preset-id="${escapeHtml(
          preset.id
        )}">Tester</button>
      </div>
    </article>
  `;
}

function renderThemeSwitch(state: AppState): string {
  const themeMode = normalizeThemeMode(state.settings.themeMode);

  return `
    <label class="theme-switch" for="theme-toggle">
      <input id="theme-toggle" type="checkbox" ${themeMode === "dark" ? "checked" : ""} />
      <span class="theme-switch-track" aria-hidden="true">
        <span class="theme-switch-thumb"></span>
      </span>
      <span>Mode sombre</span>
    </label>
  `;
}

function renderSoundSettings(state: AppState): string {
  const selectedPresetId = normalizeAlarmPresetId(state.settings.audioPresetId);
  const hasCustomAudio = Boolean(state.settings.customAudio?.dataUrl);
  const customSelected = state.settings.audioMode === "custom" && hasCustomAudio;
  const customName = state.settings.customAudio?.name ?? "Aucun fichier importé";

  return `
    <section class="panel stack">
      <div class="panel-header">
        <div>
          <h2>Sonnerie</h2>
          <p>Son choisi : ${escapeHtml(getAlarmDisplayName(state.settings))}</p>
        </div>
        <button class="secondary" data-action="test-sound">Tester</button>
      </div>

      <div class="sound-grid">
        ${ALARM_PRESETS.map((preset) => renderPresetCard(preset.id, selectedPresetId, customSelected)).join("")}

        <article class="sound-card ${customSelected ? "is-selected" : ""}">
          <div class="sound-card-head">
            <input
              id="sound-custom"
              name="alarm-sound"
              type="radio"
              value="custom"
              ${customSelected ? "checked" : ""}
              ${hasCustomAudio ? "" : "disabled"}
            />
            <label for="sound-custom">Fichier perso</label>
          </div>
          <p>${escapeHtml(customName)}</p>
          <input id="custom-audio" type="file" accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg" />
          <div class="field-help">Le fichier reste uniquement dans ce navigateur.</div>
          <div class="sound-card-actions">
            <button type="button" class="secondary compact" data-action="use-custom-sound" ${
              hasCustomAudio ? "" : "disabled"
            }>Utiliser</button>
            <button type="button" class="secondary compact" data-action="preview-custom" ${
              hasCustomAudio ? "" : "disabled"
            }>Tester</button>
            <button type="button" class="ghost compact" data-action="remove-custom-sound" ${
              hasCustomAudio ? "" : "disabled"
            }>Retirer</button>
          </div>
        </article>
      </div>

      <div class="volume-row">
        <label for="alarm-volume">Volume</label>
        <span id="alarm-volume-value" class="volume-value">${escapeHtml(formatVolume(state.settings.alertVolume))}</span>
        <input id="alarm-volume" type="range" min="0.1" max="1" step="0.05" value="${escapeHtml(
          String(state.settings.alertVolume)
        )}" />
      </div>
    </section>
  `;
}

function renderWatchEditor(watch: WatchRecord): string {
  const watchId = escapeHtml(watch.id);

  return `
    <article class="watch-card" data-watch-id="${watchId}">
      <div class="card-header">
        <div class="stack compact-stack">
          <div>${renderStatusPill(watch.status)}</div>
          <h3>${escapeHtml(watch.label)}</h3>
          <div class="watch-meta">
            <div><strong>Page :</strong> ${escapeHtml(watch.pageTitle || watch.pageUrl)}</div>
            <div><strong>Dernière vérification :</strong> ${escapeHtml(formatDateTime(watch.lastSeenAt))}</div>
          </div>
        </div>
        <div class="card-actions">
          <button class="secondary compact" data-action="open-page" data-url="${escapeHtml(watch.pageUrl)}">Ouvrir</button>
          <button class="danger compact" data-action="delete-watch" data-watch-id="${watchId}">Supprimer</button>
        </div>
      </div>

      <div class="form-grid two-column">
        <div>
          <label for="label-${watchId}">Nom de l'alerte</label>
          <input id="label-${watchId}" data-field="label" type="text" value="${escapeHtml(watch.label)}" />
        </div>

        <div>
          <label for="poll-${watchId}">Contrôle automatique</label>
          <div class="input-with-unit">
            <input id="poll-${watchId}" data-field="pollIntervalMs" type="number" min="2" step="1" value="${msToSeconds(
              watch.pollIntervalMs
            )}" />
            <span>sec</span>
          </div>
        </div>

        <div>
          <label for="debounce-${watchId}">Petite pause avant sonnerie</label>
          <div class="input-with-unit">
            <input id="debounce-${watchId}" data-field="mutationDebounceMs" type="number" min="150" step="50" value="${escapeHtml(
              String(watch.mutationDebounceMs)
            )}" />
            <span>ms</span>
          </div>
        </div>

        <div class="toggle-row field-toggle">
          <input id="enabled-${watchId}" data-field="enabled" type="checkbox" ${watch.enabled ? "checked" : ""} />
          <label for="enabled-${watchId}">Zone active</label>
        </div>
      </div>

      <div class="toggle-grid">
        <div class="toggle-row">
          <input id="mutation-${watchId}" data-field="useMutationObserver" type="checkbox" ${
            watch.useMutationObserver ? "checked" : ""
          } />
          <label for="mutation-${watchId}">Sonner dès que la page change</label>
        </div>

        <div class="toggle-row">
          <input id="polling-${watchId}" data-field="usePolling" type="checkbox" ${
            watch.usePolling ? "checked" : ""
          } />
          <label for="polling-${watchId}">Revérifier régulièrement</label>
        </div>
      </div>
    </article>
  `;
}

function render(state: AppState) {
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledgedAt);
  const activeWatches = state.watches.filter((watch) => watch.enabled);

  app.innerHTML = `
    <section class="hero">
      <div>
        <span class="eyebrow">Réglages</span>
        <h1>Yallah Ping</h1>
        <p>Choisissez ce que l'extension suit, comment elle sonne et comment elle s'affiche.</p>
      </div>
      <div class="hero-actions">
        ${renderThemeSwitch(state)}
        <button class="secondary" data-action="open-alert" ${activeAlerts.length ? "" : "disabled"}>Écran d'alerte</button>
      </div>
    </section>

    <section class="metric-strip">
      ${renderMetric(
        "Zones suivies",
        String(state.watches.length),
        `${activeWatches.length} active${activeWatches.length > 1 ? "s" : ""}`
      )}
      ${renderMetric(
        "Alertes",
        String(activeAlerts.length),
        activeAlerts.length ? "à confirmer" : "rien en attente"
      )}
      ${renderMetric("Son", getAlarmDisplayName(state.settings), formatVolume(state.settings.alertVolume))}
    </section>

    ${
      activeAlerts.length
        ? `<section class="banner alert stack">
            <strong>${activeAlerts.length} ${pluralize(activeAlerts.length, "alerte active", "alertes actives")}</strong>
            <div class="row">
              <button data-action="open-alert">Voir l'écran d'alerte</button>
              <button class="secondary" data-action="ack-all">Confirmer maintenant</button>
            </div>
          </section>`
        : ""
    }

    ${renderSoundSettings(state)}

    <section class="panel stack">
      <div class="panel-header">
        <div>
          <h2>Réglages des nouvelles zones</h2>
          <p>Ces valeurs seront appliquées aux prochaines zones que vous ajouterez.</p>
        </div>
        <button data-action="save-defaults">Enregistrer</button>
      </div>

      <div class="form-grid two-column">
        <div>
          <label for="default-poll">Contrôle automatique</label>
          <div class="input-with-unit">
            <input id="default-poll" type="number" min="2" step="1" value="${msToSeconds(
              state.settings.defaultPollIntervalMs
            )}" />
            <span>sec</span>
          </div>
          <div class="field-help">L'extension regarde à nouveau la zone après ce délai.</div>
        </div>
        <div>
          <label for="default-debounce">Petite pause avant sonnerie</label>
          <div class="input-with-unit">
            <input id="default-debounce" type="number" min="150" step="50" value="${escapeHtml(
              String(state.settings.defaultMutationDebounceMs)
            )}" />
            <span>ms</span>
          </div>
          <div class="field-help">Évite de sonner trop vite quand la page se met à jour plusieurs fois.</div>
        </div>
      </div>

      <div class="toggle-grid">
        <div class="toggle-row">
          <input id="default-mutation" type="checkbox" ${state.settings.defaultUseMutationObserver ? "checked" : ""} />
          <label for="default-mutation">Sonner dès que la page change</label>
        </div>

        <div class="toggle-row">
          <input id="default-polling" type="checkbox" ${state.settings.defaultUsePolling ? "checked" : ""} />
          <label for="default-polling">Revérifier régulièrement</label>
        </div>
      </div>
    </section>

    <section class="panel stack">
      <div class="panel-header">
        <div>
          <h2>Zones suivies</h2>
          <p>${state.watches.length ? "Ajustez les zones que vous voulez suivre." : "Aucune zone suivie pour le moment."}</p>
        </div>
      </div>
      ${
        state.watches.length
          ? state.watches.map((watch) => renderWatchEditor(watch)).join("")
          : `<div class="empty-state">Commencez depuis le popup avec le bouton <strong>Choisir sur la page</strong>.</div>`
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
  app.querySelector<HTMLInputElement>("#theme-toggle")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const themeMode = normalizeThemeMode(input.checked ? "dark" : "light");
    applyTheme({
      ...state.settings,
      themeMode
    });

    await sendRuntimeMessage({
      type: "SAVE_SETTINGS",
      patch: {
        themeMode
      }
    });
  });

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

  app.querySelectorAll<HTMLInputElement>('input[name="alarm-sound"]').forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.checked) {
        return;
      }

      if (input.value === "custom") {
        await sendRuntimeMessage({
          type: "SAVE_SETTINGS",
          patch: {
            audioMode: "custom"
          }
        });
        return;
      }

      const presetId = normalizeAlarmPresetId(input.value.replace("preset:", ""));
      await sendRuntimeMessage({
        type: "SAVE_SETTINGS",
        patch: {
          audioMode: "preset",
          audioPresetId: presetId
        }
      });
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

  app.querySelector<HTMLInputElement>("#alarm-volume")?.addEventListener("input", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const valueElement = document.getElementById("alarm-volume-value");
    if (valueElement) {
      valueElement.textContent = formatVolume(Number(input.value));
    }
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

  app.querySelectorAll<HTMLButtonElement>('[data-action="preview-preset"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const presetId = normalizeAlarmPresetId(button.dataset.presetId);
      await testSound({
        ...state.settings,
        audioMode: "preset",
        audioPresetId: presetId
      });
    });
  });

  app.querySelector('[data-action="preview-custom"]')?.addEventListener("click", async () => {
    if (!state.settings.customAudio) {
      return;
    }

    await testSound({
      ...state.settings,
      audioMode: "custom"
    });
  });

  app.querySelector('[data-action="use-custom-sound"]')?.addEventListener("click", async () => {
    await sendRuntimeMessage({
      type: "SAVE_SETTINGS",
      patch: {
        audioMode: "custom"
      }
    });
  });

  app.querySelector('[data-action="remove-custom-sound"]')?.addEventListener("click", async () => {
    await sendRuntimeMessage({
      type: "SAVE_SETTINGS",
      patch: {
        audioMode: "preset",
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
  applyTheme(state.settings);
  render(state);
}

chrome.storage.onChanged.addListener(() => {
  void renderApp();
});

void renderApp();
