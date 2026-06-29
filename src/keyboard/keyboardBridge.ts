import {NativeModules, Platform} from 'react-native';
import type {ClipboardContent, ImportedScreenshot} from './clipboard/types';

type KeyboardModuleType = {
  insertText: (text: string) => void;
  insertKeyText: (text: string) => void;
  deleteBackward: () => void;
  startBackspaceRepeat: (holdDelayMs: number, intervalMs: number) => void;
  stopBackspaceRepeat: () => void;
  getTextBeforeCursor: (length: number) => Promise<string>;
  getLearnedWordCounts: () => Promise<Record<string, number>>;
  clearLearnedWords: () => Promise<boolean>;
  clearLearnedAutocorrectData: () => Promise<boolean>;
  preloadSwipeWordDictionary: () => Promise<boolean>;
  getSwipeCandidates: (
    pattern: string,
    maxCandidates: number,
  ) => Promise<Array<{word: string; rank: number}>>;
  isKnownSwipeWord: (word: string) => Promise<boolean>;
  decodeSwipeGesture: (
    pointsJson: string,
    layoutsJson: string,
    isUppercase: boolean,
  ) => Promise<string>;
  getEssentials: () => Promise<string>;
  setEssentials: (json: string) => Promise<boolean>;
  getPrefersNumpad: () => Promise<boolean>;
  getInputSupportsNewline: () => Promise<boolean>;
  getInputInitialCapsMode: () => Promise<boolean>;
  getClipboardText: () => Promise<string>;
  getClipboardContent: () => Promise<ClipboardContent>;
  hasMediaImagesPermission: () => Promise<boolean>;
  openAppForMediaImagesPermission: () => Promise<boolean>;
  importRecentScreenshots: (
    sinceMs: number,
    maxCount: number,
  ) => Promise<ImportedScreenshot[]>;
  insertClipboardImage: (imagePath: string) => Promise<boolean>;
  deleteClipboardImageFile: (imagePath: string) => Promise<boolean>;
  getClipboardHistory: () => Promise<string>;
  setClipboardHistory: (json: string) => Promise<boolean>;
  getRecentEmojis: () => Promise<string>;
  setRecentEmojis: (json: string) => Promise<boolean>;
  recordLearnedWord: (word: string) => Promise<number>;
  replaceWordPrefix: (prefixLength: number, word: string) => void;
  insertNewline: () => void;
  submitEnterKey: () => void;
  dismissKeyboard: () => void;
  openInputMethodSettings: () => void;
  performKeyHaptic: () => void;
  syncCustomTapSound: () => void;
  playCustomTapSound: () => void;
  setKeyboardHeight: (heightDp: number) => void;
  setFloatingKeyboard: (enabled: boolean) => void;
  setTouchpadGestureConsuming: (active: boolean) => void;
  setNativeKeyFastPathConfig: (json: string) => void;
  consumeNativeFastPathPointer: (pointerId: number) => boolean;
  getGestureSettings: () => Promise<string>;
  setGestureSettings: (json: string) => Promise<boolean>;
  getAutocorrectSettings: () => Promise<string>;
  setAutocorrectSettings: (json: string) => Promise<boolean>;
  getApiKeys: () => Promise<string>;
  setApiKeys: (json: string) => Promise<boolean>;
  getAiProvider: () => Promise<string>;
  setAiProvider: (provider: string) => Promise<boolean>;
  getVoiceSttProvider: () => Promise<string>;
  setVoiceSttProvider: (provider: string) => Promise<boolean>;
  getLearnedPhraseCounts: () => Promise<Record<string, number>>;
  recordLearnedPhrase: (phrase: string) => Promise<number>;
  clearLearnedPhrases: () => Promise<boolean>;
  moveCursor: (offset: number) => Promise<boolean>;
  moveCursorDirection: (
    direction: 'left' | 'right' | 'up' | 'down',
    extendSelection: boolean,
  ) => Promise<boolean>;
  copySelection: () => Promise<boolean>;
  cutSelection: () => Promise<boolean>;
  deleteWordBackward: () => Promise<boolean>;
  deleteSentenceBackward: () => Promise<boolean>;
  getLaunchableApps: () => Promise<Array<{packageName: string; label: string}>>;
  launchApp: (packageName: string) => Promise<boolean>;
  getCommaLauncherArmed: () => Promise<boolean>;
  setCommaLauncherArmed: (armed: boolean) => Promise<boolean>;
  getPeriodRewriteArmed: () => Promise<boolean>;
  setPeriodRewriteArmed: (armed: boolean) => Promise<boolean>;
  getKeyboardColorScheme: () => Promise<string>;
  setKeyboardColorScheme: (scheme: string) => Promise<boolean>;
  getKeyboardDesign: () => Promise<string>;
  setKeyboardDesign: (design: string) => Promise<boolean>;
  getKeyboardCustomTheme: () => Promise<string>;
  setKeyboardCustomTheme: (json: string) => Promise<boolean>;
  getKeyboardLayoutSettings: () => Promise<string>;
  setKeyboardLayoutSettings: (json: string) => Promise<boolean>;
  getCustomLetterLayouts: () => Promise<string>;
  setCustomLetterLayouts: (json: string) => Promise<boolean>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
};

