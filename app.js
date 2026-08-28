const BASE="https://educational-pm25-api.project2026csemn.workers.dev";

const API={
latest:`${BASE}/api/get_latest.php`,
history:`${BASE}/api/get_history.php`,
export:`${BASE}/api/export.php`,
mother:`${BASE}/api/mother_status`,
alerts:`${BASE}/api/alert_states`,
standards:`${BASE}/api/standards.php`,
ai:`${BASE}/api/ai_analysis`,
forecast:`${BASE}/api/ai_forecast`
};

const TOTAL_NODES=3;
const MOTHER_OFFLINE_MS=60*1000;
// Node offline timing is decided by the Worker using the expected-wake rule.
// Dashboard trusts the normalized status returned by the API.

const $=
id=>
document.getElementById(id);

let latestNodes=[];
let records=[];
let motherStatus=null;
let alertStates=[];
let standardsData=null;
let latestRecord=null;
let historyChart=null;
let forecastChart=null;
let historyGroupCharts=[];
let forecastGroupCharts=[];
let forecastVisible=true;

let historyActivated=false;
let historyLoading=false;
let chartLibraryPromise=null;
let chartLibraryReady=false;
let aiSectionActivated=false;

let metric="all";
let currentMetric="pm25";

let averageRange="today";

let customRangeStart=null;
let customRangeEnd=null;

let calendarDisplayDate=
new Date();

let calendarSelectionStep=
"start";

let apiConnectionOnline=false;
let exportRows=[];
let activeHelpButton=null;

let aiPayload=null;
let aiLoading=false;
let aiLastLoadedAt=null;
let aiForecastPayload=null;
let aiForecastLoading=false;
let aiForecastLastLoadedAt=null;

// =====================================================
// RANGE
// =====================================================

const RANGE_CONFIG={
"today":{label:"วันนี้",minutes:null,apiRange:"today"},

"30m":{
label:"30 นาที",
minutes:30,
apiRange:"24h"
},

"1h":{
label:"1 ชั่วโมง",
minutes:60,
apiRange:"24h"
},

"6h":{
label:"6 ชั่วโมง",
minutes:360,
apiRange:"24h"
},

"12h":{
label:"12 ชั่วโมง",
minutes:720,
apiRange:"24h"
},

"24h":{
label:"24 ชั่วโมง",
minutes:1440,
apiRange:"24h"
},

"7d":{
label:"7 วัน",
minutes:10080,
apiRange:"7d"
},

"30d":{
label:"30 วัน",
minutes:43200,
apiRange:"30d"
}

};

// =====================================================
// METRIC
// =====================================================

const CURRENT_METRIC_CONFIG={
all:{label:"ALL",unit:"",color:"#e2e8f0"},
pm1:{label:"PM1.0",unit:"µg/m³",color:"#60a5fa"},
pm25:{label:"PM2.5",unit:"µg/m³",color:"#f87171"},
pm10:{label:"PM10",unit:"µg/m³",color:"#fbbf24"},
temperature:{label:"อุณหภูมิ",unit:"°C",color:"#fb923c"},
humidity:{label:"ความชื้น",unit:"%",color:"#34d399"},
light:{label:"แสง",unit:"lux",color:"#c084fc"}
};

// =====================================================
// FORMAT
// =====================================================

function fmt(v){

return(
v==null||
v===""||
!Number.isFinite(
Number(v)
)
)
?"--"
:Number(v).toFixed(1);

}

// =====================================================
// SAFE SENSOR NUMBER
// Number(null) === 0 ใน JavaScript จึงต้องกัน null ก่อน
// =====================================================
function finiteNumberOrNull(value){
if(value===null||value===undefined||value==="") return null;
const n=Number(value);
return Number.isFinite(n)?n:null;
}

function hasFiniteSensorValue(value){
return finiteNumberOrNull(value)!==null;
}

function esc(v){

return String(
v??""
)
.replace(
/&/g,
"&amp;"
)
.replace(
/</g,
"&lt;"
)
.replace(
/>/g,
"&gt;"
)
.replace(
/"/g,
"&quot;"
)
.replace(
/'/g,
"&#039;"
);

}

// =====================================================
// DATE
// =====================================================

function parseDate(v){

if(!v){
return null;
}

if(
v instanceof Date
){

return isNaN(v)
?null
:v;

}

const t=
String(v)
.trim();

const d=
new Date(

/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
.test(t)

?t.replace(
" ",
"T"
)+"Z"

:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
.test(t)

?t+"Z"

:t

);

return isNaN(d)
?null
:d;

}

function thaiTime(v){

const d=
parseDate(v);

return d
?d.toLocaleTimeString(
"th-TH",
{
timeZone:
"Asia/Bangkok",
hour:
"2-digit",
minute:
"2-digit",
second:
"2-digit",
hour12:
false
}
)
:"--";

}

// =====================================================
// CHART DATE / TIME LABELS
// แก้ปัญหากราฟช่วงยาวที่เห็นเฉพาะเวลาแต่ไม่รู้ว่าเป็นวันไหน
// =====================================================

function thaiChartDateTime(value, compact=false){
const d=parseDate(value);
if(!d){
return String(value??"");
}

const opts=compact
?{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
hour:"2-digit",
minute:"2-digit",
hour12:false
}
:{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
year:"numeric",
hour:"2-digit",
minute:"2-digit",
second:"2-digit",
hour12:false
};

return d.toLocaleString("th-TH",opts);
}

// =====================================================
// ADAPTIVE TIME AXIS
// มองช่วงยาว = เน้น "วันที่"
// ซูมเข้า = เพิ่ม "เวลา" อัตโนมัติตามช่วงที่กำลังมอง
// Tooltip ยังคงแสดงวัน/เวลาเต็มเสมอ
// =====================================================
function chartDayKey(value){
const d=parseDate(value);
if(!d)return"";
return d.toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"});
}

function chartVisibleSpanMs(scale){
const labels=scale?.chart?.data?.labels||[];
if(!labels.length)return null;

const rawMin=Number.isFinite(Number(scale?.min))?Number(scale.min):0;
const rawMax=Number.isFinite(Number(scale?.max))?Number(scale.max):labels.length-1;
const minIndex=Math.max(0,Math.min(labels.length-1,Math.floor(rawMin)));
const maxIndex=Math.max(0,Math.min(labels.length-1,Math.ceil(rawMax)));

const start=parseDate(labels[minIndex]);
const end=parseDate(labels[maxIndex]);
if(!start||!end)return null;
return Math.abs(end.getTime()-start.getTime());
}

function chartTickText(value,spanMs=null){
const d=parseDate(value);
if(!d)return String(value??"");

const span=Number.isFinite(spanMs)?spanMs:null;
const DAY=24*60*60*1000;
const HOUR=60*60*1000;

// 3 วันขึ้นไป: แสดงเป็นวัน เพื่ออ่านกราฟแบบรายวัน
if(span!==null&&span>=3*DAY){
return d.toLocaleDateString("th-TH",{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short"
});
}

// 12 ชั่วโมง - น้อยกว่า 3 วัน: แสดงวัน + เวลา
if(span!==null&&span>=12*HOUR){
return d.toLocaleString("th-TH",{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
hour:"2-digit",
minute:"2-digit",
hour12:false
});
}

// ซูมลงมาระดับนาที: ใช้เวลาเป็นหลัก
if(span!==null&&span<60*60*1000){
return d.toLocaleTimeString("th-TH",{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
second:"2-digit",
hour12:false
});
}

return d.toLocaleTimeString("th-TH",{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
hour12:false
});
}

// =====================================================
// ADAPTIVE CALENDAR TICKS
// ช่วงยาว: สร้าง tick ตามวันจริง (1 tick ต่อ 1 วัน)
// เมื่อซูมเข้า: เพิ่มความละเอียดเป็น 6 ชม. / 2 ชม. / 30 นาที / 5 นาที
// ทำให้แกน X เป็นเหมือน timeline ที่เจาะรายละเอียดได้เรื่อย ๆ
// =====================================================
function chartBucketKey(date,stepMs){
const d=parseDate(date);
if(!d)return"";
const t=d.getTime();
return String(Math.floor(t/stepMs));
}

function chartDayBucketKey(date){
const d=parseDate(date);
if(!d)return"";
return d.toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"});
}

function buildAdaptiveTimeTicks(scale){
const labels=scale?.chart?.data?.labels||[];
if(!Array.isArray(labels)||labels.length<2)return;

const minRaw=Number.isFinite(Number(scale.min))?Number(scale.min):0;
const maxRaw=Number.isFinite(Number(scale.max))?Number(scale.max):labels.length-1;
const minIndex=Math.max(0,Math.min(labels.length-1,Math.floor(minRaw)));
const maxIndex=Math.max(minIndex,Math.min(labels.length-1,Math.ceil(maxRaw)));

const start=parseDate(labels[minIndex]);
const end=parseDate(labels[maxIndex]);
if(!start||!end)return;

const span=Math.max(0,end.getTime()-start.getTime());
const MINUTE=60*1000;
const HOUR=60*MINUTE;
const DAY=24*HOUR;

let mode="minute";
let stepMs=5*MINUTE;

// 3 วันขึ้นไป = 1 tick ต่อวัน (วันที่เท่านั้น)
if(span>=3*DAY){
mode="day";
}else if(span>=DAY){
mode="bucket";
stepMs=6*HOUR;
}else if(span>=6*HOUR){
mode="bucket";
stepMs=2*HOUR;
}else if(span>=HOUR){
mode="bucket";
stepMs=30*MINUTE;
}else if(span>=20*MINUTE){
mode="bucket";
stepMs=5*MINUTE;
}else{
mode="bucket";
stepMs=MINUTE;
}

const chosen=[];
let lastKey=null;

for(let i=minIndex;i<=maxIndex;i++){
const d=parseDate(labels[i]);
if(!d)continue;
const key=mode==="day"?chartDayBucketKey(d):chartBucketKey(d,stepMs);
if(!key||key===lastKey)continue;
chosen.push({value:i});
lastKey=key;
}

// รักษาปลายช่วงไว้เสมอเมื่อมีพื้นที่พอ เพื่อให้ผู้ใช้เห็นขอบเขตที่กำลังดู
if(chosen.length&&chosen.at(-1).value!==maxIndex&&span<3*DAY){
chosen.push({value:maxIndex});
}

// จอเล็กไม่ยัด label แน่นเกินไป แต่ช่วงรายวันยังพยายามคงวันต่อวัน
const maxTicks=window.innerWidth<=640?8:mode==="day"?35:14;
if(chosen.length>maxTicks){
const stride=Math.ceil(chosen.length/maxTicks);
const reduced=chosen.filter((_,i)=>i%stride===0);
if(reduced.at(-1)?.value!==chosen.at(-1)?.value)reduced.push(chosen.at(-1));
scale.ticks=reduced;
}else{
scale.ticks=chosen;
}
}

function adaptiveChartTickText(scale,value,index,ticks){
const raw=scale.getLabelForValue(value);
const span=chartVisibleSpanMs(scale);
const text=chartTickText(raw,span);

// ช่วงยาว: ถ้า autoSkip เลือก timestamp หลายจุดในวันเดียวกัน
// ให้แสดงชื่อวันนั้นเพียงครั้งเดียว เพื่อลดข้อความซ้ำบนแกน X
const DAY=24*60*60*1000;
if(span!==null&&span>=3*DAY&&index>0&&Array.isArray(ticks)){
const prevValue=ticks[index-1]?.value;
const prevRaw=prevValue==null?null:scale.getLabelForValue(prevValue);
if(prevRaw&&chartDayKey(prevRaw)===chartDayKey(raw))return"";
}

return text;
}

function graphTooltipTitle(items){
const raw=items?.[0]?.label;
if(raw==null){
return"";
}

const d=parseDate(raw);

return d
?thaiChartDateTime(d,false)
:String(raw);
}

function historyRangeCaption(baseRows=[]){
const el=$("historyRangeCaption");
if(!el){
return;
}

const w=rangeWindow();

if(!w){
el.innerHTML="";
return;
}

const sorted=(baseRows||[])
.filter(r=>parseDate(r?.timestamp))
.sort((a,b)=>parseDate(a.timestamp)-parseDate(b.timestamp));

const firstData=sorted.length
?parseDate(sorted[0].timestamp)
:null;

const lastData=sorted.length
?parseDate(sorted.at(-1).timestamp)
:null;

// ถ้าระบบมีข้อมูลน้อยกว่าช่วงที่เลือก ให้เริ่มข้อความจากข้อมูลจริงชุดแรก
const displayStart=
firstData&&firstData>w.start
?firstData
:w.start;

const displayEnd=w.end;

const spanMs=Math.max(0,displayEnd.getTime()-displayStart.getTime());
const DAY=24*60*60*1000;

const edgeText=(d)=>{
if(spanMs>=3*DAY){
return d.toLocaleDateString("th-TH",{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
year:"numeric"
});
}
return d.toLocaleString("th-TH",{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
hour:"2-digit",
minute:"2-digit",
hour12:false
});
};

const latestText=lastData
?lastData.toLocaleString("th-TH",{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
hour:"2-digit",
minute:"2-digit",
hour12:false
})
:null;

el.innerHTML=
`<div class="history-range-edge history-range-edge-start">
<span>เริ่ม</span>
<b>${esc(edgeText(displayStart))}</b>
</div>
<div class="history-range-center">
<span>${esc(rangeLabel())}</span>
${latestText
?`<small>ข้อมูลล่าสุด ${esc(latestText)}</small>`
:`<small>ยังไม่มีข้อมูลในช่วงนี้</small>`}
</div>
<div class="history-range-edge history-range-edge-end">
<span>${averageRange==="custom"?"สิ้นสุด":"ถึงปัจจุบัน"}</span>
<b>${esc(edgeText(displayEnd))}</b>
</div>`;
}


function historyLabelsToRangeEnd(rows=[]){
const labels=(rows||[]).map(r=>r?.timestamp).filter(Boolean);
const w=rangeWindow();

if(!w){
return labels;
}

const last=labels.length
?parseDate(labels.at(-1))
:null;

// ให้แกน X แสดงปลายช่วงที่เลือกจริง แม้ข้อมูลล่าสุดจะหยุดก่อนเวลาปัจจุบัน
if(!last||w.end.getTime()-last.getTime()>1000){
labels.push(w.end.toISOString());
}

return labels;
}

function padChartValuesToLabels(values=[],labels=[]){
const out=[...values];
while(out.length<labels.length){
out.push(null);
}
return out;
}

// =====================================================
// SENSOR SANITIZER
// =====================================================

function cleanSensorNumber(field,value){

if(
value===null||
value===undefined||
value===""
){
return null;
}

const n=
Number(value);

if(
!Number.isFinite(n)
){
return null;
}

if(
[
"pm1",
"pm25",
"pm10"
]
.includes(field)
){

return(
n>=0&&
n<=5000
)
?n
:null;

}

if(
field==="temperature"
){

return(
n>=-40&&
n<=85
)
?n
:null;

}

if(
field==="humidity"
){

return(
n>=0&&
n<=100
)
?n
:null;

}

if(
field==="light"
){

return(
n>=0&&
n<=200000
)
?n
:null;

}

return n;

}

// =====================================================
// NORMALIZE API
// =====================================================

function normalize(d){

if(!d){
return null;
}

const out={

id:
d.id==null
?null
:Number(d.id),

device_id:
String(
d.device_id??""
)
.trim(),

status:
String(
d.status??"offline"
)
.toLowerCase(),

pm1:
cleanSensorNumber(
"pm1",
d.pm1
),

pm25:
cleanSensorNumber(
"pm25",
d.pm25
),

pm10:
cleanSensorNumber(
"pm10",
d.pm10
),

temperature:
cleanSensorNumber(
"temperature",
d.temperature
),

humidity:
cleanSensorNumber(
"humidity",
d.humidity
),

light:
cleanSensorNumber(
"light",
d.light
),

timestamp:
d.recorded_at||
d.timestamp||
null,

status_recorded_at:
d.status_recorded_at||
d.recorded_at||
null,

reading_recorded_at:
d.reading_recorded_at||
null,

last_seen:
d.last_seen||
null,

connection_status:
d.connection_status||
null,

command_status:
d.command_status||
null,

sensor_invalid:false

};

const values=[
"pm1",
"pm25",
"pm10",
"temperature",
"humidity",
"light"
]
.map(
k=>out[k]
);

if(
values.every(
v=>v===0
)
){

for(
const k of[
"pm1",
"pm25",
"pm10",
"temperature",
"humidity",
"light"
]
){

out[k]=null;

}

out.sensor_invalid=true;

}

return out;

}

// =====================================================
// NODE
// =====================================================

function nodeNo(id){

const m=
String(
id||""
)
.match(
/(\d+)/
);

return m
?Number(m[1])
:null;

}

function getNode(n){

return latestNodes
.find(
x=>
nodeNo(
x.device_id
)===n
)||
null;

}

function motherOnline(){

if(
!apiConnectionOnline||
!motherStatus||
String(
motherStatus.status
)
.toLowerCase()!=="online"
){
return false;
}

const d=
parseDate(
motherStatus.last_seen||
motherStatus.updated_at
);

if(!d){
return false;
}

return(
Date.now()-
d.getTime()
<=
MOTHER_OFFLINE_MS
);

}

// =====================================================
// NODE STATUS RULE
//
// Gateway Offline
// -> Node ทุกตัว Offline
//
// ONLINE / SLEEP
// -> ต้องไม่เกิน 6 นาที
//
// เกิน 6 นาที
// -> Offline
// =====================================================

function getNodeStatus(node){

if(
!motherOnline()||
!node
){
return "offline";
}

const s=String(node.status||"offline").toLowerCase();

// Offline/expected-wake decisions are made by the Worker.
// Sleep is preserved internally and displayed as available by getNodeDisplayStatus().
return s==="sleep"
?"sleep"
:s==="online"
?"online"
:"offline";

}

function activeCount(){

return latestNodes
.filter(
n=>
[
"online",
"sleep"
]
.includes(
getNodeStatus(n)
)
)
.length;

}

// =====================================================
// DASHBOARD DISPLAY STATUS
//
// Backend ยังเก็บ online / sleep / offline ตามจริง
// แต่ Dashboard แสดง sleep เป็น ONLINE
// =====================================================

function getNodeDisplayStatus(node){
const st=getNodeStatus(node);
return st==="offline"?"offline":"online";
}


// =====================================================
// FETCH
// =====================================================

async function fetchJson(url){

const r=
await fetch(

url+
(
url.includes("?")
?"&"
:"?"
)+
"t="+
Date.now(),

{
cache:"no-store",
headers:{
Accept:"application/json"
}
}

);

if(!r.ok){

throw new Error(
`HTTP ${r.status}`
);

}

const j=
await r.json();

if(!j?.success){

throw new Error(
j?.message||
"API error"
);

}

return j;

}

// =====================================================
// LOAD API
// =====================================================

async function loadLatest(){

const j=
await fetchJson(
API.latest
);

return(
Array.isArray(
j.data
)
?j.data
:j.data
?[j.data]
:[]
)
.map(
normalize
)
.filter(
Boolean
);

}

async function loadMother(){

const j=
await fetchJson(
API.mother
);

return j.data
?{

status:
String(
j.data.status||
"offline"
)
.toLowerCase(),

last_seen:
j.data.last_seen||
null,

updated_at:
j.data.updated_at||
null

}
:null;

}

async function loadAlerts(){

const j=
await fetchJson(
API.alerts
);

return Array.isArray(
j.data
)
?j.data
:[];

}

async function loadStandards(){

return fetchJson(
API.standards
);

}

function apiRange(){

if(
averageRange==="custom"
){

return"30d";

}

return RANGE_CONFIG[
averageRange
]?.apiRange||
"today";

}

async function loadHistory(){

const j=
await fetchJson(
`${API.history}?range=${encodeURIComponent(apiRange())}`
);

return(
Array.isArray(
j.data
)
?j.data
:[]
)
.map(
normalize
)
.filter(
Boolean
);

}

// =====================================================
// MONITORING NODES
// =====================================================

function setNodeValues(
prefix,
n
){

for(
const k of[
"pm1",
"pm25",
"pm10"
]
){

const e=
$(prefix+k);

if(e){

e.textContent=
n
?fmt(n[k])
:"--";

}

}

const map={

temp:[
"temperature",
"°C"
],

hum:[
"humidity",
"%"
],

light:[
"light",
" lux"
]

};

for(
const[
k,
[
field,
unit
]
]
of Object.entries(map)
){

const e=
$(prefix+k);

if(e){

e.textContent=
n&&
n[field]!=null
?fmt(n[field])+unit
:"--";

}

}

}

function renderNodeStatus(
i,
n
){

const s=
$("n"+i+"status");

const card=
$("nodeCard"+i);

if(
!s||
!card
){
return;
}

const st=
getNodeDisplayStatus(n);

const map={

online:[
"status-online",
"status-online-dot",
"ONLINE"
],

offline:[
"status-offline",
"status-offline-dot",
"OFFLINE"
]

};

const[
cls,
dot,
label
]=map[st];

s.className=
`${cls} text-xs font-bold`;

s.innerHTML=
`<span class="${dot}">●</span> ${label} <span class="badge rounded-full px-3 py-1 text-xs">ESP-NOW</span>`;

card.classList.toggle(
"offline",
st==="offline"
);

}

function renderMonitoring(){

for(
let i=1;
i<=3;
i++
){

const n=
getNode(i);

setNodeValues(
"n"+i,
n
);

const t=
$("lastUpdate"+i);

if(t){

t.textContent=
n?.timestamp
?thaiTime(
n.timestamp
)
:"--";

}

renderNodeStatus(
i,
n
);

}

const dot=
$("gatewayDotTop");

const st=
$("gatewayStatusTop");

const ac=
$("nodesActiveTop");

if(
!dot||
!st||
!ac
){
return;
}

if(
!apiConnectionOnline
){

dot.className=
"text-red-400";

st.textContent=
"API ERROR";

ac.textContent=
"ตรวจสอบจำนวนจุดไม่ได้";

}else if(
motherOnline()
){

dot.className=
"text-emerald-400";

st.textContent=
"ONLINE";

ac.textContent=
`${activeCount()} / ${TOTAL_NODES} จุด`;

}else{

dot.className=
"text-red-400";

st.textContent=
"OFFLINE";

ac.textContent=
`0 / ${TOTAL_NODES} จุด`;

}

}

// =====================================================
// THRESHOLD
// =====================================================

