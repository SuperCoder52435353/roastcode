// ================================================================
//  RoastCode — admin.js
//  Admin panel: auth, dashboard, users, payments, Telegram-chat
//  ⚠️  Faqat tier='admin' foydalanuvchilar uchun
//  Bog'liq: config.js (RC_CONFIG, getTierConfig) + supabase-js@2
// ================================================================
'use strict';

// ── Global holat ──────────────────────────────────────────────────
let _sb           = null;   // Supabase client
let _adminUser    = null;   // auth.User
let _adminProfile = null;   // profiles row

// Auto-refresh
let _refreshInterval  = null;
let _refreshCountdown = 30;

// Users
let _currentTierModal  = null;  // { userId, currentTier, username }
let _selectedTier      = null;
let _loadUsersDebounce = null;

// Payments
let _currentRejectModal = null; // { paymentId, userId, username }

// Chats
let _activeChat     = null;     // { userId, username, tier }
let _adminChatSub   = null;     // Realtime channel
let _chatUsersCache = [];

// Confirm modal
let _confirmYesCb = null;


// ================================================================
//  INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  _sb = supabase.createClient(RC_CONFIG.supabase.url, RC_CONFIG.supabase.anonKey);
  await checkAdminAuth();
  _bindKeyboard();
});


// ================================================================
//  AUTH
// ================================================================
async function checkAdminAuth() {
  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) { _goLogin(); return; }

    _adminUser = session.user;

    const { data: profile, error } = await _sb
      .from('profiles')
      .select('*')
      .eq('id', _adminUser.id)
      .single();

    if (error || !profile)        { _goLogin(); return; }
    if (profile.tier !== 'admin') { window.location.href = RC_CONFIG.app.pages.app; return; }
    if (profile.is_banned)        { await _sb.auth.signOut(); _goLogin(); return; }

    _adminProfile = profile;
    _initAdminUI();

    // Loading yashirish
    const loadEl = document.getElementById('admin-loading');
    if (loadEl) loadEl.classList.add('hidden');

    // Boshlash
    showSection('dashboard');
    await loadDashboardStats();
    _startRefreshTimer();
    _loadUnreadChatCount();

    // Session kuzatish
    _sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') _goLogin(); });

  } catch (e) {
    console.error('[admin] auth:', e);
    _goLogin();
  }
}

function _goLogin() {
  window.location.href = RC_CONFIG.app.pages.login;
}

async function adminLogout() {
  if (_adminChatSub) await _sb.removeChannel(_adminChatSub);
  clearInterval(_refreshInterval);
  await _sb.auth.signOut();
  _goLogin();
}

function _initAdminUI() {
  const initial = (_adminProfile.username || _adminProfile.email || 'A')[0].toUpperCase();
  const avatar  = document.getElementById('admin-avatar');
  if (avatar) avatar.textContent = initial;

  const nameEl  = document.getElementById('admin-menu-name');
  const emailEl = document.getElementById('admin-menu-email');
  if (nameEl)  nameEl.textContent  = _adminProfile.full_name || _adminProfile.username || 'Admin';
  if (emailEl) emailEl.textContent = _adminProfile.email     || _adminUser?.email     || '';
}

function toggleAdminUserMenu() {
  const menu = document.getElementById('admin-user-menu');
  const btn  = document.getElementById('admin-avatar');
  if (!menu) return;

  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  btn?.setAttribute('aria-expanded', String(willOpen));

  if (willOpen) {
    setTimeout(() => {
      const close = e => {
        if (!menu.contains(e.target) && e.target !== btn) {
          menu.hidden = true;
          btn?.setAttribute('aria-expanded', 'false');
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }
}


// ================================================================
//  AUTO-REFRESH — 30 sekund
// ================================================================
function _startRefreshTimer() {
  _refreshCountdown = 30;
  _tickRefreshUI();
  if (_refreshInterval) clearInterval(_refreshInterval);

  _refreshInterval = setInterval(() => {
    _refreshCountdown--;
    _tickRefreshUI();
    if (_refreshCountdown <= 0) {
      _refreshCountdown = 30;
      _silentRefresh();
    }
  }, 1000);
}

function _tickRefreshUI() {
  const el = document.getElementById('refresh-timer');
  if (el) el.textContent = _refreshCountdown + 's';
}

async function _silentRefresh() {
  const icon = document.getElementById('refresh-spin-icon');
  if (icon) icon.classList.add('spinning');

  try {
    const activeEl = document.querySelector('.admin-section:not(.hidden)');
    const sec      = activeEl?.dataset?.section;

    if      (sec === 'dashboard') await loadDashboardStats();
    else if (sec === 'users')     await loadUsers();
    else if (sec === 'payments')  await loadPayments();

    await Promise.all([_loadUnreadChatCount(), _loadPendingCount()]);

    const updEl = document.getElementById('last-updated');
    if (updEl) updEl.textContent = 'Yangilandi: ' + _nowTime();
  } finally {
    if (icon) icon.classList.remove('spinning');
  }
}

async function manualRefresh() {
  _refreshCountdown = 30;
  _tickRefreshUI();
  await _silentRefresh();
}


// ================================================================
//  SECTION NAVIGATION
// ================================================================
function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));

  const target = document.getElementById('section-' + name);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.admin-nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === name);
  });

  if (name === 'users')    loadUsers();
  if (name === 'payments') loadPayments();
  if (name === 'chats')    loadChatUsers();
}


