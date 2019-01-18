/* Tasks:
  [ ] test and debug
  [ ] light sensor averaging
  [ ] split into two modules: MicrobitFirmataClient and MicroBitBoard
*/

const serialport = require('serialport');
const {TextEncoder, TextDecoder} = require('util');

class MicrobitFirmataClient {
	constructor() {
		this.addConstants();
		this.myPort = null;
		this.inbuf = new Uint8Array(1000);
		this.inbufCount = 0;

		this.firmataVersion = '';
		this.firmwareVersion = '';

		this.isScrolling = false;
		this.digitalInput = new Array(21).fill(false);
		this.analogChannel = new Array(16).fill(0);
		this.eventListeners = new Array();
		this.updateListeners = new Array();
	}

	addConstants() {
		// Add Firmata constants

		// Firamata Channel Messages

		this.STREAM_ANALOG				= 0xC0; // enable/disable streaming of an analog channel
		this.STREAM_DIGITAL				= 0xD0; // enable/disable tracking of a digital port
		this.ANALOG_UPDATE				= 0xE0; // analog channel update
		this.DIGITAL_UPDATE				= 0x90; // digital port update

		this.SYSEX_START				= 0xF0
		this.SET_PIN_MODE				= 0xF4; // set pin mode
		this.SET_DIGITAL_PIN			= 0xF5; // set pin value
		this.SYSEX_END					= 0xF7
		this.FIRMATA_VERSION			= 0xF9; // request/report Firmata protocol version
		this.SYSTEM_RESET				= 0xFF; // reset Firmata

		// Firamata Sysex Messages

		this.REPORT_FIRMWARE			= 0x79; // request/report firmware version and name
		this.SAMPLING_INTERVAL			= 0x7A; // set msecs between streamed analog samples

		// BBC micro:bit Sysex Messages (0x01-0x0F)

		this.MB_DISPLAY_CLEAR			= 0x01
		this.MB_DISPLAY_SHOW			= 0x02
		this.MB_DISPLAY_PLOT			= 0x03
		this.MB_SCROLL_STRING			= 0x04
		this.MB_SCROLL_INTEGER			= 0x05
		this.MB_SET_TOUCH_MODE			= 0x06
		// 0x07-0x0C reserved for additional micro:bit messages
		this.MB_REPORT_EVENT			= 0x0D
		this.MB_DEBUG_STRING			= 0x0E
		this.MB_EXTENDED_SYSEX			= 0x0F; // allow for 128 additional micro:bit messages

		// Firmata Pin Modes

		this.DIGITAL_INPUT				= 0x00
		this.DIGITAL_OUTPUT				= 0x01
		this.ANALOG_INPUT				= 0x02
		this.PWM						= 0x03
		this.INPUT_PULLUP				= 0x0B
		this.INPUT_PULLDOWN				= 0x0F; // micro:bit extension; not defined by Firmata
	}

	// Connecting/Disconnecting

	connect() {
		// Search serial port list for a connected micro:bit and, if found, open that port.

		serialport.list()
		.then((ports) => {
			for (var i = 0; i < ports.length; i++) {
				var p = ports[i];
				if ((p.vendorId == '0d28') && (p.productId == '0204')) {
					return p.comName;
				}
			}
			return null;
		})
		.then((portName) => {
			if (portName) {
				// Attempt to open the serial port on the given port name.
				// If this fails it will fail with an UnhandledPromiseRejectionWarning.
				console.log("Opening", portName);
				this.setSerialPort(new serialport(portName, { baudRate: 57600 }));
			} else {
				console.log("No micro:bit found; is your board plugged in?");
			}
		});
	}

	setSerialPort(port) {
		function dataReceived(data) {
			if ((this.inbufCount + data.length) < this.inbuf.length) {
				this.inbuf.set(data, this.inbufCount);
				this.inbufCount += data.length;
				this.processFirmatMessages();
			}
		}
		this.myPort = port;
		this.myPort.on('data', dataReceived.bind(this));
		this.getFirmataVersion();
		this.getFirmwareVersion();
	}

