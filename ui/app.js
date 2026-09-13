/* ==========================================================================
   VinUni Academic Agent — Web Chat UI logic
   Gọi API: GET /api/info, POST /api/chat (xem ui/server.py)
   ========================================================================== */
(() => {
  "use strict";

  const STORAGE_KEY = "vinuni-agent-chat-v1";
  const MODE_KEY = "vinuni-agent-mode";
  const THEME_KEY = "vinuni-agent-theme";

  const MODES = {
    agent: {
      label: "ReAct Agent",
      hint: "Cấp 3 — suy luận Thought → Action → Observation, gọi Tool qua MCP Server để lấy dữ liệu thật.",
      placeholder: "Hỏi về hồ sơ học vụ, GPA hoặc đặt lịch tư vấn…",
    },
    chatbot: {
      label: "Chatbot Baseline",
      hint: "Cấp 2 — LLM trả lời trực tiếp, không gọi Tool. Dùng để so sánh với ReAct Agent.",
      placeholder: "Hỏi Chatbot Baseline (không có quyền truy cập dữ liệu)…",
    },
  };

  const TYPE_LABELS = {
    direct_query: "Hỏi đáp chung",
    single_tool_query: "Tra cứu học vụ",
    appointment_booking: "Đặt lịch hẹn",
    multi_step_reasoning: "Suy luận đa bước",
    edge_case_handling: "Trường hợp biên",
  };

  const ICONS = {
    agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11.5V16c0 1.9 2.7 3.5 6 3.5s6-1.6 6-3.5v-4.5"/></svg>',
    chatbot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 00-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 005.2-5.4l-2.6 2.6-2.5-.5-.5-2.5z"/></svg>',
    trace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    chevron: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>',
    retry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0115.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 01-15.5 6.3L3 16M3 21v-5h5"/></svg>',
  };

  // ---------------------------------------------------------------- storage
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua khi bị chặn storage */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* noop */ }
    },
  };

  // ---------------------------------------------------------------- state & DOM
  const state = {
    mode: MODES[store.get(MODE_KEY, "agent")] ? store.get(MODE_KEY, "agent") : "agent",
    messages: store.get(STORAGE_KEY, []),
    pending: false,
    info: null,
  };
  if (!Array.isArray(state.messages)) state.messages = [];

  const $ = (sel) => document.querySelector(sel);
  const el = {
    sidebar: $("#sidebar"),
    scrim: $("#scrim"),
    menuBtn: $("#menuBtn"),
    messages: $("#messages"),
    chat: $("#chat"),
    form: $("#composer"),
    input: $("#input"),
    sendBtn: $("#sendBtn"),
    modeHint: $("#modeHint"),
    modeBadge: $("#modeBadge"),
    suggestList: $("#suggestList"),
    toolList: $("#toolList"),
    toolCount: $("#toolCount"),
    connDot: $("#connDot"),
    connProvider: $("#connProvider"),
    connModel: $("#connModel"),
    mockNotice: $("#mockNotice"),
    toast: $("#toast"),
  };

  // ---------------------------------------------------------------- helpers
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatLatency(ms) {
    if (typeof ms !== "number") return "";
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
  }

  let toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200);
  }

  function persist() {
    store.set(STORAGE_KEY, state.messages);
  }

  async function api(path, body) {
    const options = body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {};
    const res = await fetch(path, options);
    let data = null;
    try { data = await res.json(); } catch { /* phản hồi không phải JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `Máy chủ trả về lỗi HTTP ${res.status}`);
    return data;
  }

  // ---------------------------------------------------------------- markdown (an toàn: escape trước)
  function renderInline(text) {
    return text
      .split(/(`[^`]+`)/g)
      .map((part, i) => (i % 2
        ? `<code>${part.slice(1, -1)}</code>`
        : part
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")))
      .join("");
  }

  function renderMarkdown(source) {
    const lines = escapeHtml(source).replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let paragraph = [];
    let list = null;
    let inCode = false;
    let code = [];

    const flushParagraph = () => {
      if (paragraph.length) out.push(`<p>${renderInline(paragraph.join("<br>"))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!list) return;
      const start = list.type === "ol" && list.start > 1 ? ` start="${list.start}"` : "";
      out.push(`<${list.type}${start}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${list.type}>`);
      list = null;
    };

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        if (inCode) {
          out.push(`<pre><code>${code.join("\n")}</code></pre>`);
          code = [];
          inCode = false;
        } else {
          flushParagraph();
          flushList();
          inCode = true;
        }
        continue;
      }
      if (inCode) { code.push(line); continue; }

      if (!line.trim()) { flushParagraph(); continue; } // giữ list mở để các mục cách dòng vẫn chung 1 danh sách

      let m = line.match(/^(#{1,4})\s+(.*)$/);
      if (m) {
        flushParagraph(); flushList();
        const level = Math.min(m[1].length + 2, 6);
        out.push(`<h${level}>${renderInline(m[2])}</h${level}>`);
        continue;
      }
      m = line.match(/^\s*[-*•]\s+(.*)$/);
      if (m) {
        flushParagraph();
        if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
        list.items.push(m[1]);
        continue;
      }
      m = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (m) {
        flushParagraph();
        if (!list || list.type !== "ol") { flushList(); list = { type: "ol", start: Number(m[1]), items: [] }; }
        list.items.push(m[2]);
        continue;
      }
      if (list && /^\s{2,}\S/.test(line)) {
        list.items[list.items.length - 1] += ` ${line.trim()}`;
        continue;
      }
      flushList();
      paragraph.push(line);
    }
    if (inCode) out.push(`<pre><code>${code.join("\n")}</code></pre>`);
    flushParagraph();
    flushList();
    return out.join("");
  }

  function renderJson(value) {
    const json = escapeHtml(JSON.stringify(value ?? {}, null, 2));
    // JSON.stringify(..., 2) đặt mỗi cặp key/value trên 1 dòng -> neo regex theo dòng để không tô nhầm nội dung chuỗi (vd "14:00")
    return json
      .replace(/^(\s*)(&quot;(?:[^&]|&(?!quot;))*?&quot;)(: )/gm, '$1<span class="k">$2</span>$3')
      .replace(/(: )(&quot;.*&quot;)(,?)$/gm, '$1<span class="s">$2</span>$3')
      .replace(/(: )(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)(,?)$/gm, '$1<span class="n">$2</span>$3');
  }

  // ---------------------------------------------------------------- trace rendering
  function statusClass(status) {
    if (status === "SUCCESS") return "ok";
    if (status === "NOT_FOUND") return "warn";
    return "err";
  }

  function renderStep(step, index) {
    const isTool = step.action_type === "TOOL_EXECUTION";
    const latency = `<span class="step-latency">${escapeHtml(formatLatency(step.latency_ms))}</span>`;
    const thought = step.thought
      ? `<div class="step-row"><div class="step-label">Thought</div><div class="step-text">${escapeHtml(step.thought)}</div></div>`
      : "";

    if (isTool) {
      const status = (step.observation && step.observation.status) || "UNKNOWN";
      return `
        <li class="step">
          <span class="step-num">${index + 1}</span>
          <div>
            <div class="step-head">
              <span class="step-kind">Action</span>
              <span class="tool-chip">${escapeHtml(step.tool_name)}</span>
              <span class="status ${statusClass(status)}">${escapeHtml(status)}</span>
              ${latency}
            </div>
            ${thought}
            <div class="step-row"><div class="step-label">Arguments</div><pre class="json">${renderJson(step.arguments)}</pre></div>
            <div class="step-row"><div class="step-label">Observation</div><pre class="json">${renderJson(step.observation)}</pre></div>
          </div>
        </li>`;
    }

    return `
      <li class="step final">
        <span class="step-num">${index + 1}</span>
        <div>
          <div class="step-head"><span class="step-kind">Final Answer</span>${latency}</div>
          ${thought}
        </div>
      </li>`;
  }

  function renderTrace(trace) {
    if (!Array.isArray(trace) || !trace.length) return "";
    const toolCalls = trace.filter((t) => t.action_type === "TOOL_EXECUTION").length;
    return `
      <details class="trace">
        <summary>
          <span class="trace-sum-left">${ICONS.trace} Chuỗi suy luận ReAct</span>
          <span class="trace-sum-meta">${trace.length} bước · ${toolCalls} tool call</span>
          ${ICONS.chevron}
        </summary>
        <ol class="timeline">${trace.map(renderStep).join("")}</ol>
      </details>`;
  }

  // ---------------------------------------------------------------- messages
  function messageNode(msg, index) {
    const node = document.createElement("article");

    if (msg.role === "user") {
      node.className = "msg msg-user";
      node.innerHTML = `<div class="bubble">${escapeHtml(msg.content)}</div>`;
      return node;
    }

    node.className = "msg msg-bot";

    if (msg.role === "error") {
      node.innerHTML = `
        <div class="avatar error">${ICONS.error}</div>
        <div class="msg-body">
          <div class="msg-head"><span class="msg-author">Không thể xử lý yêu cầu</span></div>
          <div class="md error-text">${escapeHtml(msg.content)}</div>
          <div class="msg-meta"><button class="meta-btn" type="button" data-retry="${index}">${ICONS.retry} Thử lại</button></div>
        </div>`;
      return node;
    }

    const mode = MODES[msg.mode] ? msg.mode : "agent";
    const toolCalls = (msg.trace || []).filter((t) => t.action_type === "TOOL_EXECUTION").length;
    const meta = [
      msg.latency_ms != null ? `<span>${ICONS.clock} ${escapeHtml(formatLatency(msg.latency_ms))}</span>` : "",
      mode === "agent" ? `<span>${ICONS.tool} ${toolCalls} tool call</span>` : "",
    ].join("");

    node.innerHTML = `
      <div class="avatar ${mode}">${ICONS[mode]}</div>
      <div class="msg-body">
        <div class="msg-head">
          <span class="msg-author">Trợ lý Học vụ</span>
          <span class="tag tag-${mode}">${MODES[mode].label}</span>
        </div>
        <div class="md">${renderMarkdown(msg.content || "(Không có nội dung phản hồi)")}</div>
        ${mode === "agent" ? renderTrace(msg.trace) : ""}
        <div class="msg-meta">
          ${meta}
          <button class="meta-btn" type="button" data-copy="${index}">${ICONS.copy} Sao chép</button>
        </div>
      </div>`;
    return node;
  }

  function pendingNode() {
    const node = document.createElement("article");
    node.className = "msg msg-bot";
    node.id = "pending";
    const label = state.mode === "agent" ? "Agent đang suy luận và gọi Tool" : "Chatbot đang soạn câu trả lời";
    node.innerHTML = `
      <div class="avatar ${state.mode}">${ICONS[state.mode]}</div>
      <div class="msg-body">
        <div class="msg-head"><span class="msg-author">Trợ lý Học vụ</span></div>
        <div class="typing"><span class="dots"><i></i><i></i><i></i></span>${label}<span class="elapsed" id="elapsed">0.0s</span></div>
      </div>`;
    return node;
  }

  function welcomeNode() {
    const node = document.createElement("div");
    node.className = "welcome";
    const suggestions = (state.info && state.info.suggestions) || [];
    const cards = suggestions.slice(0, 4).map((s) => `
      <button class="welcome-card" type="button" data-question="${escapeHtml(s.question)}">
        <span class="welcome-card-head">
          <span class="tag tag-id">${escapeHtml(s.id)}</span>
          <span class="tag tag-${escapeHtml(String(s.complexity || "").toLowerCase())}">${escapeHtml(TYPE_LABELS[s.type] || s.type)}</span>
        </span>
        <span class="welcome-card-q">${escapeHtml(s.question)}</span>
      </button>`).join("");

    node.innerHTML = `
      <div class="welcome-mark">${ICONS.agent}</div>
      <h2>Xin chào! Tôi có thể giúp gì cho bạn?</h2>
      <p>Tôi tra cứu hồ sơ học vụ và đặt lịch tư vấn với Cố vấn học tập thông qua MCP Server. Mỗi câu trả lời đều kèm chuỗi suy luận để bạn kiểm chứng.</p>
      ${cards ? `<div class="welcome-grid">${cards}</div>` : ""}`;
    return node;
  }

  function render() {
    el.messages.replaceChildren();
    if (!state.messages.length) {
      el.messages.appendChild(welcomeNode());
    } else {
      state.messages.forEach((msg, i) => el.messages.appendChild(messageNode(msg, i)));
    }
    if (state.pending) el.messages.appendChild(pendingNode());
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { el.chat.scrollTop = el.chat.scrollHeight; });
  }

  // ---------------------------------------------------------------- sending
  let elapsedTimer = null;

  function setPending(pending) {
    state.pending = pending;
    el.input.disabled = pending;
    updateSendButton();
    el.suggestList.querySelectorAll("button").forEach((b) => { b.disabled = pending; });
    clearInterval(elapsedTimer);
    render();
    if (pending) {
      const started = performance.now();
      elapsedTimer = setInterval(() => {
        const node = document.getElementById("elapsed");
        if (node) node.textContent = `${((performance.now() - started) / 1000).toFixed(1)}s`;
      }, 100);
    } else {
      el.input.focus();
    }
  }

  async function send(text) {
    const message = String(text || "").trim();
    if (!message || state.pending) return;

    const mode = state.mode;
    state.messages.push({ role: "user", content: message, mode, ts: Date.now() });
    persist();
    el.input.value = "";
    autoResize();
    closeSidebar();
    setPending(true);

    try {
      const data = await api("/api/chat", { message, mode });
      state.messages.push({
        role: "assistant",
        content: data.answer,
        mode: data.mode,
        trace: data.trace,
        latency_ms: data.latency_ms,
        ts: Date.now(),
      });
    } catch (err) {
      const reason = err instanceof TypeError ? "Không kết nối được tới server. Hãy kiểm tra 'python ui/server.py' còn đang chạy." : err.message;
      state.messages.push({ role: "error", content: reason, retry: message, mode, ts: Date.now() });
    } finally {
      persist();
      setPending(false);
    }
  }

  // ---------------------------------------------------------------- sidebar & info
  function applyMode(mode) {
    state.mode = mode;
    store.set(MODE_KEY, mode);
    document.querySelectorAll(".segmented button").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    });
    el.modeHint.textContent = MODES[mode].hint;
    el.modeBadge.textContent = MODES[mode].label;
    el.modeBadge.classList.toggle("chatbot", mode === "chatbot");
    el.input.placeholder = MODES[mode].placeholder;
  }

  function renderInfo(info) {
    el.connDot.className = `dot ${info.is_mock ? "warn" : "ok"}`;
    el.connProvider.textContent = info.is_mock ? "Mock Offline" : info.provider.replace(/Provider$/, "");
    el.connModel.textContent = info.model || "";
    el.connModel.title = info.model || "";
    el.mockNotice.hidden = !info.is_mock;

    el.suggestList.innerHTML = info.suggestions.map((s) => `
      <li>
        <button class="suggest-item" type="button" data-question="${escapeHtml(s.question)}">
          <span class="suggest-meta">
            <span class="tag tag-id">${escapeHtml(s.id)}</span>
            <span class="tag tag-${escapeHtml(String(s.complexity || "").toLowerCase())}">${escapeHtml(TYPE_LABELS[s.type] || s.type)}</span>
          </span>
          <span class="suggest-q">${escapeHtml(s.question)}</span>
        </button>
      </li>`).join("") || '<li class="side-hint">Chưa có test case nào trong config/test_cases.json.</li>';

    el.toolCount.textContent = info.tools.length;
    el.toolList.innerHTML = info.tools.map((t) => `
      <li class="tool-card">
        <div class="tool-name">${ICONS.tool}${escapeHtml(t.name)}</div>
        <div class="tool-desc">${escapeHtml(t.description)}</div>
        <div class="tool-params">${t.params.map((p) => `<span class="param${t.required.includes(p) ? " req" : ""}">${escapeHtml(p)}</span>`).join("")}</div>
      </li>`).join("");
  }

  async function loadInfo() {
    try {
      state.info = await api("/api/info");
      renderInfo(state.info);
      if (!state.messages.length) render();
    } catch {
      el.connDot.className = "dot err";
      el.connProvider.textContent = "Mất kết nối server";
      el.connModel.textContent = "python ui/server.py";
      el.suggestList.innerHTML = '<li class="side-hint">Không tải được cấu hình từ server.</li>';
    }
  }

  function openSidebar() {
    el.sidebar.classList.add("open");
    el.scrim.hidden = false;
    el.menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    el.sidebar.classList.remove("open");
    el.scrim.hidden = true;
    el.menuBtn.setAttribute("aria-expanded", "false");
  }

  // ---------------------------------------------------------------- composer
  function autoResize() {
    el.input.style.height = "auto";
    el.input.style.height = `${Math.min(el.input.scrollHeight, 200)}px`;
  }
  function updateSendButton() {
    el.sendBtn.disabled = state.pending || !el.input.value.trim();
  }

  // ---------------------------------------------------------------- export trace
  function exportTrace() {
    const trace = state.messages
      .filter((m) => m.role === "assistant" && Array.isArray(m.trace))
      .flatMap((m) => m.trace);
    if (!trace.length) {
      toast("Chưa có trace ReAct nào để tải xuống.");
      return;
    }
    const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trace_waterfall_ui_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(`Đã xuất ${trace.length} sự kiện trace.`);
  }

  function clearChat() {
    if (state.pending) return;
    state.messages = [];
    store.remove(STORAGE_KEY);
    render();
    el.input.focus();
  }

  // ---------------------------------------------------------------- theme
  function currentTheme() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit) return explicit;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set(THEME_KEY, next);
  }

  // ---------------------------------------------------------------- events
  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(el.input.value);
  });

  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(el.input.value);
    }
  });
  el.input.addEventListener("input", () => { autoResize(); updateSendButton(); });

  document.querySelectorAll(".segmented button").forEach((b) => {
    b.addEventListener("click", () => applyMode(b.dataset.mode));
  });

  // Uỷ quyền sự kiện cho các nút sinh động (gợi ý, sao chép, thử lại)
  document.addEventListener("click", async (e) => {
    const question = e.target.closest("[data-question]");
    if (question && !question.disabled) {
      send(question.dataset.question);
      return;
    }

    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) {
      const msg = state.messages[Number(copyBtn.dataset.copy)];
      try {
        await navigator.clipboard.writeText(msg ? msg.content : "");
        toast("Đã sao chép câu trả lời.");
      } catch {
        toast("Trình duyệt không cho phép sao chép.");
      }
      return;
    }

    const retryBtn = e.target.closest("[data-retry]");
    if (retryBtn && !state.pending) {
      const index = Number(retryBtn.dataset.retry);
      const failed = state.messages[index];
      if (!failed) return;
      // Bỏ tin nhắn lỗi và câu hỏi tương ứng rồi gửi lại
      const start = index > 0 && state.messages[index - 1].role === "user" ? index - 1 : index;
      state.messages.splice(start, index - start + 1);
      if (failed.mode && MODES[failed.mode]) applyMode(failed.mode);
      send(failed.retry);
    }
  });

  $("#newChatBtn").addEventListener("click", () => { clearChat(); closeSidebar(); });
  $("#clearBtn").addEventListener("click", clearChat);
  $("#exportBtn").addEventListener("click", exportTrace);
  $("#themeBtn").addEventListener("click", toggleTheme);
  el.menuBtn.addEventListener("click", openSidebar);
  el.scrim.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });

  // ---------------------------------------------------------------- init
  applyMode(state.mode);
  render();
  loadInfo();
  el.input.focus();
})();
