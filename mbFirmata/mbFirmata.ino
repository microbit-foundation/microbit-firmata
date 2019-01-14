#include "mbFirmata.h"

void setup() {
	Serial.begin(57600);
	initFirmata();
}

void loop() {
	stepFirmata();
}
