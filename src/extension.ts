import * as vscode from "vscode";
import { PythonSemanticTokensProvider, legend } from "./semanticTokenProvider";

export function activate(context: vscode.ExtensionContext) {
    const provider = new PythonSemanticTokensProvider();

    const selector: vscode.DocumentSelector = [
        { language: "python", scheme: "file" },
        { language: "python", scheme: "untitled" },
    ];

    const registration = vscode.languages.registerDocumentSemanticTokensProvider(
        selector,
        provider,
        legend
    );

    context.subscriptions.push(registration);

    // Re-register when the enabled setting changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("lightPyrefly.enabled")) {
                vscode.window.showInformationMessage(
                    "Light Pyrefly: Reload the window to apply changes."
                );
            }
        })
    );

    console.log("Light Pyrefly activated — semantic highlighting is live.");
}

export function deactivate() {}