// ================================================================
//  DASHBOARD
// ================================================================
async function loadDashboardStats() {
  try {
    // 1. Jami foydalanuvchilar (admin tashqari)
    const { count: total } = await _sb
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('tier', 'admin');
    _setStatVal('stat-total-users', total ?? 0);

    // 2. Pending to'lovlar
    const { count: pending } = await _sb
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    _setStatVal('stat-pending-count', pending ?? 0);
    _updatePendingBadge(pending ?? 0);

    // 3. Bugun faol (sessions dan unique user_id)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todaySessions } = await _sb
      .from('sessions')
      .select('user_id')
      .gte('created_at', todayStart.toISOString());

    const uniqueActive = new Set((todaySessions || []).map(s => s.user_id)).size;
    _setStatVal('stat-active-today', uniqueActive);

    // 4. Bugungi jami so'rovlar
    const { count: reqToday } = await _sb
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString());
    _setStatVal('stat-requests-today', reqToday ?? 0);

    // 5. Tier taqsimot + so'nggi to'lovlar (parallel)
    await Promise.all([_loadTierBars(), _loadRecentPayments()]);

    const updEl = document.getElementById('last-updated');
    if (updEl) updEl.textContent = 'Yangilandi: ' + _nowTime();

  } catch (e) {
    console.error('[admin] dashboard:', e);
    showToast('Dashboard yuklanmadi', 'error', '❌');
  }
}

function _setStatVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = typeof val === 'number' ? val.toLocaleString('ru-RU') : val;
}

async function _loadTierBars() {
  const tiers = ['free', 'pro', 'x', 'team'];
  const counts = {};
  let total = 0;

  await Promise.all(tiers.map(async tier => {
    const { count } = await _sb
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('tier', tier);
    counts[tier] = count ?? 0;
    total += count ?? 0;
  }));

  tiers.forEach(tier => {
    const pct  = total > 0 ? Math.round((counts[tier] / total) * 100) : 0;
    const bar  = document.getElementById('bar-' + tier);
    const cnt  = document.getElementById('count-' + tier);
    if (bar) bar.style.width = pct + '%';
    if (cnt) cnt.textContent = counts[tier];
  });
}

