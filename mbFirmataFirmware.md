## BBC micro:bit Firmata Firmware

BBC micro:bit Firmata Firmware is a C++ program, based on the University of Lancaster micro:bit
runtime (DAL), that runs in a BBC micro:bit and communicates via a USB-serial connection
with a micro:bit Firmata client. The communication protocol, based on Firmata, allows
the client to stream data from the micro:bit's sensors and input pins, receive notification
of various events (e.g. button down/up events), and to control the micro:bit LED display
and output pins. See **firmataClient.md** for a description of how to use those features.

This document summarizes the Firmata protocol, explains how to compile the Firmata firmware
(if necessary), and describes the internal structure of the firmware. It concludes with
some notes on how it might be extended in the future to add commmands to support the MakeCode
radio commands or to integrate Firmata into the Lancaster micro:bit runtime.

### Firmata Protocol

The Firmata protocol, loosely based on the Musical Instrument Digital Interface (MIDI) protocol,
was created to allow a host computer to control and Arduino board via a serial connection.
It is documented at:

	https://github.com/firmata/protocol
	https://github.com/firmata/protocol/blob/master/protocol.md

Messages consist of a command byte followed by zero or more data bytes. Command bytes always
have a "1" in their most significant bit, whereas data bytes have a zero. This design is
robust in the face of lost bytes: to find the start of the next message after a data loss,
the receiver simply discards incoming bytes until it sees the next command byte. That
robustness makes the design a good choice for Firmata, but it also means that data bytes carry
only 7 bits of data. In some cases (e.g. UTF-8 strings) this requires transmitting two data
bytes for each 8-bit byte. However, in Firmata most values fit naturally into 7 or 14 bits
(one or two data bytes), so the most heavily-used Firmata commands are byte-efficient.

The standard Firmata serial communitcation baud rate is 57600 baud.

### Source Code

The source code for this project is
[here](https://github.com/microbit-foundation/microbit-protocol).
The Firmata firmware source  is in the **firmware/source** folder.
It consists of three files:

	mbFirmata.h		-- header file consisting mostly of Firmata constants
	mbFirmata.cpp	-- implementation, where all the interesting stuff happens
	main.cpp		-- top level; calls initFirmata(), then loops calling stepFirmata()

### Compiling

First, if you just want to use Firmata, you don't need to compile it yourself. The latest
compiled version is available in the **precompiled** folder.

You can build code for the BBC micro:bit runtime (DAL) either using the online mbed compiler (easy)
or the offline Yotta toolchain (complex). More details about those two paths are available here:

  [https://lancaster-university.github.io/microbit-docs/]
  (https://lancaster-university.github.io/microbit-docs/)

Unfortunately, as of this writing, the online mbed complier does not include the current
version of the DAL library, which is required for Firmata to work on the latest micro:bit
boards (which have an updated accelerometer part). At some point, the online mbed compiler
will be updated with the latest DAL. Meanwhile, the only option for compiling Firmata is
the offline Yotta toolchain.

The author had problems setting up a working Yotta toolchain on both Mac OS and Linux.
He eventually succeeded with the Yotta Windows installer on Windows 10:

  [http://docs.yottabuild.org/#installing](http://docs.yottabuild.org/#installing)

Once the Yotta toolchain is set up, compling is easy. From the Yotta terminal window,
cd to the **firmware** folder, then type "yotta build". The output appears in the
newly created folder **build/obbc-microbit-classic-gcc/source** as file named:

  microbit-firmata-combined.hex

Drag this file to USB disk drive of your BBC micro:bit to install it.

### Firmware Structure and Operation

The top level function (main()) calls initFirmata(), then repeatedly calls stepFirmata()
in an infinite loop. initFirmata() initializes the serial port,
initializes its data structures, and registers handlers for events of interest.
Finally, it sends a FIRMATA_VERSION message to the client to indicate
that Firmata is ready to accept incoming commands.

stepFirmata() does two things: (1) processes incoming Firmata commands from the client; and
(2) streams the state of pins and sensors in which the client has expressed interest.

Events are reported the the client in response to MessageBus callbacks.

#### Firmata Command Processing

Client commands are handled by processCommands(). It starts by collecing reading bytes from
the serial port into inbuf. If inbuf is empty, there is nothing to do, and it returns.
Othewise, processCommands() repeatedly find the start of the next command in inbuf
and, if that command is complete, processes it. When all complete commands have been
processed, they are removed from inbuf, possibly leaving the beginning of an incoming,
but not yet complete, command in the buffer.

Firmata commands are dispatched by processCommandAt(). A few specific Firmata commands
have zero or one data bytes. The rest have either two data bytes except for system exclusive
command, which are variable-sized.
If the command is not complete, processCommandAt() returns -1.
A complete command is dispatched based on its first byte, the command byte.
System-exclusive commands are processed by dispatchSysexCommand(), where the second
byte determines the system exclusive command. Unrecognized commands, are ignored.

#### Digital and Analog Streaming

If the client has expressed interest in a digital input (with a STREAM-DIGITAL command)
then DIGITAL-UPDATE commands are sent to the client when the state of that pin changes.
This is handled by streamDigitalPins(), which sends a DIGITAL-UPDATE command when it
detects a state change on digital pin that's been set to input mode. Note that digital
pins are grouped in sets of 8 pins called ports, and the state of all 8 pins of a port
is reported in a single DIGITAL-UPDATE command.

The Firmata protocol supports streaming of up 16 analog channels. Firmata was originally
designed for Arduino boards that did not have any built-in sensors, only analog input pins.
Micro:bit Firmata extends this idea by mapping the micro:bit's built-in sensors to
analog channels 8-15. When the client has expressed interest in a given channel,
streamSensors() sends an ANALOG-UPDATE command with the current value of the pin or senor
every sampling-interval milliseconds. The default sampling interval is 100 milliseconds,
or ten updates per second, but the client can request a faster sampling rate up to a
theoretical maximum of 1000 samples/second. In practice, the actual sampling rate may be
limited by the speed of the serial port and the speed of the client's computer.
The test suite includes tests that measure the actual sampling rate and serial port
throughput.

### Potential Extension: MakeCode Radio Commands

Micro:bit Firmata could easily be extended to support the MakeCode radio commands.
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

| Message                | Hex |    Data     |
|------------------------|----:|-------------|
| received string        |  11 | string (two-data bytes for each character, LSB first) |
| received integer       |  12 | 32-bit integer (5 data bytes, LSB first) |
| received float         |  13 | 64-bit float (10 data bytes, LSB first) |
| received pair, integer |  14 | 32-bit integer (5 data bytes, LSB first, followed by string data) |
| received pair, float   |  15 | 64-bit float (10 data bytes, LSB first, followed by string data) |

This is just a preliminary design, and it might be extended. For example,
the data for the "received xxx" event reports might include the signal strength,
the sender's serial number, and/or the timestamp when sent.

### Potential Extension: Integrating into the Lancaster micro:bit Runtime

If desired, Firmata could be integrated into the Lancaster micro:bit runtime.
Doing that requires just three things:

1. Call initFirmata() to initialize the Firmata buffers and data structures.
2. Modify references in mbFirmata.cpp to share global runtime objects such as
the display, accelerometer, and IO pins with the rest of the runtime.
3. Arrange for stepFirmata() to be called frequently (at least once every 5 milliseconds).

