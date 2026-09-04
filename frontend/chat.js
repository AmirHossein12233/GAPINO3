const API = "http://localhost:8000";

const WS = "ws://localhost:8000";



let currentUser = null;

let selectedUser = null;

let socket = null;


let replyMessage = null;


let mediaRecorder = null;

let audioChunks = [];

let recording = false;






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
// LOAD USER
// =========================


async function loadMe(){


    const res =
    await fetch(
        API + "/me",
        {
            credentials:"include"
        }
    );


    const data =
    await res.json();


    if(!data.success){

        location.href="/login.html";

        return;

    }


    currentUser =
    data.user;


    connectSocket();


    loadUsers();

}







// =========================
// USERS
// =========================


async function loadUsers(){


    const res =
    await fetch(

        API + "/users",

        {
            credentials:"include"
        }

    );


    const data =
    await res.json();



    usersList.innerHTML="";



    (data.users || []).forEach(user=>{


        if(user.id === currentUser.id)
            return;



        const div =
        document.createElement("div");



        div.className =
        "user-item";



        div.innerHTML = `

        <b>${user.username}</b>

        <br>

        <small>

        ${user.online ? "🟢 آنلاین":"⚪ آفلاین"}

        </small>

        `;



        div.onclick=()=>{

            selectUser(user);

        };



        usersList.appendChild(div);


    });


}







// =========================
// SELECT USER
// =========================


async function selectUser(user){


    selectedUser =
    user;


    chatHeader.innerText =
    user.username;


    messages.innerHTML="";


    loadMessages();

}







// =========================
// LOAD HISTORY
// =========================


async function loadMessages(){


    if(!selectedUser)
        return;



    const res =
    await fetch(

        API +
        "/messages/" +
        selectedUser.id,

        {
            credentials:"include"
        }

    );



    const data =
    await res.json();



    messages.innerHTML="";



    (data.messages || []).forEach(

        msg=>showMessage(msg)

    );


}

// =========================
// SHOW MESSAGE
// =========================


function showMessage(msg){


    const div =
    document.createElement("div");


    div.className =
    "message-item";



    let content="";



    if(msg.deleted){


        content =
        "پیام حذف شده";

    }

    else{


        content =
        msg.text || "";



        if(msg.file){


            if(
                msg.file_type &&
                msg.file_type.startsWith("audio")
            ){


                content += `

                <br>

                <audio controls src="${API}${msg.file}"></audio>

                `;


            }

            else{


                content += `

                <br>

                <img src="${API}${msg.file}">

                `;


            }


        }


    }






    div.innerHTML = `

        ${content}

        <span class="message-time">

        ${msg.time || ""}

        ${msg.seen ? " ✓✓":""}

        </span>


        <button onclick="replyMsg('${msg.id}')">

        ↩

        </button>


    `;





    messages.appendChild(div);


    messages.scrollTop =
    messages.scrollHeight;


}








// =========================
// REPLY
// =========================


window.replyMsg=function(id){


    replyMessage=id;


    replyBox.style.display="flex";


    replyText.innerText =
    "پاسخ به پیام";



}






cancelReply.onclick=function(){


    replyMessage=null;


    replyBox.style.display="none";


}







// =========================
// WEBSOCKET
// =========================


function connectSocket(){


    socket =
    new WebSocket(

        WS +
        "/ws/" +
        currentUser.id

    );





    socket.onopen=()=>{


        console.log(
            "GAPINO connected"
        );


    };






    socket.onmessage=(e)=>{


        const data =
        JSON.parse(e.data);



        if(data.type==="message"){


            showMessage(
                data.message
            );


        }



    };





    socket.onclose=()=>{


        setTimeout(

            connectSocket,

            3000

        );


    };



}








// =========================
// SEND MESSAGE
// =========================


sendBtn.onclick=function(){


    sendMessage();


};





input.addEventListener(

"keydown",

(e)=>{


    if(e.key==="Enter"){


        sendMessage();


    }


});







function sendMessage(){


    if(!selectedUser)
        return;



    const text =
    input.value.trim();




    if(!text)
        return;





    socket.send(JSON.stringify({


        type:"message",


        receiver:
        selectedUser.id,


        text:text,


        reply_to:
        replyMessage



    }));





    input.value="";


    replyMessage=null;


    replyBox.style.display="none";


}







// =========================
// IMAGE UPLOAD
// =========================


photoBtn.onclick=function(){


    fileInput.click();


};






fileInput.onchange=async function(){


    const file =
    fileInput.files[0];



    if(!file)
        return;



    const form =
    new FormData();



    form.append(
        "file",
        file
    );



    const res =
    await fetch(

        API+"/upload",

        {

            method:"POST",

            body:form,

            credentials:"include"

        }

    );



    const data =
    await res.json();





    socket.send(JSON.stringify({


        type:"message",


        receiver:
        selectedUser.id,


        file:
        data.url,


        file_type:
        file.type



    }));


};








// =========================
// VOICE RECORD
// =========================


voiceBtn.onclick=async function(){


    if(recording){

        mediaRecorder.stop();

        recording=false;

        voiceBtn.innerText="🎤";

        return;

    }



    const stream =
    await navigator.mediaDevices.getUserMedia({

        audio:true

    });



    mediaRecorder =
    new MediaRecorder(stream);



    audioChunks=[];



    mediaRecorder.ondataavailable=e=>{


        audioChunks.push(e.data);


    };




    mediaRecorder.onstop=async()=>{


        const blob =
        new Blob(
            audioChunks,
            {
                type:"audio/webm"
            }
        );



        const file =
        new File(
            [blob],
            "voice.webm"
        );



        const form =
        new FormData();



        form.append(
            "file",
            file
        );




        const res =
        await fetch(

            API+"/upload",

            {

            method:"POST",

            body:form,

            credentials:"include"

            }

        );




        const data =
        await res.json();





        socket.send(JSON.stringify({


            type:"message",


            receiver:
            selectedUser.id,


            file:
            data.url,


            file_type:
            "audio/webm"



        }));



    };





    mediaRecorder.start();



    recording=true;


    voiceBtn.innerText="⏹";


};








// START

loadMe();