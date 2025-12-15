import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApplicationFacade } from '../application/application.facade';
import { WebRepository } from '../web/web.repository';
import { AddInvoiceDto } from '../application/models/addInvoice.dto';
import { UserKeysDto } from './models/userKeys.dto';
import { WebService } from '../web/web.service';

@Injectable()
export class WebhookService {
  constructor(
    @Inject(ApplicationFacade)
    private readonly applicationFacade: ApplicationFacade,
    private readonly webRepository: WebRepository,
    private readonly webService: WebService,
  ) {}

  private getCrtByStore(storeName: string): number {
    // Define CRT values based on store/account
    // CRT 1 = Lucro Presumido/Real, CRT 3 = Simples Nacional
    const crtMap: { [key: string]: number } = {
      'goldtech': 3,    // Lucro Presumido/Real
      'megatech': 1,    // Simples Nacional
    };

    return crtMap[storeName] || 1; // Default to '1' if store not found
  }

  async testWebhook(id: string, store: string) {
    const storeName = id.substring(0, 1) === '1' ? 'goldtech' : 'megatech';
    const userKeys = await this.webRepository.getApiKeyAndIdByName(storeName);

    const keys = new UserKeysDto(userKeys);

    // Determine CRT based on store/account
    const crt = this.getCrtByStore(storeName);

    return await this.startRoutine(id, keys, store, crt);
  }

  async receiveCustomWebhook(
    body: object,
    storeName: string,
    store: string,
  ): Promise<object> {
    console.log(body);
    if (
      body.hasOwnProperty('dados') &&
      body['dados'].hasOwnProperty('codigoSituacao') &&
      body['dados']['codigoSituacao'] === 'preparando_envio' &&
      body['dados']['idNotaFiscal'] != '0'
    ) {
      const isActive = await this.webRepository.getBotIsActiveByName(storeName);
      if (isActive['botIsActive']) {
        const userKeys = await this.webRepository.getApiKeyAndIdByName(
          storeName,
        );
        const keys = new UserKeysDto(userKeys);

        // Determine CRT based on store/account
        const crt = this.getCrtByStore(storeName);
        console.log(crt, 'crt');

        return await this.startRoutine(
          body['dados']['idNotaFiscal'],
          keys,
          store,
          crt,
        );
      }

      return { message: 'Tinytools is not active for ' + storeName };
    }
  }

  async startRoutine(
    id: string,
    userKeys: UserKeysDto,
    store: string,
    crt: number,
  ): Promise<object> {
    try {
      console.log('Starting routine for -', id);
      // eslint-disable-next-line no-var
      var now = new Date();
      // eslint-disable-next-line no-var
      var result = {
        time: now.toISOString(),
        status_code: 999,
        message: 'An error has occurred.',
      };
      const priceReferences = await this.webService.getItems(userKeys.userId);
      // console.log(priceReferences, 'aqui');
      // console.log(
      //   'priceReferences =>',
      //   priceReferences.find((ref) => ref.sku == `561028`),
      // );

      // console.log(cookie, 'cookiee')
      let invoice;

      try {
        invoice = await this.applicationFacade.searchInvoice(id, userKeys.userId);
      } catch (e) {
        // Always try to refresh cookie on first failure
        // (could be auth error or empty cookie jar from per-user refactoring)
        console.log('First searchInvoice attempt failed, refreshing cookie:', e.message || e);
        const cookie = await this.applicationFacade.getTinyCookieById(
          userKeys.userId,
        );

        // Second attempt - if this fails with NotFoundException, the invoice genuinely doesn't exist
        invoice = await this.applicationFacade.searchInvoice(id, userKeys.userId);
      }

      let changedInvoice = false;

      // Ensure itemsArray exists and is an array before iterating
      if (!invoice['itemsArray'] || !Array.isArray(invoice['itemsArray'])) {
        throw new BadRequestException(
          `Invoice ${id} does not have a valid itemsArray. The invoice may be incomplete or invalid.`,
        );
      }

      for (const item of invoice['itemsArray']) {
        // console.log('item =>', item);

        const reference = priceReferences.find(
          (ref) => ref.sku === item.codigo && ref.isActive === true,
        );

        // console.log(reference, 'different prices for this ref');

        if (reference && item.valorUnitario !== reference.price) {
          // console.log('different prices');
          const tempItem = await this.applicationFacade.getTempItem(
            id,
            item.id,
            userKeys.userId,
          );

          // console.log(tempItem);

          if (store === 'mercado' && reference.mercadoActive) {
            await this.applicationFacade.addTempItem(
              id,
              item.id,
              invoice['idNotaTmp'],
              reference.mercadoPrice,
              tempItem,
              userKeys.userId,
            );
          } else if (store === 'shopee' && reference.shopeeActive) {
            await this.applicationFacade.addTempItem(
              id,
              item.id,
              invoice['idNotaTmp'],
              reference.shopeePrice,
              tempItem,
              userKeys.userId,
            );

            console.log('caiu no shopee');
          } else if (store === 'aliexpress' && reference.aliActive) {
            await this.applicationFacade.addTempItem(
              id,
              item.id,
              invoice['idNotaTmp'],
              reference.aliPrice,
              tempItem,
              userKeys.userId,
            );
          } else if (store === 'shein' && reference.sheinActive) {
            await this.applicationFacade.addTempItem(
              id,
              item.id,
              invoice['idNotaTmp'],
              reference.sheinPrice,
              tempItem,
              userKeys.userId,
            );
          } else if (store === 'tiktok' && reference.tiktokActive) {
            await this.applicationFacade.addTempItem(
              id,
              item.id,
              invoice['idNotaTmp'],
              reference.tiktokPrice,
              tempItem,
              userKeys.userId,
            );
          }

          changedInvoice = true;
        }
      }

      console.log(changedInvoice, '<= changedInvoice');

      if (true) {
        // Update items operation (Natureza da Operacao)
        const updateItemsOperation =
          await this.applicationFacade.updateItemsOperation(
            id,
            invoice['idNotaTmp'],
            invoice['idTipoNota'],
            invoice['natureza'],
            userKeys.userId,
          );

        console.log(updateItemsOperation, '<= updateItemsOperation');

        console.log('About to save invoice with ICMS values:', {
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

        await this.applicationFacade.addInvoice(id, new AddInvoiceDto(invoice, crt), userKeys.userId);

        invoice = await this.applicationFacade.searchInvoice(id, userKeys.userId);

        await this.applicationFacade.addInvoice(id, new AddInvoiceDto(invoice, crt), userKeys.userId);

        // console.log(new AddInvoiceDto(invoice, crt), 'invoice invoice invoice');

        await this.applicationFacade.sendInvoice(
          userKeys.apiKey,
          parseInt(id),
          'N',
        );

        result = {
          ...result,
          status_code: 200,
          message: 'Invoice ' + id + ' sent.',
        };
        console.log(result);
        return result;
      }

      result = {
        ...result,
        status_code: 200,
        message: 'Nothing to be changed in invoice ' + id,
      };
      console.log(result);
    } catch (e) {
      // Preserve the original error if it's already a NestJS exception (BadRequestException, UnauthorizedException, NotFoundException, etc.)
      if (e instanceof BadRequestException || e instanceof UnauthorizedException || e instanceof NotFoundException) {
        throw e;
      }
      // If it's an Error with a message about redirects, convert it to BadRequestException
      if (e instanceof Error && e.message?.includes('Maximum number of redirects exceeded')) {
        throw new BadRequestException('Maximum number of redirects exceeded');
      }
      // Otherwise, wrap it properly
      throw new Error(e.message || 'An unexpected error occurred');
    }
  }
}
