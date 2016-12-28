'use strict';
const BaseBinding = require('./base');

function promisifyChrome(context, functionName) {
  return function() {
    return new Promise((resolve, reject) => {
      const args = Array.prototype.slice.apply(arguments);
      args.push((data) => {
        const err = getLastError();
        if (err) {
          return reject(err);
        }
        resolve(data);
      });
      context[functionName].apply(context, args);
    });
  };
}

function convertOptions(opts) {
  const options = {
    paused: true,
    bitrate: opts.baudRate,
    parityBit: opts.parity,
    ctsFlowControl: opts.rtscts,
    dataBits: null,
    stopBits: null,
    parity: null
  };

  switch (opts.dataBits) {
    case 7:
      options.dataBits = 'seven';
      break;
    case 8:
      options.dataBits = 'eight';
      break;
    default:
      options.dataBits = opts.dataBits;
  }

  switch (opts.stopBits) {
    case 1:
      options.stopBits = 'one';
      break;
    case 2:
      options.stopBits = 'two';
      break;
    default:
      options.stopBits = opts.stopBits;
  }

  switch (opts.parity) {
    case 'none':
      options.parity = 'no';
      break;
    default:
      options.parity = opts.parity;
  }

  return options;
}

function Uint8ArrayToArrayBuffer(input) {
  const buf = new ArrayBuffer(input.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0; i < input.length; i++) {
    bufView[i] = input[i];
  }
  return buf;
}

function ArrayBufferToUint8Array(input) {
  const buffer = new Buffer(input.byteLength);
  const view = new Uint8Array(input);
  for (let i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i];
  }
  return buffer;
}

function getChromeSerial() {
  if (!(global.chrome && global.chrome.serial)) {
    throw new TypeError('"chrome.serial" is not an object. Try loading as a Chrome Application.');
  }
  return global.chrome.serial;
}

function getLastError() {
  return global.chrome.runtime.lastError;
}

class BrowserBindings extends BaseBinding {
  static list() {
    const serial = BrowserBindings.serial || getChromeSerial();
    promisifyChrome(serial, 'getDevices')().then((ports) => {
      return ports.map(port => ({
        comName: port.path,
        manufacturer: port.displayName,
        displayName: port.displayName,
        serialNumber: '',
        pnpId: '',
        locationId: '',
        vendorId: `0x${(port.vendorId || 0).toString(16)}`,
        productId: `0x${(port.productId || 0).toString(16)}`
      }));
    });
  }

  constructor(opt) {
    super(opt);
    this.onDisconnect = opt.disconnect;
    this.serial = opt.serial || getChromeSerial();
    this.connectionId = -1;
    this.addErrorListener();

    this.onRead = (readInfo) => {
      if (readInfo && this.connectionId === readInfo.connectionId) {
        this.options.dataCallback(ArrayBufferToUint8Array(readInfo.data));
      }
    };
  }

  addErrorListener() {
    this.serial.onReceiveError.addListener((info) => {
      switch (info.error) {
        case 'disconnected':
        case 'device_lost':
        case 'system_error':
          const err = new Error(`Disconnected: ${info.error}`);
          // send notification of disconnect
          this.onDisconnect(err);
          if (this.isOpen) {
            this.close();
          }
          break;
        case 'timeout':
          break;
      }
    });
  }

  get isOpen() {
    return this.connectionId >= 0;
  }

  open(path, options) {
    const chromeOptions = convertOptions(options);

    return super.open(path, options).then(() => {
      return promisifyChrome(this.serial, 'connect')(path, chromeOptions).then((info) => {
        if (info.connectionId === -1) {
          return Promise.reject(new Error(`Unable to connect to "${path}" for unknown reasons`));
        }
        this.connectionId = info.connectionId;
        this.serial.onReceive.addListener(this.onRead);
      });
    });
  }

  close() {
    return super.close().then(() => {
      return promisifyChrome(this.serial, 'disconnect')(this.connectionId).then(() => {
        this.connectionId = -1;
        this.serial.onReceive.removeListener(this.onRead);
      });
    });
  }

  write(buffer) {
    return super.write(buffer).then(() => {
      const arrayBuffer = Uint8ArrayToArrayBuffer(buffer);
      return promisifyChrome(this.serial, 'send')(this.connectionId, arrayBuffer);
    });
  }

  set(options) {
    // needs to support setBreak()
    return super.set(options).then(() => {
      return promisifyChrome(this.serial, 'setControlSignals')(this.connectionId, options);
    });
  }

  get() {
    const getPromise = () => {
      return new Promise((resolve, reject) => {
        this.serial.getControlSignals(this.connectionId, (result) => {
          if (getLastError()) {
            return reject(getLastError());
          }
          resolve(result);
        });
      });
    };
    return super.get().then(getPromise);
  }

  flush() {
    return super.flush().then(() => {
      return promisifyChrome(this.serial, 'flush')(this.connectionId);
    });
  }

  drain() {
    return Promise.reject(new Error('Not supported by Chrome Serial'));
  }

}

module.exports = BrowserBindings;
