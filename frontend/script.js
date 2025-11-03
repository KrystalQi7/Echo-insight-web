// Echo Insight 前端脚本：页面路由、鉴权、API交互、UI 逻辑

// ============== 基础工具 ==============
// 根据加载协议确定 API 基址：若以 file:// 打开，强制走本地后端
const API_BASE = (() => {
  try {
    // Production: Vercel frontend -> Render backend
    if (window.location.hostname.includes('vercel.app')) {
      return 'https://RENDER_BACKEND_URL_PLACEHOLDER';
    }
    // Local development: file protocol
    if (window.location && window.location.protocol === 'file:') {
      return 'http://localhost:3000';
    }
    // Local development: localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    // Default: same origin
    return window.location.origin || "";
  } catch (_) {
    return "";
  }
})();

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

// 事件埋点工具
async function trackEvent(type, payload = {}) {
  try {
    await api("/api/events", {
      method: "POST",
      body: JSON.stringify({ type, payload }),
    });
  } catch (err) {
    console.warn('[EchoInsight] Event tracking failed:', type, err);
  }
}

// 刷新起始包进度
async function refreshStarterProgress() {
  try {
    await api("/api/starter/recalculate", { method: "POST" });
    const progress = await api("/api/user/progress");
    updateStarterProgressUI(progress);
  } catch (err) {
    console.warn('[EchoInsight] Progress refresh failed:', err);
  }
}

// 更新起始包进度UI
function updateStarterProgressUI(progress) {
  const starterPassed = progress?.starter_passed || false;
  const starterScore = progress?.starter_score || 0;
  const starterActions = progress?.starter_actions_done || 0;
  
  // 更新进度条
  const progressBar = $("#starterProgressBar");
  const progressText = $("#starterProgressText");
  const progressContainer = $("#starterProgressContainer");
  
  if (progressContainer) {
    if (starterPassed) {
      progressContainer.innerHTML = `
        <div class="starter-completed">
          <h3>🎉 起始包已完成！</h3>
          <p>你已解锁更深层的自我探索内容</p>
        </div>
      `;
    } else {
      const percentage = Math.min((starterScore / 60) * 100, 100);
      progressContainer.innerHTML = `
        <div class="starter-progress">
          <h3>起始包进度</h3>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%"></div>
          </div>
          <p class="progress-text">${starterScore}/60 分 (${starterActions} 个行动)</p>
          ${starterScore >= 50 ? '<p class="progress-hint">还差一步就能通关！</p>' : ''}
        </div>
      `;
    }
  }
}

function showPage(id) {
  const pages = $all('.page');
  pages.forEach((p) => {
    p.classList.remove('active');
    // 覆盖可能存在的行内样式，确保切页生效
    p.style.display = 'none';
  });
  const target = document.getElementById(id);
  if (target) {
    const flexPages = new Set(['auth', 'forgot-password', 'mbti-selection', 'mood-recording', 'loading', 'main-app', 'personal-center', 'first-draw']);
    target.classList.add('active');
    target.style.display = flexPages.has(id) ? 'flex' : 'block';
  }
}

function notify(text, timeout = 2000) {
  const el = $("#notification");
  $("#notificationText").textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), timeout);
}

function getToken() {
  return localStorage.getItem("ei_token");
}

function setToken(token) {
  localStorage.setItem("ei_token", token);
}

function clearToken() {
  localStorage.removeItem("ei_token");
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  headers["Content-Type"] = "application/json; charset=utf-8";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'same-origin' });
  } catch (e) {
    console.warn('[EchoInsight] fetch error', path, e);
    // Fallback: XMLHttpRequest（规避少数环境下的 fetch 失败）
    const xhrData = await new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(options.method || 'GET', `${API_BASE}${path}`, true);
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            const contentType = xhr.getResponseHeader('content-type') || '';
            const isJson = contentType.includes('application/json');
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(isJson ? JSON.parse(xhr.responseText || '{}') : xhr.responseText);
            } else {
              try {
                const err = isJson ? JSON.parse(xhr.responseText || '{}') : null;
                reject(new Error((err && (err.error || err.message)) || `请求失败: ${xhr.status}`));
              } catch (_) {
                reject(new Error(`请求失败: ${xhr.status}`));
              }
            }
          }
        };
        xhr.onerror = () => reject(new Error('网络连接失败，请检查是否已启动后端'));
        xhr.send(options.body || null);
      } catch (err) {
        reject(err);
      }
    }).catch((err) => { throw err; });
    return xhrData;
  }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const msg = data && (data.error || data.message);
    throw new Error(msg || `请求失败: ${res.status}`);
  }
  return data;
}

// ============== 初始路由/加载 ==============
// 兜底：若事件绑定或其他原因导致初始化未执行，2 秒后强制显示登录页
setTimeout(() => {
  try {
    const anyPageActive = document.querySelector('.page.active');
    if (!anyPageActive || anyPageActive.id === 'loading') {
      showPage('auth');
      console.log('[EchoInsight] fallback -> show auth');
    }
  } catch (_) {}
}, 2000);

window.addEventListener("DOMContentLoaded", () => {
  console.log('[EchoInsight] dom ready');
  
  // 添加全局点击事件，用于关闭移动端滑动删除
  document.addEventListener('click', (e) => {
    // 如果点击的不是历史记录项或删除按钮，则关闭所有滑动项
    if (!e.target.closest('.history-item')) {
      closeAllSwipeItems();
    }
  });
  
  // 简单的 loading 动画后，根据是否已登录跳转
  setTimeout(async () => {
    try {
      if (getToken()) {
        // 埋点：次日回访（静默失败）
        try {
          await trackEvent('return_next_day');
        } catch (err) {
          console.warn('[EchoInsight] Event tracking failed:', err);
        }
        enterApp();
      } else {
        showPage("auth");
      }
    } catch (e) {
      console.warn('[EchoInsight] init error, fallback to auth', e);
      try { showPage('auth'); } catch (_) {}
    }
  }, 600);

  initAuth();
  initMbtiSelection();
  initMoodRecording();
  initMainApp();
});

// ============== 认证：登录/注册 ==============
function initAuth() {
  // 所有认证逻辑由 auth-otp.js 处理
  // 验证码登录兼具注册功能（未注册自动创建账号）
}

function logout() {
  clearToken();
  localStorage.removeItem("ei_user");
  if (typeof window.backToAuth === 'function') {
    window.backToAuth();
  } else {
    showPage("auth");
  }
}

// ============== MBTI 选择/测试 ==============
function initMbtiSelection() {
  const container = $("#mbti-selection");
  if (!container) return;

  // 两个选项按钮
  $all(".mbti-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "select") {
        showMbtiTypes();
      } else if (action === "test") {
        startMbtiTest();
      }
    });
  });
}

function showMbtiOptions() {
  $("#mbti-types").style.display = "none";
  $("#mbti-test").style.display = "none";
}

