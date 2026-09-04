import {
  ensureAutocorrectLoaded,
  getAutocorrectSettings,
  setAutoApplyOnSpace,
} from '../keyboard/autocorrect/autocorrectStore';
import {setGestureSetting} from '../keyboard/gestures/gesturesStore';
import {DEFAULT_GESTURE_SETTINGS} from '../keyboard/gestures/types';
import {keyboardBridge} from '../keyboard/keyboardBridge';
import {updateKeyboardLayoutSetting} from '../keyboard/settings/layoutStore';
import {setKeyboardDesign} from '../keyboard/settings/themeStore';
import {readPremiumFromNative} from './entitlements';

export async function applyFreeTierDefaults(): Promise<void> {
  const isPremium = await readPremiumFromNative();
  if (isPremium) {
    return;
  }

  await ensureAutocorrectLoaded();
  const settings = getAutocorrectSettings();
  if (
    settings.autoApplyOnSpace ||
    settings.contextCorrectionEnabled ||
    settings.aiAutoCorrectEnabled
  ) {
    await setAutoApplyOnSpace(false);
    await keyboardBridge.setAutocorrectSettings(
      JSON.stringify({
        ...settings,
        enabled: true,
        autoApplyOnSpace: false,
        contextCorrectionEnabled: false,
        aiAutoCorrectEnabled: false,
      }),
    );
  }

  const design = await keyboardBridge.getKeyboardDesign();
  if (design !== 'typebase') {
    await setKeyboardDesign('typebase');
  }

  const layoutRaw = await keyboardBridge.getKeyboardLayoutSettings();
  try {
    const layout = JSON.parse(layoutRaw) as {
      numberRowEnabled?: boolean;
      letterSymbolAlternatesEnabled?: boolean;
      customFontEnabled?: boolean;
    };
    if (layout.numberRowEnabled) {
      await updateKeyboardLayoutSetting('numberRowEnabled', false);
    }
    if (layout.letterSymbolAlternatesEnabled) {
      await updateKeyboardLayoutSetting('letterSymbolAlternatesEnabled', false);
    }
    if (layout.customFontEnabled) {
      await updateKeyboardLayoutSetting('customFontEnabled', false);
    }
  } catch {
    // ignore malformed layout payload
  }

  const gesturesRaw = await keyboardBridge.getGestureSettings();
  try {
    const gestures = JSON.parse(gesturesRaw) as Record<string, boolean>;
    const keys = Object.keys(DEFAULT_GESTURE_SETTINGS) as Array<
      keyof typeof DEFAULT_GESTURE_SETTINGS
    >;
    for (const key of keys) {
      if (gestures[key]) {
        await setGestureSetting(key, false);
      }
    }
  } catch {
    // ignore malformed gesture payload
  }
}

export async function clampAutocorrectForTier(): Promise<void> {
  const isPremium = await readPremiumFromNative();
  if (isPremium) {
    return;
  }
  await ensureAutocorrectLoaded();
  const settings = getAutocorrectSettings();
  if (
    settings.autoApplyOnSpace ||
    settings.contextCorrectionEnabled ||
    settings.aiAutoCorrectEnabled
  ) {
    await keyboardBridge.setAutocorrectSettings(
      JSON.stringify({
        ...settings,
        autoApplyOnSpace: false,
        contextCorrectionEnabled: false,
        aiAutoCorrectEnabled: false,
      }),
    );
  }
}
