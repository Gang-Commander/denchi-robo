// ===== アプリ本体（UI・CPU進行・チュートリアル） =====
(function () {
'use strict';
const E = window.Engine, AI = window.AI, SP = window.Sprites;
const { CARDS } = E;
const TUNED = window.TUNED_W || AI.BASE_W;
const DIFF = {
  easy:   { label: 'やさしい', opt: { w: AI.BASE_W, randomRate: 0.45, noise: 4, ignoreSet: true } },
  normal: { label: 'ふつう',   opt: { w: AI.BASE_W } },
  hard:   { label: 'つよい',   opt: { w: TUNED } },
};
const EFF_LABEL = { powered: '通電', release: '放電', const: '常時', none: '効果なし' };
const EFF_HELP = {
  powered: '電池が1本以上入っている間（通電中）だけ働く効果。電池が0本だと止まる。',
  release: '電池を1本抜いて使う効果（行動1回）。',
  const: '場にいる限りずっと働く効果。',
  none: '効果を持たないロボ。',
};
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms / (typeof SPD === 'number' ? SPD : 1)));
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- ドット絵 ----------
const ART = {};
(function buildArt() {
  for (const [k, rows] of Object.entries(SP.SPR)) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    rows.forEach((row, y) => { for (let x = 0; x < 16; x++) { const ch = row[x]; if (ch !== '.') { g.fillStyle = SP.PAL[ch]; g.fillRect(x, y, 1, 1); } } });
    ART[k] = c.toDataURL();
  }
})();
// イラストのないカード（不採用案など）は文字で代用する
const img = (id, cls) => ART[id] ? `<img class="${cls || 'art'}" src="${ART[id]}" alt="" draggable="false">` : `<span class="${cls || 'art'} noart">NO<br>IMAGE</span>`;

// ---------- 状態 ----------
let G = null;      // { s, diff, opt, mode:'game'|'tut', busy, sel, tut, logIdx, flash:Set }
let stats = { easy: [0, 0], normal: [0, 0], hard: [0, 0] };
try { const v = JSON.parse(localStorage.getItem('denchi-stats') || 'null'); if (v) stats = Object.assign(stats, v); } catch (e) {}
function saveStats() { try { localStorage.setItem('denchi-stats', JSON.stringify(stats)); } catch (e) {} }

function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
  window.scrollTo(0, 0);
}

// ---------- カード描画 ----------
function batPips(y) {
  const max = E.capOf(y); let h = '';
  for (let i = 0; i < max; i++) h += `<i class="pip${i < y.bat ? ' on' : ''}"></i>`;
  return `<span class="pips" aria-label="電池 ${y.bat}/${max}">${h}</span>`;
}
// 場の外での攻撃力：最初から電池が入って出るロボは、その分を含めて表示する
// キーワード能力（効果文の1行目に表示）
const KEYWORDS = E.KEYWORDS;
function kwList(d) { return (d.enterBat ? [{ name: '付属電池' + d.enterBat, help: KEYWORDS.enterBat.help.replace(/N本/, d.enterBat + '本') }] : []).concat((d.kw || []).map(k => KEYWORDS[k])); }
// 本文の中のキーワード（破裂N など）は太字にする
function textKw(t) { for (const x of E.TERMS) if (x.kw) t = t.replace(x.kw, m => `<b class="kw">${m}</b>`); return t; }
function cardText(d) { const k = kwList(d); return (k.length ? `<b class="kw">${k.map(x => x.name).join('・')}</b>${d.text ? '<br>' : ''}` : '') + textKw(d.text); }
// 本文に出てくるルール用語の説明（詳細画面用）
function termHelp(d) {
  const hit = E.TERMS.filter(t => t.match.test(d.text));
  return hit.map(t => `<p class="kwhelp"><b>${t.word}</b>：${t.help}</p>`).join('');
}
function cardTextPlain(d) { const k = kwList(d); return (k.length ? k.map(x => x.name).join('・') + (d.text ? '／' : '') : '') + d.text; }
// 場の外での攻撃力：付属電池と改造（攻撃力+1）を含めて表示する
function shownAtk(c) { return E.atkOf({ id: c.id, bat: E.enterOf(c), atkPlus: c.atkPlus }); }
// 表示名：改造したカードは「改」を付ける
function cardName(c) { return CARDS[c.id].name + (E.isMod(c) ? '改' : ''); }
function modNote(c) { return c.atkPlus ? '攻撃力+1' : c.modMax ? '電池上限+1' : c.enterPlus ? '付属電池+1' : ''; }
function cardHTML(c, opts) {
  opts = opts || {};
  const d = CARDS[c.id];
  const cls = ['card', d.kind, opts.size || ''];
  if (opts.cls) cls.push(opts.cls);
  if (G && G.flash && G.flash.has(c.uid)) cls.push('flash');
  let style = '';
  if (G && G.drawFx && G.drawFx[c.uid] && opts.zone === 'hand') {
    const dl = G.drawFx[c.uid] - Date.now();
    if (dl > -450 / SPD) { cls.push('drawing'); style = ` style="animation-delay:${dl * SPD}ms"`; } else delete G.drawFx[c.uid];
  }
  if (G && G.deployFx && G.deployFx[c.uid] && opts.zone === 'field') {
    const dl = G.deployFx[c.uid] - Date.now();
    if (dl > -750 / SPD) { cls.push('deploying'); style = ` style="animation-delay:${dl * SPD}ms"`; } else delete G.deployFx[c.uid];
  }
  const attrs = `data-uid="${c.uid}"${opts.zone ? ` data-zone="${opts.zone}"` : ''}${style} title="${d.name}：${cardTextPlain(d)}"`;
  if (d.kind === 'robo') {
    const onField = opts.zone === 'field';
    const atk = onField ? E.atkOf(c) : shownAtk(c);
    const hurt = onField && c.dmg > 0;
    const boosted = !hurt && atk > d.atk + (c.atkPlus || 0);
    return `<button class="${cls.join(' ')}" ${attrs}>
      <span class="cname${cardName(c).length >= 6 ? ' long' : ''}">${cardName(c)}</span>${d.rare ? '<span class="rare" title="レア">★</span>' : ''}
      <span class="tag t-${d.eff}${onField && (d.eff === 'powered' || d.eff === 'release') ? (c.bat > 0 ? ' on' : ' off') : ''}">${EFF_LABEL[d.eff]}${onField && d.eff === 'powered' ? (c.bat > 0 ? ' ON' : ' OFF') : ''}</span>
      <span class="frame">${img(c.id)}</span>
      <span class="foot"><b class="atk${boosted ? ' up' : ''}${hurt ? ' hurt' : ''}">${atk}</b>${hurt ? `<span class="dmgchip" title="この手番に受けたダメージ（手番の終わりに消える）">−${c.dmg}</span>` : ''}${onField ? batPips(c) : batPips({ id: c.id, bat: E.enterOf(c), maxPlus: c.maxPlus })}</span>
      ${opts.badge ? `<span class="badge">${opts.badge}</span>` : ''}${opts.extra || ''}
    </button>`;
  }
  return `<button class="${cls.join(' ')}" ${attrs}>
    <span class="cname${d.name.length >= 6 ? ' long' : ''}">${d.name}</span>${d.rare ? '<span class="rare" title="レア">★</span>' : ''}
    <span class="tag t-spell${d.token ? ' t-token' : ''}">${d.token ? '特' : '術'}</span>
    <span class="frame">${img(c.id)}</span>
    <span class="foot"><span class="spl">アクション</span></span>
    ${opts.badge ? `<span class="badge">${opts.badge}</span>` : ''}
  </button>`;
}
function backHTML(opts) {
  opts = opts || {};
  return `<button class="card back ${opts.size || ''}${opts.cls ? ' ' + opts.cls : ''}" ${opts.data || ''}><span class="backart">${img('gear', 'bart')}</span>${opts.label ? `<span class="backlbl">${opts.label}</span>` : ''}</button>`;
}

// ---------- 盤面描画 ----------
// この対戦のライフの上限表示（勝ち抜きモードは回戦ごとに違う）
function lifeMax() { return G && G.run ? G.run.lifeMax : E.LIFE_MAX; }
function lifeHTML(p, pi) {
  let pips = '';
  const mx = lifeMax();
  for (let i = 0; i < mx; i++) pips += `<i class="${i < p.life ? 'on' : ''}"></i>`;
  return `<div class="life${p.life <= 5 ? ' low' : ''}" id="life${pi}"><span class="lnum">${p.life}<small>/${mx}</small></span><span class="lbar" aria-label="ライフ ${p.life}">${pips}</span></div>`;
}
function setSlotHTML(s, pi) {
  const p = s.players[pi];
  const tgt = selValid(`set${pi}`) ? ' tgt' : '';
  let inner;
  const coach = G.tut && G.tut.hlSet === pi ? ' coach' : '';
  if (!p.set) inner = `<div class="slot setslot empty${tgt}" data-set="${pi}" title="伏せ札なし"><span class="setlbl">伏せ札</span></div>`;
  else if (pi === 0) inner = `<div class="slot setslot filled${tgt}" data-set="0">${cardHTML(p.set, { zone: 'set', cls: 'facedown-own' + tgt + coach, badge: '伏' })}</div>`;
  else inner = `<div class="slot setslot filled${tgt}" data-set="1">${backHTML({ cls: 'opp-set' + tgt + coach, data: 'data-set="1"', label: '伏せ札' })}</div>`;
  return inner;
}
function infoHTML(s, pi) {
  const p = s.players[pi];
  return `<div class="who">${pi === 0 ? 'あなた' : 'CPU'}</div>
    ${lifeHTML(p, pi)}
    <div class="counts">
      <span class="cnt">山札<b>${p.deck.length}</b></span>
      <span class="cnt">手札<b>${p.hand.length}</b></span>
      <button class="cnt" data-scrap="${pi}">スクラップ<b>${p.scrap.length}</b></button>
    </div>`;
}
function fieldHTML(s, pi) {
  let f = s.players[pi].field.slice(); let h = '';
  if (G.holes && G.holes.length) {
    for (const hl of G.holes.filter(x => x.pi === pi).sort((a, b) => a.i - b.i)) if (hl.i <= f.length) f.splice(hl.i, 0, null);
    f = f.slice(0, 3);
  }
  for (let i = 0; i < 3; i++) {
    const y = f[i];
    if (y) {
      let cls = '';
      if (selValid(y.uid) || (pi === 0 && battleIdle())) cls += ' tgt';
      const pk = G.sel ? G.sel.picks.filter(u => u === y.uid).length : 0;
      if (pk) cls += ' picked';
      if (G.attackFx && (G.attackFx.att === y.uid)) cls += ' attacking';
      if (G.attackFx && (G.attackFx.tgt === y.uid)) cls += ' defending';
      if (G.tut && G.tut.hl && G.tut.hl.includes(y.id) && pi === 0) cls += ' coach';
      if (y.lim) cls += ' lim';
      if (y.home !== undefined && y.home !== pi) cls += ' hacked';
      if (E.guardsOf(s, pi).includes(y)) cls += ' guarding';
      h += `<div class="slot">${cardHTML(y, { zone: 'field', cls, badge: pk ? '×' + pk : '', })}</div>`;
    } else h += `<div class="slot empty"></div>`;
  }
  return h + setSlotHTML(s, pi);
}
function render() {
  if (!G) return;
  const s = G.s, me = s.players[0];
  $('#oppInfo').innerHTML = infoHTML(s, 1);
  $('#myInfo').innerHTML = infoHTML(s, 0);
  $('#oppInfo').classList.toggle('turn', s.turn === 1 && !E.isOver(s));
  $('#myInfo').classList.toggle('turn', s.turn === 0 && !E.isOver(s));
  $('#oppField').innerHTML = fieldHTML(s, 1);
  $('#oppField').classList.toggle('tgt-player', selValid('player'));
  $('#myField').innerHTML = fieldHTML(s, 0);
  // 手札
  let hh = '';
  for (const c of me.hand) {
    const coach = G.tut && G.tut.hl && G.tut.hl.includes(c.id) ? 'coach' : '';
    hh += cardHTML(c, { zone: 'hand', size: 'hand', cls: coach });
  }
  $('#hand').innerHTML = hh || '<p class="nohand">手札はありません</p>';
  const mine = s.turn === 0 && !E.isOver(s);
  let phase;
  if (E.isOver(s)) phase = '決着';
  else if (!mine) phase = 'CPUの手番';
  else if (s.phase === 'main') phase = `メイン <span class="acts">${'●'.repeat(s.actions)}${'○'.repeat(2 - s.actions)}</span>`;
  else phase = s.attacked ? 'バトル <span class="acts">済</span>' : 'バトル';
  $('#phase').innerHTML = `<span class="turnno">手番${s.turnNo}</span>${phase}`;
  const canEnd = mine && !G.busy && !s.pending && !G.sel;
  $('#endBtn').disabled = !canEnd;
  const bb = $('#battleBtn');
  bb.disabled = !canEnd || s.attacked;
  bb.textContent = s.phase === 'battle' ? '攻撃' : '戦闘';
  bb.classList.toggle('off', !!(canEnd && !s.attacked && battleErr()));
  $('#hint').textContent = hintText();
  renderTicker();
  renderSel();
  G.flash = new Set();
  fitLayout();
}
// 画面の幅と高さから札の大きさを決め、スクロールなしで盤面全体が収まるようにする
function fitLayout() {
  const game = $('#game'); if (game.hidden) return;
  const wrap = game.querySelector('.game-wrap'), board = $('#board');
  const cs = getComputedStyle(wrap);
  const W = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const H = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const wide = window.matchMedia('(min-width: 960px)').matches;
  const coach = $('#coach');
  const gapW = parseFloat(cs.rowGap) || 6;
  const bs = getComputedStyle(board), rowGap = parseFloat(bs.rowGap) || 6, colGap = parseFloat(bs.columnGap) || 6;
  const dbar = $('#dbgbar');
  let used = $('.topbar').offsetHeight + (coach.hidden ? 0 : coach.offsetHeight + gapW) + (dbar.hidden ? 0 : dbar.offsetHeight + gapW) + gapW + $('.midband').offsetHeight;
  const fieldChrome = 16, handChrome = 10, R = 7 / 5, slotGap = 6, setSep = 12;
  let fieldW;
  if (wide) { fieldW = W - 220 - 168 - colGap * 2; used += rowGap * 3; }
  else { fieldW = W; used += $('#oppInfo').offsetHeight + $('#myInfo').offsetHeight + rowGap * 5; }
  const cwW = (fieldW - fieldChrome - slotGap * 3 - setSep) / 4;
  const avail = H - used - handChrome;
  let cw = Math.min(cwW, (avail - fieldChrome * 2) / (R * 2 + R * 0.9), wide ? 116 : 104);
  if (wide) {
    // 右の情報パネルが札より高い時は、その高さで行が決まる
    const infoH = Math.max($('#oppInfo').scrollHeight, $('#myInfo').scrollHeight);
    if (cw * R + fieldChrome < infoH) cw = Math.min(cw, (avail - infoH * 2) / (R * 0.9));
  }
  cw = Math.max(40, Math.floor(cw));
  if (board.style.getPropertyValue('--cw') !== cw + 'px') board.style.setProperty('--cw', cw + 'px');
}
window.addEventListener('resize', () => { if (G) fitLayout(); });
function hintText() {
  const s = G.s;
  if (E.isOver(s)) return '';
  if (G.sel) return '';
  if (s.turn !== 0) return 'CPUが考えています…';
  if (battleIdle()) return '攻撃するロボをタップ（相手へドラッグでも可）';
  if (s.phase === 'main' && s.actions > 0) return 'タップで行動・ドラッグで起動/攻撃・長押しで詳細';
  if (s.phase === 'main' && !battleErr()) return '攻撃はロボを相手へドラッグ';
  return 'ターン終了を押そう';
}
function renderTicker() {
  const L = G.s.log.filter(l => l.msg);
  $('#ticker').innerHTML = L.slice(-3).map(l => `<li>${l.msg}</li>`).join('');
  const html = L.map(l => `<li class="${l.t === 'turn' ? 'lt' : ''}">${l.msg}</li>`).join('');
  $('#logList').innerHTML = html;
  const pane = $('#logPane');
  if (pane.dataset.n !== String(L.length)) { pane.innerHTML = html; pane.dataset.n = String(L.length); pane.scrollTop = pane.scrollHeight; }
}

