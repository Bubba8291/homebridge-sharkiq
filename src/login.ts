import { Logger } from 'homebridge';
import { setTimeout } from 'node:timers/promises';
import fetch from 'node-fetch';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { global_vars } from './sharkiq-js/const';
import { getAuthData, setAuthData, getOAuthData, removeFile, generateURL } from './config';
import { addSeconds } from './utils';
import { OAuthData } from './type';

export class Login {
  private oAuthCode = '';

  public log: Logger;
  public auth_file: string;
  public oauth_file: string;
  public email: string;
  public password: string;
  public app_id: string;
  public app_secret: string;

  constructor(log: Logger,
    auth_file: string,
    oauth_file: string,
    email: string,
    password: string,
    app_id = global_vars.SHARK_APP_ID,
    app_secret = global_vars.SHARK_APP_SECRET,
  ) {
    this.log = log;
    this.auth_file = auth_file;
    this.oauth_file = oauth_file;
    this.email = email;
    this.password = password;
    this.app_id = app_id;
    this.app_secret = app_secret;
  }

  public async checkLogin(): Promise<void> {
    try {
      await getAuthData(this.auth_file);
      this.log.debug('Already logged in to Shark');
    } catch {
      this.log.debug('Not logged in to Shark');
      const email = this.email;
      const password = this.password;

      try {
        const url = await generateURL(this.oauth_file);

        await this.login(email, password, url);
        if (this.oAuthCode === '') {
          return Promise.reject('Error: No OAuth code found');
        } else {
          const ouath_data = await getOAuthData(this.oauth_file);
          await this.loginCallback(this.oAuthCode, ouath_data);
        }
      } catch (error) {
        return Promise.reject(`${error}`);
      }
    }
  }

  private async login(email: string, password: string, url: string): Promise<void> {
    const stealth = StealthPlugin();

    puppeteer.use(stealth);

    const headless = true;

    this.log.debug('Headless:', headless);
    let error = '';
    try {
      const browser = await puppeteer.launch({
        headless: headless,
        targetFilter: (target) => target.type() !== 'other',
      });
      this.log.debug('Opening chromium browser...');
      const page = await browser.newPage();
      const pages = await browser.pages();
      pages[0].close();
      this.log.debug('Navigating to Shark login page...');
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      page.on('response', async (response) => {
        if (response.url().includes('login?')) {
          this.log.debug('Retrieving login response...');
          if (!response.ok() && ![301, 302].includes(response.status())) {
            this.log.debug('Error logging in: HTTP', response.status());
            await setTimeout(1000);
            await page.screenshot({ path: 'login_error.png' });
            const errorMessages = await page.$$eval('span[class="ulp-input-error-message"]', (el) => el.map((x) => x.innerText.trim()));
            const promptAlert = await page.$('div[id="prompt-alert"]');
            if (promptAlert) {
              const alertP = await promptAlert.$('p');
              if (alertP) {
                const alertText = await alertP.evaluate((el) => el.textContent?.trim());
                if (alertText) {
                  errorMessages.push(alertText);
                }
              }
            }
            error = errorMessages.join(', ');
            await browser.close();
          }
        } else if (response.url().includes('resume?')) {
          this.log.debug('Retrieving callback response...');
          const headers = response.headers();
          const queries = headers.location.split('?');
          if (queries.length > 1) {
            const code = queries[1].split('&').find((query: string) => query.includes('code='));
            if (code) {
              this.oAuthCode = code.slice(5);
            }
            await browser.close();
          }
        }
      });

      if (headless) {
        this.log.debug('Inputing login info...');
        await page.waitForSelector('button[name="action"]');
        await setTimeout(1000);

        await page.waitForSelector('input[inputMode="email"]');
        await page.type('input[inputMode="email"]', email);

        await setTimeout(1000);
        await page.type('input[type="password"]', password);
        let verified = false;
        let attempts = 0;
        while (!verified) {
          await setTimeout(5000);
          const captchaInput = await page.$('input[name="captcha"]');
          const needsCaptcha = await captchaInput?.$eval('input[name="captcha"]', (el) => el.value === '');
          if (!needsCaptcha) {
            verified = true;
          } else {
            attempts++;
            if (attempts > 3) {
              error = `Unable to verify captcha after ${attempts} attempts`;
              await browser.close();
            } else {
              this.log.debug('Captcha not verified. Attempt #', attempts);
              const checkbox = await page.$('input[type="checkbox"]');
              if (checkbox) {
                await checkbox.click();
              }
            }
          }
        }
        await page.click('button[name="action"]');
        await setTimeout(5000);
      }
    } catch (error) {
      return Promise.reject(`Error: ${error}`);
    }
    if (error !== '') {
      return Promise.reject(`Error: ${error}`);
    }
  }

  private async loginCallback(code: string, oAuthData: OAuthData): Promise<void> {
    const data = {
      grant_type: 'authorization_code',
      client_id: global_vars.OAUTH.CLIENT_ID,
      code: code,
      code_verifier: oAuthData.code_verify,
      redirect_uri: global_vars.OAUTH.REDIRECT_URI,
    };

    const reqData = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Auth0-Client': global_vars.OAUTH.AUTH0_CLIENT,
      },
      body: JSON.stringify(data),
    };
    this.log.debug('Request Data', JSON.stringify(data));

    const response = await fetch(global_vars.OAUTH.TOKEN_URL, reqData);
    if (!response.ok) {
      return Promise.reject('Unable to get token data. HTTP ' + response.status);
    }
    const tokenData = await response.json();
    this.log.debug('Token Data:', JSON.stringify(tokenData));

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
    if (!response2.ok) {
      return Promise.reject('Unable to get authorization tokens. HTTP ' + response2.status);
    }
    const aylaTokenData = await response2.json();
    const dateNow = new Date();
    aylaTokenData['expiration'] = addSeconds(dateNow, aylaTokenData['expires_in']);
    this.log.debug('Setting auth data...', JSON.stringify(aylaTokenData));
    try {
      await setAuthData(this.auth_file, aylaTokenData);
    } catch (error) {
      return Promise.reject(`${error}`);
    }
    try {
      await removeFile(this.oauth_file);
    } catch {
      return;
    }
  }

}
