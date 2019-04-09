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

/* To do:
  [ ] digital input pins 0-2 (with display disabled)
  [ ] analog input pins 0-2 (with display disabled)
  [ ] digital output pins 0-2
  [ ] pwm output pins 0-2
  [ ] touch input tests
*/

var MBFirmataClient = require('./MBFirmataClient.js');
var mb = new MBFirmataClient();

// Keyboard input

var keyPressed = false;

function initKeyboard() {
	// Add a handler to set keyPressed to true when any key is pressed.
	// Exit the program if control-C is pressed.

	var stdin = process.stdin;
	stdin.setRawMode(true); // report keystrokes immediately rather than buffering
	stdin.on('data', function(key) {
		if ('\003' == key) process.exit(); // control-C
		keyPressed = true;
	});
	keyPressed = false;
}

// Timer

var startTime = 0;

function timerStart() {
	startTime = new Date().getTime();
}

function timerMSecs() {
	return (new Date().getTime()) - startTime;
}

// Cursor control

function clearScreen() {
	process.stdout.write('\033[2J');
}

function moveCursorTo(line, col) {
	process.stdout.write('\033[' + line + ';' + col + 'f');
}

function eraseToEndOfLine() {
	process.stdout.write('\033[K');
}

function setUnderline(flag) {
	if (flag) {
		process.stdout.write('\033[4m');
	} else {
		process.stdout.write('\033[0m');
	}
}

// Test Runner

function runTests(testList) {
	// Run all the tests in the given list of tests.

	var testsRun = 0;
	var currentTest; // the current test

	function stepper() {
		if (!currentTest) {
			if (testList.length > 0) {
				currentTest = new (testList.shift());
				console.log('Test: ' + currentTest.testName());
			} else {
				console.log('\nTesting complete. ' + testsRun + ' tests run.');
				process.exit();
			}
		}
		var status = currentTest.step();
		if ('done' == status) {
			testsRun++;
			currentTest = null;
		}
	}
	initKeyboard();
	var ticker = setInterval(stepper, 25);
}

// Tests

/* Each test is a class with:
 *		testName()		- returns the test name
 *		constructor()	- initializes the test, possibly printing instructions for the tester
 *		step()			- takes the next action of the test, checks for completion
 *						- returns 'done' when complete or '' if test is still in progress
 */

class ConnectivityTest {
	// Connect to board and verify that the board responds to firmataVersion request.
	// NOTE: This must be the first test.

	testName() { return 'Connectivity'; }
	constructor() {
		mb.disconnect();
		mb.firmataVersion = '';
		mb.connect();
		timerStart();
	}
	step() {
		if ((mb.firmataVersion.length > 0) && (mb.firmwareVersion.length > 0)) {
			console.log('    Micro:bit hardware', mb.boardVersion);
			console.log('    ' + mb.firmataVersion);
			console.log('    ' + mb.firmwareVersion);
			return 'done'; // got version
		}
		if (timerMSecs() > 1000) {
			console.log('No response from board.');
			console.log('Make sure micro:bit is connected and that Firmata firmware is installed.');
			console.log('Cannot proceed with other tests. Goodbye!');
			process.exit();
		}
		return '';
	}
}

class Test1 {
	testName() { return 'Scroll string'; }
	constructor() {
		mb.scrollString('abc', 80);
	}
	step() {
		return (!mb.isScrolling) ? 'done' : '';
	}
}

class Test2 {
	testName() { return 'Scroll number'; }
	constructor() {
		mb.scrollInteger(-123, 80);
	}
	step() {
		return (!mb.isScrolling) ? 'done' : '';
	}
}

