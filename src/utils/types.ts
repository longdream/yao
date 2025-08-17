export type Provider = 'ollama' | 'openai'

export type ModelConfig = {
  name: string
  provider: Provider
  baseUrl?: string
  apiKey?: string
}


