import React, { useState, useEffect } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { API_URL } from '../services/api';
import { getFreshToken } from '../services/auth';
import { getLoanPlan, toInputDate } from '../utils/loanPlan';
import { NEAR_DUE_DAYS, DUE_TONES, formatDate, toDate, isLoanPaid, getLoanDates, getDueInfo } from '../utils/loanDates';

// Inicio, próximo pago (con color del semáforo) y fin del préstamo
function LoanDates({ loan, className = '' }) {
    const { start, end } = getLoanDates(loan);
    const due = getDueInfo(loan);
    return (
        <div className={className}>
            <div className="flex gap-1.5"><span className="w-20 shrink-0 text-slate-500">Inicio</span><span className="text-slate-300">{formatDate(start)}</span></div>
            <div className="flex gap-1.5">
                <span className="w-20 shrink-0 text-slate-500">Próx. pago</span>
                {due ? (
                    <span className={`font-semibold ${due.level === 'overdue' ? 'text-rose-400' : due.level === 'soon' ? 'text-amber-300' : 'text-emerald-400'}`}>
                        {formatDate(due.due)} · {due.label}
                    </span>
                ) : <span className="text-slate-300">—</span>}
            </div>
            <div className="flex gap-1.5"><span className="w-20 shrink-0 text-slate-500">Fin</span><span className="text-slate-300">{formatDate(end)}</span></div>
        </div>
    );
}

