// ===== CPU思考ルーチン =====
// 方式: 手番の残りアクション(最大2)を全列挙 → 各終端で攻撃の有無/対象を全列挙 → 評価関数で採点。
// 相手の伏せアクションは中身が見えないので「まだ相手が使っていないアクション」で平均を取る（ズルなし）。
// 1アクション実行するたびに再計画する（引いたカードや相手の応答を反映するため）。
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.Engine;
const { CARDS, SPELL_IDS } = E;

// 手調整の初期重み（「ふつう」）
const BASE_W = {
  life: 1.0, lowLife: 0.5, unit: 1.5, atk: 0.6, bat: 0.3, hand: 0.8, handSpell: 0.2, set: 1.0,
  threat: 0.5, lethal: 12, coin: 0.8, // coin＝手札のワンモアの価値（調整済みの重みファイルと合わせるため旧名のまま）
  souji: 0.3, magnet: 0.5, barrier: 0.5, bomb: 0.5, crane: 0.3, daruma: 0.4, heat: 1.0, megaton: 0.0,
  solar: 0.4, guard: 0.5, turbo: 0.0, recycle: 0.0,
  sniper: 1.5, rocket: 0.5, jammer: 1.0, kobun: 1.5,
  // ローグライト用（初期値は手で決めたもの。tools/tune_rogue.js で調整する）
  dynamo: 1.0, medic: 0.8, fortress: 0.8, drill: 0.4, reboot: 1.0, garakuta: 0.6, bakushin: 0.5, socket: 0.3, gigantOff: 1.5, wall: 1.0, proto: 0.8,
};

// ---------- 評価関数 ----------
function roboVal(y, w) {
  let v = w.unit + w.atk * E.atkOf(y) + w.bat * y.bat;
  const on = y.bat > 0 ? 1 : 0;
  switch (y.id) {
    case 'souji': v += w.souji * on; break;
    case 'magnet': v += w.magnet * on; break;
    case 'barrier': v += w.barrier * on; break;
    case 'bomb': v += w.bomb * on; break;
    case 'crane': v += w.crane * on; break;
    case 'daruma': v += w.daruma * y.bat; break;
    case 'heat': v -= w.heat; break;
    case 'megaton': v += w.megaton; break;
    case 'solar': v += (w.solar ?? 0.4) * (E.capOf(y) - y.bat); break;
    case 'guard': v += (w.guard ?? 0.5) * on; break;
    case 'turbo': v += (w.turbo ?? 0) * y.bat; break;
    case 'recycle': v += (w.recycle ?? 0); break;
    case 'sniper': v += (w.sniper ?? 1.5) * on; break;
    case 'rocket': v += (w.rocket ?? 0.5) * on; break;
    case 'jammer': v += (w.jammer ?? 1.0) * on; break;
    case 'kobun': v += (w.kobun ?? 1.5); break;
    case 'proto': v += (w.proto ?? 0.8); break;
    // ローグライト用（手で決めた初期値。チューニングはまだ）
    case 'dynamo': v += (w.dynamo ?? 1.0) * on; break;
    case 'medic': v += (w.medic ?? 0.8) * on; break;
    case 'fortress': v += (w.fortress ?? 0.8) * on; break;
    case 'drill': v += (w.drill ?? 0.4) * on; break;
    case 'reboot': v += (w.reboot ?? 1.0); break;
    case 'garakuta': v += (w.garakuta ?? 0.6); break;
    case 'bakushin': v += (w.bakushin ?? 0.5); break;
    case 'socket': v += (w.socket ?? 0.3); break;
    case 'gigant': if (!y.bat) v -= (w.gigantOff ?? 1.5); break;
    case 'wall': v -= (w.wall ?? 1.0); break;
  }
  return v;
}
// 攻撃側(ai)が次の手番に1回攻撃した時に防御側(di)が失う最大価値（相手の手札・行動は無視した概算）
function threatOf(s, ai, di, w) {
  const A = s.players[ai].field, D = s.players[di];
  if (!A.length) return 0;
  let best = 0;
  for (const a of A) {
    if (E.cantAttack(a)) continue;
    const av = E.battleAtk(a);
    if (!D.field.length) {
      let loss = w.life * av;
      if (av >= D.life) loss += w.lethal;
      best = Math.max(best, loss);
    } else {
      for (const t of D.field) {
        const tv = E.battleAtk(t);
        if (av > tv) {
          let loss = (t.id === 'daruma' && t.bat > 0) ? w.bat + w.daruma : roboVal(t, w);
          loss += w.life * (av - tv);
          if (av - tv >= D.life) loss += w.lethal;
          best = Math.max(best, loss);
        }
      }
    }
  }
  return best;
}
function sideVal(s, pi, w) {
  const p = s.players[pi];
  let v = w.life * p.life + (p.life <= 5 ? -w.lowLife * (6 - p.life) : 0);
  for (const y of p.field) v += roboVal(y, w);
  v += w.hand * p.hand.length;
  for (const c of p.hand) { if (c.id === 'onemore') { v += (w.coin ?? 0.8) - w.hand; continue; } if (CARDS[c.id].kind === 'spell') v += w.handSpell; }
  if (p.set) v += w.set;
  // 一時的な効果（連撃回路の追加の攻撃、オーバーロードの次の手番の行動、シールド）
  const fx = p.fx || {};
  v += (w.extraAtk ?? 2.5) * ((fx.extraAttack || 0) + (fx.nextExtraAttack || 0)) + (w.bonusAct ?? 1.0) * (fx.bonusActions || 0);
  for (const y of p.field) if (y.shield) v += (w.shield ?? 0.6);
  return v;
}
// next: 次に手番を持つプレイヤー
function evaluate(s, me, w, next) {
  if (s.winner !== null) return s.winner === me ? 1e5 + s.players[me].life : -1e5 - s.players[1 - me].life;
  if (s.draw) return 0;
  const op = 1 - me;
  let v = sideVal(s, me, w) - sideVal(s, op, w);
  if (next === op) v -= w.threat * threatOf(s, op, me, w);
  else v += w.threat * threatOf(s, me, op, w);
  return v;
}

