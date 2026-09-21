import hashlib
import secrets
import os
import time
import re
from urllib.parse import quote
from datetime import datetime

# Curated list of high-availability Cloudflare clean IP ranges/domains for censorship circumvention
CF_CLEAN_IPS = [
    "104.16.132.229",
    "104.17.147.22",
    "104.18.2.161",
    "104.19.155.153",
    "162.159.138.85",
    "172.64.155.209",
    "172.67.73.1",
    "www.speedtest.net",
    "www.cloudflare.com",
    "cp.cloudflare.com",
]


def get_domain() -> str:
    return os.environ.get(
        "RENDER_EXTERNAL_URL",
        os.environ.get(
            "RAILWAY_PUBLIC_DOMAIN",
            os.environ.get("SERVER_DOMAIN", os.environ.get("DEFAULT_DOMAIN", "localhost"))
        )
    ).replace("https://", "").replace("http://", "").split("/")[0]


def get_client_ip(conn) -> str:
    """Extracts genuine client IP from proxy headers (Cloudflare, reverse proxy) or raw socket."""
    headers = getattr(conn, "headers", {})
    
    # 1. Cloudflare header
    cf_ip = headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip()

    # 2. X-Forwarded-For (leftmost client IP)
    fwd = headers.get("x-forwarded-for")
    if fwd and fwd.strip():
        return fwd.split(",")[0].strip()

    # 3. X-Real-IP
    real_ip = headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()

    # 4. Socket client
    client = getattr(conn, "client", None)
    if client and getattr(client, "host", None):
        return client.host

    return "unknown"


def generate_uuid(secret_key: str, seed: str | None = None) -> str:
    if seed is None:
        return str(secrets.token_hex(16))[:8] + "-" + secrets.token_hex(2) + "-" + secrets.token_hex(2) + "-" + secrets.token_hex(2) + "-" + secrets.token_hex(6)
    h = hashlib.sha256(f"{seed}{secret_key}".encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def generate_vless_link(uuid: str, domain: str, remark: str = "MeyREN", clean_ip: str | None = None) -> str:
    connect_host = clean_ip if clean_ip else domain
    path = f"/ws/{uuid}"
    params = {
        "encryption": "none",
        "security": "tls",
        "type": "ws",
        "host": domain,
        "path": path,
        "sni": domain,
        "fp": "chrome",
        "alpn": "http/1.1",
    }
    query = "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
    return f"vless://{uuid}@{connect_host}:443?{query}#{quote(remark)}"


def parse_size_to_bytes(value: float, unit: str) -> int:
    unit = unit.upper().strip()
    if unit == "TB": return int(value * 1024 * 1024 * 1024 * 1024)
    if unit == "GB": return int(value * 1024 * 1024 * 1024)
    if unit == "MB": return int(value * 1024 * 1024)
    if unit == "KB": return int(value * 1024)
    return int(value)


def uptime(start_time: float) -> str:
    secs = int(time.time() - start_time)
    d, rem = secs // 86400, secs % 86400
    h, m, s = rem // 3600, (rem % 3600) // 60, rem % 60
    if d > 0:
        return f"{d}d {h:02d}:{m:02d}:{s:02d}"
    return f"{h:02d}:{m:02d}:{s:02d}"


async def parse_vless_header(first_chunk: bytes):
    if len(first_chunk) < 24:
        raise ValueError("chunk too small")
    pos = 0
    pos += 1; pos += 16
    addon_len = first_chunk[pos]; pos += 1; pos += addon_len
    command = first_chunk[pos]; pos += 1
    port = int.from_bytes(first_chunk[pos:pos + 2], "big"); pos += 2
    addr_type = first_chunk[pos]; pos += 1
    if addr_type == 1:
        addr_bytes = first_chunk[pos:pos + 4]; pos += 4
        address = ".".join(str(b) for b in addr_bytes)
    elif addr_type == 2:
        domain_len = first_chunk[pos]; pos += 1
        address = first_chunk[pos:pos + domain_len].decode("utf-8", errors="ignore"); pos += domain_len
    elif addr_type == 3:
        addr_bytes = first_chunk[pos:pos + 16]; pos += 16
        address = ":".join(f"{addr_bytes[i]:02x}{addr_bytes[i+1]:02x}" for i in range(0, 16, 2))
    else:
        raise ValueError(f"unknown address type: {addr_type}")
    return command, address, port, first_chunk[pos:]


def extract_uuid_from_link(text: str) -> str | None:
    match = re.search(r"vless://([a-f0-9\-]{36})", text)
    if match:
        return match.group(1)
    return None


def format_bytes(b: int) -> str:
    if b >= 1099511627776:
        return f"{(b / 1099511627776):.2f} TB"
    if b >= 1073741824:
        return f"{(b / 1073741824):.2f} GB"
    if b >= 1048576:
        return f"{(b / 1048576):.2f} MB"
    return f"{(b / 1024):.1f} KB"


def format_expiration(expires_at: str | None) -> tuple[str, bool]:
    """Returns (formatted_string, is_expired)"""
    if not expires_at:
        return "Never", False
    try:
        exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        now = datetime.now(exp_dt.tzinfo or None)
        diff = exp_dt - now
        if diff.total_seconds() <= 0:
            return "Expired", True
        days = diff.days
        hours = diff.seconds // 3600
        if days > 0:
            return f"{days}d {hours}h left", False
        return f"{hours}h left", False
    except Exception:
        return str(expires_at), False


def format_bot_reply(label: str, used: int, limit: int, active: bool, expires_at: str | None = None, speed_mbps: float = 0.0) -> str:
    status = "Active" if active else "Disabled"
    limit_str = "Unlimited" if limit == 0 else format_bytes(limit)
    used_str = format_bytes(used)
    exp_str, is_expired = format_expiration(expires_at)
    if is_expired:
        status = "Expired"

    reply = "⚡ *MeyREN Node Status*\n"
    reply += "━━━━━━━━━━━━━━━━━━━━\n"
    reply += f"👤 *Label:* `{label}`\n"
    reply += f"🔘 *Status:* {status}\n"
    reply += f"📊 *Used:* `{used_str}`\n"
    reply += f"🎯 *Quota:* `{limit_str}`\n"
    
    if limit > 0:
        remaining = max(0, limit - used)
        reply += f"⏳ *Remaining:* `{format_bytes(remaining)}`\n"
        
    reply += f"📅 *Expires:* `{exp_str}`\n"
    if speed_mbps > 0:
        reply += f"🚀 *Speed Limit:* `{speed_mbps} Mbps`\n"
    reply += "━━━━━━━━━━━━━━━━━━━━"
    return reply