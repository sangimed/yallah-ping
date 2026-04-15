export type WatchStatus = "idle" | "monitoring" | "alert" | "missing" | "paused";

export interface SelectorDescriptor {
  css: string;
  id?: string;
  dataTestId?: string;
  ariaLabel?: string;
  role?: string;
  tagName: string;
  textHint?: string;
}

export interface ElementSnapshot {
  capturedAt: number;
  tagName: string;
  text: string;
  lineSample: string[];
  childCount: number;
  htmlDigest: string;
}

export interface ChangeSummary {
  title: string;
  details: string[];
  addedLines: string[];
  removedLines: string[];
}

export interface WatchRecord {
  id: string;
  label: string;
  pageUrl: string;
  pageTitle: string;
  selector: SelectorDescriptor;
  enabled: boolean;
  pollIntervalMs: number;
  mutationDebounceMs: number;
  useMutationObserver: boolean;
  usePolling: boolean;
  createdAt: number;
  updatedAt: number;
  status: WatchStatus;
  lastSnapshot?: ElementSnapshot;
  lastSeenAt?: number;
  lastChangeAt?: number;
  lastChangeTitle?: string;
  lastError?: string;
}

export interface AlertRecord {
  id: string;
  watchId: string;
  watchLabel: string;
  pageUrl: string;
  pageTitle: string;
  triggeredAt: number;
  summary: ChangeSummary;
  before?: ElementSnapshot;
  after?: ElementSnapshot;
  acknowledgedAt?: number;
}

export interface StoredAudio {
  name: string;
  mimeType: string;
  dataUrl: string;
  uploadedAt: number;
}

export interface AppSettings {
  defaultPollIntervalMs: number;
  defaultMutationDebounceMs: number;
  defaultUseMutationObserver: boolean;
  defaultUsePolling: boolean;
  audioMode: "default" | "custom";
  customAudio?: StoredAudio;
  alertVolume: number;
}

export interface AppState {
  watches: WatchRecord[];
  alerts: AlertRecord[];
  settings: AppSettings;
}

export interface NewWatchDraft {
  label: string;
  pageUrl: string;
  pageTitle: string;
  selector: SelectorDescriptor;
  snapshot: ElementSnapshot;
}

export interface WatchStatusUpdate {
  watchId: string;
  status: WatchStatus;
  snapshot?: ElementSnapshot;
  error?: string;
}

export interface WatchTriggerPayload {
  watchId: string;
  before?: ElementSnapshot;
  after?: ElementSnapshot;
  summary: ChangeSummary;
  pageUrl: string;
  pageTitle: string;
}

export type MessageFromUi =
  | { type: "GET_STATE" }
  | { type: "BEGIN_SELECTION"; tabId: number }
  | { type: "OPEN_OPTIONS" }
  | { type: "OPEN_ALERT_WINDOW" }
  | { type: "UPDATE_WATCH"; watchId: string; patch: Partial<EditableWatchFields> }
  | { type: "DELETE_WATCH"; watchId: string }
  | { type: "ACK_ALERTS"; watchIds?: string[] }
  | { type: "SAVE_SETTINGS"; patch: Partial<AppSettings> };

export type MessageFromContent =
  | { type: "REGISTER_PAGE"; pageUrl: string; pageTitle: string }
  | { type: "SAVE_WATCH"; draft: NewWatchDraft }
  | { type: "WATCH_STATUS"; payload: WatchStatusUpdate }
  | { type: "WATCH_TRIGGERED"; payload: WatchTriggerPayload };

export type MessageToContent =
  | { type: "START_SELECTION" }
  | { type: "SYNC_WATCHES"; watches: WatchRecord[] }
  | { type: "ACK_WATCH"; watchId: string };

export type RuntimeMessage = MessageFromUi | MessageFromContent | MessageToContent;

export interface EditableWatchFields {
  label: string;
  enabled: boolean;
  pollIntervalMs: number;
  mutationDebounceMs: number;
  useMutationObserver: boolean;
  usePolling: boolean;
}
