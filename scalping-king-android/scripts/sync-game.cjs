'use strict';

const {copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync} = require('node:fs');
const {join} = require('node:path');

const root = join(__dirname, '..');
const source = join(root, '..', 'games', 'scalping-king');
const output = join(root, 'www');
const files = ["index.html","style.css","game.js","chart.js","market.js","engine-v2.js","ledger-v2.js","microstructure-v2.js","risk-v2.js","reward-v2.js","official-client.js","official-engine.mjs"];
mkdirSync(output, {recursive: true});
for (const name of files) copyFileSync(join(source, name), join(output, name));
copyFileSync(join(root, 'src', 'android-reward.js'), join(output, 'android-reward.js'));
// Keep the in-app privacy link functional offline. Do not package only top-level JS/CSS.
cpSync(join(source, 'privacy'), join(output, 'privacy'), {recursive: true, force: true});
cpSync(join(source, 'delete-account'), join(output, 'delete-account'), {recursive: true, force: true});
const index = join(output, 'index.html');
const html = readFileSync(index, 'utf8');
const script = '  <script defer src="./android-reward.js"></script>\n';
if (!html.includes('  <script defer src="./game.js')) throw new Error('Missing game entry point');
writeFileSync(index, html.replace('  <script defer src="./game.js', script + '  <script defer src="./game.js'));
