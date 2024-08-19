import { Logger } from 'homebridge';
import { getAuthFile, setAuthFile, getOAuthData, setOAuthData, removeFile } from './config';
import { OAuthData } from './type';
import { global_vars } from './sharkiq-js/const';

import fetch from 'node-fetch';
import crypto from 'crypto';
import { join } from 'path';

export class Login {
  public log: Logger;
  public storagePath: string;
  public authFile: string;
  public oAuthFile: string;
  public oAuthCode: string;
  public app_id: string;
  public app_secret: string;
  public auth_file_path: string;
  public oauth_file_path: string;

  constructor(log: Logger,
    storagePath: string,
    oAuthCode: string,
    app_id = global_vars.SHARK_APP_ID,
    app_secret = global_vars.SHARK_APP_SECRET,
  ) {
    this.log = log;
    this.storagePath = storagePath;
    this.oAuthCode = oAuthCode;
    this.authFile = global_vars.FILE;
    this.oAuthFile = global_vars.OAUTH.FILE;
    this.app_id = app_id;
    this.app_secret = app_secret;
    this.auth_file_path = join(this.storagePath, this.authFile);
    this.oauth_file_path = join(this.storagePath, this.oAuthFile);
  }

  public async checkLogin(): Promise<boolean> {
    const auth_file = await getAuthFile(this.auth_file_path);
    const oauth_file = await getOAuthData(this.oauth_file_path);
    if (!auth_file) {
      if (this.oAuthCode !== '') {
        if (!oauth_file) {
          this.log.error('No OAuth data found with oAuthCode present. Please remove the oAuthCode from the config.');
          return false;
        }
        const status = await this.login(this.oAuthCode, oauth_file);
        if (!status) {
          this.log.error('Error logging in to Shark');
          return false;
        } else {
          this.log.info('Successfully logged in to Shark');
          return true;
        }
      }
      const url = await this.generateURL();
      if (!url) {
        this.log.error('Error generating Shark login URL');
        return false;
      }
      this.log.info('Please visit the following URL to login to Shark:', url);
      return false;
    } else {
      this.log.debug('Already logged in to Shark');
      return true;
    }
  }

  private async login(code: string, oAuthData: OAuthData): Promise<boolean> {
    const data = {
      grant_type: 'authorization_code',
      client_id: global_vars.SHARK_CLIENT_ID,
      code: code,
      code_verifier: oAuthData.code_verify,
      redirect_uri: global_vars.OAUTH.REDIRECT_URI,
    };

    try {
      const reqData = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Auth0-Client': global_vars.OAUTH.AUTH0_CLIENT,
        },
        body: JSON.stringify(data),
      };

      const response = await fetch(global_vars.OAUTH.TOKEN_URL, reqData);
      const tokenData = await response.json();

      const reqData2 = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'app_id': this.app_id,
          'app_secret': this.app_secret,
          'token': tokenData.id_token,
        }),
      };
      const response2 = await fetch(`${global_vars.LOGIN_URL}/api/v1/token_sign_in`, reqData2);
      const aylaTokenData = await response2.json();
      const status = setAuthFile(this.auth_file_path, aylaTokenData);
      if (!status) {
        this.log.error('Error saving auth file.');
        return false;
      }
      await removeFile(this.oauth_file_path);
      return true;
    } catch (error) {
      this.log.error('Error: ' + error);
      return false;
    }
  }

  private async generateURL(): Promise<string | null> {
    const state = this.generateRandomString(43);
    const code_verify = this.generateRandomString(43);
    const code_challenge = crypto.createHash('sha256').update(code_verify).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const oAuthData = {
      state: state,
      code_verify: code_verify,
      code_challenge: code_challenge,
    };

    const status = await setOAuthData(this.oauth_file_path, oAuthData);
    if (!status) {
      return null;
    }

    const url = global_vars.OAUTH.AUTH_URL
      + '?response_type=code'
      + '&client_id='+encodeURIComponent(global_vars.SHARK_CLIENT_ID)
      + '&state='+encodeURIComponent(oAuthData.state)
      + '&scope='+encodeURIComponent(global_vars.OAUTH.SCOPES)
      + '&redirect_uri='+encodeURIComponent(global_vars.OAUTH.REDIRECT_URI)
      + '&code_challenge='+encodeURIComponent(oAuthData.code_challenge)
      + '&code_challenge_method=S256'
      + '&ui_locales=en'
      + '&auth0Client='+ global_vars.OAUTH.AUTH0_CLIENT;

    return url;
  }

  private generateRandomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters.charAt(randomIndex);
    }
    return result;
  }

}
