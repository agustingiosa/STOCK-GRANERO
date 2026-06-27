// ============================================
// server.js - Servidor Express + SQLite local
// ============================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
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
// Base de datos SQLite
// ============================================

const dbPath = process.env.DB_PATH || path.join(__dirname, 'restaurant-stock.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(dbPath);

// Habilitar WAL mode para mejor performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Crear tablas
db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sector TEXT NOT NULL,
        unit TEXT NOT NULL,
        min_stock REAL NOT NULL DEFAULT 0,
        price REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        last_stock REAL DEFAULT NULL,
        last_stock_date TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_sectors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'otros',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_history (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        sector TEXT NOT NULL,
        unit TEXT NOT NULL,
        stock REAL NOT NULL,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_sector ON products(sector);
    CREATE INDEX IF NOT EXISTS idx_history_date ON stock_history(date);
    CREATE INDEX IF NOT EXISTS idx_history_product ON stock_history(product_id);

    CREATE TABLE IF NOT EXISTS notification_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        phone TEXT DEFAULT '',
        apikey TEXT DEFAULT '',
        day_of_week TEXT DEFAULT 'everyday',
        send_time TEXT DEFAULT '08:00',
        enabled INTEGER DEFAULT 0,
        last_sent TEXT DEFAULT ''
    );
    INSERT OR IGNORE INTO notification_config (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS notification_recipients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        apikey TEXT NOT NULL
    );
`);

// ============================================
// API - Productos
// ============================================

// Obtener todos los productos
app.get('/api/products', (req, res) => {
    try {
        const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Agregar producto
app.post('/api/products', (req, res) => {
    try {
        const { id, name, sector, unit, min_stock, price, created_at } = req.body;
        db.prepare(
            'INSERT INTO products (id, name, sector, unit, min_stock, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(id, name, sector, unit, min_stock, price, created_at);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Actualizar producto
app.put('/api/products/:id', (req, res) => {
    try {
        const { name, sector, unit, min_stock, price, updated_at } = req.body;
        db.prepare(
            'UPDATE products SET name = ?, sector = ?, unit = ?, min_stock = ?, price = ?, updated_at = ? WHERE id = ?'
        ).run(name, sector, unit, min_stock, price, updated_at, req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Eliminar producto (y su historial)
app.delete('/api/products/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM stock_history WHERE product_id = ?').run(req.params.id);
        db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// API - Sectores personalizados
// ============================================

app.get('/api/sectors', (req, res) => {
    try {
        const sectors = db.prepare('SELECT * FROM custom_sectors ORDER BY name ASC').all();
        res.json(sectors);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sectors', (req, res) => {
    try {
        const { id, name, type, created_at } = req.body;
        db.prepare(
            'INSERT INTO custom_sectors (id, name, type, created_at) VALUES (?, ?, ?, ?)'
        ).run(id, name, type, created_at);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/sectors/:id', (req, res) => {
    try {
        const sector = db.prepare('SELECT * FROM custom_sectors WHERE id = ?').get(req.params.id);
        if (!sector) return res.status(404).json({ error: 'Sector no encontrado' });

        // Eliminar productos e historial de ese sector
        db.prepare('DELETE FROM stock_history WHERE sector = ?').run(sector.name);
        db.prepare('DELETE FROM products WHERE sector = ?').run(sector.name);
        db.prepare('DELETE FROM custom_sectors WHERE id = ?').run(req.params.id);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// API - Historial de stock
// ============================================

app.get('/api/history', (req, res) => {
    try {
        const history = db.prepare('SELECT * FROM stock_history ORDER BY date DESC, product_name ASC').all();
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Guardar carga del día (reemplaza todas las entradas de la fecha)
app.post('/api/history/daily', (req, res) => {
    try {
        const { date, entries } = req.body;

        const deleteStmt = db.prepare('DELETE FROM stock_history WHERE date = ?');
        const insertStmt = db.prepare(
            'INSERT INTO stock_history (id, product_id, product_name, sector, unit, stock, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        const updateProductStmt = db.prepare(
            'UPDATE products SET last_stock = ?, last_stock_date = ?, updated_at = ? WHERE id = ?'
        );

        const transaction = db.transaction(() => {
            deleteStmt.run(date);

            for (const entry of entries) {
                insertStmt.run(entry.id, entry.product_id, entry.product_name, entry.sector, entry.unit, entry.stock, date, entry.created_at);
                updateProductStmt.run(entry.stock, date, entry.created_at, entry.product_id);
            }
        });

        transaction();
        createBackup();
        res.json({ success: true, count: entries.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Limpiar todo el historial
app.delete('/api/history', (req, res) => {
    try {
        db.prepare('DELETE FROM stock_history').run();
        db.prepare("UPDATE products SET last_stock = NULL, last_stock_date = NULL").run();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// Backups automáticos
// ============================================

const BACKUP_DIR = path.join(__dirname, 'backups');
const MAX_BACKUPS = 30;

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

async function createBackup() {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
    const dest = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    try {
        await db.backup(dest);
        console.log(`💾 Backup creado: backup-${timestamp}.db`);
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.db'))
            .sort();
        if (files.length > MAX_BACKUPS) {
            const toDelete = files.slice(0, files.length - MAX_BACKUPS);
            toDelete.forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
            console.log(`🗑️ Backups antiguos eliminados: ${toDelete.length}`);
        }
    } catch (e) {
        console.error('Error al crear backup:', e.message);
    }
}

// ============================================
// API - Backup
// ============================================

app.get('/api/backup', (req, res) => {
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'restaurant-stock.db');
    const filename = `stock-backup-${new Date().toISOString().split('T')[0]}.db`;
    res.download(dbPath, filename);
});

app.post('/api/backups/create', async (req, res) => {
    try {
        await createBackup();
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
        res.json({ success: true, file: files[files.length - 1] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/backups', (req, res) => {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.db'))
            .sort()
            .reverse()
            .map(f => {
                const stat = fs.statSync(path.join(BACKUP_DIR, f));
                return { name: f, size: stat.size, date: stat.mtime };
            });
        res.json(files);
    } catch (e) {
        res.json([]);
    }
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
    if (SECTOR_LABELS[sector]) return SECTOR_LABELS[sector];
    return `📦 ${sector}`;
}

function buildStockMessage() {
    const lowStock = db.prepare(`
        SELECT * FROM products
        WHERE last_stock IS NOT NULL AND last_stock <= min_stock
        ORDER BY sector, name ASC
    `).all();
    if (lowStock.length === 0) return null;

    const bySector = {};
    lowStock.forEach(p => {
        if (!bySector[p.sector]) bySector[p.sector] = [];
        bySector[p.sector].push(p);
    });

    const date = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let msg = `🛒 *PEDIDO DE STOCK - ${date}*\n`;
    msg += `_Productos por debajo del stock mínimo_\n\n`;

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

app.get('/api/notifications/config', (req, res) => {
    try {
        res.json(db.prepare('SELECT * FROM notification_config WHERE id = 1').get());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications/config', (req, res) => {
    try {
        const { day_of_week, send_time, enabled } = req.body;
        db.prepare(`UPDATE notification_config SET day_of_week=?, send_time=?, enabled=? WHERE id=1`)
            .run(day_of_week || 'everyday', send_time || '08:00', enabled ? 1 : 0);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Destinatarios
app.get('/api/notifications/recipients', (req, res) => {
    try {
        res.json(db.prepare('SELECT * FROM notification_recipients ORDER BY name ASC').all());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications/recipients', (req, res) => {
    try {
        const { id, name, phone, apikey } = req.body;
        db.prepare('INSERT INTO notification_recipients (id, name, phone, apikey) VALUES (?, ?, ?, ?)')
            .run(id, name.trim(), phone.trim(), apikey.trim());
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/notifications/recipients/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM notification_recipients WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

async function sendToAllRecipients(message) {
    const recipients = db.prepare('SELECT * FROM notification_recipients').all();
    if (recipients.length === 0) return { sent: 0, errors: 0 };
    let sent = 0, errors = 0;
    for (const r of recipients) {
        const result = await sendWhatsApp(r.phone, r.apikey, message);
        if (result.success) { sent++; console.log(`📱 WhatsApp enviado a ${r.name} (${r.phone})`); }
        else { errors++; console.error(`Error enviando a ${r.name}:`, result.error || result.response); }
    }
    return { sent, errors };
}

app.post('/api/notifications/test', async (req, res) => {
    const recipients = db.prepare('SELECT * FROM notification_recipients').all();
    if (recipients.length === 0) return res.status(400).json({ error: 'No hay destinatarios configurados.' });
    const message = buildStockMessage() || '✅ No hay productos con stock bajo en este momento.';
    const result = await sendToAllRecipients(message);
    res.json({ success: true, ...result });
});

// Scheduler: revisa cada minuto si hay que enviar
setInterval(async () => {
    const config = db.prepare('SELECT * FROM notification_config WHERE id = 1').get();
    if (!config || !config.enabled) return;

    const recipients = db.prepare('SELECT * FROM notification_recipients').all();
    if (recipients.length === 0) return;

    const now = new Date();
    const currentDay = now.getDay().toString();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentKey = `${now.toISOString().split('T')[0]}_${currentTime}`;

    const dayMatch = config.day_of_week === 'everyday' || config.day_of_week === currentDay;
    if (!dayMatch || config.send_time !== currentTime || config.last_sent === currentKey) return;

    const message = buildStockMessage();
    if (!message) {
        db.prepare('UPDATE notification_config SET last_sent=? WHERE id=1').run(currentKey);
        return;
    }

    const { sent } = await sendToAllRecipients(message);
    if (sent > 0) db.prepare('UPDATE notification_config SET last_sent=? WHERE id=1').run(currentKey);
}, 60 * 1000);

// ============================================
// Iniciar servidor
// ============================================

app.listen(PORT, () => {
    console.log(`✅ Servidor iniciado en http://localhost:${PORT}`);
    console.log(`📁 Base de datos: ${process.env.DB_PATH || 'restaurant-stock.db'}`);
    console.log(`📂 Backups: ${BACKUP_DIR}`);

    // Backup al iniciar
    createBackup();

    // Backup automático cada 24 horas
    setInterval(createBackup, 24 * 60 * 60 * 1000);
});