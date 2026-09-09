#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_wifi.h>
#include <esp_now.h>
#include <Preferences.h>

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
// WIFI MANAGER
// =====================================================

WiFiManager wifiManager;
Preferences wifiPrefs;

const char* SETUP_AP_SSID = "PM25-Master-Setup";

// เปลี่ยนรหัสนี้ก่อนใช้งานจริง
// WiFiManager ต้องการรหัส AP อย่างน้อย 8 ตัวอักษร
const char* SETUP_AP_PASSWORD = "csemn2026";

const unsigned long WIFI_RECONNECT_INTERVAL_MS = 10000UL;
unsigned long lastWiFiReconnectAttempt = 0;

// V24.8 — SMART STARTUP + AUTO RECOVERY AP
// ถ้า Mother ไม่มี WiFi เชื่อมต่อครบ 60 วินาที จะเปิด Setup AP กลับมาอัตโนมัติ
const unsigned long WIFI_RECOVERY_AP_DELAY_MS = 60000UL;
unsigned long wifiDisconnectedSince = 0;
bool recoveryPortalStarted = false;

// V24.10 — Internet/Cloud health watchdog
// กรณี STA ยังขึ้น Connected แต่ Internet/Cloudflare ใช้งานไม่ได้
// จะเปิด PM25-Master-Setup หลัง Heartbeat ล้มเหลวต่อเนื่อง 60 วินาที
const unsigned long INTERNET_RECOVERY_AP_DELAY_MS = 60000UL;
const unsigned long RECOVERY_RECONNECT_INTERVAL_MS = 15000UL;
const unsigned long RECOVERY_PORTAL_CLOSE_HEALTHY_MS = 30000UL;

unsigned long cloudFailureSince = 0;
unsigned long cloudHealthySince = 0;
unsigned long lastRecoveryReconnectAttempt = 0;

// V24.5 — SAFE WIFI SWITCH / ROLLBACK
const unsigned long WIFI_SWITCH_TIMEOUT_MS = 25000UL;
const unsigned long OPEN_WIFI_CONNECT_TIMEOUT_MS = 20000UL;

bool wifiConfigSaveRequested = false;
bool wifiSwitchInProgress = false;
bool openWiFiFallbackConnecting = false;
bool rollbackInProgress = false;

// V24.6 — rollback state machine
enum RollbackPhase : uint8_t {
  ROLLBACK_IDLE = 0,
  ROLLBACK_PREPARE,
  ROLLBACK_CONNECTING
};

RollbackPhase rollbackPhase = ROLLBACK_IDLE;
unsigned long rollbackStartedAt = 0;
unsigned long rollbackPhaseStartedAt = 0;
uint8_t rollbackAttempt = 0;
const uint8_t ROLLBACK_MAX_ATTEMPTS = 2;
const unsigned long ROLLBACK_PREPARE_MS = 1200UL;
const unsigned long ROLLBACK_CONNECT_TIMEOUT_MS = 30000UL;

unsigned long lastCredentialWatchAt = 0;
unsigned long wifiSwitchStartedAt = 0;
unsigned long openWiFiFallbackStartedAt = 0;
String candidateSSID = "";
String candidatePassword = "";
String knownGoodSSID = "";
String knownGoodPassword = "";

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
const char* DEVICE_INGEST_KEY = "project2026csemn";


// =====================================================
// REMOTE WI-FI COMMAND STATE — DECLARED EARLY
// Rollback functions below need these globals before use.
// =====================================================
long remoteWiFiCommandId = 0;
bool remoteWiFiCommandActive = false;
String remoteWiFiTargetSSID = "";

// Forward declarations used by rollback code.
void reportRemoteWiFiCommand(const String& status, const String& message);
void reportMotherNetworkStatus();

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

