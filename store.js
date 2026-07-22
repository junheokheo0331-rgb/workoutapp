/* ============================================================
   store.js — 로컬 저장 + Supabase 동기화 + 인증
   전략: 로컬 우선(즉시 저장) → 디바운스 후 클라우드 반영.
        오프라인이면 dirty 목록에 쌓아뒀다가 온라인 복귀 시 전송.
   ============================================================ */
'use strict';

/* ---------- 운동 객체 기본값 ---------- */
function ex(o) {
  return Object.assign({
    id: 'x' + Math.random().toString(36).slice(2, 9),
    type: 'weight', targetMin: 30,
    name: '', equip: '머신', lift: '', sets: 3, repLo: 8, repHi: 12,
    rir: 1, rest: 150, mode: 'normal', round: 'near', note: ''
  }, o);
}
const CARDIO = (min) => ex({ name: 'Zone2 유산소', type: 'cardio', targetMin: min, rest: 0, equip: '유산소' });

/* ---------- 기본 루틴: 2분할 주 6일 ---------- */
function defaultPrograms() {
  return [
    {
      id: 'p_lowerA', title: 'Lower A · 스쿼트 강도', dayHint: 'mon',
      desc: '스쿼트 톱+백오프 · RDL로 힌지 1회차', items: [
        ex({ name: '백스쿼트 (톱세트)', equip: '바벨', lift: '스쿼트', sets: 1, repLo: 3, repHi: 4, rir: 2, rest: 240, note: '램프업 무휴식 → 본세트 직전 4분' }),
        ex({ name: '백스쿼트 (백오프)', equip: '바벨', lift: '스쿼트', sets: 3, repLo: 5, repHi: 6, rir: 3, rest: 240, round: 'floor' }),
        ex({ name: '레그프레스', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150, note: '깊은 ROM' }),
        ex({ name: '루마니안 데드리프트', equip: '바벨', sets: 3, repLo: 6, repHi: 10, rir: 2, rest: 150, note: '힌지 3회차 · 척추 압박 낮음' }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '레그프레스 카프레이즈', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 90, note: '전족부만 걸고 하단 2초' }),
        CARDIO(30)
      ]
    },
    {
      id: 'p_upperA', title: 'Upper A · 벤치 강도', dayHint: 'tue',
      desc: '벤치 톱+백오프 · 스미스 레스트포즈 · 팔 슈퍼세트', items: [
        ex({ name: '벤치프레스 (톱세트)', equip: '바벨', lift: '벤치프레스', sets: 1, repLo: 2, repHi: 3, rir: 2, rest: 210 }),
        ex({ name: '벤치프레스 (백오프)', equip: '바벨', lift: '벤치프레스', sets: 3, repLo: 4, repHi: 6, rir: 3, rest: 210, round: 'floor' }),
        ex({ name: '머신 랫풀다운', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150, note: '견갑 하강 선행' }),
        ex({ name: '스미스 숄더프레스 R1 (대사)', sets: 1, repLo: 30, repHi: 40, rir: 0, rest: 180, mode: 'restpause', note: '활성세트+RP 2회 총합 입력 · 미니세트 간 15초' }),
        ex({ name: '스미스 숄더프레스 R2 (긴장)', sets: 1, repLo: 12, repHi: 16, rir: 0, rest: 180, mode: 'restpause', note: '증량 후 활성세트 6회 미만이면 증량 철회' }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '리버스 팩덱플라이', sets: 2, repLo: 12, repHi: 20, rir: 0, rest: 90, note: '견갑 후인 최소화' }),
        ex({ name: '케이블 원암 푸시다운', equip: '케이블', sets: 2, repLo: 10, repHi: 15, rir: 0, rest: 90, note: '↓ 이두와 교대 슈퍼세트' }),
        ex({ name: '프리쳐컬', sets: 2, repLo: 8, repHi: 12, rir: 0, rest: 90, note: '↑ 삼두와 교대 슈퍼세트' }),
        CARDIO(30)
      ]
    },
    {
      id: 'p_lowerB', title: 'Lower B · 데드 강도', dayHint: 'wed',
      desc: '데드 2세트 고정 · 스쿼트 기술 · 후면사슬', items: [
        ex({ name: '데드리프트', equip: '바벨', lift: '데드리프트', sets: 2, repLo: 3, repHi: 4, rir: 2, rest: 240, note: '2세트 고정' }),
        ex({ name: '백스쿼트 (기술)', equip: '바벨', lift: '스쿼트', sets: 3, repLo: 4, repHi: 6, rir: 4, rest: 180, round: 'floor', note: 'RIR4 고정 · 빈도 확보용' }),
        ex({ name: '시티드 레그컬', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 150, note: '햄스트링 신장 조건' }),
        ex({ name: '힙쓰러스트', equip: '바벨', sets: 2, repLo: 8, repHi: 12, rir: 1, rest: 150, note: '상단 2초' }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '레그프레스 카프레이즈', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 90 }),
        CARDIO(30)
      ]
    },
    {
      id: 'p_upperB', title: 'Upper B · 풀 선행 + 인클라인', dayHint: 'thu',
      desc: '등 먼저 · 덤벨이 스미스보다 앞 · 팔 슈퍼세트', items: [
        ex({ name: '랩콘 리니어 로우', sets: 4, repLo: 6, repHi: 10, rir: 2, rest: 150, note: '팔꿈치 몸통에 붙여 광배 우위로' }),
        ex({ name: '클로스그립 랫풀다운', sets: 2, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '덤벨 인클라인 벤치프레스', equip: '덤벨', sets: 3, repLo: 6, repHi: 10, rir: 2, rest: 150, note: '자유중량이 머신보다 선행' }),
        ex({ name: '인클라인 스미스 벤치프레스', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 0, rest: 90 }),
        ex({ name: '리버스 팩덱플라이', sets: 2, repLo: 12, repHi: 20, rir: 0, rest: 90 }),
        ex({ name: '케이블 원암 익스텐션', equip: '케이블', sets: 2, repLo: 10, repHi: 15, rir: 0, rest: 90, note: '↓ 이두와 교대' }),
        ex({ name: '투암 케이블컬', equip: '케이블', sets: 2, repLo: 8, repHi: 12, rir: 0, rest: 90, note: '↑ 삼두와 교대' }),
        CARDIO(30)
      ]
    },
    {
      id: 'p_lowerC', title: 'Lower C · 스쿼트 볼륨', dayHint: 'fri',
      desc: '스쿼트 볼륨 · 데드 기술 2세트', items: [
        ex({ name: '백스쿼트', equip: '바벨', lift: '스쿼트', sets: 3, repLo: 6, repHi: 8, rir: 2, rest: 210 }),
        ex({ name: '데드리프트 (기술)', equip: '바벨', lift: '데드리프트', sets: 2, repLo: 3, repHi: 3, rir: 4, rest: 180, round: 'floor', note: 'RIR4 고정 · 피로 남기지 않는다' }),
        ex({ name: '레그프레스', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 150 }),
        ex({ name: '라잉 레그컬', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 150 }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '레그프레스 카프레이즈', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 90 }),
        CARDIO(30)
      ]
    },
    {
      id: 'p_upperC', title: 'Upper C · 벤치 3회차 + 펌프', dayHint: 'sat',
      desc: '풀 선행 · 포즈 벤치 · 덤벨 콤보 마무리', items: [
        ex({ name: '원암 풀다운', equip: '케이블', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 150 }),
        ex({ name: '벤치프레스 (포즈)', equip: '바벨', lift: '벤치프레스', sets: 3, repLo: 4, repHi: 6, rir: 3, rest: 210, round: 'floor', note: '가슴 1초 정지' }),
        ex({ name: '머신 체스트프레스', sets: 2, repLo: 10, repHi: 15, rir: 0, rest: 150 }),
        ex({ name: '케이블 플라이', equip: '케이블', sets: 2, repLo: 12, repHi: 20, rir: 0, rest: 90 }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 0, rest: 90 }),
        ex({ name: '케이블 원암 푸시다운', equip: '케이블', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 90, note: '↓ 이두와 교대' }),
        ex({ name: '해머컬', equip: '덤벨', sets: 3, repLo: 8, repHi: 12, rir: 0, rest: 90, note: '↑ 삼두와 교대' }),
        ex({ name: '덤벨 콤보 (사레→5초→프론트)', equip: '덤벨', sets: 2, repLo: 20, repHi: 25, rir: 0, rest: 90, note: '5kg 고정 · 번아웃' }),
        CARDIO(30)
      ]
    }
  ];
}

