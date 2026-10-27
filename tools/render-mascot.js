#!/usr/bin/env node
'use strict';
// node tools/render-mascot.js — opens directly from file://; no build required.
const fs = require('node:fs');
const path = require('node:path');
const mascot = require('../src/mascot.js');

const sampleLines = {
  normal: mascot.WELCOME_LINES[0],
  happy: mascot.STREAK_LINES[10][0],
  surprised: mascot.ENCOURAGEMENT_LINES[1],
  thinking: mascot.hintText('T', 4, 2, ['180', 'DAS←']),
  sorry: mascot.MISS_LINES[0]
};
function html(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;',
    '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function renderMascotPreview() {
  const cards = mascot.EXPRESSIONS.map(expression => `
  <article class="card">
    <div class="caption"><h2>${mascot.EXPRESSION_LABELS[expression]}</h2><span>${expression}</span></div>
    <div class="portrait">${mascot.mascotSVG(expression, { idPrefix: 'preview-' + expression })}</div>
    <p class="bubble">${html(sampleLines[expression])}</p>
  </article>`).join('');
  const page = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ミルフィ — 表情プレビュー</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #65536f; background: #faf7fc;
      background-image: radial-gradient(circle at 12% 10%, #e5f5ef 0, transparent 35%),
        radial-gradient(circle at 88% 80%, #fbe5ed 0, transparent 38%);
      font-family: "Hiragino Maru Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans CJK JP", sans-serif; }
    main { padding: 30px 24px 24px; max-width: 1640px; margin: auto; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin: 0 6px 24px; }
    .eyebrow { color: #9986ae; font-size: 11px; letter-spacing: .2em; margin: 0 0 7px; }
    h1 { margin: 0; font-size: 28px; letter-spacing: .06em; }
    .intro { margin: 8px 0 0; font-size: 13px; color: #928398; }
    .badge { background: #fffafc; border: 1px solid #e6dae9; padding: 8px 13px; border-radius: 20px;
      font-size: 12px; white-space: nowrap; }
    .gallery { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
    .card { background: #fffdfede; border: 1px solid #e9dfea; border-radius: 22px;
      padding: 17px 10px 14px; box-shadow: 0 8px 24px #8e6c9c0a; min-width: 0; }
    .caption { display: flex; align-items: center; justify-content: space-between; padding: 0 8px; }
    .caption h2 { margin: 0; font-size: 14px; font-weight: 600; }
    .caption span { font-size: 10px; color: #ac9ab5; letter-spacing: .04em; }
    .portrait { margin-top: 12px; min-height: 240px; display: flex; justify-content: center; }
    .portrait svg { width: 100%; max-width: 300px; }
    .bubble { position: relative; margin: 16px 4px 0; padding: 14px; min-height: 110px; border-radius: 15px;
      background: #f6f0fa; color: #806b90; font-size: 12px; line-height: 1.9; }
    .bubble::before { content: ""; position: absolute; top: -7px; left: calc(50% - 7px); border-width: 0 7px 8px;
      border-style: solid; border-color: transparent transparent #f6f0fa; }
    footer { margin: 20px 6px 0; color: #a08da9; font-size: 11px; line-height: 1.9; }
    @media (max-width: 900px) { main { min-width: 900px; } }
    ${mascot.MASCOT_CSS}
  </style>
</head>
<body>
  <main>
    <header>
      <div><p class="eyebrow">MOE TET · CHARACTER STUDY</p><h1>ミルフィの表情ノート</h1>
        <p class="intro">テト学園の案内役です♪ いっしょに、最短ルートを覚えましょう。</p></div>
      <span class="badge">萌えテト フィネス編</span>
    </header>
    <section class="gallery" aria-label="ミルフィの5つの表情">${cards}
    </section>
    <footer>オリジナルキャラクター「ミルフィ」 · ミントとライラックのツインテール／ブロックの髪飾り<br />
      インラインSVGのみ・外部リソースなし。静止画の撮影は「動きを減らす」設定でアニメーションを停止できます。</footer>
  </main>
</body>
</html>
`;
  const outputPath = path.resolve(__dirname, '../screens/mascot-preview.html');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, page, 'utf8');
  return outputPath;
}

if (require.main === module) console.log('Wrote ' + renderMascotPreview());
module.exports = { renderMascotPreview };