async function loadMbtiTypes() {
  try {
    const types = await api("/api/mbti-types");
    const grid = $("#typesGrid");
    grid.innerHTML = "";
    types.forEach((t) => {
      const card = document.createElement("div");
      card.className = "mbti-type-card";
      card.innerHTML = `<h3>${t.type_code} · ${t.type_name}</h3><p>${t.description}</p>`;
      card.addEventListener("click", () => selectMbtiType(t.type_code, card));
      grid.appendChild(card);
    });
  } catch (err) {
    notify("加载MBTI类型失败");
  }
}

function showMbtiTypes() {
  $("#mbti-types").style.display = "block";
  $("#mbti-test").style.display = "none";
  loadMbtiTypes();
}

async function selectMbtiType(code, element) {
  $all(".mbti-type-card").forEach((c) => c.classList.remove("selected"));
  element.classList.add("selected");
  try {
    await api("/api/user/mbti", { method: "PUT", body: JSON.stringify({ mbti_type: code }) });
    const user = JSON.parse(localStorage.getItem("ei_user") || "{}");
    user.mbti_type = code;
    localStorage.setItem("ei_user", JSON.stringify(user));
    notify("MBTI类型已更新");
    // 下一步进入心情记录（可跳过）
    showPage("mood-recording");
  } catch (err) {
    console.error('[EchoInsight] MBTI更新失败:', err);
    
    // 如果是认证错误，跳转到登录页面
    if (err.message && (err.message.includes('无效的访问令牌') || err.message.includes('认证') || err.message.includes('401'))) {
      notify('认证已过期，请重新登录');
      showPage('auth');
      return;
    }
    
    notify(err.message || "更新失败");
  }
}

// 使用文件《MBTI测试问题》的12道题
const MBTI_QUESTIONS = [
  // 1-3 E vs I
  { id: 1, text: "当你需要休息时，通常的选择是什么？", options: [
    { key: "A", text: "和朋友/家人一起外出活动", map: { E: 1 } },
    { key: "B", text: "在安静的环境中独自放松", map: { I: 1 } },
  ]},
  { id: 2, text: "如果你参加社交活动后，你感觉怎样？", options: [
    { key: "A", text: "精力充沛，想要继续社交", map: { E: 1 } },
    { key: "B", text: "感到有些疲惫，想要回家休息", map: { I: 1 } },
  ]},
  { id: 3, text: "你更喜欢哪种工作方式？", options: [
    { key: "A", text: "和别人合作、互动", map: { E: 1 } },
    { key: "B", text: "独立完成任务", map: { I: 1 } },
  ]},
  // 4-6 S vs N
  { id: 4, text: "你通常更关注事情的哪个方面？", options: [
    { key: "A", text: "细节、现实和具体的信息", map: { S: 1 } },
    { key: "B", text: "大局、未来的可能性", map: { N: 1 } },
  ]},
  { id: 5, text: "你如何处理新信息？", options: [
    { key: "A", text: "喜欢通过实际经验来学习", map: { S: 1 } },
    { key: "B", text: "倾向于从理论或概念中获取洞察", map: { N: 1 } },
  ]},
  { id: 6, text: "当你面对一个挑战时，你倾向于？", options: [
    { key: "A", text: "关注实际可行的步骤", map: { S: 1 } },
    { key: "B", text: "关注挑战中的潜在机会", map: { N: 1 } },
  ]},
  // 7-9 T vs F
  { id: 7, text: "当你做决定时，最看重什么？", options: [
    { key: "A", text: "客观的事实和逻辑", map: { T: 1 } },
    { key: "B", text: "个人的情感和他人的感受", map: { F: 1 } },
  ]},
  { id: 8, text: "你在工作/生活中的反馈偏好是？", options: [
    { key: "A", text: "直接、客观的批评和建议", map: { T: 1 } },
    { key: "B", text: "更加温和、考虑到感受的反馈", map: { F: 1 } },
  ]},
  { id: 9, text: "你更倾向于怎么处理冲突？", options: [
    { key: "A", text: "直言不讳，强调问题的解决", map: { T: 1 } },
    { key: "B", text: "试图避免冲突，考虑他人的情感", map: { F: 1 } },
  ]},
  // 10-12 J vs P
  { id: 10, text: "你通常如何处理日常任务？", options: [
    { key: "A", text: "提前计划，按部就班完成", map: { J: 1 } },
    { key: "B", text: "灵活安排，根据情况调整", map: { P: 1 } },
  ]},
  { id: 11, text: "你喜欢应对变化吗？", options: [
    { key: "A", text: "更喜欢稳定和可预测的环境", map: { J: 1 } },
    { key: "B", text: "对变化和新挑战感到兴奋", map: { P: 1 } },
  ]},
  { id: 12, text: "你更倾向于什么时候开始工作或完成任务？", options: [
    { key: "A", text: "提前开始，确保有足够的时间", map: { J: 1 } },
    { key: "B", text: "最后时刻才开始，但能应对压力", map: { P: 1 } },
  ]},
];

let testIndex = 0;
const mbtiCounter = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

function startMbtiTest() {
  $("#mbti-types").style.display = "none";
  $("#mbti-test").style.display = "block";
  testIndex = 0;
  testScores = 0;
  renderTestQuestion();
}

function renderTestQuestion() {
  const q = MBTI_QUESTIONS[testIndex];
  const card = $("#questionCard");
  const progress = ((testIndex + 1) / MBTI_QUESTIONS.length) * 100;
  $("#testProgress").style.width = `${progress}%`;
  $("#testProgressText").textContent = `${testIndex + 1} / ${MBTI_QUESTIONS.length}`;

  card.innerHTML = `
    <h3>${q.text}</h3>
    <div class="question-options">
      ${q.options
        .map(
          (op) => `
        <button class="question-option" data-key="${op.key}">
          ${op.text}
        </button>
      `
        )
        .join("")}
    </div>
  `;

  $all(".question-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const chosen = q.options.find(op => op.key === key);
      if (chosen && chosen.map) {
        Object.entries(chosen.map).forEach(([k, v]) => {
          mbtiCounter[k] = (mbtiCounter[k] || 0) + (v || 0);
        });
      }
      testIndex += 1;
      if (testIndex >= MBTI_QUESTIONS.length) {
        finishMbtiTest();
      } else {
        renderTestQuestion();
      }
    });
  });
}

async function finishMbtiTest() {
  // 基于四组维度计分推断类型
  const type =
    (mbtiCounter.E >= mbtiCounter.I ? 'E' : 'I') +
    (mbtiCounter.S >= mbtiCounter.N ? 'S' : 'N') +
    (mbtiCounter.T >= mbtiCounter.F ? 'T' : 'F') +
    (mbtiCounter.J >= mbtiCounter.P ? 'J' : 'P');
  const inferred = type;
  try {
    await api("/api/user/mbti", { method: "PUT", body: JSON.stringify({ mbti_type: inferred }) });
    const user = JSON.parse(localStorage.getItem("ei_user") || "{}");
    user.mbti_type = inferred;
    localStorage.setItem("ei_user", JSON.stringify(user));
    notify(`测试完成，你的类型更接近：${inferred}`);
    showPage("mood-recording");
  } catch (err) {
    console.error('[EchoInsight] MBTI测试结果保存失败:', err);
    
    // 如果是认证错误，跳转到登录页面
    if (err.message && (err.message.includes('无效的访问令牌') || err.message.includes('认证') || err.message.includes('401'))) {
      notify('认证已过期，请重新登录');
      showPage('auth');
      return;
    }
    
    notify("保存测试结果失败");
  }
}

