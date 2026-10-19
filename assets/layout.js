// Layout: one row per generation, couples side by side, children centred under their parents.
(function () {
  const FT = (window.FT = window.FT || {});

  const CARD_W = 204, CARD_H = 64, COUPLE_GAP = 46, SIB_GAP = 18, GROUP_GAP = 34, ROW_GAP = 104;
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
    // Couples whose children carry the family line (towards the centre couple).
    const lineEdge = new Set();
    for (const uid of visU) {
      const u = tree.union(uid), ps = u.partners.filter(vis);
      if (ps.length === 2 && u.children.some((c) => reach[c] === 'root' || reach[c] === 'ancestor')) {
        lineEdge.add(ps[0] + '|' + ps[1]); lineEdge.add(ps[1] + '|' + ps[0]);
      }
    }
    function bestPath(comp) {
      if (comp.length === 1) return comp.slice();
      const score = (path) => {
        let sc = path.length * 10;
        for (let i = 1; i < path.length; i++) if (lineEdge.has(path[i - 1] + '|' + path[i])) sc += 100;
        return sc;
      };
      let best = null;
      if (comp.length <= 12) {
        const walk = (path, used) => {
          if (!best || score(path) > score(best)) best = path.slice();
          for (const y of adj[path[path.length - 1]] || []) {
            if (used.has(y)) continue;
            used.add(y); path.push(y); walk(path, used); path.pop(); used.delete(y);
          }
        };
        for (const start of comp) walk([start], new Set([start]));
      } else {
        const end = comp.find((x) => (adj[x] || []).length <= 1) || comp[0];
        best = [end];
        const used = new Set([end]);
        for (let cur = end; ;) {
          const nxt = (adj[cur] || []).find((y) => !used.has(y));
          if (!nxt) break;
          best.push(nxt); used.add(nxt); cur = nxt;
        }
      }
      return best;
    }
    const unitOf = {}, units = [];
    for (const p of order) {
      if (unitOf[p]) continue;
      const comp = [], stack = [p], seen = new Set([p]);
      while (stack.length) {
        const x = stack.pop(); comp.push(x);
        for (const y of adj[x] || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
      }
      // Partners stand side by side in a chain. When someone has more partners than fit
      // next to them, keep the couple the family line runs through together, and put the
      // rest ("extra") at the outer end, joined with a bracket.
      const path = bestPath(comp);
      const extra = comp.filter((x) => !path.includes(x));
      const unit = { id: units.length, path, extra, members: path.concat(extra), gen: gen[p], emitted: false };
      units.push(unit);
      for (const x of comp) unitOf[x] = unit;
    }

    // ---- 3. left-to-right order within each row ----
    const rows = {};
    const doneU = new Set();
    let phase = 'L';
    const emitUnit = (p, anchor, pair) => {
      const unit = unitOf[p];
      if (unit.emitted) return unit;
      const m = unit.path;
      if (!m.includes(p)) p = m.find((x) => (adj[p] || []).includes(x)) || m[0];
      const i = m.indexOf(p);
      let flip;
      if (pair && m.includes(pair[0]) && m.includes(pair[1]) && m.indexOf(pair[0]) !== m.indexOf(pair[1])) {
        flip = m.indexOf(pair[0]) > m.indexOf(pair[1]);
      } else {
        flip = anchor === 'left' ? i > m.length - 1 - i : i < m.length - 1 - i;
      }
      if (flip) m.reverse();
      // For your side the line couple sits at the inner (right) end; mirrored for the other side.
      if (phase !== 'C' && m.length > 2) {
        const idx = m.map((x, k) => (k > 0 && lineEdge.has(m[k - 1] + '|' + x) ? k : -1)).filter((k) => k > 0);
        if (idx.length) {
          const mid = (idx[0] + idx[idx.length - 1] - 1) / 2;
          const nearRight = mid > (m.length - 1) / 2;
          if ((phase === 'L' && !nearRight) || (phase === 'R' && nearRight)) m.reverse();
        }
      }
      unit.members = phase === 'L' ? unit.extra.concat(m) : m.concat(unit.extra);
      unit.side = phase;
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
      phase = 'L';
      const pu0 = visParentUnion(first);
      if (pu0) { doneU.add(pu0); up(pu0, 'L'); sibsOf(pu0, first).forEach((s) => subtree(s, 'L')); }
      phase = 'C';
      const rootUnit = emitUnit(first, 'left', rootPartners.length === 2 ? rootPartners : null);
      descend(rootUnit, 'R');
      phase = 'R';
      for (const p of rest) side(p, 'R', rootPartners);
      inLaws(rootUnit, first, 'R');
    }
    phase = 'X';
    for (const p of order) if (!unitOf[p].emitted) subtree(p, 'R');
    // Unfolded parents of in-laws etc.: take the side of the family they are attached to.
    for (let pass = 0; pass < 4; pass++) {
      for (const u of units) {
        if (u.side !== 'X') continue;
        const near = [];
        for (const m of u.members) {
          for (const uid of tree.unionsOf(m)) for (const c of visChildren(uid)) near.push(unitOf[c]);
          const pu = visParentUnion(m);
          if (pu) for (const q of tree.union(pu).partners.filter(vis)) near.push(unitOf[q]);
        }
        const known = near.find((v) => v && v !== u && v.side !== 'X');
        if (known) u.side = known.side === 'C' ? 'R' : known.side;
      }
    }

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
    // Partners in one chain but not next to each other (someone with several partners):
    // their children hang from the gap beside the partner who isn't the shared one.
    const farPair = (uid) => {
      const ps = tree.union(uid).partners.filter(vis);
      if (ps.length !== 2 || unitOf[ps[0]] !== unitOf[ps[1]]) return null;
      const m = unitOf[ps[0]].members;
      const [a, b] = ps.slice().sort((x, y) => m.indexOf(x) - m.indexOf(y));
      return m.indexOf(b) - m.indexOf(a) > 1 ? { a, b, m } : null;
    };
    const degree = (p) => (adj[p] || []).length;
    const unionCenter = (uid) => {
      const far = farPair(uid);
      if (far) {
        return degree(far.b) <= degree(far.a)
          ? cx(far.b) - CARD_W / 2 - COUPLE_GAP / 2
          : cx(far.a) + CARD_W / 2 + COUPLE_GAP / 2;
      }
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
    const settle = (iterations) => { for (let iter = 0; iter < iterations; iter++) {
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
    } };

    // Straight lines: going up from the centre row, parents sit exactly above their children;
    // going down, children sit exactly below their parents. Where both can't be true, the more
    // important line stays straight and the bend goes in one place rather than everywhere.
    const RANK = { root: 3, ancestor: 2, child: 1, spouse: 0 };
    const rankOf = (p) => RANK[reach[p]] || 0;
    const placeRow = (g, desired, prio) => {
      const r = rows[g], n = r.length;
      const off = [0];
      r.forEach((u, i) => off.push(off[i] + unitW(u) + (rowGaps[g][i] || 0)));
      const pos = new Array(n), placed = new Array(n).fill(false);
      const order = [...Array(n).keys()].sort((a, b) => (prio[b] - prio[a]) || (Math.abs(desired[a]) - Math.abs(desired[b])));
      for (const i of order) {
        let lo = -Infinity, hi = Infinity;
        for (let j = i - 1; j >= 0; j--) if (placed[j]) { lo = pos[j] + off[i] - off[j]; break; }
        for (let j = i + 1; j < n; j++) if (placed[j]) { hi = pos[j] - (off[j] - off[i]); break; }
        pos[i] = Math.min(hi, Math.max(lo, desired[i]));
        placed[i] = true;
      }
      r.forEach((u, i) => { ux[u.id] = pos[i]; });
    };
    // Where a unit should be for its children (only the most important child family counts).
    const upTarget = (u) => {
      let best = null;
      for (const uid of cu[u.id]) {
        const kids = visChildren(uid);
        const score = Math.max(...kids.map(rankOf)) * 100 + kids.length;
        if (!best || score > best.score) best = { uid, score };
      }
      if (!best) return { x: ux[u.id], prio: 0 };
      return { x: ux[u.id] + span(best.uid) - unionCenter(best.uid), prio: 1 + Math.floor(best.score / 100) };
    };
    // Where a unit should be for its parents: its sibling group packed and centred under them.
    const downTarget = (u) => {
      let best = null;
      for (const m of u.members) {
        const pu = visParentUnion(m);
        if (!pu || unionCenter(pu) == null || !tree.union(pu).partners.some(vis)) continue;
        const score = rankOf(m);
        if (!best || score > best.score) best = { pu, score };
      }
      if (!best) return { x: ux[u.id], prio: 0 };
      const ku = [...new Set(visChildren(best.pu).map((c) => unitOf[c]))].filter((k) => k.gen === u.gen).sort((a, b) => ux[a.id] - ux[b.id]);
      let x = 0, lo = Infinity, hi = -Infinity;
      const rel = {};
      for (const k of ku) { rel[k.id] = x; x += unitW(k) + SIB_GAP; }
      for (const c of visChildren(best.pu)) {
        if (!(unitOf[c].id in rel)) continue;
        const cc = rel[unitOf[c].id] + unitOf[c].members.indexOf(c) * (CARD_W + COUPLE_GAP) + CARD_W / 2;
        lo = Math.min(lo, cc); hi = Math.max(hi, cc);
      }
      return { x: rel[u.id] + unionCenter(best.pu) - (lo + hi) / 2, prio: 1 + best.score };
    };
    function shareBend(r, t, g) {
      const holds = (u) => u.members.some((m) => rootPartners.some((rp) => tree.parents(rp).includes(m)));
      const idx = r.map((u, i) => (holds(u) ? i : -1)).filter((i) => i >= 0);
      if (idx.length < 2) return;
      const a = idx[0], b = idx[idx.length - 1];
      let need = 0;
      for (let i = a; i < b; i++) need += unitW(r[i]) + (rowGaps[g][i] || 0);
      const short = need - (t[b].x - t[a].x);
      if (short > 0) { t[a].x -= short / 2; t[b].x += short / 2; }
    }
    function straighten() {
      const up = gens.filter((g) => g < 0).sort((a, b) => b - a);
      const downRows = gens.filter((g) => g >= 0).sort((a, b) => a - b);
      for (let round = 0; round < 3; round++) {
        for (const g of up) {
          const t = rows[g].map(upTarget);
          if (g === -1) shareBend(rows[g], t, g);
          placeRow(g, t.map((o) => o.x), t.map((o) => o.prio));
        }
        for (const g of downRows) {
          const t = rows[g].map((u) => (u.members.some((m) => reach[m] === 'root') ? { x: ux[u.id], prio: 9 } : downTarget(u)));
          placeRow(g, t.map((o) => o.x), t.map((o) => o.prio));
        }
      }
    }

    // Put each group of siblings in the order of their parents above, so lines don't cross
    // (e.g. half-siblings from a father's other relationships end up under that relationship).
    const SIDE = { L: 0, C: 1, R: 2 };
    const reorder = () => {
      const sortRow = (g, keyOf) => {
        const r = rows[g];
        const blocks = new Map();
        r.forEach((u, i) => {
          const pus = u.members.map(visParentUnion).filter((x) => x && tree.union(x).partners.some(vis));
          const id = pus.length ? 'u:' + pus[0] : 'x:' + u.id;
          if (!blocks.has(id)) blocks.set(id, { units: [], first: i, side: SIDE[u.side] ?? 1, strong: [], weak: [] });
          const b = blocks.get(id);
          b.units.push(u);
          const k = keyOf(u, pus);
          if (k) (k.strong ? b.strong : b.weak).push(k.x);
        });
        const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        for (const b of blocks.values()) {
          // A family that leads down to someone decides where its group goes.
          b.x = b.strong.length ? mean(b.strong) : b.weak.length ? mean(b.weak)
            : mean(b.units.map((u) => ux[u.id] + unitW(u) / 2));
        }
        const sorted = [...blocks.values()].sort((a, b) => (a.side - b.side) || (a.x - b.x) || (a.first - b.first));
        rows[g] = sorted.flatMap((b) => b.units);
        rowGaps[g] = rows[g].slice(0, -1).map((u, i) => gapBetween(u, rows[g][i + 1]));
      };
      // Above the centre row: a family sits above the child it leads to.
      for (const g of gens.filter((x) => x < 0).sort((a, b) => b - a)) {
        sortRow(g, (u, pus) => {
          let best = null;
          for (const uid of cu[u.id]) {
            const kids = visChildren(uid).filter((c) => gen[c] === g + 1);
            if (!kids.length) continue;
            const score = Math.max(...kids.map(rankOf));
            if (!best || score > best.score) best = { uid, score };
          }
          if (best) return { x: span(best.uid), strong: true };
          return pus.length ? { x: unionCenter(pus[0]), strong: false } : null;
        });
      }
      // From the centre row down: children sit below their parents.
      for (const g of gens.filter((x) => x >= 0)) sortRow(g, (u, pus) => (pus.length ? { x: unionCenter(pus[0]), strong: true } : null));
    };
    settle(60);
    reorder();
    settle(60);
    reorder();
    settle(120);
    straighten();

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
      const far = farPair(uid);
      if (ox == null) ox = span(uid);
      unions.push({
        id: uid, partners: ps, children: kids, x: ox, y: oy, rowY: y,
        couple: adjacent ? pair : null,
        bracket: far ? pair : null,
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
        const step = Math.min(20, (ROW_GAP - 44) / (ends.length - 1));
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
