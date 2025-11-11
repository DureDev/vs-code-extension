// import * as vscode from 'vscode';
// import axios from 'axios';
// import { ethers } from 'ethers';

// export function activate(context: vscode.ExtensionContext) {
//   const provider = new CuechainViewProvider(context.extensionUri, context);
//   context.subscriptions.push(
//     vscode.window.registerWebviewViewProvider(CuechainViewProvider.viewType, provider)
//   );

//   const openViewCmd = vscode.commands.registerCommand('cuechain.openView', async () => {
//     await vscode.commands.executeCommand('workbench.view.extension.cuechain-sidebar');
//   });
//   context.subscriptions.push(openViewCmd);

//   const getLastErrorCmd = vscode.commands.registerCommand('cuechain.getLastError', async () => {
//     return provider.getLastError();
//   });
//   context.subscriptions.push(getLastErrorCmd);

//   // open the view on activation
//   vscode.commands.executeCommand('workbench.view.extension.cuechain-sidebar');
// }

// class CuechainViewProvider implements vscode.WebviewViewProvider {
//   public static readonly viewType = 'cuechain.chatView';
//   private _view?: vscode.WebviewView;
//   private _lastError: string | null = null;
//   private _selectedNetwork: string | null = null;

//   // store compiled outputs for deploy
//   private _compiledAbi: any = null;
//   private _compiledBytecode: string | null = null;

//   // Hardcoded RPC and private key for testing (replace before use)
//   private readonly RPC_URL = 'http://127.0.0.1:8545/'; // <-- fixed endpoint (local)
//   private readonly PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // <-- replace with your test private key

//   constructor(
//     private readonly _extensionUri: vscode.Uri,
//     private readonly _context: vscode.ExtensionContext
//   ) {
//     this._selectedNetwork = this._context.globalState.get('cuechainSelectedNetwork', null);
//   }

//   public getLastError() {
//     return this._lastError;
//   }

//   public resolveWebviewView(webviewView: vscode.WebviewView) {
//     this._view = webviewView;

//     webviewView.webview.options = {
//       enableScripts: true,
//       localResourceRoots: [this._extensionUri],
//     };

//     webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this._selectedNetwork);

//     webviewView.webview.onDidReceiveMessage(async (msg) => {
//       switch (msg.type) {
//         case 'selectNetwork':
//           this._selectedNetwork = msg.network;
//           this._context.globalState.update('cuechainSelectedNetwork', msg.network);
//           webviewView.webview.postMessage({ type: 'networkSelected', network: msg.network });
//           break;
//         case 'generate':
//           await this.handleGenerate(msg.prompt, webviewView);
//           break;
//         case 'compile':
//           await this.handleCompile(webviewView);
//           break;
//         case 'fixError':
//           await this.handleFixError(webviewView);
//           break;
//         case 'analyze':
//           await this.handleAnalyze(webviewView);
//           break;
//         case 'deploy':
//           // msg.constructorArgs is optional string (comma-separated)
//           await this.handleDeploy(webviewView, msg.constructorArgs || '');
//           break;
//       }
//     });
//   }

//   private async handleGenerate(prompt: string, view: vscode.WebviewView) {
//     if (!this._selectedNetwork)
//       return vscode.window.showWarningMessage('Please select a network first.');
//     if (!prompt)
//       return vscode.window.showWarningMessage('Please enter a contract prompt.');

//     const editor = vscode.window.activeTextEditor;
//     if (!editor)
//       return vscode.window.showInformationMessage('Please open a file before generating.');

//     const currentCode = editor.document.getText().trim();

//     // If file is EMPTY → original preprocess + generateCode flow
//     if (currentCode.length === 0) {
//       vscode.window.withProgress(
//         { location: vscode.ProgressLocation.Notification, title: 'Preprocessing contract idea...' },
//         async () => {
//           try {
//             // 1) Call preprocess API
//             const { data: preprocessData } = await axios.post(
//               'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/preprocess',
//               { contractPrompt: prompt, network: this._selectedNetwork }
//             );

