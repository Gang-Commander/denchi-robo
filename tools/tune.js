// CPU同士の自己対戦による評価関数の重み調整（(1+1)進化戦略 + 確認対戦）
const AI=require('../src/ai.js'),S=require('../src/sim.js'),E=require('../src/engine.js'),fs=require('fs');
const keys=Object.keys(AI.BASE_W);
let champ=Object.assign({},AI.BASE_W, process.argv[4]?JSON.parse(require('fs').readFileSync(process.argv[4])).w:{});
const rng=E.mulberry32(+process.argv[5]||12345);
const gauss=()=>{let u=0,v=0;while(!u)u=rng();while(!v)v=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
const ITER=+process.argv[2]||150, N=+process.argv[3]||300;
let seed=(+process.argv[5]||1)*1000000, accepted=0; const hist=[];
for(let it=0;it<ITER;it++){
  const m=Object.assign({},champ);
  const nk=1+Math.floor(rng()*3);
  for(let j=0;j<nk;j++){const k=keys[Math.floor(rng()*keys.length)]; const sc=Math.max(0.3,Math.abs(m[k])); m[k]=+(m[k]+gauss()*0.35*sc).toFixed(3); if(k!=='heat'&&k!=='lethal'&&m[k]<-1)m[k]=-1;}
  const r=S.match({w:m},{w:champ},N,seed); seed+=N;
  let ok=false;
  if(r.rate>=0.54){ // 別シードで確認
    const r2=S.match({w:m},{w:champ},N,seed); seed+=N;
    if((r.rate+r2.rate)/2>=0.53){champ=m;accepted++;ok=true;}
  }
  hist.push({it,rate:r.rate,ok});
  if(ok) console.log(`it${it} accepted rate=${r.rate.toFixed(3)}`,JSON.stringify(champ));
}
const fin=S.match({w:champ},{w:AI.BASE_W},2000,9000000);
console.log('FINAL tuned vs base',fin);
fs.writeFileSync(process.argv[6]||'tuned.json',JSON.stringify({w:champ,final:fin,accepted,iters:ITER,gamesPer:N},null,1));
