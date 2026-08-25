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
let forecastVisible=true;

let metric="pm25";
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

pm1:{
label:"PM1.0",
unit:"µg/m³"
},

pm25:{
label:"PM2.5",
unit:"µg/m³"
},

pm10:{
label:"PM10",
unit:"µg/m³"
},

temperature:{
label:"อุณหภูมิ",
unit:"°C"
},

humidity:{
label:"ความชื้น",
unit:"%"
},

light:{
label:"แสง",
unit:"lux"
}

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
getNodeStatus(n);

const map={

online:[
"status-online",
"status-online-dot",
"ONLINE"
],

sleep:[
"status-sleep",
"status-sleep-dot",
"SLEEP"
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
n=>
Number(
n[field]
)
)
.filter(
Number.isFinite
);

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
// SKY CONDITION
// =====================================================

function skyCondition(){

const data=
selectedRecords()
.filter(
r=>
Number.isFinite(
Number(
r.light
)
)
);

if(
data.length<4
){

return{

level:"no_data",

label:
"ข้อมูลยังไม่พอ",

detail:
"ต้องมีข้อมูลแสงต่อเนื่องก่อนวิเคราะห์แนวโน้ม"

};

}

const recent=
data.slice(
-Math.min(
12,
data.length
)
);

const first=
Number(
recent[0].light
);

const last=
Number(
recent.at(-1).light
);

if(
!Number.isFinite(first)||
!Number.isFinite(last)
){

return{

level:"no_data",

label:
"ข้อมูลยังไม่พอ",

detail:
"ไม่สามารถวิเคราะห์ความเข้มแสงได้"

};

}

const pct=
first===0

?0

:(
last-first
)/
Math.max(
Math.abs(first),
1
)*
100;

const hum=
stats(
recent,
"humidity"
);

const temp=
stats(
recent,
"temperature"
);

const humRise=

hum.last!=null&&
hum.avg!=null&&
hum.last>
hum.avg+
2;

const tempFall=

temp.last!=null&&
temp.avg!=null&&
temp.last<
temp.avg-
.5;

if(
pct<-30&&
humRise&&
tempFall
){

return{

level:"watch",

label:
"แสงลดลงมาก",

detail:
"แสงลดลงร่วมกับความชื้นเพิ่มและอุณหภูมิลด สภาพแวดล้อมอาจเปลี่ยนแปลงและอาจสัมพันธ์กับเมฆปกคลุมเพิ่มขึ้น"

};

}

if(
pct<-20
){

return{

level:"watch",

label:
"แสงลดลง",

detail:
"ความเข้มแสงลดลงชัดเจน อาจสัมพันธ์กับการเปลี่ยนแปลงของสภาพท้องฟ้า"

};

}

if(
pct>20
){

return{

level:"normal",

label:
"แสงเพิ่มขึ้น",

detail:
"ความเข้มแสงมีแนวโน้มเพิ่มขึ้น"

};

}

return{

level:"normal",

label:
"ค่อนข้างคงที่",

detail:
"ความเข้มแสงยังไม่เปลี่ยนแปลงมากในช่วงล่าสุด"

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
"ค่าเฉลี่ยจากจุดที่ ONLINE / SLEEP";

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
Number.isFinite(
Number(
n[currentMetric]
)
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
`อุปกรณ์ ${nodeNo(high.device_id)}`;

qualityBadge(
threshold(
currentMetric,
avg
)
);

$("currentWatchNode").textContent=
watch
?`อุปกรณ์ ${nodeNo(watch.n.device_id)}`
:"ไม่มี";

$("currentWatchDetail").textContent=
watch
?`${c.label} ${currentValue(watch.v)} • ${levelText(watch.l)}`
:"ทุกจุดที่ใช้งานยังไม่เข้าเกณฑ์เฝ้าระวัง";

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
'<div class="smart-summary-headline offline">🔴 ไม่สามารถเชื่อมต่อ API</div><div class="smart-summary-note danger">Dashboard ไม่สามารถยืนยันข้อมูลปัจจุบันจาก Cloudflare Worker ได้</div>';

return;

}

if(
!motherOnline()
){

e.innerHTML=
`<div class="smart-summary-headline offline">
🔴 Gateway Offline
</div>

<div class="smart-summary-grid">

<div class="smart-summary-stat">

<div class="smart-summary-stat-label">
AIR QUALITY
</div>

<div class="smart-summary-stat-value">
ไม่พร้อมประเมิน
</div>

</div>

<div class="smart-summary-stat">

<div class="smart-summary-stat-label">
HEAT STRESS
</div>

<div class="smart-summary-stat-value">
ไม่พร้อมประเมิน
</div>

</div>

<div class="smart-summary-stat">

<div class="smart-summary-stat-label">
SKY CONDITION
</div>

<div class="smart-summary-stat-value">
ไม่พร้อมประเมิน
</div>

</div>

<div class="smart-summary-stat">

<div class="smart-summary-stat-label">
SYSTEM HEALTH
</div>

<div class="smart-summary-stat-value">
Gateway OFFLINE
</div>

</div>

</div>

<div class="smart-summary-note danger">
ไม่ใช้ค่าที่ค้างในฐานข้อมูลเป็นสถานการณ์ปัจจุบันจนกว่า Gateway จะกลับมา Online
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

const sky=
skyCondition();

const on=
latestNodes
.filter(
n=>
getNodeStatus(n)==="online"
)
.length;

const sl=
latestNodes
.filter(
n=>
getNodeStatus(n)==="sleep"
)
.length;

const off=
TOTAL_NODES-
on-
sl;

let severity=
"normal";

let headline=
"🟢 ภาพรวมสภาพแวดล้อมปกติ";

if(
pm.level==="critical"||
heat.level==="critical"
){

severity=
"critical";

headline=
"🔴 พบสภาพแวดล้อมที่ควรให้ความสำคัญ";

}else if(
pm.level==="warning"||
heat.level==="warning"||
heat.level==="watch"||
off>0
){

severity=
"watch";

headline=
"🟡 มีข้อมูลที่ควรติดตาม";

}

const pmText=
snap.pm25==null
?"รอข้อมูล"
:`${fmt(snap.pm25)} µg/m³ • ${pm.label}`;

const heatText=
snap.heatIndex==null
?"รอข้อมูล"
:`${fmt(snap.heatIndex)} °C • ${heat.label}`;

const systemText=
`ONLINE ${on} • SLEEP ${sl} • OFFLINE ${off}`;

const activity=
activityRecommendation(
snap.pm25,
snap.heatIndex
);

const notes=[];

notes.push({

type:
sky.level==="watch"
?"warn"
:"info",

text:
`สภาพท้องฟ้า: ${sky.detail}`

});

notes.push({

type:
"info",

text:
`กิจกรรมกลางแจ้ง: ${activity}`

});

if(
sl>0
){

notes.push({

type:
"info",

text:
`มี ${sl} อุปกรณ์อยู่ใน Deep Sleep ตามรอบการทำงาน`

});

}

if(
off>0
){

notes.push({

type:
"danger",

text:
`มี ${off} อุปกรณ์ Offline และไม่ถูกนำมาคำนวณค่าปัจจุบัน`

});

}

notes.push({

type:
"info",

text:
"PM1.0 ใช้เป็นข้อมูลประกอบการวิเคราะห์ ไม่ใช้ตัดสิน Health Alert โดยตรง"

});

e.innerHTML=
`<div class="smart-summary-headline ${severity}">
${headline}
</div>

<div class="smart-summary-grid">

<div class="smart-summary-stat smart-summary-air">

<div class="smart-summary-stat-label">
🌫 AIR QUALITY
</div>

<div class="smart-summary-stat-value">
${pmText}
</div>

<div class="smart-summary-stat-sub">
PM2.5 ปัจจุบัน
</div>

</div>

<div class="smart-summary-stat smart-summary-heat">

<div class="smart-summary-stat-label">
🌡 HEAT STRESS
</div>

<div class="smart-summary-stat-value">
${heatText}
</div>

<div class="smart-summary-stat-sub">
Temperature + Humidity
</div>

</div>

<div class="smart-summary-stat smart-summary-sky">

<div class="smart-summary-stat-label">
☁ SKY CONDITION
</div>

<div class="smart-summary-stat-value">
${esc(sky.label)}
</div>

<div class="smart-summary-stat-sub">
Light + Temp + Humidity
</div>

</div>

<div class="smart-summary-stat smart-summary-system">

<div class="smart-summary-stat-label">
📡 SYSTEM HEALTH
</div>

<div class="smart-summary-stat-value">
${systemText}
</div>

<div class="smart-summary-stat-sub">
Gateway ONLINE
</div>

</div>

</div>

<div class="smart-summary-activity">

<div class="smart-summary-activity-label">
🏃 คำแนะนำกิจกรรมกลางแจ้ง
</div>

<div>
${esc(activity)}
</div>

</div>

<div class="smart-summary-notes">

${notes
.map(
n=>
`<div class="smart-summary-note ${n.type}">
<span>•</span>
<span>${esc(n.text)}</span>
</div>`
)
.join("")}

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
'<div class="soft rounded-xl p-3"><b class="text-red-300">🔴 Gateway OFFLINE</b><div class="text-xs text-slate-400 mt-1">กำหนดทุก Node เป็น OFFLINE</div></div>';

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
`อุปกรณ์ ${i} OFFLINE`,

detail:
"ไม่สามารถติดต่ออุปกรณ์ได้"

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
`อุปกรณ์ ${i} • PM2.5`,

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
`อุปกรณ์ ${i} • Heat Index`,

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

:'<div class="soft rounded-xl p-3"><b class="text-emerald-300">✅ ไม่พบรายการที่ต้องตรวจสอบ</b><div class="text-xs text-slate-400 mt-1">PM1.0 และ Light ใช้เป็นข้อมูลประกอบ ไม่สร้าง Health Alert</div></div>';

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
d<=w.end
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
x=>
Number(
x[field]
)
)
.filter(
Number.isFinite
);

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

function drawCharts(){

const arr=
selectedRecords()
.filter(
r=>
parseDate(
r.timestamp
)&&
Number.isFinite(
Number(
r[metric]
)
)
)
.sort(
(
a,
b
)=>
parseDate(
a.timestamp
)-
parseDate(
b.timestamp
)
);

const s=
stats(
arr,
metric
);

if(
$("trendAvg")
){

$("trendAvg").textContent=
s.avg==null
?"--"
:fmt(s.avg);

}

if(
$("trendMax")
){

$("trendMax").textContent=
s.max==null
?"--"
:fmt(s.max);

}

if(
$("trendMin")
){

$("trendMin").textContent=
s.min==null
?"--"
:fmt(s.min);

}

if(
$("trendLast")
){

$("trendLast").textContent=
s.last==null
?"--"
:fmt(s.last);

}

if(
$("selectedMetricLabel")
){

$("selectedMetricLabel").textContent=
metricLabel();

}

if(
!arr.length
){

if(
$("trend")
){

$("trend").textContent=
"ไม่มีข้อมูลในช่วงเวลาที่เลือก";

}

historyChart?.destroy();

historyChart=null;

forecastChart?.destroy();

forecastChart=null;

if(
$("forecastMessage")
){

$("forecastMessage").textContent=
"ไม่มีข้อมูลเพียงพอสำหรับการคาดการณ์";

}

return;

}

const labels=
arr.map(
x=>
parseDate(
x.timestamp
)
.toLocaleString(
"th-TH",
{
timeZone:
"Asia/Bangkok",
day:
"2-digit",
month:
"2-digit",
hour:
"2-digit",
minute:
"2-digit"
}
)
);

const values=
arr.map(
x=>
Number(
x[metric]
)
);

if(
$("trend")
){

const diff=
values.at(-1)-
values[0];

const pct=
values[0]
?diff/
Math.abs(
values[0]
)*
100
:0;

$("trend").textContent=
Math.abs(pct)<1
?"→ คงที่"
:diff>0
?"↑ เพิ่มขึ้น"
:"↓ ลดลง";

}

historyChart?.destroy();

historyChart=
new Chart(
$("historyChart"),
{

type:"line",

data:{

labels,

datasets:[
{

label:
metricLabel(),

data:
values,

borderColor:
"#22d3ee",

backgroundColor:
"rgba(34,211,238,.08)",

fill:true,

tension:.35,

pointRadius:
values.length>50
?0
:3,

borderWidth:2

}
]

},

options:{

responsive:true,

plugins:{
legend:{
display:false
}
},

scales:{

x:{
grid:{
display:false
}
},

y:{
grid:{
color:
"rgba(148,163,184,.08)"
}
}

}

}

}
);

drawForecast(
arr
);

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

for(
let i=1;
i<
forecastChart
.data
.datasets
.length;
i++
){

forecastChart
.setDatasetVisibility(
i,
forecastVisible
);

}

forecastChart.update();

}

}

function drawForecast(arr){

forecastChart?.destroy();

forecastChart=null;

const valid=
arr.filter(
r=>
parseDate(
r.timestamp
)&&
Number.isFinite(
Number(
r[metric]
)
)
);

const lastDate=
parseDate(
valid.at(-1)
?.timestamp
);

const recent=
lastDate
?valid.filter(
r=>
parseDate(
r.timestamp
)>=
new Date(
lastDate-
3600000
)
)
:[];

if(
recent.length<10
){

if(
$("forecastMessage")
){

$("forecastMessage").textContent=
"ข้อมูลใน 60 นาทีล่าสุดยังไม่พอสำหรับคาดการณ์";

}

if(
$("forecastBadge")
){

$("forecastBadge").textContent=
`${metricLabel()} • รอข้อมูล`;

}

return;

}

const first=
parseDate(
recent[0].timestamp
);

const points=
recent.map(
r=>({

x:
(
parseDate(
r.timestamp
)-
first
)/
60000,

y:
Number(
r[metric]
)

})
);

const model=
linear(
points
);

if(!model){
return;
}

const last=
points.at(-1);

const current=
last.y;

const pred=
Math.max(
0,
model.intercept+
model.slope*
(
last.x+
30
)
);

const direction=
Math.abs(
pred-
current
)<1
?"→ ค่อนข้างคงที่"
:pred>current
?"↗ มีแนวโน้มเพิ่มขึ้น"
:"↘ มีแนวโน้มลดลง";

if(
$("forecastMessage")
){

$("forecastMessage").innerHTML=
`<b class="text-cyan-300">
${metricLabel()} (${metricUnit()})
</b>

<div class="mt-2">
ค่าปัจจุบัน
<b>${fmt(current)}</b>

• +30 นาทีประมาณ
<b>${fmt(pred)}</b>

• ${direction}
</div>

<div class="text-[10px] text-slate-500 mt-2">
Forecast ใช้ Linear Regression
• ไม่ใช่ค่าที่เซนเซอร์วัดจริงในอนาคต
</div>`;

}

if(
$("forecastBadge")
){

$("forecastBadge").textContent=
`${metricLabel()} • +30 นาที`;

}

const actual=
recent.slice(
-12
);

const labels=
actual.map(
r=>
thaiTime(
r.timestamp
)
);

const values=
actual.map(
r=>
Number(
r[metric]
)
);

const future=[
"+10 นาที",
"+20 นาที",
"+30 นาที"
];

const forecasts=
[
10,
20,
30
]
.map(
minutes=>
Math.max(
0,
model.intercept+
model.slope*
(
last.x+
minutes
)
)
);

const nulls=
new Array(
Math.max(
0,
values.length-1
)
)
.fill(
null
);

forecastChart=
new Chart(
$("forecastChart"),
{

type:"line",

data:{

labels:[
...labels,
...future
],

datasets:[

{

label:
"ข้อมูลจริง",

data:[
...values,
null,
null,
null
],

borderColor:
"#22d3ee",

borderWidth:2,

tension:.3,

pointRadius:2

},

{

label:
"Forecast",

data:[
...nulls,
values.at(-1),
...forecasts
],

borderColor:
"#34d399",

borderDash:[
6,
5
],

borderWidth:2,

pointRadius:3

}

]

},

options:{

responsive:true,

plugins:{
legend:{
display:false
}
},

scales:{

x:{
grid:{
display:false
}
},

y:{
grid:{
color:
"rgba(148,163,184,.08)"
}
}

}

}

}
);

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

function downloadExcel(){

if(
!exportRows.length||
typeof XLSX===
"undefined"
){
return;
}

const data=
exportRows.map(
r=>({

"วันที่ / เวลา":
parseDate(
r.timestamp
)
?.toLocaleString(
"th-TH"
)||"",

"อุปกรณ์":
r.device_id,

"PM1.0 (µg/m³)":
r.pm1??"",

"PM2.5 (µg/m³)":
r.pm25??"",

"PM10 (µg/m³)":
r.pm10??"",

"อุณหภูมิ (°C)":
r.temperature??"",

"ความชื้น (%)":
r.humidity??"",

"แสง (lux)":
r.light??""

})
);

const ws=
XLSX.utils
.json_to_sheet(
data
);

const wb=
XLSX.utils
.book_new();

XLSX.utils
.book_append_sheet(
wb,
ws,
"PM2.5 Data"
);

XLSX.writeFile(
wb,
"PM25_export.xlsx"
);

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
'<div class="ai-result-headline">ไม่สามารถติดต่อ AI endpoint ได้</div><div class="ai-result-summary">Smart Summary แบบ Rule-based ยังทำงานต่อได้ตามปกติ</div>';

if(generated){

generated.textContent=
"อัปเดต AI: --";

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
?`อัปเดต AI: ${generatedDate.toLocaleString(
"th-TH",
{
timeZone:
"Asia/Bangkok"
}
)}`
:"อัปเดต AI: --";

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
สิ่งที่ AI สังเกต
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

<div class="ai-meta-row">

<span>
โมเดล:
${esc(payload.model||"Rule-based fallback")}
${payload.cached?" • Cache":""}
</span>

<span class="ai-confidence">
ความเชื่อมั่น:
${confidenceText(data.confidence)}
</span>

</div>`;

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

const box=
$("aiForecastDetails")||
$("forecastMessage");

const badge=
$("aiForecastStatusBadge")||
$("forecastBadge");

const generated=
$("aiForecastGeneratedAt");

if(
aiForecastLoading
){

if(box){

box.innerHTML=
'<div class="ai-loading-state"><span class="ai-loading-dot"></span>AI กำลังคาดการณ์สภาพแวดล้อม...</div>';

}

if(badge){

badge.textContent=
"AI • กำลังคาดการณ์";

}

return;

}

if(
!payload
){

if(box){

box.innerHTML=
'<div class="ai-result-summary">ยังไม่มีผล AI Forecast • กราฟเชิงสถิติยังใช้เป็นข้อมูลฐานได้</div>';

}

if(badge){

badge.textContent=
"AI Forecast • รอข้อมูล";

}

return;

}

const d=
payload.data||
{};

if(generated){

const dt=
parseDate(
payload.generated_at
);

generated.textContent=
dt
?`อัปเดต AI Forecast: ${dt.toLocaleString(
"th-TH",
{
timeZone:
"Asia/Bangkok"
}
)}`
:"อัปเดต AI Forecast: --";

}

if(badge){

badge.textContent=
`AI Forecast • ${confidenceText(d.confidence||"low")}`;

}

if(!box){
return;
}

box.innerHTML=
`
<div class="ai-forecast-headline">
${esc(d.headline||"AI Environmental Forecast")}
</div>

<div class="ai-forecast-grid">

<div class="ai-forecast-item">

<div class="ai-forecast-label">
🌫 AIR
</div>

<div>
${esc(d.air_forecast||"ยังไม่มีข้อมูล")}
</div>

</div>

<div class="ai-forecast-item">

<div class="ai-forecast-label">
🌡 HEAT
</div>

<div>
${esc(d.heat_forecast||"ยังไม่มีข้อมูล")}
</div>

</div>

<div class="ai-forecast-item">

<div class="ai-forecast-label">
☁ SKY
</div>

<div>
${esc(d.sky_forecast||"ยังไม่มีข้อมูล")}
</div>

</div>

<div class="ai-forecast-item">

<div class="ai-forecast-label">
🏃 ACTIVITY
</div>

<div>
${esc(d.activity_forecast||"ยังไม่มีข้อมูล")}
</div>

</div>

</div>

<div class="ai-meta-row">

<span>
โมเดล:
${esc(payload.model||"Rule-based fallback")}
</span>

<span class="ai-confidence">
ความเชื่อมั่น:
${confidenceText(d.confidence||"low")}
</span>

</div>
`;

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

}

}

// =====================================================
// HELP
// =====================================================

const HELP_CONTENT={

monitoring:[
"Monitoring Nodes",
"แสดงสถานะและค่าตรวจวัดล่าสุดของอุปกรณ์ทั้ง 3 จุด ONLINE/SLEEP ที่ไม่มีข้อมูลใหม่เกิน 6 นาทีจะแสดง OFFLINE"
],

smartSummary:[
"Smart Summary",
"ศูนย์สรุปแบบ Rule-based ที่รวมสถานะ Gateway/Node, PM2.5 ภาพรวม, Heat Index, Sky Condition และข้อมูลที่ควรตรวจสอบ โดยทำงานได้แม้ AI ใช้งานไม่ได้"
],

currentAir:[
"คุณภาพอากาศและสภาพแวดล้อมปัจจุบัน",
"ใช้ข้อมูลล่าสุดจากจุดที่ ONLINE/SLEEP และยังไม่เกิน 6 นาที"
],

historical:[
"Historical Data & Trend",
"ดูข้อมูลย้อนหลัง ค่าเฉลี่ย สูงสุด ต่ำสุด แนวโน้ม และส่งออก Excel โดยค่าเริ่มต้นเป็นข้อมูลของวันนี้ตั้งแต่ 00:00 น. ตามเวลาไทย"
],

forecast:[
"Forecast",
"คาดการณ์ 30 นาทีแบบ Hybrid: ใช้แนวโน้มเชิงสถิติเป็นฐาน แล้วให้ Gemini วิเคราะห์ Air, Heat, Sky และความเหมาะสมของกิจกรรม โดยไม่ให้ AI แต่งค่าตัวเลขเอง"
],

ai:[
"AI วิเคราะห์สถานการณ์",
"เชื่อม Gemini ผ่าน Cloudflare Worker เพื่อวิเคราะห์ความสัมพันธ์ของ PM1.0, PM2.5, PM10, Temperature, Humidity, Light, Heat Index, สถานะระบบ และข้อมูลย้อนหลัง โดยแยกหน้าที่จาก AI Forecast"
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
$("helpPopoverBody")
){

$("helpPopoverBody").innerHTML=
`<p>${esc(x[1])}</p>`;

}

const p=
$("helpPopover");

if(p){

p.classList.add(
"active"
);

const r=
b.getBoundingClientRect();

p.style.left=
Math.max(
12,
Math.min(
r.left,
window.innerWidth-
400
)
)+"px";

p.style.top=
r.bottom+
10+
"px";

}

}
)
);

$("helpPopoverClose")
?.addEventListener(
"click",
closeHelp
);

document
.addEventListener(
"click",
closeHelp
);

}

// =====================================================
// CREDIT IMAGE
// =====================================================

function openCreditImage(
src,
alt
){

const modal=
$("creditImageModal");

const img=
$("creditFullImage");

if(
!modal||
!img
){
return;
}

img.src=
src;

img.alt=
alt||"";

if(
$("creditImageCaption")
){

$("creditImageCaption").textContent=
alt||"";

}

modal.classList.add(
"active"
);

document.body.style.overflow=
"hidden";

}

function closeCreditImage(){

$("creditImageModal")
?.classList
.remove(
"active"
);

document.body.style.overflow=
"";

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

updateSmart();

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
// AI ANALYSIS
// =====================================================

setInterval(
()=>{

loadAI(
false
);

},
300000
);

// =====================================================
// AI FORECAST
// =====================================================

setInterval(
()=>{

loadAIForecast(
false
);

},
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

updateAlertUI();

},
5000
);
