// Family tree app: rendering, navigation, editing and saving.
(function () {
  const { Tree, layout, CARD_W, CARD_H, COUPLE_GAP, ROW_GAP } = FT;
  const { formatDate, shortYear, normalizeDateInput, yearsBetween, todayStr, parseDate, MONTHS } = FT;

  const $ = (s, el = document) => el.querySelector(s);
  const svg = $('#canvas'), vp = $('#viewport');
  const VIEW_KEY = 'familytree.view';

  const state = {
    tree: null,
    editable: false,
    focus: null,
    view: { down: {}, up: {}, hide: {} },
    selected: null,
    L: null,
    cam: { x: 0, y: 0, k: 1 },
    history: [],
    future: [],
    lastKey: null,
    lastTime: 0,
    newPerson: null,
    newPersonSnap: null,
    version: null,
    settings: null,
    D: null,
    rot: 0,
  };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const tree = () => state.tree;
  const P = (id) => state.tree.person(id);
  const nameOf = (id) => (P(id) && P(id).name ? P(id).name : 'Unnamed');
  const initials = (name) => {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    return ((w[0][0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  };
  const dead = (id) => state.tree.isDeceased(id);

  const measure = (() => {
    const ctx = document.createElement('canvas').getContext('2d');
    return (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
  })();
  const FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  const NAME_FONT = '600 13.5px ' + FAMILY;
  function fit(text, max, font) {
    font = font || NAME_FONT;
    if (measure(text, font) <= max) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (measure(text.slice(0, mid) + '…', font) <= max) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
  }

  // Full name on one or two lines, shrinking the text a little before ever cutting it.
  const NAME_SIZES = [13.5, 12.5, 11.5];
  function nameLines(name, max, sizes) {
    sizes = sizes || NAME_SIZES;
    const words = name.trim().split(/\s+/);
    for (const size of sizes) {
      const font = `600 ${size}px ${FAMILY}`;
      if (measure(name, font) <= max) return { size, lines: [name] };
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const w = Math.max(measure(a, font), measure(b, font));
        if (!best || w < best.w) best = { w, lines: [a, b] };
      }
      if (best && best.w <= max) return { size, lines: best.lines };
    }
    const size = sizes[sizes.length - 1], font = `600 ${size}px ${FAMILY}`;
    let i = 1;
    while (i < words.length && measure(words.slice(0, i + 1).join(' '), font) <= max) i++;
    const first = fit(words.slice(0, i).join(' '), max, font);
    const rest = words.slice(i).join(' ');
    return { size, lines: rest ? [first, fit(rest, max, font)] : [first] };
  }

  // Years shown above a couple's line, only when known.
  function coupleLabel(u) {
    const s = FT.yearOf(u.start), e = FT.yearOf(u.end);
    if (s && e) return s + '–' + (Math.floor(s / 100) === Math.floor(e / 100) ? String(e).slice(2) : e);
    if (e) return '–' + e;
    return s ? String(s) : '';
  }
  const STATUS = { '': 'Together', partner: 'Together', married: 'Married', separated: 'Not together anymore', divorced: 'Divorced' };
  const isEnded = (status) => status === 'separated' || status === 'divorced';
  function knot(x, y, u) {
    const tip = STATUS[u.status || ''] + (state.editable ? ' — click to change' : '');
    const act = state.editable ? `data-act="couple" data-u="${u.id}"` : '';
    return `<g class="knot${isEnded(u.status) ? ' ended' : ''}${state.editable ? ' editable' : ''}" ${state.editable ? act : `data-u="${u.id}"`} transform="translate(${Math.round(x * 10) / 10},${Math.round(y * 10) / 10})"><title>${esc(tip)}</title><circle class="hit" r="12"/><circle class="dot" r="4.5"/></g>`;
  }

  function yearsText(p) {
    const b = shortYear(p.birth), d = shortYear(p.death);
    if (p.deceased || p.death) return b || d ? (b || '?') + ' – ' + (d || '?') : 'passed away';
    return b ? 'b. ' + b : '';
  }

  function toast(msg, isErr, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, ms || 3200);
  }

  function saveView() {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(state.view)); } catch (e) { /* storage unavailable */ }
  }
  function loadView() {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (v && typeof v === 'object') state.view = { down: v.down || {}, up: v.up || {}, hide: v.hide || {} };
    } catch (e) { /* storage unavailable */ }
  }

  // ---------- settings ----------
  const SETTINGS_KEY = 'familytree.settings';
  const DEFAULTS = { focus: true, radius: 2, sizes: true, detail: true, hover: true, colors: true, smartHide: true, circle: false, improved: true };
  function loadSettings() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { /* storage unavailable */ }
    state.settings = Object.assign({}, DEFAULTS, stored && typeof stored === 'object' ? stored : {});
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) { /* storage unavailable */ }
  }

  // ---------- camera ----------
  function applyCam() {
    const c = state.cam;
    vp.setAttribute('transform', `translate(${c.x},${c.y}) scale(${c.k})`);
    scheduleLOD();
  }
  function stageSize() {
    const r = svg.getBoundingClientRect();
    return { w: r.width, h: r.height - 56, top: 56 };
  }
  function camFor(x, y, k) {
    const s = stageSize();
    return { x: s.w / 2 - x * k, y: s.top + s.h / 2 - y * k, k };
  }
  function centerOnPoint(x, y, k) {
    Object.assign(state.cam, camFor(x, y, k || state.cam.k));
    applyCam();
  }
  const box = (id) => state.D && state.D.nodes[id];
  function centerOn(id) {
    const n = box(id);
    if (n) centerOnPoint(n.x + n.w / 2, n.y + n.h / 2);
  }
  function ensureVisible(id) {
    const n = box(id);
    if (!n) return;
    const s = stageSize(), c = state.cam;
    const sx = n.x * c.k + c.x, sy = n.y * c.k + c.y, pad = 40;
    if (sx < pad || sy < s.top + pad || sx + n.w * c.k > s.w - pad || sy + n.h * c.k > s.top + s.h - pad) centerOn(id);
  }
  function fitAll() {
    const b = state.D.bounds, s = stageSize();
    const w = b.maxX - b.minX + 80, h = b.maxY - b.minY + 80;
    const k = Math.min(1, s.w / w, s.h / h);
    if (k < 0.62 && !state.settings.circle) centerOnPoint(state.D.center.x, state.D.center.y, 0.8);
    else centerOnPoint((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, Math.max(0.12, k));
  }
  function zoomAt(px, py, f) {
    const c = state.cam;
    const k = Math.min(2.5, Math.max(0.08, c.k * f));
    c.x = px - (px - c.x) * (k / c.k);
    c.y = py - (py - c.y) * (k / c.k);
    c.k = k;
    applyCam();
  }
  // Smoothly move the camera; matches the cards' own transition so a kept card stays put.
  let camAnim = null;
  function animateCam(target, ms) {
    cancelAnimationFrame(camAnim);
    const from = Object.assign({}, state.cam), t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      state.cam.x = from.x + (target.x - from.x) * e;
      state.cam.y = from.y + (target.y - from.y) * e;
      state.cam.k = from.k + (target.k - from.k) * e;
      applyCam();
      if (t < 1) camAnim = requestAnimationFrame(step);
    };
    camAnim = requestAnimationFrame(step);
  }

  // ---------- rendering ----------
  const ANIM_MS = 480;
  function layoutOpts() {
    const S = state.settings;
    return { radius: S.focus ? S.radius : null, sizes: S.sizes, improved: S.improved };
  }
  // opts.animate: cards glide from their old places; the anchor card stays where it is on screen.
  function render(anchorId, opts) {
    opts = opts || {};
    const prevBoxes = state.D ? state.D.nodes : null;
    const old = anchorId && box(anchorId);
    const before = old ? { x: old.x * state.cam.k + state.cam.x, y: old.y * state.cam.k + state.cam.y } : null;
    // The person or couple the tree is centred on may have been deleted or undone.
    const t = state.tree;
    if ((state.focus.person && !t.person(state.focus.person)) || (state.focus.union && !t.union(state.focus.union))) {
      state.focus = { union: t.data.root };
    }
    if (!t.union(state.focus.union) && !t.person(state.focus.person)) {
      const first = Object.keys(t.data.people)[0];
      state.focus = first ? { person: first } : state.focus;
    }
    state.L = layout(state.tree, state.focus, state.view, layoutOpts());
    draw(opts.animate ? prevBoxes : null);
    const now = anchorId && box(anchorId);
    if (before && now) {
      const target = { x: before.x - now.x * state.cam.k, y: before.y - now.y * state.cam.k, k: state.cam.k };
      if (opts.animate) animateCam(target, ANIM_MS); else Object.assign(state.cam, target), applyCam();
    }
    updateChrome();
  }

  // Where things go on screen: straight rows, or the circle (rows become rings, scroll rotates).
  function projector(L) {
    if (!state.settings.circle) return { circle: false, pt: (x, y) => [x, y] };
    const b = L.bounds;
    const x0 = b.minX - 80, span = Math.max(1, b.maxX - b.minX + 160);
    const ARC = Math.PI * 2 * 0.94, RK = 1.5;
    const R0 = span / ARC + 80, yMin = b.minY;
    const base = Math.PI / 2 - ((L.center.x - x0) / span) * ARC;
    const th = (x) => base + state.rot + ((x - x0) / span) * ARC;
    const rr = (y) => R0 + (y - yMin) * RK;
    return { circle: true, th, rr, pt: (x, y) => { const a = th(x), r = rr(y); return [r * Math.cos(a), r * Math.sin(a)]; } };
  }
  const f1 = (v) => Math.round(v * 10) / 10;
  // Lines are described as straight segments in row coordinates; in the circle, horizontal
  // segments become arcs and vertical ones become rays.
  function pathOf(polys, pj) {
    let d = '';
    for (const pts of polys) {
      let [x0, y0] = pts[0];
      let [sx, sy] = pj.pt(x0, y0);
      d += `M${f1(sx)},${f1(sy)}`;
      for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [ex, ey] = pj.pt(x1, y1);
        if (pj.circle && Math.abs(y1 - y0) < 0.01 && Math.abs(x1 - x0) > 0.01) {
          const r = f1(pj.rr(y0)), dt = pj.th(x1) - pj.th(x0);
          d += `A${r},${r} 0 ${Math.abs(dt) > Math.PI ? 1 : 0} ${dt > 0 ? 1 : 0} ${f1(ex)},${f1(ey)}`;
        } else d += `L${f1(ex)},${f1(ey)}`;
        x0 = x1; y0 = y1;
      }
    }
    return d;
  }
  const PALETTE = ['#c0835a', '#5f8fb4', '#8a7bb8', '#4f9e86', '#c26f86', '#a8923a', '#4a9db3', '#9b7a5c'];
  const trOf = (b) => `translate(${f1(b.x)}px,${f1(b.y)}px) scale(${b.s})`;

  function draw(prevBoxes) {
    const L = state.L, t = state.tree, S = state.settings;
    const pj = projector(L);
    const links = [], nodes = [], ctls = [];
    const D = { nodes: {}, pj };
    for (const [id, n] of Object.entries(L.nodes)) {
      if (pj.circle) {
        const c = pj.pt(n.x + n.w / 2, n.y + n.h / 2);
        D.nodes[id] = { x: c[0] - n.w / 2, y: c[1] - n.h / 2, w: n.w, h: n.h, s: n.s };
      } else D.nodes[id] = { x: n.x, y: n.y, w: n.w, h: n.h, s: n.s };
    }
    // One colour per family, neighbouring families in a row get different colours.
    const famColor = {};
    if (S.colors) {
      L.unions.filter((u) => u.children.length).sort((a, b) => (a.rowY - b.rowY) || (a.x - b.x))
        .forEach((u, i) => { famColor[u.id] = PALETTE[i % PALETTE.length]; });
    }
    const at = (x, y) => pj.pt(x, y);
    for (const u of L.unions) {
      const ended = isEnded(u.status) ? ' ended' : '';
      const ua = `data-u="${u.id}"`;
      if (u.couple) {
        const [a, b] = u.couple;
        const y = u.rowY + CARD_H / 2;
        links.push(`<path class="couple${ended}" ${ua} d="${pathOf([[[a.x + a.w, y], [b.x, y]]], pj)}"/>`);
        const label = coupleLabel(u);
        if (label && !pj.circle) links.push(`<text class="wed${ended}" ${ua} x="${(a.x + a.w + b.x) / 2}" y="${y - 9}">${esc(label)}</text>`);
        ctls.push(knot(...at((a.x + a.w + b.x) / 2, y), u));
      } else if (u.bracket) {
        const [a, b] = u.bracket;
        const yb = u.rowY + CARD_H + u.depth;
        links.push(`<path class="couple${ended}" ${ua} d="${pathOf([[[a.x + a.w * 0.7, a.y + a.h], [a.x + a.w * 0.7, yb], [b.x + b.w * 0.3, yb], [b.x + b.w * 0.3, b.y + b.h]]], pj)}"/>`);
        ctls.push(knot(...at(u.x, yb), u));
      }
      const by = u.busY;
      if (u.children.length) {
        const kid = (c) => L.nodes[c];
        const xs = u.children.map((c) => kid(c).x + kid(c).w / 2);
        const startY = u.y + (u.couple || u.bracket ? 5 : 0);
        const polys = [];
        const only = u.children.length === 1 && u.partners.length ? kid(u.children[0]) : null;
        if (only && Math.abs(only.x + only.w / 2 - u.x) < 24) {
          polys.push([[u.x, startY], [u.x, only.y]]);
        } else {
          if (u.partners.length) { polys.push([[u.x, startY], [u.x, by]]); xs.push(u.x); }
          else { const m = (Math.min(...xs) + Math.max(...xs)) / 2; polys.push([[m, by - 16], [m, by]]); }
          polys.push([[Math.min(...xs), by], [Math.max(...xs), by]]);
          for (const c of u.children) polys.push([[kid(c).x + kid(c).w / 2, by], [kid(c).x + kid(c).w / 2, kid(c).y]]);
        }
        const col = famColor[u.id];
        links.push(`<path class="link${col ? ' fam' : ''}" ${ua}${col ? ` style="stroke:${col}"` : ''} d="${pathOf(polys, pj)}"/>`);
        if (!S.smartHide && u.children.some((c) => L.reach[c] === 'child') && u.partners.length) {
          ctls.push(ctl(...at(u.x, by), 'up', `data-act="fold" data-u="${u.id}" data-for="${u.partners.join(' ')}"`, 'Fold away their children'));
        }
      }
      if (u.collapsed && u.partners.length) {
        links.push(`<path class="link" ${ua} d="${pathOf([[[u.x, u.y], [u.x, by - 11]]], pj)}"/>`);
        const act = u.byFocus ? `data-act="focus-u" data-u="${u.id}"` : `data-act="unfold" data-u="${u.id}"`;
        ctls.push(chip(...at(u.x, by), '+' + u.hiddenCount, act + ` ${ua}`, u.byFocus ? `Move the focus here to see ${u.hiddenCount} more` : `Show ${u.hiddenCount} hidden`));
      }
    }
    for (const c of L.upChips) {
      const n = L.nodes[c.person], x = n.x + n.w / 2;
      links.push(`<path class="link" d="${pathOf([[[x, n.y], [x, n.y - 18]]], pj)}"/>`);
      const act = c.byFocus ? `data-act="focus-p" data-p="${c.person}"` : `data-act="show-up" data-p="${c.person}"`;
      ctls.push(chip(...at(x, n.y - 29), '▲ ' + c.count, act, c.byFocus ? 'Move the focus here to see their parents' : `Show parents (${c.count})`));
    }
    for (const c of L.hideChips || []) {
      const n = L.nodes[c.person];
      ctls.push(chip(...at(n.x + n.w / 2, n.y + n.h + 13), '+' + c.count, `data-act="unhide" data-p="${c.person}"`, `Show ${c.count} hidden`));
    }

    const selected = state.selected;
    const animate = !!prevBoxes;
    for (const [id, n] of Object.entries(L.nodes)) {
      const p = P(id), b = D.nodes[id], prev = prevBoxes && prevBoxes[id];
      const isDead = dead(id);
      const cls = ['person', p.gender ? 'g-' + p.gender : '', isDead ? 'dead' : '', isFocused(id) ? 'center' : '',
        id === selected ? 'sel' : '', animate && !prev ? 'enter' : ''].join(' ');
      const yrs = yearsText(p);
      const nl = nameLines(p.name || 'New person', CARD_W - 74);
      let s = `<g class="${cls}" data-id="${id}" style="transform:${trOf(prev || b)}">`;
      s += `<rect class="card" width="${CARD_W}" height="${CARD_H}" rx="12"/>`;
      s += `<circle class="av" cx="28" cy="${CARD_H / 2}" r="17"/><text class="ini" x="28" y="${CARD_H / 2 + 4.3}">${esc(initials(p.name))}</text>`;
      const lineH = nl.size + 3.5;
      const top = (CARD_H - nl.lines.length * lineH - (yrs ? 16 : 0)) / 2;
      s += '<g class="c-full">';
      nl.lines.forEach((line, i) => {
        s += `<text class="nm${p.name ? '' : ' empty'}" x="54" y="${top + nl.size + i * lineH}" style="font-size:${nl.size}px">${esc(line)}</text>`;
      });
      if (yrs) s += `<text class="yr" x="54" y="${top + nl.lines.length * lineH + 13}">${esc(yrs)}</text>`;
      s += '</g>';
      // Zoomed out: the full name, big, on up to two lines.
      const big = nameLines(p.name || 'New person', CARD_W - 62, [21, 19, 17]);
      const bh = big.size + 2, btop = (CARD_H - big.lines.length * bh) / 2;
      s += `<g class="nm2">${big.lines.map((line, i) => `<text x="52" y="${btop + big.size * 0.85 + i * bh}" style="font-size:${big.size}px">${esc(line)}</text>`).join('')}</g>`;
      s += `<g class="c-dot"><circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="30"/><text x="${CARD_W / 2}" y="${CARD_H / 2 + 7}">${esc(initials(p.name))}</text></g>`;
      s += `<g class="open" data-act="open" data-p="${id}" transform="translate(${CARD_W - 24},6)"><title>${state.editable ? 'Edit' : 'Details'}</title><rect width="18" height="18" rx="4"/>`;
      s += state.editable
        ? `<path transform="translate(1,1)" d="M2 11.5V14h2.5l7.4-7.4-2.5-2.5L2 11.5zM13.7 4.8a.7.7 0 0 0 0-1L12.2 2.3a.7.7 0 0 0-1 0L10 3.5 12.5 6l1.2-1.2z"/>`
        : `<circle cx="9" cy="9" r="7" class="ring"/><path d="M9 8v5M9 5.2v.1" class="ib"/>`;
      s += '</g>';
      if (S.smartHide && !L.rootPartners.includes(id)) {
        s += `<g class="hb" data-act="hide-branch" data-p="${id}" transform="translate(0,${CARD_H / 2})"><title>Hide everyone connected only through ${esc(t.firstName(id))}</title><circle r="11"/><path d="M-4.5 0H4.5"/></g>`;
      }
      if (state.editable) {
        s += `<g class="add" data-act="add" data-p="${id}" transform="translate(${CARD_W},${CARD_H / 2})"><title>Add a relative</title><circle r="11"/><path d="M-4.5 0H4.5M0 -4.5V4.5"/></g>`;
      }
      s += '</g>';
      nodes.push(s);
      // Old-style toggle to fold this person's parents away (when the "−" buttons are off).
      const pu = t.parentUnion(id);
      if (!S.smartHide && pu && ['root', 'ancestor', 'spouse'].includes(L.reach[id]) && !L.upChips.some((c) => c.person === id) && L.unions.some((u) => u.id === pu)) {
        ctls.push(ctl(...at(n.x + n.w / 2, n.y - 16), 'down', `data-act="hide-up" data-p="${id}" data-for="${id}"`, 'Fold away their parents'));
      }
    }
    svg.classList.toggle('anim', animate);
    $('#links').innerHTML = links.join('');
    $('#nodes').innerHTML = nodes.join('');
    $('#ctls').innerHTML = ctls.join('');

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of Object.values(D.nodes)) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.w);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.h);
    }
    D.bounds = { minX, maxX, minY: minY - 40, maxY: maxY + 40 };
    const rb = L.rootPartners.map(box2(D)).filter(Boolean);
    D.center = rb.length ? { x: rb.reduce((s, b) => s + b.x + b.w / 2, 0) / rb.length, y: rb[0].y + rb[0].h / 2 } : { x: 0, y: 0 };
    state.D = D;
    lodState.clear();
    updateLOD();

    if (animate) {
      $('#links').classList.add('fresh'); $('#ctls').classList.add('fresh');
      // Move every card to its new place; also run by a timer in case frames are paused.
      const finish = () => {
        if (state.D !== D) return; // redrawn meanwhile; the newer drawing is already in place
        for (const el of $('#nodes').children) {
          const b = D.nodes[el.dataset.id];
          if (b) el.style.transform = trOf(b);
          el.classList.remove('enter');
        }
        $('#links').classList.remove('fresh'); $('#ctls').classList.remove('fresh');
      };
      requestAnimationFrame(() => requestAnimationFrame(finish));
      clearTimeout(draw.t0); clearTimeout(draw.t);
      draw.t0 = setTimeout(finish, 60);
      draw.t = setTimeout(() => svg.classList.remove('anim'), ANIM_MS + 120);
    }
  }
  const box2 = (D) => (id) => D.nodes[id];
  const isFocused = (id) => (state.focus.person ? state.focus.person === id : state.L && state.L.rootPartners.includes(id));

  // ---------- less detail when zoomed out ----------
  const lodState = new Map();
  let lodFrame = 0;
  function scheduleLOD() {
    if (lodFrame) return;
    lodFrame = requestAnimationFrame(() => { lodFrame = 0; updateLOD(); });
  }
  function updateLOD() {
    if (!state.D) return;
    const on = state.settings.detail, k = state.cam.k;
    for (const el of $('#nodes').children) {
      const b = state.D.nodes[el.dataset.id];
      const e = k * (b ? b.s : 1);
      const lvl = !on ? '' : e >= 0.5 ? '' : e >= 0.27 ? 'lod-mid' : 'lod-dot';
      if (lodState.get(el) === lvl) continue;
      el.classList.remove('lod-mid', 'lod-dot');
      if (lvl) el.classList.add(lvl);
      lodState.set(el, lvl);
    }
  }

  // ---------- hover: highlight a person's closest family ----------
  function highlight(id) {
    clearHighlight();
    const t = state.tree;
    const people = new Set([id, ...t.parents(id), ...t.childrenOf(id), ...t.siblingsOf(id), ...t.partnersOf(id).map((o) => o.id)]);
    const unions = new Set([...t.unionsOf(id), t.parentUnion(id)].filter(Boolean));
    for (const el of $('#nodes').children) if (people.has(el.dataset.id)) el.classList.add('hl');
    for (const el of svg.querySelectorAll('[data-u]')) if (unions.has(el.dataset.u)) el.classList.add('hl');
    svg.classList.add('dim');
  }
  function clearHighlight() {
    svg.classList.remove('dim');
    for (const el of svg.querySelectorAll('.hl')) el.classList.remove('hl');
  }
  // How many people would disappear if this person's branch were hidden.
  function branchSize(id) {
    const t = state.tree, vis = state.L.nodes;
    const starts = state.L.rootPartners.filter((r) => r !== id && vis[r]);
    const seen = new Set(starts), stack = starts.slice();
    while (stack.length) {
      const p = stack.pop();
      const next = t.parents(p).concat(t.siblingsOf(p), t.partnersOf(p).map((o) => o.id), t.childrenOf(p));
      for (const n of next) if (n !== id && vis[n] && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
    return Object.keys(vis).filter((p) => p !== id && !seen.has(p)).length;
  }
  function showTip(id, ev) {
    const tip = $('#tip'), p = P(id);
    if (!p) return;
    const yrs = yearsText(p), rel = state.tree.relationLabel(id);
    tip.innerHTML = `<b>${esc(p.name || 'New person')}</b>${yrs ? `<span>${esc(yrs)}</span>` : ''}${rel ? `<span>${esc(rel)}</span>` : ''}`;
    tip.hidden = false;
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, ev.clientX + 14) + 'px';
    tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 8, ev.clientY + 14) + 'px';
  }

  // ---------- focus ----------
  function setFocus(id) {
    if (!P(id)) return;
    state.focus = { person: id };
    closePopover();
    render(id, { animate: true });
  }

  function ctl(x, y, kind, attrs, title) {
    const chevron = kind === 'up' ? 'M-3.5 1.8L0 -1.8L3.5 1.8' : 'M-3.5 -1.8L0 1.8L3.5 -1.8';
    return `<g class="ctl" ${attrs} transform="translate(${f1(x)},${f1(y)})"><title>${esc(title)}</title><circle r="9"/><path d="${chevron}"/></g>`;
  }
  function chip(x, y, label, attrs, title) {
    const w = Math.max(34, measure(label, '600 11px ' + FAMILY) + 18);
    return `<g class="chip" ${attrs} transform="translate(${f1(x)},${f1(y)})"><title>${esc(title)}</title><rect x="${-w / 2}" y="-11" width="${w}" height="22" rx="11"/><text y="4">${esc(label)}</text></g>`;
  }

  function updateChrome() {
    const t = state.tree, roots = t.rootPartners();
    const names = roots.map((r) => t.firstName(r)).join(' & ');
    $('#title').textContent = t.data.title || 'Family Tree';
    $('#subtitle').textContent = names;
    document.title = (t.data.title || 'Family Tree');
    const away = !state.focus.union || state.focus.union !== t.data.root;
    $('#back').hidden = !away;
    $('#back-btn').textContent = 'Back to ' + names;
    $('#undo').disabled = !state.history.length;
    $('#redo').disabled = !state.future.length;
  }

  // ---------- panel ----------
  function select(id, opts) {
    opts = opts || {};
    if (state.selected !== id) discardEmptyNew(id);
    state.selected = id && P(id) ? id : null;
    closePopover();
    $('#panel').hidden = !state.selected;
    render(opts.anchor || state.selected);
    renderPanel();
    if (state.selected && opts.reveal) ensureVisible(state.selected);
    if (state.selected && opts.focusName) {
      const inp = $('#panel input[data-f="name"]');
      if (inp) inp.focus();
    }
  }

  function personLink(id, extra) {
    return `<span class="who"><a data-go="${id}">${esc(nameOf(id))}</a>${extra ? ' ' + extra : ''}</span>`;
  }

  function renderPanel() {
    const id = state.selected, el = $('#modal');
    if (!id) { $('#panel').hidden = true; el.innerHTML = ''; return; }
    const t = state.tree, p = P(id), isDead = dead(id);
    const rel = t.relationLabel(id);
    let h = `<div class="p-head"><div class="p-av ${p.gender ? 'g-' + p.gender : ''} ${isDead ? 'dead' : ''}">${esc(initials(p.name))}</div>`;
    h += `<div><h2 id="p-name">${esc(p.name || 'New person')}${isDead ? '<span class="tag">passed away</span>' : ''}</h2><div class="p-rel">${esc(rel)}</div></div>`;
    h += `<button class="icon close" data-act="close" title="Close"><svg class="i"><use href="#i-x"/></svg></button></div>`;

    if (state.editable) h += editForm(id, p);
    else h += facts(p);

    // Relationships
    const group = (label, ids, hint) => ids.length
      ? `<h3>${label}</h3><div class="list">${ids.map((x) => personLink(x, hint ? hint(x) : '')).join('')}</div>` : '';
    h += '<div class="rels">';
    const partners = t.partnersOf(id);
    if (partners.length) {
      h += `<h3>${partners.length > 1 ? 'Partners' : 'Partner'}</h3><div>`;
      for (const { id: q, union } of partners) {
        const u = t.union(union);
        if (state.editable) {
          const cur = u.status || 'partner';
          const opt = (v, label) => `<option value="${v}"${cur === v ? ' selected' : ''}>${label}</option>`;
          const showDates = u.start || u.end || state.datesOpen === union;
          // Children of either partner whose other parent is unknown: ask, never assume.
          const maybe = [id, q].flatMap((x) => t.unionsOf(x)
            .filter((v) => t.union(v).partners.length === 1)
            .flatMap((v) => t.union(v).children.map((c) => ({ c, par: x }))));
          const ask = maybe.map(({ c, par }) => `<div class="ask">Is ${esc(t.firstName(par === id ? q : id))} also ${esc(t.firstName(c))}\u2019s parent?
            <button class="linkish" data-link-child="${c}" data-to="${union}">Yes, link them</button></div>`).join('');
          h += `<div class="pblock"><a data-go="${q}">${esc(nameOf(q))}</a>${ask}<div class="pctl">
            <select data-u="${union}" data-uf="status">${opt('partner', 'Together')}${opt('married', 'Married')}${opt('separated', 'Not together anymore')}${cur === 'divorced' ? opt('divorced', 'Divorced') : ''}</select>
            ${showDates ? `<input class="mini" type="text" data-udate="${union}" data-ufield="start" placeholder="since" value="${esc(formatDate(u.start))}" title="When they got together (year is enough)">
            ${t.isEnded(union) ? `<input class="mini" type="text" data-udate="${union}" data-ufield="end" placeholder="until" value="${esc(formatDate(u.end))}" title="When it ended (year is enough)">` : ''}`
            : `<button class="linkish" data-act="dates" data-u="${union}">add years</button>`}
          </div></div>`;
        } else {
          const st = partnerSummary(union, id);
          h += personLink(q, st ? `<span class="muted">${esc(st)}</span>` : '');
        }
      }
      h += '</div>';
    }
    h += group('Parents', t.parents(id));
    const options = t.parentOptions(id).map((uid) => ({ v: uid, label: t.unionLabel(uid) }));
    const curParents = t.parents(id);
    if (curParents.length === 2) {
      for (const par of curParents) {
        const hasSolo = options.some((o) => t.union(o.v) && t.union(o.v).partners.length === 1 && t.union(o.v).partners[0] === par);
        if (!hasSolo) {
          options.push({ v: 'solo:' + par, label: nameOf(par) + ' only (other parent unknown)' });
        }
      }
    }
    if (state.editable && options.length > 1) {
      h += `<h3></h3><div><select data-move title="Which couple is this person the child of">${options.map((o) =>
        `<option value="${o.v}"${o.v === t.parentUnion(id) ? ' selected' : ''}>Child of ${esc(o.label)}</option>`).join('')}</select></div>`;
    }
    h += group('Children', t.childrenOf(id), ageHint);
    const sibs = t.siblingsDetailed(id);
    if (sibs.length) {
      h += '<h3>Siblings</h3><div class="list">' + sibs.map((sb) => personLink(sb.id,
        (sb.kind !== 'full' ? `<span class="tag">${sb.kind}</span>` : '') + ageHint(sb.id))).join('') + '</div>';
    }
    h += '</div>';

    if (state.editable) {
      const canParent = t.parents(id).length < 2;
      h += `<div class="addrow"><span class="lbl">Add</span>
        <button class="btn" data-add="parent" ${canParent ? '' : 'disabled'}>Parent</button>
        <button class="btn" data-add="partner">Partner</button>
        <button class="btn" data-add="child">Child</button>
        <button class="btn" data-add="sibling">Sibling</button>
        ${t.parents(id).length ? '<button class="btn" data-add="half">Half-sibling</button>' : ''}</div>`;
    }
    h += '<div class="p-actions">';
    if (state.editable && !t.rootPartners().includes(id)) h += `<button class="btn danger" data-act="delete">Delete</button>`;
    h += '<span class="spacer"></span>';
    if (!(state.focus.person === id)) h += `<button class="btn" data-act="focus">Centre the tree here</button>`;
    h += `<button class="btn primary" data-act="close">${state.editable ? 'Done' : 'Close'}</button>`;
    h += '</div>';
    el.innerHTML = h;
    $('#panel').hidden = false;
  }

  // e.g. "married 1975 · divorced 1998" or "married 1975 · until Ion's death in 2010".
  function partnerSummary(uid, self) {
    const t = state.tree, u = t.union(uid);
    const parts = [];
    const word = { married: 'married', divorced: 'married', separated: 'together', partner: 'together' }[u.status] || 'since';
    if (u.start) parts.push(word + ' ' + formatDate(u.start));
    else if (u.status === 'married') parts.push('married');
    if (t.isEnded(uid)) parts.push((u.status === 'divorced' ? 'divorced' : 'not together anymore') + (u.end ? ' since ' + formatDate(u.end) : ''));
    else {
      const gone = u.partners.filter((x) => x !== self && dead(x))[0] || u.partners.filter(dead)[0];
      if (gone && parts.length) {
        const d = P(gone).death;
        parts.push('until ' + (gone === self ? 'their' : t.firstName(gone) + '’s') + ' death' + (d ? ' in ' + shortYear(d) : ''));
      }
    }
    return parts.join(' · ');
  }

  function ageHint(id) {
    const y = shortYear(P(id).birth);
    return y ? `<span class="muted">${esc(y)}</span>` : '';
  }

  function facts(p) {
    let h = '<dl class="facts">';
    const isDead = !!(p.deceased || p.death);
    if (p.birth) {
      const age = !isDead ? yearsBetween(p.birth, todayStr()) : null;
      h += `<dt>Born</dt><dd>${esc(formatDate(p.birth))}${age != null && age >= 0 ? ` <span style="color:var(--muted)">· ${age} years old</span>` : ''}</dd>`;
    }
    if (isDead) {
      const age = yearsBetween(p.birth, p.death);
      h += `<dt>Died</dt><dd>${p.death ? esc(formatDate(p.death)) : 'Date unknown'}${age != null && age >= 0 ? ` <span style="color:var(--muted)">· aged ${age}</span>` : ''}</dd>`;
    }
    if (p.birthName) h += `<dt>Birth name</dt><dd>${esc(p.birthName)}</dd>`;
    h += '</dl>';
    if (p.notes) h += `<p class="notes">${esc(p.notes)}</p>`;
    return h;
  }

  function editForm(id, p) {
    const g = p.gender || '';
    const deathSet = !!p.death;
    let h = '<div class="form">';
    h += `<label>Full name<input type="text" data-f="name" value="${esc(p.name)}" placeholder="First and last name"></label>`;
    h += `<div class="row2"><label>Birth name <span class="hint">· if different</span><input type="text" data-f="birthName" value="${esc(p.birthName || '')}" placeholder="e.g. maiden name"></label>`;
    h += `<label>Gender<div class="seg" data-f="gender">
      <button data-v="m" class="${g === 'm' ? 'on' : ''}">Male</button>
      <button data-v="f" class="${g === 'f' ? 'on' : ''}">Female</button>
      <button data-v="" class="${!g ? 'on' : ''}">—</button></div></label></div>`;
    h += `<div class="row2"><label>Born<input type="text" data-date="birth" value="${esc(formatDate(p.birth))}" placeholder="1952 or 14.03.1952"></label>`;
    h += `<label>Died<input type="text" data-date="death" value="${esc(formatDate(p.death))}" placeholder="year or date"></label></div>`;
    h += `<label class="check"><input type="checkbox" data-f="deceased" ${p.deceased || deathSet ? 'checked' : ''} ${deathSet ? 'disabled' : ''}> Passed away</label>`;
    h += `<label>Notes<textarea data-f="notes" rows="3" placeholder="Anything worth remembering">${esc(p.notes || '')}</textarea></label>`;
    const warns = warnings(id);
    h += `<div class="warn" id="p-warn" ${warns.length ? '' : 'hidden'}>${warns.map(esc).join('<br>')}</div>`;
    h += '</div>';
    return h;
  }

  function warnings(id) {
    const t = state.tree, p = P(id), out = [];
    const by = FT.yearOf(p.birth), dy = FT.yearOf(p.death);
    if (by && dy && dy < by) out.push('Death is before birth.');
    for (const par of t.parents(id)) {
      if (!P(par)) continue;
      const py = FT.yearOf(P(par).birth);
      if (by && py && by <= py) out.push(`Born before their parent ${t.firstName(par)}.`);
      else if (by && py && by - py < 12) out.push(`Born only ${by - py} years after ${t.firstName(par)}.`);
      const pdy = FT.yearOf(P(par).death);
      if (by && pdy && by > pdy + 1) out.push(`Born after ${t.firstName(par)} died.`);
    }
    if (by && !p.deceased && !p.death && new Date().getFullYear() - by > 105) out.push('Over 105 years old — passed away?');
    for (const { id: q, union } of t.partnersOf(id)) {
      const u = t.union(union), s1 = FT.yearOf(u.start), e1 = FT.yearOf(u.end);
      if (s1 && e1 && e1 < s1) out.push(`The relationship with ${t.firstName(q)} ends before it starts.`);
    }
    return out;
  }

  // ---------- editing ----------
  function mutate(fn, opts) {
    opts = opts || {};
    const now = Date.now();
    const coalesce = opts.key && opts.key === state.lastKey && now - state.lastTime < 2500;
    if (!coalesce) {
      state.history.push(JSON.stringify(state.tree.data));
      if (state.history.length > 200) state.history.shift();
      state.future = [];
    }
    state.lastKey = opts.key || null;
    state.lastTime = now;
    fn(state.tree);
    state.tree.reindex();
    render(opts.anchor || state.selected);
    if (opts.panel !== false) renderPanel();
    else refreshPanelHead();
    scheduleSave();
  }

  function refreshPanelHead() {
    const id = state.selected;
    if (!id || !P(id)) return;
    const p = P(id), h = $('#p-name');
    if (h) h.innerHTML = esc(p.name || 'New person') + (dead(id) ? '<span class="tag">passed away</span>' : '');
    const av = $('#panel .p-av');
    if (av) { av.textContent = initials(p.name); av.className = 'p-av' + (p.gender ? ' g-' + p.gender : '') + (dead(id) ? ' dead' : ''); }
    const w = $('#p-warn');
    if (w) { const list = warnings(id); w.innerHTML = list.map(esc).join('<br>'); w.hidden = !list.length; }
    const box = $('#modal input[data-f="deceased"]');
    if (box) { box.checked = !!(p.deceased || p.death); box.disabled = !!p.death; }
  }

  function restore(json) {
    closePopover();
    state.tree = new Tree(JSON.parse(json));
    state.lastKey = null;
    if (state.selected && !P(state.selected)) state.selected = null;
    $('#panel').hidden = !state.selected;
    render(state.selected);
    renderPanel();
    scheduleSave();
  }
  function undo() {
    if (!state.history.length) return;
    state.future.push(JSON.stringify(state.tree.data));
    state.newPerson = null;
    restore(state.history.pop());
  }
  function redo() {
    if (!state.future.length) return;
    state.history.push(JSON.stringify(state.tree.data));
    restore(state.future.pop());
  }

  // ref: the family to use (child, partner) or the shared parent (half-sibling).
  function addRelative(pid, kind, ref) {
    const t0 = state.tree;
    // The menu may be stale (e.g. after undo): never link to people or families that are gone.
    if (!t0.person(pid)) return;
    if (kind === 'child' && ref && !t0.union(ref)) ref = null;
    if (kind === 'half' && !t0.person(ref)) return;
    let nid = null;
    mutate((t) => {
      if (kind === 'parent') { nid = t.addParent(pid); state.view.up[pid] = false; }
      else if (kind === 'partner') nid = t.addPartner(pid);
      else if (kind === 'child') {
        nid = t.addChild(pid, ref);
        state.view.down[t.parentUnion(nid)] = false;
      } else if (kind === 'half') {
        nid = t.addHalfSibling(pid, ref);
      } else {
        nid = t.addSibling(pid);
        state.view.down[t.parentUnion(nid)] = false;
        if (t.parentUnion(pid)) state.view.up[pid] = false;
      }
    }, { anchor: pid });
    if (!nid) return;
    saveView();
    state.newPerson = nid;
    state.newPersonSnap = state.history[state.history.length - 1];
    if (!state.L.nodes[nid]) { state.focus = { person: pid }; render(pid); }
    select(nid, { anchor: pid, reveal: true, focusName: true });
  }

  // A just-added person left without any details is removed again.
  function discardEmptyNew(nextId) {
    const id = state.newPerson;
    if (!id || id === nextId) return;
    state.newPerson = null;
    const p = P(id);
    if (!p) return;
    const empty = !p.name && !p.birth && !p.death && !p.notes && !p.birthName;
    if (!empty) return;
    if (state.history.length && state.history[state.history.length - 1] === state.newPersonSnap) {
      state.tree = new Tree(JSON.parse(state.history.pop()));
    } else {
      state.tree.removePerson(id);
    }
    scheduleSave();
  }

  function deletePerson(id) {
    const t = state.tree;
    const stranded = t.strandedBy(id);
    let msg = `Delete ${nameOf(id)} from the tree?`;
    if (stranded.length) {
      const list = stranded.slice(0, 6).map(nameOf).join(', ') + (stranded.length > 6 ? ` and ${stranded.length - 6} more` : '');
      msg += `\n\n${stranded.length === 1 ? 'This person is' : `These ${stranded.length} people are`} only connected through ${t.firstName(id)} and will be removed too:\n${list}\n\n(You can undo with ⌘Z.)`;
    }
    if (!confirm(msg)) return;
    const anchor = [...t.parents(id), ...t.partnersOf(id).map((o) => o.id), ...t.childrenOf(id)].find((x) => !stranded.includes(x)) || t.rootPartners()[0];
    state.selected = null;
    state.newPerson = null;
    $('#panel').hidden = true;
    mutate((t) => { for (const x of [id, ...stranded]) t.removePerson(x); }, { anchor });
  }

  // ---------- saving & publishing (local only) ----------
  let saveTimer = null;
  function setStatus(text, err) {
    const s = $('#status');
    s.textContent = text;
    s.classList.toggle('err', !!err);
  }
  function scheduleSave() {
    if (!state.editable) return;
    setStatus('Saving…');
    updateChrome();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 350);
  }
  // Saves go one at a time. The server refuses a save if the file changed elsewhere
  // (another tab, or an edit made outside the page) so newer data is never overwritten.
  let saveChain = Promise.resolve(true);
  function save() {
    saveTimer = null;
    saveChain = saveChain.then(doSave, doSave);
    return saveChain;
  }
  async function doSave() {
    try {
      const r = await fetch('api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: state.version, data: state.tree.data }) });
      const res = await r.json();
      if (r.status === 409) {
        adopt(res, 'This tree was changed somewhere else (another tab or window), so the latest version was loaded. Your last change was not saved — please redo it.');
        return false;
      }
      if (!r.ok || !res.ok) throw new Error(res.error || 'save failed');
      state.version = res.version;
      setStatus('Saved');
      refreshPublish();
      return true;
    } catch (e) {
      setStatus('Not saved — is the app still running?', true);
      return false;
    }
  }
  function adopt(res, message) {
    state.tree = new Tree(res.data);
    state.version = res.version;
    state.history = [];
    state.future = [];
    state.newPerson = null;
    closePopover();
    if (state.selected && !P(state.selected)) state.selected = null;
    render(state.selected);
    renderPanel();
    setStatus('Saved');
    if (message) toast(message, true, 9000);
    refreshPublish();
  }
  // Pick up changes made outside this tab when coming back to it.
  async function checkForOutsideChanges() {
    if (!state.editable || saveTimer || document.hidden) return;
    try {
      const s = await (await fetch('api/status', { cache: 'no-store' })).json();
      if (s.version && s.version !== state.version && !saveTimer) {
        const res = await (await fetch('api/data', { cache: 'no-store' })).json();
        adopt(res, 'Loaded the latest version of the tree.');
      }
    } catch (e) { /* server gone */ }
  }
  async function refreshPublish() {
    try {
      const r = await fetch('api/status', { cache: 'no-store' });
      const s = await r.json();
      const b = $('#publish');
      b.classList.toggle('pending', !!s.dirty);
      b.title = s.dirty ? 'You have changes that are not online yet' : 'Everything is online';
    } catch (e) { /* server gone */ }
  }
  async function publish() {
    const b = $('#publish');
    clearTimeout(saveTimer);
    if (!(await save())) { toast('Couldn\u2019t save the latest changes, so nothing was published.', true, 7000); return; }
    b.disabled = true;
    b.textContent = 'Publishing…';
    try {
      const r = await fetch('api/publish', { method: 'POST' });
      const res = await r.json();
      if (!r.ok || !res.ok) throw new Error(res.error || 'Publishing failed');
      toast(res.message || 'Published', false, 5000);
    } catch (e) {
      toast(e.message, true, 7000);
    } finally {
      b.disabled = false;
      b.textContent = 'Publish';
      refreshPublish();
    }
  }

  // ---------- popovers ----------
  function openPopover(html, anchorRect, cls) {
    const pop = $('#popover');
    pop.className = 'popover ' + (cls || '');
    pop.innerHTML = html;
    pop.hidden = false;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let x = anchorRect.left, y = anchorRect.bottom + 6;
    if (x + w > window.innerWidth - 8) x = window.innerWidth - 8 - w;
    if (y + h > window.innerHeight - 8) y = Math.max(8, anchorRect.top - h - 6);
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = y + 'px';
  }
  function closePopover() { $('#popover').hidden = true; }

  function addMenu(pid, rect, only) {
    const t = state.tree, show = (k) => !only || only === k;
    let h = `<div class="hd">Add to ${esc(t.firstName(pid))}</div>`;
    if (show('parent')) h += `<button class="item" data-add="parent" data-p="${pid}" ${t.parents(pid).length >= 2 ? 'disabled' : ''}>Parent</button>`;
    if (show('partner')) h += `<button class="item" data-add="partner" data-p="${pid}">Partner</button>`;
    if (show('child')) {
      const unions = t.unionsOf(pid);
      if (unions.length <= 1) h += `<button class="item" data-add="child" data-p="${pid}" ${unions[0] ? `data-ref="${unions[0]}"` : ''}>Child</button>`;
      else {
        for (const uid of unions) {
          const other = t.union(uid).partners.find((x) => x !== pid);
          h += `<button class="item" data-add="child" data-p="${pid}" data-ref="${uid}">Child <span class="muted">${other ? 'with ' + esc(t.firstName(other)) : 'other parent unknown'}</span></button>`;
        }
      }
    }
    if (show('sibling')) h += `<button class="item" data-add="sibling" data-p="${pid}">Sibling <span class="muted">same parents</span></button>`;
    if (show('half')) {
      for (const par of t.parents(pid)) {
        h += `<button class="item" data-add="half" data-p="${pid}" data-ref="${par}">Half-sibling <span class="muted">through ${esc(t.firstName(par))}</span></button>`;
      }
    }
    openPopover(h, rect);
  }

  function coupleMenu(uid, rect) {
    const t = state.tree, u = t.union(uid);
    if (!u) return;
    const cur = u.status || '';
    const item = (v, label) => {
      const on = (cur === v) || (v === 'partner' && cur === '');
      return `<button class="item" data-status="${v}" data-u="${uid}"><span>${label}</span><span class="muted">${on ? '✓' : ''}</span></button>`;
    };
    let h = `<div class="hd">${esc(u.partners.map((p) => t.firstName(p)).join(' & '))}</div>`;
    h += item('partner', 'Together') + item('married', 'Married') + item('separated', 'Not together anymore');
    if (cur === 'divorced') h += item('divorced', 'Divorced');
    openPopover(h, rect);
  }

  function datesMenu(rect) {
    const t = state.tree, today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = [];
    const nextOf = (pd) => {
      let d = new Date(today.getFullYear(), pd.m - 1, pd.d);
      if (d < today) d = new Date(today.getFullYear() + 1, pd.m - 1, pd.d);
      return d;
    };
    for (const [id, p] of Object.entries(t.data.people)) {
      const pd = parseDate(p.birth);
      if (!pd || !pd.m || !pd.d || pd.approx || p.deceased || p.death) continue;
      const d = nextOf(pd);
      items.push({ d, id, text: esc(p.name || 'Unnamed'), sub: `turns ${d.getFullYear() - pd.y}` });
    }
    for (const u of Object.values(t.data.unions)) {
      const pd = parseDate(u.start);
      if (!pd || !pd.m || !pd.d || u.status === 'divorced' || u.status === 'separated' || u.partners.length < 2 || u.partners.some(dead)) continue;
      const d = nextOf(pd);
      items.push({ d, id: u.partners[0], text: esc(u.partners.map((x) => t.firstName(x)).join(' & ')), sub: `${d.getFullYear() - pd.y} years together` });
    }
    items.sort((a, b) => a.d - b.d);
    let h = '<div class="hd">Coming up</div>';
    if (!items.length) h += '<div class="empty">Add full birth dates (day and month) to see upcoming birthdays here.</div>';
    for (const it of items.slice(0, 10)) {
      const days = Math.round((it.d - today) / 86400000);
      const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : it.d.getDate() + ' ' + MONTHS[it.d.getMonth()].slice(0, 3);
      h += `<button class="item" data-go="${it.id}"><span>${it.text} <span class="muted">${it.sub}</span></span><span class="muted">${when}</span></button>`;
    }
    openPopover(h, rect, 'wide');
  }

  function settingsMenu(rect) {
    const S = state.settings;
    const row = (key, label, hint) => `<label class="set"><span class="txt"><b>${label}</b><small>${hint}</small></span>
      <input type="checkbox" data-set="${key}" ${S[key] ? 'checked' : ''}><span class="sw"></span></label>`;
    let h = '<div class="hd">Settings</div>';
    h += row('focus', 'Focus mode', 'Show the family around one person. Click a card to move there; click it again to open it.');
    if (S.focus) {
      h += `<div class="seg radius">${[1, 2, 3].map((r) => `<button data-radius="${r}" class="${S.radius === r ? 'on' : ''}">${r} step${r > 1 ? 's' : ''}</button>`).join('')}</div>`;
    }
    h += row('sizes', 'Smaller further away', 'Cards shrink the more distant the relative.');
    h += row('detail', 'Less detail when zoomed out', 'First names, then just initials, as you zoom out.');
    h += row('hover', 'Highlight on hover', 'Point at someone to light up their closest family.');
    h += row('colors', 'Colour each family', 'Every family\u2019s lines get their own colour.');
    h += row('smartHide', 'Hide-branch buttons (−)', 'Hide everyone who is only connected through one person.');
    h += row('improved', 'Fewer crossing lines', 'Rearranges families to reduce crossings.');
    h += row('circle', 'Circle layout', 'The tree as rings; scroll to turn it.');
    openPopover(h, rect, 'wide settings');
  }

  function moreMenu(rect) {
    let h = '';
    h += `<button class="item" data-menu="fit">Show the whole tree</button>`;
    h += `<button class="item" data-menu="expand">Unfold every branch</button>`;
    h += '<div class="sep"></div>';
    h += `<button class="item" data-menu="png">Download as image</button>`;
    h += `<button class="item" data-menu="ged">Download GEDCOM <span class="muted">for other apps</span></button>`;
    h += `<button class="item" data-menu="json">Download data (JSON)</button>`;
    openPopover(h, rect);
  }

  // ---------- search ----------
  let searchHits = [], searchIdx = 0;
  // Names starting with the query first, then names containing it, then birth-name matches.
  function rank(p) {
    const i = fold(p.name).indexOf(fold($('#search').value.trim()));
    return i === 0 ? 0 : i > 0 ? 1 : 2;
  }
  function runSearch() {
    const q = fold($('#search').value.trim());
    const box = $('#results');
    if (!q) { box.hidden = true; searchHits = []; return; }
    const t = state.tree;
    searchHits = Object.entries(t.data.people)
      .filter(([, p]) => fold(p.name).includes(q) || fold(p.birthName).includes(q))
      .sort((a, b) => rank(a[1]) - rank(b[1]))
      .slice(0, 8)
      .map(([id]) => id);
    searchIdx = 0;
    box.innerHTML = searchHits.length
      ? searchHits.map((id, i) => `<button class="${i === 0 ? 'on' : ''}" data-hit="${id}"><span>${esc(nameOf(id))}</span><span class="muted">${esc(yearsText(P(id)))}</span></button>`).join('')
      : '<div class="popover empty" style="box-shadow:none">No one by that name</div>';
    box.hidden = false;
  }
  function goTo(id) {
    $('#results').hidden = true;
    $('#search').value = '';
    $('#search').blur();
    closePopover();
    if (state.settings.focus) {
      state.focus = { person: id };
      delete state.view.hide[id];
      render();
      centerOn(id);
    } else if (!state.L.nodes[id]) {
      // Unfold the branches on the way to them.
      const t = state.tree, seen = new Set(), stack = [id];
      while (stack.length) {
        const p = stack.pop();
        if (seen.has(p)) continue;
        seen.add(p);
        const pu = t.parentUnion(p);
        if (pu) { state.view.down[pu] = false; t.union(pu).partners.forEach((q) => { state.view.up[q] = false; stack.push(q); }); }
        state.view.up[p] = false;
        delete state.view.hide[p];
        for (const { id: q } of t.partnersOf(p)) stack.push(q);
      }
      saveView();
      render();
      if (!state.L.nodes[id]) state.focus = { person: id };
    }
    select(id);
    centerOn(id);
    const g = $(`#nodes [data-id="${id}"]`);
    if (g) { g.classList.add('flash'); setTimeout(() => g.classList.remove('flash'), 1500); }
  }

  // ---------- downloads ----------
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const fileBase = () => (state.tree.data.title || 'family-tree').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'family-tree';

  function exportPNG() {
    const b = state.D.bounds, pad = 48;
    const w = b.maxX - b.minX + pad * 2, h = b.maxY - b.minY + pad * 2;
    const clone = vp.cloneNode(true);
    clone.removeAttribute('transform');
    clone.querySelectorAll('.ctl, .add, title').forEach((n) => n.remove());
    clone.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
    const css = $('#svg-style').textContent;
    const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${b.minX - pad} ${b.minY - pad} ${w} ${h}"><style>${css}</style><rect x="${b.minX - pad}" y="${b.minY - pad}" width="${w}" height="${h}" fill="#f6f5f1"/>${clone.outerHTML}</svg>`;
    const img = new Image();
    const scale = Math.min(2, 12000 / Math.max(w, h));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      c.toBlob((blob) => download(fileBase() + '.png', blob), 'image/png');
    };
    img.onerror = () => toast('Could not create the image', true);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }

  // ---------- events ----------
  function bind() {
    // Pan & zoom
    const pointers = new Map();
    let drag = null, moved = false, pinch = null, rotFrame = 0;
    svg.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, cx: state.cam.x, cy: state.cam.y };
        moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: state.cam.k };
        drag = null;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.k * d) / pinch.d / state.cam.k);
        moved = true;
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) { moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('panning'); }
      state.cam.x = drag.cx + dx;
      state.cam.y = drag.cy + dy;
      applyCam();
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) { drag = null; svg.classList.remove('panning'); }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
      if (state.settings.circle && !e.ctrlKey && !e.metaKey) {
        // In the circle, scrolling turns the wheel.
        state.rot += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (mouseWheel ? 0.0012 : 0.003);
        if (!rotFrame) rotFrame = requestAnimationFrame(() => { rotFrame = 0; draw(null); });
        return;
      }
      if (e.ctrlKey || e.metaKey || mouseWheel) {
        const r = svg.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (mouseWheel ? 0.0015 : 0.01)));
      } else {
        state.cam.x -= e.deltaX;
        state.cam.y -= e.deltaY;
        applyCam();
      }
    }, { passive: false });

    // Hover: reveal fold controls belonging to the hovered person.
    let hovered = null;
    svg.addEventListener('pointerover', (e) => {
      const g = e.target.closest('.person');
      const id = g ? g.dataset.id : null;
      if (id === hovered) return;
      hovered = id;
      document.querySelectorAll('.ctl.show').forEach((c) => c.classList.remove('show'));
      if (!g) { clearHighlight(); $('#tip').hidden = true; return; }
      document.querySelectorAll(`.ctl[data-for~="${id}"]`).forEach((c) => c.classList.add('show'));
      if (state.settings.hover && !drag) highlight(id);
      if (state.settings.smartHide) g.classList.toggle('can-hide', branchSize(id) > 0);
      if (g.classList.contains('lod-mid') || g.classList.contains('lod-dot')) showTip(id, e);
    });
    svg.addEventListener('pointerleave', () => { hovered = null; clearHighlight(); $('#tip').hidden = true; });

    svg.addEventListener('click', (e) => {
      if (moved) { moved = false; return; }
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'add') { addMenu(act.dataset.p, act.getBoundingClientRect()); return; }
        if (a === 'couple') { coupleMenu(act.dataset.u, act.getBoundingClientRect()); return; }
        if (a === 'fold') { state.view.down[act.dataset.u] = true; saveView(); render(state.selected || state.tree.union(act.dataset.u).partners[0]); return; }
        if (a === 'unfold') { state.view.down[act.dataset.u] = false; saveView(); render(state.tree.union(act.dataset.u).partners[0]); return; }
        if (a === 'show-up') { state.view.up[act.dataset.p] = false; saveView(); render(act.dataset.p, { animate: true }); return; }
        if (a === 'hide-up') { state.view.up[act.dataset.p] = true; saveView(); render(act.dataset.p, { animate: true }); return; }
        if (a === 'open') { select(act.dataset.p); return; }
        if (a === 'hide-branch') { state.view.hide[act.dataset.p] = true; saveView(); render(act.dataset.p, { animate: true }); return; }
        if (a === 'unhide') { delete state.view.hide[act.dataset.p]; saveView(); render(act.dataset.p, { animate: true }); return; }
        if (a === 'focus-p') { setFocus(act.dataset.p); return; }
        if (a === 'focus-u') { const u = state.tree.union(act.dataset.u); if (u) setFocus(u.partners.find((x) => state.L.nodes[x]) || u.partners[0]); return; }
      }
      const g = e.target.closest('.person');
      if (g) {
        // Focus mode: a click moves the focus there; clicking the person in focus opens them.
        if (state.settings.focus && !isFocused(g.dataset.id)) setFocus(g.dataset.id);
        else select(g.dataset.id);
        return;
      }
      closePopover();
      if (state.selected) select(null);
    });

    svg.addEventListener('dblclick', (e) => {
      const g = e.target.closest('.person');
      if (g && !e.target.closest('[data-act]')) select(g.dataset.id);
    });

    // Panel
    const panel = $('#panel');
    panel.addEventListener('click', (e) => {
      if (e.target === panel) { select(null); return; }
      const go = e.target.closest('[data-go]');
      if (go) { e.preventDefault(); goTo(go.dataset.go); return; }
      const add = e.target.closest('[data-add]');
      if (add) {
        const t = state.tree, pid = state.selected, kind = add.dataset.add;
        const unions = t.unionsOf(pid), parents = t.parents(pid);
        const ask = (kind === 'child' && unions.length > 1) || (kind === 'half' && parents.length > 1);
        if (ask) { addMenu(pid, add.getBoundingClientRect(), kind); return; }
        addRelative(pid, kind, kind === 'child' ? unions[0] : kind === 'half' ? parents[0] : null);
        return;
      }
      const link = e.target.closest('[data-link-child]');
      if (link) {
        mutate((t) => t.moveChild(link.dataset.linkChild, link.dataset.to));
        return;
      }
      const seg = e.target.closest('.seg button');
      if (seg) {
        e.preventDefault();
        const v = seg.dataset.v;
        mutate((t) => { const p = t.person(state.selected); if (v) p.gender = v; else delete p.gender; });
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'close') select(null);
      if (act.dataset.act === 'dates') { state.datesOpen = act.dataset.u; renderPanel(); const i = $(`#modal input[data-udate="${act.dataset.u}"]`); if (i) i.focus(); return; }
      if (act.dataset.act === 'delete') deletePerson(state.selected);
      if (act.dataset.act === 'focus') {
        const id = state.selected;
        select(null);
        setFocus(id);
      }
    });
    panel.addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      if (!f || e.target.type === 'checkbox') return;
      const id = state.selected, v = e.target.value;
      mutate((t) => {
        const p = t.person(id);
        if (v.trim()) p[f] = f === 'notes' ? v : v.replace(/\s+/g, ' ').trimStart(); else delete p[f];
        if (f === 'name' && !v.trim()) p.name = '';
      }, { key: f + id, panel: false });
    });
    panel.addEventListener('change', (e) => {
      const el = e.target, id = state.selected;
      if (el.dataset.f === 'name' || el.dataset.f === 'birthName') {
        mutate((t) => { const p = t.person(id); if (p[el.dataset.f]) p[el.dataset.f] = p[el.dataset.f].trim(); }, { key: el.dataset.f + id, panel: false });
        return;
      }
      if (el.dataset.f === 'deceased') {
        mutate((t) => { const p = t.person(id); if (el.checked) p.deceased = true; else delete p.deceased; });
        return;
      }
      if (el.dataset.date) {
        const v = normalizeDateInput(el.value);
        if (v === null) { el.classList.add('bad'); el.title = 'Try 1952, 03.1952 or 14.03.1952'; return; }
        el.classList.remove('bad');
        const field = el.dataset.date;
        mutate((t) => {
          const p = t.person(id);
          if (v) p[field] = v; else delete p[field];
          if (field === 'death' && v) p.deceased = true;
          if (field === 'birth') { const pu = t.parentUnion(id); if (pu) t.sortChildren(pu); }
        }, { panel: false });
        el.value = formatDate(v);
        return;
      }
      if (el.dataset.uf === 'status') {
        mutate((t) => { const u = t.union(el.dataset.u); if (!u) return; if (el.value) u.status = el.value; else delete u.status; });
        return;
      }
      if (el.dataset.udate) {
        const v = normalizeDateInput(el.value);
        if (v === null) { el.classList.add('bad'); return; }
        el.classList.remove('bad');
        const f = el.dataset.ufield;
        mutate((t) => { const u = t.union(el.dataset.udate); if (u) { if (v) u[f] = v; else delete u[f]; } }, { panel: false });
        el.value = formatDate(v);
        return;
      }
      if (el.hasAttribute('data-move')) {
        mutate((t) => t.moveChild(id, el.value));
      }
    });
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
    });

    // Popover
    $('#popover').addEventListener('change', (e) => {
      const key = e.target.dataset && e.target.dataset.set;
      if (!key) return;
      state.settings[key] = e.target.checked;
      saveSettings();
      const keep = state.selected || (state.focus.person) || state.tree.rootPartners()[0];
      render(keep, { animate: true });
      if (key === 'circle') { state.rot = 0; render(); fitAll(); }
      settingsMenu($('#btn-settings').getBoundingClientRect());
    });
    $('#popover').addEventListener('click', (e) => {
      const rb = e.target.closest('[data-radius]');
      if (rb) {
        state.settings.radius = +rb.dataset.radius;
        saveSettings();
        render(state.focus.person || state.tree.rootPartners()[0], { animate: true });
        settingsMenu($('#btn-settings').getBoundingClientRect());
        return;
      }
      const st = e.target.closest('[data-status]');
      if (st) {
        closePopover();
        mutate((t) => { const u = t.union(st.dataset.u); if (u) u.status = st.dataset.status; });
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) { closePopover(); addRelative(add.dataset.p, add.dataset.add, add.dataset.ref || null); return; }
      const go = e.target.closest('[data-go]');
      if (go) { goTo(go.dataset.go); return; }
      const m = e.target.closest('[data-menu]');
      if (!m) return;
      closePopover();
      const k = m.dataset.menu;
      if (k === 'fit') fitAll();
      if (k === 'expand') {
        const up = {}, down = {};
        for (const id of Object.keys(state.tree.data.people)) up[id] = false;
        for (const id of Object.keys(state.tree.data.unions)) down[id] = false;
        state.view = { down, up, hide: {} };
        saveView();
        render(null, { animate: true });
        fitAll();
      }
      if (k === 'png') exportPNG();
      if (k === 'ged') download(fileBase() + '.ged', new Blob([FT.toGedcom(state.tree)], { type: 'text/plain' }));
      if (k === 'json') download(fileBase() + '.json', new Blob([JSON.stringify(state.tree.data, null, 2)], { type: 'application/json' }));
    });

    // Top bar
    $('#btn-dates').addEventListener('click', (e) => datesMenu(e.currentTarget.getBoundingClientRect()));
    $('#btn-more').addEventListener('click', (e) => moreMenu(e.currentTarget.getBoundingClientRect()));
    $('#btn-center').addEventListener('click', () => { const c = state.D.center; animateCam(camFor(c.x, c.y, state.cam.k), 400); });
    $('#back-btn').addEventListener('click', () => {
      const keep = state.L.rootPartners.find((r) => state.tree.rootPartners().includes(r)) || state.tree.rootPartners()[0];
      state.focus = { union: state.tree.data.root };
      render(keep, { animate: true });
      renderPanel();
      setTimeout(() => { const c = state.D.center; animateCam(camFor(c.x, c.y, state.cam.k), 400); }, ANIM_MS);
    });
    $('#btn-settings').addEventListener('click', (e) => settingsMenu(e.currentTarget.getBoundingClientRect()));
    $('#zoom-in').addEventListener('click', () => { const s = stageSize(); zoomAt(s.w / 2, s.top + s.h / 2, 1.25); });
    $('#zoom-out').addEventListener('click', () => { const s = stageSize(); zoomAt(s.w / 2, s.top + s.h / 2, 0.8); });
    $('#undo').addEventListener('click', undo);
    $('#redo').addEventListener('click', redo);
    $('#publish').addEventListener('click', publish);

    const search = $('#search');
    search.addEventListener('input', runSearch);
    search.addEventListener('keydown', (e) => {
      const box = $('#results');
      if (e.key === 'Escape') { search.value = ''; box.hidden = true; search.blur(); return; }
      if (!searchHits.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        searchIdx = (searchIdx + (e.key === 'ArrowDown' ? 1 : searchHits.length - 1)) % searchHits.length;
        box.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === searchIdx));
      }
      if (e.key === 'Enter') goTo(searchHits[searchIdx]);
    });
    search.addEventListener('blur', () => setTimeout(() => { $('#results').hidden = true; }, 150));
    $('#results').addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-hit]');
      if (b) { e.preventDefault(); goTo(b.dataset.hit); }
    });

    document.addEventListener('pointerdown', (e) => {
      const pop = $('#popover');
      if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-act="add"], [data-act="couple"], #btn-dates, #btn-more, #btn-settings, [data-add]')) closePopover();
    });
    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (e.key === 'Escape') {
        if (!$('#popover').hidden) closePopover();
        else if (state.selected && !typing) select(null);
        else if (typing) document.activeElement.blur();
      }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); search.focus(); }
      if (state.editable && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    });
    window.addEventListener('resize', () => applyCam());
  }

  // ---------- start ----------
  function showMessage(html) {
    const m = $('#message');
    m.innerHTML = '<div>' + html + '</div>';
    m.hidden = false;
  }

  async function detectEditing() {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return false;
    try {
      const r = await fetch('api/status', { cache: 'no-store' });
      if (!r.ok) return false;
      const s = await r.json();
      return !!s.edit;
    } catch (e) { return false; }
  }

  async function init() {
    if (location.protocol === 'file:') {
      showMessage('<b>Open the tree with “start.command”</b><br>Double-click <code>start.command</code> in this folder — it opens the tree in your browser, ready to edit.');
      return;
    }
    state.editable = await detectEditing();
    let data;
    try {
      if (state.editable) {
        const res = await (await fetch('api/data', { cache: 'no-store' })).json();
        data = res.data;
        state.version = res.version;
      } else {
        data = await (await fetch('data/family.json', { cache: 'no-store' })).json();
      }
    } catch (e) {
      showMessage('<b>Could not load the family data.</b><br>Check that data/family.json exists and is valid.');
      return;
    }
    document.body.classList.toggle('editing', state.editable);
    state.tree = new Tree(data);
    state.focus = { union: data.root };
    loadView();
    loadSettings();
    bind();
    render();
    fitAll();
    if (state.editable) {
      setStatus('Saved');
      refreshPublish();
      window.addEventListener('focus', checkForOutsideChanges);
      document.addEventListener('visibilitychange', checkForOutsideChanges);
    }
  }

  init();
})();
