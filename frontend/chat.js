"use strict";

const API = "https://gapino3.onrender.com";
const WS_API = "wss://gapino3.onrender.com";

let currentUser = null;
let currentChatUser = null;
let currentGroup = null;
let currentChannel = null;

let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let pollingTimer = null;
let typingTimer = null;

let users = [];
let groups = [];
let channels = [];
let messages = [];

let selectedFile = null;

let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

const GapinoPush =
    window.Capacitor && typeof window.Capacitor.registerPlugin === "function"
        ? window.Capacitor.registerPlugin("GapinoPush")
        : null;

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message) {
    const toast = $("gapinoToast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = String(message || "");
    toast.style.display = "block";

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.style.display = "none";
    }, 3000);
}

function showNotification(message) {
    const box = $("messageNotification");

    if (!box) return;

    box.textContent = String(message || "");
    box.style.display = "block";

    clearTimeout(box._timer);

    box._timer = setTimeout(() => {
        box.style.display = "none";
    }, 3500);
}

async function apiFetch(path, options = {}) {
    const config = {
        credentials: "include",
        ...options,
        headers: {
            ...(options.headers || {})
        }
    };

    const response = await fetch(`${API}${path}`, config);

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const message =
            data?.message ||
            data?.detail ||
            `خطای سرور: ${response.status}`;

        throw new Error(message);
    }

    return data;
}

function saveLocalUser(user) {
    if (!user) return;

    try {
        localStorage.setItem(
            "gapino_user",
            JSON.stringify(user)
        );
    } catch (error) {
        console.warn("saveLocalUser:", error);
    }
}

