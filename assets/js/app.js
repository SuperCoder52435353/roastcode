// ================================================================
//  RoastCode — app.js
//  Asosiy ilova mantiq: Monaco, AI call, mode, chat, modal
//  Talab: Supabase v2 CDN, marked v9 CDN, DOMPurify CDN, config.js
// ================================================================
'use strict';

// ── Globals ──────────────────────────────────────────────────
let _sb;
let _user          = null;
let _profile       = null;
let _editor        = null;
let _currentMode   = 'roast';
let _isStreaming    = false;
let _accResponse   = '';
let _chatOpen      = false;
let _chatSub       = null;
let _unreadCount   = 0;
let _userMenuOpen  = false;

// ── Mode konfiguratsiya ───────────────────────────────────────
const MODE_CFG = {
  roast: {
    icon:        '\uD83D\uDD25',
    btnLabel:    'Roast qil!',
    resultText:  'Roast natijasi',
    placeholder: '// Kodingizni shu yerga joylashtiring\n// AI uni kulgili tanqid qiladi va xatolarni korsatadi',
  },
  fix: {
    icon:        '\uD83D\uDD27',
    btnLabel:    'Xatolarni tuzat!',
    resultText:  'Fix natijasi',
    placeholder: '// Kodingizni shu yerga joylashtiring\n// AI xatolarni topib, patch taqdim etadi',
  },
  chat: {
    icon:        '\uD83D\uDCAC',
    btnLabel:    'Yuborish',
    resultText:  'Chat javobi',
    placeholder: '// Kod (ixtiyoriy)\n// Savolni quyidagi inputdan kiriting',
  },
};


// ================================================================
//  DOMContentLoaded
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});


// ================================================================
//  INIT
// ================================================================
async function initApp() {
  // Supabase init
  _sb = supabase.createClient(RC_CONFIG.supabase.url, RC_CONFIG.supabase.anonKey);

  // Auth tekshirish
  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session?.user) {
      window.location.href = RC_CONFIG.app.pages.login;
      return;
    }
    _user = session.user;
  } catch (_e) {
    window.location.href = RC_CONFIG.app.pages.login;
    return;
  }

  // Profile yuklash
  await _loadProfile();

  // Monaco Editor ishga tushirish
  _initMonaco();

  // Default mode
  setMode('roast');

  // Token bar
  updateTokenBar();

  // Chat tarixi + realtime
  await loadChatHistory();
  subscribeChat();

  // Auth state kuzatuv
  _sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      window.location.href = RC_CONFIG.app.pages.login;
    }
  });

  // Tashqarida click → menyuni yopish
  document.addEventListener('click', _onOutsideClick);

  // Chat input: Enter tugmasi
  document.getElementById('chat-msg-input')
    ?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

  // URL param: pricing dan qaytganda chat ochish
  const params = new URLSearchParams(window.location.search);
  if (params.get('chat') === 'open') {
    setTimeout(() => toggleChat(), 450);
  }
}


// ================================================================
//  PROFILE
// ================================================================
async function _loadProfile() {
  try {
    const { data, error } = await _sb
      .from('profiles')
      .select('id, username, full_name, email, tier, daily_requests, is_banned')
      .eq('id', _user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('[app] Profile load:', error.message);
    }

    _profile = data ?? {
      id:             _user.id,
      username:       (_user.email || '').split('@')[0] || 'user',
      email:          _user.email || '',
      tier:           'free',
      daily_requests: 0,
      is_banned:      false,
    };

  } catch (e) {
    console.warn('[app] Profile fetch:', e.message);
    _profile = {
      id:             _user.id,
      username:       (_user.email || '').split('@')[0] || 'user',
      email:          _user.email || '',
      tier:           'free',
      daily_requests: 0,
      is_banned:      false,
    };
  }

  _renderProfileUI();
  updateTokenBar();
}

