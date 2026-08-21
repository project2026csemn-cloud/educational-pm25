const BASE =
"https://educational-pm25-api.project2026csemn.workers.dev";


const API = {

    latest:
        `${BASE}/api/get_latest.php`,

    history:
        `${BASE}/api/get_history.php`,

    export:
        `${BASE}/api/export.php`,

    mother:
        `${BASE}/api/mother_status`,

    alerts:
        `${BASE}/api/alert_states`,

    standards:
        `${BASE}/api/standards.php`

};


const TOTAL_NODES = 3;


const $ =
    id =>
        document.getElementById(id);


/* =========================================================
   STATE
   ========================================================= */

let latestNodes = [];

let records = [];

let motherStatus = null;

let alertStates = [];

let standardsData = null;

let latestRecord = null;


let historyChart = null;

let forecastChart = null;

let forecastVisible = true;


/*
 * Historical metric
 */
let metric = "pm25";


/*
 * Current Environment metric
 *
 * แยกออกจาก Historical
 */
let currentMetric = "pm25";


let averageRange = "24h";

let customRangeStart = null;

let customRangeEnd = null;


let calendarDisplayDate =
    new Date();


let calendarSelectionStep =
    "start";


let apiConnectionOnline =
    false;


let exportRows = [];


let activeHelpButton =
    null;


/* =========================================================
   RANGE CONFIG
   ========================================================= */

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


/* =========================================================
   CURRENT ENVIRONMENT CONFIG
   ========================================================= */

const CURRENT_METRIC_CONFIG = {

    pm1: {

        label:
            "PM1.0",

        unit:
            "µg/m³",

        description:
            "สรุปค่า PM1.0 ล่าสุดจากจุดตรวจวัดที่กำลังใช้งาน"

    },


    pm25: {

        label:
            "PM2.5",

        unit:
            "µg/m³",

        description:
            "สรุปค่า PM2.5 ล่าสุดจากจุดตรวจวัดที่กำลังใช้งาน"

    },


    pm10: {

        label:
            "PM10",

        unit:
            "µg/m³",

        description:
            "สรุปค่า PM10 ล่าสุดจากจุดตรวจวัดที่กำลังใช้งาน"

    },


    temperature: {

        label:
            "อุณหภูมิ",

        unit:
            "°C",

        description:
            "สรุปอุณหภูมิล่าสุดจากจุดตรวจวัดที่กำลังใช้งาน"

    },


    humidity: {

        label:
            "ความชื้น",

        unit:
            "%",

        description:
            "สรุปความชื้นสัมพัทธ์ล่าสุดจากจุดตรวจวัดที่กำลังใช้งาน"

    },


    light: {

        label:
            "แสง",

        unit:
            "lux",

        description:
            "สรุประดับความสว่างล่าสุดจากจุดตรวจวัดที่กำลังใช้งาน"

    }

};


/* =========================================================
   BASIC UTILITIES
   ========================================================= */

function fmt(value) {

    if (
        value === null ||
        value === undefined ||
        value === "" ||
        isNaN(value)
    ) {

        return "--";

    }


    return Number(value)
        .toFixed(1);

}


