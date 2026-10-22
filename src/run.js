// ===== 勝ち抜きモード（ローグライト）の進行 =====
// 画面に依存しない純粋なロジック。ランの状態はプレーンなオブジェクトで、そのまま localStorage に保存できる。
// 乱数の状態も run.rs に持つので、保存→再開しても同じ続きになる。
//
// 進行は「手順の列」(run.queue) で管理する。勝利のあとは 報酬 → 抜く → イベント の順に手順を積み、
// イベントは自分の手順（カードを選ぶ・抜く・改造する…）を列の先頭に差し込む。列が空になったら次の対戦。
// デッキの1枚は文字列で、'normal' または改造済みの 'normal@a'（攻撃力+1）/'@m'（電池上限+1）/'@e'（付属電池）。
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.Engine;
const { CARDS, THEMES, BASIC_DECK } = E;

const ROUNDS = 5;          // 全5戦
const START_LIFE = 7;      // 第1戦のライフ
const LIFE_STEP = 2;       // 1戦ごとのライフの増分（デッキは報酬で+3−1＝+2枚）
const OFFER = 6;           // 報酬の候補の数
const TAKE = 3;            // 候補から取る数
const START_OFFER = 3, START_TAKE = 1; // ラン開始時：候補3枚から1枚取って、1枚抜く
const RARE_WEIGHT = 0.35;  // レアの出やすさ（ふつう＝1）
const OPP_EXTRA = 1;       // 相手のデッキは、同じ回戦の自分よりテーマのカードがこの枚数だけ多い
// 回戦ごとの相手のCPU（app.js の DIFF のキー）：第1戦よわい、第2・3戦ふつう、第4・5戦つよい
const CPU_BY_ROUND = ['easy', 'normal', 'normal', 'hard', 'hard'];
const CPU_LADDER = ['easy', 'normal', 'hard'];
function cpuFor(round) { return CPU_BY_ROUND[Math.min(round, CPU_BY_ROUND.length) - 1]; }
// 共通カード（どのテーマを選んでも報酬に出る）
const COMMON_KEYS = ['common', 'common2'];
const COMMON_IDS = COMMON_KEYS.reduce((a, k) => a.concat(THEMES[k].ids), []);
const THEME_KEYS = Object.keys(THEMES).filter(k => !COMMON_KEYS.includes(k));
const baseId = E.baseId;
const isBasic = e => CARDS[baseId(e)].theme === 'basic';

