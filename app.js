const BASE="https://educational-pm25-api.project2026csemn.workers.dev";
const API={latest:`${BASE}/api/get_latest.php`,history:`${BASE}/api/get_history.php`,export:`${BASE}/api/export.php`,mother:`${BASE}/api/mother_status`,alerts:`${BASE}/api/alert_states`,standards:`${BASE}/api/standards.php`};
const TOTAL_NODES=3;
const NODE_OFFLINE_MS=6*60*1000;
const $=id=>document.getElementById(id);

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
let averageRange="24h";
let customRangeStart=null;
let customRangeEnd=null;
let calendarDisplayDate=new Date();
let calendarSelectionStep="start";
let apiConnectionOnline=false;
let exportRows=[];
let activeHelpButton=null;

const RANGE_CONFIG={
"30m":{label:"30 นาที",minutes:30,apiRange:"24h"},
"1h":{label:"1 ชั่วโมง",minutes:60,apiRange:"24h"},
"6h":{label:"6 ชั่วโมง",minutes:360,apiRange:"24h"},
"12h":{label:"12 ชั่วโมง",minutes:720,apiRange:"24h"},
"24h":{label:"24 ชั่วโมง",minutes:1440,apiRange:"24h"},
"7d":{label:"7 วัน",minutes:10080,apiRange:"7d"},
"30d":{label:"30 วัน",minutes:43200,apiRange:"30d"}
};

const CURRENT_METRIC_CONFIG={
pm1:{label:"PM1.0",unit:"µg/m³"},
pm25:{label:"PM2.5",unit:"µg/m³"},
pm10:{label:"PM10",unit:"µg/m³"},
temperature:{label:"อุณหภูมิ",unit:"°C"},
humidity:{label:"ความชื้น",unit:"%"},
light:{label:"แสง",unit:"lux"}
};

function fmt(v){
return(v==null||v===""||!Number.isFinite(Number(v)))?"--":Number(v).toFixed(1);
}

function esc(v){
return String(v??"")
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;")
.replace(/'/g,"&#039;");
}

function parseDate(v){
if(!v)return null;
if(v instanceof Date)return isNaN(v)?null:v;

const t=String(v).trim();

const d=new Date(
/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)
?t.replace(" ","T")+"Z"
:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t)
?t+"Z"
:t
);

return isNaN(d)?null:d;
}

function thaiTime(v){
const d=parseDate(v);

return d
?d.toLocaleTimeString("th-TH",{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
second:"2-digit",
hour12:false
})
:"--";
}

function normalize(d){
if(!d)return null;

return{
id:d.id==null?null:Number(d.id),
device_id:String(d.device_id??"").trim(),
status:String(d.status??"offline").toLowerCase(),
pm1:d.pm1==null?null:Number(d.pm1),
pm25:d.pm25==null?null:Number(d.pm25),
pm10:d.pm10==null?null:Number(d.pm10),
temperature:d.temperature==null?null:Number(d.temperature),
humidity:d.humidity==null?null:Number(d.humidity),
light:d.light==null?null:Number(d.light),
timestamp:d.recorded_at||d.timestamp||null,
status_recorded_at:d.status_recorded_at||d.recorded_at||null,
reading_recorded_at:d.reading_recorded_at||null,
last_seen:d.last_seen||null,
connection_status:d.connection_status||null,
command_status:d.command_status||null
};
}

function nodeNo(id){
const m=String(id||"").match(/(\d+)/);
return m?Number(m[1]):null;
}

function getNode(n){
return latestNodes.find(x=>nodeNo(x.device_id)===n)||null;
}

function motherOnline(){
return!!(
apiConnectionOnline&&
motherStatus&&
String(motherStatus.status).toLowerCase()==="online"
);
}

// =====================================================
// NODE STATUS RULE
//
// Gateway OFFLINE
// -> ทุก Node OFFLINE
//
// ONLINE / SLEEP
// -> ต้องมีข้อมูลล่าสุดไม่เกิน 6 นาที
//
// เกิน 6 นาที
// -> OFFLINE
// =====================================================

