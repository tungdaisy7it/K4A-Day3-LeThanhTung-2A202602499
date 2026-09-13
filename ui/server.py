"""
🌐 WEB CHAT SERVER (DAY 03: CHATBOT VS REACT AGENT)
Phục vụ giao diện Web Chatbot và nối trực tiếp tới ReAct Agent (src/app.py) + MCP Server.
Chỉ dùng thư viện chuẩn Python (http.server) — không cần cài thêm package.

Chạy từ thư mục gốc dự án:
    python ui/server.py              -> http://127.0.0.1:8080
    python ui/server.py --port 9000
"""

import argparse
import json
import os
import sys
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from dotenv import load_dotenv

UI_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(UI_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, "src"))

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

load_dotenv(os.path.join(BASE_DIR, ".env"))

from app import load_test_cases, run_react_agent  # noqa: E402
from mcp_server import MCPAcademicServer  # noqa: E402
from prompts import CHATBOT_BASELINE_PROMPT, MAX_ITERATIONS  # noqa: E402
from providers import MockOfflineProvider, get_llm_provider  # noqa: E402

# Chỉ phục vụ đúng các file tĩnh này (tránh lộ file khác trong repo như .env)
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "application/javascript; charset=utf-8"),
}
MAX_BODY_BYTES = 16 * 1024
MAX_MESSAGE_CHARS = 2000

provider = get_llm_provider()
mcp_server = MCPAcademicServer()


def build_info() -> dict:
    """Thông tin cấu hình hiển thị trên sidebar giao diện"""
    tools = []
    for tool in mcp_server.list_tools():
        params = tool.get("parameters", {})
        tools.append({
            "name": tool.get("name"),
            "description": tool.get("description", ""),
            "params": list(params.get("properties", {}).keys()),
            "required": params.get("required", []),
        })

    suggestions = [
        {
            "id": tc.get("id"),
            "type": tc.get("type"),
            "question": tc.get("question"),
            "complexity": tc.get("complexity"),
        }
        for tc in load_test_cases()
        if not tc.get("question", "").strip().startswith("TODO")
    ]

    return {
        "provider": provider.__class__.__name__,
        "model": getattr(provider, "model_name", ""),
        "is_mock": isinstance(provider, MockOfflineProvider),
        "mcp_server": {"name": mcp_server.server_name, "version": mcp_server.version},
        "max_iterations": MAX_ITERATIONS,
        "tools": tools,
        "suggestions": suggestions,
    }


def handle_chat(payload: dict) -> dict:
    """Chạy 1 lượt hỏi đáp ở chế độ ReAct Agent (Cấp 3) hoặc Chatbot Baseline (Cấp 2)"""
    message = str(payload.get("message", "")).strip()
    mode = payload.get("mode", "agent")
    if not message:
        raise ValueError("Câu hỏi không được để trống.")
    if len(message) > MAX_MESSAGE_CHARS:
        raise ValueError(f"Câu hỏi quá dài (tối đa {MAX_MESSAGE_CHARS} ký tự).")
    if mode not in ("agent", "chatbot"):
        raise ValueError("Chế độ không hợp lệ (chỉ hỗ trợ 'agent' hoặc 'chatbot').")

    started = time.time()
    if mode == "chatbot":
        answer = provider.generate(message, system_prompt=CHATBOT_BASELINE_PROMPT)
        trace = []
    else:
        trace = run_react_agent(message, provider, mcp_server)
        answer = next(
            (t.get("output", "") for t in reversed(trace) if t.get("action_type") == "FINAL_ANSWER"),
            "",
        )

    return {
        "mode": mode,
        "answer": answer,
        "trace": trace,
        "latency_ms": round((time.time() - started) * 1000, 2),
    }


class ChatRequestHandler(BaseHTTPRequestHandler):
    server_version = "VinUniAgentUI/1.0"

    def _send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/info":
            try:
                self._send_json(HTTPStatus.OK, build_info())
            except Exception as e:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(e)})
            return

        static = STATIC_FILES.get(path)
        if not static:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy tài nguyên."})
            return

        filename, content_type = static
        with open(os.path.join(UI_DIR, filename), "rb") as f:
            body = f.read()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/chat":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy API."})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Kích thước yêu cầu không hợp lệ."})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Body phải là JSON object.")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Body không phải JSON UTF-8 hợp lệ."})
            return
        except ValueError as e:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(e)})
            return

        try:
            self._send_json(HTTPStatus.OK, handle_chat(payload))
        except ValueError as e:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(e)})
        except Exception as e:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Lỗi xử lý Agent: {e}"})

    def log_message(self, format, *args):
        print(f"🌐 [WEB] {self.address_string()} - {format % args}")


def main():
    parser = argparse.ArgumentParser(description="Web Chat UI cho ReAct Agent (Day 03 Lab)")
    parser.add_argument("--host", default=os.getenv("WEB_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("WEB_PORT", "8080")))
    args = parser.parse_args()

    httpd = ThreadingHTTPServer((args.host, args.port), ChatRequestHandler)
    print("==========================================================")
    print("💬 VINUNI ACADEMIC AGENT - WEB CHAT UI")
    print("==========================================================")
    print(f"🔌 LLM Provider: {provider.__class__.__name__} ({getattr(provider, 'model_name', '')})")
    print(f"🌐 MCP Server: {mcp_server.server_name} (Version: {mcp_server.version})")
    print(f"🚀 Mở trình duyệt tại: http://{args.host}:{args.port}")
    print("   Nhấn Ctrl+C để dừng server.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Đã dừng Web Chat Server.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
