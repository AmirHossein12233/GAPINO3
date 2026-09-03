"use strict";

/* =========================================================
   GAPINO CHAT.JS
   - دریافت کاربران از Render
   - Session
   - WebSocket
   - پیام خصوصی
   - فایل / عکس / ویس
   - پروفایل
   - گروه و کانال
========================================================= */

const API = "https://gapino3.onrender.com";

/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentChatUser = null;

let socket = null;

let reconnectTimer = null;
let pingTimer = null;
let usersRefreshTimer = null;
let typingTimer = null;

let reconnectAttempts = 0;

let allUsers = [];

let selectedFile = null;

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];

let isRecording = false;

let selectedAvatarUrl = "";

/* =========================================================
   HELPER
========================================================= */

function $(id) {
    return document.getElementById(id);
}

function safeText(value) {
    return String(value ?? "");
}

function getCurrentUserId() {
    return String(
        currentUser?.id ||
        currentUser?.user_id ||
        ""
    );
}

function getUserId(user) {
    return String(
        user?.id ||
        user?.user_id ||
        ""
    );
}

function getUserName(user) {
    return (
        user?.display_name ||
        user?.username ||
        "کاربر"
    );
}

function isOnline(user) {
    return (
        user?.online === true ||
        user?.status === "online" ||
        user?.status === "آنلاین"
    );
}

/* =========================================================
   ELEMENTS
========================================================= */

const usersList = $("usersList");
const connectionStatus = $("connectionStatus");

const currentUserAvatar =
    $("currentUserAvatar");

const currentUserName =
    $("currentUserName");

const currentUserUsername =
    $("currentUserUsername");

const profileButton =
    $("profileButton");

const chatUserAvatar =
    $("chatUserAvatar");

const chatUserName =
    $("chatUserName");

const chatUserUsername =
    $("chatUserUsername");

const chatUserProfileButton =
    $("chatUserProfileButton");

const backToUsers =
    $("backToUsers");

const messagesBox =
    $("messages");

const typingIndicator =
    $("typingIndicator");

const messageForm =
    $("messageForm");

const messageInput =
    $("messageInput");

const sendMessageButton =
    $("sendMessageButton");

const attachmentButton =
    $("attachmentButton");

const fileInput =
    $("fileInput");

const voiceButton =
    $("gapinoVoiceButton");

const voiceStatus =
    $("gapinoVoiceStatus");

const toast =
    $("gapinoToast");

const messageNotification =
    $("messageNotification");

const profileModal =
    $("profileModal");

const profileForm =
    $("profileForm");

const profileAvatarFile =
    $("profileAvatarFile");

const chooseAvatarButton =
    $("chooseAvatarButton");

const removeAvatarButton =
    $("removeAvatarButton");

const profileAvatarPreview =
    $("profileLargeAvatar");

const displayNameInput =
    $("displayNameInput");

const bioInput =
    $("bioInput");

const profileMessage =
    $("profileMessage");

const groupModal =
    $("groupModal");

const channelModal =
    $("channelModal");

const createGroupButton =
    $("createGroupButton");

const createChannelButton =
    $("createChannelButton");

const closeProfileButton =
    $("closeProfileButton");

const closeGroupButton =
    $("closeGroupButton");

const closeChannelButton =
    $("closeChannelButton");

const groupForm =
    $("groupForm");

const channelForm =
    $("channelForm");

const filePreviewModal =
    $("filePreviewModal");

const filePreview =
    $("filePreview");

const fileName =
    $("fileName");

const fileSize =
    $("fileSize");

const sendFileButton =
    $("sendFile");

const cancelFileButton =
    $("cancelFile");

const logoutButton =
    $("logoutButton");

const usersTabButton =
    $("usersTabButton");

const groupsTabButton =
    $("groupsTabButton");

const channelsTabButton =
    $("channelsTabButton");

const usersSection =
    $("usersSection");

const groupsSection =
    $("groupsSection");

const channelsSection =
    $("channelsSection");

const groupsList =
    $("groupsList");

const channelsList =
    $("channelsList");

/* =========================================================
   CHAT INPUT
========================================================= */

function setChatInputEnabled(enabled) {

    const active = Boolean(enabled);

    if (messageInput) {
        messageInput.disabled = !active;

        messageInput.placeholder =
            active
                ? "پیامت را بنویس..."
                : "یک کاربر را انتخاب کنید...";
    }

    if (sendMessageButton) {
        sendMessageButton.disabled = !active;
    }

    if (attachmentButton) {
        attachmentButton.disabled = !active;
    }

    if (voiceButton) {
        voiceButton.disabled = !active;
    }
}

/* =========================================================
   MODALS
========================================================= */

function openModal(modal) {

    if (!modal) {
        return;
    }

    modal.hidden = false;
    modal.classList.remove("hidden");
    modal.style.display = "flex";
}

function closeModal(modal) {

    if (!modal) {
        return;
    }

    modal.hidden = true;
    modal.classList.add("hidden");
    modal.style.display = "none";
}

function closeAllModals() {

    document
        .querySelectorAll(".modal")
        .forEach((modal) => {
            closeModal(modal);
        });
}

/* =========================================================
   TOAST
========================================================= */

