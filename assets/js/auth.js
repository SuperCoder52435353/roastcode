// ================================================================
//  RoastCode — auth.js
//  Login / Register mantiq, Supabase auth, particles, tilt
// ================================================================
'use strict';

// ── Supabase client ──────────────────────────────────────────
let _sb;

// ── Holat ────────────────────────────────────────────────────
let currentTab  = 'login';
let loadingType = null;

// ── DOM tayyor ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // Supabase init
  _sb = supabase.createClient(RC_CONFIG.supabase.url, RC_CONFIG.supabase.anonKey);

  // Particles
  initParticles();

  // Slider init (render qilinganidan keyin o'lchash uchun rAF)
  requestAnimationFrame(initSlider);

  // Resize
  window.addEventListener('resize', debounce(initSlider, 120));

  // Keyboard shortcuts
  setupKeyboard();

  // Remember me email
  checkRemembered();

  // Mavjud session → redirect
  await checkSession();

  // Card tilt (faqat desktop)
  if (!('ontouchstart' in window)) initCardTilt();
});


// ================================================================
//  SESSION CHECK
// ================================================================
async function checkSession() {
  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (session?.user) {
      await redirectAfterLogin(session.user);
    }
  } catch (e) {
    console.warn('[auth] Session check failed:', e.message);
  }
}


// ================================================================
//  TAB ALMASHTIRISH
// ================================================================
function switchTab(tab) {
  if (tab === currentTab) return;

  const outForm = document.getElementById(`form-${currentTab}`);
  const inForm  = document.getElementById(`form-${tab}`);
  const outBtn  = document.getElementById(`tab-${currentTab}`);
  const inBtn   = document.getElementById(`tab-${tab}`);

  if (!outForm || !inForm || !outBtn || !inBtn) {
    console.error('[auth] Form elements not found for tab:', tab);
    return;
  }

  // ── AVVAL currentTab yangilash (keyingi bosishlarda to'g'ri bo'lish uchun) ──
  const prevTab = currentTab;
  currentTab = tab;

  // Tab tugmalar
  outBtn.classList.remove('active');
  outBtn.setAttribute('aria-selected', 'false');
  inBtn.classList.add('active');
  inBtn.setAttribute('aria-selected', 'true');

  // Slider siljitish
  moveSlider(inBtn);

  // Sarlavha yangilash
  const texts = {
    login:    { title: 'Xush kelibsiz 👋',       sub: 'Hisobingizga kiring' },
    register: { title: 'Yangi hisob yarating 🚀', sub: 'Bepul boshlang' }
  };
  document.getElementById('auth-title').textContent = texts[tab].title;
  document.getElementById('auth-sub').textContent   = texts[tab].sub;

  // Xatolarni tozalash (eski tab uchun)
  clearFormErrors(prevTab);

  // ── ANIMATSIYA LOGIC ──
  // Eski form-ni TEZDA yashirish (animatsiyasiz)
  outForm.classList.add('hidden');
  outForm.classList.remove('form-exiting', 'form-entering');

  // Yangi form-ni ko'rsatish (animatsiya bilan)
  inForm.classList.remove('hidden', 'form-exiting', 'form-entering');
  inForm.offsetHeight; // reflow (force repaint)
  inForm.classList.add('form-entering');

  // Animatsiya tugaganda class olib tashlash
  setTimeout(() => {
    inForm.classList.remove('form-entering');
  }, 250);

  // Birinchi input-ga focus
  requestAnimationFrame(() => {
    const firstInput = inForm.querySelector('input');
    if (firstInput) firstInput.focus();
  });
}

// ── Slider pozitsiyasini hisoblash ────────────────────────────
function initSlider() {
  const activeBtn = document.querySelector('.auth-tab.active');
  if (!activeBtn) return;
  moveSlider(activeBtn);
}

function moveSlider(tabBtn) {
  const slider    = document.getElementById('tab-slider');
  const tabsEl    = document.getElementById('auth-tabs');
  
  // ← NULL CHECK: agar elements topilmasa, qayt
  if (!slider || !tabsEl || !tabBtn) {
    console.warn('[auth] Slider elements not found:', { slider, tabsEl, tabBtn });
    return;
  }

  const tabsRect  = tabsEl.getBoundingClientRect();
  const btnRect   = tabBtn.getBoundingClientRect();

  const offset = btnRect.left - tabsRect.left;
  slider.style.width     = btnRect.width + 'px';
  slider.style.transform = `translateX(${offset}px)`;
}