// เวลาที่แม่ได้รับ measurement แต่ละ packet (millis)
// ใช้รักษาเวลาโดยประมาณหากต้องรอ upload ใน queue
unsigned long sensorQueueCapturedAt[
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

  sensorQueueCapturedAt[
    sensorQueueHead
  ] = millis();

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
  sensor_message& item,
  unsigned long& capturedAt
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

    capturedAt =
      sensorQueueCapturedAt[
        sensorQueueTail
      ];

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

  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  // ไม่เรียก WiFi.begin()/reconnect() ซ้ำจาก loop เพื่อไม่ให้ชนกับ
  // WiFiManager / Safe WiFi Switch / Rollback ที่เป็นเจ้าของขั้นตอนเปลี่ยน STA
  unsigned long now = millis();

  if (
    lastWiFiReconnectAttempt == 0 ||
    now - lastWiFiReconnectAttempt >= WIFI_RECONNECT_INTERVAL_MS
  ) {
    lastWiFiReconnectAttempt = now;

    Serial.println();
    Serial.println("⚠ WiFi ยังไม่เชื่อมต่อ — รอ WiFiManager");
  }

  return false;
}


void markCloudHealth(bool ok) {
  unsigned long now = millis();

  if (ok) {
    cloudFailureSince = 0;
    if (cloudHealthySince == 0) {
      cloudHealthySince = now;
    }
    return;
  }

  cloudHealthySince = 0;

  // ไม่นับช่วงกำลังเปลี่ยน Wi-Fi / Rollback เป็น Internet failure ปกติ
  if (wifiSwitchInProgress || rollbackInProgress) {
    return;
  }

  if (cloudFailureSince == 0) {
    cloudFailureSince = now;
    Serial.println("🛡 Internet Watchdog: เริ่มจับเวลา Cloud/Internet ใช้งานไม่ได้");
  }
}

void startRecoveryPortal(const char* reasonText) {
  if (recoveryPortalStarted) return;

  Serial.println();
  Serial.println(reasonText);
  Serial.println("🔧 เปิด PM25-Master-Setup อัตโนมัติเพื่อ Recovery");

  WiFi.mode(WIFI_AP_STA);
  enableLongRangeProtocol();

  bool started = wifiManager.startConfigPortal(
    SETUP_AP_SSID,
    SETUP_AP_PASSWORD
  );

  if (started) {
    recoveryPortalStarted = true;
    Serial.println("✅ Recovery Setup Portal Ready");
    Serial.print("Setup SSID: ");
    Serial.println(SETUP_AP_SSID);
    Serial.println("เชื่อม Setup WiFi แล้วเปิด http://192.168.4.1");
  } else {
    Serial.println("⚠ Recovery Setup Portal start failed — จะลองใหม่ภายหลัง");
  }

  enableLongRangeProtocol();
}

void stopRecoveryPortalIfHealthy() {
  if (!recoveryPortalStarted) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (cloudFailureSince != 0 || cloudHealthySince == 0) return;

  unsigned long now = millis();
  if (now - cloudHealthySince < RECOVERY_PORTAL_CLOSE_HEALTHY_MS) return;

  Serial.println();
  Serial.println("✅ Internet/Cloudflare เสถียรแล้ว 30 วินาที");
  Serial.println("🔒 ปิด PM25-Master-Setup Recovery Portal");

  wifiManager.stopConfigPortal();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  enableLongRangeProtocol();

  recoveryPortalStarted = false;
  wifiDisconnectedSince = 0;
}

void attemptRecoveryReconnect() {
  if (recoveryPortalStarted) return;
  if (wifiSwitchInProgress || rollbackInProgress) return;
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();
  if (lastRecoveryReconnectAttempt != 0 &&
      now - lastRecoveryReconnectAttempt < RECOVERY_RECONNECT_INTERVAL_MS) {
    return;
  }

  lastRecoveryReconnectAttempt = now;

  Serial.println("🔄 Recovery: ลองเชื่อม Wi-Fi ที่บันทึกไว้อีกครั้ง");

  WiFi.mode(WIFI_AP_STA);
  enableLongRangeProtocol();

  // ใช้ STA credential ที่ ESP32 มีอยู่ก่อน
  // หากไม่มี/ใช้ไม่ได้ ระบบจะไปเปิด Setup AP เมื่อครบ 60 วินาที
  WiFi.reconnect();
}

// =====================================================
// AUTO RECOVERY AP — V24.7
// =====================================================

