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

#include <MicroBit.h>
#include <mbed.h>
#include <ble.h>
#include "mbFirmata.h"

// DAL Components

// The DAL scheduler imposes a minimum sampling interval of 5 milliseconds (even if it set to
// a lower value), limiting sensor sampling to a maximum of 200 samples/second. Without the
// scheduler, when connected to a computer than can handle high incoming data rates, Firmata
// can stream a single sensor channel at 1000 samples/sec. That could be useful for high-
// speed data collection when instrumenting a science experiment. To avoid running under the
// scheduler, Firmata instantiates the individual DAL components it needs rather than using
// the MicroBit object.

MicroBitI2C i2c(I2C_SDA0, I2C_SCL0);
MicroBitMessageBus messageBus;
MicroBitSerial serial(USBTX, USBRX);
MicroBitStorage storage;

MicroBitAccelerometer &accelerometer = MicroBitAccelerometer::autoDetect(i2c);
MicroBitButton buttonA(MICROBIT_PIN_BUTTON_A, MICROBIT_ID_BUTTON_A);
MicroBitButton buttonB(MICROBIT_PIN_BUTTON_B, MICROBIT_ID_BUTTON_B);
MicroBitCompass &compass = MicroBitCompass::autoDetect(i2c);
MicroBitDisplay display;
MicroBitThermometer thermometer(storage);

MicroBitIO io(
	MICROBIT_PIN_P0, MICROBIT_PIN_P1, MICROBIT_PIN_P2, MICROBIT_PIN_P3,
	MICROBIT_PIN_P4, MICROBIT_PIN_P5, MICROBIT_PIN_P6, MICROBIT_PIN_P7,
	MICROBIT_PIN_P8, MICROBIT_PIN_P9, MICROBIT_PIN_P10, MICROBIT_PIN_P11,
	MICROBIT_PIN_P12, MICROBIT_PIN_P13, MICROBIT_PIN_P14, MICROBIT_PIN_P15,
	MICROBIT_PIN_P16, /* 17-18 */ MICROBIT_PIN_P19, MICROBIT_PIN_P20);

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

static uint8_t displayEnabled = true;
static uint8_t lightSensorEnabled = false;

static int samplingInterval = 100;
static int lastSampleTime = 0;

// Serial I/O

static void receiveData() {
	while (inbufCount < IN_BUF_SIZE) {
		int byte = serial.read(ASYNC);
		if (byte < 0) return;
		inbuf[inbufCount++] = byte;
	}
}

static void sendByte(uint8_t b) {
	serial.sendChar(b, ASYNC);
}

static void send2Bytes(uint8_t b1, uint8_t b2) {
	serial.sendChar(b1, ASYNC);
	serial.sendChar(b2, ASYNC);
}

static void send3Bytes(uint8_t b1, uint8_t b2, uint8_t b3) {
	serial.sendChar(b1, ASYNC);
	serial.sendChar(b2, ASYNC);
	serial.sendChar(b3, ASYNC);
}

static uint32_t now() { return us_ticker_read() / 1000L; }

// Debugging

static void sendStringData(const char *s) {
	// Append the given 8-bit string data to the output buffer.
	// Two seven-bit data bytes are appended for each byte of the string.
	while (*s) {
		uint8_t b = (uint8_t) *s++;
		send2Bytes(b & 0x7F, (b >> 7) & 1);
	}
}

static void DEBUG(const char *s) {
	// Send a 7-bit ASCII string for use in debugging.

	send2Bytes(SYSEX_START, MB_DEBUG_STRING); // seven-bit ascii string
	char *ptr = (char *) s;
	while (*ptr) sendByte(*ptr++ & 0x7F);
	sendByte(SYSEX_END);
}

// System Commands

static void reportFirmataVersion() {
	// Send Firmata protocol version.

	send3Bytes(FIRMATA_VERSION, 0x02, 0x06); // Firmata protocol 2.6
}

static void reportFirmwareVersion() {
	// Send firmware version plus DAL, mbed library, and softdevice version info.
	// The softdevice version can be found by looking up the firmward ID (FWID) here:
	// https://devzone.nordicsemi.com/f/nordic-q-a/1171/how-do-i-access-softdevice-version-string

	int major = 0;
	int minor = 9;
	char s[100];

	ble_version_t bleInfo;
	sd_ble_version_get(&bleInfo);
	sprintf(s, "[based on DAL %s; mbed %d; softdeviceFWID %d] micro:bit Firmata",
		microbit_dal_version(), MBED_LIBRARY_VERSION, bleInfo.subversion_number);

	send2Bytes(SYSEX_START, REPORT_FIRMWARE);
	send2Bytes(major, minor); // firmware version (vs. Firmata protocol version)
	sendStringData((const char *) s);
	sendByte(SYSEX_END);
}

