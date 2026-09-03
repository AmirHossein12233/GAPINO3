from fastapi import (
    FastAPI,
    Form,
    File,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    Request,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from pathlib import Path
from datetime import datetime
from typing import Dict

import hashlib
import json
import os
import re
import secrets
import uuid

from pwdlib import PasswordHash


# =========================================================
# PATHS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"

USERS_FILE = DATA_DIR / "users.json"
MESSAGES_FILE = DATA_DIR / "messages.json"
UNREAD_FILE = DATA_DIR / "unread.json"

CHANNELS_FILE = DATA_DIR / "channels.json"
CHANNEL_MESSAGES_FILE = DATA_DIR / "channel_messages.json"

UPLOADS_DIR = DATA_DIR / "uploads"
AUDIO_DIR = UPLOADS_DIR / "audio"


# =========================================================
# DIRECTORIES
# =========================================================

DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)
AUDIO_DIR.mkdir(exist_ok=True)


# =========================================================
# INITIAL FILES
# =========================================================

if not USERS_FILE.exists():
    USERS_FILE.write_text("[]", encoding="utf-8")

if not MESSAGES_FILE.exists():
    MESSAGES_FILE.write_text("[]", encoding="utf-8")

if not UNREAD_FILE.exists():
    UNREAD_FILE.write_text("{}", encoding="utf-8")

if not CHANNELS_FILE.exists():
    CHANNELS_FILE.write_text("[]", encoding="utf-8")

if not CHANNEL_MESSAGES_FILE.exists():
    CHANNEL_MESSAGES_FILE.write_text("[]", encoding="utf-8")


# =========================================================
# APP
# =========================================================

app = FastAPI(title="GAPINO")


# =========================================================
# SESSION
# =========================================================

SESSION_SECRET = os.getenv(
    "GAPINO_SESSION_SECRET",
    "GAPINO-local-session-secret-change-before-production",
)

COOKIE_SECURE = (
    os.getenv(
        "GAPINO_COOKIE_SECURE",
        "false",
    ).lower()
    == "true"
)

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="gapino_session",
    max_age=60 * 60 * 24 * 30,
    same_site="lax",
    https_only=COOKIE_SECURE,
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# PASSWORD
# =========================================================

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def is_old_sha256_hash(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"[0-9a-f]{64}",
            value or "",
        )
    )


def verify_password(
    password: str,
    stored_password: str,
) -> bool:
    if not stored_password:
        return False

    if stored_password.startswith("$argon2"):
        try:
            return password_hasher.verify(
                password,
                stored_password,
            )
        except Exception:
            return False

    old_hash = hashlib.sha256(
        password.encode("utf-8")
    ).hexdigest()

    return secrets.compare_digest(
        stored_password,
        old_hash,
    )


# =========================================================
# JSON HELPERS
# =========================================================

def load_json(file_path: Path):
    try:
        with open(
            file_path,
            "r",
            encoding="utf-8",
        ) as file:
            return json.load(file)
    except Exception:
        return []


def save_json(
    file_path: Path,
    data,
) -> None:
    temp_path = file_path.with_suffix(
        file_path.suffix + ".tmp"
    )

    with open(
        temp_path,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=2,
        )

    temp_path.replace(file_path)


# =========================================================
# TIME
# =========================================================

def current_time() -> str:
    return datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


# =========================================================
# CONNECTIONS / ONLINE STATUS
# =========================================================

active_connections: Dict[str, WebSocket] = {}
user_last_seen: Dict[str, str] = {}


def is_user_online(user_id: str) -> bool:
    return user_id in active_connections


def mark_user_online(user_id: str) -> None:
    user_last_seen[user_id] = current_time()


def mark_user_offline(user_id: str) -> None:
    user_last_seen[user_id] = current_time()

    users = load_json(USERS_FILE)

    if not isinstance(users, list):
        return

    for user in users:
        if user.get("id") == user_id:
            user["last_seen"] = user_last_seen[user_id]
            break

    save_json(
        USERS_FILE,
        users,
    )


# =========================================================
# USERS
# =========================================================

def find_user_by_id(user_id: str):
    users = load_json(USERS_FILE)

    if not isinstance(users, list):
        return None

    for user in users:
        if user.get("id") == user_id:
            return user

    return None


def current_user(request: Request):
    user_id = request.session.get("user_id")

    if not user_id:
        return None

    return find_user_by_id(user_id)


def public_user(
    user,
    include_phone: bool = False,
):
    user_id = user.get("id", "")

    online = is_user_online(user_id)

    result = {
        "id": user_id,
        "username": user.get(
            "username",
            "",
        ),
        "display_name": user.get(
            "display_name",
            user.get(
                "username",
                "",
            ),
        ),
        "bio": user.get(
            "bio",
            "",
        ),
        "avatar": user.get(
            "avatar",
            "",
        ),
        "online": online,
        "status": (
            "online"
            if online
            else "offline"
        ),
        "last_seen": user_last_seen.get(
            user_id,
            user.get(
                "last_seen",
                "",
            ),
        ),
    }

    if include_phone and user.get("phone"):
        result["phone"] = user.get(
            "phone",
            "",
        )

    return result


