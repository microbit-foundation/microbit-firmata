var MBFirmataClient = require('./MBFirmataClient.js');
var MicroBit = require('./MicroBit.js');

mb = new MBFirmataClient();
mb.connect();
b = new MicroBit(mb);
