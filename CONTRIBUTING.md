# Contributing to OpenTunnel

First off, thank you for considering contributing to OpenTunnel! It's people like you that make OpenTunnel such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and inclusive environment. Please be respectful and constructive in all interactions.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Describe the behavior you observed and what you expected**
- **Include screenshots if applicable**
- **Include your environment details** (OS, VS Code version, extension version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List any alternatives you've considered**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. Ensure the test suite passes
4. Make sure your code follows the existing style
5. Write a clear commit message

## Development Setup

### Prerequisites

- Node.js 18 or later
- VS Code 1.85 or later
- Git

### Setting Up the Development Environment

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/opentunnel-vscode.git
cd opentunnel-vscode

# Install dependencies
npm install

# Start watching for changes
npm run watch
```

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension will be available in the new VS Code window

### Running the Relay Server

```bash
cd relay-server
npm install
npm run dev
```

### Project Structure

```
opentunnel-vscode/
├── src/
│   ├── extension.ts       # Extension entry point
│   ├── tunnelManager.ts   # Manages tunnel connections
│   ├── tunnelClient.ts    # WebSocket client
│   ├── ui/
│   │   ├── statusBar.ts   # Status bar management
│   │   └── treeView.ts    # Sidebar tree views
│   └── utils/
│       ├── logger.ts      # Logging utility
│       └── helpers.ts     # Helper functions
├── relay-server/
│   └── src/
│       └── server.ts      # Relay server
├── package.json           # Extension manifest
└── tsconfig.json          # TypeScript config
```

## Style Guide

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use async/await over promises
- Add JSDoc comments for public APIs
- Use meaningful variable names

### Git Commits

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters
- Reference issues and pull requests liberally

### Code Example

```typescript
/**
 * Starts a new tunnel connection
 * @param port - The local port to expose
 * @returns The tunnel information
 */
async function startTunnel(port: number): Promise<TunnelInfo> {
    // Validate input
    if (!isValidPort(port)) {
        throw new Error(`Invalid port: ${port}`);
    }

    // Create and connect
    const client = new TunnelClient({ port });
    return await client.connect();
}
```

## Testing

```bash
# Run linting
npm run lint

# Compile TypeScript
npm run compile

# Run tests (when available)
npm test
```

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a git tag: `git tag v1.0.0`
4. Push with tags: `git push origin main --tags`
5. GitHub Actions will build and publish

## Questions?

Feel free to open an issue with the "question" label if you have any questions about contributing.

Thank you for contributing! 🚀
