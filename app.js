const API_URL =
"https://educational-pm25-api.project2026csemn.workers.dev/api/get_latest.php";
const HISTORY_API =
"https://educational-pm25-api.project2026csemn.workers.dev/api/get_history.php";
const EXPORT_API =
"https://educational-pm25-api.project2026csemn.workers.dev/api/export.php";
const MOTHER_STATUS_API =
"https://educational-pm25-api.project2026csemn.workers.dev/api/mother_status";
const ALERT_STATES_API =
"https://educational-pm25-api.project2026csemn.workers.dev/api/alert_states";
const STANDARDS_API =
"https://educational-pm25-api.project2026csemn.workers.dev/api/standards.php";

const TOTAL_NODES = 3;

let latestRecord = null;
let latestNodes = [];
let records = [];

let historyChart = null;
let forecastChart = null;

let forecastVisible = true;

let metric = "pm25";

let averageRange = "24h";

let customRangeStart = null;
let customRangeEnd = null;

let calendarDisplayDate =
new Date();

let calendarSelectionStep =
"start";

let apiConnectionOnline = false;

let motherStatus = null;

let alertStates = [];

let standardsData = null;


const RANGE_CONFIG = {

"30m": {
label: "30 นาที",
minutes: 30,
apiRange: "24h"
},

"1h": {
label: "1 ชั่วโมง",
minutes: 60,
apiRange: "24h"
},

"3h": {
label: "3 ชั่วโมง",
minutes: 180,
apiRange: "24h"
},

"6h": {
label: "6 ชั่วโมง",
minutes: 360,
apiRange: "24h"
},

"12h": {
label: "12 ชั่วโมง",
minutes: 720,
apiRange: "24h"
},

"24h": {
label: "24 ชั่วโมง",
minutes: 1440,
apiRange: "24h"
},

"3d": {
label: "3 วัน",
minutes: 4320,
apiRange: "7d"
},

"7d": {
label: "7 วัน",
minutes: 10080,
apiRange: "7d"
},

"30d": {
label: "30 วัน",
minutes: 43200,
apiRange: "30d"
}

};


function getRangeLabel(){

if(
averageRange === "custom" &&
customRangeStart &&
customRangeEnd
){

return (

customRangeStart.toLocaleString(
"th-TH",
{
timeZone:
"Asia/Bangkok",
day:
"2-digit",
month:
"short",
hour:
"2-digit",
minute:
"2-digit"
}
)

+

" – "

+

customRangeEnd.toLocaleString(
"th-TH",
{
timeZone:
"Asia/Bangkok",
day:
"2-digit",
month:
"short",
hour:
"2-digit",
minute:
"2-digit"
}
)

);

}


return (

RANGE_CONFIG[
averageRange
]?.label ||

"ช่วงเวลาที่เลือก"

);

}


function toDateTimeLocalValue(date){

if(!date){
return "";
}


const pad =
value =>
String(value)
.padStart(
2,
"0"
);


return (

date.getFullYear()

+

"-"

+

pad(
date.getMonth() + 1
)

+

"-"

+

pad(
date.getDate()
)

+

"T"

+

pad(
date.getHours()
)

+

":"

+

pad(
date.getMinutes()
)

);

}


function setPickerInputs(
start,
end
){

$("customRangeStart").value =
toDateTimeLocalValue(
start
);


$("customRangeEnd").value =
toDateTimeLocalValue(
end
);

}


function setQuickRange(
rangeKey
){

const config =
RANGE_CONFIG[
rangeKey
];


if(!config){
return;
}


const end =
new Date();


const start =
new Date(

end.getTime()

-

config.minutes *
60 *
1000

);


setPickerInputs(
start,
end
);


calendarDisplayDate =
new Date(end);


calendarSelectionStep =
"start";


updateQuickRangeUI(
rangeKey
);


renderRangeCalendar();

}


function updateQuickRangeUI(
activeRange
){

document
.querySelectorAll(
".quick-range-option"
)
.forEach(

button => {

const active =
button.dataset.range ===
activeRange;


button.style.background =
active
? "rgba(34,211,238,.10)"
: "transparent";


button.style.color =
active
? "#67e8f9"
: "#cbd5e1";


button.style.border =
active
? "1px solid rgba(34,211,238,.18)"
: "1px solid transparent";

}

);

}


function openHistoryRangePicker(){

const panel =
$("historyRangePanel");


panel.classList.remove(
"hidden"
);


$("historyRangeButton")
.setAttribute(
"aria-expanded",
"true"
);


const currentWindow =
getSelectedTimeWindow();


const start =
currentWindow
? currentWindow.start
: new Date(
Date.now()
-
24 *
60 *
60 *
1000
);


const end =
currentWindow
? currentWindow.end
: new Date();


setPickerInputs(
start,
end
);


calendarDisplayDate =
new Date(end);


calendarSelectionStep =
"start";


updateQuickRangeUI(

averageRange === "custom"
? null
: averageRange

);


renderRangeCalendar();

}


function closeHistoryRangePicker(){

$("historyRangePanel")
.classList.add(
"hidden"
);


$("historyRangeButton")
.setAttribute(
"aria-expanded",
"false"
);


$("customRangeError")
.classList.add(
"hidden"
);

}


function sameCalendarDay(
a,
b
){

return (

a &&
b &&

a.getFullYear() ===
b.getFullYear()

&&

a.getMonth() ===
b.getMonth()

&&

a.getDate() ===
b.getDate()

);

}


function dateOnlyFromInput(
inputId
){

const value =
$(inputId).value;


if(!value){
return null;
}


const date =
new Date(value);


return isNaN(
date.getTime()
)
? null
: date;

}