void serviceAutoRecoveryAP() {
  // ห้าม Recovery แทรกระหว่าง Safe WiFi Switch / Rollback
  if (wifiSwitchInProgress || rollbackInProgress) {
    return;
  }

  unsigned long now = millis();
  bool staConnected = (WiFi.status() == WL_CONNECTED);

  if (!staConnected) {
    cloudHealthySince = 0;

    if (wifiDisconnectedSince == 0) {
      wifiDisconnectedSince = now;
      Serial.println("🛡 Recovery: ตรวจพบ Wi-Fi หลุด เริ่มจับเวลา");
    }

    // V24.10: ระหว่างรอ 60 วินาที ลอง reconnect เองทุก 15 วินาที
    attemptRecoveryReconnect();

    if (!recoveryPortalStarted &&
        now - wifiDisconnectedSince >= WIFI_RECOVERY_AP_DELAY_MS) {
      startRecoveryPortal(
        "📡 WiFi ขาดการเชื่อมต่อครบ 60 วินาที"
      );
    }

    return;
  }

  // STA ยัง Connected
  wifiDisconnectedSince = 0;

  // กรณีสำคัญของ V24.10:
  // WiFi.status() ยัง Connected แต่ Heartbeat ไป Cloudflare ไม่ได้ต่อเนื่อง
  if (cloudFailureSince != 0 &&
      now - cloudFailureSince >= INTERNET_RECOVERY_AP_DELAY_MS) {
    startRecoveryPortal(
      "🌐 Wi-Fi ยัง Connected แต่ Internet/Cloudflare ใช้งานไม่ได้ครบ 60 วินาที"
    );
    return;
  }

  // ถ้า Internet กลับมาจริงและ Heartbeat ผ่านต่อเนื่อง 30 วินาที
  // ปิด Recovery AP อัตโนมัติ
  stopRecoveryPortalIfHealthy();
}

// =====================================================
// SAFE WIFI SWITCH / ROLLBACK — V24.4
// =====================================================

bool readSavedSTAConfig(String& ssid, String& password) {
  wifi_config_t config = {};
  if (esp_wifi_get_config(WIFI_IF_STA, &config) != ESP_OK) return false;
  ssid = String(reinterpret_cast<const char*>(config.sta.ssid));
  password = String(reinterpret_cast<const char*>(config.sta.password));
  return ssid.length() > 0;
}

void loadKnownGoodWiFi() {
  wifiPrefs.begin("pm25wifi", true);
  knownGoodSSID = wifiPrefs.getString("good_ssid", "");
  knownGoodPassword = wifiPrefs.getString("good_pass", "");
  wifiPrefs.end();
}

void saveKnownGoodWiFi(const String& ssid, const String& password) {
  if (!ssid.length()) return;
  wifiPrefs.begin("pm25wifi", false);
  wifiPrefs.putString("good_ssid", ssid);
  wifiPrefs.putString("good_pass", password);
  wifiPrefs.end();
  knownGoodSSID = ssid;
  knownGoodPassword = password;
  Serial.print("💾 Known-Good WiFi: ");
  Serial.println(ssid);
}

void rememberCurrentWiFiAsKnownGood() {
  String ssid, password;
  if (WiFi.status() == WL_CONNECTED && readSavedSTAConfig(ssid, password)) {
    saveKnownGoodWiFi(ssid, password);
  }
}

void beginCandidateTest(const String& ssid, const String& password) {
  if (!ssid.length()) return;
  if (ssid == knownGoodSSID && password == knownGoodPassword) return;

  candidateSSID = ssid;
  candidatePassword = password;
  wifiSwitchStartedAt = millis();
  wifiSwitchInProgress = true;
  openWiFiFallbackConnecting = false;
  rollbackInProgress = false;

  Serial.println();
  Serial.println("🔄 เริ่มทดสอบ WiFi ใหม่");
  Serial.print("SSID: ");
  Serial.println(candidateSSID);
  Serial.println(candidatePassword.length() ? "Security: PASSWORD" : "Security: OPEN");
}

void onWiFiManagerSave() {
  wifiConfigSaveRequested = true;
}

void startKnownGoodConnectionAttempt() {
  WiFi.mode(WIFI_AP_STA);
  enableLongRangeProtocol();

  Serial.print("↩ เชื่อม Known-Good รอบที่ ");
  Serial.print(rollbackAttempt);
  Serial.print("/" );
  Serial.println(ROLLBACK_MAX_ATTEMPTS);

  // สำคัญ: OPEN WiFi ต้องส่ง nullptr ไม่ใช่ empty password
  if (knownGoodPassword.length()) {
    WiFi.begin(
      knownGoodSSID.c_str(),
      knownGoodPassword.c_str()
    );
  } else {
    WiFi.begin(
      knownGoodSSID.c_str(),
      nullptr
    );
  }

  rollbackPhase = ROLLBACK_CONNECTING;
  rollbackPhaseStartedAt = millis();
}

