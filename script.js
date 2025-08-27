const clientId = "45bf1f4394ac46a3bdbfca451050ef10";
const redirectUri = window.location.origin + window.location.pathname;
let accessToken = null;
let userMarket = 'GB';
let consoleMessages = [];
let allTracks = [];

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
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    localStorage.setItem('code_verifier', codeVerifier);
    
    const authUrl = "https://accounts.spotify.com/authorize"
      + "?response_type=code"
      + "&client_id=" + encodeURIComponent(clientId)
      + "&redirect_uri=" + encodeURIComponent(redirectUri)
      + "&code_challenge_method=S256"
      + "&code_challenge=" + codeChallenge
      + "&scope=" + encodeURIComponent("user-read-email user-read-private");
    
    addConsoleMessage('Redirecting to Spotify authorization...', 'info');
    window.location = authUrl;
  } catch (error) {
    showError(`Login initialization failed: ${error.message}`);
  }
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

// Get user's market after successful login
async function getUserMarket() {
  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: "Bearer " + accessToken }
    });
    
    if (response.ok) {
      const userData = await response.json();
      userMarket = userData.country || 'GB';
      addConsoleMessage(`Detected user market: ${userMarket}`, 'info');
      return userMarket;
    }
  } catch (error) {
    addConsoleMessage(`Could not get user market, using GB as default: ${error.message}`, 'error');
  }
  return 'GB';
}

// Update login button on success
function updateLoginSuccess() {
  const loginBtn = document.getElementById('loginBtn');
  const statusEl = document.getElementById('status');
  
  loginBtn.textContent = '✓ Logged in to Spotify';
  loginBtn.disabled = true;
  loginBtn.classList.add('login-btn-success');
  statusEl.classList.add('logged-in');
  
  setControlsEnabled(true);
  addConsoleMessage('Successfully logged in to Spotify', 'success');
  
  // Get user's market
  getUserMarket();
}

function displayTrackSelection() {
  const section = document.getElementById('trackSelectionSection');
  const trackList = document.getElementById('trackList');
  
  if (allTracks.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  
  trackList.innerHTML = allTracks.map(artistGroup => `
    <div class="artist-group">
      <h4>${artistGroup.artistName}</h4>
      ${artistGroup.tracks.map(track => `
        <div class="track-item ${track.included ? '' : 'disabled'}">
          <input type="checkbox" class="track-checkbox" 
                 ${track.included ? 'checked' : ''} 
                 onchange="toggleTrack('${track.id}', this.checked)">
          <img src="${track.image}" alt="Album art" class="track-image" 
               onerror="this.style.display='none'">
          <div class="track-info">
            <div class="track-name">${track.name}</div>
            <div class="track-details">${track.album}</div>
          </div>
          <button class="preview-btn" ${track.preview_url ? '' : 'disabled'}
                  onclick="togglePreview('${track.id}', '${track.preview_url}')">
            Preview
          </button>
        </div>
      `).join('')}
    </div>
  `).join('');
  
  updateOutputFromSelection();
}

function toggleTrack(trackId, included) {
  allTracks.forEach(artistGroup => {
    const track = artistGroup.tracks.find(t => t.id === trackId);
    if (track) {
      track.included = included;
    }
  });
  updateOutputFromSelection();
}

let currentAudio = null;

function togglePreview(trackId, previewUrl) {
  if (!previewUrl) return;
  
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
    currentAudio = null;
    return;
  }
  
  currentAudio = new Audio(previewUrl);
  currentAudio.volume = 0.5;
  currentAudio.play().catch(e => console.log('Preview failed:', e));
}

function updateOutputFromSelection() {
  const uris = [];
  
  allTracks.forEach(artistGroup => {
    const includedTracks = artistGroup.tracks.filter(t => t.included);
    if (includedTracks.length > 0) {
      uris.push(`# ${artistGroup.artistName}`);
      includedTracks.forEach(track => {
        uris.push(`${track.uri}`);
      });
      uris.push('');
    }
  });
  
  document.getElementById("output").value = uris.join("\n");
}