function threshold(field,value){

const n=
finiteNumberOrNull(value);

if(
n===null
){
return"no_data";
}

if(
field==="pm25"
){

if(
n>75
){
return"critical";
}

if(
n>37.5
){
return"warning";
}

return"normal";

}

if(
field==="pm10"
){

// 120 µg/m³ เป็นค่าอ้างอิง PM10 เฉลี่ย 24 ชั่วโมงของไทย
// การเทียบกับค่ารอบล่าสุดใช้เพื่อเฝ้าระวังเบื้องต้นเท่านั้น
return n>120
?"warning"
:"info";

}

// PM1.0 / Temperature / Humidity / Light
// ไม่มี Health Threshold เดี่ยวที่ Dashboard ใช้ตัดสิน
return"info";

}

function levelText(level){

return{

normal:
"ปกติ",

warning:
"เฝ้าระวัง",

critical:
"มีผลกระทบต่อสุขภาพ",

info:
"ข้อมูลประกอบ",

no_data:
"รอข้อมูล"

}[
level
]||
"รอข้อมูล";

}

// =====================================================
// PM2.5 GUIDANCE
// =====================================================

function pm25Guidance(value){

const n=
finiteNumberOrNull(value);

if(
n===null
){

return{
level:"no_data",
label:"ไม่มีข้อมูล"
};

}

if(
n<=15
){

return{
level:"normal",
label:"ดีมาก"
};

}

if(
n<=25
){

return{
level:"normal",
label:"ดี"
};

}

if(
n<=37.5
){

return{
level:"normal",
label:"ปานกลาง"
};

}

if(
n<=75
){

return{
level:"warning",
label:"เริ่มมีผลกระทบต่อสุขภาพ"
};

}

return{
level:"critical",
label:"มีผลกระทบต่อสุขภาพ"
};

}

// =====================================================
// HEAT INDEX
// =====================================================

function heatIndexC(
tempC,
rh
){

tempC=
finiteNumberOrNull(tempC);

rh=
finiteNumberOrNull(rh);

if(
tempC===null||
rh===null
){

return null;

}

const f=
tempC*
9/
5+
32;

if(
f<80||
rh<40
){

return tempC;

}

let hi=

-42.379+

2.04901523*f+

10.14333127*rh-

0.22475541*f*rh-

0.00683783*f*f-

0.05481717*rh*rh+

0.00122874*f*f*rh+

0.00085282*f*rh*rh-

0.00000199*f*f*rh*rh;

if(
rh<13&&
f>=80&&
f<=112
){

hi-=

(
(13-rh)/4
)*

Math.sqrt(

(
17-
Math.abs(
f-95
)
)/
17

);

}else if(
rh>85&&
f>=80&&
f<=87
){

hi+=

(
(rh-85)/10
)*

(
(87-f)/5
);

}

return(
hi-32
)*
5/
9;

}

// =====================================================
// HEAT LEVEL
// =====================================================

function heatLevel(value){

const n=
finiteNumberOrNull(value);

if(n===null){
return{level:"no_data",label:"ไม่มีข้อมูล"};
}

if(n<27){
return{level:"normal",label:"ต่ำกว่าเกณฑ์เฝ้าระวัง"};
}

if(n<32){
return{level:"watch",label:"เฝ้าระวัง"};
}

if(n<41){
return{level:"warning",label:"เตือนภัย"};
}

if(n<=54){
return{level:"critical",label:"อันตราย"};
}

return{level:"critical",label:"อันตรายมาก"};

}

// =====================================================
// ACTIVE NODE DATA
// =====================================================

function activeNodes(){

if(
!motherOnline()
){

return[];

}

return latestNodes
.filter(
n=>
[
"online",
"sleep"
]
.includes(
getNodeStatus(n)
)
);

}

function averageOf(
nodes,
field
){

const a=
nodes
.map(
n=>finiteNumberOrNull(n[field])
)
.filter(v=>v!==null);

return a.length

?a.reduce(
(
x,
y
)=>
x+y,
0
)/
a.length

:null;

}

function currentEnvironmentSnapshot(){

const nodes=
activeNodes();

const temperature=
averageOf(
nodes,
"temperature"
);

const humidity=
averageOf(
nodes,
"humidity"
);

return{

nodes,

pm1:
averageOf(
nodes,
"pm1"
),

pm25:
averageOf(
nodes,
"pm25"
),

pm10:
averageOf(
nodes,
"pm10"
),

temperature,

humidity,

light:
averageOf(
nodes,
"light"
),

heatIndex:
heatIndexC(
temperature,
humidity
)

};

}

// =====================================================
// สภาพแวดล้อมในพื้นที่ ANALYSIS
// ใช้ Light เป็นตัวแปรสภาพแวดล้อมเฉพาะจุด
// วิเคราะห์ความสัมพันธ์กับ Temperature / Humidity / PM2.5
// ความสัมพันธ์ (correlation) ไม่ใช่หลักฐานของเหตุ–ผล
// =====================================================

function pearsonCorrelation(rows, xField, yField){
const pairs=rows
.map(r=>[finiteNumberOrNull(r[xField]),finiteNumberOrNull(r[yField])])
.filter(([x,y])=>x!==null&&y!==null);

if(pairs.length<6) return {r:null,n:pairs.length};

const xs=pairs.map(p=>p[0]);
const ys=pairs.map(p=>p[1]);
const mx=xs.reduce((a,b)=>a+b,0)/xs.length;
const my=ys.reduce((a,b)=>a+b,0)/ys.length;
let num=0,dx=0,dy=0;
for(let i=0;i<pairs.length;i++){
const a=xs[i]-mx;
const b=ys[i]-my;
num+=a*b;
dx+=a*a;
dy+=b*b;
}
const den=Math.sqrt(dx*dy);
return {r:den>0?num/den:null,n:pairs.length};
}

function correlationText(result,label){
if(result.r===null) return `${label}: ข้อมูลคู่ยังไม่เพียงพอ (${result.n} จุด)`;
const a=Math.abs(result.r);
const strength=a>=.7?"ค่อนข้างสูง":a>=.4?"ปานกลาง":a>=.2?"เล็กน้อย":"ยังไม่ชัดเจน";
const direction=result.r>0?"ทิศทางเดียวกัน":result.r<0?"ทิศทางตรงข้าม":"ไม่พบแนวโน้ม";
return `${label}: ${strength} • ${direction} (r=${result.r.toFixed(2)}, n=${result.n})`;
}

function localEnvironmentAnalysis(){
const data=selectedRecords();
const lightRows=data.filter(r=>hasFiniteSensorValue(r.light));
const currentLight=lightRows.length?finiteNumberOrNull(lightRows.at(-1).light):null;

let trend="ข้อมูลยังไม่พอ";
let level="no_data";
if(lightRows.length>=4){
const recent=lightRows.slice(-Math.min(12,lightRows.length));
const first=finiteNumberOrNull(recent[0].light);
const last=finiteNumberOrNull(recent.at(-1).light);
if(first!==null&&last!==null){
const pct=first===0?0:((last-first)/Math.max(Math.abs(first),1))*100;
trend=pct>20?"ความเข้มแสงเพิ่มขึ้น":pct<-20?"ความเข้มแสงลดลง":"ความเข้มแสงค่อนข้างคงที่";
level="normal";
}
}

const lightTemp=pearsonCorrelation(data,"light","temperature");
const lightHumidity=pearsonCorrelation(data,"light","humidity");
const lightPM25=pearsonCorrelation(data,"light","pm25");

const relationships=[
correlationText(lightTemp,"แสง ↔ อุณหภูมิ"),
correlationText(lightHumidity,"แสง ↔ ความชื้น"),
correlationText(lightPM25,"แสง ↔ PM2.5")
];

return {
level,
currentLight,
trend,
lightTemp,
lightHumidity,
lightPM25,
relationships,
label: currentLight==null?"รอข้อมูลแสง":`${fmt(currentLight)} lux`,
detail:`${trend} • วิเคราะห์ความสัมพันธ์ของข้อมูล ณ จุดตรวจวัด โดยไม่สรุปว่าแสงเป็นสาเหตุโดยตรง`
};
}

// =====================================================
// COMBINED AIR QUALITY + DUST PROFILE
// =====================================================

function pm10Guidance(value){

const n=
finiteNumberOrNull(value);

if(n===null){
return{
level:"no_data",
label:"ไม่มีข้อมูล"
};
}

// 120 µg/m³ เป็นค่ามาตรฐาน PM10 เฉลี่ย 24 ชั่วโมงของไทย
// การใช้กับค่ารอบล่าสุดเป็นเพียงการเฝ้าระวังเบื้องต้น
if(n>120){
return{
level:"warning",
label:"สูงกว่าค่าอ้างอิง 24 ชั่วโมง"
};
}

return{
level:"normal",
label:"ยังไม่สูงกว่าค่าอ้างอิง"
};

}

function combinedAirQualitySummary(snap){

const pm1=
finiteNumberOrNull(snap?.pm1);

const pm25=
finiteNumberOrNull(snap?.pm25);

const pm10=
finiteNumberOrNull(snap?.pm10);

const p25=
pm25Guidance(pm25);

const p10=
pm10Guidance(pm10);

if(
pm1===null&&
pm25===null&&
pm10===null
){
return{
level:"no_data",
label:"รอข้อมูล",
detail:"ยังไม่มีข้อมูลฝุ่นที่ใช้ได้"
};
}

let level="normal";
let label="อากาศโดยรวมดี";

if(
["warning","critical"].includes(p25.level)&&
p10.level==="warning"
){
level=
p25.level==="critical"
?"critical"
:"warning";
label="ควรเฝ้าระวังฝุ่นหลายขนาด";
}else if(
["warning","critical"].includes(p25.level)
){
level=p25.level;
label="ควรเฝ้าระวังฝุ่นขนาดเล็ก";
}else if(
p10.level==="warning"
){
level="warning";
label="ควรเฝ้าระวังฝุ่นขนาดใหญ่";
}else if(
pm25!==null&&
p25.label==="ปานกลาง"
){
label="อากาศโดยรวมปานกลาง";
}

const values=[];

if(pm1!==null){
values.push(`PM1 ${fmt(pm1)}`);
}

if(pm25!==null){
values.push(`PM2.5 ${fmt(pm25)}`);
}

if(pm10!==null){
values.push(`PM10 ${fmt(pm10)}`);
}

return{
level,
label,
detail:
values.length
?`${values.join(" • ")} µg/m³`
:"ยังไม่มีข้อมูลฝุ่นที่ใช้ได้"
};

}

function dustProfileSummary(snap){

const pm1=
finiteNumberOrNull(snap?.pm1);

const pm25=
finiteNumberOrNull(snap?.pm25);

const pm10=
finiteNumberOrNull(snap?.pm10);

if(
pm25===null||
pm10===null||
pm10<=0
){
return{
label:"รอข้อมูล",
detail:"ต้องมี PM2.5 และ PM10 เพื่อดูลักษณะฝุ่น"
};
}

const fineShare=
Math.max(
0,
Math.min(
1,
pm25/pm10
)
);

let label;

if(fineShare>=0.70){
label="ฝุ่นขนาดเล็กเป็นสัดส่วนหลัก";
}else if(fineShare>=0.40){
label="พบฝุ่นหลายขนาดผสมกัน";
}else{
label="ฝุ่นขนาดใหญ่มีสัดส่วนมากขึ้น";
}

const details=[
`PM2.5 คิดเป็น ${Math.round(fineShare*100)}% ของ PM10`
];

if(
pm1!==null&&
pm25>0
){
const pm1Share=
Math.max(
0,
Math.min(
1,
pm1/pm25
)
);

details.push(
`PM1 คิดเป็น ${Math.round(pm1Share*100)}% ของ PM2.5`
);
}

return{
label,
detail:details.join(" • ")
};

}

// =====================================================
// ACTIVITY RECOMMENDATION
// =====================================================

function activityRecommendation(
pm25,
pm10,
heatIndex
){

const p=
pm25Guidance(
pm25
);

const p10=
pm10Guidance(
pm10
);

const h=
heatLevel(
heatIndex
);

if(
p.level==="critical"
){
return"ควรลดหรือหลีกเลี่ยงกิจกรรมกลางแจ้งที่ใช้แรงมาก และติดตามค่าฝุ่นอย่างใกล้ชิด";
}

if(
h.level==="critical"
){
return"ควรลดกิจกรรมกลางแจ้งที่ใช้แรงมาก หลีกเลี่ยงช่วงร้อนจัด และพักในบริเวณที่เหมาะสม";
}

if(
p.level==="warning"||
p10.level==="warning"||
h.level==="warning"||
h.level==="watch"
){
return"ทำกิจกรรมได้โดยเพิ่มความระมัดระวัง ลดกิจกรรมที่ใช้แรงมาก และติดตามค่าฝุ่นกับสภาพความร้อนต่อเนื่อง";
}

return"ยังไม่พบข้อจำกัดเด่นจากฝุ่นและสภาพความร้อนสำหรับกิจกรรมทั่วไป แต่ควรติดตามข้อมูลต่อเนื่อง";

}

// =====================================================
// CURRENT ENVIRONMENT
// =====================================================

function currentCfg(){

return CURRENT_METRIC_CONFIG[
currentMetric
]||
CURRENT_METRIC_CONFIG.pm25;

}

function currentValue(v){

const c=
currentCfg();

return(
!hasFiniteSensorValue(v)
)
?"--"
:`${fmt(v)} ${c.unit}`;

}

function qualityBadge(l){

const b=
$("qualityBadge");

if(!b){
return;
}

b.className=
"current-quality-badge";

const m={

normal:[
"ปกติ",
"current-quality-normal"
],

warning:[
"เฝ้าระวัง",
"current-quality-warning"
],

critical:[
"สูง",
"current-quality-critical"
],

info:[
"ข้อมูลประกอบ",
"current-quality-info"
],

no_data:[
"รอข้อมูล",
"current-quality-unavailable"
]

};

const x=
m[l]||
m.no_data;

b.textContent=
x[0];

b.classList.add(
x[1]
);

}

function resetCurrent(reason){

const c=
currentCfg();

if(
$("currentOverallLabel")
){

$("currentOverallLabel").textContent=
c.label+
" ภาพรวม";

}

for(
const id of[
"currentOverallValue",
"currentHighestValue",
"currentHighestNode",
"currentWatchNode"
]
){

if($(id)){

$(id).textContent=
"--";

}

}

if(
$("currentOverallDetail")
){

$("currentOverallDetail").textContent=
"ค่าเฉลี่ยจากจุดที่ ONLINE";

}

if(
$("currentWatchDetail")
){

$("currentWatchDetail").textContent=
reason;

}

if(
$("currentEnvironmentFooter")
){

$("currentEnvironmentFooter").textContent=
reason;

}

qualityBadge(
"no_data"
);

}

function updateCurrent(){

const c=
currentCfg();

if(
$("currentOverallLabel")
){

$("currentOverallLabel").textContent=
c.label+
" ภาพรวม";

}

if(
!apiConnectionOnline
){

return resetCurrent(
"ไม่สามารถเชื่อมต่อ API ได้"
);

}

if(
!motherOnline()
){

return resetCurrent(
"สถานีรับข้อมูลหลักขาดการเชื่อมต่อ • ไม่สามารถยืนยันข้อมูลปัจจุบันได้"
);

}

const usable=
latestNodes
.filter(
n=>
[
"online",
"sleep"
]
.includes(
getNodeStatus(n)
)&&
hasFiniteSensorValue(
n[currentMetric]
)
);

if(
!usable.length
){

return resetCurrent(
"ไม่มีอุปกรณ์ที่มีข้อมูลสำหรับตัวแปรนี้"
);

}

const avg=
usable.reduce(
(
sum,
n
)=>
sum+
Number(
n[currentMetric]
),
0
)/
usable.length;

const high=
usable.reduce(
(
a,
b
)=>
Number(
b[currentMetric]
)>
Number(
a[currentMetric]
)
?b
:a
);

const watch=
usable
.map(
n=>({

n,

v:
Number(
n[currentMetric]
),

l:
threshold(
currentMetric,
n[currentMetric]
)

})
)
.filter(
x=>
[
"warning",
"critical"
]
.includes(
x.l
)
)
.sort(
(
a,
b
)=>
b.v-a.v
)
[0];

$("currentOverallValue").textContent=
currentValue(
avg
);

$("currentOverallDetail").textContent=
`ค่าเฉลี่ยจาก ${usable.length} จุดที่ใช้งาน`;

$("currentHighestValue").textContent=
currentValue(
high[currentMetric]
);

$("currentHighestNode").textContent=
`จุดตรวจวัด ${nodeNo(high.device_id)}`;

qualityBadge(
threshold(
currentMetric,
avg
)
);

$("currentWatchNode").textContent=
watch
?`จุดตรวจวัด ${nodeNo(watch.n.device_id)}`
:"ไม่มี";

$("currentWatchDetail").textContent=
watch
?`${c.label} ${currentValue(watch.v)} • ${levelText(watch.l)}`
:currentMetric==="pm25"
?"ยังไม่พบจุดที่ PM2.5 เข้าเกณฑ์เฝ้าระวัง"
:currentMetric==="pm10"
?"ยังไม่พบค่ารอบล่าสุดของ PM10 สูงกว่า 120 µg/m³ • การตัดสินมาตรฐานต้องใช้ค่าเฉลี่ย 24 ชั่วโมง"
:`${c.label} ใช้เป็นข้อมูลประกอบและการเปรียบเทียบ ไม่ใช้เกณฑ์แจ้งเตือนเดี่ยวในโครงการ`;

if(
$("currentEnvironmentFooter")
){

$("currentEnvironmentFooter").textContent=
`ใช้ข้อมูลล่าสุดจาก ${usable.length} / ${TOTAL_NODES} จุดตรวจวัด`;

}

}

// =====================================================
// SMART SUMMARY
// =====================================================

function updateSmart(){

const e=
$("aiSummary");

if(!e){
return;
}

if(
!apiConnectionOnline
){
e.innerHTML=
'<div class="smart-summary-headline offline">🔴 ไม่สามารถเชื่อมต่อระบบข้อมูลได้</div><div class="smart-summary-note danger">ยังไม่สามารถยืนยันสถานการณ์ปัจจุบันได้</div>';
return;
}

if(
!motherOnline()
){
e.innerHTML=
`<div class="smart-summary-headline offline">
🔴 สถานีหลักขาดการเชื่อมต่อ
</div>

<div class="smart-summary-grid">

<div class="smart-summary-stat">
<div class="smart-summary-stat-label">🌿 คุณภาพอากาศ</div>
<div class="smart-summary-stat-value">ยังประเมินไม่ได้</div>
<div class="smart-summary-stat-sub">รอการเชื่อมต่อกลับมา</div>
</div>

<div class="smart-summary-stat">
<div class="smart-summary-stat-label">🌡 สภาพความร้อน</div>
<div class="smart-summary-stat-value">ยังประเมินไม่ได้</div>
<div class="smart-summary-stat-sub">รอการเชื่อมต่อกลับมา</div>
</div>

<div class="smart-summary-stat">
<div class="smart-summary-stat-label">🌫 ลักษณะฝุ่นในพื้นที่</div>
<div class="smart-summary-stat-value">ยังประเมินไม่ได้</div>
<div class="smart-summary-stat-sub">รอข้อมูลฝุ่นจากจุดตรวจวัด</div>
</div>

<div class="smart-summary-stat">
<div class="smart-summary-stat-label">📡 สถานีตรวจวัด</div>
<div class="smart-summary-stat-value">ขาดการเชื่อมต่อ</div>
<div class="smart-summary-stat-sub">ไม่สามารถยืนยันข้อมูลล่าสุดได้</div>
</div>

</div>

<div class="smart-summary-note danger">
ระบบจะไม่ใช้ค่าที่ค้างในฐานข้อมูลเป็นสถานการณ์ปัจจุบันจนกว่าการเชื่อมต่อจะกลับมา
</div>`;
return;
}

const snap=
currentEnvironmentSnapshot();

const air=
combinedAirQualitySummary(
snap
);

const heat=
heatLevel(
snap.heatIndex
);

const dust=
dustProfileSummary(
snap
);

const on=
latestNodes
.filter(
n=>
getNodeDisplayStatus(n)==="online"
)
.length;

const off=
TOTAL_NODES-on;

let severity="normal";
let headline="🟢 ภาพรวมปกติ";

if(
air.level==="critical"||
heat.level==="critical"
){
severity="critical";
headline="🔴 มีสถานการณ์ที่ควรให้ความสำคัญ";
}else if(
air.level==="warning"||
heat.level==="warning"||
heat.level==="watch"||
off>0
){
severity="watch";
headline="🟡 มีข้อมูลที่ควรติดตาม";
}

const heatMain=
snap.heatIndex==null
?"รอข้อมูล"
:(
heat.level==="normal"
?"อากาศสบาย"
:heat.label
);

const heatSub=
snap.heatIndex==null
?"ยังไม่มีข้อมูลอุณหภูมิและความชื้น"
:`ความรู้สึกร้อน ${fmt(snap.heatIndex)} °C`;

const systemMain=
off===0
?`ทำงานปกติ ${on} / ${TOTAL_NODES} จุด`
:`ใช้งานได้ ${on} / ${TOTAL_NODES} จุด`;

const systemSub=
off===0
?"การเชื่อมต่อของจุดตรวจวัดครบ"
:`มี ${off} จุดที่ขาดการเชื่อมต่อ`;

const activity=
activityRecommendation(
snap.pm25,
snap.pm10,
snap.heatIndex
);

const activityGood=
!["critical","warning"].includes(air.level)&&
!["critical","warning"].includes(heat.level);

e.innerHTML=
`<div class="smart-summary-headline ${severity}">
${headline}
</div>

<div class="smart-summary-grid">

<div class="smart-summary-stat smart-summary-air">
<div class="smart-summary-stat-label">🌿 คุณภาพอากาศ</div>
<div class="smart-summary-stat-value">${esc(air.label)}</div>
<div class="smart-summary-stat-sub">${esc(air.detail)}</div>
</div>

<div class="smart-summary-stat smart-summary-heat">
<div class="smart-summary-stat-label">🌡 สภาพความร้อน</div>
<div class="smart-summary-stat-value">${esc(heatMain)}</div>
<div class="smart-summary-stat-sub">${esc(heatSub)}</div>
</div>

<div class="smart-summary-stat smart-summary-environment">
<div class="smart-summary-stat-label">🌫 ลักษณะฝุ่นในพื้นที่</div>
<div class="smart-summary-stat-value">${esc(dust.label)}</div>
<div class="smart-summary-stat-sub">${esc(dust.detail)}</div>
</div>

<div class="smart-summary-stat smart-summary-system">
<div class="smart-summary-stat-label">📡 สถานีตรวจวัด</div>
<div class="smart-summary-stat-value">${esc(systemMain)}</div>
<div class="smart-summary-stat-sub">${esc(systemSub)}</div>
</div>

</div>

<div class="smart-summary-activity ${activityGood?"":"is-watch"}">
<div class="smart-summary-activity-label">🏃 กิจกรรมกลางแจ้ง</div>
<div>${esc(activity)}</div>
</div>`;

}

