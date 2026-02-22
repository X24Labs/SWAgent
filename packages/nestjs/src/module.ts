import 'reflect-metadata';
import {
  Module,
  Controller,
  Injectable,
  Get,
  Header,
  Inject,
  type DynamicModule,
} from '@nestjs/common';
import {
  generate,
  type SwagentOptions,
  type SwagentOutput,
  type OpenAPISpec,
} from '@swagent/core';

export const SWAGENT_OPTIONS = 'SWAGENT_OPTIONS';

export interface SwagentNestOptions extends SwagentOptions {
  spec: OpenAPISpec;
}

export interface SwagentSetupOptions extends SwagentOptions {
  path?: string;
}

@Injectable()
export class SwagentService {
  private cached: SwagentOutput | null = null;

  constructor(
    @Inject(SWAGENT_OPTIONS) private readonly options: SwagentNestOptions,
  ) {}

  getContent(): SwagentOutput {
    if (!this.cached) {
      this.cached = generate(this.options.spec, this.options);
    }
    return this.cached;
  }

  getSpec(): OpenAPISpec {
    return this.options.spec;
  }
}

@Controller()
class SwagentController {
  constructor(
    @Inject(SwagentService) private readonly swagent: SwagentService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  landing(): string {
    return this.swagent.getContent().htmlLanding;
  }

  @Get('llms.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  llmsTxt(): string {
    return this.swagent.getContent().llmsTxt;
  }

  @Get('to-humans.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  humanDocs(): string {
    return this.swagent.getContent().humanDocs;
  }

  @Get('openapi.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  openapi(): OpenAPISpec {
    return this.swagent.getSpec();
  }
}

@Module({})
export class SwagentModule {
  /**
   * Register SwagentModule with static options.
   *
   * @example
   * // app.module.ts
   * @Module({
   *   imports: [SwagentModule.register({ spec: openApiDocument })],
   * })
   * export class AppModule {}
   */
  static register(options: SwagentNestOptions): DynamicModule {
    return {
      module: SwagentModule,
      controllers: [SwagentController],
      providers: [
        { provide: SWAGENT_OPTIONS, useValue: options },
        SwagentService,
      ],
    };
  }

  /**
   * Register SwagentModule with async factory.
   *
   * @example
   * SwagentModule.registerAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({
   *     spec: config.get('openApiSpec'),
   *     baseUrl: config.get('API_URL'),
   *   }),
   * })
   */
  static registerAsync(options: {
    imports?: any[];
    useFactory: (
      ...args: any[]
    ) => SwagentNestOptions | Promise<SwagentNestOptions>;
    inject?: any[];
  }): DynamicModule {
    return {
      module: SwagentModule,
      imports: options.imports || [],
      controllers: [SwagentController],
      providers: [
        {
          provide: SWAGENT_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        SwagentService,
      ],
    };
  }

  /**
   * Static setup method (mirrors SwaggerModule.setup pattern).
   * Registers routes directly on the HTTP adapter.
   *
   * @example
   * // main.ts
   * const document = SwaggerModule.createDocument(app, config);
   * SwagentModule.setup(app, document, { path: '/docs' });
   */
  static setup(
    app: { getHttpAdapter(): any },
    spec: OpenAPISpec,
    options: SwagentSetupOptions = {},
  ): void {
    const output = generate(spec, options);
    const routes = options.routes || {};
    const prefix = (options.path || '').replace(/\/$/, '');
    const httpAdapter = app.getHttpAdapter();

    const serve = (path: string, contentType: string, body: string) => {
      httpAdapter.get(path, (_req: any, res: any) => {
        res.type(contentType).send(body);
      });
    };

    if (routes.landing !== false) {
      const p =
        typeof routes.landing === 'string'
          ? routes.landing
          : prefix || '/';
      serve(p, 'text/html; charset=utf-8', output.htmlLanding);
    }

    if (routes.llmsTxt !== false) {
      const p =
        typeof routes.llmsTxt === 'string'
          ? routes.llmsTxt
          : `${prefix}/llms.txt`;
      serve(p, 'text/plain; charset=utf-8', output.llmsTxt);
    }

    if (routes.humanDocs !== false) {
      const p =
        typeof routes.humanDocs === 'string'
          ? routes.humanDocs
          : `${prefix}/to-humans.md`;
      serve(p, 'text/markdown; charset=utf-8', output.humanDocs);
    }

    if (routes.openapi !== false) {
      const p =
        typeof routes.openapi === 'string'
          ? routes.openapi
          : `${prefix}/openapi.json`;
      serve(p, 'application/json; charset=utf-8', JSON.stringify(spec));
    }
  }
}
