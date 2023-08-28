import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SharkIQAccessory } from './platformAccessory';

import { get_ayla_api } from './sharkiq-js/ayla_api';
import { SharkIqVacuum } from './sharkiq-js/sharkiq';

// SharkIQPlatform Main Class
export class SharkIQPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  // Device vacuums object array
  public devices: SharkIqVacuum[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // Start plugin and attempt to login
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');

      const email = config.email;
      const password = config.password;
      const serialNumbers = config.vacuums;
      if (!email || !password) {
        log.error('Login information must be present in config');
      } else if (!serialNumbers) {
        log.error('List of your vacuum serial numbers you want to be added must be present in the config');
      }
      this.login(email, password).then((devices) => {
        for (let i = 0; i < devices.length; i++) {
          if (serialNumbers.includes(devices[i]._vac_serial_number)) {
            this.devices.push(devices[i]);
          }
        }
        this.discoverDevices();
      })
        .catch(() => {
          log.error('Error with login. Please check logs');
        });
    });
  }

  // Attempt to login and fetch devices.
  login = async (email: string, password: string) => {
    const ayla_api = get_ayla_api(email, password, this.log);
    await ayla_api.sign_in()
      .catch(() => {
        this.log.debug('Promise Rejected with sign in.');
      });
    const devices = await ayla_api.get_devices()
      .catch(() => {
        this.log.debug('Promise Rejected with getting devices.');
      });
    return devices;
  };

  // Restore accessory cache.
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  // Add vacuums to Homebridge.
  discoverDevices() {
    this.devices.forEach(device => {
      const uuid = this.api.hap.uuid.generate(device._vac_serial_number.toString());

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        new SharkIQAccessory(this, existingAccessory, device, this.api.hap.uuid, this.log);
      } else {
        this.log.info('Adding new accessory:', device._dsn);

        const accessory = new this.api.platformAccessory(device._name.toString(), uuid);

        new SharkIQAccessory(this, accessory, device, this.api.hap.uuid, this.log);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    });

  }
}
