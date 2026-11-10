import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3000);
const app = createApp();
// No host argument: Node binds dual-stack (:: and 0.0.0.0), which Railway's
// proxy needs; binding only 0.0.0.0 can yield "Application failed to respond".
app.listen(PORT, () => {
  console.log(`TikTok Pre-check đang chạy tại http://localhost:${PORT} (PORT=${process.env.PORT || 'mặc định'})`);
});