async function _loadRecentPayments() {
  const container = document.getElementById('dash-recent-payments');
  if (!container) return;

  const { data: payments } = await _sb
    .from('payments')
    .select('id, tier, amount_usd, status, created_at, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(6);

  if (!payments?.length) {
    container.innerHTML = '<p class="text-muted" style="font-size:12px;padding:20px 0;text-align:center">Hozircha to\'lov yo\'q</p>';
    return;
  }

  container.innerHTML = payments.map(p => `
    <div class="dash-pay-row">
      <span class="dash-pay-user">${_esc(p.profiles?.username || '—')}</span>
      <span class="dash-pay-tier">${_tierBadge(p.tier || 'free')}</span>
      <span class="dash-pay-amount">${p.amount_usd ? '$' + p.amount_usd : '—'}</span>
      <span class="dash-pay-time">${_timeAgo(p.created_at)}</span>
    </div>
  `).join('');
}


// ================================================================
//  USERS
// ================================================================
async function loadUsers() {
  const tbody  = document.getElementById('users-tbody');
  const cntLbl = document.getElementById('users-count-label');
  if (!tbody) return;

  const search  = (document.getElementById('user-search')?.value  || '').trim();
  const tierF   = document.getElementById('tier-filter')?.value   || '';
  const statusF = document.getElementById('status-filter')?.value || '';

  tbody.innerHTML = `<tr><td colspan="7"><div class="loading-state"><div class="spinner"></div></div></td></tr>`;

  try {
    let q = _sb
      .from('profiles')
      .select('id, username, email, full_name, tier, is_banned, daily_requests, created_at')
      .neq('tier', 'admin')
      .order('created_at', { ascending: false })
      .limit(100);

    if (tierF)              q = q.eq('tier', tierF);
    if (statusF === 'active')   q = q.eq('is_banned', false);
    if (statusF === 'banned')   q = q.eq('is_banned', true);
    if (search)             q = q.or(`username.ilike.%${search}%,email.ilike.%${search}%`);

    const { data: users, error } = await q;
    if (error) throw error;

    if (!users?.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="loading-state" style="padding:40px 0"><p class="text-muted" style="font-size:13px">Foydalanuvchi topilmadi</p></div></td></tr>`;
      if (cntLbl) cntLbl.textContent = '0 ta foydalanuvchi';
      return;
    }

    tbody.innerHTML = users.map(renderUserRow).join('');
    if (cntLbl) cntLbl.textContent = users.length + ' ta foydalanuvchi';

  } catch (e) {
    console.error('[admin] loadUsers:', e);
    tbody.innerHTML = `<tr><td colspan="7"><div class="loading-state" style="padding:32px 0"><p class="text-muted" style="font-size:12px">Xatolik yuz berdi</p></div></td></tr>`;
    showToast('Foydalanuvchilar yuklanmadi', 'error', '❌');
  }
}

function debouncedLoadUsers() {
  clearTimeout(_loadUsersDebounce);
  _loadUsersDebounce = setTimeout(loadUsers, 380);
}

function renderUserRow(user) {
  const tier     = (user.tier || 'free').toLowerCase();
  const isBanned = !!user.is_banned;
  const initial  = (user.username || user.email || '?')[0].toUpperCase();
  const tConf    = getTierConfig(tier);
  const limit    = isFinite(tConf.daily_requests) ? tConf.daily_requests : '∞';
  const used     = user.daily_requests || 0;
  const date     = user.created_at ? new Date(user.created_at).toLocaleDateString('uz-UZ') : '—';
  const uname    = _esc(user.username || '—');
  const uid      = user.id;

  return `
    <tr class="${isBanned ? 'row-banned' : ''}">
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar">${_esc(initial)}</div>
          <div class="user-cell-name">${uname}</div>
        </div>
      </td>
      <td>
        <span style="font-size:12px;color:var(--text-muted)">${_esc(user.email || '—')}</span>
      </td>
      <td>${_tierBadge(tier)}</td>
      <td>
        <span style="font-family:var(--font-mono);font-size:12px">${used} / ${limit}</span>
      </td>
      <td>
        ${isBanned
          ? '<span style="font-size:11px;color:var(--red-light);font-weight:700">⛔ Bloklangan</span>'
          : '<span style="font-size:11px;color:var(--green-light);font-weight:700">✅ Faol</span>'
        }
      </td>
      <td>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">${date}</span>
      </td>
      <td>
        <div class="table-actions">
          <button class="tbl-btn tbl-btn--tier"
            onclick="openTierModal('${uid}','${tier}','${_esc(user.username || '')}')"
          >🔄 Tier</button>
          ${isBanned
            ? `<button class="tbl-btn tbl-btn--unban" onclick="banUser('${uid}',false,'${_esc(user.username || '')}')">✅ Ochish</button>`
            : `<button class="tbl-btn tbl-btn--ban"   onclick="banUser('${uid}',true,'${_esc(user.username || '')}')">⛔ Ban</button>`
          }
          <button class="tbl-btn tbl-btn--chat"
            onclick="openUserChatFromUsers('${uid}','${tier}','${_esc(user.username || '')}')"
            title="Chat"
          >💬</button>
        </div>
      </td>
    </tr>
  `;
}


// ── Tier modal ────────────────────────────────────────────────────
function openTierModal(userId, currentTier, username) {
  _currentTierModal = { userId, currentTier, username };
  _selectedTier     = null;

  const infoEl = document.getElementById('tier-modal-user-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="user-cell-avatar" style="width:40px;height:40px;font-size:15px;flex-shrink:0">
        ${_esc((username || '?')[0].toUpperCase())}
      </div>
      <div>
        <div style="font-weight:700;font-size:14px;color:var(--text-bright)">${_esc(username || '—')}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:3px">
          Hozirgi tier: ${_tierBadge(currentTier)}
        </div>
      </div>
    `;
  }

  // Option reset
  document.querySelectorAll('.tier-option-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.tier === currentTier);
  });

  const saveBtn = document.getElementById('tier-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  document.getElementById('tier-modal').hidden = false;
}

function selectTierOption(tier) {
  _selectedTier = tier;

  document.querySelectorAll('.tier-option-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.tier === tier);
  });

  const saveBtn = document.getElementById('tier-save-btn');
  if (saveBtn) saveBtn.disabled = (tier === _currentTierModal?.currentTier);
}

async function confirmTierChange() {
  if (!_currentTierModal || !_selectedTier) return;
  if (_selectedTier === _currentTierModal.currentTier) return;

  const { userId, username } = _currentTierModal;
  const newTier = _selectedTier;

  const saveBtn = document.getElementById('tier-save-btn');
  _btnLoad(saveBtn, true, 'Saqlanmoqda...');

  try {
    const { error } = await _sb
      .from('profiles')
      .update({ tier: newTier })
      .eq('id', userId);

    if (error) throw error;

    closeTierModal();
    showToast(`${username} → ${newTier.toUpperCase()} ga o'zgartirildi`, 'success', '✅');
    await loadUsers();

  } catch (e) {
    console.error('[admin] confirmTierChange:', e);
    showToast('Tier o\'zgartirilmadi', 'error', '❌');
  } finally {
    _btnLoad(saveBtn, false, '✅ Saqlash');
  }
}

function closeTierModal() {
  document.getElementById('tier-modal').hidden = true;
  _currentTierModal = null;
  _selectedTier     = null;
}

function handleTierModalOverlay(e) {
  if (e.target === document.getElementById('tier-modal')) closeTierModal();
}


// ── Ban / Unban ───────────────────────────────────────────────────
function banUser(userId, isBan, username) {
  confirmAction(
    `"${username}" ni ${isBan ? 'bloklash' : 'blokdan chiqarish'}ni tasdiqlaysizmi?`,
    async () => {
      try {
        const { error } = await _sb
          .from('profiles')
          .update({ is_banned: isBan })
          .eq('id', userId);

        if (error) throw error;

        showToast(
          `${username} ${isBan ? 'bloklandi' : 'blokdan chiqarildi'}`,
          'success',
          isBan ? '⛔' : '✅'
        );
        await loadUsers();

      } catch (e) {
        showToast('Amal bajarilmadi', 'error', '❌');
      }
    },
    isBan ? '⛔' : '✅',
    isBan ? '⛔ Bloklash' : '✅ Chiqarish',
    isBan ? 'btn-danger' : 'btn-success'
  );
}

// Users → Chats (section almashtirish + chat ochish)
function openUserChatFromUsers(userId, tier, username) {
  showSection('chats');
  setTimeout(() => openUserChat(userId, username, tier), 250);
}


// ================================================================
//  PAYMENTS
// ================================================================
async function loadPayments() {
  const grid   = document.getElementById('payments-grid');
  const cntLbl = document.getElementById('payments-count-label');
  if (!grid) return;

  const statusF = document.getElementById('payment-status-filter')?.value ?? 'pending';

  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    let q = _sb
      .from('payments')
      .select('id, user_id, tier, amount_usd, amount_som, file_url, status, created_at, profiles(username, email)')
      .order('created_at', { ascending: false })
      .limit(60);

    if (statusF) q = q.eq('status', statusF);

    const { data: payments, error } = await q;
    if (error) throw error;

    if (!payments?.length) {
      const txt = statusF === 'pending' ? '⏳ Pending to\'lov yo\'q' : 'To\'lov topilmadi';
      grid.innerHTML = `<div style="grid-column:1/-1;padding:60px 0;text-align:center"><p class="text-muted" style="font-size:14px">${txt}</p></div>`;
      if (cntLbl) cntLbl.textContent = '0 ta to\'lov';
      return;
    }

    grid.innerHTML = payments.map(renderPaymentCard).join('');
    if (cntLbl) cntLbl.textContent = payments.length + ' ta to\'lov';

  } catch (e) {
    console.error('[admin] loadPayments:', e);
    grid.innerHTML = `<div style="grid-column:1/-1;padding:40px 0;text-align:center"><p class="text-muted" style="font-size:12px">Xatolik yuz berdi</p></div>`;
    showToast('To\'lovlar yuklanmadi', 'error', '❌');
  }
}

