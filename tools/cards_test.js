// 新カードのルールテスト
const E = require('../src/engine.js');
const { ok, board, F, done } = require('./rules_test.js');
const hand = (s, pi, id) => { const c = { uid: s.uidSeq++, id, owner: pi, bat: 0 }; s.players[pi].hand.push(c); return c.uid; };
const deck = (s, pi, ids) => { s.players[pi].deck = ids.map(id => ({ uid: s.uidSeq++, id, owner: pi, bat: 0 })); };
const play = (s, uid, ch) => E.apply(s, { t: 'play', uid, ch });
const L = (s, pi) => s.players[pi].life;
const err = (s, a) => E.checkAction(s, a);

{ const s = board([{ id: 'charge', bat: 1 }], []); ok(E.atkOf(F(s, 0, 0)) === 3, 'charge 2+1'); F(s, 0, 0).bat = 2; ok(E.atkOf(F(s, 0, 0)) === 6, 'charge full +2'); }
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
{ const s = board([], [{ id: 'heat', bat: 1 }, { id: 'normal', bat: 1 }]); const u = hand(s, 0, 'hammer');
  ok(!!err(s, { t: 'play', uid: u, ch: { target: F(s, 1, 0).uid } }), 'hammer: atk5 not allowed');
  play(s, u, { target: F(s, 1, 1).uid }); ok(s.players[1].field.length === 1, 'hammer destroys atk<=4'); }
{ const s = board([{ id: 'reboot', bat: 1 }], []); E.destroy ? 0 : 0;
  const u = hand(s, 0, 'parts'); deck(s, 0, ['normal', 'normal', 'normal', 'normal']);
  play(s, u, { target: F(s, 0, 0).uid });
  ok(s.players[0].hand.some(c => c.id === 'reboot') && s.players[0].hand.length === 4, 'parts: reboot to hand + draw 3');
  ok(!s.players[0].scrap.some(c => c.id === 'reboot'), 'reboot not in scrap'); }

