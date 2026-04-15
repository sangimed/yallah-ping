import type { ChangeSummary, ElementSnapshot } from "../types";
import { normalizeText, shortText, simpleHash, splitTextLines } from "./dom";

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function captureSnapshot(element: Element): ElementSnapshot {
  const htmlElement = element as HTMLElement;
  const rawText = htmlElement.innerText || htmlElement.textContent || "";
  const normalized = normalizeText(rawText);
  const lines = splitTextLines(rawText);

  return {
    capturedAt: Date.now(),
    tagName: element.tagName.toLowerCase(),
    text: shortText(normalized, 5000),
    lineSample: uniqueList(lines).slice(0, 12),
    childCount: element.childElementCount,
    htmlDigest: simpleHash(htmlElement.innerHTML)
  };
}

export function compareSnapshots(before?: ElementSnapshot, after?: ElementSnapshot): ChangeSummary | null {
  if (!before && !after) {
    return null;
  }

  if (!after) {
    return {
      title: "La zone surveillee n'est plus visible",
      details: ["L'element choisi n'a plus pu etre retrouve sur la page."],
      addedLines: [],
      removedLines: before?.lineSample ?? []
    };
  }

  if (!before) {
    return {
      title: "Nouvelle zone surveillee",
      details: ["Un premier etat a ete enregistre pour cette zone."],
      addedLines: after.lineSample,
      removedLines: []
    };
  }

  const unchanged =
    before.htmlDigest === after.htmlDigest &&
    before.text === after.text &&
    before.childCount === after.childCount;

  if (unchanged) {
    return null;
  }

  const addedLines = after.lineSample.filter((line) => !before.lineSample.includes(line)).slice(0, 6);
  const removedLines = before.lineSample.filter((line) => !after.lineSample.includes(line)).slice(0, 6);
  const details: string[] = [];

  if (before.childCount !== after.childCount) {
    details.push(`Nombre d'elements visibles : ${before.childCount} -> ${after.childCount}`);
  }

  if (before.text !== after.text) {
    details.push("Le contenu visible a change.");
  }

  if (!details.length) {
    details.push("La structure HTML de la zone a change.");
  }

  let title = "Changement detecte";
  if (addedLines.length && !removedLines.length) {
    title = "Nouveau contenu detecte";
  } else if (!addedLines.length && removedLines.length) {
    title = "Du contenu a disparu";
  } else if (before.childCount !== after.childCount) {
    title = "La liste visible a change";
  }

  return {
    title,
    details,
    addedLines,
    removedLines
  };
}
