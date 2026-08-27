#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_now.h>

#include <Wire.h>
#include <Adafruit_AM2315.h>
#include <BH1750.h>

#define DEVICE_ID "Number 2"
#define DEVICE_NUMBER 2

uint8_t receiverMAC[] = {
  0x24,0x6F,0x28,0xB2,0x67,0xE0
};

#define SLEEP_TIME_MS 300000UL

#define FIRST_CHANNEL 1
#define LAST_CHANNEL 13
#define DISCOVERY_REQUEST 0xA5
#define DISCOVERY_RESPONSE 0xA6
#define DISCOVERY_WAIT 500
#define SEND_WAIT 1000

#define STATUS_ONLINE 1
#define STATUS_SLEEP 2

Adafruit_AM2315 am2315;
BH1750 lightMeter;

HardwareSerial pmsSerial(2);

#define PMS_RX 16
#define PMS_TX 17

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

typedef struct {
  char deviceID[20];
  uint8_t status;
} status_message;

sensor_message data;

volatile bool sendCallbackReceived=false;
volatile bool sendSuccess=false;
volatile bool discoveryResponseReceived=false;

uint8_t currentChannel=0;

void printMAC(const uint8_t* mac){

  char macStr[18];

  snprintf(
    macStr,
    sizeof(macStr),
    "%02X:%02X:%02X:%02X:%02X:%02X",
    mac[0],mac[1],mac[2],
    mac[3],mac[4],mac[5]
  );

  Serial.println(macStr);
}

void OnDataSent(
  const wifi_tx_info_t* info,
  esp_now_send_status_t status
){

  sendCallbackReceived=true;

  sendSuccess=
    status==
    ESP_NOW_SEND_SUCCESS;
}

void OnDataRecv(
  const esp_now_recv_info_t* info,
  const uint8_t* incomingData,
  int len
){

  if(!incomingData){
    return;
  }

  if(
    len==1&&
    incomingData[0]==
    DISCOVERY_RESPONSE
  ){

    discoveryResponseReceived=true;
  }
}

bool setWiFiChannel(
  uint8_t channel
){

  if(
    channel<1||
    channel>13
  ){
    return false;
  }

  if(
    esp_wifi_set_channel(
      channel,
      WIFI_SECOND_CHAN_NONE
    )!=ESP_OK
  ){

    return false;
  }

  currentChannel=channel;

  delay(20);

  return true;
}

void removeParentPeer(){

  if(
    esp_now_is_peer_exist(
      receiverMAC
    )
  ){

    esp_now_del_peer(
      receiverMAC
    );
  }
}

bool addParentPeer(){

  removeParentPeer();

  esp_now_peer_info_t peerInfo;

  memset(
    &peerInfo,
    0,
    sizeof(peerInfo)
  );

  memcpy(
    peerInfo.peer_addr,
    receiverMAC,
    6
  );

  peerInfo.channel=0;
  peerInfo.encrypt=false;

  esp_err_t result=
    esp_now_add_peer(
      &peerInfo
    );

  return(
    result==ESP_OK||
    result==ESP_ERR_ESPNOW_EXIST
  );
}

bool testParentOnChannel(
  uint8_t channel
){

  if(
    !setWiFiChannel(channel)
  ){
    return false;
  }

  if(
    !addParentPeer()
  ){
    return false;
  }

  discoveryResponseReceived=false;

  uint8_t request=
    DISCOVERY_REQUEST;

  if(
    esp_now_send(
      receiverMAC,
      &request,
      sizeof(request)
    )!=ESP_OK
  ){

    return false;
  }

  unsigned long start=
    millis();

  while(
    millis()-start<
    DISCOVERY_WAIT
  ){

    if(
      discoveryResponseReceived
    ){
      return true;
    }

    delay(2);
  }

  return false;
}

bool findParentChannel(){

  Serial.println(
    "🔎 AUTO CHANNEL DISCOVERY"
  );

  for(
    int round=1;
    round<=2;
    round++
  ){

    Serial.print(
      "Discovery รอบ "
    );

    Serial.println(round);

    for(
      uint8_t channel=
        FIRST_CHANNEL;
      channel<=
        LAST_CHANNEL;
      channel++
    ){

      Serial.print(
        "Channel "
      );

      Serial.print(channel);

      Serial.print(
        " ... "
      );

      if(
        testParentOnChannel(
          channel
        )
      ){

        Serial.println(
          "FOUND"
        );

        Serial.print(
          "📡 Mother Channel = "
        );

        Serial.println(
          channel
        );

        return true;
      }

      Serial.println("X");
    }
  }

  currentChannel=0;

  return false;
}

