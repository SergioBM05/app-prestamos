// Vista previa del calendario de un préstamo. Replica la lógica de calculateInstallments del
// backend (utils/calculator.js): el interés se cobra en cada cuota sobre el capital inicial.
// Prioridad: nº de cuotas > cuota > fecha de fin.
const FREQUENCY_DAYS = { Diario: 1, Semanal: 7, Quincenal: 15, Mensual: 30 };
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INSTALLMENTS = 1000;
const AVERAGE_MONTH_DAYS = 30.4375;

// "Mensual" = mismo día de cada mes (igual que el backend)
const addMonths = (date, months) => {
    const result = new Date(date);
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
};

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Las fechas de los <input type="date"> son YYYY-MM-DD; se fijan a mediodía para evitar saltos de día
const parseInputDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
};

export const toInputDate = (date) => {
    if (!date || Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Devuelve null si faltan datos, { error } si los datos no son válidos, o el plan calculado
export const getLoanPlan = ({
    totalDebt,
    interestRate,
    numberOfInstallments,
    installmentAmount,
    frequency = 'Mensual',
    startDate,
    endDate
}) => {
    const debt = Number(totalDebt) || 0;
    if (debt <= 0) return null;

    const interestPerInstallment = round2(debt * ((Number(interestRate) || 0) / 100));
    const start = parseInputDate(startDate) || new Date();
    const end = parseInputDate(endDate);
    const frequencyDays = FREQUENCY_DAYS[frequency] || 30;
    if (end && end <= start) return { error: 'La fecha de fin debe ser posterior a la de inicio' };

    const wantedInstallments = Math.floor(Number(numberOfInstallments) || 0);
    const payment = Number(installmentAmount) || 0;
    let count;
    let firstPayment;
    if (wantedInstallments >= 1) {
        count = wantedInstallments;
        firstPayment = round2(debt / count) + interestPerInstallment;
    } else if (payment > 0) {
        const principalPerInstallment = round2(payment - interestPerInstallment);
        if (principalPerInstallment <= 0) return { error: 'La cuota debe ser mayor que el interés por cuota' };
        count = Math.ceil(debt / principalPerInstallment - 1e-9);
        firstPayment = Math.min(payment, debt + interestPerInstallment);
    } else if (end) {
        const periodDays = frequency === 'Mensual' ? AVERAGE_MONTH_DAYS : frequencyDays;
        count = Math.max(1, Math.round((end - start) / DAY_MS / periodDays));
        firstPayment = round2(debt / count) + interestPerInstallment;
    } else {
        return null;
    }
    if (count > MAX_INSTALLMENTS) return { error: 'Demasiadas cuotas para el capital indicado' };

    let lastDue = end;
    if (!lastDue) {
        if (frequency === 'Mensual') {
            lastDue = addMonths(start, count);
        } else {
            lastDue = new Date(start);
            lastDue.setDate(lastDue.getDate() + frequencyDays * count);
        }
    }

    return {
        installments: count,
        payment: round2(firstPayment),
        interestPerInstallment,
        interestTotal: round2(interestPerInstallment * count),
        total: round2(debt + interestPerInstallment * count),
        startDate: start,
        endDate: lastDue
    };
};
