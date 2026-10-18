// カード別の勝率・使用率を集計（つよいCPU同士のミラー対戦）
const E=require('../src/engine.js'),AI=require('../src/ai.js'),fs=require('fs');
const W=JSON.parse(fs.readFileSync(process.env.TUNED||require('path').join(__dirname,'../src/tuned.json'))).w;
const [seed0,N,out]=[+process.argv[2],+process.argv[3],process.argv[4]];
const ids=E.DECK_IDS, st={}; for(const id of ids) st[id]={drawn:0,drawnWin:0,notDrawn:0,notDrawnWin:0,open:0,openWin:0,played:0,playedWin:0,set:0,reveal:0,deadEnd:0};
let games=0, firstWins=0, turns=0;
for(let g=0;g<N;g++){
  const rng=E.mulberry32(seed0+g), first=g%2;
  const s=E.newGame(rng,first,{log:false});
  const opt={w:W,rng};
  const uid2={}; for(const p of s.players) for(const c of p.deck.concat(p.hand)) uid2[c.uid]=c;
  const opening=[new Set(s.players[0].hand.map(c=>c.id)), new Set(s.players[1].hand.map(c=>c.id))];
  const played=[new Set(),new Set()], setIds=[new Set(),new Set()], rev=[new Set(),new Set()];
  let guard=0;
  while(!E.isOver(s)&&guard++<3000){
    const me=s.turn; const a=AI.chooseAction(s,opt)||{t:'end'};
    if(a.t==='play'){ played[me].add(uid2[a.uid].id); }
    if(a.t==='set'){ setIds[me].add(uid2[a.uid].id); }
    E.apply(s,a);
    if(s.pending){ if(E.needsResponse(s)){ const di=1-s.turn, c=s.players[di].set; const r=AI.chooseResponseFor(s,opt); if(r&&c){ played[di].add(c.id); rev[di].add(c.id);} E.respond(s,r);} else E.resolveBattle(s); }
  }
  games++; turns+=s.turnNo; const w=s.draw?-1:s.winner; if(w===first) firstWins++;
  for(const pi of [0,1]){
    const win=w===pi?1:(w===-1?0.5:0), P=s.players[pi];
    const notDrawn=new Set(P.deck.map(c=>c.id));
    const inHandEnd=new Set(P.hand.map(c=>c.id));
    for(const id of ids){
      const x=st[id];
      if(notDrawn.has(id)){ x.notDrawn++; x.notDrawnWin+=win; continue; }
      x.drawn++; x.drawnWin+=win;
      if(opening[pi].has(id)){ x.open++; x.openWin+=win; }
      const usedAny = played[pi].has(id) || setIds[pi].has(id);
      if(usedAny){ x.played++; x.playedWin+=win; }
      if(setIds[pi].has(id)) x.set++;
      if(rev[pi].has(id)) x.reveal++;
      if(inHandEnd.has(id)) x.deadEnd++;
    }
  }
}
fs.writeFileSync(out, JSON.stringify({games,firstWins,turns,st}));
