// Modo demo: se activa con «?demo» (vista de administrador) o «?demo=cliente» (portal del cliente)
// y se recuerda mientras dure la pestaña.
//
// Es 100 % local: no hay login, no se llama al servidor real ni a Firebase y los datos viven en este
// navegador con un prefijo propio. Una pequeña "API de mentira" intercepta las llamadas a /api/…
// para que toda la interfaz funcione igual que con el servidor. Nunca toca cuentas ni datos reales.

const CLAVE_MODO = 'prestamos-modo-demo';
const CLAVE_DATOS = 'prestamos-demo:datos';

function detectar() {
  try {
    const param = new URLSearchParams(window.location.search).get('demo');
    if (param !== null) sessionStorage.setItem(CLAVE_MODO, param === 'cliente' ? 'cliente' : 'admin');
    return sessionStorage.getItem(CLAVE_MODO); // null | 'admin' | 'cliente'
  } catch {
    return null;
  }
}

export const MODO_DEMO = detectar();

export const USUARIO_DEMO = MODO_DEMO === 'cliente'
  ? { uid: 'demo-cliente', role: 'client', name: 'Lucía Fernández' }
  : { uid: 'demo-admin', role: 'admin', name: 'Administrador demo' };

const borrarDatos = () => {
  try { localStorage.removeItem(CLAVE_DATOS); } catch { /* sin almacenamiento */ }
};
export const reiniciarDemo = () => { borrarDatos(); window.location.reload(); };
export const salirDeDemo = () => {
  borrarDatos();
  try { sessionStorage.removeItem(CLAVE_MODO); } catch { /* sin almacenamiento */ }
  window.location.assign(window.location.pathname);
};
export const cambiarVistaDemo = () => {
  try { sessionStorage.setItem(CLAVE_MODO, MODO_DEMO === 'cliente' ? 'admin' : 'cliente'); } catch { /* sin almacenamiento */ }
  window.location.reload();
};

// ---------- Cálculo de cuotas (misma lógica que usa el servidor) ----------
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const FRECUENCIAS = { Diario: 1, Semanal: 7, Quincenal: 15, Mensual: 30 };
const DAY_MS = 86400000;
const esMensual = (f) => f === 'Mensual';

const sumarDias = (fecha, dias) => { const d = new Date(fecha); d.setDate(d.getDate() + dias); return d.toISOString(); };
const sumarMeses = (fecha, meses) => {
  const d = new Date(fecha);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString();
};
const siguienteVencimiento = (desde, f) => (esMensual(f) ? sumarMeses(desde, 1) : sumarDias(desde, FRECUENCIAS[f] || 30));

function calcularCuotas({ totalDebt, interestRate = 0, installmentAmount, numberOfInstallments, frequency = 'Mensual', startDate, endDate = null }) {
  const capital = r2(totalDebt);
  const tasa = Number(interestRate) || 0;
  const cuota = r2(installmentAmount || 0);
  const interes = r2(capital * (tasa / 100));
  const inicio = new Date(startDate);
  const fin = endDate ? new Date(endDate) : null;
  if (!(capital > 0)) throw new Error('La deuda debe ser mayor que cero');
  if (tasa < 0) throw new Error('El interés no puede ser negativo');
  if (fin && fin <= inicio) throw new Error('La fecha de fin debe ser posterior a la de inicio');

  let total = Math.floor(Number(numberOfInstallments) || 0);
  let capitalCuota;
  if (total >= 1) capitalCuota = r2(capital / total);
  else if (cuota > 0) {
    capitalCuota = r2(cuota - interes);
    if (capitalCuota <= 0) throw new Error('La cuota debe ser mayor que el interés por cuota');
    total = Math.ceil(capital / capitalCuota - 1e-9);
  } else if (fin) {
    const dias = esMensual(frequency) ? 30.4375 : FRECUENCIAS[frequency] || 30;
    total = Math.max(1, Math.round((fin - inicio) / DAY_MS / dias));
    capitalCuota = r2(capital / total);
  } else throw new Error('Indica el número de cuotas, la cuota o la fecha de fin');
  if (total > 1000) throw new Error('Demasiadas cuotas para el capital indicado');

  const cuotas = [];
  let resto = capital;
  for (let n = 1; n <= total; n++) {
    const principalAmount = n === total ? r2(resto) : capitalCuota;
    const dueDate = fin
      ? new Date(inicio.getTime() + ((fin - inicio) * n) / total).toISOString()
      : esMensual(frequency) ? sumarMeses(inicio, n) : sumarDias(inicio, (FRECUENCIAS[frequency] || 30) * n);
    cuotas.push({ installmentNumber: n, principalAmount, interestAmount: interes, amountDue: r2(principalAmount + interes), dueDate, status: 'pending', paidAmount: 0, paidDate: null });
    resto = r2(resto - principalAmount);
  }
  return cuotas;
}

