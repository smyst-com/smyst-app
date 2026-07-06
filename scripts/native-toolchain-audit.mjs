#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const strict = process.argv.includes('--strict') || process.env.SMYST_NATIVE_STRICT === 'true';
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

function run(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
  });
  return {
    command: [command, ...args].join(' '),
    found: result.error?.code !== 'ENOENT',
    status: result.status,
    stdout: (result.stdout || '').trim().slice(0, 1000),
    stderr: (result.stderr || '').trim().slice(0, 1000),
    error: result.error ? String(result.error.message || result.error) : '',
  };
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const capacitorConfig = read('capacitor.config.ts');
const packageJson = JSON.parse(read('package.json'));

check('capacitor_app_id_present', capacitorConfig.includes("appId: 'com.smyst.app'"));
check('capacitor_app_name_smyst_com', capacitorConfig.includes("appName: 'smyst.com'"));
check('capacitor_web_dir_dist', capacitorConfig.includes("webDir: 'dist'"));
check('capacitor_android_dependency', Boolean(packageJson.dependencies?.['@capacitor/android']));
check('capacitor_ios_dependency', Boolean(packageJson.dependencies?.['@capacitor/ios']));

const java = run('java', ['-version']);
const adb = run('adb', ['devices']);
const xcrun = run('xcrun', ['simctl', 'list', 'devices', 'booted']);

const xcodeApp = fs.existsSync('/Applications/Xcode.app');
const androidStudioApp = fs.existsSync('/Applications/Android Studio.app');
const iosReady = xcrun.found && xcrun.status === 0 && xcodeApp;
const androidReady = java.found && java.status === 0 && adb.found && adb.status === 0 && androidStudioApp;
const ready = iosReady && androidReady;

check('ios_simulator_toolchain_available', strict ? iosReady : true, xcrun.error || xcrun.stderr || xcrun.stdout);
check('android_emulator_toolchain_available', strict ? androidReady : true, [java.error || java.stderr, adb.error || adb.stderr].filter(Boolean).join(' | '));

const failed = checks.filter((item) => !item.ok);
const blockers = [];
if (!iosReady) blockers.push('iOS simulator blocked: Xcode.app and working xcrun simctl are required.');
if (!androidReady) blockers.push('Android emulator blocked: Android Studio, Java Runtime and working adb are required.');

const result = {
  ok: failed.length === 0,
  ready,
  strict,
  checks,
  failed,
  blockers,
  toolchain: {
    ios: { ready: iosReady, xcodeApp, xcrun },
    android: { ready: androidReady, androidStudioApp, java, adb },
  },
};

console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
