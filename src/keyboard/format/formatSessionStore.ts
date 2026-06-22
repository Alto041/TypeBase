export type FormatTurn = {
  role: 'user' | 'model';
  text: string;
};

export type FormatSession = {
  sourceText: string;
  formatId: string;
  turns: FormatTurn[];
};

let session: FormatSession | null = null;

export function getFormatSession(): FormatSession | null {
  return session;
}

export function clearFormatSession(): void {
  session = null;
}

export function beginFormatSession(sourceText: string, formatId: string): FormatSession {
  session = {
    sourceText,
    formatId,
    turns: [],
  };
  return session;
}

export function updateFormatSessionFormat(formatId: string): void {
  if (!session) {
    return;
  }
  session = {
    ...session,
    formatId,
    turns: [],
  };
}

export function recordFormatTurn(role: FormatTurn['role'], text: string): void {
  if (!session || !text.trim()) {
    return;
  }
  session = {
    ...session,
    turns: [...session.turns, {role, text}],
  };
}
