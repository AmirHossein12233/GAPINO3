from fastapi import (
    FastAPI,
    Form,
    File,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    Request,
    HTTPException,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Dict
import hashlib
import json
import os
import re
import secrets
import uuid


# =========================
# PATH
# =========================

BASE_DIR = Path(__file__).resolve().parent.parent

FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"

DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)


USERS_FILE = DATA_DIR / "users.json"
MESSAGES_FILE = DATA_DIR / "messages.json"
GROUPS_FILE = DATA_DIR / "groups.json"


for file, default in [
    (USERS_FILE, []),
    (MESSAGES_FILE, []),
    (GROUPS_FILE, []),
]:
    if not file.exists():
        file.write_text(
            json.dumps(
                default,
                ensure_ascii=False,
                indent=2
            ),
            encoding="utf-8"
        )


# =========================
# JSON
# =========================

def read_json(path):

    try:
        return json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

    except Exception:
        return []


def save_json(path, data):

    path.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )


# =========================
# TIME
# =========================

TEHRAN = timezone(
    timedelta(
        hours=3,
        minutes=30
    )
)


def tehran_datetime_string():

    return datetime.now(
        timezone.utc
    ).astimezone(
        TEHRAN
    ).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


# =========================
# PASSWORD
# =========================

def hash_password(password):

    salt = secrets.token_hex(16)

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt.encode(),
        200000
    ).hex()

    return (
        "$pbkdf2$"
        + salt
        + "$"
        + digest
    )


def verify_password(password, hashed):

    try:

        _, _, salt, old = hashed.split("$")

        new = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            salt.encode(),
            200000
        ).hex()

        return secrets.compare_digest(
            new,
            old
        )

    except Exception:
        return False


# =========================
# APP
# =========================

app = FastAPI(
    title="GAPINO",
    version="3.0"
)


app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv(
        "GAPINO_SECRET",
        "CHANGE_SECRET"
    ),
    session_cookie="gapino_session",
    same_site="lax",
    https_only=False
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# WEBSOCKET
# =========================

active_connections: Dict[str, WebSocket] = {}