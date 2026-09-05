const BASE="https://educational-pm25-api.project2026csemn.workers.dev";

const API={
latest:`${BASE}/api/get_latest.php`,
history:`${BASE}/api/get_history.php`,
export:`${BASE}/api/export.php`,
mother:`${BASE}/api/mother_status`,
alerts:`${BASE}/api/alert_states`,
standards:`${BASE}/api/standards.php`,
ai:`${BASE}/api/ai_analysis`,
forecast:`${BASE}/api/ai_forecast`,
publicConfig:`${BASE}/api/public_config`,
authStatus:`${BASE}/api/auth/status`,
authConfig:`${BASE}/api/auth/config`,
authGoogle:`${BASE}/api/auth/google`,
authLogin:`${BASE}/api/auth/login`,
authRegister:`${BASE}/api/auth/register`,
authMe:`${BASE}/api/auth/me`,
authLogout:`${BASE}/api/auth/logout`,
authBootstrapOwner:`${BASE}/api/auth/bootstrap_owner`,
authChangePassword:`${BASE}/api/auth/change_password`,
authForgotPassword:`${BASE}/api/auth/forgot_password`,
authResetPassword:`${BASE}/api/auth/reset_password`,
authProfileImage:`${BASE}/api/auth/profile_image`,
manageHelp:`${BASE}/api/manage/help`,
manageDevices:`${BASE}/api/manage/devices`,
manageAnnouncement:`${BASE}/api/manage/announcement`,
manageUsers:`${BASE}/api/manage/users`,
manageUsersUpdate:`${BASE}/api/manage/users/update`,
notificationPreferences:`${BASE}/api/auth/notification_preferences`,
notifications:`${BASE}/api/auth/notifications`,
notificationRead:`${BASE}/api/auth/notifications/read`
};

const TOTAL_NODES=3;
const MOTHER_OFFLINE_MS=60*1000;

const $=
id=>
document.getElementById(id);

let latestNodes=[];
let records=[];
let pm10History24h=[];
let pm10History24hLoadedAt=null;
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

let publicDisplayConfig={
devices:[
{device_id:"Number 1",display_name:"จุดตรวจวัด 1",location_name:"",description:""},
{device_id:"Number 2",display_name:"จุดตรวจวัด 2",location_name:"",description:""},
{device_id:"Number 3",display_name:"จุดตรวจวัด 3",location_name:"",description:""}
],
content:{about_heading:"เกี่ยวกับโครงการ",about_intro:"",help_overview:"",help_monitoring:"",help_history:"",help_forecast:""}
};

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
.replace(/\bGateway\b/gi,"สถานีรับข้อมูลหลัก")
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
// NODE READING DATE / TIME
// =====================================================
function thaiNodeReadingDateTime(v){
  const d=parseDate(v);
  if(!d) return "--";

  const now=new Date();
  const dayKey=x=>x.toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"});
  const todayKey=dayKey(now);
  const valueKey=dayKey(d);

  const yesterday=new Date(now.getTime()-24*60*60*1000);
  const yesterdayKey=dayKey(yesterday);

  const time=d.toLocaleTimeString("th-TH",{
    timeZone:"Asia/Bangkok",
    hour:"2-digit",
    minute:"2-digit",
    second:"2-digit",
    hour12:false
  });

  if(valueKey===todayKey) return `วันนี้ ${time}`;
  if(valueKey===yesterdayKey) return `เมื่อวาน ${time}`;

  const date=d.toLocaleDateString("th-TH",{
    timeZone:"Asia/Bangkok",
    day:"numeric",
    month:"short",
    year:"numeric"
  });

  return `${date} ${time}`;
}

// =====================================================
// CHART DATE / TIME LABELS
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

const DAY=24*60*60*1000;
if(span!==null&&span>=3*DAY&&index>0&&Array.isArray(ticks)){
const prevValue=ticks[index-1]?.value;
const prevRaw=prevValue==null?null:scale.getLabelForValue(prevValue);
if(prevRaw&&chartDayKey(prevRaw)===chartDayKey(raw))return"";
}

return text;
}

function graphTooltipTitle(items){
const first=items?.[0];

if(!first){
return"";
}

const parsedX=
finiteNumberOrNull(
first?.parsed?.x
);

if(
parsedX!==null&&
parsedX>100000000000
){
const d=
new Date(parsedX);

return Number.isFinite(
d.getTime()
)
?thaiChartDateTime(
d,
false
)
:"";
}

const raw=
first?.label;

if(raw==null){
return"";
}

if(
/^\+\d+\s*นาที/
.test(
String(raw)
)
){
return String(raw);
}

const d=
parseDate(raw);

return d
?thaiChartDateTime(
d,
false
)
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
// =====================================================

function getNodeStatus(node){

if(
!motherOnline()||
!node
){
return "offline";
}

const s=String(node.status||"offline").toLowerCase();

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
// =====================================================

function getNodeDisplayStatus(node){
const st=getNodeStatus(node);
return st==="offline"?"offline":"online";
}

// =====================================================
// AUTH STATE
// =====================================================

const AUTH_TOKEN_KEY="localAirAuthTokenV33";

let authToken=
  localStorage.getItem(AUTH_TOKEN_KEY)||
  sessionStorage.getItem(AUTH_TOKEN_KEY)||
  "";

if(authToken){
  localStorage.setItem(AUTH_TOKEN_KEY,authToken);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

let authUser=null;
let authGoogleClientId="";
let googleIdentityReady=false;

// =====================================================
// FETCH
// =====================================================

async function fetchJson(url,timeoutMs=15000){

const controller=
new AbortController();

const timer=
setTimeout(
()=>controller.abort(),
timeoutMs
);

let r;

try{

r=
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
Accept:"application/json",
...(typeof authToken!=="undefined"&&authToken?{Authorization:`Bearer ${authToken}`}:{})
},
signal:controller.signal
}

);

}finally{

clearTimeout(timer);

}

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

if(!customRangeStart){
return"30d";
}

const ageMs=
Math.max(
0,
Date.now()-
customRangeStart.getTime()
);

if(ageMs<=24*60*60*1000){
return"24h";
}

if(ageMs<=7*24*60*60*1000){
return"7d";
}

return"30d";

}

return RANGE_CONFIG[
averageRange
]?.apiRange||
"today";

}

async function loadHistory(){

const range=
apiRange();

const url=
`${API.history}?range=${encodeURIComponent(range)}`;

let j;

try{

j=
await fetchJson(
url,
25000
);

}catch(firstError){

console.warn(
"History first attempt failed:",
firstError
);

await new Promise(
resolve=>setTimeout(resolve,650)
);

j=
await fetchJson(
url,
25000
);

}

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
`<span class="${dot}">●</span> ${label}`;

card.classList.toggle(
"offline",
st==="offline"
);

}

function nodeReadingTime(node){

if(!node){
return null;
}

if(node.reading_recorded_at){
return node.reading_recorded_at;
}

const hasReading=
[
"pm1",
"pm25",
"pm10",
"temperature",
"humidity",
"light"
]
.some(
field=>
hasFiniteSensorValue(
node?.[field]
)
);

return(
hasReading&&
node.timestamp
)
?node.timestamp
:null;
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

const valueTime=
nodeReadingTime(
n
);

t.textContent=
valueTime
?thaiNodeReadingDateTime(
valueTime
)
:"--";

}

renderNodeStatus(
i,
n
);

}

const dot=
$("dataStateDotTop");

const st=
$("dataStateStatusTop");

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
"ไม่พร้อมใช้งาน";

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

return n>120
?"warning"
:"info";

}

if(field==="temperature") return temperatureLevel(n).severity;
if(field==="humidity") return humidityLevel(n).severity;

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

const apiLevels=
standardsData?.realtime_guidance?.levels;

if(Array.isArray(apiLevels)&&apiLevels.length){
const row=apiLevels.find(x=>{
const max=x?.max;
return max===null||max===undefined||n<=Number(max);
});
if(row){
const apiLevel=String(row.level||"good");
return{
level:
apiLevel==="critical"
?"critical"
:apiLevel==="warning"
?"warning"
:"normal",
label:String(row.label||"")
};
}
}

if(n<=15){
return{level:"normal",label:"ดีมาก"};
}

if(n<=25){
return{level:"normal",label:"ดี"};
}

if(n<=37.5){
return{level:"normal",label:"ปานกลาง"};
}

if(n<=75){
return{level:"warning",label:"เริ่มมีผลกระทบต่อสุขภาพ"};
}

return{level:"critical",label:"มีผลกระทบต่อสุขภาพ"};

}

// =====================================================
// TEMPERATURE / HUMIDITY INTERPRETATION
// =====================================================

function temperatureLevel(value){
const n=finiteNumberOrNull(value);
if(n===null)return{level:"no_data",label:"ไม่มีข้อมูล",severity:"no_data"};
const apiLevels=standardsData?.temperature?.levels;
if(Array.isArray(apiLevels)&&apiLevels.length){
const row=apiLevels.find(x=>x?.max==null||n<=Number(x.max));
if(row){const level=String(row.level||"normal");return{level,label:String(row.label||"ปกติ"),severity:["very_cold","very_hot"].includes(level)?"critical":level==="normal"?"normal":"warning"};}
}
if(n<8)return{level:"very_cold",label:"หนาวจัด",severity:"critical"};
if(n<16)return{level:"cold",label:"หนาว",severity:"warning"};
if(n<23)return{level:"cool",label:"เย็น",severity:"warning"};
if(n<35)return{level:"normal",label:"ปกติ",severity:"normal"};
if(n<40)return{level:"hot",label:"ร้อน",severity:"warning"};
return{level:"very_hot",label:"ร้อนจัด",severity:"critical"};
}

function humidityLevel(value){
const n=finiteNumberOrNull(value);
if(n===null)return{level:"no_data",label:"ไม่มีข้อมูล",severity:"no_data"};
const apiLevels=standardsData?.humidity?.levels;
if(Array.isArray(apiLevels)&&apiLevels.length){
const row=apiLevels.find(x=>x?.max==null||n<=Number(x.max));
if(row){const level=String(row.level||"normal");return{level,label:String(row.label||"ปกติ"),severity:level==="very_high"?"critical":level==="normal"?"normal":"warning"};}
}
if(n<30)return{level:"low",label:"ต่ำ",severity:"warning"};
if(n<85)return{level:"normal",label:"ปกติ",severity:"normal"};
if(n<95)return{level:"high",label:"สูง",severity:"warning"};
return{level:"very_high",label:"สูงมาก",severity:"critical"};
}

