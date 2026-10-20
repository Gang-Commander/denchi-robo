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
  hack:    { id:'hack',    name:'ハッキング', kind:'spell', rare:true, text:'相手の場で最も攻撃力の高いロボを1体選ぶ。この手番の終わりまで、そのロボは自分の場で自分のロボとして動く（攻撃もできる）。手番終了時に持ち主の場へ戻る。' },
  limiter: { id:'limiter', name:'リミッター解除', kind:'spell', text:'場のロボを1体選ぶ。この手番の間、そのロボの攻撃力を@LIM@にする。手番終了時に、そのロボは破壊される。' },
  ebattery:    { id:'ebattery',    name:'非常用電池', kind:'spell', text:'場のロボを選び、電池を2本まで好きなように入れる。' },
  manual: { id:'manual', name:'整備マニュアル', kind:'spell', text:'山札を2枚引く。そのあと、自分の場のロボを1体選び、電池を1本入れる。' },
  short:    { id:'short',    name:'ショート',   kind:'spell', text:'電池が入ったロボを2体まで選び、その電池をすべて外す。外した電池1本につき、そのロボに1ダメージを与える。' },
  repair:    { id:'repair',    name:'リペアキット', kind:'spell', text:'自分か相手のスクラップのロボを1体選び、自分の場で起動する。' },
  swap:    { id:'swap',    name:'電池交換',   kind:'spell', text:'場のロボを2体選び、1体目の電池を1本、2体目に移す。' },
  onemore: { id:'onemore', name:'ワンモア',   kind:'spell', token:true, noSet:true, noCost:true, text:'後攻が最初から持つ特別なアクション。この手番の行動を1回増やす。使うのに行動を消費しない。セットはできない。' },
  thunder:    { id:'thunder',    name:'かみなり',   kind:'spell', text:'場で最も攻撃力の高いロボを、1体選び破壊する。' },
  // ---- 2026-10 追加ロボ ----
  sniper:  { id:'sniper',  name:'スナイパーロボ', kind:'robo', atk:2, max:1, eff:'release', text:'【放電】このロボ以外で、場で最も攻撃力の高いロボを1体選び、破壊する。', enterBat:1 },
  rocket:  { id:'rocket',  name:'ロケットロボ',   kind:'robo', atk:1, max:1, eff:'const',   text:'【常時】このロボが戦闘する時（攻撃した時も、攻撃された時も）、自分が4ダメージを受けて、その戦闘の間だけ攻撃力を+5してよい。' },
  jammer:  { id:'jammer',  name:'ジャマーロボ',   kind:'robo', atk:2, max:2, eff:'powered', text:'【通電中】お互いにアクションを使えない（伏せ札を表にすることもできない。伏せることはできる）。' },
  thief:   { id:'thief',   name:'ドロボ',   kind:'robo', atk:2, max:2, eff:'const',   text:'【常時】このロボを起動した時、相手の場の電池が入っているロボのうち、最も攻撃力の高いロボを1体選び、その電池を1本このロボに移す。' },
  kobun:  { id:'kobun',  name:'コブンロボ',   kind:'robo', atk:2, max:1, eff:'const', spawn:'aniki', text:'【常時】このロボが破壊された時、自分の場に「アニキロボ」を出す。' },
  aniki:   { id:'aniki',   name:'アニキロボ',     kind:'robo', atk:4, max:3, eff:'none',    token:true, text:'コブンロボが破壊された時に出るロボ（デッキには入らない）。' },
};
// ----- ローグライト用の新カード -----
// pick：対象の選び方（エンジンの合法性チェック・CPUの選択肢・画面の対象選択がすべてここを見る）
//   side: 'own'|'opp'|'any'  cond: 'room'(電池を入れられる) | 'bat'(電池が入っている)  maxAtk: この攻撃力以下だけ
//   notSelf: 自分自身は選べない  optional: 選べる対象がいなければ対象なしで使える  player: 相手プレイヤーも選べる
//   zone: 'scrap'＝自分のスクラップのロボから選ぶ
Object.assign(CARDS, {
  // 充電
  charge:  { id:'charge',  name:'チャージロボ',   kind:'robo', atk:2, max:2, eff:'const', kw:['full'], text:'【満充電】このロボの攻撃力+2。' },
  dynamo:  { id:'dynamo',  name:'ダイナモロボ',   kind:'robo', atk:2, max:2, eff:'release', text:'【放電】自分の別のロボを1体選び、電池を2本入れる。',
             pick:{ side:'own', cond:'room', notSelf:true, prompt:'電池を2本入れる自分のロボを選ぶ', none:'電池を入れられる自分の別のロボがいません' } },
  gigant:  { id:'gigant',  name:'ギガントロボ',   kind:'robo', atk:5, max:1, eff:'const', rare:true, afterAttackBat:1, text:'【常時】電池が入っていない間、このロボは攻撃できない。このロボが攻撃したら、戦闘のあとで電池を1本外す。' },
  // 解体
  drill:   { id:'drill',   name:'ドリルロボ',     kind:'robo', atk:3, max:2, eff:'powered', text:'【通電中】このロボが攻撃した時、戦闘の前に相手のロボの電池を1本外す。' },
  hammer:  { id:'hammer',  name:'ハンマー',       kind:'spell', text:'攻撃力4以下のロボを1体選び、破壊する。',
             pick:{ side:'any', maxAtk:4, prompt:'破壊するロボを選ぶ（攻撃力4以下）', none:'攻撃力4以下のロボがいません' } },
  emp:     { id:'emp',     name:'EMP',            kind:'spell', text:'相手の場のロボすべてから、電池を1本ずつ外す（選ばない効果）。' },
  // スクラップ
  reboot:  { id:'reboot',  name:'リブートロボ',   kind:'robo', atk:3, max:2, eff:'const', text:'【常時】このロボが破壊された時、スクラップではなく持ち主の手札に戻る。' },
  parts:   { id:'parts',   name:'部品取り',       kind:'spell', salvage:true, text:'自分のロボを1体選んで破壊し、山札を3枚引く。破壊したロボの電池は、自分の場のロボに移す（攻撃力の高い順）。',
             pick:{ side:'own', prompt:'部品を取る（破壊する）自分のロボを選ぶ', none:'自分の場にロボがいません' } },
  junk:    { id:'junk',    name:'ジャンク回収',   kind:'spell', text:'自分のスクラップから、ロボを1枚とアクションを1枚選び、手札に戻す（ワンモアは除く）。' },
  gattai:  { id:'gattai',  name:'ガッタイロボ',   kind:'robo', atk:3, max:3, eff:'const', rare:true, text:'【常時】このロボを起動した時、自分のスクラップにあるロボの数だけ、このロボに電池を入れる。' },
  press:   { id:'press',   name:'プレスロボ',     kind:'robo', atk:4, max:1, eff:'const', rare:true, text:'【常時】このロボを起動した時、お互いに、自分の場で攻撃力が一番低いロボを1体破壊する（このロボも含む。同じなら左のロボ。選ばない効果）。' },
  proto:   { id:'proto',   name:'プロトロボ',     kind:'robo', atk:2, max:1, eff:'const', spawn:'normal', text:'【常時】このロボが破壊された時、自分の場に「ノーマルロボ」を1枚出す（新しく出たカードは、そのあと普通のカードとして扱う）。' },
  // 防衛
  wall:    { id:'wall',    name:'ウォールロボ',   kind:'robo', atk:5, max:0, eff:'const', text:'【常時】このロボは攻撃できない。' },
  medic:   { id:'medic',   name:'メディックロボ', kind:'robo', atk:2, max:2, eff:'release', enterBat:1, text:'【放電】自分のライフを2回復する（上限を超えてよい）。' },
  fortress:{ id:'fortress',name:'フォートレスロボ', kind:'robo', atk:3, max:2, eff:'powered', rare:true, text:'【通電中】自分の別のロボが戦闘で破壊される時、代わりにそのロボの電池を1本外す。' },
  // 暴走
  bakushin:{ id:'bakushin',name:'バクシンロボ',   kind:'robo', atk:2, max:1, eff:'const', enterBat:1, onAttack:{ ping:1 }, text:'【常時】このロボが攻撃した時、戦闘の前に相手に1ダメージを与える。' },
  kajiba:  { id:'kajiba',  name:'カジバロボ',     kind:'robo', atk:2, max:2, eff:'const', text:'【常時】自分のライフが5以下の間、このロボの攻撃力+3。' },
  runaway: { id:'runaway', name:'暴走プログラム', kind:'spell', text:'自分のロボを1体選ぶ。この手番の間、そのロボの攻撃力+2。自分は2ダメージを受ける。',
             pick:{ side:'own', prompt:'暴走させる自分のロボを選ぶ（攻撃力+2）', none:'自分の場にロボがいません' } },
  spark:   { id:'spark',   name:'スパークボム',   kind:'spell', text:'自分は2ダメージを受ける。相手か、ロボを1体選び、3ダメージを与える。',
             pick:{ side:'any', player:true, prompt:'3ダメージを与えるロボを選ぶ', none:'' } },
  overload:{ id:'overload',name:'オーバーロード', kind:'spell', rare:true, text:'この手番の行動を2回増やす。手番終了時、自分は4ダメージを受ける。' },
  // 共通
  scout:   { id:'scout',   name:'スカウトロボ',   kind:'robo', atk:1, max:1, eff:'const', enterBat:1, text:'【常時】このロボを起動した時、山札を1枚引く。' },
  socket:  { id:'socket',  name:'ソケットロボ',   kind:'robo', atk:1, max:4, eff:'const', text:'【常時】このロボに「電池を入れる」行動をした時、電池が2本入る。' },
  warp:    { id:'warp',    name:'ワープ装置',     kind:'spell', text:'自分のロボを1体選び、手札に戻す（電池は外れる）。攻撃されているロボを戻した場合、その攻撃は中止になる。',
             pick:{ side:'own', prompt:'手札に戻す自分のロボを選ぶ', none:'自分の場にロボがいません' } },
  batpack: { id:'batpack', name:'電池パック',     kind:'spell', text:'自分のロボを1体選び、電池を1本入れる。山札を1枚引く。',
             pick:{ side:'own', cond:'room', optional:true, prompt:'電池を入れる自分のロボを選ぶ', none:'' } },
  leak:    { id:'leak',    name:'漏電',           kind:'spell', text:'電池が入ったロボを1体選び、その電池をすべて外す。',
             pick:{ side:'any', cond:'bat', prompt:'電池をすべて外すロボを選ぶ', none:'電池が入ったロボがいません' } },
  copy:    { id:'copy',    name:'コピーロボ',     kind:'robo', atk:0, max:1, eff:'const', rare:true, text:'【常時】このロボを起動した時、場のロボを1体選ぶ。このロボの元の攻撃力は、その時のそのロボの攻撃力（修正込み）になる。',
             deployPick:{ side:'any', optional:true, prompt:'コピーするロボを選ぶ', none:'' } },
  // 基本カード（ランの最初のデッキ用）
  normal:  { id:'normal',  name:'ノーマルロボ',   kind:'robo', atk:2, max:3, eff:'const', onAttack:{ atk:1 }, text:'【常時】このロボが攻撃した時、その戦闘の間、攻撃力+1。' },
  mini:    { id:'mini',    name:'ミニロボ',       kind:'robo', atk:1, max:3, eff:'none', enterBat:1, text:'効果なし。' },
  garakuta:{ id:'garakuta',name:'ガラクタロボ',   kind:'robo', atk:2, max:2, eff:'const', text:'【常時】このロボが破壊された時、山札を1枚引く。' },
  drycell: { id:'drycell', name:'乾電池',         kind:'spell', text:'自分のロボを1体選び、電池を1本入れる。',
             pick:{ side:'own', cond:'room', prompt:'電池を入れる自分のロボを選ぶ', none:'電池を入れられる自分のロボがいません' } },
  static:  { id:'static',  name:'静電気',         kind:'spell', text:'相手の電池が入ったロボを1体選び、電池を1本外す。',
             pick:{ side:'opp', cond:'bat', prompt:'電池を1本外す相手のロボを選ぶ', none:'電池が入った相手のロボがいません' } },
});
for (const id of ['megaton','thunder','kobun','limiter']) CARDS[id].rare = true;
// テーマ（ローグライトの報酬の出どころ）。basic は最初のデッキ専用
const THEMES = {
  charge:   { name:'充電',       ids:['turbo','megaton','ebattery','manual','charge','dynamo','gigant','solar'] },
  demolish: { name:'解体',       ids:['thunder','sniper','short','souji','magnet','drill','hammer','emp'] },
  scrap:    { name:'スクラップ', ids:['recycle','repair','kobun','crane','reboot','parts','junk','gattai','hack','press','proto'] },
  defense:  { name:'防衛',       ids:['barrier','daruma','bomb','wall','medic','fortress','guard','jammer'] },
  rampage:  { name:'暴走',       ids:['heat','limiter','bakushin','kajiba','runaway','spark','overload','rocket'] },
  common:   { name:'共通',       ids:['swap','thief','scout','socket','warp','batpack','leak','copy'] },
};
const BASIC_DECK = ['normal','normal','normal','mini','mini','garakuta','drycell','drycell','static','static'];
const BASIC_IDS = ['normal','mini','garakuta','drycell','static'];
for (const k in THEMES) for (const id of THEMES[k].ids) CARDS[id].theme = k;
for (const id of BASIC_IDS) CARDS[id].theme = 'basic';
// キーワード
const KEYWORDS = {
  enterBat: { name:'付属電池', help:'このロボは電池を1本入れた状態で場に出る（リペアキットでの起動も含む）。' },
  full:     { name:'満充電',   help:'電池が上限まで入っている間だけ働く効果。' },
};
CARDS.limiter.text = CARDS.limiter.text.replace('@LIM@', LIM_BONUS === 'x2' ? '2倍' : '+' + LIM_BONUS).replace('+' + LIM_BONUS + 'にする', '+' + LIM_BONUS + 'する');
const LIM_LABEL = LIM_BONUS === 'x2' ? '攻撃力2倍' : '攻撃力+' + LIM_BONUS;
const ROBO_IDS = ['souji','turbo','magnet','barrier','bomb','crane','daruma','heat','megaton','recycle','sniper','thief','kobun'];
const SPELL_IDS = ['ebattery','manual','short','repair','swap','thunder','limiter'];
// 不採用カード：デッキには入らないが、ルール・図鑑には残す（新しいものを末尾に足す）
// 以前の不採用カード（ソーラー・ガード・ハッキング・ジャマー・ロケット）は、ローグライトのテーマに復活した
const RETIRED_IDS = [];
// 本体以外で出てくるカード（デッキ外）
const TOKEN_IDS = ['aniki','onemore'];
const DECK_IDS = ROBO_IDS.concat(SPELL_IDS);
const LIFE_MAX = 15, FIELD_MAX = 3, ACTIONS = 2;
const STALL_TURNS = 8; // 両者の山札切れ後、この手番数ライフが動かなければ「互いにダメージを与えられない」とみなし、引き分け

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
  // opts.decks = [ids0, ids1]（省略時はスタンダードのデッキ）、opts.lives = [life0, life1]
  const decks = opts.decks || [DECK_IDS, DECK_IDS];
  const players = [0, 1].map(pi => {
    const deck = shuffle(decks[pi].map(id => ({ uid: uid++, id, owner: pi, bat: 0 })), rng);
    return { life: opts.lives ? opts.lives[pi] : LIFE_MAX, deck, hand: [], field: [], set: null, scrap: [] };
  });
  const s = {
    players, turn: first, turnNo: 0, actions: ACTIONS,
    phase: 'main', attacked: false, firstTurn: true, eot: [], noAttack: false,
    winner: null, draw: false, stall: 0, lifeSnap: '', pending: null,
    log: opts.log === false ? null : [], v: opts.v || null, uidSeq: 0,
    cardTotal: decks[0].length + decks[1].length, eotDmg: [],
    lists: opts.decks ? [decks[0].slice(), decks[1].slice()] : null, // デッキリスト（公開情報。CPUが伏せ札の候補を絞るのに使う）
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

function cloneCard(c) { const o = { uid: c.uid, id: c.id, owner: c.owner, bat: c.bat }; if (c.lim) o.lim = true; if (c.boost) o.boost = c.boost; if (c.home !== undefined) o.home = c.home; if (c.dmg) o.dmg = c.dmg; if (c.rboost) o.rboost = c.rboost; if (c.copyAtk !== undefined) o.copyAtk = c.copyAtk; if (c.rage) o.rage = true; return o; }
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
    cardTotal: s.cardTotal, lists: s.lists, eotDmg: (s.eotDmg || []).map(x => Object.assign({}, x)),
  };
}