	disconnect() {
		if (this.myPort) {
			console.log("Closing", this.myPort.path);
			this.myPort.close();
			this.myPort = null;
		}
	}

	// Process Firmata Messages

	processFirmatMessages() {
		// Process and remove all complete Firmata messages in inbuf.

		if (!this.inbufCount) return; // nothing received
		var cmdStart = 0;
		while (true) {
			cmdStart = this.findCmdByte(cmdStart);
			if (cmdStart < 0) {; // no more messages
				this.inbufCount = 0;
				return;
			}
			var skipBytes = this.dispatchCommandAt(cmdStart);
			if (skipBytes < 0) {
				// command at cmdStart is incomplete: remove processed messages and exit
				if (0 == cmdStart) return; // cmd is already at start of inbuf
				var remainingBytes = this.inbufCount - cmdStart;
				this.inbuf.copyWithin(0, cmdStart, cmdStart + remainingBytes);
				this.inbufCount = remainingBytes;
				return;
			}
			cmdStart += skipBytes;
		}
	}

	findCmdByte(startIndex) {
		for (var i = startIndex; i < this.inbufCount; i++) {
			if (this.inbuf[i] & 0x80) return i;
		}
		return -1;
	}

	dispatchCommandAt(cmdStart) {
		// Attempt to process the command starting at the given index in inbuf.
		// If the command is incomplete, return -1.
		// Otherwise, process it and return the number of bytes in the entire command.

		var cmdByte = this.inbuf[cmdStart];
		var chanCmd = cmdByte & 0xF0;
		var argBytes = 0;
		var nextCmdIndex = this.findCmdByte(cmdStart + 1);
		if (nextCmdIndex < 0) {; // no next command; current command may not be complete
			if (this.SYSEX_START == cmdByte) return -1; // incomplete sysex
			argBytes = this.inbufCount - (cmdStart + 1);
			var argsNeeded = 2;
			if (0xFF == cmdByte) argsNeeded = 0;
			if ((0xC0 == chanCmd) || (0xD0 == chanCmd)) argsNeeded = 1;
			if (argBytes < argsNeeded) return -1;
		} else {
			argBytes = nextCmdIndex - (cmdStart + 1);
		}

		if (this.SYSEX_START == cmdByte) {; // system exclusive message: SYSEX_START ...data ... SYSEX_END
			if (this.SYSEX_END != this.inbuf[cmdStart + argBytes + 1]) {
				// last byte is not SYSEX_END; skip this message
				return argBytes + 1; // skip cmd + argBytes
			}
			this.dispatchSysexCommand(cmdStart + 1, argBytes - 1);
			return argBytes + 2; // skip cmd, arg bytes, and final SYSEX_END
		}

		var chan = cmdByte & 0xF;
		var arg1 = (argBytes > 0) ? this.inbuf[cmdStart + 1] : 0;
		var arg2 = (argBytes > 1) ? this.inbuf[cmdStart + 2] : 0;

		if (this.DIGITAL_UPDATE == chanCmd) this.receivedDigitalUpdate(chan, (arg1 | (arg2 << 7)));
		if (this.ANALOG_UPDATE == chanCmd) this.receivedAnalogUpdate(chan, (arg1 | (arg2 << 7)));
		if (this.FIRMATA_VERSION == cmdByte) this.receivedFirmataVersion(arg1, arg2);

		return argBytes + 1;
	}

	dispatchSysexCommand(sysexStart, argBytes) {
		var sysexCmd = this.inbuf[sysexStart];
		switch (sysexCmd) {
		case this.MB_REPORT_EVENT:
			this.receivedEvent(sysexStart, argBytes);
			break;
		case this.MB_DEBUG_STRING:
			var buf = this.inbuf.slice(sysexStart + 1, sysexStart + 1 + argBytes);
			console.log('DB: ' + new TextDecoder().decode(buf));
			break;
		case this.REPORT_FIRMWARE:
			this.receivedFirmwareVersion(sysexStart, argBytes);
			break;
		}
	}

