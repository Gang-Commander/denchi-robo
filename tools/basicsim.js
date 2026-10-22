// 基本デッキ同士（＋任意の追加カード）をCPU同士で回して、膠着の度合いを測る
// 使い方: node tools/basicsim.js [試合数] [バリアント名...]
const E = require('../src/engine.js'), AI = require('../src/ai.js');
const N = +(process.argv[2] || 200);
const VARIANTS = require('./basic_variants.js');
const names = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(VARIANTS);
const snapshot = JSON.parse(JSON.stringify(E.CARDS));
function restore() { for (const k of Object.keys(E.CARDS)) { if (!snapshot[k]) delete E.CARDS[k]; } for (const k of Object.keys(snapshot)) E.CARDS[k] = JSON.parse(JSON.stringify(snapshot[k])); }
for (const name of names) {
  restore();
  const v = VARIANTS[name];
  const deck = v.setup(E.CARDS) || E.BASIC_DECK;
  let draw = 0, turns = 0, attacks = 0, direct = 0, dmg = 0, deckout = 0, firstW = 0, dec = 0;
  for (let g = 0; g < N; g++) {
    const rng = E.mulberry32(5000 + g);
    const s = E.newGame(rng, g % 2, { decks: [deck, deck], lives: [v.life || 7, v.life || 7], v: v.v });
    let k = 0;
    while (!E.isOver(s) && k++ < 600) {
      const a = AI.chooseAction(s, { rng }) || { t: 'end' };
      E.apply(s, a);
      if (s.pending) { if (E.needsResponse(s)) E.respond(s, AI.chooseResponseFor(s, {}), t => AI.chooseCounterFor(t, {})); else E.resolveBattle(s); }
    }
    if (s.draw) draw++; else { dec++; if (s.winner === g % 2) firstW++; }
    turns += s.turnNo;
    for (const e of s.log) { if (e.t === 'attack') attacks++; if (e.t === 'direct') direct++; if (e.t === 'damage') dmg += e.n; }
    if (!s.players[0].deck.length && !s.players[1].deck.length) deckout++;
  }
  const f = x => (x / N).toFixed(1);
  console.log(`${name.padEnd(10)} 引き分け${(100 * draw / N).toFixed(0).padStart(3)}%  平均${f(turns)}手番  攻撃${f(attacks)}回  直接攻撃${f(direct)}回  与ダメ${f(dmg)}  両者山札切れ${(100 * deckout / N).toFixed(0)}%  先攻勝率${dec ? (100 * firstW / dec).toFixed(0) : '-'}%  ${v.note || ''}`);
}