bool readPMS3003(){

  while(
    pmsSerial.available()>=4
  ){

    uint8_t first=
      pmsSerial.read();

    if(first!=0x42){
      continue;
    }

    uint8_t second=
      pmsSerial.read();

    if(second!=0x4D){
      continue;
    }

    uint8_t lenHigh=
      pmsSerial.read();

    uint8_t lenLow=
      pmsSerial.read();

    uint16_t frameLength=
      (
        (uint16_t)lenHigh<<8
      )|
      lenLow;

    if(
      frameLength!=20&&
      frameLength!=28
    ){
      continue;
    }

    int totalLength=
      4+
      frameLength;

    uint8_t buffer[32];

    buffer[0]=0x42;
    buffer[1]=0x4D;
    buffer[2]=lenHigh;
    buffer[3]=lenLow;

    int remaining=
      totalLength-4;

    int received=
      pmsSerial.readBytes(
        &buffer[4],
        remaining
      );

    if(
      received!=remaining
    ){
      return false;
    }

    uint16_t checksum=0;

    for(
      int i=0;
      i<totalLength-2;
      i++
    ){

      checksum+=buffer[i];
    }

    uint16_t receivedChecksum=
      (
        (uint16_t)
        buffer[totalLength-2]
        <<8
      )|
      buffer[totalLength-1];

    if(
      checksum!=
      receivedChecksum
    ){
      return false;
    }

    int pm1;
    int pm25;
    int pm10;

    if(
      frameLength==20
    ){

      pm1=
        (
          (uint16_t)
          buffer[4]<<8
        )|
        buffer[5];

      pm25=
        (
          (uint16_t)
          buffer[6]<<8
        )|
        buffer[7];

      pm10=
        (
          (uint16_t)
          buffer[8]<<8
        )|
        buffer[9];

    }else{

      pm1=
        (
          (uint16_t)
          buffer[10]<<8
        )|
        buffer[11];

      pm25=
        (
          (uint16_t)
          buffer[12]<<8
        )|
        buffer[13];

      pm10=
        (
          (uint16_t)
          buffer[14]<<8
        )|
        buffer[15];
    }

    if(
      pm1>5000||
      pm25>5000||
      pm10>5000
    ){
      return false;
    }

    data.pm1=pm1;
    data.pm25=pm25;
    data.pm10=pm10;

    return true;
  }

  return false;
}

