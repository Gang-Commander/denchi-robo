// ===== 勝ち抜きモード（ローグライト）の進行 =====
// 画面に依存しない純粋なロジック。ランの状態はプレーンなオブジェクトで、そのまま localStorage に保存できる。
// 乱数の状態も run.rs に持つので、保存→再開しても同じ続きになる。
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
const HARD_FROM = 4;       // この回戦から、相手は「つよい」CPU
const THEME_KEYS = Object.keys(THEMES).filter(k => k !== 'common');

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

// ---------- ラン ----------
function newRun(seed) {
  const run = { v: 1, seed: seed | 0, rs: seed | 0, round: 1, nextRound: 1, phase: 'reward', deck: BASIC_DECK.slice(), taken: [], removed: [], offer: [], need: START_TAKE, history: [] };
  run.themes = shuffleWith(run, THEME_KEYS.slice()).slice(0, 2);
  run.oppThemes = shuffleWith(run, THEME_KEYS.slice());   // 相手は1戦ごとに別のテーマ
  run.offer = weightedPick(run, rewardPool(run), START_OFFER);
  return run;
}
function lifeFor(round) { return START_LIFE + LIFE_STEP * (round - 1); }
// 報酬の候補になりうるカード：自分の2テーマ＋共通。取ったカード・抜いたカードは除く
function rewardPool(run) {
  const ids = run.themes.concat('common').reduce((a, k) => a.concat(THEMES[k].ids), []);
  return ids.filter(id => !run.taken.includes(id) && !run.removed.includes(id));
}
// 相手のデッキ：基本デッキから r 枚抜き、テーマのカードを 3(r-1)+1 枚足す（自分と同じ枚数で、テーマのカードが1枚多い）。
// テーマのカードが足りなければ共通から足す。ラン内では同じ回戦なら同じデッキ
function oppDeck(run, round) {
  const o = { rs: (run.seed ^ Math.imul(round, 0x9E3779B1)) | 0 };
  const theme = run.oppThemes[round - 1];
  const add = 3 * (round - 1) + OPP_EXTRA, cut = (round - 1) + OPP_EXTRA;
  let picks = weightedPick(o, THEMES[theme].ids, add);
  if (picks.length < add) picks = picks.concat(weightedPick(o, THEMES.common.ids, add - picks.length));
  const basics = shuffleWith(o, BASIC_DECK.slice()).slice(cut);
  return { theme, deck: basics.concat(picks) };
}
// 対戦の結果を記録して、次の段階へ
function finishBattle(run, won, info) {
  run.history.push(Object.assign({ round: run.round, won: !!won, opp: run.oppThemes[run.round - 1] }, info || {}));
  if (!won) { run.phase = 'over'; return run; }
  if (run.round >= ROUNDS) { run.phase = 'clear'; return run; }
  run.offer = weightedPick(run, rewardPool(run), OFFER);
  run.need = TAKE; run.nextRound = run.round + 1;
  run.phase = 'reward';
  return run;
}
// 候補から run.need 枚取る（候補が足りない時は全部）
function takeCards(run, ids) {
  if (run.phase !== 'reward') throw new Error('いまは報酬を選べません');
  const need = Math.min(run.need, run.offer.length);
  if (ids.length !== need || new Set(ids).size !== ids.length || !ids.every(id => run.offer.includes(id))) throw new Error(`候補から${need}枚選んでください`);
  run.deck = run.deck.concat(ids); run.taken = run.taken.concat(ids);
  run.offer = []; run.phase = 'remove';
  return run;
}
// デッキから1枚抜く（i＝デッキ内の位置）。抜いたカードは、このランでは候補に出なくなる
function removeCard(run, i) {
  if (run.phase !== 'remove') throw new Error('いまはカードを抜けません');
  if (!(i >= 0 && i < run.deck.length)) throw new Error('抜くカードを選んでください');
  const id = run.deck.splice(i, 1)[0];
  if (!run.removed.includes(id)) run.removed.push(id);
  run.round = run.nextRound; run.phase = 'battle';
  return run;
}
// 表示用：デッキを「名前 ×枚数」にまとめる（ロボ→アクション、攻撃力順）
function deckSummary(deck) {
  const cnt = {};
  for (const id of deck) cnt[id] = (cnt[id] || 0) + 1;
  return Object.keys(cnt).sort((a, b) => {
    const A = CARDS[a], B = CARDS[b];
    return (A.kind === B.kind ? 0 : A.kind === 'robo' ? -1 : 1) || ((A.atk || 0) - (B.atk || 0)) || A.name.localeCompare(B.name, 'ja');
  }).map(id => ({ id, n: cnt[id] }));
}

const api = { START_OFFER, START_TAKE, OPP_EXTRA, HARD_FROM, ROUNDS, START_LIFE, LIFE_STEP, OFFER, TAKE, RARE_WEIGHT, THEME_KEYS, newRun, lifeFor, rewardPool, oppDeck, finishBattle, takeCards, removeCard, deckSummary, weightedPick };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Run = api;
})(typeof window !== 'undefined' ? window : globalThis);
