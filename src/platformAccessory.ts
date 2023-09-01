import { Service, PlatformAccessory, CharacteristicValue, Logger } from 'homebridge';

import { SharkIQPlatform } from './platform';
import { Properties, SharkIqVacuum, OperatingModes, PowerModes } from './sharkiq-js/sharkiq';

export class SharkIQAccessory {
  private service: Service;
  private dockedStatusService: Service;
  private vacuumPausedService: Service;

  constructor(
    private readonly platform: SharkIQPlatform,
    private readonly accessory: PlatformAccessory,
    private device: SharkIqVacuum,
    private UUIDGen,
    private readonly log: Logger,
    private readonly invertDockedStatus: boolean,
    private isActive = false,
  ) {

    // Get device model and serial number
    const model_number = device.vac_model_number;
    const serial_number = device._vac_serial_number;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Shark')
      .setCharacteristic(this.platform.Characteristic.Model, model_number)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, serial_number);


    const vacuumUUID = UUIDGen.generate(serial_number + '-vacuum');
    this.service = this.accessory.getService('Vacuum') ||
      this.accessory.addService(this.platform.Service.Fanv2, 'Vacuum', vacuumUUID);

    // Vacuum Name - Default is device name
    this.service.setCharacteristic(this.platform.Characteristic.Name, device._name.toString());
    this.service.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Vacuum');

    // Vacuum Active
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setVacuumActive.bind(this))
      .onGet(this.getVacuumActive.bind(this));

    // Vacuum Power (Eco, Normal, Max)
    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({
        minStep: 30,
        minValue: 0,
        maxValue: 90,
      })
      .onSet(this.setFanSpeed.bind(this))
      .onGet(this.getFanSpeed.bind(this));

    const dockedUUID = UUIDGen.generate(serial_number + '-docked');
    // Vacuum Docked Status
    this.dockedStatusService = this.accessory.getService('Vacuum Docked') ||
      this.accessory.addService(this.platform.Service.ContactSensor, 'Vacuum Docked', dockedUUID);
    this.dockedStatusService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Vacuum Docked');

    const pausedStatusUUID = UUIDGen.generate(serial_number + '-paused');
    // Vacuum Paused Status
    this.vacuumPausedService = this.accessory.getService('Vacuum Paused') ||
      this.accessory.addService(this.platform.Service.Switch, 'Vacuum Paused', pausedStatusUUID);
    this.vacuumPausedService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Vacuum Paused');

    // Vacuum Paused getting and setting state
    this.vacuumPausedService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setPaused.bind(this))
      .onGet(this.getPaused.bind(this));



    // Monitor vacuum state
    let vacuumDocked = false;
    setInterval(async () => {
      await this.device.update(Properties.DOCKED_STATUS)
        .catch(() => {
          this.log.debug('Promise Rejected with docked status update.');
        });

      if(!invertDockedStatus) {
        vacuumDocked = device.get_property_value(Properties.DOCKED_STATUS) === 1;
      } else {
        vacuumDocked = device.get_property_value(Properties.DOCKED_STATUS) !== 1;
      }
      await this.updateItems(vacuumDocked)
        .catch(() => {
          this.log.debug('Promise Rejected with running docked update.');
        });


      this.dockedStatusService.updateCharacteristic(this.platform.Characteristic.ContactSensorState, vacuumDocked);

      this.platform.log.debug('Triggering Vacuum Docked:', vacuumDocked);
    }, 5000);
  }

  // Update docked, active, and paused state
  async updateItems(vacuumDocked: boolean) {
    await this.device.update(Properties.OPERATING_MODE)
      .catch(() => {
        this.log.debug('Promise Rejected with operating mode update.');
      });

    if (!vacuumDocked) {
      if (this.isActive) {
        await this.device.update(Properties.POWER_MODE)
          .catch(() => {
            this.log.debug('Promise Rejected with power mode update.');
          });
        const service = this.service;
        const platform = this.platform;
        await this.getFanSpeed()
          .then((power_mode) => {
            service.updateCharacteristic(platform.Characteristic.RotationSpeed, power_mode);
          })
          .catch(() => {
            this.log.debug('Promise Rejected with getting power mode.');
          });
      }
    }

    const mode = this.device.operating_mode();
    if (mode === OperatingModes.START) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
      this.isActive = true;
    } else if (mode === OperatingModes.STOP) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
      this.isActive = true;
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.INACTIVE);
      this.isActive = false;
    }
    this.updatePaused(mode);
  }

  // Update paused state on switch
  updatePaused(mode: number) {
    if (mode === OperatingModes.STOP) {
      this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, true);
    } else {
      this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, false);
    }
  }

  // Get paused state
  getPaused() {
    this.platform.log.debug('Triggering GET Paused');

    const mode = this.device.operating_mode() === OperatingModes.STOP;
    if (mode) {
      return true;
    } else {
      return false;
    }
  }

  // Set paused state
  async setPaused(value: CharacteristicValue) {
    this.platform.log.debug('Triggering SET Paused');

    if (this.isActive) {
      if (value) {
        await this.device.set_operating_mode(OperatingModes.STOP);
      } else {
        await this.device.set_operating_mode(OperatingModes.START);
      }
    } else {
      this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, false);
    }

  }


  // Check if the vacuum is active for UI
  async getVacuumActive() {
    this.platform.log.debug('Triggering GET Vacuum Active');

    const vacuumDocked = this.device.get_property_value(Properties.DOCKED_STATUS) === 1;
    await this.updateItems(vacuumDocked)
      .catch(() => {
        this.log.debug('Promise Rejected with running docked update.');
      });

    return this.isActive;
  }

  // Set the vacuum state by UI
  async setVacuumActive(value: CharacteristicValue) {
    this.platform.log.debug('Triggering SET Vacuum Active');

    if (!value) {
      if (this.isActive) {
        await this.setFanSpeed(0)
          .catch(() => {
            this.log.debug('Promise Rejected with setting fan speed.');
          });
      }
    }
  }

  // Get vacuum power for UI
  async getFanSpeed() {
    const vacuumActive = this.isActive;
    if (vacuumActive) {
      const power_mode = this.device.get_property_value(Properties.POWER_MODE);
      if (power_mode === PowerModes.MAX) {
        return 90;
      } else if (power_mode === PowerModes.ECO) {
        return 30;
      } else {
        return 60;
      }
    }
    return 0;
  }

  // Set vacuum power from UI (and start/stop vacuum if needed)
  async setFanSpeed(value: CharacteristicValue) {
    let power_mode = PowerModes.NORMAL;
    if (value === 30) {
      power_mode = PowerModes.ECO;
    } else if (value === 90) {
      power_mode = PowerModes.MAX;
    } else if (value === 0) {
      this.isActive = false;
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.INACTIVE);
      this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, false);
      await this.device.cancel_clean()
        .catch(() => {
          this.log.debug('Promise Rejected with cancel cleaning update.');
        });
      return;
    }
    if (this.getPaused()) {
      await this.device.set_operating_mode(OperatingModes.START);
    }
    await this.device.set_property_value(Properties.POWER_MODE, power_mode)
      .catch(() => {
        this.log.debug('Promise Rejected with powermode update.');
      });
    if (!this.isActive) {
      this.isActive = true;
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
      await this.device.clean_rooms([])
        .catch(() => {
          this.log.debug('Promise Rejected with start cleaning update.');
        });
    }
  }
}
