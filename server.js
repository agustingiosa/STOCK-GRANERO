// ============================================
// server.js - Servidor Express + Firestore
// ============================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Database = require('better-sqlite3');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Firebase Admin — soporta key local y env var Railway
// ============================================

let serviceAccount;
if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIALS, 'base64').toString());
} else if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) {
    serviceAccount = require('./serviceAccountKey.json');
} else {
    console.error('❌ No se encontró credencial de Firebase. Necesitás serviceAccountKey.json o la env var FIREBASE_CREDENTIALS');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ============================================
// Cliente WhatsApp (whatsapp-web.js)
// ============================================

let waStatus = 'disconnected'; // 'disconnected' | 'qr' | 'connecting' | 'ready'
let waQR = null;

const waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

waClient.on('qr', async (qr) => {
    waStatus = 'qr';
    waQR = await QRCode.toDataURL(qr);
    console.log('📱 WhatsApp: escaneá el QR en la app para conectar');
});

waClient.on('authenticated', () => {
    waStatus = 'connecting';
    waQR = null;
    console.log('🔐 WhatsApp: autenticado, iniciando sesión...');
});

waClient.on('ready', () => {
    waStatus = 'ready';
    waQR = null;
    console.log('✅ WhatsApp conectado y listo');
});

waClient.on('disconnected', (reason) => {
    waStatus = 'disconnected';
    waQR = null;
    console.log('⚠️ WhatsApp desconectado:', reason);
    setTimeout(() => waClient.initialize(), 5000);
});

waClient.initialize().catch(e => console.error('Error iniciando WhatsApp:', e.message));

// ============================================
// Middleware
// ============================================

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ============================================
// Helpers
// ============================================

async function batchDelete(refs) {
    const SIZE = 400;
    for (let i = 0; i < refs.length; i += SIZE) {
        const batch = db.batch();
        refs.slice(i, i + SIZE).forEach(ref => batch.delete(ref));
        await batch.commit();
    }
}

// ============================================
// API - Productos
// ============================================

app.get('/api/products', async (req, res) => {
    try {
        const snap = await db.collection('products').orderBy('name').get();
        res.json(snap.docs.map(d => d.data()));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const { id, name, sector, unit, min_stock, recommended_stock, price, created_at } = req.body;
        await db.collection('products').doc(id).set({
            id, name, sector, unit, min_stock,
            recommended_stock: recommended_stock ?? min_stock,
            price: price || null,
            created_at, updated_at: null, last_stock: null, last_stock_date: null
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, sector, unit, min_stock, recommended_stock, price, updated_at } = req.body;
        await db.collection('products').doc(req.params.id).update({
            name, sector, unit, min_stock,
            recommended_stock: recommended_stock ?? min_stock,
            price: price || null, updated_at
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const histSnap = await db.collection('history').where('product_id', '==', req.params.id).get();
        await batchDelete([...histSnap.docs.map(d => d.ref), db.collection('products').doc(req.params.id)]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// API - Sectores
// ============================================

app.get('/api/sectors', async (req, res) => {
    try {
        const snap = await db.collection('sectors').orderBy('name').get();
        res.json(snap.docs.map(d => d.data()));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sectors', async (req, res) => {
    try {
        const { id, name, type, created_at } = req.body;
        await db.collection('sectors').doc(id).set({ id, name, type, created_at });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sectors/:id', async (req, res) => {
    try {
        const sectorDoc = await db.collection('sectors').doc(req.params.id).get();
        if (!sectorDoc.exists) return res.status(404).json({ error: 'Sector no encontrado' });
        const { name } = sectorDoc.data();
        const [histSnap, prodSnap] = await Promise.all([
            db.collection('history').where('sector', '==', name).get(),
            db.collection('products').where('sector', '==', name).get()
        ]);
        await batchDelete([...histSnap.docs.map(d => d.ref), ...prodSnap.docs.map(d => d.ref), sectorDoc.ref]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// API - Historial
// ============================================

app.get('/api/history', async (req, res) => {
    try {
        const snap = await db.collection('history').orderBy('date', 'desc').get();
        const history = snap.docs.map(d => d.data()).sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return a.product_name.localeCompare(b.product_name);
        });
        res.json(history);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/history/daily', async (req, res) => {
    try {
        const { date, entries } = req.body;

        const existingSnap = await db.collection('history').where('date', '==', date).get();
        if (!existingSnap.empty) {
            const delBatch = db.batch();
            existingSnap.docs.forEach(doc => delBatch.delete(doc.ref));
            await delBatch.commit();
        }

        const SIZE = 200;
        for (let i = 0; i < entries.length; i += SIZE) {
            const batch = db.batch();
            for (const entry of entries.slice(i, i + SIZE)) {
                batch.set(db.collection('history').doc(entry.id), {
                    id: entry.id, product_id: entry.product_id, product_name: entry.product_name,
                    sector: entry.sector, unit: entry.unit, stock: entry.stock,
                    date, created_at: entry.created_at
                });
                batch.update(db.collection('products').doc(entry.product_id), {
                    last_stock: entry.stock, last_stock_date: date, updated_at: entry.created_at
                });
            }
            await batch.commit();
        }

        createBackup();
        res.json({ success: true, count: entries.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/history', async (req, res) => {
    try {
        const [histSnap, prodSnap] = await Promise.all([
            db.collection('history').get(),
            db.collection('products').get()
        ]);
        await batchDelete(histSnap.docs.map(d => d.ref));
        const SIZE = 400;
        for (let i = 0; i < prodSnap.docs.length; i += SIZE) {
            const batch = db.batch();
            prodSnap.docs.slice(i, i + SIZE).forEach(doc => batch.update(doc.ref, { last_stock: null, last_stock_date: null }));
            await batch.commit();
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// Backups — genera SQLite desde Firestore
// ============================================

const BACKUP_DIR = path.join(__dirname, 'backups');
const MAX_BACKUPS = 30;
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

async function writeFirestoreToSQLite(destPath) {
    const tmpDb = new Database(destPath);
    tmpDb.exec(`
        CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT, sector TEXT, unit TEXT,
            min_stock REAL, price REAL, created_at TEXT, updated_at TEXT, last_stock REAL, last_stock_date TEXT);
        CREATE TABLE IF NOT EXISTS custom_sectors (id TEXT PRIMARY KEY, name TEXT, type TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS stock_history (id TEXT PRIMARY KEY, product_id TEXT, product_name TEXT,
            sector TEXT, unit TEXT, stock REAL, date TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS notification_config (id INTEGER PRIMARY KEY, day_of_week TEXT,
            send_time TEXT, enabled INTEGER, last_sent TEXT);
        CREATE TABLE IF NOT EXISTS notification_recipients (id TEXT PRIMARY KEY, name TEXT, phone TEXT, apikey TEXT);
    `);

    const [prodSnap, secSnap, histSnap, configDoc, recSnap] = await Promise.all([
        db.collection('products').get(),
        db.collection('sectors').get(),
        db.collection('history').get(),
        db.collection('notifications').doc('config').get(),
        db.collection('recipients').get()
    ]);

    const insProduct  = tmpDb.prepare('INSERT OR REPLACE INTO products VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insSector   = tmpDb.prepare('INSERT OR REPLACE INTO custom_sectors VALUES (?,?,?,?)');
    const insHistory  = tmpDb.prepare('INSERT OR REPLACE INTO stock_history VALUES (?,?,?,?,?,?,?,?)');
    const insRecip    = tmpDb.prepare('INSERT OR REPLACE INTO notification_recipients VALUES (?,?,?,?)');

    tmpDb.transaction(() => {
        prodSnap.docs.forEach(d => {
            const p = d.data();
            insProduct.run(p.id, p.name, p.sector, p.unit, p.min_stock, p.price ?? null,
                p.created_at, p.updated_at ?? null, p.last_stock ?? null, p.last_stock_date ?? null);
        });
        secSnap.docs.forEach(d => {
            const s = d.data();
            insSector.run(s.id, s.name, s.type, s.created_at);
        });
        histSnap.docs.forEach(d => {
            const h = d.data();
            insHistory.run(h.id, h.product_id, h.product_name, h.sector, h.unit, h.stock, h.date, h.created_at);
        });
        const c = configDoc.exists ? configDoc.data() : {};
        tmpDb.prepare('INSERT OR REPLACE INTO notification_config VALUES (1,?,?,?,?)').run(
            c.day_of_week || 'everyday', c.send_time || '08:00', c.enabled ? 1 : 0, c.last_sent || ''
        );
        recSnap.docs.forEach(d => {
            const r = d.data();
            insRecip.run(r.id, r.name, r.phone, r.apikey);
        });
    })();

    tmpDb.close();
}

async function createBackup() {
    const timestamp = new Date().toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
    const dest = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    try {
        await writeFirestoreToSQLite(dest);
        console.log(`💾 Backup creado: backup-${timestamp}.db`);
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
        if (files.length > MAX_BACKUPS) {
            files.slice(0, files.length - MAX_BACKUPS).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
        }
    } catch (e) {
        console.error('Error al crear backup:', e.message);
    }
}

app.get('/api/backup', async (req, res) => {
    try {
        const filename = `stock-backup-${new Date().toISOString().split('T')[0]}.db`;
        const tmpPath = path.join(BACKUP_DIR, filename);
        await writeFirestoreToSQLite(tmpPath);
        res.download(tmpPath, filename);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/backups/create', async (req, res) => {
    try {
        await createBackup();
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
        res.json({ success: true, file: files[files.length - 1] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/backups', (req, res) => {
    try {
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort().reverse()
            .map(f => { const stat = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: stat.size, date: stat.mtime }; });
        res.json(files);
    } catch { res.json([]); }
});

app.get('/api/backups/:filename', (req, res) => {
    const file = path.basename(req.params.filename);
    const filePath = path.join(BACKUP_DIR, file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'No encontrado' });
    res.download(filePath, file);
});

// ============================================
// API - Notificaciones WhatsApp
// ============================================

const SECTOR_LABELS = {
    'freezer-plancha': '🧊 Freezer de Plancha',
    'freezer-freidora': '🧊 Freezer de Freidora',
    'freezer-despacho': '🧊 Freezer de Despacho',
    'freezer-postres': '🧊 Freezer de Postres',
    'freezer-produccion': '🧊 Freezer de Producción',
    'heladera-despacho': '🧊 Heladera de Despacho',
    'heladera-plancha': '🧊 Heladera de Plancha',
    'heladera-freidora': '🧊 Heladera de Freidora',
    'heladera-sector-dulce': '🧊 Heladera Sector Dulce'
};

function getSectorName(sector) {
    return SECTOR_LABELS[sector] || `📦 ${sector}`;
}

function fmt(n) {
    const v = parseFloat(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

async function buildStockMessage() {
    const snap = await db.collection('products').get();
    const lowStock = snap.docs.map(d => d.data())
        .filter(p => p.last_stock !== null && p.last_stock !== undefined && p.last_stock <= p.min_stock)
        .sort((a, b) => a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name));
    if (lowStock.length === 0) return null;

    const bySector = {};
    lowStock.forEach(p => { if (!bySector[p.sector]) bySector[p.sector] = []; bySector[p.sector].push(p); });

    const date = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const total = lowStock.length;
    const sep = '──────────────────';

    let msg = `🛒 *PEDIDO DE STOCK — ${date}*\n`;
    msg += `_${total} producto${total !== 1 ? 's' : ''} para reponer_\n`;

    Object.entries(bySector).forEach(([sector, prods]) => {
        msg += `\n*${getSectorName(sector)}*\n`;
        prods.forEach(p => {
            const target = p.recommended_stock ?? p.min_stock;
            const aReponer = Math.max(0, target - p.last_stock);
            const dot = p.last_stock === 0 ? '🔴' : '🟡';
            msg += `${dot} ${p.name}\n   Hay: ${fmt(p.last_stock)} ${p.unit} | Pedir: *${fmt(aReponer)} ${p.unit}*\n`;
        });
    });

    return msg.trim();
}

async function sendWhatsApp(recipient, message) {
    if (waStatus !== 'ready') return { success: false, error: 'WhatsApp no conectado' };
    try {
        let chatId;
        if (recipient.type === 'group') {
            chatId = recipient.chatId;
        } else {
            const cleanPhone = recipient.phone.replace(/\D/g, '');
            const numberId = await waClient.getNumberId(cleanPhone);
            if (!numberId) return { success: false, error: 'Número no encontrado en WhatsApp' };
            chatId = numberId._serialized;
        }
        await waClient.sendMessage(chatId, message);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
}

async function sendToAllRecipients(message) {
    const snap = await db.collection('recipients').get();
    const recipients = snap.docs.map(d => d.data());
    if (recipients.length === 0) return { sent: 0, errors: 0 };
    let sent = 0, errors = 0;
    const errorDetails = [];
    for (const r of recipients) {
        const result = await sendWhatsApp(r, message);
        if (result.success) { sent++; console.log(`📱 WhatsApp enviado a ${r.name}`); }
        else { errors++; errorDetails.push(`${r.name}: ${result.error}`); console.error(`Error enviando a ${r.name}:`, result.error); }
    }
    return { sent, errors, errorDetails };
}

app.get('/api/whatsapp/status', (req, res) => {
    res.json({ status: waStatus, qr: waQR });
});

app.get('/api/whatsapp/groups', async (req, res) => {
    if (waStatus !== 'ready') return res.status(503).json({ error: 'WhatsApp no conectado' });
    try {
        const chats = await waClient.getChats();
        const groups = chats
            .filter(c => c.isGroup)
            .map(c => ({ id: c.id._serialized, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json(groups);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/whatsapp/logout', async (req, res) => {
    try {
        await waClient.logout();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notifications/config', async (req, res) => {
    try {
        const doc = await db.collection('notifications').doc('config').get();
        res.json(doc.exists ? doc.data() : { day_of_week: 'everyday', send_time: '08:00', enabled: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/config', async (req, res) => {
    try {
        const { days, send_time, enabled } = req.body;
        await db.collection('notifications').doc('config').set({
            days: Array.isArray(days) ? days : [],
            send_time: send_time || '08:00',
            enabled: !!enabled,
            last_sent: ''
        }, { merge: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notifications/recipients', async (req, res) => {
    try {
        const snap = await db.collection('recipients').orderBy('name').get();
        res.json(snap.docs.map(d => d.data()));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/recipients', async (req, res) => {
    try {
        const { id, name, type, phone, chatId, groupName } = req.body;
        const data = type === 'group'
            ? { id, name: name.trim(), type: 'group', chatId, groupName }
            : { id, name: name.trim(), type: 'individual', phone: phone.trim() };
        await db.collection('recipients').doc(id).set(data);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notifications/recipients/:id', async (req, res) => {
    try {
        await db.collection('recipients').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/test', async (req, res) => {
    try {
        const snap = await db.collection('recipients').get();
        if (snap.empty) return res.status(400).json({ error: 'No hay destinatarios configurados.' });
        const message = await buildStockMessage() || '✅ No hay productos con stock bajo en este momento.';
        const result = await sendToAllRecipients(message);
        res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Scheduler (funciona en Railway porque el proceso es persistente)
setInterval(async () => {
    try {
        const doc = await db.collection('notifications').doc('config').get();
        if (!doc.exists) return;
        const config = doc.data();
        if (!config.enabled) return;

        const recSnap = await db.collection('recipients').get();
        if (recSnap.empty) return;

        const now = new Date();
        const currentDay = now.getDay().toString();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentKey = `${now.toISOString().split('T')[0]}_${currentTime}`;

        const days = config.days || (config.day_of_week === 'everyday' ? ['0','1','2','3','4','5','6'] : [config.day_of_week]);
        const dayMatch = days.includes(currentDay);
        if (!dayMatch || config.send_time !== currentTime || config.last_sent === currentKey) return;

        const message = await buildStockMessage();
        if (!message) { await db.collection('notifications').doc('config').update({ last_sent: currentKey }); return; }

        const { sent } = await sendToAllRecipients(message);
        if (sent > 0) await db.collection('notifications').doc('config').update({ last_sent: currentKey });
    } catch (e) { console.error('Error en scheduler:', e.message); }
}, 60 * 1000);

// ============================================
// Iniciar servidor
// ============================================

app.listen(PORT, () => {
    console.log(`✅ Servidor iniciado en http://localhost:${PORT}`);
    console.log(`🔥 Base de datos: Firestore (granero-stock)`);
});
