(function () {
  'use strict';
  const key = 'mercadoNavegacion';
  const original = window.mostrarPantalla;
  if (typeof original !== 'function' || window.__mercadoAtras) return;
  window.__mercadoAtras = true;
  let ultimoAviso = 0;
  let timer;
  const activa = () => document.querySelector('.pantalla.activa')?.id || 'inicio';
  const estado = (pantalla, profundidad, base = false) => ({ [key]: true, pantalla, profundidad, base });
  const guardar = (valor, reemplazar) => history[reemplazar ? 'replaceState' : 'pushState'](valor, '', location.href);
  function limpiarAviso() {
    ultimoAviso = 0;
    clearTimeout(timer);
    document.getElementById('avisoSalirMercado')?.remove();
  }
  function avisar() {
    limpiarAviso();
    ultimoAviso = Date.now();
    const aviso = document.createElement('div');
    aviso.id = 'avisoSalirMercado';
    aviso.setAttribute('role', 'status');
    aviso.textContent = 'Pulsa otra vez Atrás para salir';
    aviso.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);max-width:90%;width:max-content;background:#123b2a;color:white;padding:14px 20px;border-radius:12px;z-index:10000;text-align:center;font-size:16px;box-shadow:0 3px 12px #0004';
    document.body.appendChild(aviso);
    timer = setTimeout(limpiarAviso, 2000);
  }
  // Una entrada base protege Inicio; la segunda representa la pantalla visible.
  if (!history.state?.[key]) {
    guardar(estado('inicio', 0, true), true);
    guardar(estado(activa(), 0), false);
  } else if (history.state.base) {
    guardar(estado('inicio', 0), false);
  } else {
    original(history.state.pantalla);
  }
  window.mostrarPantalla = function (id) {
    if (!document.getElementById(id)?.classList.contains('pantalla')) return;
    const anterior = activa();
    const resultado = original.apply(this, arguments);
    limpiarAviso();
    if (id === anterior) return resultado;
    const profundidad = history.state?.profundidad || 0;
    if (id === 'inicio' && profundidad > 0) history.go(-profundidad);
    else guardar(estado(id, profundidad + 1), false);
    return resultado;
  };
  window.addEventListener('popstate', function (evento) {
    const destino = evento.state;
    if (!destino?.[key]) return;
    if (!destino.base) {
      limpiarAviso();
      original(destino.pantalla);
      return;
    }
    if (activa() !== 'inicio') {
      limpiarAviso();
      original('inicio');
      guardar(estado('inicio', 0), false);
    } else if (ultimoAviso && Date.now() - ultimoAviso < 2000) {
      limpiarAviso();
      // Dejar que el navegador gestione la salida; no intentar cerrar la ventana.
      history.back();
    } else {
      guardar(estado('inicio', 0), false);
      avisar();
    }
  });
})();
