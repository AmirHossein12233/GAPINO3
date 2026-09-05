"use strict";

const API = "https://gapino3.onrender.com";
const WS = "wss://gapino3.onrender.com";

let currentUser = null;
let selectedUser = null;
let socket = null;

let replyMessage = null;

let mediaRecorder = null;
let audioChunks = [];
let recording = false;


// =========================
// ELEMENTS
// =========================

const usersList =
    document.getElementById("usersList");

const messages =
    document.getElementById("messages");

const input =
    document.getElementById("messageInput");

const sendBtn =
    document.getElementById("sendBtn");

const photoBtn =
    document.getElementById("photoBtn");

const voiceBtn =
    document.getElementById("voiceBtn");

const fileInput =
    document.getElementById("fileInput");

const chatHeader =
    document.getElementById("chatHeader");

const replyBox =
    document.getElementById("replyBox");

const replyText =
    document.getElementById("replyText");

const cancelReply =
    document.getElementById("cancelReply");


// =========================
// AUTH TOKEN
// =========================

function getToken() {
    return localStorage.getItem("gapino_token") || "";
}


function getAuthHeaders(extraHeaders = {}) {

    const headers =
        new Headers(extraHeaders);

    const token =
        getToken();

    if (token) {
        headers.set(
            "Authorization",
            `Bearer ${token}`
        );
    }

    return headers;
}


// =========================
// API FETCH
// =========================

async function apiFetch(
    path,
    options = {}
) {

    const headers =
        getAuthHeaders(
            options.headers || {}
        );

    const response =
        await fetch(
            API + path,
            {
                ...options,
                headers: headers,
                credentials: "include",
                cache: "no-store"
            }
        );

    let data = null;

    try {
        data =
            await response.json();
    }
    catch (_) {
        data = null;
    }

    if (!response.ok) {

        throw new Error(
            data?.message ||
            `HTTP ${response.status}`
        );
    }

    return data;
}


// =========================
// LOAD USER
// =========================

async function loadMe() {

    const token =
        getToken();

    if (!token) {

        localStorage.removeItem(
            "gapino_user"
        );

        location.href =
            "login.html";

        return;
    }


    try {

        const data =
            await apiFetch("/me");


        if (
            data?.success &&
            data?.authenticated &&
            data?.user?.id
        ) {

            currentUser =
                data.user;


            localStorage.setItem(
                "gapino_user",
                JSON.stringify(
                    currentUser
                )
            );


            connectSocket();

            await loadUsers();

            return;
        }

    }
    catch (error) {

        console.error(
            "LOAD ME ERROR:",
            error
        );

    }


    /*
       اگر /me به هر دلیل Session را ندید،
       از user ذخیره‌شده استفاده می‌کنیم.
       این کار برای APK کمک می‌کند.
    */

    try {

        const saved =
            localStorage.getItem(
                "gapino_user"
            );


        if (saved) {

            const user =
                JSON.parse(saved);


            if (user?.id) {

                currentUser =
                    user;


                connectSocket();

                await loadUsers();

                return;
            }
        }

    }
    catch (_) {}


    localStorage.removeItem(
        "gapino_user"
    );

    localStorage.removeItem(
        "gapino_token"
    );

    location.href =
        "login.html";
}


// =========================
// USERS
// =========================

async function loadUsers() {

    if (!currentUser)
        return;


    try {

        const data =
            await apiFetch(
                "/users"
            );


        usersList.innerHTML =
            "";


        const users =
            Array.isArray(data)
                ? data
                : (
                    Array.isArray(
                        data?.users
                    )
                        ? data.users
                        : []
                );


        users.forEach(
            user => {

                if (
                    String(user.id) ===
                    String(currentUser.id)
                ) {
                    return;
                }


                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "user-item";


                div.innerHTML = `
                    <b>${escapeHtml(
                        user.username ||
                        user.display_name ||
                        "کاربر"
                    )}</b>

                    <br>

                    <small>
                        ${
                            user.online
                                ? "🟢 آنلاین"
                                : "⚪ آفلاین"
                        }
                    </small>
                `;


                div.onclick =
                    () => {

                        selectUser(
                            user
                        );

                    };


                usersList.appendChild(
                    div
                );

            }
        );


    }
    catch (error) {

        console.error(
            "LOAD USERS ERROR:",
            error
        );

        usersList.innerHTML =
            `
            <div style="
                padding:20px;
                text-align:center;
            ">
                دریافت کاربران انجام نشد.
            </div>
            `;
    }
}


// =========================
// ESCAPE HTML
// =========================

function escapeHtml(value) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        String(
            value ?? ""
        );

    return div.innerHTML;
}


