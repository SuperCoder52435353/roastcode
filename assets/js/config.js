// ================================================================
//  RoastCode — Konfiguratsiya
//  ⚠️  Bu fayl browser ga yetkaziladi (public)
//  🚫  Gemini / Groq API keylar bu yerga YOZMANG
//      → ular faqat Supabase Edge Function secrets da
// ================================================================

'use strict';

const RC_CONFIG = {

  // ── Supabase (public, xavfsiz) ────────────────────────────
  supabase: {
    url:     'https://uqrnqqhxfwtzhdepaiao.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcm5xcWh4Znd0emhkZXBhaWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjUxNjAsImV4cCI6MjA5NTU0MTE2MH0.LxbCVXyolGz74O0jMZcxEPxpSkzEN9vRvhLYjVLNvVA',
  },

  // ── Edge Function URLlar ──────────────────────────────────
  functions: {
    aiRouter:    'https://uqrnqqhxfwtzhdepaiao.supabase.co/functions/v1/ai-router',
    chatSupport: 'https://uqrnqqhxfwtzhdepaiao.supabase.co/functions/v1/chat-support',
  },

  // ── Tariflar ──────────────────────────────────────────────
  tiers: {
    free: {
      key:            'free',
      name:           'Free',
      label:          'FREE',
      price_usd:       0,
      price_som:       0,
      price_display:  'Bepul',
      daily_requests:  20,
      max_lines:       100,
      colorVar:       '--text-muted',
    },
    pro: {
      key:            'pro',
      name:           'Pro',
      label:          'PRO',
      price_usd:       3,
      price_som:       36_000,
      price_display:  '$3 / 36 000 so\'m',
      daily_requests:  200,
      max_lines:       300,
      colorVar:       '--blue',
    },
    x: {
      key:            'x',
      name:           'X',
      label:          'X',
      price_usd:       49,
      price_som:       588_000,
      price_display:  '$49 / 588 000 so\'m',
      daily_requests:  1_000,
      max_lines:       500,
      colorVar:       '--orange',
    },
    team: {
      key:             'team',
      name:            'Team',
      label:           'TEAM',
      price_usd:        99,
      price_som:        1_120_000,
      price_display:   '$99 / 1 120 000 so\'m',
      daily_requests:   Infinity,
      max_lines:        Infinity,
      colorVar:        '--purple',
    },
    admin: {
      key:             'admin',
      name:            'Admin',
      label:           'ADMIN',
      price_usd:        0,
      price_som:        0,
      price_display:   '—',
      daily_requests:   Infinity,
      max_lines:        Infinity,
      colorVar:        '--admin-red',
    },
  },

  // ── To'lov ma'lumotlari ───────────────────────────────────
  payment: {
    card:      '5614 6818 1834 6037',
    cardMask:  '5614 **** **** 6037',     // ko'rsatish uchun
    holder:    'ABDURAXMON MAVLONOV',
    bank:      'Humo',
    bankLogo:  '🟣',
  },

  // ── AI chiqish limiti (max tokens per mode) ───────────────
  aiLimits: {
    roast: { maxOutputTokens: 500 },
    fix:   { maxOutputTokens: 800 },
    chat:  { maxOutputTokens: 300 },
    info:  { maxOutputTokens: 300 },
  },

  // ── Rate limit (client-side yumshoq tekshiruv) ───────────
  rate: {
    per_minute: 5,
    per_hour:   20,
  },

  // ── Kod qisqartirish (tier bo'yicha max qatorlar) ─────────
  truncation: {
    free:  100,
    pro:   300,
    x:     500,
    team:  Infinity,
    admin: Infinity,
  },

  // ── Cache ─────────────────────────────────────────────────
  cache: {
    enabled: true,
    // TTL (millisekund): 1 soat
    ttl: 60 * 60 * 1_000,
  },

  // ── Ilova ─────────────────────────────────────────────────
  app: {
    name:    'RoastCode',
    version: '1.0.0',
    // Sahifalar
    pages: {
      landing: 'index.html',
      login:   'login.html',
      app:     'app.html',
      pricing: 'pricing.html',
      admin:   'admin.html',
    },
  },

};

// Mutatsiyadan himoya
Object.freeze(RC_CONFIG);
Object.freeze(RC_CONFIG.supabase);
Object.freeze(RC_CONFIG.functions);
Object.freeze(RC_CONFIG.payment);
Object.freeze(RC_CONFIG.aiLimits);
Object.freeze(RC_CONFIG.rate);
Object.freeze(RC_CONFIG.truncation);
Object.freeze(RC_CONFIG.cache);
Object.freeze(RC_CONFIG.app);
Object.freeze(RC_CONFIG.app.pages);

// Qulaylik uchun qisqa alias
const TIERS    = RC_CONFIG.tiers;
const PAYMENT  = RC_CONFIG.payment;
const LIMITS   = RC_CONFIG.aiLimits;
const SUPABASE = RC_CONFIG.supabase;
const FN       = RC_CONFIG.functions;


// ── Yordamchi funksiyalar ─────────────────────────────────

/**
 * Tier konfiguratsiyasini olish
 * @param {string} tierKey  — 'free' | 'pro' | 'x' | 'team' | 'admin'
 * @returns {object}
 */
function getTierConfig(tierKey) {
  return RC_CONFIG.tiers[tierKey] ?? RC_CONFIG.tiers.free;
}

/**
 * Berilgan tier uchun max qatorlar
 * @param {string} tierKey
 * @returns {number}
 */
function getMaxLines(tierKey) {
  return RC_CONFIG.truncation[tierKey] ?? RC_CONFIG.truncation.free;
}

/**
 * Karta raqamini formatlash (ko'rsatish uchun)
 * @param {boolean} masked  — true bo'lsa yashirin
 * @returns {string}
 */
function getCardDisplay(masked = false) {
  return masked ? PAYMENT.cardMask : PAYMENT.card;
}

/**
 * Pul summasini formatlash
 * @param {number} som
 * @returns {string}  — '36 000 so\'m'
 */
function formatSom(som) {
  if (!isFinite(som)) return 'Cheksiz';
  return som.toLocaleString('ru-RU') + ' so\'m';
}

/**
 * So'rov sonini formatlash
 * @param {number} n
 * @returns {string}
 */
function formatRequests(n) {
  if (!isFinite(n)) return 'Cheksiz';
  return n.toLocaleString('ru-RU');
}