<?php

header("Content-Type: application/json; charset=UTF-8");

mysqli_report(MYSQLI_REPORT_OFF);


/*
====================================================
DATABASE — CLOUD
====================================================
*/

$host = "sql107.infinityfree.com";

$user = "if0_42617484";

$password = "watniwet2026";

$database = "if0_42617484_pm25monitoring";


$conn = new mysqli(
    $host,
    $user,
    $password,
    $database
);


/*
====================================================
ตรวจสอบการเชื่อมต่อ Database
====================================================
*/

if ($conn->connect_error) {

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed",
        "error" => $conn->connect_error
    ]);

    exit;

}


$conn->set_charset("utf8mb4");


/*
====================================================
รับข้อมูลจาก ESP32
====================================================
*/

$device_id =
    $_POST["device_id"] ?? null;

$pm1 =
    $_POST["pm1"] ?? null;

$pm25 =
    $_POST["pm25"] ?? null;

$pm10 =
    $_POST["pm10"] ?? null;

$temperature =
    $_POST["temperature"] ?? null;

$humidity =
    $_POST["humidity"] ?? null;

$light =
    $_POST["light"] ?? null;


/*
====================================================
ตรวจสอบข้อมูลจำเป็น
====================================================
*/

if (
    $device_id === null ||
    $pm1 === null ||
    $pm25 === null ||
    $pm10 === null ||
    $temperature === null ||
    $humidity === null
) {

    echo json_encode([
        "success" => false,
        "message" => "Missing required data"
    ]);

    exit;

}


/*
====================================================
แปลงข้อมูลเป็นตัวเลข
====================================================
*/

$pm1 =
    (int)$pm1;

$pm25 =
    (int)$pm25;

$pm10 =
    (int)$pm10;

$temperature =
    (float)$temperature;

$humidity =
    (float)$humidity;

$light =
    $light === null
        ? null
        : (float)$light;


/*
====================================================
INSERT DATABASE
====================================================
*/

$sql = "

    INSERT INTO sensor_data

    (
        device_id,
        recorded_at,
        pm1,
        pm25,
        pm10,
        temperature,
        humidity,
        light
    )

    VALUES

    (
        ?,
        NOW(),
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
    )

";


$stmt =
    $conn->prepare($sql);


/*
====================================================
ตรวจสอบ SQL
====================================================
*/

if (!$stmt) {

    echo json_encode([
        "success" => false,
        "message" => "SQL prepare failed",
        "error" => $conn->error
    ]);

    exit;

}


/*
====================================================
Bind Parameters

s = string
i = integer
d = double
====================================================
*/

$stmt->bind_param(
    "siiiddd",
    $device_id,
    $pm1,
    $pm25,
    $pm10,
    $temperature,
    $humidity,
    $light
);


/*
====================================================
EXECUTE
====================================================
*/

if ($stmt->execute()) {

    echo json_encode([

        "success" => true,

        "message" =>
            "Data saved successfully",

        "id" =>
            $stmt->insert_id

    ]);

} else {

    echo json_encode([

        "success" => false,

        "message" =>
            "SQL insert failed",

        "error" =>
            $stmt->error

    ]);

}


/*
====================================================
CLOSE
====================================================
*/

$stmt->close();

$conn->close();

?>