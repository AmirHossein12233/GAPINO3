// =========================================================
// کاربر فعلی
// =========================================================

let currentUser =
    JSON.parse(
        localStorage.getItem(
            "gapino_user"
        )
    );


if (!currentUser) {

    window.location.href =
        "login.html";

    throw new Error(
        "User not logged in"
    );
}


// =========================================================
// عناصر اصلی
// =========================================================

const app =
    document.querySelector(
        ".chat-app"
    );


const usersList =
    document.getElementById(
        "usersList"
    );


const myUsername =
    document.getElementById(
        "myUsername"
    );


const myAvatar =
    document.getElementById(
        "myAvatar"
    );


const chatAvatar =
    document.getElementById(
        "chatAvatar"
    );


const chatUsername =
    document.getElementById(
        "chatUsername"
    );


const chatStatus =
    document.getElementById(
        "chatStatus"
    );


const messagesBox =
    document.getElementById(
        "messages"
    );


const messageForm =
    document.getElementById(
        "messageForm"
    );


const messageInput =
    document.getElementById(
        "messageInput"
    );


const searchInput =
    document.getElementById(
        "searchInput"
    );


const logoutButton =
    document.getElementById(
        "logoutButton"
    );


const mobileBack =
    document.getElementById(
        "mobileBack"
    );


const typingIndicator =
    document.getElementById(
        "typingIndicator"
    );


const attachmentButton =
    document.getElementById(
        "attachmentButton"
    );


const fileInput =
    document.getElementById(
        "fileInput"
    );


const imageButton =
    document.getElementById(
        "imageButton"
    );


const imageInput =
    document.getElementById(
        "imageInput"
    );


const uploadStatus =
    document.getElementById(
        "uploadStatus"
    );


// =========================================================
// عناصر پروفایل
// =========================================================

const openProfileButton =
    document.getElementById(
        "openProfileButton"
    );


const profileModal =
    document.getElementById(
        "profileModal"
    );


const closeProfileButton =
    document.getElementById(
        "closeProfileButton"
    );


const profileForm =
    document.getElementById(
        "profileForm"
    );


const displayNameInput =
    document.getElementById(
        "displayNameInput"
    );


const bioInput =
    document.getElementById(
        "bioInput"
    );


const avatarInput =
    document.getElementById(
        "avatarInput"
    );


const profileMessage =
    document.getElementById(
        "profileMessage"
    );


const profileAvatarPreview =
    document.getElementById(
        "profileAvatarPreview"
    );


const profilePreviewName =
    document.getElementById(
        "profilePreviewName"
    );


const profilePreviewUsername =
    document.getElementById(
        "profilePreviewUsername"
    );


// =========================================================
// متغیرها
// =========================================================

let users = [];

let selectedUser = null;

let socket = null;

let typingTimer = null;

let reconnectTimer = null;

let manuallyClosedSocket = false;


// =========================================================
// پروفایل من
// =========================================================

renderMyProfile();


// =========================================================
// آواتار
// =========================================================

function setAvatarElement(
    element,
    user
) {

    if (!element) {
        return;
    }


    element.innerHTML = "";


    const avatar =
        user?.avatar
        ? String(
            user.avatar
        ).trim()
        : "";


    if (avatar) {

        const image =
            document.createElement(
                "img"
            );


        image.src =
            avatar;


        image.alt =
            user.display_name
            ||
            user.username
            ||
            "avatar";


        image.addEventListener(
            "error",
            () => {

                element.innerHTML =
                    "";


                element.textContent =
                    getInitial(
                        user.display_name
                        ||
                        user.username
                    );

            }
        );


        element.appendChild(
            image
        );


    } else {

        element.textContent =
            getInitial(
                user.display_name
                ||
                user.username
            );

    }

}


// =========================================================
// حرف اول
// =========================================================

function getInitial(
    text
) {

    if (!text) {

        return "?";
    }


    return String(
        text
    )
        .trim()
        .charAt(0)
        .toUpperCase();

}