function renderPaymentCard(p) {
  const username  = p.profiles?.username || '—';
  const email     = p.profiles?.email    || '—';
  const initial   = (username[0] || '?').toUpperCase();
  const tier      = (p.tier || 'free').toLowerCase();
  const status    = p.status || 'pending';
  const amtUsd    = p.amount_usd  ? '$' + p.amount_usd  : '—';
  const amtSom    = p.amount_som  ? p.amount_som.toLocaleString('ru-RU') + ' so\'m' : '—';
  const time      = _formatDate(p.created_at);

  const statusMap = {
    pending : '⏳ Pending',
    approved: '✅ Tasdiqlangan',
    rejected: '❌ Rad etilgan',
  };

  const receiptHTML = p.file_url
    ? `<div class="pay-card-receipt"
          onclick="openReceiptModal('${_esc(p.file_url)}')"
          title="Kattalashtirish uchun bosing"
       >
         <img src="${_esc(p.file_url)}" alt="To'lov cheki" loading="lazy">
       </div>`
    : `<div class="pay-card-receipt">
         <div class="pay-receipt-empty">
           <span>📎</span>
           <span>Chek rasmi yuklanmagan</span>
         </div>
       </div>`;

  const actionsHTML = status === 'pending'
    ? `<button class="btn btn-success btn-sm"
         onclick="approvePayment('${p.id}','${p.user_id}','${tier}','${_esc(username)}')"
       >✅ Qabul</button>
       <button class="btn btn-danger btn-sm"
         onclick="openRejectModal('${p.id}','${p.user_id}','${_esc(username)}')"
       >❌ Rad</button>`
    : '';

  return `
    <div class="payment-card ${status}" id="pay-card-${p.id}">
      <div class="pay-card-head">
        <div class="pay-card-user">
          <div class="pay-card-avatar">${_esc(initial)}</div>
          <div class="pay-card-user-info">
            <div class="pay-card-username">${_esc(username)}</div>
            <div class="pay-card-email">${_esc(email)}</div>
          </div>
        </div>
        <span class="pay-status ${status}">${statusMap[status] || status}</span>
      </div>

      <div class="pay-card-info">
        <div class="pay-info-item">
          <span class="pay-info-lbl">Tarif</span>
          <span class="pay-info-val pay-info-val--tier">${_tierBadge(tier)}</span>
        </div>
        <div class="pay-info-item">
          <span class="pay-info-lbl">USD</span>
          <span class="pay-info-val">${amtUsd}</span>
        </div>
        <div class="pay-info-item">
          <span class="pay-info-lbl">So'mda</span>
          <span class="pay-info-val" style="font-size:12px">${amtSom}</span>
        </div>
      </div>

      ${receiptHTML}

      <div class="pay-card-foot">
        <span class="pay-card-time">🕐 ${time}</span>
        <div class="pay-card-actions">${actionsHTML}</div>
      </div>
    </div>
  `;
}