static void systemReset() {
	memset(firmataPinMode, UNKNOWN_PIN_MODE, sizeof(firmataPinMode));
	memset(firmataPinState, UNKNOWN_PIN_STATE, sizeof(firmataPinState));
	memset(isStreamingChannel, false, sizeof(isStreamingChannel));
	memset(isStreamingPort, false, sizeof(isStreamingPort));
	samplingInterval = 100;
}

// Pin Commands

static void reportAnalogMapping() {
	// Report that the analog iput pins are P0-P4 and P10.

	send2Bytes(SYSEX_START, ANALOG_MAPPING_RESPONSE);
	for (int i = 0; i <= 15; i++) sendByte(i);
	sendByte(SYSEX_END);
}

static void reportPinCapabilities() {
	// Send pin capabilities report.

	send2Bytes(SYSEX_START, CAPABILITY_RESPONSE);
	for (int p = 0; p < PIN_COUNT; p++) {
		// send a sequence of (pin mode, resolution) pairs
		if ((p < 6) || (11 == p)) { // analog pins + light sensor channel
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
		if (11 == pin) lightSensorEnabled = true; // enable the light sensor
		if ((pin > 4) && (pin != 10)) return; // pin is not analog capable
	}

	if (displayEnabled && (pin > 2)) return; // display uses most pins except 0-2

	firmataPinMode[pin] = mode;
	firmataPinState[pin] = UNKNOWN_PIN_STATE;

	// set actual pin mode
	if (DIGITAL_OUTPUT == mode) {
		firmataPinState[pin] = 0;
		io.pin[pin].setDigitalValue(0);
	} else if (PWM == mode) {
		firmataPinState[pin] = 0;
		io.pin[pin].setAnalogValue(0);
	} else if (INPUT_PULLUP == mode) {
		io.pin[pin].getDigitalValue();
		io.pin[pin].setPull(PullUp);
	} else if (INPUT_PULLDOWN == mode) {
		io.pin[pin].getDigitalValue();
		io.pin[pin].setPull(PullDown);
	} else {
		io.pin[pin].getDigitalValue();
		io.pin[pin].setPull(PullNone);
	}
}

static void setDigitalPin(int pin, int value) {
	// Set the given digital pin to the given value.
	// Do nothing if the pin is not in digital output mode.

	if ((pin < 0) || (pin >= PIN_COUNT)) return;
	if (DIGITAL_OUTPUT != firmataPinMode[pin]) return;
	if (displayEnabled && (pin > 2)) return; // display uses most pins except 0-2

	firmataPinState[pin] = value ? 1 : 0;

	// set actual pin output
	io.pin[pin].setDigitalValue(firmataPinState[pin]);
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
	io.pin[pin].setAnalogValue(value);
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

	if (chan > 15) return;
	isStreamingChannel[chan] = isOn;
	if (chan < 6) {
		int pin = (5 == chan) ? 10 : chan; // channels 0-4 are pins 0-4; channel 5 is pin 10
		if (displayEnabled && (pin > 2)) { // display uses pins 3-5
			isStreamingChannel[chan] = false;
			return;
		}
		io.pin[pin].getDigitalValue(); // put in digital read mode
		io.pin[pin].setPull(PullNone); // turn off pullup/down
		if (isOn) io.pin[pin].getAnalogValue();
	}
}

static void streamDigitalPort(uint8_t port, uint8_t isOn) {
	// Turn streaming of the given digital port on or off.

	if (port < 16) isStreamingPort[port] = isOn;
}

static void setSamplingInterval(int msecs) {
	samplingInterval = (msecs < 1) ? 1 : msecs;
}

// Display Commands

static void analogDisable() {
	/* Comment from DAL MicroBitLightSensor.cpp:
	*
	* Forcibly disable AnalogIn, otherwise it will remain in possession of the GPIO channel
	* it is using, meaning that the display will not be able to use a channel (COL).
	*
	* This is required as per PAN 3, details of which can be found here:
	*
	* https://www.nordicsemi.com/eng/nordic/download_resource/24634/5/88440387
	*/

	NRF_ADC->ENABLE = ADC_ENABLE_ENABLE_Disabled;
	NRF_ADC->CONFIG =
		(ADC_CONFIG_RES_8bit		<< ADC_CONFIG_RES_Pos) |
		(ADC_CONFIG_INPSEL_SupplyTwoThirdsPrescaling << ADC_CONFIG_INPSEL_Pos) |
		(ADC_CONFIG_REFSEL_VBG		<< ADC_CONFIG_REFSEL_Pos) |
		(ADC_CONFIG_PSEL_Disabled	<< ADC_CONFIG_PSEL_Pos) |
		(ADC_CONFIG_EXTREFSEL_None	<< ADC_CONFIG_EXTREFSEL_Pos);
}

static void display_clear() {
	display.stopAnimation();
	display.clear();
}

static void display_show(int sysexStart, int argBytes) {
	if (argBytes < 26) return;
	int isGrayscale = inbuf[sysexStart + 1];
	if (isGrayscale) {
		display.setDisplayMode(DISPLAY_MODE_GREYSCALE);
	} else {
		display.setDisplayMode(DISPLAY_MODE_BLACK_AND_WHITE);
	}
	for (int y = 0; y < 5; y++) {
		for (int x = 0; x < 5; x++) {
			int i = (5 * y) + x;
			int level = inbuf[sysexStart + i + 2];
			level = (127 == level) ? 255 : (2 * level); // covert from 7 to 8 bit range
			display.image.setPixelValue(x, y, level);
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
		display.setDisplayMode(DISPLAY_MODE_GREYSCALE);
	}
	display.image.setPixelValue(x, y, level);
}

static void scrollString(int sysexStart, int argBytes) {
	if (argBytes < 1) return;
	int scrollSpeed = inbuf[sysexStart + 1];
	display.stopAnimation();
	int utf8Bytecount = (argBytes - 1) / 2;
	if (utf8Bytecount > MAX_SCROLLING_STRING) utf8Bytecount = MAX_SCROLLING_STRING;
	int srcIndex = sysexStart + 2;
	for (int i = 0; i < utf8Bytecount; i ++) {
		scrollingString[i] = inbuf[srcIndex] | (inbuf[srcIndex + 1] << 7);
		srcIndex += 2;
	}
	scrollingString[utf8Bytecount] = 0; // null terminator
	display.scrollAsync(scrollingString, scrollSpeed);
}

static void scrollNumber(int sysexStart, int argBytes) {
	if (argBytes < 2) return;
	int scrollSpeed = inbuf[sysexStart + 1];
	int n = inbuf[sysexStart + 2];
	n |= inbuf[sysexStart + 3] << 7;
	n |= inbuf[sysexStart + 4] << 14;
	n |= inbuf[sysexStart + 5] << 21;
	n |= inbuf[sysexStart + 6] << 28;
	display.stopAnimation();
	sprintf(scrollingString, "%d", n);
	display.scrollAsync(scrollingString, scrollSpeed);
}

static void setTouchMode(int sysexStart, int argBytes) {
	// Turn touch mode on/off for a pin. Touch mode is only supported for pins 0-2).
	// When touch mode is on, the pin generates events as if it were a button.

	if (argBytes < 2) return;
	int pin = inbuf[sysexStart + 1];
	int touchModeOn = (inbuf[sysexStart + 2] != 0);
	if (pin < 3) {
		if (touchModeOn) {
			io.pin[pin].isTouched();
		} else {
			// Note: disableEvents() is a private method in the DAL. Thus, there does not seem
			// to be any way to disable touch events once a pin has been put into touch mode
			// (except via hardware reset, of course).
			// io.pin[pin].disableEvents();
		}
	}
}

static void setDisplayEnable(int isEnabled) {
	// Disable or re-enable the display. (The display is initially enabled at startup.)
	// When the display is disabled, pins 0-5 can be used for other purposes.
	// Re-enabling the display (even when already enabled) turns off light sensing
	// until the next time a light sensor value is requested.

	// turn off display
	display.stopAnimation();
	display.clear();
	display.disable();

	// disable light sensing
	display.setDisplayMode(DISPLAY_MODE_BLACK_AND_WHITE);
	analogDisable(); // in case light sensor was in use
	lightSensorEnabled = false; // can reenable by setting analog channel 11 to analog input

	// re-enable if isEnabled is true
	displayEnabled = isEnabled;
	if (displayEnabled) display.enable();
}

static void enableDisplay(int sysexStart, int argBytes) {
	if (argBytes < 1) return;
	int isEnabled = (inbuf[sysexStart + 1] != 0);
	setDisplayEnable(isEnabled);
}

// MIDI parsing

static void dispatchSysexCommand(int sysexStart, int argBytes) {
	uint8_t sysexCmd = inbuf[sysexStart];
	switch (sysexCmd) {
	case MB_DISPLAY_CLEAR:
		display_clear();
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
	case MB_DISPLAY_ENABLE:
		enableDisplay(sysexStart, argBytes);
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

	receiveData();
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
							int newState = io.pin[pin].getDigitalValue();
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
	if (chan < 6) {
		if (displayEnabled && (chan > 2)) return 0; // display uses most pins except 0-2
		int pin = (5 == chan) ? 10 : chan; // channels 0-4 are pins 0-4; channel 5 is pin 10
		if (ANALOG_INPUT != firmataPinMode[pin]) return 0;
		return io.pin[pin].getAnalogValue();
	}
	if (6 == chan) return 0;
	if (7 == chan) return 0;
	if (8 == chan) return accelerometer.getX(); // accelerometer x
	if (9 == chan) return accelerometer.getY(); // accelerometer y
	if (10 == chan) return accelerometer.getZ(); // accelerometer z
	if (11 == chan) {
		// When enabled, the light sensor monopolizes the A/D converter, preventing correct
		// analog values from being read from input pins. Thus, the light sensor is disabled
		// at startup and must be enabled by setting channel 11 to analog input mode. It can
		// be disabled again by invoking the setDisplayEnable command. (Any change to the
		// display enabled state disables the light sensor until it explicitly re-enabled.)

		return (displayEnabled && lightSensorEnabled) ? display.readLightLevel() : 0;
	}
	if (12 == chan) return thermometer.getTemperature(); // temperature sensor
	if (13 == chan) return compass.getX() >> 5; // compass x
	if (14 == chan) return compass.getY() >> 5; // compass y
	if (15 == chan) return compass.getZ() >> 5; // compass z

	return 0;
}

static void streamSensors() {
	// Send updates for all currently streaming sensor channels if samplingInterval msecs
	// have elapsed since the last updates were sent.

	int elapsed = now() - lastSampleTime;
	if ((elapsed >= 0) && (elapsed < samplingInterval)) return;

	for (int chan = 0; chan < 16; chan++) {
		if (isStreamingChannel[chan]) {
			if (chan < 6) { // analog pin
				int pin = (chan == 5) ? 10 : chan;
				if (firmataPinMode[pin] != ANALOG_INPUT) continue; // pin not in analog mode
			}
			int analogValue = analogChannelValue(chan);
			send3Bytes(ANALOG_UPDATE | chan, analogValue & 0x7F, (analogValue >> 7) & 0x7F);
		}
	}
	lastSampleTime = now();
}

// Events

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
	messageBus.listen(MICROBIT_ID_BUTTON_A, MICROBIT_EVT_ANY, onEvent);
	messageBus.listen(MICROBIT_ID_BUTTON_B, MICROBIT_EVT_ANY, onEvent);

	// accelerometer gesture events (e.g. shake)
	messageBus.listen(MICROBIT_ID_GESTURE, MICROBIT_EVT_ANY, onEvent);

	// touch pin events
	messageBus.listen(7, MICROBIT_EVT_ANY, onEvent);
	messageBus.listen(8, MICROBIT_EVT_ANY, onEvent);
	messageBus.listen(9, MICROBIT_EVT_ANY, onEvent);

	// scrolling/animation complete event
	messageBus.listen(MICROBIT_ID_DISPLAY, MICROBIT_DISPLAY_EVT_ANIMATION_COMPLETE, onEvent);
}

// Entry Points

void initFirmata() {
	serial.baud(57600);
	serial.setRxBufferSize(249);
	serial.setTxBufferSize(249);

	systemReset();
	registerEventListeners();
	reportFirmataVersion();
}

void stepFirmata() {
	processCommands();
	streamDigitalPins();
	streamSensors();

	// Note: The following code is essential to avoid overrunning the serial line
	// and losing or corrupting data, A fixed delay works, too, but a delay
	// long enough to handle the worst case (streaming 16 channels of analog data
	// and three digital ports, a total of 3 * 19 = 57 bytes) reduces the maximum
	// sampling rate for a single channel. The code below is like a bulk SYNC_SPINWAIT
	// for all serial data queued by the last call to stepFirmata().

	while (serial.txBufferedSize() > 0) /* wait for all bytes to be sent */;
}