const totales = (cuotas = []) => ({
  totalWithInterest: r2(cuotas.reduce((t, c) => t + Number(c.amountDue || 0), 0)),
  paidAmount: r2(cuotas.reduce((t, c) => t + Number(c.paidAmount || 0), 0)),
  remainingDebt: r2(cuotas.reduce((t, c) => t + Math.max(0, Number(c.amountDue || 0) - Number(c.paidAmount || 0)), 0)),
});

function aplicarPago(cuotas, importe) {
  let resto = r2(importe);
  const nuevas = cuotas.map((c) => {
    if (resto <= 0 || c.status === 'paid') return c;
    const pendiente = r2(Math.max(0, Number(c.amountDue || 0) - Number(c.paidAmount || 0)));
    const aplicado = r2(Math.min(resto, pendiente));
    const pagado = r2(Number(c.paidAmount || 0) + aplicado);
    resto = r2(resto - aplicado);
    return { ...c, paidAmount: pagado, paidDate: aplicado > 0 ? new Date().toISOString() : c.paidDate || null, status: pagado >= Number(c.amountDue || 0) ? 'paid' : pagado > 0 ? 'partial' : 'pending' };
  });
  return nuevas;
}

function ganancia(cuotas = []) {
  let esperada = 0; let ganada = 0; let cobrada = 0; let debida = 0;
  for (const c of cuotas) {
    const debe = Number(c.amountDue || 0);
    const pagado = Math.min(Number(c.paidAmount || 0), debe);
    const interes = Number(c.interestAmount || 0);
    esperada += interes; debida += debe; cobrada += pagado;
    if (debe > 0) ganada += (pagado * interes) / debe;
  }
  return { expected: r2(esperada), earned: r2(ganada), pending: r2(esperada - ganada), collected: r2(cobrada), outstanding: r2(debida - cobrada) };
}

// ---------- Datos de ejemplo ----------
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const hace = (dias) => { const d = new Date(); d.setDate(d.getDate() - dias); d.setHours(12, 0, 0, 0); return d; };

function crearPrestamo({ clientId, clientName, totalDebt, interestRate, frequency, n, diasInicio, phone, address, interestOnly = false }) {
  const startDate = hace(diasInicio);
  const cuotas = calcularCuotas({ totalDebt, interestRate, numberOfInstallments: interestOnly ? 1 : n, frequency, startDate });
  const t = totales(cuotas);
  return {
    id: uid(), ownerId: USUARIO_DEMO.uid === 'demo-admin' ? 'demo-admin' : 'demo-admin', clientId, loanNumber: 1, clientName, duenyoDinero: 'Administrador demo',
    phone, address, totalDebt, remainingDebt: t.remainingDebt, interestRate, frequency, installmentAmount: cuotas[0].amountDue,
    numberOfInstallments: cuotas.length, installments: cuotas, startDate: startDate.toISOString(), endDate: cuotas[cuotas.length - 1].dueDate,
    endDateCustom: false, interestOnly, totalWithInterest: t.totalWithInterest, status: 'Activo', createdAt: new Date(startDate).toISOString(),
  };
}

