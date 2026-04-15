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
      return "Sous surveillance";
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
  return `<span class="pill ${statusClass(status)}"><span class="pill-dot" aria-hidden="true"></span>${escapeHtml(statusLabel(status))}</span>`;
}

export function renderWatchSummary(watch: WatchRecord): string {
  return `
    <div class="summary-grid">
      <div class="summary-item">
        <span class="summary-label">Etat</span>
        <span class="summary-value">${renderStatusPill(watch.status)}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Derniere activite</span>
        <span class="summary-value">${escapeHtml(formatRelativeDelay(watch.lastSeenAt))}</span>
      </div>
      ${
        watch.lastChangeTitle
          ? `<div class="summary-item">
              <span class="summary-label">Dernier changement</span>
              <span class="summary-value">${escapeHtml(watch.lastChangeTitle)}</span>
            </div>`
          : ""
      }
      <div class="summary-item">
        <span class="summary-label">Page</span>
        <span class="summary-value">${escapeHtml(watch.pageTitle || watch.pageUrl)}</span>
      </div>
    </div>
  `;
}

export function renderAlertCard(alert: AlertRecord): string {
  const beforeText = alert.before?.text || alert.before?.lineSample.join("\n") || "Aucune valeur precedente";
  const afterText = alert.after?.text || alert.after?.lineSample.join("\n") || "Zone non visible";
  const added = alert.summary.addedLines
    .map((line) => `<div class="diff-added">+ ${escapeHtml(line)}</div>`)
    .join("");
  const removed = alert.summary.removedLines
    .map((line) => `<div class="diff-removed">- ${escapeHtml(line)}</div>`)
    .join("");
  const details = alert.summary.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("");

  return `
    <article class="alert-card status-alert" data-watch-id="${escapeHtml(alert.watchId)}">
      <div class="watch-title-row">
        <div class="watch-title-block">
          <div class="eyebrow">Changement detecte</div>
          <h3>${escapeHtml(alert.watchLabel)}</h3>
          <div class="card-subtitle">${escapeHtml(alert.summary.title)}</div>
        </div>
        <button class="secondary" data-action="ack-watch" data-watch-id="${escapeHtml(alert.watchId)}">Acquitter cette surveillance</button>
      </div>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Quand</span>
          <span class="summary-value">${escapeHtml(formatDateTime(alert.triggeredAt))}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Page</span>
          <span class="summary-value">${escapeHtml(alert.pageTitle || alert.pageUrl)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Resume</span>
          <span class="summary-value">${escapeHtml(alert.summary.title)}</span>
        </div>
      </div>
      <ul class="detail-list">${details}</ul>
      <div class="diff-grid">
        ${
          added || removed
            ? `<div class="diff-box">
                <h4>Lignes reperees</h4>
                <div class="diff-lines">
                  ${added || ""}
                  ${removed || ""}
                </div>
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
