import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3000);
const app = createApp();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`TikTok Pre-check đang chạy tại http://localhost:${PORT}`);
});
