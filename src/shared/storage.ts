import type { AppSettings, AppState } from "../types";
import { getStorageApi } from "./browser";

const STORAGE_KEY = "appState";

export const DEFAULT_SETTINGS: AppSettings = {
  defaultPollIntervalMs: 15000,
  defaultMutationDebounceMs: 600,
  defaultUseMutationObserver: true,
  defaultUsePolling: true,
  audioMode: "preset",
  audioPresetId: "classic",
  alertVolume: 1,
  themeMode: "light"
};

export const DEFAULT_STATE: AppState = {
  watches: [],
  alerts: [],
  settings: DEFAULT_SETTINGS
};

export async function loadState(): Promise<AppState> {
  const storage = getStorageApi();
  const result = await storage.get(STORAGE_KEY);
  const rawState = result[STORAGE_KEY] as Partial<AppState> | undefined;

  return {
    watches: rawState?.watches ?? [],
    alerts: rawState?.alerts ?? [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...rawState?.settings
    }
  };
}

export async function saveState(state: AppState): Promise<void> {
  const storage = getStorageApi();
  await storage.set({ [STORAGE_KEY]: state });
}

export async function mutateState(
  mutator: (state: AppState) => AppState | Promise<AppState>
): Promise<AppState> {
  const currentState = await loadState();
  const nextState = await mutator(structuredClone(currentState));
  await saveState(nextState);
  return nextState;
}
