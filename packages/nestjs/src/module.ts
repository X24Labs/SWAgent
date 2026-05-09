import 'reflect-metadata';
import {
  Module,
  Controller,
  Injectable,
  Get,
  Post,
  Headers,
  Inject,
  Req,
  Res,
  type DynamicModule,
} from '@nestjs/common';
import {
  generate,
  fallbackOutput,
  computeEtag,
  estimateTokens,
  resolveAuth,
  isAuthorized,
  safeEqual,
  parseCookies,
  parseFormBody,
  buildSessionCookie,
  renderLoginForm,
  renderUnauthorized,
  resolveBaseUrl,
  substituteBaseUrl,
  type AuthRequest,
  type ResolvedAuth,
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

function reqToAuth(req: any): AuthRequest {
  return {
    query: req.query as Record<string, string | string[] | undefined>,
    headers: req.headers as Record<string, string | string[] | undefined>,
    cookies: parseCookies(req.headers?.cookie),
  };
}

function reqToBaseUrl(req: any): string {
  const h = req.headers ?? {};
  return resolveBaseUrl({
    host: h.host,
    forwardedHost: h['x-forwarded-host'],
    forwardedProto: h['x-forwarded-proto'],
    protocol: req.protocol,
    encrypted: req.secure === true,
  });
}

@Injectable()
export class SwagentService {
  private cached:
    | (SwagentOutput & { etags: { llmsTxt: string; humanDocs: string; htmlLanding: string; openapi: string } })
    | null = null;
  readonly auth: ResolvedAuth;

  constructor(@Inject(SWAGENT_OPTIONS) private readonly options: SwagentNestOptions) {
    this.auth = resolveAuth(options.auth);
  }

  loginTitle(): string {
    return this.options.title ?? this.options.spec.info?.title ?? 'API Documentation';
  }

  getOptions(): SwagentNestOptions {
    return this.options;
  }

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
        try {
          openapiEtag = computeEtag(JSON.stringify(this.options.spec));
        } catch {
          openapiEtag = computeEtag('{}');
        }
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
  constructor(@Inject(SwagentService) private readonly swagent: SwagentService) {}

  private denyData(res: any): void {
    const auth = this.swagent.auth;
    res.status(401)
      .set('Content-Type', 'text/plain; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .send(renderUnauthorized(auth));
  }

  @Get()
  landing(
    @Headers('accept') accept: string,
    @Headers('if-none-match') inm: string,
    @Req() req: any,
    @Res() res: any,
  ): void {
    const auth = this.swagent.auth;
    const c = this.swagent.getContent();
    const wantsMarkdown = typeof accept === 'string' && accept.includes('text/markdown');

    if (auth.enabled && !isAuthorized(reqToAuth(req), auth)) {
      if (wantsMarkdown) return this.denyData(res);
      const opts = this.swagent.getOptions();
      res.status(401)
        .set('Cache-Control', 'no-store')
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(renderLoginForm({
          title: this.swagent.loginTitle(),
          theme: opts.theme,
          formField: auth.formField,
          action: '',
        }));
      return;
    }

    const detected = reqToBaseUrl(req);

    if (wantsMarkdown) {
      const body = substituteBaseUrl(c.llmsTxt, detected);
      const tokens = estimateTokens(body);
      res.set('Content-Type', 'text/markdown; charset=utf-8');
      res.set('x-markdown-tokens', String(tokens));
      res.set('Vary', 'accept');
      res.set('ETag', c.etags.llmsTxt);
      res.set('Cache-Control', 'public, max-age=3600');
      if (inm === c.etags.llmsTxt) {
        res.status(304).end();
        return;
      }
      res.send(body);
    } else {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Vary', 'accept');
      res.set('ETag', c.etags.htmlLanding);
      res.set('Cache-Control', 'public, max-age=3600');
      if (inm === c.etags.htmlLanding) {
        res.status(304).end();
        return;
      }
      res.send(substituteBaseUrl(c.htmlLanding, detected));
    }
  }

  @Post()
  landingLogin(@Req() req: any, @Res() res: any): void {
    const auth = this.swagent.auth;
    if (!auth.enabled) {
      res.status(404).end();
      return;
    }
    const submitted = String((req.body ?? {})[auth.formField] ?? '');
    if (!submitted || !safeEqual(submitted, auth.token)) {
      const opts = this.swagent.getOptions();
      res.status(401)
        .set('Cache-Control', 'no-store')
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(renderLoginForm({
          error: true,
          title: this.swagent.loginTitle(),
          theme: opts.theme,
          formField: auth.formField,
          action: '',
        }));
      return;
    }
    res.status(303)
      .set('Set-Cookie', buildSessionCookie(auth))
      .set('Location', req.originalUrl || '/')
      .set('Cache-Control', 'no-store')
      .end();
  }

  @Get('llms.txt')
  llmsTxt(@Headers('if-none-match') inm: string, @Req() req: any, @Res() res: any): void {
    const auth = this.swagent.auth;
    if (auth.enabled && !isAuthorized(reqToAuth(req), auth)) return this.denyData(res);
    const c = this.swagent.getContent();
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('ETag', c.etags.llmsTxt);
    if (inm === c.etags.llmsTxt) {
      res.status(304).end();
      return;
    }
    res.send(substituteBaseUrl(c.llmsTxt, reqToBaseUrl(req)));
  }

  @Get('to-humans.md')
  humanDocs(@Headers('if-none-match') inm: string, @Req() req: any, @Res() res: any): void {
    const auth = this.swagent.auth;
    if (auth.enabled && !isAuthorized(reqToAuth(req), auth)) return this.denyData(res);
    const c = this.swagent.getContent();
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('ETag', c.etags.humanDocs);
    if (inm === c.etags.humanDocs) {
      res.status(304).end();
      return;
    }
    res.send(substituteBaseUrl(c.humanDocs, reqToBaseUrl(req)));
  }

  @Get('openapi.json')
  openapi(@Headers('if-none-match') inm: string, @Req() req: any, @Res() res: any): void {
    const auth = this.swagent.auth;
    if (auth.enabled && !isAuthorized(reqToAuth(req), auth)) return this.denyData(res);
    const c = this.swagent.getContent();
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
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
    const auth = resolveAuth(options.auth);
    const prefix = (options.path || '').replace(/\/$/, '');
    const httpAdapter = app.getHttpAdapter();
    const loginTitle = options.title ?? spec.info?.title ?? 'API Documentation';

    let openapiEtag: string;
    try { openapiEtag = computeEtag(JSON.stringify(spec)); } catch { openapiEtag = computeEtag('{}'); }
    const etags = {
      llmsTxt: computeEtag(output.llmsTxt),
      humanDocs: computeEtag(output.humanDocs),
      htmlLanding: computeEtag(output.htmlLanding),
      openapi: openapiEtag,
    };

    function gateData(req: any, res: any): boolean {
      if (!auth.enabled) return true;
      if (isAuthorized(reqToAuth(req), auth)) return true;
      res.status(401)
        .set('Content-Type', 'text/plain; charset=utf-8')
        .set('Cache-Control', 'no-store')
        .send(renderUnauthorized(auth));
      return false;
    }

    const serve = (path: string, contentType: string, body: string, etag: string, sub: boolean) => {
      httpAdapter.get(path, (req: any, res: any) => {
        if (!gateData(req, res)) return;
        res.set('ETag', etag);
        res.set('Cache-Control', 'public, max-age=3600');
        if (req.get('If-None-Match') === etag) {
          res.status(304).end();
          return;
        }
        const out = sub ? substituteBaseUrl(body, reqToBaseUrl(req)) : body;
        res.type(contentType).send(out);
      });
    };

    if (routes.landing !== false) {
      const p =
        typeof routes.landing === 'string'
          ? routes.landing
          : prefix || '/';
      httpAdapter.get(p, (req: any, res: any) => {
        const acceptHeader = req.get('Accept');
        const wantsMarkdown = typeof acceptHeader === 'string' && acceptHeader.includes('text/markdown');

        if (auth.enabled && !isAuthorized(reqToAuth(req), auth)) {
          if (wantsMarkdown) {
            res.status(401)
              .set('Content-Type', 'text/plain; charset=utf-8')
              .set('Cache-Control', 'no-store')
              .send(renderUnauthorized(auth));
            return;
          }
          res.status(401)
            .set('Cache-Control', 'no-store')
            .set('Content-Type', 'text/html; charset=utf-8')
            .send(renderLoginForm({
              title: loginTitle,
              theme: options.theme,
              formField: auth.formField,
            }));
          return;
        }

        const detected = reqToBaseUrl(req);

        if (wantsMarkdown) {
          const body = substituteBaseUrl(output.llmsTxt, detected);
          const tokens = estimateTokens(body);
          res.set('Content-Type', 'text/markdown; charset=utf-8');
          res.set('x-markdown-tokens', String(tokens));
          res.set('Vary', 'accept');
          res.set('ETag', etags.llmsTxt);
          res.set('Cache-Control', 'public, max-age=3600');
          if (req.get('If-None-Match') === etags.llmsTxt) {
            res.status(304).end();
            return;
          }
          res.send(body);
        } else {
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.set('Vary', 'accept');
          res.set('ETag', etags.htmlLanding);
          res.set('Cache-Control', 'public, max-age=3600');
          if (req.get('If-None-Match') === etags.htmlLanding) {
            res.status(304).end();
            return;
          }
          res.send(substituteBaseUrl(output.htmlLanding, detected));
        }
      });

      if (auth.enabled && typeof httpAdapter.post === 'function') {
        httpAdapter.post(p, (req: any, res: any) => {
          let submitted = '';
          if (req.body && typeof req.body === 'object') {
            submitted = String((req.body as Record<string, unknown>)[auth.formField] ?? '');
          } else if (typeof req.body === 'string') {
            submitted = parseFormBody(req.body)[auth.formField] ?? '';
          }
          if (!submitted || !safeEqual(submitted, auth.token)) {
            res.status(401)
              .set('Cache-Control', 'no-store')
              .set('Content-Type', 'text/html; charset=utf-8')
              .send(renderLoginForm({
                error: true,
                title: loginTitle,
                theme: options.theme,
                formField: auth.formField,
              }));
            return;
          }
          res.status(303)
            .set('Set-Cookie', buildSessionCookie(auth))
            .set('Location', req.originalUrl || p)
            .set('Cache-Control', 'no-store')
            .end();
        });
      }
    }

    if (routes.llmsTxt !== false) {
      const p =
        typeof routes.llmsTxt === 'string'
          ? routes.llmsTxt
          : `${prefix}/llms.txt`;
      serve(p, 'text/plain; charset=utf-8', output.llmsTxt, etags.llmsTxt, true);
    }

    if (routes.humanDocs !== false) {
      const p =
        typeof routes.humanDocs === 'string'
          ? routes.humanDocs
          : `${prefix}/to-humans.md`;
      serve(p, 'text/markdown; charset=utf-8', output.humanDocs, etags.humanDocs, true);
    }

    if (routes.openapi !== false) {
      const p =
        typeof routes.openapi === 'string'
          ? routes.openapi
          : `${prefix}/openapi.json`;
      let specJson: string;
      try { specJson = JSON.stringify(spec); } catch { specJson = '{}'; }
      serve(p, 'application/json; charset=utf-8', specJson, etags.openapi, false);
    }
  }
}