{ const s = board([], []); for (let i = 0; i < 3; i++) s.players[0].scrap.push({ uid: 900 + i, id: 'normal', owner: 0, bat: 0 }); const u = hand(s, 0, 'gattai');
  play(s, u); ok(F(s, 0, 0).bat === 3 && E.atkOf(F(s, 0, 0)) === 6, 'gattai +3 from scrap (cap 3)'); }
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
  E.apply(s, { t: 'end' }); ok(L(s, 0) === 11, 'overload 4 at end'); }
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
{ const s = board([{ id: 'gigant', bat: 1 }], [{ id: 'normal', bat: 0 }]);
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null); ok(F(s, 0, 0).bat === 0 && s.players[1].field.length === 0, 'gigant spends battery after attack'); }
{ const s = board([{ id: 'gigant', bat: 1 }], []); E.attackFull(s, F(s, 0, 0).uid, 'player', null); ok(F(s, 0, 0).bat === 0 && s.players[1].life === 9, 'gigant direct 6 then battery off'); }
{ const s = board([{ id: 'normal', bat: 0 }, { id: 'heat', bat: 0 }], [{ id: 'barrier', bat: 1 }, { id: 'turbo', bat: 1 }]); const u = hand(s, 0, 'press');
  play(s, u); ok(s.players[0].field.map(y => y.id).join() === 'heat,press' && s.players[1].field.map(y => y.id).join() === 'turbo', 'press kills lowest each side (barrier too)'); }
{ const s = board([], [{ id: 'turbo', bat: 2 }, { id: 'heat', bat: 0 }]); const u = hand(s, 0, 'press'); play(s, u);
  ok(s.players[0].field.length === 0 && s.players[1].field.map(y => y.id).join() === 'turbo', 'press alone destroys itself = removal'); }
{ const s = board([{ id: 'turbo', bat: 3 }, { id: 'heat', bat: 2 }], []); const u = hand(s, 0, 'press'); play(s, u);
  ok(s.players[0].field.map(y => y.id).join() === 'turbo,heat', 'press is the weakest -> destroys itself'); }
{ const s = board([{ id: 'proto', bat: 0 }], [{ id: 'heat', bat: 0 }]);
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null); ok(F(s, 0, 0) && F(s, 0, 0).id === 'normal' && !E.CARDS.normal.token, 'proto spawns a real normal robo'); }
{ const s = board([], []); s.players[0].scrap.push({ uid: 800, id: 'heat', owner: 0, bat: 0 }, { uid: 801, id: 'thunder', owner: 0, bat: 0 }); const u = hand(s, 0, 'junk');
  ok(!!err(s, { t: 'play', uid: u, ch: { uid: 800 } }), 'junk must also pick action when present');
  play(s, u, { uid: 800, sid: 801 }); ok(s.players[0].hand.map(c => c.id).sort().join() === 'heat,thunder', 'junk returns robo + action'); }
{ const s = board([], []); const u = hand(s, 0, 'junk'); ok(!!err(s, { t: 'play', uid: u, ch: {} }), 'junk needs something in scrap'); }
{ const s = board([{ id: 'turbo', bat: 2 }, { id: 'normal', bat: 0 }], []); deck(s, 0, ['normal', 'normal', 'normal']); const u = hand(s, 0, 'parts');
  play(s, u, { target: F(s, 0, 0).uid }); ok(F(s, 0, 0).id === 'normal' && F(s, 0, 0).bat === 2, 'parts salvages batteries'); }
{ const s = board([], [{ id: 'turbo', bat: 3 }, { id: 'normal', bat: 1 }]); const u = hand(s, 0, 'short');
  ok(!!err(s, { t: 'play', uid: u, ch: { targets: [F(s, 1, 0).uid] } }), 'short: one target via ch.target');
  play(s, u, { target: F(s, 1, 0).uid });
  ok(s.players[1].field.length === 1 && F(s, 1, 0).id === 'normal' && F(s, 1, 0).bat === 1, 'short: turbo(3 batteries broken) dies, other untouched'); }
{ const s = board([], [{ id: 'normal', bat: 1 }]); const u = hand(s, 0, 'short'); play(s, u, { target: F(s, 1, 0).uid });
  ok(F(s, 1, 0).dmg === 1 && E.atkOf(F(s, 1, 0)) === 1, 'short: normal 3 -> bat broken -> 2 -1dmg = 1'); }
{ const s = board([], [{ id: 'mini', bat: 1 }, { id: 'turbo', bat: 2 }]); const u = hand(s, 0, 'emp'); play(s, u, {});
  ok(s.players[1].field.map(y => y.id).join() === 'turbo' && F(s, 1, 0).bat === 1 && F(s, 1, 0).dmg === 1, 'emp: mini(1) dies, turbo takes 1'); }
{ const s = board([], [{ id: 'barrier', bat: 1 }, { id: 'turbo', bat: 2 }, { id: 'heat', bat: 0 }]); const u = hand(s, 0, 'emp'); play(s, u, {});
  ok(F(s, 1, 0).bat === 0 && F(s, 1, 1).bat === 1 && F(s, 1, 2).bat === 0, 'emp: -1 each, barrier too'); }
{ const s = board([], [{ id: 'heat', bat: 0 }, { id: 'turbo', bat: 1 }]); const u = hand(s, 0, 'hammer');
  ok(!err(s, { t: 'play', uid: u, ch: { target: F(s, 1, 0).uid } }) && !err(s, { t: 'play', uid: u, ch: { target: F(s, 1, 1).uid } }), 'hammer: atk4 ok'); }
{ const s = board([{ id: 'normal', bat: 0 }], []); const u = hand(s, 0, 'drycell'); play(s, u, { target: F(s, 0, 0).uid });
  ok(F(s, 0, 0).bat === 1 && E.atkOf(F(s, 0, 0)) === 4, 'drycell +1 battery and +1 this turn'); E.apply(s, { t: 'end' }); ok(E.atkOf(F(s, 0, 0)) === 3, 'drycell boost ends'); }
{ const s = board([{ id: 'solar', bat: 3 }, { id: 'normal', bat: 0 }, { id: 'mini', bat: 0 }], []); const u = hand(s, 0, 'thunder');
  play(s, u, { target: F(s, 0, 0).uid }); ok(F(s, 0, 0).id === 'normal' && F(s, 0, 0).bat === 3 && F(s, 0, 1).bat === 0, 'baton touch: batteries to strongest first'); }
{ const s = board([{ id: 'mini', bat: 2 }, { id: 'normal', bat: 0 }], [{ id: 'heat', bat: 1 }]);
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null); ok(F(s, 0, 0).id === 'normal' && F(s, 0, 0).bat === 2, 'mini baton touch'); }
{ const s = board([{ id: 'normal', bat: 0 }], []); const u = hand(s, 0, 'feeder'), v = hand(s, 0, 'mini'); play(s, u); E.apply(s, { t: 'play', uid: v });
  ok(F(s, 0, 1).bat === 1 && F(s, 0, 2).bat === 2, 'feeder: itself +1, mini 1+1=2'); }
{ const s = board([{ id: 'relay', bat: 0 }, { id: 'heat', bat: 2 }, { id: 'normal', bat: 0 }], [{ id: 'turbo', bat: 3 }]);
  s.turn = 1; E.attackFull(s, F(s, 1, 0).uid, F(s, 0, 1).uid, null); ok(F(s, 0, 0).id === 'relay' && F(s, 0, 0).bat === 2 && F(s, 0, 1).id === 'normal', 'relay gives backup to heat (to leftmost of equals)'); }
{ const s = board([], []); deck(s, 0, ['normal', 'thunder']); const u = hand(s, 0, 'sorter'); play(s, u);
  ok(s.players[0].scrap.some(c => c.id === 'thunder') && s.players[0].hand.length === 0, 'sorter: action to scrap');
  const v = hand(s, 0, 'sorter'); play(s, v); ok(s.players[0].hand.some(c => c.id === 'normal'), 'sorter: robo to hand'); }
{ const s = board([{ id: 'heat', bat: 1 }], [{ id: 'normal', bat: 0 }]); s.turn = 1; const u = hand(s, 1, 'guardian'); play(s, u);
  ok(F(s, 1, 2) && F(s, 1, 2).id === 'guardbot' && F(s, 1, 2).bat === 1, 'guardian spawns guardbot with battery');
  s.turn = 0; s.actions = 2;
  ok(!!err(s, { t: 'attack', att: F(s, 0, 0).uid, tgt: F(s, 1, 0).uid }), 'taunt forces target');
  const l = s.players[1].life; E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 2).uid, null);
  ok(s.players[1].life === l && !s.players[1].field.some(y => y.id === 'guardbot') && s.players[1].scrap.some(c => c.id === 'guardbot'), 'guardbot: no damage, goes to scrap'); }
{ const s = board([{ id: 'normal', bat: 0 }], []); s.players[0].field.push({ uid: 777, id: 'aniki', owner: 0, bat: 0 }); const u = hand(s, 0, 'warp');
  play(s, u, { target: 777 }); ok(s.players[0].hand.some(c => c.id === 'aniki'), 'warp token -> hand'); }
{ const s = board([], []); s.players[0].scrap.push({ uid: 778, id: 'aniki', owner: 0, bat: 0 }); const u = hand(s, 0, 'junk'); play(s, u, { uid: 778 }); ok(s.players[0].hand.some(c => c.id === 'aniki'), 'junk can return token'); }
{ const s = board([], []); const u = hand(s, 0, 'onemore'); play(s, u, {}); ok(!s.players[0].scrap.some(c => c.id === 'onemore') && s.actions === 3, 'onemore is removed from game'); }
// ===== 10/22 追加カード =====
const resp = (s, ch) => E.respond(s, { ch });
const setCard = (s, pi, id) => { const c = { uid: s.uidSeq++, id, owner: pi, bat: 0 }; s.players[pi].set = c; return c.uid; };
// 防衛
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'heat', bat: 1 }]); const l = L(s, 0); setCard(s, 0, 'estop'); s.turn = 1;
  E.apply(s, { t: 'attack', att: F(s, 1, 0).uid, tgt: F(s, 0, 0).uid }); resp(s, {});
  ok(s.players[0].field.length === 1 && L(s, 0) === l, 'estop: no destroy, no damage');
  E.apply(s, { t: 'end' }); ok(!s.players[0].fx.protect, 'estop ends at turn end'); }
{ const s = board([], [{ id: 'normal', bat: 2 }]); const u = hand(s, 0, 'static'); s.players[1].field[0].shield = true;
  play(s, u, { target: F(s, 1, 0).uid }); ok(F(s, 1, 0).bat === 1 && !F(s, 1, 0).dmg && !F(s, 1, 0).shield, 'shield blocks burst damage once'); }
{ const s = board([{ id: 'normal', bat: 0 }], []); const u = hand(s, 0, 'shield'); play(s, u, { target: F(s, 0, 0).uid }); ok(F(s, 0, 0).shield, 'shield attaches'); }
{ const s = board([], []); s.players[0].life = 10; deck(s, 0, ['normal']); const u = hand(s, 0, 'medkit'); play(s, u, {}); ok(L(s, 0) === 13 && s.players[0].hand.length === 1, 'medkit heal 3 draw 1'); }
{ const s = board([], [{ id: 'heat', bat: 1 }]); setCard(s, 0, 'decoy'); s.turn = 1;
  E.apply(s, { t: 'attack', att: F(s, 1, 0).uid, tgt: 'player' });
  const l = L(s, 0); resp(s, {}); ok(s.players[0].scrap.some(c => c.id === 'guardbot') && L(s, 0) === l, 'decoy redirects to guardbot, no damage'); }
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'normal', bat: 0 }]); setCard(s, 0, 'counter'); s.turn = 1;
  E.apply(s, { t: 'attack', att: F(s, 1, 0).uid, tgt: F(s, 0, 0).uid }); resp(s, { target: F(s, 0, 0).uid });
  ok(s.players[1].field.length === 0 && s.players[0].field.length === 1, 'counter +2 when attacked (2+2 vs 3)'); }
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'heat', bat: 1 }]); setCard(s, 0, 'parry'); s.turn = 1;
  E.apply(s, { t: 'attack', att: F(s, 1, 0).uid, tgt: F(s, 0, 0).uid }); resp(s, { target: F(s, 0, 0).uid });
  ok(s.players[0].hand.some(c => c.id === 'normal') && !s.players[0].scrap.some(c => c.id === 'normal'), 'parry returns to hand instead'); }
