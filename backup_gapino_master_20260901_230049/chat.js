"use strict";

const API = "https://gapino3.onrender.com";
const WS_API = "wss://gapino3.onrender.com";

let currentUser = null;
let currentChatUser = null;
let currentGroup = null;
let currentChannel = null;
let currentMode = "users";
let socket = null;
let reconnectTimer = null;
let pingTimer = null;
let usersRefreshTimer = null;
let typingTimer = null;
let reconnectAttempts = 0;
let allUsers = [];
let allGroups = [];
let allChannels = [];
let selectedFile = null;
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let isRecording = false;
let selectedAvatarUrl = "";

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
user?.full_name ||
user?.name ||
user?.username ||
"کاربر"
);
}

function isOnline(user) {
return Boolean(
user?.online === true ||
user?.status === "online" ||
user?.status === "آنلاین"
);
}

const usersList = $("usersList");
const groupsList = $("groupsList");
const channelsList = $("channelsList");
const searchInput = $("searchInput");
const connectionStatus = $("connectionStatus");
const currentUserAvatar = $("currentUserAvatar");
const currentUserName = $("currentUserName");
const currentUserUsername = $("currentUserUsername");
const profileButton = $("profileButton");
const chatUserAvatar = $("chatUserAvatar");
const chatUserName = $("chatUserName");
const chatUserUsername = $("chatUserUsername");
const chatUserProfileButton = $("chatUserProfileButton");
const backToUsers = $("backToUsers");
const messagesBox = $("messages");
const typingIndicator = $("typingIndicator");
const uploadStatus = $("uploadStatus");
const messageForm = $("messageForm");
const messageInput = $("messageInput");
const sendMessageButton = $("sendMessageButton");
const attachmentButton = $("attachmentButton");
const fileInput = $("fileInput");
const voiceButton = $("gapinoVoiceButton");
const voiceStatus = $("gapinoVoiceStatus");
const toast = $("gapinoToast");
const messageNotification = $("messageNotification");
const profileModal = $("profileModal");
const profileForm = $("profileForm");
const profileAvatarFile = $("profileAvatarFile");
const chooseAvatarButton = $("chooseAvatarButton");
const removeAvatarButton = $("removeAvatarButton");
const profileAvatarPreview = $("profileLargeAvatar");
const displayNameInput = $("displayNameInput");
const bioInput = $("bioInput");
const profileMessage = $("profileMessage");
const groupModal = $("groupModal");
const channelModal = $("channelModal");
const createGroupButton = $("createGroupButton");
const createChannelButton = $("createChannelButton");
const closeProfileButton = $("closeProfileButton");
const closeGroupButton = $("closeGroupButton");
const closeChannelButton = $("closeChannelButton");
const groupForm = $("groupForm");
const channelForm = $("channelForm");
const usersTabButton = $("usersTabButton");
const groupsTabButton = $("groupsTabButton");
const channelsTabButton = $("channelsTabButton");
const filePreviewModal = $("filePreviewModal");
const filePreview = $("filePreview");
const fileName = $("fileName");
const fileSize = $("fileSize");
const sendFileButton = $("sendFile");
const cancelFileButton = $("cancelFile");
const logoutButton = $("logoutButton");

function showToast(text, timeout = 2500) {
if (!toast) {
console.log("GAPINO:", text);
return;
}
toast.textContent = safeText(text);
toast.style.display = "block";
clearTimeout(showToast.timer);
showToast.timer = setTimeout(() => {
    toast.style.display = "none";
}, timeout);
}

function showNotification(text) {
if (!messageNotification) {
showToast(text);
return;
}
messageNotification.textContent = safeText(text);
messageNotification.style.display = "block";
clearTimeout(showNotification.timer);
showNotification.timer = setTimeout(() => {
    messageNotification.style.display = "none";
}, 2500);
}

function setConnectionStatus(text) {
if (!connectionStatus) return;
const value = safeText(text);
connectionStatus.textContent = value;
if (value.includes("متصل")) {
    connectionStatus.style.color = "#16a34a";
} else if (value.includes("خطا")) {
    connectionStatus.style.color = "#dc2626";
} else {
    connectionStatus.style.color = "";
}
}

function openModal(modal) {
if (!modal) return;
modal.hidden = false;
modal.classList.remove("hidden");
modal.style.display = "flex";
}

function closeModal(modal) {
if (!modal) return;
modal.hidden = true;
modal.classList.add("hidden");
modal.style.display = "none";
}

function closeAllModals() {
document
.querySelectorAll(".modal")
.forEach(closeModal);
}

function getAvatarLetter(user) {
return (
getUserName(user)
.trim()
.charAt(0) ||
"👤"
);
}

function renderAvatar(element, user) {
if (!element) return;
element.innerHTML = "";
const avatar =
    safeText(user?.avatar).trim();
if (!avatar) {
    element.textContent =
        getAvatarLetter(user);
    return;
}
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
}

function updateCurrentUserUI() {
if (!currentUser) return;
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
    sendMessageButton.disabled =
        !active;
}
if (attachmentButton) {
    attachmentButton.disabled =
        !active;
}
if (voiceButton) {
    voiceButton.disabled =
        !active;
}
}

async function apiFetch(path, options = {}) {
const response =
await fetch(
API + path,
Object.assign(
{
credentials: "include",
cache: "no-store"
},
options
)
);
let data = null;
try {
    data =
        await response.json();
} catch (_) {
    data = null;
}
if (!response.ok) {
    throw new Error(
        data?.message ||
        "HTTP " + response.status
    );
}
return data;
}

async function loadCurrentUser() {
let savedUser = null;
try {
    const saved =
        localStorage.getItem(
            "gapino_user"
        );
    if (saved) {
        savedUser =
            JSON.parse(saved);
    }
} catch (error) {
    console.warn(
        "Saved user parse error:",
        error
    );
}
if (
    savedUser &&
    (
        savedUser.id ||
        savedUser.user_id
    )
) {
    currentUser =
        savedUser;
    updateCurrentUserUI();
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
        }
    } catch (error) {
        console.warn(
            "Session refresh failed:",
            error
        );
    }
    return currentUser;
}
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
    console.warn(
        "Session error:",
        error
    );
}
currentUser = null;
localStorage.removeItem(
    "gapino_user"
);
window.location.replace(
    "login.html"
);
return null;
}

async function loadUsers() {
try {
const data =
await apiFetch("/users");
    allUsers =
        Array.isArray(data)
            ? data
            : (
                Array.isArray(
                    data?.users
                )
                    ? data.users
                    : []
            );
    renderUsers();
} catch (error) {
    console.error(
        "Users error:",
        error
    );
    if (usersList) {
        usersList.innerHTML =
            '<div class="loading-users">دریافت کاربران انجام نشد.</div>';
    }
}
}

function renderUsers() {
if (!usersList) return;
const query =
    safeText(
        searchInput?.value
    )
        .trim()
        .toLowerCase();
usersList.innerHTML = "";
const filtered =
    allUsers.filter(
        user => {
            if (
                !user ||
                getUserId(user) ===
                    getCurrentUserId()
            ) {
                return false;
            }
            if (!query) {
                return true;
            }
            return (
                getUserName(user)
                    .toLowerCase()
                    .includes(query) ||
                safeText(
                    user.username
                )
                    .toLowerCase()
                    .includes(query)
            );
        }
    );
if (!filtered.length) {
    usersList.innerHTML =
        '<div class="loading-users">کاربری پیدا نشد.</div>';
    return;
}
filtered.forEach(user => {
    const item =
        document.createElement(
            "div"
        );
    item.className =
        "user-item";
    if (
        currentChatUser &&
        getUserId(currentChatUser) ===
            getUserId(user)
    ) {
        item.classList.add(
            "active"
        );
    }
    const avatar =
        document.createElement(
            "div"
        );
    avatar.className =
        "avatar";
    renderAvatar(
        avatar,
        user
    );
    const info =
        document.createElement(
            "div"
        );
    info.className =
        "user-info";
    const row =
        document.createElement(
            "div"
        );
    row.className =
        "username-row";
    const name =
        document.createElement(
            "div"
        );
    name.className =
        "username";
    name.textContent =
        getUserName(user);
    const dot =
        document.createElement(
            "span"
        );
    dot.className =
        isOnline(user)
            ? "online-dot"
            : "offline-dot";
    row.appendChild(name);
    row.appendChild(dot);
    const status =
        document.createElement(
            "div"
        );
    status.className =
        "status-text";
    status.textContent =
        user.username
            ? "@" +
              user.username +
              " • " +
              (
                  isOnline(user)
                      ? "آنلاین"
                      : "آفلاین"
              )
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
        () =>
            openChat(user)
    );
    usersList.appendChild(item);
});
}

