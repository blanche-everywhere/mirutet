'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../src/engine.js');
const M = require('../src/mascot.js');

// A small, independent XML-subset parser. A tag stack alone misses malformed
// attributes, bare ampersands, duplicate attributes, and text outside the root.
// The generator uses no comments, CDATA, DTDs, or processing instructions.
function parseXML(source) {
  const stack = [], elements = [];
  let roots = 0, offset = 0;
  const entities = text => assert.ok(!/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(text), 'XML entity');
  for (const token of source.matchAll(/<[^>]*>|[^<]+/g)) {
    assert.equal(token.index, offset, 'no unparsed XML');
    offset += token[0].length;
    const value = token[0];
    if (!value.startsWith('<')) {
      entities(value);
      assert.ok(stack.length || !value.trim(), 'text inside root');
      continue;
    }
    if (value.startsWith('</')) {
      const close = /^<\/([\w:-]+)\s*>$/.exec(value);
      assert.ok(close, 'valid closing tag');
      assert.equal(stack.pop(), close[1], 'balanced nested tags');
      continue;
    }
    const tag = /^<([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/.exec(value);
    assert.ok(tag, 'valid opening tag');
    const attrs = Object.create(null);
    let tail = tag[2];
    while (tail.trim()) {
      const attr = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(tail);
      assert.ok(attr, 'quoted and valid XML attributes: ' + tail);
      assert.ok(!(attr[1] in attrs), 'unique attribute');
      attrs[attr[1]] = attr[2] ?? attr[3];
      entities(attrs[attr[1]]);
      tail = tail.slice(attr[0].length);
    }
    if (!stack.length) roots++;
    elements.push({ name: tag[1], attrs });
    if (!tag[3]) stack.push(tag[1]);
  }
  assert.equal(offset, source.length);
  assert.equal(stack.length, 0, 'all tags closed');
  assert.equal(roots, 1, 'one XML root');
  return elements;
}

test('all five expressions are well-formed standalone SVGs with self-contained paints and swappable faces', () => {
  assert.deepEqual(M.EXPRESSIONS, ['normal', 'happy', 'surprised', 'thinking', 'sorry']);
  const seenIDs = new Set(), faces = new Set();
  for (const expression of M.EXPRESSIONS) {
    const svg = M.mascotSVG(expression);
    const elements = parseXML(svg), root = elements[0];
    assert.equal(root.name, 'svg');
    assert.equal(root.attrs.xmlns, 'http://www.w3.org/2000/svg');
    assert.equal(root.attrs.viewBox, '0 0 300 360');
    assert.equal(root.attrs['data-expression'], expression);
    assert.equal(root.attrs.role, 'img');
    assert.ok(elements.some(el => el.name === 'title'));
    assert.ok(elements.some(el => el.name === 'desc'));
    const ids = new Set(elements.filter(el => el.attrs.id).map(el => el.attrs.id));
    assert.equal(ids.size, elements.filter(el => el.attrs.id).length);
    for (const id of ids) { assert.ok(!seenIDs.has(id), 'IDs unique across inline instances'); seenIDs.add(id); }
    for (const match of svg.matchAll(/url\(#([\w-]+)\)/g)) assert.ok(ids.has(match[1]), 'paint/clip resolves locally');
    for (const id of root.attrs['aria-labelledby'].split(' ')) assert.ok(ids.has(id));
    for (const el of elements) {
      assert.ok(!['image', 'script', 'foreignObject', 'use'].includes(el.name));
      assert.ok(!Object.keys(el.attrs).some(a => /^on/i.test(a)), 'no event handlers');
      for (const [name, value] of Object.entries(el.attrs)) {
        if (/href$/.test(name)) assert.ok(value.startsWith('#'), 'no external href');
        assert.ok(!/url\((?!#)/i.test(value), 'no external paints');
      }
    }
    for (const part of ['eyebrows', 'eyes', 'mouth', 'cheeks', 'pose', 'front-hair', 'block-clip']) {
      assert.ok(elements.some(el => el.name === 'g' && el.attrs['data-part'] === part), part);
    }
    assert.ok(elements.filter(el => /Gradient$/.test(el.name)).length >= 6, 'layered gradient artwork');
    faces.add(svg.match(/<g data-part="mouth">([\s\S]*?)<\/g>/)[1]);
    if (expression === 'happy') assert.match(svg, /milfy-happy-eyes/);
    else {
      assert.match(svg, /milfy-eyes-open/);
      assert.equal(elements.find(el => el.attrs.class === 'milfy-eyes-closed').attrs.opacity, '0',
        'closed blink layer stays hidden even before CSS loads');
    }
  }
  assert.equal(faces.size, 5, 'different mouths for every expression');
});

test('SVG options escape untrusted text and keep IDs safe; animation supports reduced motion', () => {
  const options = { width: 600, height: 720, title: 'ミルフィ & <test> "hello" \'x\'',
    idPrefix: '\" onload=\"oops<&', animated: false, halo: false };
  const svg = M.mascotSVG('thinking', options), els = parseXML(svg);
  assert.equal(els[0].attrs.width, '600'); assert.equal(els[0].attrs.height, '720');
  assert.ok(!els.some(el => el.attrs.onload));
  assert.match(svg, /ミルフィ &amp; &lt;test&gt; &quot;hello&quot; &apos;x&apos;/);
  assert.ok(!svg.includes('milfy--animated'));
  assert.ok(!els.some(el => el.name === 'ellipse' && el.attrs.cy === '180'));
  assert.notEqual(M.mascotSVG('normal', { idPrefix: 'same' }), M.mascotSVG('normal', { idPrefix: 'same' }));
  assert.match(M.mascotSVG(), /data-expression="normal"/);
  assert.throws(() => M.mascotSVG('unknown'), RangeError);
  for (const width of [0, -1, NaN, Infinity, '300']) assert.throws(() => M.mascotSVG('normal', { width }), RangeError);
  assert.match(M.MASCOT_CSS, /@keyframes milfy-bob/);
  assert.match(M.MASCOT_CSS, /@keyframes milfy-blink/);
  assert.match(M.MASCOT_CSS, /prefers-reduced-motion: reduce/);
  assert.ok(!/@import|https?:|url\(/i.test(M.MASCOT_CSS));
});

test('XML validator rejects malformed SVG instead of just counting angle brackets', () => {
  for (const bad of ['<svg><g></svg></g>', '<svg><g/></svg><svg/>', '<svg a="1" a="2"/>',
    '<svg a=unquoted/>', '<svg>&bare</svg>', '<svg><g>']) assert.throws(() => parseXML(bad));
});

test('classic scripts attach MoeTet.mascot while preserving every frozen engine export', () => {
  const context = vm.createContext({});
  const engineSource = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
  const mascotSource = fs.readFileSync(path.join(__dirname, '../src/mascot.js'), 'utf8');
  vm.runInContext(engineSource, context);
  const original = context.MoeTet;
  assert.ok(Object.isFrozen(original));
  vm.runInContext(mascotSource, context);
  for (const key of Object.keys(original)) assert.equal(context.MoeTet[key], original[key], key);
  assert.ok(!('mascot' in original), 'frozen engine left untouched');
  assert.equal(context.MoeTet.mascot.name, 'ミルフィ');
  assert.equal(context.MoeTet.mascot.LESSONS.length, 12);
  parseXML(context.MoeTet.mascot.mascotSVG('happy'));
  assert.throws(() => vm.runInNewContext(mascotSource, {}), /engine.js before mascot.js/);
});

test('Japanese dialogue has enough varied praise, milestones, piece lines, and finesse tips', () => {
  assert.equal(M.name, 'ミルフィ');
  assert.ok(M.PRAISE_LINES.length >= 15);
  assert.ok(M.TIPS.length >= 25);
  for (const lines of [M.PRAISE_LINES, M.TIPS, M.MISS_LINES, M.ENCOURAGEMENT_LINES, M.WELCOME_LINES]) {
    assert.equal(new Set(lines).size, lines.length, 'distinct lines');
    assert.ok(lines.length > 0);
    lines.forEach(line => { assert.match(line, /[ぁ-んァ-ヶ一-龠]/); assert.ok(line.length >= 10); });
  }
  for (const streak of [5, 10, 25, 50]) assert.ok(M.STREAK_LINES[streak].some(line => line.includes(streak + '連続')));
  for (const piece of E.PIECE_TYPES) assert.ok(M.PIECE_PRAISE[piece].some(line => line.includes(piece + 'ミノ')));
  for (const term of ['IRS', 'IHS', 'ARE', 'DAS', 'ARR', 'ハードドロップ', '180°', 'ホールド']) {
    assert.ok(M.TIPS.some(line => line.includes(term)), term);
  }
  assert.equal(M.DIALOGUE.tips, M.TIPS);
  assert.ok(Object.isFrozen(M.DIALOGUE.perPiece.I));
});

test('fault hints include piece, actual count, optimal count and supplied labels, including zero-input targets', () => {
  const hint = M.hintText('T', 5, 2, ['180', '← DAS']);
  for (const text of ['Tミノ', '今回5回', '最短は2回', 'あと3回', '180 → ← DAS']) assert.ok(hint.includes(text));
  const zero = M.hintText('O', 2, 0, []);
  assert.match(zero, /0回/); assert.match(zero, /ハードドロップだけ/);
  assert.ok(!zero.includes('undefined'));
  assert.match(M.hintText('I', 1, 1, ['→']), /最短は1回/);
  for (const args of [['?', 2, 1, ['CW']], ['T', -1, 0, []], ['O', 2, 1, []], ['O', NaN, 0, []]]) {
    assert.throws(() => M.hintText(...args), RangeError);
  }
});

test('sprint comments respond independently to accuracy and PPS, including exact tier boundaries', () => {
  for (const accuracyTier of M.SPRINT_COMMENTS.accuracy) for (const ppsTier of M.SPRINT_COMMENTS.pps) {
    const comment = M.sprintComment(accuracyTier.min, ppsTier.min);
    assert.ok(comment.includes(accuracyTier.text));
    assert.ok(comment.includes(ppsTier.text));
    assert.ok(M.EXPRESSIONS.includes(accuracyTier.expression));
  }
  assert.ok(M.sprintComment(94.99, 0.99).includes(M.SPRINT_COMMENTS.accuracy[2].text));
  assert.ok(M.sprintComment(79.99, 1.99).includes(M.SPRINT_COMMENTS.pps[1].text));
  for (const args of [[-1, 1], [101, 1], [NaN, 1], [90, -1], [90, Infinity]]) {
    assert.throws(() => M.sprintComment(...args), RangeError);
  }
});

const placementCounts = { I: 17, O: 9, T: 34, L: 34, J: 34, S: 17, Z: 17 };
for (const allow180 of [true, false]) for (const piece of E.PIECE_TYPES) {
  test(`lesson groups cover every ${piece} landing exactly once, 180=${allow180}`, () => {
    const settings = { allow180 }, groups = M.lessonPlacementGroups(piece, settings);
    const actual = groups.flatMap(group => group.placements), expected = E.allPlacements(piece, settings);
    assert.equal(actual.length, placementCounts[piece]);
    assert.equal(new Set(actual.map(p => p.key)).size, actual.length);
    assert.deepEqual(actual.map(p => p.key).sort(), expected.map(p => p.key).sort());
    assert.equal(new Set(groups.map(g => JSON.stringify(g.actions))).size, groups.length);
    assert.ok(groups.some(g => g.count === 0 && g.actions.length === 0), 'zero-input group');
    for (const group of groups) {
      assert.equal(group.piece, piece);
      assert.equal(group.count, group.actions.length);
      assert.deepEqual(group.sequence, group.actions.map(a => E.ACTION_LABELS[a]));
      assert.ok(group.placements.length > 0);
      if (!allow180) assert.ok(!group.actions.includes('rotate180'));
      const board = new E.Board(); let state = E.spawnPiece(piece);
      for (const action of group.actions) { state = E.applyAction(board, state, action, settings); assert.ok(state); }
      const key = E.cellsKey(E.cells(E.hardDrop(board, state)));
      for (const placement of group.placements) {
        assert.equal(placement.key, key, 'group actions really reach this target');
        assert.equal(placement.column, placement.x + 1);
        assert.equal(placement.rotationLabel, E.ROTATIONS[placement.rot]);
        assert.equal(placement.count, E.finesseFor(piece, placement.cells, settings).count);
        assert.deepEqual(placement.actions, group.actions);
      }
    }
  });
}

test('lesson groups are fresh and isolated from frozen lesson data and engine cache', () => {
  const first = M.lessonPlacementGroups('T');
  first[0].actions.push('bad'); first[0].placements[0].cells[0][0] = 999;
  const next = M.lessonPlacementGroups('T');
  assert.ok(next.every(group => !group.actions.includes('bad')));
  assert.ok(next.every(group => group.placements.every(p => p.cells.every(([x]) => x < 10))));
  assert.throws(() => M.lessonPlacementGroups('bad'), RangeError);
});

function verifyTarget(piece, target, settings) {
  assert.equal(target.type, piece);
  const optimum = E.finesseFor(piece, target.cells, settings);
  assert.ok(optimum); assert.equal(target.count, optimum.count);
  assert.equal(target.key, E.cellsKey(target.cells));
  return optimum;
}
function replayVariant(variant, settings) {
  const board = new E.Board(); let state = E.spawnPiece(variant.piece);
  for (const action of variant.sequence) { state = E.applyAction(board, state, action, settings); assert.ok(state); }
  assert.equal(E.cellsKey(E.cells(E.hardDrop(board, state))), variant.target.key);
  assert.equal(variant.finish, 'hardDrop');
  assert.equal(variant.inputCount, variant.sequence.length);
}

test('tutorial has exactly the SPEC order and complete serializable steps, both rotation settings', () => {
  for (const allow180 of [true, false]) {
    const lessons = M.createLessons({ allow180 });
    assert.equal(lessons.length, 12);
    assert.deepEqual(lessons.map(step => step.id), ['finesse', 'das', 'rotation', 'irs-ihs',
      'piece-I', 'piece-O', 'piece-T', 'piece-L', 'piece-J', 'piece-S', 'piece-Z', 'summary']);
    assert.equal(JSON.stringify(lessons), JSON.stringify(JSON.parse(JSON.stringify(lessons))));
    for (const step of lessons) {
      assert.ok(step.title.length > 0); assert.ok(M.EXPRESSIONS.includes(step.expression));
      assert.ok(step.lines.length >= 3); step.lines.forEach(line => assert.equal(typeof line, 'string'));
      assert.equal(typeof step.demo.type, 'string'); assert.ok(E.PIECE_TYPES.includes(step.demo.piece));
      assert.ok(step.tryIt.hints && step.tryIt.requireOptimal);
      assert.ok(step.tryIt.targets.length >= 1);
      assert.equal(step.demo.settings.allow180, allow180);
      for (const target of step.tryIt.targets) verifyTarget(step.tryIt.piece, target, step.tryIt.settings);
      if (step.demo.sequence) replayVariant(step.demo, step.demo.settings);
      for (const variant of step.demo.variants || []) if (!variant.buffered) replayVariant(variant, step.demo.settings);
      if (step.id.startsWith('piece-')) {
        assert.equal(step.demo.examples.length, 3); assert.equal(step.tryIt.targets.length, 3);
        assert.equal(new Set(step.tryIt.targets.map(t => t.key)).size, 3);
        const keys = step.demo.placementGroups.flatMap(g => g.placements).map(p => p.key).sort();
        assert.deepEqual(keys, E.allPlacements(step.demo.piece, { allow180 }).map(p => p.key).sort());
        for (const variant of step.demo.examples) replayVariant(variant, step.demo.settings);
      }
    }
    assert.equal(lessons[11].next, 'drill');
    assert.ok(Object.isFrozen(lessons[4].demo.placementGroups[0].placements[0].cells[0]));
    if (!allow180) assert.ok(!JSON.stringify(lessons.map(s => s.demo)).includes('"rotate180"'));
  }
});

test('DAS comparison actually reaches the same target with four taps versus one hold', () => {
  const variants = M.LESSONS[1].demo.variants;
  assert.equal(variants[0].target.key, variants[1].target.key);
  assert.deepEqual(variants.map(v => v.inputCount), [4, 1]);
});

test('IRS and IHS lesson demos replay using the real InputHandler and ARE, including input counts', () => {
  const demo = M.LESSONS[3].demo;
  for (const variant of demo.variants) {
    const handler = new E.InputHandler({ time: 0, autoNext: false, settings: demo.settings,
      pieceProvider: () => variant.nextPiece || variant.piece });
    handler.heldPiece = variant.heldPiece || null;
    handler.scheduleSpawn(variant.piece, 0);
    for (const buffered of variant.buffered) {
      assert.equal(buffered.during, 'are'); assert.equal(buffered.holdThroughSpawn, true);
      handler.keyDown(buffered.action, 100);
    }
    handler.update(demo.settings.are - 1); assert.equal(handler.active, null);
    handler.update(demo.settings.are);
    assert.equal(handler.inputCount, variant.inputCount);
    assert.equal(E.cellsKey(E.cells(E.hardDrop(handler.board, handler.active))), variant.target.key);
    if (variant.type === 'irs') assert.ok(handler.inputs[0].irs);
    else { assert.ok(handler.flags.ihs); assert.equal(handler.heldPiece, variant.piece); }
  }
});

test('preview tool writes all five inline SVGs with no external resources at the repository path', () => {
  const { renderMascotPreview } = require('../tools/render-mascot.js');
  const outputPath = renderMascotPreview();
  assert.equal(outputPath, path.resolve(__dirname, '../screens/mascot-preview.html'));
  const preview = fs.readFileSync(outputPath, 'utf8');
  assert.equal((preview.match(/<svg\b/g) || []).length, 5);
  assert.match(preview, /<html lang="ja">/);
  assert.ok(!/<(?:link|script|img|iframe)\b/i.test(preview));
  assert.ok(!/\b(?:src|href)\s*=|@import|url\((?!#)/i.test(preview));
  for (const expression of M.EXPRESSIONS) assert.ok(preview.includes(`data-expression="${expression}"`));
});
