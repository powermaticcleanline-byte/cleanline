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
    var to = setTimeout(function () { ctl && ctl.abort(); }, req.op === 'batch' || req.op === 'upload' ? 180000 : 60000);
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

  // แถบ "กำลังบันทึก…" เมื่อรอนานเกินครึ่งวินาที
  var pending = 0, pendT = null;
  function saving(on) {
    pending += on ? 1 : -1;
    clearTimeout(pendT);
    if (pending > 0) pendT = setTimeout(function () { banner('save', 'กำลังบันทึก…'); }, 500);
    else banner('save', '');
  }
  function track(p) { saving(true); return p.then(function (r) { saving(false); return r; }, function (e) { saving(false); throw e; }); }
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
    return thumb(full, 360).then(function (t) {
      var doc = clone(d); doc.dataRef = t;
      return api({ op: 'upload', path: ref.path, data: doc, b64: full.split(',')[1], mime: mime,
        name: (d.kind || 'photo') + '-' + ref.id + (mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp') });
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

  /* ---------- เข้าสู่ระบบด้วย Google ---------- */
  function connect(page) {
    st.page = page;
    try { var s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s && s.exp > Date.now()) st.token = s.token; } catch (e) {}
    return (st.token ? api({ op: 'me' }).then(function (r) { return r.me; }).catch(function () { st.token = null; return null; }) : Promise.resolve(null))
      .then(function (me) { return me || signIn(); })
      .then(function (me) { return gate(me); });
  }
  function gate(me) {
    st.me = me;
    if (me.pending) return screen('pending').then(function () { return api({ op: 'me' }).then(function (r) { return gate(r.me); }); });
    if ((me.pages || []).indexOf(st.page) < 0) return screen('wrong', me).then(function () { return gate(me); });
    hideScreen(); schedule(0);
    return { db: db, user: user, me: clone(me) };
  }
  function signIn(msg) {
    return loadGis().then(function () {
      return new Promise(function (res) {
        google.accounts.id.initialize({ client_id: CFG.clientId, auto_select: true, cancel_on_tap_outside: false, ux_mode: 'popup',
          callback: function (resp) {
            setScreenMsg('กำลังตรวจสอบบัญชี…');
            st.token = null;
            api({ op: 'login', idToken: resp.credential }).then(function (r) {
              st.token = r.token;
              try { localStorage.setItem(SKEY, JSON.stringify({ token: r.token, exp: Date.now() + 5.5 * 3600e3 })); } catch (e) {}
              res(r.me);
            }).catch(function (e) { setScreenMsg(e.message, true); });
          } });
        screen('login', null, msg);
        var b = document.getElementById('clg-btn');
        if (b) google.accounts.id.renderButton(b, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'th', width: 300 });
        google.accounts.id.prompt();
      });
    });
  }
  function signOut(msg) {
    st.token = null; st.me = null;
    try { localStorage.removeItem(SKEY); } catch (e) {}
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
    var who = st.me ? '<div class="cg-who">' + (st.me.picture ? '<img class="cg-av" alt="" src="' + esc(st.me.picture) + '" onerror="this.remove()">' : '') +
      '<div><b>' + esc(st.me.name) + '</b><span>' + esc(st.me.email) + '</span></div></div>' : '';
    return new Promise(function (res) {
      if (kind === 'login') {
        el.innerHTML = frame('<div id="clg-btn"></div><div class="cg-m" id="clg-m">' + esc(msg || '') + '</div>');
        riseSun(sn);
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

  window.CLGDB = { connect: connect, db: db, user: user, _st: st };
})();