void prepareRollbackRadio() {
  // ล้าง credential ที่เพิ่งกรอกผิดออกจาก STA storage
  // Known-Good ของเรายังอยู่ใน Preferences แยกต่างหาก
  WiFi.setAutoReconnect(false);
  WiFi.disconnect(false, true);
  esp_wifi_disconnect();

  rollbackPhase = ROLLBACK_PREPARE;
  rollbackPhaseStartedAt = millis();
}

void rollbackToKnownGood() {
  wifiSwitchInProgress = false;
  openWiFiFallbackConnecting = false;

  if (!knownGoodSSID.length()) {
    Serial.println("⚠ ไม่มี Known-Good WiFi สำหรับ rollback — Setup AP ยังเปิดอยู่");
    if(remoteWiFiCommandActive){reportRemoteWiFiCommand("failed","ไม่มี Known-Good สำหรับ Rollback; ใช้ Setup AP เพื่อกู้ระบบ");remoteWiFiCommandActive=false;remoteWiFiCommandId=0;remoteWiFiTargetSSID="";}
    return;
  }

  Serial.println();
  Serial.print("↩ Rollback กลับ Known-Good WiFi: ");
  Serial.println(knownGoodSSID);
  Serial.println(knownGoodPassword.length() ? "Security: PASSWORD" : "Security: OPEN");

  rollbackInProgress = true;
  rollbackAttempt = 1;
  rollbackStartedAt = millis();

  // V24.6: ไม่ WiFi.begin() ทันทีหลัง WiFiManager fail
  // ให้ driver ออกจาก STA_CONNECTING/INIT ให้เรียบร้อยก่อน
  prepareRollbackRadio();
}

void serviceRollbackConnection() {
  if (!rollbackInProgress) return;

  unsigned long now = millis();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("✅ Rollback เชื่อม Known-Good WiFi สำเร็จ");
    if(remoteWiFiCommandActive){reportRemoteWiFiCommand("rolled_back","Wi-Fi ใหม่เชื่อมต่อไม่สำเร็จ ระบบกลับมาใช้ Known-Good แล้ว");reportMotherNetworkStatus();remoteWiFiCommandActive=false;remoteWiFiCommandId=0;remoteWiFiTargetSSID="";}
    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("Channel: ");
    Serial.println(WiFi.channel());

    rollbackInProgress = false;
    rollbackPhase = ROLLBACK_IDLE;
    wifiDisconnectedSince = 0;
    lastRecoveryReconnectAttempt = 0;
    rollbackAttempt = 0;
    enableLongRangeProtocol();
    return;
  }

  if (rollbackPhase == ROLLBACK_PREPARE) {
    if (now - rollbackPhaseStartedAt >= ROLLBACK_PREPARE_MS) {
      startKnownGoodConnectionAttempt();
    }
    return;
  }

  if (rollbackPhase == ROLLBACK_CONNECTING &&
      now - rollbackPhaseStartedAt >= ROLLBACK_CONNECT_TIMEOUT_MS) {

    if (rollbackAttempt < ROLLBACK_MAX_ATTEMPTS) {
      rollbackAttempt++;
      Serial.println("⚠ Rollback ยังไม่สำเร็จ — reset STA แล้วลอง Known-Good อีกครั้ง");
      prepareRollbackRadio();
      return;
    }

    Serial.println("❌ Rollback ไม่สำเร็จหลังลอง 2 รอบ");
    Serial.println("Setup AP ยังเปิดอยู่: PM25-Master-Setup");

    rollbackInProgress = false;
    rollbackPhase = ROLLBACK_IDLE;
    rollbackAttempt = 0;
    enableLongRangeProtocol();
  }
}

