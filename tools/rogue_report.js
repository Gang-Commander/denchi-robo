// rogue_balance.js の結果（複数シャード）を集計して、カード別の表を出す
// 使い方: node tools/rogue_report.js a.json b.json ...
const E = require('../src/engine.js'), fs = require('fs');
const recs = [].concat(...process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f))));
// 側（0＝2テーマのデッキ、1＝1テーマのデッキ）と回戦ごとの基準勝率
const base = {};
for (const x of recs) for (const pi of [0, 1]) { const k = pi + ':' + x.r; base[k] = base[k] || { n: 0, w: 0 }; base[k].n++; base[k].w += pi ? 1 - x.w : x.w; }
const st = {};
const S = id => st[id] = st[id] || { n: 0, res: 0, win: 0, dr: 0, drW: 0, nd: 0, ndW: 0, used: 0 };
for (const x of recs) for (const pi of [0, 1]) {
  const win = pi ? 1 - x.w : x.w, b = base[pi + ':' + x.r], exp = b.w / b.n;
  const side = x.sides[pi], drawn = new Set(side.drawn), used = new Set(side.used);
  for (const id of side.deck) {
    const t = S(id); t.n++; t.win += win; t.res += win - exp;
    if (drawn.has(id)) { t.dr++; t.drW += win; if (used.has(id)) t.used++; } else { t.nd++; t.ndW += win; }
  }
}
const pct = v => (100 * v).toFixed(1);
const rows = Object.keys(st).map(id => {
  const t = st[id], c = E.CARDS[id];
  const iwd = t.dr && t.nd ? (t.drW / t.dr - t.ndW / t.nd) : NaN;
  return { id, name: c.name + (c.rare ? '★' : ''), theme: c.theme === 'basic' ? '基本' : E.THEMES[c.theme].name, n: t.n, adj: t.res / t.n, iwd, use: t.dr ? t.used / t.dr : NaN };
}).sort((a, b) => b.iwd - a.iwd);
console.log(`対戦数 ${recs.length}  平均手番 ${(recs.reduce((a, x) => a + x.turns, 0) / recs.length).toFixed(1)}  先攻勝率 ${pct(recs.filter(x => x.w !== 0.5).reduce((a, x) => a + ((x.w === 1) === (x.first === 0) ? 1 : 0), 0) / recs.filter(x => x.w !== 0.5).length)}%  引き分け ${pct(recs.filter(x => x.w === 0.5).length / recs.length)}%`);
console.log('側×回戦の基準勝率（0＝2テーマ側）: ' + Object.keys(base).sort().map(k => `${k} ${pct(base[k].w / base[k].n)}%`).join('  '));
console.log('カード            テーマ    採用数  採用補正差  引き差  使用率');
for (const r of rows) console.log(`${r.name.padEnd(10, '　')} ${r.theme.padEnd(5, '　')} ${String(r.n).padStart(5)}  ${(r.adj >= 0 ? '+' : '') + pct(r.adj)}  ${isNaN(r.iwd) ? '   -' : ((r.iwd >= 0 ? '+' : '') + pct(r.iwd)).padStart(6)}  ${isNaN(r.use) ? '-' : pct(r.use) + '%'}`);
fs.writeFileSync('/tmp/claude-0/-home-claude/a40e2465-b707-58b5-896a-3d8439074fda/scratchpad/rogue_rows.json', JSON.stringify(rows));
