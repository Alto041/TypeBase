export type TargetLanguage = {
  code: string;
  label: string;
};

export const TARGET_LANGUAGES: TargetLanguage[] = [
  {code: 'en', label: 'English'},
  {code: 'es', label: 'Spanish'},
  {code: 'fr', label: 'French'},
  {code: 'de', label: 'German'},
  {code: 'it', label: 'Italian'},
  {code: 'pt', label: 'Portuguese'},
  {code: 'hi', label: 'Hindi'},
  {code: 'ar', label: 'Arabic'},
  {code: 'zh', label: 'Chinese'},
  {code: 'ja', label: 'Japanese'},
  {code: 'ko', label: 'Korean'},
  {code: 'ru', label: 'Russian'},
  {code: 'tr', label: 'Turkish'},
  {code: 'nl', label: 'Dutch'},
  {code: 'pl', label: 'Polish'},
];

export const DEFAULT_TARGET_LANGUAGE = 'en';
