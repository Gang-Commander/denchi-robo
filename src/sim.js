// 自己対戦ハーネス
const E = require('./engine.js');
const AI = require('./ai.js');

function playGame(optA, optB, seed, first, check) {
  const rng = E.mulberry32(seed);
  const s = E.newGame(rng, first, { log: false });
  const opts = [optA, optB].map(o => Object.assign({ rng }, o));
  let guard = 0;
  while (!E.isOver(s) && guard++ < 3000) {
    const me = s.turn;
    const a = AI.chooseAction(s, opts[me]) || { t: 'end' };
    E.apply(s, a);
    if (s.pending) {
      if (E.needsResponse(s)) E.respond(s, AI.chooseResponseFor(s, opts[1 - me]), t => AI.chooseCounterFor(t, opts[me]));
      else E.resolveBattle(s);
    }
    if (check) E.invariant(s);
  }
  return { winner: s.draw ? -1 : s.winner, turns: s.turnNo, guard };
}
// optA vs optB を n 試合（先後入れ替え）。optA の勝率を返す
function match(optA, optB, n, seed0, check) {
  let wa = 0, wb = 0, dr = 0, turns = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const r = swap ? playGame(optB, optA, seed0 + i, i % 4 < 2 ? 0 : 1, check) : playGame(optA, optB, seed0 + i, i % 4 < 2 ? 0 : 1, check);
    turns += r.turns;
    const aw = swap ? (r.winner === 1) : (r.winner === 0);
    const bw = swap ? (r.winner === 0) : (r.winner === 1);
    if (aw) wa++; else if (bw) wb++; else dr++;
  }
  return { wa, wb, dr, rate: (wa + dr / 2) / n, avgTurns: turns / n };
}
module.exports = { playGame, match };
