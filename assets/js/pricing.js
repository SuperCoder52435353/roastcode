// ================================================================
//  RoastCode — pricing.js
//  Tariflar sahifasi: modal, karta, tier highlight, redirect
// ================================================================
'use strict';

// ── Globals ──────────────────────────────────────────────────
let _sb          = null;
let _userTier    = null;
let _pendingTier = null;
let _cardFlipped = false;

// ── DOM tayyor ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Supabase init
  _sb = supabase.createClient(RC_CONFIG.supabase.url, RC_CONFIG.supabase.anonKey);

  // Session tekshirish (login bo'lmasa ham pricing ko'rish mumkin)
  await _loadCurrentTier();

  // Karta flip: kartaga bosish
  document.getElementById('pay-card-3d')
    ?.addEventListener('click', flipCard);

  // ESC bilan yopish
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePayModal();
  });
});


// ================================================================
//  CURRENT TIER YUKLASH
// ================================================================
async function _loadCurrentTier() {
  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session?.user) return;

    const { data: profile } = await _sb
      .from('profiles')
      .select('tier')
      .eq('id', session.user.id)
      .single();

    _userTier = profile?.tier ?? 'free';
    _highlightCurrentTier(_userTier);

  } catch (_e) {
    // Login qilinmagan — hech narsa qilmaymiz
  }
}

function _highlightCurrentTier(tier) {
  if (!tier) return;

  // Tegishli kartani toping va "Joriy tarif" belgisi qo'ying
  const btn = document.querySelector(`.p-card-btn[data-tier="${tier}"]`);
  if (btn) {
    btn.textContent = '✓ Joriy tarif';
    btn.className   = 'p-card-btn p-card-btn--current';
    btn.disabled    = true;
  }
}


// ================================================================
//  MODAL OCHISH
// ================================================================
function openPayModal(tier) {
  if (!tier || tier === 'free') return;

  _pendingTier = tier;

  const tierCfg = RC_CONFIG.tiers[tier];
  if (!tierCfg) return;

  // Header: tier nomi
  const el = document.getElementById('pm-tier-name');
  if (el) el.textContent = tierCfg.name + ' tarifini sotib olish';

  // Amount
  const usdEl = document.getElementById('pm-amount-usd');
  const somEl = document.getElementById('pm-amount-som');
  if (usdEl) usdEl.textContent = '$' + tierCfg.price_usd;
  if (somEl) somEl.textContent = tierCfg.price_som.toLocaleString('ru-RU') + ' so\'m';

  // Step 2 matn
  const step2Sub = document.getElementById('pm-step2-sub');
  if (step2Sub) {
    step2Sub.innerHTML =
      'Chek rasmini <strong>chat orqali</strong> yuboring.<br>' +
      'Admin <strong>24 soat ichida</strong> ' + tierCfg.name + ' tarifini faollashtiradi.';
  }

  // Step 1 ko'rsatish, step 2 yashirish
  _goToStep(1);

  // Karta flipni reset
  _cardFlipped = false;
  const card3d = document.getElementById('pay-card-3d');
  if (card3d) card3d.classList.remove('flipped');

  // localStorage ga saqlash (chatga o'tganda pending ko'rsatish uchun)
  localStorage.setItem('rc_pending_tier', tier);

  // Modal ochish
  const overlay = document.getElementById('pay-modal-overlay');
  if (!overlay) return;
  overlay.removeAttribute('hidden');
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.body.style.overflow = 'hidden';
}


// ================================================================
//  MODAL YOPISH
// ================================================================
function closePayModal() {
  const overlay = document.getElementById('pay-modal-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;

  overlay.classList.remove('open');
  overlay.addEventListener('transitionend', () => {
    overlay.setAttribute('hidden', '');
  }, { once: true });

  document.body.style.overflow = '';
  _pendingTier = null;
}

// Overlay ga bosish (modal tashqarisiga)
function handlePayOverlayClick(e) {
  const modal = document.getElementById('pay-modal');
  if (modal && !modal.contains(e.target)) {
    closePayModal();
  }
}


// ================================================================
//  KARTA FLIP
// ================================================================
function flipCard() {
  const card3d = document.getElementById('pay-card-3d');
  if (!card3d) return;

  _cardFlipped = !_cardFlipped;
  card3d.classList.toggle('flipped', _cardFlipped);
}


// ================================================================
//  KARTA RAQAMI NUSXA OLISH
// ================================================================
async function copyCard() {
  const cardNum = RC_CONFIG.payment.card;
  const btn     = document.getElementById('pay-copy-btn');

  try {
    await navigator.clipboard.writeText(cardNum);

    if (btn) {
      const origHTML = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="20 6 9 17 4 12"/></svg>' +
        '<span>Nusxalandi!</span>';

      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = origHTML;
      }, 2400);
    }

    _showPricingToast('Karta raqami nusxalandi', 'success', '✅');

  } catch (_e) {
    _showPricingToast('Nusxalash xatosi', 'error', '⚠️');
  }
}


// ================================================================
//  STEPS
// ================================================================
function _goToStep(step) {
  const step1 = document.getElementById('pay-step-1');
  const step2 = document.getElementById('pay-step-2');
  const dot1  = document.getElementById('step-dot-1');
  const dot2  = document.getElementById('step-dot-2');
  const line  = document.getElementById('step-line');

  if (!step1 || !step2) return;

  if (step === 1) {
    step1.classList.remove('hidden');
    step2.classList.add('hidden');
    if (dot1) { dot1.classList.add('active'); dot1.classList.remove('done'); }
    if (dot2) { dot2.classList.remove('active', 'done'); }
    if (line) line.classList.remove('done');
  } else {
    // Step 2 animation
    step1.classList.add('hidden');
    step2.classList.remove('hidden');
    if (dot1) { dot1.classList.remove('active'); dot1.classList.add('done'); }
    if (dot2) { dot2.classList.add('active'); }
    if (line) line.classList.add('done');

    // Step 2 ga o'tayotganda karta orqasini ko'rsatish
    const card3d = document.getElementById('pay-card-3d');
    if (card3d && !_cardFlipped) {
      card3d.classList.add('flipped');
      _cardFlipped = true;
    }
  }
}

// "To'lov qildim" tugmasi
function showStep2() {
  _goToStep(2);
}


// ================================================================
//  CHATGA O'TISH
// ================================================================
function goToChat() {
  // pending_tier localStorage da saqlangan
  // app.html?chat=open — chat sidebar avtomatik ochiladi
  window.location.href = RC_CONFIG.app.pages.app + '?chat=open';
}


// ================================================================
//  TOAST (pricing sahifasi uchun)
// ================================================================
function _showPricingToast(msg, type, icon) {
  type = type || 'info';
  icon = icon || 'ℹ️';

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

  const timer = setTimeout(remove, 3200);
  toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}