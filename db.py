import sqlite3
import hashlib
import threading
from collections import defaultdict

import secrets

DB_FILE = "meyren.db"

_LINKS_CACHE: dict = {}
_PENDING_USAGE: dict = defaultdict(int)
_CACHE_LOCK = threading.Lock()


def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, timeout=10.0, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-2000;")  # ~2MB cache cap
    conn.execute("PRAGMA temp_store=MEMORY;")
    return conn


def hash_password(pw: str, secret_key: str) -> str:
    return hashlib.sha256(f"{pw}{secret_key}".encode()).hexdigest()


def get_or_create_secret_key(env_secret: str | None = None) -> str:
    """Returns persistent secret key from env or DB settings, creating and saving one if missing."""
    conn = _get_connection()
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)""")
    
    if env_secret and env_secret.strip():
        secret = env_secret.strip()
        c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('secret_key', ?)", (secret,))
        conn.commit()
        conn.close()
        return secret

    c.execute("SELECT value FROM settings WHERE key='secret_key'")
    row = c.fetchone()
    if row and row[0]:
        secret = row[0]
        conn.close()
        return secret

    # Generate new persistent secret and store it
    secret = secrets.token_urlsafe(32)
    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('secret_key', ?)", (secret,))
    conn.commit()
    conn.close()
    return secret


import json

def get_custom_domains() -> list:
    conn = _get_connection()
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key='custom_domains'")
    row = c.fetchone()
    conn.close()
    if row and row[0]:
        try:
            return json.loads(row[0])
        except Exception:
            return []
    return []


def add_custom_domain(domain: str) -> list:
    domain = domain.strip()
    if not domain:
        return get_custom_domains()
    domains = get_custom_domains()
    if domain not in domains:
        domains.append(domain)
        conn = _get_connection()
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_domains', ?)", (json.dumps(domains),))
        conn.commit()
        conn.close()
    return domains


def delete_custom_domain(domain: str) -> list:
    domain = domain.strip()
    domains = get_custom_domains()
    if domain in domains:
        domains.remove(domain)
        conn = _get_connection()
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_domains', ?)", (json.dumps(domains),))
        conn.commit()
        conn.close()
    return domains


def get_default_domain_setting() -> str | None:
    conn = _get_connection()
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key='default_domain'")
    row = c.fetchone()
    conn.close()
    return row[0] if row and row[0] else None


def set_default_domain_setting(domain: str):
    domain = domain.strip()
    conn = _get_connection()
    c = conn.cursor()
    if domain:
        c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_domain', ?)", (domain,))
    else:
        c.execute("DELETE FROM settings WHERE key='default_domain'")
    conn.commit()
    conn.close()


def init_db(secret_key: str):
    conn = _get_connection()
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS links (
        uuid TEXT PRIMARY KEY,
        label TEXT,
        limit_bytes INTEGER,
        used_bytes INTEGER,
        active INTEGER,
        created_at TEXT,
        domain TEXT DEFAULT ''
    )""")
    try:
        c.execute("ALTER TABLE links ADD COLUMN domain TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('secret_key', ?)", (secret_key,))

    c.execute("SELECT value FROM settings WHERE key='password_hash'")
    if not c.fetchone():
        admin_pw = "admin"
        default_hash = hash_password(admin_pw, secret_key)
        c.execute("INSERT INTO settings (key, value) VALUES ('password_hash', ?)", (default_hash,))
        
    conn.commit()

    # Load in-memory link cache
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM links")
    rows = c.fetchall()
    conn.close()

    with _CACHE_LOCK:
        _LINKS_CACHE.clear()
        _PENDING_USAGE.clear()
        for row in rows:
            d_row = dict(row)
            d_row.setdefault("domain", "")
            _LINKS_CACHE[row["uuid"]] = d_row


def reset_admin_password(new_password: str = "admin", secret_key: str | None = None) -> str:
    """Resets the admin password in DB and returns the new hash."""
    if not secret_key:
        secret_key = get_or_create_secret_key()
    new_hash = hash_password(new_password, secret_key)
    update_admin_password_hash(new_hash)
    return new_hash


def get_admin_password_hash() -> str:
    conn = _get_connection()
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key='password_hash'")
    result = c.fetchone()
    conn.close()
    return result[0] if result else ""



