import React, {useMemo} from 'react';

import {SettingsSegmentBar} from '../../app/SettingsSegmentBar';
import {
  BUNDLED_TAP_SOUND_PRESETS,
  type BundledTapSoundFileName,
} from './tapSoundPresets';

const SEGMENT_LABELS: Record<BundledTapSoundFileName, string> = {
  'keytap_soft.wav': 'SOFT',
  'keytap_soft_low.wav': 'LOW',
  'keytap_soft_high.wav': 'HIGH',
  'typebase_keytap_soft.wav': 'CLASS',
};

type Props = {
  value: BundledTapSoundFileName | null;
  onChange: (fileName: BundledTapSoundFileName) => void;
  disabled?: boolean;
};

export function TapSoundPresetControl({value, onChange, disabled}: Props) {
  const options = useMemo(
    () =>
      BUNDLED_TAP_SOUND_PRESETS.map(preset => ({
        id: preset.fileName,
        label: SEGMENT_LABELS[preset.fileName],
      })),
    [],
  );

  return (
    <SettingsSegmentBar
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
