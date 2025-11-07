const vscode = acquireVsCodeApi();

const select = document.getElementById('network');
const networkSelector = document.getElementById('networkSelector');
const btnGen = document.getElementById('generate');
const btnComp = document.getElementById('compile');
const btnFix = document.getElementById('fixError');
const btnAnalyze = document.getElementById('analyze');
const btnDeploy = document.getElementById('deploy');
const promptBox = document.getElementById('prompt');
const conversationContainer = document.getElementById('conversation-container');
const constructorContainer = document.getElementById('constructorContainer');
const constructorArgsInput = document.getElementById('constructorArgs');

// Track current conversation entry and assistant message being typed
let currentConversationEntry = null;
let currentAssistantMessage = null;
let hasUserInteractedWithNetwork = false;

// Auto-resize textarea (Cursor AI style)
function autoResizeTextarea() {
  promptBox.style.height = 'auto';
  const newHeight = Math.max(32, Math.min(promptBox.scrollHeight, 300)); // min 32px, max 300px
  promptBox.style.height = newHeight + 'px';
}

promptBox.addEventListener('input', () => {
  autoResizeTextarea();
  updateGenerateButtonState();
});

// Update generate button state
function updateGenerateButtonState() {
  const hasText = promptBox.value.trim().length > 0;
  btnGen.disabled = !hasText;
}

// Keyboard shortcuts (Cursor AI style)
promptBox.addEventListener('keydown', (e) => {
  // Enter to send (if not holding Shift)
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!btnGen.disabled && promptBox.value.trim()) {
      sendGenerate();
    }
  }
  // Cmd/Ctrl+Enter always sends
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    if (!btnGen.disabled && promptBox.value.trim()) {
      sendGenerate();
    }
  }
});

// Send generate function
function sendGenerate() {
  const prompt = promptBox.value.trim();
  if (!prompt) return;
  
  vscode.postMessage({ type: 'generate', prompt: prompt });
  promptBox.value = '';
  autoResizeTextarea();
  updateGenerateButtonState();
  // User message will be added by the extension
}

// Network selector is handled by the hidden select overlay

// Update network selector text
function updateNetworkSelectorText(options = {}) {
  const { force = false } = options;
  const networkText = document.querySelector('.network-text');
  if (!networkText) {
    return;
  }

  if (!force && !hasUserInteractedWithNetwork) {
    networkText.textContent = 'Network';
    return;
  }

  const selectedOption = select.options[select.selectedIndex];
  const label = selectedOption ? selectedOption.textContent.trim() : 'Network';
  networkText.textContent = label || 'Network';
}

select.addEventListener('change', () => {
  const network = select.value;
  hasUserInteractedWithNetwork = network !== '';
  updateNetworkSelectorText({ force: hasUserInteractedWithNetwork });
  vscode.postMessage({ type: 'selectNetwork', network });
  constructorContainer.style.display = (network === 'SOLANA' || network === '') ? 'none' : 'block';
  updateGenerateButtonState();
});

btnGen.addEventListener('click', () => {
  if (!btnGen.disabled && promptBox.value.trim()) {
    sendGenerate();
  }
});

(function init() {
  select.value = '';
  constructorContainer.style.display = 'none';
  hasUserInteractedWithNetwork = false;
  updateNetworkSelectorText();
  autoResizeTextarea();
  updateGenerateButtonState();

  setTimeout(() => {
    vscode.postMessage({ type: 'selectNetwork', network: '' });
  }, 0);
})();

btnComp.addEventListener('click', () => {
  vscode.postMessage({ type: 'compile' });
  // User message will be added by the extension
});

btnFix.addEventListener('click', () => {
  vscode.postMessage({ type: 'fixError' });
  // User message will be added by the extension
});

btnAnalyze.addEventListener('click', () => {
  vscode.postMessage({ type: 'analyze' });
  // User message will be added by the extension
});

btnDeploy.addEventListener('click', () => {
  const args = constructorArgsInput.value || '';
  vscode.postMessage({ type: 'deploy', constructorArgs: args });
  // User message will be added by the extension
});