void readSensors() {

  // ===================================================
  // RESET RESULT
  // ===================================================

  data.temperature = 0.0f;
  data.humidity = 0.0f;
  data.pm1 = 0;
  data.pm25 = 0;
  data.pm10 = 0;
  data.light = 0.0f;

  data.am2315Valid = 0;
  data.pmsValid = 0;
  data.bh1750Valid = 0;

  // ===================================================
  // ACCUMULATORS
  // เก็บเฉพาะค่าที่อ่านสำเร็จและอยู่ในช่วงที่ยอมรับได้
  // ===================================================

  double tempSum = 0.0;
  double humSum = 0.0;
  double pm1Sum = 0.0;
  double pm25Sum = 0.0;
  double pm10Sum = 0.0;
  double lightSum = 0.0;

  uint16_t amCount = 0;
  uint16_t pmsCount = 0;
  uint16_t lightCount = 0;

  unsigned long collectionStart =
    millis();

  uint16_t roundNo = 0;

  Serial.println();
  Serial.println(
    "========================================"
  );

  Serial.println(
    "📊 เริ่มเก็บ Sensor 1 นาที"
  );

  Serial.println(
    "อ่านทุกประมาณ 5 วินาที"
  );

  Serial.println(
    "ค่าที่อ่านไม่สำเร็จจะไม่นำไปเฉลี่ย"
  );

  Serial.println(
    "========================================"
  );

  // ===================================================
  // COLLECT FOR 60 SECONDS
  // ===================================================

  while (
    millis() - collectionStart <
    60000UL
  ) {

    unsigned long roundStart =
      millis();

    roundNo++;

    Serial.println();
    Serial.print(
      "รอบอ่าน #"
    );

    Serial.println(
      roundNo
    );

    // -------------------------------------------------
    // AM2315
    // -------------------------------------------------

    float temperature =
      0.0f;

    float humidity =
      0.0f;

    bool amOK =
      am2315
        .readTemperatureAndHumidity(
          &temperature,
          &humidity
        );

    if (
      amOK &&
      isfinite(temperature) &&
      isfinite(humidity) &&
      temperature >= -40.0f &&
      temperature <= 85.0f &&
      humidity >= 0.0f &&
      humidity <= 100.0f
    ) {

      tempSum +=
        temperature;

      humSum +=
        humidity;

      amCount++;

      Serial.print(
        "  ✅ AM2315: "
      );

      Serial.print(
        temperature,
        2
      );

      Serial.print(
        " °C / "
      );

      Serial.print(
        humidity,
        2
      );

      Serial.println(
        " %"
      );

    } else {

      Serial.println(
        "  ⚠ AM2315: อ่านไม่สำเร็จ / ค่าไม่ถูกต้อง"
      );
    }

    // -------------------------------------------------
    // PMS3003
    //
    // ให้โอกาสหา frame ที่ถูกต้องภายใน 2 วินาที
    // ถ้าไม่ได้ จะข้ามรอบนี้ ไม่เอา 0 ไปเฉลี่ย
    // -------------------------------------------------

    bool pmsOK =
      false;

    unsigned long pmsStart =
      millis();

    while (
      millis() - pmsStart <
      2000UL
    ) {

      if (
        readPMS3003()
      ) {

        pmsOK =
          true;

        break;
      }

      delay(10);
    }

    if (
      pmsOK
    ) {

      pm1Sum +=
        data.pm1;

      pm25Sum +=
        data.pm25;

      pm10Sum +=
        data.pm10;

      pmsCount++;

      Serial.print(
        "  ✅ PMS3003: "
      );

      Serial.print(
        data.pm1
      );

      Serial.print(
        " / "
      );

      Serial.print(
        data.pm25
      );

      Serial.print(
        " / "
      );

      Serial.println(
        data.pm10
      );

    } else {

      Serial.println(
        "  ⚠ PMS3003: อ่านไม่สำเร็จ / frame ไม่ถูกต้อง"
      );
    }

    // -------------------------------------------------
    // BH1750
    // -------------------------------------------------

    float lux =
      lightMeter
        .readLightLevel();

    if (
      isfinite(lux) &&
      lux >= 0.0f &&
      lux <= 200000.0f
    ) {

      lightSum +=
        lux;

      lightCount++;

      Serial.print(
        "  ✅ BH1750: "
      );

      Serial.print(
        lux,
        2
      );

      Serial.println(
        " lux"
      );

    } else {

      Serial.println(
        "  ⚠ BH1750: อ่านไม่สำเร็จ / ค่าไม่ถูกต้อง"
      );
    }

    // -------------------------------------------------
    // WAIT UNTIL ~5 SECONDS PER ROUND
    // -------------------------------------------------

    while (
      millis() - roundStart <
        5000UL &&
      millis() - collectionStart <
        60000UL
    ) {

      delay(20);
    }
  }

  // ===================================================
  // CALCULATE AVERAGE
  // ===================================================

  if (
    amCount > 0
  ) {

    data.temperature =
      (float)(
        tempSum /
        amCount
      );

    data.humidity =
      (float)(
        humSum /
        amCount
      );

    data.am2315Valid =
      1;
  }

  if (
    pmsCount > 0
  ) {

    // PM ใน struct เป็น int
    // ปัดค่าเฉลี่ยเป็นจำนวนเต็มที่ใกล้ที่สุด
    data.pm1 =
      (int)(
        pm1Sum /
        pmsCount +
        0.5
      );

    data.pm25 =
      (int)(
        pm25Sum /
        pmsCount +
        0.5
      );

    data.pm10 =
      (int)(
        pm10Sum /
        pmsCount +
        0.5
      );

    data.pmsValid =
      1;
  }

  if (
    lightCount > 0
  ) {

    data.light =
      (float)(
        lightSum /
        lightCount
      );

    data.bh1750Valid =
      1;
  }

  // ===================================================
  // RESULT
  // ===================================================

  Serial.println();
  Serial.println(
    "========================================"
  );

  Serial.println(
    "📌 ผลเฉลี่ยหลังครบ 1 นาที"
  );

  Serial.print(
    "AM2315 valid samples: "
  );

  Serial.println(
    amCount
  );

  if (
    data.am2315Valid
  ) {

    Serial.print(
      "Temperature AVG: "
    );

    Serial.println(
      data.temperature,
      2
    );

    Serial.print(
      "Humidity AVG: "
    );

    Serial.println(
      data.humidity,
      2
    );

  } else {

    Serial.println(
      "Temperature/Humidity: ไม่มีค่าที่อ่านสำเร็จ"
    );
  }

  Serial.print(
    "PMS3003 valid samples: "
  );

  Serial.println(
    pmsCount
  );

  if (
    data.pmsValid
  ) {

    Serial.print(
      "PM1 AVG: "
    );

    Serial.println(
      data.pm1
    );

    Serial.print(
      "PM2.5 AVG: "
    );

    Serial.println(
      data.pm25
    );

    Serial.print(
      "PM10 AVG: "
    );

    Serial.println(
      data.pm10
    );

  } else {

    Serial.println(
      "PM: ไม่มีค่าที่อ่านสำเร็จ"
    );
  }

  Serial.print(
    "BH1750 valid samples: "
  );

  Serial.println(
    lightCount
  );

  if (
    data.bh1750Valid
  ) {

    Serial.print(
      "Light AVG: "
    );

    Serial.println(
      data.light,
      2
    );

  } else {

    Serial.println(
      "Light: ไม่มีค่าที่อ่านสำเร็จ"
    );
  }

  Serial.println(
    "========================================"
  );
}

