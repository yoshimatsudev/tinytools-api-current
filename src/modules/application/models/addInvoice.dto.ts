import { ApiProperty } from '@nestjs/swagger';

export class AddInvoiceDto {
  constructor(object, crt: number = 1) {
    for (const prop in object) {
      if (object.hasOwnProperty(prop)) {
        if (prop == 'view-info-nota-fiscal' || prop == 'obs_cliente') continue;
        if (object[prop] == null) this[prop] = '';
        else this[prop] = object[prop].toString();
      }
    }
    this.abrirPopupEmissaoAoSalvar = 'N';
    this.aliquotaIcmsCTe = '';
    this.campoMarcacoesObjeto = '';
    this.camposParcelas = {
      dataInicial: 'dataEmissao',
      valorFrete: '',
      valorICMSSubst: '',
      valorIPI: '',
      valorTotal: 'totalFaturado',
      valorTotalFCPST: '',
    };
    this.cfopCTe = '';
    this.chaveAcesso = '';
    this.contOperacao = '';
    this.detalhar_desoneracao = '';
    this.ecommerceAdicionais = '';

    // test
    this.consumidorFinal = 'S';
    this.crt = crt;
    this.finalidade = '1';

    this.tipoDesconto = '';
    this.valorPagamentoIntegrado = '';
    this.pagamentosIntegrados = '[]';
    this['meio-pagamento-integrado'] = '0';
    this.desabilitouManualmenteRepasseJuros = 'N';
    this.codigoBandeiraPagamentoIntegrado = '';
    this.codigoAutorizacaoPagamentoIntegrado = '';
    this.cnpjIntermediadorPagamentoIntegrado = '';
    //

    this.enderecoAlternativo = {
      bairro: '',
      cep: '',
      cnpj: '',
      complemento: '',
      cpf: '',
      endereco: '',
      enderecoNro: '',
      fone: '',
      id: '0',
      idMunicipio: '',
      ie: '',
      municipio: '',
      nomeDestinatario: '',
      tipoPessoa: 'F',
      uf: ' ',
    };
    this.ufEmpresa = 'RJ';
    this.faturada = '';
    this.hashAlterarLotes = '';
    this.percentualICMSFCPDestino = '0,00';
    this.idDest = '0';
    this.idEntrega = '';
    this.idLinhaProduto = '';
    this.idListaVendas = '0';
    this.idPedidoEcommerce = '';
    this.idPlataformaEcommerce = '0';
    this.indNatFrt = '0';
    this.itemNumber = '-1';
    this.modeloEcf = '2B';
    this.notaComplementar = 'N';
    this.nroItens = '1';
    this.nroPedidoCanalVenda = '';
    this.nroPedidoEcommerce = '';
    this.nroUsuario = '';
    this.pag_meioBoleto = 'B';
    this.parcelaNumber = '0';
    this.peso_calculado = 'S';
    this.precoLista = '';
    this.precototal = '';
    this.precounitario = '';
    this.produto = '';
    this.produtoId = '';
    this.quantidade = '';
    this.refCTe = '';
    this.selectStIcmsCTe = '';
    this.servicoNumber = '-1';
    this.tipoProduto = 'P';
    this.totalICMSSubst = '0';
    this.transacao = {
      dataCriacao: '',
      dataDebito: '',
      id: '',
      idMeioPagamento: '',
      numeroParcelas: '',
      tarifa: '',
      transactionId: '',
      valorTransacao: '',
    };
    this.un = '';
    this.valorDesonerado = '0,00';
    this.valorFreteEcommerce = '0';
    this.valorIpiFixo = '';
    this.desconto = '0,00';
    this.valorDesconto = '0,00';
  }