// ============== 心情记录（可跳过） ==============
let selectedMood = null;
let selectedEnergy = null;
function initMoodRecording() {
  $all(".mood-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedMood = btn.dataset.mood;
      $all(".mood-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  $all(".energy-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedEnergy = btn.dataset.energy;
      $all(".energy-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  // 关心主题选中态（多选，最多2个）
  console.log('[EchoInsight] 初始化关心主题选项，找到', $all('.concern-option').length, '个选项');
  $all('.concern-option').forEach((wrapper) => {
    const checkbox = wrapper.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    
    const toggle = () => {
      const checked = checkbox.checked;
      if (checked) {
        // 限制最多选2个
        const selectedCount = $all('.concern-option input[type="checkbox"]:checked').length;
        if (selectedCount > 2) {
          checkbox.checked = false;
          return;
        }
        wrapper.classList.add('selected');
      } else {
        wrapper.classList.remove('selected');
      }
    };
    
    // 监听checkbox的change事件
    checkbox.addEventListener('change', toggle);
    
    // 监听整个label的点击事件
    wrapper.addEventListener('click', (e) => {
      console.log('[EchoInsight] 点击关心选项:', checkbox.value);
      
      // 阻止事件冒泡，避免重复触发
      e.preventDefault();
      e.stopPropagation();
      
      // 手动切换checkbox状态
      const wasChecked = checkbox.checked;
      console.log('[EchoInsight] 当前状态:', wasChecked ? '已选中' : '未选中');
      
      // 如果要选中，先检查是否超过限制
      if (!wasChecked) {
        const selectedCount = $all('.concern-option input[type="checkbox"]:checked').length;
        console.log('[EchoInsight] 当前已选择数量:', selectedCount);
        if (selectedCount >= 2) {
          console.log('[EchoInsight] 已达到最大选择数量限制');
          notify('最多只能选择2个关心的主题');
          return; // 不允许选择更多
        }
      }
      
      // 切换状态
      checkbox.checked = !wasChecked;
      console.log('[EchoInsight] 切换后状态:', checkbox.checked ? '已选中' : '未选中');
      
      // 手动触发toggle函数
      toggle();
    });
  });
}

// 重置心情页面状态
function resetMoodRecordingState() {
  selectedMood = null;
  selectedEnergy = null;
  selectedConcerns = [];
  
  // 清除所有选中状态
  $all(".mood-option").forEach((btn) => btn.classList.remove("selected"));
  $all(".energy-option").forEach((btn) => btn.classList.remove("selected"));
  $all('.concern-option').forEach((wrapper) => {
    wrapper.classList.remove('selected');
    const checkbox = wrapper.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.checked = false;
  });
}

// 清理所有用户相关的前端状态
function clearUserState() {
  // 清理心情记录状态
  resetMoodRecordingState();
  
  // 清理当前卡牌状态
  currentCard = null;
  lastDrawnCardId = null;
  
  // 重置卡牌显示
  const drawnCard = document.getElementById('drawnCard');
  const cardPlaceholder = document.getElementById('cardPlaceholder');
  const preDrawActions = document.getElementById('preDrawActions');
  const recordNow = document.getElementById('recordNow');
  
  if (drawnCard) {
    drawnCard.style.display = 'none';
    drawnCard.classList.remove('flipped');
  }
  if (cardPlaceholder) cardPlaceholder.style.display = 'block';
  if (preDrawActions) preDrawActions.style.display = 'block';
  if (recordNow) recordNow.style.display = 'none';
  
  // 清理记录区域
  const reflectionSection = document.getElementById('reflectionSection');
  if (reflectionSection) reflectionSection.style.display = 'none';
  
  // 清理用户响应输入
  const userResponse = document.getElementById('userResponse');
  if (userResponse) userResponse.value = '';
  
  // 清理心情选择
  $all('.mood-chip').forEach(chip => chip.classList.remove('selected'));
}

function skipMoodRecording() {
  notify("已跳过心情记录");
  // 进入欢迎页面，然后自动跳转
  showWelcomeAndRedirect();
}

// 显示欢迎页面并5秒后自动跳转
function showWelcomeAndRedirect() {
  showPage('welcome');
  
  // 动态更新进度点
  let currentDot = 3; // 已经有3个active
  const interval = setInterval(() => {
    if (currentDot < 5) {
      currentDot++;
      const dot = document.querySelector(`.dot:nth-child(${currentDot})`);
      if (dot) dot.classList.add('active');
    }
  }, 1000);
  
  // 5秒后跳转到主页并开始抽卡
  setTimeout(() => {
    clearInterval(interval);
    enterMainAppAndStartDraw();
  }, 5000);
}

// 进入主页并开始抽卡
async function enterMainAppAndStartDraw() {
  showPage('main-app');
  
  // 填充顶部用户信息（若存在）
  try {
    const user = JSON.parse(localStorage.getItem('ei_user') || '{}');
    if (user) {
      $("#userName").textContent = user.username || "";
      $("#welcomeName").textContent = user.username || "探索者";
      $("#userMbti").textContent = user.mbti_type ? user.mbti_type : "未设定";
    }
  } catch (_) {}
  
  // 加载翻卡次数信息
  await loadDailyDrawInfo();
  
  // 立即开始抽卡
  setTimeout(() => {
    startRitual();
  }, 500);
}

// 首次抽卡开始（保持向后兼容）
function startFirstDraw() {
  enterMainAppAndStartDraw();
}

async function submitMoodRecording() {
  const concerns = $all('.concern-option input[type="checkbox"]:checked').map((c) => c.value);
  if (!selectedMood || !selectedEnergy) {
    notify("请先选择情绪和能量，或点击跳过");
    return;
  }
  try {
    await api("/api/mood", {
      method: "POST",
      body: JSON.stringify({ overall_mood: selectedMood, energy_level: selectedEnergy, concerns }),
    });
    notify("已记录今日心情");
    // 进入欢迎页面，然后自动跳转
    showWelcomeAndRedirect();
  } catch (err) {
    notify("记录失败，请稍后再试");
  }
}

// ============== 主应用（抽卡、回答、历史、进度） ==============
let currentCard = null;
let noteMood = '';
let lastDrawnCardId = null; // 避免连续抽到同一张卡

function initMainApp() {
  // 仅绑定事件；数据在 enterApp 时加载
}

async function enterApp() {
  // 页面刷新或直接访问时的路由逻辑
  try {
    const user = JSON.parse(localStorage.getItem("ei_user") || "{}");
    if (!user || !user.id) {
      showPage("auth");
      return;
    }

    // 直接进入主应用（不再强制MBTI设置）
    $("#userName").textContent = user.username || "";
    $("#welcomeName").textContent = user.username || "探索者";
    $("#userMbti").textContent = user.mbti_type || "未设定";
    showPage("main-app");
    
    // 加载翻卡次数信息
    loadDailyDrawInfo();
  } catch (_) {
    showPage("auth");
  }
}

async function loadProgress() {
  try {
    const data = await api("/api/user/progress");
    $("#userLevel").textContent = data?.level ?? 1;
    $("#userXP").textContent = data?.experience_points ?? 0;
    $("#consecutiveDays").textContent = data?.consecutive_days ?? 0;
  } catch (_) {
    // 忽略
  }
}

function formatToMMDD(dateStr) {
  try {
    const d = new Date(dateStr);
    // 直接使用本地时间，不需要手动转换时区
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${m}-${da}`;
  } catch (_) {
    return '';
  }
}

function formatToHHmm(dateStr) {
  try {
    const d = new Date(dateStr);
    // 直接使用本地时间，不需要手动转换时区
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${mi}`;
  } catch (_) {
    return '';
  }
}

function groupHistoryByYearAndDay(list) {
  const grouped = {};
  for (const item of list) {
    const d = new Date(item.drawn_at);
    const year = d.getFullYear();
    const dayKey = formatToMMDD(item.drawn_at);
    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][dayKey]) grouped[year][dayKey] = [];
    grouped[year][dayKey].push(item);
  }
  // 排序：年份降序，日期降序
  const years = Object.keys(grouped).map(Number).sort((a, b) => b - a);
  const result = [];
  for (const y of years) {
    const days = Object.keys(grouped[y]).sort((a, b) => {
      // 比较 MM-DD
      return b.localeCompare(a);
    });
    result.push({ year: y, days: days.map(d => ({ day: d, items: grouped[y][d] })) });
  }
  return result;
}

function getDayCollapseState() {
  try {
    const raw = localStorage.getItem('ei_history_day_collapse') || '{}';
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function setDayCollapseState(map) {
  try {
    localStorage.setItem('ei_history_day_collapse', JSON.stringify(map));
  } catch (_) {}
}

function renderHistoryTimeline(list) {
  const container = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('history-timeline');

    if (!list || list.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

  const grouped = groupHistoryByYearAndDay(list);
  const dayCollapseState = getDayCollapseState();

  for (const yearBlock of grouped) {
    const yearWrap = document.createElement('div');
    yearWrap.className = 'timeline-year';

    // 简化年份标题，不显示展开/收起按钮
    const yearHeader = document.createElement('div');
    yearHeader.className = 'year-header';
    const totalCount = yearBlock.days.reduce((acc, d) => acc + d.items.length, 0);
    yearHeader.innerHTML = `
      <span class="year-title">${yearBlock.year}</span>
      <span class="year-count">${totalCount} 条</span>
    `;
    yearWrap.appendChild(yearHeader);

    const yearBody = document.createElement('div');
    yearBody.className = 'year-body';

    for (const dayBlock of yearBlock.days) {
      const dayGroup = document.createElement('div');
      dayGroup.className = 'day-group';
      
      // 日期节点现在在左侧时间线上，可点击展开/收起
      const dayNode = document.createElement('div');
      dayNode.className = 'day-node';
      dayNode.innerHTML = `
        <button class="day-toggle" aria-expanded="true">
          <span class="day-dot"></span>
        </button>
        <span class="day-label">${dayBlock.day}</span>
      `;
      dayGroup.appendChild(dayNode);

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'day-items';

      for (const item of dayBlock.items) {
        console.log('[EchoInsight] 渲染历史记录项:', { item, itemId: item.id, itemIdType: typeof item.id });
        const div = document.createElement('div');
        div.className = 'history-item';
        div.setAttribute('data-draw-id', item.id);
        div.style.width = '100%';
        div.style.maxWidth = '100%';
        div.style.boxSizing = 'border-box';
        div.style.overflowWrap = 'break-word';
        div.style.wordWrap = 'break-word';
        div.style.position = 'relative';
        div.style.overflow = 'hidden';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'history-content';
        const timeHHmm = formatToHHmm(item.drawn_at);
        contentDiv.innerHTML = `
          <div class="item-header">
            <h4 class="item-title">${item.title}</h4>
            ${item.category ? `<span class="card-type-badge">${item.category}</span>` : ''}
            <span class="meta-time">${timeHHmm}</span>
          </div>
          <p class="item-content">${item.content}</p>
          ${item.user_response ? `<div class="user-response"><strong>我的回答：</strong>${escapeHtml(item.user_response)}</div>` : ''}
        `;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.setAttribute('data-draw-id', item.id);
        deleteBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[EchoInsight] 删除按钮点击:', { itemId: item.id, itemIdType: typeof item.id, item: item });
          showDeleteModal(item.id, div);
        };

        div.appendChild(contentDiv);
        div.appendChild(deleteBtn);

        if (isMobileDevice()) {
          div.addEventListener('touchstart', (e) => handleTouchStart(e, div), { passive: true });
          div.addEventListener('touchmove', (e) => handleTouchMove(e, div), { passive: true });
          div.addEventListener('touchend', (e) => handleTouchEnd(e, div), { passive: true });
          div.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-btn') && div.classList.contains('swipe-open')) {
              div.style.transform = 'translateX(0)';
              div.classList.remove('swipe-open');
            }
          });
        } else {
          div.classList.add('desktop-hover');
        }

        itemsWrap.appendChild(div);
      }

      dayGroup.appendChild(itemsWrap);

      // 设置日期节点的折叠状态
      const dayKey = `${yearBlock.year}-${dayBlock.day}`;
      const isDayCollapsed = dayCollapseState.hasOwnProperty(dayKey)
        ? dayCollapseState[dayKey]
        : false; // 默认展开

      if (isDayCollapsed) {
        dayGroup.classList.add('day-collapsed');
        dayNode.querySelector('.day-toggle').setAttribute('aria-expanded', 'false');
      }

      // 日期节点点击事件
      dayNode.addEventListener('click', () => {
        dayGroup.classList.toggle('day-collapsed');
        const expanded = !dayGroup.classList.contains('day-collapsed');
        dayNode.querySelector('.day-toggle').setAttribute('aria-expanded', String(expanded));
        const nextState = { ...getDayCollapseState(), [dayKey]: !expanded };
        setDayCollapseState(nextState);
      });

      yearBody.appendChild(dayGroup);
    }

    yearWrap.appendChild(yearBody);
    container.appendChild(yearWrap);
  }
}

