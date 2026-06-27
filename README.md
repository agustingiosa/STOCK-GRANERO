# STOCK GRANERO — Control de Stock para Restaurante

Sistema web de control de inventario para restaurante. Permite registrar el stock diario de productos, detectar faltantes y enviar pedidos por WhatsApp.

## Tecnologías

- **Frontend:** HTML + CSS + JavaScript vanilla
- **Backend:** Node.js + Express
- **Base de datos:** Firebase Firestore (nube)
- **Hosting:** Railway (servidor) + GitHub (código fuente)
- **Backups:** SQLite generado desde Firestore bajo demanda

---

## Funcionalidades

### 📋 Carga del Día
Pantalla principal para registrar el stock actual de cada producto.

- Los productos están agrupados por **sector** (freezer, heladera, etc.)
- Cada sección es **desplegable/colapsable**
- Buscador para filtrar productos rápidamente
- Al guardar, se actualizan los valores en Firestore y se crea un backup automático

### 🛒 Pedidos
Muestra automáticamente los productos que tienen **stock por debajo del mínimo**, organizados por sector.

- Solo aparecen productos que ya tienen una carga registrada
- Sirve como guía para saber qué hay que pedir

### 📦 Productos
ABM completo de productos.

- Agregar, editar y eliminar productos
- Cada producto tiene: nombre, sector, unidad de medida, stock mínimo y precio (opcional)
- **Carga masiva:** importar múltiples productos a la vez con nombre, sector, unidad, stock mínimo y stock actual

### ⚙️ Sectores
Gestión de sectores personalizados.

- Agregar y eliminar sectores
- Al eliminar un sector se eliminan también sus productos e historial
- Los sectores aparecen en todos los selectores de la app

### 📊 Historial
Registro de todas las cargas de stock.

- Filtros por fecha (desde / hasta) y por producto
- Ver la evolución del stock en el tiempo
- Opción para limpiar todo el historial

### 🔧 Configuración

#### Backups
- **Crear backup:** genera y descarga un archivo `.db` (SQLite) con todos los datos de Firestore
- Sirve como copia de seguridad local

#### Notificaciones WhatsApp
- Configurar **día de la semana** y **horario** para envío automático de pedidos
- Agregar múltiples **destinatarios** con su número y API Key de CallMeBot
- **Enviar prueba:** manda el pedido actual a todos los destinatarios configurados
- El scheduler corre en el servidor Railway cada minuto

---

## Arquitectura

```
GitHub (código)
    ↓ auto-deploy
Railway (servidor Node.js/Express)
    ↓ lee/escribe
Firebase Firestore (base de datos)
    ↓ bajo demanda
SQLite .db (backup descargable)
```

---

## Setup local

### 1. Clonar el repositorio

```bash
git clone https://github.com/agustingiosa/STOCK-GRANERO.git
cd STOCK-GRANERO
npm install
```

### 2. Credenciales de Firebase

Descargar la clave de servicio desde Firebase Console:
- Ir a [console.firebase.google.com](https://console.firebase.google.com) → proyecto **granero-stock**
- ⚙️ Configuración del proyecto → **Cuentas de servicio** → **Generar nueva clave privada**
- Guardar el archivo como `serviceAccountKey.json` en la raíz del proyecto

> `serviceAccountKey.json` está en `.gitignore` — nunca se sube al repositorio.

### 3. Iniciar el servidor

```bash
npm start
```

Abrir en el navegador: `http://localhost:3000`

---

## Deploy en Railway

### Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `FIREBASE_CREDENTIALS` | Contenido del `serviceAccountKey.json` en base64 |
| `PORT` | Puerto (Railway lo setea automáticamente) |

### Generar FIREBASE_CREDENTIALS

```bash
base64 -i serviceAccountKey.json | tr -d '\n'
```

Pegar el resultado como valor de la variable `FIREBASE_CREDENTIALS` en Railway → Variables.

### Deploy automático

Cada push a la rama `main` de GitHub dispara un redeploy automático en Railway.

---

## Migración de datos

Para migrar datos desde un archivo SQLite local a Firestore:

```bash
# Asegurarse de tener serviceAccountKey.json y el archivo .db en la raíz
node migrate-to-firestore.js
```

---

## Notificaciones WhatsApp (CallMeBot)

El sistema usa [CallMeBot](https://www.callmebot.com/blog/free-api-whatsapp-messages/) para enviar mensajes gratuitos.

### Activar API Key
1. Guardar el número `+34 644 597 102` en contactos como "CallMeBot"
2. Enviar por WhatsApp: `I allow callmebot to send me messages`
3. Recibirás tu API Key por WhatsApp

Repetir el proceso para cada destinatario.

### Formato del mensaje enviado
```
🛒 PEDIDO DE STOCK - 27/06/2026
Productos por debajo del stock mínimo

🧊 Freezer de Plancha
• Milanesas: tiene 2.00 kg — pedir 3.00 kg

📦 Almacén
• Aceite: tiene 1.00 lt — pedir 4.00 lt
```

---

## Estructura del proyecto

```
STOCK-GRANERO/
├── server.js                 # Servidor Express + Firestore
├── package.json
├── migrate-to-firestore.js   # Script de migración SQLite → Firestore
├── index.html                # Frontend (desarrollo local)
├── styles.css
├── js/
│   ├── app.js                # Inicialización y event listeners
│   ├── database.js           # Funciones de API
│   ├── products.js           # Lógica de productos y pedidos
│   ├── history.js            # Carga del día e historial
│   ├── sectors.js            # Sectores
│   ├── notifications.js      # Notificaciones y backups
│   └── utils.js              # Utilidades generales
├── public/                   # Copia del frontend (para Firebase Hosting)
├── functions/                # Firebase Functions (requiere plan Blaze)
├── firebase.json
├── firestore.rules
└── backups/                  # Backups SQLite generados localmente
```
