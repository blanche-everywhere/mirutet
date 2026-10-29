/* Miru Tet — DOM-free, dependency-free engine.
 * Classic script: globalThis.MiruTet; Node: require('./src/engine.js').
 *
 * Coordinates are integer cells, x right, y UP. Board rows are bottom first.
 * State {type,x,y,rot}: x/y are the SRS MATRIX origin, rot is 0/1/2/3
 * (0/R/2/L). Target {rot,x}: x is the OCCUPIED bounding box's left column.
 * Targets and locks are compared by absolute cell sets, never rotation names.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MiruTet = api;
})(globalThis, function () {
  'use strict';

  const WIDTH = 10, HEIGHT = 40, VISIBLE_HEIGHT = 20;
  const PIECE_TYPES = Object.freeze(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
  const ROTATIONS = Object.freeze(['0', 'R', '2', 'L']);
  function deepFreeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }
  const COLORS = deepFreeze({ I: '#00F0F0', O: '#F0F000', T: '#A000F0',
    S: '#00F000', Z: '#F00000', J: '#0000F0', L: '#F0A000' });
  function pieceType(type) {
    if (!PIECE_TYPES.includes(type)) throw new RangeError('Unknown piece: ' + type);
    return type;
  }
  function rotation(rot = 0) {
    if (typeof rot === 'string') {
      const index = ROTATIONS.indexOf(rot);
      if (index < 0) throw new RangeError('Unknown rotation: ' + rot);
      return index;
    }
    if (!Number.isInteger(rot)) throw new RangeError('Rotation must be an integer');
    return ((rot % 4) + 4) % 4;
  }

  // Spawn matrices: JLSTZ origin (3,19), I origin (3,18), O origin (3,19).
  // I: (3,20),(4,20),(5,20),(6,20). O: (4,20),(5,20),(4,21),(5,21).
  // T: (3,20),(4,20),(5,20),(4,21); J has (3,21), L has (5,21).
  // S: (3,20),(4,20),(4,21),(5,21); Z is its horizontal mirror.
  // Thus rows 21–22 (1-indexed), left-rounded 3-wide spawns, flat side down.
  const BASE = {
    I: [[0, 2], [1, 2], [2, 2], [3, 2]],
    O: [[1, 1], [2, 1], [1, 2], [2, 2]],
    T: [[0, 1], [1, 1], [2, 1], [1, 2]],
    S: [[0, 1], [1, 1], [1, 2], [2, 2]],
    Z: [[1, 1], [2, 1], [0, 2], [1, 2]],
    J: [[0, 1], [1, 1], [2, 1], [0, 2]],
    L: [[0, 1], [1, 1], [2, 1], [2, 2]]
  };
  const SHAPES = {};
  for (const type of PIECE_TYPES) {
    const pivot = type === 'I' ? 1.5 : 1;
    SHAPES[type] = [BASE[type]];
    for (let r = 1; r < 4; r++) {
      SHAPES[type].push(type === 'O' ? BASE.O.map(c => c.slice()) :
        SHAPES[type][r - 1].map(([x, y]) => [pivot + (y - pivot), pivot - (x - pivot)]));
    }
  }
  deepFreeze(SHAPES);

  // Guideline SRS, NOT Arika/TETR.IO's symmetric I quarter-turn variant.
  // Independent published implementation for cross-checking the standard data:
  // Techmino parts/RSlist.lua (local SRS); source links: docs/REVIEW.md.
  const KICKS_JLSTZ = deepFreeze({
    '0>R': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    'R>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    'R>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>R': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>L': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    'L>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    'L>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>L': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  });
  const KICKS_I = deepFreeze({
    '0>R': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    'R>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    'R>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>R': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>L': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    'L>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    'L>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>L': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  });
  // TETR.IO SRS+ 180 extension only; O remains a placement-wise no-op.
  // y-up basic-rotation offsets, including test zero, in priority order.
  // I uses ONLY the first two tests (not the six JLSTZ tests).
  // Cross-check: getPatternRotate180 / SRSPlus in
  // torchlight's sfinder 180 patch; source links: docs/REVIEW.md.
  const KICKS_180 = deepFreeze({
    '0>2': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
    'R>L': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
    '2>0': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
    'L>R': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]]
  });
  const KICKS_I_180 = deepFreeze(Object.fromEntries(
    Object.entries(KICKS_180).map(([key, value]) => [key, value.slice(0, 2)])));
  const NO_KICK = deepFreeze([[0, 0]]);
  function kickTests(type, from, to) {
    pieceType(type);
    from = rotation(from); to = rotation(to);
    if (type === 'O' || from === to) return NO_KICK;
    const key = ROTATIONS[from] + '>' + ROTATIONS[to];
    return (Math.abs(from - to) === 2 ?
      (type === 'I' ? KICKS_I_180 : KICKS_180) :
      (type === 'I' ? KICKS_I : KICKS_JLSTZ))[key];
  }
  function cells(state) {
    return SHAPES[pieceType(state.type)][rotation(state.rot)].map(
      ([x, y]) => [state.x + x, state.y + y]);
  }
  function cellsKey(points) {
    return points.map(([x, y]) => [x, y]).sort((a, b) => a[1] - b[1] || a[0] - b[0])
      .map(c => c.join(',')).join(';');
  }
  function sameCells(a, b) { return cellsKey(a) === cellsKey(b); }
  function bounds(state) {
    const points = cells(state);
    const xs = points.map(c => c[0]), ys = points.map(c => c[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  class Board {
    constructor(width = WIDTH, height = HEIGHT, rows) {
      if (typeof width === 'object') ({ width = WIDTH, height = HEIGHT, rows } = width);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4) {
        throw new RangeError('Invalid board dimensions');
      }
      this.width = width; this.height = height;
      if (rows && (rows.length !== height || rows.some(row => row.length !== width))) {
        throw new RangeError('Rows must match board dimensions (bottom first)');
      }
      this.rows = rows ? rows.map(row => Array.from(row)) :
        Array.from({ length: height }, () => Array(width).fill(null));
    }
    inside(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < this.width && y >= 0 && y < this.height; }
    get(x, y) { return this.inside(x, y) ? this.rows[y][x] : undefined; }
    set(x, y, value = '#') {
      if (!this.inside(x, y)) throw new RangeError('Cell outside board');
      this.rows[y][x] = value; return this;
    }
    fits(state) { return cells(state).every(([x, y]) => this.inside(x, y) && !this.rows[y][x]); }
    clone() { return new Board(this.width, this.height, this.rows); }
    clear() { this.rows.forEach(row => row.fill(null)); return this; }
    isEmpty() { return this.rows.every(row => row.every(c => !c)); }
    lock(state) {
      if (!this.fits(state)) throw new RangeError('Cannot lock an overlapping/outside piece');
      const points = cells(state);
      points.forEach(([x, y]) => this.set(x, y, state.type));
      return points;
    }
    clearLines() {
      const kept = this.rows.filter(row => !row.every(Boolean));
      const count = this.height - kept.length;
      while (kept.length < this.height) kept.push(Array(this.width).fill(null));
      this.rows = kept; return count;
    }
  }
  function spawnPiece(type, options = {}) {
    pieceType(type);
    const board = options.board || new Board();
    let state = { type, x: Math.floor(board.width / 2) - 2, y: type === 'I' ? 18 : 19, rot: 0 };
    if (options.spawnDrop && board.fits(state)) state = movePiece(board, state, 0, -1) || state;
    return state;
  }
  function movePiece(board, state, dx, dy = 0) {
    const next = { ...state, x: state.x + dx, y: state.y + dy };
    return board.fits(next) ? next : null;
  }
  function turnAmount(turn) {
    if (turn === 'CW') return 1;
    if (turn === 'CCW') return -1;
    if (turn === '180') return 2;
    if ([1, -1, 2].includes(turn)) return turn;
    throw new RangeError('Turn must be CW, CCW, 180, +1, -1 or 2');
  }
  function rotatePiece(board, state, turn, options = {}) {
    turn = turnAmount(turn);
    if (turn === 2 && options.allow180 === false) return null;
    const rot = rotation(rotation(state.rot) + turn);
    for (const [dx, dy] of kickTests(state.type, state.rot, rot)) {
      const next = { ...state, x: state.x + dx, y: state.y + dy, rot };
      if (board.fits(next)) return next;
    }
    return null;
  }
  function slidePiece(board, state, direction) {
    if (direction !== -1 && direction !== 1) throw new RangeError('Direction must be -1 or 1');
    let next;
    while ((next = movePiece(board, state, direction))) state = next;
    return state;
  }
  function hardDrop(board, state) {
    if (!board.fits(state)) return null;
    let next;
    while ((next = movePiece(board, state, 0, -1))) state = next;
    return state;
  }

  // Mulberry32 with a stable FNV-1a string seed; no global random state.
  function createRNG(seed = 0) {
    if (typeof seed === 'string') {
      let hash = 2166136261;
      for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
      seed = hash;
    }
    if (!Number.isFinite(seed)) throw new RangeError('Invalid seed');
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let n = Math.imul(state ^ (state >>> 15), 1 | state);
      n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randomUnit(rng) {
    const n = rng();
    if (!(n >= 0 && n < 1)) throw new RangeError('RNG must return [0,1)');
    return n;
  }
  function normalizePieces(pieces = PIECE_TYPES) {
    const selected = Array.from(new Set(pieces));
    if (!selected.length) throw new RangeError('Select at least one piece');
    selected.forEach(pieceType); return selected;
  }
  class Bag {
    constructor(options = {}) {
      if (typeof options === 'function') options = { rng: options };
      this.rng = options.rng || (options.seed === undefined ? Math.random : createRNG(options.seed));
      // Filtered practice shuffles one of EACH selected piece per bag.
      this.pieces = normalizePieces(options.pieces);
      this.queue = [];
    }
    _fill(count) {
      while (this.queue.length < count) {
        const bag = this.pieces.slice();
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(randomUnit(this.rng) * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        this.queue.push(...bag);
      }
    }
    next() { this._fill(1); return this.queue.shift(); }
    peek(count = 5) {
      if (!Number.isInteger(count) || count < 0) throw new RangeError('Invalid preview size');
      this._fill(count); return this.queue.slice(0, count);
    }
  }

  const ACTION_LABELS = deepFreeze({ left: '←', right: '→', dasLeft: 'DAS←',
    dasRight: 'DAS→', cw: 'CW', ccw: 'CCW', rotate180: '180', softDrop: '↓' });
  function applyAction(board, state, action, options = {}) {
    switch (action) {
      case 'left': return movePiece(board, state, -1);
      case 'right': return movePiece(board, state, 1);
      case 'dasLeft': return slidePiece(board, state, -1);
      case 'dasRight': return slidePiece(board, state, 1);
      case 'cw': return rotatePiece(board, state, 1, options);
      case 'ccw': return rotatePiece(board, state, -1, options);
      case 'rotate180': return rotatePiece(board, state, 2, options);
      default: throw new RangeError('Not a solver action: ' + action);
    }
  }
  function placementFor(type, target, options = {}) {
    const board = options.board || new Board();
    const rot = rotation(target.rot);
    if (!Number.isInteger(target.x)) return null;
    const localMin = Math.min(...SHAPES[pieceType(type)][rot].map(c => c[0]));
    const state = { ...spawnPiece(type, { board, spawnDrop: options.spawnDrop }), rot, x: target.x - localMin };
    const lock = hardDrop(board, state);
    return lock && { type, rot, x: target.x, state: lock, cells: cells(lock), key: cellsKey(cells(lock)) };
  }
  const solverCache = new Map();
  function cloneSolution(solution) {
    return solution && { ...solution, cells: solution.cells.map(c => c.slice()),
      state: { ...solution.state }, actions: solution.actions.slice(), sequence: solution.sequence.slice() };
  }
  /* Unit-cost BFS, including both tap and full DAS edges at EVERY state.
   * Collision and all kicks share the gameplay primitive, but tests implement
   * a separate matrix simulator and iterative-deepening oracle independently.
   * y is part of the visited key: stack/floor kicks can change height. Soft-drop
   * edges/tucks requiring deliberate descent are intentionally out of scope.
   * Rotation edges first make ties deterministic and prefer rotation first.
   */
  function solveAll(type, options = {}) {
    pieceType(type);
    const board = options.board || new Board();
    const start = options.start || spawnPiece(type, { board, spawnDrop: options.spawnDrop });
    if (start.type !== type) throw new RangeError('Solver start piece differs');
    const cacheKey = JSON.stringify([type, options.allow180 !== false, start, board.width, board.height, board.rows]);
    if (solverCache.has(cacheKey)) return solverCache.get(cacheKey);
    const placements = new Map();
    if (board.fits(start)) {
      const actions = ['cw', 'ccw', ...(options.allow180 === false ? [] : ['rotate180']),
        'left', 'right', 'dasLeft', 'dasRight'];
      const stateKey = s => [s.x, s.y, type === 'O' ? 0 : s.rot].join(',');
      const nodes = [{ state: { ...start, rot: rotation(start.rot) }, actions: [] }];
      const seen = new Set([stateKey(nodes[0].state)]);
      for (let head = 0; head < nodes.length; head++) {
        const node = nodes[head], lock = hardDrop(board, node.state);
        const points = cells(lock), key = cellsKey(points);
        if (!placements.has(key)) placements.set(key, { type, rot: lock.rot,
          x: bounds(lock).minX, state: lock, cells: points, key,
          count: node.actions.length, actions: node.actions,
          sequence: node.actions.map(a => ACTION_LABELS[a]) });
        for (const action of actions) {
          const next = applyAction(board, node.state, action, options);
          if (!next || seen.has(stateKey(next))) continue;
          seen.add(stateKey(next)); nodes.push({ state: next, actions: node.actions.concat(action) });
        }
      }
    }
    if (solverCache.size >= 32) solverCache.delete(solverCache.keys().next().value);
    solverCache.set(cacheKey, placements);
    return placements;
  }
  function allPlacements(type, options = {}) {
    return Array.from(solveAll(type, options).values(), cloneSolution)
      .sort((a, b) => a.rot - b.rot || a.x - b.x);
  }
  function finesseFor(type, target, options = {}) {
    const points = Array.isArray(target) ? target : target.cells;
    const placement = points ? { key: cellsKey(points) } : placementFor(type, target, options);
    return placement ? cloneSolution(solveAll(type, options).get(placement.key) || null) : null;
  }

  const DEFAULT_SETTINGS = deepFreeze({ das: 110, arr: 0, sdf: 40, dcd: 0,
    are: 80, gravity: 0, lockDelayOn: true, lockDelay: 500,
    irs: true, ihs: false, allow180: true, spawnDrop: false });
  const SETTING_LIMITS = deepFreeze({ das: [0, 500], arr: [0, 200], sdf: [1, 41],
    dcd: [0, 200], are: [0, 500], gravity: [0, 20], lockDelay: [100, 5000] });
  function normalizeSettings(patch = {}, base = DEFAULT_SETTINGS) {
    const result = { ...base };
    for (const [key, [min, max]] of Object.entries(SETTING_LIMITS)) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (key === 'sdf' && (value === Infinity || value === 'instant')) result.sdf = 41;
      else {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('Invalid ' + key);
        result[key] = Math.max(min, Math.min(max, value));
      }
    }
    for (const key of ['irs', 'ihs', 'allow180', 'spawnDrop', 'lockDelayOn']) {
      if (key in patch) {
        if (typeof patch[key] !== 'boolean') throw new TypeError(key + ' must be boolean');
        result[key] = patch[key];
      }
    }
    return result;
  }
  const INPUT_ACTIONS = Object.freeze(['left', 'right', 'cw', 'ccw', 'rotate180',
    'softDrop', 'hardDrop', 'hold', 'retry', 'skip', 'pause', 'settings', 'hint']);
  const ROTATE_ACTIONS = { cw: 1, ccw: -1, rotate180: 2 };
  function validateBindings(bindings) {
    const result = {}, used = new Set();
    for (const action of INPUT_ACTIONS) {
      const keys = bindings?.[action];
      if (!Array.isArray(keys) || !keys.length || keys.length > 8) throw new RangeError('各操作に1〜8個のキーが必要です。');
      result[action] = keys.map(code => {
        if (typeof code !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(code) || used.has(code)) {
          throw new RangeError('キーが重複しているか、無効なコードです。');
        }
        used.add(code); return code;
      });
    }
    return result;
  }
  // Pure, atomic rebinding. A conflict swaps the selected slot (first slot for
  // an add request), so neither action can lose its last usable binding.
  function rebindKeys(bindings, action, index, code) {
    const result = validateBindings(bindings), keys = result[action];
    if (!keys || index !== null && (!Number.isInteger(index) || index < 0 || index >= keys.length)) {
      throw new RangeError('無効なキー設定です。');
    }
    const owner = INPUT_ACTIONS.find(name => result[name].includes(code));
    if (owner === action) return result;
    if (owner) {
      const slot = index ?? 0;
      result[owner][result[owner].indexOf(code)] = keys[slot]; keys[slot] = code;
    } else if (index === null) keys.push(code);
    else keys[index] = code;
    return validateBindings(result);
  }
  function defaultClock() { return typeof performance === 'object' ? performance.now() : Date.now(); }

  /* Discrete-event input clock contract:
   * - Monotone ms timestamps, injectable clock; update processes ALL due events.
   * - Equal-time timers precede external keys; spawn, horizontal, fall is the
   *   timer tie order. No movement depends on how often update is sampled.
   * - Last physical direction wins. Each held key charges even while inactive
   *   or in ARE. Resuming an older key uses its charge, without a backlog burst.
   * - DAS's first repeat is at keydown+DAS, then ARR apart. ARR=0 slides once
   *   immediately at charge; a rotation/fall can enable a further held slide.
   * - DCD gates AUTO horizontal motion until t+DCD after spawn, successful
   *   rotation, or hard drop; it never delays a fresh manual tap or DAS charge.
   *   Delayed repeats resume at the gate, without replaying gated repeats.
   * - At spawn, uncharged held direction taps once; charged direction repeats
   *   once (or slides) at the DCD gate. Count it only if it moves that piece.
   * - Gravity is G cells per 1/60 second. Finite soft drop replaces gravity
   *   with SDF times that rate; gravity OFF uses a 1 cell/sec training baseline.
   *   Soft drop taps once immediately; 41/Infinity/'instant' drops without lock.
   * - IHS precedes IRS, spawnDrop, buffered horizontal and falling input. IRS
   *   counts one attempted rotation even if obstructed; O rotations also count.
   *   IHS latches hold presses during ARE, even if released before spawn; IRS
   *   deliberately requires a rotation key still HELD at the spawn instant.
   * - Public key methods accept {code,repeat}. Distinct codes for one action
   *   work independently; duplicate held codes and OS repeats are ignored.
   */
  class InputHandler {
    constructor(options = {}) {
      this.clock = options.clock || defaultClock;
      this.time = options.time === undefined ? this.clock() : options.time;
      if (!Number.isFinite(this.time)) throw new RangeError('Invalid initial time');
      this.settings = normalizeSettings(options.settings);
      this.board = options.board || new Board();
      this.bag = options.bag || new Bag({ seed: options.seed, rng: options.rng, pieces: options.pieces });
      this.pieceProvider = options.pieceProvider || (() => this.bag.next());
      this.autoNext = options.autoNext !== false;
      this.lockToBoard = !!options.lockToBoard;
      this.lockAt = this.lockDeadline = Infinity; this.lockResets = 0;
      this.holdEnabled = options.holdEnabled !== false;
      this.callbacks = options;
      this.active = null; this.pending = null; this.heldPiece = null; this.holdUsed = false;
      this.initialHoldBuffered = false;
      this.held = new Map(); this.order = 0; this.pieceId = 0;
      this.inputs = []; this.inputCount = 0; this.flags = { ihs: false, softDrop: false };
      this.cutAt = this.time; this.cutUntil = this.time; this.fallAt = Infinity;
      this.paused = false; this.pauseStarted = null; this.blocked = false;
      this._advancing = false;
    }
    _emit(kind, data = {}) {
      const event = { kind, t: this.time, ...data };
      if (this.callbacks.onEvent) this.callbacks.onEvent(event, this);
      return event;
    }
    _latest(predicate) {
      let newest = null;
      for (const key of this.held.values()) if (predicate(key) && (!newest || key.order > newest.order)) newest = key;
      return newest;
    }
    _direction() { return this._latest(k => k.action === 'left' || k.action === 'right'); }
    _soft() { return this._latest(k => k.action === 'softDrop'); }
    _rotation() { return this._latest(k => k.action in ROTATE_ACTIONS && (k.action !== 'rotate180' || this.settings.allow180)); }
    _record(action, key, details = {}) {
      if (key && key.countedFor === this.pieceId) return this.inputs[key.inputIndex];
      const entry = { action, label: ACTION_LABELS[action], t: this.time,
        initial: !!details.initial, irs: !!details.irs, slide: false };
      this.inputs.push(entry); this.inputCount++;
      if (key) { key.countedFor = this.pieceId; key.inputIndex = this.inputs.length - 1; }
      if (action === 'softDrop') this.flags.softDrop = true;
      if (this.callbacks.onInput) this.callbacks.onInput(entry, this);
      return entry;
    }
    _interval() {
      const gravityRate = this.settings.gravity * 60;
      if (this._soft()) {
        if (this.settings.sdf === 41) return 0;
        return 1000 / ((gravityRate || 1) * this.settings.sdf);
      }
      return gravityRate ? 1000 / gravityRate : Infinity;
    }
    _resetFall() {
      const interval = this._interval();
      // Key releases and live settings are allowed in pause. Their scheduling
      // uses the frozen play clock; no instant drop may execute under overlay.
      if (this.paused) {
        this.fallAt = this.active ? this.pauseStarted + interval : Infinity;
        return;
      }
      this.fallAt = this.active && interval !== 0 ? this.time + interval : Infinity;
      if (this.active && interval === 0) this._fall(true);
    }
    _wakeFall() {
      if (this._interval() === 0) this._fall(true);
      else if (this.fallAt === Infinity && this.active) this.fallAt = this.time + this._interval();
    }
    _wakeHorizontal() {
      const key = this._direction();
      if (key && key.nextAt === Infinity && this.time >= key.since + this.settings.das) key.nextAt = this.time;
    }
    _cut() {
      this.cutAt = this.time;
      this.cutUntil = this.cutAt + this.settings.dcd;
      this._wakeHorizontal();
    }
    _grounded(reset = false) {
      if (!this.settings.lockDelayOn) {
        this.lockAt = this.lockDeadline = Infinity;
        return;
      }
      const time = this.paused ? this.pauseStarted : this.time;
      if (!this.active || movePiece(this.board, this.active, 0, -1)) this.lockAt = Infinity;
      else {
        // Airborne time disables locking, but never erases the contact deadline
        // or replenishes the reset budget. An expired piece locks on recontact.
        if (this.lockDeadline === Infinity) this.lockDeadline = time + this.settings.lockDelay;
        else if (reset && this.lockResets < 15) {
          this.lockResets++;
          this.lockDeadline = time + this.settings.lockDelay;
        }
        this.lockAt = Math.max(time, this.lockDeadline);
      }
    }
    _horizontal(key, automatic, initial = false) {
      const delta = key.action === 'left' ? -1 : 1;
      const next = automatic && this.settings.arr === 0 ? slidePiece(this.board, this.active, delta) :
        movePiece(this.board, this.active, delta);
      const moved = next && (next.x !== this.active.x);
      if (moved || !automatic && !initial) {
        const entry = this._record(key.action, key, { initial });
        if (automatic) { entry.slide = true; entry.label = delta < 0 ? 'DAS←' : 'DAS→'; }
      }
      if (moved) { this.active = next; this.lastMove = 'shift'; this._grounded(true); this._emit('move', { action: key.action, automatic, state: { ...next } }); this._wakeFall(); }
      if (automatic) key.nextAt = this.settings.arr === 0 ? Infinity : this.time + this.settings.arr;
    }
    _fall(instant = false) {
      if (!this.active) return;
      const key = this._soft();
      const next = instant ? hardDrop(this.board, this.active) : movePiece(this.board, this.active, 0, -1);
      const moved = next && next.y !== this.active.y;
      if (moved) {
        if (key) this._record('softDrop', key, { initial: true });
        this.active = next;
        this.lastMove = 'fall';
        this._emit('fall', { soft: !!key, state: { ...next } });
        this._wakeHorizontal();
      }
      this.fallAt = !instant && moved ? this.time + this._interval() : Infinity;
      this._grounded();
    }
    _spawn(type, { initialHold = true, holdUsed = false, ihs = false, queueDrawn = false } = {}) {
      const bufferedHold = this.initialHoldBuffered;
      this.initialHoldBuffered = false;
      this.pending = null; this.pieceId++;
      this.lockAt = this.lockDeadline = Infinity; this.lockResets = 0;
      this.active = spawnPiece(type, { board: this.board });
      this.lastMove = null;
      this.holdUsed = holdUsed; this.inputs = []; this.inputCount = 0;
      this.flags = { ihs, softDrop: false }; this.blocked = false;
      if (initialHold && this.settings.ihs && (bufferedHold || this._latest(k => k.action === 'hold')) && this.holdEnabled) {
        this._hold(true); return;
      }
      const rotateKey = this.settings.irs && this._rotation();
      if (rotateKey) {
        this._record(rotateKey.action, rotateKey, { initial: true, irs: true });
        const rotated = rotatePiece(this.board, this.active, ROTATE_ACTIONS[rotateKey.action], this.settings);
        if (rotated) { this.active = rotated; this.lastMove = 'rotation'; }
      }
      if (!this.board.fits(this.active)) {
        this.active = null; this.blocked = true; this.fallAt = Infinity;
        this._emit('blockout'); return;
      }
      if (this.settings.spawnDrop) {
        const dropped = movePiece(this.board, this.active, 0, -1);
        if (dropped) { this.active = dropped; this.lastMove = 'fall'; }
      }
      this._cut();
      this._emit('spawn', { type, state: { ...this.active }, ihs, queueDrawn });
      if (this.callbacks.onSpawn) this.callbacks.onSpawn(this.active, this);
      const direction = this._direction();
      if (direction && !this.paused) {
        direction.nextAt = Math.max(this.time, direction.since + this.settings.das);
        if (direction.since + this.settings.das > this.time) this._horizontal(direction, false, true);
      }
      this._resetFall();
      this._grounded();
    }
    _hold(initial) {
      if (!this.active || this.holdUsed || !this.holdEnabled) return false;
      const queueDrawn = !this.heldPiece;
      const from = this.active.type, to = this.heldPiece || pieceType(this.pieceProvider());
      this.heldPiece = from;
      const event = this._emit('hold', { from, to, initial });
      if (this.callbacks.onHold) this.callbacks.onHold(event, this);
      this._spawn(to, { initialHold: false, holdUsed: true, ihs: initial, queueDrawn });
      return true;
    }
    _lock() {
      const state = hardDrop(this.board, this.active);
      if (!state) return;
      if (state.y !== this.active.y) this.lastMove = 'drop';
      const result = { t: this.time, type: state.type, state, cells: cells(state),
        lastMove: this.lastMove, used: this.inputCount, inputs: this.inputs.map(e => ({ ...e })), flags: { ...this.flags } };
      if (this.lockToBoard) this.board.lock(state);
      this.active = null; this.fallAt = this.lockAt = this.lockDeadline = Infinity; this._cut();
      this._emit('lock', result);
      if (this.callbacks.onLock) this.callbacks.onLock(result, this);
      if (this.autoNext && !this.pending && !this.active) this._schedule(pieceType(this.pieceProvider()), this.settings.are);
    }
    _schedule(type, delay) {
      if (!Number.isFinite(delay) || delay < 0) throw new RangeError('Invalid spawn delay');
      this.active = null; this.fallAt = this.lockAt = this.lockDeadline = Infinity;
      const since = this.paused ? this.pauseStarted : this.time;
      this.initialHoldBuffered = false;
      this.pending = { type: pieceType(type), since, at: since + delay };
      this._emit('are', { type, at: this.pending.at });
    }
    scheduleSpawn(type, t = this.clock(), delay = this.settings.are) {
      this.update(t); this._schedule(type, delay); this.update(t); return this;
    }
    spawn(type, t = this.clock()) { return this.scheduleSpawn(type, t, 0); }
    start(t = this.clock()) { return this.scheduleSpawn(pieceType(this.pieceProvider()), t); }
    update(t = this.clock()) {
      if (!Number.isFinite(t) || t < this.time) throw new RangeError('Time must be finite and monotone');
      if (this._advancing) return this;
      if (this.paused) { this.time = t; return this; }
      this._advancing = true;
      try {
        for (;;) {
          const direction = this._direction();
          const spawnAt = this.pending ? this.pending.at : Infinity;
          const horizontalAt = this.active && direction ? Math.max(direction.nextAt, this.cutUntil) : Infinity;
          const fallAt = this.active ? this.fallAt : Infinity;
          const lockAt = this.active ? this.lockAt : Infinity;
          const at = Math.min(spawnAt, horizontalAt, fallAt, lockAt);
          if (at > t || at === Infinity) break;
          this.time = at;
          if (spawnAt === at) this._spawn(this.pending.type);
          else if (horizontalAt === at) this._horizontal(direction, true, true);
          else if (fallAt === at) this._fall(this._interval() === 0);
          else this._lock();
          if (this.paused) break; // A spawn/input callback may pause mid-update.
        }
        this.time = t;
      } finally { this._advancing = false; }
      return this;
    }
    keyDown(action, t = this.clock(), options = {}) {
      if (!INPUT_ACTIONS.includes(action)) throw new RangeError('Unknown action: ' + action);
      this.update(t);
      const code = options.code || action;
      if (options.repeat || this.held.has(code)) return false;
      if (action === 'pause') {
        this.held.set(code, { action, since: t, order: ++this.order, nextAt: Infinity });
        if (this.callbacks.onCommand) this.callbacks.onCommand(action, t, this);
        else if (this.paused) this.resume(t); else this.pause(t);
        return true;
      }
      if (this.paused) return false;
      const key = { action, since: t, order: ++this.order, nextAt: t + this.settings.das, countedFor: -1 };
      this.held.set(code, key);
      if (action === 'hold' && this.pending && this.settings.ihs) this.initialHoldBuffered = true;
      if (['retry', 'skip', 'settings', 'hint'].includes(action)) {
        if (this.callbacks.onCommand) this.callbacks.onCommand(action, t, this);
      } else if (this.active) {
        if (action === 'rotate180' && !this.settings.allow180) return false;
        if (this.callbacks.onAction) this.callbacks.onAction(action, t, this);
        if (action === 'left' || action === 'right') this._horizontal(key, false);
        else if (action in ROTATE_ACTIONS) {
          this._record(action, key);
          const next = rotatePiece(this.board, this.active, ROTATE_ACTIONS[action], this.settings);
          if (next) { this.active = next; this.lastMove = 'rotation'; this._grounded(true); this._cut(); this._wakeFall(); this._emit('rotate', { action, state: { ...next } }); }
        } else if (action === 'softDrop') {
          this._record(action, key);
          if (this.settings.sdf === 41) this._fall(true); else { this._fall(); this._resetFall(); }
        } else if (action === 'hardDrop') this._lock();
        else if (action === 'hold') this._hold(false);
      }
      this.update(t); return true;
    }
    keyUp(action, t = this.clock(), options = {}) {
      this.update(t);
      const before = this._direction(), interval = this._interval(), code = options.code || action;
      const key = this.held.get(code);
      if (!key || key.action !== action) return false;
      this.held.delete(code);
      const after = this._direction();
      const effectiveTime = this.paused ? this.pauseStarted : t;
      if (after && before !== after) after.nextAt = Math.max(effectiveTime, after.since + this.settings.das);
      if (this._interval() !== interval) this._resetFall();
      this.update(t); return true;
    }
    // Atomic focus/pause cleanup: sequential keyUp calls could wake an older
    // charged direction between releases. Also discard a released IHS ARE tap.
    releaseAll(t = this.clock()) {
      this.update(t);
      const interval = this._interval();
      this.held.clear(); this.initialHoldBuffered = false;
      if (this._interval() !== interval) this._resetFall();
      return this;
    }
    setSettings(patch, t = this.clock()) {
      this.update(t);
      const previous = this.settings, interval = this._interval();
      this.settings = normalizeSettings(patch, previous);
      // Only affected timers change. DAS/ARR edits preserve held-key age and
      // allow one charged repeat now, then use the new ARR (no backlog burst).
      // DCD/ARE keep their original trigger/start; elapsed deadlines fire now.
      // A changed fall rate starts a full interval now, or drops immediately.
      const effectiveTime = this.paused ? this.pauseStarted : t;
      if (this.settings.lockDelayOn !== previous.lockDelayOn || this.settings.lockDelay !== previous.lockDelay) {
        // Duration edits retain elapsed contact time and the reset budget.
        // Re-enabling starts a new contact timer without replenishing resets.
        if (this.lockDeadline !== Infinity) this.lockDeadline += this.settings.lockDelay - previous.lockDelay;
        this._grounded();
      }
      if (this.settings.das !== previous.das || this.settings.arr !== previous.arr) {
        for (const key of this.held.values()) key.nextAt = Math.max(effectiveTime, key.since + this.settings.das);
      }
      if (this.settings.dcd !== previous.dcd) this.cutUntil = Math.max(effectiveTime, this.cutAt + this.settings.dcd);
      if (this.pending && this.settings.are !== previous.are) this.pending.at = Math.max(effectiveTime, this.pending.since + this.settings.are);
      if (this._interval() !== interval) this._resetFall();
      this.update(t); return this;
    }
    pause(t = this.clock()) {
      this.update(t);
      if (!this.paused) { this.paused = true; this.pauseStarted = t; this._emit('pause'); }
      return this;
    }
    resume(t = this.clock()) {
      this.update(t);
      if (!this.paused) return this;
      const delta = t - this.pauseStarted;
      for (const key of this.held.values()) { key.since += delta; key.nextAt += delta; }
      if (this.pending) { this.pending.since += delta; this.pending.at += delta; }
      this.cutAt += delta; this.cutUntil += delta; this.fallAt += delta;
      this.lockAt += delta; this.lockDeadline += delta;
      this.paused = false; this.pauseStarted = null;
      this._emit('resume'); this.update(t); return this;
    }
  }

  // Placement feedback, shared by practice and endless play; never persisted.
  const COMBO_MILESTONES = Object.freeze([5, 10, 20, 50]);
  class ComboTracker {
    constructor() { this.reset(); }
    reset() { this.count = 0; return this.snapshot(); }
    snapshot() {
      return { count: this.count, tier: COMBO_MILESTONES.filter(n => n <= this.count).at(-1) || 0 };
    }
    next(result) {
      if (!['perfect', 'fault', 'miss'].includes(result?.status)) throw new RangeError('Invalid combo result');
      this.count = result.status === 'perfect' ? this.count + 1 : 0;
      return { ...this.snapshot(), milestone: COMBO_MILESTONES.includes(this.count) ? this.count : 0 };
    }
  }

  function emptyCounters() {
    return { attempts: 0, placements: 0, perfect: 0, faults: 0, misses: 0,
      usedInputs: 0, optimalInputs: 0, softDropAttempts: 0 };
  }
  class Stats {
    constructor(saved) {
      Object.assign(this, emptyCounters(), { streak: 0, bestStreak: 0, skips: 0, retries: 0 });
      this.byPiece = Object.fromEntries(PIECE_TYPES.map(type => [type, emptyCounters()]));
      this.byTarget = Object.create(null); this.bestTimes = Object.create(null);
      if (saved) this._load(saved);
    }
    _load(saved) {
      const copyNumbers = (to, from) => {
        for (const key of Object.keys(to)) if (typeof to[key] === 'number' &&
          Number.isFinite(from[key]) && from[key] >= 0) to[key] = from[key];
      };
      copyNumbers(this, saved);
      for (const type of PIECE_TYPES) copyNumbers(this.byPiece[type], saved.byPiece?.[type] || {});
      for (const [key, value] of Object.entries(saved.byTarget || {})) {
        this.byTarget[key] = emptyCounters(); copyNumbers(this.byTarget[key], value || {});
      }
      for (const [length, time] of Object.entries(saved.bestTimes || {})) {
        if (/^[1-9]\d*$/.test(length) && Number.isFinite(time) && time >= 0) this.bestTimes[length] = time;
      }
    }
    record(result) {
      pieceType(result.type);
      if (!['perfect', 'fault', 'miss'].includes(result.status) ||
        !Number.isFinite(result.used) || result.used < 0 || !Number.isFinite(result.optimal) || result.optimal < 0) {
        throw new RangeError('Invalid result');
      }
      const key = result.type + ':' + result.targetKey;
      const target = this.byTarget[key] || (this.byTarget[key] = emptyCounters());
      for (const counter of [this, this.byPiece[result.type], target]) {
        counter.attempts++; counter[result.status === 'perfect' ? 'perfect' : result.status === 'fault' ? 'faults' : 'misses']++;
        if (result.status !== 'miss') counter.placements++;
        counter.usedInputs += result.used; counter.optimalInputs += result.optimal;
        if (result.flags?.softDrop) counter.softDropAttempts++;
      }
      this.streak = result.status === 'perfect' ? this.streak + 1 : 0;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      return this;
    }
    snapshot() {
      return { ...this.toJSON(), accuracy: this.attempts ? 100 * this.perfect / this.attempts : 0,
        averageInputs: this.attempts ? this.usedInputs / this.attempts : 0,
        averageOptimal: this.attempts ? this.optimalInputs / this.attempts : 0 };
    }
    toJSON() {
      const result = { version: 1 };
      for (const key of Object.keys(emptyCounters()).concat(['streak', 'bestStreak', 'skips', 'retries'])) result[key] = this[key];
      result.byPiece = Object.fromEntries(PIECE_TYPES.map(type => [type, { ...this.byPiece[type] }]));
      result.byTarget = Object.fromEntries(Object.entries(this.byTarget).map(([key, value]) => [key, { ...value }]));
      result.bestTimes = { ...this.bestTimes }; return result;
    }
    reset() { Object.assign(this, new Stats()); return this; }
  }

  // Shared session clock and input boundary. Pauses freeze every engine timer.
  class PlaySession {
    constructor(options) {
      this.clock = options.clock || defaultClock;
      this.onEvent = options.onEvent;
      this.startedAt = null; this.endedAt = null;
      this.pausedAt = null; this.pausedDuration = 0;
      this.running = false; this.lastResult = null;
      this.combo = new ComboTracker();
    }
    _emit(kind, data = {}) { if (this.onEvent) this.onEvent({ kind, ...data }, this); }
    _touch(t) { if (this.running && this.startedAt === null) this.startedAt = t; }
    pause(t = this.clock()) {
      this.update(t);
      if (this.running && this.pausedAt === null) { this.pausedAt = t; this.handler.pause(t); }
      return this;
    }
    resume(t = this.clock()) {
      this.update(t);
      if (this.pausedAt !== null) {
        if (this.startedAt !== null) this.pausedDuration += t - this.pausedAt;
        this.pausedAt = null; this.handler.resume(t);
      }
      return this;
    }
    update(t = this.clock()) { this.handler.update(t); return this; }
    keyDown(action, t = this.clock(), options) {
      if (!this.running) return false;
      return this.handler.keyDown(action, t, options);
    }
    keyUp(action, t = this.clock(), options) { return this.handler.keyUp(action, t, options); }
    elapsed(t = this.clock()) {
      return this.startedAt === null ? 0 : Math.max(0, (this.endedAt ?? this.pausedAt ?? t) - this.startedAt - this.pausedDuration);
    }
  }

  function judgePlacement(lock, optimal, correct = true) {
    const status = !correct ? 'miss' : !optimal ? 'unjudged' :
      lock.used === optimal.count ? 'perfect' : 'fault';
    return { ...lock, status, optimal: optimal?.count ?? null, targetKey: optimal?.key ?? null,
      targetCells: optimal?.cells.map(c => c.slice()) || [], optimalSequence: optimal?.sequence.slice() || [],
      extra: optimal ? Math.max(0, lock.used - optimal.count) : 0 };
  }

  // Endless, unfiltered seven-bag play. The solver judges against the board
  // BEFORE lock/clear. Deliberate descent/tucks outside its graph are unjudged.
  class FreeSession extends PlaySession {
    constructor(options = {}) {
      super(options);
      this.settings = this._settings(options.settings);
      this.rng = options.rng || (options.seed === undefined ? Math.random : createRNG(options.seed));
      this._reset(options.time ?? this.clock());
    }
    _settings(patch) {
      const settings = normalizeSettings(patch);
      // A zero-gravity training profile still gives normal falling play.
      if (!settings.gravity) settings.gravity = 1 / 60;
      return settings;
    }
    _reset(t) {
      this.bag = new Bag({ rng: this.rng });
      this.lines = 0; this.pieces = 0; this.gameOver = false; this.reason = null;
      this.startedAt = this.endedAt = this.pausedAt = null; this.pausedDuration = 0;
      this.running = false; this.lastResult = null; this.cueDrawPending = false; this.combo.reset();
      this.handler = new InputHandler({ clock: this.clock, time: t, settings: this.settings,
        bag: this.bag, autoNext: false,
        onLock: lock => this._onLock(lock),
        onCommand: (action, time) => {
          if (action === 'retry') this.restart(time);
          else if (action === 'pause') this.pausedAt === null ? this.pause(time) : this.resume(time);
          else if (action === 'settings') this._emit(action, { t: time });
        },
        onEvent: event => {
          if (event.kind === 'spawn') {
            this._touch(event.t);
            const queueDrawn = this.cueDrawPending || event.queueDrawn;
            this.cueDrawPending = false;
            this._emit('spawn', { ...event, queueDrawn, nextType: this.bag.peek(1)[0] });
          } else if (event.kind === 'blockout') this._gameOver('blockout', event.t);
          else this._emit(event.kind, event);
        }
      });
    }
    _schedule(t) {
      this.cueDrawPending = true;
      this.handler.scheduleSpawn(this.bag.next(), t, this.settings.are);
    }
    start(t = this.clock()) {
      if (this.running || this.endedAt !== null) throw new Error('Session already started');
      this.running = true; this._schedule(t); return this;
    }
    restart(t = this.clock()) {
      this.update(t); this._reset(t); this._emit('restart', { t }); return this.start(t);
    }
    _onLock(lock) {
      const board = this.handler.board;
      const optimal = finesseFor(lock.type, lock.cells, { board, ...this.settings });
      const result = judgePlacement(lock, optimal && lock.used >= optimal.count ? optimal : null);
      result.combo = result.status === 'unjudged' ? this.combo.reset() : this.combo.next(result);
      board.lock(lock.state);
      result.lines = board.clearLines(); this.lines += result.lines; this.pieces++;
      this.lastResult = result; this._emit('result', { result });
      if (lock.cells.every(([, y]) => y >= VISIBLE_HEIGHT)) this._gameOver('lockout', lock.t);
      else this._schedule(lock.t);
    }
    _gameOver(reason, t) {
      this.running = false; this.gameOver = true; this.reason = reason; this.endedAt = t;
      this.cueDrawPending = false;
      this.handler.active = this.handler.pending = null;
      this.handler.fallAt = this.handler.lockAt = Infinity;
      this.handler.held.clear(); this.handler.initialHoldBuffered = false;
      this._emit('gameover', { t, reason });
    }
    setSettings(patch, t = this.clock()) {
      this.update(t); this.settings = this._settings({ ...this.settings, ...patch });
      this.handler.setSettings(this.settings, t); return this;
    }
    nextQueue(count = 5) {
      return this.handler.pending ? [this.handler.pending.type].concat(this.bag.peek(Math.max(0, count - 1))).slice(0, count) : this.bag.peek(count);
    }
    snapshot(t = this.clock()) {
      const elapsed = this.elapsed(t);
      return { lines: this.lines, pieces: this.pieces, elapsed, pps: elapsed ? this.pieces * 1000 / elapsed : 0,
        running: this.running, gameOver: this.gameOver, reason: this.reason };
    }
  }

  /* DrillSession keeps an empty practice board for every attempt. No lines
   * accumulate. It exposes round/target during ARE and nextQueue(5) for UI.
   * Column filters constrain the occupied LEFT column (inclusive); area aliases
   * left/center/right mean 0..2 / 3..5 / 6..9, clipped to legal placements.
   * Piece choice uses filtered bags; targets are uniform over distinct cell
   * sets, or optionally weighted by a smoothed per-target fault/miss rate.
   * Accuracy = perfect / all lock attempts (misses are separate from faults).
   * Sprint progress counts correct placements, excluding zero-fault resets.
   * Retry/skip/hold are not lock attempts; hold is disabled for one-piece bags.
   * Timer starts on first gameplay input, including IRS/HD/IHS; pauses excluded.
   * Persistence is data-only via Stats.toJSON(); storage belongs to the UI.
   */
  class DrillSession extends PlaySession {
    constructor(options = {}) {
      super(options);
      this.pieces = normalizePieces(options.pieces);
      this.settings = normalizeSettings(options.settings);
      this.rng = options.rng || (options.seed === undefined ? Math.random : createRNG(options.seed));
      this.bag = new Bag({ rng: this.rng, pieces: this.pieces });
      this.boardTemplate = options.board ? options.board.clone() : new Board();
      this.area = options.area || 'all';
      if (!['all', 'left', 'center', 'right'].includes(this.area)) throw new RangeError('Unknown area');
      this.columnRange = options.columnRange || null;
      if (this.columnRange && (this.columnRange.length !== 2 || !this.columnRange.every(Number.isInteger) ||
        this.columnRange[0] > this.columnRange[1])) throw new RangeError('Invalid column range');
      this.weakSpot = !!options.weakSpot;
      this.zeroFault = !!options.zeroFault; this.repeatOnFault = !!options.repeatOnFault;
      this.repeatOnMiss = options.repeatOnMiss !== false;
      this.sprintLength = options.sprintLength || 0;
      if (!Number.isInteger(this.sprintLength) || this.sprintLength < 0) throw new RangeError('Invalid sprint length');
      this.stats = new Stats();
      this.totalStats = options.totalStats instanceof Stats ? options.totalStats : new Stats(options.totalStats);
      this.completed = 0; this.round = null; this.serial = 0;
      this.cueDrawPending = false;
      this.handler = new InputHandler({ clock: this.clock, time: options.time, settings: this.settings,
        board: this.boardTemplate.clone(), bag: this.bag, autoNext: false,
        holdEnabled: this.pieces.length > 1,
        onInput: () => this._touch(this.handler.time),
        onAction: (action, t) => this._touch(t),
        onHold: event => {
          this._touch(event.t); this.stats.skips++; this.totalStats.skips++;
          this._newRound(event.to); this.handler.board = this.boardTemplate.clone();
        },
        onLock: result => this._onLock(result),
        onCommand: (action, t) => {
          if (action === 'retry') this.retry(t);
          else if (action === 'skip') this.skip(t);
          else if (action === 'pause') this.pausedAt === null ? this.pause(t) : this.resume(t);
          else this._emit(action, { t });
        },
        onEvent: event => {
          if (event.kind === 'spawn') {
            // Capture NEXT before callbacks or further input can change the bag.
            // A full IHS swap still announces the draw that entered this ARE.
            const queueDrawn = this.cueDrawPending || event.queueDrawn;
            this.cueDrawPending = false;
            this._emit('spawn', { ...event, queueDrawn, nextType: this.bag.peek(1)[0] });
          } else {
            if (event.kind === 'blockout') this.cueDrawPending = false;
            this._emit(event.kind, event);
          }
        }
      });
      // Fail before play if ANY selected piece has no target under the filter.
      for (const type of this.pieces) if (!this._candidates(type).length) throw new RangeError('No targets for ' + type);
    }
    _candidates(type) {
      const ranges = { all: [0, 9], left: [0, 2], center: [3, 5], right: [6, 9] };
      const [min, max] = this.columnRange || ranges[this.area];
      return allPlacements(type, { board: this.boardTemplate, ...this.settings }).filter(p => p.x >= min && p.x <= max);
    }
    _newRound(type, target) {
      const candidates = this._candidates(type);
      let selected = target;
      if (!selected) {
        const weights = candidates.map(p => {
          const history = this.totalStats.byTarget[type + ':' + p.key];
          return this.weakSpot && history ? 1 + 4 * (history.faults + history.misses) / (history.attempts + 2) : 1;
        });
        let pick = randomUnit(this.rng) * weights.reduce((sum, w) => sum + w, 0);
        selected = candidates[candidates.length - 1];
        for (let i = 0; i < candidates.length; i++) { pick -= weights[i]; if (pick < 0) { selected = candidates[i]; break; } }
      }
      const optimal = finesseFor(type, selected.cells || selected, { board: this.boardTemplate, ...this.settings });
      if (!optimal) throw new RangeError('Target is unreachable');
      this.round = { type, target: optimal, optimal: optimal.count, serial: ++this.serial };
      this._emit('target', { round: this.round });
    }
    _schedule(t) {
      this.handler.board = this.boardTemplate.clone();
      this.handler.scheduleSpawn(this.round.type, t, this.settings.are);
    }
    _drawRound(target) {
      this.cueDrawPending = true;
      this._newRound(this.bag.next(), target);
    }
    start(t = this.clock(), target) {
      if (this.running || this.endedAt !== null) throw new Error('Session already started');
      this.running = true; this._drawRound(target); this._schedule(t); return this;
    }
    _onLock(lock) {
      const correct = sameCells(lock.cells, this.round.target.cells);
      const result = judgePlacement(lock, this.round.target, correct);
      const status = result.status;
      const advanced = correct && !(status === 'fault' && this.zeroFault);
      result.advanced = advanced;
      result.combo = this.combo.next(result);
      this.stats.record(result); this.totalStats.record(result); this.lastResult = result;
      if (advanced) this.completed++;
      this._emit('result', { result });
      if (this.sprintLength && this.completed >= this.sprintLength) {
        this.endedAt = lock.t; this.running = false;
        const elapsed = this.elapsed(lock.t), previous = this.totalStats.bestTimes[this.sprintLength];
        if (previous === undefined || elapsed < previous) this.totalStats.bestTimes[this.sprintLength] = elapsed;
        this._emit('finish', { result: this.snapshot(lock.t) }); return;
      }
      const repeat = status === 'miss' && this.repeatOnMiss || status === 'fault' && (this.zeroFault || this.repeatOnFault);
      if (repeat) this._newRound(this.round.type, this.round.target);
      else this._drawRound();
      this._schedule(lock.t);
    }
    retry(t = this.clock()) {
      this.update(t);
      if (!this.running || this.pausedAt !== null) return false;
      this.stats.retries++; this.totalStats.retries++;
      this.combo.reset();
      this._newRound(this.round.type, this.round.target); this._schedule(t); return true;
    }
    skip(t = this.clock()) {
      this.update(t);
      if (!this.running || this.pausedAt !== null) return false;
      this.stats.skips++; this.totalStats.skips++;
      this._drawRound(); this._schedule(t); return true;
    }
    setSettings(patch, t = this.clock()) {
      this.update(t);
      const previous = this.settings;
      this.settings = normalizeSettings(patch, previous);
      // Refresh optimal count when 180/spawnDrop changes, retaining cell target.
      if (this.round && (this.settings.allow180 !== previous.allow180 || this.settings.spawnDrop !== previous.spawnDrop)) {
        this._newRound(this.round.type, this.round.target);
      }
      this.handler.setSettings(patch, t); return this;
    }
    nextQueue(count = 5) {
      return this.handler.pending ? [this.round.type].concat(this.bag.peek(Math.max(0, count - 1))).slice(0, count) : this.bag.peek(count);
    }
    snapshot(t = this.clock()) {
      const elapsed = this.elapsed(t);
      return { ...this.stats.snapshot(), completed: this.completed, sprintLength: this.sprintLength,
        running: this.running, elapsed, pps: elapsed ? this.completed * 1000 / elapsed : 0,
        finished: this.endedAt !== null };
    }
  }

  // Preset insertion practice. Rows are TOP first; targets use SRS matrix origins.
  // Mirrored pairs reflect cells, then recover the correct piece/orientation.
  function spinDrill(id, title, type, rows, state, lines, tip) {
    const target = { type, ...state };
    return { id, title, type, rows, target, lines, tip, cells: cells(target) };
  }
  function mirrorSpin(drill, id, title, type = drill.type) {
    const reflected = drill.cells.map(([x, y]) => [WIDTH - 1 - x, y]);
    let target;
    for (let rot = 0; rot < 4 && !target; rot++) {
      const shape = SHAPES[type][rot];
      const x = Math.min(...reflected.map(c => c[0])) - Math.min(...shape.map(c => c[0]));
      const y = Math.min(...reflected.map(c => c[1])) - Math.min(...shape.map(c => c[1]));
      const candidate = { type, rot, x, y };
      if (sameCells(cells(candidate), reflected)) target = candidate;
    }
    if (!target) throw new Error('Invalid mirrored spin drill');
    return spinDrill(id, title, type, drill.rows.map(r => [...r].reverse().join('')), target, drill.lines, drill.tip);
  }
  const tSingle = spinDrill('t-single-left', 'Tスピンシングル・左', 'T',
    ['###..#####', '###...####', '.###.#####'], { x: 3, y: 0, rot: 2 }, 1,
    '縦向きでくぼみの手前まで下げて、最後に回転ですっ。');
  const tDouble = spinDrill('t-double-left', 'Tスピンダブル・左', 'T',
    ['###..#####', '###...####', '####.#####'], { x: 3, y: 0, rot: 2 }, 2, tSingle.tip);
  const tMini = spinDrill('t-mini-left', 'Tスピンミニ・左', 'T',
    ['###..#####', '###...####', '####.#####'], { x: 3, y: 0, rot: 0 }, 1,
    'ミニの小さなくぼみも、下げてからくるりですっ♪');
  const tTriple = spinDrill('t-triple-right', 'Tスピントリプル（TST）・右', 'T',
    ['#####.....', '####......', '####.#####', '####..####', '####.#####'], { x: 3, y: 0, rot: 1 }, 3,
    'ひさしを回り込んで横向きに。穴の上で回すと、キックで2段下へ入れますっ。');
  const sSpin = spinDrill('s-spin', 'Sスピン', 'S',
    ['####..####', '###..#####'], { x: 3, y: 0, rot: 2 }, 2,
    '縦向きで下げてから、床のキックで横向きに収めましょうね。');
  const lSpin = spinDrill('l-spin', 'Lスピン', 'L',
    ['#####.####', '###...####'], { x: 3, y: -1, rot: 0 }, 2, sSpin.tip);
  const iSpin = spinDrill('i-spin-right', 'Iスピン・右', 'I',
    ['.......###', '####...###', '######.###', '###....###'], { x: 3, y: -2, rot: 0 }, 1,
    '縦のIを細い通路へ。床まで下げて回すと、I専用のキックで横穴に入りますっ。');
  const SPIN_SETS = deepFreeze([
    { id: 'basic-t', title: '基本のTスピン', grade: 'STEP 1', drills: [tSingle,
      mirrorSpin(tSingle, 't-single-right', 'Tスピンシングル・右'), tDouble,
      mirrorSpin(tDouble, 't-double-right', 'Tスピンダブル・右')] },
    { id: 'advanced-t', title: 'ミニとトリプル', grade: 'STEP 2', drills: [tMini,
      mirrorSpin(tMini, 't-mini-right', 'Tスピンミニ・右'), tTriple,
      mirrorSpin(tTriple, 't-triple-left', 'Tスピントリプル（TST）・左')] },
    { id: 'other-spins', title: 'S・Z・L・Jの回転入れ', grade: 'STEP 3', drills: [sSpin,
      mirrorSpin(sSpin, 'z-spin', 'Zスピン', 'Z'), lSpin, mirrorSpin(lSpin, 'j-spin', 'Jスピン', 'J')] },
    { id: 'i-spins', title: 'Iミノの回転入れ', grade: 'STEP 4', drills: [iSpin,
      mirrorSpin(iSpin, 'i-spin-left', 'Iスピン・左')] }
  ]);
  const SPIN_DRILLS = Object.freeze(SPIN_SETS.flatMap(set => set.drills));
  function spinBoard(drill) {
    const board = new Board();
    drill.rows.slice().reverse().forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell === '#') board.set(x, y);
    }));
    return board;
  }
  function normalizeSpinProgress(saved = {}) {
    const ids = SPIN_DRILLS.map(d => d.id);
    return { current: ids.includes(saved?.current) ? saved.current : ids[0],
      completed: [...new Set((Array.isArray(saved?.completed) ? saved.completed : []).filter(id => ids.includes(id)))] };
  }
  // Full descent-aware BFS for hints. Each softDrop edge is exactly ONE cell;
  // floor is a drop without locking. Quarter-turn solutions work with 180 off.
  function solveSpinDrill(drill, options = {}) {
    const board = spinBoard(drill), start = spawnPiece(drill.type, options);
    const key = s => [s.x, s.y, s.rot].join(',');
    const queue = [{ state: start, actions: [] }], seen = new Set([key(start)]);
    for (let head = 0; head < queue.length; head++) {
      const { state, actions } = queue[head];
      for (const action of ['cw', 'ccw', 'left', 'right', 'floor', 'softDrop']) {
        const next = action === 'floor' ? hardDrop(board, state) : action === 'softDrop' ?
          movePiece(board, state, 0, -1) : applyAction(board, state, action, { allow180: false });
        if (!next || key(next) === key(state)) continue;
        const path = actions.concat(action);
        if ((action === 'cw' || action === 'ccw') && sameCells(cells(next), drill.cells)) return path;
        if (!seen.has(key(next))) { seen.add(key(next)); queue.push({ state: next, actions: path }); }
      }
    }
    throw new Error('Unreachable spin drill: ' + drill.id);
  }
  function judgeSpinPlacement(lock, drill) {
    const correct = lock.type === drill.type && sameCells(lock.cells, drill.cells);
    const rotated = lock.lastMove === 'rotation';
    return { ...lock, drillId: drill.id, status: correct && rotated ? 'perfect' : 'miss',
      reason: !correct ? 'position' : !rotated ? 'rotation' : null, correct, rotated,
      optimal: 0, extra: 0, targetKey: drill.id, targetCells: drill.cells.map(c => c.slice()), optimalSequence: [] };
  }
  class SpinSession extends PlaySession {
    constructor(options = {}) {
      super(options);
      this.settings = normalizeSettings(options.settings);
      this.set = SPIN_SETS.find(s => s.drills.some(d => d.id === options.drillId)) || SPIN_SETS[0];
      this.index = Math.max(0, this.set.drills.findIndex(d => d.id === options.drillId));
      this.stats = new Stats();
      this.totalStats = options.totalStats instanceof Stats ? options.totalStats : new Stats(options.totalStats);
      this.completed = 0; this.serial = 0; this.awaitingNext = false; this.cueDrawPending = false;
      this.handler = new InputHandler({ clock: this.clock, time: options.time, settings: this.settings,
        autoNext: false, holdEnabled: false,
        onInput: () => this._touch(this.handler.time), onAction: (action, t) => this._touch(t),
        onLock: lock => this._onLock(lock),
        onCommand: (action, t) => {
          if (action === 'retry') this.retry(t);
          else if (action === 'skip') this.skip(t);
          else if (action === 'pause') this.pausedAt === null ? this.pause(t) : this.resume(t);
          else this._emit(action, { t });
        },
        onEvent: event => {
          if (event.kind === 'spawn') {
            const queueDrawn = this.cueDrawPending; this.cueDrawPending = false;
            this._emit('spawn', { ...event, queueDrawn, nextType: this.nextQueue(1)[0] });
          } else this._emit(event.kind, event);
        }
      });
    }
    get drill() { return this.set.drills[this.index]; }
    _schedule(t, queueDrawn = true) {
      this.cueDrawPending = queueDrawn;
      const drill = this.drill;
      this.awaitingNext = false; this.lastResult = null;
      this.handler.releaseAll(t); this.handler.board = spinBoard(drill);
      this.round = { type: drill.type, drillId: drill.id, target: { type: drill.type,
        cells: drill.cells, state: drill.target, key: cellsKey(drill.cells) }, serial: ++this.serial };
      this._emit('target', { round: this.round });
      this.handler.scheduleSpawn(drill.type, t, this.settings.are);
    }
    start(t = this.clock()) {
      if (this.running) throw new Error('Session already started');
      this.running = true; this._schedule(t); return this;
    }
    _onLock(lock) {
      const result = judgeSpinPlacement(lock, this.drill);
      this.handler.board.lock(lock.state);
      result.lines = this.handler.board.clone().clearLines();
      result.combo = this.combo.next(result);
      this.stats.record(result); this.totalStats.record(result);
      if (result.status === 'perfect') this.completed++;
      this.lastResult = result; this.awaitingNext = true;
      this._emit('result', { result });
    }
    retry(t = this.clock()) {
      this.update(t);
      if (!this.running || this.pausedAt !== null) return false;
      this.stats.retries++; this.totalStats.retries++; this.combo.reset(); this._schedule(t, false); return true;
    }
    skip(t = this.clock()) {
      this.update(t);
      if (!this.running || this.pausedAt !== null) return false;
      if (!this.awaitingNext || this.lastResult?.status !== 'perfect') {
        this.stats.skips++; this.totalStats.skips++; this.combo.reset();
      }
      this.index = (this.index + 1) % this.set.drills.length; this._schedule(t); return true;
    }
    setSettings(patch, t = this.clock()) {
      this.update(t); this.settings = normalizeSettings(patch, this.settings);
      this.handler.setSettings(patch, t); return this;
    }
    nextQueue(count = 5) {
      return Array.from({ length: Math.min(count, this.set.drills.length - 1) }, (_, n) =>
        this.set.drills[(this.index + n + 1) % this.set.drills.length].type);
    }
    snapshot(t = this.clock()) {
      const elapsed = this.elapsed(t);
      return { ...this.stats.snapshot(), completed: this.completed, elapsed,
        pps: elapsed ? this.completed * 1000 / elapsed : 0, running: this.running };
    }
  }

  return Object.freeze({ WIDTH, HEIGHT, VISIBLE_HEIGHT, PIECE_TYPES, ROTATIONS, COLORS,
    SHAPES, KICKS_JLSTZ, KICKS_I, KICKS_180, KICKS_I_180, kickTests, rotation,
    cells, cellsKey, sameCells, bounds, Board, spawnPiece, movePiece, rotatePiece,
    slidePiece, hardDrop, createRNG, Bag, ACTION_LABELS, applyAction, placementFor,
    finesseFor, allPlacements, DEFAULT_SETTINGS, SETTING_LIMITS, normalizeSettings,
    INPUT_ACTIONS, validateBindings, rebindKeys, InputHandler, COMBO_MILESTONES, ComboTracker, Stats, DrillSession, FreeSession,
    SPIN_SETS, SPIN_DRILLS, spinBoard, normalizeSpinProgress, solveSpinDrill, judgeSpinPlacement, SpinSession });
});
