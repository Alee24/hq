import os
import json
import time
import httpx
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.entities import (
    SystemSetting, Application, Server, ServerMetric, Domain, Alert, MonitoringResult, User
)
from backend.app.schemas.api_schemas import (
    AiProviderInfo, AiKeysConfigResponse, AiKeysConfigUpdate,
    AiKeysTestResponse, AiDiagnosticItem, AiDiagnosticResponse
)
from backend.app.services.monitoring_engine import execute_monitoring_cycle
from backend.app.services.audit import log_audit_event

def mask_key(key: Optional[str]) -> Optional[str]:
    if not key or len(key.strip()) < 8:
        return None
    k = key.strip()
    prefix = k[:6]
    suffix = k[-4:]
    return f"{prefix}...{suffix}"

AI_KEYS_MAP = {
    "gemini": {
        "setting_key": "ai_gemini_api_key",
        "env_var": "GEMINI_API_KEY",
        "model": "gemini-2.5-flash",
        "display_name": "Google Gemini",
        "description": "Google DeepMind's ultra-fast multimodal model (Gemini 2.5 Flash / 1.5 Flash)"
    },
    "openai": {
        "setting_key": "ai_openai_api_key",
        "env_var": "OPENAI_API_KEY",
        "model": "gpt-4o-mini",
        "display_name": "OpenAI GPT-4o",
        "description": "OpenAI's high-intelligence, cost-efficient GPT-4o-mini / GPT-4o models"
    },
    "deepseek": {
        "setting_key": "ai_deepseek_api_key",
        "env_var": "DEEPSEEK_API_KEY",
        "model": "deepseek-chat",
        "display_name": "DeepSeek V3",
        "description": "DeepSeek's advanced reasoning & coding model (OpenAI-compatible protocol)"
    },
    "anthropic": {
        "setting_key": "ai_anthropic_api_key",
        "env_var": "ANTHROPIC_API_KEY",
        "model": "claude-3-5-sonnet-20241022",
        "display_name": "Anthropic Claude",
        "description": "Anthropic's state-of-the-art coding and infrastructure diagnostic model (Claude 3.5 Sonnet)"
    }
}

async def get_raw_ai_key(db: AsyncSession, provider: str) -> Optional[str]:
    """Retrieves raw API key from database SystemSetting, falling back to process environment."""
    meta = AI_KEYS_MAP.get(provider.lower())
    if not meta:
        return None
    res = await db.execute(select(SystemSetting).where(SystemSetting.key == meta["setting_key"]))
    obj = res.scalar_one_or_none()
    if obj and obj.value and obj.value.strip():
        return obj.value.strip()
    env_val = os.getenv(meta["env_var"])
    if env_val and env_val.strip():
        return env_val.strip()
    return None

async def get_ai_keys_config(db: AsyncSession) -> AiKeysConfigResponse:
    """Returns the configuration state of all AI providers with safely masked keys."""
    res = await db.execute(select(SystemSetting))
    rows = res.scalars().all()
    s_map = {s.key: s.value for s in rows}
    
    preferred = s_map.get("ai_preferred_provider", "auto")
    providers: Dict[str, AiProviderInfo] = {}
    has_any = False

    for prov, meta in AI_KEYS_MAP.items():
        raw_key = s_map.get(meta["setting_key"]) or os.getenv(meta["env_var"])
        is_configured = bool(raw_key and len(raw_key.strip()) >= 8)
        if is_configured:
            has_any = True
        providers[prov] = AiProviderInfo(
            configured=is_configured,
            masked_key=mask_key(raw_key) if is_configured else None,
            model=meta["model"],
            display_name=meta["display_name"],
            description=meta["description"]
        )

    return AiKeysConfigResponse(
        gemini=providers["gemini"],
        openai=providers["openai"],
        deepseek=providers["deepseek"],
        anthropic=providers["anthropic"],
        active_provider=preferred,
        has_any_key=has_any
    )