function _renderProfileUI() {
  if (!_profile) return;

  const tier = _profile.tier || 'free';
  const name = _profile.username || _profile.full_name || 'user';

  // Tier badge
  const badgeEl = document.getElementById('user-tier-badge');
  if (badgeEl) {
    badgeEl.textContent = tier.toUpperCase();
    badgeEl.className   = 'tier-badge ' + tier;
  }

  // Avatar
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

  // Dropdown info
  const menuName  = document.getElementById('menu-username');
  const menuEmail = document.getElementById('menu-email');
  if (menuName)  menuName.textContent  = '@' + name;
  if (menuEmail) menuEmail.textContent = _profile.email || '';
}


// ================================================================
//  MODE
// ================================================================
function setMode(mode) {
  if (!MODE_CFG[mode]) return;
  _currentMode = mode;

  // Body attribute
  document.body.dataset.mode = mode;

  // Mode tugmalari
  document.querySelectorAll('.mode-btn').forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  // Submit tugma
  const cfg   = MODE_CFG[mode];
  const iconEl  = document.getElementById('submit-icon');
  const labelEl = document.getElementById('submit-label');
  if (iconEl)  iconEl.textContent  = cfg.icon;
  if (labelEl) labelEl.textContent = cfg.btnLabel;

  // Response tag
  document.getElementById('resp-mode-icon')?.setAttribute &&
    (document.getElementById('resp-mode-icon').textContent = cfg.icon);
  document.getElementById('resp-mode-text')?.setAttribute &&
    (document.getElementById('resp-mode-text').textContent = cfg.resultText);

  // Chat mode: savol input
  const chatRow = document.getElementById('chat-question-row');
  if (chatRow) chatRow.classList.toggle('hidden', mode !== 'chat');

  // Response tozalash
  clearResponse();
}


// ================================================================
//  MONACO EDITOR
// ================================================================
function _initMonaco() {
  require.config({
    paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }
  });

  require(['vs/editor/editor.main'], () => {

    // Custom tema
    monaco.editor.defineTheme('roast-dark', {
      base    : 'vs-dark',
      inherit : true,
      rules   : [
        { token: 'comment',        foreground: '4a4a6a', fontStyle: 'italic' },
        { token: 'string',         foreground: '34d399' },
        { token: 'number',         foreground: 'ff8c5a' },
        { token: 'keyword',        foreground: '7aaeff', fontStyle: 'bold' },
        { token: 'type.identifier',foreground: 'a78bfa' },
        { token: 'delimiter',      foreground: '7878a0' },
      ],
      colors: {
        'editor.background'                  : '#0a0a0f',
        'editor.foreground'                  : '#e8e8f0',
        'editorLineNumber.foreground'        : '#4a4a6a',
        'editorLineNumber.activeForeground'  : '#7878a0',
        'editor.lineHighlightBackground'     : '#16162a',
        'editor.selectionBackground'         : '#2a2a4a',
        'editor.inactiveSelectionBackground' : '#1e1e35',
        'editorCursor.foreground'            : '#ff6b35',
        'editorBracketMatch.background'      : '#2a2a4a',
        'editorBracketMatch.border'          : '#ff6b35',
        'scrollbar.shadow'                   : '#00000000',
        'scrollbarSlider.background'         : '#2a2a4a80',
        'scrollbarSlider.hoverBackground'    : '#383860aa',
      },
    });

    _editor = monaco.editor.create(
      document.getElementById('monaco-editor'),
      {
        value              : '',
        language           : 'javascript',
        theme              : 'roast-dark',
        fontSize           : 13,
        fontFamily         : "'JetBrains Mono', 'Cascadia Code', monospace",
        fontLigatures      : true,
        minimap            : { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers        : 'on',
        wordWrap           : 'on',
        automaticLayout    : true,
        padding            : { top: 14, bottom: 14 },
        renderLineHighlight: 'gutter',
        cursorBlinking     : 'smooth',
        smoothScrolling    : true,
        quickSuggestions   : false,
        scrollbar: {
          verticalScrollbarSize  : 6,
          horizontalScrollbarSize: 6,
          useShadows             : false,
        },
        overviewRulerLanes : 0,
      }
    );

    // Qator soni yangilash
    _editor.onDidChangeModelContent(() => {
      _updateLineCounter();
      _checkLineLimit();
    });

    // Ctrl/Cmd + Enter → submit
    _editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => submitCode()
    );

    // Placeholder placeholder (boshlang'ich hint)
    _editor.setValue(MODE_CFG[_currentMode].placeholder);
    _editor.setSelection(new monaco.Selection(1, 1, 1, 1));
  });
}