// =========================
// SELECT USER
// =========================

async function selectUser(user) {

    if (!user)
        return;


    selectedUser =
        user;


    chatHeader.innerText =
        user.username ||
        user.display_name ||
        "کاربر";


    messages.innerHTML =
        "";


    await loadMessages();
}


// =========================
// LOAD HISTORY
// =========================

async function loadMessages() {

    if (
        !selectedUser ||
        !currentUser
    ) {
        return;
    }


    try {

        const res =
            await apiFetch(
                `/messages/${encodeURIComponent(
                    currentUser.id
                )}/${encodeURIComponent(
                    selectedUser.id
                )}`
            );


        const data =
            Array.isArray(res)
                ? res
                : (
                    Array.isArray(
                        res?.messages
                    )
                        ? res.messages
                        : []
                );


        messages.innerHTML =
            "";


        data.forEach(
            msg =>
                showMessage(msg)
        );


    }
    catch (error) {

        console.error(
            "LOAD MESSAGES ERROR:",
            error
        );

        messages.innerHTML =
            `
            <div style="
                padding:20px;
                text-align:center;
            ">
                دریافت پیام‌ها انجام نشد.
            </div>
            `;
    }
}


// =========================
// SHOW MESSAGE
// =========================

function showMessage(msg) {

    if (!msg)
        return;


    const div =
        document.createElement(
            "div"
        );


    div.className =
        "message-item";


    const mine =
        currentUser &&
        String(msg.sender_id) ===
        String(currentUser.id);


    if (mine) {
        div.classList.add(
            "mine"
        );
    }


    let content =
        "";


    if (msg.deleted) {

        content =
            "پیام حذف شده";

    }
    else {

        if (msg.text) {

            content +=
                `
                <div>
                    ${escapeHtml(
                        msg.text
                    )}
                </div>
                `;
        }


        /*
           فایل‌های جدید بک‌اند:
           msg.file = {
               name,
               stored_name,
               url,
               size,
               is_image,
               is_audio
           }
        */

        if (msg.file) {

            content +=
                renderFile(
                    msg.file
                );
        }


        /*
           سازگاری با فرمت قدیمی
        */

        if (
            msg.file_url &&
            !msg.file
        ) {

            content +=
                renderLegacyFile(
                    msg
                );
        }
    }


    const time =
        escapeHtml(
            msg.time ||
            msg.created_at ||
            ""
        );


    div.innerHTML = `
        <div class="message-content">
            ${content || ""}
        </div>

        <span class="message-time">
            ${time}
            ${
                msg.seen
                    ? " ✓✓"
                    : ""
            }
        </span>

        <button
            type="button"
            class="reply-message-button"
        >
            ↩
        </button>
    `;


    const replyButton =
        div.querySelector(
            ".reply-message-button"
        );


    if (replyButton) {

        replyButton.onclick =
            () => {

                replyMsg(
                    msg.id
                );

            };
    }


    messages.appendChild(
        div
    );


    messages.scrollTop =
        messages.scrollHeight;
}


// =========================
// RENDER FILE
// =========================

function renderFile(file) {

    if (!file)
        return "";


    const url =
        String(
            file.url ||
            file.file_url ||
            ""
        );


    if (!url)
        return "";


    const fullUrl =
        url.startsWith("http")
            ? url
            : API + url;


    const name =
        escapeHtml(
            file.name ||
            file.file_name ||
            "فایل"
        );


    const isAudio =
        Boolean(
            file.is_audio
        ) ||
        /\.(webm|ogg|mp3|wav|m4a)$/i.test(
            url
        );


    const isImage =
        Boolean(
            file.is_image
        ) ||
        /\.(jpg|jpeg|png|gif|webp)$/i.test(
            url
        );


    if (isAudio) {

        return `
            <div
                class="message-audio"
                style="margin-top:8px;"
            >
                <audio
                    controls
                    preload="metadata"
                    src="${escapeHtml(
                        fullUrl
                    )}"
                    style="max-width:100%;"
                ></audio>

                <div>
                    ${name}
                </div>
            </div>
        `;
    }


    if (isImage) {

        return `
            <div
                class="message-image"
                style="margin-top:8px;"
            >
                <img
                    src="${escapeHtml(
                        fullUrl
                    )}"
                    alt="${name}"
                    style="
                        max-width:100%;
                        max-height:300px;
                        border-radius:12px;
                    "
                >

                <div>
                    ${name}
                </div>
            </div>
        `;
    }


    return `
        <div
            class="message-file"
            style="margin-top:8px;"
        >
            <a
                href="${escapeHtml(
                    fullUrl
                )}"
                target="_blank"
                rel="noopener noreferrer"
            >
                📎 ${name}
            </a>
        </div>
    `;
}


