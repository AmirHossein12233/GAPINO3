from fastapi import (
    FastAPI,
    Form,
    File,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    Request,
    HTTPException
)

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import (
    FileResponse,
    JSONResponse
)

from starlette.middleware.sessions import SessionMiddleware

from pathlib import Path

from datetime import (
    datetime,
    timezone,
    timedelta
)

from typing import Dict

import hashlib
import json
import os
import re
import secrets
import uuid
import time



# =========================
# PATH
# =========================


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




# =========================
# CREATE FILES
# =========================


for file, default in [

    (USERS_FILE, []),

    (MESSAGES_FILE, []),

    (CODES_FILE, {})

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
# JSON HELPERS
# =========================


def read_json(path):

    try:

        return json.loads(

            path.read_text(
                encoding="utf-8"
            )

        )


    except:


        if path == CODES_FILE:

            return {}


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
# SMS SENDER
# =========================


def send_sms(

    mobile,

    code

):


    text = (

        f"کد ورود GAPINO: {code}"

    )


    # تستی
    print("================")
    print("SMS SENT")
    print("NUMBER:", mobile)
    print("MESSAGE:", text)
    print("================")


    return True






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

        +

        salt

        +

        "$"

        +

        digest

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


    except:


        return False
# =========================
# APP
# =========================


app = FastAPI(

    title="GAPINO",

    version="5.0"

)





app.add_middleware(

    SessionMiddleware,

    secret_key=os.getenv(

        "GAPINO_SECRET",

        "CHANGE_THIS_SECRET"

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

    allow_headers=["*"]

)





# =========================
# WEBSOCKET USERS
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
        user.get("avatar",""),


        "status":
        user.get("status",""),


        "online":
        user.get("id")
        in active_connections


    }






def current_user(request:Request):


    user_id = request.session.get(

        "user_id"

    )


    if not user_id:

        return None



    return find_user_by_id(

        user_id

    )






# =========================
# REGISTER
# =========================


@app.post("/register")
async def register(

    username:str = Form(...),

    mobile:str = Form(...)

):


    username = username.strip()

    mobile = mobile.strip()



    if len(username) < 3:


        return {


            "success":False,


            "message":
            "نام کاربری کوتاه است"

        }





    if not re.match(

        r"^[a-zA-Z0-9._-]+$",

        username

    ):


        return {


            "success":False,


            "message":
            "نام کاربری نامعتبر است"

        }






    if not re.match(

        r"^09\d{9}$",

        mobile

    ):


        return {


            "success":False,


            "message":
            "شماره موبایل اشتباه است"

        }






    users = read_json(

        USERS_FILE

    )





    for user in users:


        if user["username"] == username:


            return {


                "success":False,


                "message":
                "نام کاربری وجود دارد"

            }




        if user["mobile"] == mobile:


            return {


                "success":False,


                "message":
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


        "status":
        "سلام! من در GAPINO هستم",


        "created":
        tehran_time()

    }






    users.append(user)


    save_json(

        USERS_FILE,

        users

    )





    return {


        "success":True,


        "user":
        public_user(user)

    }








# =========================
# SEND OTP
# =========================


@app.post("/send-code")
async def send_code(

    mobile:str = Form(...)

):


    mobile = mobile.strip()



    if not re.match(

        r"^09\d{9}$",

        mobile

    ):


        return {


            "success":False,


            "message":
            "شماره اشتباه است"

        }





    codes = read_json(

        CODES_FILE

    )



    old = codes.get(mobile)



    if old:


        if time.time() - old.get(
            "timestamp",
            0
        ) < 60:


            return {


                "success":False,


                "message":
                "۶۰ ثانیه صبر کنید"

            }







    code = str(

        secrets.randbelow(900000)

        +

        100000

    )





    send_sms(

        mobile,

        code

    )





    codes[mobile] = {


        "code":

        code,


        "timestamp":

        time.time(),


        "created":

        tehran_time()

    }




    save_json(

        CODES_FILE,

        codes

    )






    return {


        "success":True,


        "message":
        "کد ارسال شد"

    }









# =========================
# VERIFY OTP
# =========================


@app.post("/verify-code")
async def verify_code(

    mobile:str = Form(...),

    code:str = Form(...)

):


    codes = read_json(

        CODES_FILE

    )



    saved = codes.get(

        mobile

    )





    if not saved:


        return {


            "success":False,


            "message":
            "کد وجود ندارد"

        }





    if time.time() - saved["timestamp"] > 300:


        return {


            "success":False,


            "message":
            "کد منقضی شده"

        }






    if saved["code"] != code:


        return {


            "success":False,


            "message":
            "کد اشتباه است"

        }






    return {


        "success":True,


        "message":
        "تایید شد"

    }






# =========================
# LOGIN
# =========================


@app.post("/login")
async def login(

    request:Request,

    mobile:str = Form(...)

):


    user = find_user_by_mobile(

        mobile.strip()

    )



    if not user:


        return {


            "success":False,


            "message":
            "کاربر پیدا نشد"

        }






    request.session["user_id"] = user["id"]





    return {


        "success":True,


        "user":
        public_user(user)

    }






# =========================
# PROFILE
# =========================


@app.post("/profile")
async def profile(

    request:Request,

    username:str = Form(None),

    status:str = Form(None)

):


    user = current_user(request)



    if not user:

        raise HTTPException(401)





    users = read_json(

        USERS_FILE

    )



    for item in users:


        if item["id"] == user["id"]:


            if username:

                item["username"] = username.strip()



            if status:

                item["status"] = status.strip()





    save_json(

        USERS_FILE,

        users

    )





    return {


        "success":True

    }
# =========================
# FRONTEND PAGES
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
# CURRENT USER
# =========================


@app.get("/me")
async def me(
    request:Request
):


    user=current_user(
        request
    )


    if not user:


        return JSONResponse(

            {

                "success":False,

                "message":
                "وارد نشده‌اید"

            },

            status_code=401

        )



    return {

        "success":True,

        "user":
        public_user(user)

    }







# =========================
# USERS LIST
# =========================


@app.get("/users")
async def users(
    request:Request
):


    if not current_user(request):

        raise HTTPException(401)



    result=[]


    for user in read_json(
        USERS_FILE
    ):

        result.append(
            public_user(user)
        )



    return {

        "success":True,

        "users":
        result

    }








# =========================
# UPLOAD IMAGE / VOICE
# =========================


@app.post("/upload")
async def upload(

    request:Request,

    file:UploadFile = File(...)

):


    if not current_user(request):

        raise HTTPException(401)




    ext = Path(
        file.filename
    ).suffix.lower()



    allowed = {

        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".mp3",
        ".wav",
        ".webm",
        ".ogg"

    }




    if ext not in allowed:


        return {

            "success":False,

            "message":
            "فرمت فایل مجاز نیست"

        }





    data = await file.read()



    if len(data) > 10 * 1024 * 1024:


        return {

            "success":False,

            "message":
            "حجم فایل زیاد است"

        }





    filename = (

        str(uuid.uuid4())

        +

        ext

    )




    path = UPLOAD_DIR / filename



    path.write_bytes(
        data
    )




    return {

        "success":True,

        "url":
        "/uploads/" + filename

    }








@app.get("/uploads/{filename}")
async def get_upload(
    filename:str
):


    path = UPLOAD_DIR / filename



    if not path.exists():

        raise HTTPException(404)



    return FileResponse(
        path
    )







# =========================
# MESSAGE MODEL
# =========================


def create_message(

    sender,

    receiver,

    text="",

    file=None,

    file_type=None,

    reply_to=None

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


        "file_type":
        file_type,


        "reply_to":
        reply_to,


        "edited":
        False,


        "deleted":
        False,


        "seen":
        False,


        "time":
        tehran_time()

    }







# =========================
# CHAT HISTORY
# =========================


@app.get("/messages/{user_id}")
async def get_messages(

    user_id:str,

    request:Request

):


    user=current_user(
        request
    )



    if not user:

        raise HTTPException(401)




    result=[]



    messages = read_json(
        MESSAGES_FILE
    )




    for msg in messages:


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




    return {

        "success":True,

        "messages":
        result

    }






# =========================
# LAST MESSAGES
# =========================


@app.get("/last-messages")
async def last_messages(

    request:Request

):


    user=current_user(
        request
    )


    if not user:

        raise HTTPException(401)




    result={}



    for msg in read_json(
        MESSAGES_FILE
    ):


        if msg["sender"] == user["id"]:

            result[msg["receiver"]] = msg


        elif msg["receiver"] == user["id"]:

            result[msg["sender"]] = msg




    return result
def tehran_time():

    return datetime.now(
        timezone.utc
    ).astimezone(
        TEHRAN
    ).strftime(
        "%Y-%m-%d %H:%M:%S"
    )