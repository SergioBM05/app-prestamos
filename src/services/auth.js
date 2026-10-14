import { auth } from './firebase';

// Devuelve un token vigente: Firebase renueva el ID token solo cuando caduca (1 h).
// El token guardado en localStorage solo se usa si todavía no hay sesión de Firebase.
export const getFreshToken = async (fallbackToken = null) => {
    try {
        await auth.authStateReady();
        if (auth.currentUser) return await auth.currentUser.getIdToken();
    } catch (err) {
        console.error('No se pudo renovar el token', err);
    }
    return fallbackToken;
};
