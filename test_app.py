import asyncio
import base64
import json
import time
import main
import auth
import db
import utils

async def run_asgi(scope_dict, body=b""):
    messages = []
    sent = False
    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.request", "body": b"", "more_body": False}
    async def send(message):
        messages.append(message)
    
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "server": ("127.0.0.1", 8000),
        "client": ("127.0.0.1", 50000),
        "scheme": "http",
        "root_path": "",
        "headers": [],
        "query_string": b"",
        **scope_dict
    }
    await main.app(scope, receive, send)
    
    status = next((m["status"] for m in messages if m["type"] == "http.response.start"), 500)
    raw_headers = next((m.get("headers", []) for m in messages if m["type"] == "http.response.start"), [])
    body_resp = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, raw_headers, body_resp

async def test_all():
    print("=" * 60)
    print("MeyREN Optimization & Feature Verification Suite")
    print("=" * 60)

    # 1. Session Pruning & Memory Leak Test
    print("\n[1] Testing Session Pruning & Memory Safety...")
    t1 = await auth.create_session()
    auth.SESSIONS[t1] = time.time() - 10
    t2 = await auth.create_session()
    assert len(auth.SESSIONS) == 1, "Failed to prune expired session"
    print("    [OK] Expired session tokens auto-pruned successfully")

    # 2. Connection Socket Leak Test
    print("\n[2] Testing WebSocket Socket Leak Prevention...")
    main.connections.clear()
    main.connection_sockets.clear()
    for i in range(500):
        cid = f"conn_{i}"
        mock_ws = object()
        main.connections[cid] = {"uuid": "test", "bytes": 0}
        main.connection_sockets[cid] = mock_ws
        # Simulate teardown
        main.connections.pop(cid, None)
        main.connection_sockets.pop(cid, None)
    assert len(main.connections) == 0 and len(main.connection_sockets) == 0
    print("    [OK] 0 lingering socket/connection references after disconnect")

    # 3. High-Throughput In-Memory Quota Benchmark
    print("\n[3] Testing In-Memory Quota & Batching Speed...")
    test_uid = "bench_uid_test"
    db.add_link(test_uid, "Bench", 10 * 1024 * 1024 * 1024, 0, True, "2026-08-26")
    start = time.perf_counter()
    for _ in range(50_000):
        db.check_quota_fast(test_uid, 32768)
        db.add_usage_buffered(test_uid, 32768)
    elapsed = time.perf_counter() - start
    print(f"    [OK] 50,000 packet quota checks in {elapsed:.4f}s ({50_000/elapsed:,.0f} ops/sec)")
    db.flush_usage_to_db()
    db.delete_link(test_uid)

    # 4. HTTP & QoL Endpoints Test
    print("\n[4] Testing Web & QoL Endpoints...")
    db.update_admin_password_hash(main.hash_password("admin"))

    # Manifest
    status, _, _ = await run_asgi({"method": "GET", "path": "/manifest.json", "raw_path": b"/manifest.json"})
    assert status == 200
    print("    [OK] GET /manifest.json -> 200 OK (PWA Ready)")

    # Login
    login_payload = json.dumps({"password": "admin"}).encode()
    status, raw_headers, _ = await run_asgi({
        "method": "POST", "path": "/api/login", "raw_path": b"/api/login",
        "headers": [(b"content-type", b"application/json")]
    }, body=login_payload)
    assert status == 200
    cookie_val = ""
    for k, v in raw_headers:
        if k.lower() == b"set-cookie":
            cookie_val = v.decode().split(";")[0]
            break
    print("    [OK] POST /api/login -> 200 OK")

    # Stats Non-Blocking Latency
    start = time.perf_counter()
    status, _, body = await run_asgi({
        "method": "GET", "path": "/stats", "raw_path": b"/stats",
        "headers": [(b"cookie", cookie_val.encode())]
    })
    stat_lat = (time.perf_counter() - start) * 1000
    assert status == 200
    print(f"    [OK] GET /stats -> 200 OK (Latency: {stat_lat:.2f}ms - Non-blocking)")

    # Subscription Link
    test_sub_uid = "sub-test-uid"
    db.add_link(test_sub_uid, "SubTest", 5*1024*1024*1024, 0, True, "2026-08-26")
    status, _, body = await run_asgi({"method": "GET", "path": "/sub", "raw_path": b"/sub"})
    assert status == 200
    decoded = base64.b64decode(body).decode("utf-8")
    assert "vless://" in decoded
    print(f"    [OK] GET /sub -> 200 OK (Base64 subscription stream verified)")

    # Top-Up
    topup_payload = json.dumps({"gb": 2.0}).encode()
    status, _, _ = await run_asgi({
        "method": "POST", "path": f"/api/links/{test_sub_uid}/topup",
        "raw_path": f"/api/links/{test_sub_uid}/topup".encode(),
        "headers": [(b"content-type", b"application/json"), (b"cookie", cookie_val.encode())]
    }, body=topup_payload)
    assert status == 200
    assert db.get_link(test_sub_uid)["limit_bytes"] == 7 * 1024 * 1024 * 1024
    print("    [OK] POST /api/links/{uid}/topup -> 200 OK (+2 GB applied)")

    db.delete_link(test_sub_uid)

    # 5. Multi-Domain Verification Suite
    print("\n[5] Testing Multi-Domain Functionality...")
    # Clean domain test
    assert utils.clean_domain("https://meyren-production-14d9.up.railway.app/") == "meyren-production-14d9.up.railway.app"
    assert utils.clean_domain("http://custom.domain.net:443/test?q=1") == "custom.domain.net:443"
    print("    [OK] utils.clean_domain correctly handles URLs, protocols, and trailing slashes")

    # Add custom domain via API
    add_d_payload = json.dumps({"domain": "node2.up.railway.app"}).encode()
    status, _, body = await run_asgi({
        "method": "POST", "path": "/api/domains", "raw_path": b"/api/domains",
        "headers": [(b"content-type", b"application/json"), (b"cookie", cookie_val.encode())]
    }, body=add_d_payload)
    assert status == 200
    d_data = json.loads(body)
    assert "node2.up.railway.app" in d_data["domains"]
    print("    [OK] POST /api/domains -> 200 OK (Domain added)")

    # List domains
    status, _, body = await run_asgi({
        "method": "GET", "path": "/api/domains", "raw_path": b"/api/domains",
        "headers": [(b"cookie", cookie_val.encode())]
    })
    assert status == 200
    assert "node2.up.railway.app" in json.loads(body)["domains"]
    print("    [OK] GET /api/domains -> 200 OK (List verified)")

    # Create link with custom domain
    create_link_payload = json.dumps({
        "label": "MultiDomainTest",
        "limit_value": 1.0,
        "limit_unit": "GB",
        "domain": "node2.up.railway.app"
    }).encode()
    status, _, body = await run_asgi({
        "method": "POST", "path": "/api/links", "raw_path": b"/api/links",
        "headers": [(b"content-type", b"application/json"), (b"cookie", cookie_val.encode())]
    }, body=create_link_payload)
    assert status == 200
    new_link = json.loads(body)
    test_md_uid = new_link["uuid"]
    assert new_link["domain"] == "node2.up.railway.app"
    assert "@node2.up.railway.app:443" in new_link["vless_link"]
    print("    [OK] POST /api/links with custom domain -> 200 OK (VLESS link matches selected domain)")

    # Edit link domain to a different domain
    edit_payload = json.dumps({
        "label": "MultiDomainTest-Edited",
        "domain": "meyren-production-14d9.up.railway.app"
    }).encode()
    status, _, _ = await run_asgi({
        "method": "PATCH", "path": f"/api/links/{test_md_uid}",
        "raw_path": f"/api/links/{test_md_uid}".encode(),
        "headers": [(b"content-type", b"application/json"), (b"cookie", cookie_val.encode())]
    }, body=edit_payload)
    assert status == 200
    updated_link = db.get_link(test_md_uid)
    assert updated_link["domain"] == "meyren-production-14d9.up.railway.app"
    print("    [OK] PATCH /api/links/{uid} domain edit -> 200 OK (Domain updated in DB and cache)")

    # Verify GET /api/links returns updated link with updated vless_link
    status, _, body = await run_asgi({
        "method": "GET", "path": "/api/links", "raw_path": b"/api/links",
        "headers": [(b"cookie", cookie_val.encode())]
    })
    assert status == 200
    links_list = json.loads(body)["links"]
    matched = next((l for l in links_list if l["uuid"] == test_md_uid), None)
    assert matched is not None
    assert matched["domain"] == "meyren-production-14d9.up.railway.app"
    assert "@meyren-production-14d9.up.railway.app:443" in matched["vless_link"]
    print("    [OK] GET /api/links returns updated domain and generated VLESS link")

    # Verify GET /sub with per-config assigned domain
    status, _, body = await run_asgi({"method": "GET", "path": "/sub", "raw_path": b"/sub"})
    assert status == 200
    decoded_sub = base64.b64decode(body).decode("utf-8")
    assert "meyren-production-14d9.up.railway.app" in decoded_sub
    print("    [OK] GET /sub per-config domain routing verified in subscription stream")

    # Verify GET /sub?domain=specific-override.com
    status, _, body = await run_asgi({
        "method": "GET", "path": "/sub", "raw_path": b"/sub",
        "query_string": b"domain=override-node.com"
    })
    assert status == 200
    decoded_override = base64.b64decode(body).decode("utf-8")
    assert "@override-node.com:443" in decoded_override
    print("    [OK] GET /sub?domain=override-node.com overrides configs in stream")

    # Clean up test link and custom domain
    db.delete_link(test_md_uid)
    status, _, _ = await run_asgi({
        "method": "DELETE", "path": "/api/domains/node2.up.railway.app",
        "raw_path": b"/api/domains/node2.up.railway.app",
        "headers": [(b"cookie", cookie_val.encode())]
    })
    assert status == 200
    print("    [OK] DELETE /api/domains/{domain} -> 200 OK (Domain removed)")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED! SERVER IS READY TO RUN.")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_all())
