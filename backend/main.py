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

from fastapi.responses import (
    FileResponse,
)

from starlette.middleware.sessions import SessionMiddleware

from pathlib import Path

from datetime import (
    datetime,
    timezone,
    timedelta,
)

from typing import Dict

import hashlib
import json
import os
import re
import secrets
import uuid

import shutil


# =========================================================
# PATH
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

FRONTEND_DIR = BASE_DIR / "frontend"

DATA_DIR = BASE_DIR / "data"

UPLOAD_DIR = BASE_DIR / "uploads"


DATA_DIR.mkdir(
    exist_ok=True
)

UPLOAD_DIR.mkdir(
    exist_ok=True
)


USERS_FILE = DATA_DIR / "users.json"

MESSAGES_FILE = DATA_DIR / "messages.json"


# =========================================================
# CREATE FILES
# =========================================================

for file, default in [

    (USERS_FILE, []),

    (MESSAGES_FILE, []),

]:

    if not file.exists():

        file.write_text(
            json.dumps(
                default,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )


# =========================================================
# JSON HELPERS
# =========================================================

def read_json(path):

    try:

        return json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

    except Exception:

        if path == USERS_FILE:
            return []

        if path == MESSAGES_FILE:
            return []

        return {}


def save_json(path, data):

    path.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


# =========================================================
# TIME
# =========================================================

TEHRAN = timezone(
    timedelta(
        hours=3,
        minutes=30,
    )
)


def tehran_time():

    return datetime.now(
        timezone.utc
    ).astimezone(
        TEHRAN
    ).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


# =========================================================
# PASSWORD
# =========================================================

def hash_password(
    password: str,
):

    password = str(password)

    salt = secrets.token_hex(
        16
    )

    digest = hashlib.pbkdf2_hmac(

        "sha256",

        password.encode(
            "utf-8"
        ),

        salt.encode(
            "utf-8"
        ),

        200000,

    ).hex()


    return (
        "$pbkdf2$"
        +
        salt
        +
        "$"
        +
        digest
    )


def verify_password(
    password: str,
    hashed: str,
):

    try:

        if not hashed:
            return False


        parts = hashed.split("$")


        if len(parts) != 4:
            return False


        if parts[1] != "pbkdf2":
            return False


        salt = parts[2]

        old_digest = parts[3]


        new_digest = hashlib.pbkdf2_hmac(

            "sha256",

            str(password).encode(
                "utf-8"
            ),

            salt.encode(
                "utf-8"
            ),

            200000,

        ).hex()


        return secrets.compare_digest(
            new_digest,
            old_digest,
        )


    except Exception:

        return False


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="GAPINO",
    version="6.0",
)


# =========================================================
# SESSION
# =========================================================

SESSION_SECRET = os.getenv(
    "SESSION_SECRET",
    "GAPINO-session-secret-change-this"
)


app.add_middleware(

    SessionMiddleware,

    secret_key=SESSION_SECRET,

    session_cookie="gapino_session",

    https_only=True,

    same_site="none",

)


# =========================================================
# CORS
# =========================================================

app.add_middleware(

    CORSMiddleware,

    allow_origins=[
        "https://gapino3.onrender.com",
        "http://localhost",
        "https://localhost",
        "capacitor://localhost",
    ],

    allow_credentials=True,

    allow_methods=[
        "*"
    ],

    allow_headers=[
        "*"
    ],

)


# =========================================================
# WEBSOCKET
# =========================================================

active_connections: Dict[
    str,
    WebSocket,
] = {}


# =========================================================
# USER HELPERS
# =========================================================

def find_user_by_mobile(
    mobile: str,
):

    users = read_json(
        USERS_FILE
    )


    for user in users:

        if (
            str(
                user.get(
                    "mobile",
                    ""
                )
            ).strip()
            ==
            mobile
        ):

            return user


    return None


def find_user_by_username(
    username: str,
):

    users = read_json(
        USERS_FILE
    )


    username_lower = username.lower()


    for user in users:

        if (
            str(
                user.get(
                    "username",
                    ""
                )
            ).lower()
            ==
            username_lower
        ):

            return user


    return None


