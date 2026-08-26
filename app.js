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
const NODE_OFFLINE_MS=6*60*1000;

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

return!!(
apiConnectionOnline&&
motherStatus&&
String(
motherStatus.status
)
.toLowerCase()==="online"
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

return"offline";

}

const s=
String(
node.status||
"offline"
)
.toLowerCase();

if(
s==="offline"
){

return"offline";

}

const d=
parseDate(

node.last_seen||
node.status_recorded_at||
node.timestamp

);

if(
!d||
Date.now()-
d.getTime()>
NODE_OFFLINE_MS
){

return"offline";

}

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
"ไม่สามารถตรวจสอบระบบได้";

}else if(
motherOnline()
){

dot.className=
"text-emerald-400";

st.textContent=
"ONLINE";

ac.textContent=
`${activeCount()} / ${TOTAL_NODES} Nodes active`;

}else{

dot.className=
"text-red-400";

st.textContent=
"OFFLINE";

ac.textContent=
`0 / ${TOTAL_NODES} Nodes active`;

}

}

// =====================================================
// THRESHOLD
// =====================================================

function threshold(field,value){

const n=
Number(value);

if(
!Number.isFinite(n)
){
return"no_data";
}

if(
field!=="pm25"
){
return"normal";
}

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
Number(value);

if(
!Number.isFinite(n)
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
Number(tempC);

rh=
Number(rh);

if(
!Number.isFinite(tempC)||
!Number.isFinite(rh)
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
Number(value);

if(
!Number.isFinite(n)
){

return{
level:"no_data",
label:"ไม่มีข้อมูล"
};

}

if(
n<27
){

return{
level:"normal",
label:"สภาพทั่วไป"
};

}

if(
n<33
){

return{
level:"watch",
label:"เฝ้าระวัง"
};

}

if(
n<42
){

return{
level:"warning",
label:"เตือนภัย"
};

}

if(
n<52
){

return{
level:"critical",
label:"อันตราย"
};

}

return{
level:"critical",
label:"อันตรายมาก"
};

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
// ACTIVITY RECOMMENDATION
// =====================================================

function activityRecommendation(
pm25,
heatIndex
){

const p=
pm25Guidance(
pm25
);

const h=
heatLevel(
heatIndex
);

if(
p.level==="critical"
){

return"ควรลดหรือหลีกเลี่ยงกิจกรรมกลางแจ้งที่ใช้แรงมาก และติดตาม PM2.5 อย่างใกล้ชิด";

}

if(
h.level==="critical"
){

return"ควรลดกิจกรรมกลางแจ้งที่ใช้แรงมาก หลีกเลี่ยงช่วงร้อนจัด และพักในบริเวณที่เหมาะสม";

}

if(
p.level==="warning"||
h.level==="warning"||
h.level==="watch"
){

return"ทำกิจกรรมได้โดยเพิ่มความระมัดระวัง ลดกิจกรรมที่ใช้แรงมาก และติดตามค่าจากระบบ";

}

return"ยังไม่พบข้อจำกัดเด่นจาก PM2.5 และ Heat Index สำหรับกิจกรรมทั่วไป แต่ควรติดตามข้อมูลต่อเนื่อง";

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
v==null||
!Number.isFinite(
Number(v)
)
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
"ควรตรวจสอบ",
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
"Gateway Offline • ไม่สามารถประเมินข้อมูลปัจจุบันได้"
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
"critical",
"info"
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
:"ทุกจุดที่ใช้งานยังอยู่ในเกณฑ์ปกติ";

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

function pointAttentionSummary(){

const usable=
latestNodes
.filter(
n=>
["online","sleep"]
.includes(
getNodeStatus(n)
)
);

if(!usable.length){
return{
label:"รอข้อมูล",
detail:"ยังไม่มีจุดตรวจวัดที่พร้อมใช้ข้อมูล",
level:"normal"
};
}

const pmNodes=
usable
.map(n=>({
n,
value:finiteNumberOrNull(n.pm25)
}))
.filter(x=>x.value!==null);

const heatNodes=
usable
.map(n=>({
n,
value:heatIndexC(
n.temperature,
n.humidity
)
}))
.filter(x=>x.value!==null);

const pmWorst=
pmNodes.length
?[...pmNodes].sort((a,b)=>b.value-a.value)[0]
:null;

const heatWorst=
heatNodes.length
?[...heatNodes].sort((a,b)=>b.value-a.value)[0]
:null;

const pmState=
pmWorst
?pm25Guidance(pmWorst.value)
:null;

const heatState=
heatWorst
?heatLevel(heatWorst.value)
:null;

// ถ้ามีค่าที่เข้าเกณฑ์เตือน ให้บอก "จุดไหน" ก่อน
if(
pmWorst&&
["warning","critical"]
.includes(pmState?.level)
){
return{
label:`จุดตรวจวัด ${nodeNo(pmWorst.n.device_id)} ควรติดตาม`,
detail:`PM2.5 สูงที่สุด ${fmt(pmWorst.value)} µg/m³ • ${pmState.label}`,
level:pmState.level==="critical"?"critical":"watch"
};
}

if(
heatWorst&&
["watch","warning","critical"]
.includes(heatState?.level)
){
return{
label:`จุดตรวจวัด ${nodeNo(heatWorst.n.device_id)} ควรติดตาม`,
detail:`สภาพความร้อนสูงที่สุด ${fmt(heatWorst.value)} °C • ${heatState.label}`,
level:heatState.level==="critical"?"critical":"watch"
};
}

// ถ้ายังปกติทั้งหมด ให้บอกว่าจุดใดสูงสุดแต่ยังไม่อันตราย
if(pmWorst){
return{
label:"ยังไม่มีจุดที่ต้องเฝ้าระวัง",
detail:`PM2.5 สูงสุดอยู่ที่จุดตรวจวัด ${nodeNo(pmWorst.n.device_id)} (${fmt(pmWorst.value)} µg/m³) และยังอยู่ในเกณฑ์ ${pmState?.label||"ปกติ"}`,
level:"normal"
};
}

return{
label:"ทุกจุดอยู่ในเกณฑ์ปกติ",
detail:`มี ${usable.length} จุดตรวจวัดที่ระบบใช้ข้อมูลได้`,
level:"normal"
};

}

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
<div class="smart-summary-stat-label">📍 จุดที่ควรสนใจ</div>
<div class="smart-summary-stat-value">ยังประเมินไม่ได้</div>
<div class="smart-summary-stat-sub">ข้อมูลจากจุดตรวจวัดยังไม่พร้อม</div>
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

const pm=
pm25Guidance(
snap.pm25
);

const heat=
heatLevel(
snap.heatIndex
);

const attention=
pointAttentionSummary();

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
pm.level==="critical"||
heat.level==="critical"||
attention.level==="critical"
){
severity="critical";
headline="🔴 มีสถานการณ์ที่ควรให้ความสำคัญ";
}else if(
pm.level==="warning"||
heat.level==="warning"||
heat.level==="watch"||
attention.level==="watch"||
off>0
){
severity="watch";
headline="🟡 มีข้อมูลที่ควรติดตาม";
}

const airMain=
snap.pm25==null
?"รอข้อมูล"
:pm.label;

const airSub=
snap.pm25==null
?"ยังไม่มีค่า PM2.5 ที่ใช้ได้"
:`PM2.5 ${fmt(snap.pm25)} µg/m³`;

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
snap.heatIndex
);

const activityGood=
!["critical","warning"].includes(pm.level)&&
!["critical","warning"].includes(heat.level);

e.innerHTML=
`<div class="smart-summary-headline ${severity}">
${headline}
</div>

<div class="smart-summary-grid">

<div class="smart-summary-stat smart-summary-air">
<div class="smart-summary-stat-label">🌿 คุณภาพอากาศ</div>
<div class="smart-summary-stat-value">${esc(airMain)}</div>
<div class="smart-summary-stat-sub">${esc(airSub)}</div>
</div>

<div class="smart-summary-stat smart-summary-heat">
<div class="smart-summary-stat-label">🌡 สภาพความร้อน</div>
<div class="smart-summary-stat-value">${esc(heatMain)}</div>
<div class="smart-summary-stat-sub">${esc(heatSub)}</div>
</div>

<div class="smart-summary-stat smart-summary-environment">
<div class="smart-summary-stat-label">📍 จุดที่ควรสนใจ</div>
<div class="smart-summary-stat-value">${esc(attention.label)}</div>
<div class="smart-summary-stat-sub">${esc(attention.detail)}</div>
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
font:{size:mobile?11:13,weight:"600"}
}
};
}

function graphXAxisOptions(){
const mobile=isMobileChart();
return{
grid:{display:false},
ticks:{
autoSkip:true,
maxTicksLimit:mobile?5:10,
maxRotation:mobile?0:45,
minRotation:0,
font:{size:mobile?10:12}
}
};
}

function graphYAxisTicks(){
const mobile=isMobileChart();
return{maxTicksLimit:mobile?5:8,font:{size:mobile?10:12}};
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
tooltip:{callbacks:{label:graphTooltipLabel}}
},
scales:{
x:{
grid:{display:false},
ticks:{
autoSkip:true,
maxTicksLimit:chartTickLimit(),
maxRotation:0,
minRotation:0,
font:{size:chartFontSize()}
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
const base=selectedRecords()
.filter(r=>parseDate(r.timestamp))
.sort((a,b)=>parseDate(a.timestamp)-parseDate(b.timestamp));

if($("selectedMetricLabel"))$("selectedMetricLabel").textContent=metricLabel();

historyGroupCharts=destroyChartList(historyGroupCharts);
destroyChartSafe(historyChart);
historyChart=null;

const area=$("historyChartArea");
if(!area)return;

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

const labels=base.map(x=>thaiTime(x.timestamp));

const create=(canvasId,fields,yTitle)=>{
const datasets=fields.map(field=>{
const vals=base.map(r=>{
const v=finiteNumberOrNull(r[field]); return v;
});
return makeActualDataset(field,vals);
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
const labels=arr.map(r=>thaiTime(r.timestamp));
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
data:{labels,datasets:[makeActualDataset(metric,values)]},
options:{
...groupedChartOptions(`${metricLabel()} ${metricUnit()}`.trim()),
plugins:{legend:graphLegendOptions(),tooltip:{callbacks:{label:graphTooltipLabel}}}
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

const actualLabels=actual.map(r=>thaiTime(r.timestamp));
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
options:groupedChartOptions(yTitle)
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
const labels=actual.map(r=>thaiTime(r.timestamp));
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
...groupedChartOptions(`${metricLabel()} ${metricUnit()}`.trim()),
plugins:{legend:graphLegendOptions(),tooltip:{callbacks:{label:graphTooltipLabel}}}
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

$("exportModal")
?.classList
.add(
"active"
);

refreshExport();

}

function closeExport(){

$("exportModal")
?.classList
.remove(
"active"
);

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
${esc(data.headline||"รอผลการวิเคราะห์")}
</div>

<div class="ai-result-summary">
${esc(data.summary||"ยังไม่มีรายละเอียดจาก AI")}
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
• ${esc(x)}
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
${esc(data.recommendation||"ติดตามข้อมูลจากระบบต่อเนื่อง")}
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

function renderAIForecast(payload){
const box=$("aiForecastDetails")||$("forecastMessage");
const badge=$("aiForecastStatusBadge");
const generated=$("aiForecastGeneratedAt");
const providerLabel=$("aiTrendDecisionProvider");

if(providerLabel){
const provider=payload?.provider;
providerLabel.textContent=
provider==="cloudflare"
?"ระบบวิเคราะห์"
:provider==="gemini"
?"ระบบวิเคราะห์"
:payload?.ai===false
?"ใช้การคำนวณจากข้อมูลย้อนหลัง"
:"กำลังรอการวิเคราะห์...";
}
if(aiForecastLoading){
if(providerLabel)providerLabel.textContent="กำลังวิเคราะห์...";
if(box)box.innerHTML='<div class="ai-loading-state"><span class="ai-loading-dot"></span>กำลังวิเคราะห์แนวโน้มและคาดการณ์...</div>';
if(badge)badge.textContent="กำลังวิเคราะห์";
return;
}
if(!payload){
if(box)box.innerHTML='<div class="ai-unavailable">ยังไม่มีผลการวิเคราะห์แนวโน้ม</div>';
if(badge)badge.textContent="รอข้อมูล";
return;
}
const d=payload.data||{};
const isAI=payload.ai===true;
if(generated){const dt=parseDate(payload.generated_at);generated.textContent=dt?`อัปเดตการวิเคราะห์: ${dt.toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}`:"อัปเดตการวิเคราะห์: --";}
if(badge){badge.className=`ai-forecast-status ${isAI?"is-connected":"is-unavailable"}`;const p=payload?.provider==="cloudflare"?"CLOUDFLARE AI":payload?.provider==="gemini"?"GEMINI AI":"AI";badge.textContent=isAI?`${p} • ${confidenceText(d.confidence||"low")}`:"ใช้ข้อมูลย้อนหลัง";}
if(!box)return;
if(!isAI){
const reasonText=
payload.reason==="gemini_quota_exhausted"
?"โควตา Gemini ฟรีถึงขีดจำกัดแล้ว ระบบข้อมูลจริงยังทำงานตามปกติ"
:payload.reason==="gemini_secret_not_configured"
?"ยังไม่ได้ตั้งค่า GEMINI_API_KEY"
:"ไม่สามารถเชื่อม Gemini ได้ในขณะนี้";

box.innerHTML=`<div class="ai-unavailable"><b>การวิเคราะห์ขั้นสูงยังไม่พร้อม</b><div class="mt-1">${esc(reasonText)}</div></div>`;
return;
}
const trends=Array.isArray(d.trend_analysis)?d.trend_analysis:[];
const preferred=["pm25","temperature","humidity","light"];
const trendCards=preferred.map(field=>trends.find(x=>x?.field===field)).filter(Boolean);
box.innerHTML=`
<div class="ai-forecast-headline">${esc(d.headline||"แนวโน้มและคาดการณ์")}</div>
<div class="ai-trend-summary">${trendCards.map(x=>`<div class="ai-trend-item"><div class="ai-trend-variable">${esc(CURRENT_METRIC_CONFIG[x.field]?.label||x.field)}</div><div class="ai-trend-direction">${esc(aiDirectionText(x.direction))}</div><div class="ai-trend-explanation">${esc(x.explanation||"")}</div></div>`).join("")}</div>
<div class="ai-trend-driver"><b>ปัจจัยที่เด่น:</b> ${esc(d.primary_driver||"--")}<br><b>สิ่งผิดปกติ:</b> ${esc(d.anomaly_summary||"--")}</div>
<div class="ai-forecast-grid mt-3">
<div class="ai-forecast-item"><div class="ai-forecast-label">🌿 คุณภาพอากาศ</div><div>${esc(d.air_forecast||"ยังไม่มีข้อมูล")}</div></div>
<div class="ai-forecast-item"><div class="ai-forecast-label">🌡 สภาพความร้อน</div><div>${esc(d.heat_forecast||"ยังไม่มีข้อมูล")}</div></div>
<div class="ai-forecast-item"><div class="ai-forecast-label">📍 พื้นที่</div><div>${esc(d.local_environment_forecast||"ยังไม่มีข้อมูล")}</div></div>
<div class="ai-forecast-item"><div class="ai-forecast-label">🏃 กิจกรรม</div><div>${esc(d.activity_forecast||"ยังไม่มีข้อมูล")}</div></div>
</div>
<div class="ai-meta-row"><span>คาดการณ์จากข้อมูลล่าสุดและข้อมูลย้อนหลัง</span><span class="ai-confidence">ความเชื่อมั่น: ${confidenceText(d.confidence||"low")}</span></div>`;
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

monitoring:[
"จุดตรวจวัด",
"แสดงค่าล่าสุดและสถานะของจุดตรวจวัดทั้ง 3 จุด หากจุดใดไม่มีการติดต่อใหม่เกินเวลาที่กำหนด ระบบจะแสดงว่าขาดการเชื่อมต่อ ส่วนรายละเอียดการสื่อสารของอุปกรณ์ถูกเก็บไว้ภายในระบบ"
],

smartSummary:[
"สรุปสถานการณ์",
"สรุปสิ่งที่คนทั่วไปต้องการรู้จากข้อมูลล่าสุด ได้แก่ คุณภาพอากาศ สภาพความร้อน จุดที่ควรสนใจ สถานะของจุดตรวจวัด และคำแนะนำสำหรับกิจกรรมกลางแจ้ง"
],

currentAir:[
"เปรียบเทียบจุดตรวจวัด",
"เปรียบเทียบข้อมูลล่าสุดจากจุดตรวจวัดที่ใช้งานอยู่ โดยแสดงค่าเฉลี่ยของพื้นที่ จุดที่มีค่าสูงที่สุด และจุดที่ควรสนใจสำหรับตัวแปรที่เลือก"
],

alerts:[
"สิ่งที่ควรระวัง",
"แสดงเฉพาะเหตุการณ์ที่ควรให้ความสนใจ เช่น PM2.5 สูง สภาพความร้อนเข้าเกณฑ์เฝ้าระวัง หรือจุดตรวจวัดขาดการเชื่อมต่อ หากทุกอย่างปกติระบบจะแจ้งว่าไม่มีสิ่งที่ต้องเฝ้าระวัง"
],

historical:[
"สถิติย้อนหลัง",
"เลือกตัวแปรและช่วงเวลาเพื่อดูค่าเฉลี่ย ค่าสูงสุด ค่าต่ำสุด ค่าล่าสุด และแนวโน้ม พร้อมกราฟย้อนหลัง ข้อมูลที่อ่านไม่สำเร็จจะไม่ถูกนำมาแทนด้วยค่า 0"
],

ai:[
"วิเคราะห์และคาดการณ์",
"สรุปสถานการณ์ด้วยภาษาที่อ่านง่ายและประเมินแนวโน้มในช่วง 30 นาทีถัดไปจากข้อมูลล่าสุดและข้อมูลย้อนหลัง หากระบบ AI ภายนอกไม่พร้อม ระบบยังสามารถใช้การคำนวณทางสถิติเป็นระบบสำรองได้"
]

};

function closeHelp(){

const p=
$("helpPopover");

p?.classList
.remove(
"active"
);

activeHelpButton=
null;

}

function bindHelp(){

document
.querySelectorAll(
".help-button"
)
.forEach(
b=>
b.addEventListener(
"click",
e=>{

e.stopPropagation();

const x=
HELP_CONTENT[
b.dataset.help
];

if(!x){
return;
}

activeHelpButton=
b;

if(
$("helpPopoverTitle")
){

$("helpPopoverTitle").textContent=
x[0];

}

if(
$("helpPopoverText")
){

$("helpPopoverText").textContent=
x[1];

}

const p=
$("helpPopover");

if(!p){
return;
}

p.classList.add(
"active"
);

}
)
);

$("helpPopoverClose")
?.addEventListener(
"click",
closeHelp
);

$("helpPopover")
?.addEventListener(
"click",
e=>{
if(
e.target===
$("helpPopover")
){
closeHelp();
}
}
);

}

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
// INITIAL LOAD
// =====================================================

async function loadInitial(){

try{

const[
latest,
history,
mother,
alerts,
standards
]=
await Promise.all([

loadLatest(),

loadHistory(),

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

records=
history;

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

renderAverages();

drawCharts();

loadAI(
false
);

loadAIForecast(
false
);

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

try{

records=
await loadHistory();

renderAverages();
drawCharts();

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