def update_admin_password_hash(new_hash: str):
    conn = _get_connection()
    c = conn.cursor()
    c.execute("UPDATE settings SET value=? WHERE key='password_hash'", (new_hash,))
    conn.commit()
    conn.close()


def add_link(uuid: str, label: str, limit_bytes: int, used_bytes: int, active: bool, created_at: str, domain: str = ""):
    conn = _get_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO links (uuid, label, limit_bytes, used_bytes, active, created_at, domain) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (uuid, label, limit_bytes, used_bytes, int(active), created_at, domain or ""),
    )
    conn.commit()
    conn.close()

    with _CACHE_LOCK:
        _LINKS_CACHE[uuid] = {
            "uuid": uuid,
            "label": label,
            "limit_bytes": limit_bytes,
            "used_bytes": used_bytes,
            "active": int(active),
            "created_at": created_at,
            "domain": domain or "",
        }


def get_links() -> list:
    with _CACHE_LOCK:
        return [dict(link) for link in _LINKS_CACHE.values()]


def get_link(uuid: str) -> dict | None:
    with _CACHE_LOCK:
        link = _LINKS_CACHE.get(uuid)
        return dict(link) if link is not None else None


def check_quota_fast(uuid: str, extra_bytes: int = 0) -> bool:
    with _CACHE_LOCK:
        link = _LINKS_CACHE.get(uuid)
        if link is None:
            return False
        if not link.get("active", 1):
            return False
        limit_bytes = link.get("limit_bytes", 0)
        if limit_bytes == 0:
            return True
        return (link.get("used_bytes", 0) + extra_bytes) <= limit_bytes


def add_usage_buffered(uuid: str, extra_bytes: int):
    with _CACHE_LOCK:
        link = _LINKS_CACHE.get(uuid)
        if link is not None:
            link["used_bytes"] = link.get("used_bytes", 0) + extra_bytes
        _PENDING_USAGE[uuid] += extra_bytes


def add_usage(uuid: str, extra_bytes: int):
    add_usage_buffered(uuid, extra_bytes)


def flush_usage_to_db():
    with _CACHE_LOCK:
        if not _PENDING_USAGE:
            return
        items = list(_PENDING_USAGE.items())
        _PENDING_USAGE.clear()

    if not items:
        return

    try:
        conn = _get_connection()
        c = conn.cursor()
        c.executemany(
            "UPDATE links SET used_bytes = used_bytes + ? WHERE uuid = ?",
            [(bytes_delta, uid) for uid, bytes_delta in items if bytes_delta > 0],
        )
        conn.commit()
        conn.close()
    except Exception as e:
        with _CACHE_LOCK:
            for uid, bytes_delta in items:
                _PENDING_USAGE[uid] += bytes_delta
        raise e


def update_link(uuid: str, active: bool = None, limit_bytes: int = None, reset_usage: bool = False, label: str = None, domain: str = None):
    if reset_usage:
        with _CACHE_LOCK:
            _PENDING_USAGE.pop(uuid, None)

    conn = _get_connection()
    c = conn.cursor()
    if active is not None:
        c.execute("UPDATE links SET active=? WHERE uuid=?", (int(active), uuid))
    if limit_bytes is not None:
        c.execute("UPDATE links SET limit_bytes=? WHERE uuid=?", (limit_bytes, uuid))
    if reset_usage:
        c.execute("UPDATE links SET used_bytes=0 WHERE uuid=?", (uuid,))
    if label is not None:
        c.execute("UPDATE links SET label=? WHERE uuid=?", (label, uuid))
    if domain is not None:
        c.execute("UPDATE links SET domain=? WHERE uuid=?", (domain, uuid))
    conn.commit()
    conn.close()

    with _CACHE_LOCK:
        link = _LINKS_CACHE.get(uuid)
        if link is not None:
            if active is not None:
                link["active"] = int(active)
            if limit_bytes is not None:
                link["limit_bytes"] = limit_bytes
            if reset_usage:
                link["used_bytes"] = 0
            if label is not None:
                link["label"] = label
            if domain is not None:
                link["domain"] = domain


def delete_link(uuid: str):
    conn = _get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM links WHERE uuid=?", (uuid,))
    conn.commit()
    conn.close()

    with _CACHE_LOCK:
        _LINKS_CACHE.pop(uuid, None)
        _PENDING_USAGE.pop(uuid, None)