class Test3 {
	testName() { return 'Plot and display'; }
	constructor() {
		this.phase = 0;
		this.x = 0;
		this.y = 0;
		mb.enableDisplay(true);
		timerStart();
	}
	step() {
		if ((0 == this.phase) && (timerMSecs() > 100)) {
			if (this.y < 5) {
				mb.displayPlot(this.x, this.y, 255);
				this.x++;
				if (this.x > 4) {
					this.x = 0;
					this.y++;
				}
			} else {
				this.x = 0;
				this.y = 0;
				this.phase = 1;
			}
		}
		if (1 == this.phase) {
			if (this.y < 5) {
				mb.displayPlot(this.x, this.y, 0);
				this.x++;
				if (this.x > 4) {
					this.x = 0;
					this.y++;
				}
			} else {
				this.x = 0;
				this.y = 0;
				this.phase = 2;
			}
		}
		if (2 == this.phase) {
			mb.displayShow(true, [
				[10,  10,  10,  10, 10],
				[10, 100, 100, 100, 10],
				[10, 100, 255, 100, 10],
				[10, 100, 100, 100, 10],
				[10,  10,  10,  10, 10]]);
			timerStart();
			this.phase = 3;
		}
		if ((3 == this.phase) && (timerMSecs() > 1000)) {
			mb.displayShow(false, [
				[0, 1, 0, 1, 0],
				[0, 1, 0, 1, 0],
				[0, 0, 0, 0, 0],
				[1, 0, 0, 0, 1],
				[0, 1, 1, 1, 0]]);
			timerStart();
			this.phase = 4;
		}
		if ((4 == this.phase) && (timerMSecs() > 1000)) {
			mb.enableDisplay(false);
			this.phase = 5;
		}
		return (this.phase >= 5) ? 'done' : '';
	}
}

class Test4 {
	testName() { return 'Analog streaming (w/ light sensor)'; }
	constructor() {
		keyPressed = false;
		this.firstTime = true;
		for (var pin = 0; pin < 3; pin++) mb.setPinMode(pin, mb.ANALOG_INPUT);
		mb.enableDisplay(true);
		mb.enableLightSensor();
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			mb.setAnalogSamplingInterval(100);
			for (var chan = 0; chan < 16; chan++) {
				mb.streamAnalogChannel(chan);
			}
			mb.clearChannelData();
			clearScreen();
			moveCursorTo(18, 0);
			console.log(this.testName());
			console.log('Note: A DAL bug causes analog inputs 0-2 to report "255"');
			console.log('much of the time when the light sensor is running.');
			console.log('The next test will disable the light sensor.');
			console.log('Press any key to exit.');
		}
		this.showSensors();
		if (keyPressed) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			moveCursorTo(18, 0);
			eraseToEndOfLine();
			return 'done';
		}
		return '';
	}
	showSensors() {
		var channelNames = [
			'pin 0', 'pin 1', 'pin 2', 'pin 3', 'pin 4', 'pin 5', '(unused)', '(unused)',
			'accelerometer x', 'accelerometer y', 'accelerometer z',
			'light sensor', 'temperature',
			'magnetometer x', 'magnetometer y', 'magnetometer z'];

		for (var i = 0; i < 16; i++) {
			var line = i + 1;
			moveCursorTo(line, 0);
			process.stdout.write(i.toString());
			moveCursorTo(line, 4);
			process.stdout.write(channelNames[i]);
			moveCursorTo(line, 22);
			eraseToEndOfLine();
			moveCursorTo(line, 22);
			process.stdout.write(mb.analogChannel[i].toString());
		}
	}
}