// ---------- エフェクト ----------
// 状態を変える直前に盤面の札の位置と見た目を控えておき、変化後のログに合わせて演出する
function snapRects() {
  const m = { cards: {}, html: {}, idx: {} };
  ['#myField', '#oppField'].forEach((sel, pi) => document.querySelectorAll(`${sel} .slot:not(.setslot)`).forEach((sl, i) => { const c = sl.querySelector('.card[data-uid]'); if (c) m.idx[c.dataset.uid] = { pi, i }; }));
  document.querySelectorAll('#board .card[data-uid]').forEach(el => {
    const u = el.dataset.uid; m.cards[u] = el.getBoundingClientRect(); m.html[u] = el.outerHTML;
  });
  for (const pi of [0, 1]) { const l = document.getElementById('life' + pi); if (l) m['life' + pi] = l.getBoundingClientRect(); }
  if (G && G.s) m.hand = G.s.players[0].hand.map(c => c.uid);   // 引いたカードを後から見せるため
  for (const pi of [0, 1]) { const el = document.querySelector(`#board [data-set="${pi}"]`); if (el) { m['set' + pi] = el.getBoundingClientRect(); m['sethtml' + pi] = el.outerHTML; } }
  return m;
}
const fxLayer = () => $('#fx');
function rectOf(uid, snap) {
  const el = document.querySelector(`#board .card[data-uid="${uid}"]`);
  if (el) return el.getBoundingClientRect();
  return snap && snap.cards[uid] || null;
}
function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function addFx(cls, x, y, w, h, style) {
  const d = document.createElement('div');
  d.className = 'fxabs ' + cls;
  d.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;` + (style || '');
  fxLayer().appendChild(d);
  return d;
}
function killLater(el, ms) { setTimeout(() => el.remove(), ms / SPD); }
function particles(c, n, kind, spread, rise) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = spread * (0.5 + Math.random() * 0.6);
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r * 0.6 - (rise || 0) * (0.6 + Math.random() * 0.6);
    const p = addFx('px ' + (kind || ''), c.x - 3, c.y - 3, 6, 6, `--dx:${dx}px;--dy:${dy}px;--d:${0.55 + Math.random() * 0.45}s`);
    killLater(p, 1100);
  }
}
const at = (t, fn) => setTimeout(fn, t / SPD);

function fxSummon(uid, t) {
  G.deployFx[uid] = Date.now() + t / SPD;
  at(t + 30, () => {
    const r = rectOf(uid); if (!r) return;
    const c = center(r), w = r.width * 1.3;
    killLater(addFx('ring', c.x - w / 2, c.y - w / 2, w, w), 800);
    particles({ x: c.x, y: r.bottom - 8 }, 10, '', r.width * 0.5, 60);
  });
}
function fxDestroy(uid, snap, t) {
  const r = snap.cards[uid]; if (!r) return;
  const wrap = document.createElement('div');
  wrap.className = 'fxabs';
  wrap.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
  wrap.innerHTML = snap.html[uid];
  const card = wrap.firstElementChild; card.classList.add('ghost'); card.classList.remove('attacking', 'defending', 'tgt', 'coach', 'deploying');
  card.style.width = r.width + 'px'; card.style.height = r.height + 'px';
  fxLayer().appendChild(wrap);
  at(t, () => {
    card.classList.add('burn');
    const c = center(r);
    particles(c, 8, 'ember', r.width * 0.6, 50);
    particles(c, 10, 'ash', r.width * 0.7, 30);
  });
  killLater(wrap, t + 800);
}
function fxSetDestroy(pi, snap, t) {
  const r = snap['set' + pi]; if (!r) return;
  at(t, () => { const c = center(r); particles(c, 12, 'ember', 30, 30); killLater(addFx('boom', c.x - 30, c.y - 30, 60, 60), 500); });
}
// 攻撃宣言：照準を出し、攻撃するロボを光らせる（ぶつかるのは戦闘の解決時）
function fxAim(att, tgt, t) {
  at(t, () => {
    const el = document.querySelector(`#board .card[data-uid="${att}"]`);
    let tr;
    if (tgt === 'player') { const def = 1 - G.s.turn; const L = document.getElementById('life' + def); tr = L && L.getBoundingClientRect(); }
    else { const te = document.querySelector(`#board .card[data-uid="${tgt}"]`); tr = te && te.getBoundingClientRect(); }
    if (tr) killLater(addFx('reticle', tr.left - 4, tr.top - 4, tr.width + 8, tr.height + 8), 900);
    if (el && el.animate && !reduceMotion) el.animate([{ transform: 'none' }, { transform: 'translateY(-6px) scale(1.06)' }, { transform: 'none' }], { duration: 480, easing: 'ease-out' });
  });
}
// 戦闘：両者の攻撃力を大きく出して比べる
function fxClash(e, snap, t) {
  at(t, () => {
    for (const [uid, v, win] of [[e.att, e.a, e.a >= e.d], [e.tgt, e.d, e.d >= e.a]]) {
      const r = rectOf(uid, snap); if (!r) continue;
      const f = document.createElement('span');
      f.className = 'fxabs clashnum' + (win ? ' win' : ' lose');
      f.textContent = v;
      f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height * 0.42) + 'px';
      fxLayer().appendChild(f); killLater(f, 1100);
    }
  });
}
// 放電：カードに稲妻が走り「放電！」と出る
function fxDischarge(uid, snap, t) {
  at(t, () => {
    const el = document.querySelector(`#board .card[data-uid="${uid}"]`);
    const r = el ? el.getBoundingClientRect() : snap && snap.cards[uid]; if (!r) return;
    if (el) { el.classList.remove('discharge'); void el.offsetWidth; el.classList.add('discharge'); setTimeout(() => el.classList.remove('discharge'), 700); }
    const z = document.createElement('span'); z.className = 'fxabs zap';
    z.style.left = r.left + 'px'; z.style.top = r.top + 'px'; z.style.width = r.width + 'px'; z.style.height = r.height + 'px';
    z.innerHTML = '<svg viewBox="0 0 20 40" preserveAspectRatio="none"><path d="M12 0 L4 18 L10 18 L6 40 L17 14 L11 14 L15 0 Z"/></svg>';
    fxLayer().appendChild(z); killLater(z, 650);
    const l = document.createElement('span'); l.className = 'fxabs zaplabel'; l.textContent = '放電！';
    l.style.left = (r.left + r.width / 2) + 'px'; l.style.top = (r.top - 6) + 'px';
    fxLayer().appendChild(l); killLater(l, 900);
    particles(center(r), 14, '', r.width * 0.8, 24);
  });
}
// 中央のお知らせ枠（カードの絵つき）
function fxNotice(id, text, t) {
  at(t, () => {
    const d = document.createElement('div'); d.className = 'notice';
    d.innerHTML = `${img(id, 'nimg')}<div><b>${CARDS[id].name}</b><span>${text}</span></div>`;
    fxLayer().appendChild(d); killLater(d, 1500);
  });
}
function fxLunge(att, tgt, t) {
  at(t, () => {
    const el = document.querySelector(`#board .card[data-uid="${att}"]`); if (!el) return;
    const a = center(el.getBoundingClientRect());
    let tr;
    if (tgt === 'player') { const s = G.s; const def = 1 - s.turn; const L = document.getElementById('life' + def); tr = L && L.getBoundingClientRect(); }
    else { const te = document.querySelector(`#board .card[data-uid="${tgt}"]`); tr = te && te.getBoundingClientRect(); }
    if (!tr) return;
    const b = center(tr);
    killLater(addFx('reticle', tr.left - 4, tr.top - 4, tr.width + 8, tr.height + 8), 650);
    if (el.animate && !reduceMotion) el.animate([
      { transform: 'none' },
      { transform: `translate(${(b.x - a.x) * -0.06}px, ${(b.y - a.y) * -0.06}px) scale(1.04)`, offset: 0.25 },
      { transform: `translate(${(b.x - a.x) * 0.42}px, ${(b.y - a.y) * 0.42}px) scale(1.12) rotate(${b.x > a.x ? 4 : -4}deg)`, offset: 0.6 },
      { transform: 'none' }], { duration: 520, easing: 'ease-in-out' });
  });
}
function fxImpact(r, t, big) {
  at(t, () => {
    const c = center(r), s = Math.max(r.width, 60) * (big ? 1.5 : 1.2);
    killLater(addFx('boom', c.x - s / 2, c.y - s / 2, s, s), 500);
    for (const [deg, dl] of [[-35, 0], [35, 90]]) {
      at(dl, () => killLater(addFx('slash', c.x - s * 0.6, c.y - 3, s * 1.2, 6, `--r:${deg}deg`), 420));
    }
    particles(c, 10, 'ember', s * 0.6, 10);
    const tb = $('#board'); tb.classList.remove('shake'); void tb.offsetWidth; tb.classList.add('shake');
  });
}
// 電池は、入れる時はカードの上空から降り、抜く時は上空へ消える
function fxVolt(fromR, toR, t) {
  const above = r => ({ left: r.left + r.width / 2 - 11, top: r.top - Math.max(50, r.height * 0.6), width: 22, height: 22 });
  if (!fromR && toR) fromR = above(toR);
  if (fromR && !toR) toR = above(fromR);
  if (!fromR || !toR) return;
  at(t, () => {
    const a = center(fromR), b = center(toR);
    const w = document.createElement('img'); w.src = ART.battery; w.className = 'fxabs volt';
    w.style.left = (a.x - 11) + 'px'; w.style.top = (a.y - 11) + 'px';
    fxLayer().appendChild(w);
    const dx = b.x - a.x, dy = b.y - a.y;
    if (w.animate && !reduceMotion) w.animate([
      { transform: 'translate(0,0) scale(.6)', opacity: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.2)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.8)`, opacity: 0.9 }], { duration: 480, easing: 'ease-in-out', fill: 'forwards' });
    killLater(w, 500);
    at(470, () => particles(b, 6, '', 22, 10));
  });
}
// 電池の出し入れ：カードを光らせ、+1 / −1 を浮かべる。plus=true で入れた時、false で抜いた時
function fxBat(uid, n, plus, t, snap) {
  at(t, () => {
    const el = document.querySelector(`#board .card[data-uid="${uid}"]`);
    const r = el ? el.getBoundingClientRect() : snap && snap.cards[uid]; if (!r) return;
    if (el) { el.classList.remove('bat-in', 'bat-out'); void el.offsetWidth; el.classList.add(plus ? 'bat-in' : 'bat-out'); setTimeout(() => el.classList.remove('bat-in', 'bat-out'), 650); }
    const f = document.createElement('span');
    f.className = 'fxabs batfloat ' + (plus ? 'plus' : 'minus');
    f.textContent = (plus ? '+' : '−') + n;
    f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height * 0.25) + 'px';
    fxLayer().appendChild(f); killLater(f, 900);
    particles(center(r), plus ? 8 : 10, plus ? '' : 'frost', r.width * 0.5, plus ? 14 : 22);
  });
}
// ロボへのダメージ：衝撃と赤い −N
function fxRoboDmg(uid, n, t, snap) {
  at(t, () => {
    const el = document.querySelector(`#board .card[data-uid="${uid}"]`);
    const r = el ? el.getBoundingClientRect() : snap && snap.cards[uid]; if (!r) return;
    const f = document.createElement('span');
    f.className = 'fxabs batfloat hurt'; f.textContent = '−' + n;
    f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height * 0.35) + 'px';
    fxLayer().appendChild(f); killLater(f, 900);
    particles(center(r), 12, '', r.width * 0.6, 24);
  });
  const r0 = rectOf(uid, snap); if (r0) fxImpact(r0, t);
}
function fxCutin(id, pi, kind, t) {
  at(t, () => {
    const d = document.createElement('div');
    d.className = 'cutin p' + pi;
    const who = pi === 0 ? 'あなた' : 'CPU';
    d.innerHTML = `<div class="band"></div>${img(id, 'cimg')}<div class="ctext"><span>${kind === 'reveal' ? who + 'の伏せ札、オープン！' : who + 'のアクション'}</span><b>${CARDS[id].name}</b></div>`;
    fxLayer().appendChild(d);
    killLater(d, 1050);
  });
}
// ターン交代・バトル開始のカットイン
function fxBanner(kind, pi, title, sub, icon, t) {
  at(t, () => {
    const d = document.createElement('div');
    d.className = `cutin banner ${kind} p${pi}`;
    d.innerHTML = `<div class="band"></div>${icon ? `<img class="cimg" src="${ART[icon]}" alt="">` : ''}<div class="ctext"><span>${sub}</span><b>${title}</b></div>`;
    fxLayer().appendChild(d);
    killLater(d, 1050);
  });
}
function floatDamage(pi, n, t) {
  at(t || 30, () => {
    const el = document.getElementById('life' + pi); if (!el) return;
    const f = document.createElement('span'); f.className = 'dmg'; f.textContent = '-' + n;
    el.appendChild(f); setTimeout(() => f.remove(), 1200);
    el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 500);
  });
}
function floatHeal(pi, n, t) {
  at(t || 30, () => {
    const el = document.getElementById('life' + pi); if (!el) return;
    const f = document.createElement('span'); f.className = 'dmg heal'; f.textContent = '+' + n;
    el.appendChild(f); setTimeout(() => f.remove(), 1200);
  });
}
// ログを読んで演出を予約。全体の所要時間(ms)を返す
function playFx(events, snap) {
  if (reduceMotion) { for (const e of events) { if (e.t === 'damage') floatDamage(e.pi, e.n, 0); if (e.t === 'recycle') toast(`リサイクルロボの効果で${CARDS[e.id].name}が${e.pi === 0 ? '' : 'CPUの'}手札に戻った`); if ((e.t === 'win' || e.t === 'tie') && G.mode === 'game') at(300, gameOver); } return 150; }
  let t = 0, end = 0, skipSpell = false, lastDestroyEnd = 0;
  const drawn = new Set();
  for (const e of events) {
    switch (e.t) {
      case 'turn': if (e.pi === undefined) break; fxBanner('turn', e.pi, e.pi === 0 ? 'あなたのターン' : 'CPUのターン', `手番 ${(e.msg.match(/（(\d+)）/) || [])[1] || ''}`, e.pi === 0 ? 'battery' : 'bomb', t); t += 1000; break;
      case 'phase': fxBanner('battle', e.pi, 'バトル開始', e.pi === 0 ? 'あなたの攻撃' : 'CPUの攻撃', 'thunder', t); t += 1000; break;
      case 'deploy': {
        // 破壊で出てくるロボ（アニキロボ）は、元のロボが消え終わってから現れる
        const st = e.token ? Math.max(t, lastDestroyEnd) : t;
        fxSummon(e.uid, st); end = Math.max(end, st + 750); t = st + 250; break;
      }
      case 'crane': t = Math.max(t, lastDestroyEnd); break;   // 破壊し終わってから引く
      case 'draw': {
        // 引いたカードは、この時点で手札に現れる（それまでは隠しておく）
        if (e.pi === 0 && snap && snap.hand) {
          const fresh = G.s.players[0].hand.filter(c => !snap.hand.includes(c.uid) && !drawn.has(c.uid)).slice(-e.n);
          for (const c of fresh) { drawn.add(c.uid); if (t > 0) G.drawFx[c.uid] = Date.now() + t / SPD; }
        }
        t += 200; break;
      }
      case 'reveal': fxCutin(e.id, e.pi, 'reveal', t); t += 950; skipSpell = true; break;
      case 'spell': if (skipSpell) { skipSpell = false; break; } fxCutin(e.id, e.pi, 'spell', t); t += 950; break;
      case 'attack': fxAim(e.att, e.tgt, t); t += 500; break;
      case 'battle': { fxClash(e, snap, t); fxLunge(e.att, e.tgt, t + 350); const r = rectOf(e.tgt, snap); if (r) fxImpact(r, t + 650); t += 1000; break; }
      case 'direct': { fxLunge(e.att, 'player', t); const r = snap['life' + e.pi] || (document.getElementById('life' + e.pi) || {}).getBoundingClientRect?.(); if (r) fxImpact(r, t + 300, true); t += 700; break; }
      case 'destroy': fxDestroy(e.uid, snap, t); end = Math.max(end, t + 800); lastDestroyEnd = Math.max(lastDestroyEnd, t + 800); t += 150; break;
      case 'short': { const r = rectOf(e.uid, snap); fxVolt(r, null, t); fxBat(e.uid, e.n || 1, false, t, snap); if (r) at(t, () => particles(center(r), 12, '', r.width * 0.6, 20)); end = Math.max(end, t + 900); t += 300; break; }
      case 'setdestroy': fxSetDestroy(e.pi, snap, t); t += 300; break;
      case 'damage': floatDamage(e.pi, e.n, t); end = Math.max(end, t + 600); break;
      case 'robodmg': fxRoboDmg(e.uid, e.n, t, snap); end = Math.max(end, t + 900); t += 450; break;
      case 'heal': floatHeal(e.pi, e.n, t); end = Math.max(end, t + 600); t += 300; break;
      case 'bounce': { const r = rectOf(e.uid, snap); if (r) at(t, () => particles(center(r), 14, 'frost', r.width * 0.6, 18)); end = Math.max(end, t + 600); t += 300; break; }
      case 'reboot': fxNotice('reboot', e.pi === 0 ? 'リブートロボが手札に戻った' : 'リブートロボがCPUの手札に戻った', Math.max(t, lastDestroyEnd)); t = Math.max(t, lastDestroyEnd) + 1200; break;
      case 'junk': fxNotice(e.id, e.pi === 0 ? 'ジャンク回収で手札に戻った' : 'ジャンク回収でCPUの手札に戻った', t); t += 1500; break;
      case 'sorter': fxNotice(e.id, `検品ロボ：${e.to === 'hand' ? '手札に加えた' : 'スクラップに置いた'}${e.pi === 0 ? '' : '（CPU）'}`, t); t += 1500; break;
      case 'copy': { const r = rectOf(e.uid, snap); if (r) at(t + 300, () => particles(center(r), 14, '', r.width * 0.6, 16)); t += 300; break; }
      case 'bakushin': case 'scout': case 'garakuta': t += 150; break;
      case 'press': { const r = rectOf(e.uid, snap); if (r) fxImpact(r, t); t += 300; break; }
      case 'place': case 'batfly': case 'enterbat': case 'solar': fxVolt(null, rectOf(e.uid, snap), t); fxBat(e.uid, 1, true, t + 450, snap); end = Math.max(end, t + 1350); t += 200; break;
      case 'batmove': fxBat(e.from, 1, false, t, snap); fxVolt(rectOf(e.from, snap), rectOf(e.to, snap), t); fxBat(e.to, 1, true, t + 450, snap); end = Math.max(end, t + 1350); t += 250; break;
      case 'release': { fxDischarge(e.uid, snap, t); const r = rectOf(e.uid, snap); fxVolt(r, null, t + 150); fxBat(e.uid, 1, false, t + 150, snap); end = Math.max(end, t + 1000); t += 650; break; }
      case 'recycle': fxNotice(e.id, e.pi === 0 ? 'リサイクルロボの効果で手札に戻った' : 'リサイクルロボの効果でCPUの手札に戻った', t); t += 1500; break;
      case 'rocket': { const r = rectOf(e.uid, snap); if (r) { fxImpact(r, t); at(t, () => particles(center(r), 18, '', r.width * 0.9, 30)); } end = Math.max(end, t + 600); t += 450; break; }
      case 'daruma': { const r = rectOf(e.uid, snap); if (r) at(t, () => particles(center(r), 14, 'frost', r.width * 0.7, 10)); fxBat(e.uid, 1, false, t, snap); end = Math.max(end, t + 900); t += 250; break; }
      case 'swap': t += 200; break;
      case 'win': case 'tie': if (G.mode === 'game') at(Math.max(t, end) + 600, gameOver); break;
    }
  }
  return Math.max(t, end);
}
let toastTimer = null;
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 1800);
}
// 状態変更のあと：ログを演出に変えて再描画。演出の所要時間を返す
function refresh(snap) {
  const L = G.s.log, ev = L.slice(G.logIdx);
  G.logIdx = L.length;
  for (const e of ev) if (e.uid !== undefined && e.t !== 'deploy') G.flash.add(e.uid);
  const holes = [];
  if (snap) for (const e of ev) if (e.t === 'destroy' && snap.idx[e.uid]) holes.push(snap.idx[e.uid]);
  // 同じ場所に現れるロボ（コブン→アニキ）がいれば、その場所は空けておかなくてよい
  for (const e of ev) if (e.t === 'deploy' && e.token) {
    const i = G.s.players[e.pi].field.findIndex(y => y.uid === e.uid);
    const k = holes.findIndex(h => h.pi === e.pi && h.i === i); if (k >= 0) holes.splice(k, 1);
  }
  if (holes.length) G.holes = (G.holes || []).concat(holes);
  render();
  const ms = snap ? playFx(ev, snap) : 0;
  // 演出で「後から現れる」カード（起動・引いたカード）の遅延を反映するため、もう一度描く
  if (snap && ev.some(e => e.t === 'deploy' || e.t === 'draw')) render();
  if (holes.length) { const gid = G.id; setTimeout(() => { if (!G || G.id !== gid) return; G.holes = []; render(); }, (ms + 150) / SPD); }
  if (G.run) saveRunBattle();
  return ms;
}
// fn で状態を変え、演出が終わるまで待つ
// 伏せ札の応答がある攻撃を「伏せ発動 → 電池などの変化 → 戦闘 → ダメージ」の順に見せる。
// 伏せ札の処理後にいったん画面を更新し、変化後の攻撃力を見せてから戦闘を解決する
async function resolveAttackStaged(r) {
  const s = G.s, my = G.id;
  if (!r) return step(() => E.resolveBattle(s));
  await step(() => E.respondReveal(s, r));
  if (!G || G.id !== my) return;
  await sleep(reduceMotion ? 100 : 450);
  if (!G || G.id !== my) return;
  return step(() => E.resolveBattle(s));
}
async function step(fn) {
  const snap = snapRects();
  fn();
  const ms = refresh(snap);
  if (ms) await sleep(ms);
  return ms;
}

