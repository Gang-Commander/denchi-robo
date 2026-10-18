const E=require('../src/engine.js'),AI=require('../src/ai.js'),S=require('../src/sim.js');
// ランダムプレイで整合性テスト
let errs=0;
for(let g=0;g<2000;g++){
  const rng=E.mulberry32(g); const s=E.newGame(rng,g%2,{log:false});
  let k=0;
  while(!E.isOver(s)&&k++<2000){
    const acts=AI.mainActions(s).concat(AI.attackOptions(s));
    const a=(acts.length&&rng()<0.85)?acts[Math.floor(rng()*acts.length)]:{t:'end'};
    try{E.apply(s,a);}catch(e){errs++;console.log('illegal gen',a,e.message);break;}
    if(s.pending){ if(E.needsResponse(s)){ const r=AI.chooseResponseFor(s,{}); E.respond(s,rng()<0.5?r:null);} else E.resolveBattle(s);}
    E.invariant(s);
  }
  if(!E.isOver(s)) {errs++; console.log('not over',g);}
}
console.log('random games ok, errs',errs);
let t=Date.now();
const random={randomRate:1};
console.log('base vs random',S.match({},random,40,1000,true),(Date.now()-t)+'ms');
t=Date.now();
console.log('base vs ignoreSet',S.match({},{ignoreSet:true},40,2000,true),(Date.now()-t)+'ms');
