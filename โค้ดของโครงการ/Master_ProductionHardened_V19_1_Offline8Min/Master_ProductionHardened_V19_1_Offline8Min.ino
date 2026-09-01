#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_wifi.h>
#include <esp_now.h>

// =====================================================
// STATUS LED - MOTHER
// Green LED: GPIO 22
// Searching/reconnecting WiFi = blink
// WiFi connected = solid ON
// =====================================================
#define LED_GREEN 22

// LED wiring is Active LOW:
// LOW  = ON, HIGH = OFF
#define LED_ON  LOW
#define LED_OFF HIGH

const unsigned long LED_BLINK_INTERVAL_MS = 300UL;
unsigned long lastLedBlinkMillis = 0;
bool ledBlinkState = false;

// =====================================================
// WIFI
// =====================================================

const char* ssid = "Wat_Niwet_Guest";
const char* password = "";

// =====================================================
// CLOUDFLARE
// =====================================================

const char* API_URL =
  "https://educational-pm25-api.project2026csemn.workers.dev/api/save.php";

const char* HEARTBEAT_URL =
  "https://educational-pm25-api.project2026csemn.workers.dev/api/mother/heartbeat";

// =====================================================
// OPTIONAL DEVICE INGEST AUTH
//
// แนะนำให้ตั้ง Cloudflare Secret ชื่อ DEVICE_INGEST_KEY
// แล้วใส่ค่าเดียวกันที่นี่ก่อนนำระบบขึ้นใช้งานจริง
//
// ถ้าปล่อยว่าง Worker จะยังรองรับโหมดเดิมจนกว่าจะตั้ง Secret
// =====================================================
const char* DEVICE_INGEST_KEY = "";

// =====================================================
// HTTPS
// =====================================================

WiFiClientSecure secureClient;

// HTTP result from latest cloud request
int lastHttpCode = 0;

// =====================================================
// DISCOVERY
// =====================================================

#define DISCOVERY_REQUEST  0xA5
#define DISCOVERY_RESPONSE 0xA6

// =====================================================
// STATUS
// =====================================================

#define STATUS_OFFLINE 0
#define STATUS_ONLINE  1
#define STATUS_SLEEP   2

// =====================================================
// SYSTEM TIME
// =====================================================

// ลูกหลับจริง 5 นาที
const unsigned long DEEP_SLEEP_SECONDS = 300;

// รอบใหม่:
// ลูกตื่น -> ONLINE -> เก็บ Sensor 1 นาที -> ส่งค่าเฉลี่ย
// -> SLEEP -> Deep Sleep 5 นาที
//
// ตอน SLEEP แม่รอ 5 นาที + Grace 3 นาที
// รวมสูงสุด 8 นาที ถ้ายังไม่เห็น ONLINE รอบใหม่จึง OFFLINE
const unsigned long GRACE_PERIOD_MS =
  3UL * 60UL * 1000UL;

const unsigned long NODE_OFFLINE_TIMEOUT_MS =
  8UL * 60UL * 1000UL;

// Mother Heartbeat ทุก 20 วินาที
const unsigned long HEARTBEAT_INTERVAL_MS = 20000UL;

unsigned long lastHeartbeatMillis = 0;

// =====================================================
// SENSOR STRUCT
// ต้องตรงกับลูก 100%
// =====================================================

typedef struct {

  char deviceID[20];

  float temperature;
  float humidity;

  int pm1;
  int pm25;
  int pm10;

  float light;

  // 1 = sensor read succeeded, 0 = read failed
  uint8_t am2315Valid;
  uint8_t pmsValid;
  uint8_t bh1750Valid;

} sensor_message;

// =====================================================
// STATUS STRUCT
// ต้องตรงกับลูก 100%
// =====================================================

typedef struct {

  char deviceID[20];

  uint8_t status;

} status_message;

// =====================================================
// RECEIVED DATA
// =====================================================

// =====================================================
// SENSOR RECEIVE QUEUE
//
// รองรับกรณีลูกหลายตัวเก็บครบ 1 นาทีใกล้กัน
// ไม่ให้ packet ใหม่เขียนทับ packet ก่อนหน้า
// =====================================================

// V17: 32 packets รองรับ Cloud/Wi-Fi สะดุดได้นานขึ้น
// 3 จุดส่งรวมประมาณ 1 packet ทุก ~2 นาทีโดยเฉลี่ย
const uint8_t SENSOR_QUEUE_SIZE = 32;

