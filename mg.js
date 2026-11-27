/* ---------- definitions ---------- */
const STAGES=[null,
 {name:'จองคิวสำรวจ',role:'admin'},
 {name:'รอจัดคนสำรวจ',role:'dispatch'},
 {name:'สำรวจ ออกแบบ',role:'eng'},
 {name:'เสนอลูกค้า',role:'admin'},
 {name:'จองคิวติดตั้ง',role:'admin'},
 {name:'มอบงานติดตั้ง',role:'dispatch'},
 {name:'กำลังติดตั้ง',role:'eng'},
 {name:'เอกสารขนานไฟฟ้า',role:'admin'}];
const LAST=STAGES.length-1;
const ST={BOOK:1,ACCEPT:2,SURVEY:3,OFFER:4,INSREQ:5,INSTALL:6,COMM:7,DOCS:8};
const SLOTS=['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30'];
const PWM_ADDR='บริษัท เพาเวอร์เมติค จำกัด 50/1 ซอยติวานนท์ 40 ถนนติวานนท์ ตำบลท่าทราย อำเภอเมืองนนทบุรี นนทบุรี 11000';
const FOLDER_ROOT='\\\\PWM-SERVER\\Energy\\Solar';
let SV_TEAMS=['ทีม 1','ทีม 2','ทีม 3','ทีม 4'],SV_APPROVAL=[];const PER_TEAM=2;
/* คนลงคิวสำรวจ (ตั้งใน Console): ประจำ = เลือกได้ · ขออนุมัติ = สีเทา ต้องขอใช้ทีละงาน */
function svPeopleSync(){if(!S.me||!S.me.role)return;const L=Object.entries(S.members||{}).map(([id,m])=>({id,...m})).filter(m=>m.status!=='suspended'&&m.name);
  const q=m=>m.queue||(m.role==='eng'?'regular':m.role==='lead'?'approval':'none');
  const reg=L.filter(m=>q(m)==='regular').map(m=>m.name).sort((a,b)=>a.localeCompare(b,'th')),apr=L.filter(m=>q(m)==='approval').map(m=>m.name).sort((a,b)=>a.localeCompare(b,'th'));
  SV_TEAMS=[...reg,...apr];SV_APPROVAL=apr}
const halfOf=t=>t&&t<'12:00'?'am':'pm';
const svLocked=j=>SV_TEAMS.filter(t=>j.queueUnlock!==t&&(SV_APPROVAL.includes(t)||pendDraw(t)>=drawLimit()));   // คนที่ต้องกด "ขอใช้" ก่อนเลือก
const drawLimit=()=>+((S.config&&S.config.queue&&S.config.queue.drawLimit)||3);
const pendDraw=t=>Object.values(S.jobs).filter(j=>j.status==='active'&&j.stage===ST.SURVEY&&(j.surveyTeam===t||j.surveyor===t)&&j.sv&&j.sv.sign&&!j.sv.cad).length;
const svJobsOn=(t,k,ex)=>Object.values(S.jobs).filter(j=>j.id!==ex&&!['lost','cancelled'].includes(j.status)&&(j.surveyTeam||'')===t&&(j.surveyDate||j.queueDate)===k);
/* เหตุผลที่เลือกคนนี้ไม่ได้ (ว่าง = เลือกได้) · time = เวลานัดของงาน (ใช้เช็กเช้า/บ่าย) */
function teamBlock(t,k,ex,time,job){
  const on=svJobsOn(t,k,ex),c=on.length,w=n=>svJobsOn(t,isoAdd(k,n),ex).length>0;
  if(SV_APPROVAL.includes(t)&&!(job&&job.queueUnlock===t))return 'ต้องขออนุมัติ';
  if(c>=PER_TEAM)return 'เต็มวันนี้';
  if(time&&on.some(j=>halfOf(j.queueTime)===halfOf(time)))return halfOf(time)==='am'?'เช้ามีงานแล้ว':'บ่ายมีงานแล้ว';
  if(!c&&((w(-1)&&w(-2))||(w(1)&&w(2))||(w(-1)&&w(1))))return 'ออกติดกันเกิน 2 วัน';
  const pd=pendDraw(t);if(!c&&pd>=drawLimit()&&!(job&&job.queueUnlock===t))return 'รออัปโหลดแบบ '+pd+' งาน';
  return ''} /* ทีมสำรวจ 4 ทีม ทีมละ 2 ที่ต่อวัน ออกสำรวจวันไหน วันถัดไปไม่ออก */
const ROLES={sales_en:['เซลส์ EN','sales'],sales_pm:['เซลส์ Powermatic','sales'],admin:['แอดมิน','admin'],dispatch:['หัวหน้าจัดงาน','dispatch'],lead:['หัวหน้าตรวจแบบ','lead'],eng:['วิศวกร / ผู้คุมงาน','eng'],exec:['ผู้บริหาร','exec']};
const TEAMS=['EN','SA-D1','SA-D2','SA-D3','SA-D4','SA-D5','SA-DD','SA-DP'];
const CATS=['INVERTER','BATTERY','SMART METER','CT','SOLAR PANEL'];

/* field spec: [key,label,type,opts]  type: text|tel|email|date|time|number|area|sel|chk|model */
const SECTIONS=[
 {id:'cust',title:'ลูกค้า',tgt:'customer',stages:[1],owner:'sales',fields:[
  ['firstName','ชื่อ','text'],['lastName','นามสกุล','text'],['phone','เบอร์ติดต่อ','tel'],['email','อีเมล (ไม่บังคับ)','email'],
  ['address','ที่อยู่ลูกค้า (ไม่บังคับ)','area',{full:1}]]},
 {id:'loc',title:'ตำแหน่ง',tgt:'site',stages:[1],owner:'sales',fields:[
  ['mapLink','ลิงก์ Google Maps ตำแหน่งลูกค้า','url',{full:1}]]},
 {id:'order',title:'ผู้แจ้งงานและคิวสำรวจ',tgt:'job',stages:[1],owner:'sales',fields:[
  ['salesTeam','ทีมขาย','sel',TEAMS],['salesPerson','ชื่อเซลส์','text'],
  ['queueDate','วันที่นัดสำรวจ','date'],['queueTime','เวลานัดหมาย','sel',SLOTS],['salesNote','หมายเหตุถึงคนสำรวจ','area',{full:1}]]},
 {id:'wo',title:'ใบงาน',tgt:'job',stages:[3],noForm:true,fields:[
  ['jobNo','เลขที่ใบงาน (YYMMNNN)','text'],['surveyor','คนสำรวจ','text'],['surveyHelpers','คนไปด้วย','text'],['woNote','หมายเหตุใบงาน','area',{full:1}]]},
 {id:'site',title:'ข้อมูลไซต์ตามใบเซอร์เวย์ FM-EN-028-A',tgt:'site',stages:[3],fields:[
  ['phase','ประเภทไฟฟ้า','sel',['1','3']],['utility','ไฟฟ้าพื้นที่','sel',['MEA','PEA']],
  ['meterSize','ขนาดมิเตอร์','sel',['15(45)','30(100)','อื่นๆ']],['meterNo','หมายเลขมิเตอร์','text'],
  ['mainBreaker','เมนเบรกเกอร์','text'],['wireSize','ขนาดสายเมน (sq.mm.)','text'],
  ['houseType','ประเภทบ้าน','sel',['บ้านเดี่ยว','ทาวน์โฮม','ทาวน์เฮาส์','สำนักงาน','อื่นๆ']],
  ['roofStructure','ลักษณะโครงหลังคา','sel',['เหล็ก','ไม้','อื่นๆ']],
  ['roofType','ประเภทของหลังคา','sel',['กระเบื้องซีแพคโมเนีย','กระเบื้องลอนคู่','เมทัลชีท','อื่นๆ']],
  ['roofArea','พื้นที่หลังคา (ตร.ม.)','number']]},
 {id:'req',title:'ความต้องการของลูกค้า',tgt:'job.request',stages:[3],fields:[
  ['wantKwp','ขนาดระบบที่ต้องการติดตั้ง','sel',['5 kWp','10 kWp','30 kWp','อื่นๆ']],['avgBill','ค่าไฟฟ้าเฉลี่ยเดือนละ (บาท)','number'],
  ['systemType','ประเภทระบบ','sel',['On Grid','Hybrid']],['batteryKwh','แบตเตอรี่ (kWh)','sel',['ไม่มี','5','10','16']],
  ['note','หมายเหตุ','area',{full:1}]]},
 {id:'survey',title:'ผลสำรวจและแบบ',tgt:'job',stages:[3],fields:[
  ['loggerDevice','เครื่องตรวจพฤติกรรมการใช้ไฟฟ้า','text'],['logStart','วัดตั้งแต่','date'],['logEnd','ถึง','date'],
  ['proposedKw','ขนาดที่เสนอ (kW)','number'],['inverterQty','จำนวนอินเวอร์เตอร์','number'],
  ['proposedModel','รุ่นอินเวอร์เตอร์ที่เสนอ','model','INVERTER'],['proposedNote','หมายเหตุขนาด','text'],['quoter','ผู้ออกราคา (CC)','text']]},
 {id:'install',title:'ตกลงและนัดติดตั้ง',tgt:'job',stages:[4,5,6],fields:[
  ['agreedDate','วันที่ลูกค้าตกลง','date'],['wantInstallDate','วันที่ลูกค้าสะดวกติดตั้ง','date'],
  ['installDate','วันเริ่มติดตั้ง','date'],['installEnd','ติดตั้งถึงวันที่ (ถ้าหลายวัน)','date'],
  ['installTeam','ผู้รับเหมา / ทีมช่าง','text'],['supervisor','ผู้คุมงาน','text']]},
 {id:'eq',title:'อุปกรณ์ที่ติดตั้ง',tgt:'job.equipment',stages:[7],fields:[
  ['commissionDate','วันที่ติดตั้งเสร็จ','date'],['model','รุ่นอินเวอร์เตอร์','model','INVERTER'],['sn','S/N เครื่อง','text'],['wifiSn','S/N WiFi','text'],
  ['meter','Smart meter','model','SMART METER'],['ct','ขนาด CT','model','CT'],['panels','จำนวนแผง','number'],
  ['plantName','Plant name','text'],['sldAsBuilt','เขียน Single Line ตามที่ติดตั้งจริงแล้ว','chk']]},
 {id:'docs',title:'เอกสารยื่นขนานไฟฟ้า',tgt:'job.docs',stages:[8],fields:[
  ['prepared','เตรียมเอกสาร (Single line, แบบ MEA/PEA, datasheet)','chk'],['signed','ลูกค้าเซ็นแล้ว','chk'],
  ['sentTon','ยื่นเอกสารต่อการไฟฟ้าแล้ว','chk'],['inspected','การไฟฟ้าตรวจแล้ว','chk'],
  ['inspectDate','วันที่การไฟฟ้าตรวจ','date'],['summary','ส่งเอกสารสรุปงานให้ลูกค้าแล้ว','chk'],
  ['note','หมายเหตุ','text',{full:1}]]},
 {id:'pm',title:'ตรวจเช็กประจำปี',tgt:'job',stages:[],fields:[
  ['lastPm','วันที่ตรวจเช็กครั้งล่าสุด','date'],['pmNote','หมายเหตุการตรวจเช็ก','text']]}];

function svSteps(j,s){
  const v=j.sv||{};const req=j.request||{};
  const formOk=!!(s.phase&&s.utility&&s.meterSize&&s.houseType&&s.roofStructure&&s.roofType);
  return [
   {k:'accepted',t:'ตอบรับใบงาน',ok:!!v.accepted,at:v.accepted},
   {k:'folder',t:'สร้างโฟลเดอร์งาน',ok:!!v.folder,at:v.folderAt},
   {k:'onsite',t:'ออกไปสำรวจ ถึงหน้างาน',ok:!!v.onsite,at:v.onsite},
   {k:'form',t:'กรอกข้อมูลตามใบงาน',ok:formOk,auto:true},
   {k:'photos',t:'ถ่ายรูป ส่งเข้าโฟลเดอร์',ok:!!v.photos,at:v.photosAt},
   {k:'sign',t:'ลูกค้าเซ็นปิดงานสำรวจ',ok:!!v.sign,at:v.sign?.at},
   {k:'draw',t:'อัปโหลดแบบติดตั้ง (ทีมช่างทำในแอปช่าง)',ok:!!(v.cad&&v.cadFiled),at:v.cadFiled}];
}
function needs(n,j,c,s){
  const e=j.equipment||{},d=j.docs||{};
  const L={1:[['ทีมขาย',j.salesTeam],['ชื่อ-นามสกุลลูกค้า',c.firstName&&c.lastName],['เบอร์ติดต่อ',c.phone],['ตำแหน่ง (ลิงก์ Google Maps)',s.mapLink],['วันและเวลานัดสำรวจ',j.queueDate&&j.queueTime]],
   2:[['ทีมสำรวจ',j.surveyTeam||j.surveyor]],
   3:[...svSteps(j,s).map(x=>[x.t,x.ok]),['ขนาดที่เสนอ',j.proposedKw],['รุ่นอินเวอร์เตอร์ที่เสนอ',j.proposedModel]],
   4:[['วันที่ลูกค้าตกลง',j.agreedDate]],5:[['วันติดตั้งที่จอง',j.installDate]],
   6:[['ผู้รับเหมา / ทีมช่าง',j.installTeam],['ผู้คุมงาน',j.supervisor]],
   7:[['รุ่นเครื่อง',e.model],['S/N เครื่อง',e.sn],['จำนวนแผง',e.panels],['Single Line ตามจริง',e.sldAsBuilt]],
   8:[['เตรียมเอกสาร',d.prepared],['ลูกค้าเซ็น',d.signed],['ยื่นเอกสารต่อการไฟฟ้า',d.sentTon],['การไฟฟ้าตรวจ',d.inspected],['ส่งเอกสารสรุปงานให้ลูกค้า',d.summary]]};
  return (L[n]||[]).map(([l,v])=>({l,ok:v!==undefined&&v!==null&&v!==''&&v!==false}));
}
const mapsDir=dest=>`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(PWM_ADDR)}${dest?'&destination='+encodeURIComponent(dest):''}`;
function closedDays(){return (S.config&&S.config.survey&&S.config.survey.closed)||{}}
function teamCount(team,k,exceptId){return Object.values(S.jobs).filter(j=>j.id!==exceptId&&!['lost','cancelled'].includes(j.status)&&(j.surveyTeam||'')===team&&(j.surveyDate||j.queueDate)===k).length}
/* ทีมนี้รับเพิ่มได้กี่ที่ในวัน k (ห้ามออกสองวันติดกัน) */
function teamSlots(team,k,exceptId){if(S.me&&S.me.role){if(teamBlock(team,k,exceptId))return 0;return PER_TEAM-svJobsOn(team,k,exceptId).length}const c=teamCount(team,k,exceptId);if(c>=PER_TEAM)return 0;if(!c&&(teamCount(team,isoAdd(k,-1),exceptId)||teamCount(team,isoAdd(k,1),exceptId)))return 0;return PER_TEAM-c}
function teamWhy(team,k,exceptId,time,job){if(S.me&&S.me.role){const b=teamBlock(team,k,exceptId,time,job);return b||('ว่าง '+(PER_TEAM-svJobsOn(team,k,exceptId).length)+' ที่')}const c=teamCount(team,k,exceptId);if(c>=PER_TEAM)return 'เต็ม '+PER_TEAM+' ที่แล้ว';if(!c&&teamCount(team,isoAdd(k,-1),exceptId))return 'ออกสำรวจเมื่อวาน';if(!c&&teamCount(team,isoAdd(k,1),exceptId))return 'ออกสำรวจวันถัดไป';return 'ว่าง '+(PER_TEAM-c)+' ที่'}
function dayInfo(k,exceptId){
  const d=new Date(k+'T00:00:00');const sun=d.getDay()===0;const cl=closedDays()[k];
  const L=Object.values(S.jobs).filter(j=>j.id!==exceptId&&j.status==='active'&&j.stage<=ST.SURVEY&&(j.surveyDate||j.queueDate)===k);
  const slots=SV_TEAMS.reduce((a,t)=>a+teamSlots(t,k,exceptId),0);const noTeam=L.filter(j=>!j.surveyTeam).length;
  const free=Math.max(0,slots-noTeam);const cap=L.length+free;
  const byT={};L.forEach(j=>{if(j.queueTime)byT[j.queueTime]=(byT[j.queueTime]||0)+1});
  const teamsOpen=SV_TEAMS.filter(t=>teamSlots(t,k,exceptId)>0||teamCount(t,k,exceptId)>0).length;
  let taken=Object.keys(byT).filter(t=>byT[t]>=Math.max(1,teamsOpen));
  if(S.me&&S.me.role){const reg=SV_TEAMS.filter(t=>!SV_APPROVAL.includes(t));
    taken=SLOTS.filter(tm=>{const h=halfOf(tm);const avail=reg.filter(t=>!teamBlock(t,k,exceptId,tm)).length;const un=L.filter(j=>!j.surveyTeam&&halfOf(j.queueTime)===h).length;return avail-un<=0})}
  return {sun,closed:sun?'วันหยุด':cl||'',L,taken,left:free,cap,used:L.length};
}
/* PM: ครบ 1 ปีนับจากวันติดตั้ง (หรือจาก PM ครั้งล่าสุด) */
function pmDue(j){const b=j.lastPm||j.installDate;if(!b||!/^\d{4}-\d{2}-\d{2}$/.test(b))return null;const [y,m,d]=b.split('-').map(Number);const x=new Date(y,m-1,d);if(isNaN(x)||x.getMonth()!==m-1||x.getDate()!==d)return null;const ny=y+1,dd=(m===2&&d===29)?28:d;return `${ny}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`}
const dLeft=iso=>Math.round((Date.parse(iso+'T00:00:00+07:00')-Date.parse(today()+'T00:00:00+07:00'))/864e5);
function pmList(within=30){return visibleJobs().filter(j=>j.status==='done'||(j.status==='active'&&j.stage>=ST.COMM)).map(j=>({j,due:pmDue(j)})).filter(x=>x.due&&dLeft(x.due)<=within).sort((a,b)=>a.due.localeCompare(b.due))}
const PHASES=[{k:'pre',name:'สำรวจ ออกแบบ',st:[1,2,3]},{k:'offer',name:'เสนอลูกค้า',st:[4]},{k:'ins',name:'ติดตั้ง',st:[5,6]},{k:'post',name:'หลังติดตั้ง',st:[7,8]}];
const CADABRA='https://claude.ai/artifact/C86iFGHG9map4bEpAVTyzX';
const IC={
 star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
 bell:'<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 chev:'<path d="m9 6 6 6-6 6"/>',
 max:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5m13-5v5h-5"/>',
 warn:'<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/>',
 trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
 eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
 file:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
 home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 list:'<path d="M4 6h16M4 12h16M4 18h10"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 cad:'<path d="M4 20 12 4l8 16"/><path d="M8 14h8"/>',
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
 pin:'<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
 bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
 cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 doc:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
 book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
 pen:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
 wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
 funnel:'<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>'
};
IC.flag='<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>';IC.xc='<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>';
const svg=(k,c='currentColor',w=1.9)=>`<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const SWOOSH='<svg class="sw" width="520" height="230" viewBox="0 0 560 260" aria-hidden="true"><path d="M20 230 V150 Q20 100 70 100 H180 Q230 100 230 150 V170 Q230 220 280 220 H540" fill="none" stroke="#458c10" stroke-opacity=".18" stroke-width="22" stroke-linecap="round"/><path d="M20 230 V150 Q20 100 70 100 H180 Q230 100 230 150 V170 Q230 220 280 220 H540" fill="none" stroke="#dcfce7" stroke-opacity=".5" stroke-width="2"/></svg>';

/* ---------- state ---------- */
const S={db:null,user:null,jobs:{},customers:{},sites:{},products:{},forms:{},meters:{},members:{},appts:{},
 me:{id:null,owner:false,edit:false},loaded:{},
 f:{eng:'',q:'',team:'',status:'all',phase:'',sort:'age',limit:40,pg:0,per:20,cq:'',jmo:0},dirty:new Set(),held:false,names:{}};

/* ---------- utils ---------- */
const TD=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
function fdt(ms){const d=new Date(ms);const t=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;if(new Date().toDateString()===d.toDateString())return 'วันนี้ '+t;return `${d.getDate()} ${TM[d.getMonth()]} ${t}`}
const days=ms=>ms?Math.max(0,Math.floor((Date.now()-ms)/864e5)):0;
const ageCls=d=>d>30?'crit':d>14?'warn':'';
function toast(m){const t=$('#toast');const u=S.undo&&!S.undo.shown&&Date.now()-S.undo.at<2500?S.undo:null;
  t.innerHTML='<span>'+esc(m)+'</span>'+(u?'<button type="button" data-undo>เลิกทำ</button><i class="tbar"></i>':'');if(u)u.shown=1;
  t.hidden=false;t.classList.remove('in');void t.offsetWidth;t.classList.add('in');clearTimeout(toast.t);toast.t=setTimeout(()=>{t.hidden=true;if(u&&S.undo===u)S.undo=null},u?6000:3200)}
/* หลังเปลี่ยนขั้น/สถานะ: เก็บค่าเดิมไว้ให้กด "เลิกทำ" 6 วินาที · ฉลองงานสำคัญ */
function afterHist(j,e,p){
  if(!('stage' in p||'status' in p)||/^เลิกทำ/.test(e.text||''))return;
  if((p.stage||0)>j.stage)S.stAnim={id:j.id};
  /* ส่งให้คนหน้างาน (ขั้นสำรวจ/กำลังติดตั้ง) แล้ว ตัวกลางไม่ให้ออฟฟิศดึงกลับ → ไม่มีปุ่มเลิกทำ */
  const prev={};Object.keys(p).forEach(k=>prev[k]=j[k]===undefined?'':j[k]);
  S.undo=p.stage&&STAGES[p.stage]?.role==='eng'?null:{id:j.id,prev,text:e.text||'',at:Date.now(),shown:0};
  setTimeout(()=>{const u=S.undo;if(u&&!u.shown&&u.id===j.id)toast(u.text.length>48?u.text.slice(0,46)+'…':u.text)},80);
  const big=p.status==='done'?'ปิดงานแล้ว':p.stage===ST.INSREQ&&j.stage===ST.OFFER?'ลูกค้าตกลงแล้ว':p.stage===ST.OFFER&&j.stage===ST.SURVEY?'สำรวจเสร็จ ส่งให้เซลส์แล้ว':'';
  if(big)celebrate(big,j.title||'')}
async function doUndo(){const u=S.undo;S.undo=null;$('#toast').hidden=true;if(u&&u.fn){try{await u.fn();toast(u.done||'เลิกทำแล้ว')}catch(e){if(!e.cl)showErr(e,'เลิกทำไม่ได้')}return}const j=u&&S.jobs[u.id];if(!j)return;
  try{await pushHist(j,ev('back','เลิกทำ: '+u.text),u.prev);toast('เลิกทำแล้ว งานกลับไปขั้นเดิม')}catch(e){if(!e.cl)showErr(e,'เลิกทำไม่ได้')}}
/* บันทึก/ลบแล้วมีแถบ "เลิกทำ" ทุกครั้ง (แบบ Gmail) */
function undoable(text,fn,done){S.undo={fn,text,done,at:Date.now(),shown:0};toast(text)}
/* ถังขยะ (แบบ Drive): ลบ = ย้ายไปถังขยะ 30 วัน กู้คืนได้ · ลบถาวรได้จากหน้าถังขยะ */
const TRASH_COLS={jobs:'งาน',services:'งานบริการ',articles:'บทความ',forms:'แบบฟอร์ม',products:'รุ่นสินค้า'};
const TRASH_DAYS=30;
function canTrash(col){const r=S.me&&S.me.role;return r==='sysadmin'||(r==='admin'&&['jobs','services','articles'].includes(col))}
function trashTitle(col,x){if(!x)return '';return col==='jobs'?(x.title||cOf(x).name||'งาน'):col==='services'?(((mainJob(x.siteId)||{}).title||'')+(x.type==='PM'?' · ตรวจเช็ก':' · แจ้งซ่อม')+(x.date?' '+fd(x.date):'')).replace(/^ · /,''):col==='articles'?(x.title||'ไม่มีชื่อเรื่อง'):col==='forms'?(x.name||'แบบฟอร์ม'):col==='products'?(x.model||'รุ่นสินค้า'):''}
async function toTrash(col,id){const x=(S[col]||{})[id];if(!x)return;const name=trashTitle(col,x);const path=col+'/'+id;
  await w(path,{trashedAt:Date.now(),trashedBy:S.me.id||null});
  undoable('ย้าย “'+(name.length>36?name.slice(0,34)+'…':name)+'” ไปถังขยะแล้ว',()=>w(path,{trashedAt:null,trashedBy:null}),'กู้คืนแล้ว')}
async function restoreTrash(col,id){const x=((S.trash||{})[col]||{})[id];if(!x)return;await w(col+'/'+id,{trashedAt:null,trashedBy:null});
  undoable('กู้คืน “'+trashTitle(col,x)+'” แล้ว',()=>w(col+'/'+id,{trashedAt:Date.now(),trashedBy:S.me.id||null}),'ย้ายกลับไปถังขยะแล้ว')}
/* ลบถาวร: งาน = ลบงาน + ข้อมูลที่ผูกอยู่ (เหมือนลบงานแบบเดิม) */
async function purge(col,id){const j=((S.trash||{})[col]||{})[id];if(!j)return;
  if(col!=='jobs')return w(col+'/'+id,null,'delete');
  const L=[],seen=new Set(),del=p=>{if(!seen.has(p)){seen.add(p);L.push([p,null,'delete'])}};
  for(const b of Object.values(S.meters||{}).filter(b=>b.jobId===id))del('meters/'+b.id);
  for(const x of [...Object.values(S.services||{}),...Object.values((S.trash||{}).services||{})].filter(x=>x.jobId===id))del('services/'+x.id);
  const others=[...Object.values(S.jobs),...Object.values((S.trash||{}).jobs||{})].filter(o=>o.id!==id);
  del('jobs/'+id);
  if(j.siteId&&!others.some(o=>o.siteId===j.siteId)){del('sites/'+j.siteId);for(const x of Object.values(S.services||{}).filter(x=>x.siteId===j.siteId))del('services/'+x.id)}
  if(j.customerId&&!others.some(o=>o.customerId===j.customerId))del('customers/'+j.customerId);
  await wMany(L);
  if(j.jobNo)try{await S.db.doc('jobnos/'+j.jobNo).set({jid:null,freedAt:Date.now(),by:S.me.id||null})}catch(e){}}
function trashList(){const out=[];for(const col of Object.keys(TRASH_COLS))for(const x of Object.values((S.trash||{})[col]||{}))if(canTrash(col))out.push({col,x,left:Math.max(0,TRASH_DAYS-Math.floor((Date.now()-(+x.trashedAt||0))/864e5))});return out.sort((a,b)=>(+b.x.trashedAt||0)-(+a.x.trashedAt||0))}
/* ครบ 30 วัน → ลบถาวรเอง (ทำครั้งเดียวต่อการเปิดแอป โดยคนที่มีสิทธิ์ลบ) */
async function autoPurge(){for(const t of trashList().filter(t=>t.left<=0)){try{await purge(t.col,t.x.id)}catch(e){}}}
function viewTrash(){const L=trashList();
  const row=t=>{const by=t.x.trashedBy?nm(t.x.trashedBy):'';const ago=Math.floor((Date.now()-(+t.x.trashedAt||0))/864e5);
    return `<div class="trr"><span class="pill gy">${TRASH_COLS[t.col]}</span><span class="trn"><b>${esc(trashTitle(t.col,t.x))}</b><small>${by?'ลบโดย '+esc(by)+' · ':''}${ago?ago+' วันก่อน':'วันนี้'}</small></span><span class="trd ${t.left<=5?'r':t.left<=14?'a':''}"><i><u style="width:${Math.round(t.left/TRASH_DAYS*100)}%"></u></i>เหลือ ${t.left} วัน</span>
      <button type="button" class="btn sm" data-trres="${t.col}/${esc(t.x.id)}">กู้คืน</button><button type="button" class="ib trx" data-trdel="${t.col}/${esc(t.x.id)}" aria-label="ลบถาวร" title="ลบถาวร">${svg('trash','currentColor',2)}</button></div>`};
  return pageHead('ถังขยะ','ของที่ลบจะอยู่ที่นี่ '+TRASH_DAYS+' วัน กู้คืนได้ หลังจากนั้นลบถาวรเอง',L.length?'<button type="button" class="btn" data-trempty="1">ล้างถังขยะ</button>':'')+
    `<section class="card trc">${L.length?L.map(row).join(''):`<div class="empty trem">${emp('trash','ถังขยะว่าง','ของที่ลบจะมาอยู่ที่นี่ และกู้คืนได้ภายใน '+TRASH_DAYS+' วัน')}</div>`}</section>`}
function celebrate(t,sub){document.getElementById('cele')?.remove();const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C=['#7cc520','#458c10','#ffd23f','#ff8a3d','#3fa9f5','#ff6b8b'];
  const cf=rm?'':Array.from({length:26},(_,i)=>`<i style="--x:${((Math.random()*2-1)*170).toFixed(0)}px;--y:${(-110-Math.random()*130).toFixed(0)}px;--r:${(Math.random()*540-270).toFixed(0)}deg;background:${C[i%6]};animation-delay:${(Math.random()*90).toFixed(0)}ms"></i>`).join('');
  document.body.insertAdjacentHTML('beforeend',`<div id="cele" role="status"><div class="cf">${cf}</div><span class="ceok" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><div><b>${esc(t)}</b><span>${esc(sub)}</span></div></div>`);
  const el=document.getElementById('cele');el.onclick=()=>el.remove();setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),300)},3800)}
document.addEventListener('click',e=>{if(e.target.closest('[data-undo]'))doUndo()});
/* เว็บกลางนี้เป็นของแอดมินเท่านั้น: เซลส์ใช้ LINE, วิศวกรใช้แอปมือถือ (ตรรกะบทบาทอื่นเก็บไว้ในโค้ดเพื่อส่งต่อ IT) */
function myRole(){const r=S.me&&S.me.role;return r==='sysadmin'?'admin':(r==='dispatch'?'dispatch':'admin')}
const isSys=()=>!!(S.me&&S.me.role==='sysadmin');
const isDispatch=()=>myRole()==='dispatch';
const canCancel=()=>['admin','dispatch'].includes(myRole());
const RESURVEY_DAYS=60;
/* สำรวจมาแล้วกี่วัน (ลูกค้าเซ็นปิดสำรวจ → วันส่งแบบ → วันสำรวจ) */
function svAge(j){const t=j.surveyDoneAt||(j.designSentDate?Date.parse(j.designSentDate+'T00:00:00'):0)||(j.surveyDate?Date.parse(j.surveyDate+'T00:00:00'):0);return t?Math.floor((Date.now()-t)/864e5):0}
function choose(title,msg,opts){return new Promise(res=>{
  const m=$('#modal');m.innerHTML=`<div class="modalbg"><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="chT"><h2 id="chT" style="margin:0;font-size:20px">${esc(title)}</h2><p style="margin:0;color:var(--mut);font-size:16px;line-height:1.6">${esc(msg)}</p><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn" type="button" data-ch="-1">ยกเลิก</button>${opts.map((o,i)=>`<button class="btn ${i===0?'dk':''}" type="button" data-ch="${i}">${esc(o)}</button>`).join('')}</div></div></div>`;
  const done=v=>{m.innerHTML='';document.removeEventListener('keydown',k,true);res(v)};const k=e=>{if(e.key==='Escape'){e.stopPropagation();done(null)}};
  document.addEventListener('keydown',k,true);m.querySelectorAll('[data-ch]').forEach(b=>b.onclick=()=>{const v=+b.dataset.ch;done(v<0?null:v)});m.querySelector('[data-ch="0"]').focus();
})}
/* ถามสำรวจซ้ำ: true = ส่งไปสำรวจซ้ำแล้ว (หยุด) · false = ไปต่อ · null = ยกเลิก */
async function askResurvey(j){const d=svAge(j);if(d<=RESURVEY_DAYS)return false;
  const c=await choose('สำรวจไว้ '+d+' วันแล้ว','สำรวจซ้ำก่อนติดตั้งไหม? ข้อมูลเดิมยังอยู่ คนสำรวจยืนยันหรือแก้ได้',['สำรวจซ้ำ','ไปต่อ ไม่สำรวจซ้ำ']);
  if(c==null)return null;if(c===1)return false;
  const v=j.sv||{},keep={};if(v.folder){keep.folder=v.folder;if(v.folderAt)keep.folderAt=v.folderAt}
  await pushHist(j,ev('back','สำรวจซ้ำ (สำรวจไว้ '+d+' วัน) · เลือกวันนัดใหม่',{from:j.stage,to:ST.BOOK}),{status:'active',lostReason:'',stage:ST.BOOK,stageSince:Date.now(),queueDate:'',queueTime:'',sv:keep,svPrev:v,resurvey:{at:Date.now(),days:d,prevDone:j.surveyDoneAt||null}});
  toast('ส่งไปสำรวจซ้ำแล้ว เลือกวันนัดใหม่');return true}
/* ช่องที่แต่ละบทบาทแก้ไม่ได้ (ตัวกลางตรวจซ้ำทุกครั้ง) */
const F_ASSIGN=['surveyTeam','surveyor','supervisor','installTeam'];
const F_SURVEY_SECS=['site','req','survey'];
function fieldLocked(sec,k){if(isDispatch())return !(F_ASSIGN.includes(k)||k==='woNote');const jj=String(route()).startsWith('job-')?S.jobs[route().slice(4)]:null;if(k==='supervisor'&&jj&&jj.status==='active'&&jj.stage===ST.INSTALL)return false;if(F_ASSIGN.includes(k)&&k!=='installTeam')return true;return false}
function canAct(j){if(!j)return false;const r=myRole();if(j.stage===ST.ACCEPT||j.stage===ST.INSTALL)return r==='admin'||r==='dispatch';const st=STAGES[j.stage];return !!st&&st.role===r}
function secEditable(sec,j){
  if(isDispatch())return sec.id==='install'||sec.id==='wo';
  if(F_SURVEY_SECS.includes(sec.id))return false;
  if(sec.id==='wo')return myGroup()==='admin';   // แอดมินแก้เลขใบงาน/หมายเหตุใบงานได้ (คนสำรวจล็อกไว้ เปลี่ยนผ่านปุ่มจัดทีม)
  if(sec.id==='eq')return (j&&(j.stage>=ST.DOCS||j.status==='done'));
  return true}
function canDraw(){return ['eng','lead'].includes(myGroup())}
function myGroup(){const r=myRole();return r?ROLES[r]?.[1]:null}
function myTeam(){return ''}

function visibleJobs(){let a=Object.values(S.jobs);if(myRole()==='sales_pm'){const t=myTeam();a=a.filter(j=>j.salesTeam===t)}return a}
function mineJobs(){const g=myGroup();if(!g)return [];return visibleJobs().filter(j=>j.status==='active'&&STAGES[j.stage].role===g&&j.stage!==ST.OFFER&&!(g==='admin'&&j.stage===ST.DOCS))}
const cOf=j=>S.customers[j.customerId]||{};
const sOf=j=>S.sites[j.siteId]||{};
const phaseOf=n=>PHASES.find(p=>p.st.includes(n));
const teamTag=t=>t?`<span class="team ${t.startsWith('SA-')?'pm':''}">${esc(t)}</span>`:'';
const realName=c=>[c.firstName,c.lastName].filter(Boolean).join(' ');
// ชื่องานอัตโนมัติจากชื่อลูกค้า: บุคคล = "คุณ<ชื่อ นามสกุล>" · บริษัท/หน่วยงาน = ชื่อเต็มไม่มี "คุณ"
const ORG_RE=/^(บริษัท|บจก|บมจ|หจก|ห้างหุ้นส่วน|ห้าง|ร้าน|โรงเรียน|โรงแรม|โรงงาน|โรงพยาบาล|วัด|มูลนิธิ|สมาคม|สหกรณ์|องค์การ|เทศบาล|มหาวิทยาลัย|นิติบุคคล)/;
const autoTitle=c=>{const n=realName(c||{}).trim();return !n?'':ORG_RE.test(n)?n:'คุณ'+n};
const badTitle=t=>/^คุณ[\s\-–—.]*$/.test(String(t||'').trim());   // ชื่อหลอก เช่น "คุณ- -" จากการจองที่ใส่ชื่อเป็นขีด
function roleWho(r){const L=Object.values(S.members||{}).filter(m=>m&&m.status!=='suspended'&&(m.role===r)).map(m=>m.name).filter(Boolean);
  return L.length?L.join(' / '):({admin:'ออฟฟิศ',dispatch:'คนจัดงาน',lead:'คนตรวจแบบ',eng:'คนหน้างาน',sales:'เซลส์'}[r]||'')}
/* ขั้นถัดไปเป็นของใคร (ชื่อคน) */
function nextWho(j,to){const r=STAGES[to]?.role;if(r==='eng')return (to===ST.COMM?(j.supervisor||j.surveyor):j.surveyor)||roleWho('eng');if(r==='sales')return j.salesPerson||'เซลส์';return roleWho(r)}
/* ประวัติเก่าที่เขียนชื่อตำแหน่งไว้ → แสดงเป็นชื่อคน */
function deRole(t){return String(t||'').replace(/หัวหน้าจัดงาน/g,roleWho('dispatch')).replace(/หัวหน้าตรวจแบบ/g,roleWho('lead')).replace(/หัวหน้าช่าง/g,roleWho('dispatch')).replace(/แอดมิน/g,roleWho('admin')).replace(/ทีมสำรวจ/g,'คนสำรวจ').replace(/วิศวกร \/ ผู้คุมงาน|วิศวกร/g,'คนหน้างาน')}
function ownerOf(j){const r=STAGES[j.stage]?.role;
  if(r==='eng')return (j.stage===ST.COMM?(j.supervisor||j.surveyor):j.surveyor)||roleWho('eng');
  if(r==='sales')return j.salesPerson||(j.salesTeam?'เซลส์ '+j.salesTeam:'เซลส์');
  return roleWho(r)}
function ageTag(j){if(j.status!=='active')return '';const d=days(j.stageSince);return `<span class="tag ${ageCls(d)}">${svg('clock','currentColor',2.6).replace('<svg','<svg width="11" height="11"')}${d} วัน</span>`}
async function names(ids){ids=[...new Set(ids.filter(i=>i&&!String(i).startsWith('demo:')))].filter(i=>!(i in S.names));if(!ids.length||!S.user?.profiles)return;try{const p=await S.user.profiles(ids);for(const i of ids)S.names[i]=p?.[i]?.name||''}catch(e){}}
const nm=id=>id?(String(id).startsWith('demo:')?id.slice(5):(S.names[id]||'ผู้ใช้')):'ระบบ';
/* ลิงก์จากผู้ใช้: รับเฉพาะ http/https กัน javascript: */
const safeUrl=u=>{u=String(u||'').trim();return /^https?:\/\//i.test(u)?u:''};
const normUrl=u=>{u=String(u||'').trim();if(!u)return '';if(/^https?:\/\//i.test(u))return u;if(/^[a-z][a-z0-9+.-]*:/i.test(u))return '';return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(u)?'https://'+u:''};
/* รูปโปรไฟล์ชั่วคราว (ใช้กับทุกผู้ใช้จนกว่าจะมีระบบรูปโปรไฟล์) */
const AVATAR='data:image/webp;base64,UklGRuwNAABXRUJQVlA4IOANAACQPACdASqgAKAAPj0ai0QiIaET2F5oIAPEoNwfgX2YAMMxIn8t2EXCvb/3T0s64/avxV7FO9WQz64/Ev8v7ovg36qfMH/Vf9c+tX+KvsG/mP+W/Z33W/+H+qvvL/tfqAfzr/X9aP6Df7Q+mx+4HwkfuF+3PtT6oj577IP9fy1MvKxD+Af2XzAc6PyO1AvYX+h/Kj0CdiuAD6uf7/wqdSbwJ5pnjR+GHQF/mn94/6/99943/H/9nm5+r//F/ivgS/XL0xPZZ+6ns3IOkQmx5fZA4+cZ3eTqVHKA6rDr4LKRJRPBt9kXCD/beAeAYmdY5B+Cd9Sc4nwr+PYM2UkiyPVqs/3Fwr5Upcxkd3LeqPPt7K8HbMg0SPSPl02BZy7y3YzqbkCy57VHziQMkxZa36ld3DFhuenocnjkT70acCEOU0bV4xC5Ut8mUETbMqEsL54Lwp/YCZrdhKkiNfli/Bxo0GQQCDK18hLuPAzRC4ayJBCMYucbtreAK32fi8qRbY6n5/kl43hSZRJXYXenTBo3wLZlQa6e3OgOy+jZc/bVTmG7S1B+n8p8JGAhAUSk9OM39la0GR6nRfkD7lrUj8Ijyi4OoTSXdTTZXbQ8xCbPKXmCGXM7Yalrp8VD21+ZjStFSJqJqLhNov3M2y8QAP7q0gMCc+t4SBFVpNnsl2BaJbxv2cfz7MUrcGDM/i11E6TEUipnRojDpGfC/EMV4ymhlOA7Uxw1iCYKEnQqZ1n5YcswCNjHoLOIiSTa9UIOlJdpn5WorDxNINP15mFyJvpRCK7cnAPXLVBSlZqyuKzJkX7x2BfwH6C4aYV1VIw07sYKJTLhF8rTSe3wZuJQGCHILBXoX2Tsl0vVI7E4kgRwIXorAOxhfF6+8Iria9bNngmFYCcvd9Chik1aXd1AAt5xSDqrKsDkXXdc0FxyAADwIg9mQeI+a/q8MiUC3HoaVHhvIhxJH1jaY38RzKzol/aUi7p/Iiq+A5LIjmRxo8Xr08Ob2MhSWQfBO7vtnfCXFCYsgE4kFJ5SHIcofb8w/cwinlok4qLPIjaGht9la+X0ua8XsSXoZd5KNeeiy032n+I1NJlIxdUIANLzP5vaahSNuwpNbSwNCni9lZWq6eDuBtm45jNLd3JiqWcXnDwy+jfEIcv8MzvKWT/Phuj0XxWh87/B2Mv6WNqRHnVQ0+cKectGNLpYsN3kRuTO+IJX+f0CVK7pYX6rUlp7xP0+BF9l68cpxf2pOqgvlhIIAazn8wbcRnBQkamU/ed1R5K8l7VvjPy6+Sq8T0whTOsn+8nCzxWoQdpaYvWeYq6YZapzfGQJjIaRRchqLuXus0IFra5qPGUMkwrmmvvmykXO4PKntvYr6z+lUDXsaVfE3PMX3v10W2JIqN8kSwXgKKXtSKavj4JIZ7jQ6G3Q+hb6SP48/DeQ04l2yQrH6v6WY/POCTzH7vQaW9yR4UXShv4RmaiHz/RpAC5bR7ABfpmCconvCwyKGrjuDs2PvLTqx7YLTTOKtW0pTUfRrMGsli19V0bfIcWB/PykvHxyZVMAsa0st06p9RfFiJTfFZzy0z14QRfms4n+kWvdAhxYLbTNlWjC9EGl600g7p3P2bZVavqYgA4QtpTxvN6TUp041kB3TlUX7kBMJsm6ypIpDyL4iqvNwKhdyTOfRLbsc+/Xvr9VpYTbLK9FHUtHFnWfygzqynZ07f7vkAhdf7fGQbEfx/0RiYvWwobw2DpFtEVK4TeSFzA8jAmTPygjJWwpecxvQu+i4jV1sF7E836VhAtUaF3Be59QSmB3/7gRFnL9kFHwk3VqdHnAfFBuuSZPIN40ddVMv0soICL9Izdj6zXHApuw5voW/FsrwIBRwVuxUokzAeH4E6bCxjDGUs3KjZBZQuUvs/ykBm2W3d/lqOIW5+OnP2Oq1cSKh6FGksaijY+tSqk2xshpMWdzTKmmuVOfmpooHS8evaQiYGxqKo2qwf7nNm7hjKt0F/Lcc424H49h2zhUaek8kYPZ6vavS7c+JdVfxuvP1sFLnhlLOPbDN6CUQHt4hIT3JYruJg1a4QCHunsNsJMyXmnILGGoXD3Jh5Xr3xnHL0w937klpvMYE7fNuqVQ3M2arSqnxBRXQVmK0WkLfjJwWiM1CR1BTONLB7mxzslVCUKYJrKeyKBnod/W7hrAAgMGRZAqtvHpYVfkW1mN+96bYPN8RBRxP9OkzPPjiyvoDLnq5DshR6r+lQfLi3UPkIu/sOKL7I6Wsqhg3TeGCtGcQAxP3y+WCwWF2C3iUnEQPcdlrx/GhunhnoEP7DIKHgGl/sg1GjlI7/buekAevytBBeybPznaqZDy/v6bMAOG7c41/rYJQ6fnio2a2ZBvE3woGJ4yKbr55nRworTrfWvhhVyDCMnCiHOg+Xs64EgXpfALXqqqDoxxVVe+X1VnegZrm/AG5DxrckFPpG15Xp1HeQVkUb4sKdUh6meveh362xygb0JM4ekLW4Nk2eE7jHnCnCZ5c6NdxbMZ2A9o6Z3TxTbzDHA9/vx+yH5wll/6n6Ljk6973HkfQEX4/pp50xiwDQXkip6VAfCnmLs30ifBOwm3DuzMFMj8I5Lk9v77bp1gjSke0d7k54h3kEeHYdaoAyNpreAmi+3ycWoTNZxeUOHCbsnGJDL+fa+Vl26Hugu0jI1WsWiHQu4ZQYCuZM7J6xD4q/e3oEu1LkgnUd5My1/jl2Na9CxfIbhkWHvFvZZlcdMhQQQ7LsACCh8MXzEPmPzjMEuPnMvcgaWcXxGlmMjlDNqOCY64zBmNvfvkE+4UkM2JD5FRlWNGHUrSaUTuKA7rTit5ikpe7NiGnBVVmqeLqF4et4Ksp4gj39iGiP6CZOljCP85Q3kgBPPivSE4A4WzZvbamcpYzp8DPsmtjeubXgcPZjyLfX8efxmP7/K8eoEu780l+z2oEZVMI/Cf4ceYO9v6g767us3oN3EgigKIRAjaV23ha4YQwAYNrz5u8bK7sfXLaqJPQO9lB4/K/K+hU4OiSFVPW3PP6dGODk0s3Js9aTqFaTEhDAF+BY1XN4DpKtwnSiv/g4qRf372MEyyltyXC+YNN0XjrGKgrz7nstWt/ya1OH+mmnc6NUmiNc2lBDucAmP1Ui02FFOcT3x2CrusufuViEvb3OasW3k7qewa+x7fwt2pfU4JrLRtXXNMnoe48kFMtBRXI/4NToXKNE4YovMjTq2MgDHMH5Wg+S/rarW6Sb3kqDnvAkExxioVGlJWTpQtkNpNT61cfZTv5JkVK1bFtnZnqmN48j3zlMMu2E+GengtLGgwl3PnOXU1eo/E0SOk6z/Rq4jgYA1G58l0X8tpPefY08Rnks1OZAsqoSPTe23/JeKe+XrLNp0Je2X9qMgjJLiPkO2GQH30uJ/EjQe+p98ZV0t8x2qyY+eSir2FG+V9iHHa62rqmfrD/7aH5X6kzWI8v8YOIfCkLasTZScF9bVRMZ2Ux+GUpJVrXneKzSeIq40IX5e3v9w+37yaD87bcc1HgsSiSFhPDWiatJ5XUXVyVMz84Lk+GFb0O2vEVhXiEsz/E7dOS15zCZZvW7Vnrcv+7LWQSZrvXwIrdAnNHRhP1KM/6EgRy4XBsjLRCZn2AhvpbpKkWw98bm5O/X6na6HfGrWvlsZQd7TR/7YwjNctxKnMq20o4GsEE2iFjr9aOZp1/iWIQHwVW4KgThFFWApoWcQrfb+AVYOJpvsCQFqJQHNAuRIQ3fnnHCsJow9zxXb3STrmF2UTPx2oNYPhuIwIRPY5e+7XHIptxBN8uHhiRz20jPoJ840dUVwaE22T34+L8qMVh03qU6GuXtMsolhvjJWKso7zgRCh1rL/q6B0S4a+1O077ctP0zf24t2z9/vIkDssGPCR3nvDdf/Bl2O+rpB4+bFtiOoptaS37+IbtwbG/ujb4JDh725xmn+za/Z4YBH0/518B1oe4E55Jzpgky2oUUde/3wzuebQzoTmxcKBwS0AcKY3jF165MMIY7SqfS/TKwovVeOhisoovy6LrYeCZLtaX5+eZdwtYbgHT1eB2JSo4J4DSbPmhsfVRLOmjhWp/mAgAHPiMFEh4UivzFjhdjHTzgrJSiu2bICqTvHokLvRkMST3R79u6zU0GlrLU+ONhtxbbQVBdGEPKrzRPpS2FQpc8HuBo89jwzVep5tgckwVyGJ2L5YTqXUKuyebHV64YIj59VTCiY173sPvqk3pxHxVa6Qr/OE8S2e94RVGxX/sSlvj5lQTOnjqxvxPjJc05UZua85awT5Y0ybgK17OnOV23iRB7SAEz8OL6S+YCxY7F1Lvi4HJUQcEbPNUIWbeuCNxRKfvKymD2YCn7L+X2yjf4tl8u3YfNln2Pcoq2PVJhOX6CDdCaXJ8QfN8UB6ALdWIAAFkvcN/qSckXu642HApNV1RDFOLeYaAxAAAh+00OceyXUJ91e8G8sApovkDUZH/JBF4sfohtP99FEJ6yF13e7h3ni+t5I2wUYEW6Sfze8NgFYevc2FhFPBJQHzkKptdECT3LHJaRUll2W3u94j375Y8mKJkP3yY3uGowCjwqLE/mTsIISZGgi14doiPZyXQIaaPla2o1/DtMBIOx8cOg/UMQFYZgEYlq6sN5JuOd3wPLWpd1hDjGVv0DMWttGQd1hq8UI2FckpG3iPOKlQiMtCb+vHZCimNPWuyLnXWJMyKGLr9A9J7UPrz2nGs8nhgAAAAAA=';
const avImg=()=>`<img src="${esc((S.members[S.me.id]||{}).photo||AVATAR)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">`;

/* ---------- db ---------- */
async function w(path,data,mode='update',note){
  if(!S.db){toast('ยังเชื่อมต่อฐานข้อมูลไม่ได้');throw new Error('no db')}
  const meta=logMeta(path,mode);
  try{const r=await S.db.doc(path)[mode](data);logPut(meta,data,note);cvMark(path);return r}
  catch(e){toast(e?.code==='invalid_argument'?'บันทึกไม่ได้: บัญชีนี้ยังไม่มีสิทธิ์แก้ไขข้อมูล':['denied','not-found','busy','network','maintenance','pending'].includes(e?.code)?'บันทึกไม่ได้: '+e.message:'บันทึกไม่สำเร็จ ('+(e?.code||'error')+') ลองอีกครั้ง');throw e}
}
/* ---------- audit log: ใครทำอะไร เมื่อไหร่ (collection logs) ---------- */
const COLN={appts:'คิวอื่น',jobs:'งาน',customers:'ลูกค้า',sites:'ไซต์',products:'รุ่นสินค้า',members:'ผู้ใช้',config:'ตั้งค่า',articles:'บทความ',services:'งานบริการ',forms:'แบบฟอร์ม',meters:'การจองสมาร์ทมิเตอร์'};
function logMeta(path,mode){
  const [col,id]=String(path).split('/');if(!COLN[col])return null;const o=(S[col]||{})[id];
  const ttl=!o?'':col==='jobs'?(o.title||cOf(o).name||''):col==='customers'?(o.name||realName(o)):col==='sites'?o.label:col==='products'?o.model:col==='forms'?o.name:col==='meters'?o.title:col==='articles'?o.title:col==='appts'?o.title:col==='members'?nm(id):col==='services'?((mainJob(o.siteId)||{}).title||''):'';
  return {col,id,ttl:ttl||'',act:mode==='delete'?'del':(mode==='set'&&!o)?'new':'edit'};
}
function logPut(meta,data,note){
  if(!meta||!S.db)return;const A={new:'สร้าง',edit:'แก้ไข',del:'ลบ'};
  const ttl=meta.ttl||(data&&(data.title||data.name||data.model||data.label))||'';
  const fields=data&&meta.act!=='del'?Object.keys(data).filter(k=>!['updatedAt','createdAt','history','by','createdBy'].includes(k)).slice(0,15):[];
  logRaw(meta.act,note||(A[meta.act]+COLN[meta.col]+(ttl?' '+ttl:'')),{col:meta.col,docId:meta.id,title:String(ttl).slice(0,140),fields});
}
function logRaw(act,text,extra={}){
  if(!S.db)return;
  try{S.db.doc('logs/'+S.db.collection('logs').doc().id).set({at:Date.now(),by:S.me.id||null,name:S.names[S.me.id]||'',act,text:String(text||'').slice(0,300),...extra}).catch(()=>{})}catch(e){}
}

/* เลขใบงานไม่ซ้ำ: จองเลขใน jobnos/<เลข> แล้วอ่านกลับ ถ้ามีคนจองทับก็ขยับเลขถัดไป */
const bumpNo=no=>no.slice(0,4)+String((+no.slice(4)||0)+1).padStart(3,'0');
const snapData=sn=>{if(!sn)return null;const ex=typeof sn.exists==='function'?sn.exists():sn.exists;return ex===false?null:(sn.data?sn.data():null)};
/* การจองเลขค้างอยู่จริงไหม: งานเจ้าของต้องยังอยู่ และใช้เลขนี้อยู่ (หรือเพิ่งจองไม่ถึง 10 นาที กำลังสร้างงาน)
   งานที่ลบไปแล้ว / เปลี่ยนเลขไปแล้ว / จองแล้วไม่ได้ใช้ → ถือว่าเลขว่าง */
const NO_HOLD=10*60e3;
function noHeld(r,no,jid){if(!r||!r.jid||r.jid===jid)return false;const o=S.jobs[r.jid];if(!o)return false;return String(o.jobNo||'')===String(no)||Date.now()-(+r.at||0)<NO_HOLD}
async function claimJobNo(jid){
  let no=nextJobNo();
  for(let a=0;a<10;a++){
    if(Object.values(S.jobs).some(x=>x.id!==jid&&x.jobNo===no)){no=bumpNo(no);continue}
    try{
      const ref=S.db.doc('jobnos/'+no);const cur=snapData(await ref.get());
      if(noHeld(cur,no,jid)){no=bumpNo(no);continue}
      await ref.set({jid,at:Date.now(),by:S.me.id||null});
      await new Promise(r=>setTimeout(r,600));
      const chk=snapData(await ref.get());
      if(!chk||chk.jid===jid)return no;
      no=bumpNo(no);
    }catch(e){return no}
  }
  return no;
}
function ev(kind,text,extra={}){return {at:Date.now(),by:S.me.id||null,kind,text,...extra}}
async function pushHist(j,entry,patch={}){
  let base=j.history||[];
  try{const d=snapData(await S.db.doc('jobs/'+j.id).get());
    if(d){if(Array.isArray(d.history))base=d.history;
      if(('stage' in patch||'status' in patch)&&(d.stage!==j.stage||d.status!==j.status)){toast('งานนี้มีคนดำเนินการไปแล้ว หน้าจอจะอัปเดตเป็นข้อมูลล่าสุด');const e=new Error('stale');e.cl=1;throw e}}}
  catch(e){if(e.cl)throw e}
  const hist=[...base,entry].slice(-200);await w('jobs/'+j.id,{...patch,history:hist,updatedAt:Date.now()},'update',entry.text);afterHist(j,entry,patch);
}
addEventListener('unhandledrejection',e=>{if(e.reason&&(e.reason.cl||e.reason.message==='no db'||e.reason.code))e.preventDefault()});
function subscribe(col){
  S.db.collection(col).onSnapshot(snap=>{
    const o={},tr={};snap.docs.forEach(d=>{const x={id:d.id,...d.data()};(x.trashedAt?tr:o)[d.id]=x});(S.trash=S.trash||{})[col]=tr;if(col==='jobs'&&S.loaded.jobs&&S.me)liveFeed(S.jobs||{},o);S[col]=o;
    if(!snap.metadata.fromCache)S.loaded[col]=true;
    if((col==='jobs'||col==='appts')&&CV.pend.size){clearTimeout(CV.pt);CV.pt=setTimeout(cvFlush,300)}
    if(col==='jobs')names(Object.values(o).flatMap(j=>(j.history||[]).slice(-5).map(h=>h.by)));
    if(col==='members')names(Object.keys(o));
    schedule();
  },e=>{S.loaded[col]=true;showErr(e,'อ่านข้อมูลไม่ได้');schedule()});
}

/* ความเคลื่อนไหวจากหน้างาน: คนอื่นบันทึกในงาน → การ์ดเล็กมุมขวาบน 6 วินาที แตะเพื่อเปิดงาน */
function liveFeed(old,nw){Object.values(nw).forEach(j=>{const a=old[j.id];if(!a)return;const h=j.history||[],n=(a.history||[]).length;
  h.slice(n).filter(e=>e.by&&e.by!==S.me.id&&e.text).slice(-2).forEach(e=>feedCard(j,e))})}
function feedCard(j,e){let box=$('#feed');if(!box){document.body.insertAdjacentHTML('beforeend','<div id="feed" aria-live="polite"></div>');box=$('#feed')}
  const nm=S.names[e.by]||'ทีมงาน';while(box.children.length>=3)box.firstChild.remove();
  const el=document.createElement('button');el.type='button';el.className='fd';el.dataset.fdj=j.id;
  el.innerHTML=`<span class="av">${esc(nm.slice(0,1))}</span><span><span><b>${esc(nm)}</b> ${esc(e.text)}</span><small>${esc(j.title||'')} · เมื่อสักครู่</small></span>`;
  box.appendChild(el);setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),260)},6000)}
document.addEventListener('click',e=>{const f=e.target.closest('[data-fdj]');if(f){location.hash='job-'+f.dataset.fdj;f.remove()}});
/* Ctrl+K: ค้นงาน + ไปหน้าต่าง ๆ + จองคิว ในช่องเดียว */
const CK_CMD=[['ภาพรวม','#today','home'],['ปฏิทินงาน','#queue','cal'],['รายการงาน','#jobs','list','data-mine="0"'],['งานที่รอดำเนินการ','#mine','inbox','data-mine="1"'],['จองคิวสำรวจใหม่','#new','plus'],['งานบริการหลังการขาย','#service','wrench'],['สมาร์ทมิเตอร์','#meter','bolt'],['แบบฟอร์มเอกสาร','#kb','file','data-kbt="form"'],['แคตตาล็อกสินค้า','#products','layers','data-kbt="eq"']];
function cmdk(){if($('#cmdk'))return;document.body.insertAdjacentHTML('beforeend',`<div id="cmdk" role="dialog" aria-modal="true" aria-label="ค้นหาและสั่งงาน"><div class="ck"><label class="cki">${svg('search','currentColor',2)}<input id="cki" placeholder="พิมพ์ชื่อลูกค้า เลขงาน เบอร์ หรือคำสั่ง" autocomplete="off" role="combobox" aria-controls="ckl" aria-expanded="true"></label><div class="ckl" id="ckl" role="listbox"></div><div class="ckf"><span><kbd>↑↓</kbd>เลือก</span><span><kbd>Enter</kbd>เปิด</span><span><kbd>Esc</kbd>ปิด</span></div></div></div>`);
  const back=document.activeElement;const ov=$('#cmdk'),inp=$('#cki'),L=$('#ckl');let items=[],on=0;
  const draw=()=>{const q=inp.value.trim().toLowerCase();
    const cmds=CK_CMD.filter(c=>!q||c[0].toLowerCase().includes(q));
    const jobs=q?gMatch(q).slice(0,6):mineJobs().slice(0,5);
    items=[...jobs.map(j=>({h:'#job-'+j.id})),...cmds.map(c=>({h:c[1],x:c[3]||''}))];on=Math.min(on,Math.max(0,items.length-1));let i=0;
    const jh=jobs.length?`<h6>${q?'งาน':'รอคุณอยู่'}</h6>`+jobs.map(j=>{const c=cOf(j);return `<button type="button" class="cko" role="option" data-ck="${i++}"><span class="ci">${svg('sun','currentColor',2)}</span><span><b>${esc(j.title||c.name||'')}</b><small>${esc([j.jobNo?'#'+j.jobNo:'',STAGES[j.stage]?.name||'',c.phone||''].filter(Boolean).join(' · '))}</small></span></button>`}).join(''):'';
    const ch=cmds.length?'<h6>ไปที่ / คำสั่ง</h6>'+cmds.map(c=>`<button type="button" class="cko" role="option" data-ck="${i++}"><span class="ci">${svg(c[2],'currentColor',2)}</span><span><b>${esc(c[0])}</b></span><span class="cr">${c[2]==='plus'?'คำสั่ง':'หน้า'}</span></button>`).join(''):'';
    L.innerHTML=jh+ch||'<p class="ckn">ไม่พบ ลองพิมพ์ชื่อลูกค้า เลขงาน หรือเบอร์โทร</p>';mark()};
  const mark=()=>L.querySelectorAll('.cko').forEach((b,k)=>{b.classList.toggle('on',k===on);b.setAttribute('aria-selected',k===on);if(k===on)b.scrollIntoView({block:'nearest'})});
  const close=()=>{ov.remove();document.removeEventListener('keydown',key,true);back&&back.focus&&back.focus()};
  const go=k=>{const it=items[k];if(!it)return;close();const a=document.createElement('a');a.href=it.h;a.innerHTML='';if(it.x){const m=it.x.match(/^([\w-]+)="(.*)"$/);a.setAttribute(m[1],m[2])}a.hidden=true;document.body.appendChild(a);a.click();a.remove()};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();on=(on+(e.key==='ArrowDown'?1:-1)+items.length)%Math.max(1,items.length);mark()}else if(e.key==='Enter'){e.preventDefault();go(on)}};
  document.addEventListener('keydown',key,true);inp.addEventListener('input',()=>{on=0;draw()});
  L.addEventListener('mousemove',e=>{const b=e.target.closest('[data-ck]');if(b&&+b.dataset.ck!==on){on=+b.dataset.ck;mark()}});
  L.addEventListener('click',e=>{const b=e.target.closest('[data-ck]');if(b)go(+b.dataset.ck)});
  ov.addEventListener('click',e=>{if(e.target===ov)close()});draw();inp.focus()}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&S.me){e.preventDefault();cmdk()}});
document.addEventListener('click',e=>{if(e.target.closest('[data-cmdk]')){e.preventDefault();cmdk()}});

/* เปิดหน้าแรกครั้งแรก: ตัวเลขนับขึ้น กราฟแท่งโตขึ้น */
function introToday(app){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;app.classList.add('cu');setTimeout(()=>app.classList.remove('cu'),1400);
  app.querySelectorAll('.htl b,.dst b,.dnut strong').forEach(b=>{const t=b.firstChild;if(!t||t.nodeType!==3)return;const m=t.nodeValue.match(/^(\d+)/);if(!m)return;const n=+m[1],rest=t.nodeValue.slice(m[1].length);if(n<2)return;
    const t0=performance.now(),D=700;const f=x=>{const k=Math.min(1,(x-t0)/D),e=1-Math.pow(1-k,3);if(!t.isConnected)return;t.nodeValue=Math.round(n*e)+rest;if(k<1)requestAnimationFrame(f)};t.nodeValue='0'+rest;requestAnimationFrame(f)})}
/* ชี้งานในรายการ (คอม) ค้างครู่หนึ่ง → การ์ดสรุป */
(()=>{if(!matchMedia('(hover: hover) and (pointer: fine)').matches)return;let tm=null,cur=null;
  const hide=()=>{clearTimeout(tm);tm=null;cur=null;document.getElementById('jpv')?.remove()};
  document.addEventListener('mouseover',e=>{const tr=e.target.closest('tr[data-sel]');if(tr===cur)return;hide();if(!tr||S.sel)return;cur=tr;
    tm=setTimeout(()=>{const j=S.jobs[tr.dataset.sel];if(!j||!tr.isConnected)return;const c=cOf(j),n=j.stage||0,r=tr.getBoundingClientRect();
      const when=j.stage>=ST.INSREQ&&j.installDate?['วันติดตั้ง',fd(j.installDate)]:svDate(j)?['วันสำรวจ',fd(svDate(j))+(j.queueTime?' '+j.queueTime:'')]:null;
      const el=document.createElement('div');el.id='jpv';el.setAttribute('role','tooltip');
      el.innerHTML=`<b>${esc(j.title||c.name||'')}</b>${jobPill(j)}${j.status==='active'?`<div class="jprog">${STAGES.slice(1).map((x,i)=>`<i class="${i+1<n?'d':i+1===n?'c':''}"></i>`).join('')}</div>`:'<div style="height:10px"></div>'}<dl>${j.status==='active'?`<dt>ผู้รับผิดชอบ</dt><dd>${esc(ownerOf(j))}</dd><dt>อยู่ขั้นนี้มา</dt><dd>${days(j.stageSince)} วัน</dd>`:''}${when?`<dt>${when[0]}</dt><dd>${esc(when[1])}</dd>`:''}${c.phone?`<dt>โทร</dt><dd>${esc(c.phone)}</dd>`:''}</dl>`;
      document.body.appendChild(el);const x=Math.min(innerWidth-316,Math.max(16,e.clientX+12)),y=r.bottom+8+el.offsetHeight>innerHeight?r.top-el.offsetHeight-8:r.bottom+8;el.style.left=x+'px';el.style.top=y+'px'},450)});
  ['scroll','mousedown','keydown','hashchange'].forEach(t=>addEventListener(t,hide,true))})();

function manFiles(j){const df=j.sv&&j.sv.drawFile,sl=j.singleLine,needSl=j.stage>=ST.DOCS;
  const ln=(t,f,miss)=>`<li class="${f?'ok':''}"><span class="k">${f?'✓':'·'}</span><span>${esc(t)}${f?` · <a class="lk" href="${esc(safeUrl(f.url)||'#')}" target="_blank" rel="noopener">เปิดไฟล์</a>`:` <span class="sub">${esc(miss)}</span>`}</span></li>`;
  if(!df&&!needSl&&!sl)return '';
  return `<section class="act" aria-label="ไฟล์จากทีมช่าง"><div><h2>ไฟล์จากทีมช่าง</h2></div>
   <ul class="need">${df?ln('แบบติดตั้ง',df,''):''}${needSl||sl?ln('Single Line สำหรับยื่นขนานไฟ',sl,j.docs?.sentTon?'ยื่นการไฟฟ้าแล้ว ไม่ต้องอัปโหลด':'รอทีมใน Man อัปโหลด'):''}</ul></section>`}
/* 19 ปักหมุดงาน (เก็บในเครื่อง แยกต่อคน) */
const pinKey=()=>'cl.pins.'+(S.me.id||'');
function pins(){try{return JSON.parse(localStorage.getItem(pinKey())||'[]').filter(id=>S.jobs[id])}catch(e){return []}}
function pinSet(id,on){let L=pins().filter(x=>x!==id);if(on)L.unshift(id);try{localStorage.setItem(pinKey(),JSON.stringify(L.slice(0,8)))}catch(e){}render();toast(on?'ปักหมุดแล้ว อยู่บนสุดของหน้าแรก':'เอาหมุดออกแล้ว')}
function pinBtn(j){const on=pins().includes(j.id);return `<button type="button" class="btn pnbtn${on?' on':''}" data-pin="${esc(j.id)}" aria-pressed="${on}" title="${on?'เอาหมุดออก':'ปักหมุดไว้หน้าแรก'}">${svg('star','currentColor',2)}${on?'ปักหมุดแล้ว':'ปักหมุด'}</button>`}
function pinBox(){const L=pins();if(!L.length)return '';
  return `<section class="card" aria-label="งานที่ปักหมุด"><h2>${svg('star','#c58a00',2)}ปักหมุดไว้<small>${L.length} งาน</small></h2><div class="pnlst">${L.map(id=>{const j=S.jobs[id],c=cOf(j);return `<a class="pnr" href="#job-${esc(id)}"><div><b>${esc(j.title||c.name||'')}</b><span>${esc(stOf(j)==='active'?STAGES[j.stage]?.name||'':jobPillTxt(j))}${svDate(j)&&j.stage<=ST.SURVEY?' · '+esc(fd(svDate(j))):j.installDate&&j.stage>=ST.INSREQ?' · ติดตั้ง '+esc(fd(j.installDate)):''}</span></div><button type="button" class="pnx" data-pin="${esc(id)}" data-off="1" aria-label="เอาหมุดออก" title="เอาหมุดออก">${svg('star','currentColor',2)}</button></a>`}).join('')}</div></section>`}
const jobPillTxt=j=>j.status==='done'?'ปิดงานแล้ว':j.status==='lost'?'ยังไม่ตกลง':'ยกเลิก';
/* 16 งานค้างนาน: อยู่ขั้นเดิมเกิน 14 วัน = ส้ม · เกิน 30 วัน = แดง (เฉพาะงานที่กำลังดำเนินการ) */
const agCls=j=>{if(j.status!=='active'||j.stage===ST.OFFER)return '';const d=days(j.stageSince);return d>30?'ag2':d>14?'ag1':''};
const agLegend=()=>`<span class="aglg" aria-label="สีขอบงาน"><span><i style="background:#f59e0b"></i>ค้างขั้นเดิมเกิน 14 วัน</span><span><i style="background:#dc2626"></i>เกิน 30 วัน</span></span>`;
/* 15 ไล่งานก่อน/ถัดไป ตามรายการที่กรองไว้ในหน้ารายการงาน */
function navNb(id){for(const sv of route()==='service'?[true,false]:[false,true]){const L=jobsList(sv?'installed':S.f.status,sv).list;const i=L.findIndex(x=>x.id===id);if(i>=0)return {i,n:L.length,p:L[i-1],x:L[i+1]}}return null}
function navCtl(id){if(!S.loaded.jobs)return '';const nb=navNb(id);if(!nb||nb.n<2)return '';
  return `<div class="jnav" role="group" aria-label="ไล่ดูงาน"><button type="button" class="ib pv" data-jnav="-1" ${nb.p?'':'disabled'} aria-label="งานก่อนหน้า" title="งานก่อนหน้า (ปุ่ม ←)">${svg('chev','currentColor',2)}</button><span aria-live="polite">${nb.i+1}/${nb.n}</span><button type="button" class="ib" data-jnav="1" ${nb.x?'':'disabled'} aria-label="งานถัดไป" title="งานถัดไป (ปุ่ม →)">${svg('chev','currentColor',2)}</button></div>`}
function navGo(d){const r=route();const inJob=r.startsWith('job-');const id=inJob?r.slice(4):S.sel;if(!id)return;const nb=navNb(id);const j=nb&&(d<0?nb.p:nb.x);if(!j)return;
  if(inJob){if(S.dirty.size)return toast('บันทึกหรือยกเลิกส่วนที่แก้อยู่ก่อน');location.hash='#job-'+j.id;return}
  S.sel=j.id;S.dtab=null;render();setTimeout(()=>document.querySelector(`.drw [data-jnav="${d}"]:not([disabled])`)?.focus()||document.querySelector('.drx')?.focus(),0)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-jnav]');if(!b||b.disabled)return;e.preventDefault();navGo(+b.dataset.jnav)});
document.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  const t=e.target;if(/INPUT|TEXTAREA|SELECT/.test(t.tagName)||t.isContentEditable||t.closest?.('[role=tablist],.kd,.cgrid,#gqr,.mnu'))return;
  if(document.querySelector('.modalbg,.fmod,#cki,details.mnu[open]'))return;
  if(!route().startsWith('job-')&&!S.sel)return;e.preventDefault();navGo(e.key==='ArrowLeft'?-1:1)});
/* 14 ติ๊ก "บันทึกแล้ว" ข้างช่องที่เพิ่งบันทึก (หายเองใน 7 วินาที) */
function svTick(sec,k){const v=S.saved;if(!v||v.sec!==sec||!v.keys.includes(k))return '';const el=Date.now()-v.at;if(el>7000)return '';return `<i class="svok" style="animation-delay:-${el}ms" role="img" aria-label="บันทึกแล้ว" title="บันทึกแล้ว">✓</i>`}
/* 13 เปลี่ยนหน้าแบบค่อย ๆ จาง (เบราว์เซอร์ที่ไม่รองรับ = เปลี่ยนทันทีเหมือนเดิม) */
function vt(f){if(!document.startViewTransition||document.hidden||navigator.webdriver||matchMedia('(prefers-reduced-motion: reduce)').matches)return f();const h=document.documentElement;h.classList.add('vtg');try{document.startViewTransition(f).finished.finally(()=>h.classList.remove('vtg'))}catch(e){h.classList.remove('vtg');f()}}
/* 12 เป้าประจำเดือน: ตั้งในหน้าตั้งค่า (config/goal) · นับงานติดตั้งเสร็จในเดือนนี้ + kW รวม */
/* แจ้งเตือนบนเครื่อง (เลือกเปิดเองในหน้าตั้งค่า · จำต่อเครื่องต่อคน)
   แสดงเมื่อมีความเคลื่อนไหวใหม่จากคนอื่น ขณะแอปเปิดค้างไว้แต่ไม่ได้ดูอยู่ · ปิดแอปแล้วจะไม่เด้ง (ต้องมีเซิร์ฟเวอร์ push)
   ไม่ใช้ service worker (ตกลงกันไว้ว่าไม่มี SW/แคช) → ได้บนคอมพิวเตอร์ · Chrome บน Android ไม่รองรับแบบนี้ */
const ntfKey=()=>'cl.ntf.'+(S.me.id||'');
const ntfOn=()=>{try{return 'Notification' in window&&Notification.permission==='granted'&&localStorage.getItem(ntfKey())==='1'}catch(e){return false}};
let ntfAt=Date.now();
function ntfShow(title,body,id){const opt={body,tag:'cl-'+id,icon:'icon-mg-192.png'};try{const n=new Notification(title,opt);n.onclick=()=>{focus();if(id)location.hash='#job-'+id;n.close()}}catch(e){}}
function ntfCheck(){if(!S.loaded.jobs||!myGroup())return;const A=actItems().filter(x=>x.at>ntfAt);if(!A.length)return;ntfAt=Math.max(...A.map(x=>x.at));
  if(!ntfOn()||document.visibilityState==='visible')return;
  if(A.length>3)return ntfShow('CLEANLINE · ความเคลื่อนไหวใหม่ '+A.length+' รายการ',A.slice(0,3).map(x=>(x.j.title||'')+': '+x.h.text).join('\n'),A[0].j.id);
  A.forEach(x=>ntfShow((S.names[x.h.by]||'ทีมงาน')+' · '+(x.j.title||cOf(x.j).name||'งาน'),x.h.text,x.j.id))}
function ntfCard(){if(!('Notification' in window)||/Android/i.test(navigator.userAgent))return '';const p=Notification.permission,on=ntfOn();
  return `<section class="card pad" style="display:flex;flex-direction:column;gap:12px" aria-label="แจ้งเตือนบนเครื่องนี้"><h2 style="margin:0;font-size:16px">แจ้งเตือนบนเครื่องนี้</h2>
    <p class="sub" style="margin:0">เด้งแจ้งเตือนเมื่อมีคนบันทึกในงาน ขณะเปิดแอปค้างไว้ (สลับไปทำอย่างอื่นได้) · ถ้าปิดแอปไปแล้วจะไม่เด้ง</p>
    ${p==='denied'?'<p class="sub" style="margin:0;color:#b45309">เครื่องนี้บล็อกการแจ้งเตือนไว้ เปิดได้ที่การตั้งค่าเว็บไซต์ของเบราว์เซอร์</p>':`<div><button type="button" class="btn ${on?'':'pri'}" data-ntfset="${on?0:1}">${on?'ปิดแจ้งเตือน':'เปิดแจ้งเตือน'}</button>${on?' <button type="button" class="btn ghost" data-ntftest>ลองแจ้งเตือน</button>':''}</div>`}</section>`}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-ntfset],[data-ntftest]');if(!b)return;
  if(b.dataset.ntftest!==undefined)return ntfShow('CLEANLINE','แจ้งเตือนบนเครื่องนี้ใช้งานได้','');
  if(b.dataset.ntfset==='1'){const r=await Notification.requestPermission();if(r!=='granted'){render();return toast('ยังไม่ได้อนุญาตการแจ้งเตือน')}try{localStorage.setItem(ntfKey(),'1')}catch(x){}toast('เปิดแจ้งเตือนแล้ว')}
  else{try{localStorage.removeItem(ntfKey())}catch(x){}toast('ปิดแจ้งเตือนแล้ว')}render()});
document.addEventListener('click',async e=>{const t=e.target.closest('[data-goalsave],[data-goaledit],[data-goalcancel],[data-pfedit],[data-pfcancel]');if(!t)return;
  if(t.dataset.goaledit){S.goalEdit=true;render();$('#glJobs')?.focus();return}
  if(t.dataset.goalcancel){S.goalEdit=false;render();return}
  if(t.dataset.pfedit){S.pfEdit=true;render();$('#pfname')?.focus();return}
  if(t.dataset.pfcancel){S.pfEdit=false;S.pf2=null;S.pfn=null;render();return}
  const n=v=>Math.max(0,Math.round((parseFloat(document.getElementById(v)?.value)||0)*10)/10);const old={...(S.config?.goal||{})};
  const d={jobs:Math.round(n('glJobs')),kw:n('glKw'),updatedAt:Date.now()};try{await w('config/goal',d,'set');S.goalEdit=false;render();undoable(d.jobs||d.kw?'บันทึกเป้าแล้ว':'เลิกใช้เป้าแล้ว',()=>w('config/goal',{jobs:+old.jobs||0,kw:+old.kw||0,updatedAt:Date.now()},'set'),'คืนเป้าเดิมแล้ว')}catch(x){}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-pin]');if(!b)return;e.preventDefault();e.stopPropagation();pinSet(b.dataset.pin,b.dataset.off?false:!pins().includes(b.dataset.pin))},true);
/* 18 กดเบอร์โทรแล้วคัดลอก: ห่อเบอร์ที่โชว์เป็นตัวหนังสือ (ไม่แตะช่องกรอก/ลิงก์/ปุ่ม) */
const PH_RE=/(^|[^\d])(0\d{1,2}[- ]?\d{3}[- ]?\d{3,4})(?!\d)/g;
function phWrap(root){const W=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>/0\d/.test(n.nodeValue)&&!n.parentElement.closest('input,textarea,a,button,script,style,select,option,[contenteditable],.phc')?1:2});
  const T=[];while(W.nextNode())T.push(W.currentNode);
  T.forEach(n=>{const v=n.nodeValue;PH_RE.lastIndex=0;if(!PH_RE.test(v))return;PH_RE.lastIndex=0;const f=document.createDocumentFragment();let i=0,m;
    while((m=PH_RE.exec(v))){const st=m.index+m[1].length;f.append(v.slice(i,st));const b=document.createElement('button');b.type='button';b.className='phc';b.dataset.copy=m[2];b.title='แตะเพื่อคัดลอกเบอร์';b.textContent=m[2];f.append(b);i=st+m[2].length}
    f.append(v.slice(i));n.replaceWith(f)})}
async function copyTxt(t){try{await navigator.clipboard.writeText(t);return true}catch(e){const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch(x){}a.remove();return ok}}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;e.preventDefault();e.stopPropagation();toast(await copyTxt(b.dataset.copy)?'คัดลอกเบอร์ '+b.dataset.copy+' แล้ว':'คัดลอกไม่ได้ เลือกตัวเลขแล้วกดคัดลอกเอง')},true);
/* 21 กระดิ่ง: ความเคลื่อนไหวจากคนอื่น แยก วันนี้ / ก่อนหน้า · อ่านแล้วทั้งหมด */
const actKey=()=>'cl.actSeen.'+(S.me.id||'');
function actSeen(){try{return +localStorage.getItem(actKey())||0}catch(e){return 0}}
function actItems(){const L=[],lim=Date.now()-7*864e5;visibleJobs().forEach(j=>(j.history||[]).forEach(h=>{if(h.by&&h.by!==S.me.id&&h.text&&h.at>lim)L.push({j,h,at:h.at})}));return L.sort((a,b)=>b.at-a.at).slice(0,30)}
function ago(ms){const m=Math.floor((Date.now()-ms)/6e4);return m<1?'เมื่อสักครู่':m<60?m+' นาทีที่แล้ว':m<1440?Math.floor(m/60)+' ชั่วโมงที่แล้ว':Math.floor(m/1440)+' วันที่แล้ว'}
function actBody(A){if(!A.length)return `<div class="nte">${svg('check','currentColor',2)}<b>ยังไม่มีความเคลื่อนไหว</b><span>คนอื่นบันทึกในงานแล้วจะขึ้นที่นี่</span></div>`;
  const seen=actSeen(),t0=new Date();t0.setHours(0,0,0,0);const G=[['วันนี้',A.filter(x=>x.at>=+t0)],['ก่อนหน้า',A.filter(x=>x.at<+t0)]];
  return G.filter(g=>g[1].length).map(([t,L],gi)=>`<div class="ntact"><h6>${t}</h6>${gi===0&&A.some(x=>x.at>seen)?'<button type="button" data-ntread>อ่านแล้วทั้งหมด</button>':''}</div>${L.map(({j,h})=>{const nm=S.names[h.by]||'ทีมงาน',ph=(S.members[h.by]||{}).photo;
    return `<a class="nta ${h.at>seen?'new':''}" href="#job-${esc(j.id)}"><span class="av">${ph?`<img src="${esc(ph)}" alt="">`:esc(nm.slice(0,1))}</span><div><b>${esc(nm)}</b> ${esc(h.text)}<small>${esc(j.title||cOf(j).name||'')} · ${ago(h.at)}</small></div></a>`}).join('')}`).join('')}
/* 20 พาทัวร์ครั้งแรก: การ์ดชี้ทีละจุด · กดข้ามได้ · จำต่อคน */
const tourKey=()=>'cl.tour.'+(S.me.id||'');
function tourSeen(){try{return !!localStorage.getItem(tourKey())}catch(e){return true}}
function tour(){if(tourSeen()||document.getElementById('tour')||route()!=='today')return;if(document.getElementById('clg')){setTimeout(tour,500);return}
  const ST5=[['#gq','ค้นหาอะไรก็ได้','ชื่อลูกค้า เลขงาน เบอร์โทร หรือ S/N · กด Ctrl K เพื่อค้นและสั่งงานเร็ว ๆ'],['.hs-r .hs-wl,.hchips','งานที่รอคุณ','แตะเพื่อเปิดงานที่รอคุณทำอยู่'],['.hs-qa .btn,.hqa','จองคิวสำรวจ','เริ่มงานใหม่จากปุ่มนี้'],['#bellbtn','กระดิ่งแจ้งเตือน','ดูว่าใครทำอะไรในงานบ้าง และงานที่ค้างอยู่']].filter(x=>{const el=document.querySelector(x[0]);return el&&el.offsetParent});
  if(!ST5.length)return;let i=0;document.body.insertAdjacentHTML('beforeend','<div id="tour" role="dialog" aria-modal="true" aria-label="แนะนำการใช้งาน"><div class="tsp"></div><div class="tcd"><b></b><p></p><div class="tcf"><small></small><button type="button" data-tskip>ข้าม</button><button type="button" class="tnx" data-tnext>ถัดไป</button></div></div></div>');
  const box=document.getElementById('tour'),sp=box.querySelector('.tsp'),cd=box.querySelector('.tcd');
  const end=()=>{try{localStorage.setItem(tourKey(),'1')}catch(e){}box.remove();removeEventListener('resize',show);removeEventListener('hashchange',end);document.removeEventListener('keydown',key,true)};
  const show=()=>{const [q,t,d]=ST5[i],el=document.querySelector(q);if(!el)return end();el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect(),pd=6;
    Object.assign(sp.style,{left:r.left-pd+'px',top:r.top-pd+'px',width:r.width+pd*2+'px',height:r.height+pd*2+'px'});
    cd.querySelector('b').textContent=t;cd.querySelector('p').textContent=d;cd.querySelector('small').textContent=(i+1)+' / '+ST5.length;cd.querySelector('[data-tnext]').textContent=i===ST5.length-1?'เริ่มใช้งาน':'ถัดไป';
    const W=cd.offsetWidth,H=cd.offsetHeight,below=r.bottom+16+H<innerHeight;cd.style.transform=`translate(${Math.min(innerWidth-W-16,Math.max(16,r.left))}px,${below?r.bottom+16:Math.max(16,r.top-16-H)}px)`;cd.querySelector('[data-tnext]').focus()};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();end()}};
  cd.addEventListener('click',e=>{if(e.target.closest('[data-tskip]'))end();else if(e.target.closest('[data-tnext]')){i++;i<ST5.length?show():end()}});
  addEventListener('resize',show);addEventListener('hashchange',end);document.addEventListener('keydown',key,true);show()}
let drwFrom=null;
/* ย้อนกลับแบบ Gmail: ← / Back ของเบราว์เซอร์ / Esc กลับไปหน้าเดิม ตัวกรองและตำแหน่งเลื่อนยังอยู่ */
const NAV={prev:'',inApp:false,scr:{},fromJob:''};
const ROUTE_NAME={today:'ภาพรวม',jobs:'รายการงาน',service:'งานบริการ',queue:'ปฏิทินงาน',customers:'ลูกค้า',meter:'สมาร์ทมิเตอร์'};
function backTo(){return NAV.inApp&&NAV.prev&&!NAV.prev.startsWith('job-')?NAV.prev:(S.f&&S.f.mine?'jobs':'jobs')}
function backLabel(){const r=backTo();return 'กลับไป'+(ROUTE_NAME[r]||'รายการงาน')}
async function jobBack(){if(S.dirty&&S.dirty.size&&!await confirmBox('ทิ้งการแก้ไข?','ข้อมูลที่แก้ในหน้านี้ยังไม่ได้บันทึก','ทิ้ง','pri'))return;S.dirty.clear();S.edit=null;
  if(NAV.inApp&&NAV.prev&&!NAV.prev.startsWith('job-'))history.back();else location.hash=backTo()}
function openDrawer(id){drwFrom=id;S.sel=id;S.dtab=null;document.body.classList.add('dlock');render();setTimeout(()=>document.querySelector('.drx')?.focus(),0)}
function closeDrawer(){const id=S.sel;S.sel=null;document.body.classList.remove('dlock');render();if(id)setTimeout(()=>document.querySelector(`tr[data-sel="${CSS.escape(id)}"]`)?.focus(),0)}
let rq=0;function schedule(){cancelAnimationFrame(rq);rq=requestAnimationFrame(render)}

/* ---------- render ---------- */
function route(){return (location.hash||'#today').slice(1)}
function render(){
  svPeopleSync();
  const r=route();document.documentElement.dataset.r=r.startsWith('job-')?'job':r;
  if(r==='sites'||r.startsWith('site-')){const jj=r.startsWith('site-')?mainJob(r.slice(5)):null;if(jj){S.sel=jj.id;S.dtab='hist';document.body.classList.add('dlock')}else S.f.sst='installed';location.replace('#service');return}
  if(r==='customers'){location.replace('#jobs');return}
  if((r==='kb-new'||r.startsWith('kb-edit-'))&&S.kbDirty&&document.getElementById('kbForm'))return;
  if(r.startsWith('job-')&&S.dirty.size){S.held=true;const b=$('#heldNote');if(b)b.hidden=false;return}
  const act=document.activeElement,aid=act?.id,sel=act?.selectionStart;
  renderSide(r);try{const mb=document.querySelector('#mnav [data-mmore]'),n=document.querySelector('#nav1 a[href="#mine"] i')?.textContent||'';if(mb){let e=mb.querySelector('.mmb');if(n){if(!e){e=document.createElement('i');e.className='mmb';mb.appendChild(e)}e.textContent=n;mb.setAttribute('aria-label','อื่นๆ · งานรอดำเนินการ '+n)}else if(e){e.remove();mb.removeAttribute('aria-label')}}}catch(x){}
  /* 27 พ.ย.: หน้าปฏิทินพับเมนูซ้ายเป็นค่าเริ่มต้น (ออกจากหน้าแล้วคืนแบบเดิม · ถ้ากดขยายเองในหน้านี้ ใช้ตามที่กด) */
  if(r!=='queue'&&document.getElementById('cvpop')?.classList.contains('show'))cvClose();
  if(r==='queue'){if(!S.cvMinR){S.cvMinR=1;if(!document.body.classList.contains('sbmin')){document.body.classList.add('sbmin');S.cvAutoMin=1}}}
  else if(S.cvMinR){S.cvMinR=0;if(S.cvAutoMin&&document.body.classList.contains('sbmin'))document.body.classList.remove('sbmin');S.cvAutoMin=0}
  if(r==='queue')requestAnimationFrame(cvFit);
  const app=$('#app');
  if(!S.db){app.innerHTML=`<div class="card empty">${S.noDb?`<b style="display:block;font-size:20px;margin-bottom:8px">เชื่อมต่อไม่ได้</b>ตรวจอินเทอร์เน็ต แล้วกดลองอีกครั้ง<div style="margin-top:16px"><button type="button" class="btn pri" data-retry="1">ลองอีกครั้ง</button></div>`:'กำลังเชื่อมต่อฐานข้อมูล…'}</div>`;return}
  let h;
  if(isSales())h=viewSales(r);
  else if(r==='new'){/* 27 พ.ย. 21:17 จองคิวสำรวจย้ายมาอยู่ในหน้าปฏิทิน */S.cvBk=1;S.nf=S.nf||{};if(S.f.qd){if(cvBkOk(S.f.qd))S.nf.date=S.f.qd;S.f.qsel=S.f.qd;S.f.cvm=S.f.qd.slice(0,8)+'01';S.f.qd=''}location.replace('#queue');return}
  else if(r==='jobs'){if(S.f.mineR){S.f.mine=false;S.f.mineR=false;S.f.status='all'}h=viewJobs()}
  else if(r==='mine'){if(!S.f.mine){S.f.mine=true;S.f.phase='';S.f.status='active'}S.f.mineR=true;h=viewJobs()}
  else if(r==='products'){S.f.kqt='eq';h=viewEquip()}
  else if(r==='queue')h=viewCal(); /* 27 พ.ย. ปฏิทินใหม่แบบ Google (หน้าเดิม viewQueue ไม่ใช้แล้ว) */
  else if(r==='service')h=viewJobs('service');
  else if(r==='kb')h=viewKb();
  else if(r==='meter')h=viewMeter();
  else if(r==='trash')h=viewTrash();
  else if(r==='kb-new')h=viewKbEdit('');
  else if(r.startsWith('kb-edit-'))h=viewKbEdit(r.slice(8));
  else if(r.startsWith('kb-'))h=viewKbRead(r.slice(3));
  else if(r==='settings')h=['sales','eng','lead'].includes(myGroup())&&!S.me.owner?'<div class="card empty">หน้านี้สำหรับแอดมินและผู้บริหาร</div>':viewSettings();
  else if(r.startsWith('job-'))h=viewJob(r.slice(4));
  else if(r==='today'||r==='')h=viewToday();
  else h=`<div class="card pad nf404">${emp('search','ไม่พบหน้านี้','ลิงก์อาจพิมพ์ผิดหรือหน้านี้ถูกย้ายแล้ว')}<div style="text-align:center;margin-top:12px"><a class="btn" href="#today">กลับหน้าภาพรวม</a></div></div>`;
  app.innerHTML=hdr(r)+'<div class="pg">'+h+'</div>';
  if(r==='today'&&S.loaded.jobs&&!S.cuDone){S.cuDone=1;introToday(app)}
  if(!S.purgeDone&&S.loaded.jobs&&S.me&&Object.keys(TRASH_COLS).some(canTrash)){S.purgeDone=1;setTimeout(autoPurge,4000)}
  phWrap(app);if(r==='today'&&S.loaded.jobs&&!tourSeen())setTimeout(tour,700);
  mountApps();
  setupStick();
  ntfCheck();
  if(aid){const el=document.getElementById(aid);if(el){el.focus();try{if(sel!=null)el.setSelectionRange(sel,sel)}catch(e){}}}
}
const APPS=[
 {name:'CADabra',desc:'วาดผังแผงและแบบ SLD',href:()=>CADABRA,icon:'cad',bg:'#16171a',fg:'#dcfce7',draw:true},
 {name:'EV Charger',desc:'กำลังพัฒนา',icon:'bolt',bg:'#eef0f3',fg:'#9a9ca3',soon:true}];
let stickObs=null;
function setupStick(){
  if(stickObs){stickObs.disconnect();stickObs=null}
  const k=document.querySelector('.hkpi'),b=$('#hsb');if(!k||!b)return;
  stickObs=new IntersectionObserver(([en])=>{const on=!en.isIntersecting&&en.boundingClientRect.top<0;b.classList.toggle('on',on);b.parentElement.setAttribute('aria-hidden',String(!on));b.querySelectorAll('a').forEach(a=>a.tabIndex=on?0:-1)},{threshold:0});
  stickObs.observe(k);
}
function mountApps(){
  const w=$('#appw');if(!w)return;
  w.innerHTML=`<button class="appbtn" id="appbtn" aria-label="เครื่องมือ" aria-haspopup="true" aria-expanded="${!!S.apps}" title="เครื่องมือ">${'<i></i>'.repeat(9)}</button>
    ${S.apps?`<div class="apppan" role="menu" aria-label="เครื่องมือ"><div class="apph">เครื่องมือของแผนก</div><div class="appg">${APPS.filter(a=>!a.draw||canDraw()).map(a=>a.soon
      ?`<span class="appi soon" aria-disabled="true"><span class="ic" style="background:${a.bg}">${svg(a.icon,a.fg,2)}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span>`
      :`<a class="appi" role="menuitem" href="${esc(a.href())}" target="_blank" rel="noopener"><span class="ic" style="background:${a.bg}">${svg(a.icon,a.fg,2)}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></a>`).join('')}</div></div>`:''}`;
}
document.addEventListener('click',e=>{
  if(e.target.closest('#appbtn')){S.apps=!S.apps;S.pf=false;S.bell=false;render();if(S.apps)setTimeout(()=>document.querySelector('.apppan a')?.focus(),0);return}
  if(S.apps&&!e.target.closest('.apppan')){S.apps=false;render()}
  if(e.target.closest('#navtog')){S.navOff=!S.navOff;document.body.classList.toggle('navoff',S.navOff);render();return}
  if(e.target.closest('#pfbtn')){S.pf=!S.pf;S.bell=false;S.apps=false;render();return}
  if(e.target.closest('#pfout')&&S.me.role){S.pf=false;render();confirmBox('ออกจากระบบ?','ครั้งหน้าต้องลงชื่อเข้าใช้ด้วยบัญชี Google อีกครั้ง','ออกจากระบบ','pri').then(y=>{if(y)CLGDB.user.signOut()});return}
  
  if(S.pf&&!e.target.closest('.pfm')){S.pf=false;render()}
  if(e.target.closest('#bellbtn')){S.pf=false;S.apps=false;if(S.bell){S.bell=false}else{S.bell=true;S.bellSeenAt=bellSeen();try{localStorage.setItem('cl.bellSeen',String(Date.now()))}catch(x){}}render();if(S.bell)setTimeout(()=>document.querySelector('.ntp a')?.focus(),0);return}
  if(e.target.closest('[data-nttab]')){S.ntTab=e.target.closest('[data-nttab]').dataset.nttab;render();return}
  if(e.target.closest('[data-ntread]')){try{localStorage.setItem(actKey(),String(Date.now()))}catch(x){}render();return}
  if(S.bell&&(!e.target.closest('.ntp')||e.target.closest('a'))){S.bell=false;render()}
});
document.addEventListener('click',e=>{if(S.mp&&!e.target.closest('.mnav')){S.mp=null;render()}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.pf){S.pf=false;render();$('#pfbtn')?.focus();return}if(e.key==='Escape'&&S.bell){S.bell=false;render();$('#bellbtn')?.focus();return}
  if(e.key==='Escape'&&S.sel){closeDrawer();return}
  if(e.key==='Escape'&&document.querySelector('.fmod')){closeModal();return}
  if(e.target.matches?.('.kd[data-qsel]')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)){e.preventDefault();const st={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key]||0;const d=new Date(e.target.dataset.qsel+'T00:00:00');d.setDate(d.getDate()+st);const k=isoOf(d);const el=document.querySelector(`.kd[data-qsel="${k}"]`);if(el&&!el.classList.contains('ko')){S.f.qsel=k;render();setTimeout(()=>document.querySelector('.kd.kon')?.focus(),0)}return}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('tr[data-fmrow],tr[data-mtedit]')){e.preventDefault();e.target.click();return}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('tr[data-sel]')){e.preventDefault();location.hash='job-'+e.target.dataset.sel;return}
  if(e.key==='Escape'&&route().startsWith('job-')&&!document.querySelector('.fmod,#modal .modal,.mnu[open]')&&!S.mp&&!S.eqv&&!S.apps&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName||'')){e.preventDefault();jobBack();return}
  if(e.key==='Escape'&&S.mp){S.mp=null;render();return}if(e.key==='Escape'&&S.eqv){S.eqv=null;closeModal();return}if(e.key==='Escape'&&S.apps){S.apps=false;render();$('#appbtn')?.focus()}});
function hdr(r){
  if(isSales())return hdrSales(r);
  const name=S.me.id?(S.names[S.me.id]||'คุณ'):'';
  const T=(k,h,t,x='')=>`<a href="${h}" class="tnv ${navIs(r,k)?'on':''}" ${navIs(r,k)?'aria-current="page"':''} ${x}>${t}</a>`;
  const lg=document.querySelector('.side .logo img');
  return `<header class="tb pmbar">
    <div class="gsw wide" role="search"><label class="gs" title="ค้นหา">${svg('search','currentColor',2)}<input id="gq" type="search" placeholder="ค้นหาชื่อไซต์, เลขงาน, เบอร์โทร, S/N…" aria-label="ค้นหางานทั้งหมด" autocomplete="off" aria-controls="gqr"></label><div class="gqr" id="gqr" role="listbox" hidden></div></div>
    <div class="tbr" data-svanchor><div class="appw" id="appw"></div><div class="ntw">${bellBtn()}${S.bell?bellPanel():''}</div>
    <div class="pfw"><button type="button" class="tav" id="pfbtn" aria-haspopup="menu" aria-expanded="${!!S.pf}" title="${esc(name)}" style="padding:0;overflow:hidden">${avImg()}</button>
    ${S.pf?`<div class="pfm" role="menu"><div class="pfh"><span class="tav" style="padding:0;overflow:hidden">${avImg()}</span><span><b>${esc(name||'ผู้ใช้')}</b><small>${esc(isSys()?'ผู้ดูแลระบบ':(ROLES[myRole()]||['แอดมิน'])[0])} · แผนก Energy</small></span></div>
    <a role="menuitem" href="#settings" class="pfi">${svg('gear','currentColor',2)}ตั้งค่า</a>
    <button role="menuitem" type="button" class="pfi" id="pfout">${svg('arrow','currentColor',2)}ออกจากระบบ</button></div>`:''}</div></div></header>`;
}
/* ตัวเลือกเดือน: ลูกศรอยู่กับที่ (ช่องกลางกว้างคงที่) + เลือกเดือนเองได้จากรายการ */
function monthNav(key,leftAligned){
  const off=S.f[key]||0;const now=new Date();const cur=new Date(now.getFullYear(),now.getMonth()+off,1);
  const offOf=(y,m)=>(y-now.getFullYear())*12+(m-now.getMonth());
  let minOff=-12;const ds=Object.values(S.jobs).map(j=>svDate(j)).filter(Boolean).sort();
  if(ds[0]){const [y,m]=ds[0].split('-').map(Number);minOff=Math.min(-1,offOf(y,m-1))}
  const maxOff=6;
  const rst=off?`<button class="btn sm ghost" data-mn="${key}" data-d="0">กลับเดือนนี้</button>`:'';
  let pop='';
  if(S.mp&&S.mp.key===key){
    const y=S.mp.y;const cnt={};ds.forEach(d=>{if(d.startsWith(y+'-'))cnt[+d.slice(5,7)-1]=(cnt[+d.slice(5,7)-1]||0)+1});
    const yMin=now.getFullYear()+Math.floor((now.getMonth()+minOff)/12),yMax=now.getFullYear()+Math.floor((now.getMonth()+maxOff)/12);
    pop=`<div class="mpop" role="dialog" aria-label="เลือกเดือน">
      <div class="mph"><button data-mpy="-1" aria-label="ปีก่อนหน้า" ${y<=yMin?'disabled':''}>${svg('chev','#16171a',2.2)}</button><b>${y+543}</b><button data-mpy="1" aria-label="ปีถัดไป" ${y>=yMax?'disabled':''}>${svg('chev','#16171a',2.2)}</button></div>
      <div class="mpg">${TM.map((t,m)=>{const o=offOf(y,m);const dis=o<minOff||o>maxOff;const isCur=o===0,isSel=o===off;
        return `<button class="${isSel?'sel':''} ${isCur?'cur':''}" ${dis?'disabled':`data-mpick="${o}"`}>${t}${cnt[m]?`<small>${cnt[m]} งาน</small>`:'<small>&nbsp;</small>'}</button>`}).join('')}</div>
      <div class="mpf"><button data-mpick="0">เดือนนี้</button></div></div>`;
  }
  return `${leftAligned?'':rst}<div class="mnav" aria-label="เลือกเดือน"><button data-mn="${key}" data-d="-1" aria-label="เดือนก่อนหน้า" ${off<=minOff?'disabled':''}>${svg('chev','#16171a',2.2)}</button>
    <button class="mlbl" data-mpop="${key}" aria-haspopup="dialog" aria-expanded="${!!pop}">${TMF[cur.getMonth()]} ${cur.getFullYear()+543}${svg('chev','#6b6e76',2.2)}</button>
    <button data-mn="${key}" data-d="1" aria-label="เดือนถัดไป" ${off>=maxOff?'disabled':''}>${svg('chev','#16171a',2.2)}</button>${pop}</div>${leftAligned?rst:''}`;
}
/* แจ้งเตือน: สิ่งที่แอดมินต้องลงมือ แยกตามเรื่อง */
function bellItems(){
  const L=[];const act=visibleJobs().filter(j=>j.status==='active');
  const nmOf=j=>j.title||cOf(j).name||'ไม่มีชื่อไซต์';
  act.filter(j=>j.stage===ST.ACCEPT).forEach(j=>L.push({g:'q',j,t:nmOf(j),s:`ขอคิวสำรวจ ${j.queueDate?fd(j.queueDate)+(j.queueTime?' · '+j.queueTime:''):'ยังไม่ระบุวัน'}${j.salesTeam?' · ทีม '+j.salesTeam:''}`,at:j.stageSince}));
  act.filter(j=>j.stage===ST.INSREQ).forEach(j=>L.push({g:'i',j,t:nmOf(j),s:`ลูกค้าตกลงแล้ว${j.wantInstallDate?' · สะดวก '+fd(j.wantInstallDate):''}`,at:j.stageSince}));
  Object.values(S.services||{}).filter(x=>x.type==='CM'&&x.status!=='closed').forEach(x=>{const jj=mainJob(x.siteId);if(jj)L.push({g:'c',j:jj,site:x.siteId,t:nmOf(jj),s:'แจ้งซ่อม: '+(x.symptom||'')+' · แจ้ง '+fd(x.date),at:x.createdAt})});
  pmList(30).forEach(({j,due})=>{const n=dLeft(due);L.push({g:'p',j,t:nmOf(j),s:n<0?`เลยกำหนดตรวจเช็กมา ${-n} วัน`:n===0?'ครบกำหนดตรวจเช็กวันนี้':`ครบกำหนดตรวจเช็กใน ${n} วัน (${fd(due)})`,at:Date.parse(due)-30*864e5,warn:n<0})});
  return L;
}
function bellSeen(){try{return +localStorage.getItem('cl.bellSeen')||0}catch(e){return 0}}
function bellBtn(){
  const L=bellItems();const nw=L.filter(x=>(x.at||0)>bellSeen()).length+actItems().filter(x=>x.at>actSeen()).length;
  return `<button class="tic" id="bellbtn" aria-haspopup="true" aria-expanded="${!!S.bell}" aria-label="แจ้งเตือน ${L.length} เรื่อง${nw?' ใหม่ '+nw:''}" title="แจ้งเตือน">${svg('bell','#55575e',1.9)}${nw?`<b class="nb new">${nw>99?'99+':nw}</b>`:''}</button>`;
}
function bellPanel(){
  const L=bellItems();const seen=S.bellSeenAt||0;
  const G=[['c','แจ้งซ่อมยังไม่ปิด','wrench'],['q','คิวสำรวจรอตอบรับ','inbox'],['i','รอจองคิวติดตั้ง','cal'],['d','เอกสารขนานไฟฟ้า','file'],['p','ตรวจเช็กประจำปี ภายใน 30 วัน','clock']];
  const body=G.map(([k,t,ic])=>{const it=L.filter(x=>x.g===k);if(!it.length)return '';
    return `<div class="ntg"><div class="ntgh">${svg(ic,'currentColor',2)}<span>${t}</span><i>${it.length}</i></div>${it.slice(0,4).map(x=>`<a class="nti ${(x.at||0)>seen?'new':''}" href="${x.site||x.g==='p'?'#site-'+esc(x.site||x.j.siteId):'#job-'+esc(x.j.id)}"><b>${esc(x.t)}</b><span class="${x.warn?'warn':''}">${esc(x.s)}</span>${x.at&&k!=='p'?`<small>${days(x.at)?days(x.at)+' วันที่แล้ว':'วันนี้'}</small>`:''}</a>`).join('')}${it.length>4?`<a class="ntm" href="#jobs" data-mine="1">ดูอีก ${it.length-4} งาน</a>`:''}</div>`}).join('');
  const A=actItems(),an=A.filter(x=>x.at>actSeen()).length,tab=S.ntTab||(an?'a':'w');
  return `<div class="ntp" role="dialog" aria-label="แจ้งเตือน"><div class="nth"><b>แจ้งเตือน</b><span>${L.length?L.length+' เรื่องรอดำเนินการ':''}</span></div>
    <div class="nttab" role="tablist"><button type="button" role="tab" data-nttab="a" class="${tab==='a'?'on':''}" aria-selected="${tab==='a'}">ความเคลื่อนไหว${an?`<i>${an}</i>`:''}</button><button type="button" role="tab" data-nttab="w" class="${tab==='w'?'on':''}" aria-selected="${tab==='w'}">งานค้าง</button></div>
    ${tab==='a'?`<div class="ntb">${actBody(A)}</div>`:`<div class="ntb">${body||`<div class="nte">${svg('check','currentColor',2)}<b>ไม่มีงานค้าง</b><span>คิว แจ้งซ่อม และตรวจเช็กที่ต้องทำจะขึ้นที่นี่</span></div>`}</div>`}
    <a class="ntf" href="#jobs" data-mine="0">ดูงานทั้งหมด</a></div>`;
}
const DOTS='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
function mnu(items,label,cls){items=items.filter(Boolean);if(!items.length)return '';return `<details class="mnu"><summary class="${cls||'btn'}" aria-label="${label?'':'เพิ่มเติม'}" title="${label?'':'เพิ่มเติม'}">${DOTS}${label||''}</summary><div class="mnu-p" role="menu">${items.join('')}</div></details>`}
function mi(attrs,ic,txt,dg){return `<button type="button" class="mi${dg?' mdg':''}" role="menuitem" ${attrs}>${ic?svg(ic,'currentColor',2):''}${txt}</button>`}
/* ข้อ 2 polish: หน้าว่างแบบเดียวทั้งระบบ (ไอคอนวงกลม + หัวข้อ + คำแนะนำ) · ถ้าได้ markup .emf มาแล้วส่งต่อเลย */
function emp(ic,t,h){if(/class="emf"/.test(t))return t;if(!h){const m=String(t).match(/^(.*?)\s+(กด .*|เริ่ม.*)$/);if(m){t=m[1];h=m[2]}}return `<div class="emf"><span class="emf-i">${svg(ic,'currentColor',2)}</span><b>${t}</b>${h?`<span>${h}</span>`:''}</div>`}
function emptyFilt(all,f,mon){const q=(f.q||'').trim();
  const t=q?`ไม่เจองานที่ตรงกับ “${esc(q)}”`:all?'ไม่มีงานที่ตรงกับตัวกรอง':'ไม่มีงานที่ตรงกับตัวกรองในเดือน'+mon;
  const h=q?(all?'ค้นจากทุกเดือนแล้ว ':'')+'ลองค้นด้วยชื่อลูกค้า เลขงาน เบอร์โทร หรือ S/N':all?'ลองล้างตัวกรองเพื่อดูงานทั้งหมด':'ลองเปลี่ยนเดือน หรือล้างตัวกรอง';
  return `<div class="emf"><span class="emf-i">${svg('search','currentColor',2)}</span><b>${t}</b><span>${h}</span><button type="button" class="btn" data-clear="1">${q?'ล้างคำค้นและตัวกรอง':'ล้างตัวกรอง'}</button></div>`}
function pageHead(title,sub,actions=''){return `<div class="ph"><div><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div>${actions?`<div class="pha">${actions}</div>`:''}</div>`}
/* ค้นหาจากแถบบน: ผลลัพธ์ทันที 6 รายการ, Enter = ดูผลทั้งหมดในหน้างาน */
function gMatch(q){q=q.trim().toLowerCase();if(!q)return [];return visibleJobs().filter(j=>{const c=cOf(j),s=sOf(j),e=j.equipment||{};return [j.jobNo,j.title,c.name,realName(c),c.phone,placeOf(j,s,c),e.sn,e.wifiSn,unitSns(e),e.plantName].join(' ').toLowerCase().includes(q)}).sort((a,b)=>svDate(b).localeCompare(svDate(a)))}
function gSearch(v){const box=$('#gqr');if(!box)return;const m=gMatch(v);
  if(!v.trim()){box.hidden=true;box.innerHTML='';return}
  box.innerHTML=(m.length?m.slice(0,6).map(j=>{const c=cOf(j),e=j.equipment||{};const nm=j.title||c.name||'ไม่มีชื่อไซต์';const sub=[j.jobNo?'#'+j.jobNo:'',e.sn||'',c.phone||''].filter(Boolean).join(' · ');
    return `<button type="button" class="gqi" role="option" data-osel="${esc(j.id)}"><span><b>${esc(nm)}</b><small>${esc(sub)||'&nbsp;'}</small></span>${isInstalled(j)&&j.status==='done'?(careTags(j)||jobPill(j)):jobPill(j)}</button>`}).join(''):'<p class="gqn">ไม่พบงานที่ตรงกับคำค้น</p>')
   +(m.length?`<button type="button" class="gqa" data-gall="1">ดูผลทั้งหมด ${m.length} งาน<span>Enter</span></button>`:'');
  box.hidden=false}
function gAll(){const el=$('#gq');const v=el?el.value:'';Object.assign(S.f,{q:v,status:'all',mine:false,phase:'',phAll:false,team:'',eng:'',pg:0});const b=$('#gqr');if(b)b.hidden=true;if(el)el.value='';if(route()!=='jobs')location.hash='jobs';else render()}
document.addEventListener('keydown',e=>{const t=e.target;
  if(t.id==='gq'){if(e.key==='Enter'){e.preventDefault();if(t.value.trim())gAll()}else if(e.key==='Escape'){t.value='';gSearch('');t.blur()}else if(e.key==='ArrowDown'){const f=$('#gqr .gqi');if(f){e.preventDefault();f.focus()}}return}
  if(t.closest&&t.closest('#gqr')&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();const it=[...document.querySelectorAll('#gqr .gqi,#gqr .gqa')];const i=it.indexOf(t);const n=it[i+(e.key==='ArrowDown'?1:-1)];(n||$('#gq')).focus();return}
  if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(t.tagName)&&!t.isContentEditable){const g=$('#gq');if(g){e.preventDefault();g.focus()}}
});
document.addEventListener('click',e=>{if(e.target.closest('[data-gall]')){gAll();return}if(!e.target.closest('.gsw')){const b=$('#gqr');if(b&&!b.hidden)b.hidden=true}else if(e.target.closest('[data-osel]')){const b=$('#gqr');if(b)b.hidden=true;const g=$('#gq');if(g)g.value=''}},true);
function navIs(r,k){const kbt=S.f.kqt||'form';return k==='today'?r==='today':k==='jobs'?((r==='jobs'||r.startsWith('job-'))&&!S.f.mine):k==='mine'?(r==='mine'||(r==='jobs'&&S.f.mine)):k==='queue'?(r==='queue'||r==='new'):k==='form'?(r.startsWith('kb')&&kbt==='form'):k==='eq'?(r==='products'||(r==='kb'&&kbt==='eq')):r===k}
try{if(localStorage.getItem('cl.sbmin')==='1')document.body.classList.add('sbmin')}catch(x){}
function renderSide(r){
  if(isSales())return sideSales(r);
  const mine=mineJobs().length;const kqt=S.f.kqt||'form';
  const is=k=>k==='today'?r==='today':k==='jobs'?((r==='jobs'||r.startsWith('job-'))&&!S.f.mine):k==='mine'?(r==='mine'||(r==='jobs'&&S.f.mine)):k==='queue'?(r==='queue'||r==='new'):k==='form'?(r.startsWith('kb')&&kqt==='form'):k==='eq'?(r==='kb'&&kqt==='eq'):r===k;
  const L=(k,href,t,x='',n='')=>`<a href="${href}" class="pnl ${is(k)?'on':''}" ${is(k)?'aria-current="page"':''} ${x}><span>${t}</span>${n?`<i>${n}</i>`:''}</a>`;
  const G=(ic,t,items)=>`<div class="png"><div class="pngh">${svg(ic,'currentColor',2)}<span>${t}</span></div><div class="pngi">${items}</div></div>`;
  const N=(k,href,ic,t,x='',n='')=>`<a href="${href}" class="nvi ${is(k)?'on':''}" ${is(k)?'aria-current="page"':''} ${x}>${svg(ic,'currentColor',2)}<span>${t}</span>${n?`<i>${n}</i>`:''}</a>`;
  const R=(k,h,ic,t,x='',n='')=>`<a href="${h}" class="rli ${is(k)?'on':''}" title="${t}" aria-label="${t}" ${x}>${svg(ic,'currentColor',2)}${n?`<i>${n}</i>`:''}</a>`;
  const lg=document.querySelector('.side .logo img');
  const SN=(k,h,ic,t,x='',n='')=>`<a href="${h}" class="snv ${navIs(r,k)?'on':''}" title="${t}" ${navIs(r,k)?'aria-current="page"':''} ${x}>${svg(ic,'currentColor',2)}<span>${t}</span>${n?`<i>${n}</i>`:''}</a>`;
  const SG=(t,items)=>`<div class="sgp"><div class="sgt">${t}</div>${items}</div>`;
  $('#nav1').innerHTML=`<a class="sbr" href="#today" aria-label="CLEANLINE หน้าภาพรวม">${lg?`<img src="${lg.src}" alt="CLEANLINE">`:'<b>CLEANLINE</b>'}<small>Management</small><em class="sbm" aria-hidden="true">CL</em></a>
    ${SN('today','#today','home','ภาพรวม')}
    ${SG('งานโซลาร์',SN('queue','#queue','cal','ปฏิทินงาน')+SN('jobs','#jobs','list','รายการงาน','data-mine="0"')+SN('mine','#mine','inbox','งานที่รอดำเนินการ','data-mine="1"',mine))}
    ${SG('หลังการขาย',SN('service','#service','wrench','งานบริการหลังการขาย'))}
    ${SG('ยืม-คืนอุปกรณ์',SN('meter','#meter','bolt','สมาร์ทมิเตอร์'))}
    ${SG('คลังข้อมูล',SN('form','#kb','file','แบบฟอร์มเอกสาร','data-kbt="form"')+SN('eq','#products','layers','แคตตาล็อกสินค้า','data-kbt="eq"')+(Object.keys(TRASH_COLS).some(canTrash)?SN('trash','#trash','trash','ถังขยะ','',trashList().length||''):''))}
    <div class="sft"><button type="button" class="sbtog" data-sbtog="1" aria-expanded="${!document.body.classList.contains('sbmin')}" title="${document.body.classList.contains('sbmin')?'ขยายเมนู':'ย่อเมนู'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path class="sbar" d="M15 10l-2 2 2 2"/></svg><span>ย่อเมนู</span></button></div>`;
  $('#nav2').innerHTML='';
}
function topbar(){return ''}
function weekStrip(evOn,t){
  const D=[...Array(7)].map((_,i)=>isoAdd(t,i+1));const tot=D.reduce((a,k)=>a+evOn(k).length,0);
  const leaf=k=>{const dt=new Date(k+'T00:00:00'),L=evOn(k),sun=dt.getDay()===0,cl=closedDays()[k];
    return `<a class="wk ${sun||cl?'off':''} ${L.length?'':'emp'}" href="#queue" data-wkd="${k}"><span class="wk-d"><b>${dt.getDate()}</b><span>${TD[dt.getDay()]}</span></span>
      ${L.length?`<span class="wk-l">${L.slice(0,3).map(x=>`<span class="wk-e ${x.k}"><i>${x.k==='i'?'ติดตั้ง':esc(x.j.queueTime||'สำรวจ')}</i>${esc(x.j.title||'')}</span>`).join('')}${L.length>3?`<span class="wk-m">อีก ${L.length-3} นัด</span>`:''}</span>`:`<span class="wk-n">${sun?'วันหยุด':cl?esc(cl):'ว่าง'}</span>`}</a>`};
  return `<section class="card wks" aria-label="7 วันข้างหน้า"><div class="wks-h"><h2>7 วันข้างหน้า <span>${tot} นัด</span></h2><a class="lnk" href="#queue">เปิดปฏิทิน</a></div><div class="wks-g">${D.map(leaf).join('')}</div></section>`}
function heroStrip(t,d,evOn,active,all){
  const tm=x=>x.k==='i'?'ทั้งวัน':x.j.queueTime||'';const typ=x=>x.k==='s'?'สำรวจ':`ติดตั้ง${x.of>1?` วันที่ ${x.day}/${x.of}`:''}`;const who=x=>x.k==='s'?(x.j.surveyor||'ยังไม่มีคนสำรวจ'):(x.j.installTeam||'');
  const row=(x,day)=>`<a class="hs-ap" href="#job-${esc(x.j.id)}"><span class="hs-tm">${day?`<small>${day}</small>`:''}${esc(tm(x)||'—')}</span><span class="hs-ty ${x.k}">${typ(x)}</span><span class="hs-nm"><b>${esc(x.j.title||'ไม่มีชื่อไซต์')}</b><span>${esc(who(x))}</span></span></a>`;
  const L=evOn(t);let ap;
  if(L.length){const A=8,B=18,pc=x=>Math.max(0,Math.min(100,(x-A)/(B-A)*100)),hr=x=>{const m=/^(\d{1,2})[:.](\d{2})/.exec(x.j.queueTime||'');return x.k==='s'&&m?+m[1]+(+m[2])/60:null};
    const tmd=L.filter(x=>hr(x)!=null).sort((a,b)=>hr(a)-hr(b)),day=L.filter(x=>hr(x)==null);const lanes=[];
    const top0=day.length*54+8;
    const ev=tmd.map(x=>{const s0=hr(x),e=s0+2.5;let ln=lanes.findIndex(end=>end<=s0);if(ln<0){ln=lanes.length;lanes.push(e)}else lanes[ln]=e;const l=Math.min(pc(s0),75);
      return `<a class="daytl-ev" href="#job-${esc(x.j.id)}" style="left:min(${l}%,calc(100% - 150px));width:${Math.max(Math.min(pc(e),100)-l,25)}%;top:${top0+ln*54}px"><b>${esc(x.j.queueTime)} ${esc(x.j.title||'ไม่มีชื่อไซต์')}</b><span>${esc(who(x))}</span></a>`}).join('');
    const dv=day.map((x,i)=>`<a class="daytl-ev i" href="#job-${esc(x.j.id)}" style="left:0;width:100%;top:${i*54}px"><b>${x.k==='i'?typ(x)+' ทั้งวัน':'สำรวจ (ยังไม่ระบุเวลา)'} · ${esc(x.j.title||'ไม่มีชื่อไซต์')}</b><span>${esc(who(x))}</span></a>`).join('');
    const H=top0+Math.max(lanes.length,tmd.length?1:0)*54+30;const T=[8,10,12,14,16,18];const nw=new Date(),nh=nw.getHours()+nw.getMinutes()/60;
    ap=`<h2>นัดวันนี้ <span>${L.length} นัด</span></h2><div class="daytl" style="height:${H}px">${T.map(x=>`<i class="daytl-g" style="left:${pc(x)}%"></i>`).join('')}<div class="daytl-ax">${T.map(x=>`<i style="left:${pc(x)}%">${String(x).padStart(2,'0')}:00</i>`).join('')}</div>${nh>=A&&nh<=B?`<i class="daytl-now" style="left:${pc(nh)}%"></i>`:''}${dv}${ev}</div>`}
  else{let nx=null,nk='';for(let i=1;i<=30&&!nx;i++){const k=isoAdd(t,i);const E=evOn(k);if(E.length){nx=E[0];nk=k}}
    const dl=k=>{const n=Math.round((new Date(k+'T00:00:00')-new Date(t+'T00:00:00'))/864e5);return n===1?'พรุ่งนี้':n===2?'มะรืนนี้':`${TD[new Date(k+'T00:00:00').getDay()]} ${fd(k)}`};
    ap=`<h2>วันนี้ไม่มีนัด</h2>${nx?`<p class="hs-sub">นัดถัดไป</p>${row(nx,dl(nk))}`:'<p class="hs-sub">30 วันข้างหน้ายังไม่มีนัดสำรวจหรือติดตั้ง</p>'}`}
  const M=mineJobs();const by={};M.forEach(j=>(by[j.stage]=by[j.stage]||[]).push(j));
  const own=()=>{const c={};active.filter(j=>j.stage!==ST.OFFER).forEach(j=>{c[j.stage]=(c[j.stage]||0)+1});const K=Object.keys(c).sort((a,b)=>a-b);return K.length?`<h2>งานแต่ละขั้น <span>${Object.values(c).reduce((a,b)=>a+b,0)} งาน</span></h2><div class="hs-wl">${K.map(k=>`<a class="hs-w" href="#jobs" data-pillf="${esc(phaseOf(+k)?.k||'pre')}"><span>${esc(STAGES[k].name)}</span><b>${c[k]}</b>${svg('chev','currentColor',2.2)}</a>`).join('')}</div>`:''};
  const bk=()=>{const sv=active.filter(j=>j.stage===ST.ACCEPT).length,ins=active.filter(j=>j.stage===ST.INSREQ).length,b1=active.filter(j=>j.stage===ST.BOOK).length;
    const r=(n,l,attr)=>`<a class="hs-w" href="#today" ${attr}><span>${l}</span><b class="${n?'':'z'}">${n}</b>${svg('chev','currentColor',2.2)}</a>`;
    const q=(n,l,k)=>`<a class="hs-qc" href="#today" data-bkgo="${k}"><b class="${n?'':'z'}">${n}</b><span>${l}</span></a>`;
    return `<h2>จองคิว <span>${sv+ins+b1} งาน</span></h2><div class="hs-q">${q(sv,'คิวสำรวจรอตอบรับ','sv')}${q(ins,'คิวติดตั้งรอจอง','ins')}</div><div class="hs-wl">${b1?`<a class="hs-w" href="#mine"><span>จองคิวสำรวจ (ยังไม่มีวัน)</span><b>${b1}</b>${svg('chev','currentColor',2.2)}</a>`:''}</div>`};
  const wait=myGroup()==='admin'?bk():!myGroup()?own():M.length?`<h2>รอคุณ <span>${M.length} งาน</span></h2><div class="hs-wl">${Object.keys(by).sort((a,b)=>a-b).map(k=>{const A=by[k];return `<a class="hs-w" href="${A.length===1?'#job-'+A[0].id:'#mine'}"><span>${esc(STAGES[k].name)}</span><b>${A.length}</b>${svg('chev','currentColor',2.2)}</a>`}).join('')}</div>`:`<h2>รอคุณ</h2><p class="hs-sub hs-ok">${svg('check','currentColor',2.4)}ไม่มีงานรอคุณ เคลียร์หมดแล้ว</p>`;
  return `<section class="card hs" aria-label="วันนี้">
    <div class="hs-d"><b>${d.getDate()}</b><span>วัน${TD[d.getDay()]}</span><span>${TMF[d.getMonth()]} ${d.getFullYear()+543}</span><div class="hs-qa">${newBtn()}</div></div>
    <div class="hs-a">${ap}</div>
    <div class="hs-r">${wait}</div></section>`}
function newBtn(){return ''} /* 27 พ.ย. 21:17 ย้ายการจองคิวสำรวจไปหน้าปฏิทิน (ผู้ใช้ขอ) */

/* ---------- today ---------- */
/* feed: each role sees only what it acts on */
const hText=t=>deRole(t).replace(/→ ขั้น (\d+)/,(m,n)=>'→ '+(STAGES[n]?.name||'')).replace(/\(ขั้น \d+ ([^)]*)\)/,'($1)').replace(/ขั้น (\d+)(?=[ :])/,(m,n)=>STAGES[n]?.name||m);
/* ปฏิทินเดือนนี้ (เล็ก) */
/* งานของวันที่เลือก (ค่าเริ่มต้น = วันนี้) */
/* แจ้งเตือนงานบริการที่กำลังจะมาถึง: แจ้งซ่อมค้าง + ครบตรวจเช็กใน 60 วัน (รวมที่เลยกำหนด) */
function svcAlert(){
  const nm=j=>j.title||cOf(j).name||'ไม่มีชื่อไซต์';
  const cm=Object.values(S.services||{}).filter(x=>x.type==='CM'&&x.status!=='closed').map(x=>({x,j:mainJob(x.siteId)})).filter(o=>o.j).sort((a,b)=>String(a.x.date).localeCompare(String(b.x.date)));
  const pm=pmList(60);
  const when=dl=>dl<0?`<em class="crit">เลยกำหนด ${-dl} วัน</em>`:dl===0?'<em class="crit">ครบวันนี้</em>':dl<=7?`<em class="warn">อีก ${dl} วัน</em>`:`<em>อีก ${dl} วัน</em>`;
  const rows=[...cm.map(({x,j})=>{const d=x.date?-dLeft(x.date):0;return `<div class="sar r"><span class="sai">${svg('wrench','currentColor',2)}</span>
      <button class="sab" data-osel="${esc(j.id)}"><b>${esc(nm(j))}</b><small>แจ้งซ่อม · ${esc(x.symptom||'ยังไม่ระบุอาการ')}</small></button>
      <span class="saw"><small>แจ้งเมื่อ ${x.date?fd(x.date):'—'}</small>${d>0?`<em class="${d>7?'crit':'warn'}">ค้าง ${d} วัน</em>`:'<em class="warn">แจ้งวันนี้</em>'}</span>
      <span class="saa"><button class="btn sm" data-svedit="${esc(x.id)}">อัปเดตงานซ่อม</button></span></div>`}),
    ...pm.map(({j,due})=>`<div class="sar v"><span class="sai">${svg('check','currentColor',2)}</span>
      <button class="sab" data-osel="${esc(j.id)}"><b>${esc(nm(j))}</b><small>ตรวจเช็กประจำปี${(j.equipment||{}).sn?' · S/N '+esc(j.equipment.sn):''}</small></button>
      <span class="saw"><small>ครบ ${fd(due)}</small>${when(dLeft(due))}</span>
      <span class="saa">${j.siteId?`<button class="btn sm" data-svnew="PM" data-sid="${esc(j.siteId)}">บันทึกตรวจเช็ก</button>`:''}</span></div>`)];
  return `<section class="card sal" aria-label="งานบริการที่กำลังจะมาถึง">
    <div class="phd"><div class="ptl">${svg('bell','currentColor',2)}งานบริการที่กำลังจะมาถึง<span class="tdn">${rows.length}</span></div><span class="sub">แจ้งซ่อมที่ยังไม่ปิด และตรวจเช็กที่ครบภายใน 60 วัน</span></div>
    <div class="salg"><div class="salq"><div class="hs-qc"><b class="${cm.length?'':'z'}">${cm.length}</b><span>แจ้งซ่อมยังไม่ปิด</span></div><div class="hs-qc"><b class="${pm.length?'':'z'}">${pm.length}</b><span>ครบตรวจเช็กใน 60 วัน</span></div></div>
    <div class="sall">${rows.join('')||`<div class="tde">${svg('check','currentColor',2)}<b>ไม่มีงานบริการที่ต้องทำเร็ว ๆ นี้</b><span>ระบบจะเตือนเมื่อมีไซต์ครบตรวจเช็กภายใน 60 วัน หรือมีแจ้งซ่อมเข้ามา</span></div>`}</div></div>
  </section>`;
}
/* แดชบอร์ด: สำรวจเทียบติดตั้ง 12 เดือน + เส้นทางปีนี้ */
/* แดชบอร์ดแบบ Prodify Reports: ตัวเลข 4 ช่อง + กราฟแท่ง 12 เดือน + โดนัทงานกำลังทำ */
function dashPro(all){
  const d=new Date();const ym=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`;
  const M=[...Array(12)].map((_,i)=>ym(new Date(d.getFullYear(),d.getMonth()-11+i,1)));
  const inst=j=>j.installDate&&(j.stage>=ST.COMM||j.status==='done')?j.installDate:'';
  const sv=M.map(m=>all.filter(j=>svDate(j).startsWith(m)).length),ins=M.map(m=>all.filter(j=>inst(j).startsWith(m)).length);
  const mx=Math.max(1,...sv,...ins);const act=all.filter(j=>j.status==='active');
  const cm=Object.values(S.services||{}).filter(x=>x.type==='CM'&&x.status!=='closed').length,pm=pmList(30).length;
  const diff=(a,b)=>a===b?'เท่ากับเดือนก่อน':a>b?`มากกว่าเดือนก่อน ${a-b}`:`น้อยกว่าเดือนก่อน ${b-a}`;
  const stat=[['งานกำลังดำเนินการ',act.length,`ค้างเกิน 30 วัน ${act.filter(j=>days(j.stageSince)>30).length} งาน`,'#jobs','data-mine="0"'],
    ['สำรวจเดือนนี้',sv[11],diff(sv[11],sv[10]),'#jobs','data-mine="0"'],
    ['ติดตั้งเสร็จเดือนนี้',ins[11],diff(ins[11],ins[10]),'#service','data-sst="installed"'],
    ['ตรวจเช็ก / แจ้งซ่อม',pm+cm,`แจ้งซ่อมค้าง ${cm} · ครบตรวจ ${pm}`,'#service','data-sst="'+(cm?'cm':'pm')+'"']];
  const PC=['#458c10','#94c83d','#16a34a','#86efac'];
  const ph=PHASES.map((p,i)=>({...p,c:PC[i],n:act.filter(j=>p.st.includes(j.stage)).length}));const tot=Math.max(1,act.length);
  let acc=0;const cg=ph.map(p=>{const a=acc;acc+=p.n/tot*100;return `${p.c} ${a}% ${acc}%`}).join(',');
  const stats=`<div class="dsg" aria-label="ตัวเลขสรุป">${stat.map(([l,v,n,h,x])=>`<a class="dst" href="${h}" ${x}><span class="dsl">${l}</span><b>${v}</b><span class="dsn">${n}</span></a>`).join('')}</div>`;
  const bars=`<div class="card dcp"><div class="phd"><div class="ptl">${svg('layers','currentColor',2)}สำรวจเทียบติดตั้ง</div><div class="dlg2"><span><i class="a"></i>สำรวจ</span><span><i class="b"></i>ติดตั้งเสร็จ</span></div></div>
        <div class="dbars" role="img" aria-label="สำรวจและติดตั้งเสร็จ 12 เดือนล่าสุด">${M.map((m,i)=>`<div class="dbw ${i===11?'cur':''}" title="${TMF[+m.slice(5)-1]} ${+m.slice(0,4)+543}: สำรวจ ${sv[i]} · ติดตั้ง ${ins[i]}"><div class="dbp"><i class="a" style="height:${sv[i]/mx*100}%"></i><i class="b" style="height:${ins[i]/mx*100}%"></i></div><small>${TM[+m.slice(5)-1]}</small></div>`).join('')}</div>
        <p class="dnote">12 เดือนล่าสุด · สำรวจ ${sv.reduce((a,b)=>a+b,0)} ไซต์ · ติดตั้งเสร็จ ${ins.reduce((a,b)=>a+b,0)} ไซต์</p></div>`;
  const donut=`<div class="card dcp"><div class="phd"><div class="ptl">${svg('grid','currentColor',2)}งานที่กำลังดำเนินการ</div></div>
        <div class="dnut" style="background:${act.length?`conic-gradient(${cg})`:'#efedf5'}"><div><strong>${act.length}</strong><span>งานทั้งหมด</span></div></div>
        <div class="dlgd">${ph.map(p=>`<a href="#jobs" data-phase="${p.k}"><i style="background:${p.c}"></i>${esc(p.name)}<b>${p.n}</b></a>`).join('')}</div></div>`;
  return {stats,bars,donut};
}
function viewToday(){return salesReqBanner(viewToday0())}
function viewToday0(){
  if(!S.loaded.jobs)return topbar()+'<div class="skw" aria-busy="true" aria-label="กำลังโหลดงาน"><div class="sk skh"></div><div class="skt"><i class="sk"></i><i class="sk"></i><i class="sk"></i><i class="sk"></i></div><div class="card skr"><i class="sk"></i><i class="sk"></i><i class="sk"></i></div></div>';
  if(!Object.keys(S.jobs).length)return topbar()+emptyStart();
  const g=myGroup();
  const all=visibleJobs();const active=all.filter(j=>j.status==='active');
  const t=today();const d=new Date();
  const evOn=k=>{const L=[];active.forEach(j=>{if(j.stage<=ST.SURVEY&&(j.surveyDate||j.queueDate)===k)L.push({j,k:'s',conf:j.stage>=ST.SURVEY});if(j.stage>=ST.INSREQ&&j.stage<=ST.INSTALL&&onIns(j,k)){const D=insDays(j);L.push({j,k:'i',day:D.indexOf(k)+1,of:D.length})}});return L.sort((a,b)=>String(a.j.queueTime||'99').localeCompare(String(b.j.queueTime||'99')))};
  let DP;
  DP=dashPro(all);
  return `${heroStrip(t,d,evOn,active,all)}
  ${g==='admin'&&active.some(j=>j.stage===ST.ACCEPT||j.stage===ST.INSREQ)?`<div class="hbk">${bookPanel()}</div>`:''}
  ${weekStrip(evOn,t)}
  ${g==='admin'||(!g&&S.me.owner)?blPanel(all):''}
  ${pinBox()}
  <section class="hmo" aria-label="เดือนนี้"><h2 class="hmo-h">${TMF[d.getMonth()]} ${d.getFullYear()+543}</h2><div class="hmo-g">${DP.stats}${DP.bars}</div></section>`;
}
function emptyStart(){
  const can=S.me.owner||S.me.edit;
  return `<section class="hro">${SWOOSH}<h1>ยังไม่มีงานในระบบ</h1><p class="lead">นำเข้าตารางงานจาก Excel หรือจองคิวสำรวจงานแรก</p>
  <div style="display:flex;gap:8px">${can?'<a class="btn lime" href="#settings">นำเข้าจาก Excel</a>':''}<a class="btn" href="#new">เปิดงานใหม่</a></div></section>`;
}

/* ---------- all jobs ---------- */
const svDate=j=>[j.surveyDate,j.queueDate].find(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x))||'';
const PHC2={pre:'b',offer:'g',ins:'o',post:'v'};
const stOf=j=>xCan(j)?'cancelled':j.status;
function jobPill(j){return stOf(j)==='cancelled'?'<span class="pill gy">ยกเลิก</span>':j.status==='lost'?'<span class="pill gy">ยังไม่ตกลง</span>':j.status==='done'?'<span class="pill ok">ปิดงานแล้ว</span>':`<span class="pill ${PHC2[phaseOf(j.stage)?.k]||'gy'}">${esc(STAGES[j.stage].name)}</span>`}
const placeOf=(j,s,c)=>s.area||s.place||c.address||'';
function needsCare(j){if(!isInstalled(j))return false;const d=pmDue(j);return (d&&dLeft(d)<=30)||(j.siteId&&cmOpen(j.siteId).length>0)}
function isPm(j){if(!isInstalled(j))return false;const d=pmDue(j);return !!d&&dLeft(d)<=30}
function isCm(j){return isInstalled(j)&&!!j.siteId&&cmOpen(j.siteId).length>0}
const svTok=j=>isCm(j)?'cm':isPm(j)?'pm':'ok';const jTok=j=>{const st=stOf(j);return st==='active'?(phaseOf(j.stage)?.k||'pre'):st};const fhas=v=>Array.isArray(v)?v.length>0:!!v;const fin=(v,x)=>!fhas(v)||(Array.isArray(v)?v.includes(x):v===x);
function jobsList(st,svcMode,skip){
  const f=S.f;const status=st||f.status;const mine=svcMode?false:f.mine;const phase=svcMode||skip==='phase'||!fhas(f.phase)?'':f.phase;
  const bm=new Date();bm.setDate(1);bm.setMonth(bm.getMonth()+(f.jmo||0));
  const curK=`${bm.getFullYear()}-${String(bm.getMonth()+1).padStart(2,'0')}`;
  const q=f.q.trim().toLowerCase();const svc=['installed','care','pm','cm'].includes(status);
  const allMonths=!!q||!!mine||svc||!!(f.phAll&&phase);
  const all=visibleJobs();
  const month=all.filter(j=>svDate(j).startsWith(curK));
  const inScope=allMonths?all:month;
  const qf=j=>{const c=cOf(j),s=sOf(j),e=j.equipment||{};return [j.jobNo,j.title,c.name,realName(c),c.phone,placeOf(j,s,c),j.surveyor,e.sn,e.wifiSn,unitSns(e),e.plantName,e.model,j.proposedModel,j.installTeam].join(' ').toLowerCase().includes(q)};
  const src=(q||mine||(f.phAll&&phase)?all:month).filter(j=>!q||qf(j));
  const cnt={all:src.length,active:0,lost:0,done:0,installed:all.filter(isInstalled).length,care:all.filter(needsCare).length,pm:all.filter(isPm).length,cm:all.filter(isCm).length};src.forEach(j=>cnt[stOf(j)]=(cnt[stOf(j)]||0)+1);
  let list=status==='all'?inScope:status==='installed'?all.filter(isInstalled):status==='care'?all.filter(needsCare):status==='pm'?all.filter(isPm):status==='cm'?all.filter(isCm):inScope.filter(j=>stOf(j)===status);
  if(mine){const g=myGroup();list=list.filter(j=>j.status==='active'&&STAGES[j.stage].role===g&&j.stage!==ST.OFFER&&!(g==='admin'&&j.stage===ST.DOCS))}
  if(phase)list=list.filter(j=>fin(phase,jTok(j)));
  if(skip!=='team'&&fhas(f.team))list=list.filter(j=>fin(f.team,j.salesTeam||''));
  if(skip!=='eng'&&fhas(f.eng))list=list.filter(j=>fin(f.eng,j.surveyor||''));
  if(svcMode&&skip!=='inv'&&fhas(f.inv))list=list.filter(j=>fin(f.inv,(j.equipment||{}).model||j.proposedModel||''));
  if(svcMode&&skip!=='svst'&&fhas(f.svst))list=list.filter(j=>fin(f.svst,svTok(j)));
  if(q)list=list.filter(j=>{const c=cOf(j),s=sOf(j),e=j.equipment||{};return [j.jobNo,j.title,c.name,realName(c),c.phone,placeOf(j,s,c),j.surveyor,e.sn,e.wifiSn,unitSns(e),e.plantName,e.model,j.proposedModel,j.installTeam].join(' ').toLowerCase().includes(q)});
  if(status==='care'||status==='pm')list.sort((a,b)=>String(pmDue(a)||'9').localeCompare(String(pmDue(b)||'9')));
  else if(status==='installed'||status==='cm')list.sort((a,b)=>String(b.installDate||'').localeCompare(String(a.installDate||'')));
  else list.sort((a,b)=>svDate(b).localeCompare(svDate(a))||String(b.jobNo||'').localeCompare(String(a.jobNo||'')));
  return {all,inScope,cnt,list,curK,allMonths,svc};
}
function stageBar(j){
  if(j.status!=='active')return '';
  return `<span class="sbar" aria-hidden="true">${STAGES.slice(1).map((x,i)=>`<i class="${i+1<j.stage?'d':i+1===j.stage?'c':''}"></i>`).join('')}</span>`;
}
function careTags(j){
  const out=[];const n=j.siteId?cmOpen(j.siteId).length:0;if(n)out.push(`<span class="pill rd">แจ้งซ่อมค้าง ${n}</span>`);
  const d=isInstalled(j)?pmDue(j):null;if(d)out.push(pmBadge(d));return out.join('');
}
function viewJobs(mode){
  if(!S.loaded.jobs)return '<div class="card skr" aria-busy="true" aria-label="กำลังโหลดงาน">'+'<i class="sk"></i>'.repeat(6)+'</div>';
  const f=S.f;const SV=mode==='service';
  if(!SV&&!f.mine&&f.status&&f.status!=='all'&&!['installed','care','pm','cm'].includes(f.status)){f.phase=f.status==='active'?PHASES.map(x=>x.k):[f.status];f.status='all'}
  const status=SV?'installed':f.status;const {all,cnt,list,curK,allMonths,svc}=jobsList(status,SV);
  const mLabel=k=>{const [y,m]=k.split('-').map(Number);return `${TMF[m-1]} ${y+543}`};
  const per=f.per||20;const pages=Math.max(1,Math.ceil(list.length/per));if(f.pg>=pages)f.pg=pages-1;if(f.pg<0)f.pg=0;const p0=f.pg*per;const shown=list.slice(p0,p0+per);
  const noDate=all.filter(j=>!svDate(j)).length;
  const engs=[...new Set(all.map(j=>j.surveyor).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
  const cards=SV?[['installed','ติดตั้งแล้ว','sun','g',''],['pm','ครบตรวจเช็กใน 30 วัน','clock','o',''],['cm','แจ้งซ่อมค้าง','wrench','r','']]:[['all','ทั้งหมด','layers','n',''],['active','กำลังดำเนินการ','inbox','b',''],['done','ปิดงานแล้ว','check','g',''],['cancelled','ยกเลิก','x','n','']];
  const sub=SV?(status==='pm'?'ไซต์ที่ครบรอบตรวจเช็กประจำปีภายใน 30 วัน หรือเลยกำหนดแล้ว':status==='cm'?'ไซต์ที่มีแจ้งซ่อมยังไม่ปิด':'ไซต์ที่ติดตั้งแล้ว เรียงตามวันติดตั้ง'):f.mine?'งานที่ต้องทำต่อ จากทุกเดือน':f.q?`ผลค้นหา "${esc(f.q)}" จากทุกเดือน`:f.status==='installed'?'ทุกไซต์ที่ติดตั้งแล้ว เรียงจากวันติดตั้งล่าสุด':f.status==='care'?'ไซต์ที่มีแจ้งซ่อมยังไม่ปิด หรือครบตรวจเช็กประจำปีภายใน 30 วัน':'ไซต์ที่สำรวจในเดือนนี้';
  const dd=d=>d?`${+d.slice(8,10)} ${TM[+d.slice(5,7)-1]} ${String(+d.slice(0,4)+543).slice(2)}`:'';
  const two=(a,b)=>a||b?`<b class="${a?'':'nil'}">${a||'—'}</b><span title="${esc(b||'')}">${b?esc(b):'—'}</span>`:'<span class="nil">—</span>';
  const BOARD=false;
  const nF=(SV?['svst','inv','team','eng']:['phase','team','eng']).filter(k=>fhas(f[k])).length;const filtered=SV?(nF||f.q):(nF||f.q);
  const thf=(k,l)=>`<button type="button" class="thf ${fhas(f[k])?'on':''}" data-thf="${k}" aria-haspopup="true" aria-label="กรอง${l}${fhas(f[k])?' (กรองอยู่)':''}">${l}${svg(fhas(f[k])?'funnel':'chev','currentColor',2.2)}</button>`;
  return pageHead(SV?'งานบริการหลังการขาย':f.mine?'งานที่รอดำเนินการ':'รายการงาน',BOARD?'งานที่กำลังดำเนินการ แยกตามขั้นตอน':sub,SV?'':`${allMonths||BOARD?'':monthNav('jmo')}${newBtn()}`)+``+`
  ${true?'':`<div class="scards s5 c3" role="tablist" aria-label="สถานะ">${cards.map(([k,t,ic,c,note])=>`<button role="tab" aria-selected="${status===k}" class="scd ${status===k?'on':''}" ${SV?'data-sst':'data-status'}="${k}"><span class="sci ${c}">${svg(ic,'currentColor',2)}</span><span><small>${t}</small><b>${cnt[k]||0}</b>${note?`<em>${note}</em>`:''}</span></button>`).join('')}</div>`}
  ${SV?svcAlert():''}
  <section class="card tq">
    <div class="tqb">
      <label class="jsrch">${svg('search','currentColor',2)}<input id="jq" type="search" placeholder="ชื่อไซต์, สถานที่, เลขที่ใบงาน, S/N…" value="${esc(f.q)}" aria-label="ค้นหางาน" autocomplete="off"></label>
      ${`<button type="button" class="btn sm tqf ${SV?'svc':''} ${nF?'on':''}" data-thf="${SV?'svall':'all'}">${svg('funnel','currentColor',2)}ตัวกรอง${nF?` <span class="n">${nF}</span>`:''}</button>`}
      ${filtered&&(nF||f.q)?`<button class="btn sm ghost" data-clear="1">ล้างตัวกรอง</button>`:''}
      ${BOARD?'':`<span class="sub jcount">${list.length} งาน</span>`}${!svc&&shown.some(j=>agCls(j))?agLegend():''}
    </div>
    ${shown.length||nF?`<div class="jtw"><table class="jt jt2 ${svc?'jt2s':'jt2n'}">
      <thead><tr>${svc?`<th class="c-site">ไซต์</th><th>${thf('inv','อินเวอร์เตอร์')}</th><th class="c-sn">S/N</th><th class="c-kw">ขนาด</th><th class="c-dt">วันติดตั้ง</th><th class="c-st">${thf('svst','สถานะ')}</th>`:`<th class="c-no">เลขงาน</th><th class="c-site">ไซต์</th><th class="c-tm">${thf('team','ทีมขาย')}</th><th class="c-eng">${thf('eng','คนสำรวจ')}</th><th class="c-dt">วันสำรวจ</th><th class="c-kw">ขนาด</th><th class="c-st">${thf('phase','สถานะ')}</th>`}<th class="c-act">จัดการ</th></tr></thead>
      <tbody>${ibDrop(shown.map(j=>{const c=cOf(j),s=sOf(j),e=j.equipment||{};const nm=j.title||c.name||'ไม่มีชื่อไซต์';
        const kw=e.kw||j.proposedKw;const sn=e.sn||'';
        const ib=(ic,lab,attr,off)=>off?`<span class="ib ibx" data-ibk="${ic}" aria-hidden="true"></span>`:`<button type="button" class="ib" data-ibk="${ic}" ${attr} aria-label="${lab}" title="${lab}">${svg(ic,'currentColor',2)}</button>`;
        const tel=c.phone?`<a class="ib" href="tel:${esc(String(c.phone).replace(/[^\d+]/g,''))}" aria-label="โทร ${esc(c.phone)}" title="โทร ${esc(c.phone)}">${svg('phone','currentColor',2)}</a>`:ib('phone','','','ยังไม่มีเบอร์โทร');
        const acts=svc?[mnu([j.siteId?mi(`data-svnew="CM" data-sid="${esc(j.siteId)}"`,'wrench','บันทึกแจ้งซ่อม'):'',j.siteId?mi(`data-svnew="PM" data-sid="${esc(j.siteId)}"`,'check','บันทึกตรวจเช็ก'):'',sn?mi(`data-cpy="${esc(sn)}"`,'copy','คัดลอก S/N'):''],'','ib')]
          :[mnu([mi(`data-regedit="${esc(j.id)}"`,'pen','แก้ไขข้อมูล'),j.folderPath?mi(`data-cpy="${esc(j.folderPath)}"`,'file','คัดลอกที่อยู่โฟลเดอร์'):'',canTrash('jobs')?'<hr>':'',canTrash('jobs')?mi(`data-jdel="${esc(j.id)}"`,'trash','ย้ายไปถังขยะ',1):''],'','ib')];
        const now=j.status==='active'?`${j.stage===ST.DOCS?'รอเอกสารขนานไฟ':'รอ'+ownerOf(j)} · ${days(j.stageSince)} วัน`:j.status==='lost'?(j.lostReason||''):j.status==='cancelled'?(j.cancelReason||''):'';
        const st=svc||isInstalled(j)&&j.status==='done'?(careTags(j)||jobPill(j)):jobPill(j);
        const T=(v,cls)=>v?`<td class="${cls||''}" title="${esc(v)}">${esc(v)}</td>`:`<td class="${cls||''}"><span class="nil">—</span></td>`;
        return `<tr data-sel="${esc(j.id)}" tabindex="0" class="${S.sel===j.id?'on':''}${S.lastOpen===j.id?' lastop':''} ${agCls(j)}" aria-label="เปิดงาน ${esc(nm)}">
        ${svc?'':T(j.jobNo?'#'+j.jobNo:'','c-no m')}
        <td class="c-site"><b title="${esc(nm)}">${esc(nm)}</b></td>
        ${svc?T(e.model||j.proposedModel,'m')+T(sn,'c-sn snm m')+T(kw?kw+' kW':'','c-kw m')+T(dd(j.installDate),'c-dt m')
          :`<td class="c-tm">${teamTag(j.salesTeam)||'<span class="nil">—</span>'}</td><td class="c-eng">${j.surveyor?`<span class="engn" title="${esc(j.surveyor)}">${esc(j.surveyor)}</span>`:'<span class="nil">—</span>'}</td>`+T(dd(svDate(j)),'c-dt m')+T(kw?kw+' kW':'','c-kw m')}
        <td class="c-st">${svc?st:`<button type="button" class="pillf" data-pillf="${esc(jTok(j))}" title="กดเพื่อดูเฉพาะสถานะนี้">${st}</button>`}</td>
        <td class="c-act"><div class="ibs">${acts.join('')}</div></td></tr>`}).join(''))}${shown.length?'':`<tr class="tre"><td colspan="9">${emp('search','ไม่มีงานที่ตรงกับตัวกรอง','กดหัวคอลัมน์เพื่อเปลี่ยนตัวกรอง หรือกด "ล้างตัวกรอง"')}</td></tr>`}</tbody></table></div>`
    :`<div class="empty">${emp(svc?'wrench':'cal',status==='cm'?'ไม่มีแจ้งซ่อมค้าง':status==='pm'?'ไม่มีไซต์ที่ครบตรวจเช็กใน 30 วัน':status==='care'?'ไม่มีไซต์ที่ต้องดูแลตอนนี้':status==='installed'?'ยังไม่มีไซต์ที่ติดตั้ง':allMonths||filtered?emptyFilt(allMonths,f,mLabel(curK)):'ไม่มีไซต์ที่สำรวจในเดือน'+mLabel(curK))}</div>`}
    ${!BOARD&&list.length>10?`<div class="pgf"><label class="pgper">แถวต่อหน้า <select id="jper" aria-label="แถวต่อหน้า">${[10,20,50].map(n=>`<option ${per===n?'selected':''}>${n}</option>`).join('')}</select></label><span class="pgc">${p0+1}–${p0+shown.length} จาก ${list.length}</span><span class="pgn"><button class="ib" data-pg="-1" ${f.pg===0?'disabled':''} aria-label="หน้าก่อน">${svg('chev','currentColor',2)}</button>${Array.from({length:pages},(_,i)=>i).filter(i=>pages<=7||i===0||i===pages-1||Math.abs(i-f.pg)<=1).map((i,k,a)=>`${k&&i-a[k-1]>1?'<em>…</em>':''}<button class="pgb ${i===f.pg?'on':''}" data-pgto="${i}" ${i===f.pg?'aria-current="page"':''}>${i+1}</button>`).join('')}<button class="ib nx" data-pg="1" ${f.pg>=pages-1?'disabled':''} aria-label="หน้าถัดไป">${svg('chev','currentColor',2)}</button></span></div>`:''}
  </section>
  ${noDate&&!allMonths&&!BOARD?`<p class="sub" style="margin:0">มี ${noDate} งานที่ยังไม่มีวันสำรวจ จึงไม่อยู่ในเดือนไหน ค้นหาด้วยชื่อหรือเลขงานได้</p>`:''}
  ${S.sel&&S.jobs[S.sel]?jobDrawer(S.jobs[S.sel]):''}`;
}
function dVal([k,l,t],obj){
  const v=obj[k];
  if(t==='chk')return v?'<span class="dv ok">✓ เรียบร้อย</span>':'<span class="nil">ยังไม่ทำ</span>';
  if(v===undefined||v===null||v==='')return '<span class="nil">—</span>';
  if(t==='date')return esc(fd(v));
  if(k==='phase')return esc(v)+' เฟส';
  if(t==='url'){const u=safeUrl(v);return u?`<a href="${esc(u)}" target="_blank" rel="noopener">เปิดใน Google Maps ↗</a>`:esc(v)}
  if(t==='tel')return `<a href="tel:${esc(String(v).replace(/[^\d+]/g,''))}">${esc(v)}</a>`;
  if(t==='email')return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
  return esc(v);
}
function jobTimeline(j){
  const e=j.equipment||{},d=j.docs||{};const ev=[];
  if(j.siteId)svcOf(j.siteId).forEach(x=>ev.push({d:x.date,k:x.type,svc:x}));
  if(d.inspectDate)ev.push({d:d.inspectDate,k:'grid',t:`การไฟฟ้าตรวจแล้ว${d.summary?' · ส่งเอกสารสรุปให้ลูกค้าแล้ว':''}`});
  if(e.commissionDate)ev.push({d:e.commissionDate,k:'comm',t:`ติดตั้งเสร็จ${e.sldAsBuilt?' · Single line ตามจริงแล้ว':''}`});
  if(j.installDate)ev.push({d:j.installDate,k:'ins',t:`${j.installDate>today()?'นัดติดตั้ง':'ติดตั้งแล้ว'}${j.installTeam?' · '+j.installTeam:''}`});
  if(j.agreedDate)ev.push({d:j.agreedDate,k:'agree',t:'ลูกค้าตกลง'});
  if(svDate(j))ev.push({d:svDate(j),k:'sv',t:`${svDate(j)>today()?'นัดสำรวจ':'สำรวจหน้างาน'}${j.proposedKw?' · เสนอ '+j.proposedKw+' kW':''}${j.proposedModel?' · '+j.proposedModel:''}${j.surveyor?' · '+j.surveyor:''}`});
  (j.history||[]).filter(h=>h.kind==='note').forEach(h=>{const t=new Date(h.at);ev.push({d:isoOf(t),k:'note',t:hText(h.text)+(h.by?' · '+nm(h.by):'')})});
  ev.sort((a,b)=>String(b.d||'').localeCompare(String(a.d||'')));
  const TAG={CM:['แจ้งซ่อม','rd'],PM:['ตรวจเช็ก','ok'],grid:['ขนานไฟ','v'],comm:['ติดตั้งเสร็จ','b'],ins:['ติดตั้ง','b'],agree:['ตกลง','g'],sv:['สำรวจ','gy'],note:['บันทึก','gy']};
  if(!ev.length)return '<div class="nte">'+svg('clock','currentColor',2)+'<b>ยังไม่มีประวัติ</b><span>วันสำรวจ ติดตั้ง ตรวจเช็ก และแจ้งซ่อมจะเรียงอยู่ที่นี่</span></div>';
  return `<ol class="dtl">${ev.map(x=>{const [t,cl]=TAG[x.k];
    if(x.svc){const v=x.svc;return `<li><i class="${cl}"></i><div><p><span class="pill ${cl}">${t}</span><b>${esc(fd(v.date))}</b>${v.type==='CM'&&v.status!=='closed'?'<span class="pill o">ยังไม่ปิด</span>':''}</p>
      <p class="tt">${esc(v.type==='CM'?(v.symptom||'ไม่ระบุอาการ'):(v.result||'ตรวจเช็กประจำปี'))}</p>
      ${v.action?`<p class="sub">วิธีแก้: ${esc(v.action)}</p>`:''}${v.parts?`<p class="sub">อะไหล่: ${esc(v.parts)}</p>`:''}
      <p class="sub">${[v.channel,v.by?'ผู้ไป: '+v.by:''].filter(Boolean).map(esc).join(' · ')}</p></div>
      <button class="btn sm ghost" data-svedit="${esc(v.id)}">แก้ไข</button></li>`}
    return `<li><i class="${cl}"></i><div><p><span class="pill ${cl}">${t}</span><b>${esc(fd(x.d))}</b></p><p class="tt">${esc(x.t)}</p></div></li>`}).join('')}</ol>`;
}
function jobDrawer(j){
  const c=cOf(j),s=sOf(j),e=j.equipment||{};const rn=realName(c);const inst=isInstalled(j)&&!(j.status==='active'&&(j.stage<ST.COMM||(j.stage===ST.COMM&&!isImp(j))));
  const clean=x=>String(x).replace(/\s*\((ไม่บังคับ|วิศวกรกรอก)\)/g,'').replace(/ตามใบเซอร์เวย์ FM-EN-028-A/,' (FM-EN-028-A)').replace(/\s*\(YYMMNNN\)/,'').replace('ลิงก์ Google Maps ตำแหน่งลูกค้า','ตำแหน่งบน Google Maps');
  const steps=svSteps(j,s);const nOk=steps.filter(x=>x.ok).length;
  const agreed=j.status==='done'||(j.status==='active'&&j.stage>=ST.INSREQ);
  const secs=SECTIONS.filter(x=>(x.id!=='pm'||j.status==='done')&&(agreed||!['install','eq','docs','pm'].includes(x.id)));
  const grp=(title,rows)=>`<section class="dg"><h3>${title}</h3><dl>${rows}</dl></section>`;
  const row=(l,v)=>`<div><dt>${esc(l)}</dt><dd>${v}</dd></div>`;
  const cp=v=>v?`<button class="cpb" data-cpy="${esc(v)}" aria-label="คัดลอก ${esc(v)}" title="คัดลอก">${svg('copy','currentColor',2)}</button>`:'';
  const tab=S.dtab||(inst?'hist':'info');
  const nil='<span class="nil">—</span>';
  const facts=inst?`<div class="dkf k4">
      <div class="dk key"><small>S/N อินเวอร์เตอร์</small><b class="mono">${e.sn?esc(e.sn):'ยังไม่มี'}</b>${cp(e.sn)}${invUnits(e).length>1?`<em>+ Slave ${invUnits(e).length-1} เครื่อง: ${invUnits(e).slice(1).map(u=>esc(u.sn||'—')).join(', ')}</em>`:''}</div>
      <div class="dk w2"><small>ระบบ</small><b>${[e.model||j.proposedModel,e.kw||j.proposedKw?(e.kw||j.proposedKw)+' kW':''].filter(Boolean).map(esc).join(' · ')||nil}</b></div>
      <div class="dk"><small>ติดตั้ง</small><b>${j.installDate?esc(fd(j.installDate)):nil}</b></div>
      <div class="dk"><small>ประกันถึง</small><b>${e.warrantyEnd?esc(fd(e.warrantyEnd)):nil}</b>${e.warrantyEnd?`<em class="${dLeft(e.warrantyEnd)<0?'bad':''}">${warrantyTxt(e.warrantyEnd)}</em>`:''}</div>
</div>`
    :(()=>{const g=k=>j[k]||(s&&s[k])||'';const done=steps.filter(x=>x.ok);const nx=steps.find(x=>!x.ok);
      const who=[['ทีมขาย',[j.salesTeam,g('salesPerson')].filter(Boolean).join(' · ')],['คนสำรวจ',j.surveyor||j.surveyTeam],['วันสำรวจ',svDate(j)?fd(svDate(j))+(j.queueTime?' '+j.queueTime:''):''],...(j.stage>=ST.INSREQ||j.status!=='active'?[['วันติดตั้ง',j.installDate?fd(j.installDate)+(j.installEnd&&j.installEnd!==j.installDate?' – '+fd(j.installEnd):''):''],['ผู้คุมงาน',j.supervisor],['ผู้รับเหมา',j.installTeam]]:[])].filter(([k,v],i)=>v||i<2);
      const prop=[j.proposedKw?j.proposedKw+' kW':'',j.proposedModel,g('batteryKwh')?'แบตเตอรี่ '+g('batteryKwh')+' kWh':''].filter(Boolean);
      const notes=[['ถึงทีมสำรวจ',g('salesNote')],['ใบงาน',g('woNote')],['ขนาดที่เสนอ',g('proposedNote')],['ทั่วไป',j.note]].filter(x=>x[1]);
      return `<div class="dsum">
      <section class="dsc"><h4>ใครทำ</h4><dl>${who.map(([k,v])=>`<div><dt>${k}</dt><dd>${v?esc(v):nil}</dd></div>`).join('')}</dl></section>
      <section class="dsc"><h4>เสนออะไรไป</h4>${prop.length?`<p class="dsbig">${prop.map(esc).join(' · ')}</p>`:'<p class="dsnil">ยังไม่ได้เสนอ</p>'}</section>
      ${notes.length?`<section class="dsc"><h4>หมายเหตุ</h4><ul class="dsn">${notes.map(([k,v])=>`<li><small>${k}</small>${esc(v)}</li>`).join('')}</ul></section>`:''}</div>`})();
  const now=j.status==='active'?`<p class="dnow"><span>ตอนนี้: <b>${esc(STAGES[j.stage].name)}</b>${j.stage===ST.DOCS?'':' · รอ '+esc(ownerOf(j)||'')}</span>${ageTag(j)}</p>`:'';
  return `<div class="dov" data-dclose="1"></div>
  <aside class="drw" role="dialog" aria-modal="true" aria-labelledby="drwT">
    <header class="drh2">
      <div class="drt"><small>${j.jobNo?'#'+esc(j.jobNo):'ยังไม่มีเลขงาน'}${placeOf(j,s,c)?' · '+esc(placeOf(j,s,c)):''}${s.utility?' · '+esc(s.utility):''}</small>
        <h2 id="drwT">${esc(j.title||c.name||'ไม่มีชื่อไซต์')}</h2>
        <div class="drm">${jobPill(j)}${inst?careTags(j):''}${rn||c.phone?`<span class="sub">${[rn,c.phone].filter(Boolean).map(esc).join(' · ')}</span>`:''}</div>
        ${j.status==='active'?`<div class="dtrack">${stageBar(j)}</div>${now}`:''}</div>
      <div class="drhb">${navCtl(j.id)}<button class="btn sm ghost drx" data-dclose="1" aria-label="ปิด">ปิด ✕</button></div>
    </header>
    ${facts}
    ${(()=>{const sj=j.siteId?siteJobs(j.siteId):[];return sj.length>1?`<div class="dsc" style="margin:0 20px 12px"><h4>งานของไซต์นี้ ${sj.length} งาน</h4>${sj.map(x=>`<a href="#job-${esc(x.id)}" class="dsj" style="display:flex;justify-content:space-between;gap:8px;padding:4px 0"><span>${esc(x.jobNo?'#'+x.jobNo:'ยังไม่มีเลข')} · ${esc(x.type==='addon'?'ติดตั้งเพิ่ม':'งานแรก')}${x.id===j.id?' (งานนี้)':''}</span>${jobPill(x)}</a>`).join('')}</div>`:''})()}
    <div class="dra">
      <a class="btn sm dk dgo" href="#job-${esc(j.id)}">เปิดหน้างาน</a>
      ${c.phone?`<a class="btn sm dic" href="tel:${esc(String(c.phone).replace(/[^\d+]/g,''))}" aria-label="โทร ${esc(c.phone)}" title="โทร ${esc(c.phone)}">${svg('phone','currentColor',2)}</a>`:''}${safeUrl(s.mapLink)?`<a class="btn sm dic" href="${esc(safeUrl(s.mapLink))}" target="_blank" rel="noopener" aria-label="แผนที่" title="แผนที่">${svg('pin','currentColor',2)}</a>`:''}
      ${inst?`<details class="dmore"><summary class="btn sm">อื่นๆ ${svg('chev','currentColor',2)}</summary><div class="dmm">${j.siteId?`<button data-svnew="CM" data-sid="${esc(j.siteId)}">${svg('wrench','currentColor',2)}บันทึกแจ้งซ่อม</button><button data-svnew="PM" data-sid="${esc(j.siteId)}">${svg('check','currentColor',2.2)}บันทึกตรวจเช็ก</button>`:''}<button data-regedit="${esc(j.id)}">${svg('pen','currentColor',2)}แก้ข้อมูลระบบ</button></div></details>`:''}
    </div>
    <div class="dtabs seg" role="tablist"><button role="tab" aria-selected="${tab==='hist'}" class="${tab==='hist'?'on':''}" data-dtab="hist">ประวัติ</button><button role="tab" aria-selected="${tab==='info'}" class="${tab==='info'?'on':''}" data-dtab="info">ข้อมูลทั้งหมด</button><button role="tab" aria-selected="${tab==='chat'}" class="${tab==='chat'?'on':''}" data-dtab="chat">แชต${chatN(j.id)?` <i class="slc">${chatN(j.id)}</i>`:''}</button></div>
    <div class="drb">
      ${tab==='chat'?jobChat(j):tab==='hist'?jobTimeline(j):`
      ${j.folderPath?grp('โฟลเดอร์ไฟล์',row('ที่อยู่บน NAS',`<span class="mono">${esc(j.folderPath)}</span>${cp(j.folderPath)}`)):''}
      ${secs.map(sec=>{const o=getT(sec.tgt,j,c,s);return grp(esc(clean(sec.title)),sec.fields.filter(x=>x[2]!=='h').map(fl=>row(clean(fl[1]),dVal(fl,o))).join(''))}).join('')}
      ${j.stage>=ST.SURVEY||j.status!=='active'?`<details class="dg dfold"><summary><h3>ขั้นตอนสำรวจ<span>${nOk}/${steps.length}</span></h3></summary><ol class="dsteps">${steps.map(x=>`<li class="${x.ok?'ok':''}"><i>${x.ok?'✓':''}</i>${esc(x.t)}</li>`).join('')}</ol></details>`:''}`}
    </div>
  </aside>`;
}

/* ---------- site registry ---------- */
const CM_CH=['ลูกค้าโทรแจ้ง','LINE','เซลส์แจ้ง','แอปมอนิเตอร์','ตรวจพบตอนตรวจเช็ก','อื่นๆ'];
/* Master = ช่อง model/sn/wifiSn เดิม · units[0] ตามให้ตรงเสมอ */
function eqSync(e){if(!e||!Array.isArray(e.units)||!e.units.length)return e;const u=[...e.units];u[0]={...u[0],role:'Master',model:e.model||'',sn:e.sn||'',wifiSn:e.wifiSn||''};return {...e,units:u}}
const unitSns=e=>invUnits(e).flatMap(u=>[u.sn,u.wifiSn]).filter(Boolean).join(' ');
const slaveRow=(u,i)=>`<div class="eqsl" style="display:grid;grid-template-columns:90px 1fr 1fr 1fr auto;gap:8px;align-items:end;margin-top:8px"><b style="font-size:14px;padding-bottom:8px">Slave <i>${i+1}</i></b>
  <label class="fld">รุ่น<input data-uk="model" value="${esc(u.model||'')}" list="dl-INVERTER"></label><label class="fld">S/N เครื่อง<input data-uk="sn" value="${esc(u.sn||'')}"></label><label class="fld">S/N WiFi<input data-uk="wifiSn" value="${esc(u.wifiSn||'')}"></label>
  <button class="btn sm dangero" type="button" data-eqsdel="1" style="margin-bottom:4px">ลบ</button></div>`;
document.addEventListener('click',e=>{const t=e.target.closest('[data-eqsadd],[data-eqsdel]');if(!t)return;const sec=t.closest('[data-sec]');if(!sec)return;const box=sec.querySelector('.eqsls');
  if(t.dataset.eqsadd){const m=sec.querySelector('[data-k="model"]');box.insertAdjacentHTML('beforeend',slaveRow({model:m?m.value:''},box.children.length))}else t.closest('.eqsl').remove();
  [...box.children].forEach((r,i)=>{const x=r.querySelector('b i');if(x)x.textContent=i+1})});
function siteJobs(sid){return Object.values(S.jobs).filter(j=>j.siteId===sid).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))}
function mainJob(sid){const L=siteJobs(sid);return L.find(j=>isInstalled(j))||L[0]||null}
function isInstalled(j){return !!j&&(j.status==='done'||(j.status==='active'&&j.stage>=ST.COMM)||(!!j.installDate&&j.installDate<=today()))}
const svcOf=sid=>Object.values(S.services||{}).filter(x=>x.siteId===sid).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(b.createdAt||0)-(a.createdAt||0));
const cmOpen=sid=>svcOf(sid).filter(x=>x.type==='CM'&&x.status!=='closed');
function warrantyTxt(d){if(!d)return '';const n=dLeft(d);if(n<0)return 'หมดประกันแล้ว';const m=Math.floor(n/30.4);return m>=1?`เหลือ ${m} เดือน`:`เหลือ ${n} วัน`}
function pmBadge(due){if(!due)return '';const n=dLeft(due);const cls=n<0?'rd':n<=30?'o':'gy';return `<span class="pill ${cls}">${n<0?`เลยกำหนดตรวจเช็ก ${-n} วัน`:n===0?'ครบกำหนดตรวจเช็กวันนี้':n<=30?`ตรวจเช็กอีก ${n} วัน`:'ตรวจเช็ก '+fd(due)}</span>`}
/* forms */
const REGF=[
 ['h','ไซต์และลูกค้า'],['title','ชื่อไซต์','text',{req:1,full:1,ph:'บ้านคุณสมชาย ลาดพร้าว 71'}],['firstName','ชื่อลูกค้า','text'],['lastName','นามสกุล','text'],['phone','เบอร์ติดต่อ','tel'],['area','เขต / อำเภอ','text'],
 ['utility','การไฟฟ้า','sel',['MEA','PEA']],['phase','ประเภทไฟฟ้า','sel',['1','3']],['address','ที่อยู่','text',{full:1}],
 ['h','ระบบที่ติดตั้ง'],['kw','ขนาด (kW)','number'],['systemType','ประเภทระบบ','sel',['On Grid','Hybrid']],['model','รุ่นอินเวอร์เตอร์','model','INVERTER'],['sn','S/N อินเวอร์เตอร์','text'],
 ['wifiSn','S/N WiFi','text'],['plantName','Plant name','text'],['panels','จำนวนแผง','number'],['ct','ขนาด CT','model','CT'],['meter','Smart meter','model','SMART METER'],
 ['installDate','วันติดตั้ง','date'],['warrantyEnd','ประกันอินเวอร์เตอร์ถึง','date'],['folderPath','โฟลเดอร์ไฟล์บน NAS','text',{full:1,ph:'\\\\192.168.200.249\\Energy\\...'}]];
function regVals(jid){
  const j=S.jobs[jid];if(!j)return {};const s=sOf(j),c=cOf(j),e=j.equipment||{};
  return {title:j.title||c.name||s.label,firstName:c.firstName,lastName:c.lastName,phone:c.phone,area:s.area,utility:s.utility,phase:s.phase,address:s.address||c.address,
    kw:e.kw||j.proposedKw,systemType:e.systemType||j.request?.systemType,model:e.model||j.proposedModel,sn:e.sn,wifiSn:e.wifiSn,plantName:e.plantName,panels:e.panels,ct:e.ct,meter:e.meter,
    installDate:j.installDate,warrantyEnd:e.warrantyEnd,folderPath:j.folderPath};
}
function fieldRow([k,l,t,o],v,pre){
  if(k==='h')return `<div class="formh">${esc(l)}</div>`;
  const id=pre+k;const opt=(o&&!Array.isArray(o)&&typeof o==='object')?o:{};const full=opt.full?'full':'';
  let inp;
  if(t==='sel')inp=`<select id="${id}" data-k="${k}"><option value="">—</option>${o.map(x=>`<option ${String(v??'')===String(x)?'selected':''}>${esc(x)}</option>`).join('')}</select>`;
  else if(t==='area')inp=`<textarea id="${id}" data-k="${k}" rows="3"${opt.req?' required':''}>${esc(v??'')}</textarea>`;
  else if(t==='model')inp=`<input type="text" id="${id}" data-k="${k}" list="dl-${esc(o)}" value="${esc(v??'')}">`;
  else inp=`<input type="${t}" id="${id}" data-k="${k}" value="${esc(v??'')}"${t==='number'?' step="any"':''}${opt.req?' required':''}${opt.ph?` placeholder="${esc(opt.ph)}"`:''}>`;
  return `<label class="fld ${full}" for="${id}">${esc(l)}${opt.req?' *':''}${inp}</label>`;
}
function formModal(id,title,fields,vals,ok,extra=''){
  $('#modal').innerHTML=`<div class="modalbg" data-mbg="1"><form class="modal fmod" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}T" novalidate>
    <div class="fmh"><h2 id="${id}T">${esc(title)}</h2><button type="button" class="btn sm ghost" data-mclose="1" aria-label="ปิด">ปิด ✕</button></div>
    <div class="fmb"><div class="fgrid">${fields.map(f=>fieldRow(f,vals[f[0]],id+'-')).join('')}</div>${extra}</div>
    <div class="fmf"><span class="fmerr" id="${id}E" role="alert"></span><button type="button" class="btn" data-mclose="1">ยกเลิก</button><button type="submit" class="btn pri">${esc(ok)}</button></div>
  </form>${datalists()}</div>`;
  setTimeout(()=>document.querySelector(`#${id} input,#${id} select,#${id} textarea`)?.focus(),0);
}
const readF=id=>{const o={};document.querySelectorAll(`#${id} [data-k]`).forEach(el=>{o[el.dataset.k]=el.type==='number'?(el.value===''?'':Number(el.value)):el.value.trim()});return o};
function closeModal(){$('#modal').innerHTML=''}
/* ลบงาน: ต้องพิมพ์ชื่อไซต์ให้ตรงก่อนถึงจะลบได้ */
const impAgreed=j=>!!(j.agreedDate||j.installDate||j.status==='done'||(j.status==='active'&&j.stage>=ST.INSREQ));
const isoD=v=>!v||/^\d{4}-\d\d-\d\d$/.test(String(v));
function impFields(j){const dt=k=>isoD(j[k])?'date':'text';
  return [['h','วันสำรวจ'],['surveyDate','วันที่สำรวจ',dt('surveyDate')],['queueTime','เวลานัด','text',{ph:'เช่น 09:00'}],
    ...(impAgreed(j)?[['h','การตอบรับติดตั้ง'],['agreedDate','วันที่ลูกค้าตกลง',dt('agreedDate')],['installDate','วันติดตั้ง',dt('installDate')]]:[]),
    ['h','วัดพฤติกรรมไฟ'],['loggerDevice','เครื่องที่ใช้วัด','text'],['logStart','เริ่มวัด',dt('logStart')],['logEnd','เก็บเครื่อง',dt('logEnd')],
    ['h','ชื่อ ที่อยู่ เบอร์'],['name','ชื่อลูกค้า','text',{req:1}],['phone','เบอร์ติดต่อ','tel'],['area','เขต / อำเภอ','text'],['address','ที่อยู่','text',{full:1}]]}
function openImpForm(jid){const j=S.jobs[jid];if(!j||!isImp(j))return;const c=cOf(j),s=sOf(j);
  formModal('impF','แก้ไขข้อมูลงานนำเข้า',impFields(j),{surveyDate:j.surveyDate||j.queueDate,queueTime:j.queueTime,agreedDate:j.agreedDate,installDate:j.installDate,
    loggerDevice:j.loggerDevice,logStart:j.logStart,logEnd:j.logEnd,name:c.name,phone:c.phone,area:s.area,address:s.address||c.address},'บันทึก',
    `<p class="sub" style="margin:12px 0 0">ข้อมูลจากหน้างาน (ใบสำรวจ ไซต์ สิ่งที่เสนอ) ${esc(j.surveyor||'คนสำรวจ')} เป็นคนแก้ใน Man</p>`);$('#impF').dataset.jid=jid}
async function saveImp(){
  const v=readF('impF');const j=S.jobs[$('#impF').dataset.jid];if(!j)return closeModal();
  if(!v.name){$('#impFE').textContent='ใส่ชื่อลูกค้าก่อน';$('#impF-name').focus();return}
  const dif=(o,n)=>Object.fromEntries(Object.entries(n).filter(([k,x])=>x!==undefined&&String(x??'')!==String(o?.[k]??'')));
  const jp={queueTime:v.queueTime,loggerDevice:v.loggerDevice,logStart:v.logStart,logEnd:v.logEnd,...(impAgreed(j)?{agreedDate:v.agreedDate,installDate:v.installDate}:{})};
  const jd=dif(j,jp);if(String(v.surveyDate||'')!==String(j.surveyDate||j.queueDate||'')){jd.surveyDate=v.surveyDate;jd.queueDate=v.surveyDate}
  const cd=j.customerId?dif(cOf(j),{name:v.name,phone:v.phone}):{},sd=j.siteId?dif(sOf(j),{area:v.area,address:v.address}):{};
  const L={surveyDate:'วันสำรวจ',queueTime:'เวลานัด',agreedDate:'วันลูกค้าตกลง',installDate:'วันติดตั้ง',loggerDevice:'เครื่องวัดไฟ',logStart:'เริ่มวัด',logEnd:'เก็บเครื่อง',name:'ชื่อ',phone:'เบอร์',area:'เขต',address:'ที่อยู่'};
  const ch=[...Object.keys(jd).filter(k=>k!=='queueDate'),...Object.keys(cd),...Object.keys(sd)].map(k=>L[k]||k);
  if(!ch.length){closeModal();return toast('ไม่มีอะไรเปลี่ยน')}
  try{
    if(Object.keys(cd).length)await w('customers/'+j.customerId,cd);
    if(Object.keys(sd).length)await w('sites/'+j.siteId,sd);
    await pushHist(j,ev('edit','แก้ไขข้อมูลงานนำเข้า: '+ch.join(', ')),jd);
    closeModal();toast('บันทึกแล้ว');
  }catch(e){}
}
const regInst=j=>!!j&&(j.status==='done'||(j.status==='active'&&j.stage>=ST.DOCS));
const REGF_SITE=()=>[...REGF.slice(0,REGF.findIndex(f=>f[0]==='h'&&f[1]==='ระบบที่ติดตั้ง')),REGF.find(f=>f[0]==='folderPath')];
function openRegForm(jid){const j=S.jobs[jid];const inst=regInst(j);
  formModal('regF',inst?'แก้ไขข้อมูลระบบ':'แก้ไขข้อมูลไซต์',inst?REGF:REGF_SITE(),regVals(jid),'บันทึก',inst?'':`<p class="sub" style="margin:12px 0 0">ข้อมูลระบบที่ติดตั้ง (รุ่น, S/N, แผง ฯลฯ) กรอกได้หลังติดตั้งเสร็จ</p>`);$('#regF').dataset.jid=jid;
  ['utility','phase'].forEach(k=>{const el=$('#regF-'+k);if(el){el.disabled=true;el.title='คนสำรวจเป็นคนกรอก'}})}
async function saveReg(){
  const v=readF('regF');const j=S.jobs[$('#regF').dataset.jid];if(!j)return closeModal();
  if(!v.title){$('#regFE').textContent='ใส่ชื่อไซต์ก่อน';$('#regF-title').focus();return}
  const eq={kw:v.kw,systemType:v.systemType,model:v.model,sn:v.sn,wifiSn:v.wifiSn,plantName:v.plantName,panels:v.panels,ct:v.ct,meter:v.meter,warrantyEnd:v.warrantyEnd};
  try{
    const dif=(o,n)=>Object.fromEntries(Object.entries(n).filter(([k,x])=>String(x??'')!==String(o?.[k]??'')));
    if(j.customerId){const cu={firstName:v.firstName,lastName:v.lastName,phone:v.phone};const nm2=[v.firstName,v.lastName].filter(Boolean).join(' ');if(nm2)cu.name=nm2;const d=dif(cOf(j),cu);if(Object.keys(d).length)await w('customers/'+j.customerId,d)}
    if(j.siteId){const d=dif(sOf(j),{label:v.title,area:v.area,utility:v.utility,phase:v.phase,address:v.address});if(Object.keys(d).length)await w('sites/'+j.siteId,d)}
    await pushHist(j,ev('edit',regInst(j)?'แก้ไขข้อมูลระบบ':'แก้ไขข้อมูลไซต์'),regInst(j)?{title:v.title,installDate:v.installDate,folderPath:v.folderPath,equipment:eqSync({...(j.equipment||{}),...eq})}:{title:v.title,folderPath:v.folderPath});
    closeModal();toast('บันทึกแล้ว');
  }catch(e){}
}
const CMF=[['date','วันที่แจ้ง','date',{req:1}],['channel','แจ้งทาง','sel',CM_CH],['symptom','อาการ / ปัญหา','area',{req:1,full:1}],['action','วิธีแก้','area',{full:1}],['parts','อะไหล่ที่เปลี่ยน','text',{full:1}],['by','ผู้ไปหน้างาน','text'],['status','สถานะ','sel',['กำลังดำเนินการ','ปิดงานแล้ว']]];
const PMF=[['date','วันที่ตรวจเช็ก (ย้อนหลังได้)','date',{req:1}],['by','ผู้ไปหน้างาน','text'],['result','ผลตรวจ / สิ่งที่ทำ','area',{full:1}],['parts','อะไหล่ที่เปลี่ยน','text',{full:1}]];
function openSvc(type,svid,sid){
  const x=svid?S.services[svid]:null;type=x?x.type:type;
  const vals=x?{...x,status:x.status==='closed'?'ปิดงานแล้ว':'กำลังดำเนินการ'}:{date:today(),status:'กำลังดำเนินการ'};
  formModal('svF',(x?'แก้ไข':'บันทึก')+(type==='CM'?'แจ้งซ่อม':'ตรวจเช็กประจำปี'),type==='CM'?CMF:PMF,vals,'บันทึก',x?`<button type="button" class="btn sm ghost kbdel svdel" data-svdel="${esc(svid)}">${svg('trash','currentColor',2)}ลบรายการนี้</button>`:'');
  const f=$('#svF');f.dataset.type=type;f.dataset.id=svid||'';f.dataset.sid=x?x.siteId:sid;
}
async function saveSvc(){
  const f=$('#svF');const v=readF('svF');const type=f.dataset.type;const sid=f.dataset.sid;
  if(!v.date){$('#svFE').textContent='ใส่วันที่ก่อน';return}
  if(type==='PM'&&v.date>today()){$('#svFE').textContent='ใส่วันที่ตรวจจริง (ล่วงหน้าไม่ได้)';return}
  if(type==='CM'&&!v.symptom){$('#svFE').textContent='ใส่อาการหรือปัญหาก่อน';$('#svF-symptom').focus();return}
  const now=Date.now();const j=mainJob(sid);
  const d={...v,type,siteId:sid,jobId:j?.id||null,updatedAt:now,by:v.by};
  if(type==='CM'){d.status=v.status==='ปิดงานแล้ว'?'closed':'open';const old=f.dataset.id?S.services[f.dataset.id]:null;if(d.status==='closed'&&!(old&&old.closedAt))d.closedAt=today();if(d.status!=='closed')d.closedAt=''}
  try{
    if(f.dataset.id)await w('services/'+f.dataset.id,d);
    else await w('services/'+S.db.collection('services').doc().id,{...d,createdAt:now,createdBy:S.me.id||null},'set');
    if(type==='PM'&&j&&(!j.lastPm||v.date>j.lastPm))await pushHist(j,ev('edit','ตรวจเช็กประจำปี '+fd(v.date)),{lastPm:v.date});
    closeModal();toast(type==='PM'?'บันทึกการตรวจเช็กแล้ว':'บันทึกแจ้งซ่อมแล้ว');
  }catch(e){}
}

/* ---------- knowledge base ---------- */
const KBC=[
 {k:'system',t:'เริ่มต้นใช้งานระบบ',ic:'grid'},
 {k:'survey',t:'สำรวจหน้างาน',ic:'pin'},
 {k:'docs',t:'เอกสารการไฟฟ้า',ic:'doc'},
 {k:'equip',t:'อุปกรณ์และรุ่น',ic:'bolt'},
 {k:'fix',t:'แก้ปัญหาหน้างาน',ic:'wrench'}];
const kbCol=k=>KBC.find(c=>c.k===k)||{k:'',t:'ไม่มีหมวด',ic:'doc'};
const kbDate=ms=>{if(!ms)return '—';const d=new Date(ms);return `${d.getDate()} ${TM[d.getMonth()]} ${String(d.getFullYear()+543).slice(2)}`};
const kbPill=a=>a.status==='published'?'<span class="pill ok">เผยแพร่แล้ว</span>':'<span class="pill gy">ฉบับร่าง</span>';
function kbMd(src){
  const inl=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out=[];let list=null;
  const flush=()=>{if(list){out.push(`<${list.t}>${list.i.map(x=>`<li>${inl(x)}</li>`).join('')}</${list.t}>`);list=null}};
  String(src||'').split('\n').forEach(l=>{
    const L=l.trim();let m;
    if(!L){flush();return}
    if(m=L.match(/^##\s+(.*)/)){flush();out.push(`<h2>${inl(m[1])}</h2>`);return}
    if(m=L.match(/^###\s+(.*)/)){flush();out.push(`<h3>${inl(m[1])}</h3>`);return}
    if(m=L.match(/^[-•]\s+(.*)/)){if(!list||list.t!=='ul'){flush();list={t:'ul',i:[]}}list.i.push(m[1]);return}
    if(m=L.match(/^\d+[.)]\s+(.*)/)){if(!list||list.t!=='ol'){flush();list={t:'ol',i:[]}}list.i.push(m[1]);return}
    if(m=L.match(/^>\s*(.*)/)){flush();out.push(`<blockquote>${inl(m[1])}</blockquote>`);return}
    flush();out.push(`<p>${inl(L)}</p>`);
  });flush();return out.join('');
}
/* อุปกรณ์ในคลังความรู้: อินเวอร์เตอร์ แบต แผง · CT / Smart meter เป็นความสัมพันธ์ของอินเวอร์เตอร์ */
const EQT=[['INVERTER','อินเวอร์เตอร์','bolt'],['BATTERY','แบตเตอรี่','layers'],['SOLAR PANEL','แผงโซลาร์','sun']];
const csv=v=>String(v||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
function eqGuess(p){if(p.category==='SOLAR PANEL'&&!p.watt){const w=String(p.model||'').match(/(\d{3})/);return w?{...p,watt:w[1]}:p}if(p.category!=='INVERTER')return p;const m=String(p.model||'');const k=m.match(/(\d+(?:\.\d+)?)\s*K/i),f=m.match(/-P([13])/i);return {...p,kw:p.kw||(k?k[1]:''),phase:p.phase||(f?f[1]:'')}}
function eqSpec(p){p=eqGuess(p);const c=p.category;return c==='INVERTER'?[['ยี่ห้อ',p.brand],['กำลัง',p.kw?p.kw+' kW':''],['ระบบไฟ',p.phase?p.phase+' เฟส':''],['ประเภท',p.type]]:c==='BATTERY'?[['ยี่ห้อ',p.brand],['ความจุ',p.kwh?p.kwh+' kWh':''],['แรงดัน',p.volt]]:[['ยี่ห้อ',p.brand],['กำลัง',p.watt?p.watt+' W':''],['ชนิดเซลล์',p.cell]]}
function eqBig(p){p=eqGuess(p);const c=p.category;return c==='INVERTER'?(p.kw?[p.kw,'kW']:null):c==='BATTERY'?(p.kwh?[p.kwh,'kWh']:null):(p.watt?[p.watt,'W']:null)}
function eqEmbed(u){u=String(u||'');let m=u.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);if(m)return 'https://drive.google.com/file/d/'+m[1]+'/preview';m=u.match(/drive\.google\.com\/open\?id=([^&#]+)/);if(m)return 'https://drive.google.com/file/d/'+m[1]+'/preview';if(/docs\.google\.com\//.test(u))return u.replace(/\/(edit|view)([?#].*)?$/,'/preview');return u}
const EQD=[['datasheet','Datasheet'],['manual','คู่มือ'],['other','เอกสารอื่น']];
function eqVis(p,big){const ic=(EQT.find(x=>x[0]===p.category)||[])[2]||'bolt';const b=eqBig(p);
  return p.img&&isWeb(p.img)?`<div class="pdv img"><img src="${esc(p.img)}" alt="${esc(p.model)}" loading="lazy" onerror="this.parentNode.classList.remove('img');this.remove()"></div>`
  :`<div class="pdv ${big?'big':''}"><span class="pdvi">${svg(ic,'currentColor',1.7)}</span>${b?`<span class="pdvn"><b>${esc(b[0])}</b>${b[1]}</span>`:''}</div>`}
function viewEquip(){
  const cat=S.f.eqc||'INVERTER';const P=Object.values(S.products);const q=(S.f.eqq||'').trim().toLowerCase();const ty=cat==='INVERTER'?(S.f.eqt||''):'';
  const inCat=P.filter(p=>p.category===cat);
  const L=inCat.filter(p=>(!ty||p.type===ty)&&(!q||[p.model,p.brand,p.type,p.note].join(' ').toLowerCase().includes(q))).sort((a,b)=>String(a.model).localeCompare(String(b.model),'en',{numeric:true}));
  const card=p=>{const ds=p.datasheet;const sp=eqSpec(p).filter(x=>x[1]&&x[0]!=='ยี่ห้อ'&&x[0]!=='ประเภท').map(x=>x[1]);
    return `<button type="button" class="pdc" data-eqview="${esc(p.id)}" aria-label="ดู Datasheet ${esc(p.model)}">
      ${eqVis(p)}${p.type?`<span class="pdt">${esc(p.type)}</span>`:''}
      <span class="pdb"><b>${esc(p.model)}</b><span>${[p.brand,...sp].filter(Boolean).map(esc).join(' · ')||'ยังไม่มีสเปก'}</span></span>
      <span class="pdf"><span class="pdd ${ds?'on':''}">${svg('file','currentColor',2)}${ds?'Datasheet':'ยังไม่มี Datasheet'}</span><span class="pdgo">ดูรายละเอียด ${svg('chev','currentColor',2.2)}</span></span></button>`};
  return pageHead('แคตตาล็อกสินค้า','สเปก Datasheet และคู่มือ',`<label class="btn" for="eqxfile" title="นำเข้าไฟล์ Catalog.xlsx">${svg('file','currentColor',2)}นำเข้าจาก Excel<input type="file" id="eqxfile" accept=".xlsx" hidden></label><button class="btn pri" data-eqnew="${cat}">${svg('plus','#fff',2.4)}เพิ่มรุ่น</button>`)+`
  <section class="card eqw">
    <div class="tqb pdtb"><label class="jsrch">${svg('search','currentColor',2)}<input id="eqq" type="search" placeholder="รุ่น หรือยี่ห้อ" value="${esc(S.f.eqq||'')}" aria-label="ค้นหารุ่นสินค้า" autocomplete="off"></label>
      <div class="seg" role="group" aria-label="ประเภทสินค้า">${EQT.map(([k,t])=>`<button class="${cat===k?'on':''}" data-eqc="${k}" aria-pressed="${cat===k}">${t}<span class="n">${P.filter(p=>p.category===k).length}</span></button>`).join('')}</div>
      ${cat==='INVERTER'?`<div class="seg sm" role="group" aria-label="ประเภทระบบ">${[['','ทุกระบบ'],['Hybrid','Hybrid'],['On Grid','On Grid']].map(([k,t])=>`<button class="${ty===k?'on':''}" data-eqt="${esc(k||'all')}" aria-pressed="${ty===k}">${t}</button>`).join('')}</div>`:''}
      <span class="sub pdcnt">${L.length} รุ่น</span></div>
    ${!inCat.length?`<div class="empty">${emp('layers','ยังไม่มีรุ่นในหมวดนี้',S.me.edit&&!document.body.classList.contains('rocat')?'กด "เพิ่มรุ่น" เพื่อเริ่ม':'')}</div>`:!L.length?`<div class="empty">${emp('search','ไม่พบรุ่นที่ค้นหา','ลองค้นด้วยชื่อยี่ห้อหรือรุ่นอื่น')}</div>`:`<div class="pdg">${L.map(card).join('')}</div>`}
  </section>`;
}
function eqDetail(id,doc){const p=S.products[id];if(!p)return;S.eqv={id,doc};
  const docs=EQD.filter(([k])=>p[k]);const cur=doc&&p[doc]?doc:(docs[0]||[])[0];const u=cur?p[cur]:'';const web=isWeb(u);
  const spec=eqSpec(p).filter(x=>x[1]);
  $('#modal').innerHTML=`<div class="modalbg" data-eqx="bg"><div class="modal pdm" role="dialog" aria-modal="true" aria-labelledby="pdmT">
    <aside class="pdl">${eqVis(p,1)}
      <div class="pdh"><small>${esc((EQT.find(x=>x[0]===p.category)||[,''])[1])}${p.type?' · '+esc(p.type):''}</small><h2 id="pdmT">${esc(p.model)}</h2></div>
      ${spec.length?`<dl class="pds">${spec.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:'<p class="sub">ยังไม่มีสเปก</p>'}
      ${p.note?`<p class="pdn">${esc(p.note)}</p>`:''}
      <button type="button" class="btn pdedit" data-eqedit="${esc(id)}">${svg('pen','currentColor',2)}แก้ไขข้อมูลรุ่นนี้</button>
    </aside>
    <section class="pdr">
      <header class="pdrh">${docs.length?`<div class="seg" role="tablist">${docs.map(([k,t])=>`<button role="tab" class="${k===cur?'on':''}" aria-selected="${k===cur}" data-eqdoc="${k}">${t}</button>`).join('')}</div>`:'<b>เอกสาร</b>'}
        <span class="pdra">${u?(web?`<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">เปิดแท็บใหม่ ↗</a>`:`<button type="button" class="btn sm" data-cpy="${esc(u)}">คัดลอกที่อยู่ไฟล์</button>`):''}<button type="button" class="pdx" data-eqx="1" aria-label="ปิด"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></header>
      <div class="pdvw">${!u?`<div class="pde">${svg('file','currentColor',1.6)}<b>ยังไม่มี Datasheet ของรุ่นนี้</b><span>ใส่ลิงก์ไฟล์ PDF หรือ Google Drive แล้วจะเปิดดูได้ที่นี่ทันที</span><button type="button" class="btn pri" data-eqedit="${esc(id)}">ใส่ลิงก์ Datasheet</button></div>`
        :web?`<iframe src="${esc(eqEmbed(u))}" title="${esc(p.model)} ${cur}" loading="lazy" referrerpolicy="no-referrer"></iframe><p class="pdhint">ถ้าเอกสารไม่ขึ้น กด "เปิดแท็บใหม่" ด้านบน</p>`
        :`<div class="pde">${svg('file','currentColor',1.6)}<b>ไฟล์นี้อยู่ในเครื่องเซิร์ฟเวอร์ของบริษัท</b><code>${esc(u)}</code><span>คัดลอกที่อยู่ไปเปิดใน File Explorer</span></div>`}</div>
    </section></div></div>`;
}
const EQF={
 'INVERTER':[['model','รุ่น','text',{req:1}],['brand','ยี่ห้อ','text'],['kw','กำลัง (kW)','number'],['phase','ประเภทไฟฟ้า','sel',['1','3']],['type','ประเภทระบบ','sel',['On Grid','Hybrid']],['img','ลิงก์รูปสินค้า','url',{full:1,ph:'https://... (ไม่ใส่ก็ได้)'}],
   ['note','รายละเอียด','area',{full:1}],['datasheet','ลิงก์ Datasheet','url',{full:1,ph:'https://...'}],['manual','ลิงก์คู่มือ','url',{full:1,ph:'https://... หรือ \\\\192.168.200.249\\...'}],['other','ลิงก์เอกสารอื่น','url',{full:1}],['h','ตัวเลือกในฟอร์มงาน (ไม่แสดงในแคตตาล็อก)'],['meters','Smart meter ที่ใช้คู่ (คั่นด้วย ,)','text',{full:1,ph:'DDSU666, SDM120CT'}],['cts','CT ที่ใช้คู่ (คั่นด้วย ,)','text',{full:1,ph:'100/40mA, 100/5A'}]],
 'BATTERY':[['model','รุ่น','text',{req:1}],['brand','ยี่ห้อ','text'],['kwh','ความจุ (kWh)','number'],['volt','แรงดัน','sel',['LV','HV']],['img','ลิงก์รูปสินค้า','url',{full:1,ph:'https://... (ไม่ใส่ก็ได้)'}],['note','รายละเอียด','area',{full:1}],['datasheet','ลิงก์ Datasheet','url',{full:1,ph:'https://...'}],['manual','ลิงก์คู่มือ','url',{full:1,ph:'https://... หรือ \\\\192.168.200.249\\...'}],['other','ลิงก์เอกสารอื่น','url',{full:1}]],
 'SOLAR PANEL':[['model','รุ่น','text',{req:1}],['brand','ยี่ห้อ','text'],['watt','กำลัง (W)','number'],['cell','ชนิดเซลล์','text'],['img','ลิงก์รูปสินค้า','url',{full:1,ph:'https://... (ไม่ใส่ก็ได้)'}],['note','รายละเอียด','area',{full:1}],['datasheet','ลิงก์ Datasheet','url',{full:1,ph:'https://...'}],['manual','ลิงก์คู่มือ','url',{full:1,ph:'https://... หรือ \\\\192.168.200.249\\...'}],['other','ลิงก์เอกสารอื่น','url',{full:1}]]};
function openEq(cat,id){
  const p=id?S.products[id]:null;cat=p?p.category:cat;const v=p?{...p}:{};
  const extra=cat==='BATTERY'?`<div class="fld full eqchk"><span>ใช้คู่กับอินเวอร์เตอร์ (ตัวเลือกในฟอร์มงาน ไม่แสดงในแคตตาล็อก)</span><div>${Object.values(S.products).filter(x=>x.category==='INVERTER').map(x=>`<label><input type="checkbox" data-inv="${esc(x.model)}" ${(v.inverters||[]).includes(x.model)?'checked':''}>${esc(x.model)}</label>`).join('')||'<span class="nil">ยังไม่มีอินเวอร์เตอร์</span>'}</div></div>`:'';
  formModal('eqF',(p?'แก้ไข':'เพิ่ม')+(EQT.find(x=>x[0]===cat)||[,''])[1],EQF[cat],v,'บันทึก',extra+(p?`<button type="button" class="btn sm ghost kbdel svdel" data-eqdel="${esc(id)}">${svg('trash','currentColor',2)}ลบรุ่นนี้</button>`:''));
  const f=$('#eqF');f.dataset.cat=cat;f.dataset.id=id||'';
}
async function saveEq(){
  const f=$('#eqF');const v=readF('eqF');const cat=f.dataset.cat;
  if(!v.model){$('#eqFE').textContent='ใส่รุ่นก่อน';$('#eqF-model').focus();return}
  if(cat==='BATTERY')v.inverters=[...f.querySelectorAll('[data-inv]:checked')].map(x=>x.dataset.inv);
  const id=f.dataset.id||pid(cat,v.model);
  try{await w('products/'+id,{...v,category:cat,updatedAt:Date.now()},f.dataset.id?'update':'set');closeModal();toast('บันทึกแล้ว')}catch(e){}
}
/* ===== นำเข้าแคตตาล็อกจาก Excel (รูปแบบไฟล์ Catalog.xlsx: สินค้า ยี่ห้อ รุ่น เฟส กำลังผลิต Smart Meter[ยี่ห้อ,รุ่น] CT หมายเหตุ) ===== */
function catParse(rows,base=0){
  const hi=rows.findIndex(r=>(r||[]).some(c=>String(c??'').trim()==='สินค้า'));if(hi<0)throw new Error('ไม่พบหัวตาราง "สินค้า" ในไฟล์');
  const H=rows[hi].map(c=>String(c??'').trim());const col=t=>H.findIndex(x=>x===t);
  const C={cat:col('สินค้า'),brand:col('ยี่ห้อ'),model:col('รุ่น'),phase:col('เฟส'),pow:col('กำลังผลิต'),sm:H.findIndex(x=>/smart\s*meter/i.test(x)),ct:col('CT'),note:col('หมายเหตุ')};
  if(C.model<0)throw new Error('ไม่พบคอลัมน์ "รุ่น"');
  const v=(r,k)=>C[k]<0?'':String(r[C[k]]??'').trim();const out=[],bad=[];
  rows.slice(hi+1).forEach((r,i)=>{r=r||[];const t=v(r,'cat'),model=v(r,'model');if(!t||!model)return;
    const cat=/แผง|panel/i.test(t)?'SOLAR PANEL':/อินเวอร์เตอร์|inverter/i.test(t)?'INVERTER':/แบต|battery/i.test(t)?'BATTERY':'';
    if(!cat){bad.push(`แถว ${base+hi+i+2}: ไม่รู้จักประเภท "${t}"`);return}
    const d={category:cat,model,brand:v(r,'brand')};const pw=catNum(v(r,'pow'));
    if(cat==='INVERTER'){Object.assign(d,{kw:pw,phase:String(catNum(v(r,'phase'))||''),type:/hybrid/i.test(v(r,'note'))?'Hybrid':/on.?grid/i.test(v(r,'note'))?'On Grid':''});
      const smB=C.sm<0?'':String(r[C.sm]??'').trim(),smM=C.sm<0?'':String(r[C.sm+1]??'').trim();if(smM)d.meters=smM;if(v(r,'ct'))d.cts=v(r,'ct');if(smM)d.note=`Smart meter ${[smB,smM].filter(Boolean).join(' ')}${d.cts?' · CT '+d.cts:''}`}
    else if(cat==='BATTERY')d.kwh=pw;else d.watt=pw;
    Object.keys(d).forEach(k=>{if(d[k]===''||d[k]==null)delete d[k]});out.push({row:base+hi+i+2,d})});
  return {out,bad};
}
async function catImport(file){
  try{await loadXLSX()}catch(e){return toast('โหลดตัวอ่าน Excel ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่')}
  let res;try{const wb=XLSX.read(await file.arrayBuffer(),{cellDates:true});const ws=wb.Sheets[wb.SheetNames[0]];res=catParse(XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:null}),ws['!ref']?XLSX.utils.decode_range(ws['!ref']).s.r:0)}catch(e){return showErr(e,'อ่านไฟล์ไม่ได้')}
  const key=(c,m)=>c+'|'+String(m).trim().toLowerCase();const have={};Object.values(S.products).forEach(p=>{have[key(p.category,p.model)]=p});
  const seen={};const L=res.out.map(x=>{const k=key(x.d.category,x.d.model);const dup=seen[k];seen[k]=seen[k]||x.row;const ex=have[k];return {...x,k,dup,ex,st:dup?'dup':ex?'upd':'new'}});
  const CAT={'INVERTER':'อินเวอร์เตอร์','BATTERY':'แบตเตอรี่','SOLAR PANEL':'แผงโซลาร์'};
  const spec=d=>d.category==='INVERTER'?[d.kw?d.kw+' kW':'',d.phase?d.phase+' เฟส':'',d.type,d.meters?'SM '+d.meters:'',d.cts?'CT '+d.cts:''].filter(Boolean).join(' · '):d.category==='BATTERY'?(d.kwh?d.kwh+' kWh':''):(d.watt?d.watt+' W':'');
  const ST={new:['ok','เพิ่มใหม่'],upd:['b','อัปเดต'],dup:['rd','ซ้ำในไฟล์ · ข้าม']};const go=L.filter(x=>x.st!=='dup');
  const m=$('#modal');m.innerHTML=`<div class="modalbg"><div class="modal" id="ciM" role="dialog" aria-modal="true" aria-labelledby="ciT">
    <h2 id="ciT" style="margin:0;font-size:20px">นำเข้าแคตตาล็อก: ${esc(file.name||'')}</h2>
    <p class="sub" style="margin:0">เพิ่มใหม่ ${L.filter(x=>x.st==='new').length} · อัปเดต ${L.filter(x=>x.st==='upd').length}${L.some(x=>x.dup)?` · <b style="color:#b42318">ซ้ำในไฟล์ ${L.filter(x=>x.dup).length} แถว (ไม่บันทึก แก้ชื่อรุ่นในไฟล์แล้วนำเข้าใหม่)</b>`:''} · รุ่นที่มีอยู่แล้วจะเก็บลิงก์ Datasheet และรูปเดิมไว้</p>
    ${res.bad.length?`<p class="sub" style="margin:0;color:#b42318">${res.bad.map(esc).join('<br>')}</p>`:''}
    <div style="overflow:auto;flex:1"><table class="tbl"><thead><tr><th>แถว</th><th>ประเภท</th><th>ยี่ห้อ</th><th>รุ่น</th><th>สเปก</th><th>ผล</th></tr></thead><tbody>
    ${L.map(x=>`<tr><td class="m">${x.row}</td><td style="white-space:nowrap">${CAT[x.d.category]}</td><td>${esc(x.d.brand||'')}</td><td style="white-space:nowrap"><b>${esc(x.d.model)}</b>${x.dup?`<div class="sub">ซ้ำกับแถว ${x.dup}</div>`:''}</td><td class="m">${esc(spec(x.d))}</td><td style="white-space:nowrap"><span class="pill ${ST[x.st][0]}">${ST[x.st][1]}</span></td></tr>`).join('')}</tbody></table></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" id="ciN">ยกเลิก</button><button class="btn pri" type="button" id="ciY" ${go.length?'':'disabled'}>บันทึก ${go.length} รุ่น</button></div></div></div>`;
  {const M=$('#ciM');[['width','min(920px,94vw)'],['max-width','94vw'],['max-height','88vh'],['display','flex'],['flex-direction','column'],['gap','12px']].forEach(([k,v])=>M.style.setProperty(k,v,'important'))}
  $('#ciN').onclick=()=>{m.innerHTML=''};
  $('#ciY').onclick=async()=>{const b=$('#ciY');b.disabled=true;let n=0;
    try{for(const x of go){b.textContent=`กำลังบันทึก ${++n}/${go.length}…`;const d={...x.d,updatedAt:Date.now()};
        if(x.ex){if(x.ex.note)delete d.note;await w('products/'+x.ex.id,d,'update')}else await w('products/'+pid(d.category,d.model),d,'set')}
      m.innerHTML='';toast(`นำเข้าแคตตาล็อกแล้ว ${go.length} รุ่น`)}catch(e){b.disabled=false;b.textContent='ลองบันทึกอีกครั้ง'}};
}
document.addEventListener('change',e=>{if(e.target&&e.target.id==='acc-eng'){const o=document.querySelector('label[for="acc-out"]');if(o){o.hidden=e.target.value!=='__out';if(!o.hidden)document.getElementById('acc-out').focus()}}});
document.addEventListener('change',e=>{if(e.target.id==='eqxfile'){const f=e.target.files[0];e.target.value='';if(f)catImport(f)}});

/* ===== แบบฟอร์มเอกสาร: เก็บแบบฟอร์มล่าสุดที่ทีมใช้ ===== */
const FMC=['งานสำรวจ','งานติดตั้ง','เอกสารขนานไฟฟ้า','ตรวจเช็ก / แจ้งซ่อม','อื่น ๆ'];
const FMF=[['code','รหัสแบบฟอร์ม','text',{ph:'เช่น FM-EN-028-A'}],['rev','ฉบับที่ / Rev.','text',{ph:'เช่น Rev.03'}],['name','ชื่อเอกสาร','text',{req:1,full:1}],['cat','หมวด','sel',FMC],['used','ใช้ตอนไหน','text',{ph:'เช่น ตอนเซลส์แจ้งงานสำรวจ'}],
  ['file','ลิงก์ไฟล์ หรือที่อยู่ไฟล์','text',{full:1,ph:'https://...  หรือ  \\\\192.168.200.249\\...'}],['note','หมายเหตุ','area',{full:1}]];
const isWeb=u=>/^https?:\/\//i.test(u||'');
function viewForms(){
  if(!S.loaded.forms)return '<div class="card empty">กำลังโหลดแบบฟอร์ม…</div>';
  const f=S.f;const all=Object.values(S.forms||{});const c=f.fmc||'';const q=(f.fmq||'').trim().toLowerCase();
  const list=all.filter(x=>(!c||x.cat===c)&&(!q||[x.code,x.name,x.cat,x.used,x.note].join(' ').toLowerCase().includes(q)))
    .sort((a,b)=>FMC.indexOf(a.cat)-FMC.indexOf(b.cat)||String(a.code||a.name).localeCompare(String(b.code||b.name),'th',{numeric:true}));
  const n=k=>all.filter(x=>!k||x.cat===k).length;
  const ib=(ic,lab,attr)=>`<button type="button" class="ib" ${attr} aria-label="${lab}" title="${lab}">${svg(ic,'currentColor',2)}</button>`;
  return pageHead('แบบฟอร์มเอกสาร','แบบฟอร์มฉบับล่าสุด',`<button class="btn pri" data-fmnew="1">${svg('plus','#fff',2.4)}เพิ่มแบบฟอร์ม</button>`)+`
  <section class="card tq">
    <div class="tqb">
      <label class="jsrch">${svg('search','currentColor',2)}<input id="fmq" type="search" placeholder="รหัส ชื่อเอกสาร หรือใช้ตอนไหน" value="${esc(f.fmq||'')}" aria-label="ค้นหาแบบฟอร์ม" autocomplete="off"></label>
      <div class="seg" role="group" aria-label="หมวด">${[['','ทั้งหมด'],...FMC.map(x=>[x,x])].map(([k,t])=>`<button class="${c===k?'on':''}" data-fmc="${esc(k)}" aria-pressed="${c===k}">${esc(t)}<span class="n">${n(k)}</span></button>`).join('')}</div>
    </div>
    ${list.length?`<div class="jtw"><table class="jt jt2 jt2f"><thead><tr><th class="c-cd">รหัส</th><th class="c-site">ชื่อเอกสาร</th><th class="c-ct">หมวด</th><th class="c-us">ใช้ตอนไหน</th><th class="c-dt">อัปเดต</th><th class="c-act">จัดการ</th></tr></thead><tbody>
      ${list.map(x=>{const T=(v,cls)=>v?`<td class="${cls}" title="${esc(v)}">${esc(v)}</td>`:`<td class="${cls}"><span class="nil">—</span></td>`;
        return `<tr data-fmrow="${esc(x.id)}" tabindex="0" aria-label="${esc(x.name)}"><td class="c-cd m"><b class="fmcd">${esc(x.code||'—')}</b>${x.rev?`<small>${esc(x.rev)}</small>`:''}</td>
        <td class="c-site"><b title="${esc(x.name)}">${esc(x.name)}</b></td>${T(x.cat,'c-ct m')}${T(x.used,'c-us m')}${T(x.updatedAt?kbDate(x.updatedAt):'','c-dt m')}
        <td class="c-act"><div class="ibs">${mnu([isWeb(x.file)?`<a class="mi" role="menuitem" href="${esc(x.file)}" target="_blank" rel="noopener">${svg('eye','currentColor',2)}เปิดไฟล์</a>`:'',x.file?mi(`data-cpy="${esc(x.file)}"`,'copy',isWeb(x.file)?'คัดลอกลิงก์':'คัดลอกที่อยู่ไฟล์'):'',mi(`data-fmedit="${esc(x.id)}"`,'pen','แก้ไข'),canTrash('forms')?'<hr class="fmhr">':'',canTrash('forms')?mi(`data-fmdel="${esc(x.id)}"`,'trash','ย้ายไปถังขยะ',1):''],'','ib')}</div></td></tr>`}).join('')}
    </tbody></table></div>`:`<div class="empty">${all.length?emp('search','ไม่มีแบบฟอร์มที่ตรงกับคำค้น','ลองคำค้นอื่น หรือเลือกหมวด "ทั้งหมด"'):emp('file','ยังไม่มีแบบฟอร์ม','')}</div>`}
  </section>`;
}
function openForm(id){const x=id?S.forms[id]:null;formModal('fmF',x?'แก้ไขแบบฟอร์ม':'เพิ่มแบบฟอร์ม',FMF,x?{...x}:{cat:S.f.fmc||''},'บันทึก',x?`<button type="button" class="btn sm ghost kbdel svdel" data-fmdel="${esc(id)}">${svg('trash','currentColor',2)}ลบแบบฟอร์มนี้</button>`:'');$('#fmF').dataset.id=id||''}
async function saveForm(){const f=$('#fmF');const v=readF('fmF');if(!v.name){$('#fmFE').textContent='ใส่ชื่อเอกสารก่อน';$('#fmF-name').focus();return}
  const id=f.dataset.id||('fm'+Date.now().toString(36));try{await w('forms/'+id,{...v,updatedAt:Date.now()},f.dataset.id?'update':'set');closeModal();toast('บันทึกแล้ว')}catch(e){}}
/* ===== สมาร์ทมิเตอร์ (เครื่องวัดพฤติกรรมไฟ) : มี 3 เครื่อง ===== */
const METERS=['A','B','C'];
const mtEnd=b=>b.status==='returned'&&b.returnedAt?b.returnedAt:(b.status==='out'&&b.to<today()?today():b.to);
function mtActive(){return Object.values(S.meters||{}).filter(b=>b.status!=='cancel')}
function meterFree(dev,from,to,except){return !mtActive().some(b=>b.id!==except&&b.device===dev&&b.from<=to&&mtEnd(b)>=from)}
function freeMeters(from,to,except){return from&&to?METERS.filter(d=>meterFree(d,from,to,except)):[]}
function mtBox(f){return f.meter?`<div class="fgrid"><label class="fld" for="n-mdays">ติดตั้งไว้กี่วัน<input id="n-mdays" type="number" min="1" max="60" value="${esc(f.mdays||7)}"></label><div class="fld mpkf"><span>เครื่องที่ว่าง</span>${meterPick(f.date,f.mdays||7)}</div></div>`:''}
function meterPick(from,days){if(!from)return '<span class="sub">เลือกวันสำรวจก่อน</span>';const to=isoAdd(from,(days||7)-1);const L=freeMeters(from,to);
  return `<div class="mpk">${METERS.map(d=>`<span class="mpd ${L.includes(d)?'ok':'no'}">เครื่อง ${d}</span>`).join('')}</div><span class="sub">${fd(from)} – ${fd(to)} · ${L.length?'ระบบจะจองเครื่อง '+L[0]+' ให้':'ไม่มีเครื่องว่าง จะบันทึกเป็นคำขอรอจัดเครื่อง'}</span>`}
const MTF=()=>[['title','ลูกค้า / ไซต์','text',{req:1,full:1,ph:'เช่น บ้านคุณสมชาย บางนา'}],['phone','เบอร์ติดต่อ','tel'],['team','ทีมขาย','sel',TEAMS],
  ['from','วันติดตั้งเครื่อง','date',{req:1}],['to','วันเก็บเครื่อง','date',{req:1}],['device','เครื่อง','sel',METERS.map(d=>'เครื่อง '+d)],['borrower','ผู้ยืม *','text',{ph:'ชื่อคนที่มารับเครื่องไป'}],['note','หมายเหตุ','area',{full:1}]];
function openMeter(id){const b=id?S.meters[id]:null;
  formModal('mtF',b?'แก้ไขการจองสมาร์ทมิเตอร์':'จองสมาร์ทมิเตอร์',MTF(),b?{...b,device:b.device?'เครื่อง '+b.device:''}:{from:today(),to:isoAdd(today(),6)},'บันทึก',
    `<p class="sub" style="margin:8px 0 0">ไม่เลือกเครื่อง ระบบจะเลือกเครื่องที่ว่างให้ ${b?`<button type="button" class="btn sm ghost kbdel svdel" data-mtcancel="${esc(id)}">${svg('trash','currentColor',2)}ยกเลิกการจองนี้</button>`:''}</p>`);$('#mtF').dataset.id=id||''}
async function saveMeter(){const f=$('#mtF');const v=readF('mtF');const id=f.dataset.id;const E=$('#mtFE');
  if(!v.title)return E.textContent='ใส่ชื่อลูกค้าหรือไซต์';if(!(v.borrower||'').trim()&&!(id&&S.meters[id]&&S.meters[id].source==='job'))return E.textContent='ใส่ชื่อผู้ยืม';if(!v.from||!v.to)return E.textContent='เลือกวันติดตั้งและวันเก็บเครื่อง';if(v.to<v.from)return E.textContent='วันเก็บเครื่องต้องไม่ก่อนวันติดตั้ง';
  let dev=(v.device||'').replace('เครื่อง ','');const free=freeMeters(v.from,v.to,id);
  if(dev&&!free.includes(dev))return E.textContent=`เครื่อง ${dev} ไม่ว่างช่วงนี้${free.length?' · ว่าง: '+free.map(x=>'เครื่อง '+x).join(', '):''}`;
  if(!dev){if(!free.length)return E.textContent='ช่วงวันนี้ไม่มีเครื่องว่างเลย ลองเลื่อนวัน';dev=free[0]}
  const old=id?S.meters[id]:null;
  try{await w('meters/'+(id||S.db.collection('meters').doc().id),{...(old||{source:'direct',status:'booked',createdAt:Date.now()}),...v,device:dev,updatedAt:Date.now()},'set');closeModal();toast(`จองเครื่อง ${dev} แล้ว`)}catch(e){}}
function viewMeter(){
  if(!S.loaded.meters)return '<div class="card empty">กำลังโหลด…</div>';
  const t=today();const all=mtActive();const nm=b=>b.jobId&&S.jobs[b.jobId]?(S.jobs[b.jobId].title||b.title):b.title;
  const now=d=>all.find(b=>b.device===d&&b.status!=='returned'&&b.from<=t&&b.to>=t)||all.find(b=>b.device===d&&b.status==='out');
  const next=d=>all.filter(b=>b.device===d&&b.status==='booked'&&b.from>t).sort((a,b)=>a.from.localeCompare(b.from))[0];
  const card=d=>{const c=now(d),n=next(d);const over=c&&c.to<t&&c.status!=='returned';
    return `<div class="mtc ${c?'busy':'free'}"><div class="mth"><span class="mti">${svg('bolt','currentColor',2)}</span><b>เครื่อง ${d}</b><span class="mts">${c?(over?'เลยวันเก็บ':'กำลังใช้งาน'):'ว่าง'}</span></div>
      ${c?`<p class="mtw">${esc(nm(c))}</p><p class="sub">${c.borrower?'ผู้ยืม '+esc(c.borrower)+' · ':''}${fd(c.from)} – ${fd(c.to)}${over?` · <em class="crit">เลยมา ${-dLeft(c.to)} วัน</em>`:` · เก็บอีก ${dLeft(c.to)} วัน`}</p>`:'<p class="mtw">พร้อมใช้</p><p class="sub">ไม่มีเครื่องติดตั้งอยู่</p>'}
      <div class="mtn">${n?`ถัดไป ${fd(n.from)} · ${esc(nm(n))}`:'ยังไม่มีจองถัดไป'}</div></div>`};
  const ws=new Date(t+'T00:00:00');ws.setDate(ws.getDate()-((ws.getDay()+6)%7));const D=42;const k0=isoAdd(t,-((new Date(t+'T00:00:00').getDay()+6)%7));const k1=isoAdd(k0,D-1);
  const pos=k=>Math.max(0,Math.min(D,dLeft(k)-dLeft(k0)));
  const days=[...Array(D)].map((_,i)=>isoAdd(k0,i));
  const tl=`<div class="mtl"><div class="mtlh"><span></span><div class="mtlg">${days.map(k=>{const d=new Date(k+'T00:00:00');return `<span class="${k===t?'t':''} ${d.getDay()===0?'sun':''} ${d.getDate()===1||k===k0?'m':''}">${d.getDate()===1||k===k0?`<small>${TM[d.getMonth()]}</small>`:''}${d.getDate()}</span>`}).join('')}</div></div>
    ${METERS.map(d=>`<div class="mtlr"><b>เครื่อง ${d}</b><div class="mtlg bar">${days.map(k=>`<i class="${k===t?'t':''}"></i>`).join('')}
      ${all.filter(b=>b.device===d&&b.from<=k1&&mtEnd(b)>=k0).map(b=>{const a=pos(b.from),e=pos(mtEnd(b))+1;return `<button class="mtb ${b.status}" style="left:calc(${a}/${D}*100%);width:calc(${e-a}/${D}*100% - 4px)" data-mtedit="${esc(b.id)}" title="${esc(nm(b))} · ${fd(b.from)} – ${fd(b.to)}">${esc(nm(b))}</button>`}).join('')}</div></div>`).join('')}</div>`;
  const wait=all.filter(b=>!b.device);
  const list=all.filter(b=>b.status!=='returned'||mtEnd(b)>=isoAdd(t,-14)).sort((a,b)=>a.from.localeCompare(b.from));
  const st=b=>!b.device?['o','รอจัดเครื่อง']:b.status==='returned'?['gy','คืนแล้ว']:b.status==='out'?(b.to<t?['rd','เลยวันเก็บ']:['b','ติดตั้งอยู่']):b.from<=t?['o','ถึงวันติดตั้ง']:['ok','จองแล้ว'];
  const ib=(ic,lab,attr,off)=>`<button type="button" class="ib" ${off?'disabled':attr} aria-label="${lab}" title="${off||lab}">${svg(ic,'currentColor',2)}</button>`;
  return pageHead('สมาร์ทมิเตอร์','เครื่องวัดพฤติกรรมไฟ 3 เครื่อง',`<button class="btn" data-mtnow="1">บันทึกเครื่องที่ใช้อยู่</button><button class="btn pri" data-mtnew="1">${svg('plus','#fff',2.4)}จองเครื่อง</button>`)+`
  <div class="mtcs">${METERS.map(card).join('')}</div>
  ${wait.length?`<section class="card sal"><div class="phd"><div class="ptl">${svg('bell','currentColor',2)}คำขอรอจัดเครื่อง<span class="tdn">${wait.length}</span></div><span class="sub">ช่วงที่ขอไม่มีเครื่องว่าง กดแก้ไขเพื่อเลื่อนวันหรือเลือกเครื่อง</span></div></section>`:''}
  <section class="card"><div class="phd"><div class="ptl">${svg('cal','currentColor',2)}ตารางการใช้เครื่อง 6 สัปดาห์</div><div class="mlg"><span><i class="booked"></i>จองแล้ว</span><span><i class="out"></i>ติดตั้งอยู่</span><span><i class="returned"></i>คืนแล้ว</span></div></div>${tl}</section>
  <section class="card tq" style="margin-top:16px"><div class="phd"><div class="ptl">${svg('list','currentColor',2)}รายการจอง</div><span class="sub">${list.length} รายการ</span></div>
    ${list.length?`<div class="jtw"><table class="jt jt2 jt2m"><thead><tr><th class="c-dv">เครื่อง</th><th class="c-site">ลูกค้า / ไซต์</th><th class="c-dt2">ช่วงวัน</th><th class="c-src">ที่มา</th><th class="c-st">สถานะ</th><th class="c-act">จัดการ</th></tr></thead><tbody>
    ${list.map(b=>{const s2=st(b);return `<tr data-mtedit="${esc(b.id)}" tabindex="0" aria-label="แก้ไขการจอง ${esc(nm(b))}"><td class="c-dv"><b class="mdv">${b.device||'—'}</b></td><td class="c-site"><b title="${esc(nm(b))}">${esc(nm(b))}</b>${b.borrower?`<small class="mtbw">ผู้ยืม ${esc(b.borrower)}</small>`:''}</td>
      <td class="m">${fd(b.from)} – ${fd(b.to)}</td><td class="m">${b.source==='job'?'ใบแจ้งงานสำรวจ':'ขอเฉพาะเครื่อง'}${b.team?' · '+esc(b.team):''}</td><td class="c-st"><span class="pill ${s2[0]}">${s2[1]}</span></td>
      <td class="c-act"><div class="ibs">${mnu([mi(`data-mtedit="${esc(b.id)}"`,'pen','แก้ไข'),b.status==='booked'&&b.device?mi(`data-mtout="${esc(b.id)}"`,'bolt','ติดตั้งเครื่องแล้ว'):'',b.status==='out'?mi(`data-mtret="${esc(b.id)}"`,'check','รับเครื่องคืน'):'',b.jobId?mi(`data-osel="${esc(b.jobId)}"`,'eye','ดูงาน'):''],'','ib')}</div></td></tr>`}).join('')}
    </tbody></table></div>`:`<div class="empty">${emp('bolt','ยังไม่มีการจอง','กด "จองเครื่อง" เพื่อเริ่ม')}</div>`}</section>`;
}
function viewKb(){
  if(S.f.kqt==='eq')return viewEquip();
  if((S.f.kqt||'form')==='form')return viewForms();
  if(!S.loaded.articles)return '<div class="card empty">กำลังโหลดคลังความรู้…</div>';
  const f=S.f;const all=Object.values(S.articles||{});
  const pub=all.filter(a=>a.status==='published').length,dr=all.length-pub;
  const kc=f.kqc||'';const ks=f.kbs||'all';const q=(f.kbq||'').trim().toLowerCase();
  let list=all.filter(a=>(!kc||a.col===kc)&&(ks==='all'||a.status===ks)&&(!q||[a.title,a.body,kbCol(a.col).t].join(' ').toLowerCase().includes(q)));
  list.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const n=k=>all.filter(a=>!k||a.col===k).length;
  const ci=(k,t,ic)=>`<button class="kqc ${kc===k?'on':''}" data-kbc="${k}" aria-pressed="${kc===k}">${svg(ic,'currentColor',2)}<span>${esc(t)}</span><i>${n(k)}</i></button>`;
  const segs=[['all','ทั้งหมด'],['published','เผยแพร่แล้ว'],['draft','ฉบับร่าง']];
  return pageHead('บทความ','คู่มือการทำงานของแผนก',`<a class="btn pri" href="#kb-new">${svg('plus','#fff',2.4)}เขียนบทความ</a>`)+`
  <section class="kqh">
    <span class="kbhi">${svg('book','#fff',2)}</span>
    <div class="kbht"><b>ความรู้ของทีม อยู่บนชั้นเดียวกัน</b><span>ขั้นตอน เอกสาร และวิธีแก้ปัญหาที่ทีมเจอบ่อย</span></div>
    <dl class="kbst"><div><dt>เผยแพร่แล้ว</dt><dd>${pub}</dd></div><div><dt>ฉบับร่าง</dt><dd>${dr}</dd></div><div><dt>หมวด</dt><dd>${KBC.length}</dd></div></dl>
  </section>
  <div class="kbg">
    <nav class="card kbcl" aria-label="หมวดหมู่"><h2>หมวดหมู่</h2>${ci('','บทความทั้งหมด','layers')}${KBC.map(c=>ci(c.k,c.t,c.ic)).join('')}</nav>
    <section class="card kbl">
      <div class="kbb">
        <label class="jsrch kbsrch">${svg('search','currentColor',2)}<input id="kbq" type="search" placeholder="ค้นหาบทความ" value="${esc(f.kbq||'')}" aria-label="ค้นหาบทความ" autocomplete="off"></label>
        <div class="seg" role="group" aria-label="สถานะ">${segs.map(([k,t])=>`<button class="${ks===k?'on':''}" data-kbs="${k}" aria-pressed="${ks===k}">${t}</button>`).join('')}</div>
      </div>
      ${list.map(a=>{const c=kbCol(a.col);return `<div class="kbr">
        <a class="kbra" href="#kb-${esc(a.id)}"><span class="kbri">${svg('doc','currentColor',1.9)}</span>
          <span class="kbrt"><b>${esc(a.title||'ไม่มีชื่อเรื่อง')}</b><span>${esc(c.t)}<i></i>แก้ไขล่าสุด ${kbDate(a.updatedAt)}</span></span></a>
        ${kbPill(a)}
        <a class="kqe" href="#kb-edit-${esc(a.id)}" aria-label="แก้ไข ${esc(a.title||'')}" title="แก้ไข">${svg('pen','currentColor',2)}</a></div>`}).join('')
      ||`<div class="empty">${all.length?emp('search','ไม่มีบทความที่ตรงกับตัวกรอง',''):emp('book','ยังไม่มีบทความ','เริ่มเขียนบทความแรกได้เลย')}</div>`}
    </section>
  </div>`;
}
function viewKbRead(id){
  const a=S.articles?.[id];
  if(!a)return S.loaded.articles?'<div class="card empty">ไม่พบบทความนี้ <a href="#kb">กลับคลังความรู้</a></div>':'<div class="card empty">กำลังโหลด…</div>';
  const c=kbCol(a.col);
  return `<div class="kbrd">
    <a class="kbback" href="#kb">${svg('chev','currentColor',2.2)}คลังความรู้</a>
    <article class="card kbart">
      <header><div class="kbmeta">${svg(c.ic,'currentColor',2)}<span>${esc(c.t)}</span>${kbPill(a)}</div>
        <h1>${esc(a.title||'ไม่มีชื่อเรื่อง')}</h1>
        <p>แก้ไขล่าสุด ${kbDate(a.updatedAt)}${a.by?' · โดย '+esc(nm(a.by)):''}</p>
        <a class="btn sm kbedit" href="#kb-edit-${esc(a.id)}">${svg('pen','currentColor',2)}แก้ไข</a></header>
      <div class="kbbody">${kbMd(a.body)||'<p class="muted">ยังไม่มีเนื้อหา</p>'}</div>
    </article></div>`;
}
function viewKbEdit(id){
  const isNew=!id;const a=isNew?{col:S.f.kqc||'system',status:'draft'}:S.articles?.[id];
  if(!a)return S.loaded.articles?'<div class="card empty">ไม่พบบทความนี้ <a href="#kb">กลับคลังความรู้</a></div>':'<div class="card empty">กำลังโหลด…</div>';
  return `<div class="kbrd">
    <a class="kbback" href="${isNew?'#kb':'#kb-'+esc(id)}">${svg('chev','currentColor',2.2)}${isNew?'คลังความรู้':'กลับไปบทความ'}</a>
    <form class="card kbform" id="kbForm" data-id="${esc(id||'')}">
      <h1>${isNew?'เขียนบทความใหม่':'แก้ไขบทความ'}</h1>
      <label class="fld" for="kbT">ชื่อเรื่อง<input id="kbT" value="${esc(a.title||'')}" required maxlength="140" placeholder="เช่น วิธีเตรียมเอกสารยื่น PEA"></label>
      <div class="fld"><span id="kbCl">หมวด</span><div class="kbpick" role="radiogroup" aria-labelledby="kbCl">${KBC.map(c=>`<label class="${a.col===c.k?'on':''}"><input type="radio" name="kbcol" value="${c.k}" ${a.col===c.k?'checked':''}>${svg(c.ic,'currentColor',2)}${esc(c.t)}</label>`).join('')}</div></div>
      <label class="fld" for="kbB">เนื้อหา<textarea id="kbB" rows="18" placeholder="พิมพ์เนื้อหาได้เลย">${esc(a.body||'')}</textarea></label>
      <p class="kbhint">จัดรูปแบบได้ด้วย <code>## หัวข้อ</code> · <code>- รายการ</code> · <code>1. ขั้นตอน</code> · <code>**ตัวหนา**</code> · <code>&gt; หมายเหตุ</code></p>
      <div class="kbfa">
        ${isNew?'':`<button type="button" class="btn ghost kbdel" data-kbdel="${esc(id)}">${svg('trash','currentColor',2)}ลบบทความ</button>`}
        <span style="flex:1"></span>
        <button type="submit" class="btn" data-mode="draft">บันทึกเป็นฉบับร่าง</button>
        <button type="submit" class="btn pri" data-mode="published">เผยแพร่</button>
      </div>
    </form></div>`;
}
async function kbSave(form,mode){
  const title=$('#kbT').value.trim();if(!title){toast('ใส่ชื่อเรื่องก่อน');$('#kbT').focus();return}
  const col=form.querySelector('input[name=kbcol]:checked')?.value||'';
  const d={title,col,body:$('#kbB').value,status:mode,updatedAt:Date.now(),by:S.me.id||null};
  let id=form.dataset.id;
  try{
    if(id)await w('articles/'+id,d);
    else{id='a'+Date.now().toString(36);await w('articles/'+id,{...d,createdAt:Date.now()},'set')}
    S.kbDirty=false;toast(mode==='published'?'เผยแพร่แล้ว':'บันทึกฉบับร่างแล้ว');location.hash='kb-'+id;
  }catch(e){}
}

/* ---------- field rendering ---------- */
function getT(tgt,j,c,s){if(tgt==='customer')return c;if(tgt==='site')return s;if(tgt==='job')return j;return j[tgt.split('.')[1]]||{}}
function fieldHtml(sec,fl,obj,pre){
  const h=fieldHtml0(sec,fl,obj,pre);if(!fieldLocked(sec,fl[0])||fl[2]==='h')return h;
  return h.replace(/<(input|select|textarea)(?![^>]*type="hidden")/g,'<$1 disabled title="'+(isDispatch()?roleWho('admin'):roleWho('dispatch'))+' เป็นคนแก้ช่องนี้"')}
function fieldHtml0(sec,[k,l,t,o],obj,pre){
  const id=`${pre}-${sec.id}-${k}`;const v=obj[k];const full=(o&&o.full)||t==='area';
  if(t==='h')return `<div class="formh">${esc(l)}</div>`;
  if(t==='chk')return `<label class="fld chk" for="${id}"><input type="checkbox" id="${id}" data-k="${k}" ${v?'checked':''}>${esc(l)}</label>`;
  let inp;
  if(t==='sel')inp=`<select id="${id}" data-k="${k}"><option value="">—</option>${o.map(x=>`<option ${String(v)===String(x)?'selected':''}>${esc(x)}</option>`).join('')}${v&&!o.map(String).includes(String(v))?`<option selected>${esc(v)}</option>`:''}</select>`;
  else if(t==='area')inp=`<textarea id="${id}" data-k="${k}">${esc(v)}</textarea>`;
  else if(t==='model')inp=`<input type="text" id="${id}" data-k="${k}" list="dl-${esc(o)}" value="${esc(v)}">`;
  else inp=`<input type="${t}" id="${id}" data-k="${k}" value="${esc(v)}"${t==='number'?' step="any"':''}>`;
  return `<label class="fld ${full?'full':''}" for="${id}">${esc(l)}${inp}</label>`;
}
function datalists(){const P=Object.values(S.products);const inv=P.filter(p=>p.category==='INVERTER');
  const rel={'SMART METER':inv.flatMap(p=>csv(p.meters)),'CT':inv.flatMap(p=>csv(p.cts))};
  return CATS.map(c=>{const L=[...new Set([...P.filter(p=>p.category===c).map(p=>p.model),...(rel[c]||[])])];return `<datalist id="dl-${c}">${L.map(m=>`<option value="${esc(m)}">`).join('')}</datalist>`}).join('')}
function readForm(root,sec){
  const o={};root.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k,sp=sec.fields.find(f=>f[0]===k);
    if(el.type==='checkbox')o[k]=el.checked;else if(sp&&sp[2]==='number')o[k]=el.value===''?'':Number(el.value);else o[k]=el.value.trim()});
  return o;
}

/* ---------- job page ---------- */
function viewJob(id){
  const j=S.jobs[id];
  if(!j)return S.loaded.jobs?'<div class="card empty">ไม่พบงานนี้ <a href="#jobs">กลับไปงานทั้งหมด</a></div>':'<div class="card empty">กำลังโหลด…</div>';
  if(myRole()==='sales_pm'&&j.salesTeam!==myTeam())return '<div class="card empty">งานนี้ไม่อยู่ในทีมของคุณ</div>';
  const c=cOf(j),s=sOf(j);const n=j.stage;const act=canAct(j);const st=STAGES[n];
  const nd=needs(n,j,c,s);const done=nd.filter(x=>x.ok).length;const ready=done===nd.length;
  const mineNow=myGroup()===st.role;const dd=days(j.stageSince);
  const curSecs=new Set(j.status==='active'&&act?SECTIONS.filter(x=>!x.noForm&&x.stages.includes(n)&&secEditable(x,j)).map(x=>x.id):[]);
  let right='',other='';   // other = แท็บ "อื่นๆ" ของการ์ดขวา (คำสั่งที่ใช้นาน ๆ ครั้ง + งานของไซต์นี้)
  if(j.status==='active'){
    const nextRole=n<LAST?nextWho(j,n+1):'';
    let btns='';
    if(n===ST.OFFER)btns=`<button class="btn dk" data-act="next" ${act&&ready?'':'disabled'}>ลูกค้าตกลง ไปนัดติดตั้ง</button><button class="btn" data-act="lost" ${act?'':'disabled'}>ลูกค้ายังไม่ตกลง</button>`;
    else if(n===LAST)btns=`<button class="btn dk" data-act="done" ${act&&ready?'':'disabled'}>ยื่นเสร็จ ปิดงาน</button>`;
    else btns=`<button class="btn dk" data-act="next" ${act&&ready?'':'disabled'}>${ready?'ส่งต่อให้'+esc(nextRole):`ส่งต่อ · ขาดอีก ${nd.length-done} รายการ`}</button>`;
    if(n>1&&act&&n!==ST.ACCEPT&&n!==ST.SURVEY)btns+=`<button class="btn sm" data-act="back" style="align-self:flex-start;box-shadow:none;color:var(--mut)">ย้อนกลับขั้นก่อนหน้า</button>`;
    if(n===ST.ACCEPT){right=acceptCard(j,act);}
    else if(n===ST.BOOK&&act&&ready){right=acceptCard(j,act,nextRole);}
    else if(n===ST.SURVEY){right=svCard(j,c,s,act);if(isImp(j)&&myGroup()==='admin')other+=`<section class="act" aria-label="ปิดงานสำรวจแทน"><div><h2>ปิดงานสำรวจแทนคนสำรวจ</h2><span class="sub">สำหรับงานที่นำเข้าจาก Excel และสำรวจเสร็จไปแล้วนอกระบบ · งานจะไปขั้น "${esc(STAGES[ST.OFFER].name)}"</span></div><div class="btns"><button class="btn" data-act="impsv">ปิดงานสำรวจแทน</button></div></section>`;}
    else if(n===ST.INSREQ){right=insCard(j,act);}
    else if(n===ST.INSTALL){right=asgCard(j,act);}
    else if(n===ST.COMM&&j.status==='active'){right=insFormCard(j,'');if(isImp(j)&&['admin','dispatch'].includes(myGroup()))other+=`<section class="act" aria-label="ติดตั้งเสร็จแล้ว"><div><h2>ติดตั้งเสร็จไปแล้ว</h2><span class="sub">สำหรับงานที่นำเข้าจาก Excel และติดตั้งเสร็จนอกระบบ · ไม่ต้องมีใบงานติดตั้ง · งานจะไปขั้น "${esc(STAGES[ST.DOCS].name)}" แล้วทีมใน Man อัปโหลด Single Line</span></div><div class="btns"><button class="btn" data-act="impins">ย้ายไป${esc(STAGES[ST.DOCS].name)}</button></div></section>`;}
    else    right=`<section class="act" aria-label="ขั้นปัจจุบัน">
      <div><h2>${n===LAST?'ปิดงาน':'ส่งต่อให้'+esc(nextRole)}</h2><span class="sub">ครบ ${done} จาก ${nd.length}</span></div>
      ${nd.length?`<div class="pbar"><i style="width:${Math.round(done/nd.length*100)}%"></i></div>${curSecs.size?(done<nd.length?`<p class="need-hint">${curSecs.size===1?`กรอกในการ์ด “${esc(SECTIONS.find(x=>x.id===[...curSecs][0])?.title||'')}”`:'กรอกในการ์ดข้อมูลงาน'} · ยังขาด ${nd.length-done} ข้อ <button type="button" class="lnk" data-gosec="${esc([...curSecs][0]||'')}">ไปที่การ์ด</button></p>`:''):`<ul class="need">${nd.map(x=>`<li class="${x.ok?'ok':''}"><span class="k">${x.ok?'✓':''}</span>${esc(x.l)}</li>`).join('')}</ul>`}`:''}
      <div class="btns">${btns}</div>
      ${act?'':`<span class="sub">รอ${esc(ownerOf(j))}ดำเนินการ</span>`}
    </section>`;
    // ไฟล์จาก Man: แบบติดตั้ง (หลังสำรวจ) · Single Line สำหรับผู้รับเหมา (หลังมีนัดติดตั้ง) — ออฟฟิศดูสถานะ/เปิดไฟล์ได้
    if(j.status==='active'&&n>=ST.OFFER&&n<=ST.DOCS)right+=manFiles(j);
    if(j.resurvey&&n<=ST.SURVEY)right=`<span class="tag warn" style="height:auto;padding:8px 8px;align-self:flex-start">สำรวจซ้ำ · เดิมสำรวจไว้ ${j.resurvey.days} วัน</span>`+right;
  }else if(j.status==='cancelled'){
    right=`<section class="act"><h2>ยกเลิก</h2><span class="sub">${esc(j.cancelReason||'')}${j.cancelledAt?' · '+fdt(j.cancelledAt):''}</span>${canCancel()?(j.autoCancelled?'<button class="btn dk" data-act="resume">เปิดงานต่อ</button><button class="btn" data-act="rebook">จองใหม่</button>':'<button class="btn dk" data-act="rebook">จองใหม่</button>'):''}</section>`;
  }else if(j.status==='lost'){
    right=`<section class="act"><h2>${xCan(j)?'ยกเลิก':'ลูกค้ายังไม่ตกลง'}</h2><span class="sub">${esc(j.lostReason||'')}</span><span class="sub">ลูกค้ากลับมาตกลงเมื่อไร เปิดงานต่อได้ทันที</span><button class="btn dk" data-act="reopen">ลูกค้าตกลงแล้ว เปิดงานต่อ</button></section>`;
  }else if(j.status==='done'){
    const due=pmDue(j),dl=due?dLeft(due):null;
    right=`<section class="act"><div><h2>ตรวจเช็กประจำปี</h2><span class="sub">${due?'ครบกำหนด '+fd(due)+(dl<0?' · เลยมา '+(-dl)+' วัน':' · อีก '+dl+' วัน'):'ยังไม่มีวันติดตั้ง จึงคำนวณวันครบกำหนดไม่ได้'}</span></div>
      <span class="sub">นับ 1 ปีจาก${j.lastPm?'วันตรวจเช็กครั้งล่าสุด '+fd(j.lastPm):'วันติดตั้ง '+fd(j.installDate)} ระบบจะเตือนล่วงหน้า 30 วัน</span>
      ${due?`<div class="btns"><button class="btn dk" data-act="pmdone">บันทึกว่าตรวจเช็กแล้ววันนี้</button></div>`:''}</section>`;
    if(myRole()==='admin')right+=`<section class="act"><div><h2>ติดตั้งเพิ่ม</h2><span class="sub">ไซต์เดิม เริ่มที่จองคิวสำรวจ</span></div><div class="btns"><button class="btn" data-act="addon">ขอติดตั้งเพิ่ม</button></div></section>`;
  }
  {const sj=j.siteId?siteJobs(j.siteId).filter(x=>x.id!==j.id):[];if(sj.length)other+=`<section class="act" aria-label="งานของไซต์นี้"><h2>งานของไซต์นี้</h2>${sj.map(x=>`<a href="#job-${esc(x.id)}" class="sjl" style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="sjn">${esc(x.jobNo?'#'+x.jobNo:'ยังไม่มีเลข')} · ${esc(x.type==='addon'?'ติดตั้งเพิ่ม':'งานแรก')}</span>${jobPill(x)}</a>`).join('')}</section>`}
  const hist=[...(j.history||[])].reverse();
  /* การ์ดขวา: แท็บ ใบงาน · ไทม์ไลน์ · อื่นๆ (แบบเดียวกับแท็บการ์ดซ้าย) */
  if(S.rtabJob!==j.id){S.rtabJob=j.id;S.rtab='w'}
  const RT=[['w',j.status==='active'?'ใบงาน':'สถานะ',0],['t','ไทม์ไลน์',hist.length],...(other?[['o','อื่นๆ',(other.match(/<section/g)||[]).length]]:[])];
  if(!RT.some(x=>x[0]===S.rtab))S.rtab='w';
  const tlPanel=`<div class="rtl">${hist.slice(0,30).map(h=>{const who=esc(nm(h.by)),tx=esc(hText(h.text));return `<div><time>${fdt(h.at)}</time><span><b>${who}</b> · ${tx}</span></div>`}).join('')||'<span class="sub">ยังไม่มีบันทึก</span>'}</div>
        <div class="rnote"><label class="search" for="note"><input id="note" placeholder="เพิ่มบันทึก"></label><button class="btn sm" data-act="note">เพิ่ม</button></div>`;
  const PHC2={pre:'b',offer:'g',ins:'o',post:'v'};
  return `${datalists()}
  <div class="ph"><div class="jhd"><button type="button" class="jback" data-jback aria-label="${esc(backLabel())}" title="${esc(backLabel())} (Esc)">${svg('back','currentColor',2)}</button><div>
      <div class="jmeta"><span class="jno">#${esc(j.jobNo||'ยังไม่มีเลข')}</span>${j.salesTeam?teamTag(j.salesTeam):''}${j.request?.systemType?`<span class="pill gy">${esc(j.request.systemType)}</span>`:''}</div>
      <h1>${esc(j.title||c.name||'งานใหม่')}</h1>${badTitle(j.title)&&autoTitle(c)&&!isSales()?`<button type="button" class="lnk" data-act="fixtitle" style="display:block;margin:2px 0 6px">ใช้ชื่อลูกค้าเป็นชื่องาน · ${esc(autoTitle(c))}</button>`:''}
      <p>${esc([realName(c),s.area,j.proposedKw?j.proposedKw+' kW':'',s.phase?s.phase+' เฟส':'',s.utility].filter(Boolean).join(' · ')||'ยังไม่มีข้อมูลไซต์')}</p>${j.equipment&&j.equipment.plantName?`<p class="jplant">Plant <b>${esc(j.equipment.plantName)}</b></p>`:''}</div></div>
    <div class="pha">${navCtl(j.id)}${pinBtn(j)}${j.folderUrl&&safeUrl(j.folderUrl)?`<button class="btn" data-files="${esc(j.id)}">${svg('file','#16171a')}เปิดโฟลเดอร์งาน</button>`:(S.db&&S.db.folder?`<button class="btn" data-mkfolder="${esc(j.id)}">${svg('file','#16171a')}สร้างโฟลเดอร์งาน</button>`:'')}${j.installForm&&j.installForm.pdf&&safeUrl(j.installForm.pdf.url)?`<a class="btn" href="${esc(safeUrl(j.installForm.pdf.url))}" target="_blank" rel="noopener">${svg('file','#16171a')}ใบงานติดตั้ง (PDF)</a>`:''}${isImp(j)&&!isSales()?`<button class="btn" data-impedit="${esc(j.id)}">${svg('pen','currentColor',2)}แก้ไขข้อมูลงานนำเข้า</button>`:''}${canDraw()?`<a class="btn" href="${CADABRA}" target="_blank" rel="noopener">${svg('cad','#16171a')}เปิดแบบใน CADabra</a>`:''}${(()=>{const fx=j.folderUrl&&safeUrl(j.folderUrl)&&myRole()==='admin'&&j.folderId,cx=j.status==='active'&&j.stage<=ST.SURVEY&&canCancel(),dx=myRole()==='admin'&&S.db;
      return mnu([fx?mi(`data-fname="${esc(j.id)}"`,'pen','เปลี่ยนชื่อโฟลเดอร์'):'',fx&&(cx||dx)?'<hr>':'',cx?mi('data-act="cancel"','xc','ยกเลิกคิว',1):'',dx?mi(`data-jdel="${esc(j.id)}"`,'trash','ย้ายไปถังขยะ',1):''].filter(x=>x!=='<hr>'||fx&&(cx||dx)),'อื่นๆ')})()}</div></div>
  ${j.status==='active'?`<section class="card jst">
    <div class="jsc"><span class="sub">ขั้นปัจจุบัน</span><span class="pill ${PHC2[phaseOf(n)?.k]||'gy'} big${S.stAnim&&S.stAnim.id===j.id?' pp':''}">${esc(st.name)}</span></div>
    <div class="jsc"><span class="sub">ผู้รับผิดชอบ</span><b>${mineNow?'คุณ':esc(ownerOf(j))}</b></div>
    <div class="jsc"><span class="sub">อยู่ขั้นนี้มา</span><b class="${dd>30?'tcrit':dd>14?'twarn':''}">${dd} วัน</b></div>
    <div class="jsc grow"><span class="sub">${n<LAST?`ถัดไป: ${esc(STAGES[n+1].name)}`:'ขั้นสุดท้าย'}</span>
      <div class="jprog" role="progressbar" aria-valuemin="0" aria-valuemax="${LAST}" aria-valuenow="${n-1}">${STAGES.slice(1).map((x,i)=>`<i class="${i+1<n?'d':i+1===n?'c':''}${i+2===n&&S.stAnim&&S.stAnim.id===j.id?' grow':''}" title="${esc(x.name)}"></i>`).join('')}${S.stAnim&&S.stAnim.id===j.id?(S.stAnim=null,''):''}</div></div>
  </section>`:`<section class="card jst"><div class="jsc"><span class="sub">สถานะ</span>${stOf(j)==='cancelled'?'<span class="pill gy big">ยกเลิก</span>':j.status==='lost'?'<span class="pill gy big">ลูกค้ายังไม่ตกลง</span>':'<span class="pill ok big">ปิดงานแล้ว · ดูแลหลังการขาย</span>'}</div></section>`}
  <div class="banner" id="heldNote" hidden>งานนี้มีการอัปเดตระหว่างแก้ไข บันทึกหรือยกเลิกเพื่อดูข้อมูลล่าสุด</div>
  <div class="cols">
    <div class="colL">${curSecs.size?[...curSecs].map(id=>{const sec=SECTIONS.find(x=>x.id===id);return secForm(sec,j,c,s,true)}).join(''):''}
      ${summaryCard(j,c,s,curSecs)}</div>
    <div class="colR"><div class="rtw">
      <div class="jtabs rtabs" role="tablist" aria-label="การ์ดงาน">${RT.map(([k,l,n2])=>`<button role="tab" data-rtab="${k}" aria-selected="${S.rtab===k}" class="${S.rtab===k?'on':''}">${l}${n2?`<i>${n2}</i>`:''}</button>`).join('')}</div>
      <div class="rbody" role="tabpanel">${S.rtab==='t'?tlPanel:S.rtab==='o'?other:right}</div>
    </div></div>
  </div>`;
}

function engList(){return [...new Set([...Object.values(S.members).filter(m=>m.role==='eng').map(m=>nm(m.id)),...Object.values(S.jobs).map(x=>x.surveyor)].filter(x=>x&&x.length<20&&x!=='ผู้ใช้'))].sort()}
/* วันติดตั้งทั้งหมดของงาน (เริ่ม → ถึง) */
function insDays(j){const a=j.installDate;if(!a||!/^\d{4}-\d{2}-\d{2}$/.test(a))return [];const b=j.installEnd&&j.installEnd>a?j.installEnd:a;const L=[];let k=a;while(k<=b&&L.length<31){L.push(k);k=isoAdd(k,1)}return L}
const onIns=(j,k)=>insDays(j).includes(k);
function installsOn(k,exceptId){return Object.values(S.jobs).filter(x=>x.id!==exceptId&&x.status==='active'&&x.stage>=ST.INSTALL&&x.stage<=ST.INSTALL&&onIns(x,k))}
function insCard(j,act){
  const d0=j.installDate||j.wantInstallDate||'';const L=d0?installsOn(d0,j.id):[];
  return `<section class="act" aria-label="จองคิวติดตั้ง">
    <div><h2>จองคิวติดตั้ง</h2><span class="sub">ลูกค้าตกลง ${j.agreedDate?fd(j.agreedDate):''}${j.wantInstallDate?' · สะดวก '+fd(j.wantInstallDate):''}</span></div>
    <div class="fld">วันติดตั้ง${act?dateCtl('ins-d',d0,today(),'วันติดตั้ง'):`<b>${d0?fd(d0):'—'}</b>`}</div>
    <label class="fld" for="ins-t">ผู้รับเหมา<input id="ins-t" value="${esc(j.installTeam||'')}" placeholder="ชื่อผู้รับเหมา / ทีมช่าง" ${act?'':'disabled'}></label>
    <span class="sub">${L.length?`วันนั้นมีงานติดตั้งแล้ว ${L.length} งาน: ${L.map(x=>esc(x.title)).join(' · ')}`:'เลือกวัน ใส่ผู้รับเหมา แล้วกดจอง'}</span>
    <div class="btns"><button class="btn dk" data-act="bookins" ${act?'':'disabled'}>จองคิวติดตั้ง</button></div>
    ${act?'':`<span class="sub">รอ${esc(ownerOf(j))}จองคิว</span>`}</section>`;
}
function dateCtl(id,val,min,label){return `<label class="dctl" for="${id}"><span>${val?fd(val):'เลือกวัน'}</span>${svg('cal','#6b6e76',2)}<input type="date" id="${id}" value="${esc(val||'')}" ${min?`min="${min}"`:''} aria-label="${esc(label||'วันที่')}"></label>`}
/* งานค้างจากเดือนก่อน: สำรวจก่อนเดือนนี้ ยังไม่ปิดงาน (หน้ารายการงานกรองตามเดือนสำรวจ จึงมองไม่เห็นงานพวกนี้) */
function blPanel(all){
  const d=new Date();const cur=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const L=all.filter(j=>j.status==='active'&&j.stage!==ST.OFFER&&svDate(j)&&svDate(j).slice(0,7)<cur).sort((a,b)=>(a.stageSince||0)-(b.stageSince||0));
  if(!L.length)return '';
  const mo=k=>`${TM[+k.slice(5,7)-1]} ${String(+k.slice(0,4)+543).slice(2)}`;
  const row=j=>{const c=cOf(j);const n=days(j.stageSince);
    return `<a class="bt bl" href="#job-${esc(j.id)}"><span class="bkn"><b>${esc(j.title||c.name||'ไม่มีชื่อไซต์')}</b><span>${esc(realName(c)||'ยังไม่มีชื่อลูกค้า')}${j.jobNo?' · #'+esc(j.jobNo):''}</span></span>
      <span>${jobPill(j)}</span><span><b>${mo(svDate(j))}</b><small>สำรวจ ${fd(svDate(j))}</small></span>
      <span><b class="bld ${agCls(j)}">${n} วัน</b><small>อยู่ขั้นนี้</small></span><span class="bkb"><span class="btn sm">เปิดงาน</span></span></a>`};
  return `<div class="hbk hbl"><section class="card bkc blc" aria-label="งานค้างจากเดือนก่อน">
    <div class="bkh"><h2>งานค้างจากเดือนก่อน</h2><span class="blc-n">${L.length} งาน</span><span class="sub">สำรวจก่อน${TMF[d.getMonth()]} ยังไม่ปิดงาน · เรียงจากค้างนานสุด</span></div>
    <div class="bt hdr bl"><span>ไซต์ / ลูกค้า</span><span>ขั้นปัจจุบัน</span><span>เดือนที่สำรวจ</span><span>ค้าง</span><span></span></div>
    <div class="blr">${L.map(row).join('')}</div></section></div>`;
}
function bookPanel(){
  const act=Object.values(S.jobs).filter(j=>j.status==='active');
  const sv=act.filter(j=>j.stage===ST.ACCEPT).sort((a,b)=>String(a.queueDate||'9').localeCompare(String(b.queueDate||'9')));
  const ins=act.filter(j=>j.stage===ST.INSREQ).sort((a,b)=>(a.stageSince||0)-(b.stageSince||0));
  const tab=S.f.bk||(sv.length||!ins.length?'sv':'ins');
  const engs=engList();
  const wd=k=>k?`${TD[new Date(k+'T00:00:00').getDay()]} ${fd(k)}`:'ยังไม่ระบุ';
  const cust=j=>{const c=cOf(j);const rn=realName(c);return `<a class="bkn" href="#job-${esc(j.id)}"><b>${esc(j.title||c.name)}</b><span>${esc(rn||'ยังไม่มีชื่อลูกค้า')}${c.phone?' · '+esc(c.phone):''}</span></a>`};
  const svRow=j=>{const di=j.queueDate?dayInfo(j.queueDate,j.id):null;const st=!j.queueDate?['gy','ยังไม่ระบุวัน']:di.closed?['r','วันปิดรับคิว']:di.left<=0?['o','คิวเต็มแล้ว']:['ok','ว่าง '+di.left+' ที่'];
    return `<div class="bt sv">${cust(j)}<span>${teamTag(j.salesTeam)||'—'}<small>${esc(j.salesPerson||'')}</small></span>
      <span><b>${wd(j.queueDate)}</b><small>${esc(j.queueTime||'')}</small></span><span><span class="pill ${st[0]==='r'?'rd':st[0]}">${st[1]}</span></span>
      <select class="bki" id="acc-eng-${esc(j.id)}" aria-label="คนสำรวจ" ${j.queueDate?'':'disabled'}><option value="">เลือกคนสำรวจ</option><option value="__out">คนนอกระบบ · พิมพ์ชื่อ</option>${j.queueDate?SV_TEAMS.map(t=>{const b=S.me.role?teamBlock(t,j.queueDate,j.id,j.queueTime,j):(teamSlots(t,j.queueDate,j.id)?'':'เต็ม');return `<option value="${esc(t)}" ${b?'disabled':''} ${j.surveyTeam===t?'selected':''}>${esc(t)} · ${esc(b||teamWhy(t,j.queueDate,j.id,j.queueTime,j))}</option>`}).join(''):''}</select>
      <span class="bkb"><button class="btn sm pri" data-act="accept" data-jid="${esc(j.id)}">ตอบรับ</button><button class="btn sm" data-act="decline" data-jid="${esc(j.id)}">ขอเปลี่ยนวัน</button></span></div>`};
  const insRow=j=>{const d0=j.wantInstallDate||'';const L=d0?installsOn(d0,j.id):[];
    return `<div class="bt in">${cust(j)}<span><b>${j.proposedKw?esc(j.proposedKw)+' kW':'—'}</b><small>${esc(j.salesTeam||'')}</small></span>
      <span><b>${d0?wd(d0):'ไม่ระบุ'}</b><small>ตกลง ${j.agreedDate?fd(j.agreedDate):'—'}</small></span><span><span class="pill ${L.length?'o':'ok'}">${L.length?`มีติดตั้ง ${L.length} งาน`:'ว่าง'}</span></span>
      <span class="insr">${dateCtl('ins-d-'+j.id,d0,today(),'วันเริ่มติดตั้ง')}<em>ถึง</em>${dateCtl('ins-e-'+j.id,j.wantInstallEnd||'',today(),'ติดตั้งถึงวันที่')}</span>
      <span class="bkb"><button class="btn sm pri" data-act="bookins" data-jid="${esc(j.id)}">จองคิวติดตั้ง</button></span></div>`};
  const head=tab==='sv'?['ไซต์ / ลูกค้า','ทีมขาย','วันเวลาที่ขอ','ความพร้อม','คนสำรวจ','จัดการ']:['ไซต์ / ลูกค้า','ขนาด','วันที่ลูกค้าสะดวก','ความพร้อม','วันติดตั้ง','จัดการ'];
  const rows=tab==='sv'?sv:ins;
  return `<datalist id="dl-engs">${engs.map(e=>`<option value="${esc(e)}">`).join('')}</datalist>
  <section class="card bkc" aria-label="จองคิว">
    <div class="bkh"><h2>จองคิว</h2>
      <div class="tabs" role="tablist"><button role="tab" aria-selected="${tab==='sv'}" class="${tab==='sv'?'on':''}" data-bk="sv">คิวสำรวจรอตอบรับ<span>${sv.length}</span></button><button role="tab" aria-selected="${tab==='ins'}" class="${tab==='ins'?'on':''}" data-bk="ins">คิวติดตั้งรอจอง<span>${ins.length}</span></button></div>
</div>
    ${rows.length?`<div class="bt hdr ${tab==='sv'?'sv':'in'}">${head.map(h=>`<span>${h}</span>`).join('')}</div>${rows.map(tab==='sv'?svRow:insRow).join('')}`
      :`<div class="hempty"><b>${tab==='sv'?'ไม่มีคำขอคิวสำรวจค้าง':'ไม่มีงานรอจองติดตั้ง'}</b><span class="sub">${tab==='sv'?'คำขอจากเซลส์จะขึ้นที่นี่ทันที':'งานที่ลูกค้าตกลงแล้วจะขึ้นที่นี่'}</span></div>`}
  </section>`;
}
function acceptCard(j,act,book){   // book = ชื่อคนจัดงาน เมื่อเปิดจากขั้นจองคิว (5q)
  const di=j.queueDate?dayInfo(j.queueDate,j.id):{L:[],taken:[],closed:''};const clash=j.queueTime&&di.taken.includes(j.queueTime);
  const cur=SV_TEAMS.includes(j.surveyTeam)?j.surveyTeam:'';
  const opts=SV_TEAMS.map(t=>{const b=j.queueDate?(S.me.role?teamBlock(t,j.queueDate,j.id,j.queueTime,j):(teamSlots(t,j.queueDate,j.id)?'':'เต็ม')):'';return `<option value="${esc(t)}" ${cur===t?'selected':''} ${b?'disabled':''}>${esc(t)}${j.queueDate?' · '+esc(b||teamWhy(t,j.queueDate,j.id,j.queueTime,j)):''}</option>`}).join('');
  const locked=svLocked(j);
  return `<section class="act" aria-label="จัดทีมสำรวจ">
    <div><h2>ส่งใบงานสำรวจ</h2><span class="sub">${esc(j.salesPerson||'เซลส์')} ${j.salesTeam?'('+esc(j.salesTeam)+')':''} · จองคิวแล้ว</span></div>
    <div class="qreq"><b>${j.queueDate?`${TD[new Date(j.queueDate+'T00:00:00').getDay()]} ${fd(j.queueDate)}`:'ยังไม่ระบุวัน'}</b><span>${esc(j.queueTime||'')}</span></div>
    ${di.closed?`<span class="tag crit" style="height:auto;padding:8px 8px">วันนั้นปิดรับคิว: ${esc(di.closed)}</span>`:clash?'<span class="tag crit" style="height:auto;padding:8px 8px">เวลานี้มีคิวอื่นแล้ว</span>':j.queueDate?`<span class="sub">วันนั้นมีคิวอื่น ${di.L.length} งาน${di.L.length?': '+di.L.map(x=>esc((x.queueTime||'')+' '+(x.title||''))).join(' · '):''}</span>`:'<span class="sub">ยังไม่มีวันคิว เลือกวันในส่วนผู้แจ้งงานและคิวสำรวจ</span>'}
    <label class="fld" for="acc-eng">คนสำรวจ<select id="acc-eng" class="sel" ${act?'':'disabled'}><option value="">— เลือก —</option>${opts}<option value="__out">คนนอกระบบ · พิมพ์ชื่อ</option></select></label>
    <label class="fld" for="acc-out" hidden>ชื่อคนสำรวจ (นอกระบบ)<input id="acc-out" placeholder="ชื่อเล่นหรือชื่อจริง" ${act?'':'disabled'}><span class="sub">ทีมใน Man กรอกผลสำรวจแทนได้ ระบบบันทึกว่าใครกรอก</span></label>
    ${S.me.role&&act&&locked.length?`<button class="lnk" type="button" data-unlock="${esc(j.id)}" style="align-self:flex-start">ขอใช้ ${locked.map(esc).join(' / ')}</button>`:''}
    ${S.me.role?`<label class="fld" for="acc-help">คนไปด้วย (ไม่บังคับ)<input id="acc-help" value="${esc(j.surveyHelpers||'')}" placeholder="เช่น ปอ" ${act?'':'disabled'}></label>`:''}
    <label class="fld" for="acc-note">หมายเหตุใบงาน (ไม่บังคับ)<input id="acc-note" value="${esc(j.woNote||'')}" ${act?'':'disabled'}></label>
    <span class="sub">เลขใบงาน ${esc(j.jobNo||nextJobNo())}</span>
    <div class="btns"><button class="btn dk" data-act="accept" ${act?'':'disabled'}>ส่งใบงาน</button>${book?`<button class="btn" data-act="next">ให้${esc(book)}จัดคน</button>`:`<button class="btn" data-act="decline" ${act?'':'disabled'}>ขอเปลี่ยนวัน</button>`}</div>

  </section>`;
}
function svCard(j,c,s,act){
  const st=svSteps(j,s);const v=j.sv||{};const nx=st.findIndex(x=>!x.ok);
  const by=new Date();const fpath=`${FOLDER_ROOT}\\${by.getFullYear()+543}\\${j.jobNo||'ไม่มีเลข'} ${(j.title||'').replace(/[\\/:*?"<>|]/g,'')}`;
  const ctl=(x,i)=>{if(x.ok||i!==nx||!act)return '';
    if(x.k==='accepted')return `<button class="btn dk sm" data-act="sv:accepted">ตอบรับใบงาน</button>`;
    if(x.k==='folder')return `<div class="svin"><input id="sv-folder" value="${esc(fpath)}" aria-label="ที่อยู่โฟลเดอร์"><button class="btn sm" data-copy="#sv-folder" type="button">คัดลอก</button></div><button class="btn dk sm" data-act="sv:folder">สร้างโฟลเดอร์แล้ว</button>`;
    if(x.k==='onsite')return `${safeUrl(s.mapLink)?`<a class="btn sm" href="${esc(safeUrl(s.mapLink))}" target="_blank" rel="noopener">เปิดแผนที่ไปหน้างาน</a>`:'<span class="tag warn" style="height:auto;padding:4px 8px">เซลส์ยังไม่ได้ใส่ตำแหน่ง</span>'}<button class="btn dk sm" data-act="sv:onsite">ถึงหน้างานแล้ว</button>`;
    if(x.k==='form')return `<button class="btn sm" data-go="sec-site" type="button">ไปที่ฟอร์มสำรวจ</button><span class="sub">ครบเมื่อกรอกข้อมูลไซต์ครบ</span>`;
    if(x.k==='photos')return `<div class="svin"><input id="sv-photos" type="number" min="1" placeholder="จำนวนรูป" aria-label="จำนวนรูป" style="max-width:120px"><button class="btn dk sm" data-act="sv:photos">ส่งรูปเข้าโฟลเดอร์แล้ว</button></div>`;
    if(x.k==='sign')return `<button class="btn dk sm" data-act="sv:sign">ให้ลูกค้าเซ็น</button>`;
    if(x.k==='draw')return `<span class="sub">คนสำรวจอัปโหลดไฟล์แบบจากแอปช่างแล้วจะติ๊กให้เอง</span>`;
    return ''};
  const allOk=st.every(x=>x.ok);const designOk=!!(j.proposedKw&&j.proposedModel);
  const done=st.filter(x=>x.ok).length;
  return `<section class="act" aria-label="ขั้นตอนสำรวจ">
    <div><h2>ใบงาน ${esc(j.jobNo||'')}</h2><span class="sub">${esc(j.surveyor||'')} · สำรวจ ${j.surveyDate?fd(j.surveyDate):''} ${esc(j.queueTime||'')} · ครบ ${done} จาก ${st.length}</span></div>
    ${j.woNote||j.salesNote?`<span class="sub" style="background:var(--hv);padding:8px 8px;border-radius:10px">${esc([j.woNote,j.salesNote].filter(Boolean).join(' · '))}</span>`:''}
    <ol class="svl">${st.map((x,i)=>`<li class="${x.ok?'ok':i===nx?'nx':''}"><span class="k">${x.ok?'✓':i+1}</span><div><b>${esc(x.t)}</b>${x.ok&&x.at?`<span class="sub">${fdt(x.at)}${x.k==='folder'?' · '+esc(v.folder):x.k==='photos'?' · '+v.photos+' รูป':x.k==='sign'?' · '+esc(v.sign.name):''}</span>`:''}
      ${x.k==='sign'&&v.sign?.img?`<img class="sigimg" src="${esc(v.sign.img)}" alt="ลายเซ็นลูกค้า">`:''}
      ${ctl(x,i)?`<div class="svc">${ctl(x,i)}</div>`:''}</div></li>`).join('')}</ol>
    ${allOk&&!designOk?'<span class="sub">ใส่ขนาดที่เสนอและรุ่นอินเวอร์เตอร์ในส่วน "ผลสำรวจและแบบ" ก่อนปิดงาน</span>':''}
    <div class="btns"><button class="btn dk" data-act="svclose" ${act&&allOk&&designOk?'':'disabled'}>ปิดงานสำรวจ</button>
    ${act&&done?`<button class="btn sm" data-act="sv:undo" style="box-shadow:none;color:var(--mut)">ยกเลิกขั้นล่าสุด</button>`:''}</div>
    ${act?'':`<span class="sub">รอ${j.surveyor?' '+esc(j.surveyor):'คนสำรวจ'}ดำเนินการ</span>`}
  </section>`;
}
function signPad(c){return new Promise(res=>{
  const m=$('#modal');
  m.innerHTML=`<div class="modalbg"><form class="modal" id="sigf" style="width:min(560px,94vw)"><h2 style="margin:0;font-size:20px">ลูกค้าเซ็นปิดงานสำรวจ</h2>
    <span class="sub">ผู้รับบริการเซ็นยืนยันว่าทีมสำรวจเข้าหน้างานแล้ว</span>
    <canvas id="sigc" width="1000" height="360" style="width:100%;height:200px;border-radius:12px;background:#f6f7f8;box-shadow:inset 0 0 0 1px #dfe1e5;touch-action:none;cursor:crosshair" aria-label="ช่องเซ็นชื่อ"></canvas>
    <label class="fld" for="sign">ชื่อผู้เซ็น<input id="sign" value="${esc(realName(c)||'')}" required></label>
    <div style="display:flex;gap:8px"><button class="btn dk" type="submit">ยืนยันลายเซ็น</button><button class="btn" type="button" id="sigclr">ล้าง</button><button class="btn" type="button" id="sigx" style="margin-left:auto">ยกเลิก</button></div></form></div>`;
  const cv=$('#sigc'),x=cv.getContext('2d');x.lineWidth=5;x.lineCap='round';x.lineJoin='round';x.strokeStyle='#16171a';let dn=false,any=false;
  const P=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
  cv.onpointerdown=e=>{dn=true;any=true;cv.setPointerCapture(e.pointerId);x.beginPath();x.moveTo(...P(e))};
  cv.onpointermove=e=>{if(!dn)return;x.lineTo(...P(e));x.stroke()};
  cv.onpointerup=()=>dn=false;
  $('#sigclr').onclick=()=>{x.clearRect(0,0,cv.width,cv.height);any=false};
  $('#sigx').onclick=()=>{m.innerHTML='';res(null)};
  $('#sigf').onsubmit=e=>{e.preventDefault();if(!any)return toast('ให้ลูกค้าเซ็นก่อน');
    const o=document.createElement('canvas');o.width=500;o.height=180;o.getContext('2d').drawImage(cv,0,0,500,180);
    const r={img:o.toDataURL('image/png'),name:$('#sign').value.trim()||'ลูกค้า',at:Date.now()};m.innerHTML='';res(r)};
})}
function secForm(sec,j,c,s,cur){
  const obj=getT(sec.tgt,j,c,s);
  return `<section class="sec ${cur?'cur':'editing'}" data-sec="${sec.id}" id="sec-${sec.id}"><h2>${esc(sec.title)}${cur?'<span class="tg">ขั้นปัจจุบัน</span>':'<span class="tg" style="background:#eef0f3;color:var(--ink)">กำลังแก้ไข</span>'}</h2>
    <div class="fgrid">${sec.fields.filter(fl=>!(sec.id==='install'&&(fl[0]==='supervisor'||fl[0]==='installTeam'&&j.status==='active'&&(j.stage===ST.INSREQ||j.stage===ST.INSTALL)))).map(fl=>fieldHtml(sec,fl,obj,'f')).join('')}</div>
    ${sec.id==='eq'?`<div class="eqsls">${invUnits(obj).slice(1).map(slaveRow).join('')}</div><button class="btn sm" type="button" data-eqsadd="1" style="margin-top:8px">+ เพิ่มเครื่อง Slave</button>`:''}
    <div class="save"><button class="btn sm" data-cancel="${sec.id}">ยกเลิก</button><button class="btn pri sm" data-save="${sec.id}">บันทึก</button></div></section>`;
}
function showVal([k,l,t],v){
  if(t==='h')return null;
  if(t==='chk')return v?'✓':null;
  if(v===undefined||v===null||v===''||v===false)return null;
  if(t==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(v))return fd(v);
  if(k==='proposedKw'||k==='wantKwp')return v+' kW';
  if(k==='avgBill')return Number(v).toLocaleString('th-TH')+' บาท';
  if(k==='phase')return v+' เฟส';
  return String(v);
}
function summaryCard(j,c,s,curSecs){
  const n=j.status==='active'?j.stage:99;
  const secs=SECTIONS.filter(sec=>!curSecs.has(sec.id)&&(sec.id==='pm'?j.status==='done':Math.min(...sec.stages)<=n));
  if(!secs.length)return '';
  const JT=[['ov','ภาพรวม',['cust','loc','order']],['sv','สำรวจ',['wo','site','req','survey']],['ins','ติดตั้ง',['install','eq']],['doc','ขนานไฟ',['docs']],['pm','ตรวจเช็คประจำปี',['pm']]];   // แท็บตามที่ผู้ใช้กำหนด · ภาพรวม = ลูกค้า ตำแหน่ง ผู้แจ้งงาน
  if(S.jtabJob!==j.id){S.jtabJob=j.id;S.jtab='ov'}
  if(S.edit){const ge=JT.find(g=>g[2].includes(S.edit));if(ge)S.jtab=ge[0]}
  const jg=JT.find(g=>g[0]===S.jtab)||JT[0],jtab=jg[0];
  const jtabs=`<div class="jtabs" role="tablist">${JT.map(g=>`<button role="tab" data-jtab="${g[0]}" aria-selected="${g[0]===jtab}" class="${g[0]===jtab?'on':''}">${g[1]}</button>`).join('')}</div>`;
  const jsecs=secs.filter(sec=>jg[2].includes(sec.id));
  const blocks=!jsecs.length?'<p class="sub" style="margin:16px 0 0">ยังไม่มีข้อมูลของขั้นนี้</p>':jsecs.map(sec=>{
    if(S.edit===sec.id)return secForm(sec,j,c,s,false);
    const obj=getT(sec.tgt,j,c,s);
    const rows=sec.fields.map(f=>{const v=showVal(f,obj[f[0]]);return v==null?'':`<div class="kv ${f[2]==='area'||(f[3]&&f[3].full)?'full':''}"><span>${esc(f[1])}${sec.id==='eq'&&invUnits(obj).length>1&&['model','sn','wifiSn'].includes(f[0])?' (Master)':''}</span><b>${esc(v)}${svTick(sec.id,f[0])}</b></div>`}).join('')
      +(sec.id==='eq'?invUnits(obj).slice(1).map((u,i)=>`<div class="kv full"><span>Slave ${i+1}</span><b>${esc([u.model,u.sn&&'S/N '+u.sn,u.wifiSn&&'WiFi '+u.wifiSn].filter(Boolean).join(' · '))}${svTick(sec.id,'units')}</b></div>`).join(''):'');
    const canEd=!!S.db&&secEditable(sec,j);
    return `<div class="sblk"><div class="sh"><h3>${esc(sec.title)}</h3>${canEd?`<button class="lnk" data-edit="${sec.id}">แก้ไข</button>`:''}</div>${rows?`<div class="kvg">${rows}</div>`:'<span class="sub">ยังไม่มีข้อมูล</span>'}</div>`;
  }).join('');
  return `${jtabs?'<div class="jtw">':''}${jtabs}<section class="card pad sumcard${jtabs?' hastab':''}" aria-label="ข้อมูลงาน"><h2 style="margin:0;font-size:16px">ข้อมูลงาน${j.status==='active'?'<span class="sub" style="font-weight:400;margin-left:8px">จากขั้นที่ผ่านมา</span>':''}</h2>${blocks}</section>${jtabs?'</div>':''}`;
}

/* ---------- new job ---------- */
const NEWF={cust:SECTIONS[0]};
function nfFields(f,team){return `      <h2 class="nst2"><i class="nstep">2</i>ข้อมูลลูกค้า</h2>
      <div class="ngrp"><h2>ผู้แจ้งงาน</h2><div class="fgrid">
        <label class="fld" for="n-team">ทีมขาย<select id="n-team" ${myRole()==='sales_pm'?'disabled':''}><option value="">—</option>${TEAMS.map(t=>`<option ${(f.team||team)===t?'selected':''}>${t}</option>`).join('')}</select></label>
        <label class="fld" for="n-person">ชื่อเซลส์<input type="text" id="n-person" value="${esc(f.person||'')}"></label></div></div>
      <div class="ngrp"><h2>ลูกค้า</h2><div class="fgrid">
        <label class="fld" for="n-first">ชื่อ<input id="n-first" ${f.parent&&f._ro&&f._ro.first?'readonly':''} value="${esc(f.first||'')}" autocomplete="off"></label>
        <label class="fld" for="n-last">นามสกุล<input id="n-last" ${f.parent&&f._ro&&f._ro.last?'readonly':''} value="${esc(f.last||'')}"></label>
        <label class="fld" for="n-phone">เบอร์ติดต่อ<input id="n-phone" ${f.parent&&f._ro&&f._ro.phone?'readonly':''} type="tel" inputmode="tel" value="${esc(f.phone||'')}" placeholder="08x-xxx-xxxx"></label>
        <label class="fld" for="n-email">อีเมล (ไม่บังคับ)<input id="n-email" ${f.parent&&f._ro&&f._ro.email?'readonly':''} type="email" value="${esc(f.email||'')}"></label>
        <div class="full" id="n-known">${nfKnown(f)}</div>
        <label class="fld full" for="n-addr">ที่อยู่ลูกค้า (ไม่บังคับ)<textarea id="n-addr" ${f.parent&&f._ro&&f._ro.addr?'readonly':''} rows="2">${esc(f.addr||'')}</textarea></label></div></div>
      <div class="ngrp"><h2>ตำแหน่ง</h2>
        <label class="fld" for="n-map">ลิงก์ Google Maps ตำแหน่งลูกค้า<input id="n-map" ${f.parent&&f._ro&&f._ro.map?'readonly':''} type="url" value="${esc(f.map||'')}" placeholder="https://maps.app.goo.gl/..."></label>
        <div class="maphelp"><a class="btn sm" href="${mapsDir(f.addr||'')}" target="_blank" rel="noopener" id="n-mapbtn">${svg('pin','#16171a').replace('<svg','<svg width="14" height="14"')}เปิด Google Maps เส้นทางจากเพาเวอร์เมติค</a>
        <span class="sub">ปักหมุดบ้านลูกค้า กดแชร์ แล้ววางลิงก์ในช่องด้านบน</span>${f.map&&!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)/.test(f.map)?'<span class="tag warn">ลิงก์นี้ไม่ใช่ Google Maps</span>':''}</div></div>
      <div class="ngrp"><h2>สมาร์ทมิเตอร์ <span class="opt">เครื่องวัดพฤติกรรมไฟ · ไม่บังคับ</span></h2>
        <label class="mchk"><input type="checkbox" id="n-meter" ${f.meter?'checked':''}><span>ขอติดตั้งสมาร์ทมิเตอร์ในวันสำรวจ</span></label>
        <div id="n-mtbox">${mtBox(f)}</div></div>
      <div class="ngrp"><h2>หมายเหตุถึงคนสำรวจ <span class="opt">ไม่บังคับ</span></h2><textarea id="n-note" rows="2" aria-label="หมายเหตุถึงคนสำรวจ" placeholder="เช่น ลูกค้าสะดวกช่วงบ่าย ต้องการระบบแบตเตอรี่">${esc(f.note||'')}</textarea></div>
`}
function nfWhen(noHead){const f=S.nf||{};const t=today();const sel=f.date?dayInfo(f.date):null;
  return `  <div class="cslot">${f.date?`${noHead?'':`<b>${TD[new Date(f.date+'T00:00:00').getDay()]} ${fd(f.date)} · เลือกเวลา</b>`}
    <div class="slots">${SLOTS.map(s=>{const gone=slotGone(f.date,s);const tk=!gone&&sel.taken.includes(s);return `<button type="button" class="slot ${f.time===s&&!gone?'on':''}" ${tk||gone?'disabled':`data-nt="${s}"`}>${s}${tk?'<small>จองแล้ว</small>':gone?'<small>เลยเวลาแล้ว</small>':''}</button>`}).join('')}</div>`
    :'<span class="sub">เลือกวันที่ว่างในปฏิทินก่อน แล้วเลือกเวลา</span>'}</div>
  ${nfCanAssign()&&f.date&&f.time?`<label class="fld neng" for="n-eng">คนสำรวจ<select id="n-eng"><option value="">ให้หัวหน้าจัดงานเลือกทีหลัง</option>${SV_TEAMS.map(t=>{const b=teamBlock(t,f.date,null,f.time,null);return `<option value="${esc(t)}" ${f.eng===t&&!b?'selected':''} ${b?'disabled':''}>${esc(t)}${b?' · '+esc(b):''}</option>`}).join('')}</select><span class="sub">เลือกเลยแล้วระบบส่งใบงานให้ทันที ไม่ต้องรอขั้นจัดคน</span></label>
   <div class="fld neng nhelp"><span>คนไปด้วย <span class="opt">ไม่บังคับ · เช่น ทีม EV</span></span>${cvPick(f.help||[],f.date,f.time,cvHm(cvH(f.time)+1.5),'','data-nhp',f.eng)}</div>`:''}
`}
function nfSub(){const f=S.nf||{};const ok=nfReady();
  return `  <div class="nsub">
    <div class="nsum">${f.date&&f.time?`<b>${TD[new Date(f.date+'T00:00:00').getDay()]} ${fd(f.date)} · ${f.time}</b>`:'<b>ยังไม่ได้เลือกคิว</b>'}${ok.ok?'<span class="sub">ข้อมูลครบ พร้อมจอง</span>':`<span class="sub nmiss">ยังขาด: ${ok.miss.join(' · ')}</span><span class="sub nmissc">ยังขาด ${ok.miss.length} ช่อง</span>`}</div>
    <button class="btn pri" type="submit" data-mode="send" ${ok.ok?'':'aria-disabled="true"'}>${nfCanAssign()?(f.eng&&f.date&&f.time&&!teamBlock(f.eng,f.date,null,f.time,null)?'จองคิว + ส่งใบงาน':'จองคิว'):'บันทึกคำขอคิว'}</button>
  </div>`}
const telD=x=>String(x||'').replace(/\D/g,'').replace(/^66/,'0');
function nfKnown(f){if(f.parent||f.cid)return f.cid?`<span class="nfk on">${svg('check','currentColor',2.4)}ใช้ข้อมูลลูกค้าเดิม <button type="button" class="lnk" data-nfk="">ไม่ใช้</button></span>`:'';const d=telD(f.phone);if(d.length<9)return '';
  const c=Object.entries(S.customers||{}).find(([,x])=>telD(x.phone)===d);if(!c)return '';const [cid,x]=c;const jb=Object.values(S.jobs).filter(j=>j.customerId===cid).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
  return `<span class="nfk">${svg('users','currentColor',2)}<span>เบอร์นี้เป็นลูกค้าเดิม: <b>${esc(realName(x)||x.name||'')}</b>${jb?` · ${esc(jb.title||'')}${jb.jobNo?' #'+esc(jb.jobNo):''}`:''}</span><button type="button" class="btn sm" data-nfk="${esc(cid)}">ใช้ข้อมูลนี้</button></span>`}
function nfCanAssign(){return !!(S.me.owner||['admin','dispatch'].includes(myGroup())||myRole()==='sysadmin')}
function nfRead(){const f=S.nf||(S.nf={});const v=id=>(document.getElementById(id)?.value||'').trim();
  if(!$('#newForm'))return f;
  Object.assign(f,{team:myRole()==='sales_pm'?myTeam():v('n-team'),person:v('n-person'),first:v('n-first'),last:v('n-last'),phone:v('n-phone'),email:v('n-email'),addr:v('n-addr'),map:v('n-map'),note:v('n-note'),meter:!!document.getElementById('n-meter')?.checked,mdays:+v('n-mdays')||f.mdays||7});return f}
function nfReady(){const f=S.nf||{};const miss=[];
  if(!f.team&&!(myRole()==='sales_pm'))miss.push('ทีมขาย');if(!f.first||!f.last)miss.push('ชื่อ-นามสกุล');if(!f.phone)miss.push('เบอร์ติดต่อ');if(!normUrl(f.map))miss.push(f.map?'ลิงก์ตำแหน่งให้ถูกต้อง':'ลิงก์ตำแหน่ง');if(!f.date)miss.push('วัน');else if(!f.time)miss.push('เวลา');
  return {ok:!miss.length,miss}}
function nfRefresh(){const bw=document.querySelector('.cvbkw');if(bw){bw.innerHTML=cvBkWhen();const fs=document.querySelector('.cvbkft');if(fs)fs.innerHTML=nfSub()}const mb=$('#n-mtbox');if(mb&&document.activeElement?.id!=='n-mdays')mb.innerHTML=mtBox(S.nf||{});const b=$('#n-mapbtn');if(b)b.href=mapsDir((S.nf||{}).addr||'')}
/* ---------- survey queue calendar ---------- */
async function toggleClosed(k){
  const cur=closedDays();const doc=S.config?.survey;
  if(cur[k]){const rest={...cur};delete rest[k];await w('config/survey',{closed:rest},'set');return}
  const r=await ask('ปิดรับคิวสำรวจ '+fd(k),'เหตุผล เช่น ทีมไปติดตั้ง วันหยุด');if(r==null)return;
  await w('config/survey',{closed:{...cur,[k]:r||'ปิด'}},'set');
}
/* ปฏิทินเดือน: แสดงนัดเท่าที่ช่องพอ ที่เหลือรวมเป็น "+ อีก x นัด" */
function fitCal(){document.querySelectorAll('.kel2').forEach(el=>{
  const all=[...el.querySelectorAll('.kce2')];const kd=el.closest('.kd');const hd=kd&&kd.querySelector('.kdh');
  all.forEach(c=>{c.hidden=false;c.classList.remove('kshort')});let b=hd&&hd.querySelector('.kmore3');if(b)b.remove();
  kd&&kd.querySelector(':scope>.kmore3')?.remove();
  let shown=all.length;while(shown>0&&el.scrollHeight>el.clientHeight+1){shown--;all[shown].hidden=true}
  /* "+N" อยู่มุมขวาล่างของช่องวัน ไม่เบียดหัวช่อง (วันที่ + ป้ายว่าง/เต็ม) ถ้าทับนัดสุดท้าย ซ่อนเพิ่มอีกหนึ่ง */
  if(shown<all.length&&kd){b=document.createElement('span');b.className='kmore3';kd.appendChild(b);
    const lab=()=>{b.textContent='+'+(all.length-shown);b.title=`อีก ${all.length-shown} นัด กดวันนี้เพื่อดูทั้งหมด`};lab();
    const last=all[shown-1];if(last){const a=last.getBoundingClientRect(),r=b.getBoundingClientRect();
      if(a.bottom>r.top-2){last.classList.add('kshort');const k=kd.getBoundingClientRect();b.style.top=(a.top-k.top+(a.height-r.height)/2)+'px';b.style.bottom='auto'}}}
});}
window.addEventListener('resize',()=>{if(route()==='queue')fitCal()});

/* ---------- ปฏิทินงานใหม่ (27 พ.ย.) · แบบ Google Calendar + คิวอื่น + ซิงก์ปฏิทิน Google ของทีม ----------
   งานโซลาร์ (สำรวจ/ติดตั้ง) มาจากงานในระบบ · คิวอื่น = กล่อง appts · ประเภท/หมวด = config/apptTypes (แอดมิน)
   นัดที่คนพิมพ์เองใน Google = ดูอย่างเดียว (สีเทา) · ส่งขึ้น Google ตาม config/gcal {on, from} */
const CV_GC=[['1','ลาเวนเดอร์','#7986cb'],['2','เซจ','#33b679'],['3','องุ่น','#8e24aa'],['4','ฟลามิงโก','#e67c73'],['5','กล้วย','#f6bf26'],['6','ส้ม','#f4511e'],['7','นกยูง','#039be5'],['8','กราไฟต์','#616161'],['9','บลูเบอร์รี่','#3f51b5'],['10','ใบโหระพา','#0b8043'],['11','มะเขือเทศ','#d50000']];
const CV_GCC=Object.fromEntries(CV_GC.map(g=>[g[0],g[2]]));
const CV_DEF={groups:[{id:'ev',n:'EV'},{id:'svc',n:'บริการ'},{id:'off',n:'ออฟฟิศ / อื่น ๆ'}],
  types:[{id:'evi',n:'ติดตั้ง/สำรวจ EV',c:'7',g:'ev'},{id:'evs',n:'เซอร์วิส EV',c:'9',g:'ev'},{id:'air',n:'ล้างแอร์/แผง',c:'6',g:'svc'},{id:'svc',n:'งานเซอร์วิส',c:'5',g:'svc'},{id:'fix',n:'ซ่อม',c:'4',g:'svc'},
   {id:'mtg',n:'ประชุม/อบรม',c:'8',g:'off'},{id:'shp',n:'ส่งของ/รับของ',c:'1',g:'off'},{id:'chk',n:'ตรวจงาน',c:'3',g:'off'},{id:'oth',n:'อื่น ๆ',c:'8',g:'off'}]};
const CV={off:null,col:null,q:'',who:'',hp:null,qc:null,tpo:null,tpq:'',maxl:4,px:40,cmp:false,g:{},gl:{},drag:null,pend:new Map(),fitting:0};
const cvT=()=>{const c=S.config&&S.config.apptTypes;return c&&Array.isArray(c.types)&&c.types.length?{groups:Array.isArray(c.groups)?c.groups:CV_DEF.groups,types:c.types}:CV_DEF};
const cvTY=()=>Object.fromEntries(cvT().types.map(t=>[t.id,t]));
const cvCfg=()=>(S.config&&S.config.gcal)||{};
const cvCanAp=()=>['admin','dispatch','sysadmin'].includes(S.me.role)||(!S.me.role&&!!S.me.owner);
const cvCanTy=()=>['admin','sysadmin'].includes(S.me.role)||(!S.me.role&&!!S.me.owner);
const cvMob=()=>innerWidth<=640;
const cvD=k=>new Date(k+'T00:00:00');
/* สัปดาห์เริ่มวันอาทิตย์แบบ Google Calendar → เดือนส่วนใหญ่เหลือ 5 แถว ตารางไม่ยืด (ผู้ใช้ 27 พ.ย. 17:18) */
const cvMon=k=>isoAdd(k,-cvD(k).getDay());
const cvDiff=(a,b)=>Math.round((cvD(b)-cvD(a))/864e5);
const cvH=tm=>{const m=String(tm||'').match(/(\d{1,2})[:.](\d{2})/);return m?+m[1]+m[2]/60:null};
const cvHm=h=>`${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round(h%1*60)).padStart(2,'0')}`;
const cvInk=h=>{const n=parseInt(String(h).slice(1),16);return (0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255))/255>0.66?'#16171d':'#fff'};
const TDS=['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
function cvOff(){if(!CV.off){let a=[];try{a=JSON.parse(localStorage.getItem('cl.cv.off')||'[]')}catch(e){}CV.off=new Set(Array.isArray(a)?a:[])}return CV.off}
/* หมวดในแถบซ้าย: ค่าเริ่มต้น = พับทุกหมวด (ผู้ใช้ 27 พ.ย. 17:14) · จำที่กางเองไว้ในเครื่อง */
function cvColSet(){if(!CV.col){let a=null;try{a=JSON.parse(localStorage.getItem('cl.cv.open')||'null')}catch(e){}const open=new Set(Array.isArray(a)?a:[]);CV.col=new Set(cvTree().map(g=>g.id).filter(id=>!open.has(id)))}return CV.col}
function cvSaveCol(){try{localStorage.setItem('cl.cv.open',JSON.stringify(cvTree().map(g=>g.id).filter(id=>!CV.col.has(id))))}catch(e){}}
function cvRailOff(){try{return localStorage.getItem('cl.cv.rail')==='0'}catch(e){return false}}
function cvSaveOff(){try{localStorage.setItem('cl.cv.off',JSON.stringify([...cvOff()]))}catch(e){}}
/* ---- รวมนัดทุกแหล่ง ---- */
function cvJobEvents(j){const out=[];if(['lost','cancelled'].includes(j.status))return out;const nm2=j.title||cOf(j).name||'ไม่มีชื่อไซต์';
  const sd=svDate(j);if(sd)out.push({id:'job:'+j.id+':s',src:'job',j,k:j.stage===ST.ACCEPT?'p':'s',d:sd,tm:j.queueTime||'',dur:1.5,n:nm2,who:[j.surveyor,...cvSplit(j.surveyHelpers)].filter(Boolean).join(' + ')});
  if(j.installDate&&(j.stage>=ST.INSREQ||j.status==='done')){const D=insDays(j);if(D.length)out.push({id:'job:'+j.id+':i',src:'job',j,k:'i',d:D[0],end:D.length>1?D[D.length-1]:'',n:nm2,who:j.installTeam||''})}
  return out}
/* รายชื่อทีมงานที่ไม่มีบัญชี เช่น ทีม EV (ผู้ใช้ 27 พ.ย. 20:17) · config/staff {list:[{id,n,team}]} · ไม่ส่งอะไรหาใคร แค่เป็นชื่อให้เลือก + ดูคิวรายคน */
const cvStaff=()=>{const c=S.config&&S.config.staff;return c&&Array.isArray(c.list)?c.list.filter(x=>x&&x.n):[]};
function cvPeople(){const out=[],seen=new Set();const add=(n,team)=>{n=String(n||'').trim();if(!n||seen.has(n))return;seen.add(n);out.push({n,team})};
  Object.values(S.members||{}).filter(m=>m&&m.name&&m.role!=='sales'&&!m.disabled).forEach(m=>add(m.name,m.role==='eng'?'วิศวกร':'ออฟฟิศ'));
  cvStaff().forEach(x=>add(x.n,x.team||'ทีมงาน'));return out}
const cvSplit=t=>String(t||'').split(/\s*[,+\/]\s*|\s+และ\s+/).map(x=>x.trim()).filter(Boolean);
function cvWho(e){if(e.src==='job')return e.k==='i'?[e.j.installTeam,e.j.supervisor].filter(Boolean):[e.j.surveyor,...cvSplit(e.j.surveyHelpers)].filter(Boolean);
  if(e.src==='ap')return (e.a.who||[]).slice();
  if(e.k==='g'){const hay=e.n+' '+(e.g&&e.g.desc||'');return cvPeople().map(p=>p.n).filter(n=>n.length>=2&&hay.includes(n))}return []}
/* คนนี้ติดนัดอื่นช่วงเดียวกันไหม (ไม่นับนัดที่กำลังแก้) */
/* ใครแก้คนไปด้วยได้: ตามสิทธิ์เดิมของตัวกลาง (แอดมินได้ก่อนส่งใบงาน · หลังจากนั้นหัวหน้าจัดงาน) */
const cvCanHelp=j=>S.me.role==='dispatch'||(cvCanAp()&&S.me.role!=='dispatch'&&(+j.stage||1)<=2);
/* หน้าตาคน (Frontend design 27 พ.ย. 20:26): วงกลมอักษรแรก สีตามทีม · แถบเวลา 7:00–20:00 ของวันนั้น เห็นช่องว่าง/ชนกันทันที */
const cvTeamC=t=>{const k=['7','2','5','9','1','6','11','4'];let h=0;for(const ch of String(t||''))h=(h*31+ch.charCodeAt(0))>>>0;return CV_GCC[k[h%k.length]]||'#667085'};
const cvIni=n=>{const s=String(n||'').replace(/^(พี่|น้อง|คุณ|ทีม)\s*/,'').trim(),a=[...s];return a.length?('เแโใไ'.includes(a[0])?a.slice(0,2).join(''):a[0]).toUpperCase():'?'};
const cvAv=(n,team)=>`<span class="cvav" style="--t:${cvTeamC(team)}" aria-hidden="true">${esc(cvIni(n))}</span>`;
function cvByWho(){const m=new Map();cvAll().forEach(e=>{if(e.k==='h')return;cvWho(e).forEach(n=>{if(!m.has(n))m.set(n,[]);m.get(n).push(e)})});return m}
const cvHit=(e,t1,t2)=>!e.tm||!t1||(cvH(e.tm)<cvH(t2)&&cvH(e.tm)+(e.dur||1)>cvH(t1));
/* ตัวเลือกคน แบบ "เพิ่มผู้เข้าร่วม" ของ Google Calendar (ผู้ใช้ 27 พ.ย. 21:10): ช่องเดียว พิมพ์หรือกดเพื่อเลือก
   รายการบอก ว่าง / ติดงาน · คนที่ติดงานในระบบช่วงนั้นเลือกไม่ได้ (กันจองซ้อน) · ชื่อที่ไม่มีในรายชื่อเพิ่มจากช่องเดียวกัน */
CV.pq='';CV.po='';CV.pka={};
function cvPkInfo(n,d,t1,t2,skip,BW){const L=(BW.get(n)||[]).filter(e=>e.id!==skip&&cvOn(e,d)&&cvHit(e,t1,t2)),hard=L.filter(e=>e.k!=='g'),b=hard[0]||L[0];
  return {b,hard:hard.length>0,why:b?(hard.length?'ติด ':'อาจติด ')+(b.tm||'ทั้งวัน')+' · '+b.n:''}}
function cvPkParts(sel,d,t1,t2,skip,attr,exclude){const P=cvPeople().filter(p=>p.n!==exclude),BW=cvByWho(),team=n=>(P.find(p=>p.n===n)||{}).team||'';
  const open=CV.po===attr,q=open?CV.pq.trim():'';
  const chosen=sel.map(n=>{const I=cvPkInfo(n,d,t1,t2,skip,BW);return `<div class="pkr">${cvAv(n,team(n))}<span class="pkn"><b>${esc(n)}</b><small class="${I.b?'x':''}">${esc(I.b?I.why:(team(n)||'ไม่มีในรายชื่อ')+' · ว่าง')}</small></span><button type="button" class="pkx" ${attr}="${esc(n)}" aria-label="เอา ${esc(n)} ออก">✕</button></div>`}).join('');
  let list='';if(open){const L=P.filter(p=>!sel.includes(p.n)&&(!q||p.n.toLowerCase().includes(q.toLowerCase())));const tms=[...new Set(L.map(p=>p.team))];
    list=`<div class="pkl" role="listbox">${tms.map(tm=>`<div class="pkg">${esc(tm)}</div>`+L.filter(p=>p.team===tm).map(p=>{const I=cvPkInfo(p.n,d,t1,t2,skip,BW);return `<button type="button" class="pko ${I.b?'b':''}" role="option" data-pkopt ${attr}="${esc(p.n)}" ${I.hard?'disabled':''}>${cvAv(p.n,p.team)}<b>${esc(p.n)}</b><small>${esc(I.b?I.why:'ว่าง')}</small></button>`}).join('')).join('')}${q&&!P.some(p=>p.n.toLowerCase().includes(q.toLowerCase()))&&!sel.includes(q)?`<button type="button" class="pko add" role="option" data-pkopt ${attr}="${esc(q.slice(0,40))}"><span class="pkplus">+</span><b>เพิ่ม “${esc(q)}”</b><small>ไม่มีในรายชื่อ</small></button>`:''}${!L.length&&!q?'<p class="cvnote">เลือกครบทุกคนแล้ว</p>':''}</div>`}
  return {chosen,list}}
function cvPick(...a){const attr=a[5];CV.pka[attr]=a;const {chosen,list}=cvPkParts(...a);
  return `<div class="pk" data-pk="${attr}"><div class="pkc">${chosen}</div><div class="pkin"><input class="pkq" data-pkq="${attr}" placeholder="+ เพิ่มคน · พิมพ์ชื่อ" value="${esc(CV.po===attr?CV.pq:'')}" autocomplete="off" aria-label="เพิ่มคน" aria-expanded="${CV.po===attr}"></div><div class="pkw">${list}</div></div>`}
/* วาดเฉพาะรายการ ไม่แตะช่องพิมพ์ (ไม่ให้เคอร์เซอร์หลุด/ป๊อปอัปปิด) */
function cvPkPaint(attr){const box=document.querySelector(`[data-pk="${attr}"]`),a=CV.pka[attr];if(!box||!a)return;const {list}=cvPkParts(...a);box.querySelector('.pkw').innerHTML=list;const x=box.querySelector('.pkq');if(x)x.setAttribute('aria-expanded',CV.po===attr)}
document.addEventListener('focusin',e=>{const t=e.target;if(t.dataset&&t.dataset.pkq&&CV.po!==t.dataset.pkq){const old=CV.po;CV.po=t.dataset.pkq;CV.pq=t.value;if(old)cvPkPaint(old);cvPkPaint(CV.po)}});
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.pkq){CV.po=t.dataset.pkq;CV.pq=t.value;cvPkPaint(CV.po)}});
document.addEventListener('click',e=>{const o=e.target.closest&&e.target.closest('[data-pkopt]');if(o){CV.pq='';CV.po='';return}
  const qi=e.target.dataset&&e.target.dataset.pkq;if(qi&&CV.po!==qi){const old=CV.po;CV.po=qi;CV.pq=e.target.value;if(old)cvPkPaint(old);cvPkPaint(qi);return}
  if(CV.po&&!(e.target.closest&&e.target.closest('.pk'))){const a=CV.po;CV.po='';CV.pq='';const x=document.querySelector(`[data-pkq="${a}"]`);if(x)x.value='';cvPkPaint(a)}},true);
document.addEventListener('keydown',e=>{const t=e.target,box=t.closest&&t.closest('.pk');if(!box)return;
  if(t.dataset.pkq&&e.key==='Enter'){e.preventDefault();e.stopPropagation();box.querySelector('.pko:not([disabled])')?.click()}
  else if(e.key==='Escape'&&CV.po){e.preventDefault();e.stopPropagation();const a=CV.po;CV.po='';CV.pq='';const x=box.querySelector('.pkq');if(x){x.value='';x.focus()}cvPkPaint(a)}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){const L=[...box.querySelectorAll('.pko:not([disabled])')];if(!L.length)return;e.preventDefault();const i=L.indexOf(document.activeElement);(e.key==='ArrowDown'?L[Math.min(L.length-1,i+1)]:i<=0?box.querySelector('.pkq'):L[i-1]).focus()}},true);
function cvApEvent(a){const TY=cvTY(),t=TY[a.ty]||TY.oth||{c:'8',n:'อื่น ๆ'};const e={id:'ap:'+a.id,src:'ap',a,k:'o',ty:TY[a.ty]?a.ty:(TY.oth?'oth':a.ty),c:a.c||t.c,d:a.d,end:a.end&&a.end>a.d?a.end:'',tm:a.tm||'',n:a.title||'(ไม่มีชื่อ)',who:(a.who||[]).join('+'),place:a.place||''};
  if(e.tm)e.dur=Math.max(.5,(cvH(a.tm2)||cvH(e.tm)+1)-cvH(e.tm));return e}
/* ลิงก์นัดที่พิมพ์ใน Google กับงานในรายการงาน (ผู้ใช้ 27 พ.ย. 19:20) · เก็บในกล่อง appts แบบ {link:true,gid,jobId} ไม่แตะตัวงาน */
const cvHash=t=>{let h=5381;for(const ch of String(t))h=((h<<5)+h+ch.charCodeAt(0))>>>0;return h.toString(36)};
function cvLinks(){const m={};Object.values(S.appts||{}).forEach(a=>{if(a&&a.link&&a.gid&&a.jobId)m[a.gid]={id:a.id,jobId:a.jobId,d:a.gd||'',end:a.gend||a.gd||''}});return m}
/* ยึดตาม Team EN (ผู้ใช้ 27 พ.ย. 19:31): นัดของงานที่ทับกับนัด Google ที่ลิงก์ไว้ → ซ่อน (และไม่ส่งขึ้น Google ซ้ำ) แสดงนัดของ Team EN แทน */
function cvCovers(){if(cvCovers.v===S.appts)return cvCovers.m;const m={};Object.values(cvLinks()).forEach(L=>{if(L.d)(m[L.jobId]=m[L.jobId]||[]).push(L)});cvCovers.v=S.appts;return cvCovers.m=m}
const cvCovered=(j,x)=>(cvCovers()[j.id]||[]).some(L=>x.d<=L.end&&cvEnd(x)>=L.d);
const cvJobShown=j=>cvJobEvents(j).filter(x=>!cvCovered(j,x));
function cvGEvents(){const out=[],LK=cvLinks();Object.values(CV.g).forEach(m=>{(m.ev||[]).forEach(g=>{const e={id:'g:'+g.id,src:'g',g,k:'g',d:g.d,end:g.end||'',tm:g.tm||'',dur:g.tm&&g.tm2?Math.max(.5,cvH(g.tm2)-cvH(g.tm)):1,n:g.n,by:g.by};
    const L=LK[g.id],j=L&&S.jobs[L.jobId];if(j){e.lj=j.id;e.lk=L.id;e.j=j;const ov=cvJobEvents(j).find(x=>x.d<=cvEnd(e)&&cvEnd(x)>=e.d);e.lkind=ov&&ov.k==='i'?'i':'s'}out.push(e)});
  (m.hol||[]).forEach(g=>out.push({id:'h:'+g.d+g.n,src:'g',g,k:'h',d:g.d,end:g.end||'',n:g.n}))});const seen=new Set();return out.filter(e=>!seen.has(e.id)&&seen.add(e.id))}
function cvAll(){const out=[];visibleJobs().forEach(j=>out.push(...cvJobShown(j)));Object.values(S.appts||{}).forEach(a=>{if(a&&a.d)out.push(cvApEvent(a))});out.push(...cvGEvents());return out}
const cvLay=e=>e.lj?e.lkind:e.k==='o'?e.ty:e.k==='p'?'s':e.k;
const cvGray=e=>false; /* เดิมนัดจาก Google เป็นกรอบเทา · ตอนนี้ใช้สีจริงของ Google */
/* สีตาม Google (ผู้ใช้ 27 พ.ย. 19:42): นัดจาก Google ใช้สีที่ตั้งใน Google (ไม่ตั้ง = สีปฏิทิน Tasks EN Team) · สำรวจ = องุ่น (ม่วง) ติดตั้ง = ใบโหระพา (เขียว) แบบที่ Team EN ใช้ */
const CV_SV='3',CV_IN='10',CV_GDEF='#d50000';
const cvCol=e=>e.k==='g'?(CV_GCC[e.g&&e.g.c]||CV_GDEF):e.k==='s'||e.k==='p'?CV_GCC[CV_SV]:e.k==='i'?CV_GCC[CV_IN]:e.k==='o'?(CV_GCC[e.c]||CV_GCC['8']):e.k==='h'?'#7a6a4f':'#98a2b3';
const cvLab=e=>e.lj?(e.lkind==='i'?'ติดตั้งโซลาร์':'สำรวจโซลาร์')+' · จาก Team EN':e.k==='g'?'จาก Google (Team EN)':e.k==='s'?'สำรวจโซลาร์':e.k==='p'?'สำรวจ · รอตอบรับคิว':e.k==='i'?'ติดตั้งโซลาร์':e.k==='g'?'พิมพ์เองใน Google':e.k==='h'?'วันหยุด':((cvTY()[e.ty]||{}).n||'คิวอื่น');
const cvEnd=e=>e.end||e.d;
const cvOn=(e,k)=>e.d<=k&&cvEnd(e)>=k;
function cvShown(e){if(cvOff().has(cvLay(e)))return false;if(CV.who&&!cvWho(e).includes(CV.who))return false;const q=CV.q.trim().toLowerCase();if(!q)return true;return (e.n+' '+(e.who||'')+' '+(e.place||'')).toLowerCase().includes(q)}
const cvSortT=L=>L.sort((a,b)=>(cvH(a.tm)??-1)-(cvH(b.tm)??-1));
function cvHol(k){return cvGEvents().find(e=>e.k==='h'&&cvOn(e,k))}
function cvCap(k){if(k<today())return null;const d=cvD(k);if(d.getDay()===0)return null;const cl=closedDays()[k];if(cl)return {t:'ปิดรับคิว',c:'off',why:cl};
  if(cvHol(k))return {t:'วันหยุด',c:'off'};const di=dayInfo(k);let left=di.left;
  if(halfGone(k,'pm'))return {t:'ปิดแล้ว',c:'off'};if(halfGone(k,'am'))left=Math.min(left,svHalfFree(k,'pm',di.L));
  return left<=0?{t:di.used?'เต็ม':'ไม่มีคน',c:di.used?'full':'off'}:{t:'ว่าง '+left,c:''}}
/* คิวว่างของช่วงเช้า/บ่าย (สูตรเดียวกับ taken ใน dayInfo): ทีมประจำที่ว่างในเวลานั้น − งานที่ยังไม่มีคนในช่วงนั้น */
function svHalfFree(k,h,L){const reg=SV_TEAMS.filter(t=>!SV_APPROVAL.includes(t));const un=L.filter(j=>!j.surveyTeam&&halfOf(j.queueTime)===h).length;
  return Math.max(0,...SLOTS.filter(t=>halfOf(t)===h&&!slotGone(k,t)).map(tm=>reg.filter(t=>!teamBlock(t,k,null,tm)).length-un))}
/* ---- ดึงนัดจาก Google (ทีละเดือนที่แสดง) ---- */
function cvGridRange(){const c=cvD(S.f.cvm||today().slice(0,8)+'01'),f=isoOf(new Date(c.getFullYear(),c.getMonth(),1));const s=cvMon(f);return [s,isoAdd(s,41)]}
function cvLoadG(force){if(!S.db||!S.db.call)return;const [a,b]=cvGridRange(),key=a;const cur=CV.gl[key];if(cur&&(cur.busy||(!force&&Date.now()-cur.at<120e3)))return;
  CV.gl[key]={busy:1,at:Date.now()};S.db.call('gcalList',{from:a,to:b}).then(r=>{CV.g[key]=r;CV.gl[key]={at:Date.now()};schedule()}).catch(e=>{CV.gl[key]={at:Date.now(),err:e&&e.code==='bad'&&/ไม่รู้จักคำสั่ง/.test(e.message||'')?'ตัวกลางยังเป็นรุ่นเก่า (ต้องอัปเดต Code.gs 1.2.17)':e&&e.message||'อ่านปฏิทิน Google ไม่ได้'};schedule()})}
/* ---- ส่งขึ้น Google ---- */
function cvDesc(lines,link){return lines.filter(Boolean).join('\n')+'\n\n— สร้างจากระบบ CLEANLINE · แก้ในระบบเท่านั้น'+(link?'\nเปิดในระบบ: '+link:'')}
const cvLink=h=>location.origin+location.pathname+'#'+h;
function cvItems(col,id){const cfg=cvCfg(),from=cfg.from||'9999';const out=[];
  if(col==='jobs'){const j=S.jobs[id];if(!j)return out;const c=cOf(j),s=sOf(j);const sale=j.salesPerson||j.salesTeam||'';
    cvJobShown(j).forEach(e=>{if(cvEnd(e)<from)return;const it={key:e.id,d:e.d,c:e.k==='i'?CV_IN:CV_SV};
      if(e.k==='i'){it.n='ติดตั้ง · '+e.n+(j.installTeam?' · '+j.installTeam:'');if(e.end)it.end=e.end;it.desc=cvDesc([j.installTeam&&'ทีมติดตั้ง: '+j.installTeam,j.supervisor&&'ผู้คุมงาน: '+j.supervisor,c.phone&&'โทร: '+c.phone,placeOf(j,s,c)&&'สถานที่: '+placeOf(j,s,c),s.map&&'แผนที่: '+s.map],cvLink('job-'+j.id))}
      else{/* หัวข้อแบบที่ทีมใช้ (ผู้ใช้ 27 พ.ย. 20:05): Survey Solar คุณ{ลูกค้า} ({ทีมเซลส์}) {ชื่อเซลส์} */const cn=String(c.name||[c.firstName,c.lastName].filter(Boolean).join(' ')||'').trim().replace(/^คุณ\s*/,'');it.n=['Survey Solar',cn?'คุณ'+cn:e.n,j.salesTeam?'('+j.salesTeam+')':'',j.salesPerson||''].filter(Boolean).join(' ');const hp=cvSplit(j.surveyHelpers);if(hp.length)it.n+=' + '+hp.join(', ');if(e.tm&&cvH(e.tm)!=null){it.tm=cvHm(cvH(e.tm));it.tm2=cvHm(Math.min(23.5,cvH(e.tm)+1.5))}
        it.desc=cvDesc([j.surveyor&&'คนสำรวจ: '+j.surveyor,hp.length&&'คนไปด้วย: '+hp.join(', '),c.phone&&'โทร: '+c.phone,placeOf(j,s,c)&&'สถานที่: '+placeOf(j,s,c),s.map&&'แผนที่: '+s.map],cvLink('job-'+j.id))}
      out.push(it)})}
  else{const a=(S.appts||{})[id];if(!a||a.link||a.nolink||!a.d||a.gs===false)return out;const e=cvApEvent(a);if(cvEnd(e)<from)return out;const t=cvTY()[e.ty]||{n:'อื่น ๆ'};
    const it={key:e.id,d:e.d,c:e.c,n:`[${t.n}] ${e.n}${e.place?' · '+e.place:''}`,desc:cvDesc([e.who&&'คนไป: '+e.who,a.tel&&'โทร: '+a.tel,a.map&&'แผนที่: '+a.map,a.note&&'หมายเหตุ: '+a.note])};
    if(e.tm){it.tm=cvHm(cvH(e.tm));it.tm2=a.tm2||cvHm(cvH(e.tm)+1)}else if(e.end)it.end=e.end;out.push(it)}
  return out}
function cvMark(path){const [col,id]=String(path).split('/');if((col!=='jobs'&&col!=='appts')||!id)return;if(!cvCfg().on||!cvCanAp()||!S.db||!S.db.call)return;CV.pend.set(col+'/'+id,Date.now());clearTimeout(CV.pt);CV.pt=setTimeout(cvFlush,4000)}
async function cvFlush(){if(!CV.pend.size)return;const L=[...CV.pend.keys()];CV.pend.clear();const items=[],scope=[];
  L.forEach(p=>{const [col,id]=p.split('/');scope.push((col==='jobs'?'job:':'ap:')+id);items.push(...cvItems(col,id))});
  try{const r=await S.db.call('gcalSync',{items,scope});if(r&&r.err&&r.err.length)toast('ส่งขึ้น Google ไม่ครบ: '+r.err[0]);else if(r&&(r.put||r.del))CV.gl={}}
  catch(e){toast('ส่งนัดขึ้น Google ไม่ได้: '+(e&&e.message||'ลองอีกครั้ง'))}}
async function cvSyncAll(){if(!cvCfg().on)return toast('เปิด “ส่งขึ้น Google” และตั้งวันเริ่มก่อน');const all=[];Object.keys(S.jobs).forEach(id=>all.push(...cvItems('jobs',id)));Object.keys(S.appts||{}).forEach(id=>all.push(...cvItems('appts',id)));
  toast('กำลังส่ง '+all.length+' นัดขึ้น Google…');let put=0,del=0;
  try{for(let i=0;i<all.length;i+=40){const r=await S.db.call('gcalSync',{items:all.slice(i,i+40)});put+=r.put||0}
    const r=await S.db.call('gcalSync',{items:[],prune:all.map(x=>x.key)});del=r.del||0;CV.gl={};toast(`ซิงก์แล้ว · อัปเดต ${put} · ลบ ${del}`);cvLoadG(true)}
  catch(e){toast('ซิงก์ไม่สำเร็จ: '+(e&&e.message||''))}}
/* ---- หน้า ---- */
function viewCal(){
  if(!S.loaded.jobs)return '<div class="card empty">กำลังโหลด…</div>';
  const mob=cvMob(),t=today();if(!S.f.cvm)S.f.cvm=t.slice(0,8)+'01';if(!S.f.qsel)S.f.qsel=t;const sel=S.f.qsel,v=S.f.cv||'month',mv=S.f.cvmv||'list';
  cvLoadG();const cur=cvD(S.f.cvm),w0=cvMon(sel),w6=isoAdd(w0,6);
  const title=mob&&mv==='list'?`${TMF[cvD(sel).getMonth()]} ${cvD(sel).getFullYear()+543}`:(!mob&&v==='week')?`${cvD(w0).getDate()} ${TM[cvD(w0).getMonth()]} – ${cvD(w6).getDate()} ${TM[cvD(w6).getMonth()]} ${cvD(w6).getFullYear()+543}`:`${TMF[cur.getMonth()]} ${cur.getFullYear()+543}`;
  const seg=mob?[['list','รายการ'],['month','เดือน']].map(([k,x])=>`<button class="${mv===k?'on':''}" data-cvmv="${k}" aria-pressed="${mv===k}">${x}</button>`).join(''):[['month','เดือน'],['week','สัปดาห์']].map(([k,x])=>`<button class="${v===k?'on':''}" data-cvv="${k}" aria-pressed="${v===k}">${x}</button>`).join('');
  const body=mob?cvMobile():v==='week'?cvWeek():cvMonth();
  const bk=!!S.cvBk&&cvCanBk(),nr=cvRailOff()||bk;
  return `<div class="cvw ${nr?'norail':''} ${bk?'bk':''}" id="cvw"><h1 class="sr">ปฏิทินงาน</h1>
   <div class="cvtb">${mob?'':`<button class="ib cvrt" data-cvrail aria-pressed="${!nr}" aria-label="${nr?'แสดง':'ซ่อน'}แถบซ้าย" title="${nr?'แสดง':'ซ่อน'}แถบซ้าย">${svg('list','currentColor',2)}</button>`}${!mob&&cvCanAp()?`<button class="btn sm pri cvnew2" data-cvnew="${sel<t?t:sel}">+ สร้างนัด</button>`:''}${!mob&&cvCanBk()?`<button class="btn sm cvbk2 ${S.cvBk?'on':''}" data-cvbk="${(S.nf||{}).date||(sel<t?t:sel)}" aria-pressed="${!!S.cvBk}"><i style="background:${CV_GCC[CV_SV]}"></i>จองคิวสำรวจโซลาร์</button>`:''}<button class="btn sm" data-cvtoday>วันนี้</button><button class="ib" data-cvstep="-1" aria-label="ก่อนหน้า">${svg('chev','currentColor',2)}</button><button class="ib nx" data-cvstep="1" aria-label="ถัดไป">${svg('chev','currentColor',2)}</button>
     <h2 class="cvtt">${title}</h2>${CV.who?`<button class="cvwhoc" data-cvwho="${esc(CV.who)}" aria-label="ดูนัดทุกคน">${cvAv(CV.who,(cvPeople().find(p=>p.n===CV.who)||{}).team)}คิวของ <b>${esc(CV.who)}</b><span aria-hidden="true">✕</span></button>`:''}<span class="cvsp"></span>${cvGStat()}
     <label class="cvsr">${svg('search','currentColor',2)}<input id="cvq" placeholder="ค้นหานัด ชื่อลูกค้า" value="${esc(CV.q)}" aria-label="ค้นหานัด"></label>
     <div class="seg cvseg" role="group" aria-label="มุมมอง">${seg}</div>${mob&&cvCanAp()?`<button class="btn sm pri" data-cvnew="${sel<t?t:sel}">+ สร้าง</button>`:''}</div>
   <div class="cvb"><aside class="cvrail">${cvCanAp()?`<button class="cvcreate" data-cvnew="${sel<t?t:sel}"><b>+</b>สร้างนัด</button>`:''}${cvMini()}${cvLayers()}${cvPplRail()}</aside>
   <section class="card cvmain">${bk?body.replace(`data-cvcell="${(S.nf||{}).date}"`,`data-cvcell="${(S.nf||{}).date}" data-bksel="1"`):body}</section>${bk?cvBkPanel():''}</div></div>`;
}
function cvGStat(){const [a]=cvGridRange(),st=CV.gl[a]||{};const cfg=cvCfg();
  if(st.err)return `<span class="cvgs err" title="${esc(st.err)}">${svg('warn','currentColor',2)}Google: อ่านไม่ได้</span>`;
  if(st.busy)return '<span class="cvgs">Google: กำลังโหลด…</span>';
  return `<span class="cvgs ${cfg.on?'ok':''}" title="${cfg.on?'จองในเว็บแล้วส่งขึ้น Google Calendar ของทีม ตั้งแต่ '+esc(fd(cfg.from||'')):'ยังไม่ได้เปิดส่งขึ้น Google'}">${cfg.on?'● ส่งขึ้น Google แล้ว':'○ ยังไม่ส่งขึ้น Google'}</span>`}
function cvMini(){const cur=cvD(S.f.cvm),y=cur.getFullYear(),m=cur.getMonth(),first=isoOf(new Date(y,m,1)),st=cvMon(first),nW=Math.ceil((cvDiff(st,first)+new Date(y,m+1,0).getDate())/7);
  const has=new Set();cvAll().forEach(e=>{if(cvShown(e)&&e.k!=='h')for(let k=e.d;k<=cvEnd(e)&&k<=isoAdd(st,nW*7);k=isoAdd(k,1))has.add(k)});const t=today();
  return `<div class="cvmini"><div class="cvmh"><b>${TMF[m]} ${y+543}</b><span><button data-cvmn="-1" aria-label="เดือนก่อน">‹</button><button data-cvmn="1" aria-label="เดือนถัดไป">›</button></span></div>
  <div class="cvmg">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(x=>`<span>${x}</span>`).join('')}${[...Array(nW*7)].map((_,i)=>{const k=isoAdd(st,i);return `<button class="${cvD(k).getMonth()!==m?'o':''} ${k===t?'t':''} ${k===S.f.qsel?'s':''} ${has.has(k)?'dt':''}" data-cvjump="${k}" aria-label="${fd(k)}">${cvD(k).getDate()}</button>`}).join('')}</div></div>`}
function cvTree(){const T=cvT();return [{id:'sol',n:'โซลาร์',items:[['s','สำรวจโซลาร์',CV_GCC[CV_SV]],['i','ติดตั้งโซลาร์',CV_GCC[CV_IN]]]},
  ...T.groups.map(g=>({id:g.id,n:g.n,items:T.types.filter(t=>t.g===g.id).map(t=>[t.id,t.n,CV_GCC[t.c]||CV_GCC['8']])})),
  ...(T.types.some(t=>!T.groups.some(g=>g.id===t.g))?[{id:'_x',n:'ไม่มีหมวด',items:T.types.filter(t=>!T.groups.some(g=>g.id===t.g)).map(t=>[t.id,t.n,CV_GCC[t.c]||CV_GCC['8']])}]:[]),
  {id:'goo',n:'จาก Google',items:[['g','พิมพ์เองใน Google',CV_GDEF],['h','วันหยุดในไทย','#7a6a4f']]}]}
function cvLayers(){const off=cvOff(),cm=cvD(S.f.cvm).getMonth(),ev=cvAll();const cnt=k=>ev.filter(e=>cvLay(e)===k&&cvD(e.d).getMonth()===cm).length;
  const row=([k,n,c])=>`<label class="cvly"><input type="checkbox" data-cvlay="${esc(k)}" ${off.has(k)?'':'checked'} style="--c:${c}"><span>${esc(n)}</span><small>${cnt(k)}</small></label>`;
  return `<div class="cvlays"><div class="cvlh"><b>หมวดงาน</b>${cvCanTy()?'<button class="cvmt" data-cvmt>จัดการประเภท</button>':''}</div>${cvTree().map(g=>{const on=g.items.filter(i=>!off.has(i[0])).length,all=g.items.length,c=g.items.reduce((a,i)=>a+cnt(i[0]),0),cl=cvColSet().has(g.id);
    return `<div class="cvbr"><div class="cvbrh"><button class="cvcar ${cl?'cl':''}" data-cvcol="${esc(g.id)}" aria-expanded="${!cl}" aria-label="${cl?'กาง':'พับ'}หมวด ${esc(g.n)}">▾</button><label class="cvly g"><input type="checkbox" data-cvgrp="${esc(g.id)}" ${on===all&&all?'checked':''} data-ind="${on>0&&on<all?1:''}" style="--c:#16171d"><span>${esc(g.n)}</span><small>${c}</small></label></div>
    ${cl?'':`<div class="cvbrc">${g.items.map(row).join('')||'<p class="cvnote">ยังไม่มีประเภท</p>'}</div>`}</div>`}).join('')}<p class="cvnote">สีของนัดตรงกับใน Google · นัดที่มีคนพิมพ์เองใน Google กดดูหรือลิงก์กับงานได้</p></div>`}
function cvPplRail(){const sel=S.f.qsel||today(),w0=cvMon(sel),days=[...Array(7)].map((_,i)=>isoAdd(w0,i)),t=today();const P=cvPeople(),BW=cvByWho(),open=CV.pplo??(()=>{try{return localStorage.getItem('cl.cv.ppl')==='1'}catch(x){return false}})();
  const teams=[...new Set(P.map(p=>p.team))],w6=days[6];
  const row=p=>{const L=BW.get(p.n)||[],c=days.map(k=>L.filter(e=>cvOn(e,k)).length),tot=c.reduce((a,b)=>a+b,0),on=CV.who===p.n;
    return `<button class="cvpr ${on?'on':''}" data-cvwho="${esc(p.n)}" aria-pressed="${on}" aria-label="คิวของ ${esc(p.n)} สัปดาห์นี้ ${tot} นัด">${cvAv(p.n,p.team)}<span class="cvprn">${esc(p.n)}</span><span class="cvpd">${days.map((k,i)=>`<i class="${c[i]>=2?'n2':c[i]?'n1':''} ${k===t?'t':''}" title="${fd(k)}: ${c[i]?c[i]+' นัด':'ว่าง'}"></i>`).join('')}</span></button>`};
  return `<div class="cvlays cvppr"><div class="cvlh"><button class="cvcar ${open?'':'cl'}" data-cvpplo aria-expanded="${open}" aria-label="${open?'พับ':'กาง'}คิวรายคน">▾</button><b>คิวรายคน</b>${open?`<small class="cvprw">${cvD(w0).getDate()}–${cvD(w6).getDate()} ${TM[cvD(w6).getMonth()]}</small>`:''}</div>
  ${open?(P.length?`<div class="cvprd"><span></span><span class="cvpd">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(x=>`<em>${x}</em>`).join('')}</span></div>`+teams.map(tm=>`<div class="cvprg"><i style="background:${cvTeamC(tm)}"></i>${esc(tm)}</div>`+P.filter(p=>p.team===tm).map(row).join('')).join(''):'<p class="cvnote">ยังไม่มีรายชื่อ</p>')+(cvCanTy()?'<button class="cvmt cvpre" data-cvmt>แก้รายชื่อทีมงาน</button>':''):''}</div>`}
function cvLanes(w0,w6,ev){const bars=ev.filter(e=>!e.tm&&e.d<=w6&&cvEnd(e)>=w0).sort((a,b)=>a.d.localeCompare(b.d)||cvDiff(b.d,cvEnd(b))-cvDiff(a.d,cvEnd(a)));
  const lanes=[];bars.forEach(e=>{const s=e.d<w0?w0:e.d,en=cvEnd(e)>w6?w6:cvEnd(e);let li=lanes.findIndex(L=>L.every(o=>o.en<s||o.s>en));if(li<0){lanes.push([]);li=lanes.length-1}lanes[li].push({e,s,en})});return lanes}
const cvAg=e=>e.src==='job'||e.lj?agCls(e.j):'';
const cvDrag=e=>e.src==='ap'&&cvCanAp();
function cvRow(e){const c=cvCol(e);return `<button class="cvev ${cvGray(e)?'gx':''} ${e.lj?'lk':''} ${e.k==='p'?'pe':''} ${cvAg(e)}" data-cvev="${esc(e.id)}" ${cvDrag(e)?'draggable="true"':''} title="${esc(cvLab(e)+' · '+(e.tm||'')+' '+e.n)}"><i class="${cvGray(e)?'g':''}" style="background:${c}"></i>${e.tm?`<b>${esc(e.tm)}</b>`:''}<span>${esc(e.n)}</span></button>`}
function cvBar(e,w0,w6,col,row,span){const c=cvCol(e),n=cvDiff(e.d,cvEnd(e))+1;return `<button class="cvbar ${e.d<w0?'cl':''} ${cvEnd(e)>w6?'cr':''} ${cvGray(e)?'gx':''} ${e.lj?'lk':''} ${cvAg(e)}" style="grid-column:${col}/span ${span};grid-row:${row};background:${cvGray(e)?'#fff':c};color:${cvGray(e)?'#475467':cvInk(c)}" data-cvev="${esc(e.id)}" ${cvDrag(e)?'draggable="true"':''} title="${esc(cvLab(e)+' · '+e.n)}">${esc(e.n)}${n>1&&e.k==='i'?` <em>(${n} วัน)</em>`:''}</button>`}
function cvMonth(){
  const cur=cvD(S.f.cvm),y=cur.getFullYear(),m=cur.getMonth(),first=isoOf(new Date(y,m,1)),st=cvMon(first),nW=Math.ceil((cvDiff(st,first)+new Date(y,m+1,0).getDate())/7);
  const ev=cvAll().filter(cvShown),t=today(),MAXL=CV.maxl||4;let html='';
  for(let w=0;w<nW;w++){const w0=isoAdd(st,w*7),w6=isoAdd(w0,6),days=[...Array(7)].map((_,i)=>isoAdd(w0,i));const lanes=cvLanes(w0,w6,ev),nl=Math.min(lanes.length,Math.max(0,MAXL-1));
    const bg=days.map(k=>{const c=cvCap(k);return `<div data-cvcell="${k}" class="${cvD(k).getMonth()!==m?'o':''} ${cvD(k).getDay()===0?'sun':''} ${k<t?'past':''} ${c&&c.c==='full'?'full':''} ${k===S.f.qsel?'sel':''}"></div>`}).join('');
    let fg=days.map((k,i)=>{const c=cvCap(k);return `<div class="cvdh ${cvD(k).getMonth()!==m?'o':''} ${k===t?'t':''}" style="grid-column:${i+1};grid-row:1"><button class="cvdn" data-cvday="${k}" aria-label="ดูทั้งวัน ${fd(k)}">${cvD(k).getDate()===1?TM[cvD(k).getMonth()]+' ':''}${cvD(k).getDate()}</button>${c?`<span class="cvcap ${c.c}" title="คิวสำรวจ${c.why?' · '+esc(c.why):''}">${c.t}</span>`:''}</div>`}).join('');
    lanes.slice(0,nl).forEach((L,li)=>L.forEach(({e,s,en})=>{fg+=cvBar(e,w0,w6,cvDiff(w0,s)+1,li+2,cvDiff(s,en)+1)}));
    fg+=days.map((k,i)=>{const L=cvSortT(ev.filter(e=>e.tm&&e.d===k));const hb=lanes.slice(nl).flat().filter(o=>o.s<=k&&o.en>=k).length;const room=Math.max(1,MAXL-nl);const sh=L.length+hb>room?L.slice(0,room-1):L;const more=L.length-sh.length+hb;
      return `<div class="cvdl" style="grid-column:${i+1};grid-row:${nl+2}">${sh.map(cvRow).join('')}${more?`<button class="cvmore" data-cvday="${k}">${sh.length||nl?'อีก ':''}${more} รายการ</button>`:''}</div>`}).join('');
    html+=`<div class="cvwk"><div class="cvbg">${bg}</div><div class="cvfg">${fg}</div></div>`}
  return `<div class="cvmo ${CV.cmp?'cmp':''}"><div class="cvwd">${['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์'].map(x=>`<div>${x}</div>`).join('')}</div><div class="cvwks">${html}</div></div>`}
function cvWeek(){const w0=cvMon(S.f.qsel),w6=isoAdd(w0,6),days=[...Array(7)].map((_,i)=>isoAdd(w0,i)),H0=7,H1=20,PX=CV.px||40,t=today();const ev=cvAll().filter(cvShown);
  const gc='56px repeat(7,minmax(0,1fr))';const lanes=cvLanes(w0,w6,ev);
  let all='<div class="cvalb">ทั้งวัน</div>';lanes.forEach((L,li)=>L.forEach(({e,s,en})=>{all+=cvBar(e,w0,w6,cvDiff(w0,s)+2,li+1,cvDiff(s,en)+1)}));if(!lanes.length)all+='<div style="grid-column:2/-1;height:22px"></div>';
  const nowH=new Date().getHours()+new Date().getMinutes()/60;
  const cols=days.map(k=>{const L=cvSortT(ev.filter(e=>e.tm&&e.d===k&&cvH(e.tm)!=null));const ends=[];const pos=L.map(e=>{const s=Math.max(H0,cvH(e.tm)),en=Math.min(H1,s+(e.dur||1));let c=ends.findIndex(x=>x<=s);if(c<0){ends.push(en);c=ends.length-1}else ends[c]=en;return {e,s,en,c}});const nc=Math.max(1,ends.length);
    return `<div class="cvcol ${cvD(k).getDay()===0?'sun':''} ${k<t?'past':''}" data-cvwcol="${k}" style="height:${(H1-H0)*PX}px">${pos.map(({e,s,en,c})=>{const cc=cvCol(e);return `<button class="cvtev ${cvGray(e)?'gx':''} ${cvAg(e)}" data-cvev="${esc(e.id)}" style="top:${(s-H0)*PX+1}px;height:${Math.max(18,(en-s)*PX-3)}px;left:calc(${c/nc*100}% + 2px);width:calc(${100/nc}% - 5px);background:${cvGray(e)?'#fff':cc};color:${cvGray(e)?'#475467':cvInk(cc)}"><b>${esc(e.n)}</b><span>${cvHm(s)}–${cvHm(en)}${e.who?' · '+esc(e.who):''}</span></button>`}).join('')}${k===t&&nowH>=H0&&nowH<H1?`<i class="cvnow" style="top:${(nowH-H0)*PX}px"></i>`:''}</div>`}).join('');
  return `<div class="cvwv" style="--px:${PX}px"><div class="cvwh" style="grid-template-columns:${gc}"><div></div>${days.map(k=>{const c=cvCap(k);return `<button class="${k===t?'t':''}" data-cvday="${k}"><small>${TDS[cvD(k).getDay()]}</small><b>${cvD(k).getDate()}</b><em class="${c?c.c:''}">${c?c.t:'&nbsp;'}</em></button>`}).join('')}</div>
   <div class="cvwa" style="grid-template-columns:${gc}">${all}</div>
   <div class="cvwb" style="grid-template-columns:${gc}"><div class="cvhrs" style="height:${(H1-H0)*PX}px">${[...Array(H1-H0)].map((_,i)=>i?`<span style="top:${i*PX}px">${String(H0+i).padStart(2,'0')}:00</span>`:'').join('')}</div>${cols}</div></div>`}
function cvMobile(){const sel=S.f.qsel,t=today(),mv=S.f.cvmv||'list',ev=cvAll().filter(cvShown);const dots=k=>ev.filter(e=>cvOn(e,k)).slice(0,4).map(e=>`<i style="background:${cvGray(e)?'#c4c9d2':cvCol(e)}"></i>`).join('');
  let top;if(mv==='list'){const w0=cvMon(sel);top=`<div class="cvstrip">${[...Array(7)].map((_,i)=>{const k=isoAdd(w0,i);return `<button class="${k===t?'t':''} ${k===sel?'s':''}" data-cvjump="${k}"><small>${TDS[cvD(k).getDay()]}</small><b>${cvD(k).getDate()}</b><span>${dots(k)}</span></button>`}).join('')}</div>`}
  else{const cur=cvD(S.f.cvm),y=cur.getFullYear(),m=cur.getMonth(),first=isoOf(new Date(y,m,1)),st=cvMon(first),nW=Math.ceil((cvDiff(st,first)+new Date(y,m+1,0).getDate())/7);
    top=`<div class="cvmm">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(x=>`<span>${x}</span>`).join('')}${[...Array(nW*7)].map((_,i)=>{const k=isoAdd(st,i);return `<button class="${cvD(k).getMonth()!==m?'o':''} ${k===t?'t':''} ${k===sel?'s':''}" data-cvjump="${k}"><b>${cvD(k).getDate()}</b><span>${dots(k)}</span></button>`}).join('')}</div>`}
  const n=mv==='list'?14:1;let ag='';
  for(let i=0;i<n;i++){const k=isoAdd(sel,i);const L=cvSortT(ev.filter(e=>cvOn(e,k)));if(!L.length&&k!==t&&k!==sel)continue;const c=cvCap(k);
    ag+=`<div class="cvag ${k===t?'t':''}"><div class="cvagd"><small>${TDS[cvD(k).getDay()]}</small><b>${cvD(k).getDate()}</b></div><div class="cvagl">${c?`<span class="cvcap ${c.c}">คิวสำรวจ ${c.t}</span>`:''}
      ${L.length?L.map(e=>{const c2=cvCol(e);return `<button class="cvagi ${cvGray(e)?'gx':''} ${cvAg(e)}" data-cvev="${esc(e.id)}" style="background:${cvGray(e)?'#fff':c2};color:${cvGray(e)?'#475467':cvInk(c2)}"><b>${esc(e.n)}</b>${e.tm?esc(e.tm)+'–'+cvHm(Math.min(23.9,cvH(e.tm)+(e.dur||1))):e.end?'ทั้งวัน · วันที่ '+(cvDiff(e.d,k)+1)+'/'+(cvDiff(e.d,e.end)+1):'ทั้งวัน'}${e.who?' · '+esc(e.who):''} · ${esc(cvLab(e))}</button>`}).join(''):`<span class="cvnote">ไม่มีนัด${cvCanAp()&&k>=t?' · แตะ “+ สร้าง” เพื่อเพิ่ม':''}</span>`}</div></div>`}
  return `<div class="cvmob">${top}<div class="cvags">${ag}</div></div>`}
/* ---- กล่องลอย (popover) ---- */
function cvPopEl(){let p=document.getElementById('cvpop');if(!p){p=document.createElement('div');p.id='cvpop';p.className='cvpop';p.setAttribute('role','dialog');document.body.appendChild(p)}return p}
function cvOpen(html,anchor,cls){const p=cvPopEl(),was=p.classList.contains('show');p.innerHTML=html;p.className='cvpop show'+(cls?' '+cls:'');
  if(!anchor&&was){cvClamp(p);const f=p.querySelector('#cvtps')||p.querySelector('#cvls')||p.querySelector('[autofocus]');if(f){f.focus();try{const n=f.value.length;f.setSelectionRange(n,n)}catch(e){}}return}
  if(cvMob()){p.style.left='';p.style.top='';}else{const r=anchor?anchor.getBoundingClientRect():{left:innerWidth/2-200,right:innerWidth/2+200,top:160,bottom:200};const pw=p.offsetWidth,ph=p.offsetHeight;
    let x=r.right+8;if(x+pw>innerWidth-10)x=r.left-pw-8;if(x<10)x=Math.max(10,(innerWidth-pw)/2);let y=r.top-20;y=Math.max(10,Math.min(y,innerHeight-ph-10));p.style.left=x+'px';p.style.top=y+'px';cvClamp(p)}
  const f=p.querySelector('[autofocus]');if(f)f.focus()}
function cvClamp(p){if(cvMob())return;const ph=p.offsetHeight,top=parseFloat(p.style.top)||10;if(ph>innerHeight-20)p.classList.add('scroll');const h=Math.min(ph,innerHeight-20);if(top+h>innerHeight-10)p.style.top=Math.max(10,innerHeight-h-10)+'px'}
function cvClose(){const p=document.getElementById('cvpop');if(p)p.className='cvpop';CV.qc=null;CV.tpo=null}
function cvFind(id){return cvAll().find(e=>e.id===id)}
function cvEvPop(id,anchor){const e=cvFind(id);if(!e)return;const c=cvCol(e);
  let h=`<div class="cvph"><span class="cvpill" style="--c:${cvGray(e)?'#475467':c}">● ${esc(cvLab(e))}</span><button class="cvx" data-cvclose aria-label="ปิด">✕</button></div><h3>${esc(e.n)}</h3>
  <dl class="cvkv"><dt>วันเวลา</dt><dd>${e.end?fd(e.d)+' – '+fd(e.end)+' · ทั้งวัน':fd(e.d)+' · '+(e.tm?esc(e.tm)+(e.dur?'–'+cvHm(Math.min(23.9,cvH(e.tm)+e.dur)):''):'ทั้งวัน')}</dd>${e.src==='job'&&e.k!=='i'?`<dt>คนสำรวจ</dt><dd>${esc(e.j.surveyor||'—')}</dd><dt>คนไปด้วย</dt><dd>${esc(cvSplit(e.j.surveyHelpers).join(', ')||'—')}${cvCanHelp(e.j)?` <button class="cvlk2" data-cvhelp="${esc(e.j.id)}">แก้</button>`:''}</dd>`:e.who?`<dt>${e.k==='i'?'ทีมติดตั้ง':'คนไป'}</dt><dd>${esc(e.who)}</dd>`:''}${e.place?`<dt>สถานที่</dt><dd>${esc(e.place)}</dd>`:''}${e.a&&e.a.tel?`<dt>โทร</dt><dd>${esc(e.a.tel)}</dd>`:''}${e.a&&safeUrl(e.a.map)?`<dt>แผนที่</dt><dd><a href="${esc(safeUrl(e.a.map))}" target="_blank" rel="noopener">เปิด Google Maps</a></dd>`:''}${e.a&&e.a.note?`<dt>หมายเหตุ</dt><dd>${esc(e.a.note)}</dd>`:''}${e.by?`<dt>คนพิมพ์</dt><dd>${esc(e.by)}</dd>`:''}${e.g&&e.g.desc?`<dt>รายละเอียด</dt><dd class="cvdesc">${esc(e.g.desc)}</dd>`:''}</dl>`;
  const on=cvCfg().on;
  if(e.k==='h')h+=`<div class="cvbox g">วันหยุดจากปฏิทิน Google${cvCap(e.d)&&!closedDays()[e.d]&&cvCanTy()?' · ถ้าไม่รับคิวสำรวจวันนี้ กด “ปิดรับคิว” ในหน้าวัน':''}</div>`;
  else if(e.k==='g'&&e.lj){const j=e.j;h+=`<div class="cvbox ok">ลิงก์กับงาน <b>${esc(j.title||cOf(j).name||'')}</b> · ${esc((STAGES[j.stage]||{}).name||'')}${j.jobNo?' · '+esc(j.jobNo):''}</div><div class="cvmf">${cvCanAp()?`<button class="btn sm" data-cvunl="${esc(e.lk)}">ยกเลิกลิงก์</button>`:''}<button class="btn sm pri" data-osel="${esc(j.id)}" data-cvgo>เปิดหน้างาน</button></div>`}
  else if(e.k==='g')h+=`<div class="cvbox g">มีคนพิมพ์ลง Google เอง ระบบแสดงให้ดูอย่างเดียว · จะแก้ต้องแก้ใน Google</div>${cvCanAp()?`<div class="cvmf"><button class="btn sm" data-cvconv="${esc(e.id)}">ทำเป็นคิวอื่น</button><button class="btn sm pri" data-cvlink="${esc(e.id)}">ลิงก์กับงานในระบบ</button></div>`:''}`;
  else if(e.src==='job')h+=`<div class="cvbox ${on?'ok':'g'}">${on?'อยู่ใน Google ของทีมด้วย · ':''}เปลี่ยนวันได้ที่หน้างาน</div><div class="cvmf"><button class="btn sm pri" data-osel="${esc(e.j.id)}" data-cvgo>เปิดหน้างาน</button></div>`;
  else h+=`<div class="cvbox ${on&&e.a.gs!==false?'ok':'g'}">${on&&e.a.gs!==false?'อยู่ใน Google ของทีมด้วย · ':''}${cvCanAp()?'ลากไปวางวันอื่นได้':''}</div>${cvCanAp()?`<div class="cvmf"><button class="btn sm" data-cvdel="${esc(e.a.id)}">ยกเลิกคิว</button><button class="btn sm pri" data-cvedit="${esc(e.a.id)}">แก้ไข</button></div>`:''}`;
  cvOpen(h,anchor)}
function cvDayPop(k,anchor){const L=cvSortT(cvAll().filter(e=>cvShown(e)&&cvOn(e,k)));const c=cvCap(k),cl=closedDays()[k],adm=cvCanTy();const t=today();
  const di=k>=t&&cvD(k).getDay()!==0&&!cl?dayInfo(k):null;
  cvOpen(`<div class="cvph"><b class="cvpt">${fd(k)}</b><button class="cvx" data-cvclose aria-label="ปิด">✕</button></div>${c?`<p class="cvcapl">คิวสำรวจ <b class="${c.c}">${c.t}</b>${c.why?' · '+esc(c.why):''}</p>`:''}
   ${di?`<div class="cvteam">${SV_TEAMS.map(tm=>{const n=teamSlots(tm,k),cc=teamCount(tm,k);return `<span class="${n?'ok':cc?'busy':'off'}"><b>${esc(tm)}</b> ${cc?'นัดแล้ว '+cc:''}${cc&&n?' · ':''}${n?'ว่าง '+n:cc?'':esc(teamWhy(tm,k))}</span>`}).join('')}</div>`:''}
   <div class="cvdl pop">${L.map(e=>e.tm?cvRow(e):cvBar(e,k,k,1,'auto',1)).join('')||'<p class="cvnote">ไม่มีนัด</p>'}</div>
   ${k>=t?`<div class="cvmf">${adm&&cvD(k).getDay()!==0?`<button class="btn sm" data-qclose="${k}" data-cvclose>${cl?'เปิดรับคิว':'ปิดรับคิวสำรวจ'}</button>`:''}${cvCanBk()&&cvBkOk(k)?`<button class="btn sm" data-cvbk="${k}">จองคิวสำรวจ</button>`:''}${cvCanAp()?`<button class="btn sm pri" data-cvnew="${k}">+ สร้างนัด</button>`:''}</div>`:''}`,anchor)}
/* เลือกงานที่จะลิงก์ */
const CV_STOP=new Set(['survey','solar','installation','install','ติดตั้ง','สำรวจ','เซอร์เวย์','คุณ','บ้าน','ทีม','ที่อยู่','เลขที่','หมู่บ้าน','แผน','ลูกค้า','งาน','และ','ระบบ','kw','kwp']);
function cvToks(t){return String(t||'').toLowerCase().replace(/[*()\[\]:;,.+\/|"'“”]/g,' ').split(/\s+/).map(x=>x.replace(/^คุณ/,'')).filter(x=>x.length>=2&&!CV_STOP.has(x))}
function cvJobHay(j){const c=cOf(j),s=sOf(j);return [j.title,c.name,c.firstName,c.lastName,s.label,s.area,s.address,j.jobNo].filter(Boolean).join(' ').toLowerCase()}
function cvMatches(e,q){const T=cvToks(e.n),qq=String(q||'').trim().toLowerCase();
  return visibleJobs().filter(j=>!['lost','cancelled'].includes(j.status)).map(j=>{const hay=cvJobHay(j),evs=cvJobEvents(j);let sc=0;
    if(qq){if(!hay.includes(qq))return null;sc+=5}else T.forEach(t=>{if(hay.includes(t))sc+=t.length>=4?2:1});
    const near=evs.length?Math.min(...evs.map(x=>Math.abs(cvDiff(x.d,e.d)))):99;if(near===0)sc+=3;else if(near<=7)sc+=1;
    return sc>0||qq?{j,sc,near,evs}:null}).filter(Boolean).sort((a,b)=>b.sc-a.sc||a.near-b.near).slice(0,8)}
function cvLinkPop(id,anchor){const e=cvFind(id);if(!e)return;CV.lnk=id;const L=cvMatches(e,CV.lq);
  cvOpen(`<div class="cvph"><b class="cvpt">ลิงก์กับงานในระบบ</b><button class="cvx" data-cvclose aria-label="ปิด">✕</button></div>
   <p class="cvnote" style="padding:0 0 6px">นัดใน Google: <b>${esc(e.n)}</b> · ${fd(e.d)}</p>
   <input class="cvtps cvls" id="cvls" placeholder="ค้นหางาน: ชื่อไซต์ ลูกค้า เลขใบงาน" value="${esc(CV.lq||'')}" autocomplete="off" autofocus>
   <div class="cvlj">${L.length?`${CV.lq?'':'<div class="cvtpg">งานที่น่าจะใช่</div>'}`+L.map(({j,evs})=>`<button class="cvtpi" data-cvlk="${esc(j.id)}"><span class="cvljt"><b>${esc(j.title||cOf(j).name||'ไม่มีชื่อ')}</b><small>${esc((STAGES[j.stage]||{}).name||'')}${j.jobNo?' · '+esc(j.jobNo):''}${evs.length?' · '+evs.map(x=>(x.k==='i'?'ติดตั้ง ':'สำรวจ ')+fd(x.d)).join(', '):''}</small></span></button>`).join(''):'<p class="cvnote">ไม่พบงาน ลองพิมพ์ชื่อลูกค้าหรือเลขใบงาน</p>'}</div>`,anchor,'scroll')}
/* สร้าง / แก้คิวอื่น */
function cvStart(d,tm,anchor,pre){if(!cvCanAp())return;if(d<today())return toast('วันที่ผ่านไปแล้ว สร้างนัดไม่ได้');const h=cvH(tm)??10;
  CV.tpo=null;CV.tpq='';CV.qc={id:'',d,end:'',title:'',ty:'',c:'',allday:false,t1:cvHm(h),t2:cvHm(Math.min(19.5,h+1)),gs:true,more:false,place:'',tel:'',map:'',who:[],note:'',...(pre||{})};cvQcPop(anchor)}
function cvTpick(){const o=CV.qc,T=cvT(),TY=cvTY();const sv={id:'sv',n:'สำรวจโซลาร์ (จองคิว)',c:CV_SV,g:'sol'};const cur=o.ty==='sv'?sv:TY[o.ty];const open=CV.tpo,q=CV.tpq.trim();
  const list=[...(o.id?[]:[sv]),...T.types].filter(x=>!q||x.n.toLowerCase().includes(q.toLowerCase()));const cc=cur?CV_GCC[o.c||cur.c]:'#d0d5dd';
  const groups=[{id:'sol',n:'โซลาร์'},...T.groups,{id:'_x',n:'ไม่มีหมวด'}];
  return `<div class="cvtp"><button class="cvtpb" data-cvtpo aria-expanded="${!!open}" aria-haspopup="listbox"><i style="background:${cc}"></i><span>${cur?esc(cur.n):'เลือกประเภท'}</span><em>▾</em></button>
   ${open?`<div class="cvtpl" role="listbox"><input class="cvtps" id="cvtps" placeholder="${cvCanTy()?'พิมพ์ค้นหา หรือพิมพ์ชื่อประเภทใหม่':'พิมพ์ค้นหา'}" value="${esc(CV.tpq)}" autocomplete="off" autofocus>${groups.map(g=>{const L=list.filter(x=>g.id==='_x'?!['sol',...T.groups.map(z=>z.id)].includes(x.g):x.g===g.id);return L.length?`<div class="cvtpg">${esc(g.n)}</div>`+L.map(x=>`<button class="cvtpi ${o.ty===x.id?'on':''}" role="option" data-cvtpk="${esc(x.id)}"><i style="background:${CV_GCC[x.c]||'#999'}"></i>${esc(x.n)}</button>`).join(''):''}).join('')}${q&&cvCanTy()&&!T.types.some(x=>x.n===q)?`<button class="cvtpi add" data-cvtpn>+ เพิ่ม “${esc(q)}” เป็นประเภทใหม่</button>`:''}${!list.length&&!(q&&cvCanTy())?'<p class="cvnote">ไม่พบประเภท</p>':''}</div>`:''}</div>
   ${cur&&o.ty!=='sv'?`<div class="cvsws"><span>สีนัด</span>${CV_GC.map(g=>`<button class="cvsw ${(o.c||cur.c)===g[0]?'on':''}" data-cvsw="${g[0]}" title="${g[1]}" aria-label="สี${g[1]}" style="background:${g[2]}"></button>`).join('')}</div>`:''}`}
function cvQcPop(anchor){if(!CV.qc)return;const q=CV.qc,c=cvCap(q.d);const times=[];for(let h=7;h<=20;h++)['00','30'].forEach(x=>times.push(String(h).padStart(2,'0')+':'+x));
  const ppl=cvPeople().map(p=>p.n);
  cvOpen(`<div class="cvph"><b class="cvpt">${q.id?'แก้ไขคิว':'สร้างนัด'}</b><button class="cvx" data-cvclose aria-label="ปิด">✕</button></div>
   <input class="cvqin" id="cvqt" placeholder="ชื่อนัด เช่น ติดตั้ง EV คุณสุดา" value="${esc(q.title)}" aria-label="ชื่อนัด" ${CV.tpo?'':'autofocus'}>
   ${cvTpick()}
   ${q.ty==='sv'?`<div class="cvbox g">นัดสำรวจต้องกรอกข้อมูลลูกค้า → ไปฟอร์มจองคิวสำรวจเดิม (ใส่วันที่ ${fd(q.d)} ให้แล้ว)</div>`:''}
   <div class="cvqrow"><b>${fd(q.d)}</b>${q.end?' – '+fd(q.end):''}</div>
   ${q.ty==='sv'?'':`<div class="cvqrow"><label><input type="checkbox" id="cvqad" ${q.allday?'checked':''}>ทั้งวัน</label>${q.allday?`<label>ถึงวันที่ <input type="date" id="cvqend" value="${esc(q.end||q.d)}" min="${esc(q.d)}"></label>`:`<select id="cvqt1" aria-label="เวลาเริ่ม">${times.map(t=>`<option ${t===q.t1?'selected':''}>${t}</option>`).join('')}</select> ถึง <select id="cvqt2" aria-label="เวลาจบ">${times.map(t=>`<option ${t===q.t2?'selected':''}>${t}</option>`).join('')}</select>`}</div>
   <div class="cvqpk"><span class="cvlbl">คนไป</span>${cvPick(q.who,q.d,q.allday?'':q.t1,q.allday?'':q.t2,q.id?'ap:'+q.id:'','data-cvpp')}</div>
   ${q.more?`<div class="cvmore2"><label>สถานที่ / ลูกค้า<input id="cvqpl" value="${esc(q.place)}" placeholder="เช่น ปากเกร็ด"></label><label>เบอร์<input id="cvqtel" value="${esc(q.tel)}" inputmode="tel" placeholder="08x-xxx-xxxx"></label>
     <label>ลิงก์ Google Maps<input id="cvqmap" value="${esc(q.map)}" placeholder="https://maps.app.goo.gl/..."></label>
     <label>หมายเหตุ<textarea id="cvqnote" rows="2">${esc(q.note)}</textarea></label></div>`:''}
   <div class="cvqrow"><label><input type="checkbox" id="cvqgs" ${q.gs?'checked':''} ${cvCfg().on?'':'disabled'}>ส่งขึ้น Google ของทีม${cvCfg().on?'':' (ยังไม่เปิด)'}</label></div>`}
   ${c?`<p class="cvcapl">คิวสำรวจวันนี้ <b class="${c.c}">${c.t}</b></p>`:''}
   <p class="cvqerr" id="cvqerr" role="alert"></p>
   <div class="cvmf">${q.ty!=='sv'&&!q.more?'<button class="btn sm" data-cvmore>ตัวเลือกเพิ่มเติม</button>':''}<button class="btn sm pri" data-cvsave>${q.ty==='sv'?'ไปฟอร์มจองคิวสำรวจ':q.id?'บันทึก':'บันทึก'}</button></div>`,anchor,q.more?'scroll':'')}
function cvReadQc(){const q=CV.qc;if(!q)return;const v=id=>{const el=document.getElementById(id);return el?el.value:null};
  [['cvqt','title'],['cvqpl','place'],['cvqtel','tel'],['cvqmap','map'],['cvqnote','note']].forEach(([i,k])=>{const x=v(i);if(x!=null)q[k]=x})}
async function cvSave(){const q=CV.qc;cvReadQc();const E=document.getElementById('cvqerr');const err=m=>{if(E)E.textContent=m};
  if(q.ty==='sv'){cvClose();CV.qc=null;cvBkOpen(q.d,q.t1);return}
  if(!q.ty)return err('เลือกประเภทนัดก่อน');if(!q.title.trim()){err('ใส่ชื่อนัดก่อน');document.getElementById('cvqt')?.focus();return}
  if(!q.allday&&cvH(q.t2)<=cvH(q.t1))return err('เวลาจบต้องหลังเวลาเริ่ม');
  const now=Date.now(),id=q.id||S.db.collection('appts').doc().id,old=(S.appts||{})[id]||{};
  const doc={...old,d:q.d,end:q.allday&&q.end&&q.end>q.d?q.end:'',tm:q.allday?'':q.t1,tm2:q.allday?'':q.t2,ty:q.ty,c:q.c||'',title:q.title.trim().slice(0,200),place:q.place.trim(),tel:q.tel.trim(),map:normUrl(q.map),who:q.who.slice(0,20),note:q.note.trim().slice(0,1000),gs:!!q.gs,updatedAt:now,updatedBy:S.me.id||null,...(q.id?{}:{createdAt:now,createdBy:S.me.id||null})};
  delete doc.id;const btn=document.querySelector('[data-cvsave]');if(btn)btn.disabled=true;
  try{await w('appts/'+id,doc,'set');cvClose();S.f.qsel=q.d;CV.newId='ap:'+id;toast(q.id?'บันทึกแล้ว':'สร้างนัดแล้ว'+(doc.gs&&cvCfg().on?' · ส่งขึ้น Google ของทีม':''))}
  catch(e){if(btn)btn.disabled=false}}
async function cvMove(apId,to){const a=(S.appts||{})[apId];if(!a||a.d===to)return;if(to<today())return toast('ย้ายไปวันที่ผ่านแล้วไม่ได้');
  const len=a.end&&a.end>a.d?cvDiff(a.d,a.end):0,old={d:a.d,end:a.end||''};
  try{await w('appts/'+apId,{d:to,end:len?isoAdd(to,len):'',updatedAt:Date.now(),updatedBy:S.me.id||null});CV.newId='ap:'+apId;
    undoable(`ย้ายไป ${fd(to)} แล้ว${cvCfg().on&&a.gs!==false?' · Google ย้ายตาม':''}`,()=>w('appts/'+apId,{...old,updatedAt:Date.now()}),'ย้ายกลับแล้ว')}catch(e){}}
/* แก้ “คนไปด้วย” ของนัดสำรวจ (ช่องเดิม j.surveyHelpers) จากปฏิทิน */
function cvHelpPop(anchor){const o=CV.hp;if(!o)return;const j=S.jobs[o.jid];if(!j)return;const ev=cvJobEvents(j).find(x=>x.k!=='i');const d=ev?ev.d:'',t1=ev&&ev.tm||'',t2=t1?cvHm(cvH(t1)+1.5):'';
  const ppl=cvPeople().map(p=>p.n);
  cvOpen(`<div class="cvph"><b class="cvpt">คนไปด้วย</b><button class="cvx" data-cvclose aria-label="ปิด">✕</button></div>
   <p class="cvnote" style="padding:0 0 6px">${esc(j.title||cOf(j).name||'')} · สำรวจ ${d?fd(d)+(t1?' '+esc(t1):''):''}${j.surveyor?' · คนสำรวจ '+esc(j.surveyor):''}</p>
   ${cvPick(o.who,d,t1,t2,ev?ev.id:'','data-cvhp',j.surveyor)}
   <p class="cvnote">ชื่อจะต่อท้ายหัวข้อนัดใน Google เช่น “… + เอก”</p>
   <div class="cvmf"><button class="btn sm" data-cvclose>ยกเลิก</button><button class="btn sm pri" data-cvhsave>บันทึก</button></div>`,anchor,'scroll')}
async function cvSaveStaff(L){try{await w('config/staff',{list:L,updatedAt:Date.now()},'set')}catch(e){}}
/* จัดการประเภท/หมวด + ตั้งค่าส่งขึ้น Google (แอดมิน) */
function cvMtPop(anchor){const T=cvT(),cfg=cvCfg();const gopt=v=>T.groups.map(g=>`<option value="${esc(g.id)}" ${v===g.id?'selected':''}>${esc(g.n)}</option>`).join('');
  cvOpen(`<div class="cvph"><b class="cvpt">จัดการประเภทงาน</b><span class="cvpill" style="--c:#b54708">แอดมิน/เจ้าของ</span><button class="cvx" data-cvclose aria-label="ปิด">✕</button></div>
  <p class="cvnote">คนอื่นเลือกใช้ได้อย่างเดียว · สีตรงกับใน Google</p>
  <h4 class="cvmth">หมวด</h4>${T.groups.map(g=>`<div class="cvmtr"><input value="${esc(g.n)}" data-cvgn="${esc(g.id)}" aria-label="ชื่อหมวด"></div>`).join('')}
  <h4 class="cvmth">ประเภท</h4>${T.types.map(t=>`<div class="cvmtr"><i style="background:${CV_GCC[t.c]||'#999'}"></i><input value="${esc(t.n)}" data-cvtn="${esc(t.id)}" aria-label="ชื่อประเภท"><select data-cvtg="${esc(t.id)}" aria-label="หมวด">${gopt(t.g)}</select><select data-cvtc="${esc(t.id)}" aria-label="สี">${CV_GC.map(g=>`<option value="${g[0]}" ${t.c===g[0]?'selected':''}>${g[1]}</option>`).join('')}</select></div>`).join('')}
  <div class="cvmf"><button class="btn sm" data-cvgadd>+ หมวด</button><button class="btn sm" data-cvtadd>+ ประเภท</button></div>
  <h4 class="cvmth">รายชื่อทีมงาน (ไม่ต้องมีบัญชี)</h4><p class="cvnote" style="padding:0 0 4px">สำหรับคนที่ไม่ได้ใช้แอป เช่น ทีม EV ชื่อจะขึ้นให้เลือกตอนสร้างนัดและในคิวรายคน ระบบไม่ส่งอะไรไปหาคนในรายชื่อ</p>
  <datalist id="cvteams">${[...new Set(cvStaff().map(x=>x.team).filter(Boolean))].map(x=>`<option value="${esc(x)}">`).join('')}</datalist>${cvStaff().map(x=>`<div class="cvmtr">${cvAv(x.n,x.team)}<input value="${esc(x.n)}" data-cvsn="${esc(x.id)}" aria-label="ชื่อ"><input value="${esc(x.team||'')}" data-cvst="${esc(x.id)}" aria-label="ทีม" placeholder="ทีม" list="cvteams" style="max-width:110px"><button class="cvx" data-cvsdel="${esc(x.id)}" aria-label="ลบ ${esc(x.n)}">✕</button></div>`).join('')}
  <div class="cvmf"><button class="btn sm" data-cvsadd>+ เพิ่มคน</button></div>
  <h4 class="cvmth">ส่งขึ้น Google Calendar (Tasks EN Team)</h4>
  <div class="cvqrow"><label><input type="checkbox" id="cvgon" ${cfg.on?'checked':''}>ส่งนัดจากเว็บขึ้น Google</label></div>
  <div class="cvqrow"><label>เริ่มส่งนัดตั้งแต่วันที่ <input type="date" id="cvgfrom" value="${esc(cfg.from||today())}"></label></div>
  <p class="cvnote">นัดก่อนวันนี้ไม่ส่ง (กันซ้ำกับที่เคยพิมพ์ใน Google เอง) · ตั้งแต่วันเริ่ม ให้ออฟฟิศเลิกพิมพ์นัดสำรวจ/ติดตั้งลง Google เอง</p>
  <div class="cvmf"><button class="btn sm" data-cvsyncall ${cfg.on?'':'disabled'}>ซิงก์ทั้งหมดตอนนี้</button><button class="btn sm pri" data-cvclose>เสร็จ</button></div>`,anchor,'scroll')}
async function cvSaveTypes(T){try{await w('config/apptTypes',{groups:T.groups,types:T.types,updatedAt:Date.now()},'set')}catch(e){}}
const cvNextColor=()=>{const used=new Set(cvT().types.map(t=>t.c));return (CV_GC.find(g=>!used.has(g[0]))||CV_GC[0])[0]};
/* ---- จองคิวสำรวจโซลาร์ในหน้าปฏิทิน (ผู้ใช้ 27 พ.ย. 21:17: ยุบฟอร์มจองคิวเดิมมาไว้ที่นี่) ----
   แผงขวา · ปฏิทินซ้ายใช้เลือกวัน (ช่องวันบอก ว่าง N อยู่แล้ว) · ช่องกรอกและการบันทึกใช้ของฟอร์มเดิมทั้งหมด (nfRead / nfReady / createJob) */
const cvCanBk=()=>!['eng','lead'].includes(myGroup());
function cvBkOk(k){if(!k||k<today()||cvD(k).getDay()===0)return false;const c=cvCap(k);return !!c&&c.c!=='off'&&c.c!=='full'}
function cvBkWhy(k){if(k<today())return 'วันที่ผ่านไปแล้ว';if(cvD(k).getDay()===0)return 'วันอาทิตย์ไม่รับคิว';const c=cvCap(k);return c?(c.why||c.t):'วันนี้จองไม่ได้'}
function cvBkOpen(k,tm){S.cvBk=1;const f=S.nf=S.nf||{};if(k&&cvBkOk(k)){f.date=k;S.f.qsel=k;S.f.cvm=k.slice(0,8)+'01'}
  if(tm&&SLOTS.includes(tm)&&f.date&&!dayInfo(f.date).taken.includes(tm))f.time=tm;render();setTimeout(()=>document.querySelector('.cvbk')?.focus(),0)}
function cvBkPick(k,tm){const f=S.nf=S.nf||{};if(!cvBkOk(k))return toast(fd(k)+': '+cvBkWhy(k));nfRead();
  if(f.date!==k){f.date=k;if(f.time&&dayInfo(k).taken.includes(f.time))f.time=''}if(tm&&SLOTS.includes(tm)&&!dayInfo(k).taken.includes(tm))f.time=tm;S.f.qsel=k;render()}
function cvBkWhen(){const f=S.nf||{};const mob=cvMob(),t=today();
  const strip=mob?`<div class="cvbks" role="group" aria-label="เลือกวัน">${[...Array(21)].map((_,i)=>isoAdd(t,i)).filter(k=>cvD(k).getDay()!==0).slice(0,14).map(k=>{const ok=cvBkOk(k),c=cvCap(k);return `<button type="button" class="cvbksd ${f.date===k?'on':''}" ${ok?`data-bkd="${k}"`:'disabled'} aria-pressed="${f.date===k}"><small>${TD[cvD(k).getDay()].slice(0,2)}</small><b>${cvD(k).getDate()}</b><small>${c?esc(c.t):''}</small></button>`}).join('')}</div>`:'';
  if(!f.date)return `<div class="cvbkd"><span class="cvbkn">1</span><div><b>เลือกวัน</b><span class="sub">${mob?'กดวันที่ว่างด้านล่าง':'กดวันที่ว่างในปฏิทินด้านซ้าย ช่องวันบอกจำนวนคิวว่าง'}</span></div></div>${strip}`;
  const c=cvCap(f.date);
  return `<div class="cvbkd"><span class="cvbkn">1</span><div><b>${TD[cvD(f.date).getDay()]} ${fd(f.date)}</b><span class="sub">${c?`คิวสำรวจ <em class="${c.c}">${esc(c.t)}</em> · `:''}${mob?'เปลี่ยนวันได้ด้านล่าง':'กดวันอื่นในปฏิทินเพื่อเปลี่ยน'}</span></div></div>${strip}${nfWhen(1)}`}
function cvBkPanel(){const f=S.nf||(S.nf={});const team=myTeam()||(myRole()==='sales_en'?'EN':'');
  return `<aside class="cvbk card" tabindex="-1" aria-label="จองคิวสำรวจโซลาร์"><form id="newForm" class="cvbkform" autocomplete="off">
   <div class="cvbkh"><i style="background:${CV_GCC[CV_SV]}"></i><h2>จองคิวสำรวจโซลาร์</h2>${f.parent&&S.jobs[f.parent]?`<span class="sub">ติดตั้งเพิ่ม · ${esc(S.jobs[f.parent].title||'')}</span>`:''}<button type="button" class="cvx" data-cvbkx aria-label="ปิดแผงจองคิว">✕</button></div>
   <div class="cvbkb">${S.nfDone?`<section class="nfdone cvbkdone" role="status"><span class="nfd-i">${svg('check','currentColor',2.4)}</span><div><b>จองคิว ${esc(S.nfDone.name)} แล้ว</b><span class="sub">${TD[new Date(S.nfDone.date+'T00:00:00').getDay()]} ${fd(S.nfDone.date)} · ${esc(S.nfDone.time)}${S.nfDone.sent?' · '+esc(S.nfDone.sent):' · รอหัวหน้าจัดงานเลือกคนสำรวจ'}</span></div><div class="cvbkda"><a class="btn sm" href="#job-${esc(S.nfDone.jid)}">เปิดงาน</a><button type="button" class="btn sm pri" data-nfnext>จองอีกคิว</button></div></section>`:''}<div class="cvbkw">${cvBkWhen()}</div>${nfFields(f,team)}</div>
   <div class="cvbkft">${nfSub()}</div></form></aside>`}
/* ---- พอดีหน้าจอ (จอคอม) ---- */
function cvFit(){const el=document.getElementById('cvw');if(!el)return;if(cvMob()){el.style.height='';return}
  const top=el.getBoundingClientRect().top+scrollY;el.style.height=Math.max(420,innerHeight-top-14)+'px';
  let ch=false;const wk=el.querySelector('.cvwk');if(wk){const hh=wk.clientHeight,cmp=hh<96;const m=Math.max(1,cmp?Math.floor((hh-27)/21):Math.floor((hh-31)/23));if(m!==CV.maxl||cmp!==CV.cmp){CV.maxl=m;CV.cmp=cmp;ch=true}}
  const wb=el.querySelector('.cvwb');if(wb){const px=Math.max(26,Math.floor(wb.clientHeight/13));if(px!==CV.px){CV.px=px;ch=true}}
  el.querySelectorAll('[data-ind="1"]').forEach(x=>x.indeterminate=true);
  if(CV.newId){const n=el.querySelector(`[data-cvev="${CSS.escape(CV.newId)}"]`);if(n){n.classList.add('cvnew');CV.newId=''}}
  if(ch&&CV.fitting<2){CV.fitting++;render();CV.fitting=0}}
/* ---- เหตุการณ์ ---- */
document.addEventListener('click',async e=>{
  const p=document.getElementById('cvpop');
  const t=e.target.closest('[data-cvnew],[data-cvev],[data-cvday],[data-cvcell],[data-cvwcol],[data-cvtoday],[data-cvstep],[data-cvv],[data-cvmv],[data-cvmn],[data-cvjump],[data-cvcol],[data-cvmt],[data-cvclose],[data-cvconv],[data-cvdel],[data-cvedit],[data-cvtpo],[data-cvtpk],[data-cvtpn],[data-cvsw],[data-cvmore],[data-cvsave],[data-cvpp],[data-cvaddp],[data-cvgadd],[data-cvtadd],[data-cvsyncall],[data-cvgo],[data-cvrail],[data-cvlink],[data-cvlk],[data-cvunl],[data-cvwho],[data-cvpplo],[data-cvbk],[data-cvbkx],[data-cvhelp],[data-cvhp],[data-cvhadd],[data-cvhsave],[data-cvsadd],[data-cvsdel]');
  if(!t){if(p&&p.classList.contains('show')&&!p.contains(e.target)&&!e.target.closest('#toast'))cvClose();return}
  const d=t.dataset;
  if('cvclose' in d||'cvgo' in d){setTimeout(cvClose,0);return}
  if(d.cvbk){cvClose();cvBkOpen(d.cvbk);return}
  if('cvbkx' in d){nfRead();S.cvBk=0;render();return}
  if(S.cvBk&&cvCanBk()&&(d.cvcell||d.cvwcol||d.cvday)){if(d.cvday){cvBkPick(d.cvday);return}if(d.cvwcol){if(e.target.closest('.cvtev'))return;const r=t.getBoundingClientRect();const h=7+Math.floor((e.clientY-r.top)/(CV.px||40)*2)/2;cvBkPick(d.cvwcol,cvHm(h))}else cvBkPick(d.cvcell);return}
  if(d.cvnew){cvStart(d.cvnew,'10:00',t);return}
  if(d.cvev){if(CV.dragged)return;cvEvPop(d.cvev,t);return}
  if(d.cvday){cvDayPop(d.cvday,t);return}
  if(d.cvcell){if(cvCanAp())cvStart(d.cvcell,'10:00',t);else cvDayPop(d.cvcell,t);return}
  if(d.cvwcol){if(e.target.closest('.cvtev'))return;const r=t.getBoundingClientRect();const h=7+Math.floor((e.clientY-r.top)/(CV.px||40)*2)/2;if(cvCanAp())cvStart(d.cvwcol,cvHm(Math.min(19.5,h)),t);return}
  if('cvrail' in d){try{localStorage.setItem('cl.cv.rail',cvRailOff()?'1':'0')}catch(x){}CV.maxl=0;render();return}
  if('cvtoday' in d){S.f.qsel=today();S.f.cvm=today().slice(0,8)+'01';render();return}
  if(d.cvstep){const n=+d.cvstep,mob=cvMob();if((mob&&(S.f.cvmv||'list')==='list')||(!mob&&S.f.cv==='week')){S.f.qsel=isoAdd(S.f.qsel||today(),7*n);S.f.cvm=S.f.qsel.slice(0,8)+'01'}else{const c=cvD(S.f.cvm||today().slice(0,8)+'01');c.setMonth(c.getMonth()+n);S.f.cvm=isoOf(c);if(mob)S.f.qsel=S.f.cvm}render();return}
  if(d.cvv){S.f.cv=d.cvv;render();return}
  if(d.cvmv){S.f.cvmv=d.cvmv;render();return}
  if(d.cvmn){const c=cvD(S.f.cvm);c.setMonth(c.getMonth()+ +d.cvmn);S.f.cvm=isoOf(c);render();return}
  if(d.cvjump){S.f.qsel=d.cvjump;S.f.cvm=d.cvjump.slice(0,8)+'01';render();return}
  if(d.cvcol){const C=cvColSet();C.has(d.cvcol)?C.delete(d.cvcol):C.add(d.cvcol);cvSaveCol();render();return}
  if('cvmt' in d){cvMtPop(t);return}
  if(d.cvwho){CV.who=CV.who===d.cvwho?'':d.cvwho;render();return}
  if('cvpplo' in d){const o=!(CV.pplo??(()=>{try{return localStorage.getItem('cl.cv.ppl')==='1'}catch(x){return false}})());CV.pplo=o;try{localStorage.setItem('cl.cv.ppl',o?'1':'0')}catch(x){}render();return}
  if(d.cvhelp){const j=S.jobs[d.cvhelp];if(!j)return;CV.hp={jid:j.id,who:cvSplit(j.surveyHelpers)};cvHelpPop(t);return}
  if(d.cvhp&&CV.hp){const L=CV.hp.who,i=L.indexOf(d.cvhp);i<0?L.push(d.cvhp):L.splice(i,1);cvHelpPop(null);return}
  if('cvhadd' in d&&CV.hp){const x=document.getElementById('cvhx');const v=x&&x.value.trim().slice(0,40);if(v&&!CV.hp.who.includes(v))CV.hp.who.push(v);cvHelpPop(null);return}
  if('cvhsave' in d&&CV.hp){const o=CV.hp;CV.hp=null;cvClose();try{await w('jobs/'+o.jid,{surveyHelpers:o.who.join(', ').slice(0,200),updatedAt:Date.now()});toast('บันทึกคนไปด้วยแล้ว'+(cvCfg().on?' · Google อัปเดตตาม':''))}catch(x){}return}
  if('cvsadd' in d){await cvSaveStaff([...cvStaff(),{id:'p'+Date.now().toString(36),n:'ชื่อใหม่',team:'EV'}]);cvMtPop(null);return}
  if(d.cvsdel){await cvSaveStaff(cvStaff().filter(x=>x.id!==d.cvsdel));cvMtPop(null);return}
  if(d.cvlink){CV.lq='';cvLinkPop(d.cvlink,t);return}
  if(d.cvlk){const ev=cvFind(CV.lnk);if(!ev||!ev.g)return;const j=S.jobs[d.cvlk];const id='gl'+cvHash(ev.g.id);
    try{await w('appts/'+id,{link:true,gid:ev.g.id,jobId:d.cvlk,gn:ev.n.slice(0,200),gd:ev.d,gend:cvEnd(ev),createdAt:Date.now(),createdBy:S.me.id||null},'set');cvClose();cvMark('jobs/'+d.cvlk);toast('ลิงก์กับงาน “'+((j&&j.title)||'')+'” แล้ว')}catch(x){}return}
  if(d.cvunl){const L0=(S.appts||{})[d.cvunl];cvClose();try{await w('appts/'+d.cvunl,null,'delete');if(L0&&L0.jobId)cvMark('jobs/'+L0.jobId);toast('ยกเลิกลิงก์แล้ว')}catch(x){}return}
  if(d.cvconv){const ev=cvFind(d.cvconv);if(!ev)return;cvClose();cvStart(ev.d<today()?today():ev.d,ev.tm||'10:00',null,{title:ev.n,allday:!ev.tm,end:ev.end||'',t2:ev.g&&ev.g.tm2||cvHm(Math.min(19.5,(cvH(ev.tm)||10)+1)),note:ev.g&&ev.g.desc||'',more:true});return}
  if(d.cvdel){const a=(S.appts||{})[d.cvdel];if(!a)return;cvClose();if(!(await confirmBox('ยกเลิกคิวนี้?',`“${a.title||''}” ${fd(a.d)}${cvCfg().on&&a.gs!==false?' · นัดใน Google จะถูกลบด้วย':''}`,'ยกเลิกคิว')))return;
    try{await w('appts/'+d.cvdel,{trashedAt:Date.now(),trashedBy:S.me.id||null});undoable('ยกเลิกคิวแล้ว',()=>w('appts/'+d.cvdel,{trashedAt:null,trashedBy:null}),'กู้คืนแล้ว')}catch(x){}return}
  if(d.cvedit){const a=(S.appts||{})[d.cvedit];if(!a)return;cvStart(a.d<today()?today():a.d,a.tm||'10:00',null,{id:d.cvedit,title:a.title||'',ty:a.ty||'',c:a.c||'',allday:!a.tm,end:a.end||'',t1:a.tm||'10:00',t2:a.tm2||cvHm((cvH(a.tm)||10)+1),gs:a.gs!==false,place:a.place||'',tel:a.tel||'',map:a.map||'',who:(a.who||[]).slice(),note:a.note||'',more:true});if(a.d<today())CV.qc.d=a.d;return}
  if(!CV.qc&&!['cvgadd','cvtadd','cvsyncall'].some(k=>k in d))return;
  if('cvtpo' in d){cvReadQc();CV.tpo=!CV.tpo;CV.tpq='';cvQcPop(null);return}
  if(d.cvtpk){cvReadQc();if(d.cvtpk==='sv'){const q=CV.qc;cvClose();CV.qc=null;cvBkOpen(q.d,q.t1);return}CV.qc.ty=d.cvtpk;CV.qc.c='';CV.tpo=null;cvQcPop(null);return}
  if('cvtpn' in d){cvReadQc();const n=CV.tpq.trim();if(!n)return;const T=cvT(),id='u'+Date.now().toString(36);const grp=T.groups.find(g=>g.id==='off')?'off':(T.groups[0]||{}).id||'off';
    const nt={groups:T.groups.slice(),types:[...T.types,{id,n:n.slice(0,40),c:cvNextColor(),g:grp}]};CV.qc.ty=id;CV.qc.c='';CV.tpo=null;CV.tpq='';await cvSaveTypes(nt);cvQcPop(null);toast(`เพิ่มประเภท “${n}” แล้ว`);return}
  if(d.cvsw){cvReadQc();const t2=cvTY()[CV.qc.ty];CV.qc.c=t2&&t2.c===d.cvsw?'':d.cvsw;cvQcPop(null);return}
  if('cvmore' in d){cvReadQc();CV.qc.more=true;cvQcPop(null);return}
  if('cvsave' in d){cvSave();return}
  if(d.cvpp){cvReadQc();const L=CV.qc.who,i=L.indexOf(d.cvpp);i<0?L.push(d.cvpp):L.splice(i,1);cvQcPop(null);return}
  if('cvaddp' in d){cvReadQc();const x=document.getElementById('cvqx');const v=x&&x.value.trim();if(v&&!CV.qc.who.includes(v))CV.qc.who.push(v.slice(0,40));cvQcPop(null);return}
  if('cvgadd' in d){const T=cvT();await cvSaveTypes({groups:[...T.groups,{id:'g'+Date.now().toString(36),n:'หมวดใหม่'}],types:T.types});cvMtPop(null);return}
  if('cvtadd' in d){const T=cvT();await cvSaveTypes({groups:T.groups,types:[...T.types,{id:'u'+Date.now().toString(36),n:'ประเภทใหม่',c:cvNextColor(),g:(T.groups[T.groups.length-1]||{}).id||'off'}]});cvMtPop(null);return}
  if('cvsyncall' in d){t.disabled=true;await cvSyncAll();t.disabled=false;return}
});
document.addEventListener('input',e=>{const t=e.target;if(t.id==='cvls'){CV.lq=t.value;cvLinkPop(CV.lnk,null);return}if(t.id==='cvq'){CV.q=t.value;schedule();return}if(t.id==='cvtps'){CV.tpq=t.value;cvReadQc();cvQcPop(null)}});
document.addEventListener('change',async e=>{const t=e.target,d=t.dataset||{};
  if(d.cvlay){const o=cvOff();t.checked?o.delete(d.cvlay):o.add(d.cvlay);cvSaveOff();render();return}
  if(d.cvgrp){const g=cvTree().find(x=>x.id===d.cvgrp);if(!g)return;const o=cvOff(),ids=g.items.map(i=>i[0]),allOn=ids.every(i=>!o.has(i));ids.forEach(i=>allOn?o.add(i):o.delete(i));cvSaveOff();render();return}
  if(t.id==='cvqad'){cvReadQc();CV.qc.allday=t.checked;cvQcPop(null);return}
  if(t.id==='cvqend'){CV.qc.end=t.value>=CV.qc.d?t.value:'';return}
  if(t.id==='cvqt1'){cvReadQc();CV.qc.t1=t.value;if(cvH(CV.qc.t2)<=cvH(t.value))CV.qc.t2=cvHm(Math.min(20.5,cvH(t.value)+1));cvQcPop(null);return}
  if(t.id==='cvqt2'){cvReadQc();CV.qc.t2=t.value;cvQcPop(null);return}
  if(t.id==='cvqgs'){CV.qc.gs=t.checked;return}
  if(d.cvsn||d.cvst){const L=cvStaff().map(x=>({...x}));const x=L.find(y=>y.id===(d.cvsn||d.cvst));if(x){if(d.cvsn)x.n=t.value.trim().slice(0,40)||x.n;else x.team=t.value.trim().slice(0,20)}await cvSaveStaff(L);cvMtPop(null);return}
  if(d.cvgn||d.cvtn||d.cvtg||d.cvtc){const T=cvT(),G=T.groups.map(x=>({...x})),Y=T.types.map(x=>({...x}));
    if(d.cvgn){const g=G.find(x=>x.id===d.cvgn);if(g)g.n=t.value.trim().slice(0,40)||g.n}
    const y=Y.find(x=>x.id===(d.cvtn||d.cvtg||d.cvtc));if(y){if(d.cvtn)y.n=t.value.trim().slice(0,40)||y.n;if(d.cvtg)y.g=t.value;if(d.cvtc)y.c=t.value}
    await cvSaveTypes({groups:G,types:Y});if(d.cvtc)cvMtPop(null);return}
  if(t.id==='cvgon'||t.id==='cvgfrom'){const on=document.getElementById('cvgon').checked,from=document.getElementById('cvgfrom').value||today();
    if(on&&!cvCfg().on&&!(await confirmBox('เปิดส่งนัดขึ้น Google?',`ตั้งแต่ ${fd(from)} นัดสำรวจ ติดตั้ง และคิวอื่นที่จอง/แก้ในเว็บ จะขึ้นในปฏิทิน Tasks EN Team ให้อัตโนมัติ (ทุกคนในกลุ่มอีเมลเห็น)`,'เปิดส่ง','pri'))){t.checked=false;return}
    try{await w('config/gcal',{on,from,updatedAt:Date.now(),by:S.me.id||null},'set');toast(on?'เปิดส่งขึ้น Google แล้ว':'ปิดส่งขึ้น Google แล้ว');cvMtPop(null)}catch(x){}return}
});
document.addEventListener('keydown',e=>{const p=document.getElementById('cvpop');if(!p||!p.classList.contains('show'))return;
  if(e.target.id==='cvtps'&&e.key==='Enter'){e.preventDefault();const b=p.querySelector('[data-cvtpn]')||p.querySelector('[data-cvtpk]');if(b)b.click();return}
  if(e.target.id==='cvqt'&&e.key==='Enter'){e.preventDefault();cvSave();return}
  if(e.target.id==='cvqx'&&e.key==='Enter'){e.preventDefault();p.querySelector('[data-cvaddp]')?.click();return}
  if(e.target.id==='cvhx'&&e.key==='Enter'){e.preventDefault();p.querySelector('[data-cvhadd]')?.click();return}
  if(e.key==='Escape'){if(CV.tpo){CV.tpo=null;cvReadQc();cvQcPop(null)}else cvClose()}});
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#cvpop [data-cvgo],#cvpop a[href]'))setTimeout(cvClose,0)},true);
/* ลากคิวอื่นไปวันอื่น */
document.addEventListener('dragstart',e=>{const t=e.target.closest&&e.target.closest('[data-cvev][draggable="true"]');if(!t)return;CV.drag=t.dataset.cvev;t.classList.add('cvdragging');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',CV.drag)}catch(x){}cvClose()});
document.addEventListener('dragend',()=>{document.querySelectorAll('.cvdragging,.cvover').forEach(x=>x.classList.remove('cvdragging','cvover'));CV.drag=null;CV.dragged=true;setTimeout(()=>CV.dragged=false,50)});
const cvCellAt=e=>{const wk=e.target.closest&&e.target.closest('.cvwk');if(!wk)return null;return [...wk.querySelectorAll('[data-cvcell]')].find(c=>{const r=c.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right})||null};
document.addEventListener('dragover',e=>{if(!CV.drag)return;const c=cvCellAt(e);document.querySelectorAll('.cvover').forEach(x=>x!==c&&x.classList.remove('cvover'));if(c){e.preventDefault();c.classList.add('cvover')}});
document.addEventListener('drop',e=>{if(!CV.drag)return;const c=cvCellAt(e);if(c){e.preventDefault();const id=CV.drag.replace(/^ap:/,'');cvMove(id,c.dataset.cvcell)}});
addEventListener('resize',()=>{if(route()==='queue'){clearTimeout(CV.rt);CV.rt=setTimeout(()=>{CV.maxl=0;render()},150)}});

/* ---------- customers ---------- */

/* ---------- settings ---------- */
function profCard(){
  const m=S.members[S.me.id]||{};const pv=S.pf2??m.photo??'';const name=m.name??nm(S.me.id)??'';
  const av=sz=>`<span style="display:block;width:${sz}px;height:${sz}px;border-radius:50%;overflow:hidden;background:#eef0f3;flex:none">${pv?`<img src="${esc(pv)}" alt="" style="width:100%;height:100%;object-fit:cover">`:avImg()}</span>`;
  if(!S.pfEdit)return `<section class="card pad stc" aria-label="โปรไฟล์"><div class="sth"><h2>โปรไฟล์</h2><button type="button" class="lnk" data-pfedit="1">แก้ไข</button></div>
    <div class="stv">${av(64)}<div><b>${esc(name)}</b><span class="sub">${esc(S.me.email||'')}</span></div></div></section>`;
  return `<section class="card pad stc editing" aria-label="โปรไฟล์"><div class="sth"><h2>โปรไฟล์</h2></div>
    <div class="stv"><label for="pfphoto" style="cursor:pointer;flex:none">${av(84)}<span class="sub" style="display:block;text-align:center;margin-top:4px">เปลี่ยนรูป</span><input type="file" id="pfphoto" accept="image/*" hidden></label>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1"><label class="fld" for="pfname">ชื่อที่แสดง<input id="pfname" value="${esc(S.pfn??name)}" maxlength="40"></label>
        <span class="sub">${esc(S.me.email||'')}</span>${pv&&!S.pf2?'<button class="lnk" id="pfdelphoto" type="button" style="align-self:flex-start">ใช้รูปเริ่มต้น</button>':''}</div></div>
    <div class="save"><button class="btn sm" type="button" data-pfcancel="1">ยกเลิก</button><button class="btn pri sm" id="pfsave" type="button">บันทึก</button></div></section>`;
}
function shrinkImg(file,max){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.85))};im.onerror=rej;im.src=r.result};r.onerror=rej;r.readAsDataURL(file)})}
async function saveProfile(photo){
  const name=($('#pfname')?.value||'').trim();if(!name)return toast('ใส่ชื่อที่แสดงก่อน');
  const p={name};if(photo!==undefined)p.photo=photo;else if(S.pf2)p.photo=S.pf2;
  const m0=S.members[S.me.id]||{},old={name:m0.name||nm(S.me.id)||name,photo:m0.photo||''};
  try{await S.db.call('profile',p);S.pf2=null;S.pfn=null;S.pfEdit=false;S.names[S.me.id]=name;S.db.refresh();render();
    undoable('บันทึกโปรไฟล์แล้ว',async()=>{await S.db.call('profile',old);S.names[S.me.id]=old.name;S.db.refresh();render()},'คืนโปรไฟล์เดิมแล้ว')}catch(e){showErr(e,'บันทึกไม่ได้')}
}
function viewSettings(){
  const adm=S.me.owner||S.me.edit;const mem=Object.values(S.members);
  return pageHead('ตั้งค่า','')+`${S.me.role?profCard():''}${myGroup()?ntfCard():''}

  
  ${(S.me.role?isSys():adm)?`<section class="card pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="margin:0;font-size:16px">นำเข้าตารางงาน</h2>
    <p class="sub" style="margin:0">ไฟล์ตารางงาน (.xlsx) · นำเข้าซ้ำได้ ข้อมูลเดิมจะอัปเดตตามไฟล์</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><label class="filein" for="xfile">${svg('file','#16171a',2)}<span id="xfname">เลือกไฟล์ .xlsx</span><input type="file" id="xfile" accept=".xlsx"></label><button class="btn pri" id="ximport">นำเข้า</button></div><div id="xprog">${S.xprog||''}</div></section>`:''}
`;
}



/* ===== เซลส์ (รอบ 4a) ===== */
const isSales=()=>!!(S.me&&S.me.role==='sales');
const SL_STEP=[['แจ้งขอคิว',[1]],['ยืนยันคิวสำรวจ',[2]],['สำรวจและออกแบบ',[3]],['รอลูกค้าตกลง',[4]],['ติดตั้ง',[5,6,7]],['ขนานไฟ · ส่งมอบ',[8]]];
const slMine=()=>Object.values(S.jobs||{}).filter(j=>j.salesId===S.me.id).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
const slName=id=>id?(S.names[id]||S.members?.[id]?.name||''):'';
function slStatus(j){
  const st=j.status||'active';
  if(st==='cancelled')return ['ยกเลิก','gy',j.cancelReason||''];
  if(st==='lost')return ['ลูกค้าไม่ไปต่อ','gy',j.lostReason||''];
  if(st==='done')return ['ติดตั้งเสร็จ · ดูแลหลังการขาย','ok',''];
  const n=j.stage||1,d=j.surveyDate||j.queueDate;
  if(n===1)return ['รอยืนยันคิว','o',`ขอ ${fd(j.queueDate)} ${j.queueTime||''} · ออฟฟิศกำลังดูคิว`];
  if(n===2)return ['ยืนยันคิวแล้ว','b',`สำรวจ ${fd(d)} ${j.queueTime||''} · กำลังจัดคน`];
  if(n===3)return [`นัดสำรวจ ${fd(d)}`,'g',[j.queueTime,j.surveyor].filter(Boolean).join(' · ')];
  if(n===4)return ['ส่งแบบแล้ว · รอลูกค้าตกลง','b',`ส่งไปแล้ว ${days(j.stageSince)} วัน — โทรตามได้`];
  if(n===5)return ['ลูกค้าตกลง · รอคิวติดตั้ง','g',''];
  if(n===6)return [j.installDate?`นัดติดตั้ง ${fd(j.installDate)}`:'กำลังนัดติดตั้ง','g',j.supervisor||''];
  if(n===7)return ['ติดตั้งแล้ว · เก็บงาน','g',''];
  return ['ทำเอกสารขนานไฟ','g',''];
}
function slWho(j){const n=j.stage||1;const x=n===3?j.surveyor:(n===6||n===7)?(j.supervisor||j.surveyor):'';return x||'ออฟฟิศ'}
function slProg(j){const n=(j.status==='done')?9:(j.stage||1);return `<span class="slp" aria-hidden="true">${[1,2,3,4,5,6,7,8].map(k=>`<i class="${k<n?'d':k===n&&!['cancelled','lost'].includes(j.status)?'c':''}"></i>`).join('')}</span>`}
function slSeen(){try{return JSON.parse(localStorage.getItem('cl.slseen')||'{}')}catch(e){return {}}}
function slMsgs(id){return Object.values(S.messages||{}).filter(m=>m.jobId===id).sort((a,b)=>(a.at||0)-(b.at||0))}
function slNew(id){const s=slSeen()[id]||0;return slMsgs(id).filter(m=>m.by!==S.me.id&&(m.at||0)>s).length}
function sideSales(r){
  const lg=document.querySelector('.side .logo img');const on=k=>k==='today'?(r==='today'||r.startsWith('job-')):r===k;
  const A=(k,h,ic,t)=>`<a href="${h}" class="snv ${on(k)?'on':''}" title="${t}" ${on(k)?'aria-current="page"':''}>${svg(ic,'currentColor',2)}<span>${t}</span></a>`;
  $('#nav1').innerHTML=`<a class="sbr" href="#today" aria-label="CLEANLINE งานของฉัน">${lg?`<img src="${lg.src}" alt="CLEANLINE">`:'<b>CLEANLINE</b>'}<small>Management</small><em class="sbm" aria-hidden="true">CL</em></a>
    ${A('today','#today','list','งานของฉัน')}${A('new','#new','plus','แจ้งขอคิวสำรวจ')}
    <div class="sgp"><div class="sgt">บัญชี</div>${A('settings','#settings','gear','ตั้งค่า')}</div>`;
  $('#nav2').innerHTML='';
}
function hdrSales(){const name=S.names[S.me.id]||S.me.name||'';return `<header class="tb pmbar sltb"><div></div><div class="tbr"><a class="tav" href="#settings" title="${esc(name)}" aria-label="ตั้งค่าโปรไฟล์" style="padding:0;overflow:hidden">${avImg()}</a></div></header>`}
function viewSales(r){
  if(r==='new')return slNewView();
  if(r==='settings')return pageHead('ตั้งค่า','')+profCard()+`<section class="card pad" style="max-width:640px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:12px"><span><b>${esc(S.names[S.me.id]||'')}</b><br><small class="sub">${esc(S.me.email||'')}</small></span><button type="button" class="btn dangero" id="pfout">ออกจากระบบ</button></section>`;
  if(r.startsWith('job-'))return slJobView(r.slice(4));
  return slHome();
}
function slRow(j){const [t,c,note]=slStatus(j);const s=sOf(j);const nw=slNew(j.id);
  return `<a class="slr" href="#job-${esc(j.id)}"><span class="slr1"><b>${esc(j.title||cOf(j).name||'ไม่มีชื่อ')}${s.area?` · ${esc(s.area)}`:''}</b><small>${j.jobNo?'#'+esc(j.jobNo):'รอเลขงาน'}${j.request&&j.request.wantKwp?` · ${esc(j.request.wantKwp)} kWp`:''}${j.request&&j.request.systemType?' '+esc(j.request.systemType):''}</small></span>
    <span class="slr2"><em class="slb ${c}">${esc(t)}</em>${slProg(j)}<small>${esc(note)}</small></span>
    <span class="slr3">${nw?`<em class="slb r">ข้อความใหม่ ${nw}</em>`:`<small>${esc(slWho(j))}</small>`}</span><span class="slr4">ดูงาน ${svg('chev','currentColor',2)}</span></a>`}
function slHome(){
  if(!S.loaded.jobs)return '<div class="card skr" aria-busy="true" aria-label="กำลังโหลดงาน">'+'<i class="sk"></i>'.repeat(6)+'</div>';
  const all=slMine(),act=all.filter(j=>(j.status||'active')==='active');const d=new Date();
  const follow=all.filter(j=>slNew(j.id)||(j.status||'active')==='active'&&(j.stage===4||j.stage===1));
  const cnt=f=>all.filter(f).length;
  const tile=(ic,c,v,l)=>`<div class="slt"><span class="hti ${c}">${svg(ic,'#fff',2.2)}</span><span><b>${v}</b><small>${l}</small></span></div>`;
  const name=S.names[S.me.id]||S.me.name||'';
  return `<div class="slh"><div><p class="sub" style="margin:0">วัน${TD[d.getDay()]}ที่ ${d.getDate()} ${TMF[d.getMonth()]} ${d.getFullYear()+543}</p><h1>สวัสดี ${esc(name)}</h1><p class="sub" style="margin:0">งานที่คุณแจ้งไว้ ${all.length} งาน · อัปเดตอัตโนมัติ</p></div><a class="btn pri" href="#new">${svg('plus','#fff',2.4)}แจ้งขอคิวสำรวจ</a></div>
  <div class="sltl">${tile('clock','o',cnt(j=>(j.status||'active')==='active'&&j.stage===1),'รอยืนยันคิว')}${tile('search','g',cnt(j=>(j.status||'active')==='active'&&(j.stage===2||j.stage===3)),'กำลังสำรวจ / ออกแบบ')}${tile('doc','b',cnt(j=>(j.status||'active')==='active'&&j.stage===4),'รอลูกค้าตกลง')}${tile('bolt','k',cnt(j=>j.status==='done'||(j.status||'active')==='active'&&j.stage>=7),'ติดตั้งแล้ว')}</div>
  ${all.length?`${follow.length?`<section class="card pad slc1"><h2>ต้องตามต่อ <i class="slc">${follow.length}</i></h2>${follow.map(slRow).join('')}</section>`:''}
  <section class="card pad slc1"><h2>งานทั้งหมดของฉัน <i class="slc">${all.length}</i></h2>${all.map(slRow).join('')}</section>`
  :`<section class="card empty">ยังไม่มีงาน · กด <b>แจ้งขอคิวสำรวจ</b> เพื่อส่งลูกค้ารายแรกให้ออฟฟิศ</section>`}`;
}
/* ฟอร์มแจ้งขอคิว: ค่าเก็บใน S.sf (หน้าจอวาดใหม่ทุกครั้งที่ข้อมูลอัปเดต) */
function slLoadSlots(){if(S.slq&&Date.now()-S.slq.at<60e3||S.slqBusy)return;if(!S.db||!S.db.call){S.slq={at:Date.now(),days:{}};return}
  S.slqBusy=1;S.db.call('slots',{days:14}).then(r=>{S.slq={at:Date.now(),days:r.days||{},order:r.order||[]}}).catch(()=>{S.slq={at:Date.now(),days:{},err:1}}).finally(()=>{S.slqBusy=0;schedule()})}
const slHalfFree=(d,h,k)=>!d||k&&halfGone(k,h)?0:Math.max(0,(d.cap||0)-(d[h]||0));
function slNewView(){
  const f=S.sf||(S.sf={kwp:'',sys:'On Grid'});slLoadSlots();
  const q=S.slq;const order=q&&q.order&&q.order.length?q.order:[...Array(14)].map((_,i)=>{const x=new Date(Date.now()+i*864e5);return isoOf(x)});
  const dayBtn=k=>{const d=q&&q.days[k];const dt=new Date(k+'T00:00:00');const free=d?slHalfFree(d,'am',k)+slHalfFree(d,'pm',k):null;
    const st=d&&d.closed?['no',d.closed]:free===null?['','—']:free===0?['no',halfGone(k,'pm')?'ปิดแล้ว':'เต็ม']:free<=2?['few',`ว่าง ${free}`]:['ok',`ว่าง ${free}`];
    return `<button type="button" class="sld ${st[0]} ${f.date===k?'on':''}" data-sld="${k}" ${st[0]==='no'?'disabled':''} aria-pressed="${f.date===k}"><small>${['อา','จ','อ','พ','พฤ','ศ','ส'][dt.getDay()]}</small><b>${dt.getDate()}</b><i>${esc(st[1])}</i></button>`};
  const d=f.date&&q&&q.days[f.date];
  const tBtn=t=>{const h=t<'12:00'?'am':'pm';const gone=slGone(f,t),full=gone||d&&slHalfFree(d,h,f.date)===0,on=f.time===t&&!gone;return `<button type="button" class="sls ${on?'on':''}" data-sls="${t}" ${full?'disabled':''} aria-pressed="${on}"${gone?' title="เลยเวลาแล้ว"':''}>${t}</button>`};
  const I=(id,l,v,x='')=>`<label class="fld" for="sf-${id}">${l}<input id="sf-${id}" value="${esc(v||'')}" ${x}></label>`;
  const miss=slMiss(f);
  return `<div class="top"><nav class="crumb"><a href="#today">งานของฉัน</a><span>/</span><b>แจ้งขอคิวสำรวจ</b></nav></div>${pageHead('แจ้งขอคิวสำรวจ','ออฟฟิศจะยืนยันคิวและจัดคนสำรวจให้')}
  <div class="slnew"><section class="card pad nform">
    <div class="ngrp"><h2>ลูกค้า</h2><div class="fgrid">${I('first','ชื่อ',f.first,'autocomplete="off"')}${I('last','นามสกุล',f.last)}${I('phone','เบอร์ติดต่อ',f.phone,'type="tel" inputmode="tel" placeholder="08x-xxx-xxxx"')}${I('area','อำเภอ / จังหวัด',f.area,'placeholder="เช่น บางใหญ่ นนทบุรี"')}
      <label class="fld full" for="sf-map">ลิงก์ Google Maps (ไม่บังคับ)<input id="sf-map" type="url" value="${esc(f.map||'')}" placeholder="https://maps.app.goo.gl/…"></label></div></div>
    <div class="ngrp"><h2>ระบบที่ลูกค้าสนใจ</h2><div class="fgrid">${I('kwp','ขนาด (kWp)',f.kwp,'inputmode="decimal" placeholder="เช่น 5"')}<label class="fld" for="sf-sys">ระบบ<select id="sf-sys">${['On Grid','Hybrid','ยังไม่แน่ใจ'].map(x=>`<option ${f.sys===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label class="fld full" for="sf-note">หมายเหตุถึงออฟฟิศ (ไม่บังคับ)<textarea id="sf-note" rows="3" placeholder="เช่น ลูกค้าสะดวกช่วงเช้า · มีสุนัข">${esc(f.note||'')}</textarea></label></div></div>
  </section>
  <section class="card pad slq"><h2>วันที่อยากให้สำรวจ</h2><p class="sub" style="margin:0 0 8px">${q?(q.err?'ดูคิวว่างไม่ได้ตอนนี้ เลือกวันได้ ออฟฟิศจะยืนยันให้':'จำนวนคิวว่างโดยประมาณ ออฟฟิศยืนยันอีกครั้ง'):'กำลังดูคิวว่าง…'}</p>
    <div class="slds">${order.map(dayBtn).join('')}</div>
    ${f.date?`<h3>เวลา · ${fd(f.date)}</h3><div class="slss"><small>เช้า${d?` · ว่าง ${slHalfFree(d,'am',f.date)}`:''}</small>${SLOTS.filter(t=>t<'12:00').map(tBtn).join('')}<small>บ่าย${d?` · ว่าง ${slHalfFree(d,'pm',f.date)}`:''}</small>${SLOTS.filter(t=>t>='12:00').map(tBtn).join('')}</div>`:''}
    <div class="slgo">${miss.length?`<small>ยังขาด: ${miss.join(', ')}</small>`:'<small>พร้อมส่ง</small>'}<button type="button" class="btn pri" data-slsend="1" ${miss.length||S.slBusy?'disabled':''}>${S.slBusy?'กำลังส่ง…':'ส่งคำขอคิว'}</button></div>
  </section></div>`;
}
/* 4.44 เวลาที่เลยไปแล้วของวันนี้: จองไม่ได้ และไม่นับเป็นคิวว่าง · ช่วงเช้า/บ่ายที่เลยทุกเวลาแล้วนับว่าง 0 · ใช้ทั้งฟอร์มเซลส์และฝั่งออฟฟิศ (cvCap) */
const slotGone=(k,t)=>k===today()&&t<=new Date().toTimeString().slice(0,5);
const halfGone=(k,h)=>SLOTS.filter(t=>halfOf(t)===h).every(t=>slotGone(k,t));
const slGone=(f,t)=>slotGone(f.date,t);
function slMiss(f){const m=[];if(!String(f.first||'').trim())m.push('ชื่อ');if(String(f.phone||'').replace(/\D/g,'').length<9)m.push('เบอร์');if(!String(f.area||'').trim())m.push('พื้นที่');if(!f.date)m.push('วันที่');if(!f.time||slGone(f,f.time))m.push('เวลา');return m}
async function slSend(){
  const f=S.sf||{};if(slMiss(f).length||S.slBusy)return;S.slBusy=1;render();
  const now=Date.now(),me=S.me.id,first=f.first.trim(),last=String(f.last||'').trim(),name=(first+' '+last).trim();
  const cid=S.db.collection('customers').doc().id,sid=S.db.collection('sites').doc().id,jid=S.db.collection('jobs').doc().id;
  const kw=String(f.kwp||'').trim();const team=S.me.team||S.members?.[me]?.team||'';const sp=S.names[me]||S.me.name||'';
  try{
    await wMany([['customers/'+cid,{firstName:first,lastName:last,name,type:'บุคคล',phone:f.phone.trim(),createdBy:me,createdAt:now},'set'],
      ['sites/'+sid,{customerId:cid,label:'คุณ'+first,area:f.area.trim(),mapLink:String(f.map||'').trim(),createdBy:me,createdAt:now},'set'],
      ['jobs/'+jid,{type:'solar',title:`คุณ${first}${kw?' '+kw+' kW':''}`,customerId:cid,siteId:sid,salesId:me,salesPerson:sp,salesTeam:team,salesNote:String(f.note||'').trim(),
        queueDate:f.date,queueTime:f.time,request:{wantKwp:kw?Number(kw)||kw:'',systemType:f.sys||''},fromSales:true,status:'active',stage:ST.BOOK,stageSince:now,createdAt:now,updatedAt:now,
        history:[ev('create',`แจ้งขอคิวสำรวจ ${fd(f.date)} ${f.time}`)]},'set']]);
    S.sf=null;S.slq=null;toast('ส่งคำขอแล้ว ออฟฟิศจะยืนยันคิวให้');location.hash='job-'+jid;
  }catch(e){showErr(e,'ส่งไม่ได้ ลองอีกครั้ง')}finally{S.slBusy=0;render()}
}
function slJobView(id){
  const j=S.jobs[id];if(!j)return `<div class="card empty">${S.loaded.jobs?'ไม่พบงานนี้':'กำลังโหลด…'} · <a href="#today">กลับ</a></div>`;
  const c=cOf(j),s=sOf(j);const [t,cl,note]=slStatus(j);const n=(j.status==='done')?9:(j.stage||1);
  const seen=slSeen();seen[id]=Date.now();try{localStorage.setItem('cl.slseen',JSON.stringify(seen))}catch(e){}
  const hAt=st=>{const h=(j.history||[]).find(x=>st.includes(x.to));return h?h.at:null};
  const steps=SL_STEP.map(([nm,st],i)=>{const done=n>Math.max(...st),cur=st.includes(n)&&!['cancelled','lost','done'].includes(j.status);const at=i===0?j.createdAt:hAt(st);
    const sub=i===0?[slName((j.history||[])[0]?.by)||j.salesPerson,at&&fdt(at)]:i===2?[j.surveyor,fd(j.surveyDate||j.queueDate)]:i===4?[j.installDate&&'นัด '+fd(j.installDate)]:[done&&at&&fdt(at)];
    return `<li class="${done?'d':cur?'c':''}"><span>${done?svg('check','#fff',3):i+1}</span><div><b>${nm}</b><small>${esc(sub.filter(Boolean).join(' · ')||'—')}</small></div></li>`}).join('');
  const R=(k,v)=>v?`<div class="slkv"><small>${k}</small><span>${v}</span></div>`:'';
  const msgs=slMsgs(id);
  return `<div class="top"><nav class="crumb"><a href="#today">งานของฉัน</a><span>/</span><b>${esc(j.title||'งาน')}</b></nav></div>
  <div class="slh"><div><p class="sub" style="margin:0">${j.jobNo?'#'+esc(j.jobNo):'รอเลขงาน'}</p><h1>${esc(j.title||c.name||'งาน')}</h1><p class="sub" style="margin:0">${esc([s.area,j.request&&j.request.systemType].filter(Boolean).join(' · '))}</p></div><span class="slro">${svg('eye','currentColor',2)}ดูอย่างเดียว · แก้ข้อมูลแจ้งออฟฟิศในแชต</span></div>
  <div class="sljob"><div class="slmain">
    <section class="card pad"><h2>ตอนนี้</h2><div class="slnow"><em class="slb ${cl}">${esc(t)}</em><small>${j.status==='active'||!j.status?`อยู่ขั้นนี้ ${days(j.stageSince)} วัน · ผู้รับผิดชอบ ${esc(slWho(j))}`:esc(note)}</small></div>${slProg(j)}${note&&(j.status||'active')==='active'?`<p class="sub" style="margin:8px 0 0">${esc(note)}</p>`:''}</section>
    <section class="card pad"><h2>ข้อมูลงาน</h2>${R('ลูกค้า',esc([c.name,c.phone].filter(Boolean).join(' · ')))}${R('พื้นที่',esc(s.area||s.address||''))}${R('แผนที่',s.mapLink?`<a href="${esc(s.mapLink)}" target="_blank" rel="noopener">เปิด Google Maps</a>`:'')}
      ${R('ขอคิวสำรวจ',esc([fd(j.queueDate),j.queueTime].filter(Boolean).join(' ')))}${R('วันสำรวจ',j.stage>=2&&j.surveyDate?esc([fd(j.surveyDate),j.queueTime,j.surveyor].filter(Boolean).join(' · ')):'')}
      ${R('ลูกค้าสนใจ',esc([j.request&&j.request.wantKwp?j.request.wantKwp+' kWp':'',j.request&&j.request.systemType].filter(Boolean).join(' · ')))}${R('ระบบที่เสนอ',esc([j.proposedKw?j.proposedKw+' kWp':'',j.proposedModel].filter(Boolean).join(' · ')))}
      ${R('วันติดตั้ง',j.installDate?esc(fd(j.installDate)):'')}${R('หมายเหตุ',esc(j.salesNote||''))}</section>
  </div><aside class="slaside">
    <section class="card pad"><h2>ความคืบหน้า</h2><ol class="slst">${steps}</ol></section>
    <section class="card pad"><h2>คุยกับออฟฟิศ</h2>${chatBody(id,msgs)}</section>
  </aside></div>`;
}
/* แชตงาน (ใช้ร่วม เซลส์ + ออฟฟิศ) */
function chatBody(id,msgs){S.chd=S.chd||{};
  return `<div class="slch" id="slch">${msgs.length?msgs.map(m=>`<div class="slm ${m.by===S.me.id?'mine':''} ${m.kind==='request'?'rq':''}"><small>${esc(slName(m.by)||'—')} · ${fdt(m.at)}${m.kind==='request'?' · ขอข้อมูลเพิ่ม':m.kind==='resolved'?' · แก้แล้ว':''}</small><span>${esc(m.text||'')}</span></div>`).join(''):'<p class="sub" style="margin:0">ยังไม่มีข้อความ</p>'}</div>
  <div class="slci"><textarea id="chat-${esc(id)}" rows="2" placeholder="พิมพ์ข้อความ…" aria-label="ข้อความ">${esc(S.chd[id]||'')}</textarea><button type="button" class="btn pri" data-chsend="${esc(id)}">ส่ง</button></div>`}
const chatN=id=>Object.values(S.messages||{}).filter(m=>m.jobId===id).length;
function jobChat(j){const by=j.salesId?slName(j.salesId)||j.salesPerson:'';
  return `${j.fromSales?`<div class="slreq"><b>คำขอจาก ${esc(by||'เซลส์')}</b><small>${esc([j.request&&j.request.wantKwp?j.request.wantKwp+' kWp':'',j.request&&j.request.systemType,'ขอ '+fd(j.queueDate)+' '+(j.queueTime||'')].filter(Boolean).join(' · '))}</small></div>`:''}${chatBody(j.id,slMsgs(j.id))}`}
async function chSend(id){const el=document.getElementById('chat-'+id);const tx=(el?.value||'').trim();if(!tx)return;
  const mid=S.db.collection('messages').doc().id;S.chd[id]='';
  try{await w('messages/'+mid,{jobId:id,at:Date.now(),by:S.me.id,text:tx,kind:'msg'},'set','ส่งข้อความ');render();requestAnimationFrame(()=>{const b=$('#slch');if(b)b.scrollTop=b.scrollHeight})}catch(e){S.chd[id]=tx;showErr(e,'ส่งไม่ได้')}}
/* ภาพรวมของออฟฟิศ: คำขอคิวจากเซลส์ที่ยังไม่ยืนยัน */
function salesReqBanner(h){
  const L=Object.values(S.jobs||{}).filter(j=>j.fromSales&&(j.status||'active')==='active'&&j.stage===ST.BOOK).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  if(!L.length)return h;
  const box=`<section class="card pad slrb" aria-label="คำขอคิวจากเซลส์"><h2>${svg('inbox','currentColor',2)}คำขอคิวสำรวจ <i class="slc">${L.length}</i></h2>${L.map(j=>`<div class="slrr"><span><b>${esc(j.title||'')}</b><small>${esc([slName(j.salesId)||j.salesPerson,j.salesTeam,'ขอ '+fd(j.queueDate)+' '+(j.queueTime||'')].filter(Boolean).join(' · '))}</small></span><button type="button" class="btn sm" data-osel="${esc(j.id)}">ดูและยืนยันคิว</button></div>`).join('')}</section>`;
  return box+h;
}
document.addEventListener('input',e=>{const t=e.target;if(!t.id)return;
  if(t.id.startsWith('sf-')&&isSales()){(S.sf||(S.sf={}))[t.id.slice(3)]=t.value;const g=document.querySelector('[data-slsend]');const m=slMiss(S.sf);if(g){g.disabled=!!m.length;const sm=g.previousElementSibling;if(sm)sm.textContent=m.length?'ยังขาด: '+m.join(', '):'พร้อมส่ง'}}
  if(t.id.startsWith('chat-')){(S.chd||(S.chd={}))[t.id.slice(5)]=t.value}});
document.addEventListener('change',e=>{const t=e.target;if(t.id==='sf-sys'){(S.sf||(S.sf={})).sys=t.value}});
document.addEventListener('click',e=>{const t=e.target.closest('[data-sld],[data-sls],[data-slsend],[data-chsend]');if(!t)return;
  if(t.dataset.sld){const f=S.sf||(S.sf={});f.date=t.dataset.sld;f.time='';render();return}
  if(t.dataset.sls){S.sf.time=t.dataset.sls;render();return}
  if(t.dataset.slsend){slSend();return}
  if(t.dataset.chsend){chSend(t.dataset.chsend);return}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&e.target.id?.startsWith('chat-')){e.preventDefault();chSend(e.target.id.slice(5))}});


/* ===== รอบ 4m: ขั้นกำลังติดตั้ง — สถานะใบงานติดตั้ง (คนคุมงานกรอกใน Man) ===== */
function insFormCard(j,btns){const f=j.installForm,e=j.equipment||{},ps=(f&&f.pass)||{},P=Object.values(S.photos||{}).filter(p=>p.jobId===j.id);
  const D=insDays(j);const who=j.supervisor||'คนคุมงาน';
  const nd=[['รุ่นเครื่อง + S/N',!!(e.model&&e.sn)],['จำนวนแผง',+e.panels>0],['Single Line ตามจริง',P.some(p=>p.kind==='sld')],['ผลวัดไฟ',[ps.ac,ps.dc,ps.eh].every(v=>v===true||v===false)],['ลูกค้าเซ็นใบงาน',!!(f&&f.sign&&f.sign.cust)]];
  const done=nd.filter(x=>x[1]).length,bad=[ps.ac,ps.dc,ps.eh].some(v=>v===false);
  return `<section class="act" aria-label="กำลังติดตั้ง">
    <div><h2>ใบงานติดตั้ง</h2><span class="sub">${esc(who)}${j.installTeam?' · '+esc(j.installTeam):''}${D.length?' · ติดตั้ง '+fd(D[0])+(D.length>1?' – '+fd(D[D.length-1]):''):''}</span></div>
    <div class="pbar"><i style="width:${Math.round(done/nd.length*100)}%"></i></div>
    <ul class="need">${nd.map(([l,ok])=>`<li class="${ok?'ok':''}"><span class="k">${ok?'✓':''}</span>${esc(l)}</li>`).join('')}</ul>
    ${bad?`<span class="sub" style="color:#b42318">ผลวัดไฟบางรายการไม่ผ่าน${f.note?' · '+esc(f.note):''}</span>`:''}
    <span class="sub">${f?'บันทึกในใบงานแล้ว '+done+'/'+nd.length+' · ':'ยังไม่เริ่มกรอก · '}${esc(who)} กรอกและปิดใบงานใน Man</span>
    ${btns?`<div class="btns">${btns}</div>`:''}
  </section>`}
/* ===== รอบ 4b: มอบงานติดตั้ง ===== */
function insPeople(){return Object.entries(S.members||{}).filter(([,m])=>m&&m.status!=='suspended'&&(m.role==='eng'||m.role==='lead')).map(([id,m])=>({id,name:nm(id)||m.name||''})).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name,'th'))}
function insBusy(p,j){const D=insDays(j);if(!D.length)return '';
  const sup=Object.values(S.jobs).find(x=>x.id!==j.id&&x.status==='active'&&(x.stage===ST.INSTALL||x.stage===ST.COMM)&&(x.supervisorId?x.supervisorId===p.id:x.supervisor===p.name)&&insDays(x).some(k=>D.includes(k)));
  if(sup)return 'คุมงาน '+(sup.title||'');
  const sv=Object.values(S.jobs).find(x=>x.status==='active'&&x.stage<=ST.SURVEY&&x.stage>=ST.ACCEPT&&(x.surveyorId?x.surveyorId===p.id:x.surveyor===p.name)&&D.includes(x.surveyDate||x.queueDate));
  return sv?'สำรวจ '+fd(sv.surveyDate||sv.queueDate):''}
(()=>{const up=t=>{t.classList.toggle('more',t.scrollLeft+t.clientWidth<t.scrollWidth-4)};
  document.addEventListener('scroll',e=>{if(e.target.classList&&e.target.classList.contains('jtabs'))up(e.target)},true);
  addEventListener('resize',()=>document.querySelectorAll('.jtabs').forEach(up));
  new MutationObserver(()=>document.querySelectorAll('.jtabs').forEach(t=>{const o=t.querySelector('.on');if(o&&t.dataset.on!==o.dataset.jtab){t.dataset.on=o.dataset.jtab;const l=o.offsetLeft-t.offsetLeft;if(l<t.scrollLeft||l+o.offsetWidth>t.scrollLeft+t.clientWidth)t.scrollLeft=l-16}up(t)})).observe(document.getElementById('app')||document.body,{childList:true,subtree:true})})();
function ibDrop(h){return h.replace(/<span class="ib ibx" data-ibk="([\w-]+)" aria-hidden="true"><\/span>/g,(m,k)=>h.includes('<button type="button" class="ib" data-ibk="'+k+'"')?m:'')}
function asgCard(j,act){
  const st=asgState(j);
  const D=insDays(j);const P=insPeople();const teams=[...new Set(Object.values(S.jobs).map(x=>x.installTeam).filter(x=>x&&x.length<60))].sort();
  const pick=P.find(p=>p.id===st.sup);
  return `<section class="act" aria-label="มอบงานติดตั้ง">
    <div><h2>มอบงานติดตั้ง</h2><span class="sub">${D.length?`ติดตั้ง ${fd(D[0])}${D.length>1?' – '+fd(D[D.length-1])+' ('+D.length+' วัน)':''}`:'ยังไม่มีวันติดตั้ง'}</span></div>
    <div class="fld"><span>ผู้คุมงาน</span><div class="asgp" role="radiogroup" aria-label="ผู้คุมงาน">${P.length?P.map(p=>{const b=insBusy(p,j);return `<button type="button" role="radio" aria-checked="${st.sup===p.id}" class="asgc ${st.sup===p.id?'on':''} ${b?'busy':''}" data-asgsup="${esc(j.id)}|${esc(p.id)}" ${act?'':'disabled'}><b>${esc(p.name)}</b><small>${b?esc(b):'ว่าง'}</small></button>`}).join(''):'<span class="sub">ยังไม่มีรายชื่อคนหน้างาน (อนุมัติใน Console)</span>'}</div></div>
    <label class="fld" for="asg-t-${esc(j.id)}">ผู้รับเหมา / ทีมช่าง<input id="asg-t-${esc(j.id)}" data-asgteam="${esc(j.id)}" list="asg-tl" value="${esc(st.team)}" placeholder="ชื่อผู้รับเหมา" ${act?'':'disabled'}><datalist id="asg-tl">${teams.map(t=>`<option value="${esc(t)}">`).join('')}</datalist></label>
    ${act?`<span class="sub asgmiss" ${st.sup&&st.team.trim()?'hidden':''}>ยังขาด: ${[!st.sup&&'ผู้คุมงาน',!st.team.trim()&&'ผู้รับเหมา'].filter(Boolean).join(', ')}</span>`:''}
    <div class="btns"><button class="btn dk" data-asggo="${esc(j.id)}" ${act&&st.sup&&st.team.trim()?'':'disabled'}>${pick?'มอบงาน · ส่งให้'+esc(pick.name):'มอบงาน'}</button>${act?'<button class="btn sm" data-act="back" style="box-shadow:none;color:var(--mut)">ย้อนกลับขั้นก่อนหน้า</button>':''}</div>
    ${act?'':`<span class="sub">รอ${esc(ownerOf(j))}มอบงาน</span>`}
  </section>`}
/* ค่าที่ผู้ใช้เลือกในการ์ด (ถ้ายังไม่แตะ ใช้ค่าจากงาน เช่น ผู้รับเหมาที่ใส่ตอนจองคิวติดตั้ง) */
function asgState(j){const u=(S.asg||{})[j.id]||{};return {sup:u.sup!==undefined?u.sup:(j.supervisorId||(insPeople().find(p=>p.name===j.supervisor)||{}).id||''),team:u.team!==undefined?u.team:(j.installTeam||'')}}
async function asgGo(id){const j=S.jobs[id];if(!j)return;const st=asgState(j);if(!st.sup||!st.team.trim())return;
  const p=insPeople().find(x=>x.id===st.sup);if(!p)return toast('เลือกผู้คุมงานก่อน');const b=insBusy(p,j);
  if(b&&!await confirmBox(`${p.name} ติดงานช่วงนั้น`,`${b} · ยังจะมอบงานนี้ให้${p.name}ไหม`,'มอบงาน','pri'))return;
  const now=Date.now();const tm=st.team.trim();
  try{await pushHist(j,ev('handoff',`มอบงานติดตั้ง · ผู้คุมงาน ${p.name} · ผู้รับเหมา ${tm}`,{from:ST.INSTALL,to:ST.COMM}),{supervisor:p.name,supervisorId:p.id,installTeam:tm,stage:ST.COMM,stageSince:now});
    delete S.asg[id];toast('มอบงานติดตั้งให้'+p.name+'แล้ว')}catch(e){}}
document.addEventListener('click',e=>{const t=e.target.closest('[data-asgsup],[data-asggo],[data-mtnow]');if(!t)return;
  if(t.dataset.asgsup){const [jid,pid]=t.dataset.asgsup.split('|');S.asg=S.asg||{};(S.asg[jid]=S.asg[jid]||{}).sup=pid;render();return}
  if(t.dataset.asggo){asgGo(t.dataset.asggo);return}
  if(t.dataset.mtnow){openMeterNow();return}});
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.asgteam){const id=t.dataset.asgteam;S.asg=S.asg||{};(S.asg[id]=S.asg[id]||{}).team=t.value;
  const g=document.querySelector(`[data-asggo="${CSS.escape(id)}"]`);if(g&&S.jobs[id])g.disabled=!(asgState(S.jobs[id]).sup&&t.value.trim());
  const ms=g&&g.closest('.act').querySelector('.asgmiss');if(ms&&S.jobs[id]){const q=asgState(S.jobs[id]),L=[!q.sup&&'ผู้คุมงาน',!t.value.trim()&&'ผู้รับเหมา'].filter(Boolean);ms.hidden=!L.length;ms.textContent='ยังขาด: '+L.join(', ')}}});
/* ===== รอบ 4b: บันทึกสมาร์ทมิเตอร์ที่ติดตั้งอยู่แล้ว (เริ่มก่อนวันนี้ได้ · การจองอัตโนมัติที่ชนจะย้ายไปเครื่องอื่น) ===== */
const MTNF=()=>[['device','เครื่องที่ติดตั้งอยู่','sel',METERS.map(d=>'เครื่อง '+d),{req:1}],['title','ลูกค้า / ไซต์','text',{req:1,ph:'เช่น บ้านคุณสมชาย บางนา'}],['borrower','ผู้ยืม','text',{ph:'คนที่เอาเครื่องไป'}],['phone','เบอร์ติดต่อ','tel'],
  ['from','ติดตั้งไปเมื่อ','date',{req:1}],['to','จะเก็บเครื่องวันที่','date',{req:1}],['note','หมายเหตุ','area',{full:1}]];
function openMeterNow(){formModal('mtN','บันทึกเครื่องที่ใช้อยู่ตอนนี้',MTNF(),{from:today(),to:isoAdd(today(),6)},'บันทึก',`<p class="sub" style="margin:8px 0 0">สำหรับเครื่องที่ติดตั้งไปก่อนเริ่มใช้ระบบ · ถ้าเครื่องนี้มีคิวจองอัตโนมัติชนอยู่ ระบบจะย้ายคิวนั้นไปเครื่องที่ว่าง</p>`)}
async function saveMeterNow(){const v=readF('mtN');const E=$('#mtNE');const dev=(v.device||'').replace('เครื่อง ','');
  if(!dev)return E.textContent='เลือกเครื่อง';if(!v.title)return E.textContent='ใส่ชื่อลูกค้าหรือไซต์';if(!v.from||!v.to)return E.textContent='ใส่วันติดตั้งและวันเก็บเครื่อง';
  if(v.from>today())return E.textContent='เครื่องที่ยังไม่ได้ติดตั้ง ใช้ "จองเครื่อง"';if(v.to<v.from)return E.textContent='วันเก็บต้องไม่ก่อนวันติดตั้ง';
  const end=v.to<today()?today():v.to;const hit=mtActive().filter(b=>b.device===dev&&b.from<=end&&mtEnd(b)>=v.from);
  const hard=hit.filter(b=>b.status!=='booked');if(hard.length){const b=hard[0];return E.textContent=`เครื่อง ${dev} มีบันทึกว่าใช้อยู่แล้ว: ${b.title||''} (${fd(b.from)} – ${fd(b.to)}) · ถ้าเครื่องคืนแล้ว กด "รับเครื่องคืน" ก่อน`}
  const busy=d=>mtActive().some(b=>b.device===d&&!hit.includes(b)&&b.from<=end&&mtEnd(b)>=v.from);
  const moves=hit.map(b=>{const to=METERS.find(d=>d!==dev&&!busy(d)&&!mtActive().some(x=>x.id!==b.id&&x.device===d&&x.from<=mtEnd(b)&&mtEnd(x)>=b.from));return {b,to:to||''}});
  if(moves.length&&!await confirmBox('ย้ายคิวที่ชนกัน?',moves.map(m=>`${m.b.title||'คิว'} (${fd(m.b.from)}) → ${m.to?'เครื่อง '+m.to:'รอจัดเครื่อง'}`).join(' · '),'ย้ายและบันทึก','pri'))return;
  const now=Date.now();const id=S.db.collection('meters').doc().id;
  try{await wMany([...moves.map(m=>['meters/'+m.b.id,{device:m.to,updatedAt:now},'update']),['meters/'+id,{source:'direct',status:'out',outAt:v.from,createdAt:now,updatedAt:now,...v,device:dev},'set']]);
    closeModal();toast(`บันทึกเครื่อง ${dev} ว่าติดตั้งอยู่แล้ว${moves.length?' · ย้ายคิว '+moves.length+' รายการ':''}`)}catch(e){}}
{const _ofs=onFormSubmit;onFormSubmit=function(f,b){if(f&&f.id==='mtN')return saveMeterNow();return _ofs.apply(this,arguments)}}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  if(e.target.closest('.ibs a'))return;
  if(e.target.closest('a.mi[target]'))return;const t=e.target.closest('[data-mpop],[data-fmrow],[data-mpy],[data-mpick],[data-mn],[data-bk],[data-jmo],[data-viewas],[data-nd],[data-nt],[data-nm],[data-copy],[data-go],[data-qclose],[data-cmo],[data-cnosv],[data-cst],[data-cnn],[data-cclr],[data-cnp],[data-edit],[data-qm],[data-qd],[data-status],[data-phase],[data-mine],[data-minetoggle],[data-clear],[data-kbt],[data-eqc],[data-eqnew],[data-eqedit],[data-eqdel],[data-jdel],[data-mtnew],[data-mtedit],[data-mtout],[data-mtret],[data-mtcancel],[data-sbtog],[data-eqview],[data-cpy],[data-eqdoc],[data-eqx],[data-eqt],[data-hday],[data-qv],[data-qstep],[data-qtoday],[data-jv],[data-cday],[data-wbt],[data-fmnew],[data-fmedit],[data-fmdel],[data-fmc],[data-eqjobs],[data-qk],[data-qsel],[data-sst],[data-osel],[data-dtab],[data-regedit],[data-impedit],[data-svnew],[data-svedit],[data-svdel],[data-cpy],[data-mclose],[data-kbc],[data-kbs],[data-kbdel],[data-dclose],[data-sel],[data-jback],[data-rtab],[data-trres],[data-trdel],[data-trempty],[data-more],[data-pg],[data-pgto],[data-act],[data-save],[data-cancel],[data-mdel],[data-pdel],#padd,#ximport,[data-adduser]');
  if(!t)return;
  if(t.dataset.cnp){S.f.cnp=!S.f.cnp;render();return}
  if(t.dataset.mpop){const k=t.dataset.mpop;if(S.mp&&S.mp.key===k){S.mp=null}else{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+(S.f[k]||0));S.mp={key:k,y:d.getFullYear()}}render();return}
  if(t.dataset.mpy){S.mp.y+=+t.dataset.mpy;render();return}
  if(t.dataset.mpick!==undefined){const k=S.mp?.key;if(k){S.f[k]=+t.dataset.mpick;if(k==='jmo'){S.f.phAll=false;S.f.limit=40;S.f.pg=0}}S.mp=null;render();return}
  if(t.dataset.mn){S.mp=null;const k=t.dataset.mn,d=+t.dataset.d;S.f[k]=d===0?0:(S.f[k]||0)+d;if(k==='jmo'){S.f.phAll=false;S.f.limit=40;S.f.pg=0}render();return}
  if(t.dataset.bk){S.f.bk=t.dataset.bk;render();return}
  if(t.dataset.jmo!==undefined){S.f.phAll=false;const v=+t.dataset.jmo;S.f.jmo=v===0?0:(S.f.jmo||0)+v;S.f.limit=40;S.f.pg=0;render();return}
  if(t.dataset.viewas!==undefined){S.viewAs=t.dataset.viewas||null;Object.assign(S.f,{mine:false,phase:'',status:'all',phAll:false});location.hash==='#today'?render():location.hash='today';return}
  if(t.dataset.nd){nfRead();S.nf.date=t.dataset.nd;S.nf.time='';nfRefresh();return}
  if(t.dataset.nt){nfRead();S.nf.time=t.dataset.nt;nfRefresh();return}
  if(t.dataset.nm){nfRead();S.nf.mo=Math.max(0,(S.nf.mo||0)+(+t.dataset.nm));nfRefresh();return}
  if(t.dataset.copy){const el=$(t.dataset.copy);navigator.clipboard?.writeText(el.value).then(()=>toast('คัดลอกแล้ว'),()=>{el.select()});return}
  if(t.dataset.go){document.getElementById(t.dataset.go)?.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(t.dataset.qclose){toggleClosed(t.dataset.qclose);return}
  if(t.dataset.cmo!==undefined){const v=+t.dataset.cmo;S.f.cmo=v===0?0:(S.f.cmo||0)+v;render();return}
  if(t.dataset.cnosv){S.f.cnosv=!S.f.cnosv;render();return}
  if(t.dataset.cnn){S.f.cnn=!S.f.cnn;render();return}
  if(t.dataset.cst!==undefined){S.f.cst=t.dataset.cst;if(S.f.cst&&S.f.cst!=='active')S.f.cph='';render();return}
  if(t.dataset.cclr){Object.assign(S.f,{cst:'',cph:'',cteam:'',cnp:false,cnn:false,cnosv:false,cq:''});render();return}
  if(t.dataset.edit){if(S.dirty.size&&S.edit!==t.dataset.edit)return toast('บันทึกหรือปิดส่วนที่แก้อยู่ก่อน');S.edit=t.dataset.edit;render();setTimeout(()=>document.querySelector(`[data-sec="${t.dataset.edit}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'}),0);return}
  if(t.dataset.qm!==undefined){const v=+t.dataset.qm;S.f.qm=v===0?0:(S.f.qm||0)+v;render();return}
  if(t.dataset.qd){S.f.qd=t.dataset.qd;return}
  if(t.dataset.phase!==undefined){if(t.tagName==='BUTTON'){e.preventDefault();S.f.phase=S.f.phase===t.dataset.phase?'':t.dataset.phase;S.f.limit=40;S.f.pg=0;render()}else{S.f.phase=t.dataset.phase;S.f.status='active';S.f.mine=false;S.f.phAll=true}return}
  if(t.dataset.mine==='0'){S.f.mine=false;S.f.status='all';if(route()==='jobs')render();return}
  if(t.dataset.mine){S.f.mine=true;S.f.phase='';S.f.status='active';if(route()==='jobs')render();return}
  if(t.dataset.minetoggle){S.f.mine=!S.f.mine;render();return}
  if(t.dataset.kqt){S.f.kqt=t.dataset.kqt;render();return}
  if(t.dataset.kbt){S.f.kqt=t.dataset.kbt;if(route()==='kb')render();return}
  if(t.dataset.eqc){S.f.eqc=t.dataset.eqc;render();return}
  if(t.dataset.eqt){S.f.eqt=t.dataset.eqt==='all'?'':t.dataset.eqt;render();return}
  if(t.dataset.cpy){const v=t.dataset.cpy;navigator.clipboard?.writeText(v).then(()=>toast('คัดลอกแล้ว'),()=>toast(v));return}
  if(t.dataset.eqview){eqDetail(t.dataset.eqview);return}
  if(t.dataset.eqdoc){S.eqv&&eqDetail(S.eqv.id,t.dataset.eqdoc);return}
  if(t.dataset.eqx){if(t.dataset.eqx==='bg'&&e.target!==t)return;S.eqv=null;closeModal();return}
  if(t.dataset.eqnew){openEq(t.dataset.eqnew,'');return}
  if(t.dataset.eqedit){S.eqv=null;openEq('',t.dataset.eqedit);return}
  if(t.dataset.jv){S.f.jv=t.dataset.jv;S.f.pg=0;if(t.dataset.phase!==undefined){S.f.phase=t.dataset.phase;S.f.phAll=true}if(route()!=='jobs')location.hash='jobs';else render();return}
  if(t.dataset.hday){S.f.hday=t.dataset.hday===today()?'':t.dataset.hday;render();return}
  if(t.dataset.cday){S.calDay=t.dataset.cday;render();return}
  if(t.dataset.wbt){const k=t.dataset.wbt;S.wbc=S.wbc||{};S.wbc[k]=!S.wbc[k];render();return}
  if(t.dataset.mtnew){openMeter();return}
  if(t.dataset.mtedit){openMeter(t.dataset.mtedit);return}
  if(t.dataset.mtout){await w('meters/'+t.dataset.mtout,{status:'out',outAt:today()}).then(()=>toast('บันทึกว่าติดตั้งเครื่องแล้ว'),()=>{});return}
  if(t.dataset.mtret){await w('meters/'+t.dataset.mtret,{status:'returned',returnedAt:today()}).then(()=>toast('รับเครื่องคืนแล้ว'),()=>{});return}
  if(t.dataset.sbtog){S.cvAutoMin=0;if(route()==='queue'){CV.maxl=0;setTimeout(render,0)}const m=!document.body.classList.contains('sbmin');document.body.classList.toggle('sbmin',m);try{localStorage.setItem('cl.sbmin',m?'1':'0')}catch(x){}t.setAttribute('aria-expanded',String(!m));t.title=m?'ขยายเมนู':'ย่อเมนู';return}if(t.dataset.mtcancel){const id=t.dataset.mtcancel;closeModal();const ps=(S.meters[id]||{}).status||null;await w('meters/'+id,{status:'cancel'}).then(()=>undoable('ยกเลิกการจองแล้ว เครื่องว่างในช่วงวันนั้น',()=>w('meters/'+id,{status:ps}),'คืนการจองแล้ว'),()=>{});return}
  if(t.dataset.jdel){const id=t.dataset.jdel;closeModal();try{await toTrash('jobs',id)}catch(e){return}S.sel=null;document.body.classList.remove('dlock');if(route()==='job-'+id)location.hash='jobs';else render();return}
  if(t.dataset.fmnew){openForm();return}
  if(t.dataset.fmedit){openForm(t.dataset.fmedit);return}
  if(t.dataset.fmrow){const x=S.forms[t.dataset.fmrow]||{};if(!document.body.classList.contains('rocat'))openForm(x.id||t.dataset.fmrow);else if(isWeb(x.file))window.open(x.file,'_blank','noopener');return}
  if(t.dataset.fmc!==undefined){S.f.fmc=t.dataset.fmc;render();return}
  if(t.dataset.fmdel){const id=t.dataset.fmdel;closeModal();await toTrash('forms',id).catch(()=>{});return}
  if(t.dataset.eqdel){const id=t.dataset.eqdel;closeModal();await toTrash('products',id).catch(()=>{});return}
  if(t.dataset.eqjobs){S.f.q=t.dataset.eqjobs;S.f.status='all';S.f.mine=false;S.f.phase='';return}
  if(t.dataset.qk){S.f.qk=t.dataset.qk;render();return}
  if(t.dataset.qv){S.f.qv=t.dataset.qv;render();return}
  if(t.dataset.qstep||t.dataset.qtoday){const n=new Date();let d=t.dataset.qtoday?new Date():new Date((S.f.qsel||today())+'T00:00:00');if(t.dataset.qstep)d.setDate(d.getDate()+(+t.dataset.qstep)*(S.f.qv==='week'?7:1));
    S.f.qsel=isoOf(d);S.f.qm=(d.getFullYear()-n.getFullYear())*12+(d.getMonth()-n.getMonth());render();return}
  if(t.dataset.qsel&&!e.target.closest('[data-osel],[data-qd],a,button')){S.f.qsel=t.dataset.qsel;render();setTimeout(()=>document.querySelector('.kd.kon')?.focus(),0);return}
  if(t.dataset.sst){S.f.sst=t.dataset.sst;S.f.limit=40;S.f.pg=0;render();return}
  if(t.dataset.osel){const id=t.dataset.osel;if(route()!=='jobs'){S.sel=id;S.dtab=null;document.body.classList.add('dlock');location.hash='jobs'}else openDrawer(id);return}
  if(t.dataset.dtab){S.dtab=t.dataset.dtab;render();return}
  if(t.dataset.regedit){openRegForm(t.dataset.regedit);return}
  if(t.dataset.impedit){openImpForm(t.dataset.impedit);return}
  if(t.dataset.svnew){openSvc(t.dataset.svnew,'',t.dataset.sid);return}
  if(t.dataset.svedit){openSvc('',t.dataset.svedit);return}
  if(t.dataset.svdel){const id=t.dataset.svdel;closeModal();await toTrash('services',id).catch(()=>{});return}
  if(t.dataset.mclose){closeModal();return}
  if(t.dataset.kqc!==undefined){S.f.kqc=t.dataset.kqc;render();return}
  if(t.dataset.kbs){S.f.kbs=t.dataset.kbs;render();return}
  if(t.dataset.kbdel){const a=S.articles[t.dataset.kbdel];if(!a)return;const id=t.dataset.kbdel;S.kbDirty=false;try{await toTrash('articles',id)}catch(e){return}location.hash='kb';return}
  if(t.dataset.dclose){closeDrawer();return}
  if(t.dataset.jback!==undefined){jobBack();return}
  if(t.dataset.trres){const [c,i]=t.dataset.trres.split('/');await restoreTrash(c,i).catch(()=>{});return}
  if(t.dataset.trdel){const [c,i]=t.dataset.trdel.split('/');const x=((S.trash||{})[c]||{})[i];if(!x)return;if(!await confirmBox('ลบ “'+trashTitle(c,x)+'” ถาวร?','ลบแล้วกู้คืนไม่ได้อีก'+(c==='jobs'?' · ข้อมูลลูกค้า ไซต์ และงานบริการที่ไม่มีงานอื่นใช้ จะถูกลบด้วย · ไฟล์ใน Google Drive ยังอยู่':''),'ลบถาวร'))return;await purge(c,i).then(()=>toast('ลบถาวรแล้ว'),()=>{});return}
  if(t.dataset.trempty){const L=trashList();if(!L.length)return;if(!await confirmBox('ล้างถังขยะ?','ทั้งหมด '+L.length+' รายการจะถูกลบถาวร กู้คืนไม่ได้อีก','ล้างถังขยะ'))return;for(const x of L){try{await purge(x.col,x.x.id)}catch(e){}}toast('ล้างถังขยะแล้ว');return}
  if(t.dataset.rtab){S.rtab=t.dataset.rtab;render();document.querySelector(`[data-rtab="${t.dataset.rtab}"]`)?.focus();return}
  if(t.dataset.sel){location.hash='job-'+t.dataset.sel;return}
  if(t.dataset.clear){Object.assign(S.f,{eng:'',phase:'',team:'',inv:'',svst:'',q:'',mine:false,status:'all',phAll:false,pg:0});render();return}
  if(t.dataset.more){S.f.limit+=40;render();return}
  if(t.dataset.pg||t.dataset.pgto!==undefined){S.f.pg=t.dataset.pgto!==undefined?+t.dataset.pgto:S.f.pg+ +t.dataset.pg;render();document.querySelector('.tq')?.scrollIntoView({block:'start',behavior:'smooth'});return}
  if(t.dataset.status){S.f.status=t.dataset.status;S.f.phase='';S.f.phAll=false;S.f.mine=false;S.f.limit=40;S.f.pg=0;render();return}
  if(t.dataset.save)return saveSec(t.dataset.save);
  if(t.dataset.cancel){S.dirty.delete(t.dataset.cancel);if(S.edit===t.dataset.cancel)S.edit=null;render();return}
  if(t.dataset.act)return doAct(t.dataset.act,t.dataset.jid);
  if(t.dataset.mdel)return w('members/'+t.dataset.mdel,null,'delete').then(()=>toast('ลบแล้ว'));
  if(t.dataset.pdel)return w('products/'+t.dataset.pdel,null,'delete');
  if(t.dataset.adduser)return w('members/'+t.dataset.adduser,{role:'sales_en',team:'',addedAt:Date.now()},'set').then(()=>{$('#ures').innerHTML='';$('#usearch').value='';toast('เพิ่มแล้ว เลือกโรลในตาราง')});
  if(t.id==='padd'){const m=$('#pmodel').value.trim(),c=$('#pcat').value;if(!m)return;await w('products/'+pid(c,m),{category:c,model:m},'set');$('#pmodel').value='';return}
  if(t.id==='ximport'){const f=$('#xfile').files[0];if(!f)return toast('เลือกไฟล์ Excel ก่อน');return runImport(f)}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='gq'){gSearch(t.value);return}
  if(t.id==='cq'){S.f.cq=t.value;render();return}
  if(t.id==='kbq'){S.f.kbq=t.value;render();return}
  if(t.id==='eqq'){S.f.eqq=t.value;render();const el=$('#eqq');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}return}
  if(t.id==='fmq'){S.f.fmq=t.value;render();const el=$('#fmq');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}return}
  if(t.closest('#kbForm')){S.kbDirty=true;return}
  if(t.id==='jq'){S.f.q=t.value;S.f.limit=40;S.f.pg=0;render();return}
  if(t.id==='usearch')return userSearch(t.value);
  if(t.id==='n-meter'||t.id==='n-mdays'){nfRead();const mb=$('#n-mtbox');if(t.id==='n-meter'&&mb)mb.innerHTML=mtBox(S.nf);else{const pk=document.querySelector('.mpkf');if(pk)pk.innerHTML='<span>เครื่องที่ว่าง</span>'+meterPick(S.nf.date,S.nf.mdays)}}
  if(t.closest('#newForm')){nfRead();if(t.id==='n-addr'){const b=$('#n-mapbtn');if(b)b.href=mapsDir(t.value)}const mi=document.querySelector('.nmiss'),r=nfReady();if(mi)mi.textContent=r.ok?'':'ยังขาด: '+r.miss.join(' · ');const mc=document.querySelector('.nmissc');if(mc)mc.textContent=r.ok?'ข้อมูลครบ พร้อมจอง':'ยังขาด '+r.miss.length+' ช่อง';const sb=document.querySelector('.nsub .btn');if(sb)sb.toggleAttribute('aria-disabled',!r.ok);return}
  const sec=t.closest('[data-sec]');if(sec){S.dirty.add(sec.dataset.sec);sec.classList.add('dirty')}
});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.id==='team'){S.f.team=t.value;S.f.pg=0;render();return}
  if(t.id==='jper'){S.f.per=+t.value;S.f.pg=0;render();return}
  if(t.name==='kbcol'){S.kbDirty=true;t.closest('.kbpick').querySelectorAll('label').forEach(l=>l.classList.toggle('on',l.contains(t)));return}
  if(t.id==='jeng'){S.f.eng=t.value;S.f.limit=40;S.f.pg=0;render();return}
  if(t.closest('.dctl')){const sp=t.closest('.dctl').querySelector('span');if(sp)sp.textContent=t.value?fd(t.value):'เลือกวัน'}
  if(t.id==='vasel'){S.viewAs=t.value;Object.assign(S.f,{mine:false,phase:'',status:'all',phAll:false});location.hash==='#today'?render():location.hash='today';return}
  if(t.id==='jph'){S.f.phase=t.value;S.f.phAll=false;S.f.limit=40;S.f.pg=0;render();return}
  if(t.id==='cph'||t.id==='cteam'){S.f[t.id]=t.value;render();return}
  if(t.id==='sort'){S.f.sort=t.value;render();return}
  if(t.dataset.mrole)return w('members/'+t.dataset.mrole,{role:t.value});
  if(t.dataset.mteam)return w('members/'+t.dataset.mteam,{team:t.value});
  if(t.id==='xfile'){const n=$('#xfname');if(n)n.textContent=t.files[0]?.name||'เลือกไฟล์ .xlsx';return}
  if(t.closest('#newForm')){nfRead();return}
  if(t.id==='n-pick'){const c=S.customers[t.value]||{};NEWF.cust.fields.forEach(([k])=>{const el=document.getElementById('n-cust-'+k);if(el)el.value=c[k]||(k==='type'?'บุคคล':'')});return}
  const sec=t.closest('[data-sec]');if(sec){S.dirty.add(sec.dataset.sec);sec.classList.add('dirty')}
});
function onFormSubmit(f,sub){const id=f.id;if(id==='mtF')return saveMeter();if(id==='fmF')return saveForm();if(id==='eqF')return saveEq();if(id==='regF')return saveReg();if(id==='impF')return saveImp();if(id==='svF')return saveSvc();if(id==='kbForm')return kbSave(f,sub?.dataset.mode||'draft');if(id==='newForm')return createJob(sub?.dataset.mode||'draft');if(typeof f.onsubmit==='function')f.onsubmit({preventDefault(){},target:f,submitter:sub})}
document.addEventListener('submit',e=>{e.preventDefault();if(typeof e.target.onsubmit==='function')return;onFormSubmit(e.target,e.submitter)});
/* ปุ่มบันทึกในฟอร์ม: เรียกเองแทนการ submit จริง (หน้าตัวอย่างในแชตบล็อกการ submit ฟอร์ม) · ตรวจช่องบังคับเหมือนเดิม */
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!b.form||b.type!=='submit')return;e.preventDefault();if(b.disabled)return;const f=b.form;if(!f.noValidate&&!f.checkValidity()){f.reportValidity();return}onFormSubmit(f,b)});
window.addEventListener('hashchange',()=>{const r2=route(),from=NAV.cur||'';NAV.scr[from]=scrollY;NAV.prev=from;NAV.cur=r2;NAV.inApp=true;NAV.fromJob=from.startsWith('job-')&&!r2.startsWith('job-')?from.slice(4):'';S.lastOpen=NAV.fromJob||null;if(document.querySelector('.fmod'))closeModal();S.kbDirty=false;S.mp=null;if(route()!=='jobs'&&route()!=='service'&&!route().startsWith('site')){S.sel=null;document.body.classList.remove('dlock')}S.dirty.clear();S.edit=null;if(route()!=='new'&&!(route()==='queue'&&S.cvBk)){S.f.qd='';S.nf={};S.cvBk=0}else if(S.f.qd){S.nf={date:S.f.qd}}const y=NAV.fromJob&&NAV.scr[r2]!=null?NAV.scr[r2]:0;window.scrollTo(0,0);vt(()=>{render();window.scrollTo(0,y);if(S.lastOpen){const tr=document.querySelector(`tr[data-sel="${CSS.escape(S.lastOpen)}"]`);if(tr)tr.focus({preventScroll:true});const id=S.lastOpen;setTimeout(()=>{if(S.lastOpen===id){S.lastOpen=null;document.querySelectorAll('tr.lastop').forEach(x=>x.classList.remove('lastop'))}},1600)}})});
NAV.cur=route();

async function saveSec(id){
  const j=S.jobs[route().slice(4)];if(!j)return;
  const sec=SECTIONS.find(x=>x.id===id);const root=document.querySelector(`[data-sec="${id}"]`);
  const data=readForm(root,sec);const now=Date.now();sec.fields.forEach(f=>{if(fieldLocked(sec,f[0]))delete data[f[0]]});
  if(id==='wo'&&!isDispatch())Object.keys(data).forEach(k=>{if(!['jobNo','woNote'].includes(k))delete data[k]});   // แอดมินแก้ได้แค่เลขใบงาน + หมายเหตุใบงาน (ทีมสำรวจเปลี่ยนผ่านปุ่มจัดทีม)
  for(const f of sec.fields)if(f[2]==='url'&&data[f[0]]){const u=normUrl(data[f[0]]);if(!u){toast('ลิงก์ "'+f[1]+'" ต้องขึ้นต้นด้วย https://');return}data[f[0]]=u}
  const old=getT(sec.tgt,j,cOf(j),sOf(j))||{};const nv=v=>v===undefined||v===null||v===false?'':String(v);
  const chF=sec.fields.filter(f=>f[2]!=='h'&&f[0] in data&&nv(data[f[0]])!==nv(old[f[0]]));const ch=chF.map(f=>String(f[1]).replace(/\s*\(.*?\)/g,''));const chK=chF.map(f=>f[0]);
  if(id==='eq'){const sl=[...root.querySelectorAll('.eqsl')].map(r=>{const o={role:'Slave'};r.querySelectorAll('[data-uk]').forEach(x=>o[x.dataset.uk]=x.value.trim());return o}).filter(u=>u.model||u.sn||u.wifiSn);
    if(sl.some(u=>!u.sn)){toast('ใส่ S/N ของเครื่อง Slave ให้ครบ');return}
    const nu=sl.length?[{role:'Master'},...sl]:[];if(JSON.stringify(nu.slice(1))!==JSON.stringify(invUnits(old).slice(1).map(u=>({role:'Slave',model:u.model||'',sn:u.sn||'',wifiSn:u.wifiSn||''}))))ch.push('เครื่อง Slave');data.units=nu;if(ch.includes('เครื่อง Slave'))chK.push('units')}
  if(id==='order'&&data.queueDate&&j.surveyDate&&j.surveyDate!==data.queueDate){data.surveyDate=data.queueDate;if(!chK.includes('queueDate')){ch.push('วันนัดสำรวจ');chK.push('surveyDate')}}
  if(!ch.length){toast('ยังไม่มีการเปลี่ยนแปลง');return}
  // แก้เลขใบงาน: ตรวจรูปแบบ/ซ้ำ · ยืนยัน · จองเลขใหม่ ปล่อยเลขเก่า
  const noOld=String(j.jobNo||''),noNew=id==='wo'&&'jobNo' in data?String(data.jobNo||'').trim():noOld;
  if(noNew!==noOld){
    if(!noNew){toast('ลบเลขใบงานไม่ได้ ใส่เลขใหม่แทน');return}
    if(!/^\d{7}$/.test(noNew)){toast('เลขใบงานต้องเป็นตัวเลข 7 หลัก (ปี 2 + เดือน 2 + ลำดับ 3) เช่น '+nextJobNo());return}
    const dupJ=Object.values(S.jobs).find(x=>x.id!==j.id&&String(x.jobNo||'')===noNew);
    if(dupJ){toast('เลข '+noNew+' ซ้ำกับงาน '+(dupJ.title||dupJ.id));return}
    try{const r=snapData(await S.db.doc('jobnos/'+noNew).get());if(noHeld(r,noNew,j.id)){const o=S.jobs[r.jid];toast('เลข '+noNew+' ถูกจองให้งาน '+(o.title||o.jobNo||r.jid)+' แล้ว');return}}catch(e){}
    data.jobNo=noNew;
    if(!await confirmBox('เปลี่ยนเลขใบงานเป็น '+noNew+'?',(noOld?'จาก '+noOld+' · ':'')+'ชื่อโฟลเดอร์งานใน Google Drive จะเปลี่ยนตาม'+(noOld?' · เลขเดิมจะว่างให้ใช้ใหม่ได้':''),'เปลี่ยนเลข','pri'))return;
  }
  const undoL=[],w=async(p,patch,...r)=>{const [c,i]=String(p).split('/');const o=(S[c]||{})[i]||{};undoL.push([p,Object.fromEntries(Object.keys(patch).filter(k=>k!=='updatedAt').map(k=>[k,o[k]===undefined?null:o[k]]))]);return window.w(p,patch,...r)};
  try{
    if(sec.tgt==='customer'){if(!j.customerId)return;const oc=cOf(j);await w('customers/'+j.customerId,{...data,updatedAt:now});
      // ชื่องานที่ระบบตั้งจากชื่อลูกค้าเดิม (หรือชื่อหลอก) → เปลี่ยนตามชื่อใหม่ ทั้งงานนี้และงานอื่นของลูกค้าคนนี้ · ชื่อที่ตั้งเองไม่แตะ
      const nc={...oc,...data},nt=autoTitle(nc),ot=autoTitle(oc),olds=[ot,'คุณ'+realName(oc),'คุณ'+(oc.firstName||'')].filter(Boolean);
      if(nt&&nt!==ot){const isAuto=t=>badTitle(t)||olds.some(o=>t===o||t.startsWith(o+' ')&&/ kW$/.test(t));
        for(const x of Object.values(S.jobs))if(x.customerId===j.customerId&&isAuto(String(x.title||''))){const kw=String(x.title).match(/ \d[\d.]* kW$/);await w('jobs/'+x.id,{title:nt+(kw?kw[0]:''),updatedAt:now})}
        const st=S.sites&&S.sites[j.siteId];if(st&&isAuto(String(st.label||'')))await w('sites/'+j.siteId,{label:nt,updatedAt:now});
        if(realName(nc)!==String(oc.name||''))await w('customers/'+j.customerId,{name:realName(nc)})}}
    else if(sec.tgt==='site'){if(!j.siteId)return;await w('sites/'+j.siteId,{...data,updatedAt:now})}
    else if(sec.tgt==='job'){await w('jobs/'+j.id,{...data,updatedAt:now})}
    else{const k=sec.tgt.split('.')[1];const nd={...(j[k]||{}),...data};await w('jobs/'+j.id,{[k]:k==='equipment'?eqSync(nd):nd,updatedAt:now})}
    if(noNew!==noOld){try{await S.db.doc('jobnos/'+noNew).set({jid:j.id,at:Date.now(),by:S.me.id||null});if(noOld)await S.db.doc('jobnos/'+noOld).set({jid:null,freedAt:Date.now(),by:S.me.id||null,was:j.id})}catch(e){console.warn('jobnos',e)}}
    S.dirty.delete(id);if(S.edit===id)S.edit=null;S.saved={sec:id,keys:chK,at:Date.now()};render();
    const sname=String(sec.title).replace(/\s*\(.*?\)/g,'');if(noNew===noOld)undoable('บันทึก'+sname+'แล้ว',async()=>{for(const [p,o] of undoL.reverse())await window.w(p,{...o,updatedAt:Date.now()})},'คืนค่าเดิมแล้ว');else toast('บันทึกแล้ว');
  }catch(e){}
}
function nextJobNo(){
  const d=new Date();const pre=String((d.getFullYear()+543)%100).padStart(2,'0')+String(d.getMonth()+1).padStart(2,'0');
  let mx=0;Object.values(S.jobs).forEach(j=>{const s=String(j.jobNo||'');if(s.length===7&&s.startsWith(pre))mx=Math.max(mx,+s.slice(4)||0)});
  return pre+String(mx+1).padStart(3,'0');
}
async function doAct(a,jid){
  const key=a+'|'+(jid||route());S.actBusy=S.actBusy||{};if(S.actBusy[key])return toast('กำลังบันทึก รอสักครู่…');S.actBusy[key]=1;
  try{return await doAct0(a,jid)}finally{delete S.actBusy[key]}
}
async function doAct0(a,jid){
  const j=S.jobs[jid||route().slice(4)];if(!j)return;const n=j.stage;const now=Date.now();
  if(a==='fixtitle'){const nt=autoTitle(cOf(j));if(!nt||!badTitle(j.title))return;await w('jobs/'+j.id,{title:nt,updatedAt:now});const st=S.sites&&S.sites[j.siteId];if(st&&badTitle(st.label))await w('sites/'+j.siteId,{label:nt,updatedAt:now});toast('ตั้งชื่องานเป็น '+nt);render();return}
  if(a==='note'){const v=$('#note').value.trim();if(!v)return;await pushHist(j,ev('note',v));return}
  if(a==='accept'){
    let eng=(($('#acc-eng-'+j.id)||$('#acc-eng'))?.value||'').trim();if(!eng)return toast('เลือกคนสำรวจก่อน');
    const outSv=eng==='__out';   // คนสำรวจนอกระบบ: เก็บชื่อ ไม่มี surveyorId · ทีมใน Man กรอกแทนได้
    if(outSv){eng=(($('#acc-out'))?.value||'').trim()||((await ask('ชื่อคนสำรวจ (นอกระบบ)','ชื่อเล่นหรือชื่อจริง'))||'').trim();if(!eng)return toast('พิมพ์ชื่อคนสำรวจก่อน');
      if(Object.values(S.members||{}).some(m=>m.name===eng))return toast(eng+' อยู่ในระบบแล้ว เลือกจากรายการแทน')}if(SV_TEAMS.includes(eng)&&j.queueDate){const b=S.me.role?teamBlock(eng,j.queueDate,j.id,j.queueTime,j):(teamSlots(eng,j.queueDate,j.id)?'':teamWhy(eng,j.queueDate,j.id));if(b)return toast(eng+' · '+b)}
    const who=outSv?null:Object.entries(S.members||{}).find(([,m])=>m.name===eng);const help=(($('#acc-help'))?.value||'').trim();
    const no=j.jobNo||await claimJobNo(j.id);const wn=(($('#acc-note-'+j.id)||$('#acc-note'))?.value||'').trim();
    await pushHist(j,ev('handoff',`ส่งใบงาน ${no} · สำรวจ ${fd(j.queueDate)} ${j.queueTime||''} · ${eng}${outSv?' (นอกระบบ)':''}${help?' + '+help:''}`,{from:j.stage,to:ST.SURVEY}),{jobNo:no,surveyor:eng,surveyTeam:SV_TEAMS.includes(eng)?eng:'',...(S.me.role?{surveyorId:who?who[0]:'',surveyHelpers:help}:{}),surveyDate:j.queueDate,woNote:wn,stage:ST.SURVEY,stageSince:now});
    toast('ส่งใบงาน '+no+' ให้ '+eng+(help?' + '+help:'')+' แล้ว');return}
  if(a==='bookins'){
    const d=(($('#ins-d-'+j.id)||$('#ins-d'))?.value||'').trim();if(!d)return toast('เลือกวันเริ่มติดตั้งก่อน');
    let e2=(($('#ins-e-'+j.id))?.value||'').trim();if(e2&&e2<d)return toast('วันสุดท้ายต้องไม่ก่อนวันเริ่มติดตั้ง');if(e2===d)e2='';
    const lb=e2?`${fd(d)} – ${fd(e2)}`:fd(d);const tm=(($('#ins-t'))?.value||'').trim();
    await pushHist(j,ev('handoff',`จองคิวติดตั้ง ${lb}${tm?' · ผู้รับเหมา '+tm:''}`,{from:ST.INSREQ,to:ST.INSTALL}),{installDate:d,installEnd:e2,...(tm?{installTeam:tm}:{}),stage:ST.INSTALL,stageSince:now});
    toast('จองคิวติดตั้ง '+lb+' แล้ว');return}
  if(a==='impins'){if(!isImp(j)||n!==ST.COMM||j.status!=='active')return;
    if(!await confirmBox('ติดตั้งเสร็จไปแล้ว?','งานนำเข้าที่ติดตั้งเสร็จนอกระบบ · งานจะไปขั้น "'+STAGES[ST.DOCS].name+'" โดยไม่มีใบงานติดตั้ง และบันทึกในไทม์ไลน์','ย้ายขั้น','pri'))return;
    await pushHist(j,ev('handoff','ติดตั้งเสร็จนอกระบบ ย้ายไปเอกสารขนานไฟ (งานนำเข้าจาก Excel)',{from:ST.COMM,to:ST.DOCS}),{stage:ST.DOCS,stageSince:now});toast('ย้ายไปเอกสารขนานไฟแล้ว');return}
  if(a==='impsv'){if(!isImp(j)||n!==ST.SURVEY||j.status!=='active')return;
    if(!await confirmBox('ปิดงานสำรวจแทนคนสำรวจ?','งานนำเข้าที่สำรวจเสร็จไปแล้ว · งานจะไปขั้น "'+STAGES[ST.OFFER].name+'" และบันทึกในไทม์ไลน์ว่าแอดมินปิดแทน','ปิดงานสำรวจ','pri'))return;
    await pushHist(j,ev('handoff','แอดมินปิดงานสำรวจแทน (งานนำเข้าจาก Excel)',{from:ST.SURVEY,to:ST.OFFER}),{stage:ST.OFFER,stageSince:now});toast('ปิดงานสำรวจแล้ว');return}
  if(a==='decline'){const r=await ask('ขอเปลี่ยนวันสำรวจ','เหตุผล เช่น คนสำรวจไม่ว่างวันนั้น');if(r==null)return;
    await pushHist(j,ev('back','ขอเปลี่ยนวันสำรวจ: '+r,{from:ST.ACCEPT,to:ST.BOOK}),{stage:ST.BOOK,stageSince:now});return}
  if(a.startsWith('sv:')){
    const k=a.slice(3);const v={...(j.sv||{})};let txt='',kind='edit';
    if(k==='accepted'){v.accepted=now;txt='ตอบรับใบงาน '+(j.jobNo||'')}
    if(k==='folder'){const f=($('#sv-folder')?.value||'').trim();if(!f)return toast('ใส่ที่อยู่โฟลเดอร์ก่อน');v.folder=f;v.folderAt=now;txt='สร้างโฟลเดอร์งาน '+f}
    if(k==='onsite'){v.onsite=now;txt='ถึงหน้างาน เริ่มสำรวจ'}
    if(k==='photos'){const c=+($('#sv-photos')?.value||0);if(!c)return toast('ใส่จำนวนรูป');v.photos=c;v.photosAt=now;txt=`ส่งรูปหน้างาน ${c} รูปเข้าโฟลเดอร์`}
    if(k==='sign'){const sg=await signPad(cOf(j));if(!sg)return;v.sign=sg;txt='ลูกค้าเซ็นปิดงานสำรวจ ('+sg.name+')';kind='surveyed'}
    if(k==='cad'){v.cad=now;txt='วาดแบบใน CADabra เสร็จ'}
    if(k==='cadFiled'){v.cadFiled=now;txt='เก็บไฟล์แบบในโฟลเดอร์แล้ว'}
    if(k==='undo'){const ks=['cadFiled','cad','sign','photos','onsite','folder','accepted'];const last=ks.find(x=>v[x]);if(!last)return;delete v[last];await w('jobs/'+j.id,{sv:v,updatedAt:now});return}
    await pushHist(j,ev(kind,txt),{sv:v,...(k==='sign'?{surveyDoneAt:now}:{})});return}
  if(a==='svclose'){
    await pushHist(j,ev('handoff',`ปิดงานสำรวจ ส่งข้อมูลและแบบ ${j.proposedKw?j.proposedKw+' kW ':''}ให้เซลส์${j.quoter?' CC '+j.quoter:''}`,{from:ST.SURVEY,to:ST.OFFER}),{stage:ST.OFFER,stageSince:now,designSentDate:today()});
    toast('ส่งข้อมูลให้เซลส์แล้ว');return}
  if((a==='next'&&n===ST.OFFER)||a==='reopen'){const r=await askResurvey(j);if(r!==false)return}
  if(a==='next'){const to=n+1;await pushHist(j,ev('handoff',`ส่งต่อให้${nextWho(j,to)} (${STAGES[to].name})`,{from:n,to}),{stage:to,stageSince:now});toast('ส่งต่อแล้ว');return}
    if(a==='pmdone'){const d=today();await pushHist(j,ev('edit','ตรวจเช็กประจำปีแล้ว '+fd(d)),{lastPm:d});toast('บันทึกแล้ว ครบกำหนดครั้งถัดไป '+fd(pmDue({...j,lastPm:d})));return}
  if(a==='done'){await pushHist(j,ev('handoff','ยื่นขนานไฟฟ้าเสร็จ ปิดงาน ครบตรวจเช็กประจำปี '+fd(pmDue(j)),{from:LAST}),{status:'done',stageSince:now});return}
  if(a==='cancel'){const r=await ask('ยกเลิกคิวสำรวจนี้?','เหตุผล',{danger:true,icon:'xc',ok:'ยกเลิกคิว',no:'กลับ',msg:'คิวจะว่างให้งานอื่นทันที จองใหม่ได้ภายหลัง'});if(!r)return;
    await pushHist(j,ev('lost','ยกเลิกคิว: '+r),{status:'cancelled',cancelReason:r,cancelledAt:now,stageSince:now});toast('ยกเลิกแล้ว คิวว่างให้งานอื่น');return}
  if(a==='addon'){const c=cOf(j),s=sOf(j);
    S.nf={parent:j.id,first:c.firstName||c.name||'',last:c.lastName||'-',phone:c.phone||'',email:c.email||'',addr:c.address||s.address||'',map:s.mapLink||'',team:j.salesTeam||'',person:j.salesPerson||'',note:'ติดตั้งเพิ่ม'};S.nf._ro=Object.fromEntries(['first','last','phone','email','addr','map'].map(k=>[k,!!S.nf[k]]));
    location.hash='new';return}
  if(a==='resume'){await pushHist(j,ev('handoff','เปิดงานต่อ ('+STAGES[n].name+')'),{status:'active',stageSince:now,cancelReason:'',cancelledAt:null,autoCancelled:false});toast('เปิดงานต่อแล้ว');return}
  if(a==='rebook'){if(!await confirmBox('จองใหม่','ใช้ข้อมูลเดิม แล้วเลือกวันสำรวจใหม่','จองใหม่','dk'))return;
    await pushHist(j,ev('handoff','จองใหม่ (ข้อมูลเดิม)',{to:ST.BOOK}),{status:'active',stage:ST.BOOK,stageSince:now,cancelReason:'',cancelledAt:null,autoCancelled:false,surveyTeam:'',surveyor:'',surveyorId:'',surveyHelpers:'',queueUnlock:''});toast('เปิดงานแล้ว เลือกวันใหม่');return}
  if(a==='reopen'){await pushHist(j,ev('handoff','ลูกค้าตกลง ไปนัดติดตั้ง',{to:ST.INSREQ}),{status:'active',stage:ST.INSREQ,stageSince:now,lostReason:''});return}
  if(a==='lost'||a==='back'){
    const title={lost:'ลูกค้ายังไม่ตกลง',back:`ย้อนกลับไป${STAGES[n-1].name}`}[a];
    const r=await ask(title,'เหตุผล');if(r==null)return;
    if(a==='lost')await pushHist(j,ev('lost','ลูกค้ายังไม่ตกลง: '+r),{status:'lost',lostReason:r,stageSince:now});
    if(a==='back')await pushHist(j,ev('back',`ย้อนกลับไป${STAGES[n-1].name}: ${r}`,{from:n,to:n-1}),{stage:n-1,stageSince:now});
  }
}
function confirmBox(title,msg,ok,cls){return new Promise(res=>{
  const m=$('#modal');m.innerHTML=`<div class="modalbg"><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cfT" aria-describedby="cfM">${!cls||cls==='danger'?`<span class="cfi">${svg(/ยกเลิก/.test(ok)?'xc':'trash','currentColor',2)}</span>`:''}<h2 id="cfT" style="margin:0;font-size:20px">${esc(title)}</h2><p id="cfM" style="margin:0;color:var(--mut);font-size:16px;line-height:1.6">${esc(msg)}</p><div class="mft"><button class="btn" id="cfN" type="button">${/ยกเลิก/.test(ok)?'กลับ':'ยกเลิก'}</button><button class="btn ${cls||'danger'}" id="cfY" type="button">${esc(ok)}</button></div></div></div>`;
  const done=v=>{m.innerHTML='';document.removeEventListener('keydown',k,true);res(v)};const k=e=>{if(e.key==='Escape'){e.stopPropagation();done(false)}};
  document.addEventListener('keydown',k,true);$('#cfN').onclick=()=>done(false);$('#cfY').onclick=()=>done(true);$('#cfN').focus();
})}
function askVal(title,label,val){return new Promise(res=>{ask(title,label).then(res);const i=$('#askv');if(i){i.value=val||'';i.select()}})}
function ask(title,label,o={}){return new Promise(res=>{
  const m=$('#modal');m.innerHTML=`<div class="modalbg"><form class="modal" id="askf">${o.danger?`<span class="cfi">${svg(o.icon||'warn','currentColor',2)}</span>`:''}<h2 style="margin:0;font-size:20px">${esc(title)}</h2>${o.msg?`<p style="margin:0;color:var(--mut);font-size:16px;line-height:1.6">${esc(o.msg)}</p>`:''}<label class="fld" for="askv">${esc(label)}<input type="text" id="askv" required></label><div class="mft"><button class="btn" type="button" id="askc">${esc(o.no||'ยกเลิก')}</button><button class="btn ${o.danger?'danger':'dk'}" type="submit">${esc(o.ok||'ยืนยัน')}</button></div></form></div>`;
  const done=v=>{m.innerHTML='';document.removeEventListener('keydown',k,true);res(v)};const k=e=>{if(e.key==='Escape'){e.stopPropagation();done(null)}};
  document.addEventListener('keydown',k,true);$('#askv').focus();
  $('#askf').onsubmit=e=>{e.preventDefault();done($('#askv').value.trim())};
  $('#askc').onclick=()=>done(null);
})}
async function createJob(mode){
  if(S.creating)return toast('กำลังบันทึก รอสักครู่…');S.creating=true;
  const bt=[...document.querySelectorAll('#newForm button[type=submit],#newForm button:not([type])')];bt.forEach(b=>{b.disabled=true;b.dataset.t0=b.textContent;b.textContent='กำลังบันทึก…'});
  try{return await createJob0(mode)}finally{S.creating=false;bt.forEach(b=>{if(b.isConnected){b.disabled=false;b.textContent=b.dataset.t0}})}
}
/* เขียนหลายรายการครั้งเดียว (ตัวกลาง Google) · โหมดตัวอย่างเขียนทีละรายการ */
async function wMany(list){
  if(!S.db.batch){for(const [p,d,m] of list)await w(p,d,m);return}
  const b=S.db.batch();list.forEach(([p,d,m])=>{const r=S.db.doc(p);if(m==='set')b.set(r,d);else if(m==='delete')b.delete(r);else b.update(r,d)});
  try{await b.commit();list.forEach(([p])=>cvMark(p))}catch(e){
    if(e?.code==='bad'&&/batch/.test(e.message||'')){for(const [p,d,m] of list)await w(p,d,m);return} /* ตัวกลางรุ่นเก่ายังไม่รู้จักการเขียนรวด → เขียนทีละรายการ */
    toast('บันทึกไม่ได้: '+(e?.message||'ลองอีกครั้ง'));throw e}
}
async function createJob0(mode){
  const f=nfRead();const r=nfReady();
  if(!r.ok){nfRefresh();return toast('ยังขาด: '+r.miss.join(', '))}
  const di=dayInfo(f.date);if(di.closed||di.left<1||di.taken.includes(f.time)){f.time='';nfRefresh();return toast('คิวนี้ถูกจองไปแล้ว เลือกเวลาใหม่')}
  const now=Date.now();const name=autoTitle({firstName:f.first,lastName:f.last})||`คุณ${f.first} ${f.last}`;
  try{
    const ad=f.parent?S.jobs[f.parent]:null;
    const old=!ad&&f.cid&&S.customers[f.cid]?f.cid:'';
    const cid=ad?ad.customerId:old||S.db.collection('customers').doc().id;
    const W3=ad?[]:old?[['customers/'+cid,{phone:f.phone,...(f.email?{email:f.email}:{}),...(f.addr?{address:f.addr}:{})},'update']]:[['customers/'+cid,{firstName:f.first,lastName:f.last,name:f.first+' '+f.last,type:'บุคคล',phone:f.phone,email:f.email,address:f.addr,createdAt:now},'set']];
    const sid=ad?ad.siteId:S.db.collection('sites').doc().id;
    if(ad){const oc=cOf(ad),os=sOf(ad);if(f.phone&&f.phone!==(oc.phone||''))W3.push(['customers/'+cid,{phone:f.phone},'update']);if(normUrl(f.map)&&normUrl(f.map)!==(os.mapLink||''))W3.push(['sites/'+sid,{mapLink:normUrl(f.map)},'update'])}
    if(!ad)W3.push(['sites/'+sid,{customerId:cid,label:name,mapLink:normUrl(f.map),address:f.addr,createdAt:now},'set']);
    const jid=S.db.collection('jobs').doc().id;
    W3.push(['jobs/'+jid,{type:ad?'addon':'solar',...(ad?{parentJobId:ad.id}:{}),customerId:cid,siteId:sid,title:ad?(ad.title||name)+' · ติดตั้งเพิ่ม':name,salesTeam:f.team,salesPerson:f.person,queueDate:f.date,queueTime:f.time,salesNote:f.note,
      status:'active',stage:ST.ACCEPT,stageSince:now,createdAt:now,updatedAt:now,
      history:[ev('create',ad?`ขอติดตั้งเพิ่ม (ไซต์เดิม ${ad.jobNo?'#'+ad.jobNo:ad.title||''})`:`แจ้งงานสำรวจ ${name}`),ev('handoff',`จองคิวสำรวจ ${fd(f.date)} ${f.time} รอเลือกคนสำรวจ`,{from:ST.BOOK,to:ST.ACCEPT})]},'set']);
    await wMany(W3);
    if(f.meter){const to=isoAdd(f.date,(f.mdays||7)-1);const dev=freeMeters(f.date,to)[0];
      await w('meters/'+S.db.collection('meters').doc().id,{device:dev||'',from:f.date,to,jobId:jid,title:name,phone:f.phone,team:f.team,person:f.person,source:'job',status:'booked',createdAt:now},'set');
      if(!dev)toast('ช่วงวันนั้นสมาร์ทมิเตอร์ไม่ว่าง บันทึกเป็นคำขอรอจัดเครื่อง')}
    let sent='';const eng=nfCanAssign()&&f.eng&&!teamBlock(f.eng,f.date,null,f.time,null)?f.eng:'';
    if(eng){try{const no=await claimJobNo(jid);const who=Object.entries(S.members||{}).find(([,m])=>m.name===eng);const jj=W3.find(x=>x[0]==='jobs/'+jid)[1];
      await pushHist({id:jid,...jj},ev('handoff',`ส่งใบงาน ${no} · สำรวจ ${fd(f.date)} ${f.time} · ${eng}${(f.help||[]).length?' + '+f.help.join(', '):''}`,{from:ST.ACCEPT,to:ST.SURVEY}),{jobNo:no,surveyor:eng,surveyTeam:eng,surveyorId:who?who[0]:'',surveyDate:f.date,stage:ST.SURVEY,stageSince:Date.now(),...((f.help||[]).length?{surveyHelpers:f.help.join(', ').slice(0,200)}:{})});sent=`ส่งใบงาน ${no} ให้${eng}แล้ว`}catch(x){sent='ยังไม่ได้ส่งใบงาน · เปิดงานแล้วส่งต่อได้'}}
    if(!eng&&(f.help||[]).length&&nfCanAssign()){try{await w('jobs/'+jid,{surveyHelpers:f.help.join(', ').slice(0,200),updatedAt:Date.now()})}catch(x){}} /* คนไปด้วยตอนจองคิว (ผู้ใช้ 27 พ.ย.) */
    S.nfDone={jid,name,date:f.date,time:f.time,sent};S.nf={team:f.team,person:f.person,mo:f.mo};if(S.cvBk){CV.newId='job:'+jid+':s';S.f.qsel=f.date;S.f.cvm=f.date.slice(0,8)+'01'}toast('จองคิว '+name+' แล้ว'+(sent?' · '+sent:''));render();scrollTo(0,0);
  }catch(e){}
}
let us=0;async function userSearch(q){
  clearTimeout(us);us=setTimeout(async()=>{
    if(!S.user?.search){$('#ures').innerHTML='<span class="sub">ค้นหาคนไม่ได้ในมุมมองนี้</span>';return}
    try{const hits=await S.user.search(q);$('#ures').innerHTML=(hits||[]).filter(h=>!S.members[h.id]).slice(0,8).map(h=>`<button class="btn sm" data-adduser="${esc(h.id)}">+ ${esc(h.name||'ไม่มีชื่อ')}</button>`).join('')||'<span class="sub">ไม่พบ</span>'}catch(e){}
  },250);
}

/* ---------- import ---------- */
function xd(v){if(!(v instanceof Date)||isNaN(v))return '';const d=new Date(v.getTime()+12*3600e3);if(d.getFullYear()<2000)return '';return isoOf(d)}
const xs=v=>v==null?'':(v instanceof Date?xd(v):String(v).trim());
const real=v=>{const s=xs(v);return s&&s!=='-'?s:''};
function parseRow(r,rowNo,nowMs){
  const raw=xs(r[1]);
  const tagM=raw.match(/\((EN|SA-[A-Z0-9]+)\)/i);
  let team=xs(r[3]);team=team==='EN'?'EN':/^D\w+$/i.test(team)?'SA-'+team.toUpperCase():(tagM?tagM[1].toUpperCase():'');
  const ref=(raw.match(/ลูกค้า\s*(?:ของ)?\s*((?:พี่|คุณ)[^\s()*]+)/)||[])[1]||'';
  const name=raw.replace(/\((EN|SA-[A-Z0-9]+)\)/ig,'').replace(/\*/g,' ').replace(/\s+/g,' ').trim();
  const company=/(บริษัท|บจก|(^|\s)บ\.|จำกัด|หจก|Shop)/i.test(name);
  const O=xs(r[14]);const kw=(O.match(/(\d+(?:\.\d+)?)\s*k/i)||[])[1];const ph=(O.match(/([13])\s*เฟส/)||[])[1];const qty=(O.match(/\*\s*(\d+)/)||[])[1];
  const meterFix=s=>s.replace(/^SMD/i,'SDM');
  const sd=real(r[6]),dsd=real(r[13]),ag=real(r[16]),ins=real(r[17]);
  const docs={prepared:r[29]===true,signed:r[30]===true,sentTon:r[30]===true,summary:r[31]===true,inspected:!!real(r[32])&&real(r[32])!=='P'?true:real(r[32])==='P',inspectDate:/^\d{4}-/.test(real(r[32]))?real(r[32]):'',note:/^\d{4}-/.test(real(r[32]))||real(r[32])==='P'?'':real(r[32])};
  const installed=xs(r[21])==='P'||!!real(r[23]);
  let stage,status='active',since=nowMs,lost='';
  const t=s=>s?Date.parse(s+'T09:00:00+07:00'):0;
  if(r[33]===true||(installed&&docs.prepared&&docs.sentTon&&docs.summary&&docs.inspected)){stage=LAST;status='done';since=t(ins||ag)||nowMs}
  else if(installed){stage=real(r[23])?ST.DOCS:ST.COMM;since=t(ins||ag)||nowMs}
  else if(ag){stage=ins?ST.INSTALL:ST.INSREQ;since=t(ag)}
  else if(xs(r[12])==='Cancel'){stage=ST.OFFER;status='lost';lost='ยกเลิก (จาก Excel)';since=t(dsd||sd)||nowMs}
  else if(xs(r[12])==='P'){stage=ST.OFFER;since=t(dsd||sd)||nowMs;if(nowMs-since>60*864e5){status='lost';lost='ไม่มีข้อมูลต่อหลังส่งแบบ (นำเข้าจาก Excel)'}}
  else if(xs(r[7])==='P'||real(r[4])||real(r[5])){stage=ST.SURVEY;since=t(sd)||nowMs}
  else{stage=2;since=t(sd)||nowMs}
  const id='x'+rowNo;
  const customer={name,type:company?'บริษัท':'บุคคล',referredBy:ref,phone:'',email:'',address:'',legacy:true,createdAt:nowMs};
  const site={customerId:'c'+id,label:name,area:real(r[2]),utility:real(r[28]),phase:ph||'',createdAt:nowMs};
  const job={type:'solar',customerId:'c'+id,siteId:'s'+id,title:name,jobNo:real(r[5]),legacyRow:rowNo,
    salesTeam:team,surveyor:real(r[4]),surveyDate:sd,queueDate:sd,loggerDevice:real(r[11]),logStart:real(r[8]),logEnd:real(r[9]),
    designSentDate:dsd,proposedKw:kw?Number(kw):'',inverterQty:qty?Number(qty):(kw?1:''),proposedModel:real(r[15]),proposedNote:O,
    agreedDate:ag,installDate:ins,installTeam:real(r[18]),supervisor:real(r[19]),
    equipment:{model:real(r[22]),sn:real(r[23]),wifiSn:real(r[24]),meter:meterFix(real(r[25])),ct:real(r[26]),panels:real(r[27])?Number(r[27])||real(r[27]):'',plantName:real(r[20])},
    docs,pmChecked:r[33]===true,status,stage,stageSince:since,lostReason:lost,createdAt:nowMs,updatedAt:nowMs,
    history:[{at:nowMs,by:S.me.id||null,kind:'import',text:`นำเข้าจาก Excel แถว ${rowNo} → ${STAGES[stage].name}${status==='lost'?' (ยังไม่ตกลง)':status==='done'?' (ดูแลหลังการขาย)':''}`}]};
  return {id,customer,site,job};
}
async function pool(tasks,prog){
  let i=0,done=0;
  async function one(fn){for(let a=0;a<6;a++){try{return await fn()}catch(e){if(e?.code==='resource_exhausted'||e?.code==='unavailable'){await new Promise(r=>setTimeout(r,1500*(a+1)));continue}throw e}}throw new Error('เขียนไม่สำเร็จหลังลองซ้ำ')}
  async function run(){while(i<tasks.length){const k=i++;await one(tasks[k]);prog(++done,tasks.length)}}
  await Promise.all([run(),run(),run()]);
}
async function runImport(file){
  const out={set innerHTML(h){S.xprog=h;const el=$('#xprog');if(el)el.innerHTML=h}};
  try{
    if(Object.keys(S.jobs).some(k=>k.startsWith('x'))){const ok=await ask('นำเข้าซ้ำ?','พิมพ์ ยืนยัน เพื่อเขียนทับงานที่นำเข้าไว้เดิม');if(ok!=='ยืนยัน')return}
    
    out.innerHTML='กำลังอ่านไฟล์…';try{await loadXLSX()}catch(e){throw new Error('โหลดตัวอ่าน Excel ไม่ได้ (ต้องต่ออินเทอร์เน็ต) ลองดาวน์โหลดไฟล์ไปเปิดในเบราว์เซอร์')}
    const wb=XLSX.read(await file.arrayBuffer(),{cellDates:true});
    const ws=wb.Sheets['ตารางงาน'];if(!ws)throw new Error('ไม่พบชีต "ตารางงาน"');
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
    const now=Date.now();const items=[];
    for(let i=4;i<rows.length;i++){const r=rows[i]||[];if(!xs(r[1]))continue;items.push(parseRow(r,i+1,now))}
    const prods=[];const ls=wb.Sheets['LIST'];
    if(ls){const L=XLSX.utils.sheet_to_json(ls,{header:1,raw:true,defval:null});for(let i=1;i<L.length;i++)CATS.forEach((c,ci)=>{let m=xs((L[i]||[])[ci]);if(m){m=m.replace(/^SMD/i,'SDM');prods.push({id:pid(c,m),category:c,model:m})}})}
    const tasks=[];
    prods.filter(p=>!S.products[p.id]).forEach(p=>tasks.push(['products/'+p.id,{category:p.category,model:p.model}]));
    items.forEach(it=>{
      tasks.push(['customers/c'+it.id,it.customer]);
      tasks.push(['sites/s'+it.id,it.site]);
      tasks.push(['jobs/'+it.id,it.job]);
    });
    const pg=(d,t)=>{out.innerHTML=`<div class="bar"><i id="xbar" style="width:${t?d/t*100:0}%"></i></div><div class="sub" id="xtxt">เขียนแล้ว ${d} / ${t}</div>`};pg(0,tasks.length);
    if(S.db.batch){
      const N=15;let done=0;
      for(let i=0;i<tasks.length;i+=N){const part=tasks.slice(i,i+N);
        for(let a=0;;a++){try{const b=S.db.batch();part.forEach(([p,d])=>b.set(S.db.doc(p),d));await b.commit();break}
          catch(e){if(e?.code==='bad'&&/batch/.test(e.message||'')){for(const [p,d] of part)await S.db.doc(p).set(d);break} /* ตัวกลางรุ่นเก่า → ทีละรายการ */
            if(a<8&&['busy','network','server'].includes(e?.code)){out.innerHTML=`<div class="sub">ระบบกำลังทำงาน รอสักครู่แล้วลองต่อ… (${done} / ${tasks.length})</div>`;await new Promise(r=>setTimeout(r,5000*(a+1)));continue}throw e}}
        done+=part.length;pg(done,tasks.length)}
    }else await pool(tasks.map(([p,d])=>()=>S.db.doc(p).set(d)),pg);
    const c={active:0,lost:0,done:0};items.forEach(x=>c[x.job.status]++);
    // จองเลขใบงานของงานที่นำเข้า (กันงานใหม่ได้เลขซ้ำถ้างานนำเข้าถูกลบทีหลัง) · เลขที่จองไว้ให้งานอื่นแล้ว ข้ามไป
    {const seen=new Set();const R=items.filter(x=>x.job.jobNo&&!seen.has(x.job.jobNo)&&seen.add(x.job.jobNo)).map(x=>['jobnos/'+x.job.jobNo,{jid:x.id,at:Date.now(),by:S.me.id||null,src:'import'}]);
      for(let i=0;i<R.length;i+=15){const part=R.slice(i,i+15);try{if(!S.db.batch)throw 0;const b=S.db.batch();part.forEach(([p,d])=>b.set(S.db.doc(p),d));await b.commit()}catch(e){for(const [p,d] of part){try{await S.db.doc(p).set(d)}catch(x){}}}}}
    logRaw('import',`นำเข้า Excel ${file.name||''}: ${items.length} งาน · ${prods.length} รุ่นสินค้า`);
    const nos={};items.forEach(x=>{if(x.job.jobNo)nos[x.job.jobNo]=(nos[x.job.jobNo]||0)+1});
    const dup=Object.keys(nos).filter(k=>nos[k]>1);const noNo=items.filter(x=>!x.job.jobNo).length;
    out.innerHTML=`<div class="banner">นำเข้าแล้ว ${items.length} งาน: กำลังดำเนินการ ${c.active} · ยังไม่ตกลง ${c.lost} · ดูแลหลังการขาย ${c.done} · อุปกรณ์ ${prods.length} รุ่น<br>ยังไม่มีเลขงาน ${noNo} งาน${dup.length?' · เลขงานซ้ำ: '+dup.join(', '):''}</div>`;
  }catch(e){out.innerHTML=`<div class="banner">นำเข้าไม่สำเร็จ: ${esc(e.message||e.code||e)}</div>`}
}



document.addEventListener('click',e=>{if(e.target.closest('[data-retry]'))location.reload()});

/* ---------- boot ---------- */
(async()=>{
  if(!(window.CLEANLINE_CONFIG&&CLEANLINE_CONFIG.api&&window.CLGDB)){S.noDb=true;render();return}
  try{
    const {db,user,me}=await CLGDB.connect('admin');
    document.body.classList.add('rocat');S.db=db;S.user=user;S.me.id=me.id;S.me.owner=!!me.owner;S.me.edit=['admin','sysadmin'].includes(me.role);S.me.role=me.role;S.me.email=me.email;S.me.name=me.name;
    ['jobs','customers','sites','products','members','config','articles','services','forms','meters','messages','photos','appts'].forEach(subscribe);
    names([S.me.id]).then(schedule);render();
  }catch(e){showErr(e,'เชื่อมต่อไม่สำเร็จ');S.noDb=true;render()}
})();
render();

/* ลิงก์ภายใน (#...) เปลี่ยนหน้าด้วย JS: บางหน้าตัวอย่าง/iframe ดักการคลิกลิงก์ ทำให้ปุ่มอย่าง "เปิดหน้างาน" ไม่ไป */
document.addEventListener('click',e=>{if(document.body.classList.contains('rocat')&&e.target.closest('[data-fmnew],[data-fmedit],[data-fmdel],[data-eqnew],[data-eqedit],[data-eqdel],label[for="eqxfile"]')){e.preventDefault();e.stopImmediatePropagation();toast('เพิ่ม/แก้ เอกสารและแคตตาล็อก ทำได้ที่หน้าหลังบ้าน (ผู้ดูแลระบบ)')}},true);
document.addEventListener('change',async e=>{if(e.target.id==='pfphoto'){const f=e.target.files[0];e.target.value='';if(!f)return;try{S.pfn=$('#pfname')?.value;S.pf2=await shrinkImg(f,256);render()}catch(x){toast('อ่านรูปไม่ได้')}}});
document.addEventListener('input',e=>{if(e.target.id==='pfname')S.pfn=e.target.value});
document.addEventListener('click',async e=>{
  const t=e.target.closest('#signout,[data-mkfolder],[data-files],[data-jtab],#pfsave,#pfdelphoto,[data-unlock],[data-fname]');if(!t)return;
  if(t.dataset.fname){const j=S.jobs[t.dataset.fname];if(!j)return;const cur=j.folderName||[j.jobNo,j.queueDate||j.surveyDate,j.title].filter(Boolean).join(' ');
    const v=await askVal('เปลี่ยนชื่อโฟลเดอร์งาน','ชื่อโฟลเดอร์',cur);if(v==null)return;const n=String(v).replace(/[\/\\]+/g,'-').replace(/\s+/g,' ').trim().slice(0,120);if(!n||n===j.folderName)return;
    try{await pushHist(j,ev('edit','เปลี่ยนชื่อโฟลเดอร์: '+n),{folderName:n});toast('เปลี่ยนชื่อโฟลเดอร์แล้ว')}catch(x){}return}
  if(t.id==='pfsave'){t.disabled=true;await saveProfile();return}
  if(t.dataset.unlock){const j=S.jobs[t.dataset.unlock];const L=svLocked(j);const who=L.length===1?L[0]:await ask('ขอใช้ใคร','พิมพ์ชื่อ: '+L.join(' / '));if(!who)return;if(!L.includes(who))return toast('ไม่พบชื่อ '+who);
    const why=await ask('ขอใช้ '+who+' สำหรับงานนี้','เหตุผล (บันทึกไว้ในประวัติงาน)');if(!why)return;
    try{await pushHist(j,ev('edit','ขอใช้ '+who+' สำรวจงานนี้: '+why),{queueUnlock:who});toast('ปลดให้เลือก '+who+' แล้ว (เฉพาะงานนี้)')}catch(x){}return}
  if(t.id==='pfdelphoto'){await saveProfile('');return}
  if(t.id==='signout'){CLGDB.user.signOut();return}
  if(t.dataset.jtab){S.jtab=t.dataset.jtab;render();return}
  if(t.dataset.files){const jj=S.jobs[t.dataset.files]||{};if(window.CLGDB&&CLGDB.files&&S.db)CLGDB.files.open(t.dataset.files,jj.title||'',jj.folderUrl);else if(jj.folderUrl)window.open(jj.folderUrl,'_blank','noopener');return}
  if(t.dataset.mkfolder){t.disabled=true;try{const r=await S.db.folder(t.dataset.mkfolder);t.disabled=false;if(!r.id){toast('ยังสร้างโฟลเดอร์ไม่ได้ ต้องอัปเดตตัวกลางเป็น 1.2.7');return}toast('สร้างโฟลเดอร์งานแล้ว');S.db.refresh();const jj=S.jobs[t.dataset.mkfolder]||{};if(window.CLGDB&&CLGDB.files)CLGDB.files.open(t.dataset.mkfolder,jj.title||'',r.url);else if(r.url)location.href=r.url}catch(x){toast(x.message);t.disabled=false}}
});
document.addEventListener('click',e=>{if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const a=e.target.closest('a[href^="#"]');if(!a||a.target)return;const h=a.getAttribute('href');if(h.length<2)return;e.preventDefault();if(location.hash!==h)location.hash=h.slice(1);else render()});
addEventListener('scroll',()=>{const b=document.body,y=scrollY;if(!b.classList.contains('pgsc')){if(y>160)b.classList.add('pgsc')}else if(y<24)b.classList.remove('pgsc')},{passive:true});

/* รอบ 4w: เมนู "อื่นๆ" — วางแผงด้วย fixed · ปิดเมื่อคลิกนอก/เลือกรายการ/Esc/เลื่อนหน้า · กดปุ่ม ⋯ ในแถวตารางไม่เปิดแผงงาน */
(function(){const closeAll=x=>document.querySelectorAll('details.mnu[open]').forEach(d=>{if(d!==x)d.open=false});
const unclip=d=>{(d._uc||[]).forEach(([el,v])=>el.style.overflow=v);d._uc=null};
document.addEventListener('toggle',e=>{const d=e.target;if(!d.matches||!d.matches('details.mnu'))return;if(!d.open){unclip(d);return}closeAll(d);
  /* การ์ดที่ตัดขอบ (overflow) จะบังเมนู → เปิดขอบชั่วคราวระหว่างที่เมนูเปิด แล้วคืนค่าเดิมเมื่อปิด */
  window._mnuT=Date.now();d._uc=[];for(let el=d.parentElement;el&&el!==document.body;el=el.parentElement){const c=getComputedStyle(el);if(c.overflow!=='visible'||c.overflowX!=='visible'||c.overflowY!=='visible'){d._uc.push([el,el.style.overflow]);el.style.overflow='visible'}}
  const place=()=>{if(!d.open)return;
  const s=d.querySelector('summary').getBoundingClientRect(),p=d.querySelector('.mnu-p'),r=p.getBoundingClientRect();
  let top=s.bottom+6;if(top+r.height>innerHeight-8)top=Math.max(8,s.top-6-r.height);const left=Math.max(8,Math.min(innerWidth-r.width-8,s.right-r.width));
  let cb=d.parentElement,o={top:0,left:0};while(cb&&cb!==document.body){const c=getComputedStyle(cb);if(c.transform!=='none'||c.filter!=='none'||(c.backdropFilter&&c.backdropFilter!=='none')||(c.webkitBackdropFilter&&c.webkitBackdropFilter!=='none')||c.perspective!=='none'||/paint|layout|strict|content/.test(c.contain)){o=cb.getBoundingClientRect();break}cb=cb.parentElement}
  p.style.top=(top-o.top)+'px';p.style.left=(left-o.left)+'px'};place();requestAnimationFrame(place)},true);   /* ชดเชยกรอบที่มี backdrop-filter/transform (fixed จะอิงกรอบนั้นแทนจอ) */
document.addEventListener('click',e=>{const d=e.target.closest&&e.target.closest('details.mnu');closeAll(d);if(!d)return;
  if(e.target.closest('.mi')){d.open=false;return}if(e.target.closest('summary')){window._mnuT=Date.now();e.stopPropagation()}},true);
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const d=document.querySelector('details.mnu[open]');if(!d)return;d.open=false;d.querySelector('summary').focus();e.stopPropagation()},true);
addEventListener('scroll',()=>{if(Date.now()-(window._mnuT||0)>250)closeAll(null)},true);addEventListener('resize',()=>closeAll(null));})();

/* รอบ 5d (ui-design-principles ข้อ 38–39): error เป็นการ์ดภาษาคน (ไอคอน + หัวข้อ + บอกว่าทำอะไรต่อ + ปิดได้) แทนป้ายดำที่หายเอง */

(()=>{
const IC={home:'<svg class="o" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M11.3 2.3a1 1 0 0 1 1.4 0l8.6 7.4c.4.3.7.8.7 1.3V20a2 2 0 0 1-2 2h-4.5v-6.5h-7V22H4a2 2 0 0 1-2-2v-9c0-.5.3-1 .7-1.3z"/></svg>',
 cal:'<svg class="o" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M8 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v2H3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zM3 11h18v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/></svg>',
 list:'<svg class="o" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><rect x="2.5" y="4" width="4" height="4" rx="1.2"/><rect x="2.5" y="10" width="4" height="4" rx="1.2"/><rect x="2.5" y="16" width="4" height="4" rx="1.2"/><rect x="9" y="4.5" width="12.5" height="3" rx="1.5"/><rect x="9" y="10.5" width="12.5" height="3" rx="1.5"/><rect x="9" y="16.5" width="12.5" height="3" rx="1.5"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 gear:'<svg class="o" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M10.3 2h3.4l.6 2.6 1.6.7 2.3-1.4 2.4 2.4-1.4 2.3.7 1.6 2.6.6v3.4l-2.6.6-.7 1.6 1.4 2.3-2.4 2.4-2.3-1.4-1.6.7-.6 2.6h-3.4l-.6-2.6-1.6-.7-2.3 1.4-2.4-2.4 1.4-2.3-.7-1.6L2 13.7v-3.4l2.6-.6.7-1.6-1.4-2.3 2.4-2.4 2.3 1.4 1.6-.7zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>',
 more:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'};
const MAIN=['today','queue','jobs'];
function hashOf(){return (location.hash||'#today').slice(1).split(/[-?]/)[0]}
function sideItems(){return [...document.querySelectorAll('#nav1 a.snv')]}
function build(){
 const sl=typeof isSales==='function'&&isSales(),_n=document.getElementById('mnav');
 if(_n&&_n.classList.contains('sl')!==sl)_n.remove();   // สร้างก่อนรู้บทบาท (ก่อนเข้าสู่ระบบเสร็จ) → สร้างใหม่ให้ตรงบทบาท
 if(!document.getElementById('mnav')){
  document.body.insertAdjacentHTML('beforeend',sl?`<nav id="mnav" class="sl" aria-label="เมนูหลัก"><button type="button" data-mh="today">${IC.list}งานของฉัน</button><button type="button" class="fab" data-mh="new" aria-label="แจ้งขอคิวสำรวจ"><i>${IC.plus}</i>ขอคิว</button><button type="button" data-mh="settings">${IC.gear}ตั้งค่า</button></nav>`
   :`<nav id="mnav" aria-label="เมนูหลัก"><button type="button" data-mh="today">${IC.home}ภาพรวม</button><button type="button" data-mh="queue">${IC.cal}ปฏิทิน</button><button type="button" class="fab" data-mh="new" aria-label="จองคิวสำรวจ"><i>${IC.plus}</i>จองคิว</button><button type="button" data-mh="jobs">${IC.list}งาน</button><button type="button" data-mmore aria-haspopup="dialog">${IC.more}อื่นๆ</button></nav>`);
  document.getElementById('mnav').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.mh){location.hash=b.dataset.mh;return}if('mmore' in b.dataset)openMore()});
 }
 const tb=document.querySelector('.tb.pmbar');if(tb&&!tb.querySelector('.mbr'))tb.insertAdjacentHTML('afterbegin','<a class="mbr" href="#today" aria-label="CLEANLINE หน้าภาพรวม"><em>CL</em>Management</a>');
 sync();
}
function sync(){const h=hashOf(),n=document.getElementById('mnav');if(!n)return;const sl=n.classList.contains('sl');const main=h==='job'?(sl?'today':'jobs'):h;
 n.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.mh?b.dataset.mh===main:!MAIN.includes(main)&&main!=='new'))}
function openMore(){const seen={};const its=sideItems().filter(a=>{const h=a.getAttribute('href');if(['#today','#queue','#jobs'].includes(h)&&!seen[h]){seen[h]=1;return false}return true});
 document.body.insertAdjacentHTML('beforeend',`<div id="msheet" role="dialog" aria-modal="true" aria-label="เมนูอื่นๆ"><div class="sh"><h3>เมนูอื่นๆ</h3>${its.map((a,i)=>`<button type="button" class="mi2 ${a.classList.contains('on')?'on':''}" data-mi="${i}">${(a.querySelector('svg')||{}).outerHTML||''}${a.getAttribute('aria-label')||a.title||a.textContent.trim()}</button>`).join('')}</div></div>`);
 const s=document.getElementById('msheet');s.addEventListener('click',e=>{const b=e.target.closest('[data-mi]');if(b){its[+b.dataset.mi].click();s.remove();return}if(e.target===s)s.remove()});}
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('msheet')?.remove()});
addEventListener('hashchange',()=>{build();sync()});
const _ap=document.getElementById('app');if(_ap)new MutationObserver(()=>{if(!document.querySelector('.tb.pmbar .mbr'))build()}).observe(_ap,{childList:true});
build();
})();


/* ข้อ 2 polish: ห่อช่องวันที่ทุกช่อง (นอก .dctl) ให้แสดงวันแบบไทย · กดตรงไหนก็เปิดปฏิทิน */
(function(){const txt=i=>{const v=i.parentElement&&i.parentElement.querySelector(':scope>.thv');if(!v)return;v.textContent=i.value?fd(i.value):'เลือกวัน';v.classList.toggle('ph',!i.value)};
  const wrap=()=>document.querySelectorAll('input[type=date]').forEach(i=>{if(i.closest('.dctl'))return;if(!i.parentElement.classList.contains('thd')){const w=document.createElement('span');w.className='thd';i.replaceWith(w);w.appendChild(i);const v=document.createElement('span');v.className='thv';v.setAttribute('aria-hidden','true');w.appendChild(v)}txt(i)});
  let q=0;new MutationObserver(()=>{if(q)return;q=requestAnimationFrame(()=>{q=0;wrap()})}).observe(document.body,{childList:true,subtree:true});
  ['input','change'].forEach(ev=>document.addEventListener(ev,e=>{const i=e.target;if(i&&i.type==='date'&&i.parentElement&&i.parentElement.classList.contains('thd'))txt(i)},true));
  document.addEventListener('click',e=>{const i=e.target;if(i&&i.type==='date'&&i.parentElement&&i.parentElement.classList.contains('thd')&&!i.disabled){try{i.showPicker()}catch(x){}}},true);
  window.thDateSync=wrap;wrap()})();

/* ตัวกรองแบบ Excel: กดหัวคอลัมน์ (ทีมขาย / คนสำรวจ / สถานะ) → ติ๊กค่าที่ต้องการ → ตกลง · มือถือกดปุ่ม "ตัวกรอง" ได้ครบทั้ง 3 หัวข้อ */
(function(){const NAME={team:'ทีมขาย',eng:'คนสำรวจ',phase:'สถานะ',inv:'อินเวอร์เตอร์',svst:'สถานะ'};const SVC=()=>route()==='service';
  const opts=k=>{const base=SVC()?jobsList('installed',true,k).list:jobsList(S.f.status,false,k).list;const c={};
    if(k==='svst'){base.forEach(j=>{const t=svTok(j);c[t]=(c[t]||0)+1});return [['cm','แจ้งซ่อมค้าง'],['pm','ครบตรวจเช็กใน 30 วัน'],['ok','ปกติ']].map(([v,l])=>[v,l,c[v]||0])}
    if(k==='inv'){base.forEach(j=>{const v=(j.equipment||{}).model||j.proposedModel||'';c[v]=(c[v]||0)+1});return Object.keys(c).sort((a,b)=>a===''?1:b===''?-1:a.localeCompare(b,'th',{numeric:true})).map(v=>[v,v||'(ไม่ระบุ)',c[v]])}
    if(k==='phase'){base.forEach(j=>{const t=jTok(j);c[t]=(c[t]||0)+1});return [...PHASES.map(p=>[p.k,p.name,p.st.map(n=>STAGES[n].name).filter(x=>x!==p.name).join(' · ')]),['done','ปิดงานแล้ว'],['cancelled','งานที่ยกเลิก']].map(([v,l,h])=>[v,l,c[v]||0,h])}
    const key=k==='team'?'salesTeam':'surveyor';base.forEach(j=>{const v=j[key]||'';c[v]=(c[v]||0)+1});
    const vals=[...new Set([...(k==='team'?TEAMS:[]),...Object.keys(c)])].sort((a,b)=>a===''?1:b===''?-1:a.localeCompare(b,'th',{numeric:true}));
    return vals.map(v=>[v,v||'(ว่าง)',c[v]||0])};
  const cur=k=>{const v=S.f[k];return fhas(v)?(Array.isArray(v)?v:[v]):null};
  const sec=k=>{const O=opts(k),sel=cur(k);const on=v=>!sel||sel.includes(v);
    return `<fieldset class="thp-s" data-k="${k}"><legend>${NAME[k]}</legend>${O.length>8?`<label class="jsrch thp-q">${svg('search','currentColor',2)}<input type="search" placeholder="ค้นใน${NAME[k]}" aria-label="ค้นใน${NAME[k]}"></label>`:''}
      <label class="thp-r thp-all"><input type="checkbox" data-all ${O.every(o=>on(o[0]))?'checked':''}><span>เลือกทั้งหมด</span></label>
      <div class="thp-l">${O.map(([v,l,n,h])=>`<label class="thp-r ${h?'hh':''}" data-t="${esc(String(l+' '+(h||'')).toLowerCase())}"><input type="checkbox" value="${esc(v)}" ${on(v)?'checked':''}><span>${esc(l)}${h?`<em>${esc(h)}</em>`:''}</span><small>${n}</small></label>`).join('')}</div></fieldset>`};
  let pop=null,anchor=null;const close=()=>{if(pop){pop.remove();pop=null}if(anchor){anchor.setAttribute('aria-expanded','false');anchor=null}};
  const place=()=>{if(!pop||!anchor)return;if(matchMedia('(max-width:640px)').matches){pop.classList.add('sheet');return}const r=anchor.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight;
    let top=r.bottom+6;if(top+h>innerHeight-8)top=Math.max(8,r.top-6-h);pop.style.top=top+'px';pop.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left))+'px'};
  const sync=fs=>{const all=fs.querySelector('[data-all]'),bx=[...fs.querySelectorAll('.thp-l input')];const n=bx.filter(b=>b.checked).length;all.checked=n===bx.length;all.indeterminate=n>0&&n<bx.length};
  function open(btn){close();const k=btn.dataset.thf;const keys=k==='all'?['phase','team','eng']:k==='svall'?['svst','inv','team','eng']:[k];anchor=btn;btn.setAttribute('aria-expanded','true');
    pop=document.createElement('div');pop.className='thpop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','กรอง'+(k==='all'||k==='svall'?'':NAME[k]));
    pop.innerHTML=`<div class="thp-b">${keys.map(sec).join('')}</div><div class="thp-f"><button type="button" class="btn sm ghost" data-thclr>ล้าง</button><span style="flex:1"></span><button type="button" class="btn sm" data-thx>ยกเลิก</button><button type="button" class="btn pri sm" data-thok>ตกลง</button></div>`;
    document.body.appendChild(pop);pop.querySelectorAll('.thp-s').forEach(sync);place();(pop.querySelector('.thp-q input')||pop.querySelector('input'))?.focus()}
  function apply(){pop.querySelectorAll('.thp-s').forEach(fs=>{const k=fs.dataset.k,bx=[...fs.querySelectorAll('.thp-l input')],on=bx.filter(b=>b.checked).map(b=>b.value);S.f[k]=on.length===bx.length?'':on});
    S.f.pg=0;S.f.limit=40;const f=anchor;close();render();f&&document.querySelector(`[data-thf="${f.dataset.thf}"]`)?.focus()}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-thf]');if(b){e.preventDefault();e.stopPropagation();if(anchor===b)close();else open(b);return}
    if(!pop)return;if(!e.target.closest('.thpop')){close();return}
    if(e.target.closest('[data-thx]')){const a=anchor;close();a?.focus();return}
    if(e.target.closest('[data-thok]')){apply();return}
    if(e.target.closest('[data-thclr]')){pop.querySelectorAll('.thp-s input[type=checkbox]').forEach(c=>{c.checked=true;c.indeterminate=false});return}},true);
  document.addEventListener('change',e=>{if(!pop||!e.target.closest('.thpop'))return;const fs=e.target.closest('.thp-s');if(!fs)return;
    if(e.target.matches('[data-all]'))fs.querySelectorAll('.thp-l input').forEach(c=>{if(!c.closest('.thp-r').hidden)c.checked=e.target.checked});sync(fs)});
  document.addEventListener('input',e=>{if(!pop||!e.target.closest('.thp-q'))return;const q=e.target.value.trim().toLowerCase();e.target.closest('.thp-s').querySelectorAll('.thp-l .thp-r').forEach(r=>r.hidden=!!q&&!r.dataset.t.includes(q))});
  document.addEventListener('keydown',e=>{if(!pop)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const a=anchor;close();a?.focus()}else if(e.key==='Enter'&&!e.target.matches('button')){e.preventDefault();apply()}},true);
  addEventListener('resize',place);addEventListener('hashchange',close);addEventListener('scroll',e=>{if(pop&&!e.target.closest?.('.thpop'))place()},true)})();

/* ข้อ 4 จองคิวขั้นเดียว: เลือกคนสำรวจ · ลูกค้าเดิมจากเบอร์ · จองต่อ */
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-bkd]');if(b){cvBkPick(b.dataset.bkd)}});
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-nhp]');if(!t||t.disabled)return;nfRead();const L=S.nf.help=(S.nf.help||[]).slice(),i=L.indexOf(t.dataset.nhp);i<0?L.push(t.dataset.nhp):L.splice(i,1);nfRefresh()});
document.addEventListener('change',e=>{if(e.target.id==='n-eng'){nfRead();S.nf.eng=e.target.value;if(S.nf.help)S.nf.help=S.nf.help.filter(x=>x!==S.nf.eng);nfRefresh();$('#n-eng')?.focus()}});
document.addEventListener('input',e=>{if(e.target.id!=='n-phone')return;const f=S.nf||(S.nf={});f.phone=e.target.value;if(f.cid)return;const k=$('#n-known');if(k)k.innerHTML=nfKnown(f)});
document.addEventListener('click',e=>{const k=e.target.closest('[data-nfk]');if(k){e.preventDefault();nfRead();const f=S.nf;const cid=k.dataset.nfk;
    if(!cid){f.cid='';render();return}
    const c=S.customers[cid]||{};const nm=String(c.name||'').trim().split(/\s+/);const jb=Object.values(S.jobs).filter(j=>j.customerId===cid).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];const st=jb&&S.sites?S.sites[jb.siteId]||{}:{};
    Object.assign(f,{cid,first:c.firstName||nm[0]||f.first,last:c.lastName||nm.slice(1).join(' ')||f.last,email:f.email||c.email||'',addr:f.addr||c.address||st.address||'',map:f.map||st.mapLink||''});render();toast('ใส่ข้อมูลลูกค้าเดิมแล้ว ตรวจอีกครั้งก่อนจอง');return}
  if(e.target.closest('[data-nfnext]')){S.nfDone=null;render();scrollTo(0,0);$('#n-first')?.focus()}});
addEventListener('hashchange',()=>{if(location.hash!=='#new')S.nfDone=null});

document.addEventListener('click',e=>{const b=e.target.closest('[data-gosec]');if(!b)return;const id=b.dataset.gosec;const el=(id&&document.querySelector(`[data-edit="${CSS.escape(id)}"]`)?.closest('section,.sec,.ngrp,div'))||document.querySelector('.colL');if(el){el.scrollIntoView({behavior:'smooth',block:'start'});const f=el.querySelector('input,select,textarea,[data-edit]');setTimeout(()=>f?.focus({preventScroll:true}),400)}});

/* ข้อ 7: กดป้ายสถานะในแถว = กรองเฉพาะสถานะนั้น (แบบป้ายใน Gmail) */
document.addEventListener('click',e=>{const b=e.target.closest('[data-pillf]');if(!b)return;e.preventDefault();e.stopPropagation();S.f.phase=[b.dataset.pillf];S.f.pg=0;if(route()!=='jobs'){S.f.mine=false;S.f.status='all';S.f.jmo=0;location.hash='jobs';return}render();toast('แสดงเฉพาะสถานะนี้ · กด "ล้างตัวกรอง" เพื่อดูทั้งหมด')},true);

document.addEventListener('click',e=>{const a=e.target.closest('a[data-csel]');if(!a||e.ctrlKey||e.metaKey||window.innerWidth<=1100)return;e.preventDefault();S.f.csel=a.dataset.csel;render()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-bkgo]');if(!b)return;e.preventDefault();S.f.bk=b.dataset.bkgo;render();requestAnimationFrame(()=>document.querySelector('.bkc')?.scrollIntoView({behavior:'smooth',block:'start'}))});
document.addEventListener('click',e=>{const a=e.target.closest('[data-wkd]');if(a)S.f.qsel=a.dataset.wkd},true);
