from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime
)

from datetime import datetime

from database import Base


class User(Base):

    __tablename__ = "users"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )


    username = Column(
        String(50),
        unique=True,
        index=True
    )


    password = Column(
        String(255)
    )


    avatar = Column(
        String(255),
        default=""
    )


    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )



class Message(Base):

    __tablename__ = "messages"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )


    sender_id = Column(
        Integer
    )


    receiver_id = Column(
        Integer
    )


    text = Column(
        Text
    )


    seen = Column(
        Boolean,
        default=False
    )


    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )