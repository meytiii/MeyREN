import asyncio
import json
import os
import hashlib
import secrets
import time
from datetime import datetime
import db
import utils
import auth
from urllib.parse import quote
from collections import deque, defaultdict
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import Response, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import httpx
import logging
import psutil

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("REN-Gateway")

app = FastAPI(title="REN", docs_url=None, redoc_url=None)

CONFIG = {
    "port": int(os.environ.get("PORT", 8000)),
    "secret": os.environ.get("SECRET_KEY", secrets.token_urlsafe(32)),
}

db.init_db(CONFIG["secret"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

templates = Jinja2Templates(directory="templates")

connections: dict = {}
connection_sockets: dict = {}
stats = {"total_bytes": 0, "total_requests": 0, "total_errors": 0, "start_time": time.time()}
error_logs: deque = deque(maxlen=50)
hourly_traffic: dict = defaultdict(int)
http_client: httpx.AsyncClient | None = None

def hash_password(pw: str) -> str:
    return hashlib.sha256(f"{pw}{CONFIG['secret']}".encode()).hexdigest()

async def keep_alive():
    while True:
        await asyncio.sleep(600)
        try:
            domain = utils.get_domain()
            if domain and domain != "localhost":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.get(f"https://{domain}/health")
                logger.info("Keep-alive ping sent")
        except Exception:
            pass

async def telegram_bot_polling():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token or token == "your_bot_token_here":
        logger.info("Telegram bot token not configured. Bot is disabled.")
        return

    url = f"https://api.telegram.org/bot{token}"
    offset = None
    
    await asyncio.sleep(5)

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            try:
                req_url = f"{url}/getUpdates?timeout=20"
                if offset:
                    req_url += f"&offset={offset}"
                
                response = await client.get(req_url)
                if response.status_code != 200:
                    await asyncio.sleep(5)
                    continue

                data = response.json()
                if not data.get("ok"):
                    await asyncio.sleep(5)
                    continue

                for result in data.get("result", []):
                    offset = result["update_id"] + 1
                    message = result.get("message", {})
                    chat_id = message.get("chat", {}).get("id")
                    text = message.get("text", "")

                    if chat_id and text:
                        if text.startswith("/start"):
                            await client.post(f"{url}/sendMessage", json={
                                "chat_id": chat_id,
                                "text": "سلام! لینک VLESS خود را بفرستید تا حجم باقی‌مانده را به شما بگویم."
                            })
                        else:
                            uuid = utils.extract_uuid_from_link(text)
                            if not uuid:
                                await client.post(f"{url}/sendMessage", json={
                                    "chat_id": chat_id,
                                    "text": "لینک نامعتبر است. لطفاً یک لینک VLESS صحیح ارسال کنید."
                                })
                                continue
                            
                            link_data = db.get_link(uuid)
                            if not link_data:
                                await client.post(f"{url}/sendMessage", json={
                                    "chat_id": chat_id,
                                    "text": "این لینک در سیستم یافت نشد یا حذف شده است."
                                })
                                continue

                            reply_text = utils.format_bot_reply(
                                label=link_data["label"],
                                used=link_data["used_bytes"],
                                limit=link_data["limit_bytes"],
                                active=bool(link_data["active"])
                            )
                            await client.post(f"{url}/sendMessage", json={
                                "chat_id": chat_id,
                                "text": reply_text
                            })
            except Exception as e:
                logger.error(f"Telegram Bot Error: {e}")
                await asyncio.sleep(5)

@app.on_event("startup")
async def startup():
    global http_client
    limits = httpx.Limits(max_connections=500, max_keepalive_connections=100)
    timeout = httpx.Timeout(30.0, connect=10.0)
    http_client = httpx.AsyncClient(limits=limits, timeout=timeout, follow_redirects=True)
    logger.info(f"MeyREN started on port {CONFIG['port']}")
    asyncio.create_task(keep_alive())
    asyncio.create_task(telegram_bot_polling())

@app.on_event("shutdown")
async def shutdown():
    if http_client:
        await http_client.aclose()

async def ensure_default_link():
    links = db.get_links()
    if not links:
        uid = utils.generate_uuid(CONFIG["secret"], "default")
        db.add_link(uid, "Default", 0, 0, True, datetime.now().isoformat())

async def close_connections_for_link(uid: str):
    to_close = [cid for cid, info in connections.items() if info.get("uuid") == uid]
    for cid in to_close:
        ws = connection_sockets.get(cid)
        if ws:
            try:
                await ws.close(code=1000, reason="link deleted")
            except Exception:
                pass
        connections.pop(cid, None)
        connection_sockets.pop(cid, None)

@app.get("/")
async def root():
    return {"service": "MeyREN", "version": "1.0", "status": "active", "domain": utils.get_domain()}

@app.get("/health")
async def health():
    return {"status": "ok", "connections": len(connections), "uptime": utils.uptime(stats["start_time"])}

@app.post("/api/login")
async def api_login(request: Request):
    body = await request.json()
    password = str(body.get("password") or "")
    if hash_password(password) != db.get_admin_password_hash():
        raise HTTPException(status_code=401, detail="Invalid password")
    token = await auth.create_session()
    resp = JSONResponse({"ok": True})
    resp.set_cookie(key=auth.SESSION_COOKIE, value=token, max_age=auth.SESSION_TTL, httponly=True, samesite="lax", path="/")
    return resp

@app.post("/api/logout")
async def api_logout(request: Request):
    token = request.cookies.get(auth.SESSION_COOKIE)
    await auth.destroy_session(token)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(auth.SESSION_COOKIE, path="/")
    return resp

@app.get("/api/me")
async def api_me(request: Request):
    token = request.cookies.get(auth.SESSION_COOKIE)
    return {"authenticated": await auth.is_valid_session(token)}

@app.post("/api/change-password")
async def api_change_password(request: Request, _=Depends(auth.require_auth)):
    body = await request.json()
    current = str(body.get("current_password") or "")
    new = str(body.get("new_password") or "")
    if hash_password(current) != db.get_admin_password_hash():
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(new) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    
    db.update_admin_password_hash(hash_password(new))
    current_token = request.cookies.get(auth.SESSION_COOKIE)
    await auth.clear_other_sessions(current_token)
    return {"ok": True}

@app.get("/stats")
async def get_stats(_=Depends(auth.require_auth)):
    all_links = db.get_links()
    return {
        "active_connections": len(connections),
        "total_traffic_mb": round(stats["total_bytes"] / (1024 * 1024), 2),
        "total_requests": stats["total_requests"],
        "total_errors": stats["total_errors"],
        "uptime": utils.uptime(stats["start_time"]),
        "timestamp": datetime.now().isoformat(),
        "recent_errors": list(error_logs)[-10:],
        "links_count": len(all_links),
        "domain": utils.get_domain(),
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "memory_percent": psutil.virtual_memory().percent,
        "hourly_traffic": dict(hourly_traffic),
    }

@app.post("/api/links")
async def create_link(request: Request, _=Depends(auth.require_auth)):
    body = await request.json()
    label = (body.get("label") or "New Link").strip()[:60]
    limit_value = float(body.get("limit_value") or 0)
    limit_unit = body.get("limit_unit") or "GB"
    limit_bytes = 0 if limit_value <= 0 else utils.parse_size_to_bytes(limit_value, limit_unit)
    uid = utils.generate_uuid(CONFIG["secret"], label)
    created_at = datetime.now().isoformat()
    
    db.add_link(uid, label, limit_bytes, 0, True, created_at)
    
    return {"uuid": uid, "label": label, "limit_bytes": limit_bytes, "used_bytes": 0, "active": True, "created_at": created_at, "vless_link": utils.generate_vless_link(uid, utils.get_domain(), remark=f"MeyREN-{label}")}

@app.get("/api/links")
async def list_links(_=Depends(auth.require_auth)):
    all_links = db.get_links()
    result = []
    for data in all_links:
        data["active"] = bool(data["active"]) 
        data["vless_link"] = utils.generate_vless_link(data["uuid"], utils.get_domain(), remark=f"MeyREN-{data['label']}")
        result.append(data)
    
    result.sort(key=lambda x: x["created_at"], reverse=True)
    return {"links": result}

@app.patch("/api/links/{uid}")
async def toggle_link(uid: str, request: Request, _=Depends(auth.require_auth)):
    body = await request.json()
    if not db.get_link(uid):
        raise HTTPException(status_code=404, detail="link not found")
        
    db.update_link(
        uuid=uid,
        active=body.get("active"),
        limit_bytes=utils.parse_size_to_bytes(float(body.get("limit_value", 0)), body.get("limit_unit", "GB")) if "limit_value" in body else None,
        reset_usage=body.get("reset_usage", False),
        label=str(body["label"])[:60] if "label" in body else None
    )
    return {"ok": True}

@app.delete("/api/links/{uid}")
async def delete_link(uid: str, _=Depends(auth.require_auth)):
    db.delete_link(uid)
    await close_connections_for_link(uid)
    return {"ok": True}

RELAY_BUF = 64 * 1024

async def check_quota(uid: str, extra_bytes: int) -> bool:
    link = db.get_link(uid)
    if link is None: return False
    if not link["active"]: return False
    if link["limit_bytes"] == 0: return True
    return (link["used_bytes"] + extra_bytes) <= link["limit_bytes"]

async def add_usage(uid: str, n: int):
    db.add_usage(uid, n)

async def ws_to_tcp(websocket: WebSocket, writer: asyncio.StreamWriter, conn_id: str, link_uid: str):
    try:
        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.disconnect": break
            data = msg.get("bytes") or (msg.get("text") or "").encode()
            if not data: continue
            size = len(data)
            if not await check_quota(link_uid, size):
                await websocket.close(code=1008, reason="quota exceeded"); break
            stats["total_bytes"] += size; stats["total_requests"] += 1
            connections[conn_id]["bytes"] += size
            hourly_traffic[datetime.now().strftime("%H:00")] += size
            await add_usage(link_uid, size)
            writer.write(data); await writer.drain()
    except WebSocketDisconnect: pass
    finally:
        try: writer.write_eof()
        except: pass

async def tcp_to_ws(websocket: WebSocket, reader: asyncio.StreamReader, conn_id: str, link_uid: str):
    first = True
    try:
        while True:
            data = await reader.read(RELAY_BUF)
            if not data: break
            size = len(data)
            if not await check_quota(link_uid, size):
                await websocket.close(code=1008, reason="quota exceeded"); break
            stats["total_bytes"] += size
            connections[conn_id]["bytes"] += size
            hourly_traffic[datetime.now().strftime("%H:00")] += size
            await add_usage(link_uid, size)
            await websocket.send_bytes((b"\x00\x00" + data) if first else data)
            first = False
    except: pass

@app.websocket("/ws/{uuid}")
async def websocket_tunnel(websocket: WebSocket, uuid: str):
    await ensure_default_link()
    await websocket.accept()
    conn_id = secrets.token_urlsafe(8)
    connections[conn_id] = {"uuid": uuid, "connected_at": datetime.now().isoformat(), "bytes": 0}
    connection_sockets[conn_id] = websocket
    writer = None
    try:
        if not await check_quota(uuid, 0):
            await websocket.close(code=1008, reason="quota exceeded or link deleted"); return
        first_msg = await asyncio.wait_for(websocket.receive(), timeout=15.0)
        if first_msg["type"] == "websocket.disconnect": return
        first_chunk = first_msg.get("bytes") or (first_msg.get("text") or "").encode()
        if not first_chunk: return
        command, address, port, initial_payload = await utils.parse_vless_header(first_chunk)
        size = len(first_chunk)
        stats["total_bytes"] += size; stats["total_requests"] += 1
        connections[conn_id]["bytes"] += size
        hourly_traffic[datetime.now().strftime("%H:00")] += size
        await add_usage(uuid, size)
        reader, writer = await asyncio.wait_for(asyncio.open_connection(address, port), timeout=10.0)
        if initial_payload:
            p_size = len(initial_payload)
            stats["total_bytes"] += p_size
            connections[conn_id]["bytes"] += p_size
            hourly_traffic[datetime.now().strftime("%H:00")] += p_size
            await add_usage(uuid, p_size)
            writer.write(initial_payload); await writer.drain()
        task_up = asyncio.create_task(ws_to_tcp(websocket, writer, conn_id, uuid))
        task_down = asyncio.create_task(tcp_to_ws(websocket, reader, conn_id, uuid))
        done, pending = await asyncio.wait({task_up, task_down}, return_when=asyncio.FIRST_COMPLETED)
        for t in pending: t.cancel()
    except WebSocketDisconnect: pass
    except Exception as exc:
        stats["total_errors"] += 1
        error_logs.append({"error": str(exc), "time": datetime.now().isoformat()})
    finally:
        if writer:
            try: writer.close()
            except: pass
        connections.pop(conn_id, None)
        connection_sockets.pop(conn_id, None)

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
    return templates.TemplateResponse("dashboard.html", {"request": request})

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=CONFIG["port"])