# =========================================================
# WEBSOCKET HELPERS
# =========================================================

async def send_to_user(
    user_id: str,
    data: dict,
) -> None:
    websocket = active_connections.get(
        user_id
    )

    if not websocket:
        return

    try:
        await websocket.send_json(data)
    except Exception:
        if active_connections.get(
            user_id
        ) is websocket:
            active_connections.pop(
                user_id,
                None,
            )


async def broadcast_online_users() -> None:
    online_ids = list(
        active_connections.keys()
    )

    users = load_json(
        USERS_FILE
    )

    if not isinstance(
        users,
        list,
    ):
        users = []

    statuses = []

    for user in users:
        user_id = user.get(
            "id",
            "",
        )

        statuses.append(
            {
                "id": user_id,
                "username": user.get(
                    "username",
                    "",
                ),
                "display_name": user.get(
                    "display_name",
                    user.get(
                        "username",
                        "",
                    ),
                ),
                "online": user_id in online_ids,
                "status": (
                    "online"
                    if user_id in online_ids
                    else "offline"
                ),
                "last_seen": user_last_seen.get(
                    user_id,
                    user.get(
                        "last_seen",
                        "",
                    ),
                ),
            }
        )

    payload = {
        "type": "online_users",
        "users": online_ids,
        "statuses": statuses,
    }

    for user_id, websocket in list(
        active_connections.items()
    ):
        try:
            await websocket.send_json(
                payload
            )
        except Exception:
            if active_connections.get(
                user_id
            ) is websocket:
                active_connections.pop(
                    user_id,
                    None,
                )


# =========================================================
# UNREAD
# =========================================================

def load_unread():
    data = load_json(
        UNREAD_FILE
    )

    if not isinstance(
        data,
        dict,
    ):
        return {}

    return data


def save_unread(data) -> None:
    save_json(
        UNREAD_FILE,
        data,
    )


def get_user_unread(
    user_id: str,
):
    unread = load_unread()

    value = unread.get(
        user_id,
        {},
    )

    if not isinstance(
        value,
        dict,
    ):
        return {}

    return value


def unread_total(
    user_id: str,
) -> int:
    data = get_user_unread(
        user_id
    )

    total = 0

    for value in data.values():
        try:
            total += int(value)
        except Exception:
            pass

    return total


async def increase_unread(
    receiver_id: str,
    sender_id: str,
) -> None:
    unread = load_unread()

    if receiver_id not in unread:
        unread[receiver_id] = {}

    current_count = unread[
        receiver_id
    ].get(
        sender_id,
        0,
    )

    try:
        current_count = int(
            current_count
        )
    except Exception:
        current_count = 0

    current_count += 1

    unread[
        receiver_id
    ][
        sender_id
    ] = current_count

    save_unread(
        unread
    )

    await send_to_user(
        receiver_id,
        {
            "type": "unread_update",
            "sender_id": sender_id,
            "count": current_count,
            "total": unread_total(
                receiver_id
            ),
        },
    )


async def mark_conversation_read(
    user_id: str,
    other_user_id: str,
) -> None:
    unread = load_unread()

    if user_id not in unread:
        unread[user_id] = {}

    unread[
        user_id
    ][
        other_user_id
    ] = 0

    save_unread(
        unread
    )

    await send_to_user(
        user_id,
        {
            "type": "unread_update",
            "sender_id": other_user_id,
            "count": 0,
            "total": unread_total(
                user_id
            ),
        },
    )


# =========================================================
# FILES
# =========================================================

MAX_UPLOAD_SIZE = 10 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".pdf",
    ".txt",
    ".zip",
    ".rar",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".webm",
    ".ogg",
    ".mp3",
    ".wav",
    ".m4a",
}

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
}

AUDIO_EXTENSIONS = {
    ".webm",
    ".ogg",
    ".mp3",
    ".wav",
    ".m4a",
}


def safe_filename(
    filename: str,
) -> str:
    filename = Path(
        filename or "file"
    ).name

    filename = re.sub(
        r"[^A-Za-z0-9._\-\u0600-\u06FF ]",
        "_",
        filename,
    )

    filename = filename.strip()

    if not filename:
        filename = "file"

    return filename


def is_allowed_file(
    filename: str,
) -> bool:
    extension = Path(
        filename
    ).suffix.lower()

    return extension in ALLOWED_EXTENSIONS


# =========================================================
# CHANNELS
# =========================================================

