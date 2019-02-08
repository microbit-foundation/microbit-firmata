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
  [ ] digital input pins 0-5 (with display disabled)
  [ ] analog input pins 0-5 (with display disabled)
  [ ] accelerometer test (readings and events)
  [ ] other sensor tests (readings; do after analog pin tests)
  [ ] button tests (check for all possible events)

  [ ] display tests (monitor events to know when scrolling done)
  [ ] sensor test (press key to exit)
  [ ] tilt tests
  [ ] button tests
  [ ] touch input tests
  [ ] protocol: incomplete message rejection
  [ ] protocol: unknown message rejection
  [x] test framework
  [x] protocol: can get firmata version? (tests basic connectivity)
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

// Test Runner

function runTests(testList) {
	// Run all the tests in the given list of tests.

	var currentTest; // the current test
	function stepper() {
		if (!currentTest) {
			if (testList.length > 0) {
				currentTest = new (testList.shift());
			} else {
				console.log('No more tests');
				process.exit();
			}
		}
		var status = currentTest.step();
		if ('ok' == status) {
			console.log(currentTest.testName() + ': passed');
			currentTest = null;
		} else if ('fail' == status) {
			console.log(currentTest.testName() + ': *** FAILED! ***');
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
 *						- returns 'ok', 'fail', or '' if test is still in progress
 */

class ConnectivityTest {
	// Connect to board and verify that the board responds to firmataVersion request.
	// NOTE: This must be the first test.

	testName() { return 'Board connectivity'; }
	constructor() {
		mb.disconnect();
		mb.firmataVersion = '';
		mb.connect();
		timerStart();
	}
	step() {
		if ((mb.firmataVersion.length > 0) && (mb.firmwareVersion.length > 0)) {
			console.log('Micro:bit hardware', mb.boardVersion);
			console.log(mb.firmataVersion);
			console.log(mb.firmwareVersion);
			return 'ok'; // got version
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
		mb.scrollString('TEST', 80);
	}
	step() {
		return (!mb.isScrolling) ? 'ok' : '';
	}
}

class Test2 {
	testName() { return 'Scroll number'; }
	constructor() {
		mb.scrollInteger(-123, 80);
	}
	step() {
		return (!mb.isScrolling) ? 'ok' : '';
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
		return (this.phase >= 5) ? 'ok' : '';
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
			console.log('Analog streaming (w/ light sensor). Press any key to exit.');
		}
		this.showSensors();
		if (keyPressed) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			moveCursorTo(18, 0);
			eraseToEndOfLine();
			return 'ok';
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

class Test4NoLight {
	testName() { return 'Analog streaming (no light sensor)'; }
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
			console.log('Analog streaming (no light sensor). Press any key to exit.');
		}
		this.showSensors();
		if (keyPressed) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			moveCursorTo(18, 0);
			eraseToEndOfLine();
			return 'ok';
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
	testName() { return 'Stress test: 1 channel'; }
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
			console.log('total: ', mb.analogUpdateCount,
						'samples in', this.samplingTime, 'msecs',
						('(' + bytesPerSec + ' bytes/sec)'));
//			console.log(mb.channelUpdateCounts);
			return 'ok';
		}
		return '';
	}
}

class Test6 {
	testName() { return 'Stress test: 16 channels'; }
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
			console.log('total: ', mb.analogUpdateCount,
						'samples in', this.samplingTime, 'msecs',
						('(' + bytesPerSec + ' bytes/sec)'));
//			console.log(mb.channelUpdateCounts);
			return 'ok';
		}
		return '';
	}
}

class Test7 {
	testName() { return 'Events'; }
	constructor() {
		keyPressed = false;
		mb.streamAnalogChannel(8); // ensure accelerometer is on (xxx make sure defaults to on)
		mb.addFirmataEventListener(this.gotEvent.bind(this));
		console.log('Receiving events. Press any key to exit.');
	}
	step() {
		if (keyPressed) {
			mb.removeAllFirmataListeners();
			return 'ok';
		}
		return '';
	}
	gotEvent(sourceID, eventID) {
		console.log('evt', sourceID, eventID);
	}
}

class Test8 {
	testName() { return 'digital output'; }
	constructor() {
		keyPressed = false;
		this.state0 = false;
		this.state1 = false;
		this.state2 = false;
		this.timer0 = setInterval(this.toggle0.bind(this), 3);
		this.timer1 = setInterval(this.toggle1.bind(this), 2);
		this.timer2 = setInterval(this.toggle2.bind(this), 1);
		console.log('Toggling pins 0, 1, and 2. Connect an LED to see output.');
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
		if (keyPressed) {
			clearInterval(this.timer0);
			clearInterval(this.timer1);
			clearInterval(this.timer2);
			return '';
		}
	}
	gotEvent(sourceID, eventID) {
		console.log('evt', sourceID, eventID);
	}
}

// Run all tests

function runAllTests() {
	// Run entire test suite.

	runTests([
		ConnectivityTest,
		Test1,
		Test2,
		Test3,
		Test4,
		Test4NoLight,
		Test5,
		Test6,
//		Test7,
//		Test8
	]);
}

runAllTests();
//mb.connect();
