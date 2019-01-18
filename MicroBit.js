const serialport = require('serialport');
const EventEmitter = require('events');

/**
 * Top-level controller for BBC micro:bit board.
 * Call constructor with an MBFirmataClient that has already been connected.
 *
 * @extends EventEmitter from NodeJS (available in browser code via webpack's node-libs-browser)
 *	@see https://nodejs.org/api/events.html#events_class_eventemitter
 *	@see https://github.com/webpack/node-libs-browser
 * @see http://usejsdoc.org if any annotations aren't clear
 */

class MicroBit extends EventEmitter {
	/**
	* @param {SerialPort|ChromeSerialPort} serialport
	*	@see https://serialport.io/docs/en/api-serialport
	*	@see https://github.com/code-dot-org/code-dot-org/blob/staging/apps/src/lib/kits/maker/CircuitPlaygroundBoard.js#L270-L290
	*/
	constructor(mbFirmataClient) {
		super();

		/** @member {LedMatrix} */
		this.ledMatrix = new LedMatrix(mbFirmataClient);

		/** @member {MBButton} */
		this.buttonA = new MBButton(mbFirmataClient, 1);

		/** @member {MBButton} */
		this.buttonB = new MBButton(mbFirmataClient, 2);

		/** @member {Accelerometer} */
		this.accelerometer = new Accelerometer(mbFirmataClient);

		/** @member {LightSensor} */
		this.lightSensor = new LightSensor(mbFirmataClient);

		/** @member {Array.<TouchPin>} */
		this.touchPins = new Array();
		for (var i = 0; i < 3; i++) this.touchPins.push(new TouchPin(mbFirmataClient, i));
	}

	/**
	* @event MicroBit#ready
	* Emits after construction if connection to the board is successful.
	*/

	/**
	* @event MicroBit#error
	* Emits when a connection attempt fails. (Include error details?)
	*/

	/**
	* @event MicroBit#disconnect
	* Emits when a board disconnect is detected.
	*/
}

class LedMatrix {
	constructor(mbFirmataClient) {
		this.mbFirmataClient = mbFirmataClient;
		this.mbFirmataClient.addFirmataEventListener(this.handleFirmataEvent.bind(this));
		this.isScrolling = false; // true while scrolling in progress
		this.leds = [
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0]];
	}

	/**
	* Was not included in the spec but this seemed potentially useful to students.
	* @param {number} x (range 0..4)
	* @param {number} y (range 0..4)
	* @return {number} 0 or 1
	*/
	getLed(x, y) {
		if ((x < 0) || (x > 4) || (y < 0) || (y > 4)) return 0;
		return leds[y][x];
	}

	/**
	* Turn an individual LED on or off.
	* @param {number} x (range 0..4)
	* @param {number} y (range 0..4)
	* @param {number} brightness 0 or 1 for B&W or 0-255 for grayscale
	*/
	setLed(x, y, brightness) {
		if ((x < 0) || (x > 4) || (y < 0) || (y > 4)) return;
		var grayscaleMode = (brightness > 1);
		leds[y][x] = brightness;
		this.mbFirmataClient.displayShow(grayscaleMode, leds);
	}

	/**
	* Set the state of all display LEDs at once.
	* If any pixel value is > 1, use grayscale mode (brightness range 1..255).
	* @param {Array.<Array.<number>>} leds
	* @example
	*	microBit.ledMatrix.setDisplay([
	*		[0, 0, 1, 0, 0],
	*		[0, 1, 0, 0, 0],
	*		[0, 0, 1, 0, 0],
	*		[0, 0, 0, 1, 0],
	*		[0, 0, 1, 0, 0],
	*	]);
	*/
	setDisplay(leds) {
		var grayscaleMode = false;
		for (var y = 0; y < 5; y++) {
			for (var x = 0; x < 5; x++) {
				var pix = leds[y][x];
				if (pix > 1) grayscaleMode = true;
				this.leds[y][x] = pix;
			}
		}
		this.mbFirmataClient.displayShow(grayscaleMode, leds);
	}

	/**
	* Show a string on the display (animated marquee).
	* @param {string} text
	* @param {number} [interval] (default: 120)
	* @see https://makecode.microbit.org/reference/basic/show-string
	*/
	showString(text, interval) {
		if (null == interval) interval = 120;
		this.isScrolling = true;
		this.mbFirmataClient.scrollString(text, interval);
	}

	/**
	* Show an integer on the display (animated marquee).
	* @param {number} n
	* @param {number} [interval] (default: 120)
	*/
	showNumber(n, interval) {
		if (null == interval) interval = 120;
		this.isScrolling = true;
		this.mbFirmataClient.scrollNumber(n, interval);
	}

	handleFirmataEvent(sourceID, eventID) {
		const MICROBIT_ID_DISPLAY = 6;
		const MICROBIT_DISPLAY_EVT_ANIMATION_COMPLETE = 1;
		if ((sourceID == MICROBIT_ID_DISPLAY) &&
			(eventID == MICROBIT_DISPLAY_EVT_ANIMATION_COMPLETE)) {
				this.isScrolling = false;
		}
	}
}

