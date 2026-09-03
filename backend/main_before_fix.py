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

GROUPS_FILE = DATA_DIR / "groups.json"
GROUP_MESSAGES_FILE = DATA_DIR / "group_messages.json"

CHANNELS_FILE = DATA_DIR / "channels.json"
CHANNEL_MESSAGES_FILE = DATA_DIR / "channel_messages.json"

UPLOADS_DIR = DATA_DIR / "uploads"
AUDIO_DIR = UPLOADS_DIR / "audio"


# =========================================================
# DIRECTORIES
# =========================================================

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


# =========================================================
# JSON HELPERS
# =========================================================

def load_json(file_path: Path):
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return []


def save_json(file_path: Path, data) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)

    temp_path = file_path.with_name(
        file_path.name + ".tmp"
    )

    with open(temp_path, "w", encoding="utf-8") as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=2,
        )

    temp_path.replace(file_path)


def ensure_json_file(file_path: Path, default_value) -> None:
    if not file_path.exists():
        save_json(file_path, default_value)
        return

    try:
        with open(file_path, "r", encoding="utf-8") as file:
            json.load(file)
    except Exception:
        save_json(file_path, default_value)


# =========================================================
# INITIAL FILES
# =========================================================

ensure_json_file(USERS_FILE, [])
ensure_json_file(MESSAGES_FILE, [])
ensure_json_file(UNREAD_FILE, {})
ensure_json_file(GROUPS_FILE, [])
ensure_json_file(GROUP_MESSAGES_FILE, [])
ensure_json_file(CHANNELS_FILE, [])
ensure_json_file(CHANNEL_MESSAGES_FILE, [])


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="GAPINO",
    version="1.0.0",
)


# =========================================================
# SESSION
# =========================================================

SESSION_SECRET = os.getenv(
    "GAPINO_SESSION_SECRET",
    "GAPINO-local-session-secret-change-before-production",
)

