// app.js
// Interfaz, pre-permiso y consumo de geo-helper.js (que debe cargarse antes).
// Sin async/await: toda la asincronía con .then() / .catch() / .finally().

const formReporte = document.getElementById('form-reporte');
const inputTitulo = document.getElementById('titulo');
const inputDescripcion = document.getElementById('descripcion');
const btnAdjuntar = document.getElementById('btn-adjuntar-ubicacion');
const btnSucursales = document.getElementById('btn-sucursales');
const mensajeEstado = document.getElementById('mensaje-estado');

const avisoUbicacion = document.getElementById('aviso-ubicacion');
const btnConfirmar = document.getElementById('btn-confirmar-ubicacion');
const btnZonaManual = document.getElementById('btn-zona-manual');

const tarjetaResultado = document.getElementById('resultado-ubicacion');
const badgePrecision = document.getElementById('badge-precision');
const datoLatitud = document.getElementById('dato-latitud');
const datoLongitud = document.getElementById('dato-longitud');
const datoPrecision = document.getElementById('dato-precision');
const datoHora = document.getElementById('dato-hora');
const enlaceMapa = document.getElementById('enlace-mapa');

const selectorManual = document.getElementById('selector-manual');
const ayudaPermiso = document.getElementById('ayuda-permiso');
const selectZona = document.getElementById('select-zona');
const inputDireccion = document.getElementById('input-direccion');
const btnUsarZona = document.getElementById('btn-usar-zona');

const tarjetaPaquete = document.getElementById('tarjeta-paquete');
const vistaPaquete = document.getElementById('vista-paquete');

// Sucursales de ejemplo: alimentan el selector manual y el cálculo de cercanía
const SUCURSALES = [
  { id: 'cdmx', nombre: 'Ciudad de México', latitud: 19.4326, longitud: -99.1332 },
  { id: 'gdl', nombre: 'Guadalajara', latitud: 20.6597, longitud: -103.3496 },
  { id: 'mty', nombre: 'Monterrey', latitud: 25.6866, longitud: -100.3161 },
  { id: 'pue', nombre: 'Puebla', latitud: 19.0414, longitud: -98.2063 },
  { id: 'qro', nombre: 'Querétaro', latitud: 20.5888, longitud: -100.3899 }
];

/* ---------- Service Worker ---------- */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then((registro) => console.log('[SW] Registrado con scope:', registro.scope))
    .catch((error) => console.error('[SW] Error al registrar:', error));
}

/* ---------- Helpers de interfaz ---------- */

function mostrarCargando(texto) {
  mensajeEstado.textContent = texto;
  mensajeEstado.className = 'estado';
  btnAdjuntar.disabled = true;
  btnSucursales.disabled = true;
}

function terminarCarga() {
  btnAdjuntar.disabled = false;
  btnSucursales.disabled = false;
}

function mostrarMensajeExito(texto) {
  mensajeEstado.textContent = texto;
  mensajeEstado.className = 'estado estado-ok';
}

function mostrarMensajeError(texto) {
  mensajeEstado.textContent = texto;
  mensajeEstado.className = 'estado estado-error';
}

function leerFormulario() {
  return {
    titulo: inputTitulo.value.trim(),
    descripcion: inputDescripcion.value.trim()
  };
}

function mostrarPaquete(paquete) {
  vistaPaquete.textContent = JSON.stringify(paquete, null, 2);
  tarjetaPaquete.hidden = false;
}

// Indicador de calidad de señal: < 30 m alta, el resto aproximada
function renderizarResultadoUbicacion(ubicacion) {
  const calidad = clasificarPrecision(ubicacion.precisionMetros);

  datoLatitud.textContent = ubicacion.latitud.toFixed(6);
  datoLongitud.textContent = ubicacion.longitud.toFixed(6);
  datoPrecision.textContent = `± ${ubicacion.precisionMetros} m`;
  datoHora.textContent = new Date(ubicacion.timestamp).toLocaleTimeString('es-MX');

  badgePrecision.textContent = calidad.etiqueta;
  badgePrecision.className = `badge badge-${calidad.nivel}`;

  enlaceMapa.href = `https://www.openstreetmap.org/?mlat=${ubicacion.latitud}&mlon=${ubicacion.longitud}#map=17/${ubicacion.latitud}/${ubicacion.longitud}`;

  tarjetaResultado.hidden = false;
  selectorManual.hidden = true;
}