// =========================================================
// نمایش پروفایل خودم
// =========================================================

function renderMyProfile() {

    const name =
        currentUser.display_name
        ||
        currentUser.username;


    myUsername.textContent =
        name;


    setAvatarElement(
        myAvatar,
        currentUser
    );

}


// =========================================================
// ذخیره کاربر
// =========================================================

function saveCurrentUser() {

    localStorage.setItem(
        "gapino_user",
        JSON.stringify(
            currentUser
        )
    );

}


// =========================================================
// اتصال WebSocket
// =========================================================

function connectSocket() {

    if (
        manuallyClosedSocket
    ) {

        return;
    }


    if (
        socket
        &&
        (
            socket.readyState
            === WebSocket.OPEN
            ||
            socket.readyState
            === WebSocket.CONNECTING
        )
    ) {

        return;
    }


    const protocol =
        window.location.protocol
        === "https:"
            ? "wss:"
            : "ws:";


    socket =
        new WebSocket(
            `${protocol}//${window.location.host}/ws/${currentUser.id}`
        );


    socket.addEventListener(
        "open",
        () => {

            console.log(
                "GAPINO WebSocket connected"
            );

        }
    );


    socket.addEventListener(
        "message",
        event => {

            try {

                const data =
                    JSON.parse(
                        event.data
                    );


                handleSocketMessage(
                    data
                );

            } catch (error) {

                console.error(
                    "WebSocket data error:",
                    error
                );

            }

        }
    );


    socket.addEventListener(
        "close",
        () => {

            console.log(
                "WebSocket disconnected"
            );


            if (
                manuallyClosedSocket
            ) {

                return;
            }


            clearTimeout(
                reconnectTimer
            );


            reconnectTimer =
                setTimeout(
                    connectSocket,
                    2000
                );

        }
    );


    socket.addEventListener(
        "error",
        error => {

            console.error(
                "WebSocket error:",
                error
            );

        }
    );

}


// =========================================================
// آیا پیام مربوط به گفتگوی فعلی است؟
/* ===================================================== */

function isCurrentConversationMessage(
    message
) {

    if (!selectedUser) {

        return false;
    }


    return (

        (
            message.sender_id
            === currentUser.id

            &&

            message.receiver_id
            === selectedUser.id
        )

        ||

        (
            message.sender_id
            === selectedUser.id

            &&

            message.receiver_id
            === currentUser.id
        )

    );

}


// =========================================================
// WebSocket Message Handler
// =========================================================

