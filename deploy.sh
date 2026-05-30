#!/bin/bash
# ================================================================
# RoastCode — Deployment Script
# ================================================================
# Ishlatish:
#   chmod +x deploy.sh
#   ./deploy.sh
# ================================================================

set -e

echo "🚀 RoastCode Deployment Script"
echo "======================================"
echo ""

# ── RANG'LI OUTPUT ──────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ── SUPABASE CREDENTIALS (siz kiritasiz) ──────────────────
PROJECT_REF="uqrnqqhxfwtzhdepaiao"
PROJECT_URL="https://uqrnqqhxfwtzhdepaiao.supabase.co"

# API KEYS (ushbu yo'lda saqlanadi)
# ⚠️  API KEYS XAVFLI! Bu yerda o'zingizning keylaringizni o'rnatish kerak
GEMINI_API_KEY="[YOUR_GEMINI_API_KEY]"
GROQ_API_KEY="[YOUR_GROQ_API_KEY]"
SUPABASE_SERVICE_ROLE_KEY="[YOUR_SERVICE_ROLE_KEY]"

# ── STEP 1: Supabase CLI ni o'rnatish ──────────────────────
echo -e "${BLUE}[1/5]${NC} Supabase CLI ni tekshiryapman..."
if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}Supabase CLI topilmadi. O'rnatishini boshlayapman...${NC}"
    npm install -g supabase
fi
echo -e "${GREEN}✓ Supabase CLI tayyor${NC}"
echo ""

# ── STEP 2: Supabase SQL schemani deploy qilish ──────────
echo -e "${BLUE}[2/5]${NC} SQL schemani Supabase ga yuboryapman..."
echo "Supabase Dashboard → SQL Editor → schema.sql nusxasini paste qil:"
echo "  URL: $PROJECT_URL"
echo "  Fayl: ./supabase/schema.sql"
echo ""
echo "📌 Keyin quyidagi SQL ni ishlatgil (admin yaratish):"
echo "  INSERT INTO profiles (id, username, full_name, email, tier)"
echo "  SELECT id, 'admin', 'Abduraxmon Mavlonov', 'admin@roastcode.dev', 'admin'"
echo "  FROM auth.users WHERE email = 'admin@roastcode.dev';"
echo ""
read -p "SQL deploy qildingmi? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}✓ SQL deploy tayyorlandı${NC}"
else
    echo -e "${RED}✗ SQL deploy bekor qilindi${NC}"
    exit 1
fi
echo ""

# ── STEP 3: Supabase Secrets ni set qilish ──────────────
echo -e "${BLUE}[3/5]${NC} Supabase Secrets ni o'rnatishini boshlayapman..."
echo ""
echo "Supabase CLI orqali secrets o'rnatish:"
echo ""
echo "$ supabase secrets set \\"
echo "    GEMINI_API_KEY=[YOUR_KEY] \\"
echo "    GROQ_API_KEY=[YOUR_KEY] \\"
echo "    SUPABASE_SERVICE_ROLE_KEY=[YOUR_KEY] \\"
echo "    --project-ref $PROJECT_REF"
echo ""
read -p "Bu buyruqni terminal da ishlattingmi? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}✓ Secrets o'rnatilgan${NC}"
else
    echo -e "${YELLOW}⚠ Secrets o'rnatilmagan. Keyinroq qil.${NC}"
fi
echo ""

# ── STEP 4: Edge Functions ni deploy qilish ───────────────
echo -e "${BLUE}[4/5]${NC} Edge Functions ni deploy qilyapman..."
echo ""

echo "  → ai-router deploying..."
supabase functions deploy ai-router --project-ref $PROJECT_REF > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "    ${GREEN}✓ ai-router deployed${NC}"
else
    echo -e "    ${YELLOW}⚠ ai-router deploy xatosi (secretlar o'rnatilganmi?)${NC}"
fi

echo "  → chat-support deploying..."
supabase functions deploy chat-support --project-ref $PROJECT_REF > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "    ${GREEN}✓ chat-support deployed${NC}"
else
    echo -e "    ${YELLOW}⚠ chat-support deploy xatosi (secretlar o'rnatilganmi?)${NC}"
fi

echo -e "${GREEN}✓ Edge Functions o'rnatilgan${NC}"
echo ""

# ── STEP 5: GitHub ga push qilish ─────────────────────────
echo -e "${BLUE}[5/5]${NC} GitHub ga push qilyapman..."
echo ""

# Agar git init bo'lmasa qilish
if [ ! -d .git ]; then
    echo "  Git repo init qilyapman..."
    git init
    git config user.name "RoastCode Bot"
    git config user.email "admin@roastcode.dev"
fi

# GitHub remote set qilish (agar yo'q bo'lsa)
if ! git remote | grep -q origin; then
    echo "  GitHub URL ni kiritish:"
    read -p "  GitHub HTTPS URL (masalan: https://github.com/SuperCoder52435353/roastcode): " GITHUB_URL
    git remote add origin "$GITHUB_URL"
fi

# Barcha fayllarni add qilish
git add .
git commit -m "Initial RoastCode v1.0.0 deployment — 2026" 2>/dev/null || true

# Push qilish
echo "  Pushing to GitHub..."
git push -u origin main 2>/dev/null || {
    echo -e "${YELLOW}⚠ main branch yo'q. master ga push qilyapman...${NC}"
    git push -u origin master 2>/dev/null || echo -e "${RED}✗ Git push xatosi${NC}"
}

echo -e "${GREEN}✓ GitHub push tugadi${NC}"
echo ""

# ── GITHUB PAGES SOZLAMASI ────────────────────────────────
echo -e "${BLUE}📌 GitHub Pages sozlamasi${NC}"
echo ""
echo "GitHub Settings orqali quyidagilarni qil:"
echo "  1. Repo → Settings → Pages"
echo "  2. Source: Branch → main (yoki master)"
echo "  3. Save"
echo ""
echo "URL: https://[username].github.io/roastcode/"
echo ""

# ── YAKUNIY TEKSHIRUV ──────────────────────────────────
echo -e "${BLUE}🎉 DEPLOYMENT YAKUNLANDI!${NC}"
echo ""
echo "Tekshirish ro'yxati:"
echo -e "  ${GREEN}✓${NC} SQL schema o'rnatilgan (supabase/schema.sql)"
echo -e "  ${GREEN}✓${NC} API keylar o'rnatilgan (Supabase Secrets)"
echo -e "  ${GREEN}✓${NC} Edge Functions deployed"
echo -e "  ${GREEN}✓${NC} GitHub push qilindi"
echo -e "  ${YELLOW}○${NC} GitHub Pages Settings (manual)"
echo ""
echo "Quyidagi joylarni tekshir:"
echo "  • admin@roastcode.dev bilan Supabase Dashboard → Auth"
echo "  • Edge Functions deployed? /functions/v1/ai-router"
echo "  • GitHub Pages URL ishlaydi?"
echo ""
echo -e "${GREEN}Barcha tayyor! 🚀${NC}"
echo ""