def load_channels():
    data = load_json(
        CHANNELS_FILE
    )

    if not isinstance(
        data,
        list,
    ):
        return []

    return data


def save_channels(data) -> None:
    save_json(
        CHANNELS_FILE,
        data,
    )


def load_channel_messages():
    data = load_json(
        CHANNEL_MESSAGES_FILE
    )

    if not isinstance(
        data,
        list,
    ):
        return []

    return data


def save_channel_messages(
    data,
) -> None:
    save_json(
        CHANNEL_MESSAGES_FILE,
        data,
    )


def find_channel_by_id(
    channel_id: str,
):
    channels = load_channels()

    for channel in channels:
        if channel.get(
            "id"
        ) == channel_id:
            return channel

    return None


def is_channel_member(
    channel,
    user_id: str,
) -> bool:
    members = channel.get(
        "members",
        [],
    )

    if not isinstance(
        members,
        list,
    ):
        return False

    return user_id in members


def is_channel_owner(
    channel,
    user_id: str,
) -> bool:
    return (
        channel.get("owner_id")
        == user_id
    )


def public_channel(
    channel,
    user_id=None,
):
    members = channel.get(
        "members",
        [],
    )

    if not isinstance(
        members,
        list,
    ):
        members = []

    return {
        "id": channel.get(
            "id",
            "",
        ),
        "name": channel.get(
            "name",
            "کانال بدون نام",
        ),
        "description": channel.get(
            "description",
            "",
        ),
        "avatar": channel.get(
            "avatar",
            "",
        ),
        "owner_id": channel.get(
            "owner_id",
            "",
        ),
        "member_count": len(
            members
        ),
        "joined": (
            user_id in members
            if user_id
            else False
        ),
        "is_owner": (
            user_id
            == channel.get(
                "owner_id"
            )
            if user_id
            else False
        ),
        "created_at": channel.get(
            "created_at",
            "",
        ),
    }


# =========================================================
# PAGES
# =========================================================

