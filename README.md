<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>


[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest
  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">


<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

### Remoção de desconto das notas

Antes de salvar, `ApplicationFacade.addInvoice` reproduz a confirmação de
**Rateio de valores** do Tiny:

1. `updateCampoNotaTmpXajax(idNotaTmp, 'desconto', '0,00', 'S')`.
2. `calcularImpostos(-1, 'N', idNotaTmp, null, null, true)`, forçando o rateio
   de descontos/acréscimos solicitado pelo callback do Tiny.
3. Atualização dos totais retornados e salvamento da nota.

Sem o rateio forçado, o Tiny pode salvar o cabeçalho com desconto zero e manter
os descontos dos itens e a base tributária anterior.
O aviso **Atualização de valores** é informativo: nesta integração HTTP não há
um clique em **Fechar** nem uma segunda requisição para dispensá-lo.

Falhas na atualização ou no cálculo obrigatório interrompem o salvamento,
inclusive respostas sem o total de produtos calculado: não são salvos totais
antigos nem um total zero de fallback. O endpoint de cálculo avulso mantém seu
comportamento anterior; o rateio forçado é usado no fluxo de salvamento.

Protocolo verificado no campo de desconto da tela autenticada, no callback
retornado pelo servidor e nos scripts
[form.notas.fiscais.js](https://erp.olist.com/templates/form.notas.fiscais.js) e
[form.nota.fiscal.itens.js](https://erp.olist.com/templates/form.nota.fiscal.itens.js).

Validação real autorizada: Tiny Scrap em execução única → API localhost →
salvar sem emitir → nova consulta ao Tiny. Na nota testada, os descontos de
R$ 35,63 e R$ 35,62 dos itens foram removidos; total e base ICMS passaram a
R$ 100,00, e ICMS a R$ 4,00. Preços unitários não foram alterados.

Segundo teste autorizado em nota pendente Megatech/TikTok, com SKU ativo no banco:
preço unitário R$ 13,98 → R$ 2,00, conforme `tiktokPrice`; desconto da nota e
do item R$ 1,50 → R$ 0,00; total R$ 12,48 → R$ 2,00. Nova consulta confirmou
os valores persistidos e situação pendente (`1`), sem emissão. A chamada real
de `sendInvoices` ao webhook local retornou HTTP 200; regras de preço inalteradas.

`dryRun` do webhook **salva alterações na nota**, apenas não emite.

Regressão: `npm test -- --runInBand` cobre rateio, recálculo, bloqueio do
salvamento em falhas e preservação do cálculo avulso. Build: `npm run build`.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
