import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase'; 

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const internalEmail = `${username.trim().toLowerCase()}@tu-app.local`;
      const userCredential = await signInWithEmailAndPassword(auth, internalEmail, password);
      const token = await userCredential.user.getIdToken();

      const response = await fetch('http://localhost:4000/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al validar el usuario en el servidor');
      }
      
      if (onLoginSuccess) {
        onLoginSuccess({ user: data, token });
      }

    } catch (err) {
      console.error(err);
      setError('Usuario o contraseña incorrectos ❌');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 overflow-hidden font-sans p-4 selection:bg-indigo-500 selection:text-white">
      
      {/* Fondo cinemático avanzado: Orbes con animación fluida de traslación (Mesh Gradient effect) */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-600/25 rounded-full blur-[120px] animate-[pulse_6s_ease-in-out_infinite]"></div>
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px] animate-[pulse_8s_ease-in-out_infinite_1s]"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Tarjeta principal con animación de entrada (Fade In + Scale Up) */}
      <div className="relative w-full max-w-md bg-slate-900/75 backdrop-blur-2xl border border-slate-800/80 rounded-3xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.7)] p-8 sm:p-10 animate-[fadeIn_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards]">
        
        {/* Cabecera con animación en cascada */}
        <div className="text-center mb-8 animate-[slideDown_0.6s_ease-out_0.2s_both]">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-400 text-white shadow-xl shadow-indigo-500/30 mb-5 relative group">
            {/* Brillo interno animado en el icono */}
            <div className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <svg className="w-8 h-8 transform transition-transform duration-500 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Plataforma de Gestión Financiera
          </h2>
        </div>

        {/* Alerta de error con animación de sacudida (Shake) */}
        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-2xl text-center backdrop-blur-md animate-[shake_0.4s_ease-in-out]">
            {error}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-5 animate-[fadeIn_0.8s_ease-out_0.4s_both]">
          <div className="space-y-1.5 group">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 ml-1 transition-colors group-focus-within:text-indigo-400">
              Usuario
            </label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="Ej. serburmej"
              required 
              className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/80 rounded-2xl text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 shadow-inner"
            />
          </div>

          <div className="space-y-1.5 group">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 ml-1 transition-colors group-focus-within:text-indigo-400">
              Contraseña
            </label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••"
              required 
              className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-800/80 rounded-2xl text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 transition-all duration-300 shadow-inner"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full mt-3 py-4 px-4 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white font-semibold rounded-2xl shadow-[0_10px_25px_-5px_rgba(79,70,229,0.4)] hover:shadow-[0_15px_30px_-5px_rgba(79,70,229,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2 cursor-pointer relative overflow-hidden group"
          >
            {/* Efecto de brillo deslizante en el botón al pasar el cursor */}
            <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000"></div>

            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Autenticando...</span>
              </>
            ) : (
              <span className="tracking-wide">Acceder al Panel</span>
            )}
          </button>
        </form>

        {/* Pie de tarjeta con animación sutil */}
        <div className="mt-8 text-center text-xs text-slate-500 border-t border-slate-800/60 pt-4 animate-[fadeIn_1s_ease-out_0.6s_both]">
          Protegido con encriptación de extremo a extremo 🛡️
        </div>

      </div>

      {/* Definición de Keyframes personalizados para animaciones fluidas de nivel Pro */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}