sensor_message sensorQueue[
  SENSOR_QUEUE_SIZE
];

volatile uint8_t sensorQueueHead = 0;
volatile uint8_t sensorQueueTail = 0;
volatile uint8_t sensorQueueCount = 0;

portMUX_TYPE dataMux =
  portMUX_INITIALIZER_UNLOCKED;

// =====================================================
// NODE STATUS
// =====================================================

volatile uint8_t node1Status = STATUS_OFFLINE;
volatile uint8_t node2Status = STATUS_OFFLINE;
volatile uint8_t node3Status = STATUS_OFFLINE;

// เวลาที่ได้รับ packet ล่าสุด
volatile unsigned long node1LastContact = 0;
volatile unsigned long node2LastContact = 0;
volatile unsigned long node3LastContact = 0;

// เวลาที่คาดว่าต้องกลับมาหลัง Sleep
volatile unsigned long node1ExpectedWake = 0;
volatile unsigned long node2ExpectedWake = 0;
volatile unsigned long node3ExpectedWake = 0;

// =====================================================
// STATUS QUEUE
// =====================================================

volatile bool status1Pending = false;
volatile bool status2Pending = false;
volatile bool status3Pending = false;

volatile uint8_t pendingStatus1 = STATUS_OFFLINE;
volatile uint8_t pendingStatus2 = STATUS_OFFLINE;
volatile uint8_t pendingStatus3 = STATUS_OFFLINE;

// =====================================================
// SENSOR QUEUE HELPERS
// =====================================================

void enqueueSensorData(
  const sensor_message& item
) {

  portENTER_CRITICAL(
    &dataMux
  );

  // ถ้าคิวเต็ม ให้ทิ้งตัวเก่าสุดเพื่อรับข้อมูลใหม่
  if (
    sensorQueueCount >=
      SENSOR_QUEUE_SIZE
  ) {

    sensorQueueTail =
      (
        sensorQueueTail + 1
      ) %
      SENSOR_QUEUE_SIZE;

    sensorQueueCount--;
  }

  memcpy(
    &sensorQueue[
      sensorQueueHead
    ],
    &item,
    sizeof(sensor_message)
  );

  sensorQueueHead =
    (
      sensorQueueHead + 1
    ) %
    SENSOR_QUEUE_SIZE;

  sensorQueueCount++;

  portEXIT_CRITICAL(
    &dataMux
  );
}

bool dequeueSensorData(
  sensor_message& item
) {

  bool hasData =
    false;

  portENTER_CRITICAL(
    &dataMux
  );

  if (
    sensorQueueCount > 0
  ) {

    memcpy(
      &item,
      &sensorQueue[
        sensorQueueTail
      ],
      sizeof(sensor_message)
    );

    sensorQueueTail =
      (
        sensorQueueTail + 1
      ) %
      SENSOR_QUEUE_SIZE;

    sensorQueueCount--;

    hasData =
      true;
  }

  portEXIT_CRITICAL(
    &dataMux
  );

  return hasData;
}

// =====================================================
// V17 CLOUD-RETRY QUEUE HELPERS
// อ่าน packet หัวคิวโดย "ยังไม่ลบ"
// ลบจริงเมื่อ Cloudflare ตอบสำเร็จเท่านั้น
// =====================================================

bool peekSensorData(
  sensor_message& item
) {

  bool hasData =
    false;

  portENTER_CRITICAL(
    &dataMux
  );

  if (
    sensorQueueCount > 0
  ) {

    memcpy(
      &item,
      &sensorQueue[
        sensorQueueTail
      ],
      sizeof(sensor_message)
    );

    hasData =
      true;
  }

  portEXIT_CRITICAL(
    &dataMux
  );

  return hasData;
}

void dropSensorData() {

  portENTER_CRITICAL(
    &dataMux
  );

  if (
    sensorQueueCount > 0
  ) {

    sensorQueueTail =
      (
        sensorQueueTail + 1
      ) %
      SENSOR_QUEUE_SIZE;

    sensorQueueCount--;
  }

  portEXIT_CRITICAL(
    &dataMux
  );
}

// =====================================================
// STATUS TEXT
// =====================================================

const char* statusToText(
  uint8_t status
) {

  if (
    status == STATUS_ONLINE
  ) {
    return "online";
  }

  if (
    status == STATUS_SLEEP
  ) {
    return "sleep";
  }

  return "offline";
}

