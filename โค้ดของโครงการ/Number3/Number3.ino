#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_now.h>

#include <Wire.h>
#include <Adafruit_AM2315.h>
#include <BH1750.h>

#define DEVICE_ID "Number 3"
#define DEVICE_NUMBER 3

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
  data.am2315Valid=0;
  data.pmsValid=0;
  data.bh1750Valid=0;

  float temperature=0.0f;
  float humidity=0.0f;
  if(am2315.readTemperatureAndHumidity(&temperature,&humidity)&&isfinite(temperature)&&isfinite(humidity)){
    data.temperature=temperature;
    data.humidity=humidity;
    data.am2315Valid=1;
    Serial.println("✅ AM2315 OK");
  }else{
    Serial.println("⚠ AM2315 อ่านไม่สำเร็จ");
  }

  bool pmsOK=false;
  unsigned long start=millis();
  while(millis()-start<3000UL){
    if(readPMS3003()){
      pmsOK=true;
      break;
    }
    delay(10);
  }
  if(pmsOK){
    data.pmsValid=1;
    Serial.println("✅ PMS3003 OK");
  }else{
    Serial.println("⚠ PMS3003 อ่านไม่สำเร็จ");
  }

  float lux=lightMeter.readLightLevel();
  if(isfinite(lux)&&lux>=0.0f){
    data.light=lux;
    data.bh1750Valid=1;
    Serial.println("✅ BH1750 OK");
  }else{
    Serial.println("⚠ BH1750 อ่านไม่สำเร็จ");
  }
}

bool sendDataToParent(){

  sendCallbackReceived=false;
  sendSuccess=false;

  if(
    esp_now_send(
      receiverMAC,
      (uint8_t*)&data,
      sizeof(data)
    )!=ESP_OK
  ){
    return false;
  }

  unsigned long start=
    millis();

  while(
    millis()-start<
    SEND_WAIT
  ){

    if(
      sendCallbackReceived
    ){
      break;
    }

    delay(5);
  }

  return(
    sendCallbackReceived&&
    sendSuccess
  );
}

bool sendSleepStatus(){

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

  s.status=
    STATUS_SLEEP;

  sendCallbackReceived=false;
  sendSuccess=false;

  if(
    esp_now_send(
      receiverMAC,
      (uint8_t*)&s,
      sizeof(s)
    )!=ESP_OK
  ){
    return false;
  }

  unsigned long start=
    millis();

  while(
    millis()-start<
    SEND_WAIT
  ){

    if(
      sendCallbackReceived
    ){
      break;
    }

    delay(5);
  }

  return(
    sendCallbackReceived&&
    sendSuccess
  );
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
    " ESP32 NUMBER 3 - FINAL VERSION"
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
    "⏳ PMS3003 Warm-up 10 วินาที"
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

  if(
    !findParentChannel()
  ){

    Serial.println(
      "❌ หาแม่ไม่เจอ"
    );

    Serial.println(
      "จะตื่นมาลองใหม่อีก 5 นาที"
    );

    goToDeepSleep();

    return;
  }

  Serial.println(
    "📊 Reading Sensors..."
  );

  readSensors();

  Serial.println(
    "📡 Sending Sensor Data..."
  );

  if(
    !sendDataToParent()
  ){

    Serial.println(
      "❌ ส่ง Sensor ไม่สำเร็จ"
    );

    goToDeepSleep();

    return;
  }

  Serial.println(
    "🟢 NUMBER 3 ONLINE"
  );

  delay(150);

  if(
    sendSleepStatus()
  ){

    Serial.println(
      "🟡 SLEEP status ส่งสำเร็จ"
    );

  }else{

    Serial.println(
      "⚠ SLEEP status ส่งไม่สำเร็จ"
    );
  }

  delay(150);

  goToDeepSleep();
}

void loop(){

  delay(1000);
}