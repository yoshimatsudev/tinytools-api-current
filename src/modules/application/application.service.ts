import { BadRequestException, ConsoleLogger, Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { CookieJar } from 'tough-cookie';
import { constants } from 'src/utils/constants';
import { AddInvoiceDto } from './models/addInvoice.dto';
import * as cheerio from 'cheerio';
import { wrapper } from 'axios-cookiejar-support';
import * as http from 'http';
import * as https from 'https';

// Custom HTTP/HTTPS agents that force IPv4 resolution
// This helps fix DNS issues in Alpine Linux containers
const httpAgent = new http.Agent({
  family: 4, // Force IPv4
  keepAlive: true,
  keepAliveMsecs: 1000,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  family: 4, // Force IPv4
  keepAlive: true,
  keepAliveMsecs: 1000,
  timeout: 30000,
});

@Injectable()
export class ApplicationService {
  // Per-user cookie jars to prevent session conflicts between goldtech and megatech
  // Key: userId (number), Value: { jar: CookieJar, client: AxiosInstance }
  private userClients: Map<number, { jar: CookieJar; client: any }> = new Map();

  /**
   * Get or create a client for a specific user
   * Each user gets their own cookie jar to prevent authentication conflicts
   *
   * NOTE: We don't set custom HTTP agents here because axios-cookiejar-support
   * doesn't support them. DNS/IPv4 resolution should be configured at the
   * container/OS level via Coolify DNS settings.
   */
  private getClientForUser(userId: number) {
    if (!this.userClients.has(userId)) {
      console.log(`Creating new cookie jar for user ${userId}`);
      const jar = new CookieJar();

      // Create axios instance with cookie jar
      // No custom agents - axios-cookiejar-support doesn't support them
      const client = wrapper(
        axios.create({
          jar,
          maxRedirects: 5,
          timeout: 60000, // Increased timeout for slow DNS
        }),
      );

      this.userClients.set(userId, { jar, client });
    }
    return this.userClients.get(userId);
  }

  /**
   * Check if an error is a DNS-related error that should be retried
   */
  private isDnsError(error: any): boolean {
    return (
      error.code === 'EAI_AGAIN' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      error.cause?.code === 'EAI_AGAIN' ||
      error.cause?.code === 'ENOTFOUND' ||
      error.cause?.code === 'ETIMEDOUT' ||
      error.message?.includes('getaddrinfo') ||
      error.message?.includes('EAI_AGAIN') ||
      error.message?.includes('ETIMEDOUT') ||
      error.message?.includes('ENOTFOUND')
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendXRequest(params: object, userId: number) {
    const { client } = this.getClientForUser(userId);
    const maxRetries = 5;
    const retryDelay = 2000;
    const url =
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?client_id=tiny-webapp&redirect_uri=https://erp.tiny.com.br/login&scope=openid&response_type=code';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // console.log('Starting to send XRequest for login');
        const response = await client.get(url, {});
        const $ = cheerio.load(response.data);
        const form = $('#kc-content-wrapper').children().attr();
        const dynamicUrl = form.action;
        const setCookieResponse = response.headers['set-cookie'];
        return { response, dynamicUrl, setCookieResponse };
      } catch (e) {
        // Check if it's a DNS error that should be retried
        if (this.isDnsError(e) && attempt < maxRetries) {
          const waitTime = retryDelay * attempt; // Exponential backoff
          console.log(
            `DNS resolution failed for accounts.tiny.com.br in sendXRequest, ` +
            `retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})...`
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // Check if it's a redirect loop error
        if (
          e.message?.includes('Maximum number of redirects exceeded') ||
          e.message?.includes('redirect') ||
          e.message?.includes('Redirect')
        ) {
          console.log('Redirect loop detected in sendXRequest, clearing cookies');
          await this.clearCookies(userId);
          throw new BadRequestException(
            'Authentication failed: Too many redirects. Session may be invalid. Please try again.',
          );
        }

        // If it's a DNS error on final attempt, provide a more helpful error message
        if (this.isDnsError(e)) {
          throw new BadRequestException(
            `DNS resolution failed for accounts.tiny.com.br after ${maxRetries} attempts. ` +
            `This may be due to network connectivity issues or DNS server problems. ` +
            `Please check your VPS/container DNS settings. ` +
            `Original error: ${e.message || e.cause?.message || 'Unknown error'}`
          );
        }

        throw new BadRequestException(e.message || 'Failed to initiate login');
      }
    }
  }

  async sendYRequest(
    dynamicUrl: string,
    username: string,
    password: string,
    setCookieResponse: string[],
    userId: number,
  ) {
    const maxRetries = 5;
    const retryDelay = 2000;
    const form = `username=${username}&password=${password}`;
    const params = setCookieResponse;

    // Use HTTP agents for sendYRequest since it uses regular axios (not cookie jar)
    const yRequestClient = axios.create({
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      timeout: 60000,
      maxRedirects: 5,
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // console.log('Starting to send YRequest for login');
        const response = await yRequestClient.post(dynamicUrl, form, {
          headers: {
            cookie: params.toString() + `; tinyuser=${username};`,
            Host: 'accounts.tiny.com.br',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        if (response.data?.retorno?.codigo_erro) {
          console.log('response.data?.retorno?.codigo_erro');
          throw new BadRequestException(response.data.retorno.erros[0].erro);
        }

        const responseX = new URLSearchParams(response.request?.res?.responseUrl);

        // console.log('nowee', response)

        return {
          tinyCookie: await this.handleCookie(response, userId),
          code: responseX.get('code'),
        };
      } catch (e) {
        // Check if it's a DNS error that should be retried
        if (this.isDnsError(e) && attempt < maxRetries) {
          const waitTime = retryDelay * attempt; // Exponential backoff
          console.log(
            `DNS resolution failed for ${dynamicUrl} in sendYRequest, ` +
            `retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})...`
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // Check if it's a redirect loop error
        if (
          e.message?.includes('Maximum number of redirects exceeded') ||
          e.message?.includes('redirect') ||
          e.message?.includes('Redirect')
        ) {
          console.log('Redirect loop detected in sendYRequest, clearing cookies');
          await this.clearCookies(userId);
          throw new BadRequestException(
            'Authentication failed: Too many redirects during login. Session may be invalid. Please try again.',
          );
        }

        // If it's a DNS error on final attempt, provide a more helpful error message
        if (this.isDnsError(e)) {
          throw new BadRequestException(
            `DNS resolution failed for ${dynamicUrl} after ${maxRetries} attempts. ` +
            `This may be due to network connectivity issues or DNS server problems. ` +
            `Please check your VPS/container DNS settings. ` +
            `Original error: ${e.message || e.cause?.message || 'Unknown error'}`
          );
        }

        throw new BadRequestException(e.message || 'Failed to authenticate');
      }
    }
  }

  async clearCookies(userId: number) {
    // Clear all cookies from the jar to prevent stale cookies causing redirect loops
    const userClient = this.getClientForUser(userId);
    if (!userClient) return;

    const { jar } = userClient;
    try {
      // Clear cookies from both domains (old and new)
      const tinyDomain = 'https://erp.tiny.com.br/';
      const olistDomain = 'https://erp.olist.com/';
      
      const tinyCookies = await jar.getCookies(tinyDomain);
      const olistCookies = await jar.getCookies(olistDomain);
      const totalCookies = (tinyCookies?.length || 0) + (olistCookies?.length || 0);
      
      if (totalCookies > 0) {
        console.log(`Clearing ${totalCookies} cookie(s) from jar for user ${userId}`);
        // Use removeAllCookies() to clear all cookies at once
        await jar.removeAllCookies();
      }
    } catch (e) {
      console.log('Error clearing cookies:', e.message);
      // Continue execution even if clearing fails
    }
  }

  async handleCookie(response: AxiosResponse, userId: number) {
    const pattern = /TINYSESSID=([^;]+)/;
    const userClient = this.getClientForUser(userId);
    const { jar } = userClient;

    // Clear old cookies before setting new ones to prevent stale cookies
    await this.clearCookies(userId);

    for (const item of response.headers[`set-cookie`]) {
      const match = item.match(pattern);
      if (match) {
        const sessionId = match[1];
        // Set cookie for both domains to handle redirects
        await jar.setCookie(
          'TINYSESSID=' + sessionId,
          'https://erp.tiny.com.br/',
        );
        await jar.setCookie(
          'TINYSESSID=' + sessionId,
          'https://erp.olist.com/',
        );
        return { cookie: sessionId };
      }
    }
  }

  async sendARequest(endpoint: string, params: object, apiKey: string) {
    const maxRetries = 5; // Increased from 3 to 5
    const retryDelay = 2000; // Increased from 1s to 2s for DNS propagation

    // For API calls, we can use a shared axios instance (no cookies needed)
    const apiClient = axios.create({
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      timeout: 60000,
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${constants.PROVIDED_BASE_URL}${endpoint}`;
        const paramters = {
          token: apiKey,
          formato: 'json',
          ...params,
        };
        const response = await apiClient.get(url, {
          params: paramters,
          timeout: 60000, // Increased timeout to 60 seconds for slow DNS
        });

        if (response.data.retorno.codigo_erro)
          throw new BadRequestException(response.data.retorno.erros[0].erro);

        return response.data;
      } catch (e) {
        const isDnsError =
          e.code === 'EAI_AGAIN' ||
          e.code === 'ENOTFOUND' ||
          e.code === 'ETIMEDOUT' ||
          e.message?.includes('getaddrinfo') ||
          e.message?.includes('EAI_AGAIN') ||
          e.message?.includes('ETIMEDOUT');

        if (isDnsError && attempt < maxRetries) {
          const waitTime = retryDelay * attempt; // Exponential backoff
          console.log(
            `DNS resolution failed for ${constants.PROVIDED_BASE_URL}${endpoint}, ` +
            `retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})...`
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // If it's a DNS error on final attempt, provide a more helpful error message
        if (isDnsError) {
          throw new BadRequestException(
            `DNS resolution failed for api.tiny.com.br after ${maxRetries} attempts. ` +
            `This may be due to network connectivity issues or DNS server problems. ` +
            `Please check your VPS/container DNS settings. ` +
            `Original error: ${e.message}`
          );
        }

        throw new BadRequestException(e.message);
      }
    }
  }

  async sendBRequest(params: object, endpoint: string, userId: number) {
    const { client } = this.getClientForUser(userId);
    const maxRetries = 5;
    const retryDelay = 2000;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const querystring = require('querystring');
    
    // Build URL - both login and invoice endpoints use new format with function in path
    let url: string;
    if (endpoint === constants.SCRAPED_LOGIN_ENDPOINT && 'metd' in params) {
      // Login uses erp.tiny.com.br with format: {baseUrl}services/reforma.sistema.server/2/{encodedClass}/{method}
      const encodedClass = encodeURIComponent(constants.LOGIN_FUNC_CLSS);
      url = `${constants.SCRAPED_LOGIN_BASE_URL}${endpoint}/2/${encodedClass}/${params['metd']}`;
    } else if (endpoint === constants.SCRAPED_INVOICE_ENDPOINT && 'func' in params) {
      // Invoice also uses erp.tiny.com.br with format: {baseUrl}services/notas.fiscais.server/1/{function}
      url = `${constants.SCRAPED_LOGIN_BASE_URL}${endpoint}/1/${params['func']}`;
    } else {
      // Fallback for other endpoints
      url = `${constants.SCRAPED_BASE_URL}${endpoint}`;
    }
    
    const data = this.generateBRequestData(params, endpoint);

    const headers = {
      'x-custom-request-for': 'XAJAX',
      'x-requested-with': 'XMLHttpRequest',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    };

    let response: AxiosResponse;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await client.post(url, querystring.stringify(data), {
          headers,
          maxRedirects: 5, // Explicitly set redirect limit
        });

        // response.request
        break; // Success, exit retry loop
      } catch (e) {
        console.log(`sendBRequest catch (attempt ${attempt}/${maxRetries}):`, e.message || e.cause?.message || e);

        // Check if it's a DNS error that should be retried
        if (this.isDnsError(e) && attempt < maxRetries) {
          const waitTime = retryDelay * attempt; // Exponential backoff
          console.log(
            `DNS resolution failed for ${url} in sendBRequest, ` +
            `retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})...`
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // Check if it's a redirect loop error
        if (
          e.message?.includes('Maximum number of redirects exceeded') ||
          e.message?.includes('redirect') ||
          e.message?.includes('Redirect')
        ) {
          console.log('Redirect loop detected, clearing cookies');
          await this.clearCookies(userId);
          throw new BadRequestException(
            'Session expired or invalid. Please refresh authentication.',
          );
        }

        // If it's a DNS error on final attempt, provide a more helpful error message
        if (this.isDnsError(e)) {
          throw new BadRequestException(
            `DNS resolution failed for ${url} after ${maxRetries} attempts. ` +
            `This may be due to network connectivity issues or DNS server problems. ` +
            `Please check your VPS/container DNS settings. ` +
            `Original error: ${e.message || e.cause?.message || 'Unknown error'}`
          );
        }

        throw new BadRequestException(e.message || e.cause?.message || 'Unknown error');
      }
    }

    // TypeScript guard: response should always be set if we reach here (all errors throw)
    if (!response) {
      throw new BadRequestException('Failed to get response after retries');
    }

    if (
      response.data['response'].length == 1 &&
      response.data['response'][0]['src']?.includes(constants.AUTH_ERROR_PREFIX)
    )
      if ('metd' in params && params['metd'] == constants.F_LOGIN_FUNC_METD) {
        // console.log('AUTH ERROR RESOPNSE BODY LEMAS CHECK');
        // Obtendo cookie de autênticação:
        // Como o método principal retorna response.data e o cookie de sessão vem via header, precisamos retornar ele aqui nesse momento.
        return this.handleCookie(response, userId);
      }

    return response.data;
  }

  generateBRequestData(params: object, endpoint: string) {
    let args = `[]`;
    if (endpoint === constants.SCRAPED_INVOICE_ENDPOINT) {
      switch (params['func']) {
        case constants.GET_INVOICE_FUNC:
          args = `["${params['invoiceId']}","","N","desabilitarEdicao",55]`;
          break;
        case constants.GET_TEMP_ITEM_FUNC:
          args = `[${params['itemId']},null]`;
          break;
        case constants.ADD_TEMP_ITEM_FUNC:
          args = `["${params['itemId']}","${
            params['tempInvoiceId']
          }",${JSON.stringify(params['tempItem'])},"E"]`;
          break;
        case constants.ADD_INVOICE_FUNC:
          const invoice = params['invoice'];
          console.log('invoice', JSON.stringify(params['invoice']));
          args =
            `["${params['invoiceId']}",` +
            `${JSON.stringify(invoice)},` +
            `"${invoice.idNotaTmp}",` +
            `true,[],"S"]`;
          break;
        case constants.CALC_TAXES_FUNC:
          args = `[-1,"I","${params['tempInvoiceId']}", null, null, null]`;
          break;
        case constants.UPDATE_ITEMS_OPERATION_FUNC:
          args = `["${params['tempInvoiceId']}","${params['operationId']}","${params['operationName']}","S","${params['operationId']}",null,"0"]`;
          console.log(args, '<= args');
          break;
        case constants.UPDATE_INVOICE_FIELD_FUNC:
          args = `["${params['tempInvoiceId']}","${params['fieldName']}","${params['fieldValue']}",null]`;
          break;
      }

      const now = Date.now();
      return {
        type: 1,
        func: params['func'],
        argsLength: args.length,
        timeInicio: now,
        versaoFront: constants.SCRAPED_FRONT_VERSTION,
        pageTime: Math.floor(now / 1000),
        pageLastPing: '0',
        location: `${constants.SCRAPED_LOGIN_BASE_URL}notas_fiscais#edit/${params['invoiceId']}`,
        curRetry: '0',
        duplicidade: 0,
        args: args,
      };
    } else if (endpoint === constants.SCRAPED_LOGIN_ENDPOINT) {
      switch (params['metd']) {
        case constants.E_LOGIN_FUNC_METD:
          args = `[{"login":"${params['login']}","senha":"${params['password']}","derrubarSessoes":true,"ehParceiro":false,"captchaResponse":"","code":"${params['code']}","sessionAccounts":{}}]`;
          break;
        case constants.F_LOGIN_FUNC_METD:
          args = `["${params['uidLogin']}",${params['idUsuario']},null]`;
          break;
      }
      const now = Date.now();
      // Simplified body format - class/method are now in the URL path
      return {
        argsLength: args.length,
        timeInicio: now,
        versaoFront: constants.SCRAPED_FRONT_VERSTION,
        pageTime: Math.floor(now / 1000),
        pageLastPing: '0',
        location: `${constants.SCRAPED_LOGIN_BASE_URL}`,
        curRetry: '0',
        args: args,
      };
    }
  }
}
