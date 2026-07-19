import sqlite3
import hashlib
import os

DB_FILE = "meyren.db"

def init_db(secret_key: str):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS links (uuid TEXT PRIMARY KEY, label TEXT, limit_bytes INTEGER, used_bytes INTEGER, active INTEGER, created_at TEXT)''')
    
    c.execute("SELECT value FROM settings WHERE key='password_hash'")
    if not c.fetchone():
        admin_pw = "admin"
        default_hash = hashlib.sha256(f"{admin_pw}{secret_key}".encode()).hexdigest()
        c.execute("INSERT INTO settings (key, value) VALUES ('password_hash', ?)", (default_hash,))
        
    conn.commit()
    conn.close()

def get_admin_password_hash() -> str:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key='password_hash'")
    result = c.fetchone()
    conn.close()
    return result[0] if result else ""

def update_admin_password_hash(new_hash: str):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("UPDATE settings SET value=? WHERE key='password_hash'", (new_hash,))
    conn.commit()
    conn.close()

def add_link(uuid: str, label: str, limit_bytes: int, used_bytes: int, active: bool, created_at: str):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT INTO links (uuid, label, limit_bytes, used_bytes, active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
              (uuid, label, limit_bytes, used_bytes, int(active), created_at))
    conn.commit()
    conn.close()

def get_links() -> list:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM links")
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_link(uuid: str) -> dict | None:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM links WHERE uuid=?", (uuid,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def update_link(uuid: str, active: bool = None, limit_bytes: int = None, reset_usage: bool = False, label: str = None):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    if active is not None:
        c.execute("UPDATE links SET active=? WHERE uuid=?", (int(active), uuid))
    if limit_bytes is not None:
        c.execute("UPDATE links SET limit_bytes=? WHERE uuid=?", (limit_bytes, uuid))
    if reset_usage:
        c.execute("UPDATE links SET used_bytes=0 WHERE uuid=?", (uuid,))
    if label is not None:
        c.execute("UPDATE links SET label=? WHERE uuid=?", (label, uuid))
    conn.commit()
    conn.close()

def delete_link(uuid: str):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM links WHERE uuid=?", (uuid,))
    conn.commit()
    conn.close()

def add_usage(uuid: str, extra_bytes: int):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("UPDATE links SET used_bytes = used_bytes + ? WHERE uuid=?", (extra_bytes, uuid))
    conn.commit()
    conn.close()