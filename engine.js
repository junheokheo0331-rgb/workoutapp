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

/* ---------- 로그 접근 ---------- */
function getLog(dateStr, create) {
  const L = Store.s.logs;
  if (!L[dateStr]) {
    if (!create) return null;
    L[dateStr] = { date: dateStr, programId: null, startedAt: null, endedAt: null, sets: {} };
  }
  return L[dateStr];
}
function dayDone(dateStr) {
  const d = getLog(dateStr, false);
  if (!d) return 0;
  let n = 0;
  Object.values(d.sets || {}).forEach(arr => (arr || []).forEach(s => { if (s && s.done) n++; }));
  return n;
}
function progTotalSets(pId) {
  const p = (Store.s.programs || []).find(x => x.id === pId);
  if (!p) return 0;
  return p.items.reduce((a, e) => a + (e.type === 'cardio' ? 1 : e.sets), 0);
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

  /** 특정 날짜 로그에서 해당 리프트의 최고 e1RM */
  bestE1ForDate(dateStr, lift) {
    const log = Store.s.logs[dateStr];
    if (!log || !log.sets) return 0;
    let best = 0;
    Object.entries(log.sets).forEach(([exId, arr]) => {
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
   * 기준 기록에서 출발해 이전 세션들을 날짜 순으로 반영하되,
   * 한 세션당 상승·하락 폭에 상한을 둔다.
   * → RIR을 한 번 잘못 매겨도 처방이 폭주하거나 무너지지 않는다.
   */
  appliedE1(lift, targetDate) {
    const st = Store.s.settings;
    const b = st.baseline[lift];
    if (!b || !b.w) return 0;
    let cur = e1rmOf(b.w, b.reps, b.rir);
    this.datesSorted().filter(d => d < targetDate).forEach(d => {
      const best = this.bestE1ForDate(d, lift);
      if (!best) return;
      const up = cur * (1 + st.capUp), dn = cur * (1 - st.capDown);
      cur = Math.round(Math.min(Math.max(best, dn), up) * 10) / 10;
    });
    return Math.round(cur * 10) / 10;
  },

  /** 대상 날짜 이전에서 이 운동을 마지막으로 수행한 기록 */
  prevRecord(exId, targetDate) {
    const dates = this.datesSorted().filter(d => d < targetDate).reverse();
    for (const d of dates) {
      const log = Store.s.logs[d];
      if (log && log.sets && log.sets[exId]) {
        const arr = log.sets[exId].filter(s => s && s.done && +s.reps > 0);
        if (arr.length) return { date: d, sets: log.sets[exId] };
      }
    }
    return null;
  },

  /** 이전 기록을 사람이 읽는 한 줄로 */
  prevText(exId, targetDate, unitLabel) {
    const prev = this.prevRecord(exId, targetDate);
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
   */
  targets(e, targetDate) {
    const uLabel = Store.s.settings.unit || 'kg';
    if (e.type === 'cardio') {
      return [{ w: '', reps: '', text: `유산소 ${e.targetMin}분`, kind: 'cardio' }];
    }
    const unit = this.unitFor(e);
    const out = [];

    /* ── 메인 리프트 ── */
    if (e.lift) {
      const e1 = this.appliedE1(e.lift, targetDate);
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
    const prev = this.prevRecord(e.id, targetDate);
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
