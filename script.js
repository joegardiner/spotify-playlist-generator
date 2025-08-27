const clientId = "45bf1f4394ac46a3bdbfca451050ef10";
const redirectUri = "https://joegardiner.github.io/spotify-playlist-generator/";
let accessToken = null;

// PKCE functions
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

// Initialize with disabled state
document.addEventListener('DOMContentLoaded', function() {
  setControlsEnabled(false);
  addConsoleMessage('Application initialized. Please login to Spotify to continue.', 'info');
});

// Login handler
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
  
  try {
    addConsoleMessage('Exchanging authorization code for access token...', 'info');
    
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
      updateLoginSuccess();
      localStorage.removeItem('code_verifier');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      throw new Error(data.error_description || 'Authentication failed');
    }
  } catch (error) {
    showError(`Login failed: ${error.message}`);
    addConsoleMessage(`Login error: ${error.message}`, 'error');
  }
}

// Artist search
document.getElementById("fetchBtn").onclick = async () => {
  if (!accessToken) {
    showError("Please login first");
    return;
  }
  
  // Get all artist inputs
  const artistInputs = [
    document.getElementById("artistInput"),
    ...document.querySelectorAll('.artist-input')
  ];
  
  const artistNames = artistInputs
    .map(input => input.value.trim())
    .filter(name => name.length > 0);
  
  if (artistNames.length === 0) {
    showError("Please enter at least one artist name");
    return;
  }
  
  // Get options
  const trackCount = parseInt(document.getElementById("trackCount").value);
  const sortMethod = document.getElementById("sortMethod").value;
  
  const fetchBtn = document.getElementById("fetchBtn");
  fetchBtn.disabled = true;
  fetchBtn.textContent = "Loading...";
  
  addConsoleMessage(`Starting search for ${artistNames.length} artist(s): ${artistNames.join(', ')}`, 'info');
  
  try {
    let allUris = [];
    
    for (const artistName of artistNames) {
      addConsoleMessage(`Searching for artist: ${artistName}`, 'info');
      // Search artist
      fetchBtn.textContent = `Processing ${artistName}`;
      
      let res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&type=artist&limit=5`, {
        headers: { Authorization: "Bearer " + accessToken }
      });
      
      if (!res.ok) throw new Error(`Search failed for ${artistName}: ${res.status}`);
      
      let data = await res.json();
      
      if (!data.artists.items.length) {
        addConsoleMessage(`Artist not found: ${artistName}`, 'error');
        continue;
      }
      
      // Find exact match first, then best match
      let artist = data.artists.items.find(a => 
        a.name.toLowerCase() === artistName.toLowerCase()
      ) || data.artists.items[0];
      
      addConsoleMessage(`Found artist: ${artist.name}`, 'success');
      
      let tracks = [];
      
      if (sortMethod === 'popularity') {
        // Use Spotify's top tracks endpoint
        res = await fetch(`https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=US`, {
          headers: { Authorization: "Bearer " + accessToken }
        });
        
        if (!res.ok) throw new Error(`Failed to fetch tracks for ${artist.name}: ${res.status}`);
        
        data = await res.json();
        tracks = data.tracks || [];
        
      } else if (sortMethod === 'plays') {
        // Get albums and search for tracks, then sort by popularity
        res = await fetch(`https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album,single&market=US&limit=20`, {
          headers: { Authorization: "Bearer " + accessToken }
        });
        
        if (!res.ok) throw new Error(`Failed to fetch albums for ${artist.name}: ${res.status}`);
        
        const albumData = await res.json();
        const albumIds = albumData.items.slice(0, 10).map(album => album.id); // Limit to prevent too many requests
        
        // Get tracks from albums
        for (const albumId of albumIds) {
          res = await fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?market=US`, {
            headers: { Authorization: "Bearer " + accessToken }
          });
          
          if (res.ok) {
            const trackData = await res.json();
            
            // Get full track details (including popularity) for each track
            const trackIds = trackData.items.slice(0, 10).map(track => track.id);
            if (trackIds.length > 0) {
              res = await fetch(`https://api.spotify.com/v1/tracks?ids=${trackIds.join(',')}`, {
                headers: { Authorization: "Bearer " + accessToken }
              });
              
              if (res.ok) {
                const fullTrackData = await res.json();
                tracks.push(...fullTrackData.tracks.filter(track => 
                  track.artists.some(trackArtist => trackArtist.id === artist.id)
                ));
              }
            }
          }
        }
        
        // Remove duplicates and sort by popularity
        const uniqueTracks = tracks.filter((track, index, self) => 
          index === self.findIndex(t => t.id === track.id)
        );
        
        tracks = uniqueTracks.sort((a, b) => b.popularity - a.popularity);
      }
      
      if (tracks.length > 0) {
        const uris = tracks.slice(0, trackCount).map(t => t.uri);
        allUris.push(`# ${artist.name}`, ...uris, '');
        console.log(`${artist.name} tracks:`, tracks.slice(0, trackCount).map(t => `${t.name} (popularity: ${t.popularity})`));
      }
    }
    
    if (allUris.length === 0) {
      document.getElementById("output").value = "No tracks found for any of the specified artists";
      showError("No tracks found for any of the specified artists");
    } else {
      document.getElementById("output").value = allUris.join("\n");
      addConsoleMessage(`Successfully generated playlist with ${allUris.filter(line => line.startsWith('spotify:')).length} tracks`, 'success');
    }
    
  } catch (error) {
    document.getElementById("output").value = "Error: " + error.message;
    showError(error.message);
    addConsoleMessage(`Fetch error: ${error.message}`, 'error');
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = "Get Top Tracks";
  }
};

