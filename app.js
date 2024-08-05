const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const socketIO = require("socket.io");

const port = process.env.PORT || 3333;
const io = socketIO(server);

app.get("/", (req, res) => {
    console.log("client");
    res.sendFile(__dirname + "/webapp/index.html");
});

io.on("connection", function (socket) {
    console.log("client connected");

    socket.emit("hello", "server says hello");
    socket.on("click", function (data) {
        console.log("client click:", data);
        socket.emit("clickResponse", "success");
        io.emit("clickResponse", "io success : " + data);
    });
});

server.listen(port, () => {
    console.log(`App listening on port ${port}`);
});
