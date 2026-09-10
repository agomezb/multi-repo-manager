// media/cli.js - Client script for Git Project Explorer CLI webview
(function () {
  'use strict';

  var vscode;
  try {
    vscode = acquireVsCodeApi();
  } catch (e) {
    console.error('Failed to acquire VS Code API:', e);
  }

  // Global client error logging
  window.onerror = function (msg, url, line) {
    console.error('Webview client error:', msg, url, line);
    if (vscode) {
      try {
        vscode.postMessage({ type: 'clientError', error: msg + ' (' + url + ':' + line + ')' });
      } catch (err) {}
    }
  };

  var cmdInput = document.getElementById('cmdInput');
  var runBtn = document.getElementById('runBtn');
  var repoList = document.getElementById('repoList');
  var output = document.getElementById('output');
  var clearBtn = document.getElementById('clearBtn');
  var selectAllBtn = document.getElementById('selectAllBtn');
  var deselectAllBtn = document.getElementById('deselectAllBtn');
  var chipsContainer = document.getElementById('chipsContainer');

  var currentRepos = [];

  // Chip click: populate input and run immediately
  if (chipsContainer) {
    chipsContainer.addEventListener('click', function (e) {
      var target = e.target;
      if (target && target.classList.contains('chip')) {
        var cmd = target.getAttribute('data-cmd');
        if (cmd) {
          cmdInput.value = cmd;
          runCommand();
        }
      }
    });
  }

  // Enter key in input triggers run
  if (cmdInput) {
    cmdInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runCommand();
      }
    });
  }

  // Run button click
  if (runBtn) {
    runBtn.addEventListener('click', function () {
      runCommand();
    });
  }

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      output.innerHTML = 'Console cleared.';
    });
  }

  // Select all checkboxes
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', function () {
      var cbs = document.querySelectorAll('#repoList input[type="checkbox"]');
      for (var i = 0; i < cbs.length; i++) {
        cbs[i].checked = true;
      }
    });
  }

  // Deselect all checkboxes
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', function () {
      var cbs = document.querySelectorAll('#repoList input[type="checkbox"]');
      for (var i = 0; i < cbs.length; i++) {
        cbs[i].checked = false;
      }
    });
  }

  function getSelectedRepoPaths() {
    var cbs = document.querySelectorAll('#repoList input[type="checkbox"]:checked');
    var paths = [];
    for (var i = 0; i < cbs.length; i++) {
      paths.push(cbs[i].value);
    }
    return paths;
  }

  function runCommand() {
    var command = cmdInput.value.trim();
    if (!command) {
      output.innerHTML = '<div style="color: var(--error-fg);">Please enter a command to execute.</div>';
      return;
    }

    var allCbs = document.querySelectorAll('#repoList input[type="checkbox"]');
    var selectedPaths = [];
    if (allCbs.length > 0) {
      selectedPaths = getSelectedRepoPaths();
      if (selectedPaths.length === 0) {
        output.innerHTML = '<div style="color: var(--error-fg);">Please select at least one repository checkbox above.</div>';
        return;
      }
    }

    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span> Running';

    if (vscode) {
      vscode.postMessage({
        type: 'execute',
        command: command,
        selectedRepoPaths: selectedPaths
      });
    }
  }

  // Listen for messages from extension host
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg) return;

    switch (msg.type) {
      case 'setRepositories': {
        currentRepos = msg.repositories || [];
        renderRepoList(currentRepos);
        break;
      }
      case 'executionStart': {
        output.innerHTML = '';
        var line = document.createElement('div');
        line.style.opacity = '0.7';
        line.style.marginBottom = '6px';
        line.textContent = '>>> $ ' + msg.command + ' (Executing on ' + msg.repoCount + ' repositories...)\n';
        output.appendChild(line);
        break;
      }
      case 'executionFinish': {
        runBtn.disabled = false;
        runBtn.innerHTML = 'Run';

        if (!msg.results || msg.results.length === 0) {
          break;
        }

        for (var i = 0; i < msg.results.length; i++) {
          var res = msg.results[i];
          var block = document.createElement('div');
          block.className = 'repo-log-block ' + (res.success ? 'success' : 'error');

          var title = document.createElement('div');
          title.className = 'log-title ' + (res.success ? '' : 'error');
          title.textContent = '[' + res.repoName + '] ' + (res.success ? '✓' : '✗') + ' (' + res.durationMs + 'ms)';
          block.appendChild(title);

          if (res.stdout && res.stdout.trim()) {
            var out = document.createElement('div');
            out.className = 'log-stdout';
            out.textContent = res.stdout.trim();
            block.appendChild(out);
          }

          if (res.stderr && res.stderr.trim()) {
            var err = document.createElement('div');
            err.className = 'log-stderr';
            err.textContent = res.stderr.trim();
            block.appendChild(err);
          }

          output.appendChild(block);
        }
        output.scrollTop = output.scrollHeight;
        break;
      }
      case 'log': {
        var item = document.createElement('div');
        if (msg.isError) item.style.color = 'var(--error-fg)';
        item.textContent = msg.text;
        output.appendChild(item);
        break;
      }
    }
  });

  function renderRepoList(repos) {
    if (!repos || repos.length === 0) {
      repoList.innerHTML = '<div style="opacity: 0.7; font-size: 11px; padding: 4px;">No Git repositories found in workspace. <a href="#" id="retryScanLink" style="color: var(--vscode-textLink-foreground);">Scan again</a></div>';
      var retryLink = document.getElementById('retryScanLink');
      if (retryLink && vscode) {
        retryLink.addEventListener('click', function (e) {
          e.preventDefault();
          repoList.innerHTML = '<div style="opacity: 0.6; font-size: 11px;">Scanning for repositories...</div>';
          vscode.postMessage({ type: 'refreshRepos' });
        });
      }
      return;
    }

    repoList.innerHTML = '';
    for (var i = 0; i < repos.length; i++) {
      var repo = repos[i];
      var item = document.createElement('div');
      item.className = 'repo-item';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'repo-' + i;
      cb.value = repo.path;
      cb.checked = true;

      var label = document.createElement('label');
      label.htmlFor = 'repo-' + i;
      label.innerHTML = '<span><strong>' + escapeHtml(repo.name) + '</strong></span> <span class="branch-tag">(' + escapeHtml(repo.branch) + ')</span>';

      item.appendChild(cb);
      item.appendChild(label);
      repoList.appendChild(item);
    }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Signal ready to the extension immediately
  if (vscode) {
    vscode.postMessage({ type: 'ready' });
  }
})();
