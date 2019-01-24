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

// Terminal cursor control

function clearScreen() {
	process.stdout.write('\033[2J');
}

function moveCursorTo(line, col) {
	process.stdout.write('\033[' + line + ';' + col + 'f');
}

// Tests

/* Each test is a class with:
 *		description()	- returns a short string describing the test
 *		constructor()	- initializes the test state
 *		step()			- takes the next action of the test, checks for completion
 *							and returns 'ok', 'fail', or '' (if test is still in progress)
 */

class TestX1 {
	description() { return 'keyPressed'; }
	constructor() {
		keyPressed = false;
	}
	step() {
		return keyPressed ? 'ok' : '';
	}
}

class TestX2 {
	description() { return 'timer callback'; }
	constructor() {
		this.phase = 0;
		this.startTime = new Date().getTime();
	}
	step() {
		var secs = (new Date().getTime() - this.startTime) / 100;
		secs = Math.trunc(secs);
		if (secs > this.phase) {
			this.phase = secs;
//			console.log(this.phase);
		}
		return (this.phase >= 10) ? 'ok' : '';
	}
}

class Test1 {
	description() { return 'board connectivity'; }
	constructor() {
		this.startTime = new Date().getTime();
		mb.firmataVersion = '';
		mb.connect();
	}
	step() {
		if (mb.firmataVersion.length > 0) return 'ok'; // got version
		var msecs = new Date().getTime() - this.startTime;
		if (msecs > 1000) {
			console.log('No response from board');
			return 'fail';
		}
		return '';
	}
}

class Test2 {
	description() { return 'scroll string'; }
	constructor() {
		mb.scrollString('test', 80);
	}
	step() {
		return (!mb.isScrolling) ? 'ok' : '';
	}
}

class Test3 {
	description() { return 'scroll number'; }
	constructor() {
		mb.scrollNumber(-123, 80);
	}
	step() {
		return (!mb.isScrolling) ? 'ok' : '';
	}
}

class Test4 {
	description() { return 'sensor streaming'; }
	constructor() {
		keyPressed = false;
		this.firstTime = true;
	}
	step() {
		if (this.firstTime) {
			this.firstTime = false;
			mb.setAnalogSamplingInterval(500);
			for (var i = 0; i < 16; i++) mb.streamAnalogChannel(i);
			clearScreen();
			moveCursorTo(18, 0);
			console.log('Sensor streaming test. Press any key to exit.');
		}
		this.showSensors();
		if (keyPressed) {
			for (var i = 0; i < 16; i++) mb.stopStreamingAnalogChannel(i);
			moveCursorTo(19, 0);
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
			process.stdout.write('          '); // erase old value
			moveCursorTo(line, 22);
			process.stdout.write(mb.analogChannel[i].toString());
		}
	}
}

function runTestList(testList) {
	var currentTest; // the current test
	function stepper() {
		if (!currentTest) {
			if (testList.length > 0) {
				currentTest = new (testList.shift());
				console.log(currentTest.constructor.name + ': ' + currentTest.description());
			} else {
				console.log('No more tests');
				process.exit();
			}
		}
		var status = currentTest.step();
		if ('ok' == status) {
			console.log('ok');
			currentTest = null;
		} else if ('fail' == status) {
			console.log('*** FAILED! ***');
			currentTest = null;
		}
	}
	initKeyboard();
	var ticker = setInterval(stepper, 100);
}

function runTest(aTest) {
	// Run a single test.

	runTestList([aTest]);
}

function runAllTests() {
	// Run entire test suite. New tests may be added to the list below.

	runTestList([
// 		TestX1,
// 		TestX2,
		Test1,
		Test2,
		Test3,
		Test4
	]);
}

function cursorTest() {
	clearScreen();
	for (var i = 1; i <= 16; i++) {
		moveCursorTo(i, 0);
		process.stdout.write(i.toString());
		moveCursorTo(i, 20);
		process.stdout.write((i * i).toString());
	}
	moveCursorTo(18, 0);
}

runAllTests();
//runTest(Test2);
