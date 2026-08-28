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
let historyNode="compare";
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

function chartAxisStepMs(spanMs){
const MINUTE=60*1000;
const HOUR=60*MINUTE;
const DAY=24*HOUR;
if(!Number.isFinite(spanMs))return HOUR;
if(spanMs>=3*DAY)return DAY;
if(spanMs>=6*HOUR)return HOUR;
if(spanMs>=HOUR)return 30*MINUTE;
if(spanMs>=30*MINUTE)return 15*MINUTE;
if(spanMs>=10*MINUTE)return 5*MINUTE;
return MINUTE;
}

function formatAxisInterval(value,spanMs=null){
const d=parseDate(value);
if(!d)return String(value??"");
const DAY=24*60*60*1000;
if(Number.isFinite(spanMs)&&spanMs>=3*DAY){
return d.toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",day:"2-digit",month:"short"});
}

const step=chartAxisStepMs(spanMs);
const BKK_OFFSET=7*60*60*1000;
const localMs=d.getTime()+BKK_OFFSET;
const startLocal=Math.floor(localMs/step)*step;
const endLocal=startLocal+step;
const fmtHM=(ms)=>{
const x=new Date(ms);
return `${String(x.getUTCHours()).padStart(2,"0")}:${String(x.getUTCMinutes()).padStart(2,"0")}`;
};
const timeRange=`${fmtHM(startLocal)}–${fmtHM(endLocal)}`;

if(Number.isFinite(spanMs)&&spanMs>=24*60*60*1000){
const startUtc=new Date(startLocal-BKK_OFFSET);
const day=startUtc.toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",day:"2-digit",month:"short"});
return `${day} ${timeRange}`;
}
return timeRange;
}

function chartTickText(value,spanMs=null){
return formatAxisInterval(value,spanMs);
}

