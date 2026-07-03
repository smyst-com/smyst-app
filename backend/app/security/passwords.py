"""Passwort-Hashing für smyst.com E-Mail-Konten.

Nutzt hashlib.scrypt aus der Python-Standardbibliothek (keine Zusatz-Dependency):
speicherhart, brute-force-resistent, mit per-Konto-Salt. Parameter n=2^14, r=8, p=1
(~16 MB Speicher pro Verifikation) sind der empfohlene interaktive Trade-off.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from typing import Any

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
SALT_BYTES = 32

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 200


def hash_password(password: str) -> dict[str, Any]:
    """Erzeugt einen scrypt-Hash-Datensatz mit frischem Zufalls-Salt."""
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return {
        "algo": "scrypt",
        "n": SCRYPT_N,
        "r": SCRYPT_R,
        "p": SCRYPT_P,
        "salt": base64.b64encode(salt).decode("ascii"),
        "hash": base64.b64encode(digest).decode("ascii"),
    }


def verify_password(password: str, record: dict[str, Any]) -> bool:
    """Prüft ein Passwort gegen einen gespeicherten Hash-Datensatz (timing-sicher)."""
    try:
        if record.get("algo") != "scrypt":
            return False
        salt = base64.b64decode(str(record["salt"]))
        expected = base64.b64decode(str(record["hash"]))
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(record["n"]),
            r=int(record["r"]),
            p=int(record["p"]),
            dklen=len(expected),
        )
        return hmac.compare_digest(digest, expected)
    except Exception:
        return False


_DUMMY_RECORD = hash_password(secrets.token_hex(16))


def spend_verification_time() -> None:
    """Verbrennt dieselbe Rechenzeit wie eine echte Prüfung.

    Wird bei unbekannter E-Mail aufgerufen, damit Login-Antwortzeiten keine
    Rückschlüsse zulassen, ob ein Konto existiert (User-Enumeration-Schutz).
    """
    verify_password("smyst-timing-equalizer", _DUMMY_RECORD)
