// ================================================================
//  RoastCode — ai-router Edge Function (Deno / Supabase)
//  Smart routing: Gemini 1.5 Flash (kod) + Groq Llama (savol)
//  Cache, rate limit, tier check, streaming support
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

// ── Env ─────────────────────────────────────────────────────
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? ''
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY')    ?? ''
const GROQ_API_KEY      = Deno.env.get('GROQ_API_KEY')      ?? ''

// ── Tier limitlari ──────────────────────────────────────────
const TIER_LIMITS: Record<string, { daily: number; maxLines: number }> = {
  free:  { daily: 20,       maxLines: 100      },
  pro:   { daily: 200,      maxLines: 300      },
  x:     { daily: 1_000,    maxLines: 500      },
  team:  { daily: Infinity, maxLines: Infinity },
  admin: { daily: Infinity, maxLines: Infinity },
}

// ── AI output token limiti (mode bo'yicha) ──────────────────
const MODE_TOKENS: Record<string, number> = {
  roast: 500,
  fix:   800,
  chat:  300,
  info:  300,
}

// ── System prompts ──────────────────────────────────────────
const PROMPTS: Record<string, string> = {
  roast: `Sen RoastCode — o'zbek dasturchilari uchun AI kod review assistantisan.
Kodimni kulgili, o'tkir (lekin konstruktiv) tarzda tanqid qil.
FAQAT quyidagi formatda javob ber:

🔥 ROAST
[Kodni kulgili, sho'x tarzda tanqid qil. Max 3-4 jumla. O'zbek tilida yoki ruscha aralash — dasturchilarcha.]

🐛 XATOLAR
[Aniq xatolar ro'yxati. Har biri yangi qatorda. Agar yo'q bo'lsa "Katta xato yo'q, lekin..." de]

✅ PATCH
\`\`\`
[Faqat o'zgartirilgan qatorlar yoki to'liq patch. Qisqa va aniq.]
\`\`\`

Javobni qisqa tut. Ortiqcha izoh berma.`,

  fix: `Sen RoastCode Fix Mode — kod xatolarini topib tuzatuvchi AI assistantisan.
FAQAT quyidagi formatda javob ber:

❌ MUAMMO
[Aniq muammolar ro'yxati. Har biri yangi qatorda.]

✅ PATCH
\`\`\`
[Faqat o'zgartirilgan qatorlar. Minimal, aniq patch.]
\`\`\`

💡 IZOH
[1-2 jumla — nima uchun bu xato edi va qanday to'g'rilandi.]

Gereksiz gapirma. Faqat muammo va yechim.`,

  chat: `Sen RoastCode AI assistantisan. O'zbek dasturchilariga yordam berasan.
Qisqa, aniq, foydali javob ber. Kod bo'lsa, code block ishlatgin.
Ortiqcha suhbat kerak emas — to'g'ridan-to'g'ri javob ber.`,

  info: `Sen RoastCode support assistantisan. Tariflar va to'lov haqida ma'lumot berasan.

RoastCode tariflar:
- Free: $0 (bepul) — 20 so'rov/kun, 100 qatorgacha
- Pro: $3/oy (36,000 so'm) — 200 so'rov/kun, 300 qatorgacha
- X: $49/oy (588,000 so'm) — 1000 so'rov/kun, 500 qatorgacha
- Team: $99/oy (1,120,000 so'm) — cheksiz so'rov, cheksiz qator

To'lov usuli:
Humo karta: 5614 6818 1834 6037 (ABDURAXMON MAVLONOV)
To'lovdan so'ng chek rasmini chat orqali yuboring — admin 24 soat ichida faollashtiradi.

Qisqa, aniq javob ber. Faqat so'ralgan ma'lumotni ber.`,
}

// ── CORS headers ─────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ================================================================
//  MAIN HANDLER
// ================================================================
Deno.serve(async (req: Request) => {

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  // ── 1. Auth ──────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
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

  // ── 2. Profile + tier ────────────────────────────────────
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('tier, daily_requests, is_banned')
    .eq('id', userId)
    .single()

  if (profileErr && profileErr.code !== 'PGRST116') {
    return jsonError('Profile fetch error', 500)
  }

  const tier           = profile?.tier           ?? 'free'
  const dailyUsed      = profile?.daily_requests  ?? 0
  const isBanned       = profile?.is_banned       ?? false

  // ── 3. Ban tekshiruv ─────────────────────────────────────
  if (isBanned) {
    return jsonError('Hisobingiz bloklangan', 403)
  }

  // ── 4. Daily limit ───────────────────────────────────────
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.free
  if (isFinite(limits.daily) && dailyUsed >= limits.daily) {
    return jsonError('Kunlik limit tugadi', 429, 'LIMIT_EXCEEDED')
  }

  // ── 5. Request body ──────────────────────────────────────
  let body: { mode?: string; code?: string; question?: string }
  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const mode     = (body.mode     ?? 'chat').toLowerCase()
  const rawCode  = (body.code     ?? '').trim()
  const question = (body.question ?? '').trim()

  if (!['roast', 'fix', 'chat'].includes(mode)) {
    return jsonError('Noto\'g\'ri mode', 400)
  }

  // ── 6. Kod qisqartirish ──────────────────────────────────
  const maxLines = isFinite(limits.maxLines) ? limits.maxLines : 9999
  const code     = truncateCode(rawCode, maxLines, tier)

  // ── 7. Cache tekshiruv ───────────────────────────────────
  const cacheKey = await sha256(mode + '|' + code + '|' + question)

  const { data: cached } = await sb
    .from('ai_cache')
    .select('response')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (cached?.response) {
    // Cache hit — counter oshiramiz baribir (foydalanish hisoblanadi)
    await incrementDailyRequests(sb, userId)
    return jsonOk({ response: cached.response, cached: true })
  }

  // ── 8. Smart routing ─────────────────────────────────────
  //  Kod bor → Gemini Flash
  //  Savol yoki tarif/to'lov → Groq
  const hasCode     = code.length > 10
  const isInfoQuery = isPaymentOrPlanQuery(question + ' ' + code)
  const maxTokens   = MODE_TOKENS[mode] ?? 400

  let aiResponse = ''

  if (isInfoQuery) {
    aiResponse = await callGroq(PROMPTS.info, question || code, maxTokens)
  } else if (hasCode) {
    aiResponse = await callGemini(PROMPTS[mode], code, question, maxTokens)
  } else {
    aiResponse = await callGroq(PROMPTS[mode], question || code, maxTokens)
  }

  if (!aiResponse) {
    return jsonError('AI javob bermadi. Qayta urinib ko\'ring', 500)
  }

  // ── 9. Cache saqlash (1 soat TTL) ────────────────────────
  const expiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString()
  await sb.from('ai_cache').upsert({
    cache_key : cacheKey,
    mode,
    request_hash: cacheKey,
    response  : aiResponse,
    expires_at: expiresAt,
  }, { onConflict: 'cache_key' })

  // ── 10. Session log ──────────────────────────────────────
  await sb.from('sessions').insert({
    user_id  : userId,
    mode,
    code_snippet: rawCode.slice(0, 500),
    question : question.slice(0, 300),
    response : aiResponse.slice(0, 2000),
    tier,
    cached   : false,
  })

  // ── 11. Counter oshirish ─────────────────────────────────
  await incrementDailyRequests(sb, userId)

  return jsonOk({ response: aiResponse, cached: false })
})