//             const preprocessText =
//               preprocessData?.preprocessResponse || 'No preprocess response received.';

//             // 2) Start typing effect immediately
//             this.simulateTypingEffect(preprocessText, view);

//             // 3) While typing, trigger generateCode API
//             const { data: genData } = await axios.post(
//               'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/generateCode',
//               { contractPrompt: preprocessText, network: this._selectedNetwork }
//             );

//             const contractCode =
//               genData?.codegendResponseDto?.contractCode || '// No code returned';
//             await this.insertCode(contractCode);

//             vscode.window.showInformationMessage('✅ Code generated successfully.');
//             view.webview.postMessage({ type: 'status', message: '✅ Code generated successfully.' });
//             view.webview.postMessage({ type: 'enableCompileOnly' });
//           } catch (err: any) {
//             vscode.window.showErrorMessage(`Error generating code: ${err.message}`);
//           }
//         }
//       );

//     } else {
//       // If file ALREADY has code → modify existing contract via chatAI
//       vscode.window.withProgress(
//         { location: vscode.ProgressLocation.Notification, title: 'Updating contract as per your request...' },
//         async () => {
//           try {
//             const userPrompt = `
// Here is the current ${currentCode}
// Change the current code according to the user changes: ${prompt}
//             `.trim();

//             const { data } = await axios.post(
//               'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/chatAI',
//               {
//                 userPrompt,
//                 systemPrompt:
//                   'you are expert in analysing smart contracts and user requirement , change the contrcat code according to the specific user requirement entered by user change only what user asked, generate only contrcat code.',
//                 modelToUse: 'gpt-40-mini',
//               }
//             );

//             const updatedCode =
//               data?.result || '// No update returned.';

//             await this.replaceEditorContent(updatedCode);

//             vscode.window.showInformationMessage('✨ Contract updated based on your request.');
//             view.webview.postMessage({ type: 'status', message: '✨ Contract updated successfully.' });
//             view.webview.postMessage({ type: 'enableCompileOnly' });
//           } catch (err: any) {
//             vscode.window.showErrorMessage(`Error updating code: ${err.message}`);
//           }
//         }
//       );
//     }
//   }

//   private async simulateTypingEffect(text: string, view: vscode.WebviewView) {
//     const words = text.split(' ');
//     let displayText = '';
//     for (const word of words) {
//       displayText += word + ' ';
//       view.webview.postMessage({ type: 'preprocessTyping', text: displayText });
//       await new Promise((r) => setTimeout(r, 40)); // typing speed
//     }
//   }

//   private async handleCompile(view: vscode.WebviewView) {
//     const editor = vscode.window.activeTextEditor;
//     if (!editor) return vscode.window.showInformationMessage('Open a file first.');

//     const contractCode = editor.document.getText();
//     if (contractCode.trim().length === 0)
//       return vscode.window.showWarningMessage('File is empty. Nothing to compile.');

//     vscode.window.withProgress(
//       { location: vscode.ProgressLocation.Notification, title: 'Compiling contract...' },
//       async () => {
//         try {
//           const { data } = await axios.post(
//             'https://cuechain-extension-backend-production.up.railway.app/api/v2/pipelines/build',
//             { contractCode, network: this._selectedNetwork }
//           );

//           const errorStr = data?.data?.errorStr;
//           this._lastError = errorStr || null;

//           // store abi + bytecode if available
//           const abi = data?.data?.idl;
//           const bytecode = data?.data?.verificationData;

//           if (!errorStr) {
//             // Save compiled artifacts to use during deploy
//             this._compiledAbi = abi || null;
//             this._compiledBytecode = bytecode || null;

//             vscode.window.showInformationMessage('✅ Code compiled successfully!');
//             view.webview.postMessage({ type: 'status', message: '✅ Compilation successful.' });
//             view.webview.postMessage({ type: 'enableAnalyze' });

