const BASE="https://educational-pm25-api.project2026csemn.workers.dev";
const API={
latest:`${BASE}/api/get_latest.php`,
history:`${BASE}/api/get_history.php`,
export:`${BASE}/api/export.php`,
mother:`${BASE}/api/mother_status`,
alerts:`${BASE}/api/alert_states`,
standards:`${BASE}/api/standards.php`
};
const TOTAL_NODES=3;
const $=id=>document.getElementById(id);
let latestNodes=[],records=[],motherStatus=null,alertStates=[],standardsData=null;
let latestRecord=null,historyChart=null,forecastChart=null,forecastVisible=true;
let metric="pm25",currentMetric="pm25",averageRange="24h",customRangeStart=null,customRangeEnd=null;
let calendarDisplayDate=new Date(),calendarSelectionStep="start";
let apiConnectionOnline=false,exportRows=[],activeHelpButton=null;
const RANGE_CONFIG={
"30m":{label:"30 นาที",minutes:30,apiRange:"24h"},
"1h":{label:"1 ชั่วโมง",minutes:60,apiRange:"24h"},
"3h":{label:"3 ชั่วโมง",minutes:180,apiRange:"24h"},
"6h":{label:"6 ชั่วโมง",minutes:360,apiRange:"24h"},
"12h":{label:"12 ชั่วโมง",minutes:720,apiRange:"24h"},
"24h":{label:"24 ชั่วโมง",minutes:1440,apiRange:"24h"},
"3d":{label:"3 วัน",minutes:4320,apiRange:"7d"},
"7d":{label:"7 วัน",minutes:10080,apiRange:"7d"},
"30d":{label:"30 วัน",minutes:43200,apiRange:"30d"}
};
function fmt(v){return v===null||v===undefined||v===""||isNaN(v)?"--":Number(v).toFixed(1)}
function escapeHtml(v){
return String(v??"")
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;")
.replace(/'/g,"&#039;");
}
function parseDate(v){
if(!v)return null;
if(v instanceof Date)return isNaN(v.getTime())?null:v;
const t=String(v).trim();
if(!t)return null;
let d;
if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)){
d=new Date(t.replace(" ","T")+"Z");
}
else if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t)){
d=new Date(t+"Z");
}
else{
d=new Date(t);
}
return isNaN(d.getTime())?null:d;
}
function formatThaiTime(v){
const d=parseDate(v);
if(!d)return "--";
return d.toLocaleTimeString(
"th-TH",
{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
second:"2-digit",
hour12:false
}
);
}
function normalize(d){
if(!d)return null;
return{
id:d.id==null?null:Number(d.id),
device_id:String(d.device_id??"").trim(),
status:String(d.status??"offline").trim().toLowerCase(),
pm1:d.pm1==null?null:Number(d.pm1),
pm25:d.pm25==null?null:Number(d.pm25),
pm10:d.pm10==null?null:Number(d.pm10),
temperature:d.temperature==null?null:Number(d.temperature),
humidity:d.humidity==null?null:Number(d.humidity),
light:d.light==null?null:Number(d.light),
timestamp:d.recorded_at||d.timestamp||d.created_at||null
};
}
function normalizeNodeName(v){
const t=String(v??"").trim().toLowerCase();
const m=t.match(/(\d+)/);
return m?`node${m[1]}`:t;
}
function isSameNode(id,n){
return normalizeNodeName(id)===`node${n}`;
}
function getLatestNode(n){
return latestNodes.find(x=>isSameNode(x.device_id,n))||null;
}
function motherOnline(){
return !!(
apiConnectionOnline&&
motherStatus&&
String(motherStatus.status||"").toLowerCase()==="online"
);
}
function getNodeStatus(node){
if(!motherOnline()||!node)return"offline";
return["online","sleep","offline"].includes(node.status)?node.status:"offline";
}
function countActiveNodes(){
return latestNodes.filter(n=>["online","sleep"].includes(getNodeStatus(n))).length;
}
function getLatestTimestampRecord(list){
let latest=null;
for(const x of list||[]){
const d=parseDate(x?.timestamp);
if(!d)continue;
if(!latest||d>parseDate(latest.timestamp))latest=x;
}
return latest;
}
function metricLabel(){
return{
pm1:"PM1.0",
pm25:"PM2.5",
pm10:"PM10",
temperature:"อุณหภูมิ",
humidity:"ความชื้น",
light:"แสง"
}[metric]||metric;
}
function metricUnit(){
return{
pm1:"µg/m³",
pm25:"µg/m³",
pm10:"µg/m³",
temperature:"°C",
humidity:"%",
light:"lux"
}[metric]||"";
}
async function fetchJson(url){
const r=await fetch(
url+(url.includes("?")?"&":"?")+"t="+Date.now(),
{
cache:"no-store",
headers:{Accept:"application/json"}
}
);
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const j=await r.json();
if(!j?.success)throw new Error(j?.message||"API error");
return j;
}
async function loadLatest(){
const j=await fetchJson(API.latest);
return(
Array.isArray(j.data)?j.data:j.data?[j.data]:[]
).map(normalize).filter(Boolean);
}
async function loadMotherStatus(){
const j=await fetchJson(API.mother);
return j.data?{
status:String(j.data.status||"offline").toLowerCase(),
last_seen:j.data.last_seen||null,
updated_at:j.data.updated_at||null
}:null;
}
async function loadAlertStates(){
const j=await fetchJson(API.alerts);
return Array.isArray(j.data)?j.data:[];
}
async function loadStandards(){
return fetchJson(API.standards);
}
function getApiRange(){
return averageRange==="custom"?"30d":(RANGE_CONFIG[averageRange]?.apiRange||"24h");
}
async function loadHistory(){
const j=await fetchJson(`${API.history}?range=${encodeURIComponent(getApiRange())}&limit=5000`);
if(!Array.isArray(j.data))throw new Error("History data invalid");
return j.data.map(normalize).filter(Boolean);
}
function getRealtimeThreshold(field){
return standardsData?.realtime_thresholds?.[field]||null;
}
function getRealtimeLevel(field,value){
const n=Number(value);
if(!Number.isFinite(n))return"no_data";
const t=getRealtimeThreshold(field);
if(!t)return"normal";
if(t.critical!=null&&n>=Number(t.critical))return"critical";
if(t.warning!=null&&n>=Number(t.warning))return"warning";
if(t.low_warning!=null&&n<=Number(t.low_warning))return"warning";
if(t.high_warning!=null&&n>=Number(t.high_warning))return"warning";
if(t.low_info!=null&&n<Number(t.low_info))return"info";
return"normal";
}
function realtimeLevelLabel(l){
return{
normal:"ปกติ",
warning:"เฝ้าระวัง",
critical:"สูง",
info:"ควรตรวจสอบ",
no_data:"รอข้อมูล"
}[l]||"รอข้อมูล";
}
function quality(v){
return realtimeLevelLabel(getRealtimeLevel("pm25",v));
}
function setNode(prefix,d){
const ids=["pm1","pm25","pm10","temp","hum","light"];
if(!d){
ids.forEach(x=>{
const e=$(prefix+x);
if(e)e.textContent="--";
});
return;
}
$(prefix+"pm1").textContent=fmt(d.pm1);
$(prefix+"pm25").textContent=fmt(d.pm25);
$(prefix+"pm10").textContent=fmt(d.pm10);
$(prefix+"temp").textContent=d.temperature==null?"--":fmt(d.temperature)+"°C";
$(prefix+"hum").textContent=d.humidity==null?"--":fmt(d.humidity)+"%";
$(prefix+"light").textContent=d.light==null?"--":fmt(d.light)+" lux";
}
function updateLastUpdate(id,node){
const e=$(id);
if(e)e.textContent=node?.timestamp?formatThaiTime(node.timestamp):"--";
}
function updateNodeStatus(statusId,cardId,node){
const s=$(statusId);
const c=$(cardId);
if(!s||!c)return;
const st=getNodeStatus(node);
const map={
online:["status-online","status-online-dot","ONLINE"],
sleep:["status-sleep","status-sleep-dot","SLEEP"],
offline:["status-offline","status-offline-dot","OFFLINE"]
};
const[cls,dot,label]=map[st];
s.innerHTML=`
<span class="${dot}">●</span>
${label}
<span class="badge rounded-full px-3 py-1 text-xs">ESP-NOW</span>
`;
s.className=`${cls} text-xs font-bold`;
c.classList.toggle("offline",st==="offline");
}
function renderMonitoringNodes(){
for(let i=1;i<=3;i++){
const n=getLatestNode(i);
setNode("n"+i,n);
updateLastUpdate("lastUpdate"+i,n);
updateNodeStatus("n"+i+"status","nodeCard"+i,n);
}
updateSystemHealth();
}
function updateSystemHealth(){
const dot=$("gatewayDotTop");
const status=$("gatewayStatusTop");
const active=$("nodesActiveTop");
if(!dot||!status||!active)return;
if(!apiConnectionOnline){
dot.className="text-red-400";
status.textContent="API ERROR";
active.textContent="ไม่สามารถตรวจสอบระบบได้";
return;
}
if(motherOnline()){
dot.className="text-emerald-400";
status.textContent="ONLINE";
active.textContent=`${countActiveNodes()} / ${TOTAL_NODES} Nodes active`;
}else{
dot.className="text-red-400";
status.textContent="OFFLINE";
active.textContent=`0 / ${TOTAL_NODES} Nodes active`;
}
}
function forceAllNodesOffline(){
for(let i=1;i<=3;i++){
updateNodeStatus("n"+i+"status","nodeCard"+i,null);
}
const dot=$("gatewayDotTop");
const s=$("gatewayStatusTop");
const a=$("nodesActiveTop");
if(dot)dot.className="text-red-400";
if(s)s.textContent="API ERROR";
if(a)a.textContent="ไม่สามารถตรวจสอบระบบได้";
}
function getDeviceDisplayName(id){
const m=String(id||"").match(/(\d+)/);
return m?`อุปกรณ์ ${m[1]}`:(id||"--");
}
const CURRENT_METRIC_CONFIG={
pm1:{label:"PM1.0",unit:"µg/m³",description:"แสดงค่า PM1.0 ล่าสุดของจุดตรวจวัดที่กำลังใช้งาน"},
pm25:{label:"PM2.5",unit:"µg/m³",description:"ประเมินจากค่า PM2.5 ล่าสุดของจุดตรวจวัดที่กำลังใช้งาน"},
pm10:{label:"PM10",unit:"µg/m³",description:"แสดงค่า PM10 ล่าสุดของจุดตรวจวัดที่กำลังใช้งาน"},
temperature:{label:"อุณหภูมิ",unit:"°C",description:"แสดงอุณหภูมิล่าสุดของจุดตรวจวัดที่กำลังใช้งาน"},
humidity:{label:"ความชื้น",unit:"%",description:"แสดงความชื้นสัมพัทธ์ล่าสุดของจุดตรวจวัดที่กำลังใช้งาน"},
light:{label:"แสง",unit:"lux",description:"แสดงระดับความสว่างล่าสุดของจุดตรวจวัดที่กำลังใช้งาน"}
};
function getCurrentMetricConfig(){
return CURRENT_METRIC_CONFIG[currentMetric]||CURRENT_METRIC_CONFIG.pm25;
}
function formatCurrentMetricValue(value){
if(value===null||value===undefined||!Number.isFinite(Number(value)))return"--";
const config=getCurrentMetricConfig();
return fmt(value)+(config.unit?" "+config.unit:"");
}
function getCurrentMetricLevel(value){
if(value===null||value===undefined||!Number.isFinite(Number(value)))return"no_data";
return getRealtimeLevel(currentMetric,Number(value));
}
function setCurrentQualityBadge(level){
const badge=$("qualityBadge");
if(!badge)return;
badge.className="current-quality-badge";
const map={
normal:["ปกติ","current-quality-normal"],
warning:["เฝ้าระวัง","current-quality-warning"],
critical:["สูง","current-quality-critical"],
info:["ควรตรวจสอบ","current-quality-info"],
no_data:["รอข้อมูล","current-quality-unavailable"]
};
const item=map[level]||map.no_data;
badge.textContent=item[0];
badge.classList.add(item[1]);
}
function resetCurrentEnvironment(reason="รอข้อมูล"){
const config=getCurrentMetricConfig();
if($("currentOverallLabel"))$("currentOverallLabel").textContent=config.label+" ภาพรวม";
if($("currentOverallValue"))$("currentOverallValue").textContent="--";
if($("currentOverallDetail"))$("currentOverallDetail").textContent="ค่าเฉลี่ยจากจุดที่ ONLINE / SLEEP";
if($("currentHighestValue"))$("currentHighestValue").textContent="--";
if($("currentHighestNode"))$("currentHighestNode").textContent="--";
if($("currentWatchNode"))$("currentWatchNode").textContent="--";
if($("currentWatchDetail"))$("currentWatchDetail").textContent=reason;
if($("currentEnvironmentDescription"))$("currentEnvironmentDescription").textContent=config.description;
if($("currentEnvironmentFooter"))$("currentEnvironmentFooter").textContent=reason;
setCurrentQualityBadge("no_data");
}
function updateCurrentAirQuality(){
const config=getCurrentMetricConfig();
if($("currentOverallLabel"))$("currentOverallLabel").textContent=config.label+" ภาพรวม";
if($("currentEnvironmentDescription"))$("currentEnvironmentDescription").textContent=config.description;
if(!apiConnectionOnline){
resetCurrentEnvironment("ไม่สามารถเชื่อมต่อ API ได้");
return;
}
if(!motherOnline()){
resetCurrentEnvironment("Gateway Offline • ไม่สามารถประเมินข้อมูลปัจจุบันได้");
return;
}
const usableNodes=latestNodes.filter(node=>{
const status=getNodeStatus(node);
if(!["online","sleep"].includes(status))return false;
return Number.isFinite(Number(node[currentMetric]));
});
if(!usableNodes.length){
resetCurrentEnvironment("ไม่มีอุปกรณ์ที่มีข้อมูลสำหรับตัวแปรนี้");
return;
}
const average=usableNodes.reduce((sum,node)=>sum+Number(node[currentMetric]),0)/usableNodes.length;
const highest=usableNodes.reduce((current,node)=>Number(node[currentMetric])>Number(current[currentMetric])?node:current);
const highestValue=Number(highest[currentMetric]);
const watchNodes=usableNodes
.map(node=>({
node,
value:Number(node[currentMetric]),
level:getCurrentMetricLevel(node[currentMetric])
}))
.filter(item=>["warning","critical","info"].includes(item.level))
.sort((a,b)=>b.value-a.value);
$("currentOverallValue").textContent=formatCurrentMetricValue(average);
$("currentOverallDetail").textContent=`ค่าเฉลี่ยจาก ${usableNodes.length} จุดที่ใช้งาน`;
$("currentHighestValue").textContent=formatCurrentMetricValue(highestValue);
$("currentHighestNode").textContent=getDeviceDisplayName(highest.device_id);
setCurrentQualityBadge(getCurrentMetricLevel(average));
if(watchNodes.length){
const watch=watchNodes[0];
$("currentWatchNode").textContent=getDeviceDisplayName(watch.node.device_id);
$("currentWatchDetail").textContent=`${config.label} ${formatCurrentMetricValue(watch.value)} • ${realtimeLevelLabel(watch.level)}`;
}else{
$("currentWatchNode").textContent="ไม่มี";
$("currentWatchDetail").textContent="ทุกจุดที่ใช้งานยังไม่เข้าเกณฑ์เฝ้าระวัง";
}
if($("currentEnvironmentFooter")){
$("currentEnvironmentFooter").textContent=`ใช้ข้อมูลล่าสุดจาก ${usableNodes.length} / ${TOTAL_NODES} จุดตรวจวัด`;
}
}
function updateSmartSummary(){
const e=$("aiSummary");
if(!e)return;
if(!apiConnectionOnline){
e.innerHTML=`
<b class="text-red-300">🔴 ไม่สามารถเชื่อมต่อ API</b>
<div class="text-xs text-slate-500 mt-2">
ข้อมูลปัจจุบันไม่สามารถยืนยันได้
</div>
`;
return;
}
if(!motherOnline()){
e.innerHTML=`
<b class="text-red-300">🔴 Gateway Offline</b>
<div class="mt-2">
ไม่สามารถยืนยันการเชื่อมต่อของอุปกรณ์ลูกได้
</div>
<div class="mt-2 text-xs text-slate-400">
ONLINE 0 • SLEEP 0 • OFFLINE ${TOTAL_NODES}
</div>
`;
return;
}
const status=latestNodes.map(node=>({
node,
status:getNodeStatus(node)
}));
const online=status.filter(x=>x.status==="online").length;
const sleep=status.filter(x=>x.status==="sleep").length;
const offline=Math.max(0,TOTAL_NODES-online-sleep);
const usable=status.filter(x=>
["online","sleep"].includes(x.status)&&
Number.isFinite(Number(x.node?.pm25))
);
let headline="🟢 ระบบทำงานปกติ";
let cls="text-emerald-300";
let pmText="ยังไม่มีข้อมูล PM2.5 ที่ใช้ประเมินได้";
if(usable.length){
const avg=usable.reduce((s,x)=>s+Number(x.node.pm25),0)/usable.length;
const l=getRealtimeLevel("pm25",avg);
pmText=`PM2.5 ภาพรวม ${fmt(avg)} µg/m³ • ${quality(avg)}`;
if(l==="critical"){
headline="🔴 คุณภาพอากาศควรเฝ้าระวัง";
cls="text-red-300";
}else if(l==="warning"){
headline="🟡 มีค่าที่ควรติดตาม";
cls="text-amber-300";
}
}
if(offline>0){
headline="🟠 มีอุปกรณ์ที่ต้องตรวจสอบ";
cls="text-amber-300";
}
e.innerHTML=`
<b class="${cls}">${headline}</b>
<div class="mt-2">${pmText}</div>
<div class="mt-2 text-xs text-slate-400">
Gateway ONLINE • ONLINE ${online} • SLEEP ${sleep} • OFFLINE ${offline}
</div>
`;
}
function getAlertStateForNode(n){
return alertStates.find(s=>s&&isSameNode(s.device_id,n))||null;
}
function getSensorAlertItems(n,node){
const state=getAlertStateForNode(n);
if(!state||!node)return[];
const defs=[
["pm1_level","PM1.0","pm1","µg/m³"],
["pm25_level","PM2.5","pm25","µg/m³"],
["pm10_level","PM10","pm10","µg/m³"],
["temperature_level","อุณหภูมิ","temperature","°C"],
["humidity_level","ความชื้น","humidity","%"],
["light_level","แสง","light","lux"]
];
return defs.map(([lk,label,vk,unit])=>{
const level=String(state[lk]||"normal").toLowerCase();
if(level==="normal")return null;
return{
type:level,
title:`อุปกรณ์ ${n} • ${label}`,
detail:`${fmt(node[vk])} ${unit}`
};
}).filter(Boolean);
}
function updateAlerts(){
const e=$("alerts");
if(!e)return;
if(!apiConnectionOnline){
e.innerHTML=`
<div class="soft rounded-xl p-3">
<b class="text-red-300">🔴 ไม่สามารถเชื่อมต่อ API</b>
<div class="text-xs text-slate-400 mt-1">
กรุณาตรวจสอบ Cloudflare Worker หรือการเชื่อมต่ออินเทอร์เน็ต
</div>
</div>
`;
return;
}
if(!motherOnline()){
e.innerHTML=`
<div class="soft rounded-xl p-3">
<b class="text-red-300">🔴 Gateway OFFLINE</b>
<div class="text-xs text-slate-400 mt-1">
Worker ไม่สามารถยืนยันสถานะอุปกรณ์ลูกได้ และกำหนดทุก Node เป็น OFFLINE
</div>
</div>
`;
return;
}
const list=[];
for(let i=1;i<=TOTAL_NODES;i++){
const n=getLatestNode(i);
const st=getNodeStatus(n);
if(st==="offline"){
list.push({
type:"offline",
title:`อุปกรณ์ ${i} OFFLINE`,
detail:"ไม่สามารถติดต่ออุปกรณ์ได้"
});
}else{
list.push(...getSensorAlertItems(i,n));
}
}
if(!list.length){
e.innerHTML=`
<div class="soft rounded-xl p-3">
<b class="text-emerald-300">✅ ไม่พบรายการที่ต้องตรวจสอบ</b>
<div class="text-xs text-slate-400 mt-1">
Gateway, สถานะอุปกรณ์ และค่าตรวจวัดยังอยู่ในเงื่อนไขปกติ
</div>
</div>
`;
return;
}
const v={
offline:["🔴","text-red-300"],
critical:["🔴","text-red-300"],
high:["🟠","text-orange-300"],
warning:["🟡","text-amber-300"],
info:["🔵","text-cyan-300"]
};
e.innerHTML=list.map(a=>{
const[icon,cls]=v[a.type]||v.warning;
return`
<div class="soft rounded-xl p-3 mb-2">
<b class="${cls}">${icon} ${escapeHtml(a.title)}</b>
<div class="text-xs text-slate-400 mt-1">
${escapeHtml(a.detail)}
</div>
</div>
`;
}).join("");
}
function getRangeLabel(){
if(
averageRange==="custom"&&
customRangeStart&&
customRangeEnd
){
const opt={
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
hour:"2-digit",
minute:"2-digit"
};
return`${customRangeStart.toLocaleString("th-TH",opt)} – ${customRangeEnd.toLocaleString("th-TH",opt)}`;
}
return RANGE_CONFIG[averageRange]?.label||"ช่วงเวลาที่เลือก";
}
function getSelectedTimeWindow(){
if(averageRange==="custom"){
return customRangeStart&&customRangeEnd?{
start:new Date(customRangeStart),
end:new Date(customRangeEnd)
}:null;
}
const c=RANGE_CONFIG[averageRange];
if(!c)return null;
const end=new Date();
const start=new Date(end.getTime()-c.minutes*60000);
return{start,end};
}
function getRecordsInSelectedRange(){
const w=getSelectedTimeWindow();
if(!w)return[];
return records.filter(r=>{
const d=parseDate(r.timestamp);
return d&&d>=w.start&&d<=w.end;
});
}
function calculateAverage(data,field){
const v=data
.map(x=>x[field])
.filter(x=>x!==null&&x!==undefined&&Number.isFinite(Number(x)))
.map(Number);
return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
}
function calculateStatistics(data,field){
const v=data
.map(x=>x[field])
.filter(x=>x!==null&&x!==undefined&&Number.isFinite(Number(x)))
.map(Number);
return v.length?{
average:v.reduce((a,b)=>a+b,0)/v.length,
max:Math.max(...v),
min:Math.min(...v),
last:v[v.length-1]
}:{
average:null,
max:null,
min:null,
last:null
};
}
function averageStatus(value,field){
return value==null
?"● ไม่มีข้อมูล"
:`● เฉลี่ย ${getRangeLabel()}`;
}
function renderAverages(){
const d=getRecordsInSelectedRange();
if($("selectedRangeLabel")){
$("selectedRangeLabel").textContent=getRangeLabel();
}
[
["pm1","averagePM1","averagePM1Status"],
["pm25","averagePM25","averagePM25Status"],
["pm10","averagePM10","averagePM10Status"],
["temperature","averageTemp","averageTempStatus"],
["humidity","averageHum","averageHumStatus"],
["light","averageLight","averageLightStatus"]
].forEach(([f,id,sid])=>{
const a=calculateAverage(d,f);
$(id).textContent=a==null?"--":fmt(a);
$(sid).textContent=averageStatus(a,f);
});
}
function updateTrendStatistics(){
const s=calculateStatistics(getRecordsInSelectedRange(),metric);
$("trendAvg").textContent=s.average==null?"--":fmt(s.average);
$("trendMax").textContent=s.max==null?"--":fmt(s.max);
$("trendMin").textContent=s.min==null?"--":fmt(s.min);
let latest=null;
for(const r of[
...records,
...(latestRecord?[latestRecord]:[])
]){
const d=parseDate(r?.timestamp);
const v=r?.[metric];
if(!d||!Number.isFinite(Number(v)))continue;
if(!latest||d>parseDate(latest.timestamp))latest=r;
}
$("trendLast").textContent=latest?fmt(latest[metric]):"--";
if($("selectedMetricLabel")){
$("selectedMetricLabel").textContent=metricLabel();
}
}
function drawCharts(){
const arr=getRecordsInSelectedRange()
.filter(x=>Number.isFinite(Number(x?.[metric]))&&parseDate(x.timestamp))
.sort((a,b)=>parseDate(a.timestamp)-parseDate(b.timestamp));
updateTrendStatistics();
if(!arr.length){
$("trend").textContent="ไม่มีข้อมูลในช่วงเวลาที่เลือก";
if(historyChart){
historyChart.destroy();
historyChart=null;
}
if(forecastChart){
forecastChart.destroy();
forecastChart=null;
}
$("forecastMessage").textContent="ไม่มีข้อมูลเพียงพอสำหรับการคาดการณ์";
$("forecastBadge").textContent="WAITING";
return;
}
const labels=arr.map(x=>
parseDate(x.timestamp).toLocaleString(
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
const values=arr.map(x=>Number(x[metric]));
if(values.length<2){
$("trend").textContent="ข้อมูลยังน้อย";
}else{
const diff=values.at(-1)-values[0];
const pct=values[0]===0?0:diff/Math.abs(values[0])*100;
$("trend").textContent=
Math.abs(pct)<1
?"→ คงที่"
:diff>0
?"↑ เพิ่มขึ้น"
:"↓ ลดลง";
}
if(historyChart)historyChart.destroy();
historyChart=new Chart(
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
maintainAspectRatio:true,
interaction:{
intersect:false,
mode:"index"
},
plugins:{
legend:{display:false}
},
scales:{
y:{
beginAtZero:false,
grid:{color:"rgba(148,163,184,.08)"}
},
x:{
grid:{display:false},
ticks:{maxTicksLimit:12}
}
}
}
}
);
drawForecast(arr);
}
function linearRegression(points){
const n=points.length;
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
const den=n*sxx-sx*sx;
if(!den)return null;
const slope=(n*sxy-sx*sy)/den;
const intercept=(sy-slope*sx)/n;
const mean=sy/n;
let total=0;
let res=0;
for(const p of points){
const fit=intercept+slope*p.x;
total+=(p.y-mean)**2;
res+=(p.y-fit)**2;
}
return{
slope,
intercept,
r2:total===0?1:Math.max(0,Math.min(1,1-res/total)),
rmse:Math.sqrt(res/Math.max(1,n-2))
};
}
function clampForecastValue(field,v){
if(!Number.isFinite(v))return null;
if(field==="humidity"){
return Math.max(0,Math.min(100,v));
}
if(["pm1","pm25","pm10","light"].includes(field)){
return Math.max(0,v);
}
return v;
}
function minUncertainty(f){
return{
pm1:1,
pm25:1,
pm10:2,
temperature:.5,
humidity:2,
light:15
}[f]||1;
}
function stability(f){
return{
pm1:1,
pm25:1,
pm10:2,
temperature:.5,
humidity:2,
light:20
}[f]||1;
}
function forecastConfidence(r2,n,min){
return(
n>=20&&
min>=30&&
r2>=.6
)
?"ค่อนข้างสูง"
:(
n>=12&&
min>=20&&
r2>=.25
)
?"ปานกลาง"
:"ต่ำ";
}
function updateForecastToggleUI(){
const b=$("forecastToggle");
const l=$("forecastToggleLabel");
const s=$("forecastToggleState");
if(!b||!l)return;
b.setAttribute("aria-pressed",String(forecastVisible));
b.setAttribute("aria-checked",String(forecastVisible));
b.classList.toggle("is-on",forecastVisible);
b.classList.toggle("is-off",!forecastVisible);
l.textContent=forecastVisible?"เปิดการคาดการณ์":"ซ่อนการคาดการณ์";
if(s)s.textContent=forecastVisible?"ON":"OFF";
b.title=forecastVisible?"กดเพื่อซ่อน Forecast":"กดเพื่อแสดง Forecast";
}
function setForecastDatasetVisibility(){
updateForecastToggleUI();
if(!forecastChart?.data?.datasets)return;
for(let i=1;i<forecastChart.data.datasets.length;i++){
forecastChart.setDatasetVisibility(i,forecastVisible);
}
forecastChart.update();
}
function drawForecast(arr){
if(forecastChart){
forecastChart.destroy();
forecastChart=null;
}
const valid=arr
.filter(r=>parseDate(r.timestamp)&&Number.isFinite(Number(r[metric])))
.sort((a,b)=>parseDate(a.timestamp)-parseDate(b.timestamp));
if(valid.length<10){
$("forecastMessage").textContent=
"ข้อมูลยังไม่เพียงพอสำหรับคาดการณ์ ต้องมีอย่างน้อย 10 จุดข้อมูล";
$("forecastBadge").textContent=`${metricLabel()} • รอข้อมูล`;
return;
}
const latestDate=parseDate(valid.at(-1).timestamp);
const windowStart=new Date(latestDate.getTime()-3600000);
const recent=valid
.filter(r=>
parseDate(r.timestamp)>=windowStart&&
parseDate(r.timestamp)<=latestDate
)
.slice(-90);
if(recent.length<10){
$("forecastMessage").textContent=
"ข้อมูลใน 60 นาทีล่าสุดยังไม่พอสำหรับคาดการณ์";
$("forecastBadge").textContent=`${metricLabel()} • รอข้อมูล`;
return;
}
const first=parseDate(recent[0].timestamp);
const last=parseDate(recent.at(-1).timestamp);
const covered=(last-first)/60000;
const pts=recent.map(r=>({
x:(parseDate(r.timestamp)-first)/60000,
y:Number(r[metric])
}));
const model=linearRegression(pts);
if(!model)return;
const current=Number(recent.at(-1)[metric]);
const currentX=(last-first)/60000;
const vals=recent.map(r=>Number(r[metric]));
const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
const sd=Math.sqrt(
vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length
);
const maxChange=Math.max(stability(metric)*3,sd*3);
const base=Math.max(minUncertainty(metric),model.rmse*1.5);
const predictions=[10,20,30].map(minutes=>{
const raw=model.intercept+model.slope*(currentX+minutes);
const limit=maxChange*(minutes/30);
const bounded=Math.max(
current-limit,
Math.min(current+limit,raw)
);
const center=clampForecastValue(metric,bounded);
const u=base*(.85+.5*(minutes/30));
return{
minutes,
center,
lower:clampForecastValue(metric,center-u),
upper:clampForecastValue(metric,center+u)
};
});
const f=predictions.at(-1);
const change=f.center-current;
const direction=
Math.abs(change)<stability(metric)
?"→ ค่อนข้างคงที่"
:change>0
?"↗ มีแนวโน้มเพิ่มขึ้น"
:"↘ มีแนวโน้มลดลง";
const confidence=forecastConfidence(
model.r2,
recent.length,
covered
);
const assessment=realtimeLevelLabel(
getRealtimeLevel(metric,f.center)
);
const unit=metricUnit();
$("forecastMessage").innerHTML=`
<div class="text-[11px] text-slate-500">
ตัวแปรที่กำลังคาดการณ์
</div>
<b class="text-cyan-300">
${metricLabel()} ${unit?"("+unit+")":""}
</b>
<div class="grid grid-cols-3 gap-3 mt-3">
<div>
<span class="text-xs text-slate-500">
ค่าปัจจุบัน
</span>
<b class="block text-xl mt-1">
${fmt(current)}
</b>
</div>
<div>
<span class="text-xs text-slate-500">
ช่วงคาดการณ์ +30 นาที
</span>
<b class="block text-xl text-cyan-300 mt-1">
${fmt(f.lower)} – ${fmt(f.upper)}
</b>
</div>
<div>
<span class="text-xs text-slate-500">
ค่ากลางประมาณ
</span>
<b class="block text-xl text-emerald-300 mt-1">
${fmt(f.center)}
</b>
</div>
</div>
<div class="mt-4 grid sm:grid-cols-3 gap-2">
<div
class="rounded-lg px-3 py-2"
style="background:rgba(15,23,42,.42)"
>
<div class="text-[10px] text-slate-500">
แนวโน้ม
</div>
<b class="text-xs">
${direction}
</b>
</div>
<div
class="rounded-lg px-3 py-2"
style="background:rgba(15,23,42,.42)"
>
<div class="text-[10px] text-slate-500">
ระดับคาดการณ์
</div>
<b class="text-xs text-cyan-300">
${assessment}
</b>
</div>
<div
class="rounded-lg px-3 py-2"
style="background:rgba(15,23,42,.42)"
>
<div class="text-[10px] text-slate-500">
ความเชื่อมั่น
</div>
<b class="text-xs text-cyan-300">
${confidence}
</b>
</div>
</div>
<div class="text-[11px] text-slate-400 mt-3">
ใช้ข้อมูลล่าสุด ${recent.length} จุด
• ครอบคลุมประมาณ ${Math.round(covered)} นาที
</div>
<div class="text-[10px] text-slate-500 mt-2">
Forecast ใช้ Linear Regression
• ไม่ใช่ AI/ML
• ไม่ใช่ค่าที่เซนเซอร์วัดจริงในอนาคต
</div>
`;
$("forecastBadge").textContent=`${metricLabel()} • +30 นาที`;
const actual=recent.slice(-12);
const actualLabels=actual.map(r=>formatThaiTime(r.timestamp));
const actualValues=actual.map(r=>Number(r[metric]));
const future=predictions.map(p=>`+${p.minutes} นาที`);
const nulls=new Array(
Math.max(0,actualValues.length-1)
).fill(null);
forecastChart=new Chart(
$("forecastChart"),
{
type:"line",
data:{
labels:[
...actualLabels,
...future
],
datasets:[
{
label:"ข้อมูลจริง",
data:[
...actualValues,
...new Array(3).fill(null)
],
borderColor:"#22d3ee",
backgroundColor:"rgba(34,211,238,.05)",
borderWidth:2,
tension:.3,
pointRadius:2
},
{
label:"ขอบล่าง Forecast",
data:[
...nulls,
actualValues.at(-1),
...predictions.map(p=>p.lower)
],
borderColor:"rgba(52,211,153,0)",
borderWidth:0,
pointRadius:0
},
{
label:"ช่วงคาดการณ์",
data:[
...nulls,
actualValues.at(-1),
...predictions.map(p=>p.upper)
],
borderColor:"rgba(52,211,153,.22)",
backgroundColor:"rgba(52,211,153,.10)",
borderWidth:1,
pointRadius:0,
fill:"-1"
},
{
label:"Forecast",
data:[
...nulls,
actualValues.at(-1),
...predictions.map(p=>p.center)
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
maintainAspectRatio:true,
plugins:{
legend:{display:false}
},
scales:{
y:{
grid:{color:"rgba(148,163,184,.08)"}
},
x:{
grid:{display:false}
}
}
}
}
);
setForecastDatasetVisibility();
}
function toDateTimeLocalValue(d){
const p=v=>String(v).padStart(2,"0");
return d
?`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
:"";
}
function setPickerInputs(s,e){
$("customRangeStart").value=toDateTimeLocalValue(s);
$("customRangeEnd").value=toDateTimeLocalValue(e);
}
function setQuickRange(k){
const c=RANGE_CONFIG[k];
if(!c)return;
const e=new Date();
const s=new Date(e.getTime()-c.minutes*60000);
setPickerInputs(s,e);
calendarDisplayDate=new Date(e);
calendarSelectionStep="start";
updateQuickRangeUI(k);
renderRangeCalendar();
}
function updateQuickRangeUI(k){
document
.querySelectorAll(".quick-range-option")
.forEach(b=>{
const a=b.dataset.range===k;
b.style.background=a?"rgba(34,211,238,.10)":"transparent";
b.style.color=a?"#67e8f9":"#cbd5e1";
b.style.border=a
?"1px solid rgba(34,211,238,.18)"
:"1px solid transparent";
});
}
function dateOnlyFromInput(id){
const v=$(id)?.value;
const d=v?new Date(v):null;
return d&&!isNaN(d)?d:null;
}
function sameCalendarDay(a,b){
return !!(
a&&
b&&
a.getFullYear()===b.getFullYear()&&
a.getMonth()===b.getMonth()&&
a.getDate()===b.getDate()
);
}
function openHistoryRangePicker(){
$("historyRangePanel").classList.remove("hidden");
$("historyRangeButton").setAttribute("aria-expanded","true");
const w=getSelectedTimeWindow();
const s=w?.start||new Date(Date.now()-86400000);
const e=w?.end||new Date();
setPickerInputs(s,e);
calendarDisplayDate=new Date(e);
calendarSelectionStep="start";
updateQuickRangeUI(
averageRange==="custom"?null:averageRange
);
renderRangeCalendar();
}
function closeHistoryRangePicker(){
$("historyRangePanel")?.classList.add("hidden");
$("historyRangeButton")?.setAttribute("aria-expanded","false");
$("customRangeError")?.classList.add("hidden");
}
function renderRangeCalendar(){
const grid=$("rangeCalendarGrid");
if(!grid)return;
const y=calendarDisplayDate.getFullYear();
const m=calendarDisplayDate.getMonth();
const first=new Date(y,m,1).getDay();
const days=new Date(y,m+1,0).getDate();
const prev=new Date(y,m,0).getDate();
$("rangeCalendarTitle").textContent=
calendarDisplayDate.toLocaleDateString(
"th-TH",
{
timeZone:"Asia/Bangkok",
month:"long",
year:"numeric"
}
);
grid.innerHTML="";
const ss=dateOnlyFromInput("customRangeStart");
const se=dateOnlyFromInput("customRangeEnd");
for(let i=0;i<42;i++){
let day;
let cm=m;
let muted=false;
if(i<first){
day=prev-first+i+1;
cm=m-1;
muted=true;
}else if(i>=first+days){
day=i-(first+days)+1;
cm=m+1;
muted=true;
}else{
day=i-first+1;
}
const d=new Date(y,cm,day);
const b=document.createElement("button");
b.type="button";
b.textContent=day;
b.className="h-9 rounded-lg text-xs transition";
b.style.color=muted?"#475569":"#e2e8f0";
const startDay=sameCalendarDay(d,ss);
const endDay=sameCalendarDay(d,se);
const inRange=
ss&&
se&&
d>=new Date(
ss.getFullYear(),
ss.getMonth(),
ss.getDate()
)&&
d<=new Date(
se.getFullYear(),
se.getMonth(),
se.getDate()
);
b.style.background=
startDay||endDay
?"rgba(34,211,238,.28)"
:inRange
?"rgba(34,211,238,.07)"
:"transparent";
b.style.border=
startDay||endDay
?"1px solid rgba(103,232,249,.34)"
:"1px solid transparent";
b.onclick=()=>{
if(calendarSelectionStep==="start"){
const old=dateOnlyFromInput("customRangeStart");
const n=new Date(d);
n.setHours(
old?.getHours()||0,
old?.getMinutes()||0,
0,
0
);
$("customRangeStart").value=toDateTimeLocalValue(n);
const end=dateOnlyFromInput("customRangeEnd");
if(!end||end<n){
const e=new Date(n);
e.setHours(23,59,0,0);
$("customRangeEnd").value=toDateTimeLocalValue(e);
}
calendarSelectionStep="end";
}else{
const old=dateOnlyFromInput("customRangeEnd");
const n=new Date(d);
n.setHours(
old?.getHours()??23,
old?.getMinutes()??59,
0,
0
);
const start=dateOnlyFromInput("customRangeStart");
if(start&&n<start){
$("customRangeStart").value=toDateTimeLocalValue(n);
$("customRangeEnd").value=toDateTimeLocalValue(start);
}else{
$("customRangeEnd").value=toDateTimeLocalValue(n);
}
calendarSelectionStep="start";
}
updateQuickRangeUI(null);
renderRangeCalendar();
};
grid.appendChild(b);
}
}
async function applyHistoryRange(){
const s=dateOnlyFromInput("customRangeStart");
const e=dateOnlyFromInput("customRangeEnd");
const err=$("customRangeError");
if(!s||!e){
err.textContent="กรุณาเลือก Start และ End";
err.classList.remove("hidden");
return;
}
if(s>=e){
err.textContent="End ต้องอยู่หลัง Start";
err.classList.remove("hidden");
return;
}
if(e-s>30*86400000){
err.textContent="เลือกช่วงเวลาได้สูงสุด 30 วัน";
err.classList.remove("hidden");
return;
}
const mins=(e-s)/60000;
const match=Object.entries(RANGE_CONFIG)
.find(([,c])=>Math.abs(mins-c.minutes)<1.5)?.[0];
if(match){
averageRange=match;
customRangeStart=null;
customRangeEnd=null;
}else{
averageRange="custom";
customRangeStart=s;
customRangeEnd=e;
}
$("historyRangeButtonLabel").textContent=getRangeLabel();
closeHistoryRangePicker();
await load();
}
function dateToInputValue(d){
const p=v=>String(v).padStart(2,"0");
return d
?`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
:"";
}
function showExportError(m){
const e=$("exportError");
if(!e)return;
e.textContent=m||"";
e.classList.toggle("hidden",!m);
}
function setExportLoading(v){
$("exportLoading")?.classList.toggle("hidden",!v);
if($("exportExcelButton")){
$("exportExcelButton").disabled=v||!exportRows.length;
}
}
function getBangkokExportBoundaries(){
const s=$("exportStartDate")?.value;
const e=$("exportEndDate")?.value;
if(!s||!e)return null;
const start=new Date(s+"T00:00:00+07:00");
const end0=new Date(e+"T00:00:00+07:00");
if(isNaN(start)||isNaN(end0))return null;
return{
start,
end:new Date(end0.getTime()+86400000)
};
}
async function loadExportRows(){
const b=getBangkokExportBoundaries();
if(!b){
throw new Error("กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด");
}
if(b.end-b.start>31*86400000){
throw new Error("สามารถส่งออกข้อมูลได้สูงสุดครั้งละ 30 วัน");
}
let offset=0;
let total=null;
let all=[];
while(true){
const j=await fetchJson(
`${API.export}?start=${encodeURIComponent(b.start.toISOString())}&end=${encodeURIComponent(b.end.toISOString())}&limit=1000&offset=${offset}`
);
if(total===null&&j.total!=null){
total=Number(j.total);
}
const rows=(j.data||[]).map(normalize).filter(Boolean);
all.push(...rows);
$("exportDataCount").textContent=
total!=null
?`${all.length.toLocaleString("th-TH")} / ${total.toLocaleString("th-TH")}`
:all.length.toLocaleString("th-TH");
if(j.has_more!==true||!rows.length)break;
offset+=rows.length;
}
return all.sort(
(a,b)=>parseDate(a.timestamp)-parseDate(b.timestamp)
);
}
function formatExportDate(v){
const d=parseDate(v);
return d
?d.toLocaleString(
"th-TH",
{
timeZone:"Asia/Bangkok",
year:"numeric",
month:"2-digit",
day:"2-digit",
hour:"2-digit",
minute:"2-digit",
second:"2-digit",
hour12:false
}
)
:"";
}
function renderExportPreview(){
const body=$("exportPreviewBody");
$("exportDataCount").textContent=
exportRows.length.toLocaleString("th-TH");
if(!exportRows.length){
body.innerHTML=`
<tr>
<td colspan="8" class="export-empty-cell">
ไม่พบข้อมูลในช่วงวันที่ที่เลือก
</td>
</tr>
`;
$("exportExcelButton").disabled=true;
return;
}
body.innerHTML=exportRows
.slice(0,50)
.map(r=>`
<tr>
<td>${escapeHtml(formatExportDate(r.timestamp))}</td>
<td>${escapeHtml(r.device_id)}</td>
<td>${fmt(r.pm1)}</td>
<td>${fmt(r.pm25)}</td>
<td>${fmt(r.pm10)}</td>
<td>${fmt(r.temperature)}</td>
<td>${fmt(r.humidity)}</td>
<td>${fmt(r.light)}</td>
</tr>
`)
.join("");
$("exportExcelButton").disabled=false;
}
async function refreshExportPreview(){
showExportError("");
exportRows=[];
setExportLoading(true);
try{
exportRows=await loadExportRows();
renderExportPreview();
}catch(e){
console.error(e);
showExportError(e.message);
$("exportPreviewBody").innerHTML=`
<tr>
<td colspan="8" class="export-empty-cell">
ไม่สามารถแสดงตัวอย่างข้อมูลได้
</td>
</tr>
`;
}finally{
setExportLoading(false);
}
}
function openExportModal(){
const w=getSelectedTimeWindow();
const now=new Date();
const end=w?.end||now;
const start=w?.start||new Date(now-86400000);
$("exportStartDate").value=dateToInputValue(start);
$("exportEndDate").value=dateToInputValue(end);
exportRows=[];
$("exportDataCount").textContent="0";
showExportError("");
$("exportModal").classList.add("active");
$("exportModal").setAttribute("aria-hidden","false");
document.body.classList.add("export-modal-open");
refreshExportPreview();
}
function closeExportModal(){
$("exportModal")?.classList.remove("active");
$("exportModal")?.setAttribute("aria-hidden","true");
document.body.classList.remove("export-modal-open");
}
function downloadExportExcel(){
if(!exportRows.length){
showExportError("ไม่มีข้อมูลสำหรับดาวน์โหลด");
return;
}
if(typeof XLSX==="undefined"){
showExportError("ไม่สามารถโหลดระบบสร้าง Excel ได้");
return;
}
const data=exportRows.map(r=>({
"วันที่ / เวลา":formatExportDate(r.timestamp),
"อุปกรณ์":r.device_id||"",
"PM1.0 (µg/m³)":r.pm1??"",
"PM2.5 (µg/m³)":r.pm25??"",
"PM10 (µg/m³)":r.pm10??"",
"อุณหภูมิ (°C)":r.temperature??"",
"ความชื้น (%)":r.humidity??"",
"แสง (lux)":r.light??""
}));
const ws=XLSX.utils.json_to_sheet(data);
ws["!cols"]=[
{wch:22},
{wch:16},
{wch:15},
{wch:15},
{wch:15},
{wch:16},
{wch:16},
{wch:14}
];
const wb=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
wb,
ws,
"PM2.5 Data"
);
XLSX.writeFile(
wb,
`PM25_${$("exportStartDate").value}_to_${$("exportEndDate").value}.xlsx`
);
}
const HELP_CONTENT={
monitoring:{
title:"Monitoring Nodes",
html:`
<p>
แสดงสถานะและค่าตรวจวัดล่าสุดของอุปกรณ์ทั้ง 3 จุด
โดยค่าบนการ์ดเป็นค่าล่าสุดที่ระบบเคยได้รับ
</p>
<div class="help-status-list">
<div>
<span class="help-status-dot online"></span>
<b>ONLINE</b>
<span>อุปกรณ์กำลังเชื่อมต่อและส่งข้อมูล</span>
</div>
<div>
<span class="help-status-dot sleep"></span>
<b>SLEEP</b>
<span>อุปกรณ์อยู่ในโหมดพักตามรอบการทำงาน</span>
</div>
<div>
<span class="help-status-dot offline"></span>
<b>OFFLINE</b>
<span>ระบบไม่สามารถยืนยันการเชื่อมต่อได้</span>
</div>
</div>
<p>
<b>Last update</b>
คือเวลาของข้อมูล/สถานะล่าสุด
ส่วน Gateway คืออุปกรณ์แม่ที่เชื่อม ESP-NOW กับ Cloud
</p>
<p class="help-muted">
เมื่อ Gateway Offline
ระบบจะถือว่าอุปกรณ์ลูกทุกตัว Offline
จนกว่าจะได้รับข้อมูลใหม่จริง
</p>
`
},
smartSummary:{
title:"Smart Summary",
html:`
<p>
สรุปสถานการณ์อัตโนมัติจากกฎของระบบ
เช่น Gateway, สถานะอุปกรณ์ และ PM2.5 ภาพรวม
</p>
<p>
ส่วนนี้ยัง <b>ไม่ใช่ AI</b>
และไม่ได้สร้างคำตอบด้วยโมเดลภาษา
</p>
`
},
currentAir:{
title:"คุณภาพอากาศและสภาพแวดล้อมปัจจุบัน",
html:`
<p>
ส่วนนี้ใช้สำหรับดูค่าตรวจวัดล่าสุดจากอุปกรณ์ที่ระบบยืนยันว่ากำลังใช้งาน
</p>
<p>
สามารถเลือกดูได้ 6 ตัวแปร ได้แก่
<b>PM1.0, PM2.5, PM10, อุณหภูมิ, ความชื้น และแสง</b>
</p>
<ul>
<li>
<b>ค่าภาพรวม</b>
— ค่าเฉลี่ยล่าสุดจากจุดตรวจวัดที่ใช้งานได้
</li>
<li>
<b>จุดที่มีค่าสูงสุด</b>
— อุปกรณ์ที่มีค่าของตัวแปรที่เลือกสูงที่สุด
</li>
<li>
<b>จุดที่ต้องเฝ้าระวัง</b>
— จุดที่ค่าตรวจวัดเข้าเงื่อนไขเฝ้าระวังของระบบ
</li>
</ul>
<p>
การเปลี่ยนตัวแปรในส่วนนี้
จะไม่เปลี่ยนตัวแปรที่เลือกใน Historical Data & Trend
</p>
<p class="help-muted">
หาก Gateway Offline
ระบบจะไม่ใช้ค่าที่ค้างอยู่ในฐานข้อมูลมาประเมินเป็นสถานการณ์ปัจจุบัน
</p>
`
},
historical:{
title:"Historical Data & Trend",
html:`
<p>
ใช้ดูข้อมูลย้อนหลังตามตัวแปรและช่วงเวลาที่เลือก
โดยไม่กระทบค่าล่าสุดบน Monitoring Nodes
</p>
<ul>
<li>
เลือก PM1.0, PM2.5, PM10, อุณหภูมิ, ความชื้น หรือแสง
</li>
<li>
ดูค่าเฉลี่ย สูงสุด ต่ำสุด ล่าสุด และแนวโน้ม
</li>
<li>
กำหนดช่วงเวลาเองได้
</li>
<li>
ส่งออกเป็น Excel ได้
</li>
</ul>
`
},
forecast:{
title:"Forecast",
html:`
<p>
คาดการณ์ระยะสั้นจากข้อมูลย้อนหลังล่าสุดของตัวแปรที่เลือก
โดยใช้ Linear Regression และช่วงความคลาดเคลื่อน
</p>
<p>
เส้นข้อมูลจริงมาจากเซนเซอร์
ส่วน Forecast เป็นค่าประมาณ
และสามารถเปิด/ซ่อนได้
</p>
<p class="help-muted">
ปัจจุบันยังไม่ใช่ AI/ML
และไม่ใช่ค่าที่เซนเซอร์วัดจริงในอนาคต
</p>
`
},
ai:{
title:"AI วิเคราะห์สถานการณ์",
html:`
<p>
พื้นที่สำหรับ AI ที่จะวิเคราะห์ข้อมูลหลายส่วนร่วมกัน
เช่น ค่าปัจจุบัน, Alerts, Historical Data & Trend และ Forecast
</p>
<p>
ปัจจุบันยังไม่ได้เชื่อม AI API
</p>
`
}
};
function getHelpHtml(key){
return HELP_CONTENT[key]?.html||"";
}
function positionHelpPopover(button){
const p=$("helpPopover");
if(!p||!button)return;
const r=button.getBoundingClientRect();
const margin=12;
const gap=10;
const w=Math.min(
390,
window.innerWidth-margin*2
);
p.style.width=w+"px";
p.style.visibility="hidden";
p.classList.add("active");
const pr=p.getBoundingClientRect();
let left=Math.max(
margin,
Math.min(
r.right-pr.width,
window.innerWidth-pr.width-margin
)
);
let top=r.bottom+gap;
if(top+pr.height>window.innerHeight-margin){
top=r.top-pr.height-gap;
}
top=Math.max(margin,top);
p.style.left=left+"px";
p.style.top=top+"px";
p.style.visibility="visible";
}
function closeHelpPopover(){
const p=$("helpPopover");
if(p){
p.classList.remove("active");
p.style.visibility="";
p.setAttribute("aria-hidden","true");
}
if(activeHelpButton){
activeHelpButton.classList.remove("is-active");
activeHelpButton.setAttribute("aria-expanded","false");
}
activeHelpButton=null;
}
function openHelpPopover(button){
const key=button?.dataset?.help;
const item=HELP_CONTENT[key];
if(!item)return;
if(
activeHelpButton===button&&
$("helpPopover")?.classList.contains("active")
){
closeHelpPopover();
return;
}
closeHelpPopover();
activeHelpButton=button;
button.classList.add("is-active");
button.setAttribute("aria-expanded","true");
$("helpPopoverTitle").textContent=item.title;
$("helpPopoverBody").innerHTML=getHelpHtml(key);
$("helpPopover").setAttribute("aria-hidden","false");
positionHelpPopover(button);
}
function bindHelpSystem(){
document
.querySelectorAll(".help-button")
.forEach(b=>
b.addEventListener("click",e=>{
e.stopPropagation();
openHelpPopover(b);
})
);
$("helpPopoverClose")?.addEventListener(
"click",
e=>{
e.stopPropagation();
closeHelpPopover();
}
);
$("helpPopover")?.addEventListener(
"click",
e=>e.stopPropagation()
);
document.addEventListener(
"click",
closeHelpPopover
);
window.addEventListener(
"resize",
()=>{
if(activeHelpButton){
positionHelpPopover(activeHelpButton);
}
}
);
window.addEventListener(
"scroll",
()=>{
if(activeHelpButton){
positionHelpPopover(activeHelpButton);
}
},
true
);
}
function bindDashboardEvents(){
const currentMetricSelect=$("currentMetric");
if(currentMetricSelect){
currentMetricSelect.value=currentMetric;
currentMetricSelect.addEventListener(
"change",
()=>{
currentMetric=currentMetricSelect.value;
updateCurrentAirQuality();
}
);
}
$("metric")?.addEventListener(
"change",
e=>{
metric=e.target.value;
drawCharts();
}
);
$("historyRangeButton")?.addEventListener(
"click",
e=>{
e.stopPropagation();
$("historyRangePanel").classList.contains("hidden")
?openHistoryRangePicker()
:closeHistoryRangePicker();
}
);
document
.querySelectorAll(".quick-range-option")
.forEach(b=>
b.addEventListener(
"click",
()=>{
setQuickRange(b.dataset.range);
}
)
);
$("calendarPrev")?.addEventListener(
"click",
()=>{
calendarDisplayDate=new Date(
calendarDisplayDate.getFullYear(),
calendarDisplayDate.getMonth()-1,
1
);
renderRangeCalendar();
}
);
$("calendarNext")?.addEventListener(
"click",
()=>{
calendarDisplayDate=new Date(
calendarDisplayDate.getFullYear(),
calendarDisplayDate.getMonth()+1,
1
);
renderRangeCalendar();
}
);
$("customRangeStart")?.addEventListener(
"change",
()=>{
updateQuickRangeUI(null);
renderRangeCalendar();
}
);
$("customRangeEnd")?.addEventListener(
"change",
()=>{
updateQuickRangeUI(null);
renderRangeCalendar();
}
);
$("historyRangeApply")?.addEventListener(
"click",
applyHistoryRange
);
$("historyRangeCancel")?.addEventListener(
"click",
closeHistoryRangePicker
);
$("forecastToggle")?.addEventListener(
"click",
()=>{
forecastVisible=!forecastVisible;
setForecastDatasetVisibility();
}
);
$("exportButton")?.addEventListener(
"click",
openExportModal
);
$("exportModalClose")?.addEventListener(
"click",
closeExportModal
);
$("exportCancelButton")?.addEventListener(
"click",
closeExportModal
);
document
.querySelectorAll("[data-export-close='true']")
.forEach(e=>
e.addEventListener(
"click",
closeExportModal
)
);
$("exportStartDate")?.addEventListener(
"change",
refreshExportPreview
);
$("exportEndDate")?.addEventListener(
"change",
refreshExportPreview
);
$("exportExcelButton")?.addEventListener(
"click",
downloadExportExcel
);
document.addEventListener(
"keydown",
e=>{
if(e.key==="Escape"){
closeExportModal();
closeHistoryRangePicker();
closeHelpPopover();
if(
$("creditImageModal")
?.classList
.contains("active")
){
closeCreditImage();
}
}
}
);
}
async function load(){
try{
const[l,h,m,a,s]=await Promise.all([
loadLatest(),
loadHistory(),
loadMotherStatus(),
loadAlertStates().catch(()=>[]),
loadStandards().catch(()=>null)
]);
apiConnectionOnline=true;
latestNodes=l;
records=h;
motherStatus=m;
alertStates=a;
standardsData=s;
latestRecord=getLatestTimestampRecord(latestNodes);
renderMonitoringNodes();
updateCurrentAirQuality();
updateSmartSummary();
updateAlerts();
renderAverages();
drawCharts();
}catch(e){
console.error("Dashboard load error:",e);
apiConnectionOnline=false;
motherStatus=null;
alertStates=[];
standardsData=null;
forceAllNodesOffline();
updateCurrentAirQuality();
updateSmartSummary();
updateAlerts();
}
}
function updateClock(){
if($("clock")){
$("clock").textContent=
new Date().toLocaleString(
"th-TH",
{
timeZone:"Asia/Bangkok",
dateStyle:"medium",
timeStyle:"medium"
}
);
}
}
function openCreditImage(src,alt){
const m=$("creditImageModal");
const img=$("creditFullImage");
const cap=$("creditImageCaption");
if(!m||!img)return;
img.src=src;
img.alt=alt||"";
if(cap)cap.textContent=alt||"";
m.classList.add("active");
m.setAttribute("aria-hidden","false");
document.body.style.overflow="hidden";
}
function closeCreditImage(){
const m=$("creditImageModal");
if(!m)return;
m.classList.remove("active");
m.setAttribute("aria-hidden","true");
document.body.style.overflow="";
setTimeout(()=>{
if($("creditFullImage")){
$("creditFullImage").src="";
}
},200);
}
if($("historyRangeButtonLabel")){
$("historyRangeButtonLabel").textContent=getRangeLabel();
}
updateForecastToggleUI();
bindDashboardEvents();
bindHelpSystem();
updateClock();
load();
setInterval(updateClock,1000);
setInterval(load,10000);
setInterval(()=>{
if(apiConnectionOnline){
renderMonitoringNodes();
updateCurrentAirQuality();
updateSmartSummary();
updateAlerts();
}else{
forceAllNodesOffline();
}
},5000);