// ---------- 対象選択モード ----------
// sel = { prompt, valid:Set, picks:[], max, min, repeat, cap(uid)->n, onDone(picks), onCancel }
function selValid(key) { return !!(G && G.sel && G.sel.valid.has(key)); }
function startSel(o) {
  G.sel = Object.assign({ picks: [], max: 1, min: 1, repeat: false }, o);
  closeSheet(); render();
}
function renderSel() {
  const bar = $('#selbar');
  if (!G.sel) { bar.hidden = true; return; }
  bar.hidden = false;
  const s = G.sel;
  $('#selPrompt').textContent = s.prompt + (s.max > 1 ? `（${s.picks.length}/${s.max}）` : '');
  $('#selOk').hidden = !(s.max > 1);
  $('#selOk').disabled = s.picks.length < s.min;
}
function selPick(key) {
  const s = G.sel; if (!s || !s.valid.has(key)) return false;
  if (s.max === 1) { const done = s.onDone; G.sel = null; done([key]); return true; }
  const cnt = s.picks.filter(k => k === key).length;
  if (!s.repeat && cnt) { s.picks = s.picks.filter(k => k !== key); render(); return true; }
  const cap = s.cap ? s.cap(key) : 1;
  if (cnt >= cap) { if (s.repeat) s.picks = s.picks.filter(k => k !== key); render(); return true; }
  if (s.picks.length >= s.max) { toast(`選べるのは${s.max}つまでです`); return true; }
  s.picks.push(key); render(); return true;
}
function selCancel() { const s = G.sel; G.sel = null; if (s && s.onCancel) s.onCancel(); render(); }
function selOk() { const s = G.sel; if (!s || s.picks.length < s.min) return; G.sel = null; s.onDone(s.picks.slice()); }

// アクションの対象を集める（casterPi視点）。cb(ch) / cancel()
// pick（カード定義の対象指定）から対象を選ぶ。新しいカードは全部これを通る
function gatherPick(spec, casterPi, selfUid, cb, cancel) {
  const s = G.s;
  if (spec.zone === 'scrap') {
    const list = E.pickPool(s, casterPi, spec);
    if (!list.length) { toast(spec.none, 'err'); return cancel && cancel(); }
    return openSheet(`<h3>${spec.prompt}</h3><div class="glist">${list.map(c => cardHTML(c, { size: 'hand', cls: 'pickg' })).join('')}</div>
      <div class="row"><button class="btn ghost" id="hkCancel">やめる</button></div>`, sh => {
        sh.querySelectorAll('.pickg').forEach(b => b.addEventListener('click', () => { closeSheet(); cb({ uid: +b.dataset.uid }); }));
        sh.querySelector('#hkCancel').addEventListener('click', () => { closeSheet(); cancel && cancel(); });
      });
  }
  const pool = E.pickPool(s, casterPi, spec, selfUid);
  if (spec.player) {
    // スパークボム：相手プレイヤーか、ロボか
    return openSheet(`<h3>3ダメージを与える先を選ぶ</h3>
      <div class="row"><button class="btn primary" id="pkP">${casterPi === 0 ? 'CPU' : 'あなた'}に3ダメージ</button>
      <button class="btn${pool.length ? ' primary' : ' off'}" id="pkR">ロボを選ぶ</button></div>
      <div class="row"><button class="btn ghost" id="pkC">やめる</button></div>`, sh => {
        sh.querySelector('#pkP').addEventListener('click', () => { closeSheet(); cb({ target: 'player' }); });
        sh.querySelector('#pkR').addEventListener('click', () => {
          if (!pool.length) { toast('選べるロボがいません', 'err'); return; }
          startSel({ prompt: spec.prompt, valid: new Set(pool.map(y => y.uid)), onDone: p => cb({ target: p[0] }), onCancel: cancel });
        });
        sh.querySelector('#pkC').addEventListener('click', () => { closeSheet(); cancel && cancel(); });
      });
  }
  if (!pool.length) { if (spec.optional) return cb({}); toast(spec.none || '選べる対象がいません', 'err'); return cancel && cancel(); }
  return startSel({ prompt: spec.prompt, valid: new Set(pool.map(y => y.uid)), onDone: p => cb({ target: p[0] }), onCancel: cancel });
}
// 手札のロボを起動できるか（起動時に対象を選ぶロボは、選べる対象があるものとして調べる）
function playErr(c) {
  const d = CARDS[c.id];
  const t = d.deployPick && E.pickPool(G.s, 0, d.deployPick, c.uid)[0];
  return E.checkAction(G.s, { t: 'play', uid: c.uid, ch: t ? { target: t.uid } : {} });
}
// 手札のロボを起動する（コピーロボは起動時に対象を選ぶ）
function playRobo(c) {
  const d = CARDS[c.id];
  if (!d.deployPick) return humanAct({ t: 'play', uid: c.uid });
  const err = playErr(c);
  if (err) { toast(err, 'err'); return; }
  gatherPick(d.deployPick, 0, c.uid, ch => humanAct({ t: 'play', uid: c.uid, ch }), () => render());
}
function gatherSpell(id, casterPi, cb, cancel) {
  const s = G.s;
  const all = E.allField(s);
  if (id === 'junk') {
    const { robos, spells } = E.junkPool(s, casterPi);
    if (!robos.length && !spells.length) { toast('スクラップに戻せるカードがありません', 'err'); return cancel && cancel(); }
    const pickFrom = (list, title, next) => {
      if (!list.length) return next(undefined);
      openSheet(`<h3>${title}</h3><div class="glist">${list.map(c => cardHTML(c, { size: 'hand', cls: 'pickg' })).join('')}</div>
        <div class="row"><button class="btn ghost" id="hkCancel">やめる</button></div>`, sh => {
          sh.querySelectorAll('.pickg').forEach(b => b.addEventListener('click', () => { closeSheet(); next(+b.dataset.uid); }));
          sh.querySelector('#hkCancel').addEventListener('click', () => { closeSheet(); cancel && cancel(); });
        });
    };
    return pickFrom(robos, '手札に戻すロボを選ぶ', u => pickFrom(spells, '手札に戻すアクションを選ぶ', sid => cb(Object.assign({}, u !== undefined ? { uid: u } : {}, sid !== undefined ? { sid } : {}))));
  }
  if (CARDS[id].pick) return gatherPick(CARDS[id].pick, casterPi, null, cb, cancel);
  switch (id) {
    case 'overload': return cb({});
    case 'onemore': case 'emp': return cb({});
    case 'manual': {
      const ok = E.maintTargets(s, casterPi);
      if (!ok.length) return cb({});
      if (ok.length === 1) return cb({ target: ok[0].uid });
      return startSel({ prompt: '2枚引いたあと、電池を入れる自分のロボを選ぶ', valid: new Set(ok.map(y => y.uid)), onDone: p => cb({ target: p[0] }), onCancel: cancel });
    }
    case 'ebattery': {
      const ok = all.filter(y => !E.immuneFrom(y, s, casterPi) && y.bat < E.capOf(y));
      const n = Math.min(2, ok.reduce((a, y) => a + E.capOf(y) - y.bat, 0));
      if (!n) { toast('電池を入れられるロボがいません'); return cancel && cancel(); }
      return startSel({ prompt: '電池を入れるロボを選ぶ（同じロボを何度でも）', valid: new Set(ok.map(y => y.uid)), max: n, min: 1, repeat: true,
        cap: u => { const y = E.findRobo(s, u).y; return E.capOf(y) - y.bat; }, onDone: p => cb({ targets: p }), onCancel: cancel });
    }
    case 'thunder': {
      const c = E.thunderCandidates(s, casterPi);
      if (!c.length) { toast('破壊できるロボがいません（相手のバリアロボは効果を受けません）'); return cancel && cancel(); }
      if (c.length === 1) return cb({ target: c[0].uid });
      return startSel({ prompt: '破壊するロボを選ぶ（攻撃力が最も高いロボ）', valid: new Set(c.map(y => y.uid)), onDone: p => cb({ target: p[0] }), onCancel: cancel });
    }
    case 'hack': {
      if (s.players[casterPi].field.length >= 3) { toast('自分の場がいっぱいです（ロボは3体まで）'); return cancel && cancel(); }
      const ok = E.hackCandidates(s, casterPi);
      if (!ok.length) { toast('乗っ取れる相手のロボがいません（相手のバリアロボは効果を受けません）'); return cancel && cancel(); }
      if (ok.length === 1) return cb({ target: ok[0].uid });
      return startSel({ prompt: '乗っ取るロボを選ぶ（相手の場で攻撃力が最も高いロボ）', valid: new Set(ok.map(y => y.uid)), onDone: p => cb({ target: p[0] }), onCancel: cancel });
    }
    case 'limiter': {
      const ok = all.filter(y => !E.immuneFrom(y, s, casterPi));
      if (!ok.length) { toast('対象にできるロボがいません'); return cancel && cancel(); }
      return startSel({ prompt: 'リミッターを外すロボを選ぶ（' + E.LIM_LABEL + '・手番終了時に破壊）', valid: new Set(ok.map(y => y.uid)), onDone: p => cb({ target: p[0] }), onCancel: cancel });
    }
    case 'swap': {
      const from = all.filter(y => y.bat > 0 && !E.immuneFrom(y, s, casterPi));
      const to = all.filter(y => !E.immuneFrom(y, s, casterPi) && y.bat < E.capOf(y));
      if (!from.length || to.length < 1) { toast('電池を移せるロボがいません'); return cancel && cancel(); }
      return startSel({ prompt: '電池を取るロボを選ぶ', valid: new Set(from.map(y => y.uid)), onCancel: cancel,
        onDone: p => {
          const v = to.filter(y => y.uid !== p[0]);
          if (!v.length) { toast('移す先がありません'); return cancel && cancel(); }
          startSel({ prompt: '電池を移す先のロボを選ぶ', valid: new Set(v.map(y => y.uid)), onCancel: cancel, onDone: q => cb({ from: p[0], to: q[0] }) });
        } });
    }
    case 'repair': {
      if (s.players[casterPi].field.length >= 3) { toast('場のロボは3体までです'); return cancel && cancel(); }
      const list = [];
      for (const gpi of [0, 1]) for (const c of s.players[gpi].scrap) if (CARDS[c.id].kind === 'robo') list.push({ gpi, c });
      if (!list.length) { toast('スクラップにロボがいません'); return cancel && cancel(); }
      return openSheet(`<h3>スクラップから起動するロボ</h3><p class="sub">どちらのスクラップからでも選べます</p>
        <div class="glist">${list.map(o => `<div class="gitem"><span class="gown">${o.gpi === 0 ? 'あなたのスクラップ' : 'CPUのスクラップ'}</span>${cardHTML(o.c, { size: 'hand', cls: 'pickg', zone: 'g' + o.gpi })}</div>`).join('')}</div>
        <div class="row"><button class="btn ghost" id="hkCancel">やめる</button></div>`, sh => {
          sh.querySelectorAll('.pickg').forEach(b => b.addEventListener('click', () => {
            const uid = +b.dataset.uid, gpi = +b.dataset.zone.slice(1); closeSheet(); cb({ gpi, uid });
          }));
          sh.querySelector('#hkCancel').addEventListener('click', () => { closeSheet(); cancel && cancel(); });
        });
    }
  }
}

// ---------- 人間の行動 ----------
async function humanAct(a) {
  const s = G.s, my = G.id;
  if (G.busy) return;
  if (G.mode === 'tut' && !tutGate(a)) { render(); return; }
  const err = E.checkAction(s, a);
  if (err) { toast(err, 'err'); render(); return; }
  closePop();
  // ロケットロボで攻撃する時は、点火するか聞く
  if (a.t === 'attack' && a.boost === undefined && E.findRobo(s, a.att).y.id === 'rocket') {
    render();
    const b = await askRocket(s.players[0].life);
    if (b === null) { render(); return; }
    a = Object.assign({}, a, { boost: b });
  }
  if (a.t === 'attack') {
    G.busy = true; G.attackFx = { att: a.att, tgt: a.tgt };
    await step(() => E.apply(s, a));
    if (!G || G.id !== my) return;
    G.busy = false; render();
  } else {
    // 起動・電池・アクションなどは演出の終了を待たずに次の操作を受け付ける
    const snap = snapRects(); E.apply(s, a); const ms = refresh(snap);
    if ((a.t === 'end' || a.t === 'battle') && ms) {
      G.busy = true; render();
      await sleep(ms);
      if (!G || G.id !== my) return;
      G.busy = false; render();
    }
  }
  tutAfter(a);
  if (s.pending) return finishMyAttack();
  if (a.t !== 'end') maybeAutoEnd();
  if (a.t === 'end' && !E.isOver(s) && !(G.mode === 'tut' && !LESSONS[G.tut.i].cpuScript)) runCpu();
}
// メインの行動を使い切り、戦闘にも移れない（先攻1手番目・場にロボがいない・メガトンロボ）なら自動でターン終了
async function maybeAutoEnd() {
  const s = G.s, my = G.id;
  if (G.mode !== 'game' || s.turn !== 0 || E.isOver(s) || s.pending || s.phase !== 'main' || s.actions > 0) return;
  const why = battleErr(); if (!why) return;
  if (s.players[0].hand.some(c => CARDS[c.id].noCost)) return; // ワンモアが残っていればまだ行動できる
  G.busy = true; render();
  await sleep(reduceMotion ? 300 : 900);
  if (!G || G.id !== my || s.turn !== 0 || E.isOver(s)) return;
  toast('行動を使い切ったのでターン終了');
  G.busy = false;
  humanAct({ t: 'end' });
}
async function finishMyAttack() {
  const s = G.s, my = G.id;
  G.busy = true; render();
  await sleep(reduceMotion ? 50 : 150);
  if (!G || G.id !== my) return;
  if (E.needsResponse(s)) {
    let r;
    if (G.mode === 'tut') r = G.tut.cpuRespond ? G.tut.cpuRespond(s) : null;
    else r = AI.chooseResponseFor(s, G.opt);
    await resolveAttackStaged(r);
  } else await step(() => E.resolveBattle(s));
  if (!G || G.id !== my) return;
  G.attackFx = null; G.busy = false;
  render();
  tutAfter({ t: 'attack-resolved' });
  if (G.mode === 'debug') return dbgAfterMyBattle();
  // 攻撃は1手番に1回なので、戦闘が終わったら自動でターン終了
  if (G.mode === 'game' && !E.isOver(s) && s.turn === 0) {
    G.busy = true; render();
    await sleep(reduceMotion ? 200 : 600);
    if (!G || G.id !== my || E.isOver(s) || s.turn !== 0) return;
    G.busy = false;
    humanAct({ t: 'end' });
  }
}

