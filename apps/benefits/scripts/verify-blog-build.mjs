import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = 'build';
const required = ['index.html', 'privacy/index.html', 'app'];
for (const path of required) {
  if (!existsSync(join(root, path))) {
    console.error('Blog static export missing:', path);
    process.exitCode = 1;
  }
}
if (process.exitCode) process.exit(process.exitCode);
const homepage = readFileSync(join(root, 'index.html'), 'utf8');
const privacy = readFileSync(join(root, 'privacy/index.html'), 'utf8');
if (!homepage.includes('혜택찾기') || !privacy.includes('개인정보')) {
  console.error('Blog export HTML content invalid');
  process.exit(1);
}
const assets = readdirSync(join(root, 'app'));
if (!assets.includes('immutable')) {
  console.error('Blog static export missing immutable JS/CSS assets');
  process.exit(1);
}
console.log('STATIC BUILD OK: index.html, privacy/index.html, app/immutable');
