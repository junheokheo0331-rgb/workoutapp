/* ============================================================
   body-map.js — react-muscle-highlighter SVG 자산 로더
   CDN에서 남/여 · 전/후면 path 데이터를 받아 바닐라 SVG로 렌더한다.
   ============================================================ */
'use strict';

const BodyMap = {
  CDN: 'https://cdn.jsdelivr.net/npm/react-muscle-highlighter@1.2.0/dist/esm/assets',
  cache: {},

  FILES: {
    male: { front: 'bodyFront.js', back: 'bodyBack.js' },
    female: { front: 'bodyFemaleFront.js', back: 'bodyFemaleBack.js' }
  },

  VIEWBOX: {
    male: { front: '0 0 724 1448', back: '724 0 724 1448' },
    female: { front: '-50 -40 734 1538', back: '756 0 774 1448' }
  },

  SLUG_TO_ENGINE: typeof SLUG_TO_ENGINE_MUSCLES !== 'undefined' ? SLUG_TO_ENGINE_MUSCLES : {
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
  },

  fillFromPct(pct, trained) {
    if (!trained) return '#e5e7eb';
    if (pct >= 80) return '#4ade80';
    if (pct >= 40) return '#facc15';
    return '#f87171';
  },

  colorForSlug(slug, recovery) {
    const keys = this.SLUG_TO_ENGINE[slug];
    if (!keys || !keys.length) return '#e5e7eb';
    let lowest = null;
    let trained = false;
    keys.forEach(k => {
      const st = recovery && recovery[k];
      if (!st || st.lastTrainedAt == null) return;
      trained = true;
      if (lowest == null || st.recoveryPct < lowest) lowest = st.recoveryPct;
    });
    return this.fillFromPct(lowest == null ? 100 : lowest, trained);
  },

  async loadParts(gender, side) {
    const g = gender === 'female' ? 'female' : 'male';
    const s = side === 'back' ? 'back' : 'front';
    const key = g + '-' + s;
    if (this.cache[key]) return this.cache[key];
    const url = this.CDN + '/' + this.FILES[g][s];
    const text = await fetch(url).then(r => {
      if (!r.ok) throw new Error('해부도 자산 로드 실패: ' + r.status);
      return r.text();
    });
    const parts = new Function(text.replace(/export\s+const\s+\w+\s*=/, 'return '))();
    this.cache[key] = parts;
    return parts;
  },

  buildSvg(parts, gender, side, recovery) {
    const g = gender === 'female' ? 'female' : 'male';
    const s = side === 'back' ? 'back' : 'front';
    const vb = this.VIEWBOX[g][s];
    let paths = '';
    (parts || []).forEach(part => {
      const slug = part.slug;
      if (!slug || !part.path) return;
      const color = this.colorForSlug(slug, recovery);
      const engines = (this.SLUG_TO_ENGINE[slug] || []).join(' ');
      ['left', 'right'].forEach(lr => {
        ((part.path[lr]) || []).forEach((d, i) => {
          paths += `<path class="bm-path" data-slug="${slug}" data-side="${lr}"`
            + (engines ? ` data-muscle="${engines}"` : '')
            + ` id="muscle-${slug}-${lr}-${i}" d="${d}" fill="${color}"`
            + ` stroke="#cbd5e1" stroke-width="0.6"></path>`;
        });
      });
    });
    return `<svg id="analyzeBodySvg" class="body-hq-svg" viewBox="${vb}"`
      + ` xmlns="http://www.w3.org/2000/svg" role="img"`
      + ` aria-label="${g} body ${s}">${paths}</svg>`;
  },

  async render(container, opts) {
    if (!container) return;
    const gender = (opts && opts.gender) === 'female' ? 'female' : 'male';
    const side = (opts && opts.side) === 'back' ? 'back' : 'front';
    const recovery = (opts && opts.recovery) || {};
    container.dataset.g = gender;
    container.dataset.s = side;
    container.innerHTML = '<div class="body-map-loading muted">고화질 해부도 불러오는 중…</div>';
    try {
      const parts = await this.loadParts(gender, side);
      if (container.dataset.g !== gender || container.dataset.s !== side) return;
      container.innerHTML = this.buildSvg(parts, gender, side, recovery);
      container.classList.add('body-map-ready');
    } catch (e) {
      console.warn(e);
      container.innerHTML = '<div class="emptybox">해부도를 불러오지 못했습니다.'
        + '<br><span class="tiny">인터넷 연결 후 다시 시도하세요.</span></div>';
    }
  },

  paint(container, recovery) {
    if (!container) return;
    container.querySelectorAll('[data-slug]').forEach(node => {
      const color = this.colorForSlug(node.getAttribute('data-slug'), recovery);
      node.setAttribute('fill', color);
      node.style.fill = color;
    });
  }
};