@app.get("/")
async def root():
    index_file = FRONTEND_DIR / "index.html"

    if not index_file.exists():
        return JSONResponse(
            {
                "success": False,
                "message":
                    "index.html پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(
        index_file
    )


@app.get("/login.html")
async def login_page():
    return FileResponse(
        FRONTEND_DIR / "login.html"
    )


@app.get("/register.html")
async def register_page():
    return FileResponse(
        FRONTEND_DIR / "register.html"
    )


@app.get("/chat.html")
async def chat_page():
    return FileResponse(
        FRONTEND_DIR / "chat.html"
    )


@app.get("/style.css")
async def style_css():
    return FileResponse(
        FRONTEND_DIR / "style.css",
        media_type="text/css",
    )


@app.get("/chat.js")
async def chat_js():
    return FileResponse(
        FRONTEND_DIR / "chat.js",
        media_type="application/javascript",
    )


# =========================================================
# UPLOAD ACCESS
# =========================================================

@app.get(
    "/uploads/{filename}"
)
async def uploaded_file(
    filename: str,
):
    filename = Path(
        filename
    ).name

    path = (
        UPLOADS_DIR
        / filename
    )

    if (
        not path.exists()
        or path.is_dir()
    ):
        return JSONResponse(
            {
                "success": False,
                "message":
                    "فایل پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(
        path
    )


@app.get(
    "/uploads/audio/{filename}"
)
async def uploaded_audio(
    filename: str,
):
    filename = Path(
        filename
    ).name

    path = (
        AUDIO_DIR
        / filename
    )

    if (
        not path.exists()
        or path.is_dir()
    ):
        return JSONResponse(
            {
                "success": False,
                "message":
                    "فایل صوتی پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(
        path
    )


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
async def health():
    return {
        "status":
            "ok",
        "message":
            "GAPINO server is running",
        "time":
            current_time(),
        "online_users":
            len(active_connections),
    }


# =========================================================
# REGISTER
# =========================================================

@app.post("/register")
async def register(
    username: str = Form(...),
    password: str = Form(...),
):
    username = username.strip()

    if len(username) < 3:
        return JSONResponse(
            {
                "success": False,
                "message":
                    "نام کاربری باید حداقل ۳ کاراکتر باشد.",
            },
            status_code=400,
        )

    if len(username) > 30:
        return JSONResponse(
            {
                "success": False,
                "message":
                    "نام کاربری نباید بیشتر از ۳۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    if not re.fullmatch(
        r"[A-Za-z0-9_.-]+",
        username,
    ):
        return JSONResponse(
            {
                "success": False,
                "message":
                    "نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.",
            },
            status_code=400,
        )

    if len(password) < 8:
        return JSONResponse(
            {
                "success": False,
                "message":
                    "رمز عبور باید حداقل ۸ کاراکتر باشد.",
            },
            status_code=400,
        )

    users = load_json(
        USERS_FILE
    )

    if not isinstance(
        users,
        list,
    ):
        users = []

    for user in users:
        if (
            user.get(
                "username",
                "",
            ).lower()
            == username.lower()
        ):
            return JSONResponse(
                {
                    "success": False,
                    "message":
                        "این نام کاربری قبلاً ثبت شده است.",
                },
                status_code=400,
            )

    user = {
        "id":
            str(
                uuid.uuid4()
            ),
        "username":
            username,
        "password":
            hash_password(
                password
            ),
        "display_name":
            username,
        "bio":
            "",
        "avatar":
            "",
        "created_at":
            current_time(),
        "last_seen":
            current_time(),
    }

    users.append(
        user
    )

    save_json(
        USERS_FILE,
        users,
    )

    return {
        "success":
            True,
        "message":
            "حساب با موفقیت ساخته شد.",
        "user":
            public_user(
                user
            ),
    }


# =========================================================
# LOGIN
# =========================================================

@app.post("/login")
async def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    username = username.strip()

    users = load_json(
        USERS_FILE
    )

    if not isinstance(
        users,
        list,
    ):
        users = []

    for user in users:

        if (
            user.get(
                "username",
                "",
            ).lower()
            != username.lower()
        ):
            continue

        stored_password = user.get(
            "password",
            "",
        )

        if not verify_password(
            password,
            stored_password,
        ):
            break

        if is_old_sha256_hash(
            stored_password
        ):
            user["password"] = (
                hash_password(
                    password
                )
            )

            save_json(
                USERS_FILE,
                users,
            )

        request.session.clear()

        request.session[
            "user_id"
        ] = user["id"]

        return {
            "success":
                True,
            "message":
                "ورود موفق بود.",
            "user":
                public_user(
                    user,
                    include_phone=True,
                ),
        }

    return JSONResponse(
        {
            "success":
                False,
            "message":
                "نام کاربری یا رمز عبور اشتباه است.",
        },
        status_code=401,
    )


# =========================================================
# ME
# =========================================================

@app.get("/me")
async def me(
    request: Request,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "authenticated":
                    False,
            },
            status_code=401,
        )

    return {
        "success":
            True,
        "authenticated":
            True,
        "user":
            public_user(
                user,
                include_phone=True,
            ),
    }


# =========================================================
# LOGOUT
# =========================================================

@app.post("/logout")
async def logout(
    request: Request,
):
    user_id = request.session.get(
        "user_id"
    )

    if user_id:
        active_connections.pop(
            user_id,
            None,
        )

        mark_user_offline(
            user_id
        )

        await broadcast_online_users()

    request.session.clear()

    return {
        "success":
            True,
        "message":
            "با موفقیت خارج شدید.",
    }


# =========================================================
# USERS
# =========================================================

@app.get("/users")
async def get_users(
    request: Request,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    users = load_json(
        USERS_FILE
    )

    if not isinstance(
        users,
        list,
    ):
        users = []

    return [
        public_user(
            item
        )
        for item in users
    ]


# =========================================================
# ONLINE USERS
# =========================================================

@app.get("/online-users")
async def online_users(
    request: Request,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    users = load_json(
        USERS_FILE
    )

    if not isinstance(
        users,
        list,
    ):
        users = []

    result = {}

    for item in users:

        user_id = item.get(
            "id",
            "",
        )

        online = is_user_online(
            user_id
        )

        result[user_id] = {
            "online":
                online,
            "status":
                (
                    "online"
                    if online
                    else "offline"
                ),
            "last_seen":
                user_last_seen.get(
                    user_id,
                    item.get(
                        "last_seen",
                        "",
                    ),
                ),
        }

    return {
        "success":
            True,
        "users":
            result,
    }


# =========================================================
# PROFILE
# =========================================================

@app.get(
    "/profile/{user_id}"
)
async def get_profile(
    request: Request,
    user_id: str,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    target_user = find_user_by_id(
        user_id
    )

    if not target_user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "کاربر پیدا نشد.",
            },
            status_code=404,
        )

    return public_user(
        target_user
    )


@app.post(
    "/profile/update"
)
async def update_profile(
    request: Request,
    user_id: str = Form(...),
    display_name: str = Form(...),
    bio: str = Form(""),
    avatar: str = Form(""),
):
    logged_in_user = current_user(
        request
    )

    if not logged_in_user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    if logged_in_user["id"] != user_id:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "دسترسی غیرمجاز.",
            },
            status_code=403,
        )

    display_name = display_name.strip()
    bio = bio.strip()
    avatar = avatar.strip()

    if not display_name:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "نام نمایشی نمی‌تواند خالی باشد.",
            },
            status_code=400,
        )

    if len(display_name) > 40:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "نام نمایشی نباید بیشتر از ۴۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    if len(bio) > 160:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "بیو نباید بیشتر از ۱۶۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    users = load_json(
        USERS_FILE
    )

    if not isinstance(
        users,
        list,
    ):
        users = []

    for user in users:

        if user.get("id") != user_id:
            continue

        user["display_name"] = display_name
        user["bio"] = bio
        user["avatar"] = avatar

        save_json(
            USERS_FILE,
            users,
        )

        updated_user = public_user(
            user,
            include_phone=True,
        )

        await send_to_user(
            user_id,
            {
                "type":
                    "profile_updated",
                "user":
                    updated_user,
            },
        )

        await broadcast_online_users()

        return {
            "success":
                True,
            "message":
                "پروفایل با موفقیت ذخیره شد.",
            "user":
                updated_user,
        }

    return JSONResponse(
        {
            "success":
                False,
            "message":
                "کاربر پیدا نشد.",
        },
        status_code=404,
    )


