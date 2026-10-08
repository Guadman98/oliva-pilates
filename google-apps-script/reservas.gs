/**
 * Oliva Pilates — registro de reservas en Google Sheets
 *
 * Este código va en Extensiones → Apps Script de la hoja de reservas.
 * Recibe las reservas que envía el formulario de la página, las valida
 * y las agrega como filas en la pestaña "Reservas".
 */

const HOJA = 'Reservas';

const ENCABEZADOS = [
  'Registrada el', 'Código', 'Estado', 'Clase', 'Fecha de la clase', 'Hora',
  'Nombre', 'Correo', 'Teléfono', 'Primera clase', 'Valor'
];

// Posición (desde 0) de cada columna dentro de ENCABEZADOS
const COL = {
  codigo: 1, estado: 2, clase: 3, fecha: 4, hora: 5,
  correo: 7, telefono: 8, primera: 9
};

const ESTADOS = ['Pendiente', 'Confirmada', 'Cancelada', 'Asistió', 'No asistió'];

const CLASES = {
  reformer: { nombre: 'Pilates Reformer', grupal: true },
  mat: { nombre: 'Pilates Mat', grupal: true },
  stretch: { nombre: 'Stretch & Mobility', grupal: true },
  cadillac: { nombre: 'Pilates Cadillac', grupal: false },
  personalizado: { nombre: 'Pilates Personalizado', grupal: false }
};

const CLASES_OFERTA = ['reformer', 'mat'];

// Cupo máximo por clase en un mismo horario. null = sin límite.
const CUPOS = {
  reformer: 8,
  mat: 8,
  stretch: 8,
  cadillac: 1,
  personalizado: 1
};

// Horas de inicio (formato 24 h)
const HORAS_SEMANA = [6, 7, 8, 9, 16, 17, 18, 19];
const HORAS_SABADO = [7, 8, 9, 10];
const DIAS_MAXIMOS = 60;

const PRECIOS = { individual: 45000, primera: 25000, privada: 95000 };


/* ---------- Puntos de entrada ---------- */

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const p = (e && e.parameter) || {};

    // Campo trampa: los bots lo llenan, las personas no lo ven
    if (p.empresa) return responder({ ok: true, codigo: 'OP-000000' });

    const reserva = validar(p);

    lock.waitLock(10000);
    const hoja = obtenerHoja();
    verificarDisponibilidad(hoja, reserva);

    const codigo = generarCodigo(hoja);
    hoja.appendRow([
      new Date(),
      codigo,
      'Pendiente',
      reserva.clase.nombre,
      reserva.fecha,
      "'" + reserva.horaTexto, // como texto, para que Sheets no la convierta en hora
      texto(reserva.nombre),
      texto(reserva.correo),
      "'" + reserva.telefono,
      reserva.primera ? 'Sí' : 'No',
      reserva.valor
    ]);
    SpreadsheetApp.flush();

    return responder({ ok: true, codigo: codigo, valor: reserva.valorTexto });
  } catch (err) {
    if (err instanceof ErrorReserva) {
      return responder({ ok: false, campo: err.campo, mensaje: err.message });
    }
    console.error(err);
    return responder({ ok: false, mensaje: 'No pudimos registrar la reserva. Intenta de nuevo en unos minutos.' });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return responder({ ok: true, servicio: 'Reservas Oliva Pilates' });
}

/**
 * Ejecútala una vez desde el editor: crea la pestaña "Reservas" con sus
 * encabezados y le pide a Google los permisos que necesita el script.
 */
function prepararHoja() {
  obtenerHoja();
}


/* ---------- Validación ---------- */

function ErrorReserva(campo, mensaje) {
  this.campo = campo;
  this.message = mensaje;
}

