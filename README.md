# 萌えテト フィネス編

テト学園のミルフィと、テトリミノを最短の操作で置く練習をするデスクトップ用アプリです。日本語UI・キーボード操作対応。オリジナルSVGイラストと合成効果音を使用します。

```sh
npm ci
npm run build
npm test
npm run test:browser
```

`index.html` または `dist/moetet-finesse.html` をブラウザで直接開いてください。CSS・スクリプト・SVGはすべてインラインです。サーバー、ネットワーク接続、Webフォントは不要です。推奨画面は1280×720以上です。

レッスンは12ステップ。実演は実際の `InputHandler` で再生し、DASの長押しやIRS/IHSの出現時操作に合わせてキーが光ります。各ミノの最短表はエンジンのソルバーから生成します。チャレンジの成績は通常の練習記録に混ぜず、達成したレッスンを保存します。

ドリルでは破線が目標、薄いミノが着地点です。ホールドはスキップ扱いで、1種類だけ選んだ練習では無効です。最短入力で置くとPerfect、余分な入力があるとフォルト、違う場所ならミスです。ゼロフォルトでは最短成功するまで同じ目標に再挑戦します。スプリントは40・100・任意の配置数に対応します。タイマーは最初の操作から開始し、一時停止時間は除きます。ベストタイムは配置数ごとに保存します（練習条件による区分はありません）。

初期キー：←→ 移動、↓ ソフト落下、Space 固定、↑/X 右回転、Z 左回転、A 半回転、左Shift/C ホールド、R 同じ目標、N 次の目標、H ヒント、Esc 一時停止、`,` 設定。設定画面ですべて変更・追加できます。重複したキーは入れ替えできます。タイトルは矢印で選択・Enterで決定。実演レッスンはEnter/Space/→で次へ、←で戻り、Escでタイトルへ戻れます。

操作設定はスライダーと数値入力を同期して即時適用します。ARR=0はDAS完了時に壁まで移動、SDF=41は固定なしの瞬間落下、重力0は落下なしです。DCDは出現・回転・ハードドロップ後の自動横移動にだけ適用されます。左右同時押しは最後に押した方向が優先され、以前の方向のDASチャージも維持します。IRSは出現時に回転キーを長押し、IHSはARE中のホールド入力を使用します。

設定・キー・進捗・通算記録は `localStorage` の `moetet-finesse.v1` に保存します。保存禁止の環境でも起動中は利用できます。設定だけJSONでコピー・貼り付けできます。不正なJSONや重複キーは適用前に検証します。音声が使用できない環境では無音で継続します。

実装は `src/engine.js`（DOMなし）、`src/mascot.js`（SVGと教材）、`src/app.js`（画面・入力・描画）、`src/style.css` に分離しています。ビルド時にマスコットの `MASCOT_CSS` をCSSへ組み込みます。内部座標はyが上向き、40行で、画面には20行と出現位置の2行を表示します。CanvasはDPR対応で、描画と入力には同じ `performance.now()` 時計を使います。OSキーリピートを無視し、一時停止やフォーカス喪失時にキーを解放します。

ソルバーは回転・タップ・DASを同じ1入力として幅優先探索します。着地セルの一致で対称形を同一視し、同点なら回転を先に選びます。空フィールドの配置数はI=17、O=9、T/J/L=34、S/Z=17。現行の空フィールド全配置では最大3入力です。180°無効も独立参照テストで検証します。スタック上の意図的な下降を必要とする潜り込みはソルバーの探索対象外です。全表は `tests/finesse-table.txt` を参照してください。

`tests/browser.check.js` はplaywright-coreと `/usr/bin/google-chrome`（headless、`--no-sandbox`）を使用します。file://で起動し、コンソールエラー・ページ例外・外部通信を検出します。レッスン実演と練習、通常キー入力、Perfect/フォルト/ミス、DAS/ARR、ライブIRS、設定保存とJSON、キー競合、一時停止、フィルター、短いスプリントと保存禁止時の動作を確認し、`screens/` に6枚のスクリーンショットを保存します。Chromeが起動できないサンドボックスでは、起動エラーを表示して失敗します。

ブラウザテスト用に `window.__moetet.getState()`、`chooseTarget(type, {rot,x}, {delay})`、`dispatch(code, down)` を公開します。`chooseTarget` のxは占有セルの左端（0始まり）です。キーは通常の `KeyboardEvent` と同じ経路を通り、デバッグ操作で結果や入力数を書き換えません。

## English

An offline, Japanese finesse trainer with original mascot ミルフィ. Run `npm run build`, then open `dist/moetet-finesse.html` directly. Everything is inlined; no server or network is required. `npm test` runs the independent engine/mascot checks. `npm run test:browser` runs system Chrome through playwright-core and saves screenshots in `screens/`. The UI includes engine-driven lessons, filtered drills, sprint, handling/key settings, persistent statistics, and synthesized audio with graceful fallbacks.
