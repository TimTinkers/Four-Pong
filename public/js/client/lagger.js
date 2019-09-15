importScripts('/socket.io/socket.io.js');
var socket = io('http://localhost:3000');

onmessage = function (event) {
	var delayPacket = event.data;
	var delay = delayPacket.delay;
	var message = delayPacket.message;

	setTimeout(function () {
		socket.emit('client_in', message);
	}, delay);
};