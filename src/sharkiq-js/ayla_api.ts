import fetch from 'node-fetch';
import { Logger } from 'homebridge';

import { global_vars } from './const';
import { SharkIqVacuum } from './sharkiq';

import { getAuthFile, setAuthFile } from '../config';
import { addSeconds, subtractSeconds, isValidDate } from '../utils';
import { AuthData } from '../type';

type APIResponse = {
  status: number;
  response: string;
};

// New AylaApi object
const get_ayla_api = function (auth_file_path: string, log: Logger, europe = false): AylaApi {
  if (europe) {
    return new AylaApi(auth_file_path, global_vars.EU_SHARK_APP_ID, global_vars.EU_SHARK_APP_SECRET, log, europe);
  } else {
    return new AylaApi(auth_file_path, global_vars.SHARK_APP_ID, global_vars.SHARK_APP_SECRET, log, europe);
  }
};

class AylaApi {
  _auth_file_path: string;
  _access_token: string | null;
  _refresh_token: string | null;
  _auth_expiration: Date | null;
  _is_authed: boolean;
  _app_id: string;
  _app_secret: string;
  log: Logger;
  europe: boolean;


  // Simple Ayla Networks API wrapper
  constructor(auth_file_path, app_id, app_secret, log, europe = false) {
    this._auth_file_path = auth_file_path;
    this._access_token = null;
    this._refresh_token = null;
    this._auth_expiration = null;
    this._is_authed = false;
    this._app_id = app_id;
    this._app_secret = app_secret;
    this.log = log;
    this.europe = europe;
  }

  // Get exit error message
  get exit_error_message(): string {
    return 'SharkIQ will not continue. If the issue persists, open an issue.';
  }

