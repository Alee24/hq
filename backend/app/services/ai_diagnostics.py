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
    AiKeysTestResponse, AiDiagnosticItem, AiDiagnosticResponse,
    CommandAuditRequest, CommandAuditResponse
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

GEMINI_MODELS_CHAIN = [
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
]

AI_KEYS_MAP = {
    "gemini": {
        "setting_key": "ai_gemini_api_key",
        "env_var": "GEMINI_API_KEY",
        "model": "gemini-3.8-flash",
        "display_name": "Google Gemini",
        "description": "Google DeepMind's ultra-fast multimodal model (Gemini 3.8 Flash / 2.0 / 1.5)"
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

def extract_gemini_text(data: Any) -> Tuple[Optional[str], Optional[str]]:
    """
    Safely and defensively extracts response text from a Gemini generateContent response JSON.
    Returns (extracted_text, failure_reason_if_any).
    Handles:
    - Normal text responses in content.parts[0].text
    - Multi-part responses (thinking/reasoning parts + final text part)
    - Thought-only responses when reasoning is enabled
    - finishReason: MAX_TOKENS, SAFETY, RECITATION, BLOCKLIST, OTHER
    - promptFeedback blockReason (e.g. SAFETY, PROHIBITED_CONTENT)
    - Error payloads in 200 responses
    """
    if not isinstance(data, dict):
        return None, "Response is not a valid JSON object."

    # Check for top-level error object
    if "error" in data:
        err = data["error"]
        err_msg = err.get("message") if isinstance(err, dict) else str(err)
        return None, f"Gemini error: {err_msg}"

    # Check promptFeedback
    feedback = data.get("promptFeedback")
    if isinstance(feedback, dict) and feedback.get("blockReason"):
        return None, f"Prompt blocked by Gemini safety filter: {feedback.get('blockReason')}"

    candidates = data.get("candidates")
    if not candidates or not isinstance(candidates, list) or len(candidates) == 0:
        return None, "No response candidates returned by Gemini."

    cand = candidates[0]
    if not isinstance(cand, dict):
        return None, "Candidate entry is not a valid object."

    finish_reason = cand.get("finishReason")
    content = cand.get("content")

    # If content is present, extract from parts
    if isinstance(content, dict):
        parts = content.get("parts")
        if isinstance(parts, list) and len(parts) > 0:
            text_chunks = []
            thought_chunks = []
            for p in parts:
                if isinstance(p, dict):
                    if "text" in p and isinstance(p["text"], str) and p["text"]:
                        text_chunks.append(p["text"])
                    elif "thought" in p and isinstance(p["thought"], str) and p["thought"]:
                        thought_chunks.append(p["thought"])

            if text_chunks:
                return "".join(text_chunks).strip(), None

            if thought_chunks:
                return "".join(thought_chunks).strip(), None

    # If no text was found, inspect finishReason
    if finish_reason:
        if finish_reason == "MAX_TOKENS":
            return None, "Token limit reached before output text was generated (MAX_TOKENS)."
        elif finish_reason == "SAFETY":
            return None, "Response was blocked by Gemini safety settings (SAFETY)."
        elif finish_reason == "RECITATION":
            return None, "Response was blocked due to recitation check (RECITATION)."
        else:
            return None, f"Gemini generation halted with finish reason: {finish_reason}"

    return None, "Response candidate contains no text parts."


def extract_openai_text(data: Any) -> Tuple[Optional[str], Optional[str]]:
    """Safely extracts text from OpenAI / DeepSeek completion JSON."""
    if not isinstance(data, dict):
        return None, "Response is not a valid JSON object."
    if "error" in data:
        err = data["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        return None, f"API error: {msg}"
    choices = data.get("choices")
    if not choices or not isinstance(choices, list) or len(choices) == 0:
        return None, "No choices returned in API response."
    choice = choices[0]
    if not isinstance(choice, dict):
        return None, "Choice item is not a valid object."
    message = choice.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip(), None
    finish_reason = choice.get("finish_reason")
    if finish_reason:
        return None, f"Generation stopped with finish reason: {finish_reason}"
    return None, "No message content found in choice."


def extract_anthropic_text(data: Any) -> Tuple[Optional[str], Optional[str]]:
    """Safely extracts text from Anthropic Claude messages JSON."""
    if not isinstance(data, dict):
        return None, "Response is not a valid JSON object."
    if "error" in data:
        err = data["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        return None, f"Anthropic error: {msg}"
    content_list = data.get("content")
    if not content_list or not isinstance(content_list, list) or len(content_list) == 0:
        return None, "No content blocks returned by Anthropic."
    text_chunks = []
    for block in content_list:
        if isinstance(block, dict) and block.get("type") == "text" and "text" in block:
            text_chunks.append(block["text"])
        elif isinstance(block, dict) and "text" in block and isinstance(block["text"], str):
            text_chunks.append(block["text"])
    if text_chunks:
        return "".join(text_chunks).strip(), None
    stop_reason = data.get("stop_reason")
    if stop_reason:
        return None, f"Anthropic stopped with reason: {stop_reason}"
    return None, "No text blocks found in Anthropic content."


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
                # Google Gemini with multi-model fallback chain and safe response extraction
                last_err = ""
                for cand_model in GEMINI_MODELS_CHAIN:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{cand_model}:generateContent?key={resolved_key}"
                    body = {
                        "contents": [{"parts": [{"text": "Respond with the single word: OK"}]}],
                        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 200}
                    }
                    resp = await client.post(url, json=body)
                    elapsed = int((time.time() - start_t) * 1000)
                    if resp.status_code == 200:
                        data = resp.json()
                        sample, parse_err = extract_gemini_text(data)
                        if sample:
                            return AiKeysTestResponse(
                                success=True,
                                provider=provider,
                                message=f"Successfully authenticated with {meta['display_name']} ({cand_model}).",
                                response_sample=sample,
                                latency_ms=elapsed
                            )
                        else:
                            last_err = f"{cand_model} response format note: {parse_err}"
                            continue
                    elif resp.status_code == 404:
                        last_err = f"HTTP 404 on {cand_model}: {resp.text[:150]}"
                        continue
                    else:
                        last_err = f"HTTP {resp.status_code} on {cand_model}: {resp.text[:180]}"
                        break

                elapsed = int((time.time() - start_t) * 1000)
                return AiKeysTestResponse(
                    success=False,
                    provider=provider,
                    message=f"{meta['display_name']} authentication failed: {last_err or 'No compatible model succeeded.'}",
                    latency_ms=elapsed
                )

            elif p == "openai":
                # OpenAI
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {resolved_key}", "Content-Type": "application/json"}
                body = {
                    "model": meta["model"],
                    "messages": [{"role": "user", "content": "Respond with the single word: OK"}],
                    "max_tokens": 100,
                    "temperature": 0.0
                }
                resp = await client.post(url, json=body, headers=headers)
                elapsed = int((time.time() - start_t) * 1000)
                if resp.status_code == 200:
                    data = resp.json()
                    sample, parse_err = extract_openai_text(data)
                    if sample:
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
                            message=f"OpenAI response format issue: {parse_err}",
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
                    "max_tokens": 100,
                    "temperature": 0.0
                }
                resp = await client.post(url, json=body, headers=headers)
                elapsed = int((time.time() - start_t) * 1000)
                if resp.status_code == 200:
                    data = resp.json()
                    sample, parse_err = extract_openai_text(data)
                    if sample:
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
                            message=f"DeepSeek response format issue: {parse_err}",
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
                    "max_tokens": 100,
                    "messages": [{"role": "user", "content": "Respond with the single word: OK"}]
                }
                resp = await client.post(url, json=body, headers=headers)
                elapsed = int((time.time() - start_t) * 1000)
                if resp.status_code == 200:
                    data = resp.json()
                    sample, parse_err = extract_anthropic_text(data)
                    if sample:
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
                            message=f"Anthropic Claude response format issue: {parse_err}",
                            latency_ms=elapsed
                        )
                else:
                    return AiKeysTestResponse(
                        success=False,
                        provider=provider,
                        message=f"Anthropic Claude API returned HTTP {resp.status_code}: {resp.text[:200]}",
                        latency_ms=elapsed
                    )

    except httpx.TimeoutException:
        elapsed = int((time.time() - start_t) * 1000)
        return AiKeysTestResponse(
            success=False,
            provider=provider,
            message=f"Connection timed out while reaching {meta['display_name']} API (15s timeout). Please verify network and server internet connectivity.",
            latency_ms=elapsed
        )
    except httpx.ConnectError as ce:
        elapsed = int((time.time() - start_t) * 1000)
        return AiKeysTestResponse(
            success=False,
            provider=provider,
            message=f"Network connection failed reaching {meta['display_name']} endpoint: {str(ce)}",
            latency_ms=elapsed
        )
    except Exception as e:
        elapsed = int((time.time() - start_t) * 1000)
        err_type = type(e).__name__
        err_detail = str(e) or repr(e)
        return AiKeysTestResponse(
            success=False,
            provider=provider,
            message=f"Error validating {meta['display_name']} connection ({err_type}): {err_detail}",
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
            body = {
                "contents": [
                    {"role": "user", "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}
                ],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 3000}
            }
            for cand_model in GEMINI_MODELS_CHAIN:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{cand_model}:generateContent?key={api_key}"
                resp = await client.post(url, json=body)
                if resp.status_code == 200:
                    data = resp.json()
                    extracted, _ = extract_gemini_text(data)
                    if extracted:
                        return extracted, cand_model
                elif resp.status_code == 404:
                    continue
                else:
                    break

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
                extracted, _ = extract_openai_text(data)
                if extracted:
                    return extracted, model_name

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
                extracted, _ = extract_anthropic_text(data)
                if extracted:
                    return extracted, model_name

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


def generate_fallback_command_audit(
    command: str,
    stdout: str,
    stderr: str,
    exit_code: int,
    context_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Built-in expert DevOps engine for command interpretation when no AI key is configured
    or external generative models are unreachable.
    """
    cmd_lower = command.lower()
    full_output = f"{stdout}\n{stderr}".strip()

    # 1. CPU Spikes / Process Investigation (e.g. ps aux)
    if "ps aux" in cmd_lower or context_type == "SPIKE_INVESTIGATION" or "cpu" in cmd_lower:
        high_procs = []
        for line in stdout.splitlines():
            parts = line.split()
            if len(parts) >= 11 and parts[2].replace(".", "", 1).isdigit():
                try:
                    cpu_val = float(parts[2])
                    if cpu_val > 40.0:
                        high_procs.append((parts[1], parts[2], " ".join(parts[10:])))
                except ValueError:
                    pass

        if high_procs:
            pid, cpu_pct, proc_name = high_procs[0]
            return {
                "summary": f"Process '{proc_name[:60]}' (PID {pid}) is saturating CPU at {cpu_pct}%.",
                "status_level": "CRITICAL" if float(cpu_pct) > 90 else "WARNING",
                "reason": (
                    f"A severe CPU resource spike is active on the node. The offending daemon PID {pid} is executing "
                    f"an intensive synchronous loop, heavy V8/Python GC cycle, or unindexed database query. "
                    f"On multi-core Linux systems, CPU usage over 100% indicates multi-threaded contention."
                ),
                "solution": (
                    "1. If this is a PM2/Node.js or Python worker, gracefully reload the process cluster.\n"
                    "2. Lower the process priority using 'renice' to prevent server starvation.\n"
                    "3. If the process is hung or orphaned, terminate it with SIGTERM (kill -15) or SIGKILL (kill -9).\n"
                    "4. Profile application queries to eliminate unindexed table scans."
                ),
                "suggested_command": f"# Step 1: Lower CPU priority or kill offender\nrenice +10 -p {pid} || kill -15 {pid}\n\n# Step 2: Reload daemon cleanly\npm2 reload all 2>/dev/null || systemctl restart pm2-root 2>/dev/null"
            }
        else:
            return {
                "summary": "Process list retrieved. System CPU load is distributed within normal thresholds.",
                "status_level": "SUCCESS" if exit_code == 0 else "WARNING",
                "reason": "Top processor consumers have stabilized. No rogue single process is currently exceeding the 40% CPU threshold.",
                "solution": "Continue monitoring system metrics and review historical spike logs to isolate periodic cron or background worker spikes.",
                "suggested_command": "ps aux --sort=-%cpu | head -10"
            }

    # 2. Syntax Validation (apache2ctl configtest / nginx -t)
    if "configtest" in cmd_lower or "nginx -t" in cmd_lower or "test_syntax" in cmd_lower:
        if exit_code == 0 and ("syntax is ok" in full_output.lower() or "syntax ok" in full_output.lower()):
            return {
                "summary": "Web server configuration syntax test passed with zero errors.",
                "status_level": "SUCCESS",
                "reason": "Apache / Nginx directive tree is fully valid. Configuration files in sites-enabled and conf.d have valid syntax, valid SSL certificate file paths, and correct port bindings.",
                "solution": "Configuration is production-safe. You can proceed with daemon reloading ('systemctl reload apache2' or 'systemctl reload nginx') with zero downtime.",
                "suggested_command": "systemctl reload apache2 2>/dev/null || systemctl reload nginx 2>/dev/null"
            }
        else:
            return {
                "summary": "Web server configuration syntax test failed.",
                "status_level": "ERROR",
                "reason": f"Syntax error detected in web configuration: {stderr or stdout}. A directive is misnamed, a closing tag is missing, or an SSL certificate file is unreachable.",
                "solution": "Inspect the specific line referenced in the error message before reloading the server, as reloading now will cause a service outage.",
                "suggested_command": "apache2ctl -S 2>&1 || nginx -T 2>&1"
            }

    # 3. Docker Container Operations
    if "docker" in cmd_lower:
        if exit_code != 0:
            return {
                "summary": "Docker daemon command failed.",
                "status_level": "ERROR",
                "reason": f"Docker engine reported an error: {stderr or stdout}. This typically occurs when a container name collision occurs, a mapped host port is already bound by another daemon, or the Docker socket is unavailable.",
                "solution": "Verify if the target container exists using 'docker ps -a'. If a port collision occurred, identify the binding daemon using 'ss -tulpn'.",
                "suggested_command": "docker ps -a --no-trunc && ss -tulpn"
            }
        else:
            return {
                "summary": "Docker command completed successfully.",
                "status_level": "SUCCESS",
                "reason": "The Docker engine processed the request. Container state, logs, or cleanup operations succeeded.",
                "solution": "Verify container health status with 'docker stats --no-stream'.",
                "suggested_command": "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
            }

    # 4. Web server service restart / reload
    if any(k in cmd_lower for k in ["restart apache", "restart nginx", "reload apache", "reload nginx", "systemctl"]):
        if exit_code == 0:
            return {
                "summary": "System service operation executed successfully.",
                "status_level": "SUCCESS",
                "reason": "Systemd / service manager applied the requested action cleanly. All workers and child processes have been initialized.",
                "solution": "Verify that the service is actively listening on its expected ports.",
                "suggested_command": "systemctl status $(echo '" + command + "' | awk '{print $NF}') --no-pager"
            }
        else:
            return {
                "summary": "Failed to control system daemon.",
                "status_level": "ERROR",
                "reason": f"Systemd reported failure (exit code {exit_code}): {stderr or stdout}. The unit configuration may be masked, failed on startup pre-check, or crashed on port binding.",
                "solution": "Inspect journalctl logs for the unit to view the specific crash stack trace.",
                "suggested_command": "journalctl -xeu $(echo '" + command + "' | awk '{print $NF}') -n 50 --no-pager"
            }

    # 5. Generic Error (exit_code != 0)
    if exit_code != 0:
        return {
            "summary": f"Command returned non-zero exit code ({exit_code}).",
            "status_level": "ERROR",
            "reason": f"Execution error: {stderr or stdout or 'Command exited with failure code ' + str(exit_code)}. Common causes include missing permissions, nonexistent paths, or command syntax errors.",
            "solution": "Verify path existence, check file permissions, and ensure root execution rights over SSH.",
            "suggested_command": command
        }

    # 6. Generic Success
    return {
        "summary": "Command executed successfully with exit code 0.",
        "status_level": "SUCCESS",
        "reason": "The remote VPS node completed execution with no errors emitted to stderr.",
        "solution": "The system state has been updated. No corrective action is required.",
        "suggested_command": ""
    }


async def audit_terminal_command_output(
    db: AsyncSession,
    req: CommandAuditRequest,
    current_user: Optional[User] = None,
    provider_override: Optional[str] = None
) -> CommandAuditResponse:
    """
    Audits terminal command output using configured generative AI (Gemini, OpenAI, DeepSeek, Claude)
    or the built-in DevOps rule engine, extracting root causes and executable solutions.
    """
    start_time = time.time()
    command = (req.command or "").strip()
    stdout = (req.stdout or "").strip()
    stderr = (req.stderr or "").strip()
    exit_code = req.exit_code
    server_name = req.server_name or "Remote VPS"
    server_ip = req.server_ip or ""

    keys_config = await get_ai_keys_config(db)
    active_pref = provider_override or keys_config.active_provider

    selected_provider = None
    selected_key = None

    if active_pref and active_pref != "auto":
        p_info = getattr(keys_config, active_pref, None)
        if p_info and p_info.configured:
            selected_provider = active_pref
            selected_key = await get_raw_ai_key(db, active_pref)
    else:
        for p_cand in ["gemini", "openai", "deepseek", "anthropic"]:
            p_info = getattr(keys_config, p_cand, None)
            if p_info and p_info.configured:
                selected_provider = p_cand
                selected_key = await get_raw_ai_key(db, p_cand)
                break

    used_provider_label = "HQ Built-In DevOps Engine"
    used_model_name = "DevOps Expert Rule Engine"
    ai_result = None

    if selected_provider and selected_key:
        meta = AI_KEYS_MAP.get(selected_provider, AI_KEYS_MAP["gemini"])
        used_provider_label = meta["display_name"]
        used_model_name = meta["model"]

        system_prompt = (
            "You are an elite Site Reliability Engineer (SRE) and Linux Systems Architect. "
            "Your task is to audit the execution output of a terminal command executed on a production VPS server. "
            "You must interpret the result, explain any errors or performance bottlenecks, explain the exact root cause, "
            "and provide clear, actionable solutions with executable bash fix commands.\n"
            "Respond ONLY with a valid JSON object with these exact keys:\n"
            "{\n"
            '  "summary": "Concise 1-sentence plain-English summary of what this command output shows.",\n'
            '  "status_level": "SUCCESS" | "WARNING" | "ERROR" | "CRITICAL",\n'
            '  "reason": "Clear technical explanation of why this error or output occurred and what it means.",\n'
            '  "solution": "Step-by-step instructions explaining how to fix or resolve this problem.",\n'
            '  "suggested_command": "Ready-to-run bash command snippet to fix or remediate the issue (or empty string if none needed)"\n'
            "}"
        )

        user_prompt = (
            f"Host Server: {server_name} ({server_ip})\n"
            f"Context: {req.context_type or 'Manual Command Execution'}\n"
            f"Command Executed:\n```bash\n{command}\n```\n"
            f"Exit Code: {exit_code}\n"
            f"Duration: {req.duration_ms or 0} ms\n\n"
            f"STDOUT:\n```\n{stdout[:2500]}\n```\n\n"
            f"STDERR:\n```\n{stderr[:2500]}\n```\n"
        )

        try:
            raw_ai_response, model_used = await call_ai_model_for_diagnostics(
                provider=selected_provider,
                api_key=selected_key,
                system_prompt=system_prompt,
                user_prompt=user_prompt
            )
            if raw_ai_response:
                used_model_name = model_used
                cleaned = raw_ai_response.strip()
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                if cleaned.startswith("```"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                parsed = json.loads(cleaned.strip())
                if isinstance(parsed, dict) and "reason" in parsed and "solution" in parsed:
                    ai_result = parsed
        except Exception as ex:
            print(f"[COMMAND-AUDIT] AI query failed: {ex}, falling back to built-in rules.")

    if not ai_result:
        ai_result = generate_fallback_command_audit(command, stdout, stderr, exit_code, req.context_type)

    elapsed = int((time.time() - start_time) * 1000)

    try:
        await log_audit_event(
            db=db,
            user_id=current_user.id if current_user else None,
            username=current_user.username if current_user else "system",
            action="COMMAND_AI_AUDIT",
            resource="TerminalCommand",
            resource_id=req.server_id or "local",
            details={
                "command": command[:150],
                "exit_code": exit_code,
                "status_level": ai_result.get("status_level", "INFO"),
                "provider": used_provider_label
            }
        )
    except Exception as log_ex:
        print(f"[COMMAND-AUDIT] Audit log failed: {log_ex}")

    return CommandAuditResponse(
        success=True,
        command=command,
        exit_code=exit_code,
        duration_ms=req.duration_ms or 0,
        status_level=ai_result.get("status_level", "SUCCESS" if exit_code == 0 else "ERROR"),
        summary=ai_result.get("summary", "Command execution audited."),
        reason=ai_result.get("reason", "Output evaluated by diagnostics engine."),
        solution=ai_result.get("solution", "No remedial action required."),
        suggested_command=ai_result.get("suggested_command"),
        provider_used=used_provider_label,
        model_name=used_model_name,
        execution_time_ms=elapsed
    )

