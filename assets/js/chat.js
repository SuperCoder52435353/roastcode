// ================================================================
//  RoastCode — chat.js
//  Chat sidebar: history, realtime, xabarlar, fayl upload
//  ⚠️  app.js dan KEYIN yuklanadi — global funksiyalarni override qiladi
//  Globals (app.js dan): _sb, _user, _chatOpen, _chatSub, _unreadCount
// ================================================================
'use strict';

// ================================================================
//  INIT — app.js dan chaqirilishi mumkin (ixtiyoriy)
// ================================================================
function initChat(sb, user) {
  // _sb va _user app.js tomonidan global scope da o'rnatilgan.
  // Bu funksiya faqat explicit initialization uchun (kelajak uchun).
  if (process?.env?.NODE_ENV !== 'production') {
    console.log('[chat] initChat uid:', user?.id || 'no-user');
  }
}

// ================================================================
//  TOGGLE CHAT SIDEBAR
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
    // Badge va unread reset
    _unreadCount = 0;
    _updateFabBadge(0);

    // DB da o'qilgan deb belgilash (background)
    _markMessagesRead();

    // Focus + scroll
    setTimeout(() => {
      document.getElementById('chat-msg-input')?.focus();
    }, 320);
    _scrollChatToBottom();

    // Notification permission so'rash (faqat bir marta)
    _requestNotificationPermission();
  }
}


// ================================================================
//  CHAT TARIXI YUKLASH
// ================================================================
async function loadChatHistory() {
  if (!_user) return;

  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Skeleton loader
  const skeletonEl = _buildSkeleton();
  container.appendChild(skeletonEl);

  try {
    const { data: msgs, error } = await _sb
      .from('messages')
      .select('id, sender, content, type, file_url, created_at, is_read')
      .eq('user_id', _user.id)
      .order('created_at', { ascending: true })
      .limit(60);

    skeletonEl.remove();

    if (error) {
      console.warn('[chat] History error:', error.message);
      return;
    }

    if (!msgs?.length) return;

    _hideWelcome();

    msgs.forEach(m => {
      const el = _buildMsgEl(m);
      if (el) container.appendChild(el);
    });

    _scrollChatToBottom();

    // O'qilmagan xabarlar countini hisoblash va FAB da ko'rsatish
    const unreadCount = msgs.filter(m => m.sender !== 'user' && !m.is_read).length;
    if (unreadCount > 0 && !_chatOpen) {
      _unreadCount = unreadCount;
      _updateFabBadge(unreadCount);
    }

  } catch (e) {
    skeletonEl.remove();
    console.warn('[chat] History catch:', e.message);
  }
}


// ================================================================
//  REALTIME SUBSCRIPTION
// ================================================================
function subscribeChat() {
  if (!_user || _chatSub) return;

  _chatSub = _sb
    .channel('chat_rc_' + _user.id)
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

        // O'zimiz yuborgan xabarni (user) qayta chizmaydi
        if (msg.sender === 'user') return;

        const cont = document.getElementById('chat-messages');
        if (!cont) return;

        _hideWelcome();

        const el = _buildMsgEl(msg);
        if (!el) return;

        // Oldingi _typing element'larni olib tashlaymiz (agar realtime tez kelsa)
        cont.querySelectorAll('[data-typing="true"]').forEach(t => t.remove());

        cont.appendChild(el);
        _scrollChatToBottom();

        // Sidebar yopiq bo'lsa badge ko'rsatish va notification
        if (!_chatOpen) {
          _unreadCount++;
          _updateFabBadge(_unreadCount);
          _tryBrowserNotification(msg);
        }
      }
    )
    .subscribe();
}


// ================================================================
//  XABAR YUBORISH (TEXT)
// ================================================================
async function sendChatMessage() {
  if (!_user) return;

  const input = document.getElementById('chat-msg-input');
  const text  = (input?.value || '').trim();
  if (!text) return;

  // Input tozalash
  input.value = '';
  input.focus();

  // ── Optimistik render ─────────────────────────────────────
  const tempMsg = {
    sender    : 'user',
    content   : text,
    created_at: new Date().toISOString(),
    _temp     : true,
  };
  const msgEl = _appendMsg(tempMsg);
  _hideWelcome();
  _scrollChatToBottom();

  // Typing indicator
  const typingEl = _showTypingDots();

  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      typingEl?.remove();
      return;
    }

    // Pending tier (pricing.js localStorage ga saqlagan)
    const pendingTier = localStorage.getItem('rc_pending_tier') || null;

    const resp = await fetch(RC_CONFIG.functions.chatSupport, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ text, tier: pendingTier }),
    });

    typingEl?.remove();

    if (!resp.ok) {
      _markMsgFailed(msgEl);
      _addRetryButton(msgEl, text);
      throw new Error('Chat HTTP ' + resp.status);
    }

    // Yuborildi holati
    _markMsgSent(msgEl);

    const data = await resp.json().catch(() => ({}));

    // Edge fn to'g'ridan-to'g'ri javob qaytarsa
    if (data?.response) {
      _appendMsg({
        sender    : 'ai',
        content   : data.response,
        created_at: new Date().toISOString(),
      });
      _scrollChatToBottom();
    }

  } catch (e) {
    typingEl?.remove();
    _markMsgFailed(msgEl);
    if (!msgEl?.querySelector('.chat-retry-btn')) {
      _addRetryButton(msgEl, text);
    }
    console.warn('[chat] sendChatMessage:', e.message);
  }
}


