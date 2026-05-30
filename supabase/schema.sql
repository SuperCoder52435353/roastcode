-- ================================================================
-- RoastCode — Supabase SQL Schema (Faza 1)
-- ================================================================
-- Supabase SQL Editor da ishlatish:
-- 1. Supabase Dashboard → SQL Editor
-- 2. Yeni Query
-- 3. Bu faylning kodi paste qil
-- 4. Run tugmasini bosgil ✓
-- ================================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. PROFILES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username          TEXT UNIQUE NOT NULL,
  full_name         TEXT,
  email             TEXT UNIQUE NOT NULL,
  avatar_url        TEXT,
  tier              TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'x', 'team', 'admin')),
  daily_requests    INT NOT NULL DEFAULT 0,
  last_reset        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_banned         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_profiles_tier ON profiles(tier);
CREATE INDEX idx_profiles_is_banned ON profiles(is_banned);

-- ═══════════════════════════════════════════════════════════════
-- 2. SESSIONS TABLE (AI so'rovlari tarixi)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode              TEXT NOT NULL CHECK (mode IN ('roast', 'fix', 'chat', 'info')),
  code              TEXT,
  question          TEXT,
  response          TEXT NOT NULL,
  tokens_used       INT,
  model_used        TEXT CHECK (model_used IN ('gemini', 'groq')),
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_mode ON sessions(mode);

-- ═══════════════════════════════════════════════════════════════
-- 3. MESSAGES TABLE (Support chat)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_type       TEXT NOT NULL CHECK (sender_type IN ('user', 'ai', 'admin')),
  content           TEXT,
  message_type      TEXT CHECK (message_type IN ('text', 'image')) DEFAULT 'text',
  file_url          TEXT,
  is_read           BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_sender_type ON messages(sender_type);

-- ═══════════════════════════════════════════════════════════════
-- 4. PAYMENTS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier              TEXT NOT NULL CHECK (tier IN ('pro', 'x', 'team')),
  amount_usd        DECIMAL(10, 2) NOT NULL,
  amount_som        INT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  receipt_url       TEXT,
  rejection_reason  TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at       TIMESTAMP WITH TIME ZONE,
  approved_by       UUID REFERENCES profiles(id)
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 5. AI_CACHE TABLE (Token tejash)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key         TEXT UNIQUE NOT NULL,
  mode              TEXT NOT NULL,
  response          TEXT NOT NULL,
  tokens_saved      INT,
  expires_at        TIMESTAMP WITH TIME ZONE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_cache_expires_at ON ai_cache(expires_at);
CREATE INDEX idx_ai_cache_created_at ON ai_cache(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 6. RATE_LIMITS TABLE (Abuse oldini olish)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address        TEXT,
  request_count     INT DEFAULT 1,
  window_start      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at        TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_rate_limits_user_id ON rate_limits(user_id);
CREATE INDEX idx_rate_limits_ip_address ON rate_limits(ip_address);
CREATE INDEX idx_rate_limits_expires_at ON rate_limits(expires_at);

-- ═══════════════════════════════════════════════════════════════
-- 7. APP_SETTINGS TABLE (Admin sozlamalari)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.app_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key       TEXT UNIQUE NOT NULL,
  setting_value     JSONB,
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_app_settings_key ON app_settings(setting_key);

-- ═══════════════════════════════════════════════════════════════
-- STORAGE BUCKET (Receipt images)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- RLS (Row Level Security) — Xavfsizlik qoidalari
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- PROFILES RLS
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'admin'
  ));

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Anyone can insert their profile on registration" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'admin')
  );

-- ═══════════════════════════════════════════════════════════════
-- SESSIONS RLS
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "Users can view their own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'admin'
  ));

CREATE POLICY "Users can insert their own sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- MESSAGES RLS
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "Users can view their own messages" ON messages
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'admin'
  ));

CREATE POLICY "Users can insert messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages" ON messages
  FOR UPDATE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- PAYMENTS RLS
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "Users can view their own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'admin'
  ));

CREATE POLICY "Users can insert payments (pending status)" ON payments
  FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admin can update payments" ON payments
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'admin'
  ));