bool sendDataToParent() {

  // ใช้ ESP-NOW send callback เท่านั้น
  // ไม่มี Custom ACK จากแม่
  for (
    int attempt = 1;
    attempt <= 3;
    attempt++
  ) {

    sendCallbackReceived =
      false;

    sendSuccess =
      false;

    if (
      esp_now_send(
        receiverMAC,
        (uint8_t*)&data,
        sizeof(data)
      ) == ESP_OK
    ) {

      unsigned long start =
        millis();

      while (
        millis() - start <
        SEND_WAIT
      ) {

        if (
          sendCallbackReceived
        ) {
          break;
        }

        delay(5);
      }

      if (
        sendCallbackReceived &&
        sendSuccess
      ) {

        return true;
      }
    }

    Serial.print(
      "⚠ Sensor retry "
    );

    Serial.print(
      attempt
    );

    Serial.println(
      "/3"
    );

    delay(200);
  }

  return false;
}

bool sendOnlineStatus() {

  status_message s;

  memset(
    &s,
    0,
    sizeof(s)
  );

  strcpy(
    s.deviceID,
    DEVICE_ID
  );

  s.status =
    STATUS_ONLINE;

  // ใช้ ESP-NOW send callback เท่านั้น
  // ไม่มี Custom ACK จากแม่
  for (
    int attempt = 1;
    attempt <= 3;
    attempt++
  ) {

    sendCallbackReceived =
      false;

    sendSuccess =
      false;

    if (
      esp_now_send(
        receiverMAC,
        (uint8_t*)&s,
        sizeof(s)
      ) == ESP_OK
    ) {

      unsigned long start =
        millis();

      while (
        millis() - start <
        SEND_WAIT
      ) {

        if (
          sendCallbackReceived
        ) {
          break;
        }

        delay(5);
      }

      if (
        sendCallbackReceived &&
        sendSuccess
      ) {

        return true;
      }
    }

    delay(150);
  }

  return false;
}

// =====================================================
// SEND SLEEP
// =====================================================

bool sendSleepStatus() {

  status_message s;

  memset(
    &s,
    0,
    sizeof(s)
  );

  strcpy(
    s.deviceID,
    DEVICE_ID
  );

  s.status =
    STATUS_SLEEP;

  // ใช้ ESP-NOW send callback เท่านั้น
  // ไม่มี Custom ACK จากแม่
  for (
    int attempt = 1;
    attempt <= 3;
    attempt++
  ) {

    sendCallbackReceived =
      false;

    sendSuccess =
      false;

    if (
      esp_now_send(
        receiverMAC,
        (uint8_t*)&s,
        sizeof(s)
      ) == ESP_OK
    ) {

      unsigned long start =
        millis();

      while (
        millis() - start <
        SEND_WAIT
      ) {

        if (
          sendCallbackReceived
        ) {
          break;
        }

        delay(5);
      }

      if (
        sendCallbackReceived &&
        sendSuccess
      ) {

        return true;
      }
    }

    Serial.print(
      "⚠ Sleep retry "
    );

    Serial.print(
      attempt
    );

    Serial.println(
      "/3"
    );

    delay(150);
  }

  return false;
}