// ---------- 乱数（状態を run に持つ） ----------
function rand(o) {
  o.rs = (o.rs + 0x6D2B79F5) | 0;
  let t = Math.imul(o.rs ^ o.rs >>> 15, 1 | o.rs);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function shuffleWith(o, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand(o) * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}
// 重み付きで、重複なしに n 枚選ぶ（レアは出にくい）
function weightedPick(o, ids, n) {
  const pool = ids.slice(), out = [];
  while (out.length < n && pool.length) {
    const ws = pool.map(id => CARDS[id].rare ? RARE_WEIGHT : 1);
    let r = rand(o) * ws.reduce((a, b) => a + b, 0), i = 0;
    while (i < pool.length - 1 && r >= ws[i]) { r -= ws[i]; i++; }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// ---------- 候補の出どころ ----------
// 報酬の候補になりうるカード：自分の2テーマ＋共通。取ったカード・抜いたカードは除く
function rewardPool(run) {
  const ids = run.themes.concat(COMMON_KEYS).reduce((a, k) => a.concat(THEMES[k].ids), []);
  return ids.filter(id => !run.taken.includes(id) && !run.removed.includes(id));
}
const rarePool = run => rewardPool(run).filter(id => CARDS[id].rare);
// 自分のテーマ以外（共通も除く）から
function foreignPool(run) {
  return THEME_KEYS.filter(k => !run.themes.includes(k)).reduce((a, k) => a.concat(THEMES[k].ids), []).filter(id => !run.taken.includes(id) && !run.removed.includes(id));
}
const deckRobos = run => run.deck.map((e, i) => ({ e, i })).filter(x => CARDS[baseId(x.e)].kind === 'robo');

// ---------- イベント（データ） ----------
// kind: A デッキ / B 改造 / C パーツ（ラン中ずっと効く） / D 取引・賭け / E 特殊な対戦 / F 情報・選択
// ok(run)：出してよいか。apply(run)：効果（手順を差し込む・フラグを立てる）
const front = (run, ...steps) => { run.queue.unshift(...steps); };
const EVENTS = {
  copy:      { kind: 'A', name: 'コピー機', text: 'デッキのカード1枚を複製する。', apply: r => front(r, { t: 'copy' }) },
  mass:      { kind: 'A', name: '大量生産', text: 'テーマのカード1枚を複製する。代わりに、次に抜くカードは基本カード以外から選ぶ。',
               ok: r => r.deck.some(e => !isBasic(e) && baseId(e) !== 'sabi'), apply: r => { front(r, { t: 'copy', themeOnly: true }); r.noBasicNext = true; } },
  rareShop:  { kind: 'A', name: 'レアパーツ屋', text: 'レアだけの候補3枚から1枚もらう。', ok: r => rarePool(r).length > 0,
               apply: r => front(r, { t: 'reward', offer: weightedPick(r, rarePool(r), 3), need: 1, title: 'レアパーツ屋：1枚選ぶ' }) },
  yard:      { kind: 'A', name: '解体ヤード', text: 'デッキからカードを2枚抜く。', ok: r => r.deck.length > 8, apply: r => front(r, { t: 'remove', n: 2, extra: true }) },
  foreign:   { kind: 'A', name: 'よそのテーマ', text: '自分のテーマ以外のカード3枚から1枚もらう。', ok: r => foreignPool(r).length > 0,
               apply: r => front(r, { t: 'reward', offer: weightedPick(r, foreignPool(r), 3), need: 1, title: 'よそのテーマ：1枚選ぶ' }) },
  modShop:   { kind: 'B', name: '改造工場', text: 'ロボ1枚を改造する（攻撃力+1か、電池上限+1）。', ok: r => deckRobos(r).some(x => !x.e.includes('@')),
               apply: r => front(r, { t: 'mod', mods: ['a', 'm'] }) },
  enterMod:  { kind: 'B', name: '付属電池化', text: '付属電池のないロボ1枚に、付属電池を付ける。', ok: r => deckRobos(r).some(x => !x.e.includes('@') && !CARDS[baseId(x.e)].enterBat),
               apply: r => front(r, { t: 'mod', mods: ['e'] }) },
  spare:     { kind: 'C', part: true, name: '予備バッテリー', text: 'パーツ：毎試合、最初に起動したロボに電池+1。' },
  armor:     { kind: 'C', part: true, name: '装甲板', text: 'パーツ：毎試合、ライフ+2で始まる。' },
  bench:     { kind: 'C', part: true, name: '作業台', text: 'パーツ：毎試合、手札+1枚で始まる。' },
  foresight: { kind: 'C', part: true, name: '先読み回路', text: 'パーツ：毎試合、始まった時に山札の上3枚を見て、引く順番を決められる。' },
  market:    { kind: 'D', name: '闇市', text: 'ライフが以後ずっと2減る。代わりにレアの候補2枚から1枚もらう。', ok: r => rarePool(r).length > 0,
               apply: r => { r.lifeMod -= 2; front(r, { t: 'reward', offer: weightedPick(r, rarePool(r), 2), need: 1, title: '闇市：レアを1枚選ぶ' }); } },
  lottery:   { kind: 'D', name: 'ジャンクくじ', text: '半分の確率でレアを1枚もらう。外れると「サビ」（使えないカード）がデッキに入る。', ok: r => rarePool(r).length > 0,
               apply: r => {
                 if (rand(r) < 0.5) { const id = weightedPick(r, rarePool(r), 1)[0]; r.deck.push(id); r.taken.push(id); r.notice = `当たり！ ${CARDS[id].name}がデッキに入った`; }
                 else { r.deck.push('sabi'); r.notice = 'ハズレ… サビがデッキに入った'; }
               } },
  debt:      { kind: 'D', name: '借金', text: 'ランダムにカードを2枚もらう。代わりに次の対戦はライフ−3。', ok: r => rewardPool(r).length >= 2,
               apply: r => { const ids = weightedPick(r, rewardPool(r), 2); r.deck.push(...ids); r.taken.push(...ids); r.next.life -= 3; r.notice = `${ids.map(id => CARDS[id].name).join('と')}がデッキに入った`; } },
  elite:     { kind: 'E', name: 'エリート戦', text: '次の相手が強くなる（デッキ+2枚・CPUが1段階強い）。勝てば報酬がもう1回。', apply: r => { r.next.elite = true; } },
  handicap:  { kind: 'E', name: 'ハンデ戦', text: '次の対戦は自分のライフが半分。勝てばレアの候補3枚から1枚。', ok: r => rarePool(r).length > 0, apply: r => { r.next.handicap = true; } },
  weather:   { kind: 'E', name: '異常気象', text: '次の対戦は、お互いのロボの電池上限+1。', apply: r => { r.next.weather = true; } },
  scout:     { kind: 'F', name: '偵察', text: '次の相手のデッキの中身と、その次の相手のテーマが分かる。', ok: r => !r.scout || r.scout < r.nextRound, apply: r => { r.scout = r.nextRound; } },
  branch:    { kind: 'F', name: '分かれ道', text: '次の相手を、2つのテーマから選ぶ。', ok: r => r.nextRound < ROUNDS,
               apply: r => { const later = r.oppThemes.slice(r.nextRound); front(r, { t: 'branch', options: [r.oppThemes[r.nextRound - 1], later[Math.floor(rand(r) * later.length)]] }); } },
};
// 強いイベント（出にくい）：1つの文にだけ入れる。それ以外は弱いイベント（出やすい）：複数の文に入れる
const STRONG = ['rareShop', 'modShop', 'copy', 'spare', 'armor', 'bench', 'foresight'];
// イベントの入り口の文。勝ったあとに1つ出て、入るか通り過ぎるかだけ決める。入ると、その文のイベントから1つを抽選
const SIGNS = [
  { id: 'stall',   text: '錆びた看板の露店がある。',             events: ['market', 'lottery', 'debt'] },
  { id: 'junk',    text: 'ガラクタの山の向こうで物音がする。',   events: ['lottery', 'yard', 'enterMod'] },
  { id: 'beckon',  text: '怪しい男が手招きしている。',           events: ['market', 'debt', 'rareShop'] },
  { id: 'storm',   text: '空が急に暗くなってきた。',             events: ['weather', 'handicap', 'elite'] },
  { id: 'track',   text: '大きな足跡が続いている。',             events: ['elite', 'handicap', 'scout', 'branch'] },
  { id: 'fork',    text: '道が二手に分かれている。',             events: ['branch', 'scout', 'foreign'] },
  { id: 'stranger',text: '見慣れないロボがこちらを見ている。',   events: ['foreign', 'elite', 'weather'] },
  { id: 'factory', text: '古い工場の明かりがついている。',       events: ['mass', 'enterMod', 'modShop'] },
  { id: 'crate',   text: 'ロボの部品が箱に詰まっている。',       events: ['yard', 'mass', 'copy'] },
  { id: 'storage', text: '誰も使っていない倉庫がある。',         events: ['spare', 'armor', 'bench', 'foresight'] },
];
function eventOk(run, id) { const ev = EVENTS[id]; if (ev.part && run.parts.includes(id)) return false; return !ev.ok || ev.ok(run); }

// ---------- ラン ----------
function newRun(seed) {
  const run = { v: 2, seed: seed | 0, rs: seed | 0, round: 1, nextRound: 1, phase: 'battle', step: null, queue: [],
    deck: BASIC_DECK.slice(), taken: [], removed: [], history: [], parts: [], lifeMod: 0, next: freshNext(), noBasicNext: false, scout: 0, notice: '' };
  run.themes = shuffleWith(run, THEME_KEYS.slice()).slice(0, 2);
  run.oppThemes = shuffleWith(run, THEME_KEYS.slice());   // 相手は1戦ごとに別のテーマ
  run.queue = [{ t: 'reward', offer: weightedPick(run, rewardPool(run), START_OFFER), need: START_TAKE, title: '最初のカードを1枚選ぶ' }, { t: 'remove', n: 1 }];
  return advance(run);
}
function freshNext() { return { life: 0, elite: false, handicap: false, weather: false }; }
// 列の次の手順へ。空なら次の対戦
function advance(run) {
  const st = run.queue.shift();
  if (!st) { run.step = null; run.round = run.nextRound; run.phase = 'battle'; return run; }
  if (st.t === 'event') {
    // 起こりうるイベントが1つ以上ある文から、1つを選ぶ
    const signs = SIGNS.filter(sg => sg.events.some(id => eventOk(run, id)));
    if (!signs.length) return advance(run);
    st.sign = signs[Math.floor(rand(run) * signs.length)].id;
  }
  // 候補を「その手順になった時」に引く報酬（前の報酬で取ったカードを除くため）
  if (st.t === 'reward' && st.lazy) { st.offer = st.lazy === 'rare' ? weightedPick(run, rarePool(run), 3) : weightedPick(run, rewardPool(run), OFFER); delete st.lazy; }
  if (st.t === 'reward' && !st.offer.length) return advance(run);
  if (st.t === 'remove' && run.noBasicNext && st.n === 1 && !st.extra) { st.noBasic = true; run.noBasicNext = false; }
  run.step = st; run.phase = st.t;
  return run;
}
const need = st => Math.min(st.need, st.offer.length);
function lifeFor(round) { return START_LIFE + LIFE_STEP * (round - 1); }

// 相手のデッキ：基本デッキから r 枚抜き、テーマのカードを 3(r-1)+1 枚足す（自分と同じ枚数で、テーマのカードが1枚多い）。
// テーマのカードが足りなければ共通から足す。extra＝エリート戦で増える枚数。ラン内では同じ回戦なら同じデッキ
function oppDeck(run, round, extra) {
  const o = { rs: (run.seed ^ Math.imul(round, 0x9E3779B1)) | 0 };
  const theme = run.oppThemes[round - 1];
  const add = 3 * (round - 1) + OPP_EXTRA + (extra || 0), cut = (round - 1) + OPP_EXTRA;
  let picks = weightedPick(o, THEMES[theme].ids, add);
  if (picks.length < add) picks = picks.concat(weightedPick(o, COMMON_IDS, add - picks.length));
  const basics = shuffleWith(o, BASIC_DECK.slice()).slice(cut);
  return { theme, deck: basics.concat(picks) };
}
// 次の対戦の条件（パーツ・イベントの効果込み）。画面とシミュレーションの両方がこれを使う
function battleSetup(run) {
  const r = run.round, n = run.next || freshNext(), parts = run.parts || [];
  const opp = oppDeck(run, r, n.elite ? 2 : 0);
  let life = lifeFor(r) + (run.lifeMod || 0) + (parts.includes('armor') ? 2 : 0) + n.life;
  if (n.handicap) life = Math.ceil(life / 2);
  life = Math.max(1, life);
  const cpu = n.elite ? CPU_LADDER[Math.min(CPU_LADDER.length - 1, CPU_LADDER.indexOf(cpuFor(r)) + 1)] : cpuFor(r);
  const perks = { hand: parts.includes('bench') ? 1 : 0, firstBat: parts.includes('spare') ? 1 : 0, foresight: parts.includes('foresight') ? 3 : 0 };
  return { round: r, oppTheme: opp.theme, decks: [run.deck.slice(), opp.deck], lives: [life, lifeFor(r)], cpu, perks: [perks, {}], batPlus: n.weather ? 1 : 0, next: Object.assign({}, n) };
}
// 対戦の結果を記録して、次の段階へ
function finishBattle(run, won, info) {
  const n = run.next || freshNext();
  run.history.push(Object.assign({ round: run.round, won: !!won, opp: run.oppThemes[run.round - 1] }, info || {}));
  run.next = freshNext(); run.notice = '';
  if (!won) { run.phase = 'over'; run.step = null; return run; }
  if (run.round >= ROUNDS) { run.phase = 'clear'; run.step = null; return run; }
  run.nextRound = run.round + 1;
  run.queue = [{ t: 'reward', offer: weightedPick(run, rewardPool(run), OFFER), need: TAKE, title: `勝利の報酬：${OFFER}枚から${TAKE}枚選ぶ` }];
  if (n.elite) run.queue.push({ t: 'reward', offer: [], need: TAKE, title: 'エリート戦の報酬：もう1回', lazy: 'normal' });
  if (n.handicap) run.queue.push({ t: 'reward', offer: [], need: 1, title: 'ハンデ戦の報酬：レアを1枚', lazy: 'rare' });
  run.queue.push({ t: 'remove', n: 1 }, { t: 'event' });
  return advance(run);
}
// ---------- 各手順の操作 ----------
function takeCards(run, ids) {
  const st = run.step;
  if (run.phase !== 'reward') throw new Error('いまは報酬を選べません');
  const k = need(st);
  if (ids.length !== k || new Set(ids).size !== ids.length || !ids.every(id => st.offer.includes(id))) throw new Error(`候補から${k}枚選んでください`);
  run.deck = run.deck.concat(ids); run.taken = run.taken.concat(ids);
  return next(run);
}
// デッキから1枚抜く（i＝デッキ内の位置）。抜いたカードは、このランでは候補に出なくなる
function removeCard(run, i) {
  const st = run.step;
  if (run.phase !== 'remove') throw new Error('いまはカードを抜けません');
  if (!(i >= 0 && i < run.deck.length)) throw new Error('抜くカードを選んでください');
  if (st.noBasic && isBasic(run.deck[i]) && run.deck.some(e => !isBasic(e))) throw new Error('今回は基本カード以外から抜きます（大量生産）');
  const id = baseId(run.deck.splice(i, 1)[0]);
  if (!run.removed.includes(id)) run.removed.push(id);
  st.n = (st.n || 1) - 1;
  if (st.n > 0) return run;
  return next(run);
}
// イベントの文に入るか（enter＝false で通り過ぎる）。入ると、その文のイベントから起こりうるものを1つ抽選して起こす
function chooseEvent(run, enter) {
  if (run.phase !== 'event') throw new Error('いまはイベントを選べません');
  run.notice = '';
  if (enter) {
    const sg = SIGNS.find(x => x.id === run.step.sign);
    const ids = sg.events.filter(id => eventOk(run, id));
    applyEvent(run, ids[Math.floor(rand(run) * ids.length)]);
  }
  return next(run);
}
// イベントを起こす（抽選の結果、またはテストから直接）
function applyEvent(run, id) {
  const ev = EVENTS[id];
  const before = run.notice;
  run.notice = '';
  if (ev.part) run.parts.push(id); else ev.apply(run);
  // 何が起きたかを画面に出す（イベント内で結果の文が出た時は、それを後ろにつなげる）
  run.notice = `【${ev.name}】${ev.text}` + (run.notice ? ` → ${run.notice}` : '');
  run.history.push({ event: id, round: run.round });
  return run;
}
// コピー（i のカードを複製）
function copyCard(run, i) {
  const st = run.step;
  if (run.phase !== 'copy') throw new Error('いまは複製できません');
  const e = run.deck[i]; if (e === undefined) throw new Error('複製するカードを選んでください');
  if (baseId(e) === 'sabi') throw new Error('サビは複製できません');
  if (st.themeOnly && isBasic(e)) throw new Error('テーマのカードを選んでください');
  run.deck.push(e);
  return next(run);
}
// 改造（i のロボに mod を付ける）
function modCard(run, i, mod) {
  const st = run.step;
  if (run.phase !== 'mod') throw new Error('いまは改造できません');
  const e = run.deck[i]; if (e === undefined || CARDS[baseId(e)].kind !== 'robo') throw new Error('ロボを選んでください');
  if (e.includes('@')) throw new Error('改造できるのは1枚につき1回です');
  if (!st.mods.includes(mod)) throw new Error('その改造はできません');
  if (mod === 'e' && CARDS[baseId(e)].enterBat) throw new Error('もう付属電池があります');
  run.deck[i] = e + '@' + mod;
  return next(run);
}
// 分かれ道（次の相手のテーマを選ぶ。選んだテーマとの位置を入れ替える）
function chooseBranch(run, theme) {
  const st = run.step;
  if (run.phase !== 'branch' || !st.options.includes(theme)) throw new Error('テーマを選んでください');
  const a = run.nextRound - 1, b = run.oppThemes.indexOf(theme);
  [run.oppThemes[a], run.oppThemes[b]] = [run.oppThemes[b], run.oppThemes[a]];
  return next(run);
}
function next(run) { return advance(run); }

// 表示用：デッキを「名前 ×枚数」にまとめる（ロボ→アクション、攻撃力順。改造は別扱い）
function deckSummary(deck) {
  const cnt = {};
  for (const e of deck) cnt[e] = (cnt[e] || 0) + 1;
  return Object.keys(cnt).sort((a, b) => {
    const A = CARDS[baseId(a)], B = CARDS[baseId(b)];
    return (A.kind === B.kind ? 0 : A.kind === 'robo' ? -1 : 1) || ((A.atk || 0) - (B.atk || 0)) || A.name.localeCompare(B.name, 'ja') || a.localeCompare(b);
  }).map(e => ({ id: e, n: cnt[e] }));
}

const api = { advance, SIGNS, STRONG, applyEvent, EVENTS, START_OFFER, START_TAKE, OPP_EXTRA, CPU_BY_ROUND, cpuFor, ROUNDS, START_LIFE, LIFE_STEP, OFFER, TAKE, RARE_WEIGHT, THEME_KEYS,
  newRun, lifeFor, rewardPool, rarePool, foreignPool, oppDeck, battleSetup, finishBattle, takeCards, removeCard, chooseEvent, copyCard, modCard, chooseBranch, deckSummary, weightedPick, eventOk };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Run = api;
})(typeof window !== 'undefined' ? window : globalThis);
