## Firmata for the BBC micro:bit

This project consists of a Firmata firmware implementation (written in C++ and based on the
Lancaster DAL and mbed libraries) that is installed in a BBC micro:bit plus a client
class written in Javascript that runs in Node.js and communicates with the micro:bit
over a USB-serial connection.

A .hex file is provided for easy firmware installation (so you don't need to
compile it yourself) and a Javascript test suite is provided to test and
demonstrates the system.

The basic Firmata features are extended with a set of micro:bit-specific commands
(implemented as Firmata sysex messages) to control the micro:bit display, I/O pins,
and radio. Similarly, Firmata extensions report micro:bit DAL button, motion, and
radio events and support streaming accelerometer, magenetometer, temperature,
and light sensor data.

Optional Firmata extensions for features such as servo motors and i2c communications
are not currently supported.

### Installing Firmata on your BBC micro:bit

To install the Firmata firmware, plug in your BBC micro:bit, then drag and drop
the most recent .hex file from the "precompiled" folder (e.g. microbit-firmata.v0.5.hex)
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

Now you can run the test suite by typing:

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

### Going Further

Additional markdown files describe the entire client API and the firmware in more detail.

### License

This software is under the MIT open source license.
