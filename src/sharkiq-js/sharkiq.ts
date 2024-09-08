import { global_vars } from './const';
import { AylaApi } from './ayla_api';
import { OperatingModes, PowerModes, Properties } from './properties';
import { transcode } from 'buffer';
import { Logger } from 'homebridge';

// Strip text from property name
function _clean_property_name(raw_property_name): string {
  const check_for = ['SET_', 'GET_'];
  if (check_for.some(v => raw_property_name.slice(0, 4).toUpperCase().includes(v))) {
    return raw_property_name.slice(4);
  } else {
    return raw_property_name;
  }
}

const ERROR_DELAY = 10000;
const TIMEOUT_DELAY = 30000;

class SharkIqVacuum {
  ayla_api: AylaApi;
  _dsn: string;
  _key: string;
  _oem_model_number: string;
  _vac_model_number: string;
  _vac_serial_number: string;
  properties_full;
  property_values;
  _settable_properties;
  europe: boolean;
  _name: string;
  _firmware_version: string;
  log: Logger;
  _error: string | null;
  // Shark IQ vacuum entity
  constructor(ayla_api, device_dct, log, europe = false) {
    this.ayla_api = ayla_api;
    this._dsn = device_dct['dsn'];
    this._key = device_dct['key'];
    this._oem_model_number = device_dct['oem_model'];
    this._vac_model_number = '';
    this._vac_serial_number = '';
    this.properties_full = {};
    this.property_values = {};
    this._settable_properties = null;
    this.europe = europe;
    this._name = device_dct['product_name'];
    this._firmware_version = '';
    this.log = log;
    this._error = null;
  }

  // Get oem model number
  get oem_model_number(): string {
    return this._oem_model_number;
  }

  // Get vacuum model number
  get vac_model_number(): string {
    return this._vac_model_number;
  }

  // Get vacuum serial number
  get vac_serial_number(): string {
    return this._vac_serial_number;
  }

  // Get vacuum name
  get name(): string {
    return this._name;
  }

  // Get device serial number
  get serial_number(): string {
    return this._dsn;
  }

  // Get current operating mode
  operating_mode(): number {
    return this.get_property_value(Properties.OPERATING_MODE);
  }

  // Get current docked status
  docked_status(): number {
    return this.get_property_value(Properties.DOCKED_STATUS);
  }

  // Get current power mode
  power_mode(): number {
    return this.get_property_value(Properties.POWER_MODE);
  }

  // Update vacuum details such as the model and serial number.
  _update_metadata(): void {
    const model_and_serial = this.get_property_value(Properties.DEVICE_SERIAL_NUMBER);
    const model_serial_split = model_and_serial.split(/(\s+)/).filter((e) => {
      return e.trim().length > 0;
    });
    this._vac_model_number = model_serial_split[0];
    this._vac_serial_number = model_serial_split[1];
    this._firmware_version = this.get_property_value(Properties.ROBOT_FIRMWARE_VERSION);
  }

  // Get url for the endpoint of the setting a property API
  set_property_endpoint(property_name): string {
    return `${this.europe ? global_vars.EU_DEVICE_URL : global_vars.DEVICE_URL}` +
      `/apiv1/dsns/${this._dsn}/properties/${property_name}/datapoints.json`;
  }

  // Get a device property value
  get_property_value(property_name) {
    if (property_name.value) {
      property_name = property_name.value;
    }
    return this.property_values[property_name];
  }

  // Set a device property value
  async set_property_value(property_name, value, attempt = 0): Promise<void> {
    if (property_name.value) {
      property_name = property_name.value;
    }
    if (value.value) {
      value = value.value;
    }

    const end_point = this.set_property_endpoint(`SET_${property_name}`);
    const data = { 'datapoint': { 'value': value } };
    try {
      const auth_header = await this.ayla_api.auth_header();
      const resp = await this.ayla_api.makeRequest('POST', end_point, data, auth_header);
      if (resp.ok !== true) {
        this.log.warn('Error setting property value:', property_name, value);
        this.log.debug(`API Error: ${resp.response}`);
        const status = await this.ayla_api.attempt_refresh(attempt);
        if (!status && attempt === 1) {
          return;
        } else {
          await this.set_property_value(property_name, value, attempt + 1);
          return;
        }
      }
      this.properties_full[property_name] = value;
    } catch {
      this.log.debug('Promise Rejected with setting property value.');
    }
  }

  // Get the url for the endpoint that gets property values
  get update_url(): string {
    return `${this.europe ? global_vars.EU_DEVICE_URL : global_vars.DEVICE_URL}/apiv1/dsns/${this.serial_number}/properties.json`;
  }

