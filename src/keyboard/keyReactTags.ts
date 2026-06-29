const reactTagsByKeyId = new Map<string, number>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach(listener => listener());
}

export function registerKeyReactTag(keyId: string, reactTag: number): void {
  if (reactTagsByKeyId.get(keyId) === reactTag) {
    return;
  }
  reactTagsByKeyId.set(keyId, reactTag);
  notifyListeners();
}

export function unregisterKeyReactTag(keyId: string): void {
  if (!reactTagsByKeyId.delete(keyId)) {
    return;
  }
  notifyListeners();
}

export function getKeyReactTag(keyId: string): number | undefined {
  return reactTagsByKeyId.get(keyId);
}

export function subscribeKeyReactTags(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
