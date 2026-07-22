/* ============================================================
   engine.js — RPE 표 · e1RM 추정 · RIR 기반 자동조절 처방 엔진
   이 파일이 앱의 핵심이다. UI가 바뀌어도 여기 로직은 그대로다.
   ============================================================ */
'use strict';

/* ---------- RPE ↔ %1RM (Zourdos et al. 2016 / RTS) ---------- */
const RPE_COLS = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
const RPE_TABLE = [
  [100.0, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3],
  [95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7],
  [92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1],
  [89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6],
  [86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2],
  [83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9],
  [81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7],
  [78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0],
  [76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3],
  [73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6],
  [70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9],
  [68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.2]
];
function rpeColIdx(rpe) {
  let best = 0, bd = 99;
  RPE_COLS.forEach((v, i) => { const d = Math.abs(v - rpe); if (d < bd) { bd = d; best = i; } });
  return best;
}
function pct1RM(reps, rpe) {
  const r = Math.min(12, Math.max(1, Math.round(reps)));
  return RPE_TABLE[r - 1][rpeColIdx(rpe)];
}
/** 무게 · 반복 · RIR → 추정 1RM */
function e1rmOf(w, reps, rir) {
  if (!w || !reps) return 0;
  const p = pct1RM(reps, 10 - (rir == null ? 0 : rir));
  return Math.round((w / (p / 100)) * 10) / 10;
}
/** 이 부하 · 이 e1RM · 이 RPE라면 몇 회가 나오는가 */
function repsAt(load, e1, rpe) {
  if (!e1 || !load) return 0;
  const target = (load / e1) * 100;
  const col = rpeColIdx(rpe);
  let out = 1;
  for (let r = 1; r <= 12; r++) { if (RPE_TABLE[r - 1][col] >= target) out = r; }
  return out;
}

