export type ClipboardItemKind = 'text' | 'image';

export type ClipboardItem = {
  id: string;
  kind: ClipboardItemKind;
  text?: string;
  imageUri?: string;
  imageHash?: string;
  mimeType?: string;
  createdAt: number;
  pinned: boolean;
};

export type ClipboardContent =
  | {kind: 'none'}
  | {kind: 'text'; text: string}
  | {
      kind: 'image';
      imagePath: string;
      imageHash: string;
      mimeType?: string;
    };
