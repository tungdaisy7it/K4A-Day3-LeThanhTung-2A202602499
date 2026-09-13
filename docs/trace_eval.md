# 📊 BÁO CÁO THU HOẠCH NGHIỆM THU BÀI LAB 3 (BƯỚC 3 — SUBMISSION ARTIFACT)

> **Họ và Tên Học viên:** Lê Thanh Tùng  
> **Mã Sinh Viên / Mã Học viên:** 2A202602499  
> **Chủ đề Lựa chọn:** Gợi ý 1.1 — Trợ lý Học vụ & Tra cứu Lịch thi VinUni (Tra cứu điểm GPA/hồ sơ học vụ và đặt lịch tư vấn học vụ với Cố vấn)  

---

## 1. BẢNG CHẤM ĐIỂM AGENTIC FIT SCORING MATRIX (ĐÁNH GIÁ CHỦ ĐỀ)

| Tiêu chí Đánh giá | Mức độ (1 - 5) | Giải trình chi tiết lý do chọn điểm |
| :--- | :---: | :--- |
| **1. Multi-step Reasoning** | 4 / 5 | Ở kịch bản đặt lịch có điều kiện (TC04), Agent phải tra cứu hồ sơ sinh viên để xác định đúng Cố vấn học tập trước, rồi mới suy luận bước tiếp theo là gọi công cụ đặt lịch — không thể trả lời trong một bước duy nhất. |
| **2. Tool Interaction** | 5 / 5 | Hệ thống bắt buộc phải gọi qua MCP Server để lấy dữ liệu học vụ thời gian thực (`academic_query`) và tạo bản ghi hành động thực tế (`schedule_appointment`); không thể trả lời chính xác chỉ bằng kiến thức nội tại của LLM. |
| **3. Dynamic Decision** | 4 / 5 | Kết quả `Observation` của bước tra cứu (ví dụ tên Cố vấn, hoặc `NOT_FOUND` ở TC05) quyết định trực tiếp Agent có tiếp tục gọi Tool đặt lịch hay dừng lại phản hồi lịch sự. |
| **4. Long Horizon Goal** | 3 / 5 | Mỗi phiên hỏi-đáp thường hoàn tất trong 1–2 lượt gọi Tool (không có mục tiêu xuyên suốt nhiều phiên dài như Agent Cấp 4), nhưng vẫn cần giữ ngữ cảnh sinh viên xuyên suốt các bước trong cùng một truy vấn multi-step. |
| **TỔNG ĐIỂM AGENTIC FIT** | **16 / 20** | Tổng điểm 16/20 > 12/20 → Bài toán **rất phù hợp** để triển khai dưới dạng ReAct Agent kết nối MCP Server thay vì chỉ dùng Chatbot Baseline. |

---

## 2. TRÍCH XUẤT KẾT QUẢ WATERFALL TRACE LOG (SAU KHI CHẠY TEST SUITE TRÊN API THẬT)

> ⚠️ **YÊU CẦU NGHIỆM THU:** Mở tệp `.env` điền `GEMINI_API_KEY` (hoặc `OPENAI_API_KEY`) để kết nối LLM thật trước khi thực thi `python src/app.py --all`. Bài nộp chỉ dùng Mock Offline Provider sẽ không đạt điểm nghiệm thực tế.

Đoạn trích xuất log tiêu biểu từ file `docs/trace_waterfall.json`, sinh ra từ phản hồi LLM API thật (**Provider: OpenRouter, Model: `openai/gpt-4o-mini`**) khi chạy `python src/app.py --all`. Mỗi sự kiện đều ghi trường `model` để chứng minh phản hồi đến từ LLM thật (nếu API lỗi và fallback về Mock, trường này sẽ là `Offline-Mock-Model-2026`).

**TC04 — Suy luận đa bước (Thought → Action → Observation → Thought → Action → Observation → Final Answer):**

```json
[
  {
    "step": 1,
    "query": "Hãy tra cứu thông tin học vụ của sinh viên SV2026001 để biết cố vấn học tập của bạn ấy là ai, sau đó đặt lịch hẹn tư vấn với chính cố vấn đó vào lúc 14:00 ngày 15/09/2026.",
    "action_type": "TOOL_EXECUTION",
    "model": "openai/gpt-4o-mini",
    "thought": "OpenRouter (openai/gpt-4o-mini) quyết định gọi công cụ 'academic_query' với tham số: {\"student_id\": \"SV2026001\"}",
    "tool_name": "academic_query",
    "arguments": { "student_id": "SV2026001" },
    "observation": {
      "status": "SUCCESS",
      "student_id": "SV2026001",
      "data": {
        "full_name": "Nguyễn Văn An",
        "class": "AI-K4",
        "gpa": 3.85,
        "email": "an.nv@vinuni.edu.vn",
        "status": "Đang học",
        "advisor": "PGS.TS Nguyễn Văn A"
      }
    },
    "latency_ms": 898.85
  },
  {
    "step": 2,
    "action_type": "TOOL_EXECUTION",
    "model": "openai/gpt-4o-mini",
    "thought": "OpenRouter (openai/gpt-4o-mini) quyết định gọi công cụ 'schedule_appointment' với tham số: {\"student_id\": \"SV2026001\", \"datetime_str\": \"14:00 15/09/2026\", \"advisor_name\": \"PGS.TS Nguyễn Văn A\"}",
    "tool_name": "schedule_appointment",
    "arguments": {
      "student_id": "SV2026001",
      "datetime_str": "14:00 15/09/2026",
      "advisor_name": "PGS.TS Nguyễn Văn A"
    },
    "observation": {
      "status": "SUCCESS",
      "booking_id": "BK-SV2026001-99",
      "student_id": "SV2026001",
      "datetime": "14:00 15/09/2026",
      "advisor": "PGS.TS Nguyễn Văn A",
      "message": "Đặt lịch thành công cho sinh viên SV2026001 với PGS.TS Nguyễn Văn A vào lúc 14:00 15/09/2026."
    },
    "latency_ms": 961.65
  },
  {
    "step": 3,
    "action_type": "FINAL_ANSWER",
    "model": "openai/gpt-4o-mini",
    "thought": "OpenRouter phản hồi trực tiếp bằng văn bản (không cần gọi công cụ).",
    "output": "Thông tin học vụ của sinh viên SV2026001 như sau: ... Cố vấn học tập: PGS.TS Nguyễn Văn A. Ngoài ra, tôi đã đặt lịch hẹn tư vấn thành công với PGS.TS Nguyễn Văn A cho bạn vào lúc 14:00 ngày 15/09/2026. Mã đặt lịch: BK-SV2026001-99 ...",
    "latency_ms": 2250.97
  }
]
```