function showToast(
    text,
    timeout = 2500
) {

    if (!toast) {
        console.log("GAPINO:", text);
        return;
    }

    toast.textContent =
        safeText(text);

    toast.style.display =
        "block";

    clearTimeout(showToast.timer);

    showToast.timer =
        setTimeout(() => {
            toast.style.display =
                "none";
        }, timeout);
}

/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnectionStatus(text) {

    if (!connectionStatus) {
        return;
    }

    const value =
        safeText(text);

    connectionStatus.textContent =
        value;

    if (value.includes("متصل")) {
        connectionStatus.style.color =
            "#16a34a";
    } else if (value.includes("خطا")) {
        connectionStatus.style.color =
            "#dc2626";
    } else {
        connectionStatus.style.color =
            "";
    }
}

/* =========================================================
   AVATAR
========================================================= */

function getAvatarLetter(user) {

    const name =
        getUserName(user).trim();

    return (
        name.charAt(0) ||
        "👤"
    );
}

function renderAvatar(
    element,
    user
) {

    if (!element) {
        return;
    }

    element.innerHTML = "";

    const avatar =
        safeText(user?.avatar).trim();

    if (avatar) {

        const img =
            document.createElement("img");

        img.src = avatar;
        img.alt = "آواتار";
        img.loading = "lazy";

        img.onerror = () => {
            element.innerHTML = "";
            element.textContent =
                getAvatarLetter(user);
        };

        element.appendChild(img);
        return;
    }

    element.textContent =
        getAvatarLetter(user);
}

function updateCurrentUserUI() {

    if (!currentUser) {
        return;
    }

    if (currentUserName) {
        currentUserName.textContent =
            getUserName(currentUser);
    }

    if (currentUserUsername) {
        currentUserUsername.textContent =
            currentUser.username
                ? "@" + currentUser.username
                : "کاربر";
    }

    renderAvatar(
        currentUserAvatar,
        currentUser
    );
}

/* =========================================================
   API FETCH
========================================================= */

async function apiFetch(
    path,
    options = {}
) {

    const response =
        await fetch(
            API + path,
            {
                ...options,
                credentials: "include",
                cache: "no-store"
            }
        );

    let data = null;

    try {
        data = await response.json();
    } catch (_) {
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

/* =========================================================
   CURRENT USER
========================================================= */

async function loadCurrentUser() {

    try {

        const data =
            await apiFetch("/me");

        if (
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

            updateCurrentUserUI();

            return currentUser;
        }

    } catch (error) {

        console.error(
            "Session error:",
            error
        );
    }

    /* استفاده از کاربر ذخیره‌شده */
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

                updateCurrentUserUI();

                return currentUser;
            }
        }

    } catch (error) {

        console.error(
            "Local user error:",
            error
        );
    }

    return null;
}

/* =========================================================
   USERS
   کاربران از /users گرفته می‌شوند
========================================================= */

async function loadUsers() {

    if (!usersList) {
        return;
    }

    try {

        usersList.innerHTML = `
            <div class="loading-users">
                در حال دریافت کاربران...
            </div>
        `;

        const data =
            await apiFetch("/users");

        if (Array.isArray(data)) {

            allUsers =
                data;

        } else if (
            Array.isArray(data?.users)
        ) {

            allUsers =
                data.users;

        } else {

            allUsers = [];
        }

        console.log(
            "GAPINO users:",
            allUsers
        );

        renderUsers();

    } catch (error) {

        console.error(
            "Users error:",
            error
        );

        usersList.innerHTML = `
            <div class="loading-users">
                دریافت کاربران انجام نشد.
                <br>
                ${safeText(error.message)}
            </div>
        `;
    }
}

/* =========================================================
   RENDER USERS
========================================================= */

function renderUsers() {

    if (!usersList) {
        return;
    }

    usersList.innerHTML = "";

    const myId =
        getCurrentUserId();

    const visibleUsers =
        allUsers.filter((user) => {

            if (!user) {
                return false;
            }

            return (
                getUserId(user) !==
                myId
            );
        });

    if (!visibleUsers.length) {

        usersList.innerHTML = `
            <div class="loading-users">
                کاربر دیگری پیدا نشد.
            </div>
        `;

        return;
    }

    visibleUsers.forEach((user) => {

        const item =
            document.createElement("div");

        item.className =
            "user-item";

        if (
            currentChatUser &&
            getUserId(
                currentChatUser
            ) === getUserId(user)
        ) {

            item.classList.add("active");
        }

        const avatar =
            document.createElement("div");

        avatar.className =
            "avatar";

        renderAvatar(
            avatar,
            user
        );

        const info =
            document.createElement("div");

        info.className =
            "user-info";

        const row =
            document.createElement("div");

        row.className =
            "username-row";

        const name =
            document.createElement("div");

        name.className =
            "username";

        name.textContent =
            getUserName(user);

        const dot =
            document.createElement("span");

        dot.className =
            isOnline(user)
                ? "online-dot"
                : "offline-dot";

        row.appendChild(name);
        row.appendChild(dot);

        const status =
            document.createElement("div");

        status.className =
            "status-text";

        status.textContent =
            user.username
                ? `@${user.username} • ${
                    isOnline(user)
                        ? "آنلاین"
                        : "آفلاین"
                }`
                : (
                    isOnline(user)
                        ? "آنلاین"
                        : "آفلاین"
                );

        info.appendChild(row);
        info.appendChild(status);

        item.appendChild(avatar);
        item.appendChild(info);

        item.addEventListener(
            "click",
            () => {
                openChat(user);
            }
        );

        usersList.appendChild(item);
    });
}

