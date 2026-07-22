/* ============================================================
   config.js — 전역 설정 · Supabase 클라이언트 · 상수
   ============================================================ */
'use strict';

/* ── Supabase 연결 정보 ───────────────────────────────────────
   Supabase 대시보드 → Project Settings → API 에서 복사한다.
   두 값을 비워 두면 앱은 "로컬 전용 모드"로 정상 동작한다.
   anon key는 공개되어도 되는 키다. RLS가 실제 보안을 담당한다.
   service_role 키는 절대 여기에 넣지 말 것.
------------------------------------------------------------ */
const SUPABASE_URL = 'https://ieuluoovykntxzmgstsy.supabase.co';        // 예: 'https://abcdefgh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_Gb3jT9pk8zIGUG0alhBZ0g_JvSTL6Mp';   // 예: 'eyJhbGciOi...'

/* ── Gemini (AI 루틴) ─────────────────────────────────────────
   Google AI Studio AQ. auth key.
   인증은 URL ?key= 가 아니라 요청 헤더 x-goog-api-key 로 전달한다.
------------------------------------------------------------ */
const CONFIG = {
  /* 로컬에서만 키를 넣고 커밋하지 마세요. GitHub Push Protection이 차단합니다. */
  GEMINI_API_KEY: '',
  /* 2.0/2.5 Flash는 신규 계정·종료 모델이라 404 남 → 3.x 사용 */
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  GEMINI_FALLBACK_MODELS: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'],
  GEMINI_MAX_RETRIES: 3,
  GEMINI_RETRY_BASE_MS: 3000,
  GEMINI_COOLDOWN_MS: 12000
};

/* 하위 호환 별칭 */
const GEMINI_API_KEY = CONFIG.GEMINI_API_KEY;
const GEMINI_MODEL = CONFIG.GEMINI_MODEL;

/* ── 상수 ──────────────────────────────────────────────────── */
const CFG = {
  STORAGE_KEY: 'autoreg.v6',
  META_KEY: 'autoreg.v6.meta',
  AUTH_DOMAIN: 'workout.app',   // 이름 → 가상 이메일 변환용 도메인
  SYNC_DEBOUNCE_MS: 1500,       // 입력이 멈춘 뒤 이 시간 후 클라우드 반영
  TABLE_STATE: 'user_state',
  TABLE_LOGS: 'workout_logs',
  TABLE_POSTS: 'community_posts',
  TABLE_REACTIONS: 'post_reactions',
  MIN_PASSWORD: 6,
  REACTIONS: [
    { key: 'like', emoji: '👍', label: '좋아요' },
    { key: 'sad', emoji: '😢', label: '슬퍼요' },
    { key: 'fire', emoji: '🔥', label: '최고야' },
    { key: 'cheer', emoji: '🙌', label: '응원해' },
    { key: 'respect', emoji: '💪', label: '리스펙' }
  ]
};

function geminiEnabled() {
  return !!(CONFIG.GEMINI_API_KEY && String(CONFIG.GEMINI_API_KEY).trim());
}

/* ── Supabase 클라이언트 (없으면 null) ───────────────────────── */
let sb = null;
function initSupabase() {
  if (sb) return sb;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!window.supabase || !window.supabase.createClient) return null;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  return sb;
}
function cloudEnabled() { return !!initSupabase(); }

/* ── 이름 → 가상 이메일 ──────────────────────────────────────
   Supabase Auth는 이메일 형식을 요구하므로 입력받은 이름을
   소문자·공백제거 후 [name]@workout.app 으로 변환한다.
   한글 이름은 그대로 쓸 수 없으므로 base36 해시를 덧붙인다.
------------------------------------------------------------ */
function nameToEmail(name) {
  const raw = String(name || '').trim();
  const ascii = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  const tag = h.toString(36);
  const local = (ascii || 'u') + '-' + tag;
  return `${local}@${CFG.AUTH_DOMAIN}`;
}
