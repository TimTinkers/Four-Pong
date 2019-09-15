// Imports and setup.
var express = require('express');
var app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'))
var server = require('http').Server(app);
var io = require('socket.io')(server);
var THREE = require('three');

// Serve the landing page.
app.get('/', function(req, res){
	res.render('index');
});

// Start the server.
server.listen(3000, function() {
	console.log("Web test server on 3000.");
});

// Helper function to compute the latency of a client.
var latStampOne = -1;
var latStampTwo = -1;
var latency = 0;
var computeLatency = function () {
	if (latStampOne === -1) {
		latStampOne = Date.now();
	} else if (latStampTwo === -1) {
		latStampTwo = Date.now();
	} else {
		latency = latStampTwo - latStampOne;
		latStampOne = latStampTwo;
		latStampTwo = Date.now();
	}
};

// Data from players.
var position = new THREE.Vector3();
var playerKeys = { up: false, down: false, left: false, right: false };
var mostRecentMessage = -1;
var mostRecentClientStamp = -1;

// Handle SocketIO events.
io.on('connection', function (socket) {

	// Receive input from clients; estimate when they sent it.
	socket.on('client_in', function (data) {
		computeLatency();
		mostRecentClientStamp = data.clientTime;
		playerKeys = data.state.keys;
	});
});

// Server loop logic.
var fps = 60;
var interval = 1000 / fps;
var previousTick = Date.now();
var actualTicks = 0;
var gameLoop = function () {
	var now = Date.now();
	actualTicks++;
	if (previousTick + interval <= now) {
		var delta = (now - previousTick) / 1000;
		previousTick = now;

		// Trigger the server update.
		update(delta);
		actualTicks = 0;
	}

	// Decide whether to fallback on setImmediate or continue with setTimeout.
	if (Date.now() - previousTick < interval - 16) {
		setTimeout(gameLoop);
	} else {
		setImmediate(gameLoop);
	}
};

// Physics settings.
var speed = (400 / fps);

// The server update function.
var debugDelay = false;
var debugPing = 100;
var debugTransmitRate = (debugPing / 1000) * fps;
var debugTransmitCount = 0;
var update = function(delta) {

	// Compute the new position.
	if (playerKeys.up) {
		position.y += speed;
		console.log(Date.now() + " up " + JSON.stringify(position));
	}
	if (playerKeys.down) {
		position.y -= speed;
		console.log(Date.now() + " down " + JSON.stringify(position));
	}
	if (playerKeys.right) {
		position.x += speed;
	}
	if (playerKeys.left) {
		position.x -= speed;
	}

	// Send the position update.
	var sendTime = mostRecentClientStamp;
	mostRecentMessage = (Date.now() - latency);
	var diff = mostRecentMessage - mostRecentClientStamp;
	var threshold = 100; // 100ms
	if (Math.abs(diff) < threshold) {
		// console.log("Trusting this stamp: " + diff);
	} else {
		// console.log("Not trusting this stamp.");
		// sendTime = mostRecentMessage;
	}

	// mostRecentMessage = 0;
	if (debugDelay) {
		if (debugTransmitCount >= debugTransmitRate) {
			debugTransmitCount = 0;
			io.emit('client_pos', { position: position, sendTime: sendTime });
		}
	} else {
		console.log(sendTime + " Sending position: " + JSON.stringify(position));
		io.emit('client_pos', { position: position, sendTime: sendTime });
	}
	debugTransmitCount++;

	// Latency debug info.
	// console.log("Latency: " + latency);
};

// Start the server.
gameLoop();