// Spotify OAuth Configuration
const CLIENT_ID = '67cad9d0d7434d5e9cec40bc12c5797d';
const REDIRECT_URI = 'https://fabiotavernini.github.io/jcard-template/';

// Spotify OAuth Endpoints
const AUTHORIZATION_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

// OAuth Scopes
const SCOPES = 'playlist-read-private playlist-read-collaborative';

// Token Management Utility
const TokenManager = {
    // Get token from localStorage
    getAccessToken() {
        return localStorage.getItem('spotify_access_token');
    },

    getRefreshToken() {
        return localStorage.getItem('spotify_refresh_token');
    },

    // Save tokens to localStorage
    saveTokens(accessToken, refreshToken, expiresIn) {
        localStorage.setItem('spotify_access_token', accessToken);
        localStorage.setItem('spotify_refresh_token', refreshToken);

        // Calculate and store token expiration time
        const expirationTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem('spotify_token_expiration', expirationTime.toString());
    },

    // Check if current token is expired
    isTokenExpired() {
        const expiration = localStorage.getItem('spotify_token_expiration');
        return !expiration || Date.now() > parseInt(expiration);
    },

    // Clear all tokens
    clearTokens() {
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expiration');
        localStorage.removeItem('spotify_code_verifier');
    }
};

// PKCE Code Verifier and Challenge Generation
async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(digest);
}

function base64URLEncode(buffer) {
    const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Initiate Spotify Authorization
async function initiateSpotifyLogin() {
    const codeVerifier = generateCodeVerifier(64);
    localStorage.setItem('spotify_code_verifier', codeVerifier);

    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });

    window.location.href = `${AUTHORIZATION_ENDPOINT}?${authParams.toString()}`;
}

// Exchange Authorization Code for Token
async function exchangeCodeForToken(authorizationCode) {
    const codeVerifier = localStorage.getItem('spotify_code_verifier');

    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.access_token) {
        TokenManager.saveTokens(
            tokenData.access_token,
            tokenData.refresh_token,
            tokenData.expires_in
        );
        return tokenData;
    } else {
        throw new Error('Failed to obtain access token');
    }
}

// Fetch Playlist data
async function fetchSpotifyPlaylists() {
    const accessToken = TokenManager.getAccessToken();

    if (!accessToken) {
        throw new Error('No access token available');
    }

    const playlistresponse = await fetch('https://api.spotify.com/v1/me/playlists', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    return await playlistresponse.json();
}

async function fetchSpotifyPlaylistTracks(id) {
    const accessToken = TokenManager.getAccessToken();

    if (!accessToken) {
        throw new Error('No access token available');
    }

    const playlistresponse = await fetch('https://api.spotify.com/v1/playlists/' + id, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    return await playlistresponse.json();
}


function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const authorizationCode = urlParams.get('code');

    if (authorizationCode) {
        exchangeCodeForToken(authorizationCode)
            .then(async (tokenData) => {

                // Clear authorization code from URL
                window.history.replaceState({}, document.title, window.location.pathname);

                // After handling the callback, check the login status again
                updateUIForLoginState();
            })
            .catch(error => {
                console.error('Login failed:', error);
            });
    }
}

// Event Listeners and Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('spotify-login-btn');
    const logoutButton = document.getElementById('spotify-logout-btn');

    // Check if the user is already logged in (from TokenManager)
    updateUIForLoginState();

    if (loginButton) {
        loginButton.addEventListener('click', initiateSpotifyLogin);
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            TokenManager.clearTokens();
            window.location.reload();
        });
    }
    // Check for OAuth callback on page load
    handleOAuthCallback();
});

function updateUIForLoginState() {
    const accessToken = TokenManager.getAccessToken();
    const loginButton = document.getElementById('spotify-login-btn');
    const logoutButton = document.getElementById('spotify-logout-btn');
    const playlistselectdiv = document.getElementById('playlistselectdiv');
    const playlistselect = document.getElementById('playlists');

    console.log(accessToken)

    // Check if the user is logged in (i.e., there's a valid access token)
    if (accessToken) {
        // Hide login button, show logout button and playlist dropdown
        loginButton.style.display = 'none';
        logoutButton.style.display = 'inline';
        playlistselectdiv.style.display = 'inline';

        // Fetch playlists only when the user is logged in
        fetchSpotifyPlaylists()
            .then(playlists => {

                const sortedPlaylists = playlists.items.sort((a, b) => a.name.localeCompare(b.name));

                // Populate dropdown with sorted playlists
                sortedPlaylists.forEach(playlist => {
                    const option = document.createElement('option');
                    option.text = playlist.name;
                    option.value = playlist.id;
                    playlistselect.appendChild(option);
                });
            })
            .catch(error => {
                console.error('Error fetching playlists:', error);
                // Optionally, show a message to the user here about the error
            });

    } else {
        // If no access token, show login button and hide other UI elements
        loginButton.style.display = 'inline';
        logoutButton.style.display = 'none';
        playlistselectdiv.style.display = 'none';
    }
}


async function HandlePlaylistSelect(val) {

    if (val != 0) {

        const playlisttracks = await fetchSpotifyPlaylistTracks(val);
        const middleIndex = Math.floor(playlisttracks.tracks.total / 2);

        const SideA = [];
        const SideB = [];

        for (let i = 0; i < playlisttracks.tracks.total; i++) {
            if (i < middleIndex) {
                SideA.push(playlisttracks.tracks.items[i]);
            } else {
                SideB.push(playlisttracks.tracks.items[i]);
            }
        }

        var SideAcontent = ""
        var SideBcontent = ""

        document.getElementById('input-side-a-contents').value = SideAcontent
        document.getElementById('input-side-b-contents').value = SideBcontent

        for (track of SideA) {
            SideAcontent += track.track.name + "\n"
        }

        for (track of SideB) {
            SideBcontent += track.track.name + "\n"
        }

        SideAcontent = SideAcontent.slice(0, -1);
        SideBcontent = SideBcontent.slice(0, -1);

        document.getElementById('input-side-a-contents').value = SideAcontent
        document.getElementById('input-side-b-contents').value = SideBcontent
        document.getElementById('input-side-a-contents').dispatchEvent(new Event('input'));
        document.getElementById('input-side-b-contents').dispatchEvent(new Event('input'));

        console.log(playlisttracks)
        document.getElementById('CoverImage').src = playlisttracks.images[0].url

    }

}
