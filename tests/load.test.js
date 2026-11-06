// 解禁日の同時アクセスの確認。実行: cd tests && npm install && npm run load
// 練習用データベース（エミュレーター）で、大勢が同じ瞬間に申し込んだときの
// 「成功・キャンセル待ち・失敗の数」「かかった時間」「定員を超えていないか」を確かめる。
const fs=require('fs');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const firebase=require('firebase/compat/app');require('firebase/compat/firestore');
const {makeCore}=require(process.env.CORE||__dirname+'/../core.js');
const pct=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-load',firestore:{rules:fs.readFileSync(process.env.RULES||__dirname+'/../firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
 async function scenario(title,{people,slots,capP,capG,spreadMs}){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();
   await d.doc('events/EV').set({name:'解禁日テスト',method:'先着',visible:true,wait:true,drawn:false});
   for(let i=0;i<slots;i++)await d.doc('slots/S'+i).set({eventId:'EV',eventName:'解禁日テスト',date:'2027-01-10',start:String(10+i).padStart(2,'0')+':00',end:String(11+i).padStart(2,'0')+':00',capG:capG||0,capP:capP||0,maxPer:4,booked:0,people:0,waitSeq:0});
  });
  // お客様ごとに別の端末（別の接続）として申し込む
  const jobs=[];const t0=Date.now();
  for(let i=0;i<people;i++){
   const C=makeCore(firebase,env.unauthenticatedContext().firestore());
   const n=1+(i%3),sid='S'+(i%slots);
   const delay=spreadMs?Math.random()*spreadMs:0;
   jobs.push((async()=>{await new Promise(r=>setTimeout(r,delay));const s=Date.now();let r;try{r=await C.book(sid,{name:'客'+i,tel:'0900000000',mail:'u'+i+'@x.jp',a:n,k:0,s:0,m:0})}catch(e){r={ok:false,msg:e.code||e.message}}return {ms:Date.now()-s,r,n,sid}})());
  }
  const res=await Promise.all(jobs),total=Date.now()-t0;
  const cnt={confirmed:0,wait:0,fail:0},fails={};
  res.forEach(x=>{if(!x.r.ok){cnt.fail++;fails[x.r.msg]=(fails[x.r.msg]||0)+1}else cnt[x.r.status]++});
  // 定員を超えていないか・数が合っているか
  let ok=true;const issues=[];
  await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();
   const rs=(await d.collection('reservations').get()).docs.map(x=>x.data());
   for(let i=0;i<slots;i++){const s=(await d.doc('slots/S'+i).get()).data();
    const conf=rs.filter(r=>r.slotId==='S'+i&&r.status==='confirmed');const ppl=conf.reduce((a,r)=>a+r.n,0);
    const waits=rs.filter(r=>r.slotId==='S'+i&&r.status==='wait').map(r=>r.waitNo).sort((a,b)=>a-b);
    if(s.booked!==conf.length||s.people!==ppl){ok=false;issues.push(`S${i}: 枠の数(${s.booked}組/${s.people}名)と予約(${conf.length}組/${ppl}名)が不一致`)}
    if(capP&&ppl>capP){ok=false;issues.push(`S${i}: 定員${capP}名を超過(${ppl}名)`)}
    if(capG&&conf.length>capG){ok=false;issues.push(`S${i}: 定員${capG}組を超過(${conf.length}組)`)}
    if(waits.some((w,j)=>w!==j+1)){ok=false;issues.push(`S${i}: 待ち番号が飛んでいる/重複 ${waits.join(',')}`)}
   }});
  const ms=res.map(x=>x.ms);
  console.log(`\n■ ${title}（${people}人が${spreadMs?Math.round(spreadMs/1000)+'秒の間に':'同時に'}申し込み・${slots}枠）`);
  console.log(`  結果: 確定 ${cnt.confirmed} / キャンセル待ち ${cnt.wait} / 失敗 ${cnt.fail}`+(cnt.fail?' '+JSON.stringify(fails):''));
  console.log(`  1人あたりの待ち時間: 半分の人は ${(pct(ms,.5)/1000).toFixed(1)}秒以内 / 95%の人は ${(pct(ms,.95)/1000).toFixed(1)}秒以内 / 最長 ${(Math.max(...ms)/1000).toFixed(1)}秒（全体 ${(total/1000).toFixed(1)}秒）`);
  console.log(`  定員・数の整合: ${ok?'問題なし':'問題あり'}`);issues.forEach(i=>console.log('   - '+i));
  return {cnt,ok};
 }
 await scenario('比較用：1人だけ',{people:1,slots:1,capP:12});
 await scenario('現実に近い解禁直後',{people:200,slots:20,capP:12,spreadMs:60000});
 await scenario('同じ1枠に集中（定員12名）',{people:50,slots:1,capP:12});
 await scenario('人気の枠に集中（定員5組）',{people:100,slots:4,capG:5});
 await scenario('解禁直後の一斉申し込み',{people:300,slots:20,capP:12});
 await env.cleanup();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