function pagarCuotasSemilla(bd, prestamo, cuantas) {
  for (let i = 0; i < cuantas; i++) {
    const c = prestamo.installments.find((x) => x.status !== 'paid');
    if (!c) break;
    const importe = r2(c.amountDue - c.paidAmount);
    const antes = ganancia(prestamo.installments).earned;
    prestamo.installments = aplicarPago(prestamo.installments, importe);
    const interes = r2(ganancia(prestamo.installments).earned - antes);
    const t = totales(prestamo.installments);
    prestamo.remainingDebt = t.remainingDebt;
    if (t.remainingDebt === 0) prestamo.status = 'Pagado';
    const fecha = new Date(c.dueDate) < new Date() ? c.dueDate : new Date().toISOString();
    (bd.payments[prestamo.id] ||= []).push({ id: uid(), amount: importe, interestAmount: interes, principalAmount: r2(importe - interes), remainingDebtAfter: t.remainingDebt, installmentNumbers: [c.installmentNumber], createdAt: fecha });
    bd.cashbox += importe;
  }
}

function semilla() {
  const bd = { loans: [], payments: {}, cashbox: 4200 };
  const defs = [
    { clientId: 'demo-cliente', clientName: 'Lucía Fernández', totalDebt: 2000, interestRate: 5, frequency: 'Mensual', n: 8, diasInicio: 95, phone: '600111222', address: 'C/ Ejemplo 12, Madrid', pagadas: 3 },
    { clientId: uid(), clientName: 'Carlos Méndez', totalDebt: 1200, interestRate: 8, frequency: 'Quincenal', n: 6, diasInicio: 45, phone: '611222333', address: 'Av. Muestra 5, Sevilla', pagadas: 2 },
    { clientId: uid(), clientName: 'Ana Torres', totalDebt: 500, interestRate: 10, frequency: 'Semanal', n: 5, diasInicio: 70, phone: '622333444', address: 'C/ Prueba 8, Valencia', pagadas: 5 },
    { clientId: uid(), clientName: 'Pedro Gil', totalDebt: 3000, interestRate: 4, frequency: 'Mensual', n: 12, diasInicio: 20, phone: '633444555', address: 'Plaza Demo 3, Bilbao', pagadas: 0 },
    { clientId: uid(), clientName: 'Marta Ruiz', totalDebt: 800, interestRate: 6, frequency: 'Mensual', n: 1, diasInicio: 60, phone: '644555666', address: 'C/ Ficticia 21, Zaragoza', pagadas: 1, interestOnly: true },
  ];
  defs.forEach((d, i) => {
    const p = crearPrestamo(d);
    p.createdAt = new Date(hace(d.diasInicio).getTime() + i).toISOString();
    bd.cashbox -= d.totalDebt;
    pagarCuotasSemilla(bd, p, d.pagadas);
    bd.loans.push(p);
  });
  bd.cashbox = r2(bd.cashbox + 6000);
  return bd;
}

const cargar = () => {
  try {
    const raw = localStorage.getItem(CLAVE_DATOS);
    if (raw) return JSON.parse(raw);
    const bd = semilla();
    localStorage.setItem(CLAVE_DATOS, JSON.stringify(bd));
    return bd;
  } catch {
    return semilla();
  }
};
const guardar = (bd) => { try { localStorage.setItem(CLAVE_DATOS, JSON.stringify(bd)); } catch { /* lleno */ } };

// ---------- "Servidor" de mentira ----------
const ok = (datos, status = 200) => ({ status, datos });
const error = (status, message) => ({ status, datos: { message } });

