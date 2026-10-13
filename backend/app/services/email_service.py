import asyncio
import smtplib
import ssl
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

from sqlalchemy import select
from backend.app.core.database import AsyncSessionLocal
from backend.app.models.entities import SmtpSetting, NotificationLog


def _build_html_template(
    title: str,
    badge_text: str,
    badge_color: str,
    subtitle: str,
    rows: List[tuple[str, str]],
    cta_text: Optional[str] = None,
    cta_url: Optional[str] = None
) -> str:
    rows_html = "".join([
        f"""
        <tr>
            <td style="padding: 8px 12px; font-weight: 600; color: #94a3b8; font-size: 13px; border-bottom: 1px solid #1e293b; width: 35%;">{label}</td>
            <td style="padding: 8px 12px; font-weight: 500; color: #f8fafc; font-size: 13px; border-bottom: 1px solid #1e293b; font-family: monospace;">{val}</td>
        </tr>
        """ for label, val in rows
    ])

    cta_btn = ""
    if cta_text and cta_url:
        cta_btn = f"""
        <div style="margin-top: 24px; text-align: center;">
            <a href="{cta_url}" style="background-color: #0284c7; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px; display: inline-block;">
                {cta_text}
            </a>
        </div>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>{title}</title>
    </head>
    <body style="margin: 0; padding: 24px; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <!-- Header -->
            <div style="padding: 20px 24px; background-color: #1e293b; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">CENTRAL COMMAND CENTER</h2>
                    <p style="margin: 2px 0 0 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Infrastructure Incident & Security Alert</p>
                </div>
            </div>

            <!-- Body -->
            <div style="padding: 24px;">
                <div style="margin-bottom: 16px;">
                    <span style="display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background-color: {badge_color}; color: #ffffff;">
                        {badge_text}
                    </span>
                    <h3 style="margin: 12px 0 4px 0; font-size: 18px; font-weight: 700; color: #ffffff;">{title}</h3>
                    <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">{subtitle}</p>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-top: 16px; background-color: #0b0f19; border-radius: 8px; overflow: hidden; border: 1px solid #1e293b;">
                    <tbody>
                        {rows_html}
                    </tbody>
                </table>

                {cta_btn}
            </div>

            <!-- Footer -->
            <div style="padding: 16px 24px; background-color: #090d16; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b; text-align: center;">
                This notification was dispatched automatically by your Central Command Center cluster.
            </div>
        </div>
    </body>
    </html>
    """


def _send_smtp_sync(
    host: str,
    port: int,
    username: str,
    password: str,
    sender_email: str,
    sender_name: str,
    encryption: str,
    recipients: List[str],
    subject: str,
    html_content: str,
    plain_content: str
) -> Dict[str, Any]:
    t0 = time.time()
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{sender_name} <{sender_email}>" if sender_name else sender_email
        msg["To"] = ", ".join(recipients)

        part1 = MIMEText(plain_content, "plain")
        part2 = MIMEText(html_content, "html")
        msg.attach(part1)
        msg.attach(part2)

        enc = (encryption or "").upper()
        if enc == "SSL":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=12) as server:
                if username and password:
                    server.login(username, password)
                server.sendmail(sender_email, recipients, msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=12) as server:
                if enc in ["STARTTLS", "TLS"]:
                    context = ssl.create_default_context()
                    server.starttls(context=context)
                if username and password:
                    server.login(username, password)
                server.sendmail(sender_email, recipients, msg.as_string())

        duration_ms = int((time.time() - t0) * 1000)
        return {"success": True, "duration_ms": duration_ms, "message": "Email dispatched successfully"}
    except Exception as e:
        duration_ms = int((time.time() - t0) * 1000)
        return {"success": False, "duration_ms": duration_ms, "error": str(e), "message": f"SMTP Error: {e}"}