// 解体
{ const s = board([], [{ id: 'normal', bat: 2 }]); const u = hand(s, 0, 'breaker'); play(s, u, { target: F(s, 1, 0).uid }); ok(F(s, 1, 0).bat === 1 && F(s, 1, 0).dmg === 2, 'breaker burst2'); }
{ const s = board([], []); setCard(s, 1, 'thunder'); deck(s, 0, ['normal']); const u = hand(s, 0, 'eject');
  ok(!!err(s, { t: 'play', uid: u, ch: { pi: 0 } }), 'eject: must pick existing set');
  play(s, u, { pi: 1 }); ok(!s.players[1].set && s.players[0].hand.length === 1, 'eject destroys set + draw'); }
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'heat', bat: 0 }]); setCard(s, 0, 'eject'); s.turn = 1;
  ok(!!E.respondChoiceError(s, { pi: 0 }), 'eject from set cannot target itself'); }
{ const s = board([{ id: 'rat', bat: 1 }], [{ id: 'normal', bat: 1 }]); E.apply(s, { t: 'release', src: F(s, 0, 0).uid, ch: { target: F(s, 1, 0).uid } });
  ok(F(s, 1, 0).bat === 0 && F(s, 1, 0).dmg === 1, 'rat release burst1'); }
{ const s = board([{ id: 'crusher', bat: 1 }], [{ id: 'normal', bat: 0 }]); s.players[1].set = { uid: 5000, id: 'eject', owner: 1, bat: 0 };
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null); ok(!s.players[1].set && s.players[1].field.length === 0, 'crusher destroys set after kill'); }
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'mini', bat: 1 }]); const u = hand(s, 0, 'dismantle');
  play(s, u, { target: F(s, 1, 0).uid }); ok(s.players[1].field.length === 0 && F(s, 0, 0).bat === 1, 'dismantle steals batteries'); }
{ const s = board([], [{ id: 'normal', bat: 1 }, { id: 'normal', bat: 2 }]); const u = hand(s, 0, 'demolisher'); play(s, u);
  ok(F(s, 1, 1).bat === 1 && F(s, 1, 1).dmg === 1 && F(s, 1, 0).bat === 1, 'demolisher bursts most-battery robo'); }
{ const s = board([], [{ id: 'normal', bat: 1 }, { id: 'heat', bat: 2 }]); const u = hand(s, 0, 'dorder'); play(s, u, {});
  ok(s.players[1].field.length === 1 && F(s, 1, 0).id === 'heat' && F(s, 1, 0).bat === 1, 'dorder burst2 all'); }