  // Get properties
  async update(property_list, attempt = 0): Promise<number> {
    if (property_list) {
      if (!Array.isArray(property_list)) {
        property_list = [property_list];
      }
    }
    const full_update = !property_list;
    const url = this.update_url;
    try {
      if (!full_update && property_list.length !== 0) {
        const params = new URLSearchParams();
        property_list.forEach((property) => {
          params.append('names[]', `GET_${property}`);
        });
        const auth_header = await this.ayla_api.auth_header();
        const resp = await this.ayla_api.makeRequest('GET', `${url}?${params.toString()}`, null, auth_header);
        try {
          const properties = JSON.parse(resp.response);
          if (resp.status === 429) {
            this.log.debug('API Error: Too many requests');
            this.log.debug('Waiting an extra 30 seconds before retrying...');
            return TIMEOUT_DELAY;
          } else if (resp.ok !== true) {
            this.log.warn('Error getting property values', property_list.join(', '));
            if (properties['error'] !== undefined) {
              this.log.debug(`Error Message: ${JSON.stringify(properties['error'])}`);
            }
            const status = await this.ayla_api.attempt_refresh(attempt);
            if (!status && attempt === 1) {
              return ERROR_DELAY;
            } else {
              return await this.update(property_list, attempt + 1);
            }
          } else {
            this._do_update(full_update, properties);
            return 0;
          }
        } catch (e) {
          this.log.warn('Error parsing JSON response for properties: ' + property_list.join(', '));
          this.log.debug('Error Message: ' + e);
          return ERROR_DELAY;
        }
      } else {
        const auth_header = await this.ayla_api.auth_header();
        const resp = await this.ayla_api.makeRequest('GET', url, null, auth_header);
        const properties = JSON.parse(resp.response);
        try {
          if (resp.status === 429) {
            this.log.debug('API Error: Too many requests');
            this.log.debug('Waiting an extra 30 seconds before retrying...');
            return TIMEOUT_DELAY;
          } else if (resp.ok !== true) {
            this.log.warn('Error getting property values.');
            if (properties['error'] !== undefined) {
              this.log.debug(`Error Message: ${JSON.stringify(properties['error'])}`);
            }
            const status = await this.ayla_api.attempt_refresh(attempt);
            if (!status && attempt === 1) {
              return ERROR_DELAY;
            } else {
              return await this.update(property_list, attempt + 1);
            }
          } else {
            this._do_update(full_update, properties);
            return 0;
          }
        } catch {
          this.log.warn('Error parsing JSON response for properties.');
          return ERROR_DELAY;
        }
      }
    } catch (e) {
      this.log.debug('Promise Rejected with updating properties.');
      return ERROR_DELAY;
    }
  }

  // Update or set properties locally from update function
  _do_update(full_update, properties): void {
    const property_names = properties.map((property) => {
      return property['property']['name'];
    });
    let settable_properties = property_names.map((property_name) => {
      if (property_name.toUpperCase().substring(0, 3) === 'SET') {
        return _clean_property_name(property_name);
      }
    });
    settable_properties = settable_properties.filter((el) => {
      return el !== null;
    });
    const readable_properties = {};
    for (let i = 0; i < properties.length; i++) {
      if (properties[i]['property']['name'].toUpperCase() !== 'SET') {
        const property_name = _clean_property_name(properties[i]['property']['name']);
        readable_properties[property_name] = properties[i];
      }
    }

    if (full_update || this._settable_properties === null) {
      this._settable_properties = settable_properties;
    } else {
      const combined_settable_properties = this._settable_properties.concat(settable_properties);
      const result = combined_settable_properties.filter((item, pos) => {
        return combined_settable_properties.indexOf(item) === pos;
      });
      this._settable_properties = result;
    }

    if (full_update) {
      this.properties_full = {};
    }
    this.properties_full = {
      ...this.properties_full,
      ...readable_properties,
    };

    for (const [key, value] of Object.entries(readable_properties) as [string, string][]) {
      this.property_values[key] = value['property']['value'];
    }
  }

  // Set vacuum operating mode
  async set_operating_mode(mode: number): Promise<void> {
    try {
      await this.set_property_value(Properties.OPERATING_MODE, mode);
    } catch {
      this.log.debug('Promise Rejected with setting opertating mode.');
    }
  }

  // Encode room list for specifying multiple rooms
  _encode_room_list(rooms): string {

    if (!rooms) {
      return '*';
    } else if (rooms.length === 0) {
      return '*';
    }

    const room_list = this._get_device_room_list();

    let header = '\x80\x01\x0b\xca\x02';

    let rooms_enc = '';
    rooms.forEach((room) => {
      rooms_enc += String.fromCharCode(room.length) + room + '\n';
    });
    rooms_enc = rooms_enc.replace(/\n$/, '');

    const footer = '\x1a' + String.fromCharCode(room_list['identifier'].length) + room_list['identifier'];

    const header_byte = String.fromCharCode(0 + 1 + rooms_enc.length + footer.length);
    header += header_byte;
    header += '\n';

    const latin1Buffer = transcode(Buffer.from(header + rooms_enc + footer), 'utf8', 'latin1');
    const encoded = Buffer.from(latin1Buffer).toString('base64');
    return encoded;
  }

  // Get object of the device room list for starting a clean
  _get_device_room_list(): object {

    const room_list = this.get_property_value(Properties.ROBOT_ROOM_LIST);
    const split = room_list.split(':');
    return {
      'identifier': split[0],
      'rooms': split.slice(1),
    };
  }

  // Get device room list (will output * for all)
  get_room_list() {
    return this._get_device_room_list()['rooms'];
  }

  // Start the vacuum cleaning
  async clean_rooms(rooms): Promise<void> {
    try {
      const payload = this._encode_room_list(rooms);
      await this.set_property_value(Properties.AREAS_TO_CLEAN, payload);
      await this.set_operating_mode(OperatingModes.START);
    } catch {
      this.log.debug('Promise Rejected with starting clean.');
    }
  }

  // Stop or cancel a vacuum cleaning
  async cancel_clean(): Promise<void> {
    try {
      await this.set_operating_mode(OperatingModes.RETURN);
    } catch {
      this.log.debug('Promise Rejected with canceling clean.');
    }
  }
}

export { SharkIqVacuum, PowerModes, OperatingModes, Properties };