function handleSocketMessage(
    data
) {

    // -----------------------------------------------------
    // اتصال
    // -----------------------------------------------------

    if (
        data.type
        === "connected"
    ) {

        console.log(
            "GAPINO connected as:",
            data.user_id
        );


        return;
    }


    // -----------------------------------------------------
    // پیام متنی
    // -----------------------------------------------------

    if (
        data.type
        === "message"
    ) {

        const message =
            data.message;


        if (
            isCurrentConversationMessage(
                message
            )
        ) {

            removeEmptyMessage();


            renderMessage(
                message
            );


            scrollMessages();

        }


        return;
    }


    // -----------------------------------------------------
    // فایل
    // -----------------------------------------------------

    if (
        data.type
        === "file"
    ) {

        const message =
            data.message;


        if (
            isCurrentConversationMessage(
                message
            )
        ) {

            removeEmptyMessage();


            renderMessage(
                message
            );


            scrollMessages();

        }


        return;
    }


    // -----------------------------------------------------
    // کاربران آنلاین
    // -----------------------------------------------------

    if (
        data.type
        === "online_users"
    ) {

        const onlineUsers =
            data.users || [];


        users =
            users.map(
                user => ({

                    ...user,

                    online:
                        onlineUsers.includes(
                            user.id
                        )

                })
            );


        currentUser.online =
            onlineUsers.includes(
                currentUser.id
            );


        saveCurrentUser();


        renderUsers();


        updateSelectedUserStatus();


        return;
    }


    // -----------------------------------------------------
    // تایپ
    // -----------------------------------------------------

    if (
        data.type
        === "typing"
    ) {

        if (
            selectedUser
            &&
            data.sender_id
            === selectedUser.id
        ) {

            typingIndicator.textContent =
                `${
                    selectedUser.display_name
                    ||
                    selectedUser.username
                } در حال نوشتن است...`;

        }


        return;
    }


    // -----------------------------------------------------
    // توقف تایپ
    // -----------------------------------------------------

    if (
        data.type
        === "stop_typing"
    ) {

        typingIndicator.textContent =
            "";


        return;
    }


    // -----------------------------------------------------
    // تغییر پروفایل
    // -----------------------------------------------------

    if (
        data.type
        === "profile_updated"
    ) {

        const updatedUser =
            data.user;


        if (
            updatedUser.id
            === currentUser.id
        ) {

            currentUser =
                {
                    ...currentUser,
                    ...updatedUser
                };


            saveCurrentUser();


            renderMyProfile();


            updateProfilePreview();

        }


        const index =
            users.findIndex(
                user =>
                    user.id
                    === updatedUser.id
            );


        if (index !== -1) {

            users[index] =
                {
                    ...users[index],
                    ...updatedUser
                };

        }


        if (
            selectedUser
            &&
            selectedUser.id
            === updatedUser.id
        ) {

            selectedUser =
                {
                    ...selectedUser,
                    ...updatedUser
                };


            updateSelectedUserHeader();

        }


        renderUsers();


        return;
    }

}


// =========================================================
// بارگذاری کاربران
// =========================================================

async function loadUsers() {

    try {

        const response =
            await fetch(
                "/users",
                {
                    credentials:
                        "include"
                }
            );


        if (!response.ok) {

            return;
        }


        users =
            await response.json();


        const me =
            users.find(
                user =>
                    user.id
                    === currentUser.id
            );


        if (me) {

            currentUser =
                {
                    ...currentUser,
                    ...me
                };


            saveCurrentUser();


            renderMyProfile();

        }


        if (selectedUser) {

            const updatedSelected =
                users.find(
                    user =>
                        user.id
                        === selectedUser.id
                );


            if (updatedSelected) {

                selectedUser =
                    updatedSelected;


                updateSelectedUserHeader();

            }

        }


        renderUsers();

    } catch (error) {

        console.error(
            "Users error:",
            error
        );

    }

}


// =========================================================
// نمایش کاربران
// =========================================================

function renderUsers() {

    const search =
        searchInput.value
            .trim()
            .toLowerCase();


    usersList.innerHTML =
        "";


    const filteredUsers =
        users.filter(
            user => {

                if (
                    user.id
                    === currentUser.id
                ) {

                    return false;
                }


                const username =
                    (
                        user.username
                        ||
                        ""
                    )
                    .toLowerCase();


                const displayName =
                    (
                        user.display_name
                        ||
                        ""
                    )
                    .toLowerCase();


                return (

                    username.includes(
                        search
                    )

                    ||

                    displayName.includes(
                        search
                    )

                );

            }
        );


    if (
        filteredUsers.length
        === 0
    ) {

        usersList.innerHTML =
            `
            <div style="
                padding:20px;
                text-align:center;
                color:#64748b;
            ">
                کاربری پیدا نشد.
            </div>
            `;


        return;
    }


    filteredUsers.forEach(
        user => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "user-item";


            if (
                selectedUser
                &&
                selectedUser.id
                === user.id
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


            setAvatarElement(
                avatar,
                user
            );


            const info =
                document.createElement(
                    "div"
                );


            info.className =
                "user-info";


            const usernameRow =
                document.createElement(
                    "div"
                );


            usernameRow.className =
                "username-row";


            const username =
                document.createElement(
                    "div"
                );


            username.className =
                "username";


            username.textContent =
                user.display_name
                ||
                user.username;


            const dot =
                document.createElement(
                    "div"
                );


            dot.className =
                user.online
                    ? "online-dot"
                    : "offline-dot";


            usernameRow.appendChild(
                username
            );


            usernameRow.appendChild(
                dot
            );


            const status =
                document.createElement(
                    "div"
                );


            status.className =
                "status-text";


            status.textContent =
                user.online
                    ? "آنلاین"
                    : "آفلاین";


            info.appendChild(
                usernameRow
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
                () => {

                    selectUser(
                        user
                    );

                }
            );


            usersList.appendChild(
                item
            );

        }
    );

}


