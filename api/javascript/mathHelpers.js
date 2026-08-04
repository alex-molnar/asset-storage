const currentDate = new Date().toISOString().split("T")[0];

function toNum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = hash + str.charCodeAt(i);
    }
    return parseInt((hash / str.length).toFixed(2).replace('.', ''));
}

export function mathDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const d = R * c; // in metres
    return Math.round(d / 1000)
}

export function getDirection(angle) {
    if (angle <= 22.5 && angle >= -22.5) {
        return {
            directionShort: "S",
            direction: "south",
            directionIcon: "⬇️"
        }
    } else if(angle < -22.5 && angle > -67.5) {
        return {
            directionShort: "SE",
            direction: "southeast",
            directionIcon: "↘️"
        }
    } else if (angle <= -67.5 && angle >= -112.5) {
        return {
            directionShort: "E",
            direction: "east",
            directionIcon: "➡️"
        }
    } else if (angle < -112.5 && angle > -157.5) {
        return {
            directionShort: "NE",
            direction: "northeast",
            directionIcon: "↗️"
        }
    } else if (angle <= -157.5 || angle >= 157.5) {
        return {
            directionShort: "N",
            direction: "north",
            directionIcon: "⬆️"
        }
    } else if (angle < 157.5 && angle > 112.5) {
        return {
            directionShort: "NW",
            direction: "northwest",
            directionIcon: "↖️"
        }
    } else if (angle <= 112.5 && angle >= 67.5) {
        return {
            directionShort: "W",
            direction: "west",
            directionIcon: "⬅️"
        }
    } else if (angle < 67.5 && angle > 22.5) {
        return {
            directionShort: "SW",
            direction: "southwest",
            directionIcon: "↙️"
        }
    }
}

export function getRandomSelectionForToday(selections, salt) {
  const seed = parseInt(currentDate.replaceAll("-", "")) + toNum(salt);
  // LCG using GCC's constants
  const m = 0x80000000; // 2**31;
  const a = 1103515245;
  const c = 12345;

  return selections[Math.floor((((a * seed + c) % m) / m) * selections.length)]
}

export function getItemForToday(site, item) { 
    if (localStorage.getItem(`${site}-${currentDate}`) != null) {
        return JSON.parse(localStorage.getItem(`${site}-${currentDate}`))
    } else {
        localStorage.clear() // TODO keep stats
        localStorage.setItem(`${site}-${currentDate}`, JSON.stringify(item))
        return item
    }
}

// TODO implement handleLocalStorage for stats keeping