# =========================================================
# UPLOAD
# =========================================================

@app.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
):
    logged_in_user = current_user(
        request
    )

    if not logged_in_user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    if not file.filename:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "فایلی انتخاب نشده است.",
            },
            status_code=400,
        )

    original_name = safe_filename(
        file.filename
    )

    if not is_allowed_file(
        original_name
    ):
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "این نوع فایل مجاز نیست.",
            },
            status_code=400,
        )

    content = await file.read()

    if not content:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "فایل خالی قابل ارسال نیست.",
            },
            status_code=400,
        )

    if len(content) > MAX_UPLOAD_SIZE:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.",
            },
            status_code=413,
        )

    extension = Path(
        original_name
    ).suffix.lower()

    stored_name = (
        uuid.uuid4().hex
        + extension
    )

    if extension in AUDIO_EXTENSIONS:
        output_dir = AUDIO_DIR
        file_url = (
            f"/uploads/audio/{stored_name}"
        )
    else:
        output_dir = UPLOADS_DIR
        file_url = (
            f"/uploads/{stored_name}"
        )

    output_path = (
        output_dir
        / stored_name
    )

    try:
        output_path.write_bytes(
            content
        )
    except Exception as error:
        print(
            "Upload error:",
            error,
        )

        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ذخیره فایل انجام نشد.",
            },
            status_code=500,
        )

    return {
        "success":
            True,
        "file": {
            "name":
                original_name,
            "stored_name":
                stored_name,
            "url":
                file_url,
            "size":
                len(content),
            "is_image":
                extension
                in IMAGE_EXTENSIONS,
            "is_audio":
                extension
                in AUDIO_EXTENSIONS,
        },
    }


# =========================================================
# UNREAD
# =========================================================

@app.get("/unread")
async def get_unread(
    request: Request,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    user_id = user["id"]

    return {
        "success":
            True,
        "unread":
            get_user_unread(
                user_id
            ),
        "total":
            unread_total(
                user_id
            ),
    }


@app.post(
    "/unread/read"
)
async def read_conversation(
    request: Request,
    other_user_id: str = Form(...),
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    if not find_user_by_id(
        other_user_id
    ):
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "کاربر پیدا نشد.",
            },
            status_code=404,
        )

    await mark_conversation_read(
        user["id"],
        other_user_id,
    )

    return {
        "success":
            True,
        "total":
            unread_total(
                user["id"]
            ),
    }


# =========================================================
# PRIVATE MESSAGES
# =========================================================

@app.get(
    "/messages/{user1}/{user2}"
)
async def get_messages(
    request: Request,
    user1: str,
    user2: str,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    if user["id"] != user1:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "دسترسی غیرمجاز.",
            },
            status_code=403,
        )

    if not find_user_by_id(
        user2
    ):
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "کاربر پیدا نشد.",
            },
            status_code=404,
        )

    messages = load_json(
        MESSAGES_FILE
    )

    if not isinstance(
        messages,
        list,
    ):
        messages = []

    result = []

    for message in messages:

        sender = message.get(
            "sender_id"
        )

        receiver = message.get(
            "receiver_id"
        )

        if (
            (
                sender == user1
                and receiver == user2
            )
            or
            (
                sender == user2
                and receiver == user1
            )
        ):
            result.append(
                message
            )

    return result


# =========================================================
# CHANNELS
# =========================================================

@app.post("/channels")
async def create_channel(
    request: Request,
    name: str = Form(...),
    description: str = Form(""),
    avatar: str = Form(""),
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    name = name.strip()
    description = description.strip()
    avatar = avatar.strip()

    if not name:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "نام کانال نمی‌تواند خالی باشد.",
            },
            status_code=400,
        )

    channels = load_channels()

    channel = {
        "id":
            str(
                uuid.uuid4()
            ),
        "name":
            name,
        "description":
            description,
        "avatar":
            avatar,
        "owner_id":
            user["id"],
        "members":
            [
                user["id"]
            ],
        "created_at":
            current_time(),
    }

    channels.append(
        channel
    )

    save_channels(
        channels
    )

    return {
        "success":
            True,
        "message":
            "کانال با موفقیت ساخته شد.",
        "channel":
            public_channel(
                channel,
                user["id"],
            ),
    }


