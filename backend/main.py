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


for file, default in [
    (USERS_FILE, []),
    (MESSAGES_FILE, []),
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


def tehran_time():

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
        "GAPINO_SECRET_CHANGE"
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
# CONNECTIONS
# =========================

active_connections: Dict[str, WebSocket] = {}


# =========================
# USER HELPERS
# =========================

def find_user_by_id(user_id):

    users = read_json(
        USERS_FILE
    )

    for user in users:

        if user.get("id") == user_id:

            return user

    return None



def find_user_by_mobile(mobile):

    users = read_json(
        USERS_FILE
    )

    for user in users:

        if user.get("mobile") == mobile:

            return user

    return None



def public_user(user):

    return {

        "id":
            user.get("id"),

        "username":
            user.get("username"),

        "mobile":
            user.get("mobile"),

        "avatar":
            user.get(
                "avatar",
                ""
            ),

        "online":
            user.get(
                "id"
            ) in active_connections

    }



def current_user(request):

    user_id = request.session.get(
        "user_id"
    )

    if not user_id:

        return None


    return find_user_by_id(
        user_id
    )


# =========================
# FRONTEND
# =========================

@app.get("/")
async def home():

    return FileResponse(
        FRONTEND_DIR / "login.html"
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


# =========================
# HEALTH
# =========================

@app.get("/health")
async def health():

    return {

        "status":
            "GAPINO running",

        "time":
            tehran_time()

    }


# =========================
# REGISTER
# =========================

@app.post("/register")
async def register(

    username: str = Form(...),

    mobile: str = Form(...)

):

    username = username.strip()
    mobile = mobile.strip()


    if len(username) < 3:

        return {

            "ok":False,

            "error":
                "نام کاربری کوتاه است"

        }


    if not re.match(
        r"^[a-zA-Z0-9._-]+$",
        username
    ):

        return {

            "ok":False,

            "error":
                "نام کاربری اشتباه است"

        }


    if not re.match(
        r"^09\d{9}$",
        mobile
    ):

        return {

            "ok":False,

            "error":
                "شماره موبایل اشتباه است"

        }



    users = read_json(
        USERS_FILE
    )


    for user in users:

        if user.get("username") == username:

            return {

                "ok":False,

                "error":
                    "نام کاربری وجود دارد"

            }


        if user.get("mobile") == mobile:

            return {

                "ok":False,

                "error":
                    "شماره قبلا ثبت شده"

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

        "created":
            tehran_time()

    }


    users.append(
        user
    )


    save_json(
        USERS_FILE,
        users
    )


    return {

        "ok":
            True,

        "user":
            public_user(user)

    }
# =========================
# LOGIN
# =========================

@app.post("/login")
async def login(
    request: Request,
    mobile: str = Form(...)
):

    mobile = mobile.strip()

    user = find_user_by_mobile(
        mobile
    )


    if not user:

        return {

            "ok": False,

            "error":
                "حسابی با این شماره وجود ندارد"

        }



    request.session["user_id"] = user["id"]


    return {

        "ok": True,

        "user":
            public_user(user)

    }



# =========================
# ME
# =========================

@app.get("/me")
async def me(
    request: Request
):

    user = current_user(
        request
    )


    if not user:

        return JSONResponse(
            {
                "ok":False
            },
            status_code=401
        )


    return {

        "ok":True,

        "user":
            public_user(user)

    }



# =========================
# USERS
# =========================

@app.get("/users")
async def users(
    request: Request
):

    if not current_user(request):

        raise HTTPException(
            401
        )


    return [

        public_user(user)

        for user in read_json(
            USERS_FILE
        )

    ]



# =========================
# UPLOAD
# =========================

@app.post("/upload")
async def upload(
    request: Request,
    file: UploadFile = File(...)
):

    if not current_user(request):

        raise HTTPException(
            401
        )


    ext = Path(
        file.filename
    ).suffix.lower()


    allowed = {

        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".mp3",
        ".wav",
        ".pdf",
        ".txt"

    }


    if ext not in allowed:

        return {

            "ok":False,

            "error":
                "نوع فایل مجاز نیست"

        }


    name = (
        str(uuid.uuid4())
        +
        ext
    )


    path = (
        UPLOAD_DIR
        /
        name
    )


    content = await file.read()


    if len(content) > 10 * 1024 * 1024:

        return {

            "ok":False,

            "error":
                "حجم فایل زیاد است"

        }


    path.write_bytes(
        content
    )


    return {

        "ok":True,

        "url":
            "/uploads/" + name

    }



@app.get("/uploads/{filename}")
async def uploads(
    filename:str
):

    file = (
        UPLOAD_DIR
        /
        filename
    )


    if not file.exists():

        raise HTTPException(
            404
        )


    return FileResponse(
        file
    )



# =========================
# MESSAGES
# =========================

def create_message(
    sender,
    receiver,
    text,
    file=None
):

    return {

        "id":
            str(uuid.uuid4()),

        "sender":
            sender,

        "receiver":
            receiver,

        "text":
            text,

        "file":
            file,

        "time":
            tehran_time()

    }



@app.get("/messages/{user_id}")
async def messages(
    user_id:str,
    request:Request
):

    user = current_user(
        request
    )


    if not user:

        raise HTTPException(
            401
        )


    result=[]


    for msg in read_json(
        MESSAGES_FILE
    ):

        if (

            msg["sender"] == user["id"]

            and

            msg["receiver"] == user_id

        ) or (

            msg["sender"] == user_id

            and

            msg["receiver"] == user["id"]

        ):

            result.append(msg)


    return result



# =========================
# SEND TO USER
# =========================

async def send_to_user(
    user_id,
    data
):

    ws = active_connections.get(
        user_id
    )


    if ws:

        try:

            await ws.send_json(
                data
            )

        except:

            active_connections.pop(
                user_id,
                None
            )



# =========================
# ONLINE
# =========================

@app.get("/online-users")
async def online_users():

    return list(
        active_connections.keys()
    )



# =========================
# WEBSOCKET
# =========================

@app.websocket("/ws/{user_id}")
async def websocket(
    websocket:WebSocket,
    user_id:str
):

    await websocket.accept()


    active_connections[user_id] = websocket



    await websocket.send_json(
        {
            "type":
                "connected"
        }
    )


    try:

        while True:

            data = await websocket.receive_json()


            event = data.get(
                "type"
            )


            if event == "ping":

                await websocket.send_json(
                    {
                        "type":
                            "pong"
                    }
                )



            elif event == "typing":

                await send_to_user(

                    data.get(
                        "receiver"
                    ),

                    {

                        "type":
                            "typing",

                        "user_id":
                            user_id

                    }

                )



            elif event == "message":

                receiver = data.get(
                    "receiver"
                )


                text = data.get(
                    "text",
                    ""
                )


                msg = create_message(

                    user_id,

                    receiver,

                    text

                )


                messages = read_json(
                    MESSAGES_FILE
                )


                messages.append(
                    msg
                )


                save_json(
                    MESSAGES_FILE,
                    messages
                )


                await send_to_user(

                    receiver,

                    {

                        "type":
                            "message",

                        "message":
                            msg

                    }

                )


                await websocket.send_json(

                    {

                        "type":
                            "sent",

                        "message":
                            msg

                    }

                )


    except WebSocketDisconnect:


        active_connections.pop(
            user_id,
            None
        )



# =========================
# RUN
# =========================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(

        "main:app",

        host="0.0.0.0",

        port=8000,

        reload=True

    )