// ---------- 選択肢の列挙 ----------
function multisets(items, k) {
  const out = [];
  (function rec(start, cur) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < items.length; i++) { cur.push(items[i]); rec(i, cur); cur.pop(); }
  })(0, []);
  return out;
}
// AI用のアクション選択肢（明らかに無意味なものは省く）
function spellChoices(s, pi, id, uid) {
  const P = s.players[pi], O = s.players[1 - pi];
  if (id === 'bakaji' && P.life > E.RAGE_LIFE) return [];
  if (id === 'junk') {
    // 種類ごとに1枚（同じカード名は1つにまとめる）
    const { robos, spells } = E.junkPool(s, pi), uniq = l => { const seen = {}; return l.filter(c => !seen[c.id] && (seen[c.id] = 1)); };
    const rs = robos.length ? uniq(robos) : [null], ss = spells.length ? uniq(spells) : [null], res = [];
    if (!robos.length && !spells.length) return [];
    for (const r of rs) for (const sp of ss) res.push(Object.assign({}, r ? { uid: r.uid } : {}, sp ? { sid: sp.uid } : {}));
    return res;
  }
  if (id === 'qcharge') {
    // 満充電にならない時は、捨てる手札も選ぶ（同じカード名は1つにまとめる）
    const res = [];
    for (const y of E.pickPool(s, pi, CARDS.qcharge.pick)) {
      if (E.qchargeFills(s, y.uid)) { res.push({ target: y.uid }); continue; }
      const seen = {}, hs = P.hand.filter(c => c.uid !== uid && !seen[c.id] && (seen[c.id] = 1));
      if (!hs.length) res.push({ target: y.uid }); else for (const c of hs) res.push({ target: y.uid, discard: c.uid });
    }
    return res;
  }
  const pk = CARDS[id].pick;
  if (pk) {
    if (pk.zone === 'scrap') { const seen = {}; return E.pickPool(s, pi, pk).filter(c => !seen[c.id] && (seen[c.id] = 1)).map(c => ({ uid: c.uid })); }
    const res = E.pickPool(s, pi, pk).map(y => ({ target: y.uid }));
    if (pk.player) res.push({ target: 'player' });
    if (!res.length && pk.optional) res.push({});
    return res;
  }
  switch (id) {
    case 'ebattery': {
      // 自分のロボに置く。容量に収まる組み合わせのみ
      const own = P.field.filter(y => !E.immuneFrom(y, s, pi));
      const cap = own.reduce((a, y) => a + E.capOf(y) - y.bat, 0);
      const k = Math.min(2, cap);
      if (k <= 0) return [];
      const res = [];
      for (const ms of multisets(own.map(y => y.uid), k)) {
        const cnt = {}; let ok = true;
        for (const u of ms) cnt[u] = (cnt[u] || 0) + 1;
        for (const y of own) if ((cnt[y.uid] || 0) > E.capOf(y) - y.bat) ok = false;
        if (ok) res.push({ targets: ms });
      }
      return res;
    }
    case 'manual': {
      const ok = E.maintTargets(s, pi);
      if (ok.length) return ok.map(y => ({ target: y.uid }));
      return P.deck.length ? [{}] : [];
    }
    case 'onemore': return [{}];
    case 'repair': {
      if (P.field.length >= 3) return [];
      const res = [], seen = {};
      for (const gpi of [0, 1]) for (const c of s.players[gpi].scrap) {
        if (CARDS[c.id].kind !== 'robo' || seen[c.id]) continue; seen[c.id] = 1;
        res.push({ gpi, uid: c.uid });
      }
      return res;
    }
    case 'swap': {
      const all = E.allField(s), res = [];
      for (const a of all) if (a.bat > 0 && !E.immuneFrom(a, s, pi))
        for (const b of all) if (b !== a && !E.immuneFrom(b, s, pi) && b.bat < E.capOf(b)) res.push({ from: a.uid, to: b.uid });
      return res;
    }
    case 'thunder': return E.thunderCandidates(s, pi).map(y => ({ target: y.uid }));
    case 'hack': return P.field.length >= 3 ? [] : E.hackCandidates(s, pi).map(y => ({ target: y.uid }));
    case 'limiter': return E.allField(s).filter(y => !E.immuneFrom(y, s, pi)).map(y => ({ target: y.uid }));
    case 'overload': case 'emp': case 'estop': case 'medkit': case 'decoy': case 'yakekuso': case 'combo': case 'dorder': case 'echarge': return [{}];
    case 'eject': return E.ejectPool(s, uid).map(q => ({ pi: q }));
    case 'scavenge': return P.deck.length ? [{}] : [];
    case 'cannon': { const res = []; for (const a of P.field) if (a.bat > 0) for (const b of O.field) if (!E.immuneFrom(b, s, pi)) res.push({ target: a.uid, to: b.uid }); return res; }
    case 'convert': case 'armor': {
      const seen = {}, rs = P.scrap.filter(c => CARDS[c.id].kind === 'robo' && !seen[c.id] && (seen[c.id] = 1)), res = [];
      for (const y of P.field) for (const c of rs) res.push({ target: y.uid, uid: c.uid });
      return res;
    }
    default: if (CARDS[id].burn) return [{}];
  }
  return [];
}
function mainActions(s) {
  const pi = s.turn, P = s.players[pi], O = s.players[1 - pi], acts = [];
  if (!(s.phase === 'main' && !E.isOver(s) && !s.pending)) return acts;
  // 行動を消費しないカード（ワンモア）は行動0でも使える
  const jam = E.isJammed(s, pi);
  if (s.actions <= 0) { if (!jam) for (const c of P.hand) if (CARDS[c.id].noCost) acts.push({ t: 'play', uid: c.uid, ch: {} }); return acts; }
  const cards = P.hand.slice(); if (P.set) cards.push(P.set);
  const seenY = {};
  for (const c of cards) {
    const d = CARDS[c.id];
    if (d.kind === 'robo') {
      if (P.field.length < 3 && !seenY[c.id]) {
        seenY[c.id] = 1;
        const pool = d.deployPick ? E.pickPool(s, pi, d.deployPick, c.uid) : [];
        if (pool.length) for (const y of pool) acts.push({ t: 'play', uid: c.uid, ch: { target: y.uid } });
        else acts.push({ t: 'play', uid: c.uid });
      }
    }
    else if (!jam) for (const ch of spellChoices(s, pi, c.id, c.uid)) acts.push({ t: 'play', uid: c.uid, ch });
  }
  for (const y of P.field) if (y.bat < E.capOf(y)) acts.push({ t: 'place', target: y.uid });
  for (const y of P.field) if (y.bat > 0) {
    if (y.id === 'souji') { for (const tp of [0, 1]) if (s.players[tp].set) acts.push({ t: 'release', src: y.uid, ch: { pi: tp } }); }
    if (y.id === 'magnet') for (const t of O.field) if (!E.immuneFrom(t, s, pi)) acts.push({ t: 'release', src: y.uid, ch: { target: t.uid } });
    if (y.id === 'sniper') for (const t of E.sniperCandidates(s, y.uid)) acts.push({ t: 'release', src: y.uid, ch: { target: t.uid } });
    if (CARDS[y.id].pick) for (const t of E.pickPool(s, pi, CARDS[y.id].pick, y.uid)) acts.push({ t: 'release', src: y.uid, ch: { target: t.uid } });
    if (y.id === 'medic') acts.push({ t: 'release', src: y.uid, ch: {} });
  }
  if (!P.set) for (const c of P.hand) if (CARDS[c.id].kind === 'spell' && !CARDS[c.id].noSet) acts.push({ t: 'set', uid: c.uid });
  return acts;
}
function attackOptions(s) {
  const pi = s.turn, O = s.players[1 - pi];
  if (s.firstTurn || s.attacked || s.noAttack || E.isOver(s)) return [];
  const res = [];
  const gs = E.guardsOf(s, 1 - pi), targets = gs.length ? gs : O.field;
  for (const a of s.players[pi].field) {
    if (E.cantAttack(a)) continue;
    const tg = O.field.length ? targets.map(t => t.uid) : ['player'];
    for (const tgt of tg) {
      res.push({ t: 'attack', att: a.uid, tgt });
      if (a.id === 'rocket') res.push({ t: 'attack', att: a.uid, tgt, boost: true });
    }
  }
  return res;
}

