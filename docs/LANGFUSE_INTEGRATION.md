# Langfuse Integration

Portkey Gateway now includes built-in Langfuse integration for automatic request tracing and observability.

## What is Langfuse?

Langfuse is an open-source LLM engineering platform that provides observability, analytics, and evaluations for your AI applications. It helps you:

- Track all LLM requests and responses
- Monitor token usage and costs
- Analyze performance and latency
- Debug issues with detailed traces
- Evaluate model outputs

## Features

The Langfuse integration automatically tracks:

- ✅ **Request/Response Data**: Complete request parameters and model responses
- ✅ **Token Usage**: Input, output, and total token consumption
- ✅ **Latency Metrics**: Request duration and performance data
- ✅ **Provider Information**: Which AI provider handled each request
- ✅ **Streaming Support**: Full content capture for streaming responses
- ✅ **Error Tracking**: Automatic error capture with context
- ✅ **User/Session Tracking**: Via custom headers
- ✅ **Multi-Environment**: Works on Node.js, Cloudflare Workers, and other runtimes

## Setup

### 1. Get Langfuse Credentials

Sign up at [https://cloud.langfuse.com](https://cloud.langfuse.com) or deploy your own instance.

Get your:
- Public Key (starts with `pk-lf-`)
- Secret Key (starts with `sk-lf-`)

### 2. Configure Environment Variables

#### For Node.js deployment:

Create a `.env` file in the project root:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

#### For Cloudflare Workers deployment:

Add to your `wrangler.toml`:

```toml
[env.production.vars]
LANGFUSE_PUBLIC_KEY = "pk-lf-your-public-key"
LANGFUSE_SECRET_KEY = "sk-lf-your-secret-key"
LANGFUSE_BASE_URL = "https://cloud.langfuse.com"
```

Or set as secrets:

```bash
wrangler secret put LANGFUSE_PUBLIC_KEY
wrangler secret put LANGFUSE_SECRET_KEY
```

#### For self-hosted Langfuse:

Set `LANGFUSE_BASE_URL` to your instance URL:

```bash
LANGFUSE_BASE_URL=https://your-langfuse-instance.com
```

### 3. Deploy

That's it! The gateway will automatically start tracing requests to Langfuse when credentials are configured.

## Usage

### Basic Usage

Once configured, all requests through the gateway are automatically traced. No code changes needed!

```bash
curl https://your-gateway.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### User and Session Tracking

Add custom headers to track users and sessions:

```bash
curl https://your-gateway.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "x-portkey-user-id: user_123" \
  -H "x-portkey-session-id: session_abc" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

These will automatically appear in your Langfuse dashboard for filtering and analysis.

## Supported Endpoints

Langfuse tracing is automatically enabled for:

- `/v1/chat/completions` - Chat completions (streaming and non-streaming)
- `/v1/completions` - Text completions
- `/v1/messages` - Anthropic-style messages
- `/v1/embeddings` - Embedding generation

Other endpoints are not traced to avoid unnecessary overhead.

## What Gets Tracked

### Request Information
- Model name
- Messages/prompts
- Model parameters (temperature, max_tokens, etc.)
- Request headers (Portkey-specific headers only)
- Endpoint and request type

### Response Information
- Generated text/completions
- Token usage (prompt, completion, total)
- Response status
- Latency in milliseconds

### Metadata
- Provider used (OpenAI, Anthropic, etc.)
- Whether request was streaming
- Request ID (if provided)
- User ID and Session ID (if provided via headers)
- Error information (if request failed)

## Viewing Traces

1. Go to [https://cloud.langfuse.com](https://cloud.langfuse.com)
2. Navigate to "Traces" in the sidebar
3. You'll see all your gateway requests with:
   - Model and provider information
   - Token usage
   - Latency metrics
   - Full request/response data

## Performance Impact

The Langfuse integration is designed for minimal performance impact:

- Tracing happens asynchronously after response is sent
- No blocking on trace upload
- Automatic retry and error handling
- Efficient batch processing of events
- Runs only when credentials are configured

## Disabling Tracing

To disable Langfuse tracing:

1. Remove or comment out the environment variables
2. Restart the gateway

The middleware will automatically skip tracing when credentials are not configured.

## Troubleshooting

### Traces not appearing in Langfuse

1. Verify environment variables are set correctly
2. Check that your Langfuse public/secret keys are valid
3. Ensure `LANGFUSE_BASE_URL` is correct
4. Check gateway logs for Langfuse errors

### Self-hosted Langfuse connection issues

1. Verify your Langfuse instance is accessible from the gateway
2. Check network/firewall rules
3. Ensure HTTPS is properly configured
4. Verify API keys are generated from your instance

### High memory usage

If you're processing a very high volume of requests, consider:

1. Using Cloudflare Workers (automatic scaling)
2. Increasing flush interval in the middleware
3. Monitoring your Langfuse instance capacity

## Advanced Configuration

### Custom Flush Settings

Edit `src/middlewares/langfuse/index.ts` to customize:

```typescript
langfuseInstance = new Langfuse({
  publicKey,
  secretKey,
  baseUrl,
  flushAt: 10,        // Flush after N events (default: 1)
  flushInterval: 5000, // Flush every N ms (default: 1000)
});
```

### Filtering Traced Requests

Modify the `trackedEndpoints` array in the middleware to control which endpoints get traced:

```typescript
const trackedEndpoints = [
  '/v1/chat/completions',
  '/v1/completions',
  '/v1/messages',
  '/v1/embeddings',
];
```

## Privacy and Security

- Only Portkey-specific headers (starting with `x-portkey-`) are captured
- Authorization headers are never logged
- Raw API keys are never sent to Langfuse
- Request/response data is encrypted in transit and at rest (when using cloud.langfuse.com)

## Additional Resources

- [Langfuse Documentation](https://langfuse.com/docs)
- [Langfuse GitHub](https://github.com/langfuse/langfuse)
- [Portkey Gateway Documentation](https://portkey.ai/docs)

## Support

For issues related to:
- **Langfuse integration**: Open an issue on the Portkey Gateway repo
- **Langfuse platform**: Visit [Langfuse Support](https://langfuse.com/support)
- **Portkey Gateway**: Visit [Portkey Documentation](https://portkey.ai/docs)
