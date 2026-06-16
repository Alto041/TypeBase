/**
 * USB-friendly Android dev workflow:
 * 1. adb reverse so the phone's 127.0.0.1:8081 hits Metro on the PC
 * 2. Metro on localhost only
 * 3. expo run:android without starting a second LAN bundler
 */
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureLocalExpoSettings() {
  const expoDir = path.join(root, '.expo');
  const settingsPath = path.join(expoDir, 'settings.json');
  fs.mkdirSync(expoDir, {recursive: true});

  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    // fresh settings file
  }

  settings.hostType = 'localhost';
  settings.devClient = true;
  settings.dev = true;
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

async function waitForMetro(maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:8081/status');
      if (response.ok) {
        return;
      }
    } catch {
      // Metro still starting
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.error(
    '\nMetro did not become ready on http://127.0.0.1:8081\n' +
      'Check that port 8081 is free, then try again.\n',
  );
  process.exit(1);
}

ensureLocalExpoSettings();

console.log('Setting up adb port reverse (device 8081 -> PC 8081)...');
run('adb', ['reverse', 'tcp:8081', 'tcp:8081']);

const metroEnv = {
  ...process.env,
  REACT_NATIVE_PACKAGER_HOSTNAME: 'localhost',
};

console.log('Starting Metro on localhost...');
const metro = spawn(
  npx,
  ['expo', 'start', '--dev-client', '--localhost'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    env: metroEnv,
  },
);

let shuttingDown = false;
const shutdown = (code = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (!metro.killed) {
    metro.kill('SIGTERM');
  }
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
metro.on('exit', code => {
  if (!shuttingDown) {
    shutdown(code ?? 1);
  }
});

await waitForMetro();

console.log('Building/installing Android app (Metro already running)...');
run(npx, ['expo', 'run:android', '--no-bundler'], {env: metroEnv});

console.log(
  '\nDev build installed. Metro is still running on localhost:8081.\n' +
    'Open the TypeBase app on your phone — it should connect via USB.\n' +
    'Press Ctrl+C here to stop Metro.\n',
);