// Helper function to format markdown-like text
function formatMessage(text) {
  if (!text) return '';
  
  // Escape HTML first to prevent XSS
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };
  
  // Split by lines to process lists better
  const lines = text.split('\n');
  const formattedLines = [];
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle headers
    if (line.startsWith('### ')) {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      formattedLines.push(`<h3>${escapeHtml(line.substring(4))}</h3>`);
      continue;
    } else if (line.startsWith('## ')) {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      formattedLines.push(`<h2>${escapeHtml(line.substring(3))}</h2>`);
      continue;
    } else if (line.startsWith('# ')) {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      formattedLines.push(`<h1>${escapeHtml(line.substring(2))}</h1>`);
      continue;
    }
    
    // Handle list items
    if (line.match(/^[•\-]\s/) || line.match(/^\d+\.\s/)) {
      if (!inList) {
        formattedLines.push('<ul>');
        inList = true;
      }
      const listContent = line.replace(/^[•\-]\s/, '').replace(/^\d+\.\s/, '');
      formattedLines.push(`<li>${escapeHtml(listContent)}</li>`);
      continue;
    }
    
    // Close list if we were in one
    if (inList && line === '') {
      formattedLines.push('</ul>');
      inList = false;
      continue;
    }
    
    if (inList) {
      formattedLines.push('</ul>');
      inList = false;
    }
    
    // Handle code blocks
    if (line.startsWith('```')) {
      const lang = line.substring(3).trim();
      let codeBlock = '';
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeBlock += escapeHtml(lines[i]) + '\n';
        i++;
      }
      formattedLines.push(`<pre><code>${codeBlock.trim()}</code></pre>`);
      continue;
    }
    
    // Regular paragraph
    if (line) {
      let processedLine = escapeHtml(line);
      // Process inline formatting
      processedLine = processedLine
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      formattedLines.push(`<p>${processedLine}</p>`);
    } else {
      formattedLines.push('<br>');
    }
  }
  
  // Close any open list
  if (inList) {
    formattedLines.push('</ul>');
  }
  
  return formattedLines.join('');
}

// Create a new conversation entry (user prompt + assistant response)
function createConversationEntry(userPrompt) {
  const entryDiv = document.createElement('div');
  entryDiv.className = 'conversation-entry';
  
  // User prompt box (collapsible) - only create if there's a prompt
  if (userPrompt && userPrompt.trim()) {
    const userHeader = document.createElement('div');
    userHeader.className = 'message user';
    const promptBox = document.createElement('div');
    promptBox.className = 'prompt-box';
    
    const promptText = document.createElement('div');
    promptText.className = 'prompt-text';
    promptText.textContent = userPrompt;
    
    // Add click handler to toggle expand/collapse
    promptBox.addEventListener('click', () => {
      promptBox.classList.toggle('expanded');
    });
    
    promptBox.appendChild(promptText);
    userHeader.appendChild(promptBox);
    entryDiv.appendChild(userHeader);
  }
  
  // Assistant response container
  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'message assistant';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  assistantDiv.appendChild(contentDiv);
  
  entryDiv.appendChild(assistantDiv);
  conversationContainer.appendChild(entryDiv);
  
  return { entry: entryDiv, assistantContent: contentDiv };
}

// Add user message - Cursor style: creates new conversation entry
function addUserMessage(text) {
  // Create new conversation entry
  const conversation = createConversationEntry(text);
  currentConversationEntry = conversation.entry;
  currentAssistantMessage = conversation.assistantContent;
  scrollToBottom();
}

// Add assistant message
function addAssistantMessage(text) {
  if (!currentConversationEntry) {
    // If no user message, create entry with empty prompt
    const conversation = createConversationEntry('');
    currentConversationEntry = conversation.entry;
    currentAssistantMessage = conversation.assistantContent;
  }
  
  if (currentAssistantMessage) {
    currentAssistantMessage.innerHTML = formatMessage(text);
  }
  scrollToBottom();
  
  return currentAssistantMessage;
}

// Update assistant message (for typing effect)
function updateAssistantMessage(text) {
  if (!currentAssistantMessage) {
    // If no conversation entry exists, create one
    if (!currentConversationEntry) {
      const conversation = createConversationEntry('');
      currentConversationEntry = conversation.entry;
      currentAssistantMessage = conversation.assistantContent;
    }
  }
  
  if (currentAssistantMessage) {
    currentAssistantMessage.innerHTML = formatMessage(text);
    scrollToBottom();
  }
}

// Complete assistant message
function completeAssistantMessage(text) {
  if (currentAssistantMessage) {
    currentAssistantMessage.innerHTML = formatMessage(text);
  } else {
    addAssistantMessage(text);
  }
  // Reset for next conversation
  currentConversationEntry = null;
  currentAssistantMessage = null;
  scrollToBottom();
}

// Scroll to bottom of conversation
function scrollToBottom() {
  conversationContainer.scrollTop = conversationContainer.scrollHeight;
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'networkSelected':
      select.value = msg.network || '';
      hasUserInteractedWithNetwork = msg.network !== '';
      constructorContainer.style.display = (msg.network === 'SOLANA' || msg.network === '') ? 'none' : 'block';
      updateNetworkSelectorText({ force: hasUserInteractedWithNetwork });
      updateGenerateButtonState();
      break;
    case 'userMessage':
      addUserMessage(msg.text);
      break;
    case 'assistantMessage':
      completeAssistantMessage(msg.text);
      break;
    case 'assistantMessageStart':
      // Start typing - ensure we have a conversation entry
      if (!currentConversationEntry) {
        const conversation = createConversationEntry('');
        currentConversationEntry = conversation.entry;
        currentAssistantMessage = conversation.assistantContent;
      }
      if (currentAssistantMessage) {
        currentAssistantMessage.innerHTML = '';
      }
      break;
    case 'assistantMessageUpdate':
      updateAssistantMessage(msg.text);
      break;
    case 'assistantMessageComplete':
      completeAssistantMessage(msg.text);
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
  }
});
