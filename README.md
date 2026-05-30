# 🔥 RoastCode — AI Kod Reviewer

> Kodingni AI qovursin. Xatolaringni kulgili bilan tuzat. ⚡

**RoastCode** — o'zbek dasturchilari uchun yaratilgan AI-powered kod review platformasi.  
Kodni paste qil → Roast/Fix/Chat rejimini tanlang → AI tahlil qiladi!

⚠️ **API keylar xavfli, shuning uchun GitHub da yo'q. Supabase Secrets da saqlang!**

---

## 🎯 XUSUSIYATLAR

✅ **🔥 Roast Mode** — Kodni kulgili tanqid qiladi  
✅ **🔧 Fix Mode** — Xatolarni topib tuzatadi  
✅ **💬 Chat Support** — Support chatda yordam beradi  
✅ **⚡ Tez AI** — Gemini 1.5 Flash + Groq Llama-70B  
✅ **🔒 Xavfsiz** — Supabase RLS bilan himoyalangan  
✅ **📱 Mobile Qulay** — Responsive design  
✅ **🎨 Dark Theme** — Ko'z uchun raxat  

---

## 🚀 TEZKOR START

### 1. **Bepul rejim bilan boshlash**
```
1. index.html da "Boshlash" tugmasini bosish
2. login.html da ro'yxatdan o'tish
3. app.html da kod paste qilish
4. "Roast", "Fix" yoki "Chat" tanlash
5. AI javobni kutish 🎉
```

### 2. **Tariflarni upgrade qilish**
```
pricing.html → Tarifni tanlang → Humo karta (5614 6818 1834 6037)
→ Receipt chat orqali yubor → Admin 24 soat ichida faollash
```

### 3. **Admin bo'lish** (faqat admin@roastcode.dev)
```
Supabase Dashboard → Authentication → admin@roastcode.dev bilan kirish
→ Admin panel (admin.html) ochiladi
```

---

## 📁 FAYL TUZILMASI

```
roastcode/
├── index.html           ← Landing page
├── login.html           ← Login / Register
├── app.html             ← Asosiy ilova
├── pricing.html         ← Tariflar
├── admin.html           ← Admin panel
│
├── assets/
│   ├── css/
│   │   ├── main.css     ← Dark theme, variables
│   │   ├── auth.css     ← Login/register
│   │   ├── app.css      ← App UI
│   │   ├── pricing.css  ← Pricing page
│   │   ├── admin.css    ← Admin panel
│   │   └── landing.css  ← Landing page
│   │
│   └── js/
│       ├── config.js    ← Konfiguratsiya (Supabase, tariflar)
│       ├── auth.js      ← Login/register mantiq
│       ├── app.js       ← App mantiq (editor, AI call)
│       ├── pricing.js   ← To'lov modal
│       ├── admin.js     ← Admin panel
│       └── chat.js      ← Support chat
│
└── supabase/
    ├── schema.sql       ← SQL database schema + RLS
    └── functions/
        ├── ai-router/
        │   └── index.ts ← AI Edge Function (Gemini/Groq)
        └── chat-support/
            └── index.ts ← Support chat Edge Function
```

---

## 💰 TARIFLAR

| Tarif  | Narx | So'rov/kun | Max qator |
|--------|------|-----------|----------|
| **Free** | Bepul | 20 | 100 |
| **Pro** | $3/oy (36,000 so'm) | 200 | 300 |
| **X** | $49/oy (588,000 so'm) | 1,000 | 500 |
| **Team** | $99/oy (1,120,000 so'm) | Cheksiz | Cheksiz |

---

## 🔑 CREDENTIALS

| Xususiyat | Qiymat |
|-----------|--------|
| **Supabase URL** | `https://uqrnqqhxfwtzhdepaiao.supabase.co` |
| **Admin Email** | `admin@roastcode.dev` |
| **Karta** | `5614 6818 1834 6037` |
| **Karta egasi** | `ABDURAXMON MAVLONOV` |
| **Bank** | `Humo` |

---

## 🛠️ DEPLOYMENT

### Supabase Setup

```bash
# 1. SQL schema o'rnatish
# Supabase Dashboard → SQL Editor → schema.sql paste qil

# 2. Secrets o'rnatish
supabase secrets set \
  GEMINI_API_KEY="[YOUR_GEMINI_API_KEY]" \
  GROQ_API_KEY="[YOUR_GROQ_API_KEY]" \
  SUPABASE_SERVICE_ROLE_KEY="[YOUR_SERVICE_ROLE_KEY]" \
  --project-ref uqrnqqhxfwtzhdepaiao

# 3. Edge Functions deploy
supabase functions deploy ai-router --project-ref uqrnqqhxfwtzhdepaiao
supabase functions deploy chat-support --project-ref uqrnqqhxfwtzhdepaiao
```

### GitHub Pages Deploy

```bash
git add .
git commit -m "Initial RoastCode v1.0.0"
git push -u origin main
```

GitHub Settings → Pages → Branch: main → Save

**URL:** `https://SuperCoder52435353.github.io/roastcode/`

---

## 📖 QOʻLLANMALAR

- [Deployment Guide](./DEPLOYMENT_GUIDE.md) — Batafsil deployment yo'riqnomasi
- [API Docs](./API_DOCS.md) — Edge Function APIlar
- [SQL Schema](./supabase/schema.sql) — Database tuzilmasi

---

## 🧪 TEST QILISH

```bash
# Localhost da test
python -m http.server 8000
# yoki
npx http-server

# Brauzer: http://localhost:8000
```

---

## 📞 QO'LLO ALOQA

- **GitHub:** https://github.com/SuperCoder52435353/roastcode
- **Supabase:** https://app.supabase.com
- **Gemini API:** https://ai.google.dev
- **Groq API:** https://console.groq.com

---

## 📜 LITSENZIYA

Barcha huquqlar himoyalangan © 2026 RoastCode

---

## 👨‍💻 TUZILGAN

**Abduraxmon Mavlonov** ⚡  
Toshkent, O'zbekiston  
May 2026

*"Kod qovursin, xato aytgilsın!" — RoastCode motto* 🔥
