/*
MIT License

Copyright (c) 2019 Micro:bit Educational Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

#ifdef ARDUINO_BBC_MICROBIT
  #include <Arduino.h>
#else
  #include <MicroBit.h>
#endif

#include "mbFirmata.h"

// Variables

#define IN_BUF_SIZE 250
static uint8_t inbuf[IN_BUF_SIZE];
static int inbufCount = 0;

#define MAX_SCROLLING_STRING 200 // room for 100 2-byte UTF-8 characters (probably overkill)
static char scrollingString[MAX_SCROLLING_STRING];

#define PIN_COUNT 21
#define UNKNOWN_PIN_MODE 0x0E
#define UNKNOWN_PIN_STATE 55555
static uint8_t firmataPinMode[PIN_COUNT];
static uint16_t firmataPinState[PIN_COUNT];

static uint8_t isStreamingChannel[16];
static uint8_t isStreamingPort[16];

static int samplingInterval = 100;
static int lastSampleTime = 0;

// Serial I/O

#ifdef ARDUINO_BBC_MICROBIT

static void receiveData() {
	while (Serial.available() && (inbufCount < IN_BUF_SIZE)) {
		inbuf[inbufCount++] = Serial.read();
	}
}

static void sendByte(uint8_t b) {
	Serial.write(b);
}

static void send2Bytes(uint8_t b1, uint8_t b2) {
	Serial.write(b1);
	Serial.write(b2);
}

static void send3Bytes(uint8_t b1, uint8_t b2, uint8_t b3) {
	Serial.write(b1);
	Serial.write(b2);
	Serial.write(b3);
}

static int unsigned now() { return millis(); }

#else // DAL

extern MicroBit uBit;

static void receiveData() {
	while (inbufCount < IN_BUF_SIZE) {
		int byte = uBit.serial.read(ASYNC);
		if (byte < 0) return;
		inbuf[inbufCount++] = byte;
	}
}

static void sendByte(uint8_t b) {
	uBit.serial.sendChar(b, ASYNC);
}

static void send2Bytes(uint8_t b1, uint8_t b2) {
	uBit.serial.sendChar(b1, ASYNC);
	uBit.serial.sendChar(b2, ASYNC);
}

static void send3Bytes(uint8_t b1, uint8_t b2, uint8_t b3) {
	uBit.serial.sendChar(b1, ASYNC);
	uBit.serial.sendChar(b2, ASYNC);
	uBit.serial.sendChar(b3, ASYNC);
}

static int unsigned now() { return uBit.systemTime(); }

#endif

// Debugging

static void sendStringData(char *s) {
	// Append the given 8-bit string data to the output buffer.
	// Two seven-bit data bytes are appended for each byte of the string.
	while (*s) {
		uint8_t b = (uint8_t) *s++;
		send2Bytes(b & 0x7F, (b >> 7) & 1);
	}
}

static void DEBUG(char *s) {
	// Send a 7-bit ASCII string for use in debugging.

	send2Bytes(SYSEX_START, MB_DEBUG_STRING); // seven-bit ascii string
	char *ptr = s;
	while (*ptr) sendByte(*ptr++ & 0x7F);
	sendByte(SYSEX_END);
}

// System Commands

static void reportFirmataVersion() {
	// Send Firmata protocol version.

	send3Bytes(FIRMATA_VERSION, 0x02, 0x06); // Firmata protocol 2.6
}

static void reportFirmwareVersion() {
	// Send firmware version.

	send2Bytes(SYSEX_START, REPORT_FIRMWARE);
	send2Bytes(0, 3); // micro:bit Firmata firmware version (vs. the Firmata protocol version)
	sendStringData("micro:bit Firmata");
	sendByte(SYSEX_END);
}

static void systemReset() {
	memset(firmataPinMode, UNKNOWN_PIN_MODE, sizeof(firmataPinMode));
	memset(firmataPinState, UNKNOWN_PIN_STATE, sizeof(firmataPinState));
	memset(isStreamingChannel, false, sizeof(isStreamingChannel));
	memset(isStreamingPort, false, sizeof(isStreamingPort));
	samplingInterval = 100;
	DEBUG("systemReset");
}

// Pin Commands

static void reportAnalogMapping() {
	// Report that the analog iput pins are P0-P4 and P10.

	int i;
	send2Bytes(SYSEX_START, ANALOG_MAPPING_RESPONSE);
	for (i = 0; i <= 15; i++) sendByte(i);
	sendByte(SYSEX_END);
}

static void reportPinCapabilities() {
	// Send pin capabilities report.

	send2Bytes(SYSEX_START, CAPABILITY_RESPONSE);
	for (int p = 0; p < PIN_COUNT; p++) {
		// send a sequence of (pin mode, resolution) pairs
		if ((p < 5) || (10 == p)) {
			send2Bytes(DIGITAL_INPUT, 1);
			send2Bytes(DIGITAL_OUTPUT, 1);
			send2Bytes(ANALOG_INPUT, 10);
			send2Bytes(PWM, 10);
			send2Bytes(INPUT_PULLUP, 1);
		} else if ((17 != p) && (18 != p)) { // pins 17-18 are 3.3v
			send2Bytes(DIGITAL_INPUT, 1);
			send2Bytes(DIGITAL_OUTPUT, 1);
			send2Bytes(PWM, 10);
			send2Bytes(INPUT_PULLUP, 1);
		}
		if (p < (PIN_COUNT - 1)) sendByte(0x7F); // send pin separator
	}
	sendByte(SYSEX_END);
}

static void reportPinState(int pin) {
	if ((pin < 0) || (pin >= PIN_COUNT)) return;
	int state = firmataPinState[pin];
	send2Bytes(SYSEX_START, PIN_STATE_RESPONSE);
	send2Bytes(pin, firmataPinMode[pin]);
	send2Bytes(state & 0x7F, (state >> 7) & 0x7F);
	sendByte(SYSEX_END);
}

static void setPinMode(int pin, int mode) {
	if ((pin < 0) || (pin >= PIN_COUNT)) return;
	if (!((DIGITAL_INPUT == mode) || (INPUT_PULLUP == mode) || (INPUT_PULLDOWN == mode) ||
		  (DIGITAL_OUTPUT == mode) || (ANALOG_INPUT == mode) || (PWM == mode))) {
		return;
	}
	if (ANALOG_INPUT == mode) {
		if ((pin > 4) && (pin != 10)) return;
	}
	firmataPinMode[pin] = mode;
	firmataPinState[pin] = UNKNOWN_PIN_STATE;

	// set actual pin mode
	#ifdef ARDUINO_BBC_MICROBIT
		if ((DIGITAL_OUTPUT == mode) || (PWM == mode)) {
			pinMode(pin, OUTPUT);
		} else if (INPUT_PULLUP == mode) {
			pinMode(pin, INPUT_PULLUP);
		} else if (INPUT_PULLDOWN == mode) {
			pinMode(pin, INPUT);
		} else {
			pinMode(pin, INPUT);
		}
	#else
		if (DIGITAL_OUTPUT == mode) {
			firmataPinState[pin] = 0;
			uBit.io.pin[pin].setDigitalValue(0);
		} else if (PWM == mode) {
			firmataPinState[pin] = 0;
			uBit.io.pin[pin].setAnalogValue(0);
		} else if (INPUT_PULLUP == mode) {
			uBit.io.pin[pin].getDigitalValue();
			uBit.io.pin[pin].setPull(PullUp);
		} else if (INPUT_PULLDOWN == mode) {
			uBit.io.pin[pin].getDigitalValue();
			uBit.io.pin[pin].setPull(PullDown);
		} else {
			uBit.io.pin[pin].getDigitalValue();
			uBit.io.pin[pin].setPull(PullNone);
		}
	#endif
}

static void setDigitalPin(int pin, int value) {
	// Set the given digital pin to the given value.
	// Do nothing if the pin is not in digital output mode.

	if ((pin < 0) || (pin >= PIN_COUNT)) return;
	if (DIGITAL_OUTPUT != firmataPinMode[pin]) return;
	firmataPinState[pin] = value ? 1 : 0;

	// set actual pin output
	#ifdef ARDUINO_BBC_MICROBIT
		digitalWrite(pin, firmataPinState[pin]);
	#else
		uBit.io.pin[pin].setDigitalValue(firmataPinState[pin]);
	#endif
}

static void setDigitalPort(int port, int pinMask) {
	// Handle an incoming digital I/O message (0x90).
	// Only pins in digital output mode will only be changed.

	if (port > 2) return;
	int basePin = 8 * port;
	for (int i = 0; i < 8; i++) {
		int isOn = (pinMask & (1 << i)) ? 1 : 0;
		setDigitalPin(basePin + i, isOn);
	}
}

static void setAnalogPin(int pin, int value) {
	if ((pin < 0) || (pin >= PIN_COUNT)) return;
	if (PWM != firmataPinMode[pin]) return;
	firmataPinState[pin] = value;

	// set actual pin output
	#ifdef ARDUINO_BBC_MICROBIT
		analogWrite(pin, value);
	#else
		uBit.io.pin[pin].setAnalogValue(value);
	#endif
}

static void extendedAnalogWrite(int sysexStart, int argBytes) {
	int pin = inbuf[sysexStart + 1];
	int b0 = inbuf[sysexStart + 2];
	int b1 = inbuf[sysexStart + 3];
	int b2 = inbuf[sysexStart + 4];
	int value = 0;
	if (2 == argBytes) {
		value = b0;
	} else if (3 == argBytes) {
		value = (b1 << 7) | b0;
	} else if (4 == argBytes) {
		value = (b2 << 14) | (b1 << 7) | b0;
	}
	setAnalogPin(pin, value);
}

// Streaming Control Commands

static void streamAnalogChannel(uint8_t chan, uint8_t isOn) {
	// Turn streaming of the given analog channel on or off.

	if (chan < 16) isStreamingChannel[chan] = isOn;
}

static void streamDigitalPort(uint8_t port, uint8_t isOn) {
	// Turn streaming of the given digital port on or off.

	if (port < 16) isStreamingPort[port] = isOn;
}

static void setSamplingInterval(int msecs) {
	samplingInterval = (msecs < 5) ? 5 : msecs;
}

// Display Commands

#ifdef ARDUINO_BBC_MICROBIT

static void display_clear(int sysexStart, int argBytes) { }
static void display_show(int sysexStart, int argBytes) { }
static void display_plot(int sysexStart, int argBytes) { }
static void scrollString(int sysexStart, int argBytes) { }
static void scrollNumber(int sysexStart, int argBytes) { }
static void setTouchMode(int sysexStart, int argBytes) { }
}

#else

static void display_clear(int sysexStart, int argBytes) {
	uBit.display.stopAnimation();
	uBit.display.clear();
}

static void display_show(int sysexStart, int argBytes) {
	if (argBytes < 26) return;
	int isGrayscale = inbuf[sysexStart + 1];
	if (isGrayscale) {
		uBit.display.setDisplayMode(DISPLAY_MODE_GREYSCALE);
	} else {
		uBit.display.setDisplayMode(DISPLAY_MODE_BLACK_AND_WHITE);
	}
	for (int y = 0; y < 5; y++) {
		for (int x = 0; x < 5; x++) {
			int i = (5 * y) + x;
			int level = inbuf[sysexStart + i + 2];
			level = (127 == level) ? 255 : (2 * level); // covert from 7 to 8 bit range
			uBit.display.image.setPixelValue(x, y, level);
		}
	}
}

static void display_plot(int sysexStart, int argBytes) {
	if (argBytes < 3) return;
	int x = inbuf[sysexStart + 1];
	int y = inbuf[sysexStart + 2];
	int level = inbuf[sysexStart + 3];
	level = (127 == level) ? 255 : (2 * level); // covert from 7 to 8 bit range
	if ((level > 0) && (level < 255)) {
		uBit.display.setDisplayMode(DISPLAY_MODE_GREYSCALE);
	}
	uBit.display.image.setPixelValue(x, y, level);
}

static void scrollString(int sysexStart, int argBytes) {
	if (argBytes < 1) return;
	int scrollSpeed = inbuf[sysexStart + 1];
	uBit.display.stopAnimation();
	int utf8Bytecount = (argBytes - 1) / 2;
	if (utf8Bytecount > MAX_SCROLLING_STRING) utf8Bytecount = MAX_SCROLLING_STRING;
	int srcIndex = sysexStart + 2;
	for (int i = 0; i < utf8Bytecount; i ++) {
		scrollingString[i] = inbuf[srcIndex] | (inbuf[srcIndex + 1] << 7);
		srcIndex += 2;
	}
	scrollingString[utf8Bytecount] = 0; // null terminator
	uBit.display.scrollAsync(scrollingString, scrollSpeed);
}

static void scrollNumber(int sysexStart, int argBytes) {
	if (argBytes < 2) return;
	int scrollSpeed = inbuf[sysexStart + 1];
	int n = inbuf[sysexStart + 2];
	n |= inbuf[sysexStart + 3] << 7;
	n |= inbuf[sysexStart + 4] << 14;
	n |= inbuf[sysexStart + 5] << 21;
	n |= inbuf[sysexStart + 6] << 28;
	uBit.display.stopAnimation();
	sprintf(scrollingString, "%d", n);
	uBit.display.scrollAsync(scrollingString, scrollSpeed);
}

static void setTouchMode(int sysexStart, int argBytes) {
	// Turn touch mode on/off for a pin. Touch mode is only supported for pins 0-2).
	// When touch mode is on, the pin generates events as if it were a button.

	if (argBytes < 2) return;
	int pin = inbuf[sysexStart + 1];
	int touchModeOn = (inbuf[sysexStart + 2] != 0);
	if (pin < 3) {
		if (touchModeOn) {
			uBit.io.pin[pin].isTouched();
		} else {
			// Note: disableEvents() is a private method in the DAL. Thus, there does not seem
			// to be any way to disable touch events once a pin has been put into touch mode
			// (except via hardware reset, of course).
			// uBit.io.pin[pin].disableEvents();
		}
	}
}

#endif

// MIDI parsing

static void dispatchSysexCommand(int sysexStart, int argBytes) {
	uint8_t sysexCmd = inbuf[sysexStart];
	switch (sysexCmd) {
	case MB_DISPLAY_CLEAR:
		display_clear(sysexStart, argBytes);
		break;
	case MB_DISPLAY_SHOW:
		display_show(sysexStart, argBytes);
		break;
	case MB_DISPLAY_PLOT:
		display_plot(sysexStart, argBytes);
		break;
	case MB_SCROLL_STRING:
		scrollString(sysexStart, argBytes);
		break;
	case MB_SCROLL_INTEGER:
		scrollNumber(sysexStart, argBytes);
		break;
	case MB_SET_TOUCH_MODE:
		setTouchMode(sysexStart, argBytes);
		break;
	case ANALOG_MAPPING_QUERY:
		reportAnalogMapping();
		break;
	case CAPABILITY_QUERY:
		reportPinCapabilities();
		break;
	case PIN_STATE_QUERY:
		reportPinState(inbuf[sysexStart + 1]);
		break;
	case EXTENDED_ANALOG_WRITE:
		extendedAnalogWrite(sysexStart, argBytes);
		break;
	case REPORT_FIRMWARE:
		reportFirmwareVersion();
		break;
	case SAMPLING_INTERVAL:
		setSamplingInterval((inbuf[sysexStart + 2] << 7) | inbuf[sysexStart + 1]);
		break;
	}
}

static int findCmdByte(int startIndex) {
	for (int i = startIndex; i < inbufCount; i++) {
		if (inbuf[i] & 0x80) return i;
	}
	return -1;
}

static int processCommandAt(int cmdStart) {
	// Attempt to process the command starting at the given index in inbuf.
	// If the command is incomplete, return -1.
	// Otherwise, process it and return the number of bytes in the entire command.

	uint8_t cmdByte = inbuf[cmdStart];
	uint8_t chanCmd = cmdByte & 0xF0;
	int argBytes = 0;
	int nextCmdIndex = findCmdByte(cmdStart + 1);
	if (nextCmdIndex < 0) { // no next command; current command may not be complete
		if (SYSEX_START == cmdByte) return -1; // incomplete sysex
		argBytes = inbufCount - (cmdStart + 1);
		int argsNeeded = 2;
		if ((0xF9 == cmdByte) || (0xFF == cmdByte)) argsNeeded = 0;
		if ((0xC0 == chanCmd) || (0xD0 == chanCmd)) argsNeeded = 1;
		if (argBytes < argsNeeded) return -1;
	} else {
		argBytes = nextCmdIndex - (cmdStart + 1);
	}

	if (SYSEX_START == cmdByte) { // system exclusive message: SYSEX_START ...data ... SYSEX_END
		if (SYSEX_END != inbuf[cmdStart + argBytes + 1]) {
			// error: last byte is not SYSEX_END; skip this message
			return argBytes + 1; // skip cmd + argBytes
		}
		dispatchSysexCommand(cmdStart + 1, argBytes - 1);
		return argBytes + 2; // skip cmd, arg bytes, and final SYSEX_END
	}

	uint8_t chan = cmdByte & 0xF;
	uint8_t arg1 = (argBytes > 0) ? inbuf[cmdStart + 1] : 0;
	uint8_t arg2 = (argBytes > 1) ? inbuf[cmdStart + 2] : 0;

	if (DIGITAL_UPDATE == chanCmd) setDigitalPort(chan, (arg1 | (arg2 << 7)));
	if (ANALOG_UPDATE == chanCmd) setAnalogPin(chan, (arg1 | (arg2 << 7)));
	if (STREAM_ANALOG == chanCmd) streamAnalogChannel(chan, arg1);
	if (STREAM_DIGITAL == chanCmd) streamDigitalPort(chan, arg1);

	if (SET_PIN_MODE == cmdByte) setPinMode(arg1, arg2);
	if (SET_DIGITAL_PIN == cmdByte) setDigitalPin(arg1, arg2);
	if (FIRMATA_VERSION == cmdByte) reportFirmataVersion();
	if (SYSTEM_RESET == cmdByte) systemReset();

	return argBytes + 1;
}

static void processCommands() {
	// Process and remove all complete commands in inbuf.

	if (!inbufCount) return; // nothing received
	int cmdStart = 0;
	while (true) {
		cmdStart = findCmdByte(cmdStart);
		if (cmdStart < 0) { // no more commands
			inbufCount = 0;
			return;
		}
		int skipBytes = processCommandAt(cmdStart);
		if (skipBytes < 0) {
			// command at cmdStart is incomplete: remove processed commands and exit
			if (0 == cmdStart) return; // cmd is already at start of inbuf
			int remainingBytes = inbufCount - cmdStart;
			memmove(inbuf, &inbuf[cmdStart], remainingBytes);
			inbufCount = remainingBytes;
			return;
		}
		cmdStart += skipBytes;
	}
}

static void streamDigitalPins() {
	// Send an update for ports we are streaming if they include an input pin that has changed.

	for (int port = 0; port < 3; port++) {
		if (isStreamingPort[port]) {
			int portChanged = false;
			int bitMask = 0;
			for (int i = 0; i < 8; i++) {
				int pin = (8 * port) + i;
				if (pin < PIN_COUNT) {
					int mode = firmataPinMode[pin];
					if ((DIGITAL_INPUT == mode) ||
						(INPUT_PULLUP == mode) ||
						(INPUT_PULLDOWN == mode)) {
							int oldState = firmataPinState[pin];
							int newState = uBit.io.pin[pin].getDigitalValue();
							if (newState != oldState) portChanged = true;
							firmataPinState[pin] = newState;
							if (newState) bitMask |= (1 << i);
					}
				}
			}
			if (portChanged) {
				send3Bytes(DIGITAL_UPDATE | port, bitMask & 0x7F, (bitMask >> 7) & 0x7F);
			}
		}
	}
}

static int analogChannelValue(uint8_t chan) {
	// Return the value for the given analog channel (0-15).
	// For the micro:bit, sensors such as the accelerometer are mapped to analog channels.

	if (chan > 15) return 0;

#ifdef ARDUINO_BBC_MICROBIT
	if (chan < 6) {
		int pin = (5 == chan) ? 10 : chan; // channels 0-4 are pins 0-4; channel 5 is pin 10
		return analogRead(pin);
	}
	if (6 == chan) return 0;
	if (7 == chan) return 0;
	if (8 == chan) return 101; // accelerometer x
	if (9 == chan) return 102; // accelerometer y
	if (10 == chan) return 103; // accelerometer z
	if (11 == chan) return 200; // light sensor
	if (12 == chan) return 300; // temperature sensor
	if (13 == chan) return 401; // compass x
	if (14 == chan) return 402; // compass y
	if (15 == chan) return 403; // compass z
#else
	if (chan < 6) {
		int pin = (5 == chan) ? 10 : chan; // channels 0-4 are pins 0-4; channel 5 is pin 10
		return uBit.io.pin[pin].getAnalogValue();
	}
	if (6 == chan) return 0;
	if (7 == chan) return 0;
	if (8 == chan) return uBit.accelerometer.getX(); // accelerometer x
	if (9 == chan) return uBit.accelerometer.getY(); // accelerometer y
	if (10 == chan) return uBit.accelerometer.getZ(); // accelerometer z
	if (11 == chan) return uBit.display.readLightLevel(); // light sensor
	if (12 == chan) return uBit.thermometer.getTemperature(); // temperature sensor
	if (13 == chan) return uBit.compass.getX() >> 5; // compass x
	if (14 == chan) return uBit.compass.getY() >> 5; // compass y
	if (15 == chan) return uBit.compass.getZ() >> 5; // compass z
#endif
	return 0;
}

static void streamSensors() {
	// Send updates for all currently streaming sensor channels if samplingInterval msecs
	// have elapsed since the last updates were sent.

	int elapsed = now() - lastSampleTime;
	if ((elapsed >= 0) && (elapsed < samplingInterval)) return;

	for (int chan = 0; chan < 16; chan++) {
		if (isStreamingChannel[chan]) {
			int analogValue = analogChannelValue(chan);
			send3Bytes(ANALOG_UPDATE | chan, analogValue & 0x7F, (analogValue >> 7) & 0x7F);
		}
	}
	lastSampleTime = now();
}

// Events

#ifdef ARDUINO_BBC_MICROBIT

static void registerEventListeners() { } // noop on Arduino

#else

static void onEvent(MicroBitEvent evt) {
	int source_id = evt.source;
	int event_id = evt.value;
	send2Bytes(SYSEX_START, MB_REPORT_EVENT);
	send3Bytes(source_id & 0x7F, (source_id >> 7) & 0x7F, (source_id >> 14) & 0x7F);
	send3Bytes(event_id & 0x7F, (event_id >> 7) & 0x7F, (event_id >> 14) & 0x7F);
	sendByte(SYSEX_END);
}

static void registerEventListeners() {
	// button events
	uBit.messageBus.listen(MICROBIT_ID_BUTTON_A, MICROBIT_EVT_ANY, onEvent);
	uBit.messageBus.listen(MICROBIT_ID_BUTTON_B, MICROBIT_EVT_ANY, onEvent);

	// accelerometer gesture events (e.g. shake)
	uBit.messageBus.listen(MICROBIT_ID_GESTURE, MICROBIT_EVT_ANY, onEvent);

	// touch pin events
	uBit.messageBus.listen(7, MICROBIT_EVT_ANY, onEvent);
	uBit.messageBus.listen(8, MICROBIT_EVT_ANY, onEvent);
	uBit.messageBus.listen(9, MICROBIT_EVT_ANY, onEvent);

	// scrolling/animation complete event
	uBit.messageBus.listen(MICROBIT_ID_DISPLAY, MICROBIT_DISPLAY_EVT_ANIMATION_COMPLETE, onEvent);
}

#endif

// Entry Points

void initFirmata() {
	systemReset();
	registerEventListeners();
}

void stepFirmata() {
	receiveData();
	processCommands();
	streamDigitalPins();
	streamSensors();
}
