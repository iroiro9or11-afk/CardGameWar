const {setTimeout:delay}=require('timers/promises');
(async()=>{
const page=(await fetch('http://127.0.0.1:9222/json')).json;
const tabs=await fetch('http://127.0.0.1:9222/json').then(r=>r.json());
console.log(tabs.map(t=>({url:t.url,id:t.id})))
const t=tabs.find(t=>t.url.includes('/work48/index.html') || t.url.includes('file:///mnt/data/work48/index.html'));
const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0,cb=new Map();ws.addEventListener('message',e=>{let m=JSON.parse(e.data);if(cb.has(m.id)){cb.get(m.id)(m);cb.delete(m.id)}});const send=(method,params={})=>new Promise((res,rej)=>{let n=++id;cb.set(n,m=>m.error?rej(m.error):res(m.result));ws.send(JSON.stringify({id:n,method,params}))});
for(const exp of [`({href:location.href,ready:window.__cardBattleAppReady,app:document.readyState, input:!!document.getElementById('performance-lab-battle-count'),len:document.body.innerHTML.length, title:document.title})`,`typeof allCards`,`typeof runPerformanceLab`,`document.body.innerText.slice(0,200)`]) {const r=await send('Runtime.evaluate',{expression:exp,awaitPromise:true,returnByValue:true});console.log(exp,JSON.stringify(r));}
ws.close();
})().catch(console.error);