@app.get("/channels")
async def get_channels(
    request: Request,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    channels = load_channels()

    return {
        "success":
            True,
        "channels":
            [
                public_channel(
                    channel,
                    user["id"],
                )
                for channel in channels
            ],
    }


@app.get(
    "/channels/{channel_id}"
)
async def get_channel(
    request: Request,
    channel_id: str,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    channel = find_channel_by_id(
        channel_id
    )

    if not channel:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "کانال پیدا نشد.",
            },
            status_code=404,
        )

    return {
        "success":
            True,
        "channel":
            public_channel(
                channel,
                user["id"],
            ),
    }


@app.post(
    "/channels/{channel_id}/join"
)
async def join_channel(
    request: Request,
    channel_id: str,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    channels = load_channels()

    for channel in channels:

        if channel.get(
            "id"
        ) != channel_id:
            continue

        members = channel.get(
            "members",
            [],
        )

        if not isinstance(
            members,
            list,
        ):
            members = []

        if user["id"] not in members:
            members.append(
                user["id"]
            )

        channel["members"] = members

        save_channels(
            channels
        )

        return {
            "success":
                True,
            "message":
                "با موفقیت عضو کانال شدید.",
            "channel":
                public_channel(
                    channel,
                    user["id"],
                ),
        }

    return JSONResponse(
        {
            "success":
                False,
            "message":
                "کانال پیدا نشد.",
        },
        status_code=404,
    )


@app.post(
    "/channels/{channel_id}/leave"
)
async def leave_channel(
    request: Request,
    channel_id: str,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    channels = load_channels()

    for channel in channels:

        if channel.get(
            "id"
        ) != channel_id:
            continue

        if is_channel_owner(
            channel,
            user["id"],
        ):
            return JSONResponse(
                {
                    "success":
                        False,
                    "message":
                        "مدیر کانال نمی‌تواند خارج شود.",
                },
                status_code=400,
            )

        members = channel.get(
            "members",
            [],
        )

        if not isinstance(
            members,
            list,
        ):
            members = []

        if user["id"] in members:
            members.remove(
                user["id"]
            )

        channel["members"] = members

        save_channels(
            channels
        )

        return {
            "success":
                True,
            "message":
                "از کانال خارج شدید.",
            "channel":
                public_channel(
                    channel,
                    user["id"],
                ),
        }

    return JSONResponse(
        {
            "success":
                False,
            "message":
                "کانال پیدا نشد.",
        },
        status_code=404,
    )


@app.post(
    "/channels/{channel_id}/update"
)
async def update_channel(
    request: Request,
    channel_id: str,
    name: str = Form(...),
    description: str = Form(""),
    avatar: str = Form(""),
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    channels = load_channels()

    for channel in channels:

        if channel.get(
            "id"
        ) != channel_id:
            continue

        if not is_channel_owner(
            channel,
            user["id"],
        ):
            return JSONResponse(
                {
                    "success":
                        False,
                    "message":
                        "فقط مدیر کانال می‌تواند ویرایش کند.",
                },
                status_code=403,
            )

        name = name.strip()
        description = description.strip()
        avatar = avatar.strip()

        if not name:
            return JSONResponse(
                {
                    "success":
                        False,
                    "message":
                        "نام کانال نمی‌تواند خالی باشد.",
                },
                status_code=400,
            )

        channel["name"] = name
        channel["description"] = description
        channel["avatar"] = avatar

        save_channels(
            channels
        )

        return {
            "success":
                True,
            "message":
                "کانال به‌روزرسانی شد.",
            "channel":
                public_channel(
                    channel,
                    user["id"],
                ),
        }

    return JSONResponse(
        {
            "success":
                False,
            "message":
                "کانال پیدا نشد.",
        },
        status_code=404,
    )


@app.delete(
    "/channels/{channel_id}"
)
async def delete_channel(
    request: Request,
    channel_id: str,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    channels = load_channels()

    target = None

    for channel in channels:
        if channel.get(
            "id"
        ) == channel_id:
            target = channel
            break

    if not target:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "کانال پیدا نشد.",
            },
            status_code=404,
        )

    if not is_channel_owner(
        target,
        user["id"],
    ):
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "فقط مدیر می‌تواند کانال را حذف کند.",
            },
            status_code=403,
        )

    channels = [
        channel
        for channel in channels
        if channel.get(
            "id"
        ) != channel_id
    ]

    save_channels(
        channels
    )

    messages = load_channel_messages()

    messages = [
        message
        for message in messages
        if message.get(
            "channel_id"
        ) != channel_id
    ]

    save_channel_messages(
        messages
    )

    return {
        "success":
            True,
        "message":
            "کانال حذف شد.",
    }


