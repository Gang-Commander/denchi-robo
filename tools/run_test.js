// 勝ち抜きモードの進行テスト：全イベントを1回ずつ通す＋ランダムに100ラン進める
const E = require('../src/engine.js'), R = require('../src/run.js');
let fails = 0, n = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('NG:', m); } };
// 手順を機械的にこなす（ランダム）
function auto(run, rng, evPick) {
  let k = 0;
  while (!['battle', 'over', 'clear'].includes(run.phase) && k++ < 50) {
    const st = run.step;
    if (run.phase === 'reward') R.takeCards(run, st.offer.slice(0, Math.min(st.need, st.offer.length)));
    else if (run.phase === 'remove') { let i = run.deck.findIndex(e => !st.noBasic || E.CARDS[E.baseId(e)].theme !== 'basic'); R.removeCard(run, i < 0 ? 0 : i); }
    else if (run.phase === 'event') R.chooseEvent(run, evPick ? evPick() : rng() < 0.7);
    else if (run.phase === 'copy') { const i = run.deck.findIndex(e => !st.themeOnly || E.CARDS[E.baseId(e)].theme !== 'basic'); R.copyCard(run, i); }
    else if (run.phase === 'mod') { const i = run.deck.findIndex(e => E.CARDS[E.baseId(e)].kind === 'robo' && !e.includes('@') && (st.mods[0] !== 'e' || !E.CARDS[E.baseId(e)].enterBat)); R.modCard(run, i, st.mods[0]); }
    else if (run.phase === 'branch') R.chooseBranch(run, st.options[1]);
  }
}
// 1) 各イベントを強制的に選ぶ
for (const id of Object.keys(R.EVENTS)) {
  const run = R.newRun(42); const rng = E.mulberry32(1);
  auto(run, rng);
  R.finishBattle(run, true);
  auto(run, rng, () => false); // いったん通常の流れ（イベントは通り過ぎる）
  if (!R.eventOk(run, id)) { console.log('skip (not ok now):', id); continue; }
  const before = JSON.stringify([run.deck, run.parts, run.next, run.lifeMod, run.oppThemes]);
  R.applyEvent(run, id); if (run.queue.length) R.advance(run); auto(run, rng);
  const after = JSON.stringify([run.deck, run.parts, run.next, run.lifeMod, run.oppThemes]);
  ok(run.phase === 'battle', id + ' ends in battle phase');
  ok(before !== after || id === 'scout', id + ' changed something');
  const b = R.battleSetup(run);
  const s = E.newGame(E.mulberry32(3), 0, { log: false, decks: b.decks, lives: b.lives, perks: b.perks, batPlus: b.batPlus }); E.invariant(s);
}
// 2) エリート戦の追加報酬・ハンデ戦のライフ
{ const run = R.newRun(7), rng = E.mulberry32(2); auto(run, rng); run.next.elite = true; run.next.handicap = true;
  const b = R.battleSetup(run); ok(b.lives[0] === Math.ceil(R.lifeFor(1) / 2) && b.decks[1].length === b.decks[0].length + 2 && b.cpu === 'normal', 'elite/handicap setup');
  R.finishBattle(run, true); let rewards = 0; let k = 0;
  while (run.phase !== 'battle' && k++ < 20) { if (run.phase === 'reward') rewards++; auto1(run); }
  ok(rewards === 3, 'elite + handicap give extra rewards (' + rewards + ')');
  function auto1(run) { const st = run.step; if (run.phase === 'reward') R.takeCards(run, st.offer.slice(0, Math.min(st.need, st.offer.length))); else if (run.phase === 'remove') R.removeCard(run, 0); else if (run.phase === 'event') R.chooseEvent(run, false); }
}
// 3) 改造カードが対戦で効く
{ const s = E.newGame(E.mulberry32(5), 0, { decks: [['normal@a', 'normal@m', 'mini@e', 'normal'], ['normal']], lives: [7, 7], log: false });
  const all = s.players[0].deck.concat(s.players[0].hand);
  const a = all.find(c => c.atkPlus), m = all.find(c => c.modMax), e = all.find(c => c.enterPlus);
  ok(a && E.rawAtk(Object.assign({}, a, { bat: 0 })) === 3, 'atk mod'); ok(m && E.capOf(m) === 4, 'cap mod'); ok(e && E.enterOf(e) === 2, 'enter mod'); }
// 4) ランダムに100ラン
let clears = 0;
for (let i = 0; i < 100; i++) {
  const run = R.newRun(1000 + i), rng = E.mulberry32(i);
  auto(run, rng);
  while (run.phase === 'battle') { R.finishBattle(run, rng() < 0.85); auto(run, rng); const b = R.battleSetup(run); const s = E.newGame(rng, 0, { log: false, decks: b.decks, lives: b.lives, perks: b.perks, batPlus: b.batPlus }); E.invariant(s); }
  if (run.phase === 'clear') clears++;
  JSON.parse(JSON.stringify(run));
}
ok(clears > 0, 'some runs clear');
// 5) 文の構成：強いイベントは1つの文だけ、弱いイベントは2つ以上の文に入っている。全イベントがどこかの文に入っている
{ const cnt = {}; for (const sg of R.SIGNS) for (const id of sg.events) cnt[id] = (cnt[id] || 0) + 1;
  for (const id of Object.keys(R.EVENTS)) { ok(cnt[id] > 0, id + ' is in some sign'); if (cnt[id]) ok(R.STRONG.includes(id) ? cnt[id] === 1 : cnt[id] >= 2, id + ' sign count ' + cnt[id]); } }
console.log(`run: ${n - fails}/${n} ok`); if (fails) process.exitCode = 1;
