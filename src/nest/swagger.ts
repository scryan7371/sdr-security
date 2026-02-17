import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export const setupSecuritySwagger = (
  app: INestApplication,
  path = "docs/security",
) => {
  const config = new DocumentBuilder()
    .setTitle("Security API")
    .setDescription("Shared auth and security workflow endpoints")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, document);
  return document;
};