class Test5 {
	testName() { return 'Analog streaming (light sensor disabled)'; }
	constructor() {
		keyPressed = false;
		this.firstTime = true;
		for (var pin = 0; pin < 3; pin++) mb.setPinMode(pin, mb.ANALOG_INPUT);
		mb.enableDisplay(false);
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			mb.setAnalogSamplingInterval(100);
			for (var chan = 0; chan < 16; chan++) {
				if (chan != 11) mb.streamAnalogChannel(chan);
			}
			mb.clearChannelData();
			clearScreen();
			moveCursorTo(18, 0);
			console.log(this.testName());
			console.log('Press any key to exit.');
		}
		this.showSensors();
		if (keyPressed) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			moveCursorTo(18, 0);
			eraseToEndOfLine();
			return 'done';
		}
		return '';
	}
	showSensors() {
		var channelNames = [
			'pin 0', 'pin 1', 'pin 2', 'pin 3', 'pin 4', 'pin 5', '(unused)', '(unused)',
			'accelerometer x', 'accelerometer y', 'accelerometer z',
			'light sensor', 'temperature',
			'magnetometer x', 'magnetometer y', 'magnetometer z'];

		for (var i = 0; i < 16; i++) {
			var line = i + 1;
			moveCursorTo(line, 0);
			process.stdout.write(i.toString());
			moveCursorTo(line, 4);
			process.stdout.write(channelNames[i]);
			moveCursorTo(line, 22);
			eraseToEndOfLine();
			moveCursorTo(line, 22);
			process.stdout.write(mb.analogChannel[i].toString());
		}
	}
}

class Test6 {
	testName() { return 'Button events'; }
	constructor() {
		this.buttonEventNames = ['', 'down', 'up', 'click', 'long-click', 'hold'];
		this.buttonAEvents = new Array(6).fill(0);
		this.buttonBEvents = new Array(6).fill(0);
		this.lastEvent = 0;
		keyPressed = false;
		mb.addFirmataEventListener(this.gotEvent.bind(this));
		this.firstTime = true;
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			clearScreen();
			this.showButtonEvents();
			moveCursorTo(10, 0);
			console.log('Click or hold A and B buttons to generate events. Press any key to exit.');
		}
		if (keyPressed) {
			mb.removeAllFirmataListeners();
			return 'done';
		}
		return '';
	}
	gotEvent(sourceID, eventID) {
		if (1 == sourceID) this.buttonAEvents[eventID]++;
		if (2 == sourceID) this.buttonBEvents[eventID]++;
		if ((1 == sourceID) || (2 == sourceID)) this.lastEvent = eventID;
		this.showButtonEvents();
	}
	showButtonEvents() {
		moveCursorTo(1, 0); eraseToEndOfLine();
		setUnderline(true);
		moveCursorTo(1, 0); process.stdout.write('Event');
		moveCursorTo(1, 20); process.stdout.write('A');
		moveCursorTo(1, 30); process.stdout.write('B');
		setUnderline(false);
		for (var i = 1; i <= 5; i++) {
			var line = i + 1;
			moveCursorTo(line, 0);
			eraseToEndOfLine();
			moveCursorTo(line, 0);
			process.stdout.write(this.buttonEventNames[i]);
			moveCursorTo(line, 20);
			process.stdout.write(this.buttonAEvents[i].toString());
			moveCursorTo(line, 30);
			process.stdout.write(this.buttonBEvents[i].toString());
			eraseToEndOfLine();
		}
		moveCursorTo(8, 0); eraseToEndOfLine();
		process.stdout.write('Last event: ' + this.buttonEventNames[this.lastEvent] + '\n\n');
	}
}

class Test7 {
	testName() { return 'Tilt events'; }
	constructor() {
		this.buttonEventNames = ['', 'up', 'down', 'left', 'right',
			'face-up', 'face-down', 'freefall', '3G', '6G', '8G', 'shake'];
		this.events = new Array(12).fill(0);
		this.lastEvent = 0;
		keyPressed = false;
		mb.streamAnalogChannel(8); // enable accelerometer
		mb.addFirmataEventListener(this.gotEvent.bind(this));
		this.firstTime = true;
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			clearScreen();
			this.showGestureEvents();
			moveCursorTo(16, 0);
			console.log('Tilt micro:bit in all directions and shake it to generate events.');
			console.log('Press any key to exit.');
		}
		if (keyPressed) {
			mb.removeAllFirmataListeners();
			clearScreen();
			return 'done';
		}
		return '';
	}
	gotEvent(sourceID, eventID) {
		if (27 == sourceID) {
			this.events[eventID]++;
			this.lastEvent = eventID;
			this.showGestureEvents();
		}
	}
	showGestureEvents() {
		moveCursorTo(1, 0); eraseToEndOfLine();
		setUnderline(true);
		moveCursorTo(1, 0); process.stdout.write('Event');
		moveCursorTo(1, 18); process.stdout.write('Count');
		setUnderline(false);
		for (var i = 1; i <= 11; i++) {
			var line = i + 1;
			moveCursorTo(line, 0);
			eraseToEndOfLine();
			moveCursorTo(line, 0);
			process.stdout.write(this.buttonEventNames[i]);
			moveCursorTo(line, 20);
			process.stdout.write(this.events[i].toString());
			eraseToEndOfLine();
		}
		moveCursorTo(14, 0); eraseToEndOfLine();
		process.stdout.write('Last event: ' + this.buttonEventNames[this.lastEvent] + '\n\n');
//xxx		moveCursorTo(19, 0);
	}
}