function escapeHtml(value) {

    return String(
        value ?? ""
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


/* =========================================================
   DATE
   ========================================================= */

function parseDate(value) {

    if (!value) {

        return null;

    }


    if (value instanceof Date) {

        return isNaN(
            value.getTime()
        )
            ? null
            : value;

    }


    const text =
        String(value)
            .trim();


    if (!text) {

        return null;

    }


    let date;


    /*
     * SQLite UTC:
     * 2026-08-21 10:00:00
     */
    if (
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
            .test(text)
    ) {

        date =
            new Date(
                text.replace(
                    " ",
                    "T"
                ) + "Z"
            );

    }

    else if (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
            .test(text)
    ) {

        date =
            new Date(
                text + "Z"
            );

    }

    else {

        date =
            new Date(text);

    }


    return isNaN(
        date.getTime()
    )
        ? null
        : date;

}


function formatThaiTime(value) {

    const date =
        parseDate(value);


    if (!date) {

        return "--";

    }


    return date
        .toLocaleTimeString(

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


/* =========================================================
   NORMALIZE API ROW
   ========================================================= */

function normalize(data) {

    if (!data) {

        return null;

    }


    return {

        id:
            data.id == null
                ? null
                : Number(
                    data.id
                ),


        device_id:
            String(
                data.device_id ?? ""
            )
                .trim(),


        status:
            String(
                data.status ?? "offline"
            )
                .trim()
                .toLowerCase(),


        pm1:
            data.pm1 == null
                ? null
                : Number(
                    data.pm1
                ),


        pm25:
            data.pm25 == null
                ? null
                : Number(
                    data.pm25
                ),


        pm10:
            data.pm10 == null
                ? null
                : Number(
                    data.pm10
                ),


        temperature:
            data.temperature == null
                ? null
                : Number(
                    data.temperature
                ),


        humidity:
            data.humidity == null
                ? null
                : Number(
                    data.humidity
                ),


        light:
            data.light == null
                ? null
                : Number(
                    data.light
                ),


        timestamp:
            data.recorded_at ||
            data.timestamp ||
            data.created_at ||
            null

    };

}


/* =========================================================
   NODE NAME
   ========================================================= */

function normalizeNodeName(value) {

    const text =
        String(
            value ?? ""
        )
            .trim()
            .toLowerCase();


    const match =
        text.match(
            /(\d+)/
        );


    return match
        ? "node" +
          match[1]
        : text;

}


function isSameNode(
    deviceId,
    nodeNumber
) {

    return (
        normalizeNodeName(
            deviceId
        )
        ===
        "node" +
        nodeNumber
    );

}


function getLatestNode(
    nodeNumber
) {

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


/* =========================================================
   GATEWAY
   ========================================================= */

function motherOnline() {

    return !!(

        apiConnectionOnline

        &&

        motherStatus

        &&

        String(
            motherStatus.status ||
            ""
        )
            .trim()
            .toLowerCase()

        ===

        "online"

    );

}


/* =========================================================
   NODE STATUS
   ========================================================= */

function getNodeStatus(node) {

    /*
     * Mother เป็น Gateway
     *
     * ถ้า Mother Offline
     * Dashboard จะไม่ยืนยัน Node ว่า Online
     */
    if (!motherOnline()) {

        return "offline";

    }


    if (!node) {

        return "offline";

    }


    const status =
        String(
            node.status || ""
        )
            .trim()
            .toLowerCase();


    if (
        status === "online" ||
        status === "sleep" ||
        status === "offline"
    ) {

        return status;

    }


    return "offline";

}


function countActiveNodes() {

    return latestNodes
        .filter(
            node => {

                const status =
                    getNodeStatus(node);


                return (
                    status === "online" ||
                    status === "sleep"
                );

            }
        )
        .length;

}


/* =========================================================
   LATEST TIMESTAMP
   ========================================================= */

function getLatestTimestampRecord(list) {

    let latest =
        null;


    for (
        const item of
        list || []
    ) {

        if (
            !item ||
            !item.timestamp
        ) {

            continue;

        }


        const date =
            parseDate(
                item.timestamp
            );


        if (!date) {

            continue;

        }


        if (
            !latest ||

            date.getTime() >

            parseDate(
                latest.timestamp
            )
                .getTime()
        ) {

            latest =
                item;

        }

    }


    return latest;

}


/* =========================================================
   HISTORICAL METRIC LABEL
   ========================================================= */

function metricLabel() {

    const map = {

        pm1:
            "PM1.0",

        pm25:
            "PM2.5",

        pm10:
            "PM10",

        temperature:
            "อุณหภูมิ",

        humidity:
            "ความชื้น",

        light:
            "แสง"

    };


    return (
        map[metric] ||
        metric
    );

}


function metricUnit() {

    const map = {

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
        map[metric] ||
        ""
    );

}


/* =========================================================
   FETCH JSON
   ========================================================= */

async function fetchJson(url) {

    const response =
        await fetch(

            url +

            (
                url.includes("?")
                    ? "&"
                    : "?"
            )

            +

            "t=" +

            Date.now(),

            {

                method:
                    "GET",

                cache:
                    "no-store",

                headers: {

                    Accept:
                        "application/json"

                }

            }

        );


    if (!response.ok) {

        throw new Error(
            "HTTP " +
            response.status
        );

    }


    const text =
        await response.text();


    let json;


    try {

        json =
            JSON.parse(text);

    }

    catch (error) {

        console.error(
            "API RAW:",
            text
        );


        throw new Error(
            "API ไม่ได้ส่ง JSON"
        );

    }


    if (
        !json ||
        !json.success
    ) {

        throw new Error(
            json?.message ||
            "API error"
        );

    }


    return json;

}


/* =========================================================
   LATEST API
   ========================================================= */

async function loadLatest() {

    const json =
        await fetchJson(
            API.latest
        );


    const list =
        Array.isArray(
            json.data
        )

        ? json.data

        : json.data

        ? [
            json.data
        ]

        : [];


    return list
        .map(normalize)
        .filter(Boolean);

}


/* =========================================================
   MOTHER API
   ========================================================= */

async function loadMotherStatus() {

    const json =
        await fetchJson(
            API.mother
        );


    if (!json.data) {

        return null;

    }


    return {

        status:
            String(
                json.data.status ||
                "offline"
            )
                .trim()
                .toLowerCase(),


        last_seen:
            json.data.last_seen ||
            null,


        updated_at:
            json.data.updated_at ||
            null

    };

}


/* =========================================================
   ALERT STATE API
   ========================================================= */

async function loadAlertStates() {

    const json =
        await fetchJson(
            API.alerts
        );


    return Array.isArray(
        json.data
    )

        ? json.data

        : [];

}


/* =========================================================
   STANDARD API
   ========================================================= */

async function loadStandards() {

    /*
     * ถึงแม้ UI ค่าเฉลี่ย 24 ชั่วโมงถูกลบแล้ว
     *
     * standards.php ยังใช้สำหรับ
     * Real-time thresholds
     */
    return fetchJson(
        API.standards
    );

}


/* =========================================================
   HISTORY API
   ========================================================= */

function getApiRange() {

    if (
        averageRange ===
        "custom"
    ) {

        return "30d";

    }


    return (
        RANGE_CONFIG[
            averageRange
        ]?.apiRange
        ||
        "24h"
    );

}


async function loadHistory() {

    const json =
        await fetchJson(

            API.history

            +

            "?range="

            +

            encodeURIComponent(
                getApiRange()
            )

            +

            "&limit=5000"

        );


    if (
        !Array.isArray(
            json.data
        )
    ) {

        throw new Error(
            "History data invalid"
        );

    }


    return json.data
        .map(normalize)
        .filter(Boolean);

}


/* =========================================================
   REALTIME THRESHOLDS
   ========================================================= */

function getRealtimeThreshold(
    field
) {

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
) {

    const number =
        Number(value);


    if (
        !Number.isFinite(
            number
        )
    ) {

        return "no_data";

    }


    const threshold =
        getRealtimeThreshold(
            field
        );


    /*
     * ถ้า standards API ใช้งานไม่ได้
     * ไม่สร้าง Alert ปลอม
     */
    if (!threshold) {

        return "normal";

    }


    if (
        threshold.critical != null

        &&

        number >=
        Number(
            threshold.critical
        )
    ) {

        return "critical";

    }


    if (
        threshold.warning != null

        &&

        number >=
        Number(
            threshold.warning
        )
    ) {

        return "warning";

    }


    if (
        threshold.low_warning != null

        &&

        number <=
        Number(
            threshold.low_warning
        )
    ) {

        return "warning";

    }


    if (
        threshold.high_warning != null

        &&

        number >=
        Number(
            threshold.high_warning
        )
    ) {

        return "warning";

    }


    if (
        threshold.low_info != null

        &&

        number <
        Number(
            threshold.low_info
        )
    ) {

        return "info";

    }


    return "normal";

}


function realtimeLevelLabel(
    level
) {

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


function quality(value) {

    return realtimeLevelLabel(

        getRealtimeLevel(
            "pm25",
            value
        )

    );

}


/* =========================================================
   MONITORING NODE VALUES
   ========================================================= */

function setNode(
    prefix,
    data
) {

    const fields = [

        "pm1",
        "pm25",
        "pm10",
        "temp",
        "hum",
        "light"

    ];


    if (!data) {

        fields.forEach(
            field => {

                const element =
                    $(
                        prefix +
                        field
                    );


                if (element) {

                    element.textContent =
                        "--";

                }

            }
        );


        return;

    }


    const pm1 =
        $(
            prefix +
            "pm1"
        );


    const pm25 =
        $(
            prefix +
            "pm25"
        );


    const pm10 =
        $(
            prefix +
            "pm10"
        );


    const temp =
        $(
            prefix +
            "temp"
        );


    const hum =
        $(
            prefix +
            "hum"
        );


    const light =
        $(
            prefix +
            "light"
        );


    if (pm1) {

        pm1.textContent =
            fmt(
                data.pm1
            );

    }


    if (pm25) {

        pm25.textContent =
            fmt(
                data.pm25
            );

    }


    if (pm10) {

        pm10.textContent =
            fmt(
                data.pm10
            );

    }


    if (temp) {

        temp.textContent =
            data.temperature == null

            ? "--"

            : fmt(
                data.temperature
            ) +
            "°C";

    }


    if (hum) {

        hum.textContent =
            data.humidity == null

            ? "--"

            : fmt(
                data.humidity
            ) +
            "%";

    }


    if (light) {

        light.textContent =
            data.light == null

            ? "--"

            : fmt(
                data.light
            ) +
            " lux";

    }

}


/* =========================================================
   NODE LAST UPDATE
   ========================================================= */

function updateLastUpdate(
    id,
    node
) {

    const element =
        $(id);


    if (!element) {

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


/* =========================================================
   NODE STATUS UI
   ========================================================= */

function updateNodeStatus(
    statusId,
    cardId,
    node
) {

    const statusElement =
        $(statusId);


    const card =
        $(cardId);


    if (
        !statusElement ||
        !card
    ) {

        return;

    }


    const status =
        getNodeStatus(node);


    const map = {

        online: {

            className:
                "status-online",

            dotClass:
                "status-online-dot",

            text:
                "ONLINE"

        },


        sleep: {

            className:
                "status-sleep",

            dotClass:
                "status-sleep-dot",

            text:
                "SLEEP"

        },


        offline: {

            className:
                "status-offline",

            dotClass:
                "status-offline-dot",

            text:
                "OFFLINE"

        }

    };


    const visual =
        map[status] ||
        map.offline;


    statusElement.innerHTML = `

        <span class="${visual.dotClass}">
            ●
        </span>

        ${visual.text}

        <span
            class="
                badge
                rounded-full
                px-3
                py-1
                text-xs
            "
        >
            ESP-NOW
        </span>

    `;


    statusElement.className =
        visual.className +
        " text-xs font-bold";


    card.classList.toggle(
        "offline",
        status === "offline"
    );

}


/* =========================================================
   MONITORING NODES RENDER
   ========================================================= */

function renderMonitoringNodes() {

    for (
        let number = 1;
        number <= TOTAL_NODES;
        number++
    ) {

        const node =
            getLatestNode(
                number
            );


        setNode(
            "n" +
            number,
            node
        );


        updateLastUpdate(
            "lastUpdate" +
            number,
            node
        );


        updateNodeStatus(

            "n" +
            number +
            "status",

            "nodeCard" +
            number,

            node

        );

    }


    updateSystemHealth();

}


/* =========================================================
   SYSTEM HEALTH
   ========================================================= */

function updateSystemHealth() {

    const gatewayDot =
        $("gatewayDotTop");


    const gatewayStatus =
        $("gatewayStatusTop");


    const nodesActive =
        $("nodesActiveTop");


    if (
        !gatewayDot ||
        !gatewayStatus ||
        !nodesActive
    ) {

        return;

    }


    if (!apiConnectionOnline) {

        gatewayDot.className =
            "text-red-400";


        gatewayStatus.textContent =
            "API ERROR";


        nodesActive.textContent =
            "ไม่สามารถตรวจสอบระบบได้";


        return;

    }


    if (motherOnline()) {

        gatewayDot.className =
            "text-emerald-400";


        gatewayStatus.textContent =
            "ONLINE";


        nodesActive.textContent =

            countActiveNodes()

            +

            " / "

            +

            TOTAL_NODES

            +

            " Nodes active";

    }

    else {

        gatewayDot.className =
            "text-red-400";


        gatewayStatus.textContent =
            "OFFLINE";


        nodesActive.textContent =

            "0 / "

            +

            TOTAL_NODES

            +

            " Nodes active";

    }

}


/* =========================================================
   FORCE OFFLINE
   ========================================================= */

function forceAllNodesOffline() {

    for (
        let number = 1;
        number <= TOTAL_NODES;
        number++
    ) {

        updateNodeStatus(

            "n" +
            number +
            "status",

            "nodeCard" +
            number,

            null

        );

    }


    const gatewayDot =
        $("gatewayDotTop");


    const gatewayStatus =
        $("gatewayStatusTop");


    const nodesActive =
        $("nodesActiveTop");


    if (gatewayDot) {

        gatewayDot.className =
            "text-red-400";

    }


    if (gatewayStatus) {

        gatewayStatus.textContent =
            "API ERROR";

    }


    if (nodesActive) {

        nodesActive.textContent =
            "ไม่สามารถตรวจสอบระบบได้";

    }

}


/* =========================================================
   DEVICE NAME
   ========================================================= */

function getDeviceDisplayName(
    deviceId
) {

    if (!deviceId) {

        return "--";

    }


    const match =
        String(deviceId)
            .match(
                /(\d+)/
            );


    if (match) {

        return (
            "อุปกรณ์ " +
            match[1]
        );

    }


    return String(
        deviceId
    );

}


/* =========================================================
   CURRENT ENVIRONMENT
   ========================================================= */

function getCurrentMetricConfig() {

    return (

        CURRENT_METRIC_CONFIG[
            currentMetric
        ]

        ||

        CURRENT_METRIC_CONFIG
            .pm25

    );

}


/* =========================================================
   SYNC CURRENT METRIC UI
   ========================================================= */

function syncCurrentMetricUI() {

    const config =
        getCurrentMetricConfig();


    /*
     * ชื่อช่องซ้าย
     *
     * ตรงนี้แก้ปัญหา
     * เลือก Humidity แต่ยังขึ้น PM2.5
     */
    const overallLabel =
        $("currentOverallLabel");


    if (overallLabel) {

        overallLabel.textContent =
            config.label +
            " ภาพรวม";

    }


    /*
     * คำอธิบายใต้ชื่อ Section
     */
    const description =
        $("currentEnvironmentDescription");


    if (description) {

        description.textContent =
            config.description;

    }


    /*
     * Icon เล็กใน 3 การ์ด:
     * ◎ ↑ !
     *
     * เป็น decoration อย่างเดียว
     * ไม่มี Function
     *
     * ลบทิ้งอัตโนมัติ
     */
    document
        .querySelectorAll(
            ".current-environment-icon"
        )
        .forEach(
            element =>
                element.remove()
        );

}


/* =========================================================
   CURRENT VALUE FORMAT
   ========================================================= */

function formatCurrentMetricValue(
    value
) {

    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
            Number(value)
        )
    ) {

        return "--";

    }


    const config =
        getCurrentMetricConfig();


    return (

        fmt(value)

        +

        (
            config.unit
                ? " " +
                  config.unit
                : ""
        )

    );

}


/* =========================================================
   CURRENT LEVEL
   ========================================================= */

function getCurrentMetricLevel(
    value
) {

    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
            Number(value)
        )
    ) {

        return "no_data";

    }


    return getRealtimeLevel(

        currentMetric,

        Number(value)

    );

}


/* =========================================================
   CURRENT BADGE
   ========================================================= */

function setCurrentQualityBadge(
    level
) {

    const badge =
        $("qualityBadge");


    if (!badge) {

        return;

    }


    badge.className =
        "current-quality-badge";


    const map = {

        normal: {

            text:
                "ปกติ",

            className:
                "current-quality-normal"

        },


        warning: {

            text:
                "เฝ้าระวัง",

            className:
                "current-quality-warning"

        },


        critical: {

            text:
                "สูง",

            className:
                "current-quality-critical"

        },


        info: {

            text:
                "ควรตรวจสอบ",

            className:
                "current-quality-info"

        },


        no_data: {

            text:
                "รอข้อมูล",

            className:
                "current-quality-unavailable"

        }

    };


    const result =
        map[level] ||
        map.no_data;


    badge.textContent =
        result.text;


    badge.classList.add(
        result.className
    );

}


/* =========================================================
   RESET CURRENT ENVIRONMENT
   ========================================================= */

function resetCurrentEnvironment(
    reason = "รอข้อมูล"
) {

    /*
     * สำคัญ:
     * sync ชื่อทุกครั้ง
     *
     * ต่อให้ Gateway Offline
     * Dropdown ก็ยังเปลี่ยนชื่อได้
     */
    syncCurrentMetricUI();


    const overallValue =
        $("currentOverallValue");


    const overallDetail =
        $("currentOverallDetail");


    const highestValue =
        $("currentHighestValue");


    const highestNode =
        $("currentHighestNode");


    const watchNode =
        $("currentWatchNode");


    const watchDetail =
        $("currentWatchDetail");


    const footer =
        $("currentEnvironmentFooter");


    if (overallValue) {

        overallValue.textContent =
            "--";

    }


    if (overallDetail) {

        overallDetail.textContent =
            "ไม่มีข้อมูลสำหรับคำนวณ";

    }


    if (highestValue) {

        highestValue.textContent =
            "--";

    }


    if (highestNode) {

        highestNode.textContent =
            "--";

    }


    if (watchNode) {

        watchNode.textContent =
            "--";

    }


    if (watchDetail) {

        watchDetail.textContent =
            reason;

    }


    if (footer) {

        footer.textContent =
            reason;

    }


    setCurrentQualityBadge(
        "no_data"
    );

}


/* =========================================================
   UPDATE CURRENT ENVIRONMENT
   ========================================================= */

function updateCurrentAirQuality() {

    /*
     * เปลี่ยนชื่อให้ตรง Dropdown
     * ก่อนตรวจ Gateway
     */
    syncCurrentMetricUI();


    const config =
        getCurrentMetricConfig();


    /* =====================================================
       API ERROR
       ===================================================== */

    if (!apiConnectionOnline) {

        resetCurrentEnvironment(
            "ไม่สามารถเชื่อมต่อ API ได้"
        );


        return;

    }


    /* =====================================================
       GATEWAY OFFLINE
       ===================================================== */

    if (!motherOnline()) {

        resetCurrentEnvironment(

            "Gateway Offline • " +

            "ไม่สามารถประเมินข้อมูลปัจจุบันได้"

        );


        return;

    }


    /* =====================================================
       ACTIVE NODES
       ===================================================== */

    const usableNodes =

        latestNodes.filter(
            node => {

                const status =
                    getNodeStatus(node);


                if (
                    status !== "online" &&
                    status !== "sleep"
                ) {

                    return false;

                }


                const value =
                    Number(
                        node[
                            currentMetric
                        ]
                    );


                return Number.isFinite(
                    value
                );

            }
        );


    /* =====================================================
       NO DATA
       ===================================================== */

    if (!usableNodes.length) {

        resetCurrentEnvironment(
            "ไม่มีอุปกรณ์ที่มีข้อมูลสำหรับตัวแปรนี้"
        );


        return;

    }


    /* =====================================================
       AVERAGE
       ===================================================== */

    const average =

        usableNodes.reduce(
            (
                sum,
                node
            ) => {

                return (

                    sum +

                    Number(
                        node[
                            currentMetric
                        ]
                    )

                );

            },

            0

        )

        /

        usableNodes.length;


    /* =====================================================
       HIGHEST
       ===================================================== */

    const highest =

        usableNodes.reduce(
            (
                current,
                node
            ) => {

                return (

                    Number(
                        node[
                            currentMetric
                        ]
                    )

                    >

                    Number(
                        current[
                            currentMetric
                        ]
                    )

                )

                ? node

                : current;

            }
        );


    const highestValue =
        Number(
            highest[
                currentMetric
            ]
        );


    /* =====================================================
       WATCH NODES
       ===================================================== */

    const watchNodes =

        usableNodes

            .map(
                node => {

                    const value =
                        Number(
                            node[
                                currentMetric
                            ]
                        );


                    return {

                        node,

                        value,

                        level:
                            getCurrentMetricLevel(
                                value
                            )

                    };

                }
            )

            .filter(
                item => {

                    return (

                        item.level ===
                        "warning"

                        ||

                        item.level ===
                        "critical"

                        ||

                        item.level ===
                        "info"

                    );

                }
            )

            .sort(
                (
                    a,
                    b
                ) => {

                    return (
                        b.value -
                        a.value
                    );

                }
            );


    /* =====================================================
       OVERALL
       ===================================================== */

    const overallValue =
        $("currentOverallValue");


    const overallDetail =
        $("currentOverallDetail");


    if (overallValue) {

        overallValue.textContent =
            formatCurrentMetricValue(
                average
            );

    }


    if (overallDetail) {

        overallDetail.textContent =

            "ค่าเฉลี่ยจาก "

            +

            usableNodes.length

            +

            " จุดที่ใช้งาน";

    }


    /* =====================================================
       HIGHEST
       ===================================================== */

    const highestValueElement =
        $("currentHighestValue");


    const highestNodeElement =
        $("currentHighestNode");


    if (highestValueElement) {

        highestValueElement.textContent =
            formatCurrentMetricValue(
                highestValue
            );

    }


    if (highestNodeElement) {

        highestNodeElement.textContent =
            getDeviceDisplayName(
                highest.device_id
            );

    }


    /* =====================================================
       OVERALL BADGE
       ===================================================== */

    setCurrentQualityBadge(

        getCurrentMetricLevel(
            average
        )

    );


    /* =====================================================
       WATCH
       ===================================================== */

    const watchNodeElement =
        $("currentWatchNode");


    const watchDetailElement =
        $("currentWatchDetail");


    if (watchNodes.length) {

        const watch =
            watchNodes[0];


        if (watchNodeElement) {

            watchNodeElement.textContent =
                getDeviceDisplayName(
                    watch.node.device_id
                );

        }


        if (watchDetailElement) {

            watchDetailElement.textContent =

                config.label

                +

                " "

                +

                formatCurrentMetricValue(
                    watch.value
                )

                +

                " • "

                +

                realtimeLevelLabel(
                    watch.level
                );

        }

    }

    else {

        if (watchNodeElement) {

            watchNodeElement.textContent =
                "ไม่มี";

        }


        if (watchDetailElement) {

            watchDetailElement.textContent =
                "ทุกจุดที่ใช้งานยังไม่เข้าเกณฑ์เฝ้าระวัง";

        }

    }


    /* =====================================================
       FOOTER
       ===================================================== */

    const footer =
        $("currentEnvironmentFooter");


    if (footer) {

        footer.textContent =

            "ใช้ข้อมูลล่าสุดจาก "

            +

            usableNodes.length

            +

            " / "

            +

            TOTAL_NODES

            +

            " จุดตรวจวัด";

    }

}


/* =========================================================
   SMART SUMMARY
   ========================================================= */

function updateSmartSummary() {

    const element =
        $("aiSummary");


    if (!element) {

        return;

    }


    if (!apiConnectionOnline) {

        element.innerHTML = `

            <b class="text-red-300">
                🔴 ไม่สามารถเชื่อมต่อ API
            </b>

            <div
                class="
                    text-xs
                    text-slate-500
                    mt-2
                "
            >
                ข้อมูลปัจจุบันไม่สามารถยืนยันได้
            </div>

        `;


        return;

    }


    if (!motherOnline()) {

        element.innerHTML = `

            <b class="text-red-300">
                🔴 Gateway Offline
            </b>

            <div class="mt-2">
                ไม่สามารถยืนยันการเชื่อมต่อของอุปกรณ์ลูกได้
            </div>

            <div
                class="
                    mt-2
                    text-xs
                    text-slate-400
                "
            >
                ONLINE 0
                • SLEEP 0
                • OFFLINE ${TOTAL_NODES}
            </div>

        `;


        return;

    }


    const nodes =

        latestNodes.map(
            node => {

                return {

                    node,

                    status:
                        getNodeStatus(
                            node
                        )

                };

            }
        );


    const online =

        nodes.filter(
            item =>
                item.status ===
                "online"
        )
        .length;


    const sleep =

        nodes.filter(
            item =>
                item.status ===
                "sleep"
        )
        .length;


    const offline =
        Math.max(

            0,

            TOTAL_NODES -
            online -
            sleep

        );


    /*
     * Smart Summary ยังคงใช้ PM2.5
     *
     * เพราะเป็นตัวแปรหลักของโครงการ
     *
     * ไม่เปลี่ยนตาม Dropdown Current
     */
    const usable =

        nodes.filter(
            item => {

                return (

                    (
                        item.status ===
                        "online"

                        ||

                        item.status ===
                        "sleep"
                    )

                    &&

                    item.node

                    &&

                    Number.isFinite(
                        Number(
                            item.node.pm25
                        )
                    )

                );

            }
        );


    let headline =
        "🟢 ระบบทำงานปกติ";


    let headlineClass =
        "text-emerald-300";


    let pmText =
        "ยังไม่มีข้อมูล PM2.5 ที่ใช้ประเมินได้";


    if (usable.length) {

        const average =

            usable.reduce(
                (
                    sum,
                    item
                ) => {

                    return (

                        sum +

                        Number(
                            item.node.pm25
                        )

                    );

                },

                0

            )

            /

            usable.length;


        const level =
            getRealtimeLevel(
                "pm25",
                average
            );


        pmText =

            "PM2.5 ภาพรวม "

            +

            fmt(
                average
            )

            +

            " µg/m³ • "

            +

            quality(
                average
            );


        if (
            level ===
            "critical"
        ) {

            headline =
                "🔴 คุณภาพอากาศควรเฝ้าระวัง";


            headlineClass =
                "text-red-300";

        }

        else if (
            level ===
            "warning"
        ) {

            headline =
                "🟡 มีค่าที่ควรติดตาม";


            headlineClass =
                "text-amber-300";

        }

    }


    if (offline > 0) {

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

        <div
            class="
                mt-2
                text-xs
                text-slate-400
            "
        >

            Gateway ONLINE

            • ONLINE ${online}

            • SLEEP ${sleep}

            • OFFLINE ${offline}

        </div>

    `;

}


/* =========================================================
   ALERT STATES
   ========================================================= */

function getAlertStateForNode(
    nodeNumber
) {

    return (

        alertStates.find(
            state => {

                return (

                    state

                    &&

                    isSameNode(
                        state.device_id,
                        nodeNumber
                    )

                );

            }
        )

        ||

        null

    );

}


/* =========================================================
   SENSOR ALERTS
   ========================================================= */

function getSensorAlertItems(
    nodeNumber,
    node
) {

    const state =
        getAlertStateForNode(
            nodeNumber
        );


    if (
        !state ||
        !node
    ) {

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
                            definition
                                .levelKey
                        ]

                        ||

                        "normal"

                    )
                        .trim()
                        .toLowerCase();


                if (
                    level ===
                    "normal"
                ) {

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
                                definition
                                    .valueKey
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


/* =========================================================
   ALERTS UI
   ========================================================= */

function updateAlerts() {

    const element =
        $("alerts");


    if (!element) {

        return;

    }


    /* =====================================================
       API ERROR
       ===================================================== */

    if (!apiConnectionOnline) {

        element.innerHTML = `

            <div class="alert-summary-bar">

                <span
                    class="
                        alert-summary-count
                        alert-summary-danger
                    "
                >
                    1 รายการ
                </span>


                <span class="alert-summary-text">
                    ระบบต้องการการตรวจสอบ
                </span>

            </div>


            <div
                class="
                    dashboard-alert
                    dashboard-alert-danger
                "
            >

                <div class="dashboard-alert-icon">
                    !
                </div>


                <div class="dashboard-alert-content">

                    <div class="dashboard-alert-title">
                        ไม่สามารถเชื่อมต่อ API
                    </div>


                    <div class="dashboard-alert-detail">
                        Dashboard ไม่สามารถติดต่อ Cloudflare Worker ได้
                    </div>


                    <div class="dashboard-alert-meta">
                        ตรวจสอบอินเทอร์เน็ตหรือสถานะ Worker
                    </div>

                </div>

            </div>

        `;


        return;

    }


    /* =====================================================
       GATEWAY OFFLINE
       ===================================================== */

    if (!motherOnline()) {

        element.innerHTML = `

            <div class="alert-summary-bar">

                <span
                    class="
                        alert-summary-count
                        alert-summary-danger
                    "
                >
                    1 รายการ
                </span>


                <span class="alert-summary-text">
                    พบปัญหาการเชื่อมต่อ
                </span>

            </div>


            <div
                class="
                    dashboard-alert
                    dashboard-alert-danger
                "
            >

                <div class="dashboard-alert-icon">
                    ●
                </div>


                <div class="dashboard-alert-content">


                    <div class="dashboard-alert-top">

                        <div class="dashboard-alert-title">
                            Gateway OFFLINE
                        </div>


                        <span class="dashboard-alert-level">
                            SYSTEM
                        </span>

                    </div>


                    <div class="dashboard-alert-detail">
                        ไม่สามารถติดต่ออุปกรณ์แม่ได้
                    </div>


                    <div class="dashboard-alert-impact">

                        <span>
                            อุปกรณ์ 1
                            <b>OFFLINE</b>
                        </span>

                        <span>
                            อุปกรณ์ 2
                            <b>OFFLINE</b>
                        </span>

                        <span>
                            อุปกรณ์ 3
                            <b>OFFLINE</b>
                        </span>

                    </div>


                    <div class="dashboard-alert-meta">
                        ระบบไม่สามารถยืนยันการเชื่อมต่อของอุปกรณ์ลูกได้
                    </div>

                </div>

            </div>

        `;


        return;

    }


    /* =====================================================
       BUILD ALERT LIST
       ===================================================== */

    const list = [];


    for (
        let number = 1;
        number <= TOTAL_NODES;
        number++
    ) {

        const node =
            getLatestNode(
                number
            );


        const status =
            getNodeStatus(
                node
            );


        /*
         * Node Offline
         */
        if (
            status ===
            "offline"
        ) {

            list.push({

                type:
                    "offline",


                title:

                    "อุปกรณ์ "

                    +

                    number

                    +

                    " OFFLINE",


                detail:
                    "ไม่สามารถติดต่ออุปกรณ์ได้",


                meta:
                    "ตรวจสอบการจ่ายไฟหรือการเชื่อมต่อ ESP-NOW"

            });


            continue;

        }


        /*
         * Sensor Alerts
         */
        const sensorAlerts =
            getSensorAlertItems(
                number,
                node
            );


        for (
            const alert of
            sensorAlerts
        ) {

            list.push({

                ...alert,


                meta:
                    "ค่าตรวจวัดเข้าเกณฑ์เฝ้าระวังของระบบ"

            });

        }

    }


    /* =====================================================
       NO ALERT
       ===================================================== */

    if (!list.length) {

        element.innerHTML = `

            <div class="alert-summary-bar">

                <span
                    class="
                        alert-summary-count
                        alert-summary-success
                    "
                >
                    0 รายการ
                </span>


                <span class="alert-summary-text">
                    ไม่พบความผิดปกติ
                </span>

            </div>


            <div
                class="
                    dashboard-alert
                    dashboard-alert-success
                "
            >

                <div class="dashboard-alert-icon">
                    ✓
                </div>


                <div class="dashboard-alert-content">

                    <div class="dashboard-alert-title">
                        ระบบทำงานปกติ
                    </div>


                    <div class="dashboard-alert-detail">
                        ไม่พบรายการที่ต้องตรวจสอบในขณะนี้
                    </div>


                    <div class="dashboard-alert-meta">
                        Gateway และอุปกรณ์ที่เชื่อมต่ออยู่ในสถานะปกติ
                    </div>

                </div>

            </div>

        `;


        return;

    }


    /* =====================================================
       VISUAL CONFIG
       ===================================================== */

    const visual = {

        offline: {

            icon:
                "●",

            className:
                "dashboard-alert-danger",

            level:
                "OFFLINE"

        },


        critical: {

            icon:
                "!",

            className:
                "dashboard-alert-danger",

            level:
                "CRITICAL"

        },


        high: {

            icon:
                "↑",

            className:
                "dashboard-alert-high",

            level:
                "HIGH"

        },


        warning: {

            icon:
                "!",

            className:
                "dashboard-alert-warning",

            level:
                "WARNING"

        },


        info: {

            icon:
                "i",

            className:
                "dashboard-alert-info",

            level:
                "INFO"

        }

    };


    /* =====================================================
       RENDER ALERTS
       ===================================================== */

    element.innerHTML = `

        <div class="alert-summary-bar">

            <span
                class="
                    alert-summary-count
                    alert-summary-danger
                "
            >
                ${list.length}
                รายการ
            </span>


            <span class="alert-summary-text">
                พบรายการที่ควรตรวจสอบ
            </span>

        </div>


        <div class="dashboard-alert-list">

            ${

                list.map(
                    alert => {

                        const style =

                            visual[
                                alert.type
                            ]

                            ||

                            visual.warning;


                        return `

                            <div
                                class="
                                    dashboard-alert
                                    ${style.className}
                                "
                            >

                                <div class="dashboard-alert-icon">
                                    ${style.icon}
                                </div>


                                <div class="dashboard-alert-content">


                                    <div class="dashboard-alert-top">


                                        <div class="dashboard-alert-title">

                                            ${escapeHtml(
                                                alert.title
                                            )}

                                        </div>


                                        <span class="dashboard-alert-level">
                                            ${style.level}
                                        </span>


                                    </div>


                                    <div class="dashboard-alert-detail">

                                        ${escapeHtml(
                                            alert.detail
                                        )}

                                    </div>


                                    <div class="dashboard-alert-meta">

                                        ${escapeHtml(
                                            alert.meta ||
                                            ""
                                        )}

                                    </div>


                                </div>

                            </div>

                        `;

                    }
                )
                .join("")

            }

        </div>

    `;

}


/* =========================================================
   RANGE LABEL
   ========================================================= */

function getRangeLabel() {

    if (
        averageRange ===
        "custom"

        &&

        customRangeStart

        &&

        customRangeEnd
    ) {

        const options = {

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

        };


        return (

            customRangeStart
                .toLocaleString(
                    "th-TH",
                    options
                )

            +

            " – "

            +

            customRangeEnd
                .toLocaleString(
                    "th-TH",
                    options
                )

        );

    }


    return (

        RANGE_CONFIG[
            averageRange
        ]?.label

        ||

        "ช่วงเวลาที่เลือก"

    );

}


/* =========================================================
   SELECTED TIME WINDOW
   ========================================================= */

function getSelectedTimeWindow() {

    if (
        averageRange ===
        "custom"
    ) {

        if (
            !customRangeStart ||
            !customRangeEnd
        ) {

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


    if (!config) {

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


/* =========================================================
   HISTORY FILTER
   ========================================================= */

function getRecordsInSelectedRange() {

    const window =
        getSelectedTimeWindow();


    if (!window) {

        return [];

    }


    return records.filter(
        record => {

            const date =
                parseDate(
                    record.timestamp
                );


            if (!date) {

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


/* =========================================================
   AVERAGE
   ========================================================= */

function calculateAverage(
    data,
    field
) {

    const values =

        data

            .map(
                item =>
                    item[field]
            )

            .filter(
                value => {

                    return (

                        value !== null

                        &&

                        value !== undefined

                        &&

                        Number.isFinite(
                            Number(value)
                        )

                    );

                }
            )

            .map(Number);


    if (!values.length) {

        return null;

    }


    return (

        values.reduce(
            (
                total,
                value
            ) => {

                return (
                    total +
                    value
                );

            },

            0

        )

        /

        values.length

    );

}


/* =========================================================
   STATISTICS
   ========================================================= */

function calculateStatistics(
    data,
    field
) {

    const values =

        data

            .map(
                item =>
                    item[field]
            )

            .filter(
                value => {

                    return (

                        value !== null

                        &&

                        value !== undefined

                        &&

                        Number.isFinite(
                            Number(value)
                        )

                    );

                }
            )

            .map(Number);


    if (!values.length) {

        return {

            average:
                null,

            max:
                null,

            min:
                null,

            last:
                null

        };

    }


    return {

        average:

            values.reduce(
                (
                    a,
                    b
                ) =>
                    a + b,
                0
            )

            /

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
            values[
                values.length -
                1
            ]

    };

}


/* =========================================================
   AVERAGE STATUS
   ========================================================= */

function averageStatus(
    value,
    field
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "● ไม่มีข้อมูล";

    }


    if (
        field ===
        "pm25"
    ) {

        return (

            "● เฉลี่ย "

            +

            getRangeLabel()

            +

            " • "

            +

            quality(value)

        );

    }


    return (

        "● เฉลี่ย "

        +

        getRangeLabel()

    );

}


/* =========================================================
   RENDER AVERAGES
   ========================================================= */

function renderAverages() {

    const data =
        getRecordsInSelectedRange();


    const selectedRangeLabel =
        $("selectedRangeLabel");


    if (selectedRangeLabel) {

        selectedRangeLabel.textContent =
            getRangeLabel();

    }


    const configs = [

        {

            field:
                "pm1",

            value:
                "averagePM1",

            status:
                "averagePM1Status"

        },


        {

            field:
                "pm25",

            value:
                "averagePM25",

            status:
                "averagePM25Status"

        },


        {

            field:
                "pm10",

            value:
                "averagePM10",

            status:
                "averagePM10Status"

        },


        {

            field:
                "temperature",

            value:
                "averageTemp",

            status:
                "averageTempStatus"

        },


        {

            field:
                "humidity",

            value:
                "averageHum",

            status:
                "averageHumStatus"

        },


        {

            field:
                "light",

            value:
                "averageLight",

            status:
                "averageLightStatus"

        }

    ];


    configs.forEach(
        config => {

            const average =
                calculateAverage(
                    data,
                    config.field
                );


            const valueElement =
                $(
                    config.value
                );


            const statusElement =
                $(
                    config.status
                );


            if (valueElement) {

                valueElement.textContent =
                    average === null
                    ? "--"
                    : fmt(
                        average
                    );

            }


            if (statusElement) {

                statusElement.textContent =
                    averageStatus(
                        average,
                        config.field
                    );

            }

        }
    );

}


/* =========================================================
   TREND STATISTICS
   ========================================================= */

function updateTrendStatistics() {

    const data =
        getRecordsInSelectedRange();


    const stats =
        calculateStatistics(
            data,
            metric
        );


    const avgElement =
        $("trendAvg");


    const maxElement =
        $("trendMax");


    const minElement =
        $("trendMin");


    const lastElement =
        $("trendLast");


    if (avgElement) {

        avgElement.textContent =
            stats.average === null

            ? "--"

            : fmt(
                stats.average
            );

    }


    if (maxElement) {

        maxElement.textContent =
            stats.max === null

            ? "--"

            : fmt(
                stats.max
            );

    }


    if (minElement) {

        minElement.textContent =
            stats.min === null

            ? "--"

            : fmt(
                stats.min
            );

    }


    let latest =
        null;


    const allRecords = [

        ...records,

        ...(
            latestRecord
                ? [
                    latestRecord
                ]
                : []
        )

    ];


    for (
        const record of
        allRecords
    ) {

        if (
            !record ||
            !record.timestamp
        ) {

            continue;

        }


        const value =
            record[
                metric
            ];


        if (
            !Number.isFinite(
                Number(value)
            )
        ) {

            continue;

        }


        const date =
            parseDate(
                record.timestamp
            );


        if (!date) {

            continue;

        }


        if (
            !latest

            ||

            date.getTime()

            >

            parseDate(
                latest.timestamp
            )
                .getTime()
        ) {

            latest =
                record;

        }

    }


    if (lastElement) {

        lastElement.textContent =
            latest

            ? fmt(
                latest[
                    metric
                ]
            )

            : "--";

    }


    const metricLabelElement =
        $("selectedMetricLabel");


    if (metricLabelElement) {

        metricLabelElement.textContent =
            metricLabel();

    }

}


/* =========================================================
   HISTORICAL CHART
   ========================================================= */

function drawCharts() {

    const array =

        getRecordsInSelectedRange()

            .filter(
                item => {

                    return (

                        item

                        &&

                        Number.isFinite(
                            Number(
                                item[
                                    metric
                                ]
                            )
                        )

                        &&

                        parseDate(
                            item.timestamp
                        )

                    );

                }
            )

            .sort(
                (
                    a,
                    b
                ) => {

                    return (

                        parseDate(
                            a.timestamp
                        )
                            .getTime()

                        -

                        parseDate(
                            b.timestamp
                        )
                            .getTime()

                    );

                }
            );


    updateTrendStatistics();


    if (!array.length) {

        const trend =
            $("trend");


        if (trend) {

            trend.textContent =
                "ไม่มีข้อมูลในช่วงเวลาที่เลือก";

        }


        if (historyChart) {

            historyChart.destroy();

            historyChart =
                null;

        }


        if (forecastChart) {

            forecastChart.destroy();

            forecastChart =
                null;

        }


        const forecastMessage =
            $("forecastMessage");


        if (forecastMessage) {

            forecastMessage.textContent =
                "ไม่มีข้อมูลเพียงพอสำหรับการคาดการณ์";

        }


        const forecastBadge =
            $("forecastBadge");


        if (forecastBadge) {

            forecastBadge.textContent =
                "WAITING";

        }


        return;

    }


    const labels =

        array.map(
            item => {

                return parseDate(
                    item.timestamp
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

                    );

            }
        );


    const values =

        array.map(
            item =>
                Number(
                    item[
                        metric
                    ]
                )
        );


    const trend =
        $("trend");


    if (trend) {

        if (
            values.length <
            2
        ) {

            trend.textContent =
                "ข้อมูลยังน้อย";

        }

        else {

            const first =
                values[0];


            const last =
                values[
                    values.length -
                    1
                ];


            const difference =
                last -
                first;


            const percentage =

                first === 0

                ? 0

                : difference /
                  Math.abs(first) *
                  100;


            if (
                Math.abs(
                    percentage
                )
                <
                1
            ) {

                trend.textContent =
                    "→ คงที่";

            }

            else if (
                difference >
                0
            ) {

                trend.textContent =
                    "↑ เพิ่มขึ้น";

            }

            else {

                trend.textContent =
                    "↓ ลดลง";

            }

        }

    }


    if (historyChart) {

        historyChart.destroy();

    }


    const canvas =
        $("historyChart");


    if (canvas) {

        historyChart =
            new Chart(

                canvas,

                {

                    type:
                        "line",


                    data: {

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

                                    values.length >
                                    50

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

    }


    drawForecast(
        array
    );

}


/* =========================================================
   LINEAR REGRESSION
   ========================================================= */

function linearRegression(points) {

    const count =
        points.length;


    if (
        count <
        2
    ) {

        return null;

    }


    let sumX = 0;

    let sumY = 0;

    let sumXY = 0;

    let sumXX = 0;


    for (
        const point of
        points
    ) {

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

        count *
        sumXX

        -

        sumX *
        sumX;


    if (
        denominator ===
        0
    ) {

        return null;

    }


    const slope =

        (
            count *
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

        count;


    const meanY =
        sumY /
        count;


    let totalError = 0;

    let residualError = 0;


    for (
        const point of
        points
    ) {

        const fitted =

            intercept

            +

            slope *
            point.x;


        totalError +=

            Math.pow(
                point.y -
                meanY,
                2
            );


        residualError +=

            Math.pow(
                point.y -
                fitted,
                2
            );

    }


    const r2 =

        totalError === 0

        ? 1

        : Math.max(

            0,

            Math.min(

                1,

                1 -
                residualError /
                totalError

            )

        );


    const rmse =

        Math.sqrt(

            residualError

            /

            Math.max(
                1,
                count -
                2
            )

        );


    return {

        slope,
        intercept,
        r2,
        rmse

    };

}


/* =========================================================
   FORECAST UTILITIES
   ========================================================= */

function clampForecastValue(
    field,
    value
) {

    if (
        !Number.isFinite(
            value
        )
    ) {

        return null;

    }


    if (
        field ===
        "humidity"
    ) {

        return Math.max(

            0,

            Math.min(
                100,
                value
            )

        );

    }


    if (
        field === "pm1" ||
        field === "pm25" ||
        field === "pm10" ||
        field === "light"
    ) {

        return Math.max(
            0,
            value
        );

    }


    return value;

}


function getForecastMinimumUncertainty(
    field
) {

    const map = {

        pm1:
            1,

        pm25:
            1,

        pm10:
            2,

        temperature:
            .5,

        humidity:
            2,

        light:
            15

    };


    return (
        map[field] ||
        1
    );

}


function getForecastStabilityThreshold(
    field
) {

    const map = {

        pm1:
            1,

        pm25:
            1,

        pm10:
            2,

        temperature:
            .5,

        humidity:
            2,

        light:
            20

    };


    return (
        map[field] ||
        1
    );

}


function getForecastConfidence(
    r2,
    sampleCount,
    coveredMinutes
) {

    if (
        sampleCount >= 20

        &&

        coveredMinutes >=
        30

        &&

        r2 >=
        .6
    ) {

        return "ค่อนข้างสูง";

    }


    if (
        sampleCount >= 12

        &&

        coveredMinutes >=
        20

        &&

        r2 >=
        .25
    ) {

        return "ปานกลาง";

    }


    return "ต่ำ";

}


/* =========================================================
   FORECAST TOGGLE
   ========================================================= */

function updateForecastToggleUI() {

    const button =
        $("forecastToggle");


    const label =
        $("forecastToggleLabel");


    const state =
        $("forecastToggleState");


    if (
        !button ||
        !label
    ) {

        return;

    }


    button.setAttribute(

        "aria-pressed",

        String(
            forecastVisible
        )

    );


    button.setAttribute(

        "aria-checked",

        String(
            forecastVisible
        )

    );


    button.classList.toggle(
        "is-on",
        forecastVisible
    );


    button.classList.toggle(
        "is-off",
        !forecastVisible
    );


    label.textContent =
        forecastVisible

        ? "เปิดการคาดการณ์"

        : "ซ่อนการคาดการณ์";


    if (state) {

        state.textContent =
            forecastVisible

            ? "ON"

            : "OFF";

    }


    button.title =
        forecastVisible

        ? "กดเพื่อซ่อน Forecast"

        : "กดเพื่อแสดง Forecast";

}


function setForecastDatasetVisibility() {

    if (
        !forecastChart ||
        !forecastChart.data ||
        !forecastChart.data.datasets
    ) {

        return;

    }


    for (
        let index = 1;
        index <
        forecastChart.data.datasets.length;
        index++
    ) {

        forecastChart
            .setDatasetVisibility(
                index,
                forecastVisible
            );

    }


    forecastChart.update();


    updateForecastToggleUI();

}


/* =========================================================
   FORECAST
   ========================================================= */

function drawForecast(array) {

    if (forecastChart) {

        forecastChart.destroy();

        forecastChart =
            null;

    }


    const valid =

        array

            .filter(
                row => {

                    return (

                        row

                        &&

                        row.timestamp

                        &&

                        parseDate(
                            row.timestamp
                        )

                        &&

                        Number.isFinite(
                            Number(
                                row[
                                    metric
                                ]
                            )
                        )

                    );

                }
            )

            .sort(
                (
                    a,
                    b
                ) => {

                    return (

                        parseDate(
                            a.timestamp
                        )
                            .getTime()

                        -

                        parseDate(
                            b.timestamp
                        )
                            .getTime()

                    );

                }
            );


    const forecastMessage =
        $("forecastMessage");


    const forecastBadge =
        $("forecastBadge");


    if (
        valid.length <
        10
    ) {

        if (forecastMessage) {

            forecastMessage.textContent =
                "ข้อมูลยังไม่เพียงพอสำหรับคาดการณ์ ต้องมีอย่างน้อย 10 จุดข้อมูล";

        }


        if (forecastBadge) {

            forecastBadge.textContent =

                metricLabel()

                +

                " • รอข้อมูล";

        }


        return;

    }


    const latestDate =
        parseDate(
            valid[
                valid.length -
                1
            ]
                .timestamp
        );


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

                        date

                        &&

                        date >=
                        windowStart

                        &&

                        date <=
                        latestDate

                    );

                }
            )

            .slice(
                -90
            );


    if (
        recent.length <
        10
    ) {

        if (forecastMessage) {

            forecastMessage.textContent =
                "ข้อมูลใน 60 นาทีล่าสุดยังไม่พอสำหรับคาดการณ์";

        }


        if (forecastBadge) {

            forecastBadge.textContent =

                metricLabel()

                +

                " • รอข้อมูล";

        }


        return;

    }


    const firstDate =
        parseDate(
            recent[0]
                .timestamp
        );


    const lastDate =
        parseDate(
            recent[
                recent.length -
                1
            ]
                .timestamp
        );


    const coveredMinutes =

        (
            lastDate.getTime()

            -

            firstDate.getTime()
        )

        /

        60000;


    const points =

        recent.map(
            row => {

                return {

                    x:

                        (
                            parseDate(
                                row.timestamp
                            )
                                .getTime()

                            -

                            firstDate.getTime()
                        )

                        /

                        60000,


                    y:
                        Number(
                            row[
                                metric
                            ]
                        )

                };

            }
        );


    const model =
        linearRegression(
            points
        );


    if (!model) {

        if (forecastMessage) {

            forecastMessage.textContent =
                "รูปแบบข้อมูลช่วงนี้ไม่เหมาะกับการคาดการณ์เชิงเส้น";

        }


        return;

    }


    const currentValue =
        Number(
            recent[
                recent.length -
                1
            ][
                metric
            ]
        );


    const currentX =

        (
            lastDate.getTime()

            -

            firstDate.getTime()
        )

        /

        60000;


    const recentValues =

        recent.map(
            row =>
                Number(
                    row[
                        metric
                    ]
                )
        );


    const mean =

        recentValues.reduce(
            (
                total,
                value
            ) =>
                total +
                value,
            0
        )

        /

        recentValues.length;


    const variance =

        recentValues.reduce(
            (
                total,
                value
            ) => {

                return (

                    total +

                    Math.pow(
                        value -
                        mean,
                        2
                    )

                );

            },

            0

        )

        /

        recentValues.length;


    const standardDeviation =
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

            standardDeviation *
            3

        );


    const baseUncertainty =
        Math.max(

            getForecastMinimumUncertainty(
                metric
            ),

            model.rmse *
            1.5

        );


    const steps = [
        10,
        20,
        30
    ];


    const predictions =

        steps.map(
            minutes => {

                const futureX =
                    currentX +
                    minutes;


                const raw =

                    model.intercept

                    +

                    model.slope *
                    futureX;


                const maximumChange =

                    maxThirtyMinuteChange

                    *

                    (
                        minutes /
                        30
                    );


                const bounded =
                    Math.max(

                        currentValue -
                        maximumChange,

                        Math.min(

                            currentValue +
                            maximumChange,

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
                        .85

                        +

                        .5 *
                        (
                            minutes /
                            30
                        )
                    );


                return {

                    minutes,


                    center,


                    lower:
                        clampForecastValue(

                            metric,

                            center -
                            uncertainty

                        ),


                    upper:
                        clampForecastValue(

                            metric,

                            center +
                            uncertainty

                        )

                };

            }
        );


    const finalForecast =
        predictions[
            predictions.length -
            1
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


    if (
        Math.abs(
            change
        )
        >=
        stabilityThreshold
    ) {

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


    const assessment =
        realtimeLevelLabel(

            getRealtimeLevel(

                metric,

                finalForecast.center

            )

        );


    const unit =
        metricUnit();


    if (forecastMessage) {

        forecastMessage.innerHTML = `

            <div
                class="
                    text-[11px]
                    text-slate-500
                "
            >
                ตัวแปรที่กำลังคาดการณ์
            </div>


            <b class="text-cyan-300">

                ${metricLabel()}

                ${
                    unit
                    ? " (" +
                      unit +
                      ")"
                    : ""
                }

            </b>


            <div
                class="
                    grid
                    grid-cols-3
                    gap-3
                    mt-3
                "
            >


                <div>

                    <span class="text-xs text-slate-500">
                        ค่าปัจจุบัน
                    </span>

                    <b class="block text-xl mt-1">
                        ${fmt(currentValue)}
                    </b>

                </div>


                <div>

                    <span class="text-xs text-slate-500">
                        ช่วงคาดการณ์ +30 นาที
                    </span>

                    <b
                        class="
                            block
                            text-xl
                            text-cyan-300
                            mt-1
                        "
                    >
                        ${fmt(finalForecast.lower)}
                        –
                        ${fmt(finalForecast.upper)}
                    </b>

                </div>


                <div>

                    <span class="text-xs text-slate-500">
                        ค่ากลางประมาณ
                    </span>

                    <b
                        class="
                            block
                            text-xl
                            text-emerald-300
                            mt-1
                        "
                    >
                        ${fmt(finalForecast.center)}
                    </b>

                </div>

            </div>


            <div
                class="
                    mt-4
                    grid
                    sm:grid-cols-3
                    gap-2
                "
            >


                <div
                    class="
                        rounded-lg
                        px-3
                        py-2
                    "
                    style="
                        background:
                        rgba(15,23,42,.42)
                    "
                >

                    <div class="text-[10px] text-slate-500">
                        แนวโน้ม
                    </div>

                    <b class="text-xs">
                        ${direction}
                    </b>

                </div>


                <div
                    class="
                        rounded-lg
                        px-3
                        py-2
                    "
                    style="
                        background:
                        rgba(15,23,42,.42)
                    "
                >

                    <div class="text-[10px] text-slate-500">
                        ระดับคาดการณ์
                    </div>

                    <b class="text-xs text-cyan-300">
                        ${assessment}
                    </b>

                </div>


                <div
                    class="
                        rounded-lg
                        px-3
                        py-2
                    "
                    style="
                        background:
                        rgba(15,23,42,.42)
                    "
                >

                    <div class="text-[10px] text-slate-500">
                        ความเชื่อมั่น
                    </div>

                    <b class="text-xs text-cyan-300">
                        ${confidence}
                    </b>

                </div>


            </div>


            <div
                class="
                    text-[11px]
                    text-slate-400
                    mt-3
                "
            >

                ใช้ข้อมูลล่าสุด
                ${recent.length}
                จุด

                • ครอบคลุมประมาณ
                ${Math.round(coveredMinutes)}
                นาที

            </div>


            <div
                class="
                    text-[10px]
                    text-slate-500
                    mt-2
                "
            >

                Forecast ใช้ Linear Regression

                • ไม่ใช่ AI/ML

                • ไม่ใช่ค่าที่เซนเซอร์วัดจริงในอนาคต

            </div>

        `;

    }


    if (forecastBadge) {

        forecastBadge.textContent =

            metricLabel()

            +

            " • +30 นาที";

    }


    const actual =

        recent.slice(
            -12
        );


    const actualLabels =

        actual.map(
            row =>
                formatThaiTime(
                    row.timestamp
                )
        );


    const actualValues =

        actual.map(
            row =>
                Number(
                    row[
                        metric
                    ]
                )
        );


    const futureLabels =

        predictions.map(
            prediction =>

                "+"

                +

                prediction.minutes

                +

                " นาที"

        );


    const leadingNulls =

        new Array(

            Math.max(

                0,

                actualValues.length -
                1

            )

        )
            .fill(null);


    const canvas =
        $("forecastChart");


    if (!canvas) {

        return;

    }


    forecastChart =
        new Chart(

            canvas,

            {

                type:
                    "line",


                data: {

                    labels: [

                        ...actualLabels,

                        ...futureLabels

                    ],


                    datasets: [

                        {

                            label:
                                "ข้อมูลจริง",


                            data: [

                                ...actualValues,

                                ...new Array(
                                    3
                                )
                                    .fill(null)

                            ],


                            borderColor:
                                "#22d3ee",


                            backgroundColor:
                                "rgba(34,211,238,.05)",


                            borderWidth:
                                2,


                            tension:
                                .3,


                            pointRadius:
                                2

                        },


                        {

                            label:
                                "ขอบล่าง Forecast",


                            data: [

                                ...leadingNulls,

                                actualValues[
                                    actualValues.length -
                                    1
                                ],

                                ...predictions.map(
                                    prediction =>
                                        prediction.lower
                                )

                            ],


                            borderColor:
                                "rgba(52,211,153,0)",


                            borderWidth:
                                0,


                            pointRadius:
                                0

                        },


                        {

                            label:
                                "ช่วงคาดการณ์",


                            data: [

                                ...leadingNulls,

                                actualValues[
                                    actualValues.length -
                                    1
                                ],

                                ...predictions.map(
                                    prediction =>
                                        prediction.upper
                                )

                            ],


                            borderColor:
                                "rgba(52,211,153,.22)",


                            backgroundColor:
                                "rgba(52,211,153,.10)",


                            borderWidth:
                                1,


                            pointRadius:
                                0,


                            fill:
                                "-1"

                        },


                        {

                            label:
                                "Forecast",


                            data: [

                                ...leadingNulls,

                                actualValues[
                                    actualValues.length -
                                    1
                                ],

                                ...predictions.map(
                                    prediction =>
                                        prediction.center
                                )

                            ],


                            borderColor:
                                "#34d399",


                            borderDash: [
                                6,
                                5
                            ],


                            borderWidth:
                                2,


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


                    plugins: {

                        legend: {

                            display:
                                false

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


/* =========================================================
   RANGE PICKER DATE VALUE
   ========================================================= */

function toDateTimeLocalValue(
    date
) {

    const pad =
        value =>
            String(value)
                .padStart(
                    2,
                    "0"
                );


    if (!date) {

        return "";

    }


    return (

        date.getFullYear()

        +

        "-"

        +

        pad(
            date.getMonth() +
            1
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
) {

    const startInput =
        $("customRangeStart");


    const endInput =
        $("customRangeEnd");


    if (startInput) {

        startInput.value =
            toDateTimeLocalValue(
                start
            );

    }


    if (endInput) {

        endInput.value =
            toDateTimeLocalValue(
                end
            );

    }

}


/* =========================================================
   QUICK RANGE
   ========================================================= */

function setQuickRange(
    rangeKey
) {

    const config =
        RANGE_CONFIG[
            rangeKey
        ];


    if (!config) {

        return;

    }


    const end =
        new Date();


    const start =
        new Date(

            end.getTime()

            -

            config.minutes *
            60000

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
) {

    document
        .querySelectorAll(
            ".quick-range-option"
        )
        .forEach(
            button => {

                const active =

                    button.dataset.range

                    ===

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


/* =========================================================
   INPUT DATE
   ========================================================= */

function dateOnlyFromInput(
    id
) {

    const input =
        $(id);


    if (
        !input ||
        !input.value
    ) {

        return null;

    }


    const date =
        new Date(
            input.value
        );


    return isNaN(
        date.getTime()
    )

        ? null

        : date;

}


function sameCalendarDay(
    a,
    b
) {

    return !!(

        a

        &&

        b

        &&

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


/* =========================================================
   RANGE PICKER OPEN
   ========================================================= */

function openHistoryRangePicker() {

    const panel =
        $("historyRangePanel");


    const button =
        $("historyRangeButton");


    if (!panel) {

        return;

    }


    panel.classList.remove(
        "hidden"
    );


    if (button) {

        button.setAttribute(
            "aria-expanded",
            "true"
        );

    }


    const selected =
        getSelectedTimeWindow();


    const start =

        selected?.start

        ||

        new Date(
            Date.now() -
            86400000
        );


    const end =

        selected?.end

        ||

        new Date();


    setPickerInputs(
        start,
        end
    );


    calendarDisplayDate =
        new Date(end);


    calendarSelectionStep =
        "start";


    updateQuickRangeUI(

        averageRange ===
        "custom"

        ? null

        : averageRange

    );


    renderRangeCalendar();

}


function closeHistoryRangePicker() {

    const panel =
        $("historyRangePanel");


    const button =
        $("historyRangeButton");


    const error =
        $("customRangeError");


    if (panel) {

        panel.classList.add(
            "hidden"
        );

    }


    if (button) {

        button.setAttribute(
            "aria-expanded",
            "false"
        );

    }


    if (error) {

        error.classList.add(
            "hidden"
        );

    }

}


/* =========================================================
   CALENDAR
   ========================================================= */

function renderRangeCalendar() {

    const grid =
        $("rangeCalendarGrid");


    if (!grid) {

        return;

    }


    const year =
        calendarDisplayDate
            .getFullYear();


    const month =
        calendarDisplayDate
            .getMonth();


    const title =
        $("rangeCalendarTitle");


    if (title) {

        title.textContent =
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

    }


    grid.innerHTML =
        "";


    const firstWeekday =
        new Date(
            year,
            month,
            1
        )
            .getDay();


    const daysInMonth =
        new Date(
            year,
            month + 1,
            0
        )
            .getDate();


    const previousDays =
        new Date(
            year,
            month,
            0
        )
            .getDate();


    const selectedStart =
        dateOnlyFromInput(
            "customRangeStart"
        );


    const selectedEnd =
        dateOnlyFromInput(
            "customRangeEnd"
        );


    for (
        let index = 0;
        index < 42;
        index++
    ) {

        let day;

        let cellMonth =
            month;

        let muted =
            false;


        if (
            index <
            firstWeekday
        ) {

            day =

                previousDays

                -

                firstWeekday

                +

                index

                +

                1;


            cellMonth =
                month -
                1;


            muted =
                true;

        }

        else if (
            index >=
            firstWeekday +
            daysInMonth
        ) {

            day =

                index

                -

                (
                    firstWeekday +
                    daysInMonth
                )

                +

                1;


            cellMonth =
                month +
                1;


            muted =
                true;

        }

        else {

            day =
                index -
                firstWeekday +
                1;

        }


        const cellDate =
            new Date(

                year,

                cellMonth,

                day

            );


        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.textContent =
            day;


        button.className =
            "h-9 rounded-lg text-xs transition";


        button.style.color =

            muted

            ? "#475569"

            : "#e2e8f0";


        const startDay =
            sameCalendarDay(
                cellDate,
                selectedStart
            );


        const endDay =
            sameCalendarDay(
                cellDate,
                selectedEnd
            );


        const inRange =

            selectedStart

            &&

            selectedEnd

            &&

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


        button.style.background =

            startDay ||
            endDay

            ? "rgba(34,211,238,.28)"

            : inRange

            ? "rgba(34,211,238,.07)"

            : "transparent";


        button.style.border =

            startDay ||
            endDay

            ? "1px solid rgba(103,232,249,.34)"

            : "1px solid transparent";


        button.addEventListener(
            "click",
            () => {

                const startInput =
                    $("customRangeStart");


                const endInput =
                    $("customRangeEnd");


                if (
                    !startInput ||
                    !endInput
                ) {

                    return;

                }


                if (
                    calendarSelectionStep ===
                    "start"
                ) {

                    const previous =
                        dateOnlyFromInput(
                            "customRangeStart"
                        );


                    const date =
                        new Date(
                            cellDate
                        );


                    date.setHours(

                        previous?.getHours()
                        ??
                        0,

                        previous?.getMinutes()
                        ??
                        0,

                        0,

                        0

                    );


                    startInput.value =
                        toDateTimeLocalValue(
                            date
                        );


                    const end =
                        dateOnlyFromInput(
                            "customRangeEnd"
                        );


                    if (
                        !end ||
                        end <
                        date
                    ) {

                        const nextEnd =
                            new Date(
                                date
                            );


                        nextEnd.setHours(
                            23,
                            59,
                            0,
                            0
                        );


                        endInput.value =
                            toDateTimeLocalValue(
                                nextEnd
                            );

                    }


                    calendarSelectionStep =
                        "end";

                }

                else {

                    const previous =
                        dateOnlyFromInput(
                            "customRangeEnd"
                        );


                    const date =
                        new Date(
                            cellDate
                        );


                    date.setHours(

                        previous?.getHours()
                        ??
                        23,

                        previous?.getMinutes()
                        ??
                        59,

                        0,

                        0

                    );


                    const start =
                        dateOnlyFromInput(
                            "customRangeStart"
                        );


                    if (
                        start &&
                        date <
                        start
                    ) {

                        startInput.value =
                            toDateTimeLocalValue(
                                date
                            );


                        endInput.value =
                            toDateTimeLocalValue(
                                start
                            );

                    }

                    else {

                        endInput.value =
                            toDateTimeLocalValue(
                                date
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


/* =========================================================
   APPLY HISTORY RANGE
   ========================================================= */

async function applyHistoryRange() {

    const start =
        dateOnlyFromInput(
            "customRangeStart"
        );


    const end =
        dateOnlyFromInput(
            "customRangeEnd"
        );


    const error =
        $("customRangeError");


    if (
        !start ||
        !end
    ) {

        if (error) {

            error.textContent =
                "กรุณาเลือก Start และ End";


            error.classList.remove(
                "hidden"
            );

        }


        return;

    }


    if (
        start >=
        end
    ) {

        if (error) {

            error.textContent =
                "End ต้องอยู่หลัง Start";


            error.classList.remove(
                "hidden"
            );

        }


        return;

    }


    if (
        end.getTime() -
        start.getTime()

        >

        30 *
        24 *
        60 *
        60 *
        1000
    ) {

        if (error) {

            error.textContent =
                "เลือกช่วงเวลาได้สูงสุด 30 วัน";


            error.classList.remove(
                "hidden"
            );

        }


        return;

    }


    const durationMinutes =

        (
            end.getTime()

            -

            start.getTime()
        )

        /

        60000;


    let matchedRange =
        null;


    for (
        const [
            key,
            config
        ]
        of
        Object.entries(
            RANGE_CONFIG
        )
    ) {

        if (
            Math.abs(

                durationMinutes

                -

                config.minutes

            )

            <

            1.5
        ) {

            matchedRange =
                key;


            break;

        }

    }


    if (matchedRange) {

        averageRange =
            matchedRange;


        customRangeStart =
            null;


        customRangeEnd =
            null;

    }

    else {

        averageRange =
            "custom";


        customRangeStart =
            start;


        customRangeEnd =
            end;

    }


    const label =
        $("historyRangeButtonLabel");


    if (label) {

        label.textContent =
            getRangeLabel();

    }


    closeHistoryRangePicker();


    await load();

}


/* =========================================================
   EXPORT UTILITIES
   ========================================================= */

function dateToInputValue(
    date
) {

    if (!date) {

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
            date.getMonth() +
            1
        )

        +

        "-"

        +

        pad(
            date.getDate()
        )

    );

}


function showExportError(
    message
) {

    const element =
        $("exportError");


    if (!element) {

        return;

    }


    element.textContent =
        message ||
        "";


    element.classList.toggle(
        "hidden",
        !message
    );

}


function setExportLoading(
    loading
) {

    const loadingElement =
        $("exportLoading");


    const button =
        $("exportExcelButton");


    if (loadingElement) {

        loadingElement.classList.toggle(
            "hidden",
            !loading
        );

    }


    if (button) {

        button.disabled =
            loading ||
            !exportRows.length;

    }

}


/* =========================================================
   EXPORT BANGKOK RANGE
   ========================================================= */

function getBangkokExportBoundaries() {

    const startValue =
        $("exportStartDate")
            ?.value;


    const endValue =
        $("exportEndDate")
            ?.value;


    if (
        !startValue ||
        !endValue
    ) {

        return null;

    }


    const start =
        new Date(

            startValue

            +

            "T00:00:00+07:00"

        );


    const endStart =
        new Date(

            endValue

            +

            "T00:00:00+07:00"

        );


    if (
        isNaN(
            start.getTime()
        )

        ||

        isNaN(
            endStart.getTime()
        )
    ) {

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


/* =========================================================
   EXPORT LOAD
   ========================================================= */

async function loadExportRows() {

    const boundary =
        getBangkokExportBoundaries();


    if (!boundary) {

        throw new Error(
            "กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด"
        );

    }


    const maxRange =
        31 *
        24 *
        60 *
        60 *
        1000;


    if (
        boundary.end.getTime()

        -

        boundary.start.getTime()

        >

        maxRange
    ) {

        throw new Error(
            "สามารถส่งออกข้อมูลได้สูงสุดครั้งละ 30 วัน"
        );

    }


    let offset = 0;

    let total = null;

    const allRows = [];


    while (true) {

        const json =
            await fetchJson(

                API.export

                +

                "?start="

                +

                encodeURIComponent(
                    boundary.start
                        .toISOString()
                )

                +

                "&end="

                +

                encodeURIComponent(
                    boundary.end
                        .toISOString()
                )

                +

                "&limit=1000"

                +

                "&offset="

                +

                offset

            );


        if (
            total === null

            &&

            json.total != null
        ) {

            total =
                Number(
                    json.total
                );

        }


        const rows =
            (
                json.data ||
                []
            )
                .map(normalize)
                .filter(Boolean);


        allRows.push(
            ...rows
        );


        const count =
            $("exportDataCount");


        if (count) {

            count.textContent =

                total != null

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

                : allRows.length
                    .toLocaleString(
                        "th-TH"
                    );

        }


        if (
            json.has_more !== true

            ||

            !rows.length
        ) {

            break;

        }


        offset +=
            rows.length;

    }


    return allRows.sort(
        (
            a,
            b
        ) => {

            return (

                parseDate(
                    a.timestamp
                )
                    .getTime()

                -

                parseDate(
                    b.timestamp
                )
                    .getTime()

            );

        }
    );

}


/* =========================================================
   EXPORT DATE FORMAT
   ========================================================= */

function formatExportDate(
    value
) {

    const date =
        parseDate(value);


    if (!date) {

        return "";

    }


    return date
        .toLocaleString(

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


/* =========================================================
   EXPORT PREVIEW
   ========================================================= */

function renderExportPreview() {

    const body =
        $("exportPreviewBody");


    const count =
        $("exportDataCount");


    const button =
        $("exportExcelButton");


    if (!body) {

        return;

    }


    if (count) {

        count.textContent =
            exportRows.length
                .toLocaleString(
                    "th-TH"
                );

    }


    if (!exportRows.length) {

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


        if (button) {

            button.disabled =
                true;

        }


        return;

    }


    body.innerHTML =

        exportRows

            .slice(
                0,
                50
            )

            .map(
                row => {

                    return `

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
                                    row.device_id
                                )}
                            </td>


                            <td>
                                ${fmt(row.pm1)}
                            </td>


                            <td>
                                ${fmt(row.pm25)}
                            </td>


                            <td>
                                ${fmt(row.pm10)}
                            </td>


                            <td>
                                ${fmt(row.temperature)}
                            </td>


                            <td>
                                ${fmt(row.humidity)}
                            </td>


                            <td>
                                ${fmt(row.light)}
                            </td>

                        </tr>

                    `;

                }
            )

            .join("");


    if (button) {

        button.disabled =
            false;

    }

}


/* =========================================================
   REFRESH EXPORT PREVIEW
   ========================================================= */

async function refreshExportPreview() {

    showExportError(
        ""
    );


    exportRows = [];


    setExportLoading(
        true
    );


    try {

        exportRows =
            await loadExportRows();


        renderExportPreview();

    }

    catch (error) {

        console.error(
            "Export error:",
            error
        );


        showExportError(
            error.message
        );


        const body =
            $("exportPreviewBody");


        if (body) {

            body.innerHTML = `

                <tr>

                    <td
                        colspan="8"
                        class="export-empty-cell"
                    >
                        ไม่สามารถแสดงตัวอย่างข้อมูลได้
                    </td>

                </tr>

            `;

        }

    }

    finally {

        setExportLoading(
            false
        );

    }

}


/* =========================================================
   EXPORT MODAL
   ========================================================= */

function openExportModal() {

    const selected =
        getSelectedTimeWindow();


    const now =
        new Date();


    const end =
        selected?.end ||
        now;


    const start =
        selected?.start ||
        new Date(
            now.getTime() -
            86400000
        );


    const startInput =
        $("exportStartDate");


    const endInput =
        $("exportEndDate");


    if (startInput) {

        startInput.value =
            dateToInputValue(
                start
            );

    }


    if (endInput) {

        endInput.value =
            dateToInputValue(
                end
            );

    }


    exportRows =
        [];


    const count =
        $("exportDataCount");


    if (count) {

        count.textContent =
            "0";

    }


    showExportError(
        ""
    );


    const modal =
        $("exportModal");


    if (modal) {

        modal.classList.add(
            "active"
        );


        modal.setAttribute(
            "aria-hidden",
            "false"
        );

    }


    document.body
        .classList
        .add(
            "export-modal-open"
        );


    refreshExportPreview();

}


function closeExportModal() {

    const modal =
        $("exportModal");


    if (modal) {

        modal.classList.remove(
            "active"
        );


        modal.setAttribute(
            "aria-hidden",
            "true"
        );

    }


    document.body
        .classList
        .remove(
            "export-modal-open"
        );

}


/* =========================================================
   DOWNLOAD EXCEL
   ========================================================= */

function downloadExportExcel() {

    if (!exportRows.length) {

        showExportError(
            "ไม่มีข้อมูลสำหรับดาวน์โหลด"
        );


        return;

    }


    if (
        typeof XLSX ===
        "undefined"
    ) {

        showExportError(
            "ไม่สามารถโหลดระบบสร้าง Excel ได้"
        );


        return;

    }


    const data =
        exportRows.map(
            row => {

                return {

                    "วันที่ / เวลา":
                        formatExportDate(
                            row.timestamp
                        ),


                    "อุปกรณ์":
                        row.device_id ||
                        "",


                    "PM1.0 (µg/m³)":
                        row.pm1 ??
                        "",


                    "PM2.5 (µg/m³)":
                        row.pm25 ??
                        "",


                    "PM10 (µg/m³)":
                        row.pm10 ??
                        "",


                    "อุณหภูมิ (°C)":
                        row.temperature ??
                        "",


                    "ความชื้น (%)":
                        row.humidity ??
                        "",


                    "แสง (lux)":
                        row.light ??
                        ""

                };

            }
        );


    const worksheet =
        XLSX.utils
            .json_to_sheet(
                data
            );


    worksheet[
        "!cols"
    ] = [

        {
            wch:
                22
        },

        {
            wch:
                16
        },

        {
            wch:
                15
        },

        {
            wch:
                15
        },

        {
            wch:
                15
        },

        {
            wch:
                16
        },

        {
            wch:
                16
        },

        {
            wch:
                14
        }

    ];


    const workbook =
        XLSX.utils
            .book_new();


    XLSX.utils
        .book_append_sheet(

            workbook,

            worksheet,

            "PM2.5 Data"

        );


    XLSX.writeFile(

        workbook,

        "PM25_"

        +

        (
            $("exportStartDate")
                ?.value
            ||
            "start"
        )

        +

        "_to_"

        +

        (
            $("exportEndDate")
                ?.value
            ||
            "end"
        )

        +

        ".xlsx"

    );

}


/* =========================================================
   HELP CONTENT
   ========================================================= */

const HELP_CONTENT = {

    monitoring: {

        title:
            "Monitoring Nodes",


        html: `

            <p>
                แสดงสถานะและค่าตรวจวัดล่าสุดของอุปกรณ์ทั้ง 3 จุด
                โดยค่าบนการ์ดเป็นค่าล่าสุดที่ระบบเคยได้รับ
            </p>


            <div class="help-status-list">

                <div>

                    <span
                        class="
                            help-status-dot
                            online
                        "
                    ></span>

                    <b>
                        ONLINE
                    </b>

                    <span>
                        อุปกรณ์กำลังเชื่อมต่อและส่งข้อมูล
                    </span>

                </div>


                <div>

                    <span
                        class="
                            help-status-dot
                            sleep
                        "
                    ></span>

                    <b>
                        SLEEP
                    </b>

                    <span>
                        อุปกรณ์อยู่ในโหมดพักตามรอบการทำงาน
                    </span>

                </div>


                <div>

                    <span
                        class="
                            help-status-dot
                            offline
                        "
                    ></span>

                    <b>
                        OFFLINE
                    </b>

                    <span>
                        ระบบไม่สามารถยืนยันการเชื่อมต่อได้
                    </span>

                </div>

            </div>


            <p>
                <b>Last update</b>
                คือเวลาของข้อมูลหรือสถานะล่าสุดที่ระบบได้รับ
            </p>


            <p>
                Gateway คืออุปกรณ์แม่ที่เชื่อม
                ESP-NOW เข้ากับระบบ Cloud
            </p>


            <p class="help-muted">
                เมื่อ Gateway Offline
                ระบบจะถือว่าอุปกรณ์ลูกทุกตัว Offline
                จนกว่าจะสามารถยืนยันการเชื่อมต่อได้อีกครั้ง
            </p>

        `

    },


    smartSummary: {

        title:
            "Smart Summary",


        html: `

            <p>
                สรุปสถานการณ์อัตโนมัติจากกฎของระบบ
                เช่น Gateway,
                สถานะอุปกรณ์
                และ PM2.5 ภาพรวม
            </p>


            <p>
                ส่วนนี้เป็น
                <b>Rule-based</b>
                และยังไม่ใช่ AI
            </p>

        `

    },


    currentAir: {

        title:
            "คุณภาพอากาศและสภาพแวดล้อมปัจจุบัน",


        html: `

            <p>
                ส่วนนี้ใช้สำหรับดูค่าตรวจวัดล่าสุดจากอุปกรณ์ที่ระบบยืนยันว่ากำลังใช้งาน
            </p>


            <p>
                สามารถเลือกดูได้ 6 ตัวแปร ได้แก่
                <b>
                    PM1.0,
                    PM2.5,
                    PM10,
                    อุณหภูมิ,
                    ความชื้น
                    และแสง
                </b>
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
                จะไม่เปลี่ยนตัวแปรใน
                Historical Data & Trend
            </p>


            <p class="help-muted">
                หาก Gateway Offline
                ระบบจะไม่ใช้ค่าที่ค้างอยู่ในฐานข้อมูล
                มาประเมินเป็นสถานการณ์ปัจจุบัน
            </p>

        `

    },


    alerts: {

        title:
            "Alerts",


        html: `

            <p>
                แสดงรายการที่ระบบเห็นว่าควรตรวจสอบ
                เช่น Gateway Offline,
                Node Offline
                หรือค่าจากเซนเซอร์ที่เข้าเกณฑ์เฝ้าระวัง
            </p>


            <p>
                Alert ของค่าตรวจวัดอ่านสถานะจาก Worker
                เพื่อให้กฎของ Dashboard
                และ Telegram ใช้ข้อมูลชุดเดียวกัน
            </p>


            <p class="help-muted">
                SLEEP เป็นสถานะการทำงานปกติ
                จึงไม่ถือเป็น OFFLINE
            </p>

        `

    },


    historical: {

        title:
            "Historical Data & Trend",


        html: `

            <p>
                ใช้ดูข้อมูลย้อนหลังตามตัวแปรและช่วงเวลาที่เลือก
            </p>


            <ul>

                <li>
                    เลือก PM1.0,
                    PM2.5,
                    PM10,
                    อุณหภูมิ,
                    ความชื้น
                    หรือแสง
                </li>


                <li>
                    ดูค่าเฉลี่ย,
                    สูงสุด,
                    ต่ำสุด,
                    ค่าล่าสุด
                    และแนวโน้ม
                </li>


                <li>
                    เลือกช่วงเวลาสำเร็จรูป
                    หรือกำหนด Start / End เองได้
                </li>


                <li>
                    ส่งออกข้อมูลเป็น Excel ได้
                </li>

            </ul>


            <p class="help-muted">
                การเลือกตัวแปรในส่วนนี้
                ไม่เปลี่ยนตัวแปรในส่วนข้อมูลปัจจุบัน
            </p>

        `

    },


    forecast: {

        title:
            "Forecast",


        html: `

            <p>
                คาดการณ์ระยะสั้นจากข้อมูลย้อนหลังล่าสุด
                ของตัวแปรที่เลือกใน Historical Data & Trend
            </p>


            <p>
                ระบบใช้ Linear Regression
                และค่าความคลาดเคลื่อนของข้อมูลล่าสุด
                เพื่อประมาณช่วงในอีก 30 นาที
            </p>


            <p class="help-muted">
                Forecast ปัจจุบันเป็นวิธีทางสถิติ
                ไม่ใช่ AI/ML
                และไม่ใช่ค่าที่เซนเซอร์วัดจริงในอนาคต
            </p>

        `

    },


    ai: {

        title:
            "AI วิเคราะห์สถานการณ์",


        html: `

            <p>
                ส่วนนี้เตรียมไว้สำหรับ AI
                ที่จะวิเคราะห์ข้อมูลหลายส่วนร่วมกัน
                เช่น ค่าปัจจุบัน,
                Alerts,
                Historical Data & Trend
                และ Forecast
            </p>


            <p>
                ปัจจุบันยังไม่ได้เชื่อม AI API
                ดังนั้นส่วนนี้ยังไม่มีผลวิเคราะห์จาก AI จริง
            </p>

        `

    }

};


/* =========================================================
   HELP HTML
   ========================================================= */

function getHelpHtml(key) {

    return (
        HELP_CONTENT[
            key
        ]?.html
        ||
        ""
    );

}


/* =========================================================
   HELP POSITION
   ========================================================= */

function positionHelpPopover(
    button
) {

    const popover =
        $("helpPopover");


    if (
        !popover ||
        !button
    ) {

        return;

    }


    const rect =
        button
            .getBoundingClientRect();


    const margin =
        12;


    const gap =
        10;


    const width =
        Math.min(

            390,

            window.innerWidth

            -

            margin *
            2

        );


    popover.style.width =
        width +
        "px";


    popover.style.visibility =
        "hidden";


    popover.classList.add(
        "active"
    );


    const popoverRect =
        popover
            .getBoundingClientRect();


    let left =
        rect.right -
        popoverRect.width;


    left =
        Math.max(

            margin,

            Math.min(

                left,

                window.innerWidth

                -

                popoverRect.width

                -

                margin

            )

        );


    let top =
        rect.bottom +
        gap;


    if (
        top +
        popoverRect.height

        >

        window.innerHeight -
        margin
    ) {

        top =

            rect.top

            -

            popoverRect.height

            -

            gap;

    }


    top =
        Math.max(
            margin,
            top
        );


    popover.style.left =
        left +
        "px";


    popover.style.top =
        top +
        "px";


    popover.style.visibility =
        "visible";

}


/* =========================================================
   CLOSE HELP
   ========================================================= */

function closeHelpPopover() {

    const popover =
        $("helpPopover");


    if (popover) {

        popover.classList.remove(
            "active"
        );


        popover.style.visibility =
            "";


        popover.setAttribute(
            "aria-hidden",
            "true"
        );

    }


    if (activeHelpButton) {

        activeHelpButton
            .classList
            .remove(
                "is-active"
            );


        activeHelpButton
            .setAttribute(
                "aria-expanded",
                "false"
            );

    }


    activeHelpButton =
        null;

}


/* =========================================================
   OPEN HELP
   ========================================================= */

function openHelpPopover(
    button
) {

    const key =
        button
        ?.dataset
        ?.help;


    const content =
        HELP_CONTENT[
            key
        ];


    if (!content) {

        return;

    }


    if (

        activeHelpButton ===
        button

        &&

        $("helpPopover")
        ?.classList
        .contains(
            "active"
        )

    ) {

        closeHelpPopover();


        return;

    }


    closeHelpPopover();


    activeHelpButton =
        button;


    button.classList.add(
        "is-active"
    );


    button.setAttribute(
        "aria-expanded",
        "true"
    );


    const title =
        $("helpPopoverTitle");


    const body =
        $("helpPopoverBody");


    const popover =
        $("helpPopover");


    if (title) {

        title.textContent =
            content.title;

    }


    if (body) {

        body.innerHTML =
            getHelpHtml(
                key
            );

    }


    if (popover) {

        popover.setAttribute(
            "aria-hidden",
            "false"
        );

    }


    positionHelpPopover(
        button
    );

}


/* =========================================================
   BIND HELP
   ========================================================= */

function bindHelpSystem() {

    document
        .querySelectorAll(
            ".help-button"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();


                        openHelpPopover(
                            button
                        );

                    }
                );

            }
        );


    const close =
        $("helpPopoverClose");


    if (close) {

        close.addEventListener(
            "click",
            event => {

                event.stopPropagation();


                closeHelpPopover();

            }
        );

    }


    const popover =
        $("helpPopover");


    if (popover) {

        popover.addEventListener(
            "click",
            event =>
                event.stopPropagation()
        );

    }


    document.addEventListener(
        "click",
        closeHelpPopover
    );


    window.addEventListener(
        "resize",
        () => {

            if (
                activeHelpButton
            ) {

                positionHelpPopover(
                    activeHelpButton
                );

            }

        }
    );


    window.addEventListener(
        "scroll",
        () => {

            if (
                activeHelpButton
            ) {

                positionHelpPopover(
                    activeHelpButton
                );

            }

        },
        true
    );

}


/* =========================================================
   DASHBOARD EVENTS
   ========================================================= */

function bindDashboardEvents() {

    /* =====================================================
       CURRENT METRIC
       ===================================================== */

    const currentMetricSelect =
        $("currentMetric");


    if (currentMetricSelect) {

        /*
         * ให้ Select ตรงกับ State
         */
        currentMetricSelect.value =
            currentMetric;


        const applyCurrentMetric =
            () => {

                currentMetric =

                    currentMetricSelect.value

                    ||

                    "pm25";


                /*
                 * เปลี่ยนชื่อก่อน
                 *
                 * ต่อให้ Gateway Offline
                 */
                syncCurrentMetricUI();


                updateCurrentAirQuality();

            };


        /*
         * รองรับทั้ง Desktop และ Mobile
         */
        currentMetricSelect
            .addEventListener(
                "change",
                applyCurrentMetric
            );


        currentMetricSelect
            .addEventListener(
                "input",
                applyCurrentMetric
            );

    }


    /* =====================================================
       HISTORICAL METRIC
       ===================================================== */

    const historicalMetric =
        $("metric");


    if (historicalMetric) {

        historicalMetric
            .addEventListener(
                "change",
                event => {

                    metric =
                        event.target.value;


                    drawCharts();

                }
            );

    }


    /* =====================================================
       HISTORY RANGE BUTTON
       ===================================================== */

    const historyRangeButton =
        $("historyRangeButton");


    if (historyRangeButton) {

        historyRangeButton
            .addEventListener(
                "click",
                event => {

                    event.stopPropagation();


                    const panel =
                        $("historyRangePanel");


                    if (!panel) {

                        return;

                    }


                    if (
                        panel.classList
                            .contains(
                                "hidden"
                            )
                    ) {

                        openHistoryRangePicker();

                    }

                    else {

                        closeHistoryRangePicker();

                    }

                }
            );

    }


    /* =====================================================
       QUICK RANGES
       ===================================================== */

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


    /* =====================================================
       CALENDAR PREV
       ===================================================== */

    const calendarPrev =
        $("calendarPrev");


    if (calendarPrev) {

        calendarPrev.addEventListener(
            "click",
            () => {

                calendarDisplayDate =
                    new Date(

                        calendarDisplayDate
                            .getFullYear(),

                        calendarDisplayDate
                            .getMonth() -
                        1,

                        1

                    );


                renderRangeCalendar();

            }
        );

    }


    /* =====================================================
       CALENDAR NEXT
       ===================================================== */

    const calendarNext =
        $("calendarNext");


    if (calendarNext) {

        calendarNext.addEventListener(
            "click",
            () => {

                calendarDisplayDate =
                    new Date(

                        calendarDisplayDate
                            .getFullYear(),

                        calendarDisplayDate
                            .getMonth() +
                        1,

                        1

                    );


                renderRangeCalendar();

            }
        );

    }


    /* =====================================================
       CUSTOM INPUTS
       ===================================================== */

    const customStart =
        $("customRangeStart");


    if (customStart) {

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


    if (customEnd) {

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


    /* =====================================================
       APPLY RANGE
       ===================================================== */

    const rangeApply =
        $("historyRangeApply");


    if (rangeApply) {

        rangeApply.addEventListener(
            "click",
            applyHistoryRange
        );

    }


    const rangeCancel =
        $("historyRangeCancel");


    if (rangeCancel) {

        rangeCancel.addEventListener(
            "click",
            closeHistoryRangePicker
        );

    }


    /* =====================================================
       FORECAST
       ===================================================== */

    const forecastToggle =
        $("forecastToggle");


    if (forecastToggle) {

        forecastToggle.addEventListener(
            "click",
            () => {

                forecastVisible =
                    !forecastVisible;


                setForecastDatasetVisibility();

            }
        );

    }


    /* =====================================================
       EXPORT
       ===================================================== */

    const exportButton =
        $("exportButton");


    if (exportButton) {

        exportButton.addEventListener(
            "click",
            openExportModal
        );

    }


    const exportClose =
        $("exportModalClose");


    if (exportClose) {

        exportClose.addEventListener(
            "click",
            closeExportModal
        );

    }


    const exportCancel =
        $("exportCancelButton");


    if (exportCancel) {

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


    if (exportStart) {

        exportStart.addEventListener(
            "change",
            refreshExportPreview
        );

    }


    const exportEnd =
        $("exportEndDate");


    if (exportEnd) {

        exportEnd.addEventListener(
            "change",
            refreshExportPreview
        );

    }


    const exportExcel =
        $("exportExcelButton");


    if (exportExcel) {

        exportExcel.addEventListener(
            "click",
            downloadExportExcel
        );

    }


    /* =====================================================
       ESCAPE
       ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key !==
                "Escape"
            ) {

                return;

            }


            closeExportModal();


            closeHistoryRangePicker();


            closeHelpPopover();


            const creditModal =
                $("creditImageModal");


            if (
                creditModal
                ?.classList
                .contains(
                    "active"
                )
            ) {

                closeCreditImage();

            }

        }
    );

}


/* =========================================================
   MAIN LOAD
   ========================================================= */

async function load() {

    try {

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


        /*
         * API หลักใช้งานได้
         */
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


        /* =================================================
           RENDER
           ================================================= */

        renderMonitoringNodes();


        /*
         * Current Environment
         */
        updateCurrentAirQuality();


        /*
         * Smart Summary
         */
        updateSmartSummary();


        /*
         * Alerts
         */
        updateAlerts();


        /*
         * Historical averages
         */
        renderAverages();


        /*
         * Historical + Forecast
         */
        drawCharts();

    }

    catch (error) {

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


        updateSmartSummary();


        updateAlerts();

    }

}


/* =========================================================
   CLOCK
   ========================================================= */

function updateClock() {

    const clock =
        $("clock");


    if (!clock) {

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


/* =========================================================
   CREDIT IMAGE MODAL
   ========================================================= */

function openCreditImage(
    imageSrc,
    imageAlt
) {

    const modal =
        $("creditImageModal");


    const image =
        $("creditFullImage");


    const caption =
        $("creditImageCaption");


    if (
        !modal ||
        !image
    ) {

        return;

    }


    image.src =
        imageSrc;


    image.alt =
        imageAlt ||
        "";


    if (caption) {

        caption.textContent =
            imageAlt ||
            "";

    }


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


function closeCreditImage() {

    const modal =
        $("creditImageModal");


    if (!modal) {

        return;

    }


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
        () => {

            const image =
                $("creditFullImage");


            if (image) {

                image.src =
                    "";

            }

        },

        200
    );

}


/* =========================================================
   INITIAL UI
   ========================================================= */

const historyRangeLabel =
    $("historyRangeButtonLabel");


if (historyRangeLabel) {

    historyRangeLabel.textContent =
        getRangeLabel();

}


/*
 * Forecast button
 */
updateForecastToggleUI();


/*
 * Bind events
 */
bindDashboardEvents();


/*
 * Help
 */
bindHelpSystem();


/*
 * สำคัญ:
 *
 * 1. เปลี่ยนชื่อ PM2.5 ภาพรวม
 *    ตาม Dropdown
 *
 * 2. ลบ icon ◎ ↑ !
 */
syncCurrentMetricUI();


/*
 * Clock
 */
updateClock();


/*
 * Initial Load
 */
load();


/* =========================================================
   TIMERS
   ========================================================= */

/*
 * Clock
 */
setInterval(
    updateClock,
    1000
);


/*
 * Reload API
 *
 * Latest + History + Status
 */
setInterval(
    load,
    10000
);


/*
 * Lightweight UI refresh
 */
setInterval(
    () => {

        /*
         * Dropdown อาจถูกเปลี่ยนจาก browser
         * จึง sync ทุกครั้ง
         */
        syncCurrentMetricUI();


        if (
            apiConnectionOnline
        ) {

            renderMonitoringNodes();


            updateCurrentAirQuality();


            updateSmartSummary();


            updateAlerts();

        }

        else {

            forceAllNodesOffline();


            updateCurrentAirQuality();

        }

    },

    5000
);
