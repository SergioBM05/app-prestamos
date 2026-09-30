import React, { useState, useEffect } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { API_URL } from '../services/api';

export default function ClientDashboard({ user: initialUser, token, onLogout }) {
    const [user, setUser] = useState(initialUser);
    const [myLoan, setMyLoan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
        fetchMyLoanData();
    }, []);

    const fetchMyLoanData = async () => {
        try {
            setLoading(true);
            const currentToken = await getValidToken();
            if (!currentToken) throw new Error('No hay sesión activa');

            const response = await fetch(`${API_URL}/api/loans/my-loan`, {
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error al cargar tu información financiera');

            setMyLoan(data);
        } catch (err) {
            console.error(err);
            setError('No se pudo cargar la información de tu préstamo.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogoutClick = async () => {
        try {
            const auth = getAuth();
            await signOut(auth);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (onLogout) onLogout();
            location.reload();
        } catch (err) {
            console.error('Error al cerrar sesión:', err);
        }
    };

    const clientDisplayName = myLoan?.clientName || user?.displayName || user?.username || user?.name || 'Cliente';

    // Cálculos financieros para proyección y barra de progreso
    const totalDebt = Number(myLoan?.totalDebt) || 0;
    const remainingDebt = Number(myLoan?.remainingDebt) || 0;
    const interestRate = Number(myLoan?.interestRate) || 0;
    
    // Cálculo con interés: Capital Total * (1 + Interés / 100)
    const totalWithInterest = totalDebt * (1 + interestRate / 100);
    
    // Progreso pagado en porcentaje
    const paidAmount = Math.max(0, totalDebt - remainingDebt);
    const progressPercentage = totalDebt > 0 ? Math.min(100, Math.round((paidAmount / totalDebt) * 100)) : 0;

    return (
        <div className="relative min-h-screen bg-slate-950 overflow-hidden font-sans text-slate-100 p-4 sm:p-8 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">

            {/* Efectos de luz ambiental */}
            <div className="absolute top-0 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none"></div>
            <div className="absolute bottom-0 -right-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-[140px] pointer-events-none"></div>

            <div className="relative max-w-4xl mx-auto w-full space-y-8 my-auto">

                {/* Cabecera del Portal */}
                <header className="flex items-center justify-between bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 p-6 rounded-3xl shadow-xl">
                    <div className="flex items-center space-x-4">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 text-white shadow-lg shadow-indigo-500/30">
                            ⚡
                        </div>
                        <div>
                            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                                Portal Financiero
                            </h1>
                            <p className="text-xs text-slate-400">
                                Bienvenido, <span className="text-indigo-400 font-medium">{clientDisplayName}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogoutClick}
                        className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold rounded-2xl border border-slate-700/60 transition-all duration-300 cursor-pointer"
                    >
                        Salir
                    </button>
                </header>

                {/* Contenido Principal */}
                <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-8">
                    <div className="border-b border-slate-800/80 pb-4 flex items-center justify-between">
                        <h2 className="text-base sm:text-lg font-bold text-white">Estado de Cuenta Actual</h2>
                        {!loading && myLoan && (
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                myLoan.status === 'Pagado'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                                {myLoan.status || 'Activo'}
                            </span>
                        )}
                    </div>

                    {loading ? (
                        <div className="py-12 text-center text-slate-500 space-y-3">
                            <svg className="animate-spin h-8 text-indigo-500 mx-auto" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p className="text-sm">Sincronizando registros encriptados...</p>
                        </div>
                    ) : error ? (
                        <div className="py-12 text-center text-rose-400 text-sm">
                            {error}
                        </div>
                    ) : !myLoan ? (
                        <div className="py-12 text-center text-slate-500 text-sm">
                            No se encontró ningún préstamo activo asociado a tu cuenta.
                        </div>
                    ) : (
                        <div className="space-y-6">
                            
                            {/* Tarjeta Destacada de Deuda Pendiente */}
                            <div className="bg-slate-950/90 border border-indigo-500/30 p-6 sm:p-8 rounded-3xl text-center relative overflow-hidden shadow-inner">
                                <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
                                <p className="text-xs font-bold uppercase tracking-widest text-indigo-300/80 mb-2">Deuda Pendiente</p>
                                <h3 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-indigo-400 tracking-tight">
                                    ${remainingDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </h3>
                                
                                {/* Barra de Progreso de Pago */}
                                <div className="mt-6 space-y-2">
                                    <div className="flex justify-between text-xs text-slate-400 font-medium">
                                        <span>Progreso de liquidación</span>
                                        <span className="text-indigo-400">{progressPercentage}% completado</span>
                                    </div>
                                    <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                                        <div 
                                            className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-2.5 rounded-full transition-all duration-500" 
                                            style={{ width: `${progressPercentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            {/* Tarjeta de Proyección de Intereses a Largo Plazo */}
                            <div className="bg-slate-950/60 border border-slate-800/80 p-5 sm:p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300/80 block mb-1">
                                        Proyección Total (Capital + Interés)
                                    </span>
                                    <h4 className="text-2xl font-extrabold text-white">
                                        ${totalWithInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        Calculado con un <span className="text-indigo-400 font-semibold">{interestRate}%</span> de interés sobre un capital de ${totalDebt.toLocaleString()}.
                                    </p>
                                </div>
                                <div className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center">
                                    <span className="block text-[10px] uppercase font-bold text-slate-400">Frecuencia</span>
                                    <span className="text-sm font-bold text-indigo-300">{myLoan.frequency}</span>
                                </div>
                            </div>

                            {/* Rejilla de Detalles de Cuotas */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-slate-950/50 border border-slate-800/80 p-5 rounded-2xl flex items-center space-x-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                                        💵
                                    </div>
                                    <div>
                                        <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Monto de Cuota</span>
                                        <span className="text-lg font-bold text-white">${Number(myLoan.installmentAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <div className="bg-slate-950/50 border border-slate-800/80 p-5 rounded-2xl flex items-center space-x-4">
                                    <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                                        📊
                                    </div>
                                    <div>
                                        <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Capital Inicial</span>
                                        <span className="text-lg font-bold text-white">${totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>

            </div>

            <footer className="text-center text-xs text-slate-600 py-4">
                Plataforma Financiera Segura • Panel de Usuario encriptado
            </footer>
        </div>
    );
}