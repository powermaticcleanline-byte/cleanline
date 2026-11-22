/* CLEANLINE — ฟังก์ชันช่วยที่ใช้ร่วมกันทุกหน้า (Management · Man · Console)
 * เดิมเขียนซ้ำในแต่ละหน้า → รวมไว้ที่นี่ที่เดียว (สร้างจาก tools/make_shared.py · แก้ที่นี่ได้เลย)
 * โหลดก่อนสคริปต์หลักของหน้า: config.js → gdb.js → shared.js → สคริปต์ในหน้า
 * ประกาศเป็นตัวแปรระดับบนสุด (classic script) ทุกหน้าจึงเรียกชื่อเดิมได้เหมือนเดิม — ห้ามประกาศชื่อเหล่านี้ซ้ำในหน้า */
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TM=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TMF=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const isoOf=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;   // Date → YYYY-MM-DD เวลาท้องถิ่น (ใช้ที่เดียว)
const isoAdd=(k,n)=>{const d=new Date(k+'T00:00:00');d.setDate(d.getDate()+n);return isoOf(d)};
const today=()=>{const d=new Date();return isoOf(d)};
function fd(iso){if(!iso)return '—';const [y,m,d]=String(iso).split('-').map(Number);if(!y||!m)return esc(iso);return `${d} ${TM[m-1]} ${String(y+543).slice(2)}`}
function errInfo(e,fb){e=e||{};const c=e.code||'',m=String(e.message||e||'');
  const human=m&&/[ก-๙]/.test(m)&&!/HTTP|\/exec|:\s*[a-z]+\//i.test(m)&&m.length<120;
  if(c==='network')return {t:'ต่ออินเทอร์เน็ตไม่ได้',b:'ตรวจสัญญาณ แล้วกดอีกครั้ง'};
  if(c==='server')return {t:'ระบบหลังบ้านไม่ตอบ',b:'รอสักครู่แล้วกดอีกครั้ง'};
  if(c==='busy')return {t:'ระบบกำลังบันทึกงานอื่นอยู่',b:'รอสักครู่แล้วกดอีกครั้ง'};
  if(c==='denied')return {t:'ทำส่วนนี้ไม่ได้',b:'บัญชีของคุณยังไม่มีสิทธิ์ทำส่วนนี้ ถ้าต้องทำ ให้คนที่ตั้งสิทธิ์ใน Console เพิ่มสิทธิ์ให้'};
  if(c==='conflict')return {t:'มีคนแก้งานนี้ก่อนคุณ',b:human?m:'ดูข้อมูลล่าสุดแล้วกดอีกครั้ง'};
  if(c==='not-found')return {t:'ไม่พบข้อมูลนี้แล้ว',b:'อาจถูกลบไปแล้ว ลองเปิดหน้านี้ใหม่'};
  if(c==='auth')return {t:'ต้องเข้าสู่ระบบใหม่',b:human?m:'เข้าสู่ระบบอีกครั้งแล้วทำต่อได้เลย'};
  return {t:fb||'ทำไม่สำเร็จ',b:human&&m!==fb?m:'ลองอีกครั้ง ถ้ายังไม่ได้ แจ้งออฟฟิศ'}}
function showErr(e,fb){const {t,b}=errInfo(e,fb);let el=document.getElementById('errc');if(!el){el=document.createElement('div');el.id='errc';el.setAttribute('role','alert');document.body.appendChild(el)}
  el.innerHTML=`<span class="ei"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></span><div><b>${esc(t)}</b><span>${esc(b)}</span></div><button type="button" class="ex" aria-label="ปิด">×</button>`;
  el.hidden=false;el.querySelector('.ex').onclick=()=>{el.hidden=true};clearTimeout(showErr.t);showErr.t=setTimeout(()=>{el.hidden=true},12000)}
function invUnits(e){e=e||{};const U=Array.isArray(e.units)?e.units.filter(u=>u&&(u.model||u.sn||u.wifiSn)):[];if(U.length)return U;return e.model||e.sn||e.wifiSn?[{role:'Master',model:e.model||'',sn:e.sn||'',wifiSn:e.wifiSn||''}]:[]}
const isImp=j=>/^x\d+$/.test(String(j&&j.id||''));
const xCan=j=>j.status==='lost'&&/^ยกเลิก \(จาก Excel\)/.test(j.lostReason||'');
const catNum=v=>{const m=String(v??'').replace(/,/g,'').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):''};
function loadXLSX(){return new Promise((res,rej)=>{if(window.XLSX)return res();const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=()=>rej(new Error('โหลดตัวอ่าน Excel ไม่ได้'));document.head.appendChild(s)})}
function pid(c,m){return (c+'-'+m).replace(/[^A-Za-z0-9_.-]+/g,'-').replace(/^[.]+/,'').slice(0,120)}
