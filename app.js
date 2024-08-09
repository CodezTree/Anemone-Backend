const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

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
            rooms[roomCode] = [];
        }

        // room 정원 5명
        if (rooms[roomCode].length == 5) {
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
            animal: animal, // 사용자가 선택한 동물 정보 추가
        };
        rooms[roomCode].push(newUser);

        socket.emit("existingUsers", rooms[roomCode]);

        console.log(
            `User ${userName} (${socket.id}) joined room ${roomCode} with animal ${animal}`
        );
        io.to(roomCode).emit("userJoined", newUser);

        socket.on("disconnect", () => {
            rooms[roomCode] = rooms[roomCode].filter(
                (user) => user.userId !== socket.id
            );
            io.to(roomCode).emit("userLeft", { userId: socket.id });
            console.log(
                `User ${userName} (${socket.id}) left room ${roomCode}`
            );
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
        io.to(data.roomCode).emit("toggleReady", data);
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