class Test8 {
	testName() { return 'Read analog input pins 0-2.'; }
	constructor() {
		keyPressed = false;
		this.firstTime = true;
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			mb.setAnalogSamplingInterval(100);
			for (var i = 0; i < 3; i++) {
				mb.setPinMode(i, mb.ANALOG_INPUT);
				mb.streamAnalogChannel(i);
			}
			mb.clearChannelData();
			clearScreen();
			moveCursorTo(5, 0);
			console.log(this.testName());
			console.log('Touch each pin with your finger to see value change. Press any key to exit.');
		}
		this.showSensors();
		if (keyPressed) {
			for (var i = 0; i < 3; i++) mb.stopStreamingAnalogChannel(i);
			mb.enableDisplay(true);
//xxx			moveCursorTo(6, 0);
			clearScreen();
			return 'done';
		}
		return '';
	}
	showSensors() {
		var channelNames = ['Pin 0', 'Pin 1', 'Pin 2'];
		for (var i = 0; i < 3; i++) {
			var line = i + 1;
			moveCursorTo(line, 0);
			eraseToEndOfLine();
			moveCursorTo(line, 0);
			process.stdout.write(channelNames[i]);
			moveCursorTo(line, 10);
			process.stdout.write(mb.analogChannel[i].toString());
		}
		moveCursorTo(7, 0);
	}
}

class Test9 {
	testName() { return 'Read digital input pins 0-2.'; }
	constructor() {
		keyPressed = false;
		this.firstTime = true;
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			mb.setAnalogSamplingInterval(100);
			for (var i = 0; i < 3; i++) mb.trackDigitalPin(i, 1);
			mb.clearChannelData();
			clearScreen();
			moveCursorTo(5, 0);
			console.log(this.testName());
			console.log('Connect each pin to GND see value change. Press any key to exit.');
		}
		this.showSensors();
		if (keyPressed) {
			mb.stopTrackingDigitalPins();
			mb.enableDisplay(true);
//xxx			moveCursorTo(6, 0);
			clearScreen();
			return 'done';
		}
		return '';
	}
	showSensors() {
		var channelNames = ['Pin 0:', 'Pin 1:', 'Pin 2:'];
		for (var i = 0; i < 3; i++) {
			var line = i + 1;
			moveCursorTo(line, 0);
			eraseToEndOfLine();
			process.stdout.write(channelNames[i]);
			moveCursorTo(line, 9);
			process.stdout.write(mb.digitalInput[i] ? 'High' : 'Low');
		}
		moveCursorTo(7, 0);
	}
}