void watchSavedCredentialsForFailedPortalConnect() {
  // WiFiManager 2.0.17 อาจไม่เรียก SaveConfigCallback เมื่อ connect ใหม่ล้มเหลว
  // จึงตรวจ STA config ที่ถูกเขียนใหม่เอง เพื่อให้ rollback ทำงานได้จริง
  if (millis() - lastCredentialWatchAt < 500UL) return;
  lastCredentialWatchAt = millis();

  if (wifiSwitchInProgress || rollbackInProgress) return;

  String ssid, password;
  if (!readSavedSTAConfig(ssid, password)) return;

  if (knownGoodSSID.length() &&
      (ssid != knownGoodSSID || password != knownGoodPassword)) {
    Serial.println();
    Serial.println("🛡 ตรวจพบ credential ใหม่ที่ยังไม่ผ่านการยืนยัน");
    beginCandidateTest(ssid, password);
  }
}

void serviceSafeWiFiSwitch() {
  unsigned long now = millis();

  if (wifiConfigSaveRequested) {
    wifiConfigSaveRequested = false;
    String ssid, password;
    if (readSavedSTAConfig(ssid, password)) {
      beginCandidateTest(ssid, password);
    }
  }

  // ตรวจ credential แม้ callback ของ WiFiManager ไม่ถูกเรียกเมื่อ connect fail
  watchSavedCredentialsForFailedPortalConnect();

  if (rollbackInProgress) {
    serviceRollbackConnection();
    return;
  }

  if (!wifiSwitchInProgress) return;

  if (WiFi.status() == WL_CONNECTED) {
    // รอ Mother Heartbeat ยืนยัน Internet/Cloudflare ก่อนบันทึก Known-Good
    return;
  }

  // Open network: ถ้า WiFiManager ยังต่อไม่ได้ ให้ลองแบบไม่มี password โดยตรง 1 ครั้ง
  if (!candidatePassword.length() && !openWiFiFallbackConnecting &&
      now - wifiSwitchStartedAt >= 3000UL) {
    Serial.println();
    Serial.println("🔓 Open WiFi fallback — เชื่อมแบบไม่มี password โดยตรง");
    Serial.print("SSID: ");
    Serial.println(candidateSSID);

    WiFi.disconnect(false, false);
    delay(120);
    WiFi.mode(WIFI_AP_STA);
    enableLongRangeProtocol();
    WiFi.begin(candidateSSID.c_str());

    openWiFiFallbackConnecting = true;
    openWiFiFallbackStartedAt = millis();
    return;
  }

  unsigned long timeout = openWiFiFallbackConnecting
    ? OPEN_WIFI_CONNECT_TIMEOUT_MS
    : WIFI_SWITCH_TIMEOUT_MS;
  unsigned long started = openWiFiFallbackConnecting
    ? openWiFiFallbackStartedAt
    : wifiSwitchStartedAt;

  if (now - started >= timeout) {
    Serial.print("❌ WiFi ใหม่เชื่อมไม่สำเร็จ: ");
    Serial.println(candidateSSID);
    rollbackToKnownGood();
  }
}

void registerWiFiDiagnostics() {
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      Serial.print("📡 STA Disconnected — reason: ");
      Serial.println(info.wifi_sta_disconnected.reason);
    }
    if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
      Serial.print("📡 STA Got IP: ");
      Serial.println(WiFi.localIP());
    }
  });
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
// REMOTE WI-FI MANAGEMENT V1
// =====================================================
const char* WIFI_COMMAND_URL =
  "https://educational-pm25-api.project2026csemn.workers.dev/api/mother/wifi_command";
const char* WIFI_COMMAND_STATUS_URL =
  "https://educational-pm25-api.project2026csemn.workers.dev/api/mother/wifi_command/status";
const char* NETWORK_STATUS_URL =
  "https://educational-pm25-api.project2026csemn.workers.dev/api/mother/network_status";

const unsigned long WIFI_COMMAND_POLL_MS = 15000UL;
unsigned long lastWiFiCommandPoll = 0;

// รายงาน SSID / IP / Channel ให้ Dashboard เป็นระยะ
const unsigned long NETWORK_STATUS_REPORT_MS = 60000UL;
unsigned long lastNetworkStatusReport = 0;