// =====================================================
// PRINT MAC
// =====================================================

void printMacAddress(
  const uint8_t* mac
) {

  char macStr[18];

  snprintf(
    macStr,
    sizeof(macStr),
    "%02X:%02X:%02X:%02X:%02X:%02X",
    mac[0],
    mac[1],
    mac[2],
    mac[3],
    mac[4],
    mac[5]
  );

  Serial.println(macStr);
}

// =====================================================
// ADD PEER
// =====================================================

bool addPeer(
  const uint8_t* mac
) {

  if (
    esp_now_is_peer_exist(mac)
  ) {
    return true;
  }

  esp_now_peer_info_t peerInfo;

  memset(
    &peerInfo,
    0,
    sizeof(peerInfo)
  );

  memcpy(
    peerInfo.peer_addr,
    mac,
    6
  );

  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  esp_err_t result =
    esp_now_add_peer(
      &peerInfo
    );

  if (
    result == ESP_OK ||
    result == ESP_ERR_ESPNOW_EXIST
  ) {
    return true;
  }

  Serial.print(
    "❌ เพิ่ม Peer ไม่สำเร็จ: "
  );

  Serial.println(result);

  return false;
}

// =====================================================
// DISCOVERY RESPONSE
// =====================================================

void sendDiscoveryResponse(
  const uint8_t* childMac
) {

  Serial.println();
  Serial.println(
    "=== DISCOVERY ==="
  );

  Serial.print(
    "MAC ลูก: "
  );

  printMacAddress(
    childMac
  );

  Serial.print(
    "Channel แม่: "
  );

  Serial.println(
    WiFi.channel()
  );

  if (
    !addPeer(childMac)
  ) {
    return;
  }

  uint8_t response =
    DISCOVERY_RESPONSE;

  esp_err_t result =
    esp_now_send(
      childMac,
      &response,
      sizeof(response)
    );

  if (
    result == ESP_OK
  ) {

    Serial.println(
      "✅ ส่ง Discovery Response"
    );

  } else {

    Serial.print(
      "❌ Discovery Response Error: "
    );

    Serial.println(result);
  }
}

// =====================================================
// QUEUE STATUS
// =====================================================

void queueStatus(
  const char* deviceID,
  uint8_t status
) {

  if (
    strcmp(
      deviceID,
      "Number 1"
    ) == 0
  ) {

    pendingStatus1 = status;
    status1Pending = true;

  } else if (
    strcmp(
      deviceID,
      "Number 2"
    ) == 0
  ) {

    pendingStatus2 = status;
    status2Pending = true;

  } else if (
    strcmp(
      deviceID,
      "Number 3"
    ) == 0
  ) {

    pendingStatus3 = status;
    status3Pending = true;
  }
}


// =====================================================
// MOTHER LED CONTROL
// =====================================================
void updateMotherLED() {

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_GREEN, LED_ON);
    ledBlinkState = true;
    return;
  }

  unsigned long now = millis();

  if (
    lastLedBlinkMillis == 0 ||
    now - lastLedBlinkMillis >= LED_BLINK_INTERVAL_MS
  ) {
    lastLedBlinkMillis = now;
    ledBlinkState = !ledBlinkState;
    digitalWrite(LED_GREEN, ledBlinkState ? LED_ON : LED_OFF);
  }
}

// =====================================================
// WIFI
// =====================================================

bool ensureWiFiConnected() {

  if (
    WiFi.status() == WL_CONNECTED
  ) {
    return true;
  }

  Serial.println();
  Serial.println(
    "⚠ WiFi หลุด กำลังเชื่อมต่อใหม่..."
  );

  WiFi.disconnect();

  delay(100);

  WiFi.begin(
    ssid,
    password
  );

  unsigned long start =
    millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start < 10000UL
  ) {

    updateMotherLED();
    Serial.print(".");
    delay(50);
  }

  Serial.println();

  if (
    WiFi.status() != WL_CONNECTED
  ) {

    Serial.println(
      "❌ WiFi reconnect ไม่สำเร็จ"
    );

    return false;
  }

  Serial.println(
    "✅ WiFi reconnect สำเร็จ"
  );

  Serial.print(
    "Channel: "
  );

  Serial.println(
    WiFi.channel()
  );

  return true;
}

// =====================================================
// POST JSON
// =====================================================

