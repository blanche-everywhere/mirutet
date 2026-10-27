'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
// The mascot's canonical CSS is shared with its independently tested SVG art.
const { MASCOT_CSS } = require('./src/mascot.js');
let html = read('index.template.html');
const replacements = {
  APP_STYLES: read('style.css').replace('/* MASCOT_CSS */', MASCOT_CSS),
  ENGINE_SCRIPT: read('engine.js'), MASCOT_SCRIPT: read('mascot.js'), APP_SCRIPT: read('app.js')
};
for (const [key, value] of Object.entries(replacements)) {
  // A literal closing script in a future dialogue must not break the bundle.
  html = html.replace(`/* ${key} */`, () => key.endsWith('SCRIPT') ? value.replace(/<\/script/gi, '<\\/script') : value);
}
if (/<(?:script|link|img)\b[^>]*(?:src|href)\s*=/i.test(html) || /@import\b|url\(\s*['"]?https?:/i.test(html)) {
  throw new Error('The offline build contains an external resource');
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'index.html'), html);
fs.writeFileSync(path.join(root, 'dist', 'moetet-finesse.html'), html);
console.log(`Built index.html and dist/moetet-finesse.html (${Buffer.byteLength(html).toLocaleString()} bytes each)`);