function log(s, msg, ev) { if (s.log) s.log.push(Object.assign({ msg }, ev || {})); }
function pname(pi) { return pi === 0 ? 'あなた' : 'CPU'; }
function cname(c) { return CARDS[c.id].name; }

// ---------- 参照系 ----------
// ダメージを引く前の攻撃力（＝体力の最大値）
function rawAtk(y) {
  const c = CARDS[y.id];
  const base = y.copyAtk !== undefined ? y.copyAtk : c.atk;
  let a = base + y.bat + (y.boost || 0) + (y.rboost || 0);
  if (y.id === 'turbo') a += y.bat;
  if (y.id === 'charge' && c.max > 0 && y.bat >= c.max) a += 2;   // 満充電
  if (y.id === 'kajiba' && y.rage) a += 3;                          // ライフ5以下（refreshStatics が立てる）
  return y.lim ? (LIM_BONUS === 'x2' ? a * 2 : a + LIM_BONUS) : a; }
// いまの攻撃力。受けたダメージの分だけ下がる（0未満にはならない）
function atkOf(y) { return Math.max(0, rawAtk(y) - (y.dmg || 0)); }
// ダメージで破壊される状態か：ダメージを受けていて、かつダメージが（ダメージ前の）攻撃力以上
function lethal(y) { return (y.dmg || 0) > 0 && y.dmg >= rawAtk(y); }
// CPUの見積もり用：戦闘で出しうる攻撃力（ロケットロボは点火した場合）
function battleAtk(y) { return y.id === 'rocket' && !y.rboost ? atkOf(y) + 5 : atkOf(y); }
// ジャマーロボ：どちらかの場に電池入りのジャマーがいれば、お互いにアクションを使えない（pi は互換のため残す）
function isJammed(s, pi) { return allField(s).some(y => y.id === 'jammer' && y.bat > 0); }
// このロボで攻撃できるか（できなければ理由）
function cantAttack(y) {
  if (y.id === 'wall') return 'ウォールロボは攻撃できません';
  if (y.id === 'gigant' && y.bat <= 0) return 'ギガントロボは電池が入っていないと攻撃できません';
  return null;
}
// 状態で決まる常時効果の印を付け直す（カジバロボ）
function refreshStatics(s) {
  for (let pi = 0; pi < 2; pi++) for (const y of s.players[pi].field) {
    if (y.id === 'kajiba') { if (s.players[pi].life <= 5) y.rage = true; else delete y.rage; }
  }
}
// pick（カード定義の対象指定）に合うロボの一覧。pi＝効果を使う側、selfUid＝効果を出したロボ
function pickPool(s, pi, spec, selfUid) {
  if (spec.zone === 'scrap') return s.players[pi].scrap.filter(c => CARDS[c.id].kind === 'robo' && !CARDS[c.id].token);
  const sides = spec.side === 'own' ? [pi] : spec.side === 'opp' ? [1 - pi] : [0, 1];
  const out = [];
  for (const q of sides) for (const y of s.players[q].field) {
    if (spec.notSelf && y.uid === selfUid) continue;
    if (immuneFrom(y, s, pi)) continue;
    if (spec.cond === 'room' && y.bat >= CARDS[y.id].max) continue;
    if (spec.cond === 'bat' && y.bat <= 0) continue;
    if (spec.maxAtk !== undefined && atkOf(y) > spec.maxAtk) continue;
    out.push(y);
  }
  return out;
}
// ch.target が pick に合っているか。合っていれば null、だめなら理由
function pickError(s, pi, spec, ch, selfUid) {
  if (spec.player && ch.target === 'player') return null;
  const pool = pickPool(s, pi, spec, selfUid);
  if (spec.player) return pool.some(y => y.uid === ch.target) ? null : '相手か、ロボを1体選んでください';
  if (!pool.length) return spec.optional && ch.target === undefined ? null : (spec.none || '選べる対象がいません');
  if (!pool.some(y => y.uid === ch.target)) return spec.prompt ? spec.prompt.replace(/を選ぶ/, 'を選んでください') : '対象を選んでください';
  return null;
}
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
  refreshStatics(s);
}
// 回復。上限（LIFE_MAX）を超えてよい
function heal(s, pi, n, why) {
  if (n <= 0 || isOver(s)) return;
  s.players[pi].life += n;
  log(s, `${pname(pi)}のライフが${n}回復${why ? '（' + why + '）' : ''}`, { t: 'heal', pi, n });
  refreshStatics(s);
}
// ロボへのダメージ。手番の終わりまで残り、その分攻撃力が下がる
function roboDamage(s, uid, n, why) {
  const f = findRobo(s, uid); if (!f || n <= 0 || isOver(s)) return;
  f.y.dmg = (f.y.dmg || 0) + n;
  log(s, `${cname(f.y)}に${n}ダメージ${why ? '（' + why + '）' : ''}`, { t: 'robodmg', uid, n });
  sweepDeaths(s);
}
// ダメージで破壊される状態のロボをまとめて破壊する（電池が外れて攻撃力が下がった時なども、ここで拾う）
function sweepDeaths(s) {
  refreshStatics(s);
  for (let guard = 0; guard < 10; guard++) {
    const dead = allField(s).filter(lethal);
    if (!dead.length) return;
    for (const y of dead) if (findRobo(s, y.uid)) { log(s, `${cname(y)}はダメージで壊れた`, { t: 'dmgkill', uid: y.uid }); destroy(s, y.uid, false); }
  }
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
  // フォートレスロボ：自分の別のロボの戦闘での破壊を、電池1本で肩代わりする
  if (byBattle && y.bat > 0 && s.players[f.pi].field.some(z => z.id === 'fortress' && z.bat > 0 && z.uid !== uid)) {
    y.bat--;
    log(s, `フォートレスロボが守った（${cname(y)}は電池を1本失って破壊を免れた）`, { t: 'daruma', uid });
    return false;
  }
  s.players[f.pi].field.splice(f.i, 1);
  const leftBat = y.bat;
  y.bat = 0; resetCard(y);
  if (y.id === 'reboot') {
    s.players[y.owner].hand.push(y);
    s.eot = s.eot.filter(u => u !== uid);
    log(s, `${cname(y)}が破壊された`, { t: 'destroy', uid, pi: f.pi });
    log(s, `リブートロボは${pname(y.owner)}の手札に戻った`, { t: 'reboot', pi: y.owner, uid });
    return true;
  }
  const G = s.players[y.owner].scrap;
  G.push(y); // アニキロボ（トークン）もスクラップへ行く
  s.eot = s.eot.filter(u => u !== uid);
  log(s, `${cname(y)}が破壊された`, { t: 'destroy', uid, pi: f.pi });
  if (y.id === 'solar' && leftBat > 0) solarPass(s, f.pi, uid, leftBat);
  if (y.id === 'garakuta') { log(s, 'ガラクタロボの効果', { t: 'garakuta' }); drawCards(s, y.owner, 1); }
  // 破壊された時に出るロボ（カード定義の spawn：コブン→アニキ、プロト→ノーマル）。同じ場所に出る
  const sp = CARDS[y.id].spawn;
  if (sp && s.players[f.pi].field.length < FIELD_MAX) {
    const t = { uid: s.uidSeq++, id: sp, owner: y.owner, bat: 0 };
    if (!CARDS[sp].token) s.cardTotal = (s.cardTotal || DECK_IDS.length * 2) + 1; // 新しく作られた普通のカード（プロトロボのノーマルロボ）
    s.players[f.pi].field.splice(f.i, 0, t);
    log(s, `${CARDS[sp].name}が現れた！`, { t: 'deploy', pi: f.pi, uid: t.uid, token: true });
  }
  return true;
}
// 場を離れたカードから、場にいる間だけの状態を消す
function resetCard(y) { delete y.lim; delete y.home; delete y.boost; delete y.rboost; delete y.dmg; delete y.copyAtk; delete y.rage; }
// 電池を、自分の場のロボへ攻撃力の高い順（同値は左から）に上限まで移す
function batPass(s, pi, fromUid, n, label) {
  const order = s.players[pi].field.map((y, i) => ({ y, i })).sort((a, b) => atkOf(b.y) - atkOf(a.y) || a.i - b.i);
  let moved = 0;
  for (const { y } of order) {
    while (n > 0 && y.bat < CARDS[y.id].max) { y.bat++; n--; moved++; log(s, '', { t: 'batmove', from: fromUid, to: y.uid }); }
    if (n <= 0) break;
  }
  if (moved) log(s, `${label}が${moved}本、味方のロボに移った`, { t: 'solarpass', pi, n: moved });
}
// ソーラーロボの遺言：残っていた電池を、同じ場のロボへ攻撃力の高い順（同値は左から）に上限まで移す
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
// ガッタイロボの起動時効果：自分のスクラップのロボの数だけ電池を入れる
function gattaiTrigger(s, pi, uid) {
  const me = findRobo(s, uid); if (!me) return;
  const n = s.players[pi].scrap.filter(c => CARDS[c.id].kind === 'robo').length;
  const k = placeBat(s, me.y, n);
  if (k) log(s, `ガッタイロボはスクラップのロボ${n}体分、電池を${k}本入れた`, { t: 'batfly', uid });
}
// プレスロボの起動時効果：お互いに、自分の場で攻撃力が一番低いロボ（プレスロボ自身も含む・同じなら左）を破壊。
// 自分の場に小さいロボがいればそれが壊れてプレスは残り、いなければプレス自身が壊れて「除去」になる。
// 選ばない効果なので、バリアロボも対象になる。両方の対象を先に決めてから壊す（コブンから出たアニキは巻き込まない）
function pressTrigger(s, pi, uid) {
  const victims = [];
  for (const q of [pi, 1 - pi]) {
    const c = s.players[q].field;
    if (!c.length) continue;
    const mn = Math.min(...c.map(atkOf));
    victims.push(c.find(y => atkOf(y) === mn).uid);
  }
  if (!victims.length) return;
  log(s, 'プレスロボがお互いの一番弱いロボをつぶした', { t: 'press', uid });
  for (const v of victims) destroy(s, v, false);
}
// ジャンク回収で戻せるカード
function junkPool(s, pi) {
  const g = s.players[pi].scrap.filter(c => !CARDS[c.id].token);
  return { robos: g.filter(c => CARDS[c.id].kind === 'robo'), spells: g.filter(c => CARDS[c.id].kind === 'spell') };
}
// 場のロボを持ち主の手札に戻す（ワープ装置）。トークンは消える
function bounce(s, uid) {
  const f = findRobo(s, uid); if (!f) return false;
  const y = f.y;
  s.players[f.pi].field.splice(f.i, 1);
  s.eot = s.eot.filter(u => u !== uid);
  y.bat = 0; resetCard(y);
  log(s, `${cname(y)}が手札に戻った`, { t: 'bounce', uid, pi: f.pi });
  if (!CARDS[y.id].token) s.players[y.owner].hand.push(y);
  return true;
}
// 整備マニュアルで電池を入れられる自分のロボ
function maintTargets(s, pi) { return s.players[pi].field.filter(y => y.bat < CARDS[y.id].max); }
function placeBat(s, y, n) { // 置ける分だけ置く。置いた数を返す
  const room = CARDS[y.id].max - y.bat;
  const k = Math.max(0, Math.min(n, room));
  y.bat += k; return k;
}
function deploy(s, pi, card, how, ch) {
  card.bat = 0; resetCard(card);
  // コピーロボ：起動した時に場のロボを選ぶ（場に出る前に選ぶので、自分自身は選べない）
  if (card.id === 'copy') {
    const pool = pickPool(s, pi, CARDS.copy.deployPick, card.uid);
    let t = ch && pool.find(y => y.uid === ch.target);
    if (!t && pool.length) t = pool.slice().sort((a, b) => atkOf(b) - atkOf(a))[0]; // リペアキットなどで選べない時は一番強いロボ
    card.copyAtk = t ? atkOf(t) : 0;
    s.players[pi].field.push(card);
    log(s, `${pname(pi)}は${cname(card)}を${how || '起動'}した`, { t: 'deploy', pi, uid: card.uid });
    log(s, t ? `コピーロボは${cname(t)}の攻撃力${card.copyAtk}をコピーした` : 'コピーできるロボがいない（攻撃力0）', { t: 'copy', uid: card.uid, from: t ? t.uid : null });
    return;
  }
  s.players[pi].field.push(card);
  log(s, `${pname(pi)}は${cname(card)}を${how || '起動'}した`, { t: 'deploy', pi, uid: card.uid });
  const eh = CARDS[card.id].enterBat || 0;
  if (eh) { const k = placeBat(s, card, eh); if (k) log(s, `${cname(card)}は電池を${k}本入れて起動した`, { t: 'enterbat', pi, uid: card.uid }); }
  // 起動時効果。アクションの処理中に起動した場合は、そのアクションがスクラップに置かれてから発動する
  const trig = card.id === 'recycle' ? () => recycleTrigger(s, pi) : card.id === 'thief' ? () => thiefTrigger(s, pi, card.uid)
    : card.id === 'scout' ? () => { log(s, 'スカウトロボの効果', { t: 'scout' }); drawCards(s, pi, 1); }
    : card.id === 'gattai' ? () => gattaiTrigger(s, pi, card.uid)
    : card.id === 'press' ? () => pressTrigger(s, pi, card.uid) : null;
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
    // 膠着したら、ライフに関係なく引き分け
    s.draw = true; log(s, s.stall >= STALL_TURNS ? '互いにダメージを与えられない：引き分け' : '決着がつかない：引き分け', { t: 'tie' });
    return;
  }
  s.turn = 1 - s.turn;
  startTurn(s, false);
}
function resolveEot(s) {
  // オーバーロードの反動
  const ed = s.eotDmg || []; s.eotDmg = [];
  for (const x of ed) { damage(s, x.pi, x.n, 'オーバーロードの反動'); if (isOver(s)) return; }
  // 手番の終わり：ダメージと「この手番の間」の修正を同時に取り除く（取り除いたことで壊れることはない）
  for (const p of s.players) for (const y of p.field) { delete y.boost; delete y.dmg; }
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
    const ca = cantAttack(f.y); if (ca) return ca;
    if (a.boost && f.y.id !== 'rocket') return '点火できるのはロケットロボだけです';
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
    if (!P.field.some(y => !cantAttack(y))) return '攻撃できるロボがいません';
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
    if (def.kind === 'robo') {
      if (P.field.length >= FIELD_MAX) return '場のロボは3体までです';
      if (def.deployPick) return pickError(s, pi, def.deployPick, a.ch || {}, L.c.uid);
      return null;
    }
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
    if (CARDS[f.y.id].pick) return pickError(s, pi, CARDS[f.y.id].pick, ch, f.y.uid);
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
  const def = CARDS[id];
  if (id === 'junk') {
    // ロボとアクションを1枚ずつ（スクラップにある方だけ）。どちらも無ければ使えない
    const { robos, spells } = junkPool(s, pi);
    if (!robos.length && !spells.length) return 'スクラップに戻せるカードがありません';
    if (robos.length && !robos.some(c => c.uid === ch.uid)) return '手札に戻すロボを選んでください';
    if (spells.length && !spells.some(c => c.uid === ch.sid)) return '手札に戻すアクションを選んでください';
    return null;
  }
  if (def.pick) {
    if (def.pick.zone === 'scrap') return pickPool(s, pi, def.pick).some(c => c.uid === ch.uid) ? null : (pickPool(s, pi, def.pick).length ? 'スクラップのロボを選んでください' : def.pick.none);
    return pickError(s, pi, def.pick, ch);
  }
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
  if (CARDS[card.id].burn) damage(s, 1 - pi, CARDS[card.id].burn, cname(card)); // 相手に直接ダメージ（カード定義の burn）
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
        roboDamage(s, u, k, 'ショート'); // 外した本数だけダメージ（電池が減って下がった攻撃力に、さらに効く）
      }
      break;
    }
    case 'emp': {
      // 選ばない効果なので、バリアロボにも効く
      let n = 0;
      for (const y of s.players[1 - pi].field) if (y.bat > 0) { y.bat--; n++; log(s, `${cname(y)}の電池が1本外れた`, { t: 'short', uid: y.uid, n: 1 }); }
      if (!n) log(s, '電池が入ったロボがいない', { t: 'fizzle' });
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
    case 'hammer': {
      const t = findRobo(s, ch.target);
      if (t && pickPool(s, pi, CARDS.hammer.pick).includes(t.y)) destroy(s, t.y.uid, false); else log(s, '対象がいない', { t: 'fizzle' });
      break;
    }
    case 'parts': {
      const t = findRobo(s, ch.target);
      if (t && t.pi === pi) {
        const bat = t.y.bat, uid = t.y.uid;
        destroy(s, uid, false);
        // salvage：壊したロボの電池を、自分の場のロボへ移す（攻撃力の高い順）
        if (CARDS.parts.salvage && bat > 0) batPass(s, pi, uid, bat, '部品取りで外した電池');
      }
      drawCards(s, pi, 3);
      break;
    }
    case 'junk': {
      const { robos, spells } = junkPool(s, pi), G = s.players[pi].scrap;
      for (const c of [robos.find(c => c.uid === ch.uid), spells.find(c => c.uid === ch.sid)]) {
        if (!c) continue;
        G.splice(G.indexOf(c), 1); s.players[pi].hand.push(c);
        log(s, `${cname(c)}を手札に戻した`, { t: 'junk', pi, id: c.id });
      }
      break;
    }
    case 'runaway': {
      const t = findRobo(s, ch.target);
      if (t && t.pi === pi) { t.y.boost = (t.y.boost || 0) + 2; log(s, `${cname(t.y)}が暴走！（攻撃力${atkOf(t.y)}）`, { t: 'limiter', uid: t.y.uid }); }
      damage(s, pi, 2, '暴走プログラム');
      break;
    }
    case 'spark': {
      damage(s, pi, 2, 'スパークボム');
      if (isOver(s)) break;
      if (ch.target === 'player') damage(s, 1 - pi, 3, 'スパークボム');
      else { const t = findRobo(s, ch.target); if (t && !immuneFrom(t.y, s, pi)) roboDamage(s, t.y.uid, 3, 'スパークボム'); else log(s, '対象がいない', { t: 'fizzle' }); }
      break;
    }
    case 'overload': {
      s.actions += 2; (s.eotDmg = s.eotDmg || []).push({ pi, n: 4 });
      log(s, `${pname(pi)}の行動が2回増えた（手番終了時に4ダメージ）`, { t: 'extraact', pi });
      break;
    }
    case 'warp': {
      const t = findRobo(s, ch.target);
      if (t && t.pi === pi) bounce(s, t.y.uid); else log(s, '対象がいない', { t: 'fizzle' });
      break;
    }
    case 'batpack': {
      const t = findRobo(s, ch.target);
      if (t && t.pi === pi && placeBat(s, t.y, 1)) log(s, `${cname(t.y)}に電池を入れた`, { t: 'batfly', uid: t.y.uid });
      drawCards(s, pi, 1);
      break;
    }
    case 'drycell': {
      const t = findRobo(s, ch.target);
      if (t && t.pi === pi && placeBat(s, t.y, 1)) log(s, `${cname(t.y)}に電池を入れた`, { t: 'batfly', uid: t.y.uid });
      break;
    }
    case 'leak': case 'static': {
      const t = findRobo(s, ch.target);
      if (t && t.y.bat > 0 && !immuneFrom(t.y, s, pi)) {
        const k = card.id === 'leak' ? t.y.bat : 1; t.y.bat -= k;
        log(s, `${cname(t.y)}の電池が${k}本外れた`, { t: 'short', uid: t.y.uid, n: k });
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
  if (CARDS[card.id].draw) drawCards(s, pi, CARDS[card.id].draw); // 追加で引く（カード定義の draw）
  card.bat = 0; s.players[card.owner].scrap.push(card);
  sweepDeaths(s);
  // アクションの処理が終わってから、途中で起きた起動時効果を処理する
  const later = s.deferred || []; s.resolving = false; s.deferred = [];
  for (const f of later) f();
  sweepDeaths(s);
}

function apply(s, a) {
  const err = checkAction(s, a);
  if (err) throw new Error(err);
  applyRaw(s, a);
  if (a.t !== 'end') sweepDeaths(s);
}
function applyRaw(s, a) {
  const pi = s.turn, P = s.players[pi], O = s.players[1 - pi];
  switch (a.t) {
    case 'end': endTurn(s); return;
    case 'battle': s.phase = 'battle'; log(s, `${pname(pi)}はバトルフェイズに入った`, { t: 'phase', pi }); return;
    case 'attack': declareAttack(s, a.att, a.tgt, a.boost); return;
    case 'place': {
      const f = findRobo(s, a.target); placeBat(s, f.y, f.y.id === 'socket' ? 2 : 1); s.actions--;
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
      if (CARDS[L.c.id].kind === 'robo') deploy(s, pi, L.c, '起動', a.ch);
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
      } else if (f.y.id === 'dynamo') {
        const t = findRobo(s, a.ch.target);
        const k = t ? placeBat(s, t.y, 2) : 0;
        if (k) log(s, `${cname(t.y)}に電池を${k}本入れた`, { t: 'batfly', uid: t.y.uid });
      } else if (f.y.id === 'medic') {
        heal(s, pi, 2, 'メディックロボ');
      }
      return;
    }
  }
}

// ---------- 戦闘 ----------
function declareAttack(s, att, tgt, boost) {
  if (s.phase === 'main') log(s, `${pname(s.turn)}はバトルフェイズに入った`, { t: 'phase', pi: s.turn });
  s.phase = 'battle'; s.attacked = true;
  s.pending = { att, tgt };
  if (boost) s.pending.boostA = true;
  const A = findRobo(s, att).y;
  const tn = tgt === 'player' ? pname(1 - s.turn) : cname(findRobo(s, tgt).y);
  log(s, `${cname(A)}が${tn}に攻撃！`, { t: 'attack', pi: s.turn, att, tgt });
}
// 防御側がセットアクションで応答できるか
function needsResponse(s) { return canRespondSet(s) || rocketDefends(s); }
function canRespondSet(s) { return !!(s.pending && s.players[1 - s.turn].set && !isJammed(s, 1 - s.turn)); }
// 攻撃されたのがロケットロボなら、防御側は点火するか選べる
function rocketDefends(s) { const p = s.pending; if (!p || p.tgt === 'player') return false; const t = findRobo(s, p.tgt); return !!(t && t.y.id === 'rocket'); }
function respondChoiceError(s, ch) {
  const di = 1 - s.turn, c = s.players[di].set; if (!c) return 'セットされていません';
  return checkSpell(s, di, c.id, ch || {});
}
// resp: null（何もしない） or { ch?（伏せ札を表にする時の対象）, boost?（ロケットロボを点火する） }
// 伏せ札を表にして効果を処理するところまで（戦闘はまだ行わない）。画面で段階的に見せるために分けている
function respondReveal(s, resp) {
  const di = 1 - s.turn, D = s.players[di];
  if (resp && resp.boost && s.pending) s.pending.boostD = true;
  if (resp && resp.ch !== undefined && D.set && !isJammed(s, di)) {
    const c = D.set; D.set = null;
    log(s, `${pname(di)}はセットした${cname(c)}を表にした！`, { t: 'reveal', pi: di, id: c.id });
    resolveSpell(s, di, c, resp.ch);
  }
}
function respond(s, resp) {
  respondReveal(s, resp);
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
  if (tgt === 'player') {
    if (preBattle(s, A, null, p)) return;
    log(s, '', { t: 'direct', att: A.uid, pi: di }); damage(s, di, atkOf(A), '直接攻撃'); delete A.rboost; afterAttack(s, A); return;
  }
  const tf = findRobo(s, tgt);
  if (!tf || tf.pi !== di) { log(s, '攻撃対象がいなくなり、攻撃は中止された', { t: 'cancel' }); return; }
  const T = tf.y;
  if (preBattle(s, A, T, p)) return;
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
  delete A.rboost; delete T.rboost;
  afterAttack(s, A);
  sweepDeaths(s);
  // ボムロボは対象を選ばない効果なので、バリアロボにも効く
  if (aCho && findRobo(s, T.uid)) s.eot.push(T.uid);
  if (dCho && findRobo(s, A.uid)) s.eot.push(A.uid);
}
// 攻撃のあとの効果（カード定義の afterAttackBat＝攻撃するたびに電池を外す：ギガントロボ）
function afterAttack(s, A) {
  const n = CARDS[A.id].afterAttackBat;
  if (!n || isOver(s) || !findRobo(s, A.uid) || A.bat <= 0) return;
  const k = Math.min(n, A.bat); A.bat -= k;
  log(s, `${cname(A)}は電池を${k}本使った`, { t: 'short', uid: A.uid, n: k });
}
// 戦闘の前の効果（バクシン・ドリル・ロケット点火）。決着が付いたら true
function preBattle(s, A, T, p) {
  const pi = s.turn, di = 1 - pi;
  // 攻撃した時の効果（カード定義の onAttack）：ping＝相手にダメージ、atk＝この戦闘の間の攻撃力
  const oa = CARDS[A.id].onAttack;
  if (oa && oa.ping) { log(s, `${cname(A)}の突撃`, { t: 'bakushin', uid: A.uid }); damage(s, di, oa.ping, cname(A)); if (isOver(s)) return true; }
  if (oa && oa.atk) A.rboost = (A.rboost || 0) + oa.atk;
  if (T && A.id === 'drill' && A.bat > 0 && T.bat > 0 && !immuneFrom(T, s, pi)) {
    T.bat--; log(s, `ドリルロボが${cname(T)}の電池を1本外した`, { t: 'short', uid: T.uid, n: 1 });
  }
  for (const [y, side, on] of [[A, pi, p.boostA], [T, di, p.boostD]]) if (y && on && y.id === 'rocket') {
    y.rboost = 5;
    log(s, `ロケットロボが点火！（攻撃力${atkOf(y)}）`, { t: 'rocket', uid: y.uid });
    damage(s, side, 4, 'ロケットロボの反動');
    if (isOver(s)) return true;
  }
  sweepDeaths(s);
  if (!findRobo(s, A.uid) || (T && !findRobo(s, T.uid))) { log(s, '戦闘の相手がいなくなり、攻撃は中止された', { t: 'cancel' }); return true; }
  return false;
}
// シミュレーション用：攻撃～応答～解決を一括
function attackFull(s, att, tgt, resp, boost) {
  apply(s, { t: 'attack', att, tgt, boost });
  if (needsResponse(s)) respond(s, resp); else resolveBattle(s);
}

// 整合性チェック（テスト用）
function invariant(s) {
  let bat = 0, n = 0;
  const real = arr => arr.filter(c => !CARDS[c.id].token).length;
  for (const p of s.players) { for (const y of p.field) bat += y.bat; n += real(p.deck) + real(p.hand) + real(p.field) + real(p.scrap) + (p.set && !CARDS[p.set.id].token ? 1 : 0); }
  if (n !== (s.cardTotal || DECK_IDS.length * 2)) throw new Error('card count ' + n);
  for (const y of allField(s)) if (lethal(y)) throw new Error('lethal robot left on field');
  for (const p of s.players) { if (p.field.length > 3) throw new Error('field>3'); for (const y of p.field) if (y.bat > CARDS[y.id].max) throw new Error('bat>max'); }
}

const api = { junkPool, THEMES, BASIC_DECK, BASIC_IDS, KEYWORDS, pickPool, pickError, cantAttack, canRespondSet, rocketDefends, heal, bounce, maintTargets, battleAtk, LIM_BONUS, LIM_LABEL, RETIRED_IDS, TOKEN_IDS, isJammed, sniperCandidates, guardsOf, hackCandidates, CARDS, ROBO_IDS, SPELL_IDS, DECK_IDS, LIFE_MAX, FIELD_MAX,
  mulberry32, shuffle, newGame, clone, atkOf, rawAtk, lethal, roboDamage, sweepDeaths, immuneFrom, findRobo, allField, isOver,
  checkAction, checkSpell, thunderCandidates, apply, needsResponse, respond, respondReveal, respondChoiceError, resolveBattle,
  attackFull, endTurn, resolveEot, invariant, pname, cname };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
