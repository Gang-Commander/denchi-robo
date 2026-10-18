// 1ファイルのHTMLを組み立てる：node src/build.js [重みファイル] [出力先]
// 既定では src/tuned.json を使い、リポジトリ直下の index.html に書き出す（GitHub Pages でそのまま公開される）
const fs = require('fs'), path = require('path');
const here = f => path.join(__dirname, f);
const tf = process.argv[2] || here('tuned.json');
const out = process.argv[3] || path.join(__dirname, '..', 'index.html');
const T = JSON.parse(fs.readFileSync(tf));
let h = fs.readFileSync(here('template.html'), 'utf8');
const pct = Math.round(T.final.rate * 1000) / 10;
const note = `「つよい」CPUは、CPU同士の対戦（自己対戦）で評価関数の重みを調整したものです。調整前の「ふつう」CPUとの${T.final.wa + T.final.wb + T.final.dr}戦で<b>勝率${pct}%</b>。`;
const map = {
  '/*ENGINE*/': fs.readFileSync(here('engine.js'), 'utf8'),
  '/*AI*/': fs.readFileSync(here('ai.js'), 'utf8'),
  '/*SPRITES*/': fs.readFileSync(here('sprites.js'), 'utf8'),
  '/*TUNED*/': JSON.stringify(T.w),
  '/*APP*/': fs.readFileSync(here('app.js'), 'utf8'),
  '/*AINOTE*/': note,
};
for (const [k, v] of Object.entries(map)) { if (!h.includes(k)) throw new Error('placeholder not found: ' + k); h = h.split(k).join(v); }
// 単体のHTMLとして開いても正しく表示されるように、文書の頭（文字コード・スマホ用の表示幅）を付ける。
// これが無いとスマホのブラウザがPC幅（約980px）で描画し、互換モードにもなる。
h = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#13142a">
` + h + `
</html>
`;
fs.writeFileSync(out, h);
console.log('built', out, h.length, 'bytes, weights from', path.basename(tf));
