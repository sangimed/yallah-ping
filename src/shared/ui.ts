import type { AlertRecord, WatchRecord, WatchStatus } from "../types";
import { formatDateTime, formatRelativeDelay } from "./time";

export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function statusLabel(status: WatchStatus): string {
  switch (status) {
    case "monitoring":
      return "Actif";
    case "alert":
      return "Alerte active";
    case "missing":
      return "Zone introuvable";
    case "paused":
      return "En pause";
    default:
      return "En attente";
  }
}

export function statusClass(status: WatchStatus): string {
  switch (status) {
    case "monitoring":
      return "ok";
    case "alert":
      return "danger";
    case "missing":
      return "missing";
    case "paused":
      return "warn";
    default:
      return "warn";
  }
}

export function renderStatusPill(status: WatchStatus): string {
  return `<span class="pill ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

export function renderWatchSummary(watch: WatchRecord): string {
  return `
    <div class="watch-meta">
      <div>${renderStatusPill(watch.status)}</div>
      <div><strong>Page :</strong> ${escapeHtml(watch.pageTitle || watch.pageUrl)}</div>
      <div><strong>Dernière activité :</strong> ${escapeHtml(formatRelativeDelay(watch.lastSeenAt))}</div>
      ${
        watch.lastChangeTitle
          ? `<div><strong>Dernier changement :</strong> ${escapeHtml(watch.lastChangeTitle)}</div>`
          : ""
      }
    </div>
  `;
}

export function renderAlertCard(alert: AlertRecord): string {
  const beforeText = alert.before?.text || alert.before?.lineSample.join("\n") || "Aucune valeur précédente";
  const afterText = alert.after?.text || alert.after?.lineSample.join("\n") || "Zone non visible";
  const added = alert.summary.addedLines
    .map((line) => `<div class="diff-added">+ ${escapeHtml(line)}</div>`)
    .join("");
  const removed = alert.summary.removedLines
    .map((line) => `<div class="diff-removed">- ${escapeHtml(line)}</div>`)
    .join("");
  const details = alert.summary.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("");

  return `
    <article class="alert-card" data-watch-id="${escapeHtml(alert.watchId)}">
      <div class="split">
        <div class="stack">
          <h3>${escapeHtml(alert.watchLabel)}</h3>
          <div class="alert-meta">
            <div><strong>Quand :</strong> ${escapeHtml(formatDateTime(alert.triggeredAt))}</div>
            <div><strong>Page :</strong> ${escapeHtml(alert.pageTitle || alert.pageUrl)}</div>
            <div><strong>Résumé :</strong> ${escapeHtml(alert.summary.title)}</div>
          </div>
        </div>
        <button class="secondary" data-action="ack-watch" data-watch-id="${escapeHtml(alert.watchId)}">Confirmer cette alerte</button>
      </div>
      <ul>${details}</ul>
      <div class="diff-grid">
        ${
          added || removed
            ? `<div class="diff-box">
                <h4>Lignes repérées</h4>
                ${added || ""}
                ${removed || ""}
              </div>`
            : ""
        }
        <div class="diff-box">
          <h4>Avant</h4>
          <pre>${escapeHtml(beforeText)}</pre>
        </div>
        <div class="diff-box">
          <h4>Maintenant</h4>
          <pre>${escapeHtml(afterText)}</pre>
        </div>
      </div>
    </article>
  `;
}
