import React, {useMemo} from 'react';

import {SettingsSegmentBar} from '../../app/SettingsSegmentBar';
import {
  BUNDLED_TAP_SOUND_PRESETS,
  type BundledTapSoundFileName,
} from './tapSoundPresets';

const SEGMENT_LABELS: Record<BundledTapSoundFileName, string> = {
  'electronic_1_blip.wav': 'BLIP',
  'electronic_2_glass.wav': 'GLASS',
  'electronic_3_pulse.wav': 'PULSE',
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
