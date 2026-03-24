const socket = new WebSocket("ws://localhost:3000");

// 🔹 STEP 2: Canvas setup
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

let drawing = false;

// 🔹 STEP 3: Start drawing
canvas.addEventListener("mousedown", () => {
  drawing = true;
});

// 🔹 STEP 4: Stop drawing
canvas.addEventListener("mouseup", () => {
  drawing = false;
  ctx.beginPath();
});

// 🔹 STEP 5: Drawing + SENDING DATA (IMPORTANT PART)
canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // draw locally
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y);

  // 🔥 SEND DATA TO SERVER (THIS IS STEP 8)
  socket.send(JSON.stringify({ x, y }));
});

// 🔹 STEP 6: RECEIVE DATA FROM SERVER (THIS IS STEP 9)
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineTo(data.x, data.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(data.x, data.y);
};
