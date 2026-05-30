// ================================================================
//  RoastCode — chat-support Edge Function (Deno / Supabase)
//  Text xabar → AI javob | Receipt → payment pending + auto xabar
//  Realtime: Supabase INSERT trigger orqali user ga avtomatik yetadi
//
//  Deploy:
//  supabase functions deploy chat-support --project-ref uqrnqqhxfwtzhdepaiao
//
//  Secrets:
//  supabase secrets set \
//    GEMINI_API_KEY=<key> \
//    GROQ_API_KEY=<key> \
//    SUPABASE_SERVICE_ROLE_KEY=<key> \
//    --project-ref uqrnqqhxfwtzhdepaiao
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

// ── Env ─────────────────────────────────────────────────────
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')             ?? ''
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GEMINI_API_KEY   = Deno.env.get('GEMINI_API_KEY')           ?? ''
const GROQ_API_KEY     = Deno.env.get('GROQ_API_KEY')             ?? ''

// ── CORS headers ─────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ── Tier narxlari ────────────────────────────────────────────
const TIER_PRICES: Record<string, number> = {
  free: 0,
  pro:  3,
  x:    49,
  team: 99,
}

// ================================================================
//  SYSTEM PROMPTS
// ================================================================
const CHAT_PROMPT = `Sen RoastCode support AI assistantisan. O'zbek dasturchilari uchun do'stona, aniq yordam berasan.
Qisqa javob ber. Kod bo'lsa, code block ishlatgin. Ortiqcha gap kerak emas.
Suhbat tilini (o'zbek/rus) userdagi xabar tiliga mosla.`

const INFO_PROMPT = `Sen RoastCode support assistantisan. Tariflar va to'lov bo'yicha aniq ma'lumot berasan.

📊 RoastCode tariflar:
┌─────────────────────────────────────────────────────────────┐
│ Free  │ $0        │ 20 so'rov/kun    │ 100 qatorgacha      │
│ Pro   │ $3/oy     │ 200 so'rov/kun   │ 300 qatorgacha      │
│ X     │ $49/oy    │ 1000 so'rov/kun  │ 500 qatorgacha      │
│ Team  │ $99/oy    │ Cheksiz so'rov   │ Cheksiz qator       │
└─────────────────────────────────────────────────────────────┘

💳 To'lov usuli:
Humo karta: 5614 6818 1834 6037
Egasi: ABDURAXMON MAVLONOV
Bank: Humo (O'zbekiston)

📌 Jarayon:
1. Tariflar sahifasidan tarifni tanlang
2. Ko'rsatilgan kartaga pul o'tkazing
3. To'lov chek rasmini shu chatda yuboring (📎 tugma)
4. Admin 24 soat ichida tarifni faollashtiradi

Savolni aniq, qisqa javobla.`

const RECEIPT_AUTO_MSG = `📎 Chekingiz muvaffaqiyatli qabul qilindi!

Admin ko'rib chiqadi va **24 soat ichida** tarifingizni faollashtiradi.

⏳ Odatda 1-4 soat ichida bajariladi.

Savol yoki muammo bo'lsa — shu chatda yozing! 🚀`

// ================================================================
//  YORDAMCHILAR
// ================================================================

/** To'lov/tarif savollari uchun aniqlash */
function isInfoQuery(text: string): boolean {
  const lower = text.toLowerCase()
  const keywords = [
    "tarif",    "narx",      "price",   "to'lov",  "tolov",
    "payment",  "pro",       "team",    "upgrade", "sotib",
    "karta",    "humo",      "necha",   "qancha",  "free",
    "bepul",    "plan",      "tier",    "36000",   "588000",
    "1120000",  "chek",      "receipt", "faollash","aktivlash",
    "limit",    "so'rov",    "qator",   "oylik",   "monthly",
    "subscribe","qanday",    "qachon",  "nima",
  ]
  return keywords.some(k => lower.includes(k))
}

/** Vaqt formati */
function nowISO(): string {
  return new Date().toISOString()
}

