import { promises as fs } from 'fs';
import crypto from 'crypto';

import { AuthData, OAuthData } from './type';
import { PLATFORM_NAME } from './settings';
import { global_vars } from './sharkiq-js/const';

export async function getAuthData(authFilePath: string): Promise<AuthData> {
  try {
    const data = await fs.readFile(authFilePath, 'utf8');
    const authData = JSON.parse(data);
    return authData;
  } catch (error) {
    return Promise.reject('Error reading OAuth data: ' + error);
  }
}

// export async function getAuthData(configPath: string): Promise<AuthData> {
//   try {
//     const data = await fs.readFile(configPath, 'utf8');
//     const currentConfig = JSON.parse(data);

//     if (!Array.isArray(currentConfig.platforms)) {
//       return Promise.reject('No platforms array found in config');
//     }

//     const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);

//     if (!pluginConfig) {
//       return Promise.reject(`${PLATFORM_NAME} platform not found in config`);
//     }

//     if (typeof pluginConfig.credentials !== 'object') {
//       return Promise.reject(`No credentials object found in ${PLATFORM_NAME} platform config`);
//     }

//     if (typeof pluginConfig.credentials.access_token !== 'string' ||
//       typeof pluginConfig.credentials.refresh_token !== 'string' ||
//       typeof pluginConfig.credentials.expiration !== 'string') {
//       return Promise.reject('Invalid types found in credentials object');
//     }

//     return pluginConfig.credentials;
//   } catch (error) {
//     return Promise.reject('Error reading auth data from config: ' + error);
//   }
// }

export async function setAuthData(authFilePath: string, data: AuthData): Promise<void> {
  try {
    await fs.writeFile(authFilePath, JSON.stringify(data, null, 4), 'utf8');
  } catch (error) {
    return Promise.reject('Error writing auth data: ' + error);
  }
}

// export async function setAuthData(configPath: string, data: AuthData): Promise<void> {
//   try {
//     if (!data) {
//       return Promise.reject('No data provided');
//     }
//     const currentConfigData = await fs.readFile(configPath, 'utf8');
//     const currentConfig = JSON.parse(currentConfigData);

//     if (!Array.isArray(currentConfig.platforms)) {
//       return Promise.reject('No platforms array found in config');
//     }

//     const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);

//     if (!pluginConfig) {
//       return Promise.reject('No platform found in config');
//     }

//     if (typeof pluginConfig.credentials !== 'object') {
//       pluginConfig.credentials = {};
//     }

//     pluginConfig.credentials.access_token = data.access_token;
//     pluginConfig.credentials.refresh_token = data.refresh_token;
//     pluginConfig.credentials.expiration = data.expiration;

//     try {
//       await fs.writeFile(configPath, JSON.stringify(currentConfig, null, 4), 'utf8');
//     } catch (error) {
//       return Promise.reject(`${error}`);
//     }
//   } catch (error) {
//     return Promise.reject('Error writing auth data to config: ' + error);
//   }
// }

export async function getOAuthData(oAuthFilePath: string): Promise<OAuthData> {
  try {
    const data = await fs.readFile(oAuthFilePath, 'utf8');
    const oAuthData = JSON.parse(data);
    return oAuthData;
  } catch (error) {
    return Promise.reject('Error reading OAuth data: ' + error);
  }
}

async function setOAuthData(oAuthFilePath: string, data: OAuthData): Promise<void> {
  try {
    await fs.writeFile(oAuthFilePath, JSON.stringify(data, null, 4), 'utf8');
  } catch (error) {
    return Promise.reject('Error writing OAuth data: ' + error);
  }
}

export async function removeFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    return Promise.reject('Error removing file: ' + error);
  }
}

export async function generateURL(oauth_file_path: string): Promise<string> {
  const state = generateRandomString(43);
  const code_verify = generateRandomString(43);
  const code_challenge = crypto.createHash('sha256').update(code_verify).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const oAuthData = {
    state: state,
    code_verify: code_verify,
    code_challenge: code_challenge,
  };

  try {
    await setOAuthData(oauth_file_path, oAuthData);

    const url = global_vars.OAUTH.AUTH_URL
      + '?response_type=code'
      + '&client_id='+encodeURIComponent(global_vars.OAUTH.CLIENT_ID)
      + '&state='+encodeURIComponent(oAuthData.state)
      + '&scope='+encodeURIComponent(global_vars.OAUTH.SCOPES)
      + '&redirect_uri='+encodeURIComponent(global_vars.OAUTH.REDIRECT_URI)
      + '&code_challenge='+encodeURIComponent(oAuthData.code_challenge)
      + '&code_challenge_method=S256'
      + '&ui_locales=en'
      + '&auth0Client='+ global_vars.OAUTH.AUTH0_CLIENT;

    return url;
  } catch (error) {
    return Promise.reject('Error generating Shark login URL: ' + error);
  }
}

function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
}
