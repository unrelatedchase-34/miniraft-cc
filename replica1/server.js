const express = require('express');
const axios = require('axios');
const { RaftNode } = require('./raft');

const PORT = process.env.PORT || 3001;
const NODE_ID = process.env.NODE_ID || 'replica1';
const PEERS = (process.env.PEERS || '').split(',').filter(Boolean);

const app = express();
app.use(express.json());

const raft = new RaftNode(NODE_ID, PEERS);

// Gateway calls this to append a stroke
app.post('/append', async (req, res) => {
  const { stroke } = req.body;
  if (!raft.isLeader()) {
    return res.status(403).json({ error: 'not leader', leader: raft.leaderId });
  }
  raft.appendEntry(stroke);
  res.json({ success: true });
});

// Ishanvee's raft receives AppendEntries RPC here
app.post('/raft/append-entries', (req, res) => {
  const result = raft.handleAppendEntries(req.body);
  res.json(result);
});

// Ishanvee's raft receives RequestVote RPC here
app.post('/raft/request-vote', (req, res) => {
  const result = raft.handleRequestVote(req.body);
  res.json(result);
});

// Gateway checks who the leader is
app.get('/status', (req, res) => {
  res.json({
    nodeId: NODE_ID,
    state: raft.state,
    term: raft.currentTerm,
    isLeader: raft.isLeader(),
    log: raft.log
  });
});

app.listen(PORT, () => {
  console.log(`${NODE_ID} running on port ${PORT}`);
  raft.start();
});
