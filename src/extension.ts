import * as vscode from 'vscode';
import axios from 'axios';
import { ethers } from 'ethers';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();


export function activate(context: vscode.ExtensionContext) {
  const provider = new CuechainViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CuechainViewProvider.viewType, provider)
  );

  const openViewCmd = vscode.commands.registerCommand('cuechain.openView', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.cuechain-sidebar');
  });
  context.subscriptions.push(openViewCmd);

  vscode.commands.executeCommand('workbench.view.extension.cuechain-sidebar');
}

class CuechainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'cuechain.chatView';
  private _view?: vscode.WebviewView;
  private _lastError: string | null = null;
  private _selectedNetwork: string | null = null;
  private _compiledAbi: any = null;
  private _compiledBytecode: string | null = null;

private readonly NETWORK_CONFIG: Record<string, { rpc: string; privateKey: string }> = {
  ethereum: {
    rpc: process.env.ETHEREUM_RPC || '',
    privateKey: process.env.ETHEREUM_KEY || '',
  },
  polygon: {
    rpc: process.env.POLYGON_RPC || '',
    privateKey: process.env.POLYGON_KEY || '',
  },
  binance: {
    rpc: process.env.BINANCE_RPC || '',
    privateKey: process.env.BINANCE_KEY || '',
  },
  avalanche: {
    rpc: process.env.AVALANCHE_RPC || '',
    privateKey: process.env.AVALANCHE_KEY || '',
  },
  solana: {
    rpc: 'https://api.devnet.solana.com',
    privateKey: '', // not handled in this extension
  },
};


  constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {
    const storedNetwork = this._context.globalState.get<string | null>('cuechainSelectedNetwork', null);
    const normalizedNetwork = (storedNetwork ?? '').toLowerCase();
    this._selectedNetwork = normalizedNetwork || null;
    if (storedNetwork && normalizedNetwork !== storedNetwork) {
      void this._context.globalState.update('cuechainSelectedNetwork', normalizedNetwork);
    }
  }

  public getLastError() {
    return this._lastError;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    const webview = webviewView.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    };

    webview.html = this._getHtmlForWebview(webview, this._selectedNetwork);

    this.updateCompileButtonState(webviewView);

    webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'selectNetwork': {
          const network = typeof msg.network === 'string' ? msg.network.toLowerCase() : '';
          this._selectedNetwork = network || null;
          void this._context.globalState.update('cuechainSelectedNetwork', network);
          webview.postMessage({ type: 'networkSelected', network });
          break;
        }

        case 'generate':
          await this.handleGenerate(msg.prompt, webviewView);
          this.updateCompileButtonState(webviewView);
          break;

        case 'compile':
          await this.handleCompile(webviewView);
          this.updateCompileButtonState(webviewView);
          break;

        case 'fixError':
          await this.handleFixError(webviewView);
          this.updateCompileButtonState(webviewView);
          break;

        case 'analyze':
          await this.handleAnalyze(webviewView);
          break;

        case 'deploy':
          await this.handleDeploy(webviewView, msg.constructorArgs || '');
          break;
      }
    });

    vscode.window.onDidChangeActiveTextEditor(() => this.updateCompileButtonState(webviewView));
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (vscode.window.activeTextEditor?.document === event.document) {
        this.updateCompileButtonState(webviewView);
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview, savedNetwork: string | null) {
  // URIs for scripts and styles
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
  );

  const normalizedSavedNetwork = (savedNetwork ?? '').toLowerCase();

  // Nonce for CSP
  const nonce = getNonce();

  // Build and return full HTML content
  return /* html */ `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />

    <!-- Content Security Policy -->
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none';
               img-src ${webview.cspSource} blob: data:;
               style-src ${webview.cspSource} 'unsafe-inline';
               script-src ${webview.cspSource} 'nonce-${nonce}';"
    />

    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri}" rel="stylesheet" />

    <title>CueChain Smart Contract Assistant</title>
  </head>
  <body>
    <h3>CueChain Smart Contract Assistant</h3>
    
    <!-- Conversation history container -->
    <div id="conversation-container" class="conversation-container"></div>

    <!-- Cursor AI-style prompt container -->
    <div class="prompt-wrapper">
      <div class="prompt-background-container">
        <div class="prompt-container">
          <textarea id="prompt" placeholder="Describe your contract..."></textarea>
        </div>
        
        <!-- Network and Generate button below input field -->
        <div class="prompt-controls">
          <div class="network-selector-wrapper">
            <button
              id="networkSelector"
              class="network-selector"
              type="button"
              title="Select Network"
              aria-haspopup="listbox"
              aria-controls="networkDropdown"
              aria-expanded="false"
            >
              <span class="network-text">Network</span>
              <svg class="chevron-down" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <select id="network" class="network-select-hidden">
              <option value="" ${normalizedSavedNetwork ? '' : 'selected'}>Network</option>
              <option value="solana" ${normalizedSavedNetwork === 'solana' ? 'selected' : ''}>Solana</option>
              <option value="ethereum" ${normalizedSavedNetwork === 'ethereum' ? 'selected' : ''}>Ethereum</option>
              <option value="binance" ${normalizedSavedNetwork === 'binance' ? 'selected' : ''}>Binance</option>
              <option value="polygon" ${normalizedSavedNetwork === 'polygon' ? 'selected' : ''}>Polygon</option>
              <option value="avalanche" ${normalizedSavedNetwork === 'avalanche' ? 'selected' : ''}>Avalanche</option>
            </select>
            <div
              id="networkDropdown"
              class="network-dropdown"
              role="listbox"
              aria-labelledby="networkSelector"
            >
              <div
                class="network-dropdown-option"
                role="option"
                data-value=""
                aria-selected="${!normalizedSavedNetwork ? 'true' : 'false'}"
              >
                <span class="network-option-label">Network</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="solana"
                aria-selected="${normalizedSavedNetwork === 'solana' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Solana</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="ethereum"
                aria-selected="${normalizedSavedNetwork === 'ethereum' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Ethereum</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="binance"
                aria-selected="${normalizedSavedNetwork === 'binance' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Binance</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="polygon"
                aria-selected="${normalizedSavedNetwork === 'polygon' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Polygon</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="avalanche"
                aria-selected="${normalizedSavedNetwork === 'avalanche' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Avalanche</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
          <button id="generate" class="prompt-send-button" disabled title="Generate Code (Enter)">
            <svg class="arrow-right-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Action buttons below prompt field (Cursor AI style) -->
      <div class="prompt-actions">
        <button id="compile" class="action-button" disabled>Compile Code</button>
        <button id="fixError" class="action-button" disabled>Fix Error</button>
        <button id="analyze" class="action-button" disabled>Analyze Code</button>
      </div>
    </div>

    <div id="constructorContainer" style="display:none;">
      <div class="small">
        Constructor args (comma-separated). Example: 1000, "My Token", "MTK"
      </div>
      <input id="constructorArgs" placeholder='constructor args (e.g. 1000, "Name")' />
    </div>

    <div class="deploy-button-container">
      <button id="deploy" class="action-button" disabled>Deploy Contract</button>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
  </html>`;
}


  private async handleGenerate(prompt: string, view: vscode.WebviewView) {
    if (!this._selectedNetwork) {
      const message = 'Please select a network first.';
      view.webview.postMessage({ type: 'assistantMessage', text: message });
      return vscode.window.showWarningMessage(message);
    }
    if (!prompt) {
      const message = 'Please enter a contract prompt.';
      view.webview.postMessage({ type: 'assistantMessage', text: message });
      return vscode.window.showWarningMessage(message);
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      const message = 'Please open a file before generating.';
      view.webview.postMessage({ type: 'assistantMessage', text: message });
      return vscode.window.showInformationMessage(message);
    }

    const currentCode = editor.document.getText().trim();

    // If file is EMPTY → original preprocess + generateCode flow
    if (currentCode.length === 0) {
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Preprocessing contract idea...' },
        async () => {
          let typingPromise: Promise<void> | null = null;
          try {
            // 1) Call preprocess API
            const { data: preprocessData } = await axios.post(
              'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/preprocess',
              { contractPrompt: prompt, network: this._selectedNetwork }
            );

            const preprocessText =
              preprocessData?.preprocessResponse || 'No preprocess response received.';

            // 2) Start typing effect immediately
            typingPromise = this.simulateTypingEffect(preprocessText, view);

            // 3) While typing, trigger generateCode API
            const { data: genData } = await axios.post(
              'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/generateCode',
              { contractPrompt: preprocessText, network: this._selectedNetwork }
            );

            const contractCode =
              genData?.codegendResponseDto?.contractCode || '// No code returned';
            await this.insertCode(contractCode);

            if (typingPromise) {
              await typingPromise;
            }

            vscode.window.showInformationMessage('✅ Code generated successfully.');
            view.webview.postMessage({ type: 'assistantMessage', text: '✅ Code generated successfully.' });
            view.webview.postMessage({ type: 'enableCompileOnly' });
          } catch (err: any) {
            if (typingPromise) {
              try {
                await typingPromise;
              } catch {
                // ignore typing errors
              }
            }
            const errorMsg = `❌ Error generating code:\n\n${err.message}`;
            view.webview.postMessage({ type: 'assistantMessage', text: errorMsg });
            vscode.window.showErrorMessage(`Error generating code: ${err.message}`);
          }
        }
      );

    } else {
      // If file ALREADY has code → modify existing contract via chatAI
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Updating contract as per your request...' },
        async () => {
          try {
            const userPrompt = `
Here is the current ${currentCode}
Change the current code according to the user changes: ${prompt}
            `.trim();

            const { data } = await axios.post(
              'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/chatAI',
              {
                userPrompt,
                systemPrompt:
                  'you are expert in analysing smart contracts and user requirement , change the contrcat code according to the specific user requirement entered by user change only what user asked, generate only contrcat code.',
                modelToUse: 'gpt-40-mini',
              }
            );

            const updatedCode =
              data?.result || '// No update returned.';

            await this.replaceEditorContent(updatedCode);

            vscode.window.showInformationMessage('✨ Contract updated based on your request.');
            view.webview.postMessage({ type: 'assistantMessage', text: '✨ Contract updated successfully.' });
            view.webview.postMessage({ type: 'enableCompileOnly' });
          } catch (err: any) {
            const errorMsg = `❌ Error updating code:\n\n${err.message}`;
            view.webview.postMessage({ type: 'assistantMessage', text: errorMsg });
            vscode.window.showErrorMessage(`Error updating code: ${err.message}`);
          }
        }
      );
    }
  }

  private updateCompileButtonState(view: vscode.WebviewView) {
    const editor = vscode.window.activeTextEditor;
    const hasCode = !!editor && editor.document.getText().trim().length > 0;

    if (hasCode) {
      view.webview.postMessage({ type: 'enableCompileOnly' });
    } else {
      view.webview.postMessage({ type: 'disableCompile' });
    }
  }

  private async simulateTypingEffect(text: string, view: vscode.WebviewView) {
    // Start assistant message with empty content
    view.webview.postMessage({ type: 'assistantMessageStart', text: '' });
    
    const words = text.split(' ');
    let displayText = '';
    for (const word of words) {
      displayText += word + ' ';
      view.webview.postMessage({ type: 'assistantMessageUpdate', text: displayText });
      await new Promise((r) => setTimeout(r, 20)); // typing speed
    }
    
    // Complete the message
    view.webview.postMessage({ type: 'assistantMessageComplete', text: displayText });
  }

  private async handleCompile(view: vscode.WebviewView) {
    if (!this._selectedNetwork) {
      const message = 'Please select a network before compiling.';
      view.webview.postMessage({ type: 'assistantMessage', text: message });
      vscode.window.showWarningMessage(message);
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showInformationMessage('Open a file first.');

    const contractCode = editor.document.getText();
    if (contractCode.trim().length === 0)
      return vscode.window.showWarningMessage('File is empty. Nothing to compile.');

    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Compiling contract...' },
      async () => {
        try {
          const { data } = await axios.post(
            'https://cuechain-extension-backend-production.up.railway.app/api/v2/pipelines/build',
            { contractCode, network: this._selectedNetwork }
          );

          const errorStr = data?.data?.errorStr;
          this._lastError = errorStr || null;

          // store abi + bytecode if available
          const abi = data?.data?.idl;
          const bytecode = data?.data?.verificationData;

          if (!errorStr) {
            // Save compiled artifacts to use during deploy
            this._compiledAbi = abi || null;
            this._compiledBytecode = bytecode || null;

            vscode.window.showInformationMessage('✅ Code compiled successfully!');
            view.webview.postMessage({ type: 'assistantMessage', text: '✅ Compilation successful.' });
            view.webview.postMessage({ type: 'enableAnalyze' });

            // Enable Deploy only when abi and bytecode exist
            if (this._compiledAbi || this._compiledBytecode) {
              view.webview.postMessage({ type: 'enableDeploy' });
            } else {
              // still enable compile/analyze path but warn deploy can't be enabled due to missing artifacts
              view.webview.postMessage({ type: 'assistantMessage', text: 'Compilation succeeded but ABI/bytecode missing — deploy disabled.' });
            }
          } else {
            view.webview.postMessage({ type: 'assistantMessage', text: `❌ Compilation Error:\n\n${errorStr}` });
            view.webview.postMessage({ type: 'enableFixError' });
          }
        } catch (err: any) {
          const errorMsg = `❌ Error compiling code:\n\n${err.message}`;
          view.webview.postMessage({ type: 'assistantMessage', text: errorMsg });
          vscode.window.showErrorMessage(`Error compiling code: ${err.message}`);
        }
      }
    );
  }

  private async handleFixError(view: vscode.WebviewView) {
    if (!this._selectedNetwork) {
      const message = 'Please select a network before fixing code.';
      view.webview.postMessage({ type: 'assistantMessage', text: message });
      vscode.window.showWarningMessage(message);
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showInformationMessage('Open a file first.');

    const contractCode = editor.document.getText();
    const lastError = this._lastError;
    if (!lastError) {
      vscode.window.showInformationMessage('No previous compile error found.');
      return;
    }

    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Fixing code errors...' },
      async () => {
        try {
          const { data } = await axios.post(
            'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/fixErrorCode',
            { contractCode, contractError: lastError, network: this._selectedNetwork }
          );

          const fixedCode = data?.codegendResponseDto?.contractCode || '// No fix generated';
          await this.replaceEditorContent(fixedCode);
          
          vscode.window.showInformationMessage('🛠️ Code fixed. Please compile again.');
          view.webview.postMessage({ type: 'assistantMessage', text: '🛠️ Code fixed. Please compile again.' });
          view.webview.postMessage({ type: 'enableCompileOnly' });
        } catch (err: any) {
          const errorMsg = `❌ Error fixing code:\n\n${err.message}`;
          view.webview.postMessage({ type: 'assistantMessage', text: errorMsg });
          vscode.window.showErrorMessage(`Error fixing code: ${err.message}`);
        }
      }
    );
  }

  private async handleAnalyze(view: vscode.WebviewView) {
    if (!this._selectedNetwork) {
      const message = 'Please select a network before analyzing.';
      view.webview.postMessage({ type: 'assistantMessage', text: message });
      vscode.window.showWarningMessage(message);
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showInformationMessage('Open a file first.');

    const contractCode = editor.document.getText();

    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Analyzing contract...' },
      async () => {
        try {
          const { data } = await axios.post(
            'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/chatAI',
            {
              userPrompt: contractCode,
              systemPrompt:
                'you are expert in analysing smart contracts code, briefly explain the usecase for the given contract.',
              modelToUse: 'gpt-40-mini',
            }
          );
          
          const explanation = data?.result || 'No analysis returned.';
          view.webview.postMessage({ type: 'assistantMessage', text: explanation });
        } catch (err: any) {
          const errorMsg = `❌ Error analyzing code:\n\n${err.message}`;
          view.webview.postMessage({ type: 'assistantMessage', text: errorMsg });
          vscode.window.showErrorMessage(`Error analyzing code: ${err.message}`);
        }
      }
    );
  }

  private async handleDeploy(view: vscode.WebviewView, constructorArgsStr: string) {
    // Deploy only for EVM-like networks (we are not handling Solana deploy here)
    if (!this._compiledAbi || !this._compiledBytecode) {
      view.webview.postMessage({ type: 'assistantMessage', text: 'ABI/bytecode unavailable — compile before deploying.' });
      return;
    }

    // Basic parsing of constructor args: comma-separated values (no deep type parsing)
    // Example input: "1000, 'My Token', 'MTK'"
    const parsedArgs = this._parseConstructorArgs(constructorArgsStr);

    view.webview.postMessage({ type: 'disableDeploy' });
    view.webview.postMessage({ type: 'assistantMessage', text: '🚀 Starting deployment...' });

    try {
    const networkConfig = this.NETWORK_CONFIG[this._selectedNetwork || ''];

   if (!networkConfig?.rpc || !networkConfig?.privateKey) {
    const msg = `RPC or Private Key missing for ${this._selectedNetwork}`;
    vscode.window.showErrorMessage(msg);
    view.webview.postMessage({ type: 'assistantMessage', text: msg });
    return;
}

const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
const wallet = new ethers.Wallet(networkConfig.privateKey, provider);


      // Build factory and deploy
      const factory = new ethers.ContractFactory(this._compiledAbi, this._compiledBytecode, wallet);

      // Send status update
      view.webview.postMessage({ type: 'assistantMessageUpdate', text: 'Deploying contract — transaction sent...' });

      // Deploy with parsed args
      const contract = await factory.deploy(...parsedArgs);

      // Wait for deployment to be mined (ethers v6)
      try {
        await contract.waitForDeployment();
      } catch (waitErr) {
        // fallback: if waitForDeployment not present (older version), try waiting on transaction
        if ((contract as any).deployTransaction) {
          const txHash = (contract as any).deployTransaction.hash;
          await provider.waitForTransaction(txHash);
        }
      }

      const address = await contract.getAddress();

      view.webview.postMessage({ type: 'assistantMessage', text: `✅ Contract deployed successfully!\n\nContract Address: ${address}` });
      vscode.window.showInformationMessage(`Contract deployed: ${address}`);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      view.webview.postMessage({ type: 'assistantMessage', text: `❌ Deployment failed:\n\n${errMsg}` });
      vscode.window.showErrorMessage(`Deployment error: ${errMsg}`);
    } finally {
      view.webview.postMessage({ type: 'enableDeploy' });
    }
  }

  private _parseConstructorArgs(input: string): any[] {
    if (!input || input.trim().length === 0) return [];

    // split respecting quotes (basic)
    const parts: string[] = [];
    let cur = '';
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        cur += ch;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        cur += ch;
      } else if (ch === ',' && !inSingle && !inDouble) {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.length > 0) parts.push(cur.trim());

    // normalize: remove surrounding quotes and cast numeric-looking values to numbers (simple heuristic)
    return parts.map((p) => {
      const trimmed = p.trim();
      // remove surrounding single/double quotes
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return trimmed.slice(1, -1);
      }
      // try to parse as number (integer or float)
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        try {
          // Big numbers should be passed as string by user if needed (or we could use ethers.parseUnits)
          return Number(trimmed);
        } catch {
          return trimmed;
        }
      }
      // otherwise return as string
      return trimmed;
    });
  }

  private async insertCode(code: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    await editor.edit((edit) => edit.insert(editor.selection.active, code));
  }

  private async replaceEditorContent(code: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    await editor.edit((edit) => edit.replace(fullRange, code));
  }
}

function getNonce() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
