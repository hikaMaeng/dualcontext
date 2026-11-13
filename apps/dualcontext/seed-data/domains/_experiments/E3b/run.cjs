const fs = require('fs');
const path = require('path');
const base = __dirname;
const queries = JSON.parse(fs.readFileSync(path.join(base, 'queries.json'), 'utf8'));
fs.mkdirSync(path.join(base, 'runs'), { recursive: true });
(async () => {
  const attempts = [];
  for (const q of queries) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      try {
        const response = await fetch('http://127.0.0.1:18081/api/admin/augment', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: q.query }), signal: AbortSignal.timeout(900000)
        });
        const raw = await response.text();
        attempts.push({ id: q.id, attempt, status: response.status, ms: Date.now() - started });
        if (response.ok) {
          JSON.parse(raw);
          fs.writeFileSync(path.join(base, 'runs', q.id + '.json'), raw, 'utf8');
          console.log(q.id, 'success', Date.now() - started);
          break;
        }
        console.log(q.id, 'HTTP', response.status);
        if (response.status < 500) break;
      } catch (error) {
        attempts.push({ id: q.id, attempt, error: String(error), ms: Date.now() - started });
        console.log(q.id, 'error', String(error));
      }
    }
    fs.writeFileSync(path.join(base, 'attempts.json'), JSON.stringify(attempts, null, 2), 'utf8');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
