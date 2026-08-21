#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_now.h>

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
// HTTPS
// =====================================================

WiFiClientSecure secureClient;

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

// กฎทั้งระบบ:
// ข้อมูล ONLINE หรือ SLEEP เกิน 6 นาที = OFFLINE
//
// ลูกหลับ 5 นาที
// + เผื่อเวลาตื่นอีก 1 นาที
// = 6 นาที
const unsigned long GRACE_PERIOD_MS = 60000UL;

const unsigned long NODE_OFFLINE_TIMEOUT_MS =
  6UL * 60UL * 1000UL;

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

sensor_message incomingData;

volatile bool newDataAvailable = false;

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

    delay(500);

    Serial.print(".");
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

    return false;
  }

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  http.setTimeout(
    10000
  );

  int code =
    http.POST(
      json
    );

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

void sendSensorToCloudflare(const sensor_message& data){
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
  postJson(API_URL,json,true);
  Serial.println("=========================");
}

// =====================================================
// SEND STATUS TO CLOUD
//
// ไม่มี pm1=0 / pm25=0 ฯลฯ อีก
// =====================================================

void sendStatusToCloudflare(
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

  postJson(
    API_URL,
    json,
    true
  );

  Serial.println(
    "========================="
  );
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

    if (
      s.status == STATUS_SLEEP
    ) {

      unsigned long now =
        millis();

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

  portENTER_CRITICAL(
    &dataMux
  );

  memcpy(
    &incomingData,
    &temp,
    sizeof(incomingData)
  );

  newDataAvailable =
    true;

  portEXIT_CRITICAL(
    &dataMux
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

  char deviceID[20];
  uint8_t status =
    STATUS_OFFLINE;

  bool pending = false;

  portENTER_CRITICAL(
    &dataMux
  );

  if (
    status1Pending
  ) {

    status1Pending =
      false;

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

    status2Pending =
      false;

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

    status3Pending =
      false;

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
    pending
  ) {

    sendStatusToCloudflare(
      deviceID,
      statusToText(status)
    );
  }
}

// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(
    115200
  );

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

    Serial.print(".");
    delay(500);
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

  if (
    newDataAvailable
  ) {

    sensor_message dataToSend;

    portENTER_CRITICAL(
      &dataMux
    );

    memcpy(
      &dataToSend,
      &incomingData,
      sizeof(dataToSend)
    );

    newDataAvailable =
      false;

    portEXIT_CRITICAL(
      &dataMux
    );

    sendSensorToCloudflare(
      dataToSend
    );
  }

  // ===================================================
  // STATUS
  // ===================================================

  processPendingStatus();

  delay(10);
}