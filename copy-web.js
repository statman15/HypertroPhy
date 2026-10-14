// Copies the web app into www/ for Capacitor, leaving out tests, docs, node_modules and the android project.
import { cpSync, rmSync, readdirSync, writeFileSync } from 'node:fs';

const skip = /^(www|android|node_modules|\..*|.*\.test\.js|copy-web\.js|smoke\.mjs|package(-lock)?\.json|capacitor\.config\.json|.*\.md)$/;
rmSync('www', { recursive: true, force: true });
for (const f of readdirSync('.')) if (!skip.test(f)) cpSync(f, `www/${f}`, { recursive: true });
// The installed version, for the Android app's update check (CI sets VERSION_NAME; local builds are "dev").
writeFileSync('www/version.json', JSON.stringify({ version: process.env.VERSION_NAME || 'dev' }));
console.log('www/:', readdirSync('www').join(' '));