bool postJson(
  const char* url,
  const String& json,
  bool printResponse = true
) {

  if (
    !ensureWiFiConnected()
  ) {
    lastHttpCode = -1000;
    return false;
  }

  HTTPClient http;

  if (
    !http.begin(
      secureClient,
      url
    )
  ) {

    Serial.println(
      "❌ http.begin() ไม่สำเร็จ"
    );

    lastHttpCode = -1001;
    return false;
  }

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  if (
    DEVICE_INGEST_KEY != nullptr &&
    strlen(
      DEVICE_INGEST_KEY
    ) > 0
  ) {

    http.addHeader(
      "X-Device-Key",
      DEVICE_INGEST_KEY
    );
  }

  http.setTimeout(
    10000
  );

  int code =
    http.POST(
      json
    );

  lastHttpCode =
    code;

  bool ok =
    code >= 200 &&
    code < 300;

  if (
    printResponse
  ) {

    Serial.print(
      "HTTP Status: "
    );

    Serial.println(code);

    if (
      code > 0
    ) {

      String response =
        http.getString();

      Serial.print(
        "API Response: "
      );

      Serial.println(
        response
      );

    } else {

      Serial.print(
        "HTTP Error: "
      );

      Serial.println(
        http.errorToString(
          code
        )
      );
    }
  }

  http.end();

  return ok;
}

// Permanent client errors should not block the queue forever.
// 408 / 425 / 429 are treated as temporary and will be retried.
bool isPermanentHttpFailure() {

  return
    lastHttpCode >= 400 &&
    lastHttpCode < 500 &&
    lastHttpCode != 408 &&
    lastHttpCode != 425 &&
    lastHttpCode != 429;
}

// =====================================================
// MOTHER HEARTBEAT
// =====================================================

bool sendMotherHeartbeat() {

  String json =
    "{\"status\":\"online\"}";

  bool ok =
    postJson(
      HEARTBEAT_URL,
      json,
      false
    );

  if (
    ok
  ) {

    Serial.println(
      "💓 Mother Heartbeat OK"
    );

  } else {

    Serial.println(
      "⚠ Mother Heartbeat Failed"
    );
  }

  return ok;
}

// =====================================================
// SEND SENSOR TO CLOUD
// =====================================================

bool sendSensorToCloudflare(const sensor_message& data){
  String json="{";
  json+="\"device_id\":\"";
  json+=data.deviceID;
  json+="\",\"status\":\"online\",";
  json+="\"pm1\":";
  json+=data.pmsValid?String(data.pm1):"null";
  json+=",\"pm25\":";
  json+=data.pmsValid?String(data.pm25):"null";
  json+=",\"pm10\":";
  json+=data.pmsValid?String(data.pm10):"null";
  json+=",\"temperature\":";
  json+=data.am2315Valid?String(data.temperature,2):"null";
  json+=",\"humidity\":";
  json+=data.am2315Valid?String(data.humidity,2):"null";
  json+=",\"light\":";
  json+=data.bh1750Valid?String(data.light,2):"null";
  json+="}";
  Serial.println();
  Serial.println("=== CLOUDFLARE SENSOR ===");
  Serial.println(json);
  bool ok=
    postJson(
      API_URL,
      json,
      true
    );

  Serial.println("=========================");

  return ok;
}

// =====================================================
// SEND STATUS TO CLOUD
//
// ไม่มี pm1=0 / pm25=0 ฯลฯ อีก
// =====================================================

bool sendStatusToCloudflare(
  const char* deviceID,
  const char* status
) {

  String json = "{";

  json += "\"device_id\":\"";
  json += deviceID;
  json += "\",";

  json += "\"status\":\"";
  json += status;
  json += "\"";

  json += "}";

  Serial.println();
  Serial.println(
    "=== CLOUDFLARE STATUS ==="
  );

  Serial.println(json);

  bool ok=
    postJson(
      API_URL,
      json,
      true
    );

  Serial.println(
    "========================="
  );

  return ok;
}

// =====================================================
// ESP-NOW RECEIVE
// =====================================================

