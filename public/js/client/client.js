// Wait for the page to finish loading before starting initialization.
window.onload = function() {
	init();
	animate();
};

// Initialize.
var socket = io('http://localhost:3000/');
var lagWorker = new Worker('../js/client/lagger.js');
var scene, camera, renderer;
var geometry, material, mesh;
function init() {
	scene = new THREE.Scene();

	var renderWidth = window.innerWidth;
	var renderHeight = window.innerHeight;

	camera = new THREE.OrthographicCamera(renderWidth / -2, renderWidth / 2, renderHeight / 2, renderHeight / -2, 1, 1000);
	camera.position.z = 1000;

	var scale = 30;
	geometry = new THREE.BoxGeometry(scale, scale, scale);
	material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
	mesh = new THREE.Mesh(geometry, material);
	scene.add(mesh);

	renderer = new THREE.WebGLRenderer();
	renderer.setSize(renderWidth, renderHeight);

	document.body.appendChild(renderer.domElement);
}

// Animation variables.
var fps = 60;
var now;
var then = Date.now();
var interval = 1000 / fps;
var delta;
var start = Date.now();
var timeSinceUpdate = 0;
function animate() {

	// Physics loop, runs on fixed interval.
	now = Date.now();
	delta = now - then;
	timeSinceUpdate = (now - start);
	if (delta > interval) {
		then = now - (delta % interval);

		// Run the fixed update function.
		update(delta);
		timeSinceUpdate = 0;
		start = now;
	}

	// Interpolate between two states.
	if (primed === 2) {
		position = olderPosition.lerp(oldPosition, (timeSinceUpdate / interval));
	}

	// Render objects at their positions.
	mesh.position.x = position.x;
	mesh.position.y = position.y;
	mesh.position.z = position.z;

	renderer.render(scene, camera);

	requestAnimationFrame(animate);
}

// Physics settings.
var speed = (400 / fps);
var position = new THREE.Vector3();
var remotePosition = new THREE.Vector3();

// The timestamp of the most recent message sent to the server.
var acknowledgementBuffer = [];

// Send off the server state, add artificial delay if debugging is enabled.
var simulateLag = false;
var pingMin = 150;
var pingMax = 300;
var sendState = function(state) {

	// Stamp the message.
	var now = Date.now();
	var message = { clientTime: now, state: state };

	// Post a message to be emitted on delay by web worker.
	if (simulateLag) {
		var delay = Math.floor(Math.random() * (pingMax - pingMin + 1)) + pingMin;
		lagWorker.postMessage({
			delay: delay,
			message: message
		});
	} else {

		// If not delaying, directly emit.
		socket.emit('client_in', message);
	}

	// Add this state to the buffer until it has been acknowledged by the server.
	acknowledgementBuffer.push({ sendTime: now, state: state });
};

// The fixed update function for processing input and physics.
var debugDelay = false;
var debugPing = 1000;
var debugTransmitRate = (debugPing / 1000) * fps;
var debugTransmitCount = 0;
var tickCount = 0;

var messagesIn = [];

var sendMessage = function (lag_ms, message) {
	messages.push({ recv_ts: + new Date() + lag_ms, payload: message });
}

var receive = function () {
	var now = +new Date();
	for (var i = 0; i < messages.length; i++) {
		var message = messages[i];
		if (message.recv_ts <= now) {
			messages.splice(i, 1);
			return message.payload;
		}
	}
}

