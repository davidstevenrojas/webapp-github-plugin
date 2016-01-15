(function(){
  /**
   *
   * @constructor
   */
  var GitHubErrorReporter = function() {
    this.errDialog = null;
  };

  var COMMIT_STATUS_TITLE = 'Commit status';

  /**
   * Shows an error dialog.
   * @param {string} title The title of the dialog.
   * @param {string} bodyHtml The HTML content of the dialog.
   * @param {string|object[]} buttonConfiguration The button configuration
   */
  GitHubErrorReporter.prototype.showError = function(title, bodyHtml, buttonConfiguration) {
    var dialog = this.getErrorDialog(buttonConfiguration);
    dialog.setTitle(title);
    var dialogElement = dialog.getElement();
    dialogElement.style.textAlign = 'center';
    dialogElement.innerHTML = bodyHtml;
    dialog.show();
  };

  /**
   * Hides the error dialog
   */
  GitHubErrorReporter.prototype.hide = function () {
    this.errDialog.hide();
  };

  /**
   * Create and return the commit error dialog.
   *
   * @param {Object} buttonConfiguration The button configuration
   * @return {sync.api.Dialog} The error message dialog.
   */
  GitHubErrorReporter.prototype.getErrorDialog = function(buttonConfiguration) {
    if (!this.errDialog) {
      this.errDialog = workspace.createDialog();
    }
    this.errDialog.setButtonConfiguration(buttonConfiguration);
    return this.errDialog;
  };

  var errorReporter = new GitHubErrorReporter();

  /**
   * The Log out action for Github
   *
   * @constructor
   */
  function LogOutAction (editor) {
    this.editor = editor;
  }
  goog.inherits(LogOutAction, sync.actions.AbstractAction);

  /** @override */
  LogOutAction.prototype.renderLargeIcon = function() {
    return null;
  };

  /** @override */
  LogOutAction.prototype.renderSmallIcon = function() {
    return null;
  };

  /**
   * Constructs and returns the log-out confirmation dialog.
   *
   * @return {sync.api.Dialog} The dialog used to confirm teh log-out action.
   */
  LogOutAction.prototype.getDialog = function() {
    if (!this.dialog) {
      this.dialog = workspace.createDialog();
      this.dialog.setTitle('Log out');
      this.dialog.setButtonConfiguration([{key: 'yes', caption: 'Logout'}, {key: 'no', caption: 'Cancel'}]);

      var dialogHtml = '<div>';
      dialogHtml += '<div>Are you sure you want to log-out?<br/>All uncommitted changes will be lost.</div>';
      dialogHtml += '</div>';

      this.dialog.getElement().innerHTML = dialogHtml;
    }
    return this.dialog;
  };

  /**
   * Called when the Logout button is clicked
   *
   * @override
   */
  LogOutAction.prototype.actionPerformed = function() {
    this.dialog = this.getDialog();

    this.dialog.onSelect(goog.bind(function (actionName) {
      if (actionName == 'yes') {
        clearGithubCredentials();
        this.editor.setDirty(false);
        window.location.reload();
      }

    }, this));

    this.showDialog();
    this.dialog.setPreferredSize(320, 185);
  };

  /** @override */
  LogOutAction.prototype.getDisplayName = function() {
    return "Logout";
  };

  /** @override */
  LogOutAction.prototype.getDescription = function() {
    return "Github Logout";
  };

  /**
   * Shows the logout dialog.
   */
  LogOutAction.prototype.showDialog = function() {
    this.dialog.show();
  };

  /**
   * The commit action for GitHub.
   *
   * @param {sync.api.Editor} editor The editor on which this action applies.
   * @param {object} github The GitHub repo access object.
   * @param {object} fileLocation An object describind the location of the opened file.
   *
   * @constructor
   */
  var CommitAction = function(editor, github, fileLocation) {
    sync.actions.AbstractAction.call(this);
    this.editor = editor;

    this.github = github;
    this.repo = github.getRepo(fileLocation.user, fileLocation.repo);
    this.branch = fileLocation.branch;
    this.filePath = fileLocation.filePath;

    this.dialog = null;
    this.iconWrapper = null;

    this.status = 'none';
    this.githubToolbarButton = null;
    this.statusTimeout = null;

    /**
     * The list of branches for the current document's owner and repository
     * @type {Array<string>}
     */
    this.branchesList = null;
  };
  goog.inherits(CommitAction, sync.actions.AbstractAction);

  /**
   * The key stroke which should invoke the commit action.
   * @type {string}
   */
  CommitAction.SHORTCUT = 'M1 S';

  /**
   * The id of the commit action used by the actions manager.
   * @type {string}
   */
  CommitAction.ID = 'Github/Commit';

  /**
   * Gets the content of the file asynchronously.
   *
   * @param {function(string)} cb The callback that will receive the file content.
   */
  CommitAction.prototype.getContent = function(cb) {
    this.editor.getXmlContent(cb);
  };

  /**
   * Sets the toolbarButton
   * @param {Element} toolbarButton The github toolbar button
   */
  CommitAction.prototype.setGithubToolbarButton = function (toolbarButton) {
    this.githubToolbarButton = toolbarButton;
  };

  /** @override */
  CommitAction.prototype.renderLargeIcon = function() {
    this.iconWrapper = goog.dom.createDom('div', 'github-icon-wrapper',
      goog.dom.createDom('div', 'github-icon-octocat-large'));
    return this.iconWrapper;
  };

  /** @override */
  CommitAction.prototype.renderSmallIcon = function() {
    this.iconWrapper = goog.dom.createDom('div', 'github-icon-wrapper',
      goog.dom.createDom('div', 'github-icon-octocat-small'));
    return this.iconWrapper;
  };


  /** @override */
  CommitAction.prototype.getDisplayName = function() {
    return "Commit";
  };

  /** @override */
  CommitAction.prototype.getDescription = function() {
    return "Commit on GitHub";
  };

  /**
   * Shows the dialog.
   */
  CommitAction.prototype.showDialog = function() {
    this.dialog.show();
  };


  /**
   * Constructs and returns the dialog.
   *
   * @return {sync.api.Dialog} The dialog used to collect commit info.
   */
  CommitAction.prototype.getDialog = function() {
    if (!this.dialog) {
      this.dialog = workspace.createDialog();
      this.dialog.setPreferredSize(500, 305);
      this.dialog.setButtonConfiguration([{key: 'ok', caption: 'Commit'}, {key: 'cancel', caption: 'Cancel'}]);
    }

    // Update the innerHTML every time because it depends on this.branch which might change
    this.dialog.setTitle('Commit on GitHub');

    var dialogHtml = '<div class="github-commit-dialog">';
    dialogHtml +=
        '<div class="gh-commit-message-details">' +
          '<label>Commit Message: <textarea class="github-input" name="message" autofocus="autofocus"></textarea></label>' +
          '<select class="commit-history"></select>' +
        '</div>';
    dialogHtml += '<div><label>Commit on branch:<div class="branches-list github-commit-combo-list"><input autocapitalize="none" autocorrect="off" ' +
      'class="github-input" name="branch" type="text" value="' + this.branch + '"/></div></label></div>';

    var checked = localStorage.getItem('github.shortcut');
    if (checked && checked == 'true' || !checked) {
      checked = 'checked';
    } else {
      checked = '';
    }
    var hotKey = goog.userAgent.MAC || goog.userAgent.IPAD || goog.userAgent.IPHONE ? "&#8984;" : "Ctrl";

    dialogHtml +=
          '<label class="github-commit-shortcut">' +
            '<input id="gh-commit-sh-check" tabIndex="-1" type="checkbox" ' + checked + '/> Open this dialog with ' + hotKey + '+S' +
          '</label>';

    dialogHtml += '</div>';

    var el = this.dialog.getElement();
    el.innerHTML = dialogHtml;

    if (this.branchesList) {
      displayBranchesSelect.call(this);
    } else {
      var repo = github.getRepo(fileLocation.user, fileLocation.repo);
      repo.getBranches(goog.bind(function (err, branches) {
        if (!err && this.dialog && this.dialog.isVisible()) {
          branches = branches.map(function (branch) {
            return {value: branch, title: branch};
          });

          this.branchesList = branches;
          displayBranchesSelect.call(this);
        }
      }, this));
    }

    var shortcutCheckbox = this.dialog.getElement().querySelector('#gh-commit-sh-check');
    goog.events.listen(shortcutCheckbox, goog.events.EventType.CLICK, goog.bind(function (event) {
      // Update the shortcut
      setCommitActionShortcut(this.editor, event.target.checked ? CommitAction.SHORTCUT : null);

      // Save the change in localstorage to make it persistent
      try {
        localStorage.setItem('github.shortcut', event.target.checked);
      } catch (e) {}
    }, this));

    var ctrlEnterCommitKey = goog.events.listen(this.dialog.getElement().querySelector('textarea[name=message]'), goog.events.EventType.KEYUP,
        goog.bind(function (e) {
          if (e.keyCode === goog.events.KeyCodes.ENTER && e.ctrlKey) {
            goog.events.unlistenByKey(ctrlEnterCommitKey);
            e.stopPropagation();
            this.dialog.dispatchEvent(new goog.ui.Dialog.Event('ok', 'Ok'));
            this.dialog.hide();
          }
        }, this));

    this.setupCommitHistory_();

    return this.dialog;

    function displayBranchesSelect() {
      var container = this.dialog.getElement().querySelector('.branches-list');
      container.innerHTML = '';

      var branchEditableCombo = new sync.view.EditableCombo(this.branchesList);

      branchEditableCombo.render(container);
      branchEditableCombo.setValue(this.branch);
    }
  };

  /**
   * Adds a commit history select element to the commit dialog.
   * @private
   */
  CommitAction.prototype.setupCommitHistory_ = function () {
    var commitHistory = localStorage.getItem('github.commit.history');
    commitHistory = commitHistory ? JSON.parse(commitHistory) : null;

    var commitHistoryElement = this.dialog.getElement().querySelector('.commit-history');
    if (commitHistory && commitHistory.length > 0) {
      commitHistoryElement.style.display = 'initial';
      commitHistoryElement.innerHTML = '';

      // Adding an id to the first option to make sure it's displayed as the first
      // selected element even if it has display: none
      commitHistoryElement.add(goog.dom.createDom('option', {'id': 'commit-history-msg'},
          'Choose a previously entered comment'));
      for (var i = 0; i < commitHistory.length; i++) {
        // The value of option must be a string otherwise an exception is thrown
        commitHistoryElement.add(goog.dom.createDom('option', null, "" + commitHistory[i]));
      }

      goog.events.listen(commitHistoryElement, goog.events.EventType.CHANGE, goog.bind(function (e) {
        if (commitHistoryElement.selectedIndex !== 0) {
          this.dialog.getElement().querySelector('textarea[name=message]').value =
              commitHistoryElement.options[commitHistoryElement.selectedIndex].text;
        }
      }, this));
    } else {
      commitHistoryElement.style.display = 'none';
    }
  };

  /**
   * Tries to commit if all the details needed for a commit were gathered.
   *
   * @param {object} ctx The context of this commit.
   * @param {function(object,object=)} cb Called after the commit was attempted with the
   * error and/or success values.
   */
  CommitAction.prototype.tryCommit = function(ctx, cb) {
    var self = this;
    if (ctx.branchExists && ctx.hasOwnProperty('content')) {
      this.getLatestFileVersion(ctx.branch, self.repo, function (err, latestFile) {
        // If this is a new branch or the document branch
        if (!ctx.branchAlreadyExists) {
          if (err) {
            return cb(err);
          }

          if (latestFile.sha === documentSha) {
            self.repo.commitToHead(ctx.branch, self.filePath, ctx.content, ctx.message, function(err, commit) {
              if (err) {
                return cb(err);
              }

              // Have committed, we save the document sha and head for the next commits
              // The document is now on the committed branch
              documentSha = commit.blobSha;
              documentCommit = commit.sha;
              initialDocument = ctx.content;

              self.branch = ctx.branch;
              Github.apiRequest('GET', commit.head.url, null, function (err, response) {
                if (err) {
                  // If there was an error with getting the headUrl we wont propagate it further
                  // because the commit succeeded. And we just won't have a url to the successful commit
                  return cb();
                }
                cb(null, {
                  branch: self.branch,
                  headUrl: response.html_url
                });
              });
            });
          } else {
            self.startMergingCommit_(self.repo, ctx, latestFile.content, cb);
          }
        } else {
          // If the file doesn't exist on the different branch we can just create it without merging anything
          if (err === "not found") {
            self.repo.createFile(self.ctx.branch, self.filePath, self.ctx.content, self.ctx.message, function (err, result) {
              if (err) {
                return cb(err);
              }
              // Have committed, we save the document sha and head for the next commits
              // The document is now on the committed branch
              documentSha = result.content.sha;
              documentCommit = result.commit.sha;
              initialDocument = ctx.content;

              self.branch = ctx.branch;
              cb(null, {
                branch: self.branch,
                headUrl: result.commit.html_url
              });
            });
          } else if (err) {
            cb(err);
          } else {
            // Committing on a different branch is an action which the user has to confirm
            // Getting the head so we can show the user a diff, so he can make an informed decision
            self.startMergingCommit_(self.repo, ctx, latestFile.content, cb, true);
          }
        }
      });
    }
  };

  /**
   * Starts a commit, which merges with the latest content before it starts, defined by the given context
   * @param {Github.Repository} repo The repo to commit on
   * @param {{branch: string, message: string, content: string}} ctx The commit context
   * @param {string} latestContent The latest contents of the opened file taken from github
   * @param {function} cb The method to call on result
   * @param {boolean} differentBranch If true it means this commit is done on a branch different from the current
   * open documents branch.
   * @private
   */
  CommitAction.prototype.startMergingCommit_ = function (repo, ctx, latestContent, cb, differentBranch) {
    var self = this;

    var mergingComponents = {
      ancestor: initialDocument, // The current document in the state it was when we initially opened it
      left: ctx.content, // Left is the current document with our changes
      right: latestContent // Right is the latest version of the document from GitHub
    };

    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState == 4 && xhr.status == 200) {
        // 200 - Auto-merge completed
        var mergedFile = this.responseText;
        var resultType = this.getResponseHeader('OXY-Merge-Result');

        if (resultType === 'CLEAN') {
          repo.createCommit(ctx.branch, self.filePath, mergedFile, ctx.message,
            goog.bind(self.onCommitCreated_, self, repo, differentBranch, resultType, cb));
        } else {
          repo.createCommit(ctx.branch, self.filePath, ctx.content, ctx.message, function (err, commit) {
            if (err) {return cb(err);}

            repo.compare(commit.head.sha, commit.sha, function (err, diff) {
              if (err) {return cb(err);}
              cb({
                error: 409,
                message: 'The file you want to commit has been edited since you opened it.',
                diff: diff,
                commit: commit,
                autoMergeResult: {
                  resultType: resultType,
                  differentBranch: differentBranch
                }
              });
            });
          });
        }
      } else if (xhr.readyState == 4 && xhr.status >= 100) {
        // If the merge failed, just commit without auto-merging and have the user choose what to do to solve the conflicts
        repo.createCommit(ctx.branch, self.filePath, ctx.content, ctx.message, function (err, commit) {
          if (err) {return cb(err);}

          repo.compare(commit.head.sha, commit.sha, function (err, diff) {
            if (err) {return cb(err);}
            cb({
              error: 409,
              message: 'The file you want to commit has been edited since you opened it.',
              diff: diff,
              commit: commit,
              autoMergeResult: {
                differentBranch: differentBranch
              }
            });
          });
        });
      }
    };
    xhr.open('POST', '../plugins-dispatcher/github-oauth/github/github_commit_merge');
    xhr.send(JSON.stringify(mergingComponents));
  };

  /**
   * Called when a file commit is created.
   *
   * @param {Github.Repository} repo The repo to compare on.
   * @param {boolean} differentBranch If true it means this commit is done on a branch different from the current
   *                  open documents branch.
   * @param {string} resultType The way the merging completed.
   * @param {function} cb The method to call on result
   * @param {object} err The error object.
   * @param {object} commit The created commit.
   * @private
   */
  CommitAction.prototype.onCommitCreated_ = function (repo, differentBranch, resultType, cb, err, commit) {
    if (err) {return cb(err);}

    repo.compare(documentCommit, commit.sha, function (err, diff) {
      if (err) {return cb(err);}
      cb({
        error: 409,
        message: 'The file you want to commit has been edited since you opened it.',
        diff: diff,
        commit: commit,
        autoMergeResult: {
          resultType: resultType,
          differentBranch: differentBranch
        }
      });
    });
  };

  /**
   * Finalizes a commit (updates the document to the new head of the given commit)
   * @param {Github.Repository} repo The repository on which this commit was pushed
   * @param {string} branch The branch this commit was on
   * @param {string} committedContent The commit file string.
   * @param {object} err The commit error
   * @param {{sha: string, head: object, branch: string}} commitResult The commitResult
   * @private
   */
  CommitAction.prototype.finalizeCommit_ = function (repo, branch, committedContent, err, commitResult) {
    var self = this;
    if (!err) {
      // Have committed, we save the document sha and head for the next commits
      // The document is now on the commited branch
      documentSha = commitResult.blobSha;
      documentCommit = commitResult.sha;
      initialDocument = committedContent;

      this.branch = branch;
      this.repo = repo;

      Github.apiRequest('GET', commitResult.head.url, null, function (err, response) {
        var msg;
        if (err) {
          msg = 'Commit successful on branch ' + branch;
        } else {
          msg = 'Commit successful on branch <a target="_blank" href="' + response.html_url + '">' + branch + '</a>';
        }
        self.setStatus('success');
        errorReporter.showError('Commit result', msg, sync.api.Dialog.ButtonConfiguration.OK);

        goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
          goog.bind(self.handleReloadOnNewBranch, self, true));
      });
    } else {
      this.setStatus('none');
      errorReporter.showError(COMMIT_STATUS_TITLE, 'Commit failed', sync.api.Dialog.ButtonConfiguration.OK);
    }
  };

  /**
   * Gets the latest version for the current file
   * @param {string} branch The branch on which we'll make the request
   * @param {Github.Repository} repo The repository on which to check
   * @param {function} cb The method to call on result
   * @private
   */
  CommitAction.prototype.getLatestFileVersion = function (branch, repo, cb) {
    repo.getContents(branch, this.filePath, function (err, file) {
      if (err) {return cb(err);}

      cb(null, {
        sha: file.sha,
        content: sync.util.decodeB64(file.content)
      })
    });
  };

  /**
   * Perform the actual commit.
   *
   * @param {function(object,object=)} cb Callback after the commit is performed.
   * @param {object} ctx The context of the commit.
   */
  CommitAction.prototype.performCommit = function(ctx, cb) {
    var self = this;
    this.setStatus('loading');

    // Obtain the content of the current file.
    this.getContent(goog.bind(function(err, content) {
      ctx.content = content;
      this.tryCommit(ctx, cb);
    }, this));

    // Create the branch if it does not exist.
    if (ctx.branch && ctx.branch !== this.branch) {
      ctx.branchExists = false;
      this.createBranch_(self.repo, ctx, function (err) {
        if (!err) {
          self.branch = ctx.branch;
          ctx.branchExists = true;
          self.tryCommit(ctx, cb);
        } else{
          ctx.branchExists = false;
          cb(err);
        }
      });
    } else {
      ctx.branchExists = true;
    }
  };

  /**
   * Creates a new branch
   * @param {Github.Repository} repo The repository on which to create a new branch
   * @param {object} ctx The context of the commit
   * @param {function(object)} cb The method to call on result
   * @private
   */
  CommitAction.prototype.createBranch_ = function (repo, ctx, cb) {
    repo.branch(this.branch, ctx.branch, goog.bind(function(err) {
      err = this.getBranchingError_(err, ctx);
      if (err && err.error === 404) {
        // Maybe this was a commit ref instead of a branch ref. Let's try.
        repo.createRef({
          "ref": "refs/heads/" + ctx.branch,
          "sha": this.branch
        }, goog.bind(function(err) {
          err = this.getBranchingError_(err, ctx);
          cb(err);
        }, this));
      } else {
        cb(err);
      }
    }, this));
  };

  /**
   * Function that returns the error object that occurred during branch creation.
   * @param {object<{err: number, request: object}>} err
   * @param {object} ctx The context of the commit
   * @returns {object} The error object or null
   * @private
   */
  CommitAction.prototype.getBranchingError_ = function(err, ctx) {
    if (err) {
      if (err.error == 422 && err.request.responseText.indexOf("Reference already exists") !== -1) {
        // The branch already exists, so we can commit on it.
        err = null;
        ctx.branchAlreadyExists = true;
      }
    }
    return err;
  };

  /**
   * Handles the dialog result.
   *
   * @param {function()} cb Callback after the commit is performed.
   * @param {string} key The result of the dialog.
   */
  CommitAction.prototype.detailsProvided = function(cb, key) {
    var ctx = null;
    if (key == 'ok') {
      var el = this.dialog.getElement();

      var userToNotify = sync.util.getURLParameter('gh-notify');
      var issueNumber = sync.util.getURLParameter('gh-issue');

      var commitMessage = el.querySelector('[name="message"]').value;
      this.addCommitMessageToHistory_(commitMessage);

      ctx = {
        message: (userToNotify ? '@' + userToNotify + ' ' : '') +  // Add @username annotation to let github notify
                                                                   // the user about this commit
                 (issueNumber ? '#' + issueNumber + ' ' : '') +    // Add #issueNumber annotation to let github notify
                                                                   // anyone who is watching the specified issue
                 commitMessage,
        branch: el.querySelector('.branches-list input').value
      };

      // A branch must be provided!
      if (!ctx.branch) {
        ctx.branch = this.branch;
      }

      // save ctx it for the fork and commit button
      this.ctx = ctx;

      this.performCommit(ctx, cb);
    }
    return ctx;
  };

  /**
   * Adds the given commit message to localstorage for later use.
   * @param {string} commitMessage The commit message to add.
   * @private
   */
  CommitAction.prototype.addCommitMessageToHistory_ = function (commitMessage) {
    if (!commitMessage) {
      return;
    }
    var commitHistory = localStorage.getItem('github.commit.history');
    commitHistory = commitHistory ? JSON.parse(commitHistory) : [];

    var commitMessageIndex = commitHistory.indexOf(commitMessage);
    if (commitMessageIndex === -1) {
      commitHistory.unshift(commitMessage);
    } else {
      // If this message was used before we move it at the beginning of the array;
      commitHistory.splice(commitMessageIndex, 1);
      commitHistory.unshift(commitMessage);
    }
    if (commitHistory.length > 10) {
      commitHistory.pop();
    }

    try {
      localStorage.setItem('github.commit.history', JSON.stringify(commitHistory));
    } catch (e) {}
  };

  /**
   * Callback when the commit is finished, successfully or not.
   *
   * @param {function} cb The callback.
   * @param {object} err The error descriptor, if there was an error.
   * @param {{branch: string, headUrl: string}=} result An object containing the branch name on which the commit succeded
   *                      and a url to the commit on github.
   */
  CommitAction.prototype.commitFinalized = function(cb, err, result) {
    if (!err) {
      this.editor.setDirty(false);
      this.setStatus('success');

      if (result) {
        errorReporter.showError(COMMIT_STATUS_TITLE, '<span id="github-commit-success-indicator">Commit successful on branch <a target="_blank" href="' + result.headUrl + '">' + result.branch + '</a></span>', sync.api.Dialog.ButtonConfiguration.OK);
      } else {
        errorReporter.showError(COMMIT_STATUS_TITLE, '<span id="github-commit-success-indicator">Commit successful</span>', sync.api.Dialog.ButtonConfiguration.OK);
      }

      goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT, goog.bind(this.handleReloadOnNewBranch, this, false));
    } else {
      this.handleErrors(err);
    }
    cb();
  };

  /**
   * Navigates to the url of this document on the new branch, created/updated by the latest commit
   *
   * @param {boolean} reloadEvenIfSameBranch If true the page will reload even if the branch did not change.
   * @param {event} e The triggering event
   */
  CommitAction.prototype.handleReloadOnNewBranch = function (reloadEvenIfSameBranch, e) {
    var branch = fileLocation.branch;
    var user = fileLocation.user;

    if (this.branch != branch || (documentOwner != user)) {
      /*
       * currentURl looks like this: http://github.com/owner/repo/branch/blob/path/to/file
       * We will replace owner with documentOwner and branch with this.branch
       * */

      var currentUrl = decodeURIComponent(sync.util.getURLParameter('url'));
      var urlParts = currentUrl.split('/' + encodeURIComponent(branch) + '/');

      var urlSplit = urlParts[0].split('/' + user + '/');
      var firstPart = urlSplit[0] + '/' + documentOwner + '/' + urlSplit[1];

      var newUrl = firstPart + '/' + encodeURIComponent(this.branch) + '/' + urlParts[1];
      var webappUrl = sync.util.serializeQueryString(newUrl, sync.util.getOpenLinkUrlParams());

      this.editor.setDirty(false);
      window.open(webappUrl, "_self");
    } else if (reloadEvenIfSameBranch) {
      this.editor.setDirty(false);
      window.location.reload();
    }
  };

  /**
   * Final destination for errors
   * @param {object} err The error to handle
   * @param {Github.Repository} repo The repository on which the error occured
   */
  CommitAction.prototype.handleErrors = function (err, repo) {
    this.setStatus('none');

    var msg = 'Commit failed!';

    if (err.error == 404) {
      // Not allowed to commit, or the repository does not exist.
      msg = "You do not have rights to commit in the current repository. <br/>Do you want to commit on your own copy of this repository?";

      errorReporter.showError('Commit Error', msg, sync.api.Dialog.ButtonConfiguration.YES_NO);

      var self = this;
      errorReporter.errDialog.dialog.listenOnce(goog.ui.Dialog.EventType.SELECT, function (e) {
        self.forkAndCommit(e);
      });
      return;
    } else if (err.error == 409) {
      var result = err.autoMergeResult;

      var userMessage = 'The commit may have conflicts.';

      if (result && !result.differentBranch) {
        switch (result.resultType) {
          case 'CLEAN':
            userMessage = 'Someone else has edited this file since you last opened it.';
            break;
          case 'WITH_CONFLICTS':
            userMessage = 'Someone else has edited this file since you last opened it and there are conflicts.';
            break;
        }
      } else {
        switch (result.resultType) {
          case 'CLEAN':
            userMessage = 'There is a previous version of this file that is different than the version you are trying to commit.';
            break;
          case 'WITH_CONFLICTS':
            userMessage = 'There is a previous version of this file that is different than the version you are trying to commit.';
            break;
        }
      }

      var commitDialog = '<div id="gh-commit-diag-content">' +
        '<div class="gh-commit-info-prolog">' + userMessage + ' <a target="_blank" href = "' + err.diff.permalink_url + '">Click here</a> to see the changes. Afterwards, choose one of the following:</div>';

      if (result.resultType == 'CLEAN') {
        commitDialog +=
            '<div id="commitAnyway" class="gh-commit-diag-choice gh-default-choice" title="All changes will be merged into one file and commited afterwards.">' +
              '<span class="gh-commit-diag-icon gh-commit-merge"></span>' +
              '<div class="gh-commit-diag-title">Merge and commit</div>' +
            '</div>';
      }
      commitDialog +=
            '<div id="createFork" class="gh-commit-diag-choice" title="A new branch will be created and this document will be created on that branch.">' +
              '<span class="gh-commit-diag-icon gh-commit-fresh"></span>' +
              '<div class="gh-commit-diag-title">Commit on a new branch</div>' +
            '</div>';
      commitDialog +=
            '<div id="overwriteChanges" class="gh-commit-diag-choice" title="Only your changes will be commited, discarding any other changes.">' +
              '<span class="gh-commit-diag-icon gh-commit-overwrite"></span>' +
              '<div class="gh-commit-diag-title">Commit only my changes</div>' +
            '</div>';

      commitDialog += '</div>';

      errorReporter.showError(COMMIT_STATUS_TITLE, commitDialog, sync.api.Dialog.ButtonConfiguration.CANCEL);

      var dialogElement = errorReporter.errDialog.getElement();
      errorReporter.errDialog.setPreferredSize(450, null);

      var commitMerge = dialogElement.querySelector('.gh-commit-merge');
      if (commitMerge) {
        commitMerge.style.backgroundImage = 'url("' +
            sync.util.computeHdpiIcon('../plugin-resources/github-static/git_merge36.png') + '")';
      }
      var commitOnBranch = dialogElement.querySelector('.gh-commit-fresh');
      if (commitOnBranch) {
        commitOnBranch.style.backgroundImage = 'url("' +
            sync.util.computeHdpiIcon('../plugin-resources/github-static/git_branch36.png') + '")';
      }
      var commitMine = dialogElement.querySelector('.gh-commit-overwrite');
      if (commitMine) {
        commitMine.style.backgroundImage = 'url("' +
            sync.util.computeHdpiIcon('../plugin-resources/github-static/git_commit36.png') + '")';
      }

      var choices = dialogElement.querySelectorAll('#gh-commit-diag-content > .gh-commit-diag-choice');
      for (var i = 0; i < choices.length; i++) {
        choices[i].addEventListener('click', goog.bind(this.handleCommitIsNotAFastForward, this, err.commit, choices[i].getAttribute('id'), repo));
      }

      return;
    } else if (err.error == 401) {
      msg = 'Not authorized.';

      // Clear the github credentials to make sure the login dialog is shown when the page is refreshed
      clearGithubCredentials();
    } else if (err.error == 422) {
      var response = JSON.parse(err.request.responseText);
      msg = response.message;
    }

    errorReporter.showError('Commit Error', msg, sync.api.Dialog.ButtonConfiguration.OK);
  };

  /**
   * Handle the situation when a user commits to a repository and someone else has committed in the meantime as well
   * @param {{blobSha: string, sha: string, branch: string}} commit The commit which failed and the user can choose
   *        what to do with it
   * @param {string} elementId The id of the clicked element
   * @param {object} opt_repo The repo on which to commit
   * @param {goog.ui.Dialog.Event} event The triggering event
   */
  CommitAction.prototype.handleCommitIsNotAFastForward = function (commit, elementId, opt_repo, event) {
    var self = this;
    var repo = opt_repo ? opt_repo : self.repo;

    switch (elementId) {
      case 'createFork':
        errorReporter.hide();
        self.setStatus('loading');
        self.ctx.branch = 'oxygen-webapp-' + Date.now();
        self.createBranch_(repo, self.ctx, function (err) {
          if (!err) {
            // Committing on the newly created branch without merging. Just the current changes.
            repo.commitToHead(self.ctx.branch, self.filePath, self.ctx.content, self.ctx.message,
              goog.bind(self.finalizeCommit_, self, repo, self.ctx.branch, self.ctx.content));
          } else {
            self.setStatus('none');
            errorReporter.showError(COMMIT_STATUS_TITLE, 'Could not create a new branch', sync.api.Dialog.ButtonConfiguration.OK);
          }
        });
        break;
      case 'commitAnyway':
        errorReporter.hide();
        self.setStatus('loading');
        repo.updateCommit(commit, self.branch, goog.bind(self.finalizeCommit_, self, repo, self.branch, self.ctx.content));
        break;
      case 'overwriteChanges':
        errorReporter.hide();
        self.setStatus('loading');
        repo.commitToHead(self.ctx.branch, self.filePath, self.ctx.content, self.ctx.message,
          goog.bind(self.finalizeCommit_, self, repo, self.ctx.branch, self.ctx.content));
        break;
    }
  };

  /**
   * Called to fork the current github working repository and commit the working document to the fork
   * @param {goog.ui.Dialog.Event} event The triggering event
   */
  CommitAction.prototype.forkAndCommit = function (event) {
    var self = this;

    if (event.key == 'yes') {
      // Set to show the spinning loading
      self.setStatus('loading');

      self.repo.fork(function (_, result) {
        var repoName = result.name;
        documentOwner = result.owner.login;
        var forkedRepo = self.github.getRepo(documentOwner, repoName);

        if (self.ctx && self.ctx.branchExists) {
          self.commitToForkedRepo_(forkedRepo);
        } else {
          forkedRepo.branch(self.branch, self.ctx.branch, function(err) {
            var message = 'Could not commit to fork!';
            var ok = true;

            err = self.getBranchingError_(err, self.ctx);
            if (err && err.error === 404) {
              // Maybe this was a commit ref instead of a branch ref. Let's try.
              forkedRepo.createRef({
                "ref": "refs/heads/" + self.ctx.branch,
                "sha": self.branch
              }, function(err) {
                err = self.getBranchingError_(err, self.ctx);
                if (err) {
                  self.setStatus('none');
                  errorReporter.showError(COMMIT_STATUS_TITLE, message, sync.api.Dialog.ButtonConfiguration.OK);
                } else {
                  self.commitToForkedRepo_(forkedRepo);
                }
              });
            } else if (err && err.error === 422) {
              message = 'Invalid branch name';
              ok = false;
            } else if (err) {
              ok = false;
            } else {
              self.commitToForkedRepo_(forkedRepo);
            }

            if (!ok) {
              self.setStatus('none');
              errorReporter.showError(COMMIT_STATUS_TITLE, message, sync.api.Dialog.ButtonConfiguration.OK);
            }
          });
        }
      });
    }
  };

  /**
   * Writes the current file to the chosen branch
   * @param {Github.Repository} repo The repo to write on
   * @private
   */
  CommitAction.prototype.commitToForkedRepo_ = function (repo) {
    var self = this;
    self.getLatestFileVersion(self.ctx.branch, repo, function (err, latestFile) {
      if (err === "not found") {
        repo.createFile(self.ctx.branch, self.filePath, self.ctx.content, self.ctx.message, function (err, result) {
          if (err) {
            self.setStatus('none');
            errorReporter.showError('Commit result',
              'Failed to create file on the forked repository.', sync.api.Dialog.ButtonConfiguration.OK);
            return;
          }

          /**
           * Setting the documentSha, documentCommit, self.repo, etc for when we might
           * "hot-reload" the document without refreshing the page
           */
          documentSha = result.content.sha;
          documentCommit = result.commit.sha;
          initialDocument = self.ctx.content;

          // Set our working branch to the new branch (The opened document is now on the new branch)
          self.branch = self.ctx.branch;

          // The active repo is the forked repo
          self.repo = repo;

          self.setStatus('success');
          errorReporter.showError('Commit result',
            'Commit successful on branch <a target="_blank" href="' + result.commit.html_url + '">' + self.ctx.branch + '</a>', sync.api.Dialog.ButtonConfiguration.OK);

          goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
            goog.bind(self.handleReloadOnNewBranch, self, true));
        });
        return;
      } else if (err) {
        self.setStatus('none');
        errorReporter.showError('Commit result',
          'We could not commit on the forked repository.', sync.api.Dialog.ButtonConfiguration.OK);
        return;
      }
      if (latestFile.sha === documentSha) {
        repo.commitToHead(self.ctx.branch, self.filePath, self.ctx.content, self.ctx.message, function(err, commit) {
          var msg;
          if (err && err.error == 404) {
            self.setStatus('none');
            msg = "Repository not found"
          } else if (err) {
            self.setStatus('none');
            msg = 'Error';
          } else {
            documentSha = commit.blobSha;
            documentCommit = commit.sha;
            initialDocument = self.ctx.content;

            // Set our working branch to the new branch (The opened document is now on the new branch)
            self.branch = self.ctx.branch;

            // The active repo is the forked repo
            self.repo = repo;

            Github.apiRequest('GET', commit.head.url, null, function (err, response) {
              var msg;
              if (err) {
                msg = 'Commit successful on branch ' + self.ctx.branch;
              } else {
                msg = 'Commit successful on branch <a target="_blank" href="' + response.html_url + '">' + self.ctx.branch + '</a>';
              }
              self.setStatus('success');
              errorReporter.showError('Commit result', msg, sync.api.Dialog.ButtonConfiguration.OK);

              goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
                goog.bind(self.handleReloadOnNewBranch, self, true));
            });

            return;
          }

          errorReporter.showError(COMMIT_STATUS_TITLE, msg, sync.api.Dialog.ButtonConfiguration.OK);
        });
      } else {
        self.startMergingCommit_(repo, self.ctx, latestFile.content, function (err) {
          self.handleErrors(err, repo);
        }, true);
      }
    });
  };

  /**
   * Set the status of the GitHub icon.
   *
   * @param {string} status The new status.
   */
  CommitAction.prototype.setStatus = function(status) {
    clearTimeout(this.statusTimeout);

    goog.dom.classlist.remove(this.githubToolbarButton, this.status);
    goog.dom.classlist.add(this.githubToolbarButton, status);
    this.status = status;

    if (status == 'success') {
      this.statusTimeout = setTimeout(
        goog.bind(this.setStatus, this, 'none'), 3200);
    }
  };

  /**
   * @override
   */
  CommitAction.prototype.actionPerformed = function(cb) {
    try {
      if (this.status != 'loading') {
        this.setStatus('none');
        var dialog = this.getDialog();
        var commitFinalizedCallback = goog.bind(this.commitFinalized, this, cb);
        dialog.onSelect(goog.bind(this.detailsProvided, this, commitFinalizedCallback));
        this.showDialog();
      }
    } finally {
      cb();
    }
  };

  /** @override */
  CommitAction.prototype.getDescription = function() {
    return "Commit on GitHub";
  };

  /**
   * Loads the github-specific CSS.
   */
  function loadCss() {
    var url = "../plugin-resources/github-static/github.css";
    if (document.createStyleSheet) {
      document.createStyleSheet(url);
    } else {
      var link = goog.dom.createDom('link', {
        href: url,
        rel: "stylesheet",
        type: "text/css"
      });
      goog.dom.appendChild(document.head, link);
    }
  }

  /**
   * The object that handles GitHub logins.
   *
   * @constructor
   */
  var GitHubLoginManager = function() {
    this.loginDialog = null;
    this.errorMessage = null;
    this.gotRepoAccess = undefined;
  };

  /**
   * Set the gotRepoAccess property.
   *
   * @param {boolean} gotRepoAccess True if the logged in user has read access in the current documents repo
   */
  GitHubLoginManager.prototype.setGotRepoAccess = function (gotRepoAccess) {
    this.gotRepoAccess = gotRepoAccess;
  };

  /**
   * @returns {boolean} true - if the user has access to the repository,
   *                    false - if the user doesn't have access to the repository,
   *                    undefined - if we didn't check to see the access.
   */
  GitHubLoginManager.prototype.getGotRepoAccess = function () {
    return this.gotRepoAccess;
  };

  /**
   * Sets the error message variable
   * @param {String} message The error message
   */
  GitHubLoginManager.prototype.setErrorMessage = function (message) {
    this.errorMessage = message;
  };

  /**
   * Creates the login dialog.
   */
  GitHubLoginManager.prototype.getLoginDialog = function() {
    if (!this.loginDialog) {
      this.loginDialog = workspace.createDialog();
      this.loginDialog.setButtonConfiguration(sync.api.Dialog.ButtonConfiguration.CANCEL);

      var dialogHtml = '<div class="github-login-dialog">';
      dialogHtml += '<div class="github-login-dialog-error">' + this.errorMessage + '</div>';

      dialogHtml += '<div id="gh-login-button-container"></div>';

      this.loginDialog.getElement().innerHTML = dialogHtml;
      this.loginDialog.setTitle("GitHub Login");

      this.loginDialog.onSelect(function (key) {
        if (key == 'cancel') {
          // Go to the dashboard view
          window.location.href = window.location.protocol + "//" + window.location.hostname +
            (window.location.port ? ':' + window.location.port : '') + window.location.pathname;
        }
      });
    }

    var gotRepoAccess = this.getGotRepoAccess();
    if (this.oauthProps && this.oauthProps.oauthUrl) {
      var loginButtonContainer = this.loginDialog.dialog.getElement().querySelector('#gh-login-button-container');
      if (typeof gotRepoAccess == 'undefined') {
        // gotRepoAccess is undefined, this means we didn't check for repo access and this dialog is an initial login dialog
        loginButtonContainer.innerHTML = 'To access files stored on the repository you must login using your GitHub account.' +
          '<a title="Click to login using your GitHub account" href="' + this.oauthProps.oauthUrl +
          '" id="github-oauth-button"><span class="github-icon-octocat-large"></span><span class="github-oauth-text">Login with GitHub</span></a>';
      } else if (gotRepoAccess === false) {
        // gotRepoAccess is false, this means we checked for access so this file is either not found or not accessible,
        // so show a more meaningfull login dialog
        loginButtonContainer.innerHTML = '<a title="Click to login using your GitHub account" href="' + this.oauthProps.oauthUrl +
          '" id="github-oauth-button"><span class="github-icon-octocat-large"></span><span class="github-oauth-text">Re-login with GitHub</span></a>';
      }
    }

    var errorMessageElement = this.loginDialog.getElement().querySelector('.github-login-dialog-error');
    if (this.errorMessage) {
      errorMessageElement.innerHTML = this.errorMessage;
      errorMessageElement.style.display = 'block';

      if (gotRepoAccess === false) {
        Github.apiRequest('GET', '/users/' + documentOwner, null, function (err, owner) {
          var contactInfo;

          if (!err && owner.email) {
            contactInfo = 'mailto:' + owner.email + '?subject=Github access request';
          } else {
            contactInfo = 'https://github.com/' + documentOwner;
          }

          new sync.ui.CornerTooltip(errorMessageElement,
            '<div>' +
            'There are 2 possible reasons for this error:' +
            '<ul>' +
            '<li>The file does not exist</li>' +
            '<li>You do not have access to read the file</li>' +
            '</ul>' +
            'You can <a href="' + contactInfo + '">contact the repository owner</a> to request access.<br/>' +
            'Or <a href="https://github.com/" target="_blank">go to GitHub and login</a> with a user which has<br/> ' +
            'read access and afterwards click the "Re-login with GitHub" button.' +
            '</div>'
          );
        });
      }
    } else {
      errorMessageElement.style.display = 'none';
    }

    return this.loginDialog;
  };

  /**
   * Sets the oauth properties required to build the github authenticate url
   *
   * @param {String=} clientId The Github client_id property
   * @param {String=} state The Github state property
   * @param {String=} apiUrl The url prefix of the GitHub api.
   */
  GitHubLoginManager.prototype.setOauthProps = function (clientId, state, apiUrl) {
    apiUrl = apiUrl || 'https://github.com';

    var scopes = 'public_repo,repo';
    if (clientId && state && apiUrl) {
      this.oauthProps = {
        clientId: clientId,
        state: state,
        oauthUrl: apiUrl + '/login/oauth/authorize?client_id=' + clientId + '&state=' + state + '&scope=' + scopes
      };

      try {
        localStorage.setItem('github.oauthProps', JSON.stringify(this.oauthProps));
      } catch (e) {}
    } else {
      this.oauthProps = null;
      localStorage.removeItem('github.oauthProps');
    }
  };

  /**
   * Creates a github access object form the user and password or auth token.
   */
  GitHubLoginManager.prototype.createGitHub = function() {
    var githubCredentials = localStorage.getItem('github.credentials');
    return githubCredentials && new Github(JSON.parse(githubCredentials));
  };

  /**
   * Reset the credentials.
   */
  GitHubLoginManager.prototype.resetCredentials = function() {
    localStorage.removeItem('github.credentials');
    localStorage.removeItem('github.userName');
  };

  /**
   * The github api instance
   */
  var github;

  var githubCredentials = localStorage.getItem('github.credentials');
  if (githubCredentials) {
    github = new Github(JSON.parse(githubCredentials));
  }

  /**
   * Returns the github access object asynchronously.
   *
   * @param {Function} cb The method to call when we have the github instance
   */
  GitHubLoginManager.prototype.getCredentials = function(cb) {
    github = this.createGitHub();
    if (github) {
      cb(github);
      return;
    }

    var dialog = this.getLoginDialog();
    dialog.show();

    // Reset the error message to null, it will be set again if needed
    this.setErrorMessage(null);
  };


  /**
   * Handles the user authentication.
   *
   * @param callback method to be called after the user was logged in.
   *  It receives authentication information as a parameter.
   * @param {boolean=} reset Set to true if we want to get a new access token
   */
  GitHubLoginManager.prototype.authenticateUser = function(callback, reset) {
    // If we can create a valid github instance, use it
    github = this.createGitHub();
    if (github) {
      var alreadyGotGithub = true;
      callback(github);
    }

    // But we should also make sure that our github instance is not outdated (invalid client_id/access_token)
    getGithubClientIdOrToken(reset, goog.bind(function (err, credentials) {
      if (err || credentials.error) {
        var errMessage = '';
        if (credentials && credentials.error && credentials.error.indexOf('#HGCR')) {
          errMessage = '<div>' +
              'The GitHub plugin cannot connect to GitHub.' +
              'If you are the administrator of the application make sure proxy settings are properly ' +
              'set in the <a target="_blank" href="admin.html#Proxy">administration page</a>.' +
              '</div>';
        } else {
          errMessage = '<div>' +
              'The GitHub plugin is not configured properly.' +
              'If you are the administrator of the application make sure the Client ID and the ' +
              'Client Secret are properly set in the <a target="_blank" href="admin.html#Plugins">administration page</a>.' +
              '</div>';
        }

        // Clear the oauth props so we won't show the login with github button (The github oauth flow is not available)
        this.setErrorMessage(errMessage);
        this.setOauthProps(null);
        this.resetCredentials();

        // On firefox the login dialog appears slightly to the bottom-right if we don't wait here
        setTimeout(goog.bind(this.getCredentials, this, callback), 0);
      } else {
        if (credentials.accessToken) {
          try {
            var apiUrl = credentials.apiUrl ? credentials.apiUrl + '/api/v3' : null;

            localStorage.setItem('github.credentials', JSON.stringify({
              token: credentials.accessToken,
              auth: "oauth",
              apiUrl: apiUrl
            }));
          } catch (e) {}

          // Update our github instance with the potentially new accessToken
          github = this.createGitHub();

          var currentOauthProps = JSON.parse(localStorage.getItem('github.oauthProps'));
          if (currentOauthProps &&
              currentOauthProps.clientId === credentials.clientId &&
              currentOauthProps.state === credentials.state &&
              // If we already could make a github instance it means we called callback so we can just return;
              alreadyGotGithub) {
              return;
          } else {
            // If we got new oauthProps we will update them and call the callback
            this.setOauthProps(credentials.clientId, credentials.state, credentials.apiUrl);
          }

          callback(github);
        } else {
          // If the server didn't respond with a accessToken that means we should get a new one by starting the oauth
          // flow so remove the github.credentials so that the login dialog can appear.
          localStorage.removeItem('github.credentials');

          // We don't have an access token yet, so use the clientId and state to start the oauth flow
          this.setOauthProps(credentials.clientId, credentials.state, credentials.apiUrl);

          // On firefox the login dialog appears slightly to the bottom-right if we don't wait here
          setTimeout(goog.bind(this.getCredentials, this, callback), 0);
        }
      }
    }, this));
  };

  /**
   * The github sha of the opened document (The sha of the file contents).
   */
  var documentSha;

  /**
   * The github commit sha of the opened document (The reference to the commit which produced this document).
   */
  var documentCommit;

  /**
   * The owner of the document
   */
  var documentOwner;

  /**
   * The initial value of the document, before the user starts editing
   */
  var initialDocument;

  /**
   * An object describing the location of the opened document (filePath, branch. user, repo)
   */
  var fileLocation;

  // Make sure we accept any kind of URLs.
  goog.events.listenOnce(workspace, sync.api.Workspace.EventType.BEFORE_EDITOR_LOADED, function(e) {
    var url = e.options.url;
    var editor = e.editor;
    if (!isGitHubUrl(url)) {
      return;
    }

    e.preventDefault();

    var normalizedUrl = normalizeGitHubUrl(url);

    var loadingOptions = e.options;
    loadingOptions.url = normalizedUrl;

    fileLocation = getFileLocation(normalizedUrl);

    var loginManager = new GitHubLoginManager();
    loginManager.authenticateUser(loadDocument);

    /**
     * Loads the document
     *
     * @param {Object} github The github api object
     */
    function loadDocument(github) {
      var urlAuthor = sync.util.getURLParameter('author');
      if (!urlAuthor) {
        urlAuthor = localStorage.getItem('github.userName');
      }
      if (!urlAuthor) {
        var user = github.getUser();
        user.show(null, function (err, author) {
          if (!err && (author.name || author.login)) {
            loadingOptions.userName = author.name || author.login;

            try {
              localStorage.setItem('github.userName', loadingOptions.userName);
            } catch (e) {}
          }
          loadDocument_(github);
        });
      } else {
        loadingOptions.userName = urlAuthor;
        loadDocument_(github);
      }
    }

    function loadDocument_(github) {
      documentOwner = fileLocation.user;

      var repo = github.getRepo(fileLocation.user, fileLocation.repo);

      // Read the content using the GitHub API.
      getContentsAndHead(repo, fileLocation.branch, fileLocation.filePath, goog.bind(function(err, result) {
        if (err) {
          if (err.error == 401) {
            localStorage.removeItem('github.credentials');
            loginManager.authenticateUser(loadDocument, true);
            return;
          } else if (err == 'not found') {
            repo.show(function (_, repoAccess) {
              if (repoAccess) {
                loginManager.setErrorMessage('The requested file was not found.');
              } else {
                loginManager.setErrorMessage('We could not open this file. ' +
                  'Make sure the repository owner gave you access.');
              }

              loginManager.setGotRepoAccess(!!repoAccess);

              // Try to authenticate again.
              loginManager.resetCredentials();
              loginManager.getCredentials(loadDocument);
            });
            return;
          }

          // Try to authenticate again.
          loginManager.setErrorMessage('GitHub error.');
          loginManager.resetCredentials();
          loginManager.getCredentials(loadDocument);
          return;
        }

        var file = result.file;
        var head = result.head;

        // Show a spinner while the document is loading.
        sync.util.showDocumentLoading(workspace.docContainer);

        documentSha = file.sha;
        documentCommit = head.sha;

        var fileContent = sync.util.decodeB64(file.content);

        // Save the initial document for three way merging before committing
        initialDocument = fileContent;

        workspace.setUrlChooser(fileBrowser);

        // Load the retrieved content in the editor.
        loadingOptions.content = fileContent;
        editor.load(loadingOptions);

        goog.events.listenOnce(workspace, sync.api.Workspace.EventType.EDITOR_LOADED, function(e) {
          try {
            var tooltip = new goog.ui.AdvancedTooltip(document.querySelector('#titleDiv'));
            tooltip.setHtml(
                '<div class="tooltip-hovercard gh-location-tooltip">' +
                  'Document Information:' +
                  '<div>' +
                    'GitHub Owner: ' + fileLocation.user + '<br/>' +
                    'Repository: ' + fileLocation.repo + '<br/>' +
                    'Branch: ' + fileLocation.branch + '<br/>' +
                    'Path: ' + fileLocation.filePath +
                  '</div>' +
                '</div>'
            );
            tooltip.setHotSpotPadding(new goog.math.Box(20, 20, 20, 20));
            tooltip.setShowDelayMs(100);
          } catch (e) {
            console.log('Failed to set the document title tooltip');
          }
        });

        goog.events.listenOnce(editor, sync.api.Editor.EventTypes.ACTIONS_LOADED, function(e) {
          var githubToolbarButton = goog.dom.createDom('div', {
            'id': 'github-toolbar-button',
            'title': 'GitHub'
          }, '');

          var commitShortcut = localStorage.getItem('github.shortcut');
          if (commitShortcut && commitShortcut == 'true' || !commitShortcut) {
            // If the commit shortcut is enabled or if we should use the default value
            commitShortcut = CommitAction.SHORTCUT;
          } else if (commitShortcut && commitShortcut == 'false') {
            commitShortcut = null;
          }

          var commitAction = new CommitAction(editor, github, fileLocation);
          commitAction.setGithubToolbarButton(githubToolbarButton);

          // Add the github commit and logout actions to the main toolbar
          var commitActionId = installCommitAction(editor, commitAction, commitShortcut);
          var logOutActionId = installLogoutAction(editor, new LogOutAction(editor));

          addToolbarToBuiltinToolbar(e.actionsConfiguration, {
            type: "list",
            iconDom: githubToolbarButton,
            name: "GitHub",
            children: [
              {id: commitActionId, type: "action"},
              {id: logOutActionId, type: "action"}
            ]
          });
        });
      }, this));
    }

    /**
     * Returns the fileContents and head from the branch at the given path.
     * @param {Github.Repository} repo The repository on which the file resides.
     * @param {string} branch The branch on which the file resides.
     * @param {string} path The path to the file.
     * @param {function} cb The method to call on result.
     */
    function getContentsAndHead(repo, branch, path, cb) {
      repo.getContents(branch, path, function (err, file) {
        if (err) {
          return cb(err);
        }
        repo.getHead(branch, function (err, head) {
          // If the head is not found this might be a commit (perhaps taken from history)
          if (err && err.error === 404) {
            repo.getCommit(branch, function (err, commit) {
              if (err) {
                return cb(err);
              }

              cb(null, {
                file: file,
                head: {
                  sha: commit.sha
                }
              });
            });
            return;
          } else if (err) {
            return cb(err);
          }
          cb(null, {
            file: file,
            head: head
          });
        });
      });
    }
  }, true);

  /**
   * Gets the github access token or client_id
   *
   * @param {boolean=} reset If true, will trigger a new OAuth flow for getting a new access token (called with true when the access token expires)
   * @param {function(err: Object, credentials: {accessToken: String, clientId: String, state: String, error: String})} callback The method to call on result
   */
  function getGithubClientIdOrToken(reset, callback) {
    if (reset) {
      localStorage.removeItem('github.credentials');
      localStorage.removeItem('github.oauthProps');
    }

    var localStorageCredentials = JSON.parse(localStorage.getItem('github.credentials')) || {};
    var localStorageOauthProps = JSON.parse(localStorage.getItem('github.oauthProps')) || {};

    var accessToken = localStorageCredentials.token || '';
    var clientId = localStorageOauthProps.clientId || '';
    var state = localStorageOauthProps.state || '';

    var xhrRequest = new XMLHttpRequest();

    xhrRequest.open('POST', '../plugins-dispatcher/github-oauth/github_credentials/', true);

    xhrRequest.onreadystatechange = function () {
      if (xhrRequest.readyState == 4 && xhrRequest.status == 200) {
        var response = JSON.parse(xhrRequest.responseText);

        callback(null, {
          apiUrl: response.api_url,
          accessToken: response.access_token,
          clientId: response.client_id,
          state: response.state,
          error: response.error
        });
      } else if (xhrRequest.readyState == 4 && xhrRequest.status >= 100) {
        // When the request status is < 100 it means the request was terminated abruptly..
        callback({message: "OAuth client_id or access_token are not available"}, null);
      }
    };

    var redirectTo = location.href;
    if (callOnReturn) {
      redirectTo = location.protocol + "//" +
          location.hostname + (location.port ? ':' + location.port : '') +
          location.pathname + location.search + '#' + callOnReturn
    }

    // Send the current url. It will be needed to redirect back to this page
    // Also send the oauth related props so that we can synchronize with the server, in case we need new credentials
    xhrRequest.send(JSON.stringify({
      redirectTo: redirectTo,
      reset: reset,

      accessToken: accessToken,
      clientId: clientId,
      state: state
    }));
  }

  /**
   * Clears the github credentials from the client and from the server
   */
  function clearGithubCredentials() {
    localStorage.removeItem('github.credentials');
    localStorage.removeItem('github.userName');

    var xhrRequest = new XMLHttpRequest();
    xhrRequest.open('POST', '../plugins-dispatcher/github-oauth/github_reset_access/', false);
    xhrRequest.send();
  }

  /**
   * Returns an object representing the file location
   * @param {string} url The url of the file.
   *              (It should always be github url: github://getFileContents/:user/:repo/:branch/:path)
   * @returns {object} The file location descriptor
   */
  function getFileLocation(url) {
    // Replacing all # chars because the fragment part of the url won't end up in this function and if there are
    // # characters, they should be encoded
    url = url.replace(new RegExp('#', 'g'), '%23');

    var urlObj = new goog.Uri(url);
    var path = urlObj.getPath();
    var pathSplit = path.split('/');

    // In some browsers, the pathname starts with a "/".
    if (pathSplit[0] === "") {
      pathSplit = pathSplit.slice(1);
    }
    return {
      user: pathSplit[0],
      repo: pathSplit[1],
      branch: decodeURIComponent(pathSplit[2]),
      filePath: pathSplit.slice(3).map(decodeURIComponent).join("/")
    };
  }

  /**
   * Adds a toolbar to the builtin toolbar
   *
   * @param {object} actionsConfig Configuration object
   * @param {object} toolbarToAdd The description of the toolbar to add
   */
  function addToolbarToBuiltinToolbar(actionsConfig, toolbarToAdd) {
    var builtinToolbar = null;
    if (actionsConfig.toolbars) {
      for (var i = 0; i < actionsConfig.toolbars.length; i++) {
        var toolbar = actionsConfig.toolbars[i];
        if (toolbar.name == "Builtin") {
          builtinToolbar = toolbar;
          break;
        }
      }
    }

    if (builtinToolbar) {
      builtinToolbar.children.push(toolbarToAdd);
    }
  }

  /**
   * Installs the Commit action in the toolbar.
   *
   * @param {sync.api.Editor} editor The editor
   * @param {sync.actions.AbstractAction} commitAction The commit-to-github action.
   * @param {string} shortcut String representing the key combination which triggers this action
   * @returns {string}
   */
  function installCommitAction(editor, commitAction, shortcut) {
    // Remove the save action from the toolbar (remove the ctrl + s == save document shortcut)
    editor.getActionsManager().unregisterAction('Author/Save');

    editor.getActionsManager().registerAction(CommitAction.ID, commitAction, shortcut);
    return CommitAction.ID;
  }

  /**
   * Sets the key stroke shortcut for the commit action.
   * @param {sync.api.Editor} editor The editor.
   * @param {string} shortcut String representing the key-stroke which invokes the commit action.
   */
  function setCommitActionShortcut(editor, shortcut) {
    editor.getActionsManager().setActionShortcut(CommitAction.ID, shortcut);
  }

  /**
   * Installs the logout acion in the toolnar
   * @param {sync.api.Editor} editor The editor
   * @param {sync.actions.AbstractAction} logoutAction The logout action
   * @returns {string}
   */
  function installLogoutAction(editor, logoutAction) {
    var actionId = 'Github/Logout';

    editor.getActionsManager().registerAction(actionId, logoutAction);
    return actionId;
  }

  /**
   * Changes to github url to a "github protocol" url
   * @param {string} url The URL
   * @returns {string} The normalized URL.
   */
  function normalizeGitHubUrl(url) {
    return url.replace("https", "github")
      .replace("http", "github")
      .replace("/tree/", "/blob/")
      .replace("/blob/", "/")
      .replace("www.github.com", "getFileContent")
      .replace("github.com", "getFileContent")
      .replace("raw.githubusercontent.com", "getFileContent");
  }

  /**
   * Checks whether the url points to a github resource
   * @param {string} url The URL to check
   * @returns {boolean} true if the url points to a github resource
   */
  function isGitHubUrl(url) {
    if (url.indexOf('github://') == 0) {
      return true;
    }
    if (url.match("https?://.*")) {
      return url.indexOf('github.com') != -1 ||
        url.indexOf('raw.githubusercontent.com') != -1;
    }
    return false;
  }

  /**
   * Matcher for the repository autocomplete field.
   * @constructor
   */
  var GithubRepoChooser = function(input) {
    this.repos = null;

    // If the match handler is reqested before the repos are available, we record the details.
    this.token_ = null;
    this.handler_ = null;
    this.maxMatches_ = null;

    this.repoUrl = null;

    github.getUser().repos(goog.bind(this.reposReceived_, this));

    this.renderer = new goog.ui.ac.Renderer(input.parentNode);
    this.inputhandler = new goog.ui.ac.InputHandler(null, null, false, 300);
    this.ac = new goog.ui.ac.AutoComplete(this, this.renderer, this.inputhandler);
    this.inputhandler.attachAutoComplete(this.ac);
    this.inputhandler.attachInputs(input);
    this.ac.setAutoHilite(false);

    this.eventHandler = new goog.events.EventHandler(this);
    // On focus, expand the suggestions list.
    this.eventHandler.listen(input, goog.events.EventType.FOCUS, goog.bind(function() {
      this.ac.getSelectionHandler().update(true);
    }, this));

    // Different ways to commit.
    this.eventHandler.listen(input, goog.events.EventType.BLUR, goog.bind(function(e) {
      this.setRepo(input);
    }, this), true);

    this.eventHandler.listen(input, goog.events.EventType.PASTE, goog.bind(function(e) {
      setTimeout(goog.bind(function() {
        this.setRepo(input);
      }, this), 0);
    }, this), true);
    this.eventHandler.listen(input, goog.events.EventType.KEYDOWN, goog.bind(function(e) {
      if (e.keyCode == goog.events.KeyCodes.TAB) {
        this.setRepo(input);
      }
    }, this));
    this.eventHandler.listen(input, goog.events.EventType.KEYPRESS, goog.bind(function(e) {
      if (e.keyCode == goog.events.KeyCodes.ENTER) {
        setTimeout(goog.bind(this.setRepo, this, input), 0);
        e.stopPropagation();
      }
    }, this), true);
    this.eventHandler.listen(this.ac, goog.ui.ac.AutoComplete.EventType.UPDATE,
      goog.bind(function(e) {
        if (e.row) {
          this.setRepo(input);
        }
      }, this));

    // Initially, the autocomplete should be focused.
    setTimeout(function() {
      input.focus();
    }, 0);
    goog.events.EventTarget.call(this);
  };
  goog.inherits(GithubRepoChooser, goog.events.EventTarget);

  /**
   * Received the repositories from GitHub
   * @param {Object=} err The error descriptor if any.
   * @param {Array.<Object>} repos The repositories details.
   * @private
   */
  GithubRepoChooser.prototype.reposReceived_ = function(err, repos) {
    if (err) {
      // No content completion available.
      return;
    }
    this.repos = repos;
    if (this.handler_) {
      this.requestMatchingRows(this.token_, this.maxMatches_, this.handler_);
      this.handler_ = null;
      this.maxMatches_ = null;
      this.token_ = null;
    }
  };

  /** @override */
  GithubRepoChooser.prototype.disposeInternal = function() {
    if (this.eventHandler) {
      this.eventHandler.dispose();
      this.eventHandler = null;
    }
    if (this.ac) {
      this.ac.dispose();
      this.ac = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this.inputHandler) {
      this.inputHandler.dispose();
      this.inputHandler = null;
    }
  };

  /** @override */
  GithubRepoChooser.prototype.requestMatchingRows = function(token, maxMatches, matchHandler, opt_fullString) {
    if (this.repos) {
      var matches = this.repos.map(function(repo) {
          return 'https://github.com/'+ repo.full_name;}
      ).filter(function(repo) {
          return repo.indexOf(token.toLowerCase()) != -1;
        });
      goog.array.sort(matches);
      matchHandler(token, matches);
    } else {
      this.handler_ = matchHandler;
      this.token_ = token;
      this.maxMatches_ = maxMatches;
    }
  };

  /**
   * Return the repository with the given URL.
   *
   * @param {string} url The url of the repo.
   * @return {object} the repo descriptor, or null if the repo is not chosen from the list.
   */
  GithubRepoChooser.prototype.getRepoByUrl = function(url) {
    var repo = null;
    if (this.repos) {
      for (var i = 0; i < this.repos.length; i++) {
        if (url.indexOf('https://github.com/' + this.repos[i].full_name) == 0) {
          repo = this.repos[i];
          break;
        }
      }
    }
    return repo;
  };

  /**
   * Triggers a repo chosen event.
   *
   * @param {HTMLElement} input The input from which to read the value.
   */
  GithubRepoChooser.prototype.setRepo = function(input) {
    var repoUrl = input.value.trim();
    if (repoUrl != this.repoUrl) {
      this.repoUrl = repoUrl;
      this.dispatchEvent({
        type: 'github-repo-chosen',
        url: repoUrl,
        repo: this.getRepoByUrl(repoUrl)
      });
    }
  };

  /**
   * GitHub file browser.
   *
   * @constructor
   */
  GithubFileBrowser = function() {
    var latestUrl = localStorage.getItem('github.latestUrl');
    sync.api.FileBrowsingDialog.call(this, {
      initialUrl: latestUrl,
      root: this.extractRootUrl_(latestUrl)
    });
    this.branchesForUrl = {};
    // The model of the selected repository in editing mode.
    // - owner
    // - user
    // - rest - intermediate field that holds the part after the repo url
    // - error - an error message to display to the user; defined if the repo could not be opened.
    // - repoDesc - descriptor of the repository (if available)
    // - path (if provided by the user)
    // - branch
    // - isFile (if the URL contains path, whether the specified path is a file or a folder)
    this.repoDetails = null;
    this.keyHandleBranchSelected = null;
    // The repository rendered in the view.
    this.renderedRepo = null;
  };
  goog.inherits(GithubFileBrowser, sync.api.FileBrowsingDialog);

  /**
   * Extracts the root URL.
   *
   * @param {string} url the current url.
   * @private {string} the root url.
   */
  GithubFileBrowser.prototype.extractRootUrl_ = function(url) {
    return url && url.match('github://getFileContent/[^/]*/[^/]*/[^/]*/')[0]
  };

  /**
   * Cleanup from the previous editing state.
   */
  GithubFileBrowser.prototype.cleanupRepoEditing = function() {
    if (this.keyHandleBranchSelected) {
      goog.events.unlistenByKey(this.keyHandleBranchSelected);
    }
    if (this.repoChooser) {
      this.repoChooser.dispose();
    }
    this.renderedRepo = null;
    this.repoDetails = null;
  };

  /** @override */
  GithubFileBrowser.prototype.renderRepoPreview = function(element) {
    this.cleanupRepoEditing();
    var url = this.getCurrentFolderUrl();
    if (url) {
      element.title = "Github repository";
      goog.dom.classlist.add(element, 'vertical-align-children');
      goog.dom.classlist.add(element, 'github-browsing-repo-preview');
      var details = url.match("github://getFileContent/([^/]*)/([^/]*)/([^/]*)/.*");
      element.innerHTML = '<span class="repo-icon"></span>' +
        details[1] + '/' + details[2] + '<span class="github-repo-right vertical-align-children"><span class="branch-icon"></span>' + decodeURIComponent(details[3]) + '</span>';

      var button = goog.dom.createDom('div', 'github-repo-edit');
      button.title = "Edit GitHub repository and branch";
      goog.dom.appendChild(element, button);
      goog.events.listen(button, goog.events.EventType.CLICK,
        goog.bind(this.switchToRepoConfig, this, element));
    }
  };

  /** @override */
  GithubFileBrowser.prototype.renderRepoEditing = function(element) {
    if (!github) {
      goog.events.dispatchEvent(fileBrowser.getEventTarget(),
        new sync.api.FileBrowsingDialog.UserActionRequiredEvent("Need to configure the github branch url."));
      return;
    }
    goog.dom.classlist.remove(element, 'vertical-align-children');
    goog.dom.classlist.remove(element, 'github-browsing-repo-preview');

    element.innerHTML = '<div>' +
      '<div class="github-repo-ac"><input autocapitalize="none" autocorrect="off" type="text" placeholder="Enter or choose the GitHub URL"></div>' +
      '<div class="github-repo-preview-area">' +
      '</div>' +
      '</div>';

    var input = element.querySelector('.github-repo-ac > input');
    this.repoChooser = new GithubRepoChooser(input);
    var previewArea = element.querySelector('.github-repo-preview-area');
    goog.events.listen(this.repoChooser, 'github-repo-chosen',
      goog.bind(this.repositoryChosen_, this, previewArea));

    this.dialog.setPreferredSize(null, 300);
  };

  /**
   * Render an error message in the repo preview area.
   * @param {HTMLElement} preview The preview element.
   * @param {string} msg The message.
   * @private
   */
  GithubFileBrowser.prototype.repoChoosingMessage_ = function(preview, msg) {
    preview.innerHTML = '<div class="github-repo-placeholder">' + msg + '</div>';
    this.renderedRepo = null;
  };

  /**
   * Callback when a repository was chosen - populate the repository preview are.
   *
   * @param {HTMLElement} preview The element where to show the repo details.
   * @param {goog.events.Event} e The event.
   * @private
   */
  GithubFileBrowser.prototype.repositoryChosen_ = function(preview, e) {
    if (!e.url) {
      this.repoChoosingMessage_(preview, 'No repository chosen');
      return;
    }

    this.repoDetails = null;
    var repoId = /^([a-zA-Z\-]+)\/([a-zA-Z\-]+)$/.exec(e.url);
    if (repoId) {
      this.repoDetails = {owner: repoId[1], repo: repoId[2]};
    } else {
      var repoParts = /^https?:\/\/github.com\/([^\/]+)\/([^\/]+)(\/.*)?$/.exec(e.url);
      if (repoParts) {
        this.repoDetails = {owner: repoParts[1], repo: repoParts[2], rest: repoParts[3]};
      }
    }
    if (this.repoDetails) {
      this.repoDetails.repoDescriptor = e.repo;
      if (this.renderedRepo != e.url) {
        this.renderedRepo = e.url;
        this.showRepoPreview(preview);
      }
    } else {
      this.repoChoosingMessage_(preview,
        '<span class="github-error-icon"></span>Failed opening repository : ' + e.url);
    }
  };

  /**
   * Shows the repo preview and fetches the list of possible branches.
   *
   * @param {HTMLElement} preview
   */
  GithubFileBrowser.prototype.showRepoPreview = function(preview) {
    var repoDesc = this.repoDetails.repoDescriptor;
    var owner = this.repoDetails.owner;
    var repoName = this.repoDetails.repo;

    var repoId = owner + '/' + repoName;
    // Compose the HTML used to render the repository.
    var html = '<div>';
    html += '<div class="github-repo-section vertical-align-children"><span class="big-repo-icon"></span>' +
      '<span class="github-repo-name"><a tabindex="-1" href="https://github.com/' + owner + '">' + owner + '</a>/<a tabindex="-1" href="https://github.com/' + repoId + '">' + repoName + '</a></span>' +
      '</div>';
    html += '<div class="vertical-align-children"><span class="big-branch-icon"></span><select id="gh-settings-branch-select" tabindex="0"></select></div>';
    html += '<div class="vertical-align-children" style="display:none"><span class="github-file-icon"></span><span class="github-path"></span></div>';
    if (repoDesc && repoDesc.description) {
      html += '<div class="github-description-preview">' + repoDesc.description + '</div>';
    }
    if (repoDesc && repoDesc.language) {
      html += '<div>Language: ' + repoDesc.language + '</div>';
    }
    html += '</div>';
    preview.innerHTML = html;
    var select = goog.dom.getElement('gh-settings-branch-select');
    var pathElem = preview.querySelector('.github-path');

    goog.dom.classlist.add(select, 'github-loading');

    // Maybe we already know the default branch.
    var defaultBranch = repoDesc && repoDesc.default_branch;
    if (this.branchesForUrl[repoId]) {
      this.branchesReceived_(this.branchesForUrl[repoId], select, pathElem, defaultBranch);
    } else {
      // Get the repository described in the url
      var repo = github.getRepo(owner, repoName);
      repo.getBranches(goog.bind(function (err, branches) {
        if (err) {
          this.repoDetails.error = "Cannot open repository";
          this.repoChoosingMessage_(preview,
            '<span class="github-error-icon"></span>Failed opening repository : ' + repoId);
        } else {
          // cache the result no need to make the same request twice
          this.branchesForUrl[repoId] = branches;
          this.branchesReceived_(branches, select, pathElem, defaultBranch);
        }
      }, this));
    }
  };

  /**
   * The list of possible branches was received. We can now populate the combo and parse the branch vs. path from URL.
   *
   * We could not parse the URL before because the branch could contain '/' inside.
   *
   * @param {array<string>} branches The list of possible branches.
   * @param {HTMLElement} select The branches select combobox.
   * @param {HTMLElement} pathElem The element where the path will be displayed.
   * @param {string=} opt_defaultBranch The default branch if we know it beforehand.
   */
  GithubFileBrowser.prototype.branchesReceived_ = function (branches, select, pathElem, opt_defaultBranch) {
    goog.events.unlistenByKey(this.keyHandleBranchSelected);
    if (select) {
      goog.dom.removeChildren(select);
      for (var i = 0; i < branches.length; i++) {
        var option = goog.dom.createDom('option', {value: branches[i]}, branches[i]);
        select.appendChild(option);
      }

      // If the URL specifies a branch, or if we know the default branch, make sure to have it selected.
      var path_branch = null;
      if (this.repoDetails.rest) {
        var pathMatch = /\/([^\/]+)\/(.*)/.exec(this.repoDetails.rest);
        path_branch = pathMatch && pathMatch[2];
        if (path_branch) {
          // Parse the branch or commit number.
          var branchOrCommit = null;
          for (i = 0; i < branches.length; i++) {
            if (path_branch.indexOf(branches[i] + '/') == 0) {
              select.selectedIndex = i;
              branchOrCommit = branches[i];
              break;
            }
          }
          var details = /([^\/]+)(.*)/.exec(path_branch);
          if (details != null) {
            branchOrCommit = details[1];
          }

          if (branchOrCommit) {
            // Parse the file path and display it.
            this.repoDetails.isFile = pathMatch[1] == 'blob';
            this.repoDetails.branch = branchOrCommit;
            if (pathElem && path_branch.length > branchOrCommit.length) {
              var path = path_branch.substring(branchOrCommit.length + 1);
              this.repoDetails.path = path;
              pathElem.parentNode.style.display = 'block';
              pathElem.textContent = path;
            }
          }
        }
      }

      if (!this.repoDetails.branch) {
        // Try to select a default branch.
        var selectedIndex = -1;
        if (opt_defaultBranch) {
          selectedIndex = branches.indexOf(opt_defaultBranch);
        }
        if (selectedIndex == -1) {
          selectedIndex = branches.indexOf('master');
        }
        if (selectedIndex == -1) {
          selectedIndex = 0;
        }
        this.repoDetails.branch = branches[selectedIndex];
        select.selectedIndex = selectedIndex;
      }

      goog.dom.classlist.remove(select, 'github-loading');
      if (this.keyHandleBranchSelected) {
        goog.events.unlistenByKey(this.keyHandleBranchSelected);
      }
      this.keyHandleBranchSelected = goog.events.listen(select, goog.events.EventType.CHANGE,
        goog.bind(this.handleBranchSelected, this));
    }
  };

  /**
   * Called when a branch is selected to modify the repository url to include the selected branch.
   *
   * @param {goog.events.Event} event The triggering event
   */
  GithubFileBrowser.prototype.handleBranchSelected = function (event) {
    var select = event.target;
    this.repoDetails.branch = select.options[select.selectedIndex].text;
  };

  /** @override */
  GithubFileBrowser.prototype.handleOpenRepo = function(element, event) {
    if (this.repoDetails && this.repoDetails.owner && this.repoDetails.repo && this.repoDetails.branch) {
      var normalizedUrl = 'github://getFileContent/' + this.repoDetails.owner + '/' +
        this.repoDetails.repo + '/' + encodeURIComponent(this.repoDetails.branch) + '/';
      if (this.repoDetails.path) {
        // The user provided also a path.
        normalizedUrl = normalizedUrl + this.repoDetails.path;
      }

      try {
        localStorage.setItem('github.latestUrl', normalizedUrl);
      } catch (e) {}

      this.setRootUrl(this.extractRootUrl_(normalizedUrl));
      this.openUrl(normalizedUrl, this.repoDetails.isFile, event);
    } else {
      if (!this.repoDetails) {
        this.showErrorMessage('No repository was selected');
      } else if (this.repoDetails.error) {
        this.showErrorMessage(this.repoDetails.error);
      }
      event.preventDefault();
    }
  };

  /** @override */
  GithubFileBrowser.prototype.chooseUrl = function(context, chosen, purpose) {
    // Make sure the user is authenticated.
    var loginManager = new GitHubLoginManager();
    loginManager.authenticateUser(goog.bind(GithubFileBrowser.superClass_.chooseUrl, this, context, chosen, purpose));
  };


  // load the css by now because we will show a styled "Login with Github" button
  loadCss();

  /**
   * Register all the needed listeners on the file browser.
   *
   * @param {sync.api.FileBrowsingDialog} fileBrowser
   *  the file browser on which to listen.
   */
  var registerFileBrowserListeners = function (fileBrowser) {
    // handle the user action required event.
    var eventTarget = fileBrowser.getEventTarget();
    goog.events.listen(eventTarget,
      sync.api.FileBrowsingDialog.EventTypes.USER_ACTION_REQUIRED,
      function () {
        // authenticate the user.
        var loginManager = new GitHubLoginManager();
        // Calling authenticateUser with the reset flag set to true to make sure we request a new login flow.
        // We should only end up here if we are not authorized or if the logged in user has removed our application access from GitHub
        loginManager.authenticateUser(goog.bind(fileBrowser.refresh,fileBrowser), true);
      });
  };

  var fileBrowser = new GithubFileBrowser();

  /**
   * The name of the action to call when this page is loaded again at the end of an oauth flow.
   * @type {string}
   */
  var callOnReturn = null;

  // register all the listeners on the file browser.
  registerFileBrowserListeners(fileBrowser);

  /** @override */
  function GithubOpenAction() {
    sync.actions.OpenAction.apply(this, arguments);
  }
  goog.inherits(GithubOpenAction, sync.actions.OpenAction);

  GithubOpenAction.prototype.actionPerformed = function () {
    // When an Oauth flow will finish the open action will be invoked
    callOnReturn = 'github.open';
    GithubOpenAction.superClass_.actionPerformed.apply(this, arguments);
  };

  var githubOpenAction = new GithubOpenAction(fileBrowser);

  githubOpenAction.setLargeIcon(sync.util.computeHdpiIcon('../plugin-resources/github-static/Github70.png'));
  githubOpenAction.setDescription('Open a document from your GitHub repository');
  githubOpenAction.setActionId('github-open-action');
  githubOpenAction.setActionName("GitHub");

  /** @override */
  function GithubCreateDocumentAction() {
    sync.api.CreateDocumentAction.apply(this, arguments);
  }
  goog.inherits(GithubCreateDocumentAction, sync.api.CreateDocumentAction);

  GithubCreateDocumentAction.prototype.actionPerformed = function () {
    // When an Oauth flow will finish the create action will be invoked
    callOnReturn = 'github.create';
    // Make sure the user is authenticated.
    var loginManager = new GitHubLoginManager();
    loginManager.authenticateUser(goog.bind(GithubCreateDocumentAction.superClass_.actionPerformed, this));
  };

  var githubCreateAction = new GithubCreateDocumentAction(fileBrowser);
  githubCreateAction.setLargeIcon(sync.util.computeHdpiIcon('../plugin-resources/github-static/Github70.png'));
  githubCreateAction.setDescription('Create a file on your GitHub repository');
  githubCreateAction.setActionId('github-create-action');
  githubCreateAction.setActionName('Github');

  workspace.getActionsManager().registerOpenAction(
    githubOpenAction);
  workspace.getActionsManager().registerCreateAction(
    githubCreateAction);

  // Invoke the callOnReturn action if one was set
  goog.events.listenOnce(workspace, sync.api.Workspace.EventType.DASHBOARD_LOADED, function (e) {
    switch (location.hash) {
    case '#github.open':
      githubOpenAction.actionPerformed();

      // Remove the fragment part of the url because users may want tot copy the url to give to someone else
      location.hash = '';
      break;
    case '#github.create':
      githubCreateAction.actionPerformed();

      // Remove the fragment part of the url because users may want tot copy the url to give to someone else
      location.hash = '';
      break;
    }
  });

}());