function _updateLineCounter() {
  const count = _editor?.getModel()?.getLineCount() ?? 0;
  const el = document.getElementById('line-counter');
  if (el) el.textContent = count + ' qator';
}

function _checkLineLimit() {
  if (!_editor || !_profile) return;

  const tier     = _profile.tier || 'free';
  const maxLines = RC_CONFIG.truncation[tier];
  const count    = _editor.getModel()?.getLineCount() ?? 0;
  const bar      = document.getElementById('limit-bar');
  const txt      = document.getElementById('limit-bar-text');

  if (!bar || !txt) return;

  if (isFinite(maxLines) && count > maxLines) {
    bar.classList.remove('hidden');
    txt.textContent = count + ' qator | Limit: ' + maxLines + " — ortiqcha qatorlar qisqartiriladi";
  } else {
    bar.classList.add('hidden');
  }
}

function onLangChange(lang) {
  if (!_editor) return;
  const model = _editor.getModel();
  if (model) monaco.editor.setModelLanguage(model, lang);
}

async function pasteCode() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) { showToast("Clipboard bosh", 'warning', '\u26A0\uFE0F'); return; }
    if (_editor) {
      _editor.setValue(text);
      _editor.focus();
      _editor.setPosition({ lineNumber: 1, column: 1 });
      showToast("Clipboard dan qoyildi", 'success', '\uD83D\uDCCB');
    }
  } catch (_e) {
    showToast("Clipboard ruxsati kerak", 'warning', '\uD83D\uDD12');
  }
}

function clearEditor() {
  if (_editor) {
    _editor.setValue('');
    _editor.focus();
  }
}


// ================================================================
//  SUBMIT
// ================================================================
async function submitCode() {
  if (_isStreaming) return;

  const code     = (_editor?.getValue() || '').trim();
  const question = (document.getElementById('chat-question')?.value || '').trim();
  const mode     = _currentMode;

  // Validatsiya
  if (mode !== 'chat' && !code) {
    showToast('Avval kod kiriting', 'warning', '\u26A0\uFE0F');
    return;
  }
  if (mode === 'chat' && !code && !question) {
    showToast('Savol yoki kod kiriting', 'warning', '\u26A0\uFE0F');
    return;
  }

  // Limit
  const canProceed = await checkLimit();
  if (!canProceed) return;

  // Kod qisqartirish
  const tier     = _profile?.tier || 'free';
  const maxLines = RC_CONFIG.truncation[tier];
  const safeCode = isFinite(maxLines) ? truncateCode(code, maxLines) : code;

  // UI: loading
  _isStreaming = true;
  _setSubmitLoading(true);
  _setStreamingBadge(true);
  clearResponse();

  try {
    const result = await callAI(mode, safeCode, question);

    if (result) {
      _accResponse = result;
      renderResponse(result, false);
      await _loadProfile(); // token bar yangilash
    }

  } catch (err) {
    _handleAIError(err);
  } finally {
    _isStreaming = false;
    _setSubmitLoading(false);
    _setStreamingBadge(false);
  }
}

function _setSubmitLoading(on) {
  const btn    = document.getElementById('submit-btn');
  const spinner = btn?.querySelector('.submit-spinner');
  const icon   = document.getElementById('submit-icon');
  const label  = document.getElementById('submit-label');
  const short  = btn?.querySelector('.submit-shortcut');
  if (!btn) return;

  btn.classList.toggle('loading', on);
  btn.disabled = on;
  if (spinner) spinner.classList.toggle('hidden', !on);
  if (icon)    icon.style.opacity  = on ? '0' : '';
  if (label)   label.style.opacity = on ? '0' : '';
  if (short)   short.style.opacity = on ? '0' : '';
}

function _setStreamingBadge(on) {
  document.getElementById('streaming-badge')?.classList.toggle('hidden', !on);
}


