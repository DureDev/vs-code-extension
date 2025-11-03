const vscode = acquireVsCodeApi();

const select = document.getElementById('network');
const btnGen = document.getElementById('generate');
const btnComp = document.getElementById('compile');
const btnFix = document.getElementById('fixError');
const btnAnalyze = document.getElementById('analyze');
const btnDeploy = document.getElementById('deploy');
const promptBox = document.getElementById('prompt');
const output = document.getElementById('output');
const constructorContainer = document.getElementById('constructorContainer');
const constructorArgsInput = document.getElementById('constructorArgs');

(function init() {
  const savedNetwork = "${savedNetwork}";
  if (savedNetwork && savedNetwork !== "") {
    btnGen.disabled = false;
    if (savedNetwork !== "SOLANA") {
      constructorContainer.style.display = "block";
    }
  }
})();

select.addEventListener('change', () => {
  const network = select.value;
  vscode.postMessage({ type: 'selectNetwork', network });
  constructorContainer.style.display = (network === 'SOLANA' || network === '') ? 'none' : 'block';
});

btnGen.addEventListener('click', () => {
  vscode.postMessage({ type: 'generate', prompt: promptBox.value });
  output.textContent = 'Preprocessing...';
});

btnComp.addEventListener('click', () => {
  vscode.postMessage({ type: 'compile' });
  output.textContent = 'Compiling...';
});

btnFix.addEventListener('click', () => {
  vscode.postMessage({ type: 'fixError' });
  output.textContent = 'Fixing error...';
});

btnAnalyze.addEventListener('click', () => {
  vscode.postMessage({ type: 'analyze' });
  output.textContent = 'Analyzing...';
});

btnDeploy.addEventListener('click', () => {
  const args = constructorArgsInput.value || '';
  vscode.postMessage({ type: 'deploy', constructorArgs: args });
  output.textContent = 'Deploying...';
});

window.addEventListener('message', (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'networkSelected':
      btnGen.disabled = false;
      constructorContainer.style.display = msg.network === 'SOLANA' ? 'none' : 'block';
      break;
    case 'preprocessTyping':
      output.textContent = msg.text;
      break;
    case 'status':
      output.textContent = msg.message;
      break;
    case 'error':
      output.textContent = msg.error;
      break;
    case 'enableCompileOnly':
      btnComp.disabled = false; btnFix.disabled = true; btnAnalyze.disabled = true;
      break;
    case 'enableFixError':
      btnFix.disabled = false; btnAnalyze.disabled = true;
      break;
    case 'enableAnalyze':
      btnAnalyze.disabled = false; btnFix.disabled = true;
      break;
    case 'enableDeploy':
      btnDeploy.disabled = false;
      break;
    case 'analysis':
      output.textContent = msg.text;
      break;
  }
});