// ── Approve ───────────────────────────────────────────────────────
async function approvePayment(paymentId, userId, tier, username) {
  confirmAction(
    `"${username}" uchun ${tier.toUpperCase()} tarifi berilsinmi?`,
    async () => {
      try {
        // 1. Profileni yangilash
        const { error: pErr } = await _sb
          .from('profiles')
          .update({ tier })
          .eq('id', userId);
        if (pErr) throw pErr;

        // 2. Payment → approved
        const { error: payErr } = await _sb
          .from('payments')
          .update({ status: 'approved' })
          .eq('id', paymentId);
        if (payErr) throw payErr;

        // 3. Tabrik xabari
        const tConf = getTierConfig(tier);
        const reqs  = isFinite(tConf.daily_requests) ? tConf.daily_requests : 'Cheksiz';
        const lines = isFinite(tConf.max_lines)      ? tConf.max_lines      : 'Cheksiz';

        const msg =
          `🎉 Tabriklaymiz, ${username}!\n\n` +
          `✅ ${tier.toUpperCase()} tarifi faollashtirildi!\n\n` +
          `📊 Kunlik so'rovlar: ${reqs}\n` +
          `📝 Maksimal qatorlar: ${lines}\n\n` +
          `Enjoy roasting! 🔥`;

        await _sb.from('messages').insert({
          user_id : userId,
          sender  : 'admin',
          content : msg,
          type    : 'text',
          is_read : false,
        });

        showToast(`${username} → ${tier.toUpperCase()} berildi 🎉`, 'success', '✅');
        await loadPayments();
        await _loadPendingCount();

      } catch (e) {
        console.error('[admin] approvePayment:', e);
        showToast('To\'lov tasdiqlanmadi', 'error', '❌');
      }
    },
    '✅',
    '✅ Tasdiqlash',
    'btn-success'
  );
}

// ── Reject modal ──────────────────────────────────────────────────
function openRejectModal(paymentId, userId, username) {
  _currentRejectModal = { paymentId, userId, username };

  const titleEl = document.getElementById('reject-modal-title');
  if (titleEl) titleEl.textContent = `❌ "${username}" to'lovini rad etish`;

  const textarea = document.getElementById('reject-reason');
  if (textarea) textarea.value = '';

  document.getElementById('reject-modal').hidden = false;
}

async function confirmReject() {
  if (!_currentRejectModal) return;
  const { paymentId, userId, username } = _currentRejectModal;
  const reason = (document.getElementById('reject-reason')?.value || '').trim();

  try {
    const { error: payErr } = await _sb
      .from('payments')
      .update({ status: 'rejected' })
      .eq('id', paymentId);
    if (payErr) throw payErr;

    const msgText = reason
      ? `❌ Afsuski, to'lovingiz rad etildi.\n\nSabab: ${reason}\n\nQaytadan to'lov qilishingiz mumkin.`
      : `❌ Afsuski, to'lovingiz rad etildi.\n\nChekni tekshirib, qaytadan urinib ko'ring.`;

    await _sb.from('messages').insert({
      user_id : userId,
      sender  : 'admin',
      content : msgText,
      type    : 'text',
      is_read : false,
    });

    closeRejectModal();
    showToast(`${username} to'lovi rad etildi`, 'warning', '❌');
    await loadPayments();
    await _loadPendingCount();

  } catch (e) {
    console.error('[admin] confirmReject:', e);
    showToast('Amal bajarilmadi', 'error', '❌');
  }
}

function closeRejectModal() {
  document.getElementById('reject-modal').hidden = true;
  _currentRejectModal = null;
}

function handleRejectModalOverlay(e) {
  if (e.target === document.getElementById('reject-modal')) closeRejectModal();
}

// ── Receipt modal ─────────────────────────────────────────────────
function openReceiptModal(url) {
  const modal = document.getElementById('receipt-modal');
  const img   = document.getElementById('receipt-modal-img');
  if (!modal || !img || !url) return;
  img.src      = url;
  modal.hidden = false;
}

function closeReceiptModal() {
  const modal = document.getElementById('receipt-modal');
  if (modal) modal.hidden = true;
  const img = document.getElementById('receipt-modal-img');
  if (img) img.src = '';
}

// ── Pending badge ─────────────────────────────────────────────────
async function _loadPendingCount() {
  try {
    const { count } = await _sb
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    _updatePendingBadge(count ?? 0);
  } catch (_) {}
}