// ================================================================
//  AI CALL + STREAM
// ================================================================
async function callAI(mode, code, question) {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) {
    window.location.href = RC_CONFIG.app.pages.login;
    return null;
  }

  const resp = await fetch(RC_CONFIG.functions.aiRouter, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ mode, code, question }),
  });

  if (!resp.ok) {
    let errData = {};
    try { errData = await resp.json(); } catch {}
    throw { status: resp.status, message: errData.error || errData.message || resp.statusText, ...errData };
  }

  const ct = resp.headers.get('content-type') || '';

  // SSE stream
  if (ct.includes('text/event-stream') || ct.includes('text/plain')) {
    return await _readStream(resp);
  }

  // Oddiy JSON
  const data = await resp.json();
  return data.response || data.text || data.answer || '';
}

async function _readStream(resp) {
  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let full   = '';
  let buffer = '';

  _showResponseArea();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') { buffer = ''; break; }
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const chunk  = parsed.text || parsed.delta || parsed.content || '';
        full += chunk;
        renderResponse(full, true);
      } catch {
        // Plain text stream
        full += raw + '\n';
        renderResponse(full, true);
      }
    }
  }

  return full.trim();
}

function _handleAIError(err) {
  const status  = err?.status;
  const message = (err?.message || '').toLowerCase();

  if (status === 401 || message.includes('unauthorized')) {
    showToast('Sessiya tugadi. Qayta kiring', 'error', '\uD83D\uDD10');
    setTimeout(() => window.location.href = RC_CONFIG.app.pages.login, 1600);
    return;
  }

  if (status === 429 || err?.code === 'LIMIT_EXCEEDED' || message.includes('limit')) {
    showUpgradeModal();
    return;
  }

  if (status === 403 && message.includes('ban')) {
    showToast('Hisobingiz bloklangan', 'error', '\uD83D\uDEAB');
    return;
  }

  if (!navigator.onLine || message.includes('network') || message.includes('failed to fetch')) {
    showToast("Internet aloqasi yo'q", 'error', '\uD83D\uDCE1');
    return;
  }

  showToast(err?.message || 'Xato yuz berdi. Qayta urining', 'error', '\u274C');
  console.error('[app] AI error:', err);
}


// ================================================================
//  RESPONSE RENDERING
// ================================================================
function _showResponseArea() {
  document.getElementById('response-empty')?.classList.add('hidden');
  document.getElementById('response-text')?.classList.remove('hidden');
  document.getElementById('response-actions')?.removeAttribute('hidden');
}

function renderResponse(text, streaming) {
  _showResponseArea();

  const el = document.getElementById('response-text');
  if (!el) return;

  // marked + DOMPurify
  let html = '';
  try {
    const raw = marked.parse(text, { breaks: true, gfm: true });
    html = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'h1','h2','h3','h4','h5','h6',
        'p','br','strong','em','del','u',
        'code','pre',
        'ul','ol','li',
        'blockquote','hr',
        'a','span','div','table','thead','tbody','tr','th','td',
      ],
      ALLOWED_ATTR: ['href', 'target', 'class', 'data-lang', 'rel'],
    });
  } catch {
    html = '<p>' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</p>';
  }

  // Streaming cursor
  if (streaming) html += '<span class="stream-cursor" aria-hidden="true"></span>';

  el.innerHTML = html;

  // Kod bloklaiga til belgisi
  el.querySelectorAll('pre > code').forEach(code => {
    const cls  = code.className || '';
    const lang = cls.replace('language-', '') || '';
    if (lang) code.parentElement?.setAttribute('data-lang', lang);
  });

  // Pastga scroll
  const content = document.getElementById('response-content');
  if (content) content.scrollTop = content.scrollHeight;
}

function clearResponse() {
  const textEl   = document.getElementById('response-text');
  const emptyEl  = document.getElementById('response-empty');
  const actionsEl = document.getElementById('response-actions');

  if (textEl)    { textEl.innerHTML = ''; textEl.classList.add('hidden'); }
  if (emptyEl)   emptyEl.classList.remove('hidden');
  if (actionsEl) actionsEl.setAttribute('hidden', '');

  _accResponse = '';
}

