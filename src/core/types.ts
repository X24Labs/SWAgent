export interface SwagentOptions {
  baseUrl?: string;
  title?: string;
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