/* =========================================================
   OPEN CHAT
========================================================= */

async function openChat(user) {

    if (!user) {
        return;
    }

    currentChatUser =
        user;

    updateChatHeader(user);

    renderUsers();

    /* همین خط باعث فعال شدن نوشتن می‌شود */
    setChatInputEnabled(true);

    document
        .querySelector(".app")
        ?.classList.add("show-chat");

    clearMessages();

    await loadConversation(
        getUserId(user)
    );

    await markConversationRead(
        getUserId(user)
    );

    if (messageInput) {
        messageInput.focus();
    }
}

/* =========================================================
   CHAT HEADER
========================================================= */

function updateChatHeader(user) {

    if (!user) {
        return;
    }

    if (chatUserName) {

        chatUserName.textContent =
            getUserName(user);
    }

    if (chatUserUsername) {

        chatUserUsername.textContent =
            user.username
                ? `@${user.username} • ${
                    isOnline(user)
                        ? "آنلاین"
                        : "آفلاین"
                }`
                : (
                    isOnline(user)
                        ? "آنلاین"
                        : "آفلاین"
                );
    }

    renderAvatar(
        chatUserAvatar,
        user
    );
}

/* =========================================================
   LOAD MESSAGES
========================================================= */

async function loadConversation(
    otherUserId
) {

    if (
        !currentUser ||
        !otherUserId
    ) {
        return;
    }

    try {

        const data =
            await apiFetch(
                `/messages/${encodeURIComponent(
                    getCurrentUserId()
                )}/${encodeURIComponent(
                    otherUserId
                )}`
            );

        const messages =
            Array.isArray(data)
                ? data
                : (
                    Array.isArray(
                        data?.messages
                    )
                        ? data.messages
                        : []
                );

        renderMessages(messages);

    } catch (error) {

        console.error(
            "Conversation error:",
            error
        );

        showToast(
            "دریافت پیام‌ها انجام نشد."
        );
    }
}

/* =========================================================
   MESSAGES
========================================================= */

function clearMessages() {

    if (!messagesBox) {
        return;
    }

    messagesBox.innerHTML = `
        <div class="empty-chat">
            <div class="empty-chat-icon">
                💬
            </div>

            <h2>
                گفتگو
            </h2>

            <p>
                پیام‌ها اینجا نمایش داده می‌شوند.
            </p>
        </div>
    `;
}

function removeEmptyMessage() {

    const empty =
        messagesBox?.querySelector(
            ".empty-chat"
        );

    if (empty) {
        empty.remove();
    }
}

function renderMessages(messages) {

    if (!messagesBox) {
        return;
    }

    messagesBox.innerHTML = "";

    if (
        !Array.isArray(messages) ||
        !messages.length
    ) {

        clearMessages();
        return;
    }

    messages.forEach(
        (message) => {
            appendMessage(
                message,
                false
            );
        }
    );

    scrollToBottom();
}

function appendMessage(
    message,
    scroll = true
) {

    if (
        !messagesBox ||
        !message
    ) {
        return;
    }

    removeEmptyMessage();

    const mine =
        String(
            message.sender_id || ""
        ) ===
        getCurrentUserId();

    const row =
        document.createElement("div");

    row.className =
        mine
            ? "message-row mine"
            : "message-row theirs";

    const bubble =
        document.createElement("div");

    bubble.className =
        "message-bubble";

    if (message.file) {

        renderFileObject(
            bubble,
            message.file
        );

    } else {

        const text =
            document.createElement(
                "div"
            );

        text.textContent =
            safeText(
                message.text
            );

        bubble.appendChild(
            text
        );
    }

    const time =
        document.createElement("span");

    time.className =
        "message-time";

    time.textContent =
        formatTime(
            message.created_at
        );

    bubble.appendChild(time);

    row.appendChild(bubble);

    messagesBox.appendChild(row);

    if (scroll) {
        scrollToBottom();
    }
}

/* =========================================================
   FILE RENDER
========================================================= */