function renderRangeCalendar(){

const grid =
$("rangeCalendarGrid");


if(!grid){
return;
}


const year =
calendarDisplayDate
.getFullYear();


const month =
calendarDisplayDate
.getMonth();


$("rangeCalendarTitle")
.textContent =
calendarDisplayDate
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


grid.innerHTML =
"";


const firstDay =
new Date(
year,
month,
1
);


const firstWeekday =
firstDay.getDay();


const daysInMonth =
new Date(
year,
month + 1,
0
).getDate();


const prevMonthDays =
new Date(
year,
month,
0
).getDate();


const selectedStart =
dateOnlyFromInput(
"customRangeStart"
);


const selectedEnd =
dateOnlyFromInput(
"customRangeEnd"
);


const totalCells =
42;


for(
let index = 0;
index < totalCells;
index++
){

let dayNumber;

let cellMonth =
month;

let cellYear =
year;

let muted =
false;


if(index < firstWeekday){

dayNumber =
prevMonthDays -
firstWeekday +
index +
1;


cellMonth =
month - 1;


muted =
true;

}

else if(
index >=
firstWeekday +
daysInMonth
){

dayNumber =
index -
(
firstWeekday +
daysInMonth
) +
1;


cellMonth =
month + 1;


muted =
true;

}

else{

dayNumber =
index -
firstWeekday +
1;

}


const cellDate =
new Date(
cellYear,
cellMonth,
dayNumber
);


const selectedStartDay =
sameCalendarDay(
cellDate,
selectedStart
);


const selectedEndDay =
sameCalendarDay(
cellDate,
selectedEnd
);


const inRange =

selectedStart &&
selectedEnd &&

cellDate >=
new Date(
selectedStart.getFullYear(),
selectedStart.getMonth(),
selectedStart.getDate()
)

&&

cellDate <=
new Date(
selectedEnd.getFullYear(),
selectedEnd.getMonth(),
selectedEnd.getDate()
);


const button =
document.createElement(
"button"
);


button.type =
"button";


button.textContent =
dayNumber;


button.className =
"h-9 rounded-lg text-xs transition";


if(muted){

button.style.color =
"#475569";

}
else{

button.style.color =
"#e2e8f0";

}


if(inRange){

button.style.background =
"rgba(34,211,238,.07)";

}


if(
selectedStartDay ||
selectedEndDay
){

button.style.background =
"rgba(34,211,238,.28)";


button.style.color =
"#cffafe";


button.style.fontWeight =
"800";


button.style.border =
"1px solid rgba(103,232,249,.34)";

}

else{

button.style.border =
"1px solid transparent";

}


button.addEventListener(

"mouseenter",

() => {

if(
!selectedStartDay &&
!selectedEndDay
){

button.style.background =
"rgba(148,163,184,.10)";

}

}

);


button.addEventListener(

"mouseleave",

() => {

if(
!selectedStartDay &&
!selectedEndDay
){

button.style.background =
inRange
? "rgba(34,211,238,.07)"
: "transparent";

}

}

);


button.addEventListener(

"click",

() => {

const startInput =
$("customRangeStart");


const endInput =
$("customRangeEnd");


if(
calendarSelectionStep ===
"start"
){

const oldStart =
dateOnlyFromInput(
"customRangeStart"
);


const hour =
oldStart
? oldStart.getHours()
: 0;


const minute =
oldStart
? oldStart.getMinutes()
: 0;


const newStart =
new Date(
cellDate
);


newStart.setHours(
hour,
minute,
0,
0
);


startInput.value =
toDateTimeLocalValue(
newStart
);


const currentEnd =
dateOnlyFromInput(
"customRangeEnd"
);


if(
!currentEnd ||
currentEnd <
newStart
){

const newEnd =
new Date(
newStart
);


newEnd.setHours(
23,
59,
0,
0
);


endInput.value =
toDateTimeLocalValue(
newEnd
);

}


calendarSelectionStep =
"end";

}

else{

const oldEnd =
dateOnlyFromInput(
"customRangeEnd"
);


const hour =
oldEnd
? oldEnd.getHours()
: 23;


const minute =
oldEnd
? oldEnd.getMinutes()
: 59;


const newEnd =
new Date(
cellDate
);


newEnd.setHours(
hour,
minute,
0,
0
);


const currentStart =
dateOnlyFromInput(
"customRangeStart"
);


if(
currentStart &&
newEnd <
currentStart
){

$("customRangeStart").value =
toDateTimeLocalValue(
newEnd
);


$("customRangeEnd").value =
toDateTimeLocalValue(
currentStart
);

}

else{

endInput.value =
toDateTimeLocalValue(
newEnd
);

}


calendarSelectionStep =
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


async function applyHistoryRange(){

const start =
dateOnlyFromInput(
"customRangeStart"
);


const end =
dateOnlyFromInput(
"customRangeEnd"
);


const errorElement =
$("customRangeError");


if(
!start ||
!end
){

errorElement.textContent =
"กรุณาเลือก Start และ End";


errorElement.classList.remove(
"hidden"
);


return;

}


if(start >= end){

errorElement.textContent =
"End ต้องอยู่หลัง Start";


errorElement.classList.remove(
"hidden"
);


return;

}


const maxRange =
30 *
24 *
60 *
60 *
1000;


if(
end.getTime() -
start.getTime() >
maxRange
){

errorElement.textContent =
"เลือกช่วงเวลาได้สูงสุด 30 วัน";


errorElement.classList.remove(
"hidden"
);


return;

}


let matchedRange =
null;


const durationMinutes =
(
end.getTime() -
start.getTime()
)
/ 60000;


for(
const [
key,
config
]
of Object.entries(
RANGE_CONFIG
)
){

if(
Math.abs(
durationMinutes -
config.minutes
)
<
1.5
){

matchedRange =
key;


break;

}

}


if(matchedRange){

averageRange =
matchedRange;


customRangeStart =
null;


customRangeEnd =
null;

}

else{

averageRange =
"custom";


customRangeStart =
start;


customRangeEnd =
end;

}


$("historyRangeButtonLabel")
.textContent =
getRangeLabel();


closeHistoryRangePicker();


await load();

}


const $ =
id =>
document.getElementById(id);


function fmt(value){

if(
value === null ||
value === undefined ||
value === "" ||
isNaN(value)
){

return "--";

}


return Number(
value
)
.toFixed(1);

}


function parseDate(value){

if(!value){
return null;
}


if(value instanceof Date){

return isNaN(
value.getTime()
)
? null
: value;

}


let text =
String(value)
.trim();


if(!text){
return null;
}


if(
/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
.test(text)
){

const date =
new Date(

text.replace(
" ",
"T"
)

+

"Z"

);


return isNaN(
date.getTime()
)
? null
: date;

}


if(
/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
.test(text)
){

const date =
new Date(
text + "Z"
);


return isNaN(
date.getTime()
)
? null
: date;

}


const date =
new Date(text);


return isNaN(
date.getTime()
)
? null
: date;

}


function formatThaiTime(value){

const date =
parseDate(value);


if(!date){
return "--";
}


return date.toLocaleTimeString(

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

);

}


function quality(value){

if(
value === null ||
value === undefined ||
isNaN(value)
){

return "รอข้อมูล";

}


return realtimeLevelLabel(

getRealtimeLevel(
"pm25",
value
)

);

}


function normalize(d){

if(!d){
return null;
}


return {

id:
d.id == null
? null
: Number(d.id),


device_id:
d.device_id == null
? ""
: String(
d.device_id
).trim(),


status:
d.status == null
? "offline"
: String(
d.status
)
.trim()
.toLowerCase(),


pm1:
d.pm1 == null
? null
: Number(d.pm1),


pm25:
d.pm25 == null
? null
: Number(d.pm25),


pm10:
d.pm10 == null
? null
: Number(d.pm10),


temperature:
d.temperature == null
? null
: Number(d.temperature),


humidity:
d.humidity == null
? null
: Number(d.humidity),


light:
d.light == null
? null
: Number(d.light),


timestamp:
d.recorded_at ||
d.timestamp ||
d.created_at ||
null

};

}


function normalizeNodeName(value){

if(value == null){
return "";
}


const text =
String(value)
.trim()
.toLowerCase();


const match =
text.match(
/(\d+)/
);


if(match){

return "node" +
match[1];

}


return text;

}


function isSameNode(
deviceId,
nodeNumber
){

return (

normalizeNodeName(
deviceId
)

===

"node" +
nodeNumber

);

}


function getNodeStatus(node){

if(!apiConnectionOnline){

return "offline";

}


const motherOnline =
motherStatus &&
String(
motherStatus.status || ""
)
.trim()
.toLowerCase()
===
"online";


if(!motherOnline){

return "offline";

}


if(!node){

return "offline";

}


const status =
String(
node.status || ""
)
.trim()
.toLowerCase();


if(
status === "online" ||
status === "sleep" ||
status === "offline"
){

return status;

}


return "offline";

}


function getLatestNode(
nodeNumber
){

return (

latestNodes.find(

node =>
isSameNode(
node.device_id,
nodeNumber
)

)

||

null

);

}


function setNode(
prefix,
data
){

const fields = [

"pm1",
"pm25",
"pm10",
"temp",
"hum",
"light"

];


if(!data){

fields.forEach(

field => {

const element =
$(prefix + field);


if(element){

element.textContent =
"--";

}

}

);


return;

}


$(prefix+"pm1").textContent =
fmt(data.pm1);


$(prefix+"pm25").textContent =
fmt(data.pm25);


$(prefix+"pm10").textContent =
fmt(data.pm10);


$(prefix+"temp").textContent =
data.temperature == null
? "--"
: fmt(data.temperature) + "°C";


$(prefix+"hum").textContent =
data.humidity == null
? "--"
: fmt(data.humidity) + "%";


$(prefix+"light").textContent =
data.light == null
? "--"
: fmt(data.light) + " lux";

}


function updateNodeStatus(
statusId,
cardId,
node
){

const statusElement =
$(statusId);


const cardElement =
$(cardId);


if(
!statusElement ||
!cardElement
){

return;

}


const nodeStatus =
getNodeStatus(node);


if(nodeStatus === "online"){

statusElement.innerHTML = `
<span class="status-online-dot">
●
</span>
ONLINE
<span class="badge rounded-full px-3 py-1 text-xs">
ESP-NOW
</span>
`;


statusElement.className =
"status-online text-xs font-bold";


cardElement.classList.remove(
"offline"
);

}

else if(nodeStatus === "sleep"){

statusElement.innerHTML = `
<span class="status-sleep-dot">
●
</span>
SLEEP
<span class="badge rounded-full px-3 py-1 text-xs">
ESP-NOW
</span>
`;


statusElement.className =
"status-sleep text-xs font-bold";


cardElement.classList.remove(
"offline"
);

}

else{

statusElement.innerHTML = `
<span class="status-offline-dot">
●
</span>
OFFLINE
<span class="badge rounded-full px-3 py-1 text-xs">
ESP-NOW
</span>
`;


statusElement.className =
"status-offline text-xs font-bold";


cardElement.classList.add(
"offline"
);

}

}


function countActiveNodes(){

return latestNodes.filter(

node => {

const status =
getNodeStatus(node);


return (

status === "online" ||
status === "sleep"

);

}

).length;

}


function updateSystemHealth(){

const gatewayDot =
$("gatewayDotTop");


const gatewayStatus =
$("gatewayStatusTop");


const nodesActive =
$("nodesActiveTop");


if(
!gatewayDot ||
!gatewayStatus ||
!nodesActive
){

return;

}


if(!apiConnectionOnline){

gatewayDot.className =
"text-red-400";


gatewayStatus.textContent =
"API ERROR";


nodesActive.textContent =
"ไม่สามารถตรวจสอบระบบได้";


return;

}


const mother =
motherStatus &&
String(
motherStatus.status || ""
)
.trim()
.toLowerCase();


if(mother === "online"){

gatewayDot.className =
"text-emerald-400";


gatewayStatus.textContent =
"ONLINE";


const active =
countActiveNodes();


nodesActive.textContent =
active +
" / " +
TOTAL_NODES +
" Nodes active";

}

else{

gatewayDot.className =
"text-red-400";


gatewayStatus.textContent =
"OFFLINE";


nodesActive.textContent =
"0 / " +
TOTAL_NODES +
" Nodes active";

}

}


async function loadLatest(){

const response =
await fetch(

API_URL +
"?t=" +
Date.now(),

{
method: "GET",
cache: "no-store",
headers: {
"Accept":
"application/json"
}
}

);


if(!response.ok){

throw new Error(

"get_latest.php HTTP " +
response.status

);

}


const text =
await response.text();


let json;


try{

json =
JSON.parse(text);

}

catch(error){

console.error(
"LATEST RAW:",
text
);


throw new Error(
"get_latest.php ไม่ได้ส่ง JSON"
);

}


if(
!json ||
!json.success
){

throw new Error(

json?.message ||
"get_latest.php ส่งข้อมูลไม่สำเร็จ"

);

}


if(Array.isArray(json.data)){

return json.data
.map(normalize)
.filter(Boolean);

}


if(json.data){

const node =
normalize(json.data);


return node
? [node]
: [];

}


return [];

}


async function loadMotherStatus(){

const response =
await fetch(

MOTHER_STATUS_API +
"?t=" +
Date.now(),

{
method: "GET",
cache: "no-store",
headers: {
"Accept":
"application/json"
}
}

);


if(!response.ok){

throw new Error(

"mother_status HTTP " +
response.status

);

}


const json =
await response.json();


if(
!json ||
!json.success
){

throw new Error(

json?.message ||
"mother_status ส่งข้อมูลไม่สำเร็จ"

);

}


if(!json.data){

return null;

}


return {

status:
String(
json.data.status || "offline"
)
.trim()
.toLowerCase(),


last_seen:
json.data.last_seen || null,


updated_at:
json.data.updated_at || null

};

}


async function loadAlertStates(){

const response =
await fetch(

ALERT_STATES_API +
"?t=" +
Date.now(),

{
method:
"GET",

cache:
"no-store",

headers: {
"Accept":
"application/json"
}
}

);


if(!response.ok){

throw new Error(

"alert_states HTTP " +
response.status

);

}


const json =
await response.json();


if(
!json ||
!json.success
){

throw new Error(

json?.message ||
"alert_states ส่งข้อมูลไม่สำเร็จ"

);

}


if(!Array.isArray(json.data)){

return [];

}


return json.data;

}


function getAlertStateForNode(
nodeNumber
){

return (

alertStates.find(

state =>

state &&

isSameNode(
state.device_id,
nodeNumber
)

)

||

null

);

}


async function loadStandards(){

const response =
await fetch(

STANDARDS_API +
"?t=" +
Date.now(),

{
method:
"GET",

cache:
"no-store",

headers: {
"Accept":
"application/json"
}
}

);


if(!response.ok){

throw new Error(

"standards.php HTTP " +
response.status

);

}


const json =
await response.json();


if(
!json ||
!json.success
){

throw new Error(

json?.message ||
"standards.php ส่งข้อมูลไม่สำเร็จ"

);

}


return json;

}


function getRealtimeThreshold(
field
){

return (

standardsData
?.realtime_thresholds
?.[field]

||

null

);

}


function getRealtimeLevel(
field,
value
){

const number =
Number(value);


if(!Number.isFinite(number)){

return "no_data";

}


const threshold =
getRealtimeThreshold(
field
);


if(!threshold){

return "normal";

}


if(
threshold.critical != null &&
number >=
Number(
threshold.critical
)
){

return "critical";

}


if(
threshold.warning != null &&
number >=
Number(
threshold.warning
)
){

return "warning";

}


if(
threshold.low_warning != null &&
number <=
Number(
threshold.low_warning
)
){

return "warning";

}


if(
threshold.high_warning != null &&
number >=
Number(
threshold.high_warning
)
){

return "warning";

}


if(
threshold.low_info != null &&
number <
Number(
threshold.low_info
)
){

return "info";

}


return "normal";

}


function realtimeLevelLabel(
level
){

const labels = {

normal:
"ปกติ",

warning:
"เฝ้าระวัง",

critical:
"สูง",

info:
"ควรตรวจสอบ",

no_data:
"รอข้อมูล"

};


return (

labels[level] ||
"รอข้อมูล"

);

}


function update24HourStandards(){

const coverageElement =
$("standard24hCoverage");


if(!standardsData){

if(coverageElement){

coverageElement.textContent =
"โหลดมาตรฐานไม่ได้";

}


set24HourStandardMetric(
"PM25",
null
);


set24HourStandardMetric(
"PM10",
null
);


if($("standard24hNote")){

$("standard24hNote").textContent =
"ยังไม่สามารถอ่านผลจาก /api/standards.php";

}


return;

}


const data =
standardsData.data ||
null;


if(!data){

if(coverageElement){

coverageElement.textContent =
"รอข้อมูล";

}


return;

}


if(coverageElement){

if(data.provisional){

coverageElement.textContent =

"ข้อมูล " +

fmt(
data.coverage_hours
)

+

" ชม. • เบื้องต้น";


coverageElement.className =
"badge rounded-full px-3 py-1 text-xs text-amber-300";

}

else{

coverageElement.textContent =

"ครอบคลุม " +

fmt(
data.coverage_hours
)

+

" ชม.";


coverageElement.className =
"badge rounded-full px-3 py-1 text-xs text-emerald-300";

}

}


set24HourStandardMetric(
"PM25",
data.pm25
);


set24HourStandardMetric(
"PM10",
data.pm10
);


if($("standard24hNote")){

$("standard24hNote").textContent =

"ข้อมูลย้อนหลัง • "

+

(

data.note ||

"ค่าเฉลี่ย 24 ชั่วโมงคำนวณจากข้อมูล ONLINE ที่บันทึกไว้ในระบบ"

);

}

}


function set24HourStandardMetric(
prefix,
metricData
){

const averageElement =
$("standard" +
prefix +
"Average");


const statusElement =
$("standard" +
prefix +
"Status");


const thailandElement =
$("standard" +
prefix +
"Thailand");


const whoElement =
$("standard" +
prefix +
"WHO");


if(
!averageElement ||
!statusElement ||
!thailandElement ||
!whoElement
){

return;

}


if(
!metricData ||
metricData.average_24h == null
){

averageElement.textContent =
"--";


statusElement.textContent =
"รอข้อมูล";


statusElement.className =
"badge rounded-full px-3 py-1 text-xs text-slate-400";


thailandElement.textContent =
"--";


whoElement.textContent =
"--";


return;

}


averageElement.textContent =

fmt(
metricData.average_24h
)

+

" µg/m³";


const thai =
metricData.thailand ||
null;


const who =
metricData.who ||
null;


thailandElement.textContent =
formatStandardComparison(
thai
);


whoElement.textContent =
formatStandardComparison(
who
);


if(
thai &&
thai.available &&
who &&
who.available
){

const thaiText =
thai.exceeded
? "เกินไทย"
: "ผ่านไทย";


const whoText =
who.exceeded
? "เกิน WHO"
: "ผ่าน WHO";


statusElement.textContent =
thaiText +
" • " +
whoText;


if(thai.exceeded){

statusElement.className =
"badge rounded-full px-3 py-1 text-xs text-red-300";

}

else if(who.exceeded){

statusElement.className =
"badge rounded-full px-3 py-1 text-xs text-amber-300";

}

else{

statusElement.className =
"badge rounded-full px-3 py-1 text-xs text-emerald-300";

}

}

else{

statusElement.textContent =
"รอข้อมูล";


statusElement.className =
"badge rounded-full px-3 py-1 text-xs text-slate-400";

}

}


function formatStandardComparison(
standard
){

if(
!standard ||
!standard.available
){

return "ไม่มีข้อมูล";

}


const symbol =
standard.exceeded
? "เกิน"
: "ไม่เกิน";


return (

symbol +

" " +

fmt(
standard.limit
)

+

" " +

(
standard.unit ||
"µg/m³"
)

);

}


function getApiRange(){

if(
averageRange ===
"custom"
){

return "30d";

}


const config =
RANGE_CONFIG[
averageRange
];


return config
? config.apiRange
: "24h";

}


async function loadHistory(){

const apiRange =
getApiRange();


const url =

HISTORY_API +

"?range=" +

encodeURIComponent(
apiRange
)

+

"&limit=5000"

+

"&t=" +

Date.now();


const response =
await fetch(

url,

{
method: "GET",
cache: "no-store",
headers: {
"Accept":
"application/json"
}
}

);


if(!response.ok){

throw new Error(

"get_history.php HTTP " +
response.status

);

}


const text =
await response.text();


let json;


try{

json =
JSON.parse(text);

}

catch(error){

console.error(
"HISTORY RAW:",
text
);


throw new Error(
"get_history.php ไม่ได้ส่ง JSON"
);

}


if(!json.success){

throw new Error(

json.message ||
"get_history.php ทำงานผิดพลาด"

);

}


if(!Array.isArray(json.data)){

throw new Error(
"get_history.php data ไม่ใช่ Array"
);

}


console.log(

"History rows:",
json.data.length,

"API count:",
json.count,

"API range:",
apiRange,

"Selected range:",
averageRange

);


return json.data
.map(normalize)
.filter(Boolean);

}


function forceAllNodesOffline(){

const configs = [

{
status: "n1status",
card: "nodeCard1"
},

{
status: "n2status",
card: "nodeCard2"
},

{
status: "n3status",
card: "nodeCard3"
}

];


configs.forEach(

config => {

const statusElement =
$(config.status);


const cardElement =
$(config.card);


if(statusElement){

statusElement.innerHTML = `
<span class="status-offline-dot">
●
</span>
OFFLINE
<span class="badge rounded-full px-3 py-1 text-xs">
ESP-NOW
</span>
`;


statusElement.className =
"status-offline text-xs font-bold";

}


if(cardElement){

cardElement.classList.add(
"offline"
);

}

}

);


const gatewayDot =
$("gatewayDotTop");


const gatewayStatus =
$("gatewayStatusTop");


const nodesActive =
$("nodesActiveTop");


if(gatewayDot){

gatewayDot.className =
"text-red-400";

}


if(gatewayStatus){

gatewayStatus.textContent =
"API ERROR";

}


if(nodesActive){

nodesActive.textContent =
"ไม่สามารถตรวจสอบระบบได้";

}

}


function getSelectedTimeWindow(){

if(
averageRange ===
"custom"
){

if(
!customRangeStart ||
!customRangeEnd
){

return null;

}


return {

start:
new Date(
customRangeStart
),


end:
new Date(
customRangeEnd
)

};

}


const config =
RANGE_CONFIG[
averageRange
];


if(!config){

return null;

}


const end =
new Date();


const start =
new Date(

end.getTime()

-

config.minutes *
60 *
1000

);


return {
start,
end
};

}


function getRecordsInSelectedRange(){

const window =
getSelectedTimeWindow();


if(!window){

return [];

}


return records.filter(

record => {

const date =
parseDate(
record.timestamp
);


if(!date){

return false;

}


return (

date >=
window.start

&&

date <=
window.end

);

}

);

}


function calculateAverage(
data,
field
){

const values =
data
.map(
record =>
record[field]
)
.filter(

value =>
value !== null &&
value !== undefined &&
!isNaN(value)

);


if(!values.length){

return null;

}


const total =
values.reduce(

(sum,value) =>
sum +
Number(value),

0

);


return total /
values.length;

}


function calculateStatistics(
data,
field
){

const values =
data
.map(
record =>
record[field]
)
.filter(

value =>
value !== null &&
value !== undefined &&
!isNaN(value)

)
.map(Number);


if(!values.length){

return {

average: null,
max: null,
min: null,
last: null

};

}


return {

average:
values.reduce(
(a,b) =>
a + b,
0
)
/ values.length,


max:
Math.max(
...values
),


min:
Math.min(
...values
),


last:
values[
values.length - 1
]

};

}


function averageStatus(
value,
field
){

if(
value === null ||
value === undefined ||
isNaN(value)
){

return "● ไม่มีข้อมูล";

}


if(field === "pm25"){

return (

"● เฉลี่ย " +

getRangeLabel()

+

" • " +

quality(value)

);

}


return (

"● เฉลี่ย " +

getRangeLabel()

);

}


function renderAverages(){

const data =
getRecordsInSelectedRange();


$("selectedRangeLabel").textContent =
getRangeLabel();


const configs = [

{
field: "pm1",
value: "averagePM1",
status: "averagePM1Status"
},

{
field: "pm25",
value: "averagePM25",
status: "averagePM25Status"
},

{
field: "pm10",
value: "averagePM10",
status: "averagePM10Status"
},

{
field: "temperature",
value: "averageTemp",
status: "averageTempStatus"
},

{
field: "humidity",
value: "averageHum",
status: "averageHumStatus"
},

{
field: "light",
value: "averageLight",
status: "averageLightStatus"
}

];


configs.forEach(

config => {

const average =
calculateAverage(
data,
config.field
);


$(config.value).textContent =
average === null
? "--"
: fmt(average);


$(config.status).textContent =
averageStatus(
average,
config.field
);

}

);

}


function metricLabel(){

const map = {

pm1: "PM1.0",
pm25: "PM2.5",
pm10: "PM10",
temperature: "อุณหภูมิ",
humidity: "ความชื้น",
light: "แสง"

};


return (

map[metric] ||
metric

);

}


function updateSelectedMetricLabel(){

const element =
$("selectedMetricLabel");


if(element){

element.textContent =
metricLabel();

}

}


function updateTrendStatistics(){

const data =
getRecordsInSelectedRange();


const stats =
calculateStatistics(
data,
metric
);


$("trendAvg").textContent =
stats.average === null
? "--"
: fmt(stats.average);


$("trendMax").textContent =
stats.max === null
? "--"
: fmt(stats.max);


$("trendMin").textContent =
stats.min === null
? "--"
: fmt(stats.min);


let latestMetricRecord =
null;


const allRecords =
Array.isArray(records)
? records.slice()
: [];


if(latestRecord){

const alreadyExists =
allRecords.some(

record =>
record &&
latestRecord &&
record.id != null &&
latestRecord.id != null &&
record.id ===
latestRecord.id

);


if(!alreadyExists){

allRecords.push(
latestRecord
);

}

}


for(
const record of
allRecords
){

if(
!record ||
!record.timestamp
){

continue;

}


const value =
record[metric];


if(
value === null ||
value === undefined ||
value === "" ||
isNaN(
Number(value)
)
){

continue;

}


const date =
parseDate(
record.timestamp
);


if(!date){

continue;

}


if(
latestMetricRecord === null
||
date.getTime()
>
parseDate(
latestMetricRecord.timestamp
).getTime()
){

latestMetricRecord =
record;

}

}


$("trendLast").textContent =
latestMetricRecord
? fmt(
Number(
latestMetricRecord[
metric
]
)
)
: "--";


updateSelectedMetricLabel();

}


function getDeviceDisplayName(
deviceId
){

if(!deviceId){

return "--";

}


const match =
String(
deviceId
)
.match(
/(\d+)/
);


if(match){

return "อุปกรณ์ " +
match[1];

}


return String(
deviceId
);

}


function updateCurrentAirQuality(){

const motherOnline =

apiConnectionOnline &&

motherStatus &&

String(
motherStatus.status || ""
)
.trim()
.toLowerCase()

===

"online";


if(!motherOnline){

$("currentPM25").textContent =
"--";


$("highestPM25").textContent =
"--";


$("highestPM25Node").textContent =
"--";


$("watchNode").textContent =
"--";


$("watchNodeDetail").textContent =
"Gateway Offline • ไม่สามารถประเมินคุณภาพอากาศปัจจุบันได้";


$("qualityBadge").textContent =
"ไม่พร้อมใช้งาน";


return {

average:
null,

highest:
null,

quality:
"ไม่พร้อมใช้งาน",

count:
0

};

}


const usableNodes =
latestNodes
.filter(

node => {

if(!node){

return false;

}


const status =
getNodeStatus(
node
);


if(
status !== "online" &&
status !== "sleep"
){

return false;

}


return (

node.pm25 !== null &&
node.pm25 !== undefined &&
!isNaN(
Number(
node.pm25
)
)

);

}

);


if(!usableNodes.length){

$("currentPM25").textContent =
"--";


$("highestPM25").textContent =
"--";


$("highestPM25Node").textContent =
"--";


$("watchNode").textContent =
"--";


$("watchNodeDetail").textContent =
"ไม่มีจุดตรวจวัดที่มีข้อมูลใช้งาน";


$("qualityBadge").textContent =
"รอข้อมูล";


return {

average:
null,

highest:
null,

quality:
"รอข้อมูล",

count:
0

};

}


const values =
usableNodes.map(

node =>
Number(
node.pm25
)

);


const average =
values.reduce(

(sum,value) =>
sum +
value,

0

)
/ values.length;


let highestNode =
usableNodes[0];


for(
const node of
usableNodes
){

if(
Number(node.pm25)
>
Number(
highestNode.pm25
)
){

highestNode =
node;

}

}


const highestValue =
Number(
highestNode.pm25
);


const q =
quality(
average
);


$("currentPM25").textContent =
fmt(average)
+
" µg/m³";


$("highestPM25").textContent =
fmt(highestValue)
+
" µg/m³";


$("highestPM25Node").textContent =
getDeviceDisplayName(
highestNode.device_id
);


const highestLevel =
getRealtimeLevel(
"pm25",
highestValue
);


if(
highestLevel === "warning" ||
highestLevel === "critical"
){

$("watchNode").textContent =
getDeviceDisplayName(
highestNode.device_id
);


$("watchNodeDetail").textContent =

"PM2.5 "

+

fmt(
highestValue
)

+

" µg/m³ • "

+

realtimeLevelLabel(
highestLevel
);

}

else{

$("watchNode").textContent =
"ไม่มี";


$("watchNodeDetail").textContent =
"ทุกจุดที่ใช้งานยังไม่เข้าเกณฑ์เฝ้าระวัง Real-time";

}


$("qualityBadge").textContent =
q;


return {

average:
average,

highest:
highestNode,

quality:
q,

count:
usableNodes.length

};

}


function drawCharts(){

const arr =
getRecordsInSelectedRange()

.filter(

x =>
x &&
x[metric] != null &&
!isNaN(
Number(
x[metric]
)
)

)

.sort(

(a,b) =>

parseDate(
a.timestamp
).getTime()

-

parseDate(
b.timestamp
).getTime()

);


updateTrendStatistics();


if(!arr.length){

$("trend").textContent =
"ไม่มีข้อมูลในช่วงเวลาที่เลือก";


if(historyChart){

historyChart.destroy();


historyChart =
null;

}


if(forecastChart){

forecastChart.destroy();


forecastChart =
null;

}


$("forecastMessage").textContent =
"ไม่มีข้อมูลเพียงพอสำหรับการคาดการณ์";


$("forecastBadge").textContent =
"WAITING";


return;

}


const labels =
arr.map(

x => {

const d =
parseDate(
x.timestamp
);


return d
? d.toLocaleString(

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
: "";

}

);


const values =
arr.map(

x =>
Number(
x[metric]
)

);


const first =
values[0];


const last =
values[
values.length - 1
];


if(values.length < 2){

$("trend").textContent =
"ข้อมูลยังน้อย";

}

else{

const difference =
last -
first;


const percentage =
first === 0
? 0
: (
difference /
Math.abs(first)
) * 100;


if(
Math.abs(
percentage
)
<
1
){

$("trend").textContent =
"→ คงที่";

}

else if(
difference > 0
){

$("trend").textContent =
"↑ เพิ่มขึ้น";

}

else{

$("trend").textContent =
"↓ ลดลง";

}

}


if(historyChart){

historyChart.destroy();

}


historyChart =
new Chart(

$("historyChart"),

{

type:
"line",

data: {

labels:
labels,

datasets: [

{

label:
metricLabel(),

data:
values,

borderColor:
"#22d3ee",

backgroundColor:
"rgba(34,211,238,.08)",

fill:
true,

tension:
.35,

pointRadius:
values.length > 50
? 0
: 3,

borderWidth:
2

}

]

},

options: {

responsive:
true,

maintainAspectRatio:
true,

interaction: {

intersect:
false,

mode:
"index"

},

plugins: {

legend: {

display:
false

},

tooltip: {

callbacks: {

label:
context =>

metricLabel()

+

": "

+

Number(
context.raw
).toFixed(1)

}

}

},

scales: {

y: {

beginAtZero:
false,

grid: {

color:
"rgba(148,163,184,.08)"

}

},

x: {

grid: {

display:
false

},

ticks: {

maxTicksLimit:
12

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


function updateForecastToggleUI(){

const button =
$("forecastToggle");


const label =
$("forecastToggleLabel");


const state =
$("forecastToggleState");


if(
!button ||
!label
){

return;

}


button.setAttribute(

"aria-pressed",

forecastVisible
? "true"
: "false"

);


button.setAttribute(

"aria-checked",

forecastVisible
? "true"
: "false"

);


button.classList.toggle(
"is-on",
forecastVisible
);


button.classList.toggle(
"is-off",
!forecastVisible
);


if(forecastVisible){

label.textContent =
"เปิดการคาดการณ์";


if(state){

state.textContent =
"ON";

}


button.title =
"กดเพื่อซ่อน Forecast";

}

else{

label.textContent =
"ซ่อนการคาดการณ์";


if(state){

state.textContent =
"OFF";

}


button.title =
"กดเพื่อแสดง Forecast";

}

}


function setForecastDatasetVisibility(){

if(
!forecastChart ||
!forecastChart.data ||
!forecastChart.data.datasets ||
forecastChart.data.datasets.length < 2
){

return;

}


for(
let index = 1;
index <
forecastChart.data.datasets.length;
index++
){

forecastChart.setDatasetVisibility(
index,
forecastVisible
);

}


forecastChart.update();


updateForecastToggleUI();

}


function linearRegression(points){

const n =
points.length;


if(n < 2){

return null;

}


let sumX = 0;

let sumY = 0;

let sumXY = 0;

let sumXX = 0;


for(
const point of
points
){

sumX +=
point.x;


sumY +=
point.y;


sumXY +=
point.x *
point.y;


sumXX +=
point.x *
point.x;

}


const denominator =

n *
sumXX

-

sumX *
sumX;


if(denominator === 0){

return null;

}


const slope =

(
n *
sumXY

-

sumX *
sumY
)

/

denominator;


const intercept =

(
sumY

-

slope *
sumX
)

/

n;


const meanY =
sumY /
n;


let ssTotal = 0;

let ssResidual = 0;


for(
const point of
points
){

const fitted =

intercept

+

slope *
point.x;


ssTotal +=

Math.pow(
point.y -
meanY,
2
);


ssResidual +=

Math.pow(
point.y -
fitted,
2
);

}


const r2 =

ssTotal === 0

? 1

: Math.max(

0,

Math.min(

1,

1 -
ssResidual /
ssTotal

)

);


const rmse =
Math.sqrt(

ssResidual

/

Math.max(
1,
n - 2
)

);


return {

slope,
intercept,
r2,
rmse

};

}


function metricUnit(){

const units = {

pm1:
"µg/m³",

pm25:
"µg/m³",

pm10:
"µg/m³",

temperature:
"°C",

humidity:
"%",

light:
"lux"

};


return (

units[metric] ||
""

);

}


function clampForecastValue(
field,
value
){

if(!Number.isFinite(value)){

return null;

}


if(field === "humidity"){

return Math.max(

0,

Math.min(
100,
value
)

);

}


if(
field === "pm1" ||
field === "pm25" ||
field === "pm10" ||
field === "light"
){

return Math.max(
0,
value
);

}


return value;

}


function getForecastMinimumUncertainty(
field
){

const values = {

pm1:
1.0,

pm25:
1.0,

pm10:
2.0,

temperature:
0.5,

humidity:
2.0,

light:
15.0

};


return (

values[field] ||
1

);

}


function getForecastStabilityThreshold(
field
){

const values = {

pm1:
1.0,

pm25:
1.0,

pm10:
2.0,

temperature:
0.5,

humidity:
2.0,

light:
20.0

};


return (

values[field] ||
1

);

}


function getForecastConfidence(
r2,
sampleCount,
coveredMinutes
){

if(
sampleCount >= 20 &&
coveredMinutes >= 30 &&
r2 >= 0.60
){

return "ค่อนข้างสูง";

}


if(
sampleCount >= 12 &&
coveredMinutes >= 20 &&
r2 >= 0.25
){

return "ปานกลาง";

}


return "ต่ำ";

}


function getForecastAssessment(
field,
value
){

if(
value === null ||
value === undefined ||
isNaN(value)
){

return "ไม่มีข้อมูล";

}


const level =
getRealtimeLevel(
field,
Number(value)
);


const labels = {

normal:
"ปกติ",

warning:
"ควรเฝ้าระวัง",

critical:
"สูง",

info:
"ควรตรวจสอบ",

no_data:
"ไม่มีข้อมูล"

};


return (

labels[level] ||
level

);

}


function drawForecast(arr){

if(forecastChart){

forecastChart.destroy();


forecastChart =
null;

}


const valid =
arr

.filter(

row =>

row &&
row.timestamp &&
row[metric] !== null &&
row[metric] !== undefined &&
!isNaN(
Number(
row[metric]
)
)

)

.sort(

(a,b) =>

parseDate(
a.timestamp
).getTime()

-

parseDate(
b.timestamp
).getTime()

);


if(valid.length < 10){

$("forecastMessage").textContent =
"ข้อมูลยังไม่เพียงพอสำหรับคาดการณ์ ต้องมีอย่างน้อย 10 จุดข้อมูลของตัวแปรที่เลือก";


$("forecastBadge").textContent =
metricLabel()
+
" • รอข้อมูล";


return;

}


const latestDate =
parseDate(

valid[
valid.length - 1
].timestamp

);


if(!latestDate){

$("forecastMessage").textContent =
"ไม่สามารถอ่านเวลาของข้อมูลล่าสุดได้";


$("forecastBadge").textContent =
metricLabel()
+
" • รอข้อมูล";


return;

}


const windowStart =
new Date(

latestDate.getTime()

-

60 *
60 *
1000

);


const recent =
valid

.filter(

row => {

const date =
parseDate(
row.timestamp
);


return (

date &&
date >= windowStart &&
date <= latestDate

);

}

)

.slice(-90);


if(recent.length < 10){

$("forecastMessage").textContent =
"ข้อมูลใน 60 นาทีล่าสุดยังไม่พอสำหรับคาดการณ์ ต้องมีอย่างน้อย 10 จุดข้อมูล";


$("forecastBadge").textContent =
metricLabel()
+
" • รอข้อมูล";


return;

}


const firstDate =
parseDate(
recent[0].timestamp
);


const lastDate =
parseDate(

recent[
recent.length - 1
].timestamp

);


if(
!firstDate ||
!lastDate
){

$("forecastMessage").textContent =
"ไม่สามารถอ่านช่วงเวลาของข้อมูลเพื่อสร้าง Forecast ได้";


$("forecastBadge").textContent =
metricLabel()
+
" • รอข้อมูล";


return;

}


const coveredMinutes =

Math.max(

0,

(
lastDate.getTime()
-
firstDate.getTime()
)

/ 60000

);


const points =
recent.map(

row => ({

x:

(
parseDate(
row.timestamp
).getTime()

-

firstDate.getTime()
)

/ 60000,


y:
Number(
row[metric]
)

})

);


const model =
linearRegression(
points
);


if(!model){

$("forecastMessage").textContent =
"รูปแบบข้อมูลช่วงนี้ไม่เหมาะกับการคาดการณ์เชิงเส้น";


$("forecastBadge").textContent =
metricLabel()
+
" • รอข้อมูล";


return;

}


const currentX =

(
lastDate.getTime()
-
firstDate.getTime()
)

/ 60000;


const currentValue =
Number(

recent[
recent.length - 1
][metric]

);


const forecastSteps = [
10,
20,
30
];


const baseUncertainty =
Math.max(

getForecastMinimumUncertainty(
metric
),

Number.isFinite(
model.rmse
)
? model.rmse * 1.5
: 0

);


const recentValues =
recent.map(

row =>
Number(
row[metric]
)

);


const mean =
recentValues.reduce(

(sum,value) =>
sum + value,

0

)

/ recentValues.length;


const variance =
recentValues.reduce(

(sum,value) =>

sum

+

Math.pow(
value -
mean,
2
),

0

)

/ recentValues.length;


const stdDev =
Math.sqrt(
variance
);


const maxThirtyMinuteChange =
Math.max(

getForecastStabilityThreshold(
metric
)
*
3,

stdDev *
3

);


const predictions =
forecastSteps.map(

minutes => {

const futureX =
currentX +
minutes;


const raw =

model.intercept

+

model.slope *
futureX;


const maximumChangeAtStep =

maxThirtyMinuteChange

*

(
minutes /
30
);


const bounded =
Math.max(

currentValue -
maximumChangeAtStep,

Math.min(

currentValue +
maximumChangeAtStep,

raw

)

);


const center =
clampForecastValue(
metric,
bounded
);


const uncertainty =

baseUncertainty

*

(
0.85

+

0.5 *
(
minutes /
30
)

);


const lower =
clampForecastValue(

metric,

center -
uncertainty

);


const upper =
clampForecastValue(

metric,

center +
uncertainty

);


return {
minutes,
center,
lower,
upper
};

}

);


const finalForecast =
predictions[
predictions.length - 1
];


const change =
finalForecast.center -
currentValue;


const stabilityThreshold =
getForecastStabilityThreshold(
metric
);


let direction =
"→ ค่อนข้างคงที่";


if(
Math.abs(change)
>=
stabilityThreshold
){

direction =
change > 0
? "↗ มีแนวโน้มเพิ่มขึ้น"
: "↘ มีแนวโน้มลดลง";

}


const confidence =
getForecastConfidence(
model.r2,
recent.length,
coveredMinutes
);


const unit =
metricUnit();


const assessment =
getForecastAssessment(
metric,
finalForecast.center
);


$("forecastMessage").innerHTML = `

<div class="flex flex-col gap-1 mb-3">

<div class="text-[11px] text-slate-500">
ตัวแปรที่กำลังคาดการณ์
</div>

<b class="text-cyan-300">
${metricLabel()}
${unit ? " (" + unit + ")" : ""}
</b>

</div>


<div class="grid grid-cols-3 gap-3">

<div>

<span class="text-xs text-slate-500">
ค่าปัจจุบัน
</span>

<b class="block text-xl text-white mt-1">
${fmt(currentValue)}
</b>

</div>


<div>

<span class="text-xs text-slate-500">
ช่วงคาดการณ์ +30 นาที
</span>

<b class="block text-xl text-cyan-300 mt-1">
${fmt(finalForecast.lower)}
–
${fmt(finalForecast.upper)}
</b>

</div>


<div>

<span class="text-xs text-slate-500">
ค่ากลางประมาณ
</span>

<b class="block text-xl text-emerald-300 mt-1">
${fmt(finalForecast.center)}
</b>

</div>

</div>


<div class="mt-4 grid sm:grid-cols-3 gap-2">

<div
class="rounded-lg px-3 py-2"
style="background:rgba(15,23,42,.42);"
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
style="background:rgba(15,23,42,.42);"
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
style="background:rgba(15,23,42,.42);"
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

• ครอบคลุมประมาณ
${Math.round(coveredMinutes)}
นาที

</div>


<div class="text-[10px] text-slate-500 mt-2 leading-5">

Forecast นี้ใช้ Linear Regression + ค่าความคลาดเคลื่อนของข้อมูลล่าสุด
เพื่อประมาณช่วงในอีก 30 นาที

• ไม่ใช่ AI/ML

• ไม่ใช่ค่าที่เซนเซอร์วัดจริงในอนาคต

</div>

`;


$("forecastBadge").textContent =

metricLabel()

+

" • +30 นาที";


const actualToShow =
recent.slice(-12);


const actualLabels =
actualToShow.map(

row =>
formatThaiTime(
row.timestamp
)

);


const actualValues =
actualToShow.map(

row =>
Number(
row[metric]
)

);


const futureLabels =
forecastSteps.map(

minutes =>

"+" +
minutes +
" นาที"

);


const labels = [

...actualLabels,

...futureLabels

];


const actualDataset = [

...actualValues,

...new Array(
forecastSteps.length
).fill(null)

];


const leadingNulls =
new Array(

Math.max(
0,
actualValues.length - 1
)

)
.fill(null);


const lowerDataset = [

...leadingNulls,

actualValues[
actualValues.length - 1
],

...predictions.map(
item =>
item.lower
)

];


const upperDataset = [

...leadingNulls,

actualValues[
actualValues.length - 1
],

...predictions.map(
item =>
item.upper
)

];


const forecastDataset = [

...leadingNulls,

actualValues[
actualValues.length - 1
],

...predictions.map(
item =>
item.center
)

];


forecastChart =
new Chart(

$("forecastChart"),

{

type:
"line",

data: {

labels:
labels,

datasets: [

{

label:
"ข้อมูลจริง",

data:
actualDataset,

borderColor:
"#22d3ee",

backgroundColor:
"rgba(34,211,238,.05)",

borderWidth:
2,

tension:
.3,

pointRadius:
actualValues.length > 30
? 0
: 2

},

{

label:
"ขอบล่าง Forecast",

data:
lowerDataset,

borderColor:
"rgba(52,211,153,0)",

backgroundColor:
"rgba(52,211,153,0)",

borderWidth:
0,

pointRadius:
0,

tension:
.2

},

{

label:
"ช่วงคาดการณ์",

data:
upperDataset,

borderColor:
"rgba(52,211,153,.22)",

backgroundColor:
"rgba(52,211,153,.10)",

borderWidth:
1,

pointRadius:
0,

tension:
.2,

fill:
"-1"

},

{

label:
"Forecast",

data:
forecastDataset,

borderColor:
"#34d399",

backgroundColor:
"rgba(52,211,153,.06)",

borderDash: [
6,
5
],

borderWidth:
2,

tension:
.2,

pointRadius:
3

}

]

},

options: {

responsive:
true,

maintainAspectRatio:
true,

interaction: {

intersect:
false,

mode:
"index"

},

plugins: {

legend: {

display:
false

},

tooltip: {

callbacks: {

label:
context => {

if(
context.dataset.label ===
"ขอบล่าง Forecast"
){

return null;

}


const value =
context.raw;


if(
value === null ||
value === undefined
){

return null;

}


return (

context.dataset.label

+

": "

+

fmt(
Number(value)
)

+

(
unit
? " " + unit
: ""
)

);

}

}

}

},

scales: {

y: {

grid: {

color:
"rgba(148,163,184,.08)"

}

},

x: {

grid: {

display:
false

}

}

}

}

}

);


setForecastDatasetVisibility();

}


let exportRows =
[];


function dateToInputValue(date){

if(!date){

return "";

}


const pad =
value =>
String(value)
.padStart(
2,
"0"
);


return (

date.getFullYear()

+

"-"

+

pad(
date.getMonth() + 1
)

+

"-"

+

pad(
date.getDate()
)

);

}


function getExportDateWindow(){

const startValue =
$("exportStartDate").value;


const endValue =
$("exportEndDate").value;


if(
!startValue ||
!endValue
){

return null;

}


const [
startYear,
startMonth,
startDay
] =

startValue
.split("-")
.map(Number);


const [
endYear,
endMonth,
endDay
] =

endValue
.split("-")
.map(Number);


const start =
new Date(
startYear,
startMonth - 1,
startDay,
0,
0,
0,
0
);


const end =
new Date(
endYear,
endMonth - 1,
endDay,
23,
59,
59,
999
);


if(
isNaN(start.getTime()) ||
isNaN(end.getTime())
){

return null;

}


return {
start,
end
};

}


function getExportApiRange(
start,
end
){

const durationHours =

(
end.getTime()
-
start.getTime()
)

/

(
60 *
60 *
1000
);


if(durationHours <= 24){

return "24h";

}


if(durationHours <= 168){

return "7d";

}


return "30d";

}


function showExportError(message){

const element =
$("exportError");


if(!message){

element.textContent =
"";


element.classList.add(
"hidden"
);


return;

}


element.textContent =
message;


element.classList.remove(
"hidden"
);

}


function setExportLoading(
loading
){

$("exportLoading")
.classList.toggle(
"hidden",
!loading
);


$("exportExcelButton").disabled =
loading ||
exportRows.length === 0;

}


function openExportModal(){

const selected =
getSelectedTimeWindow();


const now =
new Date();


const defaultEnd =
selected
? selected.end
: now;


const defaultStart =
selected
? selected.start
: new Date(

now.getTime()

-

24 *
60 *
60 *
1000

);


$("exportStartDate").value =
dateToInputValue(
defaultStart
);


$("exportEndDate").value =
dateToInputValue(
defaultEnd
);


exportRows =
[];


$("exportDataCount").textContent =
"0";


$("exportExcelButton").disabled =
true;


showExportError(
""
);


const modal =
$("exportModal");


modal.classList.add(
"active"
);


modal.setAttribute(
"aria-hidden",
"false"
);


document.body.classList.add(
"export-modal-open"
);


refreshExportPreview();

}


function closeExportModal(){

const modal =
$("exportModal");


modal.classList.remove(
"active"
);


modal.setAttribute(
"aria-hidden",
"true"
);


document.body.classList.remove(
"export-modal-open"
);

}


function getBangkokExportBoundaries(){

const startValue =
$("exportStartDate").value;


const endValue =
$("exportEndDate").value;


if(
!startValue ||
!endValue
){

return null;

}


const start =
new Date(

startValue +
"T00:00:00+07:00"

);


const endStart =
new Date(

endValue +
"T00:00:00+07:00"

);


if(
isNaN(start.getTime()) ||
isNaN(endStart.getTime())
){

return null;

}


const end =
new Date(

endStart.getTime()

+

24 *
60 *
60 *
1000

);


return {
start,
end
};

}


async function loadExportRows(){

const dateWindow =
getExportDateWindow();


const boundaries =
getBangkokExportBoundaries();


if(
!dateWindow ||
!boundaries
){

throw new Error(
"กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด"
);

}


if(
dateWindow.start >
dateWindow.end
){

throw new Error(
"วันที่สิ้นสุดต้องอยู่หลังวันที่เริ่มต้น"
);

}


const maxRangeMs =
30 *
24 *
60 *
60 *
1000;


if(
boundaries.end.getTime()
-
boundaries.start.getTime()
>
maxRangeMs
){

throw new Error(
"สามารถส่งออกข้อมูลได้สูงสุดครั้งละ 30 วัน"
);

}


const PAGE_SIZE =
1000;


let offset =
0;


let total =
null;


const allRows =
[];


while(true){

const url =

EXPORT_API

+

"?start="

+

encodeURIComponent(
boundaries.start.toISOString()
)

+

"&end="

+

encodeURIComponent(
boundaries.end.toISOString()
)

+

"&limit="

+

PAGE_SIZE

+

"&offset="

+

offset

+

"&t="

+

Date.now();


const response =
await fetch(

url,

{
method:
"GET",

cache:
"no-store",

headers: {
"Accept":
"application/json"
}
}

);


if(!response.ok){

let message =

"โหลดข้อมูลสำหรับ Export ไม่สำเร็จ HTTP "

+

response.status;


try{

const errorJson =
await response.json();


if(
errorJson &&
errorJson.message
){

message =
errorJson.message;

}

}

catch(error){
}


throw new Error(
message
);

}


const json =
await response.json();


if(
!json ||
!json.success ||
!Array.isArray(
json.data
)
){

throw new Error(

json?.message ||

"รูปแบบข้อมูล Export ไม่ถูกต้อง"

);

}


if(
total === null &&
json.total !== null &&
json.total !== undefined
){

total =
Number(
json.total
);

}


const pageRows =
json.data
.map(normalize)
.filter(Boolean);


allRows.push(
...pageRows
);


$("exportDataCount")
.textContent =

total !== null

? (

allRows.length
.toLocaleString(
"th-TH"
)

+

" / "

+

total
.toLocaleString(
"th-TH"
)

)

:

allRows.length
.toLocaleString(
"th-TH"
);


if(
json.has_more !== true
){

break;

}


offset +=
pageRows.length;


if(
pageRows.length === 0
){

break;

}

}


return allRows
.sort(

(a,b) =>

parseDate(
a.timestamp
).getTime()

-

parseDate(
b.timestamp
).getTime()

);

}


function renderExportPreview(){

const body =
$("exportPreviewBody");


$("exportDataCount").textContent =
exportRows.length
.toLocaleString(
"th-TH"
);


if(!exportRows.length){

body.innerHTML = `

<tr>

<td
colspan="8"
class="export-empty-cell"
>
ไม่พบข้อมูลในช่วงวันที่ที่เลือก
</td>

</tr>

`;


$("exportExcelButton").disabled =
true;


return;

}


const preview =
exportRows.slice(
0,
50
);


body.innerHTML =

preview

.map(

row => `

<tr>

<td>
${escapeHtml(
formatExportDate(
row.timestamp
)
)}
</td>

<td>
${escapeHtml(
row.device_id ||
""
)}
</td>

<td>
${escapeHtml(
exportNumber(
row.pm1
)
)}
</td>

<td>
${escapeHtml(
exportNumber(
row.pm25
)
)}
</td>

<td>
${escapeHtml(
exportNumber(
row.pm10
)
)}
</td>

<td>
${escapeHtml(
exportNumber(
row.temperature
)
)}
</td>

<td>
${escapeHtml(
exportNumber(
row.humidity
)
)}
</td>

<td>
${escapeHtml(
exportNumber(
row.light
)
)}
</td>

</tr>

`

)

.join(
""
);


$("exportExcelButton").disabled =
false;

}


async function refreshExportPreview(){

showExportError(
""
);


exportRows =
[];


setExportLoading(
true
);


try{

exportRows =
await loadExportRows();


renderExportPreview();

}

catch(error){

console.error(
"Export preview error:",
error
);


$("exportDataCount").textContent =
"0";


$("exportPreviewBody").innerHTML = `

<tr>

<td
colspan="8"
class="export-empty-cell"
>
ไม่สามารถแสดงตัวอย่างข้อมูลได้
</td>

</tr>

`;


showExportError(
error.message
);

}

finally{

setExportLoading(
false
);

}

}


function exportNumber(value){

if(
value === null ||
value === undefined ||
value === "" ||
isNaN(value)
){

return "";

}


return Number(
value
)
.toFixed(
1
);

}


function formatExportDate(value){

const date =
parseDate(value);


if(!date){

return "";

}


return date.toLocaleString(

"th-TH",

{
timeZone:
"Asia/Bangkok",

year:
"numeric",

month:
"2-digit",

day:
"2-digit",

hour:
"2-digit",

minute:
"2-digit",

second:
"2-digit",

hour12:
false
}

);

}


function makeExportFileName(){

const start =
$("exportStartDate").value ||
"start";


const end =
$("exportEndDate").value ||
"end";


return (

"PM25_"

+

start

+

"_to_"

+

end

);

}


function downloadExportExcel(){

if(!exportRows.length){

showExportError(
"ไม่มีข้อมูลสำหรับดาวน์โหลด"
);


return;

}


if(
typeof XLSX ===
"undefined"
){

showExportError(
"ไม่สามารถโหลดระบบสร้าง Excel ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่"
);


return;

}


const excelRows =
exportRows.map(

row => ({

"วันที่ / เวลา":

formatExportDate(
row.timestamp
),


"อุปกรณ์":

row.device_id ||
"",


"PM1.0 (µg/m³)":

row.pm1 == null
? ""
: Number(
row.pm1
),


"PM2.5 (µg/m³)":

row.pm25 == null
? ""
: Number(
row.pm25
),


"PM10 (µg/m³)":

row.pm10 == null
? ""
: Number(
row.pm10
),


"อุณหภูมิ (°C)":

row.temperature == null
? ""
: Number(
row.temperature
),


"ความชื้น (%)":

row.humidity == null
? ""
: Number(
row.humidity
),


"แสง (lux)":

row.light == null
? ""
: Number(
row.light
)

})

);


const worksheet =
XLSX.utils.json_to_sheet(
excelRows
);


worksheet["!cols"] = [

{ wch: 22 },

{ wch: 16 },

{ wch: 15 },

{ wch: 15 },

{ wch: 15 },

{ wch: 16 },

{ wch: 16 },

{ wch: 14 }

];


const workbook =
XLSX.utils.book_new();


XLSX.utils.book_append_sheet(
workbook,
worksheet,
"PM2.5 Data"
);


XLSX.writeFile(

workbook,

makeExportFileName()

+

".xlsx"

);

}


function escapeHtml(value){

return String(

value === null ||
value === undefined
? ""
: value

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


function getLatestTimestampRecord(list){

let latest =
null;


for(
const item of
list || []
){

if(
!item ||
!item.timestamp
){

continue;

}


const date =
parseDate(
item.timestamp
);


if(!date){

continue;

}


if(
!latest ||
date.getTime()
>
parseDate(
latest.timestamp
).getTime()
){

latest =
item;

}

}


return latest;

}


function updateLastUpdate(
id,
node
){

const element =
$(id);


if(!element){

return;

}


element.textContent =

node &&
node.timestamp

? formatThaiTime(
node.timestamp
)

: "--";

}


function renderMonitoringNodes(){

const n1 =
getLatestNode(
1
);


const n2 =
getLatestNode(
2
);


const n3 =
getLatestNode(
3
);


setNode(
"n1",
n1
);


setNode(
"n2",
n2
);


setNode(
"n3",
n3
);


updateLastUpdate(
"lastUpdate1",
n1
);


updateLastUpdate(
"lastUpdate2",
n2
);


updateLastUpdate(
"lastUpdate3",
n3
);


updateNodeStatus(
"n1status",
"nodeCard1",
n1
);


updateNodeStatus(
"n2status",
"nodeCard2",
n2
);


updateNodeStatus(
"n3status",
"nodeCard3",
n3
);


updateSystemHealth();

}


function updateSmartSummary(){

const element =
$("aiSummary");


if(!element){

return;

}


if(!apiConnectionOnline){

element.innerHTML = `

<b class="text-red-300">
🔴 ไม่สามารถเชื่อมต่อ API
</b>

<div class="text-xs text-slate-500 mt-2">
ข้อมูลปัจจุบันไม่สามารถยืนยันได้
</div>

`;


return;

}


const motherOnline =

motherStatus &&

String(
motherStatus.status ||
""
)
.trim()
.toLowerCase()

===

"online";


const nodes =
latestNodes
.map(

node => ({

node,

status:
getNodeStatus(
node
)

})

);


const online =
nodes.filter(

item =>
item.status ===
"online"

).length;


const sleep =
nodes.filter(

item =>
item.status ===
"sleep"

).length;


const offline =
Math.max(

0,

TOTAL_NODES
-
online
-
sleep

);


if(!motherOnline){

element.innerHTML = `

<b class="text-red-300">
🔴 Gateway Offline
</b>

<div class="mt-2">
ไม่สามารถยืนยันการเชื่อมต่อของอุปกรณ์ลูกได้
</div>

<div class="mt-2 text-xs text-slate-400">
ONLINE 0
• SLEEP 0
• OFFLINE ${TOTAL_NODES}
</div>

`;


return;

}


const usable =
nodes.filter(

item =>

(
item.status === "online" ||
item.status === "sleep"
)

&&

item.node

&&

item.node.pm25 !== null

&&

item.node.pm25 !== undefined

&&

!isNaN(
Number(
item.node.pm25
)
)

);


let headline =
"🟢 ระบบทำงานปกติ";


let headlineClass =
"text-emerald-300";


let pmText =
"ยังไม่มีข้อมูล PM2.5 ที่ใช้ประเมินได้";


if(usable.length){

const avg =

usable.reduce(

(sum,item) =>

sum

+

Number(
item.node.pm25
),

0

)

/ usable.length;


pmText =

"PM2.5 ภาพรวม "

+

fmt(avg)

+

" µg/m³ • "

+

quality(avg);


const avgLevel =
getRealtimeLevel(
"pm25",
avg
);


if(
avgLevel ===
"critical"
){

headline =
"🔴 คุณภาพอากาศควรเฝ้าระวัง";


headlineClass =
"text-red-300";

}

else if(
avgLevel ===
"warning"
){

headline =
"🟡 มีค่าที่ควรติดตาม";


headlineClass =
"text-amber-300";

}

}


if(offline > 0){

headline =
"🟠 มีอุปกรณ์ที่ต้องตรวจสอบ";


headlineClass =
"text-amber-300";

}


element.innerHTML = `

<b class="${headlineClass}">
${headline}
</b>

<div class="mt-2">
${pmText}
</div>

<div class="mt-2 text-xs text-slate-400">

Gateway ONLINE

• ONLINE ${online}

• SLEEP ${sleep}

• OFFLINE ${offline}

</div>

`;

}


function getSensorAlertItems(
nodeNumber,
node
){

const state =
getAlertStateForNode(
nodeNumber
);


if(
!state ||
!node
){

return [];

}


const definitions = [

{

levelKey:
"pm1_level",

label:
"PM1.0",

valueKey:
"pm1",

unit:
"µg/m³"

},

{

levelKey:
"pm25_level",

label:
"PM2.5",

valueKey:
"pm25",

unit:
"µg/m³"

},

{

levelKey:
"pm10_level",

label:
"PM10",

valueKey:
"pm10",

unit:
"µg/m³"

},

{

levelKey:
"temperature_level",

label:
"อุณหภูมิ",

valueKey:
"temperature",

unit:
"°C"

},

{

levelKey:
"humidity_level",

label:
"ความชื้น",

valueKey:
"humidity",

unit:
"%"

},

{

levelKey:
"light_level",

label:
"แสง",

valueKey:
"light",

unit:
"lux"

}

];


return definitions

.map(

definition => {

const level =
String(

state[
definition.levelKey
]

||

"normal"

)
.trim()
.toLowerCase();


if(level === "normal"){

return null;

}


return {

type:
level,


title:

"อุปกรณ์ "

+

nodeNumber

+

" • "

+

definition.label,


detail:

fmt(

node[
definition.valueKey
]

)

+

" "

+

definition.unit

};

}

)

.filter(Boolean);

}


function updateAlerts(){

const element =
$("alerts");


if(!element){

return;

}


if(!apiConnectionOnline){

element.innerHTML = `

<div class="soft rounded-xl p-3">

<b class="text-red-300">
🔴 ไม่สามารถเชื่อมต่อ API
</b>

<div class="text-xs text-slate-400 mt-1">
กรุณาตรวจสอบ Cloudflare Worker หรือการเชื่อมต่ออินเทอร์เน็ต
</div>

</div>

`;


return;

}


const motherOnline =

motherStatus

&&

String(
motherStatus.status ||
""
)
.trim()
.toLowerCase()

===

"online";


if(!motherOnline){

element.innerHTML = `

<div class="soft rounded-xl p-3">

<b class="text-red-300">
🔴 Gateway OFFLINE
</b>

<div class="text-xs text-slate-400 mt-1">
Worker ไม่สามารถยืนยันสถานะอุปกรณ์ลูกได้ และกำหนดทุก Node เป็น OFFLINE
</div>

</div>

`;


return;

}


const alerts = [];


for(
let number = 1;
number <= TOTAL_NODES;
number++
){

const node =
getLatestNode(
number
);


const status =
getNodeStatus(
node
);


if(status === "offline"){

alerts.push({

type:
"offline",


title:

"อุปกรณ์ "

+

number

+

" OFFLINE",


detail:
"ไม่สามารถติดต่ออุปกรณ์ได้"

});


continue;

}


alerts.push(

...getSensorAlertItems(
number,
node
)

);

}


if(!alerts.length){

element.innerHTML = `

<div class="soft rounded-xl p-3">

<b class="text-emerald-300">
✅ ไม่พบรายการที่ต้องตรวจสอบ
</b>

<div class="text-xs text-slate-400 mt-1">
Gateway, สถานะอุปกรณ์ และค่าตรวจวัดยังอยู่ในเงื่อนไขปกติ
</div>

</div>

`;


return;

}


const visual = {

offline: {
icon: "🔴",
className: "text-red-300"
},

critical: {
icon: "🔴",
className: "text-red-300"
},

high: {
icon: "🟠",
className: "text-orange-300"
},

warning: {
icon: "🟡",
className: "text-amber-300"
},

info: {
icon: "🔵",
className: "text-cyan-300"
}

};


element.innerHTML =

alerts

.map(

alert => {

const style =

visual[
alert.type
]

||

visual.warning;


return `

<div class="soft rounded-xl p-3 mb-2">

<b class="${style.className}">
${style.icon}
${escapeHtml(alert.title)}
</b>

<div class="text-xs text-slate-400 mt-1">
${escapeHtml(alert.detail)}
</div>

</div>

`;

}

)

.join(
""
);

}


async function load(){

try{

const [

latestResult,
historyResult,
motherResult,
alertResult,
standardsResult

] =

await Promise.all([

loadLatest(),

loadHistory(),

loadMotherStatus(),

loadAlertStates()
.catch(

error => {

console.warn(
"Alert states unavailable:",
error
);


return [];

}

),

loadStandards()
.catch(

error => {

console.warn(
"Standards unavailable:",
error
);


return null;

}

)

]);


apiConnectionOnline =
true;


latestNodes =
Array.isArray(
latestResult
)
? latestResult
: [];


records =
Array.isArray(
historyResult
)
? historyResult
: [];


motherStatus =
motherResult;


alertStates =
Array.isArray(
alertResult
)
? alertResult
: [];


standardsData =
standardsResult;


latestRecord =
getLatestTimestampRecord(
latestNodes
);


renderMonitoringNodes();


updateSystemHealth();


updateCurrentAirQuality();


update24HourStandards();


updateSmartSummary();


updateAlerts();


renderAverages();


updateTrendStatistics();


drawCharts();

}

catch(error){

console.error(
"Dashboard load error:",
error
);


apiConnectionOnline =
false;


motherStatus =
null;


alertStates =
[];


standardsData =
null;


forceAllNodesOffline();


updateCurrentAirQuality();


update24HourStandards();


updateSmartSummary();


updateAlerts();


if($("trend")){

$("trend").textContent =
"ไม่สามารถโหลดข้อมูล";

}

}

}


function bindDashboardEvents(){

const metricSelect =
$("metric");


if(metricSelect){

metricSelect.addEventListener(

"change",

() => {

metric =
metricSelect.value;


updateSelectedMetricLabel();


drawCharts();

}

);

}


const rangeButton =
$("historyRangeButton");


if(rangeButton){

rangeButton.addEventListener(

"click",

event => {

event.stopPropagation();


const panel =
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

}

else{

closeHistoryRangePicker();

}

}

);

}


document
.querySelectorAll(
".quick-range-option"
)
.forEach(

button => {

button.addEventListener(

"click",

() => {

setQuickRange(
button.dataset.range
);

}

);

}

);


const calendarPrev =
$("calendarPrev");


if(calendarPrev){

calendarPrev.addEventListener(

"click",

() => {

calendarDisplayDate =
new Date(

calendarDisplayDate.getFullYear(),

calendarDisplayDate.getMonth() - 1,

1

);


renderRangeCalendar();

}

);

}


const calendarNext =
$("calendarNext");


if(calendarNext){

calendarNext.addEventListener(

"click",

() => {

calendarDisplayDate =
new Date(

calendarDisplayDate.getFullYear(),

calendarDisplayDate.getMonth() + 1,

1

);


renderRangeCalendar();

}

);

}


const customStart =
$("customRangeStart");


if(customStart){

customStart.addEventListener(

"change",

() => {

updateQuickRangeUI(
null
);


renderRangeCalendar();

}

);

}


const customEnd =
$("customRangeEnd");


if(customEnd){

customEnd.addEventListener(

"change",

() => {

updateQuickRangeUI(
null
);


renderRangeCalendar();

}

);

}


const rangeApply =
$("historyRangeApply");


if(rangeApply){

rangeApply.addEventListener(

"click",

applyHistoryRange

);

}


const rangeCancel =
$("historyRangeCancel");


if(rangeCancel){

rangeCancel.addEventListener(

"click",

closeHistoryRangePicker

);

}


document.addEventListener(

"click",

event => {

const picker =
$("historyRangePicker");


if(
picker &&
!picker.contains(
event.target
)
){

closeHistoryRangePicker();

}

}

);


const forecastToggle =
$("forecastToggle");


if(forecastToggle){

forecastToggle.addEventListener(

"click",

() => {

forecastVisible =
!forecastVisible;


updateForecastToggleUI();


setForecastDatasetVisibility();

}

);

}


const exportButton =
$("exportButton");


if(exportButton){

exportButton.addEventListener(

"click",

openExportModal

);

}


const exportClose =
$("exportModalClose");


if(exportClose){

exportClose.addEventListener(

"click",

closeExportModal

);

}


const exportCancel =
$("exportCancelButton");


if(exportCancel){

exportCancel.addEventListener(

"click",

closeExportModal

);

}


document
.querySelectorAll(
"[data-export-close='true']"
)
.forEach(

element => {

element.addEventListener(

"click",

closeExportModal

);

}

);


const exportStart =
$("exportStartDate");


if(exportStart){

exportStart.addEventListener(

"change",

refreshExportPreview

);

}


const exportEnd =
$("exportEndDate");


if(exportEnd){

exportEnd.addEventListener(

"change",

refreshExportPreview

);

}


const exportExcel =
$("exportExcelButton");


if(exportExcel){

exportExcel.addEventListener(

"click",

downloadExportExcel

);

}


document.addEventListener(

"keydown",

event => {

if(
event.key !==
"Escape"
){

return;

}


const exportModal =
$("exportModal");


if(
exportModal &&
exportModal.classList.contains(
"active"
)
){

closeExportModal();

}


const rangePanel =
$("historyRangePanel");


if(
rangePanel &&
!rangePanel.classList.contains(
"hidden"
)
){

closeHistoryRangePicker();

}

}

);

}


function updateClock(){

const clock =
$("clock");


if(!clock){

return;

}


clock.textContent =
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


$("historyRangeButtonLabel")
.textContent =
getRangeLabel();


updateForecastToggleUI();


bindDashboardEvents();


updateClock();


setInterval(
updateClock,
1000
);


load();


setInterval(
load,
10000
);


setInterval(

() => {

if(apiConnectionOnline){

renderMonitoringNodes();


updateSystemHealth();


updateCurrentAirQuality();


update24HourStandards();


updateSmartSummary();


updateAlerts();

}

else{

forceAllNodesOffline();

}

},

5000

);


function openCreditImage(
imageSrc,
imageAlt
){

const modal =
document.getElementById(
"creditImageModal"
);


const image =
document.getElementById(
"creditFullImage"
);


const caption =
document.getElementById(
"creditImageCaption"
);


image.src =
imageSrc;


image.alt =
imageAlt;


caption.textContent =
imageAlt;


modal.classList.add(
"active"
);


modal.setAttribute(
"aria-hidden",
"false"
);


document.body.style.overflow =
"hidden";

}


function closeCreditImage(){

const modal =
document.getElementById(
"creditImageModal"
);


modal.classList.remove(
"active"
);


modal.setAttribute(
"aria-hidden",
"true"
);


document.body.style.overflow =
"";


setTimeout(

function(){

const image =
document.getElementById(
"creditFullImage"
);


image.src =
"";

},

200

);

}


document.addEventListener(

"keydown",

function(event){

if(
event.key ===
"Escape"
){

const modal =
document.getElementById(
"creditImageModal"
);


if(
modal.classList.contains(
"active"
)
){

closeCreditImage();

}

}

}

);
