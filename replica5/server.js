const express = require('express');
const { RaftNode } = require('./raft');
const PORT = process.env.PORT || 3001;
const NODE_ID = process.env.NODE_ID || 'replica1';
const PEERS = (process.env.PEERS || '').split(',').filter(Boolean);
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
const raft = new RaftNode(NODE_ID, PEERS);
app.post('/append', async (req, res) => {
  if (!raft.isLeader()) return res.status(403).json({ error: 'not leader', leader: raft.leaderId });
  const committed = await raft.appendEntry(req.body.stroke);
  res.json({ success: committed });
});
app.post('/raft/append-entries', (req, res) => { res.json(raft.handleAppendEntries(req.body)); });
app.post('/raft/request-vote', (req, res) => { res.json(raft.handleRequestVote(req.body)); });
app.get('/status', (req, res) => {
  res.json({ nodeId: NODE_ID, state: raft.state, term: raft.currentTerm, isLeader: raft.isLeader(), leader: raft.leaderId, log: raft.log });
});
app.listen(PORT, () => { console.log(NODE_ID + ' running on port ' + PORT + ' peers: ' + PEERS); raft.start(); });

app.get('/board', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>${NODE_ID} Board</title>
  <style>
    body { background:#111; color:#eee; font-family:monospace; text-align:center; }
    canvas { border:2px solid #0f0; background:#fff; }
    h2 { color:#0f0; }
    #info { color:#aaa; font-size:12px; }
  </style>
</head>
<body>
  <h2>${NODE_ID} — Drawing Board</h2>
  <div id="info">State: loading...</div>
  <br>
  <canvas id="c" width="800" height="500"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');

    async function refresh() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        document.getElementById('info').textContent =
          'State: ' + data.state + ' | Term: ' + data.term +
          ' | Leader: ' + (data.leader || 'none') +
          ' | Log size: ' + data.log.length;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';

        let penDown = false;
        for (const entry of data.log) {
          const s = entry.data;
          if (!s) continue;
          if (s.type === 'start') {
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            penDown = true;
          } else if (s.type === 'draw' && penDown) {
            ctx.lineTo(s.x, s.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
          } else if (s.type === 'end') {
            ctx.beginPath();
            penDown = false;
          }
        }
      } catch(e) {}
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`);
});
