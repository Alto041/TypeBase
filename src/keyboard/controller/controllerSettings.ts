export type ControllerAction =
  | 'toggleKeyboard'
  | 'submitText'
  | 'backspace'
  | 'enter'
  | 'clickKey'
  | 'selectKey';

export type ControllerButton =
  | 'button_a'
  | 'button_b'
  | 'button_x'
  | 'button_y'
  | 'button_l1'
  | 'button_r1'
  | 'button_l2'
  | 'button_r2'
  | 'button_thumb_l'
  | 'button_thumb_r'
  | 'button_start'
  | 'button_select'
  | 'dpad_center';

export type ControllerMappings = Record<ControllerAction, ControllerButton>;

export type ControllerSettings = {
  enabled: boolean;
  compactLandscape: boolean;
  mappings: ControllerMappings;
};

export const CONTROLLER_BUTTONS: ControllerButton[] = [
  'button_a',
  'button_b',
  'button_x',
  'button_y',
  'button_l1',
  'button_r1',
  'button_l2',
  'button_r2',
  'button_thumb_l',
  'button_thumb_r',
  'button_start',
  'button_select',
  'dpad_center',
];

export const CONTROLLER_ACTION_LABELS: Record<ControllerAction, string> = {
  toggleKeyboard: 'Toggle Keyboard',
  submitText: 'Submit / Send',
  backspace: 'Backspace',
  enter: 'Enter',
  clickKey: 'Click Key',
  selectKey: 'Select Key',
};

export const CONTROLLER_BUTTON_LABELS: Record<ControllerButton, string> = {
  button_a: 'A',
  button_b: 'B',
  button_x: 'X',
  button_y: 'Y',
  button_l1: 'L1',
  button_r1: 'R1',
  button_l2: 'L2',
  button_r2: 'R2',
  button_thumb_l: 'Left Stick',
  button_thumb_r: 'Right Stick',
  button_start: 'Start',
  button_select: 'Select',
  dpad_center: 'D-pad Center',
};

export const DEFAULT_CONTROLLER_SETTINGS: ControllerSettings = {
  enabled: true,
  compactLandscape: true,
  mappings: {
    toggleKeyboard: 'button_b',
    submitText: 'button_y',
    backspace: 'button_x',
    enter: 'button_r1',
    clickKey: 'button_thumb_l',
    selectKey: 'button_a',
  },
};

export function normalizeControllerSettings(raw: unknown): ControllerSettings {
  if (!raw || typeof raw !== 'object') {
    return {...DEFAULT_CONTROLLER_SETTINGS};
  }
  const obj = raw as Record<string, unknown>;
  const mappingsRaw =
    obj.mappings && typeof obj.mappings === 'object'
      ? (obj.mappings as Record<string, unknown>)
      : {};

  const readButton = (
    action: ControllerAction,
  ): ControllerButton =>
    typeof mappingsRaw[action] === 'string' &&
    CONTROLLER_BUTTONS.includes(mappingsRaw[action] as ControllerButton)
      ? (mappingsRaw[action] as ControllerButton)
      : DEFAULT_CONTROLLER_SETTINGS.mappings[action];

  return {
    enabled:
      typeof obj.enabled === 'boolean'
        ? obj.enabled
        : DEFAULT_CONTROLLER_SETTINGS.enabled,
    compactLandscape:
      typeof obj.compactLandscape === 'boolean'
        ? obj.compactLandscape
        : DEFAULT_CONTROLLER_SETTINGS.compactLandscape,
    mappings: {
      toggleKeyboard: readButton('toggleKeyboard'),
      submitText: readButton('submitText'),
      backspace: readButton('backspace'),
      enter: readButton('enter'),
      clickKey: readButton('clickKey'),
      selectKey: readButton('selectKey'),
    },
  };
}

export function nextControllerButton(button: ControllerButton): ControllerButton {
  const index = CONTROLLER_BUTTONS.indexOf(button);
  return CONTROLLER_BUTTONS[(index + 1) % CONTROLLER_BUTTONS.length];
}
