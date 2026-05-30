# 🔌 RoastCode — API DOCUMENTATION

**Version:** 1.0.0  
**Updated:** 2026.05.30

---

## OVERVIEW

RoastCode 2 ta Supabase Edge Function ishlatadi:

1. **`ai-router`** — Kod review qilish (Roast/Fix/Chat modes)
2. **`chat-support`** — Support chat xabarlari

Barcha requestlar **CORS protected** va **auth required**.

---

## 🔐 AUTHENTICATION

Barcha request da `Authorization: Bearer <token>` header zarur:

```javascript
const token = (await supabase.auth.getSession()).data.session?.access_token;

const response = await fetch(
  'https://uqrnqqhxfwtzhdepaiao.supabase.co/functions/v1/ai-router',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ mode: 'roast', code: '...' })
  }
);
```

---

## 📡 EDGE FUNCTION #1: ai-router

**Endpoint:** `POST /functions/v1/ai-router`

**URL:** `https://uqrnqqhxfwtzhdepaiao.supabase.co/functions/v1/ai-router`

### REQUEST

```json
{
  "mode": "roast",
  "code": "const x = 1",
  "question": null
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `mode` | `string` | ✅ | `roast`, `fix`, `chat`, `info` |
| `code` | `string` | ❌ | Ko'z code (null bo'lsa, Groq ishlatiladi) |
| `question` | `string` | ❌ | Opsional savol |

### RESPONSE (Success)

```json
{
  "success": true,
  "response": "🔥 ROAST\nKoding qanday foydalanuvchi sifatida ishlamaydi...",
  "model": "gemini",
  "tokensUsed": 234,
  "cached": false
}
```

### RESPONSE (Error)

```json
{
  "success": false,
  "error": "Tier limit exceeded",
  "code": "LIMIT_EXCEEDED"
}
```

### ERROR CODES

| Code | Status | Sabab | Yechim |
|------|--------|-------|--------|
| `UNAUTHORIZED` | 401 | Token xato/yo'q | Re-login |
| `BANNED` | 403 | User banned | Admin bilan murojaat |
| `LIMIT_EXCEEDED` | 429 | Kunlik limit tugadi | Upgrade qil |
| `INVALID_MODE` | 400 | Mode xato | `roast/fix/chat/info` dan tanlang |
| `INVALID_INPUT` | 400 | Input xato | Code/question kiritish |
| `SERVER_ERROR` | 500 | Internal error | Qayta urinib ko'ring |

### EXAMPLE (JavaScript)

```javascript
async function callAI(mode, code, question) {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    
    const response = await fetch(
      RC_CONFIG.functions.aiRouter,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mode, code, question })
      }
    );

    if (response.status === 429) {
      showUpgradeModal(); // Limit tugadi
      return;
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error);
    }

    return data.response;
  } catch (err) {
    console.error('AI error:', err);
    showToast(err.message, 'error');
  }
}
```

---

## 💬 EDGE FUNCTION #2: chat-support

**Endpoint:** `POST /functions/v1/chat-support`

**URL:** `https://uqrnqqhxfwtzhdepaiao.supabase.co/functions/v1/chat-support`

### REQUEST (Text Message)

```json
{
  "type": "message",
  "content": "Pro tarifga upgrade qancha vaqt oladi?"
}
```

### REQUEST (Receipt Image)

