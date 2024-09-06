import { promises as fs } from 'fs';
import { AuthData, OAuthData } from './type';
import { PLATFORM_NAME } from './settings';

async function getAuthData(configPath: string): Promise<AuthData | null> {
  try {
    const data = await fs.readFile(configPath, 'utf8');
    const currentConfig = JSON.parse(data);

    if (!Array.isArray(currentConfig.platforms)) {
      return null;
    }

    const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);

    if (!pluginConfig) {
      return null;
    }

    if (typeof pluginConfig.credentials !== 'object') {
      return null;
    }

    return pluginConfig.credentials;
  } catch {
    return null;
  }
}

async function setAuthData(configPath: string, data: AuthData): Promise<boolean> {
  try {
    if (!data) {
      return false;
    }
    const currentConfigData = await fs.readFile(configPath, 'utf8');
    const currentConfig = JSON.parse(currentConfigData);

    if (!Array.isArray(currentConfig.platforms)) {
      return false;
    }

    const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);

    if (!pluginConfig) {
      return false;
    }

    if (typeof pluginConfig.credentials !== 'object') {
      pluginConfig.credentials = {};
    }

    pluginConfig.credentials.access_token = data.access_token;
    pluginConfig.credentials.refresh_token = data.refresh_token;
    pluginConfig.credentials.expiration = data.expiration;

    await fs.writeFile(configPath, JSON.stringify(currentConfig, null, 4), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function getOAuthData(oAuthFilePath: string): Promise<OAuthData | null> {
  try {
    const data = await fs.readFile(oAuthFilePath, 'utf8');
    const oAuthData = JSON.parse(data);
    return oAuthData;
  } catch {
    return null;
  }
}

async function setOAuthData(oAuthFilePath: string, data: OAuthData): Promise<boolean> {
  try {
    await fs.writeFile(oAuthFilePath, JSON.stringify(data, null, 4), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function removeFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    return;
  }
}

export { getAuthData, setAuthData, getOAuthData, setOAuthData, removeFile };
