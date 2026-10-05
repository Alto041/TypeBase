/** Bundled key tap sounds (filename stored in layout settings). */
export const BUNDLED_TAP_SOUND_PRESETS = [
  {
    fileName: 'electronic_1_blip.wav',
    label: 'Blip',
    asset: require('../../../assets/sounds/new/electronic_1_blip.wav'),
  },
  {
    fileName: 'electronic_2_glass.wav',
    label: 'Glass',
    asset: require('../../../assets/sounds/new/electronic_2_glass.wav'),
  },
  {
    fileName: 'electronic_3_pulse.wav',
    label: 'Pulse',
    asset: require('../../../assets/sounds/new/electronic_3_pulse.wav'),
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

/** Previous soft/low/high presets → new electronic pack. */
const LEGACY_TAP_SOUND_ALIASES: Record<string, BundledTapSoundFileName> = {
  'keytap_soft.wav': 'electronic_1_blip.wav',
  'keytap_soft_low.wav': 'electronic_2_glass.wav',
  'keytap_soft_high.wav': 'electronic_3_pulse.wav',
};

export function normalizeBundledTapSoundFile(
  fileName: string | null | undefined,
): string | null {
  if (!fileName?.trim()) {
    return null;
  }
  const trimmed = fileName.trim();
  return LEGACY_TAP_SOUND_ALIASES[trimmed] ?? trimmed;
}

export function isBundledTapSoundFile(
  fileName: string | null | undefined,
): fileName is BundledTapSoundFileName {
  if (!fileName) {
    return false;
  }
  const normalized = normalizeBundledTapSoundFile(fileName);
  return normalized != null && BUNDLED_FILE_NAMES.has(normalized);
}

export function labelForTapSoundFile(fileName: string | null | undefined): string {
  if (!fileName) {
    return '';
  }
  const normalized = normalizeBundledTapSoundFile(fileName) ?? fileName;
  const preset = BUNDLED_TAP_SOUND_PRESETS.find(item => item.fileName === normalized);
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