// =====================================================
// ALERT
// =====================================================

function updateAlertUI(){

const e=
$("alerts");

if(!e){
return;
}

if(
!apiConnectionOnline
){

e.innerHTML=
'<div class="soft rounded-xl p-3"><b class="text-red-300">🔴 ไม่สามารถเชื่อมต่อ API</b></div>';

return;

}

if(
!motherOnline()
){

e.innerHTML=
'<div class="soft rounded-xl p-3"><b class="text-red-300">🔴 สถานีหลักขาดการเชื่อมต่อ</b><div class="text-xs text-slate-400 mt-1">ยังไม่สามารถยืนยันสถานะของจุดตรวจวัดได้</div></div>';

return;

}

const list=[];

for(
let i=1;
i<=TOTAL_NODES;
i++
){

const n=
getNode(i);

const st=
getNodeStatus(n);

if(
st==="offline"
){

list.push({

icon:
"🔴",

title:
`จุดตรวจวัด ${i} ขาดการเชื่อมต่อ`,

detail:
"ระบบไม่ได้รับข้อมูลจากจุดตรวจวัดภายในเวลาที่กำหนด"

});

continue;

}

const state=
alertStates.find(
a=>
nodeNo(
a.device_id
)===i
);

if(!state){
continue;
}

const pmLevel=
String(
state.pm25_level||
"normal"
);

if(
pmLevel!=="normal"
){

const g=
pm25Guidance(
n?.pm25
);

list.push({

icon:
pmLevel==="critical"
?"🔴"
:"🟡",

title:
`จุดตรวจวัด ${i} • PM2.5`,

detail:
`${fmt(n?.pm25)} µg/m³ • ${g.label}`

});

}

const heatState=
String(
state.temperature_level||
"normal"
);

if(
heatState!=="normal"
){

const hi=
heatIndexC(
n?.temperature,
n?.humidity
);

const h=
heatLevel(
hi
);

list.push({

icon:
heatState==="critical"
?"🔴"
:"🟡",

title:
`จุดตรวจวัด ${i} • สภาพความร้อน`,

detail:
`${fmt(hi)} °C • ${h.label}`

});

}

}

e.innerHTML=
list.length

?list
.map(
x=>
`<div class="soft rounded-xl p-3 mb-2">
<b>
${x.icon} ${esc(x.title)}
</b>
<div class="text-xs text-slate-400 mt-1">
${esc(x.detail)}
</div>
</div>`
)
.join("")

:'<div class="soft rounded-xl p-3"><b class="text-emerald-300">✅ ยังไม่มีสิ่งที่ต้องเฝ้าระวัง</b></div>';

}

// =====================================================
// HISTORY
// =====================================================

function rangeLabel(){

if(
averageRange==="custom"&&
customRangeStart&&
customRangeEnd
){

return`${customRangeStart.toLocaleString("th-TH")} – ${customRangeEnd.toLocaleString("th-TH")}`;

}

return RANGE_CONFIG[
averageRange
]?.label||
"ช่วงเวลาที่เลือก";

}

function rangeWindow(){

if(
averageRange==="custom"
){

return(
customRangeStart&&
customRangeEnd
)
?{
start:
customRangeStart,

end:
customRangeEnd
}
:null;

}

const end=
new Date();

if(
averageRange==="today"
){

const parts=
new Intl.DateTimeFormat(
"en-CA",
{
timeZone:
"Asia/Bangkok",
year:
"numeric",
month:
"2-digit",
day:
"2-digit"
}
)
.formatToParts(
end
);

const get=
t=>
parts.find(
p=>
p.type===t
)?.value;

const start=
new Date(
`${get("year")}-${get("month")}-${get("day")}T00:00:00+07:00`
);

return{
start,
end
};

}

const c=
RANGE_CONFIG[
averageRange
];

if(
!c||
!Number.isFinite(
c.minutes
)
){

return null;

}

return{

start:
new Date(
end.getTime()-
c.minutes*
60000
),

end

};

}

function hasAnySensorData(row){

if(!row){
return false;
}

return [
"pm1",
"pm25",
"pm10",
"temperature",
"humidity",
"light"
].some(
field=>
hasFiniteSensorValue(
row[field]
)
);

}

function selectedRecords(){

const w=
rangeWindow();

return w
?records.filter(
r=>{

const d=
parseDate(
r.timestamp
);

return(
d&&
d>=w.start&&
d<=w.end&&
hasAnySensorData(r)
);

}
)
:[];

}

function metricLabel(){

return CURRENT_METRIC_CONFIG[
metric
]?.label||
metric;

}

function metricUnit(){

return CURRENT_METRIC_CONFIG[
metric
]?.unit||
"";

}

function stats(
data,
field
){

const values=
data
.map(
x=>finiteNumberOrNull(x[field])
)
.filter(v=>v!==null);

return values.length
?{

avg:
values.reduce(
(
a,
b
)=>
a+b,
0
)/
values.length,

max:
Math.max(
...values
),

min:
Math.min(
...values
),

last:
values.at(-1)

}
:{

avg:null,
max:null,
min:null,
last:null

};

}

function renderAverages(){

const d=
selectedRecords();

if(
$("selectedRangeLabel")
){

$("selectedRangeLabel").textContent=
rangeLabel();

}

const defs=[

[
"pm1",
"averagePM1",
"averagePM1Status"
],

[
"pm25",
"averagePM25",
"averagePM25Status"
],

[
"pm10",
"averagePM10",
"averagePM10Status"
],

[
"temperature",
"averageTemp",
"averageTempStatus"
],

[
"humidity",
"averageHum",
"averageHumStatus"
],

[
"light",
"averageLight",
"averageLightStatus"
]

];

for(
const[
field,
id,
statusId
]
of defs
){

const s=
stats(
d,
field
);

if($(id)){

$(id).textContent=
s.avg==null
?"--"
:fmt(s.avg);

}

if($(statusId)){

$(statusId).textContent=
s.avg==null
?"● ไม่มีข้อมูล"
:`● เฉลี่ย ${rangeLabel()}`;

}

}

}


const GRAPH_FIELDS=["pm1","pm25","pm10","temperature","humidity","light"];

function metricColor(field){
return CURRENT_METRIC_CONFIG[field]?.color||"#22d3ee";
}

function metricLabelFor(field){
return CURRENT_METRIC_CONFIG[field]?.label||field;
}

function metricUnitFor(field){
return CURRENT_METRIC_CONFIG[field]?.unit||"";
}

function normalizeSeries(values, extra=[]){
const nums=[...values,...extra]
.map(finiteNumberOrNull)
.filter(v=>v!==null);

if(!nums.length)return values.map(()=>null);

const min=Math.min(...nums);
const max=Math.max(...nums);

if(Math.abs(max-min)<1e-9){
return values.map(v=>hasFiniteSensorValue(v)?50:null);
}

return values.map(v=>{
const n=finiteNumberOrNull(v);
return n!==null?((n-min)/(max-min))*100:null;
});
}

function graphTooltipLabel(ctx){
const ds=ctx.dataset||{};
const raw=Array.isArray(ds.rawValues)?ds.rawValues[ctx.dataIndex]:null;
const field=ds.metricField;
if(field&&hasFiniteSensorValue(raw)){
return `${ds.label}: ${fmt(raw)} ${metricUnitFor(field)}`.trim();
}
return `${ds.label}: ${Number(ctx.parsed?.y??0).toFixed(1)}`;
}

function isMobileChart(){
return window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
}

function graphLegendOptions(){
const mobile=isMobileChart();
return{
display:true,
position:"top",
align:"start",
labels:{
boxWidth:mobile?12:18,
boxHeight:3,
usePointStyle:false,
padding:mobile?10:16,
font:{size:mobile?12:13,weight:"600"}
}
};
}

function graphXAxisOptions(){
const mobile=isMobileChart();
return{
grid:{display:false},
ticks:{
autoSkip:false,
maxTicksLimit:mobile?5:10,
maxRotation:mobile?0:45,
minRotation:0,
font:{size:mobile?12:12},
callback:function(value,index,ticks){
return adaptiveChartTickText(this,value,index,ticks);
}
}
};
}

function graphYAxisTicks(){
const mobile=isMobileChart();
return{maxTicksLimit:mobile?5:8,font:{size:mobile?12:12}};
}


function destroyChartSafe(chart){
try{chart?.destroy();}catch{}
}
function destroyChartList(list){
for(const c of list||[])destroyChartSafe(c);
return [];
}
function chartTickLimit(){
return window.innerWidth<=640?5:10;
}
function chartFontSize(){
return window.innerWidth<=640?12:13;
}
function groupedChartShell(title, subtitle, canvasId, legendHtml=""){
return `<section class="metric-chart-panel">
<div class="metric-chart-head">
<div><div class="metric-chart-title">${title}</div><div class="metric-chart-subtitle">${subtitle}</div></div>
${legendHtml?`<div class="metric-chart-legend">${legendHtml}</div>`:""}
</div>
<div class="metric-chart-canvas-wrap"><canvas id="${canvasId}"></canvas></div>
</section>`;
}
function miniLegend(fields){
return fields.map(field=>`<span><i style="background:${metricColor(field)}"></i>${metricLabelFor(field)}</span>`).join("");
}
function groupedChartOptions(yTitle){
return{
responsive:true,
maintainAspectRatio:false,
animation:false,
interaction:{mode:"index",intersect:false},
plugins:{
legend:{display:false},
tooltip:{callbacks:{title:graphTooltipTitle,label:graphTooltipLabel}}
},
scales:{
x:{
grid:{display:false},
afterBuildTicks(scale){buildAdaptiveTimeTicks(scale);},
ticks:{
autoSkip:false,
maxTicksLimit:chartTickLimit(),
maxRotation:0,
minRotation:0,
font:{size:chartFontSize()},
callback:function(value,index,ticks){
return adaptiveChartTickText(this,value,index,ticks);
}
}
},
y:{
title:{display:true,text:yTitle,font:{size:chartFontSize(),weight:"600"}},
ticks:{font:{size:chartFontSize()}},
grid:{color:"rgba(148,163,184,.08)"}
}
}
};
}
function forecastTickText(scale,value,index,ticks){
const raw=scale.getLabelForValue(value);
const text=String(raw??"");
const labels=scale?.chart?.data?.labels||[];
const forecastStart=labels.findIndex(v=>/^\+\d+\s*นาที/.test(String(v??"")));
const actualCount=forecastStart>=0?forecastStart:labels.length;
const width=Number(scale?.width||scale?.chart?.width||window.innerWidth||0);

// Forecast ทั้ง 3 จุดเป็นข้อมูลสำคัญ จึงคงไว้เสมอ
// แต่กราฟที่แคบจะย่อข้อความเพื่อไม่ให้ +10/+20/+30 นาทีชนกัน
if(/^\+\d+\s*นาที/.test(text)){
return width<430?text.replace(" นาที",""):text;
}

const d=parseDate(raw);
if(!d)return text;

// จำนวน label ของข้อมูลจริงอิงจากความกว้างของ canvas จริง
// ไม่ใช้แค่ความกว้างหน้าจอ เพราะกราฟ 1/3 บน Desktop ก็อาจแคบได้
let actualLabelCount=4;
if(width<430)actualLabelCount=2;
else if(width<620)actualLabelCount=3;

const wanted=new Set();
if(actualCount>0){
wanted.add(0);

// เว้นข้อมูลจริงจุดสุดท้ายเมื่อมี Forecast เพื่อสร้างช่องว่างก่อน +10 นาที
// ค่าจุดสุดท้ายยังดูได้จาก tooltip และเส้นกราฟตามปกติ
const lastDisplayIndex=
forecastStart>=0&&actualCount>2
?actualCount-2
:actualCount-1;

wanted.add(Math.max(0,lastDisplayIndex));

if(actualLabelCount>2&&lastDisplayIndex>0){
for(let i=1;i<actualLabelCount-1;i++){
wanted.add(Math.round(lastDisplayIndex*i/(actualLabelCount-1)));
}
}
}

if(!wanted.has(Number(value)))return"";

return d.toLocaleTimeString("th-TH",{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
hour12:false
});
}

function forecastChartOptions(yTitle){
const base=groupedChartOptions(yTitle);
base.scales.x={
grid:{display:false},
ticks:{
autoSkip:false,
maxRotation:0,
minRotation:0,
padding:8,
font:{size:chartFontSize()},
callback:function(value,index,ticks){
return forecastTickText(this,value,index,ticks);
}
}
};
return base;
}

function makeActualDataset(field, values){
return{
label:metricLabelFor(field),
metricField:field,
rawValues:values,
data:values,
borderColor:metricColor(field),
backgroundColor:"transparent",
borderWidth:2,
pointRadius:values.length>40?0:2,
tension:.16,
spanGaps:true,
cubicInterpolationMode:"monotone"
};
}
function makeForecastDataset(field, actualLength, current, points){
const raw=[...new Array(Math.max(0,actualLength-1)).fill(null),current,...points];
return{
label:`${metricLabelFor(field)} Forecast`,
metricField:field,
rawValues:raw,
data:raw,
borderColor:metricColor(field),
backgroundColor:"transparent",
borderDash:[6,5],
borderWidth:2,
pointRadius:2,
tension:.08,
cubicInterpolationMode:"monotone"
};
}

function drawCharts(){

if(typeof Chart==="undefined"){

const area=$("historyChartArea");

if(area){
area.innerHTML=
'<div class="chart-empty">กำลังเตรียมกราฟ...</div>';
}

if(historyActivated){
ensureChartLibrary()
.then(()=>drawCharts())
.catch(e=>console.error("Chart load error:",e));
}

return;
}

const base=selectedRecords()
.filter(r=>parseDate(r.timestamp))
.sort((a,b)=>parseDate(a.timestamp)-parseDate(b.timestamp));

if($("selectedMetricLabel"))$("selectedMetricLabel").textContent=metricLabel();

historyGroupCharts=destroyChartList(historyGroupCharts);
destroyChartSafe(historyChart);
historyChart=null;

const area=$("historyChartArea");
if(!area)return;

historyRangeCaption(base);

if(!base.length){
area.innerHTML='<div class="chart-empty">ไม่มีข้อมูลในช่วงเวลาที่เลือก</div>';
["trendAvg","trendMax","trendMin","trendLast"].forEach(id=>{if($(id))$(id).textContent="--";});
if($("trend"))$("trend").textContent="ไม่มีข้อมูลในช่วงเวลาที่เลือก";
drawForecast(base);
return;
}

if(metric==="all"){
if($("trendAvg"))$("trendAvg").textContent="—";
if($("trendMax"))$("trendMax").textContent="—";
if($("trendMin"))$("trendMin").textContent="—";
if($("trendLast"))$("trendLast").textContent="—";
if($("trend"))$("trend").textContent="เปรียบเทียบ 6 ตัวแปร";

area.innerHTML=
groupedChartShell("ฝุ่นละออง","PM1.0 • PM2.5 • PM10","historyDust",miniLegend(["pm1","pm25","pm10"]))+
`<div class="metric-chart-grid-3">`+
groupedChartShell("อุณหภูมิ","หน่วย °C","historyTemp",miniLegend(["temperature"]))+
groupedChartShell("ความชื้น","หน่วย %","historyHumidity",miniLegend(["humidity"]))+
groupedChartShell("แสง","หน่วย lux","historyLight",miniLegend(["light"]))+
`</div>`;

const labels=historyLabelsToRangeEnd(base);

const create=(canvasId,fields,yTitle)=>{
const datasets=fields.map(field=>{
const vals=base.map(r=>{
const v=finiteNumberOrNull(r[field]); return v;
});
const displayVals=padChartValuesToLabels(vals,labels);
return makeActualDataset(field,displayVals);
});
const c=new Chart($(canvasId),{type:"line",data:{labels,datasets},options:groupedChartOptions(yTitle)});
historyGroupCharts.push(c);
};

create("historyDust",["pm1","pm25","pm10"],"µg/m³");
create("historyTemp",["temperature"],"°C");
create("historyHumidity",["humidity"],"%");
create("historyLight",["light"],"lux");

drawForecast(base);
return;
}

area.innerHTML='<canvas id="historyChart"></canvas>';

const arr=base.filter(r=>hasFiniteSensorValue(r[metric]));
const values=arr.map(r=>finiteNumberOrNull(r[metric]));
const labels=historyLabelsToRangeEnd(arr);
const s=stats(arr,metric);

if($("trendAvg"))$("trendAvg").textContent=s.avg==null?"--":fmt(s.avg);
if($("trendMax"))$("trendMax").textContent=s.max==null?"--":fmt(s.max);
if($("trendMin"))$("trendMin").textContent=s.min==null?"--":fmt(s.min);
if($("trendLast"))$("trendLast").textContent=s.last==null?"--":fmt(s.last);

if($("trend")){
const diff=values.length?values.at(-1)-values[0]:0;
const pct=values[0]?diff/Math.abs(values[0])*100:0;
$("trend").textContent=!values.length?"ไม่มีข้อมูล":Math.abs(pct)<1?"→ คงที่":diff>0?"↑ เพิ่มขึ้น":"↓ ลดลง";
}

if(values.length){
historyChart=new Chart($("historyChart"),{
type:"line",
data:{labels,datasets:[makeActualDataset(metric,padChartValuesToLabels(values,labels))]},
options:{
...groupedChartOptions(`${metricLabel()} ${metricUnit()}`.trim()),
plugins:{legend:graphLegendOptions(),tooltip:{callbacks:{title:graphTooltipTitle,label:graphTooltipLabel}}}
}
});
}

drawForecast(arr);
}

// =====================================================
// FORECAST
// =====================================================

function linear(points){

const n=
points.length;

if(
n<2
){
return null;
}

let sx=0;
let sy=0;
let sxy=0;
let sxx=0;

for(
const p of
points
){

sx+=p.x;
sy+=p.y;
sxy+=p.x*p.y;
sxx+=p.x*p.x;

}

const den=
n*sxx-
sx*sx;

if(!den){
return null;
}

const slope=
(
n*sxy-
sx*sy
)/
den;

return{

slope,

intercept:
(
sy-
slope*sx
)/
n

};

}

function updateForecastToggle(){

const b=
$("forecastToggle");

const l=
$("forecastToggleLabel");

const s=
$("forecastToggleState");

if(
!b||
!l
){
return;
}

b.classList.toggle(
"is-on",
forecastVisible
);

b.classList.toggle(
"is-off",
!forecastVisible
);

l.textContent=
forecastVisible
?"เปิดการคาดการณ์"
:"ซ่อนการคาดการณ์";

if(s){

s.textContent=
forecastVisible
?"ON"
:"OFF";

}

if(
forecastChart
?.data
?.datasets
){

forecastChart.data.datasets.forEach((ds,i)=>{
const isForecast=String(ds.label||"").includes("Forecast");
if(isForecast){
forecastChart.setDatasetVisibility(i,forecastVisible);
}
});

forecastChart.update();

}

}

function aiTrendFor(field){
const list=aiForecastPayload?.data?.trend_analysis;
if(!Array.isArray(list))return null;
return list.find(x=>x?.field===field)||null;
}
function aiDirectionText(direction){
return {increasing:"↗ เพิ่มขึ้น",decreasing:"↘ ลดลง",stable:"→ ค่อนข้างคงที่",uncertain:"? ยังไม่แน่ชัด"}[direction]||"? ยังไม่แน่ชัด";
}
function drawForecast(arr){
forecastGroupCharts=destroyChartList(forecastGroupCharts);
destroyChartSafe(forecastChart);
forecastChart=null;

const area=$("forecastChartArea");
if(!area)return;

const isAI=aiForecastPayload?.ai===true;
const isStatistical=
!isAI&&
aiForecastPayload?.reason==="all_ai_unavailable";

const provider=isAI
?(
aiForecastPayload?.provider==="cloudflare"
?"ระบบวิเคราะห์"
:aiForecastPayload?.provider==="gemini"
?"ระบบวิเคราะห์"
:"AI"
)
:"Statistical Model";

const pointFor=field=>{
const fp=Array.isArray(aiForecastPayload?.data?.forecast_points)
?aiForecastPayload.data.forecast_points.find(x=>x?.field===field):null;
if(!fp)return null;
const pts=[
finiteNumberOrNull(fp.p10),
finiteNumberOrNull(fp.p20),
finiteNumberOrNull(fp.p30)
];
return pts.every(v=>v!==null)?pts:null;
};

if(metric==="all"){
const actual=(arr||[]).filter(r=>parseDate(r.timestamp)).slice(-12);
if(!actual.length){
area.innerHTML='<div class="chart-empty">ไม่มีข้อมูลจริงสำหรับสร้างกราฟ</div>';
return;
}

area.innerHTML=
groupedChartShell("ฝุ่นละออง","ข้อมูลจริง + AI Forecast","forecastDust",miniLegend(["pm1","pm25","pm10"]))+
`<div class="metric-chart-grid-3">`+
groupedChartShell("อุณหภูมิ","ข้อมูลจริง + AI Forecast","forecastTemp",miniLegend(["temperature"]))+
groupedChartShell("ความชื้น","ข้อมูลจริง + AI Forecast","forecastHumidity",miniLegend(["humidity"]))+
groupedChartShell("แสง","ข้อมูลจริง + AI Forecast","forecastLight",miniLegend(["light"]))+
`</div>`;

const actualLabels=actual.map(r=>r.timestamp);
const labels=[...actualLabels,"+10 นาที","+20 นาที","+30 นาที"];

const create=(canvasId,fields,yTitle)=>{
const datasets=[];
for(const field of fields){
const raw=actual.map(r=>{
const v=finiteNumberOrNull(r[field]); return v;
});
datasets.push({
...makeActualDataset(field,raw),
data:[...raw,null,null,null],
rawValues:[...raw,null,null,null]
});
const pts=pointFor(field);
if((isAI||isStatistical)&&pts&&forecastVisible){
const current=[...raw].reverse().find(v=>v!==null);
datasets.push(makeForecastDataset(field,raw.length,current,pts));
}
}
const c=new Chart($(canvasId),{
type:"line",
data:{labels,datasets},
options:forecastChartOptions(yTitle)
});
forecastGroupCharts.push(c);
};

create("forecastDust",["pm1","pm25","pm10"],"µg/m³");
create("forecastTemp",["temperature"],"°C");
create("forecastHumidity",["humidity"],"%");
create("forecastLight",["light"],"lux");

if($("forecastMessage")){
$("forecastMessage").innerHTML=(isAI||isStatistical)
?`<b class="text-cyan-300">${isAI?"AI Trend":"Statistical Trend"} • ALL</b><div class="mt-2">แยกกราฟตามหน่วยจริงเพื่ออ่านง่ายขึ้น • เส้นทึบ = ข้อมูลจริง • เส้นประ = ${isAI?"AI Forecast":"Statistical Forecast"}</div><div class="text-[12px] text-slate-500 mt-2">${isAI?"AI-assisted Forecast":"Fallback เมื่อ AI ไม่พร้อมใช้งาน"} จาก ${esc(provider)}</div>`
:'<div class="ai-unavailable"><b>Forecast ยังไม่พร้อมใช้งาน</b><div class="mt-1">ข้อมูลย้อนหลังยังไม่เพียงพอสำหรับสร้างแนวโน้ม</div></div>';
}
updateForecastToggle();
return;
}

area.innerHTML='<canvas class="bottom-forecast-canvas" id="forecastChart"></canvas>';

const actual=(arr||[]).filter(r=>parseDate(r.timestamp)&&hasFiniteSensorValue(r[metric])).slice(-12);
if(!actual.length){
area.innerHTML='<div class="chart-empty">ไม่มีข้อมูลจริงสำหรับสร้างกราฟ</div>';
return;
}
const values=actual.map(r=>finiteNumberOrNull(r[metric]));
const labels=actual.map(r=>r.timestamp);
const current=values.at(-1);
const datasets=[makeActualDataset(metric,values)];
const pts=pointFor(metric);

if((isAI||isStatistical)&&pts&&forecastVisible){
labels.push("+10 นาที","+20 นาที","+30 นาที");
datasets[0].data=[...values,null,null,null];
datasets[0].rawValues=[...values,null,null,null];
datasets.push(makeForecastDataset(metric,values.length,current,pts));
}

forecastChart=new Chart($("forecastChart"),{
type:"line",
data:{labels,datasets},
options:{
...forecastChartOptions(`${metricLabel()} ${metricUnit()}`.trim()),
plugins:{legend:graphLegendOptions(),tooltip:{callbacks:{title:graphTooltipTitle,label:graphTooltipLabel}}}
}
});

if($("forecastMessage")){
if((isAI||isStatistical)&&pts){
const trend=aiTrendFor(metric);
const fallbackDirection=
pts[2]>current
?"↗ เพิ่มขึ้น"
:pts[2]<current
?"↘ ลดลง"
:"→ ค่อนข้างคงที่";
$("forecastMessage").innerHTML=
`<b style="color:${metricColor(metric)}">${isAI?"AI Trend":"Statistical Trend"} • ${metricLabel()}</b>
<div class="mt-2">${esc(isAI?aiDirectionText(trend?.direction):fallbackDirection)} • +30 นาที <b>${fmt(pts[2])} ${metricUnit()}</b></div>
<div class="text-[12px] text-slate-500 mt-2">เส้นทึบ = ข้อมูลจริง • เส้นประ = ${isAI?"AI Forecast":"Statistical Forecast"} จาก ${esc(provider)}</div>`;
}else{
$("forecastMessage").innerHTML='<div class="ai-unavailable"><b>Forecast ยังไม่พร้อมใช้งาน</b><div class="mt-1">ข้อมูลย้อนหลังยังไม่เพียงพอสำหรับสร้างแนวโน้ม</div></div>';
}
}
updateForecastToggle();
}

