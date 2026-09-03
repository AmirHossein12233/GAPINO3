from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError

from passlib.context import CryptContext



SECRET_KEY = "GAPINO_SECRET_KEY_CHANGE_ME"

ALGORITHM = "HS256"

TOKEN_EXPIRE_MINUTES = 60 * 24 * 30



pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)



def hash_password(password):

    return pwd_context.hash(
        password
    )



def verify_password(
    password,
    hashed_password
):

    return pwd_context.verify(
        password,
        hashed_password
    )



def create_token(data):

    payload = data.copy()


    expire = datetime.now(
        timezone.utc
    ) + timedelta(
        minutes=TOKEN_EXPIRE_MINUTES
    )


    payload["exp"] = expire


    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )



def verify_token(token):

    try:

        return jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[
                ALGORITHM
            ]
        )

    except JWTError:

        return None