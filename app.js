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
    "https://animon-landing-page.vercel.app",
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
const BASE_TIME = 20; //60 * 3;
const ADDITION_TIME = 30;
const FEEDBACK_TIME = 90; //60 * 1.5;
const FEEDBACK_PICK_TIME = 15; //15;

io.on("connection", (socket) => {
    console.log("a user connected:", socket.id);

    socket.on("tryJoin", (roomCode) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                users: [],
                readyCount: 0,
                sessionFunc: undefined,
                sessionStarted: false,
                terminationNotified: false,
                skipFlag: false,
                speakerId: undefined,
            };
        }

        // room 정원 5명
        if (rooms[roomCode].users.length == MAX_USER) {
            socket.emit("roomFull");
        } else if (rooms[roomCode].sessionStarted) {
            socket.emit("roomAlreadyStarted");
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
            extendVote: false, // 연장 투표 정보
        };
        rooms[roomCode].users.push(newUser);

        socket.emit("existingUsers", rooms[roomCode].users);

        console.log(
            `User ${userName} (${socket.id}) joined room ${roomCode} with animal ${animal}`
        );
        io.to(roomCode).emit("userJoined", newUser);

        socket.on("disconnect", () => {
            let room = rooms[roomCode];

            console.log("test : ", room.sessionStarted, room.readyCount);

            if (room.sessionStarted && !room.terminationNotified) {
                // room boom haha
                io.to(roomCode).emit("roomDestroyed");
                room.terminationNotified = true;
            }

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
                room.readyCount === room.users.length &&
                !room.sessionStarted
            ) {
                startSession(roomCode);
            }

            if (room.users.length === 0) {
                if (room.sessionStarted) {
                    room.sessionFunc.roomTermination();
                }

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
        if (room == undefined) {
            return;
        }

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
                rooms[data.roomCode].sessionFunc = startSession(data.roomCode);
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

    socket.on("feedbackSelect", (data) => {
        rooms[data.roomCode].sessionFunc.pickFeedbacker(
            data.feedbackUserId,
            data.roomCode
        );
    });

    socket.on("handsOnSign", (data) => {
        io.to(data.roomCode).emit("handsOnSign", data);
    });

    socket.on("turnSkip", (data) => {
        let room = rooms[data.roomCode];

        if (room) {
            // 만약 현재 speaker와 스킵 유저 id가 같으면 스킵
            if (data.userId == room.speakerId && !room.skipFlag) {
                room.skipFlag = true;
            }
        }
    });

    socket.on("interestedSpeak", (data) => {
        let room = rooms[data.roomCode];

        if (room) {
            let user = room.users.find((u) => u.userId === data.userId);

            // 투표 정보 기입
            user.extendVote = true;
        }

        // 정말 흥미롭군요!
        io.to(data.roomCode).emit("interestedSpeak");
    });
});

const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// not to turn off server
setInterval(() => {
    mysql.query("SELECT 1;", (error, results, fields) => {
        if (error) {
            console.error("쿼리 실행 중 오류: ", error);
            return;
        }
        console.log("Refresh db connection : :", results);
    });
}, 3600 * 1000); // 1 hour

function startSession(roomCode) {
    io.to(roomCode).emit("startSession");
    console.log("Room (" + roomCode + ") has started session.");

    const room = rooms[roomCode];
    if (!room || room.users.length === 0) return;

    room.sessionStarted = true;

    let currentSpeakerIndex = 0;
    let originSpeakerId = undefined; // 원래 주도권을 갖고 있는 사람 ID
    let currentTime = BASE_TIME; // 3분
    let currentFeedbackTime = FEEDBACK_TIME; // 1분 30초
    let currentFeedbackPickTime = FEEDBACK_PICK_TIME; // 15초

    // Intervals
    let feedbackPickTimer;
    let feedbackTimer;
    let speakTimer;

    function nextSpeaker() {
        // selection invisible
        io.to(roomCode).emit("pickButtonDisable");

        if (currentSpeakerIndex < room.users.length) {
            const currentSpeaker = room.users[currentSpeakerIndex];
            io.to(roomCode).emit("updateSpeaker", {
                speakerId: currentSpeaker.userId,
                isOriginSpeaker: true,
            });

            originSpeakerId = currentSpeaker.userId;
            room.speakerId = currentSpeaker.userId;

            console.log(
                "Room " + roomCode + " new speaker : " + originSpeakerId
            );

            // 발언 시간 타이머
            speakTimer = setInterval(() => {
                currentTime--;
                io.to(roomCode).emit("updateTimer", {
                    timeLeft: currentTime,
                    feedback: 0, // Speaker Time
                    originId: originSpeakerId,
                });

                if (currentTime <= 0 || room.skipFlag) {
                    // 연장 상태 확인
                    let extendCount = 0;
                    room.users.forEach((user) => {
                        if (user.extendVote) extendCount++;
                    });
                    // 스피커 제외 유저 과반수 이상 찬성인 경우
                    if (
                        extendCount >=
                            Math.floor((room.users.length - 1) / 2) &&
                        !room.skipFlag
                    ) {
                        currentTime += ADDITION_TIME; // 추가 시간
                        io.to(roomCode).emit("speakExtended");

                        // 유저 흥미 초기화
                        room.users.forEach((user) => {
                            user.extendVote = false;
                        });
                        return;
                    }

                    // 스킵 원래대로
                    room.skipFlag = false;

                    console.log(
                        "Room " +
                            roomCode +
                            " speaking time end. Current Origin : " +
                            originSpeakerId
                    );
                    clearInterval(speakTimer);

                    // 피드백 유저 선택 타이머
                    feedbackPickTimer = feedbackPickerStart();
                }
            }, 1000);
        } else {
            io.to(roomCode).emit("sessionEnded");
            console.log("Room " + roomCode + " session has ended!");

            return;
        }
    }

    // 여기가 호출 됐다는 것은 선택 타이머를 초기화 시켜야 함을 의미. 피드백 유저가 선택 됨.
    function pickFeedbacker(feedbackId, _roomCode) {
        // selection invisible
        io.to(_roomCode).emit("pickButtonDisable");

        console.log(
            "Room " +
                _roomCode +
                " speaker selected feedback User (" +
                feedbackId +
                ")"
        );
        currentFeedbackTime = FEEDBACK_TIME;
        currentFeedbackPickTime = FEEDBACK_PICK_TIME;

        // 선택 타이머 종료
        clearInterval(feedbackPickTimer);

        // 선택된 유저로 발언 상태 변경
        io.to(_roomCode).emit("updateSpeaker", {
            speakerId: feedbackId,
            isOriginSpeaker: false,
        });
        room.speakerId = feedbackId;

        // 피드백 시간 타이머
        feedbackTimer = setInterval(() => {
            currentFeedbackTime--;
            io.to(_roomCode).emit("updateTimer", {
                timeLeft: currentFeedbackTime,
                feedback: 2, // Feedback Time
                originId: originSpeakerId,
            });

            if (currentFeedbackTime <= 0 || room.skipFlag) {
                // 연장 상태 확인
                let extendCount = 0;
                room.users.forEach((user) => {
                    if (user.extendVote) extendCount++;
                });
                // 스피커 제외 유저 과반수 이상 찬성인 경우
                if (
                    extendCount >= Math.floor((room.users.length - 1) / 2) &&
                    !room.skipFlag
                ) {
                    currentFeedbackTime += ADDITION_TIME; // 추가 시간
                    io.to(_roomCode).emit("speakExtended");

                    // 유저 흥미 초기화
                    room.users.forEach((user) => {
                        user.extendVote = false;
                    });
                    return;
                }

                // 스킵 원래대로
                room.skipFlag = false;

                console.log(
                    "Room " +
                        _roomCode +
                        " feedback time end. Current Origin : " +
                        originSpeakerId
                );
                currentFeedbackTime = FEEDBACK_TIME;
                currentFeedbackPickTime = FEEDBACK_PICK_TIME;

                clearInterval(feedbackTimer);

                // 만약 이 함수의 호출자면 (즉 피드백 턴 돌아온 사람이 원래 speaker인 사람이면) 다시 선택권으로 넘어가
                if (feedbackId == originSpeakerId) {
                    feedbackPickTimer = feedbackPickerStart();
                } else {
                    // 선택된 유저였다면
                    // 바로 다시 원래 speaker 유저에게 피드백 넘김
                    pickFeedbacker(originSpeakerId, _roomCode);
                }
            }
        }, 1000);
    }

    function feedbackPickerStart() {
        const interval = setInterval(() => {
            currentFeedbackPickTime--;
            io.to(roomCode).emit("updateTimer", {
                timeLeft: currentFeedbackPickTime,
                feedback: 1, // Feedback Pick
                originId: originSpeakerId, // 원래 스피커 정보 -> 선택 활성화
            });

            if (currentFeedbackPickTime <= 0 || room.skipFlag) {
                // 스킵 원래대로
                room.skipFlag = false;

                console.log(
                    "Room " +
                        roomCode +
                        " feedback pick time end. Current Origin : " +
                        originSpeakerId
                );
                clearInterval(feedbackPickTimer);

                // Skip to next speaker
                currentSpeakerIndex++;

                // Reset Timer Values
                currentFeedbackPickTime = FEEDBACK_PICK_TIME;
                currentTime = BASE_TIME;
                currentFeedbackTime = FEEDBACK_TIME;
                nextSpeaker();
            }
        }, 1000);

        return interval;
    }

    function roomTermination() {
        clearInterval(speakTimer);
        clearInterval(feedbackTimer);
        clearInterval(feedbackPickTimer);
    }

    nextSpeaker();

    return {
        pickFeedbacker: pickFeedbacker,
        roomTermination: roomTermination,
    };
}
