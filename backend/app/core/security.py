import base64
import json
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Dict, Tuple
import bcrypt
import jwt
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization
from backend.app.core.config import settings

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

# ==============================================================================
# Enterprise Cryptographic License Signer & Verifier (Ed25519)
# ==============================================================================

def generate_ed25519_keypair() -> Tuple[str, str]:
    """Generates PEM encoded private and public keypair for Ed25519 signing."""
    private_key = ed25519.Ed25519PrivateKey.generate()
    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    public_key = private_key.public_key()
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return private_bytes.decode("utf-8"), public_bytes.decode("utf-8")

# In-memory default keypair cached if not loaded from settings
_CACHED_PRIV_KEY: Optional[ed25519.Ed25519PrivateKey] = None
_CACHED_PUB_KEY: Optional[ed25519.Ed25519PublicKey] = None
_CACHED_PUB_PEM: Optional[str] = None

def get_master_license_keys() -> Tuple[ed25519.Ed25519PrivateKey, str]:
    global _CACHED_PRIV_KEY, _CACHED_PUB_KEY, _CACHED_PUB_PEM
    if _CACHED_PRIV_KEY is not None and _CACHED_PUB_PEM is not None:
        return _CACHED_PRIV_KEY, _CACHED_PUB_PEM

    if settings.LICENSE_PRIVATE_KEY_PEM:
        try:
            priv_key = serialization.load_pem_private_key(
                settings.LICENSE_PRIVATE_KEY_PEM.encode("utf-8"),
                password=None
            )
            pub_key = priv_key.public_key()
            pub_pem = pub_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ).decode("utf-8")
            _CACHED_PRIV_KEY = priv_key
            _CACHED_PUB_KEY = pub_key
            _CACHED_PUB_PEM = pub_pem
            return _CACHED_PRIV_KEY, _CACHED_PUB_PEM
        except Exception:
            pass

    # Generate persistent or session key
    priv_pem, pub_pem = generate_ed25519_keypair()
    priv_key = serialization.load_pem_private_key(priv_pem.encode("utf-8"), password=None)
    _CACHED_PRIV_KEY = priv_key
    _CACHED_PUB_KEY = priv_key.public_key()
    _CACHED_PUB_PEM = pub_pem
    return _CACHED_PRIV_KEY, _CACHED_PUB_PEM

def sign_license_payload(payload: dict) -> Tuple[str, str]:
    """
    Signs a license payload using Ed25519.
    Returns: (canonical_json_payload_base64, signature_base64)
    """
    priv_key, _ = get_master_license_keys()
    # Canonical JSON string
    canonical_json = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    signature_bytes = priv_key.sign(canonical_json.encode("utf-8"))
    
    payload_b64 = base64.b64encode(canonical_json.encode("utf-8")).decode("utf-8")
    sig_b64 = base64.b64encode(signature_bytes).decode("utf-8")
    return payload_b64, sig_b64

def verify_license_signature(payload_b64: str, sig_b64: str, public_key_pem: Optional[str] = None) -> Tuple[bool, Optional[dict]]:
    """
    Verifies an Ed25519 digital signature of a license payload.
    """
    try:
        if public_key_pem:
            pub_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
        else:
            _, pub_pem = get_master_license_keys()
            pub_key = serialization.load_pem_public_key(pub_pem.encode("utf-8"))
            
        canonical_json_bytes = base64.b64decode(payload_b64.encode("utf-8"))
        signature_bytes = base64.b64decode(sig_b64.encode("utf-8"))
        
        pub_key.verify(signature_bytes, canonical_json_bytes)
        payload = json.loads(canonical_json_bytes.decode("utf-8"))
        return True, payload
    except Exception:
        return False, None

def generate_hardware_fingerprint(machine_info: dict) -> str:
    """Generates a stable hardware fingerprint hash from machine details."""
    raw = f"{machine_info.get('hostname','')}:{machine_info.get('mac_address','')}:{machine_info.get('cpu_id','')}:{machine_info.get('disk_uuid','')}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
