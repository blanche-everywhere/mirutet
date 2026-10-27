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
  // Every expression keeps an open-eye layer and the same natural blink timing.
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
    return `<g data-part="front-hair" stroke="#929cc3" stroke-width="1.65">${skin === 'intake' ? `
      <defs><clipPath id="${clip}"><path d="${v.outline}"/></clipPath></defs>` : ''}
      <path d="${v.outline}" fill="${paint('hair')}"/>
      <path d="${v.strands}" fill="none" opacity=".65"${clipped}/>${skin === 'intake' ? `
      <path data-part="intake-root-shadow" d="${v.pockets}" fill="#929cc3" opacity="${v.opacity}" stroke="none"${clipped}/>` : ''}
      <path d="${v.highlights}" fill="#f5fff8" stroke="none" opacity=".82"${clipped}/>
      <path d="${v.glints}" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".75" fill="none"${clipped}/>
      <path d="M148 28 Q143 16 155 11 Q150 20 160 26" fill="${paint('hair')}" stroke-linecap="round"/>
    </g>`;
  }

  const OUTFIT_SKINS = Object.freeze(['uniform', 'cape']);
  const DEFAULT_OUTFIT_SKIN = 'uniform';
  const OUTFIT_SKIN_LABELS = Object.freeze({ uniform: '制服', cape: '黒ケープ' });
  function normalizeOutfitSkin(value) {
    return OUTFIT_SKINS.includes(value) ? value : DEFAULT_OUTFIT_SKIN;
  }
  function outfitSVG(skin, id, paint) {
    if (skin === 'cape') return `<g data-part="outfit" stroke="#595361" stroke-width="1.6">
 <defs>
 <linearGradient id="${id}-dress-black" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#41404e"/><stop offset=".55" stop-color="#252633"/><stop offset="1" stop-color="#191b27"/></linearGradient>
 <linearGradient id="${id}-cape-black" x1="0" y1="0" x2=".75" y2="1"><stop stop-color="#585160"/><stop offset=".38" stop-color="#393642"/><stop offset="1" stop-color="#242431"/></linearGradient>
 <linearGradient id="${id}-cape-lining" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a89abd"/><stop offset="1" stop-color="#6c617f"/></linearGradient>
 </defs>
 <path d="M136 213 L134 238 Q150 253 166 238 L164 213" fill="url(#${id}-skin)" stroke="#b49ab8" stroke-width="1.8"/>
 <path d="M134 227 Q150 236 166 227" stroke="#e7b8bd" fill="none" stroke-width="1.8"/>
 <path data-part="dress" d="M132 234 Q107 234 89 253 Q77 271 75 300 L73 350 H227 L225 300 Q223 271 211 253 Q193 234 168 234 Q150 249 132 234Z" fill="url(#${id}-dress-black)"/>
 <path d="M136 246 Q150 253 164 246 L168 303 Q150 310 132 303Z" fill="#484250" stroke="#75697f" stroke-width="1.2"/>
 <path d="M140 252 L137 300 M160 252 L163 300" fill="none" stroke="#eee7df" stroke-width="1.4"/>
 <path d="M132 302 Q150 309 168 302 L172 311 Q150 318 128 311Z" fill="#24232f" stroke="#b4a4c1" stroke-width="1"/>
 <path d="M132 309 Q136 314 140 311 Q145 316 150 312 Q155 316 160 311 Q164 314 168 309" fill="none" stroke="#f2eade" stroke-width="1.4"/>
 <path d="M110 295 Q104 315 105 348 M129 318 L124 349 M171 318 L176 349 M190 295 Q196 315 195 348" fill="none" stroke="#777083" stroke-width="1.3" opacity=".65"/>
 <path d="M150 269 L150 301" stroke="#81758f" fill="none"/>
 <circle cx="150" cy="277" r="2" fill="#d7c1e8" stroke="#a28caf" stroke-width=".8"/>
 <circle cx="150" cy="288" r="2" fill="#d7c1e8" stroke="#a28caf" stroke-width=".8"/>
 <circle cx="150" cy="299" r="2" fill="#d7c1e8" stroke="#a28caf" stroke-width=".8"/>
 <path d="M132 234 Q107 234 89 253 Q84 267 81 282 Q101 300 130 289 L145 252Z M168 234 Q193 234 211 253 Q216 267 219 282 Q199 300 170 289 L155 252Z" fill="url(#${id}-cape-black)"/>
 <path d="M130 289 Q138 278 145 252 L138 261 L126 287Z M170 289 Q162 278 155 252 L162 261 L174 287Z" fill="url(#${id}-cape-lining)" stroke-width=".8"/>
 <path d="M105 246 Q96 263 91 277 M119 243 Q111 259 109 277 M195 246 Q204 263 209 277 M181 243 Q189 259 191 277" fill="none" stroke="#827589" stroke-width="1.4" opacity=".55"/>
 <path d="M83 281 Q102 296 129 287 M217 281 Q198 296 171 287" fill="none" stroke="#e9e1d8" stroke-width="1.5"/>
 <path d="M83 283 Q83 290 89 288 Q89 295 95 292 Q98 299 103 294 Q107 300 111 294 Q116 299 120 292 Q125 296 129 289 M217 283 Q217 290 211 288 Q211 295 205 292 Q202 299 197 294 Q193 300 189 294 Q184 299 180 292 Q175 296 171 289" fill="none" stroke="#f3ecdf" stroke-width="1.3" stroke-linecap="round"/>
 <path d="M134 237 Q139 244 150 247 L140 255 Q131 250 127 242Z M166 237 Q161 244 150 247 L160 255 Q169 250 173 242Z" fill="#f4eee4" stroke="#c1b3c8" stroke-width="1.2"/>
 <path d="M136 243 L141 249 M164 243 L159 249" stroke="#d5c6d9" stroke-width="1"/>
 <path d="M150 255 C141 246 133 247 135 253 L136 262 Q143 262 150 257 Q157 262 164 262 L165 253 C167 247 159 246 150 255Z" fill="url(#${id}-ribbon)" stroke="#9e87b7" stroke-width="1.1"/>
 <path d="M146 258 L141 273 L150 268 L159 273 L154 258" fill="#c0a7d6" stroke="#8e79a2" stroke-width="1"/>
 <path d="M138 252 L147 256 M162 252 L153 256" stroke="#eadcf4" stroke-width="1.3" fill="none"/>
 <ellipse cx="150" cy="257" rx="3.7" ry="4.7" fill="#f3e4bd" stroke="#b99d87" stroke-width="1.1"/>
 <ellipse cx="150" cy="256" rx="1.7" ry="2.3" fill="#fff6df" stroke="none"/>
 </g>`;
    return `<g data-part="outfit" stroke="#b49ab8" stroke-width="1.8">
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
        </g>`;
  }

  function xml(text) {
    return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;',
      '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
  }
  let svgSerial = 0;

  /** Chest-up original vector art, 300 × 328. opts: width, height (positive
   * numbers), title, idPrefix, animated (default true), halo (default true),
   * hairSkin (side, center, intake; missing/unknown values use center),
   * outfitSkin (uniform, cape; missing/unknown values use uniform).
   * Each call scopes all paint/clip/title IDs, including when idPrefix repeats.
   * The uniform continues below the viewport for a natural portrait crop.
   * data-part groups keep the face, hair, and effect marks independently swappable.
   */
  function mascotSVG(expression = 'normal', opts = {}) {
    if (!EXPRESSIONS.includes(expression)) throw new RangeError('Unknown expression: ' + expression);
    const hairSkin = normalizeHairSkin(opts.hairSkin);
    const outfitSkin = normalizeOutfitSkin(opts.outfitSkin);
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
          Q${cx + 24} ${cy + (happy ? 17 : 21)} ${cx} ${cy + (happy ? 21 : 25)} Q${cx - 23} ${cy + (happy ? 17 : 21)} ${cx - 22} ${cy - 15}Z"
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
        <path d="M${cx - 14} ${cy + (happy ? 19 : 23)} Q${cx} ${cy + (happy ? 23 : 29)} ${cx + 13} ${cy + (happy ? 19 : 23)}"
          fill="none" stroke="#bb8d9e" stroke-width="1.5" stroke-linecap="round"/>
      </g>`;
    }

    const brows = happy
      ? 'M93 118 Q107 110 121 117 M179 117 Q193 110 207 118'
      : surprised ? 'M92 116 Q105 104 121 112 M179 112 Q195 104 208 116'
      : thinking ? 'M93 124 Q108 119 122 121 M179 115 Q195 111 207 119'
      : sorry ? 'M93 125 Q110 126 123 116 M177 116 Q190 126 207 125'
      : 'M93 120 Q107 113 122 119 M178 119 Q193 113 207 120';
    const mouth = happy
      ? '<path d="M137 194 Q150 199 163 194 C160 203 156 208 150 208 C144 208 140 203 137 194Z" fill="#a9607b"/><path d="M144 204 Q150 201 156 204 Q150 210 144 204Z" fill="#f9a9b8"/>'
      : surprised ? '<ellipse cx="150" cy="202" rx="7" ry="9" fill="#b66d85"/><ellipse cx="150" cy="206" rx="4" ry="3" fill="#ffc0c7"/>'
      : thinking ? '<path d="M144 201 Q149 198 155 201" fill="none" stroke="#a96d83" stroke-width="2.5" stroke-linecap="round"/>'
      : sorry ? '<path d="M141 205 Q150 197 159 205" fill="none" stroke="#a96d83" stroke-width="2.5" stroke-linecap="round"/>'
      : '<path d="M140 198 Q150 208 160 198" fill="none" stroke="#a96780" stroke-width="2.5" stroke-linecap="round"/>';

    const closedEyes = `<path d="M91 160 Q109 171 128 160 M172 160 Q191 171 209 160"
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
      aria-labelledby="${id}-title ${id}-desc" focusable="false" data-expression="${expression}" data-hair-skin="${hairSkin}" data-outfit-skin="${outfitSkin}">
      <title id="${id}-title">${xml(title)}</title>
      <desc id="${id}-desc">ミルテト学園の先輩、ミルフィ。ミントとライラックのツインテール、きらきらした瞳、ブロックの髪飾りと${outfitSkin === 'cape' ? '黒いケープの衣装' : '桃色の制服'}です。</desc>
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
          return `<clipPath id="${id}-eye-${side}"><path d="M${cx - 22} ${cy - 15} Q${cx} ${cy - ry - 12} ${cx + 22} ${cy - 14} Q${cx + 24} ${cy + (happy ? 17 : 21)} ${cx} ${cy + (happy ? 21 : 25)} Q${cx - 23} ${cy + (happy ? 17 : 21)} ${cx - 22} ${cy - 15}Z"/></clipPath>`;
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
        ${outfitSVG(outfitSkin, id, paint)}
        <g data-part="face-base">
          <ellipse cx="76" cy="168" rx="11" ry="17" fill="${paint('skin')}" stroke="#c9a3ac" stroke-width="1.5"/>
          <ellipse cx="224" cy="168" rx="11" ry="17" fill="${paint('skin')}" stroke="#c9a3ac" stroke-width="1.5"/>
          <path d="M76 117 C75 83 99 65 150 65 C201 65 225 83 224 117 L224 166 C223 195 194 226 150 233 C106 226 77 195 76 166Z" fill="${paint('skin')}" stroke="#bd9aa9" stroke-width="1.6"/>
          <path data-part="hairline-shadow" d="${HAIR_DESIGNS[hairSkin].shadow}" fill="#e7c6cb" opacity=".24"/>
        </g>
        <g class="mirufi-expression" data-expression="${expression}">
          <g data-part="eyebrows"><path d="${brows}" fill="none" stroke="#a092b3" stroke-width="2.8" stroke-linecap="round"/></g>
          <g data-part="eyes">
            <g class="mirufi-eyes-open">${eye(109, 'left')}${eye(191, 'right')}</g><g class="mirufi-eyes-closed" opacity="0">${closedEyes}</g>
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
    'できましたね！パーフェクトですっ♪',
    'ぴったり最短ですっ。きれいな操作でしたね。',
    '今の一手、わたしも見とれちゃいましたっ♪',
    'むだのない動きですっ。その感覚を覚えておきましょうね。',
    '大成功ですっ！指も道順を覚えてきましたね。',
    '目標にすっと到着ですっ。お見事ですね♪',
    'その調子ですっ。あなた、少しずつ上達していますね。',
    '最短ルート、ばっちりですっ♪ ミルフィーユでお祝いしたいですね。',
    '今の置き方、すうっとなめらかでしたね♪',
    '落ち着いた一手、パーフェクトですっ！',
    'きらっと光るフィネスですっ。次もいっしょにどうぞ♪',
    '必要な入力だけで届きましたね。すごいですっ！',
    '回数も位置も、花まるですっ♪',
    '一手ずつ考えた成果ですね。わたしもうれしいですっ。',
    'いいリズムですっ！…あ、わたしもつい揺れちゃいました。',
    '狙いどおりですっ。そのルート、もう得意ですね。',
    '学園の先輩から、花まるですっ♪',
    '最短の道を選べましたね。自信を持っていいんですよ♪'
  ]);
  const STREAK_LINES = deepFreeze({
    5: ['5連続パーフェクトですっ！いいリズムになりましたね♪'],
    10: ['10連続ですっ！花まる、いくつあっても足りませんね♪'],
    25: ['25連続パーフェクトですっ。あなたの落ち着いた操作、すてきですね。'],
    50: ['50連続ですっ！わたし、感激です♪ 少し休憩もどうぞ。']
  });
  const COMBO_LINES = deepFreeze({
    5: ['5 COMBO！あなたのリズム、わたしもうれしいですっ♪'],
    10: ['10 COMBO！あなたの一手、わたしも拍手ですっ♪'],
    20: ['20 COMBO！あなたの上達、わたしの自慢ですっ♪'],
    50: ['50 COMBO！あなたとお祝い、わたしも感激ですっ♪']
  });
  const PIECE_PRAISE = deepFreeze({
    I: ['Iミノ、すらっと到着ですっ！縦も横もお見事ですね♪', 'Iミノの長さ、上手に生かせましたね。花まるですっ！'],
    O: ['Oミノ、ころんと着地ですっ♪ 移動だけでばっちりですね。', 'Oミノの最短移動、お見事ですっ！'],
    T: ['Tミノの向きも位置も、ぴったりですっ♪', 'Tミノの回転選び、あなたはお上手ですね♪'],
    L: ['Lミノの曲がり角までぴったりですっ！', 'Lミノ、すっと収まりましたね。きれいですっ♪'],
    J: ['Jミノも最短ですっ！鏡向きの形、見分けられましたね。', 'Jミノの道順、もう安心ですね。花まるですっ♪'],
    S: ['Sミノの斜めの形も、すいっと到着ですっ♪', 'Sミノの向き選び、お見事ですっ！'],
    Z: ['Zミノも迷わず到着ですっ！すてきですね♪', 'Zミノの最短ルート、あなたの指が覚えてきましたね♪']
  });
  const MISS_LINES = Object.freeze([
    '…そこ、目標と違う。輪郭を見て。ゆっくりでいいから。',
    '…置き場所が違う。同じ目標でもう一度。',
    '…目標と合ってない。まず向き、次に列を確認して。',
    '…輪郭とずれてる。着地の影を重ねてから落として。',
    '…そこじゃない。落とす前に、ひと呼吸。',
    '…目標と違う。そこまでの道順、見直して。'
  ]);
  const ENCOURAGEMENT_LINES = Object.freeze([
    '速さはあとからですっ。まずは正確に置いてみましょうね♪',
    'ひとつ覚えたら、それだけで前進ですっ！',
    '迷ったらヒントをどうぞ。わたしも道にはよく迷うんです…えへへ。',
    'むずかしい列も、同じ目標を繰り返すと慣れますよ。いっしょにどうぞ♪',
    '指が疲れたら休憩ですっ。練習はいつでも再開できますよ。',
    '昨日よりひとつ気づけたら、大成功ですっ♪'
  ]);
  const WELCOME_LINES = Object.freeze([
    'ミルテト学園へようこそ！あなたの先輩、ミルフィですっ♪',
    'はじめまして、ミルフィですっ。わたしと最短の操作を覚えましょうね♪',
    'おかえりなさい♪ ミルフィーユは…あ、先に練習でしたねっ。',
    '準備はいいですか？レッスンもドリルも、あなたの好きなところからどうぞ♪'
  ]);
  const TIPS = Object.freeze([
    'フィネスは、目標の向きと列へ最少の入力で運ぶ練習ですっ。速押しより道順が大切ですよ。',
    '壁まではDASが便利ですっ。方向キーの長押しは、移動が続いても1入力ですよ。',
    'DASは連続移動までの待ち時間ですっ。設定であなたに合う長さを探しましょうね。',
    'ARRはDAS後の移動間隔ですっ。ARRが0なら、チャージ後は壁まで一気に進みますよ。',
    '壁の一つ手前なら、壁までDASして逆方向へ1回戻すルートも見てみましょうね♪',
    '中央の近くは、短いタップだけで届くこともあるんですっ。目標までの距離を見ましょう。',
    'CWとCCWを使い分ければ、3回の回転が1回に。入力の遠回りは減らしたいんですっ。',
    'CWは右回転、CCWは左回転ですっ。両方のキーを無理なく押せる位置にしましょうね。',
    '180°回転が有効なら、T・J・Lの上下反転は1回転入力でできるんですっ。',
    '180°回転をオフにすると最短手順も変わるんですっ。今の設定のヒントを見てくださいね。',
    'SRSは回転の仕組みですっ。壁に当たると、補正で少し位置がずれることもありますよ。',
    'Iミノの回転補正はほかのミノと別なんですっ。縦向きの列を着地の影で確かめましょうね。',
    'Oミノは回しても置く形が変わりません。このドリルは移動だけで大丈夫ですっ。',
    'I・S・Zミノの着地の形は縦と横の2種類ですっ。同じ着地になる回転状態もありますよ。',
    'LとJは鏡向きですっ。出現時の上の1マスが、どちら側にあるか見ましょうね。',
    'SとZは出現時の斜めの向きが逆ですっ。色と形をいっしょに覚えると安心ですよ。',
    'IRSは出現時の先行回転ですっ。ARE中から回転キーを押して、出現の瞬間まで長押しですよ。',
    'IRSの回転も1入力ですっ。先に押せば、出現してすぐ移動に取りかかれますよ。',
    'IRSで回転キーを複数押すと、最後に押している回転キーが優先なんですっ。',
    'AREは次のミノが出るまでの待ち時間ですっ。IRSの練習なら、少し長めにしてみましょうね。',
    'ARE中はNextと次の目標を見ましょうね。出現前に向きと列を決めると安心ですっ。',
    '方向キーを押したままなら、ARE中もDASのチャージは続くんですっ。次の目標も見てくださいね。',
    'IHSは出現時の先行ホールドですっ。設定で有効にして、ARE中にホールドを押してみましょうね。',
    'ホールドはフィネス入力に数えません。このドリルではスキップ扱いで、目標も変わるんですっ。',
    '1種類だけの練習はホールドが使えないんですっ。そのミノの道順に集中しましょうね。',
    'ハードドロップはフィネスの入力回数に数えません。向きと位置が合ったら、すとんですっ♪',
    '空の盤面の最短手順にソフトドロップは不要ですっ。押すたび1入力増えるので、気をつけてくださいね。',
    '壁に向かって余分に押しても1入力なんですっ。届いたらキーを離す習慣をつけましょうね。',
    'DCDは回転や出現のあと、自動横移動を少し待たせる設定ですっ。意図しない移動の調整にどうぞ。',
    'SDFはソフトドロップの速さですっ。瞬間落下でも固定はしません。確定はハードドロップですよ。',
    '左右同時押しは、あとから押した方向が優先ですっ。離したあとの動きにも気をつけましょうね。',
    'ヒントの列番号は、ミノのいちばん左のマスですっ。盤面の左端を1列目と数えてくださいね。',
    'ミスは目標との位置違い、フィネスフォルトは入力の使いすぎですっ。分けて振り返りましょうね。',
    '同じ最短回数の道順は複数あるんですっ。ヒントと順序が違っても、回数と着地が合えばパーフェクトですよ。',
    'PPSは1秒あたりに置いたミノの数ですっ。まず正確に、慣れたら少しずつ上げましょうね。',
    'キー配置は変えられるんですっ。回転と移動を両手に分けるなど、あなたの楽な押し方を試しましょうね。'
  ]);
  const SPRINT_COMMENTS = deepFreeze({
    // Accuracy uses the engine's percent scale, 0..100; PPS is pieces/second.
    accuracy: [
      { min: 100, expression: 'happy', text: '全問パーフェクトですっ！あなたの丁寧な積み重ね、実りましたね♪' },
      { min: 95, expression: 'happy', text: 'とても高い正確さですっ！全問パーフェクトまで、あと少しですね♪' },
      { min: 80, expression: 'surprised', text: '最短の操作が身についてきましたね。苦手な列はドリルで復習ですっ。' },
      { min: 0, expression: 'normal', text: '最後までおつかれさまですっ。ヒントを見ながら、ひとつずつ最短ルートを覚えましょうね。' }
    ],
    pps: [
      { min: 2, text: 'すいすい進めましたねっ！手を休める時間も大切ですよ。' },
      { min: 1, text: 'いいテンポですっ♪ このリズムで、正確さも磨いていきましょうね。' },
      { min: 0, text: 'じっくり取り組めて花まるですっ♪ 慣れるほど速さもついてきますよ。' }
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
    const route = optimal === 0 ? '移動も回転もいらない。ハードドロップだけ。'
      : `${optimalSeqLabels.join(' → ')}。最後はハードドロップ。`;
    const extra = Math.max(0, used - optimal);
    return `…${piece}ミノ、今の${used}回。最短は${optimal}回。${extra ? `${extra}回多い。遠回りしないで。` : '道順を確認して。'}\n${route}`;
  }
  function sprintComment(accuracy, pps) {
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100 || !Number.isFinite(pps) || pps < 0) {
      throw new RangeError('Accuracy must be 0..100 and PPS must be nonnegative');
    }
    return SPRINT_COMMENTS.accuracy.find(tier => accuracy >= tier.min).text +
      ' ' + SPRINT_COMMENTS.pps.find(tier => pps >= tier.min).text;
  }
  const DIALOGUE = deepFreeze({ welcome: WELCOME_LINES, praise: PRAISE_LINES, streak: STREAK_LINES, combo: COMBO_LINES,
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
    I: ['Iミノは4マスのまっすぐな形ですっ。縦と横の置き方を覚えましょうね♪',
      '着地の形は2種類ですっ。0と2、RとLは同じ着地の形ですが、回転後の列は確かめてくださいね。',
      'Iミノの回転補正は専用なんですっ。横移動と回転の順番も、表の実演で見ましょうね♪'],
    O: ['Oミノは2×2の四角ですっ。回しても、置く形と位置は変わりませんよ。',
      '最短の置き方に回転は不要ですっ。移動だけの9か所を、表で見てみましょうね。',
      '壁までころん、ひとつ戻ってころんですっ♪ OミノでDASの感覚を覚えましょうね。'],
    T: ['Tミノは上に1マス出た形ですっ。4つの向きと列をセットで覚えましょうね。',
      '右向きはCW、左向きはCCWが候補ですっ。下向きは、設定で有効なら180°回転1回でも作れますよ。',
      '向きを先に決めると、移動中も迷いにくいんですっ♪'],
    L: ['Lミノは出現時の右上に1マスある形ですっ。4つの向きを見てみましょうね。',
      '横向きと縦向きでは幅が変わるんですっ。目標のいちばん左のマスを確かめてくださいね。',
      '長い辺と短い辺を見分けると安心ですっ♪ 表の回転方向を試しましょうね。'],
    J: ['Jミノは出現時の左上に1マスある形ですっ。Lミノとは鏡向きですね。',
      '同じ列でも、Lミノと同じ回転で届くとは限らないんですっ。Jミノの表を確かめましょうね。',
      '左上の小さな角が目印ですっ。向きを覚えやすくなりますよ♪'],
    S: ['Sミノは右上がりの階段みたいな形ですっ。横と縦の2種類を練習しましょうね。',
      '0と2、RとLは同じ着地の形ですっ。180°回転で形を変える必要はありませんよ。',
      'CWとCCWは同じ縦の形でも列が変わるんですっ。最短の道順は表で見ましょうね♪'],
    Z: ['Zミノは左上がりの階段みたいな形ですっ。Sミノとは斜めの向きが逆ですよ。',
      '着地の形は横と縦の2種類ですっ。同じ形になる回転状態も、最短回数をまとめて調べていますよ。',
      '赤い階段の向きを見てから、回転と移動を選ぶと安心ですっ♪']
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
        '表は最短の手順ごとですっ。列はミノのいちばん左のマスを、左端から1、2と数えてくださいね。',
        '3つの実演を見たら、同じミノの目標に挑戦ですっ！ヒントを見ながらで大丈夫ですよ♪'],
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
        'あなたの先輩、ミルフィですっ。フィネスは、目標の場所へ最少のキー入力でミノを運ぶことですよ。',
        '道順が短いと素早く置きやすく、押し間違いも減るんですっ。まずは正確に試しましょうね。',
        '左右のタップ、壁までの長押し、回転はそれぞれ1入力ですっ。ソフトドロップも押すたび1入力ですよ。',
        'ハードドロップは回数に数えません。ホールドも数えませんが、このドリルではスキップ扱いで目標が変わるんですっ。',
        '出現位置の真下が目標なら、移動と回転は0回ですっ。そのまま落としてみましょうね♪'
      ], demo: { type: 'optimal-placement', piece: 'O', settings: { ...settings },
        ...demoVariant('O', 'zero-input', [], settings) },
      tryIt: practice('O', [ihsTarget], settings) },
      { id: 'das', title: 'なぜ壁までDAS？', expression: 'thinking', lines: [
        'Oミノを左端へ運びますね。左を4回なら4入力、壁まで長押しするDASなら1入力ですっ。',
        'DASは、押してから連続移動が始まるまでの待ち時間ですっ。長押し中の移動はまとめて1入力ですよ。',
        'ARRはその後の移動間隔ですっ。ARRが0なら、DASがたまると壁まで一気に進みますよ。',
        'DASとARRは設定で調整できますよ。待ってからすべる感覚、わたしと確認ですっ♪'
      ], demo: { type: 'compare-sequences', piece: 'O', settings: { ...settings, das: 110, arr: 0 },
        targets: [dasTarget], variants: [demoVariant('O', 'four-taps', ['left', 'left', 'left', 'left'], settings),
          demoVariant('O', 'one-das', ['dasLeft'], settings)], settingsLink: 'handling' },
      tryIt: practice('O', [dasTarget], { ...settings, das: 110, arr: 0 }) },
      { id: 'rotation', title: '回転の基本（SRS・CW・CCW・180°）', expression: 'normal', lines: [
        'CWは右へ90°、CCWは左へ90°ですっ。両方使うと、回転の遠回りを減らせますよ。',
        settings.allow180 ? '180°回転がオンなら、半回転も1入力ですっ。Tミノを下向きにするときに試しましょうね。'
          : '今は180°回転がオフですっ。半回転には90°回転を2回。オンにすると最短手順も変わりますよ。',
        'このゲームの回転はSRSですっ。壁や床にぶつかると、決まった順で位置を補正して回転を試しますよ。',
        'Iミノの補正は専用で、Oミノは回しても置く形が変わりません。形と着地の影で確認ですっ。'
      ], demo: { type: 'rotation-basics', piece: 'T', settings: { ...settings }, variants: rotationVariants,
        targets: rotationVariants.map(variant => variant.target), rotationSystem: 'SRS', kickSource: 'engine' },
      tryIt: practice('T', rotationVariants.map(variant => variant.target), settings) },
      { id: 'irs-ihs', title: 'IRS・IHSとARE', expression: 'surprised', lines: [
        'IRSは出現時の先行回転ですっ。次のミノが出る瞬間に回転キーを押し続けていれば、回転した状態で出てきますよ♪',
        'AREは次のミノが出るまでの待ち時間ですっ。この間に回転キーを押して、出現の瞬間まで長押ししましょうね。',
        'IRSの回転も新しいミノの1入力ですっ。通常と同じSRS補正で、回転できなければ元の向きで出現します。回転キーが複数なら最後に押したものが優先ですよ。',
        'IHSは出現時の先行ホールドですっ。オンなら、ARE中にホールドを押すか、出現時まで長押しすると交換できますよ。',
        'ホールドは1個につき固定まで1回ですっ。ドリルではスキップ扱いで目標も変わり、1種類だけの練習では使えませんよ。',
        'IRSは初期オン、IHSは初期オフ、AREは初期80msですっ。練習ではAREを少し長くすると、押すタイミングをつかみやすいですよ♪'
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
        'レッスン修了ですっ！まず向きと列を決めて、回転・タップ・DASの最短ルートを選びましょうね。',
        'ハードドロップは入力回数に含みません。IRSの回転は1入力ですっ。落とす前に目標の輪郭を確かめてくださいね。',
        '同じ最短回数なら、表と別の道順でもパーフェクトですっ。むずかしい場所はヒントと再挑戦で練習しましょうね。',
        '進み具合はアプリに保存され、レッスン一覧からいつでも復習できますよ。ドリルでもわたしが応援ですっ♪'
      ], demo: { type: 'optimal-placement', piece: 'T', settings: { ...settings },
        ...demoVariant('T', 'summary-route', summaryTarget.actions, settings) },
      tryIt: practice('T', [summaryTarget], settings), next: 'drill' }
    ]);
  }
  const LESSONS = createLessons();

  return Object.freeze({ name: 'ミルフィ', EXPRESSIONS, EXPRESSION_LABELS, MASCOT_CSS, mascotSVG,
    HAIR_SKINS, DEFAULT_HAIR_SKIN, HAIR_SKIN_LABELS, normalizeHairSkin,
    OUTFIT_SKINS, DEFAULT_OUTFIT_SKIN, OUTFIT_SKIN_LABELS, normalizeOutfitSkin,
    DIALOGUE, PRAISE_LINES, STREAK_LINES, COMBO_LINES, PIECE_PRAISE, MISS_LINES, ENCOURAGEMENT_LINES,
    WELCOME_LINES, TIPS, SPRINT_COMMENTS, hintText, sprintComment,
    LESSONS, createLessons, lessonPlacementGroups });
});
