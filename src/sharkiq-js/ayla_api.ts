import fetch from 'node-fetch';
import { Logger } from 'homebridge';

import { global_vars } from './const';
import { SharkIqVacuum } from './sharkiq';

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function subtractSeconds(date, seconds) {
  return new Date(date.getTime() - seconds * 1000);
}

type APIResponse = {
  status: number;
  response: string;
};

// New AylaApi object
const get_ayla_api = function (username: string, password: string, log: Logger, europe = false) {
  if (europe) {
    return new AylaApi(username, password, global_vars.EU_SHARK_APP_ID, global_vars.EU_SHARK_APP_SECRET, log, europe);
  } else {
    return new AylaApi(username, password, global_vars.SHARK_APP_ID, global_vars.SHARK_APP_SECRET, log);
  }
};

class AylaApi {
  _email: string;
  _password: string;
  _access_token: string | null;
  _refresh_token: string | null;
  _auth_expiration: Date | null;
  _is_authed: boolean;
  _app_id: string;
  _app_secret: string;
  log: Logger;
  europe: boolean;


  // Simple Ayla Networks API wrapper
  constructor(email, password, app_id, app_secret, log, europe = false) {
    this._email = email;
    this._password = password;
    this._access_token = null;
    this._refresh_token = null;
    this._auth_expiration = null;
    this._is_authed = false;
    this._app_id = app_id;
    this._app_secret = app_secret;
    this.log = log;
    this.europe = europe;
  }

  // Make API Request
  async makeRequest(method, url, data, auth_header): Promise<APIResponse> {
    const reqData = {};
    const headers = {};
    reqData['method'] = method;
    if(auth_header) {
      headers['Authorization'] = auth_header;
    }
    if(method === 'POST') {
      headers['Content-Type'] = 'application/json;charset=UTF-8';
    }
    if(data !== null) {
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

  get _login_data() {
    // Structure for login json request data
    return {
      'user': {
        'email': this._email,
        'password': this._password,
        'application': {
          'app_id': this._app_id,
          'app_secret': this._app_secret,
        },
      },
    };
  }

  _set_credentials(status_code, login_result) {
    // Update credentials for cache
    if (status_code === 404) {
      this.log.error('App id and or secret are incorrect.');
      return;
    } else {
      if (status_code === 401) {
        this.log.error('Invalid username or password.');
        return;
      }
    }

    this._access_token = login_result['access_token'];
    this._refresh_token = login_result['refresh_token'];
    const dateNow = new Date();
    this._auth_expiration = addSeconds(dateNow, login_result['expires_in']);
    this._is_authed = true;
  }

  // Sign  in
  async sign_in() {
    const login_data = this._login_data;
    const url = `${this.europe ? global_vars.EU_LOGIN_URL : global_vars.LOGIN_URL}/users/sign_in.json`;
    try {
      const resp = await this.makeRequest('POST', url, login_data, null);
      const jsonResponse = JSON.parse(resp.response);
      this._set_credentials(resp.status, jsonResponse);
    } catch {
      this.log.debug('Promise Rejected with sign in.');
    }
  }

  // Refresh auth token
  async refresh_auth() {
    const refresh_data = { 'user': { 'refresh_token': this._refresh_token } };
    const url = `${this.europe ? global_vars.EU_LOGIN_URL : global_vars.LOGIN_URL}/users/refresh_token.json`;
    try {
      const resp = await this.makeRequest('POST', url, refresh_data, null);
      const jsonResponse = JSON.parse(resp.response);
      this._set_credentials(resp.status, jsonResponse);
    } catch {
      this.log.debug('Promise Rejected with refreshin auth.');
    }
  }

  // Get signout json request data
  get sign_out_data() {
    return { 'user': { 'access_token': this._access_token } };
  }

  // Clear auth data
  _clear_auth() {
    /* Clear authentication state */
    this._is_authed = false;
    this._access_token = null;
    this._refresh_token = null;
    this._auth_expiration = null;
  }

  // Sign out
  async sign_out() {
    const url = `${this.europe ? global_vars.EU_LOGIN_URL : global_vars.LOGIN_URL}/users/sign_out.json`;
    try {
      await this.makeRequest('POST', url, this.sign_out_data, null);
      this._clear_auth();
    } catch {
      this.log.debug('Promise Rejected with sign out.');
    }
  }

  // Get when auth data expires
  get auth_expiration() {
    if (!this._is_authed) {
      return null;
    } else {
      if (this._auth_expiration === null) {
        this.sign_in();
      } else {
        return this._auth_expiration;
      }
    }
  }

  // Check if the token expired
  get token_expired() {
    if (this.auth_expiration === null) {
      return true;
    }
    const dateNow = new Date();
    return dateNow > this.auth_expiration! === true;
  }

  // Check if the current token is expiring soon
  get token_expiring_soon() {
    if (this.auth_expiration === null) {
      return true;
    }
    const dateNow = new Date();
    return dateNow > subtractSeconds(this.auth_expiration, 600) === true;
  }

  // Check if auth is valid and renew if expired.
  async check_auth(raise_expiring_soon = true) {
    if (!this._access_token || !this._is_authed || this.token_expired) {
      this._is_authed = false;
      this.log.error('Invalid username or password.');
      return false;
    } else {
      if (raise_expiring_soon && this.token_expiring_soon) {
        try {
          await this.refresh_auth();
        } catch {
          this.log.error('Unable to refresh auth token.');
          return false;
        }
      }
    }
    return true;
  }

  // Get auth header for requests
  async auth_header() {
    const check_auth = await this.check_auth();
    if (check_auth) {
      return `auth_token ${this._access_token}`;
    } else {
      return '';
    }
  }

  // List device objects
  async list_devices() {
    const url = `${this.europe ? global_vars.EU_DEVICE_URL : global_vars.DEVICE_URL}/apiv1/devices.json`;
    try {
      const auth_header = await this.auth_header();
      const resp = await this.makeRequest('GET', url, null, auth_header);
      const devices = JSON.parse(resp.response);
      if (resp.status === 401) {
        this.log.error('API Error: Unauthorized');
        return [];
      }
      const d = devices.map((device) => {
        return device['device'];
      });
      return d;
    } catch {
      this.log.debug('Promise Rejected with list devices.');
      return [];
    }
  }

  // Get and return array of devices
  async get_devices(update = true) {
    try {
      const d = await this.list_devices();
      const devices = d.map((device) => {
        return new SharkIqVacuum(this, device, this.log, this.europe);
      });
      if (update) {
        for (let i = 0; i < devices.length; i++) {
          await devices[i].update();
          devices[i]._update_metadata();
        }
      }
      return devices;
    } catch {
      this.log.debug('Promise Rejected with getting devices.');
    }
    return [];
  }
}

export { get_ayla_api, AylaApi };