	// Handling Messages from the micro:bit

	receivedFirmataVersion(major, minor) {
		this.firmataVersion = 'Firmata Protocol ' + major + '.' + minor;
	}

	receivedFirmwareVersion(sysexStart, argBytes) {
		var major = this.inbuf[sysexStart + 1];
		var minor = this.inbuf[sysexStart + 2];
		var utf8Bytes = new Array();
		for (var i = sysexStart + 3; i <= argBytes; i += 2) {
			utf8Bytes.push(this.inbuf[i] | (this.inbuf[i + 1] << 7));
		}
		var firmwareName = new TextDecoder().decode(Buffer.from(utf8Bytes));
		this.firmwareVersion = firmwareName + ' ' + major + '.' + minor;
	}

	receivedDigitalUpdate(chan, pinMask) {
		var pinNum = 8 * chan;
		for (var i = 0; i < 8; i++) {
			var isOn = ((pinMask & (1 << i)) != 0);
			if (pinNum < 21) this.digitalInput[pinNum] = isOn;
			pinNum++;
		}
	}

	receivedAnalogUpdate(chan, value) {
		if (value > 8191) value = value - 16384; // negative value (14-bits 2-completement)
console.log('A' + chan + ': ', value);
		this.analogChannel[chan] = value;
		for (var f of this.updateListeners) f.call(); // notify all update listeners
	}

	receivedEvent(sysexStart, argBytes) {
		var sourceID =
			(this.inbuf[sysexStart + 3] << 14) |
			(this.inbuf[sysexStart + 2] << 7) |
			this.inbuf[sysexStart + 1];
		var eventID =
			(this.inbuf[sysexStart + 6] << 14) |
			(this.inbuf[sysexStart + 5] << 7) |
			this.inbuf[sysexStart + 4];
console.log('receivedEvent', sourceID, eventID);
		for (var f of this.eventListeners) f.call(null, sourceID, eventID); // notify all event listeners
	}

	// Version Commands

	getFirmataVersion() {
		this.myPort.write([this.FIRMATA_VERSION, 0, 0]);
	}

	getFirmwareVersion() {
		this.myPort.write([this.SYSEX_START, this.REPORT_FIRMWARE, this.SYSEX_END]);
	}

	// Display Commands

	displayClear() {
		// Clear the display and stop any ongoing animation.

		this.myPort.write([this.SYSEX_START, this.MB_DISPLAY_CLEAR, this.SYSEX_END]);
	}

	displayShow(useGrayscale, pixels) {
		// Display the given 5x5 image on the display. If useGrayscale is true, pixel values
		// are brightness values in the range 0-255. Otherwise, a zero pixel value means off
		// and >0 means on. Pixels is an Array of 5-element Arrays.

		this.myPort.write([this.SYSEX_START, this.MB_DISPLAY_SHOW]);
		this.myPort.write([useGrayscale ? 1 : 0]);
		for (var y = 0; y < 5; y++) {
			for (var x = 0; x < 5; x++) {
				var pix = pixels[y][x];
				if (pix > 1) pix = pix / 2; // transmit as 7-bits
				this.myPort.write([pix & 0x7F]);
			}
		}
		this.myPort.write([this.SYSEX_END]);
	}

	displayPlot(x, y, brightness) {
		// Set the display pixel at x, y to the given brightness (0-255).

		this.myPort.write([this.SYSEX_START, this.MB_DISPLAY_PLOT,
			x, y, (brightness / 2) & 0x7F,
			this.SYSEX_END]);
	}

