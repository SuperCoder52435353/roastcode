# 🚀 RoastCode — DEPLOYMET QOʻLLANMASI

**Sana:** 30.05.2026  
**Status:** Barcha Faza 1-11 ✅ Tayyor  
**Version:** 1.0.0

---

## 📋 TEZKOR BOSHLASH

### 1️⃣ **SUPABASE SQL SCHEMANI DEPLOY QILISH**

1. **Supabase Dashboard** ga kir: https://app.supabase.com
2. **Project** tanlang: **uqrnqqhxfwtzhdepaioa**
3. **SQL Editor** ochishi
4. `supabase/schema.sql` faylining kodi **TO'LIQINI** paste qil
5. **Run** tugmasini bosishi (yoki Ctrl+Enter)

✅ **Agar hecha xato bo'lmasa:** 7 ta jadval va RLS policylari o'rnatiladi

### 2️⃣ **ADMIN USER YARATISH**

1. **Supabase Dashboard** → **Authentication** → **Users** tab
2. **Add User** tugmasi
3. **Email:** `admin@roastcode.dev`
4. **Password:** O'zingiz tanlang (xavfsiz qilin!)
5. **Create user** tugmasi

6. **SQL Editor** dan quyidagi kodni ishlat:
```sql
INSERT INTO profiles (id, username, full_name, email, tier)
SELECT id, 'admin', 'Abduraxmon Mavlonov', 'admin@roastcode.dev', 'admin'
FROM auth.users WHERE email = 'admin@roastcode.dev';
```

✅ **Yakuniy bosqich:** Admin profili yaratildi

### 3️⃣ **API KEYLARNI O'RNATISH (Supabase Secrets)**

Terminal ochib, quyidagi buyruqni ishlat:

```bash
supabase secrets set \
  GEMINI_API_KEY="AIzaSyBsTU-jHG8vV4dm6QxyrIhvPkkiEd_3Lbs" \
  GROQ_API_KEY="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" \
  SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcm5xcWh4Znd0emhkZXBhaWFvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTk2NTE2MCwiZXhwIjoyMDk1NTQxMTYwfQ.N9XPVj4_mfLhvLb8866kXnC_rEcQ8xdIg9c1EkFFzJc" \
  --project-ref uqrnqqhxfwtzhdepaiao
```

✅ **Xabar:** "Secrets set successfully"

### 4️⃣ **EDGE FUNCTIONS NI DEPLOY QILISH**

Terminal dan:

```bash
# ai-router deploy
supabase functions deploy ai-router --project-ref uqrnqqhxfwtzhdepaiao

# chat-support deploy
supabase functions deploy chat-support --project-ref uqrnqqhxfwtzhdepaiao
```

✅ **Tekshirish:** Supabase Dashboard → Edge Functions → ikkala function ham ko'rinadi

### 5️⃣ **GITHUB GA PUSH QILISH**

Terminal dan (loyiha papkasida):

```bash
git init
git add .
git commit -m "Initial RoastCode v1.0.0 deployment — 2026"
git remote add origin https://github.com/SuperCoder52435353/roastcode
git push -u origin main
```

✅ **GitHub** repoda barcha fayllar ko'rinadi

### 6️⃣ **GITHUB PAGES NI SOZLASH**

1. **GitHub** → **Repository** → **Settings**
2. **Pages** tab → **Build and deployment**
3. **Branch** tanlang: `main` (yoki `master`)
4. **Save** tugmasi

✅ **URL:** `https://SuperCoder52435353.github.io/roastcode/`

---

## 📊 TEXHNOLOGIYALAR VA CREDENTIALLAR

