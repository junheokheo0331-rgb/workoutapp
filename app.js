/* ============================================================
   app.js — UI 렌더링 · 탭 라우팅 · 타이머 · 이벤트
   데이터/알고리즘은 store.js · engine.js 에 있다.
   ============================================================ */
'use strict';

/* ---------- UI 헬퍼 ---------- */
function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
let toastT = null;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), 1900);
}
function modal(title, html, onOpen) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="sheet"><h3>${esc(title)}</h3>${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  if (onOpen) onOpen(m);
  return m;
}
function closeModal() { document.querySelectorAll('.modal').forEach(m => m.remove()); }
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_HINT_KO = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

/* ============================================================
   App
   ============================================================ */
const App = {
  tab: 'home',
  cur: null,            // { date, programId, sessionId }
  editProgramId: null,
  bodySide: 'front',    // analyze 탭 전면/후면
  _initGender: 'male',
  communityPosts: [],
  _aiTargets: ['chest', 'back'],
  _aiLevel: 'intermediate',
  _aiStyle: 'bodybuilding',
  _aiDuration: '30',
  viewMonday: (function () {
    const d = new Date(); const off = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - off); d.setHours(0, 0, 0, 0); return d;
  })(),
  tick: null,

  async init() {
    Store.load();
    this.restore();

    document.querySelectorAll('nav.tabs button').forEach(b => {
      b.addEventListener('click', () => this.go(b.dataset.tab));
    });
    el('hAction').addEventListener('click', () => {
      if (this.tab === 'workout') this.finishSession(); else this.go('settings');
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.onResume(); });
    window.addEventListener('focus', () => this.onResume());
    this.tick = setInterval(() => this.onTick(), 250);

    /* 자동 로그인 — 세션이 있으면 로그인 화면을 건너뛴다 */
    if (cloudEnabled()) {
      const u = await Store.restoreSession();
      if (u) { await Store.syncNow(); }
    }
    Store.paint();
    this.go('home');

    /* 재방문 유저: 스플래시·초기세팅을 건너뛰고 바로 홈 */
    if (this.hasCompletedSetup()) {
      if (Store.s.settings.isFirstRun) {
        Store.s.settings.isFirstRun = false;
        Store.save();
      }
      this.hideSplash(true);
    } else {
      this.showSplash();
    }
  },

  /* ---------- 스플래시 · 최초 세팅 ---------- */
  /** 초기 세팅을 마쳤거나, 의미 있는 세팅/기록이 이미 있으면 true */
  hasCompletedSetup() {
    const st = Store.s && Store.s.settings;
    if (!st) return false;
    if (st.isFirstRun === false) return true;
    if (st.age != null && st.age !== '') return true;
    const b = st.baseline || {};
    if (Object.keys(b).some(k => b[k] && +b[k].w > 0)) return true;
    if (Store.s.logs && Object.keys(Store.s.logs).length > 0) return true;
    return false;
  },
  showSplash() {
    const splash = el('splashScreen');
    if (splash) {
      splash.classList.remove('hide', 'hide-splash');
      splash.style.display = '';
    }
    const btn = el('splashBtn');
    if (btn) btn.style.display = 'inline-block';
  },
  hideSplash(immediate) {
    const splash = el('splashScreen');
    if (!splash) return;
    if (immediate) {
      splash.classList.add('hide');
      splash.classList.remove('hide-splash');
    } else {
      splash.classList.add('hide-splash');
      setTimeout(() => splash.classList.add('hide'), 400);
    }
  },
  startFromSplash() {
    this.hideSplash(false);
    setTimeout(() => {
      if (cloudEnabled() && !Store.user) this.showAuth();
      else if (!this.hasCompletedSetup()) this.showInitialSetup();
    }, 400);
  },

  /* ---------- 인증 ---------- */
  showAuth(mode) {
    mode = mode || 'in';
    const html = `
      <div class="tiny" style="margin-bottom:12px">
        이름과 비밀번호만으로 가입합니다. 이메일 인증은 없습니다.
        같은 이름·비밀번호로 다른 기기에서 로그인하면 기록이 그대로 따라옵니다.
      </div>
      <div class="field"><label>이름</label>
        <input id="auName" placeholder="본명 또는 아이디" autocomplete="username"></div>
      <div class="field"><label>비밀번호 (${CFG.MIN_PASSWORD}자 이상)</label>
        <input id="auPw" type="password" autocomplete="current-password"></div>
      <div id="auMsg" class="tiny" style="color:var(--bad);min-height:16px"></div>
      <div class="btnrow" style="margin-top:8px">
        <button class="btn ghost sm" onclick="App.doAuth('up')">회원가입</button>
        <button class="btn sm" onclick="App.doAuth('in')">로그인</button>
      </div>
      <button class="btn ghost sm" style="margin-top:10px" onclick="App.useLocalOnly()">
        로그인 없이 이 기기에서만 쓰기</button>
      <div class="tiny" style="margin-top:10px">
        로그인 없이 쓰면 기록이 이 브라우저에만 남습니다. 저장소를 지우면 사라집니다.
      </div>`;
    modal('로그인', html);
  },

  async doAuth(kind) {
    const name = (el('auName').value || '').trim();
    const pw = el('auPw').value || '';
    const msg = el('auMsg');
    if (!name) { msg.textContent = '이름을 입력하세요'; return; }
    if (pw.length < CFG.MIN_PASSWORD) { msg.textContent = `비밀번호는 ${CFG.MIN_PASSWORD}자 이상`; return; }
    msg.style.color = 'var(--mid)'; msg.textContent = '처리 중…';
    try {
      if (kind === 'up') await Store.signUp(name, pw);
      else await Store.signIn(name, pw);
      closeModal();
      toast(`${name}님 환영합니다`);
      await Store.syncNow();
      Store.paint();
      if (!this.hasCompletedSetup()) this.showInitialSetup();
      this.render();
    } catch (e) {
      msg.style.color = 'var(--bad)';
      const m = String(e && e.message || e);
      if (/already registered/i.test(m)) msg.textContent = '이미 가입된 이름입니다. 로그인을 누르세요.';
      else if (/Invalid login/i.test(m)) msg.textContent = '이름 또는 비밀번호가 틀렸습니다.';
      else msg.textContent = m;
    }
  },

  useLocalOnly() {
    closeModal();
    Store.syncState = 'local'; Store.paint();
    if (!this.hasCompletedSetup()) this.showInitialSetup();
  },

  async doSignOut() {
    if (!confirm('로그아웃할까요? 이 기기의 기록은 남습니다.')) return;
    await Store.signOut();
    Store.paint(); this.render();
    toast('로그아웃되었습니다');
  },

  showInitialSetup() {
    this._initGender = (Store.s.settings.gender === 'female') ? 'female' : 'male';
    const html = `
      <div class="tiny" style="margin-bottom:12px">
        3대 운동 기준 기록은 <b>자동 처방의 출발점</b>입니다. 여기가 비어 있으면 목표 중량이 계산되지 않습니다.
        1RM을 모르면 최근에 확실히 성공한 무게를 넣어도 됩니다(이후 세션 기록으로 자동 보정됩니다).
      </div>
      <div class="field"><label>성별 (해부도)</label>
        <div class="gender-toggle">
          <button type="button" class="gt ${this._initGender === 'male' ? 'on' : ''}" id="initGenderMale"
            onclick="App.pickInitGender('male')">남성</button>
          <button type="button" class="gt ${this._initGender === 'female' ? 'on' : ''}" id="initGenderFemale"
            onclick="App.pickInitGender('female')">여성</button>
        </div>
      </div>
      <div class="grid2">
        <div class="field"><label>나이 (심박존 계산용)</label><input id="initAge" type="number" placeholder="예: 24"></div>
        <div class="field"><label>중량 단위</label>
          <select id="initUnit"><option value="kg">kg</option><option value="lbs">lbs</option></select></div>
      </div>
      <div class="grid3">
        <div class="field"><label>스쿼트 1RM</label><input id="initSq" type="number" placeholder="0"></div>
        <div class="field"><label>벤치 1RM</label><input id="initBp" type="number" placeholder="0"></div>
        <div class="field"><label>데드 1RM</label><input id="initDl" type="number" placeholder="0"></div>
      </div>
      <div class="field"><label>바벨 최소 증량 단위</label>
        <input id="initUnitBar" type="number" step="0.5" value="${Store.s.settings.unitBar}"></div>
      <div class="tiny">2.5kg 원판이 없으면 10, 10kg가 최소면 20으로 두세요. 이 값이 크면 중량 대신 반복수로 진행합니다.</div>
      <button class="btn" style="margin-top:16px" onclick="App.saveInitialSetup()">완료 및 시작하기</button>`;
    modal('초기 세팅', html);
  },

  pickInitGender(g) {
    this._initGender = g === 'female' ? 'female' : 'male';
    const m = el('initGenderMale'), f = el('initGenderFemale');
    if (m) m.classList.toggle('on', this._initGender === 'male');
    if (f) f.classList.toggle('on', this._initGender === 'female');
  },

  saveInitialSetup() {
    const st = Store.s.settings;
    st.gender = this._initGender === 'female' ? 'female' : 'male';
    st.age = +el('initAge').value || null;
    st.unit = el('initUnit').value || 'kg';
    st.unitBar = +el('initUnitBar').value || 10;
    st.baseline['스쿼트'] = { w: +el('initSq').value || 0, reps: 1, rir: 0 };
    st.baseline['벤치프레스'] = { w: +el('initBp').value || 0, reps: 1, rir: 0 };
    st.baseline['데드리프트'] = { w: +el('initDl').value || 0, reps: 1, rir: 0 };
    st.isFirstRun = false;
    Store.save();
    closeModal(); this.render();
  },

  restore() {
    const s = Store.s;
    if (s.session && s.session.date === getTodayStr() && s.session.sessionId) {
      const sess = getSession(s.session.date, s.session.sessionId);
      if (sess && !sess.endedAt) {
        this.cur = {
          date: s.session.date,
          programId: sess.programId || s.session.programId,
          sessionId: s.session.sessionId
        };
        return;
      }
    }
    s.session = null;
    this.cur = null;
  },

  /* ---------- 라우팅 ---------- */
  go(tab) {
    /* program/stats 레거시 → 통합 탭으로 리다이렉트 */
    if (tab === 'program') tab = 'home';
    if (tab === 'stats') tab = 'analyze';
    this.tab = tab;
    ['home', 'workout', 'analyze', 'community', 'settings'].forEach(t => {
      const n = el('view' + t[0].toUpperCase() + t.slice(1));
      if (n) n.classList.toggle('hide', t !== tab);
    });
    document.querySelectorAll('nav.tabs button').forEach(b => {
      const key = b.dataset.tab;
      b.classList.toggle('on', key === tab || (tab === 'workout' && key === 'home'));
    });
    el('hAction').textContent = tab === 'workout' ? '세션 종료' : '설정';
    const T = {
      home: '오늘의 훈련',
      workout: '운동 중',
      analyze: '분석 · 기록',
      community: '커뮤니티',
      settings: '설정'
    };
    el('hTitle').textContent = T[tab] || 'Autoreg';
    this.render();
    window.scrollTo(0, 0);
  },

  render() {
    if (this.tab === 'home') this.renderHome();
    else if (this.tab === 'workout') this.renderWorkout();
    else if (this.tab === 'analyze') this.renderAnalyze();
    else if (this.tab === 'community') this.renderCommunity();
    else this.renderSettings();
    this.renderRest();
    Store.paint();
  },

  /* ---------- 홈 ---------- */
  renderHome() {
    const today = new Date();
    const todayStr = getTodayStr();
    el('hSub').textContent =
      `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 (${WD[today.getDay()]})`;

    if (this.editProgramId) {
      el('hSub').textContent = '루틴 편집';
      el('viewHome').innerHTML = this.buildProgramDetailHtml(this.editProgramId);
      this.bindExerciseListDnD(el('editExList'), this.editProgramId);
      return;
    }

    const hintKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][today.getDay()];
    const recommended = Store.s.programs.find(p => !p.instantWorkout && p.dayHint === hintKey);

    let routines = '';
    Store.s.programs.filter(p => !p.instantWorkout).forEach(p => {
      const n = p.items.length;
      let names = p.items.slice(0, 3).map(e => e.name).join(', ');
      if (n > 3) names += ' 등';
      const isRec = recommended && recommended.id === p.id;
      routines += `<div class="routine-card" ${isRec ? 'style="border-color:var(--sky-400);background:var(--sky-100)"' : ''}
          onclick="App.startSession('${todayStr}','${p.id}')">
        <div class="routine-header">
          <span class="routine-title">${esc(p.title)}</span>
          <span style="font-size:12px;color:var(--sky-600);font-weight:800">
            ${isRec ? '<span class="pill blue">오늘 추천</span> ' : ''}시작 ▶</span>
        </div>
        <div class="routine-desc">${esc(p.desc || '')}</div>
        <div class="routine-meta">${n}개 · ${esc(names)}${p.dayHint ? ' · ' + DAY_HINT_KO[p.dayHint] + '요일' : ''}</div>
      </div>`;
    });

    let html = `
      <div class="card">
        <h2>나의 루틴</h2>
        <div class="muted" style="margin-bottom:12px">
          루틴을 고르면 지난 기록과 이번 목표가 자동 계산됩니다.</div>
        ${routines || '<div class="emptybox">루틴이 없습니다. 루틴 관리에서 만들어 주세요.</div>'}
        <div style="height:10px"></div>
        <button class="btn free" onclick="App.startFreeWorkout()">🏋️ 자유 운동 시작</button>
        <div style="height:8px"></div>
        <button class="btn" onclick="App.openAiRoutineModal()">✨ AI 루틴 생성</button>
        <div style="height:8px"></div>
        <button class="btn" onclick="App.openRoutineManageModal()">⚙️ 루틴 관리</button>
      </div>`;

    if (this.cur && this.cur.date === todayStr) {
      const p = Store.s.programs.find(x => x.id === this.cur.programId);
      if (p) html = `<div class="card" style="border:2px solid var(--sky-400)">
        <h2>진행 중인 세션</h2>
        <div style="font-size:15px;font-weight:800;margin-bottom:12px">${esc(p.title)}</div>
        <button class="btn" onclick="App.go('workout')">이어서 하기</button></div>` + html;
    }
    el('viewHome').innerHTML = html;
  },

  buildRoutineManageInner() {
    let manage = '';
    Store.s.programs.filter(p => !p.instantWorkout).forEach(p => {
      manage += `<div class="exitem">
        <div class="g"><div class="n">${esc(p.title)}</div>
          <div class="m">${p.items.length}개 운동${p.dayHint ? ' · ' + DAY_HINT_KO[p.dayHint] + '요일' : ''}</div></div>
        <button class="iconb" onclick="event.stopPropagation();App.openProgramDetail('${p.id}')" title="편집">✎</button>
        <button class="iconb" onclick="event.stopPropagation();App.renameProgram('${p.id}')" title="이름">Aa</button>
        <button class="iconb del" onclick="event.stopPropagation();App.deleteProgram('${p.id}')" title="삭제">✕</button>
      </div>`;
    });
    return `
      <div class="muted" style="margin-bottom:10px">프리셋 수정 · 커스텀 루틴 추가</div>
      ${manage || '<div class="emptybox">루틴이 없습니다</div>'}
      <div style="height:10px"></div>
      <button class="btn" onclick="App.createProgram()">＋ 새 루틴 만들기</button>
      <div style="height:8px"></div>
      <button class="btn danger sm" onclick="App.resetProgram()">기본 2분할 루틴으로 복원</button>`;
  },

  openRoutineManageModal() {
    const m = modal('⚙️ 루틴 관리', `
      <div id="routineManageBody">${this.buildRoutineManageInner()}</div>
      <button class="btn ghost sm" style="margin-top:14px" onclick="App.closeRoutineManage()">닫기</button>`);
    const sheet = m && m.querySelector('.sheet');
    if (sheet) sheet.classList.add('manage-sheet');
  },

  closeRoutineManage() {
    closeModal();
    if (this.tab === 'home' && !this.editProgramId) this.renderHome();
  },

  /** 관리 모달이 열려 있으면 내용만 갱신 + 홈 리스트 동기화 */
  syncHomeAfterRoutineEdit() {
    const body = el('routineManageBody');
    if (body) body.innerHTML = this.buildRoutineManageInner();
    if (this.tab === 'home' && !this.editProgramId) this.renderHome();
  },

  buildCalendarBlock(todayStr) {
    const today = new Date();
    const year = today.getFullYear(), month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let monthHtml = `<div class="card"><h2>${month + 1}월 <span class="tiny">날짜 → 세션 기록</span></h2><div class="monthly-cal">`;
    for (let i = 0; i < firstDay; i++) monthHtml += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iter = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sc = daySessionCount(iter);
      monthHtml += `<div class="m-day ${d === today.getDate() ? 'today' : ''} ${sc > 0 ? 'done' : ''}"
        onclick="App.openHistoryViewer('${iter}')">${d}${calDotsHtml(sc)}</div>`;
    }
    monthHtml += '</div></div>';

    let weekCal = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.viewMonday); d.setDate(this.viewMonday.getDate() + i);
      const iter = dateStrOf(d);
      const sc = daySessionCount(iter);
      const done = dayDone(iter);
      weekCal += `<div class="daycell ${iter === todayStr ? 'today' : ''} ${sc ? 'done' : ''}"
        onclick="App.openHistoryViewer('${iter}')">
        <div class="dw">${WD[d.getDay()]}</div><div class="dd">${d.getDate()}</div>
        ${calDotsHtml(sc, iter === todayStr)}
        <div class="tag">${done ? done + '세트' : ''}</div></div>`;
    }
    return monthHtml + `
      <div class="card">
        <div class="weeknav">
          <button class="navb" onclick="App.shiftWeek(-1)">‹ 이전 주</button>
          <b>${fmtDate(this.viewMonday)} 주간</b>
          <button class="navb" onclick="App.shiftWeek(1)">다음 주 ›</button>
        </div>
        <div class="weekbar">${weekCal}</div>
      </div>`;
  },

  shiftWeek(n) {
    this.viewMonday = new Date(this.viewMonday.getTime() + n * 7 * 86400000);
    this.render();
  },

  openHistoryViewer(dateStr) {
    const sessions = getSessions(dateStr).filter(s => sessionDoneSets(s) > 0 || s.endedAt);
    const u = Store.s.settings.unit || 'kg';
    if (!sessions.length) {
      const isFuture = dateStr > getTodayStr();
      modal(dateStr, `<div class="emptybox">${isFuture ? '아직 오지 않은 날입니다.' : '이 날은 기록이 없습니다.'}</div>
        ${isFuture ? '' : `<button class="btn" onclick="App.startOnDate('${dateStr}')">이 날짜로 세션 기록하기</button>`}
        <button class="btn ghost sm" style="margin-top:8px" onclick="closeModal()">닫기</button>`);
      return;
    }

    let cards = '';
    sessions
      .slice()
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
      .forEach((sess, i) => {
        const p = Store.s.programs.find(x => x.id === sess.programId);
        let rows = '';
        Object.entries(sess.sets || {}).forEach(([exId, arr]) => {
          const e = findExById(exId);
          const done = (arr || []).filter(s => s && s.done);
          if (!done.length) return;
          const detail = done.map(s => `${+s.w}${u}×${+s.reps}` + (s.rir != null ? `(R${+s.rir})` : '')).join(', ');
          rows += `<tr><td style="text-align:left">${esc(e ? e.name : '(삭제된 운동)')}</td>
            <td style="text-align:left">${esc(detail)}</td></tr>`;
        });
        const vol = sessionVolume(sess);
        const n = sessionDoneSets(sess);
        const t0 = sess.startedAt ? new Date(sess.startedAt) : null;
        const timeLbl = t0
          ? `${String(t0.getHours()).padStart(2, '0')}:${String(t0.getMinutes()).padStart(2, '0')}`
          : `세션 ${i + 1}`;
        cards += `<div class="hist-sess">
          <button class="hist-del" title="세션 삭제"
            onclick="event.stopPropagation();App.deleteSessionFromHistory('${dateStr}','${sess.id}')">🗑</button>
          <div class="hs-top">
            <div>
              <div class="hs-title">${esc(p ? p.title : '루틴 미지정')}</div>
              <div class="hs-meta">${timeLbl} · ${n}세트 · ${Math.round(vol).toLocaleString()}${u}</div>
            </div>
          </div>
          <table class="hist"><tbody>${rows || '<tr><td colspan="2" class="tiny">상세 세트 없음</td></tr>'}</tbody></table>
        </div>`;
      });

    modal(`${dateStr} 기록 · ${sessions.length}회`, `
      <div id="histSessionList">${cards}</div>
      <button class="btn" style="margin-top:4px" onclick="App.startOnDate('${dateStr}')">이 날짜에 새 세션 추가</button>
      <button class="btn ghost sm" style="margin-top:8px" onclick="closeModal()">닫기</button>`);
  },

  deleteSessionFromHistory(dateStr, sessionId) {
    if (!confirm('이 세션 기록을 삭제할까요?')) return;
    const ok = Store.deleteWorkoutSession(dateStr, sessionId);
    if (!ok) { toast('삭제에 실패했습니다'); return; }
    if (this.cur && this.cur.sessionId === sessionId) {
      this.cur = null;
      this.releaseWakeLock();
    }
    toast('세션이 삭제되었습니다');
    closeModal();
    if (daySessionCount(dateStr) > 0) this.openHistoryViewer(dateStr);
    this.render();
  },

  startOnDate(dateStr) {
    closeModal();
    const sessions = getSessions(dateStr);
    const last = sessions.length ? sessions[sessions.length - 1] : null;
    const pid = (last && last.programId) || (Store.s.programs[0] && Store.s.programs[0].id);
    if (!pid) { toast('루틴이 없습니다'); return; }
    this.startSession(dateStr, pid);
  },

  /* ---------- 세션 ---------- */
  startSession(dateStr, programId, opts) {
    const skip = opts && opts.skipConfirm;
    if (!skip && !confirm('운동을 시작하시겠습니까?')) return;
    const sessionId = newSessionId();
    const day = getDayLog(dateStr, true);
    day.sessions.push({
      id: sessionId, programId, startedAt: Date.now(), endedAt: null, sets: {}
    });
    this.cur = { date: dateStr, programId, sessionId };
    Store.s.session = { date: dateStr, programId, sessionId };
    Store.save(dateStr);
    this.requestWakeLock();
    this.go('workout');
  },

  /** 기록 저장 없이 오늘 세션 폐기 후 홈 복귀 */
  cancelSession() {
    if (!this.cur || !this.cur.sessionId) {
      this.go('home');
      return;
    }
    if (!confirm('현재까지의 운동 기록이 저장되지 않습니다. 운동을 취소하시겠습니까?')) return;
    const { date, sessionId, programId } = this.cur;
    this.clearRestTimer();
    Store.deleteWorkoutSession(date, sessionId);
    const prog = Store.s.programs.find(x => x.id === programId);
    if (prog && prog.instantWorkout) {
      Store.s.programs = Store.s.programs.filter(p => p.id !== programId);
      Store.save();
    }
    Store.s.session = null;
    this.cur = null;
    this.releaseWakeLock();
    toast('운동이 취소되었습니다');
    this.go('home');
  },

  /** 휴식 타이머 완전 정지·UI 초기화 */
  clearRestTimer() {
    try {
      if (this._restIv) { clearInterval(this._restIv); this._restIv = null; }
    } catch (e) { /* ignore */ }
    Store.s.timer = null;
    try { Store.save(); } catch (e) { /* ignore */ }
    const bar = el('restbar');
    if (bar) {
      bar.classList.add('hide');
      bar.classList.remove('over');
    }
    const tEl = el('restT');
    if (tEl) tEl.textContent = '0:00';
    const pEl = el('restProg');
    if (pEl) pEl.style.width = '100%';
    const lEl = el('restLbl');
    if (lEl) lEl.textContent = '휴식';
  },

  finishSession() {
    if (!this.cur) { this.go('home'); return; }
    const { date, sessionId, programId } = this.cur;
    const prog = Store.s.programs.find(x => x.id === programId);
    const isFree = !!(prog && prog.instantWorkout);

    if (isFree) {
      if (!confirm('오늘의 자유 운동 기록을 저장하시겠어요?')) {
        this.clearRestTimer();
        Store.deleteWorkoutSession(date, sessionId);
        Store.s.programs = Store.s.programs.filter(p => p.id !== programId);
        Store.s.session = null;
        this.cur = null;
        this.releaseWakeLock();
        Store.save();
        toast('자유 운동이 저장되지 않았습니다');
        this.go('home');
        return;
      }
    }

    this.clearRestTimer();
    const sess = getSession(date, sessionId, true);
    sess.endedAt = Date.now();
    const vol = sessionVolume(sess);
    const doneN = sessionDoneSets(sess);
    Store.s.session = null;
    Store.save(date);
    this.releaseWakeLock();
    toast(`세션 종료 · ${doneN}세트 기록`);
    this.cur = null;
    if (doneN > 0) {
      Store.postWorkoutComplete(vol).then(p => {
        if (p && this.tab === 'community') this.renderCommunity(true);
      });
    }
    this.go('home');
  },

  /** 빈 루틴으로 즉석 자유 운동 */
  startFreeWorkout() {
    const todayStr = getTodayStr();
    if (!confirm('자유 운동을 시작하시겠습니까?')) return;
    /* 진행 중이 아닌 옛 자유 루틴 정리 */
    const activePid = this.cur && this.cur.programId;
    Store.s.programs = Store.s.programs.filter(p => !p.instantWorkout || p.id === activePid);
    const pid = 'p_free_' + Date.now().toString(36);
    Store.s.programs.unshift({
      id: pid,
      title: '자유 운동',
      desc: '즉석 종목 추가 세션',
      dayHint: '',
      items: [],
      instantWorkout: true
    });
    Store.save();
    this.startSession(todayStr, pid, { skipConfirm: true });
  },

  activeSession() {
    if (!this.cur || !this.cur.sessionId) return null;
    return getSession(this.cur.date, this.cur.sessionId, true);
  },

  completeAllSets() {
    if (!this.cur) return;
    const prog = Store.s.programs.find(x => x.id === this.cur.programId);
    const log = this.activeSession();
    if (!prog || !log) return;
    if (!prog.items.length) { toast('종목이 없습니다. 먼저 운동을 추가하세요'); return; }
    if (!confirm('리스트의 모든 종목·세트를 완료 처리할까요?')) return;
    const { date } = this.cur;
    prog.items.forEach(e => {
      if (!log.sets[e.id]) log.sets[e.id] = [];
      const n = e.type === 'cardio' ? 1 : Math.max(1, e.sets || 1);
      const tg = e.type === 'cardio' ? [] : Engine.targets(e, date, log.startedAt);
      for (let i = 0; i < n; i++) {
        while (log.sets[e.id].length <= i) log.sets[e.id].push({});
        const s = log.sets[e.id][i];
        if (e.type !== 'cardio') {
          const t = tg[i] || {};
          if (s.w == null || s.w === '') s.w = t.w || 0;
          if (s.reps == null || s.reps === '') s.reps = t.reps || 0;
          if (s.rir == null) s.rir = e.mode === 'restpause' ? 0 : e.rir;
        }
        s.done = true;
        s.at = Date.now();
      }
    });
    Store.save(date);
    this.renderWorkout();
    toast('전체 세트 완료 처리됨');
  },

  reorderProgramItems(programId, fromIdx, toIdx) {
    const p = Store.s.programs.find(x => x.id === programId);
    if (!p || !p.items) return;
    const from = +fromIdx, to = +toIdx;
    if (isNaN(from) || isNaN(to) || from === to) return;
    if (from < 0 || to < 0 || from >= p.items.length || to >= p.items.length) return;
    const [item] = p.items.splice(from, 1);
    p.items.splice(to, 0, item);
    Store.save();
    this.render();
  },

  bindExerciseListDnD(listEl, programId) {
    if (!listEl) return;
    let dragFrom = null;
    listEl.querySelectorAll('.ex-card[data-drag-idx]').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', e => {
        dragFrom = +card.dataset.dragIdx;
        card.classList.add('dragging');
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(dragFrom));
        } catch (err) { /* ignore */ }
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        listEl.querySelectorAll('.ex-card').forEach(c => c.classList.remove('drag-over'));
        dragFrom = null;
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        card.classList.add('drag-over');
        try { e.dataTransfer.dropEffect = 'move'; } catch (err) { /* ignore */ }
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', e => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const to = +card.dataset.dragIdx;
        const from = dragFrom != null ? dragFrom : parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(from) && !isNaN(to) && from !== to) {
          this.reorderProgramItems(programId, from, to);
        }
      });
    });
  },

  renderWorkout() {
    if (!this.cur || !this.cur.sessionId) {
      el('viewWorkout').innerHTML = `<div class="card"><div class="emptybox">진행 중인 세션이 없습니다.</div>
        <button class="btn" onclick="App.go('home')">홈으로</button></div>`;
      return;
    }
    const { date, programId, sessionId } = this.cur;
    const prog = Store.s.programs.find(x => x.id === programId);
    if (!prog) return this.go('home');

    const log = getSession(date, sessionId, true);
    const beforeTs = log.startedAt || Date.now();
    const total = progTotalSets(programId), done = sessionDoneSets(log);
    const elapsed = log.startedAt ? (Date.now() - log.startedAt) / 1000 : 0;
    const u = Store.s.settings.unit || 'kg';
    const sessN = getSessions(date).length;
    const isFree = !!prog.instantWorkout;
    el('hSub').textContent = `${esc(prog.title)} · ${date}` + (sessN > 1 ? ` · #${sessN}` : '');

    let html = `${CardioEngine.renderDashboard()}
      <div class="sessbar">
        <div><div class="l">세션 경과</div><div class="v" id="sessT">${hhmmss(elapsed)}</div></div>
        <div style="text-align:center"><div class="l">완료</div><div class="v">${done}/${total}</div></div>
        <div style="text-align:right"><div class="l">진행률</div><div class="v">${total ? Math.round(done / total * 100) : 0}%</div></div>
      </div>
      <div id="workoutExList">`;

    if (!prog.items.length) {
      html += `<div class="card"><div class="emptybox">${isFree
        ? '종목이 없습니다. 아래에서 즉석 추가하세요.'
        : '이 루틴에 운동이 없습니다.'}</div></div>`;
    }

    prog.items.forEach((e, ei) => {
      const tg = Engine.targets(e, date, beforeTs);
      const rec = log.sets[e.id] || [];
      const prev = Engine.prevRecord(e.id, date, beforeTs);
      const prevLine = Engine.prevText(e.id, date, u, beforeTs);

      let rows = '';
      if (e.type === 'cardio') {
        const r = rec[0] || {}, dn = !!r.done;
        rows = `<div class="setrow ${dn ? 'done' : ''}" style="grid-template-columns:26px 1fr 40px">
          <div class="setno">1</div>
          <div style="text-align:center;font-weight:800;color:var(--sky-700)">목표 ${e.targetMin}분
            <button class="btn ghost sm" style="display:inline-block;width:auto;padding:5px 12px;margin-left:10px"
              onclick="App.restFor('${e.id}')">⏱ 타이머</button></div>
          <button class="chk ${dn ? 'on' : ''}" onclick="App.toggleSet('${e.id}',0)">✓</button>
        </div>`;
      } else {
        rows = `<div class="setrow head"><span></span><span>무게(${u})</span>
          <span>${e.mode === 'restpause' ? '총 반복' : '반복'}</span>
          <span>${e.mode === 'restpause' ? '—' : 'RIR'}</span><span>완료</span></div>`;
        for (let i = 0; i < e.sets; i++) {
          const r = rec[i] || {}, t = tg[i] || {}, dn = !!r.done;
          const pset = prev && prev.sets[i] && prev.sets[i].done ? prev.sets[i] : null;
          rows += `<div class="setrow ${dn ? 'done' : ''}">
            <div class="setno">${i + 1}</div>
            <input type="number" inputmode="decimal" step="any" placeholder="${t.w || '-'}"
              value="${r.w != null ? r.w : ''}" onchange="App.setVal('${e.id}',${i},'w',this.value)">
            <input type="number" inputmode="numeric" placeholder="${t.reps || '-'}"
              value="${r.reps != null ? r.reps : ''}" onchange="App.setVal('${e.id}',${i},'reps',this.value)">
            ${e.mode === 'restpause'
              ? '<div class="tiny" style="text-align:center">실패<br>기준</div>'
              : `<select onchange="App.setVal('${e.id}',${i},'rir',this.value)">${
                  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map(v =>
                    `<option value="${v}" ${(r.rir != null ? +r.rir : e.rir) === v ? 'selected' : ''}>${v}</option>`).join('')
                }</select>`}
            <button class="chk ${dn ? 'on' : ''}" onclick="App.toggleSet('${e.id}',${i})">✓</button>
          </div>
          <div class="setprev">${i + 1}세트 목표 <b>${esc(t.text || '')}</b>${
            pset ? ` <span class="sep">·</span> 지난 기록 ${+pset.w}${u}×${+pset.reps}회` : ''}</div>`;
        }
      }

      const firstT = tg[0] ? tg[0].text : '';
      const allSame = tg.every(x => x.text === firstT);

      html += `<div class="card ex-card" data-drag-idx="${ei}">
        <div class="exhead">
          <div class="drag-handle" title="드래그하여 순서 변경">⠿</div>
          <div style="flex:1;min-width:0">
            <div class="exname">${esc(e.name)}</div>
            <div class="exmeta">${e.type === 'cardio' ? '유산소' : esc(e.equip)}${e.lift ? ' · ' + esc(e.lift) : ''} · 휴식 ${mmss(e.rest)}${e.note ? ' · ' + esc(e.note) : ''}</div>
            <div class="prev-record">📌 ${prevLine ? '지난 수행 ' + esc(prevLine) : '이전 기록 없음 — 첫 수행'}</div>
          </div>
          <button class="iconb" onclick="event.stopPropagation();App.editExercise('${programId}',${ei})">✎</button>
        </div>
        <div class="target">${allSame ? '자동 처방: ' + esc(firstT) : '세트별 처방 ↓'}</div>
        ${rows}
        ${e.type === 'weight' ? `<div class="btnrow" style="margin-top:9px">
          <button class="btn ghost sm" onclick="App.changeSets('${programId}',${ei},1)">＋ 세트</button>
          <button class="btn ghost sm" onclick="App.changeSets('${programId}',${ei},-1)">－ 세트</button>
          <button class="btn ghost sm" onclick="App.restFor('${e.id}')">휴식 ${mmss(e.rest)}</button>
          <button class="btn ghost sm" onclick="App.changeRest('${programId}',${ei},-15)">−15초</button>
          <button class="btn ghost sm" onclick="App.changeRest('${programId}',${ei},15)">＋15초</button>
        </div>` : ''}
      </div>`;
    });

    html += `</div><div class="card">
      <button class="btn ghost" style="margin-bottom:12px" onclick="App.addExercise('${programId}')">${isFree ? '➕ 종목 추가' : '➕ 이 루틴에 운동 추가'}</button>
      <button class="btn" style="margin-bottom:12px;background:#059669" onclick="App.completeAllSets()">✅ 전체 운동 완료 처리</button>
      <button class="btn" onclick="App.finishSession()">세션 저장 및 종료</button>
      <div style="height:8px"></div>
      <button class="btn danger sm" onclick="App.cancelSession()">운동 취소</button>
    </div>`;
    el('viewWorkout').innerHTML = html;
    this.bindExerciseListDnD(el('workoutExList'), programId);
  },

  setVal(exId, idx, field, val) {
    if (!this.cur) return;
    const log = this.activeSession();
    if (!log) return;
    if (!log.sets[exId]) log.sets[exId] = [];
    while (log.sets[exId].length <= idx) log.sets[exId].push({});
    log.sets[exId][idx][field] = val === '' ? null : +val;
    Store.save(this.cur.date);
  },

  toggleSet(exId, idx) {
    if (!this.cur) return;
    const { date } = this.cur;
    const e = findExById(exId);
    const log = this.activeSession();
    if (!log) return;
    if (!log.sets[exId]) log.sets[exId] = [];
    while (log.sets[exId].length <= idx) log.sets[exId].push({});
    const s = log.sets[exId][idx];
    if (s.done) { s.done = false; Store.save(date); this.renderWorkout(); return; }

    if (e.type === 'cardio') {
      s.done = true; s.at = Date.now();
      Store.save(date); this.renderWorkout(); return;
    }
    const t = Engine.targets(e, date, log.startedAt)[idx] || {};
    if (s.w == null || s.w === '') s.w = t.w || 0;
    if (s.reps == null || s.reps === '') s.reps = t.reps || 0;
    if (s.rir == null) s.rir = e.mode === 'restpause' ? 0 : e.rir;
    if (!s.w || !s.reps) { toast('무게와 반복을 입력하세요'); return; }
    s.done = true; s.at = Date.now();
    Store.save(date);
    this.renderWorkout();
    if (Store.s.settings.autoRest) this.startRest(e.rest, e.name);
  },

  changeSets(pId, ei, delta) {
    const p = Store.s.programs.find(x => x.id === pId);
    const e = p.items[ei];
    e.sets = Math.max(1, Math.min(12, e.sets + delta));
    Store.save(); this.render();
  },

  changeRest(pId, ei, delta) {
    const p = Store.s.programs.find(x => x.id === pId);
    const e = p.items[ei];
    e.rest = Math.max(0, e.rest + delta);
    Store.save(); this.render();
    toast(`휴식 ${mmss(e.rest)}`);
  },

  /* ---------- 타이머 ---------- */
  restFor(exId) {
    const e = findExById(exId);
    if (!e) return;
    this.startRest(e.type === 'cardio' ? e.targetMin * 60 : e.rest, e.name);
  },
  startRest(sec, label) {
    if (!sec) { toast('휴식 시간이 0입니다'); return; }
    Store.s.timer = { endsAt: Date.now() + sec * 1000, total: sec, label: label || '휴식', fired: false };
    Store.save();
    this.renderRest(); this.requestWakeLock();
  },
  restAdd(n) {
    const t = Store.s.timer; if (!t) return;
    t.endsAt = Math.max(Date.now(), t.endsAt + n * 1000);
    t.total = Math.max(t.total + n, 1);
    Store.save(); this.renderRest();
  },
  restStop() { this.clearRestTimer(); },
  renderRest() {
    const t = Store.s.timer, bar = el('restbar');
    if (!bar) return;
    if (!t) { bar.classList.add('hide'); return; }
    bar.classList.remove('hide');
    const left = (t.endsAt - Date.now()) / 1000, over = left <= 0;
    bar.classList.toggle('over', over);
    el('restLbl').textContent = over ? `${t.label} · 완료 — 다음 세트` : `${t.label} 휴식`;
    el('restT').textContent = over ? '+' + mmss(-left) : mmss(left);
    el('restProg').style.width = over ? '100%' : Math.max(0, Math.min(100, (1 - left / t.total) * 100)) + '%';
  },
  onTick() {
    const t = Store.s.timer;
    if (t) {
      this.renderRest();
      if (!t.fired && Date.now() >= t.endsAt) { t.fired = true; Store.save(); this.alarm(t.label); }
    }
    if (this.tab === 'workout' && this.cur && this.cur.sessionId) {
      const log = getSession(this.cur.date, this.cur.sessionId);
      const n = el('sessT');
      if (log && log.startedAt && n) n.textContent = hhmmss((Date.now() - log.startedAt) / 1000);
    }
  },
  onResume() {
    const t = Store.s.timer;
    if (t && !t.fired && Date.now() >= t.endsAt) { t.fired = true; Store.save(); this.alarm(t.label); }
    this.renderRest();
    if (Store.user) Store.pull().then(ch => { if (ch) this.render(); });
  },
  alarm(label) {
    const st = Store.s.settings;
    if (st.vibrate && navigator.vibrate) navigator.vibrate([220, 90, 220, 90, 320]);
    if (st.sound) this.beep();
    if (st.notify && 'Notification' in window && Notification.permission === 'granted') {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(r => r.showNotification('휴식 완료', {
            body: `${label} — 다음 세트를 시작하세요`, tag: 'rest', renotify: true,
            icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200]
          })).catch(() => { });
        } else new Notification('휴식 완료', { body: label });
      } catch (e) { }
    }
  },
  beep() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      if (!this._ac) this._ac = new C();
      const ac = this._ac;
      if (ac.state === 'suspended') ac.resume();
      [0, .28, .56].forEach(off => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ac.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + off + 0.22);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + off); o.stop(ac.currentTime + off + 0.25);
      });
    } catch (e) { }
  },
  async requestWakeLock() {
    if (!Store.s.settings.wakelock || !('wakeLock' in navigator)) return;
    try { this._wl = await navigator.wakeLock.request('screen'); } catch (e) { }
  },
  releaseWakeLock() { try { if (this._wl) { this._wl.release(); this._wl = null; } } catch (e) { } },

  /* ---------- 커뮤니티 ---------- */
  async renderCommunity(force) {
    const root = el('viewCommunity');
    if (!root) return;
    el('hSub').textContent = '피드 · 감정 반응';

    if (!cloudEnabled()) {
      root.innerHTML = `<div class="card"><div class="emptybox">
        config.js에 Supabase를 연결하면 커뮤니티를 쓸 수 있습니다.</div></div>`;
      return;
    }
    if (!Store.user) {
      root.innerHTML = `<div class="card">
        <h2>커뮤니티</h2>
        <div class="muted" style="margin-bottom:12px">로그인하면 피드 작성·반응·운동 완료 공유가 가능합니다.</div>
        <button class="btn" onclick="App.go('settings')">설정에서 로그인</button>
      </div>`;
      return;
    }

    root.innerHTML = `
      <div class="card feed-composer">
        <h2>자유게시판</h2>
        <textarea id="communityBody" placeholder="오늘 컨디션, 기록, 질문을 남겨보세요"></textarea>
        <div style="height:10px"></div>
        <button class="btn" id="communityPostBtn" onclick="App.submitCommunityPost()">게시하기</button>
      </div>
      <div id="communityFeed"><div class="card"><div class="muted">피드 불러오는 중…</div></div></div>`;

    if (!force && this.communityPosts && this.communityPosts.length) {
      this.paintCommunityFeed(this.communityPosts);
    }
    try {
      const posts = await Store.fetchCommunityFeed(50);
      this.communityPosts = posts;
      if (this.tab === 'community') this.paintCommunityFeed(posts);
    } catch (e) {
      console.warn(e);
      const box = el('communityFeed');
      if (box) box.innerHTML = `<div class="card"><div class="emptybox">피드를 불러오지 못했습니다.
        <div class="tiny" style="margin-top:8px">Supabase SQL에 community_posts / post_reactions 테이블이 있는지 확인하세요.</div>
      </div></div>`;
    }
  },

  paintCommunityFeed(posts) {
    const box = el('communityFeed');
    if (!box) return;
    if (!posts || !posts.length) {
      box.innerHTML = `<div class="card"><div class="emptybox">아직 글이 없습니다. 첫 글을 남겨 보세요.</div></div>`;
      return;
    }
    box.innerHTML = posts.map(p => this.communityCardHtml(p)).join('');
  },

  communityCardHtml(p) {
    const t = p.created_at ? new Date(p.created_at) : null;
    const time = t
      ? `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      : '';
    const isMine = !!(Store.user && p.user_id && Store.user.id === p.user_id);
    const delBtn = isMine
      ? `<button type="button" class="feed-del" onclick="event.stopPropagation();App.deleteCommunityPost('${p.id}')">🗑 삭제</button>`
      : '';
    const reacts = (CFG.REACTIONS || []).map(r => {
      const n = (p.counts && p.counts[r.key]) || 0;
      const on = p.mine && p.mine[r.key] ? ' on' : '';
      return `<button type="button" class="react-btn${on}" data-post="${p.id}" data-react="${r.key}"
        onclick="App.onReact('${p.id}','${r.key}')" title="${esc(r.label)}">
        <span>${r.emoji}</span><span class="cnt" id="rc_${p.id}_${r.key}">${n}</span>
      </button>`;
    }).join('');
    return `<div class="feed-card ${p.post_type === 'workout_complete' ? 'workout' : ''}" id="post_${p.id}">
      ${delBtn}
      <div class="fc-head">
        <span class="fc-name">${esc(p.author_name || '익명')}</span>
        <span class="fc-time">${esc(time)}${p.post_type === 'workout_complete' ? ' · 운동 완료' : ''}</span>
      </div>
      <div class="fc-body">${esc(p.body)}</div>
      <div class="react-bar" id="reactbar_${p.id}">${reacts}</div>
    </div>`;
  },

  async deleteCommunityPost(postId) {
    if (!Store.user) { toast('로그인이 필요합니다'); return; }
    if (!confirm('이 글을 삭제할까요?')) return;
    try {
      await Store.deleteCommunityPost(postId);
      this.communityPosts = (this.communityPosts || []).filter(p => p.id !== postId);
      const node = el('post_' + postId);
      if (node) node.remove();
      else this.paintCommunityFeed(this.communityPosts);
      toast('삭제되었습니다');
    } catch (e) {
      toast(e.message || '삭제 실패');
    }
  },

  async submitCommunityPost() {
    const ta = el('communityBody');
    const body = ta ? ta.value : '';
    const btn = el('communityPostBtn');
    if (btn) btn.disabled = true;
    try {
      await Store.createCommunityPost(body, { post_type: 'free' });
      if (ta) ta.value = '';
      toast('게시되었습니다');
      await this.renderCommunity(true);
    } catch (e) {
      toast(e.message || '게시 실패');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async onReact(postId, reactionType) {
    if (!Store.user) { toast('로그인이 필요합니다'); return; }
    const bar = el('reactbar_' + postId);
    if (bar) bar.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      const snap = await Store.toggleReaction(postId, reactionType);
      const post = (this.communityPosts || []).find(p => p.id === postId);
      if (post) { post.counts = snap.counts; post.mine = snap.mine; }
      /* DOM만 갱신 — 전체 리렌더 없이 */
      (CFG.REACTIONS || []).forEach(r => {
        const cnt = el(`rc_${postId}_${r.key}`);
        if (cnt) cnt.textContent = (snap.counts[r.key] || 0);
        const btn = bar && bar.querySelector(`[data-react="${r.key}"]`);
        if (btn) btn.classList.toggle('on', !!snap.mine[r.key]);
      });
    } catch (e) {
      toast(e.message || '반응 실패');
    } finally {
      if (bar) bar.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  },

  /* ---------- AI 루틴 빌더 ---------- */
  openAiRoutineModal() {
    if (!geminiEnabled()) {
      modal('AI 루틴', `<div class="muted" style="margin-bottom:12px">
        <code>config.js</code>의 <b>CONFIG.GEMINI_API_KEY</b>를 입력하면 Gemini로 오늘 루틴을 만들 수 있습니다.</div>
        <button class="btn" onclick="closeModal()">확인</button>`);
      return;
    }
    if (!Array.isArray(this._aiTargets) || !this._aiTargets.length) {
      this._aiTargets = ['chest', 'back'];
    } else {
      /* 레거시 'arms' → 이두·삼두 */
      this._aiTargets = this._aiTargets.flatMap(t =>
        t === 'arms' ? ['biceps', 'triceps'] : [t]
      ).filter((t, i, a) => a.indexOf(t) === i);
    }
    this._aiLevel = this._aiLevel || 'intermediate';
    this._aiStyle = this._aiStyle || 'bodybuilding';
    this._aiDuration = this._aiDuration || '30';

    const targetOpts = [
      ['chest', '가슴'], ['back', '등'], ['shoulders', '어깨'],
      ['legs', '하체'], ['biceps', '이두'], ['triceps', '삼두'], ['core', '복근']
    ];
    const levelOpts = [
      ['beginner', '초보자 (기초 체력)'],
      ['intermediate', '중급자 (볼륨 정체기)'],
      ['advanced', '상급자/엘리트 (고강도 스트렝스)']
    ];
    const styleOpts = [
      ['strength', '스트렝스 (고중량 저반복)'],
      ['bodybuilding', '보디빌딩 (근비대/펌핑)'],
      ['conditioning', '컨디셔닝 (기능성/다이어트)']
    ];
    const durationOpts = [
      ['15', '15분'], ['30', '30분'], ['45', '45분'], ['60', '1시간']
    ];

    const multiChips = targetOpts.map(([k, lbl]) =>
      `<button type="button" class="ai-chip multi ${this._aiTargets.includes(k) ? 'on' : ''}"
        data-g="target" data-v="${k}" onclick="App.toggleAiTarget('${k}')">${lbl}</button>`
    ).join('');
    const singleChips = (opts, group, cur) => opts.map(([k, lbl]) =>
      `<button type="button" class="ai-chip ${cur === k ? 'on' : ''}"
        data-g="${group}" data-v="${k}" onclick="App.pickAiOption('${group}','${k}')">${lbl}</button>`
    ).join('');

    modal('AI 루틴 생성', `
      <div class="muted">부위·숙련도·스타일·희망 시간을 고르면 성별 · SBD e1RM · 근육 회복도를 반영해 루틴을 만듭니다.</div>

      <div class="ai-sec-label">1. 타겟 부위</div>
      <div class="ai-sec-hint">여러 개 선택 가능 · 다시 누르면 해제</div>
      <div class="ai-opt" id="aiTargetChips">${multiChips}</div>

      <div class="ai-sec-label">2. 운동 숙련도</div>
      <div class="ai-opt" id="aiLevelChips">${singleChips(levelOpts, 'level', this._aiLevel)}</div>

      <div class="ai-sec-label">3. 트레이닝 스타일</div>
      <div class="ai-opt" id="aiStyleChips">${singleChips(styleOpts, 'style', this._aiStyle)}</div>

      <div class="ai-sec-label">4. 희망 운동 시간</div>
      <div class="ai-sec-hint">선택한 시간 안에 끝나도록 종목·세트·휴식을 맞춥니다</div>
      <div class="ai-opt" id="aiDurationChips">${singleChips(durationOpts, 'duration', this._aiDuration)}</div>

      <div class="ai-status" id="aiStatus"></div>
      <div class="btnrow">
        <button class="btn ghost sm" onclick="closeModal()">취소</button>
        <button class="btn sm" id="aiRunBtn" onclick="App.runAiRoutine()">루틴 생성</button>
      </div>`);
  },

  toggleAiTarget(key) {
    if (!Array.isArray(this._aiTargets)) this._aiTargets = [];
    const i = this._aiTargets.indexOf(key);
    if (i >= 0) this._aiTargets.splice(i, 1);
    else this._aiTargets.push(key);
    const wrap = el('aiTargetChips');
    if (!wrap) return;
    wrap.querySelectorAll('.ai-chip').forEach(b => {
      b.classList.toggle('on', this._aiTargets.includes(b.dataset.v));
    });
  },

  pickAiOption(group, value) {
    if (group === 'level') this._aiLevel = value;
    else if (group === 'style') this._aiStyle = value;
    else if (group === 'duration') this._aiDuration = value;
    const wrapId = group === 'level' ? 'aiLevelChips'
      : group === 'style' ? 'aiStyleChips'
      : group === 'duration' ? 'aiDurationChips' : null;
    const wrap = wrapId ? el(wrapId) : null;
    if (!wrap) return;
    wrap.querySelectorAll('.ai-chip').forEach(b => {
      b.classList.toggle('on', b.dataset.v === value);
    });
  },

  collectAiRoutineOptions() {
    const targets = Array.isArray(this._aiTargets) ? this._aiTargets.slice() : [];
    if (!targets.length) {
      alert('최소 한 개 이상의 부위를 선택해주세요');
      return null;
    }
    const level = this._aiLevel || 'intermediate';
    const style = this._aiStyle || 'bodybuilding';
    const duration = this._aiDuration || '30';
    const durationLabel = ({ '15': '15분', '30': '30분', '45': '45분', '60': '1시간' })[duration] || (duration + '분');
    return { targets, level, style, duration, durationLabel };
  },

  async runAiRoutine() {
    const opts = this.collectAiRoutineOptions();
    if (!opts) return;

    const btn = el('aiRunBtn');
    const st = el('aiStatus');
    if (btn) btn.disabled = true;
    if (st) st.textContent = 'Gemini가 루틴을 작성 중…';
    try {
      const raw = await Store.generateAiRoutine(opts, (msg) => {
        if (st) st.textContent = msg;
      });
      const items = Store.mapAiExercises(raw.exercises);
      if (!items.length) throw new Error('운동이 비어 있습니다');

      const targetKo = {
        chest: '가슴', back: '등', shoulders: '어깨',
        legs: '하체', biceps: '이두', triceps: '삼두', core: '복근'
      };
      const parts = opts.targets.map(t => targetKo[t] || t).join('·');
      const pid = 'p_ai_' + Date.now().toString(36);
      const prog = {
        id: pid,
        title: `AI · ${parts}`,
        desc: String(raw.description || '').trim(),
        dayHint: '',
        items,
        aiGenerated: true
      };
      Store.s.programs = Store.s.programs.filter(p => !p.aiGenerated);
      Store.s.programs.unshift(prog);
      Store.save();

      closeModal();
      toast('AI 루틴 준비 완료');
      this.startSession(getTodayStr(), pid);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      console.error('[AI 루틴] 실패', e);
      if (st) st.textContent = msg.split('\n')[0];
      toast(msg.includes('429') || msg.includes('할당량') ? '할당량 초과 — 잠시 후 재시도' : 'AI 루틴 생성 실패');
      try { alert('AI 루틴 오류\n\n' + msg); } catch (a) { /* ignore */ }
      if (btn) btn.disabled = false;
    }
  },

  /* ---------- 루틴 편집 (홈 탭 내장) ---------- */
  openProgramDetail(pId) {
    closeModal();
    this.editProgramId = pId;
    if (this.tab !== 'home') this.go('home');
    else this.render();
  },

  closeProgramDetail() {
    this.editProgramId = null;
    this.render();
  },

  buildProgramDetailHtml(pId) {
    const p = Store.s.programs.find(x => x.id === pId);
    if (!p) {
      this.editProgramId = null;
      return '<div class="card"><div class="emptybox">루틴을 찾을 수 없습니다</div></div>';
    }
    const items = p.items.map((e, i) => `
      <div class="card ex-card edit-ex-card" data-drag-idx="${i}">
        <div class="exhead">
          <div class="drag-handle" title="드래그하여 순서 변경">⠿</div>
          <div style="flex:1;min-width:0">
            <div class="exname">${esc(e.name)}</div>
            <div class="exmeta">${e.type === 'cardio' ? `유산소 ${e.targetMin}분`
              : `${e.sets}세트 · ${e.mode === 'restpause' ? '총 ' : ''}${e.repLo}~${e.repHi}회 · RIR${e.rir} · 휴식 ${mmss(e.rest)}`}${e.lift ? ' · ' + esc(e.lift) : ''}${e.equip ? ' · ' + esc(e.equip) : ''}</div>
            ${e.note ? `<div class="prev-record">${esc(e.note)}</div>` : ''}
          </div>
          <button class="iconb" onclick="event.stopPropagation();App.editExercise('${pId}',${i})">✎</button>
          <button class="iconb del" onclick="event.stopPropagation();App.deleteExercise('${pId}',${i})">✕</button>
        </div>
        ${e.type === 'weight' ? `<div class="btnrow" style="margin-top:8px">
          <button class="btn ghost sm" onclick="App.changeSets('${pId}',${i},1)">＋ 세트</button>
          <button class="btn ghost sm" onclick="App.changeSets('${pId}',${i},-1)">－ 세트</button>
          <button class="btn ghost sm" onclick="App.moveExercise('${pId}',${i},-1)">↑</button>
          <button class="btn ghost sm" onclick="App.moveExercise('${pId}',${i},1)">↓</button>
        </div>` : `<div class="btnrow" style="margin-top:8px">
          <button class="btn ghost sm" onclick="App.moveExercise('${pId}',${i},-1)">↑</button>
          <button class="btn ghost sm" onclick="App.moveExercise('${pId}',${i},1)">↓</button>
        </div>`}
      </div>`).join('') || '<div class="emptybox">운동이 없습니다 · 아래에서 추가하세요</div>';
    return `
      <div class="card">
        <h2>${esc(p.title)}
          <button class="pill blue" onclick="App.closeProgramDetail()">← 목록</button></h2>
        <div class="muted" style="margin-bottom:8px">${esc(p.desc || '')}</div>
        <div class="tiny" style="margin-bottom:10px">⠿ 핸들을 드래그해 순서를 바꿀 수 있습니다</div>
      </div>
      <div id="editExList">${items}</div>
      <div class="card">
        <button class="btn ghost sm" onclick="App.addExercise('${pId}')">＋ 운동 추가</button>
      </div>`;
  },

  createProgram() {
    const t = prompt('새 루틴 이름', '나의 루틴');
    if (!t) return;
    const p = { id: 'p' + Math.random().toString(36).slice(2, 8), title: t.trim(), desc: '', dayHint: '', items: [] };
    Store.s.programs.push(p);
    Store.save();
    this.syncHomeAfterRoutineEdit();
    this.openProgramDetail(p.id);
  },
  renameProgram(pId) {
    const p = Store.s.programs.find(x => x.id === pId);
    const t = prompt('루틴 이름', p.title); if (t == null) return;
    const d = prompt('설명', p.desc || '');
    p.title = t.trim() || p.title; if (d != null) p.desc = d.trim();
    Store.save();
    this.syncHomeAfterRoutineEdit();
    if (this.editProgramId) this.render();
  },
  deleteProgram(pId) {
    const p = Store.s.programs.find(x => x.id === pId);
    if (!confirm(`"${p.title}" 루틴을 삭제할까요? (기록은 남습니다)`)) return;
    Store.s.programs = Store.s.programs.filter(x => x.id !== pId);
    if (this.editProgramId === pId) this.editProgramId = null;
    Store.save();
    this.syncHomeAfterRoutineEdit();
    if (this.editProgramId === null && this.tab === 'home') this.render();
  },
  moveExercise(pId, i, d) {
    const arr = Store.s.programs.find(x => x.id === pId).items;
    const j = i + d; if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    Store.save(); this.render();
  },
  deleteExercise(pId, i) {
    const arr = Store.s.programs.find(x => x.id === pId).items;
    if (!confirm(`"${arr[i].name}"을(를) 삭제할까요?`)) return;
    arr.splice(i, 1);
    Store.save(); this.render();
  },
  addExercise(pId) { this.exerciseForm(pId, -1); },
  editExercise(pId, i) { this.exerciseForm(pId, i); },

  toggleExType() {
    const isCardio = el('fType').value === 'cardio';
    el('wrapWeight').classList.toggle('hide', isCardio);
    el('wrapCardio').classList.toggle('hide', !isCardio);
  },

  exerciseForm(pId, idx) {
    const isNew = idx < 0;
    const p = Store.s.programs.find(x => x.id === pId);
    const e = isNew ? ex({ name: '' }) : p.items[idx];
    const opt = (v, cur, lbl) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${lbl || v || '없음'}</option>`;
    const html = `
      <div class="field"><label>운동 이름</label>
        <input id="fName" value="${esc(e.name)}" placeholder="예) 인클라인 덤벨 프레스"></div>
      <div class="field"><label>종류</label>
        <select id="fType" onchange="App.toggleExType()">
          <option value="weight" ${e.type !== 'cardio' ? 'selected' : ''}>웨이트</option>
          <option value="cardio" ${e.type === 'cardio' ? 'selected' : ''}>유산소</option>
        </select></div>
      <div id="wrapCardio" class="${e.type === 'cardio' ? '' : 'hide'}">
        <div class="field"><label>목표 시간(분)</label>
          <input id="fMin" type="number" value="${e.targetMin || 30}"></div>
      </div>
      <div id="wrapWeight" class="${e.type === 'cardio' ? 'hide' : ''}">
        <div class="grid2">
          <div class="field"><label>기구</label><select id="fEquip">
            ${['바벨', '덤벨', '머신', '케이블', '맨몸'].map(v => opt(v, e.equip)).join('')}</select></div>
          <div class="field"><label>메인 리프트 연동</label><select id="fLift">
            ${['', '스쿼트', '벤치프레스', '데드리프트'].map(v => opt(v, e.lift)).join('')}</select></div>
        </div>
        <div class="grid3">
          <div class="field"><label>세트</label><input id="fSets" type="number" min="1" max="12" value="${e.sets}"></div>
          <div class="field"><label>반복 하한</label><input id="fLo" type="number" min="1" value="${e.repLo}"></div>
          <div class="field"><label>반복 상한</label><input id="fHi" type="number" min="1" value="${e.repHi}"></div>
        </div>
        <div class="grid3">
          <div class="field"><label>목표 RIR</label><select id="fRir">
            ${[0, 0.5, 1, 1.5, 2, 2.5, 3, 4].map(v => `<option value="${v}" ${v === e.rir ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>휴식(초)</label><input id="fRest" type="number" min="0" step="15" value="${e.rest}"></div>
          <div class="field"><label>방식</label><select id="fMode">
            <option value="normal" ${e.mode === 'normal' ? 'selected' : ''}>일반</option>
            <option value="restpause" ${e.mode === 'restpause' ? 'selected' : ''}>레스트포즈</option>
          </select></div>
        </div>
        <div class="field"><label>반올림 (메인 리프트만)</label><select id="fRound">
          <option value="near" ${e.round === 'near' ? 'selected' : ''}>가까운 단위로</option>
          <option value="floor" ${e.round === 'floor' ? 'selected' : ''}>내림 (백오프·기술 세트)</option>
        </select></div>
      </div>
      <div class="field"><label>메모</label><input id="fNote" value="${esc(e.note || '')}"></div>
      <div class="tiny" style="margin-bottom:10px">
        <b>메인 리프트 연동</b>을 지정하면 RIR로 추정한 e1RM 기반으로 중량이 처방됩니다.
        <b>레스트포즈</b>는 미니세트가 전부 실패로 끝나 RIR이 무의미하므로,
        고정 중량에서의 <b>총 반복수</b>로 진행합니다.
      </div>
      <div class="btnrow">
        <button class="btn ghost sm" onclick="closeModal()">취소</button>
        <button class="btn sm" onclick="App.saveExercise('${pId}',${idx})">저장</button>
      </div>`;
    modal(isNew ? '운동 추가' : '운동 편집', html);
    this._draft = e;
  },

  saveExercise(pId, idx) {
    const g = id => (el(id) ? el(id).value : '');
    const e = this._draft;
    const name = g('fName').trim();
    if (!name) { toast('운동 이름을 입력하세요'); return; }
    e.name = name;
    e.type = g('fType');
    e.note = g('fNote').trim();
    if (e.type === 'cardio') {
      e.targetMin = Math.max(1, +g('fMin') || 30);
      e.sets = 1; e.rest = 0; e.lift = ''; e.equip = '유산소';
    } else {
      e.equip = g('fEquip'); e.lift = g('fLift');
      e.sets = Math.max(1, Math.min(12, +g('fSets') || 1));
      e.repLo = Math.max(1, +g('fLo') || 1);
      e.repHi = Math.max(e.repLo, +g('fHi') || e.repLo);
      e.rir = +g('fRir'); e.rest = Math.max(0, +g('fRest') || 0);
      e.mode = g('fMode'); e.round = g('fRound');
    }
    const p = Store.s.programs.find(x => x.id === pId);
    if (idx < 0) p.items.push(e); else p.items[idx] = e;
    Store.save(); closeModal(); this.render();
    toast('저장되었습니다');
  },

  resetProgram() {
    if (!confirm('기본 2분할 루틴으로 되돌릴까요? (기록은 유지)')) return;
    Store.s.programs = defaultPrograms();
    this.editProgramId = null;
    Store.save();
    this.syncHomeAfterRoutineEdit();
    this.render();
    toast('기본 루틴 복원');
  },

  /* ---------- 분석 / 기록 (통합) ---------- */
  setBodySide(side) {
    this.bodySide = side === 'back' ? 'back' : 'front';
    document.querySelectorAll('.body-side-toggle .bst').forEach(b => {
      b.classList.toggle('on', b.dataset.side === this.bodySide);
    });
    if (this.tab === 'analyze') this.renderAnalyze();
  },

  setGender(g) {
    Store.s.settings.gender = g === 'female' ? 'female' : 'male';
    Store.save();
    toast(Store.s.settings.gender === 'female' ? '여성 해부도로 설정' : '남성 해부도로 설정');
    this.render();
  },

  recoveryFillColor(status) {
    if (!status || status.lastTrainedAt == null) return '#e5e7eb';
    const pct = status.recoveryPct;
    if (pct >= 80) return '#4ade80';
    if (pct >= 40) return '#facc15';
    return '#f87171';
  },

  async paintMuscleRecovery(recovery) {
    const root = el('analyzeBodyMap');
    if (!root || typeof BodyMap === 'undefined') return;
    const gender = Store.s.settings.gender === 'female' ? 'female' : 'male';
    const side = this.bodySide === 'back' ? 'back' : 'front';
    if (root.dataset.g === gender && root.dataset.s === side && root.querySelector('svg')) {
      BodyMap.paint(root, recovery);
      return;
    }
    await BodyMap.render(root, { gender, side, recovery });
  },

  renderWeekVolumeChart(daily) {
    const chart = el('analyzeWeekChart');
    const meta = el('analyzeVolMeta');
    const badge = el('analyzeVolBadge');
    if (!chart || !daily) return;

    const u = daily.unit || 'kg';
    const max = Math.max(1, ...daily.days.map(d => d.volume));
    const change = daily.changePct;
    const changeTxt = change == null ? '—' : `${change >= 0 ? '+' : ''}${change}%`;

    if (badge) {
      badge.className = 'pill ' + (change == null ? 'blue' : change >= 0 ? 'green' : 'red');
      badge.textContent = changeTxt;
    }
    if (meta) {
      meta.textContent =
        `합계 ${daily.total.toLocaleString()}${u} · 지난주 ${daily.lastWeek.toLocaleString()}${u}`;
    }

    chart.innerHTML = daily.days.map(d => {
      const h = d.volume > 0 ? Math.max(8, Math.round((d.volume / max) * 100)) : 3;
      const tip = d.volume > 0
        ? (d.volume >= 1000 ? `${Math.round(d.volume / 100) / 10}k` : String(d.volume))
        : '';
      return `<div class="vol-col${d.isToday ? ' today' : ''}" title="${d.dateStr} · ${d.volume.toLocaleString()}${u}">
        <div class="vol-val">${tip}</div>
        <div class="vol-bar-track"><div class="vol-bar" style="height:${h}%"></div></div>
        <div class="vol-lbl">${d.label}</div>
      </div>`;
    }).join('');
  },

  renderE1rmCards(e1rm) {
    const list = el('analyzeE1rmList');
    if (!list) return;
    const u = Store.s.settings.unit || 'kg';
    const lifts = [
      { key: '스쿼트', en: 'SQUAT' },
      { key: '벤치프레스', en: 'BENCH' },
      { key: '데드리프트', en: 'DEADLIFT' }
    ];

    list.innerHTML = lifts.map(({ key, en }) => {
      const x = e1rm && e1rm[key];
      if (!x || x.currentE1 == null) {
        return `<div class="e1-card empty">
          <div><div class="name">${key}</div><div class="sub">${en} · 기준 기록 필요</div></div>
          <div class="val">—</div>
        </div>`;
      }
      const d = x.deltaFromLastWeek;
      let deltaCls = 'flat', deltaTxt = '지난주 대비 —';
      if (d != null) {
        if (d > 0) { deltaCls = 'up'; deltaTxt = `지난주 대비 +${d}${u}`; }
        else if (d < 0) { deltaCls = 'down'; deltaTxt = `지난주 대비 ${d}${u}`; }
        else { deltaTxt = '지난주 대비 변동 없음'; }
      }
      return `<div class="e1-card">
        <div>
          <div class="name">${key}</div>
          <div class="sub">${en}${x.latestDate ? ' · ' + x.latestDate : ''}</div>
        </div>
        <div>
          <div class="val">${x.currentE1}<small>${u}</small></div>
          <div class="delta ${deltaCls}">${deltaTxt}</div>
        </div>
      </div>`;
    }).join('');
  },

  renderAnalyze() {
    el('hSub').textContent = '캘린더 · 회복도 · 볼륨 · e1RM';
    const todayStr = getTodayStr();
    const cal = el('analyzeCalendar');
    if (cal) cal.innerHTML = this.buildCalendarBlock(todayStr);

    const recovery = Store.getMuscleRecoveryStatus();
    const daily = Store.getDailyVolumesThisWeek();
    const e1rm = Store.getMainLiftE1RM();

    document.querySelectorAll('.body-side-toggle .bst').forEach(b => {
      b.classList.toggle('on', b.dataset.side === (this.bodySide || 'front'));
    });

    this.renderWeekVolumeChart(daily);
    this.renderE1rmCards(e1rm);
    this.paintMuscleRecovery(recovery);
  },

  /* ---------- 설정 ---------- */
  renderSettings() {
    el('hSub').textContent = Store.user ? `${Store.user.name} · 클라우드 동기화` : '이 기기에만 저장 중';
    const st = Store.s.settings, b = st.baseline;
    const bl = lift => `<div class="grid3">
      <div class="field"><label>${lift} 무게</label>
        <input type="number" value="${b[lift].w}" onchange="App.setBase('${lift}','w',this.value)"></div>
      <div class="field"><label>반복</label>
        <input type="number" value="${b[lift].reps}" onchange="App.setBase('${lift}','reps',this.value)"></div>
      <div class="field"><label>RIR</label>
        <input type="number" step="0.5" value="${b[lift].rir}" onchange="App.setBase('${lift}','rir',this.value)"></div>
    </div>`;

    const account = cloudEnabled()
      ? (Store.user
        ? `<div class="muted" style="margin-bottom:9px">
             <b>${esc(Store.user.name)}</b> 으로 로그인되어 있습니다. 변경사항은 자동으로 클라우드에 백업됩니다.</div>
           <div class="btnrow">
             <button class="btn ghost sm" onclick="Store.syncNow().then(()=>App.render())">지금 동기화</button>
             <button class="btn danger sm" onclick="App.doSignOut()">로그아웃</button>
           </div>`
        : `<div class="muted" style="margin-bottom:9px">로그인하면 다른 기기에서도 같은 기록을 볼 수 있습니다.</div>
           <button class="btn sm" onclick="App.showAuth()">로그인 / 회원가입</button>`)
      : `<div class="muted">클라우드가 설정되지 않았습니다. <code>config.js</code>에 Supabase URL과 anon key를 넣으면
         로그인·동기화가 켜집니다. 지금은 이 기기에만 저장됩니다.</div>`;

    el('viewSettings').innerHTML = `
      <div class="card"><h2>계정 · 동기화 <span id="syncBadge2" class="pill blue">${Store.syncState}</span></h2>${account}</div>

      <div class="card"><h2>증량 단위</h2>
        <div class="grid3">
          <div class="field"><label>바벨</label><input type="number" step="0.5" value="${st.unitBar}" onchange="App.setSetting('unitBar',this.value)"></div>
          <div class="field"><label>머신·케이블</label><input type="number" step="0.5" value="${st.unitMachine}" onchange="App.setSetting('unitMachine',this.value)"></div>
          <div class="field"><label>덤벨</label><input type="number" step="0.5" value="${st.unitDumbbell}" onchange="App.setSetting('unitDumbbell',this.value)"></div>
        </div>
        <div class="tiny">단위가 클수록 중량 대신 반복수로 진행합니다.</div>
      </div>

      <div class="card"><h2>메인 리프트 기준 기록</h2>
        <div class="tiny" style="margin-bottom:8px">
          비워 두면 3대 처방이 계산되지 않습니다. 이후에는 세션 기록으로 자동 갱신됩니다.</div>
        ${bl('스쿼트')}${bl('벤치프레스')}${bl('데드리프트')}
        <div class="grid2">
          <div class="field"><label>세션당 상승 상한(%)</label>
            <input type="number" step="0.5" value="${(st.capUp * 100).toFixed(1)}" onchange="App.setSetting('capUp',this.value/100)"></div>
          <div class="field"><label>세션당 하락 상한(%)</label>
            <input type="number" step="0.5" value="${(st.capDown * 100).toFixed(1)}" onchange="App.setSetting('capDown',this.value/100)"></div>
        </div>
      </div>

      <div class="card"><h2>유산소 · 심박</h2>
        <div class="grid3">
          <div class="field"><label>나이</label><input type="number" value="${st.age || ''}" onchange="App.setSetting('age',this.value)"></div>
          <div class="field"><label>안정시 심박</label><input type="number" value="${st.rhr || 70}" onchange="App.setSetting('rhr',this.value)"></div>
          <div class="field"><label>Zone2(분)</label><input type="number" value="${st.cardioMin}" onchange="App.setSetting('cardioMin',this.value)"></div>
        </div>
        <div class="field" style="margin-top:8px"><label>성별 (해부도)</label>
          <div class="gender-toggle">
            <button type="button" class="gt ${st.gender !== 'female' ? 'on' : ''}" onclick="App.setGender('male')">남성</button>
            <button type="button" class="gt ${st.gender === 'female' ? 'on' : ''}" onclick="App.setGender('female')">여성</button>
          </div>
        </div>
        ${CardioEngine.renderDashboard()}
      </div>

      <div class="card"><h2>타이머 · 알림</h2>
        ${this.toggle('autoRest', '세트 완료 시 휴식 타이머 자동 시작')}
        ${this.toggle('sound', '완료 시 소리')}
        ${this.toggle('vibrate', '완료 시 진동')}
        ${this.toggle('wakelock', '운동 중 화면 꺼짐 방지')}
        ${this.toggle('notify', '알림 표시')}
        <button class="btn ghost sm" style="margin-top:8px" onclick="App.askNotify()">알림 권한 요청</button>
        <div class="tiny" style="margin-top:8px">
          휴대폰이 앱을 완전히 잠재우면 어떤 웹앱도 코드를 실행할 수 없습니다. 이 앱은 <b>종료 시각</b>을 저장해
          화면을 다시 켤 때 정확한 남은 시간을 복원하고, 이미 지났으면 즉시 알립니다.
        </div>
      </div>

      <div class="card"><h2>데이터</h2>
        <div class="btnrow">
          <button class="btn ghost sm" onclick="App.exportData()">백업 내보내기</button>
          <button class="btn ghost sm" onclick="App.importData()">복원</button>
        </div>
        <div style="height:9px"></div>
        <button class="btn danger sm" onclick="App.wipe()">이 기기 데이터 삭제</button>
      </div>

      <div class="card"><h2>알고리즘</h2>
        <div class="muted">
          <b>메인 3대</b> — 모든 세트를 RIR로 e1RM 환산 → 세션 최고값 → 다음 처방.
          증량 단위가 크면 중량 대신 <b>반복수</b>가 진행을 담당하고, 예상 반복이 상한을 넘을 때만 증량됩니다.
          상승·하락 모두 자동이며 각각 상한이 걸려 있습니다.<br><br>
          <b>보조·머신</b> — 세트별 이중 점진. 지난 세션의 그 세트보다 반복 +1, 상한 도달 시 한 단위 증량 후 하한 리셋.<br><br>
          <b>레스트포즈</b> — 미니세트가 전부 실패로 끝나 RIR이 무의미하므로 고정 중량에서의 총 반복수로 진행합니다.
        </div>
      </div>`;
  },

  toggle(k, label) {
    const on = !!Store.s.settings[k];
    return `<div class="exitem"><div class="g"><div class="n" style="font-weight:600">${label}</div></div>
      <button class="pill ${on ? 'green' : 'blue'}" onclick="App.setSetting('${k}',${!on})">${on ? 'ON' : 'OFF'}</button></div>`;
  },
  setSetting(k, v) {
    Store.s.settings[k] = (typeof v === 'boolean') ? v : (v === '' ? null : (isNaN(+v) ? v : +v));
    Store.save(); this.render();
  },
  setBase(lift, f, v) {
    Store.s.settings.baseline[lift][f] = +v || 0;
    Store.save();
  },
  askNotify() {
    if (!('Notification' in window)) { toast('알림을 지원하지 않는 브라우저입니다'); return; }
    Notification.requestPermission().then(p => {
      if (p === 'granted') { Store.s.settings.notify = true; Store.save(); toast('알림이 켜졌습니다'); }
      else toast('알림 권한이 거부되었습니다');
      this.render();
    });
  },
  exportData() {
    const blob = new Blob([JSON.stringify(Store.s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `autoreg-backup-${getTodayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importData() {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'application/json';
    i.onchange = () => {
      const f = i.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d.programs || !d.settings) throw 0;
          Store.s = d;
          Store.meta.stateAt = Date.now();
          Store.meta.dirtyState = true;
          Object.keys(d.logs || {}).forEach(k => {
            Store.meta.logAt[k] = Date.now();
            if (!Store.meta.dirtyLogs.includes(k)) Store.meta.dirtyLogs.push(k);
          });
          Store.migrateLogsToSessions();
          Store.writeLocal(); Store.scheduleSync();
          toast('복원 완료'); this.go('home');
        } catch (e) { toast('파일을 읽을 수 없습니다'); }
      };
      r.readAsText(f);
    };
    i.click();
  },
  wipe() {
    if (!confirm('이 기기의 모든 루틴과 기록이 삭제됩니다. 계속할까요?')) return;
    if (!confirm('되돌릴 수 없습니다. 정말 삭제할까요?')) return;
    localStorage.removeItem(CFG.STORAGE_KEY);
    localStorage.removeItem(CFG.META_KEY);
    Store.load(); this.go('home'); toast('초기화되었습니다');
  }
};

/* ---------- 부팅 ---------- */
window.addEventListener('DOMContentLoaded', () => {
  App.init();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  document.addEventListener('touchstart', () => {
    if (App._ac && App._ac.state === 'suspended') App._ac.resume();
  }, { once: true });
});
