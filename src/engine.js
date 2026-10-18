// ===== ロボカードゲーム ルールエンジン =====
// ブラウザ・Node 両対応。状態はプレーンなオブジェクトで、clone() で複製してシミュレーションに使う。
(function (root) {
'use strict';

// リミッター解除の効果：'x2'＝攻撃力2倍、数値＝固定加算（計測時は環境変数 LIMBONUS で差し替え）
const LIM_BONUS = (typeof process !== 'undefined' && process.env && process.env.LIMBONUS) ? (process.env.LIMBONUS === 'x2' ? 'x2' : +process.env.LIMBONUS) : 3;
const CARDS = {
  souji:    { id:'souji',    name:'そうじロボ', kind:'robo', atk:2, max:3, eff:'release', text:'【放電】伏せ札を1枚選び、破壊する。', enterBat:1 },
  turbo:   { id:'turbo',   name:'ターボロボ', kind:'robo', atk:2, max:3, eff:'const',   text:'【常時】このロボの攻撃力は、電池1本につき追加で1上がる。' },
  magnet:    { id:'magnet',    name:'マグネットロボ', kind:'robo', atk:3, max:3, eff:'release', text:'【放電】相手の場のロボを1体選び、このロボと入れ替える。' },
  barrier: { id:'barrier', name:'バリアロボ', kind:'robo', atk:3, max:2, eff:'powered',    text:'【通電中】このロボは、相手のカードの効果で選ばれない。' },
  bomb: { id:'bomb', name:'ボムロボ',   kind:'robo', atk:1, max:2, eff:'powered',    text:'【通電中】このロボと戦闘したロボは、手番終了時に破壊される。', enterBat:1 },
  crane:  { id:'crane',  name:'クレーンロボ', kind:'robo', atk:3, max:3, eff:'powered',    text:'【通電中】このロボが戦闘でロボを破壊した時、山札を1枚引く。' },
  daruma:    { id:'daruma',    name:'ダルマロボ', kind:'robo', atk:3, max:2, eff:'const',   text:'【常時】このロボが戦闘で破壊される時、代わりにこのロボの電池を1本抜く。' },
  heat:   { id:'heat',   name:'ヒートロボ', kind:'robo', atk:4, max:2, eff:'const',   text:'【常時】自分の手番開始時、自分は2ダメージを受ける。' },
  megaton:    { id:'megaton',    name:'メガトンロボ',   kind:'robo', atk:5, max:1, eff:'const',   text:'【常時】このロボを起動した手番、自分の場のロボは攻撃できない。' },
  solar:   { id:'solar',   name:'ソーラーロボ', kind:'robo', atk:1, max:5, eff:'const', text:'【常時】自分の手番開始時、このロボに電池を1本入れる。このロボが破壊された時、その電池を自分の場のロボに移す（攻撃力の高いロボから順に）。', enterBat:1 },
  guard:   { id:'guard',   name:'ガードロボ', kind:'robo', atk:3, max:2, eff:'powered',  text:'【通電中】相手は、このロボ以外の自分のロボを攻撃できない。', enterBat:1 },
  recycle: { id:'recycle', name:'リサイクルロボ', kind:'robo', atk:2, max:2, eff:'const', text:'【常時】このロボを起動した時、自分のスクラップにある一番新しいアクションを1枚手札に戻す。' },
  hack:    { id:'hack',    name:'ハッキング', kind:'spell', text:'相手の場で最も攻撃力の高いロボを1体選ぶ。この手番の終わりまで、そのロボは自分の場で自分のロボとして動く（攻撃もできる）。手番終了時に持ち主の場へ戻る。' },
  limiter: { id:'limiter', name:'リミッター解除', kind:'spell', text:'場のロボを1体選ぶ。この手番の間、そのロボの攻撃力を@LIM@にする。手番終了時に、そのロボは破壊される。' },
  ebattery:    { id:'ebattery',    name:'非常用電池', kind:'spell', text:'場のロボを選び、電池を2本まで好きなように入れる。' },
  manual: { id:'manual', name:'整備マニュアル', kind:'spell', text:'山札を2枚引く。そのあと、自分の場のロボを1体選び、電池を1本入れる。' },
  short:    { id:'short',    name:'ショート',   kind:'spell', text:'電池が入ったロボを2体まで選び、その電池をすべて外す。' },
  repair:    { id:'repair',    name:'リペアキット', kind:'spell', text:'自分か相手のスクラップのロボを1体選び、自分の場で起動する。' },
  swap:    { id:'swap',    name:'電池交換',   kind:'spell', text:'場のロボを2体選び、1体目の電池を1本、2体目に移す。' },
  onemore: { id:'onemore', name:'ワンモア',   kind:'spell', token:true, noSet:true, noCost:true, text:'後攻が最初から持つ特別なアクション。この手番の行動を1回増やす。使うのに行動を消費しない。セットはできない。' },
  thunder:    { id:'thunder',    name:'かみなり',   kind:'spell', text:'場で最も攻撃力の高いロボを、1体選び破壊する。' },
  // ---- 2026-10 追加ロボ ----
  sniper:  { id:'sniper',  name:'スナイパーロボ', kind:'robo', atk:2, max:1, eff:'release', text:'【放電】このロボ以外で、場で最も攻撃力の高いロボを1体選び、破壊する。', enterBat:1 },
  rocket:  { id:'rocket',  name:'ロケットロボ',   kind:'robo', atk:1, max:1, eff:'const',   text:'【常時】このロボが戦闘する時（攻撃した時も、攻撃された時も）、電池が入っていれば1本使い、その戦闘の間だけ攻撃力を+4する。そのとき自分は3ダメージを受ける。', enterBat:1 },
  jammer:  { id:'jammer',  name:'ジャマーロボ',   kind:'robo', atk:2, max:2, eff:'powered', text:'【通電中】相手はアクションを使えない（伏せ札を表にすることもできない。伏せることはできる）。' },
  thief:   { id:'thief',   name:'ドロボ',   kind:'robo', atk:2, max:2, eff:'const',   text:'【常時】このロボを起動した時、相手の場の電池が入っているロボのうち、最も攻撃力の高いロボを1体選び、その電池を1本このロボに移す。' },
  kobun:  { id:'kobun',  name:'コブンロボ',   kind:'robo', atk:2, max:1, eff:'const',   text:'【常時】このロボが破壊された時、自分の場に「アニキロボ」を出す。' },
  aniki:   { id:'aniki',   name:'アニキロボ',     kind:'robo', atk:4, max:3, eff:'none',    token:true, text:'コブンロボが破壊された時に出るロボ（デッキには入らない）。' },
};
CARDS.limiter.text = CARDS.limiter.text.replace('@LIM@', LIM_BONUS === 'x2' ? '2倍' : '+' + LIM_BONUS).replace('+' + LIM_BONUS + 'にする', '+' + LIM_BONUS + 'する');
const LIM_LABEL = LIM_BONUS === 'x2' ? '攻撃力2倍' : '攻撃力+' + LIM_BONUS;
const ROBO_IDS = ['souji','turbo','magnet','barrier','bomb','crane','daruma','heat','megaton','recycle','sniper','thief','kobun'];
const SPELL_IDS = ['ebattery','manual','short','repair','swap','thunder','limiter'];
// 不採用カード：デッキには入らないが、ルール・図鑑には残す（新しいものを末尾に足す）
const RETIRED_IDS = ['solar','guard','hack','jammer','rocket'];
// 本体以外で出てくるカード（デッキ外）
const TOKEN_IDS = ['aniki','onemore'];
const DECK_IDS = ROBO_IDS.concat(SPELL_IDS);
const LIFE_MAX = 15, FIELD_MAX = 3, ACTIONS = 2;
const STALL_TURNS = 8; // 両者の山札切れ後、この手番数ダメージが無ければ「互いにダメージを与えられない」とみなす

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

// ---------- 状態 ----------
function newGame(rng, first, opts) {
  opts = opts || {};
  let uid = 0;
  const players = [0, 1].map(pi => {
    const deck = shuffle(DECK_IDS.map(id => ({ uid: uid++, id, owner: pi, bat: 0 })), rng);
    return { life: LIFE_MAX, deck, hand: [], field: [], set: null, scrap: [] };
  });
  const s = {
    players, turn: first, turnNo: 0, actions: ACTIONS,
    phase: 'main', attacked: false, firstTurn: true, eot: [], noAttack: false,
    winner: null, draw: false, stall: 0, lifeSnap: '', pending: null,
    log: opts.log === false ? null : [], v: opts.v || null, uidSeq: 0,
  };
  const v = s.v || {};
  for (const pi of [0, 1]) drawCards(s, pi, 4 + (pi !== first ? (v.secondExtraCards || 0) : 0), true);
  if (v.secondLife) players[1 - first].life = v.secondLife;
  // 後攻は「ワンモア」（行動+1・消費なし）を1枚持って始める
  if (!v.noCoin) players[1 - first].hand.push({ uid: uid++, id: 'onemore', owner: 1 - first, bat: 0 });
  s.uidSeq = uid;
  startTurn(s, true);
  return s;
}

function cloneCard(c) { const o = { uid: c.uid, id: c.id, owner: c.owner, bat: c.bat }; if (c.lim) o.lim = true; if (c.boost) o.boost = c.boost; if (c.home !== undefined) o.home = c.home; return o; }
function clone(s) {
  const players = s.players.map(p => ({
    life: p.life,
    deck: p.deck.map(cloneCard), hand: p.hand.map(cloneCard), field: p.field.map(cloneCard),
    set: p.set ? cloneCard(p.set) : null, scrap: p.scrap.map(cloneCard),
  }));
  return {
    players, turn: s.turn, turnNo: s.turnNo, actions: s.actions, phase: s.phase,
    attacked: s.attacked, firstTurn: s.firstTurn, eot: s.eot.slice(), noAttack: s.noAttack,
    winner: s.winner, draw: s.draw, stall: s.stall, lifeSnap: s.lifeSnap,
    pending: s.pending ? Object.assign({}, s.pending) : null, log: null, v: s.v, uidSeq: s.uidSeq || 0,
  };
}

function log(s, msg, ev) { if (s.log) s.log.push(Object.assign({ msg }, ev || {})); }
function pname(pi) { return pi === 0 ? 'あなた' : 'CPU'; }
function cname(c) { return CARDS[c.id].name; }

// ---------- 参照系 ----------
function atkOf(y) { const c = CARDS[y.id]; const a = c.atk + y.bat + (y.id === 'turbo' ? y.bat : 0) + (y.boost || 0); return y.lim ? (LIM_BONUS === 'x2' ? a * 2 : a + LIM_BONUS) : a; }
// 戦闘時の攻撃力（ロケットロボ＝不採用カードの点火を含む）
function battleAtk(y) { return y.id === 'rocket' && y.bat > 0 ? atkOf(y) - 1 + 4 : atkOf(y); }
// ジャマーロボ（不採用カード）：pi の相手の場に電池入りのジャマーがいれば、pi はアクションを使えない
function isJammed(s, pi) { return s.players[1 - pi].field.some(y => y.id === 'jammer' && y.bat > 0); }
// スナイパーロボの対象：自分以外で場の攻撃力が最も高いロボ（相手の電池入りバリアロボは除く）
function sniperCandidates(s, srcUid) {
  const src = findRobo(s, srcUid); if (!src) return [];
  const all = allField(s).filter(y => y.uid !== srcUid); if (!all.length) return [];
  const mx = Math.max.apply(null, all.map(atkOf));
  return all.filter(y => atkOf(y) === mx && !immuneFrom(y, s, src.pi));
}
// 攻撃対象の制限：電池入りのガードロボがいれば、それ以外は狙えない（不採用カード）
function guardsOf(s, pi) { return s.players[pi].field.filter(y => y.id === 'guard' && y.bat > 0); }
// 電池入りのバリアロボは、相手のカードの効果で選ばれない（選ばない効果＝ボムロボなどは効く）。srcPi＝効果を出した側
function immuneFrom(y, s, srcPi) {
  if (y.id !== 'barrier' || y.bat <= 0) return false;
  const f = findRobo(s, y.uid);
  return !f || f.pi !== srcPi;
}
function findRobo(s, uid) {
  for (let pi = 0; pi < 2; pi++) {
    const f = s.players[pi].field;
    for (let i = 0; i < f.length; i++) if (f[i].uid === uid) return { pi, i, y: f[i] };
  }
  return null;
}
function allField(s) { return s.players[0].field.concat(s.players[1].field); }
function isOver(s) { return s.winner !== null || s.draw; }

// ---------- 基本処理 ----------
function damage(s, pi, n, why) {
  if (n <= 0 || isOver(s)) return;
  s.players[pi].life = Math.max(0, s.players[pi].life - n);
  log(s, `${pname(pi)}に${n}ダメージ${why ? '（' + why + '）' : ''}`, { t: 'damage', pi, n });
  if (s.players[pi].life <= 0) { s.winner = 1 - pi; log(s, `${pname(1 - pi)}の勝利！`, { t: 'win', pi: 1 - pi }); }
}
function drawCards(s, pi, n, silent) {
  const p = s.players[pi]; let k = 0;
  for (let i = 0; i < n; i++) { if (!p.deck.length) break; const c = p.deck.pop(); c.bat = 0; p.hand.push(c); k++; }
  if (!silent) {
    if (k) log(s, `${pname(pi)}はカードを${k}枚引いた`, { t: 'draw', pi, n: k });
    if (k < n) log(s, `${pname(pi)}の山札がない`, { t: 'nodeck', pi });
  }
  return k;
}
// 破壊。byBattle の時はダルマロボの置換が働く。実際に破壊されたら true
function destroy(s, uid, byBattle) {
  const f = findRobo(s, uid); if (!f) return false;
  const y = f.y;
  if (byBattle && y.id === 'daruma' && y.bat > 0) {
    y.bat--;
    log(s, `ダルマロボは電池を1本失って破壊を免れた`, { t: 'daruma', uid });
    return false;
  }
  s.players[f.pi].field.splice(f.i, 1);
  const leftBat = y.bat;
  y.bat = 0; delete y.lim; delete y.home; delete y.boost;
  const G = s.players[y.owner].scrap;
  G.push(y); // アニキロボ（トークン）もスクラップへ行く
  s.eot = s.eot.filter(u => u !== uid);
  log(s, `${cname(y)}が破壊された`, { t: 'destroy', uid, pi: f.pi });
  if (y.id === 'solar' && leftBat > 0) solarPass(s, f.pi, uid, leftBat);
  if (y.id === 'kobun' && s.players[f.pi].field.length < FIELD_MAX) {
    const t = { uid: s.uidSeq++, id: 'aniki', owner: y.owner, bat: 0 };
    s.players[f.pi].field.splice(f.i, 0, t);
    log(s, `アニキロボが現れた！`, { t: 'deploy', pi: f.pi, uid: t.uid, token: true });
  }
  return true;
}
// ソーラーロボ（不採用カード）の遺言：残っていた電池を、同じ場のロボへ攻撃力の高い順（同値は左から）に上限まで移す
function solarPass(s, pi, fromUid, n) {
  const order = s.players[pi].field.map((y, i) => ({ y, i })).sort((a, b) => atkOf(b.y) - atkOf(a.y) || a.i - b.i);
  let moved = 0;
  for (const { y } of order) {
    while (n > 0 && y.bat < CARDS[y.id].max) { y.bat++; n--; moved++; log(s, '', { t: 'batmove', from: fromUid, to: y.uid }); }
    if (n <= 0) break;
  }
  if (moved) log(s, `ソーラーロボの電池が${moved}本、味方のロボに移った`, { t: 'solarpass', pi, n: moved });
}
// リサイクルロボの起動時効果：自分のスクラップの一番新しいアクション（ワンモア以外）を手札へ
function recycleTrigger(s, pi) {
  const G = s.players[pi].scrap;
  for (let i = G.length - 1; i >= 0; i--) if (CARDS[G[i].id].kind === 'spell' && !CARDS[G[i].id].token) {
    const c = G.splice(i, 1)[0]; s.players[pi].hand.push(c);
    log(s, `リサイクルロボの効果で${cname(c)}が手札に戻った`, { t: 'recycle', pi, id: c.id });
    return;
  }
}
// ドロボの起動時効果：相手の電池入りロボのうち攻撃力最大（同値は左）から1本奪う
function thiefTrigger(s, pi, uid) {
  const me = findRobo(s, uid); if (!me) return;
  const c = s.players[1 - pi].field.filter(y => y.bat > 0);
  if (!c.length || me.y.bat >= CARDS[me.y.id].max) return;
  const mx = Math.max.apply(null, c.map(atkOf)), t = c.find(y => atkOf(y) === mx && !immuneFrom(y, s, pi));
  if (!t) { log(s, 'ドロボは電池を奪えなかった（バリアロボ）', { t: 'fizzle' }); return; }
  t.bat--; me.y.bat++;
  log(s, `ドロボが${cname(t)}の電池を1本奪った`, { t: 'batmove', from: t.uid, to: uid });
}
// 整備マニュアルで電池を入れられる自分のロボ
function maintTargets(s, pi) { return s.players[pi].field.filter(y => y.bat < CARDS[y.id].max); }
function placeBat(s, y, n) { // 置ける分だけ置く。置いた数を返す
  const room = CARDS[y.id].max - y.bat;
  const k = Math.max(0, Math.min(n, room));
  y.bat += k; return k;
}
function deploy(s, pi, card, how) {
  card.bat = 0; s.players[pi].field.push(card);
  log(s, `${pname(pi)}は${cname(card)}を${how || '起動'}した`, { t: 'deploy', pi, uid: card.uid });
  const eh = CARDS[card.id].enterBat || 0;
  if (eh) { const k = placeBat(s, card, eh); if (k) log(s, `${cname(card)}は電池を${k}本入れて起動した`, { t: 'enterbat', pi, uid: card.uid }); }
  // 起動時効果。アクションの処理中に起動した場合は、そのアクションがスクラップに置かれてから発動する
  const trig = card.id === 'recycle' ? () => recycleTrigger(s, pi) : card.id === 'thief' ? () => thiefTrigger(s, pi, card.uid) : null;
  if (trig) { if (s.resolving) (s.deferred = s.deferred || []).push(trig); else trig(); }
  if (card.id === 'megaton' && s.turn === pi && !isOver(s)) {
    s.noAttack = true; log(s, `メガトンロボの効果：この手番、${pname(pi)}のロボは攻撃できない`, { t: 'megaton', pi });
  }
}

// ---------- 手番 ----------
function startTurn(s, isFirst) {
  s.turnNo++;
  s.actions = ACTIONS; s.phase = 'main'; s.attacked = false; s.noAttack = false; s.eot = []; s.pending = null;
  s.firstTurn = !!isFirst;
  const pi = s.turn;
  log(s, `―― ${pname(pi)}の手番（${s.turnNo}） ――`, { t: 'turn', pi });
  for (const y of s.players[pi].field.slice()) {
    if (y.id === 'heat') damage(s, pi, 2, 'ヒートロボ');
    if (isOver(s)) return;
    if (y.id === 'solar' && placeBat(s, y, 1)) log(s, `ソーラーロボに電池が1本入った`, { t: 'solar', pi, uid: y.uid });
  }
  const v = s.v || {};
  if (s.turnNo === 1 && v.firstActions) s.actions = v.firstActions;
  if (s.turnNo === 2 && v.secondExtraAction) s.actions += v.secondExtraAction;
  if (!(s.turnNo === 1 && v.firstNoDraw)) drawCards(s, pi, 1);
}
function endTurn(s) {
  if (isOver(s)) return;
  resolveEot(s);
  if (isOver(s)) return;
  // 膠着判定
  const P = s.players;
  const snap = P[0].life + ',' + P[1].life;
  if (!P[0].deck.length && !P[1].deck.length) {
    s.stall = (snap === s.lifeSnap) ? s.stall + 1 : 0;
  }
  s.lifeSnap = snap;
  if (s.stall >= STALL_TURNS || s.turnNo >= 120) {
    if (P[0].life === P[1].life) { s.draw = true; log(s, '互いにダメージを与えられない：引き分け', { t: 'tie' }); }
    else { s.winner = P[0].life > P[1].life ? 0 : 1; log(s, `互いにダメージを与えられない：ライフの多い${pname(s.winner)}の勝利`, { t: 'win', pi: s.winner }); }
    return;
  }
  s.turn = 1 - s.turn;
  startTurn(s, false);
}
function resolveEot(s) {
  for (const p of s.players) for (const y of p.field) delete y.boost;
  const list = s.eot.slice(); s.eot = [];
  for (const uid of list) {
    const f = findRobo(s, uid);
    if (f) { log(s, f.y.lim ? 'リミッター解除の反動' : 'ボムロボの効果が発動', { t: 'bomb' }); destroy(s, uid, false); }
  }
  // ハッキング（不採用カード）で奪ったロボを持ち主の場へ戻す
  for (const pi of [0, 1]) for (const y of s.players[pi].field.slice()) {
    if (y.home === undefined || y.home === pi) { delete y.home; continue; }
    const from = s.players[pi].field, to = s.players[y.home].field;
    from.splice(from.indexOf(y), 1);
    if (to.length < FIELD_MAX) { to.push(y); log(s, `${cname(y)}は${pname(y.home)}の場に戻った`, { t: 'hackback', uid: y.uid, pi: y.home }); delete y.home; }
    else { from.push(y); delete y.home; destroy(s, y.uid, false); }
  }
}

// ---------- 行動 ----------
// action = {t:'play', uid, ch} | {t:'place', target} | {t:'release', src, ch} | {t:'set', uid}
//          | {t:'attack', att, tgt('player'|uid)} | {t:'end'}
function locateOwnCard(s, pi, uid) {
  const p = s.players[pi];
  const hi = p.hand.findIndex(c => c.uid === uid);
  if (hi >= 0) return { from: 'hand', i: hi, c: p.hand[hi] };
  if (p.set && p.set.uid === uid) return { from: 'set', c: p.set };
  return null;
}

function canAct(s) { return !isOver(s) && s.phase === 'main' && s.actions > 0 && !s.pending; }

// 合法性チェック。不正なら理由文字列、合法なら null
function checkAction(s, a) {
  if (isOver(s)) return 'ゲームは終了しています';
  const pi = s.turn, P = s.players[pi], O = s.players[1 - pi];
  if (a.t === 'end') return s.pending ? '攻撃処理中です' : null;
  if (a.t === 'attack') {
    if (s.pending) return '攻撃処理中です';
    if (s.firstTurn) return '先攻の最初の手番は攻撃できません';
    if (s.attacked) return 'この手番はすでに攻撃しました';
    if (s.noAttack) return 'メガトンロボの効果で攻撃できません';
    const f = findRobo(s, a.att); if (!f || f.pi !== pi) return '攻撃するロボがいません';
    if (O.field.length) {
      const t = findRobo(s, a.tgt); if (!t || t.pi !== 1 - pi) return '相手の場のロボを選んでください';
      const gs = guardsOf(s, 1 - pi); if (gs.length && !gs.includes(t.y)) return 'ガードロボがいるので、先にガードロボを攻撃してください';
    }
    else if (a.tgt !== 'player') return '相手プレイヤーを攻撃します';
    return null;
  }
  if (a.t === 'battle') {
    if (s.pending) return '攻撃処理中です';
    if (s.phase !== 'main') return 'すでにバトルフェイズです';
    if (s.firstTurn) return '先攻の最初の手番は攻撃できません';
    if (s.noAttack) return 'メガトンロボの効果でこの手番は攻撃できません';
    if (!P.field.length) return '攻撃できるロボがいません';
    return null;
  }
  if (a.t === 'play') {
    const L0 = locateOwnCard(s, pi, a.uid);
    if (L0 && CARDS[L0.c.id].kind === 'spell' && isJammed(s, pi)) return 'ジャマーロボがいるので、アクションを使えません';
    if (L0 && CARDS[L0.c.id].noCost) {
      if (s.pending) return '攻撃処理中です';
      if (s.phase !== 'main') return 'バトルフェイズ中は使えません';
      return null;
    }
  }
  if (!canAct(s)) return s.phase === 'battle' ? 'バトルフェイズ中はメインの行動はできません' : s.actions <= 0 ? 'この手番の行動は使い切りました' : 'いまは行動できません';
  if (a.t === 'place') {
    const f = findRobo(s, a.target); if (!f || f.pi !== pi) return '自分のロボを選んでください';
    if (f.y.bat >= CARDS[f.y.id].max) return '電池の上限です';
    return null;
  }
  if (a.t === 'set') {
    if (P.set) return 'すでにアクションをセットしています';
    const c = P.hand.find(c => c.uid === a.uid); if (!c || CARDS[c.id].kind !== 'spell') return '手札のアクションを選んでください';
    if (CARDS[c.id].noSet) return 'このカードはセットできません';
    return null;
  }
  if (a.t === 'play') {
    const L = locateOwnCard(s, pi, a.uid); if (!L) return 'そのカードはプレイできません';
    const def = CARDS[L.c.id];
    if (def.kind === 'robo') { if (P.field.length >= FIELD_MAX) return '場のロボは3体までです'; return null; }
    return checkSpell(s, pi, L.c.id, a.ch || {});
  }
  if (a.t === 'release') {
    const f = findRobo(s, a.src); if (!f || f.pi !== pi) return '自分のロボを選んでください';
    if (CARDS[f.y.id].eff !== 'release') return '放電効果を持っていません';
    if (f.y.bat <= 0) return '電池が入っていません';
    const ch = a.ch || {};
    if (f.y.id === 'souji') { if (ch.pi !== 0 && ch.pi !== 1) return '対象を選んでください'; if (!s.players[ch.pi].set) return 'セットされたアクションがありません'; }
    if (f.y.id === 'magnet') { const t = findRobo(s, ch.target); if (!t || t.pi !== 1 - pi) return '相手のロボを選んでください'; if (immuneFrom(t.y, s, pi)) return 'そのロボは相手のカードの効果を受けません'; }
    if (f.y.id === 'sniper') { if (!sniperCandidates(s, f.y.uid).some(y => y.uid === ch.target)) return '場で最も攻撃力の高いロボを選んでください'; }
    return null;
  }
  return '不明な行動';
}

// ハッキング（不採用カード）の対象：相手の場で最も攻撃力の高いロボ（選ばれないロボは除く）
function hackCandidates(s, pi) {
  const O = s.players[1 - pi].field; if (!O.length) return [];
  const mx = Math.max(...O.map(atkOf));
  return O.filter(y => atkOf(y) === mx && !immuneFrom(y, s, pi));
}
function thunderCandidates(s, pi) {
  const all = allField(s); if (!all.length) return [];
  const mx = Math.max.apply(null, all.map(atkOf));
  return all.filter(y => atkOf(y) === mx && !immuneFrom(y, s, pi));
}
function checkSpell(s, pi, id, ch) {
  switch (id) {
    case 'ebattery': return null;
    case 'manual': {
      // 電池を入れられる自分のロボがいれば、1体選ぶ（いなければ引くだけ）
      const ok = maintTargets(s, pi);
      if (ok.length && !ok.some(y => y.uid === ch.target)) return '電池を入れる自分のロボを選んでください';
      return null;
    }
    case 'onemore': return null;
    case 'short': {
      const t = ch.targets || [];
      if (!t.length || t.length > 2 || new Set(t).size !== t.length) return '対象を1〜2体選んでください';
      for (const u of t) { const f = findRobo(s, u); if (!f || f.y.bat <= 0 || immuneFrom(f.y, s, pi)) return '電池が入ったロボを選んでください'; }
      return null;
    }
    case 'repair': {
      if (s.players[pi].field.length >= FIELD_MAX) return '場のロボは3体までです';
      const g = s.players[ch.gpi]; if (!g) return 'スクラップのロボを選んでください';
      const c = g.scrap.find(c => c.uid === ch.uid); if (!c || CARDS[c.id].kind !== 'robo') return 'スクラップのロボを選んでください';
      return null;
    }
    case 'swap': {
      const a = findRobo(s, ch.from), b = findRobo(s, ch.to);
      if (!a || !b || a.y.uid === b.y.uid) return '移動元と移動先を選んでください';
      if (a.y.bat <= 0 || immuneFrom(a.y, s, pi)) return '移動元に動かせる電池がありません';
      if (immuneFrom(b.y, s, pi) || b.y.bat >= CARDS[b.y.id].max) return '移動先に入れられません';
      return null;
    }
    case 'thunder': {
      const c = thunderCandidates(s, pi); if (!c.some(y => y.uid === ch.target)) return '最も攻撃力の高いロボを選んでください';
      return null;
    }
    case 'hack': {
      if (s.players[pi].field.length >= FIELD_MAX) return '自分の場がいっぱいです';
      if (!hackCandidates(s, pi).some(y => y.uid === ch.target)) return '相手の場で最も攻撃力の高いロボを選んでください';
      return null;
    }
    case 'limiter': {
      const t = findRobo(s, ch.target); if (!t) return 'ロボを選んでください';
      if (immuneFrom(t.y, s, pi)) return 'そのロボはアクションの効果を受けません';
      return null;
    }
  }
  return null;
}

// アクション効果の解決（キャスターpi）
function resolveSpell(s, pi, card, ch) {
  ch = ch || {};
  log(s, `${pname(pi)}は${cname(card)}を発動した`, { t: 'spell', pi, id: card.id });
  s.resolving = true; s.deferred = [];
  switch (card.id) {
    case 'ebattery': {
      let n = 0;
      for (const u of (ch.targets || []).slice(0, 2)) {
        const f = findRobo(s, u); if (!f || immuneFrom(f.y, s, pi)) continue;
        const k = placeBat(s, f.y, 1); n += k;
        if (k) log(s, '', { t: 'batfly', uid: f.y.uid });
      }
      log(s, `電池を${n}本入れた`, { t: 'bat' });
      break;
    }
    case 'manual': {
      drawCards(s, pi, 2);
      const t = findRobo(s, ch.target);
      if (t && t.pi === pi && placeBat(s, t.y, 1)) log(s, `${cname(t.y)}に電池を入れた`, { t: 'batfly', uid: t.y.uid });
      break;
    }
    case 'onemore': s.actions += 1; log(s, `${pname(pi)}の行動が1回増えた`, { t: 'extraact', pi }); break;
    case 'short': {
      for (const u of (ch.targets || [])) {
        const f = findRobo(s, u); if (!f || f.y.bat <= 0 || immuneFrom(f.y, s, pi)) continue;
        const k = f.y.bat; f.y.bat = 0;
        log(s, `${cname(f.y)}の電池が${k}本外れた`, { t: 'short', uid: u, n: k });
      }
      break;
    }
    case 'repair': {
      if (s.players[pi].field.length >= FIELD_MAX) break;
      const g = s.players[ch.gpi]; if (!g) break;
      const i = g.scrap.findIndex(c => c.uid === ch.uid); if (i < 0) break;
      const c = g.scrap.splice(i, 1)[0]; deploy(s, pi, c, 'スクラップから起動');
      break;
    }
    case 'swap': {
      const a = findRobo(s, ch.from), b = findRobo(s, ch.to);
      if (a && b && a.y.bat > 0 && !immuneFrom(a.y, s, pi) && !immuneFrom(b.y, s, pi) && b.y.bat < CARDS[b.y.id].max) {
        a.y.bat--; b.y.bat++; log(s, `${cname(a.y)}の電池を${cname(b.y)}に移した`, { t: 'batmove', from: a.y.uid, to: b.y.uid });
      }
      break;
    }
    case 'thunder': {
      const c = thunderCandidates(s, pi).find(y => y.uid === ch.target);
      if (c) destroy(s, c.uid, false); else log(s, '対象がいない', { t: 'fizzle' });
      break;
    }
    case 'hack': {
      const t = findRobo(s, ch.target);
      if (t && hackCandidates(s, pi).includes(t.y) && s.players[pi].field.length < FIELD_MAX) {
        s.players[t.pi].field.splice(t.i, 1);
        if (t.y.home === pi) delete t.y.home; else if (t.y.home === undefined) t.y.home = t.pi;
        s.players[pi].field.push(t.y);
        log(s, `${cname(t.y)}を乗っ取った`, { t: 'hack', pi, uid: t.y.uid });
      } else log(s, '対象がいない', { t: 'fizzle' });
      break;
    }
    case 'limiter': {
      const t = findRobo(s, ch.target);
      if (t && !immuneFrom(t.y, s, pi)) {
        t.y.lim = true; if (!s.eot.includes(t.y.uid)) s.eot.push(t.y.uid);
        log(s, `${cname(t.y)}のリミッターが外れた（攻撃力${atkOf(t.y)}）`, { t: 'limiter', uid: t.y.uid });
      } else log(s, '対象がいない', { t: 'fizzle' });
      break;
    }
  }
  card.bat = 0; s.players[card.owner].scrap.push(card);
  // アクションの処理が終わってから、途中で起きた起動時効果を処理する
  const later = s.deferred || []; s.resolving = false; s.deferred = [];
  for (const f of later) f();
}

function apply(s, a) {
  const err = checkAction(s, a);
  if (err) throw new Error(err);
  const pi = s.turn, P = s.players[pi], O = s.players[1 - pi];
  switch (a.t) {
    case 'end': endTurn(s); return;
    case 'battle': s.phase = 'battle'; log(s, `${pname(pi)}はバトルフェイズに入った`, { t: 'phase', pi }); return;
    case 'attack': declareAttack(s, a.att, a.tgt); return;
    case 'place': {
      const f = findRobo(s, a.target); placeBat(s, f.y, 1); s.actions--;
      log(s, `${pname(pi)}は${cname(f.y)}に電池を入れた`, { t: 'place', pi, uid: f.y.uid });
      return;
    }
    case 'set': {
      const i = P.hand.findIndex(c => c.uid === a.uid); P.set = P.hand.splice(i, 1)[0]; s.actions--;
      log(s, `${pname(pi)}はアクションをセットした`, { t: 'set', pi });
      return;
    }
    case 'play': {
      const L = locateOwnCard(s, pi, a.uid);
      if (!CARDS[L.c.id].noCost) s.actions--;
      if (L.from === 'hand') P.hand.splice(L.i, 1); else P.set = null;
      if (CARDS[L.c.id].kind === 'robo') deploy(s, pi, L.c, '起動');
      else resolveSpell(s, pi, L.c, a.ch);
      return;
    }
    case 'release': {
      const f = findRobo(s, a.src);
      f.y.bat--;
      s.actions--;
      log(s, `${pname(pi)}は${cname(f.y)}の放電効果を使った`, { t: 'release', pi, uid: f.y.uid });
      if (f.y.id === 'souji') {
        const tp = s.players[a.ch.pi]; const c = tp.set; tp.set = null; c.bat = 0; s.players[c.owner].scrap.push(c);
        log(s, `セットされていた${cname(c)}を破壊した`, { t: 'setdestroy', pi: a.ch.pi, id: c.id });
      } else if (f.y.id === 'magnet') {
        const t = findRobo(s, a.ch.target);
        const my = f.y, th = t.y;
        P.field[f.i] = th; O.field[t.i] = my;
        log(s, `マグネットロボと${cname(th)}を入れ替えた`, { t: 'swap', pi });
      } else if (f.y.id === 'sniper') {
        destroy(s, a.ch.target, false);
      }
      return;
    }
  }
}

// ---------- 戦闘 ----------
function declareAttack(s, att, tgt) {
  if (s.phase === 'main') log(s, `${pname(s.turn)}はバトルフェイズに入った`, { t: 'phase', pi: s.turn });
  s.phase = 'battle'; s.attacked = true;
  s.pending = { att, tgt };
  const A = findRobo(s, att).y;
  const tn = tgt === 'player' ? pname(1 - s.turn) : cname(findRobo(s, tgt).y);
  log(s, `${cname(A)}が${tn}に攻撃！`, { t: 'attack', pi: s.turn, att, tgt });
}
// 防御側がセットアクションで応答できるか
function needsResponse(s) { return !!(s.pending && s.players[1 - s.turn].set && !isJammed(s, 1 - s.turn)); }
function respondChoiceError(s, ch) {
  const di = 1 - s.turn, c = s.players[di].set; if (!c) return 'セットされていません';
  return checkSpell(s, di, c.id, ch || {});
}
// resp: null (発動しない) or {ch}
function respond(s, resp) {
  const di = 1 - s.turn, D = s.players[di];
  if (resp && D.set) {
    const c = D.set; D.set = null;
    log(s, `${pname(di)}はセットした${cname(c)}を表にした！`, { t: 'reveal', pi: di, id: c.id });
    resolveSpell(s, di, c, resp.ch);
  }
  resolveBattle(s);
}
function resolveBattle(s) {
  const p = s.pending; s.pending = null;
  if (!p || isOver(s)) return;
  const pi = s.turn, di = 1 - pi, D = s.players[di];
  const af = findRobo(s, p.att);
  if (!af || af.pi !== pi) { log(s, '攻撃したロボがいなくなり、攻撃は中止された', { t: 'cancel' }); return; }
  let tgt = p.tgt;
  if (tgt === 'player' && D.field.length) { tgt = D.field[D.field.length - 1].uid; log(s, `攻撃対象が${cname(D.field[D.field.length - 1])}に変更された`, { t: 'retarget' }); }
  const A = af.y;
  if (tgt === 'player') { log(s, '', { t: 'direct', att: A.uid, pi: di }); damage(s, di, atkOf(A), '直接攻撃'); return; }
  const tf = findRobo(s, tgt);
  if (!tf || tf.pi !== di) { log(s, '攻撃対象がいなくなり、攻撃は中止された', { t: 'cancel' }); return; }
  const T = tf.y;
  // ロケットロボ（不採用カード）：戦闘時に電池を1本使って攻撃力+4、持ち主（今の場の側）に3ダメージ
  for (const [y, side] of [[A, pi], [T, di]]) if (y.id === 'rocket' && y.bat > 0) {
    y.bat--; y.boost = (y.boost || 0) + 4;
    log(s, `ロケットロボが点火！（攻撃力${atkOf(y)}）`, { t: 'rocket', uid: y.uid });
    damage(s, side, 3, 'ロケットロボの反動');
  }
  if (isOver(s)) return;
  const a = atkOf(A), d = atkOf(T);
  const aCho = A.id === 'bomb' && A.bat > 0, dCho = T.id === 'bomb' && T.bat > 0;
  const aRok = A.id === 'crane' && A.bat > 0, dRok = T.id === 'crane' && T.bat > 0;
  log(s, `戦闘：${cname(A)}(${a}) vs ${cname(T)}(${d})`, { t: 'battle', a, d, att: A.uid, tgt: T.uid });
  if (a > d) {
    const k = destroy(s, T.uid, true);
    if (k && aRok) { log(s, 'クレーンロボの効果', { t: 'crane' }); drawCards(s, pi, 1); }
    damage(s, di, a - d, '戦闘');
  } else if (d > a) {
    const k = destroy(s, A.uid, true);
    if (k && dRok) { log(s, 'クレーンロボの効果', { t: 'crane' }); drawCards(s, di, 1); }
    damage(s, pi, d - a, '戦闘');
  } else {
    const k1 = destroy(s, T.uid, true), k2 = destroy(s, A.uid, true);
    if (k1 && aRok) { log(s, 'クレーンロボの効果', { t: 'crane' }); drawCards(s, pi, 1); }
    if (k2 && dRok) { log(s, 'クレーンロボの効果', { t: 'crane' }); drawCards(s, di, 1); }
  }
  delete A.boost; delete T.boost;
  // ボムロボは対象を選ばない効果なので、バリアロボにも効く
  if (aCho && findRobo(s, T.uid)) s.eot.push(T.uid);
  if (dCho && findRobo(s, A.uid)) s.eot.push(A.uid);
}
// シミュレーション用：攻撃～応答～解決を一括
function attackFull(s, att, tgt, resp) {
  apply(s, { t: 'attack', att, tgt });
  if (needsResponse(s)) respond(s, resp); else resolveBattle(s);
}

// 整合性チェック（テスト用）
function invariant(s) {
  let bat = 0, n = 0;
  const real = arr => arr.filter(c => !CARDS[c.id].token).length;
  for (const p of s.players) { for (const y of p.field) bat += y.bat; n += real(p.deck) + real(p.hand) + real(p.field) + real(p.scrap) + (p.set && !CARDS[p.set.id].token ? 1 : 0); }
  if (n !== DECK_IDS.length * 2) throw new Error('card count ' + n);
  for (const p of s.players) { if (p.field.length > 3) throw new Error('field>3'); for (const y of p.field) if (y.bat > CARDS[y.id].max) throw new Error('bat>max'); }
}

const api = { maintTargets, battleAtk, LIM_BONUS, LIM_LABEL, RETIRED_IDS, TOKEN_IDS, isJammed, sniperCandidates, guardsOf, hackCandidates, CARDS, ROBO_IDS, SPELL_IDS, DECK_IDS, LIFE_MAX, FIELD_MAX,
  mulberry32, shuffle, newGame, clone, atkOf, immuneFrom, findRobo, allField, isOver,
  checkAction, checkSpell, thunderCandidates, apply, needsResponse, respond, respondChoiceError, resolveBattle,
  attackFull, endTurn, resolveEot, invariant, pname, cname };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
