import type { AppSettings, ThemeMode } from "../types";

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

export function applyTheme(settings: Pick<AppSettings, "themeMode">) {
  document.documentElement.dataset.theme = normalizeThemeMode(settings.themeMode);
}
