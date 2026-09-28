// Безопасная обёртка над localStorage: в приватном режиме, превью
// и при заблокированных данных доступ может бросать исключение.

const PREFIX = 'kingdom-clone:';

export function loadJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(PREFIX + key);
  } catch {
    /* хранилище недоступно — просто ничего не делаем */
  }
}
