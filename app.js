const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const mysql = require("./database/mysql");

// CORS
const cors = require("cors");
const allowlist = [
    "https://codeztree.xyz",
    "http://localhost:3333",
    "https://animon-landing-page.vercel.app/",
    "http://localhost:5500",
];

const corsOptionsDelegate = function (req, callback) {
    var corsOptions;
    if (allowlist.indexOf(req.header("Origin")) !== -1) {
        corsOptions = { origin: true };
    } else {
        corsOptions = { origin: false };
    }
    callback(null, corsOptions);
};

var apiRouter = require("./routes/api");

app.use(express.static("public"));

app.use(cors(corsOptionsDelegate));
app.use(express.json());
app.use("/api", apiRouter);

// 방별로 유저를 관리하기 위한 객체
const rooms = {};

const MAX_USER = 5;
const BASE_TIME = 60 * 3;
const ADDITION_TIME = 30;
const ADVICE_TIME = 60 * 1.5;
const timer_time = 0;

io.on("connection", (socket) => {
    console.log("a user connected:", socket.id);

    socket.on("tryJoin", (roomCode) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { users: [], readyCount: 0 };
        }

        // room 정원 5명
        if (rooms[roomCode].users.length == MAX_USER) {
            socket.emit("roomFull");
        } else {
            socket.emit("joinOK", roomCode);
        }
    });

    socket.on("joinRoom", ({ roomCode, userName, animal }) => {
        socket.join(roomCode);

        const newUser = {
            userId: socket.id,
            userName: userName,
            isMicOn: false,
            isReady: false,
            animal: animal, // 사용자가 선택한 동물 정보 추가
        };
        rooms[roomCode].users.push(newUser);

        socket.emit("existingUsers", rooms[roomCode].users);

        console.log(
            `User ${userName} (${socket.id}) joined room ${roomCode} with animal ${animal}`
        );
        io.to(roomCode).emit("userJoined", newUser);

        socket.on("disconnect", () => {
            let room = rooms[roomCode];

            room.users = room.users.filter((user) => user.userId !== socket.id);
            // 준비 된 유저 다시 계산
            room.readyCount = room.users.filter((user) => user.isReady).length;

            io.to(roomCode).emit("userLeft", { userId: socket.id });
            console.log(
                `User ${userName} (${socket.id}) left room ${roomCode}`
            );

            // 인원이 줄어든 후에도 남아있는 모든 사용자가 준비되었는지 확인
            if (
                room.users.length > 2 &&
                room.readyCount === room.users.length
            ) {
                io.to(roomCode).emit("startSession");
            }

            if (room.users.length === 0) {
                delete rooms[roomCode]; // 방에 사용자가 없으면 방 삭제
            }
        });
    });

    socket.on("sendAdminNotice", ({ roomCode, notice }) => {
        io.to(roomCode).emit("adminNotice", notice);
        console.log(`Admin notice sent to room ${roomCode}: ${notice}`);
    });

    socket.on("syncState", (data) => {
        io.to(data.to).emit("syncState", data);
    });

    socket.on("changeExpression", (data) => {
        io.to(data.roomCode).emit("changeExpression", data);
    });

    socket.on("toggleMic", (data) => {
        io.to(data.roomCode).emit("toggleMic", data);
    });

    socket.on("toggleReady", (data) => {
        const room = rooms[data.roomCode];
        const user = room.users.find((u) => u.userId === data.userId);

        if (user) {
            user.isReady = data.isReady;
            if (data.isReady) {
                room.readyCount++;
            } else {
                room.readyCount--;
            }

            io.to(data.roomCode).emit("toggleReady", data);

            // 모든 사용자 준비되면 세션 시작
            if (room.readyCount === room.users.length && room.readyCount > 2) {
                io.to(data.roomCode).emit("startSession");
            }
        }
    });

    socket.on("roomMessage", (data) => {
        if (data.message.length > 1000) {
            data.message =
                "<span style='color:red;'><b>Deleted.</b></span> Too Long Message.";
        }
        io.to(data.roomCode).emit("roomMessage", data);
    });

    // WebRTC signaling
    socket.on("offer", (data) => {
        io.to(data.to).emit("offer", data);
    });

    socket.on("answer", (data) => {
        io.to(data.to).emit("answer", data);
    });

    socket.on("candidate", (data) => {
        io.to(data.to).emit("candidate", data);
    });
});

const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