function getNodeStatus(node){
if(!motherOnline()||!node){
return"offline";
}

const s=String(node.status||"offline").toLowerCase();

if(s==="offline"){
return"offline";
}

const d=parseDate(
node.last_seen||
node.status_recorded_at||
node.timestamp
);

if(!d||Date.now()-d.getTime()>NODE_OFFLINE_MS){
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
.filter(n=>["online","sleep"].includes(getNodeStatus(n)))
.length;
}

async function fetchJson(url){
const r=await fetch(
url+(url.includes("?")?"&":"?")+"t="+Date.now(),
{
cache:"no-store",
headers:{Accept:"application/json"}
}
);

if(!r.ok){
throw new Error(`HTTP ${r.status}`);
}

const j=await r.json();

if(!j?.success){
throw new Error(j?.message||"API error");
}

return j;
}

async function loadLatest(){
const j=await fetchJson(API.latest);

return(
Array.isArray(j.data)
?j.data
:j.data
?[j.data]
:[]
)
.map(normalize)
.filter(Boolean);
}

async function loadMother(){
const j=await fetchJson(API.mother);

return j.data
?{
status:String(j.data.status||"offline").toLowerCase(),
last_seen:j.data.last_seen||null,
updated_at:j.data.updated_at||null
}
:null;
}

async function loadAlerts(){
const j=await fetchJson(API.alerts);
return Array.isArray(j.data)?j.data:[];
}

async function loadStandards(){
return fetchJson(API.standards);
}

function apiRange(){
return averageRange==="custom"
?"30d"
:RANGE_CONFIG[averageRange]?.apiRange||"24h";
}

async function loadHistory(){
const j=await fetchJson(
`${API.history}?range=${encodeURIComponent(apiRange())}`
);

return(
Array.isArray(j.data)
?j.data
:[]
)
.map(normalize)
.filter(Boolean);
}

// =====================================================
// MONITORING NODES
// =====================================================

function setNodeValues(prefix,n){
for(const k of["pm1","pm25","pm10"]){
const e=$(prefix+k);

if(e){
e.textContent=n?fmt(n[k]):"--";
}
}

const m={
temp:["temperature","°C"],
hum:["humidity","%"],
light:["light"," lux"]
};

for(const[k,[f,u]]of Object.entries(m)){
const e=$(prefix+k);

if(e){
e.textContent=n&&n[f]!=null
?fmt(n[f])+u
:"--";
}
}
}

function renderNodeStatus(i,n){
const s=$("n"+i+"status");
const card=$("nodeCard"+i);

if(!s||!card)return;

const st=getNodeStatus(n);

const map={
online:["status-online","status-online-dot","ONLINE"],
sleep:["status-sleep","status-sleep-dot","SLEEP"],
offline:["status-offline","status-offline-dot","OFFLINE"]
};

const[cls,dot,label]=map[st];

s.className=`${cls} text-xs font-bold`;

s.innerHTML=
`<span class="${dot}">●</span> ${label} <span class="badge rounded-full px-3 py-1 text-xs">ESP-NOW</span>`;

card.classList.toggle("offline",st==="offline");
}

function renderMonitoring(){
for(let i=1;i<=3;i++){
const n=getNode(i);

setNodeValues("n"+i,n);

const t=$("lastUpdate"+i);

if(t){
t.textContent=n?.timestamp
?thaiTime(n.timestamp)
:"--";
}

renderNodeStatus(i,n);
}

const dot=$("gatewayDotTop");
const st=$("gatewayStatusTop");
const ac=$("nodesActiveTop");

if(!dot||!st||!ac)return;

if(!apiConnectionOnline){
dot.className="text-red-400";
st.textContent="API ERROR";
ac.textContent="ไม่สามารถตรวจสอบระบบได้";
}else if(motherOnline()){
dot.className="text-emerald-400";
st.textContent="ONLINE";
ac.textContent=`${activeCount()} / ${TOTAL_NODES} Nodes active`;
}else{
dot.className="text-red-400";
st.textContent="OFFLINE";
ac.textContent=`0 / ${TOTAL_NODES} Nodes active`;
}
}

// =====================================================
// THRESHOLD
// =====================================================

function threshold(field,value){
const n=Number(value);

const t=
standardsData
?.realtime_thresholds
?.[field];

if(!Number.isFinite(n)){
return"no_data";
}

if(!t){
return"normal";
}

if(t.critical!=null&&n>=t.critical){
return"critical";
}

if(t.warning!=null&&n>=t.warning){
return"warning";
}

if(t.low_warning!=null&&n<=t.low_warning){
return"warning";
}

if(t.high_warning!=null&&n>=t.high_warning){
return"warning";
}

if(t.low_info!=null&&n<t.low_info){
return"info";
}

return"normal";
}

function levelText(l){
return{
normal:"ปกติ",
warning:"เฝ้าระวัง",
critical:"สูง",
info:"ควรตรวจสอบ",
no_data:"รอข้อมูล"
}[l]||"รอข้อมูล";
}

// =====================================================
// CURRENT ENVIRONMENT
// =====================================================

function currentCfg(){
return CURRENT_METRIC_CONFIG[currentMetric]||
CURRENT_METRIC_CONFIG.pm25;
}

function currentValue(v){
const c=currentCfg();

return(
v==null||
!Number.isFinite(Number(v))
)
?"--"
:`${fmt(v)} ${c.unit}`;
}

function qualityBadge(l){
const b=$("qualityBadge");

if(!b)return;

b.className="current-quality-badge";

const m={
normal:["ปกติ","current-quality-normal"],
warning:["เฝ้าระวัง","current-quality-warning"],
critical:["สูง","current-quality-critical"],
info:["ควรตรวจสอบ","current-quality-info"],
no_data:["รอข้อมูล","current-quality-unavailable"]
};

const x=m[l]||m.no_data;

b.textContent=x[0];
b.classList.add(x[1]);
}

function resetCurrent(reason){
const c=currentCfg();

if($("currentOverallLabel")){
$("currentOverallLabel").textContent=
c.label+" ภาพรวม";
}

for(const id of[
"currentOverallValue",
"currentHighestValue",
"currentHighestNode",
"currentWatchNode"
]){
if($(id)){
$(id).textContent="--";
}
}

if($("currentOverallDetail")){
$("currentOverallDetail").textContent=
"ค่าเฉลี่ยจากจุดที่ ONLINE / SLEEP";
}

if($("currentWatchDetail")){
$("currentWatchDetail").textContent=
reason;
}

if($("currentEnvironmentFooter")){
$("currentEnvironmentFooter").textContent=
reason;
}

qualityBadge("no_data");
}

function updateCurrent(){
const c=currentCfg();

if($("currentOverallLabel")){
$("currentOverallLabel").textContent=
c.label+" ภาพรวม";
}

if(!apiConnectionOnline){
return resetCurrent(
"ไม่สามารถเชื่อมต่อ API ได้"
);
}

if(!motherOnline()){
return resetCurrent(
"Gateway Offline • ไม่สามารถประเมินข้อมูลปัจจุบันได้"
);
}

const usable=
latestNodes.filter(n=>
["online","sleep"].includes(getNodeStatus(n))&&
Number.isFinite(Number(n[currentMetric]))
);

if(!usable.length){
return resetCurrent(
"ไม่มีอุปกรณ์ที่มีข้อมูลสำหรับตัวแปรนี้"
);
}

const avg=
usable.reduce(
(s,n)=>s+Number(n[currentMetric]),
0
)/
usable.length;

const high=
usable.reduce(
(a,b)=>
Number(b[currentMetric])>
Number(a[currentMetric])
?b
:a
);

const watch=
usable
.map(n=>({
n,
v:Number(n[currentMetric]),
l:threshold(
currentMetric,
n[currentMetric]
)
}))
.filter(x=>
["warning","critical","info"]
.includes(x.l)
)
.sort((a,b)=>b.v-a.v)[0];

$("currentOverallValue").textContent=
currentValue(avg);

$("currentOverallDetail").textContent=
`ค่าเฉลี่ยจาก ${usable.length} จุดที่ใช้งาน`;

$("currentHighestValue").textContent=
currentValue(high[currentMetric]);

$("currentHighestNode").textContent=
`อุปกรณ์ ${nodeNo(high.device_id)}`;

qualityBadge(
threshold(currentMetric,avg)
);

$("currentWatchNode").textContent=
watch
?`อุปกรณ์ ${nodeNo(watch.n.device_id)}`
:"ไม่มี";

$("currentWatchDetail").textContent=
watch
?`${c.label} ${currentValue(watch.v)} • ${levelText(watch.l)}`
:"ทุกจุดที่ใช้งานยังไม่เข้าเกณฑ์เฝ้าระวัง";

if($("currentEnvironmentFooter")){
$("currentEnvironmentFooter").textContent=
`ใช้ข้อมูลล่าสุดจาก ${usable.length} / ${TOTAL_NODES} จุดตรวจวัด`;
}
}

// =====================================================
// SMART SUMMARY
// =====================================================

function updateSmart(){
const e=$("aiSummary");

if(!e)return;

if(!apiConnectionOnline){
e.innerHTML=
'<b class="text-red-300">🔴 ไม่สามารถเชื่อมต่อ API</b>';

return;
}

if(!motherOnline()){
e.innerHTML=
`<b class="text-red-300">🔴 Gateway Offline</b>
<div class="mt-2 text-xs text-slate-400">
ONLINE 0 • SLEEP 0 • OFFLINE ${TOTAL_NODES}
</div>`;

return;
}

const a=
latestNodes.map(n=>getNodeStatus(n));

const on=
a.filter(x=>x==="online").length;

const sl=
a.filter(x=>x==="sleep").length;

const off=
TOTAL_NODES-on-sl;

const usable=
latestNodes.filter(n=>
["online","sleep"].includes(getNodeStatus(n))&&
Number.isFinite(Number(n.pm25))
);

let headline=
off
?"🟠 มีอุปกรณ์ที่ต้องตรวจสอบ"
:"🟢 ระบบทำงานปกติ";

let pm=
"ยังไม่มีข้อมูล PM2.5 ที่ใช้ประเมินได้";

if(usable.length){
const avg=
usable.reduce(
(s,n)=>s+Number(n.pm25),
0
)/
usable.length;

const l=
threshold("pm25",avg);

pm=
`PM2.5 ภาพรวม ${fmt(avg)} µg/m³ • ${levelText(l)}`;

if(l==="critical"){
headline=
"🔴 คุณภาพอากาศควรเฝ้าระวัง";
}else if(l==="warning"){
headline=
"🟡 มีค่าที่ควรติดตาม";
}
}

e.innerHTML=
`<b>${headline}</b>
<div class="mt-2">
${pm}
</div>
<div class="mt-2 text-xs text-slate-400">
Gateway ONLINE • ONLINE ${on} • SLEEP ${sl} • OFFLINE ${off}
</div>`;
}

// =====================================================
// ALERT UI
// =====================================================

function updateAlertUI(){
const e=$("alerts");

if(!e)return;

if(!apiConnectionOnline){
e.innerHTML=
'<div class="soft rounded-xl p-3"><b class="text-red-300">🔴 ไม่สามารถเชื่อมต่อ API</b></div>';

return;
}

if(!motherOnline()){
e.innerHTML=
'<div class="soft rounded-xl p-3"><b class="text-red-300">🔴 Gateway OFFLINE</b><div class="text-xs text-slate-400 mt-1">กำหนดทุก Node เป็น OFFLINE</div></div>';

return;
}

const list=[];

for(let i=1;i<=3;i++){
const n=getNode(i);
const st=getNodeStatus(n);

if(st==="offline"){
list.push({
icon:"🔴",
title:`อุปกรณ์ ${i} OFFLINE`,
detail:"ไม่สามารถติดต่ออุปกรณ์ได้"
});

continue;
}

const state=
alertStates.find(a=>
nodeNo(a.device_id)===i
);

if(!state)continue;

const defs=[
["pm1_level","PM1.0","pm1","µg/m³"],
["pm25_level","PM2.5","pm25","µg/m³"],
["pm10_level","PM10","pm10","µg/m³"],
["temperature_level","อุณหภูมิ","temperature","°C"],
["humidity_level","ความชื้น","humidity","%"],
["light_level","แสง","light","lux"]
];

for(const[k,label,v,u]of defs){
if(String(state[k]||"normal")!=="normal"){
list.push({
icon:state[k]==="critical"?"🔴":"🟡",
title:`อุปกรณ์ ${i} • ${label}`,
detail:`${fmt(n?.[v])} ${u}`
});
}
}
}

e.innerHTML=
list.length
?list.map(x=>
`<div class="soft rounded-xl p-3 mb-2">
<b>${x.icon} ${esc(x.title)}</b>
<div class="text-xs text-slate-400 mt-1">
${esc(x.detail)}
</div>
</div>`
).join("")
:'<div class="soft rounded-xl p-3"><b class="text-emerald-300">✅ ไม่พบรายการที่ต้องตรวจสอบ</b></div>';
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

return RANGE_CONFIG[averageRange]?.label||
"ช่วงเวลาที่เลือก";
}

function rangeWindow(){
if(averageRange==="custom"){
return(
customRangeStart&&
customRangeEnd
)
?{
start:customRangeStart,
end:customRangeEnd
}
:null;
}

const c=
RANGE_CONFIG[averageRange];

if(!c){
return null;
}

const end=
new Date();

return{
start:new Date(
end-c.minutes*60000
),
end
};
}

function selectedRecords(){
const w=
rangeWindow();

return w
?records.filter(r=>{
const d=
parseDate(r.timestamp);

return(
d&&
d>=w.start&&
d<=w.end
);
})
:[];
}

function metricLabel(){
return CURRENT_METRIC_CONFIG[metric]?.label||
metric;
}

function metricUnit(){
return CURRENT_METRIC_CONFIG[metric]?.unit||
"";
}

function stats(data,field){
const a=
data
.map(x=>Number(x[field]))
.filter(Number.isFinite);

return a.length
?{
avg:
a.reduce((x,y)=>x+y,0)/a.length,
max:
Math.max(...a),
min:
Math.min(...a),
last:
a.at(-1)
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

if($("selectedRangeLabel")){
$("selectedRangeLabel").textContent=
rangeLabel();
}

const defs=[
["pm1","averagePM1","averagePM1Status"],
["pm25","averagePM25","averagePM25Status"],
["pm10","averagePM10","averagePM10Status"],
["temperature","averageTemp","averageTempStatus"],
["humidity","averageHum","averageHumStatus"],
["light","averageLight","averageLightStatus"]
];

for(const[f,id,sid]of defs){
const s=
stats(d,f);

if($(id)){
$(id).textContent=
s.avg==null
?"--"
:fmt(s.avg);
}

if($(sid)){
$(sid).textContent=
s.avg==null
?"● ไม่มีข้อมูล"
:`● เฉลี่ย ${rangeLabel()}`;
}
}
}

function drawCharts(){
const arr=
selectedRecords()
.filter(r=>
parseDate(r.timestamp)&&
Number.isFinite(Number(r[metric]))
)
.sort(
(a,b)=>
parseDate(a.timestamp)-
parseDate(b.timestamp)
);

const s=
stats(arr,metric);

if($("trendAvg")){
$("trendAvg").textContent=
s.avg==null?"--":fmt(s.avg);
}

if($("trendMax")){
$("trendMax").textContent=
s.max==null?"--":fmt(s.max);
}

if($("trendMin")){
$("trendMin").textContent=
s.min==null?"--":fmt(s.min);
}

if($("trendLast")){
$("trendLast").textContent=
s.last==null?"--":fmt(s.last);
}

if($("selectedMetricLabel")){
$("selectedMetricLabel").textContent=
metricLabel();
}

if(!arr.length){
if($("trend")){
$("trend").textContent=
"ไม่มีข้อมูลในช่วงเวลาที่เลือก";
}

historyChart?.destroy();
historyChart=null;

forecastChart?.destroy();
forecastChart=null;

if($("forecastMessage")){
$("forecastMessage").textContent=
"ไม่มีข้อมูลเพียงพอสำหรับการคาดการณ์";
}

return;
}

const labels=
arr.map(x=>
parseDate(x.timestamp)
.toLocaleString(
"th-TH",
{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"2-digit",
hour:"2-digit",
minute:"2-digit"
}
)
);

const values=
arr.map(x=>Number(x[metric]));

if($("trend")){
const diff=
values.at(-1)-values[0];

const pct=
values[0]
?diff/Math.abs(values[0])*100
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
label:metricLabel(),
data:values,
borderColor:"#22d3ee",
backgroundColor:"rgba(34,211,238,.08)",
fill:true,
tension:.35,
pointRadius:values.length>50?0:3,
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
color:"rgba(148,163,184,.08)"
}
}
}
}
}
);

