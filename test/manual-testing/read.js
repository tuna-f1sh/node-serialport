/* eslint-disable node/no-missing-require */
'use strict';
const SerialPort = require('../../');
const ByteLength = SerialPort.parsers.ByteLength;
const exec = require('child_process').exec;

// Serial receiver device 
const port = process.env.TEST_PORT_RX;
// Expected number of bytes to receive (should make `size` in drain.js)
const expected = 512;

if (!port) {
  console.error('Please pass TEST_PORT_RX environment variable');
  process.exit(1);
}

// Create read device
const serialPort = new SerialPort(port, (err) => {
  if (err) { throw err }
});

serialPort.on('open', () => {
  // Run the drain script from the sender device
  exec('node drain.js', (err, stdout) => {
    if (err) {
      // node couldn't execute the command
      process.exit(1);
    }

    console.log(stdout);
    const parser = serialPort.pipe(new ByteLength({ length: expected }));

    // Read back the data received on the read device after a short timout to ensure transmission
    parser.on('data', (data) => {
      console.log(`Sucessfully received data dength: ${data.length} B`);
      process.exit(0);
    });

    // Set a timeout so the process exits if no data received
    setTimeout(() => {
      const data = serialPort.read();
      if (data != null) {
        console.log(`Receive data timeout: ${data.length} B of ${expected} B received`);
      } else {
        console.log(`Receive data timeout: 0 B of ${expected} B received`);
      }
      process.exit(1);
    }, 10000);
  });
});