def find_user_by_id(
    user_id: str,
):

    users = read_json(
        USERS_FILE
    )


    for user in users:

        if (
            str(
                user.get(
                    "id",
                    ""
                )
            )
            ==
            str(user_id)
        ):

            return user


    return None


def public_user(
    user,
):

    return {

        "id":
            user.get(
                "id"
            ),

        "username":
            user.get(
                "username"
            ),

        "mobile":
            user.get(
                "mobile"
            ),

        "avatar":
            user.get(
                "avatar",
                "",
            ),

        "status":
            user.get(
                "status",
                "",
            ),

        "online":
            user.get(
                "id"
            )
            in active_connections,

    }


def current_user(
    request: Request,
):

    user_id = request.session.get(
        "user_id"
    )


    if not user_id:

        return None


    return find_user_by_id(
        user_id
    )


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
async def health():

    return {

        "success":
            True,

        "server":
            "GAPINO",

        "time":
            tehran_time(),

        "auth":
            "mobile_password",

    }


# =========================================================
# REGISTER
# =========================================================

@app.post("/register")
async def register(

    username: str = Form(...),

    mobile: str = Form(...),

    password: str = Form(...),

):

    username = username.strip()

    mobile = mobile.strip()

    password = password.strip()


    # =====================================================
    # USERNAME
    # =====================================================

    if len(username) < 3:

        return {

            "success":
                False,

            "message":
                "نام کاربری باید حداقل ۳ کاراکتر باشد",

        }


    if len(username) > 30:

        return {

            "success":
                False,

            "message":
                "نام کاربری بیش از حد طولانی است",

        }


    if not re.match(

        r"^[a-zA-Z0-9._-]+$",

        username,

    ):

        return {

            "success":
                False,

            "message":
                "نام کاربری نامعتبر است",

        }


    # =====================================================
    # MOBILE
    # =====================================================

    if not re.match(

        r"^09\d{9}$",

        mobile,

    ):

        return {

            "success":
                False,

            "message":
                "شماره موبایل اشتباه است",

        }


    # =====================================================
    # PASSWORD
    # =====================================================

    if len(password) < 6:

        return {

            "success":
                False,

            "message":
                "رمز عبور باید حداقل ۶ کاراکتر باشد",

        }


    if len(password) > 128:

        return {

            "success":
                False,

            "message":
                "رمز عبور بیش از حد طولانی است",

        }


    # =====================================================
    # READ USERS
    # =====================================================

    users = read_json(
        USERS_FILE
    )


    # =====================================================
    # DUPLICATE CHECK
    # =====================================================

    for existing_user in users:

        existing_username = str(
            existing_user.get(
                "username",
                ""
            )
        ).lower()


        existing_mobile = str(
            existing_user.get(
                "mobile",
                ""
            )
        )


        if existing_username == username.lower():

            return {

                "success":
                    False,

                "message":
                    "این نام کاربری قبلاً ثبت شده است",

            }


        if existing_mobile == mobile:

            return {

                "success":
                    False,

                "message":
                    "این شماره موبایل قبلاً ثبت شده است",

            }


    # =====================================================
    # CREATE USER
    # =====================================================

    user = {

        "id":
            str(
                uuid.uuid4()
            ),

        "username":
            username,

        "mobile":
            mobile,

        "password":
            hash_password(
                password
            ),

        "avatar":
            "",

        "status":
            "سلام! من در GAPINO هستم",

        "created":
            tehran_time(),

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
            "حساب با موفقیت ساخته شد",

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

    mobile: str = Form(...),

    password: str = Form(...),

):

    mobile = mobile.strip()

    password = password.strip()


    # =====================================================
    # VALIDATE MOBILE
    # =====================================================

    if not re.match(

        r"^09\d{9}$",

        mobile,

    ):

        return {

            "success":
                False,

            "message":
                "شماره موبایل اشتباه است",

        }


    # =====================================================
    # VALIDATE PASSWORD
    # =====================================================

    if not password:

        return {

            "success":
                False,

            "message":
                "رمز عبور را وارد کنید",

        }


    # =====================================================
    # FIND USER
    # =====================================================

    user = find_user_by_mobile(
        mobile
    )


    if not user:

        return {

            "success":
                False,

            "message":
                "شماره موبایل یا رمز عبور اشتباه است",

        }


    # =====================================================
    # VERIFY PASSWORD
    # =====================================================

    if not verify_password(

        password,

        user.get(
            "password",
            ""
        ),

    ):

        return {

            "success":
                False,

            "message":
                "شماره موبایل یا رمز عبور اشتباه است",

        }


    # =====================================================
    # CREATE SESSION
    # =====================================================

    request.session.clear()


    request.session[
        "user_id"
    ] = user["id"]


    request.session[
        "logged_in"
    ] = True


    return {

        "success":
            True,

        "message":
            "ورود موفق",

        "user":
            public_user(
                user
            ),

    }


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

        return {

            "success":
                False,

            "message":
                "وارد حساب نشده‌اید",

        }


    return {

        "success":
            True,

        "user":
            public_user(
                user
            ),

    }


