/**
 * Menghitung jarak geodesic antara dua koordinat GPS menggunakan formula Haversine.
 * @param {number} lat1 Latitude titik 1
 * @param {number} lon1 Longitude titik 1
 * @param {number} lat2 Latitude titik 2
 * @param {number} lon2 Longitude titik 2
 * @returns {number} Jarak dalam satuan meter
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return null;
  }

  const R = 6371e3; // Radius bumi dalam meter
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceMeters = R * c;
  return Math.round(distanceMeters * 10) / 10; // 1 desimal
}

/**
 * Format jarak ke teks yang mudah dibaca (contoh: "85 m" atau "1.42 km")
 * @param {number} meters 
 * @returns {string}
 */
function formatDistance(meters) {
  if (meters === null || meters === undefined) return 'Jarak tidak diketahui';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

module.exports = {
  calculateHaversineDistance,
  formatDistance
};
