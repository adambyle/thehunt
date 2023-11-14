function distanceBetween(pos1, pos2) {
    const [lat1, lon1] = pos1;
    const [lat2, lon2] = pos2;
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    const distanceFeet = distanceKm * 3280.84; // Convert km to feet
    return distanceFeet;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

const feetPerDegLong = distanceBetween(42.935, 0, 42.935, 1);
const degLongPerFoot = 1 / feetPerDegLong;
const degLongPerDegLat = feetPerDegLong / distanceBetween(0, 0, 1, 0);

exports.calculateDistance = distanceBetween;