class MBButton extends EventEmitter {
	constructor(mbFirmataClient, buttonID) {
		super();
		this.mbFirmataClient = mbFirmataClient;
		this.buttonID = buttonID;
		this.mbFirmataClient.addFirmataEventListener(this.handleFirmataEvent.bind(this));

		/**
		* Whether the button is currently down.
		* @member {boolean}
		* @readonly
		*/
		this.isPressed = false;
	}

	/**
	* @event Button#down
	*/

	/**
	* @event Button#up
	*/

	handleFirmataEvent(sourceID, eventID) {
		const MICROBIT_BUTTON_EVT_DOWN = 1;
		const MICROBIT_BUTTON_EVT_UP = 2;
		if (sourceID == this.buttonID) {
			if (MICROBIT_BUTTON_EVT_DOWN == eventID) {
				this.isPressed = true;
				// emit Button#down
			}
			if (MICROBIT_BUTTON_EVT_UP == eventID) {
				this.isPressed = false;
				// emit Button#up
			}
		}
	}
}

class Accelerometer extends EventEmitter {
	constructor(mbFirmataClient) {
		super();
		this.mbFirmataClient = mbFirmataClient;
		this.mbFirmataClient.addFirmataEventListener(this.handleFirmataEvent.bind(this));
		this.mbFirmataClient.addFirmataUpdateListener(this.handleFirmataUpdate.bind(this));

		/** @member {number} */
		this.x = 0;
		/** @member {number} */
		this.y = 0;
		/** @member {number} */
		this.z = 0;
	}

	/**
	* Begin streaming accelerometer data.
	*/
	enable() {
		this.mbFirmataClient.streamAnalogChannel(8);
		this.mbFirmataClient.streamAnalogChannel(9);
		this.mbFirmataClient.streamAnalogChannel(10);
	}

	/**
	* Stop streaming accelerometer data.
	*/
	disable() {
		this.mbFirmataClient.stopStreamingAnalogChannel(8);
		this.mbFirmataClient.stopStreamingAnalogChannel(9);
		this.mbFirmataClient.stopStreamingAnalogChannel(10);
	}

	/**
	* @event Accelerometer#change
	* @type {object}
	* @property {number} x
	* @property {number} y
	* @property {number} z
	*/

	/**
	* @event Accelerometer#shake
	*/

	/**
	* Accelerometer event received from micro:bit.
	*/
	handleFirmataEvent(sourceID, eventID) {
		const MICROBIT_ID_GESTURE = 27;
		if (sourceID == MICROBIT_ID_GESTURE) {
			// emit Accelerometer#shake or Accelerometer#freefall events
		}
	}

	/**
	* Accelerometer update received from micro:bit.
	*/
	handleFirmataUpdate() {
		this.x = this.mbFirmataClient.analogChannel[8];
		this.y = this.mbFirmataClient.analogChannel[9];
		this.z = this.mbFirmataClient.analogChannel[10];
		// emit Accelerometer#change event if necessary
	}
}