// =====================================================
// ADAPTIVE INTERVAL TICKS
// แกน X แสดงเป็น "ช่วงเวลา" ที่ลงตัว เช่น 01:00–02:00
// ซูมเข้าแล้วลดช่วงเป็น 30 นาที / 15 นาที / 5 นาที / 1 นาที
// =====================================================
function chartBucketKey(date,stepMs){
const d=parseDate(date);
if(!d)return"";
return String(Math.floor(d.getTime()/stepMs));
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
const DAY=24*60*60*1000;
const stepMs=chartAxisStepMs(span);
const mode=span>=3*DAY?"day":"bucket";

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

const scaleWidth=Math.max(1,Number(scale?.width||scale?.chart?.width||0));
const minGapPx=mode==="day"?82:(span>=24*60*60*1000?112:92);
const maxTicksByWidth=Math.max(2,Math.floor(scaleWidth/minGapPx));
const hardMax=window.innerWidth<=640?5:mode==="day"?10:12;
const maxTicks=Math.max(2,Math.min(hardMax,maxTicksByWidth));

let reduced=chosen;
if(chosen.length>maxTicks){
const stride=Math.ceil(chosen.length/maxTicks);
reduced=chosen.filter((_,i)=>i%stride===0);
}

const pixelSafe=[];
let lastPx=-Infinity;
const axisSpan=Math.max(1,maxIndex-minIndex);
for(const tick of reduced){
const px=((Number(tick.value)-minIndex)/axisSpan)*scaleWidth;
if(px-lastPx>=minGapPx||pixelSafe.length===0){
pixelSafe.push(tick);
lastPx=px;
}
}
scale.ticks=pixelSafe;
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
// กราฟย่อยบน Desktop มี canvas แคบกว่าหน้าจอมาก จึงใช้ +10/+20/+30 แบบสั้น
// ส่วนกราฟใหญ่ยังแสดง +10 นาที / +20 นาที / +30 นาทีเต็ม
if(/^\+\d+\s*นาที/.test(text)){
return width<760?text.replace(" นาที",""):text;
}

const d=parseDate(raw);
if(!d)return text;

// จำนวน label ของข้อมูลจริงอิงจากความกว้างของ canvas จริง
// ไม่ใช้แค่ความกว้างหน้าจอ เพราะกราฟ 1/3 บน Desktop ก็อาจแคบได้
let actualLabelCount=4;
if(width<520)actualLabelCount=2;
else if(width<760)actualLabelCount=3;

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
title:{
display:true,
text:"เวลา  •  +10 / +20 / +30 = นาทีข้างหน้า",
font:{size:Math.max(10,chartFontSize()-2),weight:"500"},
padding:{top:4}
},
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

const HISTORY_NODES=["Number 1","Number 2","Number 3"];
const HISTORY_NODE_COLORS={
"Number 1":"#22d3ee",
"Number 2":"#a78bfa",
"Number 3":"#f59e0b"
};

function historyNodeLabel(id){
const m=String(id??"").match(/(\d+)/);
return m?`จุดตรวจวัด ${m[1]}`:String(id??"");
}

function historyRowsForNode(rows,nodeId){
return (rows||[]).filter(r=>String(r?.device_id??"").trim()===nodeId);
}

function historyDisplayRows(rows){
// compare และ average ต้องเห็นข้อมูลดิบของทั้ง 3 จุดก่อน
// แล้วค่อยแยกเส้นหรือคำนวณค่าเฉลี่ยพื้นที่ในขั้นสร้างกราฟ
if(historyNode==="compare"||historyNode==="average")return rows||[];
return historyRowsForNode(rows,historyNode);
}

function makeNodeDataset(nodeId,field,values){
return{
label:historyNodeLabel(nodeId),
metricField:field,
rawValues:values,
data:values,
borderColor:HISTORY_NODE_COLORS[nodeId]||metricColor(field),
backgroundColor:"transparent",
borderWidth:2,
pointRadius:values.length>50?0:2,
tension:.14,
spanGaps:true,
cubicInterpolationMode:"monotone"
};
}

function buildNodeComparisonData(rows,field){
const byNode={};
const labelSet=new Set();
for(const nodeId of HISTORY_NODES){
const map=new Map();
for(const r of historyRowsForNode(rows,nodeId)){
const d=parseDate(r?.timestamp);
const v=finiteNumberOrNull(r?.[field]);
if(!d||v===null)continue;
const key=d.toISOString();
map.set(key,v);
labelSet.add(key);
}
byNode[nodeId]=map;
}
const labels=[...labelSet].sort((a,b)=>parseDate(a)-parseDate(b));
const w=rangeWindow();
if(w&&labels.length){
const last=parseDate(labels.at(-1));
if(!last||w.end-last>1000)labels.push(w.end.toISOString());
}
const datasets=HISTORY_NODES.map(nodeId=>{
const map=byNode[nodeId];
const vals=labels.map(label=>map.has(label)?map.get(label):null);
return makeNodeDataset(nodeId,field,vals);
});
return{labels,datasets};
}

function spatialAverageRows(rows,fields=GRAPH_FIELDS,bucketMs=5*60*1000){
// IMPORTANT:
// อุปกรณ์ทั้ง 3 จุดส่งข้อมูลของใครของมันมายังระบบ
// จึงห้ามเอา "ทุกแถว" ใน bucket มาหารรวมโดยตรง เพราะจุดที่ส่งถี่กว่า
// จะมีน้ำหนักมากกว่าจุดอื่นโดยไม่ตั้งใจ
//
// วิธีที่ใช้:
// 1) แบ่งข้อมูลตามช่วงเวลา (time bucket)
// 2) ในแต่ละ bucket หาเฉลี่ยของ "แต่ละจุด" ก่อน
// 3) เอาค่าเฉลี่ยของจุดที่มีข้อมูลจริงมาเฉลี่ยอีกครั้งแบบให้น้ำหนักเท่ากัน
// ไม่มีข้อมูล = ไม่นับเป็น 0
const buckets=new Map();
const validNodes=new Set(HISTORY_NODES);

for(const r of rows||[]){
const d=parseDate(r?.timestamp);
const nodeId=String(r?.device_id??"").trim();
if(!d||!validNodes.has(nodeId))continue;

const key=Math.floor(d.getTime()/bucketMs)*bucketMs;
if(!buckets.has(key)){
buckets.set(key,{timestamp:new Date(key).toISOString(),nodes:{}});
}
const bucket=buckets.get(key);
if(!bucket.nodes[nodeId])bucket.nodes[nodeId]={};

for(const field of fields){
const v=finiteNumberOrNull(r?.[field]);
if(v===null)continue;
if(!bucket.nodes[nodeId][field])bucket.nodes[nodeId][field]=[];
bucket.nodes[nodeId][field].push(v);
}
}

return [...buckets.entries()]
.sort((a,b)=>a[0]-b[0])
.map(([,bucket])=>{
const out={timestamp:bucket.timestamp,device_id:"AREA_AVG",status:"online",active_nodes:0};
const nodesWithAny=new Set();

for(const field of fields){
const nodeMeans=[];
for(const nodeId of HISTORY_NODES){
const vals=bucket.nodes?.[nodeId]?.[field]||[];
if(!vals.length)continue;
const nodeMean=vals.reduce((sum,v)=>sum+v,0)/vals.length;
nodeMeans.push(nodeMean);
nodesWithAny.add(nodeId);
}
out[field]=nodeMeans.length
?nodeMeans.reduce((sum,v)=>sum+v,0)/nodeMeans.length
:null;
}

out.active_nodes=nodesWithAny.size;
return out;
})
.filter(hasAnySensorData);
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
if(area)area.innerHTML='<div class="chart-empty">กำลังเตรียมกราฟ...</div>';
if(historyActivated){
ensureChartLibrary().then(()=>drawCharts()).catch(e=>console.error("Chart load error:",e));
}
return;
}

const allBase=selectedRecords()
.filter(r=>parseDate(r.timestamp))
.sort((a,b)=>parseDate(a.timestamp)-parseDate(b.timestamp));
const base=historyDisplayRows(allBase);
const compareMode=historyNode==="compare";
const averageMode=historyNode==="average";
const areaAverageBase=averageMode?spatialAverageRows(allBase):[];

if($("selectedMetricLabel")){
const nodeText=compareMode
?"แยก 3 จุด"
:averageMode
?"ค่าเฉลี่ยพื้นที่"
:historyNodeLabel(historyNode);
$("selectedMetricLabel").textContent=`${metricLabel()} • ${nodeText}`;
}

historyGroupCharts=destroyChartList(historyGroupCharts);
destroyChartSafe(historyChart);
historyChart=null;
const area=$("historyChartArea");
if(!area)return;

historyRangeCaption(averageMode?(areaAverageBase.length?areaAverageBase:allBase):(base.length?base:allBase));

if(!base.length){
area.innerHTML='<div class="chart-empty">ไม่มีข้อมูลในช่วงเวลาที่เลือก</div>';
["trendAvg","trendMax","trendMin","trendLast"].forEach(id=>{if($(id))$(id).textContent="--";});
if($("trend"))$("trend").textContent="ไม่มีข้อมูลในช่วงเวลาที่เลือก";
drawForecast([]);
return;
}

// ALL + ค่าเฉลี่ยพื้นที่: 6 กราฟ ตัวแปรละ 1 เส้น
// ค่าในแต่ละช่วงคำนวณแบบ "เฉลี่ยแต่ละจุดก่อน แล้วจึงเฉลี่ยพื้นที่"
// เพื่อไม่ให้จุดที่ส่งข้อมูลถี่กว่ามีน้ำหนักมากกว่า
if(metric==="all"&&averageMode){
const avgBase=areaAverageBase;
if(!avgBase.length){
area.innerHTML='<div class="chart-empty">ไม่มีข้อมูลสำหรับคำนวณค่าเฉลี่ยพื้นที่ในช่วงเวลาที่เลือก</div>';
["trendAvg","trendMax","trendMin","trendLast"].forEach(id=>{if($(id))$(id).textContent="--";});
if($("trend"))$("trend").textContent="ไม่มีข้อมูล";
drawForecast([]);
return;
}

if($("trendAvg"))$("trendAvg").textContent="—";
if($("trendMax"))$("trendMax").textContent="—";
if($("trendMin"))$("trendMin").textContent="—";
if($("trendLast"))$("trendLast").textContent="—";
if($("trend"))$("trend").textContent="ค่าเฉลี่ยพื้นที่จากจุดที่มีข้อมูลจริง";

area.innerHTML=`<div class="metric-chart-grid-3">`+
groupedChartShell("PM1.0","ค่าเฉลี่ยพื้นที่","historyPm1",miniLegend(["pm1"]))+
groupedChartShell("PM2.5","ค่าเฉลี่ยพื้นที่","historyPm25",miniLegend(["pm25"]))+
groupedChartShell("PM10","ค่าเฉลี่ยพื้นที่","historyPm10",miniLegend(["pm10"]))+
groupedChartShell("อุณหภูมิ","ค่าเฉลี่ยพื้นที่ • °C","historyTemp",miniLegend(["temperature"]))+
groupedChartShell("ความชื้น","ค่าเฉลี่ยพื้นที่ • %","historyHumidity",miniLegend(["humidity"]))+
groupedChartShell("แสง","ค่าเฉลี่ยพื้นที่ • lux","historyLight",miniLegend(["light"]))+`</div>`;

const createAverage=(canvasId,field,yTitle)=>{
const arr=avgBase.filter(r=>hasFiniteSensorValue(r[field]));
const labels=historyLabelsToRangeEnd(arr);
const vals=arr.map(r=>finiteNumberOrNull(r[field]));
const c=new Chart($(canvasId),{
type:"line",
data:{labels,datasets:[makeActualDataset(field,padChartValuesToLabels(vals,labels))]},
options:groupedChartOptions(yTitle)
});
historyGroupCharts.push(c);
};
createAverage("historyPm1","pm1","µg/m³");
createAverage("historyPm25","pm25","µg/m³");
createAverage("historyPm10","pm10","µg/m³");
createAverage("historyTemp","temperature","°C");
createAverage("historyHumidity","humidity","%");
createAverage("historyLight","light","lux");

drawForecast(avgBase);
return;
}

// ALL + เปรียบเทียบ 3 จุด: แยกเป็น 6 กราฟ ตัวแปรละ 1 กราฟ และในแต่ละกราฟมี 3 เส้นตามสถานที่
if(metric==="all"&&compareMode){
if($("trendAvg"))$("trendAvg").textContent="—";
if($("trendMax"))$("trendMax").textContent="—";
if($("trendMin"))$("trendMin").textContent="—";
if($("trendLast"))$("trendLast").textContent="—";
if($("trend"))$("trend").textContent="แยกเส้นตาม 3 จุด";

area.innerHTML=`<div class="metric-chart-grid-3">`+
groupedChartShell("PM1.0","เปรียบเทียบ 3 จุด","historyPm1",miniLegend([]))+
groupedChartShell("PM2.5","เปรียบเทียบ 3 จุด","historyPm25",miniLegend([]))+
groupedChartShell("PM10","เปรียบเทียบ 3 จุด","historyPm10",miniLegend([]))+
groupedChartShell("อุณหภูมิ","เปรียบเทียบ 3 จุด • °C","historyTemp",miniLegend([]))+
groupedChartShell("ความชื้น","เปรียบเทียบ 3 จุด • %","historyHumidity",miniLegend([]))+
groupedChartShell("แสง","เปรียบเทียบ 3 จุด • lux","historyLight",miniLegend([]))+`</div>`;

const createCompare=(canvasId,field,yTitle)=>{
const data=buildNodeComparisonData(base,field);
const c=new Chart($(canvasId),{
type:"line",data,
options:{...groupedChartOptions(yTitle),plugins:{legend:graphLegendOptions(),tooltip:{callbacks:{title:graphTooltipTitle,label:graphTooltipLabel}}}}
});
historyGroupCharts.push(c);
};
createCompare("historyPm1","pm1","µg/m³");
createCompare("historyPm25","pm25","µg/m³");
createCompare("historyPm10","pm10","µg/m³");
createCompare("historyTemp","temperature","°C");
createCompare("historyHumidity","humidity","%");
createCompare("historyLight","light","lux");

drawForecast(spatialAverageRows(base));
return;
}

// ALL + จุดเดียว: คงรูปแบบเดิม แต่ข้อมูลทุกเส้นมาจากจุดเดียวกันเท่านั้น
if(metric==="all"){
if($("trendAvg"))$("trendAvg").textContent="—";
if($("trendMax"))$("trendMax").textContent="—";
if($("trendMin"))$("trendMin").textContent="—";
if($("trendLast"))$("trendLast").textContent="—";
if($("trend"))$("trend").textContent=historyNodeLabel(historyNode);

area.innerHTML=
groupedChartShell("ฝุ่นละออง",`${historyNodeLabel(historyNode)} • PM1.0 • PM2.5 • PM10`,"historyDust",miniLegend(["pm1","pm25","pm10"]))+
`<div class="metric-chart-grid-3">`+
groupedChartShell("อุณหภูมิ",`${historyNodeLabel(historyNode)} • °C`,"historyTemp",miniLegend(["temperature"]))+
groupedChartShell("ความชื้น",`${historyNodeLabel(historyNode)} • %`,"historyHumidity",miniLegend(["humidity"]))+
groupedChartShell("แสง",`${historyNodeLabel(historyNode)} • lux`,"historyLight",miniLegend(["light"]))+
`</div>`;

const labels=historyLabelsToRangeEnd(base);
const create=(canvasId,fields,yTitle)=>{
const datasets=fields.map(field=>{
const vals=base.map(r=>finiteNumberOrNull(r[field]));
return makeActualDataset(field,padChartValuesToLabels(vals,labels));
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

const sourceRows=averageMode?areaAverageBase:base;
const chartRows=sourceRows.filter(r=>hasFiniteSensorValue(r[metric]));
const summaryRows=compareMode?spatialAverageRows(base,[metric]):chartRows;
const summaryValues=summaryRows.map(r=>finiteNumberOrNull(r[metric])).filter(v=>v!==null);
const s=stats(summaryRows,metric);

if($("trendAvg"))$("trendAvg").textContent=s.avg==null?"--":fmt(s.avg);
if($("trendMax"))$("trendMax").textContent=s.max==null?"--":fmt(s.max);
if($("trendMin"))$("trendMin").textContent=s.min==null?"--":fmt(s.min);
if($("trendLast"))$("trendLast").textContent=s.last==null?"--":fmt(s.last);
if($("trend")){
const diff=summaryValues.length?summaryValues.at(-1)-summaryValues[0]:0;
const pct=summaryValues[0]?diff/Math.abs(summaryValues[0])*100:0;
const trendText=!summaryValues.length?"ไม่มีข้อมูล":Math.abs(pct)<1?"→ คงที่":diff>0?"↑ เพิ่มขึ้น":"↓ ลดลง";
$("trend").textContent=averageMode&&trendText!=="ไม่มีข้อมูล"?`${trendText} • ค่าเฉลี่ยพื้นที่`:trendText;
}

if(compareMode){
const data=buildNodeComparisonData(base.filter(r=>hasFiniteSensorValue(r[metric])),metric);
historyChart=new Chart($("historyChart"),{
type:"line",data,
options:{...groupedChartOptions(`${metricLabel()} ${metricUnit()}`.trim()),plugins:{legend:graphLegendOptions(),tooltip:{callbacks:{title:graphTooltipTitle,label:graphTooltipLabel}}}}
});
drawForecast(summaryRows);
}else{
const values=chartRows.map(r=>finiteNumberOrNull(r[metric]));
const labels=historyLabelsToRangeEnd(chartRows);
historyChart=new Chart($("historyChart"),{
type:"line",
data:{labels,datasets:[makeActualDataset(metric,padChartValuesToLabels(values,labels))]},
options:{...groupedChartOptions(`${metricLabel()} ${metricUnit()}`.trim()),plugins:{legend:graphLegendOptions(),tooltip:{callbacks:{title:graphTooltipTitle,label:graphTooltipLabel}}}}
});
drawForecast(chartRows);
}
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
<div class="help-intro-card"><b>ดูตรงนี้เมื่ออยากรู้ว่าแต่ละจุดเป็นอย่างไร</b><span>แต่ละจุดแสดงข้อมูลล่าสุดของตำแหน่งนั้นเอง ค่าของแต่ละจุดจึงไม่จำเป็นต้องเท่ากัน</span></div>
<section class="help-section">
<h4>อ่านสถานะอย่างไร?</h4>
<div class="help-simple-grid">
<div><b>ใช้งานได้</b><span>มีข้อมูลจากจุดตรวจวัดให้ระบบนำมาแสดงผล</span></div>
<div><b>ไม่สามารถติดต่อได้</b><span>ยังไม่ควรใช้ค่าของจุดนั้นเป็นตัวแทนสถานการณ์ปัจจุบัน</span></div>
</div>
</section>
<section class="help-section">
<h4>ทำไมแต่ละจุดมีค่าไม่เท่ากัน?</h4>
<p>เพราะแต่ละจุดอยู่คนละตำแหน่ง สภาพแวดล้อมโดยรอบจึงอาจแตกต่างกัน เช่น การจราจร ลม กิจกรรมในบริเวณใกล้เคียง หรือสภาพพื้นที่ การมีค่าต่างกันไม่ได้หมายความว่าข้อมูลผิดเสมอไป</p>
</section>
<div class="help-tip"><b>แนะนำ</b><span>หากจุดใดมีค่าสูงกว่าจุดอื่น ให้เปิดกราฟย้อนหลังของจุดนั้นเพื่อดูว่าค่าสูงเพียงช่วงสั้น ๆ หรือมีแนวโน้มต่อเนื่อง</span></div>`
},

smartSummary:{
title:"✦ สรุปสถานการณ์",
html:`
<div class="help-intro-card"><b>ส่วนนี้ช่วยตอบว่า “ตอนนี้ควรรู้อะไรบ้าง?”</b><span>สรุปข้อมูลหลายส่วนให้เป็นภาษาที่อ่านง่าย เพื่อให้เห็นภาพรวมโดยไม่ต้องไล่อ่านตัวเลขทุกช่อง</span></div>
<section class="help-section">
<h4>ควรใช้สรุปนี้อย่างไร?</h4>
<p>ใช้เป็นจุดเริ่มต้นในการดูสถานการณ์ แล้วเปิดดูข้อมูลรายจุดหรือกราฟย้อนหลังเมื่อพบสิ่งที่ควรสนใจ</p>
</section>
<section class="help-section">
<h4>คำแนะนำกิจกรรมกลางแจ้งหมายถึงอะไร?</h4>
<p>เป็นคำแนะนำเพื่อช่วยตัดสินใจเบื้องต้นจากสภาพแวดล้อมที่ระบบกำลังแสดง ไม่ใช่คำวินิจฉัยทางการแพทย์ และผู้ที่มีความไวต่อมลพิษหรือความร้อนควรใช้ความระมัดระวังเพิ่มเติมตามสภาพร่างกายของตนเอง</p>
</section>
<div class="help-tip"><b>จำง่าย ๆ</b><span>สรุปสถานการณ์ = ภาพรวม • จุดตรวจวัด = รายพื้นที่ • กราฟย้อนหลัง = ดูการเปลี่ยนแปลงตามเวลา</span></div>`
},

currentAir:{
title:"📍 เปรียบเทียบจุดตรวจวัด",
html:`
<div class="help-intro-card"><b>ใช้ส่วนนี้เพื่อเปรียบเทียบพื้นที่</b><span>ช่วยให้เห็นว่าจุดใดมีค่ามากหรือน้อยกว่าจุดอื่นในตัวแปรที่เลือก</span></div>
<section class="help-section">
<h4>“ค่าเฉลี่ยพื้นที่” คืออะไร?</h4>
<p>เป็นค่าภาพรวมจากจุดที่มีข้อมูลในช่วงเวลานั้น เหมาะสำหรับดูสถานการณ์โดยรวมของพื้นที่ แต่ไม่ควรใช้แทนค่าของจุดใดจุดหนึ่ง</p>
<div class="help-warning">แม้ค่าเฉลี่ยพื้นที่จะอยู่ในระดับปกติ บางจุดอาจมีค่าสูงกว่าค่าเฉลี่ย จึงควรดูข้อมูลรายจุดร่วมด้วย</div>
</section>
<section class="help-section">
<h4>“จุดที่ค่าสูงที่สุด” หมายถึงอันตรายที่สุดหรือไม่?</h4>
<p>ไม่จำเป็น ช่องนี้บอกเพียงว่าจุดใดมีตัวเลขสูงที่สุดเมื่อเทียบกัน การตีความความเสี่ยงต้องดูชนิดของข้อมูลและเกณฑ์อ้างอิงประกอบ</p>
</section>`
},

alerts:{
title:"⚠ สิ่งที่ควรระวัง",
html:`
<div class="help-intro-card"><b>ส่วนนี้รวบรวมเรื่องที่ควรให้ความสนใจ</b><span>มีไว้เพื่อช่วยให้ผู้ใช้เห็นเหตุสำคัญได้เร็ว โดยไม่ต้องตรวจทุกช่องด้วยตนเอง</span></div>
<section class="help-section">
<h4>เห็นข้อความเตือนแล้วควรทำอะไร?</h4>
<ol class="help-steps">
<li><span>1</span><div><b>ดูว่าเป็นจุดใด</b><small>ตรวจข้อมูลรายจุดก่อน</small></div></li>
<li><span>2</span><div><b>ดูค่าปัจจุบัน</b><small>ดูระดับและชนิดของข้อมูลที่ถูกเตือน</small></div></li>
<li><span>3</span><div><b>เปิดกราฟย้อนหลัง</b><small>ตรวจว่าค่าสูงชั่วคราวหรือมีแนวโน้มต่อเนื่อง</small></div></li>
</ol>
</section>
<div class="help-warning">การแจ้งเตือนจากค่าปัจจุบันเป็นการเฝ้าระวังเบื้องต้น ไม่ควรตีความแทนค่าเฉลี่ยตามช่วงเวลาที่มาตรฐานกำหนด</div>`
},

historical:{
title:"📊 สถิติย้อนหลังและกราฟ",
html:`
<div class="help-intro-card"><b>ใช้กราฟเพื่อดูว่า “ข้อมูลเปลี่ยนไปอย่างไรตามเวลา”</b><span>เลือกจุดตรวจวัด ตัวแปร และช่วงเวลาที่ต้องการ แล้วเปรียบเทียบแนวโน้มได้โดยไม่ปะปนข้อมูลคนละพื้นที่เป็นเส้นเดียว</span></div>
<section class="help-section">
<h4>ตัวเลือก “จุดตรวจวัด” ต่างกันอย่างไร?</h4>
<div class="help-choice-list">
<div><b>เปรียบเทียบ 3 จุด</b><span>แสดงแต่ละจุดเป็นคนละเส้น เหมาะสำหรับดูความแตกต่างระหว่างพื้นที่</span></div>
<div><b>ค่าเฉลี่ยพื้นที่</b><span>แสดงเส้นภาพรวมของพื้นที่ เหมาะสำหรับดูแนวโน้มโดยรวม</span></div>
<div><b>จุดตรวจวัด 1 / 2 / 3</b><span>แสดงเฉพาะจุดที่เลือก เหมาะสำหรับตรวจสอบพื้นที่ใดพื้นที่หนึ่งโดยละเอียด</span></div>
</div>
</section>
<section class="help-section">
<h4>ถ้าเลือก “ALL” จะเกิดอะไรขึ้น?</h4>
<p>Dashboard จะแยกข้อมูลแต่ละประเภทเป็นคนละกราฟ เพื่อไม่ให้ข้อมูลที่มีหน่วยต่างกันถูกรวมจนอ่านยาก หากเลือกเปรียบเทียบ 3 จุด แต่ละกราฟจะแสดง 3 เส้นแยกตามจุดตรวจวัด</p>
</section>
<section class="help-section">
<h4>ช่วงเวลาบนแกน X อ่านอย่างไร?</h4>
<p>ข้อความ เช่น <b>01:00–02:00</b> หมายถึงช่วงเวลานั้น เมื่อซูมเข้า ระบบจะแสดงช่วงที่ละเอียดขึ้น เช่น <b>01:00–01:30</b>, <b>01:00–01:15</b> หรือช่วงสั้นกว่านั้นตามมุมมอง</p>
<p class="help-muted">เมื่อชี้ที่จุดข้อมูล จะเห็นวันและเวลาของข้อมูลจริงโดยละเอียด</p>
</section>
<section class="help-section">
<h4>ค่าเฉลี่ย / สูงสุด / ต่ำสุด / ล่าสุด</h4>
<div class="help-simple-grid">
<div><b>ค่าเฉลี่ย</b><span>ช่วยดูระดับโดยรวมในช่วงที่เลือก</span></div>
<div><b>ค่าสูงสุด</b><span>ค่ามากที่สุดที่พบในช่วงนั้น</span></div>
<div><b>ค่าต่ำสุด</b><span>ค่าน้อยที่สุดที่พบในช่วงนั้น</span></div>
<div><b>ค่าล่าสุด</b><span>ข้อมูลล่าสุดภายในช่วงที่กำลังดู</span></div>
</div>
</section>
<div class="help-tip"><b>แนะนำ</b><span>เริ่มจาก “ค่าเฉลี่ยพื้นที่” เพื่อดูภาพรวม แล้วสลับเป็น “เปรียบเทียบ 3 จุด” เมื่ออยากรู้ว่าความแตกต่างมาจากตำแหน่งใด</span></div>`
},

ai:{
title:"🤖 วิเคราะห์และคาดการณ์",
html:`
<div class="help-intro-card"><b>ส่วนนี้ช่วยแปลข้อมูลให้เข้าใจง่ายขึ้น</b><span>ใช้เพื่อดูภาพรวม แนวโน้ม และค่าคาดการณ์ระยะสั้นประกอบการตัดสินใจ</span></div>
<section class="help-section">
<h4>“อีก 30 นาที” หมายถึงอะไร?</h4>
<p>เป็นการประมาณแนวโน้มในอนาคตระยะสั้นจากข้อมูลที่มีอยู่ เพื่อช่วยให้เห็นทิศทางที่อาจเกิดขึ้น ไม่ใช่ค่าที่วัดได้จริงล่วงหน้า</p>
</section>
<section class="help-section">
<h4>ควรเชื่อค่าคาดการณ์แค่ไหน?</h4>
<p>ใช้เป็นข้อมูลประกอบ ไม่ควรใช้แทนค่าที่ตรวจวัดจริง เพราะสภาพแวดล้อมสามารถเปลี่ยนแปลงได้จากปัจจัยที่เกิดขึ้นภายหลัง</p>
</section>
<section class="help-section">
<h4>เส้นจริงกับเส้นคาดการณ์ต่างกันอย่างไร?</h4>
<div class="help-simple-grid">
<div><b>ข้อมูลจริง</b><span>ค่าที่ระบบมีจากช่วงเวลาที่ผ่านมา</span></div>
<div><b>ค่าคาดการณ์</b><span>ค่าประมาณสำหรับช่วงเวลาข้างหน้า</span></div>
</div>
</section>
<div class="help-warning">หากต้องตัดสินใจเรื่องสุขภาพหรือความปลอดภัย ให้ให้ความสำคัญกับข้อมูลจริงล่าสุด คำแนะนำจากหน่วยงานที่เกี่ยวข้อง และสภาพแวดล้อมที่สังเกตได้ ณ ขณะนั้น</div>`
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

const historyNodeSelect=
$("historyNode");

if(historyNodeSelect){
historyNodeSelect.value=historyNode;
historyNodeSelect.addEventListener(
"change",
e=>{
historyNode=e.target.value;
drawCharts();
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
