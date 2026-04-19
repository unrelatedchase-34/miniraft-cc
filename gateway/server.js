const express = require('express');
const axios = require('axios');
const { WebSocketServer } = require('ws');
const http = require('http');
const app = express();
app.use(express.json());
const replicas = (process.env.REPLICAS || '').split(',').filter(Boolean);
const clients = new Set();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('message', async (data) => {
    const stroke = JSON.parse(data);
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) client.send(JSON.stringify(stroke));
    }
    for (let replica of replicas) {
      try { await axios.post(`${replica}/append`, { stroke }); break; } catch (e) { continue; }
    }
  });
  ws.on('close', () => clients.delete(ws));
});
server.listen(8080, () => console.log('Gateway on 8080'));