// Copy button handler
document.getElementById("copyBtn").onclick = () => {
  const textarea = document.getElementById("output");
  const copyBtn = document.getElementById("copyBtn");
  
  if (!textarea.value.trim()) {
    return;
  }
  
  // Add immediate visual feedback
  copyBtn.style.transform = "scale(0.9)";
  
  // Remove readonly temporarily, select, copy, restore readonly
  textarea.removeAttribute('readonly');
  textarea.select();
  textarea.setSelectionRange(0, 99999);
  
  try {
    const success = document.execCommand('copy');
    copyBtn.textContent = success ? "Copied!" : "Failed";
    copyBtn.classList.add("copied");
    
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("copied");
      copyBtn.style.transform = ""; // Reset transform
    }, 1500);
  } catch (error) {
    copyBtn.textContent = "Failed";
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.style.transform = ""; // Reset transform
    }, 1500);
  }
  
  textarea.setAttribute('readonly', 'readonly');
  textarea.blur();
  
  // Reset scale after brief delay
  setTimeout(() => {
    copyBtn.style.transform = "";
  }, 150);
};

// Add multiple artist functionality
let artistCount = 1;

// Create + button and insert it after the first input
const addButton = document.createElement('button');
addButton.textContent = '+';
addButton.id = 'addArtistBtn';
addButton.type = 'button';
addButton.className = 'add-btn';

const firstInputGroup = document.querySelector('.input-group');
firstInputGroup.appendChild(addButton);

// Add artist input handler
document.getElementById('addArtistBtn').onclick = () => {
  artistCount++;
  
  const inputGroup = document.createElement('div');
  inputGroup.className = 'input-group artist-input-group';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = `Enter artist name ${artistCount}`;
  input.className = 'artist-input';
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('fetchBtn').click();
    }
  });
  
  const removeBtn = document.createElement('button');
  removeBtn.textContent = '×';
  removeBtn.type = 'button';
  removeBtn.className = 'remove-btn';
  
  removeBtn.onclick = () => {
    inputGroup.remove();
    artistCount--;
  };
  
  inputGroup.appendChild(input);
  inputGroup.appendChild(removeBtn);
  
  const buttonRow = document.querySelector('.button-row');
  buttonRow.parentNode.insertBefore(inputGroup, buttonRow);
  
  input.focus();
};

// Console drawer functionality
let consoleMessages = [];

function addConsoleMessage(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  consoleMessages.push({ message, type, timestamp });
  updateConsoleDisplay();
}

function updateConsoleDisplay() {
  const content = document.getElementById('consoleContent');
  content.innerHTML = consoleMessages.map(msg => 
    `<div class="console-message ${msg.type}">[${msg.timestamp}] ${msg.message}</div>`
  ).join('');
  content.scrollTop = content.scrollHeight;
}

// Toggle console drawer
document.getElementById('consoleHeader').onclick = () => {
  const drawer = document.getElementById('consoleDrawer');
  drawer.classList.toggle('expanded');
};

// Error message functionality
function showError(message) {
  const container = document.getElementById('errorContainer');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.innerHTML = `
    ${message}
    <button class="error-close" onclick="this.parentElement.remove(); checkErrorContainer();">×</button>
  `;
  container.appendChild(errorDiv);
  container.style.display = 'block';
  addConsoleMessage(`Error: ${message}`, 'error');
}

function checkErrorContainer() {
  const container = document.getElementById('errorContainer');
  if (container.children.length === 0) {
    container.style.display = 'none';
  }
}

// Enable/disable controls based on login status
function setControlsEnabled(enabled) {
  const controls = [
    'artistInput',
    'trackCount', 
    'sortMethod',
    'fetchBtn',
    'copyBtn',
    'addArtistBtn'
  ];
  
  controls.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = !enabled;
    }
  });
  
  // Update artist input placeholder
  const artistInput = document.getElementById('artistInput');
  if (enabled) {
    artistInput.placeholder = 'Enter artist name';
  } else {
    artistInput.placeholder = 'Login required...';
  }
  
  // Update dynamically added inputs
  document.querySelectorAll('.artist-input').forEach(input => {
    input.disabled = !enabled;
  });
}

// Update login button on success
function updateLoginSuccess() {
  const loginBtn = document.getElementById('loginBtn');
  const statusEl = document.getElementById('status');
  
  loginBtn.textContent = '✓ Logged in to Spotify';
  loginBtn.disabled = true;
  loginBtn.classList.add('login-btn-success');
  
  statusEl.innerHTML = '<strong>Successfully connected to Spotify</strong>';
  statusEl.classList.add('logged-in');
  
  setControlsEnabled(true);
  addConsoleMessage('Successfully logged in to Spotify', 'success');
}
