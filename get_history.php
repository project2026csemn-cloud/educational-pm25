<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");

mysqli_report(MYSQLI_REPORT_OFF);

/*
====================================================
DATABASE
====================================================
*/

$host = "localhost";
$user = "root";
$password = "";
$database = "pm25_monitoring";


$conn = new mysqli(
    $host,
    $user,
    $password,
    $database
);


/*
====================================================
CHECK DATABASE
====================================================
*/

if ($conn->connect_error) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed",
        "error" => $conn->connect_error
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


$conn->set_charset("utf8mb4");


/*
====================================================
GET RANGE
====================================================

รองรับ:

24h
7d
30d

และยังรองรับ limit แบบเดิมด้วย
====================================================
*/

$range = isset($_GET["range"])
    ? strtolower(trim($_GET["range"]))
    : "24h";


/*
====================================================
กำหนดเวลาย้อนหลัง
====================================================
*/

switch ($range) {

    case "7d":

        $interval = "7 DAY";

        break;


    case "30d":

        $interval = "30 DAY";

        break;


    case "24h":

    default:

        $interval = "24 HOUR";

        break;

}


/*
====================================================
SQL

ดึงข้อมูลจาก sensor_data
ใหม่ -> เก่า

แล้ว Dashboard จะเป็นคนเรียงกลับ
เก่า -> ใหม่
====================================================
*/

$sql = "

    SELECT

        id,

        device_id,

        recorded_at,

        pm1,

        pm25,

        pm10,

        temperature,

        humidity,

        light

    FROM sensor_data

    WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL $interval)

    ORDER BY recorded_at DESC

";


$result = $conn->query($sql);


/*
====================================================
CHECK QUERY
====================================================
*/

if (!$result) {

    http_response_code(500);

    echo json_encode([

        "success" => false,

        "message" => "SQL query failed",

        "error" => $conn->error,

        "sql" => $sql

    ], JSON_UNESCAPED_UNICODE);

    $conn->close();

    exit;
}


/*
====================================================
BUILD DATA
====================================================
*/

$data = [];


while ($row = $result->fetch_assoc()) {

    $data[] = [

        "id" =>
            (int)$row["id"],

        "device_id" =>
            $row["device_id"],

        "recorded_at" =>
            $row["recorded_at"],

        "pm1" =>
            $row["pm1"] === null
                ? null
                : (float)$row["pm1"],

        "pm25" =>
            $row["pm25"] === null
                ? null
                : (float)$row["pm25"],

        "pm10" =>
            $row["pm10"] === null
                ? null
                : (float)$row["pm10"],

        "temperature" =>
            $row["temperature"] === null
                ? null
                : (float)$row["temperature"],

        "humidity" =>
            $row["humidity"] === null
                ? null
                : (float)$row["humidity"],

        "light" =>
            $row["light"] === null
                ? null
                : (float)$row["light"]

    ];

}


/*
====================================================
JSON RESPONSE
====================================================
*/

echo json_encode([

    "success" => true,

    "range" => $range,

    "count" => count($data),

    "data" => $data

], JSON_UNESCAPED_UNICODE);


/*
====================================================
CLOSE
====================================================
*/

$conn->close();

?>
