# 💬 GIAO DIỆN WEB CHATBOT — VINUNI ACADEMIC AGENT

Giao diện Web cho bài Lab 3, nối trực tiếp tới **ReAct Agent** (`src/app.py`) và **MCP Server** (`src/mcp_server.py`).
Server chỉ dùng thư viện chuẩn Python (`http.server`) nên **không cần cài thêm package** ngoài `requirements.txt`.

## ⚡ Cách chạy

```bash
# Đứng ở thư mục gốc dự án, đã kích hoạt .venv
python ui/server.py                 # mở http://127.0.0.1:8080
python ui/server.py --port 9000     # đổi cổng
```

Provider LLM được chọn theo `LLM_PROVIDER` trong `.env` (giống `python src/app.py`). Nếu chưa có API Key, giao diện hiển thị cảnh báo **Mock Offline**.

## ✨ Tính năng

| Tính năng | Mô tả |
| :--- | :--- |
| **2 chế độ phản hồi** | `ReAct Agent` (Cấp 3, gọi Tool qua MCP) và `Chatbot Baseline` (Cấp 2, không Tool) để so sánh trực tiếp. |
| **Chuỗi suy luận ReAct** | Mỗi câu trả lời có bảng thu gọn hiển thị từng bước Thought → Action → Observation → Final Answer, trạng thái Tool (`SUCCESS` / `NOT_FOUND` / lỗi) và độ trễ. |
| **Kịch bản kiểm thử** | Sidebar tải các câu hỏi từ `config/test_cases.json`, bấm để chạy ngay. |
| **Danh sách MCP Tools** | Hiển thị Tool đang công bố từ MCP Server cùng tham số (dấu `*` = bắt buộc). |
| **Tải trace JSON** | Xuất toàn bộ trace của phiên chat theo đúng định dạng `docs/trace_waterfall.json`. |
| **Trải nghiệm** | Giao diện sáng/tối, responsive trên điện thoại, hiển thị Markdown, sao chép câu trả lời, thử lại khi lỗi, lưu lịch sử trong trình duyệt. |

## 🔌 API

| Method | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/info` | Provider, model, MCP Server, danh sách Tools và test cases. |
| `POST` | `/api/chat` | Body `{"message": "...", "mode": "agent" \| "chatbot"}` → `{"answer", "trace", "mode", "latency_ms"}`. |

## 📝 Lưu ý

- Mỗi câu hỏi được Agent xử lý độc lập (giống `--interactive`), không mang ngữ cảnh các lượt trước.
- Giao diện **không ghi đè** `docs/trace_waterfall.json` — file nộp bài vẫn được sinh bởi `python src/app.py --all`.
- Server mặc định chỉ lắng nghe `127.0.0.1` và chỉ phục vụ các file trong thư mục `ui/`.