async function loadHistory(cardType = null) {
  try {
    let url = "/api/user/history";
    if (cardType && cardType !== '全部') {
      url += `?card_type=${encodeURIComponent(cardType)}`;
    }
    const list = await api(url);
    const container = $("#historyList");
    if (container) {
      container.style.width = '100%';
      container.style.maxWidth = '100%';
      container.style.overflow = 'hidden';
    }
    renderHistoryTimeline(list || []);
  } catch (err) {
    console.error('[EchoInsight] 加载历史记录失败:', err);
    const container = $("#historyList");
    const empty = $("#historyEmpty");
    if (container) container.innerHTML = "";
    if (empty) empty.style.display = 'block';
  }
}

// 筛选历史记录
function filterHistory() {
  const filter = document.getElementById('cardTypeFilter');
  const selectedType = filter ? filter.value : '全部';
  console.log('[EchoInsight] 切换到分类:', selectedType);
  
  // 先重置容器样式，防止布局问题
  const container = document.getElementById('historyList');
  const historySection = document.querySelector('.history-section');
  if (container) {
    container.style.width = '100%';
    container.style.maxWidth = '100%';
  }
  if (historySection) {
    historySection.style.width = '100%';
    historySection.style.maxWidth = '100%';
  }
  
  loadHistory(selectedType);
  
  // 强制重新计算布局
  setTimeout(() => {
    forceLayoutReset();
  }, 100);
}