/* ---------- 날짜 헬퍼 ---------- */
function fmtDate(d) { return (d.getMonth() + 1) + '/' + d.getDate(); }
function dateStrOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getTodayStr() { return dateStrOf(new Date()); }
function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function hhmmss(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h > 0 ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

/* ---------- 유산소 존 (카르보넨) ---------- */
const CardioEngine = {
  calculateZones(age, rhr = 70) {
    if (!age) return null;
    const maxHR = 220 - age;
    const hrr = maxHR - rhr;
    const z = (lo, hi) => [Math.round(hrr * lo + rhr), Math.round(hrr * hi + rhr)];
    return { maxHR, rhr, zone2: z(0.60, 0.70), zone3: z(0.70, 0.80), zone4: z(0.80, 0.90) };
  },
  renderDashboard() {
    const st = Store.s.settings;
    const zones = this.calculateZones(st.age, st.rhr || 70);
    if (!zones) return '';
    return `<div class="cardio-dash">
      <div style="font-size:12px;font-weight:800;color:#047857;margin-bottom:4px">
        Zone2 목표 심박 ${zones.zone2[0]}–${zones.zone2[1]} bpm</div>
      <div class="tiny" style="color:#065f46">
        최대심박 ${zones.maxHR} · 안정시 ${zones.rhr} 기준(카르보넨). 대화가 가능한 강도로 ${st.cardioMin}분.</div>
    </div>`;
  }
};

/* ---------- 프로그램 조회 헬퍼 ---------- */
function allExercises() {
  const out = [];
  (Store.s.programs || []).forEach(p => (p.items || []).forEach(e => out.push(e)));
  return out;
}
function findExById(id) { return allExercises().find(e => e.id === id) || null; }

/* ---------- 다중 세션 로그 접근 ---------- */
function newSessionId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 구형(하루 1로그) → { date, sessions:[] } 로 정규화 */
function normalizeDayLog(day, dateStr) {
  if (!day || typeof day !== 'object') return { date: dateStr, sessions: [] };
  if (Array.isArray(day.sessions)) {
    day.date = day.date || dateStr;
    return day;
  }
  if (day.sets) {
    return {
      date: dateStr,
      sessions: [{
        id: day.id || ('smig_' + dateStr),
        programId: day.programId || null,
        startedAt: day.startedAt || null,
        endedAt: day.endedAt || null,
        sets: day.sets || {}
      }]
    };
  }
  return { date: dateStr, sessions: Array.isArray(day) ? day : [] };
}

function getDayLog(dateStr, create) {
  const L = Store.s.logs;
  if (!L[dateStr]) {
    if (!create) return null;
    L[dateStr] = { date: dateStr, sessions: [] };
    return L[dateStr];
  }
  const norm = normalizeDayLog(L[dateStr], dateStr);
  L[dateStr] = norm;
  return norm;
}

function getSessions(dateStr) {
  const day = getDayLog(dateStr, false);
  return day ? (day.sessions || []) : [];
}

function getSession(dateStr, sessionId, create) {
  if (!sessionId && !create) return null;
  const day = getDayLog(dateStr, !!create);
  if (!day) return null;
  let sess = day.sessions.find(s => s.id === sessionId);
  if (!sess && create) {
    sess = {
      id: sessionId || newSessionId(),
      programId: null, startedAt: null, endedAt: null, sets: {}
    };
    day.sessions.push(sess);
  }
  return sess || null;
}

/** @deprecated 호환 — 해당 날짜의 마지막 세션(또는 생성) */
function getLog(dateStr, create) {
  const day = getDayLog(dateStr, create);
  if (!day) return null;
  if (!day.sessions.length) {
    if (!create) return null;
    const sess = { id: newSessionId(), programId: null, startedAt: null, endedAt: null, sets: {} };
    day.sessions.push(sess);
    return sess;
  }
  return day.sessions[day.sessions.length - 1];
}

function sessionDoneSets(sess) {
  let n = 0;
  Object.values((sess && sess.sets) || {}).forEach(arr => {
    (arr || []).forEach(s => { if (s && s.done) n++; });
  });
  return n;
}

function dayDone(dateStr) {
  return getSessions(dateStr).reduce((a, s) => a + sessionDoneSets(s), 0);
}

/** 완료 세트가 1개 이상인 세션 수 (캘린더 도트) */
function daySessionCount(dateStr) {
  return getSessions(dateStr).filter(s => sessionDoneSets(s) > 0 || s.endedAt).length;
}

function sessionVolume(sess) {
  let v = 0;
  Object.values((sess && sess.sets) || {}).forEach(arr => {
    (arr || []).forEach(s => {
      if (s && s.done && +s.w > 0 && +s.reps > 0) v += (+s.w) * (+s.reps);
    });
  });
  return v;
}

function progTotalSets(pId) {
  const p = (Store.s.programs || []).find(x => x.id === pId);
  if (!p) return 0;
  return p.items.reduce((a, e) => a + (e.type === 'cardio' ? 1 : e.sets), 0);
}

function calDotsHtml(n, todayCls) {
  if (!n) return '<div class="cal-dots"></div>';
  const max = Math.min(n, 5);
  let dots = '';
  for (let i = 0; i < max; i++) dots += '<i></i>';
  if (n > 5) dots += '<i class="more"></i>';
  return `<div class="cal-dots${todayCls ? ' on-today' : ''}">${dots}</div>`;
}

/* ============================================================
   Engine — 자동조절 처방
   ============================================================ */
const Engine = {
  unitFor(e) {
    const st = Store.s.settings;
    if (e.equip === '바벨') return st.unitBar;
    if (e.equip === '덤벨') return st.unitDumbbell;
    return st.unitMachine;
  },

  datesSorted() { return Object.keys(Store.s.logs || {}).sort(); },

  /** 특정 날짜(전 세션)에서 해당 리프트의 최고 e1RM */
  bestE1ForDate(dateStr, lift) {
    let best = 0;
    getSessions(dateStr).forEach(sess => {
      const v = this.bestE1ForSession(sess, lift);
      if (v > best) best = v;
    });
    return best;
  },

  bestE1ForSession(sess, lift) {
    if (!sess || !sess.sets) return 0;
    let best = 0;
    Object.entries(sess.sets).forEach(([exId, arr]) => {
      const e = findExById(exId);
      if (!e || e.lift !== lift) return;
      (arr || []).forEach(s => {
        if (s && s.done) {
          const v = e1rmOf(+s.w, +s.reps, +s.rir);
          if (v > best) best = v;
        }
      });
    });
    return best;
  },

  /**
   * 대상 날짜에 적용할 e1RM.
   * beforeTs가 있으면 같은 날 이전 세션도 반영(하루 다중 세션).
   */
  appliedE1(lift, targetDate, beforeTs) {
    const st = Store.s.settings;
    const b = st.baseline[lift];
    if (!b || !b.w) return 0;
    let cur = e1rmOf(b.w, b.reps, b.rir);
    const applyBest = (best) => {
      if (!best) return;
      const up = cur * (1 + st.capUp), dn = cur * (1 - st.capDown);
      cur = Math.round(Math.min(Math.max(best, dn), up) * 10) / 10;
    };
    this.datesSorted().filter(d => d < targetDate).forEach(d => {
      applyBest(this.bestE1ForDate(d, lift));
    });
    if (beforeTs) {
      getSessions(targetDate)
        .filter(s => (s.startedAt || 0) < beforeTs)
        .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
        .forEach(s => applyBest(this.bestE1ForSession(s, lift)));
    }
    return Math.round(cur * 10) / 10;
  },

  /** 대상 시각 이전에서 이 운동을 마지막으로 수행한 기록 */
  prevRecord(exId, targetDate, beforeTs) {
    const dates = this.datesSorted().filter(d => d <= targetDate).reverse();
    for (const d of dates) {
      const sessions = getSessions(d).slice()
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      for (const sess of sessions) {
        if (d === targetDate) {
          if (beforeTs == null) continue;
          if ((sess.startedAt || 0) >= beforeTs) continue;
        }
        if (sess.sets && sess.sets[exId]) {
          const arr = sess.sets[exId].filter(s => s && s.done && +s.reps > 0);
          if (arr.length) return { date: d, sets: sess.sets[exId], sessionId: sess.id };
        }
      }
    }
    return null;
  },

  /** 이전 기록을 사람이 읽는 한 줄로 */
  prevText(exId, targetDate, unitLabel, beforeTs) {
    const prev = this.prevRecord(exId, targetDate, beforeTs);
    if (!prev) return null;
    const e = findExById(exId);
    if (e && e.type === 'cardio') return `${prev.date} · 완료`;
    const parts = prev.sets
      .filter(s => s && s.done && +s.reps > 0)
      .map(s => `${+s.w}${unitLabel}×${+s.reps}` + (s.rir != null ? `(R${+s.rir})` : ''));
    if (!parts.length) return null;
    return `${prev.date} · ${parts.join(' / ')}`;
  },

  /**
   * 세트별 목표 산출.
   *  - 메인 리프트: e1RM 기반. 증량 단위가 크면 중량 대신 '반복수'가 진행을 담당한다.
   *  - 보조 운동: 세트별 이중 점진(반복 +1 → 상한 도달 시 증량 후 하한 리셋).
   *  - 레스트포즈: RIR이 무의미하므로 고정 중량에서의 총 반복수로 진행.
   * @param {number} [beforeTs] 현재 세션 startedAt — 같은 날 이전 세션 반영
   */
  targets(e, targetDate, beforeTs) {
    const uLabel = Store.s.settings.unit || 'kg';
    if (e.type === 'cardio') {
      return [{ w: '', reps: '', text: `유산소 ${e.targetMin}분`, kind: 'cardio' }];
    }
    const unit = this.unitFor(e);
    const out = [];

    /* ── 메인 리프트 ── */
    if (e.lift) {
      const e1 = this.appliedE1(e.lift, targetDate, beforeTs);
      if (!e1) {
        for (let i = 0; i < e.sets; i++) {
          out.push({
            w: '', reps: e.repLo, kind: 'nobase',
            text: `${e.lift} 기준 기록을 먼저 입력하세요 (설정)`
          });
        }
        return out;
      }
      const rpe = 10 - e.rir;
      let w0 = e1 * pct1RM(e.repLo, rpe) / 100;
      w0 = e.round === 'floor' ? Math.floor(w0 / unit) * unit : Math.round(w0 / unit) * unit;
      if (w0 <= 0) w0 = unit;
      let r0 = repsAt(w0, e1, rpe);
      if (r0 > e.repHi) { w0 += unit; r0 = repsAt(w0, e1, rpe); }
      const reps = Math.max(e.repLo, r0);
      for (let i = 0; i < e.sets; i++) {
        out.push({ w: w0, reps, kind: 'main', e1, text: `${w0}${uLabel} × ${reps}회 @RIR${e.rir}` });
      }
      return out;
    }

    /* ── 보조 · 레스트포즈 ── */
    const prev = this.prevRecord(e.id, targetDate, beforeTs);
    for (let i = 0; i < e.sets; i++) {
      const p = prev && prev.sets[i] && prev.sets[i].done ? prev.sets[i] : null;
      if (!p || !+p.w) {
        out.push({
          w: '', reps: e.repLo, kind: 'first',
          text: e.mode === 'restpause'
            ? `무게 자율 · 총 ${e.repLo}~${e.repHi}회`
            : `무게 자율 · ${e.repLo}~${e.repHi}회 @RIR${e.rir}`
        });
        continue;
      }
      const pw = +p.w, pr = +p.reps;
      if (pr >= e.repHi) {
        const nw = Math.round((pw + unit) * 10) / 10;
        out.push({ w: nw, reps: e.repLo, kind: 'up', text: `${nw}${uLabel} × ${e.repLo}회 ▲증량` });
      } else {
        out.push({
          w: pw, reps: pr + 1, kind: 'rep',
          text: `${pw}${uLabel} × ${pr + 1}회` + (e.mode === 'restpause' ? ' (총합)' : '')
        });
      }
    }
    return out;
  }
};

/* ============================================================
   Analytics — 해부학적 피로도 · e1RM · 주간 볼륨
   ============================================================ */

/** 근육군별 완전 회복 기준 시간(시간). 반감기(half-life)로 사용한다. */
const RECOVERY_TIME_HOURS = {
  /* 대근육 · 하체 / 후면사슬 — 72h */
  quadriceps: 72,
  hamstrings: 72,
  gluteus_maximus: 72,
  lower_back: 72,
  /* 상체 대근육 · 가슴 / 등 / 어깨 전면 — 48h */
  pectoralis_major: 48,
  latissimus_dorsi: 48,
  trapezius: 48,
  rhomboids: 48,
  posterior_deltoid: 48,
  anterior_deltoid: 48,
  /* 소근육 · 팔 / 측면삼각 / 코어 / 종아리 — 24h */
  lateral_deltoid: 24,
  biceps_brachii: 24,
  triceps_brachii: 24,
  forearms: 24,
  core: 24,
  calves: 24
};

/** 표시용 한글 라벨 */
const MUSCLE_LABEL_KO = {
  quadriceps: '대퇴사두',
  hamstrings: '햄스트링',
  gluteus_maximus: '대둔근',
  lower_back: '하부 기립근',
  pectoralis_major: '대흉근',
  latissimus_dorsi: '광배근',
  trapezius: '승모근',
  rhomboids: '능형근',
  posterior_deltoid: '후면 삼각',
  anterior_deltoid: '전면 삼각',
  lateral_deltoid: '측면 삼각',
  biceps_brachii: '이두',
  triceps_brachii: '삼두',
  forearms: '전완',
  core: '코어',
  calves: '종아리'
};

/**
 * react-muscle-highlighter slug ↔ 엔진 근육키 (body-map.js와 동일 소스)
 * 분석 SVG 색상 바인딩의 기준 테이블.
 */
const SLUG_TO_ENGINE_MUSCLES = {
  chest: ['pectoralis_major'],
  biceps: ['biceps_brachii'],
  triceps: ['triceps_brachii'],
  quadriceps: ['quadriceps'],
  hamstring: ['hamstrings'],
  gluteal: ['gluteus_maximus'],
  calves: ['calves'],
  forearm: ['forearms'],
  abs: ['core'],
  obliques: ['core'],
  trapezius: ['trapezius'],
  deltoids: ['anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid'],
  'upper-back': ['latissimus_dorsi', 'rhomboids'],
  'lower-back': ['lower_back'],
  adductors: ['hamstrings', 'gluteus_maximus'],
  tibialis: ['calves']
};

/**
 * 운동명(또는 lift 키) → 동원 근육군.
 * 키는 부분 일치에도 쓰이므로 구체적 이름일수록 앞에 두는 편이 안전하다.
 */
const EXERCISE_MUSCLE_MAP = {
  /* ── 메인 리프트 (lift 필드와 동일 키) ── */
  '스쿼트': ['quadriceps', 'gluteus_maximus', 'lower_back'],
  '벤치프레스': ['pectoralis_major', 'anterior_deltoid', 'triceps_brachii'],
  '데드리프트': ['hamstrings', 'gluteus_maximus', 'lower_back', 'latissimus_dorsi'],

  /* ── 하체 ── */
  '백스쿼트': ['quadriceps', 'gluteus_maximus', 'lower_back'],
  '레그프레스': ['quadriceps', 'gluteus_maximus'],
  '루마니안 데드리프트': ['hamstrings', 'gluteus_maximus', 'lower_back'],
  '시티드 레그컬': ['hamstrings'],
  '라잉 레그컬': ['hamstrings'],
  '레그컬': ['hamstrings'],
  '레그익스텐션': ['quadriceps'],
  '힙쓰러스트': ['gluteus_maximus', 'hamstrings', 'core'],
  '카프레이즈': ['calves'],
  '카프': ['calves'],

  /* ── 밀기(가슴·어깨) ── */
  '인클라인 벤치': ['pectoralis_major', 'anterior_deltoid', 'triceps_brachii'],
  '인클라인 스미스': ['pectoralis_major', 'anterior_deltoid', 'triceps_brachii'],
  '체스트프레스': ['pectoralis_major', 'anterior_deltoid', 'triceps_brachii'],
  '케이블 플라이': ['pectoralis_major'],
  '플라이': ['pectoralis_major'],
  '숄더프레스': ['anterior_deltoid', 'lateral_deltoid', 'triceps_brachii'],
  '사이드레터럴': ['lateral_deltoid'],
  '사레': ['lateral_deltoid'],
  '프론트': ['anterior_deltoid'],
  '덤벨 콤보': ['lateral_deltoid', 'anterior_deltoid'],

  /* ── 당기기(등) ── */
  '랫풀다운': ['latissimus_dorsi', 'biceps_brachii', 'rhomboids'],
  '풀다운': ['latissimus_dorsi', 'biceps_brachii'],
  '리니어 로우': ['latissimus_dorsi', 'rhomboids', 'biceps_brachii', 'posterior_deltoid'],
  '로우': ['latissimus_dorsi', 'rhomboids', 'biceps_brachii'],
  '리버스 팩덱': ['posterior_deltoid', 'rhomboids'],
  '페이스풀': ['posterior_deltoid', 'trapezius'],

  /* ── 팔 ── */
  '푸시다운': ['triceps_brachii'],
  '익스텐션': ['triceps_brachii'],
  '프리쳐컬': ['biceps_brachii'],
  '케이블컬': ['biceps_brachii'],
  '해머컬': ['biceps_brachii', 'forearms'],
  '컬': ['biceps_brachii']
};

/** 볼륨 → 초기 피로 환산 스케일(kg·reps). 한 세션 중간~고볼륨이 ~0.6–0.9가 되도록. */
const FATIGUE_VOLUME_SCALE = 4000;

const Analytics = {
  /** 운동 객체 → 근육군 배열 */
  musclesForExercise(e) {
    if (!e || e.type === 'cardio') return [];
    if (e.lift && EXERCISE_MUSCLE_MAP[e.lift]) return EXERCISE_MUSCLE_MAP[e.lift].slice();
    const name = String(e.name || '');
    /* 긴 키 우선 매칭 */
    const keys = Object.keys(EXERCISE_MUSCLE_MAP).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (name.indexOf(k) !== -1) return EXERCISE_MUSCLE_MAP[k].slice();
    }
    return [];
  },

  /** 완료 세트의 tonnage 합 (무게×반복). 세트 수는 각 행이 이미 한 세트. */
  setVolume(sets) {
    let v = 0;
    (sets || []).forEach(s => {
      if (s && s.done && +s.w > 0 && +s.reps > 0) v += (+s.w) * (+s.reps);
    });
    return v;
  },

  /** 날짜 문자열 → Date (세션 종료 시각이 있으면 그걸 우선) */
  sessionTime(dateStr, sess) {
    if (sess && sess.endedAt) {
      const t = new Date(sess.endedAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (sess && sess.startedAt) {
      const t = new Date(sess.startedAt).getTime();
      if (!isNaN(t)) return t;
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 20, 0, 0).getTime();
  },

  /** day payload → sessions[] (구형 호환) */
  sessionsOf(day, dateStr) {
    return normalizeDayLog(day || { date: dateStr }, dateStr).sessions || [];
  },

  volumeToFatigue(volume) {
    if (!volume || volume <= 0) return 0;
    return Math.min(1, 1 - Math.exp(-volume / FATIGUE_VOLUME_SCALE));
  },

  /**
   * 부위별 실시간 회복도(0~100%).
   * 세션마다 볼륨 기반 피로를 누적하고, RECOVERY_TIME_HOURS를 반감기로 지수 감쇠.
   */
  getMuscleRecoveryStatus(logs, nowMs) {
    logs = logs || (Store.s && Store.s.logs) || {};
    const now = nowMs != null ? nowMs : Date.now();
    const state = {};
    Object.keys(RECOVERY_TIME_HOURS).forEach(m => {
      state[m] = { fatigue: 0, lastTs: null, lastVolume: 0 };
    });

    const events = [];
    Object.keys(logs).sort().forEach(dateStr => {
      this.sessionsOf(logs[dateStr], dateStr).forEach(sess => {
        if (!sess || !sess.sets) return;
        const ts = this.sessionTime(dateStr, sess);
        const muscleVol = {};
        Object.entries(sess.sets).forEach(([exId, arr]) => {
          const e = findExById(exId);
          const vol = this.setVolume(arr);
          if (!vol) return;
          this.musclesForExercise(e).forEach(m => {
            if (!RECOVERY_TIME_HOURS[m]) return;
            muscleVol[m] = (muscleVol[m] || 0) + vol;
          });
        });
        if (Object.keys(muscleVol).length) events.push({ ts, muscleVol });
      });
    });
    events.sort((a, b) => a.ts - b.ts);

    events.forEach(ev => {
      Object.keys(ev.muscleVol).forEach(m => {
        const half = RECOVERY_TIME_HOURS[m];
        const st = state[m];
        if (st.lastTs != null) {
          const hoursGap = Math.max(0, (ev.ts - st.lastTs) / 3600000);
          st.fatigue *= Math.pow(0.5, hoursGap / half);
        }
        st.fatigue = Math.min(1, st.fatigue + this.volumeToFatigue(ev.muscleVol[m]));
        st.lastTs = ev.ts;
        st.lastVolume = ev.muscleVol[m];
      });
    });

    const out = {};
    Object.keys(RECOVERY_TIME_HOURS).forEach(m => {
      const half = RECOVERY_TIME_HOURS[m];
      const st = state[m];
      let fatigue = st.fatigue;
      let hoursSince = null;
      if (st.lastTs != null) {
        hoursSince = Math.max(0, (now - st.lastTs) / 3600000);
        fatigue *= Math.pow(0.5, hoursSince / half);
      }
      fatigue = Math.min(1, Math.max(0, fatigue));
      const recoveryPct = Math.round((1 - fatigue) * 1000) / 10;
      out[m] = {
        muscle: m,
        label: MUSCLE_LABEL_KO[m] || m,
        recoveryPct,
        fatigue: Math.round(fatigue * 1000) / 1000,
        hoursSinceLast: hoursSince == null ? null : Math.round(hoursSince * 10) / 10,
        lastTrainedAt: st.lastTs == null ? null : dateStrOf(new Date(st.lastTs)),
        lastVolume: Math.round(st.lastVolume),
        recoveryHours: half
      };
    });
    return out;
  },

  /**
   * 스쿼트·벤치·데드 e1RM 트래킹.
   * 최근 로그의 세션별 최고 e1RM + 현재 적용 e1RM.
   */
  getMainLiftE1RM(logs, asOfDate) {
    logs = logs || (Store.s && Store.s.logs) || {};
    const lifts = ['스쿼트', '벤치프레스', '데드리프트'];
    const target = asOfDate || dateStrOf(new Date(Date.now() + 86400000));
    const dates = Object.keys(logs).sort();
    const result = {};

    lifts.forEach(lift => {
      const baseline = (Store.s.settings.baseline || {})[lift];
      const baselineE1 = baseline && baseline.w
        ? e1rmOf(baseline.w, baseline.reps, baseline.rir) : 0;
      const history = [];
      let peak = baselineE1;
      let latest = 0;
      let latestDate = null;

      dates.forEach(d => {
        const best = Engine.bestE1ForDate(d, lift);
        if (!best) return;
        history.push({ date: d, e1rm: best });
        if (best > peak) peak = best;
        latest = best;
        latestDate = d;
      });

      const applied = Engine.appliedE1(lift, target);
      const weekStartStr = dateStrOf(this.weekStart(new Date()));
      const e1LastWeek = Engine.appliedE1(lift, weekStartStr) || 0;
      const current = applied || latest || baselineE1 || null;
      let deltaFromLastWeek = null;
      if (current != null && e1LastWeek > 0) {
        deltaFromLastWeek = Math.round((current - e1LastWeek) * 10) / 10;
      }

      result[lift] = {
        lift,
        baselineE1: baselineE1 || null,
        currentE1: current,
        peakE1: peak || null,
        latestSessionE1: latest || null,
        latestDate,
        history,
        deltaFromBaseline: baselineE1 && current
          ? Math.round((current - baselineE1) * 10) / 10 : null,
        deltaFromLastWeek,
        e1LastWeek: e1LastWeek || null
      };
    });
    return result;
  },

  /** 월요일 00:00 기준 주의 시작 Date */
  weekStart(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const off = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - off);
    return x;
  },

  /** [start, end) 구간 총 볼륨 */
  volumeBetween(logs, startMs, endMs) {
    logs = logs || {};
    let total = 0;
    Object.keys(logs).forEach(dateStr => {
      this.sessionsOf(logs[dateStr], dateStr).forEach(sess => {
        const ts = this.sessionTime(dateStr, sess);
        if (ts < startMs || ts >= endMs) return;
        total += sessionVolume(sess);
      });
    });
    return total;
  },

  /**
   * 이번 주 요일별 볼륨 (월~일).
   * @returns {{ days: Array<{key,label,dateStr,volume,isToday}>, total, unit, changePct, lastWeek }}
   */
  getDailyVolumesThisWeek(logs, nowDate) {
    logs = logs || (Store.s && Store.s.logs) || {};
    const now = nowDate ? new Date(nowDate) : new Date();
    const todayStr = dateStrOf(now);
    const thisStart = this.weekStart(now);
    const labels = ['월', '화', '수', '목', '금', '토', '일'];
    const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const days = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(thisStart);
      d.setDate(thisStart.getDate() + i);
      const dateStr = dateStrOf(d);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const volume = Math.round(
        this.volumeBetween(logs, d.getTime(), next.getTime())
      );
      days.push({
        key: keys[i],
        label: labels[i],
        dateStr,
        volume,
        isToday: dateStr === todayStr
      });
    }

    const cmp = this.getWeeklyVolumeComparison(logs, now);
    return {
      days,
      total: cmp.thisWeek,
      lastWeek: cmp.lastWeek,
      changePct: cmp.changePct,
      unit: cmp.unit,
      thisWeekStart: cmp.thisWeekStart
    };
  },

  /**
   * 이번 주 vs 지난주 총 볼륨 및 증감률(%).
   * 주 경계는 월요일 시작(앱 홈 주간바와 동일).
   */
  getWeeklyVolumeComparison(logs, nowDate) {
    logs = logs || (Store.s && Store.s.logs) || {};
    const now = nowDate ? new Date(nowDate) : new Date();
    const thisStart = this.weekStart(now);
    const nextStart = new Date(thisStart);
    nextStart.setDate(nextStart.getDate() + 7);
    const prevStart = new Date(thisStart);
    prevStart.setDate(prevStart.getDate() - 7);

    const thisWeek = this.volumeBetween(logs, thisStart.getTime(), nextStart.getTime());
    const lastWeek = this.volumeBetween(logs, prevStart.getTime(), thisStart.getTime());

    let changePct = null;
    if (lastWeek > 0) changePct = Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10;
    else if (thisWeek > 0) changePct = 100;

    return {
      thisWeek: Math.round(thisWeek),
      lastWeek: Math.round(lastWeek),
      changePct,
      thisWeekStart: dateStrOf(thisStart),
      lastWeekStart: dateStrOf(prevStart),
      unit: (Store.s && Store.s.settings && Store.s.settings.unit) || 'kg'
    };
  },

  /** 분석 탭용 스냅샷 */
  snapshot() {
    return {
      recovery: this.getMuscleRecoveryStatus(),
      e1rm: this.getMainLiftE1RM(),
      weeklyVolume: this.getWeeklyVolumeComparison(),
      dailyVolume: this.getDailyVolumesThisWeek()
    };
  }
};

/** 전역 별칭 — 요구 스펙 이름 */
function getMuscleRecoveryStatus(logs, nowMs) {
  return Analytics.getMuscleRecoveryStatus(logs, nowMs);
}
function getMainLiftE1RM(logs, asOfDate) {
  return Analytics.getMainLiftE1RM(logs, asOfDate);
}
function getWeeklyVolumeComparison(logs, nowDate) {
  return Analytics.getWeeklyVolumeComparison(logs, nowDate);
}
function getDailyVolumesThisWeek(logs, nowDate) {
  return Analytics.getDailyVolumesThisWeek(logs, nowDate);
}
