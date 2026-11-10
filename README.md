# TikTok Pre-check: Still Frame

Web app kiểm tra video **trước khi đăng lên TikTok Shop**:

- **Still Frame**: dùng ffmpeg `freezedetect` tìm các đoạn khung hình đứng yên, chấm ĐẠT / CẦN SỬA / KHÔNG ĐẠT, vẽ timeline và contact sheet có mốc thời gian.
- **Unoriginal Content**: checklist tự kiểm tra (lỗi này không check offline được, TikTok so với kho video nội bộ).
- Nhắc chạy **Video Pre-Check Tool** chính chủ của TikTok ở bước cuối.

Video được xoá khỏi máy chủ ngay sau khi phân tích. Ảnh kết quả tự xoá sau 60 phút.

## Ngưỡng chấm điểm (là kinh nghiệm, không phải quy tắc công bố của TikTok)

| Kết quả | Điều kiện |
|---|---|
| ĐẠT (PASS) | không đoạn nào ≥ 1s và tổng đứng yên < 10% |
| CẦN SỬA (WARN) | có đoạn 1–2s, hoặc tổng ≥ 10% |
| KHÔNG ĐẠT (FAIL) | có đoạn ≥ 2s, hoặc tổng > 30% |

Đoạn ngắn hơn 0.5s bị bỏ qua. Chỉnh bằng tham số `minFreeze` / `noise` trong `src/analyze.js` nếu cần.

## Chạy trên máy (Windows / Mac / Linux)

Cần Node.js 20+. ffmpeg được tải tự động qua `ffmpeg-static`, không cần cài.

```bash
npm install
npm start
```

Mở http://localhost:3000.

Test:

```bash
npm test
```

## Deploy cho nhiều người dùng

### Cách 1: Docker trên VPS (khuyên dùng)

```bash
docker compose up -d --build
```

App chạy ở cổng 3000. Đặt Nginx / Caddy phía trước để có HTTPS. Ví dụ Caddyfile:

```
precheck.example.com {
    reverse_proxy localhost:3000
    request_body {
        max_size 500MB
    }
}
```

### Cách 2: Railway / Render / Fly.io

Các dịch vụ này tự nhận `Dockerfile`:

- **Railway**: New Project → Deploy from GitHub repo → chọn repo này. Railway đọc Dockerfile và set `PORT` tự động.
- **Render**: New Web Service → Docker → chọn repo. Free tier bị giới hạn CPU, video dài sẽ chậm.
- **Fly.io**: `fly launch` (chọn Dockerfile) rồi `fly deploy`.

Lưu ý: free tier thường giới hạn dung lượng upload (Render ~100MB) và tắt máy khi không dùng, lần đầu mở sẽ chậm.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 3000 | Cổng HTTP |
| `MAX_UPLOAD_MB` | 500 | Dung lượng video tối đa |
| `RESULT_TTL_MINUTES` | 60 | Thời gian giữ ảnh kết quả |
| `CONCURRENCY` | 2 | Số video phân tích song song (mỗi video chiếm ~1 CPU) |
| `FFMPEG_PATH`, `FFPROBE_PATH` | ffmpeg-static | Đường dẫn ffmpeg nếu muốn dùng bản cài sẵn |
| `FONT_PATH` | tự tìm | Font cho mốc thời gian trên contact sheet |

## Cấu hình máy chủ

1 vCPU / 1GB RAM đủ cho nhóm nhỏ. Video 60s dọc 1080p phân tích mất khoảng 10–20s. Nếu nhiều người dùng cùng lúc, tăng `CONCURRENCY` theo số CPU.

## API

`POST /api/check` với form-data field `video`. Trả về JSON:

```json
{
  "verdict": "FAIL",
  "duration": 6,
  "segments": [{ "start": 3, "end": 6 }],
  "totalFrozen": 3, "longest": 3, "pct": 50,
  "sheets": ["/results/<id>/sheet_01.jpg"]
}
```

Có thể gọi từ script hoặc tích hợp vào tool nội bộ khác.