// ---------- CPU ----------
async function runCpu() {
  const s = G.s; G.busy = true; render();
  const my = G.id;
  let guard = 0;
  while (G && G.id === my && s.turn === 1 && !E.isOver(s) && guard++ < 30) {
    await sleep(reduceMotion ? 150 : 650);
    if (!G || G.id !== my) return;
    let a;
    if (G.mode === 'tut') a = (G.tut.cpuScript && G.tut.cpuScript.shift()) || { t: 'end' };
    else if (G.mode === 'debug') a = dbgCpuAction(s);
    else a = AI.chooseAction(s, G.opt) || { t: 'end' };
    if (a.t === 'attack') G.attackFx = { att: a.att, tgt: a.tgt };
    await step(() => { try { E.apply(s, a); } catch (e) { console.warn(e); E.apply(s, { t: 'end' }); } });
    if (!G || G.id !== my) return;
    if (s.pending) {
      await sleep(reduceMotion ? 100 : 200);
      if (!G || G.id !== my) return;
      if (E.needsResponse(s)) { const r = await humanRespond(); await resolveAttackStaged(r); }
      else await step(() => E.resolveBattle(s));
      if (!G || G.id !== my) return;
      G.attackFx = null; render();
      tutAfter({ t: 'cpu-attack-resolved' });
    }
  }
  if (!G || G.id !== my) return;
  G.busy = false; render();
  tutAfter({ t: 'cpu-turn-done' });
  if (G.mode === 'debug') dbgTurnStart(false);
}
// ロケットロボの点火の確認。true / false / null（やめる＝攻撃をやめる）
function askRocket(life, defending) {
  return new Promise(resolve => openSheet(`<h3>ロケットロボを点火する？</h3>
    <p class="sub">点火すると、あなたが4ダメージを受けて、この戦闘の間ロケットロボの攻撃力が+5されます（いまのライフ ${life}）。</p>
    <div class="row"><button class="btn" id="rkNo">点火しない</button><button class="btn primary" id="rkYes">点火する</button></div>
    ${defending ? '' : '<div class="row"><button class="btn ghost" id="rkC">攻撃をやめる</button></div>'}`, sh => {
      sh.querySelector('#rkNo').addEventListener('click', () => { closeSheet(); resolve(false); });
      sh.querySelector('#rkYes').addEventListener('click', () => { closeSheet(); resolve(true); });
      const c = sh.querySelector('#rkC'); if (c) c.addEventListener('click', () => { closeSheet(); resolve(null); });
    }, true));
}
// 攻撃された時の応答：伏せ札（あれば）→ ロケットロボの点火（攻撃されたのがロケットなら）
async function humanRespond() {
  const s = G.s;
  let r = E.canRespondSet(s) ? await humanRespondSet() : null;
  if (E.rocketDefends(s)) { if (await askRocket(s.players[0].life, true)) r = Object.assign({}, r || {}, { boost: true }); }
  return r;
}
function humanRespondSet() {
  return new Promise(resolve => {
    const s = G.s, p = s.pending;
    const A = E.findRobo(s, p.att).y;
    const tn = p.tgt === 'player' ? 'あなた' : 'あなたの' + CARDS[E.findRobo(s, p.tgt).y.id].name;
    const set = s.players[0].set;
    const ask = () => openSheet(`<h3 class="warn">${CARDS[A.id].name}（攻撃力${E.atkOf(A)}）が${tn}に攻撃！</h3>
      <p class="sub">セットしたアクションを表にして発動できます。</p>
      <div class="respond">${cardHTML(set, { size: 'big' })}<p>${CARDS[set.id].text}</p></div>
      ${statusHTML()}
      <div class="row"><button class="btn" id="rNo">発動しない</button><button class="btn primary" id="rYes">発動する</button></div>`, sh => {
        sh.querySelector('#rNo').addEventListener('click', () => {
          if (G.mode === 'tut' && !tutGate({ t: 'respond', resp: null })) return;
          closeSheet(); resolve(null);
        });
        sh.querySelector('#rYes').addEventListener('click', () => {
          closeSheet();
          gatherSpell(set.id, 0, ch => {
            const err = E.respondChoiceError(s, ch);
            if (err) { toast(err, 'err'); return ask(); }
            if (G.mode === 'tut' && !tutGate({ t: 'respond', resp: { ch }, id: set.id })) { render(); return ask(); }
            render(); resolve({ ch });
          }, () => ask());
        });
      }, true);
    ask();
  });
}

// ---------- 詳細シート ----------
function openSheet(html, bind, modal) {
  const sh = $('#sheet'), bd = $('#sheetBack');
  sh.innerHTML = html; sh.hidden = false; bd.hidden = false;
  bd.dataset.modal = modal ? '1' : '';
  if (bind) bind(sh);
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBack').hidden = true; }

function cardInfoHTML(c, zone) {
  const d = CARDS[c.id];
  let meta = '';
  if (d.kind === 'robo') {
    const atkNow = zone === 'field' ? E.atkOf(c) : shownAtk(c);
    meta = `<dl class="meta"><div><dt>攻撃力</dt><dd>${atkNow}${atkNow !== d.atk ? `<small>（基本${d.atk}）</small>` : ''}</dd></div>
      <div><dt>電池上限</dt><dd>${zone === 'field' ? c.bat + ' / ' : ''}${d.max}</dd></div>
      <div><dt>効果の種類</dt><dd>${EFF_LABEL[d.eff]}</dd></div></dl>
      <p class="effhelp">${EFF_HELP[d.eff]}</p>`;
  } else meta = `<p class="effhelp">手札から発動（行動1回）するか、セットして相手の攻撃宣言時に発動できます。</p>`;
  const idle = zone === 'field' && d.kind === 'robo' && (d.eff === 'powered' || d.eff === 'release') && c.bat <= 0;
  const idleNote = idle ? `<p class="idlenote">${d.eff === 'powered' ? '電池が入っていないので、この効果は止まっています（OFF）。' : '電池が入っていないので、放電効果は使えません。'}</p>` : '';
  return `<div class="info">${cardHTML(c, { size: 'big', zone })}<div class="itext"><h3>${d.name}</h3>${meta}<p class="etext${idle ? ' idle' : ''}">${cardText(d)}</p>${kwList(d).map(k => `<p class="kwhelp"><b>${k.name}</b>：${k.help}</p>`).join('')}${termHelp(d)}${idleNote}</div></div>`;
}
function openCard(uid, zoneHint) {
  const s = G.s;
  if (G.sel) return;
  const me = s.players[0];
  let c, zone, owner;
  const f = E.findRobo(s, uid);
  if (f) { c = f.y; zone = 'field'; owner = f.pi; }
  else if (me.hand.find(x => x.uid === uid)) { c = me.hand.find(x => x.uid === uid); zone = 'hand'; owner = 0; }
  else if (me.set && me.set.uid === uid) { c = me.set; zone = 'set'; owner = 0; }
  else { for (const p of s.players) { const g = p.scrap.find(x => x.uid === uid); if (g) { c = g; zone = 'scrap'; } } }
  if (!c) return;
  const d = CARDS[c.id];
  const myTurn = s.turn === 0 && !G.busy && !E.isOver(s) && !s.pending;
  const acts = [];
  const can = a => myTurn && !E.checkAction(s, a);
  const why = a => myTurn ? E.checkAction(s, a) : 'いまはあなたの手番ではありません';
  if (owner === 0 && (zone === 'hand' || zone === 'set')) {
    if (d.kind === 'robo') acts.push({ k: 'play', label: '起動する', a: { t: 'play', uid } });
    else {
      acts.push({ k: 'cast', label: '発動する', a: { t: 'play', uid, ch: {} }, spell: true });
      if (zone === 'hand') acts.push({ k: 'set', label: 'セットする', a: { t: 'set', uid } });
    }
  }
  if (zone === 'field' && owner === 0) {
    acts.push({ k: 'place', label: '電池を入れる', a: { t: 'place', target: uid } });
    if (d.eff === 'release') acts.push({ k: 'release', label: '放電効果を使う', a: null });
  }
  let btns = '';
  for (const x of acts) {
    let err;
    if (x.k === 'cast') err = myTurn ? (E.isJammed(s, 0) ? 'ジャマーロボがいるので、アクションを使えません' : s.phase !== 'main' || s.actions <= 0 ? 'この手番の行動は使い切りました' : null) : why({});
    else if (x.k === 'release') {
      err = !myTurn ? why({}) : (s.actions <= 0 || s.phase !== 'main') ? '行動がありません' : c.bat <= 0 ? '電池が入っていません' :
        (c.id === 'souji' && !s.players[0].set && !s.players[1].set) ? 'セットされたアクションがありません' :
        (c.id === 'magnet' && !s.players[1].field.some(y => !E.immuneFrom(y, s, 0))) ? '入れ替えられる相手のロボがいません' :
        (c.id === 'sniper' && !E.sniperCandidates(s, c.uid).length) ? 'ほかに場にロボがいません' :
        (CARDS[c.id].pick && !E.pickPool(s, 0, CARDS[c.id].pick, c.uid).length) ? CARDS[c.id].pick.none : null;
    } else if (x.k === 'attack') {
      err = !myTurn ? why({}) : s.firstTurn ? '先攻の最初の手番は攻撃できません' : s.attacked ? 'この手番はもう攻撃しました' : s.noAttack ? 'メガトンロボの効果で攻撃できません' : null;
    } else if (x.k === 'play') err = myTurn ? playErr(c) : why({});
    else err = why(x.a);
    btns += `<button class="btn${err ? ' off' : ' primary'}" data-k="${x.k}" ${err ? `data-why="${err}"` : ''}>${x.label}</button>`;
  }
  openSheet(`${cardInfoHTML(c, zone)}${btns ? `<div class="row acts">${btns}</div>` : ''}<p class="why" id="why"></p>
    <div class="row"><button class="btn ghost" id="shClose">閉じる</button></div>`, sh => {
      sh.querySelector('#shClose').addEventListener('click', closeSheet);
      sh.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.why) { sh.querySelector('#why').textContent = b.dataset.why; return; }
        doCardAction(b.dataset.k, c);
      }));
    });
}
function doCardAction(k, c) {
  const s = G.s, uid = c.uid;
  closeSheet();
  if (k === 'play') return playRobo(c);
  if (k === 'set') return humanAct({ t: 'set', uid });
  if (k === 'place') return humanAct({ t: 'place', target: uid });
  if (k === 'cast') return gatherSpell(c.id, 0, ch => humanAct({ t: 'play', uid, ch }), () => render());
  if (k === 'release') {
    if (c.id === 'souji') {
      const v = new Set(); if (s.players[0].set) v.add('set0'); if (s.players[1].set) v.add('set1');
      return startSel({ prompt: '破壊するセットアクションを選ぶ', valid: v, onDone: p => humanAct({ t: 'release', src: uid, ch: { pi: p[0] === 'set0' ? 0 : 1 } }) });
    }
    if (c.id === 'sniper') {
      const cand = E.sniperCandidates(s, uid);
      if (cand.length === 1) return humanAct({ t: 'release', src: uid, ch: { target: cand[0].uid } });
      return startSel({ prompt: '破壊するロボを選ぶ（場で攻撃力が最も高いロボ）', valid: new Set(cand.map(y => y.uid)), onDone: p => humanAct({ t: 'release', src: uid, ch: { target: p[0] } }) });
    }
    if (CARDS[c.id].pick) return gatherPick(CARDS[c.id].pick, 0, uid, ch => humanAct({ t: 'release', src: uid, ch }), () => render());
    if (c.id === 'medic') return humanAct({ t: 'release', src: uid, ch: {} });
    if (c.id === 'magnet') return startSel({ prompt: 'マグネットロボと入れ替える相手のロボを選ぶ', valid: new Set(s.players[1].field.filter(y => !E.immuneFrom(y, s, 0)).map(y => y.uid)), onDone: p => humanAct({ t: 'release', src: uid, ch: { target: p[0] } }) });
  }
  if (k === 'attack') {
    if (!s.players[1].field.length) return humanAct({ t: 'attack', att: uid, tgt: 'player' });
    return startSel({ prompt: `${CARDS[c.id].name}の攻撃対象を選ぶ`, valid: new Set(s.players[1].field.map(y => y.uid)), onDone: p => humanAct({ t: 'attack', att: uid, tgt: p[0] }) });
  }
}
function openScrap(pi) {
  const g = G.s.players[pi].scrap;
  openSheet(`<h3>${pi === 0 ? 'あなた' : 'CPU'}のスクラップ（${g.length}枚）</h3>
    <div class="glist">${g.map(c => cardHTML(c, { size: 'hand', zone: 'scrap' })).join('') || '<p class="sub">まだありません</p>'}</div>
    <div class="row"><button class="btn ghost" id="gClose">閉じる</button></div>`, sh => {
      sh.querySelector('#gClose').addEventListener('click', closeSheet);
      sh.querySelectorAll('.glist .card').forEach(b => b.addEventListener('click', () => openCard(+b.dataset.uid)));
    });
}

