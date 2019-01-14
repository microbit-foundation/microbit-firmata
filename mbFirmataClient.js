/* Tasks:
  [ ] discover port for board
  [ ] open port
  [ ] initialize
  [x] read and parse incoming messages
  [ ] callback event handlers
  [ ] keep track of sensor/pin state
  [ ] provide API for sensor/pin state
  [ ] API for commands
*/

// .load mbFirmataClient.js
// openSerialPort("/dev/cu.usbmodem1422")
// myPort.write([0xF9, 0, 0]) // get version
// myPort.write([0xF0, 0x7A, 50, 0, 0xF7]) // mapping interval: 1280 msecs
// myPort.write([0xC5, 1]) // turn on channel 5
// myPort.write([0xC5, 0]) // turn on channel 5

// Firamata Messages

const STREAM_ANALOG				= 0xC0; // enable/disable streaming of an analog channel
const STREAM_DIGITAL			= 0xD0; // enable/disable streaming of a digital port
const ANALOG_UPDATE				= 0xE0; // analog channel update
const DIGITAL_UPDATE			= 0x90; // digital port update

const SET_PIN_MODE				= 0xF4; // set pin mode
const SET_DIGITAL_PIN			= 0xF5; // set pin value
const FIRMATA_VERSION			= 0xF9; // request/report major and minor Firmata protocol version
const SYSTEM_RESET				= 0xFF; // reset Firmata

// Firamata Sysex Messages

const SYSEX_START				= 0xF0
const SYSEX_END					= 0xF7

const ANALOG_MAPPING_QUERY		= 0x69; // ask for mapping of analog to pin numbers
const ANALOG_MAPPING_RESPONSE	= 0x6A; // reply with mapping info
const CAPABILITY_QUERY			= 0x6B; // ask for supported modes and resolution of all pins
const CAPABILITY_RESPONSE		= 0x6C; // reply with supported modes and resolution
const PIN_STATE_QUERY			= 0x6D; // ask for a pin's current mode and state (different than value)
const PIN_STATE_RESPONSE		= 0x6E; // reply with a pin's current mode and state (different than value)
const EXTENDED_ANALOG_WRITE		= 0x6F; // analog write (PWM, Servo, etc) to any pin

const STRING_DATA				= 0x71; // send a string (UTF-8)
const REPORT_FIRMWARE			= 0x79; // firmware version and name
const SAMPLING_INTERVAL			= 0x7A; // set milliseconds between streamed analog samples

// BBC micro:bit Sysex Messages (0x01-0x0F)

const MB_DISPLAY_CLEAR			= 0x01
const MB_DISPLAY_SHOW			= 0x02
const MB_DISPLAY_PLOT			= 0x03
const MB_SCROLL_STRING			= 0x04
const MB_SCROLL_NUMBER			= 0x05
// 0x06-0x0C reserved for additional micro:bit messages
const MB_REPORT_EVENT			= 0x0D
const MB_DEBUG_STRING			= 0x0E
const MB_EXTENDED_SYSEX			= 0x0F; // can be used to add 128 additional micro:bit messages

// Firmata Pin Modes

const DIGITAL_INPUT				= 0x00
const DIGITAL_OUTPUT			= 0x01
const ANALOG_INPUT				= 0x02
const PWM						= 0x03
const INPUT_PULLUP				= 0x0B
const INPUT_PULLDOWN			= 0x0F; // micro:bit extension; not defined in standard Firmata

// Serial Port

var serialport = require('serialport');
var myPort;

function openSerialPort(portName) {
	myPort = new serialport(portName, { baudRate: 57600 });
	myPort.on('data', receivedSerialData);
}

function receivedSerialData(data) {
	if ((inbufCount + data.length) < inbuf.length) {
		inbuf.set(data, inbufCount);
		inbufCount += data.length;
		processFirmatCommands();
	}
}

// Incoming Message Buffer

var inbuf = new Uint8Array(30); // xxx 1000
var inbufCount = 0;

function showInbuf() {
	s = ("inbuf(" + inbufCount + ")[");
	for (var i = 0; i < inbufCount; i++) {
		s = s + " " + inbuf[i];
	}
	console.log(s + "]");
}

// Process Incoming Firmata Messages

function processFirmatCommands() {
	// Process and remove all complete Firmata commands in inbuf.

	if (!inbufCount) return; // nothing received
	var cmdStart = 0;
	while (true) {
		cmdStart = findCmdByte(cmdStart);
		if (cmdStart < 0) {; // no more commands
			inbufCount = 0;
			return;
		}
		var skipBytes = processCommandAt(cmdStart);
		if (skipBytes < 0) {
			// command at cmdStart is incomplete: remove processed commands and exit
			if (0 == cmdStart) return; // cmd is already at start of inbuf
			var remainingBytes = (inbufCount - cmdStart) + 1;
			inbuf.copyWithin(0, cmdStart, cmdStart + remainingBytes);
			inbufCount = remainingBytes;
			return;
		}
		cmdStart += skipBytes;
	}
}

