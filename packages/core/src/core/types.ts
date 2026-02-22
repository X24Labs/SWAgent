export interface SwagentRoutes {
  /** Path for llms.txt endpoint. Set to false to disable. Default: '/llms.txt' */
  llmsTxt?: string | false;
  /** Path for human-readable markdown. Set to false to disable. Default: '/to-humans.md' */
  humanDocs?: string | false;
  /** Path for HTML landing page. Set to false to disable. Default: '/' */
  landing?: string | false;
  /** Path for OpenAPI JSON. Set to false to disable. Default: '/openapi.json' */
  openapi?: string | false;
}

export interface SwagentLandingConfig {}

export interface SwagentOptions {
  /** Base URL of the API (e.g. 'https://api.example.com') */
  baseUrl?: string;
  /** Override the API title from the spec */
  title?: string;
  /** Color theme for HTML landing page. Default: 'dark' */
  theme?: 'dark' | 'light' | 'auto';
  /** Route paths configuration */
  routes?: SwagentRoutes;
  /** Landing page configuration */
  landing?: SwagentLandingConfig;
}

export interface SwagentOutput {
  /** Token-optimized markdown for LLM agents */
  llmsTxt: string;
  /** Human-readable markdown documentation */
  humanDocs: string;
  /** Semantic HTML landing page */
  htmlLanding: string;
}

export interface EndpointInfo {
  method: string;
  path: string;
  summary: string;
  description: string;
  security: SecurityRequirement[] | undefined;
  parameters: ParameterObject[];
  body: SchemaObject | null;
  responses: Record<string, ResponseObject>;
}

export interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  example?: unknown;
  description?: string;
  [key: string]: unknown;
}

export interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: SchemaObject }>;
  [key: string]: unknown;
}

export interface SecurityRequirement {
  [name: string]: string[];
}

export interface TagDefinition {
  name: string;
  description?: string;
}

export interface SecuritySchemes {
  bearerAuth?: { type: string; scheme?: string };
  apiKeyAuth?: { type: string; name?: string; in?: string };
  [key: string]: unknown;
}

export interface OpenAPISpec {
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  servers?: Array<{ url: string }>;
  paths?: Record<string, Record<string, OperationObject>>;
  tags?: TagDefinition[];
  components?: {
    securitySchemes?: SecuritySchemes;
    [key: string]: unknown;
  };
}

export interface OperationObject {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: SecurityRequirement[];
  parameters?: ParameterObject[];
  requestBody?: {
    content?: Record<string, { schema?: SchemaObject }>;
  };
  responses?: Record<string, ResponseObject>;
}