function validar(p) {
  const zona = SpreadsheetApp.getActive().getSpreadsheetTimeZone();

  const clave = String(p.clase || '');
  const clase = CLASES[clave];
  if (!clase) throw new ErrorReserva('clase', 'Selecciona el tipo de clase.');

  // Fecha
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.fecha || ''));
  if (!m) throw new ErrorReserva('fecha', 'Elige una fecha.');
  const y = Number(m[1]), mes = Number(m[2]), d = Number(m[3]);
  const diaSemana = new Date(Date.UTC(y, mes - 1, d)).getUTCDay();
  const fechaISO = m[0];

  const hoyISO = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  const limite = new Date(Date.parse(hoyISO + 'T12:00:00Z') + DIAS_MAXIMOS * 86400000);
  const limiteISO = Utilities.formatDate(limite, 'UTC', 'yyyy-MM-dd');

  if (fechaISO < hoyISO || fechaISO > limiteISO) {
    throw new ErrorReserva('fecha', 'Elige una fecha entre hoy y los próximos ' + DIAS_MAXIMOS + ' días.');
  }
  if (diaSemana === 0) {
    throw new ErrorReserva('fecha', 'Los domingos y festivos el estudio está cerrado.');
  }

  // Hora
  const hora = Number(p.hora);
  const horas = diaSemana === 6 ? HORAS_SABADO : HORAS_SEMANA;
  if (horas.indexOf(hora) === -1) throw new ErrorReserva('hora', 'Selecciona una hora válida.');
  if (fechaISO === hoyISO && hora <= Number(Utilities.formatDate(new Date(), zona, 'H'))) {
    throw new ErrorReserva('hora', 'Esa hora ya pasó. Elige otra.');
  }

  // Datos personales
  const nombre = limpiar(p.nombre, 80);
  if (nombre.length < 3) throw new ErrorReserva('nombre', 'Escribe tu nombre completo.');

  const correo = limpiar(p.correo, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new ErrorReserva('correo', 'Escribe un correo válido, por ejemplo nombre@correo.com.');
  }

  const telefono = limpiar(p.telefono, 25);
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.length < 7 || digitos.length > 13) {
    throw new ErrorReserva('telefono', 'Escribe un número de teléfono válido.');
  }

  if (p.datos !== 'si') {
    throw new ErrorReserva('datos', 'Necesitamos tu autorización para gestionar la reserva.');
  }

  const primera = p.primera === 'si' && CLASES_OFERTA.indexOf(clave) !== -1;

  let valor, valorTexto;
  if (primera) { valor = PRECIOS.primera; valorTexto = pesos(valor) + ' (primera clase)'; }
  else if (clase.grupal) { valor = PRECIOS.individual; valorTexto = pesos(valor) + ' o una clase de tu plan'; }
  else { valor = PRECIOS.privada; valorTexto = pesos(valor) + ' (sesión privada)'; }

  return {
    clave: clave,
    clase: clase,
    fechaISO: fechaISO,
    // Mediodía para que la fecha no cambie de día por diferencias de zona horaria
    fecha: new Date(y, mes - 1, d, 12),
    hora: hora,
    horaTexto: formatoHora(hora),
    nombre: nombre,
    correo: correo,
    telefono: telefono,
    primera: primera,
    valor: valor,
    valorTexto: valorTexto
  };
}

function verificarDisponibilidad(hoja, r) {
  const filas = hoja.getLastRow() > 1
    ? hoja.getRange(2, 1, hoja.getLastRow() - 1, ENCABEZADOS.length).getValues()
    : [];
  const zona = hoja.getParent().getSpreadsheetTimeZone();
  let ocupados = 0;

  filas.forEach(function (f) {
    if (f[COL.estado] === 'Cancelada') return;
    const correo = String(f[COL.correo]).toLowerCase();
    const fecha = f[COL.fecha] instanceof Date
      ? Utilities.formatDate(f[COL.fecha], zona, 'yyyy-MM-dd')
      : String(f[COL.fecha]);
    const mismoHorario = fecha === r.fechaISO && f[COL.hora] === r.horaTexto;

    if (mismoHorario && correo === r.correo) {
      throw new ErrorReserva('hora', 'Ya tienes una reserva para ese día y hora.');
    }
    if (mismoHorario && f[COL.clase] === r.clase.nombre) ocupados++;
    if (r.primera && correo === r.correo && f[COL.primera] === 'Sí') {
      throw new ErrorReserva('primera', 'La oferta de primera clase ya se usó con este correo.');
    }
  });

  const cupo = CUPOS[r.clave];
  if (cupo !== null && ocupados >= cupo) {
    throw new ErrorReserva('hora', 'Ese horario ya no tiene cupos para ' + r.clase.nombre + '. Elige otra hora.');
  }
}


/* ---------- Hoja ---------- */

function obtenerHoja() {
  const libro = SpreadsheetApp.getActive();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) hoja = libro.insertSheet(HOJA);

  if (hoja.getLastRow() === 0) {
    hoja.appendRow(ENCABEZADOS);
    hoja.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold').setBackground('#EFEAE1');
    hoja.setFrozenRows(1);

    hoja.getRange('A2:A').setNumberFormat('dd/mm/yyyy hh:mm');
    hoja.getRange('E2:E').setNumberFormat('dd/mm/yyyy');
    hoja.getRange('K2:K').setNumberFormat('$#,##0');

    const reglaEstado = SpreadsheetApp.newDataValidation()
      .requireValueInList(ESTADOS, true)
      .setAllowInvalid(false)
      .build();
    hoja.getRange('C2:C').setDataValidation(reglaEstado);

    hoja.autoResizeColumns(1, ENCABEZADOS.length);
  }
  return hoja;
}

function generarCodigo(hoja) {
  const existentes = hoja.getLastRow() > 1
    ? hoja.getRange(2, COL.codigo + 1, hoja.getLastRow() - 1, 1).getValues().map(function (f) { return f[0]; })
    : [];
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo;
  do {
    codigo = 'OP-';
    for (let i = 0; i < 6; i++) codigo += letras.charAt(Math.floor(Math.random() * letras.length));
  } while (existentes.indexOf(codigo) !== -1);
  return codigo;
}


/* ---------- Utilidades ---------- */

function limpiar(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Evita que un texto que empieza por = + - @ se interprete como fórmula
function texto(valor) {
  return /^[=+\-@]/.test(valor) ? "'" + valor : valor;
}

function formatoHora(h) {
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':00 ' + sufijo;
}

function pesos(valor) {
  return '$' + valor.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
