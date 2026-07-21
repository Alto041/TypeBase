/**
 * @deprecated Use `npm run sync:symspell` — English words come from SymSpell's
 * frequency_dictionary_en_82_765.txt (~82k words).
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, ['scripts/sync-symspell-dictionary.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
