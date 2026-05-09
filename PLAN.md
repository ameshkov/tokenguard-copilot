# Plan

I want to create a VSCode extension similar to `/Volumes/Dev/misc/oai-compatible-copilot`, i.e. an extension that allows using different third-party models with VSCode Copilot Chat.

Another similar extension is `/Volumes/Dev/misc/deepseek-v4-for-copilot`.

Let's start with initializing repository for it.

1. This should be a typescript project
2. Linters configuration should be similar to `/Volumes/Dev/github-enterprise/ts-microservice-template`
3. Init the documentation: README.md, DEVELOPMENT.md, CHANGELOG.md, AGENTS.md
4. Create a basic hello world extension and a launch.json configuration for
   running the extension (similar to deepseek, i.e. to launch with normal
   vscode and with insiders).
