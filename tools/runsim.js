// 勝ち抜きモードの通しシミュレーション：自分側もCPU（ふつう）で、報酬はランダムに取り、基本カードから抜く
// 使い方: node tools/runsim.js [ラン数]
const E = require('../src/engine.js'), AI = require('../src/ai.js'), R = require('../src/run.js');
const N = +(process.argv[2] || 40);
const T = JSON.parse(require('fs').readFileSync(__dirname + '/../src/tuned.json')).w;
const stat = Array.from({ length: R.ROUNDS }, () => ({ n: 0, w: 0, turns: 0, first: 0, firstW: 0, deckout: 0 }));
let clears = 0;
for (let i = 0; i < N; i++) {
  const run = R.newRun(1234 + i * 7919);
  const rng = E.mulberry32(99 + i);
  const reward = () => {
    const pick = run.offer.slice().sort(() => rng() - 0.5).slice(0, Math.min(run.need, run.offer.length));
    R.takeCards(run, pick);
    // 抜くのは基本カードからランダム（相手のデッキの作り方とそろえる）
    const bi = run.deck.map((id, i) => CARDS_basic(id) ? i : -1).filter(i => i >= 0);
    const idx = bi.length ? bi[Math.floor(rng() * bi.length)] : 0;
    R.removeCard(run, idx);
  };
  reward(); // ラン開始時の1枚
  while (run.phase === 'battle') {
    const r = run.round, opp = R.oppDeck(run, r), L = R.lifeFor(r);
    const first = rng() < 0.5 ? 0 : 1;
    const s = E.newGame(rng, first, { log: false, decks: [run.deck, opp.deck], lives: [L, L] });
    const oppW = r < R.HARD_FROM ? AI.BASE_W : T;
    let k = 0;
    while (!E.isOver(s) && k++ < 400) {
      const a = AI.chooseAction(s, { rng, w: s.turn === 0 ? AI.BASE_W : oppW }) || { t: 'end' };
      E.apply(s, a);
      if (s.pending) { if (E.needsResponse(s)) E.respond(s, AI.chooseResponseFor(s, { w: s.turn === 0 ? oppW : AI.BASE_W })); else E.resolveBattle(s); }
    }
    const st = stat[r - 1]; st.n++; st.turns += s.turnNo; if (first === 0) { st.first++; if (s.winner === 0) st.firstW++; }
    if (!s.players[0].deck.length || !s.players[1].deck.length) st.deckout++;
    const won = s.winner === 0;
    if (won) st.w++;
    R.finishBattle(run, won);
    if (run.phase === 'reward') reward();
  }
  if (run.phase === 'clear') clears++;
}
function CARDS_basic(id) { return E.CARDS[id].theme === 'basic'; }
stat.forEach((st, i) => console.log(`第${i + 1}戦 ${st.n}戦 勝率${(100 * st.w / Math.max(1, st.n)).toFixed(0)}% 平均${(st.turns / Math.max(1, st.n)).toFixed(1)}手番 山札切れ${st.deckout}`));
console.log(`クリア ${clears}/${N}`);