async function copyResponse() {
  if (!_accResponse) return;

  try {
    await navigator.clipboard.writeText(_accResponse);
    showToast('Javob nusxalandi', 'success', '\u2705');

    const btn = document.getElementById('copy-resp-btn');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Nusxalandi</span>';
      setTimeout(() => { btn.innerHTML = orig; }, 2200);
    }
  } catch {
    showToast('Nusxalash xatosi', 'error', '\u26A0\uFE0F');
  }
}


// ================================================================
//  LIMIT + TOKEN BAR
// ================================================================
async function checkLimit() {
  if (!_profile) return true;

  const tier    = _profile.tier || 'free';
  const tierCfg = RC_CONFIG.tiers[tier];
  const used    = _profile.daily_requests || 0;
  const max     = tierCfg?.daily_requests ?? 20;

  if (isFinite(max) && used >= max) {
    showUpgradeModal();
    return false;
  }
  return true;
}

function updateTokenBar() {
  if (!_profile) return;

  const tier    = _profile.tier || 'free';
  const tierCfg = RC_CONFIG.tiers[tier];
  const used    = _profile.daily_requests || 0;
  const max     = tierCfg?.daily_requests ?? 20;

  const textEl = document.getElementById('token-text');
  const fillEl = document.getElementById('token-fill');
  const wrapEl = document.getElementById('token-bar-wrap');

  if (textEl) {
    textEl.textContent = isFinite(max) ? used + '/' + max : used + '/\u221E';
  }

  if (!isFinite(max)) {
    if (fillEl) { fillEl.style.width = '0%'; fillEl.dataset.level = 'ok'; }
    return;
  }

  const pct = Math.min(100, Math.round((used / max) * 100));
  if (fillEl) {
    fillEl.style.width    = pct + '%';
    fillEl.dataset.level  = pct < 50 ? 'ok' : pct < 80 ? 'mid' : pct < 95 ? 'high' : 'full';
  }
  if (wrapEl) wrapEl.setAttribute('aria-valuenow', String(pct));
}


// ================================================================
//  TRUNCATE CODE
// ================================================================
function truncateCode(code, maxLines) {
  if (!code || !isFinite(maxLines) || maxLines <= 0) return code || '';

  const lines = code.split('\n');
  if (lines.length <= maxLines) return code;

  const keepHead = Math.floor(maxLines * 0.6);
  const keepTail = maxLines - keepHead;
  const skipped  = lines.length - keepHead - keepTail;
  const lang     = _getLangComment();

  return [
    ...lines.slice(0, keepHead),
    '',
    lang + ' ... (' + skipped + " qator o'tkazildi — tier: " + (_profile?.tier || 'free') + ')',
    '',
    ...lines.slice(lines.length - keepTail),
  ].join('\n');
}

function _getLangComment() {
  const lang = document.getElementById('lang-select')?.value || 'javascript';
  const hashLangs = ['python', 'ruby', 'shell', 'bash', 'sql'];
  return hashLangs.includes(lang) ? '#' : '//';
}


// ================================================================
//  USER MENU
// ================================================================
function toggleUserMenu() {
  const menu   = document.getElementById('user-menu');
  const avatar = document.getElementById('user-avatar');
  if (!menu) return;

  _userMenuOpen = !_userMenuOpen;
  menu.hidden   = !_userMenuOpen;
  avatar?.setAttribute('aria-expanded', String(_userMenuOpen));
}

function _onOutsideClick(e) {
  // User menu
  if (_userMenuOpen) {
    const wrap = document.getElementById('user-dropdown-wrap');
    if (wrap && !wrap.contains(e.target)) {
      _userMenuOpen = false;
      const menu = document.getElementById('user-menu');
      if (menu) menu.hidden = true;
      document.getElementById('user-avatar')?.setAttribute('aria-expanded', 'false');
    }
  }
}

function goToPricing() {
  window.location.href = RC_CONFIG.app.pages.pricing;
}

async function signOut() {
  try {
    await _sb.auth.signOut();
  } finally {
    window.location.href = RC_CONFIG.app.pages.login;
  }
}


// ================================================================
//  UPGRADE MODAL
// ================================================================
function showUpgradeModal() {
  const overlay = document.getElementById('upgrade-modal');
  if (!overlay) return;
  overlay.removeAttribute('hidden');
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.addEventListener('keydown', _escCloseUpgrade);
}

