import hashlib
import secrets
import os
import time
import re
from urllib.parse import quote

def get_domain() -> str:
    return os.environ.get("RENDER_EXTERNAL_URL", os.environ.get("RAILWAY_PUBLIC_DOMAIN", "localhost")).replace("https://", "").replace("http://", "")

def generate_uuid(secret_key: str, seed: str | None = None) -> str:
    if seed is None:
        return str(secrets.token_hex(16))[:8] + "-" + secrets.token_hex(2) + "-" + secrets.token_hex(2) + "-" + secrets.token_hex(2) + "-" + secrets.token_hex(6)
    h = hashlib.sha256(f"{seed}{secret_key}".encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

def generate_vless_link(uuid: str, domain: str, remark: str = "MeyREN") -> str:
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
    return f"vless://{uuid}@{domain}:443?{query}#{quote(remark)}"

def parse_size_to_bytes(value: float, unit: str) -> int:
    unit = unit.upper()
    if unit == "GB": return int(value * 1024 * 1024 * 1024)
    if unit == "MB": return int(value * 1024 * 1024)
    if unit == "KB": return int(value * 1024)
    return int(value)

def uptime(start_time: float) -> str:
    secs = int(time.time() - start_time)
    h, m, s = secs // 3600, (secs % 3600) // 60, secs % 60
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
    if b > 1073741824: return f"{(b / 1073741824):.2f} GB"
    if b > 1048576: return f"{(b / 1048576):.2f} MB"
    return f"{(b / 1024):.1f} KB"

def format_bot_reply(label: str, used: int, limit: int, active: bool) -> str:
    status = "Active" if active else "Disabled"
    limit_str = "Unlimited" if limit == 0 else format_bytes(limit)
    used_str = format_bytes(used)
    
    reply = "Traffic Status\n"
    reply += "----------------\n"
    reply += f"Name: {label}\n"
    reply += f"Status: {status}\n"
    reply += f"Used: {used_str}\n"
    reply += f"Limit: {limit_str}\n"
    
    if limit > 0:
        remaining = limit - used
        rem_str = format_bytes(remaining) if remaining > 0 else "0 MB"
        reply += f"Remaining: {rem_str}\n"
        
    return reply