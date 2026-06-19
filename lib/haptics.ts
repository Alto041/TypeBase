import * as Haptics from 'expo-haptics';

export function hapticTap(): void {
  void Haptics.selectionAsync().catch(() => {});
}
