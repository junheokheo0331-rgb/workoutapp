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
  cur: null,            // { date, programId }
  editProgramId: null,
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
    this.showSplash();
  },

  /* ---------- 스플래시 · 최초 세팅 ---------- */
  showSplash() {
    const btn = el('splashBtn');
    if (btn) btn.style.display = 'inline-block';
  },
  startFromSplash() {
    const splash = el('splashScreen');
    if (splash) splash.classList.add('hide-splash');
    setTimeout(() => {
      if (cloudEnabled() && !Store.user) this.showAuth();
      else if (Store.s.settings.isFirstRun) this.showInitialSetup();
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
      if (Store.s.settings.isFirstRun) this.showInitialSetup();
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
    if (Store.s.settings.isFirstRun) this.showInitialSetup();
  },

  async doSignOut() {
    if (!confirm('로그아웃할까요? 이 기기의 기록은 남습니다.')) return;
    await Store.signOut();
    Store.paint(); this.render();
    toast('로그아웃되었습니다');
  },

  showInitialSetup() {
    const html = `
      <div class="tiny" style="margin-bottom:12px">
        3대 운동 기준 기록은 <b>자동 처방의 출발점</b>입니다. 여기가 비어 있으면 목표 중량이 계산되지 않습니다.
        1RM을 모르면 최근에 확실히 성공한 무게를 넣어도 됩니다(이후 세션 기록으로 자동 보정됩니다).
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

  saveInitialSetup() {
    const st = Store.s.settings;
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
    if (s.session && s.session.date === getTodayStr()) {
      this.cur = { date: s.session.date, programId: s.session.programId };
    } else s.session = null;
  },

  /* ---------- 라우팅 ---------- */
  go(tab) {
    this.tab = tab;
    ['home', 'workout', 'program', 'stats', 'settings'].forEach(t => {
      const n = el('view' + t[0].toUpperCase() + t.slice(1));
      if (n) n.classList.toggle('hide', t !== tab);
    });
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    el('hAction').textContent = tab === 'workout' ? '세션 종료' : '설정';
    const T = { home: '오늘의 훈련', workout: '운동 중', program: '루틴 편집', stats: '기록', settings: '설정' };
    el('hTitle').textContent = T[tab];
    this.render();
    window.scrollTo(0, 0);
  },

  render() {
    if (this.tab === 'home') this.renderHome();
    else if (this.tab === 'workout') this.renderWorkout();
    else if (this.tab === 'program') this.renderProgram();
    else if (this.tab === 'stats') this.renderStats();
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

    /* 월간 캘린더 */
    const year = today.getFullYear(), month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let monthHtml = `<div class="card"><h2>${month + 1}월 <span class="tiny">날짜를 누르면 그날 기록</span></h2><div class="monthly-cal">`;
    for (let i = 0; i < firstDay; i++) monthHtml += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iter = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      monthHtml += `<div class="m-day ${d === today.getDate() ? 'today' : ''} ${dayDone(iter) > 0 ? 'done' : ''}"
        onclick="App.openHistoryViewer('${iter}')">${d}</div>`;
    }
    monthHtml += '</div></div>';

    /* 주간 바 */
    let weekCal = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.viewMonday); d.setDate(this.viewMonday.getDate() + i);
      const iter = dateStrOf(d);
      const done = dayDone(iter);
      weekCal += `<div class="daycell ${iter === todayStr ? 'today' : ''} ${done ? 'done' : ''}"
        onclick="App.openHistoryViewer('${iter}')">
        <div class="dw">${WD[d.getDay()]}</div><div class="dd">${d.getDate()}</div>
        <div class="tag">${done ? done + '세트' : ''}</div></div>`;
    }

    /* 오늘 추천 루틴 (dayHint 기준) */
    const hintKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][today.getDay()];
    const recommended = Store.s.programs.find(p => p.dayHint === hintKey);

    let routines = '';
    Store.s.programs.forEach(p => {
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

    let html = monthHtml + `
      <div class="card">
        <div class="weeknav">
          <button class="navb" onclick="App.shiftWeek(-1)">‹ 이전 주</button>
          <b>${fmtDate(this.viewMonday)} 주간</b>
          <button class="navb" onclick="App.shiftWeek(1)">다음 주 ›</button>
        </div>
        <div class="weekbar">${weekCal}</div>
      </div>
      <div class="card">
        <h2>수행할 루틴 선택</h2>
        <div class="muted" style="margin-bottom:12px">
          루틴을 고르면 각 운동의 <b>지난 기록</b>과 <b>이번 목표</b>가 자동으로 계산되어 표시됩니다.</div>
        ${routines}
        <button class="btn ghost sm" style="margin-top:8px" onclick="App.go('program')">＋ 새 루틴 만들기</button>
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

  shiftWeek(n) {
    this.viewMonday = new Date(this.viewMonday.getTime() + n * 7 * 86400000);
    this.render();
  },

  openHistoryViewer(dateStr) {
    const log = getLog(dateStr, false);
    const u = Store.s.settings.unit || 'kg';
    if (!log || dayDone(dateStr) === 0) {
      const isFuture = dateStr > getTodayStr();
      modal(dateStr, `<div class="emptybox">${isFuture ? '아직 오지 않은 날입니다.' : '이 날은 기록이 없습니다.'}</div>
        ${isFuture ? '' : `<button class="btn" onclick="App.startOnDate('${dateStr}')">이 날짜로 세션 기록하기</button>`}
        <button class="btn ghost sm" style="margin-top:8px" onclick="closeModal()">닫기</button>`);
      return;
    }
    const p = Store.s.programs.find(x => x.id === log.programId);
    let rows = '';
    Object.entries(log.sets).forEach(([exId, arr]) => {
      const e = findExById(exId);
      const done = (arr || []).filter(s => s && s.done);
      if (!done.length) return;
      const detail = done.map(s => `${+s.w}${u}×${+s.reps}` + (s.rir != null ? `(R${+s.rir})` : '')).join(', ');
      rows += `<tr><td style="text-align:left">${esc(e ? e.name : '(삭제된 운동)')}</td>
        <td style="text-align:left">${esc(detail)}</td></tr>`;
    });
    const vol = Object.values(log.sets).flat()
      .filter(s => s && s.done).reduce((a, s) => a + (+s.w || 0) * (+s.reps || 0), 0);
    modal(`${dateStr} 기록`, `
      <div class="muted" style="margin-bottom:8px">
        ${esc(p ? p.title : '루틴 미지정')} · ${dayDone(dateStr)}세트 · 총 볼륨 ${Math.round(vol).toLocaleString()}${u}</div>
      <table class="hist"><tbody>${rows}</tbody></table>
      <button class="btn ghost sm" style="margin-top:12px" onclick="App.startOnDate('${dateStr}')">이 날짜 이어서 기록</button>
      <button class="btn ghost sm" style="margin-top:8px" onclick="closeModal()">닫기</button>`);
  },

  startOnDate(dateStr) {
    closeModal();
    const log = getLog(dateStr, false);
    const pid = (log && log.programId) || (Store.s.programs[0] && Store.s.programs[0].id);
    if (!pid) { toast('루틴이 없습니다'); return; }
    this.startSession(dateStr, pid);
  },

  /* ---------- 세션 ---------- */
  startSession(dateStr, programId) {
    this.cur = { date: dateStr, programId };
    const log = getLog(dateStr, true);
    if (!log.startedAt) log.startedAt = Date.now();
    log.programId = programId;
    Store.s.session = { date: dateStr, programId };
    Store.save(dateStr);
    this.requestWakeLock();
    this.go('workout');
  },

  finishSession() {
    if (!this.cur) { this.go('home'); return; }
    const { date } = this.cur;
    const log = getLog(date, true);
    log.endedAt = Date.now();
    Store.s.session = null;
    Store.save(date);
    this.releaseWakeLock();
    toast(`세션 종료 · ${dayDone(date)}세트 기록`);
    this.cur = null;
    this.go('home');
  },

  renderWorkout() {
    if (!this.cur) {
      el('viewWorkout').innerHTML = `<div class="card"><div class="emptybox">진행 중인 세션이 없습니다.</div>
        <button class="btn" onclick="App.go('home')">홈으로</button></div>`;
      return;
    }
    const { date, programId } = this.cur;
    const prog = Store.s.programs.find(x => x.id === programId);
    if (!prog) return this.go('home');

    const log = getLog(date, true);
    const total = progTotalSets(programId), done = dayDone(date);
    const elapsed = log.startedAt ? (Date.now() - log.startedAt) / 1000 : 0;
    const u = Store.s.settings.unit || 'kg';
    el('hSub').textContent = `${esc(prog.title)} · ${date}`;

    let html = `${CardioEngine.renderDashboard()}
      <div class="sessbar">
        <div><div class="l">세션 경과</div><div class="v" id="sessT">${hhmmss(elapsed)}</div></div>
        <div style="text-align:center"><div class="l">완료</div><div class="v">${done}/${total}</div></div>
        <div style="text-align:right"><div class="l">진행률</div><div class="v">${total ? Math.round(done / total * 100) : 0}%</div></div>
      </div>`;

    prog.items.forEach((e, ei) => {
      const tg = Engine.targets(e, date);
      const rec = log.sets[e.id] || [];
      const prev = Engine.prevRecord(e.id, date);
      const prevLine = Engine.prevText(e.id, date, u);

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

      html += `<div class="card">
        <div class="exhead">
          <div style="flex:1;min-width:0">
            <div class="exname">${esc(e.name)}</div>
            <div class="exmeta">${e.type === 'cardio' ? '유산소' : esc(e.equip)}${e.lift ? ' · ' + esc(e.lift) : ''} · 휴식 ${mmss(e.rest)}${e.note ? ' · ' + esc(e.note) : ''}</div>
            <div class="prev-record">📌 ${prevLine ? '지난 수행 ' + esc(prevLine) : '이전 기록 없음 — 첫 수행'}</div>
          </div>
          <button class="iconb" onclick="App.editExercise('${programId}',${ei})">✎</button>
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

    html += `<div class="card">
      <button class="btn ghost" style="margin-bottom:12px" onclick="App.addExercise('${programId}')">➕ 이 루틴에 운동 추가</button>
      <button class="btn" onclick="App.finishSession()">세션 저장 및 종료</button>
    </div>`;
    el('viewWorkout').innerHTML = html;
  },

  setVal(exId, idx, field, val) {
    const { date } = this.cur;
    const log = getLog(date, true);
    if (!log.sets[exId]) log.sets[exId] = [];
    while (log.sets[exId].length <= idx) log.sets[exId].push({});
    log.sets[exId][idx][field] = val === '' ? null : +val;
    Store.save(date);
  },

  toggleSet(exId, idx) {
    const { date } = this.cur;
    const e = findExById(exId);
    const log = getLog(date, true);
    if (!log.sets[exId]) log.sets[exId] = [];
    while (log.sets[exId].length <= idx) log.sets[exId].push({});
    const s = log.sets[exId][idx];
    if (s.done) { s.done = false; Store.save(date); this.renderWorkout(); return; }

    if (e.type === 'cardio') {
      s.done = true; s.at = Date.now();
      Store.save(date); this.renderWorkout(); return;
    }
    const t = Engine.targets(e, date)[idx] || {};
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
  restStop() { Store.s.timer = null; Store.save(); this.renderRest(); },
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
    if (this.tab === 'workout' && this.cur) {
      const log = getLog(this.cur.date, false), n = el('sessT');
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

  /* ---------- 루틴 편집 ---------- */
  renderProgram() {
    el('hSub').textContent = '루틴 템플릿 · 자유 편집';
    if (this.editProgramId) return this.renderProgramDetail(this.editProgramId);
    let html = '';
    Store.s.programs.forEach(p => {
      html += `<div class="card">
        <h2>${esc(p.title)} <span class="pill blue">${p.items.length}개</span></h2>
        <div class="muted" style="margin-bottom:10px">${esc(p.desc || '')}</div>
        <div class="btnrow">
          <button class="btn ghost sm" onclick="App.openProgramDetail('${p.id}')">운동 편집</button>
          <button class="btn ghost sm" onclick="App.renameProgram('${p.id}')">이름 변경</button>
          <button class="btn danger sm" onclick="App.deleteProgram('${p.id}')">삭제</button>
        </div></div>`;
    });
    html += `<div class="card">
      <button class="btn" onclick="App.createProgram()">＋ 새 루틴 만들기</button>
      <div style="height:9px"></div>
      <button class="btn danger sm" onclick="App.resetProgram()">기본 2분할 루틴으로 복원</button>
      <div class="tiny" style="margin-top:8px">복원해도 훈련 기록은 지워지지 않습니다.</div>
    </div>`;
    el('viewProgram').innerHTML = html;
  },

  openProgramDetail(pId) { this.editProgramId = pId; this.renderProgram(); },

  renderProgramDetail(pId) {
    const p = Store.s.programs.find(x => x.id === pId);
    if (!p) { this.editProgramId = null; return this.renderProgram(); }
    const items = p.items.map((e, i) => `
      <div class="exitem">
        <div class="iconb">${i + 1}</div>
        <div class="g"><div class="n">${esc(e.name)}</div>
          <div class="m">${e.type === 'cardio' ? `유산소 ${e.targetMin}분`
            : `${e.sets}세트 · ${e.mode === 'restpause' ? '총 ' : ''}${e.repLo}~${e.repHi}회 · RIR${e.rir} · ${mmss(e.rest)}`}${e.lift ? ' · ' + esc(e.lift) : ''}</div></div>
        <button class="iconb" onclick="App.moveExercise('${pId}',${i},-1)">↑</button>
        <button class="iconb" onclick="App.moveExercise('${pId}',${i},1)">↓</button>
        <button class="iconb" onclick="App.editExercise('${pId}',${i})">✎</button>
        <button class="iconb del" onclick="App.deleteExercise('${pId}',${i})">✕</button>
      </div>`).join('') || '<div class="emptybox">운동이 없습니다</div>';
    el('viewProgram').innerHTML = `
      <div class="card">
        <h2>${esc(p.title)}
          <button class="pill blue" onclick="App.editProgramId=null;App.render()">← 목록</button></h2>
        <div class="muted" style="margin-bottom:8px">${esc(p.desc || '')}</div>
        ${items}
        <div style="height:9px"></div>
        <button class="btn ghost sm" onclick="App.addExercise('${pId}')">＋ 운동 추가</button>
      </div>`;
  },

  createProgram() {
    const t = prompt('새 루틴 이름', '나의 루틴');
    if (!t) return;
    const p = { id: 'p' + Math.random().toString(36).slice(2, 8), title: t.trim(), desc: '', dayHint: '', items: [] };
    Store.s.programs.push(p);
    Store.save(); this.openProgramDetail(p.id);
  },
  renameProgram(pId) {
    const p = Store.s.programs.find(x => x.id === pId);
    const t = prompt('루틴 이름', p.title); if (t == null) return;
    const d = prompt('설명', p.desc || '');
    p.title = t.trim() || p.title; if (d != null) p.desc = d.trim();
    Store.save(); this.render();
  },
  deleteProgram(pId) {
    const p = Store.s.programs.find(x => x.id === pId);
    if (!confirm(`"${p.title}" 루틴을 삭제할까요? (기록은 남습니다)`)) return;
    Store.s.programs = Store.s.programs.filter(x => x.id !== pId);
    if (this.editProgramId === pId) this.editProgramId = null;
    Store.save(); this.render();
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
    Store.save(); this.render(); toast('기본 루틴 복원');
  },

  /* ---------- 기록 ---------- */
  renderStats() {
    el('hSub').textContent = 'e1RM 추이 · 세션 누적';
    const dates = Engine.datesSorted().filter(d => dayDone(d) > 0);
    const u = Store.s.settings.unit || 'kg';
    if (!dates.length) {
      el('viewStats').innerHTML = `<div class="card"><div class="emptybox">
        아직 기록이 없습니다.<br><span class="tiny">세션을 완료하면 다음 목표가 자동 계산됩니다.</span></div></div>`;
      return;
    }
    const tomorrow = dateStrOf(new Date(Date.now() + 86400000));
    let html = '<div class="card"><h2>메인 리프트 e1RM</h2>';
    ['스쿼트', '벤치프레스', '데드리프트'].forEach(lift => {
      const b = Store.s.settings.baseline[lift];
      const b0 = b && b.w ? e1rmOf(b.w, b.reps, b.rir) : 0;
      if (!b0) {
        html += `<div style="margin-bottom:10px"><b style="font-size:13px">${lift}</b>
          <div class="tiny">기준 기록이 없어 처방이 계산되지 않습니다. 설정에서 입력하세요.</div></div>`;
        return;
      }
      const series = dates.map(d => Engine.bestE1ForDate(d, lift)).filter(v => v > 0);
      const applied = Engine.appliedE1(lift, tomorrow);
      const mx = Math.max(b0, ...series, 1);
      const bars = [b0].concat(series)
        .map((v, i, a) => `<i class="${i === a.length - 1 ? 'last' : ''}" style="height:${Math.max(4, v / mx * 100)}%"></i>`).join('');
      const diff = applied - b0;
      html += `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <b style="font-size:13px">${lift}</b>
          <span><b style="font-size:16px">${applied}</b><span class="tiny"> ${u}</span>
          <span class="pill ${diff > 0 ? 'green' : diff < 0 ? 'red' : 'blue'}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</span></span>
        </div>
        <div class="spark">${bars}</div>
        <div class="tiny">기준 ${b0.toFixed(1)} → 다음 세션 적용 ${applied}${u}</div>
      </div>`;
    });
    html += '</div>';

    dates.slice().reverse().slice(0, 30).forEach(d => {
      const log = Store.s.logs[d];
      const p = Store.s.programs.find(x => x.id === log.programId);
      let rows = '', vol = 0, n = 0;
      Object.entries(log.sets).forEach(([exId, arr]) => {
        const e = findExById(exId);
        const done = (arr || []).filter(s => s && s.done);
        if (!done.length) return;
        const reps = done.reduce((a, s) => a + (+s.reps || 0), 0);
        const v = done.reduce((a, s) => a + (+s.reps || 0) * (+s.w || 0), 0);
        vol += v; n += done.length;
        rows += `<tr><td style="text-align:left">${esc(e ? e.name : '(삭제됨)')}</td>
          <td>${done.length}</td><td>${reps}</td><td>${Math.round(v).toLocaleString()}</td></tr>`;
      });
      html += `<div class="card"><h2>${d}
        <span class="pill blue">${n}세트 · ${Math.round(vol).toLocaleString()}${u}</span></h2>
        <div class="muted" style="margin-bottom:6px">${esc(p ? p.title : '루틴 미지정')}</div>
        <table class="hist"><thead><tr><th style="text-align:left">종목</th><th>세트</th><th>총반복</th><th>볼륨</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    });
    el('viewStats').innerHTML = html;
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
