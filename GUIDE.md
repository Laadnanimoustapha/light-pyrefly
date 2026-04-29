# Light Pyrefly — Setup & Usage Guide

A **lightweight** VSCode extension that provides Python semantic highlighting.  
No Rust toolchain, no LSP server, no type checker — just beautiful, context-aware coloring, directly in TypeScript.

---

## What It Does

| Python Construct | Highlighting |
|---|---|
| `class Foo` | **class** (declaration) |
| `def bar()` | **function** (declaration) |
| `def bar()` inside a class | **method** (declaration) |
| `x = 5` | **variable** |
| `ALL_CAPS = 5` | **variable** + `readonly` modifier (teal color) |
| `def f(param)` | **parameter** |
| `self` / `cls` | **parameter** + `selfParameter` modifier (blue) |
| `from os import path` | **namespace** |
| `@decorator` | **decorator** (yellow) |
| `int`, `str`, `print()` | built-in types/functions with `defaultLibrary` modifier |
| `obj.attr` | **property** |
| `obj.method()` | **method** |
| `Color.RED` | **enumMember** |
| `T` in `def f[T]()` | **typeParameter** |
| Type annotations | **class** references |

---

## Prerequisites

- **Node.js** ≥ 16  
- **VSCode** ≥ 1.75  

That's it. No Rust, no Python, no cargo.

---

## Setup — Step by Step

### 1. Install dependencies

```bash
cd light-pyrefly
npm install
```

### 2. Compile TypeScript

```bash
npm run compile
```

This creates compiled JS files in the `out/` folder.

### 3. Run in development mode (recommended to try first)

1. Open the `light-pyrefly` folder in VSCode
2. Press **F5** (or Run → Start Debugging)
3. A new **Extension Development Host** window opens
4. Open any `.py` file — semantic highlighting is active

### 4. Package as a `.vsix` for permanent install

```bash
npm run package
```

This creates `light-pyrefly-1.0.0.vsix`. Install it:

```bash
code --install-extension light-pyrefly-1.0.0.vsix
```

Or in VSCode: **Extensions** → **⋯** menu → **Install from VSIX…**

---

## Configuration

In VSCode settings (`settings.json`):

```jsonc
{
    // Disable/enable the extension
    "lightPyrefly.enabled": true,

    // Customize colors (optional)
    "editor.semanticTokenColorCustomizations": {
        "rules": {
            "variable.readonly:python": "#4EC9B0",      // constants
            "parameter.selfParameter:python": "#569CD6", // self/cls
            "decorator:python": "#DCDCAA",               // decorators
            "typeParameter:python": "#4FC1FF",           // type params
            "class:python": "#4EC9B0",                   // classes
            "function:python": "#DCDCAA",                // functions
            "method:python": "#DCDCAA",                  // methods
            "parameter:python": "#9CDCFE",               // parameters
            "namespace:python": "#C8C8C8"                // modules
        }
    }
}
```

---

## Differences from Full Pyrefly

| Feature | Full Pyrefly | Light Pyrefly |
|---|---|---|
| Semantic highlighting | ✅ Type-aware (uses type checker) | ✅ Syntax-aware (regex-based) |
| Type checking | ✅ Full type inference | ❌ Not included |
| Autocomplete | ✅ | ❌ |
| Go-to-definition | ✅ | ❌ |
| Hover info | ✅ | ❌ |
| Rust toolchain required | ✅ | ❌ |
| Install time | Minutes (build Rust) | Seconds |
| Resource usage | Higher (LSP server) | Minimal |

Light Pyrefly is perfect when you **only** want better Python coloring without running a full language server.

---

## Troubleshooting

**No colors showing?**  
- Ensure `editor.semanticHighlighting.enabled` is `true` in settings  
- Check that another extension isn't overriding Python semantic tokens  
- Run `Developer: Inspect Editor Tokens and Scopes` from the command palette to verify tokens

**Colors look wrong?**  
- Your color theme may override semantic token colors  
- Use the `editor.semanticTokenColorCustomizations` setting above to force specific colors

**Want to disable it temporarily?**  
- Set `"lightPyrefly.enabled": false` in settings, then reload the window
