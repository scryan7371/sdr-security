import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, PoolConfig } from "pg";
import * as schema from "../drizzle/runtime-schema";

export const SECURITY_DRIZZLE_DB = Symbol("SECURITY_DRIZZLE_DB");

const SECURITY_DRIZZLE_OPTIONS = Symbol("SECURITY_DRIZZLE_OPTIONS");

export type SecurityDatabase = NodePgDatabase<typeof schema>;

export type SecurityDrizzleModuleOptions = Pick<
  PoolConfig,
  "host" | "port" | "user" | "password" | "database" | "ssl"
>;

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for the Drizzle database`);
  return value;
}

@Injectable()
class SecurityDrizzlePool implements OnApplicationShutdown {
  readonly pool: Pool;

  constructor(
    @Inject(SECURITY_DRIZZLE_OPTIONS)
    options: SecurityDrizzleModuleOptions,
  ) {
    this.pool = new Pool({
      host: options.host ?? required(process.env.DB_HOST, "DB_HOST"),
      port: options.port ?? Number(process.env.DB_PORT || "5432"),
      user: options.user ?? required(process.env.DB_USER, "DB_USER"),
      password:
        options.password ?? required(process.env.DB_PASSWORD, "DB_PASSWORD"),
      database: options.database ?? required(process.env.DB_NAME, "DB_NAME"),
      ssl: options.ssl,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({})
export class SecurityDrizzleModule {
  static forRoot(options: SecurityDrizzleModuleOptions = {}): DynamicModule {
    return {
      module: SecurityDrizzleModule,
      providers: [
        {
          provide: SECURITY_DRIZZLE_OPTIONS,
          useValue: options,
        },
        SecurityDrizzlePool,
        {
          provide: SECURITY_DRIZZLE_DB,
          useFactory: (pool: SecurityDrizzlePool): SecurityDatabase =>
            drizzle({
              client: pool.pool,
              schema,
              casing: "snake_case",
            }),
          inject: [SecurityDrizzlePool],
        },
      ],
      exports: [SECURITY_DRIZZLE_DB],
    };
  }
}
