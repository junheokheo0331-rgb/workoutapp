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
    isFirstRun: true, age: null, rhr: 70, unit: 'kg',
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
    return this.s;
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
          this.s.logs[r.log_date] = r.payload;
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