function findCmdByte(startIndex) {
	for (var i = startIndex; i < inbufCount; i++) {
		if (inbuf[i] & 0x80) return i;
	}
	return -1;
}

function processCommandAt(cmdStart) {
	// Attempt to process the command starting at the given index in inbuf.
	// If the command is incomplete, return -1.
	// Otherwise, process it and return the number of bytes in the entire command.

	var cmdByte = inbuf[cmdStart];
	var chanCmd = cmdByte & 0xF0;
	var argBytes = 0;
	var nextCmdIndex = findCmdByte(cmdStart + 1);
	if (nextCmdIndex < 0) {; // no next command; current command may not be complete
		if (SYSEX_START == cmdByte) return -1; // incomplete sysex
		argBytes = inbufCount - (cmdStart + 1);
		var argsNeeded = 2;
		if (0xFF == cmdByte) argsNeeded = 0;
		if ((0xC0 == chanCmd) || (0xD0 == chanCmd)) argsNeeded = 1;
		if (argBytes < argsNeeded) return -1;
	} else {
		argBytes = nextCmdIndex - (cmdStart + 1);
	}

	if (SYSEX_START == cmdByte) {; // system exclusive message: SYSEX_START ...data ... SYSEX_END
		if (SYSEX_END != inbuf[cmdStart + argBytes + 1]) {
			// error: last byte is not SYSEX_END; skip this message
			return argBytes + 1; // skip cmd + argBytes
		}
		dispatchSysexCommand(cmdStart + 1, argBytes - 1);
		return argBytes + 2; // skip cmd, arg bytes, and final SYSEX_END
	}

	var chan = cmdByte & 0xF;
	var arg1 = (argBytes > 0) ? inbuf[cmdStart + 1] : 0;
	var arg2 = (argBytes > 1) ? inbuf[cmdStart + 2] : 0;

	if (DIGITAL_UPDATE == chanCmd) receivedDigitalUpdate(chan, (arg1 | (arg2 << 7)));
	if (ANALOG_UPDATE == chanCmd) receivedAnalogUpdate(chan, (arg1 | (arg2 << 7)));
	if (FIRMATA_VERSION == cmdByte) receivedFirmataVersion(arg1, arg2);

	return argBytes + 1;
}

// Firmata Messages

function receivedDigitalUpdate(chan, pinMask) {
	console.log("receivedDigitalUpdate", chan, pinMask);
}

function receivedAnalogUpdate(chan, value) {
	console.log("analog[" + chan + "]", value);
}

function receivedFirmataVersion(major, minor) {
	console.log("Firmata " + major + "." + minor);
}

// System Exclusive Messages

function dispatchSysexCommand(sysexStart, argBytes) {
	var sysexCmd = inbuf[sysexStart];
	switch (sysexCmd) {
	case MB_REPORT_EVENT:
		receivedEvent(sysexStart, argBytes);
		break;
	case MB_DEBUG_STRING:
		var buf = inbuf.slice(sysexStart + 1, sysexStart + 1 + argBytes);
		console.log("DB: " + new TextDecoder().decode(buf));
		break;
	case REPORT_FIRMWARE:
		receivedFirmwareVersion(sysexStart, argBytes);
		break;
	}
}

function receivedEvent(sysexStart, argBytes) {
	var sourceID = (inbuf[sysexStart + 2] << 7) | inbuf[sysexStart + 1];
	var eventID = (inbuf[sysexStart + 4] << 7) | inbuf[sysexStart + 3];
	console.log("receivedEvent", sourceID, eventID);
}

function receivedFirmwareVersion(sysexStart, argBytes) {
	console.log("receivedFirmwareVersion", sysexStart, argBytes);
}

function displayClear() {
	myPort.write([SYSEX_START, MB_DISPLAY_CLEAR, SYSEX_END]);
}

function displayPlot(x, y, level) {
	myPort.write([SYSEX_START, MB_DISPLAY_PLOT, x, y, level, SYSEX_END]);
}

// inbuf.set([0xFF, 0xF4, 1, 2, SYSEX_START, MB_DEBUG_STRING, 65, 66, 67, SYSEX_END]);
// inbufCount = 10;
// processFirmatCommands();
openSerialPort("/dev/cu.usbmodem1422");
