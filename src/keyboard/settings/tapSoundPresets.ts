/** Bundled key tap sounds (filename stored in layout settings). */
export const BUNDLED_TAP_SOUND_PRESETS = [
  {
    fileName: 'keytap_soft.wav',
    label: 'Soft',
    asset: require('../../../assets/sounds/keytap_soft.wav'),
  },
  {
    fileName: 'keytap_soft_low.wav',
    label: 'Soft low',
    asset: require('../../../assets/sounds/keytap_soft_low.wav'),
  },
  {
    fileName: 'keytap_soft_high.wav',
    label: 'Soft high',
    asset: require('../../../assets/sounds/keytap_soft_high.wav'),
  },
  {
    fileName: 'typebase_keytap_soft.wav',
    label: 'Classic',
    asset: require('../../../assets/sounds/Key/typebase_keytap_soft.wav'),
  },
] as const;

export type BundledTapSoundFileName =
  (typeof BUNDLED_TAP_SOUND_PRESETS)[number]['fileName'];

const BUNDLED_FILE_NAMES = new Set<string>(
  BUNDLED_TAP_SOUND_PRESETS.map(preset => preset.fileName),
);

export function isBundledTapSoundFile(
  fileName: string | null | undefined,
): fileName is BundledTapSoundFileName {
  if (!fileName) {
    return false;
  }
  return BUNDLED_FILE_NAMES.has(fileName);
}

export function labelForTapSoundFile(fileName: string | null | undefined): string {
  if (!fileName) {
    return '';
  }
  const preset = BUNDLED_TAP_SOUND_PRESETS.find(item => item.fileName === fileName);
  if (preset) {
    return preset.label;
  }
  if (fileName.startsWith('custom_tap.')) {
    return 'Imported';
  }
  return fileName;
}

export function bundledTapSoundAsset(fileName: BundledTapSoundFileName) {
  const preset = BUNDLED_TAP_SOUND_PRESETS.find(item => item.fileName === fileName);
  return preset?.asset;
}
