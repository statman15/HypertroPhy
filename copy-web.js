// Copies the web app into www/ for Capacitor, leaving out tests, docs, node_modules and the android project.
import { cpSync, rmSync, readdirSync } from 'node:fs';

const skip = /^(www|android|node_modules|\..*|.*\.test\.js|copy-web\.js|package(-lock)?\.json|capacitor\.config\.json|.*\.md)$/;
rmSync('www', { recursive: true, force: true });
for (const f of readdirSync('.')) if (!skip.test(f)) cpSync(f, `www/${f}`, { recursive: true });
console.log('www/:', readdirSync('www').join(' '));