@app.get(
    "/channels/{channel_id}/messages"
)
async def get_channel_messages(
    request: Request,
    channel_id: str,
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    channel = find_channel_by_id(
        channel_id
    )

    if not channel:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "کانال پیدا نشد.",
            },
            status_code=404,
        )

    if not is_channel_member(
        channel,
        user["id"],
    ):
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا عضو کانال شوید.",
            },
            status_code=403,
        )

    messages = load_channel_messages()

    result = [
        message
        for message in messages
        if message.get(
            "channel_id"
        ) == channel_id
    ]

    return {
        "success":
            True,
        "messages":
            result,
    }


@app.post(
    "/channels/{channel_id}/messages"
)
async def send_channel_message(
    request: Request,
    channel_id: str,
    text: str = Form(...),
):
    user = current_user(
        request
    )

    if not user:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "ابتدا وارد شوید.",
            },
            status_code=401,
        )

    channel = find_channel_by_id(
        channel_id
    )

    if not channel:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "کانال پیدا نشد.",
            },
            status_code=404,
        )

    if not is_channel_owner(
        channel,
        user["id"],
    ):
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "فقط مدیر کانال می‌تواند پیام بفرستد.",
            },
            status_code=403,
        )

    text = text.strip()

    if not text:
        return JSONResponse(
            {
                "success":
                    False,
                "message":
                    "پیام نمی‌تواند خالی باشد.",
            },
            status_code=400,
        )

    message = {
        "id":
            str(
                uuid.uuid4()
            ),
        "channel_id":
            channel_id,
        "sender_id":
            user["id"],
        "text":
            text,
        "created_at":
            current_time(),
    }

    messages = load_channel_messages()

    messages.append(
        message
    )

    save_channel_messages(
        messages
    )

    return {
        "success":
            True,
        "message":
            message,
    }


# =========================================================
# WEBSOCKET
# =========================================================

