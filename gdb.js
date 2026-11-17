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
        if (b) google.accounts.id.renderButton(b, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'th', width: 280 });
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

  /* ---------- หน้าจอเข้าสู่ระบบ / รออนุมัติ / ผิดหน้า ---------- */
  function css() {
    if (document.getElementById('clg-css')) return;
    var s = document.createElement('style'); s.id = 'clg-css';
    s.textContent = '#clg{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f2f5ec;font-family:Prompt,"Noto Sans Thai",Sarabun,system-ui,sans-serif;color:#15230f;padding:20px}' +
      '#clg .bx{background:#fff;border-radius:24px;box-shadow:0 10px 40px rgba(21,35,15,.12);padding:32px 28px;max-width:380px;width:100%;text-align:center}' +
      '#clg h1{font-size:22px;margin:0 0 4px;letter-spacing:.5px}#clg .pg{font-size:14px;color:#4f9a12;margin:0 0 20px;font-weight:600}' +
      '#clg p{font-size:15px;line-height:1.6;margin:0 0 16px;color:#3a4535}#clg .m{min-height:22px;font-size:14px;color:#3a4535}#clg .m.bad{color:#c62828}' +
      '#clg .b{display:inline-block;border:0;border-radius:999px;padding:12px 22px;font:inherit;font-size:15px;cursor:pointer;background:#15230f;color:#fff;text-decoration:none;margin:4px}' +
      '#clg .b.l{background:#eef2e6;color:#15230f}#clg .av{width:56px;height:56px;border-radius:50%;margin:0 auto 10px;display:block;background:#eef2e6}' +
      '#clg-btn{display:flex;justify-content:center;min-height:44px;margin:6px 0 10px}' +
      '#clg-bn{position:fixed;right:20px;bottom:20px;z-index:99998;background:#f0b23a;color:#15230f;border-radius:999px;padding:8px 16px;font:600 14px Prompt,"Noto Sans Thai",sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.15);max-width:92vw;text-align:center}';
    document.head.appendChild(s);
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function screen(kind, me, msg) {
    css();
    var el = document.getElementById('clg') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'clg' }));
    var head = '<h1>CLEANLINE</h1><div class="pg">' + esc((PAGE_NAME[st.page] || '').replace('CLEANLINE ', '')) + '</div>';
    var who = st.me ? (st.me.picture ? '<img class="av" alt="" src="' + esc(st.me.picture) + '" onerror="this.remove()">' : '') + '<p><b>' + esc(st.me.name) + '</b><br><span style="font-size:13px">' + esc(st.me.email) + '</span></p>' : '';
    return new Promise(function (res) {
      if (kind === 'login') {
        el.innerHTML = '<div class="bx">' + head + '<p>เข้าสู่ระบบด้วยบัญชี Google</p><div id="clg-btn"></div><div class="m" id="clg-m">' + esc(msg || '') + '</div></div>';
        return;
      }
      if (kind === 'pending') {
        el.innerHTML = '<div class="bx">' + head + who + '<p>ส่งคำขอเข้าใช้แล้ว<br>รอผู้ดูแลระบบอนุมัติ</p><button class="b" id="clg-re">ตรวจอีกครั้ง</button><button class="b l" id="clg-out">เปลี่ยนบัญชี</button><div class="m" id="clg-m"></div></div>';
      } else {
        var pages = (me.pages || []);
        el.innerHTML = '<div class="bx">' + head + who + '<p>บัญชีนี้ใช้หน้า<b> ' + esc(pages.map(function (p) { return PAGE_NAME[p]; }).join(' / ') || '-') + '</b><br>เปิดหน้านี้ไม่ได้</p>' +
          pages.map(function (p) { return '<a class="b" href="' + PAGE_URL[p] + '">ไป' + esc(PAGE_NAME[p]) + '</a>'; }).join('') +
          '<button class="b l" id="clg-out">เปลี่ยนบัญชี</button></div>';
      }
      var re = document.getElementById('clg-re'); if (re) re.onclick = function () { setScreenMsg('กำลังตรวจ…'); res(); };
      document.getElementById('clg-out').onclick = function () { signOut(); location.reload(); };
    });
  }
  function setScreenMsg(t, bad) { var m = document.getElementById('clg-m'); if (m) { m.textContent = t; m.className = 'm' + (bad ? ' bad' : ''); } }
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
