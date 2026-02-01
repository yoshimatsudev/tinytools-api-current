export const constants = {
  PROVIDED_BASE_URL: 'https://api.tiny.com.br/api2/',
  PROVIDED_SEND_INVOICE_ENDPOINT: 'nota.fiscal.emitir.php',

  SCRAPED_BASE_URL: 'https://erp.tiny.com.br/',
  SCRAPED_LOGIN_BASE_URL: 'https://erp.tiny.com.br/',
  SCRAPED_INVOICE_ENDPOINT: 'services/notas.fiscais.server',
  SCRAPED_LOGIN_ENDPOINT: 'services/reforma.sistema.server',
  SCRAPED_FRONT_VERSTION: '',
  AUTH_ERROR_PREFIX: 'alert(',
  INVOICE_ITEM_PREFIX: 'setarArrayItens(',
  TEMP_ITEM_PREFIX: 'callbackEditarItem(',
  SENT_TEMP_ITEM_PREFIX: 'callbackSalvarEdicaoItem(',

  GET_INVOICE_FUNC: 'obterNotaFiscal',
  GET_TEMP_ITEM_FUNC: 'obterItemTmp',
  ADD_INVOICE_FUNC: 'salvarNotaFiscal',
  ADD_TEMP_ITEM_FUNC: 'adicionarItemTmpXajax',
  CALC_TAXES_FUNC: 'calcularImpostos',
  UPDATE_ITEMS_OPERATION_FUNC: 'updateItensOperacao',
  UPDATE_INVOICE_FIELD_FUNC: 'updateCampoNotaTmpXajax',
  LOGIN_FUNC_CLSS: 'Login\\Login',

  A_LOGIN_FUNC_METD: 'ewq',
  E_LOGIN_FUNC_METD: 'efetuarLogin',
  F_LOGIN_FUNC_METD: 'finalizarLogin',

  MAX_PROCESSED_BODIES_SIZE: 100,
  CLEANUP_INTERVAL_MS: 3600000,
};
