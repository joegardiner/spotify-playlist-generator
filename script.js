const clientId = "45bf1f4394ac46a3bdbfca451050ef10";
const redirectUri = "https://joegardiner.github.io/spotify-playlist-generator/";
let accessToken = null;

// Generate code verifier and challenge for PKCE
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

document.getElementById("loginBtn").onclick = async () => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  localStorage.setItem('code_verifier', codeVerifier);
  
  const authUrl = "https://accounts.spotify.com/authorize"
    + "?response_type=code"
    + "&client_id=" + encodeURIComponent(clientId)
    + "&redirect_uri=" + encodeURIComponent(redirectUri)
    + "&code_challenge_method=S256"
    + "&code_challenge=" + codeChallenge
    + "&scope=" + encodeURIComponent("user-read-email");
  
  window.location = authUrl;
};

// Handle authorization code exchange
if (window.location.search) {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  
  if (code) {
    exchangeCodeForToken(code);
  }
}

async function exchangeCodeForToken(code) {
  const codeVerifier = localStorage.getItem('code_verifier');
  
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  const data = await response.json();
  
  if (data.access_token) {
    accessToken = data.access_token;
    document.getElementById("status").innerText = "Logged in";
    localStorage.removeItem('code_verifier');
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}
