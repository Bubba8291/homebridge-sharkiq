import { promises as fs } from 'fs';
import { AuthData, OAuthData } from './type';

async function getAuthFile(authFilePath: string): Promise<AuthData | null> {
  try {
    const data = await fs.readFile(authFilePath, 'utf8');
    const authData = JSON.parse(data);
    return authData;
  } catch {
    return null;
  }
}

async function setAuthFile(authFilePath: string, data: AuthData): Promise<boolean> {
  try {
    await fs.writeFile(authFilePath, JSON.stringify(data), 'utf8');
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
    await fs.writeFile(oAuthFilePath, JSON.stringify(data), 'utf8');
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

export { getAuthFile, setAuthFile, getOAuthData, setOAuthData, removeFile };
