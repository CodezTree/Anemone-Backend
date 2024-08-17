var express = require("express");
var router = express.Router();
var controller = require("./api.controller");

/* Route Listing */
router.get("/getRoomList", controller.getRoomList);

router.post("/tryJoinRoom", controller.tryJoinRoom);

router.post("/addUserEmailNickname", controller.addUserEmailNickname);

module.exports = router;