# =========================================================
# LOGOUT
# =========================================================

@app.post("/logout")
async def logout(
    request: Request,
):

    request.session.clear()


    return {

        "success":
            True,

        "message":
            "با موفقیت خارج شدید",

    }


# =========================================================
# USERS
# =========================================================

@app.get("/users")
async def users(
    request: Request,
):

    user = current_user(
        request
    )


    if not user:

        return {

            "success":
                False,

            "message":
                "ابتدا وارد شوید",

            "users":
                [],

        }


    all_users = read_json(
        USERS_FILE
    )


    return {

        "success":
            True,

        "users":
            [
                public_user(
                    item
                )
                for item in all_users
            ],

    }


# =========================================================
# GET ALL MESSAGES
# =========================================================

@app.get("/messages")
async def get_messages(
    request: Request,
):

    user = current_user(
        request
    )


    if not user:

        return {

            "success":
                False,

            "message":
                "ابتدا وارد شوید",

            "messages":
                [],

        }


    data = read_json(
        MESSAGES_FILE
    )


    user_id = user["id"]


    visible_messages = [

        message

        for message in data

        if (
            message.get(
                "sender_id"
            )
            ==
            user_id
            or
            message.get(
                "receiver_id"
            )
            ==
            user_id
        )

    ]


    return {

        "success":
            True,

        "messages":
            visible_messages,

    }


# =========================================================
# GET CHAT MESSAGES
# =========================================================

@app.get("/messages/{other_user_id}")
async def get_chat_messages(

    request: Request,

    other_user_id: str,

):

    user = current_user(
        request
    )


    if not user:

        return {

            "success":
                False,

            "message":
                "ابتدا وارد شوید",

            "messages":
                [],

        }


    other_user = find_user_by_id(
        other_user_id
    )


    if not other_user:

        return {

            "success":
                False,

            "message":
                "کاربر پیدا نشد",

            "messages":
                [],

        }


    data = read_json(
        MESSAGES_FILE
    )


    current_id = user["id"]


    messages = [

        message

        for message in data

        if (

            (
                message.get(
                    "sender_id"
                )
                ==
                current_id

                and

                message.get(
                    "receiver_id"
                )
                ==
                other_user_id

            )

            or

            (

                message.get(
                    "sender_id"
                )
                ==
                other_user_id

                and

                message.get(
                    "receiver_id"
                )
                ==
                current_id

            )

        )

    ]


    return {

        "success":
            True,

        "messages":
            messages,

    }


# =========================================================
# SEND MESSAGE HTTP
# =========================================================