function renderFileObject(
    container,
    file
) {

    const url =
        safeText(
            file?.url ||
            file?.file_url ||
            ""
        );

    const name =
        safeText(
            file?.name ||
            file?.file_name ||
            "فایل"
        );

    const size =
        Number(
            file?.size ||
            file?.file_size ||
            0
        );

    const isAudio =
        Boolean(
            file?.is_audio ||
            /\.(webm|ogg|mp3|wav|m4a)$/i.test(
                url
            )
        );

    const isImage =
        Boolean(
            file?.is_image ||
            /\.(jpg|jpeg|png|gif|webp)$/i.test(
                url
            )
        );

    if (isAudio) {

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "voice-message";

        const audio =
            document.createElement("audio");

        audio.controls = true;
        audio.preload = "metadata";
        audio.src = url;

        const label =
            document.createElement("span");

        label.className =
            "voice-name";

        label.textContent =
            name || "ویس";

        wrapper.appendChild(audio);
        wrapper.appendChild(label);

        container.appendChild(wrapper);

        return;
    }

    if (isImage) {

        const img =
            document.createElement("img");

        img.className =
            "chat-image";

        img.src = url;
        img.alt = name || "تصویر";
        img.loading = "lazy";

        container.appendChild(img);

        return;
    }

    const link =
        document.createElement("a");

    link.className =
        "chat-file";

    link.href = url;
    link.target = "_blank";
    link.rel =
        "noopener noreferrer";

    const icon =
        document.createElement("span");

    icon.textContent = "📎";

    const info =
        document.createElement("span");

    info.className =
        "chat-file-info";

    const strong =
        document.createElement("strong");

    strong.textContent =
        name;

    const small =
        document.createElement("small");

    small.textContent =
        formatFileSize(size);

    info.appendChild(strong);
    info.appendChild(small);

    link.appendChild(icon);
    link.appendChild(info);

    container.appendChild(link);
}

/* =========================================================
   SEND MESSAGE
========================================================= */

async function sendTextMessage() {

    if (!currentChatUser) {

        showToast(
            "ابتدا یک کاربر را انتخاب کن."
        );

        return;
    }

    const text =
        safeText(
            messageInput?.value
        ).trim();

    if (!text) {
        return;
    }

    if (!sendSocket({
        type: "message",
        receiver_id:
            getUserId(
                currentChatUser
            ),
        text: text
    })) {
        return;
    }

    if (messageInput) {

        messageInput.value = "";

        resizeMessageInput();
    }

    stopTyping();
}

/* =========================================================
   TYPING
========================================================= */

function sendTyping() {

    if (!currentChatUser) {
        return;
    }

    sendSocket({
        type: "typing",
        receiver_id:
            getUserId(
                currentChatUser
            )
    });

    clearTimeout(
        typingTimer
    );

    typingTimer =
        setTimeout(
            stopTyping,
            1200
        );
}

function stopTyping() {

    clearTimeout(
        typingTimer
    );

    if (!currentChatUser) {
        return;
    }

    sendSocket({
        type: "stop_typing",
        receiver_id:
            getUserId(
                currentChatUser
            )
    });
}

function showTyping() {

    if (typingIndicator) {
        typingIndicator.style.visibility =
            "visible";
    }
}

function hideTyping() {

    if (typingIndicator) {
        typingIndicator.style.visibility =
            "hidden";
    }
}

/* =========================================================
   READ
========================================================= */

async function markConversationRead(
    otherUserId
) {

    if (!otherUserId) {
        return;
    }

    sendSocket({
        type: "read",
        other_user_id:
            String(otherUserId)
    });

    try {

        await apiFetch(
            "/unread/read",
            {
                method: "POST",

                body:
                    new URLSearchParams({
                        other_user_id:
                            String(
                                otherUserId
                            )
                    })
            }
        );

    } catch (_) {}
}

/* =========================================================
   UPLOAD
========================================================= */

async function uploadFile(
    file,
    purpose = ""
) {

    if (!file) {
        return null;
    }

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    let path =
        "/upload";

    if (purpose) {

        path +=
            "?purpose=" +
            encodeURIComponent(
                purpose
            );
    }

    try {

        const result =
            await apiFetch(
                path,
                {
                    method:
                        "POST",

                    body:
                        formData
                }
            );

        if (
            !result?.success ||
            !result?.file
        ) {

            throw new Error(
                result?.message ||
                "آپلود انجام نشد."
            );
        }

        return result.file;

    } catch (error) {

        console.error(
            "Upload error:",
            error
        );

        showToast(
            error.message ||
            "آپلود فایل انجام نشد."
        );

        return null;
    }
}

/* =========================================================
   SEND FILE
========================================================= */

async function sendFile(file) {

    if (
        !file ||
        !currentChatUser
    ) {
        return;
    }

    const uploaded =
        await uploadFile(file);

    if (!uploaded) {
        return;
    }

    const sent =
        sendSocket({
            type: "file",

            receiver_id:
                getUserId(
                    currentChatUser
                ),

            file:
                uploaded
        });

    if (!sent) {
        return;
    }

    if (
        file.type.startsWith(
            "audio/"
        )
    ) {

        showToast(
            "🎙️ ویس ارسال شد."
        );

    } else if (
        file.type.startsWith(
            "image/"
        )
    ) {

        showToast(
            "🖼️ عکس ارسال شد."
        );

    } else {

        showToast(
            "📎 فایل ارسال شد."
        );
    }
}

/* =========================================================
   VOICE
========================================================= */

function getSupportedAudioType() {

    if (!window.MediaRecorder) {
        return "";
    }

    const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg"
    ];

    for (
        const type of types
    ) {

        try {

            if (
                MediaRecorder.isTypeSupported(
                    type
                )
            ) {

                return type;
            }

        } catch (_) {}
    }

    return "";
}

