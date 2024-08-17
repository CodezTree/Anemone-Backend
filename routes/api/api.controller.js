const mysql = require("../../database/mysql");

exports.getRoomList = (req, res, next) => {
    // 방 정보를 불러온다

    let query = `SELECT r.room_id, r.room_code, r.topic, r.scheduled_time, r.is_closed, r.average_rating, r.rating_count, 
                COUNT(ru.user_id) AS user_count
                FROM ROOMS r
                LEFT JOIN ROOM_USER ru ON r.room_id = ru.room_id
                GROUP BY r.room_id
                HAVING COUNT(ru.user_id) < 5;`;
    //let query = "INSERT INTO ROOMS (topic, scheduled_time) VALUES ( ? , ? )";
    let values = [];
    mysql.query(query, values, (err, results) => {
        if (err) {
            console.log("Error on getRoomList : " + err);

            res.status(500);
            return;
        }

        console.log("Room list up : " + results);
        res.status(200).json(results);
    });
};

exports.registerRoom = (req, res, next) => {};

exports.registerUser = (req, res, next) => {
    // 유저를 등록 (맨 처음 접속 시 임의 코드 발급 후 닉네임 등록) => 있어야 방 정보를 불러올 수 있음
};

exports.tryJoinRoom = (req, res, next) => {
    // 방 참여. 만약 등록되어 있지 않은 사용자 정보면 반려
    const userId = req.body.user_id;
    const roomId = req.body.room_id;

    if (userId == undefined || roomId == undefined) {
        res.status(400).json({
            success: false,
            message: "Unvalid Request Parameter!",
        });
        return;
    }

    // 방 참여 등록
    registerUserToRoom(roomId, userId, (err, result) => {
        if (err) {
            console.error("User registering to room failed : ", err);
            res.status(500).end();
        } else {
            res.status(200).json(result);
        }
    });
};

exports.addRoom = (req, res, next) => {
    // 새로운 방을 등록 (테스트를 위한 방)
};

exports.addUserEmailNickname = (req, res, next) => {
    // 이메일 등록해보자
    const email = req.body.email;
    const nickname = req.body.nickname;

    if (email == undefined || nickname == undefined) {
        res.status(400).end();
        return;
    }

    const query =
        "INSERT INTO LANDING_EMAIL_NICKNAME (email, nickname) VALUES (?, ?)";
    const values = [email, nickname];
    mysql.query(query, values, (err, results) => {
        if (err) {
            console.log("Survey register error : " + err);
            res.status(500).end();
            return;
        }

        res.status(200).end();
    });
};

// 방에 유저 등록 함수
function registerUserToRoom(roomId, userId, callback) {
    mysql.beginTransaction((err) => {
        if (err) {
            return callback(err);
        }

        // 1. 사용자 존재 확인
        const checkUserQuery =
            "SELECT COUNT(*) AS userExists FROM USERS WHERE user_id = ?";
        mysql.query(checkUserQuery, [userId], (err, userResults) => {
            if (err) {
                return mysql.rollback(() => {
                    callback(err);
                });
            }

            if (userResults[0].userExists === 0) {
                return mysql.rollback(() => {
                    callback(null, {
                        success: false,
                        message: "User does not exist",
                    });
                });
            }

            // 2. 방 존재 확인
            const checkRoomQuery =
                "SELECT COUNT(*) AS roomExists FROM ROOMS WHERE room_id = ?";
            mysql.query(checkRoomQuery, [roomId], (err, roomResults) => {
                if (err) {
                    return mysql.rollback(() => {
                        callback(err);
                    });
                }

                if (roomResults[0].roomExists === 0) {
                    return mysql.rollback(() => {
                        callback(null, {
                            success: false,
                            message: "Room does not exist",
                        });
                    });
                }

                // 3. 중복 등록 확인
                const checkRegistrationQuery =
                    "SELECT COUNT(*) AS alreadyRegistered FROM ROOM_USER WHERE room_id = ? AND user_id = ?";
                mysql.query(
                    checkRegistrationQuery,
                    [roomId, userId],
                    (err, regResults) => {
                        if (err) {
                            return mysql.rollback(() => {
                                callback(err);
                            });
                        }

                        if (regResults[0].alreadyRegistered > 0) {
                            return mysql.rollback(() => {
                                callback(null, {
                                    success: false,
                                    message:
                                        "User is already registered to the room",
                                });
                            });
                        }

                        // 4. 등록 실행
                        const insertQuery =
                            "INSERT INTO ROOM_USER (room_id, user_id, joined_at) VALUES (?, ?, NOW())";
                        mysql.query(
                            insertQuery,
                            [roomId, userId],
                            (err, insertResults) => {
                                if (err) {
                                    return mysql.rollback(() => {
                                        callback(err);
                                    });
                                }

                                // 커밋 실행
                                mysql.commit((err) => {
                                    if (err) {
                                        return mysql.rollback(() => {
                                            callback(err);
                                        });
                                    }
                                    callback(null, {
                                        success: true,
                                        message: "User registered successfully",
                                        insertId: insertResults.insertId,
                                    });
                                });
                            }
                        );
                    }
                );
            });
        });
    });
}