// 强制布局重置函数
function forceLayoutReset() {
  const elements = [
    document.querySelector('.app-container'),
    document.querySelector('.personal-center-layout'),
    document.querySelector('.history-section'),
    document.querySelector('.history-container'),
    document.getElementById('historyList')
  ];
  
  elements.forEach(el => {
    if (el) {
      el.style.width = '100%';
      el.style.maxWidth = '100%';
      el.style.overflowX = 'hidden';
      el.style.boxSizing = 'border-box';
    }
  });
  
  // 触发重排
  if (document.body) {
    document.body.offsetHeight;
  }
}

// 删除历史记录
async function deleteHistoryItem(drawId, itemElement) {
  try {
    console.log('[EchoInsight] 开始删除记录:', { drawId, drawIdType: typeof drawId });
    console.log('[EchoInsight] 删除API URL:', `/api/user/history/${drawId}`);
    
    // 直接尝试删除，让后端的认证中间件处理认证问题
    const result = await api(`/api/user/history/${drawId}`, {
      method: 'DELETE'
    });
    
    console.log('[EchoInsight] 删除API响应:', result);
    
    if (!result || !result.success) {
      console.error('[EchoInsight] API返回失败:', result);
      throw new Error(result?.error || result?.message || '删除失败');
    }
    
    // 从DOM中移除元素，带动画效果
    itemElement.style.transition = 'opacity 0.3s, transform 0.3s';
    itemElement.style.opacity = '0';
    itemElement.style.transform = 'translateX(-100%)';
    
    setTimeout(() => {
      itemElement.remove();
      // 检查是否还有记录，如果没有则显示空状态
      const container = document.getElementById('historyList');
      const empty = document.getElementById('historyEmpty');
      if (container && empty) {
        // 检查是否还有任何历史记录项
        const historyItems = container.querySelectorAll('.history-item');
        if (historyItems.length === 0) {
          empty.style.display = 'block';
        }
      }
    }, 300);
    
    notify('记录已删除');
    
  } catch (error) {
    console.error('[EchoInsight] 删除历史记录失败:', error);
    
    // 如果是认证错误，跳转到登录页面
    if (error.message && (error.message.includes('无效的访问令牌') || error.message.includes('认证') || error.message.includes('401'))) {
      notify('认证已过期，请重新登录');
      showPage('auth');
      return;
    }
    
    // 其他错误显示具体信息
    notify(`删除失败：${error.message || '请重试'}`);
  }
}

// 检测设备类型
function isMobileDevice() {
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

// 移动端滑动删除相关变量
let swipeStartX = 0;
let swipeStartY = 0;
let swipeThreshold = 100; // 滑动阈值

// 处理触摸开始
function handleTouchStart(e, itemElement) {
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
  itemElement.style.transition = 'none';
}

// 处理触摸移动
function handleTouchMove(e, itemElement) {
  if (!swipeStartX) return;
  
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = swipeStartX - currentX;
  const diffY = Math.abs(swipeStartY - currentY);
  
  // 如果垂直滑动幅度过大，取消水平滑动
  if (diffY > 30) {
    return;
  }
  
  // 只处理向左滑动
  if (diffX > 0) {
    const translateX = Math.min(diffX, swipeThreshold);
    itemElement.style.transform = `translateX(-${translateX}px)`;
    
    // 如果滑动超过阈值，显示删除按钮
    if (diffX >= swipeThreshold) {
      itemElement.classList.add('swipe-open');
    } else {
      itemElement.classList.remove('swipe-open');
    }
  }
}

// 处理触摸结束
function handleTouchEnd(e, itemElement) {
  if (!swipeStartX) return;
  
  const endX = e.changedTouches[0].clientX;
  const diffX = swipeStartX - endX;
  
  itemElement.style.transition = 'transform 0.3s ease';
  
  if (diffX >= swipeThreshold) {
    // 保持删除按钮显示状态
    itemElement.style.transform = `translateX(-${swipeThreshold}px)`;
    itemElement.classList.add('swipe-open');
  } else {
    // 回弹
    itemElement.style.transform = 'translateX(0)';
    itemElement.classList.remove('swipe-open');
  }
  
  swipeStartX = 0;
  swipeStartY = 0;
}

// 关闭所有打开的滑动项
function closeAllSwipeItems() {
  const openItems = document.querySelectorAll('.history-item.swipe-open');
  openItems.forEach(item => {
    item.style.transition = 'transform 0.3s ease';
    item.style.transform = 'translateX(0)';
    item.classList.remove('swipe-open');
  });
}


// 删除确认弹窗相关变量
let pendingDeleteId = null;
let pendingDeleteElement = null;

// 显示删除确认弹窗
function showDeleteModal(drawId, itemElement) {
  console.log('[EchoInsight] showDeleteModal called with drawId:', drawId, 'itemElement:', itemElement);
  pendingDeleteId = drawId;
  pendingDeleteElement = itemElement;
  const modal = document.getElementById('deleteModal');
  modal.style.display = 'flex';
  
  // 阻止页面滚动
  document.body.style.overflow = 'hidden';
}

// 关闭删除确认弹窗
function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  modal.style.display = 'none';
  
  // 恢复页面滚动
  document.body.style.overflow = '';
  
  // 清除待删除信息
  pendingDeleteId = null;
  pendingDeleteElement = null;
}

// 确认删除
async function confirmDelete() {
  console.log('[EchoInsight] confirmDelete called with pendingDeleteId:', pendingDeleteId, 'pendingDeleteElement:', pendingDeleteElement);
  if (pendingDeleteId && pendingDeleteElement) {
    // 先保存ID和元素，再关闭弹窗
    const drawId = pendingDeleteId;
    const itemElement = pendingDeleteElement;
    closeDeleteModal();
    await deleteHistoryItem(drawId, itemElement);
  }
}

// 点击弹窗背景关闭弹窗
document.addEventListener('click', (e) => {
  if (e.target.id === 'deleteModal') {
    closeDeleteModal();
  }
});

// ESC键关闭弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDeleteModal();
  }
});

