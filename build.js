'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
// The mascot's canonical CSS is shared with its independently tested SVG art.
const { MASCOT_CSS } = require('./src/mascot.js');
// Reject even inert source-comment URLs: the delivered file has only SVG's
// namespace URL. Source citations belong in docs/REVIEW.md, outside the bundle.
function assertOfflineHTML(html) {
  const withoutNamespaces = html.replace(/https?:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink)(?=["'\s<>`])/g, '');
  for (const attribute of html.matchAll(/<[a-z][\w:-]*\b[^>]*\b(?:src|(?:xlink:)?href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    if (!/^(?:#|data:)/i.test(attribute[1] ?? attribute[2] ?? attribute[3])) {
      throw new Error('The offline build contains a dependent file');
    }
  }
  if (/https?:\/\//i.test(withoutNamespaces) ||
    /@import\b|url\(\s*['"]?(?!#|data:)[^\s'"\)]/i.test(html)) {
    throw new Error('The offline build contains an external resource or URL');
  }
  return html;
}
function build() {
  let html = read('index.template.html');
  const replacements = {
    APP_STYLES: read('style.css').replace('/* MASCOT_CSS */', MASCOT_CSS),
    ENGINE_SCRIPT: read('engine.js'), MASCOT_SCRIPT: read('mascot.js'), APP_SCRIPT: read('app.js')
  };
  for (const [key, value] of Object.entries(replacements)) {
    // A literal closing script in a future dialogue must not break the bundle.
    html = html.replace(`/* ${key} */`, () => key.endsWith('SCRIPT') ? value.replace(/<\/script/gi, '<\\/script') : value);
  }
  assertOfflineHTML(html);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fs.writeFileSync(path.join(root, 'dist', 'mirutet.html'), html);
  console.log(`Built index.html and dist/mirutet.html (${Buffer.byteLength(html).toLocaleString()} bytes each)`);
}
if (require.main === module) build();
module.exports = { assertOfflineHTML, build };