// =====================================================
// DATE RANGE PICKER
// =====================================================

function toDateTimeLocalValue(d){

if(!d){
return"";
}

const p=
v=>
String(v)
.padStart(
2,
"0"
);

return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;

}

function dateFromRangeInput(id){

const v=
$(id)?.value;

if(!v){
return null;
}

const d=
new Date(v);

return Number.isFinite(
d.getTime()
)
?d
:null;

}

function sameCalendarDay(
a,
b
){

return!!(
a&&
b&&
a.getFullYear()===
b.getFullYear()&&
a.getMonth()===
b.getMonth()&&
a.getDate()===
b.getDate()
);

}

function setPickerInputs(
start,
end
){

if(
$("customRangeStart")
){

$("customRangeStart").value=
toDateTimeLocalValue(
start
);

}

if(
$("customRangeEnd")
){

$("customRangeEnd").value=
toDateTimeLocalValue(
end
);

}

}

function updateQuickRangeUI(key){

document
.querySelectorAll(
".quick-range-option"
)
.forEach(
button=>{

const active=
!!key&&
button.dataset.range===
key;

button.classList.toggle(
"active",
active
);

if(active){

button.setAttribute(
"aria-current",
"true"
);

}else{

button.removeAttribute(
"aria-current"
);

}

}
);

}

function closeHistoryRangePicker(){

document.body.classList.remove(
"history-range-modal-open"
);

const panel=
$("historyRangePanel");

const button=
$("historyRangeButton");

if(panel){

panel.classList.add(
"hidden"
);

}

if(button){

button.setAttribute(
"aria-expanded",
"false"
);

}

if(
$("customRangeError")
){

$("customRangeError").textContent=
"";

$("customRangeError")
.classList
.add(
"hidden"
);

}

}

function openHistoryRangePicker(){

const panel=
$("historyRangePanel");

// ย้าย modal ไปเป็นลูกของ body เพื่อไม่ให้ติด stacking context / content-visibility
// ของโซนกราฟ ซึ่งเคยทำให้ backdrop อยู่ทับหน้าต่างเลือกเวลา
if(panel && panel.parentElement !== document.body){
    document.body.appendChild(panel);
}

const button=
$("historyRangeButton");

if(!panel){
return;
}

const w=
rangeWindow();

const end=
w?.end
?new Date(w.end)
:new Date();

const start=
w?.start
?new Date(w.start)
:new Date(
end.getTime()-
86400000
);

setPickerInputs(
start,
end
);

calendarDisplayDate=
new Date(
end.getFullYear(),
end.getMonth(),
1
);

calendarSelectionStep=
"start";

updateQuickRangeUI(
averageRange==="custom"
?null
:averageRange
);

renderRangeCalendar();

panel.classList.remove(
"hidden"
);

// ทุกครั้งที่เปิด ให้เริ่มที่ส่วนบนของหน้าต่างเลือกช่วงเวลา
// สำคัญกับมือถือ เพราะ panel อาจเคยค้าง scroll จากครั้งก่อน
panel.scrollTop=0;

document.body.classList.add(
"history-range-modal-open"
);

button?.setAttribute(
"aria-expanded",
"true"
);

}

function renderRangeCalendar(){

const grid=
$("rangeCalendarGrid");

const title=
$("rangeCalendarTitle");

if(
!grid||
!title
){
return;
}

const year=
calendarDisplayDate.getFullYear();

const month=
calendarDisplayDate.getMonth();

const firstDay=
new Date(
year,
month,
1
)
.getDay();

const daysInMonth=
new Date(
year,
month+1,
0
)
.getDate();

const daysInPrevMonth=
new Date(
year,
month,
0
)
.getDate();

title.textContent=
new Date(
year,
month,
1
)
.toLocaleDateString(
"th-TH",
{
timeZone:
"Asia/Bangkok",
month:
"long",
year:
"numeric"
}
);

grid.innerHTML="";

const selectedStart=
dateFromRangeInput(
"customRangeStart"
);

const selectedEnd=
dateFromRangeInput(
"customRangeEnd"
);

const startDay=
selectedStart
?new Date(
selectedStart.getFullYear(),
selectedStart.getMonth(),
selectedStart.getDate()
)
:null;

const endDay=
selectedEnd
?new Date(
selectedEnd.getFullYear(),
selectedEnd.getMonth(),
selectedEnd.getDate()
)
:null;

for(
let i=0;
i<42;
i++
){

let day;

let displayMonth=
month;

let muted=
false;

if(
i<
firstDay
){

day=
daysInPrevMonth-
firstDay+
i+
1;

displayMonth=
month-1;

muted=true;

}else if(
i>=
firstDay+
daysInMonth
){

day=
i-
(
firstDay+
daysInMonth
)+
1;

displayMonth=
month+1;

muted=true;

}else{

day=
i-
firstDay+
1;

}

const date=
new Date(
year,
displayMonth,
day
);

const dateOnly=
new Date(
date.getFullYear(),
date.getMonth(),
date.getDate()
);

const button=
document.createElement(
"button"
);

button.type=
"button";

button.textContent=
String(day);

button.className=
"range-calendar-day";

if(muted){

button.classList.add(
"is-muted"
);

}

if(
sameCalendarDay(
dateOnly,
startDay
)
){

button.classList.add(
"is-start"
);

}

if(
sameCalendarDay(
dateOnly,
endDay
)
){

button.classList.add(
"is-end"
);

}

if(
startDay&&
endDay&&
dateOnly>=startDay&&
dateOnly<=endDay
){

button.classList.add(
"is-in-range"
);

}

button.addEventListener(
"click",
()=>{

const oldStart=
dateFromRangeInput(
"customRangeStart"
);

const oldEnd=
dateFromRangeInput(
"customRangeEnd"
);

if(
calendarSelectionStep===
"start"
){

const start=
new Date(date);

start.setHours(
oldStart?.getHours()??
0,
oldStart?.getMinutes()??
0,
0,
0
);

let end=
oldEnd
?new Date(oldEnd)
:new Date(date);

if(
!oldEnd||
end<start
){

end=
new Date(date);

end.setHours(
23,
59,
0,
0
);

}

setPickerInputs(
start,
end
);

calendarSelectionStep=
"end";

}else{

const end=
new Date(date);

end.setHours(
oldEnd?.getHours()??
23,
oldEnd?.getMinutes()??
59,
0,
0
);

let start=
oldStart
?new Date(oldStart)
:new Date(date);

if(
end<start
){

const temp=
new Date(start);

start=end;

end.setTime(
temp.getTime()
);

}

setPickerInputs(
start,
end
);

calendarSelectionStep=
"start";

}

updateQuickRangeUI(
null
);

renderRangeCalendar();

}
);

grid.appendChild(
button
);

}

}

function setRange(key){

const c=
RANGE_CONFIG[key];

if(!c){
return;
}

averageRange=
key;

customRangeStart=
null;

customRangeEnd=
null;

const w=
rangeWindow();

if(w){

setPickerInputs(
w.start,
w.end
);

}

const end=
w?.end||
new Date();

calendarDisplayDate=
new Date(
end.getFullYear(),
end.getMonth(),
1
);

calendarSelectionStep=
"start";

updateQuickRangeUI(
key
);

if(
$("historyRangeButtonLabel")
){

$("historyRangeButtonLabel").textContent=
rangeLabel();

}

closeHistoryRangePicker();

loadHistorical();

}

function applyCustomRange(){

const start=
dateFromRangeInput(
"customRangeStart"
);

const end=
dateFromRangeInput(
"customRangeEnd"
);

const err=
$("customRangeError");

const showError=
message=>{

if(!err){
return;
}

err.textContent=
message;

err.classList.remove(
"hidden"
);

};

if(
!start||
!end
){

showError(
"กรุณาเลือกวันและเวลาเริ่มต้นกับสิ้นสุด"
);

return;

}

if(
start>=end
){

showError(
"เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น"
);

return;

}

if(
end-start>
30*
86400000
){

showError(
"เลือกช่วงเวลาได้สูงสุด 30 วัน"
);

return;

}

averageRange=
"custom";

customRangeStart=
start;

customRangeEnd=
end;

updateQuickRangeUI(
null
);

if(
$("historyRangeButtonLabel")
){

$("historyRangeButtonLabel").textContent=
rangeLabel();

}

closeHistoryRangePicker();

loadHistorical();

}

// =====================================================
// EXPORT
// =====================================================

function exportBounds(){

const s=
$("exportStartDate")
?.value;

const e=
$("exportEndDate")
?.value;

if(
!s||
!e
){
return null;
}

return{

start:
new Date(
s+
"T00:00:00+07:00"
),

end:
new Date(
new Date(
e+
"T00:00:00+07:00"
)
.getTime()+
86400000
)

};

}

async function refreshExport(){

const body=
$("exportPreviewBody");

const b=
exportBounds();

if(
!body||
!b
){
return;
}

exportRows=[];

let offset=0;

while(true){

const j=
await fetchJson(
`${API.export}?start=${encodeURIComponent(b.start.toISOString())}&end=${encodeURIComponent(b.end.toISOString())}&limit=1000&offset=${offset}`
);

const rows=
(j.data||[])
.map(
normalize
);

exportRows.push(
...rows
);

if(
!j.has_more||
!rows.length
){
break;
}

offset+=
rows.length;

}

if(
$("exportDataCount")
){

$("exportDataCount").textContent=
String(
exportRows.length
);

}

body.innerHTML=
exportRows.length

?exportRows
.slice(
0,
50
)
.map(
r=>
`<tr>
<td>${esc(parseDate(r.timestamp)?.toLocaleString("th-TH")||"")}</td>
<td>${esc(r.device_id)}</td>
<td>${fmt(r.pm1)}</td>
<td>${fmt(r.pm25)}</td>
<td>${fmt(r.pm10)}</td>
<td>${fmt(r.temperature)}</td>
<td>${fmt(r.humidity)}</td>
<td>${fmt(r.light)}</td>
</tr>`
)
.join("")

:'<tr><td colspan="8" class="export-empty-cell">ไม่พบข้อมูล</td></tr>';

if(
$("exportExcelButton")
){

$("exportExcelButton").disabled=
!exportRows.length;

}

}

function openExport(){

const w=
rangeWindow();

const formatDate=
d=>{

const x=
new Date(d);

const p=
n=>
String(n)
.padStart(
2,
"0"
);

return`${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`;

};

if(
$("exportStartDate")
){

$("exportStartDate").value=
formatDate(
w?.start||
Date.now()-
86400000
);

}

if(
$("exportEndDate")
){

$("exportEndDate").value=
formatDate(
w?.end||
Date.now()
);

}

const modal=
$("exportModal");

if(modal){

modal.classList.add(
"active"
);

modal.setAttribute(
"aria-hidden",
"false"
);

}

refreshExport();

}

function closeExport(){

const modal=
$("exportModal");

if(modal){

modal.classList.remove(
"active"
);

modal.setAttribute(
"aria-hidden",
"true"
);

}

}

let xlsxLoadingPromise=null;

function ensureXLSX(){
if(typeof XLSX!=="undefined")return Promise.resolve();

if(xlsxLoadingPromise)return xlsxLoadingPromise;

xlsxLoadingPromise=new Promise((resolve,reject)=>{
const script=document.createElement("script");
script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
script.async=true;
script.onload=()=>resolve();
script.onerror=()=>reject(new Error("โหลดระบบ Excel ไม่สำเร็จ"));
document.head.appendChild(script);
});

return xlsxLoadingPromise;
}

async function downloadExcel(){
if(!exportRows.length)return;

const button=$("exportExcelButton");
const oldText=button?.textContent;

try{
if(button){
button.disabled=true;
button.textContent="กำลังเตรียม Excel...";
}

await ensureXLSX();

const data=exportRows.map(r=>({
"วันที่ / เวลา":parseDate(r.timestamp)?.toLocaleString("th-TH")||"",
"อุปกรณ์":r.device_id,
"PM1.0 (µg/m³)":r.pm1??"",
"PM2.5 (µg/m³)":r.pm25??"",
"PM10 (µg/m³)":r.pm10??"",
"อุณหภูมิ (°C)":r.temperature??"",
"ความชื้น (%)":r.humidity??"",
"แสง (lux)":r.light??""
}));

const ws=XLSX.utils.json_to_sheet(data);
const wb=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb,ws,"PM2.5 Data");
XLSX.writeFile(wb,"PM25_export.xlsx");
}catch(e){
console.error("Excel export error:",e);
if($("exportError")){
$("exportError").textContent="ไม่สามารถเตรียมไฟล์ Excel ได้ กรุณาลองใหม่";
$("exportError").classList.remove("hidden");
}
}finally{
if(button){
button.disabled=false;
button.textContent=oldText||"📊 ดาวน์โหลด Excel";
}
}
}

// =====================================================
// AI ANALYSIS
// =====================================================

function aiStatusClass(payload){

if(
aiLoading
){
return"is-loading";
}

if(!payload){
return"is-unavailable";
}

if(
payload.ai===true&&
payload.cached===true
){
return"is-cached";
}

if(
payload.ai===true
){
return"is-connected";
}

if(
payload.reason===
"gateway_offline"
){
return"is-unavailable";
}

return"is-fallback";

}

function aiStatusText(payload){

if(
aiLoading
){
return"LOADING";
}

if(!payload){
return"UNAVAILABLE";
}

if(
payload.ai===true&&
payload.cached===true
){
return"AI CACHED";
}

if(
payload.ai===true
){
return"AI CONNECTED";
}

if(
payload.reason===
"gateway_offline"
){
return"GATEWAY OFFLINE";
}

if(
payload.reason===
"gemini_secret_not_configured"
){
return"NO API KEY";
}

if(
payload.reason===
"gemini_quota_exhausted"
){
return"AI QUOTA LIMIT";
}

if(
payload.reason===
"gemini_unavailable"
){
return"ใช้ข้อมูลย้อนหลัง";
}

return"RULE FALLBACK";

}

function confidenceText(v){

return{

high:
"สูง",

medium:
"ปานกลาง",

low:
"ต่ำ"

}[
String(
v||""
)
.toLowerCase()
]||
"--";

}

function renderAI(payload){

const badge=
$("aiStatusBadge");

const details=
$("aiDetails");

const generated=
$("aiGeneratedAt");

if(
!badge||
!details
){
return;
}

badge.className=
`ai-status-badge ${aiStatusClass(payload)}`;

badge.textContent=
aiStatusText(
payload
);

if(
aiLoading
){

details.innerHTML=
'<div class="ai-loading-state"><span class="ai-loading-dot"></span>กำลังวิเคราะห์ข้อมูลล่าสุด...</div>';

return;

}

if(
!payload
){

details.innerHTML=
'<div class="ai-result-headline">ยังไม่สามารถสร้างบทวิเคราะห์เพิ่มเติมได้</div><div class="ai-result-summary">ข้อมูลปัจจุบันและสรุปสถานการณ์ยังทำงานได้ตามปกติ</div>';

if(generated){

generated.textContent=
"อัปเดตการวิเคราะห์: --";

}

return;

}

const data=
payload.data||
{};

const observations=
Array.isArray(
data.observations
)
?data.observations
:[];

const generatedDate=
parseDate(
payload.generated_at
);

if(generated){

generated.textContent=
generatedDate
?`อัปเดตการวิเคราะห์: ${generatedDate.toLocaleString(
"th-TH",
{
timeZone:
"Asia/Bangkok"
}
)}`
:"อัปเดตการวิเคราะห์: --";

}

details.innerHTML=
`<div class="ai-result-headline">
${esc(normalizeProjectWording(data.headline)||"รอผลการวิเคราะห์")}
</div>

<div class="ai-result-summary">
${esc(normalizeProjectWording(data.summary)||"ยังไม่มีรายละเอียดจาก AI")}
</div>

${observations.length
?`
<div class="ai-result-section">

<div class="ai-result-label">
สิ่งที่ระบบพบ
</div>

<div class="ai-observation-list">

${observations
.map(
x=>
`<div class="ai-observation">
• ${esc(normalizeProjectWording(x))}
</div>`
)
.join("")}

</div>

</div>
`
:""
}

<div class="ai-result-section">

<div class="ai-result-label">
คำแนะนำ
</div>

<div class="ai-recommendation">
${esc(normalizeProjectWording(data.recommendation)||"ติดตามข้อมูลจากระบบต่อเนื่อง")}
</div>

</div>

<div class="ai-meta-row"><span>วิเคราะห์จากข้อมูลล่าสุดและข้อมูลย้อนหลังของสถานี</span><span class="ai-confidence">ความเชื่อมั่น: ${confidenceText(data.confidence)}</span></div>`;

}

async function loadAI(
force=false
){

if(
aiLoading
){
return;
}

aiLoading=
true;

renderAI(
aiPayload
);

const button=
$("aiRefreshButton");

if(button){

button.disabled=
true;

}

try{

const url=
API.ai+
(
force
?"?refresh=1"
:""
);

aiPayload=
await fetchJson(
url
);

aiLastLoadedAt=
new Date();

}catch(e){

console.error(
"AI analysis error:",
e
);

aiPayload=
null;

}finally{

aiLoading=
false;

if(button){

button.disabled=
false;

}

renderAI(
aiPayload
);

}

}

// =====================================================
// AI FORECAST
// =====================================================

function dustTrendSummary(trends){

const fields=[
"pm1",
"pm25",
"pm10"
];

const items=
fields.map(
field=>
trends.find(
x=>x?.field===field
)
);

const valid=
items.filter(Boolean);

if(!valid.length){
return{
items,
summary:"ยังไม่มีข้อมูลแนวโน้มฝุ่นเพียงพอ"
};
}

const codes=
valid.map(
x=>
String(
x.direction||
"stable"
)
.toLowerCase()
);

const up=
codes.filter(
x=>
["up","increase","increasing"].includes(x)
).length;

const down=
codes.filter(
x=>
["down","decrease","decreasing"].includes(x)
).length;

const stable=
valid.length-
up-
down;

let summary;

if(
down===valid.length
){
summary="ฝุ่นทุกขนาดมีแนวโน้มลดลง";
}else if(
up===valid.length
){
summary="ฝุ่นทุกขนาดมีแนวโน้มเพิ่มขึ้น";
}else if(
stable===valid.length
){
summary="ฝุ่นทุกขนาดค่อนข้างคงที่";
}else if(
down>up&&
down>=stable
){
summary="ฝุ่นโดยรวมมีแนวโน้มลดลง แต่แต่ละขนาดเปลี่ยนแปลงไม่เท่ากัน";
}else if(
up>down&&
up>=stable
){
summary="ฝุ่นโดยรวมมีแนวโน้มเพิ่มขึ้น แต่แต่ละขนาดเปลี่ยนแปลงไม่เท่ากัน";
}else{
summary="แนวโน้มฝุ่นแต่ละขนาดแตกต่างกัน ควรติดตามต่อเนื่อง";
}

return{
items,
summary
};

}

function renderDustTrendCard(trends){

const dust=
dustTrendSummary(
trends
);

const fields=[
["pm1","PM1.0"],
["pm25","PM2.5"],
["pm10","PM10"]
];

const rows=
fields.map(
([field,label])=>{

const item=
trends.find(
x=>x?.field===field
);

if(!item){
return`
<div class="ai-dust-mini is-missing">
<div class="ai-dust-mini-label">${label}</div>
<div class="ai-dust-mini-direction">ยังไม่มีข้อมูล</div>
</div>`;
}

return`
<div class="ai-dust-mini">
<div class="ai-dust-mini-label">${label}</div>
<div class="ai-dust-mini-direction">${esc(aiDirectionText(item.direction))}</div>
<div class="ai-dust-mini-note">${esc(item.explanation||"")}</div>
</div>`;

})
.join("");

return`
<div class="ai-trend-item ai-trend-dust">
<div class="ai-trend-variable">🌫 ฝุ่นละออง</div>

<div class="ai-dust-trend-grid">
${rows}
</div>

<div class="ai-dust-summary">
${esc(dust.summary)}
</div>
</div>`;

}


