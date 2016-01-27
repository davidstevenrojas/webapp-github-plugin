// Adding an event listener to show/hide the apiUrl input when the github enterprise checkbox is changed
var ghEnterpriseCheckbox = document.getElementById('use-github-enterprise');
ghEnterpriseCheckbox.addEventListener('change', function (e) {
  if (e.currentTarget.checked) {
    document.getElementById('gh-api-url').style.display = 'block';

    // show the Github Enterprise instructions
    document.getElementById('using-enterprise-msg').style.display = 'block';
    document.getElementById('no-enterprise-msg').style.display = 'none';
  } else {
    document.getElementById('gh-api-url').style.display = 'none';
    document.querySelector('#gh-api-url input').value = '';

    // show the github.com instructions
    document.getElementById('using-enterprise-msg').style.display = 'none';
    document.getElementById('no-enterprise-msg').style.display = 'block';
  }
});

var hostname = window.location.hostname;
if (hostname == 'localhost') {
  hostname = "YOUR-DOMAIN-NAME-HERE"
}

var webAuthorContext = window.location.protocol + "//" + '<span style="color:#D61564;text-decoration:underline">' + hostname + '</span>' +
  (window.location.port ? ':' + window.location.port : '');

var pathName = window.location.pathname;

var indexOfEnd = pathName.indexOf('/app/admin.html');
if (indexOfEnd === -1) {
  indexOfEnd = pathName.indexOf('/static/admin.html');
}
pathName = pathName.substring(0, indexOfEnd);
webAuthorContext += pathName;

var webAuthorContextSpans = document.getElementsByClassName('web-author-context');
for (var i = 0; i < webAuthorContextSpans.length; i++) {
  webAuthorContextSpans[i].innerHTML = webAuthorContext;
}
