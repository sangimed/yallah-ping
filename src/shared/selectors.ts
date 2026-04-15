import type { SelectorDescriptor } from "../types";
import { cssEscape, normalizeText, shortText } from "./dom";

const STABLE_ATTRIBUTES = ["data-testid", "data-test", "aria-label", "name", "role"] as const;

function getNthOfType(element: Element): number {
  let count = 1;
  let previous = element.previousElementSibling;

  while (previous) {
    if (previous.tagName === element.tagName) {
      count += 1;
    }

    previous = previous.previousElementSibling;
  }

  return count;
}

function firstStableSelector(element: Element): string | undefined {
  const htmlElement = element as HTMLElement;

  if (htmlElement.id) {
    const idSelector = `#${cssEscape(htmlElement.id)}`;
    if (document.querySelectorAll(idSelector).length === 1) {
      return idSelector;
    }
  }

  for (const attributeName of STABLE_ATTRIBUTES) {
    const rawValue = htmlElement.getAttribute(attributeName);
    if (!rawValue) {
      continue;
    }

    const attributeSelector = `${element.tagName.toLowerCase()}[${attributeName}="${cssEscape(rawValue)}"]`;
    if (document.querySelectorAll(attributeSelector).length === 1) {
      return attributeSelector;
    }
  }

  return undefined;
}

export function buildSelectorDescriptor(element: Element): SelectorDescriptor {
  const directSelector = firstStableSelector(element);
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    const direct = firstStableSelector(current);
    if (direct) {
      parts.unshift(direct);
      break;
    }

    const part = `${current.tagName.toLowerCase()}:nth-of-type(${getNthOfType(current)})`;
    parts.unshift(part);
    current = current.parentElement;
  }

  if (!parts.length && directSelector) {
    parts.push(directSelector);
  }

  const htmlElement = element as HTMLElement;
  const descriptor: SelectorDescriptor = {
    css: parts.join(" > "),
    tagName: element.tagName.toLowerCase()
  };

  if (htmlElement.id) {
    descriptor.id = htmlElement.id;
  }

  const dataTestId = htmlElement.getAttribute("data-testid") ?? htmlElement.getAttribute("data-test");
  if (dataTestId) {
    descriptor.dataTestId = dataTestId;
  }

  const ariaLabel = htmlElement.getAttribute("aria-label");
  if (ariaLabel) {
    descriptor.ariaLabel = ariaLabel;
  }

  const role = htmlElement.getAttribute("role");
  if (role) {
    descriptor.role = role;
  }

  const text = normalizeText(htmlElement.innerText || htmlElement.textContent || "");
  if (text) {
    descriptor.textHint = shortText(text, 120);
  }

  return descriptor;
}

function trySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export function resolveElement(descriptor: SelectorDescriptor): Element | null {
  if (descriptor.css) {
    const directMatch = trySelector(descriptor.css);
    if (directMatch) {
      return directMatch;
    }
  }

  if (descriptor.id) {
    const byId = document.getElementById(descriptor.id);
    if (byId) {
      return byId;
    }
  }

  if (descriptor.dataTestId) {
    const byTestId = trySelector(
      `${descriptor.tagName}[data-testid="${cssEscape(descriptor.dataTestId)}"], ${descriptor.tagName}[data-test="${cssEscape(
        descriptor.dataTestId
      )}"]`
    );
    if (byTestId) {
      return byTestId;
    }
  }

  if (descriptor.ariaLabel) {
    const byAria = trySelector(`${descriptor.tagName}[aria-label="${cssEscape(descriptor.ariaLabel)}"]`);
    if (byAria) {
      return byAria;
    }
  }

  if (descriptor.textHint) {
    const candidates = Array.from(document.querySelectorAll(descriptor.tagName));
    return (
      candidates.find((candidate) =>
        normalizeText((candidate as HTMLElement).innerText || candidate.textContent || "").includes(descriptor.textHint as string)
      ) ?? null
    );
  }

  return null;
}

export function describeElement(element: Element): string {
  const htmlElement = element as HTMLElement;
  const text = normalizeText(htmlElement.innerText || htmlElement.textContent || "");
  const primaryText = shortText(text, 72);
  return primaryText || htmlElement.getAttribute("aria-label") || element.tagName.toLowerCase();
}
