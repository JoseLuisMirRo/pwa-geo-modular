// geo-helper.js - Módulo reutilizable de geolocalización en Vanilla JS
// Convierte la API de callbacks (navigator.geolocation) en funciones que devuelven Promesas.
// No toca el DOM: cualquier pantalla de app.js puede reutilizarlo.

/* ---------- Fragmento A: traducción de errores ---------- */

function traducirErrorGeolocalizacion(error) {
  switch (error.code) {
    case 1: // error.PERMISSION_DENIED
      return 'Permiso de ubicación denegado. Puedes ingresar tu zona manualmente.';
    case 2: // error.POSITION_UNAVAILABLE
      return 'No fue posible determinar tu ubicación (señal GPS o Wi-Fi no disponible).';
    case 3: // error.TIMEOUT
      return 'Se agotó el tiempo de espera intentando obtener las coordenadas.';
    default:
      return 'Ocurrió un error inesperado al consultar la ubicación.';
  }
}

/* ---------- Fragmento A: lectura única promisificada ---------- */

function obtenerUbicacionActual(opcionesPersonalizadas) {
  // Las opciones del consumidor sobrescriben a las de por defecto
  const opciones = Object.assign(
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000 // Acepta una lectura reciente de hasta 30 segundos
    },
    opcionesPersonalizadas
  );

  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este navegador no soporta la API de Geolocalización.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        // Se normaliza la salida: todos los consumidores reciben la misma forma
        resolve({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
          precisionMetros: Math.round(posicion.coords.accuracy),
          timestamp: posicion.timestamp
        });
      },
      (error) => {
        // Se conserva el código numérico por si el consumidor quiere distinguir el caso
        const errorTraducido = new Error(traducirErrorGeolocalizacion(error));
        errorTraducido.codigo = error.code;
        reject(errorTraducido);
      },
      opciones
    );
  });
}

/* ---------- Fragmento B: estado del permiso sin disparar el diálogo ---------- */

function consultarEstadoPermisoGeo() {
  if (!('permissions' in navigator)) {
    return Promise.resolve('prompt');
  }

  return navigator.permissions.query({ name: 'geolocation' })
    .then((resultado) => resultado.state) // 'granted', 'denied' o 'prompt'
    .catch(() => 'prompt');
}

/* ---------- Utilidades puras reutilizables ---------- */

// Clasifica la calidad de la señal a partir de accuracy (metros)
function clasificarPrecision(precisionMetros) {
  return precisionMetros < 30
    ? { nivel: 'alta', etiqueta: 'Precisión GPS Alta' }
    : { nivel: 'aproximada', etiqueta: 'Ubicación Aproximada (Wi-Fi / IP)' };
}

// Distancia en km entre dos coordenadas (fórmula de Haversine)
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const RADIO_TIERRA_KM = 6371;
  const aRad = (grados) => grados * Math.PI / 180;
  const dLat = aRad(lat2 - lat1);
  const dLon = aRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return RADIO_TIERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
