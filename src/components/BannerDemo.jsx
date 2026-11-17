import { MODO_DEMO, cambiarVistaDemo, reiniciarDemo, salirDeDemo } from '../services/demo';

// Franja superior que avisa de que se está en la demo (datos de ejemplo, solo en este navegador)
export default function BannerDemo() {
  return (
    <div className="fixed top-1 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-full bg-amber-400 text-black text-[11px] font-bold px-3 py-1 shadow-lg whitespace-nowrap">
      <span>MODO DEMO · datos de ejemplo</span>
      <button type="button" onClick={cambiarVistaDemo} className="underline">
        Ver como {MODO_DEMO === 'cliente' ? 'administrador' : 'cliente'}
      </button>
      <button type="button" onClick={reiniciarDemo} className="underline">Reiniciar</button>
      <button type="button" onClick={salirDeDemo} className="underline">Salir</button>
    </div>
  );
}