-- ═══════════════════════════════════════════════════════════════
-- AI_CACHE RLS (faqat service role)
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "Only service role can access cache" ON ai_cache
  FOR ALL USING (false);

-- ═══════════════════════════════════════════════════════════════
-- RATE_LIMITS RLS (faqat service role)
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "Only service role can access rate limits" ON rate_limits
  FOR ALL USING (false);

-- ═══════════════════════════════════════════════════════════════
-- APP_SETTINGS RLS (faqat admin)
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "Admin can manage settings" ON app_settings
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'admin'
  ));

-- ═══════════════════════════════════════════════════════════════
-- STORAGE RLS POLICIES (receipts bucket)
-- ═══════════════════════════════════════════════════════════════

-- Allow authenticated users to view receipts
CREATE POLICY "Receipts: authenticated can view"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'receipts');

-- Allow authenticated users to upload receipts to their folder (receipts/{uid}/*)
CREATE POLICY "Receipts: authenticated can upload to their folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update/overwrite their own receipts (FIXED: cast uid to text)
DROP POLICY IF EXISTS "Receipts: authenticated can update own objects"
  ON storage.objects;

CREATE POLICY "Receipts: authenticated can update own objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND owner_id = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND owner_id = auth.uid()::text
  );

-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Profile avtomatik yaratish (sign up qilganda)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, full_name, tier)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.user_metadata->>'username')::text, 'user_' || substring(NEW.id::text, 1, 8)),
    COALESCE((NEW.user_metadata->>'full_name')::text, ''),
    'free'
  );
  RETURN NEW;
END;
$$;

-- Trigger yangi foydalanuvchi qo'shilganda
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Kunlik counter +1
CREATE OR REPLACE FUNCTION public.increment_daily_requests(uid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET daily_requests = daily_requests + 1
  WHERE id = uid;
END;
$$;

-- Kunlik reset (supabase cron extension orqali)
CREATE OR REPLACE FUNCTION public.reset_daily_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET daily_requests = 0, last_reset = NOW()
  WHERE last_reset < NOW() - INTERVAL '24 hours' AND tier != 'admin';
END;
$$;

-- Cache cleanup (eskirgan cache o'chirish)
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM ai_cache
  WHERE expires_at < NOW();
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- INITIAL DATA
-- ═══════════════════════════════════════════════════════════════

-- App settings
INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('gemini_model', '"gemini-1.5-flash"'),
  ('groq_model', '"llama-70b-versatile"'),
  ('cache_ttl_hours', '1'),
  ('max_file_size_mb', '5')
ON CONFLICT (setting_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- NOTES:
-- ═══════════════════════════════════════════════════════════════
-- 
-- 🔑 ADMIN CREDENTIALS:
--    Email: admin@roastcode.dev
--    Password: PASSWORDABDURAXMON
--
-- 1. Admin user yaratish:
--    - Supabase Dashboard > Authentication > Users > Add User
--    - Email: admin@roastcode.dev
--    - Password: PASSWORDABDURAXMON
--    
-- 2. Keyin bu SQL execute qil (admin profili yaratish):
--    INSERT INTO profiles (id, username, full_name, email, tier)
--    SELECT id, 'admin', 'Abduraxmon Mavlonov', 'admin@roastcode.dev', 'admin'
--    FROM auth.users WHERE email = 'admin@roastcode.dev';
--
-- 3. Test user yaratish (optional):
--    Ro'yxatdan o'tish (register) buttonini bosib:
--    - Full name: Test User
--    - Username: testuser
--    - Email: test@roastcode.dev
--    - Password: Test@123456
--
-- 4. Supabase Cron extension (optional):
--    - Database > Extensions > "pg_cron" > Enable
--    - Query:
--      SELECT cron.schedule('reset_daily', '0 0 * * *', 'SELECT public.reset_daily_requests()');
--
-- 5. Storage receipt upload policy:
--    - Storage > receipts > Policies > Add policy
--    - Allow authenticated users to upload: receipts/{uid}/*
--
-- ═══════════════════════════════════════════════════════════════
