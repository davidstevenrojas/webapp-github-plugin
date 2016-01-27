package com.oxygenxml.examples.github;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import ro.sync.ecss.extensions.api.webapp.plugin.PluginConfigExtension;

/**
 * Plugin extension used to handle the configuration of this plugin.
 * Setting the client_id and client_secret.
 * 
 * @author gabriel_titerlea
 */
public class GithubPluginConfigExtension extends PluginConfigExtension {

  /**
   * The name of the client id options property
   */
  private final String CLIENT_ID = "github.client_id";
  
  /**
   * The name of the client secret options property
   */
  private final String CLIENT_SECRET = "github.client_secret";
  
  /**
   * The name of the apiUrl option property.
   */
  private final String API_URL = "github.api_url";
  /**
   * The default value for the apiUrl.
   */
  private final String defaultApiUrl = null;
  
  @Override
  public void init() throws ServletException {
    // Calling super init to enable the automatic saving of options on disk.
    super.init();
 
    Map<String, String> defaultOptions = new HashMap<String, String>();
    
    // Set the initial values from GithubOauthServlet as default values.
    defaultOptions.put(CLIENT_ID, GitHubOauthServlet.clientId);  
    defaultOptions.put(CLIENT_SECRET, GitHubOauthServlet.clientSecret);
    // By default this plugin will connect to github.com.
    defaultOptions.put(API_URL, defaultApiUrl);
    
    // Setting the default options, otherwise the doDelete method won't do anything.
    setDefaultOptions(defaultOptions);
    
    String clientId = getOption(CLIENT_ID, GitHubOauthServlet.clientId);
    String clientSecret = getOption(CLIENT_SECRET, GitHubOauthServlet.clientSecret);
    String apiUrl = getOption(API_URL, defaultApiUrl);
    
    GitHubOauthServlet.clientId = clientId;
    GitHubOauthServlet.clientSecret = clientSecret;
    GitHubOauthServlet.apiUrl = apiUrl;
    
    try {
      saveOptions();
    } catch (IOException e) {}
  }
  
  @Override
  public String getPath() {
    return "github-config";
  }
  
  @Override
  public void doPut(HttpServletRequest req, HttpServletResponse resp)
      throws ServletException, IOException {
    super.doPut(req, resp);
    
    // Removing all access tokens to force all users to relogin
    GitHubPlugin.accessTokens.invalidateAll();
  }
  
  /**
   * Overriding to make sure the GithubOauthServlet properties are updated as well.
   */
  @Override
  public void doDelete(HttpServletRequest req, HttpServletResponse resp)
      throws ServletException, IOException {
    // Calling super doDelete to set the options and save them on disk
    super.doDelete(req, resp);
    
    GitHubOauthServlet.clientId = getDefaultOptions().get(CLIENT_ID);
    GitHubOauthServlet.clientSecret = getDefaultOptions().get(CLIENT_SECRET);
    GitHubOauthServlet.apiUrl = getDefaultOptions().get(API_URL);
    
    // The client_id and client_secret have changed so we need all the users to re-login.
    GitHubPlugin.accessTokens.invalidateAll();
  }
  
  /**
   * Overriding to make sure that the apiUrl, client_id and client_secret are updated in the GithubOauthServlet as well
   */
  @Override
  protected void setOption(String key, String value) {
    if ("".equals(value)) {
      value = null;
    }
    
    if (CLIENT_ID.equals(key)) {
      GitHubOauthServlet.clientId = value;
    }
    
    if (CLIENT_SECRET.equals(key)) {
      GitHubOauthServlet.clientSecret = value;
    }
    
    if (API_URL.equals(key)) {
      if (value!= null && value.endsWith("/")) {
        value = value.substring(0, value.length() - 1);
      }
      if ("https://api.github.com".equals(value)) {
        value = null;
      }
      GitHubOauthServlet.apiUrl = value;
    }
    
    super.setOption(key, value);
  }
  