// ================================================================
//  GEMINI 1.5 FLASH
// ================================================================
async function callGemini(
  systemPrompt: string,
  code: string,
  question: string,
  maxTokens: number
): Promise<string> {

  const userMsg = buildUserMessage(code, question)

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: systemPrompt + '\n\n---\n\n' + userMsg }]
      }
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature    : 0.7,
      topP           : 0.9,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`

  const resp = await fetch(url, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.text()
    console.error('[gemini] error:', resp.status, err)
    // Fallback: Groq ga urinib ko'ramiz
    return callGroq(systemPrompt, userMsg, maxTokens)
  }

  const data = await resp.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return text.trim()
}


// ================================================================
//  GROQ LLAMA-70B
// ================================================================
async function callGroq(
  systemPrompt: string,
  userMsg: string,
  maxTokens: number
): Promise<string> {

  const body = {
    model      : 'llama-3.3-70b-versatile',
    max_tokens : maxTokens,
    temperature: 0.7,
    messages   : [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMsg      },
    ],
  }

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.text()
    console.error('[groq] error:', resp.status, err)
    return ''
  }

  const data = await resp.json()
  const text = data?.choices?.[0]?.message?.content ?? ''
  return text.trim()
}


// ================================================================
//  YORDAMCHI FUNKSIYALAR
// ================================================================

// Foydalanuvchi xabarini qurish
function buildUserMessage(code: string, question: string): string {
  const parts: string[] = []
  if (code)     parts.push(`\`\`\`\n${code}\n\`\`\``)
  if (question) parts.push(question)
  return parts.join('\n\n') || 'Salom!'
}

// To'lov / tarif so'rovimi?
function isPaymentOrPlanQuery(text: string): boolean {
  const lower = text.toLowerCase()
  const keywords = [
    'tarif', 'narx', 'price', 'to\'lov', "to'lov", 'payment',
    'pro', 'team', 'upgrade', 'sotib', 'karta', 'humo',
    'necha', 'qancha', 'free', 'bepul', 'plan', 'tier',
    '36000', '588000', '1120000',
  ]
  return keywords.some(k => lower.includes(k))
}

// Kod qisqartirish
function truncateCode(code: string, maxLines: number, tier: string): string {
  if (!code) return ''
  if (!isFinite(maxLines) || maxLines <= 0) return code

  const lines = code.split('\n')
  if (lines.length <= maxLines) return code

  const keepHead = Math.floor(maxLines * 0.6)
  const keepTail = maxLines - keepHead
  const skipped  = lines.length - keepHead - keepTail

  return [
    ...lines.slice(0, keepHead),
    '',
    `// ... (${skipped} qator o'tkazildi — tier: ${tier})`,
    '',
    ...lines.slice(lines.length - keepTail),
  ].join('\n')
}

// SHA-256 hash (cache key uchun)
async function sha256(text: string): Promise<string> {
  const buf    = new TextEncoder().encode(text)
  const hash   = await crypto.subtle.digest('SHA-256', buf)
  const arr    = Array.from(new Uint8Array(hash))
  return arr.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Daily counter +1
async function incrementDailyRequests(
  sb: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  await sb.rpc('increment_daily_requests', { uid: userId })
    .then(({ error }) => {
      if (error) {
        // RPC yo'q bo'lsa manual update
        sb.from('profiles')
          .select('daily_requests')
          .eq('id', userId)
          .single()
          .then(({ data }) => {
            sb.from('profiles')
              .update({ daily_requests: (data?.daily_requests ?? 0) + 1 })
              .eq('id', userId)
          })
      }
    })
}

// JSON yordamchilari
function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status : 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function jsonError(message: string, status = 400, code?: string): Response {
  return new Response(JSON.stringify({ error: message, code: code ?? 'ERROR' }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}