// 暴走
{ const s = board([{ id: 'selfdestruct', bat: 0 }], [{ id: 'normal', bat: 1 }]); const l0 = L(s, 0), l1 = L(s, 1);
  E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null); ok(L(s, 0) === l0 - 2 && L(s, 1) === l1 - 2, 'selfdestruct both take 2 (tie)'); }
{ const s = board([{ id: 'kamikaze', bat: 0 }], []); const l0 = L(s, 0), l1 = L(s, 1);
  E.attackFull(s, F(s, 0, 0).uid, 'player', null); ok(L(s, 1) === l1 - 4 && L(s, 0) === l0 - 1, 'kamikaze +2, self 1'); }
{ const s = board([{ id: 'overheat', bat: 0 }], []); const u = hand(s, 0, 'runaway'); play(s, u, { target: F(s, 0, 0).uid }); ok(F(s, 0, 0).bat === 1, 'overheat gains battery on damage'); }
{ const s = board([], [{ id: 'rengine', bat: 0 }]); const l = L(s, 1); E.apply(s, { t: 'end' }); ok(F(s, 1, 0).bat === 1 && L(s, 1) === l - 1, 'rengine start of turn'); }
{ const s = board([], []); deck(s, 0, ['normal', 'normal', 'normal']); s.players[0].life = 5; const u = hand(s, 0, 'yakekuso'); play(s, u, {}); ok(s.players[0].hand.length === 3, 'yakekuso low life draw 3'); }
{ const s = board([{ id: 'normal', bat: 1 }], []); const u = hand(s, 0, 'bakaji');
  ok(!!err(s, { t: 'play', uid: u, ch: { target: F(s, 0, 0).uid } }), 'bakaji needs life<=5');
  s.players[0].life = 5; play(s, u, { target: F(s, 0, 0).uid }); ok(E.atkOf(F(s, 0, 0)) === 6, 'bakaji x2'); }
{ const s = board([{ id: 'normal', bat: 0 }, { id: 'normal', bat: 0 }], []); const u = hand(s, 0, 'combo'); const l = L(s, 0); play(s, u, {});
  ok(L(s, 0) === l - 5, 'combo self 5');
  E.attackFull(s, F(s, 0, 0).uid, 'player', null); ok(!s.attacked && !err(s, { t: 'attack', att: F(s, 0, 1).uid, tgt: 'player' }), 'combo second attack');
  E.attackFull(s, F(s, 0, 1).uid, 'player', null); ok(s.attacked, 'combo then no more'); }
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'normal', bat: 0 }]); setCard(s, 0, 'combo'); s.turn = 1;
  E.apply(s, { t: 'attack', att: F(s, 1, 0).uid, tgt: F(s, 0, 0).uid }); resp(s, {});
  ok(s.players[0].fx.nextExtraAttack === 1, 'combo on opp turn -> next turn');
  E.apply(s, { t: 'end' }); ok(s.players[0].fx.extraAttack === 1, 'combo carried to own turn'); }
{ const s = board([{ id: 'normal', bat: 0 }], [{ id: 'normal', bat: 0 }]); setCard(s, 0, 'overload'); s.turn = 1; const l = L(s, 0);
  E.apply(s, { t: 'attack', att: F(s, 1, 0).uid, tgt: F(s, 0, 0).uid }); resp(s, {}); E.apply(s, { t: 'end' });
  ok(s.actions === 4, 'overload on opp turn: +2 next turn'); E.apply(s, { t: 'end' }); ok(L(s, 0) <= l - 4, 'overload 4 at that turn end'); }
