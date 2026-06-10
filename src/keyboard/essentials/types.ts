export type Essential = {
  id: string;
  keyword: string;
  value: string;
};

export type KeyboardMode =
  | {type: 'typing'}
  | {type: 'emoji'}
  | {type: 'items-menu'}
  | {type: 'essentials-list'}
  | {
      type: 'essentials-form';
      essentialId?: string;
      focusField: 'keyword' | 'value';
    }
  | {type: 'clipboard'}
  | {type: 'gestures'}
  | {type: 'autocorrect'}
  | {type: 'calculator'};
