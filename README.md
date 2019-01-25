## Firmata for the BBC micro:bit

This project consists of a Firmata implementation (written in C++ and based on the
Lancaster DAL and mbed libraries) that is installed in a micro:bit and a client
class written in Javascript that runs in Node.js and communicates with the micro:bit
over a USB-serial connection. A .hex file is provided for easy installation
and a test suite is provided that also demonstrates the system features.

The basic Firmata features are extended with a set of micro:bit-specific commands
(implemented as Firmata sysex messages) to control the micro:bit display, I/O pins,
and radio. Similarly, Firmata extensions report micro:bit DAL button, motion, and
radio events and support streaming accelerometer, magenetometer, temperature,
and light sensor data.

Optional Firmata extensions for features such as servo motors and i2c communications
are not currently supported.

### Installing Firmata on your BBC micro:bit

To install Firmata, plug in your BBC micro:bit, then drag and drop the most recent microbit-firmata
.hex file (e.g. microbit-firmata.v0.5.hex) onto the micro:bit's virtual USB drive. The
yellow light will flash for a few seconds as the firmware loads. When it stops, the
Firmata firmware is installed.

**Note:** If you install another program on your micro:bit you'll need to re-install the
Firmata firmware before working with Firmata again. Fortunately, that's easy and only takes
a few seconds.

### Running the Test Suite

To run the test suite or use the Javascript client, you'll need to have a recent version of Node.js and npm, the
Node package manager installed. You can get those here:

<https://nodejs.org/en/download/>

You will also need the Node "serialport" package. Get it by typing:

	npm install serialport

Now you can run the test suite by typing:

	node mbTests.js

### Using the JavaScript Client

You can explore the JavaScript client from the Node command line (REPL). First,
start Node by typing:

	node

Then paste these two lines of code to import and instatiate the Firmata client:

	var MBFirmataClient = require('./MBFirmataClient.js');
	var mb = new MBFirmataClient();

Run the following line to connect to the board:

	mb.connect();

Note: The connect() method will scan your serial/COM ports looking for one that has a micro:bit
connected, so it's easy to use. However, if you need more control, you can create and open
your own serial port and pass it into the client like this:

	mb.setSerialPort(anOpenSerialPort);

To verify that the board is responding, wait a second, then check the firmata version:

	mb.firmataVersion

If the board has replied to the initial version request, this will be a non-empty string like this:

	Firmata Protocol 2.6

To output a string to the display:

	mb.scrollString('Hello, Firmata!');

You can speed that up by specifying a delay parameter:

	mb.scrollString('Hello, Firmata!', 40);

The default delay is 120, so 40 is three times faster than normal.