// 共通2
{ const s = board([{ id: 'normal', bat: 0 }, { id: 'heat', bat: 0 }], [{ id: 'normal', bat: 0 }]); const u = hand(s, 0, 'bulwark'); play(s, u, { target: F(s, 0, 0).uid });
  ok(E.guardsOf(s, 0).length === 1 && E.atkOf(F(s, 0, 0)) === 3, 'bulwark taunt +1'); E.apply(s, { t: 'end' }); ok(!E.guardsOf(s, 0).length, 'bulwark ends'); }
{ const s = board([{ id: 'normal', bat: 0 }, { id: 'heat', bat: 1 }], []); const u = hand(s, 0, 'echarge'); play(s, u, {});
  ok(F(s, 0, 0).bat === 1 && F(s, 0, 1).bat === 2, 'echarge +1 all'); E.apply(s, { t: 'end' }); ok(F(s, 0, 0).bat === 0 && F(s, 0, 1).bat === 1, 'echarge removed at end'); }
{ const s = board([{ id: 'mini', bat: 3 }], []); const u = hand(s, 0, 'brace'); play(s, u, { target: F(s, 0, 0).uid }); ok(E.capOf(F(s, 0, 0)) === 4 && F(s, 0, 0).bat === 4, 'brace cap+1 bat+1'); }
{ const s = board([{ id: 'normal', bat: 1 }], []); s.players[0].life = 10; const u = hand(s, 0, 'retreat'); play(s, u, { target: F(s, 0, 0).uid });
  ok(s.players[0].hand.some(c => c.id === 'normal') && L(s, 0) === 12, 'retreat bounce + heal 2'); }
