// Layout: one row per generation, couples side by side, children centred under their parents.
(function () {
  const FT = (window.FT = window.FT || {});

  const CARD_W = 204, CARD_H = 64, COUPLE_GAP = 46, SIB_GAP = 18, GROUP_GAP = 52, ROW_GAP = 88;
  const ROW_H = CARD_H + ROW_GAP;

  // focus: { union } or { person }.  view: { down: {unionId: true}, up: {personId: bool} }
  function layout(tree, focus, view) {
    const down = view.down || {}, upState = view.up || {};
    const rootUnion = focus.union && tree.union(focus.union) ? focus.union : null;
    const rootPartners = rootUnion ? tree.union(rootUnion).partners.slice() : [focus.person];

    // ---- 1. who is visible, and in which generation ----
    const gen = {}, reach = {}, visU = new Set(), ugen = {};
    const order = [];
    const q = [];
    const addP = (p, g, type) => {
      if (p in gen || !tree.person(p)) return;
      gen[p] = g; reach[p] = type; q.push(p); order.push(p);
    };
    const upHidden = (p) => (p in upState ? upState[p] : reach[p] === 'spouse');
    const visitUnion = (uid, g, fromChild) => {
      if (visU.has(uid)) return;
      visU.add(uid); ugen[uid] = g;
      const u = tree.union(uid);
      for (const p of u.partners) addP(p, g, fromChild ? 'ancestor' : 'spouse');
      if (!down[uid]) for (const c of u.children) addP(c, g + 1, 'child');
    };
    rootPartners.forEach((p) => addP(p, 0, 'root'));
    if (rootUnion) visitUnion(rootUnion, 0, false);
    while (q.length) {
      const p = q.shift();
      for (const uid of tree.unionsOf(p)) visitUnion(uid, gen[p], false);
      const pu = tree.parentUnion(p);
      if (pu && !visU.has(pu) && !upHidden(p)) visitUnion(pu, gen[p] - 1, true);
    }
    const vis = (p) => p in gen;
    const visParentUnion = (p) => { const pu = tree.parentUnion(p); return pu && visU.has(pu) ? pu : null; };
    const visChildren = (uid) => tree.union(uid).children.filter(vis);

    // ---- 2. units: chains of partners standing side by side ----
    const adj = {};
    for (const uid of visU) {
      const ps = tree.union(uid).partners.filter(vis);
      if (ps.length === 2 && gen[ps[0]] === gen[ps[1]]) {
        (adj[ps[0]] = adj[ps[0]] || []).push(ps[1]);
        (adj[ps[1]] = adj[ps[1]] || []).push(ps[0]);
      }
    }
    const unitOf = {}, units = [];
    for (const p of order) {
      if (unitOf[p]) continue;
      const comp = [], stack = [p], seen = new Set([p]);
      while (stack.length) {
        const x = stack.pop(); comp.push(x);
        for (const y of adj[x] || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
      }
      // Walk the chain from one end so partners stay next to each other.
      const end = comp.find((x) => (adj[x] || []).length <= 1) || comp[0];
      const path = [end], used = new Set([end]);
      let cur = end;
      for (;;) {
        const nxt = (adj[cur] || []).find((y) => !used.has(y));
        if (!nxt) break;
        path.push(nxt); used.add(nxt); cur = nxt;
      }
      for (const x of comp) if (!used.has(x)) path.push(x);
      const unit = { id: units.length, members: path, gen: gen[p], emitted: false };
      units.push(unit);
      for (const x of path) unitOf[x] = unit;
    }

    // ---- 3. left-to-right order within each row ----
    const rows = {};
    const doneU = new Set();
    const emitUnit = (p, anchor, pair) => {
      const unit = unitOf[p];
      if (unit.emitted) return unit;
      const m = unit.members;
      const i = m.indexOf(p);
      let flip;
      if (pair && m.includes(pair[0]) && m.includes(pair[1]) && m.indexOf(pair[0]) !== m.indexOf(pair[1])) {
        flip = m.indexOf(pair[0]) > m.indexOf(pair[1]);
      } else {
        flip = anchor === 'left' ? i > m.length - 1 - i : i < m.length - 1 - i;
      }
      if (flip) m.reverse();
      unit.emitted = true;
      (rows[unit.gen] = rows[unit.gen] || []).push(unit);
      return unit;
    };
    const sibsOf = (uid, p) => visChildren(uid).filter((c) => c !== p);

    const up = (uid, dir) => {
      const ps = tree.union(uid).partners.filter(vis);
      if (ps.length === 2) { side(ps[0], 'L', ps); side(ps[1], 'R', ps); }
      else if (ps.length === 1) side(ps[0], dir);
    };
    const inLaws = (unit, self, dir) => {
      for (const m of unit.members) {
        if (m === self) continue;
        const pu = visParentUnion(m);
        if (pu && !doneU.has(pu)) {
          doneU.add(pu);
          up(pu, dir);
          sibsOf(pu, m).forEach((s) => subtree(s, dir));
        }
      }
    };
    const descend = (unit, dir) => {
      for (const m of unit.members) {
        for (const uid of tree.unionsOf(m)) {
          if (!visU.has(uid) || doneU.has(uid)) continue;
          doneU.add(uid);
          for (const c of visChildren(uid)) if (!unitOf[c].emitted) subtree(c, dir);
        }
      }
    };
    // A person, their ancestors, and their siblings (which go on the `dir` side).
    function side(p, dir, pair) {
      const pu = visParentUnion(p);
      const fresh = pu && !doneU.has(pu);
      if (fresh) doneU.add(pu);
      let unit;
      if (dir === 'L') {
        if (fresh) { up(pu, 'L'); sibsOf(pu, p).forEach((s) => subtree(s, 'L')); }
        unit = emitUnit(p, 'left', pair);
      } else {
        unit = emitUnit(p, 'right', pair);
        if (fresh) { sibsOf(pu, p).forEach((s) => subtree(s, 'R')); up(pu, 'R'); }
      }
      descend(unit, dir);
    }
    // A person with their partners and all their descendants.
    function subtree(p, dir) {
      if (unitOf[p].emitted) return;
      const unit = emitUnit(p, dir === 'L' ? 'right' : 'left');
      inLaws(unit, p, dir);
      descend(unit, dir);
    }

    const [first, ...rest] = rootPartners.filter(vis);
    if (first) {
      side(first, 'L', rootPartners.length === 2 ? rootPartners : null);
      for (const p of rest) side(p, 'R', rootPartners);
      inLaws(unitOf[first], first, 'R');
    }
    for (const p of order) if (!unitOf[p].emitted) subtree(p, 'R');

    // ---- 4. x positions ----
    const gens = Object.keys(rows).map(Number).sort((a, b) => a - b);
    const ux = {};
    const unitW = (u) => u.members.length * CARD_W + (u.members.length - 1) * COUPLE_GAP;
    const parentUnionsOf = (u) => [...new Set(u.members.map(visParentUnion).filter(Boolean))];
    const gapBetween = (a, b) => {
      const pa = parentUnionsOf(a), pb = parentUnionsOf(b);
      return pa.some((x) => pb.includes(x)) ? SIB_GAP : GROUP_GAP;
    };
    const cx = (p) => { const u = unitOf[p]; return ux[u.id] + u.members.indexOf(p) * (CARD_W + COUPLE_GAP) + CARD_W / 2; };
    const unionCenter = (uid) => {
      const ps = tree.union(uid).partners.filter(vis);
      if (ps.length) return ps.reduce((s, p) => s + cx(p), 0) / ps.length;
      return null;
    };
    const span = (uid) => {
      const kids = visChildren(uid);
      if (!kids.length) return null;
      let lo = Infinity, hi = -Infinity;
      for (const c of kids) { const x = cx(c); lo = Math.min(lo, x); hi = Math.max(hi, x); }
      return (lo + hi) / 2;
    };
    const childUnionsOf = (u) => {
      const out = [];
      for (const m of u.members) for (const uid of tree.unionsOf(m)) if (visU.has(uid) && !out.includes(uid) && visChildren(uid).length) out.push(uid);
      return out;
    };
    const rowGaps = {};
    for (const g of gens) {
      const r = rows[g];
      rowGaps[g] = r.slice(0, -1).map((u, i) => gapBetween(u, r[i + 1]));
      let x = 0;
      r.forEach((u, i) => { ux[u.id] = x; x += unitW(u) + (rowGaps[g][i] || 0); });
      const shift = x / 2;
      r.forEach((u) => { ux[u.id] -= shift; });
    }
    const cu = {};
    for (const u of units) cu[u.id] = childUnionsOf(u);

    // Siblings want to sit packed together, centred under their parents; parents want to sit
    // centred over their children. Iterate until both settle.
    const kidUnitsOf = {};
    for (const uid of visU) {
      if (!tree.union(uid).partners.some(vis)) continue;
      const kids = visChildren(uid);
      if (kids.length) kidUnitsOf[uid] = { kids, units: [...new Set(kids.map((c) => unitOf[c]))] };
    }
    for (let iter = 0; iter < 120; iter++) {
      const pulls = {};
      const push = (id, d) => (pulls[id] = pulls[id] || []).push(d);
      for (const [uid, { kids, units: ku }] of Object.entries(kidUnitsOf)) {
        ku.sort((a, b) => ux[a.id] - ux[b.id]);
        const rel = {};
        let x = 0;
        ku.forEach((u, i) => { rel[u.id] = x; x += unitW(u) + SIB_GAP; });
        let lo = Infinity, hi = -Infinity;
        for (const c of kids) {
          const u = unitOf[c];
          const cc = rel[u.id] + u.members.indexOf(c) * (CARD_W + COUPLE_GAP) + CARD_W / 2;
          lo = Math.min(lo, cc); hi = Math.max(hi, cc);
        }
        const shift = unionCenter(uid) - (lo + hi) / 2;
        for (const u of ku) push(u.id, rel[u.id] + shift - ux[u.id]);
      }
      const seq = iter % 2 ? gens.slice().reverse() : gens;
      for (const g of seq) {
        const r = rows[g];
        const desired = r.map((u) => {
          const pl = (pulls[u.id] || []).slice();
          for (const uid of cu[u.id]) {
            const c = unionCenter(uid), s = span(uid);
            if (c != null && s != null) pl.push(s - c);
          }
          const d = pl.length ? pl.reduce((a, b) => a + b, 0) / pl.length : 0;
          return ux[u.id] + d;
        });
        const xs = pav(desired, r.map(unitW), rowGaps[g]);
        r.forEach((u, i) => { ux[u.id] = xs[i]; });
      }
    }

    // ---- 5. output ----
    const nodes = {};
    for (const p of order) nodes[p] = { x: cx(p) - CARD_W / 2, y: gen[p] * ROW_H, gen: gen[p] };
    const center = rootPartners.filter(vis).reduce((s, p) => s + cx(p), 0) / Math.max(1, rootPartners.filter(vis).length);

    const unions = [];
    for (const uid of visU) {
      const u = tree.union(uid);
      const ps = u.partners.filter(vis);
      const kids = visChildren(uid);
      const hidden = u.children.filter((c) => !vis(c));
      const y = ugen[uid] * ROW_H;
      // Partners standing next to each other get a straight line; a third partner further
      // along the row (someone with several relationships) is joined by a bracket underneath.
      const sameUnit = ps.length === 2 && unitOf[ps[0]] === unitOf[ps[1]];
      const adjacent = sameUnit && Math.abs(unitOf[ps[0]].members.indexOf(ps[0]) - unitOf[ps[0]].members.indexOf(ps[1])) === 1;
      const pair = ps.length === 2 ? ps.map((p) => nodes[p]).sort((a, b) => a.x - b.x) : null;
      let ox = unionCenter(uid), oy = y + CARD_H / 2;
      if (ps.length === 1 || (ps.length === 2 && !adjacent)) oy = y + CARD_H;
      if (sameUnit && !adjacent) oy = y + CARD_H + 12;
      if (ox == null) ox = span(uid);
      unions.push({
        id: uid, partners: ps, children: kids, x: ox, y: oy, rowY: y,
        couple: adjacent ? pair : null,
        bracket: sameUnit && !adjacent ? pair : null,
        status: u.status || '', start: u.start || '', end: u.end || '',
        collapsed: !!down[uid] && hidden.length > 0,
        hiddenCount: hidden.length ? countHidden(tree, hidden, gen) : 0,
      });
    }
    // Families in the same row whose connector lines would overlap get different heights.
    const byRow = {};
    for (const u of unions) {
      u.busY = u.rowY + CARD_H + ROW_GAP / 2;
      if (!u.children.length) continue;
      const xs = u.children.map((c) => nodes[c].x + CARD_W / 2).concat(u.partners.length ? [u.x] : []);
      u.lo = Math.min(...xs); u.hi = Math.max(...xs);
      (byRow[u.rowY] = byRow[u.rowY] || []).push(u);
    }
    for (const list of Object.values(byRow)) {
      list.sort((a, b) => a.lo - b.lo);
      const ends = [];
      for (const u of list) {
        let lane = ends.findIndex((e) => e < u.lo - 12);
        if (lane < 0) { lane = ends.length; ends.push(0); }
        ends[lane] = u.hi;
        u.lane = lane;
      }
      if (ends.length > 1) {
        const step = Math.min(14, (ROW_GAP - 40) / (ends.length - 1));
        for (const u of list) u.busY += (u.lane - (ends.length - 1) / 2) * step;
      }
    }
    // People whose parents are hidden.
    const upChips = [];
    for (const p of order) {
      const pu2 = tree.parentUnion(p);
      if (pu2 && !visU.has(pu2)) {
        const u = tree.union(pu2);
        const seeds = u.partners.concat(u.children).filter((x) => !vis(x));
        upChips.push({ person: p, count: countHidden(tree, seeds, gen) });
      }
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of Object.values(nodes)) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + CARD_W);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + CARD_H);
    }
    return {
      nodes, unions, upChips, reach, rootPartners,
      center: { x: center, y: CARD_H / 2 },
      bounds: { minX, maxX, minY: minY - 30, maxY: maxY + 30 },
    };
  }

  // Number of people reachable from `seeds` without passing through visible people.
  function countHidden(tree, seeds, visible) {
    const seen = new Set();
    const q = seeds.filter((s) => !(s in visible));
    q.forEach((s) => seen.add(s));
    while (q.length) {
      const p = q.pop();
      const next = tree.parents(p).concat(tree.siblingsOf(p), tree.partnersOf(p).map((o) => o.id), tree.childrenOf(p));
      for (const n of next) if (!(n in visible) && !seen.has(n)) { seen.add(n); q.push(n); }
    }
    return seen.size;
  }

  // Keep units in order with minimum gaps, as close as possible to their desired x (isotonic regression).
  function pav(desired, widths, gaps) {
    const n = desired.length, off = new Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) { off[i] = acc; acc += widths[i] + (gaps[i] || 0); }
    const blocks = [];
    for (let i = 0; i < n; i++) {
      blocks.push({ sum: desired[i] - off[i], n: 1 });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.sum / a.n <= b.sum / b.n) break;
        a.sum += b.sum; a.n += b.n; blocks.pop();
      }
    }
    const out = [];
    let i = 0;
    for (const b of blocks) for (let k = 0; k < b.n; k++, i++) out.push(b.sum / b.n + off[i]);
    return out;
  }

  Object.assign(FT, { layout, CARD_W, CARD_H, COUPLE_GAP, ROW_GAP, ROW_H });
})();
