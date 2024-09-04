import * as NatureRemo from 'nature-remo';
import { API, HAP, Logging, AccessoryConfig, Service, Characteristic } from 'homebridge';
import { brightnessDown, brightnessUp, LocalSignal, toggleLight } from './signals';

let hap: HAP;

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('MLRU1Light', MLRU1Light);
};

class MLRU1Light {
  private readonly log: Logging;
  private readonly config: AccessoryConfig;
  private readonly api: API;
  private readonly Service: typeof Service;
  private readonly Characteristic: typeof hap.Characteristic;
  private readonly natureClient?: NatureRemo.Cloud;
  private deviceData?: NatureRemo.Appliance;

  private readonly informationService: Service;
  private readonly service: Service;

  private readonly OnCharacteristic: Characteristic;
  private readonly BrightnessCharacteristic: Characteristic;

  private currentStatus = true;
  private readonly maxBrightness: number;
  private currentBrightness: number = 100;

  private readonly remoIpAddr: string | undefined;

  /**
   * REQUIRED - This is the entry point to your plugin
   */
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    this.maxBrightness = config.maxBrightness || 5;

    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.service = new hap.Service.Lightbulb(config.name);

    if (config.remoIpAddr) {
      this.log.info('Using Nature Remo\'s local API');
      this.remoIpAddr = config.remoIpAddr;
    } else if (config.accessToken) {
      this.log.info('Using Nature Remo\'s cloud API');
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
    } else {
      this.log.warn('No API specified');
    }

    // create handlers for required characteristics
    this.OnCharacteristic = this.service
      .getCharacteristic(this.Characteristic.On)
      .onGet(this.handleOnGet.bind(this))
      // @ts-expect-error: ?
      .onSet(this.handleOnSet.bind(this));

    this.BrightnessCharacteristic = this.service
      .getCharacteristic(this.Characteristic.Brightness)
      .onGet(this.handleBrightnessGet.bind(this))
      // @ts-expect-error: ?
      .onSet(this.handleBrightnessSet.bind(this));

    this.informationService = new this.Service.AccessoryInformation()
      .setCharacteristic(this.Characteristic.Manufacturer, 'irisohyama.co.jp')
      .setCharacteristic(this.Characteristic.Model, 'MLRU1')
      .setCharacteristic(this.Characteristic.SerialNumber, 'ho-me-br-id-ge');
  }

  /**
   * REQUIRED - This must return an array of the services you want to expose.
   * This method must be named "getServices".
   */
  getServices() {
    return [this.informationService, this.service];
  }

  handleOnGet() {
    this.log.debug('handleOnGet');

    return this.currentStatus;
  }

  async handleOnSet(value: boolean) {
    if (value === this.currentStatus) {
      return;
    }

    this.log.debug('handleOnSet:', value);
    this.currentStatus = value;

    try {
      if (!value) {
        await this._toggleLight();
      }
      await this._toggleLight();
    } catch (e) {
      if (this.currentStatus === value) {
        this.currentStatus = !value;
      }
      throw e;
    }
  }

  handleBrightnessGet() {
    this.log.debug('handleBrightnessGet');

    return this.currentBrightness;
  }

  async handleBrightnessSet(value: number) {
    if (!this.currentStatus) {
      this.log.warn('handleBrightnessSet: light is off');
      return;
    }
    const prevPercent = this.currentBrightness;
    const newPercent = value;

    const prevCount = this._percentToBrightness(prevPercent);
    const newCount = this._percentToBrightness(newPercent);

    const diff = Math.abs(newCount - prevCount);
    const isBright = newCount > prevCount;
    this.log.debug('handleBrightnessSet', {
      value,
      prevCount,
      newCount,
      diff,
      isBright,
    });
    if (diff < 0) {
      return;
    }

    this.currentBrightness = newPercent;
    try {
      for (let i = 0; i < diff; i++) {
        if (isBright) {
          await this._brightnessUp();
        } else {
          await this._brightnessDown();
        }
      }
    } catch (e) {
      if (this.currentBrightness === newPercent) {
        this.currentBrightness = prevPercent;
      }
      throw e;
    }
  }

  private _percentToBrightness(percent: number) {
    return Math.max(1, Math.min(this.maxBrightness, Math.ceil((this.maxBrightness / 100) * (percent + 1))));
  }

  private _getSignalId(image: string) {
    if (!this.natureClient || !this.deviceData) {
      this.log.error('natureClient is not initialized');
      return;
    }

    const signal = this.deviceData.signals.find((i) => i.image === image);
    if (!signal) {
      this.log.error('signal not found', image);
      return;
    }

    return signal.id;
  }

  private async _toggleLight() {
    this.log.debug('toggleLight');

    if (this.natureClient) {
      const signalId = this._getSignalId('ico_on');
      if (signalId) {
        await this.natureClient.sendSignal(signalId);
      }
    } else if (this.remoIpAddr) {
      await this._sendSignalToRemoLocal(toggleLight);
    } else {
      this.log.info('toggleLight');
    }
  }

  private async _brightnessUp() {
    this.log.debug('brightnessUp');

    if (this.natureClient) {
      const signalId = this._getSignalId('ico_arrow_top');
      if (signalId) {
        await this.natureClient.sendSignal(signalId);
      }
    } else if (this.remoIpAddr) {
      await this._sendSignalToRemoLocal(brightnessUp);
    } else {
      this.log.info('brightnessUp');
    }
  }

  private async _brightnessDown() {
    this.log.debug('brightnessDown');

    if (this.natureClient) {
      const signalId = this._getSignalId('ico_arrow_bottom');
      if (signalId) {
        await this.natureClient.sendSignal(signalId);
      }
    } else if (this.remoIpAddr) {
      await this._sendSignalToRemoLocal(brightnessDown);
    } else {
      this.log.info('brightnessDown');
    }
  }

  private async _sendSignalToRemoLocal(signal: LocalSignal) {
    try {
      if (!this.remoIpAddr) {
        this.log.error('remoIpAddr is not initialized');
        return;
      }
      const response = await fetch(`http://${this.remoIpAddr}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'homebridge-mlru1-light',
        },
        body: JSON.stringify(signal),
      });
      this.log.debug('sendSignalToRemoLocal', response.url, response.statusText, response.status);

      if (!response.ok) {
        this.log.error('failed to send signal', response.url, response.statusText, response.status);
      }
    } catch (e) {
      this.log.error((e as Error).message, e);
    }
  }
}
