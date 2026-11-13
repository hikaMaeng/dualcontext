const fs = require('fs');
const queries = JSON.parse(fs.readFileSync('_experiments/F1/queries.json','utf8'));
(async () => {
 for (const q of queries) {
  for (let attempt=1; attempt<=2; attempt++) {
   const start=Date.now();
   console.log(JSON.stringify({id:q.id,attempt,event:'start',at:new Date().toISOString()}));
   try {
    const res=await fetch('http://127.0.0.1:18081/api/admin/augment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q.query}),signal:AbortSignal.timeout(1200000)});
    const body=await res.text();
    if (!res.ok) {fs.writeFileSync(`_experiments/F1/runs/${q.id}.attempt${attempt}.http.txt`,body,'utf8');throw Error('HTTP '+res.status);}
    JSON.parse(body);
    fs.writeFileSync(`_experiments/F1/runs/${q.id}.json`,body,'utf8');
    console.log(JSON.stringify({id:q.id,attempt,event:'success',ms:Date.now()-start}));
    break;
   } catch(e) {
    fs.appendFileSync('_experiments/F1/failures.jsonl',JSON.stringify({id:q.id,attempt,ms:Date.now()-start,error:String(e),at:new Date().toISOString()})+'\n','utf8');
    console.log(JSON.stringify({id:q.id,attempt,event:'failure',ms:Date.now()-start,error:String(e)}));
   }
  }
 }
})().catch(e=>{console.error(e);process.exitCode=1});
