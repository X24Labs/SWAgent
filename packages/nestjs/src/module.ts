import 'reflect-metadata';
import {
  Module,
  Controller,
  Injectable,
  Get,
  Header,
  Headers,
  Inject,
  Res,
  type DynamicModule,
} from '@nestjs/common';
import {
  generate,
  fallbackOutput,
  computeEtag,
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
  private cached: (SwagentOutput & { etags: { llmsTxt: string; humanDocs: string; htmlLanding: string; openapi: string } }) | null = null;

  constructor(
    @Inject(SWAGENT_OPTIONS) private readonly options: SwagentNestOptions,
  ) {}

  getContent(): SwagentOutput & { etags: { llmsTxt: string; humanDocs: string; htmlLanding: string; openapi: string } } {
    if (!this.cached) {
      try {
        const output = generate(this.options.spec, this.options);
        this.cached = {
          ...output,
          etags: {
            llmsTxt: computeEtag(output.llmsTxt),
            humanDocs: computeEtag(output.humanDocs),
            htmlLanding: computeEtag(output.htmlLanding),
            openapi: computeEtag(JSON.stringify(this.options.spec)),
          },
        };
      } catch (err) {
        console.error('swagent: failed to generate docs', err);
        const fb = fallbackOutput();
        let openapiEtag: string;
        try { openapiEtag = computeEtag(JSON.stringify(this.options.spec)); } catch { openapiEtag = computeEtag('{}'); }
        this.cached = {
          ...fb,
          etags: {
            llmsTxt: computeEtag(fb.llmsTxt),
            humanDocs: computeEtag(fb.humanDocs),
            htmlLanding: computeEtag(fb.htmlLanding),
            openapi: openapiEtag,
          },
        };
      }
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
  @Header('Cache-Control', 'public, max-age=3600')
  landing(@Headers('if-none-match') inm: string, @Res() res: any): void {
    const c = this.swagent.getContent();
    res.set('ETag', c.etags.htmlLanding);
    if (inm === c.etags.htmlLanding) {
      res.status(304).end();
      return;
    }
    res.send(c.htmlLanding);
  }

  @Get('llms.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  llmsTxt(@Headers('if-none-match') inm: string, @Res() res: any): void {
    const c = this.swagent.getContent();
    res.set('ETag', c.etags.llmsTxt);
    if (inm === c.etags.llmsTxt) {
      res.status(304).end();
      return;
    }
    res.send(c.llmsTxt);
  }

  @Get('to-humans.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  humanDocs(@Headers('if-none-match') inm: string, @Res() res: any): void {
    const c = this.swagent.getContent();
    res.set('ETag', c.etags.humanDocs);
    if (inm === c.etags.humanDocs) {
      res.status(304).end();
      return;
    }
    res.send(c.humanDocs);
  }

  @Get('openapi.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  openapi(@Headers('if-none-match') inm: string, @Res() res: any): void {
    const c = this.swagent.getContent();
    res.set('ETag', c.etags.openapi);
    if (inm === c.etags.openapi) {
      res.status(304).end();
      return;
    }
    res.json(this.swagent.getSpec());
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
    let output;
    try {
      output = generate(spec, options);
    } catch (err) {
      console.error('swagent: failed to generate docs', err);
      output = fallbackOutput();
    }
    const routes = options.routes || {};
    const prefix = (options.path || '').replace(/\/$/, '');
    const httpAdapter = app.getHttpAdapter();

    const etags = {
      llmsTxt: computeEtag(output.llmsTxt),
      humanDocs: computeEtag(output.humanDocs),
      htmlLanding: computeEtag(output.htmlLanding),
      openapi: computeEtag(JSON.stringify(spec)),
    };

    const serve = (path: string, contentType: string, body: string, etag: string) => {
      httpAdapter.get(path, (req: any, res: any) => {
        res.set('ETag', etag);
        res.set('Cache-Control', 'public, max-age=3600');
        if (req.get('If-None-Match') === etag) {
          res.status(304).end();
          return;
        }
        res.type(contentType).send(body);
      });
    };

    if (routes.landing !== false) {
      const p =
        typeof routes.landing === 'string'
          ? routes.landing
          : prefix || '/';
      serve(p, 'text/html; charset=utf-8', output.htmlLanding, etags.htmlLanding);
    }

    if (routes.llmsTxt !== false) {
      const p =
        typeof routes.llmsTxt === 'string'
          ? routes.llmsTxt
          : `${prefix}/llms.txt`;
      serve(p, 'text/plain; charset=utf-8', output.llmsTxt, etags.llmsTxt);
    }

    if (routes.humanDocs !== false) {
      const p =
        typeof routes.humanDocs === 'string'
          ? routes.humanDocs
          : `${prefix}/to-humans.md`;
      serve(p, 'text/markdown; charset=utf-8', output.humanDocs, etags.humanDocs);
    }

    if (routes.openapi !== false) {
      const p =
        typeof routes.openapi === 'string'
          ? routes.openapi
          : `${prefix}/openapi.json`;
      serve(p, 'application/json; charset=utf-8', JSON.stringify(spec), etags.openapi);
    }
  }
}