const {KeyboardModule} = NativeModules;

export const keyboardBridge: KeyboardModuleType = {
  insertText: (text: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.insertText) {
      KeyboardModule.insertText(text);
    }
  },
  insertKeyText: (text: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.insertKeyText) {
      KeyboardModule.insertKeyText(text);
      return;
    }
    if (Platform.OS === 'android' && KeyboardModule?.insertText) {
      KeyboardModule.insertText(text);
      KeyboardModule.performKeyHaptic?.();
    }
  },
  deleteBackward: () => {
    if (Platform.OS === 'android' && KeyboardModule?.deleteBackward) {
      KeyboardModule.deleteBackward();
    }
  },
  startBackspaceRepeat: (holdDelayMs: number, intervalMs: number) => {
    if (Platform.OS === 'android' && KeyboardModule?.startBackspaceRepeat) {
      KeyboardModule.startBackspaceRepeat(holdDelayMs, intervalMs);
    }
  },
  stopBackspaceRepeat: () => {
    if (Platform.OS === 'android' && KeyboardModule?.stopBackspaceRepeat) {
      KeyboardModule.stopBackspaceRepeat();
    }
  },
  getTextBeforeCursor: (length: number) => {
    if (Platform.OS === 'android' && KeyboardModule?.getTextBeforeCursor) {
      return KeyboardModule.getTextBeforeCursor(length);
    }
    return Promise.resolve('');
  },
  getLearnedWordCounts: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getLearnedWordCounts) {
      return KeyboardModule.getLearnedWordCounts() as Promise<Record<string, number>>;
    }
    return Promise.resolve({});
  },
  clearLearnedWords: () => {
    if (Platform.OS === 'android' && KeyboardModule?.clearLearnedWords) {
      return KeyboardModule.clearLearnedWords() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  clearLearnedAutocorrectData: () => {
    if (Platform.OS === 'android' && KeyboardModule?.clearLearnedAutocorrectData) {
      return KeyboardModule.clearLearnedAutocorrectData() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  preloadSwipeWordDictionary: () => {
    if (Platform.OS === 'android' && KeyboardModule?.preloadSwipeWordDictionary) {
      return KeyboardModule.preloadSwipeWordDictionary() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getSwipeCandidates: (pattern: string, maxCandidates: number) => {
    if (Platform.OS === 'android' && KeyboardModule?.getSwipeCandidates) {
      return KeyboardModule.getSwipeCandidates(pattern, maxCandidates).then(
        (raw: unknown) => {
          if (!Array.isArray(raw)) {
            return [];
          }
          return raw.filter(
            (item): item is {word: string; rank: number} =>
              typeof item === 'object' &&
              item != null &&
              typeof (item as {word?: unknown}).word === 'string' &&
              (item as {word: string}).word.length > 0 &&
              typeof (item as {rank?: unknown}).rank === 'number',
          );
        },
      );
    }
    return Promise.resolve([]);
  },
  isKnownSwipeWord: (word: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.isKnownSwipeWord) {
      return KeyboardModule.isKnownSwipeWord(word) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  decodeSwipeGesture: (pointsJson: string, layoutsJson: string, isUppercase: boolean) => {
    if (Platform.OS === 'android' && KeyboardModule?.decodeSwipeGesture) {
      return KeyboardModule.decodeSwipeGesture(
        pointsJson,
        layoutsJson,
        isUppercase,
      ) as Promise<string>;
    }
    return Promise.resolve('');
  },
  getEssentials: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getEssentials) {
      return KeyboardModule.getEssentials() as Promise<string>;
    }
    return Promise.resolve('[]');
  },
  setEssentials: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setEssentials) {
      return KeyboardModule.setEssentials(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getPrefersNumpad: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getPrefersNumpad) {
      return KeyboardModule.getPrefersNumpad() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getInputSupportsNewline: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getInputSupportsNewline) {
      return KeyboardModule.getInputSupportsNewline() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getInputInitialCapsMode: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getInputInitialCapsMode) {
      return KeyboardModule.getInputInitialCapsMode() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getClipboardText: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getClipboardText) {
      return KeyboardModule.getClipboardText() as Promise<string>;
    }
    return Promise.resolve('');
  },
  getClipboardContent: async () => {
    if (Platform.OS === 'android' && KeyboardModule?.getClipboardContent) {
      const raw = (await KeyboardModule.getClipboardContent()) as string;
      try {
        return JSON.parse(raw) as ClipboardContent;
      } catch {
        return {kind: 'none'};
      }
    }
    if (Platform.OS === 'android' && KeyboardModule?.getClipboardText) {
      const text = ((await KeyboardModule.getClipboardText()) as string).trim();
      return text ? {kind: 'text', text} : {kind: 'none'};
    }
    return {kind: 'none'};
  },
  importRecentScreenshots: async (sinceMs: number, maxCount: number) => {
    if (Platform.OS === 'android' && KeyboardModule?.importRecentScreenshots) {
      const raw = (await KeyboardModule.importRecentScreenshots(
        sinceMs,
        maxCount,
      )) as string;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed.filter(
          (item): item is ImportedScreenshot =>
            Boolean(
              item &&
                typeof item === 'object' &&
                (item as ImportedScreenshot).kind === 'image' &&
                typeof (item as ImportedScreenshot).imagePath === 'string' &&
                typeof (item as ImportedScreenshot).imageHash === 'string',
            ),
        );
      } catch {
        return [];
      }
    }
    return [];
  },
  hasMediaImagesPermission: () => {
    if (Platform.OS === 'android' && KeyboardModule?.hasMediaImagesPermission) {
      return KeyboardModule.hasMediaImagesPermission() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  openAppForMediaImagesPermission: () => {
    if (Platform.OS === 'android' && KeyboardModule?.openAppForMediaImagesPermission) {
      return KeyboardModule.openAppForMediaImagesPermission() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  insertClipboardImage: (imagePath: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.insertClipboardImage) {
      return KeyboardModule.insertClipboardImage(imagePath) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  deleteClipboardImageFile: (imagePath: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.deleteClipboardImageFile) {
      return KeyboardModule.deleteClipboardImageFile(imagePath) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getClipboardHistory: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getClipboardHistory) {
      return KeyboardModule.getClipboardHistory() as Promise<string>;
    }
    return Promise.resolve('[]');
  },
  setClipboardHistory: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setClipboardHistory) {
      return KeyboardModule.setClipboardHistory(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getRecentEmojis: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getRecentEmojis) {
      return KeyboardModule.getRecentEmojis() as Promise<string>;
    }
    return Promise.resolve('[]');
  },
  setRecentEmojis: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setRecentEmojis) {
      return KeyboardModule.setRecentEmojis(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  recordLearnedWord: (word: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.recordLearnedWord) {
      return KeyboardModule.recordLearnedWord(word) as Promise<number>;
    }
    return Promise.resolve(0);
  },
  replaceWordPrefix: (prefixLength: number, word: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.replaceWordPrefix) {
      KeyboardModule.replaceWordPrefix(prefixLength, word);
    }
  },
  insertNewline: () => {
    if (Platform.OS === 'android' && KeyboardModule?.insertNewline) {
      KeyboardModule.insertNewline();
    }
  },
  submitEnterKey: () => {
    if (Platform.OS === 'android' && KeyboardModule?.submitEnterKey) {
      KeyboardModule.submitEnterKey();
    }
  },
  dismissKeyboard: () => {
    if (Platform.OS === 'android' && KeyboardModule?.dismissKeyboard) {
      KeyboardModule.dismissKeyboard();
    }
  },
  openInputMethodSettings: () => {
    if (Platform.OS === 'android' && KeyboardModule?.openInputMethodSettings) {
      KeyboardModule.openInputMethodSettings();
    }
  },
  performKeyHaptic: () => {
    if (Platform.OS === 'android' && KeyboardModule?.performKeyHaptic) {
      KeyboardModule.performKeyHaptic();
    }
  },
  syncCustomTapSound: () => {
    if (Platform.OS === 'android' && KeyboardModule?.syncCustomTapSound) {
      KeyboardModule.syncCustomTapSound();
    }
  },
  playCustomTapSound: () => {
    if (Platform.OS === 'android' && KeyboardModule?.playCustomTapSound) {
      KeyboardModule.playCustomTapSound();
    }
  },
  setKeyboardHeight: (heightDp: number) => {
    if (Platform.OS === 'android' && KeyboardModule?.setKeyboardHeight) {
      KeyboardModule.setKeyboardHeight(heightDp);
    }
  },
  setFloatingKeyboard: (enabled: boolean) => {
    if (Platform.OS === 'android' && KeyboardModule?.setFloatingKeyboard) {
      KeyboardModule.setFloatingKeyboard(enabled);
    }
  },
  setTouchpadGestureConsuming: (active: boolean) => {
    if (Platform.OS === 'android' && KeyboardModule?.setTouchpadGestureConsuming) {
      KeyboardModule.setTouchpadGestureConsuming(active);
    }
  },
  setNativeKeyFastPathConfig: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setNativeKeyFastPathConfig) {
      KeyboardModule.setNativeKeyFastPathConfig(json);
    }
  },
  consumeNativeFastPathPointer: (pointerId: number): boolean => {
    if (Platform.OS === 'android' && KeyboardModule?.consumeNativeFastPathPointer) {
      return KeyboardModule.consumeNativeFastPathPointer(pointerId);
    }
    return false;
  },
  getGestureSettings: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getGestureSettings) {
      return KeyboardModule.getGestureSettings() as Promise<string>;
    }
    return Promise.resolve('{}');
  },
  setGestureSettings: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setGestureSettings) {
      return KeyboardModule.setGestureSettings(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getAutocorrectSettings: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getAutocorrectSettings) {
      return KeyboardModule.getAutocorrectSettings() as Promise<string>;
    }
    return Promise.resolve(
      '{"enabled":true,"autoApplyOnSpace":false,"aiAutoCorrectEnabled":false}',
    );
  },
  setAutocorrectSettings: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setAutocorrectSettings) {
      return KeyboardModule.setAutocorrectSettings(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getApiKeys: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getApiKeys) {
      return KeyboardModule.getApiKeys() as Promise<string>;
    }
    return Promise.resolve('{"geminiApiKey":"","speechmaticsApiKey":""}');
  },
  setApiKeys: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setApiKeys) {
      return KeyboardModule.setApiKeys(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getAiProvider: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getAiProvider) {
      return KeyboardModule.getAiProvider() as Promise<string>;
    }
    return Promise.resolve('gemini');
  },
  setAiProvider: (provider: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setAiProvider) {
      return KeyboardModule.setAiProvider(provider) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getVoiceSttProvider: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getVoiceSttProvider) {
      return KeyboardModule.getVoiceSttProvider() as Promise<string>;
    }
    return Promise.resolve('speechmatics');
  },
  setVoiceSttProvider: (provider: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setVoiceSttProvider) {
      return KeyboardModule.setVoiceSttProvider(provider) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getLearnedPhraseCounts: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getLearnedPhraseCounts) {
      return KeyboardModule.getLearnedPhraseCounts() as Promise<Record<string, number>>;
    }
    return Promise.resolve({});
  },
  recordLearnedPhrase: (phrase: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.recordLearnedPhrase) {
      return KeyboardModule.recordLearnedPhrase(phrase) as Promise<number>;
    }
    return Promise.resolve(0);
  },
  clearLearnedPhrases: () => {
    if (Platform.OS === 'android' && KeyboardModule?.clearLearnedPhrases) {
      return KeyboardModule.clearLearnedPhrases() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  moveCursor: (offset: number) => {
    if (Platform.OS === 'android' && KeyboardModule?.moveCursor) {
      return KeyboardModule.moveCursor(offset) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  moveCursorDirection: (direction, extendSelection) => {
    if (Platform.OS === 'android' && KeyboardModule?.moveCursorDirection) {
      return KeyboardModule.moveCursorDirection(
        direction,
        extendSelection,
      ) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  copySelection: () => {
    if (Platform.OS === 'android' && KeyboardModule?.copySelection) {
      return KeyboardModule.copySelection() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  cutSelection: () => {
    if (Platform.OS === 'android' && KeyboardModule?.cutSelection) {
      return KeyboardModule.cutSelection() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  deleteWordBackward: () => {
    if (Platform.OS === 'android' && KeyboardModule?.deleteWordBackward) {
      return KeyboardModule.deleteWordBackward() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  deleteSentenceBackward: () => {
    if (Platform.OS === 'android' && KeyboardModule?.deleteSentenceBackward) {
      return KeyboardModule.deleteSentenceBackward() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getLaunchableApps: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getLaunchableApps) {
      return KeyboardModule.getLaunchableApps() as Promise<
        Array<{packageName: string; label: string}>
      >;
    }
    return Promise.resolve([]);
  },
  launchApp: (packageName: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.launchApp) {
      return KeyboardModule.launchApp(packageName) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getCommaLauncherArmed: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getCommaLauncherArmed) {
      return KeyboardModule.getCommaLauncherArmed() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  setCommaLauncherArmed: (armed: boolean) => {
    if (Platform.OS === 'android' && KeyboardModule?.setCommaLauncherArmed) {
      return KeyboardModule.setCommaLauncherArmed(armed) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getPeriodRewriteArmed: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getPeriodRewriteArmed) {
      return KeyboardModule.getPeriodRewriteArmed() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  setPeriodRewriteArmed: (armed: boolean) => {
    if (Platform.OS === 'android' && KeyboardModule?.setPeriodRewriteArmed) {
      return KeyboardModule.setPeriodRewriteArmed(armed) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getKeyboardColorScheme: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getKeyboardColorScheme) {
      return KeyboardModule.getKeyboardColorScheme() as Promise<string>;
    }
    return Promise.resolve('light');
  },
  setKeyboardColorScheme: (scheme: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setKeyboardColorScheme) {
      return KeyboardModule.setKeyboardColorScheme(scheme) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getKeyboardDesign: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getKeyboardDesign) {
      return KeyboardModule.getKeyboardDesign() as Promise<string>;
    }
    return Promise.resolve('typebase');
  },
  setKeyboardDesign: (design: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setKeyboardDesign) {
      return KeyboardModule.setKeyboardDesign(design) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getKeyboardCustomTheme: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getKeyboardCustomTheme) {
      return KeyboardModule.getKeyboardCustomTheme() as Promise<string>;
    }
    return Promise.resolve('{}');
  },
  setKeyboardCustomTheme: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setKeyboardCustomTheme) {
      return KeyboardModule.setKeyboardCustomTheme(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getKeyboardLayoutSettings: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getKeyboardLayoutSettings) {
      return KeyboardModule.getKeyboardLayoutSettings() as Promise<string>;
    }
    return Promise.resolve(
      '{"keyHeight":47,"keyGap":5,"keyRowMargin":12,"keyRadius":6,"enterKeyPreviewEnabled":true,"developerEyeEnabled":false,"letterSymbolAlternatesEnabled":false,"letterLayoutId":"en-us","keyHapticEnabled":true,"floatingKeyboardEnabled":false}',
    );
  },
  setKeyboardLayoutSettings: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setKeyboardLayoutSettings) {
      return KeyboardModule.setKeyboardLayoutSettings(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  getCustomLetterLayouts: () => {
    if (Platform.OS === 'android' && KeyboardModule?.getCustomLetterLayouts) {
      return KeyboardModule.getCustomLetterLayouts() as Promise<string>;
    }
    return Promise.resolve('[]');
  },
  setCustomLetterLayouts: (json: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.setCustomLetterLayouts) {
      return KeyboardModule.setCustomLetterLayouts(json) as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  undo: () => {
    if (Platform.OS === 'android' && KeyboardModule?.undo) {
      return KeyboardModule.undo() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
  redo: () => {
    if (Platform.OS === 'android' && KeyboardModule?.redo) {
      return KeyboardModule.redo() as Promise<boolean>;
    }
    return Promise.resolve(false);
  },
};
