import type { RuntimeMessage } from "../types";

type QueryInfo = chrome.tabs.QueryInfo;

function hasBrowserNamespace(): boolean {
  return typeof browser !== "undefined";
}

function getBrowserNamespace(): typeof chrome {
  return browser as typeof chrome;
}

export function getRuntime() {
  return hasBrowserNamespace() ? getBrowserNamespace().runtime : chrome.runtime;
}

export function getTabsApi() {
  return hasBrowserNamespace() ? getBrowserNamespace().tabs : chrome.tabs;
}

export function getWindowsApi() {
  return hasBrowserNamespace() ? getBrowserNamespace().windows : chrome.windows;
}

export function getStorageApi() {
  return hasBrowserNamespace() ? getBrowserNamespace().storage.local : chrome.storage.local;
}

export function hasScriptingApi(): boolean {
  if (hasBrowserNamespace()) {
    return "scripting" in getBrowserNamespace();
  }

  return "scripting" in chrome;
}

export function onRuntimeMessage(
  listener: (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender
  ) => Promise<unknown> | unknown
) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    Promise.resolve(listener(message as RuntimeMessage, sender))
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("Erreur message runtime", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return true;
  });
}

export async function sendRuntimeMessage<T = unknown>(message: RuntimeMessage): Promise<T> {
  if (hasBrowserNamespace()) {
    return (await getBrowserNamespace().runtime.sendMessage(message)) as T;
  }

  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(response as T);
    });
  });
}

export async function sendTabMessage<T = unknown>(tabId: number, message: RuntimeMessage): Promise<T> {
  if (hasBrowserNamespace()) {
    return (await getBrowserNamespace().tabs.sendMessage(tabId, message)) as T;
  }

  return new Promise<T>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(response as T);
    });
  });
}

export async function queryTabs(queryInfo: QueryInfo): Promise<chrome.tabs.Tab[]> {
  if (hasBrowserNamespace()) {
    return (await getBrowserNamespace().tabs.query(queryInfo)) as chrome.tabs.Tab[];
  }

  return new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(tabs);
    });
  });
}

export async function createWindow(
  data: chrome.windows.CreateData
): Promise<chrome.windows.Window | undefined> {
  if (hasBrowserNamespace()) {
    return (await getBrowserNamespace().windows.create(data)) as chrome.windows.Window;
  }

  return new Promise<chrome.windows.Window | undefined>((resolve, reject) => {
    chrome.windows.create(data, (createdWindow) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(createdWindow);
    });
  });
}

export async function updateWindow(
  windowId: number,
  updateInfo: chrome.windows.UpdateInfo
): Promise<chrome.windows.Window | undefined> {
  if (hasBrowserNamespace()) {
    return (await getBrowserNamespace().windows.update(windowId, updateInfo)) as chrome.windows.Window;
  }

  return new Promise<chrome.windows.Window | undefined>((resolve, reject) => {
    chrome.windows.update(windowId, updateInfo, (updatedWindow) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(updatedWindow);
    });
  });
}

export async function getAllWindows(
  getInfo: chrome.windows.QueryOptions
): Promise<chrome.windows.Window[]> {
  if (hasBrowserNamespace()) {
    return (await getBrowserNamespace().windows.getAll(getInfo)) as chrome.windows.Window[];
  }

  return new Promise<chrome.windows.Window[]>((resolve, reject) => {
    chrome.windows.getAll(getInfo, (windows) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(windows);
    });
  });
}

export async function createTab(
  createProperties: chrome.tabs.CreateProperties
): Promise<chrome.tabs.Tab | undefined> {
  if (hasBrowserNamespace()) {
    return (await getBrowserNamespace().tabs.create(createProperties)) as chrome.tabs.Tab;
  }

  return new Promise<chrome.tabs.Tab | undefined>((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(tab);
    });
  });
}

export async function executeScriptFile(tabId: number, files: string[]): Promise<void> {
  if (!hasScriptingApi()) {
    throw new Error("L'injection dynamique n'est pas disponible dans ce navigateur.");
  }

  if (hasBrowserNamespace()) {
    await getBrowserNamespace().scripting.executeScript({
      target: { tabId },
      files
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve();
      }
    );
  });
}
