const WebSocket = require('ws');
const axios = require('axios');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

const REPLICAS = [
  'http://replica1:3001',
  'http://replica2:3002',
  'http://replica3:3003'
];

let clients = new Set();
let leaderUrl = null;

// Find which replica is the leader
async function findLeader() {
  for (let replica of REPLICAS) {
    try {
      const res = await axios.get(`${replica}/status`);
      if (res.data.isLeader) {
        leaderUrl = replica;
        console.log(`Leader found: ${replica}`);
        return;
      }
    } catch (e) {}
  }
  console.log('No leader found yet, retrying...');
  leaderUrl = null;
}

// Keep checking for leader every 1 second
setInterval(findLeader, 1000);
findLeader();

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  ws.on('message', async (data) => {
    const stroke = JSON.parse(data.toString());
    console.log('Received stroke:', stroke);

    // Forward to leader
    if (leaderUrl) {
      try {
        await axios.post(`${leaderUrl}/append`, { stroke });
      } catch (e) {
        console.log('Failed to forward to leader, retrying...');
        await findLeader();
      }
    }

    // Broadcast to all clients
    for (let client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(stroke));
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

console.log(`Gateway running on ws://localhost:${PORT}`);