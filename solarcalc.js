/* CLEANLINE — SolarCalc: วิเคราะห์โหลดจากไฟล์ CSV ของ momohub และจำลอง Solar + แบตเตอรี่
 * ย้ายสูตรมาจาก Excel "รายงานการตรวจวัดโหลด Solar 7.6.3" (ชีต คำนวณค่า + ลงข้อมูล) แบบบรรทัดต่อบรรทัด
 * ชื่อตัวแปรในคอมเมนต์อ้างอิงคอลัมน์/ช่องใน Excel เดิม (เช่น Y = Total load power, AE = Inverter output limit)
 * ใช้: SolarCalc.parseCSV(text) → {days:[{date, rows}], ...}
 *      SolarCalc.run(parsed, input, data?) → ผลลัพธ์ทั้งหมด
 * data ไม่ส่งมา = ใช้ราคาและค่าตั้งต้นใน DEFAULTS (ภายหลังจะดึงจาก Console)
 */
(function (root) {
  'use strict';
  var DEFAULTS = {"packages": [{"name": "3 kWp", "inverter": "CL 5KTL-P1", "type": "On-Grid Inverter", "size": "5kW", "phase": "1 เฟส", "kind": 1, "kw": 5, "kwp": 3.125, "panels": 5, "price": 89900}, {"name": "5 kWp", "inverter": "CL 5KTL-P1", "type": "On-Grid Inverter", "size": "5kW", "phase": "1 เฟส", "kind": 1, "kw": 5, "kwp": 5, "panels": 8, "price": 99000}, {"name": "5 kWp 3P", "inverter": "CL 5KTL-P3", "type": "On-Grid Inverter", "size": "5kW", "phase": "3 เฟส", "kind": 1, "kw": 5, "kwp": 5, "panels": 8, "price": 109000}, {"name": "10 kWp 3P", "inverter": "CL 10KTL-P3", "type": "On-Grid Inverter", "size": "10kW", "phase": "3 เฟส", "kind": 1, "kw": 10, "kwp": 10, "panels": 16, "price": 189000}, {"name": "5 kWp Pro", "inverter": "CL 5KHB-P1LV", "type": "Hybrid Inverter", "size": "5kW", "phase": "1 เฟส", "kind": 2, "kw": 5, "kwp": 5, "panels": 8, "price": 130000}, {"name": "10 kWp Pro", "inverter": "CL 10KHB-P3LV", "type": "Hybrid Inverter", "size": "10kW", "phase": "3 เฟส", "kind": 2, "kw": 10, "kwp": 10, "panels": 16, "price": 270000}, {"name": "30 kWp 3P", "inverter": "CL 30KTL-P3", "type": "On-Grid Inverter", "size": "30kW", "phase": "3 เฟส", "kind": 1, "kw": 30, "kwp": 30, "panels": 48, "price": 567000}, {"name": "60 kWp 3P", "inverter": "CL 60KTL-P3", "type": "On-Grid Inverter", "size": "60kW", "phase": "3 เฟส", "kind": 1, "kw": 60, "kwp": 60, "panels": 96, "price": 1134000}], "batteries": [{"model": "CBL02-5L20", "usable": 4.6080000000000005, "price": 34000}, {"model": "CBL02-10L20", "usable": 9.216000000000001, "price": 60000}, {"model": "CBL02-16L20", "usable": 14.463000000000001, "price": 74000}], "panel": {"model": "SPDG625-N132R12", "brand": "YN SUNPRO POWER", "watt": 625, "price": 3300, "install": 3700}, "rates": {"normal": 4.5, "onPeak": 5.7982, "offPeak": 2.6369, "vat": 0.07}, "dirs": {"ทิศใต้": 1, "ทิศตะวันออก": 0.85, "ทิศตะวันตก": 0.85, "ทิศเหนือ": 0.6, "ทิศตะวันออกเฉียงเหนือ": 0.7, "ทิศตะวันออกเฉียงใต้": 0.95, "ทิศตะวันตกเฉียงใต้": 0.95, "ทิศตะวันตกเฉียงเหนือ": 0.7}, "curve": [["06:30", 0.05357706646617544], ["06:35", 0.1507005026223851], ["06:40", 0.2462480350816918], ["06:45", 0.3404865192533464], ["06:50", 0.4336663998989536], ["06:55", 0.5260220310536567], ["07:00", 0.6177719959868853], ["07:05", 0.7091194290857743], ["07:10", 0.8002523348467321], ["07:15", 0.891343909939792], ["07:20", 0.98255286221152], ["07:25", 1.0740237327444504], ["07:30", 1.1658872148587704], ["07:35", 1.258260475984173], ["07:40", 1.351247477621456], ["07:45", 1.4449392952843993], ["07:50", 1.5394144403994119], ["07:55", 1.634739179265523], ["08:00", 1.7309678551704906], ["08:05", 1.8281432073236488], ["08:10", 1.926296693001575], ["08:15", 2.025448806449731], ["08:20", 2.125609400849271], ["08:25", 2.226778008240615], ["08:30", 2.3289441594102414], ["08:35", 2.432087705910533], ["08:40", 2.5361791388796746], ["08:45", 2.641179911302004], ["08:50", 2.7470427567939737], ["08:55", 2.8537120118969597], ["09:00", 2.9611239348340064], ["09:05", 3.069207027601692], ["09:10", 3.1778823558378235], ["09:15", 3.2870638686633242], ["09:20", 3.3966587208104784], ["09:25", 3.5065675913257905], ["09:30", 3.6166850059365743], ["09:35", 3.7268996557421588], ["09:40", 3.8370947195901977], ["09:45", 3.9471481827613957], ["09:50", 4.056933159117477], ["09:55", 4.166318210938584], ["10:00", 4.2751676687681766], ["10:05", 4.383341953547358], ["10:10", 4.4906978953230805], ["10:15", 4.597089055590857], ["10:20", 4.702366046029169], ["10:25", 4.806376850812512], ["10:30", 4.908967145379336], ["10:35", 5.009980618497252], ["10:40", 5.109259292123966], ["10:45", 5.206643841331243], ["10:50", 5.301973916281611], ["10:55", 5.3950884611298875], ["11:00", 5.485826036150797], ["11:05", 5.5740251367112705], ["11:10", 5.659524515321095], ["11:15", 5.742163500688889], ["11:20", 5.82178231952048], ["11:25", 5.898222416485453], ["11:30", 5.971326774295505], ["11:35", 6.0409402353409405], ["11:40", 6.106909820998794], ["11:45", 6.169085053327763], ["11:50", 6.22731827449627], ["11:55", 6.281464968356943], ["12:00", 6.331384080000078], ["12:05", 6.37693833710324], ["12:10", 6.417994570080623], ["12:15", 6.454424032397242], ["12:20", 6.48610272167798], ["12:25", 6.512911699632468], ["12:30", 6.534737413113078], ["12:35", 6.55147201419976], ["12:40", 6.563013681097914], ["12:45", 6.5692669383865905], ["12:50", 6.57014297775163], ["12:55", 6.565559978389047], ["13:00", 6.555443427619593], ["13:05", 6.5397264413231255], ["13:10", 6.5183500846384845], ["13:15", 6.491263692235293], ["13:20", 6.458425189200057], ["13:25", 6.419801411115486], ["13:30", 6.375368425143279], ["13:35", 6.325111850017947], ["13:40", 6.269027176767111], ["13:45", 6.207120089651255], ["13:50", 6.139406785840833], ["13:55", 6.065914296986193], ["14:00", 5.986680808614437], ["14:05", 5.901755981892393], ["14:10", 5.811201272830829], ["14:15", 5.715090254239328], ["14:20", 5.613508934956997], ["14:25", 5.506556080904204], ["14:30", 5.394343536338795], ["14:35", 5.276996542787003], ["14:40", 5.154654061460235], ["14:45", 5.027469091817409], ["14:50", 4.895608994147494], ["14:55", 4.759255807970078], ["15:00", 4.618606574775697], ["15:05", 4.473873656580338], ["15:10", 4.3252850572781085], ["15:15", 4.173084744143182], ["15:20", 4.017532966162378], ["15:25", 3.8589065771183755], ["15:30", 3.6974993535152976], ["15:35", 3.5336223177640136], ["15:40", 3.3676040560179104], ["15:45", 3.199791041439596], ["15:50", 3.030547952314066], ["15:55", 2.860257993610446], ["16:00", 2.6893232185972806], ["16:05", 2.5181648468690696], ["16:10", 2.3472235877453045], ["16:15", 2.176959957935253], ["16:20", 2.007854604927445], ["16:25", 1.8404086246768543], ["16:30", 1.6751438849602778], ["16:35", 1.5126033434520991], ["16:40", 1.3533513693233203], ["16:45", 1.1979740647578296], ["16:50", 1.0470795831652708], ["16:55", 0.9012984523104137], ["17:00", 0.761283892320705], ["17:05", 0.6277121386612521], ["17:10", 0.5012827603182473], ["17:15", 0.3827189825670416], ["17:20", 0.27276800561054415], ["17:25", 0.1722013259914661], ["17:30", 0.08181505766611963], ["17:35", 0.0024302511232576762]], "sunStart": "06:30", "sunEnd": "17:30", "curvePanels": 16, "battEff": 0.9, "sets": [{"pkg": "5 kWp Pro", "battery": "CBL02-5L20", "price": 165000}, {"pkg": "5 kWp Pro", "battery": "CBL02-10L20", "price": 214900}, {"pkg": "5 kWp Pro", "battery": "CBL02-16L20", "price": 253900}, {"pkg": "10 kWp Pro", "battery": "CBL02-10L20", "price": 328900}, {"pkg": "10 kWp Pro", "battery": "CBL02-16L20", "price": 350000}], "roiYears": 25, "source": "รายงานการตรวจวัดโหลด Solar 7.6.3 (ราคาชุด) · ลิสต์ราคา 1 ต.ค. 2569 (ก่อน VAT)"};

  var MIN = 1440;
  function hm(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : null; }

  /* ---------- อ่านไฟล์ CSV ที่ Export จาก momohub ----------
   * คอลัมน์ Timestamp, Power1, Power2, Power3, Total Power · เวลาปัดเป็นนาที (เหมือน Power Query ในไฟล์ 7.6.3)
   * แยกเป็นวัน เรียงวันที่จากเก่าไปใหม่ · นาทีซ้ำใช้แถวแรก (เหมือน VLOOKUP) */
  function parseCSV(text) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) throw new Error('ไฟล์ว่าง');
    var split = function (l) { return l.split(',').map(function (x) { return x.trim().replace(/^"|"$/g, ''); }); };
    var head = split(lines[0]).map(function (h) { return h.toLowerCase(); });
    var col = function (re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; };
    var iT = col(/^timestamp|^time|เวลา/), i1 = col(/^power\s*1$/), i2 = col(/^power\s*2$/), i3 = col(/^power\s*3$/), iTot = col(/^total\s*power$/);
    if (iT < 0 || iTot < 0) throw new Error('ไม่พบคอลัมน์ Timestamp หรือ Total Power · ตอน Export ให้เลือก Power1, Power2, Power3 และ Total Power');
    var byDay = {}, bad = 0, total = 0;
    for (var k = 1; k < lines.length; k++) {
      var c = split(lines[k]), m = String(c[iT] || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (!m) { bad++; continue; }
      var date = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
      var mi = (+m[4]) * 60 + (+m[5]) + ((+m[6] || 0) >= 30 ? 1 : 0);
      if (mi >= MIN) { mi -= MIN; var d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); date = d.toISOString().slice(0, 10); }
      var D = byDay[date] || (byDay[date] = {});
      if (D[mi]) continue;
      D[mi] = [i1 < 0 ? 0 : num(c[i1]) || 0, i2 < 0 ? 0 : num(c[i2]) || 0, i3 < 0 ? 0 : num(c[i3]) || 0, num(c[iTot]) || 0];
      total++;
    }
    var dates = Object.keys(byDay).sort();
    if (!dates.length) throw new Error('อ่านเวลาในไฟล์ไม่ได้ (ต้องเป็นแบบ 2026-11-18 00:01)');
    var days = dates.map(function (dt) {
      var D = byDay[dt], mins = Object.keys(D).map(Number).sort(function (a, b) { return a - b; }), gap = 0, gapAt = null, prev = -1;
      mins.concat([MIN]).forEach(function (x) { if (x - prev - 1 > gap) { gap = x - prev - 1; gapAt = prev + 1; } prev = x; });
      return { date: dt, map: D, count: mins.length, maxGap: gap, maxGapAt: gapAt };
    });
    return { days: days, rows: total, skipped: bad, phases: i1 >= 0 && i2 >= 0 && i3 >= 0 };
  }

  /* ค่าของนาที t ในวันหนึ่ง: ไม่มีข้อมูล → ใช้ค่านาทีถัดไป (IFERROR(VLOOKUP(...), B5)) · หลัง 23:59 = 0 */
  function fillDay(D, idx) {
    var out = new Float64Array(MIN), nxt = 0;
    for (var t = MIN - 1; t >= 0; t--) { var r = D[t]; nxt = r ? r[idx] : nxt; out[t] = nxt; }
    return out;
  }

  function pick(list, key, val) { for (var i = 0; i < list.length; i++) if (list[i][key] === val) return list[i]; return null; }

  /* input = {pkg, units, battery ('-' = ไม่มี), batteries, extraPanels, roofs:[{dir, n}],
   *          supply ('3 เฟส' | 'เฟส 1' | 'เฟส 2' | 'เฟส 3'), meter ('tou' | 'normal'), days:[true,...]} */
  function run(parsed, input, data) {
    var S = data || DEFAULTS, I = input || {}, warn = [];
    var P = pick(S.packages, 'name', I.pkg);
    if (!P) throw new Error('ไม่พบ Package ' + (I.pkg || ''));
    var units = Math.max(1, +I.units || 1);
    var hasBatt = !!I.battery && I.battery !== '-';
    var B = hasBatt ? pick(S.batteries, 'model', I.battery) : null;
    if (hasBatt && !B) throw new Error('ไม่พบแบตเตอรี่ ' + I.battery);
    var nb = hasBatt ? Math.max(0, +I.batteries || 0) : 0;
    var extra = Math.max(0, +I.extraPanels || 0);
    var supply = I.supply || (P.phase === '1 เฟส' ? 'เฟส 1' : '3 เฟส');

    /* วันที่เลือก (ติ๊กเลือกวัน C2:G2) */
    var sel = parsed.days.filter(function (d, i) { return !I.days || I.days[i] !== false; });
    if (!sel.length) throw new Error('ยังไม่ได้เลือกวันที่จะใช้คำนวณ');
    var nd = sel.length;

    /* ---------- ส่วนที่ 1: เฉลี่ยการใช้ไฟรายนาที (B–Z) ---------- */
    var G = new Float64Array(MIN), M = new Float64Array(MIN), Sx = new Float64Array(MIN), T = new Float64Array(MIN);
    sel.forEach(function (d) {
      var a = fillDay(d.map, 0), b = fillDay(d.map, 1), c = fillDay(d.map, 2), e = fillDay(d.map, 3);
      for (var t = 0; t < MIN; t++) { G[t] += a[t]; M[t] += b[t]; Sx[t] += c[t]; T[t] += e[t]; }
    });
    var Y = new Float64Array(MIN), Z = new Float64Array(MIN);
    for (var t = 0; t < MIN; t++) {
      G[t] /= nd; M[t] /= nd; Sx[t] /= nd; T[t] /= nd;
      Y[t] = supply === '3 เฟส' ? T[t] : supply === 'เฟส 1' ? G[t] : supply === 'เฟส 2' ? M[t] : Sx[t];      // Y
      Z[t] = supply !== '3 เฟส' ? Y[t] : Math.min(G[t], M[t], Sx[t]) * 3;                                   // Z
    }

    /* ---------- ส่วนที่ 2: จำลอง Solar (AA–AE) ---------- */
    var curve = {}; S.curve.forEach(function (x) { curve[hm(x[0])] = x[1]; });
    var s0 = hm(S.sunStart), s1 = hm(S.sunEnd);
    var AA = new Float64Array(MIN), nx = 0;
    for (t = MIN - 1; t >= 0; t--) {
      var v = (t < s0 || t > s1) ? 0 : (t in curve ? curve[t] : nx);                       // AA (ช่วงไม่มีแดด = 0, ไม่มีค่า = นาทีถัดไป)
      AA[t] = v; nx = v;
    }
    var roofs = [], roofN = 0;
    (I.roofs || []).forEach(function (r) {
      var n = +r.n || 0; if (!n) return;
      var f = S.dirs[r.dir]; if (f == null) { warn.push('ไม่รู้จักทิศ ' + r.dir); f = 0; }
      roofs.push([f, n]); roofN += n;                                                          // AO (ตัวคูณทิศ) × AP (จำนวนแผง)
    });
    var panelsTotal = P.panels * units + extra;
    if (roofN !== panelsTotal) warn.push('วางแผงตามทิศหลังคา ' + roofN + ' แผง แต่ระบบมี ' + panelsTotal + ' แผง (Package ' + P.panels * units + ' + เพิ่ม ' + extra + ')');
    var cap = P.kw * units;                                                                    // กำลังผลิต (AG1)
    var AC = new Float64Array(MIN), AE = new Float64Array(MIN), AF = new Float64Array(MIN);
    for (t = 0; t < MIN; t++) {
      var AB = AA[t] / S.curvePanels;                                                          // AB
      var ac = 0; for (var k = 0; k < roofs.length; k++) ac += AB * roofs[k][0] * roofs[k][1]; AC[t] = ac;   // AC (บวกทีละทิศ ลำดับเดียวกับ Excel)
      var AD = AC[t] / 3;                                                                      // AD
      AE[t] = supply !== '3 เฟส' ? Math.min(Y[t], AD * 3)
        : P.kind === 1 ? Math.min(G[t], M[t], Sx[t], AD) * 3 : Math.min(Y[t], AD * 3);         // AE
      var d = AE[t] - AC[t];                                                                   // AF
      AF[t] = d !== 0 ? (d < -cap ? -cap : d) : (Y[t] > cap ? cap - AE[t] : Y[t] - AE[t]);
    }

    /* ---------- ส่วนที่ 3: จำลองแบตเตอรี่ (AL–AW) ----------
     * ระดับพลังงานในแบตเก็บเป็นค่าติดลบ (ลบมาก = ไฟเต็มมาก) · Bc = -(ความจุใช้งานได้ × จำนวนลูก) (AN1)
     * แถวแรก (00:00) ต่อจากแถวสุดท้าย (23:59) → วนคำนวณจนค่าคงที่ */
    var Bc = hasBatt ? -(B.usable * nb) : 0;
    var AL = new Float64Array(MIN), AM = new Float64Array(MIN + 1), AN = new Float64Array(MIN), AG = new Float64Array(MIN);
    for (t = 0; t < MIN; t++) AL[t] = AF[t] / 60;
    var step = function (al, am) { var s = al + am; if (s > 0) return 0; return s < Bc ? am : s; };
    var start = 0;
    for (var it = 0; it < 200; it++) {
      AM[0] = start;
      for (t = 0; t < MIN; t++) AM[t + 1] = step(AL[t], AM[t]);
      if (Math.abs(AM[MIN] - start) < 1e-12) break;
      start = AM[MIN];
    }
    var AU = 0, AV = 0, AW = 0, h9 = 540, h22 = 1320;
    for (t = 0; t < MIN; t++) {
      var s = AL[t] + AM[t];
      AN[t] = s > 0 ? 0 : (s < Bc ? 0 : AM[t + 1]);                                            // AN ("0" = ว่าง/เต็ม)
      AG[t] = (s > 0 || s < Bc) ? 0 : AF[t];                                                   // AG Battery power (AN = "0" → 0)
      if (AL[t] > 0 && AN[t] < 0) {
        AU += AL[t];                                                                           // AU4 ไฟที่แบตจ่ายทั้งวัน
        if (t > h9 && t <= h22) AV += AL[t]; else if (t > h22 || t < h9) AW += AL[t];          // AV4 On-Peak / AW4 Off-Peak
      }
    }

    /* ---------- รวมหน่วยไฟต่อวัน (ลงข้อมูล แถว 25) ---------- */
    var sum = function (a) { var x = 0; for (var i = 0; i < MIN; i++) x += a[i]; return x / 60; };
    var E = { load: sum(Y), minPhase: sum(Z), solarMax: sum(AC), solarUsed: sum(AE) };
    E.excess = E.solarMax - E.solarUsed;                                                       // I25
    E.battery = AU * S.battEff;                                                                // J25

    /* ---------- เงิน (แถว 29, 33, 37) ---------- */
    var vat = 1 + S.rates.vat, tou = I.meter === 'tou';
    var rate = (tou ? S.rates.onPeak : S.rates.normal) * vat;                                  // A29
    var off = S.rates.offPeak * vat;                                                           // AW2
    var battBaht = hasBatt ? rate * AU * S.battEff : 0;                                        // I29 = AX4 × 0.9
    var battBahtTOU = hasBatt ? (AV * rate + AW * off) * S.battEff : 0;                        // AY4 × 0.9 (คำนวณไว้ แต่ Excel ไม่ได้ใช้)
    var day = rate * E.solarUsed + battBaht;                                                   // C29
    var money = { rate: rate, offRate: off, battDay: battBaht, battDayTOU: battBahtTOU, day: day, month: day * 30, year: day * 30 * 12 };

    var bPrice = hasBatt ? B.price : 0;
    var panelUnit = S.panel.price + S.panel.install;                                           // R3 = P3 + Q3
    var set = hasBatt ? (S.sets || []).filter(function (x) { return x.pkg === P.name && x.battery === B.model; })[0] : null;
    var nSet = set ? Math.min(units, nb) : 0;
    var lines = [];
    if (nSet) lines.push({ item: 'ชุด ' + P.name + ' + ' + B.model, qty: nSet, unit: set.price });
    if (units - nSet) lines.push({ item: 'Package ' + P.name, qty: units - nSet, unit: P.price });
    if (nb - nSet > 0) lines.push({ item: 'แบตเตอรี่ ' + B.model, qty: nb - nSet, unit: bPrice });
    if (extra) lines.push({ item: 'แผงเพิ่ม ' + S.panel.watt + ' W (รวมค่าติดตั้ง)', qty: extra, unit: panelUnit });
    var net = lines.reduce(function (a, l) { return a + l.qty * l.unit; }, 0);
    var price = { lines: lines, net: net, vat: net * S.rates.vat, total: net * vat };           // A33
    var payback = money.year > 0 ? price.total / money.year : null;                            // E33
    var bill = { now: rate * E.load * 30 };                                                    // A37
    bill.cut = bill.now ? money.month / bill.now : 0; bill.after = bill.now - money.month; bill.afterYear = bill.after * 12;
    var roi = { years: S.roiYears, pct: price.total ? (money.year * S.roiYears - price.total) / price.total : null };

    /* ---------- ตรวจความถูกต้อง (คอลัมน์ M ในหน้า ลงข้อมูล) ---------- */
    if (P.kind === 1 && hasBatt) warn.push('Package On-Grid ใส่แบตเตอรี่ไม่ได้');
    if (P.phase === '3 เฟส' && supply !== '3 เฟส') warn.push('Inverter 3 เฟส ต้องจ่ายไฟ 3 เฟส');
    if (P.phase === '1 เฟส' && supply === '3 เฟส') warn.push('Inverter 1 เฟส ต้องเลือกจ่ายเข้าเฟสใดเฟสหนึ่ง');
    if (supply === '3 เฟส' && !parsed.phases) warn.push('ไฟล์ไม่มีข้อมูลแยกเฟส (Power1–3)');
    sel.forEach(function (d) { if (d.maxGap >= 30) warn.push('วันที่ ' + d.date + ' ข้อมูลขาดยาว ' + d.maxGap + ' นาที'); });

    /* โปรไฟล์ทุก 15 นาที สำหรับกราฟ */
    var r2 = function (a) { return Array.prototype.map.call(a, function (x) { return Math.round(x * 100) / 100; }); };
    var q = function (a) { var o = []; for (var i = 0; i < MIN; i += 15) { var x = 0; for (var k = 0; k < 15; k++) x += a[i + k]; o.push(Math.round(x / 15 * 100) / 100); } return o; };
    return {
      days: sel.map(function (d) { return d.date; }), from: sel[0].date, to: sel[nd - 1].date,
      pkg: P, units: units, battery: B, batteries: nb, extraPanels: extra, panels: panelsTotal, supply: supply, meter: tou ? 'tou' : 'normal',
      energy: E, money: money, price: price, payback: payback, bill: bill, roi: roi,
      profile: { load: q(Y), solar: q(AC), used: q(AE), battery: q(AF) },
      /* ข้อมูลรายนาที 1,440 จุด สำหรับกราฟในรายงาน (เหมือนกราฟในหน้าปริ้นท์ของ Excel) */
      series: { load: r2(Y), minPhase: supply === '3 เฟส' ? r2(Z) : null, solar: r2(AC), used: r2(AE), battery: r2(AG) },
      warnings: warn,
      _cols: { Y: Y, Z: Z, AA: AA, AC: AC, AE: AE, AF: AF, AG: AG, AM: AM, AN: AN, AU: AU, AV: AV, AW: AW }
    };
  }

  var api = { parseCSV: parseCSV, run: run, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SolarCalc = api;
})(typeof window !== 'undefined' ? window : this);
