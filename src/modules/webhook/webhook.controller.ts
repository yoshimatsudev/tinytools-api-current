import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @HttpCode(200)
  @Post('goldtech')
  async receiveGoldtechWebhook(
    @Body() body: object,
    @Query('store') store: string,
  ) {
    const response = await this.webhookService.receiveCustomWebhook(
      body,
      'goldtech',
      store,
    );

    return 'webhook received';
  }

  @HttpCode(200)
  @Post('megatech')
  async receiveMegatechWebhook(
    @Body() body: object,
    @Query('store') store: string,
  ) {
    const response = await this.webhookService.receiveCustomWebhook(
      body,
      'megatech',
      store,
    );

    return 'webhook received';
  }

  @HttpCode(200)
  @Get('startRoutine')
  async start_routine(
    @Query('id') id: string,
    @Query('store') store: string,
    @Query('dryRun') dryRun?: string,
    @Query('analyzeOnly') analyzeOnly?: string,
    @Query('forceItemRewrite') forceItemRewrite?: string,
  ) {
    const response = await this.webhookService.testWebhook(
      id,
      store,
      dryRun === 'true',
      analyzeOnly === 'true',
      forceItemRewrite === 'true',
    );

    return response;
  }
}
