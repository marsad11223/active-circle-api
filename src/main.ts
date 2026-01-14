import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    rawBody: true, // Enable raw body for webhooks
  });

  // ✅ Global validation with transformation enabled
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Enable transformation for DTOs
      whitelist: true, // Strip properties that don't have decorators
    }),
  );

  // ✅ CRITICAL: Exclude webhook route from JSON parsing
  // Webhooks need raw body for signature verification
  app.use((req, res, next) => {
    if (req.originalUrl === '/subscription/webhook') {
      next(); // Skip body parsing for webhooks
    } else {
      bodyParser.json({ limit: '10mb' })(req, res, next);
    }
  });

  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  const PORT = Number(process.env.PORT) || 3000;
  console.log('port=', PORT);
  await app.listen(PORT);
}

bootstrap();