  @ApiProperty()
  abrirPopupEmissaoAoSalvar: string;
  @ApiProperty()
  aliquotaIcmsCTe: string;
  @ApiProperty()
  alqSimples: string;
  @ApiProperty()
  bairro: string;
  @ApiProperty()
  baseCalculoISS: string;
  @ApiProperty()
  baseICMS: string;
  @ApiProperty()
  baseICMSSubst: string;
  @ApiProperty()
  calculaImpostos: string;
  @ApiProperty()
  campoMarcacoesObjeto: string;
  @ApiProperty()
  camposParcelas: object;
  @ApiProperty()
  cep: string;
  @ApiProperty()
  cfop: string;
  @ApiProperty()
  cfopCTe: string;
  @ApiProperty()
  chaveAcesso: string;
  @ApiProperty()
  cnpj: string;
  @ApiProperty()
  valorPagamentoIntegrado: string;
  @ApiProperty()
  pagamentosIntegrados: string;
  @ApiProperty()
  'meio-pagamento-integrado': string;
  @ApiProperty()
  ufEmpresa: string;
  @ApiProperty()
  desabilitouManualmenteRepasseJuros: string;
  @ApiProperty()
  codigoBandeiraPagamentoIntegrado: string;
  @ApiProperty()
  codigoAutorizacaoPagamentoIntegrado: string;
  @ApiProperty()
  cnpjIntermediadorPagamentoIntegrado: string;
  @ApiProperty()
  cnpjTransportador: string;
  @ApiProperty()
  codigoRastreamento: string;
  @ApiProperty()
  complemento: string;
  @ApiProperty()
  consumidorFinal: string;
  @ApiProperty()
  contato: string;
  @ApiProperty()
  contOperacao: string;
  @ApiProperty()
  crt: number;
  @ApiProperty()
  custoAtualizado: string;
  @ApiProperty()
  dataEmissao: string;
  @ApiProperty()
  dataSaidaEntrada: string;
  @ApiProperty()
  desconto: string;
  @ApiProperty()
  detalhar_desoneracao: string;
  @ApiProperty()
  diCodigoExportador: string;
  @ApiProperty()
  diCodigoFabricante: string;
  @ApiProperty()
  diData: string;
  @ApiProperty()
  diDataDesembaraco: string;
  @ApiProperty()
  diLocalDesembaraco: string;
  @ApiProperty()
  diNumero: string;
  @ApiProperty()
  diNumeroAdicao: string;
  @ApiProperty()
  diSequencialAdicao: string;
  @ApiProperty()
  diTipoIntermedio: string;
  @ApiProperty()
  diTipoTransporte: string;
  @ApiProperty()
  diUFDesembaraco: string;
  @ApiProperty()
  diValorDescontoAdicao: string;
  @ApiProperty()
  ecommerceAdicionais: string;
  @ApiProperty()
  email: string;
  @ApiProperty()
  endereco: string;
  @ApiProperty()
  enderecoAlternativo: object;
  @ApiProperty()
  enderecoNro: string;
  @ApiProperty()
  enderecoTransportador: string;
  @ApiProperty()
  especie: string;
  @ApiProperty()
  expedicao: string;
  @ApiProperty()
  faturada: string;
  @ApiProperty()
  finalidade: string;
  @ApiProperty()
  fone: string;
  @ApiProperty()
  frete: string;
  @ApiProperty()
  fretePorConta: string;
  @ApiProperty()
  hashAlterarLotes: string;
  @ApiProperty()
  horaEmissao: string;
  @ApiProperty()
  horaSaidaEntrada: string;
  @ApiProperty()
  id: string;
  @ApiProperty()
  idCanalVendaEstatico: string;
  @ApiProperty()
  idContato: string;
  @ApiProperty()
  idDeposito: string;
  @ApiProperty()
  idDest: string;
  @ApiProperty()
  idEntrega: string;
  @ApiProperty()
  idFormaEnvio: string;
  @ApiProperty()
  idFormaFrete: string;
  @ApiProperty()
  idIntermediador: string;
  @ApiProperty()
  idLinhaProduto: string;
  @ApiProperty()
  idListaPreco: string;
  @ApiProperty()
  idListaVendas: string;
  @ApiProperty()
  idMagento: string;
  @ApiProperty()
  idMunicipio: string;
  @ApiProperty()
  idNotaFiscalReferenciada: string;
  @ApiProperty()
  idNotaTmp: string;
  @ApiProperty()
  idOrigem: string;
  @ApiProperty()
  idPais: string;
  @ApiProperty()
  idPedidoEcommerce: string;
  @ApiProperty()
  idPlataformaEcommerce: string;
  @ApiProperty()
  idTipoNota: string;
  @ApiProperty()
  idTransacao: string;
  @ApiProperty()
  idTransportador: string;
  @ApiProperty()
  ie: string;
  @ApiProperty()
  ieTransportador: string;
  @ApiProperty()
  indIEDest: string;
  @ApiProperty()
  indNatFrt: string;
  @ApiProperty()
  inscricaoSuframa: string;
  @ApiProperty()
  itemNumber: string;
  @ApiProperty()
  localEmbarque: string;
  @ApiProperty()
  marca: string;
  @ApiProperty()
  modelo: string;
  @ApiProperty()
  modeloEcf: string;
  @ApiProperty()
  municipio: string;
  @ApiProperty()
  municipioTransportador: string;
  @ApiProperty()
  natureza: string;
  @ApiProperty()
  nomePais: string;
  @ApiProperty()
  notaComplementar: string;
  @ApiProperty()
  notaTipo: string;
  @ApiProperty()
  nroDosVolumes: string;
  @ApiProperty()
  nroItens: string;
  @ApiProperty()
  nroPedidoCanalVenda: string;
  @ApiProperty()
  nroPedidoEcommerce: string;
  @ApiProperty()
  nroUsuario: string;
  @ApiProperty()
  numero: string;
  @ApiProperty()
  numeroPedidoEcommerce: string;
  @ApiProperty()
  objOrigem: string;
  @ApiProperty()
  observacoes: string;
  @ApiProperty()
  obsSistema: string;
  @ApiProperty()
  outrasDespesas: string;
  @ApiProperty()
  pag_bandeira: string;
  @ApiProperty()
  pag_categoria: string;
  @ApiProperty()
  pag_condicao: string;
  @ApiProperty()
  pag_conta: string;
  @ApiProperty()
  pag_formaPagamento: string;
  @ApiProperty()
  pag_idMeioPagamento: string;
  @ApiProperty()
  pag_meioBoleto: string;
  @ApiProperty()
  parcelaNumber: string;
  @ApiProperty()
  percentualICMSPartilhaDestino: string;
  @ApiProperty()
  percentualISS: string;
  @ApiProperty()
  peso_calculado: string;
  @ApiProperty()
  pesoBruto: string;
  @ApiProperty()
  pesoLiquido: string;
  @ApiProperty()
  placa: string;
  @ApiProperty()
  precoLista: string;
  @ApiProperty()
  precototal: string;
  @ApiProperty()
  precounitario: string;
  @ApiProperty()
  prodRuralNFRef: string;
  @ApiProperty()
  prodRuralNFRefAnoMes: string;
  @ApiProperty()
  prodRuralNFRefSerie: string;
  @ApiProperty()
  produto: string;
  @ApiProperty()
  produtoId: string;
  @ApiProperty()
  pvFrete: string;
  @ApiProperty()
  qtdVolumes: string;
  @ApiProperty()
  quantidade: string;
  @ApiProperty()
  refCTe: string;
  @ApiProperty()
  refNFe: string;
  @ApiProperty()
  seguro: string;
  @ApiProperty()
  selectStIcmsCTe: string;
  @ApiProperty()
  serie: string;
  @ApiProperty()
  servicoNumber: string;
  @ApiProperty()
  simples: string;
  @ApiProperty()
  sistemaEcommerce: string;
  @ApiProperty()
  situacao: string;
  @ApiProperty()
  tipo: string;
  @ApiProperty()
  tipoAmbiente: string;
  @ApiProperty()
  tipoDesconto: string;
  @ApiProperty()
  tipoPessoa: string;
  @ApiProperty()
  tipoProduto: string;
  @ApiProperty()
  totalFaturado: string;
  @ApiProperty()
  totalICMSSubst: string;
  @ApiProperty()
  transacao: object;
  @ApiProperty()
  transportador: string;
  @ApiProperty()
  uf: string;
  @ApiProperty()
  ufEmbarque: string;
  @ApiProperty()
  ufTransportador: string;
  @ApiProperty()
  ufVeiculo: string;
  @ApiProperty()
  un: string;
  @ApiProperty()
  urlRastreamento: string;
  @ApiProperty()
  valorAFRMM: string;
  @ApiProperty()
  valorAproximadoImpostosTotal: string;
  @ApiProperty()
  valorBaseDiferimento: string;
  @ApiProperty()
  valorDesconto: string;
  @ApiProperty()
  valorDesonerado: string;
  @ApiProperty()
  valorDespesaAduaneira: string;
  @ApiProperty()
  valorFreteEcommerce: string;
  @ApiProperty()
  valorFunrural: string;
  @ApiProperty()
  valorICMS: string;
  @ApiProperty()
  valorICMSSubst: string;
  @ApiProperty()
  valorIPI: string;
  @ApiProperty()
  valorIPIDevolvido: string;
  @ApiProperty()
  valorIpiFixo: string;
  @ApiProperty()
  valorISSQN: string;
  @ApiProperty()
  valorMinimoParaRetencao: string;
  @ApiProperty()
  valorNota: string;
  @ApiProperty()
  valorPresumido: string;
  @ApiProperty()
  valorProdutos: string;
  @ApiProperty()
  valorRetBaseIR: string;
  @ApiProperty()
  valorRetCOFINS: string;
  @ApiProperty()
  valorRetCSLL: string;
  @ApiProperty()
  valorRetIR: string;
  @ApiProperty()
  valorRetPIS: string;
  @ApiProperty()
  valorServicos: string;
  @ApiProperty()
  valorSimples: string;
  @ApiProperty()
  valorTotalFCP: string;
  @ApiProperty()
  valorTotalFCPST: string;
  @ApiProperty()
  valorTotalFCPSTRet: string;
  @ApiProperty()
  valorTotalICMSFCPDestino: string;
  @ApiProperty()
  percentualICMSFCPDestino: string;
  @ApiProperty()
  valorTotalICMSPartilhaDestino: string;
  @ApiProperty()
  valorTotalICMSPartilhaOrigem: string;
  @ApiProperty()
  valorTotalBCIBSCBS: string;
  @ApiProperty()
  valorTotalIS: string;
  @ApiProperty()
  valorDiferimentoIBSUF: string;
  @ApiProperty()
  valorDevolucaoIBSUF: string;
  @ApiProperty()
  valorTotalIBSUF: string;
  @ApiProperty()
  valorDiferimentoIBSMun: string;
  @ApiProperty()
  valorDevolucaoIBSMun: string;
  @ApiProperty()
  valorTotalIBSMun: string;
  @ApiProperty()
  valorTotalIBS: string;
  @ApiProperty()
  valorCredPresIBS: string;
  @ApiProperty()
  valorCredPresSusIBS: string;
  @ApiProperty()
  valorDiferimentoCBS: string;
  @ApiProperty()
  valorDevolucaoCBS: string;
  @ApiProperty()
  valorTotalCBS: string;
  @ApiProperty()
  valorCredPresCBS: string;
  @ApiProperty()
  valorCredPresSusCBS: string;
  @ApiProperty()
  valorIBSMono: string;
  @ApiProperty()
  valorCBSMono: string;
  @ApiProperty()
  valorIBSMonoReten: string;
  @ApiProperty()
  valorCBSMonoReten: string;
  @ApiProperty()
  valorIBSMonoRet: string;
  @ApiProperty()
  valorCBSMonoRet: string;
  @ApiProperty()
  valorUnitarioComII: string;
  @ApiProperty()
  zonaFrancaManaus: string;
}
