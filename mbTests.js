/* To do:
  [x] test framework
  [ ] protocol: can get firmata version? (tests basic connectivity)
  [ ] protocol: incomplete message rejection
  [ ] protocol: unknown message rejection
  [ ] sensor test (press key to exit)
  [ ] display tests (monitor events to know when scrolling done)
  [ ] tilt tests
  [ ] button tests
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

// Terminal cursor control

function clearScreen() {
	process.stdout.write('\033[2J');
}

function moveCursorTo(line, col) {
	process.stdout.write('\033[' + line + ';' + col + 'f');
}

// Tests

class TestX1 {
	constructor() {
		keyPressed = false;
	}
	step() {
		return keyPressed;
	}
}

class TestX2 {
	constructor() {
		this.phase = 0;
		this.startTime = new Date().getTime();
		console.log('TestX2 started at', this.startTime);
	}
	step() {
		var secs = (new Date().getTime() - this.startTime) / 100;
		secs = Math.trunc(secs);
		if (secs > this.phase) {
			this.phase = secs;
			console.log(this.phase);
		}
		return (this.phase >= 10);
	}
}

class Test1 {
	constructor() {
		this.startTime = new Date().getTime();
		mb.firmataVersion = '';
		mb.connect();
	}
	step() {
		if (mb.firmataVersion.length > 0) return true; // got version
		var msecs = new Date().getTime() - this.startTime;
console.log(msecs);
		if (msecs > 1000) {
			console.log('No response from board; test failed!');
			return true;
		}
	}
}

function runTestList(testList) {
	var currentTest; // the current test
	function stepper() {
		if (!currentTest) {
			if (testList.length > 0) {
				currentTest = new (testList.shift());
				console.log('Starting:', currentTest.constructor.name);
			} else {
				console.log('No more tests');
				process.exit();
			}
		}
		var stop = currentTest.step();
		if (stop) {
			console.log('Finished:', currentTest.constructor.name);
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
		TestX1,
		TestX2
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

//runAllTests();
runTest(Test1);