function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(str).replace(/[&<>"']/g, (m) => map[m]);
}

// 加载今日翻卡次数信息
async function loadDailyDrawInfo() {
  try {
    const drawInfo = await api("/api/user/daily-draws");
    updateDrawCountDisplay(drawInfo);
    return drawInfo;
  } catch (error) {
    console.warn('[EchoInsight] 获取翻卡次数信息失败:', error);
    return null;
  }
}

// 更新翻卡次数显示
function updateDrawCountDisplay(drawInfo) {
  const drawCountElement = document.getElementById('drawCount');
  const drawButton = document.getElementById('drawCardBtn');
  
  if (drawCountElement) {
    drawCountElement.textContent = `今日剩余：${drawInfo.remaining}/${drawInfo.max_draws}次`;
    
    // 根据剩余次数设置颜色
    if (drawInfo.remaining === 0) {
      drawCountElement.style.color = '#ff4757';
      drawCountElement.textContent = '今日次数已用完';
    } else if (drawInfo.remaining === 1) {
      drawCountElement.style.color = '#ffa502';
    } else {
      drawCountElement.style.color = '#7b61ff';
    }
  }
  
  // 禁用/启用抽卡按钮
  if (drawButton) {
    if (drawInfo.remaining === 0) {
      drawButton.disabled = true;
      drawButton.innerHTML = '<i class="fas fa-moon"></i> 明日再来';
      drawButton.style.opacity = '0.6';
      drawButton.style.cursor = 'not-allowed';
    } else {
      drawButton.disabled = false;
      drawButton.innerHTML = '<i class="fas fa-magic"></i> 抽取卡牌';
      drawButton.style.opacity = '1';
      drawButton.style.cursor = 'pointer';
    }
  }
}

async function drawCard() {
  try {
    // 先检查次数限制，避免不必要的UI更新
    const drawInfo = await api("/api/user/daily-draws");
    if (drawInfo.remaining === 0) {
      notify('今日翻卡次数已用完，明日再来探索吧！');
      updateDrawCountDisplay(drawInfo);
      return;
    }

    // 预加载卡牌容器，减少显示延迟
    const drawn = document.getElementById('drawnCard');
    if (drawn) {
      drawn.style.display = 'block';
      drawn.style.opacity = '0';
    }

    // 直接隐藏placeholder，不显示洗牌动画
    const deck = document.getElementById('shuffleDeck');
    const placeholder = document.getElementById('cardPlaceholder');
    
    // 隐藏placeholder，不显示洗牌动画
    if (placeholder) placeholder.style.display = 'none';

    // 抽取卡牌（带次数限制检查）
    let attempts = 0;
    let card;
    do {
      try {
        card = await api("/api/cards/draw", { method: "POST", body: JSON.stringify({ mood_tags: [] }) });
        attempts++;
      } catch (error) {
        if (error.message && (error.message.includes('今日翻卡次数已用完') || error.message.includes('429'))) {
          // 翻卡次数已用完 - 直接显示placeholder
          if (placeholder) placeholder.style.display = 'block';
          
          notify('今日翻卡次数已用完，明日再来探索吧！');
          
          // 更新UI状态
          const drawButton = document.getElementById('drawCardBtn');
          const drawCountElement = document.getElementById('drawCount');
          if (drawButton) {
            drawButton.disabled = true;
            drawButton.innerHTML = '<i class="fas fa-moon"></i> 明日再来';
            drawButton.style.opacity = '0.6';
            drawButton.style.cursor = 'not-allowed';
          }
          if (drawCountElement) {
            drawCountElement.textContent = '今日次数已用完';
            drawCountElement.style.color = '#ff4757';
          }
          return;
        }
        
        // 其他错误直接显示placeholder
        if (placeholder) placeholder.style.display = 'block';
        throw error;
      }
    } while (card.id === lastDrawnCardId && attempts < 3);

    // 展示卡牌
    currentCard = card;
    
    console.log('[EchoInsight] 抽卡成功，卡牌数据:', card);
    
    // 更新翻卡次数显示
    if (card.daily_draw_info) {
      console.log('[EchoInsight] 更新翻卡次数显示:', card.daily_draw_info);
      updateDrawCountDisplay(card.daily_draw_info);
    } else {
      console.warn('[EchoInsight] 卡牌响应中没有daily_draw_info，手动刷新次数');
      // 如果API响应中没有次数信息，手动刷新
      loadDailyDrawInfo();
    }
    currentCard.backContentGenerated = false; // 重置背面内容生成标记
    lastDrawnCardId = card.id;
    
    // 清除背面内容，避免重叠
    const qList = document.getElementById('backQuestions');
    const aList = document.getElementById('backActions');
    if (qList) qList.innerHTML = '';
    if (aList) aList.innerHTML = '';
    $("#cardTitle").textContent = card.title;
    $("#cardText").textContent = card.content;
    
    // 立即开始生成背面内容（异步，不阻塞UI）
    generateCardBackContent();
    
    // 渲染关键词胶囊
    const keywordsContainer = document.getElementById('cardKeywords');
    if (keywordsContainer && card.mood_tags) {
      keywordsContainer.innerHTML = '';
      const tags = card.mood_tags.split(',').slice(0, 3); // 最多显示3个
      tags.forEach(tag => {
        if (tag.trim()) {
          const pill = document.createElement('span');
          pill.className = 'pill';
          pill.textContent = tag.trim();
          keywordsContainer.appendChild(pill);
        }
      });
    }

    // 🎨 优化：确保完全重置后再显示新卡（丝滑切换）
    if (drawn) {
      // 移除所有旧动画类，完全重置状态
      drawn.classList.remove('flip-in', 'flipped', 'fade-out-card');
      
      // 先完全隐藏，准备渲染
      drawn.style.display = 'block';
      drawn.style.opacity = '0';
      drawn.style.transform = 'rotateY(90deg) scale(0.8)';
      
      // 使用双重 requestAnimationFrame 确保DOM完全渲染后再显示
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 重置transform，准备动画
          drawn.style.transform = '';
          
          // 立即显示卡牌，无缝衔接
          drawn.style.opacity = '1';
          drawn.classList.add('flip-in');
        });
      });
    }
    // 🎨 优化：按钮区域丝滑切换
    const recordNow = document.getElementById('recordNow');
    const preDraw = document.getElementById('preDrawActions');
    if (preDraw) {
      preDraw.style.opacity = '0';
      setTimeout(() => {
        preDraw.style.display = 'none';
      }, 300);
    }
    if (recordNow) {
      recordNow.style.display = 'block';
      recordNow.classList.add('show');
      // 触发淡入动画
      requestAnimationFrame(() => {
        recordNow.style.opacity = '1';
      });
    }
  } catch (err) {
    notify(err.message || "抽卡失败");
  }
}



