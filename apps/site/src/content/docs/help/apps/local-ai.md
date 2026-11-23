---
title: Run AI models on your hlabs
description: How Ollama and the AI chat apps work together, and the address that connects them.
features: [F-STORE-13]
---

For admins. The App Store's **Local AI** category has chat apps (Open WebUI, LibreChat, LobeChat, AnythingLLM) and **Ollama**, which runs open AI models such as Llama, Gemma and Mistral on this computer.

## Use models on this computer

1. Install **Ollama** from the App Store. It has no page of its own; the chat apps use it.
2. Install a chat app and give it the address `http://ollama:11434` for Ollama. Open WebUI asks for it when you install it; in LibreChat, LobeChat and AnythingLLM it's in their settings. LobeChat and OpenClaw use that address already.
3. Download a model from the chat app (for example **llama3.2** or **gemma3**). Models are large: a small one is about 2 GB and the bigger ones 20 GB or more.

On a Mac, Ollama in hlabs uses the processor rather than the graphics chip, so big models answer slowly. For speed, install the Ollama app for macOS from ollama.com instead, and give the chat apps the address `http://host.docker.internal:11434` (Open WebUI's suggested address).

## Use models from a service

LibreChat, LobeChat, AnythingLLM and OpenClaw also work with OpenAI, Anthropic, Google and other services. Each person adds their own API key in the app; the key stays in that app on your hlabs.

## OpenClaw

OpenClaw is an assistant that can act for you: run commands, browse and send messages from the chat accounts you connect. When you install it you choose an access token, which its page asks for. Connect only the accounts you trust it with.