void OnDataRecv(
  const esp_now_recv_info_t* info,
  const uint8_t* rawData,
  int len
) {

  if (
    info == nullptr ||
    rawData == nullptr
  ) {
    return;
  }

  // ===================================================
  // DISCOVERY
  // ===================================================

  if (
    len == 1 &&
    rawData[0] == DISCOVERY_REQUEST
  ) {

    sendDiscoveryResponse(
      info->src_addr
    );

    return;
  }

  // ===================================================
  // STATUS
  //
  // ONLINE = ลูกตื่นและกำลังเก็บข้อมูล 1 นาที
  // SLEEP  = ลูกส่งข้อมูลเสร็จและกำลัง Deep Sleep 5 นาที
  // ===================================================

  if (
    len == sizeof(status_message)
  ) {

    status_message s;

    memcpy(
      &s,
      rawData,
      sizeof(s)
    );

    s.deviceID[
      sizeof(s.deviceID) - 1
    ] = '\0';

    unsigned long now =
      millis();

    // ---------------------------------------------------
    // ONLINE
    // ---------------------------------------------------

    if (
      s.status == STATUS_ONLINE
    ) {

      if (
        strcmp(
          s.deviceID,
          "Number 1"
        ) == 0
      ) {

        node1Status =
          STATUS_ONLINE;

        node1LastContact =
          now;

        node1ExpectedWake =
          0;

      } else if (
        strcmp(
          s.deviceID,
          "Number 2"
        ) == 0
      ) {

        node2Status =
          STATUS_ONLINE;

        node2LastContact =
          now;

        node2ExpectedWake =
          0;

      } else if (
        strcmp(
          s.deviceID,
          "Number 3"
        ) == 0
      ) {

        node3Status =
          STATUS_ONLINE;

        node3LastContact =
          now;

        node3ExpectedWake =
          0;

      } else {

        return;
      }

      queueStatus(
        s.deviceID,
        STATUS_ONLINE
      );

      Serial.println();
      Serial.print(
        "🟢 "
      );

      Serial.print(
        s.deviceID
      );

      Serial.println(
        " → ONLINE / กำลังเก็บ Sensor 1 นาที"
      );

      return;
    }

    // ---------------------------------------------------
    // SLEEP
    // ---------------------------------------------------

    if (
      s.status == STATUS_SLEEP
    ) {

      unsigned long expectedWake =
        now +
        (
          DEEP_SLEEP_SECONDS *
          1000UL
        ) +
        GRACE_PERIOD_MS;

      if (
        strcmp(
          s.deviceID,
          "Number 1"
        ) == 0
      ) {

        node1Status =
          STATUS_SLEEP;

        node1LastContact =
          now;

        node1ExpectedWake =
          expectedWake;

      } else if (
        strcmp(
          s.deviceID,
          "Number 2"
        ) == 0
      ) {

        node2Status =
          STATUS_SLEEP;

        node2LastContact =
          now;

        node2ExpectedWake =
          expectedWake;

      } else if (
        strcmp(
          s.deviceID,
          "Number 3"
        ) == 0
      ) {

        node3Status =
          STATUS_SLEEP;

        node3LastContact =
          now;

        node3ExpectedWake =
          expectedWake;

      } else {

        return;
      }

      queueStatus(
        s.deviceID,
        STATUS_SLEEP
      );

      Serial.println();
      Serial.print(
        "🟡 "
      );

      Serial.print(
        s.deviceID
      );

      Serial.println(
        " → SLEEP 5 นาที"
      );

      return;
    }

    return;
  }

  // ===================================================
  // SENSOR
  // ===================================================

  if (
    len != sizeof(sensor_message)
  ) {

    Serial.print(
      "⚠ Packet size ไม่ตรง: "
    );

    Serial.println(len);

    return;
  }

  sensor_message temp;

  memcpy(
    &temp,
    rawData,
    sizeof(temp)
  );

  temp.deviceID[
    sizeof(temp.deviceID) - 1
  ] = '\0';

  unsigned long now =
    millis();

  // ===================================================
  // NODE ONLINE
  // ===================================================

  if (
    strcmp(
      temp.deviceID,
      "Number 1"
    ) == 0
  ) {

    node1Status =
      STATUS_ONLINE;

    node1LastContact =
      now;

    node1ExpectedWake =
      0;

  } else if (
    strcmp(
      temp.deviceID,
      "Number 2"
    ) == 0
  ) {

    node2Status =
      STATUS_ONLINE;

    node2LastContact =
      now;

    node2ExpectedWake =
      0;

  } else if (
    strcmp(
      temp.deviceID,
      "Number 3"
    ) == 0
  ) {

    node3Status =
      STATUS_ONLINE;

    node3LastContact =
      now;

    node3ExpectedWake =
      0;

  } else {

    Serial.println(
      "⚠ Device ID ไม่รู้จัก"
    );

    return;
  }

  // ไม่จำเป็นต้อง queue online แยก
  // เพราะ sensor packet จะถูกส่งเป็น status online อยู่แล้ว

  enqueueSensorData(
    temp
  );

  Serial.println();
  Serial.println(
    "================================"
  );

  Serial.print(
    "🟢 ONLINE: "
  );

  Serial.println(
    temp.deviceID
  );

  Serial.print(
    "PM1.0: "
  );
  Serial.println(temp.pm1);

  Serial.print(
    "PM2.5: "
  );
  Serial.println(temp.pm25);

  Serial.print(
    "PM10: "
  );
  Serial.println(temp.pm10);

  Serial.print(
    "Temperature: "
  );
  Serial.println(
    temp.temperature,
    2
  );

  Serial.print(
    "Humidity: "
  );
  Serial.println(
    temp.humidity,
    2
  );

  Serial.print(
    "Light: "
  );
  Serial.println(
    temp.light,
    2
  );

  Serial.println(
    "================================"
  );
}

