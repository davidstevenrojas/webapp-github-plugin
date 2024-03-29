/*!
 * @overview  Github.js
 *
 * @copyright (c) 2013 Michael Aufreiter, Development Seed
 *            Github.js is freely distributable.
 *
 * @license   Licensed under MIT license
 *
 *            For all details and documentation:
 *            http://substance.io/michael/github
 */

(function() {
  'use strict';
  
  // Initial Setup
  // -------------

  var XMLHttpRequest,  _, b64encode;
  /* istanbul ignore else  */
  if (typeof exports !== 'undefined') {
      XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
      _ = require('underscore');
  } else { 
      _ = window._; 
  }

  if (typeof window !== 'undefined') {
    b64encode = sync.util.encodeB64;
  } else {
    b64encode = require('js-base64').Base64.encode;
  }
  
  //prefer native XMLHttpRequest always
  /* istanbul ignore if  */
  if (typeof window !== 'undefined' && typeof window.XMLHttpRequest !== 'undefined'){
      XMLHttpRequest = window.XMLHttpRequest;
  }



  var Github = function(options) {
    var API_URL = options.apiUrl || 'https://api.github.com';

    // HTTP Request Abstraction
    // =======
    //
    // I'm not proud of this and neither should you be if you were responsible for the XMLHttpRequest spec.

    function _request(method, path, data, cb, raw, sync) {
      // # is a valid character for use in a file name on GitHub.
      path = path.replace(new RegExp('#', 'g'), '%23');

      function getURL() {
        var url = path.indexOf('//') >= 0 ? path : API_URL + path;
        return url + ((/\?/).test(url) ? '&' : '?') + (new Date()).getTime();
      }

      var xhr = new XMLHttpRequest();


      xhr.open(method, getURL(), !sync);
      if (!sync) {
        xhr.onreadystatechange = function () {
          if (this.readyState === 4) {
            if (this.status >= 200 && this.status < 300 || this.status === 304) {
              cb(null, raw ? this.responseText : this.responseText ? JSON.parse(this.responseText) : true, this);
            } else {
              cb({path: path, request: this, error: this.status});
            }
          }
        };
      }

      if (!raw) {
        xhr.dataType = 'json';
        xhr.setRequestHeader('Accept','application/vnd.github.v3+json');
      } else {
        xhr.setRequestHeader('Accept','application/vnd.github.v3.raw+json');
      }

      xhr.setRequestHeader('Content-Type','application/json;charset=UTF-8');
      if ((options.token) || (options.username && options.password)) {
        var authorization = options.token ? 'token ' + options.token : 'Basic ' + b64encode(options.username + ':' + options.password);
        xhr.setRequestHeader('Authorization', authorization);
      }
      if (data) {
        xhr.send(JSON.stringify(data));
      } else {
        xhr.send();
      }
      if (sync) {
        return xhr.response;
      }
    }

    Github.apiRequest = _request;

    function _requestAllPages(path, cb) {
      var results = [];
      (function iterate() {
        _request('GET', path, null, function(err, res, xhr) {
          if (err) {
            return cb(err);
          }

          results.push.apply(results, res);
          var links = (xhr.getResponseHeader('link') || '').split(/\s*,\s*/g),
            next = null;
          links.forEach(function(link) {
            next = /rel="next"/.test(link) ? link : next;
          });

          if (next) {
            next = (/<(.*)>/.exec(next) || [])[1];
          }

          if (!next) {
            cb(err, results);
          } else {
            path = next;
            iterate();
          }
        });
      })();
    }


    // User API
    // =======

    Github.User = function() {
      this.repos = function(cb) {
        // Github does not always honor the 1000 limit so we want to iterate over the data set.
        _requestAllPages('/user/repos?type=all&per_page=1000&sort=updated', function(err, res) {
          cb(err, res);
        });
      };

      // List user organizations
      // -------

      this.orgs = function(cb) {
        _request("GET", '/user/orgs', null, function(err, res) {
          cb(err, res);
        });
      };

      // List authenticated user's gists
      // -------

      this.gists = function(cb) {
        _request("GET", '/gists', null, function(err, res) {
          cb(err,res);
        });
      };

      // List authenticated user's unread notifications
      // -------

      this.notifications = function(cb) {
        _request("GET", '/notifications', null, function(err, res) {
          cb(err,res);
        });
      };

      // Show user information
      // -------

      this.show = function(username, cb) {
        var command = username ? '/users/' + username : '/user';

        _request('GET', command, null, function(err, res) {
          cb(err, res);
        });
      };

      // List user repositories
      // -------

      this.userRepos = function(username, cb) {
        // Github does not always honor the 1000 limit so we want to iterate over the data set.
        _requestAllPages('/users/' + encodeURIComponent(username) + '/repos?type=all&per_page=1000&sort=updated', function(err, res) {
          cb(err, res);
        });
      };

      // List a user's gists
      // -------

      this.userGists = function(username, cb) {
        _request('GET', '/users/' + encodeURIComponent(username) + '/gists', null, function(err, res) {
          cb(err,res);
        });
      };

      // List organization repositories
      // -------

      this.orgRepos = function(orgname, cb) {
        // Github does not always honor the 1000 limit so we want to iterate over the data set.
        _requestAllPages('/orgs/' + encodeURIComponent(orgname) + '/repos?type=all&&page_num=1000&sort=updated&direction=desc', function(err, res) {
          cb(err, res);
        });
      };

      // Follow user
      // -------

      this.follow = function(username, cb) {
        _request('PUT', '/user/following/' + encodeURIComponent(username), null, function(err, res) {
          cb(err, res);
        });
      };

      // Unfollow user
      // -------

      this.unfollow = function(username, cb) {
        _request('DELETE', '/user/following/' + encodeURIComponent(username), null, function(err, res) {
          cb(err, res);
        });
      };

      // Create a repo
      // -------
      this.createRepo = function(options, cb) {
        _request('POST', '/user/repos', options, cb);
      };

    };

    // Repository API
    // =======

    Github.Repository = function(options) {
      var repo = options.name;
      var user = options.user;

      var that = this;
      var repoPath = '/repos/' + user + '/' + repo;

      var currentTree = {
        'branch': null,
        'sha': null
      };

      // Perform a commit on the given head {sha, type, url}
      // The commit will fail if its not a fast forward commit
      // -------

      this.commitToHead = function (branch, path, content, message, cb) {
        that.createCommit(branch, path, content, message, function (err, commit) {
          if (err) {return cb(err);}
          that.updateCommit(commit, branch, cb);
        });
      };

      // Creates a commit on the head of a given branch
      // (used when you want to make a commit, show a diff to the user and afterwards, continue the commit)
      // ------

      this.createCommit = function (branch, path, content, message, cb) {
        that.getHead(branch, function (err, head) {
          if (err) {return cb(err);}
          _request('GET', head.url, null, function (err, response) {
            if (err) {return cb(err);}
            var SHA_BASE_TREE = response.tree.sha;

            that.postBlob(content, function (err, blobSha) {
              if (err) {return cb(err);}
              that.updateTree(SHA_BASE_TREE, path, blobSha, function (err, treeSha) {
                if (err) {return cb(err);}
                that.commit(head.sha, treeSha, message, function (err, commitSha) {
                  if (err) {return cb(err);}
                  // The blobSha is the sha of the committed file itself.
                  cb(null, {blobSha: blobSha, sha: commitSha, head: head});
                });
              });
            });
          });
        });
      };

      // Updates a given commit to head
      // ------

      this.updateCommit = function (commit, branch, cb) {
        that.updateHead(branch, commit.sha, function (err, newHead) {
          if (err) {return cb(err);}
          commit.head = newHead.object;
          cb(null, commit);
        });
      };

      // Delete a repo
      // --------

      this.deleteRepo = function(cb) {
        _request('DELETE', repoPath, options, cb);
      };

      // Uses the cache if branch has not been changed
      // -------

      function updateTree(branch, cb) {
        if (branch === currentTree.branch && currentTree.sha) {
          return cb(null, currentTree.sha);
        }
        
        that.getRef('heads/' + encodeURIComponent(branch), function(err, sha) {
          currentTree.branch = branch;
          currentTree.sha = sha;
          cb(err, sha);
        });
      }

      /**
       * Get a particular reference
       * @param {string} ref The ref to get (It may look like heads/name so don't urlEncode)
       * @param {function} cb The method to call on result
       */
      this.getRef = function(ref, cb) {
        _request('GET', repoPath + '/git/refs/' + ref, null, function(err, res) {
          if (err) {
            return cb(err);
          }

          if (res instanceof Array) {
            cb({error: 500});
          } else {
            cb(null, res.object.sha);
          }
        });
      };

      // Create a new reference
      // --------
      //
      // {
      //   "ref": "refs/heads/my-new-branch-name",
      //   "sha": "827efc6d56897b048c772eb4087f854f46256132"
      // }

      this.createRef = function(options, cb) {
        _request('POST', repoPath + '/git/refs', options, cb);
      };

      // Delete a reference
      // --------
      //
      // repo.deleteRef('heads/gh-pages')
      // repo.deleteRef('tags/v1.0')

      this.deleteRef = function(ref, cb) {
        _request('DELETE', repoPath + '/git/refs/' + encodeURIComponent(ref), options, cb);
      };

      // Create a repo
      // -------

      this.createRepo = function(options, cb) {
        _request('POST', '/user/repos', options, cb);
      };

      // Delete a repo
      // --------

      this.deleteRepo = function(cb) {
        _request('DELETE', repoPath, options, cb);
      };

      // List all tags of a repository
      // -------

      this.listTags = function(cb) {
        _request('GET', repoPath + '/tags', null, function(err, tags) {
          if (err) {
            return cb(err);
          }
          
          cb(null, tags);
        });
      };

      // List all pull requests of a respository
      // -------

      this.listPulls = function(state, cb) {
        _request('GET', repoPath + "/pulls" + (state ? '?state=' + state : ''), null, function(err, pulls) {
          if (err) return cb(err);
          cb(null, pulls);
        });
      };

      // Gets details for a specific pull request
      // -------

      this.getPull = function(number, cb) {
        _request("GET", repoPath + "/pulls/" + number, null, function(err, pull) {
          if (err) return cb(err);
          cb(null, pull);
        });
      };

      // Retrieve the changes made between base and head
      // -------

      this.compare = function(base, head, cb) {
        _request("GET", repoPath + "/compare/" + encodeURIComponent(base) + "..." + encodeURIComponent(head), null, function(err, diff) {
          if (err) return cb(err);
          cb(null, diff);
        });
      };

      // List all heads of a repository
      // -------

      this.getHeads = function(cb) {
        _request("GET", repoPath + "/git/refs/heads", null, function(err, heads) {
          if (err) return cb(err);
          cb(null, _.map(heads, function(head) { return _.last(head.ref.split('/')); }));
        });
      };

      // List all branches of a repository
      // -------

      this.getBranches = function (cb) {
        _request("GET", repoPath + "/branches", null, function(err, branches) {
          if (err) return cb(err);
          cb(null, branches.map(function(branch) { return branch.name;}));
        });
      };

      // Retrieve the contents of a blob
      // -------

      this.getBlob = function(sha, cb) {
        _request("GET", repoPath + "/git/blobs/" + sha, null, cb, 'raw');
      };

      // For a given file path, get the corresponding sha (blob for files, tree for dirs)
      // -------

      this.getCommit = function(sha, cb) {
        _request("GET", repoPath + "/git/commits/" + sha, null, function(err, commit) {
          if (err) return cb(err);
          cb(null, commit);
        });
      };

      // For a given file path, get the corresponding sha (blob for files, tree for dirs)
      // -------

      this.getSha = function(branch, path, cb) {
        if (!path || path === "") return that.getRef("heads/" + encodeURIComponent(branch), cb);
        _request("GET", repoPath + "/contents/" + encodeURI(path) + (branch ? "?ref=" + encodeURIComponent(branch) : ""), null, function(err, pathContent) {
          if (err) return cb(err);
          cb(null, pathContent.sha);
        });
      };

      // Retrieve the tree a commit points to
      // -------

      this.getTree = function(tree, cb) {
        _request("GET", repoPath + "/git/trees/" + encodeURIComponent(tree), null, function(err, res) {
          if (err) return cb(err);
          cb(null, res.tree);
        });
      };

      // Post a new blob object, getting a blob SHA back
      // -------

      this.postBlob = function(content, cb) {
        if (typeof(content) === "string") {
          content = {
            "content": content,
            "encoding": "utf-8"
          };
        } else {
          	content = {
              "content": b64encode(String.fromCharCode.apply(null, new Uint8Array(content))),
              "encoding": "base64"
            };
          }

        _request("POST", repoPath + "/git/blobs", content, function(err, res) {
          if (err) return cb(err);
          cb(null, res.sha);
        });
      };

      // Update an existing tree adding a new blob object getting a tree SHA back
      // -------

      this.updateTree = function(baseTree, path, blob, cb) {
        var data = {
          "base_tree": baseTree,
          "tree": [
            {
              "path": path,
              "mode": "100644",
              "type": "blob",
              "sha": blob
            }
          ]
        };
        _request("POST", repoPath + "/git/trees", data, function(err, res) {
          if (err) return cb(err);
          cb(null, res.sha);
        });
      };

      // Post a new tree object having a file path pointer replaced
      // with a new blob SHA getting a tree SHA back
      // -------

      this.postTree = function(tree, cb) {
        _request("POST", repoPath + "/git/trees", { "tree": tree }, function(err, res) {
          if (err) return cb(err);
          cb(null, res.sha);
        });
      };

      // Create a new commit object with the current commit SHA as the parent
      // and the new tree SHA, getting a commit SHA back
      // -------

      this.commit = function(parent, tree, message, cb) {
        var data = {
          "message": message,
          "parents": [
            parent
          ],
          "tree": tree
        };
        _request("POST", repoPath + "/git/commits", data, function(err, res) {
          if (err) return cb(err);
          currentTree.sha = res.sha; // update latest commit
          cb(null, res.sha);
        });
      };

      // Gets the head of the given branch {sha, type, url, branch}
      // -------

      this.getHead = function (branch, cb) {
        // Get a reference to HEAD of branch
        _request('GET', repoPath + '/git/refs/heads/' + encodeURIComponent(branch), null, function (err, response) {
          if (err) {return cb(err);}

          var final_response = null;
          if (response instanceof Array) {
            // The API may return an array with branches that start with the given string.
            for (var i = 0; i < response.length; i++) {
              if (response[i].ref == 'refs/heads/' + branch) {
                final_response = response[i];
                break;
              }
            }
          } else {
            final_response = response;
          }

          if (final_response) {
            cb(null, final_response.object);
          } else {
            cb({error: 404, message: "Branch not found"});
          }
        });
      };

      // Update the reference of your head to point to the new commit SHA
      // -------

      this.updateHead = function(head, commit, cb) {
        _request("PATCH", repoPath + "/git/refs/heads/" + encodeURIComponent(head), { "sha": commit }, cb);
      };

      // Show repository information
      // -------

      this.show = function(cb) {
        _request("GET", repoPath, null, cb);
      };

      // Show repository contributors
      // -------

      this.contributors = function (cb, retry) {
        retry = retry || 1000;
        var self = this;
        _request("GET", repoPath + "/stats/contributors", null, function (err, data, response) {
          if (err) return cb(err);
          if (response.status === 202) {
            setTimeout(
              function () {
                self.contributors(cb, retry);
              },
              retry
            );
          } else {
            cb(err, data);
          }
        });
      };

      // Get contents
      // --------

      this.contents = function(ref, path, cb) {
        path = encodeURI(path);
        _request("GET", repoPath + "/contents" + (path ? "/" + encodeURI(path) : ""), { ref: ref }, cb);
      };

      // Fork repository
      // -------

      this.fork = function(cb) {
        _request("POST", repoPath + "/forks", null, cb);
      };

      // Branch repository
      // --------

      this.branch = function(oldBranch,newBranch,cb) {
        if(arguments.length === 2 && typeof arguments[1] === "function") {
          cb = newBranch;
          newBranch = oldBranch;
          oldBranch = "master";
        }
        this.getRef("heads/" + encodeURIComponent(oldBranch), function(err,ref) {
          if(err && cb) return cb(err);
          that.createRef({
            ref: "refs/heads/" + newBranch, // don't URIencode here
            sha: ref
          },cb);
        });
      };

      // Create pull request
      // --------

      this.createPullRequest = function(options, cb) {
        _request("POST", repoPath + "/pulls", options, cb);
      };

      // List hooks
      // --------

      this.listHooks = function(cb) {
        _request("GET", repoPath + "/hooks", null, cb);
      };

      // Get a hook
      // --------

      this.getHook = function(id, cb) {
        _request("GET", repoPath + "/hooks/" + id, null, cb);
      };

      // Create a hook
      // --------

      this.createHook = function(options, cb) {
        _request("POST", repoPath + "/hooks", options, cb);
      };

      // Edit a hook
      // --------

      this.editHook = function(id, options, cb) {
        _request("PATCH", repoPath + "/hooks/" + id, options, cb);
      };

      // Delete a hook
      // --------

      this.deleteHook = function(id, cb) {
        _request("DELETE", repoPath + "/hooks/" + id, null, cb);
      };

      // Read file at given path
      // -------

      this.read = function(branch, path, cb) {
        _request("GET", repoPath + "/contents/" + encodeURI(path) + (branch ? "?ref=" + encodeURIComponent(branch) : ""), null, function(err, obj) {
          if (err && err.error === 404) return cb("not found", null, null);

          if (err) return cb(err);
          cb(null, obj);
        }, true);
      };

      // Create a file at given path
      // -------

      this.createFile = function(branch, path, content, message, cb) {
        _request("PUT", repoPath + "/contents/" + encodeURI(path), {
          content: b64encode(content),
          message: message,
          branch: branch
        }, function(err, result) {
          if (err) return cb(err);
          cb(null, result);
        });
      };

      // Get file at given path
      // -------

      this.getContents = function(branch, path, cb) {
        _request("GET", repoPath + "/contents/" + encodeURI(path) + (branch ? "?ref=" + encodeURIComponent(branch) : ""), null, function(err, obj) {
          if (err && err.error === 404) return cb("not found", null, null);

          if (err) return cb(err);
          cb(null, obj);
        });
      };


      // Remove a file
      // -------

      this.remove = function(branch, path, cb) {
        that.getSha(branch, path, function(err, sha) {
          if (err) return cb(err);
          _request("DELETE", repoPath + "/contents/" + encodeURI(path), {
            message: path + " is removed",
            sha: sha,
            branch: branch
          }, cb);
        });
      };

      // Delete a file from the tree
      // -------

      this.delete = function(branch, path, cb) {
        that.getSha(branch, path, function(err, sha) {
          if (!sha) return cb("not found", null);
          var delPath = repoPath + "/contents/" + encodeURI(path);
          var params = {
            "message": "Deleted " + path,
            "sha": sha
          };
          delPath += "?message=" + encodeURIComponent(params.message);
          delPath += "&sha=" + encodeURIComponent(params.sha);
          delPath += '&branch=' + encodeURIComponent(branch);
          _request("DELETE", delPath, null, cb);
        });
      };

      // Move a file to a new location
      // -------

      this.move = function(branch, path, newPath, cb) {
        updateTree(branch, function(err, latestCommit) {
          that.getTree(latestCommit+"?recursive=true", function(err, tree) {
            // Update Tree
            _.each(tree, function(ref) {
              if (ref.path === path) ref.path = newPath;
              if (ref.type === "tree") delete ref.sha;
            });

            that.postTree(tree, function(err, rootTree) {
              that.commit(latestCommit, rootTree, 'Deleted '+path , function(err, commit) {
                that.updateHead(branch, commit, function(err) {
                  cb(err);
                });
              });
            });
          });
        });
      };

      // Write file contents to a given branch and path
      // -------

      this.write = function(branch, path, content, message, cb) {
        that.getSha(branch, encodeURI(path), function(err, sha) {
          if (err && err.error !== 404) return cb(err);
          _request("PUT", repoPath + "/contents/" + encodeURI(path), {
            message: message,
            content: b64encode(content),
            branch: branch,
            sha: sha
          }, cb);
        });
      };

      // List commits on a repository. Takes an object of optional paramaters:
      // sha: SHA or branch to start listing commits from
      // path: Only commits containing this file path will be returned
      // since: ISO 8601 date - only commits after this date will be returned
      // until: ISO 8601 date - only commits before this date will be returned
      // -------

      this.getCommits = function(options, cb) {
          options = options || {};
          var url = repoPath + "/commits";
          var params = [];
          if (options.sha) {
              params.push("sha=" + encodeURIComponent(options.sha));
          }
          if (options.path) {
              params.push("path=" + encodeURIComponent(options.path));
          }
          if (options.since) {
              var since = options.since;
              if (since.constructor === Date) {
                  since = since.toISOString();
              }
              params.push("since=" + encodeURIComponent(since));
          }
          if (options.until) {
              var until = options.until;
              if (until.constructor === Date) {
                  until = until.toISOString();
              }
              params.push("until=" + encodeURIComponent(until));
          }
          if (options.page) {
              params.push("page=" + options.page);
          }
          if (options.perpage) {
              params.push("per_page=" + options.perpage);
          }
          if (params.length > 0) {
              url += "?" + params.join("&");
          }
          _request("GET", url, null, cb);
      };
    };

    // Gists API
    // =======

    Github.Gist = function(options) {
      var id = options.id;
      var gistPath = "/gists/"+id;

      // Read the gist
      // --------

      this.read = function(cb) {
        _request("GET", gistPath, null, function(err, gist) {
          cb(err, gist);
        });
      };

      // Create the gist
      // --------
      // {
      //  "description": "the description for this gist",
      //    "public": true,
      //    "files": {
      //      "file1.txt": {
      //        "content": "String file contents"
      //      }
      //    }
      // }

      this.create = function(options, cb){
        _request("POST","/gists", options, cb);
      };

      // Delete the gist
      // --------

      this.delete = function(cb) {
        _request("DELETE", gistPath, null, function(err,res) {
          cb(err,res);
        });
      };

      // Fork a gist
      // --------

      this.fork = function(cb) {
        _request("POST", gistPath+"/fork", null, function(err,res) {
          cb(err,res);
        });
      };

      // Update a gist with the new stuff
      // --------

      this.update = function(options, cb) {
        _request("PATCH", gistPath, options, function(err,res) {
          cb(err,res);
        });
      };

      // Star a gist
      // --------

      this.star = function(cb) {
        _request("PUT", gistPath+"/star", null, function(err,res) {
          cb(err,res);
        });
      };

      // Untar a gist
      // --------

      this.unstar = function(cb) {
        _request("DELETE", gistPath+"/star", null, function(err,res) {
          cb(err,res);
        });
      };

      // Check if a gist is starred
      // --------

      this.isStarred = function(cb) {
        _request("GET", gistPath+"/star", null, function(err,res) {
          cb(err,res);
        });
      };
    };

    // Issues API
    // ==========

    Github.Issue = function(options) {
      var path = "/repos/" + options.user + "/" + options.repo + "/issues";

      this.list = function(options, cb) {
        var query = [];
        for (var key in options) {
          if (options.hasOwnProperty(key)) {
            query.push(encodeURIComponent(key) + "=" + encodeURIComponent(options[key]));
          }
        }
        _requestAllPages(path + '?' + query.join("&"), cb);
      };
    };

    // Top Level API
    // -------

    this.getIssues = function(user, repo) {
      return new Github.Issue({user: user, repo: repo});
    };

    this.getRepo = function(user, repo) {
      return new Github.Repository({user: user, name: repo});
    };

    this.getUser = function() {
      return new Github.User();
    };

    this.getGist = function(id) {
      return new Github.Gist({id: id});
    };
  };

  /* istanbul ignore else  */
  if (typeof exports !== 'undefined') {
    module.exports = Github;
  } else {
    window.Github = Github;
  }
}).call(this);