# برای Render که با HTTPS اجرا می‌شود.
# روی localhost برای تست HTTP، موقتاً می‌توانی آن را False کنی.
COOKIE_SECURE = (
    os.getenv(
        "GAPINO_COOKIE_SECURE",
        "true",
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
# TIME
# =========================================================

def current_time() -> str:
    return datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


# =========================================================
# CONNECTIONS
# =========================================================

active_connections: Dict[str, WebSocket] = {}
user_last_seen: Dict[str, str] = {}


def is_user_online(user_id: str) -> bool:
    return str(user_id) in active_connections


def touch_user(user_id: str) -> None:
    user_last_seen[str(user_id)] = current_time()


def save_last_seen(user_id: str) -> None:
    users = load_json(USERS_FILE)

    if not isinstance(users, list):
        return

    user_id = str(user_id)
    seen_time = user_last_seen.get(
        user_id,
        current_time(),
    )

    changed = False

    for user in users:
        if str(user.get("id", "")) == user_id:
            user["last_seen"] = seen_time
            changed = True
            break

    if changed:
        save_json(USERS_FILE, users)


def mark_user_online(user_id: str) -> None:
    touch_user(user_id)


def mark_user_offline(user_id: str) -> None:
    touch_user(user_id)
    save_last_seen(user_id)


# =========================================================
# USERS
# =========================================================

def find_user_by_id(user_id: str):
    users = load_json(USERS_FILE)

    if not isinstance(users, list):
        return None

    user_id = str(user_id)

    for user in users:
        if str(user.get("id", "")) == user_id:
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
    user_id = str(user.get("id", ""))

    online = is_user_online(user_id)

    result = {
        "id": user_id,
        "username": user.get("username", ""),
        "display_name": user.get(
            "display_name",
            user.get("username", ""),
        ),
        "bio": user.get("bio", ""),
        "avatar": user.get("avatar", ""),
        "online": online,
        "status": "online" if online else "offline",
        "last_seen": user_last_seen.get(
            user_id,
            user.get("last_seen", ""),
        ),
    }

    if include_phone and user.get("phone"):
        result["phone"] = user.get("phone", "")

    return result


# =========================================================
# WEBSOCKET HELPERS
# =========================================================

async def send_to_user(
    user_id: str,
    data: dict,
) -> None:

    user_id = str(user_id)

    websocket = active_connections.get(
        user_id
    )

    if not websocket:
        return

    try:
        await websocket.send_json(data)

    except Exception:

        if (
            active_connections.get(user_id)
            is websocket
        ):
            active_connections.pop(
                user_id,
                None,
            )


async def broadcast_online_users() -> None:

    online_ids = list(
        active_connections.keys()
    )

    users = load_json(USERS_FILE)

    if not isinstance(users, list):
        users = []

    statuses = []

    for user in users:

        user_id = str(
            user.get("id", "")
        )

        online = user_id in online_ids

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
            await websocket.send_json(payload)
        except Exception:
            if (
                active_connections.get(user_id)
                is websocket
            ):
                active_connections.pop(
                    user_id,
                    None,
                )


# =========================================================
# UNREAD
# =========================================================

def load_unread():
    data = load_json(UNREAD_FILE)

    if not isinstance(data, dict):
        return {}

    return data


def save_unread(data) -> None:
    save_json(
        UNREAD_FILE,
        data,
    )


def get_user_unread(user_id: str):
    data = load_unread()

    value = data.get(
        str(user_id),
        {},
    )

    if not isinstance(value, dict):
        return {}

    return value


def unread_total(user_id: str) -> int:
    data = get_user_unread(user_id)

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

    receiver_id = str(receiver_id)
    sender_id = str(sender_id)

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
        current_count = int(current_count)
    except Exception:
        current_count = 0

    current_count += 1

    unread[
        receiver_id
    ][
        sender_id
    ] = current_count

    save_unread(unread)

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

    user_id = str(user_id)
    other_user_id = str(other_user_id)

    unread = load_unread()

    if user_id not in unread:
        unread[user_id] = {}

    unread[user_id][other_user_id] = 0

    save_unread(unread)

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


def safe_filename(filename: str) -> str:

    filename = Path(
        filename or "file"
    ).name

    filename = re.sub(
        r"[^A-Za-z0-9._\-\u0600-\u06FF ]",
        "_",
        filename,
    )

    filename = filename.strip()

    return filename or "file"


def is_allowed_file(filename: str) -> bool:

    extension = Path(
        filename
    ).suffix.lower()

    return extension in ALLOWED_EXTENSIONS


# =========================================================
# GROUPS
# =========================================================

def load_groups():
    data = load_json(
        GROUPS_FILE
    )

    if not isinstance(
        data,
        list,
    ):
        return []

    return data


def save_groups(data) -> None:
    save_json(
        GROUPS_FILE,
        data,
    )


def load_group_messages():
    data = load_json(
        GROUP_MESSAGES_FILE
    )

    if not isinstance(
        data,
        list,
    ):
        return []

    return data


def save_group_messages(data) -> None:
    save_json(
        GROUP_MESSAGES_FILE,
        data,
    )


def find_group_by_id(group_id: str):

    group_id = str(group_id)

    for group in load_groups():
        if str(
            group.get("id", "")
        ) == group_id:
            return group

    return None


def group_members(group):

    members = group.get(
        "members",
        [],
    )

    if not isinstance(
        members,
        list,
    ):
        return []

    return [
        str(member)
        for member in members
    ]


def is_group_member(
    group,
    user_id: str,
) -> bool:

    return str(user_id) in group_members(
        group
    )


def is_group_owner(
    group,
    user_id: str,
) -> bool:

    return str(
        group.get(
            "owner_id",
            "",
        )
    ) == str(user_id)


def is_group_admin(
    group,
    user_id: str,
) -> bool:

    admins = group.get(
        "admins",
        [],
    )

    if not isinstance(
        admins,
        list,
    ):
        admins = []

    return str(user_id) in [
        str(item)
        for item in admins
    ]


def public_group(
    group,
    user_id: str = "",
):

    members = group_members(
        group
    )

    owner_id = str(
        group.get(
            "owner_id",
            "",
        )
    )

    return {
        "id":
            str(
                group.get(
                    "id",
                    "",
                )
            ),

        "name":
            group.get(
                "name",
                "گروه",
            ),

        "description":
            group.get(
                "description",
                "",
            ),

        "avatar":
            group.get(
                "avatar",
                "",
            ),

        "owner_id":
            owner_id,

        "member_count":
            len(members),

        "joined":
            str(user_id) in members,

        "is_owner":
            str(user_id) == owner_id,

        "is_admin":
            (
                is_group_admin(
                    group,
                    user_id,
                )
                or
                str(user_id) == owner_id
            ),

        "created_at":
            group.get(
                "created_at",
                "",
            ),
    }


async def notify_group_members(
    group,
    data: dict,
) -> None:

    for member_id in group_members(
        group
    ):
        await send_to_user(
            member_id,
            data,
        )


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


def save_channel_messages(data) -> None:

    save_json(
        CHANNEL_MESSAGES_FILE,
        data,
    )


def find_channel_by_id(
    channel_id: str,
):

    channel_id = str(channel_id)

    for channel in load_channels():

        if str(
            channel.get(
                "id",
                "",
            )
        ) == channel_id:
            return channel

    return None


def channel_members(channel):

    members = channel.get(
        "members",
        [],
    )

    if not isinstance(
        members,
        list,
    ):
        return []

    return [
        str(member)
        for member in members
    ]


def is_channel_member(
    channel,
    user_id: str,
) -> bool:

    return str(user_id) in channel_members(
        channel
    )


def is_channel_owner(
    channel,
    user_id: str,
) -> bool:

    return str(
        channel.get(
            "owner_id",
            "",
        )
    ) == str(user_id)


def public_channel(
    channel,
    user_id: str = "",
):

    members = channel_members(
        channel
    )

    owner_id = str(
        channel.get(
            "owner_id",
            "",
        )
    )

    return {
        "id":
            str(
                channel.get(
                    "id",
                    "",
                )
            ),

        "name":
            channel.get(
                "name",
                "کانال",
            ),

        "description":
            channel.get(
                "description",
                "",
            ),

        "avatar":
            channel.get(
                "avatar",
                "",
            ),

        "owner_id":
            owner_id,

        "member_count":
            len(members),

        "joined":
            str(user_id) in members,

        "is_owner":
            str(user_id) == owner_id,

        "created_at":
            channel.get(
                "created_at",
                "",
            ),
    }


# =========================================================
# PAGES
# =========================================================

@app.get("/")
async def root():

    path = FRONTEND_DIR / "index.html"

    if not path.exists():

        return JSONResponse(
            {
                "success": False,
                "message": "index.html پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(path)


@app.get("/login.html")
async def login_page():

    path = FRONTEND_DIR / "login.html"

    if not path.exists():

        return JSONResponse(
            {
                "success": False,
                "message": "login.html پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(path)


@app.get("/register.html")
async def register_page():

    path = FRONTEND_DIR / "register.html"

    if not path.exists():

        return JSONResponse(
            {
                "success": False,
                "message": "register.html پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(path)


@app.get("/chat.html")
async def chat_page():

    path = FRONTEND_DIR / "chat.html"

    if not path.exists():

        return JSONResponse(
            {
                "success": False,
                "message": "chat.html پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(path)


@app.get("/style.css")
async def style_css():

    path = FRONTEND_DIR / "style.css"

    if not path.exists():

        return JSONResponse(
            {
                "success": False,
                "message": "style.css پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(
        path,
        media_type="text/css",
    )


@app.get("/chat.js")
async def chat_js():

    path = FRONTEND_DIR / "chat.js"

    if not path.exists():

        return JSONResponse(
            {
                "success": False,
                "message": "chat.js پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(
        path,
        media_type="application/javascript",
    )


# =========================================================
# UPLOAD ACCESS
# =========================================================

@app.get("/uploads/{filename}")
async def uploaded_file(
    filename: str,
):

    filename = Path(
        filename
    ).name

    path = UPLOADS_DIR / filename

    if (
        not path.exists()
        or path.is_dir()
    ):

        return JSONResponse(
            {
                "success": False,
                "message": "فایل پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(path)


@app.get("/uploads/audio/{filename}")
async def uploaded_audio(
    filename: str,
):

    filename = Path(
        filename
    ).name

    path = AUDIO_DIR / filename

    if (
        not path.exists()
        or path.is_dir()
    ):

        return JSONResponse(
            {
                "success": False,
                "message": "فایل صوتی پیدا نشد.",
            },
            status_code=404,
        )

    return FileResponse(path)


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

    now = current_time()

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
            now,

        "last_seen":
            now,
    }

    users.append(
        user
    )

    save_json(
        USERS_FILE,
        users,
    )

    return {
        "success": True,

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
            user["password"] = hash_password(password)

        user["last_seen"] = current_time()

        save_json(
            USERS_FILE,
            users,
        )

        request.session.clear()

        request.session["user_id"] = str(
            user["id"]
        )

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

        user_id = str(user_id)

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
        public_user(item)
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

        user_id = str(
            item.get(
                "id",
                "",
            )
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

@app.get("/profile/{user_id}")
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

    target_user =
        find_user_by_id(
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


@app.post("/profile/update")
async def update_profile(
    request: Request,
    user_id: str = Form(...),
    display_name: str = Form(...),
    bio: str = Form(""),
    avatar: str = Form(""),
):

    logged_user =
        current_user(
            request
        )

    if not logged_user:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    if str(
        logged_user["id"]
    ) != str(user_id):

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "دسترسی غیرمجاز.",
            },
            status_code=403,
        )

    display_name =
        display_name.strip()

    bio =
        bio.strip()

    avatar =
        avatar.strip()

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

        if str(
            user.get(
                "id",
                "",
            )
        ) != str(user_id):

            continue

        user["display_name"] =
            display_name

        user["bio"] =
            bio

        user["avatar"] =
            avatar

        save_json(
            USERS_FILE,
            users,
        )

        updated_user =
            public_user(
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

    logged_user =
        current_user(
            request
        )

    if not logged_user:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "ابتدا وارد حساب شوید.",
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

    original_name =
        safe_filename(
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

    content =
        await file.read()

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

    extension =
        Path(
            original_name
        ).suffix.lower()

    stored_name =
        uuid.uuid4().hex + extension

    if extension in AUDIO_EXTENSIONS:

        output_dir =
            AUDIO_DIR

        file_url =
            f"/uploads/audio/{stored_name}"

    else:

        output_dir =
            UPLOADS_DIR

        file_url =
            f"/uploads/{stored_name}"

    output_path =
        output_dir / stored_name

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
                extension in IMAGE_EXTENSIONS,

            "is_audio":
                extension in AUDIO_EXTENSIONS,
        },
    }


# =========================================================
# UNREAD API
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

    user_id =
        str(user["id"])

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


@app.post("/unread/read")
async def read_conversation(
    request: Request,
    other_user_id: str = Form(...),
):

    user =
        current_user(
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
        str(user["id"]),
        str(other_user_id),
    )

    return {
        "success":
            True,

        "total":
            unread_total(
                str(user["id"])
            ),
    }


# =========================================================
# PRIVATE MESSAGE HISTORY
# =========================================================

@app.get("/messages/{user1}/{user2}")
async def get_messages(
    request: Request,
    user1: str,
    user2: str,
):

    user =
        current_user(
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

    if str(
        user["id"]
    ) != str(user1):

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

    messages =
        load_json(
            MESSAGES_FILE
        )

    if not isinstance(
        messages,
        list,
    ):
        messages = []

    result = []

    for message in messages:

        sender =
            str(
                message.get(
                    "sender_id",
                    "",
                )
            )

        receiver =
            str(
                message.get(
                    "receiver_id",
                    "",
                )
            )

        if (
            (
                sender == str(user1)
                and
                receiver == str(user2)
            )
            or
            (
                sender == str(user2)
                and
                receiver == str(user1)
            )
        ):

            result.append(
                message
            )

    return result


# =========================================================
# GROUP CREATE
# =========================================================

@app.post("/groups")
async def create_group(
    request: Request,
    name: str = Form(...),
    description: str = Form(""),
    avatar: str = Form(""),
):

    user =
        current_user(
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

    name =
        name.strip()

    description =
        description.strip()

    avatar =
        avatar.strip()

    if not name:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "نام گروه نمی‌تواند خالی باشد.",
            },
            status_code=400,
        )

    if len(name) > 50:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "نام گروه نباید بیشتر از ۵۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    if len(description) > 300:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "توضیحات گروه نباید بیشتر از ۳۰۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    now =
        current_time()

    user_id =
        str(user["id"])

    group = {
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
            user_id,

        "admins":
            [
                user_id
            ],

        "members":
            [
                user_id
            ],

        "created_at":
            now,
    }

    groups =
        load_groups()

    groups.append(
        group
    )

    save_groups(
        groups
    )

    return {
        "success":
            True,

        "message":
            "گروه با موفقیت ساخته شد.",

        "group":
            public_group(
                group,
                user_id,
            ),
    }


# =========================================================
# GROUP LIST
# =========================================================

@app.get("/groups")
async def get_groups(
    request: Request,
):

    user =
        current_user(
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

    user_id =
        str(user["id"])

    groups =
        load_groups()

    return {
        "success":
            True,

        "groups":
            [
                public_group(
                    group,
                    user_id,
                )
                for group in groups
            ],
    }


# =========================================================
# GROUP JOIN
# =========================================================

@app.post("/groups/{group_id}/join")
async def join_group(
    request: Request,
    group_id: str,
):

    user =
        current_user(
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

    groups =
        load_groups()

    user_id =
        str(user["id"])

    for group in groups:

        if str(
            group.get(
                "id",
                "",
            )
        ) != str(group_id):

            continue

        members =
            group_members(
                group
            )

        if user_id not in members:

            members.append(
                user_id
            )

        group["members"] =
            members

        save_groups(
            groups
        )

        return {
            "success":
                True,

            "message":
                "با موفقیت عضو گروه شدید.",

            "group":
                public_group(
                    group,
                    user_id,
                ),
        }

    return JSONResponse(
        {
            "success":
                False,

            "message":
                "گروه پیدا نشد.",
        },
        status_code=404,
    )


# =========================================================
# GROUP LEAVE
# =========================================================

@app.post("/groups/{group_id}/leave")
async def leave_group(
    request: Request,
    group_id: str,
):

    user =
        current_user(
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

    groups =
        load_groups()

    user_id =
        str(user["id"])

    for group in groups:

        if str(
            group.get(
                "id",
                "",
            )
        ) != str(group_id):

            continue

        if is_group_owner(
            group,
            user_id,
        ):

            return JSONResponse(
                {
                    "success":
                        False,

                    "message":
                        "مدیر اصلی نمی‌تواند از گروه خارج شود.",
                },
                status_code=400,
            )

        members =
            group_members(
                group
            )

        if user_id in members:

            members.remove(
                user_id
            )

        group["members"] =
            members

        save_groups(
            groups
        )

        return {
            "success":
                True,

            "message":
                "از گروه خارج شدید.",

            "group":
                public_group(
                    group,
                    user_id,
                ),
        }

    return JSONResponse(
        {
            "success":
                False,

            "message":
                "گروه پیدا نشد.",
        },
        status_code=404,
    )


# =========================================================
# GROUP DELETE
# =========================================================

@app.delete("/groups/{group_id}")
async def delete_group(
    request: Request,
    group_id: str,
):

    user =
        current_user(
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

    groups =
        load_groups()

    target = None

    for group in groups:

        if str(
            group.get(
                "id",
                "",
            )
        ) == str(group_id):

            target =
                group

            break

    if not target:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "گروه پیدا نشد.",
            },
            status_code=404,
        )

    if not is_group_owner(
        target,
        str(user["id"]),
    ):

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "فقط مدیر اصلی می‌تواند گروه را حذف کند.",
            },
            status_code=403,
        )

    groups = [
        group
        for group in groups
        if str(
            group.get(
                "id",
                "",
            )
        ) != str(group_id)
    ]

    save_groups(
        groups
    )

    messages =
        load_group_messages()

    messages = [
        message
        for message in messages
        if str(
            message.get(
                "group_id",
                "",
            )
        ) != str(group_id)
    ]

    save_group_messages(
        messages
    )

    return {
        "success":
            True,

        "message":
            "گروه حذف شد.",
    }


# =========================================================
# GROUP MESSAGES
# =========================================================

@app.get("/groups/{group_id}/messages")
async def get_group_messages(
    request: Request,
    group_id: str,
):

    user =
        current_user(
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

    group =
        find_group_by_id(
            group_id
        )

    if not group:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "گروه پیدا نشد.",
            },
            status_code=404,
        )

    user_id =
        str(user["id"])

    if not is_group_member(
        group,
        user_id,
    ):

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "ابتدا عضو گروه شوید.",
            },
            status_code=403,
        )

    messages =
        load_group_messages()

    result = []

    for message in messages:

        if str(
            message.get(
                "group_id",
                "",
            )
        ) != str(group_id):

            continue

        item =
            dict(message)

        sender =
            find_user_by_id(
                message.get(
                    "sender_id",
                    "",
                )
            )

        if sender:

            item["sender_name"] =
                sender.get(
                    "display_name",
                    sender.get(
                        "username",
                        "عضو گروه",
                    ),
                )

            item["username"] =
                sender.get(
                    "username",
                    "",
                )

        result.append(
            item
        )

    return {
        "success":
            True,

        "messages":
            result,
    }


# =========================================================
# CHANNEL CREATE
# =========================================================

@app.post("/channels")
async def create_channel(
    request: Request,
    name: str = Form(...),
    description: str = Form(""),
    avatar: str = Form(""),
):

    user =
        current_user(
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

    name =
        name.strip()

    description =
        description.strip()

    avatar =
        avatar.strip()

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

    if len(name) > 50:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "نام کانال نباید بیشتر از ۵۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    if len(description) > 300:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "توضیحات کانال نباید بیشتر از ۳۰۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    user_id =
        str(user["id"])

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
            user_id,

        "members":
            [
                user_id
            ],

        "created_at":
            current_time(),
    }

    channels =
        load_channels()

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
                user_id,
            ),
    }


# =========================================================
# CHANNEL LIST
# =========================================================

@app.get("/channels")
async def get_channels(
    request: Request,
):

    user =
        current_user(
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

    user_id =
        str(user["id"])

    return {
        "success":
            True,

        "channels":
            [
                public_channel(
                    channel,
                    user_id,
                )
                for channel in load_channels()
            ],
    }


# =========================================================
# CHANNEL JOIN
# =========================================================

@app.post("/channels/{channel_id}/join")
async def join_channel(
    request: Request,
    channel_id: str,
):

    user =
        current_user(
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

    channels =
        load_channels()

    user_id =
        str(user["id"])

    for channel in channels:

        if str(
            channel.get(
                "id",
                "",
            )
        ) != str(channel_id):

            continue

        members =
            channel_members(
                channel
            )

        if user_id not in members:

            members.append(
                user_id
            )

        channel["members"] =
            members

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
                    user_id,
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


# =========================================================
# CHANNEL LEAVE
# =========================================================

@app.post("/channels/{channel_id}/leave")
async def leave_channel(
    request: Request,
    channel_id: str,
):

    user =
        current_user(
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

    channels =
        load_channels()

    user_id =
        str(user["id"])

    for channel in channels:

        if str(
            channel.get(
                "id",
                "",
            )
        ) != str(channel_id):

            continue

        if is_channel_owner(
            channel,
            user_id,
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

        members =
            channel_members(
                channel
            )

        if user_id in members:

            members.remove(
                user_id
            )

        channel["members"] =
            members

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
                    user_id,
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


# =========================================================
# CHANNEL UPDATE
# =========================================================

@app.post("/channels/{channel_id}/update")
async def update_channel(
    request: Request,
    channel_id: str,
    name: str = Form(...),
    description: str = Form(""),
    avatar: str = Form(""),
):

    user =
        current_user(
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

    channels =
        load_channels()

    user_id =
        str(user["id"])

    for channel in channels:

        if str(
            channel.get(
                "id",
                "",
            )
        ) != str(channel_id):

            continue

        if not is_channel_owner(
            channel,
            user_id,
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

        name =
            name.strip()

        description =
            description.strip()

        avatar =
            avatar.strip()

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

        if len(name) > 50:

            return JSONResponse(
                {
                    "success":
                        False,

                    "message":
                        "نام کانال نباید بیشتر از ۵۰ کاراکتر باشد.",
                },
                status_code=400,
            )

        if len(description) > 300:

            return JSONResponse(
                {
                    "success":
                        False,

                    "message":
                        "توضیحات کانال نباید بیشتر از ۳۰۰ کاراکتر باشد.",
                },
                status_code=400,
            )

        channel["name"] =
            name

        channel["description"] =
            description

        channel["avatar"] =
            avatar

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
                    user_id,
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


# =========================================================
# CHANNEL DELETE
# =========================================================

@app.delete("/channels/{channel_id}")
async def delete_channel(
    request: Request,
    channel_id: str,
):

    user =
        current_user(
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

    channels =
        load_channels()

    target = None

    for channel in channels:

        if str(
            channel.get(
                "id",
                "",
            )
        ) == str(channel_id):

            target =
                channel

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
        str(user["id"]),
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
        if str(
            channel.get(
                "id",
                "",
            )
        ) != str(channel_id)
    ]

    save_channels(
        channels
    )

    messages =
        load_channel_messages()

    messages = [
        message
        for message in messages
        if str(
            message.get(
                "channel_id",
                "",
            )
        ) != str(channel_id)
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


# =========================================================
# CHANNEL MESSAGES
# =========================================================

@app.get("/channels/{channel_id}/messages")
async def get_channel_messages(
    request: Request,
    channel_id: str,
):

    user =
        current_user(
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

    channel =
        find_channel_by_id(
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

    user_id =
        str(user["id"])

    if not is_channel_member(
        channel,
        user_id,
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

    messages =
        load_channel_messages()

    result = [
        message
        for message in messages
        if str(
            message.get(
                "channel_id",
                "",
            )
        ) == str(channel_id)
    ]

    return {
        "success":
            True,

        "messages":
            result,
    }


# =========================================================
# CHANNEL MESSAGE SEND
# =========================================================

@app.post(
    "/channels/{channel_id}/messages"
)
async def send_channel_message(
    request: Request,
    channel_id: str,
    text: str = Form(...),
):

    user =
        current_user(
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

    channel =
        find_channel_by_id(
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

    user_id =
        str(user["id"])

    if not is_channel_owner(
        channel,
        user_id,
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

    text =
        text.strip()

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

    if len(text) > 5000:

        return JSONResponse(
            {
                "success":
                    False,

                "message":
                    "پیام نباید بیشتر از ۵۰۰۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    message = {
        "id":
            str(
                uuid.uuid4()
            ),

        "channel_id":
            str(channel_id),

        "sender_id":
            user_id,

        "text":
            text,

        "created_at":
            current_time(),
    }

    messages =
        load_channel_messages()

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

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
):

    session =
        websocket.scope.get(
            "session",
            {},
        )

    session_user_id =
        session.get(
            "user_id"
        )

    if not session_user_id:

        await websocket.close(
            code=1008
        )

        return

    if str(
        session_user_id
    ) != str(user_id):

        await websocket.close(
            code=1008
        )

        return

    user =
        find_user_by_id(
            user_id
        )

    if not user:

        await websocket.close(
            code=1008
        )

        return

    await websocket.accept()

    user_id =
        str(user_id)

    old_socket =
        active_connections.get(
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

            data =
                await websocket.receive_json()

            if not isinstance(
                data,
                dict,
            ):
                continue

            message_type =
                data.get(
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

                continue

            # ---------------------------------------------
            # TYPING
            # ---------------------------------------------

            if message_type == "typing":

                receiver_id =
                    data.get(
                        "receiver_id"
                    )

                if not receiver_id:
                    continue

                receiver_id =
                    str(receiver_id)

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
                    },
                )

                continue

            # ---------------------------------------------
            # STOP TYPING
            # ---------------------------------------------

            if message_type == "stop_typing":

                receiver_id =
                    data.get(
                        "receiver_id"
                    )

                if not receiver_id:
                    continue

                receiver_id =
                    str(receiver_id)

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
                    },
                )

                continue

            # ---------------------------------------------
            # READ
            # ---------------------------------------------

            if message_type == "read":

                other_user_id =
                    data.get(
                        "other_user_id"
                    )

                if not other_user_id:
                    continue

                other_user_id =
                    str(other_user_id)

                if not find_user_by_id(
                    other_user_id
                ):
                    continue

                await mark_conversation_read(
                    user_id,
                    other_user_id,
                )

                continue

            # ---------------------------------------------
            # PRIVATE MESSAGE
            # ---------------------------------------------

            if message_type == "message":

                receiver_id =
                    data.get(
                        "receiver_id"
                    )

                text =
                    str(
                        data.get(
                            "text",
                            "",
                        )
                    ).strip()

                if not receiver_id:
                    continue

                receiver_id =
                    str(receiver_id)

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

                messages =
                    load_json(
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
                    },
                )

                await send_to_user(
                    receiver_id,
                    {
                        "type":
                            "message",

                        "message":
                            message,
                    },
                )

                await increase_unread(
                    receiver_id,
                    user_id,
                )

                continue

            # ---------------------------------------------
            # FILE
            # ---------------------------------------------

            if message_type == "file":

                receiver_id =
                    data.get(
                        "receiver_id"
                    )

                file_info =
                    data.get(
                        "file"
                    )

                if not receiver_id:
                    continue

                receiver_id =
                    str(receiver_id)

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

                stored_name =
                    Path(
                        str(
                            file_info.get(
                                "stored_name",
                                "",
                            )
                        )
                    ).name

                if not stored_name:
                    continue

                regular_path =
                    UPLOADS_DIR / stored_name

                audio_path =
                    AUDIO_DIR / stored_name

                if regular_path.exists():

                    file_path =
                        regular_path

                elif audio_path.exists():

                    file_path =
                        audio_path

                else:
                    continue

                if file_path.is_dir():
                    continue

                extension =
                    file_path.suffix.lower()

                if extension not in ALLOWED_EXTENSIONS:
                    continue

                real_size =
                    file_path.stat().st_size

                if real_size <= 0:
                    continue

                if real_size > MAX_UPLOAD_SIZE:
                    continue

                is_image =
                    extension in IMAGE_EXTENSIONS

                is_audio =
                    extension in AUDIO_EXTENSIONS

                file_url =
                    (
                        f"/uploads/audio/{stored_name}"
                        if is_audio
                        else
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

                messages =
                    load_json(
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
                    },
                )

                await send_to_user(
                    receiver_id,
                    {
                        "type":
                            "file",

                        "message":
                            message,
                    },
                )

                await increase_unread(
                    receiver_id,
                    user_id,
                )

                continue

            # ---------------------------------------------
            # GROUP MESSAGE
            # ---------------------------------------------

            if message_type == "group_message":

                group_id =
                    data.get(
                        "group_id"
                    )

                text =
                    str(
                        data.get(
                            "text",
                            "",
                        )
                    ).strip()

                if not group_id:
                    continue

                group_id =
                    str(group_id)

                if not text:
                    continue

                if len(text) > 5000:
                    continue

                group =
                    find_group_by_id(
                        group_id
                    )

                if not group:
                    continue

                if not is_group_member(
                    group,
                    user_id,
                ):
                    continue

                message = {
                    "id":
                        str(
                            uuid.uuid4()
                        ),

                    "group_id":
                        group_id,

                    "sender_id":
                        user_id,

                    "text":
                        text,

                    "created_at":
                        current_time(),
                }

                messages =
                    load_group_messages()

                messages.append(
                    message
                )

                save_group_messages(
                    messages
                )

                sender =
                    find_user_by_id(
                        user_id
                    )

                payload_message =
                    dict(
                        message
                    )

                if sender:

                    payload_message[
                        "sender_name"
                    ] =
                        sender.get(
                            "display_name",
                            sender.get(
                                "username",
                                "عضو گروه",
                            ),
                        )

                    payload_message[
                        "username"
                    ] =
                        sender.get(
                            "username",
                            "",
                        )

                await notify_group_members(
                    group,
                    {
                        "type":
                            "group_message",

                        "message":
                            payload_message,
                    },
                )

                continue

    except WebSocketDisconnect:

        if (
            active_connections.get(
                user_id
            )
            is websocket
        ):

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

        if (
            active_connections.get(
                user_id
            )
            is websocket
        ):

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
