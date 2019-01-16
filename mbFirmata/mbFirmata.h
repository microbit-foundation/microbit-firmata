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

// Firamata Messages

#define STREAM_ANALOG			0xC0 // enable/disable streaming of an analog channel
#define STREAM_DIGITAL			0xD0 // enable/disable streaming of a digital port
#define ANALOG_UPDATE			0xE0 // analog channel update
#define DIGITAL_UPDATE			0x90 // digital port update

#define SET_PIN_MODE			0xF4 // set pin mode
#define SET_DIGITAL_PIN			0xF5 // set pin value
#define FIRMATA_VERSION			0xF9 // request/report major and minor Firmata protocol version
#define SYSTEM_RESET			0xFF // reset Firmata

// Firamata Sysex Messages

#define SYSEX_START				0xF0
#define SYSEX_END				0xF7

#define ANALOG_MAPPING_QUERY	0x69 // ask for mapping of analog to pin numbers
#define ANALOG_MAPPING_RESPONSE	0x6A // reply with mapping info
#define CAPABILITY_QUERY		0x6B // ask for supported modes and resolution of all pins
#define CAPABILITY_RESPONSE		0x6C // reply with supported modes and resolution
#define PIN_STATE_QUERY			0x6D // ask for a pin's current mode and state (different than value)
#define PIN_STATE_RESPONSE		0x6E // reply with a pin's current mode and state (different than value)
#define EXTENDED_ANALOG_WRITE	0x6F // analog write (PWM, Servo, etc) to any pin

#define STRING_DATA				0x71 // send a string (UTF-8)
#define REPORT_FIRMWARE			0x79 // firmware version and name
#define SAMPLING_INTERVAL		0x7A // set milliseconds between streamed analog samples

// Custom Sysex Messages for micro:bit (0x01-0x0F)

#define MB_DISPLAY_CLEAR		0x01
#define MB_DISPLAY_SHOW			0x02
#define MB_DISPLAY_PLOT			0x03
#define MB_SCROLL_STRING		0x04
#define MB_SCROLL_INTEGER		0x05
// 0x06-0x0C reserved for additional micro:bit commands
#define MB_REPORT_EVENT			0x0D
#define MB_DEBUG_STRING			0x0E
#define MB_EXTENDED_SYSEX		0x0F // can be used to add 128 additional micro:bit commands

// Firmata Pin Modes

#define DIGITAL_INPUT			0x00
#define DIGITAL_OUTPUT			0x01
#define ANALOG_INPUT			0x02
#define PWM						0x03
#define INPUT_PULLUP			0x0B
#define INPUT_PULLDOWN			0x0F // micro:bit extension; not defined in standard Firmata

// Functions

void initFirmata();
void stepFirmata();
