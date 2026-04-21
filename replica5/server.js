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

app.get('/board', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${NODE_ID} Board</title>
  <style>
    body { background:#111; color:#eee; font-family:monospace; text-align:center; margin:0; padding:10px; }
    canvas { border:3px solid #0f0; background:#fff; cursor:crosshair; display:block; margin:10px auto; }
    canvas.readonly { border-color:#44f; cursor:not-allowed; }
    #status { padding:8px; margin:8px auto; max-width:820px; border-radius:6px; font-size:14px; }
    .leader-banner { background:#0a2a0a; border:1px solid #0f0; color:#0f0; }
    .follower-banner { background:#0a0a2a; border:1px solid #44f; color:#44f; }
    .offline-banner { background:#2a0a0a; border:1px solid #f44; color:#f44; }
  </style>
</head>
<body>
  <h2 id="title">Loading...</h2>
  <div id="status">Connecting...</div>
  <canvas id="c" width="800" height="500"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const PORT = window.location.port;
    let drawing = false;
    let isLeader = false;
    let lastLogSize = 0;

    // Drawing locally
    canvas.addEventListener('mousedown', (e) => {
      if (!isLeader) return;
      drawing = true;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      ctx.beginPath(); ctx.moveTo(x, y);
      sendStroke('start', x, y);
    });
    canvas.addEventListener('mouseup', () => {
      if (!isLeader || !drawing) return;
      drawing = false;
      ctx.beginPath();
      sendStroke('end', 0, 0);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!isLeader || !drawing) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
      ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
      sendStroke('draw', x, y);
    });

    async function sendStroke(type, x, y) {
      try {
        await fetch('/append', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stroke: { type, x, y } })
        });
      } catch(e) {}
    }

    function redrawLog(log) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
      let penDown = false;
      for (const entry of log) {
        const s = entry.data;
        if (!s) continue;
        if (s.type === 'start') { ctx.beginPath(); ctx.moveTo(s.x, s.y); penDown = true; }
        else if (s.type === 'draw' && penDown) { ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s.x, s.y); }
        else if (s.type === 'end') { ctx.beginPath(); penDown = false; }
      }
    }

    async function refresh() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        isLeader = data.isLeader;

        document.getElementById('title').textContent =
          data.nodeId + ' — ' + data.state + ' (Term ' + data.term + ')';

        const statusDiv = document.getElementById('status');
        if (data.isLeader) {
          statusDiv.className = 'leader-banner';
          statusDiv.textContent = 'YOU ARE THE LEADER — Draw here! Log size: ' + data.log.length;
          canvas.className = '';
        } else {
          statusDiv.className = 'follower-banner';
          statusDiv.textContent = 'FOLLOWER — Read only | Leader: ' + (data.leader || 'none') + ' | Log size: ' + data.log.length;
          canvas.className = 'readonly';
        }

        // Only redraw if log changed
        if (data.log.length !== lastLogSize) {
          lastLogSize = data.log.length;
          redrawLog(data.log);
        }
      } catch(e) {
        document.getElementById('status').className = 'offline-banner';
        document.getElementById('status').textContent = 'OFFLINE';
      }
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => { console.log(NODE_ID + ' running on port ' + PORT); raft.start(); });
