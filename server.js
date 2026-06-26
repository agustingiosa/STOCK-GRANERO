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

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'restaurant-stock.db'));

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