//             // Enable Deploy only when abi and bytecode exist
//             if (this._compiledAbi && this._compiledBytecode) {
//               view.webview.postMessage({ type: 'enableDeploy' });
//             } else {
//               // still enable compile/analyze path but warn deploy can't be enabled due to missing artifacts
//               view.webview.postMessage({ type: 'status', message: 'Compilation succeeded but ABI/bytecode missing — deploy disabled.' });
//             }
//           } else {
//             view.webview.postMessage({ type: 'error', error: errorStr });
//             view.webview.postMessage({ type: 'enableFixError' });
//           }
//         } catch (err: any) {
//           vscode.window.showErrorMessage(`Error compiling code: ${err.message}`);
//         }
//       }
//     );
//   }

//   private async handleFixError(view: vscode.WebviewView) {
//     const editor = vscode.window.activeTextEditor;
//     if (!editor) return vscode.window.showInformationMessage('Open a file first.');

//     const contractCode = editor.document.getText();
//     const lastError = this._lastError;
//     if (!lastError) {
//       vscode.window.showInformationMessage('No previous compile error found.');
//       return;
//     }

//     vscode.window.withProgress(
//       { location: vscode.ProgressLocation.Notification, title: 'Fixing code errors...' },
//       async () => {
//         try {
//           const { data } = await axios.post(
//             'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/fixErrorCode',
//             { contractCode, contractError: lastError, network: this._selectedNetwork }
//           );

//           const fixedCode = data?.codegendResponseDto?.contractCode || '// No fix generated';
//           await this.replaceEditorContent(fixedCode);

//           vscode.window.showInformationMessage('🛠️ Code fixed. Please compile again.');
//           view.webview.postMessage({ type: 'enableCompileOnly' });
//         } catch (err: any) {
//           vscode.window.showErrorMessage(`Error fixing code: ${err.message}`);
//         }
//       }
//     );
//   }

//   private async handleAnalyze(view: vscode.WebviewView) {
//     const editor = vscode.window.activeTextEditor;
//     if (!editor) return vscode.window.showInformationMessage('Open a file first.');

//     const contractCode = editor.document.getText();

//     vscode.window.withProgress(
//       { location: vscode.ProgressLocation.Notification, title: 'Analyzing contract...' },
//       async () => {
//         try {
//           const { data } = await axios.post(
//             'https://cuechain-extension-backend-production.up.railway.app/api/v2/codegens/chatAI',
//             {
//               userPrompt: contractCode,
//               systemPrompt:
//                 'you are expert in analysing solana and anchor code, briefly explain the usecase for the given contract.',
//               modelToUse: 'gpt-40-mini',
//             }
//           );

//           const explanation = data?.result || 'No analysis returned.';
//           const formatted = explanation
//             .replace(/\n### /g, '\n\n**')
//             .replace(/\n- /g, '\n• ')
//             .replace(/\n/g, '<br>');

//           view.webview.postMessage({ type: 'analysis', text: formatted });
//         } catch (err: any) {
//           vscode.window.showErrorMessage(`Error analyzing code: ${err.message}`);
//         }
//       }
//     );
//   }

//   private async handleDeploy(view: vscode.WebviewView, constructorArgsStr: string) {
//     // Deploy only for EVM-like networks (we are not handling Solana deploy here)
//     if (!this._compiledAbi || !this._compiledBytecode) {
//       view.webview.postMessage({ type: 'status', message: 'ABI/bytecode unavailable — compile before deploying.' });
//       return;
//     }

//     // Basic parsing of constructor args: comma-separated values (no deep type parsing)
//     // Example input: "1000, 'My Token', 'MTK'"
//     const parsedArgs = this._parseConstructorArgs(constructorArgsStr);

//     view.webview.postMessage({ type: 'status', message: '🚀 Starting deployment...' });

//     try {
//       // Create provider & wallet using hardcoded RPC and private key (replace for real use)
//       const provider = new ethers.JsonRpcProvider(this.RPC_URL);
//       const wallet = new ethers.Wallet(this.PRIVATE_KEY, provider);

//       // Build factory and deploy
//       const factory = new ethers.ContractFactory(this._compiledAbi, this._compiledBytecode, wallet);