const fechaInput = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error('Fecha no válida');
  return d;
};
const telefono = (v) => {
  const limpio = String(v ?? '').replace(/[^\d+]/g, '');
  const digitos = limpio.replace(/\+/g, '');
  return digitos.length < 7 || digitos.length > 15 || limpio.lastIndexOf('+') > 0 ? null : limpio;
};
const conTotales = (p) => ({ ...p, ...totales(p.installments) });
const clave = (nombre) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '');
const prestamoActual = (bd, clientId) => {
  const suyos = bd.loans.filter((p) => p.clientId === clientId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return suyos.find((p) => p.status !== 'Pagado') || suyos[0] || null;
};
const pagosDe = (bd, id) => [...(bd.payments[id] || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

function estadisticas(bd) {
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - (11 - i), 1);
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, lent: 0, collected: 0, interest: 0 };
  });
  const porMes = new Map(meses.map((m) => [m.month, m]));
  const mes = (f) => { const d = new Date(f); return porMes.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const prestamos = bd.loans.map((p) => ({ ...p, profit: ganancia(p.installments) }));
  prestamos.forEach((p) => { const b = mes(p.startDate); if (b) b.lent += p.totalDebt; });
  prestamos.forEach((p) => (bd.payments[p.id] || []).forEach((pago) => {
    const b = mes(pago.createdAt);
    if (!b) return;
    b.collected += pago.amount;
    b.interest += Number(pago.interestAmount) || 0;
  }));
  const lista = prestamos.map((p) => ({ id: p.id, clientName: p.clientName, status: p.status, capital: p.totalDebt, ...p.profit }));
  const suma = (k) => r2(lista.reduce((t, p) => t + p[k], 0));
  const capitalLent = r2(lista.reduce((t, p) => t + p.capital, 0));
  const earned = suma('earned');
  return {
    totals: { capitalLent, collected: suma('collected'), outstanding: suma('outstanding'), interestExpected: suma('expected'), interestEarned: earned, interestPending: suma('pending'), returnOnCapital: capitalLent > 0 ? r2((earned / capitalLent) * 100) : 0 },
    months: meses.map((m) => ({ month: m.month, lent: r2(m.lent), collected: r2(m.collected), interest: r2(m.interest) })),
    loans: lista.sort((a, b) => b.earned - a.earned),
  };
}