// ================================================================
//  MAIN HANDLER
// ================================================================
Deno.serve(async (req: Request) => {

  // ── OPTIONS preflight ─────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  // ── 1. Auth ──────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return jsonError('Unauthorized', 401)

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false },
  })

  let userId: string
  try {
    const { data: { user }, error } = await sb.auth.getUser(token)
    if (error || !user) return jsonError('Unauthorized', 401)
    userId = user.id
  } catch {
    return jsonError('Unauthorized', 401)
  }

  // ── 2. Profile ───────────────────────────────────────────
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('tier, username, full_name, is_banned')
    .eq('id', userId)
    .single()

  if (profileErr && profileErr.code !== 'PGRST116') {
    console.error('[chat-support] Profile error:', profileErr.message)
  }

  // ── 3. Ban check ─────────────────────────────────────────
  if (profile?.is_banned) {
    return jsonError('Hisobingiz bloklangan. Admin bilan bog\'laning.', 403)
  }

  const tier     = profile?.tier     ?? 'free'
  const username = profile?.username ?? profile?.full_name ?? 'user'

  // ── 4. Request body ──────────────────────────────────────
  let body: {
    text?    : string
    type?    : string
    file_url?: string
    filename?: string
    tier?    : string   // pending tier (pricing.js dan)
  }

  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const msgType    = (body.type    ?? 'text').toLowerCase()
  const text       = (body.text    ?? '').trim()
  const fileUrl    = body.file_url ?? ''
  const filename   = body.filename ?? ''
  const pendingTier = body.tier ?? null

  // ── 5. Rasm / Chek xabari ────────────────────────────────
  if (msgType === 'image' && fileUrl) {
    return await handleReceiptUpload(sb, userId, tier, fileUrl, filename, pendingTier)
  }

  // ── 6. Matn validatsiya ──────────────────────────────────
  if (!text) return jsonError("Xabar bo'm bo'sh bo'lishi mumkin emas", 400)
  if (text.length > 2000) return jsonError('Xabar juda uzun (max 2000 belgi)', 400)

  // ── 7. User xabarini DB ga yozish ────────────────────────
  const { error: userMsgErr } = await sb.from('messages').insert({
    user_id   : userId,
    sender    : 'user',
    content   : text,
    type      : 'text',
    is_read   : false,
    created_at: nowISO(),
  })

  if (userMsgErr) {
    console.error('[chat-support] User msg insert:', userMsgErr.message)
    // Davom etamiz — faqat loglash
  }

  // ── 8. AI routing va javob ───────────────────────────────
  const useInfoPrompt = isInfoQuery(text)
  const systemPrompt  = useInfoPrompt ? INFO_PROMPT : CHAT_PROMPT
  const maxTokens     = 300

  let aiResponse = ''

  // Barcha chat → Groq (tez, arzon)
  aiResponse = await callGroq(systemPrompt, text, maxTokens)

  // Groq ishlamasa → Gemini fallback
  if (!aiResponse) {
    console.warn('[chat-support] Groq failed, trying Gemini...')
    aiResponse = await callGemini(systemPrompt, text, maxTokens)
  }

  // Ikkalasi ham ishlamasa → fallback matn
  if (!aiResponse) {
    aiResponse = useInfoPrompt
      ? "Kechirasiz, ma'lumot olishda xato. Tariflar: Free($0), Pro($3/oy), X($49/oy), Team($99/oy). To'lov: Humo 5614 6818 1834 6037"
      : "Kechirasiz, hozir javob bera olmadim. Qayta urinib ko'ring yoki admin bilan bog'laning."
  }

  // ── 9. AI javobini DB ga yozish ──────────────────────────
  const { error: aiMsgErr } = await sb.from('messages').insert({
    user_id   : userId,
    sender    : 'ai',
    content   : aiResponse,
    type      : 'text',
    is_read   : false,
    created_at: nowISO(),
  })

  if (aiMsgErr) {
    console.error('[chat-support] AI msg insert:', aiMsgErr.message)
  }

  // ── 10. Javob qaytarish (Realtime ham trigger bo'ladi) ───
  return jsonOk({ response: aiResponse, cached: false })
})