async function toggleVoiceRecording() {

    if (isRecording) {

        stopVoiceRecording();
        return;
    }

    if (!currentChatUser) {

        showToast(
            "ابتدا یک کاربر را انتخاب کن."
        );

        return;
    }

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        !window.MediaRecorder
    ) {

        showToast(
            "ضبط صدا در این دستگاه پشتیبانی نمی‌شود."
        );

        return;
    }

    try {

        mediaStream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        audioChunks = [];

        const mimeType =
            getSupportedAudioType();

        mediaRecorder =
            mimeType
                ? new MediaRecorder(
                    mediaStream,
                    {
                        mimeType:
                            mimeType
                    }
                )
                : new MediaRecorder(
                    mediaStream
                );

        mediaRecorder.ondataavailable =
            (event) => {

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

                    const type =
                        mediaRecorder?.mimeType ||
                        mimeType ||
                        "audio/webm";

                    const blob =
                        new Blob(
                            audioChunks,
                            {
                                type: type
                            }
                        );

                    if (
                        blob.size <= 0
                    ) {

                        cleanupVoice();

                        showToast(
                            "ویس خالی است."
                        );

                        return;
                    }

                    const extension =
                        type.includes(
                            "ogg"
                        )
                            ? "ogg"
                            : "webm";

                    const voiceFile =
                        new File(
                            [blob],
                            `voice-${Date.now()}.${extension}`,
                            {
                                type:
                                    type
                            }
                        );

                    cleanupVoice();

                    await sendFile(
                        voiceFile
                    );

                } catch (error) {

                    console.error(
                        "Voice error:",
                        error
                    );

                    cleanupVoice();

                    showToast(
                        "ارسال ویس انجام نشد."
                    );
                }
            };

        mediaRecorder.start();

        isRecording =
            true;

        updateVoiceUI();

        showToast(
            "🎙️ در حال ضبط..."
        );

    } catch (error) {

        console.error(
            "Microphone error:",
            error
        );

        cleanupVoice();

        showToast(
            "دسترسی به میکروفن داده نشد."
        );
    }
}

function stopVoiceRecording() {

    if (
        mediaRecorder &&
        mediaRecorder.state !== "inactive"
    ) {

        mediaRecorder.stop();
        return;
    }

    cleanupVoice();
}

function cleanupVoice() {

    if (mediaStream) {

        mediaStream
            .getTracks()
            .forEach(
                (track) => {
                    track.stop();
                }
            );
    }

    mediaStream = null;
    mediaRecorder = null;
    audioChunks = [];
    isRecording = false;

    updateVoiceUI();
}

function updateVoiceUI() {

    if (voiceButton) {

        voiceButton.textContent =
            isRecording
                ? "⏹️"
                : "🎙️";

        voiceButton.classList.toggle(
            "recording",
            isRecording
        );
    }

    if (voiceStatus) {

        voiceStatus.textContent =
            isRecording
                ? "در حال ضبط..."
                : "ویس";
    }
}

/* =========================================================
   PROFILE
========================================================= */

function openProfile() {

    if (!profileModal) {
        return;
    }

    if (displayNameInput) {

        displayNameInput.value =
            currentUser?.display_name ||
            currentUser?.username ||
            "";
    }

    if (bioInput) {

        bioInput.value =
            currentUser?.bio ||
            "";
    }

    selectedAvatarUrl =
        currentUser?.avatar ||
        "";

    renderAvatar(
        profileAvatarPreview,
        currentUser
    );

    openModal(
        profileModal
    );
}

if (profileButton) {

    profileButton.addEventListener(
        "click",
        openProfile
    );
}

if (closeProfileButton) {

    closeProfileButton.addEventListener(
        "click",
        () => {
            closeModal(
                profileModal
            );
        }
    );
}

/* =========================================================
   PROFILE AVATAR
========================================================= */

if (chooseAvatarButton) {

    chooseAvatarButton.addEventListener(
        "click",
        () => {
            profileAvatarFile?.click();
        }
    );
}

if (removeAvatarButton) {

    removeAvatarButton.addEventListener(
        "click",
        () => {

            selectedAvatarUrl =
                "";

            if (profileAvatarFile) {
                profileAvatarFile.value =
                    "";
            }

            renderAvatar(
                profileAvatarPreview,
                {
                    ...currentUser,
                    avatar: ""
                }
            );
        }
    );
}

if (profileAvatarFile) {

    profileAvatarFile.addEventListener(
        "change",
        async () => {

            const file =
                profileAvatarFile.files?.[0];

            if (!file) {
                return;
            }

            const previewUrl =
                URL.createObjectURL(
                    file
                );

            renderAvatar(
                profileAvatarPreview,
                {
                    ...currentUser,
                    avatar:
                        previewUrl
                }
            );

            const uploaded =
                await uploadFile(
                    file,
                    "avatar"
                );

            if (!uploaded?.url) {

                renderAvatar(
                    profileAvatarPreview,
                    currentUser
                );

                return;
            }

            selectedAvatarUrl =
                uploaded.url;

            showToast(
                "آواتار انتخاب شد."
            );
        }
    );
}

/* =========================================================
   SAVE PROFILE
========================================================= */

