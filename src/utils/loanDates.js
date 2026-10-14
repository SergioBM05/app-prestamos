const DAY_MS = 24 * 60 * 60 * 1000;
export const NEAR_DUE_DAYS = 3;

export const toDate = (value) => {
    if (!value) return null;
    const seconds = value._seconds ?? value.seconds;
    const date = seconds ? new Date(seconds * 1000) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
export const formatDate = (date) => date
    ? date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const isLoanPaid = (loan) =>
    loan.status === 'Pagado' ||
    ((loan.installments || []).length > 0 && Number(loan.remainingDebt) <= 0);

// Fecha de inicio (creación de la deuda) y de fin (vencimiento de la última cuota)
export const getLoanDates = (loan) => {
    const installments = loan.installments || [];
    return {
        start: toDate(loan.startDate) || toDate(loan.createdAt),
        end: toDate(loan.endDate) || toDate(installments[installments.length - 1]?.dueDate)
    };
};

// Semáforo: rojo = vencida, amarillo = cerca, verde = con margen
export const DUE_TONES = {
    overdue: {
        badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
        row: 'border-rose-500/40 bg-rose-500/10',
        dot: 'bg-rose-500'
    },
    soon: {
        badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        row: 'border-amber-500/40 bg-amber-500/10',
        dot: 'bg-amber-400'
    },
    ok: {
        badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        row: 'border-emerald-500/30 bg-emerald-500/5',
        dot: 'bg-emerald-400'
    }
};
export const getDueInfo = (loan) => {
    const next = (loan.installments || []).find((item) => item.status !== 'paid');
    const due = toDate(next?.dueDate);
    if (!due) return null;
    const days = Math.round((startOfDay(due) - startOfDay(new Date())) / DAY_MS);
    const level = days < 0 ? 'overdue' : days <= NEAR_DUE_DAYS ? 'soon' : 'ok';
    const label = days < 0
        ? `Vencida hace ${-days} ${days === -1 ? 'día' : 'días'}`
        : days === 0 ? 'Vence hoy'
        : `Faltan ${days} ${days === 1 ? 'día' : 'días'}`;
    return { next, due, days, level, label, tone: DUE_TONES[level] };
};
