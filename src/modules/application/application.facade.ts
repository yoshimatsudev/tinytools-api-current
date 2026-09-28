import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApplicationService } from './application.service';
import { constants } from 'src/utils/constants';
import { AddInvoiceDto } from './models/addInvoice.dto';
import { WebRepository } from '../web/web.repository';

@Injectable()
export class ApplicationFacade {
  // Track ongoing authentications per user to prevent race conditions
  // Key: userId, Value: Promise that resolves when authentication completes
  private authPromises: Map<number, Promise<object>> = new Map();

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly webRepository: WebRepository,
  ) {}

  receiveApplication(data): string {
    return 'received';
  }

  async searchProduct(apiKey: string, search: string): Promise<object> {
    const params = {
      pesquisa: search,
    };

    const response = await this.applicationService.sendARequest(
      'produtos.pesquisa.php',
      params,
      apiKey,
    );

    const products = response.retorno.produtos;
    const regex = new RegExp(search, 'i');

    for (let i = 0; i < products.length; i++) {
      if (regex.test(products[i].produto.codigo)) {
        return products[i].produto;
      }
    }

    throw new BadRequestException('Sku não encontrado');
  }

  async searchInvoice(id: string, userId: number): Promise<object> {
    // console.log('Searching invoice -', id);
    const response = await this.applicationService.sendBRequest(
      {
        func: constants.GET_INVOICE_FUNC,
        invoiceId: id,
      },
      constants.SCRAPED_INVOICE_ENDPOINT,
      userId,
    );

    // Validate response structure
    if (!response || !response.response || response.response.length === 0) {
      throw new NotFoundException(`Invoice ${id} not found or response is empty`);
    }

    // Check for domain redirects (e.g., erp.tiny.com.br -> erp.olist.com)
    if (response.response && response.response[0] && response.response[0].src) {
      const responseSrc = response.response[0].src;
      
      // Check for domain redirect
      if (responseSrc.includes('window.location.href') && responseSrc.includes('replace')) {
        const redirectMatch = responseSrc.match(/replace\([^,]+,\s*['"]([^'"]+)['"]/);
        if (redirectMatch && redirectMatch[1]) {
          const targetDomain = redirectMatch[1];

          // erp.olist.com is part of the normal auth flow for this account setup.
          // Treat it like an expired/invalid session so the caller can refresh cookie and retry.
          if (targetDomain.includes('erp.olist.com')) {
            throw new UnauthorizedException('invalid cookie');
          }

          throw new BadRequestException(
            `Invoice ${id} is on a different domain (${targetDomain}). ` +
            `This invoice may belong to a different account or the domain configuration needs to be updated.`
          );
        }
      }
      
      // Check for authentication errors
      if (
        responseSrc.includes('Sua sessão expirou') ||
        responseSrc.includes(constants.AUTH_ERROR_PREFIX) ||
        responseSrc.includes('sessão') ||
        responseSrc.includes('login') ||
        responseSrc.includes('autenticação')
      ) {
        throw new UnauthorizedException('invalid cookie');
      }
    }

    const result = this.mapObject(response, constants.INVOICE_ITEM_PREFIX);

    // Log warning only if itemsArray is missing (indicates potential response format change)
    if (!result['itemsArray']) {
      console.warn(`Invoice ${id}: Response missing itemsArray - possible format change`);
    }

    // console.log(response);

    // Only throw NotFoundException if we have a message and it's not an auth error
    if (Object.keys(result).length == 1 && result['message']) {
      // Double-check it's not an auth error message
      const message = result['message'].toLowerCase();
      if (
        !message.includes('sessão') &&
        !message.includes('login') &&
        !message.includes('autenticação')
      ) {
        throw new NotFoundException(result['message']);
      } else {
        // It's actually an auth error, not "not found"
        throw new UnauthorizedException('invalid cookie');
      }
    }

    return result;
  }

  async getTempItem(id: string, itemId: string, userId: number): Promise<object> {
    // console.log('Getting item -', id);
    const response = await this.applicationService.sendBRequest(
      {
        func: constants.GET_TEMP_ITEM_FUNC,
        invoiceId: id,
        itemId: itemId,
      },
      constants.SCRAPED_INVOICE_ENDPOINT,
      userId,
    );

    return this.mapObject(response, constants.TEMP_ITEM_PREFIX);
  }

  async getTempItemRaw(id: string, itemId: string, userId: number): Promise<string> {
    const response = await this.applicationService.sendBRequest(
      {
        func: constants.GET_TEMP_ITEM_FUNC,
        invoiceId: id,
        itemId: itemId,
      },
      constants.SCRAPED_INVOICE_ENDPOINT,
      userId,
    );

    const props = response?.response || [];
    for (const element of props) {
      if (
        element['cmd'] === 'sc' &&
        element['src'] &&
        element['src'].includes(constants.TEMP_ITEM_PREFIX)
      ) {
        return element['src'];
      }
    }

    return JSON.stringify(response);
  }

  async addTempItem(
    id: string,
    itemId: string,
    tempInvoiceId: string,
    newPrice: string,
    tempItem: object,
    userId: number,
    invoiceContext?: { crt?: string; natureza?: string; store?: string },
  ): Promise<object> {
    console.log('addTempItem payload before update', {
      invoiceId: id,
      itemId,
      tempInvoiceId,
      newPrice,
      quantidade: tempItem['quantidade'],
      quantidadeItem: tempItem['quantidadeItem'],
      keys: Object.keys(tempItem || {}),
    });

    const itemQuantity =
      tempItem['quantidade'] ?? tempItem['quantidadeItem'] ?? '1';

    tempItem['base_comissao'] = newPrice;
    tempItem['valorUnitario'] = newPrice;
    tempItem['valorTotal'] = this.getTotalPrice(
      newPrice,
      itemQuantity,
      'multiply',
    );

    const taxReformNormalization = this.normalizeTaxReformFields(
      tempItem,
      invoiceContext,
    );

    console.log('addTempItem tax reform normalization', {
      invoiceId: id,
      itemId,
      ...taxReformNormalization,
      payloadIBSCBS: tempItem['IBS_CBS'],
      payloadIBSCBSTribRegular: tempItem['IBS_CBS_TRIB_REGULAR'],
      payloadCBS: tempItem['CBS'],
      payloadIBSUF: tempItem['IBS_UF'],
      payloadIBSMUN: tempItem['IBS_MUN'],
    });

    // console.log('Adding temp item -', id);

    const response = await this.applicationService.sendBRequest(
      {
        func: constants.ADD_TEMP_ITEM_FUNC,
        invoiceId: id,
        itemId: itemId,
        tempInvoiceId: tempInvoiceId,
        tempItem: tempItem,
      },
      constants.SCRAPED_INVOICE_ENDPOINT,
      userId,
    );

    return this.mapObject(response, constants.SENT_TEMP_ITEM_PREFIX);
  }

  async addInvoice(id: string, invoice: AddInvoiceDto, userId: number): Promise<object> {
    // Equivalent to confirming "Rateio de valores" in Tiny. Updating only the
    // final invoice payload leaves discounts allocated on the temporary items.
    const discountResponse = await this.applicationService.sendBRequest(
      {
        func: constants.UPDATE_INVOICE_FIELD_FUNC,
        invoiceId: id,
        tempInvoiceId: invoice.idNotaTmp,
        fieldName: 'desconto',
        fieldValue: '0,00',
        calculateTaxes: 'S',
      },
      constants.SCRAPED_INVOICE_ENDPOINT,
      userId,
    );
    const discountResult = this.mapObject(discountResponse, null);
    if ('error' in discountResult) {
      throw new BadRequestException(discountResult['error']);
    }

    // Tiny's discount callback forces allocation before recalculating taxes.
    // Do not save using stale totals if this required step fails.
    const taxes = await this.calcTax(id, invoice.idNotaTmp, userId, true);
    if (!taxes?.valorProdutos || 'error' in taxes) {
      throw new BadRequestException(
        taxes?.['error'] || 'Tax calculation returned no result',
      );
    }

    invoice.desconto = '0,00';
    invoice.valorDesconto = '0,00';
    invoice.valorProdutos = taxes.valorProdutos;
    invoice.totalFaturado = taxes.valorProdutos;
    invoice.valorNota = taxes.valorProdutos;
    invoice.valorAproximadoImpostosTotal = taxes.valorAproximadoImpostosTotal || '0,00';
    invoice.obsSistema = taxes.obsSistema || '';

    // Update tax fields from tax calculation if available
    if (taxes.valorICMS) invoice.valorICMS = taxes.valorICMS;
    if (taxes.baseICMS) invoice.baseICMS = taxes.baseICMS;
    if (taxes.valorTotalFCP) invoice.valorTotalFCP = taxes.valorTotalFCP;
    if (taxes.valorTotalICMSFCPDestino) invoice.valorTotalICMSFCPDestino = taxes.valorTotalICMSFCPDestino;
    if (taxes.percentualICMSFCPDestino) invoice.percentualICMSFCPDestino = taxes.percentualICMSFCPDestino;
    if (taxes.valorTotalICMSPartilhaDestino) invoice.valorTotalICMSPartilhaDestino = taxes.valorTotalICMSPartilhaDestino;
    if (taxes.valorTotalICMSPartilhaOrigem) invoice.valorTotalICMSPartilhaOrigem = taxes.valorTotalICMSPartilhaOrigem;
    if (taxes.percentualICMSPartilhaDestino) invoice.percentualICMSPartilhaDestino = taxes.percentualICMSPartilhaDestino;

    // Reforma tributária / IBS-CBS totals
    if (taxes.valorTotalBCIBSCBS) invoice.valorTotalBCIBSCBS = taxes.valorTotalBCIBSCBS;
    if (taxes.valorTotalIS) invoice.valorTotalIS = taxes.valorTotalIS;
    if (taxes.valorDiferimentoIBSUF) invoice.valorDiferimentoIBSUF = taxes.valorDiferimentoIBSUF;
    if (taxes.valorDevolucaoIBSUF) invoice.valorDevolucaoIBSUF = taxes.valorDevolucaoIBSUF;
    if (taxes.valorTotalIBSUF) invoice.valorTotalIBSUF = taxes.valorTotalIBSUF;
    if (taxes.valorDiferimentoIBSMun) invoice.valorDiferimentoIBSMun = taxes.valorDiferimentoIBSMun;
    if (taxes.valorDevolucaoIBSMun) invoice.valorDevolucaoIBSMun = taxes.valorDevolucaoIBSMun;
    if (taxes.valorTotalIBSMun) invoice.valorTotalIBSMun = taxes.valorTotalIBSMun;
    if (taxes.valorTotalIBS) invoice.valorTotalIBS = taxes.valorTotalIBS;
    if (taxes.valorCredPresIBS) invoice.valorCredPresIBS = taxes.valorCredPresIBS;
    if (taxes.valorCredPresSusIBS) invoice.valorCredPresSusIBS = taxes.valorCredPresSusIBS;
    if (taxes.valorDiferimentoCBS) invoice.valorDiferimentoCBS = taxes.valorDiferimentoCBS;
    if (taxes.valorDevolucaoCBS) invoice.valorDevolucaoCBS = taxes.valorDevolucaoCBS;
    if (taxes.valorTotalCBS) invoice.valorTotalCBS = taxes.valorTotalCBS;
    if (taxes.valorCredPresCBS) invoice.valorCredPresCBS = taxes.valorCredPresCBS;
    if (taxes.valorCredPresSusCBS) invoice.valorCredPresSusCBS = taxes.valorCredPresSusCBS;
    if (taxes.valorIBSMono) invoice.valorIBSMono = taxes.valorIBSMono;
    if (taxes.valorCBSMono) invoice.valorCBSMono = taxes.valorCBSMono;
    if (taxes.valorIBSMonoReten) invoice.valorIBSMonoReten = taxes.valorIBSMonoReten;
    if (taxes.valorCBSMonoReten) invoice.valorCBSMonoReten = taxes.valorCBSMonoReten;
    if (taxes.valorIBSMonoRet) invoice.valorIBSMonoRet = taxes.valorIBSMonoRet;
    if (taxes.valorCBSMonoRet) invoice.valorCBSMonoRet = taxes.valorCBSMonoRet;

    try {
      console.log('About to save invoice with these ICMS values:', {
        valorProdutos: invoice.valorProdutos,
        baseICMS: invoice.baseICMS,
        valorICMS: invoice.valorICMS,
        valorTotalFCP: invoice.valorTotalFCP,
        valorTotalICMSFCPDestino: invoice.valorTotalICMSFCPDestino,
        percentualICMSFCPDestino: invoice.percentualICMSFCPDestino,
        valorTotalICMSPartilhaDestino: invoice.valorTotalICMSPartilhaDestino,
        valorTotalICMSPartilhaOrigem: invoice.valorTotalICMSPartilhaOrigem,
        percentualICMSPartilhaDestino: invoice.percentualICMSPartilhaDestino,
        valorNota: invoice.valorNota,
      });

      const response = await this.applicationService.sendBRequest(
        {
          func: constants.ADD_INVOICE_FUNC,
          invoiceId: id,
          invoice: invoice,
        },
        constants.SCRAPED_INVOICE_ENDPOINT,
        userId,
      );

      const result = this.mapObject(response, constants.ADD_INVOICE_FUNC);
      console.log('Invoice saved successfully:', result);
      return result;
    } catch (error) {
      console.error('Invoice save failed:', error.message);
      console.error('Invoice data that failed to save:', {
        valorProdutos: invoice.valorProdutos,
        baseICMS: invoice.baseICMS,
        valorICMS: invoice.valorICMS,
        valorTotalFCP: invoice.valorTotalFCP,
        valorTotalICMSFCPDestino: invoice.valorTotalICMSFCPDestino,
        percentualICMSFCPDestino: invoice.percentualICMSFCPDestino,
        valorTotalICMSPartilhaDestino: invoice.valorTotalICMSPartilhaDestino,
        valorTotalICMSPartilhaOrigem: invoice.valorTotalICMSPartilhaOrigem,
        percentualICMSPartilhaDestino: invoice.percentualICMSPartilhaDestino,
      });
      throw new BadRequestException(`Failed to save invoice: ${error.message}`);
    }
  }

  async sendInvoice(
    apiKey: string,
    invoiceId: number,
    sendEmail: string,
  ): Promise<object> {
    console.log('Sending invoice -', invoiceId);

    let response;
    try {
      response = await this.applicationService.sendARequest(
        constants.PROVIDED_SEND_INVOICE_ENDPOINT,
        { id: invoiceId, enviarEmail: sendEmail },
        apiKey,
      );

      return response.data;
    } catch (e) {
      throw new Error(e.message);
    }
  }

  async getTinyCookieById(id: number): Promise<object> {
    // Check if authentication is already in progress for this user
    if (this.authPromises.has(id)) {
      console.log(`Authentication already in progress for user ${id}, waiting...`);
      return await this.authPromises.get(id);
    }

    // Start new authentication
    const keys = await this.webRepository.getTinyKeysByUserId(id);

    if (!keys)
      throw new UnauthorizedException(
        'O nome de usuário e a senha não correspondem',
      );

    // Create authentication promise and store it
    const authPromise = this.getTinyCookie(keys['tinyLogin'], keys['tinyPassword'], id)
      .finally(() => {
        // Remove from map when done (success or failure)
        this.authPromises.delete(id);
      });

    this.authPromises.set(id, authPromise);
    return await authPromise;
  }

  async getTinyCookie(login: string, password: string, userId: number): Promise<object> {
    console.log('Starting to get tiny cookie for user', userId);

    // Clear any stale cookies before starting fresh authentication
    await this.applicationService.clearCookies(userId);

    const aLogin = await this.applicationService.sendXRequest({
      login,
      password,
    }, userId);

    // console.log('aLogin success');

    const { dynamicUrl, setCookieResponse } = aLogin;
    // console.log(setCookieResponse)

    const bLogin = await this.applicationService.sendYRequest(
      dynamicUrl,
      login,
      password,
      setCookieResponse,
      userId,
    );

    const { tinyCookie, code } = bLogin;

    // console.log('bLogin success');

    const eLogin = await this.applicationService.sendBRequest(
      {
        metd: constants.E_LOGIN_FUNC_METD,
        login,
        password,
        code,
      },
      constants.SCRAPED_LOGIN_ENDPOINT,
      userId,
    );

    // console.log('eLogin sucess');

    const eResponse = this.mapObject(eLogin, null);

    if ('error' in eResponse)
      throw new UnauthorizedException(
        'O nome de usuário e a senha não correspondem',
      );

    await this.applicationService.sendBRequest(
      {
        metd: constants.F_LOGIN_FUNC_METD,
        uidLogin: eResponse['response']['uidLogin'],
        idUsuario: eResponse['response']['idUsuario'],
      },
      constants.SCRAPED_LOGIN_ENDPOINT,
      userId,
    );

    // console.log('passed bRequest login');

    // console.log(tinyCookie)

    return tinyCookie;
  }

  async updateItemsOperation(
    id: string,
    tempInvoiceId: string,
    operationId: string,
    operationName: string,
    userId: number,
  ): Promise<object> {
    console.log('Updating items operation -', id);
    const response = await this.applicationService.sendBRequest(
      {
        func: constants.UPDATE_ITEMS_OPERATION_FUNC,
        invoiceId: id,
        tempInvoiceId: tempInvoiceId,
        operationId: operationId,
        operationName: operationName,
      },
      constants.SCRAPED_INVOICE_ENDPOINT,
      userId,
    );

    return response;
  }

  async calcTax(
    id: string,
    tempInvoiceId: string,
    userId: number,
    forceDiscountAllocation = false,
  ): Promise<Partial<AddInvoiceDto> & { error?: string }> {
    // console.log('Calculating taxes -', id);
    const response = await this.applicationService.sendBRequest(
      {
        func: constants.CALC_TAXES_FUNC,
        invoiceId: id,
        tempInvoiceId: tempInvoiceId,
        forceDiscountAllocation,
      },
      constants.SCRAPED_INVOICE_ENDPOINT,
      userId,
    );

    console.log('calculate taxes response', response);

    // Try to get the calculated values from the response
    const mappedResponse: Partial<AddInvoiceDto> & { error?: string } =
      this.mapObject(response, null);

    // If mapObject doesn't return proper tax values, try to extract them from the raw response
    if (!mappedResponse.valorProdutos || !mappedResponse.valorICMS) {
      console.log('Tax calculation response may need manual parsing');
      console.log('Mapped response keys:', Object.keys(mappedResponse));

      // Look for specific patterns in the response that might contain the calculated values
      const responseText = JSON.stringify(response);
      const valorProdutosMatch = responseText.match(
        /valorProdutos["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const valorICMSMatch = responseText.match(
        /valorICMS["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const baseICMSMatch = responseText.match(
        /baseICMS["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const valorTotalFCPMatch = responseText.match(
        /valorTotalFCP["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const valorTotalICMSFCPDestinoMatch = responseText.match(
        /valorTotalICMSFCPDestino["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const percentualICMSFCPDestinoMatch = responseText.match(
        /percentualICMSFCPDestino["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const valorTotalICMSPartilhaDestinoMatch = responseText.match(
        /valorTotalICMSPartilhaDestino["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const valorTotalICMSPartilhaOrigemMatch = responseText.match(
        /valorTotalICMSPartilhaOrigem["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const percentualICMSPartilhaDestinoMatch = responseText.match(
        /percentualICMSPartilhaDestino["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );
      const valorAproximadoImpostosTotalMatch = responseText.match(
        /valorAproximadoImpostosTotal["\s]*:[\s]*["\s]*([^"\s,}]+)/,
      );

      if (valorProdutosMatch || valorICMSMatch || baseICMSMatch || valorTotalFCPMatch || valorTotalICMSFCPDestinoMatch || valorTotalICMSPartilhaDestinoMatch) {
        console.log('Found tax values in response, updating mappedResponse');
        if (valorProdutosMatch) {
          mappedResponse.valorProdutos = valorProdutosMatch[1];
          console.log('Found valorProdutos:', valorProdutosMatch[1]);
        }
        if (valorICMSMatch) {
          mappedResponse.valorICMS = valorICMSMatch[1];
          console.log('Found valorICMS:', valorICMSMatch[1]);
        }
        if (baseICMSMatch) {
          mappedResponse.baseICMS = baseICMSMatch[1];
          console.log('Found baseICMS:', baseICMSMatch[1]);
        }
        if (valorTotalFCPMatch) {
          mappedResponse.valorTotalFCP = valorTotalFCPMatch[1];
          console.log('Found valorTotalFCP:', valorTotalFCPMatch[1]);
        }
        if (valorTotalICMSFCPDestinoMatch) {
          mappedResponse.valorTotalICMSFCPDestino = valorTotalICMSFCPDestinoMatch[1];
          console.log('Found valorTotalICMSFCPDestino:', valorTotalICMSFCPDestinoMatch[1]);
        }
        if (percentualICMSFCPDestinoMatch) {
          mappedResponse.percentualICMSFCPDestino = percentualICMSFCPDestinoMatch[1];
          console.log('Found percentualICMSFCPDestino:', percentualICMSFCPDestinoMatch[1]);
        }
        if (valorTotalICMSPartilhaDestinoMatch) {
          mappedResponse.valorTotalICMSPartilhaDestino = valorTotalICMSPartilhaDestinoMatch[1];
          console.log('Found valorTotalICMSPartilhaDestino:', valorTotalICMSPartilhaDestinoMatch[1]);
        }
        if (valorTotalICMSPartilhaOrigemMatch) {
          mappedResponse.valorTotalICMSPartilhaOrigem = valorTotalICMSPartilhaOrigemMatch[1];
          console.log('Found valorTotalICMSPartilhaOrigem:', valorTotalICMSPartilhaOrigemMatch[1]);
        }
        if (percentualICMSPartilhaDestinoMatch) {
          mappedResponse.percentualICMSPartilhaDestino = percentualICMSPartilhaDestinoMatch[1];
          console.log('Found percentualICMSPartilhaDestino:', percentualICMSPartilhaDestinoMatch[1]);
        }
        if (valorAproximadoImpostosTotalMatch) {
          mappedResponse.valorAproximadoImpostosTotal =
            valorAproximadoImpostosTotalMatch[1];
          console.log('Found valorAproximadoImpostosTotal:', valorAproximadoImpostosTotalMatch[1]);
        }
      } else {
        console.log('No tax values found in response text');
        console.log('Response text sample:', responseText.substring(0, 500));
      }
    }

    return mappedResponse;
  }

  private normalizeTaxReformFields(
    tempItem: any,
    invoiceContext?: { crt?: string; natureza?: string; store?: string },
  ) {
    const crt = invoiceContext?.crt?.toString?.() ?? '';
    const natureza = (
      invoiceContext?.natureza ??
      tempItem?.natureza ??
      ''
    ).toString();

    const isRegimeNormal =
      crt === '3' || natureza.toLowerCase().includes('regime normal');

    const existingIbsCbs =
      tempItem?.IBS_CBS && typeof tempItem.IBS_CBS === 'object'
        ? { ...tempItem.IBS_CBS }
        : null;

    const previousCST = existingIbsCbs?.CST;
    const previousCClassTrib = existingIbsCbs?.cClassTrib;

    if (!isRegimeNormal) {
      return {
        appliedFallback: false,
        skippedReason: 'non-regime-normal',
        crt,
        natureza,
        previousCST,
        previousCClassTrib,
      };
    }

    const normalizedCST =
      typeof previousCST === 'string' && /^\d{3}$/.test(previousCST)
        ? previousCST
        : '000';
    const normalizedCClassTrib =
      typeof previousCClassTrib === 'string' && /^\d{6}$/.test(previousCClassTrib)
        ? previousCClassTrib
        : '000001';

    tempItem.IBS_CBS = {
      ...(existingIbsCbs ?? {}),
      CST: normalizedCST,
      cClassTrib: normalizedCClassTrib,
    };

    const existingIbsCbsTribRegular =
      tempItem?.IBS_CBS_TRIB_REGULAR &&
      typeof tempItem.IBS_CBS_TRIB_REGULAR === 'object'
        ? { ...tempItem.IBS_CBS_TRIB_REGULAR }
        : null;

    const previousTribRegularCST = existingIbsCbsTribRegular?.CST;
    const previousTribRegularCClassTrib =
      existingIbsCbsTribRegular?.cClassTrib;

    tempItem.IBS_CBS_TRIB_REGULAR = {
      ...(existingIbsCbsTribRegular ?? {}),
      CST:
        typeof previousTribRegularCST === 'string' &&
        /^\d{3}$/.test(previousTribRegularCST)
          ? previousTribRegularCST
          : normalizedCST,
      cClassTrib:
        typeof previousTribRegularCClassTrib === 'string' &&
        /^\d{6}$/.test(previousTribRegularCClassTrib)
          ? previousTribRegularCClassTrib
          : normalizedCClassTrib,
    };

    const ibsCbsBase = Number(tempItem?.IBS_CBS?.edValorBCIbsCbs ?? 0);
    const existingCBS =
      tempItem?.CBS && typeof tempItem.CBS === 'object' ? { ...tempItem.CBS } : {};
    const existingIBSUF =
      tempItem?.IBS_UF && typeof tempItem.IBS_UF === 'object'
        ? { ...tempItem.IBS_UF }
        : {};
    const existingIBSMUN =
      tempItem?.IBS_MUN && typeof tempItem.IBS_MUN === 'object'
        ? { ...tempItem.IBS_MUN }
        : {};

    const shouldApplyAliqFallback =
      ibsCbsBase > 0 &&
      Number(existingCBS?.cbs_aliqCbs ?? 0) === 0 &&
      Number(existingIBSUF?.ibsuf_aliqIbsUf ?? 0) === 0;

    if (shouldApplyAliqFallback) {
      const cbsAliq = 0.9;
      const ibsUfAliq = 0.1;
      const ibsMunAliq = Number(existingIBSMUN?.ibsmun_aliqIbsMun ?? 0);
      const cbsValorImposto = Number(((ibsCbsBase * cbsAliq) / 100).toFixed(2));
      const ibsUfValorImposto = Number(((ibsCbsBase * ibsUfAliq) / 100).toFixed(2));
      const ibsMunValorImposto = Number(((ibsCbsBase * ibsMunAliq) / 100).toFixed(2));

      tempItem.CBS = {
        ...existingCBS,
        cbs_aliqCbs: cbsAliq,
        cbs_aliqDiferimento: Number(existingCBS?.cbs_aliqDiferimento ?? 0),
        cbs_percentRedAliq: Number(existingCBS?.cbs_percentRedAliq ?? 0),
        cbs_aliqEfetiva: Number(existingCBS?.cbs_aliqEfetiva ?? 0),
        cbs_valorImposto: cbsValorImposto,
      };

      tempItem.IBS_UF = {
        ...existingIBSUF,
        ibsuf_aliqIbsUf: ibsUfAliq,
        ibsuf_aliqDiferimento: Number(existingIBSUF?.ibsuf_aliqDiferimento ?? 0),
        ibsuf_percentRedAliq: Number(existingIBSUF?.ibsuf_percentRedAliq ?? 0),
        ibsuf_aliqEfetiva: Number(existingIBSUF?.ibsuf_aliqEfetiva ?? 0),
        ibsuf_valorImposto: ibsUfValorImposto,
      };

      tempItem.IBS_MUN = {
        ...existingIBSMUN,
        ibsmun_aliqIbsMun: ibsMunAliq,
        ibsmun_aliqDiferimento: Number(existingIBSMUN?.ibsmun_aliqDiferimento ?? 0),
        ibsmun_percentRedAliq: Number(existingIBSMUN?.ibsmun_percentRedAliq ?? 0),
        ibsmun_aliqEfetiva: Number(existingIBSMUN?.ibsmun_aliqEfetiva ?? 0),
        ibsmun_valorImposto: ibsMunValorImposto,
      };

      tempItem.IBS_CBS_TRIB_REGULAR = {
        ...tempItem.IBS_CBS_TRIB_REGULAR,
        tribregular_aliqIbsUf: ibsUfAliq,
        tribregular_percentRedAliqIbsUf: Number(
          tempItem.IBS_CBS_TRIB_REGULAR?.tribregular_percentRedAliqIbsUf ?? 0,
        ),
        tribregular_aliqEfetivaIbsUf: Number(
          tempItem.IBS_CBS_TRIB_REGULAR?.tribregular_aliqEfetivaIbsUf ?? 0,
        ),
        tribregular_valorImpostoIbsUf: ibsUfValorImposto,
        tribregular_aliqIbsMun: ibsMunAliq,
        tribregular_percentRedAliqIbsMun: Number(
          tempItem.IBS_CBS_TRIB_REGULAR?.tribregular_percentRedAliqIbsMun ?? 0,
        ),
        tribregular_aliqEfetivaIbsMun: Number(
          tempItem.IBS_CBS_TRIB_REGULAR?.tribregular_aliqEfetivaIbsMun ?? 0,
        ),
        tribregular_valorImpostoIbsMun: ibsMunValorImposto,
        tribregular_aliqCbs: cbsAliq,
        tribregular_percentRedAliqCbs: Number(
          tempItem.IBS_CBS_TRIB_REGULAR?.tribregular_percentRedAliqCbs ?? 0,
        ),
        tribregular_aliqEfetivaCbs: Number(
          tempItem.IBS_CBS_TRIB_REGULAR?.tribregular_aliqEfetivaCbs ?? 0,
        ),
        tribregular_valorImpostoCbs: cbsValorImposto,
      };
    }

    return {
      appliedFallback:
        normalizedCST !== previousCST ||
        normalizedCClassTrib !== previousCClassTrib ||
        !existingIbsCbs ||
        tempItem.IBS_CBS_TRIB_REGULAR.CST !== previousTribRegularCST ||
        tempItem.IBS_CBS_TRIB_REGULAR.cClassTrib !== previousTribRegularCClassTrib ||
        !existingIbsCbsTribRegular,
      skippedReason: null,
      crt,
      natureza,
      previousCST,
      previousCClassTrib,
      nextCST: normalizedCST,
      nextCClassTrib: normalizedCClassTrib,
      createdIBSCBSBlock: !existingIbsCbs,
      previousTribRegularCST,
      previousTribRegularCClassTrib,
      nextTribRegularCST: tempItem.IBS_CBS_TRIB_REGULAR.CST,
      nextTribRegularCClassTrib: tempItem.IBS_CBS_TRIB_REGULAR.cClassTrib,
      createdIBSCBSTribRegularBlock: !existingIbsCbsTribRegular,
      ibsCbsBase,
      shouldApplyAliqFallback,
      nextCBS: tempItem.CBS,
      nextIBSUF: tempItem.IBS_UF,
      nextIBSMUN: tempItem.IBS_MUN,
    };
  }

  private getTotalPrice(
    firstElement: string,
    secondElement: string,
    operator: string,
  ) {
    const normalizedFirstElement = (firstElement ?? '0').toString();
    const normalizedSecondElement = (secondElement ?? '0').toString();

    const _firstElement = parseFloat(normalizedFirstElement.replace(',', '.'));
    const _secondElement = parseFloat(normalizedSecondElement.replace(',', '.'));
    let _result = 0;
    switch (operator) {
      case 'multiply':
        _result = _firstElement * _secondElement;
        break;
      case 'sum':
        _result = _firstElement + _secondElement;
        break;
      case 'divide':
        _result = _firstElement / _secondElement;
    }
    return _result.toFixed(2).toString().replace('.', ',');
  }

  private mapObject(object: object, prefix: string) {
    const props = object['response'];
    let result = {};
    
    if (!props || !Array.isArray(props) || props.length === 0) {
      return result;
    }

    props.forEach((element) => {
      if (element['cmd'] == 'as') result[element['elm']] = element['val'];
      else if (element['cmd'] == 'sc') {
        // Check if this 'sc' command contains our prefix
        if (element['src'] && element['src'].includes(prefix)) {
          if (prefix == constants.INVOICE_ITEM_PREFIX) {
            try {
              result['itemsArray'] = this.parseNestedArray(element['src']);
            } catch (error) {
              // Log error but don't set itemsArray - let calling code handle it
              console.error(`Error parsing itemsArray: ${error.message}`);
            }
          } else if (prefix == constants.TEMP_ITEM_PREFIX) {
            const parsedObj = this.parseFunctionObjectArgs(
              element['src'],
              constants.TEMP_ITEM_PREFIX,
            );
            result = parsedObj;
          } else if (prefix == constants.SENT_TEMP_ITEM_PREFIX) {
            const parsedSrc = this.parseNestedBraces(element['src']);
            const parsedObj = JSON.parse(
              unescape(parsedSrc[parsedSrc.length - 1]),
            );
            result = parsedObj;
          }
        }
      } else if (element['cmd'] == 'rt') result['response'] = element['val'];
      else if (element['cmd'] == 'rj') {
        result['error'] = element['exc'];
        console.error('Response error:', element['exc']);
      }
    });

    return result;
  }

  private parseFunctionObjectArgs(text: string, prefix: string) {
    const args = this.parseFunctionArgs(text, prefix);
    const parsedObjects = args
      .map((arg) => arg.trim())
      .filter((arg) => arg.startsWith('{') && arg.endsWith('}'))
      .map((arg) => JSON.parse(unescape(arg)));

    if (parsedObjects.length === 0) {
      throw new Error(`Could not find object arguments for ${prefix}`);
    }

    return parsedObjects.reduce((accumulator, current) => {
      return { ...accumulator, ...current };
    }, {});
  }

  private parseFunctionArgs(text: string, prefix: string): string[] {
    const prefixIndex = text.indexOf(prefix);
    if (prefixIndex === -1) {
      throw new Error(`Could not find prefix ${prefix} in text`);
    }

    const openParenIndex = text.indexOf('(', prefixIndex);
    if (openParenIndex === -1) {
      throw new Error(`Could not find opening parenthesis for ${prefix}`);
    }

    const args: string[] = [];
    let currentArg = '';
    let depthBraces = 0;
    let depthBrackets = 0;
    let depthParens = 0;
    let inString = false;
    let escaping = false;

    for (let i = openParenIndex + 1; i < text.length; i++) {
      const char = text[i];

      if (escaping) {
        currentArg += char;
        escaping = false;
        continue;
      }

      if (char === '\\') {
        currentArg += char;
        escaping = true;
        continue;
      }

      if (char === '"') {
        currentArg += char;
        inString = !inString;
        continue;
      }

      if (inString) {
        currentArg += char;
        continue;
      }

      if (char === '{') depthBraces++;
      else if (char === '}') depthBraces--;
      else if (char === '[') depthBrackets++;
      else if (char === ']') depthBrackets--;
      else if (char === '(') depthParens++;
      else if (char === ')') {
        if (depthBraces === 0 && depthBrackets === 0 && depthParens === 0) {
          if (currentArg.trim()) {
            args.push(currentArg.trim());
          }
          return args;
        }
        depthParens--;
      }

      if (
        char === ',' &&
        depthBraces === 0 &&
        depthBrackets === 0 &&
        depthParens === 0
      ) {
        args.push(currentArg.trim());
        currentArg = '';
        continue;
      }

      currentArg += char;
    }

    throw new Error(`Could not find closing parenthesis for ${prefix}`);
  }

  private parseNestedArray(text) {
    // Find the position of setarArrayItens( and extract the array
    const prefixIndex = text.indexOf('setarArrayItens(');
    if (prefixIndex === -1) {
      // Fallback: try to find any array pattern
      const simpleRegex = /\[.*?\]/;
      const match = text.match(simpleRegex);
      if (!match) {
        throw new Error(`Could not find array in text: ${text.substring(0, 200)}`);
      }
      return JSON.parse(match[0]);
    }

    // Find the opening bracket after setarArrayItens(
    const startIndex = text.indexOf('[', prefixIndex);
    if (startIndex === -1) {
      throw new Error(`Could not find opening bracket after setarArrayItens( in: ${text.substring(0, 200)}`);
    }

    // Find the matching closing bracket by counting brackets
    let bracketCount = 0;
    let endIndex = startIndex;
    for (let i = startIndex; i < text.length; i++) {
      if (text[i] === '[') bracketCount++;
      if (text[i] === ']') bracketCount--;
      if (bracketCount === 0) {
        endIndex = i;
        break;
      }
    }

    if (bracketCount !== 0) {
      throw new Error(`Unbalanced brackets in array: ${text.substring(startIndex, startIndex + 200)}`);
    }

    const vetorString = text.substring(startIndex, endIndex + 1);
    const vetor = JSON.parse(vetorString);
    return vetor;
  }

  private parseNestedBraces(text) {
    const stack = [];
    const matches = [];

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        stack.push(i);
      } else if (text[i] === '}') {
        if (stack.length > 0) {
          const startIndex = stack.pop();
          const endIndex = i;
          const match = text.substring(startIndex, endIndex + 1);
          matches.push(match);
        }
      }
    }

    return matches;
  }
}