@app.post("/messages")
async def send_message(

    request: Request,

    receiver_id: str = Form(...),

    text: str = Form(""),

):

    user = current_user(
        request
    )


    if not user:

        return {

            "success":
                False,

            "message":
                "ابتدا وارد شوید",

        }


    text = text.strip()


    if not text:

        return {

            "success":
                False,

            "message":
                "متن پیام خالی است",

        }


    receiver = find_user_by_id(
        receiver_id
    )


    if not receiver:

        return {

            "success":
                False,

            "message":
                "گیرنده پیدا نشد",

        }


    messages_data = read_json(
        MESSAGES_FILE
    )


    message = {

        "id":
            str(
                uuid.uuid4()
            ),

        "sender_id":
            user["id"],

        "receiver_id":
            receiver_id,

        "text":
            text,

        "created":
            tehran_time(),

        "time":
            tehran_time(),

        "seen":
            False,

        "deleted":
            False,

    }


    messages_data.append(
        message
    )


    save_json(

        MESSAGES_FILE,

        messages_data,

    )


    receiver_ws = (
        active_connections.get(
            receiver_id
        )
    )


    if receiver_ws:

        try:

            await receiver_ws.send_json({

                "type":
                    "message",

                "message":
                    message,

            })

        except Exception:

            pass


    return {

        "success":
            True,

        "message":
            message,

    }


# =========================================================
# UPLOAD
# =========================================================

MAX_UPLOAD_SIZE = 10 * 1024 * 1024


ALLOWED_EXTENSIONS = {

    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",

    ".webm",
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",

    ".pdf",

    ".txt",

    ".zip",

}


@app.post("/upload")
async def upload_file(

    request: Request,

    file: UploadFile = File(...),

):

    user = current_user(
        request
    )


    if not user:

        return {

            "success":
                False,

            "message":
                "ابتدا وارد شوید",

        }


    if not file.filename:

        return {

            "success":
                False,

            "message":
                "فایلی انتخاب نشده است",

        }


    original_name = Path(
        file.filename
    ).name


    extension = Path(
        original_name
    ).suffix.lower()


    if extension not in ALLOWED_EXTENSIONS:

        return {

            "success":
                False,

            "message":
                "نوع فایل مجاز نیست",

        }


    unique_name = (

        str(
            uuid.uuid4()
        )

        +

        extension

    )


    destination = (
        UPLOAD_DIR /
        unique_name
    )


    total_size = 0


    try:

        with destination.open(
            "wb"
        ) as buffer:

            while True:

                chunk = await file.read(
                    1024 * 1024
                )


                if not chunk:

                    break


                total_size += len(
                    chunk
                )


                if total_size > MAX_UPLOAD_SIZE:

                    buffer.close()


                    if destination.exists():

                        destination.unlink()


                    return {

                        "success":
                            False,

                        "message":
                            "حجم فایل نباید بیشتر از ۱۰ مگابایت باشد",

                    }


                buffer.write(
                    chunk
                )


    except Exception as e:

        if destination.exists():

            try:

                destination.unlink()

            except Exception:

                pass


        print(
            "UPLOAD ERROR:",
            e,
        )


        return {

            "success":
                False,

            "message":
                "آپلود فایل ناموفق بود",

        }


    return {

        "success":
            True,

        "message":
            "فایل با موفقیت آپلود شد",

        "url":
            "/uploads/" +
            unique_name,

        "filename":
            original_name,

        "size":
            total_size,

        "type":
            file.content_type or "",

    }


# =========================================================
# SERVE UPLOADS
# =========================================================

@app.get("/uploads/{file_name:path}")
async def get_uploaded_file(
    file_name: str,
):

    safe_name = Path(
        file_name
    ).name


    file = (
        UPLOAD_DIR /
        safe_name
    )


    if not file.exists():

        raise HTTPException(
            status_code=404,
            detail="File not found",
        )


    return FileResponse(
        file
    )


