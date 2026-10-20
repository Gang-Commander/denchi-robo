// 基本カードの試案。setup(CARDS) でカード定義を書き換え、デッキ（id の配列）を返す（null なら BASIC_DECK）
const def = (C, id, o) => { C[id] = Object.assign({ id, kind: 'robo', eff: 'none', max: 2, text: '' }, o); };
module.exports = {
  now:    { note: '現状', setup: () => null },
  nocoin: { note: '現状＋後攻のワンモアなし', v: { noCoin: true }, setup: () => null },
  rush:   { note: 'ノーマル：攻撃する時+1', setup: C => { C.normal.onAttack = { atk: 1 }; } },
  shock:  { note: '静電気→ショック（相手に2ダメージ）', setup: C => { def(C, 'shock', { kind: 'spell', name: 'ショック', burn: 2 }); return ['normal','normal','normal','mini','mini','garakuta','drycell','drycell','shock','shock']; } },
  spread: { note: 'ノーマル×3→3/1×2・1/3×1', setup: C => { def(C, 'n31', { name: 'N31', atk: 3, max: 1 }); def(C, 'n13', { name: 'N13', atk: 1, max: 3 }); return ['n31','n31','n13','mini','mini','garakuta','drycell','drycell','static','static']; } },
  ping:   { note: 'ミニ：攻撃した時相手に1ダメージ', setup: C => { C.mini.onAttack = { ping: 1 }; } },
  rushshock: { note: 'rush＋shock', setup: C => { C.normal.onAttack = { atk: 1 }; def(C, 'shock', { kind: 'spell', name: 'ショック', burn: 2 }); return ['normal','normal','normal','mini','mini','garakuta','drycell','drycell','shock','shock']; } },
};
