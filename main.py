import asyncio
import json
import os
import gc
import hashlib
import secrets
import time
from datetime import datetime, timedelta
from collections import deque, defaultdict
from urllib.parse import quote
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import Response, HTMLResponse, JSONResponse, RedirectResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import psutil
from dotenv import load_dotenv

load_dotenv()

import db
import utils
import auth
import limiter
import protocols
import xhttp
import sub
import bot
import tester

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("REN-Gateway")

app = FastAPI(title="MeyREN Gateway", docs_url=None, redoc_url=None)

SECRET_KEY = db.get_or_create_secret_key(os.environ.get("SECRET_KEY"))

CONFIG = {
    "port": int(os.environ.get("PORT", 8000)),
    "secret": SECRET_KEY,
}

db.init_db(CONFIG["secret"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Mount modular routers
app.include_router(xhttp.router)
app.include_router(sub.router)

stats = {"total_bytes": 0, "total_requests": 0, "total_errors": 0, "start_time": time.time()}
error_logs: deque = deque(maxlen=50)
hourly_traffic: dict = defaultdict(int)

RELAY_BUF = 32 * 1024  # 32KB buffer for optimal memory-to-throughput ratio


def hash_password(pw: str) -> str:
    return db.hash_password(pw, CONFIG["secret"])


async def keep_alive_task():
    import urllib.request
    while True:
        await asyncio.sleep(600)
        domain = utils.get_domain()
        if domain and domain != "localhost":
            try:
                await asyncio.to_thread(urllib.request.urlopen, f"https://{domain}/health")
            except Exception as e:
                logger.warning(f"Keepalive ping failed: {e}")


async def background_maintenance_task():
    """Flushes buffered DB usage, prunes expired sessions, and runs gentle memory GC."""
    last_gc = time.time()
    last_session_clean = time.time()
    while True:
        try:
            await asyncio.sleep(2.0)
            # Flush buffered usage to SQLite
            await asyncio.to_thread(db.flush_usage_to_db)

            now = time.time()
            if now - last_session_clean > 300:
                await auth.cleanup_expired_sessions()
                last_session_clean = now

            if now - last_gc > 60:
                gc.collect()
                last_gc = now
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"Maintenance task error: {e}")


@app.on_event("startup")
async def startup():
    psutil.cpu_percent(interval=None)
    logger.info(f"MeyREN Gateway started on port {CONFIG['port']}")
    asyncio.create_task(keep_alive_task())
    asyncio.create_task(background_maintenance_task())
    asyncio.create_task(limiter.prune_stale_connections_loop())
    # Start optional companion Telegram bot
    bot.start_telegram_bot(utils.get_domain(), stats["start_time"])


@app.on_event("shutdown")
async def shutdown():
    logger.info("MeyREN Gateway shutting down, flushing pending writes...")
    bot.stop_telegram_bot()
    try:
        db.flush_usage_to_db()
    except Exception:
        pass


async def ensure_default_link():
    links = db.get_links()
    if not links:
        uid = utils.generate_uuid(CONFIG["secret"], "default")
        db.add_link(uid, "Default", 0, 0, True, datetime.now().isoformat())


@app.get("/")
async def root():
    return {
        "service": "MeyREN Gateway",
        "version": "2.0.0",
        "status": "active",
        "domain": utils.get_domain(),
        "transports": ["vless-ws", "vless-xhttp", "trojan-ws"],
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "connections": limiter.get_active_connections_count(),
        "uptime": utils.uptime(stats["start_time"]),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Authentication & Multi-Admin RBAC Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/login")
async def api_login(request: Request):
    body = await request.json()
    username = str(body.get("username") or "admin").strip()
    password = str(body.get("password") or "")
    req_ip = utils.get_client_ip(request)

    # Check multi-admin table first
    admin = db.get_admin_by_username(username)
    if admin:
        if not admin.get("is_active", 1):
            raise HTTPException(status_code=403, detail="Account is disabled")
        if hash_password(password) != admin.get("password_hash"):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        role = admin.get("role", "admin")
        permissions = admin.get("permissions", ["all"])
    else:
        # Fallback to master password hash in settings
        if username == "admin" and hash_password(password) == db.get_admin_password_hash():
            role = "superadmin"
            permissions = ["all"]
        else:
            raise HTTPException(status_code=401, detail="Invalid username or password")

    token = await auth.create_session(username=username, role=role, permissions=permissions)
    db.add_audit_log(username, "login", "admin_panel", req_ip)

    resp = JSONResponse({
        "ok": True,
        "username": username,
        "role": role,
        "permissions": permissions,
    })
    resp.set_cookie(key=auth.SESSION_COOKIE, value=token, max_age=auth.SESSION_TTL, httponly=True, samesite="lax", path="/")
    return resp


@app.post("/api/logout")
async def api_logout(request: Request):
    token = request.cookies.get(auth.SESSION_COOKIE)
    sess = await auth.get_session(token)
    if sess:
        db.add_audit_log(sess.get("username", "unknown"), "logout", "", utils.get_client_ip(request))
    await auth.destroy_session(token)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(auth.SESSION_COOKIE, path="/")
    return resp


@app.get("/api/me")
async def api_me(request: Request):
    token = request.cookies.get(auth.SESSION_COOKIE)
    sess = await auth.get_session(token)
    if not sess:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "username": sess.get("username", "admin"),
        "role": sess.get("role", "admin"),
        "permissions": sess.get("permissions", []),
    }


@app.post("/api/change-password")
async def api_change_password(request: Request, sess=Depends(auth.require_auth)):
    body = await request.json()
    current = str(body.get("current_password") or "")
    new = str(body.get("new_password") or "")
    username = sess.get("username", "admin")

    # Verify current password
    admin = db.get_admin_by_username(username)
    current_hash = admin.get("password_hash") if admin else db.get_admin_password_hash()

    if hash_password(current) != current_hash:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(new) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    new_h = hash_password(new)
    if admin:
        db.update_admin(admin["id"], password_hash=new_h)
    else:
        db.update_admin_password_hash(new_h)

    current_token = request.cookies.get(auth.SESSION_COOKIE)
    await auth.clear_other_sessions(current_token)
    db.add_audit_log(username, "change_password", "", utils.get_client_ip(request))
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Dashboard & Telemetry
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/stats")
async def get_stats(_=Depends(auth.require_auth)):
    all_links = db.get_links()
    active_conns = limiter.get_active_connections_count()
    return {
        "active_connections": active_conns,
        "total_traffic_mb": round(stats["total_bytes"] / (1024 * 1024), 2),
        "total_requests": stats["total_requests"],
        "total_errors": stats["total_errors"],
        "uptime": utils.uptime(stats["start_time"]),
        "timestamp": datetime.now().isoformat(),
        "recent_errors": list(error_logs)[-10:],
        "links_count": len(all_links),
        "active_links_count": sum(1 for l in all_links if l.get("active", 1)),
        "domain": utils.get_domain(),
        "cpu_percent": psutil.cpu_percent(interval=None),
        "memory_percent": psutil.virtual_memory().percent,
        "hourly_traffic": dict(hourly_traffic),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Link / User Management Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/links")
async def create_link(request: Request, sess=Depends(auth.require_permission("manage_users"))):
    body = await request.json()
    label = (body.get("label") or body.get("name") or "New Link").strip()[:60]
    limit_value = float(body.get("limit_value") or body.get("limit") or 0)
    limit_unit = body.get("limit_unit") or body.get("unit") or "GB"
    limit_bytes = 0 if limit_value <= 0 else utils.parse_size_to_bytes(limit_value, limit_unit)
    
    speed_mbps = float(body.get("speed_limit_mbps") or body.get("speed") or 0.0)
    max_ips = int(body.get("max_ips") or body.get("ip_limit") or 0)
    group_id = int(body.get("group_id") or body.get("category_id") or 1)
    
    protocol = protocols.normalize_protocol(body.get("protocol"))
    port = int(body.get("port") or 443)
    fingerprint = body.get("fingerprint") or "chrome"
    alpn = body.get("alpn") or ""
    note = body.get("note") or ""
    config_count = int(body.get("config_count") or body.get("count") or 1)
    
    expires_at = None
    days = body.get("days")
    if days and str(days).isdigit() and int(days) > 0:
        expires_at = (datetime.utcnow() + timedelta(days=int(days))).isoformat()
    elif body.get("expires_at"):
        expires_at = str(body.get("expires_at"))

    uid = utils.generate_uuid(CONFIG["secret"], label)
    created_at = datetime.now().isoformat()
    sub_token = secrets.token_urlsafe(16)
    
    db.add_link(
        uuid=uid,
        label=label,
        limit_bytes=limit_bytes,
        used_bytes=0,
        active=True,
        created_at=created_at,
        speed_limit_mbps=speed_mbps,
        max_ips=max_ips,
        expires_at=expires_at,
        sub_token=sub_token,
        group_id=group_id,
        protocol=protocol,
        port=port,
        fingerprint=fingerprint,
        alpn=alpn,
        note=note,
        config_count=config_count,
    )
    
    domain = utils.get_domain()
    db.add_audit_log(sess.get("username", "admin"), "create_link", f"{label} ({uid[:8]})", utils.get_client_ip(request))

    vless_uri = protocols.generate_protocol_link(
        protocol=protocol,
        uuid=uid,
        domain=domain,
        port=port,
        remark=f"MeyREN-{label}",
        fingerprint=fingerprint,
        alpn=alpn,
    )

    return {
        "uuid": uid,
        "name": label,
        "label": label,
        "protocol": protocol,
        "port": port,
        "limit_bytes": limit_bytes,
        "used_bytes": 0,
        "active": True,
        "created_at": created_at,
        "speed_limit_mbps": speed_mbps,
        "max_ips": max_ips,
        "expires_at": expires_at,
        "sub_token": sub_token,
        "group_id": group_id,
        "vless_link": vless_uri,
        "vless": vless_uri,
        "sub_url": f"https://{domain}/sub/{sub_token}",
        "sub": f"https://{domain}/sub/{sub_token}",
        "client_portal_url": f"https://{domain}/client/{sub_token}",
    }


@app.post("/api/links/auto_create")
async def auto_create_link(request: Request, sess=Depends(auth.require_permission("manage_users"))):
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    name = "".join(secrets.choice(alphabet) for _ in range(9))
    if name[0].isdigit():
        name = "m" + name[1:]
    
    uid = utils.generate_uuid(CONFIG["secret"], name)
    created_at = datetime.now().isoformat()
    sub_token = secrets.token_urlsafe(16)
    domain = utils.get_domain()
    
    # 30 days default, unlimited quota
    expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
    
    db.add_link(
        uuid=uid,
        label=name,
        limit_bytes=0,
        used_bytes=0,
        active=True,
        created_at=created_at,
        speed_limit_mbps=0.0,
        max_ips=0,
        expires_at=expires_at,
        sub_token=sub_token,
        group_id=1,
        protocol="vless-ws",
        port=443,
        fingerprint="chrome",
        config_count=1,
    )
    
    vless_uri = protocols.generate_protocol_link(
        protocol="vless-ws",
        uuid=uid,
        domain=domain,
        port=443,
        remark=f"MeyREN-{name}",
    )
    
    db.add_audit_log(sess.get("username", "admin"), "auto_create_link", f"{name} ({uid[:8]})", utils.get_client_ip(request))
    return {
        "ok": True,
        "uuid": uid,
        "name": name,
        "vless": vless_uri,
        "vless_link": vless_uri,
        "sub": f"https://{domain}/sub/{sub_token}",
        "sub_url": f"https://{domain}/sub/{sub_token}",
    }


@app.get("/api/links")
async def list_links(_=Depends(auth.require_auth)):
    all_links = db.get_links()
    domain = utils.get_domain()
    result = []
    for data in all_links:
        d = dict(data)
        d["active"] = bool(d.get("active", 1))
        proto = d.get("protocol") or "vless-ws"
        d["protocol"] = proto
        d["port"] = int(d.get("port") or 443)
        d["vless_link"] = protocols.generate_protocol_link(
            protocol=proto,
            uuid=d["uuid"],
            domain=domain,
            port=d["port"],
            remark=f"MeyREN-{d['label']}",
            fingerprint=d.get("fingerprint"),
            alpn=d.get("alpn"),
        )
        tok = d.get("sub_token") or d["uuid"]
        d["sub_url"] = f"https://{domain}/sub/{tok}"
        d["client_portal_url"] = f"https://{domain}/client/{tok}"
        active_ips = list(limiter.get_active_ips_for_uuid(d["uuid"]))
        d["active_ips"] = active_ips
        d["connected_ips"] = len(active_ips)
        d["config_count"] = int(d.get("config_count") or 1)
        result.append(d)
    
    result.sort(key=lambda x: (x.get("sort_order", 0), x.get("created_at", "")), reverse=True)
    return {"links": result}


@app.post("/api/links/bulk")
async def bulk_links_action(request: Request, sess=Depends(auth.require_permission("manage_users"))):
    body = await request.json()
    action = body.get("action")
    uids = body.get("uids") or []
    if not isinstance(uids, list):
        raise HTTPException(status_code=400, detail="uids must be a list")
    
    count = 0
    for uid in uids:
        if action == "enable":
            db.update_link(uuid=uid, active=True)
            count += 1
        elif action == "disable":
            db.update_link(uuid=uid, active=False)
            count += 1
        elif action == "reset":
            db.update_link(uuid=uid, reset_usage=True)
            limiter.reset_throttle(uid)
            count += 1
        elif action == "delete":
            db.delete_link(uid)
            limiter.reset_throttle(uid)
            count += 1

    db.add_audit_log(sess.get("username", "admin"), f"bulk_{action}", f"{count} links", utils.get_client_ip(request))
    return {"ok": True, "count": count}


@app.get("/api/connections")
async def get_connections_endpoint(_=Depends(auth.require_auth)):
    return {
        "count": limiter.get_active_connections_count(),
        "connections": limiter.get_connections_summary(),
    }


@app.get("/api/backup/download")
async def download_backup_endpoint(type: str = "users", sess=Depends(auth.require_permission("all"))):
    if type == "bot":
        bot_cfg = db.get_setting("telegram_bot") or "{}"
        return Response(content=bot_cfg, media_type="application/json", headers={"Content-Disposition": "attachment; filename=meyren_bot_backup.json"})
    
    users = db.get_links()
    backup_data = {
        "version": "2.0",
        "exported_at": datetime.utcnow().isoformat(),
        "links": users,
    }
    return Response(
        content=json.dumps(backup_data, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=meyren_users_backup.json"}
    )


@app.post("/api/backup/restore")
async def restore_backup_endpoint(request: Request, sess=Depends(auth.require_permission("all"))):
    body = await request.json()
    mode = body.get("mode", "merge")
    raw_links = body.get("links") or []
    
    if mode == "replace":
        for old in db.get_links():
            db.delete_link(old["uuid"])
            
    restored = 0
    for l in raw_links:
        uid = l.get("uuid")
        if not uid:
            continue
        if db.get_link(uid):
            db.update_link(
                uuid=uid,
                label=l.get("label"),
                limit_bytes=l.get("limit_bytes"),
                active=bool(l.get("active", 1)),
                speed_limit_mbps=l.get("speed_limit_mbps"),
                max_ips=l.get("max_ips"),
                expires_at=l.get("expires_at"),
                protocol=l.get("protocol"),
                port=l.get("port"),
            )
        else:
            db.add_link(
                uuid=uid,
                label=l.get("label") or "Restored",
                limit_bytes=int(l.get("limit_bytes") or 0),
                used_bytes=int(l.get("used_bytes") or 0),
                active=bool(l.get("active", 1)),
                created_at=l.get("created_at") or datetime.now().isoformat(),
                speed_limit_mbps=float(l.get("speed_limit_mbps") or 0.0),
                max_ips=int(l.get("max_ips") or 0),
                expires_at=l.get("expires_at"),
                sub_token=l.get("sub_token"),
                group_id=int(l.get("group_id") or 1),
                protocol=l.get("protocol") or "vless-ws",
                port=int(l.get("port") or 443),
                fingerprint=l.get("fingerprint") or "chrome",
            )
        restored += 1
        
    db.add_audit_log(sess.get("username", "admin"), "restore_backup", f"{restored} links ({mode})", utils.get_client_ip(request))
    return {"ok": True, "restored": restored}


@app.patch("/api/links/{uid}")
async def update_link_endpoint(uid: str, request: Request, sess=Depends(auth.require_permission("manage_users"))):
    body = await request.json()
    if not db.get_link(uid):
        raise HTTPException(status_code=404, detail="link not found")

    limit_bytes = None
    if "limit_value" in body:
        limit_bytes = utils.parse_size_to_bytes(float(body.get("limit_value", 0)), body.get("limit_unit", "GB"))
    elif "limit_bytes" in body:
        limit_bytes = int(body.get("limit_bytes") or 0)

    expires_at = ...
    if "days" in body:
        days = body.get("days")
        if days and str(days).isdigit() and int(days) > 0:
            expires_at = (datetime.utcnow() + timedelta(days=int(days))).isoformat()
        else:
            expires_at = None
    elif "expires_at" in body:
        expires_at = body.get("expires_at")

    db.update_link(
        uuid=uid,
        active=body.get("active"),
        limit_bytes=limit_bytes,
        reset_usage=body.get("reset_usage", False),
        label=str(body["label"])[:60] if "label" in body else None,
        speed_limit_mbps=float(body["speed_limit_mbps"]) if "speed_limit_mbps" in body else None,
        max_ips=int(body["max_ips"]) if "max_ips" in body else None,
        expires_at=expires_at,
        group_id=int(body["group_id"]) if "group_id" in body else None,
        protocol=body.get("protocol"),
        port=body.get("port"),
        fingerprint=body.get("fingerprint"),
        alpn=body.get("alpn"),
        note=body.get("note"),
        config_count=body.get("config_count"),
        sort_order=body.get("sort_order"),
    )

    if body.get("reset_usage"):
        limiter.reset_throttle(uid)

    db.add_audit_log(sess.get("username", "admin"), "update_link", uid[:8], utils.get_client_ip(request))
    return {"ok": True}


@app.post("/api/links/{uid}/topup")
async def topup_link(uid: str, request: Request, sess=Depends(auth.require_permission("manage_users"))):
    body = await request.json()
    add_gb = float(body.get("gb") or 1.0)
    add_bytes = int(add_gb * 1024 * 1024 * 1024)
    link = db.get_link(uid)
    if not link:
        raise HTTPException(status_code=404, detail="link not found")
    new_limit = max(0, link.get("limit_bytes", 0) + add_bytes)
    db.update_link(uuid=uid, active=True, limit_bytes=new_limit)
    db.add_audit_log(sess.get("username", "admin"), "topup_link", f"{uid[:8]} (+{add_gb}GB)", utils.get_client_ip(request))
    return {"ok": True, "new_limit_bytes": new_limit}


@app.delete("/api/links/{uid}")
async def delete_link_endpoint(uid: str, request: Request, sess=Depends(auth.require_permission("manage_users"))):
    db.delete_link(uid)
    limiter.reset_throttle(uid)
    db.add_audit_log(sess.get("username", "admin"), "delete_link", uid[:8], utils.get_client_ip(request))
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Categories / Groups Management
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/categories")
async def list_categories(_=Depends(auth.require_auth)):
    return {"categories": db.get_categories()}


@app.post("/api/categories")
async def create_category(request: Request, sess=Depends(auth.require_permission("manage_users"))):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    desc = (body.get("description") or "").strip()
    cat_id = db.add_category(name, desc)
    db.add_audit_log(sess.get("username", "admin"), "create_category", name, utils.get_client_ip(request))
    return {"ok": True, "id": cat_id, "name": name, "description": desc}


@app.delete("/api/categories/{cat_id}")
async def delete_category_endpoint(cat_id: int, request: Request, sess=Depends(auth.require_permission("manage_users"))):
    try:
        db.delete_category(cat_id)
        db.add_audit_log(sess.get("username", "admin"), "delete_category", str(cat_id), utils.get_client_ip(request))
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# Multi-Admin RBAC Management
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/admins")
async def list_admins(_=Depends(auth.require_permission("manage_admins"))):
    return {"admins": db.get_admins()}


@app.post("/api/admins")
async def create_admin(request: Request, sess=Depends(auth.require_permission("manage_admins"))):
    body = await request.json()
    username = (body.get("username") or "").strip()
    password = str(body.get("password") or "")
    role = body.get("role") or "admin"
    permissions = body.get("permissions") or ["manage_users", "view_stats"]

    if not username or len(password) < 4:
        raise HTTPException(status_code=400, detail="Invalid username or password too short")

    if db.get_admin_by_username(username):
        raise HTTPException(status_code=400, detail="Username already exists")

    pw_hash = hash_password(password)
    admin_id = db.add_admin(username, pw_hash, role, permissions)
    db.add_audit_log(sess.get("username", "admin"), "create_admin", username, utils.get_client_ip(request))
    return {"ok": True, "id": admin_id, "username": username, "role": role}


@app.patch("/api/admins/{admin_id}")
async def update_admin_endpoint(admin_id: int, request: Request, sess=Depends(auth.require_permission("manage_admins"))):
    body = await request.json()
    pw_hash = hash_password(body["password"]) if body.get("password") else None
    db.update_admin(
        admin_id=admin_id,
        password_hash=pw_hash,
        role=body.get("role"),
        permissions=body.get("permissions"),
        is_active=body.get("is_active"),
    )
    db.add_audit_log(sess.get("username", "admin"), "update_admin", str(admin_id), utils.get_client_ip(request))
    return {"ok": True}


@app.delete("/api/admins/{admin_id}")
async def delete_admin_endpoint(admin_id: int, request: Request, sess=Depends(auth.require_permission("manage_admins"))):
    try:
        db.delete_admin(admin_id)
        db.add_audit_log(sess.get("username", "admin"), "delete_admin", str(admin_id), utils.get_client_ip(request))
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# Announcements & News
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/announcements")
async def list_announcements(_=Depends(auth.require_auth)):
    return {"announcements": db.get_announcements(active_only=False)}


@app.post("/api/announcements")
async def create_announcement(request: Request, sess=Depends(auth.require_permission("manage_users"))):
    body = await request.json()
    title = (body.get("title") or "").strip()
    content = (body.get("content") or "").strip()
    level = body.get("level") or "info"
    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and content are required")
    ann_id = db.add_announcement(title, content, level)
    db.add_audit_log(sess.get("username", "admin"), "create_announcement", title, utils.get_client_ip(request))
    return {"ok": True, "id": ann_id}


@app.patch("/api/announcements/{ann_id}")
async def toggle_announcement_endpoint(ann_id: int, request: Request, sess=Depends(auth.require_permission("manage_users"))):
    body = await request.json()
    db.toggle_announcement(ann_id, bool(body.get("is_active", True)))
    return {"ok": True}


@app.delete("/api/announcements/{ann_id}")
async def delete_announcement_endpoint(ann_id: int, request: Request, sess=Depends(auth.require_permission("manage_users"))):
    db.delete_announcement(ann_id)
    db.add_audit_log(sess.get("username", "admin"), "delete_announcement", str(ann_id), utils.get_client_ip(request))
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Audit Logs & Network Tools
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/audit-logs")
async def list_audit_logs(_=Depends(auth.require_permission("view_logs"))):
    return {"logs": db.get_audit_logs(limit=150)}


@app.get("/api/tools/clean-ips")
async def test_clean_ips(_=Depends(auth.require_auth)):
    results = await tester.benchmark_clean_ips()
    return {"clean_ips": results}


@app.post("/api/tools/ping")
async def ping_host(request: Request, _=Depends(auth.require_auth)):
    body = await request.json()
    host = body.get("host") or utils.get_domain()
    port = int(body.get("port") or 443)
    res = await tester.test_tcp_latency(host, port)
    return res


@app.get("/manifest.json")
async def get_manifest():
    return FileResponse("static/manifest.json", media_type="application/manifest+json")


# ══════════════════════════════════════════════════════════════════════════════
# VLESS WebSocket Relay Loop
# ══════════════════════════════════════════════════════════════════════════════

async def ws_to_tcp(websocket: WebSocket, writer: asyncio.StreamWriter, conn_id: str, link_uid: str):
    try:
        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.disconnect":
                break
            data = msg.get("bytes") or (msg.get("text") or "").encode()
            if not data:
                continue
            size = len(data)
            if not db.check_quota_fast(link_uid, size):
                await websocket.close(code=1008, reason="quota exceeded")
                break
            # Rate limiting
            await limiter.throttle(link_uid, size)
            stats["total_bytes"] += size
            stats["total_requests"] += 1
            hourly_traffic[datetime.now().strftime("%H:00")] += size
            db.add_usage_buffered(link_uid, size)
            writer.write(data)
            await writer.drain()
    except (WebSocketDisconnect, ConnectionResetError, BrokenPipeError):
        pass
    except Exception:
        pass
    finally:
        try:
            writer.write_eof()
        except Exception:
            pass


async def tcp_to_ws(websocket: WebSocket, reader: asyncio.StreamReader, conn_id: str, link_uid: str):
    first = True
    try:
        while True:
            data = await reader.read(RELAY_BUF)
            if not data:
                break
            size = len(data)
            if not db.check_quota_fast(link_uid, size):
                await websocket.close(code=1008, reason="quota exceeded")
                break
            # Rate limiting
            await limiter.throttle(link_uid, size)
            stats["total_bytes"] += size
            hourly_traffic[datetime.now().strftime("%H:00")] += size
            db.add_usage_buffered(link_uid, size)
            await websocket.send_bytes((b"\x00\x00" + data) if first else data)
            first = False
    except (WebSocketDisconnect, ConnectionResetError, BrokenPipeError):
        pass
    except Exception:
        pass


@app.websocket("/ws/{uuid}")
async def websocket_tunnel(websocket: WebSocket, uuid: str):
    await ensure_default_link()
    await websocket.accept()

    client_ip = utils.get_client_ip(websocket)
    # Check concurrent IP gate
    if not limiter.is_ip_allowed(uuid, client_ip):
        await websocket.close(code=1008, reason="concurrent IP limit reached")
        return

    # Check quota & active status
    if not db.check_quota_fast(uuid, 0):
        await websocket.close(code=1008, reason="quota exceeded or link inactive")
        return

    conn_id = secrets.token_urlsafe(8)
    limiter.register_connection(conn_id, uuid, client_ip, transport="ws")
    writer = None

    try:
        first_msg = await asyncio.wait_for(websocket.receive(), timeout=15.0)
        if first_msg["type"] == "websocket.disconnect":
            return
        first_chunk = first_msg.get("bytes") or (first_msg.get("text") or "").encode()
        if not first_chunk:
            return
        command, address, port, initial_payload = await utils.parse_vless_header(first_chunk)
        size = len(first_chunk)
        await limiter.throttle(uuid, size)
        stats["total_bytes"] += size
        stats["total_requests"] += 1
        hourly_traffic[datetime.now().strftime("%H:00")] += size
        db.add_usage_buffered(uuid, size)

        reader, writer = await asyncio.wait_for(asyncio.open_connection(address, port), timeout=10.0)
        if initial_payload:
            p_size = len(initial_payload)
            await limiter.throttle(uuid, p_size)
            stats["total_bytes"] += p_size
            hourly_traffic[datetime.now().strftime("%H:00")] += p_size
            db.add_usage_buffered(uuid, p_size)
            writer.write(initial_payload)
            await writer.drain()

        task_up = asyncio.create_task(ws_to_tcp(websocket, writer, conn_id, uuid))
        task_down = asyncio.create_task(tcp_to_ws(websocket, reader, conn_id, uuid))
        done, pending = await asyncio.wait({task_up, task_down}, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        stats["total_errors"] += 1
        error_logs.append({"error": str(exc), "time": datetime.now().isoformat()})
    finally:
        if writer:
            try:
                writer.close()
                await asyncio.wait_for(writer.wait_closed(), timeout=2.0)
            except Exception:
                pass
        limiter.unregister_connection(conn_id)


# ══════════════════════════════════════════════════════════════════════════════
# HTML UI Pages
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    token = request.cookies.get(auth.SESSION_COOKIE)
    if await auth.is_valid_session(token):
        return RedirectResponse(url="/dashboard")
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    token = request.cookies.get(auth.SESSION_COOKIE)
    if not await auth.is_valid_session(token):
        return RedirectResponse(url="/login")
    sess = await auth.get_session(token)
    return templates.TemplateResponse("dashboard.html", {"request": request, "admin": sess})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=CONFIG["port"])