class LightSensor extends EventEmitter {
	constructor(mbFirmataClient) {
		super();
		this.mbFirmataClient = mbFirmataClient;
		this.mbFirmataClient.addFirmataUpdateListener(this.handleFirmataUpdate.bind(this));

		/** @member {array} the last N samples to be averaged */
		this.sampleValues = new Array(3).fill(0);

		/** @member {number} How much the value must change by to trigger a change event */
		this.threshold = 5;

		/** @member {number} How much the value must change by to trigger a change event */
		this.lastScaledValue = 0;
	}

	/**
	* Begin streaming light sensor data.
	*/
	enable() {
		this.mbFirmataClient.streamAnalogChannel(11);
	}

	/**
	* Stop streaming light sensor data.
	*/
	disable() {
		this.mbFirmataClient.stopStreamingAnalogChannel(11);
	}

	/**
	* Get the average value of the light sensor scaled to the given range.
	* @param {number} min minimum value of output range
	* @param {number} max minimum value of output range
	*	Open question: What's a reasonable maximum here?
	*	Open question: How do we communicate about maximum resolution / reasonable minimum?
	* @return {number} average value
	*/
	getScaledValue(min, max) {
		var total = 0;
		if (this.sampleValues.length == 0) this.sampleValues.push(0); // ensure not empty
		for (var i = 0; i < this.sampleValues.length; i++) {
			total += this.sampleValues[i];
		}
		var normalizedAverage = (total / this.sampleValues.length) / 255;
		return min + (normalizedAverage * (max - min));
	}

	/**
	* Sets the number of past light sensor values to include in the average.
	* @param {number} n
	*/
	setAverageCount(n) {
		if (n < 1) return; // must have at least one sample
		if (n > this.sampleValues.length) { // shrink if needed
			this.sampleValues = this.sampleValues.slice(0, n);
		}
		while (this.sampleValues.length < n) { // grow if needed
			this.sampleValues.unshift(0);
		}
	}

	/**
	* @event LightSensor#change
	* @type {number} scaled light sensor value
	*/

	/**
	* Lightsensor update received from micro:bit.
	*/
	handleFirmataUpdate() {
		this.sampleValues.push(this.mbFirmataClient.analogChannel[11]);
		if (this.sampleValues.length > 1) this.sampleValues.shift(); // remove oldest sample
	}
}

class TouchPin extends EventEmitter {
	constructor(mbFirmataClient, pinNum) {
		super();
		this.mbFirmataClient = mbFirmataClient;
		this.mbFirmataClient.addFirmataEventListener(this.handleFirmataEvent.bind(this));
		this.pinID = pinNum + 7; // pins 0-2 are touch event sources 7-9

		/** @member {boolean} Whether the touch pin is "down" */
		this.isPressed = false;
	}

	/**
	* Enable touch events on this pin.
	*/
	enable() {
		this.mbFirmataClient.setTouchMode(this.pinID - 7, true);
	}

	/**
	* Disable touch events on this pin.
	*/
	disable() {
		this.mbFirmataClient.setTouchMode(this.pinID - 7, false);
	}

	/**
	* @event TouchPin#down
	*/

	/**
	* @event TouchPin#up
	*/

	/**
	* Pin touch event received from micro:bit.
	*/
	handleFirmataEvent(sourceID, eventID) {
		const MICROBIT_BUTTON_EVT_DOWN = 1;
		const MICROBIT_BUTTON_EVT_UP = 2;
		if (sourceID == this.pinID) {
			if (MICROBIT_BUTTON_EVT_DOWN == eventID) {
				this.isPressed = true;
				// emit TouchPin#down
			}
			if (MICROBIT_BUTTON_EVT_UP == eventID) {
				this.isPressed = false;
				// emit TouchPin#up
			}
		}
	}

}

module.exports = MicroBit;
