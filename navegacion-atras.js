(function () {
  'use strict';
  const key = 'mercadoNavegacion';
  const original = window.mostrarPantalla;
  if (typeof original !== 'function' || window.__mercadoAtras) return;
  window.__mercadoAtras = true;
  let ultimoAviso = 0;
  let timer;
  let restaurandoCancelacion = false;
  const activa = () => document.querySelector('.pantalla.activa')?.id || 'inicio';
  const estado = (pantalla, profundidad, base = false) => ({ [key]: true, pantalla, profundidad, base });
  const guardar = (valor, reemplazar) => history[reemplazar ? 'replaceState' : 'pushState'](valor, '', location.href);

  const pendientes = new Set();
  const guardando = new Set();
  const formularios = {
    ventas: { funcion: 'registrarVenta', mensaje: 'mensajeVenta', lista: 'ventaItemsLista',
      campos: ['ventaTipoCliente','ventaCliente','ventaCodigo','ventaNombre','ventaCantidad','ventaPrecio','fechaVentaRegistro','ventaMetodoPago'] },
    compras: { funcion: 'registrarCompra', mensaje: 'mensajeCompra', lista: 'compraItemsListaFinal',
      campos: ['compraProveedor','compraProveedorId','compraCodigo','compraNombre','compraCantidad','compraCosto','compraFormaPago','compraPlazoDias','compraAnticipo'] },
    apartados: { funcion: 'registrarApartado', mensaje: 'mensajeApartado',
      campos: ['apartadoCliente','apartadoCodigo','apartadoNombre','apartadoCantidad','apartadoPrecio','apartadoFecha','apartadoAnticipo','apartadoFechaAnticipo','apartadoMetodoPago','apartadoNotas'] }
  };
  function tienePendientes(id) {
    const config = formularios[id];
    if (!config) return false;
    // También proteger los artículos recuperados de un borrador anterior.
    const lista = config.lista && document.getElementById(config.lista);
    return pendientes.has(id) || !!lista?.querySelector('button');
  }
  function permitirSalida(id) {
    if (guardando.has(id)) {
      window.alert('Se está guardando. Espera la confirmación antes de salir.');
      return false;
    }
    if (!tienePendientes(id)) return true;
    return window.confirm('Hay cambios sin guardar. ¿Quieres volver a Inicio o cambiar de sección?\n\nAceptar: continuar sin guardar.\nCancelar: quedarte para terminar.\n\nEl formulario se conserva mientras la app siga abierta.');
  }
  function marcarCambio(evento) {
    for (const [id, config] of Object.entries(formularios)) {
      if (config.campos.includes(evento.target?.id)) pendientes.add(id);
    }
  }
  document.addEventListener('input', marcarCambio);
  document.addEventListener('change', marcarCambio);
  document.addEventListener('click', function (evento) {
    const boton = evento.target?.closest('button');
    if (!boton) return;
    const id = boton.closest('.pantalla')?.id;
    const config = formularios[id];
    if (!config) return;
    const registro = document.querySelector('#' + id + ' button[onclick="' + config.funcion + '()"]');
    const formulario = registro?.closest('.tarjeta');
    // Añadir/quitar líneas también cambia el formulario aunque no genere input.
    if (formulario?.contains(boton) && boton !== registro) pendientes.add(id);
  });
  for (const [id, config] of Object.entries(formularios)) {
    const registrar = window[config.funcion];
    if (typeof registrar !== 'function') continue;
    window[config.funcion] = async function () {
      if (guardando.has(id)) return;
      guardando.add(id);
      try {
        const resultado = await registrar.apply(this, arguments);
        const mensaje = document.getElementById(config.mensaje);
        if (mensaje?.querySelector('.mensaje-exito') &&
            /(?:venta registrada|compra registrada|apartado creado|apartado registrado)/i.test(mensaje.textContent)) {
          pendientes.delete(id);
        }
        return resultado;
      } finally { guardando.delete(id); }
    };
  }

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
    if (id !== anterior && !permitirSalida(anterior)) return;
    const resultado = original.apply(this, arguments);
    limpiarAviso();
    if (id === anterior) return resultado;
    guardar(estado(id, 0), true);
    return resultado;
  };
  window.addEventListener('popstate', function (evento) {
    const destino = evento.state;
    if (!destino?.[key]) return;
    if (!destino.base) {
      if (restaurandoCancelacion) {
        restaurandoCancelacion = false;
        return;
      }
      limpiarAviso();
      original(destino.pantalla);
      return;
    }
    if (activa() !== 'inicio') {
      const anterior = activa();
      if (!permitirSalida(anterior)) {
        limpiarAviso();
        restaurandoCancelacion = true;
        history.forward();
        return;
      }
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
