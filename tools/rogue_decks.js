// 勝ち抜きモードの計測・調整で使う対戦条件（回戦をランダムに選び、自分側はランダムに進めたデッキ、相手はテーマデッキ）
const E = require('../src/engine.js'), R = require('../src/run.js');
const isBasic = id => E.CARDS[id].theme === 'basic';
function playerDeck(run, r, rng) {
  const reward = () => {
    const pick = run.offer.slice().sort(() => rng() - 0.5).slice(0, Math.min(run.need, run.offer.length));
    R.takeCards(run, pick);
    const bi = run.deck.map((id, i) => isBasic(id) ? i : -1).filter(i => i >= 0);
    R.removeCard(run, bi.length ? bi[Math.floor(rng() * bi.length)] : 0);
  };
  reward();
  while (run.round < r) { R.finishBattle(run, true); reward(); }
  return run.deck.slice();
}
// seed から対戦条件を作る。戻り値 { r, decks:[自分側, 相手側], lives, theme, themes }
function setup(seed) {
  const rng = E.mulberry32(seed ^ 0x5bd1e995);
  const r = 1 + Math.floor(rng() * R.ROUNDS);
  const run = R.newRun(seed * 7919 | 0);
  const d0 = playerDeck(run, r, rng), opp = R.oppDeck(run, r), L = R.lifeFor(r);
  return { r, decks: [d0, opp.deck], lives: [L, L], theme: opp.theme, themes: run.themes };
}
module.exports = { setup, playerDeck };
