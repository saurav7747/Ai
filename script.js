// Saurav AI - Main Script
const STORAGE_KEY = "saurav-ai-history";
const MAX_CHARS = 4000;

let chatHistory = [];
let isLoading = false;
let isDark = true;

// DOM refs
const chatContainer = document.getElementById("chat-container");
const welcome = document.getElementById("welcome");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const charCount = document.getElementById("char-count");
const toast = document.getElementById("toast");
const themeBtn = document.getElementById("theme-btn");
const clearBtn = document.getElementById("clear-btn");

// ── Init ──
function init() {
  loadHistory();
  renderAll();
  messageInput.addEventListener("input", onInput);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener("click", sendMessage);
  themeBtn.addEventListener("click", toggleTheme);
  clearBtn.addEventListener("click", clearChat);

  // Suggestion chips
  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      messageInput.value = chip.dataset.prompt;
      onInput();
      sendMessage();
    });
  });

  // Load theme pref
  const savedTheme = localStorage.getItem("saurav-theme");
  if (savedTheme === "light") { isDark = false; applyTheme(); }
}

// ── Theme ──
function toggleTheme() {
  isDark = !isDark;
  applyTheme();
  localStorage.setItem("saurav-theme", isDark ? "dark" : "light");
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  themeBtn.textContent = isDark ? "☀️" : "🌙";
}

// ── Storage ──
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    chatHistory = raw ? JSON.parse(raw) : [];
  } catch { chatHistory = []; }
}

function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory)); } catch {}
}

// ── Render ──
function renderAll() {
  chatContainer.innerHTML = "";
  if (chatHistory.length === 0) {
    welcome.style.display = "flex";
    return;
  }
  welcome.style.display = "none";
  chatHistory.forEach((msg) => renderMessage(msg));
  scrollToBottom();
}

function renderMessage(msg) {
  const wrap = document.createElement("div");
  wrap.className = `message ${msg.role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = msg.role === "user" ? "U" : "✦";

  const right = document.createElement("div");

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = formatText(msg.content);

  const time = document.createElement("div");
  time.className = "msg-time";
  time.textContent = formatTime(msg.ts);

  right.appendChild(bubble);
  right.appendChild(time);

  wrap.appendChild(avatar);
  wrap.appendChild(right);
  chatContainer.appendChild(wrap);
}

function formatText(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "typing-indicator";
  wrap.id = "typing";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "✦";

  const dots = document.createElement("div");
  dots.className = "typing-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";

  wrap.appendChild(avatar);
  wrap.appendChild(dots);
  chatContainer.appendChild(wrap);
  scrollToBottom();
}

function removeTyping() {
  document.getElementById("typing")?.remove();
}

function showError(msg) {
  const err = document.createElement("div");
  err.className = "error-msg";
  err.innerHTML = `⚠️ ${msg}`;
  chatContainer.appendChild(err);
  scrollToBottom();
  setTimeout(() => err.remove(), 6000);
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ── Input ──
function onInput() {
  const len = messageInput.value.length;
  charCount.textContent = `${len} / ${MAX_CHARS}`;
  charCount.className = "char-count" + (len > MAX_CHARS * 0.85 ? " warn" : "");
  sendBtn.disabled = len === 0 || isLoading;

  // Auto-resize
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
}

// ── Send ──
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;
  if (text.length > MAX_CHARS) { showToast("Message too long"); return; }

  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    showError("No API key set. Open config.js and add your Gemini API key.");
    return;
  }

  // Add user message
  const userMsg = { role: "user", content: text, ts: Date.now() };
  chatHistory.push(userMsg);
  saveHistory();

  welcome.style.display = "none";
  renderMessage(userMsg);

  messageInput.value = "";
  messageInput.style.height = "auto";
  charCount.textContent = `0 / ${MAX_CHARS}`;
  sendBtn.disabled = true;
  isLoading = true;

  showTyping();
  scrollToBottom();

  try {
    const reply = await callGemini(chatHistory);
    const aiMsg = { role: "ai", content: reply, ts: Date.now() };
    chatHistory.push(aiMsg);
    saveHistory();
    removeTyping();
    renderMessage(aiMsg);
    scrollToBottom();
  } catch (err) {
    removeTyping();
    const msg = err.message.includes("API_KEY") ? "Invalid API key. Check config.js."
      : err.message.includes("quota") ? "API quota exceeded. Try again later."
      : err.message.includes("network") || err.message.includes("fetch") ? "Network error. Check your connection."
      : "Something went wrong. Please try again.";
    showError(msg);
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

// ── Gemini API ──
async function callGemini(history) {
  const contents = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const url = `${CONFIG.GEMINI_API_URL}/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.8, topK: 40, topP: 0.95, maxOutputTokens: 2048 },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
    });
  } catch { throw new Error("network error"); }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData?.error?.message || `HTTP ${res.status}`;
    if (res.status === 400) throw new Error("API_KEY invalid: " + errMsg);
    if (res.status === 429) throw new Error("quota exceeded");
    throw new Error(errMsg);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from AI");
  return text;
}

// ── Clear ──
function clearChat() {
  if (chatHistory.length === 0) return;
  if (!confirm("Clear all messages? This can't be undone.")) return;
  chatHistory = [];
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
  showToast("Chat cleared");
}

// ── Toast ──
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

init();