```json
{
  "type": "receipt",
  "tier": "pro",
  "fileBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `string` | ✅ | `message` yoki `receipt` |
| `content` | `string` | ❌ (for message) | Xabar matnı |
| `tier` | `string` | ❌ (for receipt) | `pro`, `x`, `team` |
| `fileBase64` | `string` | ❌ (for receipt) | Base64-coded image |

### RESPONSE (Success)

```json
{
  "success": true,
  "messageId": "uuid",
  "aiResponse": "Pro tarifi faqat $3/oy! 24 soat ichida faollashtiriladi.",
  "paymentId": "uuid (if receipt)"
}
```

### RESPONSE (Error)

```json
{
  "success": false,
  "error": "File too large",
  "code": "FILE_ERROR"
}
```

### BEHAVIOR

**Message qabul qilish:**
- Matn → AI javobini topadi va xabarni INSERT qiladi
- Tariflar/to'lov savoli → INFO prompt ishlatiladi (Groq)
- Boshqa savol → CHAT prompt (Groq)
- Realtime → User chat sidebar da avtomatik ko'radi

**Receipt qabul qilish:**
- Image → Supabase Storage ga upload
- Payment → `payments` jadvalida INSERT (`status: pending`)
- User → AI tabrik xabari oladi
- Admin → Admin panelda ko'radi (Qabul/Rad tugmalari)

---

## 📊 DATABASE TABLES

### `profiles`
```sql
id           UUID (PK)
username     TEXT (UNIQUE)
full_name    TEXT
email        TEXT (UNIQUE)
tier         TEXT ('free'|'pro'|'x'|'team'|'admin')
daily_requests INT
is_banned    BOOLEAN
created_at   TIMESTAMP
updated_at   TIMESTAMP
```

### `sessions`
```sql
id           UUID (PK)
user_id      UUID (FK → profiles)
mode         TEXT ('roast'|'fix'|'chat'|'info')
code         TEXT
question     TEXT
response     TEXT
tokens_used  INT
model_used   TEXT ('gemini'|'groq')
created_at   TIMESTAMP
```

### `messages`
```sql
id           UUID (PK)
user_id      UUID (FK → profiles)
sender_type  TEXT ('user'|'ai'|'admin')
content      TEXT
message_type TEXT ('text'|'image')
file_url     TEXT
is_read      BOOLEAN
created_at   TIMESTAMP
```

### `payments`
```sql
id           UUID (PK)
user_id      UUID (FK → profiles)
tier         TEXT ('pro'|'x'|'team')
amount_usd   DECIMAL
amount_som   INT
status       TEXT ('pending'|'approved'|'rejected')
receipt_url  TEXT
created_at   TIMESTAMP
approved_at  TIMESTAMP
approved_by  UUID (FK → profiles, nullable)
```

---

## 🔄 REALTIME SUBSCRIPTION

### Chat xabarlarni realtime qabul qilish

```javascript
const subscription = supabase
  .channel(`chat:${userId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      console.log('New message:', payload.new);
      // UI ga yangi xabar qo'sh
    }
  )
  .subscribe();

// Cleanup
supabase.removeChannel(subscription);
```

---

## 📝 SMART ROUTING LOGIC

```
if (kod bo'lmasa && savol qisqa) {
  → Groq Llama-70B (tez, arzon)
  → max_tokens: 300
} else {
  → Gemini 1.5 Flash (kuchli)
  → max_tokens: 500-800
}

// Token tejash:
if (bir xil so'rov bo'lsa) {
  → Cache dan qaytariladi (token sarflanmaydi)
} else {
  → AI dan javob olinadi va cacheqa saqlansa
}
```

---

## ⚡ RATE LIMITS

### Per-user limits (server-side)

| Tier | Kunlik so'rov | Max qator |
|------|---------------|----------|
| Free | 20 | 100 |
| Pro | 200 | 300 |
| X | 1,000 | 500 |
| Team | Cheksiz | Cheksiz |
| Admin | Cheksiz | Cheksiz |

### Per-IP limits (abuse prevention)

- 5 so'rov/minut
- 20 so'rov/soat

Agar tugsa: **429 Too Many Requests**

---

## 🔒 SECURITY

### RLS Policies

```sql
-- profiles: faqat o'zini ko'radi, admin hammasini
-- sessions: faqat o'ziniki, admin hammasini
-- messages: faqat o'ziniki, admin hammasini
-- payments: faqat o'zini insert/select, admin hammasini update
-- ai_cache, rate_limits: faqat service role
```

### Token Security

- Anon key: **PUBLIC** (config.js da)
- Service key: **SECRET** (Edge Function environments da)
- Access token: **SECURE** (browser session da)

---

## 🧪 TEST ENDPOINT

```bash
# 1. Token olish
TOKEN=$(curl -X POST https://uqrnqqhxfwtzhdepaiao.supabase.co/auth/v1/token \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@roastcode.dev",
    "password": "password",
    "grant_type": "password"
  }' | jq -r '.access_token')

# 2. AI router test
curl -X POST https://uqrnqqhxfwtzhdepaiao.supabase.co/functions/v1/ai-router \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "roast",
    "code": "const x = 1"
  }'

# 3. Chat test
curl -X POST https://uqrnqqhxfwtzhdepaiao.supabase.co/functions/v1/chat-support \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message",
    "content": "Assalomu alaykum!"
  }'
```

---

## 📚 REFERENCES

- Supabase Docs: https://supabase.com/docs
- Gemini API: https://ai.google.dev
- Groq API: https://console.groq.com
- Deno Docs: https://deno.com/docs

---

**RoastCode © 2026** ⚡
