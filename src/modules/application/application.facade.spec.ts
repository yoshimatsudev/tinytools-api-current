import { createServer, Server } from 'http';
import { once } from 'events';
import { setImmediate } from 'timers/promises';
import { promisify } from 'util';
import { ApplicationFacade } from './application.facade';
import { ApplicationService } from './application.service';
import { AddInvoiceDto } from './models/addInvoice.dto';
import { constants } from '../../utils/constants';

describe('invoice discount allocation', () => {
  const originalBaseUrl = constants.SCRAPED_LOGIN_BASE_URL;
  let server: Server;
  let facade: ApplicationFacade;
  let headerDiscount: number;
  let itemDiscounts: number[];
  let savedDiscounts: number[] | undefined;
  let savedTotal: string | undefined;
  let savedTaxBase: string | undefined;
  let failure: 'update-http' | 'calculation-rejection' | 'calculation-empty' | undefined;

  beforeEach(async () => {
    headerDiscount = 71.25;
    itemDiscounts = [35.63, 35.62];
    savedDiscounts = undefined;
    savedTotal = undefined;
    savedTaxBase = undefined;
    failure = undefined;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    server = createServer(async (request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Connection', 'close');
      let body = '';
      for await (const chunk of request) body += chunk;
      const args = JSON.parse(new URLSearchParams(body).get('args'));
      const operation = request.url.split('/').pop();

      if (operation === 'updateCampoNotaTmpXajax') {
        if (failure === 'update-http') {
          response.statusCode = 400;
          response.end(JSON.stringify({ response: [] }));
          return;
        }
        // Header updates alone do not remove item allocations. Tiny requests
        // calcularImpostos('N', null, null, true) in its callback.
        await setImmediate();
        headerDiscount = Number(args[2].replace(',', '.'));
        response.end(JSON.stringify({ response: [
          { cmd: 'sc', src: "calcularImpostos('N', null, null, true);" },
        ] }));
        return;
      }

      if (operation === 'calcularImpostos') {
        if (failure === 'calculation-empty') {
          response.end(JSON.stringify({ response: [] }));
          return;
        }
        if (failure === 'calculation-rejection') {
          response.end(JSON.stringify({ response: [
            { cmd: 'rj', exc: 'Rateio recusado' },
          ] }));
          return;
        }
        if (args[1] === 'N' && args[5] === true && headerDiscount === 0) {
          itemDiscounts = [0, 0];
        }
        const allocated = itemDiscounts.some(discount => discount !== 0);
        response.end(JSON.stringify({ response: [
          { cmd: 'as', elm: 'valorProdutos', val: '100,00' },
          { cmd: 'as', elm: 'baseICMS', val: allocated ? '28,75' : '100,00' },
          { cmd: 'as', elm: 'valorICMS', val: allocated ? '1,15' : '4,00' },
        ] }));
        return;
      }

      if (operation === 'salvarNotaFiscal') {
        savedDiscounts = [...itemDiscounts];
        savedTotal = args[1].valorNota;
        savedTaxBase = args[1].baseICMS;
        response.end(JSON.stringify({ response: [{ cmd: 'rt', val: true }] }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ response: [] }));
    });
    const listening = once(server, 'listening');
    server.listen(0, '127.0.0.1');
    await listening;
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP test server');
    }
    constants.SCRAPED_LOGIN_BASE_URL = `http://127.0.0.1:${address.port}/`;
    facade = new ApplicationFacade(new ApplicationService(), undefined);
  });

  afterEach(async () => {
    constants.SCRAPED_LOGIN_BASE_URL = originalBaseUrl;
    jest.restoreAllMocks();
    await promisify(server.close.bind(server))();
  });

  function invoice() {
    return new AddInvoiceDto({
      idNotaTmp: 'temporary-invoice',
      valorProdutos: '100,00',
      valorNota: '28,75',
      baseICMS: '28,75',
      valorICMS: '1,15',
    });
  }

  it('saves without item discounts and with recalculated taxes, not only a zeroed header', async () => {
    await facade.addInvoice('invoice', invoice(), 4);

    expect(savedDiscounts).toEqual([0, 0]);
    expect(savedTotal).toBe('100,00');
    expect(savedTaxBase).toBe('100,00');
  });

  it('does not save stale totals when Tiny rejects the forced allocation', async () => {
    failure = 'calculation-rejection';

    await expect(facade.addInvoice('invoice', invoice(), 4)).rejects.toThrow('Rateio recusado');
    expect(savedDiscounts).toBeUndefined();
  });

  it('does not save a zero-total invoice when calculation returns no totals', async () => {
    failure = 'calculation-empty';

    await expect(facade.addInvoice('invoice', invoice(), 4)).rejects.toThrow();
    expect(savedDiscounts).toBeUndefined();
    expect(savedTotal).toBeUndefined();
  });

  it('does not save when the discount update fails over HTTP', async () => {
    failure = 'update-http';

    await expect(facade.addInvoice('invoice', invoice(), 4)).rejects.toThrow();
    expect(savedDiscounts).toBeUndefined();
  });

  it('preserves allocations for ordinary tax calculation outside the save flow', async () => {
    const taxes = await facade.calcTax('invoice', 'temporary-invoice', 4);

    expect(taxes.baseICMS).toBe('28,75');
    expect(taxes.valorICMS).toBe('1,15');
    expect(itemDiscounts).toEqual([35.63, 35.62]);
    expect(savedDiscounts).toBeUndefined();
  });
});
