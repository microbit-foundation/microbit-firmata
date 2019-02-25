## Firmata for the BBC micro:bit

Firmata is a serial protocol that allows a host computer to interact with a microcontroller.
This BBC micro:bit version of Firmata supports all the core Firmata 2.6 protocol commands,
allowing the host computer, or client, to perform digital and analog input and output
operations on the micro:bit's pins. Firmata extension messages allow the client
to manipulate the micro:bit display, receive events from its buttons and
accelerometer, and read data from it's built-in sensors.

The Firmata protocol defines many optional extensions for features such as servo motors
and i2c communications. Those optional Firmata features  are not currently supported,
but could be added later.

This project has two parts: (1) the Firmata firmware (written in C++ and based on
the Lancaster DAL and mbed libraries) that gets installed in a BBC micro:bit and
(2) a client class written in Javascript that runs in Node.js and communicates with
the micro:bit over a USB-serial connection.

A precompiled .hex file is provided for easy firmware installation (so you don't need
to compile it yourself) and a Javascript test suite is provided to test and demonstrate
the system.

### Installing Firmata on your BBC micro:bit

To install the Firmata firmware, plug in your BBC micro:bit, then drag and drop
the most recent .hex file from the **precompiled** folder (e.g. microbit-firmata-v0.8.hex)
onto the micro:bit's virtual USB drive. The yellow light will flash for a few seconds
as the firmware loads. When it stops, the Firmata firmware is installed.

**Note:** If you install another program on your micro:bit you'll need to re-install the
Firmata firmware before working with Firmata again. Fortunately, that's easy and only takes
a few seconds.

### Running the Test Suite

To run the test suite or use the Javascript client, you'll need a recent version
of Node.js and npm, the Node package manager. You can get those from
<https://nodejs.org/en/download/>

You will also need the Node "serialport" package. Get that by typing:

	npm install serialport

Now you can run the test suite by typing the following (inside the `client` directory):

	node mbTests.js

### Exploring the JavaScript Client

You can explore the JavaScript client interactively from the Node command line.

First, start Node by typing:

	node

Then paste in these two lines of code to import and instatiate the Firmata client:

	var MBFirmataClient = require('./MBFirmataClient.js');
	var mb = new MBFirmataClient();

Run the following line to connect the client to the board:

	mb.connect();

The connect() method will scan your serial/COM ports looking for one connected to a micro:bit,
so it's easy to use. However, for if you need more control, the client inclides an entry point
that lets you to pass in your own serial port.

To verify that the board is responding, check the firmata version:

	mb.firmataVersion

If the board has replied to the initial version request, it will be a non-empty string
such as "Firmata Protocol 2.6".

To scroll a string across the display:

	mb.scrollString('Hello, Firmata!');

You can speed that up by specifying a delay parameter:

	mb.scrollString('Hello, Firmata!', 40);

The default delay is 120, so 40 is three times faster than normal.

### Organization and Additional Documentation

The **client** folder contains Javascript code for the Firmata client class that
runs in Node.js. This folder also contains the micro:bit Firmata test suite.
Besides confirming that Firmata works, the test suite is a handy source of code
you can copy and modify for use in your own applications.

The **firmware** folder contains the C++ source code for Firmata firmware that runs in
the micro:bit. It's easier to use the precompiled .hex file than to compile from source.

The **precompiled** folder contains precompiled .hex files for the latest versions of
the firmware.

Additional markdown files in these folders document the client API, the micro:bit
extensions to the Firmata protocol, and the firmware architecture and implementation.

### Building the source

If your goal is to use this project to provide a tethered interface to the BBC micro:bit
then you do not need to build the firmware yourself. However, if you'd like to develop
on or improve the firmware, then building it will be the first step.

Building the firmware is done with yotta, and instructions for setting up your
environment can be found on [micro:bit DAL documentation](https://lancaster-university.github.io/microbit-docs/offline-toolchains/)

Once you have verified your build toolchain works by building the `microbit-samples` example,
you can build the firmware here as follows

```
cd firmware
yt target bbc-microbit-classic-gcc
yt build
```

The build firmware will reside in `./build/bbc-microbit-classic-gcc/source/mbFirmate-combined.hex`

Copy this file to your micro:bit to run your own build.

You should confirm that it runs correctly using the test script described above.

### License

This software is under the MIT open source license.
