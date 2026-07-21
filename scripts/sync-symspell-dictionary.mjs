import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const txtPath = path.join(
  root,
  'src/keyboard/autocorrect/data/frequency_dictionary_en_82_765.txt',
);
const jsonPath = path.join(
  root,
  'src/keyboard/autocorrect/data/frequency_dictionary_en.json',
);
const legacyJsonPath = path.join(
  root,
  'src/keyboard/gesture/data/englishWords.json',
);
const legacyTxtPath = path.join(
  root,
  'src/keyboard/gesture/data/englishWords.txt',
);
const assetPath = path.join(
  root,
  'android/app/src/main/assets/english_words.txt',
);

const raw = readFileSync(txtPath, 'utf8');
const entries = [];
const seen = new Set();

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed) {
    continue;
  }
  const space = trimmed.indexOf(' ');
  if (space <= 0) {
    continue;
  }
  const word = trimmed.slice(0, space).toLowerCase();
  const count = Number.parseInt(trimmed.slice(space + 1).trim(), 10);
  if (!word || !Number.isFinite(count) || count <= 0) {
    continue;
  }
  if (seen.has(word)) {
    continue;
  }
  seen.add(word);
  entries.push([word, count]);
}

writeFileSync(jsonPath, `${JSON.stringify(entries)}\n`, 'utf8');

const wordsOnly = entries.map(([word]) => word);
writeFileSync(legacyJsonPath, `${JSON.stringify(wordsOnly)}\n`, 'utf8');
writeFileSync(legacyTxtPath, `${wordsOnly.join('\n')}\n`, 'utf8');
mkdirSync(path.dirname(assetPath), {recursive: true});
writeFileSync(assetPath, `${wordsOnly.join('\n')}\n`, 'utf8');

console.log(
  `Synced ${entries.length} SymSpell frequency entries to json, englishWords, and Android assets.`,
);
