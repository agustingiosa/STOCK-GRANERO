const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const express = require('express');
const fs = require('fs');

initializeApp();
const db = getFirestore();
const app = express();
app.use(express.json());

// ============================================
// Helpers Firestore
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
        const { id, name, sector, unit, min_stock, price, created_at } = req.body;
        await db.collection('products').doc(id).set({
            id, name, sector, unit, min_stock, price: price || null,
            created_at, updated_at: null, last_stock: null, last_stock_date: null
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, sector, unit, min_stock, price, updated_at } = req.body;
        await db.collection('products').doc(req.params.id).update({ name, sector, unit, min_stock, price: price || null, updated_at });
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
        if (existingSnap.docs.length > 0) {
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
// API - Backup (genera SQLite desde Firestore)
// ============================================

async function generateSQLiteBackup() {
    const Database = require('better-sqlite3');
    const tmpPath = `/tmp/backup-${Date.now()}.db`;
    const tmpDb = new Database(tmpPath);

    tmpDb.exec(`
        CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, sector TEXT, unit TEXT,
            min_stock REAL, price REAL, created_at TEXT, updated_at TEXT,
            last_stock REAL, last_stock_date TEXT);
        CREATE TABLE custom_sectors (id TEXT PRIMARY KEY, name TEXT, type TEXT, created_at TEXT);
        CREATE TABLE stock_history (id TEXT PRIMARY KEY, product_id TEXT, product_name TEXT,
            sector TEXT, unit TEXT, stock REAL, date TEXT, created_at TEXT);
        CREATE TABLE notification_config (id INTEGER PRIMARY KEY, day_of_week TEXT,
            send_time TEXT, enabled INTEGER, last_sent TEXT);
        CREATE TABLE notification_recipients (id TEXT PRIMARY KEY, name TEXT, phone TEXT, apikey TEXT);
    `);

    const [prodSnap, secSnap, histSnap, configDoc, recSnap] = await Promise.all([
        db.collection('products').get(),
        db.collection('sectors').get(),
        db.collection('history').get(),
        db.collection('notifications').doc('config').get(),
        db.collection('recipients').get()
    ]);

    const insProduct  = tmpDb.prepare('INSERT OR IGNORE INTO products VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insSector   = tmpDb.prepare('INSERT OR IGNORE INTO custom_sectors VALUES (?,?,?,?)');
    const insHistory  = tmpDb.prepare('INSERT OR IGNORE INTO stock_history VALUES (?,?,?,?,?,?,?,?)');
    const insRecip    = tmpDb.prepare('INSERT OR IGNORE INTO notification_recipients VALUES (?,?,?,?)');

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
        tmpDb.prepare('INSERT INTO notification_config VALUES (1,?,?,?,?)').run(
            c.day_of_week || 'everyday', c.send_time || '08:00', c.enabled ? 1 : 0, c.last_sent || ''
        );
        recSnap.docs.forEach(d => {
            const r = d.data();
            insRecip.run(r.id, r.name, r.phone, r.apikey);
        });
    })();

    tmpDb.close();
    return tmpPath;
}

app.get('/api/backup', async (req, res) => {
    try {
        const tmpPath = await generateSQLiteBackup();
        const filename = `stock-backup-${new Date().toISOString().split('T')[0]}.db`;
        res.download(tmpPath, filename, () => { try { fs.unlinkSync(tmpPath); } catch {} });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/backups/create', async (req, res) => {
    try {
        const tmpPath = await generateSQLiteBackup();
        const filename = `stock-backup-${new Date().toISOString().split('T')[0]}.db`;
        res.download(tmpPath, filename, () => { try { fs.unlinkSync(tmpPath); } catch {} });
    } catch (e) { res.status(500).json({ error: e.message }); }
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

async function buildStockMessage() {
    const snap = await db.collection('products').orderBy('sector').orderBy('name').get();
    const lowStock = snap.docs.map(d => d.data()).filter(p => p.last_stock !== null && p.last_stock !== undefined && p.last_stock <= p.min_stock);
    if (lowStock.length === 0) return null;

    const bySector = {};
    lowStock.forEach(p => { if (!bySector[p.sector]) bySector[p.sector] = []; bySector[p.sector].push(p); });

    const date = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let msg = `🛒 *PEDIDO DE STOCK - ${date}*\n_Productos por debajo del stock mínimo_\n\n`;
    Object.entries(bySector).forEach(([sector, prods]) => {
        msg += `*${getSectorName(sector)}*\n`;
        prods.forEach(p => {
            const aReponer = Math.max(0, p.min_stock - p.last_stock).toFixed(2);
            msg += `• ${p.name}: tiene ${parseFloat(p.last_stock).toFixed(2)} ${p.unit} — pedir ${aReponer} ${p.unit}\n`;
        });
        msg += '\n';
    });
    return msg.trim();
}

async function sendWhatsApp(phone, apikey, message) {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apikey}`;
    try {
        const res = await fetch(url);
        const text = await res.text();
        return { success: res.ok, response: text };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function sendToAllRecipients(message) {
    const snap = await db.collection('recipients').get();
    const recipients = snap.docs.map(d => d.data());
    if (recipients.length === 0) return { sent: 0, errors: 0 };
    let sent = 0, errors = 0;
    for (const r of recipients) {
        const result = await sendWhatsApp(r.phone, r.apikey, message);
        if (result.success) sent++; else errors++;
    }
    return { sent, errors };
}

app.get('/api/notifications/config', async (req, res) => {
    try {
        const doc = await db.collection('notifications').doc('config').get();
        res.json(doc.exists ? doc.data() : { day_of_week: 'everyday', send_time: '08:00', enabled: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/config', async (req, res) => {
    try {
        const { day_of_week, send_time, enabled } = req.body;
        await db.collection('notifications').doc('config').set({
            day_of_week: day_of_week || 'everyday',
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
        const { id, name, phone, apikey } = req.body;
        await db.collection('recipients').doc(id).set({ id, name: name.trim(), phone: phone.trim(), apikey: apikey.trim() });
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

// ============================================
// Exportar como Firebase Function
// ============================================

exports.api = onRequest({ region: 'us-central1', timeoutSeconds: 60 }, app);
