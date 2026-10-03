import React, { useState, useEffect } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { API_URL } from '../services/api';

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
        installmentAmount: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [loanToComplete, setLoanToComplete] = useState(null);
    const [completingLoan, setCompletingLoan] = useState(false);
    const [completeError, setCompleteError] = useState('');
    const [completeSuccessMessage, setCompleteSuccessMessage] = useState(null);
    const [copiedCredential, setCopiedCredential] = useState('');

    const getValidToken = async () => {
        if (token) return token;
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
            return await currentUser.getIdToken();
        }
        return null;
    };

    useEffect(() => {
        fetchUserData();
        fetchLoans();
    }, []);

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
        setFormData({ clientName: '',duenyoDinero: '', totalDebt: '', interestRate: '', frequency: 'Mensual', installmentAmount: '' });
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (loan) => {
        setEditingLoan(loan.id);
        setFormError('');
        setFormData({
            clientName: loan.clientName || '',
            duenyoDinero: loan.duenyoDinero|| '',
            totalDebt: loan.totalDebt || '',
            interestRate: loan.interestRate || '',
            frequency: loan.frequency || 'Mensual',
            installmentAmount: loan.installmentAmount || ''
        });
        setIsModalOpen(true);
    };

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

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error al guardar el préstamo');

            if (data.credentials) {
                setNewCredentials(data.credentials);
            }

            setFormData({ clientName: '',duenyoDinero: '', totalDebt: '', interestRate: '', frequency: 'Mensual', installmentAmount: '' });
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
            setPaymentSuccessMessage(`¡Abono registrado con éxito! Nueva deuda restante: $${data.remainingDebt.toLocaleString()}`);

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
        const installment = Number(loan.installmentAmount || 0);
        const frequencyText = loan.frequency ? loan.frequency.toLowerCase() : 'periódica';

        const message = `Hola *${loan.clientName}*, te saludamos de la administración financiera. Te recordamos que tienes un pago pendiente de cuota (${frequencyText}) por un monto de *$${installment.toLocaleString()}*. Tu deuda restante actual es de *$${remaining.toLocaleString()}*. Por favor, realiza tu abono a la brevedad posible. ¡Gracias!`;

        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    const totalDebtSum = loans.reduce((acc, loan) => acc + (Number(loan.remainingDebt) || 0), 0);
    const activeClientsCount = loans.length;

    return (
        <div className="relative min-h-screen bg-slate-950 overflow-hidden font-sans text-slate-100 p-4 sm:p-8 selection:bg-indigo-500 selection:text-white">

            <div className="absolute top-0 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none"></div>
            <div className="absolute bottom-0 -right-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-[140px] pointer-events-none"></div>

            <div className="relative max-w-7xl mx-auto space-y-8">

                {/* Cabecera del Panel */}
                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 p-6 rounded-3xl shadow-xl animate-[fadeIn_0.6s_ease-out_forwards]">
                    <div className="flex items-center space-x-4">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 text-white shadow-lg shadow-indigo-500/30">
                            🛡️
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                                Panel de Administración
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl shadow-lg animate-[fadeIn_0.8s_ease-out_0.2s_both]">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Deuda Total Activa</p>
                        <h3 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-indigo-400">
                            ${totalDebtSum.toLocaleString()}
                        </h3>
                    </div>
                    <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 p-6 rounded-3xl shadow-lg animate-[fadeIn_0.8s_ease-out_0.3s_both]">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Clientes Registrados</p>
                        <h3 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-cyan-400">
                            {activeClientsCount}
                        </h3>
                    </div>
                </div>

                {/* Tabla de Clientes / Préstamos con Proyecciones e Intereses */}
                <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden animate-[fadeIn_1s_ease-out_0.4s_both]">
                    <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">Listado de Clientes y Préstamos</h2>
                        <span className="text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
                            {loans.length} registros
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
                    ) : loans.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 text-sm">
                            No hay préstamos registrados todavía. ¡Crea el primero arriba!
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
                                        {loans.map((loan) => {
                                            const totalDebt = Number(loan.totalDebt) || 0;
                                            const interestRate = Number(loan.interestRate) || 0;
                                            const totalWithInterest = totalDebt * (1 + interestRate / 100);
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
                                                        <div className="font-bold text-indigo-400">${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                        {paidSoFar > 0 && (
                                                            <span className="text-[11px] text-emerald-400 font-medium block">
                                                                Abonado: ${paidSoFar.toLocaleString()}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <div className="text-slate-200 font-semibold">${totalWithInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                        <span className="text-[11px] text-indigo-300/80">
                                                            Base: ${totalDebt.toLocaleString()} ({interestRate}% int.)
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-slate-300">
                                                        <div className="font-medium">{loan.frequency}</div>
                                                        <span className="text-[11px] text-slate-400">Cuota: ${Number(loan.installmentAmount || 0).toLocaleString()}</span>
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
                                                                    title="Dar por terminado"
                                                                    className="px-2.5 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                                                >
                                                                    ✓ Terminar
                                                                </button>
                                                            </>
                                                        )}
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
                                {loans.map((loan) => {
                                    const totalDebt = Number(loan.totalDebt) || 0;
                                    const interestRate = Number(loan.interestRate) || 0;
                                    const totalWithInterest = totalDebt * (1 + interestRate / 100);
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
                                                    <p className="mt-1 text-xs text-slate-400">{loan.frequency} · Cuota: ${Number(loan.installmentAmount || 0).toLocaleString()}</p>
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
                                                    <span className="mt-1 block font-bold text-indigo-400">${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    {paidSoFar > 0 && <span className="mt-0.5 block text-[11px] text-emerald-400">Abonado: ${paidSoFar.toLocaleString()}</span>}
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total con interés</span>
                                                    <span className="mt-1 block font-semibold text-slate-200">${totalWithInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    <span className="mt-0.5 block text-[11px] text-indigo-300/80">Base: ${totalDebt.toLocaleString()} ({interestRate}%)</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-3">
                                                {loan.status !== 'Pagado' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleOpenPaymentModal(loan)}
                                                            className="min-h-11 rounded-xl border border-indigo-500/30 bg-indigo-600/20 px-3 py-2 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/30"
                                                        >
                                                            💵 Abonar
                                                        </button>
                                                        <button
                                                            onClick={() => sendWhatsAppReminder(loan)}
                                                            className="min-h-11 rounded-xl border border-emerald-500/30 bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-600/30"
                                                        >
                                                            💬 WhatsApp
                                                        </button>
                                                        <button
                                                            onClick={() => handleCompleteLoan(loan)}
                                                            className="min-h-11 rounded-xl border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-400 transition-colors hover:bg-teal-500/20"
                                                        >
                                                            ✓ Terminar
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => handleOpenEditModal(loan)}
                                                    className="min-h-11 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-400 transition-colors hover:bg-indigo-500/20"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={() => handleOpenDeleteModal(loan)}
                                                    className="min-h-11 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/20"
                                                >
                                                    Eliminar
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

            </div>

            {/* Modal para Crear / Editar Préstamo */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-72 h-72 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative w-full max-w-xl bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl">

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
                                <input
                                    type="text"
                                    required
                                    value={formData.duenyoDinero}
                                    onChange={(e) => setFormData({ ...formData, duenyoDinero: e.target.value })}
                                    className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Deuda Total ($)
                                    </label>
                                    <input
                                        type="number"
                                        required
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
                                        value={formData.interestRate}
                                        onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                                        placeholder="Ej. 10"
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Monto de Cuota ($)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.installmentAmount}
                                        onChange={(e) => setFormData({ ...formData, installmentAmount: e.target.value })}
                                        placeholder="0.00"
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 mb-1.5">
                                        Frecuencia de Pago
                                    </label>
                                    <select
                                        value={formData.frequency}
                                        onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                                        className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 cursor-pointer"
                                    >
                                        <option value="Diario" className="bg-slate-900 text-white">Diario</option>
                                        <option value="Semanal" className="bg-slate-900 text-white">Semanal</option>
                                        <option value="Quincenal" className="bg-slate-900 text-white">Quincenal</option>
                                        <option value="Mensual" className="bg-slate-900 text-white">Mensual</option>
                                    </select>
                                </div>
                            </div>

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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-80 h-80 bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>

                    <div className="relative w-full max-w-md bg-slate-900/95 border border-emerald-500/30 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl animate-[fadeIn_0.35s_cubic-bezier(0.16,1,0.3,1)]">

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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-72 h-72 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl">

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
                                <span className="text-2xl font-extrabold text-indigo-400">${Number(selectedLoanForPayment.remainingDebt).toLocaleString()}</span>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-72 h-72 bg-rose-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl">

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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 animate-[fadeIn_0.25s_ease-out]">
                    <div className="absolute w-72 h-72 bg-teal-600/10 rounded-full blur-[100px] pointer-events-none"></div>

                    <div className="relative w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-6 sm:p-8 space-y-6 backdrop-blur-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-teal-500/20">
                                    ✓
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">Terminar préstamo</h3>
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