# =========================================================
# WEBSOCKET
# =========================================================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(

    websocket: WebSocket,

    user_id: str,

):

    user = find_user_by_id(
        user_id
    )


    if not user:

        await websocket.close()

        return


    await websocket.accept()


    active_connections[
        user_id
    ] = websocket


    try:

        while True:

            data = await websocket.receive_json()


            message_type = data.get(
                "type"
            )


            # =================================================
            # PING
            # =================================================

            if message_type == "ping":

                await websocket.send_json({

                    "type":
                        "pong",

                    "time":
                        tehran_time(),

                })


            # =================================================
            # TYPING
            # =================================================

            elif message_type == "typing":

                receiver_id = data.get(
                    "receiver_id"
                )


                receiver_ws = (
                    active_connections.get(
                        receiver_id
                    )
                )


                if receiver_ws:

                    try:

                        await receiver_ws.send_json({

                            "type":
                                "typing",

                            "user_id":
                                user_id,

                        })

                    except Exception:

                        pass


            # =================================================
            # MESSAGE
            # =================================================

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


                file_url = data.get(
                    "file"
                )


                file_type = data.get(
                    "file_type"
                )


                reply_to = data.get(
                    "reply_to"
                )


                if not receiver_id:

                    continue


                receiver = find_user_by_id(
                    receiver_id
                )


                if not receiver:

                    continue


                if not text and not file_url:

                    continue


                messages_data = read_json(
                    MESSAGES_FILE
                )


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

                    "file":
                        file_url or "",

                    "file_type":
                        file_type or "",

                    "reply_to":
                        reply_to,

                    "created":
                        tehran_time(),

                    "time":
                        tehran_time(),

                    "seen":
                        False,

                    "deleted":
                        False,

                }


                messages_data.append(
                    message
                )


                save_json(

                    MESSAGES_FILE,

                    messages_data,

                )


                receiver_ws = (
                    active_connections.get(
                        receiver_id
                    )
                )


                if receiver_ws:

                    try:

                        await receiver_ws.send_json({

                            "type":
                                "message",

                            "message":
                                message,

                        })

                    except Exception:

                        pass


                await websocket.send_json({

                    "type":
                        "message_sent",

                    "message":
                        message,

                })


    except WebSocketDisconnect:

        pass


    except Exception as e:

        print(
            "WEBSOCKET ERROR:",
            e,
        )


    finally:

        if (

            active_connections.get(
                user_id
            )

            is websocket

        ):

            del active_connections[
                user_id
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

        return {

            "success":
                False,

            "users":
                [],

        }


    return {

        "success":
            True,

        "users":
            list(
                active_connections.keys()
            ),

    }


# =========================================================
# TIME
# =========================================================

@app.get("/time")
async def get_time():

    return {

        "success":
            True,

        "time":
            tehran_time(),

    }


# =========================================================
# ROOT
# =========================================================

@app.get("/")
async def root():

    index_file = (
        FRONTEND_DIR /
        "index.html"
    )


    if index_file.exists():

        return FileResponse(
            index_file
        )


    return {

        "success":
            True,

        "app":
            "GAPINO",

        "message":
            "GAPINO server is running",

    }


# =========================================================
# CHAT HTML
# =========================================================

@app.get("/chat.html")
async def chat_html():

    file = (
        FRONTEND_DIR /
        "chat.html"
    )


    if file.exists():

        return FileResponse(
            file
        )


    raise HTTPException(
        status_code=404,
        detail="chat.html not found",
    )


# =========================================================
# LOGIN HTML
# =========================================================

@app.get("/login.html")
async def login_html():

    file = (
        FRONTEND_DIR /
        "login.html"
    )


    if file.exists():

        return FileResponse(
            file
        )


    raise HTTPException(
        status_code=404,
        detail="login.html not found",
    )


# =========================================================
# REGISTER HTML
# =========================================================

@app.get("/register.html")
async def register_html():

    file = (
        FRONTEND_DIR /
        "register.html"
    )


    if file.exists():

        return FileResponse(
            file
        )


    raise HTTPException(
        status_code=404,
        detail="register.html not found",
    )


# =========================================================
# FRONTEND STATIC FILES
# =========================================================

@app.get("/frontend/{file_name:path}")
async def frontend_file(
    file_name: str,
):

    file = (
        FRONTEND_DIR /
        file_name
    )


    if not file.exists():

        raise HTTPException(
            status_code=404,
            detail="File not found",
        )


    return FileResponse(
        file
    )


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    import uvicorn


    uvicorn.run(

        "main:app",

        host="0.0.0.0",

        port=int(
            os.getenv(
                "PORT",
                "8000",
            )
        ),

        reload=False,

    )