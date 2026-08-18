<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// เชื่อมต่อ MySQL
$host = "localhost";
$user = "root";
$password = "";
$database = "pm25_monitoring";

// เชื่อมต่อฐานข้อมูล
$conn = new mysqli($host, $user, $password, $database);

// ตรวจสอบการเชื่อมต่อ
if ($conn->connect_error) {
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed",
        "error" => $conn->connect_error
    ]);
    exit;
}

$conn->set_charset("utf8mb4");

// ดึงข้อมูลล่าสุด
$sql = "SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1";

$result = $conn->query($sql);

if (!$result) {
    echo json_encode([
        "success" => false,
        "message" => "SQL query failed",
        "error" => $conn->error
    ]);
    exit;
}

if ($result->num_rows > 0) {

    $data = $result->fetch_assoc();

    echo json_encode([
        "success" => true,
        "data" => $data
    ], JSON_UNESCAPED_UNICODE);

} else {

    echo json_encode([
        "success" => false,
        "message" => "No sensor data found"
    ]);
}

$conn->close();

?>