async def save_ai_keys_config(
    db: AsyncSession,
    payload: AiKeysConfigUpdate,
    current_user: User
) -> AiKeysConfigResponse:
    """Saves API keys into system_settings."""
    to_update = {}
    if payload.gemini_api_key is not None and not payload.gemini_api_key.startswith("..."):
        to_update["ai_gemini_api_key"] = payload.gemini_api_key.strip()
    if payload.openai_api_key is not None and not payload.openai_api_key.startswith("..."):
        to_update["ai_openai_api_key"] = payload.openai_api_key.strip()
    if payload.deepseek_api_key is not None and not payload.deepseek_api_key.startswith("..."):
        to_update["ai_deepseek_api_key"] = payload.deepseek_api_key.strip()
    if payload.anthropic_api_key is not None and not payload.anthropic_api_key.startswith("..."):
        to_update["ai_anthropic_api_key"] = payload.anthropic_api_key.strip()
    if payload.active_provider is not None:
        to_update["ai_preferred_provider"] = payload.active_provider.strip().lower()

    for k, v in to_update.items():
        res = await db.execute(select(SystemSetting).where(SystemSetting.key == k))
        obj = res.scalar_one_or_none()
        if obj:
            obj.value = v
        else:
            obj = SystemSetting(key=k, value=v, category="ai_diagnostics", description="AI Model API Key")
            db.add(obj)

    await log_audit_event(
        db=db,
        action="UPDATE_AI_KEYS",
        entity_type="system_settings",
        username=current_user.username,
        user_id=current_user.id if not str(current_user.id).startswith("apikey-") else None,
        entity_id="ai_configuration",
        details={"updated_keys": list(to_update.keys()), "preferred": to_update.get("ai_preferred_provider")},
        result="SUCCESS"
    )
    await db.commit()
    return await get_ai_keys_config(db)

async def test_ai_key_connectivity(
    provider: str,
    api_key: Optional[str] = None,
    db: Optional[AsyncSession] = None
) -> AiKeysTestResponse:
    """Tests live connection to the specified AI model provider."""
    p = provider.lower().strip()
    meta = AI_KEYS_MAP.get(p)
    if not meta:
        return AiKeysTestResponse(
            success=False,
            provider=provider,
            message=f"Unsupported AI provider: {provider}. Supported: gemini, openai, deepseek, anthropic",
            latency_ms=0
        )

    resolved_key = api_key
    if (not resolved_key or resolved_key.startswith("...")) and db:
        resolved_key = await get_raw_ai_key(db, p)

    if not resolved_key or len(resolved_key.strip()) < 8:
        return AiKeysTestResponse(
            success=False,
            provider=provider,
            message=f"No valid API key provided or stored for {meta['display_name']}.",
            latency_ms=0
        )

    start_t = time.time()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if p == "gemini":
                # Google Gemini
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{meta['model']}:generateContent?key={resolved_key}"
                body = {
                    "contents": [{"parts": [{"text": "Respond with the single word: OK"}]}],
                    "generationConfig": {"temperature": 0.0, "maxOutputTokens": 10}
                }
                resp = await client.post(url, json=body)
                elapsed = int((time.time() - start_t) * 1000)
                if resp.status_code == 200:
                    data = resp.json()
                    sample = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    return AiKeysTestResponse(
                        success=True,
                        provider=provider,
                        message=f"Successfully authenticated with {meta['display_name']} ({meta['model']}).",
                        response_sample=sample,
                        latency_ms=elapsed
                    )
                else:
                    err_msg = resp.text[:200]
                    return AiKeysTestResponse(
                        success=False,
                        provider=provider,
                        message=f"{meta['display_name']} API returned HTTP {resp.status_code}: {err_msg}",
                        latency_ms=elapsed
                    )

            elif p == "openai":
                # OpenAI
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {resolved_key}", "Content-Type": "application/json"}
                body = {
                    "model": meta["model"],
                    "messages": [{"role": "user", "content": "Respond with the single word: OK"}],
                    "max_tokens": 10,
                    "temperature": 0.0
                }
                resp = await client.post(url, json=body, headers=headers)
                elapsed = int((time.time() - start_t) * 1000)
                if resp.status_code == 200:
                    data = resp.json()
                    sample = data["choices"][0]["message"]["content"].strip()
                    return AiKeysTestResponse(
                        success=True,
                        provider=provider,
                        message=f"Successfully authenticated with OpenAI ({meta['model']}).",
                        response_sample=sample,
                        latency_ms=elapsed
                    )
                else:
                    return AiKeysTestResponse(
                        success=False,
                        provider=provider,
                        message=f"OpenAI API returned HTTP {resp.status_code}: {resp.text[:200]}",
                        latency_ms=elapsed
                    )

            elif p == "deepseek":
                # DeepSeek
                url = "https://api.deepseek.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {resolved_key}", "Content-Type": "application/json"}
                body = {
                    "model": meta["model"],
                    "messages": [{"role": "user", "content": "Respond with the single word: OK"}],
                    "max_tokens": 10,
                    "temperature": 0.0
                }
                resp = await client.post(url, json=body, headers=headers)
                elapsed = int((time.time() - start_t) * 1000)
                if resp.status_code == 200:
                    data = resp.json()
                    sample = data["choices"][0]["message"]["content"].strip()
                    return AiKeysTestResponse(
                        success=True,
                        provider=provider,
                        message=f"Successfully authenticated with DeepSeek ({meta['model']}).",
                        response_sample=sample,
                        latency_ms=elapsed
                    )
                else:
                    return AiKeysTestResponse(
                        success=False,
                        provider=provider,
                        message=f"DeepSeek API returned HTTP {resp.status_code}: {resp.text[:200]}",
                        latency_ms=elapsed
                    )

            elif p == "anthropic":
                # Anthropic Claude
                url = "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": resolved_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }
                body = {
                    "model": meta["model"],
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": "Respond with the single word: OK"}]
                }
                resp = await client.post(url, json=body, headers=headers)
                elapsed = int((time.time() - start_t) * 1000)
                if resp.status_code == 200:
                    data = resp.json()
                    sample = data["content"][0]["text"].strip()
                    return AiKeysTestResponse(
                        success=True,
                        provider=provider,
                        message=f"Successfully authenticated with Anthropic Claude ({meta['model']}).",
                        response_sample=sample,
                        latency_ms=elapsed
                    )
                else:
                    return AiKeysTestResponse(
                        success=False,
                        provider=provider,
                        message=f"Anthropic Claude API returned HTTP {resp.status_code}: {resp.text[:200]}",
                        latency_ms=elapsed
                    )

    except Exception as e:
        elapsed = int((time.time() - start_t) * 1000)
        return AiKeysTestResponse(
            success=False,
            provider=provider,
            message=f"Connection error connecting to {meta['display_name']}: {str(e)}",
            latency_ms=elapsed
        )

    return AiKeysTestResponse(
        success=False,
        provider=provider,
        message="Unknown test execution error.",
        latency_ms=0
    )