async def send_email_async(
    subject: str,
    html_content: str,
    plain_content: str,
    event_type: str = "NOTIFICATION",
    custom_recipients: Optional[List[str]] = None,
    smtp_override: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Asynchronously dispatches an email using configured SMTP settings and records audit log.
    """
    async with AsyncSessionLocal() as db:
        smtp: Optional[SmtpSetting] = None
        if smtp_override:
            config = smtp_override
        else:
            res = await db.execute(select(SmtpSetting).limit(1))
            smtp = res.scalar_one_or_none()
            if not smtp or not smtp.is_enabled:
                return {
                    "success": False,
                    "skipped": True,
                    "message": "SMTP notifications are disabled or not configured."
                }
            config = {
                "host": smtp.host,
                "port": smtp.port,
                "username": smtp.username,
                "password": smtp.password_hash,
                "sender_email": smtp.sender_email,
                "sender_name": smtp.sender_name,
                "encryption": smtp.encryption,
                "recipients": custom_recipients or smtp.recipients or [],
            }

        recipients = custom_recipients or config.get("recipients", [])
        if isinstance(recipients, str):
            recipients = [r.strip() for r in recipients.split(",") if r.strip()]
        if not recipients:
            return {"success": False, "message": "No notification recipients specified."}

        # Dispatch via thread pool
        dispatch_res = await asyncio.to_thread(
            _send_smtp_sync,
            host=config.get("host", ""),
            port=config.get("port", 587),
            username=config.get("username", ""),
            password=config.get("password", ""),
            sender_email=config.get("sender_email", ""),
            sender_name=config.get("sender_name", "Command Center HQ"),
            encryption=config.get("encryption", "STARTTLS"),
            recipients=recipients,
            subject=subject,
            html_content=html_content,
            plain_content=plain_content,
        )

        # Record notification log
        for rcpt in recipients:
            log_item = NotificationLog(
                event_type=event_type,
                recipient=rcpt,
                subject=subject,
                status="SENT" if dispatch_res.get("success") else "FAILED",
                error_message=dispatch_res.get("error"),
                metadata_json={"duration_ms": dispatch_res.get("duration_ms", 0)}
            )
            db.add(log_item)

        if smtp and not smtp_override:
            smtp.last_tested_at = datetime.now(timezone.utc).replace(tzinfo=None)
            smtp.last_test_status = "SUCCESS" if dispatch_res.get("success") else "FAILED"
            smtp.last_test_error = dispatch_res.get("error")

        await db.commit()
        return dispatch_res


# -------------------------------------------------------------
# High-Level Event Notification Helpers
# -------------------------------------------------------------

async def notify_login_event(
    username: str,
    ip_address: str,
    user_agent: str,
    server_node: str = "Command Center Web"
):
    """Dispatches a login security alert email if enabled."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(SmtpSetting).limit(1))
        smtp = res.scalar_one_or_none()
        if not smtp or not smtp.is_enabled or not smtp.notify_on_login:
            return

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    title = "New Operator Sign-In Detected"
    badge = "SECURITY ALERT"
    color = "#0284c7"
    subtitle = f"User '{username}' successfully authenticated into Central Command Center."
    rows = [
        ("Username", username),
        ("Source IP Address", ip_address or "Unknown"),
        ("Access Timestamp", now_str),
        ("Client User-Agent", user_agent or "Web Browser"),
        ("Access Node", server_node),
    ]

    html = _build_html_template(title, badge, color, subtitle, rows)
    plain = f"SECURITY ALERT: User {username} logged into Command Center from {ip_address} at {now_str}."

    asyncio.create_task(send_email_async(
        subject=f"[HQ Security] Sign-In Alert: {username} ({ip_address})",
        html_content=html,
        plain_content=plain,
        event_type="LOGIN"
    ))


async def notify_outage_event(
    app_name: str,
    domain: str,
    server_name: str,
    server_ip: str,
    health_status: str,
    error_summary: str
):
    """Dispatches an application outage alert email if enabled."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(SmtpSetting).limit(1))
        smtp = res.scalar_one_or_none()
        if not smtp or not smtp.is_enabled or not smtp.notify_on_outage:
            return

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    title = f"Application Outage: {app_name}"
    badge = "CRITICAL OUTAGE"
    color = "#e11d48"
    subtitle = f"Service health probe failed for {app_name} on {server_name}."
    rows = [
        ("Application", app_name),
        ("Status", health_status),
        ("VirtualHost / Domain", domain or "N/A"),
        ("Hosting Server", f"{server_name} ({server_ip})"),
        ("Incident Time", now_str),
        ("Diagnostic Output", error_summary[:200] if error_summary else "Listener unresponsive"),
    ]

    html = _build_html_template(title, badge, color, subtitle, rows)
    plain = f"CRITICAL OUTAGE: Application {app_name} is {health_status} on {server_name} ({server_ip}). Time: {now_str}."

    asyncio.create_task(send_email_async(
        subject=f"[HQ Outage] Critical: {app_name} is {health_status}",
        html_content=html,
        plain_content=plain,
        event_type="OUTAGE"
    ))


async def notify_ssl_expiry_event(
    domain_name: str,
    days_remaining: int,
    issuer: str,
    server_ip: str
):
    """Dispatches an SSL expiry warning email if enabled."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(SmtpSetting).limit(1))
        smtp = res.scalar_one_or_none()
        if not smtp or not smtp.is_enabled or not smtp.notify_on_ssl_expiry:
            return

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    title = f"SSL Certificate Warning: {domain_name}"
    badge = "SSL EXPIRING"
    color = "#d97706"
    subtitle = f"TLS Certificate for {domain_name} expires in {days_remaining} days."
    rows = [
        ("Domain Name", domain_name),
        ("Days Remaining", f"{days_remaining} days"),
        ("Certificate Authority", issuer or "Let's Encrypt"),
        ("Hosting Server IP", server_ip or "N/A"),
        ("Warning Timestamp", now_str),
    ]

    html = _build_html_template(title, badge, color, subtitle, rows)
    plain = f"SSL WARNING: {domain_name} certificate expires in {days_remaining} days."

    asyncio.create_task(send_email_async(
        subject=f"[HQ SSL Alert] Certificate Expiring in {days_remaining}d: {domain_name}",
        html_content=html,
        plain_content=plain,
        event_type="SSL_EXPIRY"
    ))


async def notify_dns_mismatch_event(
    domain_name: str,
    expected_ip: str,
    resolving_ip: str
):
    """Dispatches a DNS mismatch warning email if enabled."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(SmtpSetting).limit(1))
        smtp = res.scalar_one_or_none()
        if not smtp or not smtp.is_enabled or not smtp.notify_on_dns_mismatch:
            return

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    title = f"DNS IP Mismatch: {domain_name}"
    badge = "DNS MISMATCH"
    color = "#8b5cf6"
    subtitle = f"Live resolving IP differs from hosting VPS server IP for {domain_name}."
    rows = [
        ("Domain Name", domain_name),
        ("Hosting Server IP", expected_ip),
        ("Live Resolving Ping IP", resolving_ip or "NXDOMAIN / Unresolved"),
        ("Detected At", now_str),
    ]

    html = _build_html_template(title, badge, color, subtitle, rows)
    plain = f"DNS ALERT: {domain_name} resolves to {resolving_ip}, but hosting server is {expected_ip}."

    asyncio.create_task(send_email_async(
        subject=f"[HQ DNS Alert] Resolving IP Mismatch: {domain_name}",
        html_content=html,
        plain_content=plain,
        event_type="DNS_MISMATCH"
    ))