function updateChatHeader(user) {
if (!user) return;
if (chatUserName) {
    chatUserName.textContent =
        getUserName(user);
}
if (chatUserUsername) {
    chatUserUsername.textContent =
        user.username
            ? "@" +
              user.username +
              " • " +
              (
                  isOnline(user)
                      ? "آنلاین"
                      : "آفلاین"
              )
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

function clearMessages() {
if (!messagesBox) return;
messagesBox.innerHTML =
    '<div class="empty-chat"><div class="empty-chat-icon">💬</div><h2>گفتگو</h2><p>پیام‌ها اینجا نمایش داده می‌شوند.</p></div>';
}

async function openChat(user) {
if (!user) return;
currentMode = "users";
currentGroup = null;
currentChannel = null;
currentChatUser = user;
updateChatHeader(user);
renderUsers();
setChatInputEnabled(true);
document
    .querySelector(".app")
    ?.classList.add(
        "show-chat"
    );
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

async function loadConversation(notherUserId
) {
if (
!getCurrentUserId() ||
!otherUserId
) {
return;
}
try {
    const data =
        await apiFetch(
            "/messages/" +
            encodeURIComponent(
                getCurrentUserId()
            ) +
            "/" +
            encodeURIComponent(
                otherUserId
            )
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

function renderMessages(messages) {
if (!messagesBox) return;
messagesBox.innerHTML = "";
if (
    !Array.isArray(messages) ||
    !messages.length
) {
    clearMessages();
    return;
}
messages.forEach(
    message =>
        appendMessage(
            message,
            false
        )
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
        message.sender_id ||
        ""
    ) ===
    getCurrentUserId();
const row =
    document.createElement(
        "div"
    );
row.className =
    mine
        ? "message-row mine"
        : "message-row theirs";
if (message.id) {
    row.dataset.messageId =
        message.id;
}
const bubble =
    document.createElement(
        "div"
    );
bubble.className =
    "message-bubble";
renderMessageContent(
    bubble,
    message
);
const time =
    document.createElement(
        "span"
    );
time.className =
    "message-time";
time.textContent =
    formatTime(
        message.created_at ||
        message.time
    );
bubble.appendChild(time);
row.appendChild(bubble);
messagesBox.appendChild(
    row
);
if (scroll) {
    scrollToBottom();
}
}

function removeEmptyMessage() {
messagesBox
?.querySelector(
".empty-chat"
)
?.remove();
}

function renderMessageContent(
container,
message
) {
if (message.file) {
renderFileObject(
container,
message.file
);
    return;
}
if (message.file_url) {
    renderFileObject(
        container,
        {
            url:
                message.file_url,
            name:
                message.file_name ||
                "فایل",
            size:
                message.file_size,
            is_image:
                safeText(
                    message.file_type
                ).startsWith(
                    "image/"
                ),
            is_audio:
                safeText(
                    message.file_type
                ).startsWith(
                    "audio/"
                )
        }
    );
    return;
}
const text =
    document.createElement(
        "div"
    );
text.textContent =
    safeText(
        message.text
    );
container.appendChild(
    text
);
}

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
if (!url) {
    const text =
        document.createElement(
            "div"
        );
    text.textContent =
        name;
    container.appendChild(
        text
    );
    return;
}
const fullUrl =
    url.startsWith("http")
        ? url
        : API + url;
if (isAudio) {
    const wrapper =
        document.createElement(
            "div"
        );
    wrapper.className =
        "voice-message";
    const audio =
        document.createElement(
            "audio"
        );
    audio.controls =
        true;
    audio.preload =
        "metadata";
    audio.src =
        fullUrl;
    const label =
        document.createElement(
            "span"
        );
    label.className =
        "voice-name";
    label.textContent =
        name ||
        "ویس";
    wrapper.appendChild(
        audio
    );
    wrapper.appendChild(
        label
    );
    container.appendChild(
        wrapper
    );
    return;
}
if (isImage) {
    const img =
        document.createElement(
            "img"
        );
    img.className =
        "chat-image";
    img.src =
        fullUrl;
    img.alt =
        name ||
        "تصویر";
    img.loading =
        "lazy";
    img.addEventListener(
        "click",
        () =>
            window.open(
                fullUrl,
                "_blank",
                "noopener,noreferrer"
            )
    );
    container.appendChild(
        img
    );
    return;
}
const link =
    document.createElement(
        "a"
    );
link.className =
    "chat-file";
link.href =
    fullUrl;
link.target =
    "_blank";
link.rel =
    "noopener noreferrer";
const icon =
    document.createElement(
        "span"
    );
icon.className =
    "chat-file-icon";
icon.textContent =
    "📎";
const info =
    document.createElement(
        "span"
    );
info.className =
    "chat-file-info";
const strong =
    document.createElement(
        "strong"
    );
strong.textContent =
    name;
const small =
    document.createElement(
        "small"
    );
small.textContent =
    formatFileSize(
        size
    );
info.appendChild(
    strong
);
info.appendChild(
    small
);
link.appendChild(
    icon
);
link.appendChild(
    info
);
container.appendChild(
    link
);
}

function formatFileSize(bytes) {
const size =
Number(
bytes ||
0
);
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
            size /
            1024
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
const date =
    new Date(value);
if (
    Number.isNaN(
        date.getTime()
    )
) {
    return text.length >= 16
        ? text.substring(
            11,
            16
        )
        : text;
}
return date.toLocaleTimeString(
    "fa-IR",
    {
        hour: "2-digit",
        minute: "2-digit"
    }
);
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

function sendTextMessage() {
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
if (text.length > 5000) {
    showToast(
        "پیام نباید بیشتر از ۵۰۰۰ کاراکتر باشد."
    );
    return;
}
if (
    !sendSocket(
        {
            type:
                "message",
            receiver_id:
                getUserId(
                    currentChatUser
                ),
            text
        }
    )
) {
    showToast(
        "اتصال چت برقرار نیست."
    );
    return;
}
if (messageInput) {
    messageInput.value =
        "";
    resizeMessageInput();
}
stopTyping();
}

function sendTyping() {
if (!currentChatUser) {
return;
}
sendSocket(
    {
        type:
            "typing",
        receiver_id:
            getUserId(
                currentChatUser
            )
    }
);
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
sendSocket(
    {
        type:
            "stop_typing",
        receiver_id:
            getUserId(
                currentChatUser
            )
    }
);
}

function showTyping() {
if (!typingIndicator) {
return;
}
typingIndicator.textContent =
    "در حال نوشتن...";
typingIndicator.style.visibility =
    "visible";
}

function hideTyping() {
if (!typingIndicator) {
return;
}
typingIndicator.textContent =
    "";
typingIndicator.style.visibility =
    "hidden";
}

async function markConversationRead(notherUserId
) {
if (!otherUserId) {
return;
}
sendSocket(
    {
        type:
            "read",
        other_user_id:
            String(
                otherUserId
            )
    }
);
try {
    await apiFetch(
        "/unread/read",
        {
            method:
                "POST",
            body:
                new URLSearchParams(
                    {
                        other_user_id:
                            String(
                                otherUserId
                            )
                    }
                )
        }
    );
} catch (_) {}
}

async function refreshUserUnreadState() {
try {
await apiFetch(
"/unread"
);
} catch (_) {}
}

async function uploadFile(
file,
purpose = ""
) {
if (!file) {
return null;
}
const limit =
    purpose === "avatar"
        ? 5 * 1024 * 1024
        : 10 * 1024 * 1024;
if (file.size > limit) {
    showToast(
        purpose === "avatar"
            ? "حجم آواتار نباید بیشتر از ۵ مگابایت باشد."
            : "حجم فایل نباید بیشتر از ۱۰ مگابایت باشد."
    );
    return null;
}
if (uploadStatus) {
    uploadStatus.textContent =
        "در حال آپلود...";
}
const form =
    new FormData();
form.append(
    "file",
    file
);
let url =
    "/upload";
if (purpose) {
    url +=
        "?purpose=" +
        encodeURIComponent(
            purpose
        );
}
try {
    const data =
        await apiFetch(
            url,
            {
                method:
                    "POST",
                body:
                    form
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
    if (uploadStatus) {
        uploadStatus.textContent =
            "";
    }
    return data.file;
} catch (error) {
    if (uploadStatus) {
        uploadStatus.textContent =
            "";
    }
    console.error(
        "Upload error:",
        error
    );
    showToast(
        error.message ||
        "آپلود انجام نشد."
    );
    return null;
}
}

async function sendFile(file) {
if (
!file ||
!currentChatUser
) {
return;
}
const uploaded =
    await uploadFile(
        file
    );
if (!uploaded) {
    return;
}
const sent =
    sendSocket(
        {
            type:
                "file",
            receiver_id:
                getUserId(
                    currentChatUser
                ),
            file:
                uploaded
        }
    );
if (!sent) {
    showToast(
        "اتصال چت برقرار نیست."
    );
    return;
}
if (
    file.type?.startsWith(
        "audio/"
    )
) {
    showToast(
        "🎙️ ویس ارسال شد."
    );
} else if (
    file.type?.startsWith(
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

function openFilePreview(file) {
if (!file) {
return;
}
selectedFile =
    file;
if (filePreview) {
    filePreview.innerHTML =
        "";
}
if (
    file.type?.startsWith(
        "image/"
    )
) {
    const img =
        document.createElement(
            "img"
        );
    img.src =
        URL.createObjectURL(
            file
        );
    img.alt =
        file.name;
    img.style.maxWidth =
        "100%";
    img.style.maxHeight =
        "320px";
    img.style.borderRadius =
        "14px";
    filePreview?.appendChild(
        img
    );
} else if (
    file.type?.startsWith(
        "audio/"
    )
) {
    const audio =
        document.createElement(
            "audio"
        );
    audio.controls =
        true;
    audio.style.width =
        "100%";
    audio.src =
        URL.createObjectURL(
            file
        );
    filePreview?.appendChild(
        audio
    );
} else {
    const icon =
        document.createElement(
            "div"
        );
    icon.textContent =
        "📎";
    icon.style.fontSize =
        "60px";
    icon.style.textAlign =
        "center";
    filePreview?.appendChild(
        icon
    );
}
if (fileName) {
    fileName.textContent =
        file.name;
}
if (fileSize) {
    fileSize.textContent =
        formatFileSize(
            file.size
        );
}
openModal(
    filePreviewModal
);
}

function closeFilePreview() {
selectedFile = null;
closeModal(
    filePreviewModal
);
if (filePreview) {
    filePreview.innerHTML =
        "";
}
if (fileName) {
    fileName.textContent =
        "";
}
if (fileSize) {
    fileSize.textContent =
        "";
}
if (fileInput) {
    fileInput.value =
        "";
}
}

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
    !navigator.mediaDevices?.getUserMedia ||
    !window.MediaRecorder
) {
    showToast(
        "مرورگر از ضبط صدا پشتیبانی نمی‌ند."
    );
    return;
}
try {
    mediaStream =
        await navigator.mediaDevices.getUserMedia(
            {
                audio:
                    true
            }
        );
    audioChunks = [];
    const mimeType =
        getSupportedAudioType();
    mediaRecorder =
        mimeType
            ? new MediaRecorder(
                mediaStream,
                {
                    mimeType
                }
            )
            : new MediaRecorder(
                mediaStream
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
            const recorderMime =
                mediaRecorder?.mimeType ||
                mimeType ||
                "audio/webm";
            const blob =
                new Blob(
                    audioChunks,
                    {
                        type:
                            recorderMime
                    }
                );
            if (!blob.size) {
                cleanupVoice();
                showToast(
                    "صدای ضبط‌شده خالی است."
                );
                return;
            }
            const extension =
                recorderMime.includes(
                    "ogg"
                )
                    ? "ogg"
                    : "webm";
            const file =
                new File(
                    [blob],
                    "voice-" +
                        Date.now() +
                        "." +
                        extension,
                    {
                        type:
                            recorderMime
                    }
                );
            cleanupVoice();
            await sendFile(
                file
            );
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
mediaRecorder.state !==
"inactive"
) {
mediaRecorder.stop();
} else {
cleanupVoice();
}
}

function cleanupVoice() {
if (mediaStream) {
mediaStream
.getTracks()
.forEach(
track =>
track.stop()
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

function getWebSocketUrl() {
return (
WS_API +
"/ws/" +
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
setConnectionStatus(
    "در حال اتصال..."
);
const url =
    getWebSocketUrl();
try {
    socket =
        new WebSocket(
            url
        );
} catch (error) {
    console.error(
        "WebSocket create error:",
        error
    );
    scheduleReconnect();
    return;
}
socket.onopen =
    () => {
        reconnectAttempts =
            0;
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
    event =>
        handleSocketMessage(
            event.data
        );
socket.onerror =
    error => {
        console.error(
            "WebSocket error:",
            error
        );
        setConnectionStatus(
            "خطا در اتصال"
        );
    };
socket.onclose =
    event => {
        console.warn(
            "WebSocket closed:",
            event.code,
            event.reason ||
                ""
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
"در حال اتصال..."
);
    return false;
}
try {
    socket.send(
        JSON.stringify(
            data
        )
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
        () =>
            sendSocket(
                {
                    type:
                        "ping"
                }
            ),
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

function handleSocketMessage(
raw
) {
let data;
try {
    data =
        JSON.parse(raw);
} catch (error) {
    console.error(
        "Invalid socket JSON:",
        raw
    );
    return;
}
if (!data) {
    return;
}
if (
    data.type ===
        "connected" ||
    data.type ===
        "pong"
) {
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
        "message" ||
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
if (
    data.type ===
    "group_message"
) {
    if (
        currentGroup &&
        String(
            data.message?.group_id
        ) ===
            String(
                currentGroup.id
            )
    ) {
        appendGroupMessage(
            data.message
        );
    }
    return;
}
if (
    data.type ===
    "channel_message"
) {
    if (
        currentChannel &&
        String(
            data.message?.channel_id
        ) ===
            String(
                currentChannel.id
            )
    ) {
        appendChannelMessage(
            data.message
        );
    }
    return;
}
if (
    data.type ===
    "unread_update"
) {
    refreshUserUnreadState();
}
}

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
    refreshUserUnreadState();
}
}

function updatePresence(
data
) {
const onlineIds =
Array.isArray(
data?.users
)
? data.users.map(
String
)
: [];
const statusMap =
    new Map();
if (
    Array.isArray(
        data?.statuses
    )
) {
    data.statuses.forEach(
        item =>
            statusMap.set(
                String(
                    item.id
                ),
                item
            )
    );
}
allUsers =
    allUsers.map(
        user => {
            const id =
                getUserId(
                    user
                );
            const status =
                statusMap.get(
                    id
                );
            const online =
                onlineIds.includes(
                    id
                );
            return Object.assign(
                {},
                user,
                status || {},
                {
                    online,
                    status:
                        online
                            ? "online"
                            : "offline"
                }
            );
        }
    );
renderUsers();
if (currentChatUser) {
    const updated =
        allUsers.find(
            user =>
                getUserId(
                    user
                ) ===
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

function handleProfileUpdated(
user
) {
if (!user) {
return;
}
const id =
    getUserId(
        user
    );
allUsers =
    allUsers.map(
        item =>
            getUserId(
                item
            ) === id
                ? Object.assign(
                    {},
                    item,
                    user
                )
                : item
    );
if (
    id ===
    getCurrentUserId()
) {
    currentUser =
        Object.assign(
            {},
            currentUser,
            user
        );
    localStorage.setItem(
        "gapino_user",
        JSON.stringify(
            currentUser
        )
    );
    updateCurrentUserUI();
}
if (
    currentChatUser &&
    getUserId(
        currentChatUser
    ) === id
) {
    currentChatUser =
        Object.assign(
            {},
            currentChatUser,
            user
        );
    updateChatHeader(
        currentChatUser
    );
}
renderUsers();
}

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
    ) + "px";
}

async function loadGroups() {
if (!groupsList) {
return;
}
try {
    const data =
        await apiFetch(
            "/groups"
        );
    allGroups =
        Array.isArray(
            data?.groups
        )
            ? data.groups
            : [];
    renderGroups();
} catch (error) {
    console.error(
        "Groups error:",
        error
    );
    groupsList.innerHTML =
        '<div class="loading-users">دریافت گروه‌ها انجام نشد.</div>';
}
}

function renderGroups() {
if (!groupsList) {
return;
}
groupsList.innerHTML =
    "";
if (!allGroups.length) {
    groupsList.innerHTML =
        '<div class="loading-users">هنوز گروهی ساخته نشده است.</div>';
    return;
}
allGroups.forEach(
    group => {
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
            group
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
            group.name ||
            "گروه";
        const status =
            document.createElement(
                "div"
            );
        status.className =
            "status-text";
        status.textContent =
            group.joined
                ? "👥 " +
                  (
                      group.member_count ||
                      0
                  ) +
                  " عضو • عضو هستی"
                : "👥 " +
                  (
                      group.member_count ||
                      0
                  ) +
                  " عضو";
        info.appendChild(
            name
        );
        info.appendChild(
            status
        );
        item.appendChild(
            avatar
        );
        item.appendChild(
            info
        );
        item.addEventListener(
            "click",
            () =>
                openGroup(
                    group
                )
        );
        groupsList.appendChild(
            item
        );
    }
);
}

async function openGroup(
group
) {
if (!group) {
return;
}
currentMode =
    "groups";
currentGroup =
    group;
currentChannel =
    null;
currentChatUser =
    null;
setChatInputEnabled(
    false
);
if (chatUserName) {
    chatUserName.textContent =
        group.name ||
        "گروه";
}
if (chatUserUsername) {
    chatUserUsername.textContent =
        group.joined
            ? "گروه"
            : "برای ورود عضو شوید";
}
renderAvatar(
    chatUserAvatar,
    group
);
document
    .querySelector(
        ".app"
    )
    ?.classList.add(
        "show-chat"
    );
clearMessages();
if (!group.joined) {
    showGroupJoinCard(
        group
    );
    return;
}
await loadGroupMessages(
    group.id
);
}

function showGroupJoinCard(
group
) {
if (!messagesBox) {
return;
}
messagesBox.innerHTML =
    '<div class="empty-chat">' +
    '<div class="empty-chat-icon">👥</div>' +
    '<h2>' +
    escapeHtml(
        group.name ||
        "گروه"
    ) +
    "</h2>" +
    "<p>" +
    escapeHtml(
        group.description ||
        "برای مشاهده پیام‌ها وارد گروه شوید."
    ) +
    "</p>" +
    '<button type="button" id="joinGroupNow" class="main-button" style="margin-top:12px;max-width:260px;">عضویت در گروه</button>' +
    "</div>";
$("joinGroupNow")
    ?.addEventListener(
        "click",
        () =>
            joinGroup(
                group.id
            )
    );
}

async function joinGroup(
groupId
) {
try {
await apiFetch(
"/groups/" +
encodeURIComponent(
groupId
) +
"/join",
{
method:
"POST"
}
);
    await loadGroups();
    const group =
        allGroups.find(
            item =>
                String(
                    item.id
                ) ===
                String(
                    groupId
                )
        );
    if (group) {
        await openGroup(
            group
        );
    }
    showToast(
        "عضو گروه شدی."
    );
} catch (error) {
    showToast(
        error.message ||
        "عضویت در گروه انجام نشد."
    );
}
}

async function loadGroupMessages(
groupId
) {
try {
const data =
await apiFetch(
"/groups/" +
encodeURIComponent(
groupId
) +
"/messages"
);
    messagesBox.innerHTML =
        "";
    const messages =
        Array.isArray(
            data?.messages
        )
            ? data.messages
            : [];
    if (!messages.length) {
        clearMessages();
        return;
    }
    messages.forEach(
        appendGroupMessage
    );
    scrollToBottom();
} catch (error) {
    showToast(
        error.message ||
        "دریافت پیام‌های گروه انجام نشد."
    );
}
}

function appendGroupMessage(
message
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
        message.sender_id ||
        ""
    ) ===
    getCurrentUserId();
const row =
    document.createElement(
        "div"
    );
row.className =
    mine
        ? "message-row mine"
        : "message-row theirs";
const bubble =
    document.createElement(
        "div"
    );
bubble.className =
    "message-bubble";
if (
    !mine &&
    message.sender_name
) {
    const sender =
        document.createElement(
            "strong"
        );
    sender.textContent =
        message.sender_name;
    sender.style.display =
        "block";
    sender.style.marginBottom =
        "4px";
    bubble.appendChild(
        sender
    );
}
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
const time =
    document.createElement(
        "span"
    );
time.className =
    "message-time";
time.textContent =
    formatTime(
        message.created_at
    );
bubble.appendChild(
    time
);
row.appendChild(
    bubble
);
messagesBox.appendChild(
    row
);
}

async function loadChannels() {
if (!channelsList) {
return;
}
try {
    const data =
        await apiFetch(
            "/channels"
        );
    allChannels =
        Array.isArray(
            data?.channels
        )
            ? data.channels
            : [];
    renderChannels();
} catch (error) {
    console.error(
        "Channels error:",
        error
    );
    channelsList.innerHTML =
        '<div class="loading-users">دریافت کانال‌ها انجام نشد.</div>';
}
}

function renderChannels() {
if (!channelsList) {
return;
}
channelsList.innerHTML =
    "";
if (!allChannels.length) {
    channelsList.innerHTML =
        '<div class="loading-users">هنوز کانالی ساخته نشده است.</div>';
    return;
}
allChannels.forEach(
    channel => {
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
            channel
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
            channel.joined
                ? "📢 " +
                  (
                      channel.member_count ||
                      0
                  ) +
                  " عضو • عضو هستی"
                : "📢 " +
                  (
                      channel.member_count ||
                      0
                  ) +
                  " عضو";
        info.appendChild(
            name
        );
        info.appendChild(
            status
        );
        item.appendChild(
            avatar
        );
        item.appendChild(
            info
        );
        item.addEventListener(
            "click",
            () =>
                openChannel(
                    channel
                )
        );
        channelsList.appendChild(
            item
        );
    }
);
}

async function openChannel(
channel
) {
if (!channel) {
return;
}
currentMode =
    "channels";
currentChannel =
    channel;
currentGroup =
    null;
currentChatUser =
    null;
setChatInputEnabled(
    false
);
if (chatUserName) {
    chatUserName.textContent =
        channel.name ||
        "کانال";
}
if (chatUserUsername) {
    chatUserUsername.textContent =
        channel.joined
            ? "کانال"
            : "برای مشاهده پیام‌ها عضو شوید";
}
renderAvatar(
    chatUserAvatar,
    channel
);
document
    .querySelector(
        ".app"
    )
    ?.classList.add(
        "show-chat"
    );
clearMessages();
if (!channel.joined) {
    showChannelJoinCard(
        channel
    );
    return;
}
await loadChannelMessages(
    channel.id
);
}

function showChannelJoinCard(
channel
) {
if (!messagesBox) {
return;
}
messagesBox.innerHTML =
    '<div class="empty-chat">' +
    '<div class="empty-chat-icon">📢</div>' +
    '<h2>' +
    escapeHtml(
        channel.name ||
        "کانال"
    ) +
    "</h2>" +
    "<p>" +
    escapeHtml(
        channel.description ||
        "برای مشاهده پیام‌ها عضو کانال شوید."
    ) +
    "</p>" +
    '<button type="button" id="joinChannelNow" class="main-button" style="margin-top:12px;max-width:260px;">عضویت در کانال</button>' +
    "</div>";
$("joinChannelNow")
    ?.addEventListener(
        "click",
        () =>
            joinChannel(
                channel.id
            )
    );
}

async function joinChannel(
channelId
) {
try {
await apiFetch(
"/channels/" +
encodeURIComponent(
channelId
) +
"/join",
{
method:
"POST"
}
);
    await loadChannels();
    const channel =
        allChannels.find(
            item =>
                String(
                    item.id
                ) ===
                String(
                    channelId
                )
        );
    if (channel) {
        await openChannel(
            channel
        );
    }
    showToast(
        "عضو کانال شدی."
    );
} catch (error) {
    showToast(
        error.message ||
        "عضویت در کانال انجام نشد."
    );
}
}

async function loadChannelMessages(
channelId
) {
try {
const data =
await apiFetch(
"/channels/" +
encodeURIComponent(
channelId
) +
"/messages"
);
    messagesBox.innerHTML =
        "";
    const messages =
        Array.isArray(
            data?.messages
        )
            ? data.messages
            : [];
    if (!messages.length) {
        clearMessages();
        return;
    }
    messages.forEach(
        appendChannelMessage
    );
    scrollToBottom();
} catch (error) {
    showToast(
        error.message ||
        "دریافت پیام‌های کانال انجام نشد."
    );
}
}

function appendChannelMessage(
message
) {
if (
!messagesBox ||
!message
) {
return;
}
removeEmptyMessage();
const row =
    document.createElement(
        "div"
    );
row.className =
    "message-row theirs";
const bubble =
    document.createElement(
        "div"
    );
bubble.className =
    "message-bubble";
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
const time =
    document.createElement(
        "span"
    );
time.className =
    "message-time";
time.textContent =
    formatTime(
        message.created_at
    );
bubble.appendChild(
    time
);
row.appendChild(
    bubble
);
messagesBox.appendChild(
    row
);
}

function switchMode(mode) {
currentMode =
mode;
$("usersSection")
    ?.classList.toggle(
        "hidden-section",
        mode !== "users"
    );
$("groupsSection")
    ?.classList.toggle(
        "hidden-section",
        mode !== "groups"
    );
$("channelsSection")
    ?.classList.toggle(
        "hidden-section",
        mode !== "channels"
    );
usersTabButton
    ?.classList.toggle(
        "active",
        mode === "users"
    );
groupsTabButton
    ?.classList.toggle(
        "active",
        mode === "groups"
    );
channelsTabButton
    ?.classList.toggle(
        "active",
        mode === "channels"
    );
if (mode === "users") {
    loadUsers();
}
if (mode === "groups") {
    loadGroups();
}
if (mode === "channels") {
    loadChannels();
}
}

function escapeHtml(value) {
const div =
document.createElement(
"div"
);
div.textContent =
    safeText(value);
return div.innerHTML;
}

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
if ($("avatarInput")) {
    $("avatarInput").value =
        currentUser?.avatar ||
        "";
}
selectedAvatarUrl =
    currentUser?.avatar ||
    "";
renderAvatar(
    profileAvatarPreview,
    currentUser
);
if (profileMessage) {
    profileMessage.textContent =
        "";
}
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
() =>
closeModal(
profileModal
)
);
}

if (chooseAvatarButton) {
chooseAvatarButton.addEventListener(
"click",
() =>
profileAvatarFile?.click()
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
        if ($("avatarInput")) {
            $("avatarInput").value =
                "";
        }
        renderAvatar(
            profileAvatarPreview,
            Object.assign(
                {},
                currentUser,
                {
                    avatar:
                        ""
                }
            )
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
        if (
            !file.type.startsWith(
                "image/"
            )
        ) {
            showToast(
                "لطفاً یک تصویر انتخاب کن."
            );
            profileAvatarFile.value =
                "";
            return;
        }
        if (
            file.size >
            5 * 1024 * 1024
        ) {
            showToast(
                "حجم آواتار نباید بیشتر از ۵ مگابایت باشد."
            );
            profileAvatarFile.value =
                "";
            return;
        }
        renderAvatar(
            profileAvatarPreview,
            Object.assign(
                {},
                currentUser,
                {
                    avatar:
                        URL.createObjectURL(
                            file
                        )
                }
            )
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
        if ($("avatarInput")) {
            $("avatarInput").value =
                selectedAvatarUrl;
        }
        showToast(
            "آواتار انتخاب شد."
        );
    }
);
}

if (profileForm) {
profileForm.addEventListener(
"submit",
async event => {
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
            if (profileMessage) {
                profileMessage.textContent =
                    "نام نمایشی را وارد کن.";
            }
            return;
        }
        const data =
            new FormData();
        data.append(
            "user_id",
            getCurrentUserId()
        );
        data.append(
            "display_name",
            displayName
        );
        data.append(
            "bio",
            bio
        );
        data.append(
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
                            data
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
                    "پروفایل با موفقیت ذخیره شد."
                );
            }
        } catch (error) {
            if (profileMessage) {
                profileMessage.textContent =
                    error.message ||
                    "ذخیره پروفایل انجام نشد.";
            }
        }
    }
);
}

if (createGroupButton) {
createGroupButton.addEventListener(
"click",
() =>
openModal(
groupModal
)
);
}

if (createChannelButton) {
createChannelButton.addEventListener(
"click",
() =>
openModal(
channelModal
)
);
}

if (closeGroupButton) {
closeGroupButton.addEventListener(
"click",
() =>
closeModal(
groupModal
)
);
}

if (closeChannelButton) {
closeChannelButton.addEventListener(
"click",
() =>
closeModal(
channelModal
)
);
}

if (groupForm) {
groupForm.addEventListener(
"submit",
async event => {
event.preventDefault();
        const message =
            $("groupFormMessage");
        const data =
            new FormData(
                groupForm
            );
        try {
            await apiFetch(
                "/groups",
                {
                    method:
                        "POST",
                    body:
                        data
                }
            );
            groupForm.reset();
            closeModal(
                groupModal
            );
            await loadGroups();
            showToast(
                "گروه ساخته شد."
            );
        } catch (error) {
            if (message) {
                message.textContent =
                    error.message ||
                    "ساخت گروه انجام نشد.";
            }
        }
    }
);
}

if (channelForm) {
channelForm.addEventListener(
"submit",
async event => {
event.preventDefault();
        const message =
            $("channelFormMessage");
        const data =
            new FormData(
                channelForm
            );
        try {
            await apiFetch(
                "/channels",
                {
                    method:
                        "POST",
                    body:
                        data
                }
            );
            channelForm.reset();
            closeModal(
                channelModal
            );
            await loadChannels();
            showToast(
                "کانال ساخته شد."
            );
        } catch (error) {
            if (message) {
                message.textContent =
                    error.message ||
                    "ساخت کانال انجام نشد.";
            }
        }
    }
);
}

if (usersTabButton) {
usersTabButton.addEventListener(
"click",
() =>
switchMode(
"users"
)
);
}

if (groupsTabButton) {
groupsTabButton.addEventListener(
"click",
() =>
switchMode(
"groups"
)
);
}

if (channelsTabButton) {
channelsTabButton.addEventListener(
"click",
() =>
switchMode(
"channels"
)
);
}

if (searchInput) {
searchInput.addEventListener(
"input",
renderUsers
);
}

if (messageForm) {
messageForm.addEventListener(
"submit",
event => {
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
    event => {
        if (
            event.key ===
                "Enter" &&
            !event.shiftKey
        ) {
            event.preventDefault();
            sendTextMessage();
        }
    }
);
}

if (attachmentButton) {
attachmentButton.addEventListener(
"click",
() =>
fileInput?.click()
);
}

if (fileInput) {
fileInput.addEventListener(
"change",
() => {
const file =
fileInput.files?.[0];
        if (file) {
            openFilePreview(
                file
            );
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

if (sendFileButton) {
sendFileButton.addEventListener(
"click",
async () => {
if (!selectedFile) {
return;
}
        const file =
            selectedFile;
        closeFilePreview();
        await sendFile(
            file
        );
    }
);
}

if (cancelFileButton) {
cancelFileButton.addEventListener(
"click",
closeFilePreview
);
}

if (chatUserProfileButton) {
chatUserProfileButton.addEventListener(
"click",
() => {
if (!currentChatUser) {
return;
}
        const modal =
            $("otherUserProfileModal");
        if (!modal) {
            return;
        }
        renderAvatar(
            $("otherUserAvatar"),
            currentChatUser
        );
        if ($("otherUserName")) {
            $("otherUserName").textContent =
                getUserName(
                    currentChatUser
                );
        }
        if (
            $("otherUserUsername")
        ) {
            $("otherUserUsername").textContent =
                currentChatUser.username
                    ? "@" +
                      currentChatUser.username
                    : "-";
        }
        if (
            $("otherUserStatus")
        ) {
            $("otherUserStatus").textContent =
                isOnline(
                    currentChatUser
                )
                    ? "آنلاین"
                    : "آفلاین";
        }
        if ($("otherUserId")) {
            $("otherUserId").textContent =
                getUserId(
                    currentChatUser
                );
        }
        openModal(
            modal
        );
    }
);
}

if (backToUsers) {
backToUsers.addEventListener(
"click",
() =>
document
.querySelector(
".app"
)
?.classList.remove(
"show-chat"
)
);
}

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
        localStorage.removeItem(
            "gapino_user"
        );
        window.location.replace(
            "login.html"
        );
    }
);
}

document.addEventListener(
    "click",
    event => {
        const target =
            event.target;
        if (
            target?.classList?.contains(
                "modal"
            )
        ) {
            closeModal(
                target
            );
        }
    }
);

window.addEventListener(
    "beforeunload",
    () => {
        clearTimeout(
            reconnectTimer
        );
        stopPing();
        clearInterval(
            usersRefreshTimer
        );
        clearTimeout(
            typingTimer
        );
        if (mediaStream) {
            mediaStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );
        }
    }
);

document.addEventListener(
    "visibilitychange",
    () => {
        if (
            document.visibilityState !==
                "visible" ||
            !currentUser
        ) {
            return;
        }
        loadUsers();
        if (
            !socket ||
            socket.readyState !==
                WebSocket.OPEN
        ) {
            connectWebSocket();
        } else {
            sendSocket(
                {
                    type:
                        "ping"
                }
            );
        }
    }
);

async function initGapino() {
    closeAllModals();
    hideTyping();
    resizeMessageInput();
    setChatInputEnabled(
        false
    );
    currentUser =
        await loadCurrentUser();
    if (!currentUser) {
        return;
    }
    updateCurrentUserUI();
    await Promise.all(
        [
            loadUsers(),
            loadGroups(),
            loadChannels()
        ]
    );
    switchMode(
        "users"
    );
    usersRefreshTimer =
        setInterval(
            () => {
                if (!currentUser) {
                    return;
                }
                loadUsers();
                if (
                    currentMode ===
                    "groups"
                ) {
                    loadGroups();
                }
                if (
                    currentMode ===
                    "channels"
                ) {
                    loadChannels();
                }
            },
            15000
        );
    connectWebSocket();
}

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

window.GAPINO = {
    get currentUser() {
        return currentUser;
    },
    get currentChatUser() {
        return currentChatUser;
    },
    connectWebSocket:
        connectWebSocket,
    loadUsers:
        loadUsers,
    loadGroups:
        loadGroups,
    loadChannels:
        loadChannels,
    openChat:
        openChat,
    openGroup:
        openGroup,
    openChannel:
        openChannel,
    sendTextMessage:
        sendTextMessage,
    toggleVoiceRecording:
        toggleVoiceRecording,
    sendFile:
        sendFile,
    openProfile:
        openProfile
};

(() => {
    const KEY =
        "gapino_notification_settings";
    const defaults = {
        enabled: true,
        sound: true,
        vibration: true,
        browser: true
    };
    let settings = {
        ...defaults
    };
    try {
        const saved =
            localStorage.getItem(
                KEY
            );
        if (saved) {
            settings = {
                ...defaults,
                ...JSON.parse(saved)
            };
        }
    } catch (_) {}
    function save() {
        try {
            localStorage.setItem(
                KEY,
                JSON.stringify(
                    settings
                )
            );
        } catch (_) {}
    }
    function playSound() {
        if (!settings.sound) {
            return;
        }
        try {
            const Ctx =
                window.AudioContext ||
                window.webkitAudioContext;
            if (!Ctx) {
                return;
            }
            const ctx =
                new Ctx();
            const osc =
                ctx.createOscillator();
            const gain =
                ctx.createGain();
            osc.type =
                "sine";
            osc.frequency.setValueAtTime(
                880,
                ctx.currentTime
            );
            osc.frequency.exponentialRampToValueAtTime(
                660,
                ctx.currentTime +
                    0.12
            );
            gain.gain.setValueAtTime(
                0.0001,
                ctx.currentTime
            );
            gain.gain.exponentialRampToValueAtTime(
                0.08,
                ctx.currentTime +
                    0.01
            );
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                ctx.currentTime +
                    0.16
            );
            osc.connect(
                gain
            );
            gain.connect(
                ctx.destination
            );
            osc.start();
            osc.stop(
                ctx.currentTime +
                    0.17
            );
            setTimeout(
                () => {
                    try {
                        ctx.close();
                    } catch (_) {}
                },
                300
            );
        } catch (_) {}
    }
    function vibrate() {
        if (!settings.vibration) {
            return;
        }
        try {
            if (
                navigator.vibrate
            ) {
                navigator.vibrate(
                    [
                        120,
                        70,
                        120
                    ]
                );
            }
        } catch (_) {}
    }
    async function requestPermission() {
        if (
            !(
                "Notification"
                in window
            )
        ) {
            showToast(
                "این مرورگر از اعلان پشتیبانی نمی‌ند."
            );
            return;
        }
        try {
            const result =
                await Notification.requestPermission();
            if (
                result ===
                "granted"
            ) {
                settings.browser =
                    true;
                save();
                showToast(
                    "اعلان‌ای مرورگر فعال شد."
                );
            } else {
                showToast(
                    "مجوز اعلان فعال نشد."
                );
            }
        } catch (_) {
            showToast(
                "فعال‌ازی اعلان مرورگر انجام نشد."
            );
        }
        updateUI();
    }
    function browserNotify(
        text
    ) {
        if (
            !settings.browser ||
            !(
                "Notification"
                in window
            )
        ) {
            return;
        }
        if (
            Notification.permission !==
            "granted"
        ) {
            return;
        }
        try {
            const notification =
                new Notification(
                    "GAPINO",
                    {
                        body:
                            safeText(
                                text ||
                                "پیام جدید داری."
                            ),
                        icon:
                            "/favicon.ico",
                        tag:
                            "gapino-message"
                    }
                );
            notification.onclick =
                () => {
                    try {
                        window.focus();
                    } catch (_) {}
                    try {
                        notification.close();
                    } catch (_) {}
                };
        } catch (_) {}
    }
    function updateUI() {
        const enabled =
            $(
                "gapinoNotifyEnabled"
            );
        const sound =
            $(
                "gapinoNotifySound"
            );
        const vibration =
            $(
                "gapinoNotifyVibration"
            );
        const browser =
            $(
                "gapinoNotifyBrowser"
            );
        const status =
            $(
                "gapinoBrowserNotificationStatus"
            );
        const permissionButton =
            $(
                "gapinoRequestNotificationPermission"
            );
        if (enabled) {
            enabled.checked =
                !!settings.enabled;
        }
        if (sound) {
            sound.checked =
                !!settings.sound;
        }
        if (vibration) {
            vibration.checked =
                !!settings.vibration;
        }
        if (browser) {
            browser.checked =
                !!settings.browser;
        }
        if (status) {
            if (
                !(
                    "Notification"
                    in window
                )
            ) {
                status.textContent =
                    "پشتیبانی نمی‌ند";
            } else if (
                Notification.permission ===
                "granted"
            ) {
                status.textContent =
                    "فعال است ✅";
            } else if (
                Notification.permission ===
                "denied"
            ) {
                status.textContent =
                    "مسدود شده است";
            } else {
                status.textContent =
                    "مجوز داده نشده";
            }
        }
        if (permissionButton) {
            permissionButton.textContent =
                (
                    "Notification"
                        in window &&
                    Notification.permission ===
                        "granted"
                )
                    ? "✅ اعلان مرورگر فعال است"
                    : "🔐 فعال‌ازی اعلان مرورگر";
        }
    }
    function buildModal() {
        if (
            $(
                "gapinoNotificationSettingsModal"
            )
        ) {
            updateUI();
            return;
        }
        const modal =
            document.createElement(
                "div"
            );
        modal.id =
            "gapinoNotificationSettingsModal";
        modal.className =
            "modal";
        modal.style.display =
            "none";
        modal.innerHTML =
            '<div class="modal-content gapino-notification-modal">' +
            '<div class="gapino-notification-header">' +
            '<div>' +
            '<div class="gapino-notification-title">🔔 اعلان‌ا</div>' +
            '<div class="gapino-notification-subtitle">تنظیم اعلان‌ای GAPINO</div>' +
            "</div>" +
            '<button id="gapinoNotificationClose" type="button" class="modal-close" aria-label="بستن">×</button>' +
            "</div>" +
            '<div class="gapino-notification-body">' +
            '<label class="gapino-notification-row"><span><strong>🔔 اعلان پیام‌ها</strong><small>نمایش اعلان برای پیام‌های جدید</small></span><input id="gapinoNotifyEnabled" type="checkbox"></label>' +
            '<label class="gapino-notification-row"><span><strong>🔊 صدای اعلان</strong><small>پخش صدای کوتاه هنگام پیام جدید</small></span><input id="gapinoNotifySound" type="checkbox"></label>' +
            '<label class="gapino-notification-row"><span><strong>📳 لرزش</strong><small>لرزش دسگاه هنگام اعلان</small></span><input id="gapinoNotifyVibration" type="checkbox"></label>' +
            '<label class="gapino-notification-row"><span><strong>🖥️ اعلان مرورگر</strong><small id="gapinoBrowserNotificationStatus">بررسی وضعیت...</small></span><input id="gapinoNotifyBrowser" type="checkbox"></label>' +
            '<button id="gapinoRequestNotificationPermission" type="button" class="btn btn-primary gapino-notification-permission">🔐 فعال‌سازی اعلان مرورگر</button>' +
            '<div class="gapino-notification-note">تنظیمات اعلان روی همین دستگاه ذخیره می‌شود.</div>' +
            "</div>" +
            "</div>";
        document.body.appendChild(
            modal
        );
        $(
            "gapinoNotificationClose"
        )?.addEventListener(
            "click",
            () =>
                closeModal(
                    modal
                )
        );
        modal.addEventListener(
            "click",
            event => {
                if (
                    event.target ===
                    modal
                ) {
                    closeModal(
                        modal
                    );
                }
            }
        );
        $(
            "gapinoNotifyEnabled"
        )?.addEventListener(
            "change",
            event => {
                settings.enabled =
                    event.target.checked;
                save();
            }
        );
        $(
            "gapinoNotifySound"
        )?.addEventListener(
            "change",
            event => {
                settings.sound =
                    event.target.checked;
                save();
            }
        );
        $(
            "gapinoNotifyVibration"
        )?.addEventListener(
            "change",
            event => {
                settings.vibration =
                    event.target.checked;
                save();
            }
        );
        $(
            "gapinoNotifyBrowser"
        )?.addEventListener(
            "change",
            async event => {
                if (
                    event.target.checked
                ) {
                    if (
                        !(
                            "Notification"
                            in window
                        )
                    ) {
                        event.target.checked =
                            false;
                        settings.browser =
                            false;
                        save();
                        showToast(
                            "این مرورگر از اعلان پشتیبانی نمی‌کند."
                        );
                    } else if (
                        Notification.permission ===
                        "granted"
                    ) {
                        settings.browser =
                            true;
                        save();
                    } else {
                        await requestPermission();
                    }
                } else {
                    settings.browser =
                        false;
                    save();
                }
                updateUI();
            }
        );
        $(
            "gapinoRequestNotificationPermission"
        )?.addEventListener(
            "click",
            requestPermission
        );
        updateUI();
    }
    function openSettings() {
        buildModal();
        const modal =
            $(
                "gapinoNotificationSettingsModal"
            );
        if (!modal) {
            return;
        }
        modal.style.display =
            "flex";
        modal.hidden =
            false;
        modal.classList.remove(
            "hidden"
        );
        updateUI();
    }
    function addButton() {
        if (
            $(
                "gapinoNotificationSettingsButton"
            ) ||
            !profileButton
        ) {
            return;
        }
        const button =
            document.createElement(
                "button"
            );
        button.id =
            "gapinoNotificationSettingsButton";
        button.type =
            "button";
        button.className =
            "profile-button";
        button.title =
            "تنظیمات اعلان‌ها";
        button.setAttribute(
            "aria-label",
            "تنظیمات اعلان‌ها"
        );
        button.textContent =
            "🔔";
        button.addEventListener(
            "click",
            openSettings
        );
        profileButton
            .parentElement
            ?.appendChild(
                button
            );
    }
    const originalShowNotification =
        showNotification;
    showNotification =
        function(text) {
            if (
                !settings.enabled
            ) {
                return;
            }
            originalShowNotification(
                text
            );
            playSound();
            vibrate();
            browserNotify(
                text
            );
        };
    window.GAPINO_NOTIFICATION_SETTINGS =
        {
            get:
                () => ({
                    ...settings
                }),
            open:
                openSettings,
            requestPermission,
            save
        };
    function initNotifications() {
        addButton();
        buildModal();
    }
    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initNotifications,
            {
                once:
                    true
            }
        );
    } else {
        initNotifications();
    }
})();


/* =========================================================
   MESSAGE FONT SIZE
========================================================= */

const MESSAGE_FONT_MIN = 11;
const MESSAGE_FONT_MAX = 22;
const MESSAGE_FONT_STEP = 1;
const MESSAGE_FONT_STORAGE_KEY = "gapino_message_font_size";

function getSavedMessageFontSize() {
    const saved = Number(
        localStorage.getItem(MESSAGE_FONT_STORAGE_KEY)
    );

    if (!Number.isFinite(saved)) {
        return 14;
    }

    return Math.min(
        MESSAGE_FONT_MAX,
        Math.max(MESSAGE_FONT_MIN, saved)
    );
}

function applyMessageFontSize(size) {
    const safeSize = Math.min(
        MESSAGE_FONT_MAX,
        Math.max(
            MESSAGE_FONT_MIN,
            Number(size) || 14
        )
    );

    document.documentElement.style.setProperty(
        "--gapino-message-font-size",
        safeSize + "px"
    );

    const valueElement = document.getElementById(
        "messageFontSizeValue"
    );

    if (valueElement) {
        valueElement.textContent = String(safeSize);
    }

    localStorage.setItem(
        MESSAGE_FONT_STORAGE_KEY,
        String(safeSize)
    );
}

function changeMessageFontSize(amount) {
    const currentSize = getSavedMessageFontSize();

    applyMessageFontSize(
        currentSize + amount
    );
}

function initMessageFontSizeControls() {
    const decreaseButton = document.getElementById(
        "messageFontDecrease"
    );

    const increaseButton = document.getElementById(
        "messageFontIncrease"
    );

    if (decreaseButton) {
        decreaseButton.addEventListener(
            "click",
            () => changeMessageFontSize(-MESSAGE_FONT_STEP)
        );
    }

    if (increaseButton) {
        increaseButton.addEventListener(
            "click",
            () => changeMessageFontSize(MESSAGE_FONT_STEP)
        );
    }

    applyMessageFontSize(
        getSavedMessageFontSize()
    );
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initMessageFontSizeControls
    );
}
else {
    initMessageFontSizeControls();
}

// =========================================================
// GAPINO_NOTIFICATION_SETTINGS_V1
// =========================================================

(function () {
    "use strict";

    const STORAGE_KEY = "gapino_notification_settings";

    const DEFAULT_SETTINGS = {
        messages: true,
        sound: true,
        vibration: true,
        browser: false
    };

    function getSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (!raw) {
                return { ...DEFAULT_SETTINGS };
            }

            const parsed = JSON.parse(raw);

            return {
                ...DEFAULT_SETTINGS,
                ...(parsed && typeof parsed === "object" ? parsed : {})
            };
        } catch (error) {
            console.warn("GAPINO notification settings:", error);
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings(settings) {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(settings)
        );
    }

    function createNotificationButton() {
        const profileButton = document.getElementById("profileButton");

        if (!profileButton) {
            return null;
        }

        let button = document.getElementById(
            "notificationSettingsButton"
        );

        if (button) {
            return button;
        }

        button = document.createElement("button");
        button.id = "notificationSettingsButton";
        button.type = "button";
        button.title = "تنظیمات اعلان‌ها";
        button.setAttribute(
            "aria-label",
            "تنظیمات اعلان‌ها"
        );
        button.textContent = "🔔";

        profileButton.parentNode.insertBefore(
            button,
            profileButton
        );

        return button;
    }

    function createModal() {
        let modal = document.getElementById(
            "notificationSettingsModal"
        );

        if (modal) {
            return modal;
        }

        modal = document.createElement("div");
        modal.id = "notificationSettingsModal";
        modal.className = "modal notification-settings-modal";
        modal.hidden = true;
        modal.style.display = "none";

        modal.innerHTML = [
            '<div class="modal-content notification-settings-content">',
            '    <div class="modal-header">',
            '        <h2 class="modal-title">🔔 تنظیمات اعلان‌ها</h2>',
            '        <button type="button" class="modal-close notification-modal-close" aria-label="بستن">×</button>',
            '    </div>',

            '    <div class="notification-settings-description">',
            '        اعلان‌های GAPINO را طبق سلیقهٔ خودت تنظیم کن.',
            '    </div>',

            '    <div class="notification-setting-row">',
            '        <div class="notification-setting-info">',
            '            <span class="notification-setting-title">💬 اعلان پیام جدید</span>',
            '            <span class="notification-setting-description">نمایش اعلان برای پیام‌های جدید</span>',
            '        </div>',
            '        <label class="notification-switch">',
            '            <input id="notificationMessages" type="checkbox">',
            '            <span class="notification-switch-slider"></span>',
            '        </label>',
            '    </div>',

            '    <div class="notification-setting-row">',
            '        <div class="notification-setting-info">',
            '            <span class="notification-setting-title">🔊 صدای اعلان</span>',
            '            <span class="notification-setting-description">پخش صدای کوتاه هنگام پیام جدید</span>',
            '        </div>',
            '        <label class="notification-switch">',
            '            <input id="notificationSound" type="checkbox">',
            '            <span class="notification-switch-slider"></span>',
            '        </label>',
            '    </div>',

            '    <div class="notification-setting-row">',
            '        <div class="notification-setting-info">',
            '            <span class="notification-setting-title">📳 لرزش</span>',
            '            <span class="notification-setting-description">لرزش دستگاه در دستگاه‌های پشتیبانی‌شده</span>',
            '        </div>',
            '        <label class="notification-switch">',
            '            <input id="notificationVibration" type="checkbox">',
            '            <span class="notification-switch-slider"></span>',
            '        </label>',
            '    </div>',

            '    <div class="notification-setting-row">',
            '        <div class="notification-setting-info">',
            '            <span class="notification-setting-title">🖥️ اعلان مرورگر</span>',
            '            <span class="notification-setting-description">نمایش اعلان سیستم‌عامل در مرورگر</span>',
            '        </div>',
            '        <label class="notification-switch">',
            '            <input id="notificationBrowser" type="checkbox">',
            '            <span class="notification-switch-slider"></span>',
            '        </label>',
            '    </div>',

            '    <button id="requestNotificationPermission" class="notification-permission-button" type="button">',
            '        🔐 فعال‌سازی اعلان مرورگر',
            '    </button>',

            '    <div id="notificationPermissionStatus" class="notification-permission-status"></div>',

            '    <div class="modal-footer notification-settings-footer">',
            '        <button id="closeNotificationSettings" class="btn btn-primary" type="button">',
            '            انجام شد',
            '        </button>',
            '    </div>',
            '</div>'
        ].join("");

        document.body.appendChild(modal);

        return modal;
    }

    function setModalVisible(modal, visible) {
        if (!modal) {
            return;
        }

        if (visible) {
            modal.hidden = false;
            modal.classList.remove("hidden");
            modal.style.display = "flex";
        } else {
            modal.hidden = true;
            modal.classList.add("hidden");
            modal.style.display = "none";
        }
    }

    function updatePermissionStatus() {
        const status = document.getElementById(
            "notificationPermissionStatus"
        );

        if (!status) {
            return;
        }

        if (!("Notification" in window)) {
            status.textContent =
                "اعلان مرورگر در این مرورگر پشتیبانی نمی‌شود.";
            status.className =
                "notification-permission-status error";
            return;
        }

        if (Notification.permission === "granted") {
            status.textContent =
                "✅ اعلان مرورگر فعال است.";
            status.className =
                "notification-permission-status success";
            return;
        }

        if (Notification.permission === "denied") {
            status.textContent =
                "❌ دسترسی اعلان مرورگر رد شده است. می‌توانی آن را از تنظیمات مرورگر فعال کنی.";
            status.className =
                "notification-permission-status error";
            return;
        }

        status.textContent =
            "برای اعلان سیستم، دسترسی مرورگر را فعال کن.";
        status.className =
            "notification-permission-status";
    }

    function syncControls() {
        const settings = getSettings();

        const messages = document.getElementById(
            "notificationMessages"
        );

        const sound = document.getElementById(
            "notificationSound"
        );

        const vibration = document.getElementById(
            "notificationVibration"
        );

        const browser = document.getElementById(
            "notificationBrowser"
        );

        if (messages) {
            messages.checked = settings.messages === true;
        }

        if (sound) {
            sound.checked = settings.sound === true;
        }

        if (vibration) {
            vibration.checked = settings.vibration === true;
        }

        if (browser) {
            browser.checked = settings.browser === true;
        }

        updatePermissionStatus();
    }

    function updateSetting(name, value) {
        const settings = getSettings();

        settings[name] = Boolean(value);

        saveSettings(settings);

        if (
            name === "browser" &&
            settings.browser === true &&
            "Notification" in window &&
            Notification.permission !== "granted"
        ) {
            requestPermission();
        }
    }

    async function requestPermission() {
        if (!("Notification" in window)) {
            updatePermissionStatus();
            return;
        }

        try {
            const permission =
                await Notification.requestPermission();

            const settings = getSettings();

            settings.browser =
                permission === "granted";

            saveSettings(settings);

            syncControls();

            if (permission === "granted") {
                if (typeof showToast === "function") {
                    showToast("اعلان مرورگر فعال شد.");
                }
            } else if (permission === "denied") {
                if (typeof showToast === "function") {
                    showToast("دسترسی اعلان مرورگر رد شد.");
                }
            }
        } catch (error) {
            console.warn(
                "Notification permission error:",
                error
            );
        }
    }

    let audioContext = null;

    function playNotificationSound() {
        const settings = getSettings();

        if (!settings.sound) {
            return;
        }

        try {
            const AudioContext =
                window.AudioContext ||
                window.webkitAudioContext;

            if (!AudioContext) {
                return;
            }

            if (!audioContext) {
                audioContext = new AudioContext();
            }

            if (audioContext.state === "suspended") {
                audioContext.resume().catch(() => {});
            }

            const oscillator =
                audioContext.createOscillator();

            const gain =
                audioContext.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = 880;

            gain.gain.setValueAtTime(
                0.0001,
                audioContext.currentTime
            );

            gain.gain.exponentialRampToValueAtTime(
                0.12,
                audioContext.currentTime + 0.01
            );

            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                audioContext.currentTime + 0.18
            );

            oscillator.connect(gain);
            gain.connect(audioContext.destination);

            oscillator.start();

            oscillator.stop(
                audioContext.currentTime + 0.2
            );
        } catch (error) {
            console.warn(
                "Notification sound error:",
                error
            );
        }
    }

    function vibrateNotification() {
        const settings = getSettings();

        if (!settings.vibration) {
            return;
        }

        if (
            "vibrate" in navigator &&
            typeof navigator.vibrate === "function"
        ) {
            try {
                navigator.vibrate([80, 50, 80]);
            } catch (_) {}
        }
    }

    function showBrowserNotification(text) {
        const settings = getSettings();

        if (!settings.browser) {
            return;
        }

        if (!("Notification" in window)) {
            return;
        }

        if (Notification.permission !== "granted") {
            return;
        }

        if (!document.hidden) {
            return;
        }

        try {
            const notification =
                new Notification(
                    "GAPINO",
                    {
                        body: String(text || "پیام جدید"),
                        tag: "gapino-message"
                    }
                );

            notification.onclick = function () {
                window.focus();
                notification.close();
            };
        } catch (error) {
            console.warn(
                "Browser notification error:",
                error
            );
        }
    }

    function emitNotificationEffects(text) {
        const settings = getSettings();

        if (!settings.messages) {
            return;
        }

        playNotificationSound();
        vibrateNotification();
        showBrowserNotification(text);
    }

    function installShowNotificationHook() {
        if (
            typeof showNotification !== "function" ||
            showNotification.__gapinoWrapped
        ) {
            return;
        }

        const originalShowNotification =
            showNotification;

        const wrappedShowNotification =
            function (text) {
                emitNotificationEffects(text);

                return originalShowNotification(
                    text
                );
            };

        wrappedShowNotification.__gapinoWrapped = true;

        showNotification =
            wrappedShowNotification;
    }

    function init() {
        const button =
            createNotificationButton();

        const modal =
            createModal();

        if (!button || !modal) {
            return;
        }

        button.addEventListener(
            "click",
            function () {
                syncControls();
                setModalVisible(modal, true);
            }
        );

        const closeButton =
            modal.querySelector(
                ".notification-modal-close"
            );

        const doneButton =
            document.getElementById(
                "closeNotificationSettings"
            );

        if (closeButton) {
            closeButton.addEventListener(
                "click",
                function () {
                    setModalVisible(
                        modal,
                        false
                    );
                }
            );
        }

        if (doneButton) {
            doneButton.addEventListener(
                "click",
                function () {
                    setModalVisible(
                        modal,
                        false
                    );
                }
            );
        }

        modal.addEventListener(
            "click",
            function (event) {
                if (event.target === modal) {
                    setModalVisible(
                        modal,
                        false
                    );
                }
            }
        );

        const messages =
            document.getElementById(
                "notificationMessages"
            );

        const sound =
            document.getElementById(
                "notificationSound"
            );

        const vibration =
            document.getElementById(
                "notificationVibration"
            );

        const browser =
            document.getElementById(
                "notificationBrowser"
            );

        if (messages) {
            messages.addEventListener(
                "change",
                function () {
                    updateSetting(
                        "messages",
                        messages.checked
                    );
                }
            );
        }

        if (sound) {
            sound.addEventListener(
                "change",
                function () {
                    updateSetting(
                        "sound",
                        sound.checked
                    );
                }
            );
        }

        if (vibration) {
            vibration.addEventListener(
                "change",
                function () {
                    updateSetting(
                        "vibration",
                        vibration.checked
                    );
                }
            );
        }

        if (browser) {
            browser.addEventListener(
                "change",
                function () {
                    updateSetting(
                        "browser",
                        browser.checked
                    );
                }
            );
        }

        const permissionButton =
            document.getElementById(
                "requestNotificationPermission"
            );

        if (permissionButton) {
            permissionButton.addEventListener(
                "click",
                requestPermission
            );
        }

        syncControls();
        installShowNotificationHook();

        window.GAPINO_NOTIFICATION_SETTINGS = {
            getSettings,
            saveSettings,
            requestPermission,
            playNotificationSound,
            vibrateNotification,
            showBrowserNotification
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
    } else {
        init();
    }
})();

// =========================================================
// GAPINO_MAIN_SETTINGS_V1
// =========================================================

(function () {
    "use strict";

    const THEME_KEY = "gapino_theme";

    function createSettingsButton() {
        const profileButton =
            document.getElementById("profileButton");

        if (!profileButton) {
            return null;
        }

        let button =
            document.getElementById(
                "mainSettingsButton"
            );

        if (button) {
            return button;
        }

        button = document.createElement("button");

        button.id =
            "mainSettingsButton";

        button.type = "button";

        button.title =
            "تنظیمات GAPINO";

        button.setAttribute(
            "aria-label",
            "تنظیمات GAPINO"
        );

        button.textContent = "⚙️";

        profileButton.parentNode.insertBefore(
            button,
            profileButton
        );

        return button;
    }

    function createSettingsModal() {
        let modal =
            document.getElementById(
                "mainSettingsModal"
            );

        if (modal) {
            return modal;
        }

        modal = document.createElement("div");

        modal.id =
            "mainSettingsModal";

        modal.className =
            "modal main-settings-modal";

        modal.hidden = true;

        modal.style.display = "none";

        modal.innerHTML = [
            '<div class="modal-content main-settings-content">',

            '    <div class="modal-header">',
            '        <h2 class="modal-title">⚙️ تنظیمات GAPINO</h2>',
            '        <button type="button" class="modal-close main-settings-close" aria-label="بستن">×</button>',
            '    </div>',

            '    <div class="main-settings-list">',

            '        <button type="button" class="main-settings-item" data-setting-action="profile">',
            '            <span class="main-settings-icon">👤</span>',
            '            <span class="main-settings-item-text">',
            '                <strong>حساب کاربری</strong>',
            '                <small>مشاهده و ویرایش پروفایل</small>',
            '            </span>',
            '            <span class="main-settings-arrow">‹</span>',
            '        </button>',

            '        <button type="button" class="main-settings-item" data-setting-action="notifications">',
            '            <span class="main-settings-icon">🔔</span>',
            '            <span class="main-settings-item-text">',
            '                <strong>تنظیمات اعلان‌ها</strong>',
            '                <small>اعلان، صدا، لرزش و مرورگر</small>',
            '            </span>',
            '            <span class="main-settings-arrow">‹</span>',
            '        </button>',

            '        <button type="button" class="main-settings-item" data-setting-action="theme">',
            '            <span class="main-settings-icon">🎨</span>',
            '            <span class="main-settings-item-text">',
            '                <strong>ظاهر برنامه</strong>',
            '                <small id="mainSettingsThemeText">حالت روشن</small>',
            '            </span>',
            '            <span class="main-settings-arrow">‹</span>',
            '        </button>',

            '        <button type="button" class="main-settings-item" data-setting-action="privacy">',
            '            <span class="main-settings-icon">🔒</span>',
            '            <span class="main-settings-item-text">',
            '                <strong>حریم خصوصی</strong>',
            '                <small>تنظیمات حریم خصوصی</small>',
            '            </span>',
            '            <span class="main-settings-arrow">‹</span>',
            '        </button>',

            '        <button type="button" class="main-settings-item" data-setting-action="chat">',
            '            <span class="main-settings-icon">💬</span>',
            '            <span class="main-settings-item-text">',
            '                <strong>تنظیمات چت</strong>',
            '                <small>اندازه متن و تنظیمات گفتگو</small>',
            '            </span>',
            '            <span class="main-settings-arrow">‹</span>',
            '        </button>',

            '        <button type="button" class="main-settings-item" data-setting-action="about">',
            '            <span class="main-settings-icon">ℹ️</span>',
            '            <span class="main-settings-item-text">',
            '                <strong>درباره GAPINO</strong>',
            '                <small>نسخه و اطلاعات برنامه</small>',
            '            </span>',
            '            <span class="main-settings-arrow">‹</span>',
            '        </button>',

            '    </div>',

            '    <div class="main-settings-footer">',
            '        GAPINO Messenger',
            '    </div>',

            '</div>'
        ].join("");

        document.body.appendChild(modal);

        return modal;
    }

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

    function getTheme() {
        const theme =
            localStorage.getItem(
                THEME_KEY
            );

        if (
            theme === "dark" ||
            theme === "light"
        ) {
            return theme;
        }

        return "light";
    }

    function applyTheme(theme) {
        const safeTheme =
            theme === "dark"
                ? "dark"
                : "light";

        document.documentElement.setAttribute(
            "data-gapino-theme",
            safeTheme
        );

        localStorage.setItem(
            THEME_KEY,
            safeTheme
        );

        const themeText =
            document.getElementById(
                "mainSettingsThemeText"
            );

        if (themeText) {
            themeText.textContent =
                safeTheme === "dark"
                    ? "حالت تاریک"
                    : "حالت روشن";
        }
    }

    function toggleTheme() {
        const current =
            getTheme();

        const next =
            current === "dark"
                ? "light"
                : "dark";

        applyTheme(next);

        if (typeof showToast === "function") {
            showToast(
                next === "dark"
                    ? "حالت تاریک فعال شد."
                    : "حالت روشن فعال شد."
            );
        }
    }

    function openNotifications() {
        closeModal(
            document.getElementById(
                "mainSettingsModal"
            )
        );

        const notificationModal =
            document.getElementById(
                "notificationSettingsModal"
            );

        if (notificationModal) {
            notificationModal.hidden = false;
            notificationModal.classList.remove("hidden");
            notificationModal.style.display = "flex";
            return;
        }

        const notificationButton =
            document.getElementById(
                "notificationSettingsButton"
            );

        if (notificationButton) {
            notificationButton.click();
            return;
        }

        if (typeof showToast === "function") {
            showToast(
                "تنظیمات اعلان‌ها هنوز آماده نیست."
            );
        }
    }

    function openProfile() {
        closeModal(
            document.getElementById(
                "mainSettingsModal"
            )
        );

        const profileButton =
            document.getElementById(
                "profileButton"
            );

        if (profileButton) {
            profileButton.click();
            return;
        }

        const profileModal =
            document.getElementById(
                "profileModal"
            );

        if (profileModal) {
            openModal(profileModal);
        }
    }

    function showComingSoon(title) {
        if (typeof showToast === "function") {
            showToast(
                title +
                " به‌زودی اضافه می‌شود."
            );
        }
    }

    function showAbout() {
        if (typeof showToast === "function") {
            showToast(
                "GAPINO Messenger"
            );
        }
    }

    function handleAction(action) {
        switch (action) {

            case "profile":
                openProfile();
                break;

            case "notifications":
                openNotifications();
                break;

            case "theme":
                toggleTheme();
                break;

            case "privacy":
                showComingSoon(
                    "حریم خصوصی"
                );
                break;

            case "chat":
                showComingSoon(
                    "تنظیمات چت"
                );
                break;

            case "about":
                showAbout();
                break;

            default:
                break;
        }
    }

    function init() {
        const button =
            createSettingsButton();

        const modal =
            createSettingsModal();

        if (!button || !modal) {
            return;
        }

        applyTheme(
            getTheme()
        );

        button.addEventListener(
            "click",
            function () {
                applyTheme(
                    getTheme()
                );

                openModal(modal);
            }
        );

        const closeButton =
            modal.querySelector(
                ".main-settings-close"
            );

        if (closeButton) {
            closeButton.addEventListener(
                "click",
                function () {
                    closeModal(modal);
                }
            );
        }

        modal.addEventListener(
            "click",
            function (event) {
                if (event.target === modal) {
                    closeModal(modal);
                }
            }
        );

        modal
            .querySelectorAll(
                "[data-setting-action]"
            )
            .forEach(function (item) {
                item.addEventListener(
                    "click",
                    function () {
                        handleAction(
                            item.getAttribute(
                                "data-setting-action"
                            )
                        );
                    }
                );
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
    } else {
        init();
    }

    window.GAPINO_MAIN_SETTINGS = {
        open: function () {
            const modal =
                document.getElementById(
                    "mainSettingsModal"
                );

            openModal(modal);
        },

        close: function () {
            const modal =
                document.getElementById(
                    "mainSettingsModal"
                );

            closeModal(modal);
        },

        toggleTheme
    };
})();

// =========================================================
// GAPINO_CHAT_SETTINGS_V1
// =========================================================

(function () {
    "use strict";

    const STORAGE_KEY = "gapino_chat_settings";

    const DEFAULTS = {
        fontSize: 14,
        enterToSend: true,
        showTime: true,
        showTyping: true
    };

    function getSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (!raw) {
                return { ...DEFAULTS };
            }

            const data = JSON.parse(raw);

            return {
                ...DEFAULTS,
                ...(data && typeof data === "object" ? data : {})
            };
        } catch (_) {
            return { ...DEFAULTS };
        }
    }

    function saveSettings(settings) {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(settings)
        );
    }

    function applyFontSize(size) {
        const safeSize = Math.min(
            22,
            Math.max(11, Number(size) || 14)
        );

        document.documentElement.style.setProperty(
            "--gapino-message-font-size",
            safeSize + "px"
        );

        const value = document.getElementById(
            "chatSettingsFontValue"
        );

        if (value) {
            value.textContent = String(safeSize);
        }
    }

    function applyChatSettings() {
        const settings = getSettings();

        applyFontSize(settings.fontSize);

        document.documentElement.classList.toggle(
            "gapino-hide-message-time",
            settings.showTime !== true
        );

        document.documentElement.classList.toggle(
            "gapino-hide-typing",
            settings.showTyping !== true
        );
    }

    function createModal() {
        let modal = document.getElementById(
            "chatSettingsModal"
        );

        if (modal) {
            return modal;
        }

        modal = document.createElement("div");

        modal.id = "chatSettingsModal";
        modal.className = "modal chat-settings-modal";
        modal.hidden = true;
        modal.style.display = "none";

        modal.innerHTML = [
            '<div class="modal-content chat-settings-content">',

            '    <div class="modal-header">',
            '        <h2 class="modal-title">💬 تنظیمات چت</h2>',
            '        <button type="button" class="modal-close chat-settings-close" aria-label="بستن">×</button>',
            '    </div>',

            '    <div class="chat-settings-section">',

            '        <div class="chat-font-row">',
            '            <div class="chat-font-info">',
            '                <strong>🔤 اندازه متن پیام</strong>',
            '                <small>اندازه نوشته‌های داخل پیام‌ها</small>',
            '            </div>',
            '            <div class="chat-font-controls">',
            '                <button id="chatSettingsFontDecrease" type="button">−</button>',
            '                <strong id="chatSettingsFontValue">14</strong>',
            '                <button id="chatSettingsFontIncrease" type="button">+</button>',
            '            </div>',
            '        </div>',

            '        <div class="chat-setting-row">',
            '            <div class="chat-setting-info">',
            '                <strong>↵ ارسال با Enter</strong>',
            '                <small>با Enter پیام ارسال شود و با Shift + Enter خط جدید ایجاد شود.</small>',
            '            </div>',
            '            <label class="notification-switch">',
            '                <input id="chatEnterToSend" type="checkbox">',
            '                <span class="notification-switch-slider"></span>',
            '            </label>',
            '        </div>',

            '        <div class="chat-setting-row">',
            '            <div class="chat-setting-info">',
            '                <strong>🕐 نمایش ساعت پیام</strong>',
            '                <small>زمان ارسال پیام کنار آن نمایش داده شود.</small>',
            '            </div>',
            '            <label class="notification-switch">',
            '                <input id="chatShowTime" type="checkbox">',
            '                <span class="notification-switch-slider"></span>',
            '            </label>',
            '        </div>',

            '        <div class="chat-setting-row">',
            '            <div class="chat-setting-info">',
            '                <strong>✍️ نمایش وضعیت تایپ</strong>',
            '                <small>وضعیت «در حال تایپ...» نمایش داده شود.</small>',
            '            </div>',
            '            <label class="notification-switch">',
            '                <input id="chatShowTyping" type="checkbox">',
            '                <span class="notification-switch-slider"></span>',
            '            </label>',
            '        </div>',

            '    </div>',

            '    <div class="modal-footer">',
            '        <button id="closeChatSettings" class="btn btn-primary" type="button">انجام شد</button>',
            '    </div>',

            '</div>'
        ].join("");

        document.body.appendChild(modal);

        return modal;
    }

    function openModal() {
        const modal = document.getElementById(
            "chatSettingsModal"
        );

        if (!modal) {
            return;
        }

        syncControls();

        modal.hidden = false;
        modal.classList.remove("hidden");
        modal.style.display = "flex";
    }

    function closeModal() {
        const modal = document.getElementById(
            "chatSettingsModal"
        );

        if (!modal) {
            return;
        }

        modal.hidden = true;
        modal.classList.add("hidden");
        modal.style.display = "none";
    }

    function syncControls() {
        const settings = getSettings();

        const enter = document.getElementById(
            "chatEnterToSend"
        );

        const showTime = document.getElementById(
            "chatShowTime"
        );

        const showTyping = document.getElementById(
            "chatShowTyping"
        );

        if (enter) {
            enter.checked =
                settings.enterToSend === true;
        }

        if (showTime) {
            showTime.checked =
                settings.showTime === true;
        }

        if (showTyping) {
            showTyping.checked =
                settings.showTyping === true;
        }

        applyFontSize(
            settings.fontSize
        );
    }

    function updateSetting(name, value) {
        const settings = getSettings();

        settings[name] = value;

        saveSettings(settings);

        applyChatSettings();
    }

    function changeFontSize(amount) {
        const settings = getSettings();

        settings.fontSize = Math.min(
            22,
            Math.max(
                11,
                Number(settings.fontSize || 14) + amount
            )
        );

        saveSettings(settings);

        applyChatSettings();
        syncControls();
    }

    function installMainSettingsHook() {
        const item =
            document.querySelector(
                '[data-setting-action="chat"]'
            );

        if (!item || item.dataset.chatSettingsHooked === "1") {
            return;
        }

        item.dataset.chatSettingsHooked = "1";

        item.addEventListener(
            "click",
            function (event) {
                event.preventDefault();
                event.stopImmediatePropagation();

                const mainModal =
                    document.getElementById(
                        "mainSettingsModal"
                    );

                if (mainModal) {
                    mainModal.hidden = true;
                    mainModal.classList.add("hidden");
                    mainModal.style.display = "none";
                }

                openModal();
            },
            true
        );
    }

    function installInputBehavior() {
        const input =
            document.getElementById(
                "messageInput"
            );

        if (!input || input.dataset.chatSettingsHooked === "1") {
            return;
        }

        input.dataset.chatSettingsHooked = "1";

        input.addEventListener(
            "keydown",
            function (event) {
                const settings = getSettings();

                if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    settings.enterToSend !== true
                ) {
                    event.stopImmediatePropagation();
                }
            },
            true
        );
    }

    function init() {
        createModal();
        applyChatSettings();

        installMainSettingsHook();
        installInputBehavior();

        const modal =
            document.getElementById(
                "chatSettingsModal"
            );

        const closeButton =
            document.querySelector(
                ".chat-settings-close"
            );

        const doneButton =
            document.getElementById(
                "closeChatSettings"
            );

        const decrease =
            document.getElementById(
                "chatSettingsFontDecrease"
            );

        const increase =
            document.getElementById(
                "chatSettingsFontIncrease"
            );

        const enter =
            document.getElementById(
                "chatEnterToSend"
            );

        const showTime =
            document.getElementById(
                "chatShowTime"
            );

        const showTyping =
            document.getElementById(
                "chatShowTyping"
            );

        if (closeButton) {
            closeButton.addEventListener(
                "click",
                closeModal
            );
        }

        if (doneButton) {
            doneButton.addEventListener(
                "click",
                closeModal
            );
        }

        if (modal) {
            modal.addEventListener(
                "click",
                function (event) {
                    if (event.target === modal) {
                        closeModal();
                    }
                }
            );
        }

        if (decrease) {
            decrease.addEventListener(
                "click",
                function () {
                    changeFontSize(-1);
                }
            );
        }

        if (increase) {
            increase.addEventListener(
                "click",
                function () {
                    changeFontSize(1);
                }
            );
        }

        if (enter) {
            enter.addEventListener(
                "change",
                function () {
                    updateSetting(
                        "enterToSend",
                        enter.checked
                    );
                }
            );
        }

        if (showTime) {
            showTime.addEventListener(
                "change",
                function () {
                    updateSetting(
                        "showTime",
                        showTime.checked
                    );
                }
            );
        }

        if (showTyping) {
            showTyping.addEventListener(
                "change",
                function () {
                    updateSetting(
                        "showTyping",
                        showTyping.checked
                    );
                }
            );
        }

        window.GAPINO_CHAT_SETTINGS = {
            getSettings,
            saveSettings,
            applyChatSettings,
            open: openModal,
            close: closeModal
        };
    }

    function start() {
        init();

        setTimeout(
            installMainSettingsHook,
            300
        );

        setTimeout(
            installInputBehavior,
            300
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            start
        );
    } else {
        start();
    }
})();

// =========================================================
// GAPINO_REPLY_SYSTEM_V1
// =========================================================

(function () {
    "use strict";

    let originalAppendMessage = null;

    function getReplyName(message) {
        if (!message) {
            return "کاربر";
        }

        return safeText(
            message.sender_name ||
            message.display_name ||
            message.full_name ||
            message.username ||
            "کاربر"
        );
    }

    function getReplyText(message) {
        if (!message) {
            return "";
        }

        if (message.text) {
            return safeText(message.text);
        }

        if (message.file) {
            return safeText(
                message.file.name ||
                message.file.file_name ||
                "فایل"
            );
        }

        if (message.file_url) {
            return safeText(
                message.file_name ||
                "فایل"
            );
        }

        return "پیام";
    }

    function createReplyPreview() {
        let preview =
            document.getElementById(
                "gapinoReplyPreview"
            );

        if (preview) {
            return preview;
        }

        if (!messageForm) {
            return null;
        }

        preview = document.createElement("div");

        preview.id =
            "gapinoReplyPreview";

        preview.className =
            "gapino-reply-preview";

        preview.innerHTML = [
            '<div class="gapino-reply-preview-icon">↩</div>',
            '<div class="gapino-reply-preview-content">',
            '    <strong id="gapinoReplyPreviewName">پاسخ به کاربر</strong>',
            '    <span id="gapinoReplyPreviewText">پیام</span>',
            '</div>',
            '<button id="gapinoReplyCancel" type="button" aria-label="لغو پاسخ">×</button>'
        ].join("");

        messageForm.parentNode.insertBefore(
            preview,
            messageForm
        );

        const cancelButton =
            document.getElementById(
                "gapinoReplyCancel"
            );

        if (cancelButton) {
            cancelButton.addEventListener(
                "click",
                clearReply
            );
        }

        return preview;
    }

    function startReply(message) {
        if (!message || !message.id) {
            return;
        }

        window.GAPINO_REPLY_MESSAGE = {
            id: String(message.id),
            text: getReplyText(message),
            sender_id: String(
                message.sender_id || ""
            ),
            sender_name: getReplyName(message)
        };

        const preview =
            createReplyPreview();

        if (!preview) {
            return;
        }

        const name =
            document.getElementById(
                "gapinoReplyPreviewName"
            );

        const text =
            document.getElementById(
                "gapinoReplyPreviewText"
            );

        if (name) {
            name.textContent =
                "پاسخ به " +
                getReplyName(message);
        }

        if (text) {
            text.textContent =
                getReplyText(message);
        }

        preview.classList.add("visible");

        if (messageInput) {
            messageInput.focus();
        }
    }

    function clearReply() {
        window.GAPINO_REPLY_MESSAGE = null;

        const preview =
            document.getElementById(
                "gapinoReplyPreview"
            );

        if (preview) {
            preview.classList.remove(
                "visible"
            );
        }
    }

    function createReplyButton(message) {
        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "gapino-reply-button";

        button.title =
            "پاسخ به پیام";

        button.setAttribute(
            "aria-label",
            "پاسخ به پیام"
        );

        button.textContent = "↩";

        button.addEventListener(
            "click",
            function (event) {
                event.preventDefault();
                event.stopPropagation();

                startReply(message);
            }
        );

        return button;
    }

    function renderReplyQuote(
        bubble,
        replyTo
    ) {
        if (
            !bubble ||
            !replyTo ||
            !replyTo.id
        ) {
            return;
        }

        const quote =
            document.createElement("div");

        quote.className =
            "gapino-reply-quote";

        const name =
            document.createElement("strong");

        name.textContent =
            getReplyName(replyTo);

        const text =
            document.createElement("span");

        text.textContent =
            getReplyText(replyTo);

        quote.appendChild(name);
        quote.appendChild(text);

        bubble.insertBefore(
            quote,
            bubble.firstChild
        );
    }

    function attachReplyButton(
        row,
        message
    ) {
        if (
            !row ||
            !message ||
            !message.id
        ) {
            return;
        }

        row.dataset.messageId =
            String(message.id);

        const bubble =
            row.querySelector(
                ".message-bubble"
            );

        if (!bubble) {
            return;
        }

        if (
            bubble.querySelector(
                ".gapino-reply-button"
            )
        ) {
            return;
        }

        const replyButton =
            createReplyButton(message);

        bubble.appendChild(
            replyButton
        );

        if (message.reply_to) {
            renderReplyQuote(
                bubble,
                message.reply_to
            );
        }
    }

    function install() {
        if (
            typeof appendMessage !==
            "function"
        ) {
            setTimeout(
                install,
                300
            );
            return;
        }

        if (
            appendMessage.__gapinoReplyWrapped
        ) {
            return;
        }

        originalAppendMessage =
            appendMessage;

        const wrappedAppendMessage =
            function (
                message,
                scroll
            ) {
                originalAppendMessage(
                    message,
                    scroll
                );

                if (
                    messagesBox &&
                    message
                ) {
                    const rows =
                        messagesBox.querySelectorAll(
                            ".message-row"
                        );

                    const row =
                        rows[rows.length - 1];

                    attachReplyButton(
                        row,
                        message
                    );
                }
            };

        wrappedAppendMessage.__gapinoReplyWrapped =
            true;

        appendMessage =
            wrappedAppendMessage;

        window.GAPINO_CLEAR_REPLY =
            clearReply;

        window.GAPINO_START_REPLY =
            startReply;
    }

    function refreshReplyButtons() {
        if (!messagesBox) {
            return;
        }

        const rows =
            messagesBox.querySelectorAll(
                ".message-row"
            );

        rows.forEach(
            function (row) {
                const id =
                    row.dataset.messageId;

                if (!id) {
                    return;
                }

                const button =
                    row.querySelector(
                        ".gapino-reply-button"
                    );

                if (button) {
                    return;
                }
            }
        );
    }

    function start() {
        createReplyPreview();
        install();

        setTimeout(
            refreshReplyButtons,
            500
        );
    }

    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            start
        );
    } else {
        start();
    }
})();

/* =========================================================
   GAPINO_MASTER_MESSAGE_ACTIONS_V1
   Reply / Delete / Edit / Forward
   ========================================================= */

(function () {
    "use strict";

    if (window.GAPINO_MASTER_MESSAGE_ACTIONS_V1) return;
    window.GAPINO_MASTER_MESSAGE_ACTIONS_V1 = true;

    let editingMessageId = null;

    function getBox() {
        return document.getElementById("messages");
    }

    function getInput() {
        return document.getElementById("messageInput");
    }

    function getCurrentId() {
        try {
            if (typeof getCurrentUserId === "function") {
                return String(getCurrentUserId() || "");
            }
        } catch (_) {}

        return String(
            window.currentUser?.id ||
            window.currentUser?.user_id ||
            ""
        );
    }

    function escapeText(value) {
        return String(value ?? "");
    }

    function send(data) {
        try {
            if (typeof sendSocket === "function") {
                return sendSocket(data);
            }
        } catch (_) {}

        return false;
    }

    function toast(text) {
        try {
            if (typeof showToast === "function") {
                showToast(text);
                return;
            }
        } catch (_) {}

        alert(text);
    }

    function findRow(messageId) {
        const box = getBox();
        if (!box) return null;

        return box.querySelector(
            '.message-row[data-message-id="' +
            CSS.escape(String(messageId)) +
            '"]'
        );
    }

    function getMessageText(message) {
        return escapeText(
            message?.text ||
            message?.file_name ||
            message?.name ||
            ""
        ).trim();
    }

    function finishEditing() {
        editingMessageId = null;

        const input = getInput();

        if (input) {
            input.dataset.gapinoEditing = "";
        }

        const indicator = document.getElementById("gapinoEditPreview");
        if (indicator) {
            indicator.remove();
        }
    }

    function startEdit(message) {
        if (!message?.id) return;

        const mine =
            String(message.sender_id || "") === getCurrentId();

        if (!mine) {
            toast("فقط پیام‌های خودت را می‌توانی ویرایش کنی.");
            return;
        }

        const text = getMessageText(message);

        if (!text) {
            toast("این پیام قابل ویرایش نیست.");
            return;
        }

        const input = getInput();

        if (!input) return;

        editingMessageId = String(message.id);

        input.value = text;
        input.dataset.gapinoEditing = editingMessageId;

        const old = document.getElementById("gapinoEditPreview");

        if (old) old.remove();

        const form = input.closest("form") || input.parentElement;

        if (form) {
            const preview = document.createElement("div");

            preview.id = "gapinoEditPreview";
            preview.className = "gapino-edit-preview";

            const title = document.createElement("strong");
            title.textContent = "✏️ ویرایش پیام";

            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.textContent = "×";
            cancel.title = "لغو ویرایش";

            cancel.addEventListener("click", function () {
                finishEditing();

                if (input) {
                    input.value = "";
                    input.focus();
                }
            });

            preview.appendChild(title);
            preview.appendChild(cancel);

            form.parentElement?.insertBefore(preview, form);

            input.focus();

            try {
                input.setSelectionRange(
                    input.value.length,
                    input.value.length
                );
            } catch (_) {}
        }
    }

    function deleteMessage(message) {
        if (!message?.id) return;

        const mine =
            String(message.sender_id || "") === getCurrentId();

        if (!mine) {
            toast("فقط پیام‌های خودت را می‌توانی حذف کنی.");
            return;
        }

        const ok = window.confirm(
            "این پیام برای هر دو طرف حذف شود؟"
        );

        if (!ok) return;

        const sent = send({
            type: "delete_message",
            message_id: String(message.id)
        });

        if (!sent) {
            toast("اتصال به سرور برقرار نیست.");
        }
    }

    function forwardMessage(message) {
        if (!message) return;

        const text = getMessageText(message);

        if (!text) {
            toast("این پیام قابل فوروارد نیست.");
            return;
        }

        if (!window.currentChatUser) {
            toast("ابتدا یک گفتگو را انتخاب کن.");
            return;
        }

        const input = getInput();

        if (!input) return;

        input.value = "↗ " + text;
        input.focus();

        toast("پیام برای ارسال آماده شد.");
    }

    function editMessageOnScreen(messageId, newText) {
        const row = findRow(messageId);

        if (!row) return;

        const bubble = row.querySelector(".message-bubble");

        if (!bubble) return;

        const textNodes = Array.from(bubble.children)
            .filter(function (el) {
                return !el.classList.contains("message-time") &&
                       !el.classList.contains("gapino-message-actions") &&
                       !el.classList.contains("gapino-reply-quote");
            });

        if (textNodes.length) {
            textNodes[0].textContent = newText;
            return;
        }

        const node = document.createElement("div");
        node.textContent = newText;

        bubble.insertBefore(
            node,
            bubble.querySelector(".message-time") || null
        );
    }

    function markDeleted(messageId) {
        const row = findRow(messageId);

        if (!row) return;

        const bubble = row.querySelector(".message-bubble");

        if (!bubble) return;

        bubble.innerHTML = "";

        const deleted = document.createElement("div");
        deleted.className = "gapino-deleted-message";
        deleted.textContent = "🗑️ این پیام حذف شد";

        bubble.appendChild(deleted);

        row.classList.add("message-deleted");

        const actions = row.querySelector(".gapino-message-actions");

        if (actions) {
            actions.remove();
        }
    }

    function createActions(message) {
        if (!message?.id) return null;

        const row = document.createElement("div");
        row.className = "gapino-message-actions";

        const reply = document.createElement("button");
        reply.type = "button";
        reply.className = "gapino-action-btn";
        reply.textContent = "↩";
        reply.title = "پاسخ";

        reply.addEventListener("click", function () {
            if (typeof window.GAPINO_START_REPLY === "function") {
                window.GAPINO_START_REPLY(message);
            }
        });

        row.appendChild(reply);

        const mine =
            String(message.sender_id || "") === getCurrentId();

        if (mine) {
            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "gapino-action-btn";
            edit.textContent = "✏️";
            edit.title = "ویرایش";

            edit.addEventListener("click", function () {
                startEdit(message);
            });

            row.appendChild(edit);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "gapino-action-btn danger";
            remove.textContent = "🗑️";
            remove.title = "حذف برای همه";

            remove.addEventListener("click", function () {
                deleteMessage(message);
            });

            row.appendChild(remove);
        }

        const forward = document.createElement("button");
        forward.type = "button";
        forward.className = "gapino-action-btn";
        forward.textContent = "↗";
        forward.title = "فوروارد";

        forward.addEventListener("click", function () {
            forwardMessage(message);
        });

        row.appendChild(forward);

        return row;
    }

    function decorateLastMessage(message) {
        const box = getBox();

        if (!box || !message?.id) return;

        const rows = box.querySelectorAll(".message-row");

        if (!rows.length) return;

        const row = rows[rows.length - 1];

        row.dataset.messageId = String(message.id);

        if (
            row.querySelector(".gapino-message-actions")
        ) {
            return;
        }

        const actions = createActions(message);

        if (actions) {
            row.appendChild(actions);
        }
    }

    function decorateExistingRows() {
        const box = getBox();

        if (!box) return;

        box.querySelectorAll(".message-row").forEach(function (row) {
            if (!row.dataset.messageId) return;
            if (row.querySelector(".gapino-message-actions")) return;
        });
    }

    window.GAPINO_MASTER_DELETE_MESSAGE = deleteMessage;
    window.GAPINO_MASTER_EDIT_MESSAGE = startEdit;
    window.GAPINO_MASTER_FORWARD_MESSAGE = forwardMessage;

    const originalAppendMessage =
        window.appendMessage || null;

    if (typeof originalAppendMessage === "function") {
        window.appendMessage = function (message, scroll) {
            const result = originalAppendMessage(
                message,
                scroll
            );

            setTimeout(function () {
                decorateLastMessage(message);
            }, 0);

            return result;
        };
    }

    const originalReceiveMessage =
        window.receiveMessage || null;

    if (typeof originalReceiveMessage === "function") {
        window.receiveMessage = function (message) {
            return originalReceiveMessage(message);
        };
    }

    function installSocketHandler() {
        try {
            const old = window.GAPINO_MASTER_SOCKET_HANDLER;

            if (old) return;

            window.GAPINO_MASTER_SOCKET_HANDLER = true;

            window.addEventListener(
                "gapino:message_deleted",
                function (event) {
                    const id =
                        event.detail?.message_id ||
                        event.detail?.id;

                    if (id) {
                        markDeleted(id);
                    }
                }
            );
        } catch (_) {}
    }

    installSocketHandler();

    document.addEventListener(
        "DOMContentLoaded",
        function () {
            setTimeout(function () {
                decorateExistingRows();
            }, 300);
        }
    );

    window.addEventListener(
        "gapino-message-deleted",
        function (event) {
            const id =
                event.detail?.message_id ||
                event.detail?.id;

            if (id) {
                markDeleted(id);
            }
        }
    );

    window.addEventListener(
        "gapino-message-edited",
        function (event) {
            const data = event.detail || {};

            if (data.message_id && data.text) {
                editMessageOnScreen(
                    data.message_id,
                    data.text
                );
            }
        }
    );

})();

/* GAPINO_MASTER_SOCKET_EVENTS_V1 */

(function () {
    "use strict";

    if (window.GAPINO_MASTER_SOCKET_EVENTS_V1) return;
    window.GAPINO_MASTER_SOCKET_EVENTS_V1 = true;

    function handleDeleted(messageId) {
        window.dispatchEvent(
            new CustomEvent(
                "gapino:message_deleted",
                {
                    detail: {
                        message_id: String(messageId)
                    }
                }
            )
        );

        window.dispatchEvent(
            new CustomEvent(
                "gapino-message-deleted",
                {
                    detail: {
                        message_id: String(messageId)
                    }
                }
            )
        );
    }

    function handleEdited(message) {
        if (!message) return;

        window.dispatchEvent(
            new CustomEvent(
                "gapino-message-edited",
                {
                    detail: {
                        message_id: message.id,
                        text: message.text
                    }
                }
            )
        );
    }

    const oldHandler = window.onGapinoMessage;

    window.onGapinoMessage = function (payload) {
        try {
            if (payload?.type === "message_deleted") {
                handleDeleted(payload.message_id);
            }

            if (payload?.type === "message_edited") {
                handleEdited(payload.message);
            }
        } catch (_) {}

        if (typeof oldHandler === "function") {
            return oldHandler(payload);
        }
    };

})();

/* GAPINO_MASTER_SOCKET_EVENTS_V1 */

(function () {
    "use strict";

    if (window.GAPINO_MASTER_SOCKET_EVENTS_V1) return;
    window.GAPINO_MASTER_SOCKET_EVENTS_V1 = true;

    function handleDeleted(messageId) {
        window.dispatchEvent(
            new CustomEvent(
                "gapino:message_deleted",
                {
                    detail: {
                        message_id: String(messageId)
                    }
                }
            )
        );

        window.dispatchEvent(
            new CustomEvent(
                "gapino-message-deleted",
                {
                    detail: {
                        message_id: String(messageId)
                    }
                }
            )
        );
    }

    function handleEdited(message) {
        if (!message) return;

        window.dispatchEvent(
            new CustomEvent(
                "gapino-message-edited",
                {
                    detail: {
                        message_id: message.id,
                        text: message.text
                    }
                }
            )
        );
    }

    const oldHandler = window.onGapinoMessage;

    window.onGapinoMessage = function (payload) {
        try {
            if (payload?.type === "message_deleted") {
                handleDeleted(payload.message_id);
            }

            if (payload?.type === "message_edited") {
                handleEdited(payload.message);
            }
        } catch (_) {}

        if (typeof oldHandler === "function") {
            return oldHandler(payload);
        }
    };

})();