// Add event listeners for select all/deselect all
document.getElementById('selectAllBtn').onclick = () => {
  allTracks.forEach(artistGroup => {
    artistGroup.tracks.forEach(track => track.included = true);
  });
  displayTrackSelection();
};

document.getElementById('deselectAllBtn').onclick = () => {
  allTracks.forEach(artistGroup => {
    artistGroup.tracks.forEach(track => track.included = false);
  });
  displayTrackSelection();
};

// Artist search
document.getElementById("fetchBtn").onclick = async () => {
  if (!accessToken) {
    showError("Please login first");
    return;
  }
  
  const artistNames = parseArtistNames();
  
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
  
  clearArtistStatus();
  addConsoleMessage(`Starting search for ${artistNames.length} artist(s) in market ${userMarket}: ${artistNames.join(', ')}`, 'info');
  
  try {
    let allUris = [];
    
    for (const artistName of artistNames) {
      updateArtistStatus(artistName, 'loading', 'Searching...');
      addConsoleMessage(`Searching for artist: ${artistName}`, 'info');
      
      try {
        // Search artist
        let res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&type=artist&limit=5`, {
          headers: { Authorization: "Bearer " + accessToken }
        });
        
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        
        let data = await res.json();
        
        if (!data.artists.items.length) {
          updateArtistStatus(artistName, 'error', 'Not found');
          addConsoleMessage(`Artist not found: ${artistName}`, 'error');
          continue;
        }
        
        let artist = data.artists.items.find(a => 
          a.name.toLowerCase() === artistName.toLowerCase()
        ) || data.artists.items[0];
        
        updateArtistStatus(artistName, 'loading', 'Getting tracks...');
        addConsoleMessage(`Found artist: ${artist.name}`, 'success');
        
        let tracks = [];
        
        if (sortMethod === 'popularity') {
          // Use Spotify's top tracks endpoint
          res = await fetch(`https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=${userMarket}`, {
            headers: { Authorization: "Bearer " + accessToken }
          });
          
          if (!res.ok) throw new Error(`Failed to fetch tracks: ${res.status}`);
          
          data = await res.json();
          tracks = data.tracks || [];
          
        } else if (sortMethod === 'plays') {
          // Get albums and search for tracks, then sort by popularity
          res = await fetch(`https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album,single&market=${userMarket}&limit=20`, {
            headers: { Authorization: "Bearer " + accessToken }
          });
          
          if (!res.ok) throw new Error(`Failed to fetch albums: ${res.status}`);
          
          const albumData = await res.json();
          const albumIds = albumData.items.slice(0, 10).map(album => album.id);
          
          for (const albumId of albumIds) {
            res = await fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?market=${userMarket}`, {
              headers: { Authorization: "Bearer " + accessToken }
            });
            
            if (res.ok) {
              const trackData = await res.json();
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
          
          const uniqueTracks = tracks.filter((track, index, self) => 
            index === self.findIndex(t => t.id === track.id)
          );
          
          tracks = uniqueTracks.sort((a, b) => b.popularity - a.popularity);
        }
        
        if (tracks.length > 0) {
          const trackData = tracks.slice(0, trackCount).map(t => ({
            uri: t.uri,
            name: t.name,
            artist: t.artists[0].name,
            album: t.album?.name || 'Unknown Album',
            image: t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || '',
            preview_url: t.preview_url,
            id: t.id,
            included: true
          }));
          
          allTracks.push({
            artistName: artist.name,
            tracks: trackData
          });
          
          updateArtistStatus(artistName, 'success', `${trackData.length} tracks found`);
          addConsoleMessage(`${artist.name}: Found ${trackData.length} tracks`, 'success');
        } else {
          updateArtistStatus(artistName, 'error', 'No tracks found');
          addConsoleMessage(`${artist.name}: No tracks found`, 'error');
        }
        
      } catch (artistError) {
        updateArtistStatus(artistName, 'error', artistError.message);
        addConsoleMessage(`Error processing ${artistName}: ${artistError.message}`, 'error');
      }
    }
    
    if (allTracks.length === 0) {
      document.getElementById("output").value = "No tracks found for any of the specified artists";
      showError("No tracks found for any of the specified artists");
    } else {
      displayTrackSelection();
      const totalTracks = allTracks.reduce((sum, group) => sum + group.tracks.length, 0);
      addConsoleMessage(`Successfully found ${totalTracks} tracks from ${allTracks.length} artists`, 'success');
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

// Artist status management
function updateArtistStatus(artistName, status, message = '') {
  const statusContainer = document.getElementById('artistStatus');
  statusContainer.classList.add('visible');
  
  let statusItem = document.querySelector(`[data-artist="${artistName}"]`);
  if (!statusItem) {
    statusItem = document.createElement('div');
    statusItem.className = 'artist-status-item';
    statusItem.setAttribute('data-artist', artistName);
    statusContainer.appendChild(statusItem);
  }
  
  const iconClass = status === 'success' ? 'success' : status === 'error' ? 'error' : 'loading';
  const icon = status === 'success' ? '✓' : status === 'error' ? '✗' : '⋯';
  
  statusItem.innerHTML = `
    <div class="status-icon ${iconClass}">${icon}</div>
    <div class="artist-name">${artistName} - </div>
    <div class="status-message">${message}</div>
  `;
}

function clearArtistStatus() {
  const statusContainer = document.getElementById('artistStatus');
  statusContainer.innerHTML = '';
  statusContainer.classList.remove('visible');
}

// Helper function to parse artist names
function parseArtistNames() {
  const inputMode = document.getElementById('inputMode').value;
  
  if (inputMode === 'bulk') {
    const text = document.getElementById('artistTextarea').value.trim();
    if (!text) return [];
    
    // Split by comma or newline, clean up each name
    return text
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(name => name.length > 0);
  } else {
    // Individual inputs
    const artistInputs = [
      document.getElementById("artistInput"),
      ...document.querySelectorAll('.artist-input')
    ];
    
    return artistInputs
      .map(input => input.value.trim())
      .filter(name => name.length > 0);
  }
}

// Copy button handler
document.getElementById("copyBtn").onclick = async () => {
  const textarea = document.getElementById("output");
  const copyBtn = document.getElementById("copyBtn");

  if (!textarea.value.trim()) {
    return;
  }

  copyBtn.style.transform = "scale(0.9)";

  try {
    await navigator.clipboard.writeText(textarea.value);
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("copied");
      copyBtn.style.transform = "";
    }, 1500);
  } catch (error) {
    copyBtn.textContent = "Failed";
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.style.transform = "";
    }, 1500);
  }

  textarea.blur();

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

// Add input mode toggle functionality
document.getElementById('inputMode').addEventListener('change', function() {
  const individualInputs = document.getElementById('individualInputs');
  const bulkInputs = document.getElementById('bulkInputs');
  
  if (this.value === 'bulk') {
    individualInputs.style.display = 'none';
    bulkInputs.style.display = 'block';
    document.getElementById('artistTextarea').placeholder = 'Enter artist names (comma or newline separated)';
  } else {
    individualInputs.style.display = 'block';
    bulkInputs.style.display = 'none';
  }
});

// Enable/disable controls based on login status
function setControlsEnabled(enabled) {
  const controls = [
    'artistInput',
    'artistTextarea',
    'trackCount', 
    'sortMethod',
    'market',
    'inputMode',
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
  
  const artistInput = document.getElementById('artistInput');
  const artistTextarea = document.getElementById('artistTextarea');
  
  if (enabled) {
    artistInput.placeholder = 'Enter artist name';
    artistTextarea.placeholder = 'Enter artist names (comma or newline separated)';
  } else {
    artistInput.placeholder = 'Login required';
    artistTextarea.placeholder = 'Login required';
  }
  
  document.querySelectorAll('.artist-input').forEach(input => {
    input.disabled = !enabled;
  });
}