// ---------- 応答（防御側の伏せアクション） ----------
function respondOptions(s) {
  const di = 1 - s.turn, c = s.players[di].set;
  let base = [null];
  if (c && E.canRespondSet(s)) base = base.concat(spellChoices(s, di, c.id, c.uid).filter(ch => !E.respondChoiceError(s, ch)).map(ch => ({ ch })));
  if (!E.rocketDefends(s)) return base;
  // ロケットロボを点火するかどうか
  return base.concat(base.map(r => Object.assign({}, r || {}, { boost: true })));
}
// 攻撃宣言後の状態で、防御側として最善の応答を選ぶ
function chooseResponse(s, w) {
  const di = 1 - s.turn;
  let best = null, bv = -Infinity;
  for (const r of respondOptions(s)) {
    const t = E.clone(s); E.respond(t, r); E.resolveEot(t);
    const v = evaluate(t, di, w, di);
    if (v > bv) { bv = v; best = r; }
  }
  return best;
}

// ---------- 返し（攻撃側：防御側が表にした伏せ札に、自分の伏せ札で返す） ----------
function chooseCounter(s, w) {
  const me = s.turn, c = s.players[me].set;
  if (!E.canCounter(s) || !c) return null;
  let best = null, bv = -Infinity;
  const opts = [null].concat(spellChoices(s, me, c.id, c.uid).filter(ch => !E.counterChoiceError(s, ch)).map(ch => ({ ch })));
  for (const r of opts) {
    const t = E.clone(s); E.resolveChain(t, r); E.resolveBattle(t); E.resolveEot(t);
    const v = evaluate(t, me, w, 1 - me);
    if (v > bv) { bv = v; best = r; }
  }
  return best;
}
const counterFn = w => t => chooseCounter(t, w);