function normalizeProjectWording(value){

if(value===null||value===undefined){
return value;
}

let s=String(value);

/* ขอบเขตโครงการเป็นการตรวจวัดระดับพื้นที่ และรองรับข้อความจาก AI/cache เวอร์ชันเก่า */
s=s
.replaceAll("สภาพอากาศและคุณภาพอากาศในสถานศึกษา","สภาพอากาศและคุณภาพอากาศในพื้นที่")
.replaceAll("การตรวจวัดสิ่งแวดล้อมในสถานศึกษา","การตรวจวัดสภาพแวดล้อมในพื้นที่")
.replaceAll("การตรวจวัดสภาพแวดล้อมในสถานศึกษา","การตรวจวัดสภาพแวดล้อมในพื้นที่")
.replaceAll("สภาพแวดล้อมของสถานศึกษา","สภาพแวดล้อมในพื้นที่")
.replaceAll("ในสถานศึกษา","ในพื้นที่")
.replaceAll("ของสถานศึกษา","ในพื้นที่");

/* หลีกเลี่ยงคำแนะนำที่สมมติว่าพื้นที่มีระบบระบายอากาศ */
if(/ระบบระบายอากาศ/.test(s)){
s="ควรติดตามสภาพอากาศและคุณภาพอากาศในพื้นที่อย่างต่อเนื่อง เพื่อสังเกตการเปลี่ยนแปลง";
}

/* ปรับประโยคความสัมพันธ์ให้ไม่ฟันธงเกินข้อมูล */
s=s
.replace(
/สภาพแวดล้อมในพื้นที่(?:ไม่|ไม่มี)\s*สัมพันธ์กับข้อมูลอื่น/g,
"ยังไม่พบความสัมพันธ์ที่ชัดเจนของข้อมูลสภาพแวดล้อมในพื้นที่"
)
.replace(
/ไม่มีความสัมพันธ์กับข้อมูลอื่น/g,
"ยังไม่พบความสัมพันธ์ที่ชัดเจนกับข้อมูลอื่น"
);

return s;

}

function renderAIForecast(payload){

const box=
$("aiForecastDetails")||
$("forecastMessage");

const badge=
$("aiForecastStatusBadge");

const generated=
$("aiForecastGeneratedAt");

const providerLabel=
$("aiTrendDecisionProvider");

if(providerLabel){

const provider=
payload?.provider;

providerLabel.textContent=
provider==="gemini"
?"Gemini AI"
:provider==="cloudflare"
?"Cloudflare Workers AI"
:payload?.ai===false
?"Rule / Statistical Engine"
:"กำลังรอการวิเคราะห์...";

}

if(aiForecastLoading){

if(providerLabel){
providerLabel.textContent=
"กำลังวิเคราะห์...";
}

if(box){
box.innerHTML=
'<div class="ai-loading-state"><span class="ai-loading-dot"></span>กำลังวิเคราะห์แนวโน้มและคาดการณ์...</div>';
}

if(badge){
badge.textContent=
"กำลังวิเคราะห์";
}

return;
}

if(!payload){

if(box){
box.innerHTML=
'<div class="ai-unavailable">ยังไม่มีผลการวิเคราะห์แนวโน้ม</div>';
}

if(badge){
badge.textContent=
"รอข้อมูล";
}

return;
}

const d=
payload.data||
{};

const isAI=
payload.ai===true;

if(generated){

const dt=
parseDate(
payload.generated_at
);

generated.textContent=
dt
?`อัปเดตการวิเคราะห์: ${dt.toLocaleString(
"th-TH",
{
timeZone:"Asia/Bangkok"
}
)}`
:"อัปเดตการวิเคราะห์: --";

}

if(badge){

badge.className=
`ai-forecast-status ${isAI?"is-connected":"is-unavailable"}`;

const p=
payload?.provider==="gemini"
?"GEMINI AI"
:payload?.provider==="cloudflare"
?"CLOUDFLARE AI"
:payload?.provider==="rule"
?"RULE ENGINE"
:"AI";

badge.textContent=
isAI
?p
:"RULE ENGINE";

}

if(!box){
return;
}

if(!isAI){

const reasonText=
payload.reason==="gemini_quota_exhausted"
?"โควตา Gemini ฟรีถึงขีดจำกัดแล้ว ระบบข้อมูลจริงยังทำงานตามปกติ"
:payload.reason==="gemini_secret_not_configured"
?"ยังไม่ได้ตั้งค่า GEMINI_API_KEY"
:"ไม่สามารถเชื่อม Gemini ได้ในขณะนี้";

box.innerHTML=
`<div class="ai-unavailable">
<b>การวิเคราะห์ขั้นสูงยังไม่พร้อม</b>
<div class="mt-1">${esc(reasonText)}</div>
</div>`;

return;
}

const trends=
Array.isArray(
d.trend_analysis
)
?d.trend_analysis
:[];

/*
  ฝุ่น 3 ขนาดอยู่ในการ์ดเดียว
  ส่วน Temperature / Humidity / Light
  ยังคงเป็นการ์ดแยกเหมือนเดิม
*/

const environmentFields=[
"temperature",
"humidity",
"light"
];

const environmentCards=
environmentFields
.map(
field=>
trends.find(
x=>x?.field===field
)
)
.filter(Boolean);

const dustCard=
renderDustTrendCard(
trends
);

const otherCards=
environmentCards
.map(
x=>
`<div class="ai-trend-item">
<div class="ai-trend-variable">
${esc(
CURRENT_METRIC_CONFIG[
x.field
]?.label||
x.field
)}
</div>

<div class="ai-trend-direction">
${esc(
aiDirectionText(
x.direction
)
)}
</div>

<div class="ai-trend-explanation">
${esc(
x.explanation||
""
)}
</div>
</div>`
)
.join("");

box.innerHTML=
`
<div class="ai-forecast-headline">
${esc(
normalizeProjectWording(d.headline)||
"แนวโน้มและคาดการณ์"
)}
</div>

<div class="ai-trend-summary">
${dustCard}
${otherCards}
</div>

<div class="ai-trend-driver">
<b>ปัจจัยที่เด่น:</b>
${esc(
normalizeProjectWording(d.primary_driver)||
"--"
)}
<br>
<b>สิ่งผิดปกติ:</b>
${esc(
normalizeProjectWording(d.anomaly_summary)||
"--"
)}
</div>

<div class="ai-forecast-grid mt-3">

<div class="ai-forecast-item">
<div class="ai-forecast-label">
🌿 คุณภาพอากาศ
</div>
<div>
${esc(
normalizeProjectWording(d.air_forecast)||
"ยังไม่มีข้อมูล"
)}
</div>
</div>

<div class="ai-forecast-item">
<div class="ai-forecast-label">
🌡 สภาพความร้อน
</div>
<div>
${esc(
normalizeProjectWording(d.heat_forecast)||
"ยังไม่มีข้อมูล"
)}
</div>
</div>

<div class="ai-forecast-item">
<div class="ai-forecast-label">
📍 พื้นที่
</div>
<div>
${esc(
normalizeProjectWording(d.local_environment_forecast)||
"ยังไม่มีข้อมูล"
)}
</div>
</div>

<div class="ai-forecast-item">
<div class="ai-forecast-label">
🏃 กิจกรรม
</div>
<div>
${esc(
normalizeProjectWording(d.activity_forecast)||
"ยังไม่มีข้อมูล"
)}
</div>
</div>

</div>

<div class="ai-meta-row">
<span>
คาดการณ์จากข้อมูลล่าสุดและข้อมูลย้อนหลัง
</span>
<span class="ai-confidence">
ความเชื่อมั่น:
${confidenceText(
d.confidence||
"low"
)}
</span>
</div>`;

}

async function loadAIForecast(
force=false
){

if(
aiForecastLoading
){
return;
}

aiForecastLoading=
true;

renderAIForecast(
aiForecastPayload
);

const button=
$("aiForecastRefreshButton");

if(button){

button.disabled=
true;

}

try{

const url=
API.forecast+
(
force
?"?refresh=1"
:""
);

aiForecastPayload=
await fetchJson(
url
);

aiForecastLastLoadedAt=
new Date();

}catch(e){

console.error(
"AI forecast error:",
e
);

aiForecastPayload=
null;

}finally{

aiForecastLoading=
false;

if(button){

button.disabled=
false;

}

renderAIForecast(
aiForecastPayload
);

drawCharts();

}

}

// =====================================================
// HELP
// =====================================================