void goToDeepSleep(){

  Serial.println();

  Serial.print(
    "😴 "
  );

  Serial.print(
    DEVICE_ID
  );

  Serial.println(
    " → REAL DEEP SLEEP 5 นาที"
  );

  esp_sleep_enable_timer_wakeup(
    (uint64_t)
    SLEEP_TIME_MS*
    1000ULL
  );

  Serial.flush();

  delay(100);

  esp_deep_sleep_start();
}

void setup(){

  Serial.begin(115200);

  delay(2000);

  Serial.println(
    "========================================"
  );

  Serial.println(
    " ESP32 NUMBER 2 - 1 MIN AVERAGE VERSION"
  );

  Serial.println(
    "========================================"
  );

  memset(
    &data,
    0,
    sizeof(data)
  );

  strcpy(
    data.deviceID,
    DEVICE_ID
  );

  Wire.begin(
    21,
    22
  );

  delay(500);

  Serial.println(
    am2315.begin()
    ?"✅ AM2315 Ready"
    :"⚠ AM2315 Failed"
  );

  Serial.println(
    lightMeter.begin(
      BH1750::
      CONTINUOUS_HIGH_RES_MODE
    )
    ?"✅ BH1750 Ready"
    :"⚠ BH1750 Failed"
  );

  pmsSerial.begin(
    9600,
    SERIAL_8N1,
    PMS_RX,
    PMS_TX
  );

  Serial.println(
    "⏳ PMS3003 Warm-up 10 วินาทีก่อนเก็บค่า 1 นาที"
  );

  delay(10000);

  WiFi.mode(
    WIFI_STA
  );

  delay(100);

  Serial.print(
    "Child MAC: "
  );

  Serial.println(
    WiFi.macAddress()
  );

  Serial.print(
    "Mother MAC: "
  );

  printMAC(
    receiverMAC
  );

  if(
    esp_now_init()!=
    ESP_OK
  ){

    Serial.println(
      "❌ ESP-NOW Init Failed"
    );

    goToDeepSleep();

    return;
  }

  esp_now_register_send_cb(
    OnDataSent
  );

  esp_now_register_recv_cb(
    OnDataRecv
  );

  // ===================================================
  // FIND MOTHER
  // ===================================================

  if (
    !findParentChannel()
  ) {

    Serial.println(
      "❌ หาแม่ไม่เจอ"
    );

    Serial.println(
      "จะตื่นมาลองใหม่อีก 5 นาที"
    );

    goToDeepSleep();

    return;
  }

  // ===================================================
  // ONLINE STATUS
  // บอกแม่ก่อนว่า "ตื่นแล้ว กำลังเก็บข้อมูล 1 นาที"
  // ===================================================

  if (
    sendOnlineStatus()
  ) {

    Serial.println(
      "🟢 ONLINE ส่งถึงแม่สำเร็จ"
    );

  } else {

    // ถึง status จะพลาด ยังเก็บ Sensor ต่อ
    // เพราะ sensor_message ที่จะส่งภายหลังก็ยืนยันการติดต่อได้
    Serial.println(
      "⚠ ONLINE status ส่งไม่สำเร็จ"
    );
  }

  // ===================================================
  // COLLECT SENSOR FOR 1 MINUTE
  // ===================================================

  readSensors();

  // ===================================================
  // SEND ONE AVERAGED SENSOR PACKET
  // ===================================================

  Serial.println();
  Serial.println(
    "📡 Sending 1-minute Average Sensor Data..."
  );

  bool sensorSent =
    sendDataToParent();

  if (
    sensorSent
  ) {

    Serial.println(
      "✅ SENSOR DATA ส่งถึงแม่สำเร็จ"
    );

  } else {

    Serial.println(
      "❌ SENSOR DATA ส่งไม่สำเร็จหลัง Retry"
    );
  }

  delay(150);

  // ===================================================
  // SLEEP STATUS
  // ส่งแม้ Sensor packet พลาด เพื่อให้แม่รู้ว่าลูกตั้งใจหลับ
  // ===================================================

  if (
    sendSleepStatus()
  ) {

    Serial.println(
      "🟡 SLEEP status ส่งสำเร็จ"
    );

  } else {

    Serial.println(
      "⚠ SLEEP status ส่งไม่สำเร็จ"
    );
  }

  delay(150);

  // ===================================================
  // DEEP SLEEP 5 MINUTES
  // ===================================================

  goToDeepSleep();
}

void loop(){

  delay(1000);
}