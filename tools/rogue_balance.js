// 勝ち抜きモードのカード別計測（1シャード分）。結果は対戦ごとの生データで保存し、rogue_report.js で集計する
// 使い方: node tools/rogue_balance.js <seed> <対戦数> <出力.json>   環境変数 TUNED=重みファイル（省略時は「ふつう」の重み）
// 各対戦：回戦 r を1〜5から一様に選び、自分側はランダムに報酬を取って r 回戦まで進めたデッキ、相手は oppDeck(run, r)。両者同じCPU。
const E = require('../src/engine.js'), AI = require('../src/ai.js'), R = require('../src/run.js'), fs = require('fs');
// VARIANT=試案ファイル（CARDS を書き換える関数を export）で、変更前に効果を測れる
if (process.env.VARIANT) require(require('path').resolve(process.env.VARIANT))(E);
const W = process.env.TUNED ? JSON.parse(fs.readFileSync(process.env.TUNED)).w : AI.BASE_W;
const [seed0, N, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const isBasic = id => E.CARDS[E.baseId(id)].theme === 'basic';
function playerDeck(run, r, rng) {
  // ランをランダムに進める（候補からランダムに取り、基本カードからランダムに抜く）
  const step = () => {
    // 手順を機械的にこなす（報酬はランダム、抜くのは基本カードからランダム、イベントはスキップ）
    let k = 0;
    while (run.phase !== 'battle' && k++ < 20) {
      const st = run.step;
      if (run.phase === 'reward') R.takeCards(run, st.offer.slice().sort(() => rng() - 0.5).slice(0, Math.min(st.need, st.offer.length)));
      else if (run.phase === 'remove') { const bi = run.deck.map((id, i) => isBasic(id) ? i : -1).filter(i => i >= 0); R.removeCard(run, bi.length ? bi[Math.floor(rng() * bi.length)] : 0); }
      else if (run.phase === 'event') R.chooseEvent(run, false);
      else throw new Error('unexpected phase ' + run.phase);
    }
  };
  step();
  while (run.round < r) { R.finishBattle(run, true); step(); }
  return run.deck.slice();
}
const recs = [];
for (let g = 0; g < N; g++) {
  const rng = E.mulberry32(seed0 + g);
  const r = 1 + Math.floor(rng() * R.ROUNDS);
  const run = R.newRun((seed0 + g) * 7919 | 0);
  const deck0 = playerDeck(run, r, rng), opp = R.oppDeck(run, r), L = R.lifeFor(r);
  const first = rng() < 0.5 ? 0 : 1;
  const s = E.newGame(rng, first, { log: false, decks: [deck0, opp.deck], lives: [L, L] });
  const opt = { w: W, rng };
  const idOf = {}; for (const p of s.players) for (const c of p.deck.concat(p.hand)) idOf[c.uid] = c.id;
  const used = [new Set(), new Set()];
  let guard = 0;
  while (!E.isOver(s) && guard++ < 3000) {
    const me = s.turn, a = AI.chooseAction(s, opt) || { t: 'end' };
    if ((a.t === 'play' || a.t === 'set') && idOf[a.uid]) used[me].add(idOf[a.uid]);
    if (a.t === 'release') { const f = E.findRobo(s, a.src); if (f) used[me].add(f.y.id); }
    E.apply(s, a);
    if (s.pending) {
      if (E.needsResponse(s)) { const di = 1 - s.turn, c = s.players[di].set; const resp = AI.chooseResponseFor(s, opt); if (resp && resp.ch !== undefined && c) used[di].add(c.id); E.respond(s, resp, t => { const c = t.players[t.turn].set, r = AI.chooseCounterFor(t, opt); if (r && c) used[t.turn].add(c.id); return r; }); }
      else E.resolveBattle(s);
    }
  }
  const w = s.draw ? 0.5 : s.winner === 0 ? 1 : 0;
  const sides = [0, 1].map(pi => {
    const left = {}; for (const c of s.players[pi].deck) left[c.id] = (left[c.id] || 0) + 1;
    const total = {}; for (const id of (pi ? opp.deck : deck0)) total[id] = (total[id] || 0) + 1;
    // drawn＝少なくとも1枚は山札から出た
    return { deck: Object.keys(total), drawn: Object.keys(total).filter(id => (left[id] || 0) < total[id]), used: [...used[pi]] };
  });
  recs.push({ r, first, w, turns: s.turnNo, theme: opp.theme, themes: run.themes, sides });
}
fs.writeFileSync(out, JSON.stringify(recs));