	scrollString(s, delay) {
		// Scroll the given string across the display with the given delay.
		// Omit the delay parameter to use the default scroll speed.
		// The maximum string length is 100 characters.

		if (null == delay) delay = 120;
		if (s.length > 100) s = s.slice(0, 100);
		var buf = new TextEncoder().encode(s);
		this.myPort.write([this.SYSEX_START, this.MB_SCROLL_STRING, delay]);
		for (var i = 0; i < buf.length; i++) {
			var b = buf[i];
			this.myPort.write([b & 0x7F, (b >> 7) & 0x7F]);
		}
		this.myPort.write([this.SYSEX_END]);
	}

	scrollNumber(n, delay) {
		// Scroll the given 32-bit integer value across the display with the given delay.
		// Omit the delay parameter to use the default scroll speed.
		// Note: 32-bit integer is transmitted as five 7-bit data bytes.

		if (null == delay) delay = 120;
		this.myPort.write([this.SYSEX_START, this.MB_SCROLL_INTEGER,
			delay,
			n & 0x7F, (n >> 7) & 0x7F, (n >> 14) & 0x7F, (n >> 21) & 0x7F, (n >> 28) & 0x7F,
			this.SYSEX_END]);
	}

	// Pin and Sensor Channel Commands

	trackDigitalPin(pinNum, optionalMode) {
		// Start tracking the given pin as a digital input.

		if ((pinNum < 0) || (pinNum > 20)) return;
		var port = pinNum >> 3;
		var mode = this.INPUT_PULLUP;
		if ((optionalMode == this.INPUT_PULLDOWN) || (optionalMode == this.INPUT_PULLUP)) {
			mode = optionalMode;
		}
		this.myPort.write([this.SET_PIN_MODE, pinNum, mode]);
		this.myPort.write([this.STREAM_DIGITAL | port, 1]);
	}

	stopTrackingDigitalPin(pinNum) {
		// Stop tracking the given pin as a digital input.

		if ((pinNum < 0) || (pinNum > 20)) return;
		var port = pinNum >> 3;
		this.myPort.write([this.STREAM_DIGITAL | port, 0]);
	}

	streamAnalogChannel(chan) {
		// Start streaming the given analog channel.

		if ((chan < 0) || (chan > 15)) return;
		this.myPort.write([this.STREAM_ANALOG | chan, 1]);
	}

	stopStreamingAnalogChannel(chan) {
		// Stop streaming the given analog channel.

		if ((chan < 0) || (chan > 15)) return;
		this.myPort.write([this.STREAM_ANALOG | chan, 0]);
	}

	setAnalogSamplingInterval(samplingMSecs) {
		// Set the number of milliseconds (1-16383) between analog channel updates.

		if ((samplingMSecs < 1) || (samplingMSecs > 16383)) return;
		this.myPort.write([this.SYSEX_START, this.SAMPLING_INTERVAL,
			samplingMSecs & 0x7F, (samplingMSecs >> 7) & 0x7F,
			this.SYSEX_END]);
	}

	setTouchMode(pinNum, touchModeOn) {
		// Turn touch mode on/off for a pin. Touch mode is only supported for pins 0-2).
		// When touch mode is on, the pin generates events as if it were a button.

		if ((pinNum < 0) || (pinNum > 2)) return;
		var mode = touchModeOn ? 1 : 0;
		this.myPort.write([this.SYSEX_START, this.MB_SET_TOUCH_MODE,
			pinNum, mode,
			this.SYSEX_END]);
	}

	// Event/Update Listeners

	addFirmataEventListener(eventListenerFunction) {
		// Add a listener function to handle micro:bit DAL events.
		// The function arguments are the sourceID and eventID (both numbers).

		this.eventListeners.push(eventListenerFunction);
	}

	addFirmataUpdateListener(updateListenerFunction) {
		// Add a listener function (with no arguments) called when sensor or pin updates arrive.

		this.updateListeners.push(updateListenerFunction);
	}

} // end class MicrobitFirmataClient

module.exports = MicrobitFirmataClient;