// ================================================================
//  RECEIPT / CHEK UPLOAD HANDLER
// ================================================================
async function handleReceiptUpload(
  sb          : ReturnType<typeof createClient>,
  userId      : string,
  currentTier : string,
  fileUrl     : string,
  filename    : string,
  pendingTier : string | null,
): Promise<Response> {

  const targetTier  = pendingTier ?? currentTier ?? 'pro'
  const amountUsd   = TIER_PRICES[targetTier] ?? 0
  const displayName = filename || 'To\'lov cheki'

  // ── User rasm xabarini DB ga yozish ──────────────────────
  const { error: imgErr } = await sb.from('messages').insert({
    user_id   : userId,
    sender    : 'user',
    content   : `📎 ${displayName}`,
    type      : 'image',
    file_url  : fileUrl,
    is_read   : false,
    created_at: nowISO(),
  })

  if (imgErr) {
    console.error('[chat-support] Image msg insert:', imgErr.message)
  }

  // ── Payments jadvaliga yozish (pending) ──────────────────
  const { data: payData, error: payErr } = await sb.from('payments').insert({
    user_id     : userId,
    tier        : targetTier,
    receipt_url : fileUrl,
    status      : 'pending',
    amount_usd  : amountUsd,
    created_at  : nowISO(),
  }).select('id').single()

  if (payErr) {
    console.error('[chat-support] Payment insert:', payErr.message)
    // Davom etamiz — payment record shart emas, xabar muhim
  } else {
    console.log('[chat-support] Payment created:', payData?.id, 'tier:', targetTier)
  }

  // ── Avtomatik AI xabar (tabrik + keyingi qadam) ──────────
  const autoMsg = buildReceiptAutoMsg(targetTier, amountUsd)

  const { error: autoErr } = await sb.from('messages').insert({
    user_id   : userId,
    sender    : 'ai',
    content   : autoMsg,
    type      : 'text',
    is_read   : false,
    created_at: nowISO(),
  })

  if (autoErr) {
    console.error('[chat-support] Auto msg insert:', autoErr.message)
  }

  return jsonOk({ response: autoMsg, payment_created: !payErr })
}

function buildReceiptAutoMsg(tier: string, amountUsd: number): string {
  const tierNames: Record<string, string> = {
    free: 'Free', pro: 'Pro', x: 'X', team: 'Team',
  }
  const tierName = tierNames[tier] ?? tier.toUpperCase()
  const price    = amountUsd > 0 ? ` ($${amountUsd})` : ''

  return `📎 **${tierName} tarifi** uchun chekingiz qabul qilindi!${price}

Admin ko'rib chiqadi va ✅ **24 soat ichida** tarifingizni faollashtiradi.

⏳ Odatda 1–4 soat ichida bajariladi.
❓ Savol bo'lsa — shu chatda yozing!`
}


// ================================================================
//  GROQ — Llama-3.3-70B
// ================================================================
async function callGroq(
  systemPrompt: string,
  userMsg     : string,
  maxTokens   : number,
): Promise<string> {

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model      : 'llama-3.3-70b-versatile',
        max_tokens : maxTokens,
        temperature: 0.65,
        top_p      : 0.9,
        messages   : [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMsg },
        ],
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('[groq] HTTP error:', resp.status, err.slice(0, 200))
      return ''
    }

    const data = await resp.json()
    const text = data?.choices?.[0]?.message?.content ?? ''
    return text.trim()

  } catch (e) {
    console.error('[groq] Fetch error:', e instanceof Error ? e.message : e)
    return ''
  }
}


// ================================================================
//  GEMINI — 1.5 Flash (fallback)
// ================================================================
async function callGemini(
  systemPrompt: string,
  userMsg     : string,
  maxTokens   : number,
): Promise<string> {

  try {
    const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`
    const full = systemPrompt + '\n\n---\n\n' + userMsg

    const resp = await fetch(url, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: full }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature    : 0.65,
          topP           : 0.9,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    })

    if (!resp.ok) {
      console.error('[gemini] HTTP error:', resp.status)
      return ''
    }

    const data = await resp.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return text.trim()

  } catch (e) {
    console.error('[gemini] Fetch error:', e instanceof Error ? e.message : e)
    return ''
  }
}


// ================================================================
//  JSON HELPERS
// ================================================================
function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status : 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}