export default function AdminDashboard({ user: initialUser, token, onLogout }) {
    const [user, setUser] = useState(initialUser);
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newCredentials, setNewCredentials] = useState(null);
    // Estado para el modal de registrar abono/pago parcial
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedLoanForPayment, setSelectedLoanForPayment] = useState(null);
    const [amountPaid, setAmountPaid] = useState('');
    const [submittingPayment, setSubmittingPayment] = useState(false);
    // Estados para manejar el feedback visual del modal de pagos (sin usar alert)
    const [paymentSuccessMessage, setPaymentSuccessMessage] = useState(null);
    const [paymentError, setPaymentError] = useState('');

    // Estados para el modal de confirmación de eliminación
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [loanToDelete, setLoanToDelete] = useState(null);
    const [deletingLoan, setDeletingLoan] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [deleteSuccessMessage, setDeleteSuccessMessage] = useState(null);

    // Estado para el modal (crear o editar)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingLoan, setEditingLoan] = useState(null);
    const [formData, setFormData] = useState({
        clientName: '',
        duenyoDinero: '',
        totalDebt: '',
        interestRate: '',
        frequency: 'Mensual',
        installmentAmount: '',
        numberOfInstallments: '',
        startDate: '',
        endDate: '',
        // Qué campo manda: 'installments' (nº de cuotas) o 'amount' (pago por cuota); el otro se calcula
        calcMode: 'installments'
    });
    // Estadísticas de ganancias (interés cobrado y pendiente)
    const [profit, setProfit] = useState(null);
    const [profitLoading, setProfitLoading] = useState(false);
    const [profitError, setProfitError] = useState('');
    // Saldo en caja (editable): sube con los cobros y baja con los préstamos nuevos
    const [cashBalance, setCashBalance] = useState(null);
    const [isEditingCash, setIsEditingCash] = useState(false);
    const [cashInput, setCashInput] = useState('');
    const [savingCash, setSavingCash] = useState(false);
    const [cashError, setCashError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [loanToComplete, setLoanToComplete] = useState(null);
    const [completingLoan, setCompletingLoan] = useState(false);
    const [completeError, setCompleteError] = useState('');
    const [completeSuccessMessage, setCompleteSuccessMessage] = useState(null);
    const [copiedCredential, setCopiedCredential] = useState('');
    const [activeTab, setActiveTab] = useState('active');
    // Historial de pagos de un préstamo
    const [historyLoan, setHistoryLoan] = useState(null);
    const [historyItems, setHistoryItems] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');

    const getValidToken = () => getFreshToken(token);

    useEffect(() => {
        fetchUserData();
        fetchLoans();
    }, []);

    const fetchProfit = async () => {
        try {
            setProfitLoading(true);
            setProfitError('');
            const currentToken = await getValidToken();
            const response = await fetch(`${API_URL}/api/stats/profit`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'No se pudieron cargar las ganancias');
            setProfit(data);
        } catch (err) {
            console.error(err);
            setProfitError(err.message);
        } finally {
            setProfitLoading(false);
        }
    };

    // Al abrir la pestaña (y cada vez que cambian los préstamos) se recalculan las ganancias
    useEffect(() => {
        if (activeTab === 'profit') fetchProfit();
    }, [activeTab, loans]);

    const fetchCash = async () => {
        try {
            const currentToken = await getValidToken();
            if (!currentToken) return;
            const response = await fetch(`${API_URL}/api/cashbox`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            const data = await response.json();
            if (response.ok) setCashBalance(Number(data.balance) || 0);
        } catch (err) {
            console.error('No se pudo cargar el saldo en caja', err);
        }
    };

    const handleStartEditCash = () => {
        setCashInput(String(cashBalance ?? 0));
        setCashError('');
        setIsEditingCash(true);
    };

    const handleSaveCash = async (e) => {
        e.preventDefault();
        setSavingCash(true);
        setCashError('');
        try {
            const currentToken = await getValidToken();
            const response = await fetch(`${API_URL}/api/cashbox`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ balance: cashInput })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'No se pudo guardar el saldo');
            setCashBalance(Number(data.balance) || 0);
            setIsEditingCash(false);
        } catch (err) {
            setCashError(err.message);
        } finally {
            setSavingCash(false);
        }
    };

    const handleLogoutClick = async () => {
        try {
            const auth = getAuth();
            await signOut(auth);
            location.reload();
        } catch (err) {
            console.error('Error al cerrar sesión en Firebase:', err);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (onLogout) {
                onLogout();
            }
        }
    };

    const fetchUserData = async () => {
        try {
            const currentToken = await getValidToken();
            if (!currentToken) return;

            const response = await fetch(`${API_URL}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });
            const data = await response.json();
            if (response.ok && data) {
                setUser(data);
            }
        } catch (err) {
            console.error('No se pudo obtener el perfil del usuario', err);
        }
    };

    const fetchLoans = async () => {
        try {
            setLoading(true);
            const currentToken = await getValidToken();
            if (!currentToken) throw new Error('No hay sesión activa');

            const response = await fetch(`${API_URL}/api/loans`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error al cargar los préstamos');

            setLoans(data);
            fetchCash(); // el saldo cambia con cada préstamo o pago
        } catch (err) {
            console.error(err);
            setError('No se pudieron cargar los datos de los clientes.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCreateModal = () => {
        setEditingLoan(null);
        setFormError('');
        setFormData({ clientName: '', duenyoDinero: '', totalDebt: '', interestRate: '', frequency: 'Mensual', installmentAmount: '', numberOfInstallments: '', startDate: '', endDate: '', calcMode: 'installments' });
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (loan) => {
        setEditingLoan(loan.id);
        setFormError('');
        setFormData({
            clientName: loan.clientName || '',
            duenyoDinero: loan.duenyoDinero || '',
            totalDebt: loan.totalDebt || '',
            interestRate: loan.interestRate || '',
            frequency: loan.frequency || 'Mensual',
            installmentAmount: '',
            numberOfInstallments: loan.numberOfInstallments || loan.installments?.length || '',
            startDate: toInputDate(getLoanDates(loan).start),
            // Solo se rellena la fecha de fin si el préstamo se creó con una fecha de fin elegida
            endDate: loan.endDateCustom ? toInputDate(getLoanDates(loan).end) : '',
            calcMode: 'installments'
        });
        setIsModalOpen(true);
    };

    // Datos que alimentan el cálculo según el campo que manda (nº de cuotas o pago por cuota)
    const planInput = {
        totalDebt: formData.totalDebt,
        interestRate: formData.interestRate,
        frequency: formData.frequency,
        startDate: formData.startDate,
        endDate: formData.endDate,
        numberOfInstallments: formData.calcMode === 'installments' ? Number(formData.numberOfInstallments) || 0 : 0,
        installmentAmount: formData.calcMode === 'amount' ? Number(formData.installmentAmount) || 0 : 0
    };
    const loanPlan = getLoanPlan(planInput);
    // Con pagos registrados el calendario es definitivo (el backend lo ignora), así que se bloquean esos campos
    const editingLoanLocked = Boolean(editingLoan) &&
        (loans.find((item) => item.id === editingLoan)?.installments || []).some((item) => Number(item.paidAmount) > 0);

    const handleSaveLoan = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const currentToken = await getValidToken();
            if (!currentToken) throw new Error('No hay sesión activa');

            const url = editingLoan
                ? `${API_URL}/api/loans/${editingLoan}`
                : `${API_URL}/api/loans`;

            const method = editingLoan ? 'PUT' : 'POST';

            const totalDebt = Number(formData.totalDebt) || 0;
            const interestRate = Number(formData.interestRate) || 0;
            const plan = getLoanPlan(planInput);
            if (!plan) throw new Error('Indica el número de cuotas, la cuota o la fecha de fin');
            if (plan.error) throw new Error(plan.error);

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({
                    clientName: formData.clientName,
                    duenyoDinero: formData.duenyoDinero,
                    totalDebt,
                    interestRate,
                    frequency: formData.frequency,
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                    // Solo viaja el dato que manda; el backend calcula el resto
                    numberOfInstallments: planInput.numberOfInstallments,
                    installmentAmount: planInput.installmentAmount
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error al guardar el préstamo');

            if (data.credentials) {
                setNewCredentials({
                    ...data.credentials,
                    username: String(data.credentials.username || '').replace(/\d/g, '')
                });
            }

            setFormData({ clientName: '', duenyoDinero: '', totalDebt: '', interestRate: '', frequency: 'Mensual', installmentAmount: '', numberOfInstallments: '', startDate: '', endDate: '', calcMode: 'installments' });
            setIsModalOpen(false);
            setEditingLoan(null);
            fetchLoans();
        } catch (err) {
            console.error(err);
            setFormError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenDeleteModal = (loan) => {
        setLoanToDelete(loan);
        setDeleteError('');
        setDeleteSuccessMessage(null);
        setIsDeleteModalOpen(true);
    };

    // Ejecuta la eliminación al confirmar en el modal
    const handleConfirmDelete = async () => {
        if (!loanToDelete) return;

        setDeletingLoan(true);
        setDeleteError('');
        setDeleteSuccessMessage(null);

        try {
            const currentToken = await getValidToken();
            const response = await fetch(`${API_URL}/api/loans/${loanToDelete.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error al eliminar');

            setDeleteSuccessMessage('¡Préstamo y cuenta eliminados correctamente!');

            setTimeout(() => {
                setIsDeleteModalOpen(false);
                setLoanToDelete(null);
                setDeleteSuccessMessage(null);
                fetchLoans(); // Recargamos la tabla
            }, 1200);

        } catch (err) {
            console.error(err);
            setDeleteError(err.message);
        } finally {
            setDeletingLoan(false);
        }
    };

    const handleCompleteLoan = (loan) => {
        setLoanToComplete(loan);
        setCompleteError('');
        setCompleteSuccessMessage(null);
    };

    const handleConfirmCompleteLoan = async () => {
        if (!loanToComplete) return;

        setCompletingLoan(true);
        setCompleteError('');
        setCompleteSuccessMessage(null);

        try {
            const currentToken = await getValidToken();
            const response = await fetch(`${API_URL}/api/loans/${loanToComplete.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ remainingDebt: 0, status: 'Pagado' })
            });

            if (!response.ok) throw new Error('Error al actualizar el estado del préstamo');
            setCompleteSuccessMessage('La deuda se marcó como pagada correctamente.');
            setTimeout(() => {
                setLoanToComplete(null);
                setCompleteSuccessMessage(null);
                fetchLoans();
            }, 1200);
        } catch (err) {
            console.error(err);
            setCompleteError(err.message);
        } finally {
            setCompletingLoan(false);
        }
    };

    const handleCopyCredential = async (credentialName, value) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedCredential(credentialName);
            setTimeout(() => setCopiedCredential(''), 1500);
        } catch (err) {
            console.error('No se pudo copiar la credencial', err);
        }
    };

    const handleOpenHistory = async (loan) => {
        setHistoryLoan(loan);
        setHistoryItems([]);
        setHistoryError('');
        setHistoryLoading(true);
        try {
            const currentToken = await getValidToken();
            const response = await fetch(`${API_URL}/api/loans/${loan.id}/payments`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error al cargar el historial');
            setHistoryItems(data);
        } catch (err) {
            console.error(err);
            setHistoryError(err.message);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Abrir modal de pago parcial
    const handleOpenPaymentModal = (loan) => {
        setSelectedLoanForPayment(loan);
        setAmountPaid('');
        setIsPaymentModalOpen(true);
    };

    // Enviar el abono parcial al backend
    const handleRegisterPaymentSubmit = async (e) => {
        e.preventDefault();
        if (!selectedLoanForPayment || !amountPaid) return;

        setSubmittingPayment(true);
        setPaymentError('');
        setPaymentSuccessMessage(null);

        try {
            const currentToken = await getValidToken();
            if (!currentToken) throw new Error('No hay sesión activa');

            const response = await fetch(`${API_URL}/api/loans/${selectedLoanForPayment.id}/payments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ amountPaid: Number(amountPaid) })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error al registrar el pago');

            // Mostramos el mensaje de éxito bonito dentro del modal en lugar de un alert
            setPaymentSuccessMessage(`¡Abono registrado con éxito! Nueva deuda restante: $${formatCurrency(data.remainingDebt)}`);

            // Esperamos 1.5 segundos para que el admin vea el mensaje de éxito antes de cerrar el modal automáticamente
            setTimeout(() => {
                setIsPaymentModalOpen(false);
                setSelectedLoanForPayment(null);
                setAmountPaid('');
                setPaymentSuccessMessage(null);
                fetchLoans();
            }, 1500);

        } catch (err) {
            console.error(err);
            setPaymentError(err.message);
        } finally {
            setSubmittingPayment(false);
        }
    };

    // Función para enviar recordatorio automatizado por WhatsApp según la frecuencia
    const sendWhatsAppReminder = (loan) => {
        const remaining = Number(loan.remainingDebt || 0);
        const nextInstallment = loan.installments?.find((item) => item.status !== 'paid');
        const installment = nextInstallment
            ? Math.max(0, Number(nextInstallment.amountDue || 0) - Number(nextInstallment.paidAmount || 0))
            : Number(loan.installmentAmount || 0);
        const dueDate = toDate(nextInstallment?.dueDate);
        const frequencyText = loan.frequency ? loan.frequency.toLowerCase() : 'periódica';

        const message = `Hola *${loan.clientName}*, te saludamos de la administración financiera. Te recordamos que tienes un pago pendiente de cuota (${frequencyText}) por un monto de *$${installment.toLocaleString(undefined, { maximumFractionDigits: 2 })}*${dueDate ? ` con vencimiento el *${formatDate(dueDate)}*` : ''}. Tu deuda restante actual es de *$${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}*. Por favor, realiza tu abono a la brevedad posible. ¡Gracias!`;

        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    const formatCurrency = (value) => (Math.round((Number(value) || 0) * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const activeLoans = loans.filter((loan) => !isLoanPaid(loan));
    const paidLoans = loans.filter(isLoanPaid);
    const trackedLoans = activeLoans
        .map((loan) => ({ loan, due: getDueInfo(loan) }))
        .sort((a, b) => (a.due?.days ?? Infinity) - (b.due?.days ?? Infinity));
    const totalDebtSum = activeLoans.reduce((acc, loan) => acc + (Number(loan.remainingDebt) || 0), 0);
    const activeClientsCount = activeLoans.length;

    return (
        <div className="relative min-h-screen bg-slate-950 overflow-hidden font-sans text-slate-100 p-4 sm:p-8 selection:bg-indigo-500 selection:text-white">

            <div className="absolute top-0 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none"></div>
            <div className="absolute bottom-0 -right-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-[140px] pointer-events-none"></div>

            <div className="relative max-w-7xl mx-auto w-full min-w-0 space-y-8">

                {/* Cabecera del Panel */}
                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 p-6 rounded-3xl shadow-xl animate-[fadeIn_0.6s_ease-out_forwards]">
                    <div className="flex items-center space-x-4">
                        <img
                            src="/logo.svg"
                            alt="Gestor de Préstamos"
                            className="w-12 h-12 shrink-0 rounded-2xl shadow-lg shadow-indigo-500/30"
                        />
                        <div>
                            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                                Microcreditos Marca
                            </h1>
                            <p className="text-xs sm:text-sm text-slate-400">
                                Bienvenido, <span className="text-indigo-400 font-medium">{user?.username || user?.name || 'Admin'}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                            onClick={handleOpenCreateModal}
                            className="flex-1 sm:flex-none px-5 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 cursor-pointer"
                        >
                            + Nuevo Préstamo
                        </button>
                        <button
                            onClick={handleLogoutClick}
                            className="px-4 py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold rounded-2xl border border-slate-700/60 transition-all duration-300 cursor-pointer"
                        >
                            Salir
                        </button>
                    </div>
                </header>

                {/* Tarjetas de Métricas */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl shadow-lg animate-[fadeIn_0.8s_ease-out_0.2s_both]">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Deuda Total Activa</p>
                        <h3 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-indigo-400">
                            ${formatCurrency(totalDebtSum)}
                        </h3>
                    </div>
                    <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl shadow-lg animate-[fadeIn_0.8s_ease-out_0.25s_both]">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Saldo en Caja</p>
                            {!isEditingCash && cashBalance !== null && (
                                <button
                                    onClick={handleStartEditCash}
                                    aria-label="Editar saldo en caja"
                                    className="min-h-9 px-2.5 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg cursor-pointer"
                                >
                                    ✎ Editar
                                </button>
                            )}
                        </div>
                        {isEditingCash ? (
                            <form onSubmit={handleSaveCash} className="space-y-2">
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    autoFocus
                                    value={cashInput}
                                    onChange={(e) => setCashInput(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-800/90 rounded-xl text-lg font-bold text-slate-100 focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                {cashError && <p className="text-xs text-rose-400">{cashError}</p>}
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={savingCash}
                                        className="min-h-11 flex-1 px-3 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 cursor-pointer"
                                    >
                                        {savingCash ? 'Guardando...' : 'Guardar'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingCash(false)}
                                        className="min-h-11 px-3 py-2 bg-slate-800/80 text-slate-300 text-sm font-semibold rounded-xl border border-slate-700/60 cursor-pointer"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <h3 className={`text-3xl font-extrabold ${cashBalance !== null && cashBalance < 0 ? 'text-rose-400' : 'text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-200 to-emerald-400'}`}>
                                    {cashBalance === null ? '...' : `${cashBalance < 0 ? '-' : ''}$${Math.abs(cashBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                                </h3>
                                <p className="mt-1 text-[11px] text-slate-500">Baja con cada préstamo y sube con cada cobro</p>
                            </>
                        )}
                    </div>
                    <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl shadow-lg animate-[fadeIn_0.8s_ease-out_0.3s_both]">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Clientes Registrados</p>
                        <h3 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-cyan-400">
                            {activeClientsCount}
                        </h3>
                    </div>
                </div>

                {/* Selector de lista */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="tablist">
                    {[
                        { key: 'active', label: 'Préstamos activos', short: 'Activos', count: activeLoans.length },
                        { key: 'tracking', label: 'Seguimiento de pagos', short: 'Seguimiento', count: trackedLoans.length },
                        { key: 'paid', label: 'Pagados', short: 'Pagados', count: paidLoans.length },
                        { key: 'profit', label: 'Ganancias', short: 'Ganancias', count: null }
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            role="tab"
                            aria-selected={activeTab === tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`min-h-12 px-2 sm:px-4 py-2.5 rounded-2xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${activeTab === tab.key
                                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 border-transparent text-white shadow-lg shadow-indigo-600/30'
                                : 'bg-slate-900/70 border-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800/80'
                                }`}
                        >
                            <span className="sm:hidden">{tab.short}</span><span className="hidden sm:inline">{tab.label}</span>
                            {tab.count !== null && <span className="ml-1 text-xs opacity-75">({tab.count})</span>}
                        </button>
                    ))}
                </div>

                {/* Tabla de Clientes / Préstamos con Proyecciones e Intereses */}
                {activeTab === 'active' && <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden animate-[fadeIn_1s_ease-out_0.4s_both]">
                    <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">Listado de Clientes y Préstamos</h2>
                        <span className="text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
                            {activeLoans.length} activos
                        </span>
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-slate-500 space-y-3">
                            <svg className="animate-spin h-8 text-indigo-500 mx-auto" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p className="text-sm">Cargando información financiera...</p>
                        </div>
                    ) : error ? (
                        <div className="p-12 text-center text-rose-400 text-sm">
                            {error}
                        </div>
                    ) : activeLoans.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 text-sm">
                            {loans.length === 0
                                ? 'No hay préstamos registrados todavía. ¡Crea el primero arriba!'
                                : 'No hay préstamos activos. Todos están pagados.'}
                        </div>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[980px] text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-800/80 bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                            <th className="py-4 px-6">Cliente</th>
                                            <th className="py-4 px-6">Deuda Restante / Abonos</th>
                                            <th className="py-4 px-6">Capital e Interés Total</th>
                                            <th className="py-4 px-6">Frecuencia / Cuota</th>
                                            <th className="py-4 px-6">Estado</th>
                                            <th className="py-4 px-6 text-right">Acciones de Gestión</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 text-sm">
                                        {activeLoans.map((loan) => {
                                            const totalDebt = Number(loan.totalDebt) || 0;
                                            const interestRate = Number(loan.interestRate) || 0;
                                            const totalWithInterest = Number(loan.totalWithInterest) ||
                                                (loan.installments || []).reduce((sum, installment) => sum + Number(installment.amountDue || 0), 0) ||
                                                totalDebt * (1 + interestRate / 100);
                                            const remaining = Number(loan.remainingDebt) || 0;
                                            const paidSoFar = Math.max(0, totalDebt - remaining);

                                            return (
                                                <tr key={loan.id} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="py-4 px-6 font-semibold text-white">
                                                        <div>{loan.clientName}</div>
                                                        <div className="mt-1 text-[11px] font-medium text-slate-400">
                                                            Dueño: <span className="text-cyan-300/80">{loan.duenyoDinero || 'No especificado'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <div className="font-bold text-indigo-400">${formatCurrency(remaining)}</div>
                                                        {paidSoFar > 0 && (
                                                            <span className="text-[11px] text-emerald-400 font-medium block">
                                                                Abonado: ${formatCurrency(paidSoFar)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <div className="text-slate-200 font-semibold">${formatCurrency(totalWithInterest)}</div>
                                                        <span className="text-[11px] text-indigo-300/80">
                                                            Base: ${formatCurrency(totalDebt)} ({interestRate}% por cuota)
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-slate-300">
                                                        <div className="font-medium">{loan.frequency}</div>
                                                        <span className="text-[11px] text-slate-400">
                                                            {loan.numberOfInstallments || loan.installments?.length || 0} cuotas · Siguiente: ${formatCurrency(loan.installments?.find((item) => item.status !== 'paid')?.amountDue || loan.installmentAmount)}
                                                        </span>
                                                        <LoanDates loan={loan} className="mt-1.5 space-y-0.5 text-[11px]" />
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${loan.status === 'Pagado'
                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                            }`}>
                                                            {loan.status || 'Activo'}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-right space-x-1.5 whitespace-nowrap">
                                                        {loan.status !== 'Pagado' && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleOpenPaymentModal(loan)}
                                                                    title="Registrar abono parcial"
                                                                    className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                                                >
                                                                    💵 Abonar
                                                                </button>
                                                                <button
                                                                    onClick={() => sendWhatsAppReminder(loan)}
                                                                    title="Enviar recordatorio de pago por WhatsApp"
                                                                    className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                                                >
                                                                    💬 WhatsApp
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCompleteLoan(loan)}
                                                                    title="Dar por Pagado"
                                                                    className="px-2.5 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                                                >
                                                                    ✓ Pagado
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => handleOpenHistory(loan)}
                                                            title="Ver historial de pagos"
                                                            className="px-2.5 py-1.5 bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600/40 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                                        >
                                                            🧾 Historial
                                                        </button>
                                                        <button
                                                            onClick={() => handleOpenEditModal(loan)}
                                                            className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            onClick={() => handleOpenDeleteModal(loan)}
                                                            className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="grid gap-4 p-4 md:hidden">
                                {activeLoans.map((loan) => {
                                    const totalDebt = Number(loan.totalDebt) || 0;
                                    const interestRate = Number(loan.interestRate) || 0;
                                    const totalWithInterest = Number(loan.totalWithInterest) ||
                                        (loan.installments || []).reduce((sum, installment) => sum + Number(installment.amountDue || 0), 0) ||
                                        totalDebt * (1 + interestRate / 100);
                                    const remaining = Number(loan.remainingDebt) || 0;
                                    const paidSoFar = Math.max(0, totalDebt - remaining);

                                    return (
                                        <article key={loan.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4 shadow-lg">
                                            <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
                                                <div className="min-w-0">
                                                    <h3 className="truncate font-semibold text-white">{loan.clientName}</h3>
                                                    <p className="mt-1 truncate text-[11px] font-medium text-slate-400">
                                                        Dueño: <span className="text-cyan-300/80">{loan.duenyoDinero || 'No especificado'}</span>
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-400">{loan.frequency} · {loan.numberOfInstallments || loan.installments?.length || 0} cuotas · Siguiente: ${formatCurrency(loan.installments?.find((item) => item.status !== 'paid')?.amountDue || loan.installmentAmount)}</p>
                                                    <LoanDates loan={loan} className="mt-2 space-y-0.5 text-[11px]" />
                                                </div>
                                                <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${loan.status === 'Pagado'
                                                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                                    : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                                                    }`}>
                                                    {loan.status || 'Activo'}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-4">
                                                <div>
                                                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Deuda restante</span>
                                                    <span className="mt-1 block font-bold text-indigo-400">${formatCurrency(remaining)}</span>
                                                    {paidSoFar > 0 && <span className="mt-0.5 block text-[11px] text-emerald-400">Abonado: ${formatCurrency(paidSoFar)}</span>}
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total con interés</span>
                                                    <span className="mt-1 block font-semibold text-slate-200">${formatCurrency(totalWithInterest)}</span>
                                                    <span className="mt-0.5 block text-[11px] text-indigo-300/80">Base: ${formatCurrency(totalDebt)} ({interestRate}%)</span>
                                                </div>
                                            </div>

                                            <div className="mt-1 border-t border-slate-800/80 pt-4">
                                                {loan.status !== 'Pagado' && (
                                                    <div className="space-y-3">
                                                        <button
                                                            onClick={() => handleOpenPaymentModal(loan)}
                                                            className="group flex min-h-14 w-full items-center justify-between rounded-2xl border border-indigo-400/40 bg-gradient-to-r from-indigo-600/30 via-indigo-600/20 to-cyan-500/10 px-4 py-3 text-left shadow-lg shadow-indigo-950/30 transition-all hover:border-indigo-300/60 hover:from-indigo-600/40 active:scale-[0.99]"
                                                        >
                                                            <span className="flex items-center gap-3">
                                                                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-400/20 text-lg">💵</span>
                                                                <span>
                                                                    <span className="block text-sm font-bold text-indigo-100">Registrar abono</span>
                                                                    <span className="mt-0.5 block text-[11px] text-indigo-200/60">Actualizar deuda restante</span>
                                                                </span>
                                                            </span>
                                                            <span className="text-xl text-indigo-200 transition-transform group-hover:translate-x-1">›</span>
                                                        </button>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <button
                                                                onClick={() => sendWhatsAppReminder(loan)}
                                                                className="flex min-h-14 flex-col items-start justify-center rounded-2xl border border-emerald-500/30 bg-emerald-600/10 px-4 py-3 text-left transition-all hover:bg-emerald-600/20 active:scale-[0.98]"
                                                            >
                                                                <span className="text-lg">💬</span>
                                                                <span className="mt-1 text-xs font-bold text-emerald-300">WhatsApp</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleCompleteLoan(loan)}
                                                                className="flex min-h-14 flex-col items-start justify-center rounded-2xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-left transition-all hover:bg-teal-500/20 active:scale-[0.98]"
                                                            >
                                                                <span className="text-lg">✓</span>
                                                                <span className="mt-1 text-xs font-bold text-teal-300">Terminar</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3">
                                                    <button
                                                        onClick={() => handleOpenHistory(loan)}
                                                        aria-label={`Historial de pagos de ${loan.clientName}`}
                                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-600/40 bg-slate-700/30 text-base transition-all hover:bg-slate-700/50 active:scale-[0.98]"
                                                    >
                                                        🧾
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenEditModal(loan)}
                                                        className="min-h-11 flex-1 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-300 transition-all hover:bg-indigo-500/20 active:scale-[0.98]"
                                                    >
                                                        ✎ Editar datos
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenDeleteModal(loan)}
                                                        aria-label={`Eliminar préstamo de ${loan.clientName}`}
                                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-base text-rose-400 transition-all hover:bg-rose-500/20 active:scale-[0.98]"
                                                    >
                                                        🗑
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>}

                {/* Seguimiento de fechas de pago (semáforo) */}
                {activeTab === 'tracking' && <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-white">Seguimiento de Pagos</h2>
                            <p className="mt-1 text-xs text-slate-400">Ordenado por la fecha de pago más próxima</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                            <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DUE_TONES.overdue.dot}`}></span>Vencida</span>
                            <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DUE_TONES.soon.dot}`}></span>Cerca (≤ {NEAR_DUE_DAYS} días)</span>
                            <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DUE_TONES.ok.dot}`}></span>Con margen</span>
                        </div>
                    </div>
                    {trackedLoans.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">No hay clientes con pagos pendientes.</div>
                    ) : (
                        <ul className="grid gap-3 p-4">
                            {trackedLoans.map(({ loan, due }) => (
                                <li
                                    key={loan.id}
                                    className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${due ? due.tone.row : 'border-slate-800/80 bg-slate-950/50'}`}
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-white">{loan.clientName}</p>
                                        <p className="mt-0.5 text-[11px] text-slate-400">
                                            Deuda restante ${formatCurrency(loan.remainingDebt)} · Fin previsto {formatDate(getLoanDates(loan).end)}
                                        </p>
                                    </div>
                                    {due ? (
                                        <div className="w-full sm:w-auto sm:text-right">
                                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${due.tone.badge}`}>
                                                {due.label}
                                            </span>
                                            <p className="mt-1 text-[11px] text-slate-400">
                                                Cuota {due.next.installmentNumber} · {formatDate(due.due)} · ${formatCurrency(Number(due.next.amountDue || 0) - Number(due.next.paidAmount || 0))}
                                            </p>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-slate-500">Sin calendario de cuotas</span>
                                    )}
                                    <button
                                        onClick={() => handleOpenPaymentModal(loan)}
                                        className="min-h-11 w-full sm:w-auto px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                    >
                                        💵 Abonar
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>}

                {/* Préstamos pagados por completo */}
                {activeTab === 'paid' && <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">Préstamos Pagados</h2>
                        <span className="text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
                            {paidLoans.length} pagados
                        </span>
                    </div>
                    {paidLoans.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">Todavía no hay préstamos pagados.</div>
                    ) : (
                        <ul className="grid gap-3 p-4">
                            {paidLoans.map((loan) => {
                                const dates = getLoanDates(loan);
                                const totalPaid = Number(loan.totalWithInterest) ||
                                    (loan.installments || []).reduce((sum, item) => sum + Number(item.amountDue || 0), 0) ||
                                    Number(loan.totalDebt) || 0;
                                return (
                                    <li key={loan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-white">{loan.clientName}</p>
                                            <p className="mt-0.5 text-[11px] text-slate-400">
                                                {formatDate(dates.start)} → {formatDate(dates.end)} · Total ${formatCurrency(totalPaid)}
                                            </p>
                                        </div>
                                        <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-2">
                                            <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                                                Pagado
                                            </span>
                                            <button
                                                onClick={() => handleOpenDeleteModal(loan)}
                                                aria-label={`Eliminar préstamo de ${loan.clientName}`}
                                                className="min-h-11 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>}

                {/* Ganancias: interés cobrado y pendiente */}
                {activeTab === 'profit' && (() => {
                    const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    const monthLabel = (key) => {
                        const [year, month] = key.split('-').map(Number);
                        return new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
                    };
                    if (profitLoading && !profit) {
                        return <div className="p-12 text-center text-sm text-slate-500">Calculando ganancias...</div>;
                    }
                    if (profitError) {
                        return <div className="p-12 text-center text-sm text-rose-400">{profitError}</div>;
                    }
                    if (!profit) return null;
                    const maxMonth = Math.max(1, ...profit.months.map((item) => item.collected));
                    const maxLoanProfit = Math.max(1, ...profit.loans.map((item) => item.expected));
                    const cards = [
                        { label: 'Ganancia cobrada', value: money(profit.totals.interestEarned), tone: 'text-emerald-400', hint: `${profit.totals.returnOnCapital}% sobre el capital prestado` },
                        { label: 'Ganancia pendiente', value: money(profit.totals.interestPending), tone: 'text-amber-300', hint: `de ${money(profit.totals.interestExpected)} previstos` },
                        { label: 'Capital prestado', value: money(profit.totals.capitalLent), tone: 'text-indigo-300', hint: 'suma de todos los préstamos' },
                        { label: 'Total cobrado', value: money(profit.totals.collected), tone: 'text-cyan-300', hint: `faltan ${money(profit.totals.outstanding)}` }
                    ];
                    return (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                                {cards.map((card) => (
                                    <div key={card.label} className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 p-4 sm:p-6 rounded-3xl shadow-lg">
                                        <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{card.label}</p>
                                        <h3 className={`text-xl sm:text-2xl font-extrabold ${card.tone}`}>{card.value}</h3>
                                        <p className="mt-1 text-[11px] text-slate-500">{card.hint}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden">
                                <div className="p-6 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Cobros por mes</h2>
                                        <p className="mt-1 text-xs text-slate-400">Últimos 12 meses · la parte verde es ganancia (interés)</p>
                                    </div>
                                </div>
                                <ul className="p-4 space-y-3">
                                    {profit.months.map((item) => (
                                        <li key={item.month} className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[4rem_1fr_auto] items-center gap-x-3 gap-y-1">
                                            <span className="text-xs font-semibold capitalize text-slate-400">{monthLabel(item.month)}</span>
                                            <div className="h-3 rounded-full bg-slate-800/80 overflow-hidden">
                                                <div className="h-full flex" style={{ width: `${(item.collected / maxMonth) * 100}%` }}>
                                                    <div className="h-full bg-emerald-400" style={{ width: `${item.collected > 0 ? (item.interest / item.collected) * 100 : 0}%` }}></div>
                                                    <div className="h-full flex-1 bg-indigo-500/70"></div>
                                                </div>
                                            </div>
                                            <span className="col-span-2 sm:col-span-1 text-[11px] text-slate-400 sm:text-right">
                                                {money(item.collected)} cobrado · <span className="text-emerald-400 font-semibold">{money(item.interest)}</span> ganancia
                                                {item.lent > 0 && <span className="text-slate-500"> · prestado {money(item.lent)}</span>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden">
                                <div className="p-6 border-b border-slate-800/80">
                                    <h2 className="text-lg font-bold text-white">Ganancia por cliente</h2>
                                    <p className="mt-1 text-xs text-slate-400">Cobrada frente a la prevista de cada préstamo</p>
                                </div>
                                {profit.loans.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 text-sm">Todavía no hay préstamos.</div>
                                ) : (
                                    <ul className="grid gap-3 p-4">
                                        {profit.loans.map((item) => (
                                            <li key={item.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="truncate font-semibold text-white">{item.clientName}</p>
                                                    <p className="text-xs text-slate-400">
                                                        <span className="font-semibold text-emerald-400">{money(item.earned)}</span> de {money(item.expected)}
                                                    </p>
                                                </div>
                                                <div className="mt-2 h-2 rounded-full bg-slate-800/80 overflow-hidden" style={{ width: `${Math.max(8, (item.expected / maxLoanProfit) * 100)}%` }}>
                                                    <div className="h-full bg-emerald-400" style={{ width: `${item.expected > 0 ? (item.earned / item.expected) * 100 : 0}%` }}></div>
                                                </div>
                                                <p className="mt-1.5 text-[11px] text-slate-500">
                                                    Capital {money(item.capital)} · cobrado {money(item.collected)} · {item.status === 'Pagado' ? 'pagado' : `faltan ${money(item.outstanding)}`}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    );
                })()}

            </div>

            {/* Modal de historial de pagos */}
            {historyLoan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6">
                    <div className="relative my-auto w-full max-w-lg bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-white">Historial de pagos</h3>
                                <p className="text-xs text-slate-400">{historyLoan.clientName}</p>
                            </div>
                            <button
                                onClick={() => setHistoryLoan(null)}
                                className="px-3 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-sm font-semibold rounded-xl border border-slate-700/60 cursor-pointer"
                            >
                                Cerrar
                            </button>
                        </div>
                        {historyLoading ? (
                            <p className="py-6 text-center text-sm text-slate-500">Cargando historial...</p>
                        ) : historyError ? (
                            <p className="py-6 text-center text-sm text-rose-400">{historyError}</p>
                        ) : historyItems.length === 0 ? (
                            <p className="py-6 text-center text-sm text-slate-500">Todavía no hay pagos registrados.</p>
                        ) : (
                            <ul className="max-h-80 space-y-2 overflow-y-auto">
                                {historyItems.map((item) => (
                                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3 text-sm">
                                        <div>
                                            <p className="font-semibold text-emerald-400">+${formatCurrency(item.amount)}</p>
                                            <p className="text-[11px] text-slate-400">
                                                {formatDate(toDate(item.createdAt))}
                                                {item.installmentNumbers?.length > 0 && ` · Cuota${item.installmentNumbers.length > 1 ? 's' : ''} ${item.installmentNumbers.join(', ')}`}
                                            </p>
                                        </div>
                                        <span className="text-[11px] text-slate-400">Quedaba ${formatCurrency(item.remainingDebtAfter)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Modal para Crear / Editar Préstamo */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-72 h-72 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative my-auto w-full max-w-xl bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl">

                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                                    💳
                                </div>
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                                        {editingLoan ? 'Modificar Préstamo' : 'Registrar Nuevo Préstamo'}
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        {editingLoan ? 'Actualiza los datos del préstamo' : 'Completa los datos financieros del cliente'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50 transition-all duration-200 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveLoan} className="space-y-4">
                            {formError && (
                                <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-xl text-center">
                                    {formError}
                                </div>
                            )}

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                    Nombre del Cliente
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.clientName}
                                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                                    placeholder="Ej. Carlos Mendoza"
                                    className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                    Dueño del dinero
                                </label>
                                <select
                                    required
                                    value={formData.duenyoDinero}
                                    onChange={(e) => setFormData({ ...formData, duenyoDinero: e.target.value })}
                                    className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 cursor-pointer"
                                >
                                    <option value="" disabled className="bg-slate-900 text-slate-500">
                                        Selecciona un dueño
                                    </option>
                                    <option value="Carlos Insuasty">Carlos Insuasty</option>
                                    <option value="Piedad chamorro">Piedad chamorro</option>

                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Deuda Total ($)
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        disabled={editingLoanLocked}
                                        value={formData.totalDebt}
                                        onChange={(e) => setFormData({ ...formData, totalDebt: e.target.value })}
                                        placeholder="0.00"
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Interés (%)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        disabled={editingLoanLocked}
                                        value={formData.interestRate}
                                        onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                                        placeholder="Ej. 10"
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                </div>
                            </div>

                            {editingLoanLocked && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-xl">
                                    Este préstamo ya tiene pagos registrados: el capital, el interés, las cuotas y las fechas no se pueden cambiar. Solo puedes editar el nombre y el dueño.
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Número de Cuotas
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        disabled={editingLoanLocked}
                                        value={formData.calcMode === 'installments' ? formData.numberOfInstallments : (loanPlan && !loanPlan.error ? loanPlan.installments : '')}
                                        onChange={(e) => setFormData({ ...formData, numberOfInstallments: e.target.value, calcMode: 'installments' })}
                                        placeholder="Ej. 4"
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <p className="mt-1.5 text-[10px] text-slate-500">Escríbelo y se calcula la cuota</p>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Pago por Cuota ($)
                                    </label>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        disabled={editingLoanLocked}
                                        value={formData.calcMode === 'amount' ? formData.installmentAmount : (loanPlan && !loanPlan.error ? loanPlan.payment.toFixed(2) : '')}
                                        onChange={(e) => setFormData({ ...formData, installmentAmount: e.target.value, calcMode: 'amount' })}
                                        placeholder="Ej. 300"
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <p className="mt-1.5 text-[10px] text-slate-500">O escribe la cuota y se calcula el nº de cuotas</p>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Frecuencia de Pago
                                    </label>
                                    <select
                                        disabled={editingLoanLocked}
                                        value={formData.frequency}
                                        onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 cursor-pointer"
                                    >
                                        <option value="Diario" className="bg-slate-900 text-white">Diario</option>
                                        <option value="Semanal" className="bg-slate-900 text-white">Semanal</option>
                                        <option value="Quincenal" className="bg-slate-900 text-white">Quincenal</option>
                                        <option value="Mensual" className="bg-slate-900 text-white">Mensual</option>
                                    </select>
                                    <p className="mt-1.5 text-[10px] text-slate-500">Cada cuánto vence una cuota</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Fecha de Inicio
                                    </label>
                                    <input
                                        type="date"
                                        disabled={editingLoanLocked}
                                        value={formData.startDate}
                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <p className="mt-1.5 text-[10px] text-slate-500">Vacía = el día de hoy</p>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Fecha de Fin (opcional)
                                    </label>
                                    <input
                                        type="date"
                                        disabled={editingLoanLocked}
                                        value={formData.endDate}
                                        min={formData.startDate || undefined}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <p className="mt-1.5 text-[10px] text-slate-500">Si la pones, las cuotas se reparten hasta ese día</p>
                                </div>
                            </div>

                            {loanPlan && loanPlan.error ? (
                                <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-xl text-center">
                                    {loanPlan.error}
                                </div>
                            ) : loanPlan ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                                    <div>
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-300/70">Total a pagar</span>
                                        <span className="text-lg font-extrabold text-indigo-100">${loanPlan.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-300/70">Interés total</span>
                                        <span className="text-lg font-extrabold text-indigo-100">${loanPlan.interestTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        <span className="block text-[10px] text-indigo-300/70">${loanPlan.interestPerInstallment.toFixed(2)} por cuota</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-300/70">Cuotas</span>
                                        <span className="text-lg font-extrabold text-indigo-100">{loanPlan.installments} × ${loanPlan.payment.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-300/70">Termina</span>
                                        <span className="text-lg font-extrabold text-indigo-100">{formatDate(loanPlan.endDate)}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-[11px] text-slate-500">Indica el capital y el número de cuotas, la cuota o la fecha de fin para ver el resumen.</p>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-800/80">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold rounded-2xl border border-slate-700/60 transition-all duration-200 cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:opacity-50 cursor-pointer"
                                >
                                    {submitting ? 'Guardando...' : editingLoan ? 'Actualizar Préstamo' : 'Guardar Préstamo'}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Credenciales Creadas */}
            {newCredentials && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-80 h-80 bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>

                    <div className="relative my-auto w-full max-w-md bg-slate-900/95 border border-emerald-500/30 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl animate-[fadeIn_0.35s_cubic-bezier(0.16,1,0.3,1)]">

                        <div className="text-center space-y-2">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-lg shadow-emerald-500/30 mb-1">
                                🎉
                            </div>
                            <h3 className="text-xl font-extrabold text-white tracking-tight">¡Cuenta de Cliente Creada!</h3>
                            <p className="text-xs text-slate-400">
                                Comparte estas credenciales con el cliente para que pueda acceder a su portal y consultar su deuda.
                            </p>
                        </div>

                        <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 p-4 rounded-2xl">
                            <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Usuario de Acceso</span>
                                    <span className="text-sm font-mono font-bold text-emerald-400">{newCredentials.username}</span>
                                </div>
                                <button
                                    onClick={() => handleCopyCredential('username', newCredentials.username)}
                                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                                >
                                    {copiedCredential === 'username' ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>

                            <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                                <div>
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Contraseña Temporal</span>
                                    <span className="text-sm font-mono font-bold text-indigo-400">{newCredentials.password}</span>
                                </div>
                                <button
                                    onClick={() => handleCopyCredential('password', newCredentials.password)}
                                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                                >
                                    {copiedCredential === 'password' ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2.5 pt-2">
                            <button
                                onClick={() => {
                                    const text = `Hola, tus credenciales de acceso para la plataforma de préstamos son:\nUsuario: ${newCredentials.username}\nContraseña: ${newCredentials.password}`;
                                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
                                }}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-600/25 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
                            >
                                💬 Compartir Credenciales por WhatsApp
                            </button>
                            <button
                                onClick={() => setNewCredentials(null)}
                                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer"
                            >
                                Cerrar Ventana
                            </button>
                        </div>

                    </div>
                </div>
            )}

            {/* Modal para Registrar Abono / Pago Parcial */}
            {isPaymentModalOpen && selectedLoanForPayment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-72 h-72 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative my-auto w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl">

                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                                    💵
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">Registrar Abono</h3>
                                    <p className="text-xs text-slate-400">Cliente: <span className="text-indigo-400 font-semibold">{selectedLoanForPayment.clientName}</span></p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsPaymentModalOpen(false)}
                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50 transition-all duration-200 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleRegisterPaymentSubmit} className="space-y-4">

                            {/* Mensaje de Error si ocurre alguno */}
                            {paymentError && (
                                <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-xl text-center">
                                    {paymentError}
                                </div>
                            )}

                            {/* Mensaje de Éxito estilizado */}
                            {paymentSuccessMessage && (
                                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-xl text-center animate-[fadeIn_0.2s_ease-out]">
                                    {paymentSuccessMessage}
                                </div>
                            )}

                            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                                <span className="text-xs text-slate-400 block">Deuda Restante Actual:</span>
                                <span className="text-2xl font-extrabold text-indigo-400">${formatCurrency(selectedLoanForPayment.remainingDebt)}</span>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                    Monto del Abono ($)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={amountPaid}
                                    onChange={(e) => setAmountPaid(e.target.value)}
                                    placeholder="Ej. 50.00"
                                    className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                {(() => {
                                    const next = (selectedLoanForPayment.installments || []).find((item) => item.status !== 'paid');
                                    const dueNow = next ? Math.max(0, Number(next.amountDue || 0) - Number(next.paidAmount || 0)) : 0;
                                    const remainingAll = Number(selectedLoanForPayment.remainingDebt) || 0;
                                    return (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {dueNow > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setAmountPaid(dueNow.toFixed(2))}
                                                    className="min-h-11 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 rounded-xl text-xs font-semibold cursor-pointer"
                                                >
                                                    Cuota {next.installmentNumber}: ${dueNow.toFixed(2)}
                                                </button>
                                            )}
                                            {remainingAll > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setAmountPaid(remainingAll.toFixed(2))}
                                                    className="min-h-11 px-3 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 rounded-xl text-xs font-semibold cursor-pointer"
                                                >
                                                    Liquidar todo: ${remainingAll.toFixed(2)}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                                <button
                                    type="button"
                                    onClick={() => setIsPaymentModalOpen(false)}
                                    className="px-5 py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold rounded-2xl border border-slate-700/60 transition-all duration-200 cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingPayment || paymentSuccessMessage}
                                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-indigo-600/30 transition-all duration-300 disabled:opacity-50 cursor-pointer"
                                >
                                    {submittingPayment ? 'Procesando...' : 'Aplicar Abono'}
                                </button>
                            </div>
                        </form>

                    </div>
                </div>
            )}
            {/* Modal de Confirmación de Eliminación Personalizado */}
            {isDeleteModalOpen && loanToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-72 h-72 bg-rose-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative my-auto w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl">

                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-red-400 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
                                    ⚠️
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">Eliminar Préstamo</h3>
                                    <p className="text-xs text-slate-400">Esta acción es irreversible</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50 transition-all duration-200 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            {deleteError && (
                                <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-xl text-center">
                                    {deleteError}
                                </div>
                            )}

                            {deleteSuccessMessage && (
                                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-xl text-center animate-[fadeIn_0.2s_ease-out]">
                                    {deleteSuccessMessage}
                                </div>
                            )}

                            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-2">
                                <p className="text-xs text-slate-300">
                                    Estás a punto de eliminar el préstamo de <span className="text-white font-bold">{loanToDelete.clientName}</span> y su cuenta de usuario asociada en el sistema.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                                <button
                                    type="button"
                                    onClick={() => setIsDeleteModalOpen(false)}
                                    className="px-5 py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold rounded-2xl border border-slate-700/60 transition-all duration-200 cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmDelete}
                                    disabled={deletingLoan || deleteSuccessMessage}
                                    className="px-6 py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-rose-600/30 transition-all duration-300 disabled:opacity-50 cursor-pointer"
                                >
                                    {deletingLoan ? 'Eliminando...' : 'Sí, Eliminar'}
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {loanToComplete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-72 h-72 bg-teal-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative my-auto w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
                                    ✓
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">Préstamo pagado</h3>
                                    <p className="text-xs text-slate-400">Marcar la deuda como pagada</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setLoanToComplete(null)}
                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50 transition-all duration-200 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            {completeError && (
                                <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-xl text-center">
                                    {completeError}
                                </div>
                            )}

                            {completeSuccessMessage && (
                                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-xl text-center animate-[fadeIn_0.2s_ease-out]">
                                    {completeSuccessMessage}
                                </div>
                            )}

                            <p className="text-sm text-slate-300">
                                ¿Deseas dar por terminada la deuda de <span className="font-bold text-white">{loanToComplete.clientName}</span>?
                            </p>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
                                <button
                                    type="button"
                                    onClick={() => setLoanToComplete(null)}
                                    className="px-5 py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold rounded-2xl border border-slate-700/60 transition-all duration-200 cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmCompleteLoan}
                                    disabled={completingLoan || completeSuccessMessage}
                                    className="px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-teal-600/30 transition-all duration-300 disabled:opacity-50 cursor-pointer"
                                >
                                    {completingLoan ? 'Actualizando...' : 'Sí, terminar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                  from { opacity: 0; transform: translateY(10px) scale(0.98); }
                  to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}