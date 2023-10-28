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
    private readonly dockedUpdateInterval: number,
  ) {

    // Get device serial number
    const serial_number = device._dsn;

    const vacuumUUID = UUIDGen.generate(serial_number + '-vacuum');
    this.service = this.accessory.getService('Vacuum') ||
      this.accessory.addService(this.platform.Service.Fanv2, 'Vacuum', vacuumUUID);

    // Vacuum Name - Default is device name
    this.service.setCharacteristic(this.platform.Characteristic.Name, device._name.toString());

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

    // Vacuum Docked Status
    this.dockedStatusService = this.accessory.getService('Vacuum Docked') ||
      this.accessory.addService(this.platform.Service.ContactSensor, 'Vacuum Docked', 'Docked');
    this.dockedStatusService.setCharacteristic(this.platform.Characteristic.Name, device._name.toString() + ' Docked');

    // Vacuum Paused Status
    this.vacuumPausedService = this.accessory.getService('Vacuum Paused') ||
      this.accessory.addService(this.platform.Service.Switch, 'Vacuum Paused', 'Paused');
    this.vacuumPausedService.setCharacteristic(this.platform.Characteristic.Name, device._name.toString() + ' Paused');

    // Vacuum Paused getting and setting state
    this.vacuumPausedService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setPaused.bind(this))
      .onGet(this.getPaused.bind(this));

    this.updateStates();

    // Monitor vacuum state
    this.monitorVacuumState().then(() => {
      this.monitorVacuumStateInterval();
    })
      .catch(() => {
        this.log.debug('Promise Rejected with first interval update.');
        this.monitorVacuumStateInterval();
      });
  }

  // Monitor vacuum state interval function
  async monitorVacuumStateInterval() {
    setInterval(async () => {
      await this.monitorVacuumState()
        .catch(() => {
          this.log.debug('Promise Rejected with interval update.');
        });
    }, this.dockedUpdateInterval);
  }

  // Monitor vacuum state function
  async monitorVacuumState() {
    let vacuumDocked = false;

    await this.device.update(Properties.DOCKED_STATUS)
      .catch(() => {
        this.log.debug('Promise Rejected with docked status update.');
      });

    if(!this.invertDockedStatus) {
      vacuumDocked = this.device.get_property_value(Properties.DOCKED_STATUS) === 1;
    } else {
      vacuumDocked = this.device.get_property_value(Properties.DOCKED_STATUS) !== 1;
    }
    await this.updateItems(vacuumDocked)
      .catch(() => {
        this.log.debug('Promise Rejected with running docked update.');
      });


    this.dockedStatusService.updateCharacteristic(this.platform.Characteristic.ContactSensorState, vacuumDocked);

    this.log.debug('Triggering Vacuum Docked:', vacuumDocked);
  }

  // Update docked, active, and paused state
  async updateItems(vacuumDocked: boolean) {
    await this.device.update(Properties.OPERATING_MODE)
      .catch(() => {
        this.log.debug('Promise Rejected with operating mode update.');
      });

    if (!vacuumDocked) {
      const mode = this.device.operating_mode();
      if (mode === OperatingModes.START || mode === OperatingModes.STOP) {
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
  }

  // Update paused and active state on switch
  updateStates() {
    const mode = this.device.operating_mode();
    if (mode === OperatingModes.START) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
    } else if (mode === OperatingModes.STOP) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.INACTIVE);
    }

    if (mode === OperatingModes.STOP) {
      this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, true);
    } else {
      this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, false);
    }
  }

  // Get paused state
  getPaused() {
    this.log.debug('Triggering GET Paused');

    const mode = this.device.operating_mode() === OperatingModes.STOP;
    if (mode) {
      return true;
    } else {
      return false;
    }
  }

  // Set paused state
  async setPaused(value: CharacteristicValue) {
    this.log.debug('Triggering SET Paused');

    const mode = this.device.operating_mode();
    if (mode === OperatingModes.START || mode === OperatingModes.STOP) {
      if (value) {
        await this.device.set_operating_mode(OperatingModes.STOP)
          .catch(() => {
            this.log.debug('Promise Rejected with setting operating mode.');
          });
      } else {
        await this.device.set_operating_mode(OperatingModes.START)
          .catch(() => {
            this.log.debug('Promise Rejected with setting operating mode.');
          });
      }
    } else {
      setTimeout(() => {
        this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, false);
      }, 100);
    }

  }


  // Check if the vacuum is active for UI
  async getVacuumActive() {
    this.log.debug('Triggering GET Vacuum Active');

    const mode = this.device.operating_mode();
    if (mode === OperatingModes.START || mode === OperatingModes.STOP) {
      return true;
    } else {
      return false;
    }
  }

  // Set the vacuum state by UI
  async setVacuumActive(value: CharacteristicValue) {
    this.log.debug('Triggering SET Vacuum Active');

    if (!value) {
      const mode = this.device.operating_mode();
      if (mode === OperatingModes.START || mode === OperatingModes.STOP) {
        await this.setFanSpeed(0)
          .catch(() => {
            this.log.debug('Promise Rejected with setting fan speed.');
          });
      }
    }
  }

  // Get vacuum power for UI
  async getFanSpeed() {
    this.log.debug('Triggering GET Fan Speed');

    const mode = this.device.operating_mode();
    const vacuumActive = mode === OperatingModes.START || mode === OperatingModes.STOP;
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
    return false;
  }

  // Set vacuum power from UI (and start/stop vacuum if needed)
  async setFanSpeed(value: CharacteristicValue) {
    this.log.debug('Triggering SET Fan Speed');

    let power_mode = PowerModes.NORMAL;
    if (value === 30) {
      power_mode = PowerModes.ECO;
    } else if (value === 90) {
      power_mode = PowerModes.MAX;
    } else if (value === 0) {
      await this.device.cancel_clean()
        .catch(() => {
          this.log.debug('Promise Rejected with cancel cleaning update.');
        });
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.INACTIVE);
      this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, false);
      return;
    }
    const isPaused = this.getPaused();
    if (isPaused) {
      await this.device.set_operating_mode(OperatingModes.START)
        .catch(() => {
          this.log.debug('Promise Rejected with setting operating mode.');
        });
      this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, false);
    }
    await this.device.set_property_value(Properties.POWER_MODE, power_mode)
      .catch(() => {
        this.log.debug('Promise Rejected with powermode update.');
      });
    const mode = this.device.operating_mode();
    if (mode !== OperatingModes.START && mode !== OperatingModes.STOP) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
      await this.device.clean_rooms([])
        .catch(() => {
          this.log.debug('Promise Rejected with start cleaning update.');
        });
    }
  }
}
