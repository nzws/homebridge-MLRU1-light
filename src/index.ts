import * as NatureRemo from 'nature-remo';
import { API, HAP, Logging, AccessoryConfig, Service, Characteristic } from 'homebridge';
// @ts-expect-error: type
import type PQueue from 'p-queue';

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
  private updatingStatus = true;
  private readonly maxBrightness: number;
  private currentBrightness: number = 100;
  private updatingBrightness: number = 100;

  private queue: PQueue | undefined;

  private statusTimeout: NodeJS.Timeout | undefined;
  private brightnessTimeout: NodeJS.Timeout | undefined;

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

    if (config.accessToken) {
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
      this.log.info('accessToken is not found, running in test mode.');
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
      .setCharacteristic(this.Characteristic.Manufacturer, 'homebridge.io')
      .setCharacteristic(this.Characteristic.Model, 'homebridge')
      .setCharacteristic(this.Characteristic.SerialNumber, 'ho-me-br-id-ge');

    void this.initializeQueue();
  }

  /**
   * REQUIRED - This must return an array of the services you want to expose.
   * This method must be named "getServices".
   */
  getServices() {
    return [this.informationService, this.service];
  }

  private async initializeQueue() {
    const PQueue = await import('p-queue');
    this.queue = new PQueue.default({ concurrency: 1 });
  }

  handleOnGet() {
    this.log.debug('handleOnGet');

    return this.currentStatus;
  }

  async handleOnSet(value: boolean) {
    if (!this.queue) {
      this.log.error('queue is not initialized');
      return;
    }

    return this.queue.add(async () => {
      if (value === this.updatingStatus) {
        return;
      }

      this.updatingStatus = value;
      this.log.debug('handleOnSet:', value);
      const signalId = this._getSignalId('ico_on');

      if (this.statusTimeout) {
        clearTimeout(this.statusTimeout);
      }

      let isOutdated = false;
      try {
        if (this.natureClient) {
          if (!value) {
            await this.natureClient.sendSignal(signalId);
          }
          await this.natureClient.sendSignal(signalId);
        }

        isOutdated = value !== this.updatingStatus;
        if (!isOutdated) {
          this.statusTimeout = setTimeout(() => {
            this.currentStatus = value;
            this.OnCharacteristic.updateValue(this.currentStatus);
          }, 1000);
        }
      } catch (e) {
        if (!isOutdated) {
          this.updatingStatus = !value;
        }
        throw e;
      }
    });
  }

  handleBrightnessGet() {
    this.log.debug('handleBrightnessGet');

    return this.currentBrightness;
  }

  async handleBrightnessSet(value: number) {
    if (!this.queue) {
      this.log.error('queue is not initialized');
      return;
    }

    return this.queue.add(async () => {
      if (!this.currentStatus) {
        this.log.warn('handleBrightnessSet: light is off');
        return;
      }
      const prevPercent = this.updatingBrightness;
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
      this.updatingBrightness = newPercent;

      if (this.brightnessTimeout) {
        clearTimeout(this.brightnessTimeout);
      }

      const signalUp = this._getSignalId('ico_arrow_top');
      const signalDown = this._getSignalId('ico_arrow_bottom');

      let isOutdated = false;
      try {
        if (this.natureClient) {
          for (let i = 0; i < diff; i++) {
            if (isBright) {
              await this.natureClient.sendSignal(signalUp);
            } else {
              await this.natureClient.sendSignal(signalDown);
            }
          }
        }

        isOutdated = newPercent !== this.updatingBrightness;
        if (!isOutdated) {
          this.brightnessTimeout = setTimeout(() => {
            this.currentBrightness = newPercent;
            this.BrightnessCharacteristic.updateValue(newPercent);
          }, 1000);
        }
      } catch (e) {
        if (!isOutdated) {
          this.updatingBrightness = prevPercent;
        }
        throw e;
      }
    });
  }

  private _percentToBrightness(percent: number) {
    return Math.max(1, Math.min(this.maxBrightness, Math.ceil((this.maxBrightness / 100) * (percent + 1))));
  }

  private _getSignalId(image: string) {
    if (!this.natureClient) {
      return 'foo';
    }
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
