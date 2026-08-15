<?php
// ================== ALGORITMA HAVERSINE (SERVER-SIDE) ==================
// Menghitung jarak (dalam meter) antara dua titik koordinat GPS di permukaan bumi.
// Dijalankan di server (bukan di JS browser) supaya tidak bisa dimanipulasi client.
function hitungJarakMeter(float $lat1, float $lng1, float $lat2, float $lng2): float {
    $R = 6371000; // radius bumi dalam meter
    $toRad = fn($d) => $d * M_PI / 180;

    $dLat = $toRad($lat2 - $lat1);
    $dLng = $toRad($lng2 - $lng1);

    $a = sin($dLat / 2) ** 2
        + cos($toRad($lat1)) * cos($toRad($lat2)) * sin($dLng / 2) ** 2;
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

    return $R * $c;
}

// Cari kantor/cabang TERDEKAT dari titik (lat,lng) di antara kantor milik
// SATU perusahaan (company_id) saja -- supaya staff Perusahaan A tidak pernah
// tervalidasi terhadap lokasi kantor milik Perusahaan B, atau sebaliknya.
// Mengembalikan null kalau perusahaan itu belum punya kantor sama sekali.
function findNearestOffice(PDO $pdo, int $companyId, float $lat, float $lng): ?array {
    $stmt = $pdo->prepare('SELECT * FROM office_locations WHERE company_id = ?');
    $stmt->execute([$companyId]);
    $offices = $stmt->fetchAll();
    if (!$offices) return null;

    $nearest = null;
    foreach ($offices as $office) {
        $dist = hitungJarakMeter($lat, $lng, (float)$office['lat'], (float)$office['lng']);
        if ($nearest === null || $dist < $nearest['distance']) {
            $nearest = [
                'office'   => $office,
                'distance' => (int) round($dist),
                'valid'    => $dist <= (float) $office['radius'],
            ];
        }
    }
    return $nearest;
}