// ---------- ワンタップ操作 ----------
// 手札のロボはタップで即起動、アクションはタップで小メニュー。場のロボには +電池 / ⚔ / 解 のボタンを直接出す。
// 詳細は長押し（右クリック）で開く。
function canQuick() { const s = G.s; return s.turn === 0 && !G.busy && !s.pending && !E.isOver(s) && !G.sel; }
function quickErr(k, c) {
  const s = G.s;
  if (!canQuick()) return 'いまは操作できません';
  if (k === 'place') return E.checkAction(s, { t: 'place', target: c.uid });
  if (k === 'attack') {
    const O = s.players[1].field;
    return E.checkAction(s, { t: 'attack', att: c.uid, tgt: O.length ? O[0].uid : 'player' });
  }
  if (k === 'release') {
    if (c.id === 'souji') { const pi = s.players[1].set ? 1 : s.players[0].set ? 0 : 1; return E.checkAction(s, { t: 'release', src: c.uid, ch: { pi } }); }
    if (c.id === 'magnet') { const O = s.players[1].field.filter(y => !E.immuneFrom(y, s, 0)); return E.checkAction(s, { t: 'release', src: c.uid, ch: { target: O.length ? O[0].uid : -1 } }); }
    if (c.id === 'sniper') { const t = E.sniperCandidates(s, c.uid)[0]; return t ? E.checkAction(s, { t: 'release', src: c.uid, ch: { target: t.uid } }) : 'ほかに場にロボがいません'; }
    if (CARDS[c.id].pick) { const t = E.pickPool(s, 0, CARDS[c.id].pick, c.uid)[0]; return t ? E.checkAction(s, { t: 'release', src: c.uid, ch: { target: t.uid } }) : CARDS[c.id].pick.none; }
    if (c.id === 'medic') return E.checkAction(s, { t: 'release', src: c.uid, ch: {} });
    return '放電効果を持っていません';
  }
  return null;
}
function cardByUid(uid) {
  const s = G.s, me = s.players[0];
  const f = E.findRobo(s, uid); if (f) return f.y;
  return me.hand.find(x => x.uid === uid) || (me.set && me.set.uid === uid ? me.set : null);
}
// 手札・伏せ札のアクション用の小メニュー
function openPop(anchor, items) {
  const pop = $('#pop');
  pop.innerHTML = items.map((it, i) => `<button class="btn${it.primary ? ' primary' : ''}${it.err ? ' off' : ''}" data-i="${i}">${it.label}</button>`).join('');
  pop.hidden = false;
  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = r.left + r.width / 2 - pw / 2; x = Math.max(8, Math.min(window.innerWidth - pw - 8, x));
  let y = r.top - ph - 8; if (y < 8) y = r.bottom + 8;
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  pop.onclick = e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const it = items[+b.dataset.i];
    if (it.err) { toast(it.err, 'err'); return; }
    closePop(); it.run();
  };
}
function closePop() { const p = $('#pop'); if (p) p.hidden = true; }
function spellPop(el, c, zone) {
  const s = G.s;
  const items = [{ label: '発動', primary: true, err: castErr(c), run: () => doCardAction('cast', c) }];
  if (zone === 'hand' && !CARDS[c.id].noSet) items.push({ label: 'セット', primary: true, err: canQuick() ? E.checkAction(s, { t: 'set', uid: c.uid }) : 'いまは操作できません', run: () => doCardAction('set', c) });
  items.push({ label: '詳細', run: () => openCard(c.uid) });
  openPop(el, items);
}
function onQuick(qa) {
  const c = cardByUid(+qa.dataset.uid); if (!c) return;
  const k = qa.dataset.qa, err = quickErr(k, c);
  if (err) { toast(err, 'err'); return; }
  doCardAction(k, c);
}
function onHandTap(el) {
  const c = cardByUid(+el.dataset.uid); if (!c) return;
  if (CARDS[c.id].kind === 'spell') return spellPop(el, c, 'hand');
  const err = canQuick() ? playErr(c) : 'いまは操作できません';
  openPop(el, [
    { label: '起動', primary: true, err, run: () => playRobo(c) },
    { label: '詳細', run: () => openCard(c.uid) },
  ]);
}
function onMyFieldTap(el) {
  const c = cardByUid(+el.dataset.uid); if (!c) return;
  if (battleIdle()) return pickTarget(c.uid);
  const items = [{ label: '+電池', primary: true, err: quickErr('place', c), run: () => humanAct({ t: 'place', target: c.uid }) }];
  if (CARDS[c.id].eff === 'release') items.push({ label: '放電', primary: true, err: quickErr('release', c), run: () => doCardAction('release', c) });
  items.push({ label: '詳細', run: () => openCard(c.uid) });
  openPop(el, items);
}
// ---------- バトルフェイズ ----------
function battleIdle() { const s = G.s; return !!G && s.turn === 0 && s.phase === 'battle' && !s.attacked && !s.pending && !G.busy && !G.sel && !E.isOver(s); }
function battleErr() {
  const s = G.s;
  if (s.phase === 'battle') return s.attacked ? 'この手番はもう攻撃しました' : null;
  return E.checkAction(s, { t: 'battle' });
}
function pickAttacker() {
  const own = G.s.players[0].field;
  if (own.length === 1) return pickTarget(own[0].uid);
  startSel({ prompt: '攻撃するロボを選ぶ', valid: new Set(own.map(y => y.uid)), onDone: p => pickTarget(p[0]), onCancel: () => render() });
}
function pickTarget(att) {
  const s = G.s, O = s.players[1].field, name = CARDS[cardByUid(att).id].name;
  if (!O.length) return humanAct({ t: 'attack', att, tgt: 'player' });
  const gs = E.guardsOf(s, 1), cand = gs.length ? gs : O;
  startSel({ prompt: gs.length ? `${name}の攻撃対象を選ぶ（挑発しているロボしか狙えません）` : `${name}の攻撃対象を選ぶ`, valid: new Set(cand.map(y => y.uid)), onDone: p => humanAct({ t: 'attack', att, tgt: p[0] }), onCancel: () => render() });
}
async function onBattleBtn() {
  if (!G || !canQuick()) return;
  if (!(await enterBattle())) { render(); return; }
  pickAttacker();
}
// 長押し・右クリックで詳細
let lpTimer = null, lpFired = false;
function bindLongPress(root) {
  root.addEventListener('pointerdown', e => {
    const c = e.target.closest('.card[data-uid]'); if (!c || e.button > 0) return;
    lpFired = false; clearTimeout(lpTimer);
    const x0 = e.clientX, y0 = e.clientY;
    lpTimer = setTimeout(() => { lpFired = true; closePop(); if (!G.sel) openCard(+c.dataset.uid); }, 450);
    const cancel = ev => { if (ev.type !== 'pointermove' || Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { clearTimeout(lpTimer); off(); } };
    const off = () => { ['pointerup', 'pointercancel', 'pointermove', 'pointerleave'].forEach(t => root.removeEventListener(t, cancel)); };
    ['pointerup', 'pointercancel', 'pointermove', 'pointerleave'].forEach(t => root.addEventListener(t, cancel));
  });
  root.addEventListener('contextmenu', e => {
    const c = e.target.closest('.card[data-uid]'); if (!c) return;
    e.preventDefault(); closePop(); if (!G.sel) openCard(+c.dataset.uid);
  });
}

// ---------- ドラッグ＆ドロップ ----------
// 手札のロボ → 自分の場で起動。
// アクション（手札・伏せ札）→ 伏せ札枠でセット、場に落とすと確認のうえ発動。
// スマホでは横方向のスワイプは手札のスクロールに残し、上方向に引いたときだけドラッグにする。
let dragFired = false;
function castErr(c) {
  const s = G.s;
  if (!canQuick()) return 'いまは操作できません';
  if (s.phase !== 'main') return 'バトルフェイズ中はアクションを発動できません';
  if (E.isJammed(s, 0)) return 'ジャマーロボがいるので、アクションを使えません';
  if (s.actions <= 0 && !(c && CARDS[c.id].noCost)) return 'この手番の行動は使い切りました';
  return null;
}
// ドロップ先の候補（先に書いたものが優先）
function dropZones(c, fromSet) {
  const s = G.s;
  if (CARDS[c.id].kind === 'robo') return [{ el: $('#myField'), act: 'play', label: '起動', err: playErr(c) }];
  const z = [];
  if (!fromSet) z.push({ el: document.querySelector('#myField .setslot'), act: 'set', label: 'セット', err: E.checkAction(s, { t: 'set', uid: c.uid }) });
  else z.push({ el: document.querySelector('#myField .setslot'), act: 'none' });
  const ce = castErr(c);
  z.push({ el: $('#myField'), act: 'cast', label: '発動', err: ce });
  z.push({ el: $('#oppField'), act: 'cast', label: '発動', err: ce });
  return z.filter(x => x.el);
}
// 確認ダイアログ用：両者のライフとスクラップ（新しい順）を表示
function statusHTML() {
  const s = G.s;
  const side = pi => {
    const P = s.players[pi], g = P.scrap.slice().reverse();
    const list = g.length ? g.map(c => `<span class="chip ${CARDS[c.id].kind}">${CARDS[c.id].name}</span>`).join('') : '<span class="sub">なし</span>';
    return `<div class="st-side"><div class="st-head"><b>${pi === 0 ? 'あなた' : 'CPU'}</b><span class="st-life">ライフ <b>${P.life}</b>/${lifeMax()}</span></div>
      <details><summary>スクラップ ${g.length}枚（新しい順）</summary><div class="st-chips">${list}</div></details></div>`;
  };
  return `<div class="statusbox">${side(1)}${side(0)}</div>`;
}
function confirmCast(c) {
  return new Promise(resolve => {
    openSheet(`<h3>${CARDS[c.id].name}を発動しますか？</h3>
      <div class="respond">${cardHTML(c, { size: 'big' })}<p>${CARDS[c.id].text}</p></div>
      ${statusHTML()}
      <div class="row"><button class="btn" id="ccNo">いいえ</button><button class="btn primary" id="ccYes">はい</button></div>`, sh => {
        sh.querySelector('#ccNo').addEventListener('click', () => { closeSheet(); resolve(false); });
        sh.querySelector('#ccYes').addEventListener('click', () => { closeSheet(); resolve(true); });
      }, true);
  });
}
function bindDrag(root) {
  root.addEventListener('pointerdown', e => {
    const el = e.target.closest('#hand .card[data-uid], #myField .setslot .card[data-uid]');
    if (!el || e.button > 0 || !G || !canQuick()) return;
    const c = cardByUid(+el.dataset.uid); if (!c) return;
    const fromSet = el.dataset.zone === 'set';
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    let ghost = null, zones = [], over = null, offX = 0, offY = 0;
    const start = ev => {
      clearTimeout(lpTimer); closePop();
      const r = el.getBoundingClientRect(); offX = x0 - r.left; offY = y0 - r.top;
      ghost = el.cloneNode(true); ghost.classList.add('drag-ghost'); ghost.removeAttribute('title');
      // 引いたばかりのカードは登場アニメ（最終フレーム保持）が付いたまま。アニメは inline の transform より強いので、
      // そのままだと位置指定が効かず左上に固定される。演出用のクラスとアニメを外す
      ghost.classList.remove('drawing', 'deploying', 'flash', 'bat-in', 'bat-out'); ghost.style.animation = 'none'; ghost.style.animationDelay = '';
      ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
      document.body.appendChild(ghost);
      el.classList.add('dragging');
      zones = dropZones(c, fromSet);
      for (const z of zones) if (z.act !== 'none') { z.el.classList.add(z.err ? 'drop-ng' : 'drop-ok'); z.el.dataset.drop = z.label; }
      place(ev);
    };
    const place = ev => {
      ghost.style.transform = `translate(${ev.clientX - offX}px, ${ev.clientY - offY}px) rotate(-4deg)`;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const z = hit ? zones.find(z => z.el.contains(hit)) : null;
      if (over !== z) {
        if (over) over.el.classList.remove('drop-over');
        over = z || null;
        if (over && over.act !== 'none') over.el.classList.add('drop-over');
      }
    };
    const move = ev => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!ghost) {
        if (Math.hypot(dx, dy) < 10) return;
        // タッチの横スワイプは手札のスクロールに任せる
        if (!fromSet && ev.pointerType !== 'mouse' && Math.abs(dx) > Math.abs(dy)) return end();
        start(ev);
      }
      ev.preventDefault();
      place(ev);
    };
    const up = async ev => {
      if (ev.pointerId !== id) return;
      const z = over, dragged = !!ghost;
      end();
      if (!dragged) return;
      dragFired = true; setTimeout(() => { dragFired = false; }, 0);
      if (!z || z.act === 'none') return;
      if (z.err) { toast(z.err, 'err'); return; }
      if (z.act === 'play') return playRobo(c);
      if (z.act === 'set') return humanAct({ t: 'set', uid: c.uid });
      if (z.act === 'cast') { if (await confirmCast(c)) doCardAction('cast', c); else render(); }
    };
    const end = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', end);
      if (ghost) ghost.remove();
      el.classList.remove('dragging');
      for (const z of zones) { z.el.classList.remove('drop-ok', 'drop-ng', 'drop-over'); delete z.el.dataset.drop; }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', end);
  });
}

// ---------- 戦闘：確認ダイアログとドラッグ攻撃 ----------
// メインの行動が残っている時に戦闘へ移る場合だけ確認する
function confirmBattle() {
  const n = G.s.actions;
  return new Promise(resolve => {
    openSheet(`<h3>戦闘に移行しますか？</h3>
      <p class="sub">メインフェイズの行動が<b class="hl">あと${n}回</b>残っています。戦闘に入ると、この手番は起動・電池の配置・アクションなどができなくなります。</p>
      <div class="row"><button class="btn" id="cbNo">まだ行動する</button><button class="btn battle" id="cbYes">戦闘へ</button></div>`, sh => {
        sh.querySelector('#cbNo').addEventListener('click', () => { closeSheet(); resolve(false); });
        sh.querySelector('#cbYes').addEventListener('click', () => { closeSheet(); resolve(true); });
      }, true);
  });
}
// 必要ならバトルフェイズへ移る。移れたら true
async function enterBattle() {
  const s = G.s;
  const err = battleErr();
  if (err) { toast(err, 'err'); return false; }
  if (s.phase === 'battle') return true;
  if (s.actions > 0 && G.mode !== 'debug' && !(await confirmBattle())) return false;
  await humanAct({ t: 'battle' });
  return G && G.s.phase === 'battle';
}
async function requestAttack(att, tgt) {
  if (!(await enterBattle())) { render(); return; }
  humanAct({ t: 'attack', att, tgt });
}
// 場のロボをドラッグ → 照準の矢印を伸ばし、相手のロボ（いなければ相手）に落とすと攻撃
function bindAim(root) {
  root.addEventListener('pointerdown', e => {
    const el = e.target.closest('#myField .card[data-uid]');
    if (!el || el.dataset.zone !== 'field' || e.button > 0 || !G || !canQuick()) return;
    const att = +el.dataset.uid;
    const r0 = el.getBoundingClientRect(), ox = r0.left + r0.width / 2, oy = r0.top + r0.height * 0.35;
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    let svg = null, err = null, targets = [], hover = null;
    const start = () => {
      clearTimeout(lpTimer); closePop();
      err = battleErr();
      const O = G.s.players[1].field;
      const gs = E.guardsOf(G.s, 1).map(y => String(y.uid));
      targets = O.length ? [...document.querySelectorAll('#oppField .card[data-uid]')].filter(el => !gs.length || gs.includes(el.dataset.uid)) : [$('#oppField'), $('#oppInfo')];
      targets.forEach(t => t.classList.add(err ? 'aim-ng' : 'aim-ok'));
      el.classList.add('aiming');
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'aim' + (err ? ' ng' : ''));
      svg.innerHTML = '<line class="aim-shadow"/><line class="aim-line"/><polygon class="aim-head" points="0,-9 16,0 0,9"/>';
      fxLayer().appendChild(svg);
    };
    const draw = ev => {
      const x = ev.clientX, y = ev.clientY;
      for (const l of svg.querySelectorAll('line')) { l.setAttribute('x1', ox); l.setAttribute('y1', oy); l.setAttribute('x2', x); l.setAttribute('y2', y); }
      const ang = Math.atan2(y - oy, x - ox) * 180 / Math.PI;
      svg.querySelector('.aim-head').setAttribute('transform', `translate(${x},${y}) rotate(${ang})`);
      const hit = document.elementFromPoint(x, y);
      const t = hit && targets.find(tg => tg.contains(hit));
      if (hover !== t) { if (hover) hover.classList.remove('aim-over'); hover = t || null; if (hover) hover.classList.add('aim-over'); }
    };
    const move = ev => {
      if (ev.pointerId !== id) return;
      if (!svg) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) return; start(); }
      ev.preventDefault(); draw(ev);
    };
    const up = ev => {
      if (ev.pointerId !== id) return;
      const tgtEl = hover, wasErr = err, dragged = !!svg;
      end();
      if (!dragged) return;
      dragFired = true; setTimeout(() => { dragFired = false; }, 0);
      if (!tgtEl) {
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        if (hit && hit.closest('#oppField .card[data-uid]') && E.guardsOf(G.s, 1).length) toast('挑発しているロボがいるので、そのロボしか狙えません', 'err');
        return;
      }
      if (wasErr) { toast(wasErr, 'err'); return; }
      const tgt = tgtEl.dataset && tgtEl.dataset.uid ? +tgtEl.dataset.uid : 'player';
      requestAttack(att, tgt);
    };
    const end = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', end);
      if (svg) svg.remove();
      el.classList.remove('aiming');
      targets.forEach(t => t.classList.remove('aim-ok', 'aim-ng', 'aim-over'));
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', end);
  });
}

// ---------- 盤面イベント ----------
function onBoardClick(e) {
  if (!G) return;
  closePop();
  const gb = e.target.closest('[data-scrap]');
  if (gb) return G.sel ? null : openScrap(+gb.dataset.scrap);
  const setEl = e.target.closest('[data-set]');
  if (G.sel) {
    if (setEl && selPick('set' + setEl.dataset.set)) return;
    const c = e.target.closest('.card[data-uid]');
    if (c && selPick(+c.dataset.uid)) return;
    if (e.target.closest('#oppField') && selPick('player')) return;
    return;
  }
  if (lpFired) { lpFired = false; return; }
  if (dragFired) return;
  const qa = e.target.closest('[data-qa]');
  if (qa) return onQuick(qa);
  const c = e.target.closest('.card[data-uid]');
  if (c && c.closest('#hand')) return onHandTap(c);
  if (c && c.dataset.zone === 'set') return spellPop(c, cardByUid(+c.dataset.uid), 'set');
  if (c && c.closest('#myField')) return onMyFieldTap(c);
  if (c) return openCard(+c.dataset.uid);
  if (setEl && setEl.dataset.set === '1' && G.s.players[1].set) toast('CPUがセットしたアクション。あなたが攻撃を宣言すると発動されるかもしれません');
}

// ---------- 対戦開始・終了 ----------
let gameSeq = 0;
function startGame(diff, firstPref) {
  const rng = E.mulberry32((Math.random() * 2 ** 31) | 0);
  const first = firstPref === 'first' ? 0 : firstPref === 'second' ? 1 : (Math.random() < 0.5 ? 0 : 1);
  beginGame(E.newGame(rng, first), diff, first, null, `CPU：${DIFF[diff].label}`);
}
// 対戦画面を開いて始める（通常の対戦と勝ち抜きモードで共通）
function beginGame(s, diff, first, run, label, resume) {
  $('#dbgbar').hidden = true; SPD = 1;
  G = { id: ++gameSeq, s, diff, opt: Object.assign({ rng: Math.random }, DIFF[diff].opt), mode: 'game', busy: false, sel: null, tut: null, logIdx: resume ? s.log.length : 0, flash: new Set(), deployFx: {}, drawFx: {}, first, run };
  $('#modeLabel').textContent = label;
  $('#coach').hidden = true;
  show('game');
  G.busy = true;
  const ms = refresh(snapRects()), gid = G.id;
  toast(resume ? '中断したところから再開します' : first === 0 ? 'あなたが先攻です' : 'CPUが先攻です');
  setTimeout(() => {
    if (!G || G.id !== gid) return;
    G.busy = false; render();
    if (s.turn === 1) runCpu();
  }, ms);
}
// ---------- リザルトのスコアボード ----------
function findAnyCard(s, uid) {
  for (const p of s.players) for (const z of [p.field, p.scrap, p.hand, p.deck]) { const c = z.find(c => c.uid === uid); if (c) return c; }
  for (const p of s.players) if (p.set && p.set.uid === uid) return p.set;
  return null;
}
function computeScore(s) {
  const P = [0, 1].map(() => ({ dmg: 0, direct: 0, battle: 0, attacks: 0, kills: 0, deploys: 0, spells: 0, reveals: 0, bat: 0, releases: 0, draws: 0, heat: 0, sets: 0 }));
  const cardDmg = {};
  let lastBattle = null, lastCaster = null;
  for (const e of s.log) {
    switch (e.t) {
      case 'attack': P[e.pi].attacks++; break;
      case 'battle': lastBattle = e; break;
      case 'direct': lastBattle = { direct: true, att: e.att }; break;
      case 'damage': {
        const by = 1 - e.pi;
        if (/ヒートロボ/.test(e.msg)) { P[e.pi].heat += e.n; break; }
        P[by].dmg += e.n;
        if (/直接/.test(e.msg)) { P[by].direct += e.n; if (lastBattle) cardDmg[lastBattle.att] = (cardDmg[lastBattle.att] || 0) + e.n; }
        else { P[by].battle += e.n; if (lastBattle && !lastBattle.direct) { const w = lastBattle.a > lastBattle.d ? lastBattle.att : lastBattle.tgt; cardDmg[w] = (cardDmg[w] || 0) + e.n; } }
        break;
      }
      case 'destroy': P[1 - e.pi].kills++; break;
      case 'deploy': P[e.pi].deploys++; break;
      case 'reveal': P[e.pi].reveals++; break;
      case 'spell': P[e.pi].spells++; lastCaster = e.pi; break;
      case 'set': P[e.pi].sets++; break;
      case 'place': P[e.pi].bat++; break;
      case 'batfly': if (lastCaster !== null) P[lastCaster].bat++; break;
      case 'release': P[e.pi].releases++; break;
      case 'draw': P[e.pi].draws += e.n; break;
    }
  }
  let mvp = null;
  for (const [u, d] of Object.entries(cardDmg)) {
    const c = findAnyCard(s, +u); if (!c) continue;
    if (!mvp || d > mvp.dmg) mvp = { c, dmg: d };
  }
  return { P, mvp };
}
function scoreboardHTML(s) {
  const { P, mvp } = computeScore(s);
  // more: 多い方が良い項目は 1、少ない方が良い項目は -1、比較しない項目は 0
  const rows = [
    ['先攻・後攻', p => (P.indexOf(p) === G.first ? '先攻' : '後攻'), 0],
    ['残りライフ', p => s.players[P.indexOf(p)].life, 1],
    ['与えたダメージ', p => p.dmg, 1],
    ['└ 直接攻撃', p => p.direct, 0, 'sub'],
    ['└ 戦闘の差分', p => p.battle, 0, 'sub'],
    ['攻撃した回数', p => p.attacks, 0],
    ['倒したロボ', p => p.kills, 1],
    ['起動したロボ', p => p.deploys, 0],
    ['アクション発動', p => p.spells, 0],
    ['└ 伏せ札から', p => p.reveals, 0, 'sub'],
    ['電池を入れた', p => p.bat, 0],
    ['放電効果', p => p.releases, 0],
    ['引いたカード', p => p.draws, 0],
    ['ヒートロボの自傷', p => p.heat, -1],
  ];
  const tr = rows.map(([label, f, more, cls]) => {
    const a = f(P[0]), b = f(P[1]);
    const win = more === 0 || a === b ? -1 : (more > 0 ? (a > b ? 0 : 1) : (a < b ? 0 : 1));
    return `<tr class="${cls || ''}"><th scope="row">${label}</th><td class="${win === 0 ? 'best' : ''}">${a}</td><td class="${win === 1 ? 'best' : ''}">${b}</td></tr>`;
  }).join('');
  const mv = mvp ? `<div class="mvp">${img(mvp.c.id, 'mvpart')}<div><span>MVP</span><b>${mvp.c.owner === 0 ? 'あなた' : 'CPU'}の${CARDS[mvp.c.id].name}</b><small>${mvp.dmg}ダメージを与えた</small></div></div>` : '';
  return `${mv}<div class="scorewrap"><table class="score"><thead><tr><th></th><th scope="col">あなた</th><th scope="col">CPU</th></tr></thead><tbody>${tr}</tbody></table></div>`;
}