function closeUpgradeModal() {
  const overlay = document.getElementById('upgrade-modal');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.addEventListener('transitionend', () => {
    overlay.setAttribute('hidden', '');
  }, { once: true });
  document.removeEventListener('keydown', _escCloseUpgrade);
}

function handleUpgradeOverlayClick(e) {
  const box = document.getElementById('upgrade-modal-box');
  if (box && !box.contains(e.target)) closeUpgradeModal();
}

function _escCloseUpgrade(e) {
  if (e.key === 'Escape') closeUpgradeModal();
}


// ================================================================
//  CHAT SIDEBAR
// ================================================================
function toggleChat() {
  const sidebar  = document.getElementById('chat-sidebar');
  const backdrop = document.getElementById('chat-backdrop');
  if (!sidebar) return;

  _chatOpen = !_chatOpen;
  sidebar.classList.toggle('open', _chatOpen);
  sidebar.setAttribute('aria-hidden', String(!_chatOpen));
  backdrop?.classList.toggle('hidden', !_chatOpen);

  if (_chatOpen) {
    _unreadCount = 0;
    _updateFabBadge(0);
    setTimeout(() => document.getElementById('chat-msg-input')?.focus(), 320);
    _scrollChatToBottom();
  }
}

async function loadChatHistory() {
  if (!_user) return;

  try {
    const { data: msgs, error } = await _sb
      .from('messages')
      .select('id, sender, content, type, file_url, created_at')
      .eq('user_id', _user.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) { console.warn('[chat] History:', error.message); return; }
    if (!msgs?.length) return;

    const container = document.getElementById('chat-messages');
    if (!container) return;

    _hideWelcome();
    msgs.forEach(m => {
      const el = _buildMsgEl(m);
      if (el) container.appendChild(el);
    });
    _scrollChatToBottom();

  } catch (e) {
    console.warn('[chat] History error:', e.message);
  }
}

function subscribeChat() {
  if (!_user || _chatSub) return;

  _chatSub = _sb
    .channel('msgs:' + _user.id)
    .on(
      'postgres_changes',
      {
        event : 'INSERT',
        schema: 'public',
        table : 'messages',
        filter: 'user_id=eq.' + _user.id,
      },
      payload => {
        const msg = payload.new;
        // Foydalanuvchi xabarlarini qayta chizmaydi
        if (msg.sender === 'user') return;

        const container = document.getElementById('chat-messages');
        if (!container) return;

        _hideWelcome();
        const el = _buildMsgEl(msg);
        if (el) {
          container.appendChild(el);
          _scrollChatToBottom();
          if (!_chatOpen) { _unreadCount++; _updateFabBadge(_unreadCount); }
        }
      }
    )
    .subscribe();
}

