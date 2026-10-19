// Data model: people, unions (couples + their children), dates and kinship.
(function () {
  const FT = (window.FT = window.FT || {});

  // ---------- dates ----------
  // Stored as "YYYY", "YYYY-MM" or "YYYY-MM-DD", optionally prefixed with "~" (approximate).
  const DATE_RE = /^(~)?(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function parseDate(s) {
    if (!s) return null;
    const m = DATE_RE.exec(String(s).trim());
    if (!m) return null;
    const out = { approx: !!m[1], y: +m[2], m: m[3] ? +m[3] : null, d: m[4] ? +m[4] : null };
    if (out.m != null && (out.m < 1 || out.m > 12)) return null;
    if (out.d != null && (out.d < 1 || out.d > new Date(out.y, out.m, 0).getDate())) return null;
    return out;
  }

  function formatDate(s) {
    const p = parseDate(s);
    if (!p) return '';
    let out = String(p.y);
    if (p.m) out = MONTHS[p.m - 1] + ' ' + out;
    if (p.m && p.d) out = p.d + ' ' + out;
    return (p.approx ? 'around ' : '') + out;
  }

  function shortYear(s) {
    const p = parseDate(s);
    if (!p) return '';
    return (p.approx ? 'c. ' : '') + p.y;
  }

  function yearOf(s) {
    const p = parseDate(s);
    return p ? p.y : null;
  }

  // Accepts "1952", "~1952", "c. 1952", "about 1952", "14.03.1952", "14/3/1952",
  // "1952-03-14", "14 March 1952", "March 1952", "Mar 1952".
  // Returns the canonical string, '' for empty input, or null if it can't be understood.
  function normalizeDateInput(text) {
    let t = String(text || '').trim().toLowerCase();
    if (!t) return '';
    let approx = false;
    const ap = /^(~|(?:circa|ca|c|about|abt|around|approx)(?:\.|\b))\s*/;
    if (ap.test(t)) { approx = true; t = t.replace(ap, ''); }
    const pad = (n) => String(n).padStart(2, '0');
    const ok = (y, m, d) => {
      if (y < 1000 || y > 2999) return null;
      if (m != null && (m < 1 || m > 12)) return null;
      if (d != null && (d < 1 || d > new Date(y, m, 0).getDate())) return null;
      return (approx ? '~' : '') + y + (m ? '-' + pad(m) : '') + (m && d ? '-' + pad(d) : '');
    };
    let m;
    if ((m = /^(\d{4})$/.exec(t))) return ok(+m[1]);
    if ((m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(t))) return ok(+m[1], +m[2], m[3] ? +m[3] : null);
    if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t))) return ok(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})[./-](\d{4})$/.exec(t))) return ok(+m[2], +m[1]);
    const monthIdx = (w) => (w.length < 3 ? 0 : MONTHS.findIndex((mm) => mm.toLowerCase().startsWith(w)) + 1);
    if ((m = /^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/.exec(t))) { const mi = monthIdx(m[2]); return mi ? ok(+m[3], mi, +m[1]) : null; }
    if ((m = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t))) { const mi = monthIdx(m[1]); return mi ? ok(+m[3], mi, +m[2]) : null; }
    if ((m = /^([a-z]+)\.?,?\s+(\d{4})$/.exec(t))) { const mi = monthIdx(m[1]); return mi ? ok(+m[2], mi) : null; }
    return null;
  }

  // Whole years between two partial dates (null if unknown).
  function yearsBetween(a, b) {
    const pa = parseDate(a), pb = parseDate(b);
    if (!pa || !pb) return null;
    let n = pb.y - pa.y;
    if (pa.m && pb.m && pa.d && pb.d) {
      if (pb.m < pa.m || (pb.m === pa.m && pb.d < pa.d)) n -= 1;
    }
    return n;
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- tree ----------
  function newId(prefix, taken) {
    let id;
    do id = prefix + Math.random().toString(36).slice(2, 8); while (taken[id]);
    return id;
  }

  class Tree {
    constructor(data) {
      this.data = data;
      data.people = data.people || {};
      data.unions = data.unions || {};
      this.reindex();
    }

    reindex() {
      this._parentUnion = {};
      this._unions = {};
      for (const [uid, u] of Object.entries(this.data.unions)) {
        u.partners = u.partners || [];
        u.children = u.children || [];
        for (const p of u.partners) (this._unions[p] = this._unions[p] || []).push(uid);
        for (const c of u.children) if (!this._parentUnion[c]) this._parentUnion[c] = uid;
      }
      this._anc = {};
    }

    person(id) { return this.data.people[id]; }
    union(id) { return this.data.unions[id]; }
    parentUnion(id) { return this._parentUnion[id] || null; }
    unionsOf(id) { return this._unions[id] || []; }
    parents(id) { const u = this.parentUnion(id); return u ? this.union(u).partners.slice() : []; }
    partnersOf(id) {
      const out = [];
      for (const uid of this.unionsOf(id)) for (const p of this.union(uid).partners) if (p !== id) out.push({ id: p, union: uid });
      return out;
    }
    childrenOf(id) {
      const out = [];
      for (const uid of this.unionsOf(id)) for (const c of this.union(uid).children) if (!out.includes(c)) out.push(c);
      return out;
    }
    siblingsOf(id) {
      const u = this.parentUnion(id);
      return u ? this.union(u).children.filter((c) => c !== id) : [];
    }
    // Full siblings, half-siblings (one shared parent) and step-siblings (a parent's partner's children).
    siblingsDetailed(id) {
      const out = this.siblingsOf(id).map((s) => ({ id: s, kind: 'full' }));
      const seen = new Set([id, ...out.map((o) => o.id)]);
      const parents = this.parents(id);
      for (const par of parents) {
        for (const uid of this.unionsOf(par)) {
          if (uid === this.parentUnion(id)) continue;
          for (const c of this.union(uid).children) if (!seen.has(c)) { seen.add(c); out.push({ id: c, kind: 'half' }); }
        }
      }
      for (const par of parents) {
        for (const { id: other } of this.partnersOf(par)) {
          if (parents.includes(other)) continue;
          for (const uid of this.unionsOf(other)) {
            for (const c of this.union(uid).children) if (!seen.has(c)) { seen.add(c); out.push({ id: c, kind: 'step' }); }
          }
        }
      }
      return out;
    }
    // Couples this person could be the child of: any family of one of their current parents.
    parentOptions(id) {
      const out = [];
      for (const par of this.parents(id)) for (const uid of this.unionsOf(par)) if (!out.includes(uid)) out.push(uid);
      const cur = this.parentUnion(id);
      if (cur && !out.includes(cur)) out.unshift(cur);
      return out;
    }
    unionLabel(uid) {
      const ps = this.union(uid).partners.map((p) => this.person(p) && this.person(p).name ? this.person(p).name : 'Unnamed');
      if (ps.length === 2) return ps[0] + ' & ' + ps[1];
      if (ps.length === 1) return ps[0] + ' (other parent unknown)';
      return 'Unknown parents';
    }
    isEnded(uid) { const u = this.union(uid); return u.status === 'divorced' || u.status === 'separated'; }
    isDeceased(id) { const p = this.person(id); return !!(p && (p.deceased || p.death)); }
    rootPartners() {
      const r = this.union(this.data.root);
      return r ? r.partners.slice() : Object.keys(this.data.people).slice(0, 1);
    }
    firstName(id) { const p = this.person(id); return p && p.name ? p.name.trim().split(/\s+/)[0] : 'Unnamed'; }

    // ---------- edits ----------
    addPerson(fields) {
      const id = newId('p', this.data.people);
      this.data.people[id] = Object.assign({ name: '' }, fields || {});
      return id;
    }
    addUnion(partners, children, extra) {
      const id = newId('u', this.data.unions);
      this.data.unions[id] = Object.assign({ partners: partners || [], children: children || [] }, extra || {});
      this.reindex();
      return id;
    }

    addParent(pid) {
      let uid = this.parentUnion(pid);
      if (uid && this.union(uid).partners.length >= 2) return null;
      const np = this.addPerson();
      if (uid) {
        const u = this.union(uid);
        u.partners.push(np);
        this.reindex();
      } else {
        this.addUnion([np], [pid]);
      }
      return np;
    }
    // A partner is always a new, separate relationship; it never makes them a parent of existing children.
    addPartner(pid) {
      const np = this.addPerson();
      this.addUnion([pid, np], []);
      return np;
    }
    // A child of `parent` with someone else (other parent unknown for now).
    addHalfSibling(pid, parent) {
      const ns = this.addPerson();
      this.addUnion([parent], [ns]);
      return ns;
    }
    // Make `pid` a child of another couple, e.g. to turn a sibling into a half-sibling.
    // toUnion may be 'solo:<parentId>' for "child of that parent only, other parent unknown".
    moveChild(pid, toUnion) {
      if (String(toUnion).startsWith('solo:')) {
        const par = toUnion.slice(5);
        toUnion = this.unionsOf(par).find((u) => this.union(u).partners.length === 1) || this.addUnion([par], []);
      }
      const from = this.parentUnion(pid);
      if (from === toUnion || !this.union(toUnion)) return;
      if (from) this.union(from).children = this.union(from).children.filter((c) => c !== pid);
      this.union(toUnion).children.push(pid);
      this.reindex();
      this.sortChildren(toUnion);
      this.prune();
    }
    addChild(pid, unionId) {
      const nc = this.addPerson();
      if (unionId && this.union(unionId)) {
        this.union(unionId).children.push(nc);
        this.reindex();
      } else {
        this.addUnion([pid], [nc]);
      }
      return nc;
    }
    addSibling(pid) {
      const ns = this.addPerson();
      const uid = this.parentUnion(pid);
      if (uid) {
        const kids = this.union(uid).children;
        kids.splice(kids.indexOf(pid) + 1, 0, ns);
        this.reindex();
      } else {
        this.addUnion([], [pid, ns]);
      }
      return ns;
    }

    removePerson(pid) {
      delete this.data.people[pid];
      for (const u of Object.values(this.data.unions)) {
        u.partners = u.partners.filter((x) => x !== pid);
        u.children = u.children.filter((x) => x !== pid);
      }
      this.prune();
    }

    // People reachable from the centre couple, optionally pretending `without` is gone.
    connected(without) {
      const seen = new Set(), stack = this.rootPartners().filter((p) => p !== without);
      while (stack.length) {
        const p = stack.pop();
        if (seen.has(p) || p === without || !this.person(p)) continue;
        seen.add(p);
        const next = this.parents(p).concat(this.siblingsOf(p), this.partnersOf(p).map((o) => o.id), this.childrenOf(p));
        for (const n of next) if (!seen.has(n)) stack.push(n);
      }
      return seen;
    }
    // People who would end up cut off from the tree if `pid` were removed.
    strandedBy(pid) {
      const before = this.connected(), after = this.connected(pid);
      return [...before].filter((p) => p !== pid && !after.has(p));
    }

    // Drop families that no longer connect anyone.
    prune() {
      for (const [uid, u] of Object.entries(this.data.unions)) {
        const keep = uid === this.data.root
          ? u.partners.length > 0
          : (u.partners.length >= 2) || (u.partners.length === 1 && u.children.length > 0) || (u.partners.length === 0 && u.children.length >= 2);
        if (!keep) delete this.data.unions[uid];
      }
      this.reindex();
    }

    // Keep children ordered by birth: dated children are sorted among themselves,
    // undated children keep their slots.
    sortChildren(uid) {
      const u = this.union(uid);
      if (!u) return;
      const slots = [], dated = [];
      u.children.forEach((c, i) => {
        const p = this.person(c);
        const pd = p && parseDate(p.birth);
        if (pd) { slots.push(i); dated.push({ c, k: pd.y * 10000 + (pd.m || 0) * 100 + (pd.d || 0) }); }
      });
      dated.sort((a, b) => a.k - b.k);
      slots.forEach((slot, i) => { u.children[slot] = dated[i].c; });
    }

    // ---------- kinship ----------
    // Map of ancestor keys ('p:<id>' for people, 'u:<id>' for parent couples) to generation distance.
    ancestors(id) {
      if (this._anc[id]) return this._anc[id];
      const m = new Map([['p:' + id, 0]]);
      const q = [[id, 0]];
      while (q.length) {
        const [x, d] = q.shift();
        const uid = this.parentUnion(x);
        if (!uid) continue;
        if (!m.has('u:' + uid)) m.set('u:' + uid, d + 1);
        for (const par of this.union(uid).partners) {
          if (!m.has('p:' + par)) { m.set('p:' + par, d + 1); q.push([par, d + 1]); }
        }
      }
      return (this._anc[id] = m);
    }

    blood(x, ego) {
      const ax = this.ancestors(x), ae = this.ancestors(ego);
      let best = null;
      for (const [k, a] of ae) {
        if (!ax.has(k)) continue;
        const b = ax.get(k);
        const better = !best || a + b < best.a + best.b || (a + b === best.a + best.b && k[0] === 'u' && best.k[0] === 'p');
        if (better) best = { k, a, b };
      }
      if (!best) return null;
      best.half = best.a === 1 && best.b === 1 && best.k[0] === 'p';
      return best;
    }

    // Relationship of x to ego, e.g. "grandmother", "first cousin once removed", "sister-in-law".
    relation(x, ego) {
      if (x === ego) return { term: 'self', dist: 0, blood: true };
      const g = (this.person(x) || {}).gender;
      const b = this.blood(x, ego);
      if (b) return { term: bloodTerm(b.a, b.b, g, b.half), dist: b.a + b.b, blood: true };

      for (const uid of this.unionsOf(x)) {
        const u = this.union(uid);
        if (u.partners.includes(ego)) return { term: partnerTerm(u, g), dist: 1, blood: false };
      }
      let best = null;
      for (const uid of this.unionsOf(x)) {
        for (const q of this.union(uid).partners) {
          if (q === x) continue;
          const rb = this.blood(q, ego);
          if (!rb || rb.a + rb.b === 0) continue;
          if (rb.a === 0 && rb.b === 0) continue;
          if (!best || rb.a + rb.b < best.a + best.b) best = Object.assign({ u: this.union(uid) }, rb);
        }
      }
      if (best) return { term: inLawTerm(best, g), dist: best.a + best.b + 1, blood: false };

      // Relatives of ego's partner.
      for (const { id: partner } of this.partnersOf(ego)) {
        const rb = this.blood(x, partner);
        if (!rb) continue;
        let term;
        if (rb.a === 1 && rb.b === 0) term = W(g, 'father-in-law', 'mother-in-law', 'parent-in-law');
        else if (rb.a === 1 && rb.b === 1) term = W(g, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
        else if (rb.a === 0 && rb.b === 1) term = W(g, 'stepson', 'stepdaughter', 'stepchild');
        else term = 'partner’s ' + bloodTerm(rb.a, rb.b, g, rb.half);
        return { term, dist: rb.a + rb.b + 1, blood: false };
      }
      return null;
    }

    // Label relative to the centre couple, e.g. "Ernest's grandmother" or "Ernest & Ana's son".
    relationLabel(x) {
      const roots = this.rootPartners();
      if (roots.includes(x)) {
        if (roots.length < 2) return '';
        const other = roots.find((r) => r !== x);
        const r = this.relation(x, other);
        return r ? this.firstName(other) + '’s ' + r.term : '';
      }
      const rels = roots.map((r) => ({ r, rel: this.relation(x, r) })).filter((o) => o.rel);
      if (!rels.length) return '';
      if (rels.length === 2 && rels[0].rel.blood && rels[1].rel.blood && rels[0].rel.term === rels[1].rel.term) {
        return this.firstName(rels[0].r) + ' & ' + this.firstName(rels[1].r) + '’s ' + rels[0].rel.term;
      }
      rels.sort((a, b) => (b.rel.blood - a.rel.blood) || (a.rel.dist - b.rel.dist));
      return this.firstName(rels[0].r) + '’s ' + rels[0].rel.term;
    }
  }

  function W(g, m, f, n) { return g === 'm' ? m : g === 'f' ? f : n; }
  const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times'];

  function bloodTerm(a, b, g, half) {
    const gr = (n) => 'great-'.repeat(Math.max(0, n));
    if (a === 0 && b === 0) return 'self';
    if (a === 0) return b === 1 ? W(g, 'son', 'daughter', 'child') : gr(b - 2) + W(g, 'grandson', 'granddaughter', 'grandchild');
    if (b === 0) return a === 1 ? W(g, 'father', 'mother', 'parent') : gr(a - 2) + W(g, 'grandfather', 'grandmother', 'grandparent');
    if (a === 1 && b === 1) return (half ? 'half-' : '') + W(g, 'brother', 'sister', 'sibling');
    if (a === 1) return gr(b - 2) + W(g, 'nephew', 'niece', 'niece/nephew');
    if (b === 1) return gr(a - 2) + W(g, 'uncle', 'aunt', 'aunt/uncle');
    const deg = Math.min(a, b) - 1, rem = Math.abs(a - b);
    return (ORD[deg] || deg + 'th') + ' cousin' + (rem ? ' ' + (TIMES[rem] || rem + ' times') + ' removed' : '');
  }

  function partnerTerm(u, g) {
    if (u.status === 'divorced') return W(g, 'ex-husband', 'ex-wife', 'ex-spouse');
    if (u.status === 'separated') return 'ex-partner';
    if (u.status === 'married') return W(g, 'husband', 'wife', 'spouse');
    return 'partner';
  }

  function inLawTerm(r, g) {
    const { a, b } = r;
    if (a === 1 && b === 1) return W(g, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
    if (a === 0 && b === 1) return W(g, 'son-in-law', 'daughter-in-law', 'child-in-law');
    if (a === 0) return bloodTerm(a, b, g) + '-in-law';
    if (a === 1 && b === 0) return W(g, 'stepfather', 'stepmother', 'step-parent');
    if (b === 0) return 'step-' + bloodTerm(a, b, g);
    if (b === 1) return bloodTerm(a, b, g) + ' by marriage';
    if (a === 1) return bloodTerm(a, b, g) + '-in-law';
    const word = r.u.status === 'married' ? W(g, 'husband', 'wife', 'spouse') : 'partner';
    return bloodTerm(a, b, '') + '’s ' + word;
  }

  // ---------- GEDCOM export ----------
  function toGedcom(tree) {
    const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const gd = (s) => {
      const p = parseDate(s);
      if (!p) return null;
      return (p.approx ? 'ABT ' : '') + (p.d ? p.d + ' ' : '') + (p.m ? MON[p.m - 1] + ' ' : '') + p.y;
    };
    const pids = Object.keys(tree.data.people), uids = Object.keys(tree.data.unions);
    const I = (id) => '@I' + (pids.indexOf(id) + 1) + '@', F = (id) => '@F' + (uids.indexOf(id) + 1) + '@';
    const out = ['0 HEAD', '1 SOUR FamilyTree', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
    for (const id of pids) {
      const p = tree.person(id);
      const parts = (p.name || '').trim().split(/\s+/);
      const sur = parts.length > 1 ? parts.pop() : '';
      out.push('0 ' + I(id) + ' INDI', '1 NAME ' + parts.join(' ') + ' /' + sur + '/');
      if (p.birthName) out.push('2 _MARNM ' + p.name, '1 NAME ' + parts.join(' ') + ' /' + p.birthName + '/', '2 TYPE birth');
      if (p.gender) out.push('1 SEX ' + p.gender.toUpperCase());
      if (gd(p.birth)) out.push('1 BIRT', '2 DATE ' + gd(p.birth));
      if (gd(p.death)) out.push('1 DEAT', '2 DATE ' + gd(p.death));
      else if (p.deceased) out.push('1 DEAT Y');
      for (const u of tree.unionsOf(id)) out.push('1 FAMS ' + F(u));
      if (tree.parentUnion(id)) out.push('1 FAMC ' + F(tree.parentUnion(id)));
      if (p.notes) p.notes.split('\n').forEach((l, i) => out.push((i ? '2 CONT ' : '1 NOTE ') + l));
    }
    for (const uid of uids) {
      const u = tree.union(uid);
      out.push('0 ' + F(uid) + ' FAM');
      const ps = u.partners.slice();
      const husb = ps.find((x) => (tree.person(x) || {}).gender === 'm') || (ps.find((x) => (tree.person(x) || {}).gender !== 'f') ?? null);
      if (husb) out.push('1 HUSB ' + I(husb));
      for (const x of ps) if (x !== husb) out.push('1 WIFE ' + I(x));
      for (const c of u.children) out.push('1 CHIL ' + I(c));
      if (u.status === 'married' || u.start) { out.push('1 MARR'); if (gd(u.start)) out.push('2 DATE ' + gd(u.start)); }
      if (u.status === 'divorced' || u.status === 'separated') { out.push('1 DIV' + (gd(u.end) ? '' : ' Y')); if (gd(u.end)) out.push('2 DATE ' + gd(u.end)); }
    }
    out.push('0 TRLR');
    return out.join('\n') + '\n';
  }

  Object.assign(FT, { Tree, parseDate, formatDate, shortYear, yearOf, normalizeDateInput, yearsBetween, todayStr, MONTHS, toGedcom });
})();