function getLocalUser() {
    try {
        const raw = localStorage.getItem("gapino_user");

        if (!raw) {
            return null;
        }

        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function clearLocalUser() {
    try {
        localStorage.removeItem("gapino_user");
    } catch {}
}

function getUserId(user) {
    return user?.id ?? user?.user_id ?? "";
}

function getUserName(user) {
    return (
        user?.display_name ||
        user?.name ||
        user?.username ||
        "کاربر"
    );
}

function getUsername(user) {
    const username =
        user?.username ||
        "";

    if (!username) {
        return "";
    }

    return username.startsWith("@")
        ? username
        : `@${username}`;
}

function isOnline(user) {
    return Boolean(
        user?.online ??
        user?.is_online ??
        user?.status === "online"
    );
}

function getAvatarUrl(user) {
    return (
        user?.avatar ||
        user?.avatar_url ||
        user?.photo ||
        ""
    );
}

function avatarHtml(user, size = 50) {
    const name = getUserName(user);
    const avatar = getAvatarUrl(user);

    if (avatar) {
        return `
            <div
                class="avatar"
                style="width:${size}px;height:${size}px;"
            >
                <img
                    src="${escapeHtml(avatar)}"
                    alt=""
                >
            </div>
        `;
    }

    return `
        <div
            class="avatar"
            style="width:${size}px;height:${size}px;"
        >
            ${escapeHtml(name.charAt(0).toUpperCase() || "👤")}
        </div>
    `;
}

function setAvatarElement(element, user, size = 50) {
    if (!element) return;

    element.innerHTML =
        avatarHtml(user, size);
}

async function loadCurrentUser() {
    try {
        const data =
            await apiFetch("/me");

        currentUser =
            data?.user ||
            data?.current_user ||
            data;

        if (!currentUser || !getUserId(currentUser)) {
            throw new Error("کاربر معتبر نیست");
        }

        saveLocalUser(currentUser);

        updateCurrentUserUI();

        return true;
    } catch (error) {
        console.warn("loadCurrentUser:", error);

        const localUser =
            getLocalUser();

        if (localUser && getUserId(localUser)) {
            currentUser = localUser;

            updateCurrentUserUI();

            return true;
        }

        clearLocalUser();

        window.location.href =
            "login.html";

        return false;
    }
}

function updateCurrentUserUI() {
    if (!currentUser) return;

    const name =
        getUserName(currentUser);

    const username =
        getUsername(currentUser);

    const currentName =
        $("currentUserName");

    const currentUsername =
        $("currentUserUsername");

    const avatar =
        $("currentUserAvatar");

    if (currentName) {
        currentName.textContent = name;
    }

    if (currentUsername) {
        currentUsername.textContent =
            username;
    }

    if (avatar) {
        setAvatarElement(
            avatar,
            currentUser,
            50
        );
    }

    const messageInput =
        $("messageInput");

    if (messageInput && !currentChatUser && !currentGroup && !currentChannel) {
        messageInput.placeholder =
            "یک کاربر را انتخاب کنید...";
        messageInput.disabled = true;
    }
}

async function loadUsers() {
    try {
        const data =
            await apiFetch("/users");

        users =
            Array.isArray(data)
                ? data
                : Array.isArray(data?.users)
                    ? data.users
                    : [];

        renderUsers(users);

        return users;
    } catch (error) {
        console.error("loadUsers:", error);

        const container =
            $("usersList");

        if (container) {
            container.innerHTML = `
                <div class="loading-users">
                    دریافت کاربران ناموفق بود
                </div>
            `;
        }

        return [];
    }
}

function renderUsers(list) {
    const container =
        $("usersList");

    if (!container) return;

    const myId =
        String(getUserId(currentUser));

    const visibleUsers =
        list.filter(user => {
            return String(getUserId(user)) !== myId;
        });

    if (!visibleUsers.length) {
        container.innerHTML = `
            <div class="loading-users">
                کاربر دیگری پیدا نشد
            </div>
        `;

        return;
    }

    container.innerHTML =
        visibleUsers.map(user => {
            const id =
                getUserId(user);

            const online =
                isOnline(user);

            const active =
                currentChatUser &&
                String(getUserId(currentChatUser)) ===
                String(id);

            return `
                <div
                    class="user-item ${active ? "active" : ""}"
                    data-user-id="${escapeHtml(id)}"
                >
                    ${avatarHtml(user, 50)}

                    <div class="user-info">

                        <div class="username-row">

                            <div class="username">
                                ${escapeHtml(
                                    getUserName(user)
                                )}
                            </div>

                        </div>

                        <div class="status-text">
                            ${
                                online
                                    ? "آنلاین"
                                    : "آفلاین"
                            }
                        </div>

                    </div>

                    <span
                        class="${
                            online
                                ? "online-dot"
                                : "offline-dot"
                        }"
                    ></span>
                </div>
            `;
        }).join("");

    container
        .querySelectorAll("[data-user-id]")
        .forEach(item => {
            item.addEventListener(
                "click",
                () => {
                    const id =
                        item.getAttribute(
                            "data-user-id"
                        );

                    openChat(id);
                }
            );
        });
}

function findUser(userId) {
    return users.find(user => {
        return String(getUserId(user)) ===
            String(userId);
    });
}

async function openChat(userId) {
    let user =
        findUser(userId);

    if (!user) {
        try {
            const data =
                await apiFetch(
                    `/users/${encodeURIComponent(userId)}`
                );

            user =
                data?.user ||
                data;
        } catch (error) {
            console.warn(
                "openChat user:",
                error
            );
        }
    }

    if (!user) {
        showToast("کاربر پیدا نشد");
        return;
    }

    currentChatUser = user;
    currentGroup = null;
    currentChannel = null;

    updateChatHeader();

    setChatMode();

    await loadPrivateMessages();

    connectWebSocket();

    startPolling();

    renderUsers(users);
}

function updateChatHeader() {
    const title =
        $("chatUserName");

    const username =
        $("chatUserUsername");

    const avatar =
        $("chatUserAvatar");

    const status =
        $("connectionStatus");

    const input =
        $("messageInput");

    const sendButton =
        $("sendMessageButton");

    if (currentChatUser) {
        if (title) {
            title.textContent =
                getUserName(currentChatUser);
        }

        if (username) {
            username.textContent =
                getUsername(currentChatUser);
        }

        if (avatar) {
            setAvatarElement(
                avatar,
                currentChatUser,
                50
            );
        }

        if (status) {
            status.textContent =
                isOnline(currentChatUser)
                    ? "آنلاین"
                    : "آفلاین";
        }

        if (input) {
            input.disabled = false;
            input.placeholder =
                "پیام خود را بنویسید...";
        }

        if (sendButton) {
            sendButton.disabled = false;
        }

        return;
    }

    if (currentGroup) {
        if (title) {
            title.textContent =
                currentGroup.name ||
                "گروه";
        }

        if (username) {
            username.textContent =
                "گروه";
        }

        if (avatar) {
            avatar.innerHTML = "👥";
        }

        if (input) {
            input.disabled = false;
            input.placeholder =
                "پیام گروه...";
        }

        if (sendButton) {
            sendButton.disabled = false;
        }

        return;
    }

    if (currentChannel) {
        if (title) {
            title.textContent =
                currentChannel.name ||
                "کانال";
        }

        if (username) {
            username.textContent =
                "کانال";
        }

        if (avatar) {
            avatar.innerHTML = "📢";
        }

        if (input) {
            input.disabled = false;
            input.placeholder =
                "پیام کانال...";
        }

        if (sendButton) {
            sendButton.disabled = false;
        }

        return;
    }

    if (title) {
        title.textContent =
            "گفتگو";
    }

    if (username) {
        username.textContent =
            "یک کاربر را انتخاب کنید";
    }

    if (avatar) {
        avatar.innerHTML =
            "💬";
    }

    if (input) {
        input.disabled = true;
        input.placeholder =
            "یک کاربر را انتخاب کنید...";
    }

    if (sendButton) {
        sendButton.disabled = true;
    }

    if (status) {
        status.textContent =
            "آماده";
    }
}

function setChatMode() {
    const app =
        document.querySelector(".app");

    if (!app) return;

    if (
        currentChatUser ||
        currentGroup ||
        currentChannel
    ) {
        app.classList.add(
            "show-chat"
        );
    } else {
        app.classList.remove(
            "show-chat"
        );
    }
}

async function loadPrivateMessages() {
    if (
        !currentUser ||
        !currentChatUser
    ) {
        return;
    }

    const otherId =
        getUserId(currentChatUser);

    try {
        const data =
            await apiFetch(
                `/messages/${encodeURIComponent(otherId)}`
            );

        messages =
            Array.isArray(data)
                ? data
                : Array.isArray(data?.messages)
                    ? data.messages
                    : [];

        renderMessages();

        scrollMessagesToBottom();
    } catch (error) {
        console.error(
            "loadPrivateMessages:",
            error
        );
    }
}

function normalizeMessage(message) {
    return {
        ...message,
        id:
            message?.id ??
            message?.message_id ??
            `${Date.now()}-${Math.random()}`,
        sender_id:
            message?.sender_id ??
            message?.from_id ??
            message?.user_id,
        receiver_id:
            message?.receiver_id ??
            message?.to_id,
        text:
            message?.text ??
            message?.content ??
            "",
        type:
            message?.type ||
            "text",
        time:
            message?.time ??
            message?.created_at ??
            message?.timestamp ??
            ""
    };
}

function renderMessages() {
    const container =
        $("messages");

    if (!container) return;

    if (!messages.length) {
        container.innerHTML = `
            <div class="empty-chat">
                <div class="empty-chat-icon">
                    💬
                </div>

                <h2>
                    هنوز پیامی وجود ندارد
                </h2>

                <p>
                    اولین پیام این گفتگو را بفرست.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        messages
            .map(normalizeMessage)
            .map(renderMessage)
            .join("");

    bindMessageActions();
}

function renderMessage(message) {
    const normalized =
        normalizeMessage(message);

    const myId =
        String(getUserId(currentUser));

    const senderId =
        String(normalized.sender_id ?? "");

    const mine =
        senderId === myId;

    const type =
        String(normalized.type || "text")
            .toLowerCase();

    const time =
        formatMessageTime(
            normalized.time
        );

    let content = "";

    if (
        (type === "image" ||
            type === "photo") &&
        normalized.url
    ) {
        content = `
            <img
                class="chat-image"
                src="${escapeHtml(normalized.url)}"
                alt=""
                onclick="window.open('${escapeHtml(
                    normalized.url
                )}', '_blank')"
            >
        `;

        if (normalized.text) {
            content += `
                <div>
                    ${escapeHtml(normalized.text)}
                </div>
            `;
        }
    } else if (
        type === "audio" ||
        type === "voice"
    ) {
        const audioUrl =
            normalized.url ||
            normalized.file_url;

        content = `
            <div class="voice-message">

                <audio
                    controls
                    preload="metadata"
                    src="${escapeHtml(audioUrl || "")}"
                ></audio>

                <div class="voice-name">
                    ${escapeHtml(
                        normalized.filename ||
                        "پیام صوتی"
                    )}
                </div>

            </div>
        `;
    } else if (
        type === "file" ||
        normalized.file_url
    ) {
        const fileUrl =
            normalized.url ||
            normalized.file_url;

        const fileName =
            normalized.filename ||
            normalized.file_name ||
            "فایل";

        content = `
            <a
                class="chat-file"
                href="${escapeHtml(fileUrl || "#")}"
                target="_blank"
                rel="noopener noreferrer"
            >
                <span class="chat-file-icon">
                    📎
                </span>

                <span class="chat-file-info">

                    <strong>
                        ${escapeHtml(fileName)}
                    </strong>

                    <small>
                        باز کردن فایل
                    </small>

                </span>
            </a>
        `;
    } else {
        content = `
            <div>
                ${escapeHtml(normalized.text)}
            </div>
        `;
    }

    return `
        <div
            class="message-row ${
                mine
                    ? "mine"
                    : "theirs"
            }"
            data-message-id="${escapeHtml(
                normalized.id
            )}"
        >

            <div class="message-bubble">

                ${content}

                <span class="message-time">
                    ${escapeHtml(time)}
                </span>

            </div>

        </div>
    `;
}

function formatMessageTime(value) {
    if (!value) {
        return "";
    }

    const text =
        String(value);

    if (
        text.includes(" ")
    ) {
        const parts =
            text.split(" ");

        return parts[parts.length - 1];
    }

    if (
        text.includes("T")
    ) {
        const parts =
            text.split("T");

        const time =
            parts[1] || "";

        return time.split(".")[0];
    }

    return text;
}

function bindMessageActions() {
}

function scrollMessagesToBottom() {
    const container =
        $("messages");

    if (!container) return;

    requestAnimationFrame(() => {
        container.scrollTop =
            container.scrollHeight;
    });
}

async function sendTextMessage(text) {
    const value =
        String(text ?? "")
            .trim();

    if (!value) {
        return;
    }

    if (!currentChatUser && !currentGroup && !currentChannel) {
        showToast(
            "ابتدا یک گفتگو را انتخاب کنید"
        );
        return;
    }

    if (currentGroup) {
        await sendGroupMessage(
            value
        );
        return;
    }

    if (currentChannel) {
        await sendChannelMessage(
            value
        );
        return;
    }

    const receiverId =
        getUserId(currentChatUser);

    if (!receiverId) {
        return;
    }

    if (
        socket &&
        socket.readyState ===
            WebSocket.OPEN
    ) {
        try {
            socket.send(
                JSON.stringify({
                    type: "message",
                    receiver_id: receiverId,
                    text: value
                })
            );

            addLocalMessage({
                sender_id:
                    getUserId(currentUser),
                receiver_id:
                    receiverId,
                text: value,
                type: "text",
                time: new Date().toLocaleTimeString(
                    "fa-IR",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                )
            });

            return;
        } catch (error) {
            console.warn(
                "WebSocket send:",
                error
            );
        }
    }

    try {
        await apiFetch(
            "/messages/send",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    receiver_id:
                        receiverId,
                    text: value
                })
            }
        );

        await loadPrivateMessages();
    } catch (error) {
        showToast(
            error.message ||
                "ارسال پیام انجام نشد"
        );
    }
}

function addLocalMessage(message) {
    const normalized =
        normalizeMessage(message);

    messages.push(
        normalized
    );

    renderMessages();
    scrollMessagesToBottom();
}

async function sendGroupMessage(text) {
    const groupId =
        getObjectId(currentGroup);

    if (!groupId) return;

    try {
        await apiFetch(
            `/groups/${encodeURIComponent(groupId)}/messages`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    text
                })
            }
        );

        await openGroup(
            groupId
        );
    } catch (error) {
        showToast(
            error.message ||
                "ارسال پیام گروه انجام نشد"
        );
    }
}

async function sendChannelMessage(text) {
    const channelId =
        getObjectId(currentChannel);

    if (!channelId) return;

    try {
        await apiFetch(
            `/channels/${encodeURIComponent(channelId)}/messages`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    text
                })
            }
        );

        await openChannel(
            channelId
        );
    } catch (error) {
        showToast(
            error.message ||
                "ارسال پیام کانال انجام نشد"
        );
    }
}

function getObjectId(object) {
    return object?.id ??
        object?.group_id ??
        object?.channel_id ??
        "";
}

function connectWebSocket() {
    if (!currentUser) {
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

    clearTimeout(
        reconnectTimer
    );

    const userId =
        getUserId(currentUser);

    if (!userId) {
        return;
    }

    try {
        socket = new WebSocket(
            `${WS_API}/ws/${encodeURIComponent(userId)}`
        );

        socket.onopen = () => {
            console.log(
                "GAPINO WebSocket connected"
            );

            const status =
                $("connectionStatus");

            if (status) {
                status.textContent =
                    "متصل";
            }

            clearTimeout(
                reconnectTimer
            );

            startHeartbeat();
        };

        socket.onmessage =
            event => {
                handleWebSocketMessage(
                    event.data
                );
            };

        socket.onerror =
            error => {
                console.warn(
                    "GAPINO WebSocket error:",
                    error
                );

                const status =
                    $("connectionStatus");

                if (status) {
                    status.textContent =
                        "در حال اتصال...";
                }
            };

        socket.onclose = () => {
            stopHeartbeat();

            socket = null;

            const status =
                $("connectionStatus");

            if (status) {
                status.textContent =
                    "قطع شد؛ اتصال مجدد...";
            }

            scheduleReconnect();
        };
    } catch (error) {
        console.error(
            "connectWebSocket:",
            error
        );

        scheduleReconnect();
    }
}

function scheduleReconnect() {
    clearTimeout(
        reconnectTimer
    );

    reconnectTimer =
        setTimeout(() => {
            connectWebSocket();
        }, 3000);
}

function startHeartbeat() {
    stopHeartbeat();

    heartbeatTimer =
        setInterval(() => {
            if (
                socket &&
                socket.readyState ===
                    WebSocket.OPEN
            ) {
                try {
                    socket.send(
                        JSON.stringify({
                            type: "ping"
                        })
                    );
                } catch {}
            }
        }, 25000);
}

function stopHeartbeat() {
    clearInterval(
        heartbeatTimer
    );

    heartbeatTimer =
        null;
}

function handleWebSocketMessage(raw) {
    let data;

    try {
        data =
            typeof raw === "string"
                ? JSON.parse(raw)
                : raw;
    } catch {
        return;
    }

    if (!data) {
        return;
    }

    if (
        data.type === "pong"
    ) {
        return;
    }

    if (
        data.type === "typing"
    ) {
        handleTypingEvent(
            data
        );

        return;
    }

    if (
        data.type === "message" ||
        data.type === "new_message"
    ) {
        const message =
            normalizeMessage(
                data.message ||
                data
            );

        handleIncomingMessage(
            message
        );

        return;
    }

    if (
        data.type === "message_deleted"
    ) {
        const id =
            data.message_id ??
            data.id;

        messages =
            messages.filter(
                message =>
                    String(message.id) !==
                    String(id)
            );

        renderMessages();

        return;
    }
}

function handleIncomingMessage(message) {
    const senderId =
        String(
            message.sender_id ?? ""
        );

    const receiverId =
        String(
            message.receiver_id ?? ""
        );

    const myId =
        String(
            getUserId(currentUser)
        );

    let relevant = false;

    if (currentChatUser) {
        const otherId =
            String(
                getUserId(
                    currentChatUser
                )
            );

        relevant =
            (
                senderId === otherId &&
                receiverId === myId
            ) ||
            (
                senderId === myId &&
                receiverId === otherId
            );
    }

    if (!currentChatUser) {
        return;
    }

    if (!relevant) {
        showNotification(
            "پیام جدید دریافت شد"
        );

        return;
    }

    const exists =
        messages.some(
            item =>
                String(item.id) ===
                String(message.id)
        );

    if (!exists) {
        messages.push(
            message
        );

        renderMessages();
        scrollMessagesToBottom();
    }
}

function handleTypingEvent(data) {
    const senderId =
        String(
            data.sender_id ??
            data.user_id ??
            ""
        );

    const currentId =
        String(
            getUserId(
                currentChatUser
            )
        );

    if (
        !currentChatUser ||
        senderId !== currentId
    ) {
        return;
    }

    const indicator =
        $("typingIndicator");

    if (!indicator) return;

    indicator.style.visibility =
        "visible";

    clearTimeout(
        typingTimer
    );

    typingTimer =
        setTimeout(() => {
            indicator.style.visibility =
                "hidden";
        }, 2000);
}

function sendTyping() {
    if (
        !currentChatUser ||
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {
        return;
    }

    try {
        socket.send(
            JSON.stringify({
                type: "typing",
                receiver_id:
                    getUserId(
                        currentChatUser
                    )
            })
        );
    } catch {}
}

function startPolling() {
    stopPolling();

    pollingTimer =
        setInterval(async () => {
            if (
                currentChatUser &&
                (
                    !socket ||
                    socket.readyState !==
                        WebSocket.OPEN
                )
            ) {
                await loadPrivateMessages();
            }
        }, 5000);
}

function stopPolling() {
    if (pollingTimer) {
        clearInterval(
            pollingTimer
        );

        pollingTimer = null;
    }
}

async function loadGroups() {
    try {
        const data =
            await apiFetch(
                "/groups"
            );

        groups =
            Array.isArray(data)
                ? data
                : Array.isArray(data?.groups)
                    ? data.groups
                    : [];

        renderGroups();

        return groups;
    } catch (error) {
        console.error(
            "loadGroups:",
            error
        );

        groups = [];

        renderGroups();

        return [];
    }
}

function renderGroups() {
    const container =
        $("groupsList");

    if (!container) return;

    if (!groups.length) {
        container.innerHTML = `
            <div class="loading-users">
                هنوز گروهی وجود ندارد
            </div>
        `;

        return;
    }

    container.innerHTML =
        groups.map(group => {
            const id =
                getObjectId(group);

            return `
                <div
                    class="user-item"
                    data-group-id="${escapeHtml(id)}"
                >

                    <div class="avatar">
                        👥
                    </div>

                    <div class="user-info">

                        <div class="username">
                            ${escapeHtml(
                                group.name ||
                                "گروه"
                            )}
                        </div>

                        <div class="status-text">
                            گروه
                        </div>

                    </div>

                </div>
            `;
        }).join("");

    container
        .querySelectorAll(
            "[data-group-id]"
        )
        .forEach(item => {
            item.addEventListener(
                "click",
                () => {
                    openGroup(
                        item.getAttribute(
                            "data-group-id"
                        )
                    );
                }
            );
        });
}

async function openGroup(groupId) {
    const group =
        groups.find(item => {
            return String(
                getObjectId(item)
            ) ===
            String(groupId);
        });

    if (!group) {
        showToast(
            "گروه پیدا نشد"
        );
        return;
    }

    currentGroup = group;
    currentChatUser = null;
    currentChannel = null;

    updateChatHeader();
    setChatMode();

    try {
        const data =
            await apiFetch(
                `/groups/${encodeURIComponent(groupId)}/messages`
            );

        messages =
            Array.isArray(data)
                ? data
                : Array.isArray(data?.messages)
                    ? data.messages
                    : [];

        renderMessages();
        scrollMessagesToBottom();
    } catch (error) {
        console.error(
            "openGroup:",
            error
        );

        showToast(
            "دریافت پیام‌های گروه انجام نشد"
        );
    }
}

async function loadChannels() {
    try {
        const data =
            await apiFetch(
                "/channels"
            );

        channels =
            Array.isArray(data)
                ? data
                : Array.isArray(data?.channels)
                    ? data.channels
                    : [];

        renderChannels();

        return channels;
    } catch (error) {
        console.error(
            "loadChannels:",
            error
        );

        channels = [];

        renderChannels();

        return [];
    }
}

function renderChannels() {
    const container =
        $("channelsList");

    if (!container) return;

    if (!channels.length) {
        container.innerHTML = `
            <div class="loading-users">
                هنوز کانالی وجود ندارد
            </div>
        `;

        return;
    }

    container.innerHTML =
        channels.map(channel => {
            const id =
                getObjectId(channel);

            return `
                <div
                    class="user-item"
                    data-channel-id="${escapeHtml(id)}"
                >

                    <div class="avatar">
                        📢
                    </div>

                    <div class="user-info">

                        <div class="username">
                            ${escapeHtml(
                                channel.name ||
                                "کانال"
                            )}
                        </div>

                        <div class="status-text">
                            کانال
                        </div>

                    </div>

                </div>
            `;
        }).join("");

    container
        .querySelectorAll(
            "[data-channel-id]"
        )
        .forEach(item => {
            item.addEventListener(
                "click",
                () => {
                    openChannel(
                        item.getAttribute(
                            "data-channel-id"
                        )
                    );
                }
            );
        });
}

async function openChannel(channelId) {
    const channel =
        channels.find(item => {
            return String(
                getObjectId(item)
            ) ===
            String(channelId);
        });

    if (!channel) {
        showToast(
            "کانال پیدا نشد"
        );
        return;
    }

    currentChannel = channel;
    currentChatUser = null;
    currentGroup = null;

    updateChatHeader();
    setChatMode();

    try {
        const data =
            await apiFetch(
                `/channels/${encodeURIComponent(channelId)}/messages`
            );

        messages =
            Array.isArray(data)
                ? data
                : Array.isArray(data?.messages)
                    ? data.messages
                    : [];

        renderMessages();
        scrollMessagesToBottom();
    } catch (error) {
        console.error(
            "openChannel:",
            error
        );

        showToast(
            "دریافت پیام‌های کانال انجام نشد"
        );
    }
}

async function sendFile(file) {
    if (!file) return;

    if (
        !currentChatUser &&
        !currentGroup &&
        !currentChannel
    ) {
        showToast(
            "ابتدا یک گفتگو را انتخاب کنید"
        );
        return;
    }

    const uploadStatus =
        $("uploadStatus");

    if (uploadStatus) {
        uploadStatus.textContent =
            "در حال ارسال فایل...";
    }

    const form =
        new FormData();

    form.append(
        "file",
        file
    );

    if (currentChatUser) {
        form.append(
            "receiver_id",
            String(
                getUserId(
                    currentChatUser
                )
            )
        );
    }

    if (currentGroup) {
        form.append(
            "group_id",
            String(
                getObjectId(
                    currentGroup
                )
            )
        );
    }

    if (currentChannel) {
        form.append(
            "channel_id",
            String(
                getObjectId(
                    currentChannel
                )
            )
        );
    }

    try {
        const data =
            await apiFetch(
                "/upload",
                {
                    method: "POST",
                    body: form
                }
            );

        if (uploadStatus) {
            uploadStatus.textContent =
                "فایل با موفقیت ارسال شد";
        }

        await refreshCurrentConversation();

        selectedFile = null;

        closeFilePreview();
    } catch (error) {
        console.error(
            "sendFile:",
            error
        );

        if (uploadStatus) {
            uploadStatus.textContent =
                "";
        }

        showToast(
            error.message ||
                "ارسال فایل انجام نشد"
        );
    }
}

async function toggleVoiceRecording() {
    if (isRecording) {
        stopVoiceRecording();
        return;
    }

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {
        showToast(
            "مرورگر یا برنامه به ضبط صدا دسترسی ندارد"
        );
        return;
    }

    try {
        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        audioChunks = [];

        mediaRecorder =
            new MediaRecorder(
                stream
            );

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
                const blob =
                    new Blob(
                        audioChunks,
                        {
                            type:
                                mediaRecorder.mimeType ||
                                "audio/webm"
                        }
                    );

                stream
                    .getTracks()
                    .forEach(
                        track => track.stop()
                    );

                if (blob.size > 0) {
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

                    await sendFile(
                        file
                    );
                }
            };

        mediaRecorder.start();

        isRecording = true;

        updateVoiceUI();
    } catch (error) {
        console.error(
            "toggleVoiceRecording:",
            error
        );

        showToast(
            "دسترسی به میکروفون داده نشد"
        );
    }
}

function stopVoiceRecording() {
    if (
        mediaRecorder &&
        mediaRecorder.state !==
            "inactive"
    ) {
        mediaRecorder.stop();
    }

    isRecording = false;

    updateVoiceUI();
}

function updateVoiceUI() {
    const button =
        $("gapinoVoiceButton");

    const status =
        $("gapinoVoiceStatus");

    if (button) {
        button.classList.toggle(
            "recording",
            isRecording
        );

        button.textContent =
            isRecording
                ? "⏹️"
                : "🎙️";
    }

    if (status) {
        status.style.display =
            isRecording
                ? "block"
                : "none";

        status.textContent =
            isRecording
                ? "در حال ضبط..."
                : "ویس";
    }
}

function setupTabs() {
    const usersTab =
        $("usersTabButton");

    const groupsTab =
        $("groupsTabButton");

    const channelsTab =
        $("channelsTabButton");

    const usersSection =
        $("usersSection");

    const groupsSection =
        $("groupsSection");

    const channelsSection =
        $("channelsSection");

    function activate(
        tab,
        section
    ) {
        [usersTab, groupsTab, channelsTab]
            .forEach(button => {
                if (button) {
                    button.classList.remove(
                        "active"
                    );
                }
            });

        [usersSection, groupsSection, channelsSection]
            .forEach(target => {
                if (target) {
                    target.classList.add(
                        "hidden-section"
                    );
                }
            });

        if (tab) {
            tab.classList.add(
                "active"
            );
        }

        if (section) {
            section.classList.remove(
                "hidden-section"
            );
        }
    }

    if (usersTab) {
        usersTab.addEventListener(
            "click",
            () => {
                activate(
                    usersTab,
                    usersSection
                );
            }
        );
    }

    if (groupsTab) {
        groupsTab.addEventListener(
            "click",
            () => {
                activate(
                    groupsTab,
                    groupsSection
                );

                loadGroups();
            }
        );
    }

    if (channelsTab) {
        channelsTab.addEventListener(
            "click",
            () => {
                activate(
                    channelsTab,
                    channelsSection
                );

                loadChannels();
            }
        );
    }
}

function setupSearch() {
    const input =
        $("searchInput");

    if (!input) return;

    input.addEventListener(
        "input",
        () => {
            const query =
                input.value
                    .trim()
                    .toLowerCase();

            if (!query) {
                renderUsers(users);
                return;
            }

            const filtered =
                users.filter(user => {
                    const name =
                        getUserName(user)
                            .toLowerCase();

                    const username =
                        String(
                            user?.username || ""
                        ).toLowerCase();

                    return (
                        name.includes(query) ||
                        username.includes(query)
                    );
                });

            renderUsers(
                filtered
            );
        }
    );
}

function setupMessageForm() {
    const form =
        $("messageForm");

    const input =
        $("messageInput");

    if (!form || !input) {
        return;
    }

    form.addEventListener(
        "submit",
        event => {
            event.preventDefault();

            const text =
                input.value.trim();

            if (!text) {
                return;
            }

            input.value = "";

            sendTextMessage(
                text
            );
        }
    );

    input.addEventListener(
        "input",
        () => {
            sendTyping();

            autoResizeTextarea(
                input
            );
        }
    );

    input.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {
                event.preventDefault();

                form.requestSubmit();
            }
        }
    );
}

function autoResizeTextarea(textarea) {
    textarea.style.height =
        "auto";

    textarea.style.height =
        `${Math.min(
            textarea.scrollHeight,
            140
        )}px`;
}

function setupAttachment() {
    const button =
        $("attachmentButton");

    const input =
        $("fileInput");

    if (!button || !input) {
        return;
    }

    button.addEventListener(
        "click",
        () => {
            input.click();
        }
    );

    input.addEventListener(
        "change",
        () => {
            const file =
                input.files?.[0];

            if (!file) {
                return;
            }

            selectedFile =
                file;

            showFilePreview(
                file
            );
        }
    );
}

function showFilePreview(file) {
    const modal =
        $("filePreviewModal");

    const preview =
        $("filePreview");

    const name =
        $("fileName");

    const size =
        $("fileSize");

    if (!modal) return;

    if (name) {
        name.textContent =
            file.name;
    }

    if (size) {
        size.textContent =
            formatFileSize(
                file.size
            );
    }

    if (preview) {
        if (
            file.type &&
            file.type.startsWith("image/")
        ) {
            const url =
                URL.createObjectURL(
                    file
                );

            preview.innerHTML = `
                <img
                    src="${url}"
                    alt=""
                    style="max-width:100%;max-height:250px;border-radius:15px;"
                >
            `;

            preview._objectUrl =
                url;
        } else {
            preview.innerHTML = `
                <div style="font-size:48px;">
                    📎
                </div>
            `;
        }
    }

    modal.hidden = false;
    modal.style.display =
        "flex";
}

function closeFilePreview() {
    const modal =
        $("filePreviewModal");

    const preview =
        $("filePreview");

    if (preview?._objectUrl) {
        URL.revokeObjectURL(
            preview._objectUrl
        );

        preview._objectUrl = null;
    }

    if (modal) {
        modal.style.display =
            "none";

        modal.hidden = true;
    }

    selectedFile = null;

    const input =
        $("fileInput");

    if (input) {
        input.value = "";
    }
}

function formatFileSize(size) {
    const value =
        Number(size) || 0;

    if (value < 1024) {
        return `${value} B`;
    }

    if (value < 1024 * 1024) {
        return `${(
            value / 1024
        ).toFixed(1)} KB`;
    }

    return `${(
        value / 1024 / 1024
    ).toFixed(1)} MB`;
}

function setupFilePreview() {
    const sendButton =
        $("sendFile");

    const cancelButton =
        $("cancelFile");

    if (sendButton) {
        sendButton.addEventListener(
            "click",
            async () => {
                if (!selectedFile) {
                    showToast(
                        "فایلی انتخاب نشده"
                    );
                    return;
                }

                await sendFile(
                    selectedFile
                );
            }
        );
    }

    if (cancelButton) {
        cancelButton.addEventListener(
            "click",
            closeFilePreview
        );
    }
}

function setupVoice() {
    const button =
        $("gapinoVoiceButton");

    if (!button) return;

    button.addEventListener(
        "click",
        toggleVoiceRecording
    );
}

function setupProfile() {
    const profileButton =
        $("profileButton");

    const closeButton =
        $("closeProfileButton");

    const closeButton2 =
        $("closeProfileButton2");

    const chooseAvatar =
        $("chooseAvatarButton");

    const removeAvatar =
        $("removeAvatarButton");

    const avatarFile =
        $("profileAvatarFile");

    const form =
        $("profileForm");

    if (profileButton) {
        profileButton.addEventListener(
            "click",
            () => {
                openMyProfile();
            }
        );
    }

    if (closeButton) {
        closeButton.addEventListener(
            "click",
            closeProfile
        );
    }

    if (closeButton2) {
        closeButton2.addEventListener(
            "click",
            closeProfile
        );
    }

    if (chooseAvatar && avatarFile) {
        chooseAvatar.addEventListener(
            "click",
            () => {
                avatarFile.click();
            }
        );

        avatarFile.addEventListener(
            "change",
            () => {
                const file =
                    avatarFile.files?.[0];

                if (!file) return;

                const url =
                    URL.createObjectURL(
                        file
                    );

                const avatar =
                    $("profileLargeAvatar");

                if (avatar) {
                    avatar.innerHTML = `
                        <img
                            src="${url}"
                            alt=""
                        >
                    `;

                    avatar._previewUrl =
                        url;
                }
            }
        );
    }

    if (removeAvatar) {
        removeAvatar.addEventListener(
            "click",
            () => {
                const avatar =
                    $("profileLargeAvatar");

                if (avatar) {
                    avatar.innerHTML =
                        "👤";
                }

                const hidden =
                    $("avatarInput");

                if (hidden) {
                    hidden.value =
                        "";
                }
            }
        );
    }

    if (form) {
        form.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                await saveProfile();
            }
        );
    }
}

async function openMyProfile() {
    if (!currentUser) return;

    const modal =
        $("profileModal");

    if (!modal) return;

    const displayName =
        $("displayNameInput");

    const bio =
        $("bioInput");

    const avatar =
        $("profileLargeAvatar");

    if (displayName) {
        displayName.value =
            currentUser.display_name ||
            currentUser.name ||
            "";
    }

    if (bio) {
        bio.value =
            currentUser.bio ||
            "";
    }

    if (avatar) {
        setAvatarElement(
            avatar,
            currentUser,
            100
        );
    }

    modal.hidden = false;
    modal.style.display =
        "flex";
}

function closeProfile() {
    const modal =
        $("profileModal");

    if (!modal) return;

    modal.style.display =
        "none";

    modal.hidden = true;
}

async function saveProfile() {
    const displayName =
        $("displayNameInput")?.value
            .trim() || "";

    const bio =
        $("bioInput")?.value
            .trim() || "";

    const avatarFile =
        $("profileAvatarFile")?.files?.[0];

    const message =
        $("profileMessage");

    try {
        let data;

        if (avatarFile) {
            const form =
                new FormData();

            form.append(
                "display_name",
                displayName
            );

            form.append(
                "bio",
                bio
            );

            form.append(
                "avatar",
                avatarFile
            );

            data =
                await apiFetch(
                    "/profile",
                    {
                        method: "POST",
                        body: form
                    }
                );
        } else {
            data =
                await apiFetch(
                    "/profile",
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            display_name:
                                displayName,
                            bio
                        })
                    }
                );
        }

        currentUser =
            data?.user ||
            data;

        saveLocalUser(
            currentUser
        );

        updateCurrentUserUI();

        if (message) {
            message.textContent =
                "پروفایل ذخیره شد";
            message.style.color =
                "#16a34a";
        }

        setTimeout(
            closeProfile,
            1000
        );
    } catch (error) {
        console.error(
            "saveProfile:",
            error
        );

        if (message) {
            message.textContent =
                error.message ||
                "ذخیره پروفایل انجام نشد";
        }
    }
}

function setupOtherUserProfile() {
    const button =
        $("chatUserProfileButton");

    if (!button) return;

    button.addEventListener(
        "click",
        () => {
            if (
                currentChatUser
            ) {
                openOtherUserProfile(
                    currentChatUser
                );
            }
        }
    );
}

function openOtherUserProfile(user) {
    const modal =
        $("otherUserProfileModal");

    if (!modal) return;

    const avatar =
        $("otherUserAvatar");

    const name =
        $("otherUserName");

    const username =
        $("otherUserUsername");

    const status =
        $("otherUserStatus");

    const id =
        $("otherUserId");

    if (avatar) {
        setAvatarElement(
            avatar,
            user,
            100
        );
    }

    if (name) {
        name.textContent =
            getUserName(user);
    }

    if (username) {
        username.textContent =
            getUsername(user);
    }

    if (status) {
        status.textContent =
            isOnline(user)
                ? "آنلاین"
                : "آفلاین";
    }

    if (id) {
        id.textContent =
            String(
                getUserId(user)
            );
    }

    modal.hidden = false;
    modal.style.display =
        "flex";
}

function setupGroups() {
    const openButton =
        $("createGroupButton");

    const closeButton =
        $("closeGroupButton");

    const closeButton2 =
        $("closeGroupButton2");

    const form =
        $("groupForm");

    if (openButton) {
        openButton.addEventListener(
            "click",
            () => {
                openModal(
                    "groupModal"
                );
            }
        );
    }

    if (closeButton) {
        closeButton.addEventListener(
            "click",
            () => {
                closeModal(
                    "groupModal"
                );
            }
        );
    }

    if (closeButton2) {
        closeButton2.addEventListener(
            "click",
            () => {
                closeModal(
                    "groupModal"
                );
            }
        );
    }

    if (form) {
        form.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                await createGroup(
                    form
                );
            }
        );
    }
}

async function createGroup(form) {
    const message =
        $("groupFormMessage");

    const formData =
        new FormData(
            form
        );

    const name =
        String(
            formData.get("name") ||
            ""
        ).trim();

    const description =
        String(
            formData.get("description") ||
            ""
        ).trim();

    if (!name) {
        if (message) {
            message.textContent =
                "نام گروه را وارد کنید";
        }
        return;
    }

    try {
        await apiFetch(
            "/groups",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    name,
                    description
                })
            }
        );

        if (message) {
            message.textContent =
                "گروه ساخته شد";
            message.style.color =
                "#16a34a";
        }

        form.reset();

        await loadGroups();

        setTimeout(
            () => {
                closeModal(
                    "groupModal"
                );
            },
            700
        );
    } catch (error) {
        if (message) {
            message.textContent =
                error.message ||
                "ساخت گروه انجام نشد";
        }
    }
}

function setupChannels() {
    const openButton =
        $("createChannelButton");

    const closeButton =
        $("closeChannelButton");

    const closeButton2 =
        $("closeChannelButton2");

    const form =
        $("channelForm");

    if (openButton) {
        openButton.addEventListener(
            "click",
            () => {
                openModal(
                    "channelModal"
                );
            }
        );
    }

    if (closeButton) {
        closeButton.addEventListener(
            "click",
            () => {
                closeModal(
                    "channelModal"
                );
            }
        );
    }

    if (closeButton2) {
        closeButton2.addEventListener(
            "click",
            () => {
                closeModal(
                    "channelModal"
                );
            }
        );
    }

    if (form) {
        form.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                await createChannel(
                    form
                );
            }
        );
    }
}

async function createChannel(form) {
    const message =
        $("channelFormMessage");

    const formData =
        new FormData(
            form
        );

    const name =
        String(
            formData.get("name") ||
            ""
        ).trim();

    const description =
        String(
            formData.get("description") ||
            ""
        ).trim();

    if (!name) {
        if (message) {
            message.textContent =
                "نام کانال را وارد کنید";
        }
        return;
    }

    try {
        await apiFetch(
            "/channels",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    name,
                    description
                })
            }
        );

        if (message) {
            message.textContent =
                "کانال ساخته شد";
            message.style.color =
                "#16a34a";
        }

        form.reset();

        await loadChannels();

        setTimeout(
            () => {
                closeModal(
                    "channelModal"
                );
            },
            700
        );
    } catch (error) {
        if (message) {
            message.textContent =
                error.message ||
                "ساخت کانال انجام نشد";
        }
    }
}

function openModal(id) {
    const modal =
        $(id);

    if (!modal) return;

    modal.hidden = false;
    modal.style.display =
        "flex";
}

function closeModal(id) {
    const modal =
        $(id);

    if (!modal) return;

    modal.style.display =
        "none";

    modal.hidden = true;
}

function setupBackButton() {
    const button =
        $("backToUsers");

    if (!button) return;

    button.addEventListener(
        "click",
        () => {
            currentChatUser = null;
            currentGroup = null;
            currentChannel = null;

            stopPolling();

            const app =
                document.querySelector(".app");

            if (app) {
                app.classList.remove(
                    "show-chat"
                );
            }

            updateChatHeader();
            renderMessages();
        }
    );
}

function setupLogout() {
    const button =
        $("logoutButton");

    if (!button) return;

    button.addEventListener(
        "click",
        logout
    );
}

async function logout() {
    stopPolling();
    stopHeartbeat();

    if (socket) {
        try {
            socket.close();
        } catch {}
    }

    socket = null;

    try {
        await apiFetch(
            "/logout",
            {
                method: "POST"
            }
        );
    } catch {}

    currentUser = null;
    currentChatUser = null;

    clearLocalUser();

    window.location.href =
        "login.html";
}

async function registerPushToken() {
    if (!GapinoPush) {
        console.log(
            "GapinoPush در نسخه وب موجود نیست"
        );
        return;
    }

    try {
        const result =
            await GapinoPush.getToken();

        const token =
            result?.token;

        if (!token) {
            console.warn(
                "FCM token دریافت نشد"
            );
            return;
        }

        const body =
            new URLSearchParams();

        body.append(
            "token",
            token
        );

        const response =
            await fetch(
                `${API}/push/register`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },
                    body:
                        body.toString()
                }
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        console.log(
            "FCM token ثبت شد"
        );
    } catch (error) {
        console.warn(
            "registerPushToken:",
            error
        );
    }
}

async function refreshCurrentConversation() {
    if (currentChatUser) {
        await loadPrivateMessages();
        return;
    }

    if (currentGroup) {
        await openGroup(
            getObjectId(
                currentGroup
            )
        );
        return;
    }

    if (currentChannel) {
        await openChannel(
            getObjectId(
                currentChannel
            )
        );
    }
}

async function refreshUsersPeriodically() {
    await loadUsers();

    setTimeout(
        refreshUsersPeriodically,
        10000
    );
}

async function init() {
    const authenticated =
        await loadCurrentUser();

    if (!authenticated) {
        return;
    }

    setupTabs();
    setupSearch();
    setupMessageForm();
    setupAttachment();
    setupFilePreview();
    setupVoice();
    setupProfile();
    setupOtherUserProfile();
    setupGroups();
    setupChannels();
    setupBackButton();
    setupLogout();

    updateChatHeader();
    renderMessages();

    await Promise.all([
        loadUsers(),
        loadGroups(),
        loadChannels()
    ]);

    connectWebSocket();
    startPolling();

    registerPushToken();

    refreshUsersPeriodically();
}

window.openChat =
    openChat;

window.openGroup =
    openGroup;

window.openChannel =
    openChannel;

window.sendTextMessage =
    sendTextMessage;

window.toggleVoiceRecording =
    toggleVoiceRecording;

window.sendFile =
    sendFile;

window.openMyProfile =
    openMyProfile;

window.closeProfile =
    closeProfile;

window.GAPINO = {
    get currentUser() {
        return currentUser;
    },

    get currentChatUser() {
        return currentChatUser;
    },

    connectWebSocket,
    loadUsers,
    loadGroups,
    loadChannels,
    openChat,
    openGroup,
    openChannel,
    sendTextMessage,
    toggleVoiceRecording,
    sendFile,
    openMyProfile,
    registerPushToken,
    logout
};

document.addEventListener(
    "DOMContentLoaded",
    init
);