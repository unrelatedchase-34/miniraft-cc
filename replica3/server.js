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