const HELP_CONTENT={

monitoring:{
title:"📍 จุดตรวจวัด",
html:`
<section class="help-section">
<h4>โซนนี้บอกอะไร?</h4>
<p>แสดงสถานะและค่าล่าสุดของจุดตรวจวัดทั้ง 3 จุด ได้แก่ PM1.0, PM2.5, PM10, อุณหภูมิ, ความชื้น และความเข้มแสง โดยค่าที่เห็นเป็นค่าล่าสุดที่ระบบรับรองว่าอ่านได้ ไม่ใช่การแทนค่าที่หายด้วย 0</p>
</section>

<section class="help-section">
<h4>ข้อมูลมาจากเซนเซอร์อะไร?</h4>
<ul>
<li><b>PMS3003</b> → PM1.0, PM2.5, PM10 หน่วย µg/m³</li>
<li><b>AM2315</b> → อุณหภูมิ (°C) และความชื้นสัมพัทธ์ (%)</li>
<li><b>BH1750</b> → ความเข้มแสง หน่วย lux</li>
</ul>
</section>

<section class="help-section">
<h4>ทำไมหนึ่งรอบไม่ใช้ค่าที่อ่านครั้งเดียว?</h4>
<p>ตัวลูกเก็บค่าหลายครั้งประมาณ 1 นาที ใช้เฉพาะครั้งที่อ่านสำเร็จ แล้วจึงส่งค่าเฉลี่ยให้ตัวแม่หนึ่งครั้ง</p>
<div class="help-formula">x̄ = (x₁ + x₂ + ... + xₙ) / n<sub>valid</sub></div>
<p class="help-muted">n<sub>valid</sub> คือจำนวนครั้งที่อ่านสำเร็จ ค่าที่อ่านไม่สำเร็จจะไม่ถูกแทนด้วย 0 และไม่ถูกนำมาหารเฉลี่ย</p>
</section>

<section class="help-section">
<h4>เกณฑ์และการตีความของข้อมูลทั้ง 6 ค่า</h4>

<div class="help-sensor-card">
<div class="help-sensor-head"><b>PM1.0</b><span class="help-chip no-standard">ไม่มีเกณฑ์สุขภาพที่โครงการใช้</span></div>
<p>ใช้เป็นข้อมูลประกอบเพื่อดูอนุภาคที่มีขนาดเล็กมากขึ้น แต่ <b>กรมควบคุมมลพิษของไทยไม่ได้ใช้ PM1.0 เป็นตัวแปร AQI</b> และ WHO AQG 2021 กำหนดระดับเชิงปริมาณสำหรับ PM2.5 และ PM10 ไม่ได้กำหนด PM1.0 ดังนั้น Dashboard จะแสดง PM1.0 เป็นข้อมูลประกอบ ไม่ตัดสินว่า “ดี/อันตราย” จาก PM1.0 เพียงค่าเดียว</p>
</div>

<div class="help-sensor-card">
<div class="help-sensor-head"><b>PM2.5</b><span class="help-chip has-standard">มีเกณฑ์อ้างอิง</span></div>
<p>เป็นตัวหลักที่ระบบใช้สื่อสารคุณภาพอากาศและแจ้งเตือน</p>
<div class="help-threshold-grid">
<span>0–15.0 µg/m³</span><b>ดีมาก</b>
<span>15.1–25.0 µg/m³</span><b>ดี</b>
<span>25.1–37.5 µg/m³</span><b>ปานกลาง</b>
<span>37.6–75.0 µg/m³</span><b>เริ่มมีผลกระทบต่อสุขภาพ</b>
<span>75.1 µg/m³ ขึ้นไป</span><b>มีผลกระทบต่อสุขภาพ</b>
</div>
<div class="help-warning">มาตรฐาน PM2.5 ของไทยที่ 37.5 µg/m³ เป็น <b>ค่าเฉลี่ย 24 ชั่วโมง</b> ส่วนค่าบนการ์ดเป็นค่ารอบล่าสุด/ระยะสั้น จึงใช้เพื่อเฝ้าระวังและสื่อสารเบื้องต้น ไม่ใช่ผล AQI 24 ชั่วโมงอย่างเป็นทางการ</div>
</div>

<div class="help-sensor-card">
<div class="help-sensor-head"><b>PM10</b><span class="help-chip has-standard">มีมาตรฐานอากาศ</span></div>
<p>ประเทศไทยกำหนดมาตรฐาน PM10 ในบรรยากาศทั่วไป <b>ค่าเฉลี่ย 24 ชั่วโมงไม่เกิน 120 µg/m³</b> และค่าเฉลี่ยรายปีไม่เกิน 50 µg/m³ ขณะที่ WHO AQG 2021 แนะนำ 24 ชั่วโมง 45 µg/m³ และรายปี 15 µg/m³</p>
<p class="help-muted">ในโครงการนี้ PM10 ใช้เพื่อแสดงผล เปรียบเทียบ ดูย้อนหลัง และใช้ประกอบคำแนะนำกิจกรรม/การเฝ้าระวังเบื้องต้น แต่ <b>ยังไม่ใช้สร้าง Alert รายจุดแบบ PM2.5</b> และการตัดสินมาตรฐานจริงต้องอาศัยค่าเฉลี่ย 24 ชั่วโมง</p>
</div>

<div class="help-sensor-card">
<div class="help-sensor-head"><b>อุณหภูมิ</b><span class="help-chip context-standard">ไม่ตัดสินเดี่ยว</span></div>
<p>ระบบไม่กำหนดว่าอุณหภูมิ “ดี/อันตราย” จาก °C เพียงค่าเดียว เพราะผลต่อร่างกายขึ้นกับความชื้นด้วย จึงนำอุณหภูมิไปคำนวณ <b>Heat Index</b> ร่วมกับความชื้นแทน</p>
</div>

<div class="help-sensor-card">
<div class="help-sensor-head"><b>ความชื้นสัมพัทธ์</b><span class="help-chip context-standard">ไม่ตัดสินเดี่ยว</span></div>
<p>โครงการไม่ได้ตั้ง Health Threshold ของความชื้นเพียงค่าเดียว แต่ใช้ความชื้นร่วมกับอุณหภูมิในการคำนวณ Heat Index เพราะความชื้นสูงทำให้การระเหยของเหงื่อลดลงและทำให้ร่างกายรู้สึกร้อนขึ้นได้</p>
</div>

<div class="help-sensor-card">
<div class="help-sensor-head"><b>แสง (lux)</b><span class="help-chip no-standard">ไม่มี Health Threshold</span></div>
<p>lux คือ <b>ความส่องสว่าง (illuminance)</b> ที่ตกกระทบจุดตรวจวัด ใช้ดูบริบทของสภาพแสงและการเปลี่ยนแปลงย้อนหลัง ไม่ใช่หน่วยความร้อน และไม่ใช้ตัดสินเมฆ/ฝนหรือคุณภาพอากาศ</p>
<p class="help-muted">ค่าที่เหมาะสมของ lux ขึ้นกับงานและสถานที่ เช่น ห้องเรียน ทางเดิน หรือกลางแจ้ง จึงไม่มีเกณฑ์สุขภาพกลางแจ้งค่าเดียวที่โครงการนำมาใช้ตัดสิน “ดี/ไม่ดี”</p>
</div>
</section>

<section class="help-section">
<h4>ONLINE / OFFLINE หมายถึงอะไร?</h4>
<ul>
<li><b>ONLINE</b> = จุดตรวจวัดยังติดต่อกับระบบได้ โดยหน้า Dashboard นับช่วง Sleep ตามรอบประหยัดพลังงานเป็น ONLINE ด้วย</li>
<li><b>OFFLINE</b> = จุดตรวจวัดไม่กลับมาตามเวลาที่ควรตื่นพร้อมช่วงเผื่อ หรือสถานีรับข้อมูลหลักขาดการเชื่อมต่อ</li>
</ul>
<p class="help-muted">ระบบใช้รอบ Sleep/Expected Wake ของอุปกรณ์ ไม่ได้ใช้ตัวเลข 6 นาทีเป็นเกณฑ์หลัก เมื่อพ้นเวลาที่ควรตื่นและช่วงเผื่อแล้วยังไม่มีการติดต่อจึงถือว่า Offline</p>
</section>

<section class="help-section">
<h4>ทำไม ONLINE แล้วบางครั้งยังเป็นค่ารอบก่อน?</h4>
<p>สถานะกับค่าที่วัดแยกจากกัน เมื่ออุปกรณ์ตื่นจะส่ง ONLINE ก่อน แล้วใช้เวลาวัดรอบใหม่ประมาณ 1 นาที ระหว่างนั้น Dashboard จะคงค่าล่าสุดไว้จนกว่าค่าใหม่จะมาถึง</p>
</section>

<section class="help-section">
<h4>ค่าที่เห็นเชื่อถือได้แค่ไหน?</h4>
<p>ระบบนี้เป็น <b>การตรวจติดตามระดับพื้นที่เพื่อการศึกษาและการเฝ้าระวัง (informational monitoring)</b> ไม่ใช่สถานีตรวจวัดอ้างอิงของภาครัฐ การอ่านค่าจากเซนเซอร์ราคาประหยัดอาจได้รับผลจากสภาพแวดล้อม ความชื้น การติดตั้ง และความแตกต่างระหว่างอุปกรณ์</p>
<p class="help-muted">U.S. EPA แนะนำให้พิจารณา QA/QC, การตรวจสอบข้อมูล และการ collocation เทียบกับเครื่องอ้างอิงเมื่อต้องการประเมินความถูกต้องเชิงปริมาณ ดังนั้นโครงการไม่อ้างว่าค่าจาก PMS3003 เทียบเท่าสถานีมาตรฐานโดยอัตโนมัติ</p>
</section>

<section class="help-section">
<h4>อะไรคือ “มาตรฐาน” และอะไรคือ “กฎของโครงการ”?</h4>
<ul>
<li><b>มาตรฐาน/เกณฑ์ภายนอก</b> → เช่น เกณฑ์ PM2.5/PM10 และ Heat Index มีแหล่งอ้างอิงจากหน่วยงานที่ระบุด้านล่าง</li>
<li><b>กฎของโครงการ</b> → เช่น อ่านหลายครั้งประมาณ 1 นาที, รอบ Sleep/Expected Wake และวิธีจัดสถานะ เป็นการออกแบบระบบเพื่อให้เหมาะกับอุปกรณ์และการใช้งาน ไม่ใช่มาตรฐานที่หน่วยงานภายนอกบังคับ</li>
<li><b>วิธีคำนวณทั่วไป</b> → เช่น ค่าเฉลี่ยและ Linear Regression เป็นวิธีทางคณิตศาสตร์ แต่ช่วงข้อมูลและเงื่อนไขที่นำมาใช้เป็นการออกแบบของโครงการ</li>
</ul>
</section>

<div class="help-sources">
<b>อ้างอิงของตัวแปร:</b>
<a href="https://www.epa.gov/air-sensor-toolbox/how-use-air-sensors-air-sensor-guidebook" target="_blank" rel="noopener noreferrer">U.S. EPA — Enhanced Air Sensor Guidebook (QA/QC, sensor performance, data handling)</a>
<a href="https://www.epa.gov/air-sensor-toolbox/air-sensor-use-and-study-design" target="_blank" rel="noopener noreferrer">U.S. EPA — Air Sensor Use and Study Design</a>
<a href="https://www.pcd.go.th/wp-content/uploads/2025/08/pcdnew-2025-08-01_07-12-19_226372.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — AQI/PM2.5 ประเทศไทย</a>
<a href="https://www.pcd.go.th/wp-content/uploads/2024/06/pcdnew-2024-06-21_06-42-54_474054.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — มาตรฐาน PM2.5 และ PM10</a>
<a href="https://www.who.int/publications/i/item/9789240034228" target="_blank" rel="noopener noreferrer">WHO Global Air Quality Guidelines 2021 — PM2.5 / PM10</a>
<a href="https://www.rnd.tmd.go.th/heatindexanalysis/" target="_blank" rel="noopener noreferrer">กรมอุตุนิยมวิทยา — Heat Index</a>
<a href="https://www.rohm.com/products/sensors-mems/ambient-light-sensor-ics" target="_blank" rel="noopener noreferrer">ROHM — Ambient Light / lux</a>
</div>`
},

smartSummary:{
title:"✦ สรุปสถานการณ์",
html:`
<section class="help-section">
<h4>โซนนี้ตอบอะไร?</h4>
<p>สรุปสิ่งที่คนทั่วไปต้องการรู้ทันที 4 เรื่อง คือ <b>คุณภาพอากาศ</b>, <b>สภาพความร้อน</b>, <b>ลักษณะฝุ่นในพื้นที่</b> และ <b>สถานะจุดตรวจวัด</b> พร้อมคำแนะนำกิจกรรมกลางแจ้ง</p>
</section>

<section class="help-section">
<h4>🌿 คุณภาพอากาศ — ใช้ฝุ่นมากกว่าหนึ่งขนาด</h4>
<p>ระบบไม่ได้เอา PM1.0 + PM2.5 + PM10 มาบวกหรือเฉลี่ยรวมเป็นคะแนนเดียว เพราะแต่ละขนาดมีความหมายและเกณฑ์ต่างกัน แต่จะอ่านทั้งสามค่าแล้วสรุปเป็นภาษาง่าย ๆ</p>
<ul>
<li><b>PM2.5</b> → เป็นตัวหลักด้านผลกระทบต่อสุขภาพ ใช้ช่วงระดับของกรมควบคุมมลพิษ</li>
<li><b>PM10</b> → ใช้ตรวจว่าฝุ่นขนาดใหญ่สูงกว่าค่าอ้างอิง 24 ชั่วโมง 120 µg/m³ หรือไม่</li>
<li><b>PM1.0</b> → ไม่มีเกณฑ์ AQI ที่โครงการใช้ จึงเป็นข้อมูลประกอบ ไม่ใช้ตัดสินสุขภาพเพียงตัวเดียว</li>
</ul>
<p>ตัวอย่างข้อความที่ระบบอาจแสดง: <b>อากาศโดยรวมดี</b>, <b>ควรเฝ้าระวังฝุ่นขนาดเล็ก</b>, <b>ควรเฝ้าระวังฝุ่นขนาดใหญ่</b> หรือ <b>ควรเฝ้าระวังฝุ่นหลายขนาด</b></p>
<div class="help-warning">PM2.5 37.5 µg/m³ และ PM10 120 µg/m³ เป็นค่าอ้างอิงแบบ <b>เฉลี่ย 24 ชั่วโมง</b> การนำมาเทียบกับค่ารอบล่าสุดของ Dashboard ใช้เพื่อการเฝ้าระวังเบื้องต้น ไม่ใช่การรับรองว่าผ่าน/ไม่ผ่านมาตรฐาน 24 ชั่วโมง</div>
</section>

<section class="help-section">
<h4>🌡 สภาพความร้อน</h4>
<p>ใช้อุณหภูมิและความชื้นร่วมกันคำนวณ Heat Index เพื่อบอกความร้อนที่ร่างกายรู้สึกได้ ไม่ตัดสินจากอุณหภูมิเพียงค่าเดียว</p>
</section>

<section class="help-section">
<h4>🌫 ลักษณะฝุ่นในพื้นที่</h4>
<p>ช่องนี้ไม่บอกว่า “ฝุ่นอันตรายไหม” เพราะหน้าที่นั้นอยู่ที่คุณภาพอากาศ แต่บอกว่า <b>ฝุ่นที่ตรวจพบมีสัดส่วนขนาดแบบไหน</b></p>
<div class="help-formula">สัดส่วนฝุ่นขนาดเล็ก = (PM2.5 / PM10) × 100%</div>
<p>ถ้า PM2.5 มีสัดส่วนสูงเมื่อเทียบกับ PM10 ระบบจะสรุปว่า <b>ฝุ่นขนาดเล็กเป็นสัดส่วนหลัก</b>; ถ้าสัดส่วนอยู่กึ่งกลางจะบอกว่า <b>พบฝุ่นหลายขนาดผสมกัน</b>; และถ้าสัดส่วนต่ำจะบอกว่า <b>ฝุ่นขนาดใหญ่มีสัดส่วนมากขึ้น</b></p>
<p>ถ้ามี PM1.0 ระบบจะแสดงเพิ่มว่า PM1 คิดเป็นกี่เปอร์เซ็นต์ของ PM2.5 เพื่อช่วยอธิบายอนุภาคขนาดเล็กกว่า 1 µm</p>
<div class="help-warning"><b>ข้อจำกัด:</b> สัดส่วนนี้ใช้เพื่ออธิบาย “ขนาดของฝุ่นที่ตรวจพบ” เท่านั้น ไม่สามารถใช้ฟันธงแหล่งกำเนิดว่าเกิดจากรถ การเผา โรงงาน หรือแหล่งใดโดยตรง</div>
</section>

<section class="help-section">
<h4>สูตร “ลักษณะฝุ่น” เป็นมาตรฐานหรือไม่?</h4>
<p><b>ไม่ใช่มาตรฐาน AQI หรือเกณฑ์สุขภาพ</b> การใช้สัดส่วน PM2.5/PM10 ในหน้านี้เป็นกฎอธิบายข้อมูลของโครงการ เพื่อช่วยให้คนทั่วไปเห็นว่าค่าฝุ่นที่วัดได้เอนมาทางอนุภาคเล็กหรือใหญ่เพียงใด จึงไม่ใช้แทนการวิเคราะห์องค์ประกอบทางเคมีหรือระบุแหล่งกำเนิดฝุ่น</p>
</section>

<section class="help-section">
<h4>📡 สถานีตรวจวัด</h4>
<p>บอกว่าตอนนี้ระบบใช้ข้อมูลได้กี่จุดจากทั้งหมด 3 จุด เพื่อให้ผู้ใช้รู้ว่าภาพรวมที่เห็นมาจากข้อมูลครบหรือไม่</p>
</section>

<section class="help-section">
<h4>🏃 กิจกรรมกลางแจ้ง</h4>
<p>ใช้ PM2.5, PM10 และ Heat Index ร่วมกัน ถ้ามีค่าที่ควรเฝ้าระวัง ระบบจะเพิ่มระดับความระมัดระวัง ส่วน PM1.0 และแสงไม่ได้ใช้เป็น Health Alert โดยตรง</p>
</section>

<div class="help-sources">
<b>อ้างอิง:</b>
<a href="https://www.pcd.go.th/wp-content/uploads/2025/08/pcdnew-2025-08-01_07-12-19_226372.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — AQI/PM2.5</a>
<a href="https://www.pcd.go.th/wp-content/uploads/2024/06/pcdnew-2024-06-21_06-42-54_474054.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — มาตรฐาน PM10</a>
<a href="https://www.rnd.tmd.go.th/heatindexanalysis/" target="_blank" rel="noopener noreferrer">กรมอุตุนิยมวิทยา — Heat Index</a>
</div>`
},

currentAir:{
title:"📍 เปรียบเทียบจุดตรวจวัด",
html:`
<section class="help-section">
<h4>โซนนี้ใช้ทำอะไร?</h4>
<p>เปรียบเทียบจุดตรวจวัดทั้ง 3 จุดในตัวแปรที่เลือก เพื่อให้เห็น <b>ค่าเฉลี่ยของพื้นที่</b>, <b>จุดที่ค่าสูงที่สุด</b> และ <b>จุดที่ควรสนใจ</b></p>
</section>

<section class="help-section">
<h4>ค่าเฉลี่ยทั้งพื้นที่คำนวณอย่างไร?</h4>
<p>ใช้เฉพาะจุดที่ยังใช้งานได้และมีค่าจริงของตัวแปรนั้น</p>
<div class="help-formula">ค่าเฉลี่ยพื้นที่ = Σ(ค่าของจุดที่มีข้อมูล) / จำนวนจุดที่มีข้อมูล</div>
<p>ถ้าจุดใดไม่มีข้อมูล จุดนั้นจะไม่ถูกนำไปหารและไม่ถูกแทนด้วย 0</p>
</section>

<section class="help-section">
<h4>ถ้าเลือกแต่ละตัวแปร ระบบตีความอย่างไร?</h4>
<ul>
<li><b>PM2.5</b> → มีเกณฑ์คุณภาพอากาศของไทย และระบบใช้เป็นตัวหลักในการเฝ้าระวัง</li>
<li><b>PM10</b> → มีมาตรฐานอากาศไทยเฉลี่ย 24 ชั่วโมง 120 µg/m³ ในโซนนี้ใช้เพื่อเปรียบเทียบและเฝ้าระวังเบื้องต้น หากค่ารอบล่าสุดสูงกว่า 120 µg/m³ จะแสดง “เฝ้าระวัง” แต่ไม่ถือว่าเป็นผลเกินมาตรฐาน 24 ชั่วโมงโดยตรง</li>
<li><b>PM1.0</b> → ไม่มี AQI/Health Threshold ที่โครงการใช้ จึงแสดงเพื่อเปรียบเทียบเท่านั้น</li>
<li><b>อุณหภูมิ</b> → ไม่ตัดสินความเสี่ยงจากอุณหภูมิเดี่ยว ต้องดูร่วมกับความชื้นผ่าน Heat Index</li>
<li><b>ความชื้น</b> → ไม่มี Health Threshold เดี่ยวในโครงการ ใช้ประกอบ Heat Index</li>
<li><b>แสง</b> → ไม่มี Health Threshold; ใช้เปรียบเทียบความส่องสว่าง ณ จุดตรวจวัด</li>
</ul>
</section>

<section class="help-section">
<h4>จุดที่ค่าสูงที่สุด ≠ จุดอันตรายเสมอ</h4>
<p>ช่อง “จุดที่ค่าสูงที่สุด” เป็นการเปรียบเทียบตัวเลขเท่านั้น ส่วนการตัดสินว่าควรเฝ้าระวังจะใช้เฉพาะเกณฑ์ที่ระบบกำหนดไว้ เช่น PM2.5 และ Heat Index ในโซนสรุป/แจ้งเตือน</p>
</section>

<div class="help-sources">
<b>อ้างอิง:</b>
<a href="https://www.pcd.go.th/wp-content/uploads/2025/08/pcdnew-2025-08-01_07-12-19_226372.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — AQI/PM2.5</a>
<a href="https://www.pcd.go.th/wp-content/uploads/2024/06/pcdnew-2024-06-21_06-42-54_474054.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — PM10</a>
<a href="https://www.who.int/publications/i/item/9789240034228" target="_blank" rel="noopener noreferrer">WHO AQG 2021</a>
<a href="https://www.rnd.tmd.go.th/heatindexanalysis/" target="_blank" rel="noopener noreferrer">กรมอุตุนิยมวิทยา — Heat Index</a>
<a href="https://www.rohm.com/products/sensors-mems/ambient-light-sensor-ics" target="_blank" rel="noopener noreferrer">ROHM — lux</a>
</div>`
},

alerts:{
title:"⚠ สิ่งที่ควรระวัง",
html:`
<section class="help-section">
<h4>โซนนี้แจ้งอะไร?</h4>
<p>แสดงเฉพาะเรื่องที่ควรให้ความสนใจ เพื่อไม่ให้ผู้ใช้ต้องไล่อ่านตัวเลขทุกช่อง</p>
</section>

<section class="help-section">
<h4>1) การเชื่อมต่อ</h4>
<p>ระบบทราบรอบที่จุดตรวจวัดควรตื่นจาก Sleep หากพ้นเวลาที่ควรกลับมาพร้อมช่วงเผื่อแล้วยังไม่มีการติดต่อ ระบบจะแจ้งว่าขาดการเชื่อมต่อ หากสถานีรับข้อมูลหลักขาดการเชื่อมต่อ ระบบจะไม่ยืนยันสถานะของจุดตรวจวัดทั้ง 3 จุด</p>
<p class="help-muted">การเข้า Sleep และตื่นตามแผนถือเป็นการทำงานปกติ จึงไม่สร้างการแจ้งเตือน Offline/Online ซ้ำโดยไม่จำเป็น</p>
</section>

<section class="help-section">
<h4>การแจ้งเตือน Telegram</h4>
<p>Telegram ใช้แจ้งเหตุที่ต้องให้ผู้ดูแลรับรู้ ได้แก่ สถานีรับข้อมูลหลักขาด/กลับมาเชื่อมต่อ จุดตรวจวัดขาด/กลับมาเชื่อมต่อ และการเปลี่ยนระดับของ PM2.5 หรือ Heat Index ที่ระบบใช้เฝ้าระวัง</p>
<p class="help-muted">Sleep ตามรอบปกติไม่แจ้งเตือน และระบบพยายามส่งเมื่อสถานะหรือระดับเปลี่ยนเพื่อลดข้อความซ้ำ</p>
</section>

<section class="help-section">
<h4>2) PM2.5</h4>
<p>37.6–75.0 µg/m³ = เริ่มมีผลกระทบต่อสุขภาพ และ 75.1 µg/m³ ขึ้นไป = มีผลกระทบต่อสุขภาพ ตามระดับอ้างอิงของกรมควบคุมมลพิษ</p>
<div class="help-warning">37.5 µg/m³ เป็นมาตรฐาน PM2.5 <b>เฉลี่ย 24 ชั่วโมง</b> การเตือนจากค่ารอบล่าสุดของโครงการเป็นการเฝ้าระวังเบื้องต้น</div>
</section>

<section class="help-section">
<h4>3) PM10</h4>
<p>PM10 มีมาตรฐานอากาศไทยแบบเฉลี่ย 24 ชั่วโมง 120 µg/m³ ระบบจึงใช้ค่ารอบล่าสุดที่สูงกว่า 120 µg/m³ เป็น <b>สัญญาณเฝ้าระวังเบื้องต้น</b> เท่านั้น ไม่สรุปว่าเกินมาตรฐาน 24 ชั่วโมงจากการวัดเพียงรอบเดียว</p>
</section>

<section class="help-section">
<h4>ทำไมระบบแจ้งเตือนจากค่ารอบล่าสุด ทั้งที่มาตรฐานฝุ่นเป็นค่าเฉลี่ย 24 ชั่วโมง?</h4>
<p>เพราะ Alert ของโครงการมีหน้าที่เป็น <b>สัญญาณเฝ้าระวังเร็ว</b> ไม่ใช่การประกาศว่าผ่านหรือไม่ผ่านมาตรฐาน 24 ชั่วโมง การเทียบมาตรฐานอย่างเป็นทางการต้องใช้ช่วงเวลาเฉลี่ยและวิธีประเมินให้ตรงกับมาตรฐานนั้น</p>
<p class="help-muted">U.S. EPA แนะนำให้จับคู่ช่วงการ aggregate/average ของข้อมูลกับมาตรฐานหรือดัชนีที่ต้องการเปรียบเทียบ จึงแยก “Realtime Alert” ออกจาก “ผลมาตรฐาน 24 ชั่วโมง” อย่างชัดเจน</p>
</section>

<section class="help-section">
<h4>4) สภาพความร้อน</h4>
<p>คำนวณ Heat Index จากอุณหภูมิ + ความชื้น และใช้ระดับ: เฝ้าระวังตั้งแต่ 27°C, เตือนภัยตั้งแต่ 32°C, อันตรายตั้งแต่ 41°C และอันตรายมากเมื่อมากกว่า 54°C</p>
</section>

<div class="help-sources">
<b>อ้างอิง:</b>
<a href="https://www.pcd.go.th/wp-content/uploads/2024/06/pcdnew-2024-06-21_06-42-54_474054.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — PM2.5</a>
<a href="https://www.rnd.tmd.go.th/heatindexanalysis/" target="_blank" rel="noopener noreferrer">กรมอุตุนิยมวิทยา — Heat Index</a>
</div>`
},

historical:{
title:"📊 สถิติย้อนหลังและกราฟ",
html:`
<section class="help-section">
<h4>โซนนี้ทำอะไร?</h4>
<p>ใช้ดูการเปลี่ยนแปลงของข้อมูลในช่วงเวลาที่เลือก เช่น วันนี้, 30 นาที, 1 ชั่วโมง, 24 ชั่วโมง, 7 วัน หรือ 30 วัน</p>
</section>

<section class="help-section">
<h4>สถิติที่แสดง</h4>
<ul>
<li><b>ค่าเฉลี่ย</b> = ผลรวมค่าที่ใช้ได้ ÷ จำนวนข้อมูลที่ใช้ได้</li>
<li><b>ค่าสูงสุด</b> = ค่ามากที่สุดในช่วงเวลา</li>
<li><b>ค่าต่ำสุด</b> = ค่าน้อยที่สุดในช่วงเวลา</li>
<li><b>ค่าล่าสุด</b> = ค่าจริงชุดล่าสุดในช่วงเวลา</li>
</ul>
<div class="help-formula">x̄ = Σx / n<sub>valid</sub></div>
<p>ค่า null/อ่านไม่สำเร็จจะถูกข้าม ไม่แปลงเป็น 0</p>
</section>

<section class="help-section">
<h4>ทำไมต้องมีค่าเฉลี่ยและกราฟหลายช่วงเวลา?</h4>
<p>ข้อมูล Air Sensor ความละเอียดสูงอาจแกว่งเร็ว การดูข้อมูลดิบช่วยเห็นเหตุการณ์สั้น ๆ ขณะที่การ aggregate/เฉลี่ยช่วยเห็นภาพรวมและลด noise ได้ U.S. EPA ระบุว่าช่วงเฉลี่ยที่เหมาะสมขึ้นกับคำถามของงาน เช่น งานที่สนใจเหตุการณ์ช่วงสั้นอาจใช้ค่าเฉลี่ยระดับไม่กี่นาที ส่วนการดูแนวโน้มระยะยาวอาจใช้รายชั่วโมงหรือรายวัน</p>
<div class="help-warning">ดังนั้นช่วง 30 นาที, 1 ชั่วโมง, 24 ชั่วโมง, 7 วัน และ 30 วันบน Dashboard เป็น <b>ตัวเลือกการดูข้อมูลของโครงการ</b> ไม่ใช่การอ้างว่าทุกช่วงเป็นมาตรฐานสุขภาพ</div>
</section>

<section class="help-section">
<h4>แนวโน้ม ↑ ↓ →</h4>
<p>เมื่อเลือกตัวแปรเดียว ระบบเทียบค่าตัวแรกกับค่าล่าสุด</p>
<div class="help-formula">%Δ = ((ค่าล่าสุด − ค่าแรก) / |ค่าแรก|) × 100</div>
<p>ถ้าขนาดการเปลี่ยนแปลงต่ำกว่า 1% แสดง <b>คงที่</b>; ถ้าเพิ่มแสดง ↑ และถ้าลดแสดง ↓</p>
<p class="help-muted">เกณฑ์ 1% เป็นกฎแสดงผลของโครงการ ไม่ใช่มาตรฐานภายนอก</p>
</section>

<section class="help-section">
<h4>เกณฑ์ของค่าที่เห็นในกราฟ</h4>
<ul>
<li><b>PM2.5</b> → มีเกณฑ์ AQI/มาตรฐานไทย แต่กราฟคือค่าที่วัดตามเวลา ไม่ใช่ค่าเฉลี่ย 24 ชั่วโมงโดยอัตโนมัติ</li>
<li><b>PM10</b> → มีมาตรฐานไทย 24 ชั่วโมง 120 µg/m³ และรายปี 50 µg/m³; กราฟใช้เพื่อดูแนวโน้ม ไม่ได้แปลว่าเส้นที่เกินครั้งเดียวคือการเกินมาตรฐาน 24 ชั่วโมง</li>
<li><b>PM1.0</b> → ไม่มีเกณฑ์ AQI ที่โครงการใช้ แสดงเพื่อศึกษารูปแบบข้อมูล</li>
<li><b>อุณหภูมิ + ความชื้น</b> → ใช้ร่วมกันใน Heat Index; ไม่ตัดสินความเสี่ยงจากกราฟใดกราฟหนึ่งเพียงตัวเดียว</li>
<li><b>แสง</b> → ไม่มี Health Threshold ในโครงการ; lux ใช้ดูการเปลี่ยนแปลงของความส่องสว่าง</li>
</ul>
</section>

<section class="help-section">
<h4>การอ่านแกนเวลาและการซูมกราฟ</h4>
<p>เมื่อเลือกช่วงยาว เช่น 7 วันหรือ 30 วัน แกนล่างจะแสดงวันที่เป็นหลักเพื่อให้อ่านภาพรวมง่าย เมื่อซูมเข้าเหลือช่วงสั้น ระบบจะเพิ่มรายละเอียดเป็นชั่วโมงและนาที ส่วน Tooltip จะแสดงวันและเวลาของจุดข้อมูลจริงเสมอ</p>
<p class="help-muted">การซูมเปลี่ยนเฉพาะมุมมอง ไม่ได้แก้ไขค่าที่เก็บในฐานข้อมูล</p>
</section>

<section class="help-section">
<h4>ส่งออกข้อมูล</h4>
<p>ใช้ดาวน์โหลดข้อมูลตามช่วงวันที่ เพื่อนำไปตรวจสอบ ทำรายงาน หรือวิเคราะห์เพิ่มเติมภายนอก Dashboard</p>
</section>

<div class="help-sources">
<b>อ้างอิงของข้อมูลที่แสดง:</b>
<a href="https://www.epa.gov/air-sensor-toolbox/how-use-air-sensors-air-sensor-guidebook" target="_blank" rel="noopener noreferrer">U.S. EPA — Enhanced Air Sensor Guidebook (Data Aggregation / QA)</a>
<a href="https://www.pcd.go.th/wp-content/uploads/2025/08/pcdnew-2025-08-01_07-12-19_226372.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — PM2.5/AQI</a>
<a href="https://www.pcd.go.th/wp-content/uploads/2024/06/pcdnew-2024-06-21_06-42-54_474054.pdf" target="_blank" rel="noopener noreferrer">กรมควบคุมมลพิษ — PM10</a>
<a href="https://www.who.int/publications/i/item/9789240034228" target="_blank" rel="noopener noreferrer">WHO AQG 2021 — PM2.5/PM10</a>
<a href="https://www.rnd.tmd.go.th/heatindexanalysis/" target="_blank" rel="noopener noreferrer">กรมอุตุนิยมวิทยา — Heat Index</a>
<a href="https://www.rohm.com/products/sensors-mems/ambient-light-sensor-ics" target="_blank" rel="noopener noreferrer">ROHM — Ambient Light Sensor</a>
</div>`
},

ai:{
title:"🤖 วิเคราะห์และคาดการณ์",
html:`
<section class="help-section">
<h4>โซนนี้แบ่งเป็น 2 ส่วน</h4>
<p><b>ตอนนี้เป็นอย่างไร</b> → สรุปสถานการณ์จากค่าล่าสุดและข้อมูลย้อนหลัง</p>
<p><b>อีก 30 นาทีเป็นอย่างไร</b> → คาดการณ์แนวโน้มที่ +10, +20 และ +30 นาที</p>
</section>

<section class="help-section">
<h4>ป้าย AI CACHED / GEMINI AI คืออะไร?</h4>
<p>ป้ายสองอันนี้ตอบคนละคำถาม: <b>GEMINI AI บอกว่าใครช่วยวิเคราะห์</b> ส่วน <b>AI CACHED บอกว่าผลที่เห็นถูกนำมาจากไหนในรอบนี้</b></p>
<ul>
<li><b>GEMINI AI</b> = ผลวิเคราะห์ข้อความในส่วนนี้สร้างโดย Gemini จากข้อมูล Sensor/ผลคำนวณที่ระบบส่งให้ เพื่อช่วยอธิบายแนวโน้มเป็นภาษาที่อ่านง่าย</li>
<li><b>AI CACHED</b> = ระบบกำลังแสดงผล AI ที่คำนวณไว้ล่าสุดจาก Cache แทนการเรียก AI ใหม่ทุกครั้ง ช่วยลดการเรียก API และทำให้หน้าเว็บตอบสนองเร็วขึ้น ไม่ได้หมายความว่า Sensor หยุดวัด</li>
<li><b>Statistical / Rule Engine</b> = ระบบสำรองเมื่อ AI ภายนอกไม่พร้อม โดยยังใช้ข้อมูล Sensor และกฎ/แบบจำลองของระบบได้</li>
</ul>
<div class="help-warning">AI ไม่ได้สร้างค่าที่ Sensor วัดขึ้นมาเอง ค่าจริงใน Dashboard มาจากอุปกรณ์ตรวจวัด ส่วน AI มีหน้าที่ช่วยแปลผลและอธิบาย</div>
</section>

<section class="help-section">
<h4>AI CACHED ยังเป็นข้อมูลล่าสุดไหม?</h4>
<p>ต้องแยก <b>ข้อมูล Sensor</b> ออกจาก <b>ข้อความวิเคราะห์ AI</b> ค่าบนการ์ดและกราฟยังอัปเดตจากฐานข้อมูลตามปกติ ส่วนข้อความ AI อาจใช้ผลวิเคราะห์ที่ Cache ไว้จนกว่าจะถึงรอบที่ระบบเรียกวิเคราะห์ใหม่ จึงไม่ควรตีความว่า “AI CACHED = Sensor เก่า”</p>
</section>

<section class="help-section">
<h4>ฐานตัวเลข Forecast</h4>
<p>Worker ใช้ข้อมูล Sensor ที่มีค่าจริงย้อนหลังสูงสุด 6 ชั่วโมง และต้องมีข้อมูลของตัวแปรนั้นอย่างน้อย 4 จุด จึงคำนวณแนวโน้มเชิงเส้นได้</p>
</section>

<section class="help-section">
<h4>สูตร Statistical Forecast</h4>
<p>ใช้ Linear Regression</p>
<div class="help-formula">ŷ = a + bx</div>
<div class="help-formula help-formula-small">b = (nΣxy − ΣxΣy) / (nΣx² − (Σx)²), &nbsp; a = (Σy − bΣx) / n</div>
<p>จากนั้นแทนค่าเวลาอนาคตเพื่อประมาณ +10, +20 และ +30 นาที ค่าฝุ่น/แสงจะไม่ต่ำกว่า 0 และความชื้นถูกจำกัดให้อยู่ 0–100%</p>
</section>

<section class="help-section">
<h4>ทำไมโครงการเลือกคาดการณ์ 30 นาที?</h4>
<p><b>30 นาทีเป็นขอบเขตการออกแบบของโครงการ ไม่ใช่ค่าที่ PCD, TMD, WHO หรือ U.S. EPA กำหนดว่าต้องใช้</b> จุดประสงค์ของระบบคือแสดง <b>แนวโน้มระยะสั้นระดับพื้นที่</b> จาก Sensor ที่มีอยู่ จึงแบ่งผลเป็น +10, +20 และ +30 นาที เพื่อให้ผู้ใช้เห็นทิศทางใกล้ปัจจุบันโดยไม่อ้างเกินความสามารถของโมเดล</p>
<p>เหตุผลเชิงหลักการที่รองรับการไม่ยืดระยะออกไปโดยไม่มีการทดสอบ คือ Forecast แบบหลายก้าวมีความไม่แน่นอนสะสมตามระยะพยากรณ์ และงานพยากรณ์ PM2.5 ระยะหลายชั่วโมงมักเพิ่มข้อมูลอุตุนิยมวิทยา/เชิงพื้นที่หรือใช้แบบจำลองที่ซับซ้อนขึ้น</p>
<div class="help-warning"><b>สิ่งที่โครงการไม่ได้อ้าง:</b> ไม่ได้อ้างว่า “30 นาทีคือระยะที่แม่นที่สุด” เพราะการจะกล่าวเช่นนั้นต้องทำ Validation เปรียบเทียบหลาย Forecast Horizon กับค่าที่วัดจริงก่อน</div>
</section>

<section class="help-section">
<h4>คาดการณ์มากกว่า 30 นาทีได้ไหม?</h4>
<p><b>ได้ในทางเทคนิค</b> เช่น 1 ชั่วโมง 3 ชั่วโมง หรือมากกว่านั้น แต่ไม่ควรเพียงยืดเส้น Linear Regression ออกไปแล้วถือว่าความน่าเชื่อถือเท่าเดิม เพราะ PM2.5 เปลี่ยนตามปัจจัยภายนอก เช่น ลม ฝน การแพร่กระจายของมลพิษ และแหล่งกำเนิด</p>
<p>ถ้าจะขยายระยะ Forecast อย่างมีเหตุผล ควรเพิ่มข้อมูลอุตุนิยมวิทยา เช่น ความเร็ว/ทิศทางลม ฝน ความกดอากาศ รวมถึงประเมินโมเดลแยกตาม Forecast Horizon ด้วย MAE/RMSE หรือวิธี Validation อื่น งานวิจัย PM2.5 ระยะหลายชั่วโมงมักใช้ข้อมูลเชิงเวลา เชิงพื้นที่ และข้อมูลอุตุนิยมวิทยาร่วมกัน</p>
</section>

<section class="help-section">
<h4>ถ้าถามว่า “Linear Regression ง่ายเกินไปไหม?”</h4>
<p>Linear Regression ถูกเลือกเป็น <b>baseline model</b> เพราะอธิบายวิธีคำนวณได้ ตรวจสอบย้อนกลับได้ และเหมาะกับการแสดงทิศทางระยะสั้นของโครงการ แต่ไม่ได้หมายความว่าเป็นโมเดลที่ดีที่สุดสำหรับทุกสภาพอากาศ หากต้องการพิสูจน์ว่าโมเดลใดดีกว่า ต้องเปรียบเทียบด้วยข้อมูลทดสอบและตัวชี้วัด เช่น MAE/RMSE</p>
</section>

<section class="help-section">
<h4>ถ้าถามว่า “ทำไมใช้ข้อมูลย้อนหลังสูงสุด 6 ชั่วโมง และอย่างน้อย 4 จุด?”</h4>
<p><b>สองค่านี้เป็นพารามิเตอร์ของโครงการ ไม่ใช่มาตรฐานภายนอก</b> 6 ชั่วโมงใช้จำกัดบริบทให้เน้นข้อมูลล่าสุด ส่วนอย่างน้อย 4 จุดเป็นเงื่อนไขขั้นต่ำที่ระบบตั้งเพื่อไม่คำนวณจากข้อมูลน้อยเกินไป อย่างไรก็ตาม จำนวนดังกล่าวยังไม่ใช่หลักฐานว่าความแม่นยำดีที่สุด และควรประเมินด้วย Validation หากต้องการสรุปเชิงประสิทธิภาพ</p>
</section>

<section class="help-section">
<h4>AI ทำหน้าที่อะไร?</h4>
<p>AI ช่วยแปลผลเป็นภาษา เช่น เพิ่มขึ้น/ลดลง ปัจจัยเด่น และคำอธิบาย แต่ตัวเลข Forecast มีฐานจากข้อมูล Sensor และแบบจำลองเชิงสถิติ หาก AI ภายนอกใช้ไม่ได้ ระบบยังใช้ Statistical Forecast สำรองได้</p>
</section>

<section class="help-section">
<h4>ข้อจำกัด</h4>
<ul>
<li>เป็น Forecast แนวโน้มของสถานี ไม่ใช่พยากรณ์อากาศจากกรมอุตุนิยมวิทยา</li>
<li>ระบบปัจจุบันไม่มีข้อมูลลม ความกดอากาศ ปริมาณฝน หรือ cloud cover</li>
<li>BH1750 วัด lux ไม่ได้วัดเมฆหรือฝน</li>
<li>Heat Index ไม่ใช่ WBGT</li>
<li>ระยะ Forecast ที่ไกลขึ้นไม่ได้รับประกันว่าจะมีความแม่นยำเท่าระยะสั้น จนกว่าจะมีการทดสอบความคลาดเคลื่อนของโมเดลในแต่ละ Horizon</li>
</ul>
</section>

<div class="help-sources">
<b>อ้างอิง:</b>
<a href="https://www.epa.gov/air-sensor-toolbox/how-use-air-sensors-air-sensor-guidebook" target="_blank" rel="noopener noreferrer">U.S. EPA — Enhanced Air Sensor Guidebook</a>
<a href="https://www.epa.gov/air-sensor-toolbox/air-sensor-use-and-study-design" target="_blank" rel="noopener noreferrer">U.S. EPA — Air Sensor Use and Study Design</a>
<a href="https://www.mdpi.com/1424-8220/24/15/5069" target="_blank" rel="noopener noreferrer">Sensors (2024) — Multi-step Air Quality Forecasting</a>
<a href="https://doi.org/10.1016/j.apr.2025.102406" target="_blank" rel="noopener noreferrer">Atmospheric Pollution Research — PM2.5 Multi-step Forecasting in Bangkok</a>
<a href="https://www.rnd.tmd.go.th/heatindexanalysis/" target="_blank" rel="noopener noreferrer">กรมอุตุนิยมวิทยา — Heat Index</a>
</div>`
}

};

