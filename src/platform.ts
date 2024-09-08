import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { join } from 'path';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SharkIQAccessory } from './platformAccessory';

import { Login } from './login';

import { get_ayla_api } from './sharkiq-js/ayla_api';
import { SharkIqVacuum } from './sharkiq-js/sharkiq';
import { global_vars } from './sharkiq-js/const';

// SharkIQPlatform Main Class
export class SharkIQPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  // Device vacuums object array
  public vacuumDevices: SharkIqVacuum[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // Start plugin and attempt to login
    this.api.on('didFinishLaunching', () => {
      const serialNumbers = config.vacuums;
      if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
        log.error('List of your vacuum DSNs you want to be added must be present in the config');
        return;
      }
      this.login().then((devices) => {
        for (let i = 0; i < devices.length; i++) {
          if(serialNumbers.includes(devices[i]._dsn)) {
            this.vacuumDevices.push(devices[i]);
          }
        }
        if (this.vacuumDevices.length === 0) {
          log.warn('None of the DSNs provided matched the vacuum(s) on your account.');
        }
        this.discoverDevices();
      })
        .catch((error) => {
          log.error('Error with login.');
          log.error(error);
        });
    });
  }

  // Attempt to login and fetch devices.
  login = async (): Promise<SharkIqVacuum[]> => {
    const europe = this.config.europe || false;
    const storagePath = this.api.user.storagePath();
    const auth_file = join(storagePath, global_vars.FILE);
    const oauth_file = join(storagePath, global_vars.OAUTH.FILE);
    const email = this.config.email;
    const password = this.config.password;
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return Promise.reject('Error: Email and password must be present in the config');
    }
    const login = new Login(this.log, auth_file, oauth_file, email, password);
    try {
      await login.checkLogin();
      const ayla_api = get_ayla_api(auth_file, this.log, europe);
      await ayla_api.sign_in();
      const devices = await ayla_api.get_devices();
      return devices;
    } catch (error) {
      return Promise.reject(`${error}`);
    }
  };

  // Restore accessory cache.
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  // Add vacuums to Homebridge.
  discoverDevices(): void {
    const devices: PlatformAccessory[] = [];
    const unusedDeviceAccessories = this.accessories;

    const invertDockedStatus = this.config.invertDockedStatus || false;
    const dockedUpdateInterval = this.config.dockedUpdateInterval || 5000;
    this.vacuumDevices.forEach(vacuumDevice => {
      const uuid = this.api.hap.uuid.generate(vacuumDevice._dsn.toString());
      let accessory = unusedDeviceAccessories.find(accessory => accessory.UUID === uuid);

      if(accessory) {
        unusedDeviceAccessories.splice(unusedDeviceAccessories.indexOf(accessory), 1);
      } else {
        accessory = new this.api.platformAccessory(vacuumDevice._name.toString(), uuid);
        devices.push(accessory);
      }

      let accessoryInformationService = accessory.getService(this.Service.AccessoryInformation);
      if (!accessoryInformationService) {
        accessoryInformationService = accessory.addService(this.Service.AccessoryInformation);
      }
      accessoryInformationService
        .setCharacteristic(this.Characteristic.Manufacturer, 'Shark')
        .setCharacteristic(this.Characteristic.Model, vacuumDevice._vac_model_number || 'Unknown')
        .setCharacteristic(this.Characteristic.SerialNumber, vacuumDevice._dsn);

      new SharkIQAccessory(this, accessory, vacuumDevice, this.api.hap.uuid, this.log, invertDockedStatus, dockedUpdateInterval);
    });

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, devices);

    unusedDeviceAccessories.forEach(unusedDeviceAccessory => {
      this.log.info('Removing unused accessory with name ' + unusedDeviceAccessory.displayName);
      this.accessories.splice(this.accessories.indexOf(unusedDeviceAccessory), 1);
    });

    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, unusedDeviceAccessories);
  }
}
