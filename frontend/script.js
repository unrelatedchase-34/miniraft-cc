const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
let drawing = false;
const ws = new WebSocket("ws://localhost:8080");
ws.onmessage = (event) => {
  const { x, y, type } = JSON.parse(event.data);
  if (type === 'start') { ctx.beginPath(); ctx.moveTo(x, y); }
  else if (type === 'draw') { ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y); }
  else if (type === 'end') { ctx.beginPath(); }
};
canvas.addEventListener("mousedown", (e) => {
  drawing = true;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  ctx.beginPath(); ctx.moveTo(x, y);
  ws.send(JSON.stringify({ type: 'start', x, y }));
});
canvas.addEventListener("mouseup", () => {
  drawing = false; ctx.beginPath();
  ws.send(JSON.stringify({ type: 'end' }));
});
canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
  ws.send(JSON.stringify({ type: 'draw', x, y }));
});
