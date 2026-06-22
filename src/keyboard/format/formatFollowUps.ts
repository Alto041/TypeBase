export type FormatFollowUp = {
  id: string;
  label: string;
  instruction: string;
};

export const FORMAT_FOLLOW_UPS: FormatFollowUp[] = [
  {
    id: 'shorter',
    label: 'Make it shorter',
    instruction: 'Make the text more concise. Cut filler without losing meaning.',
  },
  {
    id: 'detail',
    label: 'Add more detail',
    instruction: 'Expand slightly with useful detail. Do not invent new facts.',
  },
  {
    id: 'greeting',
    label: 'Add greeting',
    instruction: 'Add an appropriate greeting at the start if one is missing.',
  },
  {
    id: 'signoff',
    label: 'Add sign-off',
    instruction: 'Add a polite sign-off at the end if one is missing.',
  },
  {
    id: 'bullets',
    label: 'Bullet points',
    instruction: 'Reformat key points as a clear bullet list.',
  },
  {
    id: 'simpler',
    label: 'Simplify',
    instruction: 'Use simpler words and shorter sentences.',
  },
  {
    id: 'formal',
    label: 'More formal',
    instruction: 'Make the tone more formal and professional.',
  },
  {
    id: 'casual',
    label: 'More casual',
    instruction: 'Make the tone warmer and more conversational.',
  },
];

export function getFormatFollowUp(followUpId: string): FormatFollowUp | null {
  return FORMAT_FOLLOW_UPS.find(item => item.id === followUpId) ?? null;
}
