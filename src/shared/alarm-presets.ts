import type { AlarmPresetId } from "../types";

export interface AlarmPresetOption {
  id: AlarmPresetId;
  name: string;
  description: string;
}

export const ALARM_PRESETS: readonly AlarmPresetOption[] = [
  {
    id: "classic",
    name: "Classique",
    description: "Le son intégré, simple et direct."
  },
  {
    id: "beep",
    name: "Bip-bip panique",
    description: "Deux bips courts, pratique quand il faut réagir vite."
  },
  {
    id: "arcade",
    name: "Arcade 8-bit",
    description: "Une petite montée rétro, plus marrante que le bip standard."
  },
  {
    id: "klaxon",
    name: "Klaxon de poche",
    description: "Un avertissement bas et un peu absurde, sans être interminable."
  },
  {
    id: "tada",
    name: "Tada ridicule",
    description: "Une mini fanfare pour les changements qui méritent du théâtre."
  }
];

const PRESET_IDS = new Set<AlarmPresetId>(ALARM_PRESETS.map((preset) => preset.id));

export function isAlarmPresetId(value: unknown): value is AlarmPresetId {
  return typeof value === "string" && PRESET_IDS.has(value as AlarmPresetId);
}

export function normalizeAlarmPresetId(value: unknown): AlarmPresetId {
  return isAlarmPresetId(value) ? value : "classic";
}

export function getAlarmPreset(id: unknown): AlarmPresetOption {
  const normalizedId = normalizeAlarmPresetId(id);
  return ALARM_PRESETS.find((preset) => preset.id === normalizedId) ?? ALARM_PRESETS[0];
}
