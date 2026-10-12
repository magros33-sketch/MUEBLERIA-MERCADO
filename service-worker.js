const VERSION = "muebleria-mercado-pwa-v1";
self.addEventListener("install", function(event) { self.skipWaiting(); });
self.addEventListener("activate", function(event) { event.waitUntil(self.clients.claim()); });
// No interceptamos ni almacenamos datos: ventas e inventario siguen consultándose en Supabase.
