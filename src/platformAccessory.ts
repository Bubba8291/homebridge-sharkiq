import { Service, PlatformAccessory, CharacteristicValue, Logger, uuid } from 'homebridge';

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
    UUIDGen: typeof uuid,
    private readonly log: Logger,
    private readonly invertDockedStatus: boolean,
    private readonly dockedUpdateInterval: number,
    private dockedDelay: number = 0,
  ) {

    // Get device serial number
    const serial_number = device._dsn;
    const vacuumUUID = UUIDGen.generate(serial_number + '-vacuum');
    this.service = this.accessory.getService('Vacuum') ||
      this.accessory.addService(this.platform.Service.Fanv2, 'Vacuum', vacuumUUID);

    // Vacuum Name - Default is device name
    this.service.setCharacteristic(this.platform.Characteristic.Name, device._name.toString());

    // // Vacuum Active
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
    this.dockedStatusService.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.retrieveDockedStatus.bind(this));

    // Vacuum Paused Status
    this.vacuumPausedService = this.accessory.getService('Vacuum Paused') ||
      this.accessory.addService(this.platform.Service.Switch, 'Vacuum Paused', 'Paused');
    this.vacuumPausedService.setCharacteristic(this.platform.Characteristic.Name, device._name.toString() + ' Paused');

    // Vacuum Paused getting and setting state
    this.vacuumPausedService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setPaused.bind(this))
      .onGet(this.getPaused.bind(this));

    this.updateStates();

    // Retrieve vacuum states
    this.retrieveVacuumStates().then(() => {
      this.retrieveVacuumStateInterval();
    })
      .catch(() => {
        this.log.debug('Promise Rejected with first interval update.');
        this.retrieveVacuumStateInterval();
      });
  }

  // Retrieve vacuum states interval function
  async retrieveVacuumStateInterval(): Promise<void> {
    setInterval(async () => {
      await this.retrieveVacuumStates()
        .catch(() => {
          this.log.debug('Promise Rejected with interval update.');
        });
    }, this.dockedUpdateInterval + this.dockedDelay);
  }

  // Retrieve docked status
  async retrieveDockedStatus(): Promise<boolean> {
    this.log.debug('Triggering GET Docked Status');
    await this.device.update(Properties.DOCKED_STATUS);

    const docked_status = this.device.docked_status();
    let vacuumDocked = false;
    if(!this.invertDockedStatus) {
      vacuumDocked = docked_status === 1;
    } else {
      vacuumDocked = docked_status !== 1;
    }

    return vacuumDocked;
  }

  // Retrieve operating mode
  async retrieveOperatingMode(): Promise<void> {
    this.log.debug('Triggering GET Operating Mode');
    await this.device.update(Properties.OPERATING_MODE)
      .then((delay) => {
        this.dockedDelay = delay;
      });
  }

  // Retrieve power mode
  async retrievePowerMode(): Promise<void> {
    this.log.debug('Triggering GET Power Mode');
    await this.device.update(Properties.POWER_MODE)
      .then((delay) => {
        this.dockedDelay = delay;
      });
  }

  // Monitor vacuum state function
  async retrieveVacuumStates(): Promise<void> {
    this.log.debug('Triggering GET Vacuum States');
    let vacuumDocked = false;

    await this.device.update([Properties.DOCKED_STATUS, Properties.OPERATING_MODE, Properties.POWER_MODE])
      .then((delay) => {
        this.dockedDelay = delay;
      });

    const docked_status = this.device.docked_status();
    if(!this.invertDockedStatus) {
      vacuumDocked = docked_status === 1;
    } else {
      vacuumDocked = docked_status !== 1;
    }
    const power_mode = this.device.power_mode();
    const mode = this.device.operating_mode();
    const vacuumActive = mode === OperatingModes.START || mode === OperatingModes.STOP;
    this.service.updateCharacteristic(this.platform.Characteristic.Active, vacuumActive);
    if (vacuumActive) {
      if (power_mode === PowerModes.MAX) {
        this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 90);
      } else if (power_mode === PowerModes.ECO) {
        this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 30);
      } else {
        this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 60);
      }
      if (mode === OperatingModes.STOP) {
        this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, true);
      } else {
        this.vacuumPausedService.updateCharacteristic(this.platform.Characteristic.On, false);
      }
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 0);
    }
    this.dockedStatusService.updateCharacteristic(this.platform.Characteristic.ContactSensorState, vacuumDocked);

    this.log.debug('Vacuum Docked:', vacuumDocked, 'Vacuum Active:', vacuumActive, 'Power Mode:', power_mode);
  }

  // Update paused and active state on switch
  updateStates(): void {
    const mode = this.device.operating_mode();
    if (mode === OperatingModes.START || mode === OperatingModes.STOP) {
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
  async getPaused(): Promise<boolean> {
    this.log.debug('Triggering GET Paused');
    await this.retrieveOperatingMode();

    const mode = this.device.operating_mode();
    this.log.debug('State:', mode);
    if (mode === OperatingModes.STOP) {
      return true;
    } else {
      return false;
    }
  }

  // Set paused state
  async setPaused(value: CharacteristicValue): Promise<void> {
    this.log.debug('Triggering SET Paused. Paused:', value);

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
  async getVacuumActive(): Promise<boolean> {
    this.log.debug('Triggering GET Vacuum Active');

    const mode = this.device.operating_mode();
    if (mode === OperatingModes.START || mode === OperatingModes.STOP) {
      return true;
    } else {
      return false;
    }
  }

  // Set the vacuum state by UI
  async setVacuumActive(value: CharacteristicValue): Promise<void> {
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
  async getFanSpeed(): Promise<number> {
    this.log.debug('Triggering GET Fan Speed');
    await this.retrievePowerMode();

    const mode = this.device.operating_mode();
    const vacuumActive = mode === OperatingModes.START || mode === OperatingModes.STOP;
    if (vacuumActive) {
      const power_mode = this.device.power_mode();
      if (power_mode === PowerModes.MAX) {
        return 90;
      } else if (power_mode === PowerModes.ECO) {
        return 30;
      } else {
        return 60;
      }
    } else {
      return 0;
    }
  }

  // Set vacuum power from UI (and start/stop vacuum if needed)
  async setFanSpeed(value: CharacteristicValue): Promise<void> {
    this.log.debug('Triggering SET Fan Speed. Value:', value);

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
    const isPaused = await this.getPaused();
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
