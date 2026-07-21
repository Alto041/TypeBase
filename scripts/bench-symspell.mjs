import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SymSpell, Verbosity} from '../src/keyboard/autocorrect/symspell/SymSpell.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = JSON.parse(
  readFileSync(
    path.join(root, 'src/keyboard/autocorrect/data/frequency_dictionary_en.json'),
    'utf8',
  ),
);

console.time('seed');
const ss = new SymSpell(90_000, 2, 7);
for (const [word, count] of entries) {
  ss.CreateDictionaryEntry(word, count);
}
console.timeEnd('seed');
console.log('words', ss.WordCount);

for (const typo of ['hhello', 'pwople', 'recieve', 'teh', 'accomodate']) {
  console.time(`lookup:${typo}`);
  const hits = ss.Lookup(typo, Verbosity.Closest, 2).slice(0, 3);
  console.timeEnd(`lookup:${typo}`);
  console.log(typo, '->', hits.map(h => `${h.term}(${h.distance})`).join(', '));
}
