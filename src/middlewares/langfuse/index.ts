import { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';
import { Langfuse } from 'langfuse';

let langfuseInstance: Langfuse | null = null;
let langfuseInitialized = false;

// Initialize Langfuse singleton
function getLangfuseInstance(c: Context): Langfuse | null {
  // Check if Langfuse is enabled via environment variables
  // Support both c.env (Cloudflare Workers) and process.env (Node.js)
  const publicKey = c.env?.LANGFUSE_PUBLIC_KEY || process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = c.env?.LANGFUSE_SECRET_KEY || process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = c.env?.LANGFUSE_BASE_URL || process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    if (!langfuseInitialized) {
      console.log('[Langfuse] ❌ Not configured - missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY');
      console.log('[Langfuse] ℹ️  Set environment variables to enable tracing:');
      console.log('[Langfuse]    - LANGFUSE_PUBLIC_KEY');
      console.log('[Langfuse]    - LANGFUSE_SECRET_KEY');
      console.log('[Langfuse]    - LANGFUSE_BASE_URL (optional, defaults to https://cloud.langfuse.com)');
      langfuseInitialized = true;
    }
    return null;
  }

  // Return existing instance if already initialized
  if (langfuseInstance) {
    return langfuseInstance;
  }

  // Create new instance
  try {
    langfuseInstance = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 1, // Flush immediately for better real-time tracking
      flushInterval: 1000, // Flush every second
    });

    console.log('[Langfuse] ✅ Successfully initialized');
    console.log(`[Langfuse] 🔗 Base URL: ${baseUrl}`);
    console.log(`[Langfuse] 🔑 Public Key: ${publicKey.substring(0, 10)}...`);
    console.log('[Langfuse] 📊 Tracing enabled for: /v1/chat/completions, /v1/completions, /v1/messages, /v1/embeddings');

    langfuseInitialized = true;
    return langfuseInstance;
  } catch (error) {
    console.error('[Langfuse] ❌ Failed to initialize:', error);
    langfuseInitialized = true;
    return null;
  }
}

// Extract token usage from response
function extractTokenUsage(response: any): {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
} {
  const usage = response?.usage;
  if (!usage) return {};

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

// Extract model from request
function extractModel(requestParams: any): string {
  return requestParams?.model || 'unknown';
}

// Extract provider from context
function extractProvider(c: Context): string {
  const requestOptions = c.get('requestOptions');
  if (requestOptions?.[0]?.providerOptions?.provider) {
    return requestOptions[0].providerOptions.provider;
  }
  return 'unknown';
}

// Extract messages from request
function extractMessages(requestParams: any): any[] {
  if (requestParams?.messages) {
    return requestParams.messages;
  }
  if (requestParams?.prompt) {
    return [{ role: 'user', content: requestParams.prompt }];
  }
  return [];
}

// Extract completion from response
function extractCompletion(response: any): string {
  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }
  if (response?.choices?.[0]?.text) {
    return response.choices[0].text;
  }
  return '';
}

/**
 * Langfuse middleware for request tracing
 * Automatically tracks all requests through the gateway
 */