//       // Send status update
//       view.webview.postMessage({ type: 'status', message: 'Deploying contract — transaction sent.' });

//       // Deploy with parsed args
//       const contract = await factory.deploy(...parsedArgs);

//       // Wait for deployment to be mined (ethers v6)
//       try {
//         await contract.waitForDeployment();
//       } catch (waitErr) {
//         // fallback: if waitForDeployment not present (older version), try waiting on transaction
//         if ((contract as any).deployTransaction) {
//           const txHash = (contract as any).deployTransaction.hash;
//           await provider.waitForTransaction(txHash);
//         }
//       }

//       const address = await contract.getAddress();

//       view.webview.postMessage({ type: 'status', message: `✅ Contract deployed: ${address}` });
//       vscode.window.showInformationMessage(`Contract deployed: ${address}`);
//     } catch (err: any) {
//       const errMsg = err?.message || String(err);
//       view.webview.postMessage({ type: 'status', message: `❌ Deployment failed: ${errMsg}` });
//       vscode.window.showErrorMessage(`Deployment error: ${errMsg}`);
//     }
//   }

//   // very simple constructor arg parser:
//   // - splits on commas not inside quotes
//   // - trims whitespace and removes surrounding single or double quotes
//   private _parseConstructorArgs(input: string): any[] {
//     if (!input || input.trim().length === 0) return [];

//     // split respecting quotes (basic)
//     const parts: string[] = [];
//     let cur = '';
//     let inSingle = false;
//     let inDouble = false;

//     for (let i = 0; i < input.length; i++) {
//       const ch = input[i];
//       if (ch === "'" && !inDouble) {
//         inSingle = !inSingle;
//         cur += ch;
//       } else if (ch === '"' && !inSingle) {
//         inDouble = !inDouble;
//         cur += ch;
//       } else if (ch === ',' && !inSingle && !inDouble) {
//         parts.push(cur.trim());
//         cur = '';
//       } else {
//         cur += ch;
//       }
//     }
//     if (cur.length > 0) parts.push(cur.trim());

//     // normalize: remove surrounding quotes and cast numeric-looking values to numbers (simple heuristic)
//     return parts.map((p) => {
//       const trimmed = p.trim();
//       // remove surrounding single/double quotes
//       if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
//         return trimmed.slice(1, -1);
//       }
//       // try to parse as number (integer or float)
//       if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
//         try {
//           // Big numbers should be passed as string by user if needed (or we could use ethers.parseUnits)
//           return Number(trimmed);
//         } catch {
//           return trimmed;
//         }
//       }
//       // otherwise return as string
//       return trimmed;
//     });
//   }

//   private async insertCode(code: string) {
//     const editor = vscode.window.activeTextEditor;
//     if (!editor) return;
//     await editor.edit((edit) => edit.insert(editor.selection.active, code));
//   }

//   private async replaceEditorContent(code: string) {
//     const editor = vscode.window.activeTextEditor;
//     if (!editor) return;
//     const fullRange = new vscode.Range(
//       editor.document.positionAt(0),
//       editor.document.positionAt(editor.document.getText().length)
//     );
//     await editor.edit((edit) => edit.replace(fullRange, code));
//   }

//   private _getHtmlForWebview(webview: vscode.Webview, savedNetwork: string | null) {
//     const nonce = getNonce();
//     const networks = ['SOLANA', 'ETHEREUM', 'BINANCE', 'POLYGON', 'AVALANCHE'];
//     const options = ['<option value="">Select Network</option>']
//       .concat(
//         networks.map(
//           (n) =>
//             `<option value="${n}" ${savedNetwork === n ? 'selected' : ''}>${n}</option>`
//         )
//       )
//       .join('');

