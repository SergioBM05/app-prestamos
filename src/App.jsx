import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './services/firebase';
import Login from './components/login';
import AdminDashboard from './components/adminDashboard';
import ClientDashboard from './components/clientDashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. Recuperar la sesión del localStorage si el usuario recarga la página
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Error al parsear el usuario del localStorage', e);
        localStorage.clear();
      }
    }
    setLoading(false);
  }, []);

  // 2. Función que se ejecuta cuando el login es exitoso (aquí usamos localStorage.setItem)
  const handleLoginSuccess = ({ user, token }) => {
    setUser(user);
    setToken(token);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  };

  // 3. Función para cerrar sesión (aquí usamos localStorage.removeItem)
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', color: '#fff', background: '#020617', minHeight: '100vh', paddingTop: '40vh' }}>
        Cargando aplicación... 🔄
      </div>
    );
  }

  // Si no hay usuario o token logueado, mostramos el componente de Login
  if (!user || !token) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Si el usuario es ADMINISTRADOR
  if (user.role === 'admin') {
    return (
      <AdminDashboard 
        user={user} 
        token={token} 
        onLogout={handleLogout} 
      />
    );
  }

  // Si tiene otro rol o no coincide
  return (
    <ClientDashboard 
        user={user} 
        token={token} 
        onLogout={handleLogout} 
      />
  );
}