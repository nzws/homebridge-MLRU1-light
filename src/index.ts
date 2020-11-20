import * as NatureRemo from 'nature-remo';
import { API, Logging, AccessoryConfig, Service } from 'homebridge';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerAccessory('MLRU1Light', MLRU1Light);
};

class MLRU1Light {
  private readonly log: Logging;
  private readonly config: AccessoryConfig;
  private readonly api: API;
  private readonly Service;
  private readonly Characteristic;
  private readonly natureClient: NatureRemo.Cloud;
  private deviceData?: NatureRemo.IAppliance;

  private readonly informationService: Service;
  private readonly service: Service;

  private currentStatus = true;
  private readonly maxBrightness: number;
  private currentBrightness: number;

  /**
   * REQUIRED - This is the entry point to your plugin
   */
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    this.maxBrightness = config.maxBrightness || 5;
    this.currentBrightness = config.maxBrightness || 5;

    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.service = new this.Service(this.Service.Lightbulb);

    this.natureClient = new NatureRemo.Cloud(config.accessToken);
    this.natureClient
      .getAppliances()
      .then((devices) => devices.find((i) => i.id === this.config.lightId))
      .then((device) => {
        if (!device) {
          throw new Error('not found device');
        }

        this.deviceData = device;
      });

    // create handlers for required characteristics
    this.service
      .getCharacteristic(this.Characteristic.On)
      .on('get', this.handleOnGet.bind(this))
      .on('set', this.handleOnSet.bind(this));

    this.service
      .getCharacteristic(this.Characteristic.Brightness)
      .on('get', this.handleBrightnessGet.bind(this))
      .on('set', this.handleBrightnessSet.bind(this));

    this.informationService = new this.Service.AccessoryInformation()
      .setCharacteristic(this.Characteristic.Manufacturer, 'homebridge.io')
      .setCharacteristic(this.Characteristic.Model, 'homebridge')
      .setCharacteristic(this.Characteristic.SerialNumber, 'ho-me-br-id-ge');
  }

  /**
   * REQUIRED - This must return an array of the services you want to expose.
   * This method must be named "getServices".
   */
  getServices() {
    return [this.informationService, this.service];
  }

  handleOnGet(callback) {
    this.log.info('handleOnGet');

    callback(undefined, this.currentStatus);
  }

  async handleOnSet(value, callback) {
    this.log.info('handleOnSet:', value);
    const signalId = this._getSignalId('ico_on');

    if (!value) {
      await this.natureClient.sendSignal(signalId);
    }
    await this.natureClient.sendSignal(signalId);

    callback(null);
  }

  handleBrightnessGet(callback) {
    this.log.info('handleBrightnessGet');
    const count = Math.round(
      (100 / this.maxBrightness) * this.currentBrightness,
    );

    callback(undefined, count);
  }

  async handleBrightnessSet(value, callback) {
    const newCount = Math.max(
      this.maxBrightness,
      Math.min(Math.ceil(value / (100 / this.maxBrightness)), 1),
    );
    const diff = Math.abs(newCount - this.currentBrightness);
    const isBright = newCount > this.currentBrightness;
    this.log.info('handleBrightnessSet', {
      value,
      prevCount: this.currentBrightness,
      newCount,
      diff,
      isBright,
    });
    if (diff < 0) {
      return callback(null);
    }

    const signalUp = this._getSignalId('ico_arrow_top');
    const signalDown = this._getSignalId('ico_arrow_bottom');

    for (let i = 0; i < diff; i++) {
      if (isBright) {
        await this.natureClient.sendSignal(signalUp);
      } else {
        await this.natureClient.sendSignal(signalDown);
      }
    }

    this.currentBrightness = newCount;

    callback(null);
  }

  private _getSignalId(image) {
    if (!this.deviceData) {
      throw new Error('natureClient is not initialized');
    }
    const signal = this.deviceData.signals.find((i) => i.image === image);
    if (!signal) {
      throw new Error('not found button');
    }

    return signal.id;
  }
}