  /**
   * @see ro.sync.ecss.extensions.api.webapp.plugin.PluginConfigExtension#getOptionsForm.
   * @return @return The options form representing an html form with associated javascript/css which handles the saving of the new options.
   */
  @Override
  public String getOptionsForm() {
    String clientId = GitHubOauthServlet.clientId;
    if (clientId == null) {
      clientId = "";
    }
    
    String clientSecret = GitHubOauthServlet.clientSecret;
    if (clientSecret == null) {
      clientSecret = "";
    }

    String apiUrl = GitHubOauthServlet.apiUrl;
    if (apiUrl == null) {
      apiUrl = "";
    }
    
    return "<div style='word-wrap: break-word;font-family: robotolight, Arial, Helvetica, sans-serif;font-size:0.9em;font-weight: lighter;'>"
            + "<label title='Check this only if you are using a Github Enterprise deployment'><input id='use-github-enterprise' type='checkbox'" + (apiUrl.isEmpty() ? "" : " class='using-enterprise' checked") + "/>Use GitHub Enterprise</label>"
              
            + "<form style='font-weight:bold;line-height:1.5em;margin-top:6px;'>"
              
              + "<div id='using-enterprise-msg' style='" + (apiUrl.isEmpty() ? "display:none;" : "display:block;") + "font-weight:normal;color:#333;background-color: lightyellow;border: 1px solid #dadab4;padding:0 5px 0 5px'>"
                + "<p style='margin:5px 0'>The GitHub Plugin uses OAuth 2.0 to gain access to your files.</p>"
                + "<p style='margin:5px 0'>To obtain the configuration parameters listed below go to your GitHub Enterprise deployment in settings > applications > developer applications (http://enterprise-deployment.com/settings/applications/new) and register a new application.</p>"
                + "<p style='margin:5px 0'><b>Note:</b> The <span style='font-family:monospace'>Authorization callback URL</span> must be set to:<br/><span style='font-family:monospace'><span class='web-author-context'>web-author-context</span>/plugins-dispatcher/github-oauth/callback</span>"
              + "</div>"
              
              + "<div id='no-enterprise-msg' style='" + (apiUrl.isEmpty() ? "display:block;" : "display:none;") + "font-weight:normal;color:#333;background-color: lightyellow;border: 1px solid #dadab4;padding:0 5px 0 5px'>"
                + "<p style='margin:5px 0'>The GitHub Plugin uses OAuth 2.0 to gain access to your files.</p>"
                + "<p style='margin:5px 0'>To obtain the configuration parameters listed below go to your GitHub developer applications page <a target='_blank' href='https://github.com/settings/applications/new'>(https://github.com/settings/applications/new)</a> and register a new application.</p>"
                + "<p style='margin:5px 0'><b>Note:</b> The <span style='font-family:monospace'>Authorization callback URL</span> must be set to:<br/><span style='font-family:monospace'><span class='web-author-context'>web-author-context</span>/plugins-dispatcher/github-oauth/callback</span>"
              + "</div>"
            
              + "<label title='Your GitHub Enterprise deployment URL' id='gh-api-url' style='margin-top:6px;margin-bottom:6px;display:block;overflow:hidden;" + (apiUrl.isEmpty() ? "display:none;'" : "' class='using-enterprise'") + ">"
                + "API URL: <span style='font-weight:normal;font-size:0.85em'>(http://enterprise-deployment.com)</span>"
                + "<input placeholder='Your GitHub Enterprise deployment URL' name='" + API_URL + "' type='text' style='color:#606060;background-color:#FAFAFA;-webkit-box-sizing: border-box;-moz-box-sizing: border-box;box-sizing: border-box;width:100%;border-radius:4px;border:1px solid #C8C1C1;padding:6px 4px' value='" + apiUrl +"'/>"
              + "</label>"
              
              + "<label style='margin-top:6px;display:block;overflow:hidden'>"
                + "Client ID: "
                + "<input placeholder='Client ID' name='" + CLIENT_ID + "' type='text' style='color:#606060;background-color:#FAFAFA;-webkit-box-sizing: border-box;-moz-box-sizing: border-box;box-sizing: border-box;width:100%;border-radius:4px;border:1px solid #C8C1C1;padding:6px 4px' value='" + clientId + "'/>"
              + "</label>"
              + "<label style='margin-top:6px;display:block;overflow:hidden'>"
                + "Client Secret:"
                + "<input placeholder='Client Secret' name='" + CLIENT_SECRET + "' type='text' style='color:#606060;background-color:#FAFAFA;-webkit-box-sizing: border-box;-moz-box-sizing: border-box;box-sizing: border-box;width:100%;border-radius:4px;border:1px solid #C8C1C1;padding:6px 4px' value='" + clientSecret +"'/>"
              + "</label>"
                
            + "</form>"
          + "</div>"
          
          // Adding some javascript to show/hide some elements depending on the value of the #use-github-enterprise checkbox
          + "<script src='../plugin-resources/github-static/github-config.js'></script>";
  }
  
  /**
   * @see ro.sync.ecss.extensions.api.webapp.plugin.PluginConfigExtension#getOptionsJson.
   * @return A JSON representation of the current options.
   */
  @Override
  public String getOptionsJson() {
    return "{" + 
      "\"" + API_URL + "\":\"" + (GitHubOauthServlet.apiUrl != null ? GitHubOauthServlet.apiUrl : "https://api.github.com") + "\"," + 
      "\"" + CLIENT_ID + "\":\"" + (GitHubOauthServlet.clientId != null ? GitHubOauthServlet.clientId : "") + "\"," + 
      "\"" + CLIENT_SECRET + "\":\"" + (GitHubOauthServlet.clientSecret != null ? GitHubOauthServlet.clientSecret : "") + "\""
    + "}";
  }
}