if (profileForm) {

    profileForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const displayName =
                safeText(
                    displayNameInput?.value
                ).trim();

            const bio =
                safeText(
                    bioInput?.value
                ).trim();

            if (!displayName) {

                showToast(
                    "نام نمایشی را وارد کن."
                );

                return;
            }

            const formData =
                new FormData();

            formData.append(
                "user_id",
                getCurrentUserId()
            );

            formData.append(
                "display_name",
                displayName
            );

            formData.append(
                "bio",
                bio
            );

            formData.append(
                "avatar",
                selectedAvatarUrl
            );

            try {

                const result =
                    await apiFetch(
                        "/profile/update",
                        {
                            method:
                                "POST",

                            body:
                                formData
                        }
                    );

                if (result?.user) {

                    currentUser =
                        result.user;

                    localStorage.setItem(
                        "gapino_user",
                        JSON.stringify(
                            currentUser
                        )
                    );

                    updateCurrentUserUI();

                    await loadUsers();

                    closeModal(
                        profileModal
                    );

                    showToast(
                        "پروفایل ذخیره شد."
                    );
                }

            } catch (error) {

                console.error(
                    "Profile error:",
                    error
                );

                if (profileMessage) {

                    profileMessage.textContent =
                        error.message ||
                        "ذخیره انجام نشد.";
                }
            }
        }
    );
}

/* =========================================================
   FILE EVENTS
========================================================= */

if (attachmentButton) {

    attachmentButton.addEventListener(
        "click",
        () => {

            if (!currentChatUser) {

                showToast(
                    "ابتدا یک کاربر را انتخاب کن."
                );

                return;
            }

            fileInput?.click();
        }
    );
}

if (fileInput) {

    fileInput.addEventListener(
        "change",
        async () => {

            const file =
                fileInput.files?.[0];

            if (!file) {
                return;
            }

            await sendFile(file);

            fileInput.value =
                "";
        }
    );
}

/* =========================================================
   MESSAGE EVENTS
========================================================= */

if (messageForm) {

    messageForm.addEventListener(
        "submit",
        (event) => {

            event.preventDefault();

            sendTextMessage();
        }
    );
}

if (messageInput) {

    messageInput.addEventListener(
        "input",
        () => {

            resizeMessageInput();

            sendTyping();
        }
    );

    messageInput.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendTextMessage();
            }
        }
    );
}

if (voiceButton) {

    voiceButton.addEventListener(
        "click",
        toggleVoiceRecording
    );
}

/* =========================================================
   SEARCH
========================================================= */

const searchInput =
    $("searchInput");

if (searchInput) {

    searchInput.addEventListener(
        "input",
        renderUsers
    );
}

/* =========================================================
   TABS
========================================================= */

function activateTab(
    button,
    section
) {

    [
        usersTabButton,
        groupsTabButton,
        channelsTabButton
    ].forEach((item) => {

        item?.classList.toggle(
            "active",
            item === button
        );
    });

    [
        usersSection,
        groupsSection,
        channelsSection
    ].forEach((item) => {

        item?.classList.toggle(
            "hidden-section",
            item !== section
        );
    });
}

if (usersTabButton) {

    usersTabButton.addEventListener(
        "click",
        () => {

            activateTab(
                usersTabButton,
                usersSection
            );

            loadUsers();
        }
    );
}

if (groupsTabButton) {

    groupsTabButton.addEventListener(
        "click",
        () => {

            activateTab(
                groupsTabButton,
                groupsSection
            );

            loadGroups();
        }
    );
}

if (channelsTabButton) {

    channelsTabButton.addEventListener(
        "click",
        () => {

            activateTab(
                channelsTabButton,
                channelsSection
            );

            loadChannels();
        }
    );
}

/* =========================================================
   GROUPS
========================================================= */

async function loadGroups() {

    if (!groupsList) {
        return;
    }

    try {

        const data =
            await apiFetch("/groups");

        const groups =
            Array.isArray(
                data?.groups
            )
                ? data.groups
                : [];

        groupsList.innerHTML = "";

        if (!groups.length) {

            groupsList.innerHTML = `
                <div class="loading-users">
                    هنوز گروهی ساخته نشده است.
                </div>
            `;

            return;
        }

        groups.forEach((group) => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "user-item";

            const avatar =
                document.createElement(
                    "div"
                );

            avatar.className =
                "avatar";

            renderAvatar(
                avatar,
                {
                    display_name:
                        group.name,

                    avatar:
                        group.avatar
                }
            );

            const info =
                document.createElement(
                    "div"
                );

            info.className =
                "user-info";

            const name =
                document.createElement(
                    "div"
                );

            name.className =
                "username";

            name.textContent =
                group.name || "گروه";

            const status =
                document.createElement(
                    "div"
                );

            status.className =
                "status-text";

            status.textContent =
                `${group.member_count || 0} عضو`;

            info.appendChild(name);
            info.appendChild(status);

            item.appendChild(avatar);
            item.appendChild(info);

            groupsList.appendChild(item);
        });

    } catch (error) {

        console.error(
            "Groups error:",
            error
        );
    }
}

/* =========================================================
   CHANNELS
========================================================= */