/* ---------- 기본 상태 ---------- */
const DEFAULT_STATE = () => ({
  version: 6,
  settings: {
    isFirstRun: true, age: null, gender: 'male', rhr: 70, unit: 'kg',
    unitBar: 10, unitMachine: 5, unitDumbbell: 2,
    capUp: 0.025, capDown: 0.03,
    baseline: {
      '스쿼트': { w: 0, reps: 1, rir: 0 },
      '벤치프레스': { w: 0, reps: 1, rir: 0 },
      '데드리프트': { w: 0, reps: 1, rir: 0 }
    },
    autoRest: true, sound: true, vibrate: true, notify: false, wakelock: true,
    cardioMin: 30
  },
  programs: defaultPrograms(),
  logs: {},
  timer: null,
  session: null
});

/* ============================================================
   Store
   ============================================================ */
const Store = {
  s: null,
  meta: null,          // { stateAt, logAt:{date:ts}, dirtyState, dirtyLogs:[] }
  user: null,          // { id, name }
  syncState: 'local',  // local | syncing | synced | offline | error
  _timer: null,

  /* ---------- 로컬 ---------- */
  load() {
    try {
      const raw = localStorage.getItem(CFG.STORAGE_KEY);
      this.s = raw ? JSON.parse(raw) : DEFAULT_STATE();
    } catch (e) { this.s = DEFAULT_STATE(); }
    try {
      this.meta = JSON.parse(localStorage.getItem(CFG.META_KEY) || 'null')
        || { stateAt: 0, logAt: {}, dirtyState: false, dirtyLogs: [] };
    } catch (e) { this.meta = { stateAt: 0, logAt: {}, dirtyState: false, dirtyLogs: [] }; }

    const d = DEFAULT_STATE();
    if (!this.s.programs || !this.s.programs.length) this.s.programs = d.programs;
    if (!this.s.logs) this.s.logs = {};
    if (!this.s.settings) this.s.settings = d.settings;
    Object.keys(d.settings).forEach(k => {
      if (this.s.settings[k] === undefined) this.s.settings[k] = d.settings[k];
    });
    this.migrateLogsToSessions();
    return this.s;
  },

  /** 구형 하루 1로그 → sessions[] 배열로 승격 */
  migrateLogsToSessions() {
    const logs = this.s.logs || {};
    let changed = false;
    Object.keys(logs).forEach(dateStr => {
      const raw = logs[dateStr];
      if (!raw || Array.isArray(raw.sessions)) return;
      logs[dateStr] = normalizeDayLog(raw, dateStr);
      changed = true;
    });
    if (changed) this.writeLocal();
  },

  writeLocal() {
    try {
      localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify(this.s));
      localStorage.setItem(CFG.META_KEY, JSON.stringify(this.meta));
    } catch (e) { if (window.toast) toast('저장 공간이 부족합니다'); }
  },

  /**
   * 저장 진입점. 로컬에는 즉시 쓰고, 클라우드는 디바운스해서 밀어 올린다.
   * @param {string|null} dateStr 변경된 로그 날짜 (설정·루틴만 바뀌었으면 생략)
   */
  save(dateStr) {
    const now = Date.now();
    if (dateStr) {
      this.meta.logAt[dateStr] = now;
      if (!this.meta.dirtyLogs.includes(dateStr)) this.meta.dirtyLogs.push(dateStr);
    } else {
      this.meta.stateAt = now;
      this.meta.dirtyState = true;
    }
    this.writeLocal();
    this.scheduleSync();
  },

  /**
   * 특정 날짜의 특정 세션만 삭제.
   * 삭제 후 로컬 저장 + 클라우드 dirty 표시 → 통계/e1RM은 다음 렌더에서 재연산.
   */
  deleteWorkoutSession(dateStr, sessionId) {
    if (!dateStr || !sessionId) return false;
    this.migrateLogsToSessions();
    const day = this.s.logs[dateStr];
    if (!day || !Array.isArray(day.sessions)) return false;
    const next = day.sessions.filter(s => s.id !== sessionId);
    if (next.length === day.sessions.length) return false;
    if (next.length) {
      day.sessions = next;
    } else {
      delete this.s.logs[dateStr];
    }
    if (this.s.session && this.s.session.sessionId === sessionId) {
      this.s.session = null;
    }
    this.save(dateStr);
    return true;
  },

  /** 설정·루틴 + 로그를 한꺼번에 더럽힘 처리 */
  saveAll(dateStr) { this.save(); if (dateStr) this.save(dateStr); },

  /* ---------- 인증 ---------- */
  async currentSession() {
    if (!cloudEnabled()) return null;
    try {
      const { data } = await sb.auth.getSession();
      return data && data.session ? data.session : null;
    } catch (e) { return null; }
  },

  async signUp(name, password) {
    if (!cloudEnabled()) throw new Error('클라우드가 설정되지 않았습니다');
    const email = nameToEmail(name);
    const { data, error } = await sb.auth.signUp({
      email, password, options: { data: { display_name: name } }
    });
    if (error) throw error;
    if (!data.session) {
      const r = await sb.auth.signInWithPassword({ email, password });
      if (r.error) throw r.error;
      data.session = r.data.session;
    }
    this.user = { id: data.session.user.id, name };
    return this.user;
  },

  async signIn(name, password) {
    if (!cloudEnabled()) throw new Error('클라우드가 설정되지 않았습니다');
    const { data, error } = await sb.auth.signInWithPassword({
      email: nameToEmail(name), password
    });
    if (error) throw error;
    this.user = { id: data.session.user.id, name };
    return this.user;
  },

  async signOut() {
    if (cloudEnabled()) { try { await sb.auth.signOut(); } catch (e) { } }
    this.user = null;
    this.syncState = 'local';
  },

  async restoreSession() {
    const sess = await this.currentSession();
    if (!sess) return null;
    const meta = sess.user.user_metadata || {};
    this.user = { id: sess.user.id, name: meta.display_name || '사용자' };
    return this.user;
  },

  /* ---------- 클라우드 ---------- */
  scheduleSync() {
    if (!cloudEnabled() || !this.user) { this.syncState = 'local'; this.paint(); return; }
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(), CFG.SYNC_DEBOUNCE_MS);
  },

  async push() {
    if (!cloudEnabled() || !this.user) return;
    if (!navigator.onLine) { this.syncState = 'offline'; this.paint(); return; }
    if (!this.meta.dirtyState && !this.meta.dirtyLogs.length) return;
    this.syncState = 'syncing'; this.paint();
    try {
      if (this.meta.dirtyState) {
        const { error } = await sb.from(CFG.TABLE_STATE).upsert({
          user_id: this.user.id,
          state: {
            version: this.s.version,
            settings: this.s.settings,
            programs: this.s.programs
          },
          updated_at: new Date(this.meta.stateAt || Date.now()).toISOString()
        }, { onConflict: 'user_id' });
        if (error) throw error;
        this.meta.dirtyState = false;
      }
      const pending = this.meta.dirtyLogs.slice();
      if (pending.length) {
        const rows = pending.map(d => ({
          user_id: this.user.id,
          log_date: d,
          payload: this.s.logs[d] || null,
          updated_at: new Date(this.meta.logAt[d] || Date.now()).toISOString()
        }));
        const { error } = await sb.from(CFG.TABLE_LOGS).upsert(rows, { onConflict: 'user_id,log_date' });
        if (error) throw error;
        this.meta.dirtyLogs = this.meta.dirtyLogs.filter(d => !pending.includes(d));
      }
      this.writeLocal();
      this.syncState = 'synced';
    } catch (e) {
      console.warn('sync push failed', e);
      this.syncState = navigator.onLine ? 'error' : 'offline';
    }
    this.paint();
  },

  /**
   * 원격 데이터를 내려받아 병합한다.
   * 병합 규칙: 행 단위 최신 우선(updated_at 비교). 동률이면 로컬 유지.
   * 로그는 날짜별 행이라 기기 두 대를 써도 다른 날짜끼리는 충돌하지 않는다.
   */
  async pull() {
    if (!cloudEnabled() || !this.user || !navigator.onLine) return false;
    this.syncState = 'syncing'; this.paint();
    let changed = false;
    try {
      const { data: st, error: e1 } = await sb.from(CFG.TABLE_STATE)
        .select('state, updated_at').eq('user_id', this.user.id).maybeSingle();
      if (e1) throw e1;
      if (st && st.state) {
        const remoteAt = new Date(st.updated_at).getTime();
        if (remoteAt > (this.meta.stateAt || 0)) {
          if (st.state.settings) this.s.settings = Object.assign({}, this.s.settings, st.state.settings);
          if (st.state.programs && st.state.programs.length) this.s.programs = st.state.programs;
          this.meta.stateAt = remoteAt;
          changed = true;
        }
      }
      const { data: logs, error: e2 } = await sb.from(CFG.TABLE_LOGS)
        .select('log_date, payload, updated_at').eq('user_id', this.user.id);
      if (e2) throw e2;
      (logs || []).forEach(r => {
        const remoteAt = new Date(r.updated_at).getTime();
        const localAt = this.meta.logAt[r.log_date] || 0;
        if (remoteAt > localAt && r.payload) {
          this.s.logs[r.log_date] = normalizeDayLog(r.payload, r.log_date);
          this.meta.logAt[r.log_date] = remoteAt;
          changed = true;
        }
      });
      this.writeLocal();
      this.syncState = 'synced';
    } catch (e) {
      console.warn('sync pull failed', e);
      this.syncState = navigator.onLine ? 'error' : 'offline';
    }
    this.paint();
    return changed;
  },

  /** 로그인 직후: 먼저 내려받고, 로컬에 남아 있던 변경분을 올린다 */
  async syncNow() {
    const changed = await this.pull();
    await this.push();
    return changed;
  },

  /* ---------- 분석 (engine Analytics 래퍼) ---------- */
  getMuscleRecoveryStatus(nowMs) {
    return Analytics.getMuscleRecoveryStatus(this.s.logs, nowMs);
  },
  getMainLiftE1RM(asOfDate) {
    return Analytics.getMainLiftE1RM(this.s.logs, asOfDate);
  },
  getWeeklyVolumeComparison(nowDate) {
    return Analytics.getWeeklyVolumeComparison(this.s.logs, nowDate);
  },
  getDailyVolumesThisWeek(nowDate) {
    return Analytics.getDailyVolumesThisWeek(this.s.logs, nowDate);
  },
  getAnalyticsSnapshot() {
    return Analytics.snapshot();
  },

  /* ---------- 커뮤니티 ---------- */
  async fetchCommunityFeed(limit) {
    if (!cloudEnabled() || !this.user) return [];
    const lim = limit || 40;
    const { data: posts, error } = await sb.from(CFG.TABLE_POSTS)
      .select('id,user_id,author_name,body,post_type,volume_kg,created_at')
      .order('created_at', { ascending: false })
      .limit(lim);
    if (error) throw error;
    if (!posts || !posts.length) return [];

    const ids = posts.map(p => p.id);
    const { data: reacts, error: e2 } = await sb.from(CFG.TABLE_REACTIONS)
      .select('post_id,user_id,reaction_type')
      .in('post_id', ids);
    if (e2) throw e2;

    const byPost = {};
    (reacts || []).forEach(r => {
      if (!byPost[r.post_id]) byPost[r.post_id] = [];
      byPost[r.post_id].push(r);
    });

    const myId = this.user.id;
    return posts.map(p => {
      const list = byPost[p.id] || [];
      const counts = { like: 0, sad: 0, fire: 0, cheer: 0, respect: 0 };
      const mine = {};
      list.forEach(r => {
        if (counts[r.reaction_type] != null) counts[r.reaction_type]++;
        if (r.user_id === myId) mine[r.reaction_type] = true;
      });
      return Object.assign({}, p, { counts, mine });
    });
  },

  async createCommunityPost(body, opts) {
    if (!cloudEnabled() || !this.user) throw new Error('로그인이 필요합니다');
    const text = String(body || '').trim();
    if (!text) throw new Error('내용을 입력하세요');
    const row = {
      user_id: this.user.id,
      author_name: this.user.name || '익명',
      body: text,
      post_type: (opts && opts.post_type) || 'free',
      volume_kg: (opts && opts.volume_kg != null) ? opts.volume_kg : null
    };
    const { data, error } = await sb.from(CFG.TABLE_POSTS).insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async deleteCommunityPost(postId) {
    if (!cloudEnabled() || !this.user) throw new Error('로그인이 필요합니다');
    if (!postId) throw new Error('게시글이 없습니다');
    const { error } = await sb.from(CFG.TABLE_POSTS)
      .delete()
      .eq('id', postId)
      .eq('user_id', this.user.id);
    if (error) throw error;
    return true;
  },

  /** 세션 종료 자동 피드 — 실패해도 조용히 무시 */
  async postWorkoutComplete(volumeKg) {
    if (!cloudEnabled() || !this.user) return null;
    const vol = Math.round(+volumeKg || 0);
    const name = this.user.name || '회원';
    const body = `${name}님이 오늘 운동을 완료했어요! (총 볼륨 ${vol}kg)`;
    try {
      return await this.createCommunityPost(body, {
        post_type: 'workout_complete',
        volume_kg: vol
      });
    } catch (e) {
      console.warn('community auto-post failed', e);
      return null;
    }
  },

  /**
   * 이모티콘 토글. 반환: { counts, mine } 갱신 스냅샷
   */
  async toggleReaction(postId, reactionType) {
    if (!cloudEnabled() || !this.user) throw new Error('로그인이 필요합니다');
    const keys = (CFG.REACTIONS || []).map(r => r.key);
    if (!keys.includes(reactionType)) throw new Error('알 수 없는 반응');

    const { data: existing } = await sb.from(CFG.TABLE_REACTIONS)
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', this.user.id)
      .eq('reaction_type', reactionType)
      .maybeSingle();

    if (existing && existing.id) {
      const { error } = await sb.from(CFG.TABLE_REACTIONS).delete().eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from(CFG.TABLE_REACTIONS).insert({
        post_id: postId,
        user_id: this.user.id,
        reaction_type: reactionType
      });
      if (error) throw error;
    }

    const { data: reacts, error: e2 } = await sb.from(CFG.TABLE_REACTIONS)
      .select('user_id,reaction_type')
      .eq('post_id', postId);
    if (e2) throw e2;

    const counts = { like: 0, sad: 0, fire: 0, cheer: 0, respect: 0 };
    const mine = {};
    (reacts || []).forEach(r => {
      if (counts[r.reaction_type] != null) counts[r.reaction_type]++;
      if (r.user_id === this.user.id) mine[r.reaction_type] = true;
    });
    return { counts, mine };
  },

  /* ---------- Gemini AI 루틴 ---------- */
  buildAiUserContext(opts) {
    const st = this.s.settings || {};
    const e1 = this.getMainLiftE1RM();
    const rec = this.getMuscleRecoveryStatus();
    const recoveryBrief = Object.keys(rec).map(k => {
      const r = rec[k];
      return `${r.label || k}:${r.recoveryPct}%`;
    }).join(', ');
    const sbd = ['스쿼트', '벤치프레스', '데드리프트'].map(l => {
      const x = e1[l];
      const v = x && x.currentE1 != null ? Math.round(x.currentE1) : 0;
      return `${l}:${v}kg`;
    }).join(', ');
    const o = opts || {};
    return {
      targets: Array.isArray(o.targets) ? o.targets : [],
      level: o.level || 'intermediate',
      style: o.style || 'bodybuilding',
      duration: o.duration || '30',
      durationLabel: o.durationLabel || '30분',
      gender: st.gender === 'female' ? 'female' : 'male',
      age: st.age,
      unit: st.unit || 'kg',
      sbdE1RM: sbd,
      muscleRecovery: recoveryBrief
    };
  },

  async generateAiRoutine(opts, onProgress) {
    if (!geminiEnabled()) throw new Error('config.js에 GEMINI_API_KEY를 입력하세요');
    if (!CONFIG || !String(CONFIG.GEMINI_API_KEY || '').trim()) {
      throw new Error('CONFIG.GEMINI_API_KEY가 없습니다');
    }

    /* 구버전 호환: (focus, style, onProgress) */
    if (typeof opts === 'string') {
      const focus = opts;
      const style = onProgress;
      onProgress = arguments[2];
      const focusMap = {
        upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
        lower: ['legs'],
        beginner_full: ['chest', 'back', 'legs', 'core'],
        auto: ['chest', 'back', 'legs']
      };
      opts = {
        targets: focusMap[focus] || ['chest', 'back'],
        level: focus === 'beginner_full' ? 'beginner' : 'intermediate',
        style: style === 'endurance' ? 'conditioning' : (style || 'bodybuilding'),
        duration: '30',
        durationLabel: '30분'
      };
    }

    const cool = CONFIG.GEMINI_COOLDOWN_MS || 12000;
    const since = Date.now() - (this._aiLastOkAt || 0);
    if (this._aiLastOkAt && since < cool) {
      const waitSec = Math.ceil((cool - since) / 1000);
      throw new Error(`요청이 너무 빠릅니다. ${waitSec}초 후 다시 시도해 주세요. (429 방지)`);
    }

    const ctx = this.buildAiUserContext(opts);
    /* 레거시 'arms' → 이두+삼두 */
    ctx.targets = (ctx.targets || []).flatMap(t =>
      t === 'arms' ? ['biceps', 'triceps'] : [t]
    );
    const targetKo = {
      chest: '가슴', back: '등', shoulders: '어깨',
      legs: '하체', biceps: '이두', triceps: '삼두', core: '복근',
      arms: '팔'
    };
    const levelKo = {
      beginner: '초보자 (기초 체력)',
      intermediate: '중급자 (볼륨 정체기)',
      advanced: '상급자/엘리트 (고강도 스트렝스)'
    };
    const styleKo = {
      strength: '스트렝스 (고중량 저반복)',
      bodybuilding: '보디빌딩 (근비대/펌핑)',
      conditioning: '컨디셔닝 (기능성/다이어트)'
    };
    const targetsLabel = (ctx.targets || []).map(t => targetKo[t] || t).join(', ');
    const levelLabel = levelKo[ctx.level] || ctx.level;
    const styleLabel = styleKo[ctx.style] || ctx.style;
    const durationMins = parseInt(ctx.duration, 10) || 30;
    const durationLabel = ctx.durationLabel || (
      durationMins === 60 ? '1시간' : (durationMins + '분')
    );
    const hasBi = ctx.targets.includes('biceps');
    const hasTri = ctx.targets.includes('triceps');

    const durationGuide = {
      15: '15분: 종목 1~2개, 세트·휴식 최소화한 집약 루틴. rest 60~90초 중심.',
      30: '30분: 종목 2~4개, 핵심 컴파운드+보조 균형. rest 90~150초.',
      45: '45분: 종목 4~6개, 충분한 볼륨과 워밍업 여유. rest 120~180초.',
      60: '1시간: 종목 5~8개, 스트렝스/근비대 볼륨을 채울 수 있는 조합. rest 150~240초 허용.'
    }[String(durationMins)] || `${durationLabel} 내에 워밍업·본운동·정리가 끝나도록 설계.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        description: { type: 'STRING' },
        exercises: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              equip: { type: 'STRING' },
              lift: { type: 'STRING' },
              sets: { type: 'INTEGER' },
              repLo: { type: 'INTEGER' },
              repHi: { type: 'INTEGER' },
              rir: { type: 'NUMBER' },
              rest: { type: 'INTEGER' },
              type: { type: 'STRING' },
              targetMin: { type: 'INTEGER' },
              note: { type: 'STRING' }
            },
            required: ['name', 'sets', 'repLo', 'repHi', 'rir', 'rest', 'type']
          }
        }
      },
      required: ['description', 'exercises']
    };

    const styleGuide = {
      strength: '고중량·저반복(대체로 3~6회), RIR 1~3, 휴식 180~240초. 컴파운드 우선.',
      bodybuilding: '근비대 볼륨(대체로 8~15회), RIR 0~2, 주동근/길항근 슈퍼세트 또는 펌프 마무리 권장.',
      conditioning: '대사 스트레스·짧은 휴식, 기능성/서킷 감각. 필요 시 cardio 1종 포함.'
    }[ctx.style] || '';

    const levelGuide = {
      beginner: '머신·기본 컴파운드 위주, 복잡한 고급 테크닉 지양, 세트 수 보수적.',
      intermediate: '정체 돌파용 볼륨/변형 허용, 보조 운동으로 약점 보완.',
      advanced: '고강도 스트렝스·고급 변형 허용, 회복도 낮은 부위는 과부하 금지.'
    }[ctx.level] || '';

    let armGuide = '';
    if (hasBi || hasTri) {
      armGuide = `
팔 부위 역학(필수):
- 이두(biceps)와 삼두(triceps)는 별도 타겟이다. 선택된 쪽만 주동근으로 배치하라.
${hasTri ? '- 삼두 선택 시: 장두·외측두 균형. 예) 오버헤드 익스텐션 + 케이블 프레스다운(또는 스컬크러셔) 조합.' : ''}
${hasBi ? '- 이두 선택 시: 장두·단두 균형. 예) 바벨/덤벨 컬 + 해머컬 또는 프리쳐컬.' : ''}
${hasBi && hasTri ? '- 이두+삼두 동시: 주동근/길항근 슈퍼세트(컬 ↔ 익스텐션) 권장, note에 페어를 명시.' : ''}
- "팔" 일반 운동만 뭉뚱그리지 말고 이두/삼두 종목을 구분해서 이름에 반영하라.`;
    }

    const prompt =
`당신은 스포츠의학·근력 트레이닝 코치다. 아래 조건에 맞는 오늘 1회 세션 루틴을 JSON으로만 작성하라.

타겟 부위: [${targetsLabel}]
숙련도: [${levelLabel}]
스타일: [${styleLabel}]
희망 운동 시간: [${durationLabel}] (${durationMins}분)
조건에 부합하는 주동근/길항근 슈퍼세트 혹은 적절한 세트·반복수(RIR/RPE 기반) 배치를 반영하라.

시간 제약(필수): 유저가 선택한 희망 운동 시간([${durationLabel}]) 내에 훈련이 완전히 끝날 수 있도록 종목 개수, 세트 수, 그리고 세트 간 휴식 시간(rest)을 역산하여 현실적으로 수행 가능한 루틴을 설계해라.
가이드: ${durationGuide}
총 예상 소요(워밍업 포함)가 ${durationMins}분을 넘기지 않게 맞추고, description에 예상 소요 시간을 한 줄 언급하라.
${armGuide}

유저 상태:
성별=${ctx.gender}, 나이=${ctx.age ?? '미상'}, 단위=${ctx.unit}
SBD e1RM: ${ctx.sbdE1RM}
부위별 회복도(%): ${ctx.muscleRecovery}

스타일 가이드: ${styleGuide}
숙련도 가이드: ${levelGuide}

규칙(출력 JSON 스키마는 반드시 준수):
- exercises 개수는 희망 시간에 맞게 조절(15분이면 1~2개, 1시간이면 최대 8개). 선택 타겟 부위를 우선 자극하되, 회복도가 낮은 부위는 과부하하지 말 것.
- type은 "weight" 또는 "cardio". cardio면 targetMin(분) 필수.
- equip은 바벨/덤벨/머신/케이블/맨몸/유산소 중 하나.
- lift는 스쿼트/벤치프레스/데드리프트 중 하나이거나 빈 문자열.
- RIR은 0~4 범위. 중량 숫자는 넣지 말고 세트·반복·RIR·휴식(초)만.
- rest(초)는 희망 시간에 맞게 현실어 총 세션이 시간 안에 끝나게 하라.
- description은 스포츠의학적 근거를 한국어 2~3문장.
- note에 슈퍼세트 페어·주동근/길항근 힌트를 짧게 적을 수 있다.`;

    const apiKey = String(CONFIG.GEMINI_API_KEY).trim();
    const models = [CONFIG.GEMINI_MODEL || 'gemini-3.1-flash-lite']
      .concat(CONFIG.GEMINI_FALLBACK_MODELS || [])
      .filter((m, i, arr) => m && arr.indexOf(m) === i);
    const maxRetries = Math.max(1, CONFIG.GEMINI_MAX_RETRIES || 3);
    const baseMs = CONFIG.GEMINI_RETRY_BASE_MS || 3000;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const progress = (msg) => { if (typeof onProgress === 'function') onProgress(msg); };

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    });

    let lastErr = null;
    for (let mi = 0; mi < models.length; mi++) {
      const model = models[mi];
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        progress(mi === 0 && attempt === 1
          ? 'Gemini가 루틴을 작성 중…'
          : `재시도 ${attempt}/${maxRetries} · ${model}`);

        let res;
        try {
          res = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body
          });
        } catch (netErr) {
          lastErr = new Error('Gemini 네트워크 오류: ' + (netErr.message || netErr));
          console.error('[Gemini]', lastErr);
          if (attempt < maxRetries) {
            await sleep(baseMs * attempt);
            continue;
          }
          break;
        }

        if (res.ok) {
          const raw = await res.json();
          const text = raw && raw.candidates && raw.candidates[0]
            && raw.candidates[0].content && raw.candidates[0].content.parts
            && raw.candidates[0].content.parts[0]
            ? raw.candidates[0].content.parts[0].text : '';
          let parsed;
          try { parsed = JSON.parse(text); }
          catch (e) {
            lastErr = new Error('Gemini JSON 파싱 실패 — 응답 형식을 확인하세요');
            console.error('[Gemini] JSON 파싱 실패', text);
            break;
          }
          if (!parsed || !Array.isArray(parsed.exercises) || !parsed.exercises.length) {
            lastErr = new Error('유효한 운동 목록이 없습니다');
            break;
          }
          this._aiLastOkAt = Date.now();
          return parsed;
        }

        const errTxt = await res.text().catch(() => '');
        let detail = errTxt;
        let reason = '';
        let retryMs = 0;
        try {
          const j = JSON.parse(errTxt);
          detail = (j.error && (j.error.message || j.error.status)) || errTxt;
          const info = j.error && Array.isArray(j.error.details)
            ? j.error.details.find(d => d && d.reason) : null;
          if (info && info.reason) reason = info.reason;
          /* Google이 내려주는 재시도 지연(초) */
          const retryInfo = j.error && Array.isArray(j.error.details)
            ? j.error.details.find(d => d && (d.retryDelay || (d['@type'] || '').includes('RetryInfo')))
            : null;
          if (retryInfo && retryInfo.retryDelay) {
            const m = String(retryInfo.retryDelay).match(/([\d.]+)s?/);
            if (m) retryMs = Math.ceil(parseFloat(m[1]) * 1000);
          }
        } catch (e) { /* ignore */ }

        const ra = res.headers && res.headers.get && res.headers.get('retry-after');
        if (ra && !retryMs) {
          const n = parseInt(ra, 10);
          if (!isNaN(n)) retryMs = n * 1000;
        }

        if (res.status === 429) {
          const wait = retryMs || (baseMs * attempt);
          lastErr = new Error(
            `할당량 초과(429). 무료 티어 분당/일일 한도에 걸렸습니다.\n` +
            `${Math.ceil(wait / 1000)}초 후 자동 재시도합니다…\n` +
            String(detail).slice(0, 220)
          );
          console.warn('[Gemini] 429', { model, attempt, wait, reason, detail });
          if (attempt < maxRetries || mi < models.length - 1) {
            progress(`할당량 초과 — ${Math.ceil(wait / 1000)}초 대기 후 재시도…`);
            await sleep(wait);
            continue;
          }
          throw new Error(
            'Gemini 할당량 초과(429)\n\n' +
            '무료 API는 분당·일일 요청 수 제한이 있습니다.\n' +
            '1~2분 기다린 뒤 다시 시도하거나,\n' +
            'AI Studio → 사용량에서 할당량을 확인하세요.\n\n' +
            String(detail).slice(0, 280)
          );
        }

        /* 종료·신규 차단 모델 → 같은 모델 재시도 없이 다음 모델로 */
        if (res.status === 404) {
          lastErr = new Error(`모델 사용 불가(404): ${model}\n${String(detail).slice(0, 280)}`);
          console.warn('[Gemini] 404 model unavailable', { model, detail });
          progress(`${model} 사용 불가 — 다음 모델로 전환…`);
          break;
        }

        let hint = '';
        if (res.status === 401) {
          hint = reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED'
            ? ' (401: AQ. 키/프로젝트 권한 확인)'
            : ' (401: x-goog-api-key·키 값 확인)';
        } else if (res.status === 403) hint = ' (403: 키 제한/권한)';
        else if (res.status >= 500) hint = ' (서버 오류)';

        lastErr = new Error(`Gemini HTTP ${res.status}${hint}\n${String(detail).slice(0, 400)}`);
        console.error('[Gemini]', lastErr.message, { status: res.status, model, body: errTxt });
        /* 401/403은 재시도해도 무의미 */
        if (res.status === 401 || res.status === 403) throw lastErr;
        if (attempt < maxRetries) {
          await sleep(baseMs * attempt);
          continue;
        }
        break;
      }
    }
    throw lastErr || new Error('Gemini 요청 실패');
  },

  /** Gemini 응답 → 앱 운동 객체 배열 */
  mapAiExercises(list) {
    return (list || []).map(item => {
      const type = item.type === 'cardio' ? 'cardio' : 'weight';
      if (type === 'cardio') {
        return ex({
          name: String(item.name || 'Zone2 유산소').trim(),
          type: 'cardio',
          targetMin: Math.max(5, +item.targetMin || 20),
          rest: 0,
          equip: '유산소',
          note: String(item.note || '').trim()
        });
      }
      const lift = ['스쿼트', '벤치프레스', '데드리프트'].includes(item.lift) ? item.lift : '';
      const equipOk = ['바벨', '덤벨', '머신', '케이블', '맨몸'].includes(item.equip);
      return ex({
        name: String(item.name || '운동').trim(),
        type: 'weight',
        equip: equipOk ? item.equip : '머신',
        lift,
        sets: Math.min(12, Math.max(1, +item.sets || 3)),
        repLo: Math.max(1, +item.repLo || 8),
        repHi: Math.max(1, +item.repHi || 12),
        rir: Math.min(4, Math.max(0, +item.rir || 1)),
        rest: Math.max(0, +item.rest || 120),
        note: String(item.note || '').trim()
      });
    });
  },

  paint() {
    const map = {
      local: ['로컬', 'blue'], syncing: ['동기화 중', 'amber'],
      synced: ['동기화됨', 'green'], offline: ['오프라인', 'amber'], error: ['동기화 실패', 'red']
    };
    const [txt, cls] = map[this.syncState] || map.local;
    ['syncBadge', 'syncBadge2'].forEach(id => {
      const n = document.getElementById(id);
      if (!n) return;
      n.className = 'pill ' + cls;
      n.textContent = (this.user ? this.user.name + ' · ' : '') + txt;
    });
  }
};

/* 온라인 복귀 시 자동 재시도 */
window.addEventListener('online', () => { Store.push(); });
window.addEventListener('offline', () => { Store.syncState = 'offline'; Store.paint(); });
