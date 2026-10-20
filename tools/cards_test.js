// 新カードのルールテスト
const E = require('../src/engine.js');
const { ok, board, F, done } = require('./rules_test.js');
const hand = (s, pi, id) => { const c = { uid: s.uidSeq++, id, owner: pi, bat: 0 }; s.players[pi].hand.push(c); return c.uid; };
const deck = (s, pi, ids) => { s.players[pi].deck = ids.map(id => ({ uid: s.uidSeq++, id, owner: pi, bat: 0 })); };
const play = (s, uid, ch) => E.apply(s, { t: 'play', uid, ch });
const L = (s, pi) => s.players[pi].life;
const err = (s, a) => E.checkAction(s, a);

{ const s = board([{ id: 'charge', bat: 2 }], []); ok(E.atkOf(F(s, 0, 0)) === 4, 'charge 2+2'); F(s, 0, 0).bat = 3; ok(E.atkOf(F(s, 0, 0)) === 7, 'charge full +2'); }
{ const s = board([{ id: 'dynamo', bat: 1 }, { id: 'normal', bat: 0 }], []);
  ok(!!err(s, { t: 'release', src: F(s, 0, 0).uid, ch: { target: F(s, 0, 0).uid } }), 'dynamo cannot target self');
  E.apply(s, { t: 'release', src: F(s, 0, 0).uid, ch: { target: F(s, 0, 1).uid } });
  ok(F(s, 0, 1).bat === 2 && F(s, 0, 0).bat === 0, 'dynamo +2 to other'); }
{ const s = board([{ id: 'gigant', bat: 0 }], []);
  ok(!!err(s, { t: 'attack', att: F(s, 0, 0).uid, tgt: 'player' }), 'gigant no bat cannot attack');
  F(s, 0, 0).bat = 1; ok(!err(s, { t: 'attack', att: F(s, 0, 0).uid, tgt: 'player' }), 'gigant with bat can attack'); }
{ const s = board([{ id: 'drill', bat: 1 }], [{ id: 'daruma', bat: 1 }]); // 4 vs 4 → drill removes 1 → 4 vs 3
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null);
  ok(s.players[1].field.length === 0 && s.players[0].field.length === 1, 'drill strips battery before battle'); }
{ const s = board([], [{ id: 'heat', bat: 0 }, { id: 'normal', bat: 1 }]); const u = hand(s, 0, 'hammer');
  ok(!!err(s, { t: 'play', uid: u, ch: { target: F(s, 1, 0).uid } }), 'hammer: atk4 not allowed');
  play(s, u, { target: F(s, 1, 1).uid }); ok(s.players[1].field.length === 1, 'hammer destroys atk<=3'); }
{ const s = board([{ id: 'reboot', bat: 1 }], []); E.destroy ? 0 : 0;
  const u = hand(s, 0, 'parts'); deck(s, 0, ['normal', 'normal', 'normal', 'normal']);
  play(s, u, { target: F(s, 0, 0).uid });
  ok(s.players[0].hand.some(c => c.id === 'reboot') && s.players[0].hand.length === 4, 'parts: reboot to hand + draw 3');
  ok(!s.players[0].scrap.some(c => c.id === 'reboot'), 'reboot not in scrap'); }
{ const s = board([], []); s.players[0].scrap.push({ uid: 900, id: 'heat', owner: 0, bat: 0 }); const u = hand(s, 0, 'junk');
  play(s, u, { uid: 900 }); ok(s.players[0].hand.some(c => c.id === 'heat'), 'junk returns robo'); }
{ const s = board([], []); for (let i = 0; i < 3; i++) s.players[0].scrap.push({ uid: 900 + i, id: 'normal', owner: 0, bat: 0 }); const u = hand(s, 0, 'gattai');
  play(s, u); ok(F(s, 0, 0).bat === 3 && E.atkOf(F(s, 0, 0)) === 6, 'gattai +3 from scrap'); }
{ const s = board([{ id: 'wall', bat: 0 }], []);
  ok(!!err(s, { t: 'attack', att: F(s, 0, 0).uid, tgt: 'player' }), 'wall cannot attack');
  ok(!!err(s, { t: 'place', target: F(s, 0, 0).uid }), 'wall max 0'); }
{ const s = board([{ id: 'medic', bat: 1 }], []); s.players[0].life = 15;
  E.apply(s, { t: 'release', src: F(s, 0, 0).uid, ch: {} }); ok(L(s, 0) === 17, 'medic heals over max'); }
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'fortress', bat: 1 }, { id: 'normal', bat: 1 }]); // 2 vs 3? attacker 2 loses. use heat
  s.players[0].field[0] = { uid: 1, id: 'heat', owner: 0, bat: 0 }; // 4 vs normal(3)
  E.attackFull(s, 1, F(s, 1, 1).uid, null);
  ok(s.players[1].field.length === 2 && F(s, 1, 1).bat === 0, 'fortress saves other robo'); }
{ const s = board([{ id: 'bakushin', bat: 1 }], []); const l = L(s, 1);
  E.attackFull(s, F(s, 0, 0).uid, 'player', null); ok(l - L(s, 1) === 4, 'bakushin 1 + 3 direct'); }
{ const s = board([{ id: 'kajiba', bat: 0 }], []); s.players[0].life = 6;
  ok(E.atkOf(F(s, 0, 0)) === 2, 'kajiba normal'); E.apply(s, { t: 'place', target: F(s, 0, 0).uid }); 
  s.players[0].life = 5; E.sweepDeaths(s); ok(E.atkOf(F(s, 0, 0)) === 6, 'kajiba rage at life 5'); }
{ const s = board([{ id: 'normal', bat: 0 }], []); const u = hand(s, 0, 'runaway'); const l = L(s, 0);
  play(s, u, { target: F(s, 0, 0).uid }); ok(E.atkOf(F(s, 0, 0)) === 4 && l - L(s, 0) === 2, 'runaway +2 / -2 life');
  E.attackFull(s, F(s, 0, 0).uid, 'player', null); ok(E.atkOf(F(s, 0, 0)) === 4, 'runaway lasts after battle'); }
{ const s = board([], [{ id: 'turbo', bat: 1 }]); const u = hand(s, 0, 'spark'); // turbo 4
  ok(!!err(s, { t: 'play', uid: u, ch: {} }), 'spark needs target');
  play(s, u, { target: F(s, 1, 0).uid }); ok(F(s, 1, 0).dmg === 3 && E.atkOf(F(s, 1, 0)) === 1 && L(s, 0) === 13, 'spark 3 dmg robo, self 2'); }
{ const s = board([], []); const u = hand(s, 0, 'spark'); play(s, u, { target: 'player' }); ok(L(s, 1) === 12, 'spark to player'); }
{ const s = board([], []); const u = hand(s, 0, 'overload'); play(s, u, {}); ok(s.actions === 3, 'overload +2 actions (1 used)');
  E.apply(s, { t: 'end' }); ok(L(s, 0) === 10, 'overload 5 at end'); }
{ const s = board([{ id: 'rocket', bat: 0 }], [{ id: 'heat', bat: 1 }]); // 1+5=6 vs 5
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null, true);
  ok(s.players[1].field.length === 0 && L(s, 0) === 11 && L(s, 1) === 14, 'rocket boost: win, self 4, opp 1'); }
{ const s = board([{ id: 'heat', bat: 0 }], [{ id: 'rocket', bat: 0 }]);
  E.apply(s, { t: 'attack', att: F(s, 0, 0).uid, tgt: F(s, 1, 0).uid });
  ok(E.needsResponse(s), 'rocket defender gets choice');
  E.respond(s, { boost: true }); ok(s.players[0].field.length === 0 && L(s, 1) === 11, 'rocket defends with boost'); }
{ const s = board([], []); const u = hand(s, 0, 'scout'); deck(s, 0, ['normal']); play(s, u); ok(s.players[0].hand.length === 1, 'scout draws'); }
{ const s = board([{ id: 'socket', bat: 0 }], []); E.apply(s, { t: 'place', target: F(s, 0, 0).uid }); ok(F(s, 0, 0).bat === 2, 'socket +2 on place'); }
{ const s = board([{ id: 'heat', bat: 0 }], [{ id: 'turbo', bat: 1 }]); s.turn = 1; s.players[0].set = { uid: 77, id: 'warp', owner: 0, bat: 0 };
  E.apply(s, { t: 'attack', att: F(s, 1, 0).uid, tgt: F(s, 0, 0).uid });
  E.respond(s, { ch: { target: F(s, 0, 0).uid } });
  ok(s.players[0].field.length === 0 && s.players[0].hand.some(c => c.id === 'heat') && L(s, 0) === 15, 'warp cancels attack'); }
{ const s = board([{ id: 'normal', bat: 3 }], []); const u = hand(s, 0, 'batpack'); deck(s, 0, ['normal']);
  ok(!err(s, { t: 'play', uid: u, ch: {} }), 'batpack ok w/o target when full'); play(s, u, {}); ok(s.players[0].hand.length === 1, 'batpack draws'); }
{ const s = board([], [{ id: 'turbo', bat: 3 }]); const u = hand(s, 0, 'leak'); play(s, u, { target: F(s, 1, 0).uid }); ok(F(s, 1, 0).bat === 0, 'leak all'); }
{ const s = board([], [{ id: 'turbo', bat: 2 }]); const u = hand(s, 0, 'copy'); // turbo 6
  play(s, u, { target: F(s, 1, 0).uid }); ok(E.atkOf(F(s, 0, 0)) === 6, 'copy 6');
  E.apply(s, { t: 'place', target: F(s, 0, 0).uid }); ok(E.atkOf(F(s, 0, 0)) === 7, 'copy + battery'); }
{ const s = board([], [{ id: 'barrier', bat: 1 }]); const u = hand(s, 0, 'copy');
  ok(!err(s, { t: 'play', uid: u, ch: {} }), 'copy w/o candidates ok (barrier immune)'); play(s, u, {}); ok(E.atkOf(F(s, 0, 0)) === 0, 'copy 0'); }
{ const s = board([{ id: 'garakuta', bat: 0 }], [{ id: 'heat', bat: 0 }]); deck(s, 0, ['normal']);
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null); ok(s.players[0].hand.length === 1, 'garakuta draws on destroy'); }
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'normal', bat: 1 }]); const u = hand(s, 0, 'drycell'), v = hand(s, 0, 'static');
  play(s, u, { target: F(s, 0, 0).uid }); play(s, v, { target: F(s, 1, 0).uid });
  ok(F(s, 0, 0).bat === 1 && F(s, 1, 0).bat === 0, 'drycell/static'); }
{ const s = board([{ id: 'jammer', bat: 1 }], []); const u = hand(s, 0, 'drycell');
  ok(!!err(s, { t: 'play', uid: u, ch: { target: F(s, 0, 0).uid } }), 'jammer blocks own actions too'); }
{ const s = E.newGame(E.mulberry32(3), 0, { decks: [E.BASIC_DECK, E.BASIC_DECK], lives: [7, 7] });
  ok(s.players[0].life === 7 && s.players[0].deck.length + s.players[0].hand.length === 10, 'newGame custom deck'); E.invariant(s); }
done();
