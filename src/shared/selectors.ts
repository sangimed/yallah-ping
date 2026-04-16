import type { SelectorDescriptor } from "../types";
import { cssEscape, normalizeText, shortText } from "./dom";

const STABLE_ATTRIBUTES = ["data-testid", "data-test", "data-qa", "data-cy", "aria-label", "name", "role"] as const;

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

function getElementText(element: Element): string {
  const htmlElement = element as HTMLElement;
  return normalizeText(htmlElement.innerText || htmlElement.textContent || "");
}

function isLikelyStableId(id: string): boolean {
  if (id.startsWith(":") || id.length < 3) {
    return false;
  }

  return !/^(?:ember|react-select-|headlessui-|radix-)?\d+$/i.test(id);
}

function isVolatileAttributeValue(attributeName: string, rawValue: string, element: Element): boolean {
  if (attributeName.startsWith("data-") || attributeName === "role") {
    return false;
  }

  const attributeValue = normalizeText(rawValue);
  const elementText = getElementText(element);

  if (!attributeValue) {
    return true;
  }

  if (elementText && (attributeValue.includes(elementText) || elementText.includes(attributeValue))) {
    return true;
  }

  return /\d/.test(attributeValue) && (!elementText || /\d/.test(elementText));
}

function firstStableSelector(element: Element): string | undefined {
  const htmlElement = element as HTMLElement;

  if (htmlElement.id && isLikelyStableId(htmlElement.id)) {
    const idSelector = `#${cssEscape(htmlElement.id)}`;
    if (document.querySelectorAll(idSelector).length === 1) {
      return idSelector;
    }
  }

  for (const attributeName of STABLE_ATTRIBUTES) {
    const rawValue = htmlElement.getAttribute(attributeName);
    if (!rawValue || isVolatileAttributeValue(attributeName, rawValue, element)) {
      continue;
    }

    const attributeSelector = `${element.tagName.toLowerCase()}[${attributeName}="${cssEscape(rawValue)}"]`;
    if (document.querySelectorAll(attributeSelector).length === 1) {
      return attributeSelector;
    }
  }

  return undefined;
}

function getXPathIndex(element: Element): number {
  let index = 1;
  let sibling = element.previousElementSibling;

  while (sibling) {
    if (sibling.localName === element.localName) {
      index += 1;
    }

    sibling = sibling.previousElementSibling;
  }

  return index;
}

function xPathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }

  if (!value.includes('"')) {
    return `"${value}"`;
  }

  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(`, "'", `)})`;
}

function firstStableXPath(element: Element): string | undefined {
  const htmlElement = element as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (htmlElement.id && isLikelyStableId(htmlElement.id)) {
    const idSelector = `#${cssEscape(htmlElement.id)}`;
    if (document.querySelectorAll(idSelector).length === 1) {
      return `//*[@id=${xPathLiteral(htmlElement.id)}]`;
    }
  }

  for (const attributeName of STABLE_ATTRIBUTES) {
    const rawValue = htmlElement.getAttribute(attributeName);
    if (!rawValue || isVolatileAttributeValue(attributeName, rawValue, element)) {
      continue;
    }

    const attributeSelector = `${tagName}[${attributeName}="${cssEscape(rawValue)}"]`;
    if (document.querySelectorAll(attributeSelector).length === 1) {
      return `//${tagName}[@${attributeName}=${xPathLiteral(rawValue)}]`;
    }
  }

  return undefined;
}

function buildXPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current) {
    const stableXPath = firstStableXPath(current);
    if (stableXPath) {
      return parts.length ? `${stableXPath}/${parts.join("/")}` : stableXPath;
    }

    const step = `${current.tagName.toLowerCase()}[${getXPathIndex(current)}]`;
    parts.unshift(step);

    if (current === document.documentElement) {
      break;
    }

    current = current.parentElement;
  }

  return `/${parts.join("/")}`;
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
    xpath: buildXPath(element),
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

  const text = getElementText(htmlElement);
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

function tryXPath(xpath: string): Element | null {
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue instanceof Element ? result.singleNodeValue : null;
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

  if (descriptor.xpath) {
    const byXPath = tryXPath(descriptor.xpath);
    if (byXPath) {
      return byXPath;
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
    if (/^\d+$/.test(descriptor.textHint) || descriptor.textHint.length < 3) {
      return null;
    }

    const candidates = Array.from(document.querySelectorAll(descriptor.tagName));
    return (
      candidates.find((candidate) =>
        getElementText(candidate).includes(descriptor.textHint as string)
      ) ?? null
    );
  }

  return null;
}

export function describeElement(element: Element): string {
  const htmlElement = element as HTMLElement;
  const text = getElementText(htmlElement);
  const primaryText = shortText(text, 72);
  return primaryText || htmlElement.getAttribute("aria-label") || element.tagName.toLowerCase();
}
