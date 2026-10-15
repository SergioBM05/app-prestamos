// Enlace de la app que se envía al cliente. Define VITE_APP_URL en .env con la dirección pública
// (ej. https://mi-app.vercel.app); si no, se usa la dirección desde la que está abierto el panel.
export const APP_URL = String(import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');

// Prefijo que se añade a números nacionales de 9 cifras (34 = España)
const DEFAULT_COUNTRY_CODE = String(import.meta.env.VITE_DEFAULT_COUNTRY_CODE || '34');

// Número en el formato que pide WhatsApp (solo dígitos, con prefijo de país) o '' si no es válido
export const toWhatsAppNumber = (phone) => {
    const cleaned = String(phone || '').replace(/[^\d+]/g, '');
    let digits;
    if (cleaned.startsWith('+')) digits = cleaned.slice(1);
    else if (cleaned.startsWith('00')) digits = cleaned.slice(2);
    else if (cleaned.length === 9) digits = DEFAULT_COUNTRY_CODE + cleaned;
    else digits = cleaned;
    return digits.length >= 8 && digits.length <= 15 ? digits : '';
};

// Abre WhatsApp con el mensaje; si el cliente tiene teléfono, el chat se abre directamente con él
export const openWhatsApp = (phone, text) => {
    const number = toWhatsAppNumber(phone);
    const base = number ? `https://wa.me/${number}` : 'https://api.whatsapp.com/send';
    window.open(`${base}?text=${encodeURIComponent(text)}`, '_blank');
};