//     return /* html */ `
//       <!DOCTYPE html>
//       <html lang="en">
//       <head>
//         <meta charset="UTF-8">
//         <meta http-equiv="Content-Security-Policy"
//           content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
//         <style>
//           body { font-family: sans-serif; padding: 10px; background: #1e1e1e; color: #ddd; }
//           textarea, pre, select, input { width: 100%; border-radius: 6px; padding: 8px; background: #252526; color: white; border: 1px solid #444; margin-bottom: 6px; box-sizing: border-box; }
//           button { margin-top: 6px; padding: 6px 10px; border: none; border-radius: 4px; background: #007acc; color: white; cursor: pointer; }
//           button:disabled { opacity: 0.5; cursor: not-allowed; }
//           pre { margin-top: 10px; max-height: 250px; overflow-y: auto; white-space: pre-wrap; }
//           .small { font-size: 12px; color: #999; margin-bottom: 6px; }
//         </style>
//       </head>
//       <body>
//         <h3>CueChain Smart Contract Assistant</h3>
//         <label for="network">Select Network:</label>
//         <select id="network">${options}</select>

//         <textarea id="prompt" placeholder="Describe your contract..."></textarea>
//         <button id="generate" disabled>Generate Code</button>
//         <button id="compile" disabled>Compile Code</button>
//         <button id="fixError" disabled>Fix Error</button>
//         <button id="analyze" disabled>Analyze Code</button>

//         <!-- constructor args input: shown only when network !== SOLANA -->
//         <div id="constructorContainer" style="display:none;">
//           <div class="small">Constructor args (comma-separated). Example: 1000, "My Token", "MTK"</div>
//           <input id="constructorArgs" placeholder='constructor args (e.g. 1000, "Name")' />
//         </div>

//         <button id="deploy" disabled>Deploy Contract</button>
//         <pre id="output"></pre>

//         <script nonce="${nonce}">
//           const vscode = acquireVsCodeApi();
//           const select = document.getElementById('network');
//           const btnGen = document.getElementById('generate');
//           const btnComp = document.getElementById('compile');
//           const btnFix = document.getElementById('fixError');
//           const btnAnalyze = document.getElementById('analyze');
//           const btnDeploy = document.getElementById('deploy');
//           const promptBox = document.getElementById('prompt');
//           const output = document.getElementById('output');
//           const constructorContainer = document.getElementById('constructorContainer');
//           const constructorArgsInput = document.getElementById('constructorArgs');

//           // initialize UI state based on selected network saved
//           (function init() {
//             const savedNetwork = "${savedNetwork ?? ''}";
//             if (savedNetwork && savedNetwork !== '') {
//               btnGen.disabled = false;
//               // show constructor input for non-solana
//               if (savedNetwork !== 'SOLANA') {
//                 constructorContainer.style.display = 'block';
//               }
//             }
//           })();

//           select.addEventListener('change', () => {
//             const network = select.value;
//             vscode.postMessage({ type: 'selectNetwork', network });
//             // show/hide constructor input
//             if (network === 'SOLANA' || network === '') {
//               constructorContainer.style.display = 'none';
//             } else {
//               constructorContainer.style.display = 'block';
//             }
//           });

//           btnGen.addEventListener('click', () => {
//             vscode.postMessage({ type: 'generate', prompt: promptBox.value });
//             output.textContent = 'Preprocessing...';
//           });

//           btnComp.addEventListener('click', () => {
//             vscode.postMessage({ type: 'compile' });
//             output.textContent = 'Compiling...';
//           });

//           btnFix.addEventListener('click', () => {
//             vscode.postMessage({ type: 'fixError' });
//             output.textContent = 'Fixing error...';
//           });

//           btnAnalyze.addEventListener('click', () => {
//             vscode.postMessage({ type: 'analyze' });
//             output.textContent = 'Analyzing...';
//           });

//           btnDeploy.addEventListener('click', () => {
//             // send constructor args (if any)
//             const args = constructorArgsInput.value || '';
//             vscode.postMessage({ type: 'deploy', constructorArgs: args });
//             output.textContent = 'Deploying...';
//           });