async function loadChannels() {

    if (!channelsList) {
        return;
    }

    try {

        const data =
            await apiFetch("/channels");

        const channels =
            Array.isArray(
                data?.channels
            )
                ? data.channels
                : [];

        channelsList.innerHTML = "";

        if (!channels.length) {

            channelsList.innerHTML = `
                <div class="loading-users">
                    هنوز کانالی ساخته نشده است.
                </div>
            `;

            return;
        }

        channels.forEach((channel) => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "user-item";

            const avatar =
                document.createElement(
                    "div"
                );

            avatar.className =
                "avatar";

            renderAvatar(
                avatar,
                {
                    display_name:
                        channel.name,

                    avatar:
                        channel.avatar
                }
            );

            const info =
                document.createElement(
                    "div"
                );

            info.className =
                "user-info";

            const name =
                document.createElement(
                    "div"
                );

            name.className =
                "username";

            name.textContent =
                channel.name ||
                "کانال";

            const status =
                document.createElement(
                    "div"
                );

            status.className =
                "status-text";

            status.textContent =
                `${channel.member_count || 0} عضو`;

            info.appendChild(name);
            info.appendChild(status);

            item.appendChild(avatar);
            item.appendChild(info);

            channelsList.appendChild(item);
        });

    } catch (error) {

        console.error(
            "Channels error:",
            error
        );
    }
}

/* =========================================================
   WEBSOCKET
========================================================= */

function getWebSocketUrl() {

    return (
        "wss://gapino3.onrender.com/ws/" +
        encodeURIComponent(
            getCurrentUserId()
        )
    );
}

