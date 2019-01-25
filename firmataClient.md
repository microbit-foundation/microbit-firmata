## BBC micro:bit Firmata Client

The BBC micro:bit Firmata Client is a Javascript class that runs in Node.js and communicates
with the micro:bit Firmata firmware over a USB-serial connection. It implements the
Firmata protocol and provides a number of entry points for controlling the micro:bit
and for receiving sensor data and events from the micro:bit.

### Read-only Properties

A Firmata client instance contains the following useful read-only properties:

<dl>
  <dt>firmataVersion</dt>
  <dd>Returns the version of Firmata protocol used</dd>
  <dt>firmwareVersion</dt>
  <dd>Returns the firmware version and other information</dd>
  <dt>buttonAPressed<br>
  	  buttonBPressed</dt>
  <dd>Boolean values the reflect the current button state. They are true when a button is pressed.</dd>
  <dt>buttonAPressed</dt>
  <dt>buttonBPressed</dt>
  <dd>Boolean values the reflect the current button state. They are true when a button is pressed.</dd>
</dl>