function gameOver() {
  if (!G || !E.isOver(G.s) || $('#sheet').dataset.over === String(G.id)) return;
  const s = G.s;
  let title, cls;
  if (s.draw) { title = '引き分け'; cls = 'draw'; }
  else if (s.winner === 0) { title = '勝利！'; cls = 'win'; }
  else { title = '敗北…'; cls = 'lose'; }
  if (G.run) return runGameOver(title, cls);
  if (G.mode === 'game') {
    if (s.winner === 0) stats[G.diff][0]++; else if (s.winner === 1) stats[G.diff][1]++;
    saveStats();
  }
  const st = G.mode === 'game' ? `<p class="sub">「${DIFF[G.diff].label}」の通算成績：${stats[G.diff][0]}勝 ${stats[G.diff][1]}敗</p>` : '';
  openSheet(`<div class="over ${cls}"><div class="overhead">${img(s.winner === 1 ? 'megaton' : 'battery', 'overart')}<div><h2>${title}</h2><p class="sub">${G.first === 0 ? 'あなたが先攻' : 'CPUが先攻'}・${s.turnNo}手番で決着</p></div></div>
    ${scoreboardHTML(s)}${st}</div>
    <div class="row">${G.mode === 'game' ? '<button class="btn primary" id="again">もう一度</button>' : ''}<button class="btn" id="toTitle">タイトルへ</button></div>`, sh => {
      const ag = sh.querySelector('#again'); if (ag) ag.addEventListener('click', () => { closeSheet(); startGame(G.diff, $('#firstSel').value); });
      sh.querySelector('#toTitle').addEventListener('click', () => { closeSheet(); toTitle(); });
    }, true);
  $('#sheet').dataset.over = String(G.id);
}
function toTitle() { G = null; SPD = 1; $('#dbgbar').hidden = true; closeSheet(); renderTitleStats(); show('title'); }
function renderTitleStats() {
  $('#runCont').hidden = !loadRun();
  const rows = Object.keys(DIFF).map(k => `<span>${DIFF[k].label} <b>${stats[k][0]}</b>勝<b>${stats[k][1]}</b>敗</span>`).join('');
  $('#titleStats').innerHTML = rows;
}

// ================= 勝ち抜きモード =================
// 進行のルールは src/run.js（Run）。ここは画面と保存だけ。ランは手順ごと・対戦中も保存する（やり直しはできない）
let RUN = null;
const RUN_KEY = 'denchi-run';
function loadRun() { try { const v = JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); return v && v.v === 2 ? v : null; } catch (e) { return null; } }
function saveRun() {
  try { if (RUN && RUN.phase !== 'over' && RUN.phase !== 'clear') localStorage.setItem(RUN_KEY, JSON.stringify(RUN)); else localStorage.removeItem(RUN_KEY); } catch (e) {}
}
const themeChip = k => `<span class="themechip th-${k}">${k === 'basic' ? '基本' : k === 'curse' ? '呪い' : E.THEMES[k].name}</span>`;
const EV_KIND = { A: 'デッキ', B: '改造', C: 'パーツ', D: '取引', E: '特殊な対戦', F: '情報' };
function startNewRun() {
  if (loadRun() && !confirm('続きのランがあります。新しく始めると、いまのランは消えます。よろしいですか？')) return;
  RUN = Run.newRun((Math.random() * 2 ** 31) | 0); saveRun(); openRun();
}
function continueRun() { RUN = loadRun(); if (!RUN) return toTitle(); openRun(); }
function openRun() { G = null; closeSheet(); renderRun(); show('run'); }
// デッキの1枚（'normal' / 'normal@a' など）を表示用のカードにする
const entryCard = e => E.makeCard(e, -1, 0);
function entryName(e) { const c = entryCard(e); return cardName(c) + (CARDS[c.id].rare ? '★' : ''); }
function runCardInfo(e) {
  const c = entryCard(e), note = modNote(c);
  openSheet(`${cardInfoHTML(c, 'deck')}${note ? `<p class="kwhelp"><b>改造</b>：${note}</p>` : ''}<div class="row"><button class="btn ghost" id="shClose">閉じる</button></div>`, sh => sh.querySelector('#shClose').addEventListener('click', closeSheet));
}
function deckChips(deck, opt) {
  opt = opt || {};
  return `<div class="decklist">${Run.deckSummary(deck).map(({ id, n }) => {
    const off = opt.filter && !opt.filter(id);
    return `<button class="dk ${CARDS[E.baseId(id)].kind}${off ? ' off' : ''}" data-id="${id}"${off ? ' disabled' : ''}>${entryName(id)} <b>×${n}</b></button>`;
  }).join('')}</div>`;
}
// 次の対戦にかかっている効果・持っているパーツ
function effectsHTML(r) {
  const n = r.next || {}, items = [];
  if (r.lifeMod) items.push(`闇市：ライフ${r.lifeMod}`);
  if (n.life) items.push(`借金：次の対戦はライフ${n.life}`);
  if (n.elite) items.push('エリート戦：相手が強い（勝てば報酬もう1回）');
  if (n.handicap) items.push('ハンデ戦：ライフ半分（勝てばレア）');
  if (n.weather) items.push('異常気象：お互いの電池上限+1');
  const parts = (r.parts || []).map(id => `<span class="partchip" title="${Run.EVENTS[id].text}">${Run.EVENTS[id].name}</span>`).join('');
  return (parts ? `<p>パーツ：${parts}</p>` : '') + (items.length ? `<ul class="effects">${items.map(x => `<li>${x}</li>`).join('')}</ul>` : '');
}
function renderRun() {
  const r = RUN, body = $('#runBody'), st = r.step || {};
  const rd = Math.min(r.round, Run.ROUNDS);
  const steps = Array.from({ length: Run.ROUNDS }, (_, i) => { const h = r.history.find(x => x.round === i + 1 && x.won !== undefined); return `<i class="${h ? (h.won ? 'won' : 'lost') : (i + 1 === r.round && r.phase === 'battle' ? 'now' : '')}"></i>`; }).join('');
  const setup = r.phase === 'battle' ? Run.battleSetup(r) : null;
  const head = `<div class="runhead"><span class="rnd">第${rd}戦 / ${Run.ROUNDS}</span>${setup ? `<span>ライフ <b>${setup.lives[0]}</b></span>` : ''}<span>デッキ <b>${r.deck.length}</b>枚</span></div>
    <div class="runsteps">${steps}</div><p>あなたのテーマ：${r.themes.map(themeChip).join('')}${themeChip('common')}</p>${effectsHTML(r)}
    ${r.notice ? `<p class="runnotice">${r.notice}</p>` : ''}`;
  let main = '';
  const deckBox = (title, opt) => `<div class="runbox"><h3>${title}（${r.deck.length}枚）</h3>${opt && opt.sub ? `<p class="sub">${opt.sub}</p>` : ''}${deckChips(r.deck, opt)}${opt && opt.after ? '<div class="pickprev" id="pickPrev"></div>' + opt.after : ''}</div>`;
  if (r.phase === 'battle') {
    const cpu = DIFF[setup.cpu].label, scouted = r.scout && r.scout >= r.round;
    const after = scouted && r.round < Run.ROUNDS ? `<p class="sub">偵察：その次（第${r.round + 1}戦）の相手は ${themeChip(r.oppThemes[r.round])}</p>` : '';
    main = `<div class="runbox"><h3>次の相手</h3><p>${themeChip(setup.oppTheme)}デッキ（CPU：${cpu}・ライフ${setup.lives[1]}・${setup.decks[1].length}枚）</p>
      ${scouted ? `<p class="sub">偵察：相手のデッキ</p>${deckChips(setup.decks[1])}` : ''}${after}
      <div class="row"><button class="btn primary" id="runFight">${r.battle ? '対戦の続きから' : '対戦する'}</button></div></div>
      ${deckBox('あなたのデッキ', { sub: 'タップでカードの説明' })}
      <div class="row"><button class="btn ghost danger" id="runQuit">このランをあきらめる</button></div>`;
  } else if (r.phase === 'reward') {
    const need = Math.min(st.need, st.offer.length);
    main = `<div class="runbox"><h3>${st.title || '報酬'}</h3>
      <p class="sub">選んだカードはデッキに入ります。${need > 1 ? `${need}枚選んでください。` : ''}</p>
      <div class="pickgrid">${st.offer.map(id => `<div class="pick" data-id="${id}">${cardHTML({ uid: -1, id, owner: 0, bat: 0 }, { size: 'hand' })}<p>${themeChip(CARDS[id].theme)}<br>${cardTextPlain(CARDS[id])}</p></div>`).join('')}</div>
      <div class="row"><button class="btn primary" id="runTake" disabled>決定（0/${need}）</button></div></div>
      ${deckBox('いまのデッキ')}`;
  } else if (r.phase === 'remove') {
    const left = st.n || 1, filter = st.noBasic && r.deck.some(e => CARDS[E.baseId(e)].theme !== 'basic') ? (e => CARDS[E.baseId(e)].theme !== 'basic') : null;
    main = deckBox(`デッキから${left > 1 ? `あと${left}枚` : '1枚'}抜く`, { sub: '抜いたカードは、このランでは候補に出なくなります。' + (filter ? '今回は基本カード以外から抜きます（大量生産）。' : ''), filter,
      after: `<div class="row"><button class="btn" id="runInfo" disabled>説明を見る</button><button class="btn primary" id="runRemove" disabled>このカードを抜く</button></div>` });
  } else if (r.phase === 'event') {
    const sg = Run.SIGNS.find(x => x.id === st.sign);
    main = `<div class="runbox evsign"><h3>道の途中で</h3><p class="signtext">${sg.text}</p>
      <p class="sub">入ると何かが起きます。良いことも、悪いこともあります。</p>
      <div class="row"><button class="btn" id="runSkip">通り過ぎる</button><button class="btn primary" id="runEnter">入ってみる</button></div></div>
      ${deckBox('いまのデッキ')}`;
  } else if (r.phase === 'copy') {
    const filter = e => E.baseId(e) !== 'sabi' && (!st.themeOnly || CARDS[E.baseId(e)].theme !== 'basic');
    main = deckBox(st.themeOnly ? '大量生産：複製するテーマのカードを選ぶ' : 'コピー機：複製するカードを選ぶ', { filter, sub: '選んだカードと同じものが1枚デッキに入ります。',
      after: `<div class="row"><button class="btn primary" id="runCopy" disabled>このカードを複製</button></div>` });
  } else if (r.phase === 'mod') {
    const filter = e => CARDS[E.baseId(e)].kind === 'robo' && !e.includes('@') && !(st.mods.length === 1 && st.mods[0] === 'e' && CARDS[E.baseId(e)].enterBat);
    const label = { a: '攻撃力+1', m: '電池上限+1', e: '付属電池を付ける' };
    main = deckBox(st.mods.includes('e') ? '付属電池化：ロボを選ぶ' : '改造工場：ロボを選ぶ', { filter, sub: '改造したカードは名前に「改」が付きます（1枚につき1回）。',
      after: `<div class="row">${st.mods.map(m => `<button class="btn primary" data-mod="${m}" disabled>${label[m]}</button>`).join('')}</div>` });
  } else if (r.phase === 'branch') {
    main = `<div class="runbox"><h3>分かれ道：第${r.nextRound}戦の相手を選ぶ</h3>
      <div class="row">${st.options.map(t => `<button class="btn primary" data-branch="${t}">${themeChip(t)}デッキと戦う</button>`).join('')}</div></div>`;
  } else {
    const clear = r.phase === 'clear', last = r.history.filter(h => h.won !== undefined).slice(-1)[0];
    main = `<div class="runbox runover"><h2>${clear ? '5連勝！ クリア' : `第${last.round}戦で敗退`}</h2>
      <p>${r.history.filter(h => h.won !== undefined).map(h => `第${h.round}戦 ${themeChip(h.opp)} ${h.won ? '○' : '×'}`).join('　')}</p>
      ${deckBox('最後のデッキ')}
      <div class="row"><button class="btn primary" id="runAgain">もう一度</button><button class="btn" id="runTitle">タイトルへ</button></div></div>`;
  }
  body.innerHTML = head + main;
  const after = f => { try { f(); } catch (e) { toast(e.message, 'err'); return; } saveRun(); renderRun(); window.scrollTo(0, 0); };
  const pickMode = ['remove', 'copy', 'mod'].includes(r.phase);
  const sel = () => { const b = body.querySelector('.dk.on'); return b && b.dataset.id; };
  // デッキのカード：ふだんはタップで説明、抜く・複製・改造の時は選択
  body.querySelectorAll('.dk').forEach(b => b.addEventListener('click', () => {
    if (!pickMode) return runCardInfo(b.dataset.id);
    body.querySelectorAll('.dk').forEach(x => x.classList.toggle('on', x === b));
    body.querySelectorAll('#runRemove,#runInfo,#runCopy,[data-mod]').forEach(x => { x.disabled = false; });
    // 選んだカードの絵と効果文を、その場に出す
    const pv = $('#pickPrev'), c = entryCard(b.dataset.id), d = CARDS[c.id], note = modNote(c);
    if (pv) pv.innerHTML = `${cardHTML(c, { size: 'hand' })}<div><b>${entryName(b.dataset.id)}</b>${d.kind === 'robo' ? `<span class="sub">攻撃力${shownAtk(c)}・電池上限${E.capOf(c)}</span>` : ''}<p>${cardText(d)}</p>${note ? `<p class="sub">改造：${note}</p>` : ''}</div>`;
    const rm = $('#runRemove'); if (rm) rm.textContent = `${entryName(b.dataset.id)}を抜く`;
  }));
  const on = (id, f) => { const el = body.querySelector('#' + id); if (el) el.addEventListener('click', f); };
  on('runFight', startRunBattle);
  on('runQuit', () => { if (!confirm('このランをあきらめますか？（記録は残りません）')) return; RUN = null; saveRun(); toTitle(); });
  on('runAgain', () => { RUN = Run.newRun((Math.random() * 2 ** 31) | 0); saveRun(); renderRun(); });
  on('runTitle', toTitle);
  on('runInfo', () => sel() && runCardInfo(sel()));
  on('runRemove', () => sel() && after(() => Run.removeCard(r, r.deck.indexOf(sel()))));
  on('runCopy', () => sel() && after(() => Run.copyCard(r, r.deck.indexOf(sel()))));
  body.querySelectorAll('[data-mod]').forEach(b => b.addEventListener('click', () => sel() && after(() => Run.modCard(r, r.deck.indexOf(sel()), b.dataset.mod))));
  on('runEnter', () => after(() => Run.chooseEvent(r, true)));
  on('runSkip', () => after(() => Run.chooseEvent(r, false)));
  body.querySelectorAll('[data-branch]').forEach(b => b.addEventListener('click', () => after(() => Run.chooseBranch(r, b.dataset.branch))));
  if (r.phase === 'reward') {
    const need = Math.min(st.need, st.offer.length), btn = $('#runTake');
    const picked = () => [...body.querySelectorAll('.pick.on')].map(x => x.dataset.id);
    body.querySelectorAll('.pick').forEach(el => el.addEventListener('click', () => {
      if (!el.classList.contains('on') && picked().length >= need) { if (need === 1) body.querySelectorAll('.pick.on').forEach(x => x.classList.remove('on')); else return toast(`選べるのは${need}枚までです`); }
      el.classList.toggle('on');
      const n = picked().length; btn.disabled = n !== need; btn.textContent = `決定（${n}/${need}）`;
    }));
    btn.addEventListener('click', () => after(() => Run.takeCards(r, picked())));
  }
}
// 対戦中の状態をランと一緒に保存する（閉じても続きから再開。やり直しはできない）。
// 攻撃の処理中（応答待ち）は保存しない＝その直前の状態から再開する
function saveRunBattle() {
  if (!RUN || !G || !G.run) return;
  const s = G.s;
  if (E.isOver(s) || s.pending) return;
  const snap = E.clone(s); snap.log = s.log.slice();
  RUN.battle = { s: snap, diff: G.diff, first: G.first, meta: G.run };
  saveRun();
}
function resumeRunBattle() {
  const b = RUN.battle;
  beginGame(b.s, b.diff, b.first, b.meta, `アドベンチャー 第${b.meta.round}戦：${E.THEMES[b.meta.opp].name}デッキ`, true);
}
function startRunBattle() {
  if (RUN.battle) return resumeRunBattle();
  const b = Run.battleSetup(RUN);
  const rng = E.mulberry32((Math.random() * 2 ** 31) | 0);
  const first = Math.random() < 0.5 ? 0 : 1;
  const s = E.newGame(rng, first, { decks: b.decks, lives: b.lives, perks: b.perks, batPlus: b.batPlus });
  const go = () => {
    beginGame(s, b.cpu, first, { round: b.round, opp: b.oppTheme, lifeMax: b.lives[0] }, `アドベンチャー 第${b.round}戦：${E.THEMES[b.oppTheme].name}デッキ`);
    saveRunBattle();
  };
  // パーツ「先読み回路」：山札の上3枚を見て、引く順番を決める（山札は配列の末尾から引く）
  const fs = s.players[0].perks.foresight || 0, deck = s.players[0].deck;
  if (!fs || deck.length < 2) return go();
  const top = deck.slice(-fs).reverse(), order = [];
  openSheet(`<h3>先読み回路：山札の上${top.length}枚</h3><p class="sub">引きたい順にタップ（最初にタップしたカードを最初に引きます）</p>
    <div class="glist">${top.map(c => cardHTML(c, { size: 'hand', cls: 'pickg' })).join('')}</div><p class="sub" id="fsOrder"></p>
    <div class="row"><button class="btn ghost" id="fsKeep">このままの順番</button><button class="btn primary" id="fsOk" disabled>この順番で引く</button></div>`, sh => {
      sh.querySelectorAll('.pickg').forEach(el => el.addEventListener('click', () => {
        const u = +el.dataset.uid; if (order.includes(u)) return;
        order.push(u); el.classList.add('on'); el.dataset.n = order.length;
        sh.querySelector('#fsOrder').textContent = order.map((x, i) => `${i + 1}. ${CARDS[top.find(c => c.uid === x).id].name}`).join('　');
        sh.querySelector('#fsOk').disabled = order.length !== top.length;
      }));
      sh.querySelector('#fsKeep').addEventListener('click', () => { closeSheet(); go(); });
      sh.querySelector('#fsOk').addEventListener('click', () => {
        const rest = deck.slice(0, deck.length - top.length);
        const picked = order.map(u => top.find(c => c.uid === u)).reverse();
        deck.length = 0; deck.push(...rest, ...picked);
        closeSheet(); go();
      });
    }, true);
}
function runGameOver(title, cls) {
  const s = G.s, won = s.winner === 0;
  // 結果はこの時点で記録する（「次へ」を押す前に閉じても、結果は変わらない）
  delete RUN.battle;
  if (!s.draw) Run.finishBattle(RUN, won, { turns: s.turnNo });
  saveRun();
  const msg = s.draw ? '引き分けなので、もう一度戦います。' : won ? (RUN.phase === 'clear' ? '5連勝！' : '報酬のカードを選びに行こう。') : 'ランはここで終わりです。';
  openSheet(`<div class="over ${cls}"><div class="overhead">${img(won ? 'battery' : 'megaton', 'overart')}<div><h2>${title}</h2><p class="sub">アドベンチャー 第${G.run.round}戦・${s.turnNo}手番で決着</p></div></div>
    ${scoreboardHTML(s)}<p class="sub">${msg}</p></div>
    <div class="row"><button class="btn primary" id="runNext">${s.draw ? '再戦する' : '次へ'}</button></div>`, sh => {
      sh.querySelector('#runNext').addEventListener('click', () => {
        closeSheet();
        if (s.draw) return startRunBattle();
        openRun();
      });
    }, true);
  $('#sheet').dataset.over = String(G.id);
}