function connectWebSocket() {

    if (!getCurrentUserId()) {
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

    const url =
        getWebSocketUrl();

    console.log(
        "GAPINO WebSocket:",
        url
    );

    setConnectionStatus(
        "در حال اتصال..."
    );

    try {

        socket =
            new WebSocket(url);

    } catch (error) {

        console.error(
            "WebSocket error:",
            error
        );

        scheduleReconnect();

        return;
    }

    socket.onopen =
        () => {

            reconnectAttempts = 0;

            setConnectionStatus(
                "🟢 متصل"
            );

            startPing();

            if (currentChatUser) {
                setChatInputEnabled(
                    true
                );
            }
        };

    socket.onmessage =
        (event) => {

            handleSocketMessage(
                event.data
            );
        };

    socket.onerror =
        (event) => {

            console.error(
                "WebSocket error:",
                event
            );

            setConnectionStatus(
                "خطا در اتصال"
            );
        };

    socket.onclose =
        (event) => {

            console.warn(
                "WebSocket closed:",
                event.code,
                event.reason
            );

            stopPing();

            setConnectionStatus(
                "در حال اتصال..."
            );

            scheduleReconnect();
        };
}

function sendSocket(data) {

    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {

        setConnectionStatus(
            "خطا در اتصال"
        );

        return false;
    }

    try {

        socket.send(
            JSON.stringify(data)
        );

        return true;

    } catch (error) {

        console.error(
            "Socket send error:",
            error
        );

        return false;
    }
}

function scheduleReconnect() {

    clearTimeout(
        reconnectTimer
    );

    reconnectAttempts =
        Math.min(
            reconnectAttempts + 1,
            10
        );

    const delay =
        Math.min(
            1000 *
            Math.pow(
                1.5,
                reconnectAttempts - 1
            ),
            10000
        );

    reconnectTimer =
        setTimeout(
            connectWebSocket,
            delay
        );
}

function startPing() {

    stopPing();

    pingTimer =
        setInterval(
            () => {

                sendSocket({
                    type: "ping"
                });

            },
            25000
        );
}

function stopPing() {

    if (pingTimer) {

        clearInterval(
            pingTimer
        );

        pingTimer = null;
    }
}

/* =========================================================
   SOCKET MESSAGE
========================================================= */

function handleSocketMessage(raw) {

    let data;

    try {

        data =
            JSON.parse(raw);

    } catch (_) {

        return;
    }

    if (!data) {
        return;
    }

    if (data.type === "connected") {

        setConnectionStatus(
            "🟢 متصل"
        );

        return;
    }

    if (data.type === "pong") {

        setConnectionStatus(
            "🟢 متصل"
        );

        return;
    }

    if (
        data.type ===
        "online_users"
    ) {

        updatePresence(data);
        return;
    }

    if (
        data.type ===
        "typing"
    ) {

        if (
            currentChatUser &&
            getUserId(
                currentChatUser
            ) ===
            String(
                data.sender_id
            )
        ) {

            showTyping();
        }

        return;
    }

    if (
        data.type ===
        "stop_typing"
    ) {

        hideTyping();
        return;
    }

    if (
        data.type ===
        "message"
    ) {

        receiveMessage(
            data.message
        );

        return;
    }

    if (
        data.type ===
        "file"
    ) {

        receiveMessage(
            data.message
        );

        return;
    }

    if (
        data.type ===
        "profile_updated"
    ) {

        handleProfileUpdated(
            data.user
        );

        return;
    }
}

/* =========================================================
   RECEIVE
========================================================= */

function receiveMessage(
    message
) {

    if (!message) {
        return;
    }

    const sender =
        String(
            message.sender_id ||
            ""
        );

    const receiver =
        String(
            message.receiver_id ||
            ""
        );

    const me =
        getCurrentUserId();

    const selected =
        currentChatUser
            ? getUserId(
                currentChatUser
            )
            : "";

    const belongs =
        (
            sender === me &&
            receiver === selected
        ) ||
        (
            receiver === me &&
            sender === selected
        );

    if (belongs) {

        appendMessage(
            message,
            true
        );

        markConversationRead(
            selected
        );

    } else if (
        sender !== me
    ) {

        showNotification(
            "پیام جدید"
        );
    }
}

/* =========================================================
   PRESENCE
========================================================= */

function updatePresence(data) {

    const onlineIds =
        Array.isArray(
            data?.users
        )
            ? data.users.map(
                String
            )
            : [];

    allUsers =
        allUsers.map((user) => {

            const online =
                onlineIds.includes(
                    getUserId(user)
                );

            return {
                ...user,

                online:
                    online,

                status:
                    online
                        ? "آنلاین"
                        : "آفلاین"
            };
        });

    renderUsers();

    if (currentChatUser) {

        const updated =
            allUsers.find(
                (user) =>
                    getUserId(user) ===
                    getUserId(
                        currentChatUser
                    )
            );

        if (updated) {

            currentChatUser =
                updated;

            updateChatHeader(
                updated
            );
        }
    }
}

/* =========================================================
   PROFILE UPDATED
========================================================= */

function handleProfileUpdated(
    user
) {

    if (!user) {
        return;
    }

    const id =
        getUserId(user);

    allUsers =
        allUsers.map((item) => {

            return getUserId(item) === id
                ? {
                    ...item,
                    ...user
                }
                : item;
        });

    if (
        id ===
        getCurrentUserId()
    ) {

        currentUser = {
            ...currentUser,
            ...user
        };

        localStorage.setItem(
            "gapino_user",
            JSON.stringify(
                currentUser
            )
        );

        updateCurrentUserUI();
    }

    renderUsers();
}

/* =========================================================
   RESIZE
========================================================= */

function resizeMessageInput() {

    if (!messageInput) {
        return;
    }

    messageInput.style.height =
        "auto";

    messageInput.style.height =
        Math.min(
            messageInput.scrollHeight,
            140
        ) +
        "px";
}

/* =========================================================
   FORMAT
========================================================= */

function formatFileSize(bytes) {

    const size =
        Number(bytes || 0);

    if (size <= 0) {
        return "";
    }

    if (size < 1024) {
        return (
            size.toLocaleString(
                "fa-IR"
            ) +
            " بایت"
        );
    }

    if (
        size <
        1024 * 1024
    ) {

        return (
            (
                size / 1024
            ).toFixed(1) +
            " KB"
        );
    }

    return (
        (
            size /
            1024 /
            1024
        ).toFixed(1) +
        " MB"
    );
}

function formatTime(value) {

    if (!value) {
        return "";
    }

    const text =
        safeText(value);

    if (
        /^\d{2}:\d{2}$/.test(
            text
        )
    ) {
        return text;
    }

    return text.length >= 16
        ? text.substring(
            11,
            16
        )
        : text;
}

function scrollToBottom() {

    requestAnimationFrame(
        () => {

            if (messagesBox) {

                messagesBox.scrollTop =
                    messagesBox.scrollHeight;
            }
        }
    );
}

/* =========================================================
   REFRESH USERS
========================================================= */

function startUsersRefresh() {

    clearInterval(
        usersRefreshTimer
    );

    usersRefreshTimer =
        setInterval(
            () => {

                if (currentUser) {

                    loadUsers();
                }

            },
            15000
        );
}

/* =========================================================
   LOGOUT
========================================================= */

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async () => {

            try {

                await apiFetch(
                    "/logout",
                    {
                        method:
                            "POST"
                    }
                );

            } catch (_) {}

            stopPing();

            clearTimeout(
                reconnectTimer
            );

            clearInterval(
                usersRefreshTimer
            );

            if (socket) {

                try {
                    socket.close();
                } catch (_) {}
            }

            socket = null;

            localStorage.removeItem(
                "gapino_user"
            );

            window.location.replace(
                API + "/login.html"
            );
        }
    );
}

/* =========================================================
   MOBILE BACK
========================================================= */

if (backToUsers) {

    backToUsers.addEventListener(
        "click",
        () => {

            document
                .querySelector(".app")
                ?.classList.remove(
                    "show-chat"
                );
        }
    );
}

/* =========================================================
   INIT
========================================================= */

async function initGapino() {

    console.log(
        "GAPINO starting..."
    );

    closeAllModals();

    hideTyping();

    setChatInputEnabled(
        false
    );

    currentUser =
        await loadCurrentUser();

    if (!currentUser) {

        console.error(
            "GAPINO: user session not found."
        );

        return;
    }

    console.log(
        "GAPINO current user:",
        currentUser
    );

    updateCurrentUserUI();

    /*
       این همان قسمت مهم است:
       کاربران از backend گرفته می‌شوند.
    */

    await loadUsers();

    startUsersRefresh();

    connectWebSocket();
}

/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initGapino
    );

} else {

    initGapino();
}

/* =========================================================
   GLOBAL
========================================================= */

window.GAPINO = {

    get currentUser() {
        return currentUser;
    },

    get currentChatUser() {
        return currentChatUser;
    },

    loadUsers,
    openChat,
    sendTextMessage,
    toggleVoiceRecording,
    connectWebSocket
};