// =========================
// LEGACY FILE
// =========================

function renderLegacyFile(msg) {

    const fileUrl =
        String(
            msg.file_url ||
            ""
        );


    if (!fileUrl)
        return "";


    const fullUrl =
        fileUrl.startsWith("http")
            ? fileUrl
            : API + fileUrl;


    const type =
        String(
            msg.file_type ||
            ""
        );


    if (
        type.startsWith(
            "audio"
        )
    ) {

        return `
            <br>

            <audio
                controls
                src="${escapeHtml(
                    fullUrl
                )}"
                style="max-width:100%;"
            ></audio>
        `;
    }


    if (
        type.startsWith(
            "image"
        )
    ) {

        return `
            <br>

            <img
                src="${escapeHtml(
                    fullUrl
                )}"
                style="
                    max-width:100%;
                    max-height:300px;
                    border-radius:12px;
                "
            >
        `;
    }


    return `
        <br>

        <a
            href="${escapeHtml(
                fullUrl
            )}"
            target="_blank"
            rel="noopener noreferrer"
        >
            📎 فایل
        </a>
    `;
}


// =========================
// REPLY
// =========================

window.replyMsg =
    function(id) {

        replyMessage =
            id;


        if (replyBox) {

            replyBox.style.display =
                "flex";
        }


        if (replyText) {

            replyText.innerText =
                "پاسخ به پیام";
        }
    };


if (cancelReply) {

    cancelReply.onclick =
        function() {

            replyMessage =
                null;


            if (replyBox) {

                replyBox.style.display =
                    "none";
            }
        };
}


// =========================
// WEBSOCKET URL
// =========================

function getWebSocketUrl() {

    const token =
        getToken();


    return (
        WS +
        "/ws/" +
        encodeURIComponent(
            currentUser.id
        ) +
        "?token=" +
        encodeURIComponent(
            token
        )
    );
}


// =========================
// WEBSOCKET
// =========================

function connectSocket() {

    if (
        !currentUser?.id
    ) {
        return;
    }


    if (
        socket &&
        (
            socket.readyState ===
                WebSocket.OPEN ||
            socket.readyState ===
                WebSocket.CONNECTING
        )
    ) {
        return;
    }


    const token =
        getToken();


    if (!token) {

        console.error(
            "GAPINO: token not found"
        );

        return;
    }


    const url =
        getWebSocketUrl();


    console.log(
        "GAPINO WebSocket:",
        url.replace(
            token,
            "***"
        )
    );


    try {

        socket =
            new WebSocket(
                url
            );

    }
    catch (error) {

        console.error(
            "WEBSOCKET CREATE ERROR:",
            error
        );

        setTimeout(
            connectSocket,
            3000
        );

        return;
    }


    socket.onopen =
        () => {

            console.log(
                "GAPINO connected"
            );

        };


    socket.onmessage =
        event => {

            try {

                const data =
                    JSON.parse(
                        event.data
                    );


                if (
                    data.type ===
                    "message"
                ) {

                    showMessage(
                        data.message
                    );

                    return;
                }


                if (
                    data.type ===
                    "file"
                ) {

                    showMessage(
                        data.message
                    );

                    return;
                }


            }
            catch (error) {

                console.error(
                    "WEBSOCKET DATA ERROR:",
                    error
                );
            }

        };


    socket.onerror =
        error => {

            console.error(
                "GAPINO WEBSOCKET ERROR:",
                error
            );

        };


    socket.onclose =
        event => {

            console.warn(
                "GAPINO WebSocket closed:",
                event.code
            );


            socket =
                null;


            setTimeout(
                () => {

                    if (
                        currentUser
                    ) {

                        connectSocket();
                    }

                },
                3000
            );

        };
}


// =========================
// SAFE SOCKET SEND
// =========================

function sendSocket(data) {

    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {

        connectSocket();

        return false;
    }


    try {

        socket.send(
            JSON.stringify(
                data
            )
        );

        return true;

    }
    catch (error) {

        console.error(
            "SOCKET SEND ERROR:",
            error
        );

        return false;
    }
}


// =========================
// SEND MESSAGE
// =========================

if (sendBtn) {

    sendBtn.onclick =
        function() {

            sendMessage();

        };
}


if (input) {

    input.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                sendMessage();
            }

        }
    );
}