// ================================================================
//  FAYL / RASM YUKLASH (CHEK)
// ================================================================
async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file || !_user) return;
  event.target.value = ''; // input reset

  // ── Validatsiya ───────────────────────────────────────────
  if (file.size > 5 * 1024 * 1024) {
    showToast('Fayl 5MB dan oshmasin', 'warning', '⚠️');
    return;
  }

  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png',
    'image/gif', 'image/webp', 'application/pdf',
  ];
  if (!allowedTypes.includes(file.type)) {
    showToast('Faqat rasm (jpg/png/gif/webp) yoki PDF', 'warning', '⚠️');
    return;
  }

  // ── Local preview (blob URL) ──────────────────────────────
  const isImage    = file.type.startsWith('image/');
  const previewUrl = isImage ? URL.createObjectURL(file) : null;

  // Optimistik render
  const msgEl = _appendMsg({
    sender    : 'user',
    content   : previewUrl ? '' : '📎 ' + file.name,
    type      : 'image',
    file_url  : previewUrl,
    created_at: new Date().toISOString(),
    _uploading: true,
  });

  _hideWelcome();
  _scrollChatToBottom();

  // Upload progress bar
  const progressEl = _addUploadProgress(msgEl);

  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      progressEl?.remove();
      return;
    }

    // Unique path
    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const uniq = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const path = _user.id + '/' + uniq + '.' + ext;

    // Supabase Storage ga yuklash
    const { error: upErr } = await _sb.storage
      .from('receipts')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (upErr) throw upErr;

    progressEl?.remove();

    // Public URL
    const { data: urlData } = _sb.storage.from('receipts').getPublicUrl(path);
    const fileUrl = urlData?.publicUrl || '';

    // Blob URL ni ozod qilish
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    // Bubble'ni yangi URL bilan yangilash
    if (msgEl && fileUrl) {
      const bubble = msgEl.querySelector('.chat-bubble');
      if (bubble) {
        bubble.innerHTML = _buildImageBubble(fileUrl, file.name);
      }
    }

    // Pending tier (localStorage dan)
    const pendingTier = localStorage.getItem('rc_pending_tier') || null;

    // Edge Function ga yuborish
    const resp = await fetch(RC_CONFIG.functions.chatSupport, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({
        type    : 'image',
        file_url: fileUrl,
        filename: file.name,
        tier    : pendingTier,
      }),
    }).catch(() => null);

    if (resp?.ok) {
      const data = await resp.json().catch(() => ({}));
      if (data?.response) {
        _appendMsg({
          sender    : 'ai',
          content   : data.response,
          created_at: new Date().toISOString(),
        });
        _scrollChatToBottom();
      }
      // Pending tier'ni tozalash (muvaffaqiyatli yuborildi)
      localStorage.removeItem('rc_pending_tier');
    }

    showToast('Chek yuborildi ✓ Admin 24 soat ichida ko\'rib chiqadi', 'success', '📎');

  } catch (e) {
    progressEl?.remove();
    _markMsgFailed(msgEl);
    showToast('Fayl yuklanmadi. Qayta urinib ko\'ring', 'error', '❌');
    console.warn('[chat] handleFileUpload:', e.message);
  }
}


// ================================================================
//  XABAR ELEMENT QURISH
// ================================================================
function _buildMsgEl(msg) {
  if (!msg) return null;

  const sender = msg.sender || 'user'; // user | ai | admin
  const time   = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString('uz-UZ', {
        hour  : '2-digit',
        minute: '2-digit',
      })
    : '';

  const wrap = document.createElement('div');
  wrap.className = 'chat-msg ' + sender;
  if (msg._uploading) wrap.dataset.uploading = 'true';

  // Admin label
  if (sender === 'admin') {
    const label = document.createElement('span');
    label.className   = 'chat-msg-label';
    label.textContent = 'ADMIN';
    wrap.appendChild(label);
  }

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  if (msg.type === 'image' && msg.file_url) {
    bubble.innerHTML = _buildImageBubble(msg.file_url, msg.filename || '');
  } else {
    bubble.innerHTML = _parseSimpleMarkdown(msg.content || '');
  }

  wrap.appendChild(bubble);

  // Meta: vaqt + status (faqat user xabarlari uchun)
  const meta = document.createElement('div');
  meta.className = 'chat-msg-meta';

  if (time) {
    const timeEl = document.createElement('span');
    timeEl.className   = 'chat-msg-time';
    timeEl.textContent = time;
    meta.appendChild(timeEl);
  }

  if (sender === 'user') {
    const statusEl = document.createElement('span');
    statusEl.className   = 'chat-msg-status';
    statusEl.dataset.status = 'sent';
    statusEl.textContent = '✓';
    statusEl.setAttribute('aria-hidden', 'true');
    meta.appendChild(statusEl);
  }

  wrap.appendChild(meta);

  return wrap;
}