// Plan B: el usuario nunca queda bloqueado
function habilitarSelectorManualZona(permisoBloqueado) {
  ayudaPermiso.hidden = !permisoBloqueado;
  selectorManual.hidden = false;
  selectorManual.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- Fragmento C, uso 1: adjuntar coordenadas al reporte ---------- */

function enviarReporteConUbicacion(datosFormulario) {
  mostrarCargando('Obteniendo coordenadas...');

  return obtenerUbicacionActual({ enableHighAccuracy: true, timeout: 7000 })
    .then((ubicacion) => {
      const paqueteCompleto = Object.assign({}, datosFormulario, {
        coordenadas: ubicacion
      });
      console.log('Paquete listo para enviar o encolar en IndexedDB:', paqueteCompleto);
      renderizarResultadoUbicacion(ubicacion);
      mostrarPaquete(paqueteCompleto);
      mostrarMensajeExito('Ubicación adjunta al reporte.');
    })
    .catch((error) => {
      console.warn('[Geo] Fallback activado:', error.message);
      mostrarMensajeError(error.message);
      habilitarSelectorManualZona(error.codigo === 1); // 1 = PERMISSION_DENIED
    })
    .finally(terminarCarga);
}

/* ---------- Fragmento C, uso 2: lectura rápida de baja precisión ---------- */

function buscarSucursalesCercanas() {
  // Baja precisión + caché de 1 minuto: rápido y sin forzar el GPS
  return obtenerUbicacionActual({ enableHighAccuracy: false, maximumAge: 60000 })
    .then((ubicacion) => {
      console.log(`Filtrando sucursales cerca de ${ubicacion.latitud}, ${ubicacion.longitud}`);

      const ordenadas = SUCURSALES
        .map((sucursal) => Object.assign({}, sucursal, {
          distanciaKm: calcularDistanciaKm(ubicacion.latitud, ubicacion.longitud, sucursal.latitud, sucursal.longitud)
        }))
        .sort((a, b) => a.distanciaKm - b.distanciaKm);

      return ordenadas[0];
    });
}

/* ---------- Flujo de pre-permiso ---------- */

btnAdjuntar.addEventListener('click', () => {
  avisoUbicacion.hidden = true;

  consultarEstadoPermisoGeo()
    .then((estado) => {
      console.log('[Geo] Estado del permiso:', estado);

      if (estado === 'granted') {
        // Ya lo autorizó antes: no hace falta volver a explicar
        return enviarReporteConUbicacion(leerFormulario());
      }

      if (estado === 'denied') {
        // JS ya no puede abrir el diálogo: ir directo al Plan B
        mostrarMensajeError('El permiso de ubicación está bloqueado en este navegador.');
        habilitarSelectorManualZona(true);
        return;
      }

      // 'prompt': explicar primero, el diálogo nativo saldrá al confirmar
      avisoUbicacion.hidden = false;
      avisoUbicacion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
});

// Confirmación consciente: este clic es el gesto directo que iOS exige
btnConfirmar.addEventListener('click', () => {
  avisoUbicacion.hidden = true;
  enviarReporteConUbicacion(leerFormulario());
});

// Rechazo amable: no se llama a la API, el permiso sigue en 'prompt'
btnZonaManual.addEventListener('click', () => {
  avisoUbicacion.hidden = true;
  mostrarMensajeExito('Sin problema, indica tu zona manualmente.');
  habilitarSelectorManualZona(false);
});

/* ---------- Plan B: zona manual ---------- */

btnUsarZona.addEventListener('click', () => {
  const sucursal = SUCURSALES.find((s) => s.id === selectZona.value);
  const paquete = Object.assign({}, leerFormulario(), {
    ubicacionManual: {
      zona: sucursal.nombre,
      direccion: inputDireccion.value.trim() || null
    }
  });

  tarjetaResultado.hidden = true;
  mostrarPaquete(paquete);
  mostrarMensajeExito(`Zona manual adjunta: ${sucursal.nombre}.`);
});

/* ---------- Sucursal más cercana ---------- */

btnSucursales.addEventListener('click', () => {
  mostrarCargando('Buscando la sucursal más cercana...');

  buscarSucursalesCercanas()
    .then((cercana) => {
      mostrarMensajeExito(`Sucursal más cercana: ${cercana.nombre} (a ${cercana.distanciaKm.toFixed(1)} km).`);
    })
    .catch((error) => {
      mostrarMensajeError(error.message);
      habilitarSelectorManualZona(error.codigo === 1);
    })
    .finally(terminarCarga);
});

/* ---------- Inicio ---------- */

SUCURSALES.forEach((sucursal) => {
  const opcion = document.createElement('option');
  opcion.value = sucursal.id;
  opcion.textContent = sucursal.nombre;
  selectZona.appendChild(opcion);
});
// Importante: aquí NO se pide la ubicación. Solo se pide tras un clic del usuario.