//           window.addEventListener('message', e => {
//             const msg = e.data;
//             switch (msg.type) {
//               case 'networkSelected':
//                 btnGen.disabled = false;
//                 // show/hide constructor input by network (extension also sends this)
//                 if (msg.network === 'SOLANA') {
//                   constructorContainer.style.display = 'none';
//                 } else {
//                   constructorContainer.style.display = 'block';
//                 }
//                 break;
//               case 'preprocessTyping':
//                 output.textContent = msg.text;
//                 break;
//               case 'status':
//                 output.textContent = msg.message; break;
//               case 'error':
//                 output.textContent = msg.error; break;
//               case 'enableCompileOnly':
//                 btnComp.disabled = false; btnFix.disabled = true; btnAnalyze.disabled = true; break;
//               case 'enableFixError':
//                 btnFix.disabled = false; btnAnalyze.disabled = true; break;
//               case 'enableAnalyze':
//                 btnAnalyze.disabled = false; btnFix.disabled = true; break;
//               case 'enableDeploy':
//                 btnDeploy.disabled = false; break;
//               case 'analysis':
//                 output.textContent = msg.text; break;
//             }
//           });
//         </script>
//       </body>
//       </html>`;
//   }
// }

// function getNonce() {
//   const possible =
//     'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//   return Array.from({ length: 32 }, () =>
//     possible.charAt(Math.floor(Math.random() * possible.length))
//   ).join('');
// }

import * as vscode from 'vscode';
import axios from 'axios';
import { ethers } from 'ethers';
import * as path from 'path';
import * as fs from 'fs';

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

  private readonly RPC_URL = 'http://127.0.0.1:8545/';
  private readonly PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

  constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {
    this._selectedNetwork = this._context.globalState.get('cuechainSelectedNetwork', null);
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
        case 'selectNetwork':
          this._selectedNetwork = msg.network;
          this._context.globalState.update('cuechainSelectedNetwork', msg.network);
          webview.postMessage({ type: 'networkSelected', network: msg.network });
          break;

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
               script-src 'nonce-${nonce}';"
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
              <option value="" ${savedNetwork ? '' : 'selected'}>Network</option>
              <option value="SOLANA" ${savedNetwork === 'SOLANA' ? 'selected' : ''}>Solana</option>
              <option value="ETHEREUM" ${savedNetwork === 'ETHEREUM' ? 'selected' : ''}>Ethereum</option>
              <option value="BINANCE" ${savedNetwork === 'BINANCE' ? 'selected' : ''}>Binance</option>
              <option value="POLYGON" ${savedNetwork === 'POLYGON' ? 'selected' : ''}>Polygon</option>
              <option value="AVALANCHE" ${savedNetwork === 'AVALANCHE' ? 'selected' : ''}>Avalanche</option>
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
                aria-selected="${!savedNetwork ? 'true' : 'false'}"
              >
                <span class="network-option-label">Network</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="SOLANA"
                aria-selected="${savedNetwork === 'SOLANA' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Solana</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="ETHEREUM"
                aria-selected="${savedNetwork === 'ETHEREUM' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Ethereum</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="BINANCE"
                aria-selected="${savedNetwork === 'BINANCE' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Binance</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="POLYGON"
                aria-selected="${savedNetwork === 'POLYGON' ? 'true' : 'false'}"
              >
                <span class="network-option-label">Polygon</span>
                <svg class="network-dropdown-check" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6.5L5.2 8.5L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div
                class="network-dropdown-option"
                role="option"
                data-value="AVALANCHE"
                aria-selected="${savedNetwork === 'AVALANCHE' ? 'true' : 'false'}"
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
            if (this._compiledAbi && this._compiledBytecode) {
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
                'you are expert in analysing solana and anchor code, briefly explain the usecase for the given contract.',
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

    view.webview.postMessage({ type: 'assistantMessage', text: '🚀 Starting deployment...' });

    try {
      // Create provider & wallet using hardcoded RPC and private key (replace for real use)
      const provider = new ethers.JsonRpcProvider(this.RPC_URL);
      const wallet = new ethers.Wallet(this.PRIVATE_KEY, provider);

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
    }
  }

  // very simple constructor arg parser:
  // - splits on commas not inside quotes
  // - trims whitespace and removes surrounding single or double quotes
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