function _updatePendingBadge(count) {
  const navEl  = document.getElementById('pending-count');
  const statEl = document.getElementById('stat-pending-count');

  if (navEl) {
    navEl.textContent = count > 99 ? '99+' : String(count);
    navEl.classList.toggle('hidden', count <= 0);
  }
  if (statEl) statEl.textContent = count;
}


// ================================================================
//  CHATS — TELEGRAM USLUBI
// ================================================================
async function loadChatUsers() {
  const list = document.getElementById('chat-user-list');
  if (!list) return;

  list.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    // Oxirgi 500 xabar — keyinroq user bo'yicha guruhlanadi
    const { data: msgs, error } = await _sb
      .from('messages')
      .select('user_id, content, sender, type, created_at, is_read, profiles(username, tier)')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    // Har user uchun faqat oxirgi xabar + unread count
    const byUser   = new Map();
    const unreadCnt = new Map();

    (msgs || []).forEach(m => {
      if (!byUser.has(m.user_id)) byUser.set(m.user_id, m);
      if (m.sender !== 'admin' && !m.is_read) {
        unreadCnt.set(m.user_id, (unreadCnt.get(m.user_id) || 0) + 1);
      }
    });

    _chatUsersCache = Array.from(byUser.values()).map(m => ({
      userId  : m.user_id,
      username: m.profiles?.username || '—',
      tier    : m.profiles?.tier     || 'free',
      preview : m.type === 'image' ? '📎 Chek rasmi' : (m.content || '').slice(0, 60),
      time    : m.created_at,
      unread  : unreadCnt.get(m.user_id) || 0,
    }));

    _renderChatUserList(_chatUsersCache);

    const total = _chatUsersCache.reduce((sum, u) => sum + u.unread, 0);
    _updateChatUnreadBadge(total);

  } catch (e) {
    console.error('[admin] loadChatUsers:', e);
    list.innerHTML = '<div style="padding:32px;text-align:center"><p class="text-muted" style="font-size:12px">Xatolik yuz berdi</p></div>';
  }
}

