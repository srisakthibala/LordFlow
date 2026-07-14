import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'loadflow.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt };
};

export const initDb = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      permissions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      name TEXT NOT NULL,
      org_id TEXT,
      role_id TEXT,
      role_type TEXT NOT NULL,
      org_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS compliance_records (
      org_id TEXT PRIMARY KEY,
      insurance_expiry TEXT NOT NULL,
      authority_status TEXT NOT NULL,
      dot_number TEXT NOT NULL,
      mc_number TEXT NOT NULL,
      approved_equipment TEXT NOT NULL,
      approved_commodities TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS loads (
      id TEXT PRIMARY KEY,
      shipper_id TEXT NOT NULL,
      broker_id TEXT NOT NULL,
      carrier_id TEXT,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      pickup_date TEXT NOT NULL,
      delivery_date TEXT NOT NULL,
      equipment_type TEXT NOT NULL,
      commodity TEXT NOT NULL,
      weight REAL NOT NULL,
      compliance_flag INTEGER DEFAULT 0,
      compliance_override INTEGER DEFAULT 0,
      compliance_override_by TEXT,
      compliance_override_reason TEXT,
      current_rate_version INTEGER DEFAULT 0,
      pod_filename TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (shipper_id) REFERENCES users (id),
      FOREIGN KEY (broker_id) REFERENCES organizations (id),
      FOREIGN KEY (carrier_id) REFERENCES organizations (id),
      FOREIGN KEY (compliance_override_by) REFERENCES users (id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS rate_confirmations (
      id TEXT PRIMARY KEY,
      load_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      base_rate REAL NOT NULL,
      fuel_surcharge REAL NOT NULL,
      accessorials TEXT NOT NULL,
      status TEXT NOT NULL,
      confirmed_by_carrier_user_id TEXT,
      confirmed_at TEXT,
      created_by_broker_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (load_id) REFERENCES loads (id) ON DELETE CASCADE,
      FOREIGN KEY (confirmed_by_carrier_user_id) REFERENCES users (id),
      FOREIGN KEY (created_by_broker_user_id) REFERENCES users (id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      load_id TEXT,
      org_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);
};
export default db;