function enrutar(metodo, ruta, cuerpo) {
  const bd = cargar();
  const esAdmin = USUARIO_DEMO.role === 'admin';
  let m;

  if (ruta === '/api/auth/me') return ok(USUARIO_DEMO);

  if (ruta === '/api/loans/my-loan') {
    const p = prestamoActual(bd, USUARIO_DEMO.uid);
    return p ? ok(conTotales(p)) : error(404, 'No se encontró ningún préstamo para este usuario');
  }
  if (ruta === '/api/loans/my-loan/payments') {
    const p = prestamoActual(bd, USUARIO_DEMO.uid);
    return p ? ok(pagosDe(bd, p.id)) : error(404, 'No se encontró ningún préstamo para este usuario');
  }
  if (!esAdmin) return error(403, 'No disponible en la vista de cliente de la demo');

  if (ruta === '/api/stats/profit') return ok(estadisticas(bd));

  if (ruta === '/api/cashbox') {
    if (metodo === 'PUT') {
      const saldo = Number(cuerpo.balance);
      if (cuerpo.balance === '' || cuerpo.balance === null || !Number.isFinite(saldo)) return error(400, 'El saldo debe ser un número válido');
      bd.cashbox = r2(saldo);
      guardar(bd);
    }
    return ok({ balance: bd.cashbox });
  }

  if (ruta === '/api/loans' && metodo === 'GET') {
    return ok([...bd.loans].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(conTotales));
  }

  if (ruta === '/api/loans' && metodo === 'POST') {
    const { clientName, totalDebt, interestRate, frequency } = cuerpo;
    const interestOnly = cuerpo.interestOnly === true || cuerpo.interestOnly === 'true';
    const dueno = String(cuerpo.duenyoDinero ?? cuerpo.duenyo ?? cuerpo.owner ?? '').trim();
    if (!clientName || !dueno || !totalDebt || !frequency) return error(400, 'Faltan datos obligatorios');
    const phone = telefono(cuerpo.phone);
    const address = String(cuerpo.address ?? '').trim();
    if (!phone) return error(400, 'Indica un teléfono válido (entre 7 y 15 dígitos)');
    if (!address) return error(400, 'Indica la dirección del cliente');
    const capital = Number(totalDebt);
    const tasa = Number(interestRate || 0);
    if (!Number.isFinite(capital) || capital <= 0 || !Number.isFinite(tasa)) return error(400, 'La deuda y el interés deben ser válidos');
    if (bd.loans.some((p) => p.clientName.toLowerCase() === String(clientName).toLowerCase() && p.status !== 'Pagado')) {
      return error(409, `${clientName} ya tiene un préstamo activo. Termínalo antes de darle uno nuevo.`);
    }
    let cuotas; let inicio; let fin;
    try {
      inicio = fechaInput(cuerpo.startDate) || new Date();
      fin = interestOnly ? null : fechaInput(cuerpo.endDate);
      cuotas = calcularCuotas({ totalDebt: capital, interestRate: tasa, numberOfInstallments: interestOnly ? 1 : cuerpo.numberOfInstallments, installmentAmount: interestOnly ? 0 : cuerpo.installmentAmount, frequency, startDate: inicio, endDate: fin });
    } catch (e) {
      return error(400, e.message);
    }
    const t = totales(cuotas);
    const prestamo = {
      id: uid(), ownerId: 'demo-admin', clientId: uid(), loanNumber: 1, clientName, duenyoDinero: dueno, phone, address, totalDebt: capital, remainingDebt: t.remainingDebt,
      interestRate: tasa, frequency, installmentAmount: cuotas[0].amountDue, numberOfInstallments: cuotas.length, installments: cuotas, startDate: inicio.toISOString(),
      endDate: cuotas[cuotas.length - 1].dueDate, endDateCustom: Boolean(fin), interestOnly, totalWithInterest: t.totalWithInterest, status: 'Activo', createdAt: new Date().toISOString(),
    };
    bd.loans.push(prestamo);
    bd.cashbox = r2(bd.cashbox - capital);
    guardar(bd);
    const usuario = clave(clientName) || 'Client';
    return ok({ message: 'Préstamo y cuenta de cliente creados con éxito (demo)', loan: prestamo, credentials: { username: usuario, password: 'demo-1234' } }, 201);
  }

  if ((m = /^\/api\/loans\/([^/]+)(?:\/(payments|interest-payment|reset-access))?$/.exec(ruta))) {
    const [, id, accion] = m;
    const p = bd.loans.find((x) => x.id === id);
    if (!p) return error(404, 'Préstamo no encontrado');

    if (accion === 'payments' && metodo === 'GET') return ok(pagosDe(bd, id));

    if (accion === 'payments' && metodo === 'POST') {
      const importe = Number(cuerpo.amountPaid);
      if (!Number.isFinite(importe) || importe <= 0) return error(400, 'El importe del pago debe ser mayor que cero');
      if (importe > totales(p.installments).remainingDebt) return error(400, 'El pago no puede superar la deuda restante');
      const antes = p.installments;
      const despues = aplicarPago(antes, importe);
      const t = totales(despues);
      const interes = r2(ganancia(despues).earned - ganancia(antes).earned);
      const tocadas = despues.filter((c, i) => Number(c.paidAmount || 0) !== Number(antes[i].paidAmount || 0)).map((c) => c.installmentNumber);
      p.installments = despues;
      p.remainingDebt = t.remainingDebt;
      p.totalWithInterest = t.totalWithInterest;
      if (t.remainingDebt === 0) p.status = 'Pagado';
      (bd.payments[id] ||= []).push({ id: uid(), amount: importe, interestAmount: interes, principalAmount: r2(importe - interes), remainingDebtAfter: t.remainingDebt, installmentNumbers: tocadas, createdAt: new Date().toISOString() });
      bd.cashbox = r2(bd.cashbox + importe);
      guardar(bd);
      return ok({ message: 'Pago registrado correctamente', remainingDebt: t.remainingDebt, status: p.status, installments: despues });
    }

    if (accion === 'interest-payment' && metodo === 'POST') {
      const cuotas = p.installments.map((c) => ({ ...c }));
      const i = cuotas.findIndex((c) => c.status !== 'paid');
      if (i === -1) return error(400, 'El préstamo no tiene cuotas pendientes');
      const c = cuotas[i];
      const interes = r2(c.interestAmount || 0);
      const aplazado = r2(c.principalAmount || 0);
      if (interes <= 0) return error(400, 'Esta cuota no tiene interés que cobrar');
      if (aplazado <= 0) return error(400, 'Esta cuota ya es solo de interés: usa el abono normal');
      if (Number(c.paidAmount || 0) > interes + 0.005) return error(400, 'Esta cuota ya tiene capital abonado: usa el abono normal');
      const cobrar = r2(interes - Number(c.paidAmount || 0));
      cuotas[i] = { ...c, principalAmount: 0, amountDue: interes, paidAmount: interes, paidDate: new Date().toISOString(), status: 'paid' };
      const ultima = cuotas[cuotas.length - 1];
      cuotas.push({ installmentNumber: cuotas.length + 1, principalAmount: aplazado, interestAmount: interes, amountDue: r2(aplazado + interes), dueDate: siguienteVencimiento(ultima.dueDate, p.frequency), status: 'pending', paidAmount: 0, paidDate: null });
      const t = totales(cuotas);
      Object.assign(p, { installments: cuotas, numberOfInstallments: cuotas.length, endDate: cuotas[cuotas.length - 1].dueDate, totalWithInterest: t.totalWithInterest, remainingDebt: t.remainingDebt });
      (bd.payments[id] ||= []).push({ id: uid(), amount: cobrar, interestAmount: cobrar, principalAmount: 0, type: 'interes', deferredPrincipal: aplazado, remainingDebtAfter: t.remainingDebt, installmentNumbers: [c.installmentNumber], createdAt: new Date().toISOString() });
      bd.cashbox = r2(bd.cashbox + cobrar);
      guardar(bd);
      return ok({ message: 'Interés cobrado: el capital pasa a una cuota nueva', collected: cobrar, remainingDebt: t.remainingDebt, installments: cuotas });
    }

    if (accion === 'reset-access' && metodo === 'POST') {
      return ok({ message: 'Contraseña renovada', username: clave(p.clientName) || 'Client', password: 'demo-1234', clientName: p.clientName, phone: p.phone || '' });
    }

    if (!accion && metodo === 'DELETE') {
      bd.loans = bd.loans.filter((x) => x.id !== id);
      delete bd.payments[id];
      guardar(bd);
      return ok({ message: 'Préstamo y cuenta eliminados correctamente' });
    }

    if (!accion && metodo === 'PUT') {
      const nuevo = { ...p };
      const dueno = cuerpo.duenyoDinero ?? cuerpo.duenyo ?? cuerpo.owner;
      if (cuerpo.phone !== undefined && String(cuerpo.phone).trim() !== '') {
        const tel = telefono(cuerpo.phone);
        if (!tel) return error(400, 'El teléfono no es válido (entre 7 y 15 dígitos)');
        nuevo.phone = tel;
      }
      if (cuerpo.address !== undefined && String(cuerpo.address).trim() !== '') nuevo.address = String(cuerpo.address).trim();
      if (cuerpo.clientName !== undefined) nuevo.clientName = cuerpo.clientName;
      if (dueno !== undefined) nuevo.duenyoDinero = String(dueno).trim();
      if (cuerpo.status !== undefined) nuevo.status = cuerpo.status;
      if (cuerpo.remainingDebt !== undefined) nuevo.remainingDebt = Number(cuerpo.remainingDebt);

      const campos = ['totalDebt', 'interestRate', 'frequency', 'installmentAmount', 'numberOfInstallments', 'startDate', 'endDate'];
      const tocado = campos.some((c) => cuerpo[c] !== undefined);
      const hayPagos = p.installments.some((c) => Number(c.paidAmount) > 0);
      let deltaCaja = 0;
      if (tocado && !hayPagos) {
        try {
          const soloIntereses = cuerpo.interestOnly !== undefined ? cuerpo.interestOnly === true || cuerpo.interestOnly === 'true' : Boolean(p.interestOnly);
          const capital = cuerpo.totalDebt !== undefined ? Number(cuerpo.totalDebt) : p.totalDebt;
          const tasa = cuerpo.interestRate !== undefined ? Number(cuerpo.interestRate) : p.interestRate;
          const frec = cuerpo.frequency !== undefined ? cuerpo.frequency : p.frequency;
          const inicio = fechaInput(cuerpo.startDate) || new Date(p.startDate);
          const fin = soloIntereses ? null : cuerpo.endDate !== undefined ? fechaInput(cuerpo.endDate) : (p.endDateCustom ? new Date(p.endDate) : null);
          const dadas = soloIntereses ? 1 : Math.floor(Number(cuerpo.numberOfInstallments)) || 0;
          const importe = soloIntereses ? 0 : Number(cuerpo.installmentAmount) || 0;
          const cuotas = calcularCuotas({ totalDebt: capital, interestRate: tasa, numberOfInstallments: dadas || (importe ? 0 : p.numberOfInstallments), installmentAmount: importe, frequency: frec, startDate: inicio, endDate: fin });
          const t = totales(cuotas);
          Object.assign(nuevo, { totalDebt: capital, interestRate: tasa, frequency: frec, installments: cuotas, installmentAmount: cuotas[0].amountDue, numberOfInstallments: cuotas.length, startDate: inicio.toISOString(), endDate: cuotas[cuotas.length - 1].dueDate, endDateCustom: Boolean(fin), interestOnly: soloIntereses, totalWithInterest: t.totalWithInterest, remainingDebt: t.remainingDebt });
          deltaCaja = -(capital - Number(p.totalDebt || 0));
        } catch (e) {
          return error(400, e.message);
        }
      }

      let liquidado = 0;
      if (nuevo.status === 'Pagado' && p.status !== 'Pagado') {
        liquidado = totales(p.installments).remainingDebt;
        const interesPend = ganancia(p.installments).pending;
        const tocadas = p.installments.filter((c) => c.status !== 'paid').map((c) => c.installmentNumber);
        if (liquidado > 0) {
          (bd.payments[id] ||= []).push({ id: uid(), amount: liquidado, interestAmount: interesPend, principalAmount: r2(liquidado - interesPend), remainingDebtAfter: 0, installmentNumbers: tocadas, type: 'liquidacion', createdAt: new Date().toISOString() });
        }
      }
      if (nuevo.status === 'Pagado') {
        nuevo.installments = p.installments.map((c) => ({ ...c, paidAmount: Number(c.amountDue || 0), status: 'paid', paidDate: c.paidDate || new Date().toISOString() }));
        nuevo.remainingDebt = 0;
      }
      bd.loans = bd.loans.map((x) => (x.id === id ? nuevo : x));
      bd.cashbox = r2(bd.cashbox + deltaCaja + liquidado);
      guardar(bd);
      return ok({ message: 'Préstamo actualizado correctamente', loan: nuevo });
    }
  }

  return error(404, 'Ruta no disponible en la demo');
}

/** Sustituye fetch para las llamadas a /api/…: se contestan aquí y no sale ninguna petición. */
export function instalarApiDemo() {
  const fetchReal = window.fetch.bind(window);
  window.fetch = async (entrada, opciones = {}) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    const ruta = /\/api\/[^?#]*/.exec(url)?.[0];
    if (!ruta) return fetchReal(entrada, opciones);
    await new Promise((r) => setTimeout(r, 150)); // latencia mínima para que se note la carga
    let cuerpo = {};
    try { cuerpo = opciones.body ? JSON.parse(opciones.body) : {}; } catch { /* sin cuerpo válido */ }
    const { status, datos } = enrutar((opciones.method || 'GET').toUpperCase(), ruta, cuerpo);
    return new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });
  };
}
