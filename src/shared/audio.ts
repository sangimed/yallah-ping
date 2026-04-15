import type { AppSettings } from "../types";

export function getAlarmSource(settings: AppSettings): string {
  if (settings.audioMode === "custom" && settings.customAudio?.dataUrl) {
    return settings.customAudio.dataUrl;
  }

  return chrome.runtime.getURL("assets/default-alarm.wav");
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
      console.warn("Lecture auto bloquee, nouvelle tentative sur interaction utilisateur.", error);
      const resume = async () => {
        try {
          await this.audio?.play();
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
        } catch (playError) {
          console.warn("Nouvelle tentative de lecture echouee", playError);
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
