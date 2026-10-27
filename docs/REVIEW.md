# PASS 3 — 実装レビューと修正

対象：`SPEC.md` 全95行と PASS 3 の追加要件。`src/engine.js`、`src/mascot.js`、`src/app.js`、`src/style.css`、`build.js` を全行確認し、既存の独立参照テストも確認した。行番号はこのレビュー後のソースを指す。

判定の **PASS** はコード監査・実装・該当するNodeテストの合格を示す。画面寸法、フォーカス、実キーのブラウザ検証は **Chrome待ち** と明記する。このサンドボックスではChromeを実行しておらず、新しいスクリーンショットの撮影やブラウザ合格は主張しない。supervisor は `npm run test:browser` で検証する。設定項目と長い教材はパネル内でスクロールできるが、指定4画面の文書全体はスクロールさせない構成とした。

## 発見したFAILと修正

| ID | 修正前 | 不具合／弱点と修正 | 修正後の根拠 |
|---|---|---|---|
| R1 | FAIL | レッスンの盤面・列番号・実演キー・説明・結果の合計高を確保していなかった。残り高を実測してセルを拡縮し、説明の折り返しも再計算。 | PASS / Chrome待ち：[app.js:484](../src/app.js#L484)、[style.css:1714](../src/style.css#L1714)、[browser.check.js:67](../tests/browser.check.js#L67) |
| R2 | FAIL | 補助文字に8–12px、吹き出しに12–13pxが多数あった。補助文字13px以上、説明14px、吹き出し15pxに変更。720pの間隔と列幅を調整し、1080pでは盤面とマスコットを拡大。 | PASS / Chrome待ち：[style.css:1688](../src/style.css#L1688)、[style.css:1741](../src/style.css#L1741)、[browser.check.js:81](../tests/browser.check.js#L81) |
| R3 | FAIL | 設定画面全体が長く、文書スクロールが必要だった。見出しと戻るボタンを残し、フォーカス可能な設定項目パネル内をスクロールさせる。 | PASS / Chrome待ち：[app.js:181](../src/app.js#L181)、[style.css:1732](../src/style.css#L1732) |
| R4 | FAIL | キー捕捉がTab/Enter/Spaceまで横取りし、競合の入れ替え・キャンセルをキーボードで決定できなかった。入力待ちとボタン操作を分け、モーダル内のTab循環・矢印選択・ネイティブ決定を追加。Esc/Tabの割当ボタンも用意。 | PASS / Chrome待ち：[app.js:575](../src/app.js#L575)、[app.js:684](../src/app.js#L684)、[browser.check.js:211](../tests/browser.check.js#L211) |
| R5 | FAIL | レッスンのEnter/Spaceショートカットがボタン操作を奪い、プレイ中もSpaceがボタンの決定より優先された。盤面フォーカスとUI操作を区別。盤面をTabで往復できるようにし、再描画・フィルター変更・キー捕捉後もフォーカスを復元。 | PASS / Chrome待ち：[app.js:195](../src/app.js#L195)、[app.js:280](../src/app.js#L280)、[app.js:694](../src/app.js#L694) |
| R6 | FAIL | レッスンの練習中にblurすると停止するが、再開用UIがなかった。練習にも再開・設定・終了のモーダルを表示。完了済みの練習には表示しない。教材のスキップで別の問題を解いて達成扱いになる経路も閉じた。 | PASS / Chrome待ち：[app.js:304](../src/app.js#L304)、[app.js:735](../src/app.js#L735)、[app.js:761](../src/app.js#L761) |
| R7 | FAIL | 逐次keyUpで古いDAS方向が一瞬再開しうる。AREで押して離したIHSの予約も、pause/blur後に残った。`releaseAll`で全キーとIHS予約を一括解除。 | PASS：[engine.js:649](../src/engine.js#L649)、[app.js:225](../src/app.js#L225)、[review.regression.test.js:13](../tests/review.regression.test.js#L13) |
| R8 | FAIL | DCDを変更しても、進行中のDCD期限が以前の設定のままだった。最後の出現・回転・固定時刻を保存し、新しいDCDから期限を再計算。pause時間も補正。 | PASS：[engine.js:486](../src/engine.js#L486)、[engine.js:655](../src/engine.js#L655)、[review.regression.test.js:26](../tests/review.regression.test.js#L26) |
| R9 | FAIL | onSpawnで停止した場合にも、出現処理の後半が方向キーの移動を実行しうる。pause状態を再確認してから出現時の移動を実行。 | PASS：[engine.js:538](../src/engine.js#L538)、[review.regression.test.js:37](../tests/review.regression.test.js#L37) |
| R10 | FAIL | 通信はなくても、ソースコメントの参考URLが配布HTMLに残っていた。参考URLを本書へ移し、ビルド・Node・ChromeスクリプトでURLとローカル依存ファイルを検査。 | PASS：[build.js:10](../build.js#L10)、[review.regression.test.js:72](../tests/review.regression.test.js#L72)、[browser.check.js:11](../tests/browser.check.js#L11) |
| R11 | FAIL | 設定の数値欄・JSON欄からEscで戻れず、Escリピートで画面が連続遷移しうる。入力欄からもEscを処理し、画面遷移ではrepeatを無視。明示的なEscのゲーム割当は盤面上で尊重する。 | PASS / Chrome待ち：[app.js:703](../src/app.js#L703)、[browser.check.js:231](../tests/browser.check.js#L231) |

rAFは従来から画面ごとの生成ではなく1本で、画面切替によるループ増殖は見つからなかった。追加の保守として、予約IDによる重複防止とpagehide時のキャンセル／pageshow時の再開を加えた（[app.js:770](../src/app.js#L770)）。ソルバーキャッシュは32件、診断履歴は150件、粒子は寿命で破棄、音源ノードは終了時に切断する。既存のSRS表、出現座標、7-bag、BFSの最短判定にFAILは見つからなかった。

## 要件チェックリスト

| 要件 | 判定 | ファイル・行の根拠／検証 |
|---|---|---|
| 指定ファイル構成、DOMなしengine、classic scriptとCommonJS | PASS | [engine.js:9](../src/engine.js#L9)、[mascot.js:5](../src/mascot.js#L5)、[engine.srs.test.js:9](../tests/engine.srs.test.js#L9) |
| file://、単一HTML、依存なしビルド、indexとdistが同一 | PASS | [build.js:23](../build.js#L23)、[index.template.html:1](../src/index.template.html#L1)、[review.regression.test.js:80](../tests/review.regression.test.js#L80) |
| 外部URL・CDN・フォント・ローカルsrc/hrefなし | PASS | [build.js:10](../build.js#L10)、[mascot.js:126](../src/mascot.js#L126)（SVG名前空間のみ）、[browser.check.js:11](../tests/browser.check.js#L11) |
| 正式タイトル、日本語の操作説明・設定・結果、オリジナル素材 | PASS | [app.js:143](../src/app.js#L143)、[app.js:313](../src/app.js#L313)、[mascot.js:126](../src/mascot.js#L126)。装飾に英語の併記、操作略語にCW等を使用 |
| 10列40行、y上向き、20行可視＋出現2行 | PASS | [engine.js:17](../src/engine.js#L17)、[engine.js:129](../src/engine.js#L129)、[app.js:525](../src/app.js#L525) |
| 行21–22、I列4–7、O列5–6、JLSTZ列4–6、中央／flat side down | PASS | [engine.js:43](../src/engine.js#L43)、[engine.js:165](../src/engine.js#L165)、[engine.srs.test.js:18](../tests/engine.srs.test.js#L18)。曖昧な一般表現よりSPECの各ピースの明示座標を採用 |
| spawnDropオプション、ドリル初期OFF、IRS後の1行下降 | PASS | [engine.js:165](../src/engine.js#L165)、[engine.js:334](../src/engine.js#L334)、[engine.js:535](../src/engine.js#L535)、[engine.input.test.js:287](../tests/engine.input.test.js#L287) |
| SRS全90度キック、I専用表、O形不変、0/R/2/L | PASS | [engine.js:19](../src/engine.js#L19)、[engine.js:58](../src/engine.js#L58)、[engine.js:71](../src/engine.js#L71)、[engine.srs.test.js:49](../tests/engine.srs.test.js#L49)、[engine.reference.js:20](../tests/engine.reference.js#L20) |
| 180初期ON、TETR.IO SRS+拡張、壁・床・阻害時キック | PASS | [engine.js:91](../src/engine.js#L91)、[engine.js:183](../src/engine.js#L183)、[engine.srs.test.js:58](../tests/engine.srs.test.js#L58)。Iは2候補、JLSTZは6候補、Oは可視no-op |
| 7色のGuideline色、艶をつけても色相を維持 | PASS | [engine.js:27](../src/engine.js#L27)、[app.js:498](../src/app.js#L498)、[engine.srs.test.js:18](../tests/engine.srs.test.js#L18) |
| 7-bag、注入可能RNG、選択ミノのフィルターバッグ | PASS | [engine.js:207](../src/engine.js#L207)、[engine.js:232](../src/engine.js#L232)、[engine.bag.test.js:6](../tests/engine.bag.test.js#L6) |
| ハードドロップ、有限／瞬間ソフトドロップ、床で自動固定しない | PASS | [engine.js:459](../src/engine.js#L459)、[engine.js:503](../src/engine.js#L503)、[engine.js:555](../src/engine.js#L555)、[engine.input.test.js:147](../tests/engine.input.test.js#L147) |
| ホールドは固定まで1回、最初はバッグから取得 | PASS | [engine.js:546](../src/engine.js#L546)、[engine.input.test.js:174](../tests/engine.input.test.js#L174) |
| IRS初期ON、ARE中を含め出現時に押下中、最新回転優先 | PASS | [engine.js:334](../src/engine.js#L334)、[engine.js:441](../src/engine.js#L441)、[engine.js:526](../src/engine.js#L526)、[engine.input.test.js:24](../tests/engine.input.test.js#L24) |
| IRSのCW/CCW/180全ピース、通常SRSキック、失敗時無回転、OFF | PASS | [engine.js:526](../src/engine.js#L526)、[engine.input.test.js:24](../tests/engine.input.test.js#L24)、[engine.input.test.js:48](../tests/engine.input.test.js#L48) |
| IRSは新ピースの1入力、二重計上なし、ソルバーも1入力 | PASS | [engine.js:449](../src/engine.js#L449)、[engine.js:528](../src/engine.js#L528)、[engine.js:302](../src/engine.js#L302)、[review.regression.test.js:46](../tests/review.regression.test.js#L46) |
| IHS初期OFF、ARE中の短押しまたは出現時押下、0フィネス入力 | PASS | [engine.js:523](../src/engine.js#L523)、[engine.js:616](../src/engine.js#L616)、[engine.input.test.js:308](../tests/engine.input.test.js#L308)、R7 |
| ARE 0–500ms初期80、Nextと次の目標が先に可視 | PASS | [engine.js:334](../src/engine.js#L334)、[engine.js:566](../src/engine.js#L566)、[engine.js:887](../src/engine.js#L887)、[engine.session.test.js:54](../tests/engine.session.test.js#L54) |
| ARE中のDASチャージ維持、出現時移動はピース毎に1入力 | PASS | [engine.js:539](../src/engine.js#L539)、[engine.js:491](../src/engine.js#L491)、[engine.input.test.js:73](../tests/engine.input.test.js#L73) |
| DAS/ARR/SDF/DCD/ARE、重力の範囲・初期値・slider＋number・即時反映・reset | PASS | [engine.js:334](../src/engine.js#L334)、[engine.js:655](../src/engine.js#L655)、[app.js:175](../src/app.js#L175)、[app.js:658](../src/app.js#L658)、R8 |
| ARR=0で壁まで、SDF=41で固定なし瞬間落下、G=0でも有限SDF | PASS | [engine.js:459](../src/engine.js#L459)、[engine.js:491](../src/engine.js#L491)、[engine.input.test.js:147](../tests/engine.input.test.js#L147) |
| performance.now統一、注入時刻、全イベント順序処理、フレーム非依存 | PASS | [engine.js:392](../src/engine.js#L392)、[engine.js:579](../src/engine.js#L579)、[app.js:12](../src/app.js#L12)、[engine.input.test.js:233](../tests/engine.input.test.js#L233)（1/16/100ms・各ARR/SDFを比較） |
| 左右後押し優先、解放すると以前のチャージへ、OSリピート無視 | PASS | [engine.js:441](../src/engine.js#L441)、[engine.js:606](../src/engine.js#L606)、[engine.js:635](../src/engine.js#L635)、[engine.input.test.js:96](../tests/engine.input.test.js#L96) |
| DCDの定義、出現・成功回転・固定後の自動横移動だけを待機 | PASS | [engine.js:392](../src/engine.js#L392)、[engine.js:486](../src/engine.js#L486)、[engine.input.test.js:135](../tests/engine.input.test.js#L135)、R8 |
| 全操作をcodeで再割当、複数キー、左右Shift区別、追加・削除・初期化 | PASS | [app.js:14](../src/app.js#L14)、[app.js:84](../src/app.js#L84)、[app.js:181](../src/app.js#L181)、[engine.js:360](../src/engine.js#L360)、R4 |
| キー競合の警告・交換、最後のキーを失わない、保存・不正import検出 | PASS | [engine.js:376](../src/engine.js#L376)、[app.js:589](../src/app.js#L589)、[app.js:31](../src/app.js#L31)、[review.regression.test.js:55](../tests/review.regression.test.js#L55) |
| 矢印・Spaceでページ移動しない、Tab/Enterで全画面操作、Escの文脈処理 | PASS / Chrome待ち | [app.js:694](../src/app.js#L694)、R4・R5・R11。ネイティブ設定欄は通常の矢印入力を維持 |
| localStorageで設定・キー・進捗・成績保存、使用不可時も動作 | PASS | [app.js:47](../src/app.js#L47)、[app.js:67](../src/app.js#L67)、[browser.check.js:331](../tests/browser.check.js#L331)（Chrome待ち） |
| BFS：x/y/rot、タップ/DAS/回転の全順序、任意盤面、hardDropセル集合で一致 | PASS | [engine.js:285](../src/engine.js#L285)、[engine.js:292](../src/engine.js#L292)、[engine.solver.test.js:16](../tests/engine.solver.test.js#L16)、[engine.solver.test.js:82](../tests/engine.solver.test.js#L82) |
| 対称形を着地セルで同一視、180設定考慮、IRS初手、回転先行で決定的 | PASS | [engine.js:302](../src/engine.js#L302)、[engine.js:328](../src/engine.js#L328)、[engine.solver.test.js:64](../tests/engine.solver.test.js#L64) |
| 独立の全配置参照検査、I17/O9/TJL34/SZ17、上下対称、全表出力 | PASS | [engine.reference.js:98](../tests/engine.reference.js#L98)、[engine.solver.test.js:9](../tests/engine.solver.test.js#L9)、[finesse-table.txt:1](../tests/finesse-table.txt#L1)。計162着地、180有効時最大3入力、無効時TJL最大4 |
| finesseFor/allPlacements API、返却値の変更でキャッシュを破壊しない | PASS | [engine.js:281](../src/engine.js#L281)、[engine.js:324](../src/engine.js#L324)、[engine.solver.test.js:101](../tests/engine.solver.test.js#L101) |
| 任意スタックの潜り込みのための意図的な下降探索（任意項目） | PASS（省略を明記） | [engine.js:285](../src/engine.js#L285)、READMEのソルバー説明。空盤面の最短表には不要 |
| 単一ミノ・空盤面、破線の目標、パルス・着地点の影 | PASS | [engine.js:821](../src/engine.js#L821)、[app.js:525](../src/app.js#L525)、[browser.check.js:154](../tests/browser.check.js#L154)（描画はChrome待ち） |
| 正解最短／フォルト／置き場所ミスを分離、ミスの反復オプション | PASS | [engine.js:829](../src/engine.js#L829)、[engine.session.test.js:67](../tests/engine.session.test.js#L67) |
| wastedタップ・失敗回転・ソフト落下も計数、DAS一連は1入力、HD/Holdは除外 | PASS | [engine.js:449](../src/engine.js#L449)、[engine.js:491](../src/engine.js#L491)、[engine.js:602](../src/engine.js#L602)、[engine.input.test.js:108](../tests/engine.input.test.js#L108) |
| 一様な目標抽選、ミノフィルター、列エリア／範囲、苦手重点 | PASS | [engine.js:799](../src/engine.js#L799)、[app.js:160](../src/app.js#L160)、[app.js:280](../src/app.js#L280)、[engine.session.test.js:151](../tests/engine.session.test.js#L151) |
| 結果の使用数／最短数、現在のキーで最短と実入力を表示、AREで連続進行 | PASS | [engine.js:829](../src/engine.js#L829)、[app.js:91](../src/app.js#L91)、[app.js:313](../src/app.js#L313) |
| ゼロフォルトで同ピース・同目標、新規出現、記録するがsprintを進めない | PASS | [engine.js:832](../src/engine.js#L832)、[engine.js:845](../src/engine.js#L845)、[engine.session.test.js:91](../tests/engine.session.test.js#L91) |
| R＋ボタンで同目標リトライ、フォルト自動反復オプション | PASS | [engine.js:850](../src/engine.js#L850)、[app.js:14](../src/app.js#L14)、[app.js:165](../src/app.js#L165) |
| 連続・最高連続・正確率・ミノ別試行／フォルト・平均入力・PPS、セッション／通算／reset | PASS | [engine.js:686](../src/engine.js#L686)、[engine.js:893](../src/engine.js#L893)、[app.js:154](../src/app.js#L154)、[app.js:183](../src/app.js#L183) |
| sprint 40/100/custom、最初の入力から計時、pause除外、正しい配置で進行 | PASS | [engine.js:798](../src/engine.js#L798)、[engine.js:839](../src/engine.js#L839)、[engine.js:890](../src/engine.js#L890)、[engine.session.test.js:176](../tests/engine.session.test.js#L176) |
| sprint結果の時間/PPS/正確率/フォルト/ミノ別内訳、ベスト保存、ミルフィ評 | PASS | [app.js:190](../src/app.js#L190)、[engine.js:841](../src/engine.js#L841)、[mascot.js:353](../src/mascot.js#L353) |
| drill hold＝skip、交換後は新目標、単一ミノ時は無効＋理由表示、IHS適用 | PASS | [engine.js:778](../src/engine.js#L778)、[engine.js:781](../src/engine.js#L781)、[app.js:165](../src/app.js#L165)、[engine.session.test.js:136](../tests/engine.session.test.js#L136) |
| pauseモーダル再開／終了／設定、blur・非表示時の入力解除、ARE凍結 | PASS | [engine.js:665](../src/engine.js#L665)、[app.js:304](../src/app.js#L304)、[app.js:761](../src/app.js#L761)、R6・R7・R9 |
| Next5個、Hold、出現2行を暗く表示、AREバーとIRSフラッシュ | PASS | [app.js:165](../src/app.js#L165)、[app.js:390](../src/app.js#L390)、[app.js:525](../src/app.js#L525)、[browser.check.js:252](../tests/browser.check.js#L252)（Chrome待ち） |
| タイトルの5入口、初回レッスン案内、矢印／Enter／Tabで移動 | PASS / Chrome待ち | [app.js:147](../src/app.js#L147)、[app.js:694](../src/app.js#L694)、R5 |
| ミルフィの名前・学園・オリジナルSVG、5表情、髪・瞳・リボン、まばたき | PASS | [mascot.js:29](../src/mascot.js#L29)、[mascot.js:35](../src/mascot.js#L35)、[mascot.js:67](../src/mascot.js#L67)、[mascot.test.js:54](../tests/mascot.test.js#L54) |
| 12レッスン：概要・DAS・SRS・IRS/IHS/ARE・I/O/T/L/J/S/Z・まとめ | PASS | [mascot.js:458](../src/mascot.js#L458)、[mascot.test.js:233](../tests/mascot.test.js#L233) |
| 実engineの実演・キー点灯、ソルバー表、各ミノ3実演／3目標、対称性説明 | PASS | [mascot.js:435](../src/mascot.js#L435)、[app.js:434](../src/app.js#L434)、[app.js:466](../src/app.js#L466)、[mascot.test.js:180](../tests/mascot.test.js#L180) |
| IRS教材はARE中の長押し、キック・1入力・IHSと設定を説明し、実演／練習 | PASS | [mascot.js:495](../src/mascot.js#L495)、[engine.js:526](../src/engine.js#L526)、[mascot.test.js:270](../tests/mascot.test.js#L270)、[app.js:352](../src/app.js#L352) |
| 進捗保存、レッスン一覧、Enter/Space/→次・←前・Escタイトル | PASS | [app.js:413](../src/app.js#L413)、[app.js:352](../src/app.js#L352)、[app.js:694](../src/app.js#L694)、R5 |
| 可愛い敬語、変化する称賛、5/10/25/50連続、ミノ別称賛、ミス・ヒント、20超tips | PASS | [mascot.js:230](../src/mascot.js#L230)、[mascot.js:287](../src/mascot.js#L287)、[mascot.js:343](../src/mascot.js#L343)、[app.js:374](../src/app.js#L374) |
| パステルUI、角丸・陰影、システム日本語フォント、DPR canvas、粒子、reduced-motion | PASS | [style.css:2](../src/style.css#L2)、[style.css:1572](../src/style.css#L1572)、[app.js:506](../src/app.js#L506)、[app.js:525](../src/app.js#L525) |
| 1280×720でタイトル・レッスン・ドリル・設定の文書に縦横はみ出しなし | PASS（実装）/ Chrome待ち | R1–R3、[style.css:1686](../src/style.css#L1686)、[browser.check.js:67](../tests/browser.check.js#L67)。overflow非表示で隠れた要素も矩形で検査 |
| 1920×1080で盤面を拡大、マスコットとパネルの余白を確保 | PASS（実装）/ Chrome待ち | [style.css:1777](../src/style.css#L1777)、[browser.check.js:169](../tests/browser.check.js#L169)（盤面高が720pの1.3倍超） |
| IRS/IHS/180/zeroFault/target/optimal/keycaps/ghost/sound/bubbles/volume、reset all | PASS | [app.js:22](../src/app.js#L22)、[app.js:181](../src/app.js#L181)、[app.js:255](../src/app.js#L255)、[app.js:634](../src/app.js#L634) |
| 音はWebAudio合成のみ、デフォルトON、非対応時に無音継続、ノード解放 | PASS | [app.js:123](../src/app.js#L123)、[browser.check.js:331](../tests/browser.check.js#L331)（Chrome待ち） |
| 設定JSON export/import、全部初期化、統計初期化、重複キー等の原子的検証 | PASS | [app.js:31](../src/app.js#L31)、[app.js:634](../src/app.js#L634)、[review.regression.test.js:55](../tests/review.regression.test.js#L55) |
| rAFの重複生成なし、画面離脱で停止、キャッシュ・履歴・粒子・音源寿命 | PASS | [app.js:770](../src/app.js#L770)、[app.js:332](../src/app.js#L332)、[app.js:123](../src/app.js#L123)、[engine.js:320](../src/engine.js#L320) |
| Node：新しい純粋ロジックと入力境界を回帰検査、既存試験を維持 | PASS | [review.regression.test.js:1](../tests/review.regression.test.js#L1)、既存6ファイル。直接実行でも計137テストを確認 |
| Chrome：file://、console/pageerror、外部通信、実キー、必要スクリーンショット | PASS（検査実装）/ Chrome待ち | [browser.check.js:1](../tests/browser.check.js#L1)。既存検査を維持し、寸法・文字サイズ・ARE/IRS・キーボード復帰を追加 |
| タイトル・通常教材・IRS教材・固定前の影・フォルト＋ヒント・設定の撮影 | PASS（撮影処理）/ Chrome待ち | [browser.check.js:114](../tests/browser.check.js#L114)、[browser.check.js:138](../tests/browser.check.js#L138)、[browser.check.js:168](../tests/browser.check.js#L168)、[browser.check.js:188](../tests/browser.check.js#L188)、[browser.check.js:230](../tests/browser.check.js#L230)。計9枚（成功・1080p・結果も含む） |
| README：日本語＋短い英語、build/test、設計・座標・入力・ソルバーの注記 | PASS | [README.md:1](../README.md#L1) |
| README Ideas / memo：影＋最適入力の既存ループ、スタック／複数ミノの「問題」モードは将来案のみ | PASS | [README.md:34](../README.md#L34)。新しいクイズ機能は実装していない |

## ルール照合資料

90度回転は [TechminoのSRS実装](https://github.com/26F-Studio/Techmino/blob/main/parts/RSlist.lua) の `local SRS` 内、JLSTZの8遷移とIの別表を照合した。180度拡張は [sfinder 180 patch の実装](https://gist.github.com/torchlight/1832786cf053daa51bf188110b764090) の `getPatternRotate180`／`SRSPlus` を座標系の差を考慮して照合した。仕様上、90度Iには標準SRSを使用し、TETR.IOの対称Iテーブルには変更していない。180度はGuideline本体ではなく追加設定である。[TETR.IO公式mechanics](https://github.com/tetrio/faq/wiki/Mechanics) にも180キックとSRSの参照先がある。これらのURLは配布HTMLに含めない。

## 実行記録とsupervisorへの引継ぎ

- `npm run build && npm test`：PASS。indexとdistを再生成。追加の純粋ロジックを含む全Nodeテストが合格。
- 全 `tests/*.test.js` の直接実行：137テスト合格、0失敗。
- `node --check src/app.js`、`node --check tests/browser.check.js`：PASS。
- Chrome：未実行（依頼どおりsupervisorが実行）。全画面のTab/Enter/Esc巡回も検査に追加。レイアウト・実キータイミング・スクリーンショットの最終判定は `npm run test:browser`。
- 本書のChrome待ちは、監査やNodeだけでは保証できない実測項目を区別したもの。既存の `screens/` の画像を今回の撮影結果として流用していない。