function metricStatus(field,value){
if(field==="pm25"){const g=pm25Guidance(value);return{severity:g.level,label:g.label};}
if(field==="pm10"){const n=finiteNumberOrNull(value);return n===null?{severity:"no_data",label:"ไม่มีข้อมูล"}:n>120?{severity:"warning",label:"เฝ้าระวัง"}:{severity:"info",label:"ข้อมูลประกอบ"};}
if(field==="temperature"){const x=temperatureLevel(value);return{severity:x.severity,label:x.label};}
if(field==="humidity"){const x=humidityLevel(value);return{severity:x.severity,label:x.label};}
return{severity:finiteNumberOrNull(value)===null?"no_data":"info",label:finiteNumberOrNull(value)===null?"ไม่มีข้อมูล":"ข้อมูลประกอบ"};
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

const apiLevels=
standardsData?.heat_index?.levels;

if(Array.isArray(apiLevels)&&apiLevels.length){
const row=apiLevels.find(x=>{
const max=x?.max;
return max===null||max===undefined||n<=Number(max);
});
if(row){
return{
level:String(row.level||"normal"),
label:String(row.label||"")
};
}
}

if(n<27){
return{level:"normal",label:"ต่ำกว่าเกณฑ์เฝ้าระวัง"};
}

if(n<33){
return{level:"watch",label:"เฝ้าระวัง"};
}

if(n<42){
return{level:"warning",label:"เตือนภัย"};
}

if(n<52){
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

function qualityBadge(l,customLabel=null){

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
customLabel||x[0];

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
"ยังไม่สามารถเข้าถึงข้อมูลปัจจุบันได้"
);

}

if(
!motherOnline()
){

return resetCurrent(
"ระบบข้อมูลขาดการเชื่อมต่อ • ไม่สามารถยืนยันข้อมูลปัจจุบันได้"
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
.map(n=>{
const v=Number(n[currentMetric]);
const status=metricStatus(currentMetric,v);
return{n,v,l:status.severity,label:status.label,score:status.severity==="critical"?2:status.severity==="warning"?1:0};
})
.filter(x=>x.score>0)
.sort((a,b)=>b.score-a.score || (currentMetric==="temperature"?Math.abs(b.v-29)-Math.abs(a.v-29):b.v-a.v))[0];

$("currentOverallValue").textContent=
currentValue(
avg
);

$("currentOverallDetail").textContent=
`ค่าเฉลี่ยจาก ${usable.length} จุดที่ ONLINE`;

$("currentHighestValue").textContent=
currentValue(
high[currentMetric]
);

$("currentHighestNode").textContent=
`จุดตรวจวัด ${nodeNo(high.device_id)}`;

const avgStatus=metricStatus(currentMetric,avg);
qualityBadge(avgStatus.severity,avgStatus.label);

$("currentWatchNode").textContent=
watch
?`จุดตรวจวัด ${nodeNo(watch.n.device_id)}`
:"ไม่มี";

$("currentWatchDetail").textContent=
watch
?`${c.label} ${currentValue(watch.v)} • ${watch.label}`
:currentMetric==="pm25"
?"ยังไม่พบจุดที่ PM2.5 เข้าเกณฑ์เฝ้าระวัง"
:currentMetric==="pm10"
?"ยังไม่พบค่ารอบล่าสุดของ PM10 สูงกว่า 120 µg/m³ • การตัดสินมาตรฐานต้องใช้ค่าเฉลี่ย 24 ชั่วโมง"
:currentMetric==="temperature"
?"อุณหภูมิของจุดที่มีข้อมูลอยู่ในระดับปกติ"
:currentMetric==="humidity"
?"ความชื้นของจุดที่มีข้อมูลอยู่ในระดับปกติ"
:`${c.label} ใช้เป็นข้อมูลประกอบและการเปรียบเทียบ`;

if(
$("currentEnvironmentFooter")
){

$("currentEnvironmentFooter").textContent=
`ใช้ข้อมูลล่าสุดจาก ${usable.length} / ${TOTAL_NODES} จุดตรวจวัด`;

}

}

// =====================================================
// PM10 — ค่าเฉลี่ยย้อนหลัง 24 ชั่วโมงสำหรับการสื่อสารในสรุปสถานการณ์
// =====================================================

function pm10AreaAverage24h(){
  const rows=(pm10History24h||[]).filter(r=>finiteNumberOrNull(r?.pm10)!==null);
  if(!rows.length) return {value:null,buckets:0,nodes:0};

  const areaRows=spatialAverageRows(rows,["pm10"],5*60*1000)
    .filter(r=>finiteNumberOrNull(r?.pm10)!==null);
  const values=areaRows.map(r=>finiteNumberOrNull(r.pm10)).filter(v=>v!==null);
  const nodes=new Set(rows.map(r=>String(r?.device_id||"").trim()).filter(Boolean));

  return {
    value:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,
    buckets:values.length,
    nodes:nodes.size
  };
}

async function refreshPM10History24h(){
  try{
    const j=await fetchJson(`${API.history}?range=24h`,25000);
    pm10History24h=(Array.isArray(j?.data)?j.data:[]).map(normalize).filter(Boolean);
    pm10History24hLoadedAt=new Date();
    updateSmart();
  }catch(e){
    console.warn("PM10 24h summary unavailable:",e);
  }
}

function pm10Summary24h(){
  const result=pm10AreaAverage24h();
  const value=result.value;
  if(value===null){
    return {
      value:"--",
      level:"no_data",
      sub:"ยังไม่มีข้อมูลย้อนหลังเพียงพอสำหรับค่าเฉลี่ย 24 ชั่วโมง"
    };
  }

  if(value>120){
    return {
      value:`${fmt(value)} µg/m³`,
      level:"warning",
      sub:"เฉลี่ยย้อนหลัง 24 ชม. • สูงกว่าค่าอ้างอิงไทย 120 µg/m³"
    };
  }

  return {
    value:`${fmt(value)} µg/m³`,
    level:"normal",
    sub:"เฉลี่ยย้อนหลัง 24 ชม. • ไม่สูงกว่าค่าอ้างอิงไทย 120 µg/m³"
  };
}

// =====================================================
// SMART SUMMARY
// =====================================================

function updateSmart(){

const e=$("aiSummary");
if(!e)return;

const waitingCard=(icon,title,sub="รอข้อมูลล่าสุด")=>`
<div class="smart-summary-stat">
<div class="smart-summary-stat-label">${icon} ${title}</div>
<div class="smart-summary-stat-value">ยังประเมินไม่ได้</div>
<div class="smart-summary-stat-sub">${sub}</div>
</div>`;

if(!apiConnectionOnline){
e.innerHTML=`
<div class="smart-summary-headline offline">🔴 ยังไม่สามารถตรวจสอบสถานการณ์ปัจจุบันได้</div>
<div class="smart-summary-grid smart-summary-grid-six">
${waitingCard("🌿","คุณภาพอากาศ")}
${waitingCard("☀️","ดัชนีความร้อน")}
${waitingCard("🌡️","อุณหภูมิ")}
${waitingCard("💧","ความชื้น")}
${waitingCard("📍","จุดตรวจวัด","ยังยืนยันความพร้อมของจุดตรวจวัดไม่ได้")}
${waitingCard("🏃","กิจกรรมกลางแจ้ง","รอข้อมูลก่อนให้คำแนะนำ")}
</div>
<div class="smart-summary-note danger">กรุณารอให้ข้อมูลปัจจุบันพร้อมก่อนใช้ประกอบการตัดสินใจ</div>`;
return;
}

if(!motherOnline()){
e.innerHTML=`
<div class="smart-summary-headline offline">🔴 ยังไม่สามารถยืนยันข้อมูลปัจจุบันได้</div>
<div class="smart-summary-grid smart-summary-grid-six">
${waitingCard("🌿","คุณภาพอากาศ")}
${waitingCard("☀️","ดัชนีความร้อน")}
${waitingCard("🌡️","อุณหภูมิ")}
${waitingCard("💧","ความชื้น")}
${waitingCard("📍","จุดตรวจวัด","ขณะนี้ยังยืนยันความพร้อมไม่ได้")}
${waitingCard("🏃","กิจกรรมกลางแจ้ง","รอข้อมูลก่อนให้คำแนะนำ")}
</div>
<div class="smart-summary-note danger">ข้อมูลเดิมจะไม่ถูกนำมาแสดงเป็นสถานการณ์ปัจจุบันเมื่อยังยืนยันข้อมูลใหม่ไม่ได้</div>`;
return;
}

const snap=currentEnvironmentSnapshot();
const air=combinedAirQualitySummary(snap);
const heat=heatLevel(snap.heatIndex);
const tempInfo=temperatureLevel(snap.temperature);
const humidityInfo=humidityLevel(snap.humidity);

const on=latestNodes.filter(n=>getNodeDisplayStatus(n)==="online").length;
const off=TOTAL_NODES-on;

let severity="normal";
let headline="🟢 ภาพรวมปกติ";

if(
air.level==="critical"||
heat.level==="critical"||
tempInfo.severity==="critical"||
humidityInfo.severity==="critical"
){
severity="critical";
headline="🔴 มีข้อมูลที่ควรให้ความสำคัญ";
}else if(
air.level==="warning"||
heat.level==="warning"||
heat.level==="watch"||
tempInfo.severity==="warning"||
humidityInfo.severity==="warning"||
off>0
){
severity="watch";
headline="🟡 มีข้อมูลที่ควรติดตาม";
}

const heatLabel=snap.heatIndex==null
?"รอข้อมูล"
:(heat.level==="normal"?"ปกติ":heat.label);
const heatValue=snap.heatIndex==null
?"--"
:`${fmt(snap.heatIndex)} °C`;
const heatSub=snap.heatIndex==null
?"ต้องมีอุณหภูมิและความชื้นจึงจะประเมินได้"
:`${heatLabel} • ใช้ดูความร้อนที่ร่างกายอาจรู้สึก`;

const tempValue=snap.temperature==null
?"--"
:`${fmt(snap.temperature)} °C`;
const tempSub=snap.temperature==null
?"รอข้อมูลล่าสุด"
:`${tempInfo.label} • เทียบเพื่อเฝ้าระวังเบื้องต้น`;

const humidityValue=snap.humidity==null
?"--"
:`${fmt(snap.humidity)}%`;
const humiditySub=snap.humidity==null
?"รอข้อมูลล่าสุด"
:`${humidityInfo.label} • ควรดูร่วมกับอุณหภูมิ`;

const systemMain=off===0
?`พร้อม ${on} / ${TOTAL_NODES} จุด`
:`พร้อม ${on} / ${TOTAL_NODES} จุด`;
const systemSub=off===0
?"จุดตรวจวัดทั้งหมดพร้อมแสดงข้อมูลปัจจุบัน"
:`มี ${off} จุดที่ยังไม่พร้อม`;

const activity=activityRecommendation(snap.pm25,snap.pm10,snap.heatIndex);
const activityGood=
!["critical","warning"].includes(air.level)&&
!["critical","warning"].includes(heat.level)&&
tempInfo.severity!=="critical"&&
humidityInfo.severity!=="critical";
const activityMain=activityGood?"ทำกิจกรรมได้ตามปกติ":"ควรเพิ่มความระมัดระวัง";

const summaryParticle=(typeof overviewParticleMetric!=="undefined"?overviewParticleMetric:"pm25");
const pm25Now=finiteNumberOrNull(snap.pm25);
const pm25Info=pm25Guidance(pm25Now);
const pm10Day=pm10Summary24h();

const airMetricLabel=summaryParticle==="pm10"?"PM10":"PM2.5";
const airValue=summaryParticle==="pm10"
?pm10Day.value
:(pm25Now===null?"รอข้อมูล":`${pm25Info.label} • ${fmt(pm25Now)} µg/m³`);
const airSub=summaryParticle==="pm10"
?pm10Day.sub
:(pm25Now===null
?"ยังไม่มีข้อมูล PM2.5 ปัจจุบัน"
:"ใช้ PM2.5 เพื่อสื่อสารระดับคุณภาพอากาศปัจจุบัน");

e.innerHTML=`
<div class="smart-summary-headline ${severity}">${headline}</div>

<div class="smart-summary-grid smart-summary-grid-six">
<div class="smart-summary-stat smart-summary-air smart-summary-air-switch">
<div class="smart-summary-stat-label">🌿 คุณภาพอากาศ • ${airMetricLabel}</div>
<div class="smart-summary-stat-value">${esc(airValue)}</div>
<div class="smart-summary-stat-sub">${esc(airSub)}</div>
</div>

<div class="smart-summary-stat smart-summary-heat">
<div class="smart-summary-stat-label">☀️ ดัชนีความร้อน</div>
<div class="smart-summary-stat-value">${esc(heatValue)}</div>
<div class="smart-summary-stat-sub">${esc(heatSub)}</div>
</div>

<div class="smart-summary-stat smart-summary-temperature">
<div class="smart-summary-stat-label">🌡️ อุณหภูมิ</div>
<div class="smart-summary-stat-value">${esc(tempValue)}</div>
<div class="smart-summary-stat-sub">${esc(tempSub)}</div>
</div>

<div class="smart-summary-stat smart-summary-humidity">
<div class="smart-summary-stat-label">💧 ความชื้น</div>
<div class="smart-summary-stat-value">${esc(humidityValue)}</div>
<div class="smart-summary-stat-sub">${esc(humiditySub)}</div>
</div>

<div class="smart-summary-stat smart-summary-system">
<div class="smart-summary-stat-label">📍 จุดตรวจวัด</div>
<div class="smart-summary-stat-value">${esc(systemMain)}</div>
<div class="smart-summary-stat-sub">${esc(systemSub)}</div>
</div>

<div class="smart-summary-stat smart-summary-activity-card ${activityGood?"":"is-watch"}">
<div class="smart-summary-stat-label">🏃 กิจกรรมกลางแจ้ง</div>
<div class="smart-summary-stat-value">${esc(activityMain)}</div>
<div class="smart-summary-stat-sub">${esc(activity)}</div>
</div>
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
'<div class="soft rounded-xl p-3"><b class="text-red-300">🔴 ยังไม่สามารถเข้าถึงข้อมูลปัจจุบันได้</b></div>';

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

const tempState=String(state.temperature_level||"normal");
const humState=String(state.humidity_level||"normal");
const heatState=String(state.heat_index_level??state.temperature_level??"normal");

if(tempState!=="normal"){
const t=temperatureLevel(n?.temperature);
list.push({icon:t.severity==="critical"?"🔴":"🟡",title:`จุดตรวจวัด ${i} • อุณหภูมิ ${t.label}`,detail:`${fmt(n?.temperature)} °C • เทียบเกณฑ์ลักษณะอากาศเพื่อเฝ้าระวังเบื้องต้น`});
}

if(humState!=="normal"){
const hu=humidityLevel(n?.humidity);
list.push({icon:hu.severity==="critical"?"🔴":"🟡",title:`จุดตรวจวัด ${i} • ความชื้น ${hu.label}`,detail:`ความชื้นสัมพัทธ์ ${fmt(n?.humidity)} % • ควรดูร่วมกับอุณหภูมิอากาศและดัชนีความร้อน`});
}

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
`จุดตรวจวัด ${i} • ดัชนีความร้อน ${h.label}`,

detail:
`ดัชนีความร้อน ${fmt(hi)} °C • ${h.label}`

});

}else{

const hi=
heatIndexC(
n?.temperature,
n?.humidity
);

const h=
heatLevel(
hi
);

if(h.level==="watch"){
list.push({
icon:"🟢",
title:`จุดตรวจวัด ${i} • ดัชนีความร้อนระดับเฝ้าระวัง`,
detail:`ดัชนีความร้อน ${fmt(hi)} °C • ${h.label}`
});
}

}

const pm10=
finiteNumberOrNull(
n?.pm10
);

if(pm10!==null&&pm10>120){
list.push({
icon:"🟡",
title:`จุดตรวจวัด ${i} • PM10 ควรเฝ้าระวัง`,
detail:`PM10 รอบล่าสุด ${fmt(pm10)} µg/m³ • ค่านี้เป็นสัญญาณให้ติดตามเพิ่มเติม ไม่ใช่ผลตัดสินมาตรฐาน 24 ชั่วโมง`
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

function historyRangeButtonText(){

if(
averageRange!=="custom"||
!customRangeStart||
!customRangeEnd
){

return rangeLabel();

}

const start=
customRangeStart;

const end=
customRangeEnd;

const sameDay=
start.getFullYear()===end.getFullYear()&&
start.getMonth()===end.getMonth()&&
start.getDate()===end.getDate();

const dayFmt=
new Intl.DateTimeFormat(
"th-TH",
{
timeZone:"Asia/Bangkok",
day:"numeric",
month:"short"
}
);

const yearFmt=
new Intl.DateTimeFormat(
"th-TH",
{
timeZone:"Asia/Bangkok",
year:"2-digit"
}
);

const timeFmt=
new Intl.DateTimeFormat(
"th-TH",
{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
hour12:false
}
);

if(sameDay){

return`${dayFmt.format(start)} • ${timeFmt.format(start)}–${timeFmt.format(end)}`;

}

const sameMonth=
start.getFullYear()===end.getFullYear()&&
start.getMonth()===end.getMonth();

if(sameMonth){

return`${start.getDate()}–${end.getDate()} ${new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",month:"short"}).format(end)} ${yearFmt.format(end)}`;

}

return`${dayFmt.format(start)}–${dayFmt.format(end)} ${yearFmt.format(end)}`;

}

function updateHistoryRangeButtonLabel(){

const label=
$("historyRangeButtonLabel");

if(!label){
return;
}

const text=
historyRangeButtonText();

label.textContent=
text;

label.title=
averageRange==="custom"
?rangeLabel()
:text;

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

function isRealHistoryReading(row,field=null){

if(!row)return false;

if(String(row.status||"").toLowerCase()!=="online"){
return false;
}

if(field){
return hasFiniteSensorValue(row[field]);
}

return hasAnySensorData(row);

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
isRealHistoryReading(r)
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
const field=ds.metricField;

const plotted=
finiteNumberOrNull(
ctx?.parsed?.y
);

if(
field&&
plotted!==null
){
return `${ds.label}: ${fmt(plotted)} ${metricUnitFor(field)}`.trim();
}

if(
plotted!==null
){
return `${ds.label}: ${fmt(plotted)}`;
}

return `${ds.label}: --`;
}

function isMobileChart(){
return window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
}

function graphLegendOptions(){
return{
display:true,
position:"top",
align:"start",
labels:{
boxWidth:18,
boxHeight:2,
padding:14,
font:{
size:Math.max(10,chartFontSize()-1)
},
sort:(a,b)=>{
const af=String(a?.text||"").includes("คาดการณ์")||String(a?.text||"").includes("Forecast");
const bf=String(b?.text||"").includes("คาดการณ์")||String(b?.text||"").includes("Forecast");
if(af!==bf)return af?1:-1;
return Number(a?.datasetIndex||0)-Number(b?.datasetIndex||0);
}
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
interaction:{mode:"nearest",intersect:true},
plugins:{
legend:{display:false},
tooltip:{
mode:"nearest",
intersect:true,
callbacks:{
title:graphTooltipTitle,
label:graphTooltipLabel
}
}
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
beginAtZero:false,
title:{display:true,text:yTitle,font:{size:chartFontSize(),weight:"600"}},
ticks:{
font:{size:chartFontSize()},
callback:function(value){
const n=finiteNumberOrNull(value);
if(n===null)return value;
return Math.abs(n)>=1000
?new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(n)
:new Intl.NumberFormat("th-TH",{maximumFractionDigits:1}).format(n);
}
},
grid:{color:"rgba(148,163,184,.08)"}
}
}
};
}
function forecastTickText(scale,value,index,ticks){
const raw=scale.getLabelForValue(value);
const text=String(raw??"");
const labels=scale?.chart?.data?.labels||[];

const forecastStart=
labels.findIndex(
v=>
/^\+\d+\s*นาที/.test(
String(v??"")
)
);

const actualCount=
forecastStart>=0
?forecastStart
:labels.length;

if(
/^\+\d+\s*นาที/.test(text)
){
return"";
}

const d=parseDate(raw);
if(!d)return"";

const width=
Number(
scale?.width||
scale?.chart?.width||
window.innerWidth||
0
);

const labelCount=
width<520
?2
:3;

const wanted=
new Set();

if(actualCount>0){

wanted.add(0);

const lastIndex=
Math.max(
0,
actualCount-1
);

wanted.add(lastIndex);

if(
labelCount>2&&
lastIndex>1
){
wanted.add(
Math.round(
lastIndex/2
)
);
}
}

if(
!wanted.has(
Number(value)
)
){
return"";
}

return d.toLocaleTimeString(
"th-TH",
{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
hour12:false
}
);
}

function forecastChartOptions(yTitle){
const base=groupedChartOptions(yTitle);

base.layout={
padding:{
right:
window.innerWidth<=640
?16
:22
}
};

base.scales.x={
offset:true,
grid:{display:false},
title:{
display:true,
text:"เวลา • จุดเส้นประด้านขวา = อีก 10 / 20 / 30 นาที",
font:{
size:Math.max(10,chartFontSize()-2),
weight:"500"
},
padding:{top:6}
},
ticks:{
autoSkip:false,
maxRotation:0,
minRotation:0,
padding:8,
font:{
size:Math.max(10,chartFontSize()-1)
},
callback:function(value,index,ticks){
return forecastTickText(
this,
value,
index,
ticks
);
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
const key=String(id??"").trim();
const configured=(publicDisplayConfig?.devices||[]).find(x=>x.device_id===key);
if(configured?.display_name){
const location=String(configured.location_name||"").trim();
return location?`${configured.display_name} • ${location}`:configured.display_name;
}
const m=key.match(/(\d+)/);
return m?`จุดตรวจวัด ${m[1]}`:key;
}

function historyRowsForNode(rows,nodeId){
return (rows||[]).filter(r=>String(r?.device_id??"").trim()===nodeId);
}

function historyDisplayRows(rows){
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
if(!isRealHistoryReading(r,field))continue;
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

function distinctMonitoringPoints(rows){
return new Set(
(rows||[])
.map(r=>String(r?.device_id||""))
.filter(id=>DEVICE_IDS.includes(id))
).size;
}

function spatialAverageRows(rows,fields=GRAPH_FIELDS,bucketMs=5*60*1000){
const buckets=new Map();
const validNodes=new Set(HISTORY_NODES);

for(const r of rows||[]){
if(!isRealHistoryReading(r))continue;
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
isForecast:true,
metricField:field,
rawValues:raw,
data:raw,
borderColor:metricColor(field),
backgroundColor:"transparent",
borderDash:[6,5],
borderWidth:2,
pointRadius:2,
tension:.08,
hidden:!forecastVisible,
cubicInterpolationMode:"monotone"
};
}

function drawCharts(){

if(typeof Chart==="undefined"){
const area=$("historyChartArea");
if(area)area.innerHTML='<div class="chart-empty chart-loading-state"><b>กำลังโหลดข้อมูลย้อนหลัง</b><span>กราฟจะพร้อมแสดงอัตโนมัติเมื่อข้อมูลโหลดเสร็จ</span></div>';
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
const arr=avgBase.filter(r=>isRealHistoryReading(r,field));
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
drawForecast(spatialAverageRows(allBase));
return;
}

area.innerHTML='<canvas id="historyChart"></canvas>';

const sourceRows=averageMode?areaAverageBase:base;
const chartRows=sourceRows.filter(r=>isRealHistoryReading(r,metric));
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
const data=buildNodeComparisonData(base.filter(r=>isRealHistoryReading(r,metric)),metric);
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
drawForecast(spatialAverageRows(allBase,[metric]));
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

function hideForecastTechnicalMessage(){
const el=$("forecastMessage");
if(!el)return;
el.innerHTML="";
el.style.display="none";
}

function updateForecastToggle(){

hideForecastTechnicalMessage();

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

b.setAttribute(
"aria-checked",
forecastVisible
?"true"
:"false"
);

b.setAttribute(
"aria-pressed",
forecastVisible
?"true"
:"false"
);

b.title=
forecastVisible
?"กดเพื่อซ่อน Forecast"
:"กดเพื่อแสดง Forecast";

l.textContent=
forecastVisible
?"กำลังแสดงการคาดการณ์"
:"ซ่อนการคาดการณ์";

if(s){

s.textContent=
forecastVisible
?"ON"
:"OFF";

}

const charts=[
forecastChart,
...forecastGroupCharts
]
.filter(Boolean);

charts.forEach(chart=>{

if(
!chart?.data?.datasets
){
return;
}

chart.data.datasets.forEach((ds,i)=>{

const label=
String(
ds?.label||
""
);

const isForecast=
ds?.isForecast===true||
label.includes("Forecast")||
label.includes("คาดการณ์");

if(isForecast){

chart.setDatasetVisibility(
i,
forecastVisible
);

}

});

chart.update(
"none"
);

});

}

function aiTrendFor(field){
const list=aiForecastPayload?.data?.trend_analysis;
if(!Array.isArray(list))return null;
return list.find(x=>x?.field===field)||null;
}
function aiDirectionText(direction){
return {increasing:"↗ เพิ่มขึ้น",decreasing:"↘ ลดลง",stable:"→ ค่อนข้างคงที่",uncertain:"? ยังไม่แน่ชัด"}[direction]||"? ยังไม่แน่ชัด";
}
function forecastScopeData(scope){

const list=
Array.isArray(
aiForecastPayload?.data?.scope_forecasts
)
?aiForecastPayload.data.scope_forecasts
:[];

const found=
list.find(
x=>
String(x?.scope||"").trim()===scope
);

if(found){
return found;
}

if(scope==="AREA"&&aiForecastPayload?.data){
return{
scope:"AREA",
confidence:
aiForecastPayload.data.confidence||
"low",
trend_analysis:
aiForecastPayload.data.trend_analysis||
[],
forecast_points:
aiForecastPayload.data.forecast_points||
[]
};
}

return null;
}

function forecastPointsForScope(scope,field){

const s=
forecastScopeData(scope);

const fp=
Array.isArray(
s?.forecast_points
)
?s.forecast_points.find(
x=>x?.field===field
)
:null;

if(!fp){
return null;
}

const pts=[
finiteNumberOrNull(fp.p10),
finiteNumberOrNull(fp.p20),
finiteNumberOrNull(fp.p30)
];

return pts.every(
v=>v!==null
)
?pts
:null;
}

function selectedForecastScope(){

if(historyNode==="average"){
return"AREA";
}

if(
["Number 1","Number 2","Number 3"]
.includes(historyNode)
){
return historyNode;
}

return"AREA";
}

function recentRowsForScope(
allRows,
scope,
field=null,
limit=12
){

let rows;

if(scope==="AREA"){
rows=
spatialAverageRows(
allRows,
field?[field]:GRAPH_FIELDS
);
}else{
rows=
historyRowsForNode(
allRows,
scope
);
}

return rows
.filter(r=>
parseDate(r?.timestamp)&&
(
field
?hasFiniteSensorValue(r?.[field])
:hasAnySensorData(r)
)
)
.sort(
(a,b)=>
parseDate(a.timestamp)-
parseDate(b.timestamp)
)
.slice(-limit);
}

function buildForecastCompareData(
allRows,
field
){

const actualByNode={};
const labelSet=new Set();

for(const nodeId of HISTORY_NODES){

const rows=
recentRowsForScope(
allRows,
nodeId,
field,
12
);

actualByNode[nodeId]=rows;

for(const r of rows){
labelSet.add(r.timestamp);
}
}

const actualLabels=
[...labelSet]
.sort(
(a,b)=>
parseDate(a)-
parseDate(b)
);

const labels=[
...actualLabels,
"+10 นาที",
"+20 นาที",
"+30 นาที"
];

const actualDatasets=[];
const forecastDatasets=[];

for(const nodeId of HISTORY_NODES){

const rows=
actualByNode[nodeId];

const map=
new Map(
rows.map(
r=>[
r.timestamp,
finiteNumberOrNull(r[field])
]
)
);

const actualValues=
actualLabels.map(
label=>
map.has(label)
?map.get(label)
:null
);

actualDatasets.push(
makeNodeDataset(
nodeId,
field,
[
...actualValues,
null,
null,
null
]
)
);

const pts=
forecastPointsForScope(
nodeId,
field
);

if(pts){

const latestRow=
[...rows]
.reverse()
.find(
r=>
hasFiniteSensorValue(
r[field]
)
);

const current=
latestRow
?finiteNumberOrNull(
latestRow[field]
)
:null;

const forecastValues=
new Array(
actualLabels.length+3
)
.fill(null);

if(
latestRow&&
current!==null
){

const idx=
actualLabels.indexOf(
latestRow.timestamp
);

if(idx>=0){
forecastValues[idx]=current;
}
}

forecastValues[
actualLabels.length
]=pts[0];

forecastValues[
actualLabels.length+1
]=pts[1];

forecastValues[
actualLabels.length+2
]=pts[2];

const fd=
makeNodeDataset(
nodeId,
field,
forecastValues
);

fd.label=
`${historyNodeLabel(nodeId)} • คาดการณ์`;

fd.isForecast=true;

fd.borderDash=[
6,
5
];

fd.pointRadius=2;
fd.tension=.08;
fd.hidden=
!forecastVisible;

forecastDatasets.push(fd);
}
}

return{
labels,
datasets:[
...actualDatasets,
...forecastDatasets
]
};
}

function drawForecast(arr){

hideForecastTechnicalMessage();

forecastGroupCharts=
destroyChartList(
forecastGroupCharts
);

destroyChartSafe(
forecastChart
);

forecastChart=null;

const area=
$("forecastChartArea");

if(!area){
return;
}

const allRows=
selectedRecords()
.filter(
r=>parseDate(r?.timestamp)
)
.sort(
(a,b)=>
parseDate(a.timestamp)-
parseDate(b.timestamp)
);

const compareMode=
historyNode==="compare";

const scope=
selectedForecastScope();

const resultReady=
aiForecastPayload?.data&&
(
aiForecastPayload.ai===true||
[
"all_ai_unavailable",
"fast_forecast"
]
.includes(
aiForecastPayload?.reason
)
);

const providerText=
aiForecastPayload?.ai===true
?"ระบบวิเคราะห์"
:"ระบบคาดการณ์";

if(metric==="all"){

if(compareMode){

area.innerHTML=
`<div style="
display:flex;
align-items:center;
gap:10px 18px;
flex-wrap:wrap;
padding:9px 12px;
margin:0 0 12px;
border:1px solid rgba(56,189,248,.14);
border-radius:12px;
background:rgba(2,132,199,.045);
font-size:12px;
color:#94a3b8">
<span><b style="color:#e2e8f0">เส้นทึบ</b> ข้อมูลจริง</span>
<span><b style="color:#e2e8f0">เส้นประ</b> คาดการณ์</span>
<span><b style="color:#e2e8f0">จุดที่ 1 / 2 / 3</b> = อีก 10 / 20 / 30 นาที</span>
</div>`+
`<div class="metric-chart-grid-3">`+
groupedChartShell("PM1.0","เปรียบเทียบ 3 จุด • ข้อมูลจริง + คาดการณ์","forecastPm1",miniLegend([]))+
groupedChartShell("PM2.5","เปรียบเทียบ 3 จุด • ข้อมูลจริง + คาดการณ์","forecastPm25",miniLegend([]))+
groupedChartShell("PM10","เปรียบเทียบ 3 จุด • ข้อมูลจริง + คาดการณ์","forecastPm10",miniLegend([]))+
groupedChartShell("อุณหภูมิ","เปรียบเทียบ 3 จุด • °C","forecastTemp",miniLegend([]))+
groupedChartShell("ความชื้น","เปรียบเทียบ 3 จุด • %","forecastHumidity",miniLegend([]))+
groupedChartShell("แสง","เปรียบเทียบ 3 จุด • lux","forecastLight",miniLegend([]))+
`</div>`;

const createCompare=
(canvasId,field,yTitle)=>{

const data=
buildForecastCompareData(
allRows,
field
);

const c=
new Chart(
$(canvasId),
{
type:"line",
data,
options:{
...forecastChartOptions(
yTitle
),
plugins:{
legend:
graphLegendOptions(),
tooltip:{
mode:"nearest",
intersect:true,
callbacks:{
title:
graphTooltipTitle,
label:
graphTooltipLabel
}
}
}
}
}
);

forecastGroupCharts.push(c);
};

createCompare(
"forecastPm1",
"pm1",
"µg/m³"
);

createCompare(
"forecastPm25",
"pm25",
"µg/m³"
);

createCompare(
"forecastPm10",
"pm10",
"µg/m³"
);

createCompare(
"forecastTemp",
"temperature",
"°C"
);

createCompare(
"forecastHumidity",
"humidity",
"%"
);

createCompare(
"forecastLight",
"light",
"lux"
);

if($("forecastMessage")){
$("forecastMessage").innerHTML="";
$("forecastMessage").style.display="none";
}

updateForecastToggle();
return;
}

const rows=
recentRowsForScope(
allRows,
scope,
null,
12
);

if(!rows.length){
area.innerHTML=
'<div class="forecast-wait-state is-idle"><div><b>รอข้อมูลสำหรับการคาดการณ์</b><span>เมื่อมีข้อมูลล่าสุดเพียงพอ ระบบจะแสดงแนวโน้มล่วงหน้าให้อัตโนมัติ</span></div></div>';
return;
}

const scopeLabel=
scope==="AREA"
?"ค่าเฉลี่ยพื้นที่"
:historyNodeLabel(scope);

area.innerHTML=
groupedChartShell(
"ฝุ่นละออง",
`${scopeLabel} • ข้อมูลจริง + คาดการณ์`,
"forecastDust",
miniLegend(
["pm1","pm25","pm10"]
)
)+
`<div class="metric-chart-grid-3">`+
groupedChartShell(
"อุณหภูมิ",
`${scopeLabel} • °C`,
"forecastTemp",
miniLegend(
["temperature"]
)
)+
groupedChartShell(
"ความชื้น",
`${scopeLabel} • %`,
"forecastHumidity",
miniLegend(
["humidity"]
)
)+
groupedChartShell(
"แสง",
`${scopeLabel} • lux`,
"forecastLight",
miniLegend(
["light"]
)
)+
`</div>`;

const actualLabels=
rows.map(
r=>r.timestamp
);

const labels=[
...actualLabels,
"+10 นาที",
"+20 นาที",
"+30 นาที"
];

const create=
(canvasId,fields,yTitle)=>{

const datasets=[];

for(const field of fields){

const raw=
rows.map(
r=>
finiteNumberOrNull(
r[field]
)
);

datasets.push({
...makeActualDataset(
field,
raw
),
data:[
...raw,
null,
null,
null
],
rawValues:[
...raw,
null,
null,
null
]
});

const pts=
forecastPointsForScope(
scope,
field
);

if(pts){

const current=
[...raw]
.reverse()
.find(
v=>v!==null
);

const forecastDs=
makeForecastDataset(
field,
raw.length,
current,
pts
);

forecastDs.hidden=
!forecastVisible;

datasets.push(
forecastDs
);
}
}

const c=
new Chart(
$(canvasId),
{
type:"line",
data:{
labels,
datasets
},
options:
forecastChartOptions(
yTitle
)
}
);

forecastGroupCharts.push(c);
};

create(
"forecastDust",
["pm1","pm25","pm10"],
"µg/m³"
);

create(
"forecastTemp",
["temperature"],
"°C"
);

create(
"forecastHumidity",
["humidity"],
"%"
);

create(
"forecastLight",
["light"],
"lux"
);

if($("forecastMessage")){
$("forecastMessage").innerHTML=
resultReady
?`<b class="text-cyan-300">คาดการณ์ 30 นาที • ${esc(scopeLabel)} • ทุกตัวแปร</b>
<div class="mt-2">${esc(providerText)} • แสดง +10, +20 และ +30 นาที</div>
<div class="text-[12px] text-slate-500 mt-2">ผลคาดการณ์ใช้ข้อมูลของ ${esc(scopeLabel)} โดยตรง • ไม่ใช่ค่าที่วัดได้ล่วงหน้า</div>`
:'<div class="ai-unavailable"><b>ยังไม่พร้อมคาดการณ์</b><div class="mt-1">ข้อมูลล่าสุดยังไม่เพียงพอ</div></div>';
}

updateForecastToggle();
return;
}

let rows;

if(compareMode){

const data=
buildForecastCompareData(
allRows,
metric
);

if(
!data.labels.length
){
area.innerHTML=
'<div class="forecast-wait-state is-idle"><div><b>รอข้อมูลสำหรับการคาดการณ์</b><span>ข้อมูลล่าสุดยังไม่เพียงพอ</span></div></div>';
return;
}

area.innerHTML=
'<canvas class="bottom-forecast-canvas" id="forecastChart"></canvas>';

forecastChart=
new Chart(
$("forecastChart"),
{
type:"line",
data,
options:{
...forecastChartOptions(
`${metricLabel()} ${metricUnit()}`.trim()
),
plugins:{
legend:
graphLegendOptions(),
tooltip:{
mode:"nearest",
intersect:true,
callbacks:{
title:
graphTooltipTitle,
label:
graphTooltipLabel
}
}
}
}
}
);

if($("forecastMessage")){
$("forecastMessage").innerHTML=
resultReady
?`<b style="color:${metricColor(metric)}">คาดการณ์ 30 นาที • เปรียบเทียบ 3 จุด • ${metricLabel()}</b>
<div class="mt-2">${esc(providerText)} • จุด 1/2/3 ถูกคาดการณ์แยกจากข้อมูลของแต่ละจุด</div>
<div class="text-[12px] text-slate-500 mt-2">เส้นทึบ = ข้อมูลจริง • เส้นประ = +10, +20, +30 นาที</div>`
:'<div class="ai-unavailable"><b>ยังไม่พร้อมคาดการณ์</b></div>';
}

updateForecastToggle();
return;
}

rows=
recentRowsForScope(
allRows,
scope,
metric,
12
);

if(!rows.length){
area.innerHTML=
'<div class="forecast-wait-state is-idle"><div><b>รอข้อมูลสำหรับการคาดการณ์</b><span>ข้อมูลล่าสุดยังไม่เพียงพอ</span></div></div>';
return;
}

const scopeLabel=
scope==="AREA"
?"ค่าเฉลี่ยพื้นที่"
:historyNodeLabel(scope);

const values=
rows.map(
r=>
finiteNumberOrNull(
r[metric]
)
);

const labels=
rows.map(
r=>r.timestamp
);

const datasets=[
makeActualDataset(
metric,
values
)
];

const pts=
forecastPointsForScope(
scope,
metric
);

if(pts){

labels.push(
"+10 นาที",
"+20 นาที",
"+30 นาที"
);

datasets[0].data=[
...values,
null,
null,
null
];

datasets[0].rawValues=[
...values,
null,
null,
null
];

const current=
values.at(-1);

const fd=
makeForecastDataset(
metric,
values.length,
current,
pts
);

fd.hidden=
!forecastVisible;

datasets.push(
fd
);
}

area.innerHTML=
'<canvas class="bottom-forecast-canvas" id="forecastChart"></canvas>';

forecastChart=
new Chart(
$("forecastChart"),
{
type:"line",
data:{
labels,
datasets
},
options:{
...forecastChartOptions(
`${metricLabel()} ${metricUnit()}`.trim()
),
plugins:{
legend:
graphLegendOptions(),
tooltip:{
mode:"nearest",
intersect:true,
callbacks:{
title:
graphTooltipTitle,
label:
graphTooltipLabel
}
}
}
}
}
);

if($("forecastMessage")){
$("forecastMessage").innerHTML="";
$("forecastMessage").style.display="none";
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

function formatRangePickerPreview(value){
const d=value?dateFromRangeInput(value):null;
if(!d)return"--";
return d.toLocaleString("th-TH",{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
year:"numeric",
hour:"2-digit",
minute:"2-digit"
});
}

function updateRangePickerPreviews(){
const s=$("historyRangeStartPreview");
const e=$("historyRangeEndPreview");
if(s)s.textContent=formatRangePickerPreview("customRangeStart");
if(e)e.textContent=formatRangePickerPreview("customRangeEnd");
}

function setHistoryRangeMode(mode){
const next=mode==="custom"?"custom":"quick";
document.querySelectorAll("[data-history-range-mode]").forEach(btn=>{
const active=btn.dataset.historyRangeMode===next;
btn.classList.toggle("active",active);
btn.setAttribute("aria-selected",active?"true":"false");
});
document.querySelectorAll("[data-history-range-panel]").forEach(panel=>{
panel.classList.toggle("active",panel.dataset.historyRangePanel===next);
});
}

function updateHistoryRangeMobileSelection(){
const label=$("historyRangeMobileSelection");
if(!label)return;
const active=document.querySelector(".quick-range-option.active");
label.textContent=active?active.textContent.trim():(averageRange==="custom"?"กำหนดช่วงเอง":"เลือกช่วงเวลา");
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

updateHistoryRangeMobileSelection();

}

function closeHistoryRangePicker(){

document.body.classList.remove(
"history-range-modal-open"
);

const panel=
$("historyRangeModal");

const button=
$("historyRangeButton");

if(panel){

panel.classList.remove(
"active"
);

panel.setAttribute(
"aria-hidden",
"true"
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
$("historyRangeModal");

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

setHistoryRangeMode(averageRange==="custom"?"custom":"quick");
updateRangePickerPreviews();
renderRangeCalendar();

panel.classList.add(
"active"
);

panel.setAttribute(
"aria-hidden",
"false"
);

const modalBody=
panel.querySelector(
".history-range-modal-body"
);

if(modalBody){
modalBody.scrollTop=0;
}

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

averageRange="custom";
updateQuickRangeUI(
null
);
setHistoryRangeMode("custom");
updateRangePickerPreviews();

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

updateHistoryRangeButtonLabel();

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

updateHistoryRangeButtonLabel();

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
await apiJson(
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

if(!requirePermission("export_data","การส่งออกข้อมูล Excel"))return;

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

refreshExport().catch(err=>{
  console.error("Export preview error:",err);
  if($("exportError")){
    $("exportError").textContent=err.message||"ไม่สามารถโหลดข้อมูลสำหรับส่งออกได้";
    $("exportError").classList.remove("hidden");
  }
});

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
return"is-ready";
}

if(
payload.ai===true
){
return"is-connected";
}

if(
payload.reason===
"data_unavailable"
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
return"ข้อมูลพร้อมใช้งาน";
}

if(
payload.ai===true
){
return"AI CONNECTED";
}

if(
payload.reason===
"data_unavailable"
){
return"ระบบข้อมูล OFFLINE";
}

if(
payload.reason===
"gemini_secret_not_configured"
){
return"ยังไม่พร้อมใช้งาน";
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

return"ระบบสำรอง";

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

function cleanAIObservationList(items){

const source=
Array.isArray(items)
?items
:[];

const seen=
new Set();

return source
.map(x=>normalizeProjectWording(x))
.map(x=>String(x||"").trim())
.filter(Boolean)

.filter(x=>
!/\b(?:Node|Number)\s*[123]\b/i.test(x)&&
!/Gateway/i.test(x)&&
!/ออนไลน์|ออฟไลน์|Sleep|OFFLINE|ONLINE/i.test(x)
)

.filter(x=>{
const key=x
.toLowerCase()
.replace(/\s+/g," ");
if(seen.has(key))return false;
seen.add(key);
return true;
})

.slice(0,3);

}

function aiSituationHeadline(data){

const headline=
normalizeProjectWording(
data?.headline
);

if(
headline&&
String(headline).trim()
){
return String(headline).trim();
}

return"กำลังประเมินสถานการณ์จากข้อมูลล่าสุด";

}

function aiSituationSummary(data){

const summary=
normalizeProjectWording(
data?.summary
);

if(
summary&&
String(summary).trim()
){
return String(summary).trim();
}

return"ยังไม่มีข้อสรุปเพิ่มเติมในขณะนี้";

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

if(aiLoading){

details.innerHTML=
'<div class="ai-loading-state"><span class="ai-loading-dot"></span>กำลังตีความสถานการณ์จากข้อมูลล่าสุด...</div>';

return;
}

if(!payload){

details.innerHTML=
`<div class="ai-result-headline">ยังไม่มีบทวิเคราะห์ในขณะนี้</div>
<div class="ai-result-summary">ดูค่าตรวจวัดล่าสุดได้จากหน้า “ภาพรวม” และ “จุดตรวจวัด”</div>`;

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
cleanAIObservationList(
data.observations
);

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
timeZone:"Asia/Bangkok"
}
)}`
:"อัปเดตการวิเคราะห์: --";
}

const recommendation=
normalizeProjectWording(
data.recommendation
)||
"ติดตามการเปลี่ยนแปลงของข้อมูลในรอบถัดไป";

details.innerHTML=
`
<div class="ai-result-section">

<div class="ai-result-label">
ภาพรวมที่ AI ตีความ
</div>

<div class="ai-result-headline">
${esc(aiSituationHeadline(data))}
</div>

<div class="ai-result-summary">
${esc(aiSituationSummary(data))}
</div>

</div>

${observations.length
?`
<div class="ai-result-section">

<div class="ai-result-label">
สิ่งที่ควรสนใจ
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
:`
<div class="ai-result-section">

<div class="ai-result-label">
สิ่งที่ควรสนใจ
</div>

<div class="ai-result-summary">
ยังไม่พบประเด็นเพิ่มเติมที่จำเป็นต้องเน้นจากข้อมูลชุดนี้
</div>

</div>
`
}

<div class="ai-result-section">

<div class="ai-result-label">
คำแนะนำสำหรับตอนนี้
</div>

<div class="ai-recommendation">
${esc(recommendation)}
</div>

</div>

<div class="ai-meta-row">
<span>AI ทำหน้าที่ตีความข้อมูล ไม่ได้แสดงรายการค่าตรวจวัดซ้ำจากหน้าอื่น</span>
</div>`;

}

async function loadAI(
force=false
){

if(force&&(!authUser||!authToken)){
  openAuthModal("login");
  setAuthMessage("loginMessage","เข้าสู่ระบบเพื่อวิเคราะห์ใหม่","error");
  return;
}

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

/* ขอบเขตโครงการเป็นการตรวจวัดระดับพื้นที่ และรองรับข้อความจาก ผลวิเคราะห์เวอร์ชันก่อนหน้า */
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
$("aiForecastDetails");

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
?"ระบบวิเคราะห์"
:provider==="cloudflare"
?"ระบบวิเคราะห์"
:payload?.ai===false
?"ระบบคาดการณ์"
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
?"ระบบวิเคราะห์"
:payload?.provider==="cloudflare"
?"ระบบวิเคราะห์"
:payload?.provider==="rule"
?"ระบบคาดการณ์"
:"AI";

badge.textContent=
isAI
?p
:"ระบบคาดการณ์";

}

if(!box){
return;
}

if(!isAI){

if(
payload?.reason==="fast_forecast" ||
payload?.reason==="all_ai_unavailable"
){

const d=
payload.data||
{};

box.innerHTML=
`<div class="ai-ready-summary">
<b>${esc(d.headline||"แนวโน้มระยะสั้นพร้อมใช้งาน")}</b>
<div class="mt-1">${esc(d.air_forecast||"ระบบกำลังประเมินแนวโน้มจากข้อมูลที่มีอยู่")}</div>
${d.heat_forecast?`<div class="mt-1">${esc(d.heat_forecast)}</div>`:""}
</div>`;

return;
}

box.innerHTML=
`<div class="ai-unavailable">
<b>ยังไม่สามารถสร้างแนวโน้มได้</b>
<div class="mt-1">ข้อมูลที่จำเป็นยังไม่พร้อม กรุณาลองใหม่ภายหลัง</div>
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
${confidenceText(
d.confidence||
"low"
)}
<small>ไม่ใช่เปอร์เซ็นต์ความแม่นยำ</small>
</span>
</div>`;

}

async function loadAIForecast(
force=false
){

if(force&&(!authUser||!authToken)){
  openAuthModal("login");
  setAuthMessage("loginMessage","เข้าสู่ระบบเพื่อวิเคราะห์ใหม่","error");
  return;
}

if(
aiForecastLoading
){
return;
}

aiForecastLoading=
true;

const forecastMessageEl=
$("forecastMessage");

if(forecastMessageEl){
forecastMessageEl.innerHTML=
'<div class="forecast-processing-state"><span class="forecast-processing-spinner" aria-hidden="true"></span><div><b>กำลังวิเคราะห์แนวโน้มล่วงหน้า</b><div class="mt-1">กรุณารอสักครู่ ระบบกำลังวิเคราะห์ข้อมูลล่าสุดและข้อมูลย้อนหลัง...</div></div></div>';
}

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

systemGuide:{
title:"📘 วิธีอ่าน Dashboard",
html:`<div class="help-intro-card"><b>คู่มือรวมสำหรับการอ่านข้อมูล</b><span>ช่วยแยกความหมายของข้อมูลปัจจุบัน ข้อมูลย้อนหลัง และค่าคาดการณ์</span></div>
<section class="help-section"><h4>ข้อมูลปัจจุบัน</h4><p>ใช้ดูสถานการณ์ล่าสุดที่ระบบยืนยันได้ในขณะนั้น หากขึ้น <b>--</b> หมายถึงยังไม่มีค่าที่เหมาะสำหรับแสดง ไม่ได้หมายถึงค่า 0</p></section>
<section class="help-section"><h4>ข้อมูลย้อนหลัง</h4><p>ใช้ดูสิ่งที่เกิดขึ้นแล้วในช่วงเวลาที่เลือก เพื่อเปรียบเทียบการเปลี่ยนแปลงตามเวลา</p></section>
<section class="help-section"><h4>ค่าคาดการณ์</h4><p>เป็นค่าประมาณของช่วงเวลาข้างหน้าเพื่อช่วยดูแนวโน้ม ไม่ใช่ค่าที่วัดได้ล่วงหน้าและไม่รับประกันว่าจะเกิดขึ้นจริง</p></section>
<div class="help-tip"><b>อ่านให้ง่าย</b><span>เริ่มจากภาพรวมปัจจุบัน → ดูจุดตรวจวัด → ดูย้อนหลัง → ใช้การคาดการณ์เป็นข้อมูลประกอบ</span></div>`
},

overviewQuality:{
title:"🌿 ภาพรวมคุณภาพอากาศ",
html:`<div class="help-intro-card"><b>หัวข้อนี้ตอบว่า “ตอนนี้ภาพรวมของพื้นที่เป็นอย่างไร?”</b><span>สรุปข้อมูลล่าสุดจากจุดตรวจวัดที่พร้อมใช้งาน</span></div>
<section class="help-section"><h4>PM2.5 และ PM10</h4><p>ช่องค่าฝุ่นด้านบนสลับ PM2.5 และ PM10 ทุกประมาณ 5 วินาที โดยเป็นค่าเฉลี่ยปัจจุบันจากจุดที่พร้อมใช้งาน ค่านี้ไม่ใช่ค่าเฉลี่ย 24 ชั่วโมง</p></section>
<section class="help-section"><h4>อุณหภูมิและความชื้นเฉลี่ย</h4><p>ช่วยให้เห็นสภาพแวดล้อมโดยรวม อุณหภูมิและความชื้นมีระดับของตัวเอง และยังใช้พิจารณาร่วมกันในดัชนีความร้อนด้วย</p></section>
<section class="help-section"><h4>จุดตรวจวัดที่พร้อม</h4><p>บอกจำนวนจุดที่ระบบยังยืนยันข้อมูลปัจจุบันได้จากทั้งหมด 3 จุด</p></section>
<div class="help-tip"><b>เหมาะสำหรับ</b><span>ดูสถานการณ์เร็ว ๆ ก่อนเปิดดูรายละเอียดรายจุด</span></div>`
},

overviewNodes:{
title:"📍 สถานะจุดตรวจวัด",
html:`<div class="help-intro-card"><b>ดูว่าจุดใดพร้อมแสดงข้อมูลปัจจุบัน</b><span>แต่ละจุดอาจมีสถานะแตกต่างกัน จึงควรดูร่วมกับเวลาของข้อมูลล่าสุด</span></div>
<section class="help-section"><h4>ONLINE</h4><p>หมายถึงขณะนี้ระบบยังยืนยันความพร้อมของจุดนั้นได้</p></section>
<section class="help-section"><h4>OFFLINE</h4><p>หมายถึงขณะนี้ยังไม่สามารถยืนยันความพร้อมของจุดนั้นได้ จึงไม่ควรตีความค่าที่เก่ากว่าเป็นสถานการณ์ปัจจุบัน</p></section>`
},

smartSummary:{
title:"✦ สรุปสถานการณ์",
html:`<div class="help-intro-card"><b>สรุปสถานการณ์ปัจจุบันเป็น 6 เรื่อง</b><span>แต่ละช่องตอบคนละคำถาม และเชื่อมกันเฉพาะส่วนที่ควรอ่านร่วมกัน</span></div>
<section class="help-section"><h4>🌿 คุณภาพอากาศ</h4><p>สลับแสดง PM2.5 และ PM10 ทุกประมาณ 5 วินาทีให้ตรงกับค่าฝุ่นด้านบน โดย PM2.5 ใช้สื่อสารระดับคุณภาพอากาศปัจจุบัน ส่วน PM10 แสดงค่าเฉลี่ยย้อนหลัง 24 ชั่วโมงเพื่อเทียบกับค่าอ้างอิงของประเทศไทย 120 µg/m³ จึงไม่เอาค่า PM10 ที่วัดเพียงครั้งเดียวไปตัดสินว่าเกินมาตรฐาน 24 ชั่วโมง</p></section>
<section class="help-section"><h4>☀️ ดัชนีความร้อน (Heat Index)</h4><p>บอกความร้อนที่ร่างกายอาจรู้สึกเมื่อพิจารณา <b>อุณหภูมิและความชื้นร่วมกัน</b> จึงไม่ใช่ค่าเดียวกับอุณหภูมิอากาศ</p></section>
<section class="help-section"><h4>🌡️ อุณหภูมิ</h4><p>แปลผลเป็น หนาวจัด / หนาว / เย็น / ปกติ / ร้อน / ร้อนจัด เพื่อช่วยเฝ้าระวังเบื้องต้น การเทียบระดับนี้ไม่ใช่ผลตัดสินมาตรฐานสุขภาพ</p></section>
<section class="help-section"><h4>💧 ความชื้น</h4><p>แปลผลเป็น ต่ำ / ปกติ / สูง / สูงมาก ตามเกณฑ์เฝ้าระวังของโครงการ ควรอ่านร่วมกับอุณหภูมิและดัชนีความร้อนเมื่อประเมินความรู้สึกร้อน</p></section>
<section class="help-section"><h4>📍 จุดตรวจวัด</h4><p>บอกจำนวนจุดที่พร้อมแสดงข้อมูลปัจจุบัน เพื่อให้รู้ว่าภาพรวมในขณะนั้นมีข้อมูลจากกี่จุด</p></section>
<section class="help-section"><h4>🏃 กิจกรรมกลางแจ้ง</h4><p>เป็นคำแนะนำเบื้องต้นจากสถานการณ์ฝุ่นและสภาพความร้อน ใช้ประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางการแพทย์</p></section>
<div class="help-warning">ส่วนนี้สรุป “สถานการณ์ปัจจุบัน” ไม่ใช่ข้อมูลย้อนหลังและไม่ใช่ค่าคาดการณ์อนาคต</div>`
},

monitoringPage:{
title:"📍 หน้าจุดตรวจวัด",
html:`<div class="help-intro-card"><b>หน้านี้ใช้ดูแต่ละจุดแยกกัน</b><span>เหมาะเมื่ออยากรู้ว่าตำแหน่งใดมีค่าแตกต่างจากภาพรวม</span></div>
<section class="help-section"><h4>ควรดูอะไรบ้าง?</h4><p>ดูสถานะของจุด เวลาของข้อมูลล่าสุด และค่าของตัวแปรแต่ละชนิด โดยไม่ควรนำค่าจากอีกจุดมาแทนกัน</p></section>
<section class="help-section"><h4>ทำไมแต่ละจุดไม่เท่ากัน?</h4><p>สภาพแวดล้อมในแต่ละตำแหน่งอาจต่างกัน จึงเป็นเรื่องปกติที่ค่าบางช่วงจะไม่เท่ากัน</p></section>`
},

monitoring:{
title:"📍 รายละเอียดจุดตรวจวัด",
html:`<div class="help-intro-card"><b>การ์ดแต่ละใบเป็นข้อมูลของจุดนั้น</b><span>ใช้ดูค่าปัจจุบันและเวลาของข้อมูลล่าสุดแบบแยกจุด</span></div>
<section class="help-section"><h4>ค่าที่แสดง</h4><p>PM1.0, PM2.5, PM10, อุณหภูมิ, ความชื้น และความสว่างเป็นข้อมูลล่าสุดที่มีสำหรับจุดนั้น</p></section>
<section class="help-section"><h4>เวลาของข้อมูลล่าสุด</h4><p>บอกว่าค่าที่เห็นมาจากเมื่อใด หากเป็นข้อมูลของเมื่อวานหรือวันก่อน ระบบจะแสดงวันให้ชัดเจน</p></section>
<section class="help-section"><h4>สถานะกับเวลาเป็นคนละเรื่อง</h4><p>สถานะบอกความพร้อมในขณะนี้ ส่วนเวลาของข้อมูลบอกว่าค่าตรวจวัดล่าสุดเกิดขึ้นเมื่อใด จึงไม่ควรตีความว่าเป็นเวลาเดียวกันเสมอ</p></section>`
},

currentAir:{
title:"📊 เปรียบเทียบจุดตรวจวัด",
html:`<div class="help-intro-card"><b>ใช้เปรียบเทียบตัวแปรเดียวกันระหว่างจุด</b><span>เลือก PM2.5, อุณหภูมิ, ความชื้น หรือค่าที่ต้องการ แล้วดูความแตกต่างของแต่ละจุด</span></div>
<section class="help-section"><h4>ค่าเฉลี่ยพื้นที่</h4><p>เป็นค่าเฉลี่ยจากจุดที่มีข้อมูลพร้อมในขณะนั้น ใช้ดูภาพรวม ไม่ใช่ค่าของตำแหน่งจริงจุดใดจุดหนึ่ง</p></section>
<section class="help-section"><h4>จุดที่ค่าสูงที่สุด</h4><p>ช่วยชี้ว่าจุดใดมีค่ามากที่สุดในรอบล่าสุด แต่คำว่า “สูงที่สุด” ไม่ได้แปลว่า “อันตราย” เสมอไป ต้องดูเกณฑ์ของตัวแปรนั้นด้วย</p></section>
<section class="help-section"><h4>จุดที่ควรสนใจ</h4><p>จะแสดงเมื่อค่าที่เลือกเข้าเงื่อนไขเฝ้าระวังของตัวแปรนั้น หากไม่เข้าเงื่อนไขจะระบุว่าอยู่ในระดับปกติหรือเป็นข้อมูลประกอบ</p></section>`
},

alerts:{
title:"⚠ สิ่งที่ควรระวัง",
html:`<div class="help-intro-card"><b>รวมเฉพาะเรื่องที่ควรให้ความสนใจในข้อมูลปัจจุบัน</b><span>ช่วยให้เห็นประเด็นสำคัญโดยไม่ต้องไล่อ่านทุกช่อง</span></div>
<section class="help-section"><h4>ฝุ่น PM2.5</h4><p>ใช้ระดับคุณภาพอากาศปัจจุบันเพื่อช่วยบอกว่าควรติดตามหรือเพิ่มความระมัดระวังหรือไม่</p></section>
<section class="help-section"><h4>อุณหภูมิ</h4><p>เตือนได้ทั้งด้านอากาศเย็นและอากาศร้อน โดยแปลเป็นระดับที่อ่านง่าย เช่น เย็น หนาว ร้อน หรือร้อนจัด</p></section>
<section class="help-section"><h4>ความชื้น</h4><p>แสดงเมื่ออยู่ในช่วงที่โครงการกำหนดให้ควรเฝ้าระวัง และควรพิจารณาร่วมกับอุณหภูมิ ไม่ใช้ความชื้นเพียงค่าเดียวตัดสินผลต่อสุขภาพ</p></section>
<section class="help-section"><h4>ดัชนีความร้อน</h4><p>พิจารณาอุณหภูมิและความชื้นร่วมกัน เพื่อช่วยบอกระดับความร้อนที่ร่างกายอาจรู้สึก</p></section>
<section class="help-section"><h4>สถานะจุดตรวจวัด</h4><p>หากมีจุดที่ยังไม่พร้อม ระบบจะแจ้งให้ทราบเพื่อไม่ให้เข้าใจว่าภาพรวมมาจากครบทุกจุด</p></section>
<div class="help-warning">การเตือนจากค่าปัจจุบันเป็นการเฝ้าระวังเบื้องต้น ไม่ใช่ผลตัดสินมาตรฐานเฉลี่ยตามช่วงเวลาหรือคำวินิจฉัยทางสุขภาพ</div>`
},

historyPage:{
title:"📈 หน้าสถิติและกราฟ",
html:`<div class="help-intro-card"><b>หน้านี้ใช้ดูสิ่งที่เกิดขึ้นแล้วตามเวลา</b><span>เลือกจุด ตัวแปร และช่วงเวลาเพื่อดูค่าเฉลี่ย ค่าสูงสุด ค่าต่ำสุด ค่าล่าสุด และแนวโน้ม</span></div>
<section class="help-section"><h4>อย่าเทียบคนละช่วงเวลา</h4><p>ก่อนเปรียบเทียบตัวเลข ควรตรวจว่ากำลังดูช่วงเวลาเดียวกัน เพราะช่วงเวลาที่ต่างกันอาจให้ภาพรวมต่างกัน</p></section>
<section class="help-section"><h4>กราฟย้อนหลังกับคาดการณ์ต่างกันอย่างไร?</h4><p>กราฟย้อนหลังแสดงสิ่งที่เกิดขึ้นแล้ว ส่วนกราฟคาดการณ์เป็นค่าประมาณของช่วงเวลาข้างหน้า</p></section>`
},

historical:{
title:"📊 ตัวเลือกสถิติย้อนหลัง",
html:`<div class="help-intro-card"><b>ใช้กำหนดข้อมูลที่ต้องการดู</b><span>เลือกจุดตรวจวัด ตัวแปร และช่วงเวลาให้ตรงกับคำถามที่ต้องการตอบ</span></div>
<section class="help-section"><h4>เลือกจุด</h4><p>“เปรียบเทียบ 3 จุด” ใช้ดูความแตกต่างระหว่างจุด ส่วน “ค่าเฉลี่ยพื้นที่” ใช้ดูภาพรวมของจุดที่มีข้อมูลในช่วงนั้น</p></section>
<section class="help-section"><h4>เลือกตัวแปร</h4><p>แต่ละตัวแปรมีหน่วยและความหมายต่างกัน จึงควรอ่านเกณฑ์ของตัวแปรนั้นก่อนสรุปว่า “สูง” หรือ “ต่ำ” หมายถึงอะไร</p></section>
<section class="help-section"><h4>เลือกช่วงเวลา</h4><p>ช่วงสั้นเหมาะกับการดูการเปลี่ยนแปลงล่าสุด ส่วนช่วงยาวเหมาะกับการดูแนวโน้มโดยรวม</p></section>`
},

historyChart:{
title:"📈 กราฟข้อมูลย้อนหลัง",
html:`<div class="help-intro-card"><b>กราฟนี้แสดงข้อมูลที่เกิดขึ้นแล้ว</b><span>ตำแหน่งตามแนวนอนคือเวลา ส่วนแนวตั้งคือค่าของตัวแปรที่เลือก</span></div>
<section class="help-section"><h4>เส้นของแต่ละจุด</h4><p>เมื่อเปรียบเทียบหลายจุด แต่ละเส้นแทนจุดของตัวเอง ค่าที่เกิดคนละเวลาไม่จำเป็นต้องอยู่ตำแหน่งเวลาเดียวกัน</p></section>
<section class="help-section"><h4>ซูมกราฟ</h4><p>ใช้ดูช่วงเวลาที่สนใจให้ละเอียดขึ้น โดยรายละเอียดเมื่อชี้จุดจะแสดงวันและเวลาของค่านั้น</p></section>
<section class="help-section"><h4>ช่วงที่ไม่มีจุดข้อมูล</h4><p>ไม่ควรตีความว่าเป็นค่า 0 เพราะอาจหมายถึงไม่มีข้อมูลสำหรับช่วงนั้น</p></section>`
},

forecastChart:{
title:"🔮 กราฟคาดการณ์ 30 นาที",
html:`<div class="help-intro-card"><b>ใช้ดูแนวโน้มที่อาจเกิดขึ้นในอีก 30 นาที</b><span>ข้อมูลจริงและค่าคาดการณ์ถูกแยกให้เห็นชัดเจน</span></div>
<section class="help-section"><h4>ข้อมูลจริง</h4><p>คือค่าที่เกิดขึ้นแล้ว ใช้เป็นจุดอ้างอิงก่อนเข้าสู่ช่วงคาดการณ์</p></section>
<section class="help-section"><h4>ค่าคาดการณ์ +10 / +20 / +30 นาที</h4><p>เป็นค่าประมาณของอนาคตเพื่อช่วยดูทิศทาง ไม่ใช่ค่าที่รับประกันว่าจะเกิดขึ้นจริง</p></section>
<section class="help-section"><h4>ควรใช้อย่างไร?</h4><p>ใช้ประกอบกับสถานการณ์ปัจจุบันและกราฟย้อนหลัง หากสถานการณ์เปลี่ยนเร็ว ผลคาดการณ์ก็อาจเปลี่ยนตามข้อมูลใหม่</p></section>`
},

currentSituation:{
title:"🧭 สถานการณ์ปัจจุบัน",
html:`<div class="help-intro-card"><b>อธิบายเฉพาะสิ่งที่เกิดขึ้นในข้อมูลปัจจุบัน</b><span>ช่วยสรุปว่าตอนนี้เป็นอย่างไร มีอะไรควรสนใจ และควรระวังเรื่องใด</span></div>
<section class="help-section"><h4>อ่านร่วมกับอะไร?</h4><p>ควรดูตัวเลขจริงในหน้าภาพรวมหรือหน้าจุดตรวจวัดร่วมด้วย โดยเฉพาะเมื่อจำเป็นต้องรู้ค่าของตำแหน่งใดตำแหน่งหนึ่ง</p></section>
<div class="help-warning">ส่วนนี้ไม่ใช่การคาดการณ์อนาคต</div>`
},

forecast30:{
title:"🔮 แนวโน้ม 30 นาที",
html:`<div class="help-intro-card"><b>อธิบายสิ่งที่อาจเกิดขึ้นในช่วง 30 นาทีข้างหน้า</b><span>ใช้ดูทิศทางโดยประมาณ เช่น มีแนวโน้มเพิ่ม ลด หรือทรงตัว</span></div>
<section class="help-section"><h4>ต่างจากสถานการณ์ปัจจุบันอย่างไร?</h4><p>สถานการณ์ปัจจุบันมาจากข้อมูลที่เกิดขึ้นแล้ว ส่วนแนวโน้ม 30 นาทีเป็นค่าประมาณของอนาคต จึงมีความไม่แน่นอน</p></section>
<div class="help-warning">ใช้เป็นข้อมูลประกอบ ไม่ใช่คำยืนยันว่าจะเกิดค่าตามนั้นจริง</div>`
},

analysisPage:{
title:"✦ หน้าวิเคราะห์และคาดการณ์",
html:`<div class="help-intro-card"><b>หน้านี้แยก “ตอนนี้” ออกจาก “ข้างหน้า”</b><span>ฝั่งสถานการณ์ปัจจุบันช่วยสรุปสิ่งที่ควรสนใจ ส่วนฝั่งคาดการณ์ช่วยดูแนวโน้ม 30 นาที</span></div>
<section class="help-section"><h4>สถานการณ์ปัจจุบัน</h4><p>อธิบายความหมายของข้อมูลล่าสุดโดยเน้นประเด็นสำคัญ ไม่ควรใช้แทนตัวเลขจริงเมื่อจำเป็นต้องดูค่ารายละเอียด</p></section>
<section class="help-section"><h4>แนวโน้ม 30 นาที</h4><p>ใช้ดูทิศทางที่อาจเกิดขึ้นและควรอ่านเป็น “แนวโน้ม” ไม่ใช่คำยืนยันเหตุการณ์ในอนาคต</p></section>`
},

ai:{
title:"✦ วิเคราะห์สถานการณ์",
html:`<div class="help-intro-card"><b>ช่วยแปลข้อมูลให้เป็นภาษาที่อ่านง่าย</b><span>เน้นตอบว่า ตอนนี้เป็นอย่างไร มีอะไรควรสนใจ และควรทำอะไรต่อ</span></div>
<section class="help-section"><h4>ข้อมูลที่นำมาพิจารณา</h4><p>พิจารณาฝุ่น อุณหภูมิ ความชื้น ดัชนีความร้อน และแนวโน้มของข้อมูลที่เกี่ยวข้อง โดยไม่ควรใช้ตัวแปรใดเพียงค่าเดียวสรุปทุกสถานการณ์</p></section>
<section class="help-section"><h4>เหตุใดอุณหภูมิ ความชื้น และดัชนีความร้อนจึงเชื่อมกัน?</h4><p>อุณหภูมิและความชื้นมีความหมายของตัวเอง แต่เมื่อประเมินความร้อนที่ร่างกายอาจรู้สึก จะต้องพิจารณาทั้งสองร่วมกันผ่านดัชนีความร้อน</p></section>
<div class="help-warning">ข้อความวิเคราะห์เป็นข้อมูลประกอบการติดตาม ไม่ใช่คำวินิจฉัยทางการแพทย์หรือประกาศจากหน่วยงานทางการ</div>`
},

aboutPage:{
title:"ℹ️ เกี่ยวกับโครงการ",
html:`<div class="help-intro-card"><b>หน้านี้อธิบายสิ่งที่ผู้ใช้ควรรู้เพื่ออ่าน Dashboard ให้ถูกต้อง</b><span>เน้นความหมายของข้อมูล เกณฑ์อ้างอิง ข้อจำกัด และผู้เกี่ยวข้องกับโครงการ โดยไม่แสดงรายละเอียดการทำงานภายใน</span></div>
<section class="help-section"><h4>ทำไมต้องมีหน้านี้?</h4><p>เพราะตัวเลขแต่ละชนิดมีความหมายและเกณฑ์ต่างกัน หน้านี้ช่วยป้องกันการตีความค่าปัจจุบันผิดจากค่าเฉลี่ยตามช่วงเวลา</p></section>`
},

aboutReadGuide:{
title:"📖 อ่านข้อมูลบน Dashboard อย่างไร",
html:`<div class="help-intro-card"><b>คำแนะนำสำหรับผู้ใช้ทั่วไป</b><span>เริ่มจากภาพรวม แล้วค่อยลงรายละเอียดรายจุดและข้อมูลย้อนหลัง</span></div>
<section class="help-section"><h4>ข้อมูลรายจุด</h4><p>ใช้เมื่อต้องการรู้สถานการณ์ของตำแหน่งใดตำแหน่งหนึ่ง เพราะแต่ละจุดอาจมีสภาพแวดล้อมต่างกัน</p></section>
<section class="help-section"><h4>ค่าเฉลี่ยพื้นที่</h4><p>ช่วยสรุปภาพรวมของจุดที่มีข้อมูลในช่วงนั้น แต่ไม่ใช่ค่าจริงของตำแหน่งใดตำแหน่งหนึ่ง</p></section>`
},

aboutStandards:{
title:"📚 เกณฑ์อ้างอิงและความหมายของระดับต่าง ๆ",
html:`<div class="help-intro-card"><b>ใช้ตรวจว่าคำว่า “ดี”, “ปกติ”, “ร้อน” หรือ “เฝ้าระวัง” มาจากอะไร</b><span>แต่ละตัวแปรอาจใช้เกณฑ์คนละประเภท จึงต้องอ่านหมายเหตุของตัวแปรนั้น</span></div>
<section class="help-section"><h4>เกณฑ์จากแหล่งอ้างอิง</h4><p>จะแสดงชื่อแหล่งอ้างอิงและช่วงค่าที่เกี่ยวข้อง พร้อมบอกข้อจำกัดเมื่อเกณฑ์นั้นไม่ได้ออกแบบมาสำหรับค่าปัจจุบันแบบทันที</p></section>
<section class="help-section"><h4>เกณฑ์ของโครงการ</h4><p>หากเป็นช่วงค่าที่โครงการกำหนดเพื่อช่วยเฝ้าระวัง จะระบุไว้ชัดเจนว่าไม่ใช่มาตรฐานสุขภาพหรือข้อกำหนดทางกฎหมาย</p></section>`
},

aboutPeople:{
title:"👥 ผู้เกี่ยวข้องกับโครงการ",
html:`<div class="help-intro-card"><b>แสดงหน่วยงาน ผู้จัดทำ และครูที่ปรึกษาที่เกี่ยวข้องกับโครงการ</b><span>ส่วนนี้เป็นข้อมูลเครดิตและการติดต่อสาธารณะเท่านั้น</span></div>`
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

let googleButtonResizeTimer=null;
window.addEventListener("resize",()=>{
  clearTimeout(googleButtonResizeTimer);
  googleButtonResizeTimer=setTimeout(()=>{
    if(!$("authModal")?.classList.contains("hidden")){
      scheduleGoogleIdentityRender();
    }
  },120);
});

function bindEvents(){

document
.querySelectorAll("[data-history-range-mode]")
.forEach(button=>{
button.addEventListener("click",()=>{
setHistoryRangeMode(button.dataset.historyRangeMode);
updateRangePickerPreviews();
});
});

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
$("historyRangeModal");

if(!panel){
return;
}

if(
!panel.classList.contains(
"active"
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

setHistoryRangeMode("quick");
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

averageRange="custom";
updateQuickRangeUI(
null
);
updateHistoryRangeMobileSelection();
setHistoryRangeMode("custom");
updateRangePickerPreviews();

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

averageRange="custom";
updateQuickRangeUI(
null
);
updateHistoryRangeMobileSelection();
setHistoryRangeMode("custom");
updateRangePickerPreviews();

const d=
dateFromRangeInput(
"customRangeEnd"
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

["customRangeStart","customRangeEnd"].forEach(id=>{
$(id)?.addEventListener("input",()=>{
averageRange="custom";
updateQuickRangeUI(null);
setHistoryRangeMode("custom");
updateHistoryRangeMobileSelection();
updateRangePickerPreviews();
});
});

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

$("historyRangeModalClose")
?.addEventListener(
"click",
closeHistoryRangePicker
);

$("historyRangeModal")
?.addEventListener(
"click",
e=>{

const modal=
$("historyRangeModal");

if(
e.target===modal||
e.target?.dataset?.historyRangeClose==="true"||
e.target?.classList?.contains(
"history-range-modal-backdrop"
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

if(
historyActivated&&
typeof drawCharts==="function"
){
drawCharts();
}

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

closeProfileEditor();

}

}
);

}

// =====================================================
// INTERACTIVE CHART VIEWER — NO EXTERNAL ZOOM PLUGIN
// =====================================================

let chartInteractiveViewerReady=false;
let chartInteractiveInstance=null;

function cloneChartDatasetForViewer(ds){

const copy={
label:ds.label||"ข้อมูล",
metricField:ds.metricField,
rawValues:Array.isArray(ds.rawValues)
?[...ds.rawValues]
:Array.isArray(ds.data)
?ds.data.map(v=>v&&typeof v==="object"?finiteNumberOrNull(v.y):finiteNumberOrNull(v))
:null,

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
จุดกราฟวางตามเวลาที่ข้อมูลเข้าจริง • ตัวเลขด้านล่างเป็นช่วงเวลาที่อ่านง่าย และจะละเอียดขึ้นเรื่อย ๆ เมื่อซูม • ชี้/แตะจุดเพื่อดูเวลาบันทึกจริง
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
<span id="chartZoomResolution">แกนเวลา: ภาพรวม</span>
<span>● ชี้จุด = ค่า + เวลาจริงของจุดนั้น</span>
</div>

<div class="chart-series-controls" id="chartSeriesControls">
<div class="chart-series-controls-head">
<div>
<div class="chart-series-controls-title">ข้อมูลที่แสดง</div>
<div class="chart-series-controls-help">เลือกชื่อข้อมูลเพื่อดูเส้นนั้นเพียงเส้นเดียว • กด “แสดงทั้งหมด” เพื่อกลับมาดูทุกเส้น</div>
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

function viewerNiceStepMs(span,width){

const SECOND=1000;
const MINUTE=60*SECOND;
const HOUR=60*MINUTE;
const DAY=24*HOUR;

const mobile=window.innerWidth<=640;
const targetTicks=Math.max(
3,
Math.min(
mobile?6:10,
Math.floor(Math.max(320,width||0)/(mobile?72:105))
)
);

const desired=Math.max(
SECOND,
span/targetTicks
);

const steps=[
1*SECOND,
5*SECOND,
10*SECOND,
15*SECOND,
30*SECOND,
1*MINUTE,
2*MINUTE,
5*MINUTE,
10*MINUTE,
15*MINUTE,
30*MINUTE,
1*HOUR,
2*HOUR,
3*HOUR,
6*HOUR,
12*HOUR,
1*DAY,
2*DAY,
3*DAY,
7*DAY
];

return steps.find(step=>step>=desired)||steps.at(-1);

}

function viewerBangkokAlignedStart(min,step){

const BKK=7*60*60*1000;
return Math.ceil((min+BKK)/step)*step-BKK;

}

function buildViewerPrettyTimeTicks(scale){

const min=Number(scale?.min);
const max=Number(scale?.max);

if(
!Number.isFinite(min)||
!Number.isFinite(max)||
max<=min
){
return;
}

const span=max-min;
const width=Math.max(
1,
Number(scale?.width||scale?.chart?.width||0)
);

const step=viewerNiceStepMs(span,width);
const first=viewerBangkokAlignedStart(min,step);

const ticks=[];

for(
let t=first;
t<=max+1;
t+=step
){
ticks.push({value:t});
if(ticks.length>40)break;
}

if(ticks.length){
scale.ticks=ticks;
}

}

function viewerTimeTickText(value,scale){

const n=finiteNumberOrNull(value);
if(n===null)return"";

const d=new Date(n);
if(!Number.isFinite(d.getTime()))return"";

const span=Math.max(
0,
Number(scale?.max)-Number(scale?.min)
);

const SECOND=1000;
const MINUTE=60*SECOND;
const HOUR=60*MINUTE;
const DAY=24*HOUR;

if(span<=2*MINUTE){
return d.toLocaleTimeString("th-TH",{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
second:"2-digit",
hour12:false
});
}

if(span<=DAY){
return d.toLocaleTimeString("th-TH",{
timeZone:"Asia/Bangkok",
hour:"2-digit",
minute:"2-digit",
hour12:false
});
}

if(span<3*DAY){
return d.toLocaleString("th-TH",{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short",
hour:"2-digit",
minute:"2-digit",
hour12:false
});
}

return d.toLocaleDateString("th-TH",{
timeZone:"Asia/Bangkok",
day:"2-digit",
month:"short"
});

}

function updateViewerResolutionLabel(){

const el=
$("chartZoomResolution");

if(!el){
return;
}

const span=
Math.max(
0,
viewMax-viewMin
);

const MINUTE=
60*1000;

const HOUR=
60*MINUTE;

if(span<=15*MINUTE){

el.textContent=
"แกนเวลา: ละเอียดถึงวินาที";

return;
}

if(span<=6*HOUR){

el.textContent=
"แกนเวลา: ละเอียดระดับนาที";

return;
}

if(span<=24*HOUR){

el.textContent=
"แกนเวลา: ชั่วโมง";

return;
}

el.textContent=
"แกนเวลา: ภาพรวม";

}

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
Math.min(
60*1000,
total
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
viewMin;

chartInteractiveInstance.options.scales.x.max=
viewMax;

chartInteractiveInstance.update("none");

updateViewerResolutionLabel();

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

chartInteractiveInstance.data.datasets.forEach(
(_,datasetIndex)=>{
chartInteractiveInstance.setDatasetVisibility(
datasetIndex,
datasetIndex===index
);
}
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

const timeValues=
labels.map(v=>{
const d=parseDate(v);
return d?d.getTime():null;
});

const validTimes=
timeValues.filter(Number.isFinite);

if(validTimes.length<2){
return;
}

fullMin=Math.min(...validTimes);
fullMax=Math.max(...validTimes);

viewMin=fullMin;
viewMax=fullMax;

updateViewerResolutionLabel();

$("chartZoomTitle").textContent=
chartViewerTitleForCanvas(canvas);

viewer.classList.add("active");
viewer.setAttribute("aria-hidden","false");
document.body.classList.add("chart-zoom-open");

destroyInteractiveChart();

const viewerCanvas=$("chartZoomCanvas");

const datasets=
original.data.datasets.map(ds=>{
const copy=cloneChartDatasetForViewer(ds);
const source=Array.isArray(ds.data)?ds.data:[];
copy.data=labels.map((label,index)=>{
const x=timeValues[index];
const raw=source[index];
const y=
raw&&typeof raw==="object"
?finiteNumberOrNull(raw.y)
:finiteNumberOrNull(raw);

if(
!Number.isFinite(x)
){
return null;
}

return{
x,
y
};
});
return copy;
});

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
intersect:true
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
mode:"nearest",
intersect:true,
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
type:"linear",
min:fullMin,
max:fullMax,

afterBuildTicks(scale){
buildViewerPrettyTimeTicks(scale);
},

grid:{
color:"rgba(148,163,184,.09)"
},

ticks:{
color:"#94a3b8",
maxRotation:0,
autoSkip:false,
maxTicksLimit:isTouch?7:14,
font:{
size:isTouch?12:12
},
callback:function(value){
return viewerTimeTickText(
value,
this
);
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
},
callback:function(value){
const n=finiteNumberOrNull(value);
if(n===null)return value;
return Math.abs(n)>=1000
?new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(n)
:new Intl.NumberFormat("th-TH",{maximumFractionDigits:1}).format(n);
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

function setHistoryChartMessage(title,detail="",isError=false){

const area=
$("historyChartArea");

if(!area){
return;
}

area.innerHTML=
`<div class="chart-loading-state ${isError?"is-error":""}">
<b>${esc(title)}</b>
${detail?`<span>${esc(detail)}</span>`:""}
${isError?`<button type="button" class="chart-state-retry" id="historyRetryButton">ลองใหม่</button>`:""}
</div>`;

if(isError){

$("historyRetryButton")?.addEventListener(
"click",
()=>{
activateHistorySection(true);
},
{once:true}
);

}

}

async function activateHistorySection(force=false){

if(historyLoading&&!force){
return;
}

historyActivated=true;
historyLoading=true;

setHistoryChartMessage(
"กำลังโหลดข้อมูลย้อนหลัง",
"กรุณารอสักครู่"
);

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

setHistoryChartMessage(
"โหลดข้อมูลย้อนหลังไม่สำเร็จ",
e?.name==="AbortError"
?"การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่"
:"ไม่สามารถโหลดข้อมูลได้ในขณะนี้ กรุณาลองใหม่",
true
);

}finally{

historyLoading=false;

}

}

function activateAISection(){

if(aiSectionActivated){
  if(authUser&&authToken&&!aiPayload&&!aiLoading)loadAI(false);
  if(authUser&&authToken&&!aiForecastPayload&&!aiForecastLoading)loadAIForecast(false);
  return;
}

aiSectionActivated=true;

loadAI(false);          // ถ้าไม่มีสิทธิ์ ฟังก์ชันจะแสดงกล่องล็อกแทน
loadAIForecast(false);  // และจะไม่เรียก API

}

function setupDeferredSections(){

activateHistorySection();

const aiTarget=
document.querySelector(".ai-intelligence-section");

if(
"IntersectionObserver" in window &&
aiTarget
){

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

}else{

setTimeout(
()=>{
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

const[latest,mother,alerts]=await Promise.all([
loadLatest(),
loadMother(),
loadAlerts().catch(()=>[])
]);

apiConnectionOnline=
true;

latestNodes=
latest;

motherStatus=
mother;

alertStates=
alerts;

latestRecord=
latestNodes.at(-1)||
null;

renderMonitoring();

updateCurrent();

updateSmart();

updateAlertUI();
checkSituationNotifications();

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
checkSituationNotifications();

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

setHistoryChartMessage(
"โหลดกราฟข้อมูลย้อนหลังไม่สำเร็จ",
"กรุณาลองใหม่อีกครั้ง",
true
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
checkSituationNotifications();

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

updateHistoryRangeButtonLabel();

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

setInterval(()=>{
  if(document.visibilityState==="visible") loadRealtime();
},15000);

// =====================================================
// HISTORICAL
// =====================================================

setInterval(()=>{
  if(document.visibilityState==="visible"&&historyActivated) loadHistorical();
},60000);

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
// =====================================================
const DASHBOARD_PAGE_NAMES=new Set(["overview","monitoring","history","analysis","about"]);
let currentDashboardPage="overview";

function getDashboardPageFromHash(){
  const raw=String(location.hash||"").replace(/^#/,"").trim().toLowerCase();
  return DASHBOARD_PAGE_NAMES.has(raw)?raw:"overview";
}

function clearTransientUiMessages(ids=null){
  const list=ids||[
    "loginMessage",
    "registerMessage",
    "forgotPasswordMessage",
    "resetPasswordMessage",
    "ownerSetupMessage",
    "profileEditorMessage",
    "accountSecurityMessage",
    "helpSaveMessage",
    "deviceSaveMessage",
    "announcementSaveMessage",
    "userSaveMessage"
  ];
  list.forEach(id=>setAuthMessage(id,""));
}

function openDashboardPage(page,{updateHash=true}={}){
  page=DASHBOARD_PAGE_NAMES.has(page)?page:"overview";
  clearTransientUiMessages();

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
  if(page==="history"){
    if(typeof activateHistorySection==="function") activateHistorySection();

    if(typeof loadAIForecast==="function"){
      loadAIForecast(false);
    }
  }

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

const dates=
latestNodes
.map(
n=>
parseDate(
nodeReadingTime(
n
)
)
)
.filter(Boolean);

if(!dates.length){
return null;
}

return new Date(
Math.max(
...dates.map(
d=>d.getTime()
)
)
);
}

function overviewAdvice(pm25){
  const g=pm25Guidance(pm25);
  if(g.level==="no_data") return "ยังไม่มีข้อมูลเพียงพอสำหรับสรุปคุณภาพอากาศ";
  if(g.level==="critical") return "คุณภาพอากาศอยู่ในระดับที่ควรลดกิจกรรมกลางแจ้งและติดตามสถานการณ์อย่างใกล้ชิด";
  if(g.level==="warning") return "ควรเฝ้าระวังฝุ่น PM2.5 โดยเฉพาะผู้ที่ไวต่อมลพิษทางอากาศ";
  if(g.label==="ปานกลาง") return "คุณภาพอากาศโดยรวมอยู่ในระดับปานกลาง สามารถติดตามกิจกรรมได้ตามความเหมาะสม";
  return "คุณภาพอากาศโดยรวมอยู่ในระดับดี สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ";
}

let overviewParticleMetric="pm25";
let overviewParticleRenderedMetric=null;
let overviewParticleSwitchTimer=null;

function updateOverviewParticleDisplay(animate=false){
  const field=overviewParticleMetric;
  const value=averageLatestField(field);
  const label=field==="pm10"?"PM10 เฉลี่ยปัจจุบัน":"PM2.5 เฉลี่ยปัจจุบัน";
  const box=document.querySelector(".overview-main-value");

  const applyValue=()=>{
    if($("overviewParticleLabel")) $("overviewParticleLabel").textContent=label;
    if($("overviewPM25")) $("overviewPM25").textContent=value===null?"--":fmt(value);
    overviewParticleRenderedMetric=field;
  };

  const metricReallyChanged=
    overviewParticleRenderedMetric!==null &&
    overviewParticleRenderedMetric!==field;

  if(!animate || !metricReallyChanged){
    if(overviewParticleSwitchTimer){
      clearTimeout(overviewParticleSwitchTimer);
      overviewParticleSwitchTimer=null;
    }
    if(box) box.classList.remove("is-switching");
    applyValue();
    return;
  }

  if(overviewParticleSwitchTimer){
    clearTimeout(overviewParticleSwitchTimer);
  }

  if(box) box.classList.add("is-switching");

  overviewParticleSwitchTimer=window.setTimeout(()=>{
    applyValue();
    requestAnimationFrame(()=>{
      if(box) box.classList.remove("is-switching");
    });
    overviewParticleSwitchTimer=null;
  },160);
}

function toggleOverviewParticleMetric(){
  overviewParticleMetric=overviewParticleMetric==="pm25"?"pm10":"pm25";
  updateOverviewParticleDisplay(true);
  updateSmart();
}

function updateNavigationDashboard(){
  const pm25=averageLatestField("pm25");
  const temp=averageLatestField("temperature");
  const hum=averageLatestField("humidity");
  const guide=pm25Guidance(pm25);
  const active=activeCount();

  updateOverviewParticleDisplay();
  if($("overviewTemp")) $("overviewTemp").textContent=temp===null?"--":fmt(temp);
  if($("overviewHumidity")) $("overviewHumidity").textContent=hum===null?"--":fmt(hum);
  if($("overviewTempStatus")){const t=temperatureLevel(temp);$("overviewTempStatus").textContent=t.label;$("overviewTempStatus").className=`overview-metric-status ${t.severity}`;}
  if($("overviewHumidityStatus")){const hu=humidityLevel(hum);$("overviewHumidityStatus").textContent=hu.label;$("overviewHumidityStatus").className=`overview-metric-status ${hu.severity}`;}
  if($("overviewActiveNodes")) $("overviewActiveNodes").textContent=`${active} / ${TOTAL_NODES}`;
  if($("overviewGuidance")) $("overviewGuidance").textContent=overviewAdvice(pm25);

  const qb=$("overviewQualityBadge");
  if(qb){
    qb.textContent=guide.label||"รอข้อมูล";
    qb.className="overview-quality-badge "+(guide.level==="critical"?"is-critical":guide.level==="warning"?"is-warning":guide.level==="normal"?"is-normal":"is-waiting");
  }

  const newest=newestNodeTime();
  if($("overviewLastUpdated")){
    $("overviewLastUpdated").textContent=newest?`ข้อมูลล่าสุด ${thaiNodeReadingDateTime(newest)}`:"ข้อมูลล่าสุด: --";
  }

  for(let i=1;i<=3;i++){
    const node=getNode(i);
    const st=getNodeDisplayStatus(node);
    const dot=$("overviewNodeDot"+i);
    const label=$("overviewNodeStatus"+i);
    if(dot) dot.className=`overview-node-dot ${st}`;
    if(label){
      const readingTime=
nodeReadingTime(
node
);

const t=
readingTime
?thaiNodeReadingDateTime(
readingTime
)
:"--";

label.textContent=
st==="online"
?`ONLINE • ข้อมูลล่าสุด ${t}`
:"OFFLINE";
    }
  }

  const systemOnline=apiConnectionOnline && motherOnline();
  const navDot=$("navSystemDot");
  const navText=$("navSystemStatus");
  let navState="is-offline";
  let navLabel="กำลังตรวจสอบสถานะ";

  if(!apiConnectionOnline){
    navState="is-offline";
    navLabel="ระบบข้อมูล OFFLINE";
  }else if(!motherOnline()){
    navState="is-offline";
    navLabel="ระบบข้อมูล OFFLINE";
  }else if(active===TOTAL_NODES){
    navState="is-online";
    navLabel=`จุดตรวจวัด ONLINE ${active}/${TOTAL_NODES}`;
  }else if(active>0){
    navState="is-warning";
    navLabel=`จุดตรวจวัด ONLINE ${active}/${TOTAL_NODES}`;
  }else{
    navState="is-offline";
    navLabel=`จุดตรวจวัด ONLINE 0/${TOTAL_NODES}`;
  }

  if(navDot) navDot.className=`dashboard-system-dot ${navState}`;
  if(navText) navText.textContent=navLabel;

  const sourceAlerts=$("alerts");
  const overviewAlerts=$("overviewAlerts");
  if(sourceAlerts&&overviewAlerts) overviewAlerts.innerHTML=sourceAlerts.innerHTML;
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

const runWhenIdle=fn=>{
  if("requestIdleCallback" in window) requestIdleCallback(fn,{timeout:3000});
  else setTimeout(fn,1800);
};

runWhenIdle(()=>{
  loadStandardsOnly();
  refreshPM10History24h();
});

setInterval(updateNavigationDashboard,5000);
setInterval(toggleOverviewParticleMetric,5000);
setInterval(refreshPM10History24h,300000);

// =====================================================
// V15 — HELP MODAL VISIBILITY / MOBILE SAFETY
// =====================================================
(function(){
  function fitHelpToViewport(){
    const popover=document.getElementById("helpPopover");
    if(!popover || !popover.classList.contains("active")) return;

    if(window.matchMedia("(max-width: 1023px)").matches){
      popover.style.setProperty("position","fixed","important");
      popover.style.setProperty("top","max(8px, env(safe-area-inset-top))","important");
      popover.style.setProperty("right","8px","important");
      popover.style.setProperty("bottom","max(8px, env(safe-area-inset-bottom))","important");
      popover.style.setProperty("left","8px","important");
      popover.style.setProperty("width","auto","important");
      popover.style.setProperty("max-width","none","important");
      popover.style.setProperty("max-height","none","important");
      popover.style.setProperty("transform","none","important");
      popover.style.setProperty("margin","0","important");
    }else{
      ["position","top","right","bottom","left","width","max-width","max-height","transform","margin"]
        .forEach(function(prop){ popover.style.removeProperty(prop); });
    }
  }

  document.addEventListener("click",function(e){
    if(!e.target.closest(".help-button")) return;
    requestAnimationFrame(fitHelpToViewport);
  });

  window.addEventListener("resize",fitHelpToViewport,{passive:true});
  window.addEventListener("orientationchange",function(){
    setTimeout(fitHelpToViewport,80);
  });
})();

// =====================================================
// PUBLIC DISPLAY CONFIG
// =====================================================
function configDevice(deviceId){
return(publicDisplayConfig?.devices||[]).find(x=>String(x?.device_id||"")===deviceId)||null;
}

function applyPublicDisplayConfig(){
for(let i=1;i<=3;i++){
const d=configDevice(`Number ${i}`)||{};
const name=String(d.display_name||`จุดตรวจวัด ${i}`).trim()||`จุดตรวจวัด ${i}`;
const loc=String(d.location_name||"").trim();
const desc=String(d.description||"").trim();

const ot=$(`overviewNodeTitle${i}`);
const ol=$(`overviewNodeLocation${i}`);
const nt=$(`nodeTitle${i}`);
const nl=$(`nodeLocation${i}`);
const nd=$(`nodeDescription${i}`);
const ho=$(`historyNodeOption${i}`);

if(ot)ot.textContent=name;
if(ol){ol.textContent=loc;ol.classList.toggle("hidden",!loc);}
if(nt)nt.textContent=name;
if(nl){nl.textContent=loc;nl.classList.toggle("hidden",!loc);}
if(nd){nd.textContent=desc;nd.classList.toggle("hidden",!desc);}
if(ho)ho.textContent=loc?`${name} • ${loc}`:name;
}

const h=$("publicAboutHeading");
const intro=$("publicAboutIntro");
const heading=String(publicDisplayConfig?.content?.about_heading||"เกี่ยวกับโครงการ").trim()||"เกี่ยวกับโครงการ";
const about=String(publicDisplayConfig?.content?.about_intro||"").trim();

if(h)h.textContent=heading;
if(intro){intro.textContent=about;intro.classList.toggle("hidden",!about);}

const ann=publicDisplayConfig?.content||{};
const aw=$("siteAnnouncementWrap");
const ab=$("siteAnnouncement");
const at=$("siteAnnouncementTitle");
const am=$("siteAnnouncementMessage");
const ai=$("siteAnnouncementIcon");
const enabled=String(ann.announcement_enabled||"0")==="1"&&String(ann.announcement_message||"").trim();

if(aw){
aw.classList.toggle("hidden",!enabled);
if(enabled){
const sev=["info","warning","maintenance"].includes(String(ann.announcement_severity))
?String(ann.announcement_severity):"info";
ab.className=`site-announcement is-${sev}`;
at.textContent=String(ann.announcement_title||"ประกาศจากระบบ").trim()||"ประกาศจากระบบ";
am.textContent=String(ann.announcement_message||"").trim();
ai.textContent=sev==="warning"?"⚠":sev==="maintenance"?"🛠":"ℹ";
}
}

if(historyActivated&&typeof Chart!=="undefined"){
try{drawCharts();}catch(e){console.warn("Chart label refresh failed",e);}
}
}

async function loadPublicDisplayConfig(){
try{
const r=await fetch(API.publicConfig,{cache:"no-store",headers:{Accept:"application/json"}});
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const j=await r.json();
if(!j?.success||!j?.data)throw new Error("Public config unavailable");
publicDisplayConfig=j.data;
applyManagedHelpOverrides(publicDisplayConfig?.help||{});
applyPublicDisplayConfig();
return j.data;
}catch(e){
console.warn("Public display config unavailable; using defaults.");
applyPublicDisplayConfig();
return publicDisplayConfig;
}
}

(function startPublicDisplayConfig(){
const run=()=>loadPublicDisplayConfig();
if(document.readyState==="loading"){
document.addEventListener("DOMContentLoaded",run,{once:true});
}else{
run();
}
})();

// =====================================================
// V9 — VISUAL VIEWPORT SAFE FLOATING WINDOWS
// =====================================================
(function setupVisualViewportFloatingUI(){

  const MOBILE_MAX = 760;
  const GAP = 8;

  function isMobileViewport(){
    return window.matchMedia(`(max-width:${MOBILE_MAX}px)`).matches;
  }

  function visibleViewport(){
    const vv = window.visualViewport;
    return {
      left: vv ? vv.offsetLeft : 0,
      top: vv ? vv.offsetTop : 0,
      width: vv ? vv.width : window.innerWidth,
      height: vv ? vv.height : window.innerHeight
    };
  }

  function clearFit(el){
    if(!el) return;
    [
      "position","left","right","top","bottom",
      "width","height","minWidth","maxWidth",
      "minHeight","maxHeight","margin","transform"
    ].forEach(prop=>el.style.removeProperty(prop));
  }

  function fitFloating(el){
    if(!el || !isMobileViewport()) return;

    if(el.parentElement !== document.body){
      document.body.appendChild(el);
    }

    const v = visibleViewport();
    const gap = Math.min(GAP, Math.max(4, v.width * 0.02));
    const width = Math.max(240, v.width - gap * 2);
    const height = Math.max(240, v.height - gap * 2);

    el.style.setProperty("position","fixed","important");
    el.style.setProperty("left",`${v.left + gap}px`,"important");
    el.style.setProperty("top",`${v.top + gap}px`,"important");
    el.style.setProperty("right","auto","important");
    el.style.setProperty("bottom","auto","important");
    el.style.setProperty("width",`${width}px`,"important");
    el.style.setProperty("max-width",`${width}px`,"important");
    el.style.setProperty("height","auto","important");
    el.style.setProperty("max-height",`${height}px`,"important");
    el.style.setProperty("margin","0","important");
    el.style.setProperty("transform","none","important");
  }

  function fitOpenFloatingUI(){
    const help = document.getElementById("helpPopover");
    if(help && help.classList.contains("active")){
      fitFloating(help);
    }
  }

  function restoreDesktop(){
    if(isMobileViewport()) return;
    clearFit(document.getElementById("helpPopover"));
  }

  function refresh(){
    if(isMobileViewport()) fitOpenFloatingUI();
    else restoreDesktop();
  }

  ["helpPopover"].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;

    const observer=new MutationObserver(()=>{
      requestAnimationFrame(refresh);
    });

    observer.observe(el,{
      attributes:true,
      attributeFilter:["class","aria-hidden"]
    });
  });

  window.addEventListener("resize",refresh,{passive:true});
  window.addEventListener("orientationchange",()=>{
    setTimeout(refresh,80);
    setTimeout(refresh,260);
  },{passive:true});

  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",refresh,{passive:true});
    window.visualViewport.addEventListener("scroll",refresh,{passive:true});
  }

  document.addEventListener("click",e=>{
    if(
      e.target.closest?.("#historyRangeButton") ||
      e.target.closest?.(".help-button")
    ){
      requestAnimationFrame(refresh);
      setTimeout(refresh,80);
    }
  });
})();

// =====================================================
// V18 — CONTEXTUAL EXPLANATIONS
// =====================================================
const V18_INFO={
monitoring:{
title:"สถานะจุดตรวจวัด",
html:`<p><b>ONLINE</b> — จุดตรวจวัดพร้อมใช้งานและระบบยังยืนยันการทำงานได้ตามปกติ</p>
<p><b>OFFLINE</b> — ไม่สามารถยืนยันการติดต่อกับจุดตรวจวัดได้ในขณะนั้น</p>
<p><b>ข้อมูลล่าสุด</b> — เวลาของข้อมูลตรวจวัดชุดที่กำลังแสดง ซึ่งอาจต่างจากเวลาที่สถานะเปลี่ยนแปลง</p>`
},
history:{
title:"กราฟย้อนหลังและค่าเฉลี่ยพื้นที่",
html:`<p>กราฟย้อนหลังใช้ดูข้อมูลตามช่วงเวลาที่เลือกและเปรียบเทียบแต่ละจุดได้</p>
<p><b>ค่าเฉลี่ยพื้นที่</b> ใช้ช่วยมองสถานการณ์โดยรวม ไม่ใช่ค่าของตำแหน่งใดตำแหน่งหนึ่ง</p>
<p>ช่วงเวลาที่ยาวอาจแสดงข้อมูลในระดับรายละเอียดที่เหมาะสมเพื่อให้อ่านแนวโน้มได้ชัดเจน</p>`
},
forecast:{
title:"แนวโน้มล่วงหน้า 30 นาที",
html:`<p>แสดงค่าประมาณที่อาจเกิดขึ้นในอีก <b>10, 20 และ 30 นาที</b> เพื่อช่วยดูทิศทางระยะสั้น</p>
<p>ผลลัพธ์ <b>ไม่ใช่ค่ารับประกัน</b> และไม่ใช่การพยากรณ์อากาศอย่างเป็นทางการ</p>
<p> ใช้บอกระดับความพร้อมของข้อมูลประกอบการคาดการณ์ ไม่ใช่เปอร์เซ็นต์ Accuracy</p>`
},
systemGuide:{
title:"วิธีอ่านข้อมูลจากระบบ",
html:`<p><b>PM2.5</b> เป็นตัวหลักสำหรับสื่อสถานการณ์คุณภาพอากาศ</p>
<p><b>อุณหภูมิ</b> แสดงระดับตั้งแต่หนาวจัดถึงร้อนจัด โดยใช้เพื่อเฝ้าระวังเบื้องต้น</p>
<p><b>ความชื้น</b> แสดง ต่ำ / ปกติ / สูง / สูงมาก ตามเกณฑ์เฝ้าระวังของโครงการ</p>
<p><b>Heat Index</b> ยังคงแสดงแยก ใช้ประเมินความร้อนที่ร่างกายรู้สึกจากอุณหภูมิและความชื้นร่วมกัน</p>
<p><b>Lux</b> ใช้บอกระดับความสว่าง และไม่ใช่ UV Index</p>
<p>หน้า Dashboard เน้นให้เข้าใจว่า <b>สถานการณ์เป็นอย่างไร → ค่าหมายถึงอะไร → ควรปฏิบัติตัวอย่างไร</b></p>`
}
};
function v18OpenInfo(key){const t=V18_INFO[key],m=$("v18InfoModal");if(!t||!m)return;$("v18InfoTitle").textContent=t.title;$("v18InfoBody").innerHTML=t.html;m.classList.add("active");m.setAttribute("aria-hidden","false");document.body.classList.add("v18-modal-open");}
function v18CloseInfo(){const m=$("v18InfoModal");if(!m)return;m.classList.remove("active");m.setAttribute("aria-hidden","true");document.body.classList.remove("v18-modal-open");}
document.addEventListener("click",e=>{const b=e.target.closest("[data-v18-help]");if(b){e.preventDefault();v18OpenInfo(b.dataset.v18Help);return;}if(e.target.closest("[data-v18-info-close]")){e.preventDefault();v18CloseInfo();}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("v18InfoModal")?.classList.contains("active"))v18CloseInfo();});

// =====================================================
// V31 — ACCOUNT / ROLE / CONTENT MANAGEMENT
// =====================================================
let managedHelpCache={};
let currentHelpEditorKey="";
let adminUsersCache=[];
let adminAddMode=false;

function authRoleThai(role){
  return role==="owner"?"เจ้าของระบบ":role==="admin"?"ผู้ดูแลระบบ":"ผู้ใช้งาน";
}

function authRoleLabel(role){
  return role==="owner"?"OWNER":role==="admin"?"ADMIN":"USER";
}

function authProviderLabel(user){
  if(user?.auth_provider==="google") return "Google";
  if(user?.google_linked) return "Email + Google";
  return "Email";
}

function authStatusThai(status){
  return status==="disabled"?"ระงับ":status==="pending"?"รอยืนยัน":"ใช้งาน";
}

async function apiJson(url,options={}){
  const headers={Accept:"application/json",...(options.headers||{})};
  if(options.body && !headers["Content-Type"]) headers["Content-Type"]="application/json";
  if(authToken) headers.Authorization=`Bearer ${authToken}`;
  const r=await fetch(url,{...options,headers,cache:"no-store"});
  let j=null;
  try{j=await r.json();}catch(_){j={success:false,message:`HTTP ${r.status}`};}
  if(!r.ok) throw new Error(j?.message||`HTTP ${r.status}`);
  return j;
}

function setAuthMessage(id,text,type=""){
  const el=$(id); if(!el)return;
  el.textContent=text||"";
  el.classList.toggle("is-error",type==="error");
  el.classList.toggle("is-success",type==="success");
}

function authAvatarUrl(user){return String(user?.profile_image_url||user?.google_picture_url||"").trim();}
function setAvatar(imgId,fallbackId,user){
  const img=$(imgId),fallback=$(fallbackId),url=authAvatarUrl(user);if(!img||!fallback)return;

  if(!url){
    img.removeAttribute("src");
    img.classList.add("hidden");
    fallback.classList.remove("hidden");
    return;
  }

  const preload=new Image();
  preload.referrerPolicy="no-referrer";
  preload.onload=()=>{
    img.src=url;
    img.classList.remove("hidden");
    fallback.classList.add("hidden");
  };
  preload.onerror=()=>{
    img.removeAttribute("src");
    img.classList.add("hidden");
    fallback.classList.remove("hidden");
  };
  preload.src=url;
}
// =====================================================
// V34 — PROFILE IMAGE EDITOR
// =====================================================
let profileEditorState={
  image:null,
  objectUrl:"",
  zoom:1,
  baseScale:1,
  offsetX:0,
  offsetY:0,
  dragging:false,
  pointerId:null,
  lastX:0,
  lastY:0
};

function closeProfileEditor(){
  const modal=$("profileEditorModal");
  if(!modal)return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
  $("profileCropStage")?.classList.remove("is-dragging");
  profileEditorState.dragging=false;
  profileEditorState.pointerId=null;
  if(profileEditorState.objectUrl){
    URL.revokeObjectURL(profileEditorState.objectUrl);
    profileEditorState.objectUrl="";
  }
}

function profileEditorGeometry(){
  const stage=$("profileCropStage"),img=profileEditorState.image;
  if(!stage||!img)return null;
  const vw=stage.clientWidth,vh=stage.clientHeight;
  const scale=profileEditorState.baseScale*profileEditorState.zoom;
  return{
    vw,vh,scale,
    displayW:img.naturalWidth*scale,
    displayH:img.naturalHeight*scale
  };
}

function clampProfileOffsets(){
  const g=profileEditorGeometry();if(!g)return;
  const maxX=Math.max(0,(g.displayW-g.vw)/2);
  const maxY=Math.max(0,(g.displayH-g.vh)/2);
  profileEditorState.offsetX=Math.max(-maxX,Math.min(maxX,profileEditorState.offsetX));
  profileEditorState.offsetY=Math.max(-maxY,Math.min(maxY,profileEditorState.offsetY));
}

function renderProfileCrop(){
  const el=$("profileCropImage"),g=profileEditorGeometry();if(!el||!g)return;
  clampProfileOffsets();
  el.style.width=`${g.displayW}px`;
  el.style.height=`${g.displayH}px`;
  el.style.transform=`translate(-50%,-50%) translate(${profileEditorState.offsetX}px,${profileEditorState.offsetY}px)`;
}

async function openProfileEditorFromFile(file){
  if(!file||!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error("รองรับเฉพาะ JPG, PNG หรือ WebP");
  if(file.size>8*1024*1024)throw new Error("รูปมีขนาดใหญ่เกิน 8 MB");

  const modal=$("profileEditorModal"),stage=$("profileCropStage"),preview=$("profileCropImage");
  if(!modal||!stage||!preview)throw new Error("ไม่พบหน้าปรับรูปโปรไฟล์");

  if(profileEditorState.objectUrl)URL.revokeObjectURL(profileEditorState.objectUrl);
  const objectUrl=URL.createObjectURL(file);
  profileEditorState.objectUrl=objectUrl;

  const img=await new Promise((resolve,reject)=>{
    const x=new Image();
    x.onload=()=>resolve(x);
    x.onerror=()=>reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    x.src=objectUrl;
  });

  preview.src=objectUrl;
  profileEditorState.image=img;
  profileEditorState.zoom=1;
  profileEditorState.offsetX=0;
  profileEditorState.offsetY=0;
  if($("profileZoomRange"))$("profileZoomRange").value="1";
  if($("profileEditorMessage"))$("profileEditorMessage").textContent="";

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");

  requestAnimationFrame(()=>{
    const vw=stage.clientWidth,vh=stage.clientHeight;
    profileEditorState.baseScale=Math.max(vw/img.naturalWidth,vh/img.naturalHeight);
    renderProfileCrop();
  });
}

function buildCroppedProfileImage(){
  const img=profileEditorState.image,g=profileEditorGeometry();
  if(!img||!g)throw new Error("ยังไม่มีรูปสำหรับบันทึก");

  const sourceSide=Math.min(img.naturalWidth,img.naturalHeight,g.vw/g.scale);
  const centerX=img.naturalWidth/2-profileEditorState.offsetX/g.scale;
  const centerY=img.naturalHeight/2-profileEditorState.offsetY/g.scale;
  const sx=Math.max(0,Math.min(img.naturalWidth-sourceSide,centerX-sourceSide/2));
  const sy=Math.max(0,Math.min(img.naturalHeight-sourceSide,centerY-sourceSide/2));

  const canvas=document.createElement("canvas");
  canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext("2d");
  ctx.drawImage(img,sx,sy,sourceSide,sourceSide,0,0,256,256);
  return canvas.toDataURL("image/jpeg",0.84);
}

async function saveProfileEditor(){
  const button=$("profileEditorSave"),message=$("profileEditorMessage");
  const oldText=button?.textContent;
  try{
    if(button){button.disabled=true;button.textContent="กำลังบันทึก...";}
    if(message)message.textContent="";
    const image=buildCroppedProfileImage();
    const j=await apiJson(API.authProfileImage,{method:"POST",body:JSON.stringify({profile_image:image})});
    authUser=j.user||authUser;
    updateAccountUI();
    $("accountDropdown")?.classList.add("hidden");
    closeProfileEditor();
  }catch(err){
    if(message)message.textContent=err.message||"บันทึกรูปไม่สำเร็จ";
  }finally{
    if(button){button.disabled=false;button.textContent=oldText||"บันทึกรูปโปรไฟล์";}
  }
}

function setupProfileEditorInteraction(){
  const stage=$("profileCropStage"),zoom=$("profileZoomRange");
  if(!stage)return;

  zoom?.addEventListener("input",()=>{
    profileEditorState.zoom=Math.max(1,Math.min(3,Number(zoom.value)||1));
    renderProfileCrop();
  });

  stage.addEventListener("pointerdown",e=>{
    if(!profileEditorState.image)return;
    profileEditorState.dragging=true;
    profileEditorState.pointerId=e.pointerId;
    profileEditorState.lastX=e.clientX;
    profileEditorState.lastY=e.clientY;
    stage.classList.add("is-dragging");
    stage.setPointerCapture?.(e.pointerId);
  });

  stage.addEventListener("pointermove",e=>{
    if(!profileEditorState.dragging||e.pointerId!==profileEditorState.pointerId)return;
    profileEditorState.offsetX+=e.clientX-profileEditorState.lastX;
    profileEditorState.offsetY+=e.clientY-profileEditorState.lastY;
    profileEditorState.lastX=e.clientX;
    profileEditorState.lastY=e.clientY;
    renderProfileCrop();
  });

  const stop=e=>{
    if(profileEditorState.pointerId!==null&&e.pointerId!==undefined&&e.pointerId!==profileEditorState.pointerId)return;
    profileEditorState.dragging=false;
    profileEditorState.pointerId=null;
    stage.classList.remove("is-dragging");
  };
  stage.addEventListener("pointerup",stop);
  stage.addEventListener("pointercancel",stop);
}

// =====================================================
// V34 — GUEST / USER / ADMIN / OWNER PERMISSIONS
// =====================================================
const PERMISSION_DEFINITIONS=[
  {key:"history_extended",group:"ข้อมูลย้อนหลัง",title:"ดูย้อนหลัง 7 / 30 วัน",desc:"เข้าถึงช่วงข้อมูลย้อนหลังระยะยาว"},
  {key:"history_custom_range",group:"ข้อมูลย้อนหลัง",title:"กำหนดช่วงวันและเวลาเอง",desc:"เลือกช่วงเริ่มต้นและสิ้นสุดแบบกำหนดเอง"},
  {key:"export_data",group:"ข้อมูลย้อนหลัง",title:"ส่งออก Excel",desc:"ดาวน์โหลดข้อมูลออกเป็นไฟล์ Excel"},
  {key:"manage_help",group:"การจัดการระบบ",title:"แก้คำอธิบายปุ่ม ?",desc:"แก้ไขข้อความช่วยเหลือบน Dashboard"},
  {key:"manage_devices",group:"การจัดการระบบ",title:"แก้ชื่อจุดตรวจวัด",desc:"แก้ชื่อและข้อมูลที่แสดงของจุดตรวจวัด"},
  {key:"manage_announcement",group:"การจัดการระบบ",title:"จัดการประกาศ",desc:"สร้าง แก้ไข เปิด/ปิดประกาศบน Dashboard"},
  {key:"manage_users_view",group:"ผู้ใช้งาน",title:"ดูรายชื่อผู้ใช้งาน",desc:"เปิดหน้ารายชื่อบัญชีและข้อมูลสิทธิ์"}
];

const ROLE_PERMISSION_DEFAULTS={
  user:{history_extended:true,history_custom_range:true,export_data:true,manage_help:false,manage_devices:false,manage_announcement:false,manage_users_view:false},
  admin:{history_extended:true,history_custom_range:true,export_data:true,manage_help:true,manage_devices:true,manage_announcement:true,manage_users_view:true},
  owner:Object.fromEntries(PERMISSION_DEFINITIONS.map(x=>[x.key,true]))
};

function normalizedClientPermissions(user){
  if(!user)return {};
  const role=["user","admin","owner"].includes(user.role)?user.role:"user";
  const base={...(ROLE_PERMISSION_DEFAULTS[role]||ROLE_PERMISSION_DEFAULTS.user)};
  if(role==="owner")return base;
  const incoming=user.permissions&&typeof user.permissions==="object"?user.permissions:{};
  PERMISSION_DEFINITIONS.forEach(({key})=>{
    if(typeof incoming[key]==="boolean")base[key]=incoming[key];
  });
  return base;
}

function hasPermission(key,user=authUser){
  if(!user||!authToken)return false;
  return Boolean(normalizedClientPermissions(user)[key]);
}

function requirePermission(key,featureName="ฟังก์ชันนี้"){
  if(!authUser||!authToken){
    openAuthModal("login");
    setAuthMessage("loginMessage",`${featureName} ใช้ได้หลังเข้าสู่ระบบ`,"error");
    return false;
  }
  if(hasPermission(key))return true;
  alert(`บัญชีนี้ไม่มีสิทธิ์: ${featureName}`);
  return false;
}

function requireMember(featureName="ฟังก์ชันนี้"){
  return requirePermission("history_extended",featureName);
}

function updateMemberPermissionUI(){
// =====================================================
// V34 — MEMBER GATES
// =====================================================
  document.querySelectorAll("[data-member-only]").forEach(el=>{
    let key=el.dataset.permission||"";
    if(!key){
      if(el.id==="exportButton")key="export_data";
      else if(el.id==="historyRangeApply"||el.id==="customRangeStart"||el.id==="customRangeEnd")key="history_custom_range";
      else if(el.dataset.range==="7d"||el.dataset.range==="30d")key="history_extended";
    }
    const allowed=key?hasPermission(key):Boolean(authUser&&authToken);
    el.classList.toggle("member-locked",!allowed);
    el.setAttribute("aria-disabled",allowed?"false":"true");
    if(!allowed)el.title=authUser?"บัญชีนี้ไม่มีสิทธิ์ใช้งาน":"เข้าสู่ระบบเพื่อใช้งาน";
    else if(el.title==="เข้าสู่ระบบเพื่อใช้งาน"||el.title==="บัญชีนี้ไม่มีสิทธิ์ใช้งาน")el.removeAttribute("title");
  });

  const aiAllowed=Boolean(authUser&&authToken);
  document.querySelectorAll('[data-dashboard-page="analysis"]').forEach(el=>{
    el.classList.remove("member-locked");
    el.setAttribute("aria-disabled","false");
    el.removeAttribute("title");
  });
  [$('aiRefreshButton'),$('aiForecastRefreshButton')].forEach(btn=>{
    if(!btn)return;
    btn.disabled=false; // Guest ต้องกดได้ เพื่อให้ระบบเปิด Login Modal
    btn.classList.toggle("member-locked",!aiAllowed);
    btn.title=aiAllowed?"วิเคราะห์ใหม่ทันที":"เข้าสู่ระบบเพื่อใช้ AI";
  });
}
function updateAccountUI(){
  const button=$("accountButton"),text=$("accountButtonText"),chev=$("accountChevron"),badge=$("accountRoleBadge");
  const menu=$("accountDropdown");
  const contentBtn=$("openContentManagementButton"),usersBtn=$("openUserManagementButton");
  const header=document.querySelector(".site-header");
  if(!button||!text)return;

  header?.classList.toggle("is-authenticated",Boolean(authUser));
  header?.classList.toggle("is-guest",!authUser);

  if(authUser){
    text.textContent=authUser.display_name||authUser.email||"บัญชีของฉัน";
    setAvatar("accountAvatarImage","accountAvatarFallback",authUser);
    setAvatar("accountMenuAvatarImage","accountMenuAvatarFallback",authUser);
    chev?.classList.remove("hidden");
    if(badge){
      badge.textContent=authRoleLabel(authUser.role);
      badge.classList.remove("hidden");
    }
    $("headerNotificationButton")?.classList.remove("hidden");
    const mn=$("accountMenuName"),mr=$("accountMenuRole"),mp=$("accountMenuProvider");
    if(mn)mn.textContent=authUser.display_name||authUser.email;
    if($("accountMenuEmail"))$("accountMenuEmail").textContent=authUser.email||"";
    if(mr)mr.textContent=authRoleLabel(authUser.role);
    if(mp)mp.textContent=`เข้าสู่ระบบด้วย ${authProviderLabel(authUser)}`;
    const canManageContent=["manage_help","manage_devices","manage_announcement"].some(key=>hasPermission(key));
    const canManageUsers=hasPermission("manage_users_view");

    contentBtn?.classList.toggle("hidden",!canManageContent);
    usersBtn?.classList.toggle("hidden",!canManageUsers);

    const managementSection=document.querySelector(".account-management-section");
    managementSection?.classList.toggle("hidden",!(canManageContent||canManageUsers));

    syncMyAccountUI();
  }else{
    text.textContent="เข้าสู่ระบบ";
    setAvatar("accountAvatarImage","accountAvatarFallback",null);
    chev?.classList.add("hidden");
    badge?.classList.add("hidden");
    menu?.classList.add("hidden");
    $("headerNotificationButton")?.classList.add("hidden");
    $("headerNotificationBadge")?.classList.add("hidden");
    document.querySelector(".account-management-section")?.classList.add("hidden");

    aiPayload=null;
    aiForecastPayload=null;
    if(typeof renderAIForecast==="function")renderAIForecast(null);
    if(typeof loadAI==="function")loadAI(false);
    if(typeof loadAIForecast==="function")loadAIForecast(false);
  }
  updateMemberPermissionUI();

  if(authUser&&aiSectionActivated)activateAISection();
}

function clearAuthModalMessages(){
  clearTransientUiMessages([
    "loginMessage",
    "registerMessage",
    "forgotPasswordMessage",
    "resetPasswordMessage",
    "ownerSetupMessage"
  ]);
}

function openAuthModal(mode="login"){
  const modal=$("authModal"); if(!modal)return;
  clearAuthModalMessages();
  modal.classList.remove("hidden");modal.setAttribute("aria-hidden","false");
  setAuthMode(mode);
  loadAuthStatus();
  loadAuthConfig().finally(()=>{
    scheduleGoogleIdentityRender();
  });
}
function closeAuthModal(){
  const m=$("authModal");if(!m)return;
  clearAuthModalMessages();
  m.classList.add("hidden");m.setAttribute("aria-hidden","true");
}
function setAuthMode(mode){
  clearAuthModalMessages();
  document.querySelectorAll("[data-auth-mode]").forEach(b=>b.classList.toggle("active",b.dataset.authMode===mode));
  $("loginForm")?.classList.toggle("hidden",mode!=="login");
  $("registerForm")?.classList.toggle("hidden",mode!=="register");
  $("forgotPasswordForm")?.classList.add("hidden");
  $("resetPasswordForm")?.classList.add("hidden");
  $("ownerSetupForm")?.classList.add("hidden");
  $("authTabs")?.classList.remove("hidden");
  const t=$("authTitle");if(t)t.textContent=mode==="register"?"สมัครสมาชิก":"เข้าสู่ระบบ";
}

function openForgotPassword(){
  $("authModal")?.classList.remove("hidden");$("authModal")?.setAttribute("aria-hidden","false");
  $("authTabs")?.classList.add("hidden");$("loginForm")?.classList.add("hidden");$("registerForm")?.classList.add("hidden");
  $("ownerSetupForm")?.classList.add("hidden");$("resetPasswordForm")?.classList.add("hidden");$("forgotPasswordForm")?.classList.remove("hidden");
  if($("authTitle"))$("authTitle").textContent="ลืมรหัสผ่าน";
  const v=$("loginEmail")?.value||"";if(v&&$("forgotPasswordEmail"))$("forgotPasswordEmail").value=v;
}
function openResetPassword(){
  $("authModal")?.classList.remove("hidden");$("authModal")?.setAttribute("aria-hidden","false");
  $("authTabs")?.classList.add("hidden");$("loginForm")?.classList.add("hidden");$("registerForm")?.classList.add("hidden");
  $("ownerSetupForm")?.classList.add("hidden");$("forgotPasswordForm")?.classList.add("hidden");$("resetPasswordForm")?.classList.remove("hidden");
  if($("authTitle"))$("authTitle").textContent="ตั้งรหัสผ่านใหม่";
}
function resetTokenFromUrl(){return new URLSearchParams(location.search).get("reset_token")||"";}
function clearResetTokenFromUrl(){const u=new URL(location.href);u.searchParams.delete("reset_token");history.replaceState(null,"",u.pathname+(u.search||"")+u.hash);}

async function loadAuthStatus(){
  try{const j=await apiJson(API.authStatus);$("ownerBootstrapBox")?.classList.toggle("hidden",!!j.owner_exists);}catch(_){$("ownerBootstrapBox")?.classList.add("hidden");}
}

// =====================================================
// V34.5 — REFRESH ACCOUNT AFTER LOGIN
// =====================================================
async function refreshAuthUserAfterLogin(){
  if(!authToken)return null;
  try{
    const j=await apiJson(API.authMe);
    if(j?.user)authUser=j.user;
  }catch(_){
  }
  updateAccountUI();
  return authUser;
}

async function loadAuthConfig(){
  try{
    const j=await apiJson(API.authConfig);
    authGoogleClientId=String(j?.google_client_id||"");
    if(authGoogleClientId) await initGoogleIdentity();
    $("authSocialArea")?.classList.toggle("hidden",!authGoogleClientId);
    if(authGoogleClientId){
      scheduleGoogleIdentityRender();
    }
  }catch(_){
    $("authSocialArea")?.classList.add("hidden");
  }
}

function renderGoogleIdentityButton(){
  const target=$("googleSignInButton");
  if(
    !target ||
    !authGoogleClientId ||
    !window.google?.accounts?.id ||
    target.offsetParent===null
  )return false;

  const available=Math.floor(
    target.parentElement?.getBoundingClientRect().width ||
    target.getBoundingClientRect().width ||
    0
  );

  if(available<220)return false;

  const isPhone=window.matchMedia("(max-width: 760px)").matches;
  const maxWidth=isPhone?300:400;
  const sideGutter=isPhone?36:8;

  const width=Math.max(
    220,
    Math.min(maxWidth,available-sideGutter)
  );

  target.innerHTML="";
  target.removeAttribute("style");

  google.accounts.id.renderButton(target,{
    type:"standard",
    theme:"filled_black",
    size:"large",
    shape:"pill",
    text:"continue_with",
    logo_alignment:"right",
    width,
    locale:"th"
  });

  return true;
}

function scheduleGoogleIdentityRender(){
  [0,80,240].forEach(delay=>{
    setTimeout(()=>{
      if(!$("authModal")?.classList.contains("hidden")){
        renderGoogleIdentityButton();
      }
    },delay);
  });
}

async function initGoogleIdentity(){
  if(!authGoogleClientId)return;

  if(!window.google?.accounts?.id){
    await new Promise((resolve,reject)=>{
      let s=document.querySelector('script[data-google-identity="1"]');
      if(s){
        s.addEventListener("load",resolve,{once:true});
        s.addEventListener("error",reject,{once:true});
        return;
      }
      s=document.createElement("script");
      s.src="https://accounts.google.com/gsi/client";
      s.async=true;
      s.defer=true;
      s.dataset.googleIdentity="1";
      s.onload=resolve;
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }

  if(!window.google?.accounts?.id)return;

  if(!googleIdentityReady){
    google.accounts.id.initialize({
      client_id:authGoogleClientId,
      callback:handleGoogleCredential,
      auto_select:false,
      cancel_on_tap_outside:true
    });
    googleIdentityReady=true;
  }

  renderGoogleIdentityButton();
}

async function handleGoogleCredential(response){
  const credential=String(response?.credential||"");
  if(!credential)return;
  setAuthMessage("loginMessage","กำลังเข้าสู่ระบบด้วย Google...");
  try{
    const j=await apiJson(API.authGoogle,{method:"POST",body:JSON.stringify({credential})});
    authToken=String(j.token||"");
    authUser=j.user||null;
    localStorage.setItem(AUTH_TOKEN_KEY,authToken);
    await refreshAuthUserAfterLogin();
    setAuthMessage("loginMessage","เข้าสู่ระบบสำเร็จ","success");
    setTimeout(closeAuthModal,250);
  }catch(e){
    setAuthMessage("loginMessage",e.message,"error");
  }
}

async function restoreAuthSession(){
  if(!authToken){authUser=null;updateAccountUI();return;}
  try{const j=await apiJson(API.authMe);authUser=j.user||null;}catch(_){authToken="";authUser=null;localStorage.removeItem(AUTH_TOKEN_KEY);sessionStorage.removeItem(AUTH_TOKEN_KEY);}
  updateAccountUI();
}

async function doLogin(email,password){
  const j=await apiJson(API.authLogin,{method:"POST",body:JSON.stringify({email,password})});
  authToken=String(j.token||"");
  authUser=j.user||null;
  localStorage.setItem(AUTH_TOKEN_KEY,authToken);
  await refreshAuthUserAfterLogin();
  return j;
}

function applyManagedHelpOverrides(help){
  managedHelpCache=help&&typeof help==="object"?help:{};
  if(typeof HELP_CONTENT==="undefined")return;
  for(const [key,model] of Object.entries(managedHelpCache)){
    if(!model||typeof model!=="object")continue;
    HELP_CONTENT[key]={
      title:String(model.title||HELP_CONTENT[key]?.title||"คำอธิบาย"),
      html:managedHelpHtml(model)
    };
  }
}
function nl2brEsc(value){return esc(String(value||"")).replace(/\n/g,"<br>");}
function managedHelpHtml(model){
  const blocks=Array.isArray(model?.blocks)?model.blocks:[];
  if(!blocks.length)return `<div class="help-intro-card"><b>${esc(model?.title||"คำอธิบาย")}</b><span>ยังไม่มีคำอธิบายเพิ่มเติม</span></div>`;
  return blocks.map((b,i)=>`<section class="help-section"><h4>${esc(b?.heading||`หัวข้อ ${i+1}`)}</h4><p>${nl2brEsc(b?.description||"")}</p></section>`).join("");
}
function defaultHelpModel(key){
  const src=HELP_CONTENT?.[key];
  const title=String(src?.title||"คำอธิบาย");
  const box=document.createElement("div");box.innerHTML=String(src?.html||"");
  let blocks=[...box.querySelectorAll(".help-section")].map((sec,i)=>({id:`block-${i+1}`,heading:sec.querySelector("h4")?.textContent?.trim()||`หัวข้อ ${i+1}`,description:sec.querySelector("p")?.textContent?.trim()||sec.textContent.trim()}));
  if(!blocks.length){
    const intro=box.querySelector(".help-intro-card");
    const text=intro?.querySelector("span")?.textContent?.trim()||box.textContent.trim();
    if(text)blocks=[{id:"block-1",heading:"คำอธิบาย",description:text}];
  }
  return {title,blocks};
}
function getHelpEditorModel(key){
  const m=managedHelpCache?.[key];
  return m?{title:String(m.title||""),blocks:(m.blocks||[]).map(x=>({...x}))}:defaultHelpModel(key);
}
function helpButtonLabel(key){
  const b=document.querySelector(`.help-button[data-help="${CSS.escape(key)}"]`);
  return b?.getAttribute("aria-label")?.replace(/^ดูคำอธิบาย\s*/,"")||HELP_CONTENT?.[key]?.title||key;
}
function populateHelpKeySelect(){
  const select=$("helpKeySelect");if(!select)return;
  const keys=[...new Set([...document.querySelectorAll(".help-button[data-help]")].map(b=>b.dataset.help).filter(Boolean))];
  select.innerHTML=keys.map(k=>`<option value="${esc(k)}">${esc(helpButtonLabel(k))}</option>`).join("");
  currentHelpEditorKey=select.value||keys[0]||"";loadHelpEditor(currentHelpEditorKey);
}
function loadHelpEditor(key){
  currentHelpEditorKey=key;const m=getHelpEditorModel(key);
  if($("helpEditorTitle"))$("helpEditorTitle").value=m.title||"";
  renderHelpBlockEditor(m.blocks||[]);renderHelpPreview();
}
function renderHelpBlockEditor(blocks){
  const root=$("helpBlockList");if(!root)return;
  root.innerHTML="";
  (blocks||[]).forEach((b,i)=>root.appendChild(createHelpBlockElement(b,i)));
}
function createHelpBlockElement(block={},index=0){
  const d=document.createElement("div");d.className="admin-help-block";d.dataset.blockId=block.id||`block-${Date.now()}-${index}`;
  d.innerHTML=`<div class="admin-help-block-head"><b>หัวข้อ ${index+1}</b><button type="button" class="admin-remove-block">ลบ</button></div><label class="admin-field">หัวข้อเรื่อง<input class="admin-block-heading" type="text" maxlength="120"></label><label class="admin-field">คำอธิบาย<textarea class="admin-block-description" rows="5" maxlength="1800"></textarea></label>`;
  d.querySelector(".admin-block-heading").value=block.heading||"";d.querySelector(".admin-block-description").value=block.description||"";
  d.querySelector(".admin-remove-block").addEventListener("click",()=>{d.remove();renumberHelpBlocks();renderHelpPreview();});
  d.querySelectorAll("input,textarea").forEach(el=>el.addEventListener("input",renderHelpPreview));return d;
}
function renumberHelpBlocks(){document.querySelectorAll("#helpBlockList .admin-help-block").forEach((d,i)=>{const b=d.querySelector(".admin-help-block-head b");if(b)b.textContent=`หัวข้อ ${i+1}`;});}
function collectHelpEditor(){
  const blocks=[...document.querySelectorAll("#helpBlockList .admin-help-block")].map((d,i)=>({id:d.dataset.blockId||`block-${i+1}`,heading:d.querySelector(".admin-block-heading")?.value.trim()||"",description:d.querySelector(".admin-block-description")?.value.trim()||""})).filter(x=>x.heading||x.description);
  return {help_key:currentHelpEditorKey,title:$("helpEditorTitle")?.value.trim()||"",blocks};
}
function renderHelpPreview(){
  const p=$("helpLivePreview");if(!p)return;const m=collectHelpEditor();
  p.innerHTML=`<div class="help-popover-header"><b>${esc(m.title||"คำอธิบาย")}</b></div><div class="help-popover-body">${managedHelpHtml(m)}</div>`;
}
async function saveHelpEditor(){
  const b=$("saveHelpButton");if(b)b.disabled=true;setAuthMessage("helpSaveMessage","กำลังบันทึก...");
  try{const payload=collectHelpEditor();const j=await apiJson(API.manageHelp,{method:"POST",body:JSON.stringify(payload)});managedHelpCache[payload.help_key]=j.data;applyManagedHelpOverrides(managedHelpCache);publicDisplayConfig.help=managedHelpCache;setAuthMessage("helpSaveMessage","บันทึกแล้ว และ Dashboard จะใช้ข้อความใหม่นี้ทันที","success");}
  catch(e){setAuthMessage("helpSaveMessage",e.message,"error");}finally{if(b)b.disabled=false;}
}

function renderAdminDevices(){
  const root=$("adminDeviceList");if(!root)return;
  const devices=Array.isArray(publicDisplayConfig?.devices)?publicDisplayConfig.devices:[];
  root.innerHTML=devices.map((d,i)=>`<div class="admin-device-card" data-device-id="${esc(d.device_id)}">
    <h4>📍 จุดตรวจวัด ${i+1}</h4>
    <div class="admin-device-id">รหัสข้อมูล: ${esc(d.device_id)}</div>
    <label class="admin-field">ชื่อที่แสดง<input class="admin-device-display" maxlength="60" value="${esc(d.display_name||`จุดตรวจวัด ${i+1}`)}"></label>
    <label class="admin-field">ชื่อตำแหน่ง (ไม่บังคับ)<input class="admin-device-location" maxlength="100" value="${esc(d.location_name||"")}"></label>
    <label class="admin-field">คำอธิบาย (ไม่บังคับ)<textarea class="admin-device-description" maxlength="300" rows="3">${esc(d.description||"")}</textarea></label>
  </div>`).join("");
  root.querySelectorAll("input,textarea").forEach(el=>el.addEventListener("input",renderAdminDevicePreview));
  const sel=$("adminDevicePreviewSelect");
  if(sel){
    sel.innerHTML=devices.map((d,i)=>`<option value="${esc(d.device_id)}">${esc(d.display_name||`จุดตรวจวัด ${i+1}`)}</option>`).join("");
    sel.onchange=renderAdminDevicePreview;
  }
  renderAdminDevicePreview();
}

function renderAdminDevicePreview(){
  const cards=[...document.querySelectorAll(".admin-device-card")];
  if(!cards.length)return;
  const sel=$("adminDevicePreviewSelect");
  let card=cards.find(x=>x.dataset.deviceId===sel?.value)||cards[0];
  const name=(card.querySelector(".admin-device-display")?.value||card.dataset.deviceId||"จุดตรวจวัด").trim();
  const location=(card.querySelector(".admin-device-location")?.value||"").trim();
  const description=(card.querySelector(".admin-device-description")?.value||"").trim();
  if($("adminDevicePreviewName"))$("adminDevicePreviewName").textContent=name;
  if($("adminDevicePreviewLocation")){
    $("adminDevicePreviewLocation").textContent=location;
    $("adminDevicePreviewLocation").classList.toggle("hidden",!location);
  }
  if($("adminDevicePreviewDescription")){
    $("adminDevicePreviewDescription").textContent=description;
    $("adminDevicePreviewDescription").classList.toggle("hidden",!description);
  }
  if(sel){
    [...sel.options].forEach(opt=>{
      const c=cards.find(x=>x.dataset.deviceId===opt.value);
      if(c)opt.textContent=(c.querySelector(".admin-device-display")?.value||opt.value).trim();
    });
  }
}
async function saveAdminDevices(){
  const devices=[...document.querySelectorAll(".admin-device-card")].map(d=>({device_id:d.dataset.deviceId,display_name:d.querySelector(".admin-device-display")?.value||"",location_name:d.querySelector(".admin-device-location")?.value||"",description:d.querySelector(".admin-device-description")?.value||""}));
  const b=$("saveDevicesButton");if(b)b.disabled=true;setAuthMessage("deviceSaveMessage","กำลังบันทึก...");
  try{await apiJson(API.manageDevices,{method:"POST",body:JSON.stringify({devices})});await loadPublicDisplayConfig();renderAdminDevices();setAuthMessage("deviceSaveMessage","บันทึกชื่อจุดตรวจวัดแล้ว","success");}
  catch(e){setAuthMessage("deviceSaveMessage",e.message,"error");}finally{if(b)b.disabled=false;}
}

function renderAnnouncementPreview(){
  const root=$("announcementPreview");if(!root)return;const enabled=$("announcementEnabled")?.checked;const sev=$("announcementSeverity")?.value||"info";const title=$("announcementTitle")?.value.trim()||"ประกาศจากระบบ";const msg=$("announcementMessage")?.value.trim()||"ตัวอย่างข้อความประกาศ";
  root.innerHTML=enabled?`<div class="site-announcement is-${esc(sev)}"><span class="site-announcement-icon">${sev==="warning"?"⚠":sev==="maintenance"?"🛠":"ℹ"}</span><div><strong>${esc(title)}</strong><p>${nl2brEsc(msg)}</p></div></div>`:`<div class="admin-empty">ประกาศถูกปิดอยู่ ผู้ใช้ทั่วไปจะไม่เห็นส่วนนี้</div>`;
}
function loadAnnouncementEditor(){
  const c=publicDisplayConfig?.content||{};if($("announcementEnabled"))$("announcementEnabled").checked=String(c.announcement_enabled||"0")==="1";if($("announcementSeverity"))$("announcementSeverity").value=c.announcement_severity||"info";if($("announcementTitle"))$("announcementTitle").value=c.announcement_title||"";if($("announcementMessage"))$("announcementMessage").value=c.announcement_message||"";renderAnnouncementPreview();
}
async function saveAnnouncement(){
  const payload={enabled:$("announcementEnabled")?.checked?"1":"0",severity:$("announcementSeverity")?.value||"info",title:$("announcementTitle")?.value||"",message:$("announcementMessage")?.value||""};const b=$("saveAnnouncementButton");if(b)b.disabled=true;setAuthMessage("announcementSaveMessage","กำลังบันทึก...");
  try{await apiJson(API.manageAnnouncement,{method:"POST",body:JSON.stringify(payload)});await loadPublicDisplayConfig();loadAnnouncementEditor();setAuthMessage("announcementSaveMessage","บันทึกประกาศแล้ว","success");}catch(e){setAuthMessage("announcementSaveMessage",e.message,"error");}finally{if(b)b.disabled=false;}
}

async function loadAdminUsers(){
  const root=$("adminUserList");
  if(!root)return;
  root.innerHTML='<div class="admin-empty">กำลังโหลด...</div>';
  try{
    const j=await apiJson(API.manageUsers);
    adminUsersCache=Array.isArray(j.data)?j.data:[];
    $("addAdminModeButton")?.classList.toggle("hidden",authUser?.role!=="owner");
    renderAdminUsers();
  }catch(e){
    root.innerHTML=`<div class="admin-empty">${esc(e.message)}</div>`;
  }
}

function filteredAdminUsers(){
  const q=String($("adminUserSearch")?.value||"").trim().toLowerCase();
  const role=$("adminUserRoleFilter")?.value||"all";
  return adminUsersCache.filter(u=>{
    const matchesText=!q||
      String(u.display_name||"").toLowerCase().includes(q)||
      String(u.email||"").toLowerCase().includes(q);
    return matchesText&&(role==="all"||u.role===role);
  });
}

function permissionEditorHtml(user){
  const perms=normalizedClientPermissions(user);
  const groups=[...new Set(PERMISSION_DEFINITIONS.map(x=>x.group))];
  return groups.map(group=>{
    const items=PERMISSION_DEFINITIONS.filter(x=>x.group===group);
    return `<section class="admin-permission-group">
      <div class="admin-permission-group-head">
        <b>${esc(group)}</b>
        <span>${items.filter(x=>perms[x.key]).length} / ${items.length} เปิด</span>
      </div>
      <div class="admin-permission-list">
        ${items.map(item=>`
          <label class="admin-permission-item">
            <span class="admin-permission-copy">
              <b>${esc(item.title)}</b>
              <small>${esc(item.desc)}</small>
            </span>
            <span class="admin-permission-switch">
              <input class="admin-user-permission" type="checkbox" data-permission-key="${esc(item.key)}" ${perms[item.key]?"checked":""}>
              <i></i>
            </span>
          </label>`).join("")}
      </div>
    </section>`;
  }).join("");
}

function applyRoleDefaultsToEditor(card,role){
  if(!card)return;
  const defaults=ROLE_PERMISSION_DEFAULTS[role]||ROLE_PERMISSION_DEFAULTS.user;
  card.querySelectorAll(".admin-user-permission").forEach(input=>{
    input.checked=Boolean(defaults[input.dataset.permissionKey]);
    input.disabled=role==="owner";
  });
  const note=card.querySelector(".admin-permission-role-note");
  if(note)note.textContent=role==="owner"
    ?"Owner มีสิทธิ์ทั้งหมดโดยอัตโนมัติและไม่สามารถปิดสิทธิ์รายข้อได้"
    :"เลือกเปิด/ปิดเพิ่มเติมได้อิสระจากค่าเริ่มต้นของ Role";
}

function renderAdminUsers(){
  const root=$("adminUserList");
  if(!root)return;
  const users=filteredAdminUsers();
  const isOwner=authUser?.role==="owner";
  const ownId=Number(authUser?.id||0);

  root.innerHTML=users.map(u=>{
    const self=Number(u.id)===ownId;
    const provider=u.auth_provider==="google"?"Google":u.google_linked?"Email + Google":"Email";
    const roleClass=`is-${esc(u.role)}`;

    let action="";
    if(self){
      action=`<div class="admin-user-self-lock">บัญชีของคุณ</div>`;
    }else if(isOwner&&adminAddMode){
      action=u.role==="admin"
        ?`<div class="admin-user-done">เป็น Admin แล้ว</div>`
        :`<button class="admin-promote-button" type="button" data-promote-admin="${u.id}">ตั้งเป็น Admin</button>`;
    }else if(isOwner){
      action=`<button class="admin-user-manage-button" type="button">⚙ จัดการสิทธิ์</button>`;
    }else{
      action=`<div class="admin-user-readonly">ดูอย่างเดียว</div>`;
    }

    return `<article class="admin-user-card" data-user-id="${u.id}">
      <div class="admin-user-main">
        <div class="admin-user-avatar">${esc((u.display_name||u.email||"U").slice(0,1).toUpperCase())}</div>
        <div class="admin-user-identity">
          <div class="admin-user-title-row">
            <b>${esc(u.display_name||"ผู้ใช้งาน")}</b>
            ${self?'<span class="admin-user-you">คุณ</span>':""}
          </div>
          <span>${esc(u.email)}</span>
          <div class="admin-user-meta">
            <i class="admin-role-chip ${roleClass}">${esc(authRoleLabel(u.role))}</i>
            <i class="admin-provider-chip">${esc(provider)}</i>
          </div>
        </div>
        <div class="admin-user-action">${action}</div>
      </div>

      ${(!self&&isOwner&&!adminAddMode&&u.role!=="owner")?`
      <div class="admin-user-editor admin-user-editor-v35 hidden">
        <div class="admin-user-editor-top">
          <label>Role หลัก
            <select class="admin-user-role">
              <option value="user" ${u.role==="user"?"selected":""}>User</option>
              <option value="admin" ${u.role==="admin"?"selected":""}>Admin</option>
            </select>
          </label>
          <button class="admin-permission-reset" type="button">↺ ใช้ค่าเริ่มต้นตาม Role</button>
        </div>

        <div class="admin-permission-role-note">${u.role==="owner"?"Owner มีสิทธิ์ทั้งหมดโดยอัตโนมัติและไม่สามารถปิดสิทธิ์รายข้อได้":"เลือกเปิด/ปิดสิทธิ์รายข้อได้ คล้าย Permission ของ Discord"}</div>

        <div class="admin-permission-grid">
          ${permissionEditorHtml(u)}
        </div>

        <div class="admin-user-danger-zone">
          <div><b>ลบบัญชี</b><span>ลบบัญชีและเซสชันทั้งหมดอย่างถาวร การกระทำนี้ย้อนกลับไม่ได้</span></div>
          <button class="admin-user-delete" type="button">ลบบัญชี</button>
        </div>
        <div class="admin-user-editor-footer">
          <span>การเปลี่ยนสิทธิ์มีผลหลังบันทึก และฝั่ง Worker จะตรวจซ้ำก่อนอนุญาต</span>
          <button class="admin-user-save" type="button">บันทึกสิทธิ์</button>
        </div>
      </div>`:""}
    </article>`;
  }).join("")||'<div class="admin-empty">ไม่พบผู้ใช้ที่ตรงกับการค้นหา</div>';

  root.querySelectorAll(".admin-user-manage-button").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const card=btn.closest(".admin-user-card");
      card?.querySelector(".admin-user-editor")?.classList.toggle("hidden");
    });
  });

  root.querySelectorAll(".admin-user-role").forEach(select=>{
    select.addEventListener("change",()=>{
      const card=select.closest(".admin-user-card");
      applyRoleDefaultsToEditor(card,select.value);
    });
  });

  root.querySelectorAll(".admin-permission-reset").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const card=btn.closest(".admin-user-card");
      applyRoleDefaultsToEditor(card,card?.querySelector(".admin-user-role")?.value||"user");
    });
  });

  root.querySelectorAll(".admin-user-save").forEach(btn=>{
    btn.addEventListener("click",()=>saveAdminUserRow(btn.closest(".admin-user-card")));
  });
  root.querySelectorAll(".admin-user-delete").forEach(btn=>{
    btn.addEventListener("click",()=>deleteAdminUser(btn.closest(".admin-user-card")));
  });
  root.querySelectorAll("[data-promote-admin]").forEach(btn=>{
    btn.addEventListener("click",()=>promoteUserToAdmin(Number(btn.dataset.promoteAdmin)));
  });

  root.querySelectorAll(".admin-user-card").forEach(card=>{
    const role=card.querySelector(".admin-user-role")?.value;
    if(role==="owner")card.querySelectorAll(".admin-user-permission").forEach(x=>x.disabled=true);
  });
}

async function saveAdminUserRow(row){
  if(!row||authUser?.role!=="owner")return;
  const btn=row.querySelector(".admin-user-save");
  if(btn)btn.disabled=true;
  try{
    await apiJson(API.manageUsersUpdate,{
      method:"POST",
      body:JSON.stringify({
        user_id:Number(row.dataset.userId),
        role:row.querySelector(".admin-user-role")?.value,
        permissions:Object.fromEntries(
          [...row.querySelectorAll(".admin-user-permission")]
            .map(input=>[input.dataset.permissionKey,Boolean(input.checked)])
        )
      })
    });
    setAuthMessage("userSaveMessage","อัปเดตสิทธิ์เรียบร้อย","success");
    await loadAdminUsers();
  }catch(e){
    setAuthMessage("userSaveMessage",e.message,"error");
  }finally{
    if(btn)btn.disabled=false;
  }
}

async function deleteAdminUser(row){
  if(!row||authUser?.role!=="owner")return;
  const userId=Number(row.dataset.userId||0);
  const user=adminUsersCache.find(x=>Number(x.id)===userId);
  if(!user)return;
  const label=user.display_name||user.email||"บัญชีนี้";
  if(!confirm(`ต้องการลบบัญชี “${label}” หรือไม่?\n\nบัญชีและเซสชันทั้งหมดจะถูกลบอย่างถาวร และไม่สามารถย้อนกลับได้`))return;
  const btn=row.querySelector(".admin-user-delete"); if(btn)btn.disabled=true;
  try{
    await apiJson(`${API.manageUsers}/delete`,{method:"POST",body:JSON.stringify({user_id:userId})});
    setAuthMessage("userSaveMessage",`ลบบัญชี ${label} เรียบร้อย`,"success");
    await loadAdminUsers();
  }catch(e){setAuthMessage("userSaveMessage",e.message,"error");if(btn)btn.disabled=false;}
}

async function promoteUserToAdmin(userId){
  if(authUser?.role!=="owner"||!userId)return;
  const user=adminUsersCache.find(x=>Number(x.id)===Number(userId));
  if(!user)return;
  try{
    await apiJson(API.manageUsersUpdate,{
      method:"POST",
      body:JSON.stringify({user_id:userId,role:"admin"})
    });
    setAuthMessage("userSaveMessage",`ตั้ง ${user.display_name||user.email} เป็น Admin แล้ว`,"success");
    adminAddMode=false;
    $("adminAddModeBanner")?.classList.add("hidden");
    await loadAdminUsers();
  }catch(e){
    setAuthMessage("userSaveMessage",e.message,"error");
  }
}

function setAdminAddMode(enabled){
  adminAddMode=Boolean(enabled)&&authUser?.role==="owner";
  $("adminAddModeBanner")?.classList.toggle("hidden",!adminAddMode);
  if(adminAddMode){
    if($("adminUserRoleFilter"))$("adminUserRoleFilter").value="all";
    $("adminUserSearch")?.focus();
  }
  renderAdminUsers();
}

function hasAnyManagementPermission(){
  return ["manage_help","manage_devices","manage_announcement","manage_users_view"].some(key=>hasPermission(key));
}

function openAdminCenter(targetTab=null){
  if(!hasAnyManagementPermission())return;
  clearTransientUiMessages([
    "helpSaveMessage",
    "deviceSaveMessage",
    "announcementSaveMessage",
    "userSaveMessage"
  ]);
  const m=$("adminCenter");if(!m)return;
  const userMode=targetTab==="users";
  if(userMode&&!hasPermission("manage_users_view"))return;
  const contentTabs=["help","devices","announcement"];
  const permissionMap={help:"manage_help",devices:"manage_devices",announcement:"manage_announcement"};
  const allowedContent=contentTabs.find(tab=>hasPermission(permissionMap[tab]));
  if(!userMode&&!allowedContent)return;

  m.classList.toggle("admin-users-page",userMode);
  m.classList.toggle("admin-content-page",!userMode);
  m.classList.remove("hidden");m.setAttribute("aria-hidden","false");
  $("accountDropdown")?.classList.add("hidden");
  if($("adminRolePill"))$("adminRolePill").textContent=authRoleLabel(authUser.role);
  if($("adminCenterEyebrow"))$("adminCenterEyebrow").textContent=userMode?"USER MANAGEMENT":"CONTENT MANAGEMENT";
  if($("adminCenterTitle"))$("adminCenterTitle").textContent=userMode?"จัดการผู้ใช้งาน":"จัดการเนื้อหา";
  if($("adminCenterSubtitle"))$("adminCenterSubtitle").textContent=userMode?"จัดการ Role, Permission และบัญชีผู้ใช้งาน":"จัดการคำอธิบาย จุดตรวจวัด และประกาศของ Dashboard";

  document.querySelector('[data-admin-tab="help"]')?.classList.toggle("hidden",userMode||!hasPermission("manage_help"));
  document.querySelector('[data-admin-tab="devices"]')?.classList.toggle("hidden",userMode||!hasPermission("manage_devices"));
  document.querySelector('[data-admin-tab="announcement"]')?.classList.toggle("hidden",userMode||!hasPermission("manage_announcement"));
  document.querySelector('[data-admin-tab="users"]')?.classList.toggle("hidden",!userMode);

  if(userMode){loadAdminUsers();switchAdminTab("users");}
  else{if(hasPermission("manage_help"))populateHelpKeySelect();if(hasPermission("manage_devices"))renderAdminDevices();if(hasPermission("manage_announcement"))loadAnnouncementEditor();switchAdminTab(allowedContent);}
}
function closeAdminCenter(){
  const m=$("adminCenter");if(!m)return;
  clearTransientUiMessages([
    "helpSaveMessage",
    "deviceSaveMessage",
    "announcementSaveMessage",
    "userSaveMessage"
  ]);
  m.classList.add("hidden");m.setAttribute("aria-hidden","true");
}
function switchAdminTab(tab){
  clearTransientUiMessages([
    "helpSaveMessage",
    "deviceSaveMessage",
    "announcementSaveMessage",
    "userSaveMessage"
  ]);
  document.querySelectorAll(".admin-nav").forEach(b=>b.classList.toggle("active",b.dataset.adminTab===tab));
  document.querySelectorAll(".admin-panel").forEach(p=>p.classList.toggle("active",p.dataset.adminPanel===tab));
  if(tab==="users")loadAdminUsers();
  if(tab==="announcement")loadAnnouncementEditor();
  if(tab==="devices")renderAdminDevices();
}

// =====================================================
// V34.1 — MY ACCOUNT CENTER
// =====================================================
function syncMyAccountUI(){
  if(!authUser)return;
  setAvatar("myAccountAvatarImage","myAccountAvatarFallback",authUser);
  const name=authUser.display_name||authUser.email||"ผู้ใช้งาน";
  const email=authUser.email||"--";
  const role=authRoleLabel(authUser.role);
  const provider=`เข้าสู่ระบบด้วย ${authProviderLabel(authUser)}`;
  [["myAccountName",name],["myAccountEmail",email],["myAccountDisplayName",name],["myAccountEmailDetail",email],["myAccountRole",role],["myAccountRoleDetail",role],["myAccountProvider",authProviderLabel(authUser)],["myAccountProviderDetail",provider]].forEach(([id,value])=>{const el=$(id);if(el)el.textContent=value;});
  $("myAccountChangePassword")?.classList.toggle("hidden",authUser.auth_provider==="google");
  $("myAccountUseGooglePhoto")?.classList.toggle("hidden",!authUser.google_picture_url||!authUser.profile_image_url);
}
function openMyAccount(){
  if(!authUser){openAuthModal("login");return;}
  clearTransientUiMessages(["profileEditorMessage","accountSecurityMessage"]);
  syncMyAccountUI();
  const m=$("myAccountCenter");if(!m)return;
  m.classList.remove("hidden");m.setAttribute("aria-hidden","false");$("accountDropdown")?.classList.add("hidden");
}
function closeMyAccount(){
  const m=$("myAccountCenter");if(!m)return;
  clearTransientUiMessages(["profileEditorMessage","accountSecurityMessage"]);
  m.classList.add("hidden");m.setAttribute("aria-hidden","true");
}

function reopenAccountMenu(){
  if(!authUser)return;
  const menu=$("accountDropdown");
  if(menu){
    menu.classList.remove("hidden");
    $("accountButton")?.setAttribute("aria-expanded","true");
  }
}

function backFromMyAccount(){
  closeMyAccount();
  reopenAccountMenu();
}

function openAccountSecurity(){
  if(!authUser)return;
  const m=$("accountSecurityModal");if(!m)return;
  $("accountSecurityForm")?.reset();if($("accountSecurityMessage"))$("accountSecurityMessage").textContent="";
  m.classList.remove("hidden");m.setAttribute("aria-hidden","false");
}
function closeAccountSecurity(){
  const m=$("accountSecurityModal");if(!m)return;
  clearTransientUiMessages(["accountSecurityMessage"]);
  m.classList.add("hidden");m.setAttribute("aria-hidden","true");
}
function chooseProfileImageFromAccount(){$("profileImageInput")?.click();}

// =====================================================
// V34.2 — NOTIFICATIONS
// =====================================================
const DEFAULT_NOTIFICATION_PREFS={enabled:true,dust:true,temperature:true,humidity:true,heat_index:true,device:true};
let notificationPrefs={...DEFAULT_NOTIFICATION_PREFS};
let notificationPrefsLoadedFor=null;
let notificationCheckBusy=false;
let notificationSeeded=false;
let lastNotificationDetail=null;
let notificationInboxItems=[];
let notificationInboxTimer=null;

function formatNotificationTime(value){
  const d=value?new Date(String(value).replace(" ","T")+"Z"):null;
  if(!d||Number.isNaN(d.getTime()))return "--";
  const diff=Date.now()-d.getTime();
  if(diff>=0&&diff<60000)return "เมื่อสักครู่";
  if(diff>=60000&&diff<3600000)return `${Math.floor(diff/60000)} นาทีที่แล้ว`;
  if(diff>=3600000&&diff<86400000)return `${Math.floor(diff/3600000)} ชั่วโมงที่แล้ว`;
  return d.toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
}

function updateNotificationBadge(unread=0){
  const badge=$("headerNotificationBadge");
  if(!badge)return;
  const n=Math.max(0,Number(unread)||0);
  badge.textContent=n>9?"9+":String(n);
  badge.classList.toggle("hidden",n===0||!authUser);
}

function renderNotificationInbox(){
  const root=$("notificationInboxList");if(!root)return;
  if(!notificationInboxItems.length){
    root.innerHTML=`<div class="notification-inbox-empty"><span>🔕</span><b>ยังไม่มีการแจ้งเตือน</b><small>เมื่อสถานการณ์เปลี่ยน ระบบจะแสดงรายการไว้ที่นี่</small></div>`;
    return;
  }
  root.innerHTML=notificationInboxItems.map(n=>`
    <button type="button" class="notification-inbox-item ${n.is_read?"":"is-unread"}" data-notification-id="${Number(n.id)}">
      <span class="notification-inbox-item-icon">${esc(n.icon||"🔔")}</span>
      <span class="notification-inbox-item-copy">
        <b>${esc(n.title||"การแจ้งเตือน")}</b>
        <span>${esc(n.message||"")}</span>
        <small>${esc(n.device_id?deviceDisplayName(n.device_id):"ระบบ")} • ${esc(formatNotificationTime(n.created_at))}</small>
      </span>
      <i></i>
    </button>`).join("");
  root.querySelectorAll("[data-notification-id]").forEach(btn=>btn.addEventListener("click",()=>openInboxNotificationDetail(Number(btn.dataset.notificationId))));
}

async function loadNotificationInbox({silent=false}={}){
  if(!authUser)return;
  const root=$("notificationInboxList");
  if(!silent&&root)root.innerHTML=`<div class="notification-inbox-empty">กำลังโหลดการแจ้งเตือน...</div>`;
  try{
    const j=await apiJson(`${API.notifications}?limit=20`);
    notificationInboxItems=Array.isArray(j.notifications)?j.notifications:[];
    updateNotificationBadge(j.unread_count||0);
    renderNotificationInbox();
  }catch(err){
    if(!silent&&root)root.innerHTML=`<div class="notification-inbox-empty"><b>โหลดการแจ้งเตือนไม่สำเร็จ</b><small>${esc(err.message||"")}</small></div>`;
  }
}

async function markNotificationRead(id=null,all=false){
  if(!authUser)return;
  try{
    await apiJson(API.notificationRead,{method:"POST",body:JSON.stringify(all?{all:true}:{id})});
    await loadNotificationInbox({silent:true});
  }catch(_){}
}

function closeNotificationInbox(){
  const box=$("notificationInbox");if(!box)return;
  box.classList.add("hidden");box.setAttribute("aria-hidden","true");
  $("headerNotificationButton")?.setAttribute("aria-expanded","false");
}

async function openNotificationInbox(){
  if(!authUser)return;
  const box=$("notificationInbox");if(!box)return;
  const opening=box.classList.contains("hidden");
  if(!opening){closeNotificationInbox();return;}
  $("accountDropdown")?.classList.add("hidden");
  box.classList.remove("hidden");box.setAttribute("aria-hidden","false");
  $("headerNotificationButton")?.setAttribute("aria-expanded","true");
  await loadNotificationInbox();
}

async function openInboxNotificationDetail(id){
  const item=notificationInboxItems.find(x=>Number(x.id)===Number(id));if(!item)return;
  await markNotificationRead(item.id,false);
  closeNotificationInbox();
  $("notificationDetailIcon").textContent=item.icon||"🔔";
  $("notificationDetailTitle").textContent=item.title||"การแจ้งเตือน";
  $("notificationDetailMessage").textContent=item.message||"";
  $("notificationDetailDevice").textContent=item.device_id?deviceDisplayName(item.device_id):"ระบบ";
  $("notificationDetailTime").textContent=item.created_at?new Date(String(item.created_at).replace(" ","T")+"Z").toLocaleString("th-TH",{timeZone:"Asia/Bangkok"}):"--";
  const m=$("notificationDetailModal");if(m){m.classList.remove("hidden");m.setAttribute("aria-hidden","false");}
}

function startNotificationInboxPolling(){
  if(notificationInboxTimer)clearInterval(notificationInboxTimer);
  if(!authUser)return;
  loadNotificationInbox({silent:true});
  notificationInboxTimer=setInterval(()=>{if(authUser)loadNotificationInbox({silent:true});},60000);
}

function notificationStorageKey(){return `pm25-notification-state-${authUser?.id||"guest"}`;}
function notificationEventKey(device,type){return `${device}:${type}`;}
function readNotificationStates(){try{return JSON.parse(localStorage.getItem(notificationStorageKey())||"{}");}catch(_){return {};}}
function writeNotificationStates(v){try{localStorage.setItem(notificationStorageKey(),JSON.stringify(v));}catch(_){}}

async function ensureNotificationPreferences(){
  if(!authUser)return false;
  if(notificationPrefsLoadedFor===authUser.id)return true;
  try{
    const j=await apiJson(API.notificationPreferences);
    notificationPrefs={...DEFAULT_NOTIFICATION_PREFS,...(j.preferences||{})};
    notificationPrefsLoadedFor=authUser.id;
    return true;
  }catch(_){return false;}
}

function syncNotificationSettingsUI(){
  const map={notificationMaster:"enabled",notifyDust:"dust",notifyTemperature:"temperature",notifyHumidity:"humidity",notifyHeatIndex:"heat_index",notifyDevice:"device"};
  Object.entries(map).forEach(([id,key])=>{if($(id))$(id).checked=notificationPrefs[key]!==false;});
  updateNotificationMasterUI();
  updateNotificationPermissionUI();
}

function updateNotificationMasterUI(){
  const enabled=!!$("notificationMaster")?.checked;
  const body=$("notificationSettingsModal");
  body?.classList.toggle("notifications-paused",!enabled);
  ["notifyDust","notifyTemperature","notifyHumidity","notifyHeatIndex","notifyDevice"].forEach(id=>{
    const input=$(id);
    if(input)input.disabled=!enabled;
  });
}

async function openNotificationSettings(){
  if(!authUser){openAuthModal("login");return;}
  $("accountDropdown")?.classList.add("hidden");
  await ensureNotificationPreferences();
  syncNotificationSettingsUI();
  const m=$("notificationSettingsModal");if(!m)return;m.classList.remove("hidden");m.setAttribute("aria-hidden","false");
}
function closeNotificationSettings(){const m=$("notificationSettingsModal");if(!m)return;m.classList.add("hidden");m.setAttribute("aria-hidden","true");}
function closeNotificationDetail(){const m=$("notificationDetailModal");if(!m)return;m.classList.add("hidden");m.setAttribute("aria-hidden","true");}

function backFromNotificationSettings(){
  closeNotificationSettings();
  reopenAccountMenu();
}

function backFromAdminCenter(){
  closeAdminCenter();
  reopenAccountMenu();
}

function backFromNotificationDetail(){
  closeNotificationDetail();
}

function updateNotificationPermissionUI(){
  const card=$("notificationPermissionCard"),title=$("notificationPermissionTitle"),text=$("notificationPermissionText"),icon=$("notificationPermissionIcon"),btn=$("requestNotificationPermission");
  if(!card)return;
  card.classList.remove("is-granted","is-denied");
  if(!("Notification" in window)){title.textContent="เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน";text.textContent="ยังสามารถใช้ Dashboard ได้ตามปกติ";icon.textContent="ℹ️";btn.hidden=true;return;}
  btn.hidden=false;
  if(Notification.permission==="granted"){
    card.classList.add("is-granted");
    title.textContent="สิทธิ์เบราว์เซอร์: อนุญาตแล้ว";
    text.textContent="เบราว์เซอร์อนุญาตให้เว็บไซต์ส่งการแจ้งเตือนได้";
    icon.textContent="✓";
    btn.hidden=true;
    btn.disabled=true;
  }
  else if(Notification.permission==="denied"){
    card.classList.add("is-denied");
    title.textContent="สิทธิ์เบราว์เซอร์: ถูกบล็อก";
    text.textContent="หากต้องการใช้งาน กรุณาอนุญาต Notification จากการตั้งค่าเว็บไซต์ของเบราว์เซอร์";
    icon.textContent="!";
    btn.hidden=true;
    btn.disabled=true;
  }
  else{title.textContent="ยังไม่ได้อนุญาตการแจ้งเตือน";text.textContent="กดอนุญาตเพื่อรับข้อความแจ้งเตือนจากเบราว์เซอร์";icon.textContent="🔕";btn.textContent="อนุญาต";btn.disabled=false;}
}

async function requestBrowserNotificationPermission(){
  if(!("Notification" in window))return;
  try{await Notification.requestPermission();}catch(_){}
  updateNotificationPermissionUI();
  if(Notification.permission==="granted")await registerNotificationServiceWorker();
}

async function saveNotificationPreferences(){
  const status=$("notificationSaveStatus");
  const next={enabled:!!$("notificationMaster")?.checked,dust:!!$("notifyDust")?.checked,temperature:!!$("notifyTemperature")?.checked,humidity:!!$("notifyHumidity")?.checked,heat_index:!!$("notifyHeatIndex")?.checked,device:!!$("notifyDevice")?.checked};
  if(status)status.textContent="กำลังบันทึก...";
  try{const j=await apiJson(API.notificationPreferences,{method:"POST",body:JSON.stringify({preferences:next})});notificationPrefs={...DEFAULT_NOTIFICATION_PREFS,...j.preferences};notificationPrefsLoadedFor=authUser?.id||null;if(status)status.textContent="บันทึกแล้ว ✓";setTimeout(()=>{if(status)status.textContent="";},1800);}
  catch(err){if(status)status.textContent=err.message;}
}

async function registerNotificationServiceWorker(){
  return null;
}

function notificationSituationFor(node){
  const id=String(node?.device_id||node?.deviceID||"จุดตรวจวัด");
  const out=[];
  const status=String(node?.status||"").toLowerCase();
  out.push({type:"device",active:status==="offline",level:status==="offline"?"offline":"online",icon:"📡",title:status==="offline"?"อุปกรณ์ขาดการเชื่อมต่อ":"อุปกรณ์กลับมา Online",message:status==="offline"?`${id} เปลี่ยนสถานะเป็น Offline`:`${id} กลับมาส่งข้อมูลตามปกติ`});
  const pm25=finiteNumberOrNull(node?.pm25),pm10=finiteNumberOrNull(node?.pm10);
  const pg=pm25Guidance(pm25);const dustActive=(pm25!==null&&(pg.level==="warning"||pg.level==="critical"))||(pm10!==null&&pm10>120);
  out.push({type:"dust",active:dustActive,level:dustActive?`${pg.level}:${Math.round(pm25||0)}:${Math.round(pm10||0)}`:"normal",icon:"🌫️",title:"สถานการณ์ฝุ่นละออง",message:`${id} — PM2.5 ${pm25===null?"--":fmt(pm25)} µg/m³ • PM10 ${pm10===null?"--":fmt(pm10)} µg/m³`});
  const t=finiteNumberOrNull(node?.temperature),tl=temperatureLevel(t);const tempActive=t!==null&&["hot","very_hot","cold","very_cold"].includes(tl.level);
  out.push({type:"temperature",active:tempActive,level:tempActive?tl.level:"normal",icon:"🌡️",title:`อุณหภูมิ${tl.label?` — ${tl.label}`:""}`,message:`${id} วัดอุณหภูมิได้ ${t===null?"--":fmt(t)} °C`});
  const h=finiteNumberOrNull(node?.humidity),hl=humidityLevel(h);const humActive=h!==null&&hl.level!=="normal";
  out.push({type:"humidity",active:humActive,level:humActive?hl.level:"normal",icon:"💧",title:`ความชื้น${hl.label?` — ${hl.label}`:""}`,message:`${id} วัดความชื้นสัมพัทธ์ได้ ${h===null?"--":fmt(h)} %`});
  const hi=heatIndexC(t,h),hil=heatLevel(hi);const heatActive=hi!==null&&["warning","critical"].includes(hil.level);
  out.push({type:"heat_index",active:heatActive,level:heatActive?hil.level:"normal",icon:"☀️",title:`ดัชนีความร้อน${hil.label?` — ${hil.label}`:""}`,message:`${id} มี Heat Index ประมาณ ${hi===null?"--":fmt(hi)} °C`});
  return out.map(x=>({...x,device:id}));
}

async function showSituationNotification(evt){
  if(Notification.permission!=="granted")return;
  lastNotificationDetail={...evt,time:new Date().toISOString()};
  try{localStorage.setItem("pm25-last-notification",JSON.stringify(lastNotificationDetail));}catch(_){}
  const reg=await registerNotificationServiceWorker();
  const url=`${location.origin}${location.pathname}?notification=1&device=${encodeURIComponent(evt.device)}&type=${encodeURIComponent(evt.type)}`;
  if(reg){await reg.showNotification(`${evt.icon} ${evt.title}`,{body:evt.message,tag:`pm25-${evt.device}-${evt.type}`,renotify:true,data:{url,device:evt.device,type:evt.type}});}
}

async function checkSituationNotifications(){
  if(notificationCheckBusy||!authUser||!Array.isArray(latestNodes)||!latestNodes.length)return;
  notificationCheckBusy=true;
  try{
    if(!(await ensureNotificationPreferences())||notificationPrefs.enabled===false)return;
    const previous=readNotificationStates(),next={...previous},events=[];
    latestNodes.forEach(node=>notificationSituationFor(node).forEach(evt=>{
      const key=notificationEventKey(evt.device,evt.type),old=previous[key];next[key]=evt.level;
      const allowed=notificationPrefs[evt.type]!==false;
      if(notificationSeeded&&allowed&&old!==undefined&&old!==evt.level){
        if(evt.type==="device" || evt.active)events.push(evt);
      }
    }));
    writeNotificationStates(next);
    if(!notificationSeeded){notificationSeeded=true;return;}
    for(const evt of events.slice(0,3))await showSituationNotification(evt);
  }finally{notificationCheckBusy=false;}
}

function openNotificationDetailFromUrl(){
  const q=new URLSearchParams(location.search);if(q.get("notification")!=="1")return;
  let d=null;try{d=JSON.parse(localStorage.getItem("pm25-last-notification")||"null");}catch(_){}
  if(!d)return;
  $("notificationDetailIcon").textContent=d.icon||"🔔";$("notificationDetailTitle").textContent=d.title||"การแจ้งเตือน";$("notificationDetailMessage").textContent=d.message||"";$("notificationDetailDevice").textContent=d.device||"--";$("notificationDetailTime").textContent=d.time?new Date(d.time).toLocaleString("th-TH"):"ล่าสุด";
  const m=$("notificationDetailModal");if(m){m.classList.remove("hidden");m.setAttribute("aria-hidden","false");}
  history.replaceState({},"",location.pathname+location.hash);
}

(function setupAuthCmsV31(){
  const run=async()=>{
    await restoreAuthSession();
    if(authUser){ensureNotificationPreferences();startNotificationInboxPolling();}
    setTimeout(openNotificationDetailFromUrl,150);
    $("accountButton")?.addEventListener("click",()=>{if(!authUser){openAuthModal("login");return;}const m=$("accountDropdown");m?.classList.toggle("hidden");$("accountButton")?.setAttribute("aria-expanded",String(!m?.classList.contains("hidden")));});
    document.querySelectorAll("[data-auth-close]").forEach(x=>x.addEventListener("click",closeAuthModal));
    document.querySelectorAll("[data-admin-close]").forEach(x=>x.addEventListener("click",closeAdminCenter));
    document.querySelectorAll("[data-admin-back]").forEach(x=>x.addEventListener("click",backFromAdminCenter));
    document.querySelectorAll("[data-auth-mode]").forEach(x=>x.addEventListener("click",()=>setAuthMode(x.dataset.authMode)));
    document.querySelectorAll("[data-toggle-password]").forEach(button=>button.addEventListener("click",()=>{
      const input=$(button.dataset.togglePassword);
      if(!input)return;
      const show=input.type==="password";
      input.type=show?"text":"password";
      button.classList.toggle("is-visible",show);
      button.setAttribute("aria-pressed",String(show));
      button.setAttribute("aria-label",show?"ซ่อนรหัสผ่าน":"แสดงรหัสผ่าน");
    }));
    $("openForgotPasswordButton")?.addEventListener("click",openForgotPassword);
    $("backToLoginButton")?.addEventListener("click",()=>setAuthMode("login"));
    $("forgotPasswordForm")?.addEventListener("submit",async e=>{e.preventDefault();setAuthMessage("forgotPasswordMessage","กำลังส่งลิงก์...");try{const j=await apiJson(API.authForgotPassword,{method:"POST",body:JSON.stringify({email:$("forgotPasswordEmail").value})});setAuthMessage("forgotPasswordMessage",j.message||"หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ให้","success");}catch(err){setAuthMessage("forgotPasswordMessage",err.message,"error");}});
    $("resetPasswordForm")?.addEventListener("submit",async e=>{e.preventDefault();const a=$("resetPasswordNew").value,b=$("resetPasswordConfirm").value;if(a!==b){setAuthMessage("resetPasswordMessage","รหัสผ่านทั้งสองช่องไม่ตรงกัน","error");return;}setAuthMessage("resetPasswordMessage","กำลังตั้งรหัสผ่านใหม่...");try{const j=await apiJson(API.authResetPassword,{method:"POST",body:JSON.stringify({token:resetTokenFromUrl(),new_password:a})});setAuthMessage("resetPasswordMessage",j.message||"ตั้งรหัสผ่านใหม่เรียบร้อย","success");clearResetTokenFromUrl();setTimeout(()=>setAuthMode("login"),900);}catch(err){setAuthMessage("resetPasswordMessage",err.message,"error");}});
// =====================================================
// V34 — PROFILE IMAGE EVENTS
// =====================================================
    setupProfileEditorInteraction();
    $("myAccountChangePhoto")?.addEventListener("click",chooseProfileImageFromAccount);
    $("myAccountChangePhotoSecondary")?.addEventListener("click",chooseProfileImageFromAccount);
    $("profileImageInput")?.addEventListener("change",async e=>{
      const file=e.target.files?.[0];
      if(!file)return;
      try{await openProfileEditorFromFile(file);}catch(err){alert(err.message);}finally{e.target.value="";}
    });
    document.querySelectorAll("[data-profile-editor-close]").forEach(x=>x.addEventListener("click",closeProfileEditor));
    document.querySelectorAll("[data-profile-editor-back]").forEach(x=>x.addEventListener("click",closeProfileEditor));
    $("profileEditorCancel")?.addEventListener("click",closeProfileEditor);
    $("profileEditorSave")?.addEventListener("click",saveProfileEditor);
    $("myAccountUseGooglePhoto")?.addEventListener("click",async()=>{
      try{
        const j=await apiJson(API.authProfileImage,{method:"DELETE"});
        authUser=j.user||authUser;
        updateAccountUI();
        syncMyAccountUI();
      }catch(err){alert(err.message);}
    });

    $("loginForm")?.addEventListener("submit",async e=>{e.preventDefault();setAuthMessage("loginMessage","กำลังเข้าสู่ระบบ...");try{await doLogin($("loginEmail").value,$("loginPassword").value);setAuthMessage("loginMessage","เข้าสู่ระบบสำเร็จ","success");setTimeout(closeAuthModal,350);}catch(err){setAuthMessage("loginMessage",err.message,"error");}});
    $("registerForm")?.addEventListener("submit",async e=>{e.preventDefault();setAuthMessage("registerMessage","กำลังสร้างบัญชี...");try{await apiJson(API.authRegister,{method:"POST",body:JSON.stringify({display_name:$("registerName").value,email:$("registerEmail").value,password:$("registerPassword").value})});setAuthMessage("registerMessage","สร้างบัญชีแล้ว กรุณาเข้าสู่ระบบ","success");setTimeout(()=>setAuthMode("login"),500);}catch(err){setAuthMessage("registerMessage",err.message,"error");}});
    $("openOwnerSetupButton")?.addEventListener("click",()=>{$("authTabs")?.classList.add("hidden");$("loginForm")?.classList.add("hidden");$("registerForm")?.classList.add("hidden");$("ownerSetupForm")?.classList.remove("hidden");if($("authTitle"))$("authTitle").textContent="สร้าง Owner คนแรก";});
    $("cancelOwnerSetupButton")?.addEventListener("click",()=>setAuthMode("login"));
    $("ownerSetupForm")?.addEventListener("submit",async e=>{e.preventDefault();setAuthMessage("ownerSetupMessage","กำลังสร้าง Owner...");try{await apiJson(API.authBootstrapOwner,{method:"POST",body:JSON.stringify({display_name:$("ownerName").value,email:$("ownerEmail").value,password:$("ownerPassword").value,bootstrap_password:$("ownerBootstrapPassword").value})});setAuthMessage("ownerSetupMessage","สร้าง Owner แล้ว กรุณาเข้าสู่ระบบ","success");setTimeout(()=>setAuthMode("login"),600);}catch(err){setAuthMessage("ownerSetupMessage",err.message,"error");}});
    $("openNotificationSettingsButton")?.addEventListener("click",openNotificationSettings);
    $("notificationInboxSettings")?.addEventListener("click",()=>{closeNotificationInbox();openNotificationSettings();});
    $("notificationMarkAllRead")?.addEventListener("click",()=>markNotificationRead(null,true));

    document.querySelectorAll("[data-notification-close]").forEach(x=>x.addEventListener("click",closeNotificationSettings));
    document.querySelectorAll("[data-notification-back]").forEach(x=>x.addEventListener("click",backFromNotificationSettings));
    document.querySelectorAll("[data-notification-detail-close]").forEach(x=>x.addEventListener("click",closeNotificationDetail));
    document.querySelectorAll("[data-notification-detail-back]").forEach(x=>x.addEventListener("click",backFromNotificationDetail));
    $("headerNotificationButton")?.addEventListener("click",openNotificationInbox);
    $("requestNotificationPermission")?.addEventListener("click",requestBrowserNotificationPermission);
    $("notificationMaster")?.addEventListener("change",updateNotificationMasterUI);
    $("saveNotificationSettings")?.addEventListener("click",saveNotificationPreferences);
    $("notificationDetailGo")?.addEventListener("click",()=>{closeNotificationDetail();document.querySelector('[data-go-page="monitoring"]')?.click();});
    $("logoutButton")?.addEventListener("click",async()=>{try{await apiJson(API.authLogout,{method:"POST"});}catch(_){}authToken="";authUser=null;notificationPrefsLoadedFor=null;if(notificationInboxTimer){clearInterval(notificationInboxTimer);notificationInboxTimer=null;}notificationInboxItems=[];updateNotificationBadge(0);localStorage.removeItem(AUTH_TOKEN_KEY);sessionStorage.removeItem(AUTH_TOKEN_KEY);updateAccountUI();$("accountDropdown")?.classList.add("hidden");});
    $("openMyAccountButton")?.addEventListener("click",openMyAccount);
    $("openContentManagementButton")?.addEventListener("click",()=>openAdminCenter("content"));
    $("openUserManagementButton")?.addEventListener("click",()=>openAdminCenter("users"));
    document.querySelectorAll("[data-my-account-close]").forEach(x=>x.addEventListener("click",closeMyAccount));
    document.querySelectorAll("[data-account-back]").forEach(x=>x.addEventListener("click",backFromMyAccount));
    document.querySelectorAll("[data-security-close]").forEach(x=>x.addEventListener("click",closeAccountSecurity));
    document.querySelectorAll("[data-security-back]").forEach(x=>x.addEventListener("click",closeAccountSecurity));
    $("myAccountChangePassword")?.addEventListener("click",openAccountSecurity);
    $("adminUserSearch")?.addEventListener("input",renderAdminUsers);
    $("adminUserRoleFilter")?.addEventListener("change",renderAdminUsers);
    $("addAdminModeButton")?.addEventListener("click",()=>setAdminAddMode(true));
    $("cancelAddAdminMode")?.addEventListener("click",()=>setAdminAddMode(false));
    $("accountSecurityForm")?.addEventListener("submit",async e=>{
      e.preventDefault();
      const current=$("accountCurrentPassword")?.value||"",next=$("accountNewPassword")?.value||"",confirm=$("accountConfirmPassword")?.value||"";
      const msg=$("accountSecurityMessage");
      if(next.length<10){if(msg)msg.textContent="รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร";return;}
      if(next!==confirm){if(msg)msg.textContent="รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน";return;}
      if(msg)msg.textContent="กำลังบันทึก...";
      try{await apiJson(API.authChangePassword,{method:"POST",body:JSON.stringify({current_password:current,new_password:next})});if(msg)msg.textContent="เปลี่ยนรหัสผ่านเรียบร้อย";setTimeout(closeAccountSecurity,650);}catch(err){if(msg)msg.textContent=err.message;}
    });
    document.addEventListener("click",e=>{
      const box=$("notificationInbox"),bell=$("headerNotificationButton");
      if(box&&!box.classList.contains("hidden")&&!box.contains(e.target)&&!bell?.contains(e.target))closeNotificationInbox();
    });
    document.addEventListener("click",e=>{const dd=$("accountDropdown"),btn=$("accountButton");if(authUser&&dd&&!dd.classList.contains("hidden")&&!dd.contains(e.target)&&!btn?.contains(e.target))dd.classList.add("hidden");});
    document.querySelectorAll(".admin-nav").forEach(b=>b.addEventListener("click",()=>switchAdminTab(b.dataset.adminTab)));
    $("helpKeySelect")?.addEventListener("change",e=>loadHelpEditor(e.target.value));
    $("helpEditorTitle")?.addEventListener("input",renderHelpPreview);
    $("addHelpBlockButton")?.addEventListener("click",()=>{const root=$("helpBlockList");if(!root)return;root.appendChild(createHelpBlockElement({id:`block-${Date.now()}`,heading:"",description:""},root.children.length));renumberHelpBlocks();renderHelpPreview();});
    $("saveHelpButton")?.addEventListener("click",saveHelpEditor);
    $("saveDevicesButton")?.addEventListener("click",saveAdminDevices);
    ["announcementEnabled","announcementSeverity","announcementTitle","announcementMessage"].forEach(id=>$(id)?.addEventListener(id==="announcementEnabled"||id==="announcementSeverity"?"change":"input",renderAnnouncementPreview));
    $("saveAnnouncementButton")?.addEventListener("click",saveAnnouncement);
  };
  if(resetTokenFromUrl()){const oldRun=run;run=()=>{oldRun();setTimeout(openResetPassword,0);};}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});else run();
})();

// =====================================================
// V34.4 — TELEGRAM LINK
// =====================================================

const TELEGRAM_GROUP_URL="https://t.me/project2026PM";
const TELEGRAM_ANDROID_INTENT="intent://resolve?domain=project2026PM#Intent;scheme=tg;package=org.telegram.messenger;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dorg.telegram.messenger;end";

document.getElementById("telegramSituationLink")?.addEventListener("click",event=>{
    if(!/Android/i.test(navigator.userAgent))return;
    event.preventDefault();
    window.location.href=TELEGRAM_ANDROID_INTENT;
    setTimeout(()=>{
        if(document.visibilityState==="visible")window.location.href=TELEGRAM_GROUP_URL;
    },1400);
});
