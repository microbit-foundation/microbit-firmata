## BBC micro:bit Firmata Client

The Firmata Client is a Javascript class that runs in Node.js and communicates
with the micro:bit Firmata firmware over a USB-serial connection. It implements the
Firmata protocol and provides properties and methods for interacting with the micro:bit.

### Connecting

<dl>
  <dt>connect()</dt>
  <dd>Connect to the board. Scans serials ports to find one with a micro:bit connected.</dd>
  <dt>setSerialPort(port)</dt>
  <dd>Alternative to connect() that allows the client to supply an open serial port.
  	Used by clients that  do their own serial port management.</dd>
  <dt>disconnect()</dt>
  <dd>Disconnect the serial port. Seldom needed.</dd>
</dl>


### Version Information

<dl>
  <dt>firmataVersion</dt>
  <dd>Returns the version of Firmata protocol used.</dd>
  <dt>firmwareVersion</dt>
  <dd>Returns the Firmata firmware version DAL, mbed library, and soft device versions.</dd>
  <dt>boardVersion()</dt>
  <dd>Returns the micro:bit hardware version (currently either 1.3 or 1.5).</dd>
</dl>

### Display

<dl>
  <dt>scrollText(string, delay)</dt>
  <dd>Scroll the given text across the display. The optional delay parameter controls the
	scroll speed, with smaller numbers resulting in faster speeds. The default value is 120.</dd>
  <dt>scrollInteger(number, delay)</dt>
  <dd>Scroll the given integer across the display. The optional delay parameter controls the
	scroll speed, with smaller numbers resulting in faster speeds. The default value is 120.</dd>
  <dt>isScrolling</dt>
  <dd>True while text is actively scrolling across the display.</dd>
</dl>

### Buttons

These two properties reflect the state of buttons A and B. The buttons also generate
events (see the **Events** section).

<dl>
  <dt>buttonAPressed<br>
  	  buttonBPressed</dt>
  <dd>Boolean values that reflect the current button state. True when the given button is pressed.</dd>
</dl>

### Events

tbd

### Analog Pins and Sensors

tbd

### Digital Pins

tbd