*(Trường `query` ở bước 2 và 3 giống bước 1 nên được lược bớt; `output` được rút gọn — xem bản đầy đủ trong `docs/trace_waterfall.json`.)*

Tham số `advisor_name` ở bước 2 (`PGS.TS Nguyễn Văn A`) **không có trong câu hỏi gốc** mà được Agent lấy từ Observation của bước 1. Điều này chứng minh vòng lặp ReAct đã dùng kết quả Tool để quyết định Action tiếp theo.

**TC05 — Edge case:** Agent xử lý đúng trường hợp `NOT_FOUND` và không bịa đặt dữ liệu:

```json
[
  {
    "step": 1,
    "action_type": "TOOL_EXECUTION",
    "model": "openai/gpt-4o-mini",
    "tool_name": "academic_query",
    "arguments": { "student_id": "SV9999999" },
    "observation": {
      "status": "NOT_FOUND",
      "message": "Không tìm thấy dữ liệu sinh viên có mã 'SV9999999'"
    },
    "latency_ms": 923.77
  },
  {
    "step": 2,
    "action_type": "FINAL_ANSWER",
    "model": "openai/gpt-4o-mini",
    "output": "Không tìm thấy dữ liệu cho sinh viên có mã SV9999999. Có thể mã sinh viên này không tồn tại hoặc đã được nhập sai. Bạn có thể kiểm tra lại mã sinh viên và thử lại.",
    "latency_ms": 907.98
  }
]
```

---

## 3. TỔNG KẾT KẾT QUẢ NGHIỆM THU & NỘP BÀI

- [x] Đã điền API Key thật trong `.env` (`LLM_PROVIDER=openrouter`, model `openai/gpt-4o-mini` qua OpenRouter — tương thích chuẩn OpenAI API) và xác nhận Agent chạy trên LLM API thật (10/10 sự kiện trace có `"model": "openai/gpt-4o-mini"`, không có sự kiện nào fallback về Mock).
- **Tổng số Test Cases đã chạy thành công:** 5 / 5 test cases (TC01–TC05), tổng cộng 10 sự kiện trace.

| Test Case | Loại | Chuỗi thực thi thực tế | Kết quả |
| :---: | :--- | :--- | :---: |
| TC01 | `direct_query` | Final Answer (không gọi Tool) | ✅ |
| TC02 | `single_tool_query` | `academic_query` → Final Answer | ✅ |
| TC03 | `appointment_booking` | `schedule_appointment` → Final Answer | ✅ |
| TC04 | `multi_step_reasoning` | `academic_query` → `schedule_appointment` → Final Answer | ✅ |
| TC05 | `edge_case_handling` | `academic_query` (`NOT_FOUND`) → Final Answer lịch sự | ✅ |

- **Số lượt gọi Tool qua MCP Server chính xác:** 5 / 5 lượt (TC02: 1, TC03: 1, TC04: 2, TC05: 1). TC01 không gọi Tool vì là câu hỏi kiến thức chung, đúng như kỳ vọng thiết kế.
- **Ghi chú kỹ thuật:**
  - `run_react_agent()` trong `src/app.py` lặp tối đa `MAX_ITERATIONS = 5` vòng. Sau mỗi Action, kết quả Observation được nạp vào lịch sử ReAct cho lượt suy luận kế tiếp. Vòng lặp chỉ dừng khi LLM trả về câu trả lời văn bản (Final Answer), hoặc khi hết số vòng cho phép.
  - Native Tool Calling của OpenAI/OpenRouter không trả về đoạn suy luận dạng văn bản, nên trường `thought` do Provider Adapter sinh ra để mô tả quyết định của LLM (gọi Tool nào, với tham số gì). Tên Tool và tham số trong `thought` đều lấy từ phản hồi thật của LLM.
  - Bổ sung giao diện Web Chatbot tại thư mục `ui/` (`python ui/server.py`): cho phép chat với ReAct Agent hoặc Chatbot Baseline và xem trực quan chuỗi Thought → Action → Observation của từng câu trả lời.
- **Kết quả đẩy Repo nộp bài:** [ ] Đã Commit và Push mã nguồn thành công lên GitHub cá nhân.

---

> ✅ **HOÀN TẤT NỘP BÀI:** Sao chép đường link GitHub Repository cá nhân của bạn và dán vào ô nộp bài trên hệ thống LMS VLearn để hoàn tất Bài Lab 3!