// =====================================================
// MARK NODE OFFLINE
// =====================================================

void markNodeOffline(
  uint8_t number
) {

  if (
    number == 1
  ) {

    if (
      node1Status == STATUS_OFFLINE
    ) {
      return;
    }

    node1Status =
      STATUS_OFFLINE;

    node1ExpectedWake = 0;

    queueStatus(
      "Number 1",
      STATUS_OFFLINE
    );

    Serial.println(
      "🔴 Number 1 OFFLINE"
    );

  } else if (
    number == 2
  ) {

    if (
      node2Status == STATUS_OFFLINE
    ) {
      return;
    }

    node2Status =
      STATUS_OFFLINE;

    node2ExpectedWake = 0;

    queueStatus(
      "Number 2",
      STATUS_OFFLINE
    );

    Serial.println(
      "🔴 Number 2 OFFLINE"
    );

  } else if (
    number == 3
  ) {

    if (
      node3Status == STATUS_OFFLINE
    ) {
      return;
    }

    node3Status =
      STATUS_OFFLINE;

    node3ExpectedWake = 0;

    queueStatus(
      "Number 3",
      STATUS_OFFLINE
    );

    Serial.println(
      "🔴 Number 3 OFFLINE"
    );
  }
}

// =====================================================
// CHECK NODE TIMEOUT
// =====================================================

void checkNodeStatus() {

  unsigned long now =
    millis();

  // ===================================================
  // NUMBER 1
  // ===================================================

  if (
    node1Status == STATUS_SLEEP
  ) {

    if (
      node1ExpectedWake != 0 &&
      (long)(
        now -
        node1ExpectedWake
      ) >= 0
    ) {

      markNodeOffline(1);
    }

  } else if (
    node1Status == STATUS_ONLINE &&
    node1LastContact != 0 &&
    now - node1LastContact >=
      NODE_OFFLINE_TIMEOUT_MS
  ) {

    markNodeOffline(1);
  }

  // ===================================================
  // NUMBER 2
  // ===================================================

  if (
    node2Status == STATUS_SLEEP
  ) {

    if (
      node2ExpectedWake != 0 &&
      (long)(
        now -
        node2ExpectedWake
      ) >= 0
    ) {

      markNodeOffline(2);
    }

  } else if (
    node2Status == STATUS_ONLINE &&
    node2LastContact != 0 &&
    now - node2LastContact >=
      NODE_OFFLINE_TIMEOUT_MS
  ) {

    markNodeOffline(2);
  }

  // ===================================================
  // NUMBER 3
  // ===================================================

  if (
    node3Status == STATUS_SLEEP
  ) {

    if (
      node3ExpectedWake != 0 &&
      (long)(
        now -
        node3ExpectedWake
      ) >= 0
    ) {

      markNodeOffline(3);
    }

  } else if (
    node3Status == STATUS_ONLINE &&
    node3LastContact != 0 &&
    now - node3LastContact >=
      NODE_OFFLINE_TIMEOUT_MS
  ) {

    markNodeOffline(3);
  }
}

// =====================================================
// PROCESS STATUS QUEUE
// =====================================================

