'use strict';

/**
 * @module serialport
 * @copyright Chris Williams <chris@iterativedesigns.com>
 */

const SerialPort = require('./serialport');
const Binding = require('./bindings/chrome');
const parsers = require('./parsers');

SerialPort.Binding = Binding;
SerialPort.parsers = parsers;

module.exports = SerialPort;