function closeHelp(){

const p=$("helpPopover");

if(p){
p.classList.remove("active");
p.setAttribute("aria-hidden","true");
}

if(activeHelpButton){
activeHelpButton.classList.remove("is-active");
activeHelpButton.setAttribute("aria-expanded","false");
}

activeHelpButton=null;

}

function bindHelp(){

document
.querySelectorAll(".help-button")
.forEach(b=>{

b.addEventListener("click",e=>{

e.preventDefault();
e.stopPropagation();

const x=HELP_CONTENT[b.dataset.help];

if(!x){
return;
}

if(activeHelpButton&&activeHelpButton!==b){
activeHelpButton.classList.remove("is-active");
activeHelpButton.setAttribute("aria-expanded","false");
}

activeHelpButton=b;
b.classList.add("is-active");
b.setAttribute("aria-expanded","true");

const title=$("helpPopoverTitle");
const body=$("helpPopoverBody");
const p=$("helpPopover");

if(title){
title.textContent=x.title;
}

if(body){
body.innerHTML=x.html;
}

if(!p){
return;
}

p.classList.add("active");
p.setAttribute("aria-hidden","false");
p.setAttribute("tabindex","-1");

requestAnimationFrame(()=>{
try{p.focus({preventScroll:true});}catch{}
});

});

});

$("helpPopoverClose")
?.addEventListener("click",e=>{
e.preventDefault();
e.stopPropagation();
closeHelp();
});

document.addEventListener("click",e=>{

const p=$("helpPopover");

if(
p?.classList.contains("active")&&
!p.contains(e.target)&&
!e.target.closest?.(".help-button")
){
closeHelp();
}

});

}


// =====================================================
// CREDIT IMAGE VIEWER
// =====================================================

function openCreditImage(src,caption=""){

const modal=
$("creditImageModal");

const img=
$("creditFullImage");

const text=
$("creditImageCaption");

if(
!modal||
!img
){
return;
}

img.src=
src||"";

img.alt=
caption||"รูปภาพเครดิต";

if(text){
text.textContent=
caption||"";
}

modal.classList.add(
"active"
);

modal.setAttribute(
"aria-hidden",
"false"
);

document.body.classList.add(
"credit-modal-open"
);

}

function closeCreditImage(){

const modal=
$("creditImageModal");

const img=
$("creditFullImage");

if(!modal){
return;
}

modal.classList.remove(
"active"
);

modal.setAttribute(
"aria-hidden",
"true"
);

document.body.classList.remove(
"credit-modal-open"
);

if(img){
setTimeout(()=>{
if(
!modal.classList.contains(
"active"
)
){
img.src="";
}
},180);
}

}

window.openCreditImage=
openCreditImage;

window.closeCreditImage=
closeCreditImage;

document.addEventListener(
"keydown",
e=>{
if(
e.key==="Escape"&&
$("creditImageModal")
?.classList.contains(
"active"
)
){
closeCreditImage();
}
}
);

// =====================================================
// EVENTS
// =====================================================

function bindEvents(){

const currentSelect=
$("currentMetric");

if(currentSelect){

currentSelect.value=
currentMetric;

currentSelect.addEventListener(
"change",
()=>{

currentMetric=
currentSelect.value;

updateCurrent();

}
);

}

const metricSelect=
$("metric");

if(metricSelect){

metricSelect.value=
metric;

metricSelect.addEventListener(
"change",
e=>{

metric=
e.target.value;

drawCharts();

}
);

}

$("historyRangeButton")
?.addEventListener(
"click",
e=>{

e.stopPropagation();

const panel=
$("historyRangePanel");

if(!panel){
return;
}

if(
panel.classList.contains(
"hidden"
)
){

openHistoryRangePicker();

}else{

closeHistoryRangePicker();

}

}
);

document
.querySelectorAll(
".quick-range-option"
)
.forEach(
button=>{

button.addEventListener(
"click",
()=>{

setRange(
button.dataset.range
);

}
);

}
);

$("calendarPrev")
?.addEventListener(
"click",
()=>{

calendarDisplayDate=
new Date(
calendarDisplayDate.getFullYear(),
calendarDisplayDate.getMonth()-1,
1
);

renderRangeCalendar();

}
);

$("calendarNext")
?.addEventListener(
"click",
()=>{

calendarDisplayDate=
new Date(
calendarDisplayDate.getFullYear(),
calendarDisplayDate.getMonth()+1,
1
);

renderRangeCalendar();

}
);

$("customRangeStart")
?.addEventListener(
"change",
()=>{

updateQuickRangeUI(
null
);

const d=
dateFromRangeInput(
"customRangeStart"
);

if(d){

calendarDisplayDate=
new Date(
d.getFullYear(),
d.getMonth(),
1
);

}

renderRangeCalendar();

}
);

$("customRangeEnd")
?.addEventListener(
"change",
()=>{

updateQuickRangeUI(
null
);

renderRangeCalendar();

}
);

$("historyRangeApply")
?.addEventListener(
"click",
applyCustomRange
);

$("historyRangeCancel")
?.addEventListener(
"click",
closeHistoryRangePicker
);

$("historyRangePanel")
?.addEventListener(
"click",
e=>
e.stopPropagation()
);

document
.addEventListener(
"click",
e=>{

if(
!$("historyRangePicker")
?.contains(
e.target
)
){

closeHistoryRangePicker();

}

}
);

$("forecastToggle")
?.addEventListener(
"click",
()=>{

forecastVisible=
!forecastVisible;

updateForecastToggle();

}
);

$("aiRefreshButton")
?.addEventListener(
"click",
()=>{

loadAI(
true
);

}
);

$("aiForecastRefreshButton")
?.addEventListener(
"click",
()=>{

loadAIForecast(
true
);

}
);

$("exportButton")
?.addEventListener(
"click",
openExport
);

$("exportModalClose")
?.addEventListener(
"click",
closeExport
);

$("exportCancelButton")
?.addEventListener(
"click",
closeExport
);

/*
  ปิดหน้าต่างส่งออกได้เหมือนตัวเลือกช่วงเวลา:
  - คลิกพื้นที่ว่าง / ฉากหลัง
  - ปุ่ม X
  - ปุ่มยกเลิก
  - ปุ่ม Esc (มี listener ด้านล่าง)
*/
$("exportModal")
?.addEventListener(
"click",
e=>{

const modal=
$("exportModal");

if(
e.target===modal||
e.target?.dataset?.exportClose==="true"||
e.target?.classList?.contains(
"export-modal-backdrop"
)
){

closeExport();

}

}
);

$("exportStartDate")
?.addEventListener(
"change",
refreshExport
);

$("exportEndDate")
?.addEventListener(
"change",
refreshExport
);

$("exportExcelButton")
?.addEventListener(
"click",
downloadExcel
);

document
.addEventListener(
"keydown",
e=>{

if(
e.key==="Escape"
){

closeExport();

closeHelp();

closeCreditImage();

closeHistoryRangePicker();

}

}
);

}


// =====================================================
// INTERACTIVE CHART VIEWER — NO EXTERNAL ZOOM PLUGIN
//
// Uses Chart.js only.
// Desktop:
// - Mouse wheel zoom
// - Drag horizontally to pan
// - Hover tooltip
//
// Mobile / Tablet:
// - Pinch zoom
// - Drag horizontally to pan
// - Tap tooltip
// =====================================================

let chartInteractiveViewerReady=false;
let chartInteractiveInstance=null;

function cloneChartDatasetForViewer(ds){

const copy={
label:ds.label||"ข้อมูล",

data:Array.isArray(ds.data)
?ds.data.map(
v=>(
v&&typeof v==="object"
?{...v}
:v
)
)
:[],

borderColor:ds.borderColor,
backgroundColor:ds.backgroundColor,

borderWidth:Math.max(
Number(ds.borderWidth||2),
2
),

pointRadius:Math.max(
Number(ds.pointRadius||0),
3
),

pointHoverRadius:Math.max(
Number(ds.pointHoverRadius||4),
6
),

pointHitRadius:14,
tension:ds.tension??0.25,
fill:ds.fill??false,
spanGaps:ds.spanGaps??true,
hidden:ds.hidden===true
};

if(Array.isArray(ds.borderDash)){
copy.borderDash=[...ds.borderDash];
}

if(ds.pointBackgroundColor){
copy.pointBackgroundColor=ds.pointBackgroundColor;
}

if(ds.pointBorderColor){
copy.pointBorderColor=ds.pointBorderColor;
}

return copy;

}

function chartViewerTitleForCanvas(canvas){

const metricPanel=
canvas.closest(".metric-chart-panel");

if(metricPanel){

return(
metricPanel.querySelector(".metric-chart-title")
?.textContent?.trim()||
"กราฟข้อมูล"
);

}

const card=
canvas.closest(".dashboard-chart-card");

return(
card?.querySelector(".chart-zone-title")
?.textContent?.trim()||
"กราฟข้อมูล"
);

}

function chartViewerUnitFromOriginal(original){

const text=
original?.options?.scales?.y?.title?.text;

return typeof text==="string"
?text
:"";

}

