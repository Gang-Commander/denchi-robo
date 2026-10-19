// 新カード入りのランダムデッキで、ランダム手・CPU同士を回して例外や不整合がないか調べる
const E = require('../src/engine.js'), AI = require('../src/ai.js');
const ALL = [].concat(...Object.values(E.THEMES).map(t => t.ids), E.BASIC_IDS);
const N = +(process.argv[2] || 600), AIN = +(process.argv[3] || 40);
function randDeck(rng, n) { const d = []; for (let i = 0; i < n; i++) d.push(ALL[Math.floor(rng() * ALL.length)]); return d; }
let errs = 0;
function runGame(g, useAI) {
  const rng = E.mulberry32(1000 + g);
  const s = E.newGame(rng, g % 2, { log: false, decks: [randDeck(rng, 20), randDeck(rng, 20)], lives: [15, 15] });
  let k = 0;
  while (!E.isOver(s) && k++ < 3000) {
    let a;
    if (useAI) a = AI.chooseAction(s, { rng }) || { t: 'end' };
    else { const acts = AI.mainActions(s).concat(AI.attackOptions(s)); a = (acts.length && rng() < 0.85) ? acts[Math.floor(rng() * acts.length)] : { t: 'end' }; }
    try { E.apply(s, a); } catch (e) { errs++; console.log('illegal', g, JSON.stringify(a), e.message); return; }
    if (s.pending) {
      if (E.needsResponse(s)) { const r = useAI ? AI.chooseResponseFor(s, {}) : (() => { const o = AI.chooseResponseFor(s, {}); return rng() < 0.5 ? o : null; })(); E.respond(s, r); }
      else E.resolveBattle(s);
    }
    try { E.invariant(s); } catch (e) { errs++; console.log('invariant', g, e.message, JSON.stringify(a)); return; }
  }
  if (!E.isOver(s)) { errs++; console.log('not over', g); }
  return s.turnNo;
}
let t = Date.now();
for (let g = 0; g < N; g++) runGame(g, false);
console.log(`random ${N} games, errs ${errs}, ${Date.now() - t}ms`);
t = Date.now(); let turns = 0;
for (let g = 0; g < AIN; g++) turns += runGame(g, true) || 0;
console.log(`ai ${AIN} games, errs ${errs}, avg turns ${(turns / AIN).toFixed(1)}, ${Date.now() - t}ms`);
process.exitCode = errs ? 1 : 0;