function sendMessage() {

    if (
        !selectedUser
    ) {

        return;
    }


    const text =
        input.value.trim();


    if (!text)
        return;


    if (text.length > 5000) {

        alert(
            "پیام نباید بیشتر از ۵۰۰۰ کاراکتر باشد."
        );

        return;
    }


    const success =
        sendSocket({

            type: "message",

            receiver_id:
                String(
                    selectedUser.id
                ),

            text: text

        });


    if (!success) {

        alert(
            "اتصال چت برقرار نیست."
        );

        return;
    }


    /*
       فعلاً replyMessage را نگه نمی‌فرستیم
       چون بک‌اند فعلی برای آن پردازش ندارد.
    */


    input.value =
        "";


    replyMessage =
        null;


    if (replyBox) {

        replyBox.style.display =
            "none";
    }
}


// =========================
// UPLOAD FILE
// =========================

async function uploadFile(
    file
) {

    if (!file)
        return null;


    if (
        file.size >
        10 * 1024 * 1024
    ) {

        alert(
            "حجم فایل نباید بیشتر از ۱۰ مگابایت باشد."
        );

        return null;
    }


    const form =
        new FormData();


    form.append(
        "file",
        file
    );


    try {

        const data =
            await apiFetch(
                "/upload",
                {
                    method: "POST",
                    body: form
                }
            );


        if (
            !data?.success ||
            !data?.file
        ) {

            throw new Error(
                data?.message ||
                "آپلود انجام نشد."
            );
        }


        return data.file;

    }
    catch (error) {

        console.error(
            "UPLOAD ERROR:",
            error
        );


        alert(
            error.message ||
            "آپلود فایل انجام نشد."
        );


        return null;
    }
}


// =========================
// IMAGE / FILE UPLOAD
// =========================

if (photoBtn) {

    photoBtn.onclick =
        function() {

            if (fileInput) {

                fileInput.click();
            }

        };
}


if (fileInput) {

    fileInput.onchange =
        async function() {

            const file =
                fileInput.files?.[0];


            if (!file)
                return;


            if (!selectedUser) {

                alert(
                    "ابتدا یک کاربر را انتخاب کن."
                );

                fileInput.value =
                    "";

                return;
            }


            const uploaded =
                await uploadFile(
                    file
                );


            if (!uploaded)
                return;


            const success =
                sendSocket({

                    type: "file",

                    receiver_id:
                        String(
                            selectedUser.id
                        ),

                    file:
                        uploaded

                });


            if (!success) {

                alert(
                    "اتصال چت برقرار نیست."
                );

                return;
            }


            fileInput.value =
                "";
        };
}


// =========================
// VOICE RECORD
// =========================

if (voiceBtn) {

    voiceBtn.onclick =
        async function() {

            if (recording) {

                if (
                    mediaRecorder &&
                    mediaRecorder.state !==
                        "inactive"
                ) {

                    mediaRecorder.stop();
                }

                recording =
                    false;

                voiceBtn.innerText =
                    "🎤";

                return;
            }


            if (!selectedUser) {

                alert(
                    "ابتدا یک کاربر را انتخاب کن."
                );

                return;
            }


            try {

                const stream =
                    await navigator
                        .mediaDevices
                        .getUserMedia({
                            audio: true
                        });


                mediaRecorder =
                    new MediaRecorder(
                        stream
                    );


                audioChunks =
                    [];


                mediaRecorder.ondataavailable =
                    event => {

                        if (
                            event.data &&
                            event.data.size > 0
                        ) {

                            audioChunks.push(
                                event.data
                            );
                        }
                    };


                mediaRecorder.onstop =
                    async () => {

                        try {

                            stream
                                .getTracks()
                                .forEach(
                                    track =>
                                        track.stop()
                                );


                            const blob =
                                new Blob(
                                    audioChunks,
                                    {
                                        type:
                                            mediaRecorder.mimeType ||
                                            "audio/webm"
                                    }
                                );


                            if (!blob.size) {

                                return;
                            }


                            const file =
                                new File(
                                    [blob],
                                    `voice-${Date.now()}.webm`,
                                    {
                                        type:
                                            blob.type ||
                                            "audio/webm"
                                    }
                                );


                            const uploaded =
                                await uploadFile(
                                    file
                                );


                            if (!uploaded)
                                return;


                            sendSocket({

                                type: "file",

                                receiver_id:
                                    String(
                                        selectedUser.id
                                    ),

                                file:
                                    uploaded

                            });

                        }
                        catch (error) {

                            console.error(
                                "VOICE SEND ERROR:",
                                error
                            );

                        }

                    };


                mediaRecorder.start();

                recording =
                    true;

                voiceBtn.innerText =
                    "⏹";

            }
            catch (error) {

                console.error(
                    "MIC ERROR:",
                    error
                );


                alert(
                    "دسترسی به میکروفن داده نشد."
                );
            }

        };
}


// =========================
// START
// =========================

loadMe();