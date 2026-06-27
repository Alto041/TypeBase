import {Buffer} from 'buffer';

export type KlcVkEntry = {
  base: string;
  shift?: string;
};

export type ParsedKlc = {
  name: string;
  localeName?: string;
  vkEntries: Record<string, KlcVkEntry>;
  /** VK → output string for unshifted ligature keys (e.g. لا on B). */
  ligatures: Record<string, string>;
};

function hexToChar(hex: string): string | null {
  const trimmed = hex.trim().toLowerCase();
  if (!trimmed || trimmed === '-1' || trimmed === '%%' || trimmed.startsWith('@')) {
    return null;
  }
  const code = Number.parseInt(trimmed, 16);
  if (!Number.isFinite(code) || code < 0x20) {
    return null;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

function parseQuotedName(line: string): string | null {
  const match = line.match(/"([^"]+)"/);
  return match?.[1]?.trim() ?? null;
}

function normalizeVk(raw: string): string {
  return raw.trim().toUpperCase();
}

function parseCodepoint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-1' || trimmed === '%%' || trimmed.startsWith('@')) {
    return null;
  }

  // KLC uses single-character literals for letters/digits (e, E, 1) and multi-digit
  // hex for Unicode code points (0027, 00e7). Single chars a–f must not be read as hex.
  if (trimmed.length === 1) {
    return trimmed;
  }

  const withoutDeadSuffix = trimmed.endsWith('@') ? trimmed.slice(0, -1) : trimmed;
  if (/^[0-9a-fA-F]+$/.test(withoutDeadSuffix)) {
    return hexToChar(withoutDeadSuffix);
  }

  return null;
}

function splitKlcFields(line: string): string[] {
  return line
    .split('\t')
    .map(part => part.trim())
    .filter(part => part.length > 0 && !part.startsWith('//'));
}

function looksLikeKlc(text: string): boolean {
  return text.includes('KBD') && text.includes('LAYOUT');
}

/** Decode KLC bytes (UTF-16 LE from Windows, or UTF-8). */
export function decodeKlcFile(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // UTF-16 LE with BOM — default when Windows saves kbdlayout.info downloads as .txt
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return Buffer.from(bytes.subarray(2)).toString('utf16le');
  }

  const asUtf8 = Buffer.from(bytes).toString('utf8');
  if (looksLikeKlc(asUtf8)) {
    return asUtf8.replace(/^\uFEFF/, '');
  }

  // UTF-16 LE without BOM (null byte every other byte in ASCII stretches)
  if (bytes.length >= 4 && bytes[1] === 0x00 && bytes[3] === 0x00) {
    const asUtf16 = Buffer.from(bytes).toString('utf16le');
    if (looksLikeKlc(asUtf16)) {
      return asUtf16.replace(/^\uFEFF/, '');
    }
  }

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return Buffer.from(bytes.subarray(3)).toString('utf8');
  }

  return asUtf8.replace(/^\uFEFF/, '');
}

/** Parse a kbdlayout.info / MSKLC `.klc` text export. */
export function parseKlc(text: string): ParsedKlc {
  const source = text.replace(/^\uFEFF/, '');
  const vkEntries: Record<string, KlcVkEntry> = {};
  const ligatures: Record<string, string> = {};
  let name = 'Imported layout';
  let localeName: string | undefined;
  let section: 'none' | 'layout' | 'ligature' = 'none';

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith(';')) {
      continue;
    }

    if (line.startsWith('KBD\t')) {
      const quoted = parseQuotedName(line);
      if (quoted) {
        name = quoted;
      }
      continue;
    }

    if (line.startsWith('LOCALENAME')) {
      const quoted = parseQuotedName(line);
      if (quoted) {
        localeName = quoted;
      }
      continue;
    }

    if (line.startsWith('LAYOUT')) {
      section = 'layout';
      continue;
    }

    if (line.startsWith('LIGATURE')) {
      section = 'ligature';
      continue;
    }

    if (
      line.startsWith('KEYNAME') ||
      line === 'ENDKBD' ||
      line.startsWith('ENDKBD')
    ) {
      section = 'none';
      continue;
    }

    if (section === 'layout') {
      const parts = splitKlcFields(line);
      if (parts.length < 5) {
        continue;
      }
      if (parts[0] === '-1' || parts[1] === '-1') {
        // SGCAPS companion row for the previous key — skip.
        continue;
      }
      const vk = normalizeVk(parts[1]);
      if (!vk || vk === '---' || vk === '-1') {
        continue;
      }
      const base = parseCodepoint(parts[3]);
      if (!base) {
        continue;
      }
      const shift = parseCodepoint(parts[4] ?? '');
      const nextEntry = shift ? {base, shift} : {base};
      const existing = vkEntries[vk];
      // Prefer standard Cap=0 rows; keep Cap=1/SGCap when no base row exists.
      if (!existing || parts[2] === '0') {
        vkEntries[vk] = nextEntry;
      }
      continue;
    }

    if (section === 'ligature') {
      const parts = splitKlcFields(line);
      if (parts.length < 4) {
        continue;
      }
      const vk = normalizeVk(parts[0]);
      if (vk === '-1') {
        continue;
      }
      const mod = parts[1];
      if (mod !== '0') {
        continue;
      }
      const chars: string[] = [];
      for (let i = 2; i < parts.length; i += 1) {
        const ch = parseCodepoint(parts[i] ?? '');
        if (ch) {
          chars.push(ch);
        }
      }
      if (chars.length > 0) {
        ligatures[vk] = chars.join('');
      }
    }
  }

  if (Object.keys(vkEntries).length === 0) {
    throw new Error('No letter keys found in KLC file.');
  }

  return {name, localeName, vkEntries, ligatures};
}
