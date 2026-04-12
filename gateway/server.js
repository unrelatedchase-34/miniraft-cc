const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
const replicas = process.env.REPLICAS.split(',');

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.post('/append', async (req, res) => {
  for (let replica of replicas) {
    try {
      const result = await axios.post(`${replica}/append`, req.body);
      return res.json(result.data);
    } catch (e) { continue; }
  }
  res.status(503).json({ error: 'no leader found' });
});

app.listen(8080, () => console.log('Gateway on 8080'));