function update(delta) {

	if (tickCount % fps == 0) {
		console.log("tick: " + tickCount);
	}
	tickCount++;

	// Fetch the state of the keys.
	var keyState = {
		left: isLeft,
		up: isUp,
		right: isRight,
		down: isDown
	};

	// Send the state of the keys to the server.
	var state = { keys: keyState };
	if (debugDelay) {
		if (debugTransmitCount >= debugTransmitRate) {
			debugTransmitCount = 0;
			sendState(state);
		}
	} else {
		sendState(state);
	}
	debugTransmitCount++;

	// Replay from authoritative state
	// processServerUpdate();

	// Perform client-side prediction to smooth motion.
	/*
	if (isUp) {
		position.y += speed;
	}
	if (isDown) {
		position.y -= speed;
	}
	if (isRight) {
		position.x += speed;
	}
	if (isLeft) {
		position.x -= speed;
	}
	*/

	// Interpolate to the remote authority.
	/*
	var difference = new THREE.Vector3();
	difference = remotePosition.sub(position);
	var threshold = 1;
	if (remotePosition.distanceTo(position) < threshold) {
		position.x = remotePosition.x;
		position.y = remotePosition.y;
		position.z = remotePosition.z;
	} else {
		console.log("diff- " + JSON.stringify(difference) + ", delta- " + delta);
		position = position.add(difference.multiplyScalar((delta / 1000) * 1));
	}
	*/
}

// Event handlers on server signals.
// Receive input from clients, reposition mesh.
var primed = 0;
var oldPosition = new THREE.Vector3();
var olderPosition = new THREE.Vector3();

var outputBuffer = [];
socket.on('client_pos', function (data) {

	// console.log("Pre: " + acknowledgementBuffer.length);

	// Discard all stale state per server
	var time = data.sendTime;
	var newAckBuffer = [];
	for (var i = 0; i < acknowledgementBuffer.length; i++) {
		var message = acknowledgementBuffer[i];
		// console.log(message.sendTime + ", " + time);
		if (message.sendTime > time) {
			newAckBuffer.push(message);
		}
	}
	acknowledgementBuffer = newAckBuffer;

	// Grab the last authoritative state and apply locally-predicted updates since.
	var newPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
	var authPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);

	// console.log("Unacknowledged messages: " + acknowledgementBuffer.length);
	/*
	if (acknowledgementBuffer.length > 0) {
		for (var i = 0; i < acknowledgementBuffer.length; i++) {
			var message = acknowledgementBuffer[i];
			// console.log("Applying: " + JSON.stringify(message));
			// Perform client-side prediction to smooth motion.
			if (message.state.keys.up) {
				// console.log("ack up");
				newPos.y += speed;
			}
			if (message.state.keys.down) {
				newPos.y -= speed;
			}
			if (message.state.keys.right) {
				newPos.x += speed;
			}
			if (message.state.keys.left) {
				newPos.x -= speed;
			}
		}
	}
	*/

	// console.log("position: " + JSON.stringify(position) + ", authPos: " + JSON.stringify(authPos) + ", newPos: " + JSON.stringify(newPos));

	// Establish interpolation
	if (primed === 0) {
		olderPosition.x = newPos.x;
		olderPosition.y = newPos.y;
		olderPosition.z = newPos.z;
		primed = 1;
	} else if (primed === 1) {
		oldPosition.x = newPos.x;
		oldPosition.y = newPos.y;
		oldPosition.z = newPos.z;
		primed = 2;
	} else {
		olderPosition.x = oldPosition.x;
		olderPosition.y = oldPosition.y;
		olderPosition.z = oldPosition.z;
		oldPosition.x = newPos.x;
		oldPosition.y = newPos.y;
		oldPosition.z = newPos.z;
	}
});

// Keyboard flags.
var isLeft = false;
var isUp = false;
var isRight = false;
var isDown = false;
document.onkeydown = function(e) {
	switch (e.keyCode) {
		case 37:
			isLeft = true;
			break;
		case 38:
			isUp = true;
			break;
		case 39:
			isRight = true;
			break;
		case 40:
			isDown = true;
			break;
	}
};
document.onkeyup = function(e) {
	switch (e.keyCode) {
		case 37:
			isLeft = false;
			break;
		case 38:
			isUp = false;
			break;
		case 39:
			isRight = false;
			break;
		case 40:
			isDown = false;
			break;
	}
};