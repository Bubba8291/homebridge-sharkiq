import { promises as fs } from 'fs';
import { AuthData } from './type';

export async function getAuthFile(authFilePath): Promise<AuthData | null> {
  try {
    const data = await fs.readFile(authFilePath, 'utf8');
    const authData = JSON.parse(data);
    return authData;
  } catch (err) {
    return null;
  }
}

export async function setAuthFile(authFilePath, data: AuthData): Promise<boolean> {
  try {
    await fs.writeFile(authFilePath, JSON.stringify(data), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}