// ---------- チュートリアル ----------
function mkState(cfg) {
  let uid = 1000;
  const mk = (id, owner, bat) => ({ uid: uid++, id, owner, bat: bat || 0 });
  const P = [0, 1].map(pi => {
    const c = cfg.p[pi];
    return {
      life: c.life || 15,
      deck: (c.deck || []).map(id => mk(id, pi)), hand: (c.hand || []).map(id => mk(id, pi)),
      field: (c.field || []).map(([id, bat]) => mk(id, pi, bat)), set: c.set ? mk(c.set, pi) : null,
      scrap: (c.scrap || []).map(id => mk(id, pi)),
    };
  });
  return { players: P, turn: 0, turnNo: cfg.turnNo || 1, actions: 2, phase: 'main', attacked: false,
    firstTurn: !!cfg.firstTurn, eot: [], noAttack: false, winner: null, draw: false, stall: 0, lifeSnap: '', pending: null,
    log: [{ msg: '―― チュートリアル ――', t: 'turn' }], uidSeq: uid + 100 };
}
// ================= デバッグモード（戦闘テスト） =================
// 好きな配置で「戦闘 → ターン終了 → 戦闘」を繰り返す。演出の確認用にスロー再生もできる。
let SPD = 1;
(function speedLoop() {
  if (SPD !== 1 && document.getAnimations) for (const a of document.getAnimations()) if (a.playbackRate !== SPD) a.playbackRate = SPD;
  requestAnimationFrame(speedLoop);
})();
const DBG_DEFAULT = {
  p: [
    { life: 15, field: [['turbo', 1], ['daruma', 1], ['bomb', 1]], set: '' },
    { life: 15, field: [['souji', 0], ['magnet', 1], ['', 0]], set: 'thunder' },
  ],
  attacker: 'me', restore: true, speed: 1,
};
let DBG = JSON.parse(JSON.stringify(DBG_DEFAULT));
try {
  const v = JSON.parse(localStorage.getItem('denchi-debug') || 'null');
  // 保存された配置に今は存在しないカードがあれば外す
  if (v && v.p) { for (const p of v.p) { p.field = (p.field || []).map(f => (f[0] && CARDS[f[0]] ? f : ['', 0])); if (p.set && !CARDS[p.set]) p.set = ''; p.hand = (p.hand || []).filter(id => CARDS[id]); } DBG = Object.assign(DBG, v); }
} catch (e) {}
function saveDbg() { try { localStorage.setItem('denchi-debug', JSON.stringify(DBG)); } catch (e) {} }

function dbgState(turnNo, owner) {
  const cfg = { turnNo, p: DBG.p.map(p => ({ life: Math.max(1, Math.min(30, +p.life || 15)), field: p.field.filter(f => f[0]).map(([id, bat]) => [id, Math.min(+bat || 0, CARDS[id].max)]), set: p.set || null,
    hand: (p.hand || []).filter(id => id && CARDS[id]) })) };
  const s = mkState(cfg);
  s.turn = owner; s.log = [{ msg: '―― 配置をセット ――', t: 'turn' }];
  return s;
}
function dbgRenderEditor() {
  // デバッグでは、トークンや不採用カードも置けるようにする
  const tag = id => E.RETIRED_IDS.includes(id) ? '・不採用' : CARDS[id].token ? '・トークン' : !E.DECK_IDS.includes(id) && CARDS[id].theme ? '・' + (CARDS[id].theme === 'basic' ? '基本' : E.THEMES[CARDS[id].theme].name) : '';
  const order = E.DECK_IDS.concat(E.TOKEN_IDS, E.RETIRED_IDS, Object.keys(CARDS).filter(id => !E.DECK_IDS.includes(id) && !E.TOKEN_IDS.includes(id) && !E.RETIRED_IDS.includes(id)));
  const yIds = order.filter(id => CARDS[id].kind === 'robo');
  const sIds = order.filter(id => CARDS[id].kind === 'spell' && !CARDS[id].noSet);
  const hIds = order.filter(id => !CARDS[id].token);
  const hOpt = sel => `<option value="">（なし）</option>` + hIds.map(id => `<option value="${id}"${sel === id ? ' selected' : ''}>${CARDS[id].name}${tag(id) ? '（' + tag(id).slice(1) + '）' : ''}</option>`).join('');
  const yOpt = sel => `<option value="">（なし）</option>` + yIds.map(id => `<option value="${id}"${sel === id ? ' selected' : ''}>${CARDS[id].name}（${CARDS[id].atk}${tag(id)}）</option>`).join('');
  const sOpt = sel => `<option value="">（なし）</option>` + sIds.map(id => `<option value="${id}"${sel === id ? ' selected' : ''}>${CARDS[id].name}${tag(id) ? '（' + tag(id).slice(1) + '）' : ''}</option>`).join('');
  const batOpt = (n, max) => Array.from({ length: (max ?? 3) + 1 }, (_, i) => `<option value="${i}"${+n === i ? ' selected' : ''}>電池${i}</option>`).join('');
  const side = pi => {
    const p = DBG.p[pi];
    return `<fieldset class="dbgside"><legend>${pi === 0 ? 'あなた（下）' : 'CPU（上）'}</legend>
      <label class="dbgrow">ライフ <input type="number" min="1" max="30" id="dbgLife${pi}" value="${p.life}"></label>
      ${[0, 1, 2].map(i => { const [id, bat] = p.field[i] || ['', 0]; return `<div class="dbgrow"><span>ロボ${i + 1}</span>
        <select id="dbgY${pi}_${i}">${yOpt(id)}</select>
        <select id="dbgH${pi}_${i}">${batOpt(bat, id ? CARDS[id].max : 0)}</select></div>`; }).join('')}
      <label class="dbgrow"><span>伏せ札</span><select id="dbgS${pi}">${sOpt(p.set)}</select></label>
      ${pi === 0 ? [0, 1, 2].map(i => `<label class="dbgrow"><span>手札${i + 1}</span><select id="dbgHand${i}">${hOpt((p.hand || [])[i])}</select></label>`).join('') : ''}
    </fieldset>`;
  };
  $('#dbgEditor').innerHTML = `${side(1)}${side(0)}
    <fieldset class="dbgside"><legend>ループ設定</legend>
      <label class="dbgrow"><span>攻撃する側</span><select id="dbgAtk">
        <option value="me"${DBG.attacker === 'me' ? ' selected' : ''}>あなた（毎回）</option>
        <option value="cpu"${DBG.attacker === 'cpu' ? ' selected' : ''}>CPU（毎回）</option>
        <option value="alt"${DBG.attacker === 'alt' ? ' selected' : ''}>交互</option></select></label>
      <label class="dbgrow"><span>速度</span><select id="dbgSpd">
        <option value="1"${DBG.speed == 1 ? ' selected' : ''}>等速</option><option value="0.5"${DBG.speed == 0.5 ? ' selected' : ''}>1/2</option><option value="0.25"${DBG.speed == 0.25 ? ' selected' : ''}>1/4</option></select></label>
      <label class="dbgrow chk"><input type="checkbox" id="dbgRestore"${DBG.restore ? ' checked' : ''}> 戦闘のたびに配置を元に戻す</label>
    </fieldset>`;
  // ロボを変えたら電池の上限を合わせる
  $('#dbgEditor').querySelectorAll('select[id^="dbgY"]').forEach(sel => sel.addEventListener('change', () => {
    const [pi, i] = sel.id.slice(4).split('_'); const h = $(`#dbgH${pi}_${i}`);
    const max = sel.value ? CARDS[sel.value].max : 0; const cur = Math.min(+h.value, max);
    h.innerHTML = batOpt(cur, max);
  }));
}
function dbgReadEditor() {
  for (const pi of [0, 1]) {
    DBG.p[pi].life = +$(`#dbgLife${pi}`).value || 15;
    DBG.p[pi].field = [0, 1, 2].map(i => [$(`#dbgY${pi}_${i}`).value, +$(`#dbgH${pi}_${i}`).value]);
    DBG.p[pi].set = $(`#dbgS${pi}`).value;
  }
  DBG.p[0].hand = [0, 1, 2].map(i => $(`#dbgHand${i}`).value).filter(Boolean);
  DBG.attacker = $('#dbgAtk').value; DBG.speed = +$('#dbgSpd').value; DBG.restore = $('#dbgRestore').checked;
  saveDbg();
}
function openDebugEditor() { dbgRenderEditor(); show('debug'); }
function startDebug() {
  dbgReadEditor();
  SPD = DBG.speed;
  const s = dbgState(1, 0);
  G = { id: ++gameSeq, s, diff: null, opt: { w: AI.BASE_W, rng: Math.random }, mode: 'debug', busy: false, sel: null, tut: null, logIdx: 0, flash: new Set(), deployFx: {}, drawFx: {},
    dbg: { loop: 0, cpuTurn: false } };
  $('#modeLabel').textContent = 'デバッグ（戦闘テスト）';
  $('#coach').hidden = true; $('#dbgbar').hidden = false;
  dbgSyncBar();
  show('game'); refresh();
  dbgTurnStart(true);
}
function dbgSyncBar() {
  $('#dbgAtk2').value = DBG.attacker; $('#dbgSpd2').value = String(DBG.speed); $('#dbgRestore2').checked = DBG.restore;
  $('#dbgLoop').textContent = G && G.dbg ? `ループ ${G.dbg.loop}` : '';
}
// 配置に戻す（手番は owner のまま）
function dbgReset(owner, note) {
  const old = G.s;
  G.s = dbgState(old.turnNo + 1, owner);
  G.logIdx = 0; G.sel = null; G.attackFx = null; G.flash = new Set(); G.deployFx = {}; G.drawFx = {};
  if (note) toast(note);
}
// 自分の手番の頭で呼ぶ：戻す・誰が攻撃するかを決める
async function dbgTurnStart(first) {
  if (!G || G.mode !== 'debug') return;
  const my = G.id;
  G.dbg.loop++;
  if (E.isOver(G.s) || (!first && DBG.restore)) dbgReset(0, E.isOver(G.s) ? '決着したので配置に戻しました' : null);
  const s = G.s;
  s.stall = 0; s.firstTurn = false; s.actions = 2; s.phase = 'main';
  const cpuAttacks = DBG.attacker === 'cpu' || (DBG.attacker === 'alt' && G.dbg.loop % 2 === 0);
  G.dbg.cpuTurn = cpuAttacks;
  // 最初だけ自分の手番のバナーを出す（以降はターン交代の演出が出る）
  if (first) s.log.push({ msg: `―― あなたの手番（1） ――`, t: 'turn', pi: 0 });
  dbgSyncBar();
  G.busy = true;
  const ms = refresh(snapRects());
  await sleep(ms);
  if (!G || G.id !== my) return;
  G.busy = false; render();
  if (cpuAttacks) { await sleep(300); if (!G || G.id !== my) return; humanAct({ t: 'end' }); }
}
// CPUの行動：攻撃する番なら適当な攻撃、そうでなければ何もせず終了
function dbgCpuAction(s) {
  if (!G.dbg.cpuTurn || s.attacked) return { t: 'end' };
  const opts = AI.attackOptions(s);
  if (!opts.length) { toast('CPUは攻撃できるロボがいません'); return { t: 'end' }; }
  return opts[Math.floor(Math.random() * opts.length)];
}
// 自分の攻撃が終わった後
async function dbgAfterMyBattle() {
  const my = G.id;
  G.busy = true; render();
  await sleep(600);
  if (!G || G.id !== my) return;
  G.busy = false;
  if (E.isOver(G.s)) return dbgTurnStart(false);
  humanAct({ t: 'end' });
}

const uidOf = (pi, id) => { const s = G.s; const y = s.players[pi].field.find(y => y.id === id) || s.players[pi].hand.find(y => y.id === id) || (s.players[pi].set && s.players[pi].set.id === id ? s.players[pi].set : null); return y && y.uid; };