// ================================================================
//  LOGIN
// ================================================================
async function handleLogin() {
  if (loadingType) return;

  clearFormErrors('login');

  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;

  // Validatsiya
  let hasErr = false;

  if (!email) {
    showFieldError('err-login-email', 'Email kiritish shart');
    hasErr = true;
  } else if (!isValidEmail(email)) {
    showFieldError('err-login-email', 'Email manzil noto\'g\'ri formatda');
    hasErr = true;
  }

  if (!pass) {
    showFieldError('err-login-pass', 'Parol kiritish shart');
    hasErr = true;
  } else if (pass.length < 6) {
    showFieldError('err-login-pass', 'Parol kamida 6 ta belgi bo\'lishi kerak');
    hasErr = true;
  }

  if (hasErr) return;

  setLoading('login', true);

  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password: pass });

    if (error) throw error;

    // Remember me
    const rememberEl = document.getElementById('remember-me');
    if (rememberEl?.checked) {
      localStorage.setItem('rc_email', email);
    } else {
      localStorage.removeItem('rc_email');
    }

    showToast('Muvaffaqiyatli kirildi!', 'success', '✅');
    await redirectAfterLogin(data.user);

  } catch (err) {
    const msg = translateError(err);
    showGlobalError('login', msg);
    shakeCard();
  } finally {
    setLoading('login', false);
  }
}


// ================================================================
//  REGISTER
// ================================================================
async function handleRegister() {
  if (loadingType) return;

  clearFormErrors('register');

  const name     = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim().toLowerCase();
  const email    = document.getElementById('reg-email').value.trim();
  const pass     = document.getElementById('reg-pass').value;

  // Validatsiya
  let hasErr = false;

  if (!name || name.length < 2) {
    showFieldError('err-reg-name', 'To\'liq ism kamida 2 ta harf');
    hasErr = true;
  }

  if (!username || username.length < 3) {
    showFieldError('err-reg-username', 'Username kamida 3 ta belgi');
    hasErr = true;
  } else if (!/^[a-z0-9_]+$/.test(username)) {
    showFieldError('err-reg-username', 'Faqat lotin harf, raqam va _ (pastki chiziq)');
    hasErr = true;
  }

  if (!email) {
    showFieldError('err-reg-email', 'Email kiritish shart');
    hasErr = true;
  } else if (!isValidEmail(email)) {
    showFieldError('err-reg-email', 'Email manzil noto\'g\'ri formatda');
    hasErr = true;
  }

  const passStrength = getPasswordStrength(pass);
  if (!pass || pass.length < 8) {
    showFieldError('err-reg-pass', 'Parol kamida 8 ta belgi bo\'lishi kerak');
    hasErr = true;
  } else if (passStrength.level < 2) {
    showFieldError('err-reg-pass', 'Parol zaif — harf va raqam qo\'shing');
    hasErr = true;
  }

  if (hasErr) return;

  setLoading('register', true);

  try {
    const { data, error } = await _sb.auth.signUp({
      email,
      password: pass,
      options: {
        data: { full_name: name, username }
      }
    });

    if (error) throw error;

    // Agar email tasdiqlanmasin deb sozlangan bo'lsa → session bor
    if (data.session) {
      showToast('Hisob yaratildi!', 'success', '🎉');
      await redirectAfterLogin(data.user);
    } else {
      // Email tasdiqlanishi kerak
      showToast('Email pochtangizni tekshiring va tasdiqlang', 'info', '📧');
      setTimeout(() => switchTab('login'), 1500);
    }

  } catch (err) {
    const msg = translateError(err);
    showGlobalError('register', msg);
    shakeCard();
  } finally {
    setLoading('register', false);
  }
}


// ================================================================
//  REDIRECT
// ================================================================
async function redirectAfterLogin(user) {
  if (!user) return;

  try {
    const { data: profile, error } = await _sb
      .from('profiles')
      .select('tier, is_banned, username')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = row not found — yangi foydalanuvchi (profile trigger orqali yaratilaidi)
      console.warn('[auth] Profile fetch error:', error.message);
    }

    // Ban tekshiruv
    if (profile?.is_banned) {
      await _sb.auth.signOut();
      showGlobalError('login', 'Sizning hisobingiz bloklangan. Admin bilan bog\'laning.');
      return;
    }

    // Redirect
    const dest = profile?.tier === 'admin' ? 'admin.html' : 'app.html';
    window.location.href = dest;

  } catch (e) {
    // Profile jadval hali yo'q bo'lishi mumkin (faza 1 deploy qilinmagan)
    console.error('[auth] Redirect error:', e.message);
    window.location.href = 'app.html';
  }
}