// =========================================================
// انتخاب کاربر
// =========================================================

async function selectUser(
    user
) {

    selectedUser =
        user;


    updateSelectedUserHeader();


    typingIndicator.textContent =
        "";


    messagesBox.innerHTML =
        "";


    renderUsers();


    app.classList.add(
        "show-chat"
    );


    await loadConversation();


    scrollMessages();

}


// =========================================================
// هدر چت
// =========================================================

function updateSelectedUserHeader() {

    if (!selectedUser) {

        chatUsername.textContent =
            "یک کاربر را انتخاب کنید";


        chatStatus.textContent =
            "";


        setAvatarElement(
            chatAvatar,
            null
        );


        return;
    }


    chatUsername.textContent =
        selectedUser.display_name
        ||
        selectedUser.username;


    chatStatus.textContent =
        selectedUser.online
            ? "آنلاین"
            : "آفلاین";


    setAvatarElement(
        chatAvatar,
        selectedUser
    );

}


// =========================================================
// وضعیت کاربر
// =========================================================

function updateSelectedUserStatus() {

    if (!selectedUser) {

        return;
    }


    const latestUser =
        users.find(
            user =>
                user.id
                === selectedUser.id
        );


    if (latestUser) {

        selectedUser =
            latestUser;

    }


    updateSelectedUserHeader();

}


// =========================================================
// تاریخچه پیام
// =========================================================

async function loadConversation() {

    if (!selectedUser) {

        return;
    }


    try {

        const response =
            await fetch(
                `/messages/${currentUser.id}/${selectedUser.id}`,
                {
                    credentials:
                        "include"
                }
            );


        if (!response.ok) {

            showEmptyMessage(
                "دریافت پیام‌ها انجام نشد."
            );


            return;
        }


        const data =
            await response.json();


        messagesBox.innerHTML =
            "";


        if (
            data.length
            === 0
        ) {

            showEmptyMessage(
                "هنوز پیامی وجود ندارد."
            );


            return;
        }


        data.forEach(
            message => {

                renderMessage(
                    message
                );

            }
        );


    } catch (error) {

        console.error(
            "Messages error:",
            error
        );


        showEmptyMessage(
            "خطا در دریافت پیام‌ها."
        );

    }

}


// =========================================================
// پیام خالی
// =========================================================

function showEmptyMessage(
    text
) {

    messagesBox.innerHTML =
        "";


    const empty =
        document.createElement(
            "div"
        );


    empty.className =
        "empty-chat";


    empty.textContent =
        text;


    messagesBox.appendChild(
        empty
    );

}


function removeEmptyMessage() {

    const empty =
        messagesBox.querySelector(
            ".empty-chat"
        );


    if (empty) {

        empty.remove();

    }

}


// =========================================================
// نمایش پیام
// =========================================================

