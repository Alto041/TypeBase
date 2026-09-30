let clearHandler: (() => void) | undefined;

export function registerAutocorrectRuntimeCacheClear(handler: () => void): void {
  clearHandler = handler;
}

export function clearAutocorrectRuntimeCaches(): void {
  clearHandler?.();
}