// ===== 10/22 第3弾 =====
{ const s = board([], [{ id: 'plant', bat: 3 }]); deck(s, 1, ['normal', 'normal']); const h = s.players[1].hand.length; E.apply(s, { t: 'end' }); ok(s.players[1].hand.length === h + 2, 'plant full: draw extra'); }
{ const s = board([], [{ id: 'plant', bat: 2 }]); deck(s, 1, ['normal', 'normal']); const h = s.players[1].hand.length; E.apply(s, { t: 'end' }); ok(s.players[1].hand.length === h + 1, 'plant not full: no extra'); }
{ const s = board([], []); const u = hand(s, 0, 'ups'); play(s, u); ok(F(s, 0, 0).bat === 2 && E.atkOf(F(s, 0, 0)) === 2, 'ups enters with 2'); }
{ const s = board([{ id: 'charge', bat: 0 }], []); deck(s, 0, ['normal']); const u = hand(s, 0, 'qcharge'); play(s, u, { target: F(s, 0, 0).uid }); ok(F(s, 0, 0).bat === 2 && s.players[0].hand.length === 1, 'qcharge +2, full -> draw'); }
{ const s = board([{ id: 'heat', bat: 2 }], [{ id: 'normal', bat: 2 }]); const u = hand(s, 0, 'cannon');
  ok(!!err(s, { t: 'play', uid: u, ch: { target: F(s, 0, 0).uid } }), 'cannon needs opp target');
  play(s, u, { target: F(s, 0, 0).uid, to: F(s, 1, 0).uid }); ok(F(s, 0, 0).bat === 0 && s.players[1].field.length === 0, 'cannon 2 bats -> 4 dmg kills normal(4)'); }
{ const s = board([{ id: 'charge', bat: 1 }], []); const u = hand(s, 0, 'rack'); play(s, u, { target: F(s, 0, 0).uid }); ok(F(s, 0, 0).shield, 'rack full -> shield'); }
{ const s = board([{ id: 'golem', bat: 0 }], []); for (let i = 0; i < 5; i++) s.players[0].scrap.push({ uid: 950 + i, id: 'normal', owner: 0, bat: 0 }); E.sweepDeaths(s); ok(E.atkOf(F(s, 0, 0)) === 5, 'golem +4 max'); }
{ const s = board([{ id: 'normal', bat: 2 }], []); s.players[0].scrap.push({ uid: 960, id: 'heat', owner: 0, bat: 0 }); const u = hand(s, 0, 'convert');
  play(s, u, { target: F(s, 0, 0).uid, uid: 960 }); ok(F(s, 0, 0).id === 'heat' && F(s, 0, 0).bat === 2 && s.players[0].scrap.some(c => c.id === 'normal'), 'convert swaps with batteries'); }
{ const s = board([{ id: 'normal', bat: 0 }], []); s.players[0].scrap.push({ uid: 961, id: 'heat', owner: 0, bat: 0 }); deck(s, 0, ['normal']); const u = hand(s, 0, 'armor'); const tot = s.cardTotal || E.DECK_IDS.length * 2;
  play(s, u, { target: F(s, 0, 0).uid, uid: 961 }); ok(F(s, 0, 0).shield && !s.players[0].scrap.some(c => c.id === 'heat') && s.players[0].hand.length === 1 && s.cardTotal === tot - 1, 'armor exile + shield + draw'); }
{ const s = board([], []); deck(s, 0, ['ebattery', 'heat', 'normal']); const u = hand(s, 0, 'scavenge'); const top = E.scavengeTop(s, 0); ok(top[0].id === 'normal', 'scavenge top order');
  play(s, u, { pick: top[2].uid }); ok(s.players[0].hand.length === 1 && s.players[0].hand[0].id === 'ebattery' && s.players[0].scrap.filter(c => c.id !== 'scavenge').length === 2, 'scavenge pick 1, rest scrap'); }
{ const s = board([], []); deck(s, 0, ['ebattery', 'heat', 'normal']); const u = hand(s, 0, 'scavenge'); play(s, u, {}); ok(s.players[0].hand[0].id === 'heat', 'scavenge auto picks strongest robo'); }
{ const s = board([], []); const u = hand(s, 0, 'shieldbot'); play(s, u); ok(F(s, 0, 0).shield, 'shieldbot shield on deploy'); }
{ const s = board([{ id: 'heat', bat: 1 }], [{ id: 'mine', bat: 1 }]); E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null);
  ok(s.players[1].field.length === 0 && F(s, 0, 0).bat === 0, 'mine bursts attacker before battle'); }
{ const s = board([{ id: 'lure', bat: 1 }, { id: 'normal', bat: 0 }], []); ok(E.guardsOf(s, 0).length === 1 && E.hasKw(F(s, 0, 0), 'backup'), 'lure taunt + backup'); }
{ const s = board([{ id: 'fullrush', bat: 2 }], [{ id: 'normal', bat: 1 }, { id: 'normal', bat: 2 }]); E.attackFull(s, F(s, 0, 0).uid, F(s, 1, 0).uid, null);
  ok(F(s, 1, 0) && F(s, 1, 0).bat === 1 && F(s, 1, 0).dmg === 1, 'fullrush bursts most-battery robo'); }
done();
