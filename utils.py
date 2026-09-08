import hashlib
import secrets
import os
import time
import re
from urllib.parse import quote

def clean_domain(domain_str: str) -> str:
    if not domain_str:
        return ""
    d = domain_str.strip()
    d = re.sub(r"^https?://", "", d, flags=re.IGNORECASE)
    d = d.split("/")[0].split("?")[0].strip()
    return d.strip(" :")

def get_default_domain() -> str:
    import db
    try:
        custom_default = db.get_default_domain_setting()
        if custom_default:
            return clean_domain(custom_default)
    except Exception:
        pass

    raw_env = os.environ.get("RENDER_EXTERNAL_URL") or os.environ.get("RAILWAY_PUBLIC_DOMAIN")
    if raw_env:
        return clean_domain(raw_env)

    env_domains = [d.strip() for d in re.split(r"[,;\s]+", os.environ.get("DOMAINS", os.environ.get("CUSTOM_DOMAINS", ""))) if d.strip()]
    if env_domains:
        return clean_domain(env_domains[0])

    return "localhost"

def get_domain() -> str:
    return get_default_domain()

def get_all_domains(request_host: str | None = None) -> list[str]:
    import db
    seen = set()
    result = []

    def add_d(d: str):
        cleaned = clean_domain(d)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)

    # 1. Default domain first
    default_d = get_default_domain()
    if default_d:
        add_d(default_d)

    # 2. Env vars
    for env_key in ("RENDER_EXTERNAL_URL", "RAILWAY_PUBLIC_DOMAIN"):
        val = os.environ.get(env_key)
        if val:
            add_d(val)

    env_domains_str = os.environ.get("DOMAINS", os.environ.get("CUSTOM_DOMAINS", ""))
    for d in re.split(r"[,;\s]+", env_domains_str):
        if d.strip():
            add_d(d)

    # 3. DB custom domains
    try:
        for d in db.get_custom_domains():
            add_d(d)
    except Exception:
        pass

    # 4. Request host if valid
    if request_host:
        h = clean_domain(request_host)
        if h and h not in ("0.0.0.0", "testserver"):
            add_d(h)

    if not result:
        result.append("localhost")

    return result


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