String jsonStringField(const String& json, const String& key) {
  String token = "\"" + key + "\":";
  int p=json.indexOf(token); if(p<0)return "";
  p+=token.length(); while(p<(int)json.length() && (json[p]==' '))p++;
  if(p>=(int)json.length() || json[p]!='"')return "";
  p++; String out="";
  bool esc=false;
  for(;p<(int)json.length();p++){
    char c=json[p];
    if(esc){ if(c=='n')out+='\n'; else if(c=='r')out+='\r'; else if(c=='t')out+='\t'; else out+=c; esc=false; continue; }
    if(c=='\\'){esc=true;continue;}
    if(c=='"')break;
    out+=c;
  }
  return out;
}
long jsonLongField(const String& json,const String& key){
  String token="\""+key+"\":";int p=json.indexOf(token);if(p<0)return 0;
  p+=token.length();while(p<(int)json.length()&&(json[p]==' '||json[p]=='\t'))p++;
  return json.substring(p).toInt();
}
bool jsonBoolField(const String& json,const String& key){
  String token="\""+key+"\":";int p=json.indexOf(token);if(p<0)return false;
  p+=token.length();while(p<(int)json.length()&&json[p]==' ')p++;
  return json.substring(p,p+4)=="true";
}

bool remotePostJson(const char* url,const String& body){
  if(WiFi.status()!=WL_CONNECTED)return false;
  WiFiClientSecure client;client.setInsecure();
  HTTPClient http;
  if(!http.begin(client,url))return false;
  http.addHeader("Content-Type","application/json");
  if (DEVICE_INGEST_KEY != nullptr && strlen(DEVICE_INGEST_KEY) > 0) {
    http.addHeader("X-Device-Key", DEVICE_INGEST_KEY);
  }
  int code=http.POST(body);http.end();
  return code>=200&&code<300;
}
void reportRemoteWiFiCommand(const String& status,const String& message){
  if(remoteWiFiCommandId<=0)return;
  String body="{\"id\":"+String(remoteWiFiCommandId)+",\"status\":\""+status+"\",\"message\":\"";
  String safe=message;safe.replace("\\","\\\\");safe.replace("\"","\\\"");
  body+=safe+"\"}";
  remotePostJson(WIFI_COMMAND_STATUS_URL,body);
}
void reportMotherNetworkStatus(){
  if(WiFi.status()!=WL_CONNECTED){
    Serial.println("⚠ Network Status: WiFi ยังไม่ Connected");
    return;
  }

  String ssid=WiFi.SSID();
  ssid.replace("\\","\\\\");
  ssid.replace("\"","\\\"");

  String body="{\"ssid\":\""+ssid+"\",\"ip\":\""+WiFi.localIP().toString()+"\",\"channel\":"+String(WiFi.channel())+"}";

  bool ok=remotePostJson(NETWORK_STATUS_URL,body);
  if(ok){
    Serial.print("📡 Network Status OK | SSID: ");
    Serial.print(WiFi.SSID());
    Serial.print(" | IP: ");
    Serial.print(WiFi.localIP());
    Serial.print(" | CH: ");
    Serial.println(WiFi.channel());
  }else{
    Serial.println("⚠ Network Status Failed");
  }
}
void pollRemoteWiFiCommand(){
  if(WiFi.status()!=WL_CONNECTED||wifiSwitchInProgress||rollbackInProgress||remoteWiFiCommandActive)return;
  if(lastWiFiCommandPoll&&millis()-lastWiFiCommandPoll<WIFI_COMMAND_POLL_MS)return;
  lastWiFiCommandPoll=millis();

  WiFiClientSecure client;client.setInsecure();
  HTTPClient http;
  if(!http.begin(client,WIFI_COMMAND_URL))return;
  if (DEVICE_INGEST_KEY != nullptr && strlen(DEVICE_INGEST_KEY) > 0) {
    http.addHeader("X-Device-Key", DEVICE_INGEST_KEY);
  }
  int code=http.GET();
  if(code<200||code>=300){http.end();return;}
  String payload=http.getString();http.end();
  if(payload.indexOf("\"command\":null")>=0)return;

  long id=jsonLongField(payload,"id");
  String ssid=jsonStringField(payload,"ssid");
  String password=jsonStringField(payload,"password");
  bool openNetwork=jsonBoolField(payload,"open_network");
  if(id<=0||!ssid.length())return;
  if(openNetwork)password="";

  remoteWiFiCommandId=id;
  remoteWiFiCommandActive=true;
  remoteWiFiTargetSSID=ssid;
  reportRemoteWiFiCommand("applying","ตัวแม่กำลังทดลองเชื่อมต่อ Wi-Fi ใหม่");

  Serial.println();
  Serial.print("🌐 Remote WiFi Command #");Serial.println(id);
  Serial.print("SSID: ");Serial.println(ssid);

  candidateSSID=ssid;
  candidatePassword=password;
  wifiSwitchStartedAt=millis();
  wifiSwitchInProgress=true;
  openWiFiFallbackConnecting=false;
  rollbackInProgress=false;

  WiFi.disconnect(false,true);
  delay(150);
  WiFi.mode(WIFI_AP_STA);
  enableLongRangeProtocol();
  if(password.length())WiFi.begin(ssid.c_str(),password.c_str());
  else WiFi.begin(ssid.c_str(),nullptr);
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

    markCloudHealth(true);

    if (wifiSwitchInProgress && WiFi.status() == WL_CONNECTED) {
      Serial.println("✅ WiFi ใหม่ผ่าน Internet/Cloudflare — ยืนยันเป็น Known-Good");
      if(remoteWiFiCommandActive){reportRemoteWiFiCommand("connected","เชื่อมต่อ Wi-Fi ใหม่และ Cloudflare สำเร็จ");reportMotherNetworkStatus();remoteWiFiCommandActive=false;remoteWiFiCommandId=0;remoteWiFiTargetSSID="";}
      saveKnownGoodWiFi(candidateSSID, candidatePassword);
      wifiSwitchInProgress = false;
      openWiFiFallbackConnecting = false;
      rollbackInProgress = false;
      rollbackPhase = ROLLBACK_IDLE;
      rollbackAttempt = 0;
      enableLongRangeProtocol();
    } else if (!knownGoodSSID.length() && WiFi.status() == WL_CONNECTED) {
      // ครั้งแรกเท่านั้น: บันทึกเครือข่ายปัจจุบันหลัง Cloudflare ผ่านจริง
      String ssid, password;
      if (readSavedSTAConfig(ssid, password)) {
        Serial.println("✅ เครือข่ายปัจจุบันผ่าน Cloudflare — ตั้งเป็น Known-Good เริ่มต้น");
        saveKnownGoodWiFi(ssid, password);
      }
    }

  } else {

    Serial.println(
      "⚠ Mother Heartbeat Failed"
    );

    markCloudHealth(false);
  }

  return ok;
}

