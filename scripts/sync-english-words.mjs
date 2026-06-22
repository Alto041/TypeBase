import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const txtPath = path.join(root, 'src/keyboard/gesture/data/englishWords.txt');
const jsonPath = path.join(root, 'src/keyboard/gesture/data/englishWords.json');
const assetPath = path.join(
  root,
  'android/app/src/main/assets/english_words.txt',
);

const words = readFileSync(txtPath, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

writeFileSync(jsonPath, `${JSON.stringify(words)}\n`, 'utf8');
mkdirSync(path.dirname(assetPath), {recursive: true});
copyFileSync(txtPath, assetPath);

console.log(`Synced ${words.length} words to json + Android assets.`);