void processPendingStatus() {

  char deviceID[20] = "";
  uint8_t status =
    STATUS_OFFLINE;

  bool pending =
    false;

  // สำคัญ:
  // แค่ "อ่าน" pending ก่อน ยังไม่ลบ
  // ถ้า Cloud ล้ม สถานะจะยังอยู่ให้ loop รอบถัดไป retry
  portENTER_CRITICAL(
    &dataMux
  );

  if (
    status1Pending
  ) {

    strcpy(
      deviceID,
      "Number 1"
    );

    status =
      pendingStatus1;

    pending =
      true;

  } else if (
    status2Pending
  ) {

    strcpy(
      deviceID,
      "Number 2"
    );

    status =
      pendingStatus2;

    pending =
      true;

  } else if (
    status3Pending
  ) {

    strcpy(
      deviceID,
      "Number 3"
    );

    status =
      pendingStatus3;

    pending =
      true;
  }

  portEXIT_CRITICAL(
    &dataMux
  );

  if (
    !pending
  ) {
    return;
  }

  bool ok =
    sendStatusToCloudflare(
      deviceID,
      statusToText(status)
    );

  if (
    !ok
  ) {

    if (
      isPermanentHttpFailure()
    ) {

      Serial.print(
        "❌ STATUS ถูกปฏิเสธแบบถาวร HTTP "
      );

      Serial.println(
        lastHttpCode
      );

      // Clear only the exact status that was rejected.
      portENTER_CRITICAL(
        &dataMux
      );

      if (
        strcmp(deviceID,"Number 1")==0 &&
        status1Pending &&
        pendingStatus1==status
      ) {
        status1Pending=false;
      } else if (
        strcmp(deviceID,"Number 2")==0 &&
        status2Pending &&
        pendingStatus2==status
      ) {
        status2Pending=false;
      } else if (
        strcmp(deviceID,"Number 3")==0 &&
        status3Pending &&
        pendingStatus3==status
      ) {
        status3Pending=false;
      }

      portEXIT_CRITICAL(
        &dataMux
      );

      return;
    }

    Serial.print(
      "⚠ STATUS retry pending: "
    );

    Serial.println(
      deviceID
    );

    return;
  }

  // ลบ pending เฉพาะเมื่อค่าที่ยังรออยู่
  // เป็นค่าเดียวกับที่เพิ่งส่งสำเร็จ
  // ถ้าระหว่าง HTTP มี status ใหม่เข้ามา จะไม่เผลอลบทิ้ง
  portENTER_CRITICAL(
    &dataMux
  );

  if (
    strcmp(
      deviceID,
      "Number 1"
    ) == 0 &&
    status1Pending &&
    pendingStatus1 == status
  ) {

    status1Pending =
      false;

  } else if (
    strcmp(
      deviceID,
      "Number 2"
    ) == 0 &&
    status2Pending &&
    pendingStatus2 == status
  ) {

    status2Pending =
      false;

  } else if (
    strcmp(
      deviceID,
      "Number 3"
    ) == 0 &&
    status3Pending &&
    pendingStatus3 == status
  ) {

    status3Pending =
      false;
  }

  portEXIT_CRITICAL(
    &dataMux
  );
}

// =====================================================
// SETUP
// =====================================================

// =====================================================
// ESP-NOW LONG RANGE (LR)
// เปิด protocol ปกติ 11b/g/n + LR พร้อมกัน
// เพื่อให้ Mother ยังเชื่อมต่อ WiFi Router ได้ตามปกติ
// และเพิ่มความทนทานของ ESP-NOW เมื่อสัญญาณอ่อน
// =====================================================
bool enableLongRangeProtocol() {

  esp_err_t result = esp_wifi_set_protocol(
    WIFI_IF_STA,
    WIFI_PROTOCOL_11B |
    WIFI_PROTOCOL_11G |
    WIFI_PROTOCOL_11N |
    WIFI_PROTOCOL_LR
  );

  if (result == ESP_OK) {
    Serial.println("✅ WiFi/ESP-NOW Long Range (LR) Enabled");
    return true;
  }

  Serial.print("⚠ เปิด Long Range (LR) ไม่สำเร็จ, error = ");
  Serial.println((int)result);
  return false;
}

