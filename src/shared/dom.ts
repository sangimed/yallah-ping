export function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function splitTextLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

export function shortText(input: string, maxLength = 220): string {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength - 1)}…`;
}

export function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

export function simpleHash(input: string): string {
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePageUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function isSamePage(left: string, right: string): boolean {
  return normalizePageUrl(left) === normalizePageUrl(right);
}