// ---------- 攻撃の評価（相手の伏せアクションは期待値） ----------
function unknownSpells(s, op) {
  // 相手のアクションで、まだ公開領域（スクラップ）に出ていないもの = 伏せカードの候補
  if (s.lists) {
    // デッキリストが分かる時（勝ち抜きモード）：リストのアクションから、スクラップに出た枚数を引く
    const left = {};
    for (const id of s.lists[op]) if (CARDS[id].kind === 'spell' && !CARDS[id].noSet) left[id] = (left[id] || 0) + 1;
    for (const gp of s.players) for (const c of gp.scrap) if (c.owner === op && left[c.id]) left[c.id]--;
    return Object.keys(left).filter(id => left[id] > 0);
  }
  const known = {};
  for (const gp of s.players) for (const c of gp.scrap) if (c.owner === op) known[c.id] = 1;
  return SPELL_IDS.filter(id => !known[id]);
}
function finishVal(s, me, w) { const t = E.clone(s); E.resolveEot(t); return evaluate(t, me, w, 1 - me); }
function evalAttack(s, act, me, w, opt) {
  const op = 1 - me, O = s.players[op];
  if (!O.set || opt.ignoreSet || E.isJammed(s, op)) {
    const t = E.clone(s);
    E.apply(t, act);
    if (t.players[op].set && opt.ignoreSet) E.resolveBattle(t); // 伏せを無視する（甘い読み）
    else if (E.needsResponse(t)) E.respond(t, chooseResponse(t, w)); // ロケットロボの点火だけ選ぶ
    else E.resolveBattle(t);
    return finishVal(t, me, w);
  }
  const cands = unknownSpells(s, op);
  if (!cands.length) cands.push(O.set.id); // 理論上起きない保険
  let sum = 0;
  for (const id of cands) {
    const t = E.clone(s);
    t.players[op].set = { uid: O.set.uid, id, owner: op, bat: 0 };
    E.apply(t, act);
    const r = chooseResponse(t, w);
    E.respond(t, r, counterFn(w));
    sum += finishVal(t, me, w);
  }
  return sum / cands.length;
}
function bestBattle(s, me, w, opt) {
  let bv = finishVal(s, me, w), ba = null;
  for (const a of attackOptions(s)) {
    const v = evalAttack(s, a, me, w, opt);
    if (v > bv) { bv = v; ba = a; }
  }
  return { v: bv, a: ba };
}