| Xususiyat | Qiymat |
|-----------|--------|
| **Supabase URL** | `https://uqrnqqhxfwtzhdepaiao.supabase.co` |
| **Project ID** | `uqrnqqhxfwtzhdepaiao` |
| **Region** | `ap-southeast-2` |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcm5xcWh4Znd0emhkZXBhaWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjUxNjAsImV4cCI6MjA5NTU0MTE2MH0.LxbCVXyolGz74O0jMZcxEPxpSkzEN9vRvhLYjVLNvVA` |
| **Gemini API Key** | `AIzaSyBsTU-jHG8vV4dm6QxyrIhvPkkiEd_3Lbs` |
| **Groq API Key** | `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` |
| **Admin Email** | `admin@roastcode.dev` |
| **Karta** | `5614 6818 1834 6037 (ABDURAXMON MAVLONOV, Humo)` |

---

## 🔐 TARIFLAR VA LIMITLAR

| Tarif | Narx | So'rov/kun | Max qator | Model |
|-------|------|-----------|----------|-------|
| **Free** | Bepul | 20 | 100 | Groq |
| **Pro** | $3 (36,000 so'm) | 200 | 300 | Gemini Flash |
| **X** | $49 (588,000 so'm) | 1,000 | 500 | Gemini Flash |
| **Team** | $99 (1,120,000 so'm) | Cheksiz | Cheksiz | Gemini Flash |
| **Admin** | — | Cheksiz | Cheksiz | Barcha |

---

## ✅ TEKSHIRUV RO'YXATI

Deploymentdan so'ng, quyidagilarni tekshirish:

### Landing Page (index.html)
- [ ] Sahifa yuklanadi
- [ ] "Boshlash" tugmasi app.html ga ketadi
- [ ] "Powered by Abduraxmon" modal ochiladi
- [ ] Footer "© 2026 RoastCode" ko'rinadi

### Login Sahifasi (login.html)
- [ ] Kirish/Ro'yxat tablar ishlaydi
- [ ] Email+password bilan kirish imkon
- [ ] Admin kirsa admin.html ga ketadi
- [ ] Oddiy user kirsa app.html ga ketadi
- [ ] Banned user "Kirilmadi" xabari oladi

### App Sahifasi (app.html)
- [ ] Monaco Editor yuklanadi
- [ ] Code paste qil → [Roast/Fix/Chat] tanlaysan
- [ ] AI javob keladi (streaming)
- [ ] Token bar yangilansa
- [ ] Kunlik limit tugasa upgrade modal chiqadi
- [ ] Chat sidebar ochiladi
- [ ] Support chatda xabar yozsa AI javob beradi

### Pricing Sahifasi (pricing.html)
- [ ] 4 ta tarif ko'rinadi
- [ ] "Sotib olish" tugmasi modal ochadi
- [ ] Karta tap-to-copy qol beradi
- [ ] "To'lov qildim" → chat modal
- [ ] Chekni chat orqali yubor imkoni

### Admin Panel (admin.html)
- [ ] Faqat admin (tier='admin') kiriladi
- [ ] Dashboard: stats ko'rinadi
- [ ] Users tab: barcha userlar ro'yxati
- [ ] Payments tab: pending to'lovlar (chek rasmi)
- [ ] "Qabul" tugmasi → user tarif oladi + AI xabar
- [ ] "Rad" tugmasi → user xabar oladi
- [ ] Chatlar: admin xabarlari qizil
- [ ] Tier o'zgartirish/Ban ishlaydi

### Edge Functions
- [ ] `ai-router` working (test qil: curl)
- [ ] `chat-support` working
- [ ] Secrets to'g'ri o'rnatilgan
- [ ] CORS xatosi yo'q

### GitHub Pages
- [ ] URL ishlaydi
- [ ] Rasm va CSS yuklanadi
- [ ] Supabase bilan ulanish ishlaydi

---

## 🐛 UMUMIY XATOLAR VA YECHIM

| Xato | Sabab | Yechim |
|------|-------|--------|
| **"CORS error"** | Edge Function CORS headerlar yo'q | ai-router/index.ts da CORS check qil |
| **"Unauthorized 401"** | Anon key xato | config.js dagi key tekshir |
| **"Function not found"** | Deploy qilmagan | `supabase functions deploy` ishlat |
| **"Secrets not set"** | API keylar o'rnatilmagan | `supabase secrets set` ishlat |
| **"Cannot login"** | RLS policy xato | SQL schema qayta ishlat |
| **"Token bar ayg'almadi"** | Daily requests counter xata | Function `increment_daily_requests` tekshir |
| **"Chat xabar olmaydi"** | Realtime subscription xatosi | Supabase Settings → Realtime tekshir |
| **"GitHub Pages 404"** | Branch yo'q yoki settings xato | Settings → Pages → Branch tanlang |

---

## 📱 LOCALHOST DA TEST QILISH (IXTIYORIY)

**Bir lokal server ishlatgil:**

```bash
# Agar Python bor:
python -m http.server 8000

# Agar Node.js bor:
npx http-server

# Agar Live Server VS Code extension bor:
# Right-click index.html → "Open with Live Server"
```

Brauzer da: `http://localhost:8000`

---

## 🎯 YAKUNIY RO'YXAT

```
✅ Phase 1   — SQL schema + RLS
✅ Phase 2   — Config + CSS
✅ Phase 3   — Login page
✅ Phase 4   — App UI
✅ Phase 5   — App logic
✅ Phase 6   — AI Edge Function
✅ Phase 7   — Pricing page
✅ Phase 8   — Chat + Support
✅ Phase 9   — Admin UI
✅ Phase 10  — Admin logic
✅ Phase 11  — Landing + Deploy
✅ Bonus    — Dates updated to 2026
✅ Bonus    — This guide created
```

---

## 📞 QO'LLO ALOQA

**Agar muammo bo'lsa:**

1. **Supabase Docs:** https://supabase.com/docs
2. **Gemini API:** https://ai.google.dev
3. **Groq Console:** https://console.groq.com
4. **GitHub Help:** https://docs.github.com

**GitHub repo:** https://github.com/SuperCoder52435353/roastcode

---

**RoastCode © 2026** ⚡  
*Powered by Abduraxmon Mavlonov*  
*O'zbek dasturchilari uchun yaratilgan* 🔥
