# Initial Setup

## Modern Javascript setups

If you are unfamiliar with the setup for a web application using JavaScript, the introduction [Modern Javascript explained for dinosaurs](https://peterxjang.com/blog/modern-javascript-explained-for-dinosaurs.html) is highly recommended not only for dinosaurs, but also for beginners. 

This project uses `pnpm` as [package manager](https://peterxjang.com/blog/modern-javascript-explained-for-dinosaurs.html#using-a-javascript-package-manager-(npm)) and since mixing them can cause conflicts in the `package.json`, it is recommended to stick with that when working on **Firn**. `pnpm` will help you to install, update, and manage the dependencies (external libraries and tools) that our project needs.

## Switch to Node version 24

To use Node version 24, using [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) is recommended, which allows you to easily install and switch between different Node.js versions. If you don't have nvm installed, you can install it [as described](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating).

Then you can activate the current version of Node (24) with:

```bash
nvm use 24
```

## Set up pnpm

First, install pnpm if you haven't already:

```bash
# Using npm to install pnpm globally
npm install -g pnpm

# On macOS, you can also use Homebrew
brew install pnpm
```

Then install the project dependencies:

```bash
pnpm install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```
