// ルール単体テスト：盤面を手で組んで、効果の結果を確かめる
const E = require('../src/engine.js');
let fails = 0, n = 0;
function ok(cond, msg) { n++; if (!cond) { fails++; console.log('NG:', msg); } }
// 空の盤面を作る。field: [[{id,bat,dmg}...],[...]]
function board(f0, f1, opts) {
  const s = E.newGame(E.mulberry32(1), 0, { log: [] });
  let uid = 1000;
  s.players.forEach((p, pi) => { p.hand = []; p.set = null; p.scrap = []; p.field = ((pi ? f1 : f0) || []).map(o => Object.assign({ uid: uid++, owner: pi, bat: 0 }, o)); });
  s.turnNo = 3; s.firstTurn = false; s.turn = 0; s.actions = 2; s.phase = 'main'; s.attacked = false; s.noAttack = false; s.eot = [];
  s.uidSeq = uid + 100;
  return Object.assign(s, opts || {});
}
const F = (s, pi, i) => s.players[pi].field[i];
module.exports = { ok, board, F, done: () => { console.log(`rules: ${n - fails}/${n} ok`); if (fails) process.exitCode = 1; } };
if (require.main !== module) return;

// --- ダメージ制 ---
{ // 攻撃力5に3ダメージ → 攻撃力2として扱う
  const s = board([{ id: 'heat', bat: 1 }], []); // ヒート4+1=5
  E.roboDamage(s, F(s, 0, 0).uid, 3);
  ok(E.atkOf(F(s, 0, 0)) === 2, 'atk 5 - 3dmg = 2');
  ok(E.rawAtk(F(s, 0, 0)) === 5, 'raw atk stays 5');
  E.roboDamage(s, F(s, 0, 0).uid, 2);
  ok(s.players[0].field.length === 0, '5dmg on atk5 destroys');
  ok(s.players[0].scrap.length === 1 && !s.players[0].scrap[0].dmg, 'scrap card has no dmg');
}
{ // ダメージのない攻撃力0は壊れない（ウォール想定。ここではボム1から電池なしで代用はできないので、atk0の状態を作る）
  const s = board([{ id: 'bomb', bat: 0 }], []);
  E.sweepDeaths(s);
  ok(s.players[0].field.length === 1, 'no damage, survives');
}
{ // 戦闘：ダメージを負った5（実質2）と攻撃力2が相打ち
  const s = board([{ id: 'souji', bat: 0 }], [{ id: 'heat', bat: 1 }]);
  E.roboDamage(s, F(s, 1, 0).uid, 3);
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null);
  ok(s.players[0].field.length === 0 && s.players[1].field.length === 0, 'damaged 5 (eff 2) trades with 2');
}
{ // 電池が外れてダメージ以下になったら壊れる（ショート）
  const s = board([], [{ id: 'turbo', bat: 2 }]); // ターボ 2+2+2=6
  E.roboDamage(s, F(s, 1, 0).uid, 3);
  ok(s.players[1].field.length === 1, '6 with 3dmg survives');
  s.players[0].hand.push({ uid: 1, id: 'short', owner: 0, bat: 0 });
  E.apply(s, { t: 'play', uid: 1, ch: { targets: [F(s, 1, 0).uid] } });
  ok(s.players[1].field.length === 0, 'short drops atk to 2 <= 3dmg -> destroyed');
}
{ // 手番の終わりにダメージは消える。消えたことで壊れることはない
  const s = board([{ id: 'heat', bat: 0 }], [{ id: 'heat', bat: 0 }]);
  E.roboDamage(s, F(s, 0, 0).uid, 2);
  E.apply(s, { t: 'end' });
  ok(s.players[0].field.length === 1 && !F(s, 0, 0).dmg, 'dmg cleared at end of turn');
}
{ // リミッター解除の+3は体力も上げる
  const s = board([{ id: 'souji', bat: 0 }], []);
  s.players[0].hand.push({ uid: 1, id: 'limiter', owner: 0, bat: 0 });
  E.apply(s, { t: 'play', uid: 1, ch: { target: F(s, 0, 0).uid } });
  E.roboDamage(s, F(s, 0, 0).uid, 4);
  ok(s.players[0].field.length === 1 && E.atkOf(F(s, 0, 0)) === 1, 'limiter 2+3=5 survives 4 dmg');
}
{ // 直接攻撃はダメージ後の攻撃力
  const s = board([{ id: 'heat', bat: 0 }], []);
  E.roboDamage(s, F(s, 0, 0).uid, 1);
  const before = s.players[1].life;
  E.attackFull(s, F(s, 0, 0).uid, 'player', null);
  ok(before - s.players[1].life === 3, 'direct attack uses damaged atk');
}
{ // clone はダメージを引き継ぐ
  const s = board([{ id: 'heat', bat: 0 }], []);
  E.roboDamage(s, F(s, 0, 0).uid, 1);
  ok(E.clone(s).players[0].field[0].dmg === 1, 'clone keeps dmg');
}
module.exports.done();