function _appendMsg(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return null;
  const el = _buildMsgEl(msg);
  if (el) container.appendChild(el);
  return el;
}

function _buildImageBubble(url, filename) {
  const label = filename ? 'To\'lov cheki: ' + filename : 'To\'lov cheki';
  return (
    '<div class="chat-msg-image">' +
    '<img src="' + url + '" alt="' + label + '" loading="lazy" ' +
    'onclick="window.open(\'' + url + '\',\'_blank\')" ' +
    'style="cursor:pointer" title="Kattalashtirish uchun bosing">' +
    '</div>'
  );
}


// ================================================================
//  UI HOLATLARI
// ================================================================
function _markMsgSent(msgEl) {
  if (!msgEl) return;
  const status = msgEl.querySelector('[data-status]');
  if (status) {
    status.textContent  = '✓';
    status.dataset.status = 'sent';
  }
}

function _markMsgFailed(msgEl) {
  if (!msgEl) return;
  const bubble = msgEl.querySelector('.chat-bubble');
  if (bubble) bubble.style.opacity = '0.55';
  const status = msgEl.querySelector('[data-status]');
  if (status) {
    status.textContent    = '✗';
    status.dataset.status  = 'failed';
    status.style.color     = 'var(--red-light)';
  }
}

function _addRetryButton(msgEl, text) {
  if (!msgEl || !text) return;

  const btn = document.createElement('button');
  btn.className   = 'chat-retry-btn';
  btn.textContent = '↺ Qayta yuborish';
  btn.setAttribute('aria-label', 'Xabarni qayta yuborish');

  btn.onclick = () => {
    btn.remove();
    // Bubble'ni tiklash
    const bubble = msgEl.querySelector('.chat-bubble');
    if (bubble) bubble.style.opacity = '';
    const status = msgEl.querySelector('[data-status]');
    if (status) { status.textContent = '✓'; status.dataset.status = 'sent'; status.style.color = ''; }

    // Input'ga paste qilib user qayta yuboradi
    const input = document.getElementById('chat-msg-input');
    if (input) {
      input.value = text;
      input.focus();
    }
  };

  msgEl.appendChild(btn);
}

function _addUploadProgress(msgEl) {
  if (!msgEl) return null;

  const prog = document.createElement('div');
  prog.className = 'chat-upload-progress';
  prog.setAttribute('aria-live', 'polite');
  prog.innerHTML =
    '<div class="cup-bar"><div class="cup-fill"></div></div>' +
    '<span>Yuklanmoqda...</span>';

  msgEl.appendChild(prog);
  return prog;
}

function _buildSkeleton() {
  const el = document.createElement('div');
  el.className = 'chat-skeleton';
  el.id = '_chat_skeleton';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<div class="chat-msg ai">' +
    '  <div class="chat-bubble skeleton" style="width:180px;height:34px;border-radius:12px;"></div>' +
    '</div>' +
    '<div class="chat-msg user">' +
    '  <div class="chat-bubble skeleton" style="width:140px;height:28px;border-radius:12px;"></div>' +
    '</div>' +
    '<div class="chat-msg ai">' +
    '  <div class="chat-bubble skeleton" style="width:220px;height:52px;border-radius:12px;"></div>' +
    '</div>';
  return el;
}


// ================================================================
//  HELPERS
// ================================================================
function _hideWelcome() {
  const w = document.getElementById('chat-welcome');
  if (w) w.style.display = 'none';
}

function _showTypingDots() {
  const container = document.getElementById('chat-messages');
  if (!container) return null;

  // Avvalgi typing indicator'ni olib tashlash
  container.querySelectorAll('[data-typing="true"]').forEach(t => t.remove());

  const el = document.createElement('div');
  el.className = 'chat-msg ai';
  el.dataset.typing = 'true';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Javob tayyorlanmoqda');
  el.innerHTML =
    '<div class="chat-typing" aria-hidden="true">' +
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
  if (!c) return;

  // Faqat quyi qismda tursa scroll qilish (agar user yuqori qarab o'qiyotsa majburlamaslik)
  const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 150;
  if (nearBottom || !_chatOpen) {
    c.scrollTo({ top: c.scrollHeight, behavior: _chatOpen ? 'smooth' : 'instant' });
  }
}

