import type { AlarmPresetId, AppSettings } from "../types";
import { getAlarmPreset, normalizeAlarmPresetId } from "./alarm-presets";

type WaveShape = "sine" | "square" | "triangle";

interface ToneStep {
  durationMs: number;
  frequencies?: number[];
  volume?: number;
  shape?: WaveShape;
}

const SAMPLE_RATE = 22050;
const presetSourceCache = new Map<AlarmPresetId, string>();

export function getAlarmSource(settings: AppSettings): string {
  if (settings.audioMode === "custom" && settings.customAudio?.dataUrl) {
    return settings.customAudio.dataUrl;
  }

  const presetId = normalizeAlarmPresetId(settings.audioPresetId);
  if (presetId !== "classic") {
    return getGeneratedPresetSource(presetId);
  }

  return chrome.runtime.getURL("assets/default-alarm.wav");
}

export function getAlarmDisplayName(settings: AppSettings): string {
  if (settings.audioMode === "custom" && settings.customAudio?.name) {
    return settings.customAudio.name;
  }

  return getAlarmPreset(settings.audioPresetId).name;
}

function getGeneratedPresetSource(presetId: AlarmPresetId): string {
  const cachedSource = presetSourceCache.get(presetId);
  if (cachedSource) {
    return cachedSource;
  }

  const source = createWavDataUrl(getPresetSteps(presetId));
  presetSourceCache.set(presetId, source);
  return source;
}

function getPresetSteps(presetId: AlarmPresetId): ToneStep[] {
  switch (presetId) {
    case "beep":
      return [
        { durationMs: 170, frequencies: [880], volume: 0.9 },
        { durationMs: 75 },
        { durationMs: 170, frequencies: [880], volume: 0.9 },
        { durationMs: 520 }
      ];
    case "arcade":
      return [
        { durationMs: 110, frequencies: [523], volume: 0.72, shape: "square" },
        { durationMs: 110, frequencies: [659], volume: 0.72, shape: "square" },
        { durationMs: 110, frequencies: [784], volume: 0.72, shape: "square" },
        { durationMs: 150, frequencies: [1046], volume: 0.65, shape: "square" },
        { durationMs: 520 }
      ];
    case "klaxon":
      return [
        { durationMs: 260, frequencies: [330], volume: 0.82, shape: "triangle" },
        { durationMs: 90 },
        { durationMs: 260, frequencies: [247], volume: 0.82, shape: "triangle" },
        { durationMs: 520 }
      ];
    case "tada":
      return [
        { durationMs: 140, frequencies: [523, 659, 784], volume: 0.62 },
        { durationMs: 120, frequencies: [659, 784, 988], volume: 0.62 },
        { durationMs: 270, frequencies: [784, 988, 1175], volume: 0.58 },
        { durationMs: 560 }
      ];
    default:
      return [{ durationMs: 1000 }];
  }
}

function createWavDataUrl(steps: ToneStep[]): string {
  const samples = createSamples(steps);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, samples[index], true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}

function createSamples(steps: ToneStep[]): Int16Array {
  const rawSamples: number[] = [];

  for (const step of steps) {
    const stepSamples = Math.max(1, Math.round((step.durationMs / 1000) * SAMPLE_RATE));
    const durationSeconds = stepSamples / SAMPLE_RATE;
    const frequencies = step.frequencies ?? [];
    const shape = step.shape ?? "sine";
    const volume = step.volume ?? 0.7;

    for (let sampleIndex = 0; sampleIndex < stepSamples; sampleIndex += 1) {
      if (!frequencies.length) {
        rawSamples.push(0);
        continue;
      }

      const time = sampleIndex / SAMPLE_RATE;
      const wave = frequencies.reduce((sum, frequency) => sum + oscillator(time, frequency, shape), 0);
      const envelope = getEnvelope(time, durationSeconds);
      rawSamples.push((wave / frequencies.length) * volume * envelope);
    }
  }

  return Int16Array.from(rawSamples, (sample) => Math.round(clamp(sample, -1, 1) * 32767));
}

function oscillator(time: number, frequency: number, shape: WaveShape): number {
  const sine = Math.sin(2 * Math.PI * frequency * time);

  switch (shape) {
    case "square":
      return sine >= 0 ? 1 : -1;
    case "triangle":
      return (2 / Math.PI) * Math.asin(sine);
    default:
      return sine;
  }
}

function getEnvelope(time: number, durationSeconds: number): number {
  const attackSeconds = Math.min(0.018, durationSeconds / 4);
  const releaseSeconds = Math.min(0.045, durationSeconds / 3);
  const attack = attackSeconds ? time / attackSeconds : 1;
  const release = releaseSeconds ? (durationSeconds - time) / releaseSeconds : 1;
  return clamp(Math.min(1, attack, release), 0, 1);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class AlarmPlayer {
  private audio?: HTMLAudioElement;

  async start(settings: AppSettings): Promise<void> {
    await this.stop();

    const source = getAlarmSource(settings);
    this.audio = new Audio(source);
    this.audio.loop = true;
    this.audio.volume = settings.alertVolume;
    this.audio.preload = "auto";

    try {
      await this.audio.play();
    } catch (error) {
      console.warn("Lecture auto bloquée, nouvelle tentative sur interaction utilisateur.", error);
      const resume = async () => {
        try {
          await this.audio?.play();
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
        } catch (playError) {
          console.warn("Nouvelle tentative de lecture échouée", playError);
        }
      };

      window.addEventListener("pointerdown", resume);
      window.addEventListener("keydown", resume);
    }
  }

  async stop(): Promise<void> {
    if (!this.audio) {
      return;
    }

    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio = undefined;
  }
}
