/* CLEANLINE — ตัวเชื่อมหน้าเว็บกับตัวกลาง (Google Apps Script)
 * หน้าเว็บเรียกใช้แบบเดียวกับ Firestore: db.collection('jobs').onSnapshot(...), db.doc('jobs/j1').update({...})
 * ใช้: const {db, user, me} = await CLGDB.connect('admin' | 'engineer' | 'console')
 * ตั้งค่าที่ config.js: window.CLEANLINE_CONFIG = {api:'https://script.google.com/macros/s/…/exec', clientId:'….apps.googleusercontent.com'}
 */
(function () {
  'use strict';
  var CFG = window.CLEANLINE_CONFIG || {};
  var PAGE_URL = { admin: 'index.html', engineer: 'engineer.html', console: 'console.html' };
  var PAGE_NAME = { admin: 'CLEANLINE Management', engineer: 'CLEANLINE Man', console: 'CLEANLINE Console' };
  var SKEY = 'cl.sess';
  var st = { token: null, me: null, page: '', data: {}, ver: {}, loaded: {}, subs: {}, epoch: null,
    timer: null, busy: false, again: false, fails: 0, sys: {} };

  /* ---------- ส่งคำสั่งไปตัวกลาง ---------- */
  function api(req) {
    if (!CFG.api) return Promise.reject(mkErr('setup', 'ยังไม่ได้ตั้งค่า config.js (ที่อยู่ตัวกลาง)'));
    req.token = st.token;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () { ctl && ctl.abort(); }, req.op === 'batch' || req.op === 'upload' || req.op === 'fput' ? 180000 : 60000);
    return fetch(CFG.api, { method: 'POST', body: JSON.stringify(req), redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl ? ctl.signal : undefined })
      .catch(function () { throw mkErr('network', 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); })
      .then(function (r) {
        if (r && r.code === 'network') throw r;
        return r.text().then(function (t) {
          try { return JSON.parse(t); } catch (e) { throw mkErr('server', 'ตัวกลางตอบกลับผิดปกติ (HTTP ' + r.status + ') — ลองเปิดลิงก์ตัวกลาง /exec ดูว่าขึ้น "พร้อมใช้งาน" ไหม'); }
        });
      })
      .then(function (r) {
        clearTimeout(to);
        if (r && r.ok) return r;
        var e = mkErr(r && r.code || 'error', r && r.msg || 'เกิดข้อผิดพลาด');
        if (e.code === 'auth' || e.code === 'suspended') signOut(e.message);
        throw e;
      });
  }
  function mkErr(code, msg) { var e = new Error(msg); e.code = code; return e; }

  /* ---------- ดึงข้อมูลทุก 5 วินาที (เฉพาะที่เปลี่ยน) ---------- */
  function cols() { var c = Object.keys(st.subs).filter(function (k) { return st.subs[k].length; }); if (c.indexOf('members') < 0) c.push('members'); return c; }
  function schedule(ms) {
    clearTimeout(st.timer);
    var hidden = typeof document !== 'undefined' && document.hidden;
    st.timer = setTimeout(pull, ms != null ? ms : (st.fails ? Math.min(30000, 5000 * st.fails) : hidden ? 30000 : 5000));
  }
  function pull() {
    if (!st.token) return;
    if (st.busy) { st.again = true; return; }
    st.busy = true;
    var since = {}; cols().forEach(function (c) { since[c] = st.ver[c] || 0; });
    return api({ op: 'pull', cols: Object.keys(since), since: since, epoch: st.epoch })
      .then(function (r) {
        st.fails = 0; banner('net', ''); st.lastPull = Date.now();
        if (r.reset) { st.data = {}; st.loaded = {}; }
        st.epoch = r.epoch;
        setSys(r.sys || {});
        var changed = {};
        Object.keys(r.ver).forEach(function (c) {
          var m = st.data[c] || (st.data[c] = {});
          var diff = false;
          (r.changes[c] || []).forEach(function (x) {
            if (x.deleted) { if (x.id in m) { delete m[x.id]; diff = true; } return; }
            if (JSON.stringify(m[x.id] || null) !== JSON.stringify(x.d)) { m[x.id] = x.d; diff = true; } // ของที่เราเพิ่งบันทึกเอง ไม่ต้องวาดใหม่
          });
          if (diff || !st.loaded[c] || r.reset) changed[c] = 1;
          st.ver[c] = r.ver[c]; st.loaded[c] = true;
        });
        Object.keys(changed).forEach(emit);
        if (Object.keys(changed).length) cacheSave();
      })
      .catch(function (e) {
        if (e.code === 'network') { st.fails++; if (st.fails >= 2) banner('net', 'เชื่อมต่อไม่ได้ กำลังลองใหม่…'); }
        else console.warn('[CLGDB]', e.code, e.message);
        Object.keys(st.subs).forEach(function (c) { st.subs[c].forEach(function (s) { if (!st.loaded[c] && s.err) s.err(e); }); });
      })
      .then(function () { st.busy = false; if (st.again) { st.again = false; schedule(50); } else schedule(); });
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(100); });

  function snap(c, q) {
    var m = st.data[c] || {};
    var docs = Object.keys(m).map(function (id) { var d = m[id]; return { id: id, exists: true, data: function () { return clone(d); }, ref: new Doc(c, id) }; });
    if (q && q.o) { var f = q.o[0], dir = q.o[1] === 'desc' ? -1 : 1; docs.sort(function (a, b) { var x = (m[a.id] || {})[f], y = (m[b.id] || {})[f]; return x === y ? 0 : (x > y ? dir : -dir); }); }
    if (q && q.l) docs = docs.slice(0, q.l);
    return { docs: docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false },
      forEach: function (fn) { docs.forEach(fn); } };
  }
  function emit(c) { (st.subs[c] || []).forEach(function (s) { try { s.fn(s.doc ? docSnap(c, s.doc) : snap(c, s.q)); } catch (e) { console.error(e); } }); }
  function docSnap(c, id) { var d = (st.data[c] || {})[id]; return { id: id, exists: !!d, data: function () { return d ? clone(d) : undefined; } }; }
  function sub(c, s) {
    (st.subs[c] = st.subs[c] || []).push(s);
    if (st.loaded[c]) setTimeout(function () { s.fn(s.doc ? docSnap(c, s.doc) : snap(c, s.q)); }, 0); else schedule(30);
    return function () { st.subs[c] = (st.subs[c] || []).filter(function (x) { return x !== s; }); };
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function autoId() { var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = ''; for (var i = 0; i < 20; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

  /* ---------- รูปแบบเดียวกับ Firestore ---------- */
  function Query(c, q) { this.c = c; this.q = q || {}; this.id = c; }
  Query.prototype.doc = function (id) { return new Doc(this.c, id || autoId()); };
  Query.prototype.orderBy = function (f, dir) { return new Query(this.c, { o: [f, dir], l: this.q.l }); };
  Query.prototype.limit = function (n) { return new Query(this.c, { o: this.q.o, l: n }); };
  Query.prototype.where = function () { throw mkErr('unsupported', 'where() ยังไม่รองรับ'); };
  Query.prototype.onSnapshot = function (fn, err) { return sub(this.c, { fn: fn, err: err, q: this.q }); };
  Query.prototype.get = function () {
    var self = this;
    return new Promise(function (res, rej) { var un = sub(self.c, { fn: function (s) { setTimeout(function () { un(); }, 0); res(s); }, err: rej, q: self.q }); });
  };
  function Doc(c, id) { this.c = c; this.id = id; this.path = c + '/' + id; }
  Doc.prototype.get = function () {
    var c = this.c, id = this.id;
    // ข้อมูลในเครื่องเพิ่งอัปเดต (ไม่เกิน 6 วิ) → ใช้เลย ไม่ต้องรอตัวกลาง (ตัวกลางรวมประวัติงานให้ไม่ทับกัน)
    if (st.loaded[c] && !pending && st.lastPull && Date.now() - st.lastPull < 6000) {
      var d0 = (st.data[c] || {})[id];
      return Promise.resolve({ id: id, exists: !!d0, data: function () { return d0 ? clone(d0) : undefined; } });
    }
    return api({ op: 'get', path: this.path }).then(function (r) {
      var m = st.data[c] || (st.data[c] = {});
      if (r.doc) m[id] = r.doc; else delete m[id];
      return { id: id, exists: !!r.doc, data: function () { return r.doc ? clone(r.doc) : undefined; } };
    });
  };
  Doc.prototype.set = function (d) { return this.c === 'photos' && d && /^data:/.test(d.dataRef || '') ? uploadPhoto(this, d) : write(this, 'set', d); };
  Doc.prototype.update = function (d) { return write(this, 'update', d); };
  Doc.prototype.delete = function () { return write(this, 'delete', null); };
  Doc.prototype.onSnapshot = function (fn, err) { return sub(this.c, { fn: fn, err: err, doc: this.id }); };

  // สถานะบันทึก (ผู้ใช้เลือกแบบ 2 · 23 พ.ย.): ไอคอนเมฆมุมขวาบน วงเขียววิ่งรอบระหว่างรอตัวกลาง ครบวง → เมฆติ๊กถูกสีเขียว แล้วจาง
  // บันทึกเร็ว (<0.3 วิ) ไม่โชว์ · พัง → หายเงียบ ให้ showErr ของหน้าเว็บบอก
  var pending = 0, pendT = null, svT = null, svOn = '';
  var SV_UP = '<path d="M7 18a4.6 4.4 0 0 1 0-9 5 4.5 0 0 1 10.9 2H18a3.5 3.5 0 0 1 0 7"/><path d="M9.5 15.5L12 13l2.5 2.5M12 13v7"/>';
  var SV_OK = '<path d="M7 18a4.6 4.4 0 0 1 0-9 5 4.5 0 0 1 10.9 2H18a3.5 3.5 0 0 1 0 7z"/><path d="M9.5 14.5l1.8 1.8 3.4-3.4"/>';
  function svShow(k) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('clg-sv');
    clearTimeout(svT); svOn = k;
    if (!k) { if (el) el.className = ''; return; }
    css();
    if (!el) { el = document.createElement('div'); el.id = 'clg-sv'; el.setAttribute('role', 'status'); el.innerHTML = '<svg class="rg" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" pathLength="100"/></svg><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"></svg>'; document.body.appendChild(el); }
    // หน้าเว็บที่มีปุ่มมุมขวาบน (Management: แถบไอคอนบนสุด) ใส่ data-svanchor → วางไว้ซ้ายของกลุ่มนั้น ไม่ทับรูปโปรไฟล์
    var an = document.querySelector('[data-svanchor]'), ar = null;
    if (an) [].some.call(an.querySelectorAll('*'), function (x) { var r = x.getBoundingClientRect(); if (r.width > 20 && r.height > 20) { ar = r; return true; } return false; });
    if (ar && ar.width) { el.style.top = Math.round(ar.top + (ar.height - 36) / 2) + 'px'; el.style.right = Math.round(innerWidth - ar.left + 8) + 'px'; }
    else { el.style.top = ''; el.style.right = ''; }
    var c = el.querySelector('circle');
    el.setAttribute('aria-label', k === 'ok' ? 'บันทึกแล้ว' : 'กำลังบันทึก');
    if (k === 'busy') {
      el.querySelector('.ic').innerHTML = SV_UP; el.className = '';
      c.style.transition = 'none'; c.style.strokeDasharray = '0 100'; void el.offsetWidth;
      el.className = 'on'; c.style.transition = 'stroke-dasharray 5s cubic-bezier(.15,.75,.3,1)'; c.style.strokeDasharray = '88 12';
    } else {
      c.style.transition = 'stroke-dasharray .35s ease-out'; c.style.strokeDasharray = '100 0';
      svT = setTimeout(function () { el.querySelector('.ic').innerHTML = SV_OK; el.className = 'on ok'; svT = setTimeout(function () { svOn = ''; el.className = 'ok'; }, 1300); }, 350);
    }
  }
  function saving(on, failed) {
    pending += on ? 1 : -1; if (pending < 0) pending = 0;
    clearTimeout(pendT);
    if (pending > 0) { if (svOn !== 'busy') pendT = setTimeout(function () { svShow('busy'); }, 300); }
    else if (svOn === 'busy') svShow(failed ? '' : 'ok');
  }
  function track(p) { saving(true); return p.then(function (r) { saving(false); return r; }, function (e) { saving(false, true); throw e; }); }
  // แสดงผลทันทีในเครื่อง (ไม่ต้องรอตัวกลาง) · ถ้าตัวกลางไม่ยอม → คืนค่าเดิม
  function localAfter(c, id, mode, data) {
    var cur = (st.data[c] || {})[id];
    if (mode === 'delete') return null;
    if (mode === 'set') return clone(data);
    var o = clone(cur) || {};
    Object.keys(data || {}).forEach(function (k) {
      if (k.indexOf('.') < 0) { o[k] = clone(data[k]); return; }
      var ks = k.split('.'), x = o; for (var i = 0; i < ks.length - 1; i++) { if (typeof x[ks[i]] !== 'object' || !x[ks[i]]) x[ks[i]] = {}; x = x[ks[i]]; } x[ks[ks.length - 1]] = clone(data[k]);
    });
    return o;
  }
  function optimistic(list) {
    var undo = [];
    list.forEach(function (w) {
      if (w.c === 'logs') return;
      var m = st.data[w.c] || (st.data[w.c] = {}), had = w.id in m;
      undo.push({ c: w.c, id: w.id, had: had, v: m[w.id] });
      var a = localAfter(w.c, w.id, w.mode, w.data);
      if (a) m[w.id] = a; else delete m[w.id];
    });
    var cs = {}; undo.forEach(function (u) { cs[u.c] = 1; }); Object.keys(cs).forEach(emit);
    return function () { undo.reverse().forEach(function (u) { var m = st.data[u.c] || {}; if (u.had) m[u.id] = u.v; else delete m[u.id]; }); Object.keys(cs).forEach(emit); };
  }
  function write(ref, mode, data) {
    var revert = (mode === 'update' && !((st.data[ref.c] || {})[ref.id])) ? function () {} : optimistic([{ c: ref.c, id: ref.id, mode: mode, data: data }]);
    return track(api({ op: 'write', mode: mode, path: ref.path, data: clone(data) })).then(function (r) {
      if (!r.skipped) applyLocal(ref.c, ref.id, r.doc, r.ver);
      schedule(300);
    }, function (e) { revert(); throw e; });
  }
  // เขียนหลายรายการครั้งเดียว (แบบ Firestore writeBatch)
  function Batch() { this.ops = []; }
  Batch.prototype.set = function (ref, d) { this.ops.push({ mode: 'set', path: ref.path, data: clone(d) }); return this; };
  Batch.prototype.update = function (ref, d) { this.ops.push({ mode: 'update', path: ref.path, data: clone(d) }); return this; };
  Batch.prototype.delete = function (ref) { this.ops.push({ mode: 'delete', path: ref.path, data: null }); return this; };
  Batch.prototype.commit = function () {
    var revert = optimistic(this.ops.map(function (o) { var a = o.path.split('/'); return { c: a[0], id: a[1], mode: o.mode, data: o.data }; }));
    return track(api({ op: 'batch', ops: this.ops })).catch(function (e) { revert(); throw e; }).then(function (r) {
      var cs = {};
      (r.results || []).forEach(function (x) { var a = x.path.split('/'); var m = st.data[a[0]] || (st.data[a[0]] = {});
        if (JSON.stringify(m[a[1]] || null) === JSON.stringify(x.doc || null)) return; cs[a[0]] = 1; if (x.doc) m[a[1]] = x.doc; else delete m[a[1]]; });
      Object.keys(cs).forEach(emit);
      schedule(300);
    });
  };
  function applyLocal(c, id, doc, ver) {
    var m = st.data[c] || (st.data[c] = {});
    if (JSON.stringify(m[id] || null) === JSON.stringify(doc || null)) return; // เหมือนที่แสดงไปแล้ว ไม่ต้องวาดใหม่
    if (doc) m[id] = doc; else delete m[id];
    emit(c);
  }
  // รูป: ส่งไฟล์เต็มไป Drive · เก็บรูปย่อไว้แสดงเร็ว
  function uploadPhoto(ref, d) {
    var full = d.dataRef, mime = (full.match(/^data:([^;,]+)/) || [])[1] || 'image/webp';
    saving(true);
    var pdf = mime === 'application/pdf'; // ใบงาน PDF: ไม่ทำรูปย่อ (ไม่เก็บไฟล์ในตาราง)
    return (pdf ? Promise.resolve('') : thumb(full, 360)).then(function (t) {
      var doc = clone(d); doc.dataRef = t;
      return api({ op: 'upload', path: ref.path, data: doc, b64: full.split(',')[1], mime: mime,
        name: d.fileName || ((d.kind || 'photo') + '-' + ref.id + (pdf ? '.pdf' : mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp')) });
    }).then(function (r) { saving(false); applyLocal('photos', ref.id, r.doc, r.ver); schedule(300); }, function (e) { saving(false); throw e; });
  }
  function thumb(src, max) {
    return new Promise(function (res) {
      if (typeof Image === 'undefined') return res(src);
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
        var out = cv.toDataURL('image/webp', 0.72); res(/^data:image\/webp/.test(out) ? out : cv.toDataURL('image/jpeg', 0.72));
      };
      im.onerror = function () { res(src); };
      im.src = src;
    });
  }

  var db = {
    collection: function (c) { return new Query(c); },
    doc: function (p) { var a = String(p).split('/'); return new Doc(a[0], a[1]); },
    batch: function () { return new Batch(); },
    // เพิ่มเติม (ไม่มีใน Firestore)
    file: function (fileId) { return api({ op: 'file', fileId: fileId }).then(function (r) { return 'data:' + r.mime + ';base64,' + r.b64; }); },
    folder: function (jobId) { return api({ op: 'folder', jobId: jobId }); },
    call: function (op, args) { var q = args || {}; q.op = op; return api(q); },
    refresh: function () { schedule(0); }
  };
  var user = {
    id: function () { return Promise.resolve(st.me && st.me.id); },
    isOwner: function () { return Promise.resolve(!!(st.me && st.me.owner)); },
    canEdit: function () { return Promise.resolve(!!(st.me && /^(sysadmin|admin)$/.test(st.me.role))); },
    profiles: function (ids) {
      var m = st.data.members || {}, out = {};
      (ids || []).forEach(function (id) { var x = m[id]; if (x) out[id] = { name: x.name || x.email || '', picture: x.photo || x.picture || '' }; else if (st.me && id === st.me.id) out[id] = { name: st.me.name, picture: st.me.picture }; });
      return Promise.resolve(out);
    },
    me: function () { return clone(st.me); },
    signOut: function () { signOut(''); }
  };

  /* ---------- จำข้อมูลไว้ในเครื่อง (IndexedDB) ----------
   * เปิดแอปครั้งถัดไป: แสดงข้อมูลชุดล่าสุดทันที แล้วดึงจากตัวกลางเฉพาะที่เปลี่ยน (ไม่ต้องโหลดใหม่ทั้งหมดทุกครั้ง)
   * ผูกกับหน้า + บัญชี + บทบาท · ตัวกลางเปลี่ยน epoch = ล้างแล้วโหลดใหม่ · ออกจากระบบ = ลบทิ้ง */
  var IDB = 'cl-cache', ISTORE = 'snap', CACHE_DAYS = 7;
  function idb() {
    if (idb.p) return idb.p;
    idb.p = new Promise(function (res) {
      try {
        var r = indexedDB.open(IDB, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(ISTORE); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = r.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
    return idb.p;
  }
  function cacheKey() { return st.me ? st.page + ':' + st.me.id + ':' + (st.me.role || '') : null; }
  function cacheLoad() {
    var k = cacheKey(); if (!k) return Promise.resolve(false);
    return idb().then(function (d) {
      if (!d) return false;
      return new Promise(function (res) {
        try {
          var q = d.transaction(ISTORE, 'readonly').objectStore(ISTORE).get(k);
          q.onsuccess = function () {
            var c = q.result;
            if (!c || !c.data || Date.now() - (c.at || 0) > CACHE_DAYS * 864e5) return res(false);
            st.data = c.data; st.ver = c.ver || {}; st.epoch = c.epoch || null;
            Object.keys(c.data).forEach(function (col) { st.loaded[col] = true; });
            st.fromCache = true;
            res(true);
          };
          q.onerror = function () { res(false); };
        } catch (e) { res(false); }
      });
    });
  }
  function cacheSave() {
    clearTimeout(cacheSave.t);
    cacheSave.t = setTimeout(function () {
      var k = cacheKey(); if (!k) return;
      idb().then(function (d) {
        if (!d) return;
        try { d.transaction(ISTORE, 'readwrite').objectStore(ISTORE).put({ data: st.data, ver: st.ver, epoch: st.epoch, at: Date.now() }, k); } catch (e) {}
      });
    }, 1500);
  }
  function cacheClear() {
    clearTimeout(cacheSave.t);
    return idb().then(function (d) { if (!d) return; try { d.transaction(ISTORE, 'readwrite').objectStore(ISTORE).clear(); } catch (e) {} });
  }

  /* ---------- เข้าสู่ระบบด้วย Google ---------- */
  function connect(page) {
    st.page = page;
    try { var s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s && s.exp > Date.now()) st.token = s.token; } catch (e) {}
    return (st.token ? api({ op: 'me' }).then(function (r) { st.wait = r.wait; return r.me; }).catch(function (e) { if (e && e.code === 'network') throw e; st.token = null; return null; }) : Promise.resolve(null))   // เน็ตหลุด: เก็บการเข้าสู่ระบบไว้ ให้หน้าเว็บขึ้น "เชื่อมต่อไม่ได้ · ลองอีกครั้ง" (เดิมลบทิ้งแล้วเด้งไปลงชื่อใหม่)
      .then(function (me) { return me || signIn(); })
      .then(function (me) { return gate(me); });
  }
  function gate(me) {
    st.me = me;
    if (me.pending) { st.wasPending = 1; return screen('pending').then(function () { return api({ op: 'me' }).then(function (r) { st.wait = r.wait; return gate(r.me); }); }); }
    if ((me.pages || []).indexOf(st.page) < 0) return screen('wrong', me).then(function () { return gate(me); });
    var ret = { db: db, user: user, me: clone(me) };
    return cacheLoad().then(function () {
      if (st.page === 'admin') { remember(me); if (st.wasPending || st.stepping) { stepsRun(me); schedule(0); return ret; } }
      hideScreen(); schedule(0);
      return ret;
    });
  }
  function signIn(msg) {
    return loadGis().then(function () {
      return new Promise(function (res) {
        google.accounts.id.initialize({ client_id: CFG.clientId, auto_select: true, cancel_on_tap_outside: false, ux_mode: 'popup',
          callback: function (resp) {
            setScreenMsg('กำลังตรวจสอบบัญชี…');
            st.token = null;
            if (st.page === 'admin') { st.stepping = 1; stepsShow(1); }
            api({ op: 'login', idToken: resp.credential }).then(function (r) {
              st.token = r.token; st.wait = r.wait;
              try { localStorage.setItem(SKEY, JSON.stringify({ token: r.token, exp: Date.now() + 5.5 * 3600e3 })); } catch (e) {}
              res(r.me);
            }).catch(function (e) { if (st.stepping) { st.stepping = 0; screen('login', null, e.message); renderGBtn(); } else setScreenMsg(e.message, true); });
          } });
        screen('login', null, msg);
        renderGBtn();
        google.accounts.id.prompt();
      });
    });
  }
  function renderGBtn() {
    var b = document.getElementById('clg-btn');
    if (b && window.google && google.accounts) google.accounts.id.renderButton(b, { theme: 'filled_black', size: 'large', shape: 'pill', text: st.page === 'admin' && lastAcct() ? 'continue_with' : 'signin_with', locale: 'th', width: st.page === 'engineer' ? Math.max(240, Math.min(400, (window.innerWidth || 360) - 56)) : st.page === 'admin' ? Math.min(320, (window.innerWidth || 360) - 48) : 300 });
  }
  /* ---------- Management: จำคนที่เคยเข้า · บอกขั้นตอนตอนเข้า · รออนุมัติ ---------- */
  var AKEY = 'cl.acct';
  function lastAcct() { try { var a = JSON.parse(localStorage.getItem(AKEY) || 'null'); return a && a.name ? a : null; } catch (e) { return null; } }
  function remember(me) { try { localStorage.setItem(AKEY, JSON.stringify({ name: me.name || '', email: me.email || '', picture: me.picture || '' })); } catch (e) {} }
  function forget() { try { localStorage.removeItem(AKEY); } catch (e) {} }
  function maskMail(m) { m = String(m || ''); var i = m.indexOf('@'); return i > 0 ? m.slice(0, 1) + '•••' + m.slice(i) : m; }
  function avHtml(a, cls) { return '<span class="mg-av ' + (cls || '') + '">' + (a.picture ? '<img alt="" src="' + esc(a.picture) + '" onerror="this.remove()">' : '') + esc(String(a.name || '?').slice(0, 1)) + '</span>'; }
  var STEPS = ['ยืนยันบัญชี Google', 'เชื่อมต่อตัวกลาง', 'โหลดงาน', 'เตรียมหน้าภาพรวม'];
  function stepsShow(n, cnt) {
    var el = document.getElementById('clg'), box = el && el.querySelector('.mg-in');
    if (!box) return;
    if (!box.querySelector('.mg-st')) {
      box.innerHTML = '<div class="mg-h" role="heading" aria-level="1">กำลังเข้า…</div><p class="mg-s">แป๊บเดียว กำลังเตรียมงานของคุณ</p><ol class="mg-st" aria-live="polite">' +
        STEPS.map(function (t, i) { return '<li><i></i>' + t + (i === 2 ? '<small></small>' : '') + '</li>'; }).join('') + '</ol><div class="mg-bar"><i></i></div>';
    }
    box.querySelectorAll('.mg-st li').forEach(function (li, i) { li.className = i < n ? 'mg-ok' : i === n ? 'mg-now' : ''; });
    if (cnt != null) box.querySelector('.mg-st small').textContent = cnt + ' งาน';
    box.querySelector('.mg-bar i').style.width = Math.min(100, n / STEPS.length * 100) + '%';
  }
  function stepsRun(me) {
    stepsShow(2); var t0 = Date.now();
    (function wait() {
      if (!document.getElementById('clg')) return;
      if (!st.loaded.jobs && Date.now() - t0 < 12000) return setTimeout(wait, 150);
      stepsShow(3, Object.keys(st.data.jobs || {}).length);
      setTimeout(function () {
        stepsShow(4);
        var box = document.querySelector('#clg .mg-in');
        var t = new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
        if (box) box.innerHTML = '<div class="mg-h" role="heading" aria-level="1">สวัสดี คุณ' + esc(me.name || '') + '</div><p class="mg-s">กำลังพาไปหน้าภาพรวม</p>' +
          '<p class="mg-rec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>บันทึกเข้าระบบ <b>' + p2(t.getHours()) + ':' + p2(t.getMinutes()) + '</b> น.</p>';
        setTimeout(function () { var el = document.getElementById('clg'); st.stepping = 0; st.wasPending = 0; if (!el) return; el.classList.add('mg-out'); setTimeout(hideScreen, 320); }, 1400);
      }, 350);
    })();
  }
  var TH_DW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'], TH_MO = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  function thDate(d) { return 'วัน' + TH_DW[d.getDay()] + 'ที่ ' + d.getDate() + ' ' + TH_MO[d.getMonth()] + ' ' + (d.getFullYear() + 543); }
  /* หน้าเข้าสู่ระบบ Management (แบบ J): นาฬิกาเดินตามเวลาจริง */
  function mgLive() {
    var root = document.getElementById('clg'); if (!root || root.className !== 'mg') return;
    var ck = root.querySelector('.mg-ck'), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var draw = function () { if (!document.body.contains(ck)) return clearInterval(iv); var n = new Date(); ck.innerHTML = p2(n.getHours()) + '<s>' + (n.getSeconds() % 2 ? ':' : '\u00a0') + '</s>' + p2(n.getMinutes()); };
    var iv = setInterval(draw, 500); draw();
  }
  function hhmm(ms) { var d = new Date(ms), p = function (x) { return (x < 10 ? '0' : '') + x; }; var t = new Date(); return (d.toDateString() === t.toDateString() ? 'วันนี้ ' : d.getDate() + '/' + (d.getMonth() + 1) + ' ') + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function signOut(msg) {
    st.token = null; st.me = null; st.data = {}; st.ver = {}; st.loaded = {};
    try { localStorage.removeItem(SKEY); } catch (e) {}
    cacheClear();
    try { window.google && google.accounts.id.disableAutoSelect(); } catch (e) {}
    clearTimeout(st.timer);
    if (msg !== undefined && typeof document !== 'undefined') { signIn(msg).then(function () { location.reload(); }); }
  }
  function loadGis() {
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = res; s.onerror = function () { rej(mkErr('network', 'โหลดปุ่มเข้าสู่ระบบของ Google ไม่ได้')); };
      document.head.appendChild(s);
    });
  }

  /* ---------- หน้าจอเข้าสู่ระบบ / รออนุมัติ / ผิดหน้า ----------
   * ฉากบ้านติดแผงโซลาร์ · ดวงอาทิตย์อยู่ตามเวลาจริงของเครื่อง (กลางคืน = พระจันทร์ + ดาว)
   * จอกว้าง: ฉากซ้าย การ์ดขวา · มือถือ: ฉากบน การ์ดล่าง */
  var PAGE_TAG = { admin: 'จัดคิวสำรวจ ติดตามงาน ดูแลลูกค้า', engineer: 'งานสำรวจและติดตั้งของคุณ ครบในมือถือ', console: 'ตั้งค่าระบบและผู้ใช้' };
  function css() {
    if (document.getElementById('clg-css')) return;
    var s = document.createElement('style'); s.id = 'clg-css';
    s.textContent =
      '#clg{position:fixed;inset:0;z-index:99999;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(380px,1fr);background:#fff;color:#15230f;' +
        'font-family:Inter,"Noto Sans Thai",Prompt,Sarabun,system-ui,sans-serif;overflow-y:auto}' +
      '#clg .cg-sc{position:relative;margin:14px 0 14px 14px;border-radius:28px;overflow:hidden;min-height:320px;background:#6fb6ea}' +
      '#clg .cg-sc svg{position:absolute;inset:0;width:100%;height:100%;display:block}' +
      '#clg .cg-hi{position:absolute;left:clamp(22px,4vw,48px);top:clamp(22px,5vh,52px);color:#fff;text-shadow:0 1px 18px rgba(10,30,60,.25)}' +
      '#clg .cg-hi b{display:block;font-size:clamp(30px,4.2vw,54px);font-weight:700;letter-spacing:-.02em;line-height:1.08}' +
      '#clg .cg-hi span{display:block;margin-top:8px;font-size:15px;opacity:.92}' +
      '#clg .cg-bx{display:flex;flex-direction:column;justify-content:center;padding:48px clamp(28px,5vw,76px);max-width:520px;width:100%;box-sizing:border-box}' +
      '#clg .cg-lg{height:22px;width:auto;align-self:flex-start;margin:0 0 30px}#clg .cg-lgt{font-weight:800;letter-spacing:.12em;color:#5d6466;margin:0 0 30px}' +
      '#clg .cg-h{font-size:46px;font-weight:700;letter-spacing:-.025em;line-height:1.02;margin:0}' +
      '#clg .cg-tg{font-size:16px;color:#5b6656;margin:10px 0 34px;line-height:1.5}' +
      '#clg .cg-p{font-size:15px;line-height:1.6;margin:0 0 14px;color:#3a4535}' +
      '#clg .cg-m{min-height:22px;font-size:14px;color:#3a4535;margin-top:4px}#clg .cg-m.bad{color:#b3261e}' +
      '#clg .b{display:inline-block;border:0;border-radius:999px;padding:12px 22px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;background:#15230f;color:#fff;text-decoration:none;margin:4px 8px 4px 0}' +
      '#clg .b.l{background:#eef2e6;color:#15230f}#clg .b:focus-visible{outline:3px solid #8cc63f;outline-offset:2px}' +
      '#clg .cg-who{display:flex;gap:12px;align-items:center;margin:0 0 18px}#clg .cg-av{width:48px;height:48px;border-radius:50%;background:#eef2e6;flex:none}' +
      '#clg .cg-who b{display:block;font-size:16px}#clg .cg-who span{font-size:13px;color:#6b7566}' +
      '#clg-btn{display:flex;justify-content:flex-start;min-height:44px;margin:4px 0 6px}' +
      '#clg .cg-ft{margin-top:46px;font-size:13px;color:#8a9484}' +
      '@media (max-width:820px){#clg{grid-template-columns:1fr;grid-template-rows:minmax(300px,46vh) auto}' +
        '#clg .cg-sc{margin:10px 10px 0;border-radius:24px}#clg .cg-bx{padding:30px 26px 34px;max-width:none}#clg .cg-h{font-size:38px}#clg .cg-lg{margin-bottom:22px}#clg .cg-ft{margin-top:28px}}' +
      '#clg.man{display:block;background:radial-gradient(120% 60% at 50% 0%,#b5e54a 0%,#93d209 55%,#84c40b 100%);font-family:Prompt,"Noto Sans Thai",Inter,system-ui,sans-serif;color:#16171d;overflow-x:hidden}' +
      '#clg.man .cm{position:relative;min-height:100%;max-width:520px;margin:0 auto;display:flex;flex-direction:column}' +
      '#clg.man .cm-bl{position:absolute;border-radius:50%;background:rgba(255,255,255,.22);pointer-events:none}' +
      '#clg.man .cm-top{position:relative;flex:1;min-height:300px;display:flex;align-items:flex-end;justify-content:center;padding-top:max(24px,env(safe-area-inset-top))}' +
      '#clg.man .cm-m{position:relative;z-index:2;width:min(78vw,330px);height:auto;margin-bottom:-34px;transform:rotate(-3deg);filter:drop-shadow(0 10px 0 rgba(22,23,29,.10));animation:cmHop 2.4s ease-in-out infinite}' +
      '@keyframes cmHop{0%,100%{transform:rotate(-3deg) translateY(0)}50%{transform:rotate(-1deg) translateY(-8px)}}' +
      '@media (prefers-reduced-motion:reduce){#clg.man .cm-m{animation:none}}' +
      '#clg.man .cm-sh{position:relative;z-index:1;background:#fbf7ec;border-radius:36px 36px 0 0;border-top:3px solid #16171d;padding:30px 28px calc(28px + env(safe-area-inset-bottom))}' +
      '#clg.man .cm-chip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:2px solid #16171d;border-radius:99px;padding:4px 12px;font-size:13px;font-weight:600}' +
      '#clg.man .cm-chip img{height:11px;width:auto}' +
      '#clg.man .cm-h{font-size:28px;font-weight:600;line-height:1.25;margin:12px 0 6px}' +
      '#clg.man .cm-s{font-size:15.5px;color:#4b4f59;margin:0 0 22px;line-height:1.5}' +
      '#clg.man #clg-btn{justify-content:center;margin:0 0 4px}#clg.man .cg-m{text-align:center}' +
      '#clg.man .cm-ft{margin-top:10px;font-size:12.5px;color:#6b6f7b;text-align:center}' +
      '#clg.man .cg-p{font-size:15px;color:#3a3d47}#clg.man .b{background:#16171d}#clg.man .b.l{background:#eceee8;color:#16171d}' +
      '#clg.mg{display:block;overflow:auto;background:#fff;color:#16171d;font-family:"Noto Sans Thai Looped","Noto Sans Thai",Inter,system-ui,sans-serif}' +
      '#clg.mg .mg-c{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:100vh}' +
      '#clg.mg .mg-art{position:relative;background:#16171d;color:#fff;overflow:hidden;min-height:560px}' +
      '#clg.mg .mg-art::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 50% at 25% 75%,rgba(147,210,9,.13),transparent 70%)}' +
      '#clg.mg .mg-lg{position:absolute;left:64px;top:64px;height:24px;width:auto;filter:brightness(0) invert(1)}' +
      '#clg.mg .mg-ck{position:absolute;left:56px;bottom:128px;font-size:clamp(96px,13vw,168px);font-weight:600;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;font-family:"Inter Tight",Inter,system-ui,sans-serif}' +
      '#clg.mg .mg-ck s{text-decoration:none;opacity:.35}' +
      '#clg.mg .mg-dt{position:absolute;left:64px;bottom:88px;margin:0;font-size:20px;color:#a7ae9c}' +
      '#clg.mg .mg-ft{position:absolute;left:64px;bottom:40px;margin:0;font-size:13px;color:#6d7466}' +
      '#clg.mg .mg-f{position:relative;display:flex;align-items:center;justify-content:center;padding:64px}' +
      '#clg.mg .mg-in{width:100%;max-width:400px}' +
      '#clg.mg .mg-k{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.08em;color:#3d7c0e}' +
      '#clg.mg .mg-h{font-size:44px;line-height:1.15;font-weight:700;letter-spacing:-.01em}' +
      '#clg.mg .mg-s{margin:12px 0 40px;font-size:18px;line-height:1.5;color:#606f85}' +
      '#clg.mg #clg-btn{justify-content:flex-start;margin:0}#clg.mg .cg-m{margin-top:12px}' +
      '#clg.mg .mg-hp{position:absolute;right:64px;bottom:40px;margin:0;font-size:13px;color:#8a909a}' +
      '#clg.mg .mg-rec{display:flex;align-items:center;gap:10px;margin:0;padding:12px 14px;border-radius:12px;background:#f1f8e6;color:#2f5f0a;font-weight:600}#clg.mg .mg-rec svg{width:20px;height:20px;flex:none}#clg.mg .mg-rec b{font-variant-numeric:tabular-nums;margin:0 2px}' +
      '#clg.mg .cg-p{font-size:14px;color:#3a3d47}#clg.mg .b{background:#16171d}#clg.mg .b.l{background:#eeefea;color:#16171d}' +
      '#clg.mg{transition:opacity .3s ease}#clg.mg.mg-out{opacity:0}' +
      '#clg.mg .mg-av{flex:none;position:relative;overflow:hidden;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#b6e36b,#458c10);color:#fff;display:grid;place-items:center;font-weight:700;font-size:20px}#clg.mg .mg-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}#clg.mg .mg-av.sm{width:32px;height:32px;font-size:14px}' +
      '#clg.mg .mg-ac{position:relative;display:flex;align-items:center;gap:12px;padding:12px 44px 12px 12px;border-radius:20px;border:1px solid #e6e8ec;margin-bottom:16px}#clg.mg .mg-ac b,#clg.mg .mg-me b{display:block;font-size:16px}#clg.mg .mg-ac small,#clg.mg .mg-me small{display:block;font-size:13px;color:#606f85;overflow-wrap:anywhere}' +
      '#clg.mg .mg-x{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:50%;background:none;color:#6b7280;font-size:20px;cursor:pointer}#clg.mg .mg-x:hover{background:#f1f2f4}' +
      '#clg.mg .mg-lk{display:block;margin:4px 0 0;min-height:44px;padding:0;border:0;background:none;color:#3d7c0e;font:600 14px inherit;font-family:inherit;cursor:pointer}' +
      '#clg.mg .mg-st{list-style:none;margin:8px 0 20px;padding:0;display:grid;gap:12px}#clg.mg .mg-st li{display:flex;align-items:center;gap:12px;font-size:15px;color:#8a909a}#clg.mg .mg-st li.mg-now,#clg.mg .mg-st li.mg-ok{color:#16171d}#clg.mg .mg-st li.mg-now{font-weight:500}#clg.mg .mg-st small{margin-left:auto;font-size:13px;color:#606f85}' +
      '#clg.mg .mg-st i,#clg.mg .mg-tl i{flex:none;width:24px;height:24px;border-radius:50%;border:2px solid #d9dce2;background:#fff;display:grid;place-items:center;box-sizing:border-box;position:relative;z-index:1}' +
      '#clg.mg .mg-st li.mg-now i{border-color:#458c10;border-top-color:transparent;animation:mgSp .8s linear infinite}#clg.mg li.mg-ok i{background:#458c10;border-color:#458c10}#clg.mg li.mg-ok i::after{content:"";width:9px;height:5px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) translate(1px,-1px)}' +
      '@keyframes mgSp{to{transform:rotate(360deg)}}#clg.mg .mg-bar{height:6px;border-radius:3px;background:#eceef2;overflow:hidden}#clg.mg .mg-bar i{display:block;height:100%;width:0;background:#458c10;border-radius:3px;transition:width .4s cubic-bezier(.23,1,.32,1)}' +
      '#clg.mg .mg-me{display:flex;align-items:center;gap:12px;padding:12px;border-radius:16px;background:#f6f7f9;margin-bottom:16px}' +
      '#clg.mg .mg-tl{list-style:none;margin:0 0 16px;padding:0}#clg.mg .mg-tl li{display:grid;grid-template-columns:24px 1fr;gap:12px;padding-bottom:14px;position:relative;font-size:15px}#clg.mg .mg-tl li::before{content:"";position:absolute;left:11px;top:26px;bottom:2px;width:2px;background:#e3e6dd}#clg.mg .mg-tl li:last-child::before{display:none}#clg.mg .mg-tl small{display:block;font-size:13px;color:#606f85}' +
      '#clg.mg .mg-tl li.mg-now i{border-color:#458c10}#clg.mg .mg-tl li.mg-now i::after{content:"";width:10px;height:10px;border-radius:50%;background:#458c10;animation:mgPl 1.6s ease-in-out infinite}@keyframes mgPl{0%,100%{transform:scale(.7);opacity:.6}50%{transform:scale(1.15);opacity:1}}' +
      '#clg.mg .mg-who{display:flex;align-items:center;margin-top:6px}#clg.mg .mg-who .mg-av{width:28px;height:28px;font-size:12px;border:2px solid #fff;margin-left:-6px}#clg.mg .mg-who .mg-av:first-child{margin-left:0}#clg.mg .mg-who small{margin-left:8px}' +
      '#clg.mg .mg-auto{display:flex;align-items:center;gap:10px;margin-bottom:16px}#clg.mg .mg-auto svg{width:20px;height:20px;transform:rotate(-90deg);flex:none}#clg.mg .mg-auto circle{fill:none;stroke-width:3}#clg.mg .mg-auto .cg-m{margin:0;font-size:13px;color:#606f85}' +
      '#clg.mg .mg-row{display:flex;gap:8px}#clg.mg .mg-row .b{flex:1;margin:0}' +
      '#clg.mg .mg-cp{display:flex;align-items:center;justify-content:center;width:100%;margin-top:12px;min-height:44px;border:1px dashed #cfd4c8;border-radius:12px;background:none;color:#3d7c0e;font:600 14px inherit;font-family:inherit;cursor:pointer}#clg.mg .mg-cp.mg-cpok{border-style:solid;background:#eef7e2}' +
      '@media (prefers-reduced-motion:reduce){#clg.mg .mg-st li.mg-now i,#clg.mg .mg-tl li.mg-now i::after{animation:none}#clg.mg,#clg.mg .mg-bar i{transition:none}}' +
      '@media (max-width:760px){#clg.mg .mg-c{grid-template-columns:1fr;grid-template-rows:320px 1fr}#clg.mg .mg-art{min-height:0}#clg.mg .mg-lg{left:24px;top:28px;height:20px}#clg.mg .mg-ck{left:20px;bottom:64px;font-size:96px}#clg.mg .mg-dt{left:24px;bottom:32px;font-size:16px}#clg.mg .mg-ft{display:none}#clg.mg .mg-f{align-items:flex-start;padding:40px 24px 72px}#clg.mg .mg-in{max-width:none}#clg.mg .mg-h{font-size:32px}#clg.mg .mg-s{font-size:16px;margin:8px 0 32px}#clg.mg .mg-hp{left:0;right:0;bottom:24px;text-align:center}}' +
      '#clg-sv{position:fixed;top:calc(env(safe-area-inset-top,0px) + var(--sv-top,12px));right:var(--sv-right,12px);z-index:99998;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.92);color:#8a909a;pointer-events:none;opacity:0;transform:scale(.85);transition:opacity .25s,transform .25s,color .3s}' +
      '#clg-sv.on{opacity:1;transform:none}#clg-sv.ok{color:#3d7c0e}#clg-sv.ok:not(.on){transition:opacity .6s,transform .6s}' +
      '#clg-sv .rg{position:absolute;inset:0;width:36px;height:36px;transform:rotate(-90deg)}#clg-sv circle{fill:none;stroke:#3d7c0e;stroke-width:1.8;stroke-linecap:round;stroke-dasharray:0 100}' +
      '#clg-sv .ic{position:absolute;left:8px;top:8px;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}' +
      '@media (prefers-reduced-motion:reduce){#clg-sv,#clg-sv circle{transition:none!important}}' +
      '#clg-bn{position:fixed;right:20px;bottom:20px;z-index:99998;background:#f0b23a;color:#15230f;border-radius:999px;padding:8px 16px;font:600 14px Inter,"Noto Sans Thai",Prompt,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.15);max-width:92vw;text-align:center}';
    document.head.appendChild(s);
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // เวลาตอนนี้ → ตำแหน่งดวงอาทิตย์บนโค้ง (0 = ขึ้น 06:00, 1 = ตก 18:30) · นอกช่วง = กลางคืน
  function sunNow() {
    var d = new Date(), h = d.getHours() + d.getMinutes() / 60, t = (h - 6) / 12.5;
    return { t: t, night: t < 0 || t > 1, hh: ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2), h: h };
  }
  function mix(a, b, k) {
    var x = function (c, i) { return parseInt(c.substr(1 + i * 2, 2), 16); };
    return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(x(a, i) + (x(b, i) - x(a, i)) * k).toString(16)).slice(-2); }).join('');
  }
  var ARC = { x0: 140, y0: 520, cx: 400, cy: 60, x1: 660 };
  function arcAt(t) { var u = 1 - t; return { x: u * u * ARC.x0 + 2 * u * t * ARC.cx + t * t * ARC.x1, y: u * u * ARC.y0 + 2 * u * t * ARC.cy + t * t * ARC.y0 }; }
  function sceneSvg(sn) {
    var night = sn.night, alt = night ? 0 : Math.sin(Math.PI * sn.t);
    var top = night ? '#0e1d33' : mix('#8fb9e6', '#5aa7e6', alt), bot = night ? '#24406a' : mix('#fbcf8a', '#dff0fb', Math.min(1, alt * 1.6));
    var hill = night ? '#28452a' : mix('#a9c98a', '#bfe0a0', alt), hill2 = night ? '#1f381f' : mix('#8fb874', '#a7d488', alt);
    var wall = night ? '#c9d2dc' : '#f4f6f8', roof = night ? '#3b4654' : '#56616e';
    var p = arcAt(night ? 0.5 : sn.t), stars = '';
    if (night) [[90, 70], [180, 140], [260, 60], [520, 90], [610, 170], [700, 60], [380, 120], [150, 230], [660, 260], [460, 40]].forEach(function (s, i) {
      stars += '<circle cx="' + s[0] + '" cy="' + s[1] + '" r="' + (i % 3 ? 1.6 : 2.4) + '" fill="#fff" opacity="' + (i % 2 ? .7 : .95) + '"/>';
    });
    // หลังคาหันหน้า (สี่เหลี่ยมคางหมู) + แผง 6×2 วางบนหลังคาแบบมีมุมมอง
    var R = { tl: 46, tr: 244, bl: 0, br: 290, ty: 388, by: 456 };
    var pt = function (u, v) { var l = R.tl + (R.bl - R.tl) * v, r = R.tr + (R.br - R.tr) * v; return (l + (r - l) * u).toFixed(1) + ',' + (R.ty + (R.by - R.ty) * v).toFixed(1); };
    var cells = '';
    for (var r = 0; r < 2; r++) for (var c = 0; c < 6; c++) {
      var u0 = .1 + c * .135, u1 = u0 + .125, v0 = .14 + r * .38, v1 = v0 + .34;
      cells += '<polygon points="' + [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)].join(' ') + '" fill="#1d3554" stroke="#7d9cc0" stroke-width="1"/>';
    }
    var band = '<polygon id="clg-shine" points="' + [pt(.18, 0), pt(.36, 0), pt(.26, 1), pt(.08, 1)].join(' ') + '" fill="#fff" opacity="' + (alt * .32).toFixed(2) + '"/>';
    return '<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
      '<defs><linearGradient id="clgsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + bot + '"/></linearGradient>' +
      '<mask id="clgmoon"><rect x="-40" y="-40" width="80" height="80" fill="#fff"/><circle cx="10" cy="-7" r="19" fill="#000"/></mask>' +
      '<radialGradient id="clgglow"><stop offset="0" stop-color="' + (night ? '#e8eef8' : '#ffd36b') + '" stop-opacity="' + (night ? .22 : .55) + '"/><stop offset="1" stop-color="' + (night ? '#e8eef8' : '#ffd36b') + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="clgshine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<rect width="800" height="600" fill="url(#clgsky)"/>' + stars +
      '<path d="M' + ARC.x0 + ',' + ARC.y0 + ' Q' + ARC.cx + ',' + ARC.cy + ' ' + ARC.x1 + ',' + ARC.y0 + '" fill="none" stroke="#fff" stroke-opacity="' + (night ? .18 : .45) + '" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round"/>' +
      '<g id="clg-sun" transform="translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')"><circle r="74" fill="url(#clgglow)"/>' +
        (night ? '<circle r="22" fill="#f1f4f9" mask="url(#clgmoon)"/>' : '<circle r="25" fill="#f8b73a"/><circle r="25" fill="none" stroke="#ffe3a3" stroke-width="3" opacity=".7"/>') +
        (night ? '' : '<text y="' + (p.y > 420 ? -40 : 52) + '" text-anchor="middle" font-size="15" font-weight="600" fill="#fff" style="font-family:inherit">' + sn.hh + '</text>') + '</g>' +
      '<path d="M0,520 C140,486 260,500 400,512 C540,524 660,492 800,500 L800,600 L0,600Z" fill="' + hill2 + '"/>' +
      '<path d="M0,548 C160,522 300,540 420,546 C560,552 680,530 800,538 L800,600 L0,600Z" fill="' + hill + '"/>' +
      '<g transform="translate(250,0)">' +
        '<circle cx="-60" cy="488" r="34" fill="' + (night ? '#244a2a' : '#5f9a3c') + '"/><circle cx="-34" cy="470" r="26" fill="' + (night ? '#2c5631' : '#74b04a') + '"/><rect x="-50" y="500" width="7" height="44" fill="#6b5338"/>' +
        '<rect x="20" y="452" width="250" height="96" fill="' + wall + '"/>' +
        '<rect x="54" y="478" width="44" height="34" rx="3" fill="' + (night ? '#f7d27a' : '#a9c7e3') + '"/><rect x="186" y="478" width="44" height="34" rx="3" fill="' + (night ? '#f7d27a' : '#a9c7e3') + '"/>' +
        '<rect x="122" y="490" width="34" height="58" rx="3" fill="' + (night ? '#5b4a3a' : '#8a6b4c') + '"/>' +
        '<polygon points="' + [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)].join(' ') + '" fill="' + roof + '"/>' +
        '<polygon points="' + [pt(0, 1), pt(1, 1), (R.br - 4) + ',' + (R.by + 6), (R.bl + 4) + ',' + (R.by + 6)].join(' ') + '" fill="' + (night ? '#2a323d' : '#3d4651') + '"/>' +
        '<clipPath id="clgroof"><polygon points="' + [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)].join(' ') + '"/></clipPath>' +
        cells + '<g clip-path="url(#clgroof)">' + band + '</g>' +
      '</g></svg>';
  }
  function greet(h) { return h < 4.5 ? 'ดึกแล้ว' : h < 12 ? 'สวัสดีตอนเช้า' : h < 16.5 ? 'สวัสดีตอนบ่าย' : h < 19 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนค่ำ'; }
  function skyLine(sn) { return sn.night ? 'ตอนนี้ ' + sn.hh + ' แผงพัก รอแดดพรุ่งนี้' : 'ตอนนี้ ' + sn.hh + (Math.sin(Math.PI * sn.t) > .6 ? ' แดดกำลังดี' : ''); }
  // ดวงอาทิตย์ขึ้นจากขอบฟ้ามาที่ตำแหน่งตอนนี้ (ครั้งเดียวตอนเปิด)
  function riseSun(sn) {
    if (sn.night) return;
    try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
    var g = document.getElementById('clg-sun'), sh = document.getElementById('clg-shine'); if (!g || !window.requestAnimationFrame) return;
    var t0 = null, dur = 1500;
    function f(ts) {
      if (!document.getElementById('clg-sun')) return;
      t0 = t0 || ts; var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3), t = sn.t * e, q = arcAt(t);
      g.setAttribute('transform', 'translate(' + q.x.toFixed(1) + ',' + q.y.toFixed(1) + ')');
      if (sh) sh.setAttribute('opacity', (Math.sin(Math.PI * t) * .32).toFixed(2));
      if (k < 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  }
  function screen(kind, me, msg) {
    css();
    var el = document.getElementById('clg') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'clg' }));
    var sn = sunNow(), nm = (PAGE_NAME[st.page] || 'CLEANLINE').replace('CLEANLINE ', '');
    var frame = function (body) {
      return '<div class="cg-sc">' + sceneSvg(sn) + '<div class="cg-hi"><b>' + greet(sn.h) + '</b><span>' + esc(skyLine(sn)) + '</span></div></div>' +
        '<div class="cg-bx"><img class="cg-lg" src="logo.webp" alt="CLEANLINE" onerror="this.outerHTML=\'<div class=cg-lgt>CLEANLINE</div>\'">' +
        '<div class="cg-h" role="heading" aria-level="1">' + esc(nm) + '</div><div class="cg-tg">' + esc(PAGE_TAG[st.page] || '') + '</div>' + body +
        '<div class="cg-ft">แผนก Energy เพาเวอร์เมติค</div></div>';
    };
    if (st.page === 'admin') {   // Management: การ์ดกลางจอ ภาพมาสคอตซ้าย ฟอร์มขวา (ตามภาพอ้างอิงจากผู้ใช้ 20 พ.ย.)
      el.className = 'mg';
      var LA = kind === 'login' && lastAcct();
      var HM = { login: LA ? ['ยินดีต้อนรับกลับ', 'เครื่องนี้เคยเข้าในชื่อนี้'] : ['เข้าสู่ระบบ', 'ใช้บัญชี Google ของบริษัท'], pending: ['อีกนิดเดียว', 'ส่งคำขอเข้าใช้แล้ว รออนุมัติบัญชีนี้'], wrong: ['บัญชีนี้ใช้ Management ไม่ได้', 'ลองเปลี่ยนบัญชี หรือไปหน้าที่บัญชีนี้ใช้ได้'] };
      frame = function (body) {
        var hd = HM[kind] || HM.login;
        return '<div class="mg-c"><div class="mg-art"><img class="mg-lg" src="logo.webp" alt="CLEANLINE">' +
          '<div class="mg-ck" aria-hidden="true"></div><p class="mg-dt">' + thDate(new Date()) + '</p><p class="mg-ft">แผนก Energy เพาเวอร์เมติค</p></div>' +
          '<div class="mg-f"><div class="mg-in"><p class="mg-k">CLEANLINE MANAGEMENT</p><div class="mg-h" role="heading" aria-level="1">' + hd[0] + '</div><p class="mg-s">' + hd[1] + '</p>' + body + '</div>' +
          '<p class="mg-hp">ติดปัญหาเข้าไม่ได้ ติดต่อผู้ดูแลระบบ</p></div></div>';
      };
    } else if (st.page === 'engineer') {
      el.className = 'man';
      var MG = false;
      var HEAD = { login: [MG ? 'สวัสดี! เริ่มงานกัน' : 'สวัสดี! ไปลุยงานกัน', 'ลงชื่อเข้าใช้ครั้งเดียว ใช้ได้ยาว ๆ'], pending: ['อีกนิดเดียวนะ', 'รอผู้ดูแลระบบอนุมัติบัญชีของคุณ'], wrong: ['บัญชีนี้ใช้ ' + (MG ? 'Management' : 'Man') + ' ไม่ได้', 'ลองเปลี่ยนบัญชี หรือไปหน้าที่บัญชีนี้ใช้ได้'] };
      frame = function (body) {
        var hd = HEAD[kind] || HEAD.login;
        return '<div class="cm"><i class="cm-bl" style="width:260px;height:260px;left:-90px;top:40px"></i><i class="cm-bl" style="width:120px;height:120px;right:-30px;top:230px"></i>' +
          '<div class="cm-top"><img class="cm-m" src="mascot-wave.webp" alt="" width="330" height="346"></div>' +
          '<div class="cm-sh"><span class="cm-chip"><img src="logo.webp" alt="CLEANLINE">' + (MG ? 'Management' : 'Man') + '</span>' +
          '<div class="cm-h" role="heading" aria-level="1">' + hd[0] + '</div><p class="cm-s">' + hd[1] + '</p>' + body +
          (kind === 'login' ? '<div class="cm-ft">ใช้บัญชี Google ของบริษัท</div>' : '') + '</div></div>';
      };
    } else el.className = '';
    var who = st.me ? '<div class="cg-who">' + (st.me.picture ? '<img class="cg-av" alt="" src="' + esc(st.me.picture) + '" onerror="this.remove()">' : '') +
      '<div><b>' + esc(st.me.name) + '</b><span>' + esc(st.me.email) + '</span></div></div>' : '';
    return new Promise(function (res) {
      if (kind === 'login') {
        var la = st.page === 'admin' && lastAcct();
        el.innerHTML = frame((la ? '<div class="mg-ac">' + avHtml(la) + '<span><b>' + esc(la.name) + '</b><small>' + esc(maskMail(la.email)) + '</small></span><button type="button" class="mg-x" id="clg-forget" aria-label="ลืมบัญชีนี้ในเครื่องนี้" title="ลืมบัญชีนี้ในเครื่องนี้">×</button></div>' : '') +
          '<div id="clg-btn"></div>' + (la ? '<button type="button" class="mg-lk" id="clg-other">ใช้บัญชีอื่น</button>' : '') + '<div class="cg-m" id="clg-m">' + esc(msg || '') + '</div>');
        var fg = function () { forget(); screen('login', null, msg); renderGBtn(); };
        if (la) { document.getElementById('clg-forget').onclick = fg; document.getElementById('clg-other').onclick = fg; }
        mgLive();
        riseSun(sn);
        return;
      }
      if (kind === 'pending' && st.page === 'admin') {
        var w = st.wait || {}, ap = w.approvers || [], mm = st.me || {};
        el.innerHTML = frame('<div class="mg-me">' + avHtml(mm, 'sm') + '<span><b>' + esc(mm.name || '') + '</b><small>' + esc(mm.email || '') + '</small></span></div>' +
          '<ol class="mg-tl"><li class="mg-ok"><i></i><span>ส่งคำขอแล้ว<small>' + (w.at ? hhmm(w.at) : '') + '</small></span></li>' +
          '<li class="mg-now"><i></i><span>รออนุมัติ' + (ap.length ? '<span class="mg-who">' + ap.map(function (a) { return avHtml(a, 'sm'); }).join('') + '<small>' + esc(ap.map(function (a) { return a.name; }).join(' · ')) + ' อนุมัติได้</small></span>' : '<small>ผู้ดูแลระบบอนุมัติใน Console</small>') + '</span></li>' +
          '<li><i></i><span>เข้าใช้งานได้<small>อนุมัติแล้วพาเข้าให้เอง</small></span></li></ol>' +
          '<div class="mg-auto"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="#eceef2"/><circle id="clg-ring" cx="10" cy="10" r="8" stroke="#458c10" stroke-dasharray="50.3" stroke-dashoffset="0" stroke-linecap="round"/></svg><span id="clg-m">เช็กให้เองอีก 30 วินาที</span></div>' +
          '<div class="mg-row"><button type="button" class="b" id="clg-re">ตรวจตอนนี้</button><button type="button" class="b l" id="clg-out">เปลี่ยนบัญชี</button></div>' +
          '<button type="button" class="mg-cp" id="clg-cp">คัดลอกข้อความขออนุมัติ ส่งทาง LINE</button>');
        mgLive();
        var left = 30, done = 0, ring = document.getElementById('clg-ring');
        var fin = function () { if (done) return; done = 1; clearInterval(tk); setScreenMsg('กำลังตรวจ…'); res(); };
        var tk = setInterval(function () { if (!document.getElementById('clg-ring')) { clearInterval(tk); return; } left--; if (left <= 0) return fin(); setScreenMsg('เช็กให้เองอีก ' + left + ' วินาที'); ring.style.strokeDashoffset = (50.3 * (1 - left / 30)).toFixed(1); }, 1000);
        document.getElementById('clg-re').onclick = fin;
        document.getElementById('clg-out').onclick = function () { clearInterval(tk); signOut(); location.reload(); };
        document.getElementById('clg-cp').onclick = function () {
          var t = 'ขออนุมัติเข้าใช้ ' + (PAGE_NAME[st.page] || 'CLEANLINE') + ' บัญชี ' + (mm.email || '') + (mm.name ? ' (' + mm.name + ')' : ''), b = this;
          var ok = function () { b.classList.add('mg-cpok'); b.textContent = 'คัดลอกแล้ว วางในแชตได้เลย'; setTimeout(function () { b.classList.remove('mg-cpok'); b.textContent = 'คัดลอกข้อความขออนุมัติ ส่งทาง LINE'; }, 2400); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { prompt('คัดลอกข้อความนี้', t); });
          else prompt('คัดลอกข้อความนี้', t);
        };
        return;
      }
      if (kind === 'pending') {
        el.innerHTML = frame(who + '<p class="cg-p">ส่งคำขอเข้าใช้แล้ว รอผู้ดูแลระบบอนุมัติ</p><div><button class="b" id="clg-re">ตรวจอีกครั้ง</button><button class="b l" id="clg-out">เปลี่ยนบัญชี</button></div><div class="cg-m" id="clg-m"></div>');
      } else {
        var pages = (me.pages || []);
        el.innerHTML = frame(who + '<p class="cg-p">บัญชีนี้ใช้ <b>' + esc(pages.map(function (p) { return PAGE_NAME[p]; }).join(' / ') || '-') + '</b> เปิดหน้านี้ไม่ได้</p><div>' +
          pages.map(function (p) { return '<a class="b" href="' + PAGE_URL[p] + '">ไป ' + esc(PAGE_NAME[p]) + '</a>'; }).join('') +
          '<button class="b l" id="clg-out">เปลี่ยนบัญชี</button></div>');
      }
      riseSun(sn);
      var re = document.getElementById('clg-re'); if (re) re.onclick = function () { setScreenMsg('กำลังตรวจ…'); res(); };
      document.getElementById('clg-out').onclick = function () { signOut(); location.reload(); };
    });
  }
  function setScreenMsg(t, bad) { var m = document.getElementById('clg-m'); if (m) { m.textContent = t; m.className = 'cg-m' + (bad ? ' bad' : ''); } }
  function hideScreen() { var el = typeof document !== 'undefined' && document.getElementById('clg'); if (el) el.remove(); }
  var banners = {};
  function banner(k, t) {
    if (typeof document === 'undefined') return;
    banners[k] = t; var txt = Object.keys(banners).map(function (x) { return banners[x]; }).filter(Boolean).join(' · ');
    var el = document.getElementById('clg-bn');
    if (!txt) { if (el) el.remove(); return; }
    css(); if (!el) { el = document.createElement('div'); el.id = 'clg-bn'; document.body.appendChild(el); }
    el.textContent = txt;
  }
  function setSys(s) {
    st.sys = s;
    banner('sys', s.maintenance && !(st.me && st.me.role === 'sysadmin') ? 'ระบบปิดปรับปรุงชั่วคราว ดูข้อมูลได้แต่บันทึกไม่ได้' + (s.msg ? ' · ' + s.msg : '') : '');
  }


  // ===== หน้าไฟล์งานในแอป (ตัวกลาง 1.2.6: ls/fput/fmk/fren/fdel) — Management และ Man ใช้ร่วมกัน =====
  // เปิดเป็นหน้าเต็มจอทับแอป · ปุ่มย้อนกลับของมือถือปิดได้ · ตัวกลางเก่า (ไม่รู้จัก ls) → บอกให้อัปเดตตัวกลาง
  var files = (function () {
    var F = null, SV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    var I = {
      fd: SV + '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
      doc: SV + '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
      img: SV + '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
      gs: SV + '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>',
      up: SV + '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
      nf: SV + '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/></svg>',
      ext: SV + '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
      more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
      pen: SV + '<path d="M4 20h4L19 9l-4-4L4 16z"/></svg>', tr: SV + '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
      dl: SV + '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>', lk: SV + '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
      sr: SV + '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
      back: SV + '<path d="M15 18l-6-6 6-6"/></svg>', x: SV + '<path d="M6 6l12 12M18 6 6 18"/></svg>'
    };
    var CSS = '#clf{position:fixed;inset:0;z-index:9000;overflow:auto;background:#f3f4f2;color:#16171d;font-family:inherit}' +
      '#clf .cf-ft{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:12px 16px;background:rgba(243,244,242,.94);backdrop-filter:blur(10px)}' +
      '#clf .cf-ft h1{margin:0;font-size:16px;line-height:1.3;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#clf .cf-ft h1 small{display:block;font-size:12px;font-weight:500;color:#606f85}' +
      '#clf .cf-ib{width:44px;height:44px;flex:none;border:0;border-radius:14px;background:#fff;color:#16171d;display:grid;place-items:center;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.06)}#clf .cf-ib svg{width:20px;height:20px}' +
      '#clf .cf-fw{max-width:1040px;margin:0 auto;padding:8px 16px 48px;display:grid;gap:16px}' +
      '#clf .cf-bc{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:14px;color:#606f85}#clf .cf-bc button{border:0;background:none;font:inherit;color:#606f85;min-height:40px;padding:0 4px;cursor:pointer;border-radius:8px}#clf .cf-bc button:hover{color:#16171d}#clf .cf-bc b{color:#16171d;padding:0 4px}#clf .cf-bc i{font-style:normal;color:#b6bcc6}' +
      '#clf .cf-hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap}#clf .cf-hd h2{margin:0;font-size:24px;line-height:1.25;font-weight:800;color:#2f6b0a;min-width:0;overflow-wrap:anywhere}' +
      '#clf .cf-sq{width:40px;height:40px;flex:none;border:0;border-radius:12px;background:#3d7c0e;color:#fff;display:grid;place-items:center;cursor:pointer}#clf .cf-sq svg{width:20px;height:20px}' +
      '#clf .cf-bt{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border:0;border-radius:999px;background:#16171d;color:#fff;font:600 15px inherit;font-family:inherit;cursor:pointer}#clf .cf-bt svg{width:20px;height:20px}#clf .cf-bt.cf-l{background:#fff;color:#16171d;box-shadow:inset 0 0 0 1px #d8dce2}#clf .cf-bt.cf-r{background:#c81e1e}' +
      '#clf .cf-hd .cf-bt{margin-left:auto}' +
      '#clf .cf-sc{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:700;margin-top:8px}#clf .cf-sc small{font-weight:500;color:#606f85}' +
      '#clf .cf-fds{display:grid;grid-template-columns:repeat(auto-fill,200px);gap:16px}' +
      '#clf .cf-fd{position:relative;min-height:128px;margin-top:12px;padding:44px 16px 16px;border:0;border-radius:4px 20px 20px 20px;background:#e8ede1;text-align:left;font:inherit;color:#16171d;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;gap:4px}' +
      '#clf .cf-fd::before{content:"";position:absolute;left:0;top:-12px;width:46%;height:20px;border-radius:12px 12px 0 0;background:inherit}#clf .cf-fd:hover{background:#dde6d1}' +
      '#clf .cf-fd .cf-fi{position:absolute;left:16px;top:12px;color:#3d7c0e}#clf .cf-fd .cf-fi svg{width:24px;height:24px}#clf .cf-fd b{font-size:16px;line-height:1.3;overflow-wrap:anywhere}#clf .cf-fd small{font-size:14px;color:#606f85}' +
      '#clf .cf-fd:first-child{background:#3d7c0e;color:#fff;box-shadow:0 16px 32px -16px rgba(47,107,10,.6)}#clf .cf-fd:first-child .cf-fi{color:#fff}#clf .cf-fd:first-child small{color:rgba(255,255,255,.82)}' +
      '#clf .cf-fm{position:absolute;right:4px;top:4px;width:40px;height:40px;border:0;background:none;border-radius:12px;color:inherit;display:grid;place-items:center;cursor:pointer;opacity:.8}#clf .cf-fm svg{width:20px;height:20px}' +
      '#clf .cf-tb{background:#fff;border-radius:24px;padding:8px;box-shadow:0 16px 32px -24px rgba(30,40,60,.35)}' +
      '#clf .cf-rw{display:grid;grid-template-columns:44px minmax(0,1fr) 140px 96px 44px 44px;align-items:center;gap:8px;min-height:56px;padding:4px 4px 4px 8px;border-radius:16px}#clf .cf-rw+.cf-rw{box-shadow:0 -1px 0 #f1f2f4}' +
      '#clf .cf-rw.cf-th{min-height:32px;font-size:12px;font-weight:600;color:#606f85}#clf .cf-rw:not(.cf-th):hover{background:#f2f7ea}' +
      '#clf .cf-rw .cf-nm{display:flex;align-items:center;gap:12px;min-width:0;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;min-height:48px;grid-column:1/3;padding:0}' +
      '#clf .cf-ic{width:36px;height:36px;flex:none;border-radius:10px;display:grid;place-items:center;margin-left:4px}#clf .cf-ic svg{width:18px;height:18px}#clf .cf-ic.cf-p{background:#fdecec;color:#c81e1e}#clf .cf-ic.cf-i{background:#eef2fb;color:#2f5fb3}#clf .cf-ic.cf-g{background:#e6f4ea;color:#137333}#clf .cf-ic.cf-o{background:#eef0f3;color:#4b5563}' +
      '#clf .cf-nm span{min-width:0}#clf .cf-nm b,#clf .cf-pg small{display:flex;min-width:0;font-size:16px;line-height:1.4;font-weight:500;white-space:nowrap}#clf .cf-pg small{font-size:14px;font-weight:400}#clf .cf-h{overflow:hidden;text-overflow:ellipsis;min-width:0}#clf .cf-t{flex:none}#clf .cf-st:empty{display:none}#clf .cf-nm small{display:none;font-size:14px;color:#606f85}' +
      '#clf .cf-dt,#clf .cf-sz{font-size:14px;color:#606f85;font-variant-numeric:tabular-nums}' +
      '#clf .cf-mn{width:40px;height:40px;border:0;background:none;border-radius:12px;color:#606f85;display:grid;place-items:center;cursor:pointer}#clf .cf-mn:hover{background:#eef0f3}#clf .cf-mn svg{width:18px;height:18px}' +
      '#clf .cf-em{padding:32px 16px;text-align:center;color:#606f85;font-size:14px}#clf .cf-drop{min-height:56px;margin:8px;border:1.5px dashed #c9cfd8;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:8px;color:#606f85;font-size:14px}#clf .cf-drop svg{width:20px;height:20px}#clf.cf-dg .cf-drop{border-color:#3d7c0e;background:#f2f7ea;color:#2f6b0a}' +
      '#clf .cf-gd{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-size:14px;font-weight:600;color:#2f6b0a;text-decoration:none}#clf .cf-gd svg{width:18px;height:18px}' +
      '#clf .cf-fail{display:grid;gap:10px;padding:16px;border-radius:16px;background:#fff6f5;border:1px solid #f4c7c1}#clf .cf-fail>div:first-child{display:flex;justify-content:space-between;gap:16px;align-items:baseline}#clf .cf-fail b{font-size:16px;color:#9b1c1c}#clf .cf-fail>div>span{font-size:14px;color:#606f85}#clf .cf-fail ul{margin:0;padding:0;list-style:none;display:grid;gap:4px}#clf .cf-fail li{display:flex;justify-content:space-between;gap:12px;font-size:14px}#clf .cf-fail li small{color:#9b1c1c;white-space:nowrap}#clf .cf-fail .cf-ac{display:flex;gap:8px;justify-content:flex-end}' +
      '#clf .cf-pg{display:grid;gap:8px;padding:16px;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06)}#clf .cf-pg div{display:flex;justify-content:space-between;gap:16px;align-items:baseline}#clf .cf-pg b{font-size:16px}#clf .cf-pg span{font-size:14px;color:#606f85;white-space:nowrap}#clf .cf-pg i{display:block;height:8px;border-radius:999px;background:#e6eadf;overflow:hidden}#clf .cf-pg i::before{content:"";display:block;height:100%;width:var(--p);background:#3d7c0e;border-radius:inherit;transition:width .3s}#clf .cf-pg small{font-size:14px;color:#606f85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#clf .cf-st{font-size:14px;color:#2f6b0a;min-height:20px}#clf .cf-st.cf-bad{color:#c81e1e}' +
      '#clf .cf-pop{position:fixed;z-index:9100;width:220px;padding:6px;border-radius:16px;background:#fff;box-shadow:0 12px 32px -8px rgba(0,0,0,.3),0 0 0 1px rgba(0,0,0,.05)}#clf .cf-pop button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 12px;border:0;border-radius:10px;background:none;font:500 14px inherit;font-family:inherit;color:#16171d;text-align:left;cursor:pointer}#clf .cf-pop button:hover{background:#f5f6f8}#clf .cf-pop svg{width:18px;height:18px}#clf .cf-pop .cf-r{color:#c81e1e}' +
      '#clf .cf-dlg{position:fixed;inset:0;z-index:9200;background:rgba(16,20,12,.45);display:grid;place-items:center;padding:16px}#clf .cf-dlg>div{width:100%;max-width:400px;background:#fff;border-radius:24px;padding:24px}#clf .cf-dlg h3{margin:0 0 8px;font-size:20px;line-height:1.3}#clf .cf-dlg p{margin:0 0 16px;font-size:14px;color:#606f85;overflow-wrap:anywhere}#clf .cf-dlg input{width:100%;box-sizing:border-box;min-height:48px;padding:0 16px;border:1px solid #80858f;border-radius:14px;font:inherit;font-size:16px;margin-bottom:16px}#clf .cf-dlg .cf-ac{display:flex;gap:8px;justify-content:flex-end}' +
      '#clf .cf-vw{position:fixed;inset:0;z-index:9300;background:rgba(14,16,20,.94);display:grid;grid-template-rows:auto 1fr auto;color:#fff}#clf .cf-vt{display:flex;align-items:center;gap:8px;padding:12px 16px}#clf .cf-vt b{flex:1;min-width:0;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#clf .cf-vt a,#clf .cf-vt button{min-height:44px;padding:0 14px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font:600 14px inherit;font-family:inherit;display:inline-flex;align-items:center;gap:8px;text-decoration:none;cursor:pointer}#clf .cf-vt svg{width:18px;height:18px}#clf .cf-vt .cf-x{width:44px;padding:0;justify-content:center}' +
      '#clf .cf-vb{position:relative;display:grid;place-items:center;min-height:0;padding:8px 64px}#clf .cf-vb img{max-width:100%;max-height:100%;border-radius:8px}#clf .cf-vb iframe{width:100%;height:100%;border:0;border-radius:8px;background:#fff}#clf .cf-vn{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:22px;cursor:pointer}#clf .cf-vf{text-align:center;padding:12px;font-size:12px;color:rgba(255,255,255,.75)}' +
      '@media (max-width:640px){#clf .cf-rw .cf-nm{grid-column:1}#clf .cf-fds{grid-auto-flow:column;grid-auto-columns:46%;grid-template-columns:none;overflow-x:auto;padding:4px 2px 8px}#clf .cf-rw{grid-template-columns:minmax(0,1fr) 44px}#clf .cf-rw.cf-th,#clf .cf-dt,#clf .cf-sz,#clf .cf-lkb,#clf .cf-drop{display:none}#clf .cf-nm small{display:block}#clf .cf-hd .cf-bt{width:100%;margin:0}#clf .cf-hd h2{font-size:20px}#clf .cf-vb{padding:8px}#clf .cf-vn{display:none}#clf .cf-pop{left:8px!important;right:8px;bottom:8px;top:auto!important;width:auto;border-radius:20px;padding:8px}#clf .cf-pop button{min-height:52px;font-size:16px}}#clf [hidden]{display:none!important}#clf .cf-ft{padding-left:max(16px,calc((100% - 1280px) / 2 + 16px))}#clf .cf-fw{max-width:1280px;grid-template-columns:240px minmax(0,1fr);align-items:start;gap:32px;padding-top:16px}#clf .cf-fw>.cf-em,#clf .cf-fw>.cf-st{grid-column:1/-1}#clf .cf-mainc{display:grid;gap:16px;min-width:0}#clf .cf-sd{position:sticky;top:80px;display:grid;gap:8px}#clf .cf-sd .cf-bt{width:100%;min-height:48px}#clf .cf-ol{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1px solid #c9cfd8;border-radius:999px;background:#fff;color:#16171d;font:600 15px inherit;font-family:inherit;cursor:pointer}#clf .cf-ol svg,#clf .cf-sd nav svg{width:20px;height:20px;flex:none}#clf .cf-sd nav{display:grid;gap:4px;margin-top:16px}#clf .cf-sd nav button{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 12px;border:0;border-radius:12px;background:none;color:#3a4250;font:500 15px inherit;font-family:inherit;text-align:left;cursor:pointer}#clf .cf-sd nav button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#clf .cf-sd nav button.cf-sub{padding-left:32px}#clf .cf-sd nav button:hover{background:#e9ece6}#clf .cf-sd nav button.on{background:#e3eed6;color:#2f6b0a;font-weight:700}#clf .cf-hd .cf-sq,#clf .cf-upm{display:none}#clf .cf-q{margin-left:auto;display:flex;align-items:center;gap:8px;width:320px;max-width:100%;min-height:44px;padding:0 16px;border-radius:999px;background:#fff;border:1px solid #dfe3e8;color:#606f85}#clf .cf-q svg{width:18px;height:18px;flex:none}#clf .cf-q input{flex:1;min-width:0;border:0;outline:0;background:none;font:400 15px inherit;font-family:inherit;color:#16171d}#clf .cf-q:focus-within{border-color:#3d7c0e;box-shadow:0 0 0 3px rgba(61,124,14,.15)}#clf .cf-fds{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}#clf .cf-fd{min-height:160px;padding:56px 16px 16px}#clf .cf-fd .cf-fl{font-size:12px;font-weight:600;letter-spacing:.02em;color:#606f85}#clf .cf-fd:first-child .cf-fl{color:rgba(255,255,255,.75)}#clf .cf-rw{grid-template-columns:44px minmax(0,1fr) 168px 120px 88px 44px 44px}#clf .cf-by{display:flex;align-items:center;gap:8px;font-size:14px;color:#3a4250;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}#clf .cf-by i{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#e3eed6;color:#2f6b0a;font:700 13px inherit;font-family:inherit;font-style:normal}#clf .cf-rw:not(.cf-th)+.cf-rw{box-shadow:inset 0 1px 0 #eef0f3}#clf.cf-dg .cf-mainc{outline:2px dashed #3d7c0e;outline-offset:8px;border-radius:24px}@media (max-width:900px){#clf .cf-fw{grid-template-columns:minmax(0,1fr);gap:16px}#clf .cf-sd{display:none}#clf .cf-hd .cf-sq,#clf .cf-upm{display:inline-flex}#clf .cf-hd .cf-sq{display:grid}#clf .cf-q{order:5;width:100%;margin-left:0}#clf .cf-rw{grid-template-columns:44px minmax(0,1fr) 120px 88px 44px 44px}#clf .cf-by,#clf .cf-th span:nth-child(3){display:none}}@media (max-width:640px){#clf .cf-rw{grid-template-columns:minmax(0,1fr) 44px}#clf .cf-fds{grid-template-columns:none}#clf .cf-fd{min-height:128px;padding-top:48px}}';
    function e(t) { return esc(t); }
    function kind(f) { var m = f.mime || '', n = (f.name || '').toLowerCase(); if (/^image\//.test(m)) return 'i'; if (m === 'application/pdf' || /\.pdf$/.test(n)) return 'p'; if (/^application\/vnd\.google-apps/.test(m)) return 'g'; return 'o'; }
    function mid(n) { n = String(n || ''); var k = Math.min(12, Math.floor(n.length / 3)); return '<span class="cf-h">' + e(n.slice(0, n.length - k)) + '</span><span class="cf-t">' + e(n.slice(n.length - k)) + '</span>'; }   // ตัดตรงกลาง เก็บท้ายชื่อ (_3.jpg) ไว้ให้แยกไฟล์ออก
    function fsz(b) { if (!b) return '—'; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
    var TM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    function fdt(ms) { if (!ms) return '—'; var d = new Date(ms); return d.getDate() + ' ' + TM[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2); }
    function say(t, bad) { var x = F && F.el.querySelector('.cf-st'); if (x) { x.textContent = t || ''; x.className = 'cf-st' + (bad ? ' cf-bad' : ''); } }
    function errText(x) { return x && x.code === 'denied' ? 'ไม่มีสิทธิ์ทำส่วนนี้' : x && x.code === 'network' ? 'เชื่อมต่อไม่ได้ ลองอีกครั้ง' : (x && x.message) || 'ทำไม่สำเร็จ ลองอีกครั้ง'; }
    function load(fid) {
      if ((fid || '') !== F.cur) F.q = '';
      F.cur = fid || ''; say('กำลังโหลด…');
      var G = F;
      return db.call('ls', { jobId: F.job, folderId: F.cur }).then(function (r) { if (F !== G) return; F.r = r; draw(); say(''); }).catch(function (x) {
        if (F !== G) return;   // ปิดหน้าไปแล้ว
        if (!F.r) { F.el.querySelector('.cf-fw').innerHTML = '<div class="cf-em">' + e(/ไม่รู้จักคำสั่ง/.test(x && x.message || '') ? 'หน้าไฟล์งานต้องใช้ตัวกลาง 1.2.6 ขึ้นไป' : errText(x)) + '<p style="margin-top:16px"><button class="cf-bt" data-go="">ลองอีกครั้ง</button></p>' + '</div><div class="cf-st" role="status"></div>'; return; }   // โหลดครั้งแรกพัง ยังไม่มีหน้าให้แสดงข้อความ
        say(errText(x), true);
      });
    }
    function draw() {
      var r = F.r, atRoot = r.folder.id === r.root, imgs = r.files.filter(function (f) { return kind(f) === 'i'; });
      F.imgs = imgs; if (atRoot) F.rf = r.folders;
      var top = atRoot ? '' : (r.path[0] ? r.path[0].id : r.folder.id);
      var bc = atRoot ? '' : '<nav class="cf-bc" aria-label="ตำแหน่ง">' + ('<button data-go="">โฟลเดอร์งาน</button>' + r.path.map(function (p) { return '<i>/</i><button data-go="' + e(p.id) + '">' + e(p.name) + '</button>'; }).join('') + '<i>/</i><b>' + e(r.folder.name) + '</b>') + '</nav>';
      var sd = '<aside class="cf-sd"><button class="cf-bt" data-up>' + I.up + 'อัปโหลดไฟล์</button><button class="cf-ol" data-mk>' + I.nf + 'โฟลเดอร์ใหม่</button><nav aria-label="โฟลเดอร์">' +
        '<button data-go="" class="' + (atRoot ? 'on' : '') + '">' + I.fd + '<span>โฟลเดอร์งาน</span></button>' +
        (F.rf || []).map(function (f) { return '<button data-go="' + e(f.id) + '" class="cf-sub ' + (top === f.id ? 'on' : '') + '">' + I.fd + '<span>' + e(f.name) + '</span></button>'; }).join('') + '</nav></aside>';
      var fds = r.folders.map(function (f) { return '<div class="cf-fd" role="button" tabindex="0" data-go="' + e(f.id) + '" data-n="' + e(f.name.toLowerCase()) + '"><span class="cf-fi">' + I.fd + '</span><button class="cf-fm" data-mn="' + e(f.id) + '" aria-label="เมนูโฟลเดอร์ ' + e(f.name) + '">' + I.more + '</button><small class="cf-fl">โฟลเดอร์</small><b>' + e(f.name) + '</b><small>' + f.n + ' รายการ · ' + fdt(f.at) + '</small></div>'; }).join('');
      var ic = { p: I.doc, i: I.img, g: I.gs, o: I.doc };
      var rows = r.files.map(function (f) { var k = kind(f); return '<div class="cf-rw" data-n="' + e(f.name.toLowerCase()) + '"><button class="cf-nm" data-op="' + e(f.id) + '"><span class="cf-ic cf-' + k + '">' + ic[k] + '</span><span><b title="' + e(f.name) + '">' + mid(f.name) + '</b><small>' + fdt(f.at) + ' · ' + fsz(f.size) + '</small></span></button><span class="cf-by">' + (f.by ? '<i>' + e(f.by.slice(0, 1)) + '</i>' + e(f.by) : '—') + '</span><span class="cf-dt">' + fdt(f.at) + '</span><span class="cf-sz">' + fsz(f.size) + '</span><button class="cf-mn cf-lkb" data-lk="' + e(f.id) + '" aria-label="คัดลอกลิงก์ ' + e(f.name) + '">' + I.lk + '</button><button class="cf-mn" data-mn="' + e(f.id) + '" aria-label="เมนูไฟล์ ' + e(f.name) + '">' + I.more + '</button></div>'; }).join('');
      F.el.querySelector('.cf-fw').innerHTML = sd + '<div class="cf-mainc">' + bc +
        '<div class="cf-hd"><h2>' + e(atRoot ? 'โฟลเดอร์งาน' : r.folder.name) + '</h2><button class="cf-sq" data-mk aria-label="สร้างโฟลเดอร์ใหม่" title="โฟลเดอร์ใหม่">' + I.nf + '</button><label class="cf-q">' + I.sr + '<input type="search" placeholder="ค้นหาในโฟลเดอร์นี้" aria-label="ค้นหาไฟล์ในโฟลเดอร์นี้" value="' + e(F.q || '') + '"></label><button class="cf-bt cf-upm" data-up>' + I.up + 'อัปโหลดไฟล์</button><input type="file" multiple hidden></div>' + pg() + '<div class="cf-st" role="status"></div>' +
        (r.folders.length ? '<div class="cf-sc">โฟลเดอร์<small>' + r.folders.length + ' โฟลเดอร์</small></div><div class="cf-fds">' + fds + '</div>' : '') +
        '<div class="cf-sc">ไฟล์<small>' + r.files.length + ' ไฟล์</small></div><div class="cf-tb">' + (r.files.length ? '<div class="cf-rw cf-th"><span></span><span>ชื่อ</span><span>อัปโหลดโดย</span><span>แก้ไขล่าสุด</span><span>ขนาด</span><span></span><span></span></div>' + rows : '<div class="cf-em">ยังไม่มีไฟล์ในโฟลเดอร์นี้ · กดอัปโหลด หรือลากไฟล์มาวางในหน้านี้</div>') + '<div class="cf-em cf-nf" hidden>ไม่พบไฟล์ที่ชื่อตรงกับคำค้น</div></div></div>';
      filt();
    }
    function filt() {   // ค้นหาเฉพาะในโฟลเดอร์ที่เปิดอยู่ (ไม่ต้องถามตัวกลาง)
      var q = (F.q || '').trim().toLowerCase(), hit = 0;
      [].forEach.call(F.el.querySelectorAll('.cf-fd,.cf-rw:not(.cf-th)'), function (x) { var ok = !q || x.dataset.n.indexOf(q) >= 0; x.hidden = !ok; if (ok && x.classList.contains('cf-rw')) hit++; });
      var nf = F.el.querySelector('.cf-nf'); if (nf) nf.hidden = !(q && !hit && F.r.files.length);
    }
    function item(id) { var r = F.r; return r.files.filter(function (f) { return f.id === id; })[0] || r.folders.filter(function (f) { return f.id === id; })[0]; }
    function dlg(title, msg, val, okT, red) {
      return new Promise(function (res) {
        var d = document.createElement('div'); d.className = 'cf-dlg';
        d.innerHTML = '<div role="dialog" aria-modal="true" aria-label="' + e(title) + '"><h3>' + e(title) + '</h3>' + (msg ? '<p>' + e(msg) + '</p>' : '') + (val != null ? '<input value="' + e(val) + '" maxlength="120">' : '') + '<div class="cf-ac"><button class="cf-bt cf-l" data-no>ยกเลิก</button><button class="cf-bt' + (red ? ' cf-r' : '') + '" data-yes>' + e(okT) + '</button></div></div>';
        F.el.appendChild(d); var inp = d.querySelector('input'); (inp || d.querySelector('[data-yes]')).focus(); if (inp) inp.select();
        function end(v) { d.remove(); res(v); }
        d.onclick = function (ev) { if (ev.target === d || ev.target.closest('[data-no]')) end(null); else if (ev.target.closest('[data-yes]')) end(inp ? inp.value.trim() : true); };
        d.onkeydown = function (ev) { if (ev.key === 'Enter' && inp) end(inp.value.trim()); if (ev.key === 'Escape') { ev.stopPropagation(); end(null); } };
      });
    }
    function act(p, okMsg) { say('กำลังบันทึก…'); return p.then(function () { return load(F.cur); }).then(function () { say(okMsg); }).catch(function (x) { say(errText(x), true); }); }
    function pg() {
      var u = F.up;
      if (!u) {   // จบแล้วมีไฟล์ไม่สำเร็จ → การ์ดบอกชื่อไฟล์ + ลองอีกครั้ง (เฉพาะไฟล์ที่พัง ไม่ซ้ำไฟล์ที่ขึ้นแล้ว)
        var fl = F.fail; if (!fl || !fl.list.length) return '';
        var re = fl.list.filter(function (x) { return x.f; }).length;
        return '<div class="cf-fail" role="alert"><div><b>อัปโหลดไม่สำเร็จ ' + fl.list.length + ' ไฟล์</b><span>ไฟล์อื่นขึ้นครบแล้ว</span></div><ul>' +
          fl.list.map(function (x) { return '<li><span>' + mid(x.name) + '</span><small>' + e(x.why) + '</small></li>'; }).join('') + '</ul><div class="cf-ac">' +
          (re ? '<button class="cf-bt" data-upretry>' + I.up + 'ลองอีกครั้ง ' + re + ' ไฟล์</button>' : '') + '<button class="cf-bt cf-l" data-upx>ปิด</button></div></div>';
      }
      var left = u.i > 1 ? Math.round((Date.now() - u.t0) / (u.i - 1) * (u.n - u.i + 1) / 1000) : 0;
      var eta = !left ? 'กำลังคำนวณเวลา' : left < 60 ? 'เหลือไม่ถึง 1 นาที' : 'เหลือประมาณ ' + Math.round(left / 60) + ' นาที';
      return '<div class="cf-pg" role="status"><div><b>กำลังอัปโหลด ' + u.i + ' จาก ' + u.n + '</b><span>' + eta + '</span></div><i style="--p:' + Math.round((u.i - 1) / u.n * 100) + '%"></i><small>' + mid(u.name) + (u.bad ? ' · ไม่สำเร็จ ' + u.bad + ' ไฟล์' : '') + '</small></div>';
    }
    var MAXB = 20 * 1048576;
    function soft(x) { var c = x && x.code; return !c || c === 'network' || c === 'server' || c === 'busy'; }
    function upload(list, dest) {
      list = [].slice.call(list || []); if (!list.length) return;
      if (F.up) { F.up.q = F.up.q.concat(list); F.up.n += list.length; draw(); return; }   // กำลังอัปโหลดอยู่ → ต่อคิวเดิม
      var cur = dest != null ? dest : F.cur, U = F.up = { q: list, n: list.length, i: 0, name: '', t0: Date.now(), ok: 0, bad: 0, fails: [] };
      F.fail = null;
      function done() { if (F && F.up === U) F.up = null; }
      function put(f, b64, tryN) {
        return db.call('fput', { jobId: F.job, folderId: cur, name: f.name, mime: f.type || 'application/octet-stream', b64: b64 })
          .catch(function (x) { if (tryN < 1 && soft(x)) return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return put(f, b64, tryN + 1); }); throw x; });
      }
      function next() {
        if (!F || F.up !== U) return;   // ปิดหน้าแล้ว
        if (U.i >= U.q.length) {
          done(); F.fail = U.fails.length ? { list: U.fails, cur: cur } : null;
          return load(cur).then(function () { say(U.fails.length ? 'อัปโหลดแล้ว ' + U.ok + ' จาก ' + U.n + ' ไฟล์' : 'อัปโหลดแล้ว ' + U.ok + ' ไฟล์', !!U.fails.length); });
        }
        var f = U.q[U.i++]; U.i = Math.min(U.i, U.n); U.name = f.name; draw();
        if (f.size > MAXB) { U.bad++; U.fails.push({ name: f.name, why: 'ใหญ่เกิน 20 MB' }); return next(); }
        return new Promise(function (ok, no) { var rd = new FileReader(); rd.onload = function () { ok(String(rd.result).split(',')[1] || ''); }; rd.onerror = no; rd.readAsDataURL(f); })
          .then(function (b64) { return put(f, b64, 0); })
          .then(function (r) { U.ok++; if (F && F.cur === cur && F.r) F.r.files.push({ id: r.id, name: r.name, mime: f.type, size: f.size, at: Date.now(), url: 'https://drive.google.com/file/d/' + r.id + '/view', by: r.by || '' }); },   // ไฟล์ที่เสร็จขึ้นในตารางทันที
            function (x) { U.bad++; U.fails.push({ name: f.name, why: errText(x), f: f }); })
          .then(next);
      }
      next();
    }
    function busyLeft() { return F && F.up ? Math.max(0, F.up.n - F.up.i + 1) : 0; }
    function menu(id, btn) {
      var it = item(id); if (!it) return; var isF = !('mime' in it);
      var p = document.createElement('div'); p.className = 'cf-pop'; p.setAttribute('role', 'menu');
      p.innerHTML = '<button role="menuitem" data-a="ren">' + I.pen + 'เปลี่ยนชื่อ</button>' + (isF ? '' : '<button role="menuitem" data-a="dl">' + I.dl + 'ดาวน์โหลด</button>') + '<button role="menuitem" class="cf-r" data-a="del">' + I.tr + 'ลบ</button>';
      F.el.appendChild(p); var b = btn.getBoundingClientRect(); p.style.top = Math.min(b.bottom + 4, innerHeight - p.offsetHeight - 8) + 'px'; p.style.left = Math.max(8, b.right - 220) + 'px'; p.querySelector('button').focus();
      function shut() { p.remove(); document.removeEventListener('pointerdown', out, true); }
      function out(ev) { if (!p.contains(ev.target)) shut(); }
      setTimeout(function () { document.addEventListener('pointerdown', out, true); }, 0);
      p.onkeydown = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); shut(); btn.focus(); } };
      p.onclick = function (ev) {
        var a = ev.target.closest('[data-a]'); if (!a) return; shut(); a = a.dataset.a;
        if (a === 'dl') dl(it);
        if (a === 'ren') dlg('เปลี่ยนชื่อ', '', it.name, 'บันทึกชื่อ').then(function (v) { if (v && v !== it.name) act(db.call('fren', { jobId: F.job, id: id, name: v }), 'เปลี่ยนชื่อแล้ว'); });
        if (a === 'del') dlg('ลบ ' + (isF ? 'โฟลเดอร์' : 'ไฟล์') + 'นี้?', it.name + (isF ? ' และทุกอย่างข้างใน' : '') + ' จะย้ายไปถังขยะของ Google Drive กู้คืนได้ใน 30 วัน', null, 'ลบ', true).then(function (v) { if (v) act(db.call('fdel', { jobId: F.job, id: id }), 'ลบแล้ว'); });
      };
    }
    function dl(it) { say('กำลังเตรียมไฟล์…'); db.call('file', { fileId: it.id }).then(function (r) { var l = document.createElement('a'); l.href = 'data:' + r.mime + ';base64,' + r.b64; l.download = it.name; document.body.appendChild(l); l.click(); l.remove(); say(''); }).catch(function (x) { say(errText(x), true); }); }
    function view(f) {
      var k = kind(f); if (k === 'g') { window.open(f.url, '_blank', 'noopener'); return; }   // ไฟล์ Google Docs/Sheets ดาวน์โหลดตรงไม่ได้ ต้องเปิดใน Google
      if (k === 'o' || (k === 'p' && innerWidth <= 640)) return dl(f);   // ดูในแอปไม่ได้ → ดาวน์โหลดให้เปิดด้วยแอปในเครื่อง
      var v = document.createElement('div'); v.className = 'cf-vw'; F.el.appendChild(v);
      function show(ff) {
        var n = F.imgs.indexOf(ff);
        v.innerHTML = '<div class="cf-vt"><b>' + e(ff.name) + '</b><button class="cf-x" data-x aria-label="ปิด">' + I.x + '</button></div><div class="cf-vb"><span style="color:rgba(255,255,255,.7)">กำลังโหลด…</span></div><div class="cf-vf">' + (n >= 0 && F.imgs.length > 1 ? (n + 1) + ' จาก ' + F.imgs.length + ' รูป · ' : '') + fsz(ff.size) + '</div>';
        v.querySelector('[data-x]').focus();
        db.call('file', { fileId: ff.id }).then(function (r) {
          var src = 'data:' + r.mime + ';base64,' + r.b64, b = v.querySelector('.cf-vb'); if (!b) return;
          b.innerHTML = (kind(ff) === 'p' ? '<iframe title="' + e(ff.name) + '" src="' + src + '"></iframe>' : '<img alt="' + e(ff.name) + '" src="' + src + '">') +
            (n >= 0 && F.imgs.length > 1 ? '<button class="cf-vn" data-pv style="left:12px" aria-label="รูปก่อนหน้า">‹</button><button class="cf-vn" data-nx style="right:12px" aria-label="รูปถัดไป">›</button>' : '');
        }).catch(function (x) { var b = v.querySelector('.cf-vb'); if (b) b.innerHTML = '<p style="color:#fff">' + e(errText(x)) + '</p>'; });
        v.onclick = function (ev) { if (ev.target.closest('[data-x]')) end(); else if (ev.target.closest('[data-nx]')) show(F.imgs[(n + 1) % F.imgs.length]); else if (ev.target.closest('[data-pv]')) show(F.imgs[(n - 1 + F.imgs.length) % F.imgs.length]); };
        v.onkeydown = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); end(); } if (n >= 0 && ev.key === 'ArrowRight') show(F.imgs[(n + 1) % F.imgs.length]); if (n >= 0 && ev.key === 'ArrowLeft') show(F.imgs[(n - 1 + F.imgs.length) % F.imgs.length]); };
      }
      function end() { v.remove(); }
      show(f);
    }
    function shut() { if (!F) return; var el = F.el; F = null; el.remove(); document.body.style.overflow = ''; if (history.state && history.state.clf) history.back(); }
    function close() {   // กำลังอัปโหลด → ถามก่อน (เดิมปิดแล้วหยุดเงียบ)
      if (!F) return; var n = busyLeft(); if (!n) return shut();
      if (F.el.querySelector('.cf-dlg')) return;
      dlg('ยังอัปโหลดไม่เสร็จ', 'อีก ' + n + ' ไฟล์ยังไม่ขึ้น ถ้าปิดตอนนี้ไฟล์ที่เหลือจะไม่ถูกอัปโหลด', null, 'ปิดเลย', true).then(function (y) { if (y) shut(); });
    }
    function open(jobId, title, url) {
      if (typeof document === 'undefined') return;
      if (!document.getElementById('clf-css')) { var s = document.createElement('style'); s.id = 'clf-css'; s.textContent = CSS; document.head.appendChild(s); }
      if (F) close();
      var el = document.createElement('div'); el.id = 'clf'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'ไฟล์งาน');
      el.innerHTML = '<header class="cf-ft"><button class="cf-ib" data-close aria-label="กลับ">' + I.back + '</button><h1>ไฟล์งาน<small>' + e(title || '') + '</small></h1></header><div class="cf-fw"><div class="cf-st" role="status"></div></div>';
      document.body.appendChild(el); document.body.style.overflow = 'hidden';
      F = { el: el, job: jobId, url: url || '', cur: '' };
      try { history.pushState({ clf: 1 }, ''); } catch (x) {}
      el.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t.closest('[data-close]')) return close();
        var m = t.closest('[data-mn]'); if (m) { ev.stopPropagation(); return menu(m.dataset.mn, m); }
        var lk = t.closest('[data-lk]'); if (lk) { var it = item(lk.dataset.lk); if (it && navigator.clipboard) navigator.clipboard.writeText(it.url).then(function () { say('คัดลอกลิงก์แล้ว'); }, function () { say('คัดลอกไม่ได้', true); }); return; }
        var g = t.closest('[data-go]'); if (g) return load(g.dataset.go);
        var o = t.closest('[data-op]'); if (o) return view(item(o.dataset.op));
        if (t.closest('[data-up]')) return el.querySelector('input[type=file]').click();
        if (t.closest('[data-upretry]') && F.fail) { var fl = F.fail; F.fail = null; return upload(fl.list.filter(function (x) { return x.f; }).map(function (x) { return x.f; }), fl.cur); }
        if (t.closest('[data-upx]')) { F.fail = null; return draw(); }
        if (t.closest('[data-mk]')) return dlg('โฟลเดอร์ใหม่', '', '', 'สร้างโฟลเดอร์').then(function (v) { if (v) act(db.call('fmk', { jobId: F.job, folderId: F.cur, name: v }), 'สร้างโฟลเดอร์แล้ว'); });
      });
      el.addEventListener('keydown', function (ev) { var g = ev.target.closest && ev.target.closest('.cf-fd'); if (g && (ev.key === 'Enter' || ev.key === ' ') && ev.target === g) { ev.preventDefault(); load(g.dataset.go); } if (ev.key === 'Escape' && !el.querySelector('.cf-dlg,.cf-vw,.cf-pop')) close(); });
      el.addEventListener('input', function (ev) { if (ev.target.type === 'search') { F.q = ev.target.value; filt(); } });
      el.addEventListener('change', function (ev) { if (ev.target.type === 'file') { upload(ev.target.files); ev.target.value = ''; } });
      el.addEventListener('dragover', function (ev) { ev.preventDefault(); el.classList.add('cf-dg'); });
      el.addEventListener('dragleave', function (ev) { if (ev.target === el || !el.contains(ev.relatedTarget)) el.classList.remove('cf-dg'); });
      el.addEventListener('drop', function (ev) { ev.preventDefault(); el.classList.remove('cf-dg'); upload(ev.dataTransfer && ev.dataTransfer.files); });
      el.querySelector('[data-close]').focus();
      load('');
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', function () { if (!F) return; if (busyLeft()) { try { history.pushState({ clf: 1 }, ''); } catch (x) {} return close(); } var el = F.el; F = null; el.remove(); document.body.style.overflow = ''; });
      window.addEventListener('beforeunload', function (ev) { if (busyLeft()) { ev.preventDefault(); ev.returnValue = ''; } });
    }
    return { open: open, close: close };
  })();
  window.CLGDB = { connect: connect, db: db, user: user, files: files, _st: st, _cacheClear: cacheClear };
})();