@app.websocket(
    "/ws/{user_id}"
)
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
):
    session = websocket.scope.get(
        "session",
        {}
    )

    session_user_id = session.get(
        "user_id"
    )

    if not session_user_id:
        await websocket.close(
            code=1008
        )
        return

    if session_user_id != user_id:
        await websocket.close(
            code=1008
        )
        return

    user = find_user_by_id(
        user_id
    )

    if not user:
        await websocket.close(
            code=1008
        )
        return

    await websocket.accept()

    old_socket = active_connections.get(
        user_id
    )

    if (
        old_socket
        and old_socket is not websocket
    ):
        try:
            await old_socket.close(
                code=1000
            )
        except Exception:
            pass

    active_connections[
        user_id
    ] = websocket

    mark_user_online(
        user_id
    )

    await websocket.send_json(
        {
            "type":
                "connected",
            "user_id":
                user_id,
            "online":
                True,
            "unread":
                get_user_unread(
                    user_id
                ),
            "unread_total":
                unread_total(
                    user_id
                ),
        }
    )

    await broadcast_online_users()

    try:

        while True:

            data = (
                await websocket.receive_json()
            )

            if not isinstance(
                data,
                dict,
            ):
                continue

            message_type = data.get(
                "type"
            )

            # ---------------------------------------------
            # PING
            # ---------------------------------------------

            if message_type == "ping":

                mark_user_online(
                    user_id
                )

                await websocket.send_json(
                    {
                        "type":
                            "pong",
                        "time":
                            current_time(),
                        "online":
                            True,
                    }
                )

            # ---------------------------------------------
            # TYPING
            # ---------------------------------------------

            elif message_type == "typing":

                receiver_id = data.get(
                    "receiver_id"
                )

                if not receiver_id:
                    continue

                if receiver_id == user_id:
                    continue

                if not find_user_by_id(
                    receiver_id
                ):
                    continue

                await send_to_user(
                    receiver_id,
                    {
                        "type":
                            "typing",
                        "sender_id":
                            user_id,
                    }
                )

            # ---------------------------------------------
            # STOP TYPING
            # ---------------------------------------------

            elif message_type == "stop_typing":

                receiver_id = data.get(
                    "receiver_id"
                )

                if not receiver_id:
                    continue

                if receiver_id == user_id:
                    continue

                if not find_user_by_id(
                    receiver_id
                ):
                    continue

                await send_to_user(
                    receiver_id,
                    {
                        "type":
                            "stop_typing",
                        "sender_id":
                            user_id,
                    }
                )

            # ---------------------------------------------
            # READ
            # ---------------------------------------------

            elif message_type == "read":

                other_user_id = data.get(
                    "other_user_id"
                )

                if not other_user_id:
                    continue

                if other_user_id == user_id:
                    continue

                if not find_user_by_id(
                    other_user_id
                ):
                    continue

                await mark_conversation_read(
                    user_id,
                    other_user_id,
                )

            # ---------------------------------------------
            # PRIVATE MESSAGE
            # ---------------------------------------------

            elif message_type == "message":

                receiver_id = data.get(
                    "receiver_id"
                )

                text = str(
                    data.get(
                        "text",
                        "",
                    )
                ).strip()

                if not receiver_id:
                    continue

                if receiver_id == user_id:
                    continue

                if not text:
                    continue

                if len(text) > 5000:
                    continue

                if not find_user_by_id(
                    receiver_id
                ):
                    continue

                message = {
                    "id":
                        str(
                            uuid.uuid4()
                        ),
                    "sender_id":
                        user_id,
                    "receiver_id":
                        receiver_id,
                    "text":
                        text,
                    "created_at":
                        current_time(),
                }

                messages = load_json(
                    MESSAGES_FILE
                )

                if not isinstance(
                    messages,
                    list,
                ):
                    messages = []

                messages.append(
                    message
                )

                save_json(
                    MESSAGES_FILE,
                    messages,
                )

                await send_to_user(
                    user_id,
                    {
                        "type":
                            "message",
                        "message":
                            message,
                    }
                )

                await send_to_user(
                    receiver_id,
                    {
                        "type":
                            "message",
                        "message":
                            message,
                    }
                )

                await increase_unread(
                    receiver_id,
                    user_id,
                )

            # ---------------------------------------------
            # FILE / IMAGE / AUDIO
            # ---------------------------------------------

            elif message_type == "file":

                receiver_id = data.get(
                    "receiver_id"
                )

                file_info = data.get(
                    "file"
                )

                if not receiver_id:
                    continue

                if receiver_id == user_id:
                    continue

                if not isinstance(
                    file_info,
                    dict,
                ):
                    continue

                if not find_user_by_id(
                    receiver_id
                ):
                    continue

                stored_name = Path(
                    str(
                        file_info.get(
                            "stored_name",
                            "",
                        )
                    )
                ).name

                if not stored_name:
                    continue

                regular_path = (
                    UPLOADS_DIR
                    / stored_name
                )

                audio_path = (
                    AUDIO_DIR
                    / stored_name
                )

                if regular_path.exists():
                    file_path = regular_path
                elif audio_path.exists():
                    file_path = audio_path
                else:
                    continue

                if file_path.is_dir():
                    continue

                extension = (
                    file_path
                    .suffix
                    .lower()
                )

                if extension not in ALLOWED_EXTENSIONS:
                    continue

                real_size = (
                    file_path.stat()
                    .st_size
                )

                if real_size <= 0:
                    continue

                if real_size > MAX_UPLOAD_SIZE:
                    continue

                is_image = (
                    extension
                    in IMAGE_EXTENSIONS
                )

                is_audio = (
                    extension
                    in AUDIO_EXTENSIONS
                )

                if is_audio:
                    file_url = (
                        f"/uploads/audio/{stored_name}"
                    )
                else:
                    file_url = (
                        f"/uploads/{stored_name}"
                    )

                safe_file_info = {
                    "name":
                        safe_filename(
                            str(
                                file_info.get(
                                    "name",
                                    stored_name,
                                )
                            )
                        ),
                    "stored_name":
                        stored_name,
                    "url":
                        file_url,
                    "size":
                        real_size,
                    "is_image":
                        is_image,
                    "is_audio":
                        is_audio,
                }

                message = {
                    "id":
                        str(
                            uuid.uuid4()
                        ),
                    "sender_id":
                        user_id,
                    "receiver_id":
                        receiver_id,
                    "text":
                        "",
                    "file":
                        safe_file_info,
                    "created_at":
                        current_time(),
                }

                messages = load_json(
                    MESSAGES_FILE
                )

                if not isinstance(
                    messages,
                    list,
                ):
                    messages = []

                messages.append(
                    message
                )

                save_json(
                    MESSAGES_FILE,
                    messages,
                )

                await send_to_user(
                    user_id,
                    {
                        "type":
                            "file",
                        "message":
                            message,
                    }
                )

                await send_to_user(
                    receiver_id,
                    {
                        "type":
                            "file",
                        "message":
                            message,
                    }
                )

                await increase_unread(
                    receiver_id,
                    user_id,
                )

    except WebSocketDisconnect:

        if active_connections.get(
            user_id
        ) is websocket:

            active_connections.pop(
                user_id,
                None
            )

            mark_user_offline(
                user_id
            )

            await broadcast_online_users()

    except Exception as error:

        print(
            "WebSocket error:",
            error,
        )

        if active_connections.get(
            user_id
        ) is websocket:

            active_connections.pop(
                user_id,
                None
            )

            mark_user_offline(
                user_id
            )

            await broadcast_online_users()


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )