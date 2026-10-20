// スクラップ見直し案1
module.exports = E => {
  const C = E.CARDS;
  C.gattai.max = 3;          // 電池上限 5→3
  C.hack.rare = true;        // レアにする
  C.reboot.atk = 3;          // 2・2 → 3・2
  C.junk.draw = 1;           // 手札に戻したあと1枚引く
  C.parts.salvage = true;    // 壊したロボの電池を味方へ移す
};