function _updateFabBadge(count) {
  const badge = document.getElementById('fab-badge');
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.remove('hidden');
    badge.setAttribute('aria-label', count + ' ta o\'qilmagan xabar');
  } else {
    badge.classList.add('hidden');
  }
}

function _markMessagesRead() {
  if (!_user || !_sb) return;
  _sb.from('messages')
    .update({ is_read: true })
    .eq('user_id', _user.id)
    .eq('is_read', false)
    .neq('sender', 'user')
    .then(() => {})
    .catch(() => {});
}

// ── Simple markdown parser (chat uchun) ──────────────────────
function _parseSimpleMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// ── Browser notification ──────────────────────────────────────
function _requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function _tryBrowserNotification(msg) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const senderLabel = msg.sender === 'admin' ? '🔴 Admin' : '🤖 RoastCode AI';
  const body = (msg.content || '').slice(0, 80) + (msg.content?.length > 80 ? '...' : '');

  try {
    new Notification(senderLabel, {
      body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔥</text></svg>',
      tag : 'roastcode-chat',
    });
  } catch (_e) {
    // Notification API ba'zida ruxsatsiz xato beradi
  }
}


// ================================================================
//  DYNAMIC CSS (chat.js ga xos qo'shimcha stillar)
// ================================================================
(function _injectChatStyles() {
  if (document.getElementById('rc-chat-extra-css')) return;

  const s = document.createElement('style');
  s.id = 'rc-chat-extra-css';
  s.textContent = /* css */`

  /* ── Message meta ─────────────────────────────────── */
  .chat-msg-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px var(--space-1);
  }

  .chat-msg-time {
    font-size: 10px;
    color: var(--text-dim);
    line-height: 1;
  }

  .chat-msg-status {
    font-size: 10px;
    color: var(--text-dim);
    line-height: 1;
    transition: color var(--t-fast);
  }

  .chat-msg-status[data-status="failed"] {
    color: var(--red-light);
  }

  /* ── Retry tugmasi ─────────────────────────────────── */
  .chat-retry-btn {
    margin-top: 5px;
    padding: 3px 10px;
    font-size: 11px;
    font-family: var(--font-body);
    font-weight: 600;
    background: var(--red-alpha);
    border: 1px solid rgba(239,68,68,0.35);
    border-radius: var(--r-sm);
    color: var(--red-light);
    cursor: pointer;
    transition: all var(--t-fast);
    display: inline-block;
  }
  .chat-retry-btn:hover {
    background: var(--red);
    color: #fff;
    border-color: var(--red);
  }

  /* ── Upload progress ───────────────────────────────── */
  .chat-upload-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--text-dim);
    font-family: var(--font-body);
  }

  .cup-bar {
    width: 72px;
    height: 3px;
    background: var(--bg-elevated);
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .cup-fill {
    height: 100%;
    background: var(--orange);
    border-radius: 2px;
    animation: rc-cup-fill 1.6s ease-in-out infinite;
    transform-origin: left;
  }

  @keyframes rc-cup-fill {
    0%   { width: 5%; }
    50%  { width: 75%; }
    100% { width: 5%; }
  }

  /* ── Skeleton ──────────────────────────────────────── */
  .chat-skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-2);
    pointer-events: none;
  }

  /* ── Image message ─────────────────────────────────── */
  .chat-msg-image {
    border-radius: var(--r-md);
    overflow: hidden;
    border: 1px solid var(--border);
    max-width: 220px;
    transition: border-color var(--t-fast);
  }

  .chat-msg-image:hover {
    border-color: var(--orange);
  }

  .chat-msg-image img {
    width: 100%;
    display: block;
    object-fit: cover;
    transition: transform 0.3s var(--ease-out);
  }

  .chat-msg-image:hover img {
    transform: scale(1.02);
  }

  /* ── Bubble enter animation ────────────────────────── */
  .chat-msg {
    animation: rc-msg-in 0.22s var(--ease-out) both;
  }

  @keyframes rc-msg-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Admin label ───────────────────────────────────── */
  .chat-msg.admin .chat-msg-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--admin-red);
    padding: 0 2px;
    text-transform: uppercase;
  }

  /* ── Sending state pulse ───────────────────────────── */
  .chat-msg[data-uploading="true"] .chat-bubble {
    animation: rc-upload-pulse 1.5s ease-in-out infinite;
  }

  @keyframes rc-upload-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.65; }
  }

  /* ── Code inside chat bubble ───────────────────────── */
  .chat-bubble code {
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--bg-void);
    color: var(--orange-light);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid var(--border);
  }

  .chat-bubble strong {
    color: var(--text-bright);
  }

  `;
  document.head.appendChild(s);
}());