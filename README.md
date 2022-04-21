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
the Lancaster micro:bit runtime and ARM mbed libraries) that gets installed in a BBC micro:bit and
(2) a client class written in Javascript that runs in Node.js and communicates with
the micro:bit over a USB-serial connection.

A precompiled .hex file is provided for easy firmware installation (so you don't need
to compile it yourself) and a Javascript test suite is provided to test and demonstrate
the system. This precompiled hex can be found as part of the latest GitHub Release.

### Installing Firmata on your BBC micro:bit

To install the Firmata firmware, plug in your BBC micro:bit, then drag and drop
the most recent .hex file from the [**GitHub Releases**](https://github.com/microbit-foundation/microbit-firmata/releases) onto the micro:bit's virtual USB drive. The yellow
light will flash for a few seconds as the firmware loads. When it stops, the Firmata
firmware is installed.

**Note:** If you install another program on your micro:bit you'll need to re-install the
Firmata firmware before working with Firmata again. Fortunately, that's easy and only takes
a few seconds.

### Running the Test Suite

To run the test suite or use the Javascript client, you'll need a recent version
of Node.js and npm, the Node package manager. You can get those from
<https://nodejs.org/en/download/>

You will also need the Node "serialport" package. Get that by typing:

	npm install serialport

Now you can run the test suite by typing the following:

	cd client
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
so it's easy to use. However, if you need more control, the client inclides an entry point
that lets you to pass in your own serial port.

To verify that the board is responding, run the following to check the firmata version:

	mb.firmataVersion

If the board has replied to the initial version request, this will return a non-empty string
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
you can copy and modify to use in your own applications.

The **firmware** folder contains the C++ source code for the Firmata firmware that runs in
the micro:bit. It's easier to use the precompiled .hex file than to compile from source.

Additional MarkDown files document the client API and the firmware implementation.

### Building the firmware from source

If you just want to use Firmata, you don't need to build it yourself. The latest
compiled version is available **precompiled** folder or from a GitHub release. You
can install it just by dragging and dropping the .hex file onto the USB drive of your
BBC micro:bit.

However, if you'd like to extend or improve the firmware,
then building it will be the first step.

### Building the micro:bit V1 firmware from source

Building the firmware is done with Yotta, and instructions for setting up your
environment can be found at:

[micro:bit runtime offline toolchain](https://lancaster-university.github.io/microbit-docs/offline-toolchains/)

Once you have verified your build toolchain works by building the `microbit-samples` example,
you can build the firmware as follows:

	cd firmware
	yt target bbc-microbit-classic-gcc@https://github.com/lancaster-university/yotta-target-bbc-microbit-classic-gcc
	yt build

The compiled firmware will be at:

	./build/bbc-microbit-classic-gcc/source/mbFirmate-combined.hex

Drag this file to your micro:bit's USB drive to install it.

You can use the test suite to confirm that it works.

### Building the micro:bit V2 firmware from source

Building the firmware is done with the CODAL build system, and instructions for installing the pre-requisite tools can be found at:

[microbit-v2-samples](https://github.com/lancaster-university/microbit-v2-samples)

Once you have verified your build toolchain works by building the `microbit-v2-samples` example,
you can build the firmware as follows:

	cd microbit-firmata
	git submodule update --init
	cd firmware
	python buildv2.py

The compiled firmware will be at:

	../microbit-v2-samples/MICROBIT.hex

Drag this file to your micro:bit's USB drive to install it.

You can use the test suite to confirm that it works.

### Creating a universal hex for micro:bit V1 and micro:bit V2

A tool which can easily create a .hex file that will support all micro:bit variants can be found at:

[micro:bit Universal Hex Creator](https://tech.microbit.org/software/universal-hex-creator/)

There is more information about the .HEX file format here:

[.HEX file format](https://tech.microbit.org/software/hex-format/)

### License

This software is under the MIT open source license.

SPDX-License-Identifier: MIT

### Code of Conduct

Trust, partnership, simplicity and passion are our core values we live and breathe in our daily work life and within our projects. Our open-source projects are no exception. We have an active community which spans the globe and we welcome and encourage participation and contributions to our projects by everyone. We work to foster a positive, open, inclusive and supportive environment and trust that our community respects the micro:bit code of conduct. Please see our [code of conduct](https://microbit.org/safeguarding/) which outlines our expectations for all those that participate in our community and details on how to report any concerns and what would happen should breaches occur.
