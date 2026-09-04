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
    JSONResponse,
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
import time

import requests


# =========================================================
# AMOOT SMS SETTINGS
# =========================================================

AMOOT_TOKEN = os.getenv(
    "AMOOT_TOKEN",
    "1F6E30ACE8511ADC9E80C1260AF9D299A37CC76A",
)

AMOOT_SEND_SIMPLE_URL = (
    "https://portal.amootsms.com/rest/SendSimple"
)

AMOOT_LINE_NUMBER = os.getenv(
    "AMOOT_LINE_NUMBER",
    "Public",
)


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

CODES_FILE = DATA_DIR / "codes.json"


# =========================================================
# CREATE FILES
# =========================================================

for file, default in [

    (USERS_FILE, []),

    (MESSAGES_FILE, []),

    (CODES_FILE, {}),

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

        if path == CODES_FILE:
            return {}

        return []


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
# AMOOT SMS
# =========================================================

def send_sms_simple(
    mobile: str,
    message: str,
):
    """
    ارسال پیامک عادی از طریق SendSimple آموت.
    """

    if not AMOOT_TOKEN:

        return {
            "success": False,
            "message": "توکن آموت تنظیم نشده است",
            "raw": "",
        }


    mobile = mobile.strip()


    if not re.match(
        r"^09\d{9}$",
        mobile,
    ):

        return {
            "success": False,
            "message": "شماره موبایل نامعتبر است",
            "raw": "",
        }


    payload = {
        "token": AMOOT_TOKEN,

        "Mobiles": mobile,

        # ارسال فوری
        # عمداً خالی است تا وارد زمان‌بندی نشود
        "SendDateTime": "",

        "SMSMessageText": message,

        "LineNumber": AMOOT_LINE_NUMBER,
    }


    headers = {
        "Content-Type":
        "application/x-www-form-urlencoded",
    }


    try:

        response = requests.post(

            AMOOT_SEND_SIMPLE_URL,

            data=payload,

            headers=headers,

            timeout=20,

        )


        raw_text = (
            response.text
            if response.text
            else ""
        )


        print("==============================")
        print("AMOOT SMS RESPONSE")
        print(
            "HTTP:",
            response.status_code,
        )
        print(
            "BODY:",
            raw_text,
        )
        print("==============================")


        if not response.ok:

            return {
                "success": False,
                "message":
                    "ارتباط با سرویس پیامک ناموفق بود",
                "raw":
                    raw_text,
            }


        try:

            result = response.json()

        except Exception:

            result = None


        if isinstance(
            result,
            dict,
        ):

            status = str(
                result.get(
                    "Status",
                    "",
                )
            ).strip().lower()


            if status == "success":

                return {
                    "success": True,
                    "message":
                        "پیامک با موفقیت ارسال شد",
                    "raw":
                        result,
                }


            # خطاهای آموت را برگردان
            error_text = (
                result.get("Status")
                or result.get("MessageText")
                or "ارسال پیامک ناموفق بود"
            )


            return {
                "success": False,
                "message":
                    str(error_text),
                "raw":
                    result,
            }


        return {
            "success": True,
            "message":
                "درخواست ارسال پیامک ثبت شد",
            "raw":
                raw_text,
        }


    except requests.RequestException as e:

        print(
            "AMOOT REQUEST ERROR:",
            e,
        )


        return {
            "success": False,
            "message":
                "ارتباط با آموت برقرار نشد",
            "raw":
                str(e),
        }


# =========================================================
# PASSWORD
# =========================================================

def hash_password(
    password: str,
):

    salt = secrets.token_hex(
        16
    )


    digest = hashlib.pbkdf2_hmac(

        "sha256",

        password.encode(),

        salt.encode(),

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

        _, _, salt, old = (
            hashed.split("$")
        )


        new = hashlib.pbkdf2_hmac(

            "sha256",

            password.encode(),

            salt.encode(),

            200000,

        ).hex()


        return secrets.compare_digest(
            new,
            old,
        )


    except Exception:

        return False


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="GAPINO",
    version="5.0",
)


app.add_middleware(

    SessionMiddleware,

    secret_key=os.getenv(
        "GAPINO_SECRET",
        "CHANGE_THIS_SECRET",
    ),

    session_cookie="gapino_session",

    same_site="lax",

    https_only=False,
)


app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
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

        if user.get(
            "mobile"
        ) == mobile:

            return user


    return None


def find_user_by_id(
    user_id: str,
):

    users = read_json(
        USERS_FILE
    )


    for user in users:

        if user.get(
            "id"
        ) == user_id:

            return user


    return None


def public_user(
    user,
):

    return {

        "id":
            user.get("id"),

        "username":
            user.get("username"),

        "mobile":
            user.get("mobile"),

        "avatar":
            user.get("avatar", ""),

        "status":
            user.get(
                "status",
                "",
            ),

        "online":
            user.get("id")
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

        "sms_configured":
            bool(AMOOT_TOKEN),

    }


# =========================================================
# REGISTER
# =========================================================

@app.post("/register")
async def register(

    username: str = Form(...),

    mobile: str = Form(...),

):

    username = username.strip()

    mobile = mobile.strip()


    if len(username) < 3:

        return {

            "success":
                False,

            "message":
                "نام کاربری کوتاه است",

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


    users = read_json(
        USERS_FILE
    )


    for user in users:

        if user.get(
            "username"
        ) == username:

            return {

                "success":
                    False,

                "message":
                    "نام کاربری وجود دارد",

            }


        if user.get(
            "mobile"
        ) == mobile:

            return {

                "success":
                    False,

                "message":
                    "شماره قبلا ثبت شده",

            }


    user = {

        "id":
            str(uuid.uuid4()),

        "username":
            username,

        "mobile":
            mobile,

        "password":
            hash_password(mobile),

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

        "user":
            public_user(user),

    }


# =========================================================
# SEND OTP
# =========================================================

@app.post("/send-code")
async def send_code(

    mobile: str = Form(...),

):

    mobile = mobile.strip()


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


    codes = read_json(
        CODES_FILE
    )


    old = codes.get(
        mobile
    )


    if old:

        last_timestamp = old.get(
            "timestamp",
            0,
        )


        elapsed = (
            time.time()
            -
            last_timestamp
        )


        if elapsed < 60:

            remaining = max(
                1,
                int(
                    60 - elapsed
                ),
            )


            return {

                "success":
                    False,

                "message":
                    f"لطفاً {remaining} ثانیه صبر کنید",

            }


    # =====================================================
    # CREATE 6 DIGIT CODE
    # =====================================================

    code = str(

        secrets.randbelow(
            900000
        )
        +
        100000

    )


    sms_text = (
        f"کد ورود GAPINO: {code}"
    )


    # =====================================================
    # SEND SMS
    # =====================================================

    sms_result = send_sms_simple(

        mobile,

        sms_text,

    )


    if not sms_result.get(
        "success",
        False,
    ):

        return {

            "success":
                False,

            "message":
                sms_result.get(
                    "message",
                    "ارسال پیامک ناموفق بود",
                ),

        }


    # =====================================================
    # SAVE OTP
    # =====================================================

    codes[mobile] = {

        "code":
            code,

        "timestamp":
            time.time(),

        "created":
            tehran_time(),

    }


    save_json(

        CODES_FILE,

        codes,

    )


    return {

        "success":
            True,

        "message":
            "کد ورود ارسال شد",

    }


# =========================================================
# VERIFY OTP
# =========================================================

@app.post("/verify-code")
async def verify_code(

    mobile: str = Form(...),

    code: str = Form(...),

):

    mobile = mobile.strip()

    code = code.strip()


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


    if not re.match(
        r"^\d{6}$",
        code,
    ):

        return {

            "success":
                False,

            "message":
                "کد باید ۶ رقمی باشد",

        }


    codes = read_json(
        CODES_FILE
    )


    saved = codes.get(
        mobile
    )


    if not saved:

        return {

            "success":
                False,

            "message":
                "کدی برای این شماره وجود ندارد",

        }


    if time.time() - saved.get(
        "timestamp",
        0,
    ) > 300:

        return {

            "success":
                False,

            "message":
                "کد منقضی شده است",

        }


    if saved.get(
        "code"
    ) != code:

        return {

            "success":
                False,

            "message":
                "کد اشتباه است",

        }


    return {

        "success":
            True,

        "message":
            "کد تایید شد",

    }


# =========================================================
# LOGIN
# =========================================================

@app.post("/login")
async def login(

    request: Request,

    mobile: str = Form(...),

):

    mobile = mobile.strip()


    user = find_user_by_mobile(
        mobile
    )


    if not user:

        return {

            "success":
                False,

            "message":
                "کاربر پیدا نشد",

        }


    request.session[
        "user_id"
    ] = user["id"]


    return {

        "success":
            True,

        "user":
            public_user(user),

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
            public_user(user),

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
            "خارج شدید",

    }


# =========================================================
# USERS
# =========================================================

@app.get("/users")
async def users():

    all_users = read_json(
        USERS_FILE
    )


    return {

        "success":
            True,

        "users":
            [
                public_user(user)
                for user in all_users
            ],

    }


# =========================================================
# MESSAGES GET
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


    return {

        "success":
            True,

        "messages":
            data,

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
            str(uuid.uuid4()),

        "sender_id":
            user["id"],

        "receiver_id":
            receiver_id,

        "text":
            text,

        "created":
            tehran_time(),

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


            # =============================================
            # PING
            # =============================================

            if message_type == "ping":

                await websocket.send_json({

                    "type":
                        "pong",

                    "time":
                        tehran_time(),

                })


            # =============================================
            # TYPING
            # =============================================

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


            # =============================================
            # MESSAGE
            # =============================================

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


                if not receiver_id or not text:

                    continue


                receiver = find_user_by_id(
                    receiver_id
                )


                if not receiver:

                    continue


                messages_data = read_json(
                    MESSAGES_FILE
                )


                message = {

                    "id":
                        str(uuid.uuid4()),

                    "sender_id":
                        user_id,

                    "receiver_id":
                        receiver_id,

                    "text":
                        text,

                    "created":
                        tehran_time(),

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
async def online_users():

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
