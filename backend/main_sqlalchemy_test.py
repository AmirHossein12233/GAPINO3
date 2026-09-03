from fastapi import (
    FastAPI,
    Depends,
    Form,
    HTTPException,
    Header
)

from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy.orm import Session

from database import (
    Base,
    engine,
    get_db
)

from models import (
    User,
    Message
)

from security import (
    hash_password,
    verify_password,
    create_token,
    verify_token
)


# ساخت جدول‌ها
Base.metadata.create_all(
    bind=engine
)


app = FastAPI(
    title="GAPINO API"
)



# CORS

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# =====================================================
# HOME
# =====================================================

@app.get("/")
def home():

    return {
        "app": "GAPINO",
        "status": "online"
    }



# =====================================================
# REGISTER
# =====================================================

@app.post("/register")
def register(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):

    old_user = db.query(User).filter(
        User.username == username
    ).first()


    if old_user:

        raise HTTPException(
            status_code=400,
            detail="username already exists"
        )



    user = User(
        username=username,
        password=hash_password(password)
    )


    db.add(user)

    db.commit()

    db.refresh(user)



    return {

        "ok": True,

        "user_id": user.id

    }



# =====================================================
# LOGIN
# =====================================================

@app.post("/login")
def login(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):


    user = db.query(User).filter(
        User.username == username
    ).first()



    if not user:

        raise HTTPException(
            status_code=404,
            detail="user not found"
        )



    if not verify_password(
        password,
        user.password
    ):

        raise HTTPException(
            status_code=401,
            detail="wrong password"
        )



    token = create_token({

        "user_id": user.id,

        "username": user.username

    })



    return {

        "access_token": token,

        "token_type": "bearer",

        "user_id": user.id

    }



# =====================================================
# CURRENT USER FROM TOKEN
# =====================================================

def get_current_user(
    authorization: str = Header(None)
):


    if not authorization:

        raise HTTPException(
            status_code=401,
            detail="token required"
        )



    if not authorization.startswith(
        "Bearer "
    ):

        raise HTTPException(
            status_code=401,
            detail="invalid token"
        )



    token = authorization.replace(
        "Bearer ",
        ""
    )



    data = verify_token(
        token
    )



    if not data:

        raise HTTPException(
            status_code=401,
            detail="token expired"
        )



    return data




# =====================================================
# ME
# =====================================================

@app.get("/me")
def me(
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):


    db_user = db.query(User).filter(
        User.id == user["user_id"]
    ).first()



    if not db_user:

        raise HTTPException(
            404,
            "user not found"
        )



    return {

        "id": db_user.id,

        "username": db_user.username,

        "avatar": db_user.avatar

    }




# =====================================================
# USERS
# =====================================================

@app.get("/users")
def users(
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):


    result = []


    for u in db.query(User).all():

        result.append({

            "id": u.id,

            "username": u.username,

            "avatar": u.avatar

        })



    return result




# =====================================================
# SEND MESSAGE
# =====================================================

@app.post("/message")
def send_message(

    receiver_id: int = Form(...),

    text: str = Form(...),

    db: Session = Depends(get_db),

    user = Depends(get_current_user)

):


    msg = Message(

        sender_id=user["user_id"],

        receiver_id=receiver_id,

        text=text

    )



    db.add(msg)

    db.commit()



    return {

        "ok": True

    }




# =====================================================
# GET MESSAGES
# =====================================================

@app.get("/messages/{other_id}")
def get_messages(

    other_id: int,

    db: Session = Depends(get_db),

    user = Depends(get_current_user)

):


    uid = user["user_id"]



    messages = db.query(Message).filter(

        (

            (Message.sender_id == uid)

            &

            (Message.receiver_id == other_id)

        )

        |

        (

            (Message.sender_id == other_id)

            &

            (Message.receiver_id == uid)

        )

    ).all()



    return [

        {

            "id": m.id,

            "sender": m.sender_id,

            "text": m.text,

            "seen": m.seen

        }

        for m in messages

    ]