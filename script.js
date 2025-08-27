const clientId = "45bf1f4394ac46a3bdbfca451050ef10";
const redirectUri = window.location.origin + window.location.pathname;
let accessToken = null;

document.getElementById("loginBtn").onclick = () => {
  const authUrl = "https://accounts.spotify.com/authorize"
    + "?response_type=token"
    + "&client_id=" + encodeURIComponent(clientId)
    + "&redirect_uri=" + encodeURIComponent(redirectUri)
    + "&scope=" + encodeURIComponent("user-read-email");
  window.location = authUrl;
};

// extract token if redirected back
if (window.location.hash) {
  const hash = new URLSearchParams(window.location.hash.substring(1));
  accessToken = hash.get("access_token");
  if (accessToken) {
    document.getElementById("status").innerText = "Logged in";
    window.location.hash = "";
  }
}

document.getElementById("fetchBtn").onclick = async () => {
  if (!accessToken) {
    alert("Please login first");
    return;
  }
  const artistName = document.getElementById("artistInput").value;
  if (!artistName) return;

  // search artist
  let res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  let data = await res.json();
  let artistId = data.artists.items[0]?.id;
  if (!artistId) {
    document.getElementById("output").value = "Artist not found";
    return;
  }

  // get top tracks
  res = await fetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`, {
    headers: { Authorization: "Bearer " + accessToken }
  });
  data = await res.json();
  const uris = data.tracks.slice(0, 5).map(t => t.uri);
  document.getElementById("output").value = uris.join("\n");
};