// ---------- メイン：次の1手を決める ----------
// opt: { w, ignoreSet, noise, rng, randomRate }
function chooseAction(s, opt) {
  const me = s.turn, w = opt.w || BASE_W, rng = opt.rng || Math.random;
  if (E.isOver(s)) return null;
  // 計画用の状態：自分の山札順は分からないものとして混ぜる
  const root = E.clone(s);
  E.shuffle(root.players[me].deck, rng);
  E.shuffle(root.players[1 - me].deck, rng);

  if (opt.randomRate && rng() < opt.randomRate) {
    const pool = mainActions(root).concat(attackOptions(root));
    if (pool.length && rng() < 0.7) return pool[Math.floor(rng() * pool.length)];
  }

  let best = null, bv = -Infinity;
  const consider = (first, v) => {
    if (opt.noise) v += (rng() - 0.5) * opt.noise;
    if (v > bv) { bv = v; best = first; }
  };
  // 深さ優先でメインアクション列を列挙
  const dfs = (st, first, depth) => {
    const bb = bestBattle(st, me, w, opt);
    consider(first || bb.a || { t: 'end' }, bb.v);
    const acts = opt.filter ? mainActions(st).filter(a => opt.filter(a, st)) : mainActions(st);
    if (!acts.length) return;
    for (const a of acts) {
      const t = E.clone(st);
      try { E.apply(t, a); } catch (e) { continue; }
      if (E.isOver(t)) { consider(first || a, evaluate(t, me, w, 1 - me)); continue; }
      if (depth >= (opt.maxPly || 4)) { consider(first || a, bestBattle(t, me, w, opt).v); continue; } // オーバーロードなどで行動が多い時の打ち切り
      dfs(t, first || a, depth + 1);
    }
  };
  dfs(root, null, 1);
  return best;
}

// 自分が防御側の時（相手の攻撃宣言中）の応答
function chooseResponseFor(s, opt) { return chooseResponse(s, opt.w || BASE_W); }
// 攻撃側として返すかどうか（防御側が伏せ札を表にした後）
function chooseCounterFor(s, opt) { return chooseCounter(s, opt.w || BASE_W); }
// シミュレーション用：防御側の応答と攻撃側の返しを、両方CPUで決めて処理する
function respondAuto(s, optD, optA) { E.respond(s, chooseResponseFor(s, optD || {}), t => chooseCounterFor(t, optA || optD || {})); }

const api = { BASE_W, evaluate, chooseAction, chooseResponseFor, chooseCounterFor, respondAuto, mainActions, attackOptions, spellChoices };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AI = api;
})(typeof window !== 'undefined' ? window : globalThis);