class Test10 {
	testName() { return 'Toggle pins 0-2.'; }
	constructor() {
		keyPressed = false;
		this.state0 = false;
		this.state1 = false;
		this.state2 = false;
		this.timer0 = setInterval(this.toggle0.bind(this), 50);
		this.timer1 = setInterval(this.toggle1.bind(this), 100);
		this.timer2 = setInterval(this.toggle2.bind(this), 300);
		this.firstTime = true;
	}
	toggle0() {
		this.state0 = !this.state0;
		mb.setDigitalOutput(0, this.state0);
	}
	toggle1() {
		this.state1 = !this.state1;
		mb.setDigitalOutput(1, this.state1);
	}
	toggle2() {
		this.state2 = !this.state2;
		mb.setDigitalOutput(2, this.state2);
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			clearScreen();
			moveCursorTo(1, 0);
			console.log('Toggling pins at different rates. Connect an LED to each pin to see output.');
			console.log('Press any key to exit.');
		}
		if (keyPressed) {
			clearInterval(this.timer0);
			clearInterval(this.timer1);
			clearInterval(this.timer2);
			mb.setPinMode(0, mb.DIGITAL_INPUT);
			mb.setPinMode(1, mb.DIGITAL_INPUT);
			mb.setPinMode(2, mb.DIGITAL_INPUT);
			return 'done';
		}
	}
}

class Test11 {
	testName() { return 'Pulse-width modulation (PWM) digital output on pins 0-2'; }
	constructor() {
		keyPressed = false;
		mb.setAnalogOutput(0, 50);
		mb.setAnalogOutput(1, 200);
		mb.setAnalogOutput(2, 1000);
		this.firstTime = true;
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			clearScreen();
			moveCursorTo(1, 0);
			console.log('Pins 0, 1, and 2 set to different duty cycles. Connect an LED to each pin to see brightness differences.');
			console.log('Press any key to exit.');
		}
		if (keyPressed) {
			mb.setPinMode(0, mb.DIGITAL_INPUT);
			mb.setPinMode(1, mb.DIGITAL_INPUT);
			mb.setPinMode(2, mb.DIGITAL_INPUT);
			return 'done';
		}
	}
}

class Test20 {
	testName() { return 'Stress test, single channel'; }
	constructor() {
		mb.enableDisplay(false);
		mb.setAnalogSamplingInterval(1);
		mb.streamAnalogChannel(6); // unused channel; always zero
		mb.clearChannelData();
		timerStart();
		this.samplingTime = 0;
		this.sampling = true;
	}
	step() {
		var msecs = timerMSecs();
		if (this.sampling && (msecs > 1000)) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			this.samplingTime = msecs;
			this.sampling = false;
		}
		if (msecs > 1100) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			var bytesPerSec = Math.round((3 * mb.analogUpdateCount * 1000) / this.samplingTime);
			console.log('    received', mb.analogUpdateCount,
						'samples in', this.samplingTime, 'msecs',
						('(' + bytesPerSec + ' bytes/sec)'));
//			console.log(mb.channelUpdateCounts);
			return 'done';
		}
		return '';
	}
}

class Test21 {
	testName() { return 'Stress test, 16 channels'; }
	constructor() {
		mb.enableDisplay(false);
		mb.setAnalogSamplingInterval(1);
		for (var i = 0; i < 16; i++) mb.streamAnalogChannel(i);
		mb.clearChannelData();
		timerStart();
		this.samplingTime = 0;
		this.sampling = true;
	}
	step() {
		var msecs = timerMSecs();
		if (this.sampling && (msecs > 1100)) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			this.samplingTime = msecs;
			this.sampling = false;
		}
		if (msecs > 1500) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			var bytesPerSec = Math.round((3 * mb.analogUpdateCount * 1000) / this.samplingTime);
			console.log('    received', mb.analogUpdateCount,
						'samples in', this.samplingTime, 'msecs',
						('(' + bytesPerSec + ' bytes/sec)'));
//			console.log(mb.channelUpdateCounts);
			return 'done';
		}
		return '';
	}
}

// Run all tests

function runAllTests() {
	// Run entire test suite.

	runTests([
		ConnectivityTest, // this must be the first test
// 		Test1,
// 		Test2,
// 		Test3,
// 		Test4,
// 		Test5,
		Test6,
		Test7,
		Test8,
		Test9,
		Test10,
		Test11,
		Test20,
		Test21
	]);
}

runAllTests();
//mb.connect();
