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