// 生成卡牌背面内容（抽卡时调用）
async function generateCardBackContent() {
  if (!currentCard || currentCard.backContentGenerated) return;
  
  console.log('[EchoInsight] 开始预生成背面内容');
  currentCard.backContentGenerated = true; // 防止重复调用
  
  // 先设置默认内容，确保有内容显示
  currentCard.backQuestions = ['这张卡牌想告诉你什么？', '你愿意为它做点什么？'];
  currentCard.backActions = ['在桌面摆放3个小物件代表这个主题，拍照记录（2分钟）。', '用一句话描述这个主题此刻给你的感受。'];
  
  try {
    const mood = selectedMood || '';
    console.log(`[EchoInsight] 调用API生成背面内容: cardId=${currentCard.id}, mood=${mood}`);
    
    const gen = await api(`/api/cards/${currentCard.id}/generate-back`, {
      method: 'POST',
      body: JSON.stringify({ mood, historyBrief: '' })
    });
    
    console.log('[EchoInsight] API返回结果:', gen);
    
    // 如果API成功返回，更新内容
    if (gen && gen.questions && gen.questions.length > 0) {
      currentCard.backQuestions = gen.questions;
    }
    if (gen && gen.actions && gen.actions.length > 0) {
      currentCard.backActions = gen.actions;
    }
    
    console.log('[EchoInsight] 背面内容预生成完成:', {
      questions: currentCard.backQuestions,
      actions: currentCard.backActions
    });
  } catch (e) {
    console.warn('[EchoInsight] 背面内容生成失败，使用默认内容:', e);
    // 默认内容已经在上面设置了
  }
}

// 计算A类行动建议的概率（动态调整，限制在40-60%区间）
function computeAProbability() {
  let pA = 0.5; // 基础概率50%
  
  try {
    // 获取用户进度数据
    const streakDays = parseInt($("#consecutiveDays")?.textContent) || 0;
    
    // 获取当前时间信息
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0=周日, 6=周六
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // 获取当前心情/能量（如果有选择）
    const selectedMoodChip = document.querySelector('.mood-chip.active');
    const mood = selectedMoodChip?.dataset?.noteMood || selectedMood || '';
    const isLowEnergy = ['疲惫', '焦虑', '低落'].includes(mood);
    
    // 策略1: 新手激活期（前3天）增加A类（简单易行动）
    if (streakDays <= 3) {
      pA += 0.1;
    }
    
    // 策略2: 低能量状态增加A类（微行动更容易完成）
    if (isLowEnergy) {
      pA += 0.15;
    }
    
    // 策略3: 晚间或周末增加B类（有时间反思）
    if (timeOfDay === 'evening' || isWeekend) {
      pA -= 0.1;
    }
    
    // 策略4: 连续打卡>3天，增加B类（引导深度探索）
    if (streakDays > 3) {
      pA -= 0.1;
    }
    
    // 全局限制：确保概率在40-60%区间
    pA = Math.min(0.6, Math.max(0.4, pA));
    
    console.log(`[EchoInsight] 计算A类概率: ${(pA * 100).toFixed(1)}% (连续${streakDays}天, ${timeOfDay}, 心情:${mood})`);
    
    return pA;
  } catch (e) {
    console.warn('[EchoInsight] 概率计算失败，使用默认50%:', e);
    return 0.5;
  }
}

// 翻卡逻辑（简化版，内容已预生成）
async function flipCard() {
  if (!currentCard) return;
  
  const cardEl = document.getElementById('drawnCard');
  
  // 如果已经是反面，翻回正面
  if (cardEl && cardEl.classList.contains('flipped')) {
    cardEl.classList.remove('flipped');
    return;
  }
  
  // 翻到反面，填充预生成的内容
    const qList = document.getElementById('backQuestions');
    const aList = document.getElementById('backActions');
  
  console.log('[EchoInsight] 填充背面内容:', {
    qList: !!qList,
    aList: !!aList,
    questions: currentCard.backQuestions,
    actions: currentCard.backActions
  });
  
  if (qList) {
    qList.innerHTML = '';
    const questions = currentCard.backQuestions || ['这张卡牌想告诉你什么？', '你愿意为它做点什么？'];
    questions.forEach(t => {
        const li = document.createElement('li'); 
        li.textContent = t; 
      qList.appendChild(li);
    });
    console.log(`[EchoInsight] 已添加 ${questions.length} 个问题`);
  }
  
  if (aList) {
    aList.innerHTML = '';
    const allActions = currentCard.backActions || [
      '在桌面摆放3个小物件代表这个主题，拍照记录（2分钟）。',
      '用一句话描述这个主题此刻给你的感受。'
    ];

    // 同一张卡翻来覆去时保持一致：第一次随机选，后续复用
    let chosenIndex =
      typeof currentCard._chosenActionIndex === 'number'
        ? currentCard._chosenActionIndex
        : null;

    if (chosenIndex === null) {
      if (allActions.length >= 2) {
        // 使用动态概率计算A/B选择
        const pA = computeAProbability();
        chosenIndex = Math.random() < pA ? 0 : 1; // 基于动态概率选择
      } else {
        chosenIndex = 0;
      }
      currentCard._chosenActionIndex = chosenIndex;
      
      // 埋点：记录行动建议选择（包含概率值）
      const actionType = chosenIndex === 0 ? 'A' : 'B';
      const pA = computeAProbability();
      console.log(`[EchoInsight] 已添加 1 个行动建议（索引: ${chosenIndex}, 类型: ${actionType}, 概率A:${(pA*100).toFixed(1)}%）`);
      trackEvent('action_selected', {
        cardId: currentCard.id,
        actionType: actionType,
        actionIndex: chosenIndex,
        cardTitle: currentCard.title,
        probabilityA: (pA * 100).toFixed(1) // 记录当时的概率
      });
    }

    const chosen = allActions[chosenIndex] ? [allActions[chosenIndex]] : [];

    chosen.forEach(t => {
      const li = document.createElement('li');
      const text = String(t).trim();

      // 移除 A./B. 前缀，直接显示内容
      const cleanText = text.replace(/^[AB]\.\s*/, '');
      li.textContent = cleanText;
      aList.appendChild(li);
    });
  }
  
  // 翻到反面
  if (cardEl) cardEl.classList.add('flipped');
}

function startRecord() {
  // 显示记录面板
  showRecordPanel();
}

function showRecordPanel() {
  // 显示记录面板
  const reflection = document.getElementById('reflectionSection');
  const recordNow = document.getElementById('recordNow');
  if (recordNow) recordNow.style.display = 'none';
  if (reflection) reflection.style.display = 'block';

  // 绑定心情选择
  $all('.mood-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      $all('.mood-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      noteMood = btn.dataset.noteMood || '';
    });
  });
}


