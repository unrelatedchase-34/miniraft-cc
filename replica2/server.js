const express = require('express');
const axios = require('axios');
const { RaftNode } = require('./raft');

const PORT = 3002;
const NODE_ID = 'replica2';
const PEERS = ['http://localhost:3001', 'http://localhost:3003'];

const app = express();
app.use(express.json());

const raft = new RaftNode(NODE_ID, PEERS);

app.post('/append', (req, res) => {
  if (!raft.isLeader()) {
    return res.status(403).json({ error: 'not leader', leader: raft.leaderId });
  }
  raft.appendEntry(req.body.stroke);
  res.json({ success: true });
});

app.post('/raft/append-entries', (req, res) => {
  const result = raft.handleAppendEntries(req.body);
  res.json(result);
});

app.post('/raft/request-vote', (req, res) => {
  const result = raft.handleRequestVote(req.body);
  res.json(result);
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

app.listen(PORT, () => {
  console.log(`replica2 running on port ${PORT}`);
  raft.start();
});
