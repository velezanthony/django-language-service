import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Django Language Service');
  }
  return channel;
}

export function logInfo(msg: string): void {
  getOutputChannel().appendLine(`[INFO]  ${msg}`);
}

export function logWarn(msg: string): void {
  getOutputChannel().appendLine(`[WARN]  ${msg}`);
}

export function logError(msg: string, err?: unknown): void {
  getOutputChannel().appendLine(`[ERROR] ${msg}${err !== undefined ? ` — ${String(err)}` : ''}`);
}

export function showOutputChannel(): void {
  getOutputChannel().show(true);
}

export { getOutputChannel };
