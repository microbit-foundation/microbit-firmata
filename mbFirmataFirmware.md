## BBC micro:bit Firmata Firmware

BBC micro:bit Firmata firmware is a C++ program, based on the University of Lancaster micro:bit
runtime (DAL), that runs in a BBC micro:bit and communicates via a USB-serial connection
with a micro:bit Firmata client. The Firmata firmware allows the client to stream data
from the micro:bit's sensors and input pins, receive notifications of various events
(e.g. button down/up events), and control the micro:bit's LED display and output pins.
See **firmataClient.md** for a description of how to use those features.

This document summarizes the underlyng Firmata protocol, explains how to compile the Firmata
firmware (if necessary), and describes the internal structure of the firmware. It concludes with
some notes on how the firmware might be extended in the future to add commmands to support
the MakeCode radio commands or to integrate the firmware into the Lancaster micro:bit runtime.

### Firmata Protocol

The Firmata protocol, which is based on the Musical Instrument Digital Interface (MIDI) protocol,
was created to allow a client computer to control an Arduino board via a serial connection.
It is documented at:

[https://github.com/firmata/protocol/blob/master/protocol.md](https://github.com/firmata/protocol/blob/master/protocol.md)

Messages consist of a command byte followed by zero or more data bytes. Command bytes always
have a "1" in their most significant bit, whereas data bytes have a "0". This design is
robust in the face of lost bytes. To find the start of the next message after a data loss,
the receiver simply discards incoming bytes until it sees the next command byte. This
robustness makes the design a good choice for Firmata, but it also means that data bytes carry
only 7 bits of data. In some cases (e.g. UTF-8 strings) this requires transmitting two data
bytes for each 8-bit byte. However, in Firmata many values fit naturally into 7 or 14 bits
(one or two data bytes), so the most heavily-used Firmata commands are byte-efficient.

The BBC micro:bit implementation of Firmata supports all the core Firmata 2.6 protocol commands,
allowing the client computer to perform digital and analog input and output operations on the
micro:bit's pins. Firmata extension messages allow the client to manipulate the micro:bit's
LED display, receive events from its buttons and accelerometer,
and read data from its built-in sensors.

The standard Firmata serial communitcation baud rate is 57600 baud.

### Source Code

The source code for this project is
[here](https://github.com/microbit-foundation/microbit-protocol).

The firmware source code is in the **firmware/source** folder.
It consists of three files:

	mbFirmata.h		-- header file consisting mostly of Firmata constants
	main.cpp		-- top level; calls initFirmata(), then loops calling stepFirmata()
	mbFirmata.cpp	-- implementation, where all the interesting stuff happens

### Compiling

If you just want to use Firmata, you don't need to compile it yourself. The latest
compiled version is available in the **precompiled** folder. You can install it just
by dragging and dropping the .hex file onto the USB drive of your BBC micro:bit.

You can build code for the BBC micro:bit runtime (DAL) using either the online mbed compiler
(easy) or the offline Yotta toolchain (complex).
More details about those two paths are available here:

  [https://lancaster-university.github.io/microbit-docs/]
  (https://lancaster-university.github.io/microbit-docs/)

Unfortunately, as of this writing, the online mbed complier has an out-of-date version of the
DAL library. A more recent version of that library is required for the firmware to work on the
latest micro:bit boards, which have a different accelerometer part than the original boards.
At some point, the online mbed compiler will get updated with the latest DAL library.
Meanwhile, the only option for compiling the firmware is the offline Yotta toolchain.

The author had problems setting up a working Yotta toolchain on both Mac OS and Linux.
He eventually succeeded with the Yotta Windows installer on Windows 10:

  [http://docs.yottabuild.org/#installing](http://docs.yottabuild.org/#installing)

Once the Yotta toolchain is set up, compling is easy. In the Yotta terminal window type:

	cd firmware
	yt target bbc-microbit-classic-gcc@https://github.com/lancaster-university/yotta-target-bbc-microbit-classic-gcc
	yt build

The output appears in the newly created folder **build/obbc-microbit-classic-gcc/source**
as a file named:

	microbit-firmata-combined.hex

Drag this file onto USB drive of your BBC micro:bit to install it.

### Firmware Structure and Operation

The top level function, main(), calls initFirmata() then repeatedly calls stepFirmata()
in an infinite loop. initFirmata() initializes the serial port, initializes the firmware
data structures, and registers MessageBus handlers for events of interest.
Finally, it sends a FIRMATA_VERSION message to the client to indicate
that Firmata is ready to accept incoming commands.

stepFirmata() does two things: (1) processes incoming Firmata commands from the client; and
(2) streams the state of any pins or sensors in which the client has expressed interest.

Events are reported the the client in response to MessageBus callbacks.

#### Firmata Command Processing

Client commands are handled by processCommands(). It starts by collecing reading bytes from the
serial port into inbuf. After that, if inbuf is empty, there is nothing to do, and it returns.
Othewise, processCommands() repeatedly finds the start of the next command in inbuf
and, if that command is complete, processes it. When all complete commands have been
processed, they are removed from inbuf, possibly leaving the start of an incoming,
but not yet complete, command in the buffer.

Commands are dispatched by processCommandAt(). A few specific commands are followed by zero
or one data byte. The rest have two data bytes except for system exclusive commands,
which have a variable number of data bytes followed by a SYSEX-END byte.
If a command is not complete (i.e. it does not have the expected number of data bytes or,
in the case of a system exclusive command, a terminating SYSEX-END byte),
processCommandAt() returns -1.
A complete command is dispatched based on its first byte, the command byte.
System-exclusive commands are processed by dispatchSysexCommand(), where the second
byte determines the system exclusive command. Unrecognized commands are ignored.

#### Digital and Analog Streaming

If the client expresses interest in a digital input pin (with a STREAM-DIGITAL command)
then DIGITAL-UPDATE commands are sent to the client whenever the state of that pin changes.
Digital pins are packed into sets of 8 pins called ports, and the state of all 8 pins of
a port is reported in a single DIGITAL-UPDATE command. Since the micro:bit has only 20 pins,
it uses only the first three digital ports.

Digital pin updates are sent by streamDigitalPins(), which sends a DIGITAL-UPDATE command
whenever it detects a state change on a digital pin that's been set to digital input mode
within a port that is being streamed. (Pins in the same port that are not digital inputs are
reported as "0" in the DIGITAL-UPDATE message.)

The Firmata protocol supports streaming of up 16 analog channels. Firmata was originally
designed for Arduino boards that did not have any built-in sensors, only analog input pins.
Micro:bit Firmata extends that idea by mapping the micro:bit's built-in sensors to analog
channels 8-15. The first six channels correspond to the micro:bit's six analog input pins.
Note that when the micro:bit display and/or light sensor are in use, only pins 0-2 are
available for analog input.

When the client has expressed interest in a given analog channel, streamSensors() sends an
ANALOG-UPDATE command with the current value of the pin or sensor for that channel
every sampling-interval milliseconds. The default sampling interval is 100 milliseconds,
or ten updates per second. The client can request a faster sampling rate up to a
theoretical maximum of 1000 samples/second. In practice, the actual sampling rate is
limited by the baud rate of the serial port and the speed of the client computer.
The test suite includes tests that measure the actual sampling rate and serial port
throughput.

### Potential Extension: MakeCode Radio Commands

In the future, Micro:bit Firmata may be extended to support the MakeCode radio commands.
The new commands would be added as extended system exclusive commands of the form:

	SYSEX_START
	MB_EXTENDED_SYSEX
	<radio command>
	<data for command>
	SYSEX_END

Here is a possible set of commands for configuring the radio and sending messages:

| Command            | Hex |    Data     |
|--------------------|----:|-------------|
| enable radio       |   1 | 0 - turn on, 1 - turn off (one data byte) |
| set group          |   2 | group: 0-255 (two data bytes, LSB first) |
| set power          |   3 | power: 0-7 (one data byte) |
| set channel        |   4 | channel: 0-83 (one data byte) |
| send string        |   5 | string (two-data bytes for each character, LSB first) |
| send integer       |   6 | 32-bit integer (5 data bytes, LSB first) |
| send float         |   7 | 64-bit float (10 data bytes, LSB first) |
| send pair, integer |   8 | 32-bit integer (5 data bytes, LSB first, followed by string data) |
| send pair, float   |   9 | 64-bit float (10 data bytes, LSB first, followed by string data) |

When the micro:bit receives a radio message, it might send one of these event reports
back to the Firmatat client:

| Event Report Command   | Hex |    Data     |
|------------------------|----:|-------------|
| received string        |  11 | string (two-data bytes for each character, LSB first) |
| received integer       |  12 | 32-bit integer (5 data bytes, LSB first) |
| received float         |  13 | 64-bit float (10 data bytes, LSB first) |
| received pair, integer |  14 | 32-bit integer (5 data bytes, LSB first, followed by string data) |
| received pair, float   |  15 | 64-bit float (10 data bytes, LSB first, followed by string data) |

Since data bytes in the Firmata protocol have only 7-bits of data, it takes 5 data bytes
to send a 32-bit integer and 10 data bytes to send a 64-bit floating point number.

This is just a preliminary design, and it could be extended. For example,
the data for the "received xxx" event reports might include the packet signal strength,
sender's serial number, and sender's timestamp.

### Potential Extension: Integrating into the Lancaster micro:bit Runtime

If desired, Firmata could be integrated into the Lancaster micro:bit runtime.
Doing that requires just three things:

1. Call initFirmata() to initialize the serial port and data structures.
2. In in mbFirmata.cpp, modify references to runtime objects such as the display,
accelerometer, and IO pins to share those objects with the rest of the runtime.
3. Arrange for stepFirmata() to be called frequently (at least once every 5 milliseconds,
and once every millisecond if possible).