async function sendChatMessage() {
  if (!_user) return;

  const input = document.getElementById('chat-msg-input');
  const text  = (input?.value || '').trim();
  if (!text) return;

  input.value = '';

  // Optimistik render
  _appendMsg({ sender: 'user', content: text, created_at: new Date().toISOString() });
  _hideWelcome();
  _scrollChatToBottom();

  // Typing indicator
  const typingEl = _showTypingDots();

  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) return;

    const resp = await fetch(RC_CONFIG.functions.chatSupport, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ text }),
    });

    typingEl?.remove();

    if (!resp.ok) throw new Error('Chat ' + resp.status);

    // Edge fn javobni realtime orqali ham yuboradi,
    // lekin agar to'g'ridan to'g'ri qaytarsa ham qabul qilamiz
    const data = await resp.json().catch(() => ({}));
    if (data?.response) {
      _appendMsg({ sender: 'ai', content: data.response, created_at: new Date().toISOString() });
      _scrollChatToBottom();
    }

  } catch (e) {
    typingEl?.remove();
    showToast("Xabar yuborilmadi", 'error', '\u274C');
    console.warn('[chat] Send:', e.message);
  }
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file || !_user) return;
  event.target.value = '';

  // 5MB limit
  if (file.size > 5 * 1024 * 1024) {
    showToast("Fayl 5MB dan oshmasin", 'warning', '\u26A0\uFE0F');
    return;
  }

  // Uploading...
  const msgEl = _appendMsg({
    sender:     'user',
    content:    '\uD83D\uDCCE Yuklanmoqda...',
    created_at: new Date().toISOString(),
  });
  _hideWelcome();
  _scrollChatToBottom();

  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) return;

    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = _user.id + '/' + Date.now() + '.' + ext;

    const { error: upErr } = await _sb.storage
      .from('receipts')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (upErr) throw upErr;

    const { data: urlData } = _sb.storage.from('receipts').getPublicUrl(path);
    const fileUrl = urlData?.publicUrl || '';

    // Bubble yangilash
    if (msgEl) {
      const bubble = msgEl.querySelector('.chat-bubble');
      if (bubble && fileUrl) {
        bubble.innerHTML =
          '<div class="chat-msg-image">' +
          '<img src="' + fileUrl + '" alt="Chek rasmi" loading="lazy">' +
          '</div>';
      }
    }

    // Edge fn ga xabar berish
    await fetch(RC_CONFIG.functions.chatSupport, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ type: 'image', file_url: fileUrl, filename: file.name }),
    }).catch(() => {});

    showToast("Chek yuborildi. Admin tekshiradi", 'success', '\uD83D\uDCCE');

  } catch (e) {
    if (msgEl) {
      const b = msgEl.querySelector('.chat-bubble');
      if (b) b.textContent = 'Fayl yuklanmadi';
    }
    showToast("Fayl yuklanmadi", 'error', '\u274C');
    console.warn('[chat] Upload:', e.message);
  }
}

// ── Chat helpers ──────────────────────────────────────────────
function _buildMsgEl(msg) {
  if (!msg) return null;

  const sender = msg.sender || 'user'; // user | ai | admin
  const time   = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
    : '';

  const wrap = document.createElement('div');
  wrap.className = 'chat-msg ' + sender;

  if (sender === 'admin') {
    const label = document.createElement('span');
    label.className   = 'chat-msg-label';
    label.textContent = 'Admin';
    wrap.appendChild(label);
  }

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  if (msg.type === 'image' && msg.file_url) {
    bubble.innerHTML =
      '<div class="chat-msg-image">' +
      '<img src="' + msg.file_url + '" alt="Yuklangan fayl" loading="lazy">' +
      '</div>';
  } else {
    bubble.textContent = msg.content || '';
  }

  wrap.appendChild(bubble);

  if (time) {
    const t = document.createElement('span');
    t.className   = 'chat-msg-time';
    t.textContent = time;
    wrap.appendChild(t);
  }

  return wrap;
}

function _appendMsg(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return null;
  const el = _buildMsgEl(msg);
  if (el) container.appendChild(el);
  return el;
}

function _hideWelcome() {
  const w = document.getElementById('chat-welcome');
  if (w) w.style.display = 'none';
}

function _showTypingDots() {
  const container = document.getElementById('chat-messages');
  if (!container) return null;

  const el = document.createElement('div');
  el.className = 'chat-msg ai';
  el.id = '_typing';
  el.innerHTML =
    '<div class="chat-typing">' +
    '<div class="typing-dot"></div>' +
    '<div class="typing-dot"></div>' +
    '<div class="typing-dot"></div>' +
    '</div>';
  container.appendChild(el);
  _scrollChatToBottom();
  return el;
}

function _scrollChatToBottom() {
  const c = document.getElementById('chat-messages');
  if (c) c.scrollTop = c.scrollHeight;
}

function _updateFabBadge(count) {
  const badge = document.getElementById('fab-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}


// ================================================================
//  TOAST
// ================================================================
function showToast(msg, type, icon) {
  type = type || 'info';
  icon = icon || '\u2139\uFE0F';

  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast toast--' + type;
  toast.innerHTML =
    '<span class="toast-icon">' + icon + '</span>' +
    '<div class="toast-body"><div class="toast-msg">' + msg + '</div></div>';

  container.appendChild(toast);

  const remove = () => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  const timer = setTimeout(remove, 3500);
  toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}