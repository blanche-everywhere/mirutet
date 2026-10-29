/* Offline UI. Engine time, keyboard time and animation time all use the same
 * performance.now() clock. No OS repeats, DOM coordinates or frame counts enter
 * the rules engine. Debug helpers choose targets; they never manufacture locks.
 */
(function () {
  'use strict';
  const E = globalThis.MiruTet, M = E.mascot, A = globalThis.MiruTetAudio;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const copy = value => JSON.parse(JSON.stringify(value));
  const now = () => performance.now();
  const STORAGE = 'mirutet-finesse.v1';
  // Legacy v1 key, used only to migrate existing profiles to the new series name.
  const LEGACY_STORAGE = 'moetet-finesse.v1';
  const DEFAULT_KEYS = {
    left: ['ArrowLeft'], right: ['ArrowRight'], softDrop: ['ArrowDown'], hardDrop: ['Space'],
    cw: ['ArrowUp', 'KeyX'], ccw: ['KeyZ'], rotate180: ['KeyA'], hold: ['ShiftLeft', 'KeyC'],
    retry: ['KeyR'], pause: ['Escape'], skip: ['KeyN'], settings: ['Comma'], hint: ['KeyH']
  };
  const ACTION_NAMES = { left: '左へ', right: '右へ', softDrop: 'ソフトドロップ', hardDrop: 'ハードドロップ',
    cw: '右回転 CW', ccw: '左回転 CCW', rotate180: '180°回転', hold: 'ホールド', retry: 'リトライ / 再スタート',
    pause: '一時停止', skip: '次の目標', settings: '設定を開く', hint: 'ヒント切替' };
  const UI_DEFAULTS = { zeroFault: false, repeatOnFault: false, repeatOnMiss: true, showTarget: true,
    showOptimal: true, showKeys: true, ghost: true, sound: true, volume: .3, bubbles: true,
    pieceCueTiming: 'next', pieceCueVolume: 60,
    hairSkin: M.DEFAULT_HAIR_SKIN, outfitSkin: M.DEFAULT_OUTFIT_SKIN };
  const PRACTICE_DEFAULTS = { pieces: [...E.PIECE_TYPES], area: 'all', minColumn: 1, maxColumn: 10, weakSpot: false };
  const HANDLING = [
    { key: 'das', title: 'DAS', note: '長押しの待ち時間 ms', unit: 'ms', step: 1,
      help: 'Delayed Auto Shift：横キーを長押ししたとき、自動で連続移動が始まるまでの待ち時間' },
    { key: 'arr', title: 'ARR', note: '連続移動の間隔 ms', unit: 'ms', step: 1,
      help: 'Auto Repeat Rate：DASの待ち時間の後、横に1マスずつ移動する間隔。0なら壁まで一気に移動します' },
    { key: 'sdf', title: 'SDF', note: 'ソフト落下倍率 / 41 = ∞', unit: '×', step: 1,
      help: 'Soft Drop Factor：下キーを押している間の落下速度の倍率。重力0では毎秒1マスを基準にし、41（∞）なら固定せず床まで落ちます' },
    { key: 'dcd', title: 'DCD', note: '自動移動の待機 ms', unit: 'ms', step: 1,
      help: 'DAS Cut Delay：ミノの出現・回転・落下固定の後、自動の横移動だけを待たせる時間。横キーを押した直後の1マス移動は待ちません' },
    { key: 'are', title: 'ARE', note: '次の出現まで ms', unit: 'ms', step: 1,
      help: 'ARE（出現待ち時間）：ミノを固定してから次のミノが出現するまでの時間' },
    { key: 'gravity', title: '重力 G', note: 'マス/フレーム · 0：練習はなし／フリーは毎秒1マス', unit: 'G', step: .1,
      help: 'ミノが自然に落ちる速さ。1Gは1フレーム（1/60秒）に1マス。0なら練習では落下せず、フリーモードでは毎秒1マス落ちます' },
    { key: 'lockDelay', title: 'ロックディレイ', note: '接地後に自動固定 ms · 移動・回転で15回まで延長', unit: 'ms', step: 10,
      help: 'ミノが接地してから自動で固定されるまでの時間。接地中の移動・回転で15回まで延長できます。オフの間は適用されません' }
  ];
  // Both settings views and their accessible descriptions use these texts.
  const SETTING_HELP = Object.freeze({
    ...Object.fromEntries(HANDLING.map(field => [field.key, field.help])),
    lockDelayOn: '接地後にミノを自動で固定する機能のオン・オフ。オフではハードドロップで固定します',
    irs: 'Initial Rotation System：出現前から回転キーを押しておくと、次のミノが回転した状態で出現します',
    ihs: 'Initial Hold System：次のミノの出現待ち中にホールドを入力すると、出現時にホールドします',
    allow180: '1回のキー入力でミノを180度回転できるようにします',
    ghost: 'ハードドロップしたときの着地位置を影で表示します',
    showKeys: '操作キーや手順をキーキャップの形で表示します',
    sound: '操作・判定の効果音と、ミノを知らせる音を鳴らします',
    bubbles: '練習中にミルフィのアドバイスや応援の吹き出しを表示します',
    volume: '効果音とミノを知らせる音に共通の全体音量を調整します',
    pieceCueTiming: 'ミノの出現時に、NEXTの先頭または現在のミノを音で知らせます。オフでは自動で鳴りません',
    pieceCueVolume: 'ミノを知らせる音の音量を調整します。全体の音量と効果音のオン・オフも反映されます',
    zeroFault: '最短入力で成功した配置だけで練習を進めます。余分な入力があると同じ目標に再挑戦します',
    repeatOnFault: '目標どおりに置けても入力が最短より多かったとき、同じ目標に再挑戦します',
    repeatOnMiss: '目標と違う場所に置いたとき、同じ目標に再挑戦します',
    showTarget: '練習でミノを置く目標の位置と向きを、破線の輪郭で表示します',
    showOptimal: 'ヒントや判定結果に、最少の入力回数で置ける操作手順を表示します',
    hairSkin: 'ミルフィの前髪を選びます。選んだ見た目はすべての画面に反映されます',
    outfitSkin: 'ミルフィの衣装を選びます。選んだ見た目はすべての画面に反映されます'
  });
  const numericDrafts = new WeakSet();
  let settings = { ...E.DEFAULT_SETTINGS }, ui = { ...UI_DEFAULTS }, bindings = copy(DEFAULT_KEYS);
  // 60 Hz reference timings, rounded to the editor's millisecond resolution.
  // Only researched, supported fields are patched; other preferences survive.
  const HANDLING_PRESETS = {
    ppt2: { arr: 33, are: 117, irs: false, ihs: false, allow180: false },
    tec: { arr: 33, are: 100, irs: true, ihs: true, allow180: false },
    tgm3: { are: 67, irs: true, ihs: true, allow180: false }
  };
  function presetsHTML() {
    return `<div class="handling-presets" role="group" aria-label="近い設定"><span>近い設定</span>${[['ppt2', 'PPT2'], ['tec', 'TEC'], ['tgm3', 'TGM3']].map(([key, label]) => `<button class="small" data-act="handling-preset" data-preset="${key}">${label}</button>`).join('')}<button class="small" data-act="reset-handling">既定値</button></div><details class="preset-notes"><summary>プリセットについて</summary><p>対応する既知の項目だけを変更します。ほかの値は保持し、適用後も調整できます。完全再現ではありません。1F＝1/60秒としてmsに丸めています。</p><p>PPT2：ARR 2F・ARE 7Fはコミュニティ計測。IRS/IHSなしは過去の検証版に基づきます。<br>TEC：ARR 2Fは公式サイトのコミュニティガイド、ARE 約6FはMaster限定の報告です。<br>TGM3：ARE 4FはMaster最速時の参考定数です。TEC・TGM3はIRS/IHSあり。いずれも1入力180度回転なし。</p></details>`;
  }
  let practice = copy(PRACTICE_DEFAULTS), progress = { current: 0, completed: [] };
  let totalStats = new E.Stats(), storageOK = true;
  let spinProgress = E.normalizeSpinProgress(), spinStats = new E.Stats();

  // Import and disk loading share strict validation. A malformed import never
  // partially updates preferences or steals a binding from another action.
  function validatePreferences(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSONの形式を確認してください。');
    const result = { settings: E.normalizeSettings(data.settings || {}), ui: { ...UI_DEFAULTS }, bindings: copy(DEFAULT_KEYS) };
    for (const key of Object.keys(UI_DEFAULTS)) if (data.ui && key in data.ui) {
      const value = data.ui[key];
      if (key === 'hairSkin') {
        // Unknown cosmetic values never discard an otherwise valid saved profile.
        result.ui.hairSkin = M.normalizeHairSkin(value);
      } else if (key === 'outfitSkin') {
        result.ui.outfitSkin = M.normalizeOutfitSkin(value);
      } else if (key === 'pieceCueTiming') {
        if (!['next', 'current', 'off'].includes(value)) throw new Error('ミノの音は NEXT・現在のミノ・オフから選んでください。');
        result.ui[key] = value;
      } else if (key === 'volume' || key === 'pieceCueVolume') {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('音量は数値にしてください。');
        result.ui[key] = Math.max(0, Math.min(key === 'volume' ? 1 : 100, value));
      } else {
        if (typeof value !== 'boolean') throw new Error(key + ' は true / false にしてください。');
        result.ui[key] = value;
      }
    }
    if (data.bindings) result.bindings = E.validateBindings(data.bindings);
    return result;
  }
  try {
    let raw = localStorage.getItem(STORAGE);
    if (raw === null) {
      raw = localStorage.getItem(LEGACY_STORAGE);
      if (raw !== null) {
        try {
          localStorage.setItem(STORAGE, raw);
          localStorage.removeItem(LEGACY_STORAGE);
        } catch (_) { storageOK = false; }
      }
    }
    if (raw) {
      const saved = JSON.parse(raw), checked = validatePreferences(saved);
      ({ settings, ui, bindings } = checked);
      totalStats = new E.Stats(saved.stats);
      spinProgress = E.normalizeSpinProgress(saved.spin); spinStats = new E.Stats(saved.spin?.stats);
      if (saved.practice) {
        const p = saved.practice;
        if (Array.isArray(p.pieces) && p.pieces.length && p.pieces.every(t => E.PIECE_TYPES.includes(t))) practice.pieces = [...new Set(p.pieces)];
        if (['all', 'left', 'center', 'right', 'custom'].includes(p.area)) practice.area = p.area;
        for (const key of ['minColumn', 'maxColumn']) if (Number.isInteger(p[key])) practice[key] = Math.max(1, Math.min(10, p[key]));
        if (practice.minColumn > practice.maxColumn) practice.maxColumn = practice.minColumn;
        practice.weakSpot = p.weakSpot === true;
      }
      if (saved.progress) {
        progress.current = Math.max(0, Math.min(11, Number(saved.progress.current) || 0)) | 0;
        progress.completed = (Array.isArray(saved.progress.completed) ? saved.progress.completed : []).filter(i => Number.isInteger(i) && i >= 0 && i < 12);
      }
      // Persist defaults added during loading before the first user action.
      // Keep a failed migration's error state and recovery copies intact.
      if (storageOK) save();
    }
  } catch (_) { storageOK = false; }
  function save() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ version: 1, settings, ui, bindings, practice, progress, stats: totalStats.toJSON(), spin: { ...spinProgress, stats: spinStats.toJSON() } }));
      storageOK = true;
    } catch (_) { storageOK = false; }
  }
  let screen = 'menu', session = null, demo = null, lessonIndex = progress.current;
  let menuMode = 'finesse';
  const isFree = () => session instanceof E.FreeSession;
  const isSpin = () => session instanceof E.SpinSession;
  let lessons = M.createLessons(settings), tryMode = false, tryIndex = 0, tryDone = false;
  let lessonMessage = '', sessionEventQueue = [], trace = [], irsUntil = 0, irsCount = 0;
  let hint = false, lastResult = null, resultActions = [];
  let expression = 'normal', bubble = '', tipIndex = 0, particles = [];
  let feedbackAt = 0, lastTipAttempt = 0;
  let gameOverInputUntil = 0;
  let handlingOpen = false;
  let settingsReturn = 'menu', capture = null, toastUntil = 0, lastHUD = 0, sprintResult = null;
  let demoVariant = 0, selectedDemo = null, lastQueue = '', statsScope = 'total';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const app = $('#app');

  let hoveredHelp = null, focusedHelp = null, tappedHelp = null, activeHelp = null, helpHideTimer = null;
  const helpOwner = node => node?.closest?.('[data-setting-help]') || null;
  function settingTooltipsHTML(content) {
    const keys = new Set([...content.matchAll(/(?:data-setting|data-engine-toggle|data-ui)="([^"]+)"/g)].map(match => match[1]));
    if (content.includes('data-hair-skin>')) keys.add('hairSkin');
    if (content.includes('data-outfit-skin>')) keys.add('outfitSkin');
    return [...keys].filter(key => SETTING_HELP[key]).map(key => `<div id="setting-help-${key}" class="setting-tooltip" role="tooltip" hidden>${escape(SETTING_HELP[key])}</div>`).join('');
  }
  function setupSettingHelp() {
    for (const control of $$('input[data-setting],input[data-engine-toggle],input[data-ui],select[data-ui],select[data-hair-skin],select[data-outfit-skin]')) {
      const key = control.dataset.setting || control.dataset.engineToggle || control.dataset.ui ||
        (control.hasAttribute('data-hair-skin') ? 'hairSkin' : 'outfitSkin');
      if (!SETTING_HELP[key]) continue;
      const owner = control.type === 'checkbox' ? control.closest('label') : control.closest('.setting-row,.handling-stepper');
      (owner || control).dataset.settingHelp = key;
      if (control.id) {
        const label = $(`label[for="${control.id}"]`);
        if (label) label.dataset.settingHelp = key;
      }
    }
    for (const owner of $$('[data-setting-help]')) {
      for (const target of [owner, ...$$('input,select,button', owner)]) {
        if (helpOwner(target) !== owner) continue;
        const ids = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        ids.add(`setting-help-${owner.dataset.settingHelp}`);
        target.setAttribute('aria-describedby', [...ids].join(' '));
      }
    }
  }
  function updateSettingTooltip() {
    if (helpHideTimer !== null) { clearTimeout(helpHideTimer); helpHideTimer = null; }
    const owner = hoveredHelp || tappedHelp || focusedHelp;
    const tooltip = owner?.isConnected ? $(`#setting-help-${owner.dataset.settingHelp}`) : null;
    if (activeHelp && activeHelp !== tooltip) activeHelp.hidden = true;
    activeHelp = tooltip;
    if (!tooltip) return;
    tooltip.hidden = false;
    const anchor = (owner.closest('.setting-row,.handling-stepper') || owner).getBoundingClientRect(), box = tooltip.getBoundingClientRect();
    // Prefer spare space beside the row so help does not mask nearby controls.
    const side = anchor.right + box.width + 16 <= window.innerWidth ? 'right' : anchor.left >= box.width + 16 ? 'left' : null;
    const left = side === 'right' ? anchor.right + 8 : side === 'left' ? anchor.left - box.width - 8 : anchor.left;
    tooltip.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`;
    const top = side ? anchor.top : anchor.top >= box.height + 16 ? anchor.top - box.height - 8 : anchor.bottom + 8;
    tooltip.style.top = `${Math.max(8, Math.min(top, window.innerHeight - box.height - 8))}px`;
  }
  function dismissSettingTooltip() {
    hoveredHelp = focusedHelp = tappedHelp = null;
    updateSettingTooltip();
  }
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    if (event.target.closest?.('.setting-tooltip')) {
      if (helpHideTimer !== null) { clearTimeout(helpHideTimer); helpHideTimer = null; }
      return;
    }
    hoveredHelp = helpOwner(event.target);
    updateSettingTooltip();
  });
  document.addEventListener('pointerout', event => {
    if (event.pointerType === 'touch' || event.relatedTarget?.closest?.('.setting-tooltip')) return;
    hoveredHelp = helpOwner(event.relatedTarget);
    // Keep the tooltip hoverable across the small gap from its setting row.
    if (helpHideTimer !== null) clearTimeout(helpHideTimer);
    helpHideTimer = setTimeout(updateSettingTooltip, 120);
  });

  function friendly(code) {
    const labels = { ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓', ArrowUp: '↑', Space: 'Space',
      ShiftLeft: 'Shift(左)', ShiftRight: 'Shift(右)', ControlLeft: 'Ctrl(左)', ControlRight: 'Ctrl(右)',
      AltLeft: 'Alt(左)', AltRight: 'Alt(右)', Escape: 'Esc', Comma: ',', Period: '.', Enter: 'Enter',
      Backspace: 'BS', Backquote: '`', Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=' };
    return labels[code] || code.replace(/^Key|^Digit/, '');
  }
  function actionLabel(action) {
    if (action === 'floor') return friendly(bindings.softDrop[0]) + ' 床まで';
    if (action === 'softDrop' && isSpin()) return friendly(bindings.softDrop[0]) + ' 1マス';
    const base = action === 'dasLeft' ? 'left' : action === 'dasRight' ? 'right' : action;
    const key = friendly(bindings[base]?.[0] || action);
    return key + (action.startsWith('das') ? ' 長押し' : ['cw', 'ccw', 'rotate180'].includes(action) ? ' ' + E.ACTION_LABELS[action] : '');
  }
  function route(actions, pressed = '') {
    if (!actions?.length) return '<span class="empty-route">そのまま ' + escape(friendly(bindings.hardDrop[0])) + ' ↓</span>';
    return actions.map((action, i) => (i ? '<span class="arrow">›</span>' : '') +
      `<kbd data-key-action="${action}" class="${pressed === action ? 'pressed' : ''}">${escape(actionLabel(action))}</kbd>`).join('');
  }
  function actualRoute(inputs) { return inputs.map(input => input.slide ? input.action === 'left' ? 'dasLeft' : 'dasRight' : input.action); }
  function timeText(ms) {
    const seconds = ms / 1000;
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
  }
  function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); toastUntil = now() + 3000; }
  function dismissToast() { $('#toast').classList.remove('visible'); toastUntil = 0; }
  function pick(lines) { return lines[Math.floor(Math.random() * lines.length)]; }
  function mascot(expr = 'normal', prefix = 'app') { return M.mascotSVG(expr, { idPrefix: prefix, hairSkin: ui.hairSkin, outfitSkin: ui.outfitSkin }); }
  function speech(text, id = '') { return `<div class="speech" ${id ? `id="${id}"` : ''}><span class="speaker">ミルフィ</span><span class="bubble-text">${escape(text)}</span></div>`; }
  function setCoach(text, expr = 'normal') {
    bubble = text; expression = expr;
    const target = $('#coach-speech .bubble-text');
    if (target) target.textContent = ui.bubbles || screen === 'tutorial' ? text : 'ミルフィが応援中です♪';
    const portrait = $('#coach-mascot');
    if (portrait && portrait.dataset.expression !== expr) {
      portrait.innerHTML = mascot(expr, 'coach'); portrait.dataset.expression = expr;
    }
  }

  const audio = A.createAudioEngine(() => ui);
  const sound = kind => audio.sound(kind);
  function comboHTML() {
    return '<div class="finesse-combo"><div id="combo-display" class="combo-display" aria-live="off" data-count="0" data-tier="0" hidden></div><span id="combo-announcement" class="combo-announcement" role="status" aria-live="polite" aria-atomic="true"></span></div>';
  }
  function updateCombo(combo = session?.combo.snapshot(), animate = false) {
    const display = $('#combo-display'); if (!display) return;
    const count = combo?.count || 0, tier = combo?.tier || 0, hidden = count < 2;
    const announcement = $('#combo-announcement');
    if (hidden) {
      audio.stopCombo();
      if (announcement?.textContent) announcement.textContent = '';
      if (Object.values(M.COMBO_LINES).some(lines => lines.includes(bubble))) setCoach(isFree() ? 'あなたのペースで大丈夫ですっ♪' : pick(M.ENCOURAGEMENT_LINES));
    }
    // A judged lock also queues a target event. Reuse this view on that event,
    // skips and other target changes rather than rewriting an unchanged count.
    if (display.dataset.count === String(count) && display.dataset.tier === String(tier) && display.hidden === hidden) return;
    display.dataset.count = count; display.dataset.tier = tier; display.hidden = hidden;
    if (hidden) {
      if (display.textContent) display.textContent = '';
      return;
    }
    display.innerHTML = `<strong>${count}</strong><span> COMBO</span>`;
    // Only a new judged milestone speaks; rendering/target events never do.
    if (animate && combo.milestone && announcement) announcement.textContent = `${combo.milestone} COMBO`;
    if (animate && !reducedMotion) {
      display.classList.remove('pop');
      void display.offsetWidth;
      display.classList.add('pop');
    }
  }
  function resetCombo() {
    session?.combo.reset(); audio.stopCombo(); updateCombo();
  }
  // Unlock on the gesture itself, before an ARE timer or a preview's click.
  document.addEventListener('pointerdown', event => {
    audio.unlock();
    if (event.target.closest?.('.setting-tooltip')) return;
    const owner = helpOwner(event.target);
    if (event.pointerType === 'touch') tappedHelp = owner;
    if (!owner) dismissSettingTooltip();
    else updateSettingTooltip();
  }, { passive: true });
  function header() {
    const brand = '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>ミルテト</span>';
    if (screen === 'menu') return `<header class="topbar"><div class="brand">${brand}</div></header>`;
    return `<header class="topbar"><button class="brand brand-button" data-act="menu" aria-label="タイトルへ">${brand}</button><div class="top-actions"><button class="quiet small" data-act="menu">タイトルへ</button>${screen !== 'dressup' ? '<button class="quiet small" data-act="dressup">きせかえ</button>' : ''}<button class="small" data-act="settings">設定 <span class="tiny">${escape(friendly(bindings.settings[0]))}</span></button></div></header>`;
  }
  function footer() { return '<footer class="footer"><span>ミルテト学園 · 小さな一手で、もっと楽しく。</span><span>ORIGINAL ART & SYNTHESIZED SOUND · NO NETWORK</span></footer>'; }

  // Dress-up choices use existing saved cosmetic IDs; expressions stay local.
  let dressupReturn = 'menu', dressupFace = 'normal', dressupPaused = reducedMotion;
  const dressupHairNames = {side:'そよ風サイド',center:'おすましセンター',intake:'ふんわりフェザー'},dressupHairHints={side:'7:3でふんわり横流し',center:'真ん中分けのやさしいカーブ',intake:'控えめインテークの立体感'},dressupOutfitNames={uniform:'放課後フィネス',cape:'月夜のワルツ'},dressupFaceNames={normal:'いつもの',happy:'にっこり',surprised:'びっくり',thinking:'考え中',sorry:'しょんぼり'};
  function dressupStorageText() { return storageOK ? '髪型と衣装は自動保存されます。' : '保存できないため、この起動中だけ選択を保持します。'; }
  function dressupCombination() { return dressupHairNames[ui.hairSkin] + ' × ' + dressupOutfitNames[ui.outfitSkin]; }
  function dressupAvatar() { return M.mascotSVG(dressupFace, {idPrefix:'dressup', hairSkin:ui.hairSkin, outfitSkin:ui.outfitSkin, halo:false}); }
  function dressupChoices(kind) {
    const names = kind === 'hair' ? dressupHairNames : dressupOutfitNames;
    return Object.entries(names).map(([value, label]) => {
      const opts = { hairSkin: kind === 'hair' ? value : 'center', outfitSkin: kind === 'outfit' ? value : 'uniform', animated:false, halo:false, idPrefix:'dressup-thumb' };
      const crop = kind === 'hair' ? '58 13 184 151' : '65 225 170 103';
      const thumb = M.mascotSVG('normal',opts).replace('viewBox="0 0 300 328"',`viewBox="${crop}"`).replace('role="img"','role="img" aria-hidden="true"');
      const selected = value === ui[kind === 'hair' ? 'hairSkin' : 'outfitSkin'];
      const hint = kind === 'hair' ? dressupHairHints[value] : value === 'uniform' ? 'やさしい桃色の制服' : '黒いケープと細いレース';
      return `<button class="choice ${kind === 'outfit' ? 'outfit-choice' : ''}" data-act="dressup-select" data-kind="${kind}" data-value="${value}" aria-pressed="${selected}"><span class="tick" aria-hidden="true">✓</span><span class="thumb">${thumb}</span><span><strong>${label}</strong><small>${hint}</small></span></button>`;
    }).join('');
  }
  function dressupFaces() { return Object.entries(dressupFaceNames).map(([value,label]) => `<button class="expression" data-act="dressup-face" data-value="${value}" aria-pressed="${value === dressupFace}">${label}</button>`).join(''); }
  function dressupMotion() {
    $('#avatar')?.getAnimations({subtree:true}).forEach(a => dressupPaused ? a.pause() : a.play());
    const button = $('#motion'); if(button) { button.textContent = dressupPaused ? '▷ 動きを再開' : 'Ⅱ 動きを止める'; button.setAttribute('aria-pressed',String(dressupPaused)); }
  }
  function updateDressup() {
    $('#avatar').innerHTML = dressupAvatar(); $('#combination').textContent = dressupCombination();
    $$('.dressup-page [data-act="dressup-select"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value === ui[b.dataset.kind === 'hair' ? 'hairSkin' : 'outfitSkin'])));
    $$('.dressup-page [data-act="dressup-face"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value === dressupFace)));
    $('#dressup-storage').textContent = dressupStorageText();
    $('#dressup-status').textContent = dressupCombination() + '、' + dressupFaceNames[dressupFace];
    dressupMotion();
  }
  function dressupHTML() { return `<main class="dressup-page"><div class="heading"><button class="quiet" data-act="close-dressup">← 戻る</button><div><p class="eyebrow">A LITTLE MOMENT WITH MIRUFI</p><h1 tabindex="-1" id="room-title">ミルフィのきせかえルーム</h1><p class="subtitle">今日は、どんなミルフィに会いたい？</p></div><div class="session" id="dressup-storage" role="status">${dressupStorageText()}</div></div><div class="room">
<section class="panel" aria-labelledby="hair-title"><div class="panel-head"><span class="number">01</span><h2 id="hair-title">ヘアスタイル</h2><small>HAIR</small></div><div class="choices" id="hair-choices">${dressupChoices("hair")}</div><p class="hint">ふんわり流しても、すっきり分けても。好きな雰囲気を選んでね。</p></section>
<section class="center" aria-label="ミルフィの試着"><div class="portrait"><span class="room-label">MIRUFI'S LITTLE WARDROBE</span><span class="spark" aria-hidden="true">✧</span><span class="spark second" aria-hidden="true">✧</span><div id="avatar" class="avatar">${dressupAvatar()}</div><div class="floor"></div><div class="outfit-name" id="combination">${dressupCombination()}</div></div><p class="speech" id="speech">「いっしょに、お気に入りを見つけよう？」</p><div class="expressions" id="expressions" aria-label="表情を試す">${dressupFaces()}</div><button id="motion" data-act="dressup-motion" class="motion" aria-pressed="false">Ⅱ 動きを止める</button></section>
<section class="panel" aria-labelledby="outfit-title"><div class="panel-head"><span class="number">02</span><h2 id="outfit-title">お洋服</h2><small>OUTFIT</small></div><div class="choices" id="outfit-choices">${dressupChoices("outfit")}</div><p class="hint">いつもの制服と、ちょっと特別な黒ケープ。髪型との組み合わせも自由に。</p></section>
</div><footer class="footer"><span>選ぶたびにその場でお着替え。表情も自由に試せます。</span><span>髪型と衣装はゲームにも反映されます。試し表情はこの部屋だけ。</span></footer><div id="dressup-status" class="status" role="status" aria-live="polite"></div></main>`; }
  function openDressup() {
    if(screen === 'dressup') return;
    if(screen === 'settings' && settingsReturn === 'dressup') { closeSettings(); return; }
    dressupReturn = screen; dressupFace = 'normal'; resetCombo(); pauseSession(); demo = null;
    screen = 'dressup'; window.scrollTo(0,0); render();
  }
  function closeDressup() {
    screen = dressupReturn; window.scrollTo(0,0); render();
    // Returning to an active lesson/drill keeps the existing pause overlay.
  }

  function menuArtHTML() {
    return `<section class="menu-art">${speech(M.WELCOME_LINES[0] + '\nわたしと、少しずつ練習しましょうね。')}<div class="mascot-wrap">${mascot('normal', 'menu')}</div><span class="float-block" aria-hidden="true"></span><span class="float-block two" aria-hidden="true"></span><p class="mascot-caption">YOUR PRACTICE COMPANION / ミルフィ</p></section>`;
  }
  function menuHeroHTML() {
    // build.js embeds the WebP here; direct-source Node tests can keep the token.
    const greeting = speech('おかえりなさいっ♪ 今日は何を練習しましょうか？').replace('♪ ', '♪<br>');
    return `<section class="menu-art menu-hero">${greeting}<img class="mirufi mirufi-hero" src="__MIRUFI_HERO_WAVE_SRC__" width="544" height="816" alt="手を振るミルフィ"><p class="mascot-caption">YOUR PRACTICE COMPANION / ミルフィ</p></section>`;
  }
  function menuMinoHTML(type) {
    const cells = E.SHAPES[type][0], size = 24, inset = 2;
    const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // Engine coordinates are y-up; SVG coordinates are y-down.
    return `<svg class="category-tetromino" data-mino="${type}" viewBox="0 0 ${(maxX - minX + 1) * size + inset * 2} ${(maxY - minY + 1) * size + inset * 2}" aria-hidden="true" focusable="false">${cells.map(([x, y]) => `<rect x="${(x - minX) * size + inset}" y="${(maxY - y) * size + inset}" width="${size}" height="${size}" rx="1" fill="${E.COLORS[type]}" stroke="#28263F" stroke-width="1.4"/>`).join('')}</svg>`;
  }
  function menuSecondaryIconHTML(act) {
    const paths = {
      dressup: '<path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z"/>',
      records: '<rect x="2" y="14" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="14" rx="1"/><rect x="17" y="2" width="5" height="20" rx="1"/>',
      settings: '<path fill-rule="evenodd" d="m10 2-.7 3-2 .9-2.7-1.5-2 3.4 2.2 2v2.4l-2.2 2 2 3.4 2.7-1.5 2 .9.7 3h4l.7-3 2-.9 2.7 1.5 2-3.4-2.2-2V9.8l2.2-2-2-3.4-2.7 1.5-2-.9L14 2Zm2 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>'
    };
    return `<svg class="category-symbol" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${paths[act]}</svg>`;
  }
  function menuHTML() {
    const entries = [
      ['mode-free', 'フリー', '自由に積んでラインを消そう'],
      ['mode-finesse', 'フィネス', '最短の操作をレッスンとドリルで'],
      ['mode-spin', '回転入れ', 'くぼみへ回して入れる練習をしよう'],
      ['dressup', 'きせかえ', '髪型と衣装を選ぶ'],
      ['records', '記録', '成績と進捗を見る'],
      ['settings', '設定', '操作や音を整える']
    ];
    return `<main class="menu menu-home"><section class="menu-copy"><div class="eyebrow">ブロック配置トレーニングゲーム</div><h1 class="logo">ミル<span>テト</span></h1><nav class="home-categories" aria-label="メインメニュー">${entries.map(([act, label, description], i) => `<button class="category-card ${i < 3 ? 'category-practice' : 'category-secondary'}" data-act="${act}"><span><b>${label}</b><small>${description}</small></span>${i < 3 ? `<span class="category-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="category-mino" aria-hidden="true">${menuMinoHTML(['O', 'I', 'T'][i])}</span><span class="category-icon" aria-hidden="true">→</span>` : `${menuSecondaryIconHTML(act)}<span class="category-chevron" aria-hidden="true">›</span>`}</button>`).join('')}</nav><p class="tiny menu-shortcuts">↑ ↓ ← → で選ぶ · Enter で決定</p></section>${menuHeroHTML()}</main>${footer()}`;
  }
  function practiceCategoryHTML() {
    const free = screen === 'free';
    const buttons = free ? [['free', 'はじめる', '自由に積んで、あなたのペースで。']] : [
      ['tutorial', 'はじめてのレッスン', '実演を見て、最短操作を少しずつ。'],
      ['lessons', 'レッスン一覧', '全12レッスンを好きなところから。'],
      ['drill', 'ドリル', 'ミノとエリアを選んで、繰り返し練習。'],
      ['sprint', 'スプリント', '40・100・好きな数で自己ベストに挑戦。']
    ];
    const note = free ? '目標数や制限時間なし。ホールドとNEXTを使って遊べます。' :
      progress.completed.length ? `${progress.completed.length} / 12 レッスンのチャレンジを達成しました` : 'はじめての方は、レッスンからどうぞ♪';
    return `<main class="menu category-page"><section class="menu-copy"><div class="eyebrow">${free ? 'FREE PLAY' : 'FINESSE CLASSROOM'}</div><h1 class="category-title">${free ? 'フリー' : 'フィネス'}</h1><p class="menu-intro">${free ? '自由に積んで、ラインを消しましょう。' : '最短の一手を、ミルフィといっしょに。'}</p><nav class="menu-buttons" aria-label="${free ? 'フリー' : 'フィネス'}">${buttons.map(([act, label, description], i) => `<button class="${i === 0 ? 'primary' : ''}" data-act="${act}"><span><b>${label}</b><small>${description}</small></span><span aria-hidden="true">→</span></button>`).join('')}</nav><p class="first-note">✧ ${note}</p><p class="tiny menu-shortcuts">↑ ↓ ← → で選ぶ · Enter で決定 · Esc でタイトルへ</p></section>${menuArtHTML()}</main>${footer()}`;
  }
  function mini(type, extra = '') { return `<canvas class="mini-piece" data-piece="${type || ''}" width="144" height="108" aria-label="${type || '空'}ミノ" ${extra}></canvas>`; }
  function boardHTML() {
    return `<div class="board-heading"><span>出現 / 21–22行</span><span>10 × 20</span></div><div class="board-shell"><canvas id="board" class="board" tabindex="0" role="img" aria-label="フィールド、10列20行と出現2行"></canvas><div id="irs-indicator" class="irs-flash" aria-live="polite">IRS ✧</div><div id="are-bar" class="are-track" role="progressbar" aria-label="出現までの待ち時間" aria-valuemin="0" aria-valuemax="100"><div class="are-fill"></div></div></div><div class="column-labels">${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>`;
  }
  function pieceBars(stats) {
    return E.PIECE_TYPES.map(type => {
      const p = stats.byPiece[type], percent = p.attempts ? 100 * p.faults / p.attempts : 0;
      return `<div class="piece-bar" title="${type}: 試行${p.attempts}回 / フォルト${p.faults}回"><span>${type}</span><div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div><span>${p.faults} / ${p.attempts}</span></div>`;
    }).join('');
  }
  function practiceHTML() {
    return `<section class="panel practice-options"><h3>練習するミノ / エリア</h3><div class="piece-filters">${E.PIECE_TYPES.map(type => `<label class="piece-check"><input type="checkbox" data-piece-filter="${type}" ${practice.pieces.includes(type) ? 'checked' : ''}><span>${type}</span></label>`).join('')}</div><label class="filter-line">列のエリア<select id="area" aria-label="列のエリア">${[['all','すべて'],['left','左 / 1–3列'],['center','中央 / 4–6列'],['right','右 / 7–10列'],['custom','列を指定']].map(([value, label]) => `<option value="${value}" ${practice.area === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${practice.area === 'custom' ? `<div class="filter-line">左端の列 <input id="min-column" aria-label="開始列" type="number" min="1" max="10" value="${practice.minColumn}"> 〜 <input id="max-column" aria-label="終了列" type="number" min="1" max="10" value="${practice.maxColumn}"></div>` : ''}<label class="checkline" style="margin-top:8px"><input data-practice="weakSpot" type="checkbox" ${practice.weakSpot ? 'checked' : ''}>苦手な目標を多めに</label><label class="checkline"><input data-ui="zeroFault" type="checkbox" ${ui.zeroFault ? 'checked' : ''}>ゼロフォルト</label><p class="tiny" style="margin-top:5px">変更後も成績は引き継ぎます</p></section>`;
  }
  function practiceStatsHTML(sprint) {
    return `<section class="panel stats-panel"><div class="row spread panel-label"><span>SESSION / この練習</span><button class="quiet small" style="padding:0" data-act="records-session">全記録 ↗</button></div><div class="stats-main"><div class="stat"><label>連続Perfect</label><strong class="accent" id="streak">0</strong><small> 連続</small></div><div class="stat"><label>フィネス正確率</label><strong id="accuracy">0</strong><small> %</small></div></div><div class="stats-strip"><span>最高 <b id="best-streak">0</b></span><span>PPS <b id="pps">0.00</b></span><span>成功 <b id="completed">0${sprint ? '/' + sprint : ''}</b></span></div>${sprint ? '<div class="sprint-progress"><div id="sprint-progress"></div></div>' : ''}<div class="stats-strip"><span>平均入力 <b id="average">0 / 0</b></span><span>ミス <b id="misses">0</b></span></div></section><section class="panel stats-panel"><div class="panel-label">フォルト / 試行 · ミノ別</div><div id="piece-bars" class="piece-bars">${pieceBars(session.stats)}</div></section>`;
  }
  function freeStatsHTML() {
    return `<section class="panel stats-panel free-stats" aria-label="プレイ記録">${[['lines', 'ライン'], ['pieces', 'ミノ'], ['elapsed', '時間'], ['pps', 'PPS']].map(([id, label]) => `<div class="stat"><label>${label}</label><strong id="${id}">${id === 'elapsed' ? '00:00.00' : id === 'pps' ? '0.00' : '0'}</strong></div>`).join('')}</section>`;
  }
  function freeStatsValues(stats) {
    return { lines: stats.lines, pieces: stats.pieces, elapsed: timeText(stats.elapsed), pps: stats.pps.toFixed(2) };
  }
  // The IRS challenge keeps its ARE window (and IRS) so a rotation can be
  // buffered at all; every other timing is the player's saved handling.
  function challengeOverrides(values) {
    return session?.irsChallengeARE ? { irs: true, are: Math.max(values.are, session.irsChallengeARE) } : {};
  }
  function handlingValue(field) {
    const value = { ...settings, ...challengeOverrides(settings) }[field.key];
    // Imported fractions keep full precision in storage; show a compact value.
    if (field.key === 'lockDelay' && !settings.lockDelayOn) return 'OFF';
    return field.key === 'sdf' && value === 41 ? '∞' : `${Number(value.toFixed(3))} ${field.unit}`;
  }
  // Stepper buttons retain board focus; native editors isolate typing from play.
  function handlingPanelHTML() {
    return `<section class="panel handling-panel" data-live-handling aria-label="プレイ中のゲーム設定" aria-describedby="handling-access"><button class="handling-toggle" data-act="toggle-handling" tabindex="-1" aria-expanded="${handlingOpen}" aria-controls="live-handling-controls">ゲーム設定<span aria-hidden="true">${handlingOpen ? '−' : '＋'}</span></button><span id="handling-access" class="sr-only">入力中はゲームキーを停止。Enterで盤面に戻ります。</span><div id="live-handling-controls" ${handlingOpen ? '' : 'hidden'}>${HANDLING.map(field => `<div class="handling-stepper">${field.key === 'lockDelay' ? toggle('lockDelayOn','ロックディレイ（接地後に自動固定）',true,'ロック') : `<span>${field.key === 'gravity' ? '重力' : field.title}</span>`}<button data-act="adjust-handling" data-handling-key="${field.key}" data-step="-1" tabindex="-1" aria-label="${field.title}を減らす">−</button><output data-handling-value="${field.key}" aria-live="off">${handlingValue(field)}</output><button data-act="adjust-handling" data-handling-key="${field.key}" data-step="1" tabindex="-1" aria-label="${field.title}を増やす">＋</button><input class="live-number" aria-label="${field.title}" data-setting="${field.key}" type="number" min="${E.SETTING_LIMITS[field.key][0]}" max="${E.SETTING_LIMITS[field.key][1]}" step="${field.step}" value="${settings[field.key]}"><input class="live-range" aria-label="${field.title} スライダー" data-setting="${field.key}" type="range" min="${E.SETTING_LIMITS[field.key][0]}" max="${E.SETTING_LIMITS[field.key][1]}" step="${field.step}" value="${settings[field.key]}"></div>`).join('')}</div></section>`;
  }
  function syncHandlingPanel() {
    for (const field of HANDLING) {
      const output = $(`[data-handling-value="${field.key}"]`);
      if (output) output.textContent = handlingValue(field);
      for (const input of $$(`[data-setting="${field.key}"]`)) { numericDrafts.delete(input); input.value = settings[field.key]; }
    }
    for (const input of $$('[data-engine-toggle]')) input.checked = settings[input.dataset.engineToggle];
  }
  function playHTML() {
    const free = isFree(), sprint = session.sprintLength;
    return `<main class="play-page${free ? ' free-play' : ''}">
      <div class="row spread play-topline"><h1 class="play-title">${free ? 'フリーモード' : sprint ? 'スプリント' : 'フィネス・ドリル'}${free ? '' : `<span class="tag">${sprint ? sprint + ' PLACEMENTS' : 'TARGET PRACTICE'}</span>`}</h1><div class="row">${free ? '' : '<span id="sprint-time" class="sprint-time">00:00.00</span>'}<button class="small" data-act="pause">一時停止 ${escape(friendly(bindings.pause[0]))}</button></div></div>
      <div class="play-grid"><aside class="coach">${ui.bubbles ? speech(bubble, 'coach-speech') : ''}<div id="coach-mascot" class="mascot-wrap" data-expression="${expression}">${mascot(expression, 'coach')}</div>${free ? '' : `<div id="practice-wrap">${practiceHTML()}</div>`}</aside>
      <section class="board-stage"><aside class="side-queue"><div class="queue-box"><div class="queue-title">ホールド</div><div id="hold-preview">${mini(null)}</div></div><p id="hold-note" class="hold-note">${session.handler.holdEnabled ? escape(friendly(bindings.hold[0])) + ' で交換<br>固定まで1回' : '1種類の練習では<br>ホールド無効'}</p><div class="key-help">${['left', 'right', 'cw', 'ccw', 'rotate180'].map(a => `<kbd data-live-key="${a}" title="${ACTION_NAMES[a]}">${escape(friendly(bindings[a][0]))}</kbd>`).join('')}</div></aside><div class="board-column">${boardHTML()}<p class="board-note">${free ? '半透明：着地の影' : '破線：目標 · 半透明：着地の影'}</p></div><aside class="side-queue"><div class="queue-box"><div class="queue-title">次の5個</div><div id="next-preview"></div></div><p class="hold-note">${escape(friendly(bindings.hardDrop[0]))}<br>${free ? '固定' : 'ハードドロップ'}</p>${comboHTML()}</aside></section>
      <aside class="right-stack"><div class="play-tools">${handlingPanelHTML()}<div id="play-stats" class="play-stats" ${handlingOpen ? 'hidden' : ''}>${free ? freeStatsHTML() : practiceStatsHTML(sprint)}</div></div><section id="result-panel" class="panel result-panel" aria-live="polite"></section><div class="play-buttons">${free ? `<button data-act="restart">↻ もう一度 ${escape(friendly(bindings.retry[0]))}</button><button data-act="menu">タイトルへ</button>` : `<button data-act="retry">↻ 同じ目標</button><button data-act="hint">✧ ヒント ${escape(friendly(bindings.hint[0]))}</button><button data-act="skip">次の目標 →</button><button data-act="settings">操作の設定</button>`}</div></aside></div>
      <div class="play-footer" id="play-footer"></div></main>`;
  }
  function spinsHTML() {
    return `<main class="page spin-page"><div class="page-heading"><div><div class="eyebrow">SPIN INSERTION PRACTICE</div><h1 class="category-title">回転入れ</h1><p>くぼみへ回して、ぴたり。好きな問題から練習できます。</p></div><div class="row"><span class="tag mint-tag">${spinProgress.completed.length} / ${E.SPIN_DRILLS.length} 達成</span><button class="primary" data-act="spin-continue">ドリルをつづける →</button></div></div><h2 class="spin-list-title">問題一覧</h2><p class="tiny">通算 ${spinStats.perfect} 成功 / ${spinStats.attempts} 試行 · 最後の移動を回転にして固定しましょう。入力回数は自由ですっ。</p><div class="spin-set-list" tabindex="0" aria-label="回転入れの問題一覧">${E.SPIN_SETS.map(set => `<section class="spin-set"><div class="row spread"><h3>${set.grade} · ${escape(set.title)}</h3><span class="tiny">${set.drills.filter(d => spinProgress.completed.includes(d.id)).length} / ${set.drills.length} 達成</span></div><div class="lesson-list">${set.drills.map(d => `<button class="lesson-card${spinProgress.completed.includes(d.id) ? ' done' : ''}" data-act="spin-drill" data-id="${d.id}"><span class="eyebrow">${spinProgress.completed.includes(d.id) ? '✔ 達成' : '◇ チャレンジ'}</span><b>${escape(d.title)}</b><span>${d.type}ミノ · ${d.lines}ライン</span></button>`).join('')}</div></section>`).join('')}</div></main>${footer()}`;
  }
  function spinInfoHTML() {
    const s = session, done = s.set.drills.filter(d => spinProgress.completed.includes(d.id)).length;
    return `<section class="panel practice-options"><div class="eyebrow">${s.set.grade} · ${s.index + 1} / ${s.set.drills.length}</div><h3>${escape(s.drill.title)}</h3><p class="tiny">${escape(s.set.title)} · ${done}問達成</p><p class="tiny spin-rule">最後に回転して、破線の4マスへ固定。<br>回転後の落下・横移動に注意ですっ。</p><p class="tiny">成功すると次の問題へ。<br>ミスは同じ問題ですぐ再挑戦。</p><button class="small" data-act="spins">問題一覧へ</button></section>`;
  }
  function spinStatsHTML() {
    return `<section class="panel stats-panel"><div class="panel-label">SESSION / この練習</div><div class="stats-main"><div class="stat"><label>回転入れ成功</label><strong class="accent" id="completed">0</strong></div><div class="stat"><label>成功率</label><strong id="accuracy">0</strong><small> %</small></div></div><div class="stats-strip"><span>試行 <b id="spin-attempts">0</b></span><span>ミス <b id="misses">0</b></span><span>連続 <b id="streak">0</b></span></div></section>`;
  }
  function spinPlayHTML() {
    return `<main class="play-page spin-play"><div class="row spread play-topline"><h1 class="play-title">回転入れ編<span class="tag">SPIN PRACTICE</span></h1><button class="small" data-act="pause">一時停止 ${escape(friendly(bindings.pause[0]))}</button></div><div class="play-grid"><aside class="coach">${ui.bubbles ? speech(bubble, 'coach-speech') : ''}<div id="coach-mascot" class="mascot-wrap" data-expression="${expression}">${mascot(expression, 'coach')}</div><div id="spin-info">${spinInfoHTML()}</div></aside><section class="board-stage"><aside class="side-queue"><div class="queue-box"><div class="queue-title">今回のミノ</div><div id="spin-piece">${mini(session.drill.type)}</div></div><p class="hold-note">この問題は<br>ホールドなし</p><div class="key-help">${['left','right','cw','ccw','rotate180'].map(a => `<kbd data-live-key="${a}">${escape(friendly(bindings[a][0]))}</kbd>`).join('')}</div></aside><div class="board-column">${boardHTML()}<p class="board-note">破線：目標 · 半透明：着地の影</p></div><aside class="side-queue"><p class="hold-note">${escape(friendly(bindings.softDrop[0]))} で下げる<br>${escape(friendly(bindings.hardDrop[0]))} で固定</p>${comboHTML()}</aside></section><aside class="right-stack"><div class="play-tools">${handlingPanelHTML()}<div id="play-stats" class="play-stats" ${handlingOpen ? 'hidden' : ''}>${spinStatsHTML()}</div></div><section id="result-panel" class="panel result-panel" aria-live="polite"></section><div class="play-buttons"><button data-act="retry">↻ 同じ問題 ${escape(friendly(bindings.retry[0]))}</button><button data-act="hint">✧ ヒント ${escape(friendly(bindings.hint[0]))}</button><button data-act="skip">次の問題 ${escape(friendly(bindings.skip[0]))} →</button><button data-act="spins">問題一覧</button></div></aside></div><div class="play-footer" id="play-footer"></div></main>`;
  }
  function startSpin(id = spinProgress.current) {
    resetCombo(); audio.stopCues(); releaseAll(); sessionEventQueue = []; demo = null;
    tryMode = false; tryDone = false; menuMode = 'spin'; hint = false; lastResult = null;
    particles = []; irsUntil = 0; irsCount = 0;
    session = newSession({ drillId: id, completedDrills: spinProgress.completed, totalStats: spinStats }, E.SpinSession);
    spinProgress.current = session.drill.id; save();
    setCoach('くぼみの手前まで下げて、最後にくるりですっ♪');
    screen = 'play'; session.start(now()); window.scrollTo(0, 0); render(); processEvents();
  }

  function lessonsHTML() {
    return `<main class="page"><div class="page-heading"><div><div class="eyebrow">FINESSE CLASSROOM</div><h2 style="margin-top:6px">レッスン一覧</h2><p>実演を見て、3つの目標で練習。好きなところから復習できます。</p></div><span class="tag mint-tag">${progress.completed.length} / 12 チャレンジ達成</span></div><div class="lesson-list">${lessons.map((lesson, i) => `<button class="lesson-card" data-act="lesson" data-index="${i}"><span class="eyebrow">LESSON ${String(i + 1).padStart(2, '0')} ${progress.completed.includes(i) ? ' · ✔' : ''}</span><b>${escape(lesson.title)}</b><span>${i >= 4 && i <= 10 ? 'ミノ別の最短表・実演・3つの目標' : '実演とミニチャレンジ'}</span></button>`).join('')}</div></main>${footer()}`;
  }
  function demoVariants(lesson) { return lesson.demo.examples || lesson.demo.variants || [lesson.demo]; }
  function tutorialHTML() {
    const lesson = lessons[lessonIndex], variants = demoVariants(lesson);
    return `<main class="page lesson-page"><div class="page-heading lesson-heading"><div><div class="eyebrow">LESSON ${String(lessonIndex + 1).padStart(2, '0')} / 12</div><h2 style="margin-top:5px">${escape(lesson.title)}</h2></div><div class="row"><nav class="lesson-steps" aria-label="レッスン選択">${lessons.map((l, i) => `<button data-act="lesson" data-index="${i}" title="${escape(l.title)}" class="${i === lessonIndex ? 'active' : progress.completed.includes(i) ? 'done' : ''}">${i + 1}</button>`).join('')}</nav><button class="small" data-act="lessons">一覧</button></div></div><div class="lesson-grid"><aside class="lesson-coach">${speech(lesson.lines[0], 'coach-speech')}<div id="coach-mascot" class="mascot-wrap" data-expression="${lesson.expression}">${mascot(lesson.expression, 'lesson')}</div><p class="tiny" style="text-align:center">ミルフィのフィネス教室</p>${tryMode ? comboHTML() : ''}</aside><section class="lesson-board">${boardHTML()}<div id="demo-keys" class="sequence"></div><p id="demo-caption" class="tiny" style="text-align:center;margin:8px 0">実演を準備しています…</p><div id="tutorial-result" class="lesson-status" aria-live="polite">${escape(lessonMessage)}</div></section><section class="lesson-details" aria-label="レッスンの説明と操作">${tryMode ? handlingPanelHTML() : ''}<div class="lesson-content" tabindex="0" aria-label="レッスンの説明と最短表"><span class="tag ${tryMode ? 'mint-tag' : ''}">${tryMode ? 'YOUR TURN / 自分でチャレンジ' : 'WATCH / キーの光り方を見てみよう'}</span><div class="lesson-text">${lesson.lines.slice(1).map(line => `<p>${escape(line)}</p>`).join('')}</div><div class="demo-tabs">${variants.map((v, i) => `<button class="${demoVariant === i && !tryMode ? 'active' : ''}" data-act="demo" data-index="${i}">${lesson.demo.type === 'compare-sequences' ? i === 0 ? 'タップ × 4' : 'DAS × 1' : v.type === 'irs' ? 'IRSの実演' : v.type === 'ihs' ? 'IHSの実演' : '実演 ' + (i + 1)}</button>`).join('')}<button data-act="settings">操作の設定 ↗</button></div><div class="try-box"><h3>✧ やってみましょう</h3><p>${lesson.tryIt.requireIRS ? 'ARE中に回転キーを長押しして、IRSで置いてみましょうね。' : '目標の輪郭に、最少の回数で置いてみましょうね。別の最短手順でもOKですっ。'}<br>移動・回転で合わせ、${escape(friendly(bindings.hardDrop[0]))} で落下 / ${escape(friendly(bindings.retry[0]))} でもう一度</p><button class="small ${tryMode ? '' : 'primary'}" data-act="try-it">${tryDone ? 'もう一度チャレンジ' : tryMode ? `目標 ${Math.min(tryIndex + 1, lesson.tryIt.targets.length)} / ${lesson.tryIt.targets.length} · 最初から` : `${lesson.tryIt.targets.length}つの目標にチャレンジ`}</button></div>${lesson.demo.placementGroups ? `<h3 style="margin-bottom:7px">${lesson.demo.piece}ミノの最短ルート表</h3><p class="tiny">列を選ぶと実演します。0 / R / 2 / L は回転の向きです。</p><table class="lesson-table"><thead><tr><th>向き・左端の列</th><th>最短入力</th></tr></thead><tbody>${lesson.demo.placementGroups.map((group, i) => `<tr><td><button data-act="table-demo" data-index="${i}">${group.placements.map(p => `${p.rotationLabel}・${p.column}`).join(' / ')}</button></td><td><div class="sequence">${route(group.actions)}</div></td></tr>`).join('')}</tbody></table>` : ''}</div><nav class="lesson-nav" aria-label="前後のレッスン"><button class="small" data-act="previous-lesson" ${lessonIndex === 0 ? 'disabled' : ''}>← 前へ</button><button class="primary small" data-act="next-lesson">${lessonIndex === 11 ? 'ドリルへ →' : '次のレッスン →'}</button></nav><p class="tiny lesson-shortcuts">実演中: Enter / Space / → で次へ · ← で前へ · Esc でタイトル</p></section></div></main>`;
  }
  function handlingRow(key, title, note, step = 1) {
    const [min, max] = E.SETTING_LIMITS[key];
    return `<div class="setting-row"><label for="setting-${key}">${title}<small>${note} · ${min}–${max}</small></label><input aria-label="${title} スライダー" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><button class="setting-step" data-act="adjust-handling" data-handling-key="${key}" data-step="-1" aria-label="${title}を減らす">−</button><input id="setting-${key}" aria-label="${title}" data-setting="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><button class="setting-step" data-act="adjust-handling" data-handling-key="${key}" data-step="1" aria-label="${title}を増やす">＋</button></div>`;
  }
  function toggle(key, label, engine = false, shortLabel = label) { return `<label class="checkline"><input type="checkbox"${shortLabel === label ? '' : ` aria-label="${label}"`} ${engine ? 'data-engine-toggle' : 'data-ui'}="${key}" ${(engine ? settings : ui)[key] ? 'checked' : ''}>${shortLabel}</label>`; }
  function appearancePreview() {
    return mascot('normal', 'appearance-normal') + mascot('happy', 'appearance-happy');
  }
  function appearanceHTML() {
    return `<section class="panel appearance-panel" role="group" aria-labelledby="shared-appearance"><div><h3 id="shared-appearance">共通の見た目</h3><p class="tiny">ミルフィの前髪と衣装の選択は、すべての画面に反映されます。</p><label for="hair-skin">前髪のスキン</label> <select id="hair-skin" data-hair-skin>${M.HAIR_SKINS.map(skin => `<option value="${skin}" ${skin === ui.hairSkin ? 'selected' : ''}>${M.HAIR_SKIN_LABELS[skin]}</option>`).join('')}</select><label for="outfit-skin" class="outfit-label">衣装のスキン</label> <select id="outfit-skin" data-outfit-skin>${M.OUTFIT_SKINS.map(skin => `<option value="${skin}" ${skin === ui.outfitSkin ? 'selected' : ''}>${M.OUTFIT_SKIN_LABELS[skin]}</option>`).join('')}</select><p id="appearance-storage" class="storage-note" role="status">${storageOK ? '選択は自動保存されます。' : '保存できないため、この起動中だけ選択を保持します。'}</p></div><div id="appearance-preview" aria-label="通常顔とにっこりの見本">${appearancePreview()}</div></section>`;
  }
  const UI_NUMERIC = { volume: [0, 1, .05], pieceCueVolume: [0, 100, 1] };
  function uiNumeric(key, title) {
    const [min, max, step] = UI_NUMERIC[key];
    return `<div class="setting-row"><label for="ui-${key}">${title}</label><input aria-label="${title} スライダー" data-ui="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${ui[key]}"><button class="setting-step" data-act="adjust-ui" data-ui-key="${key}" data-step="-1" aria-label="${title}を減らす">−</button><input id="ui-${key}" aria-label="${title}" data-ui="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${ui[key]}"><button class="setting-step" data-act="adjust-ui" data-ui-key="${key}" data-step="1" aria-label="${title}を増やす">＋</button></div>`;
  }
  // Match native range step rounding (ties toward the higher value). Clamp
  // before rounding, and remove floating point noise from decimal steps.
  function snapNumeric(value, min, max, step) {
    const bounded = Math.max(min, Math.min(max, value));
    const ticks = Math.round(Number(((bounded - min) / step).toFixed(10)));
    return Math.max(min, Math.min(max, Number((min + ticks * step).toFixed(10))));
  }
  function updateNumericUI(key, value) {
    ui[key] = snapNumeric(value, ...UI_NUMERIC[key]);
    for (const input of $$(`[data-ui="${key}"]`)) { numericDrafts.delete(input); input.value = ui[key]; }
    if (key === 'pieceCueVolume' && $('#cue-volume')) $('#cue-volume').textContent = String(ui[key]);
    audio.configure(); save();
  }
  function cueSettingsHTML() {
    return `<div class="cue-settings"><h3>ミノを音でお知らせ</h3><label class="filter-line">鳴らすタイミング<select data-ui="pieceCueTiming" aria-label="ミノの音のタイミング">${[['next', 'NEXT（次のミノ）'], ['current', '現在のミノ'], ['off', 'オフ']].map(([value, label]) => `<option value="${value}" ${ui.pieceCueTiming === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p class="tiny">出現時に、NEXTの先頭に来たミノをお知らせします♪<br>現在のミノにも切替できます。同じ目標のリトライやホールド交換では鳴りません。</p>${uiNumeric('pieceCueVolume', 'ミノの音量')}<output id="cue-volume" hidden>${ui.pieceCueVolume}</output><div class="cue-preview" role="group" aria-label="ミノの音を試聴">${E.PIECE_TYPES.map(type => `<button class="small" data-act="preview-cue" data-piece="${type}" aria-label="${type}ミノの音を試聴">${type}</button>`).join('')}</div><p class="tiny">ミノを選んで試聴できます。効果音のオン・オフと全体の音量も反映します。</p></div>`;
  }
  function settingsHTML() {
    return `<main class="page settings-page"><div class="page-heading"><div><div class="eyebrow">MAKE YOURSELF COMFORTABLE</div><h2 style="margin-top:5px">ゲーム設定</h2><p>設定はすぐに反映・自動保存されます。練習中の時間は一時停止します。</p></div><button class="primary" data-act="close-settings">保存して戻る →</button></div><div class="settings-content" tabindex="0" aria-label="設定項目">${appearanceHTML()}<div class="settings-grid"><section class="panel"><h3>共通のハンドリング</h3>${presetsHTML()}${HANDLING.map(field => (field.key === 'lockDelay' ? toggle('lockDelayOn','ロックディレイ（接地後に自動固定）',true) : '') + handlingRow(field.key, field.title, field.note, field.step)).join('')}<p class="handling-note">ARR 0：DASがたまると壁まで移動します。SDF 41：固定せず床へ。<br>DCD：出現・回転・落下固定の後、自動横移動だけを待機します。<br>左右同時押しは後から押した方向が優先。古い方向のDASも保持します。</p><div class="toggle-grid">${toggle('irs','IRS / 出現時に先行回転',true)}${toggle('ihs','IHS / 出現時にホールド',true)}${toggle('allow180','180°回転を有効にする',true)}</div><div class="settings-group" role="group" aria-labelledby="shared-display-sound"><h3 id="shared-display-sound">共通の表示・サウンド</h3><div class="toggle-grid">${toggle('ghost','着地の影を表示')}${toggle('showKeys','キーキャップを表示')}${toggle('sound','効果音を鳴らす')}${toggle('bubbles','ミルフィの吹き出し')}</div>${uiNumeric('volume', '音量')}${cueSettingsHTML()}</div><div class="settings-group" role="group" aria-labelledby="finesse-settings"><h3 id="finesse-settings">フィネス編の練習</h3><div class="toggle-grid">${toggle('zeroFault','ゼロフォルトモード')}${toggle('repeatOnFault','フォルト時に同じ目標')}${toggle('repeatOnMiss','ミス時に同じ目標')}${toggle('showTarget','目標の輪郭を表示')}${toggle('showOptimal','最短手順を表示')}</div></div></section><section class="panel"><div class="row spread"><h3>キー設定</h3><button class="quiet small" data-act="reset-keys">キーを初期化</button></div><p class="tiny" style="margin:0 0 12px">移動・回転などは共通です。リトライはフリーモードでは再スタート。<br>次の目標・ヒントはフィネス編と回転入れ編の操作です。<br>キーを選んで押し直す・＋で追加・×で削除。重複は入れ替えできます。</p><div class="binding-list">${E.INPUT_ACTIONS.map(action => `<div class="binding-row"><span>${ACTION_NAMES[action]}</span><div class="binding-keys">${bindings[action].map((code, index) => `<button class="binding-key" data-act="capture" data-action="${action}" data-index="${index}" aria-label="${ACTION_NAMES[action]} ${escape(friendly(code))} を変更">${escape(friendly(code))}</button>${bindings[action].length > 1 ? `<button class="quiet" style="padding:0" data-act="remove-key" data-action="${action}" data-index="${index}" aria-label="${escape(friendly(code))} を削除">×</button>` : ''}`).join('')}<button class="binding-add" data-act="capture" data-action="${action}" aria-label="${ACTION_NAMES[action]} キーを追加">+</button></div></div>`).join('')}</div><p class="handling-note">Shift(左) と Shift(右) は別のキーです。<br>長押しのOSリピートは入力回数に数えません。<br>設定画面では矢印で数値調整、Tabで項目を移動。<br>盤面からはTab（割当時はShift+Tab）で操作欄へ移れます。</p></section></div><div class="settings-bottom"><section class="panel"><h3>JSONでエクスポート / インポート</h3><p class="tiny" style="margin-top:7px">操作・キー・表示設定をコピーして持ち運べます。記録とレッスン進捗は保持します。</p><textarea id="settings-json" aria-label="設定JSON" spellcheck="false" placeholder="エクスポート、または設定JSONをここに貼り付け"></textarea><div class="row"><button class="small" data-act="export">エクスポート</button><button class="small" data-act="import">インポートして適用</button></div><p id="import-status" class="storage-note" role="status"></p></section><section class="panel"><h3>初期化について</h3><p class="handling-note">すべての操作・キー・表示設定を初期値に戻せます。<br>成績の初期化は「記録」画面から行えます。<br>保存先：このブラウザのローカルストレージ。外部通信はありません。</p><button class="small danger" data-act="reset-settings">すべての設定を初期化</button><p class="storage-note">${storageOK ? '✓ このブラウザに保存されています。' : 'この環境では保存を利用できません。起動中の設定は保持されます。'}</p></section></div></div></main>${footer()}`;
  }
  function statsHTML() {
    const stats = statsScope === 'session' && session ? session.stats.snapshot() : totalStats.snapshot();
    return `<main class="page"><div class="page-heading"><div><div class="eyebrow">A LITTLE BETTER EVERY DAY</div><h2 style="margin-top:5px">練習の記録</h2><p>${statsScope === 'session' ? 'このセッションの記録です。' : 'このブラウザに保存した、これまでの練習です。'} フォルトと置き場所のミスは別々に集計します。</p></div><div class="row">${session ? `<button class="small" data-act="stats-scope">${statsScope === 'session' ? '通算記録へ' : 'セッション記録へ'}</button><button class="primary small" data-act="return-play">練習に戻る</button>` : ''}<button class="small danger" data-act="reset-stats">記録をリセット</button></div></div><section class="panel progress-summary" aria-label="学習の進捗"><h3>学習の進捗</h3><p>レッスン <b>${progress.completed.length} / 12</b> チャレンジ達成 · 回転入れ <b>${spinProgress.completed.length} / ${E.SPIN_DRILLS.length}</b> 問達成</p><p>回転入れの通算 ${spinStats.perfect} 成功 / ${spinStats.attempts} 試行</p><div class="row"><button class="small" data-act="lessons">レッスン一覧へ</button><button class="small" data-act="spins">回転入れの問題一覧へ</button></div></section><section class="panel big-stats">${[['試行数',stats.attempts,'回'],['正確率',stats.accuracy.toFixed(1),'%'],['最高連続',stats.bestStreak,'回'],['フォルト',stats.faults,'回'],['置き場所ミス',stats.misses,'回'],['平均入力 / 最短',stats.averageInputs.toFixed(2) + ' / ' + stats.averageOptimal.toFixed(2),'']].map(([label,value,unit]) => `<div class="stat"><label>${label}</label><strong class="accent">${value}</strong><small> ${unit}</small></div>`).join('')}</section><div class="stats-full" style="margin-top:20px"><section class="panel"><h3>ミノごとの記録</h3><table class="full-table"><thead><tr><th>ミノ</th><th>試行</th><th>最短成功</th><th>フォルト</th><th>ミス</th></tr></thead><tbody>${E.PIECE_TYPES.map(type => { const p=stats.byPiece[type]; return `<tr><td>${type}</td><td>${p.attempts}</td><td>${p.perfect}</td><td>${p.faults}</td><td>${p.misses}</td></tr>`; }).join('')}</tbody></table></section><section class="panel"><h3>スプリントのベストタイム</h3><table class="full-table"><thead><tr><th>目標数</th><th>ベストタイム</th></tr></thead><tbody>${Object.entries(totalStats.bestTimes).map(([length, time]) => `<tr><td>${length} 個</td><td>${timeText(time)}</td></tr>`).join('') || '<tr><td colspan="2">まだ記録がありません。スプリントに挑戦しましょう♪</td></tr>'}</tbody></table><p class="handling-note">正確率 = Perfect ÷ 全試行。PPS = 成功した配置数 ÷ 秒数。<br>ゼロフォルトでは余分な入力のあった配置は進捗に入りません。</p></section></div></main>${footer()}`;
  }
  function sprintHTML() {
    return `<main class="page"><div class="page-heading"><div><div class="eyebrow">FIND YOUR RHYTHM</div><h2 style="margin-top:5px">スプリント</h2></div><span class="tag">タイマーは最初の操作から</span></div><div class="sprint-setup"><div>${speech('正確さとリズムが大切ですっ♪ 目標の数だけ置いて、あなたの自己ベストに挑戦しましょうね。')}<div class="mascot-wrap">${mascot('surprised','sprint')}</div></div><section class="panel"><h2>今日は何個、置きますか？</h2><p class="handling-note">正しい場所への配置が目標数に達するとゴールです。<br>操作・ミノ・列の設定はドリルと共通です。</p><div class="sprint-choices"><button data-act="start-sprint" data-length="40">40<small class="tiny"> 個</small></button><button data-act="start-sprint" data-length="100">100<small class="tiny"> 個</small></button></div><div class="custom-sprint"><label for="custom-length">カスタム</label><input id="custom-length" type="number" min="1" max="9999" value="20"><button class="primary small" data-act="custom-sprint">スタート →</button></div><p class="best-line">40個 ${totalStats.bestTimes[40] === undefined ? '—' : timeText(totalStats.bestTimes[40])} / 100個 ${totalStats.bestTimes[100] === undefined ? '—' : timeText(totalStats.bestTimes[100])}</p>${toggle('zeroFault','ゼロフォルト：最短成功だけで進む')}</section></div></main>${footer()}`;
  }
  function resultHTML() {
    const r = sprintResult;
    return `<main class="page result-page"><div class="page-heading"><div><div class="eyebrow">SPRINT COMPLETE</div><h2 style="margin-top:5px">${r.sprintLength}個、おつかれさまでした！</h2></div><span class="tag mint-tag">FINISH ✧</span></div><div class="result-layout"><div>${speech(M.sprintComment(r.accuracy, r.pps))}<div class="mascot-wrap">${mascot('happy', 'finish')}</div></div><section class="panel"><div class="panel-label">YOUR TIME</div><div class="result-time">${timeText(r.elapsed)}</div><p class="result-best">ベスト ${timeText(totalStats.bestTimes[r.sprintLength])}</p><div class="result-summary"><div class="stat"><label>PPS</label><strong>${r.pps.toFixed(2)}</strong></div><div class="stat"><label>正確率</label><strong>${r.accuracy.toFixed(1)}<small>%</small></strong></div><div class="stat"><label>フォルト / ミス</label><strong>${r.faults}<small> / ${r.misses}</small></strong></div></div><div class="panel-label">フォルト / 試行 · ミノ別</div><div class="piece-bars">${pieceBars(r)}</div><div class="row"><button class="primary" data-act="start-sprint" data-length="${r.sprintLength}">もう一度 →</button><button data-act="menu">タイトルへ</button></div></section></div></main>${footer()}`;
  }

  function render(focus = true) {
    dismissToast();
    dismissSettingTooltip();
    const previous = document.activeElement;
    const focusKey = previous?.dataset ? { ...previous.dataset } : {};
    const previousId = previous?.id;
    const content = header() + ({ menu: menuHTML, free: practiceCategoryHTML, finesse: practiceCategoryHTML, play: isSpin() ? spinPlayHTML : playHTML, spins: spinsHTML, tutorial: tutorialHTML, lessons: lessonsHTML,
      dressup: dressupHTML, settings: settingsHTML, records: statsHTML, sprint: sprintHTML, result: resultHTML }[screen])();
    app.innerHTML = content + settingTooltipsHTML(content);
    setupSettingHelp();
    document.body.dataset.screen = screen;
    document.body.dataset.mode = isFree() ? 'free' : isSpin() ? 'spin' : 'finesse';
    document.body.dataset.keycaps = ui.showKeys ? 'on' : 'off';
    lastQueue = ''; lastHUD = 0;
    updateCombo();
    if (screen === 'play') { updateResult(); updateHUD(now()); }
    if (screen === 'tutorial' && !tryMode) beginDemo();
    if (screen === 'tutorial' && tryMode) {
      const exercise = lessons[lessonIndex].tryIt;
      $('#demo-keys').innerHTML = route(exercise.targets[Math.min(tryIndex, exercise.targets.length - 1)].actions);
      $('#demo-caption').textContent = tryDone ? 'チャレンジ達成！花まるですっ♪' : `チャレンジ ${tryIndex + 1} / ${exercise.targets.length}`;
    }
    drawMinis();
    fitLessonBoard();
    if (screen === 'dressup') dressupMotion();
    if (focus) {
      const target = screen === 'play' || screen === 'tutorial' ? $('#board') : $('main .primary:not(:disabled)') || $('main button:not(:disabled)');
      target?.focus({ preventScroll: true });
    } else {
      // DOM replacement must not strand keyboard users at the document root.
      const controls = $$('button,input,select,textarea');
      const target = previousId && document.getElementById(previousId) || controls.find(el =>
        Object.keys(focusKey).length && Object.entries(focusKey).every(([key, value]) => el.dataset[key] === value));
      (target || $('main button:not(:disabled)'))?.focus({ preventScroll: true });
    }
    if (['play','tutorial'].includes(screen)) {
      if (isFree() && session.gameOver) showGameOver();
      else if (session && session.pausedAt !== null && !tryDone) showPause();
    }
  }
  function releaseAll() {
    if (!session) return;
    session.handler.releaseAll(now());
  }
  function pauseSession() {
    audio.stopCues();
    if (!session?.running) return;
    session.pause(now()); releaseAll();
  }
  function go(screenName) {
    resetCombo();
    audio.stopCues();
    releaseAll(); demo = null; selectedDemo = null;
    if (['menu', 'free', 'finesse', 'sprint', 'lessons', 'spins'].includes(screenName)) {
      if (session?.running) session.pause(now());
      session = null; tryMode = false; particles = []; sessionEventQueue = [];
    }
    screen = screenName; window.scrollTo(0, 0); render();
  }
  function openSettings() {
    if (screen === 'settings') return;
    // Settings → dress-up → settings goes back instead of nesting, so Back/Esc cannot loop.
    if (screen === 'dressup' && dressupReturn === 'settings') { closeDressup(); return; }
    resetCombo();
    settingsReturn = screen; pauseSession(); demo = null; screen = 'settings'; window.scrollTo(0, 0); render();
  }
  function closeSettings() {
    screen = settingsReturn; lessons = M.createLessons(settings); window.scrollTo(0, 0); render();
    if (screen === 'tutorial' && tryMode && !tryDone) session?.resume(now());
    // A live drill returns to the pause overlay so held keys cannot jump ahead.
  }
  function updateSettings(patch) {
    settings = E.normalizeSettings(patch, settings);
    if (session) session.setSettings({ ...patch, ...challengeOverrides(settings) }, now());
    syncHandlingPanel();
    save();
  }
  function updateOptions() {
    audio.configure();
    document.body.dataset.keycaps = ui.showKeys ? 'on' : 'off';
    if (session && !isFree() && !isSpin()) {
      session.zeroFault = ui.zeroFault; session.repeatOnFault = ui.repeatOnFault;
      session.repeatOnMiss = ui.repeatOnMiss;
    }
    save();
  }
  function newSession(options, Session = E.DrillSession) {
    const s = new Session({ clock: now, time: now(), settings, totalStats, ...options,
      onEvent: (event, source) => sessionEventQueue.push({ event, source }) });
    return s;
  }
  function sessionOptions() {
    return { pieces: practice.pieces, area: practice.area === 'custom' ? 'all' : practice.area,
      columnRange: practice.area === 'custom' ? [practice.minColumn - 1, practice.maxColumn - 1] : null,
      weakSpot: practice.weakSpot, zeroFault: ui.zeroFault, repeatOnFault: ui.repeatOnFault, repeatOnMiss: ui.repeatOnMiss };
  }
  function startPlay(length = 0, free = false) {
    resetCombo();
    audio.stopCues();
    releaseAll(); sessionEventQueue = []; demo = null; tryMode = false; tryDone = false;
    menuMode = free ? 'free' : 'finesse';
    session = free ? newSession({}, E.FreeSession) : newSession({ ...sessionOptions(), sprintLength: length });
    lastResult = null; particles = []; hint = false; irsUntil = 0; irsCount = 0; lastTipAttempt = 0;
    setCoach(free ? 'あなたのペースで、わたしも応援ですっ♪' : '輪郭に重ねて、最短の操作ですっ♪');
    screen = 'play'; session.start(now()); window.scrollTo(0, 0); render(); processEvents();
  }
  function updatePractice(next) {
    const focused = document.activeElement;
    const focusId = focused?.id, focusData = { ...focused?.dataset };
    const restoreFocus = () => (focusId && document.getElementById(focusId) ||
      $$('#practice-wrap input').find(el => Object.keys(focusData).length &&
        Object.entries(focusData).every(([key, value]) => el.dataset[key] === value)))?.focus({ preventScroll: true });
    // Change the target policy inside the current session, preserving its timer,
    // sprint progress and statistics. Reject a range with no legal placements.
    const opts = { ...next, area: next.area === 'custom' ? 'all' : next.area,
      columnRange: next.area === 'custom' ? [next.minColumn - 1, next.maxColumn - 1] : null };
    try { new E.DrillSession({ ...opts, settings, time: now() }); }
    catch (_) { toast('この条件では置ける目標がないんですっ。列の範囲を広げてくださいね。'); $('#practice-wrap').innerHTML = practiceHTML(); restoreFocus(); return; }
    releaseAll(); practice = next; save();
    if (session && screen === 'play') {
      resetCombo();
      session.pieces = [...practice.pieces]; session.area = opts.area; session.columnRange = opts.columnRange;
      session.weakSpot = practice.weakSpot; session.bag = new E.Bag({ pieces: practice.pieces, rng: session.rng });
      session.handler.bag = session.bag; session.handler.pieceProvider = () => session.bag.next();
      session.handler.holdEnabled = practice.pieces.length > 1; session.handler.heldPiece = null;
      session.skip(now());
      $('#practice-wrap').innerHTML = practiceHTML();
      $('#hold-note').innerHTML = session.handler.holdEnabled ? escape(friendly(bindings.hold[0])) + ' で交換<br>固定まで1回' : '1種類の練習では<br>ホールド無効';
      updateHUD(now()); restoreFocus();
    }
  }
  function showPause() {
    if ($('.overlay') || !session?.running || !['play', 'tutorial'].includes(screen) || screen === 'tutorial' && tryDone) return;
    releaseAll();
    app.insertAdjacentHTML('beforeend', `<div class="overlay" role="dialog" aria-modal="true" aria-label="一時停止"><div class="modal"><div class="eyebrow">TAKE A LITTLE BREAK</div><h2>ひとやすみしましょう♪</h2><p>タイマーもミノも止まっています。<br>準備ができたら、また一緒に。</p><div class="stack"><button class="primary" data-act="resume">再開 ${escape(friendly(bindings.pause[0]))}</button><button data-act="settings">操作の設定</button><button class="quiet" data-act="menu">タイトルへ戻る</button></div></div></div>`);
    $('.overlay .primary').focus({ preventScroll: true });
  }
  function resumePlay() {
    $('.overlay')?.remove(); releaseAll(); session?.resume(now()); $('#board')?.focus({ preventScroll: true });
  }
  function showGameOver() {
    if ($('.overlay') || screen !== 'play') return;
    const stats = freeStatsValues(session.snapshot(now()));
    app.insertAdjacentHTML('beforeend', `<div class="overlay gameover" role="dialog" aria-modal="true" aria-label="ゲームオーバー"><div class="modal"><h2>ゲームオーバー</h2><div class="result-summary">${[['lines', 'ライン'], ['pieces', 'ミノ'], ['elapsed', '時間'], ['pps', 'PPS']].map(([id, label]) => `<div class="stat"><label>${label}</label><strong>${stats[id]}</strong></div>`).join('')}</div><div class="stack"><button class="primary" data-act="restart">もう一度 ${escape(friendly(bindings.retry[0]))}</button><button data-act="menu">タイトルへ</button></div></div></div>`);
    $('.overlay .primary').focus({ preventScroll: true });
  }
  function restartFree() {
    if (!isFree()) return;
    audio.stopCues(); sessionEventQueue = []; session.restart(now()); processEvents();
  }
  function updateResult() {
    const panel = $('#result-panel'); if (!panel) return;
    if (isSpin()) {
      const r = lastResult;
      panel.className = 'panel result-panel' + (r ? ' ' + r.status : '');
      panel.innerHTML = r ? `<div class="result-head"><strong>${r.status === 'perfect' ? '✔ 回転入れ成功！' : r.reason === 'rotation' ? '◇ 最後に回転してみよう' : '◇ 置き場所を確認しよう'}</strong></div><p class="tiny">${r.status === 'perfect' ? `${r.lines}ライン！花まるですっ♪ 次の問題へ進みます。` : r.reason === 'rotation' ? '目標の場所はぴったり。最後の移動を回転にして、もう一度ですっ。' : '破線の4マスへ、下げてから回してみましょうね。'}<br>${r.status === 'perfect' ? '同じ問題は一覧から復習できます。' : '同じ問題をもう一度どうぞ。'}</p>${r.allClear ? `<p class="tiny">✧ 全${E.SPIN_DRILLS.length}問達成ですっ！花まるですっ♪</p>` : ''}<div id="hint-route" class="hint-route" hidden></div>` : '<div class="result-head"><strong>くぼみへ、くるり</strong></div><p class="tiny">破線の目標へ回して入れ、固定しましょう。<br>入力回数は自由ですっ。</p><div id="hint-route" class="hint-route" hidden></div>';
      updateHint(); return;
    }
    if (isFree()) {
      const r = lastResult;
      panel.className = 'panel result-panel' + (r ? ' ' + r.status : '');
      panel.innerHTML = r ? `<div class="result-head"><strong>${r.status === 'perfect' ? '✔ Perfect' : r.status === 'fault' ? 'フォルト +' + r.extra : '固定'}</strong></div>` : '';
      return;
    }
    if (!lastResult) {
      panel.className = 'panel result-panel';
      panel.innerHTML = `<div class="result-head"><strong>目標を見てみよう</strong><small id="target-optimal"></small></div><p class="tiny" style="line-height:1.9">破線の目標と着地の影を重ねて、<br>${escape(friendly(bindings.hardDrop[0]))} で固定します。</p><div id="hint-route" class="hint-route" ${hint && ui.showOptimal ? '' : 'hidden'}></div>`;
    } else {
      const r = lastResult;
      panel.className = 'panel result-panel ' + r.status;
      panel.innerHTML = `<div class="result-head"><strong>${r.status === 'perfect' ? '✔ パーフェクト！' : r.status === 'fault' ? '✧ フォルト +' + r.extra : '◇ 置き場所ミス'}</strong><small>${r.used} / 最短 ${r.optimal}</small></div>${ui.showOptimal ? `<div class="route-label">最短手順 / この目標</div><div class="sequence">${route(resultActions)}</div>` : ''}<div class="route-label">あなたの入力${r.flags.softDrop ? ' · ソフト落下あり' : ''}</div><div class="sequence">${route(actualRoute(r.inputs))}</div><div id="hint-route" class="hint-route" ${hint && ui.showOptimal ? '' : 'hidden'}></div>`;
    }
    updateHint();
  }
  function updateHint() {
    const el = $('#hint-route');
    if (el && isSpin()) {
      el.hidden = !(hint && ui.showOptimal);
      if (!el.hidden) el.innerHTML = `<p class="tiny">${escape(session.drill.tip)}<br>↓ 1マスは落下距離の目安です。床まで下げるときは長押しできます。</p><div class="sequence">${route(E.solveSpinDrill(session.drill, settings))}</div>`;
      return;
    }
    if (el && session?.round) {
      el.hidden = !(hint && ui.showOptimal);
      el.innerHTML = `<div class="route-label">今の目標 · ${session.round.optimal}入力</div><div class="sequence">${route(session.round.target.actions)}</div>`;
    }
  }
  function processEvents() {
    // Engine callbacks only enqueue work. Updating the DOM or releasing keys
    // after update/keyDown returns prevents clock re-entry inside a spawn/lock.
    while (sessionEventQueue.length) {
      const { event: event, source } = sessionEventQueue.shift();
      if (source !== session) continue;
      trace.push({ kind: event.kind, t: event.t, type: event.type, status: event.result?.status });
      if (trace.length > 150) trace.shift();
      if (event.kind === 'target') {
        if (isSpin()) {
          spinProgress.current = event.round.drillId;
          if (event.automatic) {
            // Preserve judgement, coach reaction and focus through the next
            // round, just as finesse does. Hints follow the current target.
            $('#spin-info').innerHTML = spinInfoHTML();
            $('#spin-piece').innerHTML = mini(source.drill.type); drawMinis();
          } else {
            lastResult = null; hint = false;
            setCoach('くぼみの手前まで下げて、最後にくるりですっ♪'); render();
          }
          save();
        }
        updateHint(); updateCombo();
      }
      if (event.kind === 'spawn' && source.running && source.pausedAt === null && !tryDone &&
          (screen === 'play' || screen === 'tutorial' && tryMode)) {
        const type = A.selectCue(event, ui.pieceCueTiming);
        if (type) audio.piece(type);
      }
      if (event.kind === 'spawn' && source.handler.inputs.some(input => input.irs)) { irsUntil = now() + 850; irsCount++; }
      if (event.kind === 'pause') { audio.stopCues(); showPause(); }
      if (event.kind === 'blockout') audio.stopCues();
      if (event.kind === 'resume') $('.overlay')?.remove();
      if (event.kind === 'restart') {
        lastResult = null; particles = []; irsUntil = 0; irsCount = 0;
        setCoach('あなたのペースで、わたしも応援ですっ♪'); render();
      }
      if (event.kind === 'gameover') {
        audio.stopCues(); audio.stopCombo();
        gameOverInputUntil = now() + 500;
        setCoach('おつかれさまですっ。わたしと、もう一度どうぞ♪', 'sorry');
        updateHUD(event.t); showGameOver();
      }
      if (event.kind === 'hint') { hint = !hint; updateHint(); }
      if (event.kind === 'settings') openSettings();
      if (event.kind === 'result') {
        const r = event.result;
        lastResult = r; feedbackAt = now();
        resultActions = r.optimalSequence.map(label => Object.keys(E.ACTION_LABELS).find(key => E.ACTION_LABELS[key] === label));
        if (isSpin()) {
          if (r.status === 'perfect' && !spinProgress.completed.includes(r.drillId)) spinProgress.completed.push(r.drillId);
          setCoach(r.status === 'perfect' ? 'くるり、ぴたり！回転入れ成功ですっ♪' : r.reason === 'rotation' ? 'あと一歩ですっ。最後の移動を回転にしてみましょうね。' : 'くぼみの形を見て、もう一度いっしょにどうぞ。', r.status === 'perfect' ? 'happy' : 'thinking');
          $('#spin-info').innerHTML = spinInfoHTML(); updateResult(); save();
        } else if (screen === 'tutorial' && tryMode) {
          const requiresIRS = lessons[lessonIndex].tryIt.requireIRS;
          if (r.status === 'perfect' && (!requiresIRS || r.inputs.some(i => i.irs))) {
            tryIndex++;
            if (tryIndex >= lessons[lessonIndex].tryIt.targets.length) {
              tryDone = true; pauseSession();
              if (!progress.completed.includes(lessonIndex)) progress.completed.push(lessonIndex);
              lessonMessage = '✔ チャレンジ達成ですっ！次のレッスンへどうぞ♪';
              setCoach('大成功ですっ！あなた、最短の操作を覚えられましたね♪', 'happy');
            } else {
              lessonMessage = `✔ パーフェクトですっ！ ${tryIndex} / ${lessons[lessonIndex].tryIt.targets.length} 達成。次の目標ですよ♪`;
              setCoach('パーフェクトですっ♪ 次の目標も、落ち着いてどうぞ。', 'happy');
              choosePracticeTarget();
            }
          } else {
            lessonMessage = requiresIRS && r.status === 'perfect'
              ? '出現前の待ち時間に、回転を長押ししてみましょうね。'
              : r.status === 'miss' ? `…目標と違う。輪郭を確認して。最短は${r.optimal}入力。`
                : `…今の${r.used}入力。最短は${r.optimal}入力。${r.extra}入力多い。遠回りしないで。`;
            setCoach(lessonMessage, r.status === 'miss' ? 'sorry' : 'thinking');
            choosePracticeTarget();
          }
          $('#tutorial-result').textContent = lessonMessage;
          const exercise = lessons[lessonIndex].tryIt;
          $('#demo-caption').textContent = tryDone ? 'チャレンジ達成！花まるですっ♪' : `チャレンジ ${tryIndex + 1} / ${exercise.targets.length} · 最短 ${exercise.targets[tryIndex].count} 入力`;
          $('[data-act=try-it]').textContent = tryDone ? 'もう一度チャレンジ' : `目標 ${tryIndex + 1} / ${exercise.targets.length} · 最初から`;
          $('#demo-keys').innerHTML = route(lessons[lessonIndex].tryIt.targets[Math.min(tryIndex, lessons[lessonIndex].tryIt.targets.length - 1)].actions);
          fitLessonBoard();
          save();
        } else {
          if (r.status === 'perfect') {
            setCoach(isFree() ? 'きれいな操作ですっ♪' : source.stats.streak % 3 === 0 ? pick(M.PIECE_PRAISE[r.type]) : pick(M.PRAISE_LINES), 'happy');
            if (!reducedMotion) for (let i = 0; i < 28; i++) particles.push({ x: 5, y: 2, vx: (Math.random() - .5) * 10, vy: 2 + Math.random() * 9, start: now(), color: ['#d9a6ce','#b5ddc8','#c5ade1','#efcf95'][i % 4] });
          } else if (r.status === 'fault') {
            setCoach(isFree() ? `…${r.extra}入力多い。` : M.hintText(r.type, r.used, r.optimal, resultActions.map(actionLabel)), 'thinking');
          } else if (r.status === 'miss') setCoach(pick(M.MISS_LINES), 'sorry');
          updateResult(); if (!isFree()) save();
          // Lesson corrections, progress and completion keep their own feedback.
          if (r.combo.milestone && ui.bubbles) setCoach(pick(M.COMBO_LINES[r.combo.milestone]), 'happy');
        }
        if (r.status !== 'unjudged') sound(r.status === 'perfect' ? 'perfect' : 'fault');
        if (r.combo.count >= 2) audio.combo(r.combo.count); else audio.stopCombo();
        updateCombo(r.combo, true);
      }
      if (event.kind === 'finish') {
        resetCombo();
        audio.stopCues();
        sprintResult = event.result; save(); releaseAll(); screen = 'result'; render();
      }
    }
  }
  function updateHUD(t) {
    if (screen !== 'play' || !session) return;
    const stats = session.snapshot(t), handler = session.handler;
    if (isSpin()) {
      for (const [id, value] of Object.entries({ completed: stats.perfect, accuracy: stats.accuracy.toFixed(0), 'spin-attempts': stats.attempts, misses: stats.misses, streak: stats.streak })) {
        const el = $('#' + id); if (el) el.textContent = value;
      }
      $('.key-help').hidden = !ui.showKeys;
      $('#play-footer').textContent = '✧ 回転のあと、落下や横移動をせずに固定。動かないキー入力は判定に影響しません。';
      return;
    }
    const values = isFree() ? freeStatsValues(stats) :
      { streak: stats.streak, accuracy: stats.accuracy.toFixed(0), 'best-streak': stats.bestStreak,
      pps: stats.pps.toFixed(2), completed: stats.completed + (session.sprintLength ? '/' + session.sprintLength : ''),
      average: stats.averageInputs.toFixed(1) + ' / ' + stats.averageOptimal.toFixed(1), misses: stats.misses,
      'sprint-time': timeText(stats.elapsed) };
    for (const [id, value] of Object.entries(values)) { const el = $('#' + id); if (el) el.textContent = value; }
    if ($('#piece-bars')) $('#piece-bars').innerHTML = pieceBars(session.stats);
    if ($('#target-optimal')) $('#target-optimal').textContent = '最短 ' + session.round.optimal + ' 入力';
    if ($('#sprint-progress')) $('#sprint-progress').style.width = 100 * session.completed / session.sprintLength + '%';
    const queue = session.nextQueue(), key = queue.join('') + ':' + handler.heldPiece;
    if (key !== lastQueue) {
      lastQueue = key; $('#next-preview').innerHTML = queue.map(type => mini(type)).join('');
      $('#hold-preview').innerHTML = mini(handler.heldPiece); drawMinis();
    }
    $('#hold-preview').style.opacity = !handler.holdEnabled || handler.holdUsed ? '.4' : '1';
    $('.key-help').hidden = !ui.showKeys;
    if (isFree()) return;
    const tip = M.TIPS[tipIndex % M.TIPS.length];
    $('#play-footer').textContent = '✧ ' + tip;
    if (session.stats.attempts && session.stats.attempts % 7 === 0) tipIndex = Math.floor(session.stats.attempts / 7);
  }

  function startLesson(index) {
    resetCombo();
    audio.stopCues();
    releaseAll(); session = null; sessionEventQueue = []; tryMode = false; tryDone = false; lessonMessage = '';
    lessonIndex = Math.max(0, Math.min(11, index)); progress.current = lessonIndex; save();
    lessons = M.createLessons(settings); demoVariant = 0; selectedDemo = null; irsUntil = 0;
    screen = 'tutorial'; render();
  }
  function choosePracticeTarget() {
    const target = lessons[lessonIndex].tryIt.targets[Math.min(tryIndex, lessons[lessonIndex].tryIt.targets.length - 1)];
    releaseAll(); session._newRound(target.type, target); session._schedule(now());
  }
  function startTryIt() {
    resetCombo();
    audio.stopCues();
    demo = null; releaseAll(); sessionEventQueue = []; tryMode = true; tryIndex = 0; tryDone = false; lastResult = null;
    const exercise = lessons[lessonIndex].tryIt;
    // Demonstrations keep their slow teaching timings. Player challenges use
    // the same saved handling as other play, except the IRS challenge's window.
    session = newSession({ pieces: [exercise.piece], settings: { ...exercise.settings, ...settings,
      ...(exercise.requireIRS ? { irs: true, are: Math.max(settings.are, exercise.settings.are) } : {}) },
      totalStats: new E.Stats(), zeroFault: true, repeatOnFault: true, repeatOnMiss: true });
    if (exercise.requireIRS) session.irsChallengeARE = exercise.settings.are;
    session.start(now(), exercise.targets[0]); lessonMessage = '輪郭に重ねて、ハードドロップですっ♪'; render();
    $('#demo-keys').innerHTML = route(exercise.targets[0].actions);
    $('#demo-caption').textContent = `チャレンジ 1 / ${exercise.targets.length} · 最短 ${exercise.targets[0].count} 入力`;
    fitLessonBoard();
    processEvents();
  }
  function beginDemo() {
    const lesson = lessons[lessonIndex], variants = demoVariants(lesson);
    const variant = selectedDemo || variants[demoVariant % variants.length];
    const target = variant.target || lesson.demo.targets?.[0];
    const type = variant.piece || lesson.demo.piece;
    const t = now(), localSettings = { ...settings, ...lesson.demo.settings, gravity: 0, sdf: 40, lockDelayOn: false,
      das: 240, arr: 35, dcd: 0, are: lesson.demo.type === 'spawn-buffer' ? 650 : 450 };
    const events = [], handler = new E.InputHandler({ clock: now, time: t, settings: localSettings, autoNext: false,
      onEvent: event => { if (event.kind === 'spawn' && handler.inputs.some(i => i.irs)) irsUntil = now() + 850; } });
    if (variant.type === 'ihs') handler.heldPiece = variant.heldPiece;
    handler.scheduleSpawn(type, t, localSettings.are);
    const actions = variant.sequence || variant.actions || target?.actions || [];
    const add = (at, action, down) => events.push({ at, action, down });
    let cursor = t + localSettings.are + 400;
    if (variant.type === 'irs' || variant.type === 'ihs') {
      const action = variant.type === 'irs' ? variant.buffered[0].action : 'hold';
      add(t + 160, action, true); add(t + localSettings.are + 250, action, false);
      // IRS already executes the rotation in variant.sequence on spawn.
    } else for (const action of actions) {
      const isDAS = action.startsWith('das');
      const base = isDAS ? action === 'dasLeft' ? 'left' : 'right' : action;
      add(cursor, base, true);
      cursor += isDAS ? localSettings.das + 11 * localSettings.arr : 160;
      add(cursor, base, false); cursor += 380;
    }
    add(cursor + 100, 'hardDrop', true); add(cursor + 150, 'hardDrop', false);
    demo = { handler, events, end: cursor + 1550, target, actions, variant, lock: null };
    handler.callbacks.onLock = result => { if (demo?.handler === handler) demo.lock = result.state; };
    $('#demo-keys').innerHTML = route(variant.type === 'ihs' ? ['hold'] : actions);
    $('#demo-caption').textContent = variant.type === 'irs' ? 'ARE中に回転を長押し → 出現時にIRS（1入力）' : variant.type === 'ihs' ? 'ARE中にホールド → 出現時にIHS（0入力）' : `${type}ミノ · ${actions.length}入力 + ハードドロップ（ゆっくり実演）`;
    fitLessonBoard();
  }
  function updateDemo(t) {
    if (!demo) return;
    while (demo.events.length && demo.events[0].at <= t) {
      const event = demo.events.shift();
      demo.handler[event.down ? 'keyDown' : 'keyUp'](event.action, event.at);
    }
    demo.handler.update(t);
    for (const el of $$('#demo-keys kbd')) {
      const action = el.dataset.keyAction;
      const base = action === 'dasLeft' ? 'left' : action === 'dasRight' ? 'right' : action;
      el.classList.toggle('pressed', [...demo.handler.held.values()].some(key => key.action === base));
    }
    if (t >= demo.end) { demoVariant++; beginDemo(); }
  }

  // Canvas coordinates preserve the engine's y-up 40-row board. Only the top
  // two spawn rows and the 20-row field are drawn; device pixels stay crisp.
  function rounded(ctx, x, y, w, h, radius) { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); }
  function fitLessonBoard() {
    const column = $('.lesson-board');
    if (!column) return;
    // Reserve actual space for labels, keycaps, wrapped captions and feedback.
    // A second pass resolves caption wrapping after the board width changes.
    for (let pass = 0; pass < 3; pass++) {
      const extra = [...column.children].filter(el => !el.matches('.board-shell')).reduce((sum, el) => {
        const style = getComputedStyle(el);
        return sum + el.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }, 0);
      const cell = Math.max(1, Math.min(34, (column.clientHeight - extra - 4) / 22, (column.clientWidth - 2) / 10));
      column.style.setProperty('--cell', cell + 'px');
    }
  }
  function block(ctx, x, y, size, color, alpha = 1) {
    ctx.save(); ctx.globalAlpha *= alpha;
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, color); gradient.addColorStop(1, color);
    rounded(ctx, x + 1, y + 1, size - 2, size - 2, Math.max(2, size * .13)); ctx.fillStyle = gradient; ctx.fill();
    rounded(ctx, x + 2, y + 2, size - 4, (size - 4) * .46, Math.max(1, size * .1)); ctx.fillStyle = '#ffffff55'; ctx.fill();
    ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 1; rounded(ctx, x + 1.5, y + 1.5, size - 3, size - 3, Math.max(2, size * .12)); ctx.stroke(); ctx.restore();
  }
  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!rect.width || !rect.height) return null;
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx, width: rect.width, height: rect.height };
  }
  function drawMinis() {
    for (const canvas of $$('.mini-piece')) {
      const surface = prepareCanvas(canvas), type = canvas.dataset.piece;
      if (!surface || !type) continue;
      const { ctx, width, height } = surface, points = E.SHAPES[type][0];
      const xs = points.map(c => c[0]), ys = points.map(c => c[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys), size = 13;
      const ox = (width - (maxX - minX + 1) * size) / 2, oy = (height - (maxY - minY + 1) * size) / 2;
      for (const [x, y] of points) block(ctx, ox + (x - minX) * size, oy + (maxY - y) * size, size, E.COLORS[type], .7);
    }
  }
  function renderBoard(t) {
    const canvas = $('#board'); if (!canvas) return;
    const handler = screen === 'tutorial' && !tryMode ? demo?.handler : session?.handler;
    const target = screen === 'tutorial' && !tryMode ? demo?.target : session?.round?.target;
    if (!handler) return;
    const surface = prepareCanvas(canvas); if (!surface) return;
    const { ctx, width, height } = surface, cell = width / 10;
    ctx.fillStyle = '#fcfaff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ede7f180'; ctx.fillRect(0, 0, width, 2 * cell);
    ctx.strokeStyle = '#eee8f4'; ctx.lineWidth = .65;
    for (let x = 0; x <= 10; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, height); ctx.stroke(); }
    for (let y = 0; y <= 22; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(width, y * cell); ctx.stroke(); }
    ctx.strokeStyle = '#cebddf'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(0, 2 * cell); ctx.lineTo(width, 2 * cell); ctx.stroke(); ctx.setLineDash([]);
    const drawCells = (points, type, alpha) => { for (const [x, y] of points) if (y >= 0 && y <= 21) block(ctx, x * cell, (21 - y) * cell, cell, E.COLORS[type] || '#bbb0cb', alpha * (y >= 20 ? .65 : 1)); };
    for (let y = 0; y <= 21; y++) for (let x = 0; x < 10; x++) if (handler.board.get(x, y)) drawCells([[x, y]], handler.board.get(x, y), .7);
    if (handler.active && (ui.ghost || screen === 'tutorial')) {
      const ghost = E.hardDrop(handler.board, handler.active);
      if (ghost) drawCells(E.cells(ghost), ghost.type, .13);
    }
    if (target && (ui.showTarget || screen === 'tutorial')) {
      const color = E.COLORS[target.type], pulse = reducedMotion ? .8 : .65 + Math.sin(t / 270) * .2;
      ctx.save(); ctx.globalAlpha = pulse; ctx.strokeStyle = color; ctx.fillStyle = color + '0c'; ctx.lineWidth = 1.9;
      ctx.setLineDash([4, 2.5]); ctx.lineDashOffset = reducedMotion ? 0 : -t / 130;
      ctx.shadowColor = color; ctx.shadowBlur = 4;
      for (const [x, y] of target.cells) {
        rounded(ctx, x * cell + 2, (21 - y) * cell + 2, cell - 4, cell - 4, 3); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    if (handler.active) drawCells(E.cells(handler.active), handler.active.type, .8);
    if (screen === 'tutorial' && demo?.lock && !tryMode) drawCells(E.cells(demo.lock), demo.lock.type, .85);
    for (const p of particles) {
      const age = (t - p.start) / 1000;
      if (age > 1) continue;
      ctx.save(); ctx.globalAlpha = 1 - age; ctx.fillStyle = p.color;
      const x = (p.x + p.vx * age) * cell, y = (22 - p.y - p.vy * age + age * age * 6) * cell;
      ctx.translate(x, y); ctx.rotate(age * 4); ctx.fillRect(-2, -2, 4, 4); ctx.restore();
    }
    particles = particles.filter(p => t - p.start < 1100);
    const indicator = $('#irs-indicator'); if (indicator) indicator.classList.toggle('visible', t < irsUntil);
    const bar = $('#are-bar'), pending = handler.pending;
    if (bar) {
      bar.classList.toggle('visible', !!pending);
      const displayTime = handler.paused ? handler.pauseStarted : handler.time;
      const percent = pending ? Math.max(0, Math.min(100, 100 * (displayTime - pending.since) / Math.max(1, pending.at - pending.since))) : 0;
      $('.are-fill', bar).style.width = percent + '%'; bar.setAttribute('aria-valuenow', Math.round(percent));
    }
    for (const cap of $$('[data-live-key]')) cap.classList.toggle('pressed', [...handler.held.values()].some(k => k.action === cap.dataset.liveKey));
  }

  function captureHTML() {
    $('.capture-overlay')?.remove();
    if (!capture) return;
    app.insertAdjacentHTML('beforeend', `<div class="capture-overlay" role="dialog" aria-modal="true" aria-label="キーを設定"><div class="modal"><div class="eyebrow">KEY BINDING</div><h2>${ACTION_NAMES[capture.action]}</h2><div class="capture-icon">⌨</div>${capture.conflict ? `<p class="conflict">${escape(friendly(capture.code))} は「${ACTION_NAMES[capture.conflict]}」に使われています。<br>この操作の${escape(friendly(bindings[capture.action][capture.index ?? 0]))} と入れ替えますか？</p><button class="primary" data-act="swap-key">入れ替える</button>` : '<p>割り当てるキーを押してください…<br>Esc でキャンセル、Tab でボタンを選べます。</p><button class="small" data-act="bind-escape">Esc を割り当てる</button><button class="small" data-act="bind-tab">Tab を割り当てる</button>'}<button class="quiet" data-act="cancel-capture">キャンセル</button></div></div>`);
    if (!capture.conflict) {
      const prompt = $('.capture-overlay p'); prompt.tabIndex = -1; prompt.focus();
    } else $('.capture-overlay button')?.focus();
  }
  function endCapture(rerender = false) {
    const previous = capture; capture = null;
    if (rerender) render(false); else $('.capture-overlay')?.remove();
    if (previous) $$('[data-act=capture]').find(el => el.dataset.action === previous.action &&
      (previous.index === null ? el.dataset.index === undefined : Number(el.dataset.index) === previous.index))?.focus();
  }
  function acceptKey(code) {
    if (!code || code === 'Unidentified') return;
    const conflict = Object.keys(bindings).find(action => bindings[action].includes(code));
    if (conflict === capture.action) { endCapture(); return; }
    if (conflict) { capture.code = code; capture.conflict = conflict; captureHTML(); return; }
    try { bindings = E.rebindKeys(bindings, capture.action, capture.index, code); }
    catch (error) { toast(error.message); return; }
    save(); endCapture(true); toast('キー設定の保存、完了ですっ。');
  }
  function clickAction(button) {
    if (button.closest?.('.gameover') && now() < gameOverInputUntil) return;
    const act = button.dataset.act;
    if (act === 'menu') { save(); go('menu'); }
    else if (act === 'dressup') openDressup();
    else if (act === 'close-dressup') closeDressup();
    else if (act === 'dressup-select') {
      const key = button.dataset.kind === 'hair' ? 'hairSkin' : 'outfitSkin';
      ui[key] = key === 'hairSkin' ? M.normalizeHairSkin(button.dataset.value) : M.normalizeOutfitSkin(button.dataset.value);
      save(); updateDressup();
    } else if (act === 'dressup-face') { dressupFace = M.EXPRESSIONS.includes(button.dataset.value) ? button.dataset.value : 'normal'; updateDressup(); }
    else if (act === 'dressup-motion') { dressupPaused = !dressupPaused; dressupMotion(); }
    else if (act === 'mode-finesse' || act === 'mode-free' || act === 'mode-spin') { menuMode = act === 'mode-free' ? 'free' : act === 'mode-spin' ? 'spin' : 'finesse'; go(menuMode === 'spin' ? 'spins' : menuMode); }
    else if (act === 'spin-continue' || act === 'spin-drill') startSpin(button.dataset.id);
    else if (act === 'spins') go('spins');
    else if (act === 'free') startPlay(0, true);
    else if (act === 'restart') restartFree();
    else if (act === 'drill') startPlay();
    else if (act === 'tutorial') startLesson(progress.current);
    else if (act === 'lessons') go('lessons');
    else if (act === 'lesson') startLesson(Number(button.dataset.index));
    else if (act === 'next-lesson') lessonIndex === 11 ? startPlay() : startLesson(lessonIndex + 1);
    else if (act === 'previous-lesson') startLesson(lessonIndex - 1);
    else if (act === 'demo' || act === 'table-demo') {
      resetCombo();
      audio.stopCues();
      releaseAll(); session = null; tryMode = false; lessonMessage = ''; demoVariant = Number(button.dataset.index); selectedDemo = null;
      if (act === 'table-demo') {
        const group = lessons[lessonIndex].demo.placementGroups[demoVariant];
        selectedDemo = { piece: lessons[lessonIndex].demo.piece, sequence: group.actions, target: group.placements[0] };
      }
      render(false);
    } else if (act === 'try-it') startTryIt();
    else if (act === 'settings') openSettings();
    else if (act === 'toggle-handling') {
      handlingOpen = !handlingOpen;
      button.setAttribute('aria-expanded', handlingOpen);
      $('span[aria-hidden]', button).textContent = handlingOpen ? '−' : '＋';
      $('#live-handling-controls').hidden = !handlingOpen;
      if ($('#play-stats')) $('#play-stats').hidden = handlingOpen;
      $('#board')?.focus({ preventScroll: true });
    } else if (act === 'adjust-handling') {
      if (document.activeElement && numericEditor(document.activeElement)) commitNumeric(document.activeElement);
      const field = HANDLING.find(field => field.key === button.dataset.handlingKey);
      const value = Number((settings[field.key] + Number(button.dataset.step) * field.step).toFixed(10));
      updateSettings({ [field.key]: value });
      processEvents();
      $('#board')?.focus({ preventScroll: true });
    } else if (act === 'adjust-ui') {
      const key = button.dataset.uiKey;
      if (UI_NUMERIC[key]) updateNumericUI(key, Number((ui[key] + Number(button.dataset.step) * UI_NUMERIC[key][2]).toFixed(10)));
    } else if (act === 'close-settings') closeSettings();
    else if (act === 'preview-cue') audio.piece(button.dataset.piece);
    else if (act === 'pause') { pauseSession(); showPause(); }
    else if (act === 'resume') resumePlay();
    else if (act === 'retry') { releaseAll(); session.retry(now()); processEvents(); }
    else if (act === 'skip') { releaseAll(); session.skip(now()); processEvents(); }
    else if (act === 'hint') { hint = !hint; updateHint(); if (hint && isSpin()) setCoach(session.drill.tip, 'thinking'); else if (hint) setCoach(`この目標は${session.round.optimal}入力ですっ♪ ` + session.round.target.actions.map(actionLabel).join(' → '), 'thinking'); }
    else if (act === 'records' || act === 'records-session') {
      resetCombo();
      pauseSession(); statsScope = act === 'records-session' ? 'session' : 'total'; screen = 'records'; render();
    } else if (act === 'stats-scope') { statsScope = statsScope === 'total' ? 'session' : 'total'; render(); }
    else if (act === 'return-play') { screen = 'play'; render(); }
    else if (act === 'sprint') go('sprint');
    else if (act === 'start-sprint') startPlay(Number(button.dataset.length));
    else if (act === 'custom-sprint') {
      const input = $('#custom-length'), length = Number(input.value);
      if (Number.isInteger(length) && length >= 1 && length <= 9999) startPlay(length);
      else { input.reportValidity(); toast('目標数は1〜9999の整数でお願いしますね。'); }
    } else if (act === 'handling-preset') {
      if (HANDLING_PRESETS[button.dataset.preset]) updateSettings(HANDLING_PRESETS[button.dataset.preset]);
    } else if (act === 'reset-handling') { updateSettings(E.DEFAULT_SETTINGS); toast('ハンドリング、初期値に戻せましたっ。'); }
    else if (act === 'reset-keys') { bindings = copy(DEFAULT_KEYS); save(); render(false); }
    else if (act === 'reset-settings') {
      settings = { ...E.DEFAULT_SETTINGS }; ui = { ...UI_DEFAULTS }; bindings = copy(DEFAULT_KEYS);
      updateSettings(settings); updateOptions(); render(false); toast('すべての設定、初期化できましたっ。');
    } else if (act === 'export') {
      $('#settings-json').value = JSON.stringify({ version: 1, settings, ui, bindings }, null, 2);
      $('#settings-json').focus(); $('#settings-json').select(); $('#import-status').textContent = '選択したJSONをコピーしてください。';
    } else if (act === 'import') {
      try {
        const next = validatePreferences(JSON.parse($('#settings-json').value));
        ({ settings, ui, bindings } = next); updateSettings(settings); updateOptions(); render(false);
        $('#import-status').textContent = '✓ インポートして保存しました。';
      } catch (error) { $('#import-status').textContent = '読み込めませんでした：' + error.message; }
    } else if (act === 'reset-stats') {
      resetCombo();
      totalStats.reset(); if (session) session.stats.reset(); save(); render(false); toast('練習の記録、リセットできましたっ。');
    } else if (act === 'capture') { capture = { action: button.dataset.action, index: button.dataset.index === undefined ? null : Number(button.dataset.index) }; captureHTML(); }
    else if (act === 'cancel-capture') endCapture();
    else if (act === 'bind-escape') acceptKey('Escape');
    else if (act === 'bind-tab') acceptKey('Tab');
    else if (act === 'swap-key') {
      bindings = E.rebindKeys(bindings, capture.action, capture.index, capture.code);
      save(); endCapture(true); toast('キーの入れ替え、完了ですっ。');
    } else if (act === 'remove-key') { bindings[button.dataset.action].splice(Number(button.dataset.index), 1); save(); render(false); }
  }
  document.addEventListener('mousedown', event => {
    if (event.target.closest?.('[data-live-handling]') && !event.target.dataset?.setting && !event.target.dataset?.engineToggle) event.preventDefault();
  });
  document.addEventListener('focusin', event => {
    focusedHelp = helpOwner(event.target);
    updateSettingTooltip();
    if ((event.target.dataset?.setting || event.target.dataset?.engineToggle) && event.target.closest?.('[data-live-handling]')) releaseAll();
  });
  document.addEventListener('click', event => { const button = event.target.closest('button[data-act]'); if (button && !button.disabled) clickAction(button); });
  function numericEditor(input) {
    return input.type === 'number' && (input.dataset?.setting || UI_NUMERIC[input.dataset?.ui]);
  }
  function commitNumeric(input) {
    if (!numericDrafts.delete(input)) return;
    const key = input.dataset.setting, uiKey = input.dataset.ui;
    if (!key && !UI_NUMERIC[uiKey]) return;
    if (input.value.trim() && Number.isFinite(Number(input.value)) && Number(input.value) !== (key ? settings[key] : ui[uiKey])) {
      if (key) {
        const field = HANDLING.find(field => field.key === key);
        const value = snapNumeric(Number(input.value), ...E.SETTING_LIMITS[key], field.step);
        if (value !== settings[key]) { updateSettings({ [key]: value }); processEvents(); }
      } else {
        const value = snapNumeric(Number(input.value), ...UI_NUMERIC[uiKey]);
        if (value !== ui[uiKey]) updateNumericUI(uiKey, value);
      }
    }
    input.value = key ? settings[key] : ui[uiKey];
  }
  // A number editor owns its raw draft until commit. In particular, assigning
  // .value during input destroys native intermediate text such as '.' or '0.'.
  document.addEventListener('focusout', event => {
    if (numericEditor(event.target)) commitNumeric(event.target);
    focusedHelp = helpOwner(event.relatedTarget);
    updateSettingTooltip();
  });
  document.addEventListener('input', event => {
    const input = event.target;
    if (numericEditor(input)) { numericDrafts.add(input); return; }
    if (input.dataset.setting) {
      if (!input.value || !Number.isFinite(Number(input.value))) return;
      const key = input.dataset.setting, raw = input.value, value = Number(raw);
      const field = HANDLING.find(field => field.key === key);
      updateSettings({ [key]: snapNumeric(value, ...E.SETTING_LIMITS[key], field.step) });
      if (value === settings[key]) input.value = raw;
      processEvents();
      for (const other of $$(`[data-setting="${key}"]`)) if (other !== input) other.value = settings[key];
    } else if (['volume', 'pieceCueVolume'].includes(input.dataset.ui)) {
      if (!input.value || !Number.isFinite(Number(input.value))) return;
      const raw = input.value, key = input.dataset.ui, value = Number(raw);
      updateNumericUI(key, value);
      if (ui[key] === value) input.value = raw;
    }
  });
  document.addEventListener('change', event => {
    const input = event.target;
    if (numericEditor(input)) { commitNumeric(input); return; }
    if (input.hasAttribute('data-hair-skin') || input.hasAttribute('data-outfit-skin')) {
      const isHair = input.hasAttribute('data-hair-skin');
      const key = isHair ? 'hairSkin' : 'outfitSkin';
      ui[key] = isHair ? M.normalizeHairSkin(input.value) : M.normalizeOutfitSkin(input.value);
      input.value = ui[key]; save();
      $('#appearance-preview').innerHTML = appearancePreview();
      $('#appearance-storage').textContent = storageOK ? '見た目の選択を保存しました。' : '保存できないため、この起動中だけ選択を保持します。';
    } else if (input.dataset.engineToggle) { updateSettings({ [input.dataset.engineToggle]: input.checked }); processEvents(); }
    else if (UI_NUMERIC[input.dataset.ui]) input.value = ui[input.dataset.ui];
    else if (input.dataset.ui === 'pieceCueTiming') { ui.pieceCueTiming = input.value; audio.stopCues(); save(); }
    else if (input.dataset.ui && !['volume', 'pieceCueVolume'].includes(input.dataset.ui)) {
      if (input.dataset.ui === 'zeroFault' && ui.zeroFault !== input.checked && screen === 'play') resetCombo();
      ui[input.dataset.ui] = input.checked; updateOptions();
    }
    else if (input.dataset.setting) input.value = settings[input.dataset.setting];
    else if (input.dataset.pieceFilter) {
      const pieces = $$('[data-piece-filter]:checked').map(el => el.dataset.pieceFilter);
      if (!pieces.length) { input.checked = true; toast('ミノは1種類以上、選んでくださいね。'); }
      else updatePractice({ ...practice, pieces });
    } else if (input.id === 'area') updatePractice({ ...practice, area: input.value });
    else if (input.id === 'min-column' || input.id === 'max-column') {
      const min = Number($('#min-column').value), max = Number($('#max-column').value);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 10 || min > max) { toast('列は1〜10、開始列≦終了列でお願いしますね。'); $('#practice-wrap').innerHTML = practiceHTML(); }
      else updatePractice({ ...practice, minColumn: min, maxColumn: max });
    } else if (input.dataset.practice) updatePractice({ ...practice, [input.dataset.practice]: input.checked });
  });

  function editable(target) { return target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable); }
  function navigateDialog(event, root) {
    const buttons = $$('button:not(:disabled)', root).filter(el => el.offsetParent !== null);
    if (!buttons.length) return;
    if (event.code === 'Tab' || ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
      const back = event.code === 'Tab' ? event.shiftKey : ['ArrowUp', 'ArrowLeft'].includes(event.code);
      const index = buttons.indexOf(document.activeElement);
      buttons[index < 0 ? back ? buttons.length - 1 : 0 : (index + (back ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  }
  document.addEventListener('keydown', event => {
    audio.unlock();
    if (event.code === 'Escape' && activeHelp) {
      event.preventDefault(); dismissSettingTooltip();
      // Hover-only help must not consume the settings page's back shortcut.
      if (screen !== 'settings' || helpOwner(event.target)) return;
    }
    if (capture) {
      if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) endCapture(); return; }
      const modal = $('.capture-overlay');
      if (event.code === 'Tab' || capture.conflict) { navigateDialog(event, modal); return; }
      // Buttons retain native Enter/Space activation after Tab navigation. The
      // initial prompt itself captures Enter/Space so either can be rebound.
      if (event.target.closest?.('button') && ['Enter', 'Space'].includes(event.code)) return;
      event.preventDefault(); if (!event.repeat) acceptKey(event.code); return;
    }
    if (numericEditor(event.target) && event.code === 'Enter') {
      event.preventDefault(); commitNumeric(event.target);
      if (event.target.closest?.('[data-live-handling]')) { event.target.blur(); $('#board')?.focus({ preventScroll: true }); }
      return;
    }
    const action = Object.keys(bindings).find(name => bindings[name].includes(event.code));
    // Also guard programmatic/assistive focus on these pointer-only buttons:
    // bound keys, arrows and Space belong to play, never native activation.
    if ((event.target.dataset?.setting || event.target.dataset?.engineToggle) && event.target.closest?.('[data-live-handling]')) {
      if (['Escape', 'Enter'].includes(event.code)) { event.preventDefault(); event.target.blur(); $('#board')?.focus({ preventScroll: true }); }
      return;
    }
    const onHandling = !!event.target.closest?.('[data-live-handling]')?.hasAttribute?.('data-live-handling');
    if (onHandling) {
      $('#board')?.focus({ preventScroll: true });
      if (action || event.code.startsWith('Arrow') || ['Space', 'Enter'].includes(event.code)) event.preventDefault();
    }
    const onBoard = onHandling || event.target === $('#board') || event.target === document.body || event.target === document;
    if (screen === 'dressup') {
      if(event.code === 'Escape') { event.preventDefault(); if(!event.repeat) closeDressup(); }
      return;
    }
    if (screen === 'settings') {
      if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) closeSettings(); }
      return;
    }
    if (screen === 'tutorial' && event.code === 'Escape') { event.preventDefault(); if (!event.repeat) go('menu'); return; }
    const overlay = $('.overlay');
    if (overlay) {
      if (isFree() && session.gameOver) {
        // Cancel native button activation too, including Space held at top-out.
        if (event.repeat || now() < gameOverInputUntil && (['Enter', 'Space'].includes(event.code) || action === 'retry')) {
          event.preventDefault(); return;
        }
        if (event.target.closest?.('button') && ['Enter', 'Space'].includes(event.code)) return;
        if (action === 'retry') { event.preventDefault(); if (!event.repeat) restartFree(); }
        else if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) go('menu'); }
        else navigateDialog(event, overlay);
        return;
      }
      if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) resumePlay(); }
      else if (event.target.closest?.('button') && ['Enter', 'Space'].includes(event.code)) return;
      else if (action === 'pause') { event.preventDefault(); if (!event.repeat) resumePlay(); }
      else if (action === 'settings') { event.preventDefault(); if (!event.repeat) openSettings(); }
      else navigateDialog(event, overlay);
      return;
    }
    // Respect an explicit gameplay rebind of Escape on board. In native UI,
    // Escape always closes the editor/overlay or pauses the current drill.
    if (screen === 'play' && event.code === 'Escape' && (!onBoard || !action || action === 'pause')) {
      event.preventDefault(); if (!event.repeat) { pauseSession(); processEvents(); showPause(); } return;
    }
    if (event.code === 'Escape' && !['menu', 'play', 'tutorial'].includes(screen)) {
      event.preventDefault(); if (!event.repeat) go('menu'); return;
    }
    if (editable(event.target)) return;
    const buttonActivation = !onHandling && event.target.closest?.('button') && ['Enter', 'Space'].includes(event.code);
    if ((screen === 'play' || screen === 'tutorial' && tryMode) && session && !buttonActivation) {
      // Shift+Tab always reaches native controls. Arrow keys navigate controls while
      // the board is unfocused; gameplay shortcuts use their bindings on board.
      if ((event.code !== 'Tab' || onBoard && !event.shiftKey) && (onBoard || !event.code.startsWith('Arrow')) && action) {
        event.preventDefault(); if (event.repeat) return;
        if (action === 'settings') { openSettings(); return; }
        if (session.pausedAt !== null) return;
        if (screen === 'tutorial' && action === 'skip') { choosePracticeTarget(); processEvents(); return; }
        session.keyDown(action, now(), { code: event.code }); processEvents(); return;
      }
    }
    if (screen === 'tutorial' && !tryMode && onBoard) {
      if (['ArrowRight', 'Enter', 'Space'].includes(event.code)) { event.preventDefault(); if (!event.repeat) lessonIndex === 11 ? startPlay() : startLesson(lessonIndex + 1); return; }
      if (event.code === 'ArrowLeft') { event.preventDefault(); if (!event.repeat) startLesson(lessonIndex - 1); return; }
    }
    if (action === 'settings') { event.preventDefault(); if (!event.repeat) openSettings(); return; }
    // During play, unbound arrows/Space/Enter on the board do nothing: they
    // must not walk focus onto a button that the next Space would press.
    if ((screen === 'play' || screen === 'tutorial' && tryMode) && session && onBoard &&
      (event.code.startsWith('Arrow') || ['Space', 'Enter'].includes(event.code))) { event.preventDefault(); return; }
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      const buttons = $$('button:not(:disabled)', $('main')).filter(el => el.offsetParent !== null);
      if (!buttons.length) return;
      event.preventDefault();
      const direction = ['ArrowDown', 'ArrowRight'].includes(event.code) ? 1 : -1;
      const index = buttons.indexOf(document.activeElement);
      const next = buttons[(index + direction + buttons.length) % buttons.length];
      next.focus();
    }
  });
  document.addEventListener('keyup', event => {
    if (!session) return;
    const held = session.handler.held.get(event.code);
    if (held) { event.preventDefault(); session.keyUp(held.action, now(), { code: event.code }); processEvents(); }
  });
  function blur() {
    dismissSettingTooltip();
    // Freeze first, then release: releasing a newer direction cannot resume an
    // older charged direction beneath a pause overlay.
    if (session?.running) { pauseSession(); processEvents(); showPause(); }
    else releaseAll();
    save();
  }
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', () => { if (document.hidden) blur(); });
  let frameId = 0;
  function startFrames() { if (!frameId) frameId = requestAnimationFrame(frame); }
  window.addEventListener('pagehide', () => { blur(); cancelAnimationFrame(frameId); frameId = 0; });
  window.addEventListener('pageshow', startFrames);
  document.addEventListener('scroll', updateSettingTooltip, true);
  window.addEventListener('resize', () => { fitLessonBoard(); drawMinis(); updateSettingTooltip(); });
  function frame() {
    frameId = 0;
    const t = now();
    if (screen === 'play' || screen === 'tutorial' && tryMode) { session?.update(t); processEvents(); }
    if (screen === 'tutorial' && !tryMode) updateDemo(t);
    if (screen === 'play' || screen === 'tutorial') renderBoard(t);
    if (screen === 'play' && t - lastHUD > 90) {
      lastHUD = t; updateHUD(t);
      const attempts = session.stats?.attempts;
      if (!isSpin() && attempts && attempts % 7 === 0 && attempts !== lastTipAttempt && t - feedbackAt > 3200) {
        lastTipAttempt = attempts; setCoach(M.TIPS[tipIndex++ % M.TIPS.length], 'normal');
      }
    }
    if (toastUntil && t >= toastUntil) dismissToast();
    startFrames();
  }

  // Public, serializable browser-test seam. Gameplay is always driven by normal
  // KeyboardEvent dispatch or page.keyboard; no helper changes counts/results.
  window.__mirutet = Object.freeze({
    settingHelp: SETTING_HELP,
    getState() {
      const handler = screen === 'tutorial' && !tryMode ? demo?.handler : session?.handler;
      return copy({ screen, menuMode, mode: session ? isFree() ? 'free' : isSpin() ? 'spin' : 'finesse' : null, settings, ui, bindings, practice, progress, spinProgress, spinStats: spinStats.snapshot(), lessonIndex, tryMode, tryIndex, tryDone,
        expression, bubble, irsCount, storageOK, hint, lastResult, trace, combo: session?.combo.snapshot(),
        round: session?.round, stats: session?.snapshot(), totalStats: totalStats.snapshot(),
        active: handler?.active, pending: handler?.pending, inputs: handler?.inputs, inputCount: handler?.inputCount,
        held: handler ? [...handler.held.keys()] : [], heldPiece: handler?.heldPiece, flags: handler?.flags, lastMove: handler?.lastMove,
        paused: session?.pausedAt !== null && !!session,
        demo: demo ? { type: demo.variant.type, actions: demo.actions, target: demo.target } : null, sprintResult });
    },
    chooseTarget(type, target, { delay } = {}) {
      if (!session?.running || isFree() || isSpin() || session.pausedAt !== null) throw new Error('Open a running drill first');
      const optimal = E.finesseFor(type, target, session.settings);
      if (!optimal) throw new Error('Unreachable debug target');
      releaseAll(); session._newRound(type, optimal); session.handler.board = session.boardTemplate.clone();
      session.handler.scheduleSpawn(type, now(), delay ?? session.settings.are); processEvents();
      $('#board')?.focus({ preventScroll: true }); return copy(optimal);
    },
    dispatch(code, down = true) { document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true })); },
    storageKey: STORAGE
  });
  render(); startFrames();
})();
