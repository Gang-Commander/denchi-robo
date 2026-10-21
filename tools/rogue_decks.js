// 勝ち抜きモードの計測・調整で使う対戦条件（回戦をランダムに選び、自分側はランダムに進めたデッキ、相手はテーマデッキ）
const E = require('../src/engine.js'), R = require('../src/run.js');
const isBasic = id => E.CARDS[E.baseId(id)].theme === 'basic';
function playerDeck(run, r, rng) {
  const step = () => {
    // 手順を機械的にこなす（報酬はランダム、抜くのは基本カードからランダム、イベントはスキップ）
    let k = 0;
    while (run.phase !== 'battle' && k++ < 20) {
      const st = run.step;
      if (run.phase === 'reward') R.takeCards(run, st.offer.slice().sort(() => rng() - 0.5).slice(0, Math.min(st.need, st.offer.length)));
      else if (run.phase === 'remove') { const bi = run.deck.map((id, i) => isBasic(id) ? i : -1).filter(i => i >= 0); R.removeCard(run, bi.length ? bi[Math.floor(rng() * bi.length)] : 0); }
      else if (run.phase === 'event') R.chooseEvent(run, null);
      else throw new Error('unexpected phase ' + run.phase);
    }
  };
  step();
  while (run.round < r) { R.finishBattle(run, true); step(); }
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
