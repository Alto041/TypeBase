export type FormatType = {
  id: string;
  label: string;
  instruction: string;
};

export const FORMAT_TYPES: FormatType[] = [
  {
    id: 'email',
    label: 'Email',
    instruction:
      'Structure as a send-ready email: subject line on the first line when appropriate, greeting, short paragraphs, and a polite sign-off. Remove AI preamble and markdown artifacts.',
  },
  {
    id: 'message',
    label: 'Message',
    instruction:
      'Format as a concise chat or SMS message: direct, friendly, minimal fluff, no email headers or formal sign-off unless clearly needed.',
  },
  {
    id: 'social',
    label: 'Social',
    instruction:
      'Format as a social media post: strong opening line, readable spacing, conversational tone. Hashtags only if they fit naturally at the end.',
  },
  {
    id: 'document',
    label: 'Document',
    instruction:
      'Format as a clear document: logical sections, optional short headings, professional structure. Preserve all facts and details.',
  },
  {
    id: 'notes',
    label: 'Notes',
    instruction:
      'Format as organized notes or a to-do list: grouped bullets, action items with clear verbs, scannable structure. Use checkboxes (- [ ]) for tasks when appropriate.',
  },
  {
    id: 'essay',
    label: 'Essay',
    instruction:
      'Format as a short essay: introduction, body paragraphs with clear flow, and a brief conclusion. Keep the author’s ideas intact.',
  },
];

export const DEFAULT_FORMAT_TYPE = 'email';

export function getFormatType(formatId: string): FormatType {
  return (
    FORMAT_TYPES.find(format => format.id === formatId) ??
    FORMAT_TYPES.find(format => format.id === DEFAULT_FORMAT_TYPE)!
  );
}