async def call_ai_model_for_diagnostics(
    provider: str,
    api_key: str,
    system_prompt: str,
    user_prompt: str
) -> Tuple[Optional[str], str]:
    """Dispatches prompt to selected AI provider and extracts the raw textual response."""
    p = provider.lower().strip()
    meta = AI_KEYS_MAP.get(p, AI_KEYS_MAP["gemini"])
    model_name = meta["model"]

    async with httpx.AsyncClient(timeout=30.0) as client:
        if p == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            body = {
                "contents": [
                    {"role": "user", "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}
                ],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 3000}
            }
            resp = await client.post(url, json=body)
            if resp.status_code != 200:
                # Try fallback to gemini-1.5-flash
                fallback_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
                resp = await client.post(fallback_url, json=body)
                model_name = "gemini-1.5-flash"
            if resp.status_code == 200:
                data = resp.json()
                return data["candidates"][0]["content"]["parts"][0]["text"], model_name

        elif p in ["openai", "deepseek"]:
            base_url = "https://api.openai.com/v1/chat/completions" if p == "openai" else "https://api.deepseek.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            body = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 3000
            }
            resp = await client.post(base_url, json=body, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"], model_name

        elif p == "anthropic":
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            body = {
                "model": model_name,
                "system": system_prompt,
                "max_tokens": 3000,
                "messages": [{"role": "user", "content": user_prompt}]
            }
            resp = await client.post(url, json=body, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data["content"][0]["text"], model_name

    return None, model_name


def generate_fallback_rule_diagnostics(errors: List[Dict[str, Any]]) -> List[AiDiagnosticItem]:
    """
    Built-in expert DevOps reasoning engine for zero-dependency local diagnostics
    when no generative AI key is provided or external APIs are unreachable.
    """
    items = []
    for idx, err in enumerate(errors, 1):
        target = err.get("target", "System Endpoint")
        target_type = err.get("type", "application")
        msg = err.get("message", "Service failure detected.")
        status_code = err.get("status_code", 0)

        # 1. 502 Bad Gateway
        if status_code == 502 or "502" in msg or "Bad Gateway" in msg:
            items.append(AiDiagnosticItem(
                id=f"ERR-{idx:03d}",
                severity="CRITICAL",
                title=f"502 Bad Gateway: Reverse Proxy Upstream Connection Refused",
                target=target,
                target_type=target_type,
                error_details=msg,
                explanation="The edge web server (Nginx or Apache) is active, but the backend application daemon (e.g. Uvicorn, PHP-FPM, Node.js, or Docker container) is either stopped, crashed, or not listening on the expected internal port or Unix socket.",
                possible_fixes=[
                    "Check if the application container or systemd daemon is running on the host VPS.",
                    "Inspect the upstream proxy port mapping in /etc/nginx/sites-enabled/ or /etc/apache2/sites-enabled/.",
                    "Restart the application service or container and reload the reverse proxy."
                ],
                fix_commands=f"# 1. Check status of service or container\nsystemctl status {target} || docker ps -a | grep -i {target}\n\n# 2. Restart backend application process\nsystemctl restart {target} || docker restart {target}\n\n# 3. Verify socket and reload web daemon\napache2ctl configtest && systemctl reload apache2 || nginx -t && systemctl reload nginx"
            ))

        # 2. 500 Internal Server Error
        elif status_code == 500 or "500" in msg or "Internal Server Error" in msg:
            items.append(AiDiagnosticItem(
                id=f"ERR-{idx:03d}",
                severity="HIGH",
                title=f"500 Internal Server Error: Unhandled Application Exception",
                target=target,
                target_type=target_type,
                error_details=msg,
                explanation="The application received the HTTP request but crashed while processing it. Common root causes include database connection failures (PostgreSQL/MySQL down or bad credentials in .env), missing Python/Node packages, or unhandled null-reference exceptions.",
                possible_fixes=[
                    "Inspect recent application runtime logs using journalctl or docker logs.",
                    "Verify database service is running and accessible from the application node.",
                    "Check .env configuration variables for incorrect hostnames or expired tokens."
                ],
                fix_commands=f"# Tail last 50 lines of logs to identify exact exception\njournalctl -u {target} -n 50 --no-pager || docker logs --tail 50 {target}\n\n# Verify database connectivity\npg_isready -h localhost || mysqladmin ping"
            ))

        # 3. Connection Refused / Offline (status 0 / 503)
        elif status_code == 0 or status_code == 503 or "Connection refused" in msg or "Offline" in msg:
            items.append(AiDiagnosticItem(
                id=f"ERR-{idx:03d}",
                severity="CRITICAL",
                title=f"Service Unreachable / Connection Refused",
                target=target,
                target_type=target_type,
                error_details=msg,
                explanation="HQ could not establish a TCP connection to the endpoint on port 80/443. The target node may be powered off, the firewall (UFW/iptables) may be blocking ingress traffic, or the web service is completely terminated.",
                possible_fixes=[
                    "Verify node network reachability and ping response.",
                    "Check listening ports with 'ss -tulpn' on the VPS.",
                    "Ensure firewall rules allow HTTP/HTTPS traffic (UFW allow 80,443/tcp)."
                ],
                fix_commands=f"# Check if ports 80/443 are listening\nss -tulpn | grep -E ':(80|443)'\n\n# Ensure firewall allows web traffic\nufw allow 80/tcp && ufw allow 443/tcp && ufw reload\n\n# Start web server\nsystemctl start apache2 || systemctl start nginx"
            ))

        # 4. SSL Expiry / Certificate Error
        elif target_type == "ssl" or "SSL" in msg or "certificate" in msg.lower():
            items.append(AiDiagnosticItem(
                id=f"ERR-{idx:03d}",
                severity="HIGH",
                title=f"SSL Certificate Validation / Expiration Issue",
                target=target,
                target_type="ssl",
                error_details=msg,
                explanation="The SSL/TLS certificate for this domain is either expired, self-signed, untrusted, or has fewer than 15 days of validity remaining. Browsers will show security warnings (NET::ERR_CERT_COMMON_NAME_INVALID or SEC_ERROR_EXPIRED_CERTIFICATE).",
                possible_fixes=[
                    "Trigger Let's Encrypt automated certificate issuance or renewal via Certbot.",
                    "Verify DNS A-records point directly to the target VPS node.",
                    "Reload Apache or Nginx after certificate renewal."
                ],
                fix_commands=f"# Run Certbot renewal for domain\ncertbot --apache -d {target} --non-interactive --agree-tos || certbot --nginx -d {target} --non-interactive --agree-tos\n\n# Test syntax and reload web daemons\napache2ctl configtest && systemctl reload apache2 || nginx -t && systemctl reload nginx"
            ))

        # 5. Resource Spikes (CPU / RAM / Disk)
        elif target_type == "server" or "CPU" in msg or "RAM" in msg or "Disk" in msg:
            items.append(AiDiagnosticItem(
                id=f"ERR-{idx:03d}",
                severity="HIGH",
                title=f"Server Resource Saturation: High Utilization",
                target=target,
                target_type="server",
                error_details=msg,
                explanation="The VPS node has exceeded safe utilization thresholds (CPU > 80%, RAM > 90%, or Disk > 85%). This causes request throttling, kernel OOM (Out Of Memory) process kills, and disk write lockups.",
                possible_fixes=[
                    "Inspect top CPU/memory consuming processes with 'htop' or 'ps aux'.",
                    "Vacuum systemd journal logs and prune dangling Docker images.",
                    "Clean cached apt packages and drop kernel page caches if memory is tight."
                ],
                fix_commands="# Prune Docker build caches and dead containers\ndocker system prune -af --volumes\n\n# Vacuum systemd journal to free disk space\njournalctl --vacuum-time=3d\n\n# Drop clean pagecache\nsync; echo 1 > /proc/sys/vm/drop_caches"
            ))

        # Generic Fallback
        else:
            items.append(AiDiagnosticItem(
                id=f"ERR-{idx:03d}",
                severity="WARNING",
                title=f"Operational Anomaly Detected on {target}",
                target=target,
                target_type=target_type,
                error_details=msg,
                explanation=f"A health probe anomaly was identified during synthetic probing: {msg}. The node may require daemon verification or service restart.",
                possible_fixes=[
                    "Review application error logs in /var/log/.",
                    "Restart the affected service or container.",
                    "Configure an AI provider key (Gemini, OpenAI, DeepSeek, Claude) under API Keys for automated deep neural diagnosis."
                ],
                fix_commands=f"systemctl status {target} || docker ps | grep {target}"
            ))

    return items


async def run_ai_health_diagnostics(
    db: AsyncSession,
    current_user: User,
    provider_override: Optional[str] = None
) -> AiDiagnosticResponse:
    """
    Executes all health probes across applications, servers, domains, and checks,
    aggregates all errors, and invokes generative AI (Gemini, OpenAI, DeepSeek, Claude)
    to output root causes and actionable remediation fixes.
    """
    start_time = time.time()

    # 1. Run live monitoring cycle first to gather fresh telemetry
    try:
        await execute_monitoring_cycle()
    except Exception as e:
        print(f"[AI-DIAGNOSTICS] Monitoring cycle run notice: {e}")

    # 2. Collect all active errors across nodes
    errors: List[Dict[str, Any]] = []

    # Check applications
    apps_res = await db.execute(select(Application).where(Application.is_active == True, Application.deleted_at == None))
    apps = apps_res.scalars().all()
    total_checks = len(apps)

    for app in apps:
        if app.is_maintenance:
            continue
        if app.health_status == "OFFLINE" or (app.http_status and app.http_status >= 400) or app.http_status == 0:
            errors.append({
                "target": app.name,
                "type": "application",
                "domain": app.domain,
                "status_code": app.http_status or 0,
                "message": f"Application {app.name} returned HTTP {app.http_status or 'TIMEOUT / REFUSED'}. Target URL: {app.domain}{app.health_check_url or ''}"
            })

    # Check servers
    srv_res = await db.execute(select(Server).where(Server.is_active == True, Server.deleted_at == None))
    servers = srv_res.scalars().all()
    total_checks += len(servers)

    for srv in servers:
        if srv.status != "ONLINE":
            errors.append({
                "target": srv.name,
                "type": "server",
                "ip": srv.public_ip,
                "message": f"Server {srv.name} ({srv.public_ip}) status is {srv.status}. Node heartbeat failed."
            })
        metric_res = await db.execute(
            select(ServerMetric)
            .where(ServerMetric.server_id == srv.id)
            .order_by(ServerMetric.timestamp.desc())
            .limit(1)
        )
        latest_metric = metric_res.scalar_one_or_none()
        if latest_metric:
            if latest_metric.cpu_percent and latest_metric.cpu_percent > 85.0:
                errors.append({
                    "target": srv.name,
                    "type": "server",
                    "message": f"Server {srv.name} CPU contention spike: {latest_metric.cpu_percent}% utilization."
                })
            if latest_metric.ram_percent and latest_metric.ram_percent > 90.0:
                errors.append({
                    "target": srv.name,
                    "type": "server",
                    "message": f"Server {srv.name} RAM memory critical: {latest_metric.ram_percent}% consumed."
                })
            if latest_metric.disk_percent and latest_metric.disk_percent > 85.0:
                errors.append({
                    "target": srv.name,
                    "type": "server",
                    "message": f"Server {srv.name} Disk storage capacity alert: {latest_metric.disk_percent}% used."
                })

    # Check domains & SSL
    dom_res = await db.execute(select(Domain).where(Domain.is_active == True))
    domains = dom_res.scalars().all()
    total_checks += len(domains)

    for dom in domains:
        if dom.ssl_status != "VALID":
            errors.append({
                "target": dom.domain_name,
                "type": "ssl",
                "message": f"Domain {dom.domain_name} SSL certificate is {dom.ssl_status} (Days left: {dom.days_remaining or 0})."
            })
        elif dom.days_remaining is not None and dom.days_remaining <= 14:
            errors.append({
                "target": dom.domain_name,
                "type": "ssl",
                "message": f"Domain {dom.domain_name} SSL certificate is expiring in {dom.days_remaining} days."
            })

    # Check unresolved critical alerts
    alert_res = await db.execute(select(Alert).where(Alert.is_resolved == False).limit(10))
    alerts = alert_res.scalars().all()
    for al in alerts:
        if not any(e["target"] == al.source_name for e in errors):
            errors.append({
                "target": al.source_name,
                "type": al.source_type or "system",
                "message": f"Active Alert [{al.severity}]: {al.message}"
            })

    # 3. Determine which AI provider to use
    settings_res = await db.execute(select(SystemSetting))
    all_settings = {s.key: s.value for s in settings_res.scalars().all()}
    preferred = provider_override or all_settings.get("ai_preferred_provider", "auto")
    
    selected_provider = None
    selected_key = None

    if preferred != "auto" and preferred in AI_KEYS_MAP:
        k = await get_raw_ai_key(db, preferred)
        if k:
            selected_provider = preferred
            selected_key = k

    if not selected_provider:
        # Auto-pick in priority order: Gemini -> OpenAI -> DeepSeek -> Anthropic
        for candidate in ["gemini", "openai", "deepseek", "anthropic"]:
            k = await get_raw_ai_key(db, candidate)
            if k:
                selected_provider = candidate
                selected_key = k
                break

    # 4. If no errors found across any node: return All Healthy Assessment
    if not errors:
        elapsed = int((time.time() - start_time) * 1000)
        provider_label = AI_KEYS_MAP.get(selected_provider, {}).get("display_name", "HQ Built-In Monitor") if selected_provider else "HQ Intelligent Monitor"
        model_name = AI_KEYS_MAP.get(selected_provider, {}).get("model", "Heuristic Rules") if selected_provider else "Built-In Heuristics"
        return AiDiagnosticResponse(
            success=True,
            status="ALL_HEALTHY",
            provider_used=provider_label,
            model_name=model_name,
            execution_time_ms=elapsed,
            total_checks=total_checks,
            total_errors=0,
            items=[],
            overall_health_assessment=f"All {total_checks} infrastructure probes, applications, SSL certificates, and VPS servers are running with 100% operational health and zero anomalies."
        )

    # 5. If errors found, invoke AI model or fallback rules
    diagnostic_items: List[AiDiagnosticItem] = []
    used_provider_label = "HQ Built-in DevOps Engine"
    used_model_name = "Rule Heuristics"

    if selected_provider and selected_key:
        used_provider_label = AI_KEYS_MAP[selected_provider]["display_name"]
        used_model_name = AI_KEYS_MAP[selected_provider]["model"]

        system_prompt = (
            "You are an expert DevOps and Site Reliability Engineer (SRE) AI assistant in the HQ Central Command Center. "
            "You diagnose live server, domain, SSL, application, and database errors across Linux VPS hosts (Ubuntu/Debian, Nginx, Apache2, Docker, systemd, PHP-FPM, Python, Node.js). "
            "For each error, you must provide: "
            "1. title: short crisp title, "
            "2. severity: CRITICAL, HIGH, or WARNING, "
            "3. explanation: clear explanation of what the error is about and its root cause, "
            "4. possible_fixes: array of 2-4 concise actionable steps, "
            "5. fix_commands: complete, copy-paste ready bash/terminal command snippet to inspect and resolve the problem. "
            "Return ONLY a valid JSON array of objects matching this schema, without conversational text or markdown code fences:\n"
            '[{"id": "ERR-001", "severity": "CRITICAL", "title": "...", "target": "...", "target_type": "...", "error_details": "...", "explanation": "...", "possible_fixes": ["..."], "fix_commands": "..."}]'
        )

        user_prompt = f"Here is the list of {len(errors)} active errors detected during the health probe cycle:\n{json.dumps(errors, indent=2)}\n\nDiagnose every single error and provide exact Linux/Docker remediation commands for each."

        try:
            raw_ai_text, used_model_name = await call_ai_model_for_diagnostics(
                provider=selected_provider,
                api_key=selected_key,
                system_prompt=system_prompt,
                user_prompt=user_prompt
            )
            if raw_ai_text:
                cleaned_text = raw_ai_text.strip()
                if cleaned_text.startswith("```json"):
                    cleaned_text = cleaned_text[7:]
                if cleaned_text.startswith("```"):
                    cleaned_text = cleaned_text[3:]
                if cleaned_text.endswith("```"):
                    cleaned_text = cleaned_text[:-3]
                cleaned_text = cleaned_text.strip()

                parsed = json.loads(cleaned_text)
                if isinstance(parsed, list):
                    for idx, item in enumerate(parsed, 1):
                        diagnostic_items.append(AiDiagnosticItem(
                            id=item.get("id") or f"ERR-{idx:03d}",
                            severity=item.get("severity") or "HIGH",
                            title=item.get("title") or "Infrastructure Incident",
                            target=item.get("target") or "Unknown Target",
                            target_type=item.get("target_type") or "application",
                            error_details=item.get("error_details") or "",
                            explanation=item.get("explanation") or "Error identified by AI model.",
                            possible_fixes=item.get("possible_fixes") or ["Inspect service logs", "Restart daemon"],
                            fix_commands=item.get("fix_commands")
                        ))
        except Exception as ai_err:
            print(f"[AI-DIAGNOSTICS] AI model dispatch failed: {ai_err}, falling back to built-in rules.")

    # If AI wasn't configured or returned invalid JSON, use the built-in rule diagnostics
    if not diagnostic_items:
        diagnostic_items = generate_fallback_rule_diagnostics(errors)
        if not selected_key:
            used_provider_label = "HQ Built-In Rule Engine (No AI Key Set)"
            used_model_name = "DevOps Rules v2"

    elapsed = int((time.time() - start_time) * 1000)

    # Overall health assessment text
    crit_count = sum(1 for it in diagnostic_items if it.severity == "CRITICAL")
    assessment = (
        f"Detected {len(diagnostic_items)} active operational issue(s) across {total_checks} probed endpoints "
        f"({crit_count} Critical, {len(diagnostic_items) - crit_count} High/Warning). "
        f"Root causes and actionable recovery commands have been compiled by {used_provider_label}."
    )

    return AiDiagnosticResponse(
        success=True,
        status="ISSUES_DETECTED",
        provider_used=used_provider_label,
        model_name=used_model_name,
        execution_time_ms=elapsed,
        total_checks=total_checks,
        total_errors=len(diagnostic_items),
        items=diagnostic_items,
        overall_health_assessment=assessment
    )
