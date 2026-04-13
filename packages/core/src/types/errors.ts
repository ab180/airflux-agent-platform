export class AirfluxError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AirfluxError';
  }
}

export class AgentNotFoundError extends AirfluxError {
  constructor(agentName: string) {
    super(`Agent not found: ${agentName}`, 'AGENT_NOT_FOUND', 404);
  }
}

export class ToolNotFoundError extends AirfluxError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND', 404);
  }
}

export class AgentDisabledError extends AirfluxError {
  constructor(agentName: string) {
    super(`Agent is disabled: ${agentName}`, 'AGENT_DISABLED', 403);
  }
}

export class ConfigLoadError extends AirfluxError {
  constructor(configName: string, cause?: Error) {
    super(
      `Failed to load config: ${configName}${cause ? ` - ${cause.message}` : ''}`,
      'CONFIG_LOAD_ERROR',
      500,
    );
  }
}
