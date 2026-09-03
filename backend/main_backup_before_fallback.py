# =========================================================
# PRIVATE MESSAGE HTTP FALLBACK
# =========================================================

@app.post("/messages/send")
async def send_private_message_http(
    request: Request,
    receiver_id: str = Form(...),
    text: str = Form(...),
    reply_to: str = Form(""),
):
    """
    مسیر پشتیبان HTTPS برای زمانی که WebSocket
    در اینترنت کاربر قابل استفاده نیست.
    """

    user = current_user(request)

    if not user:
        return JSONResponse(
            {
                "success": False,
                "message": "ابتدا وارد حساب شوید.",
            },
            status_code=401,
        )

    sender_id = str(user["id"])
    receiver_id = str(receiver_id).strip()
    text = str(text).strip()
    reply_to = str(reply_to).strip()

    if not receiver_id:
        return JSONResponse(
            {
                "success": False,
                "message": "گیرنده مشخص نشده است.",
            },
            status_code=400,
        )

    if receiver_id == sender_id:
        return JSONResponse(
            {
                "success": False,
                "message": "نمی‌توانید به خودتان پیام بفرستید.",
            },
            status_code=400,
        )

    if not text:
        return JSONResponse(
            {
                "success": False,
                "message": "پیام نمی‌تواند خالی باشد.",
            },
            status_code=400,
        )

    if len(text) > 5000:
        return JSONResponse(
            {
                "success": False,
                "message": "پیام نباید بیشتر از ۵۰۰۰ کاراکتر باشد.",
            },
            status_code=400,
        )

    if not find_user_by_id(receiver_id):
        return JSONResponse(
            {
                "success": False,
                "message": "کاربر پیدا نشد.",
            },
            status_code=404,
        )

    message = {
        "id": str(uuid.uuid4()),
        "sender_id": sender_id,
        "receiver_id": receiver_id,
        "text": text,
        "reply_to": reply_to or None,
        "created_at": current_time(),
    }

    messages = load_json(
        MESSAGES_FILE,
        [],
    )

    if not isinstance(messages, list):
        messages = []

    messages.append(message)

    save_json(
        MESSAGES_FILE,
        messages,
    )

    # ارسال لحظه‌ای برای گیرنده، اگر WebSocket متصل باشد
    await send_to_user(
        receiver_id,
        {
            "type": "message",
            "message": message,
        },
    )

    # ارسال نسخهٔ پیام برای خود فرستنده
    await send_to_user(
        sender_id,
        {
            "type": "message",
            "message": message,
        },
    )

    await increase_unread(
        receiver_id,
        sender_id,
    )

    return {
        "success": True,
        "message": message,
        "transport": "https",
    }