import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    rawBody: true, // Enable raw body for webhooks
  });

  // ✅ Global validation
  app.useGlobalPipes(new ValidationPipe());

  // ✅ Then normal JSON parsing
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  const PORT = Number(process.env.PORT) || 3000;
  console.log('port=', PORT);
  await app.listen(PORT);
}

bootstrap();