function _renderChatUserList(users) {
  const list = document.getElementById('chat-user-list');
  if (!list) return;

  if (!users?.length) {
    list.innerHTML = '<div style="padding:40px 16px;text-align:center"><p class="text-muted" style="font-size:12px">Hozircha chat yo\'q</p></div>';
    return;
  }

  list.innerHTML = users.map(u => {
    const initial   = (u.username || '?')[0].toUpperCase();
    const isActive  = _activeChat?.userId === u.userId;
    const hasUnread = u.unread > 0;

    return `
      <div
        class="chat-user-item ${isActive ? 'active' : ''} ${hasUnread ? 'has-unread' : ''}"
        data-uid="${u.userId}"
        role="button"
        tabindex="0"
        onclick="openUserChat('${u.userId}','${_esc(u.username)}','${u.tier}')"
        onkeydown="if(event.key==='Enter')openUserChat('${u.userId}','${_esc(u.username)}','${u.tier}')"
        aria-label="${_esc(u.username)} bilan chat"
      >
        <div class="chat-user-item-avatar">${_esc(initial)}</div>
        <div class="chat-user-item-body">
          <div class="chat-user-item-name">${_esc(u.username)}</div>
          <div class="chat-user-item-preview">${_esc(u.preview)}</div>
        </div>
        <div class="chat-user-item-meta">
          <span class="chat-user-item-time">${_timeAgo(u.time)}</span>
          ${hasUnread ? `<span class="chat-user-unread">${u.unread > 9 ? '9+' : u.unread}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function filterChatUsers(query) {
  const q        = (query || '').toLowerCase().trim();
  const filtered = q
    ? _chatUsersCache.filter(u => u.username.toLowerCase().includes(q))
    : _chatUsersCache;
  _renderChatUserList(filtered);
}


// ── Chat view ─────────────────────────────────────────────────────
async function openUserChat(userId, username, tier) {
  // Avvalgi realtime'ni uzib qo'yish
  if (_adminChatSub) {
    await _sb.removeChannel(_adminChatSub);
    _adminChatSub = null;
  }

  _activeChat = { userId, username, tier };

  // Empty → Active
  document.getElementById('admin-chat-empty')?.classList.add('hidden');
  document.getElementById('admin-chat-active')?.classList.remove('hidden');

  // List'da active belgilash
  document.querySelectorAll('.chat-user-item').forEach(el => {
    el.classList.toggle('active', el.dataset.uid === userId);
  });

  // Header render
  _renderChatViewHeader(userId, username, tier);

  // Xabarlar loading
  const msgsEl = document.getElementById('admin-chat-messages');
  if (msgsEl) {
    msgsEl.innerHTML = '<div class="loading-state" style="padding:32px 0"><div class="spinner spinner-sm"></div></div>';
  }

  try {
    const { data: messages, error } = await _sb
      .from('messages')
      .select('id, sender, content, type, file_url, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(80);

    if (error) throw error;

    if (msgsEl) msgsEl.innerHTML = '';
    (messages || []).forEach(m => {
      const el = _buildAdminMsgEl(m);
      if (el) msgsEl?.appendChild(el);
    });

    // Pastga scroll
    if (msgsEl) msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: 'instant' });

    // O'qilgan + realtime
    await markChatRead(userId);
    _subscribeAdminChat(userId);

    // List'dagi unread ni tozalash
    const item = document.querySelector(`.chat-user-item[data-uid="${userId}"]`);
    if (item) {
      item.classList.remove('has-unread');
      item.querySelector('.chat-user-unread')?.remove();
    }

    document.getElementById('admin-msg-input')?.focus();

  } catch (e) {
    console.error('[admin] openUserChat:', e);
    if (msgsEl) msgsEl.innerHTML = '<div style="padding:32px;text-align:center"><p class="text-muted">Xatolik yuz berdi</p></div>';
  }
}

function _renderChatViewHeader(userId, username, tier) {
  const hdr = document.getElementById('admin-chat-view-hdr');
  if (!hdr) return;

  hdr.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-3)">
      <div class="chat-user-item-avatar"
        style="width:40px;height:40px;font-size:15px;flex-shrink:0"
      >${_esc((username || '?')[0].toUpperCase())}</div>
      <div>
        <div style="font-weight:700;font-size:14px;color:var(--text-bright)">${_esc(username)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${_tierBadge(tier)}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:var(--space-2)">
      <button
        class="btn btn-ghost btn-sm"
        onclick="openUserChatFromUsers('${userId}','${tier}','${_esc(username)}')"
        style="font-size:11px"
        title="Foydalanuvchi profili"
      >👤 Profil</button>
    </div>
  `;
}


// ── Xabar elementi ────────────────────────────────────────────────
function _buildAdminMsgEl(msg) {
  if (!msg) return null;

  const sender = msg.sender || 'user'; // user | ai | admin
  const time   = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
    : '';

  const wrap = document.createElement('div');
  wrap.className = `admin-msg msg-${sender}`;

  // Admin label (qizil)
  if (sender === 'admin') {
    const lbl = document.createElement('div');
    lbl.className   = 'admin-msg-label';
    lbl.textContent = 'ADMIN';
    wrap.appendChild(lbl);
  }

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'admin-msg-bubble';

  if (msg.type === 'image' && msg.file_url) {
    bubble.innerHTML = `
      <div class="admin-msg-image"
        onclick="openReceiptModal('${_esc(msg.file_url)}')"
        style="cursor:pointer"
        title="Kattalashtirish"
      >
        <img src="${_esc(msg.file_url)}" alt="Chek rasmi" loading="lazy">
      </div>
    `;
  } else {
    bubble.innerHTML = _md(msg.content || '');
  }
  wrap.appendChild(bubble);

  // Vaqt
  if (time) {
    const timeEl = document.createElement('div');
    timeEl.className   = 'admin-msg-time';
    timeEl.textContent = time;
    wrap.appendChild(timeEl);
  }

  return wrap;
}


// ── Realtime subscription ─────────────────────────────────────────
function _subscribeAdminChat(userId) {
  _adminChatSub = _sb
    .channel('admin_chat_' + userId)
    .on(
      'postgres_changes',
      {
        event : 'INSERT',
        schema: 'public',
        table : 'messages',
        filter: 'user_id=eq.' + userId,
      },
      payload => {
        const msg = payload.new;

        // Admin o'zi yuborganini qayta render qilmaymiz
        if (msg.sender === 'admin') return;

        const msgsEl = document.getElementById('admin-chat-messages');
        if (!msgsEl) return;

        const el = _buildAdminMsgEl(msg);
        if (!el) return;

        msgsEl.appendChild(el);
        msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: 'smooth' });

        // O'qilgan belgilash
        markChatRead(userId);

        // Chat list yangilash (background)
        loadChatUsers();
      }
    )
    .subscribe();
}


// ── Xabar yuborish ────────────────────────────────────────────────
function sendAdminMessageFromInput() {
  const input = document.getElementById('admin-msg-input');
  const text  = (input?.value || '').trim();
  if (!text || !_activeChat) return;
  input.value = '';
  input.focus();
  sendAdminMessage(_activeChat.userId, text);
}

async function sendAdminMessage(userId, text) {
  if (!text || !userId) return;

  // Optimistik render
  const msgsEl = document.getElementById('admin-chat-messages');
  const tempEl = _buildAdminMsgEl({
    sender    : 'admin',
    content   : text,
    type      : 'text',
    created_at: new Date().toISOString(),
  });
  if (tempEl && msgsEl) {
    msgsEl.appendChild(tempEl);
    msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: 'smooth' });
  }

  try {
    const { error } = await _sb.from('messages').insert({
      user_id : userId,
      sender  : 'admin',
      content : text,
      type    : 'text',
      is_read : false,
    });
    if (error) throw error;

    // Chat list yangilash (background)
    loadChatUsers();

  } catch (e) {
    console.error('[admin] sendAdminMessage:', e);
    if (tempEl) tempEl.style.opacity = '0.5';
    showToast('Xabar yuborilmadi', 'error', '❌');
  }
}

async function markChatRead(userId) {
  if (!userId) return;
  try {
    await _sb.from('messages')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .neq('sender', 'admin');
  } catch (_) {}
}

async function _loadUnreadChatCount() {
  try {
    const { count } = await _sb
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .neq('sender', 'admin');
    _updateChatUnreadBadge(count ?? 0);
  } catch (_) {}
}

function _updateChatUnreadBadge(count) {
  ['chat-unread-count', 'chat-panel-unread'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count > 99 ? '99+' : String(count);
    el.classList.toggle('hidden', count <= 0);
  });
}


// ================================================================
//  CONFIRM MODAL
// ================================================================
function confirmAction(
  msg,
  yesCb,
  icon     = '⚠️',
  yesLabel = 'Tasdiqlash',
  yesClass = 'btn-danger'
) {
  _confirmYesCb = yesCb;

  const iconEl = document.getElementById('confirm-icon');
  const msgEl  = document.getElementById('confirm-msg');
  const yesBtn = document.getElementById('confirm-yes-btn');
  const modal  = document.getElementById('confirm-modal');

  if (iconEl) iconEl.textContent = icon;
  if (msgEl)  msgEl.textContent  = msg;
  if (yesBtn) {
    yesBtn.textContent = yesLabel;
    yesBtn.className   = 'btn flex-1 ' + yesClass;
  }
  if (modal) modal.hidden = false;
}

function _confirmYes() {
  document.getElementById('confirm-modal').hidden = true;
  if (typeof _confirmYesCb === 'function') {
    const cb = _confirmYesCb;
    _confirmYesCb = null;
    cb();
  }
}

function _confirmNo() {
  document.getElementById('confirm-modal').hidden = true;
  _confirmYesCb = null;
}


// ================================================================
//  TOAST
// ================================================================
function showToast(message, type = 'info', icon = 'ℹ️', duration = 4200) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icon}</span>
    <span class="toast-msg">${_esc(message)}</span>
    <button class="toast-close" aria-label="Yopish" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.cssText += 'opacity:0;transform:translateX(110%);transition:all .3s ease';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}


// ================================================================
//  KEYBOARD
// ================================================================
function _bindKeyboard() {
  document.addEventListener('keydown', e => {
    // Enter → admin xabar yuborish
    if (e.key === 'Enter' && !e.shiftKey) {
      const inp = document.getElementById('admin-msg-input');
      if (inp && document.activeElement === inp) {
        e.preventDefault();
        sendAdminMessageFromInput();
      }
    }

    // Escape → modal yopish (priority tartibida)
    if (e.key === 'Escape') {
      const tierM    = document.getElementById('tier-modal');
      const rejectM  = document.getElementById('reject-modal');
      const receiptM = document.getElementById('receipt-modal');
      const confirmM = document.getElementById('confirm-modal');
      const userMenu = document.getElementById('admin-user-menu');

      if (tierM    && !tierM.hidden)    return closeTierModal();
      if (rejectM  && !rejectM.hidden)  return closeRejectModal();
      if (receiptM && !receiptM.hidden) return closeReceiptModal();
      if (confirmM && !confirmM.hidden) return _confirmNo();
      if (userMenu && !userMenu.hidden) {
        userMenu.hidden = true;
        document.getElementById('admin-avatar')?.setAttribute('aria-expanded', 'false');
      }
    }
  });
}


// ================================================================
//  UTILITIES
// ================================================================
function _timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s    = Math.floor(diff / 1000);
  if (s < 60)     return 'Hozir';
  if (s < 3600)   return Math.floor(s / 60) + ' daq. oldin';
  if (s < 86400)  return Math.floor(s / 3600) + ' soat oldin';
  if (s < 604800) return Math.floor(s / 86400) + ' kun oldin';
  return new Date(dateStr).toLocaleDateString('uz-UZ');
}

function _formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function _nowTime() {
  return new Date().toLocaleTimeString('uz-UZ', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function _tierBadge(tier) {
  const t = (tier || 'free').toLowerCase();
  return `<span class="tier-badge ${t}">${t.toUpperCase()}</span>`;
}

// escapeHtml — global (app.js ham ishlatishi mumkin)
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Qisqa alias (ichki ishlatish)
const _esc = escapeHtml;

// Oddiy Markdown → HTML (chat bubble uchun)
function _md(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`([^`]+)`/g,
      '<code style="font-family:var(--font-mono);font-size:11px;' +
      'background:var(--bg-void);color:var(--orange-light);' +
      'padding:1px 5px;border-radius:3px">$1</code>'
    )
    .replace(/\n/g, '<br>');
}

// Tugma loading holati
function _btnLoad(btn, isLoading, label) {
  if (!btn) return;
  btn.disabled    = isLoading;
  btn.textContent = label;
}