drawForecast(arr);
}

// =====================================================
// FORECAST
// =====================================================

function linear(points){
const n=
points.length;

if(n<2)return null;

let sx=0;
let sy=0;
let sxy=0;
let sxx=0;

for(const p of points){
sx+=p.x;
sy+=p.y;
sxy+=p.x*p.y;
sxx+=p.x*p.x;
}

const den=
n*sxx-sx*sx;

if(!den)return null;

const slope=
(n*sxy-sx*sy)/den;

return{
slope,
intercept:(sy-slope*sx)/n
};
}

function updateForecastToggle(){
const b=
$("forecastToggle");

const l=
$("forecastToggleLabel");

const s=
$("forecastToggleState");

if(!b||!l)return;

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

if(forecastChart?.data?.datasets){
for(
let i=1;
i<forecastChart.data.datasets.length;
i++
){
forecastChart.setDatasetVisibility(
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
arr.filter(r=>
parseDate(r.timestamp)&&
Number.isFinite(Number(r[metric]))
);

const lastDate=
parseDate(
valid.at(-1)?.timestamp
);

const recent=
lastDate
?valid.filter(r=>
parseDate(r.timestamp)>=
new Date(lastDate-3600000)
)
:[];

if(recent.length<10){
if($("forecastMessage")){
$("forecastMessage").textContent=
"ข้อมูลใน 60 นาทีล่าสุดยังไม่พอสำหรับคาดการณ์";
}

if($("forecastBadge")){
$("forecastBadge").textContent=
`${metricLabel()} • รอข้อมูล`;
}

return;
}

const first=
parseDate(recent[0].timestamp);

const pts=
recent.map(r=>({
x:
(
parseDate(r.timestamp)-
first
)/
60000,
y:
Number(r[metric])
}));

const m=
linear(pts);

if(!m)return;

const last=
pts.at(-1);

const current=
last.y;

const pred=
Math.max(
0,
m.intercept+
m.slope*(last.x+30)
);

const dir=
Math.abs(pred-current)<1
?"→ ค่อนข้างคงที่"
:pred>current
?"↗ มีแนวโน้มเพิ่มขึ้น"
:"↘ มีแนวโน้มลดลง";

if($("forecastMessage")){
$("forecastMessage").innerHTML=
`<b class="text-cyan-300">${metricLabel()} (${metricUnit()})</b>
<div class="mt-2">
ค่าปัจจุบัน <b>${fmt(current)}</b>
• +30 นาทีประมาณ <b>${fmt(pred)}</b>
• ${dir}
</div>
<div class="text-[10px] text-slate-500 mt-2">
Forecast ใช้ Linear Regression
• ไม่ใช่ค่าที่เซนเซอร์วัดจริงในอนาคต
</div>`;
}

if($("forecastBadge")){
$("forecastBadge").textContent=
`${metricLabel()} • +30 นาที`;
}

const actual=
recent.slice(-12);

const labels=
actual.map(r=>
thaiTime(r.timestamp)
);

const vals=
actual.map(r=>
Number(r[metric])
);

const future=[
"+10 นาที",
"+20 นาที",
"+30 นาที"
];

const fp=
[10,20,30].map(min=>
Math.max(
0,
m.intercept+
m.slope*(last.x+min)
)
);

const nulls=
new Array(
Math.max(
0,
vals.length-1
)
).fill(null);

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
label:"ข้อมูลจริง",
data:[
...vals,
null,
null,
null
],
borderColor:"#22d3ee",
borderWidth:2,
tension:.3,
pointRadius:2
},
{
label:"Forecast",
data:[
...nulls,
vals.at(-1),
...fp
],
borderColor:"#34d399",
borderDash:[6,5],
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
color:"rgba(148,163,184,.08)"
}
}
}
}
}
);