export const langfuse = () => {
  return async (c: Context, next: any) => {
    const langfuseClient = getLangfuseInstance(c);

    // If Langfuse is not configured, skip tracing
    if (!langfuseClient) {
      return next();
    }

    // Skip non-API routes
    if (!c.req.url.includes('/v1/')) {
      return next();
    }

    const startTime = Date.now();
    const requestUrl = new URL(c.req.url);
    const endpoint = requestUrl.pathname;

    // Only trace LLM endpoints
    const trackedEndpoints = [
      '/v1/chat/completions',
      '/v1/completions',
      '/v1/messages',
      '/v1/embeddings',
    ];

    if (!trackedEndpoints.some((e) => endpoint.includes(e))) {
      return next();
    }

    // Get request body
    let requestParams: any = {};
    try {
      requestParams = await c.req.json();
      // Reset request for next middleware
      c.req.bodyCache.json = requestParams;
    } catch (error) {
      console.error('Failed to parse request body for Langfuse:', error);
      return next();
    }

    const isStreaming = requestParams?.stream === true;
    const model = extractModel(requestParams);
    const messages = extractMessages(requestParams);

    // Create trace
    const trace = langfuseClient.trace({
      name: endpoint,
      userId: c.req.header('x-portkey-user-id') || undefined,
      sessionId: c.req.header('x-portkey-session-id') || undefined,
      metadata: {
        endpoint,
        provider: 'pending', // Will be updated after provider is determined
        isStreaming,
        requestHeaders: Object.fromEntries(
          Object.entries(c.req.header()).filter(([key]) =>
            key.startsWith('x-portkey-')
          )
        ),
      },
    });

    // Create generation span
    const generation = trace.generation({
      name: `${model}-generation`,
      model,
      modelParameters: {
        temperature: requestParams.temperature,
        max_tokens: requestParams.max_tokens,
        top_p: requestParams.top_p,
      },
      input: messages,
      metadata: {
        requestId: c.req.header('x-request-id'),
      },
    });

    // Store trace info in context for potential use by other middleware
    c.set('langfuseTrace', trace);
    c.set('langfuseGeneration', generation);

    try {
      await next();

      const endTime = Date.now();
      const latency = endTime - startTime;
      const provider = extractProvider(c);

      // Update trace metadata with actual provider
      trace.update({
        metadata: {
          ...trace.metadata,
          provider,
        },
      });

      // Handle streaming responses
      if (isStreaming) {
        // For streaming, we'll collect chunks through response interceptor
        const originalResponse = c.res;
        let collectedContent = '';

        // Clone and read the stream
        try {
          const responseClone = originalResponse.clone();
          const reader = responseClone.body?.getReader();

          if (reader) {
            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') continue;

                  try {
                    const parsed = JSON.parse(data);
                    const content =
                      parsed?.choices?.[0]?.delta?.content ||
                      parsed?.choices?.[0]?.delta?.text ||
                      '';
                    collectedContent += content;
                  } catch (e) {
                    // Ignore parsing errors for incomplete chunks
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('Error reading stream for Langfuse:', error);
        }

        generation.end({
          output: collectedContent || '[Stream completed]',
          metadata: {
            latencyMs: latency,
            statusCode: c.res.status,
          },
        });
      } else {
        // Handle non-streaming responses
        try {
          const response = await c.res.clone().json();
          const completion = extractCompletion(response);
          const tokenUsage = extractTokenUsage(response);

          generation.end({
            output: completion,
            usage: {
              input: tokenUsage.promptTokens,
              output: tokenUsage.completionTokens,
              total: tokenUsage.totalTokens,
            },
            metadata: {
              latencyMs: latency,
              statusCode: c.res.status,
            },
          });
        } catch (error) {
          console.error('Failed to parse response for Langfuse:', error);
          generation.end({
            metadata: {
              latencyMs: latency,
              statusCode: c.res.status,
              error: 'Failed to parse response',
            },
          });
        }
      }

      trace.update({
        output: { success: true },
      });
    } catch (error: any) {
      console.error('[Langfuse] ❌ Error during trace:', error.message);

      // Handle errors
      generation.end({
        metadata: {
          error: error.message,
          statusCode: c.res?.status || 500,
        },
        level: 'ERROR',
      });

      trace.update({
        output: { success: false, error: error.message },
      });
    } finally {
      // Flush events to Langfuse
      const runtime = getRuntimeKey();
      if (runtime === 'workerd') {
        c.executionCtx.waitUntil(langfuseClient.flushAsync());
      } else if (['node', 'bun', 'deno'].includes(runtime)) {
        langfuseClient.flushAsync().catch((err) => console.error('[Langfuse] ❌ Flush failed:', err));
      }
    }
  };
};

/**
 * Shutdown Langfuse client gracefully
 * Call this when shutting down the server
 */
export async function shutdownLangfuse(): Promise<void> {
  if (langfuseInstance) {
    console.log('[Langfuse] 🛑 Shutting down Langfuse client...');
    await langfuseInstance.shutdownAsync();
    langfuseInstance = null;
    console.log('[Langfuse] ✅ Langfuse client shut down successfully');
  }
}