void setup() {

  Serial.begin(
    115200
  );

  pinMode(LED_GREEN, OUTPUT);
  digitalWrite(LED_GREEN, LED_OFF);

  delay(1000);

  Serial.println();
  Serial.println(
    "========================================"
  );
  Serial.println(
    " ESP32 MOTHER - FINAL HARDWARE VERSION"
  );
  Serial.println(
    "========================================"
  );

  // ===================================================
  // WIFI
  // ===================================================

  WiFi.mode(
    WIFI_STA
  );

  delay(100);

  // เปิด 11b/g/n + ESP-NOW Long Range (LR)
  enableLongRangeProtocol();

  WiFi.begin(
    ssid,
    password
  );

  Serial.print(
    "Connecting WiFi"
  );

  unsigned long start =
    millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start < 15000UL
  ) {

    updateMotherLED();
    Serial.print(".");
    delay(50);
  }

  Serial.println();

  if (
    WiFi.status() == WL_CONNECTED
  ) {

    Serial.println(
      "✅ WiFi Connected"
    );

    Serial.print(
      "IP: "
    );
    Serial.println(
      WiFi.localIP()
    );

    Serial.print(
      "Channel: "
    );
    Serial.println(
      WiFi.channel()
    );

  } else {

    Serial.println(
      "⚠ WiFi ยังไม่เชื่อมต่อ"
    );

    Serial.println(
      "ESP-NOW ยังทำงานได้"
    );
  }

  updateMotherLED();

  Serial.print(
    "Mother MAC: "
  );

  Serial.println(
    WiFi.macAddress()
  );

  // ===================================================
  // HTTPS
  // ===================================================

  secureClient.setInsecure();

  // ===================================================
  // ESP-NOW
  // ===================================================

  if (
    esp_now_init() != ESP_OK
  ) {

    Serial.println(
      "❌ ESP-NOW init failed"
    );

    ESP.restart();
  }

  esp_now_register_recv_cb(
    OnDataRecv
  );

  Serial.println(
    "✅ ESP-NOW Ready"
  );

  // ===================================================
  // INITIAL
  // ===================================================

  node1Status =
    STATUS_OFFLINE;

  node2Status =
    STATUS_OFFLINE;

  node3Status =
    STATUS_OFFLINE;

  node1LastContact = 0;
  node2LastContact = 0;
  node3LastContact = 0;

  node1ExpectedWake = 0;
  node2ExpectedWake = 0;
  node3ExpectedWake = 0;

  Serial.println();
  Serial.println(
    "Number 1 = OFFLINE"
  );
  Serial.println(
    "Number 2 = OFFLINE"
  );
  Serial.println(
    "Number 3 = OFFLINE"
  );

  Serial.println();
  Serial.print(
    "Sensor packet size: "
  );
  Serial.println(
    sizeof(sensor_message)
  );

  Serial.print(
    "Status packet size: "
  );
  Serial.println(
    sizeof(status_message)
  );

  // ===================================================
  // FIRST HEARTBEAT
  // ===================================================

  if (
    WiFi.status() == WL_CONNECTED
  ) {

    sendMotherHeartbeat();

    lastHeartbeatMillis =
      millis();
  }

  Serial.println();
  Serial.println(
    "✅ Mother Ready"
  );
}

// =====================================================
// LOOP
// =====================================================

void loop() {

  updateMotherLED();

  unsigned long now =
    millis();

  // ===================================================
  // HEARTBEAT
  // ===================================================

  if (
    lastHeartbeatMillis == 0 ||
    now - lastHeartbeatMillis >=
      HEARTBEAT_INTERVAL_MS
  ) {

    sendMotherHeartbeat();

    lastHeartbeatMillis =
      millis();
  }

  // ===================================================
  // NODE TIMEOUT
  // ===================================================

  checkNodeStatus();

  // ===================================================
  // SENSOR DATA
  // ===================================================

  sensor_message dataToSend;

  if (
    peekSensorData(
      dataToSend
    )
  ) {

    bool cloudOK =
      sendSensorToCloudflare(
        dataToSend
      );

    if (
      cloudOK
    ) {

      // ลบจาก queue เมื่อ Cloud ยืนยันสำเร็จเท่านั้น
      dropSensorData();

    } else if (
      isPermanentHttpFailure()
    ) {

      Serial.print(
        "❌ SENSOR ถูกปฏิเสธแบบถาวร HTTP "
      );

      Serial.println(
        lastHttpCode
      );

      Serial.println(
        "ทิ้ง packet นี้เพื่อไม่ให้คิวทั้งหมดค้าง"
      );

      dropSensorData();

    } else {

      Serial.println(
        "⚠ SENSOR upload failed — เก็บ packet ไว้ retry"
      );
    }
  }

  // ===================================================
  // STATUS
  // ===================================================

  processPendingStatus();

  delay(10);
}