(function () {
  'use strict';

  /* ---------- Datos del estudio ---------- */

  // Horas de inicio (formato 24 h) por día de la semana: 0 = domingo … 6 = sábado
  var HORAS_SEMANA = [6, 7, 8, 9, 16, 17, 18, 19];
  var HORAS_SABADO = [7, 8, 9, 10];

  function horasDelDia(dia) {
    if (dia === 0) return [];
    if (dia === 6) return HORAS_SABADO;
    return HORAS_SEMANA;
  }

  var CLASES = {
    reformer: { nombre: 'Pilates Reformer', duracion: '50 min', grupal: true },
    mat: { nombre: 'Pilates Mat', duracion: '45 min', grupal: true },
    stretch: { nombre: 'Stretch & Mobility', duracion: '45 min', grupal: true },
    cadillac: { nombre: 'Pilates Cadillac', duracion: '55 min', grupal: false },
    personalizado: { nombre: 'Pilates Personalizado', duracion: '60 min', grupal: false }
  };

  var CLASES_OFERTA = ['reformer', 'mat'];

  function formatoHora(h) {
    var sufijo = h < 12 ? 'a. m.' : 'p. m.';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':00 ' + sufijo;
  }

  function formatoPesos(valor) {
    return '$' + valor.toLocaleString('es-CO');
  }

  /* ---------- Encabezado y navegación ---------- */

  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav-principal');

  function cerrarMenu() {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () {
    var abierto = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(abierto));
  });

  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) cerrarMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      cerrarMenu();
      toggle.focus();
    }
  });

  function marcarScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', marcarScroll, { passive: true });
  marcarScroll();

  /* ---------- Tabla de horarios ---------- */

  var cuerpoTabla = document.getElementById('timetable-body');
  var bloques = [
    { titulo: 'Mañana', horas: [6, 7, 8, 9, 10] },
    { titulo: 'Tarde', horas: [16, 17, 18, 19] }
  ];
  var ordenDias = [1, 2, 3, 4, 5, 6, 0]; // lunes a domingo

  bloques.forEach(function (bloque) {
    var filaTitulo = document.createElement('tr');
    filaTitulo.className = 'block-row';
    filaTitulo.innerHTML = '<th scope="rowgroup" colspan="8">' + bloque.titulo + '</th>';
    cuerpoTabla.appendChild(filaTitulo);

    bloque.horas.forEach(function (h) {
      var fila = document.createElement('tr');
      var celdas = '<th scope="row">' + formatoHora(h) + '</th>';
      ordenDias.forEach(function (dia) {
        var hay = horasDelDia(dia).indexOf(h) !== -1;
        var clase = dia === 0 ? ' class="is-closed"' : '';
        celdas += '<td' + clase + '>' + (hay
          ? '<span class="dot" aria-hidden="true"></span><span class="sr-only">Hay clase</span>'
          : '<span class="sr-only">Sin clase</span>') + '</td>';
      });
      fila.innerHTML = celdas;
      cuerpoTabla.appendChild(fila);
    });
  });

  /* ---------- Formulario de reserva (demostración) ---------- */

  var form = document.getElementById('booking-form');
  var done = document.getElementById('booking-done');
  var campoClase = document.getElementById('f-clase');
  var campoFecha = document.getElementById('f-fecha');
  var campoHora = document.getElementById('f-hora');
  var campoPrimera = document.getElementById('f-primera');
  var ofertaWrap = document.getElementById('oferta-wrap');

  function aISO(fecha) {
    var m = String(fecha.getMonth() + 1).padStart(2, '0');
    var d = String(fecha.getDate()).padStart(2, '0');
    return fecha.getFullYear() + '-' + m + '-' + d;
  }

  function desdeISO(valor) {
    var p = valor.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  var limite = new Date(hoy);
  limite.setDate(limite.getDate() + 60);
  campoFecha.min = aISO(hoy);
  campoFecha.max = aISO(limite);

  function actualizarHoras() {
    campoHora.innerHTML = '';
    var errorFecha = '';

    if (!campoFecha.value) {
      campoHora.disabled = true;
      campoHora.add(new Option('Elige primero la fecha', ''));
      return errorFecha;
    }

    var fecha = desdeISO(campoFecha.value);
    var horas = horasDelDia(fecha.getDay());

    // Si la fecha es hoy, solo se ofrecen las horas que aún no han comenzado
    if (fecha.getTime() === hoy.getTime()) {
      var ahora = new Date().getHours();
      horas = horas.filter(function (h) { return h > ahora; });
    }

    if (fecha < hoy || fecha > limite) {
      errorFecha = 'Elige una fecha entre hoy y los próximos 60 días.';
    } else if (fecha.getDay() === 0) {
      errorFecha = 'Los domingos y festivos el estudio está cerrado.';
    } else if (!horas.length) {
      errorFecha = 'Ya no quedan clases para hoy. Elige otra fecha.';
    }

    if (errorFecha) {
      campoHora.disabled = true;
      campoHora.add(new Option('Sin horarios disponibles', ''));
    } else {
      campoHora.disabled = false;
      campoHora.add(new Option('Selecciona la hora', ''));
      horas.forEach(function (h) { campoHora.add(new Option(formatoHora(h), String(h))); });
    }
    return errorFecha;
  }

  function actualizarOferta() {
    var aplica = CLASES_OFERTA.indexOf(campoClase.value) !== -1;
    ofertaWrap.hidden = !aplica;
    if (!aplica) campoPrimera.checked = false;
  }

  function mostrarError(id, mensaje) {
    var campo = document.getElementById('f-' + id);
    var error = document.getElementById('e-' + id);
    error.textContent = mensaje || '';
    if (mensaje) {
      campo.setAttribute('aria-invalid', 'true');
      campo.setAttribute('aria-describedby', 'e-' + id);
    } else {
      campo.removeAttribute('aria-invalid');
      campo.removeAttribute('aria-describedby');
    }
  }

  campoFecha.addEventListener('change', function () {
    mostrarError('fecha', actualizarHoras());
    mostrarError('hora', '');
  });
  campoClase.addEventListener('change', function () {
    actualizarOferta();
    mostrarError('clase', '');
  });

  ['nombre', 'correo', 'telefono', 'hora'].forEach(function (id) {
    document.getElementById('f-' + id).addEventListener('input', function () { mostrarError(id, ''); });
  });
  document.getElementById('f-datos').addEventListener('change', function () { mostrarError('datos', ''); });

  function validar() {
    var errores = {};
    var correo = document.getElementById('f-correo').value.trim();
    var telefono = document.getElementById('f-telefono').value.replace(/[^\d]/g, '');

    if (!campoClase.value) errores.clase = 'Selecciona el tipo de clase.';
    if (!campoFecha.value) errores.fecha = 'Elige una fecha.';
    else {
      var errorFecha = actualizarHorasSinPerderSeleccion();
      if (errorFecha) errores.fecha = errorFecha;
    }
    if (!errores.fecha && !campoHora.value) errores.hora = 'Selecciona la hora.';
    if (document.getElementById('f-nombre').value.trim().length < 3) errores.nombre = 'Escribe tu nombre completo.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) errores.correo = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
    if (telefono.length < 7 || telefono.length > 13) errores.telefono = 'Escribe un número de teléfono válido.';
    if (!document.getElementById('f-datos').checked) errores.datos = 'Necesitamos tu autorización para gestionar la reserva.';

    ['clase', 'fecha', 'hora', 'nombre', 'correo', 'telefono', 'datos'].forEach(function (id) {
      mostrarError(id, errores[id]);
    });
    return Object.keys(errores);
  }

  // Revalida la fecha (por si cambió la hora actual) conservando la hora elegida
  function actualizarHorasSinPerderSeleccion() {
    var elegida = campoHora.value;
    var error = actualizarHoras();
    if (elegida && !error) {
      var sigue = Array.prototype.some.call(campoHora.options, function (o) { return o.value === elegida; });
      if (sigue) campoHora.value = elegida;
    }
    return error;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var errores = validar();
    if (errores.length) {
      document.getElementById('f-' + errores[0]).focus();
      return;
    }

    var clase = CLASES[campoClase.value];
    var fecha = desdeISO(campoFecha.value);
    var fechaTexto = fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var valor;
    if (campoPrimera.checked) valor = formatoPesos(25000) + ' (primera clase)';
    else if (clase.grupal) valor = formatoPesos(45000) + ' o una clase de tu plan';
    else valor = formatoPesos(95000) + ' (sesión privada)';

    document.getElementById('d-codigo').textContent = 'OP-' + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('d-clase').textContent = clase.nombre + ' · ' + clase.duracion;
    document.getElementById('d-fecha').textContent = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);
    document.getElementById('d-hora').textContent = formatoHora(Number(campoHora.value));
    document.getElementById('d-nombre').textContent = document.getElementById('f-nombre').value.trim();
    document.getElementById('d-valor').textContent = valor;

    form.hidden = true;
    done.hidden = false;
    done.focus();
  });

  document.getElementById('booking-reset').addEventListener('click', function () {
    form.reset();
    actualizarHoras();
    actualizarOferta();
    done.hidden = true;
    form.hidden = false;
    campoClase.focus();
  });

  /* ---------- Enlaces que preseleccionan clase u oferta ---------- */

  document.addEventListener('click', function (e) {
    var enlace = e.target.closest('[data-clase], [data-oferta]');
    if (!enlace) return;
    if (!form.hidden) {
      if (enlace.hasAttribute('data-clase')) {
        campoClase.value = enlace.getAttribute('data-clase');
      } else if (CLASES_OFERTA.indexOf(campoClase.value) === -1) {
        campoClase.value = 'reformer';
      }
      actualizarOferta();
      if (enlace.hasAttribute('data-oferta')) campoPrimera.checked = true;
      mostrarError('clase', '');
    }
  });

  document.getElementById('year').textContent = new Date().getFullYear();
})();