// =====================================================
// SEND SENSOR TO CLOUD
// =====================================================

bool sendSensorToCloudflare(
  const sensor_message& data,
  unsigned long capturedAt
){
  const unsigned long measurementAgeMs =
    millis() - capturedAt;

  String json="{";
  json+="\"device_id\":\"";
  json+=data.deviceID;
  json+="\",\"status\":\"online\",";
  json+="\"record_type\":\"measurement\",";
  json+="\"measurement_age_ms\":";
  json+=String(measurementAgeMs);
  json+=",";
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
  json += "\",";

  json += "\"record_type\":\"status\"";

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
    " ESP32 MOTHER - V24.10 INTERNET WATCHDOG + SMART RECOVERY"
  );
  Serial.println(
    "========================================"
  );

  // ===================================================
  // WIFI MANAGER
  // ===================================================

  WiFi.mode(WIFI_AP_STA);
  // ปิด ESP32 Auto Reconnect เพื่อไม่ให้ชนกับ WiFiManager
  // ตอนกำลังเปลี่ยนเครือข่ายผ่าน Config Portal
  WiFi.setAutoReconnect(false);
  WiFi.persistent(true);
  loadKnownGoodWiFi();
  registerWiFiDiagnostics();

  cloudFailureSince = 0;
  cloudHealthySince = 0;
  wifiDisconnectedSince = 0;
  lastRecoveryReconnectAttempt = 0;

  delay(100);

  // เปิด 11b/g/n + ESP-NOW Long Range (LR)
  enableLongRangeProtocol();

  // ลองใช้ WiFi ที่ ESP32 เคยบันทึกไว้ โดยไม่ล็อกโปรแกรมนาน
  WiFi.begin();

  Serial.print("Connecting saved WiFi");

  unsigned long start = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start < 10000UL
  ) {
    updateMotherLED();
    Serial.print(".");
    delay(50);
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("✅ Saved WiFi Connected");
    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("Channel: ");
    Serial.println(WiFi.channel());
  } else {
    Serial.println("⚠ ยังเชื่อม WiFi ที่บันทึกไว้ไม่ได้");
    Serial.println("ESP-NOW ยังทำงานต่อ และใช้ PM25-Master-Setup ตั้ง WiFi ใหม่ได้");
  }

  // เปิด Setup Portal แบบ Non-Blocking
  // ตัวแม่จึงยังรับ ESP-NOW และทำงานส่วนอื่นต่อได้
  wifiManager.setConfigPortalBlocking(false);
  wifiManager.setConfigPortalTimeout(0);

  // ให้เวลาการเชื่อมต่อ WiFiManager ก่อนระบบ V24.4 ตัดสิน rollback
  // และปิด retry ภายใน WiFiManager เพื่อไม่ให้เริ่ม connect รอบใหม่
  // ขณะที่ driver ยังอยู่ในสถานะ STA_CONNECTING
  wifiManager.setConnectTimeout(20);
  wifiManager.setConnectRetries(1);
  wifiManager.setSaveConfigCallback(onWiFiManagerSave);

  // V24.8 — SMART STARTUP AP
  // ถ้า WiFi ที่บันทึกไว้เชื่อมได้แล้ว ไม่ต้องเปิด PM25-Master-Setup
  // ถ้าเปิดเครื่องแล้วไม่มี WiFi ที่ใช้ได้ ให้เปิด Setup Portal ทันที
  if (WiFi.status() != WL_CONNECTED) {

    bool portalStarted = wifiManager.startConfigPortal(
      SETUP_AP_SSID,
      SETUP_AP_PASSWORD
    );

    if (portalStarted) {
      recoveryPortalStarted = true;
      Serial.println("✅ WiFi Setup Portal Ready");
      Serial.print("Setup SSID: ");
      Serial.println(SETUP_AP_SSID);
      Serial.println("เชื่อม Setup WiFi แล้วเปิด http://192.168.4.1");
    } else {
      recoveryPortalStarted = false;
      wifiDisconnectedSince = millis();
      Serial.println("⚠ WiFi Setup Portal start failed");
      Serial.println("ระบบ Auto Recovery จะลองเปิด Setup AP ใหม่ภายหลัง");
    }

    // WiFiManager อาจเปลี่ยน WiFi mode จึงยืนยัน LR อีกครั้ง
    enableLongRangeProtocol();

  } else {
    recoveryPortalStarted = false;
    wifiDisconnectedSince = 0;
    Serial.println("✅ WiFi พร้อมใช้งาน — ไม่เปิด PM25-Master-Setup");
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

    // V24.9.2: ส่งสถานะเครือข่ายทันทีหลังบูต
    reportMotherNetworkStatus();
    lastNetworkStatusReport = millis();

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

  // ให้ WiFiManager web portal ทำงานแบบ non-blocking
  wifiManager.process();

  // V24.5: ทดสอบ WiFi ใหม่ + rollback แม้ WiFiManager connect fail ก่อน callback
  serviceSafeWiFiSwitch();

  // V24.7: ถ้า WiFi หายครบ 60 วินาทีและไม่ได้อยู่ระหว่าง switch/rollback
  // ให้เปิด PM25-Master-Setup กลับมาอัตโนมัติ
  serviceAutoRecoveryAP();

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

  // Remote Wi-Fi command polling
  pollRemoteWiFiCommand();

  // V24.9.2: อัปเดต SSID / IP / Channel ให้ Dashboard ทุก 60 วินาที
  if (
    WiFi.status() == WL_CONNECTED &&
    (lastNetworkStatusReport == 0 ||
     now - lastNetworkStatusReport >= NETWORK_STATUS_REPORT_MS)
  ) {
    reportMotherNetworkStatus();
    lastNetworkStatusReport = now;
  }

  // ===================================================
  // NODE TIMEOUT
  // ===================================================

  checkNodeStatus();

  // ===================================================
  // SENSOR DATA
  // ===================================================

  sensor_message dataToSend;
  unsigned long dataCapturedAt = 0;

  if (
    peekSensorData(
      dataToSend,
      dataCapturedAt
    )
  ) {

    bool cloudOK =
      sendSensorToCloudflare(
        dataToSend,
        dataCapturedAt
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