function renderMessage(
    message
) {

    if (
        !message
        ||
        !message.id
    ) {

        return;
    }


    if (
        messagesBox.querySelector(
            `[data-message-id="${message.id}"]`
        )
    ) {

        return;
    }


    removeEmptyMessage();


    const isMine =
        message.sender_id
        === currentUser.id;


    const row =
        document.createElement(
            "div"
        );


    row.className =
        `message-row ${
            isMine
                ? "mine"
                : "theirs"
        }`;


    row.dataset.messageId =
        message.id;


    const bubble =
        document.createElement(
            "div"
        );


    bubble.className =
        "message-bubble";


    // =====================================================
    // فایل
    // =====================================================

    if (
        message.file
    ) {

        const file =
            message.file;


        if (
            file.is_image
        ) {

            const image =
                document.createElement(
                    "img"
                );


            image.className =
                "chat-image";


            image.src =
                file.url;


            image.alt =
                file.name
                ||
                "image";


            image.loading =
                "lazy";


            image.addEventListener(
                "click",
                () => {

                    window.open(
                        file.url,
                        "_blank",
                        "noopener"
                    );

                }
            );


            bubble.appendChild(
                image
            );


        } else {

            const fileBox =
                document.createElement(
                    "a"
                );


            fileBox.className =
                "chat-file";


            fileBox.href =
                file.url;


            fileBox.target =
                "_blank";


            fileBox.rel =
                "noopener noreferrer";


            fileBox.download =
                file.name
                ||
                "file";


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


            const name =
                document.createElement(
                    "strong"
                );


            name.textContent =
                file.name
                ||
                "فایل";


            const size =
                document.createElement(
                    "small"
                );


            size.textContent =
                formatFileSize(
                    file.size || 0
                );


            info.appendChild(
                name
            );


            info.appendChild(
                size
            );


            fileBox.appendChild(
                icon
            );


            fileBox.appendChild(
                info
            );


            bubble.appendChild(
                fileBox
            );

        }

    }


    // =====================================================
    // متن
    // =====================================================

    if (
        message.text
    ) {

        const text =
            document.createElement(
                "div"
            );


        text.textContent =
            message.text;


        bubble.appendChild(
            text
        );

    }


    // =====================================================
    // زمان
    // =====================================================

    const time =
        document.createElement(
            "span"
        );


    time.className =
        "message-time";


    time.textContent =
        message.created_at
        ||
        "";


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


// =========================================================
// حجم فایل
// =========================================================

function formatFileSize(
    bytes
) {

    bytes =
        Number(
            bytes
        )
        || 0;


    if (
        bytes < 1024
    ) {

        return `${bytes} B`;
    }


    if (
        bytes < 1024 * 1024
    ) {

        return `${
            (
                bytes / 1024
            ).toFixed(1)
        } KB`;

    }


    return `${
        (
            bytes
            /
            (
                1024 * 1024
            )
        ).toFixed(1)
    } MB`;

}


// =========================================================
// ارسال پیام متنی
// =========================================================

messageForm.addEventListener(
    "submit",
    event => {

        event.preventDefault();


        if (!selectedUser) {

            alert(
                "ابتدا یک کاربر را انتخاب کنید."
            );


            return;
        }


        const text =
            messageInput.value
                .trim();


        if (!text) {

            return;
        }


        if (
            !socket
            ||
            socket.readyState
            !== WebSocket.OPEN
        ) {

            alert(
                "ارتباط با سرور برقرار نیست."
            );


            return;
        }


        socket.send(
            JSON.stringify(
                {

                    type:
                        "message",

                    receiver_id:
                        selectedUser.id,

                    text:
                        text

                }
            )
        );


        messageInput.value =
            "";


        sendStopTyping();


        messageInput.focus();

    }
);


// =========================================================
// دکمه عکس
// =========================================================

imageButton.addEventListener(
    "click",
    () => {

        if (!selectedUser) {

            alert(
                "ابتدا یک کاربر را انتخاب کنید."
            );


            return;
        }


        imageInput.click();

    }
);


// =========================================================
// انتخاب عکس
// =========================================================

imageInput.addEventListener(
    "change",
    async () => {

        const image =
            imageInput.files[0];


        if (!image) {

            return;
        }


        if (
            !image.type.startsWith(
                "image/"
            )
        ) {

            uploadStatus.textContent =
                "فقط فایل تصویری مجاز است.";


            imageInput.value =
                "";


            return;
        }


        await uploadSelectedFile(
            image
        );


        imageInput.value =
            "";

    }
);


// =========================================================
// دکمه فایل
// =========================================================

attachmentButton.addEventListener(
    "click",
    () => {

        if (!selectedUser) {

            alert(
                "ابتدا یک کاربر را انتخاب کنید."
            );


            return;
        }


        fileInput.click();

    }
);


// =========================================================
// انتخاب فایل
// =========================================================

fileInput.addEventListener(
    "change",
    async () => {

        const file =
            fileInput.files[0];


        if (!file) {

            return;
        }


        await uploadSelectedFile(
            file
        );


        fileInput.value =
            "";

    }
);


// =========================================================
// آپلود فایل
// =========================================================

async function uploadSelectedFile(
    selectedFile
) {

    if (!selectedFile) {

        return;
    }


    if (!selectedUser) {

        alert(
            "ابتدا یک کاربر را انتخاب کنید."
        );


        return;
    }


    const maxSize =
        10 * 1024 * 1024;


    if (
        selectedFile.size > maxSize
    ) {

        uploadStatus.textContent =
            "حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.";


        return;
    }


    if (
        selectedFile.size === 0
    ) {

        uploadStatus.textContent =
            "فایل خالی قابل ارسال نیست.";


        return;
    }


    uploadStatus.textContent =
        "در حال آپلود...";


    const formData =
        new FormData();


    formData.append(
        "file",
        selectedFile
    );


    try {

        const response =
            await fetch(
                "/upload",
                {

                    method:
                        "POST",

                    body:
                        formData,

                    credentials:
                        "include"

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            uploadStatus.textContent =
                data.message
                ||
                "آپلود انجام نشد.";


            return;
        }


        if (
            !socket
            ||
            socket.readyState
            !== WebSocket.OPEN
        ) {

            uploadStatus.textContent =
                "ارتباط با سرور برقرار نیست.";


            return;
        }


        socket.send(
            JSON.stringify(
                {

                    type:
                        "file",

                    receiver_id:
                        selectedUser.id,

                    file:
                        data.file

                }
            )
        );


        uploadStatus.textContent =
            selectedFile.type.startsWith(
                "image/"
            )
                ? "عکس ارسال شد."
                : "فایل ارسال شد.";


        setTimeout(
            () => {

                uploadStatus.textContent =
                    "";

            },
            2000
        );


    } catch (error) {

        console.error(
            "Upload error:",
            error
        );


        uploadStatus.textContent =
            "خطا در آپلود.";

    }

}


// =========================================================
// تایپ
// =========================================================

messageInput.addEventListener(
    "input",
    () => {

        if (!selectedUser) {

            return;
        }


        if (
            !socket
            ||
            socket.readyState
            !== WebSocket.OPEN
        ) {

            return;
        }


        socket.send(
            JSON.stringify(
                {

                    type:
                        "typing",

                    receiver_id:
                        selectedUser.id

                }
            )
        );


        clearTimeout(
            typingTimer
        );


        typingTimer =
            setTimeout(
                () => {

                    sendStopTyping();

                },
                800
            );

    }
);


function sendStopTyping() {

    if (!selectedUser) {

        return;
    }


    if (
        !socket
        ||
        socket.readyState
        !== WebSocket.OPEN
    ) {

        return;
    }


    socket.send(
        JSON.stringify(
            {

                type:
                    "stop_typing",

                receiver_id:
                    selectedUser.id

            }
        )
    );

}


// =========================================================
// جستجو
// =========================================================

searchInput.addEventListener(
    "input",
    () => {

        renderUsers();

    }
);


// =========================================================
// برگشت موبایل
// =========================================================

mobileBack.addEventListener(
    "click",
    () => {

        app.classList.remove(
            "show-chat"
        );

    }
);


// =========================================================
// خروج
// =========================================================

logoutButton.addEventListener(
    "click",
    async () => {

        manuallyClosedSocket =
            true;


        try {

            await fetch(
                "/logout",
                {

                    method:
                        "POST",

                    credentials:
                        "include"

                }
            );

        } catch (error) {

            console.error(
                error
            );

        }


        localStorage.removeItem(
            "gapino_user"
        );


        if (socket) {

            socket.close();

        }


        window.location.href =
            "login.html";

    }
);


// =========================================================
// اسکرول
// =========================================================

function scrollMessages() {

    messagesBox.scrollTop =
        messagesBox.scrollHeight;

}


// =========================================================
// پروفایل
// =========================================================

openProfileButton.addEventListener(
    "click",
    () => {

        openProfile();

    }
);


function openProfile() {

    profileMessage.textContent =
        "";


    profileMessage.classList.remove(
        "error"
    );


    displayNameInput.value =
        currentUser.display_name
        ||
        currentUser.username
        ||
        "";


    bioInput.value =
        currentUser.bio
        ||
        "";


    avatarInput.value =
        currentUser.avatar
        ||
        "";


    updateProfilePreview();


    profileModal.classList.remove(
        "hidden"
    );

}


// =========================================================
// بستن پروفایل
// =========================================================

closeProfileButton.addEventListener(
    "click",
    closeProfile
);


profileModal.addEventListener(
    "click",
    event => {

        if (
            event.target
            === profileModal
        ) {

            closeProfile();

        }

    }
);


function closeProfile() {

    profileModal.classList.add(
        "hidden"
    );

}


// =========================================================
// پیش‌نمایش پروفایل
// =========================================================

function updateProfilePreview() {

    const name =
        displayNameInput.value
            .trim()
        ||
        currentUser.username;


    profilePreviewName.textContent =
        name;


    profilePreviewUsername.textContent =
        `@${currentUser.username}`;


    const previewUser =
        {

            ...currentUser,

            display_name:
                name,

            avatar:
                avatarInput.value
                    .trim()

        };


    setAvatarElement(
        profileAvatarPreview,
        previewUser
    );

}


// =========================================================
// پیش‌نمایش زنده
// =========================================================

displayNameInput.addEventListener(
    "input",
    updateProfilePreview
);


avatarInput.addEventListener(
    "input",
    updateProfilePreview
);


// =========================================================
// ذخیره پروفایل
// =========================================================

profileForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const displayName =
            displayNameInput.value
                .trim();


        const bio =
            bioInput.value
                .trim();


        const avatar =
            avatarInput.value
                .trim();


        if (!displayName) {

            showProfileMessage(
                "نام نمایشی را وارد کن.",
                true
            );


            return;
        }


        try {

            const formData =
                new FormData();


            formData.append(
                "user_id",
                currentUser.id
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
                avatar
            );


            const response =
                await fetch(
                    "/profile/update",
                    {

                        method:
                            "POST",

                        body:
                            formData,

                        credentials:
                            "include"

                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                showProfileMessage(
                    data.message
                    ||
                    "ذخیره نشد.",
                    true
                );


                return;
            }


            currentUser =
                {

                    ...currentUser,

                    ...data.user

                };


            saveCurrentUser();


            renderMyProfile();


            updateProfilePreview();


            const index =
                users.findIndex(
                    user =>
                        user.id
                        === currentUser.id
                );


            if (index !== -1) {

                users[index] =
                    {

                        ...users[index],

                        ...currentUser

                    };

            }


            renderUsers();


            showProfileMessage(
                "پروفایل با موفقیت ذخیره شد.",
                false
            );


            setTimeout(
                closeProfile,
                900
            );


        } catch (error) {

            console.error(
                "Profile update error:",
                error
            );


            showProfileMessage(
                "خطا در اتصال به سرور.",
                true
            );

        }

    }
);


// =========================================================
// پیام پروفایل
// =========================================================

function showProfileMessage(
    text,
    isError
) {

    profileMessage.textContent =
        text;


    if (isError) {

        profileMessage.classList.add(
            "error"
        );

    } else {

        profileMessage.classList.remove(
            "error"
        );

    }

}


// =========================================================
// شروع
// =========================================================

connectSocket();

loadUsers();


setInterval(
    loadUsers,
    5000
);