async function submitResponse() {
  const text = $("#userResponse").value.trim();
  if (!currentCard || !currentCard.id) {
    notify("请先抽卡");
    return;
  }
  
  if (!text) {
    notify("请输入回答内容");
    return;
  }
  
  // 获取提交按钮并添加加载状态
  const submitBtn = document.querySelector('#reflectionSection .btn-primary');
  const originalText = submitBtn?.innerHTML || '保存回答';
  
  try {
    // 禁用按钮，显示加载状态
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
      submitBtn.style.opacity = '0.6';
    }
    
    console.log(`[EchoInsight] 提交回答: cardId=${currentCard.id}, textLength=${text.length}`);
    
    // 提交回答
    const apiEndpoint = `/api/cards/${currentCard.id}/response`;
    
    const result = await api(apiEndpoint, {
      method: "POST",
      body: JSON.stringify({ response: text }),
    });
    
    // 固定提示，避免在部分设备/字体下出现符号编码异常
    if (result && typeof result.xp_gained === 'number' && result.xp_gained > 0) {
      notify(`回答已保存，获得 ${result.xp_gained} 经验值`);
    } else {
      notify('回答已保存');
    }
    
    $("#userResponse").value = "";
    await loadHistory();
    
    // 埋点：微行动确认（如果回答长度>20字）
    if (text.length > 20) {
      await trackEvent('action_confirm', { cardId: currentCard.id, responseLength: text.length });
    }
    
    // 刷新起始包进度（静默失败）
    try {
      await refreshStarterProgress();
    } catch (err) {
      console.warn('[EchoInsight] Progress refresh failed:', err);
    }
    
    // 返回抽卡页面：隐藏记录区域，显示抽卡后按钮区
    const reflection = document.getElementById('reflectionSection');
    const recordNow = document.getElementById('recordNow');
    if (reflection) reflection.style.display = 'none';
    if (recordNow) recordNow.style.display = 'block';
    
  } catch (err) {
    console.error('[EchoInsight] 保存回答失败:', err);
    notify(err.message || "保存失败，请重试");
  } finally {
    // 恢复按钮状态
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      submitBtn.style.opacity = '1';
    }
  }
}


function cancelRecord() {
  // 返回抽卡页面：隐藏记录区域，显示抽卡后按钮区
  const reflection = document.getElementById('reflectionSection');
  const recordNow = document.getElementById('recordNow');
  if (reflection) reflection.style.display = 'none';
  if (recordNow) recordNow.style.display = 'block';
}

// 跳过MBTI设置，直接进入主应用（仅限老用户）
function skipMbtiAndEnterApp() {
  showPage('main-app');
  loadDailyDrawInfo();
  notify('已跳过MBTI设置，可随时在个人中心补充');
}

// 显示MBTI页面，并根据用户类型决定是否显示跳过按钮
function showMbtiSelectionPage(isNewUser = false) {
  showPage('mbti-selection');
  const skipSection = document.getElementById('mbtiSkipSection');
  if (skipSection) {
    // 只有老用户才能看到跳过按钮
    skipSection.style.display = isNewUser ? 'none' : 'block';
  }
}

// 从个人中心进入MBTI设置（老用户，显示跳过按钮）
function goToMbtiSetting() {
  showMbtiSelectionPage(false); // false 表示老用户，可以跳过
}

// 暴露到全局（供 HTML on* 使用）
window.logout = logout;
window.showMbtiOptions = showMbtiOptions;
window.drawCard = drawCard;
window.submitResponse = submitResponse;
window.cancelRecord = cancelRecord;
window.submitMoodRecording = submitMoodRecording;
window.skipMoodRecording = skipMoodRecording;
window.startFirstDraw = startFirstDraw;
window.startRecord = startRecord;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
window.skipMbtiAndEnterApp = skipMbtiAndEnterApp;
window.showMbtiSelectionPage = showMbtiSelectionPage;
window.goToMbtiSetting = goToMbtiSetting;
window.openPersonalCenter = async function() {
  showPage('personal-center');
  await loadProgress();
  await loadHistory();
  
  // 更新MBTI显示
  try {
    const user = JSON.parse(localStorage.getItem('ei_user') || '{}');
    const mbtiElement = document.getElementById('userMbti');
    const setMbtiBtn = document.getElementById('setMbtiBtn');
    
    if (mbtiElement) {
      mbtiElement.textContent = user.mbti_type || "未设定";
    }
    
    // 如果没有MBTI类型，显示设置按钮
    if (setMbtiBtn) {
      setMbtiBtn.style.display = user.mbti_type ? 'none' : 'block';
    }
  } catch (err) {
    console.warn('[EchoInsight] MBTI display update failed:', err);
  }
};

// 显示主应用页面时加载翻卡次数信息
function showMainApp() {
  showPage('main-app');
  loadDailyDrawInfo();
}
window.flipCard = flipCard;

// 仪式感抽卡（优化版：动画期间并行请求API）
window.startRitual = async function() {
  // 先检查次数限制，避免不必要的动画
  try {
    const drawInfo = await api("/api/user/daily-draws");
    if (drawInfo.remaining === 0) {
      notify('今日翻卡次数已用完，明日再来探索吧！');
      updateDrawCountDisplay(drawInfo);
      return;
    }
  } catch (error) {
    console.error('检查次数限制失败:', error);
    // 如果检查失败，继续执行抽卡逻辑
  }

  const overlay = document.getElementById('ritualOverlay');
  const drawButton = document.getElementById('drawCardBtn');
  const drawnCard = document.getElementById('drawnCard');
  
  // 🎨 优化1：如果已有卡牌，先淡出旧卡（丝滑过渡）
  if (drawnCard && drawnCard.style.display === 'block' && drawnCard.style.opacity !== '0') {
    drawnCard.classList.add('fade-out-card');
    // 等待淡出动画完成（300ms）
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // 禁用按钮，防止重复点击
  if (drawButton) {
    drawButton.disabled = true;
    drawButton.style.opacity = '0.6';
    drawButton.style.cursor = 'not-allowed';
  }
  
  if (!overlay) {
    // 如果没有overlay，直接抽卡
    await drawCard();
    // 重新启用按钮
    if (drawButton) {
      drawButton.disabled = false;
      drawButton.style.opacity = '1';
      drawButton.style.cursor = 'pointer';
    }
    return;
  }
  
  overlay.style.display = 'flex';
  try { document.getElementById('ritualAudio')?.play().catch(()=>{}); } catch(_) {}
  
  // 🚀 关键优化：在动画播放的同时开始API请求和UI预渲染
  const cardPromise = drawCard();
  
  // 延长动画时长到1800ms，增强仪式感，同时给API充足时间
  setTimeout(async () => {
    // 等待抽卡完成（确保数据已准备好）
    await cardPromise.then(() => {
      // 数据准备完成后，立即隐藏动画并显示卡牌（无缝衔接）
      overlay.style.display = 'none';
      
      // 重新启用按钮（如果还有次数）
      if (drawButton && !drawButton.innerHTML.includes('明日再来')) {
        drawButton.disabled = false;
        drawButton.style.opacity = '1';
        drawButton.style.cursor = 'pointer';
      }
    }).catch(err => {
      console.error('抽卡失败:', err);
      overlay.style.display = 'none';
      
      // 失败时也要恢复按钮状态
      if (drawButton && !drawButton.innerHTML.includes('明日再来')) {
        drawButton.disabled = false;
        drawButton.style.opacity = '1';
        drawButton.style.cursor = 'pointer';
      }
    });
  }, 1800); // 延长到1800ms，增强仪式感，API在此期间并行完成
}



