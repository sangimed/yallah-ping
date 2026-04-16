export function formatDateTime(timestamp?: number): string {
  if (!timestamp) {
    return "Jamais";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(timestamp);
}

export function formatRelativeDelay(timestamp?: number): string {
  if (!timestamp) {
    return "Aucune activité récente";
  }

  const deltaMs = Date.now() - timestamp;
  const deltaMinutes = Math.round(deltaMs / 60000);

  if (deltaMinutes <= 1) {
    return "À l'instant";
  }

  if (deltaMinutes < 60) {
    return `Il y a ${deltaMinutes} min`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `Il y a ${deltaHours} h`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `Il y a ${deltaDays} j`;
}