  // Make API Request
  async makeRequest(method, url, data, auth_header): Promise<APIResponse> {
    const reqData = {};
    const headers = {};
    reqData['method'] = method;
    if (auth_header) {
      headers['Authorization'] = auth_header;
    }
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json;charset=UTF-8';
    }
    if (data !== null) {
      reqData['body'] = JSON.stringify(data);
    }
    reqData['headers'] = headers;
    try {
      const response = await fetch(url, reqData);
      const statusCode = await response.status;
      const responseText = await response.text();
      return {
        status: statusCode,
        response: responseText,
      };
    } catch {
      return {
        status: 500,
        response: '',
      };
    }
  }

  _set_credentials(login_result: AuthData): void {
    // Update credentials for cache
    this._access_token = login_result['access_token'];
    this._refresh_token = login_result['refresh_token'];
    const _auth_expiration = new Date(login_result['expiration']);
    this._auth_expiration = isValidDate(_auth_expiration) ? _auth_expiration : null;
    this._is_authed = true;
  }

  // Sign in with auth file
  async sign_in(): Promise<boolean> {
    this.log.debug('Signing in.');
    const authFile = await getAuthFile(this._auth_file_path);
    if (!authFile) {
      this.log.error('Auth file not found.');
      return false;
    }
    this._set_credentials(authFile);
    return true;
  }

  // Refresh auth token
  async refresh_auth(): Promise<boolean> {
    this.log.debug('Refreshing auth token.');
    const refresh_data = { 'user': { 'refresh_token': this._refresh_token } };
    const url = `${this.europe ? global_vars.EU_LOGIN_URL : global_vars.LOGIN_URL}/users/refresh_token.json`;
    try {
      const resp = await this.makeRequest('POST', url, refresh_data, null);
      const jsonResponse = JSON.parse(resp.response);
      const status = resp.status;
      if (status !== 200) {
        this.log.error(`API Error: Unable to refresh auth token. Status Code ${status}`);
        if (jsonResponse['error'] !== undefined) {
          this.log.error(`Message: ${JSON.stringify(jsonResponse['error'])}`);
        }
        return false;
      }
      const dateNow = new Date();
      jsonResponse['expiration'] = addSeconds(dateNow, jsonResponse['expires_in']);
      setAuthFile(this._auth_file_path, jsonResponse);
      this._set_credentials(jsonResponse);
      return true;
    } catch (error) {
      this.log.error('Error refreshing auth token:', error);
      this.log.debug('Promise Rejected with refreshin auth.');
      return false;
    }
  }

  // Get signout json request data
  get sign_out_data(): object {
    return { 'user': { 'access_token': this._access_token } };
  }

  // Clear auth data
  _clear_auth(): void {
    /* Clear authentication state */
    this._is_authed = false;
    this._access_token = null;
    this._refresh_token = null;
    this._auth_expiration = null;
  }

  // Sign out
  async sign_out(): Promise<void> {
    const url = `${this.europe ? global_vars.EU_LOGIN_URL : global_vars.LOGIN_URL}/users/sign_out.json`;
    try {
      await this.makeRequest('POST', url, this.sign_out_data, null);
      this._clear_auth();
    } catch {
      this.log.debug('Promise Rejected with sign out.');
    }
  }

  // Get when auth data expires
  async auth_expiration(): Promise<Date | null> {
    if (!this._is_authed) {
      return null;
    } else {
      if (this._auth_expiration === null) {
        await this.sign_in();
        return this._auth_expiration;
      } else {
        return this._auth_expiration;
      }
    }
  }

  // Check if the token expired
  async token_expired(): Promise<boolean> {
    const auth_expiration = await this.auth_expiration();
    if (auth_expiration === null) {
      return true;
    }
    const dateNow = new Date();
    return (dateNow > auth_expiration) === true;
  }

  // Check if the current token is expiring soon
  async token_expiring_soon(): Promise<boolean> {
    const auth_expiration = await this.auth_expiration();
    if (auth_expiration === null) {
      return true;
    }
    const dateNow = new Date();
    return (dateNow > subtractSeconds(auth_expiration, 600)) === true;
  }

  // Check if auth is valid and renew if expired.
  async check_auth(): Promise<boolean> {
    const token_expired = await this.token_expired();
    if (!this._access_token || !this._is_authed || token_expired) {
      this._is_authed = false;
      return false;
    } else if (await this.token_expiring_soon()) {
      try {
        const status = await this.refresh_auth();
        return status;
      } catch {
        this.log.error('Unable to refresh auth token.');
        return false;
      }
    } else {
      return true;
    }
  }

  // Attempt to refresh the access token
  async attempt_refresh(attempt: number): Promise<boolean> {
    if (attempt === 1) {
      this.log.error(this.exit_error_message);
      return false;
    }
    this.log.info('Attempting to refresh access token.');
    const status = await this.refresh_auth();
    if (!status) {
      this.log.error('Refreshing access token failed. Please check your auth file and delete it to recreate it if needed.');
      this.log.info('The auth file is located at:', this._auth_file_path);
      this.log.error(this.exit_error_message);
      return false;
    }
    return true;
  }

  // Get auth header for requests
  async auth_header(): Promise<string | null> {
    const check_auth = await this.check_auth();
    if (check_auth) {
      return `auth_token ${this._access_token}`;
    } else {
      return null;
    }
  }

  // List device objects
  async list_devices(attempt = 1): Promise<object[]> {
    const url = `${this.europe ? global_vars.EU_DEVICE_URL : global_vars.DEVICE_URL}/apiv1/devices.json`;
    try {
      const auth_header = await this.auth_header();
      const resp = await this.makeRequest('GET', url, null, auth_header);
      if (resp.status === 401) {
        this.log.error('API Error: Unauthorized');
        const status = await this.attempt_refresh(attempt);
        if (!status && attempt === 2) {
          return [];
        } else {
          return await this.list_devices(attempt + 1);
        }
      }
      const devices = JSON.parse(resp.response);
      const d = devices.map((device: object) => {
        return device['device'];
      });
      return d;
    } catch {
      this.log.debug('Promise Rejected with list devices.');
      return [];
    }
  }

  // Get and return array of devices
  async get_devices(update = true): Promise<SharkIqVacuum[]> {
    try {
      const d = await this.list_devices();
      const devices = d.map((device) => {
        return new SharkIqVacuum(this, device, this.log, this.europe);
      });
      if (update) {
        for (let i = 0; i < devices.length; i++) {
          await devices[i].update([]);
          devices[i]._update_metadata();
        }
      }
      return devices;
    } catch {
      this.log.debug('Promise Rejected with getting devices.');
      return [];
    }
  }
}

export { get_ayla_api, AylaApi };