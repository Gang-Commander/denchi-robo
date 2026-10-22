// 勝ち抜きモードの条件で、評価関数の重みを自己対戦で調整する（tune.js と同じ (1+1) 進化戦略）
// 使い方: node tools/tune_rogue.js <反復> <1反復の試合数> <出力.json> <seed> [初期重み.json]
const AI = require('../src/ai.js'), E = require('../src/engine.js'), D = require('./rogue_decks.js'), fs = require('fs');
const [ITER, N, OUT, SEED, INIT] = [+process.argv[2] || 60, +process.argv[3] || 300, process.argv[4] || 'tuned_rogue.json', +process.argv[5] || 1, process.argv[6]];
let champ = Object.assign({}, AI.BASE_W, INIT ? JSON.parse(fs.readFileSync(INIT)).w : {});
const keys = Object.keys(AI.BASE_W);
const rng = E.mulberry32(SEED * 7 + 3);
const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function play(wA, wB, seed, swap) {
  // 同じ対戦条件で、A が自分側（2テーマ）と相手側（1テーマ）の両方を受け持つように swap で入れ替える
  const st = D.setup(seed), g = E.mulberry32(seed);
  const first = (seed >> 1) % 2;
  const s = E.newGame(g, first, { log: false, decks: st.decks, lives: st.lives });
  const W = swap ? [wB, wA] : [wA, wB];
  let k = 0;
  while (!E.isOver(s) && k++ < 3000) {
    const me = s.turn, a = AI.chooseAction(s, { w: W[me], rng: g }) || { t: 'end' };
    E.apply(s, a);
    if (s.pending) { if (E.needsResponse(s)) E.respond(s, AI.chooseResponseFor(s, { w: W[1 - s.turn] }), t => AI.chooseCounterFor(t, { w: W[t.turn] })); else E.resolveBattle(s); }
  }
  if (s.draw) return 0.5;
  return (s.winner === (swap ? 1 : 0)) ? 1 : 0;
}
function match(wA, wB, n, seed0) { let x = 0; for (let i = 0; i < n; i++) x += play(wA, wB, seed0 + (i >> 1), i % 2 === 1); return x / n; }
let seed = SEED * 10000000, acc = 0;
for (let it = 0; it < ITER; it++) {
  const m = Object.assign({}, champ);
  const nk = 1 + Math.floor(rng() * 3);
  for (let j = 0; j < nk; j++) { const k = keys[Math.floor(rng() * keys.length)]; const sc = Math.max(0.3, Math.abs(m[k])); m[k] = +(m[k] + gauss() * 0.35 * sc).toFixed(3); if (k !== 'heat' && k !== 'lethal' && m[k] < -1) m[k] = -1; }
  const r = match(m, champ, N, seed); seed += N;
  let ok = false;
  if (r >= 0.54) { const r2 = match(m, champ, N, seed); seed += N; if ((r + r2) / 2 >= 0.53) { champ = m; acc++; ok = true; } }
  console.log(`it${it} rate=${r.toFixed(3)}${ok ? ' accepted' : ''}`);
}
const FIN = +process.env.FINAL_N || 2000;
const fin = match(champ, AI.BASE_W, FIN, 90000000);
console.log('FINAL tuned vs base', fin);
fs.writeFileSync(OUT, JSON.stringify({ w: champ, final: { rate: fin, games: FIN }, accepted: acc, iters: ITER, gamesPer: N }, null, 1));
