/* ミルフィ — original art and Japanese teaching material for Miru Tet.
 * Classic scripts: load engine.js first, then use MiruTet.mascot.
 * Node: require('./mascot.js'). No DOM, network, fonts, or image dependencies.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'));
  } else {
    const api = factory(root.MiruTet);
    // engine.js deliberately freezes its API. Preserve its exports in a new
    // namespace rather than changing the engine or mutating that frozen object.
    root.MiruTet = Object.assign({}, root.MiruTet, { mascot: api });
  }
})(globalThis, function (engine) {
  'use strict';
  if (!engine || typeof engine.allPlacements !== 'function') {
    throw new Error('Load MiruTet engine.js before mascot.js');
  }

  function deepFreeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  const EXPRESSIONS = Object.freeze(['normal', 'happy', 'surprised', 'thinking', 'sorry']);
  const EXPRESSION_LABELS = Object.freeze({ normal: 'にっこり', happy: '大喜び',
    surprised: '応援', thinking: 'ヒント', sorry: 'もう一度' });

  // Include this string once in the app's stylesheet or a <style> element.
  // The happy face has its own closed smiling eyes; only open faces blink.
  const MASCOT_CSS = `
.mirufi { display: block; max-width: 100%; height: auto; overflow: hidden;
  --mirufi-sway: .7deg; --mirufi-sway-time: 4.8s; }
.mirufi--happy { --mirufi-sway: 1.4deg; --mirufi-sway-time: 3s; }
.mirufi--surprised { --mirufi-sway: 1.1deg; --mirufi-sway-time: 2.6s; }
.mirufi--thinking { --mirufi-sway: .5deg; --mirufi-sway-time: 5.6s; }
.mirufi--sorry { --mirufi-sway: .65deg; --mirufi-sway-time: 5s; }
.mirufi .mirufi-eyes-closed { opacity: 0; }
.mirufi--animated .mirufi-bob { animation: mirufi-bob 4s ease-in-out infinite; }
.mirufi--animated .mirufi-tail--left { transform-origin: 68px 110px;
  animation: mirufi-sway-left var(--mirufi-sway-time) ease-in-out infinite; }
.mirufi--animated .mirufi-tail--right { transform-origin: 232px 110px;
  animation: mirufi-sway-right var(--mirufi-sway-time) ease-in-out infinite; }
.mirufi--animated .mirufi-eyes-open { animation: mirufi-open 5.7s steps(1, end) infinite; }
.mirufi--animated .mirufi-eyes-closed { animation: mirufi-blink 5.7s steps(1, end) infinite; }
.mirufi--animated .mirufi-sparkle { transform-box: fill-box; transform-origin: center;
  animation: mirufi-twinkle 3.2s ease-in-out infinite; }
.mirufi--animated .mirufi-sparkle:nth-child(even) { animation-delay: -1.6s; }
@keyframes mirufi-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes mirufi-sway-left { 0%, 100% { transform: rotate(calc(-1 * var(--mirufi-sway))); }
  50% { transform: rotate(var(--mirufi-sway)); } }
@keyframes mirufi-sway-right { 0%, 100% { transform: rotate(var(--mirufi-sway)); }
  50% { transform: rotate(calc(-1 * var(--mirufi-sway))); } }
@keyframes mirufi-open { 0%, 43%, 46%, 100% { opacity: 1; } 44%, 45% { opacity: 0; } }
@keyframes mirufi-blink { 0%, 43%, 46%, 100% { opacity: 0; } 44%, 45% { opacity: 1; } }
@keyframes mirufi-twinkle { 0%, 100% { opacity: .5; transform: scale(.88); }
  50% { opacity: 1; transform: scale(1.08); } }
@media (prefers-reduced-motion: reduce) {
  .mirufi--animated .mirufi-bob, .mirufi--animated .mirufi-eyes-open,
  .mirufi--animated .mirufi-eyes-closed, .mirufi--animated .mirufi-sparkle,
  .mirufi--animated .mirufi-tail--left, .mirufi--animated .mirufi-tail--right { animation: none; }
  .mirufi .mirufi-eyes-open { opacity: 1; }
  .mirufi .mirufi-eyes-closed { opacity: 0; }
}`;


  const HAIR_SKINS = Object.freeze(['side', 'center', 'intake']);
  const DEFAULT_HAIR_SKIN = 'center';
  const HAIR_SKIN_LABELS = Object.freeze({ side: '7:3', center: '真ん中分け', intake: '控えめインテーク' });
  const HAIR_DESIGNS = deepFreeze({
  "side": {
    "outline": "M70 138 C59 91 77 36 135 29 C179 14 228 43 232 89 Q242 116 226 151 L218 174 Q210 151 214 125 C199 122 190 108 182 92 C173 104 150 116 126 118 Q105 121 86 123 Q88 153 77 179 Q66 165 70 138Z",
    "strands": "M181 34 C188 51 188 71 182 92 M164 37 C159 59 153 88 126 109 M141 37 C123 54 117 89 94 118 M198 48 C209 67 214 90 217 111 M91 61 Q76 91 78 121 M222 88 L224 123",
    "highlights": "M82 86 Q87 70 98 62 Q94 72 92 84Z M103 60 Q123 45 146 44 Q137 50 132 62 L124 76 L119 68Z M151 44 Q162 39 174 42 Q173 52 167 63 L159 74 L155 65Z M192 49 Q209 60 217 83 L205 76 Q201 63 192 60Z",
    "glints": "M107 84 Q112 75 118 70 M151 79 Q158 71 161 64 M203 84 L207 94",
    "shadow": "M86 123 Q105 121 126 118 C150 116 173 104 182 92 C190 108 199 122 214 125 L214 128 C199 125 190 111 182 95 C173 107 150 119 126 121 Q105 124 86 126Z"
  },
  "center": {
    "outline": "M70 138 C59 91 77 36 135 29 C179 14 228 43 232 89 Q242 116 226 151 L218 174 Q210 151 214 125 C191 132 164 111 150 89 C137 108 109 124 86 125 Q88 153 77 179 Q66 165 70 138Z",
    "strands": "M150 32 C146 50 147 68 150 89 M132 39 C116 58 115 89 94 113 M168 39 C184 58 185 89 206 113 M91 61 Q76 91 78 121 M222 88 L224 123",
    "highlights": "M82 86 Q87 70 98 62 Q94 72 92 84Z M104 60 Q119 47 139 44 Q130 52 126 65 L120 78 L116 69Z M160 44 Q181 45 195 59 L202 75 Q185 62 171 64Z M207 72 Q217 83 220 98 L211 92Z",
    "glints": "M108 82 Q112 73 116 68 M176 67 Q190 70 200 82",
    "shadow": "M86 125 C109 124 137 108 150 89 C164 111 191 132 214 125 L214 128 C191 135 164 114 150 92 C137 111 109 127 86 128Z"
  },
  "intake": {
    "outline": "M70 138 C59 91 77 36 135 29 C179 14 228 43 232 89 Q242 116 226 151 L218 174 Q210 151 214 125 C193 130 178 115 173 96 C169 80 158 76 150 86 C142 76 131 80 127 96 C122 115 107 130 86 125 Q88 153 77 179 Q66 165 70 138Z",
    "strands": "M150 32 C146 48 148 65 150 79 M147 77 C140 59 125 57 115 70 C106 83 105 101 94 113 M153 77 C160 59 175 57 185 70 C194 83 195 101 206 113 M91 61 Q76 91 78 121 M222 88 L224 123",
    "pockets": "M150 85 C143 68 130 65 122 75 C132 71 142 78 150 85Z M150 85 C157 68 170 65 178 75 C168 71 158 78 150 85Z",
    "highlights": "M82 86 Q87 70 98 62 Q94 72 92 84Z M105 68 C117 47 137 47 143 64 C133 55 120 58 113 74 L109 82Z M157 64 C163 47 183 47 195 68 L191 82 L187 74 C180 58 167 55 157 64Z M207 72 Q217 83 220 98 L211 92Z",
    "glints": "M116 62 Q127 54 136 60 M164 60 Q175 54 184 63",
    "shadow": "M86 125 C107 130 122 115 127 96 C131 80 142 76 150 86 C158 76 169 80 173 96 C178 115 193 130 214 125 L214 128 C193 133 178 118 173 99 C169 83 158 79 150 89 C142 79 131 83 127 99 C122 118 107 133 86 128Z",
    "opacity": ".30"
  }
});
  function normalizeHairSkin(value) {
    return HAIR_SKINS.includes(value) ? value : DEFAULT_HAIR_SKIN;
  }
  function frontHairSVG(skin, id, paint) {
    const v = HAIR_DESIGNS[skin], clip = id + '-intake-clip';
    const clipped = skin === 'intake' ? ` clip-path="url(#${clip})"` : '';
    return `<g data-part="front-hair" stroke="#929cc3" stroke-width="1.65">
      ${skin === 'intake' ? `<defs><clipPath id="${clip}"><path d="${v.outline}"/></clipPath></defs>` : ''}
      <path d="${v.outline}" fill="${paint('hair')}"/>
      <path d="${v.strands}" fill="none" opacity=".65"${clipped}/>
      ${skin === 'intake' ? `<path data-part="intake-root-shadow" d="${v.pockets}" fill="#929cc3" opacity="${v.opacity}" stroke="none"${clipped}/>` : ''}
      <path d="${v.highlights}" fill="#f5fff8" stroke="none" opacity=".82"${clipped}/>
      <path d="${v.glints}" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".75" fill="none"${clipped}/>
      <path d="M148 28 Q143 16 155 11 Q150 20 160 26" fill="${paint('hair')}" stroke-linecap="round"/>
    </g>`;
  }

  function xml(text) {
    return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;',
      '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
  }
  let svgSerial = 0;

  /** Chest-up original vector art, 300 × 328. opts: width, height (positive
   * numbers), title, idPrefix, animated (default true), halo (default true),
   * hairSkin (side, center, intake; missing/unknown values use center).
   * Each call scopes all paint/clip/title IDs, including when idPrefix repeats.
   * The uniform continues below the viewport for a natural portrait crop.
   * data-part groups keep the face, hair, and effect marks independently swappable.
   */
  function mascotSVG(expression = 'normal', opts = {}) {
    if (!EXPRESSIONS.includes(expression)) throw new RangeError('Unknown expression: ' + expression);
    const hairSkin = normalizeHairSkin(opts.hairSkin);
    const width = opts.width ?? 300, height = opts.height ?? 328;
    if (![width, height].every(n => Number.isFinite(n) && n > 0)) {
      throw new RangeError('Mascot dimensions must be positive numbers');
    }
    const prefix = String(opts.idPrefix ?? 'portrait').replace(/[^A-Za-z0-9_-]/g, '-') || 'portrait';
    const id = 'mirufi-' + prefix + '-' + (++svgSerial);
    const paint = name => `url(#${id}-${name})`;
    const title = opts.title ?? `ミルフィ：${EXPRESSION_LABELS[expression]}`;
    const happy = expression === 'happy', thinking = expression === 'thinking';
    const surprised = expression === 'surprised', sorry = expression === 'sorry';

    function eye(cx, side) {
      const cy = surprised ? 155 : sorry ? 160 : 157;
      const ry = surprised ? 29 : thinking && side === 'right' ? 23 : 26;
      const pupilX = cx + (thinking ? 4 : 0);
      return `<g class="mirufi-eye mirufi-eye--${side}">
        <path d="M${cx - 22} ${cy - 15} Q${cx} ${cy - ry - 12} ${cx + 22} ${cy - 14}
          Q${cx + 24} ${cy + 21} ${cx} ${cy + 25} Q${cx - 23} ${cy + 21} ${cx - 22} ${cy - 15}Z"
          fill="#fffafa"/>
        <g clip-path="${paint('eye-' + side)}">
          <ellipse cx="${pupilX}" cy="${cy}" rx="18" ry="${ry}" fill="${paint('iris')}"/>
          <ellipse cx="${pupilX}" cy="${cy - 2}" rx="8" ry="17" fill="#453961"/>
          <path d="M${pupilX - 13} ${cy + 13} Q${pupilX} ${cy + 25} ${pupilX + 13} ${cy + 13}"
            fill="none" stroke="#9ff0d9" stroke-width="5" stroke-linecap="round"/>
          <ellipse cx="${pupilX - 6}" cy="${cy - 13}" rx="7.2" ry="9" fill="#fff"/>
          <circle cx="${pupilX + 9}" cy="${cy + 6}" r="4" fill="#fff"/>
          <circle cx="${pupilX - 7}" cy="${cy + 15}" r="2" fill="#fff" opacity=".9"/>
          <path d="M${pupilX + 9} ${cy - 18} l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3Z"
            fill="#e5fff7"/>
        </g>
        <path d="M${cx - 23} ${cy - 15} Q${cx - 4} ${cy - ry - 9} ${cx + 22} ${cy - 14}"
          fill="none" stroke="#57465f" stroke-width="5" stroke-linecap="round"/>
        <path d="M${cx - 19} ${cy - 18} l-7-7 M${cx - 12} ${cy - 22} l-3-6"
          fill="none" stroke="#57465f" stroke-width="3.1" stroke-linecap="round"
          ${side === 'right' ? `transform="translate(${cx * 2} 0) scale(-1 1)"` : ''}/>
        <path d="M${cx - 14} ${cy + 23} Q${cx} ${cy + 29} ${cx + 13} ${cy + 23}"
          fill="none" stroke="#bb8d9e" stroke-width="1.5" stroke-linecap="round"/>
      </g>`;
    }

    const brows = happy
      ? 'M92 119 Q107 109 121 119 M179 119 Q193 109 208 119'
      : surprised ? 'M92 116 Q105 104 121 112 M179 112 Q195 104 208 116'
      : thinking ? 'M93 124 Q108 119 122 121 M179 115 Q195 111 207 119'
      : sorry ? 'M93 125 Q110 126 123 116 M177 116 Q190 126 207 125'
      : 'M93 120 Q107 113 122 119 M178 119 Q193 113 207 120';
    const mouth = happy
      ? '<path d="M140 195 Q150 199 160 195 C159 205 155 211 150 211 C145 211 141 205 140 195Z" fill="#a9607b"/><path d="M145 207 Q150 203 155 207 Q150 212 145 207Z" fill="#f9a9b8"/>'
      : surprised ? '<ellipse cx="150" cy="202" rx="7" ry="9" fill="#b66d85"/><ellipse cx="150" cy="206" rx="4" ry="3" fill="#ffc0c7"/>'
      : thinking ? '<path d="M144 201 Q149 198 155 201" fill="none" stroke="#a96d83" stroke-width="2.5" stroke-linecap="round"/>'
      : sorry ? '<path d="M141 205 Q150 197 159 205" fill="none" stroke="#a96d83" stroke-width="2.5" stroke-linecap="round"/>'
      : '<path d="M140 198 Q150 208 160 198" fill="none" stroke="#a96780" stroke-width="2.5" stroke-linecap="round"/>';

    const closedEyes = happy
      ? '<path d="M93 159 C101 148 116 146 126 156 M174 156 C184 146 199 148 207 159" fill="none" stroke="#5d4965" stroke-width="3.6" stroke-linecap="round"/><path d="M94 157 Q90 157 88 153 M206 157 Q210 157 212 153" fill="none" stroke="#5d4965" stroke-width="2.3" stroke-linecap="round"/>'
      : `<path d="M91 160 Q109 171 128 160 M172 160 Q191 171 209 160"
      fill="none" stroke="#57465f" stroke-width="4" stroke-linecap="round"/>
      <path d="M93 158 l-5-4 M207 158 l5-4" fill="none" stroke="#57465f" stroke-width="2.5" stroke-linecap="round"/>`;
    const accents = [
      happy ? '<g class="mirufi-sparkle" fill="#fff0bc" stroke="#d6b7c2" stroke-width="1.1"><path d="M32 166 l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z"/></g>' : '',
      happy || surprised ? '<g class="mirufi-sparkle" fill="#e2d2fa" stroke="#b3a1cf" stroke-width="1.1"><path d="M263 46 l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"/></g>' : '',
      surprised ? '<path d="M29 161 l1 14 M30 183 v1" stroke="#d6b7c2" stroke-width="3.5"/>' : '',
      thinking ? '<path d="M257 71 Q256 60 265 59 Q276 59 275 68 Q275 73 266 77 L266 82 M266 90 v1" stroke="#b29cce" stroke-width="3.5"/>' : '',
      sorry ? '<path d="M239 157 Q231 169 236 173 Q243 178 245 170 Q245 165 239 157Z" fill="#c5e4f3" stroke="#a5bedb" stroke-width="1.3"/>' : ''
    ].join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 300 328" overflow="hidden"
      class="mirufi mirufi--${expression}${opts.animated === false ? '' : ' mirufi--animated'}" role="img"
      aria-labelledby="${id}-title ${id}-desc" focusable="false" data-expression="${expression}" data-hair-skin="${hairSkin}">
      <title id="${id}-title">${xml(title)}</title>
      <desc id="${id}-desc">ミルテト学園の案内役、ミルフィ。ミントとライラックのツインテール、きらきらした瞳、ブロックの髪飾りと桃色の制服です。</desc>
      <defs>
        <linearGradient id="${id}-hair" x1=".15" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox">
          <stop stop-color="#edfff3"/><stop offset=".34" stop-color="#afe5d9"/><stop offset=".7" stop-color="#c6d4f1"/><stop offset="1" stop-color="#c6a9e3"/>
        </linearGradient>
        <linearGradient id="${id}-tail" x1="0" y1="0" x2=".8" y2="1">
          <stop stop-color="#b7e9de"/><stop offset=".5" stop-color="#a7d9d6"/><stop offset=".82" stop-color="#c9b3e8"/><stop offset="1" stop-color="#eed5f4"/>
        </linearGradient>
        <linearGradient id="${id}-skin" x1="0" y1="0" x2=".3" y2="1">
          <stop stop-color="#fff8ee"/><stop offset=".7" stop-color="#fff1e9"/><stop offset="1" stop-color="#f7d9d8"/>
        </linearGradient>
        <linearGradient id="${id}-iris" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#4e456e"/><stop offset=".4" stop-color="#8476b8"/><stop offset=".73" stop-color="#9bbae0"/><stop offset="1" stop-color="#b2f4df"/>
        </linearGradient>
        <linearGradient id="${id}-uniform" x1="0" y1="0" x2=".7" y2="1">
          <stop stop-color="#fff4f7"/><stop offset=".6" stop-color="#f6d8e8"/><stop offset="1" stop-color="#dfc8e9"/>
        </linearGradient>
        <linearGradient id="${id}-ribbon" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#c1a4de"/><stop offset=".5" stop-color="#e6cdf3"/><stop offset="1" stop-color="#b49cd5"/>
        </linearGradient>
        <radialGradient id="${id}-blush"><stop stop-color="#f5a4b6" stop-opacity=".7"/><stop offset="1" stop-color="#ffb9c7" stop-opacity="0"/></radialGradient>
        <radialGradient id="${id}-halo"><stop stop-color="#fcf4ff"/><stop offset=".8" stop-color="#edf9f5" stop-opacity=".7"/><stop offset="1" stop-color="#edf9f5" stop-opacity="0"/></radialGradient>
        ${['left', 'right'].map((side, i) => {
          const cx = i ? 191 : 109, cy = surprised ? 155 : sorry ? 160 : 157;
          const ry = surprised ? 29 : thinking && side === 'right' ? 23 : 26;
          return `<clipPath id="${id}-eye-${side}"><path d="M${cx - 22} ${cy - 15} Q${cx} ${cy - ry - 12} ${cx + 22} ${cy - 14} Q${cx + 24} ${cy + 21} ${cx} ${cy + 25} Q${cx - 23} ${cy + 21} ${cx - 22} ${cy - 15}Z"/></clipPath>`;
        }).join('')}
      </defs>
      ${opts.halo === false ? '' : `<ellipse cx="150" cy="180" rx="144" ry="171" fill="${paint('halo')}"/>`}
      <g class="mirufi-bob" stroke-linejoin="round">
        <g data-part="back-hair" stroke="#929cc3" stroke-width="1.8">
          <g class="mirufi-tail--left">
            <path d="M72 88 C44 81 30 103 31 143 C33 182 10 212 17 258 C20 288 34 312 55 319 C41 291 61 270 63 242 C70 275 58 302 62 317 C89 296 91 262 82 224 C77 189 96 130 72 88Z" fill="${paint('tail')}"/>
            <path d="M62 117 C48 155 59 182 42 225 C31 258 37 281 45 294 M74 149 C66 189 77 221 71 254" fill="none" opacity=".6"/>
            <path d="M43 134 C48 106 54 105 58 110 C48 139 54 167 44 192 C47 168 40 156 43 134Z" fill="#f3fff8" stroke="none" opacity=".65"/>
          </g>
          <g class="mirufi-tail--right">
            <path d="M228 88 C256 81 270 103 269 143 C267 182 290 212 283 258 C280 288 266 312 245 319 C259 291 239 270 237 242 C230 275 242 302 238 317 C211 296 209 262 218 224 C223 189 204 130 228 88Z" fill="${paint('tail')}"/>
            <path d="M238 117 C252 155 241 182 258 225 C269 258 263 281 255 294 M226 149 C234 189 223 221 229 254" fill="none" opacity=".6"/>
            <path d="M257 134 C252 106 246 105 242 110 C252 139 246 167 256 192 C253 168 260 156 257 134Z" fill="#f3fff8" stroke="none" opacity=".65"/>
          </g>
          <path d="M67 136 C54 79 77 29 144 25 C214 19 251 68 234 141 L229 177 Q225 190 219 198 L214 211 Q207 207 207 198 L200 207 Q201 195 205 182 L95 182 Q99 195 100 207 L93 198 Q93 207 86 211 L81 198 Q75 190 71 177Z" fill="${paint('hair')}"/>
        </g>
        <g data-part="hair-ribbons" stroke="#a08cbd" stroke-width="1.5">
          <path d="M66 100 Q39 74 34 91 L44 115 Q29 137 43 143 L68 121 L76 140 Q88 134 77 110Z M234 100 Q261 74 266 91 L256 115 Q271 137 257 143 L232 121 L224 140 Q212 134 223 110Z" fill="${paint('ribbon')}"/>
          <path d="M46 96 L64 111 L45 133 M254 96 L236 111 L255 133" fill="none" stroke="#f5e6ff" stroke-width="2.5"/>
          <ellipse cx="68" cy="112" rx="9" ry="12" fill="#e9d6f3"/><ellipse cx="232" cy="112" rx="9" ry="12" fill="#e9d6f3"/>
        </g>
        <g data-part="outfit" stroke="#b49ab8" stroke-width="1.8">
          <path d="M136 213 L134 238 Q150 253 166 238 L164 213" fill="${paint('skin')}"/>
          <path d="M134 227 Q150 236 166 227" stroke="#e7b8bd" fill="none"/>
          <path d="M132 234 Q107 234 89 253 Q77 271 75 300 L73 350 H227 L225 300 Q223 271 211 253 Q193 234 168 234 Q150 249 132 234Z" fill="${paint('uniform')}"/>
          <path d="M107 241 L94 261 L119 293 L150 261 L181 293 L206 261 L193 241 L166 238 L150 255 L134 238Z" fill="#c4b5de"/>
          <path d="M108 248 L101 260 L120 283 L144 260 M192 248 L199 260 L180 283 L156 260" stroke="#fff4fa" stroke-width="2.6" fill="none"/>
          <path d="M150 268 Q124 249 124 268 L127 287 Q142 284 150 275 Q158 284 173 287 L176 268 Q176 249 150 268Z" fill="${paint('ribbon')}"/>
          <path d="M144 275 L137 301 L150 294 L163 301 L156 275" fill="#c6b0df"/>
          <rect x="144" y="264" width="12" height="15" rx="5" fill="#fff2cf" stroke="#d6b8bb"/>
          <path d="M150 309 L150 347" stroke="#e8c4d9"/><circle cx="150" cy="315" r="2.5" fill="#fdf7ff"/><circle cx="150" cy="336" r="2.5" fill="#fdf7ff"/>
          <path d="M179 305 h12 v12 h-12Z M183 301 h4 v4" fill="#d0ece2" stroke="#a7c5bd" stroke-width="1.3"/>
        </g>
        <g data-part="face-base">
          <ellipse cx="76" cy="168" rx="11" ry="17" fill="${paint('skin')}" stroke="#c9a3ac" stroke-width="1.5"/>
          <ellipse cx="224" cy="168" rx="11" ry="17" fill="${paint('skin')}" stroke="#c9a3ac" stroke-width="1.5"/>
          <path d="M76 117 C75 83 99 65 150 65 C201 65 225 83 224 117 L224 166 C223 195 194 226 150 233 C106 226 77 195 76 166Z" fill="${paint('skin')}" stroke="#bd9aa9" stroke-width="1.6"/>
          <path data-part="hairline-shadow" d="${HAIR_DESIGNS[hairSkin].shadow}" fill="#e7c6cb" opacity=".24"/>
        </g>
        <g class="mirufi-expression" data-expression="${expression}">
          <g data-part="eyebrows"><path d="${brows}" fill="none" stroke="#a092b3" stroke-width="2.8" stroke-linecap="round"/></g>
          <g data-part="eyes">
            ${happy ? `<g class="mirufi-happy-eyes">${closedEyes}</g>` : `<g class="mirufi-eyes-open">${eye(109, 'left')}${eye(191, 'right')}</g><g class="mirufi-eyes-closed" opacity="0">${closedEyes}</g>`}
          </g>
          <g data-part="cheeks"${happy ? ' transform="translate(0 -3)"' : ''}>
            <ellipse cx="92" cy="187" rx="${happy ? 21 : 23}" ry="${happy ? 12 : 13}" fill="${paint('blush')}"/><ellipse cx="208" cy="187" rx="${happy ? 21 : 23}" ry="${happy ? 12 : 13}" fill="${paint('blush')}"/>
            <path d="M83 186 l-1 4 M90 187 l-1 4 M97 187 l-1 4 M203 187 l-1 4 M210 187 l-1 4 M217 186 l-1 4" stroke="#e7a3b4" stroke-width="1.4" stroke-linecap="round"/>
          </g>
          <path d="M149 182 q-3 4 1 4" fill="none" stroke="#ddb7b8" stroke-width="1.4" stroke-linecap="round"/>
          <g data-part="mouth">${mouth}</g>
        </g>
        ${frontHairSVG(hairSkin, id, paint)}
        <g data-part="block-clip" transform="rotate(-17 91 88)" stroke="#b09ab3" stroke-width="1.5">
          <path d="M74 79 h12 v-12 h12 v12 h12 v12 H74Z" fill="#fff0c8"/>
          <path d="M76 81 h8 v8 h-8Z M88 69 h8 v8 h-8Z M88 81 h8 v8 h-8Z M100 81 h8 v8 h-8Z" fill="#f5cedf" stroke="none"/>
          <path d="M78 83 h4 M90 71 h4 M90 83 h4 M102 83 h4" stroke="#fffaf0" stroke-linecap="round"/>
        </g>
        <g data-part="expression-accents" fill="none" stroke-linecap="round">${accents}</g>
      </g>
    </svg>`;
  }

  const PRAISE_LINES = Object.freeze([
    'やりました！パーフェクトです♪',
    'ぴったり最短です！とてもきれいな操作ですね。',
    '今の一手、ミルフィも見とれちゃいました♪',
    'むだのない動きです！その感覚を覚えてくださいね。',
    '大成功です！指が道順を覚えてきましたね。',
    '目標にすっと届きましたね！お見事です。',
    'その調子です♪ 一つずつ上手になっていますね。',
    '最短ルート、ばっちりです！',
    '今の置き方、とってもなめらかでしたよ♪',
    '落ち着いて置けましたね。パーフェクトです！',
    'きらっと光るフィネスです♪ 次もいっしょに練習しましょう。',
    'すごいです！必要な入力だけで届きましたね。',
    '回数も位置も花まるです♪',
    '一手ずつの判断が実っていますね！',
    'いいリズムです！ミルフィもうれしいです♪',
    '狙いどおりです！そのルートはもう得意ですね。',
    'ミルテト学園の花まるをどうぞ♪ とても上手です！',
    '最短の道を選べましたね！自信を持ってください。'
  ]);
  const STREAK_LINES = deepFreeze({
    5: ['5連続パーフェクトです！いいリズムができてきましたね♪'],
    10: ['10連続です！両手にいっぱい花まるを贈りますね♪'],
    25: ['25連続パーフェクトです！落ち着いた操作、とてもすてきです。'],
    50: ['50連続です！ミルフィ、感激です♪ 少し休憩しても大丈夫ですよ。']
  });
  const PIECE_PRAISE = deepFreeze({
    I: ['Iミノがすらっと到着です！縦も横もお見事ですね♪', 'Iミノの長さを上手に生かせましたね！'],
    O: ['Oミノがころんと着地です♪ 移動だけでばっちりですね。', 'Oミノの最短移動、花まるです！'],
    T: ['Tミノの向きも位置もぴったりです♪', 'Tミノの回転選び、とても上手ですね！'],
    L: ['Lミノの曲がり角まで、きれいに合わせましたね！', 'Lミノがすっと収まりました♪'],
    J: ['Jミノも最短です！鏡向きの形を見分けられましたね。', 'Jミノの道順、もうばっちりですね♪'],
    S: ['Sミノの斜めの形も、すいっと置けましたね♪', 'Sミノの向き選び、お見事です！'],
    Z: ['Zミノも迷わず到着です！すてきですね♪', 'Zミノの最短ルート、しっかり覚えていますね。']
  });
  const MISS_LINES = Object.freeze([
    '少し違う場所でしたね。輪郭をもう一度見て、ゆっくり試しましょう。',
    '大丈夫ですよ♪ 同じ目標でもう一度練習できます。',
    'まずは向き、その次は列を確かめましょうね。',
    '焦らなくて大丈夫です。着地の影と目標の輪郭を重ねてみましょう。',
    'あと少しです！落とす前に一呼吸おいてみましょう。',
    'ミルフィといっしょに、目標までの道を見直しましょうね。'
  ]);
  const ENCOURAGEMENT_LINES = Object.freeze([
    '速さはあとからついてきます。まずは正確に置いてみましょう♪',
    'ひとつ覚えられたら、それだけで前進です！',
    '迷ったらヒントを見ても大丈夫です。一緒に覚えましょう。',
    'むずかしい列は、同じ目標を繰り返すと慣れてきますよ。',
    '指が疲れたら休憩しましょうね。練習はいつでも再開できます。',
    '昨日の自分より、ひとつ気づけたら大成功です♪'
  ]);
  const WELCOME_LINES = Object.freeze([
    'ミルテト学園へようこそ！案内役のミルフィです♪',
    'はじめまして、ミルフィです！いっしょに最短の操作を覚えましょうね。',
    'おかえりなさい♪ 今日も少しずつ、フィネスを練習しましょう！',
    '準備はできましたか？レッスンもドリルも、好きなところからどうぞ♪'
  ]);
  const TIPS = Object.freeze([
    'フィネスは、目標の向きと列へ最少の入力で運ぶ練習です。速押しより道順が大切ですよ。',
    '壁まで移動するならDASが便利です。方向キーの長押しは、移動が続いても1入力です。',
    'DASは連続移動が始まるまでの待ち時間です。設定で自分に合う長さを探しましょう。',
    'ARRはDAS後の移動間隔です。ARRが0なら、チャージ後は壁まで一気に移動しますよ。',
    '壁の一つ手前は、壁までDASしてから逆方向へ1回戻すルートも確認しましょう。',
    '中央の近くは、短いタップだけで届くことがありますよ。目標までの距離を見ましょう。',
    '回転はCWとCCWを使い分けると、3回回す操作を1回に減らせますよ。',
    'CWは右回転、CCWは左回転です。両方のキーを無理なく押せる位置にしましょうね。',
    '180°回転が有効なら、T・J・Lの上下反転は1回転入力でできますよ。',
    '180°回転をオフにすると最短手順も変わります。今の設定に合うヒントを見てくださいね。',
    'SRSは回転の仕組みです。壁に当たると、補正で少し位置がずれることがありますよ。',
    'Iミノの回転補正はほかのミノと別です。縦向きの列を着地の影で確かめましょう。',
    'Oミノは回しても置く形が変わりません。このドリルでは移動だけで大丈夫ですよ。',
    'I・S・Zミノの着地の形は縦と横の2種類です。同じ着地になる回転状態がありますよ。',
    'LとJは鏡向きです。出現時の上の1マスが、どちら側かを見てみましょう。',
    'SとZは出現時の斜めの向きが逆です。色と形をいっしょに覚えると安心ですよ。',
    'IRSは出現時の先行回転です。ARE中から回転キーを押し、出現する瞬間まで長押ししましょう。',
    'IRSの回転も1入力です。先に押しておけば、出現してすぐ移動に取りかかれますよ。',
    'IRSで回転キーを複数押した場合は、最後に押している回転キーが優先されますよ。',
    'AREは次のミノが出るまでの待ち時間です。IRSの練習では少し長めに設定してみましょう。',
    'ARE中はNextと次の目標を見て、出現する前に向きと列を決めてみましょう。',
    '方向キーを押したままなら、ARE中もDASのチャージが続きます。次の目標に注意しましょうね。',
    'IHSは出現時の先行ホールドです。設定で有効にして、ARE中にホールドを押してみましょう。',
    'ホールドはフィネス入力に数えません。このドリルではスキップ扱いになり、目標も変わります。',
    '1種類だけの練習ではホールドは使えません。そのミノの道順に集中しましょうね。',
    'ハードドロップはフィネスの入力回数に数えません。向きと位置が合ったら落としましょう♪',
    '空の盤面の最短手順にはソフトドロップは不要です。押すたびに1入力増えるので気をつけましょう。',
    '壁に向かって余分に押しても1入力に数えます。届いたらキーを離す習慣をつけましょうね。',
    'DCDは回転や出現のあとに自動横移動を少し待たせる設定です。意図しない移動の調整に使えます。',
    'SDFはソフトドロップの速さです。瞬間落下でも固定はしないので、確定はハードドロップですよ。',
    '左右を同時に押すと、あとから押した方向が優先されます。離したあとの動きにも注意しましょう。',
    'ヒントの列番号は、ミノが占めるいちばん左のマスです。盤面の左端を1列目として数えますよ。',
    'ミスは目標との位置違い、フィネスフォルトは入力の使いすぎです。結果を分けて振り返りましょう。',
    '同じ最短回数になる道順は複数あります。ヒントと違う順序でも、回数と着地が合えばパーフェクトです。',
    'PPSは1秒あたりに置いたミノの数です。まず正確さを保ち、慣れてから少しずつ上げましょう。',
    'キー配置は変更できます。回転と移動を両手に分けるなど、楽な押し方を試してくださいね。'
  ]);
  const SPRINT_COMMENTS = deepFreeze({
    // Accuracy uses the engine's percent scale, 0..100; PPS is pieces/second.
    accuracy: [
      { min: 100, expression: 'happy', text: '全問パーフェクトです！丁寧に積み重ねた成果ですね♪' },
      { min: 95, expression: 'happy', text: 'とても高い正確さです！あと少しで全問パーフェクトですね♪' },
      { min: 80, expression: 'surprised', text: '最短の操作が身についてきましたね！苦手な列をドリルで復習しましょう。' },
      { min: 0, expression: 'normal', text: '最後までおつかれさまでした！ヒントを見ながら、一つずつ最短ルートを覚えましょうね。' }
    ],
    pps: [
      { min: 2, text: 'すいすい進む速さでしたね！手を休める時間も大切ですよ。' },
      { min: 1, text: 'いいテンポです♪ このリズムで正確さも育てていきましょう。' },
      { min: 0, text: 'じっくり取り組めましたね♪ 慣れるほど速さもついてきますよ。' }
    ]
  });

  /** Plain text only: render with textContent, then render key caps separately
   * from the engine's action IDs using the player's current bindings.
   */
  function hintText(piece, used, optimal, optimalSeqLabels) {
    if (!engine.PIECE_TYPES.includes(piece)) throw new RangeError('Unknown piece: ' + piece);
    if (![used, optimal].every(n => Number.isInteger(n) && n >= 0) ||
      !Array.isArray(optimalSeqLabels) || !optimalSeqLabels.every(s => typeof s === 'string') ||
      optimalSeqLabels.length !== optimal) throw new RangeError('Invalid finesse hint');
    const route = optimal === 0 ? '移動も回転もせず、ハードドロップだけで大丈夫です。'
      : `こうすると${optimal}回で置けますよ：${optimalSeqLabels.join(' → ')}。最後はハードドロップです。`;
    const extra = Math.max(0, used - optimal);
    return `${piece}ミノは今回${used}回、最短は${optimal}回です。${extra ? `あと${extra}回、入力を減らせますね♪ ` : '道順を確かめましょうね♪ '}${route}`;
  }
  function sprintComment(accuracy, pps) {
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100 || !Number.isFinite(pps) || pps < 0) {
      throw new RangeError('Accuracy must be 0..100 and PPS must be nonnegative');
    }
    return SPRINT_COMMENTS.accuracy.find(tier => accuracy >= tier.min).text +
      ' ' + SPRINT_COMMENTS.pps.find(tier => pps >= tier.min).text;
  }
  const DIALOGUE = deepFreeze({ welcome: WELCOME_LINES, praise: PRAISE_LINES, streak: STREAK_LINES,
    perPiece: PIECE_PRAISE, miss: MISS_LINES, encouragement: ENCOURAGEMENT_LINES,
    tips: TIPS, sprint: SPRINT_COMMENTS });

  /** All DISTINCT empty-board landings grouped by the engine's canonical
   * optimal action sequence, including [] (no movement). x is zero-based
   * occupied-left-column, column is its one-based display equivalent. Symmetric
   * rotations share a cell set and appear exactly once. No handwritten table.
   * Pass {allow180:false} when the app disables 180; default matches the engine.
   * The result is fresh mutable data, isolated from engine and lesson caches.
   */
  function lessonPlacementGroups(piece, opts = {}) {
    const groups = new Map();
    for (const placement of engine.allPlacements(piece, { allow180: opts.allow180 !== false })) {
      const signature = JSON.stringify(placement.actions);
      if (!groups.has(signature)) groups.set(signature, {
        id: piece + '-' + (placement.actions.join('-') || 'drop'), piece,
        count: placement.count, actions: placement.actions.slice(), sequence: placement.sequence.slice(),
        label: placement.sequence.length ? placement.sequence.join(' → ') : 'そのままハードドロップ',
        placements: []
      });
      groups.get(signature).placements.push({ ...placement, column: placement.x + 1,
        rotationLabel: engine.ROTATIONS[placement.rot],
        label: `${engine.ROTATIONS[placement.rot]}向き・左から${placement.x + 1}列目` });
    }
    return Array.from(groups.values()).sort((a, b) => a.count - b.count ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  const PIECE_LESSON_TEXT = deepFreeze({
    I: ['Iミノは4マスのまっすぐな形です。縦と横の置き方を覚えましょう！',
      '着地の形は2種類です。0と2、RとLは同じ着地の形になりますが、回転後の列は確かめてくださいね。',
      'Iミノの回転補正は専用です。横移動と回転の順番も、表の実演で見てみましょう♪'],
    O: ['Oミノは2×2の四角です。回転しても、置く形と位置は変わりませんよ。',
      '最短の置き方に回転は不要です。移動だけの9か所を、表で確認しましょう。',
      '壁までころん、ひとつ戻ってころん♪ OミノでDASの感覚を覚えましょう。'],
    T: ['Tミノは上に1マス出た形です。4つの向きと列をセットで覚えましょう。',
      '右向きはCW、左向きはCCWが候補です。下向きは、設定で有効なら180°回転1回でも作れますよ。',
      '向きを先に決めると、移動中に迷いにくくなりますね♪'],
    L: ['Lミノは出現時の右上に1マスある形です。4つの向きを見てみましょう。',
      '横向きと縦向きでは幅が変わります。目標のいちばん左のマスを確認してくださいね。',
      '長い辺と短い辺を見分けると安心です♪ 表の回転方向を試してみましょう。'],
    J: ['Jミノは出現時の左上に1マスある形です。Lミノとは鏡向きですね。',
      '同じ列でも、Lミノと同じ回転で届くとは限りません。Jミノの表を確かめましょう。',
      '左上の小さな角を目印にすると、向きを覚えやすいですよ♪'],
    S: ['Sミノは右上がりの階段のような形です。横と縦の2種類を練習しましょう。',
      '0と2、RとLは同じ着地の形です。180°回転で形を変える必要はありませんよ。',
      'CWとCCWで同じ縦の形でも列が変わります。最短の道順は表で見てみましょう♪'],
    Z: ['Zミノは左上がりの階段のような形です。Sミノと斜めの向きが逆ですよ。',
      '着地の形は横と縦の2種類です。同じ形になる回転状態も、最短回数をまとめて調べています。',
      '赤い階段の向きを見てから、回転と移動を選びましょうね♪']
  });

  // Declarative demo schema (JSON serializable; app.js owns time and drawing):
  // sequence = engine solver action IDs; dasLeft/dasRight mean key holds until
  // DAS/ARR reaches the wall, NOT literal InputHandler action names. finish is
  // hardDrop (0 finesse cost). For each variant reset to an empty-board spawn.
  // buffered events happen during ARE; keep held actions down through spawn.
  // An app can use InputHandler for those events, including IRS/IHS, and render
  // target.cells directly. Targets always use engine coordinates (y up).
  function demoVariant(piece, id, sequence, settings) {
    const board = new engine.Board();
    let state = engine.spawnPiece(piece);
    for (const action of sequence) {
      state = engine.applyAction(board, state, action, settings);
      if (!state) throw new Error('Invalid lesson demonstration: ' + id);
    }
    const lock = engine.hardDrop(board, state);
    return { id, piece, sequence: sequence.slice(), labels: sequence.map(a => engine.ACTION_LABELS[a]),
      inputCount: sequence.length, target: engine.finesseFor(piece, engine.cells(lock), settings),
      finish: 'hardDrop' };
  }
  function practice(piece, targets, settings) {
    return { piece, targets, requireOptimal: true, hints: true, settings: { ...settings } };
  }
  function pieceStep(piece, settings) {
    const placementGroups = lessonPlacementGroups(piece, settings);
    const all = placementGroups.flatMap(group => group.placements);
    const left = engine.finesseFor(piece, { rot: 0, x: 0 }, settings);
    const center = all.find(target => target.count === 0);
    const edge = piece === 'O' ? engine.finesseFor(piece, { rot: 0, x: 8 }, settings)
      : all.filter(target => target.rot !== 0).sort((a, b) => b.x - a.x || a.count - b.count)[0];
    const targets = [left, center, edge];
    return { id: 'piece-' + piece, title: piece + 'ミノのレッスン', expression: 'normal',
      lines: [...PIECE_LESSON_TEXT[piece],
        '表は最短の手順ごとにまとめています。列はミノのいちばん左のマスを、左端から1、2と数えますよ。',
        '3つの実演を見たら、同じミノの目標に挑戦しましょう！ヒントを見ながらで大丈夫です♪'],
      demo: { type: 'piece-placements', piece, settings: { ...settings }, placementGroups,
        examples: targets.map((target, i) => demoVariant(piece, piece + '-example-' + (i + 1), target.actions, settings)),
        targets },
      tryIt: practice(piece, targets, settings) };
  }

  /** Exactly the SPEC's 12 steps. Rebuild when allow180 changes so tables,
   * demonstrations, hints, and required counts all use the live solver option.
   * IRS/IHS demo overrides enable the feature and lengthen ARE for visibility;
   * app.js should apply these temporarily to its demonstration handler only.
   */
  function createLessons(opts = {}) {
    const settings = { allow180: opts.allow180 !== false, gravity: 0, spawnDrop: false };
    const dasTarget = engine.finesseFor('O', { rot: 0, x: 0 }, settings);
    const rotationVariants = [demoVariant('T', 'cw', ['cw'], settings),
      demoVariant('T', 'ccw', ['ccw'], settings),
      demoVariant('T', 'half-turn', settings.allow180 ? ['rotate180'] : ['cw', 'cw'], settings)];
    const irsDemo = demoVariant('T', 'irs', ['cw'], settings);
    const ihsTarget = engine.finesseFor('O', { rot: 0, x: 4 }, settings);
    const summaryTarget = engine.finesseFor('T', { rot: 2, x: 0 }, settings);
    return deepFreeze([
      { id: 'finesse', title: 'フィネスとは？', expression: 'normal', lines: [
        'ミルテト学園へようこそ！ミルフィです♪ フィネスは、目標の場所へ最少のキー入力でミノを運ぶことです。',
        '道順が短くなると、素早く置きやすくなり、押し間違いも減らせますよ。まずは正確に試しましょうね。',
        '左右のタップ、壁までの長押し、回転はそれぞれ1入力です。ソフトドロップも押すたびに1入力に数えます。',
        'ハードドロップは回数に数えません。ホールドも数えませんが、このドリルではスキップ扱いで目標が変わりますよ。',
        '出現位置の真下が目標なら、移動と回転は0回です。まずはそのまま落としてみましょう♪'
      ], demo: { type: 'optimal-placement', piece: 'O', settings: { ...settings },
        ...demoVariant('O', 'zero-input', [], settings) },
      tryIt: practice('O', [ihsTarget], settings) },
      { id: 'das', title: 'なぜ壁までDAS？', expression: 'thinking', lines: [
        'Oミノを左端へ運びます。左を4回押すと4入力ですが、壁まで長押しするDASなら1入力ですよ。',
        'DASは、押してから連続移動が始まるまでの待ち時間です。長押し中の移動はまとめて1入力になります。',
        'ARRはその後の移動間隔です。ARRが0なら、DASがたまると壁まで一気に移動しますよ。',
        '設定でDASとARRを調整できます。まずは待ってからすべる感覚を、ミルフィと確かめましょう♪'
      ], demo: { type: 'compare-sequences', piece: 'O', settings: { ...settings, das: 110, arr: 0 },
        targets: [dasTarget], variants: [demoVariant('O', 'four-taps', ['left', 'left', 'left', 'left'], settings),
          demoVariant('O', 'one-das', ['dasLeft'], settings)], settingsLink: 'handling' },
      tryIt: practice('O', [dasTarget], { ...settings, das: 110, arr: 0 }) },
      { id: 'rotation', title: '回転の基本（SRS・CW・CCW・180°）', expression: 'normal', lines: [
        'CWは右へ90°、CCWは左へ90°の回転です。両方を使うと、遠回りの回転を減らせますよ。',
        settings.allow180 ? '180°回転がオンなら、半回転も1入力です。Tミノを下向きにするときに試しましょう。'
          : '今は180°回転がオフです。半回転は90°回転を2回使います。オンにすると最短手順も変わりますよ。',
        'このゲームの回転はSRSです。壁や床にぶつかると、決められた順で位置を補正して回転を試します。',
        'Iミノの補正は専用で、Oミノは回しても置く形が変わりません。形と着地の影を見てくださいね。'
      ], demo: { type: 'rotation-basics', piece: 'T', settings: { ...settings }, variants: rotationVariants,
        targets: rotationVariants.map(variant => variant.target), rotationSystem: 'SRS', kickSource: 'engine' },
      tryIt: practice('T', rotationVariants.map(variant => variant.target), settings) },
      { id: 'irs-ihs', title: 'IRS・IHSとARE', expression: 'surprised', lines: [
        'IRSは出現時の先行回転です。次のミノが出る瞬間に回転キーを押し続けていると、回転した状態で出てきます！',
        'AREは次のミノが出るまでの待ち時間です。この間に回転キーを押し、出現する瞬間まで長押ししてみましょう。',
        'IRSの回転も新しいミノの1入力です。通常と同じSRSの補正を使い、回転できないときは元の向きで出現します。複数の回転キーでは最後に押したものが優先ですよ。',
        'IHSは出現時の先行ホールドです。オンなら、ARE中にホールドを押すか、出現時まで長押しすると交換できます。',
        'ホールドは1個につき固定まで1回です。ドリルではスキップ扱いで目標も変わり、1種類だけの練習では使えません。',
        '設定でIRSは初期オン、IHSは初期オフ、AREは初期80msです。練習ではAREを少し長くすると押すタイミングをつかみやすいですよ♪'
      ], demo: { type: 'spawn-buffer', piece: 'T', settings: { ...settings, irs: true, ihs: true, are: 350 },
        targets: [irsDemo.target, ihsTarget], variants: [
          { ...irsDemo, type: 'irs', buffered: [{ action: 'cw', during: 'are', holdThroughSpawn: true }] },
          { id: 'ihs', type: 'ihs', piece: 'T', heldPiece: 'O', nextPiece: 'I',
            buffered: [{ action: 'hold', during: 'are', holdThroughSpawn: true }],
            sequence: [], labels: [], inputCount: 0, target: ihsTarget, finish: 'hardDrop', holdCounts: false }
        ], settingsLink: 'handling' },
      tryIt: { ...practice('T', [irsDemo.target], { ...settings, irs: true, ihs: false, are: 350 }),
        requireIRS: true, bufferedAction: 'cw' } },
      ...['I', 'O', 'T', 'L', 'J', 'S', 'Z'].map(piece => pieceStep(piece, settings)),
      { id: 'summary', title: 'まとめ：ドリルへ出発です♪', expression: 'happy', lines: [
        'レッスン修了です！まず向きと列を決めて、回転・タップ・DASの最短ルートを選びましょう。',
        'ハードドロップは入力回数に含みません。IRSの回転は1入力です。落とす前に目標の輪郭を確かめてくださいね。',
        '同じ最短回数なら、表と別の道順でもパーフェクトです。むずかしい場所はヒントと再挑戦で練習できますよ。',
        '進み具合はアプリに保存され、レッスン一覧からいつでも復習できます。ドリルでもミルフィが応援しますね♪'
      ], demo: { type: 'optimal-placement', piece: 'T', settings: { ...settings },
        ...demoVariant('T', 'summary-route', summaryTarget.actions, settings) },
      tryIt: practice('T', [summaryTarget], settings), next: 'drill' }
    ]);
  }
  const LESSONS = createLessons();

  return Object.freeze({ name: 'ミルフィ', EXPRESSIONS, EXPRESSION_LABELS, MASCOT_CSS, mascotSVG,
    HAIR_SKINS, DEFAULT_HAIR_SKIN, HAIR_SKIN_LABELS, normalizeHairSkin,
    DIALOGUE, PRAISE_LINES, STREAK_LINES, PIECE_PRAISE, MISS_LINES, ENCOURAGEMENT_LINES,
    WELCOME_LINES, TIPS, SPRINT_COMMENTS, hintText, sprintComment,
    LESSONS, createLessons, lessonPlacementGroups });
});