// ================================================================
//  PAROLNI KO'RSATISH / YASHIRISH
// ================================================================
function togglePass(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input || !btn) return;

  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';

  const showIcon = btn.querySelector('.eye-show');
  const hideIcon = btn.querySelector('.eye-hide');
  if (showIcon) showIcon.style.display = isHidden ? 'none'  : '';
  if (hideIcon) hideIcon.style.display = isHidden ? ''      : 'none';

  btn.setAttribute('aria-label', isHidden ? 'Parolni yashirish' : 'Parolni ko\'rsatish');
}


// ================================================================
//  PAROL KUCHLILIK
// ================================================================
function onPasswordInput(val) {
  const strengthEl  = document.getElementById('pass-strength');
  const fillEl      = document.getElementById('pass-strength-fill');
  const labelEl     = document.getElementById('pass-strength-label');

  if (!val) {
    strengthEl.hidden = true;
    return;
  }

  strengthEl.hidden = false;
  const { level, label } = getPasswordStrength(val);

  fillEl.setAttribute('data-level', level);
  labelEl.setAttribute('data-level', level);
  labelEl.textContent = label;
}

function getPasswordStrength(pass) {
  if (!pass) return { level: 0, label: '' };

  let score = 0;
  if (pass.length >= 8)  score++;
  if (pass.length >= 12) score++;
  if (/[A-Za-z]/.test(pass) && /[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  const levels = [
    { level: 1, label: 'Zaif' },
    { level: 2, label: 'O\'rtacha' },
    { level: 3, label: 'Yaxshi' },
    { level: 4, label: 'Kuchli 💪' },
  ];

  const idx = Math.min(score, 4) - 1;
  return idx >= 0 ? levels[idx] : { level: 1, label: 'Zaif' };
}


// ================================================================
//  REMEMBER ME
// ================================================================
function checkRemembered() {
  const saved = localStorage.getItem('rc_email');
  if (saved) {
    const emailInput = document.getElementById('login-email');
    const rememberEl = document.getElementById('remember-me');
    if (emailInput) emailInput.value = saved;
    if (rememberEl) rememberEl.checked = true;
    // Parol inputga focus
    requestAnimationFrame(() => {
      document.getElementById('login-pass')?.focus();
    });
  }
}


// ================================================================
//  LOADING HOLATI
// ================================================================
function setLoading(type, bool) {
  loadingType = bool ? type : null;

  const btn     = document.getElementById(`${type === 'login' ? 'login' : 'register'}-btn`);
  const labelEl = btn?.querySelector('.btn-label');
  const spinEl  = btn?.querySelector('.btn-spin');

  if (!btn) return;

  btn.disabled = bool;
  btn.classList.toggle('loading', bool);
  if (labelEl) labelEl.style.opacity = bool ? '0' : '';
  if (spinEl)  spinEl.classList.toggle('hidden', !bool);
}


// ================================================================
//  XATO KO'RSATISH
// ================================================================
function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;

  // Input ni ham belgilash
  const inputId = id.replace('err-', '').replace(/-\w+$/, match => match);
  // Topish uchun: err-login-email → login-email
  const parts   = id.split('-');
  const inputEl = document.getElementById(parts.slice(1).join('-'));
  inputEl?.classList.add('err');
}

function showGlobalError(formPrefix, msg) {
  const el = document.getElementById(`err-${formPrefix}-global`);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearFormErrors(formPrefix) {
  // Field errors
  document.querySelectorAll(`#form-${formPrefix} .field-error`).forEach(el => {
    el.textContent = '';
    el.hidden = true;
  });

  // Global error
  const globalEl = document.getElementById(`err-${formPrefix}-global`);
  if (globalEl) {
    globalEl.textContent = '';
    globalEl.hidden = true;
  }

  // Input classes
  document.querySelectorAll(`#form-${formPrefix} .input.err`).forEach(el => {
    el.classList.remove('err');
  });
}


// ================================================================
//  VALIDATSIYA
// ================================================================
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


// ================================================================
//  XATO TARJIMA
// ================================================================
function translateError(err) {
  const msg = err?.message?.toLowerCase() || '';

  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials'))
    return 'Email yoki parol noto\'g\'ri';
  if (msg.includes('email not confirmed'))
    return 'Emailni tasdiqlang. Pochtangizni tekshiring';
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'Bu email allaqachon ro\'yxatdan o\'tgan';
  if (msg.includes('password should be at least'))
    return 'Parol kamida 6 ta belgi bo\'lishi kerak';
  if (msg.includes('unable to validate email'))
    return 'Email manzil noto\'g\'ri';
  if (msg.includes('signup is disabled'))
    return 'Ro\'yxatdan o\'tish hozircha o\'chirilgan';
  if (msg.includes('too many requests') || msg.includes('rate limit'))
    return 'Juda ko\'p urinish. Biroz kuting';
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Internet aloqasi yo\'q. Qayta urinib ko\'ring';
  if (msg.includes('user not found'))
    return 'Bunday foydalanuvchi topilmadi';

  return 'Xato yuz berdi. Qayta urinib ko\'ring';
}


// ================================================================
//  TOAST
// ================================================================
function showToast(msg, type = 'info', icon = 'ℹ️') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-body">
      <div class="toast-msg">${msg}</div>
    </div>`;

  container.appendChild(toast);

  // 3 soniyadan keyin chiqarish
  const remove = () => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  const timer = setTimeout(remove, 3000);
  toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}


// ================================================================
//  KEYBOARD HANDLERS
// ================================================================
function setupKeyboard() {
  // Enter → submit
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const target = e.target;

    // currentTab dan foydalanish (hidden state'ga ishonmang)
    if (currentTab === 'login') {
      const formLogin = document.getElementById('form-login');
      if (formLogin && formLogin.contains(target)) {
        e.preventDefault();
        handleLogin();
      }
    } else if (currentTab === 'register') {
      const formRegister = document.getElementById('form-register');
      if (formRegister && formRegister.contains(target)) {
        e.preventDefault();
        handleRegister();
      }
    }
  });
}


// ================================================================
//  CARD TILT EFFECT (desktop only)
// ================================================================
function initCardTilt() {
  const card = document.getElementById('auth-card');
  if (!card) return;

  let tiltRAF = null;

  card.addEventListener('mousemove', e => {
    if (tiltRAF) cancelAnimationFrame(tiltRAF);
    tiltRAF = requestAnimationFrame(() => {
      const rect    = card.getBoundingClientRect();
      const cx      = rect.left + rect.width  / 2;
      const cy      = rect.top  + rect.height / 2;
      const dx      = (e.clientX - cx) / (rect.width  / 2);
      const dy      = (e.clientY - cy) / (rect.height / 2);
      const rotX    = -dy * 4;   // max ±4deg
      const rotY    =  dx * 4;
      card.style.transition = 'transform 0.08s linear, box-shadow 0.3s ease';
      card.style.transform  = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    });
  });

  card.addEventListener('mouseleave', () => {
    if (tiltRAF) cancelAnimationFrame(tiltRAF);
    card.style.transition = 'transform 0.6s var(--ease-out), box-shadow 0.3s ease';
    card.style.transform  = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  });
}

function shakeCard() {
  const card = document.getElementById('auth-card');
  if (!card) return;
  card.style.animation = 'none';
  card.offsetHeight; // reflow
  card.style.animation = 'shakeX 0.4s ease';
}


// ================================================================
//  PARTICLES
// ================================================================
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  let W, H, rafId;

  const COUNT    = 70;
  const CONN_DIST = 120;
  const COLORS   = [
    'rgba(255,107,53,',    // orange
    'rgba(79,142,247,',    // blue
    'rgba(139,92,246,',    // purple
  ];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticle() {
    const colorBase = COLORS[Math.floor(Math.random() * COLORS.length)];
    return {
      x  : Math.random() * W,
      y  : Math.random() * H,
      vx : (Math.random() - 0.5) * 0.35,
      vy : (Math.random() - 0.5) * 0.35,
      r  : Math.random() * 1.6 + 0.4,
      a  : Math.random() * 0.3 + 0.08,
      color: colorBase,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, createParticle);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);

    // Update + draw particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      // Bounce
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.a + ')';
      ctx.fill();
    });

    // Connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONN_DIST) {
          const alpha = (1 - dist / CONN_DIST) * 0.12;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(255,107,53,${alpha})`;
          ctx.lineWidth   = 0.7;
          ctx.stroke();
        }
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  // Resize + reinit
  window.addEventListener('resize', debounce(() => {
    resize();
    particles.forEach(p => {
      p.x = Math.min(p.x, W);
      p.y = Math.min(p.y, H);
    });
  }, 200));

  init();
}


// ================================================================
//  YORDAMCHILAR
// ================================================================
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}


// ================================================================
//  KARD SHAKE ANIMATSIYA (CSS dan)
// ================================================================
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shakeX {
    0%,100%{ transform: perspective(900px) translateX(0); }
    15%    { transform: perspective(900px) translateX(-7px); }
    30%    { transform: perspective(900px) translateX(6px); }
    45%    { transform: perspective(900px) translateX(-5px); }
    60%    { transform: perspective(900px) translateX(4px); }
    75%    { transform: perspective(900px) translateX(-3px); }
  }
`;
document.head.appendChild(shakeStyle);