updateForecastToggle();
}

// =====================================================
// RANGE
// =====================================================

function toDateTimeLocalValue(d){
if(!d)return"";

const p=
v=>String(v).padStart(2,"0");

return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dateFromRangeInput(id){
const v=
$(id)?.value;

if(!v)return null;

const d=
new Date(v);

return Number.isFinite(d.getTime())
?d
:null;
}

function sameCalendarDay(a,b){
return!!(
a&&
b&&
a.getFullYear()===b.getFullYear()&&
a.getMonth()===b.getMonth()&&
a.getDate()===b.getDate()
);
}

function setPickerInputs(start,end){
if($("customRangeStart")){
$("customRangeStart").value=
toDateTimeLocalValue(start);
}

if($("customRangeEnd")){
$("customRangeEnd").value=
toDateTimeLocalValue(end);
}
}

function updateQuickRangeUI(key){
document
.querySelectorAll(".quick-range-option")
.forEach(button=>{
const active=
!!key&&
button.dataset.range===key;

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
});
}

function closeHistoryRangePicker(){
const panel=
$("historyRangePanel");

const button=
$("historyRangeButton");

if(panel){
panel.classList.add("hidden");
}

if(button){
button.setAttribute(
"aria-expanded",
"false"
);
}

if($("customRangeError")){
$("customRangeError").textContent="";
$("customRangeError").classList.add("hidden");
}
}

function openHistoryRangePicker(){
const panel=
$("historyRangePanel");

const button=
$("historyRangeButton");

if(!panel)return;

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
end.getTime()-86400000
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

panel.classList.remove("hidden");

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

if(!grid||!title)return;

const year=
calendarDisplayDate.getFullYear();

const month=
calendarDisplayDate.getMonth();

const firstDay=
new Date(
year,
month,
1
).getDay();

const daysInMonth=
new Date(
year,
month+1,
0
).getDate();

const daysInPrevMonth=
new Date(
year,
month,
0
).getDate();

title.textContent=
new Date(
year,
month,
1
).toLocaleDateString(
"th-TH",
{
timeZone:"Asia/Bangkok",
month:"long",
year:"numeric"
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

for(let i=0;i<42;i++){
let day;
let displayMonth=month;
let muted=false;

if(i<firstDay){
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
oldStart?.getHours()??0,
oldStart?.getMinutes()??0,
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
oldEnd?.getHours()??23,
oldEnd?.getMinutes()??59,
0,
0
);

let start=
oldStart
?new Date(oldStart)
:new Date(date);

if(end<start){
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

updateQuickRangeUI(null);

renderRangeCalendar();
}
);

grid.appendChild(
button
);
}
}

function setRange(k){
const c=
RANGE_CONFIG[k];

if(!c)return;

averageRange=k;

customRangeStart=null;
customRangeEnd=null;

const end=
new Date();

const start=
new Date(
end.getTime()-
c.minutes*
60000
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

updateQuickRangeUI(k);

if($("historyRangeButtonLabel")){
$("historyRangeButtonLabel").textContent=
rangeLabel();
}

closeHistoryRangePicker();

loadHistorical();
}

function applyCustomRange(){
const a=
dateFromRangeInput(
"customRangeStart"
);

const b=
dateFromRangeInput(
"customRangeEnd"
);

const err=
$("customRangeError");

const showError=
message=>{
if(!err)return;

err.textContent=
message;

err.classList.remove(
"hidden"
);
};

if(!a||!b){
showError(
"กรุณาเลือกวันและเวลาเริ่มต้นกับสิ้นสุด"
);

return;
}

if(a>=b){
showError(
"เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น"
);

return;
}

if(
b-a>
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

customRangeStart=a;
customRangeEnd=b;

updateQuickRangeUI(null);

if($("historyRangeButtonLabel")){
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
$("exportStartDate")?.value;

const e=
$("exportEndDate")?.value;

if(!s||!e){
return null;
}

return{
start:new Date(
s+"T00:00:00+07:00"
),

end:new Date(
new Date(
e+"T00:00:00+07:00"
).getTime()+
86400000
)
};
}

async function refreshExport(){
const body=
$("exportPreviewBody");

const b=
exportBounds();

if(!body||!b){
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
.map(normalize);

exportRows.push(...rows);

if(
!j.has_more||
!rows.length
){
break;
}

offset+=rows.length;
}

if($("exportDataCount")){
$("exportDataCount").textContent=
String(exportRows.length);
}

body.innerHTML=
exportRows.length
?exportRows
.slice(0,50)
.map(r=>
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

if($("exportExcelButton")){
$("exportExcelButton").disabled=
!exportRows.length;
}
}

function openExport(){
const w=
rangeWindow();

const p=
d=>{
const x=
new Date(d);

const z=
n=>
String(n).padStart(2,"0");

return`${x.getFullYear()}-${z(x.getMonth()+1)}-${z(x.getDate())}`;
};

if($("exportStartDate")){
$("exportStartDate").value=
p(
w?.start||
Date.now()-
86400000
);
}

if($("exportEndDate")){
$("exportEndDate").value=
p(
w?.end||
Date.now()
);
}

$("exportModal")
?.classList
.add("active");

refreshExport();
}

function closeExport(){
$("exportModal")
?.classList
.remove("active");
}

function downloadExcel(){
if(
!exportRows.length||
typeof XLSX==="undefined"
){
return;
}

const data=
exportRows.map(r=>({
"วันที่ / เวลา":
parseDate(r.timestamp)
?.toLocaleString("th-TH")||"",
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
}));

const ws=
XLSX.utils.json_to_sheet(data);

const wb=
XLSX.utils.book_new();

XLSX.utils.book_append_sheet(
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
// HELP
// =====================================================

const HELP_CONTENT={
monitoring:[
"Monitoring Nodes",
"แสดงสถานะและค่าตรวจวัดล่าสุดของอุปกรณ์ทั้ง 3 จุด ONLINE/SLEEP ที่ไม่มีข้อมูลใหม่เกิน 6 นาทีจะแสดง OFFLINE"
],

smartSummary:[
"Smart Summary",
"สรุปสถานการณ์อัตโนมัติแบบ Rule-based"
],

currentAir:[
"คุณภาพอากาศและสภาพแวดล้อมปัจจุบัน",
"ใช้ข้อมูลล่าสุดจากจุดที่ ONLINE/SLEEP และยังไม่เกิน 6 นาที"
],

historical:[
"Historical Data & Trend",
"ดูข้อมูลย้อนหลัง ค่าเฉลี่ย สูงสุด ต่ำสุด แนวโน้ม และส่งออก Excel"
],

forecast:[
"Forecast",
"คาดการณ์ระยะสั้นด้วย Linear Regression ไม่ใช่ค่าที่วัดจริงในอนาคต"
],

ai:[
"AI วิเคราะห์สถานการณ์",
"พื้นที่สำหรับ AI วิเคราะห์ข้อมูลหลายส่วนร่วมกัน"
]
};

function closeHelp(){
const p=
$("helpPopover");

p?.classList.remove(
"active"
);

activeHelpButton=null;
}

function bindHelp(){
document
.querySelectorAll(".help-button")
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

if(!x)return;

activeHelpButton=b;

if($("helpPopoverTitle")){
$("helpPopoverTitle").textContent=
x[0];
}

if($("helpPopoverBody")){
$("helpPopoverBody").innerHTML=
`<p>${x[1]}</p>`;
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

document.addEventListener(
"click",
closeHelp
);
}

// =====================================================
// CREDIT IMAGE
// =====================================================

function openCreditImage(src,alt){
const m=
$("creditImageModal");

const img=
$("creditFullImage");

if(!m||!img)return;

img.src=src;
img.alt=alt||"";

if($("creditImageCaption")){
$("creditImageCaption").textContent=
alt||"";
}

m.classList.add(
"active"
);

document.body.style.overflow=
"hidden";
}

function closeCreditImage(){
$("creditImageModal")
?.classList
.remove("active");

document.body.style.overflow="";
}

// =====================================================
// EVENTS
// =====================================================

function bindEvents(){
const cm=
$("currentMetric");

if(cm){
cm.value=
currentMetric;

cm.addEventListener(
"change",
()=>{
currentMetric=
cm.value;

updateCurrent();
}
);
}

$("metric")
?.addEventListener(
"change",
e=>{
metric=
e.target.value;

drawCharts();
}
);

$("historyRangeButton")
?.addEventListener(
"click",
e=>{
e.stopPropagation();

const panel=
$("historyRangePanel");

if(!panel)return;

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
()=>setRange(
button.dataset.range
)
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
updateQuickRangeUI(null);

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
updateQuickRangeUI(null);
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
e=>e.stopPropagation()
);

document.addEventListener(
"click",
e=>{
if(
!$("historyRangePicker")
?.contains(e.target)
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

document.addEventListener(
"keydown",
e=>{
if(e.key==="Escape"){
closeExport();
closeHelp();
closeCreditImage();
closeHistoryRangePicker();
}
}
);
}

// =====================================================
// LOAD INITIAL
// =====================================================

async function loadInitial(){
try{
const[
l,
h,
m,
a,
s
]=await Promise.all([
loadLatest(),
loadHistory(),
loadMother(),
loadAlerts().catch(()=>[]),
loadStandards().catch(()=>null)
]);

apiConnectionOnline=true;
latestNodes=l;
records=h;
motherStatus=m;
alertStates=a;
standardsData=s;

latestRecord=
latestNodes.at(-1)||null;

renderMonitoring();
updateCurrent();
updateSmart();
updateAlertUI();
renderAverages();
drawCharts();

}catch(e){
console.error(e);

apiConnectionOnline=false;

renderMonitoring();
updateCurrent();
updateSmart();
updateAlertUI();
}
}

// =====================================================
// REALTIME
//
// อ่านแค่ Latest + Mother + Alert
// ทุก 10 วินาที
//
// ไม่โหลด History และ Standards ซ้ำ
// =====================================================

async function loadRealtime(){
try{
const[
l,
m,
a
]=await Promise.all([
loadLatest(),
loadMother(),
loadAlerts().catch(()=>alertStates)
]);

apiConnectionOnline=true;
latestNodes=l;
motherStatus=m;
alertStates=a;

renderMonitoring();
updateCurrent();
updateSmart();
updateAlertUI();

}catch(e){
console.error(e);

apiConnectionOnline=false;

renderMonitoring();
updateCurrent();
updateSmart();
updateAlertUI();
}
}

// =====================================================
// HISTORY
//
// ทุก 60 วินาที
// =====================================================

async function loadHistorical(){
try{
records=
await loadHistory();

renderAverages();
drawCharts();

}catch(e){
console.error(e);
}
}

// =====================================================
// STANDARDS
//
// ทุก 5 นาที
// =====================================================

async function loadStandardsOnly(){
try{
standardsData=
await loadStandards();

updateCurrent();
updateAlertUI();

}catch(e){
console.error(e);
}
}

// =====================================================
// CLOCK
// =====================================================

function updateClock(){
if($("clock")){
$("clock").textContent=
new Date()
.toLocaleString(
"th-TH",
{
timeZone:"Asia/Bangkok",
dateStyle:"medium",
timeStyle:"medium"
}
);
}
}

// =====================================================
// START
// =====================================================

if($("historyRangeButtonLabel")){
$("historyRangeButtonLabel").textContent=
rangeLabel();
}

updateForecastToggle();

bindEvents();
bindHelp();

updateClock();

loadInitial();

// Clock ไม่อ่าน D1
setInterval(
updateClock,
1000
);

// Realtime
setInterval(
loadRealtime,
10000
);

// History
setInterval(
loadHistorical,
60000
);

// Standards
setInterval(
loadStandardsOnly,
300000
);

// Refresh UI จากข้อมูลที่มีอยู่ใน Browser
// ไม่เรียก D1
setInterval(
()=>{
renderMonitoring();
updateCurrent();
updateSmart();
updateAlertUI();
},
5000
);
