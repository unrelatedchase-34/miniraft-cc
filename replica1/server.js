const express = require('express');
const axios = require('axios');
const { RaftNode } = require('./raft');

const PORT = 3001;
const NODE_ID = 'replica1';
const PEERS = ['http://localhost:3002', 'http://localhost:3003'];

const app = express();
app.use(express.json());

const raft = new RaftNode(NODE_ID, PEERS);

app.post('/append', async (req, res) => {
  if (!raft.isLeader()) {
    return res.status(403).json({ error: 'not leader', leader: raft.leaderId });
  }
  const committed = await raft.appendEntry(req.body.stroke);
  res.json({ success: committed });
});

app.post('/raft/append-entries', (req, res) => {
  res.json(raft.handleAppendEntries(req.body));
});

app.post('/raft/request-vote', (req, res) => {
  res.json(raft.handleRequestVote(req.body));
});

app.get('/status', (req, res) => {
  res.json({
    nodeId: NODE_ID,
    state: raft.state,
    term: raft.currentTerm,
    isLeader: raft.isLeader(),
    leader: raft.leaderId,
    log: raft.log
  });
});

app.get('/sync-log', (req, res) => {
  if (!raft.isLeader()) {
    return res.status(403).json({ error: 'not leader' });
  }
  res.json({ log: raft.log, term: raft.currentTerm });
});

async function syncFromLeader() {
  for (let peer of PEERS) {
    try {
      const res = await axios.get(`${peer}/sync-log`);
      if (res.data.log) {
        raft.log = res.data.log;
        raft.currentTerm = res.data.term;
        console.log(`[${NODE_ID}] synced ${raft.log.length} entries from leader`);
        return;
      }
    } catch (e) {}
  }
  console.log(`[${NODE_ID}] no leader found, starting fresh`);
}

app.listen(PORT, async () => {
  console.log(`${NODE_ID} running on port ${PORT}`);
  await syncFromLeader();
  raft.start();
});