const LESSONS = [
  { title: '1. カードを出そう',
    setup: { firstTurn: true, p: [{ hand: ['turbo', 'crane', 'ebattery', 'manual'], deck: ['daruma', 'heat'] }, { hand: ['souji'], deck: ['magnet', 'bomb'] }] },
    steps: [
      { say: 'ようこそ！ 上がCPU、下があなたの陣地です。ライフはお互い15。<b>先に相手のライフを0にした方が勝ち</b>です。' },
      { say: '自分の手番は「メインフェイズ → バトルフェイズ → 交代」の順に進みます。メインフェイズでは<b>行動を合計2回まで</b>行えます。残り回数は中央の●で表示されます。カードを<b>長押し（PCは右クリック）</b>すると効果を確認できます。' },
      { say: '手札の<b>ターボロボ</b>を自分の場へ<b>ドラッグ</b>しよう（タップして「起動」でもOK）。ロボは場に3体まで出せます。', hl: ['turbo'], want: a => a.t === 'play' && cardIdOf(a.uid) === 'turbo', miss: '手札のターボロボを自分の場へドラッグしよう' },
      { say: 'ロボに<b>電池</b>を入れると攻撃力が1上がります。ターボロボは特別で、電池1本につき<b>さらに+1</b>。場のターボロボをタップして<b>「+電池」</b>を選ぼう。', hl: ['turbo'], want: a => a.t === 'place' && cardIdOf(a.target) === 'turbo', miss: '場のターボロボをタップして「+電池」を選ぼう' },
      { say: 'ターボロボの攻撃力が2→4になりました。これで行動2回を使い切りです。<b>先攻の最初の手番だけは攻撃できない</b>ので、「ターン終了」を押そう。', want: a => a.t === 'end', miss: '「ターン終了」を押そう' },
    ] },
  { title: '2. バトルしよう',
    setup: { turnNo: 3, p: [{ field: [['turbo', 1], ['crane', 0]], hand: [], deck: ['daruma'] }, { field: [['souji', 0]], hand: ['magnet'], deck: ['heat'] }] },
    steps: [
      { say: '攻撃は、自分のロボを<b>相手のロボへドラッグ</b>するだけ。これでバトルフェイズに移って攻撃します（行動の●の横にある「戦闘」ボタンでも可）。攻撃できるのは1手番に<b>1体だけ</b>です。' },
      { say: '戦闘は攻撃力の比べ合い。<b>低い方が破壊され、その持ち主は差の分だけダメージ</b>を受けます。同じ攻撃力なら両方破壊、ダメージはなし。' },
      { say: '<b>ターボロボ</b>（攻撃力4）を相手の<b>そうじロボ</b>（攻撃力2）へドラッグしよう。まだ行動が残っているので確認が出ます。「戦闘へ」を選ぼう。', hl: ['turbo'], battle: true, want: a => a.t === 'attack' && cardIdOf(a.att) === 'turbo', miss: 'ターボロボをそうじロボへドラッグしよう' },
      { say: 'そうじロボは破壊され、CPUは4−2＝<b>2ダメージ</b>。破壊されたロボの電池はなくなります。' },
      { say: '攻撃は1手番に1回だけなので、対戦では<b>戦闘が終わると自動でターン終了</b>します。これでレッスン完了です。', final: true },
    ] },
  { title: '3. セットアクションと放電効果',
    setup: { turnNo: 5, p: [{ field: [['turbo', 1], ['souji', 1]], hand: [], deck: ['daruma'] }, { field: [], set: 'thunder', hand: ['magnet'], deck: ['heat'], life: 8 }] },
    steps: [
      { say: 'CPUの場の右端にある裏向きのカードは<b>セットされたアクション（伏せ札）</b>です。あなたが攻撃を宣言すると、相手はそれを表にして発動できます。' },
      { say: '<b>そうじロボの放電効果</b>なら、セットされたアクションを破壊できます。放電効果は電池を1本抜いて使います（行動1回）。そうじロボは<b>付属電池</b>（電池を1本入れた状態で場に出る）なので、すぐに使えます。' },
      { say: 'そうじロボをタップして<b>「放電」</b>を選び、CPUの場の右端にある<b>伏せ札</b>をタップしよう。', hlSet: 1, hl: ['souji'], want: a => a.t === 'release' && a.ch && a.ch.pi === 1, miss: 'そうじロボをタップして「放電」→ CPUの伏せ札' },
      { say: '中身は<b>かみなり</b>（場で最も攻撃力の高いロボを破壊）でした。そのまま攻撃していたらターボロボがやられていたところです。' },
      { say: '相手の場にロボがいない時は、<b>相手プレイヤーに直接攻撃</b>できます。<b>ターボロボをCPUの場（またはライフの帯）へドラッグ</b>しよう。', hl: ['turbo'], battle: true, want: a => a.t === 'attack' && cardIdOf(a.att) === 'turbo', miss: 'ターボロボをCPUの場へドラッグしよう' },
      { say: '直接攻撃は攻撃力の分だけダメージ。CPUのライフが8→4になりました。' },
      { say: '戦闘が終わったので、対戦ではここで<b>自動的にターン終了</b>します。これでレッスン完了です。', final: true },
    ] },
  { title: '4. アクションで守ろう',
    setup: { turnNo: 7, p: [{ field: [['bomb', 1]], hand: ['thunder', 'manual'], deck: ['daruma', 'turbo'] }, { field: [['heat', 0]], hand: ['magnet'], deck: ['crane', 'souji'], life: 12 }] },
    cpuScript: () => [{ t: 'attack', att: uidOf(1, 'heat'), tgt: uidOf(0, 'bomb') }, { t: 'end' }],
    steps: [
      { say: 'アクションは手札から<b>すぐ発動</b>（場へドラッグ）するか、裏向きに<b>セット</b>（伏せ札枠へドラッグ）して相手の手番に使えます。どちらも行動1回で、セットできるのは1枚までです。' },
      { say: '手札の<b>かみなり</b>を自分の場の右端の<b>伏せ札</b>枠へドラッグしよう（タップして「セット」でもOK）。', hl: ['thunder'], want: a => a.t === 'set' && cardIdOf(a.uid) === 'thunder', miss: 'かみなりをセットしよう' },
      { say: '準備完了。「ターン終了」を押してCPUの手番を見てみよう。', want: a => a.t === 'end', miss: '「ターン終了」を押そう' },
      { say: 'CPUの手番。<b>ヒートロボ</b>（攻撃力4）は強い代わりに、持ち主が毎手番2ダメージを受けます。ヒートロボが攻撃してきたら「発動する」を押して、かみなりでヒートロボを破壊しよう。', want: a => a.t === 'respond' && !!a.resp, miss: 'かみなりを発動しよう' },
      { say: '攻撃したロボがいなくなったので攻撃は中止。アクションは相手の攻撃宣言に合わせて使えるのが強みです。', waitFor: 'cpu-turn-done' },
      { say: 'これでルールはひと通りです！ 効果の種類は「通電（電池が入っている間だけ働く）」「放電（電池を抜いて使う）」「常時（いつでも）」の3つ。カード図鑑でいつでも確認できます。', final: true },
    ] },
];
function cardIdOf(uid) {
  const s = G.s;
  const f = E.findRobo(s, uid); if (f) return f.y.id;
  for (const p of s.players) { const c = p.hand.find(c => c.uid === uid) || (p.set && p.set.uid === uid ? p.set : null); if (c) return c.id; }
  return null;
}
function startLesson(i) {
  const L = LESSONS[i];
  const s = mkState(L.setup);
  $('#dbgbar').hidden = true; SPD = 1;
  G = { id: ++gameSeq, s, diff: null, opt: {}, mode: 'tut', busy: false, sel: null, logIdx: 0, flash: new Set(), deployFx: {}, drawFx: {},
    tut: { i, step: 0, hl: null, cpuScript: null } };
  $('#modeLabel').textContent = 'チュートリアル ' + L.title;
  show('game'); refresh();
  G.tut.cpuScript = L.cpuScript ? L.cpuScript() : [];
  coachStep();
}
function curStep() { const t = G.tut; return LESSONS[t.i].steps[t.step]; }
function coachStep() {
  const t = G.tut, st = curStep();
  t.hl = st.hl || null; t.hlSet = st.hlSet;
  $('#coach').hidden = false;
  const L = LESSONS[t.i];
  $('#coachTitle').textContent = `${L.title}（${t.step + 1}/${L.steps.length}）`;
  $('#coachText').innerHTML = st.say;
  const nb = $('#coachNext');
  if (st.final) { nb.hidden = false; nb.textContent = t.i < LESSONS.length - 1 ? '次のレッスンへ' : 'タイトルへ'; }
  else if (!st.want && !st.waitFor) { nb.hidden = false; nb.textContent = '次へ'; }
  else nb.hidden = true;
  render();
}
function coachNext() {
  const t = G.tut, st = curStep();
  if (st.final) { if (t.i < LESSONS.length - 1) return startLesson(t.i + 1); return toTitle(); }
  advance();
}
function advance() {
  const t = G.tut, L = LESSONS[t.i];
  t.step++;
  if (t.step >= L.steps.length) return lessonClear();
  coachStep();
}
function lessonClear() {
  const t = G.tut;
  const last = t.i >= LESSONS.length - 1;
  openSheet(`<div class="over win">${img('battery', 'overart')}<h2>レッスン${t.i + 1} クリア</h2><p>${LESSONS[t.i].title.slice(3)}を覚えました。</p></div>
    <div class="row"><button class="btn" id="toTitle2">タイトルへ</button>${last ? '' : '<button class="btn primary" id="nextL">次のレッスンへ</button>'}</div>`, sh => {
      sh.querySelector('#toTitle2').addEventListener('click', () => { closeSheet(); toTitle(); });
      const n = sh.querySelector('#nextL'); if (n) n.addEventListener('click', () => { closeSheet(); startLesson(t.i + 1); });
    }, true);
}
// 人間の行動がいまのステップに合っているか
function tutGate(a) {
  const st = curStep();
  if (st.want && st.want(a)) return true;
  if (a.t === 'battle' && st.battle) return true;
  const c = $('#coach'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  toast(st.miss || (st.want ? 'ガイドに沿って進めよう' : 'まずは「次へ」を押そう'));
  return false;
}
function tutAfter(a) {
  if (!G || G.mode !== 'tut') return;
  const st = curStep();
  if (a.t === 'attack-resolved' && G.tut.afterAttack) { G.tut.afterAttack = false; return advance(); }
  if (st.want && st.want(a)) {
    if (a.t === 'attack') { G.tut.afterAttack = true; return; }
    if (a.t === 'end') {
      // CPUの手番がある時は後続ステップへ、ないレッスンは終了
      if (LESSONS[G.tut.i].cpuScript) return advance();
      return lessonClear();
    }
    return advance();
  }
  if (st.waitFor && st.waitFor === a.t) return advance();
}
// チュートリアル中の応答プロンプト：説明ステップを先に進める
const _humanRespond = humanRespond;
humanRespond = function () {
  return _humanRespond().then(r => { if (G && G.mode === 'tut' && r) { const st = curStep(); if (st.want && st.want({ t: 'respond', resp: r })) advance(); } return r; });
};

// ---------- ルール・図鑑 ----------
function renderRules() {
  const ys = E.ROBO_IDS.map(id => ({ uid: -1, id, owner: 0, bat: 0 }));
  const ss = E.SPELL_IDS.map(id => ({ uid: -1, id, owner: 0, bat: 0 }));
  // デッキに入らないカード（後攻が持つワンモア、コブンロボから出るアニキロボ）
  const ts = ['onemore', 'aniki'].map(id => ({ uid: -1, id, owner: 0, bat: 0 }));
  const rs = E.RETIRED_IDS.map(id => ({ uid: -1, id, owner: 0, bat: 0 }));
  const row = c => { const d = CARDS[c.id]; return `<div class="dex">${cardHTML(c, { size: 'hand' })}<div><h4>${d.name}${d.rare ? ' ★' : ''}${d.kind === 'robo' ? `<span class="dexmeta">攻撃力${shownAtk(c)}${d.enterBat ? '（電池込み）' : ''}・電池上限${d.max}・${EFF_LABEL[d.eff]}</span>` : '<span class="dexmeta">アクション</span>'}</h4><p>${cardText(d)}</p></div></div>`; };
  // ロボは効果の種類ごとにまとめ、グループ内は攻撃力→名前の順。アクションは名前順
  const ROBO_GROUPS = [['const', '【常時】場にいる間ずっと働く'], ['powered', '【通電中】電池が入っている間だけ働く'], ['release', '【放電】電池を1本抜いて使う'], ['none', '効果なし']];
  const byAtk = (a, b) => (CARDS[a.id].kind === 'robo' ? shownAtk(a) - shownAtk(b) : 0) || CARDS[a.id].name.localeCompare(CARDS[b.id].name, 'ja');
  const grouped = (list, keyOf, groups) => groups.map(([k, label]) => {
    const g = list.filter(c => keyOf(c) === k).sort(byAtk);
    return g.length ? `<h3 class="dexgrp">${label}</h3>` + g.map(row).join('') : '';
  }).join('');
  const roboKey = c => CARDS[c.id].eff;
  const byName = list => list.slice().sort((a, b) => CARDS[a.id].name.localeCompare(CARDS[b.id].name, 'ja')).map(row).join('');
  $('#dexRobo').innerHTML = grouped(ys, roboKey, ROBO_GROUPS);
  $('#dexSpell').innerHTML = byName(ss);
  $('#dexToken').innerHTML = ts.map(row).join('');
  const rr = rs.filter(c => CARDS[c.id].kind === 'robo'), rsp = rs.filter(c => CARDS[c.id].kind !== 'robo');
  $('#dexRetired').innerHTML = grouped(rr, roboKey, ROBO_GROUPS) + (rsp.length ? '<h3 class="dexgrp">アクション</h3>' + byName(rsp) : '');
  $('#dexRetiredBox').hidden = !rs.length;
  // ローグライト用：テーマごと（ロボは攻撃力順、アクションは名前順）、最後に基本カード
  const sortT = list => list.slice().sort((a, b) => (CARDS[a.id].kind === CARDS[b.id].kind ? 0 : CARDS[a.id].kind === 'robo' ? -1 : 1) || byAtk(a, b));
  const asCards = ids => ids.map(id => ({ uid: -1, id, owner: 0, bat: 0 }));
  $('#dexRogue').innerHTML = Object.keys(E.THEMES).map(k => `<h3 class="dexgrp">${E.THEMES[k].name}</h3>` + sortT(asCards(E.THEMES[k].ids)).map(row).join('')).join('')
    + `<h3 class="dexgrp">基本カード（最初のデッキ）</h3>` + sortT(asCards(E.BASIC_IDS)).map(row).join('')
    + `<h3 class="dexgrp">デッキに入らないカード</h3>` + asCards(['guardbot']).map(row).join('')
    + `<h3 class="dexgrp">そのほか</h3>` + asCards(['sabi']).map(row).join('');
  // イベントの一覧（種類ごと）
  const KIND = { A: 'デッキ', B: '改造', C: 'パーツ（ラン中ずっと効く）', D: '取引・賭け', E: '特殊な対戦', F: '情報・選択' };
  $('#rogueEvents').innerHTML = Object.keys(KIND).map(k => `<h3 class="dexgrp">${KIND[k]}</h3>` +
    Object.values(Run.EVENTS).filter(ev => ev.kind === k).map(ev => `<p class="evdesc"><b>${ev.name}</b>${ev.text}</p>`).join('')).join('');
}

// ルール画面：タブ（スタンダード／勝ち抜きモード）を切り替えて開く
function rulesTab(tab) {
  document.querySelectorAll('[data-rtab]').forEach(b => b.classList.toggle('on', b.dataset.rtab === tab));
  $('#rulesStd').hidden = tab !== 'std'; $('#rulesRogue').hidden = tab !== 'rogue';
  window.scrollTo(0, 0);
}
function openRules(tab) { show('rules'); rulesTab(tab); }

// ---------- 初期化 ----------
// 夜空の星（ドット）を背景タイルとして生成
function makeStars() {
  const c = document.createElement('canvas'); c.width = 96; c.height = 96;
  const g = c.getContext('2d'); let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cols = ['#3a3b6e', '#4d4f8a', '#7fd8f0', '#e3b54d', '#ece4cf'];
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(r() * 96), y = Math.floor(r() * 96), col = cols[Math.floor(r() * r() * cols.length)];
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
    if (r() > .9) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
  document.documentElement.style.setProperty('--stars', `url(${c.toDataURL()})`);
}
function init() {
  makeStars();
  $('#titleArt').innerHTML = ['souji', 'bomb', 'battery', 'magnet', 'daruma'].map((id, i) => img(id, 'tart t' + i)).join('');
  renderTitleStats(); renderRules();
  document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => startGame(b.dataset.diff, $('#firstSel').value)));
  $('#runNew').addEventListener('click', startNewRun);
  $('#runCont').addEventListener('click', continueRun);
  $('#runBack').addEventListener('click', toTitle);
  $('#tutBtn').addEventListener('click', () => { $('#lessonPick').hidden = !$('#lessonPick').hidden; });
  $('#lessonPick').innerHTML = LESSONS.map((L, i) => `<button class="btn lesson" data-lesson="${i}">${L.title}</button>`).join('');
  $('#lessonPick').addEventListener('click', e => { const b = e.target.closest('[data-lesson]'); if (b) startLesson(+b.dataset.lesson); });
  $('#rulesBtn').addEventListener('click', () => openRules('std'));
  document.querySelectorAll('[data-rtab]').forEach(b => b.addEventListener('click', () => rulesTab(b.dataset.rtab)));
  $('#dbgBtn').addEventListener('click', openDebugEditor);
  $('#dbgStart').addEventListener('click', startDebug);
  $('#dbgBack').addEventListener('click', () => { if (G && G.mode === 'debug') show('game'); else show('title'); });
  $('#dbgDefault').addEventListener('click', () => { DBG = JSON.parse(JSON.stringify(DBG_DEFAULT)); dbgRenderEditor(); });
  $('#dbgEdit').addEventListener('click', () => { if (!G || G.busy) return; openDebugEditor(); });
  $('#dbgResetBtn').addEventListener('click', () => { if (!G || G.busy || G.s.turn !== 0) return; dbgReset(0, '配置に戻しました'); G.s.firstTurn = false; render(); });
  $('#dbgAtk2').addEventListener('change', e => { DBG.attacker = e.target.value; saveDbg(); });
  $('#dbgSpd2').addEventListener('change', e => { DBG.speed = +e.target.value; SPD = DBG.speed; saveDbg(); });
  $('#dbgRestore2').addEventListener('change', e => { DBG.restore = e.target.checked; saveDbg(); });
  $('#rulesBack').addEventListener('click', () => show(G ? 'game' : 'title'));
  $('#board').addEventListener('click', onBoardClick);
  bindLongPress($('#board'));
  bindDrag($('#board'));
  bindAim($('#board'));
  document.addEventListener('click', e => { if (!e.target.closest('#pop') && !e.target.closest('#board')) closePop(); });
  window.addEventListener('resize', closePop);
  $('#endBtn').addEventListener('click', () => humanAct({ t: 'end' }));
  $('#battleBtn').addEventListener('click', e => { e.stopPropagation(); closePop(); onBattleBtn(); });
  $('#selCancel').addEventListener('click', selCancel);
  $('#selOk').addEventListener('click', selOk);
  $('#coachNext').addEventListener('click', coachNext);
  $('#sheetBack').addEventListener('click', () => { if (!$('#sheetBack').dataset.modal) closeSheet(); });
  $('#menuBtn').addEventListener('click', () => openSheet(`<h3>メニュー</h3>
    <div class="col"><button class="btn" id="mRules">ルール・カード図鑑</button><button class="btn" id="mLog">これまでの経過</button><button class="btn danger" id="mQuit">対戦をやめてタイトルへ</button><button class="btn ghost" id="mClose">閉じる</button></div>`, sh => {
      sh.querySelector('#mRules').addEventListener('click', () => { closeSheet(); openRules(G && G.run ? 'rogue' : 'std'); });
      sh.querySelector('#mLog').addEventListener('click', () => { closeSheet(); $('#logDrawer').hidden = false; const l = $('#logList'); l.scrollTop = l.scrollHeight; });
      sh.querySelector('#mQuit').addEventListener('click', toTitle);
      sh.querySelector('#mClose').addEventListener('click', closeSheet);
    }));
  $('#ticker').addEventListener('click', () => { $('#logDrawer').hidden = false; const l = $('#logList'); l.scrollTop = l.scrollHeight; });
  $('#logClose').addEventListener('click', () => { $('#logDrawer').hidden = true; });
  show('title');
}
init();
})();