function setupChartZoomViewer(){

if(chartInteractiveViewerReady){
return;
}

chartInteractiveViewerReady=true;

const viewer=document.createElement("div");

viewer.id="chartZoomViewer";
viewer.className="chart-zoom-viewer";
viewer.setAttribute("aria-hidden","true");

viewer.innerHTML=`
<div class="chart-zoom-backdrop" data-chart-zoom-close="true"></div>

<div class="chart-zoom-dialog" role="dialog" aria-modal="true" aria-label="กราฟแบบโต้ตอบ">

<div class="chart-zoom-toolbar">

<div class="chart-zoom-heading">
<div class="chart-zoom-title" id="chartZoomTitle">กราฟแบบโต้ตอบ</div>
<div class="chart-zoom-help" id="chartZoomHelp">
ช่วงยาวแสดงเป็นรายวัน • ซูมเข้าเพื่อดูเวลา • มือถือใช้สองนิ้วซูม • ลากซ้าย–ขวา
</div>
</div>

<div class="chart-zoom-actions">
<button type="button" id="chartZoomOut" aria-label="ย่อกราฟ" title="ย่อ">−</button>
<button type="button" id="chartZoomReset" aria-label="รีเซ็ตการซูม" title="รีเซ็ต">Reset</button>
<button type="button" id="chartZoomIn" aria-label="ขยายกราฟ" title="ขยาย">+</button>
<button type="button" id="chartZoomClose" class="chart-zoom-close" aria-label="ปิด" title="ปิด">×</button>
</div>

</div>

<div class="chart-zoom-statusbar">
<span>🔎 ซูมช่วงเวลา</span>
<span>↔ ลากเพื่อเลื่อน</span>
<span>● แตะ/ชี้จุดเพื่อดูค่า</span>
</div>

<div class="chart-series-controls" id="chartSeriesControls">
<div class="chart-series-controls-head">
<div>
<div class="chart-series-controls-title">ข้อมูลที่แสดง</div>
<div class="chart-series-controls-help">แตะชื่อข้อมูลเพื่อซ่อนหรือแสดงเส้นกราฟ</div>
</div>
<button type="button" class="chart-series-show-all" id="chartSeriesShowAll">แสดงทั้งหมด</button>
</div>
<div class="chart-series-buttons" id="chartSeriesButtons"></div>
</div>

<div class="chart-zoom-stage" id="chartZoomStage">
<canvas id="chartZoomCanvas"></canvas>
</div>

</div>
`;

document.body.appendChild(viewer);

const stage=$("chartZoomStage");

let labels=[];
let fullMin=0;
let fullMax=0;
let viewMin=0;
let viewMax=0;

let dragging=false;
let dragStartX=0;
let dragStartMin=0;
let dragStartMax=0;

let pinchStartDistance=0;
let pinchStartSpan=0;
let pinchCenterRatio=.5;

function destroyInteractiveChart(){

if(chartInteractiveInstance){

try{
chartInteractiveInstance.destroy();
}catch{}

chartInteractiveInstance=null;

}

}

function clampWindow(){

const total=
fullMax-fullMin;

let span=
viewMax-viewMin;

const minSpan=
Math.max(
2,
Math.min(
6,
total
)
);

if(span<minSpan){
span=minSpan;
}

if(span>total){
span=total;
}

if(viewMin<fullMin){
viewMin=fullMin;
viewMax=viewMin+span;
}

if(viewMax>fullMax){
viewMax=fullMax;
viewMin=viewMax-span;
}

}

function applyWindow(){

if(!chartInteractiveInstance){
return;
}

clampWindow();

chartInteractiveInstance.options.scales.x.min=
Math.floor(viewMin);

chartInteractiveInstance.options.scales.x.max=
Math.ceil(viewMax);

chartInteractiveInstance.update("none");

const total=
Math.max(
1,
fullMax-fullMin
);

const shown=
Math.max(
1,
viewMax-viewMin
);

const percent=
Math.round(
(total/shown)*100
);

const reset=$("chartZoomReset");

if(reset){
reset.textContent=
percent<=105
?"Reset"
:`${percent}%`;
}

}

function zoomAt(factor,ratio=.5){

if(!chartInteractiveInstance){
return;
}

ratio=
Math.min(
1,
Math.max(
0,
ratio
)
);

const span=
viewMax-viewMin;

const newSpan=
span/factor;

const anchor=
viewMin+
span*ratio;

viewMin=
anchor-
newSpan*ratio;

viewMax=
anchor+
newSpan*(1-ratio);

applyWindow();

}

function panBy(deltaIndex){

viewMin+=deltaIndex;
viewMax+=deltaIndex;

applyWindow();

}

function resetZoom(){

viewMin=fullMin;
viewMax=fullMax;

applyWindow();

}

function closeViewer(){

destroyInteractiveChart();

const seriesButtons=
$("chartSeriesButtons");

if(seriesButtons){
seriesButtons.innerHTML="";
}

viewer.classList.remove("active");
viewer.setAttribute("aria-hidden","true");
document.body.classList.remove("chart-zoom-open");

}

function getOriginalChart(canvas){

if(typeof Chart==="undefined"){
return null;
}

if(typeof Chart.getChart==="function"){

const c=
Chart.getChart(canvas);

if(c){
return c;
}

}

const all=[
historyChart,
forecastChart,
...historyGroupCharts,
...forecastGroupCharts
].filter(Boolean);

return all.find(
c=>c.canvas===canvas
)||null;

}


function updateSeriesControlUI(){

const wrap=
$("chartSeriesControls");

const buttons=
$("chartSeriesButtons");

const showAll=
$("chartSeriesShowAll");

if(
!wrap||
!buttons||
!showAll||
!chartInteractiveInstance
){
return;
}

const datasets=
chartInteractiveInstance.data.datasets||[];

if(datasets.length<=1){

wrap.classList.add(
"is-single"
);

buttons.innerHTML="";

showAll.classList.add(
"hidden"
);

const one=
datasets[0];

if(one){

const label=
document.createElement(
"div"
);

label.className=
"chart-series-single-label";

label.textContent=
one.label||
"ข้อมูล";

buttons.appendChild(
label
);

}

return;
}

wrap.classList.remove(
"is-single"
);

showAll.classList.remove(
"hidden"
);

buttons.innerHTML="";

datasets.forEach(
(ds,index)=>{

const button=
document.createElement(
"button"
);

button.type="button";
button.className=
"chart-series-button";

const visible=
chartInteractiveInstance.isDatasetVisible(
index
);

button.classList.toggle(
"is-active",
visible
);

button.classList.toggle(
"is-hidden",
!visible
);

button.setAttribute(
"aria-pressed",
visible
?"true"
:"false"
);

button.dataset.index=
String(
index
);

const mark=
visible
?"✓"
:"";

button.innerHTML=
`<span class="chart-series-check">${mark}</span><span>${esc(ds.label||`ข้อมูล ${index+1}`)}</span>`;

buttons.appendChild(
button
);

}
);

const allVisible=
datasets.every(
(_,index)=>
chartInteractiveInstance.isDatasetVisible(
index
)
);

showAll.disabled=
allVisible;

showAll.classList.toggle(
"is-complete",
allVisible
);

}

function bindSeriesControlEvents(){

const buttons=
$("chartSeriesButtons");

const showAll=
$("chartSeriesShowAll");

buttons?.addEventListener(
"click",
e=>{

const button=
e.target.closest(
".chart-series-button"
);

if(
!button||
!chartInteractiveInstance
){
return;
}

const index=
Number(
button.dataset.index
);

if(
!Number.isInteger(
index
)
){
return;
}

const visible=
chartInteractiveInstance.isDatasetVisible(
index
);

chartInteractiveInstance.setDatasetVisibility(
index,
!visible
);

chartInteractiveInstance.update(
"none"
);

updateSeriesControlUI();

}
);

showAll?.addEventListener(
"click",
()=>{

if(!chartInteractiveInstance){
return;
}

chartInteractiveInstance.data.datasets.forEach(
(_,index)=>{

chartInteractiveInstance.setDatasetVisibility(
index,
true
);

}
);

chartInteractiveInstance.update(
"none"
);

updateSeriesControlUI();

}
);

}

async function openInteractiveChart(canvas){

if(typeof Chart==="undefined"){

try{
await ensureChartLibrary();
}catch{
return;
}

}

const original=
getOriginalChart(canvas);

if(!original){
return;
}

labels=
Array.isArray(original.data.labels)
?[...original.data.labels]
:[];

if(labels.length<2){
return;
}

fullMin=0;
fullMax=
labels.length-1;

viewMin=fullMin;
viewMax=fullMax;

$("chartZoomTitle").textContent=
chartViewerTitleForCanvas(canvas);

viewer.classList.add("active");
viewer.setAttribute("aria-hidden","false");
document.body.classList.add("chart-zoom-open");

destroyInteractiveChart();

const viewerCanvas=$("chartZoomCanvas");

const datasets=
original.data.datasets.map(
cloneChartDatasetForViewer
);

const unit=
chartViewerUnitFromOriginal(original);

const isTouch=
(navigator.maxTouchPoints||0)>0;

chartInteractiveInstance=
new Chart(
viewerCanvas,
{

type:"line",

data:{
labels,
datasets
},

options:{

responsive:true,
maintainAspectRatio:false,
animation:false,
normalized:true,

interaction:{
mode:"nearest",
intersect:false,
axis:"x"
},

layout:{
padding:{
top:8,
right:12,
bottom:8,
left:8
}
},

plugins:{

legend:{
display:false
},

tooltip:{
enabled:true,
mode:"index",
intersect:false,
callbacks:{
title:graphTooltipTitle,
label:graphTooltipLabel
},
backgroundColor:"rgba(2,6,23,.94)",
titleColor:"#f8fafc",
bodyColor:"#e2e8f0",
borderColor:"rgba(103,232,249,.25)",
borderWidth:1,
padding:11,
displayColors:true,
titleFont:{
size:13,
weight:"800"
},
bodyFont:{
size:12
}
}

},

scales:{

x:{
type:"category",
min:fullMin,
max:fullMax,
afterBuildTicks(scale){buildAdaptiveTimeTicks(scale);},

grid:{
color:"rgba(148,163,184,.09)"
},

ticks:{
color:"#94a3b8",
maxRotation:0,
autoSkip:false,
maxTicksLimit:isTouch?8:35,
font:{
size:isTouch?12:12
},
callback:function(value,index,ticks){
return adaptiveChartTickText(this,value,index,ticks);
}
},

border:{
color:"rgba(148,163,184,.16)"
}

},

y:{
beginAtZero:false,

grid:{
color:"rgba(148,163,184,.10)"
},

ticks:{
color:"#94a3b8",
font:{
size:isTouch?12:12
}
},

title:{
display:Boolean(unit),
text:unit,
color:"#94a3b8",
font:{
size:12,
weight:"700"
}
},

border:{
color:"rgba(148,163,184,.16)"
}

}

}

}

}
);

updateSeriesControlUI();

}

document.addEventListener("click",e=>{

const canvas=
e.target?.closest?.(
"#historyChartArea canvas, #forecastChartArea canvas"
);

if(!canvas){
return;
}

openInteractiveChart(canvas);

});

viewer.addEventListener("click",e=>{

if(e.target?.dataset?.chartZoomClose==="true"){
closeViewer();
}

});

$("chartZoomClose")
?.addEventListener("click",closeViewer);

$("chartZoomReset")
?.addEventListener("click",resetZoom);

$("chartZoomIn")
?.addEventListener("click",()=>{
zoomAt(1.5,.5);
});

$("chartZoomOut")
?.addEventListener("click",()=>{
zoomAt(1/1.5,.5);
});

bindSeriesControlEvents();

stage.addEventListener("wheel",e=>{

if(!chartInteractiveInstance){
return;
}

e.preventDefault();

const rect=
stage.getBoundingClientRect();

const ratio=
(e.clientX-rect.left)/
Math.max(
1,
rect.width
);

zoomAt(
e.deltaY<0
?1.25
:0.8,
ratio
);

},{
passive:false
});

stage.addEventListener("mousedown",e=>{

if(!chartInteractiveInstance){
return;
}

dragging=true;
dragStartX=e.clientX;
dragStartMin=viewMin;
dragStartMax=viewMax;

stage.classList.add("is-panning");

});

window.addEventListener("mousemove",e=>{

if(!dragging||!chartInteractiveInstance){
return;
}

const rect=
stage.getBoundingClientRect();

const dx=
e.clientX-dragStartX;

const span=
dragStartMax-dragStartMin;

const shift=
-(dx/Math.max(1,rect.width))*span;

viewMin=
dragStartMin+
shift;

viewMax=
dragStartMax+
shift;

applyWindow();

});

window.addEventListener("mouseup",()=>{

dragging=false;
stage.classList.remove("is-panning");

});

function touchDistance(a,b){

return Math.hypot(
b.clientX-a.clientX,
b.clientY-a.clientY
);

}

stage.addEventListener("touchstart",e=>{

if(!chartInteractiveInstance){
return;
}

if(e.touches.length===2){

pinchStartDistance=
touchDistance(
e.touches[0],
e.touches[1]
);

pinchStartSpan=
viewMax-viewMin;

const rect=
stage.getBoundingClientRect();

const centerX=
(
e.touches[0].clientX+
e.touches[1].clientX
)/2;

pinchCenterRatio=
Math.min(
1,
Math.max(
0,
(centerX-rect.left)/
Math.max(1,rect.width)
)
);

dragging=false;
return;

}

if(e.touches.length===1){

dragging=true;
dragStartX=
e.touches[0].clientX;

dragStartMin=
viewMin;

dragStartMax=
viewMax;

}

},{
passive:true
});

stage.addEventListener("touchmove",e=>{

if(!chartInteractiveInstance){
return;
}

if(e.touches.length===2){

e.preventDefault();

const d=
touchDistance(
e.touches[0],
e.touches[1]
);

if(
pinchStartDistance>0&&
d>0
){

const factor=
d/
pinchStartDistance;

const newSpan=
pinchStartSpan/
factor;

const anchor=
viewMin+
(viewMax-viewMin)*
pinchCenterRatio;

viewMin=
anchor-
newSpan*
pinchCenterRatio;

viewMax=
anchor+
newSpan*
(1-pinchCenterRatio);

applyWindow();

}

return;

}

if(
e.touches.length===1&&
dragging
){

e.preventDefault();

const rect=
stage.getBoundingClientRect();

const dx=
e.touches[0].clientX-
dragStartX;

const span=
dragStartMax-
dragStartMin;

const shift=
-(dx/Math.max(1,rect.width))*span;

viewMin=
dragStartMin+
shift;

viewMax=
dragStartMax+
shift;

applyWindow();

}

},{
passive:false
});

stage.addEventListener("touchend",e=>{

if(e.touches.length<2){
pinchStartDistance=0;
}

if(e.touches.length===0){
dragging=false;
}

});

document.addEventListener("keydown",e=>{

if(
e.key==="Escape"&&
viewer.classList.contains("active")
){
closeViewer();
}

});

}


// =====================================================
// PERFORMANCE — DEFER BELOW-THE-FOLD WORK
// =====================================================

function ensureChartLibrary(){

if(
chartLibraryReady&&
typeof Chart!=="undefined"
){
return Promise.resolve();
}

if(chartLibraryPromise){
return chartLibraryPromise;
}

chartLibraryPromise=
new Promise((resolve,reject)=>{

if(typeof Chart!=="undefined"){
chartLibraryReady=true;
resolve();
return;
}

const s=
document.createElement("script");

s.src=
"https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js";

s.async=true;

s.onload=()=>{
chartLibraryReady=true;
resolve();
};

s.onerror=()=>{
chartLibraryPromise=null;
reject(
new Error("Chart.js load failed")
);
};

document.head.appendChild(s);

});

return chartLibraryPromise;

}

async function activateHistorySection(){

if(historyLoading){
return;
}

historyActivated=true;
historyLoading=true;

try{

records=
await loadHistory();

renderAverages();

await ensureChartLibrary();

drawCharts();

}catch(e){

console.error(
"Deferred history/chart load error:",
e
);

}finally{

historyLoading=false;

}

}

function activateAISection(){

if(aiSectionActivated){
return;
}

aiSectionActivated=true;

loadAI(false);
loadAIForecast(false);

}

function setupDeferredSections(){

const historyTargets=[
document.querySelector(".historical-section"),
document.querySelector(".dashboard-charts-zone")
]
.filter(Boolean);

const aiTarget=
document.querySelector(".ai-intelligence-section");

if(
"IntersectionObserver" in window
){

if(historyTargets.length){

const historyObserver=
new IntersectionObserver(
entries=>{

if(
entries.some(x=>x.isIntersecting)
){
historyObserver.disconnect();
activateHistorySection();
}

},
{
rootMargin:"700px 0px"
}
);

historyTargets.forEach(
x=>historyObserver.observe(x)
);

}

if(aiTarget){

const aiObserver=
new IntersectionObserver(
entries=>{

if(
entries.some(x=>x.isIntersecting)
){
aiObserver.disconnect();
activateAISection();
}

},
{
rootMargin:"500px 0px"
}
);

aiObserver.observe(aiTarget);

}

}else{

setTimeout(
()=>{
activateHistorySection();
activateAISection();
},
1200
);

}

}

// =====================================================
// INITIAL LOAD
// =====================================================

async function loadInitial(){

try{

const[
latest,
mother,
alerts,
standards
]=
await Promise.all([

loadLatest(),

loadMother(),

loadAlerts()
.catch(
()=>[]
),

loadStandards()
.catch(
()=>null
)

]);

apiConnectionOnline=
true;

latestNodes=
latest;

motherStatus=
mother;

alertStates=
alerts;

standardsData=
standards;

latestRecord=
latestNodes.at(-1)||
null;

renderMonitoring();

updateCurrent();

updateSmart();

updateAlertUI();

}catch(e){

console.error(
"Initial load error:",
e
);

apiConnectionOnline=
false;

renderMonitoring();

updateCurrent();

updateSmart();

updateAlertUI();

}

}

// =====================================================
// REALTIME
// =====================================================

async function loadRealtime(){

try{

const[
latest,
mother,
alerts
]=
await Promise.all([

loadLatest(),

loadMother(),

loadAlerts()
.catch(
()=>alertStates
)

]);

apiConnectionOnline=
true;

latestNodes=
latest;

motherStatus=
mother;

alertStates=
alerts;

renderMonitoring();

updateCurrent();

updateSmart();

updateAlertUI();

}catch(e){

console.error(
"Realtime error:",
e
);

apiConnectionOnline=
false;

renderMonitoring();

updateCurrent();

updateSmart();

updateAlertUI();

}

}

// =====================================================
// HISTORY
// =====================================================

async function loadHistorical(){

if(!historyActivated){
return;
}

try{

records=
await loadHistory();

renderAverages();

if(typeof Chart!=="undefined"){
drawCharts();
}

}catch(e){

console.error(
"History error:",
e
);

}

}

// =====================================================
// STANDARDS
// =====================================================

async function loadStandardsOnly(){

try{

standardsData=
await loadStandards();

updateCurrent();

updateSmart();

updateAlertUI();

}catch(e){

console.error(
"Standards error:",
e
);

}

}

// =====================================================
// CLOCK
// =====================================================

function updateClock(){

if(
$("clock")
){

$("clock").textContent=
new Date()
.toLocaleString(
"th-TH",
{
timeZone:
"Asia/Bangkok",
dateStyle:
"medium",
timeStyle:
"medium"
}
);

}

}

// =====================================================
// START
// =====================================================

if(
$("historyRangeButtonLabel")
){

$("historyRangeButtonLabel").textContent=
rangeLabel();

}

updateQuickRangeUI(
averageRange
);

updateForecastToggle();

renderAI(
null
);

renderAIForecast(
null
);

bindEvents();

bindHelp();
setupChartZoomViewer();

setupDeferredSections();

updateClock();

loadInitial();

// =====================================================
// CLOCK
// =====================================================

setInterval(
updateClock,
1000
);

// =====================================================
// REALTIME
// =====================================================

setInterval(
loadRealtime,
10000
);

// =====================================================
// HISTORICAL
// =====================================================

setInterval(
loadHistorical,
60000
);

// =====================================================
// STANDARDS
// =====================================================

setInterval(
loadStandardsOnly,
300000
);

// =====================================================
// LOCAL STATUS REFRESH
// =====================================================

setInterval(
()=>{

renderMonitoring();
updateCurrent();
updateSmart();

},
5000
);

// =====================================================
// NAVIGATION REDESIGN 2026-08-28
// UI-only layer. Existing API, status, history, AI and export logic stay unchanged.
// =====================================================
const DASHBOARD_PAGE_NAMES=new Set(["overview","monitoring","history","analysis","about"]);
let currentDashboardPage="overview";

function getDashboardPageFromHash(){
  const raw=String(location.hash||"").replace(/^#/,"").trim().toLowerCase();
  return DASHBOARD_PAGE_NAMES.has(raw)?raw:"overview";
}

function openDashboardPage(page,{updateHash=true}={}){
  page=DASHBOARD_PAGE_NAMES.has(page)?page:"overview";
  currentDashboardPage=page;
  document.querySelectorAll("[data-dashboard-page-panel]").forEach(panel=>{
    panel.classList.toggle("active",panel.dataset.dashboardPagePanel===page);
  });
  document.querySelectorAll("[data-dashboard-page]").forEach(btn=>{
    const active=btn.dataset.dashboardPage===page;
    btn.classList.toggle("active",active);
    btn.setAttribute("aria-current",active?"page":"false");
  });
  const links=$("dashboardNavLinks");
  const toggle=$("dashboardMobileToggle");
  if(links) links.classList.remove("open");
  if(toggle) toggle.setAttribute("aria-expanded","false");
  if(updateHash){
    const next="#"+page;
    if(location.hash!==next) history.replaceState(null,"",next);
  }
  if(page==="history" && typeof activateHistorySection==="function") activateHistorySection();
  if(page==="analysis" && typeof activateAISection==="function") activateAISection();
  if((page==="history"||page==="analysis") && typeof Chart!=="undefined"){
    setTimeout(()=>{
      try{
        if(historyChart) historyChart.resize();
        if(forecastChart) forecastChart.resize();
        historyGroupCharts.forEach(c=>c?.resize?.());
        forecastGroupCharts.forEach(c=>c?.resize?.());
      }catch(e){}
    },120);
  }
  window.scrollTo({top:0,behavior:"smooth"});
}

function dashboardAlertCount(){
  const box=$("alerts");
  if(!box) return 0;
  const text=(box.textContent||"").trim();
  if(!text || /กำลังตรวจสอบ|ไม่พบ|ปกติ|ไม่มี.*เตือน/i.test(text)) return 0;
  const explicit=box.querySelectorAll(".alert-item,.alert-row,[data-alert]").length;
  return explicit||1;
}

function latestActiveNodes(){
  return [1,2,3].map(getNode).filter(n=>n && ["online","sleep"].includes(getNodeStatus(n)));
}

function averageLatestField(field){
  const values=latestActiveNodes().map(n=>finiteNumberOrNull(n[field])).filter(v=>v!==null);
  if(!values.length) return null;
  return values.reduce((a,b)=>a+b,0)/values.length;
}

function newestNodeTime(){
  const dates=latestNodes.map(n=>parseDate(n?.timestamp||n?.reading_recorded_at||n?.status_recorded_at||n?.last_seen)).filter(Boolean);
  if(!dates.length) return null;
  return new Date(Math.max(...dates.map(d=>d.getTime())));
}

function overviewAdvice(pm25){
  const g=pm25Guidance(pm25);
  if(g.level==="no_data") return "ยังไม่มีข้อมูลเพียงพอสำหรับสรุปคุณภาพอากาศ";
  if(g.level==="critical") return "คุณภาพอากาศอยู่ในระดับที่ควรลดกิจกรรมกลางแจ้งและติดตามสถานการณ์อย่างใกล้ชิด";
  if(g.level==="warning") return "ควรเฝ้าระวังฝุ่น PM2.5 โดยเฉพาะผู้ที่ไวต่อมลพิษทางอากาศ";
  if(g.label==="ปานกลาง") return "คุณภาพอากาศโดยรวมอยู่ในระดับปานกลาง สามารถติดตามกิจกรรมได้ตามความเหมาะสม";
  return "คุณภาพอากาศโดยรวมอยู่ในระดับดี สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ";
}

function updateNavigationDashboard(){
  const pm25=averageLatestField("pm25");
  const temp=averageLatestField("temperature");
  const hum=averageLatestField("humidity");
  const guide=pm25Guidance(pm25);
  const active=activeCount();

  if($("overviewPM25")) $("overviewPM25").textContent=pm25===null?"--":fmt(pm25);
  if($("overviewTemp")) $("overviewTemp").textContent=temp===null?"--":fmt(temp);
  if($("overviewHumidity")) $("overviewHumidity").textContent=hum===null?"--":fmt(hum);
  if($("overviewActiveNodes")) $("overviewActiveNodes").textContent=`${active} / ${TOTAL_NODES}`;
  if($("overviewGuidance")) $("overviewGuidance").textContent=overviewAdvice(pm25);

  const qb=$("overviewQualityBadge");
  if(qb){
    qb.textContent=guide.label||"รอข้อมูล";
    qb.className="overview-quality-badge "+(guide.level==="critical"?"is-critical":guide.level==="warning"?"is-warning":guide.level==="normal"?"is-normal":"is-waiting");
  }

  const newest=newestNodeTime();
  if($("overviewLastUpdated")){
    $("overviewLastUpdated").textContent=newest?`ข้อมูลล่าสุด ${newest.toLocaleTimeString("th-TH",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})} น.`:"อัปเดตล่าสุด: --";
  }

  for(let i=1;i<=3;i++){
    const node=getNode(i);
    const st=getNodeDisplayStatus(node);
    const dot=$("overviewNodeDot"+i);
    const label=$("overviewNodeStatus"+i);
    if(dot) dot.className=`overview-node-dot ${st}`;
    if(label){
      const t=node?.timestamp?thaiTime(node.timestamp):"--";
      label.textContent=st==="online"?`ONLINE • ${t}`:"OFFLINE";
    }
  }

  const systemOnline=apiConnectionOnline && motherOnline();
  const navDot=$("navSystemDot");
  const navText=$("navSystemStatus");
  if(navDot) navDot.className=`dashboard-system-dot ${systemOnline?"is-online":"is-offline"}`;
  if(navText) navText.textContent=!apiConnectionOnline?"API ขัดข้อง":systemOnline?`ระบบปกติ • ${active}/${TOTAL_NODES}`:"สถานีรับข้อมูลหลักขาดการเชื่อมต่อ";

  const sourceAlerts=$("alerts");
  const overviewAlerts=$("overviewAlerts");
  if(sourceAlerts&&overviewAlerts) overviewAlerts.innerHTML=sourceAlerts.innerHTML;
  const count=dashboardAlertCount();
  const badge=$("navAlertBadge");
  if(badge){
    badge.textContent=String(count);
    badge.classList.toggle("hidden",count===0);
  }
}

function bindDashboardNavigation(){
  document.querySelectorAll("[data-dashboard-page]").forEach(btn=>btn.addEventListener("click",()=>openDashboardPage(btn.dataset.dashboardPage)));
  document.querySelectorAll("[data-go-page]").forEach(btn=>btn.addEventListener("click",()=>openDashboardPage(btn.dataset.goPage)));
  document.querySelectorAll("[data-node-jump]").forEach(btn=>btn.addEventListener("click",()=>{
    const n=btn.dataset.nodeJump;
    openDashboardPage("monitoring");
    setTimeout(()=>{
      const card=$("nodeCard"+n);
      if(!card) return;
      card.scrollIntoView({behavior:"smooth",block:"center"});
      card.classList.remove("navigation-highlight");
      void card.offsetWidth;
      card.classList.add("navigation-highlight");
      setTimeout(()=>card.classList.remove("navigation-highlight"),1700);
    },180);
  }));
  const toggle=$("dashboardMobileToggle");
  const links=$("dashboardNavLinks");
  if(toggle&&links) toggle.addEventListener("click",()=>{
    const open=links.classList.toggle("open");
    toggle.setAttribute("aria-expanded",open?"true":"false");
  });
  window.addEventListener("hashchange",()=>openDashboardPage(getDashboardPageFromHash(),{updateHash:false}));
  openDashboardPage(getDashboardPageFromHash(),{updateHash:false});
}

bindDashboardNavigation();
updateNavigationDashboard();
setInterval(updateNavigationDashboard,2000);
