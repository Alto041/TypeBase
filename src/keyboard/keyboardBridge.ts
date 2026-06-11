import {NativeModules, Platform} from 'react-native';
import type {ClipboardContent} from './clipboard/types';

type KeyboardModuleType = {
  insertText: (text: string) => void;
  deleteBackward: () => void;
  getTextBeforeCursor: (length: number) => Promise<string>;
  getLearnedWordCounts: () => Promise<Record<string, number>>;
  getEssentials: () => Promise<string>;
  setEssentials: (json: string) => Promise<boolean>;
  getPrefersNumpad: () => Promise<boolean>;
  getClipboardText: () => Promise<string>;
  getClipboardContent: () => Promise<ClipboardContent>;
  insertClipboardImage: (imagePath: string) => Promise<boolean>;
  deleteClipboardImageFile: (imagePath: string) => Promise<boolean>;
  getClipboardHistory: () => Promise<string>;
  setClipboardHistory: (json: string) => Promise<boolean>;
  recordLearnedWord: (word: string) => Promise<number>;
  replaceWordPrefix: (prefixLength: number, word: string) => void;
  insertNewline: () => void;
  dismissKeyboard: () => void;
  openInputMethodSettings: () => void;
  performKeyHaptic: () => void;
  setKeyboardHeight: (heightDp: number) => void;
  getGestureSettings: () => Promise<string>;
  setGestureSettings: (json: string) => Promise<boolean>;
  getAutocorrectSettings: () => Promise<string>;
  setAutocorrectSettings: (json: string) => Promise<boolean>;
  getApiKeys: () => Promise<string>;
  setApiKeys: (json: string) => Promise<boolean>;
  getLearnedPhraseCounts: () => Promise<Record<string, number>>;
  recordLearnedPhrase: (phrase: string) => Promise<number>;
  moveCursor: (offset: number) => Promise<boolean>;
  deleteWordBackward: () => Promise<boolean>;
  deleteSentenceBackward: () => Promise<boolean>;
  getLaunchableApps: () => Promise<Array<{packageName: string; label: string}>>;
  launchApp: (packageName: string) => Promise<boolean>;
  getCommaLauncherArmed: () => Promise<boolean>;
  setCommaLauncherArmed: (armed: boolean) => Promise<boolean>;
};

const {KeyboardModule} = NativeModules;

export const keyboardBridge: KeyboardModuleType = {
  insertText: (text: string) => {
    if (Platform.OS === 'android' && KeyboardModule?.insertText) {
      KeyboardModule.insertText(text);
    }
  },
  deleteBackward: () => {
    if (Platform.OS === 'android' && KeyboardModule?.deleteBackward) {
      KeyboardModule.deleteBackward();
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
  setKeyboardHeight: (heightDp: number) => {
    if (Platform.OS === 'android' && KeyboardModule?.setKeyboardHeight) {
      KeyboardModule.setKeyboardHeight(heightDp);
    }
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
    return Promise.resolve('{"enabled":true,"autoApplyOnSpace":false}');
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
  moveCursor: (offset: number) => {
    if (Platform.OS === 'android' && KeyboardModule?.moveCursor) {
      return KeyboardModule.moveCursor(offset) as Promise<boolean>;
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
};
