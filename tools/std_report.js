// balance.js（スタンダード）の結果を集計：カードごとの引き差・使用率
// 使い方: node tools/std_report.js a.json b.json ...
const fs = require('fs'), E = require('../src/engine.js');
const fs2 = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f)));
const tot = { games: 0, firstWins: 0, turns: 0 }, st = {};
for (const r of fs2) { tot.games += r.games; tot.firstWins += r.firstWins; tot.turns += r.turns; for (const [id, x] of Object.entries(r.st)) { const t = st[id] = st[id] || {}; for (const k in x) t[k] = (t[k] || 0) + x[k]; } }
console.log(`対戦 ${tot.games}  先攻勝率 ${(100 * tot.firstWins / tot.games).toFixed(1)}%  平均 ${(tot.turns / tot.games).toFixed(1)}手番`);
const rows = Object.entries(st).map(([id, x]) => ({ id, iwd: 100 * (x.drawnWin / x.drawn - x.notDrawnWin / x.notDrawn), use: 100 * x.played / x.drawn })).sort((a, b) => b.iwd - a.iwd);
for (const r of rows) console.log(`${(E.CARDS[r.id] ? E.CARDS[r.id].name : r.id).padEnd(8, '　')} 引き差 ${(r.iwd >= 0 ? '+' : '') + r.iwd.toFixed(1)}  使用率 ${r.use.toFixed(0)}%`);
