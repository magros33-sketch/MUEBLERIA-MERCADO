(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const autorizado = () => el('adminPanel')?.style.display === 'block';
  const cancelado = estado => ['cancelado','cancelada'].includes(String(estado || '').trim().toLowerCase());
  const dinero = n => '$' + n.toLocaleString('es-MX', {maximumFractionDigits:0}) + ' MXN';
  let secuencia = 0;

  function rango(mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Selecciona un mes válido.');
    const [anio, numero] = mes.split('-').map(Number);
    const siguiente = numero === 12 ? (anio + 1) + '-01' : anio + '-' + String(numero + 1).padStart(2,'0');
    return [mes + '-01T00:00:00-06:00', siguiente + '-01T00:00:00-06:00'];
  }

  async function leer(tabla, columnas, limites, filtros = {}) {
    const filas = [];
    for (let offset = 0; ; ) {
      const p = new URLSearchParams({select:columnas,order:'id.asc',limit:'500',offset:String(offset),...filtros});
      if (limites) {p.append('fecha','gte.' + limites[0]);p.append('fecha','lt.' + limites[1]);}
      const r = await fetch(SUPABASE_URL + '/rest/v1/' + tabla + '?' + p, {headers:headersSupabase,cache:'no-store'});
      if (!r.ok) throw new Error('No se pudo consultar ' + tabla + '. Pulsa Actualizar totales para reintentar.');
      const pagina = await r.json();
      if (!Array.isArray(pagina)) throw new Error('Respuesta inválida al consultar ' + tabla + '.');
      filas.push(...pagina);
      if (!pagina.length) return filas;
      offset += pagina.length;
    }
  }

  const campos = ['totalEntradasMesAdmin','totalComprasMesAdmin','totalGastosMesAdmin'];
  const suma = (filas, campo) => filas.reduce((s,x) => {
    const n = Number(x[campo] || 0);
    if (!Number.isFinite(n)) throw new Error('Hay un importe inválido. Revisa los registros del mes.');
    return s + n;
  },0);


  const fechaMexico = new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Mexico_City', year:'numeric', month:'2-digit', day:'2-digit'
  });
  const nombreDia = new Intl.DateTimeFormat('es-MX', {
    timeZone:'UTC', weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
  const nuevoBalance = () => ({ventas:0, costo:0, conCosto:0, pendiente:0, gastos:0});
  const aCentavos = valor => Math.round(Number(valor || 0) * 100);
  const formatoImporte = importe => dinero(importe / 100);

  async function calcularGanancias(mes, ventas, gastos) {
    const ventasActivas = ventas.filter(venta => !cancelado(venta.estado));
    const detalles = [];
    for (let i = 0; i < ventasActivas.length; i += 60) {
      const ids = ventasActivas.slice(i,i + 60).map(venta => venta.id);
      detalles.push(...await leer('ventas_detalle','id,venta_id,articulo_id,cantidad,subtotal',null,
        {venta_id:'in.(' + ids.join(',') + ')'}));
    }
    const articulos = detalles.length ? await leer('articulos','id,costo') : [];
    const costos = new Map(articulos.map(articulo => [articulo.id, Number(articulo.costo)]));
    const porVenta = new Map();
    for (const detalle of detalles) {
      if (!porVenta.has(detalle.venta_id)) porVenta.set(detalle.venta_id, []);
      porVenta.get(detalle.venta_id).push(detalle);
    }

    const dias = new Map();
    const [anio, numero] = mes.split('-').map(Number);
    const cantidadDias = new Date(Date.UTC(anio,numero,0)).getUTCDate();
    for (let dia = 1; dia <= cantidadDias; dia++) {
      dias.set(mes + '-' + String(dia).padStart(2,'0'), nuevoBalance());
    }
    for (const venta of ventasActivas) {
      const balance = dias.get(fechaMexico.format(new Date(venta.fecha)));
      const importe = aCentavos(venta.total) - aCentavos(venta.flete);
      const lineas = porVenta.get(venta.id) || [];
      const subtotal = lineas.reduce((total,linea) => total + aCentavos(linea.subtotal), 0);
      // Reparte un descuento global entre las líneas usando el total de mercancía.
      const proporcion = subtotal > importe && subtotal > 0 ? importe / subtotal : 1;
      let conCosto = 0;
      balance.ventas += importe;
      for (const linea of lineas) {
        const costo = costos.get(linea.articulo_id);
        if (!(costo > 0) || !(Number(linea.cantidad) > 0)) continue;
        balance.costo += aCentavos(costo * Number(linea.cantidad));
        conCosto += aCentavos(linea.subtotal) * proporcion;
      }
      const cubierto = Math.round(conCosto);
      balance.conCosto += cubierto;
      balance.pendiente += importe - cubierto;
    }
    for (const gasto of gastos) {
      dias.get(fechaMexico.format(new Date(gasto.fecha))).gastos += aCentavos(gasto.importe);
    }

    const acumulado = nuevoBalance();
    for (const balance of dias.values()) {
      for (const campo of Object.keys(acumulado)) acumulado[campo] += balance[campo];
    }
    const margen = acumulado.conCosto > 0 ? (acumulado.conCosto - acumulado.costo) / acumulado.conCosto : null;
    function resultado(balance) {
      if (balance.pendiente && margen === null) return null;
      return balance.conCosto - balance.costo - balance.gastos
        + (balance.pendiente ? Math.round(balance.pendiente * margen) : 0);
    }
    // El acumulado suma los mismos importes diarios que se muestran en el calendario.
    const resultados = [...dias.values()].map(resultado);
    const totalMes = resultados.includes(null) ? null : resultados.reduce((total, valor) => total + valor, 0);
    return {dias, acumulado, totalMes, resultado, margen};
  }

  function mostrarGanancias(mes, datos) {
    const panel = el('gananciasAdmin');
    const hoy = fechaMexico.format(new Date());
    const espacioInicial = (new Date(mes + '-01T00:00:00Z').getUTCDay() + 6) % 7;
    const tituloResultado = balance => balance.pendiente ? 'Resultado estimado' : 'Resultado';
    const nombreMes = new Intl.DateTimeFormat('es-MX',{timeZone:'UTC',month:'long',year:'numeric'})
      .format(new Date(mes + '-01T00:00:00Z'));
    const mostrarResultado = valor => valor === null ? 'Pendiente de costos' : formatoImporte(valor);
    panel.innerHTML = `
      <div class="info-articulo">
        <strong>${tituloResultado(datos.acumulado)} · ${nombreMes}</strong>
        <div class="precio-venta">${mostrarResultado(datos.totalMes)}</div>
        <div class="ayuda">Ventas sin flete menos costo de mercancía y gastos registrados. Los cobros de apartados se muestran en Totales del mes.</div>
        ${datos.acumulado.pendiente ? '<div class="ayuda">Ventas sin costo completo: ' + formatoImporte(datos.acumulado.pendiente)
          + (datos.margen === null ? '. Faltan costos para calcular el resultado.' : '. La estimación usa el margen de las ventas con costo de este mes.') + '</div>' : ''}
      </div>
      <div id="diasGananciasAdmin" role="group" aria-label="Días del mes" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center">
        ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(dia => '<strong>' + dia + '</strong>').join('')}
        ${'<span aria-hidden="true"></span>'.repeat(espacioInicial)}
      </div>
      <div id="detalleGananciasAdmin" class="info-articulo" aria-live="polite"></div>`;
    const calendario = el('diasGananciasAdmin');
    const detalle = el('detalleGananciasAdmin');

    function seleccionar(fecha, boton) {
      const anterior = calendario.querySelector('[aria-pressed="true"]');
      anterior?.setAttribute('aria-pressed','false');
      anterior?.classList.add('secundario');
      boton.setAttribute('aria-pressed','true');
      boton.classList.remove('secundario');
      const balance = datos.dias.get(fecha);
      const resultado = datos.resultado(balance);
      detalle.innerHTML = `
        <strong>${nombreDia.format(new Date(fecha + 'T00:00:00Z'))}</strong>
        <div>Ventas sin flete · ${formatoImporte(balance.ventas)}</div>
        <div>Costo registrado · ${formatoImporte(balance.costo)}</div>
        <div>Gastos · ${formatoImporte(balance.gastos)}</div>
        ${balance.pendiente ? '<div>Ventas sin costo completo · ' + formatoImporte(balance.pendiente) + '</div>' : ''}
        ${balance.pendiente && datos.margen !== null ? '<div>Costo estimado de esas ventas · '
          + formatoImporte(balance.pendiente - Math.round(balance.pendiente * datos.margen)) + '</div>' : ''}
        <div><strong>${tituloResultado(balance)} del día · ${mostrarResultado(resultado)}</strong></div>`;
    }

    for (const [fecha, balance] of datos.dias) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'secundario';
      boton.style.cssText = 'margin:0;padding:0;min-height:44px;width:100%';
      boton.textContent = String(Number(fecha.slice(-2)));
      boton.setAttribute('aria-label',nombreDia.format(new Date(fecha + 'T00:00:00Z')));
      boton.setAttribute('aria-pressed','false');
      if (balance.ventas || balance.gastos) boton.style.fontWeight = 'bold';
      boton.addEventListener('click', () => seleccionar(fecha,boton));
      calendario.appendChild(boton);
      if (fecha === (hoy.startsWith(mes) ? hoy : mes + '-01')) seleccionar(fecha,boton);
    }
  }

  window.cargarTotalesMensualesAdmin = async function () {
    if (!autorizado()) return;
    const turno = ++secuencia;
    const mensaje = el('mensajeTotalesMensualesAdmin');
    campos.forEach(id => {el(id).textContent = 'Calculando…';});
    mensaje.textContent = '';
    const ganancias = el('gananciasAdmin');
    ganancias.textContent = 'Calculando…';
    el('detalleEntradasMesAdmin').textContent = '';
    try {
      const mes = el('mesTotalesAdmin').value;
      const limites = rango(mes);
      const [ventas, compras, gastos, pagos, apartados] = await Promise.all([
        leer('ventas','id,total,estado,fecha,flete',limites),
        leer('compras','id,total,estado',limites),
        leer('gastos','id,importe,fecha',limites),
        leer('apartado_pagos','id,apartado_id,importe',limites),
        leer('apartados','id,estado')
      ]);
      if (turno !== secuencia || !autorizado()) return;
      const anulados = new Set(apartados.filter(a => cancelado(a.estado)).map(a => String(a.id)));
      const totalVentas = suma(ventas.filter(v => !cancelado(v.estado)), 'total');
      const totalApartados = suma(pagos.filter(p => !anulados.has(String(p.apartado_id))), 'importe');
      const totales = [totalVentas + totalApartados, suma(compras.filter(c => !cancelado(c.estado)), 'total'), suma(gastos, 'importe')];
      campos.forEach((id,i) => {el(id).textContent = dinero(totales[i]);});
      el('detalleEntradasMesAdmin').textContent = 'Ventas: ' + dinero(totalVentas) + ' · Anticipos y abonos de apartados: ' + dinero(totalApartados);
      mensaje.textContent = 'Totales actualizados para ' + mes + '.';
      try {
        const datos = await calcularGanancias(mes,ventas,gastos);
        if (turno === secuencia && autorizado()) mostrarGanancias(mes,datos);
      } catch {
        if (turno === secuencia && autorizado()) ganancias.textContent = 'No se pudieron cargar las ganancias. Pulsa Actualizar totales para reintentar.';
      }
    } catch (e) {
      if (turno !== secuencia || !autorizado()) return;
      campos.forEach(id => {el(id).textContent = 'No disponible';});
      ganancias.textContent = 'Ganancias no disponibles.';
      mensaje.textContent = e.message || 'No se pudieron cargar los totales.';
    }
  };

  function instalar() {
    const mes = el('mesTotalesAdmin');
    if (!mes) return;
    mes.value = fechaMexico.format(new Date()).slice(0,7);
    el('totalesMensualesAdmin').insertAdjacentHTML('afterend',
      '<section class="tarjeta" aria-labelledby="tituloGananciasAdmin"><h3 id="tituloGananciasAdmin">📈 Ganancias por día y del mes</h3>'
      + '<div class="ayuda">Elige el mes en Totales del mes y toca un día del calendario.</div>'
      + '<div id="gananciasAdmin"></div></section>');
    mes.addEventListener('change',window.cargarTotalesMensualesAdmin);
    el('actualizarTotalesMensualesAdmin').onclick = window.cargarTotalesMensualesAdmin;
    const entrar = window.entrarAdministracion;
    window.entrarAdministracion = async function () {
      const resultado = await entrar.apply(this,arguments);
      if (autorizado()) await window.cargarTotalesMensualesAdmin();
      return resultado;
    };
    const salir = window.salirAdministracion;
    window.salirAdministracion = function () {
      ++secuencia;
      campos.forEach(id => {el(id).textContent = 'Selecciona un mes';});
      el('detalleEntradasMesAdmin').textContent = '';
      el('mensajeTotalesMensualesAdmin').textContent = '';
      el('gananciasAdmin').textContent = '';
      return salir.apply(this,arguments);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',instalar);else instalar();
})();
